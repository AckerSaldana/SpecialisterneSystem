// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Pruebas de ruta de la spec 010 (tarea 25). Lo de las tareas 13 a 24: CA-010.1 a .3, .5, .8 a .11, .18, .24, .26 a .42
// (la parte de ruta y de lectura), .44 a .48 y .55 a .59. Llama a las funciones de lib/ que usan los route.ts y las páginas, con un modelo simulado y cuentas sintéticas. Sin
// red y sin caminos de prueba en el servidor. La capa de cookies, el 401 y lo que se pinta se cubren en el navegador.
// Uso: npm run desglose-check  (necesita DATABASE_URL en .env.local, las migraciones y el seed).
//
// Crea sus propios acompañamientos con ids fijos y los borra al empezar y al terminar. No toca el demo ni otras cuentas.
// Imprime "OK|FALLA <ID> <descripción>" por caso y sale con 1 si alguno falla.
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { NoObjectGeneratedError } from "ai";
import { config } from "dotenv";
import postgres from "postgres";
import type { ResultadoAjustesModelo, ResultadoDesgloseModelo } from "@/lib/ai/propose-desglose";
import type { RespuestaRuta } from "@/lib/api/ruta";
import * as TEXTOS_COACH from "@/components/coach/desglose/textos";
import * as TEXTOS_PERSONA from "@/components/persona/desglose/textos";
import { withRls } from "@/lib/db/rls";
import { archivarDesglose, decidirAjustes, marcarPaso, MENSAJES_MARCAS, revisarMarca } from "@/lib/desglose/acciones";
import { ACCION_AJUSTES, ACCION_DESGLOSE, ACCION_PLANTILLA, ACCION_RESERVA_DESGLOSE, MENSAJES_DESGLOSE, pedirDesglose, repetirDesglose, SUFIJO_REINTENTO, type DepsAjustes, type DepsDesglose, type UsuarioDesglose } from "@/lib/desglose/generar";
import { hayPerfilParaDesglose, leerAtorados, leerPlantillas, leerTareaCoach, leerTareaPersona, leerTareasCoach, leerTareasPersona } from "@/lib/desglose/lectura";
import { aplicarPlantilla, archivarPlantilla, guardarPlantilla, MENSAJES_PLANTILLAS } from "@/lib/desglose/plantillas";
import { LIMITE_DIARIO_DESGLOSE, type AjusteGuardado, type PasoDesglose, type PasoPropuesto } from "@/lib/desglose/schema";
import { mensajeBloqueoCoach, mensajeBloqueoPlantilla } from "@/lib/desglose/validate";
import { leerSeguimiento, leerUltimoSnapshot } from "@/lib/followup/lectura";
import { AVISO_VERSION } from "@/lib/legal/aviso";
import { DOMINIOS_FE, SENALES } from "@/lib/profile/schema";
import { normalizar } from "@/lib/profile/terminos";
import { mensajeUsuarioAjustes, mensajeUsuarioDesglose, PROMPT_VERSION_DESGLOSE, PROMPT_VERSION_DESGLOSE_AJUSTES, type EntradaAjustesModelo, type EntradaDesgloseModelo } from "@/lib/prompts";
import { columnaDe, TABLAS_PURGA } from "./tablas-purga";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env.local. Cópiala de Supabase (Connect → Transaction pooler) y vuelve a correr.");
  process.exit(1);
}
// prepare: false porque el transaction pooler de Supabase no soporta prepared statements.
const sql = postgres(url, { prepare: false, max: 2, onnotice: () => {} });

// ---------------------------------------------------------------------------
// Datos sintéticos
// ---------------------------------------------------------------------------

const ORG = "11111111-1111-4111-8111-111111111111";
const COACH = "22222222-2222-4222-8222-222222222222"; // del seed
const COACH_AJENO = "da100000-0000-4000-8000-000000000001";

const PERSONAS = {
  principal: "da100000-0000-4000-8000-000000000011",
  sinPerfil: "da100000-0000-4000-8000-000000000012",
  ajena: "da100000-0000-4000-8000-000000000013",
} as const;
const ENG = {
  principal: "da100000-0000-4000-8000-000000000021",
  sinPerfil: "da100000-0000-4000-8000-000000000022",
  ajena: "da100000-0000-4000-8000-000000000023",
} as const;
const TODOS_ENG = Object.values(ENG);

const comoUsuario = (id: string, role: UsuarioDesglose["role"]): UsuarioDesglose => ({ id, role, claims: { sub: id, role: "authenticated" } });
const coach = comoUsuario(COACH, "coach");
const coachAjeno = comoUsuario(COACH_AJENO, "coach");
const persona = comoUsuario(PERSONAS.principal, "persona");
const personaAjena = comoUsuario(PERSONAS.ajena, "persona");
const personaSinPerfil = comoUsuario(PERSONAS.sinPerfil, "persona");

const NOMBRE = "Luz";

// Textos centinela. Ninguno debe salir en el mensaje al modelo, en la fila del desglose ni en un log.
const CITA_PERFIL = "repite en voz alta los acuerdos de la junta";
const CITA_SENAL = "dijo que quiere cambiarse de área este año";
const DESC_INSTRUCCION = "Dar cada instrucción nueva también por escrito";
const DESC_OBJETIVO = "Descripción del objetivo que la persona no lee";
const CEDULA = "7654321";
const CENTINELAS_INTERNOS = [CITA_PERFIL, CITA_SENAL, DESC_INSTRUCCION, DESC_OBJETIVO, CEDULA];

const RESUMEN_INICIO = "A Luz le ayuda tener una lista corta para empezar.";
const RESUMEN_FORTALEZA = "Luz ordena bien sus archivos.";
const RESUMEN_CONTEXTO = "Luz trabajó en un archivo antes.";
const TEXTO_OBJETIVO = "Revisa tu lista de pendientes cada mañana.";

const TAREA = "Preparar el reporte mensual de pendientes";
const PEDIDO = { tarea: TAREA };

const paso = (accion: string, extra: Partial<PasoPropuesto> = {}): PasoPropuesto => ({
  accion,
  criterioTerminado: "El archivo tiene título y se guardó en la carpeta.",
  notaApoyo: null,
  apoyoRef: null,
  minutos: null,
  ...extra,
});

// A-01 es la fortaleza con los 9 dominios y A-02 el área de apoyo con iniciacion: las dos traen iniciar.
const PASO_INICIO = paso("Abre un documento en blanco", { apoyoRef: "A-02" });
const SALIDA_BUENA = {
  pasos: [
    PASO_INICIO,
    paso("Escribe el título del reporte", { notaApoyo: "una lista corta de lo que va en el reporte", apoyoRef: "A-02", minutos: 5 }),
    paso("Revisa tu lista de pendientes", { notaApoyo: "la lista de cada mañana", apoyoRef: "A-03" }),
  ],
};
const SALIDA_DOS_ACCIONES = { pasos: [PASO_INICIO, paso("Abre el archivo y escribe el título")] };
const SALIDA_CON_TERMINO = { pasos: [PASO_INICIO, paso("Usa tu memoria de trabajo para ordenar el reporte")] };

// ---------------------------------------------------------------------------
// Modelo simulado
// ---------------------------------------------------------------------------

const USO = { entrada: 100, salida: 50, cacheLectura: 0 };

// Responde lo que le toque de la lista, y repite la última. Una salida fuera del esquema también llega: la revisa el
// código, no el tipo. Guarda lo que recibió para revisar qué le llega al modelo.
function modelo(salidas: unknown[] = [SALIDA_BUENA], alLlamar?: () => void | Promise<void>): DepsDesglose & { llamadas: () => number; entradas: EntradaDesgloseModelo[] } {
  const entradas: EntradaDesgloseModelo[] = [];
  return {
    entradas,
    llamadas: () => entradas.length,
    proponer: async (entrada): Promise<ResultadoDesgloseModelo> => {
      const salida = salidas[Math.min(entradas.length, salidas.length - 1)];
      entradas.push(entrada);
      await alLlamar?.();
      return { salida: salida as ResultadoDesgloseModelo["salida"], usage: USO, latenciaMs: 7, modelo: "modelo-simulado", promptVersion: PROMPT_VERSION_DESGLOSE };
    },
  };
}

// Lo mismo para los ajustes.
function modeloAjustes(salidas: unknown[] = [{ ajustes: [] }], alLlamar?: () => void | Promise<void>): DepsAjustes & { llamadas: () => number; entradas: EntradaAjustesModelo[] } {
  const entradas: EntradaAjustesModelo[] = [];
  return {
    entradas,
    llamadas: () => entradas.length,
    proponerAjustes: async (entrada): Promise<ResultadoAjustesModelo> => {
      const salida = salidas[Math.min(entradas.length, salidas.length - 1)];
      entradas.push(entrada);
      await alLlamar?.();
      return { salida: salida as ResultadoAjustesModelo["salida"], usage: USO, latenciaMs: 7, modelo: "modelo-simulado", promptVersion: PROMPT_VERSION_DESGLOSE_AJUSTES };
    },
  };
}

const ajuste = (pasoRef: string, p: PasoPropuesto, tipo: "cambiar" | "agregar_antes" = "cambiar") => ({ tipo, pasoRef, paso: p, motivo: "Este paso dice qué revisar." });

function modeloQueFallaAjustes(mensaje: string): DepsAjustes & { llamadas: () => number } {
  let llamadas = 0;
  return {
    llamadas: () => llamadas,
    proponerAjustes: async () => {
      llamadas++;
      throw new Error(mensaje);
    },
  };
}

function modeloQueFalla(mensaje: string): DepsDesglose & { llamadas: () => number } {
  let llamadas = 0;
  return {
    llamadas: () => llamadas,
    proponer: async () => {
      llamadas++;
      throw new Error(mensaje);
    },
  };
}

// ---------------------------------------------------------------------------
// Preparación y limpieza (como owner)
// ---------------------------------------------------------------------------

async function limpiar() {
  await sql`delete from app.audit_log where engagement_id = any(${TODOS_ENG}::uuid[])`;
  // Una corrida interrumpida puede dejar filas sin acompañamiento (on delete set null). Solo de estas cuentas sintéticas.
  await sql`delete from app.audit_log where engagement_id is null and user_id = any(${[...Object.values(PERSONAS), COACH_AJENO]}::uuid[])`;
  // tabla viene de la constante, nunca de una entrada.
  for (const tabla of TABLAS_PURGA) {
    await sql.unsafe(`delete from app.${tabla} where ${columnaDe(tabla)} = any($1::uuid[])`, [TODOS_ENG]);
  }
  await sql`delete from app.consent_events where engagement_id = any(${TODOS_ENG}::uuid[])`;
  await sql`delete from app.engagements where id = any(${TODOS_ENG}::uuid[])`;
  const usuarios = [...Object.values(PERSONAS), COACH_AJENO];
  await sql`delete from app.users where id = any(${usuarios}::uuid[])`;
  await sql`delete from auth.users where id = any(${usuarios}::uuid[])`;
}

async function crearUsuario(id: string, email: string, rol: "coach" | "persona", nombre: string) {
  await sql`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated', ${email}, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '')`;
  await sql`insert into app.users (id, org_id, role, nombre_pila) values (${id}, ${ORG}, ${rol}, ${nombre})`;
}

async function retirar(engagementId: string, personaId: string) {
  await sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${engagementId}, ${personaId}, 'retirado', ${AVISO_VERSION})`;
}
async function otorgar(engagementId: string, personaId: string) {
  await sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${engagementId}, ${personaId}, 'otorgado', ${AVISO_VERSION})`;
}

async function crearEngagement(id: string, personaId: string) {
  await sql`
    insert into app.engagements (id, org_id, type, stage, coach_id, persona_id, diagnostico_verificado, cedula_profesional, diagnostico_verificado_por, diagnostico_verificado_en)
    values (${id}, ${ORG}, 'workplace_support', 'seguimiento', ${COACH}, ${personaId}, true, ${CEDULA}, ${COACH}, now())`;
  await otorgar(id, personaId);
}

const TODOS_DOMINIOS = DOMINIOS_FE.map((d) => d.id);

// Perfil aprobado: un snapshot con citas, señales y los 9 dominios. Devuelve el id del snapshot.
async function sembrarPerfil(engagementId: string, version = 1): Promise<string> {
  const [s] = await sql`insert into app.sessions (engagement_id, coach_id, nota_original) values (${engagementId}, ${COACH}, ${`Nota con ${CITA_PERFIL}.`}) returning id`;
  const sessionId = s.id as string;
  const [e] = await sql`
    insert into app.profile_events (engagement_id, session_id, tipo, status, payload, created_by, decided_by, decided_at)
    values (${engagementId}, ${sessionId}, 'propuesta_ia', 'approved',
      ${sql.json({ tipo: "propuesta_ia", update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] }, descartados: [], banderas: [], indiceObservaciones: [] })},
      ${COACH}, ${COACH}, now()) returning id`;
  const evidencia = [{ id: randomUUID(), cita: CITA_PERFIL, sessionId }];
  const perfil = {
    dimensiones: {
      forma_aprender: { resumen: RESUMEN_FORTALEZA, tipo: "fortaleza", dominiosFE: TODOS_DOMINIOS, evidencia },
      concentracion: { resumen: RESUMEN_INICIO, tipo: "area_de_apoyo", dominiosFE: ["iniciacion"], evidencia },
      antecedentes_experiencia: { resumen: RESUMEN_CONTEXTO, tipo: "contexto", dominiosFE: [], evidencia },
    },
    senalesActivas: [{ tipo: "cambio_de_vida", descripcion: "Una señal sintética.", evidencia: [{ cita: CITA_SENAL, sessionId }] }],
  };
  const [snap] = await sql`
    insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
    values (${engagementId}, ${version}, ${sql.json(perfil)}, ${e.id as string}, ${COACH}) returning id`;
  return snap.id as string;
}

// Plan aprobado: un punto para la persona, que entra a la lista, y uno solo para el coach, que no entra (R-010.5).
async function sembrarPlan(engagementId: string, snapshotId: string) {
  const [plan] = await sql`
    insert into app.plans (engagement_id, titulo, status, version, profile_snapshot_id, created_by, approved_by, approved_at)
    values (${engagementId}, 'Plan sintético', 'aprobado', 1, ${snapshotId}, ${COACH}, ${COACH}, now()) returning id`;
  const [item] = await sql`
    insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, texto_persona, evidencia, orden)
    values (${plan.id as string}, ${engagementId}, 'objetivo', ${DESC_OBJETIVO}, ${TEXTO_OBJETIVO}, ${sql.json([])}, 0) returning id`;
  await sql`
    insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, evidencia, orden)
    values (${plan.id as string}, ${engagementId}, 'instruccion', ${DESC_INSTRUCCION}, ${sql.json([])}, 1)`;
  await sql`
    insert into app.persona_plans (plan_id, engagement_id, version, contenido)
    values (${plan.id as string}, ${engagementId}, 1, ${sql.json({ items: [{ planItemId: item.id as string, tipo: "objetivo", texto: TEXTO_OBJETIVO, orden: 0, itemsAnteriores: [] }] })})`;
}

let snapshotPrincipal = "";

async function preparar() {
  await limpiar();
  await crearUsuario(COACH_AJENO, "coach-ajeno-dc@caja-mex.test", "coach", "Coach Ajeno");
  await crearUsuario(PERSONAS.principal, "persona-dc@caja-mex.test", "persona", NOMBRE);
  await crearUsuario(PERSONAS.sinPerfil, "persona-sin-perfil-dc@caja-mex.test", "persona", "Noa");
  await crearUsuario(PERSONAS.ajena, "persona-ajena-dc@caja-mex.test", "persona", "Ale");
  for (const clave of ["principal", "sinPerfil", "ajena"] as const) await crearEngagement(ENG[clave], PERSONAS[clave]);
  snapshotPrincipal = await sembrarPerfil(ENG.principal);
  await sembrarPlan(ENG.principal, snapshotPrincipal);
  await sembrarPerfil(ENG.ajena);
}

