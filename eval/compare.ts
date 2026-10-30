// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Eval del pipeline de propuesta de perfil y del plan de acompañamiento (spec 003).
//   npm run eval              → pruebas sin red + todos los casos de eval/cases con el modelo
//   npm run eval -- --offline → solo las pruebas sin red (sanitizeUpdate, applyApproval, las del
//                               alta de la spec 002, las del plan de la spec 003) y la validación
//                               de los casos de plan
//
// Sale con código 1 si algo crítico falla: una prueba sin red, un caso de plan inválido, la
// llamada o validación del modelo, banderas de términos no permitidos, una señal prohibida o, en
// el plan, una ficha que no está en el caso, evidencia fuera del índice o un patrón prohibido de
// C-13. Lo demás (dimensiones faltantes, citas descartadas) se reporta como advertencia.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { z } from "zod";
import { ALFABETO, formatearCodigo, generarCodigo, LONGITUD_CODIGO, normalizarCodigo, VIGENCIA_DIAS, venceEn } from "@/lib/invitations/code";
import { AVISO_VERSION } from "@/lib/legal/aviso";
import { indiceEvidencia, resolverEvidencia, type IndiceEvidencia } from "@/lib/plan/evidence";
import { vistaPersonaPlan } from "@/lib/plan/persona";
import {
  PlanProposal,
  TipoItemPlan,
  type BanderaPlan,
  type DescartadoPlan,
  type ItemPropuesto,
  type PayloadPlanIA,
} from "@/lib/plan/schema";
import { rastroPlan, type ItemRastro } from "@/lib/plan/trail";
import { banderasQueBloquean, sanitizePlan } from "@/lib/plan/validate";
import { applyApproval, validarIndices } from "@/lib/profile/merge";
import { Cedula, CorreoPrueba, Verificacion } from "@/lib/validators/alta";
import {
  DimensionId,
  DOMINIOS_FE,
  DominioFE,
  Perfil,
  ProfileUpdate,
  TipoHallazgo,
  TipoSenal,
  type CambioDimension,
  type DimensionPerfil,
} from "@/lib/profile/schema";
import { buscarTerminos, citaEnNota, normalizar, sanitizeUpdate } from "@/lib/profile/validate";
import {
  mensajeUsuarioPlan,
  mensajeUsuarioProfileUpdate,
  PROMPT_VERSION,
  PROMPT_VERSION_PLAN,
  soloVerificadas,
  systemPromptPlan,
  systemPromptProfileUpdate,
} from "@/lib/prompts";

// Carga ANTHROPIC_API_KEY y LLM_MODEL. lib/ai/model.ts lee LLM_MODEL al importarse, por eso
// ese módulo se importa más abajo con import() dinámico, después de esta línea.
config({ path: path.join(process.cwd(), ".env.local"), quiet: true });

const OFFLINE = process.argv.includes("--offline");

// ===========================================================================
// 1. Pruebas sin red
// ===========================================================================

const SESION_A = "00000000-0000-4000-8000-00000000000a";
const SESION_B = "00000000-0000-4000-8000-00000000000b";
const EVENTO_1 = "00000000-0000-4000-8000-000000000001";
const EVENTO_2 = "00000000-0000-4000-8000-000000000002";

// Arma un cambio de prueba con lo mínimo.
function cambio(dimension: DimensionId, resumen: string, citas: string[]): CambioDimension {
  return { dimension, resumen, tipo: "contexto", dominiosFE: [], evidencia: citas.map((cita) => ({ cita })) };
}

function updateVacio(): ProfileUpdate {
  return { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] };
}

// ----- Datos de prueba del plan (spec 003). Todo sintético. -----

const SESION_P = "00000000-0000-4000-8000-0000000000d1";
const EVENTO_P = "00000000-0000-4000-8000-0000000000d2";

function dimPrueba(resumen: string, citas: string[]): DimensionPerfil {
  return {
    resumen,
    tipo: "contexto",
    dominiosFE: [],
    evidencia: citas.map((cita) => ({ cita, sessionId: SESION_P })),
    actualizadoEn: "2026-10-15T10:00:00.000Z",
    eventoId: EVENTO_P,
  };
}

// Las dimensiones van a propósito fuera del orden de DIMENSIONES: el índice debe seguir DIMENSIONES.
// Orden esperado: estilo_comunicacion (E-01, E-02), retroalimentacion (E-03), ajustes_razonables (E-04).
const PERFIL_PLAN: Perfil = {
  dimensiones: {
    retroalimentacion: dimPrueba("Prefiere la retroalimentación por escrito.", ["prefiere la retroalimentación por escrito"]),
    estilo_comunicacion: dimPrueba("Piensa antes de opinar y escribe sus ideas.", [
      "en reuniones grandes casi no habla",
      "manda sus ideas por escrito después",
    ]),
    ajustes_razonables: dimPrueba("Pide la sala pequeña dos días.", ["pregunta si puede trabajar en la sala pequeña"]),
  },
  senalesActivas: [
    {
      tipo: "cambio_de_vida",
      descripcion: "Señal de prueba: se cambió de casa hace poco.",
      evidencia: [{ cita: "se mudó a otra colonia hace un mes", sessionId: SESION_P }],
      detectadaEn: "2026-10-15T10:00:00.000Z",
      eventoId: EVENTO_P,
    },
  ],
};
const INDICE_PLAN = indiceEvidencia(PERFIL_PLAN);

function itemPlan(
  tipo: TipoItemPlan,
  descripcion: string,
  textoPersona: string | null,
  evidencia: string[],
  extra: Partial<Pick<ItemPropuesto, "fichaId" | "dominioFE">> = {},
): ItemPropuesto {
  return {
    tipo,
    descripcion,
    textoPersona,
    dominioFE: extra.dominioFE ?? null,
    fichaId: extra.fichaId ?? null,
    evidencia: evidencia.map((evidenciaId) => ({ evidenciaId })),
  };
}

const sanitizar = (items: ItemPropuesto[], fichasEnviadas: string[] = []) =>
  sanitizePlan({ items }, { fichasEnviadas, indice: INDICE_PLAN });

const motivos = (banderas: BanderaPlan[]) => banderas.map((b) => `${b.ruta} ${b.campo} ${b.motivo} ${b.termino}`).sort();

// Fichas del seed (scripts/seed.sql): las tres con verificada = false.
const FICHAS_SEED = [
  { id: "KC-001", titulo: "Dividir una tarea larga en pasos visibles", tipo: "estrategia_fe", dominioFe: null, contenido: "Ejemplo.", verificada: false },
  { id: "KC-002", titulo: "Instrucciones por escrito además de verbales", tipo: "ajuste_razonable", dominioFe: null, contenido: "Ejemplo.", verificada: false },
  { id: "KC-003", titulo: "Cambios frecuentes de prioridad", tipo: "senal", dominioFe: null, contenido: "Ejemplo.", verificada: false },
];

