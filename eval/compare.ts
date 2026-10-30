// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Eval del pipeline de propuesta de perfil.
//   npm run eval              → pruebas sin red + todos los casos de eval/cases con el modelo
//   npm run eval -- --offline → solo las pruebas sin red (sanitizeUpdate, applyApproval y las del
//                               alta de la spec 002: código de invitación, validadores y aviso)
//
// Sale con código 1 si algo crítico falla: una prueba sin red, la llamada o validación del
// modelo, banderas de términos no permitidos o una señal prohibida. Lo demás (dimensiones
// faltantes, citas descartadas) se reporta como advertencia.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { z } from "zod";
import { ALFABETO, formatearCodigo, generarCodigo, LONGITUD_CODIGO, normalizarCodigo, VIGENCIA_DIAS, venceEn } from "@/lib/invitations/code";
import { AVISO_VERSION } from "@/lib/legal/aviso";
import { applyApproval, validarIndices } from "@/lib/profile/merge";
import { Cedula, CorreoPrueba, Verificacion } from "@/lib/validators/alta";
import {
  DimensionId,
  DominioFE,
  Perfil,
  ProfileUpdate,
  TipoHallazgo,
  TipoSenal,
  type CambioDimension,
} from "@/lib/profile/schema";
import { sanitizeUpdate } from "@/lib/profile/validate";

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

function cargarCasos(): { archivo: string; caso: Caso }[] {
  const dir = path.join(process.cwd(), "eval", "cases");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((archivo) => ({ archivo, caso: Caso.parse(JSON.parse(readFileSync(path.join(dir, archivo), "utf8"))) }));
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
  const offlineOk = correrPruebasOffline();
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
  const { PROMPT_VERSION } = await import("@/lib/prompts");
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