// Vuelve al punto de partida: sin desgloses, marcas ni llamadas.
async function reiniciar(engagementId: string = ENG.principal) {
  await sql`delete from app.task_step_events where engagement_id = ${engagementId}`;
  await sql`delete from app.task_breakdowns where engagement_id = ${engagementId}`;
  await sql`delete from app.audit_log where engagement_id = ${engagementId}`;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

class Falla extends Error {}

function revisar(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new Falla(mensaje);
}

const cuerpo = (r: RespuestaRuta) => r.cuerpo as { error?: string; breakdownId?: string; marcaId?: number; resultado?: string };

function esperar(r: RespuestaRuta, status: number, que: string) {
  revisar(r.status === status, `${que}: se esperaba ${status} y llegó ${r.status} (${cuerpo(r).error ?? "sin error"})`);
}

function esperarError(r: RespuestaRuta, status: number, texto: string, que: string) {
  esperar(r, status, que);
  revisar(cuerpo(r).error === texto, `${que}: el texto no es el de la spec: ${cuerpo(r).error}`);
}

async function contar(tabla: string, engagementId: string = ENG.principal): Promise<number> {
  const [r] = await sql.unsafe(`select count(*)::int as n from app.${tabla} where engagement_id = $1`, [engagementId]);
  return r.n as number;
}

type FilaAuditoria = { accion: string; ok: boolean; error: string | null; prompt_version: string | null; model: string | null; modelo: string | null };

// Una fila por llamada al modelo (R-010.47). La reserva del cupo es aparte y tiene su propio caso (R-010.48).
const filasAuditoria = async (engagementId: string = ENG.principal) =>
  (await sql`select * from app.audit_log where engagement_id = ${engagementId} and accion <> ${ACCION_RESERVA_DESGLOSE} order by id`) as unknown as FilaAuditoria[];
const contarReservas = async (engagementId: string = ENG.principal) => {
  const [r] = await sql`select count(*)::int as n from app.audit_log where engagement_id = ${engagementId} and accion = ${ACCION_RESERVA_DESGLOSE}`;
  return r.n as number;
};

async function sinFilasNuevas(que: string, engagementId: string = ENG.principal) {
  revisar((await contar("task_breakdowns", engagementId)) === 0, `${que}: hay filas en task_breakdowns`);
  revisar((await contar("audit_log", engagementId)) === 0, `${que}: hay filas en audit_log`);
}

type FilaDesglose = {
  id: string;
  generado_desde: string;
  prompt_version: string;
  model: string;
  pasos: PasoDesglose[];
  descartados: unknown[];
  creado_por: string;
  contexto: unknown;
  tarea_original: string;
  plantilla_id: string | null;
  origen_breakdown_id: string | null;
  ajustes: AjusteGuardado[] | null;
  ajustes_aceptados: string[] | null;
  ajustes_decididos_en: Date | null;
  archivado_en: Date | null;
  archivado_por: string | null;
};

async function filaDesglose(id: string): Promise<FilaDesglose> {
  const [f] = await sql`select * from app.task_breakdowns where id = ${id}`;
  return f as unknown as FilaDesglose;
}

// Pide un desglose bueno y devuelve su fila.
async function desgloseListo(user: UsuarioDesglose = persona): Promise<FilaDesglose> {
  const r = await pedirDesglose(user, ENG.principal, PEDIDO, modelo());
  esperar(r, 201, "pedir el desglose de la prueba");
  return filaDesglose(cuerpo(r).breakdownId!);
}

// Marca pasos de una fila como "Me atoré aquí".
async function atorar(d: FilaDesglose, indices: number[], texto?: string) {
  for (const i of indices) esperar(await marcarPaso(persona, d.id, d.pasos[i]!.id, texto ? { estado: "atorado", texto } : { estado: "atorado" }), 201, "marcar atorado");
}

// Repite con un modelo simulado que propone estos ajustes y devuelve la copia.
async function copiaConAjustes(d: FilaDesglose, ajustes: unknown[]): Promise<FilaDesglose> {
  const r = await repetirDesglose(persona, d.id, {}, modeloAjustes([{ ajustes }]));
  esperar(r, 201, "repetir");
  return filaDesglose(cuerpo(r).breakdownId!);
}

const sinIds = (pasos: readonly PasoDesglose[]) => pasos.map((p) => ({ ...p, id: "" }));

type FilaPlantilla = {
  id: string;
  org_id: string;
  origen_engagement_id: string;
  puesto: string;
  titulo: string;
  tarea: string;
  pasos: { id: string; accion: string; criterioTerminado: string }[];
  creada_por: string;
  archivada_por: string | null;
  archivada_en: Date | null;
};

const plantillasDe = async (engagementId: string) =>
  (await sql`select * from app.task_templates where origen_engagement_id = ${engagementId} order by created_at`) as unknown as FilaPlantilla[];

// Sin plantillas ni desgloses en los dos acompañamientos que usan estos casos.
async function reiniciarPlantillas() {
  await reiniciar(ENG.principal);
  await reiniciar(ENG.ajena);
  await sql`delete from app.task_templates where origen_engagement_id = any(${TODOS_ENG}::uuid[])`;
}

// Lo que manda el formulario al guardar: pasos sin nada de lo que la plantilla no guarda.
const cuerpoPlantilla = (breakdownId: string) => ({
  breakdownId,
  puesto: "Gestión documental",
  titulo: "Reporte mensual",
  tarea: TAREA,
  pasos: [
    { accion: "Abre un documento en blanco", criterioTerminado: "El documento está abierto en tu pantalla." },
    { accion: "Escribe el título del reporte", criterioTerminado: "El archivo tiene título y se guardó en la carpeta." },
  ],
});

// Una plantilla de ENG.principal, guardada por la ruta. Devuelve su id.
async function plantillaLista(): Promise<string> {
  const d = await desgloseListo();
  const r = await guardarPlantilla(coach, cuerpoPlantilla(d.id));
  esperar(r, 201, "guardar la plantilla de la prueba");
  return (r.cuerpo as { plantillaId: string }).plantillaId;
}

// Las filas de una tabla tal como están, para comparar antes y después.
async function fotografia(tabla: string, engagementId: string, columna = "engagement_id"): Promise<string> {
  const filas = await sql.unsafe(`select to_jsonb(t) as fila from app.${tabla} t where ${columna} = $1 order by (to_jsonb(t))::text`, [engagementId]);
  return JSON.stringify(filas.map((f) => f.fila as unknown));
}

async function sembrarAuditoria(n: number, datos: { userId: string; accion: string; creada?: string }) {
  for (let i = 0; i < n; i++) {
    await sql`insert into app.audit_log (user_id, engagement_id, accion, ok, created_at) values (${datos.userId}, ${ENG.principal}, ${datos.accion}, true, ${datos.creada ?? new Date().toISOString()}::timestamptz)`;
  }
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

function casos(): { id: string; descripcion: string; correr: () => Promise<void> }[] {
  return [
    {
      id: "CA-010.1",
      descripcion: "un cuerpo con una llave extra o con tarea de 1001 caracteres responde 400, sin modelo ni filas",
      correr: async () => {
        await reiniciar();
        const m = modelo();
        esperarError(await pedirDesglose(persona, ENG.principal, { tarea: TAREA, archivo: "reporte.pdf" }, m), 400, MENSAJES_DESGLOSE.invalido, "llave extra");
        esperarError(await pedirDesglose(persona, ENG.principal, { tarea: "x".repeat(1001) }, m), 400, MENSAJES_DESGLOSE.invalido, "tarea larga");
        esperarError(await pedirDesglose(persona, ENG.principal, { tarea: "ab" }, m), 400, MENSAJES_DESGLOSE.invalido, "tarea corta");
        esperarError(await pedirDesglose(persona, ENG.principal, { tarea: TAREA, contexto: { plazo: "x".repeat(201) } }, m), 400, MENSAJES_DESGLOSE.invalido, "contexto largo");
        esperarError(await pedirDesglose(persona, ENG.principal, null, m), 400, MENSAJES_DESGLOSE.invalido, "sin cuerpo");
        revisar(m.llamadas() === 0, "llamó al modelo");
        await sinFilasNuevas("400");
      },
    },
    {
      id: "CA-010.2",
      // El 403 de una invitación pendiente o vencida se prueba en el navegador: lib/desglose/ruta-persona.ts trae lib/persona/puerta.ts, que no carga en un script.
      descripcion: "otra persona o un coach ajeno reciben 404",
      correr: async () => {
        await reiniciar();
        const m = modelo();
        esperarError(await pedirDesglose(personaAjena, ENG.principal, PEDIDO, m), 404, MENSAJES_DESGLOSE.sinAcompanamiento, "otra persona");
        esperarError(await pedirDesglose(coachAjeno, ENG.principal, PEDIDO, m), 404, MENSAJES_DESGLOSE.sinAcompanamiento, "coach ajeno");
        revisar(m.llamadas() === 0, "llamó al modelo");
        await sinFilasNuevas("404");
      },
    },
    {
      id: "CA-010.3",
      descripcion: "sin consentimiento, sin perfil o con el límite lleno responde 409, 409 o 429, sin modelo ni filas",
      correr: async () => {
        await reiniciar();
        const m = modelo();
        await retirar(ENG.principal, PERSONAS.principal);
        try {
          esperarError(await pedirDesglose(persona, ENG.principal, PEDIDO, m), 409, TEXTOS_PERSONA.SIN_CONSENTIMIENTO, "persona sin consentimiento");
          esperar(await pedirDesglose(coach, ENG.principal, PEDIDO, m), 409, "coach sin consentimiento");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        await sinFilasNuevas("sin consentimiento");

        esperarError(await pedirDesglose(personaSinPerfil, ENG.sinPerfil, PEDIDO, m), 409, TEXTOS_PERSONA.PERFIL_NO_LISTO, "persona sin perfil");
        esperarError(await pedirDesglose(coach, ENG.sinPerfil, PEDIDO, m), 409, TEXTOS_COACH.perfilNoListo("Noa"), "coach sin perfil");
        await sinFilasNuevas("sin perfil", ENG.sinPerfil);

        await sembrarAuditoria(10, { userId: persona.id, accion: ACCION_RESERVA_DESGLOSE });
        const antes = await contar("audit_log");
        esperarError(await pedirDesglose(persona, ENG.principal, PEDIDO, m), 429, TEXTOS_PERSONA.LIMITE_ALCANZADO, "límite");
        revisar((await contar("audit_log")) === antes, "el 429 escribió en audit_log");
        revisar((await contar("task_breakdowns")) === 0, "el 429 guardó");
        revisar(m.llamadas() === 0, "llamó al modelo");
      },
    },
    {
      id: "CA-010.5",
      descripcion: "al modelo solo le llegan la tarea, su contexto y los apoyos: sin citas, señales, cédula, puntos del coach ni dominios",
      correr: async () => {
        await reiniciar();
        const m = modelo();
        esperar(await pedirDesglose(persona, ENG.principal, { tarea: TAREA, contexto: { herramienta: "su hoja de pendientes" } }, m), 201, "pedir");
        const mensaje = mensajeUsuarioDesglose(m.entradas[0]!);
        revisar(mensaje.includes(TAREA) && mensaje.includes("su hoja de pendientes"), "no llegó lo que escribió");
        revisar(mensaje.includes(RESUMEN_INICIO) && mensaje.includes(RESUMEN_FORTALEZA) && mensaje.includes(TEXTO_OBJETIVO), "no llegaron los apoyos");
        revisar(mensaje.includes('"iniciar"'), "no llegó la adaptación");
        revisar(!mensaje.includes(RESUMEN_CONTEXTO), "llegó una dimensión de contexto");
        for (const t of [...CENTINELAS_INTERNOS, ...Object.values(PERSONAS)]) revisar(!mensaje.includes(t), `llegó ${t}`);
        for (const d of DOMINIOS_FE) revisar(!mensaje.includes(d.id) && !normalizar(mensaje).includes(normalizar(d.etiqueta)), `llegó ${d.id}`);
        for (const s of SENALES) revisar(!mensaje.includes(s.id) && !normalizar(mensaje).includes(normalizar(s.etiqueta)), `llegó ${s.id}`);
      },
    },
    {
      id: "CA-010.8",
      descripcion: "un paso sin criterio o con una llave extra responde 502, sin reintento y sin guardar",
      correr: async () => {
        for (const [que, salida] of [
          ["sin criterio", { pasos: [{ accion: "Abre un documento", notaApoyo: null, apoyoRef: null, minutos: null }] }],
          ["llave extra", { pasos: [{ ...PASO_INICIO, porQue: "porque sí" }] }],
          ["sin pasos", { pasos: [] }],
          ["16 pasos", { pasos: Array.from({ length: 16 }, () => PASO_INICIO) }],
        ] as const) {
          await reiniciar();
          const m = modelo([salida, SALIDA_BUENA]);
          esperarError(await pedirDesglose(persona, ENG.principal, PEDIDO, m), 502, TEXTOS_PERSONA.ERROR_PREPARAR, que);
          revisar(m.llamadas() === 1, `${que}: una salida fuera del esquema no se reintenta`);
          revisar((await contar("task_breakdowns")) === 0, `${que}: guardó`);
          const [fila] = await filasAuditoria();
          revisar(fila?.ok === false && fila.error === "esquema", `${que}: audit_log no lo dice`);
        }

        // Con el modelo real, una salida fuera del esquema la lanza el SDK. Queda igual, con sus tokens (R-010.47).
        await reiniciar();
        const fueraDeEsquema = new NoObjectGeneratedError({ message: "No object generated", text: "{}", response: { id: "r", timestamp: new Date(), modelId: "modelo-simulado" }, usage: { inputTokens: 11, outputTokens: 7 } as never, finishReason: "stop" });
        const sdk: DepsDesglose = { proponer: async () => { throw fueraDeEsquema; } };
        esperarError(await pedirDesglose(persona, ENG.principal, PEDIDO, sdk), 502, TEXTOS_PERSONA.ERROR_PREPARAR, "el SDK lanza");
        const [delSdk] = (await filasAuditoria()) as unknown as (FilaAuditoria & { tokens_entrada: number | null })[];
        revisar(delSdk?.ok === false && delSdk.error === "esquema", `el SDK: audit_log dice ${delSdk?.error}`);
        revisar(delSdk?.tokens_entrada === 11, `el SDK: tokens ${delSdk?.tokens_entrada}`);
        revisar((await contar("task_breakdowns")) === 0, "el SDK: guardó");
      },
    },
    {
      id: "CA-010.9",
      descripcion: "la fila guarda el último snapshot, un id UUID único por paso, la versión del prompt y el modelo",
      correr: async () => {
        await reiniciar();
        const segundo = await sembrarPerfil(ENG.principal, 2);
        try {
          const fila = await desgloseListo();
          revisar(fila.generado_desde === segundo, "generado_desde no es el último snapshot");
          revisar(fila.prompt_version === PROMPT_VERSION_DESGLOSE, "prompt_version");
          revisar(fila.model === "modelo-simulado", "model");
          revisar(fila.creado_por === persona.id, "creado_por");
          const ids = fila.pasos.map((p) => p.id);
          revisar(new Set(ids).size === ids.length && ids.length === 3, "los ids no son únicos");
          // porQue lo arma el código, con la etiqueta de la persona (R-010.21).
          revisar(fila.pasos[1]!.porQue === `Tu perfil dice esto en "Concentración": ${RESUMEN_INICIO}`, `porQue: ${fila.pasos[1]!.porQue}`);
          revisar(fila.pasos[2]!.porQue === `Tu plan dice: ${TEXTO_OBJETIVO}`, `porQue del plan: ${fila.pasos[2]!.porQue}`);
          revisar(fila.pasos[0]!.notaApoyo === null && fila.pasos[0]!.origen === null, "el paso sin nota trae origen");
          const [auditoria] = await filasAuditoria();
          revisar(auditoria?.accion === ACCION_DESGLOSE && auditoria.ok === true && auditoria.prompt_version === PROMPT_VERSION_DESGLOSE, "audit_log");
        } finally {
          await sql`delete from app.task_breakdowns where engagement_id = ${ENG.principal}`;
          await sql`delete from app.profile_snapshots where id = ${segundo}`;
        }
      },
    },
    {
      id: "CA-010.10",
      descripcion: "generar, marcar y archivar no cambian perfil, plan, señales ni etapa",
      correr: async () => {
        await reiniciar();
        const tablas = ["profile_snapshots", "persona_profiles", "plans", "plan_items", "signal_states", "strong_alerts", "profile_events", "sessions"];
        const fotos = async () => {
          const partes: string[] = [];
          for (const t of tablas) partes.push(await fotografia(t, ENG.principal));
          partes.push(await fotografia("engagements", ENG.principal, "id"));
          return partes.join("|");
        };
        const antes = await fotos();
        const fila = await desgloseListo();
        esperar(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "atorado", texto: "No encontré el archivo." }), 201, "marcar");
        esperar(await archivarDesglose(persona, fila.id, { accion: "archivar" }), 200, "archivar");
        revisar((await fotos()) === antes, "cambió algo del perfil, el plan o la etapa");
      },
    },
    {
      id: "CA-010.11",
      descripcion: "lo que prepara el coach le aparece a la persona, marcado y sin el nombre del coach; lo suyo no lleva esa marca, y sin perfil no hay formulario",
      correr: async () => {
        await reiniciar();
        const delCoach = await desgloseListo(coach);
        const suya = await desgloseListo(persona);
        const lista = await withRls(persona.claims, (tx) => leerTareasPersona(tx, ENG.principal, persona.id));
        revisar(lista.length === 2, `la lista tiene ${lista.length} tareas`);
        revisar(lista.find((t) => t.id === delCoach.id)?.laPreparoSuCoach === true, "no dice que la preparó su coach");
        revisar(lista.find((t) => t.id === suya.id)?.laPreparoSuCoach === false, "dice que la preparó su coach");
        const [{ nombre_pila: nombreCoach }] = await sql`select nombre_pila from app.users where id = ${COACH}`;
        const detalle = await withRls(persona.claims, (tx) => leerTareaPersona(tx, ENG.principal, delCoach.id, persona.id));
        revisar(detalle && !detalle.archivada && detalle.laPreparoSuCoach, "el detalle no lo dice");
        const json = JSON.stringify({ lista, detalle });
        revisar(!json.includes(COACH) && !json.includes(nombreCoach as string), "llegó el coach a la pantalla de la persona");

        const delCoachEnSuLista = await withRls(coach.claims, (tx) => leerTareasCoach(tx, ENG.principal, persona.id));
        revisar(delCoachEnSuLista.find((t) => t.id === delCoach.id)?.laPidioLaPersona === false, "el coach no ve que la preparó");
        revisar(delCoachEnSuLista.find((t) => t.id === suya.id)?.laPidioLaPersona === true, "el coach no ve que la pidió la persona");

        revisar(await withRls(persona.claims, (tx) => hayPerfilParaDesglose(tx, ENG.principal)), "dice que no hay perfil");
        revisar(!(await withRls(personaSinPerfil.claims, (tx) => hayPerfilParaDesglose(tx, ENG.sinPerfil))), "dice que hay perfil");
      },
    },
    {
      id: "CA-010.18",
      descripcion: "con problemas hay una sola llamada más, con los códigos y sin texto; si falla dos veces, 502 y sin fila",
      correr: async () => {
        await reiniciar();
        const m = modelo([SALIDA_DOS_ACCIONES, SALIDA_BUENA]);
        const bien = await pedirDesglose(persona, ENG.principal, PEDIDO, m);
        esperar(bien, 201, "reintento bueno");
        revisar(m.llamadas() === 2, "no hubo dos llamadas");
        revisar(m.entradas[0]!.problemas === undefined, "la primera llamada trae problemas");
        const segundo = mensajeUsuarioDesglose(m.entradas[1]!);
        revisar(segundo.includes("- Paso 2: accion_multiple"), "el reintento no trae el código");
        revisar(!segundo.includes("escribe el título"), "el reintento repite el texto del paso");
        const filas = await filasAuditoria();
        revisar(filas.length === 2, `audit_log tiene ${filas.length} filas`);
        revisar(filas[0]!.accion === ACCION_DESGLOSE && filas[0]!.ok === false && filas[0]!.error === "validacion: accion_multiple", `primera fila: ${filas[0]!.accion} ${filas[0]!.error}`);
        revisar(filas[1]!.accion === `${ACCION_DESGLOSE}${SUFIJO_REINTENTO}` && filas[1]!.ok === true, `segunda fila: ${filas[1]!.accion}`);
        const guardado = await filaDesglose(cuerpo(bien).breakdownId!);
        revisar(guardado.pasos.length === SALIDA_BUENA.pasos.length, "no guardó el válido");

        await reiniciar();
        const m2 = modelo([SALIDA_DOS_ACCIONES]);
        esperarError(await pedirDesglose(persona, ENG.principal, PEDIDO, m2), 502, TEXTOS_PERSONA.ERROR_PREPARAR, "dos fallas");
        revisar(m2.llamadas() === 2, "no fueron dos llamadas");
        revisar((await contar("task_breakdowns")) === 0, "guardó");
        const filas2 = await filasAuditoria();
        revisar(filas2.length === 2 && filas2.every((f) => f.ok === false), "audit_log de dos fallas");
      },
    },
    {
      id: "CA-010.24",
      descripcion: "lo guardado de un perfil con los 9 dominios no trae dominios, señales, adaptaciones ni citas",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        const json = JSON.stringify(fila.pasos);
        const comparable = normalizar(json);
        for (const d of DOMINIOS_FE) revisar(!json.includes(d.id) && !comparable.includes(normalizar(d.etiqueta)), `aparece ${d.id}`);
        for (const s of SENALES) revisar(!json.includes(s.id) && !comparable.includes(normalizar(s.etiqueta)), `aparece ${s.id}`);
        for (const a of ["iniciar", "ordenar", "estimar", "cambiar_de_tarea"]) revisar(!json.includes(`"${a}"`), `aparece ${a}`);
        for (const t of CENTINELAS_INTERNOS) revisar(!json.includes(t), `aparece ${t}`);
        revisar(fila.pasos[1]!.origen?.tipo === "dimension" && fila.pasos[1]!.origen.dimension === "concentracion", "el origen no es solo un id");

        // También dentro de un texto: una nota que nombra lo que el modelo recibe se quita, y el paso se queda.
        await reiniciar();
        const nota = "Esto sale de A-02: es tu adaptación cambiar_de_tarea (apoyo_fe).";
        const conLlaves = await pedirDesglose(persona, ENG.principal, PEDIDO, modelo([{ pasos: [PASO_INICIO, paso("Escribe el título del reporte", { notaApoyo: nota, apoyoRef: "A-02" }), SALIDA_BUENA.pasos[2]!] }]));
        esperar(conLlaves, 201, "con una nota con llaves");
        const guardada = await filaDesglose(cuerpo(conLlaves).breakdownId!);
        const texto = JSON.stringify(guardada.pasos);
        for (const llave of ["cambiar_de_tarea", "apoyo_fe", "A-02"]) revisar(!texto.includes(llave), `aparece ${llave} en un texto`);
        revisar(guardada.pasos.length === 3 && guardada.pasos[1]!.notaApoyo === null, "no quitó solo la nota");

        // En una acción provoca el reintento.
        await reiniciar();
        const m = modelo([{ pasos: [PASO_INICIO, paso("Es tu adaptación cambiar_de_tarea")] }, SALIDA_BUENA]);
        esperar(await pedirDesglose(persona, ENG.principal, PEDIDO, m), 201, "reintento por una llave");
        revisar(m.llamadas() === 2, "no reintentó");
      },
    },
    {
      id: "CA-010.26",
      descripcion: "la persona dueña marca un paso de su desglose, también uno que preparó su coach; ni el coach ni otra persona pueden",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo(coach);
        revisar(fila.creado_por === COACH, "no lo preparó el coach");
        const pasoId = fila.pasos[0]!.id;
        const r = await marcarPaso(persona, fila.id, pasoId, { estado: "hecho" });
        esperar(r, 201, "la dueña");
        revisar(typeof cuerpo(r).marcaId === "number", "no responde el id de la marca");
        revisar((await contar("task_step_events")) === 1, "no hay una fila");

        esperar(await marcarPaso(coach, fila.id, pasoId, { estado: "hecho" }), 404, "su coach");
        esperar(await marcarPaso(personaAjena, fila.id, pasoId, { estado: "hecho" }), 404, "otra persona");
        esperarError(await marcarPaso(persona, fila.id, randomUUID(), { estado: "hecho" }), 404, MENSAJES_MARCAS.sinPaso, "un paso de otro lado");
        esperarError(await marcarPaso(persona, randomUUID(), pasoId, { estado: "hecho" }), 404, MENSAJES_MARCAS.sinTarea, "otro desglose");
        revisar((await contar("task_step_events")) === 1, "se escribió una marca de más");
      },
    },
    {
      id: "CA-010.27",
      descripcion: "una marca hecha y luego deshecha deja las dos filas, y la más reciente es la de id más alto",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        const pasoId = fila.pasos[1]!.id;
        const a = await marcarPaso(persona, fila.id, pasoId, { estado: "hecho" });
        const b = await marcarPaso(persona, fila.id, pasoId, { estado: "pendiente" });
        esperar(a, 201, "hecho");
        esperar(b, 201, "pendiente");
        revisar(cuerpo(b).marcaId! > cuerpo(a).marcaId!, "los ids no crecen");
        const filas = await sql`select estado from app.task_step_events where breakdown_id = ${fila.id} and paso_id = ${pasoId} order by id`;
        revisar(filas.map((f) => f.estado).join() === "hecho,pendiente", "las dos filas no siguen");
      },
    },
    {
      id: "CA-010.28",
      descripcion: "\"Me atoré aquí\" guarda el texto tal cual, o nulo si viene vacío; otro estado no acepta texto",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        const texto = "No encontré dónde está la plantilla del reporte";
        esperar(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "atorado", texto }), 201, "con texto");
        esperar(await marcarPaso(persona, fila.id, fila.pasos[1]!.id, { estado: "atorado", texto: "   " }), 201, "vacío");
        esperar(await marcarPaso(persona, fila.id, fila.pasos[2]!.id, { estado: "atorado" }), 201, "sin campo");
        const filas = await sql`select texto from app.task_step_events where breakdown_id = ${fila.id} order by id`;
        revisar(filas[0]!.texto === texto && filas[1]!.texto === null && filas[2]!.texto === null, "el texto guardado no es el esperado");

        esperarError(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "hecho", texto }), 400, MENSAJES_MARCAS.marcaInvalida, "hecho con texto");
        esperarError(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "atorado", texto: "x".repeat(1001) }), 400, MENSAJES_MARCAS.marcaInvalida, "texto largo");
        esperarError(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "otro" }), 400, MENSAJES_MARCAS.marcaInvalida, "otro estado");
        revisar((await contar("task_step_events")) === 3, "un 400 escribió");
      },
    },
    {
      id: "CA-010.29",
      descripcion: "\"Ya no la uso\": la persona o su coach; no se borra, no acepta marcas y solo una vez",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        esperarError(await archivarDesglose(persona, fila.id, { accion: "otra" }), 400, MENSAJES_MARCAS.archivarInvalido, "cuerpo inválido");
        esperarError(await archivarDesglose(coachAjeno, fila.id, { accion: "archivar" }), 404, MENSAJES_MARCAS.sinTarea, "coach ajeno");
        esperarError(await archivarDesglose(personaAjena, fila.id, { accion: "archivar" }), 404, MENSAJES_MARCAS.sinTarea, "otra persona");
        esperar(await archivarDesglose(persona, fila.id, { accion: "archivar" }), 200, "la persona");
        const archivado = await filaDesglose(fila.id);
        revisar(archivado.archivado_por === persona.id && archivado.archivado_en !== null, "no quedó quién y cuándo");
        revisar(JSON.stringify(archivado.pasos) === JSON.stringify(fila.pasos), "cambió los pasos");
        esperarError(await archivarDesglose(persona, fila.id, { accion: "archivar" }), 409, MENSAJES_MARCAS.yaNoDisponible, "dos veces");
        esperarError(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "hecho" }), 409, MENSAJES_MARCAS.yaNoDisponible, "marcar uno archivado");

        const otro = await desgloseListo();
        esperar(await archivarDesglose(coach, otro.id, { accion: "archivar" }), 200, "su coach");
        revisar((await filaDesglose(otro.id)).archivado_por === COACH, "archivado_por del coach");
      },
    },
    {
      id: "CA-010.29b",
      descripcion: "lo archivado sale de la lista de la persona, su pantalla lo dice y el coach lo sigue leyendo",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        esperar(await archivarDesglose(persona, fila.id, { accion: "archivar" }), 200, "archivar");
        const lista = await withRls(persona.claims, (tx) => leerTareasPersona(tx, ENG.principal, persona.id));
        revisar(lista.length === 0, "sigue en su lista");
        const detalle = await withRls(persona.claims, (tx) => leerTareaPersona(tx, ENG.principal, fila.id, persona.id));
        revisar(detalle?.archivada === true, "su detalle no lo dice");
        revisar(!("pasos" in detalle), "su detalle trae los pasos");
        const delCoach = await withRls(coach.claims, (tx) => leerTareasCoach(tx, ENG.principal, persona.id));
        revisar(delCoach[0]?.id === fila.id && delCoach[0].archivadaEn !== null, "el coach no lo ve archivado");
        const detalleCoach = await withRls(coach.claims, (tx) => leerTareaCoach(tx, ENG.principal, fila.id, persona.id));
        revisar(detalleCoach?.archivadaEn !== null && detalleCoach?.pasos.length === 3, "el coach no lo lee");
      },
    },
    {
      id: "CA-010.24b",
      descripcion: "la pantalla de la persona no recibe origen ni quién revisó; otra persona no lee la tarea, y un coach ajeno tampoco",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        const texto = "No encontré la plantilla.";
        const marca = await marcarPaso(persona, fila.id, fila.pasos[1]!.id, { estado: "atorado", texto });
        esperar(marca, 201, "marcar");
        esperar(await revisarMarca(coach, cuerpo(marca).marcaId!, { accion: "revisar" }), 200, "revisar");

        const detalle = await withRls(persona.claims, (tx) => leerTareaPersona(tx, ENG.principal, fila.id, persona.id));
        revisar(detalle && !detalle.archivada, "no leyó la tarea");
        const json = JSON.stringify(detalle);
        revisar(!json.includes('"origen"') && !json.includes("concentracion") && !json.includes(COACH) && !json.includes("revisadoPor") && !json.includes("descartados"), `trae algo que no le toca: ${json.slice(0, 200)}`);
        for (const d of DOMINIOS_FE) revisar(!json.includes(d.id), `aparece ${d.id}`);
        for (const t of CENTINELAS_INTERNOS) revisar(!json.includes(t), `aparece ${t}`);
        const paso = detalle.pasos[1]!;
        revisar(paso.paso.porQue?.startsWith('Tu perfil dice esto en "Concentración"'), "no llegó el porQue");
        revisar(paso.estado === "atorado" && paso.atorados[0]?.texto === texto && paso.atorados[0].revisadoEn !== null, "no ve lo que escribió ni que su coach ya lo leyó");

        revisar((await withRls(personaAjena.claims, (tx) => leerTareaPersona(tx, ENG.principal, fila.id, personaAjena.id))) === null, "otra persona lee la tarea");
        revisar((await withRls(personaAjena.claims, (tx) => leerTareasPersona(tx, ENG.principal, personaAjena.id))).length === 0, "otra persona lee la lista");
        revisar((await withRls(coachAjeno.claims, (tx) => leerTareaCoach(tx, ENG.principal, fila.id, persona.id))) === null, "un coach ajeno lee la tarea");
      },
    },
    {
      id: "CA-010.27b",
      descripcion: "en pantalla, sin marcas es pendiente, y con todos en hecho la pantalla dice que terminó; deshacer conserva lo que escribió",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        const leer = async () => {
          const d = await withRls(persona.claims, (tx) => leerTareaPersona(tx, ENG.principal, fila.id, persona.id));
          revisar(d && !d.archivada, "no leyó la tarea");
          return d;
        };
        revisar((await leer()).pasos.every((p) => p.estado === "pendiente" && p.hechoEn === null && p.atorados.length === 0), "no empieza en pendiente");
        const uno = fila.pasos[0]!.id;
        esperar(await marcarPaso(persona, fila.id, uno, { estado: "atorado", texto: "No lo encontré" }), 201, "atorado");
        esperar(await marcarPaso(persona, fila.id, uno, { estado: "pendiente" }), 201, "deshacer");
        const tras = (await leer()).pasos[0]!;
        revisar(tras.estado === "pendiente" && tras.atorados.length === 1 && tras.atorados[0]!.texto === "No lo encontré", "deshacer le oculta lo que escribió, y su coach lo sigue leyendo");
        for (const p of fila.pasos) esperar(await marcarPaso(persona, fila.id, p.id, { estado: "hecho" }), 201, "hecho");
        const final = await leer();
        revisar(final.terminada && final.pasos.every((p) => p.estado === "hecho" && p.hechoEn !== null), "no dice que terminó");
        revisar((await withRls(persona.claims, (tx) => leerTareasPersona(tx, ENG.principal, persona.id)))[0]?.terminada === true, "la lista no dice que terminó");
        await sql`update app.task_breakdowns set ajustes = ${sql.json([{ id: randomUUID(), tipo: "cambiar", pasoId: fila.pasos[0]!.id, paso: fila.pasos[0]!, motivo: "Este paso dice qué revisar." }])} where id = ${fila.id}`;
        revisar((await leer()).ajustesSinDecidir, "no dice que faltan ajustes por decidir");
      },
    },
    {
      id: "CA-010.30",
      descripcion: "el panel recibe el texto letra por letra, con la fecha, la tarea, el paso y su acción, de lo más viejo a lo más nuevo; y lo que hizo después",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        const texto = "No encontré dónde está la plantilla del reporte.\n  Y luego «otra cosa»  ";
        const guardado = texto.trim();
        const a = await marcarPaso(persona, fila.id, fila.pasos[2]!.id, { estado: "atorado", texto });
        const b = await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "atorado", texto: "Otra" });
        esperar(a, 201, "primera");
        esperar(b, 201, "segunda");
        let filas = await withRls(coach.claims, (tx) => leerAtorados(tx, ENG.principal));
        revisar(filas.map((f) => f.id).join() === `${cuerpo(a).marcaId},${cuerpo(b).marcaId}`, "no vienen en orden");
        const [primera] = filas;
        revisar(primera!.texto === guardado, `el texto cambió: ${primera!.texto}`);
        revisar(primera!.tarea === TAREA, "no trae la tarea");
        revisar(primera!.paso?.numero === 3 && primera!.paso.accion === fila.pasos[2]!.accion, "no trae el paso");
        revisar(primera!.creadoEn instanceof Date, "no trae la fecha");
        revisar(primera!.hechoDespuesEn === null, "dice que después lo hizo");

        // "Después lo marcó como hecho": solo si esa es su última marca.
        esperar(await marcarPaso(persona, fila.id, fila.pasos[2]!.id, { estado: "hecho" }), 201, "hecho");
        filas = await withRls(coach.claims, (tx) => leerAtorados(tx, ENG.principal));
        revisar(filas[0]!.hechoDespuesEn !== null, "no dice que después lo hizo");
        esperar(await marcarPaso(persona, fila.id, fila.pasos[2]!.id, { estado: "pendiente" }), 201, "deshacer");
        filas = await withRls(coach.claims, (tx) => leerAtorados(tx, ENG.principal));
        revisar(filas[0]!.hechoDespuesEn === null, "sigue diciendo que lo hizo");
        revisar(filas.length === 2, "un Deshacer le quita al coach lo que escribió");

        // Un coach ajeno no lo lee, y sin consentimiento nadie.
        revisar((await withRls(coachAjeno.claims, (tx) => leerAtorados(tx, ENG.principal))).length === 0, "un coach ajeno lo lee");
        await retirar(ENG.principal, PERSONAS.principal);
        try {
          revisar((await withRls(coach.claims, (tx) => leerAtorados(tx, ENG.principal))).length === 0, "se lee con el consentimiento retirado");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
      },
    },
    {
      id: "CA-010.31",
      descripcion: "tres marcas no cambian senales ni las tablas de señales y alertas, y van en su propio campo",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        const seguimiento = () => withRls(coach.claims, async (tx) => leerSeguimiento(tx, ENG.principal, (await leerUltimoSnapshot(tx, ENG.principal))?.perfil ?? null));
        const antes = await seguimiento();
        revisar(antes.senales.length > 0, "la prueba no estaría revisando nada");
        const tablas = ["signal_states", "strong_alerts", "profile_events", "followup_context"];
        const fotos = async () => {
          const partes: string[] = [];
          for (const t of tablas) partes.push(await fotografia(t, ENG.principal));
          return partes.join("|");
        };
        const fotoAntes = await fotos();
        const frase = "cambio de vida y riesgo de renuncia";
        for (const p of fila.pasos) esperar(await marcarPaso(persona, fila.id, p.id, { estado: "atorado", texto: frase }), 201, "marcar");
        const despues = await seguimiento();
        revisar(JSON.stringify(despues.senales) === JSON.stringify(antes.senales), "cambiaron las señales");
        revisar(JSON.stringify(despues.alertas) === JSON.stringify(antes.alertas), "cambiaron las alertas");
        revisar(JSON.stringify(despues.estadosSenal) === JSON.stringify(antes.estadosSenal), "cambiaron los estados de señal");
        revisar(!JSON.stringify({ ...despues, atorados: [] }).includes(frase), "el texto salió de su campo");
        revisar(despues.atorados.length === 3, "no vienen en su campo");
        revisar((await fotos()) === fotoAntes, "se escribió en señales, alertas, eventos o contexto");
      },
    },
    {
      id: "CA-010.32",
      descripcion: "sin texto, el panel recibe la marca con texto nulo",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        esperar(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "atorado" }), 201, "marcar");
        const [f] = await withRls(coach.claims, (tx) => leerAtorados(tx, ENG.principal));
        revisar(f?.texto === null, "trae texto");
      },
    },
    {
      id: "CA-010.33",
      descripcion: "\"Ya lo revisé\": sale del panel, sigue en el detalle con quién y cuándo, la persona lo ve; nadie más puede, y solo una vez",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        const marca = await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "atorado", texto: "Me perdí" });
        esperar(marca, 201, "marcar");
        const id = cuerpo(marca).marcaId!;
        const [antes] = await sql`select to_jsonb(t) - 'revisado_por' - 'revisado_en' as fila from app.task_step_events t where id = ${id}`;

        esperarError(await revisarMarca(coach, id, { accion: "otra" }), 400, MENSAJES_MARCAS.revisarInvalido, "cuerpo inválido");
        esperarError(await revisarMarca(coach, id, { accion: "revisar", texto: "x" }), 400, MENSAJES_MARCAS.revisarInvalido, "llave extra");
        esperarError(await revisarMarca(coachAjeno, id, { accion: "revisar" }), 404, MENSAJES_MARCAS.sinMarca, "coach ajeno");
        esperarError(await revisarMarca(persona, id, { accion: "revisar" }), 404, MENSAJES_MARCAS.sinMarca, "la persona");
        esperarError(await revisarMarca(personaAjena, id, { accion: "revisar" }), 404, MENSAJES_MARCAS.sinMarca, "otra persona");
        esperarError(await revisarMarca(coach, 9_000_000_000_000, { accion: "revisar" }), 404, MENSAJES_MARCAS.sinMarca, "una marca que no existe");
        const hecha = await marcarPaso(persona, fila.id, fila.pasos[1]!.id, { estado: "hecho" });
        esperarError(await revisarMarca(coach, cuerpo(hecha).marcaId!, { accion: "revisar" }), 404, MENSAJES_MARCAS.sinMarca, "una marca que no es atorado");
        await retirar(ENG.principal, PERSONAS.principal);
        try {
          esperarError(await revisarMarca(coach, id, { accion: "revisar" }), 404, MENSAJES_MARCAS.sinMarca, "sin consentimiento");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        revisar((await withRls(coach.claims, (tx) => leerAtorados(tx, ENG.principal))).length === 1, "alguien la revisó");

        const r = await revisarMarca(coach, id, { accion: "revisar" });
        esperar(r, 200, "revisar");
        revisar(cuerpo(r).marcaId === id, "no responde el id");
        revisar((await withRls(coach.claims, (tx) => leerAtorados(tx, ENG.principal))).length === 0, "sigue en el panel");
        const detalle = await withRls(coach.claims, (tx) => leerTareaCoach(tx, ENG.principal, fila.id, persona.id));
        const enDetalle = detalle?.pasos[0]?.marcas[0];
        const [{ nombre_pila: nombreCoach }] = await sql`select nombre_pila from app.users where id = ${COACH}`;
        revisar(enDetalle?.id === id && enDetalle.revisadaEn !== null && enDetalle.revisadaPor === nombreCoach, "el detalle no dice quién y cuándo");
        const dePersona = await withRls(persona.claims, (tx) => leerTareaPersona(tx, ENG.principal, fila.id, persona.id));
        revisar(dePersona && !dePersona.archivada && dePersona.pasos[0]!.atorados[0]!.revisadoEn !== null, "la persona no ve que su coach ya lo leyó");
        const [despues] = await sql`select to_jsonb(t) - 'revisado_por' - 'revisado_en' as fila from app.task_step_events t where id = ${id}`;
        revisar(JSON.stringify(despues!.fila) === JSON.stringify(antes!.fila), "cambió otra columna");
        esperarError(await revisarMarca(coach, id, { accion: "revisar" }), 409, MENSAJES_MARCAS.yaRevisada, "dos veces");
      },
    },
    {
      id: "CA-010.34",
      descripcion: "el detalle del coach trae todas las marcas de cada paso, en orden, con su fecha y su texto",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        const pasoId = fila.pasos[1]!.id;
        const ids: number[] = [];
        for (const pedido of [{ estado: "atorado", texto: "Primero esto" }, { estado: "pendiente" }, { estado: "atorado", texto: "Luego esto" }, { estado: "hecho" }]) {
          const r = await marcarPaso(persona, fila.id, pasoId, pedido);
          esperar(r, 201, "marcar");
          ids.push(cuerpo(r).marcaId!);
        }
        const detalle = await withRls(coach.claims, (tx) => leerTareaCoach(tx, ENG.principal, fila.id, persona.id));
        revisar(detalle?.pasos[0]?.marcas.length === 0, "un paso trae marcas de otro");
        const marcas = detalle!.pasos[1]!.marcas;
        revisar(marcas.map((m) => m.id).join() === ids.join(), "no vienen todas en orden");
        revisar(marcas.map((m) => m.estado).join() === "atorado,pendiente,atorado,hecho", "los estados no son");
        revisar(marcas[0]!.texto === "Primero esto" && marcas[2]!.texto === "Luego esto" && marcas[1]!.texto === null, "los textos no son");
        revisar(marcas.every((m) => m.creadaEn instanceof Date), "falta la fecha");
      },
    },
    {
      id: "CA-010.38",
      descripcion: "con ajustes sin decidir no se pueden marcar pasos",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        await sql`update app.task_breakdowns set ajustes = ${sql.json([{ id: randomUUID() }])} where id = ${fila.id}`;
        esperarError(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "hecho" }), 409, TEXTOS_PERSONA.DECIDE_AJUSTES, "marcar");
        revisar((await contar("task_step_events")) === 0, "se escribió la marca");
        await sql`update app.task_breakdowns set ajustes_decididos_en = now() where id = ${fila.id}`;
        esperar(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "hecho" }), 201, "ya decididos");
      },
    },
    {
      id: "CA-010.45",
      descripcion: "con el consentimiento retirado, marcar responde 409 y archivar 404, y al darlo otra vez funcionan",
      correr: async () => {
        await reiniciar();
        const fila = await desgloseListo();
        await retirar(ENG.principal, PERSONAS.principal);
        try {
          esperarError(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "hecho" }), 409, MENSAJES_MARCAS.sinConsentimiento, "marcar");
          esperarError(await archivarDesglose(persona, fila.id, { accion: "archivar" }), 404, MENSAJES_MARCAS.sinTarea, "archivar");
          esperarError(await archivarDesglose(coach, fila.id, { accion: "archivar" }), 404, MENSAJES_MARCAS.sinTarea, "archivar, coach");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        esperar(await marcarPaso(persona, fila.id, fila.pasos[0]!.id, { estado: "hecho" }), 201, "marcar otra vez");
        revisar((await filaDesglose(fila.id)).archivado_en === null, "se archivó sin consentimiento");
      },
    },
    {
      id: "CA-010.46",
      descripcion: "un retiro mientras responde el modelo da 409, sin fila en task_breakdowns y con fila en audit_log",
      correr: async () => {
        await reiniciar();
        const m = modelo([SALIDA_BUENA], () => retirar(ENG.principal, PERSONAS.principal));
        try {
          esperarError(await pedirDesglose(persona, ENG.principal, PEDIDO, m), 409, TEXTOS_PERSONA.RETIRO_DURANTE_LA_LLAMADA, "persona");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        revisar((await contar("task_breakdowns")) === 0, "guardó");
        const [fila] = await filasAuditoria();
        revisar(fila?.ok === true, "la llamada no quedó en audit_log");

        await reiniciar();
        const m2 = modelo([SALIDA_BUENA], () => retirar(ENG.principal, PERSONAS.principal));
        try {
          esperarError(await pedirDesglose(coach, ENG.principal, PEDIDO, m2), 409, TEXTOS_COACH.retiroDuranteLaLlamada(NOMBRE), "coach");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }

        // C-10: un retiro durante la primera llamada corta el reintento. No sale nada más al modelo.
        await reiniciar();
        const m3 = modelo([SALIDA_DOS_ACCIONES, SALIDA_BUENA], () => retirar(ENG.principal, PERSONAS.principal));
        try {
          esperarError(await pedirDesglose(persona, ENG.principal, PEDIDO, m3), 409, TEXTOS_PERSONA.RETIRO_DURANTE_LA_LLAMADA, "retiro antes del reintento");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        revisar(m3.llamadas() === 1, `hubo ${m3.llamadas()} llamadas con el consentimiento retirado`);
        revisar((await contar("task_breakdowns")) === 0, "guardó");
        const filas3 = await filasAuditoria();
        revisar(filas3.length === 1 && filas3[0]!.ok === false && filas3[0]!.error === "validacion: accion_multiple", "la llamada no quedó en audit_log");
      },
    },
    {
      id: "CA-010.47",
      descripcion: "una frase única de la tarea no aparece en audit_log ni en el log del servidor, también con error",
      correr: async () => {
        await reiniciar();
        const frase = "conciliar el fondo del tío Anselmo";
        const lineas: string[] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => void lineas.push(args.join(" "));
        try {
          esperar(await pedirDesglose(persona, ENG.principal, { tarea: frase }, modeloQueFalla(`el proveedor repitió ${frase}`)), 502, "error del modelo");
          esperar(await pedirDesglose(persona, ENG.principal, { tarea: frase }, modelo([{ pasos: [paso(frase)], extra: frase }])), 502, "fuera del esquema");
          esperar(await pedirDesglose(persona, ENG.principal, { tarea: frase }, modelo([{ pasos: [paso(`${frase} y escribe el título`)] }])), 502, "dos fallas");
          esperar(await pedirDesglose(persona, ENG.principal, { tarea: frase }, modelo()), 201, "bien");
        } finally {
          console.error = original;
        }
        const filas = await sql`select to_jsonb(a)::text as fila from app.audit_log a where engagement_id = ${ENG.principal}`;
        revisar(filas.length >= 5, `audit_log tiene ${filas.length} filas`);
        for (const f of filas) revisar(!(f.fila as string).includes(frase), "audit_log trae la frase");
        revisar(lineas.length > 0, "el error no llegó al log");
        for (const l of lineas) revisar(!l.includes(frase), "el log trae la frase");
      },
    },
    {
      id: "R-007.60",
      descripcion: "lo que el seed-demo dejó en la base es un arreglo o un objeto, nunca un texto con JSON: private.app_guia_insumos lo lee con SQL. Solo lee",
      correr: async () => {
        const demo = "d0000000-0000-4000-8000-000000000021";
        const [mal] = await sql`
          select (select count(*) from app.plan_items where engagement_id = ${demo} and jsonb_typeof(evidencia) <> 'array')::int
            + (select count(*) from app.profile_events where engagement_id = ${demo} and jsonb_typeof(payload) <> 'object')::int
            + (select count(*) from app.plans where engagement_id = ${demo} and jsonb_typeof(propuesta_ia) <> 'object')::int as n`;
        revisar(mal.n === 0, `${mal.n} filas guardaron JSON como texto`);
      },
    },
    {
      id: "CA-010.48",
      descripcion: "10 filas de hoy responden 429 con el texto literal; las de ayer, de otra cuenta o con sufijo no cuentan",
      correr: async () => {
        await reiniciar();
        // 12 horas antes de la medianoche de hoy en Monterrey: siempre es ayer allá.
        const [{ ayer }] = await sql`select (((now() at time zone 'America/Monterrey')::date - 1)::timestamp + interval '12 hours') at time zone 'America/Monterrey' as ayer`;
        await sembrarAuditoria(10, { userId: persona.id, accion: ACCION_RESERVA_DESGLOSE, creada: (ayer as Date).toISOString() });
        await sembrarAuditoria(10, { userId: COACH, accion: ACCION_RESERVA_DESGLOSE });
        await sembrarAuditoria(10, { userId: persona.id, accion: `${ACCION_DESGLOSE}${SUFIJO_REINTENTO}` });
        await sembrarAuditoria(10, { userId: persona.id, accion: ACCION_DESGLOSE });
        esperar(await pedirDesglose(persona, ENG.principal, PEDIDO, modelo()), 201, "no cuentan");

        await reiniciar();
        await sembrarAuditoria(9, { userId: persona.id, accion: ACCION_RESERVA_DESGLOSE });
        esperar(await pedirDesglose(persona, ENG.principal, PEDIDO, modelo()), 201, "la décima");
        esperarError(await pedirDesglose(persona, ENG.principal, PEDIDO, modelo()), 429, TEXTOS_PERSONA.LIMITE_ALCANZADO, "la undécima");
        revisar((await contarReservas()) === 10, `reservas: ${await contarReservas()}`);

        // Las fallas cuentan: una reserva por pedido, también si el modelo falla, y el reintento no reserva otra.
        await reiniciar();
        esperar(await pedirDesglose(persona, ENG.principal, PEDIDO, modeloQueFalla("falla simulada")), 502, "modelo que falla");
        esperar(await pedirDesglose(persona, ENG.principal, PEDIDO, modelo([SALIDA_DOS_ACCIONES])), 502, "dos llamadas");
        revisar((await contarReservas()) === 2, `reservas de dos pedidos: ${await contarReservas()}`);
        revisar((await filasAuditoria()).length === 3, "las llamadas siguen teniendo su fila");

        // Un pedido en camino ya cuenta: el segundo llega mientras el modelo le responde al primero. Una consulta a la vez, porque
        // el primero no tiene transacción abierta mientras espera. El candado de dos pedidos a la vez no se prueba aquí: varias
        // consultas en paralelo sobre una conexión del pooler se quedan colgadas.
        await reiniciar();
        await sembrarAuditoria(9, { userId: persona.id, accion: ACCION_RESERVA_DESGLOSE });
        let encimado: RespuestaRuta | null = null;
        const sinLlamar = modelo();
        const m = modelo([SALIDA_BUENA], async () => {
          encimado = await pedirDesglose(persona, ENG.principal, PEDIDO, sinLlamar);
        });
        esperar(await pedirDesglose(persona, ENG.principal, PEDIDO, m), 201, "el primero");
        esperarError(encimado!, 429, TEXTOS_PERSONA.LIMITE_ALCANZADO, "el encimado");
        revisar(sinLlamar.llamadas() === 0, "el encimado llamó al modelo");
        revisar((await contar("task_breakdowns")) === 1, "se guardaron dos");

        await reiniciar();
        await sembrarAuditoria(10, { userId: COACH, accion: ACCION_RESERVA_DESGLOSE });
        esperarError(await pedirDesglose(coach, ENG.principal, PEDIDO, modelo()), 429, TEXTOS_COACH.LIMITE_ALCANZADO, "el coach");
      },
    },
    {
      id: "CA-010.56",
      descripcion: "lo que escribe el coach se bloquea antes del modelo; lo de la persona no, y un término del modelo solo pasa si ella lo escribió",
      correr: async () => {
        await reiniciar();
        const m = modelo();
        for (const [tarea, termino] of [
          ["Apoyar la memoria de trabajo al ordenar reportes", "Memoria de trabajo"],
          ["Como tiene TDAH, ordena sus reportes", "TDAH"],
          ["Revisar el diagnóstico de fallas del servidor", "diagnóstico"],
        ] as const) {
          esperarError(await pedirDesglose(coach, ENG.principal, { tarea }, m), 400, mensajeBloqueoCoach(NOMBRE, termino), tarea);
        }
        esperarError(
          await pedirDesglose(coach, ENG.principal, { tarea: TAREA, contexto: { conQuien: "su terapeuta" } }, m),
          400,
          mensajeBloqueoCoach(NOMBRE, "terapeuta"),
          "en el contexto",
        );
        revisar(m.llamadas() === 0, "llamó al modelo");
        await sinFilasNuevas("bloqueo");

        // Una tarea limpia del coach, con el término en un paso: da texto_no_permitido.
        const m2 = modelo([SALIDA_CON_TERMINO]);
        esperar(await pedirDesglose(coach, ENG.principal, PEDIDO, m2), 502, "coach, término del modelo");
        revisar(m2.llamadas() === 2, "no reintentó");
        const [primera] = await filasAuditoria();
        revisar(primera?.error === "validacion: texto_no_permitido", `audit_log: ${primera?.error}`);

        // La persona con la misma tarea: la ruta no bloquea su entrada.
        await reiniciar();
        const m3 = modelo();
        esperar(await pedirDesglose(persona, ENG.principal, { tarea: "Apoyar la memoria de trabajo al ordenar reportes" }, m3), 201, "persona");
        revisar(m3.llamadas() === 1, "la persona no necesitaba reintento");
        // Pero un término que no está en la lista cerrada de R-010.15 no se excusa aunque lo haya escrito.
        await reiniciar();
        const m3b = modelo([SALIDA_CON_TERMINO]);
        esperar(await pedirDesglose(persona, ENG.principal, { tarea: "Apoyar la memoria de trabajo al ordenar reportes" }, m3b), 502, "persona, término del modelo");
        revisar(m3b.llamadas() === 2, "no reintentó");
        // Y uno de la lista sí.
        await reiniciar();
        const m3c = modelo([{ pasos: [PASO_INICIO, paso("Abre el diagnóstico de fallas del servidor")] }]);
        esperar(await pedirDesglose(persona, ENG.principal, { tarea: "Preparar el diagnóstico de fallas del servidor" }, m3c), 201, "persona, palabra de trabajo");
        revisar(m3c.llamadas() === 1, "la palabra de trabajo necesitó reintento");

        // Sin escribirlo ella, sí cuenta.
        await reiniciar();
        const m4 = modelo([SALIDA_CON_TERMINO]);
        esperar(await pedirDesglose(persona, ENG.principal, PEDIDO, m4), 502, "persona sin escribirlo");

        // R-010.22: en una nota no hay excepción: se quita la nota y el paso se queda, sin el texto.
        await reiniciar();
        const nota = "cuida tu memoria de trabajo";
        const r = await pedirDesglose(persona, ENG.principal, { tarea: "Apoyar la memoria de trabajo al ordenar reportes" }, modelo([{ pasos: [PASO_INICIO, paso("Revisa tu lista de pendientes", { notaApoyo: nota, apoyoRef: "A-02" })] }]));
        esperar(r, 201, "nota con término");
        const fila = await filaDesglose(cuerpo(r).breakdownId!);
        revisar(fila.pasos[1]!.notaApoyo === null && fila.pasos[1]!.porQue === null, "la nota se quedó");
        revisar(!JSON.stringify(fila.descartados).includes(nota), "descartados trae el texto");
        revisar(JSON.stringify(fila.descartados).includes("nota_con_termino"), "descartados no lo dice");
      },
    },
    {
      id: "CA-010.35",
      descripcion: "sin atorado, la copia trae los mismos textos con id nuevos y origen, sin marcas, sin modelo y sin contar para el límite",
      correr: async () => {
        await reiniciar();
        const d = await desgloseListo();
        esperar(await marcarPaso(persona, d.id, d.pasos[0]!.id, { estado: "hecho" }), 201, "marcar hecho");
        // Con el límite lleno también pasa: no llama al modelo (R-010.48).
        await sembrarAuditoria(10, { userId: persona.id, accion: ACCION_RESERVA_DESGLOSE });
        const auditoriaAntes = await contar("audit_log");
        const origenAntes = await fotografia("task_breakdowns", ENG.principal);
        const m = modeloAjustes();
        const r = await repetirDesglose(persona, d.id, {}, m);
        esperar(r, 201, "repetir sin marcas");
        revisar(cuerpo(r).resultado === "sin_marcas", `resultado: ${cuerpo(r).resultado}`);
        revisar(m.llamadas() === 0, "llamó al modelo");
        revisar((await contar("audit_log")) === auditoriaAntes, "hay filas nuevas en audit_log");
        const copia = await filaDesglose(cuerpo(r).breakdownId!);
        revisar(copia.origen_breakdown_id === d.id, "sin origen");
        revisar(JSON.stringify(sinIds(copia.pasos)) === JSON.stringify(sinIds(d.pasos)), "los pasos cambiaron");
        revisar(copia.pasos.every((p, i) => p.id !== d.pasos[i]!.id), "los id no cambiaron");
        revisar(copia.tarea_original === d.tarea_original, "la tarea cambió");
        revisar(copia.generado_desde === d.generado_desde && copia.prompt_version === d.prompt_version && copia.model === d.model, "no copió la procedencia");
        revisar(copia.ajustes === null && copia.creado_por === persona.id, "ajustes o creado_por");
        const [{ n }] = await sql`select count(*)::int as n from app.task_step_events where breakdown_id = ${copia.id}`;
        revisar(n === 0, "la copia trae marcas");
        // El origen no cambió, salvo que ahora hay otra fila.
        const [antes] = (JSON.parse(origenAntes) as { id: string }[]).filter((f) => f.id === d.id);
        const despues = (JSON.parse(await fotografia("task_breakdowns", ENG.principal)) as { id: string }[]).filter((f) => f.id === d.id);
        revisar(JSON.stringify(despues[0]) === JSON.stringify(antes), "el origen cambió");
        // La pantalla de la copia dice de dónde viene el foco, y no es de su coach.
        const vista = await withRls(persona.claims, (tx) => leerTareaPersona(tx, ENG.principal, copia.id, persona.id));
        revisar(vista && !vista.archivada && vista.origenId === d.id && !vista.laPreparoSuCoach && !vista.ajustesSinDecidir, "la lectura de la copia");

        // Quién y desde dónde (R-010.2, R-010.35). El coach no repite; la ruta ya lo corta por rol y aquí tampoco encuentra.
        esperarError(await repetirDesglose(personaAjena, d.id, {}, m), 404, MENSAJES_DESGLOSE.sinTarea, "otra persona");
        esperarError(await repetirDesglose(coach, d.id, {}, m), 404, MENSAJES_DESGLOSE.sinTarea, "el coach");
        esperarError(await repetirDesglose(persona, randomUUID(), {}, m), 404, MENSAJES_DESGLOSE.sinTarea, "no existe");
        esperarError(await repetirDesglose(persona, d.id, { archivo: "x" }, m), 400, MENSAJES_DESGLOSE.repetirInvalido, "llave extra");
        await retirar(ENG.principal, PERSONAS.principal);
        try {
          esperarError(await repetirDesglose(persona, d.id, {}, m), 409, TEXTOS_PERSONA.SIN_CONSENTIMIENTO, "sin consentimiento");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        esperar(await archivarDesglose(persona, d.id, { accion: "archivar" }), 200, "archivar");
        esperarError(await repetirDesglose(persona, d.id, {}, m), 409, TEXTOS_PERSONA.TAREA_YA_NO_DISPONIBLE, "archivada");
        revisar(m.llamadas() === 0, "llamó al modelo en un corte");

        // De lo que preparó el coach también puede: la copia queda a su nombre.
        await reiniciar();
        const delCoach = await desgloseListo(coach);
        const deCoach = await repetirDesglose(persona, delCoach.id, {}, m);
        esperar(deCoach, 201, "repetir lo del coach");
        revisar((await filaDesglose(cuerpo(deCoach).breakdownId!)).creado_por === persona.id, "la copia no es suya");
      },
    },
    {
      id: "CA-010.36",
      descripcion: "con atorado, el modelo recibe solo las marcas de ese origen, con su texto literal, y no hay reintento",
      correr: async () => {
        await reiniciar();
        const texto = "No encontré dónde está la plantilla del reporte";
        const otraTarea = await desgloseListo();
        await atorar(otraTarea, [0], "Esto es de otra tarea");
        const d = await desgloseListo();
        await atorar(d, [1], texto);
        await atorar(d, [2]);
        // Después de un "Deshacer" también llega: el diálogo se lo dijo (R-010.28).
        esperar(await marcarPaso(persona, d.id, d.pasos[2]!.id, { estado: "pendiente" }), 201, "deshacer");

        const auditoriaAntes = (await filasAuditoria()).length;
        // Solo ajustes inválidos: no hay reintento (R-010.36, R-010.37).
        const m = modeloAjustes([{ ajustes: [ajuste("S-02", paso("Abre el archivo y escribe el título"))] }]);
        const r = await repetirDesglose(persona, d.id, {}, m);
        esperar(r, 201, "repetir");
        revisar(m.llamadas() === 1, `hubo ${m.llamadas()} llamadas`);
        const entrada = m.entradas[0]!;
        revisar(JSON.stringify(entrada.marcas) === JSON.stringify([{ pasoRef: "S-02", texto }, { pasoRef: "S-03", texto: null }]), `marcas: ${JSON.stringify(entrada.marcas)}`);
        const mensaje = mensajeUsuarioAjustes(entrada);
        revisar(!mensaje.includes("Esto es de otra tarea"), "trae una marca de otro desglose");
        revisar(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(mensaje), "el mensaje trae un UUID");
        for (const c of CENTINELAS_INTERNOS) revisar(!mensaje.includes(c), `el mensaje trae ${c}`);
        revisar(mensaje.includes(RESUMEN_INICIO) && mensaje.includes(TEXTO_OBJETIVO), "faltan los apoyos");

        const filas = await filasAuditoria();
        revisar(filas.length === auditoriaAntes + 1, "más de una fila en audit_log");
        const fila = filas[filas.length - 1]!;
        revisar(fila.accion === ACCION_AJUSTES && fila.ok && fila.prompt_version === PROMPT_VERSION_DESGLOSE_AJUSTES, `audit_log: ${JSON.stringify(fila)}`);
        const copia = await filaDesglose(cuerpo(r).breakdownId!);
        revisar(copia.prompt_version === PROMPT_VERSION_DESGLOSE_AJUSTES && copia.generado_desde === snapshotPrincipal, "la procedencia de la copia");
      },
    },
    {
      id: "CA-010.38b",
      descripcion: "con ajustes sin decidir no se marca ni se repite; se decide una vez, y un ajuste que ya no sirve responde 400 sin cambiar nada",
      correr: async () => {
        await reiniciar();
        const d = await desgloseListo();
        await atorar(d, [0, 1, 2], "Aquí me perdí");
        const copia = await copiaConAjustes(d, [
          ajuste("S-01", paso("Abre el reporte de ayer", { apoyoRef: "A-02" }), "agregar_antes"),
          ajuste("S-02", paso("Escribe el nombre del reporte en el título")),
          ajuste("S-03", paso("Revisa la lista de pendientes de hoy", { notaApoyo: "la lista de cada mañana", apoyoRef: "A-03" })),
        ]);
        revisar(copia.ajustes?.length === 3, `ajustes: ${copia.ajustes?.length}`);
        revisar(JSON.stringify(sinIds(copia.pasos)) === JSON.stringify(sinIds(d.pasos)), "los pasos cambiaron antes de decidir");
        revisar(copia.ajustes_decididos_en === null && copia.ajustes_aceptados === null, "ya estaba decidida");
        revisar(copia.ajustes.every((a) => copia.pasos.some((p) => p.id === a.pasoId)), "un ajuste no apunta a la copia");
        // CA-010.24: lo guardado no trae apoyoRef, A-nn ni S-nn.
        const guardado = JSON.stringify(copia.ajustes);
        revisar(!/apoyoRef|pasoRef|"A-\d|"S-\d/.test(guardado), "se guardó un índice");

        esperarError(await marcarPaso(persona, copia.id, copia.pasos[0]!.id, { estado: "hecho" }), 409, MENSAJES_MARCAS.decideAjustes, "marcar sin decidir");
        const m = modeloAjustes();
        esperarError(await repetirDesglose(persona, copia.id, {}, m), 409, TEXTOS_PERSONA.DECIDE_AJUSTES, "repetir sin decidir");
        revisar(m.llamadas() === 0, "llamó al modelo");

        // Lo que baja a la pantalla: sin origen, con el número de paso.
        const vista = await withRls(persona.claims, (tx) => leerTareaPersona(tx, ENG.principal, copia.id, persona.id));
        revisar(vista && !vista.archivada && vista.ajustesSinDecidir && vista.ajustes.length === 3, "la lectura de la persona");
        revisar(JSON.stringify(vista.ajustes.map((a) => a.numero)) === "[1,2,3]", `números: ${JSON.stringify(vista.ajustes.map((a) => a.numero))}`);
        revisar(!JSON.stringify(vista.ajustes).includes('"origen"'), "baja el origen");
        // Y el coach los lee, todavía sin decidir.
        const deCoach = await withRls(coach.claims, (tx) => leerTareaCoach(tx, ENG.principal, copia.id, PERSONAS.principal));
        revisar(deCoach?.ajustes.every((a) => a.usada === null), "el coach no ve que falta decidir");

        // Un id ajeno, otra persona, un cuerpo malo: no cambia nada.
        const ids = copia.ajustes.map((a) => a.id);
        const antes = await fotografia("task_breakdowns", ENG.principal);
        esperarError(await decidirAjustes(persona, copia.id, { aceptados: [randomUUID()] }), 400, MENSAJES_MARCAS.decidirInvalido, "un id ajeno");
        esperarError(await decidirAjustes(persona, copia.id, { aceptados: [ids[0]], extra: 1 }), 400, MENSAJES_MARCAS.decidirInvalido, "llave extra");
        esperarError(await decidirAjustes(personaAjena, copia.id, { aceptados: [] }), 404, MENSAJES_MARCAS.sinTarea, "otra persona");
        esperarError(await decidirAjustes(coach, copia.id, { aceptados: [] }), 404, MENSAJES_MARCAS.sinTarea, "el coach");
        await retirar(ENG.principal, PERSONAS.principal);
        try {
          esperarError(await decidirAjustes(persona, copia.id, { aceptados: [] }), 409, MENSAJES_MARCAS.sinConsentimiento, "sin consentimiento");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        revisar((await fotografia("task_breakdowns", ENG.principal)) === antes, "algo cambió");

        // Un ajuste guardado que ya no pasa: nombra el paso y no cambia nada. Sin él, se guarda.
        const viejos = copia.ajustes.map((a, i) => (i === 1 ? { ...a, paso: { ...a.paso, accion: "Abre el archivo y escribe el título" } } : a));
        await sql`update app.task_breakdowns set ajustes = ${sql.json(viejos)} where id = ${copia.id}`;
        const antesDelFallo = await fotografia("task_breakdowns", ENG.principal);
        esperarError(await decidirAjustes(persona, copia.id, { aceptados: [ids[0], ids[1]] }), 400, TEXTOS_PERSONA.errorAjuste(2), "ajuste viejo");
        revisar((await fotografia("task_breakdowns", ENG.principal)) === antesDelFallo, "el 400 cambió algo");

        // Dos de tres.
        esperar(await decidirAjustes(persona, copia.id, { aceptados: [ids[0], ids[2]] }), 200, "decidir dos");
        const decidida = await filaDesglose(copia.id);
        revisar(decidida.ajustes_decididos_en !== null, "no quedó decidida");
        revisar(Array.isArray(decidida.pasos) && Array.isArray(decidida.ajustes_aceptados), "se guardó un texto y no un arreglo");
        revisar(JSON.stringify(decidida.ajustes_aceptados) === JSON.stringify([ids[0], ids[2]]), "ajustes_aceptados");
        revisar(
          JSON.stringify(decidida.pasos.map((p) => p.accion)) === JSON.stringify(["Abre el reporte de ayer", d.pasos[0]!.accion, d.pasos[1]!.accion, "Revisa la lista de pendientes de hoy"]),
          `pasos: ${JSON.stringify(decidida.pasos.map((p) => p.accion))}`,
        );
        revisar(decidida.pasos[3]!.porQue !== null, "la nota del ajuste no llegó");
        // Una segunda decisión falla, y ya se puede marcar y repetir.
        esperarError(await decidirAjustes(persona, copia.id, { aceptados: [] }), 409, MENSAJES_MARCAS.yaDecidiste, "segunda decisión");
        esperar(await marcarPaso(persona, copia.id, decidida.pasos[0]!.id, { estado: "hecho" }), 201, "marcar después de decidir");
        // El detalle del coach dice cuál usó.
        const detalle = await withRls(coach.claims, (tx) => leerTareaCoach(tx, ENG.principal, copia.id, PERSONAS.principal));
        revisar(JSON.stringify(detalle?.ajustes.map((a) => a.usada)) === "[true,false,true]", `usadas: ${JSON.stringify(detalle?.ajustes.map((a) => a.usada))}`);
      },
    },
    {
      id: "CA-010.46b",
      descripcion: "un retiro mientras responde el modelo de ajustes: 409, sin copia y con su fila en audit_log",
      correr: async () => {
        await reiniciar();
        const d = await desgloseListo();
        await atorar(d, [1]);
        const filasAntes = await contar("task_breakdowns");
        const auditoriaAntes = (await filasAuditoria()).length;
        try {
          const m = modeloAjustes([{ ajustes: [] }], () => retirar(ENG.principal, PERSONAS.principal));
          esperarError(await repetirDesglose(persona, d.id, {}, m), 409, TEXTOS_PERSONA.RETIRO_DURANTE_LA_LLAMADA, "retiro");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        revisar((await contar("task_breakdowns")) === filasAntes, "hay una copia");
        revisar((await filasAuditoria()).length === auditoriaAntes + 1, "no hay fila en audit_log");
      },
    },
    {
      id: "CA-010.47b",
      descripcion: "lo que escribió en la marca no aparece en audit_log, ni con error",
      correr: async () => {
        await reiniciar();
        const frase = "Frase única de la marca para la auditoría";
        const d = await desgloseListo();
        await atorar(d, [1], frase);
        esperar(await repetirDesglose(persona, d.id, {}, modeloQueFallaAjustes(frase)), 502, "modelo que falla");
        esperar(await repetirDesglose(persona, d.id, {}, modeloAjustes([{ ajustes: [] }])), 201, "cero ajustes");
        const filas = await sql`select to_jsonb(a)::text as fila from app.audit_log a where engagement_id = ${ENG.principal}`;
        for (const f of filas) revisar(!(f.fila as string).includes(frase), "audit_log trae la frase");
      },
    },
    {
      id: "CA-010.48b",
      descripcion: "repetir con marcas cuenta para el límite y responde 429, sin modelo ni copia",
      correr: async () => {
        await reiniciar();
        const d = await desgloseListo();
        await atorar(d, [1]);
        await sembrarAuditoria(9, { userId: persona.id, accion: ACCION_RESERVA_DESGLOSE });
        const filasAntes = await contar("task_breakdowns");
        const m = modeloAjustes();
        esperarError(await repetirDesglose(persona, d.id, {}, m), 429, TEXTOS_PERSONA.LIMITE_ALCANZADO, "límite");
        revisar(m.llamadas() === 0, "llamó al modelo");
        revisar((await contar("task_breakdowns")) === filasAntes, "hay una copia");
      },
    },
    {
      id: "CA-010.57",
      descripcion: "una copia con el paso 1 sin verbo de inicio se guarda sin elegir o eligiendo otro paso; un ajuste al paso 1 con otro apoyo se descarta",
      correr: async () => {
        await reiniciar();
        const d = await desgloseListo();
        // El paso 1 ya no pasaría R-010.14 y no trae apoyoRef: es como queda una copia de un origen viejo.
        const pasos = d.pasos.map((p, i) => (i === 0 ? { ...p, accion: "Revisa tu lista de hoy", notaApoyo: null, porQue: null, origen: null } : p));
        await sql`update app.task_breakdowns set pasos = ${sql.json(pasos)} where id = ${d.id}`;
        await atorar({ ...d, pasos }, [0, 2]);

        // Un ajuste al paso 1 con un apoyo sin iniciar se descarta, y uno al paso 3 queda.
        const copia = await copiaConAjustes(d, [ajuste("S-01", paso("Abre un documento en blanco", { apoyoRef: "A-03" })), ajuste("S-03", paso("Revisa la lista de pendientes de hoy"))]);
        revisar(copia.ajustes?.length === 1 && copia.ajustes[0]!.pasoId === copia.pasos[2]!.id, "no quedó el del paso 3");
        revisar(JSON.stringify(copia.descartados) === JSON.stringify([{ ruta: "ajustes[0]", motivo: "ajuste_no_valido" }]), `descartados: ${JSON.stringify(copia.descartados)}`);
        const vista = await withRls(persona.claims, (tx) => leerTareaPersona(tx, ENG.principal, copia.id, persona.id));
        revisar(vista && !vista.archivada && vista.ajustes.length === 1, "aparece en la pantalla");

        // Elegir el del paso 3 se guarda, aunque el paso 1 copiado no pasaría.
        esperar(await decidirAjustes(persona, copia.id, { aceptados: [copia.ajustes[0]!.id] }), 200, "elegir otro paso");
        esperar(await marcarPaso(persona, copia.id, copia.pasos[0]!.id, { estado: "hecho" }), 201, "marcar");

        // Sin elegir también.
        const otra = await copiaConAjustes(d, [ajuste("S-03", paso("Revisa la lista de pendientes de hoy"))]);
        esperar(await decidirAjustes(persona, otra.id, { aceptados: [] }), 200, "sin elegir");
        const decidida = await filaDesglose(otra.id);
        revisar(JSON.stringify(decidida.pasos) === JSON.stringify(otra.pasos), "los pasos cambiaron");
        revisar(JSON.stringify(decidida.ajustes_aceptados) === "[]", "ajustes_aceptados");
        esperar(await marcarPaso(persona, otra.id, otra.pasos[0]!.id, { estado: "hecho" }), 201, "marcar");
      },
    },
    {
      id: "CA-010.58",
      descripcion: "si el modelo falla o sale del esquema responde 502 con su texto, sin copia, con audit_log en falso y el origen igual",
      correr: async () => {
        await reiniciar();
        const d = await desgloseListo();
        await atorar(d, [1], "Aquí me perdí");
        const antes = await fotografia("task_breakdowns", ENG.principal);
        const marcasAntes = await fotografia("task_step_events", ENG.principal);

        const falla = modeloQueFallaAjustes("se cayó");
        esperarError(await repetirDesglose(persona, d.id, {}, falla), 502, TEXTOS_PERSONA.ERROR_REPETIR, "el modelo falla");
        revisar(falla.llamadas() === 1, "reintentó");
        let filas = await filasAuditoria();
        let ultima = filas[filas.length - 1]!;
        revisar(ultima.accion === ACCION_AJUSTES && !ultima.ok && ultima.prompt_version === PROMPT_VERSION_DESGLOSE_AJUSTES, `audit_log: ${JSON.stringify(ultima)}`);

        for (const salida of [{ ajustes: [{ ...ajuste("S-02", paso("Revisa la lista")), extra: 1 }] }, { ajustes: [{ tipo: "quitar", pasoRef: "S-02", paso: paso("Revisa la lista"), motivo: "x" }] }, { nada: [] }]) {
          const m = modeloAjustes([salida]);
          esperarError(await repetirDesglose(persona, d.id, {}, m), 502, TEXTOS_PERSONA.ERROR_REPETIR, "fuera del esquema");
          revisar(m.llamadas() === 1, "reintentó");
          filas = await filasAuditoria();
          ultima = filas[filas.length - 1]!;
          revisar(!ultima.ok && ultima.error === "esquema", `audit_log: ${JSON.stringify(ultima)}`);
        }
        revisar((await fotografia("task_breakdowns", ENG.principal)) === antes, "el origen o las filas cambiaron");
        revisar((await fotografia("task_step_events", ENG.principal)) === marcasAntes, "las marcas cambiaron");
        // Sigue pudiendo intentar otra vez.
        esperar(await repetirDesglose(persona, d.id, {}, modeloAjustes()), 201, "intentar otra vez");
      },
    },
    {
      id: "CA-010.59",
      descripcion: "con cero ajustes, o solo descartados, hay copia con ajustes nulo, se puede marcar y decidir no escribe",
      correr: async () => {
        await reiniciar();
        const d = await desgloseListo();
        await atorar(d, [1], "Aquí me perdí");

        const cero = await repetirDesglose(persona, d.id, {}, modeloAjustes([{ ajustes: [] }]));
        esperar(cero, 201, "cero ajustes");
        revisar(cuerpo(cero).resultado === "sin_ajustes", `resultado: ${cuerpo(cero).resultado}`);

        const descartados = await repetirDesglose(persona, d.id, {}, modeloAjustes([{ ajustes: [ajuste("S-01", paso("Revisa la lista")), ajuste("S-02", paso("Abre el archivo y escribe el título"))] }]));
        esperar(descartados, 201, "todos descartados");
        revisar(cuerpo(descartados).resultado === "sin_ajustes", `resultado: ${cuerpo(descartados).resultado}`);
        const copiaDescartados = await filaDesglose(cuerpo(descartados).breakdownId!);
        revisar(JSON.stringify(copiaDescartados.descartados) === JSON.stringify([{ ruta: "ajustes[0]", motivo: "ajuste_sin_atoro" }, { ruta: "ajustes[1]", motivo: "ajuste_no_valido" }]), `descartados: ${JSON.stringify(copiaDescartados.descartados)}`);

        for (const id of [cuerpo(cero).breakdownId!, copiaDescartados.id]) {
          const copia = await filaDesglose(id);
          revisar(copia.ajustes === null, "ajustes no es nulo");
          revisar(JSON.stringify(sinIds(copia.pasos)) === JSON.stringify(sinIds(d.pasos)), "los pasos cambiaron");
          const vista = await withRls(persona.claims, (tx) => leerTareaPersona(tx, ENG.principal, id, persona.id));
          revisar(vista && !vista.archivada && !vista.ajustesSinDecidir && vista.ajustes.length === 0, "la lectura");
          esperar(await marcarPaso(persona, id, copia.pasos[0]!.id, { estado: "hecho" }), 201, "marcar");
          esperarError(await decidirAjustes(persona, id, { aceptados: [] }), 409, MENSAJES_MARCAS.yaDecidiste, "decidir sin ajustes");
          revisar((await filaDesglose(id)).ajustes_decididos_en === null, "decidir escribió");
        }
      },
    },

    // ----- Plantillas (tareas 21 a 24) -----
    {
      id: "CA-010.39",
      descripcion: "la plantilla no guarda notas, porQue, origen, minutos ni contexto, ni referencia a la persona o al desglose; su única liga es origen_engagement_id, y la ruta no la devuelve",
      correr: async () => {
        await reiniciarPlantillas();
        const r0 = await pedirDesglose(coach, ENG.principal, { tarea: TAREA, contexto: { plazo: "Fin de mes" } }, modelo());
        esperar(r0, 201, "pedir");
        const d = await filaDesglose(cuerpo(r0).breakdownId!);
        revisar(d.pasos.some((p) => p.notaApoyo !== null && p.minutos !== null) && d.contexto !== null, "control: el desglose trae notas, minutos y contexto");

        const r = await guardarPlantilla(coach, cuerpoPlantilla(d.id));
        esperar(r, 201, "guardar");
        revisar(Object.keys(r.cuerpo as object).join() === "plantillaId", `la ruta devuelve más: ${Object.keys(r.cuerpo as object).join()}`);

        const [fila] = await plantillasDe(ENG.principal);
        revisar(fila, "no hay fila");
        revisar(fila.id === (r.cuerpo as { plantillaId: string }).plantillaId, "el id no es el de la fila");
        revisar(fila.origen_engagement_id === ENG.principal && fila.org_id === ORG && fila.creada_por === COACH, "origen, organización o autor");
        revisar(fila.pasos.every((p) => Object.keys(p).sort().join() === "accion,criterioTerminado,id"), "un paso guarda algo más");
        const json = JSON.stringify(fila);
        for (const prohibido of ["notaApoyo", "porQue", "origen\"", "minutos", "contexto", d.id, PERSONAS.principal, "Fin de mes"]) {
          revisar(!json.includes(prohibido), `la fila trae ${prohibido}`);
        }
        revisar(!Object.keys(fila).some((c) => c.includes("breakdown") || c.includes("persona")), "una columna apunta a la persona o al desglose");

        // Una llave de más no pasa el contrato, y no hay fila nueva.
        esperarError(await guardarPlantilla(coach, { ...cuerpoPlantilla(d.id), contexto: { plazo: "Hoy" } }), 400, MENSAJES_PLANTILLAS.guardarInvalido, "con contexto");
        esperarError(await guardarPlantilla(coach, { ...cuerpoPlantilla(d.id), origenEngagementId: ENG.ajena }), 400, MENSAJES_PLANTILLAS.guardarInvalido, "con origen");
        const conNota = cuerpoPlantilla(d.id);
        esperarError(await guardarPlantilla(coach, { ...conNota, pasos: [{ ...conNota.pasos[0], notaApoyo: "Una nota." }] }), 400, MENSAJES_PLANTILLAS.guardarInvalido, "con nota");
        revisar((await plantillasDe(ENG.principal)).length === 1, "hay filas de más");
      },
    },
    {
      id: "CA-010.40",
      descripcion: "con el nombre de pila de la persona o con \"autista\", responde 400 y no hay fila; con el texto corregido, se guarda; solo el coach de ese acompañamiento la guarda",
      correr: async () => {
        await reiniciarPlantillas();
        const d = await desgloseListo();
        const buena = cuerpoPlantilla(d.id);
        const bloqueoNombre = mensajeBloqueoPlantilla(NOMBRE);
        esperarError(await guardarPlantilla(coach, { ...buena, tarea: `Reporte de ${NOMBRE}` }), 400, bloqueoNombre, "nombre en la tarea");
        esperarError(await guardarPlantilla(coach, { ...buena, puesto: `Puesto de ${NOMBRE}` }), 400, bloqueoNombre, "nombre en el puesto");
        esperarError(await guardarPlantilla(coach, { ...buena, pasos: [{ ...buena.pasos[0]!, criterioTerminado: `La carpeta de ${NOMBRE.toUpperCase()} está abierta.` }] }), 400, bloqueoNombre, "nombre en un criterio, con otras mayúsculas");
        const conAutista = await guardarPlantilla(coach, { ...buena, pasos: [{ ...buena.pasos[0]!, accion: "Abre la lista si es autista" }] });
        esperar(conAutista, 400, "con autista");
        revisar(cuerpo(conAutista).error!.startsWith("Este texto no puede ir en una plantilla:"), `el texto: ${cuerpo(conAutista).error}`);
        revisar((await plantillasDe(ENG.principal)).length === 0, "se guardó con el bloqueo");

        esperar(await guardarPlantilla(coach, buena), 201, "corregida");
        // El desglose de otro coach no existe para este, y la persona no guarda.
        esperarError(await guardarPlantilla(coachAjeno, buena), 404, MENSAJES_PLANTILLAS.sinTarea, "coach ajeno");
        esperarError(await guardarPlantilla(persona, buena), 404, MENSAJES_PLANTILLAS.sinTarea, "la persona");
        revisar((await plantillasDe(ENG.principal)).length === 1, "hay filas de más");
      },
    },
    {
      id: "CA-010.40b",
      descripcion: "un paso que no pasa validarPasos responde 400 y dice qué paso; sin R-010.14; la entrada de R-010.17 es lo que dice la plantilla",
      correr: async () => {
        await reiniciarPlantillas();
        const d = await desgloseListo();
        const buena = cuerpoPlantilla(d.id);
        const conPaso = (accion: string, criterioTerminado = buena.pasos[1]!.criterioTerminado) => ({ ...buena, pasos: [buena.pasos[0]!, { accion, criterioTerminado }] });
        esperarError(await guardarPlantilla(coach, conPaso("Abre el archivo y escribe el título")), 400, TEXTOS_COACH.errorPasoPlantilla(2, "accion_multiple"), "dos acciones");
        esperarError(await guardarPlantilla(coach, conPaso("Revisa el reporte", "Cuando te sientas lista.")), 400, TEXTOS_COACH.errorPasoPlantilla(2, "criterio_vago"), "criterio vago");
        esperarError(await guardarPlantilla(coach, conPaso("Hazlo de inmediato")), 400, TEXTOS_COACH.errorPasoPlantilla(2, "urgencia"), "urgencia");
        esperarError(await guardarPlantilla(coach, conPaso("Pregúntale a Jorge dónde está")), 400, TEXTOS_COACH.errorPasoPlantilla(2, "entidad_ajena"), "un nombre de otra persona");
        esperarError(await guardarPlantilla(coach, conPaso("Abre la hoja en Excel")), 400, TEXTOS_COACH.errorPasoPlantilla(2, "entidad_ajena"), "una herramienta que la plantilla no dice");
        revisar((await plantillasDe(ENG.principal)).length === 0, "se guardó con el bloqueo");

        // Con la herramienta en la tarea, pasa. R-010.14 no corre: el paso 1 no empieza con un verbo de inicio y este perfil marca iniciacion.
        esperar(await guardarPlantilla(coach, { ...conPaso("Abre la hoja en Excel"), tarea: `${TAREA} en Excel` }), 201, "con la herramienta en la tarea");
        esperar(await guardarPlantilla(coach, { ...buena, pasos: [{ accion: "Revisa la lista de pendientes", criterioTerminado: buena.pasos[1]!.criterioTerminado }] }), 201, "sin R-010.14");
      },
    },
    {
      id: "CA-010.55",
      descripcion: "\"memoria de trabajo\" en cualquier campo responde 400 con el texto literal y no hay fila; también \"TDAH\" en un paso, y \"diagnóstico\" en un paso aunque esté en la tarea",
      correr: async () => {
        await reiniciarPlantillas();
        const d = await desgloseListo();
        const buena = cuerpoPlantilla(d.id);
        const FRASE = "Apoyar la memoria de trabajo al ordenar reportes";
        const LITERAL = "Este texto no puede ir en una plantilla: «Memoria de trabajo». Corrígelo para guardar.";
        const [p1, p2] = buena.pasos;
        for (const [que, pedido] of [
          ["tarea", { ...buena, tarea: FRASE }],
          ["puesto", { ...buena, puesto: FRASE }],
          ["titulo", { ...buena, titulo: FRASE }],
          ["accion", { ...buena, pasos: [{ ...p1!, accion: FRASE }, p2!] }],
          ["criterioTerminado", { ...buena, pasos: [p1!, { ...p2!, criterioTerminado: FRASE }] }],
        ] as const) {
          esperarError(await guardarPlantilla(coach, pedido), 400, LITERAL, que);
        }
        esperarError(await guardarPlantilla(coach, { ...buena, pasos: [p1!, { ...p2!, accion: "Abre la lista de TDAH" }] }), 400, mensajeBloqueoPlantilla("TDAH"), "TDAH en un paso");
        esperarError(
          await guardarPlantilla(coach, { ...buena, tarea: "Revisar el diagnóstico de fallas del servidor", pasos: [p1!, { ...p2!, accion: "Abre el diagnóstico de fallas" }] }),
          400,
          mensajeBloqueoPlantilla("diagnóstico"),
          "diagnóstico aunque esté en la tarea",
        );
        revisar((await plantillasDe(ENG.principal)).length === 0, "se guardó con el bloqueo");
      },
    },
    {
      id: "CA-010.41b",
      descripcion: "cualquier coach de la organización la lee y la archiva; solo escribe las columnas de archivar; archivada sale de la lista y una segunda vez responde 409",
      correr: async () => {
        await reiniciarPlantillas();
        const id = await plantillaLista();
        const antes = (await plantillasDe(ENG.principal))[0]!;

        const deOtroCoach = await withRls(coachAjeno.claims, (tx) => leerPlantillas(tx));
        revisar(deOtroCoach.some((p) => p.id === id), "otro coach de la organización no la lee");
        revisar(!JSON.stringify(deOtroCoach).includes("origen") && !JSON.stringify(deOtroCoach).includes(ENG.principal), "la lectura trae el origen");
        // La persona no tiene acceso: esta lectura le da cero filas.
        revisar((await withRls(persona.claims, (tx) => leerPlantillas(tx))).length === 0, "la persona lee plantillas");

        esperarError(await archivarPlantilla(coach, id, { accion: "archivar", pasos: [] }), 400, MENSAJES_PLANTILLAS.archivarInvalido, "llave de más");
        esperarError(await archivarPlantilla(persona, id, { accion: "archivar" }), 404, MENSAJES_PLANTILLAS.noDisponible, "la persona");
        esperar(await archivarPlantilla(coachAjeno, id, { accion: "archivar" }), 200, "archivar");
        esperarError(await archivarPlantilla(coach, id, { accion: "archivar" }), 409, MENSAJES_PLANTILLAS.yaArchivada, "otra vez");

        const despues = (await plantillasDe(ENG.principal))[0]!;
        revisar(despues.archivada_por === COACH_AJENO && despues.archivada_en !== null, "las columnas de archivar");
        revisar(JSON.stringify({ ...despues, archivada_por: null, archivada_en: null }) === JSON.stringify({ ...antes, archivada_por: null, archivada_en: null }), "archivar cambió algo más");
        revisar(!(await withRls(coach.claims, (tx) => leerPlantillas(tx))).some((p) => p.id === id), "sigue en la lista");
      },
    },
    {
      id: "CA-010.42",
      descripcion: "su coach aplica la plantilla a otra persona: hay un desglose con plantilla_id, y el modelo recibe la plantilla y los apoyos de esa persona; la persona, un coach ajeno y una plantilla oculta o archivada no",
      correr: async () => {
        await reiniciarPlantillas();
        const plantillaId = await plantillaLista();
        const m = modelo();
        const r = await aplicarPlantilla(coach, ENG.ajena, { plantillaId, contexto: { plazo: "El viernes" } }, m);
        esperar(r, 201, "aplicar");
        const d = await filaDesglose(cuerpo(r).breakdownId!);
        revisar(d.plantilla_id === plantillaId, "no guarda plantilla_id");
        revisar(d.tarea_original === TAREA, "la tarea no es la de la plantilla");
        revisar(JSON.stringify(d.contexto) === JSON.stringify({ plazo: "El viernes" }), "el contexto");
        revisar(d.creado_por === COACH && d.prompt_version === PROMPT_VERSION_DESGLOSE, "autor o versión del prompt");
        revisar(m.llamadas() === 1, "el modelo se llamó más de una vez");
        const entrada = m.entradas[0]!;
        const pasosPlantilla = (await plantillasDe(ENG.principal))[0]!.pasos;
        revisar(JSON.stringify(entrada.plantilla?.pasos.map((p) => p.accion)) === JSON.stringify(pasosPlantilla.map((p) => p.accion)), "el modelo no recibe los pasos de la plantilla");
        const mensaje = mensajeUsuarioDesglose(entrada);
        revisar(mensaje.includes("<plantilla>") && !mensaje.includes(ENG.principal) && !mensaje.includes(plantillaId), "el mensaje trae ids o no trae la plantilla");
        revisar(!mensaje.includes(TEXTO_OBJETIVO), "el modelo recibe el plan de la persona de origen");
        revisar((await filasAuditoria(ENG.ajena)).map((f) => f.accion).join() === ACCION_PLANTILLA, "la acción de auditoría");

        // Los mismos chequeos de R-010.3, sin llamar al modelo.
        const sinLlamar = modelo();
        esperarError(await aplicarPlantilla(coachAjeno, ENG.ajena, { plantillaId }, sinLlamar), 404, MENSAJES_DESGLOSE.sinAcompanamiento, "coach ajeno");
        esperarError(await aplicarPlantilla(personaAjena, ENG.ajena, { plantillaId }, sinLlamar), 404, MENSAJES_DESGLOSE.sinAcompanamiento, "la persona");
        esperarError(await aplicarPlantilla(coach, ENG.sinPerfil, { plantillaId }, sinLlamar), 409, TEXTOS_COACH.perfilNoListo("Noa"), "sin perfil");
        esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId: randomUUID() }, sinLlamar), 404, MENSAJES_PLANTILLAS.noDisponible, "no existe");
        esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId, archivo: "x" }, sinLlamar), 400, MENSAJES_PLANTILLAS.aplicarInvalido, "llave de más");
        await retirar(ENG.ajena, PERSONAS.ajena);
        try {
          esperar(await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, sinLlamar), 409, "sin consentimiento del acompañamiento");
        } finally {
          await otorgar(ENG.ajena, PERSONAS.ajena);
        }
        // Oculta por un retiro en su origen: no se aplica, y vuelve con el consentimiento.
        await retirar(ENG.principal, PERSONAS.principal);
        try {
          esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, sinLlamar), 404, MENSAJES_PLANTILLAS.noDisponible, "oculta");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        esperar(await archivarPlantilla(coach, plantillaId, { accion: "archivar" }), 200, "archivar");
        esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, sinLlamar), 404, MENSAJES_PLANTILLAS.noDisponible, "archivada");
        revisar(sinLlamar.llamadas() === 0, "algún corte llamó al modelo");
        revisar((await contar("task_breakdowns", ENG.ajena)) === 1, "algún corte guardó");
        revisar((await filasAuditoria(ENG.ajena)).length === 1, "algún corte auditó");
      },
    },
    {
      id: "CA-010.18b",
      descripcion: "aplicar una plantilla: un paso con dos acciones provoca un solo reintento con su sufijo; si falla dos veces o el modelo falla, responde 502 y no hay fila",
      correr: async () => {
        await reiniciarPlantillas();
        const plantillaId = await plantillaLista();
        const r = await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, modelo([SALIDA_DOS_ACCIONES, SALIDA_BUENA]));
        esperar(r, 201, "con reintento");
        revisar((await filasAuditoria(ENG.ajena)).map((f) => f.accion).join() === `${ACCION_PLANTILLA},${ACCION_PLANTILLA}${SUFIJO_REINTENTO}`, "las filas de auditoría");

        await reiniciar(ENG.ajena);
        const siempreMal = modelo([SALIDA_DOS_ACCIONES]);
        esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, siempreMal), 502, TEXTOS_COACH.ERROR_PREPARAR, "falla dos veces");
        revisar(siempreMal.llamadas() === 2 && (await contar("task_breakdowns", ENG.ajena)) === 0, "más de un reintento o guardó");

        await reiniciar(ENG.ajena);
        esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, modeloQueFalla("Frase única de la marca para la auditoría")), 502, TEXTOS_COACH.ERROR_PREPARAR, "el modelo falla");
        const filas = await filasAuditoria(ENG.ajena);
        revisar(filas.length === 1 && filas[0]!.ok === false && filas[0]!.accion === ACCION_PLANTILLA, "la fila de auditoría de la falla");
        revisar(!JSON.stringify(filas).includes(TAREA), "audit_log trae texto de la tarea");
      },
    },
    {
      id: "CA-010.56b",
      descripcion: "la tarea de la plantilla y el contexto del coach pasan R-010.1 antes del modelo; lo que escribe el modelo no tiene excepción aunque el término esté en la plantilla",
      correr: async () => {
        await reiniciarPlantillas();
        const plantillaId = await plantillaLista();
        // Una plantilla de antes de que la lista creciera: al guardar ya no pasaría.
        const [conTermino] = await sql`
          insert into app.task_templates (org_id, origen_engagement_id, puesto, titulo, tarea, pasos, creada_por)
          values (${ORG}, ${ENG.principal}, 'Pruebas de software', 'Fallas', 'Revisar el diagnóstico de fallas', ${sql.json([{ id: randomUUID(), accion: "Abre la bitácora", criterioTerminado: "La bitácora está abierta en tu pantalla." }])}, ${COACH}) returning id`;
        const sinLlamar = modelo();
        esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId: conTermino!.id as string }, sinLlamar), 400, mensajeBloqueoCoach("Ale", "diagnóstico"), "un término en la tarea de la plantilla");
        esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId, contexto: { conQuien: "Como tiene TDAH" } }, sinLlamar), 400, mensajeBloqueoCoach("Ale", "TDAH"), "un término en el contexto");
        revisar(sinLlamar.llamadas() === 0, "se llamó al modelo");
        await sinFilasNuevas("con un término", ENG.ajena);

        // El término está en un paso de la plantilla y aun así no se excusa (R-010.42).
        const [conTerminoEnPaso] = await sql`
          insert into app.task_templates (org_id, origen_engagement_id, puesto, titulo, tarea, pasos, creada_por)
          values (${ORG}, ${ENG.principal}, 'Gestión documental', 'Reportes', ${TAREA}, ${sql.json([{ id: randomUUID(), accion: "Usa tu memoria de trabajo para ordenar el reporte", criterioTerminado: "El reporte está en orden en la carpeta." }])}, ${COACH}) returning id`;
        const conMemoria = modelo([SALIDA_CON_TERMINO]);
        esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId: conTerminoEnPaso!.id as string }, conMemoria), 502, TEXTOS_COACH.ERROR_PREPARAR, "el modelo escribe un término");
        const filas = await filasAuditoria(ENG.ajena);
        revisar(filas.length === 2 && filas.every((f) => f.ok === false && f.error === "validacion: texto_no_permitido"), `la auditoría: ${filas.map((f) => f.error).join()}`);
        revisar((await contar("task_breakdowns", ENG.ajena)) === 0, "guardó");
      },
    },
    {
      id: "CA-010.46c",
      descripcion: "un retiro del acompañamiento o del origen de la plantilla, o archivarla, mientras responde el modelo: responde 409, no guarda y sí audita",
      correr: async () => {
        await reiniciarPlantillas();
        const plantillaId = await plantillaLista();

        const conRetiro = modelo([SALIDA_BUENA], () => retirar(ENG.ajena, PERSONAS.ajena));
        try {
          esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, conRetiro), 409, TEXTOS_COACH.retiroDuranteLaLlamada("Ale"), "retiro de la persona");
        } finally {
          await otorgar(ENG.ajena, PERSONAS.ajena);
        }
        revisar((await contar("task_breakdowns", ENG.ajena)) === 0 && (await filasAuditoria(ENG.ajena)).length === 1, "guardó o no auditó");

        await reiniciar(ENG.ajena);
        const conRetiroOrigen = modelo([SALIDA_BUENA], () => retirar(ENG.principal, PERSONAS.principal));
        try {
          esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, conRetiroOrigen), 409, MENSAJES_PLANTILLAS.noDisponible, "retiro del origen");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        revisar((await contar("task_breakdowns", ENG.ajena)) === 0 && (await filasAuditoria(ENG.ajena)).length === 1, "guardó o no auditó");

        await reiniciar(ENG.ajena);
        const conArchivo = modelo([SALIDA_BUENA], async () => void (await archivarPlantilla(coachAjeno, plantillaId, { accion: "archivar" })));
        esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, conArchivo), 409, MENSAJES_PLANTILLAS.noDisponible, "archivada");
        revisar((await contar("task_breakdowns", ENG.ajena)) === 0, "guardó");

        // C-10: los mismos cortes antes del reintento. No sale nada más al modelo.
        await reiniciarPlantillas();
        const otraPlantilla = await plantillaLista();
        const retiroOrigen = modelo([SALIDA_DOS_ACCIONES, SALIDA_BUENA], () => retirar(ENG.principal, PERSONAS.principal));
        try {
          esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId: otraPlantilla }, retiroOrigen), 409, MENSAJES_PLANTILLAS.noDisponible, "retiro del origen antes del reintento");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        revisar(retiroOrigen.llamadas() === 1, `hubo ${retiroOrigen.llamadas()} llamadas con el origen retirado`);
        await reiniciar(ENG.ajena);
        const retiroPersona = modelo([SALIDA_DOS_ACCIONES, SALIDA_BUENA], () => retirar(ENG.ajena, PERSONAS.ajena));
        try {
          esperarError(await aplicarPlantilla(coach, ENG.ajena, { plantillaId: otraPlantilla }, retiroPersona), 409, TEXTOS_COACH.retiroDuranteLaLlamada("Ale"), "retiro de la persona antes del reintento");
        } finally {
          await otorgar(ENG.ajena, PERSONAS.ajena);
        }
        revisar(retiroPersona.llamadas() === 1, `hubo ${retiroPersona.llamadas()} llamadas con el consentimiento retirado`);
      },
    },
    {
      id: "CA-010.48c",
      descripcion: "aplicar una plantilla cuenta para el límite y responde 429",
      correr: async () => {
        await reiniciarPlantillas();
        const plantillaId = await plantillaLista();
        await sembrarAuditoria(LIMITE_DIARIO_DESGLOSE, { userId: COACH, accion: ACCION_RESERVA_DESGLOSE });
        const sinLlamar = modelo();
        esperarError(await aplicarPlantilla(coach, ENG.principal, { plantillaId }, sinLlamar), 429, TEXTOS_COACH.LIMITE_ALCANZADO, "aplicar con el límite lleno");
        esperarError(await pedirDesglose(coach, ENG.principal, PEDIDO, sinLlamar), 429, TEXTOS_COACH.LIMITE_ALCANZADO, "pedir con el límite lleno por aplicar");
        revisar(sinLlamar.llamadas() === 0, "se llamó al modelo");
      },
    },
    {
      id: "CA-010.44",
      descripcion: "el coach lee qué cambió, con las dos versiones; todo igual y sin notas se dice; la persona no ve la plantilla ni la diferencia",
      correr: async () => {
        await reiniciarPlantillas();
        const plantillaId = await plantillaLista();
        const [p1, p2] = (await plantillasDe(ENG.principal))[0]!.pasos;

        // Los mismos pasos, sin notas.
        const igual = await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, modelo([{ pasos: [paso(p1!.accion, { criterioTerminado: p1!.criterioTerminado, apoyoRef: "A-02" }), paso(p2!.accion, { criterioTerminado: p2!.criterioTerminado })] }]));
        esperar(igual, 201, "aplicar igual");
        const leerCoach = (id: string) => withRls(coach.claims, (tx) => leerTareaCoach(tx, ENG.ajena, id, PERSONAS.ajena));
        const detalleIgual = await leerCoach(cuerpo(igual).breakdownId!);
        revisar(detalleIgual?.plantilla?.disponible === true && detalleIgual.plantilla.quedoIgual, "no dice que quedó igual");

        // Uno cambia y uno nuevo, con nota.
        const cambio = await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, modelo([{ pasos: [paso(p1!.accion, { criterioTerminado: "El documento nuevo tiene nombre y está abierto.", apoyoRef: "A-02", notaApoyo: "una lista corta" }), paso("Revisa la lista de pendientes")] }]));
        esperar(cambio, 201, "aplicar con cambios");
        const id = cuerpo(cambio).breakdownId!;
        const detalle = await leerCoach(id);
        revisar(detalle?.plantilla?.disponible === true && !detalle.plantilla.quedoIgual, "dice que quedó igual");
        const tipos = detalle.plantilla.diferencia.map((d) => `${d.tipo}:${d.antes}:${d.ahora}:${d.conNota}`).join();
        revisar(tipos === "ajustado:1:1:true,agregado:null:2:false,quitado:2:null:false", `la diferencia: ${tipos}`);
        revisar(detalle.plantilla.diferencia[0]!.pasoAntes?.criterioTerminado === p1!.criterioTerminado, "no trae la versión de antes");

        // La persona: ni el id de la plantilla ni la diferencia.
        const vista = await withRls(personaAjena.claims, (tx) => leerTareaPersona(tx, ENG.ajena, id, PERSONAS.ajena));
        revisar(vista && !vista.archivada, "la persona no lee su tarea");
        const vistaJson = JSON.stringify(vista);
        revisar(!vistaJson.includes(plantillaId) && !/plantilla/i.test(vistaJson), "la persona lee algo de la plantilla");

        // Una archivada se sigue comparando.
        esperar(await archivarPlantilla(coach, plantillaId, { accion: "archivar" }), 200, "archivar");
        revisar((await leerCoach(id))?.plantilla?.disponible === true, "archivada ya no se compara");
      },
    },
    {
      id: "CA-010.45b",
      descripcion: "con el retiro del origen, la plantilla deja de verse para todos, no se guarda otra, no se archiva y no se borra; un desglose de otra persona sigue igual y dice que no se puede comparar; vuelve con el consentimiento; la purga deja plantilla_id nulo",
      correr: async () => {
        await reiniciarPlantillas();
        const plantillaId = await plantillaLista();
        const aplicado = await aplicarPlantilla(coach, ENG.ajena, { plantillaId }, modelo());
        esperar(aplicado, 201, "aplicar");
        const id = cuerpo(aplicado).breakdownId!;
        const leerCoach = () => withRls(coach.claims, (tx) => leerTareaCoach(tx, ENG.ajena, id, PERSONAS.ajena));
        const antes = await filaDesglose(id);
        const origen = (await sql`select id from app.task_breakdowns where engagement_id = ${ENG.principal}`)[0]!.id as string;

        await retirar(ENG.principal, PERSONAS.principal);
        try {
          for (const c of [coach, coachAjeno]) {
            revisar(!(await withRls(c.claims, (tx) => leerPlantillas(tx))).some((p) => p.id === plantillaId), "un coach la sigue viendo");
          }
          esperarError(await archivarPlantilla(coachAjeno, plantillaId, { accion: "archivar" }), 404, MENSAJES_PLANTILLAS.noDisponible, "archivar");
          esperarError(await guardarPlantilla(coach, cuerpoPlantilla(origen)), 404, MENSAJES_PLANTILLAS.sinTarea, "guardar otra");
          revisar((await plantillasDe(ENG.principal)).length === 1, "se borró o se guardó otra");
          const detalle = await leerCoach();
          revisar(detalle?.plantilla?.disponible === false, "se puede comparar sin leer la plantilla");
          revisar(detalle.pasos.length === antes.pasos.length, "el desglose cambió");
          revisar(JSON.stringify(await filaDesglose(id)) === JSON.stringify(antes), "la fila del desglose cambió");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
        revisar((await withRls(coach.claims, (tx) => leerPlantillas(tx))).some((p) => p.id === plantillaId), "no volvió con el consentimiento");
        revisar((await leerCoach())?.plantilla?.disponible === true, "la comparación no volvió");

        // Lo que hace la purga: el desglose de otra persona sigue, sin plantilla, y no hay comparación que decir.
        await sql`delete from app.task_templates where id = ${plantillaId}`;
        revisar((await filaDesglose(id)).plantilla_id === null, "plantilla_id no quedó nulo");
        revisar((await leerCoach())?.plantilla === null, "sigue comparando");
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  let fallas = 0;
  let total = 0;
  try {
    await preparar();
    // El log del servidor de estas funciones sí se revisa: no debe traer texto de la tarea ni de los pasos (C-17).
    const errorOriginal = console.error;
    const lineas: string[] = [];
    console.error = (...args: unknown[]) => void lineas.push(args.join(" "));
    try {
      for (const caso of casos()) {
        total++;
        try {
          await caso.correr();
          console.log(`OK    ${caso.id} ${caso.descripcion}`);
        } catch (e) {
          fallas++;
          console.log(`FALLA ${caso.id} ${caso.descripcion}`);
          console.log(`      ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
        }
      }
    } finally {
      console.error = errorOriginal;
    }
    total++;
    const prohibidos = [...CENTINELAS_INTERNOS, RESUMEN_INICIO, RESUMEN_FORTALEZA, TEXTO_OBJETIVO, TAREA, "Frase única de la marca para la auditoría"];
    const conTexto = lineas.filter((l) => prohibidos.some((t) => l.includes(t)));
    if (conTexto.length > 0) {
      fallas++;
      console.log(`FALLA R-010.47 el log del servidor trae texto de la tarea o del perfil: ${conTexto.length} líneas`);
    } else {
      console.log(`OK    R-010.47 ${lineas.length} líneas de log del servidor, ninguna con texto de la tarea o del perfil`);
    }
  } finally {
    await limpiar();
    await sql.end();
  }
  console.log(`\n${total - fallas} de ${total} casos pasaron. ${fallas ? `${fallas} fallaron.` : "Ninguno falló."} Se borró lo creado.`);
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error("desglose-check no pudo correr:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