// UUIDs fijos para la vista de la persona y el rastro.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const PRUEBAS: { nombre: string; correr: () => void }[] = [
  {
    nombre: "sanitizeUpdate acepta citas con otras mayúsculas, acentos, comillas y espacios",
    correr: () => {
      const nota = "Daniela dijo: “Prefiero que me lo manden por correo”.  Usa audífonos   en la tarde.";
      const update = updateVacio();
      update.cambios.push(
        cambio("retroalimentacion", "Daniela prefiere recibir acuerdos por correo.", [
          '"prefiero que me lo manden por correo."',
          "usa AUDIFONOS en la tarde",
        ]),
      );
      const r = sanitizeUpdate(update, nota);
      assert.equal(r.descartados.length, 0);
      assert.equal(r.update.cambios.length, 1);
      assert.equal(r.update.cambios[0].evidencia.length, 2);
    },
  },
  {
    nombre: "sanitizeUpdate quita citas inventadas y elementos sin evidencia",
    correr: () => {
      const nota = "Llegó puntual. Le cuesta arrancar los proyectos largos sin pasos definidos.";
      const update = updateVacio();
      update.cambios.push(
        cambio("concentracion", "Daniela llega puntual.", ["Llegó puntual", "siempre se distrae"]),
        cambio("conflictos", "Daniela evita los conflictos.", ["evita discutir con su equipo"]),
      );
      update.senales.push({
        tipo: "intencion_de_renunciar",
        descripcion: "Dice que quiere renunciar.",
        evidencia: [{ cita: "quiere renunciar pronto" }],
      });
      const r = sanitizeUpdate(update, nota);
      assert.equal(r.update.cambios.length, 1, "solo queda el cambio con una cita real");
      assert.equal(r.update.cambios[0].evidencia.length, 1);
      assert.equal(r.update.senales.length, 0, "la señal sin evidencia real se quita");
      assert.deepEqual(
        r.descartados.map((d) => d.ruta),
        ["cambios[0].evidencia[1]", "cambios[1].evidencia[0]", "senales[0].evidencia[0]"],
      );
      assert.ok(ProfileUpdate.safeParse(r.update).success, "el resultado sigue cumpliendo el esquema");
    },
  },
  {
    nombre: "sanitizeUpdate rechaza citas de menos de 8 caracteres o cortadas a mitad de palabra",
    correr: () => {
      const nota = "Le gusta trabajar con hojas de cálculo. Prefiere la mañana para tareas largas.";
      const update = updateVacio();
      update.cambios.push(
        cambio("motivacion_intereses", "Daniela disfruta trabajar con hojas de cálculo.", [
          "gus", // muy corta
          "usta trabajar", // empieza a mitad de "gusta"
          "hojas de calc", // termina a mitad de "cálculo"
          "Hojas de cálculo", // completa: se queda
        ]),
      );
      update.senales.push({
        tipo: "estres_desregulacion",
        descripcion: "Prueba.",
        evidencia: [{ cita: "la mañ" }], // menos de 8 caracteres
      });
      const r = sanitizeUpdate(update, nota);
      assert.equal(r.update.cambios.length, 1);
      assert.deepEqual(
        r.update.cambios[0].evidencia.map((e) => e.cita),
        ["Hojas de cálculo"],
      );
      assert.equal(r.update.senales.length, 0);
      assert.deepEqual(
        r.descartados.map((d) => `${d.ruta} ${d.motivo}`),
        [
          "cambios[0].evidencia[0] cita_no_encontrada",
          "cambios[0].evidencia[1] cita_no_encontrada",
          "cambios[0].evidencia[2] cita_no_encontrada",
          "senales[0].evidencia[0] cita_no_encontrada",
        ],
      );
    },
  },
  {
    nombre: "sanitizeUpdate deja un solo cambio por dimensión y validarIndices rechaza dos para la misma",
    correr: () => {
      const nota = "Pide instrucciones por escrito. Le ayuda tener ejemplos antes de empezar.";
      const update = updateVacio();
      update.cambios.push(
        cambio("forma_aprender", "Primero, sin cita real.", ["aprende viendo videos"]),
        cambio("forma_aprender", "Segundo: pide instrucciones por escrito.", ["Pide instrucciones por escrito"]),
        cambio("forma_aprender", "Tercero: le ayudan ejemplos.", ["tener ejemplos antes de empezar"]),
        cambio("retroalimentacion", "Otra dimensión.", ["Pide instrucciones por escrito"]),
      );
      const r = sanitizeUpdate(update, nota);
      // El primero se queda sin evidencia; el segundo es el primero válido; el tercero se descarta.
      assert.deepEqual(
        r.update.cambios.map((c) => c.resumen),
        ["Segundo: pide instrucciones por escrito.", "Otra dimensión."],
      );
      assert.deepEqual(r.descartados, [
        { ruta: "cambios[0].evidencia[0]", cita: "aprende viendo videos", motivo: "cita_no_encontrada" },
        { ruta: "cambios[2]", cita: "", motivo: "dimension_duplicada" },
      ]);

      // Una propuesta guardada con dos cambios para la misma dimensión no se puede aprobar completa.
      assert.throws(() => validarIndices(update, { cambios: [1, 2], senales: [] }));
      // El mismo índice repetido sí se permite (Set lo quita).
      assert.doesNotThrow(() => validarIndices(update, { cambios: [1, 1, 3], senales: [] }));
    },
  },
  {
    nombre: "sanitizeUpdate marca términos no permitidos sin falsos positivos obvios",
    correr: () => {
      const nota = "Tiene buen nivel de inglés. Prefiere instrucciones por escrito.";
      const update = updateVacio();
      update.cambios.push(
        cambio("antecedentes_experiencia", "Daniela tiene buen nivel de inglés.", ["Tiene buen nivel de inglés"]),
        cambio("forma_aprender", "Requiere nivel de apoyo alto por su debilidad al leer.", [
          "Prefiere instrucciones por escrito",
        ]),
      );
      update.preguntasParaSiguienteSesion.push("¿Tienes un diagnóstico de TEA?", "¿Qué te ayuda a concentrarte?");
      const r = sanitizeUpdate(update, nota);
      const encontrados = r.banderas.map((b) => `${b.ruta} → ${b.termino}`).sort();
      assert.deepEqual(encontrados, [
        "cambios[1].resumen → debilidad",
        "cambios[1].resumen → nivel o grado de autismo/apoyo/severidad/funcionamiento",
        "preguntasParaSiguienteSesion[0] → TEA",
        "preguntasParaSiguienteSesion[0] → diagnóstico",
      ]);
    },
  },
  {
    nombre: "applyApproval reemplaza resumen, suma evidencia sin duplicados (máx. 10) y agrega señales",
    correr: () => {
      // Perfil previo: 9 citas de la sesión A en "retroalimentacion".
      const previo: Perfil = {
        dimensiones: {
          retroalimentacion: {
            resumen: "Resumen anterior.",
            tipo: "contexto",
            dominiosFE: [],
            evidencia: Array.from({ length: 9 }, (_, i) => ({ cita: `cita número ${i + 1}`, sessionId: SESION_A })),
            actualizadoEn: "2026-10-01T10:00:00.000Z",
            eventoId: EVENTO_1,
          },
        },
        senalesActivas: [],
      };
      const update = updateVacio();
      update.cambios.push(
        { ...cambio("retroalimentacion", "Resumen nuevo.", ["cita número 10", "cita número 11"]), tipo: "fortaleza" },
        cambio("conflictos", "No aprobado.", ["cita número x"]),
      );
      update.senales.push({ tipo: "cambio_de_vida", descripcion: "Se mudó hace un mes.", evidencia: [{ cita: "se mudó de ciudad" }] });

      const ctx = { sessionId: SESION_B, eventId: EVENTO_2, now: new Date("2026-10-29T12:00:00.000Z") };
      const nuevo = applyApproval(previo, update, { cambios: [0], senales: [0] }, ctx);
      const dim = nuevo.dimensiones.retroalimentacion!;
      assert.equal(dim.resumen, "Resumen nuevo.");
      assert.equal(dim.tipo, "fortaleza");
      assert.equal(dim.eventoId, EVENTO_2);
      assert.equal(dim.evidencia.length, 10, "máximo 10 citas");
      assert.equal(dim.evidencia[0].cita, "cita número 2", "se quita la más antigua");
      assert.equal(dim.evidencia[9].cita, "cita número 11");
      assert.equal(nuevo.dimensiones.conflictos, undefined, "lo no aprobado no entra");
      assert.equal(nuevo.senalesActivas.length, 1);
      assert.equal(previo.dimensiones.retroalimentacion!.resumen, "Resumen anterior.", "no modifica el previo");

      // Aprobar otra vez lo mismo no duplica citas.
      const otraVez = applyApproval(nuevo, update, { cambios: [0], senales: [] }, ctx);
      assert.deepEqual(otraVez.dimensiones.retroalimentacion!.evidencia, dim.evidencia);

      // Índice fuera de rango → error.
      assert.throws(() => applyApproval(previo, update, { cambios: [5], senales: [] }, ctx));
      assert.throws(() => applyApproval(previo, update, { cambios: [], senales: [1] }, ctx));
    },
  },

  // ----- Spec 002: alta y consentimiento (tarea 17) -----
  {
    nombre: "002 · generarCodigo: 8 caracteres del alfabeto, sin 0 O 1 I L, 200 muestras distintas (R-002.14)",
    correr: () => {
      assert.equal(LONGITUD_CODIGO, 8);
      assert.doesNotMatch(ALFABETO, /[0O1IL]/, "el alfabeto tiene caracteres que se confunden");
      const muestras = Array.from({ length: 200 }, () => generarCodigo());
      for (const c of muestras) {
        assert.equal(c.length, 8, `longitud de ${c.length}`);
        assert.ok([...c].every((ch) => ALFABETO.includes(ch)), "un carácter fuera del alfabeto");
        assert.doesNotMatch(c, /[0O1IL]/);
      }
      assert.equal(new Set(muestras).size, 200, "hay códigos repetidos en 200 muestras");
      // Vence a los 7 días (R-002.14).
      assert.equal(VIGENCIA_DIAS, 7);
      const desde = new Date("2026-10-29T12:00:00.000Z");
      assert.equal(venceEn(desde).toISOString(), "2026-11-05T12:00:00.000Z");
    },
  },
  {
    nombre: "002 · formatearCodigo y normalizarCodigo: ida y vuelta, con minúsculas, guiones y espacios",
    correr: () => {
      for (let i = 0; i < 50; i++) {
        const c = generarCodigo();
        const mostrado = formatearCodigo(c);
        assert.match(mostrado, /^.{4}-.{4}$/);
        assert.equal(normalizarCodigo(mostrado), c);
        assert.equal(normalizarCodigo(mostrado.toLowerCase()), c);
      }
      assert.equal(formatearCodigo("K7MP3QXR"), "K7MP-3QXR");
      assert.equal(normalizarCodigo(" k7mp - 3qxr "), "K7MP3QXR");
      assert.equal(normalizarCodigo("k7-mp-3q-xr"), "K7MP3QXR");
    },
  },
  {
    nombre: "002 · CorreoPrueba acepta .test y rechaza otros dominios (R-002.3)",
    correr: () => {
      assert.equal(CorreoPrueba.parse("persona-nueva@caja-mex.test"), "persona-nueva@caja-mex.test");
      assert.equal(CorreoPrueba.parse("  Persona@Caja-Mex.TEST "), "persona@caja-mex.test");
      const mensaje = "En este prototipo solo se aceptan correos que terminan en .test.";
      for (const malo of ["persona@gmail.com", "persona@caja-mex.test.com", "persona.test", ""]) {
        const r = CorreoPrueba.safeParse(malo);
        assert.equal(r.success, false, `aceptó "${malo}"`);
        assert.equal(r.error?.issues[0]?.message, mensaje);
      }
    },
  },
  {
    nombre: "002 · Cedula acepta solo dígitos y Verificacion pide las dos casillas (R-002.7)",
    correr: () => {
      assert.equal(Cedula.parse("1234567"), "1234567");
      assert.equal(Cedula.parse("  1234567 "), "1234567", "quita los espacios al inicio y al final");
      const mensaje = "Escribe la cédula profesional. Solo números.";
      for (const mala of ["12A4567", "ABCDEFG", "123 4567", "1234567-8", ""]) {
        const r = Cedula.safeParse(mala);
        assert.equal(r.success, false, `aceptó "${mala}"`);
        assert.equal(r.error?.issues[0]?.message, mensaje);
      }
      assert.ok(Verificacion.safeParse({ revisoDocumento: true, consultoSep: true, cedula: "1234567" }).success);
      const sinCasilla = Verificacion.safeParse({ revisoDocumento: true, consultoSep: false, cedula: "1234567" });
      assert.equal(sinCasilla.success, false);
      assert.equal(sinCasilla.error?.issues[0]?.message, "Marca las dos casillas para guardar la verificación.");
    },
  },
  {
    // Regresión del 29 oct: Drizzle arma el INSERT con todas las columnas (DEFAULT en las que no
    // se pasan) y Postgres rechaza las que no tienen permiso. Estas tablas se insertan con
    // lib/db/insertar.ts, que lista solo las columnas permitidas.
    nombre: "002 · nadie usa tx.insert sobre tablas con permisos por columna (users, engagements, consentEvents, invitations)",
    correr: () => {
      const prohibido = /\.insert\(\s*(users|engagements|consentEvents|invitations)\s*\)/;
      const revisar = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const ruta = path.join(dir, e.name);
          if (e.isDirectory()) return revisar(ruta);
          if (!/\.(ts|tsx)$/.test(e.name)) return [];
          return prohibido.test(readFileSync(ruta, "utf8")) ? [ruta] : [];
        });
      const encontrados = ["app", "lib", "components"].flatMap((d) => revisar(path.join(process.cwd(), d)));
      assert.deepEqual(encontrados, [], `usar lib/db/insertar.ts en: ${encontrados.join(", ")}`);
    },
  },
  {
    nombre: "002 · el aviso tiene la marca de borrador y las secciones de R-002.20, R-002.42 y R-002.49 (CA-002.35, CA-002.43)",
    correr: () => {
      const relativo = path.join("legal", `${AVISO_VERSION}_aviso-privacidad.md`);
      const archivo = path.join(process.cwd(), relativo);
      assert.ok(
        existsSync(archivo),
        `No existe ${relativo}. Lo crea la tarea 1 de la spec 002 con el texto de "Texto del aviso"; esta prueba no puede pasar sin él.`,
      );
      // Sin el comentario de atribución, como lo muestra lib/legal/aviso.ts.
      const texto = readFileSync(archivo, "utf8").replace(/^<!--[\s\S]*?-->\s*/, "");
      const primeraLinea = texto.split(/\r?\n/).find((l) => l.trim()) ?? "";
      assert.match(primeraLinea, /^Borrador sin revisión legal\./, `la primera línea visible es "${primeraLinea}"`);
      assert.ok(primeraLinea.includes(`Versión ${AVISO_VERSION}`), "la primera línea no dice la versión de AVISO_VERSION");

      // Secciones "## Título" → contenido.
      const secciones = new Map<string, string>();
      for (const bloque of texto.split(/^## /m).slice(1)) {
        const [titulo, ...resto] = bloque.split(/\r?\n/);
        secciones.set(titulo.trim(), resto.join("\n"));
      }
      const seccion = (titulo: string) => {
        const s = secciones.get(titulo);
        assert.ok(s !== undefined, `falta la sección "${titulo}" (hay: ${[...secciones.keys()].join(" | ")})`);
        return s;
      };

      // R-002.20
      assert.match(seccion("Qué datos guardamos"), /no se sube, no se copia y no se guarda/);
      seccion("Para qué los usamos");
      assert.match(seccion("Quién los ve"), /Nunca recibe tu diagnóstico/);
      assert.match(seccion("Tu consentimiento"), /retirarlo cuando quieras/);
      // R-002.42 (CA-002.35)
      const ia = seccion("Inteligencia artificial");
      assert.match(ia, /Anthropic/);
      assert.match(ia, /en cada etapa/, "no dice qué llega al modelo por etapa");
      assert.match(ia, /Evaluación inicial:/);
      seccion("Cuando termina tu acompañamiento");
      assert.match(seccion("Si necesitas más apoyo"), /fuera del sistema/);
      // R-002.49 (CA-002.43)
      const retencion = seccion("Cuánto tiempo guardamos tus datos");
      assert.match(retencion, /6 meses/, "no menciona los 6 meses después del retiro");
      assert.match(retencion, /retiras tu consentimiento/);
      assert.match(retencion, /pedir\w*[^.]*borr\w*[^.]*antes/i, "no dice que se puede pedir el borrado antes");

      // CA-002.29: sin términos no permitidos.
      assert.doesNotMatch(texto, /paciente|debilidad|déficit|business profile/i);
    },
  },

  // ----- Spec 003: plan de acompañamiento (tarea 9) -----
  {
    nombre: "003 · el prompt de perfil no cambió al generalizar lib/prompts.ts (tarea 10)",
    correr: () => {
      // Hashes tomados con la versión de lib/prompts.ts anterior a la spec 003. Si el prompt de
      // perfil cambia a propósito, va en un archivo con fecha nueva y aquí se anota el hash nuevo.
      const hash = (s: string) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex");
      assert.equal(PROMPT_VERSION, "2026-10-29_profile-update");
      assert.equal(hash(systemPromptProfileUpdate()), "5003e2c50dac28f5a26d953eb7e5371c827ff0bb3884a85c0a691c738a1bca24");
      const mensaje = mensajeUsuarioProfileUpdate({
        nota: "Nota de prueba. Prefiere instrucciones por escrito.",
        nombrePila: "Daniela",
        engagementType: "workplace_support",
        perfilPrevio: {
          dimensiones: {
            retroalimentacion: {
              resumen: "Resumen.",
              tipo: "contexto",
              dominiosFE: [],
              evidencia: [{ cita: "prefiere instrucciones por escrito", sessionId: SESION_A }],
              actualizadoEn: "2026-10-01T10:00:00.000Z",
              eventoId: EVENTO_1,
            },
          },
          senalesActivas: [],
        },
      });
      assert.equal(hash(mensaje), "eadeb89eebb7ea5d6260dc2ec499f9480c3ee5ae91e21d185566f6e8b440f625");
    },
  },
  {
    nombre: "003 · el archivo del prompt del plan existe, tiene <!-- PROMPT --> y su nombre es PROMPT_VERSION_PLAN (CA-003.29)",
    correr: () => {
      assert.match(PROMPT_VERSION_PLAN, /^\d{4}-\d{2}-\d{2}_[a-z0-9-]+$/);
      const archivo = path.join(process.cwd(), "prompts", `${PROMPT_VERSION_PLAN}.md`);
      assert.ok(existsSync(archivo), `no existe prompts/${PROMPT_VERSION_PLAN}.md`);
      assert.match(readFileSync(archivo, "utf8"), /^<!-- PROMPT -->[ \t]*$/m);
    },
  },
  {
    nombre: "003 · indiceEvidencia numera E-01, E-02... en orden de DIMENSIONES y sin las señales (R-003.4, R-003.14)",
    correr: () => {
      assert.deepEqual(
        INDICE_PLAN.lista.map((e) => `${e.id} ${e.dimension}`),
        ["E-01 estilo_comunicacion", "E-02 estilo_comunicacion", "E-03 retroalimentacion", "E-04 ajustes_razonables"],
      );
      assert.equal(INDICE_PLAN.porId.get("E-02")?.cita, "manda sus ideas por escrito después");
      assert.ok(!INDICE_PLAN.lista.some((e) => e.cita.includes("se mudó")), "una cita de señal entró al índice");
    },
  },
  {
    nombre: "003 · systemPromptPlan sin las fichas del seed (verificada = false) y con la ficha verificada completa (CA-003.4)",
    correr: () => {
      const soloSeed = systemPromptPlan(FICHAS_SEED);
      assert.doesNotMatch(soloSeed, /KC-00\d/, "una ficha sin verificar llegó al prompt");
      assert.match(soloSeed, /No hay fichas verificadas/);
      const verificada = {
        id: "KC-T01",
        titulo: "Entregables por semana",
        tipo: "estrategia_fe",
        dominioFe: "planeacion_organizacion",
        contenido: "Dividir un proyecto largo en entregables semanales.",
        verificada: true,
      };
      const conFicha = systemPromptPlan([...FICHAS_SEED, verificada]);
      assert.doesNotMatch(conFicha, /KC-00\d/);
      for (const parte of [verificada.id, verificada.titulo, verificada.tipo, "planeacion_organizacion", verificada.contenido]) {
        assert.ok(conFicha.includes(parte), `falta "${parte}" en el prompt`);
      }
      assert.ok(!conFicha.includes("{{"), "quedaron marcadores sin llenar");
      // Una ficha sin el campo "verificada" (como las que manda la ruta, ya filtradas) sí entra.
      assert.equal(soloVerificadas([{ ...verificada, verificada: undefined }]).length, 1);
    },
  },
  {
    nombre: "003 · systemPromptPlan acepta una ficha verificada con «{{x}}» en su título o contenido y no la vuelve a reemplazar",
    correr: () => {
      const rara = {
        id: "KC-T02",
        titulo: "Plantilla {{x}} de agenda",
        tipo: "estrategia_fe",
        dominioFe: null,
        // Un marcador conocido y un "$&" dentro de los datos deben quedar tal cual.
        contenido: "Escribe {{TIPOS_ITEM}} y {{ sin cerrar; cuesta $& pesos.",
        verificada: true,
      };
      const prompt = systemPromptPlan([rara]);
      assert.ok(prompt.includes(rara.titulo), "falta el título con {{x}}");
      assert.ok(prompt.includes(rara.contenido), "el contenido de la ficha cambió al insertarlo");
      // Los marcadores de la plantilla sí se llenaron: ya no queda {{FICHAS}} ni {{DOMINIOS_FE}}.
      assert.ok(!prompt.includes("{{FICHAS}}") && !prompt.includes("{{DOMINIOS_FE}}"), "quedaron marcadores de la plantilla");
    },
  },
  {
    nombre: "003 · mensajeUsuarioPlan sin cédula, verificación, nota ni señales, y cada cita con su E-nn (CA-003.5)",
    correr: () => {
      const nota = "Nota completa de la sesión que no debe llegar al modelo del plan.";
      const mensaje = mensajeUsuarioPlan({ nombrePila: "Daniela", engagementType: "inclusion", indice: INDICE_PLAN, perfil: PERFIL_PLAN });
      for (const prohibido of ["cedula", "cédula", "diagnostico_verificado", "senalesActivas", nota, "Señal de prueba", "se mudó", SESION_P, "sessionId"]) {
        assert.ok(!mensaje.includes(prohibido), `el mensaje contiene "${prohibido}"`);
      }
      assert.ok(mensaje.includes("Daniela"));
      // El bloque del perfil es JSON: cada cita va con el ID del índice.
      const bloque = mensaje.split("<perfil_aprobado>")[1].split("</perfil_aprobado>")[0];
      const json = JSON.parse(bloque) as { dimensiones: Record<string, { evidencia: { id: string; cita: string }[] }> };
      const citas = Object.values(json.dimensiones).flatMap((d) => d.evidencia);
      assert.equal(citas.length, INDICE_PLAN.lista.length);
      for (const c of citas) {
        assert.match(c.id, /^E-\d{2}$/);
        assert.equal(INDICE_PLAN.porId.get(c.id)?.cita, c.cita);
      }
    },
  },
  {
    nombre: "003 · sanitizePlan quita E-99, deja E-01 y lo convierte a { cita, sessionId } del snapshot (CA-003.6)",
    correr: () => {
      const r = sanitizar([
        itemPlan("objetivo", "Daniela entrega el reporte semanal.", "Entrega el reporte cada viernes.", ["E-99", "E-01"]),
        itemPlan("objetivo", "Sin evidencia real.", null, ["E-98"]),
      ]);
      assert.equal(r.propuesta.items.length, 1);
      assert.deepEqual(r.propuesta.items[0].evidencia, [{ evidenciaId: "E-01" }]);
      assert.deepEqual(resolverEvidencia(r.propuesta.items[0].evidencia, INDICE_PLAN), [
        { cita: "en reuniones grandes casi no habla", sessionId: SESION_P },
      ]);
      assert.deepEqual(r.descartados, [
        { ruta: "items[0].evidencia[0]", motivo: "evidencia_no_existe", valor: "E-99" },
        { ruta: "items[1].evidencia[0]", motivo: "evidencia_no_existe", valor: "E-98" },
        { ruta: "items[1]", motivo: "sin_evidencia", valor: "" },
      ]);
      assert.ok(PlanProposal.safeParse(r.propuesta).success);
    },
  },
  {
    nombre: "003 · sanitizePlan quita el ítem con KC-999 y deja dominioFE nulo si no está en DOMINIOS_FE (CA-003.7)",
    correr: () => {
      const r = sanitizar(
        [
          itemPlan("apoyo_fe", "Ficha inventada.", "Usa una lista.", ["E-01"], { fichaId: "KC-999" }),
          itemPlan("apoyo_fe", "Dominio inventado.", "Usa una lista.", ["E-02"], { dominioFE: "atencion" }),
          itemPlan("apoyo_fe", "Ficha y dominio válidos.", "Usa una lista.", ["E-02"], { fichaId: "KC-T01", dominioFE: "iniciacion" }),
        ],
        ["KC-T01"],
      );
      assert.deepEqual(r.descartados, [{ ruta: "items[0]", motivo: "ficha_no_existe", valor: "KC-999" }]);
      assert.deepEqual(
        r.propuesta.items.map((i) => [i.descripcion, i.fichaId, i.dominioFE]),
        [
          ["Dominio inventado.", null, null],
          ["Ficha y dominio válidos.", "KC-T01", "iniciacion"],
        ],
      );
    },
  },
  {
    nombre: "003 · sanitizePlan marca «memoria de trabajo» en textoPersona y «nivel de apoyo» en descripcion (CA-003.8)",
    correr: () => {
      const r = sanitizar([
        itemPlan("apoyo_fe", "Daniela necesita nivel de apoyo con las listas.", "Trabaja tu memoria de trabajo", ["E-01"]),
        // "Flexibilidad" en la descripcion no es bandera: solo se revisa en textoPersona.
        itemPlan("apoyo_fe", "Flexibilidad con los horarios de entrega.", "Pide que te manden los acuerdos por correo.", ["E-02"]),
      ]);
      assert.deepEqual(motivos(r.banderas), [
        "items[0] descripcion termino_no_permitido nivel o grado de autismo/apoyo/severidad/funcionamiento",
        "items[0] textoPersona termino_interno Memoria de trabajo",
      ]);
      assert.equal(banderasQueBloquean(r.banderas).length, 2);
    },
  },
  {
    nombre: "003 · sanitizePlan marca cita_en_texto_lider (no bloquea) y cita_en_texto_persona (bloquea) (CA-003.9)",
    correr: () => {
      const r = sanitizar([
        itemPlan("comunicacion_lider", "Contarle al líder que «En reuniones grandes casi no habla».", null, ["E-01"]),
        itemPlan("apoyo_fe", "Daniela comparte ideas por escrito.", "Tu coach anotó: manda sus ideas por escrito después.", ["E-02"]),
      ]);
      assert.deepEqual(motivos(r.banderas), [
        "items[0] descripcion cita_en_texto_lider en reuniones grandes casi no habla",
        "items[1] textoPersona cita_en_texto_persona manda sus ideas por escrito después",
      ]);
      assert.deepEqual(
        banderasQueBloquean(r.banderas).map((b) => b.motivo),
        ["cita_en_texto_persona"],
      );
    },
  },
  {
    nombre: "003 · sanitizePlan marca mencion_condicion con «es autista» y bloquea; sin doble bandera con buscarTerminos (CA-003.27)",
    correr: () => {
      const r = sanitizar([
        itemPlan("objetivo", "Daniela es autista y prefiere el correo.", "Como eres autista, pide los acuerdos por correo.", ["E-02"]),
        // "asperger" y "autismo leve" ya los marca buscarTerminos: no se repiten como mencion_condicion.
        itemPlan("instruccion", "No mencionar asperger ni autismo leve.", null, ["E-03"]),
        // "Autismo" sin calificativo sí es mencion_condicion; "autoestima" no.
        itemPlan("comunicacion_lider", "Hablar de Autismo con el equipo cuida su autoestima.", null, ["E-01"]),
      ]);
      assert.deepEqual(motivos(r.banderas), [
        "items[0] descripcion mencion_condicion autista",
        "items[0] textoPersona mencion_condicion autista",
        "items[1] descripcion termino_no_permitido asperger",
        "items[1] descripcion termino_no_permitido autismo leve/moderado/severo",
        "items[2] descripcion mencion_condicion autismo",
      ]);
      assert.equal(banderasQueBloquean(r.banderas).length, 5, "todas bloquean la aprobación (R-003.30)");
    },
  },
  {
    nombre: "003 · objetivo_equipo y ajuste_razonable sobreviven sin textoPersona; con texto se descarta el texto (CA-003.30)",
    correr: () => {
      const sinTexto = sanitizar([
        itemPlan("objetivo_equipo", "El equipo cierra el inventario de fin de año.", null, ["E-01"]),
        itemPlan("ajuste_razonable", "Trabajar en la sala pequeña dos días por semana.", null, ["E-04"]),
      ]);
      assert.deepEqual(sinTexto.propuesta.items.map((i) => [i.tipo, i.textoPersona]), [
        ["objetivo_equipo", null],
        ["ajuste_razonable", null],
      ]);
      assert.deepEqual(sinTexto.descartados, []);

      const conTexto = sanitizar([
        itemPlan("ajuste_razonable", "Trabajar en la sala pequeña dos días por semana.", "Puedes pedir la sala pequeña.", ["E-04"]),
      ]);
      assert.equal(conTexto.propuesta.items.length, 1, "el ítem se queda");
      assert.equal(conTexto.propuesta.items[0].textoPersona, null);
      assert.deepEqual(conTexto.descartados, [{ ruta: "items[0].textoPersona", motivo: "textoPersona_en_tipo_interno", valor: "" }]);
    },
  },
  {
    nombre: "003 · banderasQueBloquean: termino_interno y citas solo bloquean en textoPersona (R-003.30)",
    correr: () => {
      const b = (campo: BanderaPlan["campo"], motivo: BanderaPlan["motivo"]): BanderaPlan => ({ ruta: "items[0]", campo, termino: "x", motivo });
      const todas = [
        b("descripcion", "termino_no_permitido"),
        b("descripcion", "mencion_condicion"),
        b("descripcion", "termino_interno"),
        b("descripcion", "cita_en_texto_lider"),
        b("textoPersona", "termino_interno"),
        b("textoPersona", "cita_en_texto_persona"),
      ];
      assert.deepEqual(
        banderasQueBloquean(todas).map((x) => `${x.campo} ${x.motivo}`),
        ["descripcion termino_no_permitido", "descripcion mencion_condicion", "textoPersona termino_interno", "textoPersona cita_en_texto_persona"],
      );
      assert.deepEqual(banderasQueBloquean([b("descripcion", "cita_en_texto_lider")]), []);
    },
  },
  {
    nombre: "003 · vistaPersonaPlan: solo objetivos y apoyos con texto, en orden, con la cadena itemsAnteriores (CA-003.37)",
    correr: () => {
      const [X, Y, Z, N, A, B, L, S, E] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(uuid);
      // Versiones aprobadas: v1 tiene X (objetivo) y A (apoyo sin texto); v2 tiene Y → X y B → A.
      const origenes = new Map<string, string | null>([
        [X, null],
        [A, null],
        [Y, X],
        [B, A],
      ]);
      const v3 = vistaPersonaPlan(
        [
          { id: Z, tipo: "objetivo", textoPersona: "Entrega el reporte cada viernes.", orden: 2, origenItemId: Y },
          { id: N, tipo: "objetivo", textoPersona: "Divide el proyecto en pasos semanales.", orden: 1, origenItemId: null },
          { id: S, tipo: "apoyo_fe", textoPersona: null, orden: 3, origenItemId: null }, // sin texto: no pasa
          { id: L, tipo: "comunicacion_lider", textoPersona: "No debería verse.", orden: 4, origenItemId: null },
          { id: E, tipo: "objetivo_equipo", textoPersona: null, orden: 5, origenItemId: null },
        ],
        origenes,
      );
      assert.deepEqual(v3, {
        items: [
          { planItemId: N, tipo: "objetivo", texto: "Divide el proyecto en pasos semanales.", orden: 1, itemsAnteriores: [] },
          { planItemId: Z, tipo: "objetivo", texto: "Entrega el reporte cada viernes.", orden: 2, itemsAnteriores: [Y, X] },
        ],
      });
      // El apoyo de la v1 sin texto sí entra en la cadena del apoyo de la v2.
      const v2 = vistaPersonaPlan([{ id: B, tipo: "apoyo_fe", textoPersona: "Pide los acuerdos por correo.", orden: 1, origenItemId: A }], origenes);
      assert.deepEqual(v2.items[0].itemsAnteriores, [A]);
    },
  },
  {
    nombre: "003 · rastroPlan: sin cambios, editado con su original, escrito por el coach y quitados (R-003.35)",
    correr: () => {
      const propuestos = [
        itemPlan("objetivo", "Objetivo de la IA.", "Texto de la IA.", ["E-01"]),
        itemPlan("apoyo_fe", "Apoyo de la IA.", "Apoyo original.", ["E-02"]),
        itemPlan("instruccion", "Instrucción que el coach quitó.", null, ["E-03"]),
        itemPlan("comunicacion_lider", "Punto para el líder.", null, ["E-01"]),
      ];
      const propuestaIa: PayloadPlanIA = {
        propuesta: { items: propuestos },
        descartados: [],
        banderas: [],
        fichasEnviadas: [],
        evidenciaEnviada: INDICE_PLAN.lista.map((e) => e.id),
      };
      const base = { textoPersona: null, origenItemId: null };
      const items: ItemRastro[] = [
        { ...base, id: uuid(11), tipo: "objetivo", descripcion: "Objetivo de la IA.", textoPersona: "Texto de la IA.", origen: "ia", propuestaRef: 0 },
        { ...base, id: uuid(12), tipo: "apoyo_fe", descripcion: "Apoyo editado.", textoPersona: "Apoyo nuevo.", origen: "ia_editado", propuestaRef: 1, origenItemId: uuid(1) },
        { ...base, id: uuid(13), tipo: "comunicacion_lider", descripcion: "Punto para el líder.", origen: "ia", propuestaRef: 3 },
        { ...base, id: uuid(14), tipo: "objetivo", descripcion: "Escrito por el coach.", textoPersona: "Texto del coach.", origen: "coach", propuestaRef: null },
      ];
      const r = rastroPlan(propuestaIa, items);
      assert.deepEqual(
        r.items.map((i) => [i.id, i.estado, i.original]),
        [
          [uuid(11), "sin_cambios", null],
          [uuid(12), "editado", { descripcion: "Apoyo de la IA.", textoPersona: "Apoyo original." }],
          [uuid(13), "sin_cambios", null],
          [uuid(14), "coach", null],
        ],
      );
      assert.equal(r.items[1].origenItemId, uuid(1), "conserva a qué punto anterior sigue");
      assert.deepEqual(r.quitados, [{ ref: 2, tipo: "instruccion", descripcion: "Instrucción que el coach quitó." }]);
      // Un plan sin propuesta de la IA: todo es del coach y no hay quitados.
      assert.deepEqual(rastroPlan(null, [items[3]]).quitados, []);
    },
  },
  {
    nombre: "003 · revisarPlan del eval: ficha fuera del caso, sin verificar, evidencia fuera del índice, cédula y patrón C-13 (CA-007.12, CA-007.13, CA-007.27 a CA-007.29)",
    correr: () => {
      const caso = {
        catalogo: {
          fichas: [
            { id: "KC-T01", verificada: true },
            { id: "KC-T09", verificada: false },
          ],
        },
        esperado: {
          plan: {
            tipos: ["objetivo" as const],
            fichasEsperadas: [],
            fichasExcluidas: [],
            banderas: 0,
            patronesProhibidos: [{ patron: "participar más en las reuniones", motivo: "C-13", severidad: "critica" as const }],
          },
        },
      };
      const revisar = (items: ItemPropuesto[], descartados: DescartadoPlan[] = []) =>
        revisarPlan(caso, { propuesta: { items }, descartados, banderas: [] }, INDICE_PLAN);

      // Pasa: sin patrón, ficha verificada del caso y un descarte (solo advertencia).
      const bien = revisar(
        [itemPlan("objetivo", "Mandar por escrito las dudas después de la reunión.", "Manda tus dudas por correo.", ["E-02"], { fichaId: "KC-T01" })],
        [{ ruta: "items[1].evidencia[0]", motivo: "evidencia_no_existe", valor: "E-99" }],
      );
      assert.deepEqual(bien.criticos, []);
      assert.equal(bien.advertencias.length, 1);

      const mal = (item: ItemPropuesto) => revisar([item]).criticos.length;
      assert.ok(mal(itemPlan("objetivo", "Participar más en las reuniones del equipo.", null, ["E-01"])) > 0, "patrón C-13");
      assert.ok(mal(itemPlan("objetivo", "Objetivo.", null, ["E-01"], { fichaId: "KC-999" })) > 0, "ficha fuera del caso");
      assert.ok(mal(itemPlan("objetivo", "Objetivo.", null, ["E-01"], { fichaId: "KC-T09" })) > 0, "ficha sin verificar");
      assert.ok(mal(itemPlan("objetivo", "Objetivo.", null, ["E-77"])) > 0, "evidencia fuera del índice");
      assert.ok(mal(itemPlan("comunicacion_lider", "Decirle al líder su cédula.", null, ["E-01"])) > 0, "cédula en lo del líder");
    },
  },
];

function correrPruebasOffline(): boolean {
  console.log("\nPruebas sin red");
  let todoBien = true;
  for (const prueba of PRUEBAS) {
    try {
      prueba.correr();
      console.log(`  OK    ${prueba.nombre}`);
    } catch (e) {
      todoBien = false;
      console.log(`  FALLA ${prueba.nombre}`);
      console.log(`        ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return todoBien;
}

// ===========================================================================
// 2. Casos con el modelo
// ===========================================================================

// Forma de un archivo de eval/cases. Se permiten llaves extra (_atribucion, _nota, rasgos).
const Caso = z.object({
  id: z.string(),
  engagementType: z.enum(["inclusion", "workplace_support"]),
  nombrePila: z.string(),
  perfilPrevio: Perfil,
  nota: z.string(),
  esperado: z.object({
    dimensiones: z.array(DimensionId),
    dominiosFE: z.array(DominioFE).default([]),
    senales: z.array(TipoSenal),
    senalesProhibidas: z.array(TipoSenal),
    tipoNoPermitido: z
      .array(z.object({ dimension: DimensionId, tipo: TipoHallazgo, motivo: z.string() }))
      .default([]),
    banderas: z.int().nonnegative(),
  }),
});
type Caso = z.infer<typeof Caso>;

const DIR_CASOS = path.join(process.cwd(), "eval", "cases");

// Archivos de eval/cases con su JSON ya leído. Los de "formato": 2 son casos de plan (spec 007);
// los demás son casos de perfil con el formato de la spec 001.
function leerArchivosCasos(): { archivo: string; json: unknown }[] {
  return readdirSync(DIR_CASOS)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((archivo) => ({ archivo, json: JSON.parse(readFileSync(path.join(DIR_CASOS, archivo), "utf8")) as unknown }));
}

const esFormato2 = (json: unknown) => typeof json === "object" && json !== null && (json as { formato?: unknown }).formato === 2;

function cargarCasos(): { archivo: string; caso: Caso }[] {
  return leerArchivosCasos()
    .filter(({ json }) => !esFormato2(json))
    .map(({ archivo, json }) => ({ archivo, caso: Caso.parse(json) }));
}

type ResultadoCaso = {
  id: string;
  criticos: string[];
  advertencias: string[];
  columnas: string[]; // fila de la tabla resumen
};

const lista = (xs: string[]) => (xs.length ? xs.join(", ") : "ninguna");

async function evaluarCaso(caso: Caso): Promise<ResultadoCaso> {
  const { proposeProfileUpdate } = await import("@/lib/ai/propose-profile-update");
  const criticos: string[] = [];
  const advertencias: string[] = [];

  let r;
  try {
    r = await proposeProfileUpdate({
      nota: caso.nota,
      nombrePila: caso.nombrePila,
      engagementType: caso.engagementType,
      perfilPrevio: caso.perfilPrevio,
    });
  } catch (e) {
    // Incluye respuestas que no pasan la validación de Zod (NoObjectGeneratedError).
    const mensaje = e instanceof Error ? e.message : String(e);
    return { id: caso.id, criticos: [`La llamada o la validación falló: ${mensaje}`], advertencias, columnas: [caso.id, "FALLA", "-", "-", "-", "-", "-", "-"] };
  }

  const { update, descartados, banderas } = sanitizeUpdate(r.update, caso.nota);
  const esp = caso.esperado;

  if (!ProfileUpdate.safeParse(update).success) criticos.push("El update limpio no cumple el esquema ProfileUpdate.");

  // Dimensiones
  const dims = new Set<string>(update.cambios.map((c) => c.dimension));
  const faltantes = esp.dimensiones.filter((d) => !dims.has(d));
  const extra = [...dims].filter((d) => !(esp.dimensiones as string[]).includes(d));
  if (faltantes.length) advertencias.push(`Dimensiones esperadas que no aparecieron: ${lista(faltantes)}`);
  if (extra.length) advertencias.push(`Dimensiones extra (revisar si tienen sentido): ${lista(extra)}`);

  // Dominios de función ejecutiva
  const dominios = new Set<string>(update.cambios.flatMap((c) => c.dominiosFE));
  const dominiosFaltantes = esp.dominiosFE.filter((d) => !dominios.has(d));
  if (dominiosFaltantes.length) advertencias.push(`Dominios FE esperados que no aparecieron: ${lista(dominiosFaltantes)}`);

  // Señales
  const senales = new Set<string>(update.senales.map((s) => s.tipo));
  const senalesFaltantes = esp.senales.filter((s) => !senales.has(s));
  const prohibidas = esp.senalesProhibidas.filter((s) => senales.has(s));
  if (senalesFaltantes.length) advertencias.push(`Señales esperadas que no aparecieron: ${lista(senalesFaltantes)}`);
  if (prohibidas.length) criticos.push(`Señales prohibidas presentes: ${lista(prohibidas)}`);

  // Prueba de sesgo: tipos que no deben salir en ciertas dimensiones
  for (const regla of esp.tipoNoPermitido) {
    if (update.cambios.some((c) => c.dimension === regla.dimension && c.tipo === regla.tipo)) {
      advertencias.push(`${regla.dimension} salió como "${regla.tipo}". ${regla.motivo}`);
    }
  }

  // Citas y banderas
  if (descartados.length) {
    advertencias.push(`Citas descartadas (no estaban en la nota): ${descartados.length}`);
    for (const d of descartados) advertencias.push(`  ${d.ruta}: "${d.cita}"`);
  }
  if (banderas.length > esp.banderas) {
    criticos.push(`Banderas de términos no permitidos: ${banderas.length} (esperadas: ${esp.banderas})`);
    for (const b of banderas) criticos.push(`  ${b.ruta}: ${b.termino}`);
  }

  const tokens = `${r.usage.entrada ?? "?"}/${r.usage.salida ?? "?"}/${r.usage.cacheLectura ?? "?"}`;
  return {
    id: caso.id,
    criticos,
    advertencias,
    columnas: [
      caso.id,
      criticos.length ? "FALLA" : "OK",
      `${esp.dimensiones.length - faltantes.length}/${esp.dimensiones.length} (+${extra.length})`,
      `${esp.senales.length - senalesFaltantes.length}/${esp.senales.length}`,
      String(prohibidas.length),
      String(descartados.length),
      String(banderas.length),
      `${tokens}  ${r.latenciaMs} ms`,
    ],
  };
}

// ===========================================================================
// 3. Casos de plan (spec 003, tarea 21; formato 2 de la spec 007)
// ===========================================================================

// Ficha de prueba propia del caso (decisión 5 (d) de 007). Mismas columnas que knowledge_cards.
const FichaCaso = z.strictObject({
  id: z.string(),
  titulo: z.string(),
  tipo: z.enum(["estrategia_fe", "ajuste_razonable", "senal"]),
  contenido: z.string(),
  dominioFe: z.string().nullable(),
  fuente: z.string(),
  verificada: z.boolean(),
});

const EsperadoPlan = z.strictObject({
  tipos: z.array(TipoItemPlan),
  fichasEsperadas: z.array(z.string()),
  fichasExcluidas: z.array(z.string()),
  banderas: z.int().nonnegative(),
  patronesProhibidos: z.array(
    z.strictObject({
      patron: z.string().min(1),
      motivo: z.string(),
      severidad: z.enum(["critica", "advertencia"]).default("critica"), // sin severidad cuenta como crítica (R-007.22)
    }),
  ),
});
type EsperadoPlan = z.infer<typeof EsperadoPlan>;

// Estricto (R-007.1): una llave que no está aquí invalida el caso. Solo lo que necesita la etapa
// "plan"; el resto del formato 2 (variantes, contención, etc.) lo agrega 007.
const CasoPlan = z.strictObject({
  _atribucion: z.string(),
  _nota: z.string().includes("Persona y datos inventados."),
  formato: z.literal(2),
  autor: z.string().min(1),
  revision: z.strictObject({
    estado: z.enum(["borrador", "revisado_equipo", "revisado_partner"]),
    por: z.string().nullable(),
    fecha: z.string().nullable(),
  }),
  etapas: z.array(z.literal("plan")).min(1),
  id: z.string(),
  descripcion: z.string(),
  engagementType: z.enum(["inclusion", "workplace_support"]),
  nombrePila: z.string(),
  nota: z.string(), // nota de la que salen las citas del perfilAprobado (R-007.53)
  rasgos: z.array(z.strictObject({ rasgo: z.string(), donde: z.string(), fuente: z.string() })).min(1),
  perfilAprobado: Perfil,
  catalogo: z.strictObject({ fichas: z.array(FichaCaso), unidades: z.array(z.unknown()) }),
  esperado: z.strictObject({ plan: EsperadoPlan }),
});
type CasoPlan = z.infer<typeof CasoPlan>;

// IDs de las fichas del seed: las fichas de prueba de un caso deben tener IDs distintos.
const IDS_SEED = new Set(FICHAS_SEED.map((f) => f.id));

// Revisa un caso de plan ya parseado. Devuelve los motivos por los que es inválido.
function problemasCasoPlan(archivo: string, caso: CasoPlan): string[] {
  const problemas: string[] = [];
  // R-007.8: nombre de archivo e id.
  const nombre = /^\d{4}-\d{2}-\d{2}_(caso-[a-z0-9-]+-\d{2})\.json$/.exec(archivo);
  if (!nombre) problemas.push("El nombre de archivo no sigue AAAA-MM-DD_caso-<tipo>-<nn>.json.");
  else if (nombre[1] !== caso.id) problemas.push(`El id "${caso.id}" no coincide con el archivo.`);
  // R-007.3: cada rasgo con una fuente.
  caso.rasgos.forEach((r, i) => {
    if (!/F-0\d\d|D-0\d\d|CONTEXTO §\d+/.test(r.fuente)) problemas.push(`El rasgo ${i + 1} no tiene ID de fuente.`);
  });
  // R-007.6 y R-007.7: nota sin términos no permitidos ni datos de contacto.
  const terminos = buscarTerminos(caso.nota);
  if (terminos.length) problemas.push(`La nota tiene términos no permitidos: ${terminos.join(", ")}.`);
  if (/@|\d{7,}/.test(caso.nota)) problemas.push("La nota tiene un correo o un número de más de 6 dígitos.");
  // R-007.53: cada cita del perfilAprobado está en la nota del caso.
  const nota = normalizar(caso.nota);
  const citas = [
    ...Object.values(caso.perfilAprobado.dimensiones).flatMap((d) => d!.evidencia),
    ...caso.perfilAprobado.senalesActivas.flatMap((s) => s.evidencia),
  ];
  for (const { cita } of citas) {
    if (!citaEnNota(normalizar(cita), nota)) problemas.push(`Una cita del perfilAprobado no está en la nota: "${cita}".`);
  }
  // Decisión 5 (d) de 007: IDs de prueba distintos de los del seed y sin repetir.
  const ids = caso.catalogo.fichas.map((f) => f.id);
  for (const id of ids) if (IDS_SEED.has(id)) problemas.push(`La ficha ${id} usa un ID del seed.`);
  if (new Set(ids).size !== ids.length) problemas.push("Hay fichas con el mismo ID.");
  // R-007.27 (CA-007.27): ninguna ficha sin verificar llega al system prompt del plan.
  const prompt = systemPromptPlan(caso.catalogo.fichas);
  for (const f of caso.catalogo.fichas) {
    if (!f.verificada && prompt.includes(f.id)) problemas.push(`La ficha sin verificar ${f.id} llegó al system prompt.`);
  }
  return problemas;
}

// Carga y valida los casos de plan. Un caso inválido no se corre y cuenta como falla crítica.
function validarCasosPlan(): { validos: CasoPlan[]; ok: boolean } {
  console.log("\nValidación de casos de plan");
  const validos: CasoPlan[] = [];
  let ok = true;
  for (const { archivo, json } of leerArchivosCasos().filter(({ json }) => esFormato2(json))) {
    const parse = CasoPlan.safeParse(json);
    const problemas = parse.success
      ? problemasCasoPlan(archivo, parse.data)
      : parse.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`);
    if (problemas.length) {
      ok = false;
      console.log(`  FALLA ${archivo}`);
      problemas.forEach((p) => console.log(`        ${p}`));
    } else {
      console.log(`  OK    ${archivo}`);
      validos.push(parse.data!);
    }
  }
  console.log(`  Casos de plan: ${validos.length}`);
  return { validos, ok };
}

const ETIQUETAS_DOMINIOS: readonly string[] = DOMINIOS_FE.map((d) => d.etiqueta);

// Criterios de 007 sobre un plan ya limpio por sanitizePlan. Función pura para poder probarla
// sin red con salidas fijas.
function revisarPlan(
  caso: { catalogo: { fichas: { id: string; verificada: boolean }[] }; esperado: { plan: EsperadoPlan } },
  limpio: { propuesta: PlanProposal; descartados: DescartadoPlan[]; banderas: BanderaPlan[] },
  indice: IndiceEvidencia,
): { criticos: string[]; advertencias: string[] } {
  const criticos: string[] = [];
  const advertencias: string[] = [];
  const esp = caso.esperado.plan;
  const items = limpio.propuesta.items;
  const fichas = new Map(caso.catalogo.fichas.map((f) => [f.id, f]));

  if (!PlanProposal.safeParse(limpio.propuesta).success) criticos.push("El plan limpio no cumple el esquema PlanProposal.");

  items.forEach((item, k) => {
    const ruta = `items[${k}]`;
    // R-007.26 y R-007.27: la ficha existe en el caso y está verificada; R-007.54: no está excluida.
    if (item.fichaId !== null) {
      const ficha = fichas.get(item.fichaId);
      if (!ficha) criticos.push(`${ruta}: cita la ficha ${item.fichaId}, que no está en el catálogo del caso.`);
      else if (!ficha.verificada) criticos.push(`${ruta}: cita la ficha sin verificar ${item.fichaId}.`);
      if (esp.fichasExcluidas.includes(item.fichaId)) criticos.push(`${ruta}: cita la ficha excluida ${item.fichaId}.`);
    }
    // R-007.28: toda evidencia sale del índice del perfilAprobado.
    for (const e of item.evidencia) {
      if (!indice.porId.has(e.evidenciaId)) criticos.push(`${ruta}: la evidencia ${e.evidenciaId} no sale del índice del perfil.`);
    }
    // R-007.29: nada de cédula ni verificación en lo del líder ni en los objetivos del equipo.
    if (item.tipo === "comunicacion_lider" || item.tipo === "objetivo_equipo") {
      const d = normalizar(item.descripcion);
      if (/\bcedula\b/.test(d) || d.includes("verificacion del diagnostico")) {
        criticos.push(`${ruta}: menciona la cédula o la verificación del diagnóstico.`);
      }
    }
    // R-007.54: patrones prohibidos (C-13) en descripcion o textoPersona, normalizados.
    for (const p of esp.patronesProhibidos) {
      const patron = normalizar(p.patron);
      const textos = [item.descripcion, item.textoPersona ?? ""];
      const conPatron = textos.find((t) => normalizar(t).includes(patron));
      if (conPatron !== undefined) {
        // Se imprime el texto (sintético) para que una persona vea si es una falla real o una
        // frase que niega el patrón ("no hace falta que hable más").
        const mensaje = `${ruta} (${item.tipo}): contiene «${p.patron}». ${p.motivo} Texto: "${conPatron}"`;
        (p.severidad === "critica" ? criticos : advertencias).push(mensaje);
      }
    }
  });

  // R-007.54: banderas que bloquean por lenguaje, más de las declaradas.
  const deLenguaje = limpio.banderas.filter((b) => b.motivo === "termino_no_permitido" || b.motivo === "mencion_condicion");
  if (deLenguaje.length > esp.banderas) {
    criticos.push(`Banderas termino_no_permitido o mencion_condicion: ${deLenguaje.length} (esperadas: ${esp.banderas})`);
  }
  for (const b of limpio.banderas) {
    const linea = `${b.ruta}.${b.campo}: ${b.motivo} «${b.termino}»`;
    const esDeLenguaje = b.motivo === "termino_no_permitido" || b.motivo === "mencion_condicion";
    const dominioEnPersona = b.motivo === "termino_interno" && ETIQUETAS_DOMINIOS.includes(b.termino);
    if (b.campo === "textoPersona" && (esDeLenguaje || dominioEnPersona)) {
      // R-007.62: en lo que ve la persona es crítico aunque el caso declare banderas.
      criticos.push(`  ${linea} (texto para la persona)`);
    } else if (esDeLenguaje) {
      (deLenguaje.length > esp.banderas ? criticos : advertencias).push(`  ${linea}`);
    } else {
      // El resto bloquea la aprobación en la app o solo avisa al coach: advertencia en el eval.
      advertencias.push(`Bandera: ${linea}`);
    }
  }

  // Advertencias: descartes, tipos y fichas esperadas que faltan, plan sin objetivos.
  for (const d of limpio.descartados) advertencias.push(`Descartado por la validación: ${d.ruta} ${d.motivo}${d.valor ? ` (${d.valor})` : ""}`);
  const tipos = new Set(items.map((i) => i.tipo));
  const tiposFaltantes = esp.tipos.filter((t) => !tipos.has(t));
  if (tiposFaltantes.length) advertencias.push(`Tipos esperados que no aparecieron: ${lista(tiposFaltantes)}`);
  const citadas = new Set(items.map((i) => i.fichaId).filter((f): f is string => f !== null));
  const fichasFaltantes = esp.fichasEsperadas.filter((f) => !citadas.has(f));
  if (fichasFaltantes.length) advertencias.push(`Fichas esperadas que no aparecieron: ${lista(fichasFaltantes)}`);
  if (!tipos.has("objetivo")) advertencias.push("No propuso ningún objetivo: el coach tendría que agregar uno para aprobar (R-003.29).");

  return { criticos, advertencias };
}

async function evaluarCasoPlan(caso: CasoPlan): Promise<ResultadoCaso> {
  const { proposePlan } = await import("@/lib/ai/propose-plan");
  const fallo = (mensaje: string): ResultadoCaso => ({
    id: caso.id,
    criticos: [mensaje],
    advertencias: [],
    columnas: [caso.id, "FALLA", "-", "-", "-", "-", "-", "-"],
  });

  let r;
  try {
    // Se manda el catálogo completo del caso, con la ficha sin verificar: proposePlan la filtra.
    r = await proposePlan({
      nombrePila: caso.nombrePila,
      engagementType: caso.engagementType,
      perfil: caso.perfilAprobado,
      fichas: caso.catalogo.fichas,
    });
  } catch (e) {
    // Incluye respuestas que no pasan la validación de Zod (NoObjectGeneratedError).
    return fallo(`La llamada o la validación falló: ${e instanceof Error ? e.message : String(e)}`);
  }

  const fichasEnviadas = soloVerificadas(caso.catalogo.fichas).map((f) => f.id);
  const limpio = sanitizePlan(r.propuesta, { fichasEnviadas, indice: r.indice });
  const { criticos, advertencias } = revisarPlan(caso, limpio, r.indice);

  const items = limpio.propuesta.items;
  const esp = caso.esperado.plan;
  const tipos = new Set(items.map((i) => i.tipo));
  const citadas = [...new Set(items.map((i) => i.fichaId).filter((f): f is string => f !== null))].sort();
  const tokens = `${r.usage.entrada ?? "?"}/${r.usage.salida ?? "?"}/${r.usage.cacheLectura ?? "?"}`;
  return {
    id: caso.id,
    criticos,
    advertencias,
    columnas: [
      caso.id,
      criticos.length ? "FALLA" : "OK",
      `${items.length} (${r.propuesta.items.length} propuestos)`,
      `${esp.tipos.filter((t) => tipos.has(t)).length}/${esp.tipos.length}`,
      citadas.length ? citadas.join(" ") : "ninguna",
      String(limpio.descartados.length),
      `${banderasQueBloquean(limpio.banderas).length}/${limpio.banderas.length}`,
      `${tokens}  ${r.latenciaMs} ms`,
    ],
  };
}

// Imprime filas con columnas alineadas.
function imprimirTabla(encabezado: string[], filas: string[][]) {
  const anchos = encabezado.map((h, i) => Math.max(h.length, ...filas.map((f) => f[i].length)));
  const linea = (f: string[]) => "  " + f.map((c, i) => c.padEnd(anchos[i])).join("  ");
  console.log(linea(encabezado));
  console.log("  " + anchos.map((a) => "-".repeat(a)).join("  "));
  filas.forEach((f) => console.log(linea(f)));
}

// ===========================================================================
// main
// ===========================================================================

async function main() {
  const pruebasOk = correrPruebasOffline();
  const { validos: casosPlan, ok: casosPlanOk } = validarCasosPlan();
  const offlineOk = pruebasOk && casosPlanOk;
  if (OFFLINE) {
    console.log(offlineOk ? "\nResultado: todo pasó." : "\nResultado: hay pruebas que fallaron.");
    process.exitCode = offlineOk ? 0 : 1;
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\nFalta ANTHROPIC_API_KEY en .env.local. Para correr solo las pruebas sin red: npm run eval -- --offline");
    process.exitCode = 1;
    return;
  }

  const { MODEL_ID } = await import("@/lib/ai/model");
  const casos = cargarCasos();
  console.log(`\nCasos con el modelo (${casos.length}) · modelo ${MODEL_ID} · prompt ${PROMPT_VERSION}`);

  // Uno por uno: más lento, pero los tokens y la latencia de cada caso se leen limpios.
  const resultados: ResultadoCaso[] = [];
  for (const { caso } of casos) resultados.push(await evaluarCaso(caso));

  console.log("");
  imprimirTabla(
    ["Caso", "Resultado", "Dimensiones", "Señales", "Prohibidas", "Descartadas", "Banderas", "Tokens ent/sal/cache  Latencia"],
    resultados.map((r) => r.columnas),
  );

  // Casos de plan: uno por uno también, con su propia tabla.
  console.log(`\nCasos de plan con el modelo (${casosPlan.length}) · modelo ${MODEL_ID} · prompt ${PROMPT_VERSION_PLAN}`);
  const resultadosPlan: ResultadoCaso[] = [];
  for (const caso of casosPlan) resultadosPlan.push(await evaluarCasoPlan(caso));
  console.log("");
  imprimirTabla(
    ["Caso", "Resultado", "Puntos", "Tipos", "Fichas citadas", "Descartados", "Banderas bloquean/total", "Tokens ent/sal/cache  Latencia"],
    resultadosPlan.map((r) => r.columnas),
  );
  resultados.push(...resultadosPlan);

  for (const r of resultados) {
    if (!r.criticos.length && !r.advertencias.length) continue;
    console.log(`\n${r.id}`);
    r.criticos.forEach((c) => console.log(`  CRÍTICO      ${c}`));
    r.advertencias.forEach((a) => console.log(`  ADVERTENCIA  ${a}`));
  }

  const hayCriticos = !offlineOk || resultados.some((r) => r.criticos.length > 0);
  console.log(hayCriticos ? "\nResultado: hay fallas críticas." : "\nResultado: sin fallas críticas.");
  process.exitCode = hayCriticos ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
