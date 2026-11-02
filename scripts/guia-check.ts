// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Pruebas de ruta de la spec 009 (tarea 17): CA-009.4, .7, .8, .13, .14, .18 a .26, .28, .31, .43, .45, .46,
// .53, .55, .58 y .59. Lo que leen las pantallas (tareas 18 a 20): CA-009.13, .29, .34, .39, .40 y .56. Y la
// regeneración (tarea 22): CA-009.1, .40 a .45, con compararConBase por la ruta.
// Llama a las funciones de lib/ que usan los route.ts y las páginas, con un modelo simulado y cuentas
// sintéticas. Sin red y sin caminos de prueba en el servidor. La capa de cookies, el 401 y lo que se pinta se
// cubren en el navegador.
// Uso: npm run guia-check  (necesita DATABASE_URL en .env.local, las migraciones y el seed).
//
// Crea sus propios acompañamientos con ids fijos y los borra al empezar y al terminar. No toca el demo ni
// otras cuentas. Imprime "OK|FALLA <ID> <descripción>" por caso y sale con 1 si alguno falla.
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { llamadasDeHoy } from "@/lib/ai/limite";
import type { ResultadoGuiaModelo } from "@/lib/ai/propose-shared-guide";
import type { RespuestaRuta, UsuarioRuta } from "@/lib/api/ruta";
import { withRls } from "@/lib/db/rls";
import { sharedGuides } from "@/lib/db/schema";
import { hoyEnMonterrey } from "@/lib/followup/fecha";
import {
  agregarLinea,
  borrarLineaPropia,
  cambiarNombre,
  copiarVersion,
  decidirLinea,
  descartarBorrador,
  marcarLista as marcarListaConHuella,
  MENSAJES_ACCIONES,
  retirarVersion,
} from "@/lib/guia/acciones";
import { cambiosDeGuia } from "@/lib/guia/documento";
import { ACCION_GUIA, ACCION_RESERVA_GUIA, LIMITE_DIARIO_GUIA, MENSAJES_GUIA, pedirBorradorCoach, pedirBorradorPersona, type DepsGuia } from "@/lib/guia/generar";
import { leerGuiasPersona, leerHoja, leerVersionesCoach, leerVistaPrevia } from "@/lib/guia/lectura";
import { GuiaVista, huellaDeGuia, LineaGuia, type DocumentoGuia, type GuiaPropuesta, type SeccionGuia } from "@/lib/guia/schema";
import { mensajeBloqueo } from "@/lib/guia/terminos";
import { AVISO_VERSION } from "@/lib/legal/aviso";
import { mensajeUsuarioGuia, PROMPT_VERSION_GUIA, type EntradaGuiaModelo } from "@/lib/prompts";
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
const COACH_AJENO = "c9000000-0000-4000-8000-000000000001";

const PERSONAS = {
  principal: "c9000000-0000-4000-8000-000000000011",
  sinPlan: "c9000000-0000-4000-8000-000000000012",
  ajena: "c9000000-0000-4000-8000-000000000013",
  sinOrigenes: "c9000000-0000-4000-8000-000000000014",
} as const;
const ENG = {
  principal: "c9000000-0000-4000-8000-000000000021",
  sinPlan: "c9000000-0000-4000-8000-000000000022",
  ajena: "c9000000-0000-4000-8000-000000000023",
  sinOrigenes: "c9000000-0000-4000-8000-000000000024",
} as const;
const TODOS_ENG = Object.values(ENG);

const comoUsuario = (id: string): UsuarioRuta => ({ id, claims: { sub: id, role: "authenticated" } });
const coach = comoUsuario(COACH);
const coachAjeno = comoUsuario(COACH_AJENO);
const persona = comoUsuario(PERSONAS.principal);
const personaAjena = comoUsuario(PERSONAS.ajena);

const NOMBRE = "Luz";

// Textos centinela. Ninguno debe salir en una respuesta, en la fila de la guía ni en un log.
const CITA_PERFIL = "repite en voz alta los acuerdos de la junta";
const CITA_SENAL = "dijo que quiere cambiarse de área este año";
const CITA_PLAN = "pidió que le dejen la lista en su escritorio";
const DESC_OBJETIVO = "Descripción del objetivo que la persona no lee";
const DESC_APOYO = "Descripción del apoyo que la persona no lee";
const DESC_EQUIPO = "El equipo revisa los pendientes cada lunes por la mañana";
const DESC_AJUSTE = "Un lugar de trabajo con menos ruido por la tarde";
const DESC_INSTRUCCION = "Dar cada instrucción nueva también por escrito";
const DESC_LIDER = "Avisar los cambios de prioridad con un día de anticipación";
const TEXTO_OBJETIVO = "Revisa tu lista de pendientes cada mañana.";
const TEXTO_APOYO = "Usa una sola lista para todos tus pendientes.";
const RESUMEN = "Prefiere los acuerdos por escrito y los revisa con calma.";
const CEDULA = "7654321";

const CENTINELAS_INTERNOS = [CITA_PERFIL, CITA_SENAL, CITA_PLAN, DESC_OBJETIVO, DESC_APOYO, DESC_EQUIPO, DESC_AJUSTE, DESC_INSTRUCCION, DESC_LIDER, CEDULA];

// Salida del modelo. Una línea por sección, todas pasan la limpieza.
const L = {
  comunicacion: "Instrucciones por escrito después de la reunión.",
  ayuda: "Un solo canal para pendientes.",
  cuesta: "Me cuesta empezar sin pasos claros; pido una lista corta.",
  cambios: "Avísame de los cambios con un día de anticipación.",
  esperar: "Reviso mis entregas antes de mandarlas.",
} as const;

const lineaIa = (seccion: SeccionGuia, texto: string, origenes = ["O-01"]) => ({ seccion, texto, origenes });

const SALIDA_BUENA: GuiaPropuesta = {
  lineas: [lineaIa("comunicacion", L.comunicacion), lineaIa("ayuda", L.ayuda), lineaIa("cuesta_y_pido", L.cuesta), lineaIa("cambios", L.cambios), lineaIa("esperar", L.esperar)],
};

const SECCIONES: SeccionGuia[] = ["comunicacion", "ayuda", "cuesta_y_pido", "cambios", "esperar"];

// 25 líneas distintas: el máximo que deja la limpieza (R-009.5).
const SALIDA_LLENA: GuiaPropuesta = {
  lineas: SECCIONES.flatMap((seccion) => [1, 2, 3, 4, 5].map((n) => lineaIa(seccion, `Apoyo concreto número ${n} de la sección ${seccion}.`))),
};

// ---------------------------------------------------------------------------
// Modelo simulado
// ---------------------------------------------------------------------------

const USO = { entrada: 100, salida: 50, cacheLectura: 0 };

// Una salida que no cumple el esquema también llega: la revisa el código, no el tipo. Cuenta las llamadas: un
// 409 antes del modelo no debe llegar aquí. Guarda lo que recibió para revisar qué le llega al modelo.
function modelo(salida: unknown = SALIDA_BUENA, alLlamar?: () => void | Promise<void>): DepsGuia & { llamadas: () => number; entradas: EntradaGuiaModelo[] } {
  const entradas: EntradaGuiaModelo[] = [];
  return {
    entradas,
    llamadas: () => entradas.length,
    proponer: async (entrada): Promise<ResultadoGuiaModelo> => {
      entradas.push(entrada);
      await alLlamar?.();
      return { salida: salida as GuiaPropuesta, usage: USO, latenciaMs: 7, modelo: "modelo-simulado", promptVersion: PROMPT_VERSION_GUIA };
    },
  };
}

function modeloQueFalla(mensaje = `el proveedor repitió ${DESC_LIDER}`): DepsGuia & { llamadas: () => number } {
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

// Perfil aprobado: el snapshot con citas y la copia para la persona. Devuelve el id del snapshot.
async function sembrarPerfil(engagementId: string, dimensiones = { comunicacion_escrita: { resumen: RESUMEN, tipo: "fortaleza" } } as Record<string, { resumen: string; tipo: string }>) {
  const [s] = await sql`insert into app.sessions (engagement_id, coach_id, nota_original) values (${engagementId}, ${COACH}, ${`Nota con ${CITA_PERFIL}.`}) returning id`;
  const sessionId = s.id as string;
  const [e] = await sql`
    insert into app.profile_events (engagement_id, session_id, tipo, status, payload, created_by, decided_by, decided_at)
    values (${engagementId}, ${sessionId}, 'propuesta_ia', 'approved',
      ${sql.json({ tipo: "propuesta_ia", update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] }, descartados: [], banderas: [], indiceObservaciones: [] })},
      ${COACH}, ${COACH}, now()) returning id`;
  const conEvidencia = Object.fromEntries(
    Object.entries(dimensiones).map(([id, d]) => [id, { ...d, dominiosFE: [], evidencia: [{ id: randomUUID(), cita: CITA_PERFIL, sessionId }] }]),
  );
  const perfil = { dimensiones: conEvidencia, senalesActivas: [{ tipo: "cambio_de_vida", descripcion: "Una señal sintética.", evidencia: [{ cita: CITA_SENAL, sessionId }] }] };
  const [snap] = await sql`
    insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
    values (${engagementId}, 1, ${sql.json(perfil)}, ${e.id as string}, ${COACH}) returning id`;
  await sql`insert into app.persona_profiles (snapshot_id, engagement_id, version, contenido) values (${snap.id as string}, ${engagementId}, 1, ${sql.json({ dimensiones })})`;
  return snap.id as string;
}

async function sembrarPlan(engagementId: string, snapshotId: string, items: { tipo: string; descripcion: string; textoPersona?: string; cita?: string }[]) {
  const [plan] = await sql`
    insert into app.plans (engagement_id, titulo, status, version, profile_snapshot_id, created_by, approved_by, approved_at)
    values (${engagementId}, 'Plan sintético', 'aprobado', 1, ${snapshotId}, ${COACH}, ${COACH}, now()) returning id`;
  let orden = 0;
  for (const it of items) {
    await sql`
      insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, texto_persona, evidencia, orden)
      values (${plan.id as string}, ${engagementId}, ${it.tipo}, ${it.descripcion}, ${it.textoPersona ?? null}, ${sql.json(it.cita ? [{ cita: it.cita }] : [])}, ${orden++})`;
  }
}

async function preparar() {
  await limpiar();
  await crearUsuario(COACH_AJENO, "coach-ajeno-gc@caja-mex.test", "coach", "Coach Ajeno");
  await crearUsuario(PERSONAS.principal, "persona-gc@caja-mex.test", "persona", NOMBRE);
  await crearUsuario(PERSONAS.sinPlan, "persona-sin-plan-gc@caja-mex.test", "persona", "Noa");
  await crearUsuario(PERSONAS.ajena, "persona-ajena-gc@caja-mex.test", "persona", "Ale");
  await crearUsuario(PERSONAS.sinOrigenes, "persona-sin-origenes-gc@caja-mex.test", "persona", "Río");
  await crearEngagement(ENG.principal, PERSONAS.principal);
  await crearEngagement(ENG.sinPlan, PERSONAS.sinPlan);
  await crearEngagement(ENG.ajena, PERSONAS.ajena);
  await crearEngagement(ENG.sinOrigenes, PERSONAS.sinOrigenes);

  const snap = await sembrarPerfil(ENG.principal);
  await sembrarPlan(ENG.principal, snap, [
    { tipo: "objetivo", descripcion: DESC_OBJETIVO, textoPersona: TEXTO_OBJETIVO, cita: CITA_PLAN },
    { tipo: "apoyo_fe", descripcion: DESC_APOYO, textoPersona: TEXTO_APOYO },
    { tipo: "objetivo_equipo", descripcion: DESC_EQUIPO },
    { tipo: "ajuste_razonable", descripcion: DESC_AJUSTE },
    { tipo: "instruccion", descripcion: DESC_INSTRUCCION },
    { tipo: "comunicacion_lider", descripcion: DESC_LIDER },
    // R-009.9: copia una cita, así que no entra.
    { tipo: "comunicacion_lider", descripcion: `Decirle al líder que ${CITA_PLAN}.` },
    // R-009.7: sin texto para la persona, no entra.
    { tipo: "apoyo_fe", descripcion: "Apoyo sin texto para la persona" },
  ]);

  // Perfil sin plan aprobado (CA-009.20).
  await sembrarPerfil(ENG.sinPlan);

  const snapAjena = await sembrarPerfil(ENG.ajena);
  await sembrarPlan(ENG.ajena, snapAjena, [{ tipo: "instruccion", descripcion: DESC_INSTRUCCION }]);

  // Todo queda fuera por R-009.9: no hay de dónde escribir.
  const snapSinOrigenes = await sembrarPerfil(ENG.sinOrigenes, { concentracion: { resumen: "Tiene TDAH según su coach.", tipo: "contexto" } });
  await sembrarPlan(ENG.sinOrigenes, snapSinOrigenes, [{ tipo: "instruccion", descripcion: "Va a terapia los jueves." }]);
}

// Vuelve al punto de partida: sin guías ni llamadas, con consentimiento.
async function reiniciar(engagementId: string = ENG.principal) {
  await sql`delete from app.shared_guides where engagement_id = ${engagementId}`;
  await sql`delete from app.audit_log where engagement_id = ${engagementId}`;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

class Falla extends Error {}

function revisar(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new Falla(mensaje);
}

const cuerpo = (r: RespuestaRuta) => r.cuerpo as { error?: string; guia?: GuiaVista };

function esperar(r: RespuestaRuta, status: number, que: string) {
  revisar(r.status === status, `${que}: se esperaba ${status} y llegó ${r.status} (${cuerpo(r).error ?? "sin error"})`);
}

function esperarError(r: RespuestaRuta, status: number, texto: string, que: string) {
  esperar(r, status, que);
  revisar(cuerpo(r).error === texto, `${que}: el texto no es el de la spec: ${cuerpo(r).error}`);
  revisar(Object.keys(r.cuerpo as object).join() === "error", `${que}: el cuerpo trae más que el error`);
}

async function contar(tabla: string, engagementId: string, extra = ""): Promise<number> {
  const [r] = await sql.unsafe(`select count(*)::int as n from app.${tabla} where engagement_id = $1 ${extra}`, [engagementId]);
  return r.n as number;
}

const contarAuditoria = (engagementId: string = ENG.principal) => contar("audit_log", engagementId, `and accion = '${ACCION_GUIA}'`);
const contarGuias = (engagementId: string = ENG.principal) => contar("shared_guides", engagementId);
const contarReservas = (engagementId: string = ENG.principal) => contar("audit_log", engagementId, `and accion = '${ACCION_RESERVA_GUIA}'`);

// Las filas de una tabla tal como están, para comparar antes y después.
async function fotografia(tabla: string, engagementId: string, columna = "engagement_id"): Promise<string> {
  const filas = await sql.unsafe(`select to_jsonb(t) as fila from app.${tabla} t where ${columna} = $1 order by (to_jsonb(t))::text`, [engagementId]);
  return JSON.stringify(filas.map((f) => f.fila as unknown));
}

type FilaGuia = {
  id: string;
  estado: string;
  version: number | null;
  nombre_a_mostrar: string;
  lineas: LineaGuia[];
  documento: DocumentoGuia | null;
  descartes: Record<string, number>;
  guia_base_id: string | null;
  generada_por: string;
  prompt_version: string | null;
  model: string | null;
  aprobada_por_persona_en: Date | null;
  retirada_en: Date | null;
  descartada_en: Date | null;
};

async function filaGuia(id: string): Promise<FilaGuia> {
  const [f] = await sql`select * from app.shared_guides where id = ${id}`;
  return f as unknown as FilaGuia;
}

async function ultimaGuia(engagementId: string = ENG.principal): Promise<FilaGuia> {
  const [f] = await sql`select * from app.shared_guides where engagement_id = ${engagementId} order by created_at desc limit 1`;
  return f as unknown as FilaGuia;
}

const leerLineas = async (id: string) => (await filaGuia(id)).lineas;

// "Listo" con la huella de lo que hay en la base: la pantalla está al día (R-009.29). El caso de la pestaña vieja manda
// la suya con marcarListaConHuella.
async function huellaActual(id: string): Promise<string> {
  const f = await filaGuia(id);
  return huellaDeGuia({ nombreAMostrar: f.nombre_a_mostrar, lineas: f.lineas });
}
const marcarLista = async (u: UsuarioRuta, id: string) => marcarListaConHuella(u, id, { huella: await huellaActual(id) });

// Pide un borrador que sí se guarda, como la persona. Devuelve la vista.
async function borrador(salida: unknown = SALIDA_BUENA): Promise<GuiaVista> {
  const r = await pedirBorradorPersona(persona, modelo(salida));
  esperar(r, 201, "pedir el borrador");
  return GuiaVista.parse(cuerpo(r).guia);
}

const lineaDe = (g: GuiaVista, texto: string) => {
  const linea = g.lineas.find((l) => l.textoIa === texto || l.texto === texto);
  revisar(linea, `no está la línea: ${texto}`);
  return linea;
};

// Incluye las que siguen pendientes en la base, para que "Listo" pase. "salvo" las deja sin decidir.
async function incluirTodas(g: GuiaVista, salvo: string[] = []) {
  for (const l of (await leerLineas(g.id)).filter((x) => x.estado === "pendiente" && !salvo.includes(x.id))) {
    esperar(await decidirLinea(persona, g.id, l.id, { accion: "incluir" }), 200, "incluir");
  }
}

// Una versión lista, por las rutas. Devuelve su id.
async function versionLista(salida: unknown = SALIDA_BUENA): Promise<string> {
  const g = await borrador(salida);
  await incluirTodas(g);
  esperar(await marcarLista(persona, g.id), 200, "marcar lista");
  return g.id;
}

// Cambia lineas de un borrador como owner, para llegar directo a un estado.
async function fijarLineas(id: string, lineas: LineaGuia[]) {
  await sql`update app.shared_guides set lineas = ${sql.json(JSON.parse(JSON.stringify(lineas)))} where id = ${id}`;
}

const coachLee = (id: string) => withRls(coach.claims, (tx) => tx.select({ id: sharedGuides.id }).from(sharedGuides).where(eq(sharedGuides.id, id)));

// ---------------------------------------------------------------------------
// Regeneración (tarea 22): perfil y plan nuevos, como owner
// ---------------------------------------------------------------------------

// Lo que hay que borrar al terminar, para volver al perfil y al plan de preparar().
const insumosCreados: { plan: string[]; snapshot: string[]; evento: string[]; sesion: string[] } = { plan: [], snapshot: [], evento: [], sesion: [] };

async function borrarInsumosCreados() {
  for (const plan of insumosCreados.plan) {
    await sql`delete from app.persona_plans where plan_id = ${plan}`;
    await sql`delete from app.plan_items where plan_id = ${plan}`;
    await sql`delete from app.plans where id = ${plan}`;
  }
  for (const id of insumosCreados.snapshot) await sql`delete from app.profile_snapshots where id = ${id}`;
  for (const id of insumosCreados.evento) await sql`delete from app.profile_events where id = ${id}`;
  for (const id of insumosCreados.sesion) await sql`delete from app.sessions where id = ${id}`;
  insumosCreados.plan = [];
  insumosCreados.snapshot = [];
  insumosCreados.evento = [];
  insumosCreados.sesion = [];
}

// Lo que corre con insumos nuevos: pase lo que pase, regresa al punto de partida.
async function conInsumosNuevos(correr: () => Promise<void>) {
  await reiniciar();
  try {
    await correr();
  } finally {
    await reiniciar();
    await borrarInsumosCreados();
  }
}

// Una versión nueva del perfil. "contenido" es lo que la persona lee; sin él, el mismo de la versión anterior, como
// cuando solo se aprueba una señal (R-009.46).
async function perfilNuevo(contenido?: Record<string, { resumen: string; tipo: string }>) {
  const [ultimo] = await sql`
    select s.source_event_id, s.perfil, s.version, p.contenido from app.profile_snapshots s
      join app.persona_profiles p on p.snapshot_id = s.id
     where s.engagement_id = ${ENG.principal} order by s.version desc limit 1`;
  const version = (ultimo.version as number) + 1;
  // Cada sesión tiene una sola propuesta (profile_events_una_propuesta).
  const [s] = await sql`insert into app.sessions (engagement_id, coach_id, nota_original) values (${ENG.principal}, ${COACH}, 'Nota sintética sin más datos.') returning id`;
  const [e] = await sql`
    insert into app.profile_events (engagement_id, session_id, tipo, status, payload, created_by, decided_by, decided_at)
    select engagement_id, ${s.id as string}, tipo, status, payload, created_by, decided_by, decided_at from app.profile_events where id = ${ultimo.source_event_id as string} returning id`;
  const [snap] = await sql`
    insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
    values (${ENG.principal}, ${version}, ${sql.json(ultimo.perfil as never)}, ${e.id as string}, ${COACH}) returning id`;
  const nuevo = contenido ? { dimensiones: contenido } : (ultimo.contenido as never);
  await sql`insert into app.persona_profiles (snapshot_id, engagement_id, version, contenido) values (${snap.id as string}, ${ENG.principal}, ${version}, ${sql.json(nuevo)})`;
  insumosCreados.sesion.push(s.id as string);
  insumosCreados.evento.push(e.id as string);
  insumosCreados.snapshot.push(snap.id as string);
}

type ItemNuevo = { de?: string; tipo: string; descripcion: string; textoPersona?: string };

// Un plan aprobado nuevo, con su copia para la persona. "de" es la descripción del ítem de la versión anterior del
// que sale: así se llena origen_item_id. Un ítem sin "de" es nuevo, y uno que no se menciona ya no está.
async function planNuevo(items: ItemNuevo[]) {
  const [anterior] = await sql`select id, version, profile_snapshot_id from app.plans where engagement_id = ${ENG.principal} and status = 'aprobado' order by version desc limit 1`;
  const version = (anterior.version as number) + 1;
  const [plan] = await sql`
    insert into app.plans (engagement_id, titulo, status, version, profile_snapshot_id, created_by, approved_by, approved_at)
    values (${ENG.principal}, 'Plan sintético', 'aprobado', ${version}, ${anterior.profile_snapshot_id as string}, ${COACH}, ${COACH}, now()) returning id`;
  insumosCreados.plan.unshift(plan.id as string);
  let orden = 0;
  for (const it of items) {
    let origen: string | null = null;
    if (it.de) {
      const [fila] = await sql`select id from app.plan_items where plan_id = ${anterior.id as string} and descripcion = ${it.de}`;
      revisar(fila, `no está el ítem: ${it.de}`);
      origen = fila.id as string;
    }
    await sql`
      insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, texto_persona, evidencia, orden, origen_item_id)
      values (${plan.id as string}, ${ENG.principal}, ${it.tipo}, ${it.descripcion}, ${it.textoPersona ?? null}, ${sql.json([])}, ${orden++}, ${origen})`;
  }
  await sql`insert into app.persona_plans (plan_id, engagement_id, version, contenido) values (${plan.id as string}, ${ENG.principal}, ${version}, ${sql.json({ items: [] })})`;
}

// Los ítems del plan de preparar() que entran al modelo, sin cambios, con su origen.
const ITEMS_IGUALES: ItemNuevo[] = [
  { de: DESC_OBJETIVO, tipo: "objetivo", descripcion: DESC_OBJETIVO, textoPersona: TEXTO_OBJETIVO },
  { de: DESC_APOYO, tipo: "apoyo_fe", descripcion: DESC_APOYO, textoPersona: TEXTO_APOYO },
  { de: DESC_EQUIPO, tipo: "objetivo_equipo", descripcion: DESC_EQUIPO },
  { de: DESC_AJUSTE, tipo: "ajuste_razonable", descripcion: DESC_AJUSTE },
  { de: DESC_INSTRUCCION, tipo: "instruccion", descripcion: DESC_INSTRUCCION },
  { de: DESC_LIDER, tipo: "comunicacion_lider", descripcion: DESC_LIDER },
];

const conCambiado = (de: string, cambios: Partial<ItemNuevo>) => ITEMS_IGUALES.map((i) => (i.de === de ? { ...i, ...cambios } : i));

// O-nn de la primera generación, en el orden de armarEntradaGuia: la dimensión y los ítems que entran.
const O = { dimension: "O-01", objetivo: "O-02", apoyo: "O-03", equipo: "O-04", ajuste: "O-05", instruccion: "O-06", lider: "O-07" } as const;

// Una línea por origen del plan, para saber de dónde sale cada una.
const T = {
  objetivo: "Lista de pendientes revisada cada mañana.",
  apoyo: "Un solo lugar para mis pendientes.",
  equipo: "Reviso mis entregas antes de mandarlas.",
  ajuste: "Me cuesta concentrarme con ruido; pido un lugar más tranquilo.",
  instruccion: "Instrucciones por escrito después de la reunión.",
  lider: "Avísame de los cambios con un día de anticipación.",
} as const;

const SALIDA_POR_ORIGEN: GuiaPropuesta = {
  lineas: [
    lineaIa("ayuda", T.objetivo, [O.objetivo]),
    lineaIa("ayuda", T.apoyo, [O.apoyo]),
    lineaIa("esperar", T.equipo, [O.equipo]),
    lineaIa("cuesta_y_pido", T.ajuste, [O.ajuste]),
    lineaIa("comunicacion", T.instruccion, [O.instruccion]),
    lineaIa("cambios", T.lider, [O.lider]),
  ],
};

const leerPersona = () => withRls(persona.claims, (tx) => leerGuiasPersona(tx, ENG.principal, PERSONAS.principal));

// Pide la regeneración y revisa que responda como la persona espera. Devuelve la vista.
async function regenerar(m: DepsGuia): Promise<GuiaVista> {
  const r = await pedirBorradorPersona(persona, m);
  esperar(r, 201, "regenerar");
  revisar(!JSON.stringify(r.cuerpo).includes("origenes"), "la respuesta trae orígenes (R-009.33)");
  return GuiaVista.parse(cuerpo(r).guia);
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

type Caso = { id: string; descripcion: string; correr: () => Promise<void> };

function casos(): Caso[] {
  return [
    {
      id: "CA-009.4",
      descripcion: "cuando pide el coach, la respuesta no trae líneas, id ni conteos, y el coach no lee lo que insertó",
      correr: async () => {
        await reiniciar();
        const m = modelo({ lineas: [...SALIDA_BUENA.lineas, lineaIa("ayuda", "Tengo TDAH y uso lista.")] });
        const r = await pedirBorradorCoach(coach, ENG.principal, m);
        esperar(r, 201, "pedir como coach");
        revisar(JSON.stringify(r.cuerpo) === "{}", `el cuerpo no va vacío: ${JSON.stringify(r.cuerpo)}`);
        revisar(m.llamadas() === 1, "no se llamó al modelo");
        const g = await ultimaGuia();
        revisar(g.estado === "borrador" && g.generada_por === COACH, "la fila no dice que la pidió el coach");
        revisar(g.nombre_a_mostrar === NOMBRE, "el nombre inicial no es el nombre de pila");
        revisar(g.prompt_version === PROMPT_VERSION_GUIA && g.model === "modelo-simulado", "la fila no guarda prompt_version y model");
        revisar(g.lineas.length === 5, "no se guardaron las líneas");
        revisar((await coachLee(g.id)).length === 0, "el coach lee el borrador que pidió");
      },
    },
    {
      id: "CA-009.5",
      descripcion: "lo descartado no queda en lineas ni en la respuesta: solo conteos por motivo y el total en la vista",
      correr: async () => {
        await reiniciar();
        const g = await borrador({ lineas: [lineaIa("ayuda", L.ayuda), lineaIa("ayuda", "Tengo TDAH y uso lista."), lineaIa("ayuda", `Sabe que ${CITA_PERFIL}.`), lineaIa("ayuda", "Un apoyo con origen malo.", ["O-99"])] });
        revisar(g.lineas.length === 1 && g.descartadas === 3, `quedaron ${g.lineas.length} líneas y ${g.descartadas} descartadas`);
        const fila = await ultimaGuia();
        revisar(fila.descartes.texto_no_permitido === 2 && fila.descartes.origen_no_existe === 1 && Object.keys(fila.descartes).length === 2, `descartes: ${JSON.stringify(fila.descartes)}`);
        const todo = JSON.stringify(fila);
        for (const texto of ["TDAH", CITA_PERFIL, "origen malo"]) revisar(!todo.includes(texto), `la fila trae: ${texto}`);
      },
    },
    {
      id: "CA-009.7",
      descripcion: "con el consentimiento retirado, persona y coach reciben 409, sin modelo ni audit_log; las acciones también",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        await retirar(ENG.principal, PERSONAS.principal);
        try {
          const audit = await contarAuditoria();
          const guias = await contarGuias();
          const m = modelo();
          esperarError(await pedirBorradorPersona(persona, m), 409, MENSAJES_GUIA.personaSinConsentimiento, "persona");
          esperarError(await pedirBorradorCoach(coach, ENG.principal, m), 409, MENSAJES_GUIA.coachSinConsentimiento(NOMBRE), "coach");
          revisar(m.llamadas() === 0, "se llamó al modelo");
          revisar((await contarAuditoria()) === audit, "se escribió en audit_log");
          revisar((await contarGuias()) === guias, "se creó una guía");
          // R-009.52: la puerta protege páginas, no rutas.
          esperarError(await decidirLinea(persona, g.id, g.lineas[0].id, { accion: "incluir" }), 409, MENSAJES_GUIA.personaSinConsentimiento, "decidir");
          esperarError(await marcarLista(persona, g.id), 409, MENSAJES_GUIA.personaSinConsentimiento, "listo");
          esperarError(await copiarVersion(persona, g.id), 409, MENSAJES_GUIA.personaSinConsentimiento, "copiar");
        } finally {
          await otorgar(ENG.principal, PERSONAS.principal);
        }
      },
    },
    {
      id: "CA-009.8",
      descripcion: "si el consentimiento se retira mientras responde el modelo: 409 sin reintento, sin guía, y la llamada sí queda en audit_log",
      correr: async () => {
        for (const como of ["persona", "coach"] as const) {
          await reiniciar();
          const m = modelo(SALIDA_BUENA, () => retirar(ENG.principal, PERSONAS.principal));
          try {
            const r = como === "persona" ? await pedirBorradorPersona(persona, m) : await pedirBorradorCoach(coach, ENG.principal, m);
            esperarError(r, 409, como === "persona" ? MENSAJES_GUIA.personaRetiroDuranteLaLlamada : MENSAJES_GUIA.coachRetiroDuranteLaLlamada(NOMBRE), como);
          } finally {
            await otorgar(ENG.principal, PERSONAS.principal);
          }
          revisar((await contarGuias()) === 0, `${como}: se guardó la guía`);
          revisar((await contarAuditoria()) === 1, `${como}: la llamada no quedó en audit_log`);
        }
      },
    },
    {
      id: "CA-009.9",
      descripcion: "lo que le llega al modelo: sin citas, UUID, cédula ni lo escrito antes por la persona; sí los cuatro tipos internos",
      correr: async () => {
        await reiniciar();
        const m = modelo();
        esperar(await pedirBorradorPersona(persona, m), 201, "pedir");
        const mensaje = mensajeUsuarioGuia(m.entradas[0]);
        for (const fuera of [CITA_PERFIL, CITA_SENAL, CITA_PLAN, DESC_OBJETIVO, DESC_APOYO, CEDULA, "Apoyo sin texto", "Decirle al líder"]) {
          revisar(!mensaje.includes(fuera), `al modelo le llegó: ${fuera}`);
        }
        for (const dentro of [RESUMEN, TEXTO_OBJETIVO, TEXTO_APOYO, DESC_EQUIPO, DESC_AJUSTE, DESC_INSTRUCCION, DESC_LIDER]) {
          revisar(mensaje.includes(dentro), `al modelo no le llegó: ${dentro}`);
        }
        revisar(!/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(mensaje), "al modelo le llegó un UUID");
      },
    },
    {
      id: "CA-009.13",
      descripcion: "lo que responde la ruta a la persona no trae textos internos, citas ni orígenes, salvo lo que el modelo escribió como línea",
      correr: async () => {
        await reiniciar();
        const r = await pedirBorradorPersona(persona, modelo());
        esperar(r, 201, "pedir");
        revisar(GuiaVista.safeParse(cuerpo(r).guia).success, "la vista no cumple el esquema estricto");
        const texto = JSON.stringify(r.cuerpo);
        for (const fuera of [...CENTINELAS_INTERNOS, RESUMEN, TEXTO_OBJETIVO, "origenes", "planItemId", "lineaAnteriorId", "O-01", "descartes", "snapshotId", "hayVersiones"]) {
          revisar(!texto.includes(fuera), `la respuesta trae: ${fuera}`);
        }
        revisar(cuerpo(r).guia?.lineas.length === 5, "la respuesta no trae las líneas");
        // Las acciones responden con la misma vista.
        const g = GuiaVista.parse(cuerpo(r).guia);
        const incluida = await decidirLinea(persona, g.id, g.lineas[0].id, { accion: "incluir" });
        revisar(!JSON.stringify(incluida.cuerpo).includes("origenes"), "una acción devolvió orígenes");
      },
    },
    {
      id: "CA-009.14",
      descripcion: "una sección fuera de las cinco o un campo extra como dominio: 502, sin guardar y con ok = false",
      correr: async () => {
        for (const [nombre, salida] of [
          ["otra sección", { lineas: [{ seccion: "salud", texto: L.ayuda, origenes: ["O-01"] }] }],
          ["un campo dominio", { lineas: [{ seccion: "ayuda", texto: L.ayuda, origenes: ["O-01"], dominio: "iniciacion" }] }],
          ["una llave arriba", { lineas: [], severidad: 3 }],
        ] as const) {
          await reiniciar();
          esperarError(await pedirBorradorPersona(persona, modelo(salida)), 502, MENSAJES_GUIA.personaErrorModelo, nombre);
          revisar((await contarGuias()) === 0, `${nombre}: se guardó`);
          const [a] = await sql`select ok, error from app.audit_log where engagement_id = ${ENG.principal} and accion = ${ACCION_GUIA}`;
          revisar(a?.ok === false && a?.error === "esquema", `${nombre}: la auditoría no dice esquema: ${JSON.stringify(a)}`);
        }
      },
    },
    {
      id: "CA-009.18",
      descripcion: "con 5 llamadas de hoy responde 429 sin llamar al modelo; las fallidas cuentan; cada cuenta lleva las suyas; el día es el de Monterrey",
      correr: async () => {
        await reiniciar();
        const sembrar = async (userId: string, n: number) => {
          for (let i = 0; i < n; i++) {
            await sql`insert into app.audit_log (user_id, engagement_id, accion, ok) values (${userId}, ${ENG.principal}, ${ACCION_RESERVA_GUIA}, ${i % 2 === 0})`;
          }
        };
        await sembrar(PERSONAS.principal, LIMITE_DIARIO_GUIA - 1);
        // Una de ayer a las 23:30 de Monterrey no cuenta; otra acción tampoco.
        await sql`insert into app.audit_log (user_id, engagement_id, accion, ok, created_at) values (${PERSONAS.principal}, ${ENG.principal}, ${ACCION_RESERVA_GUIA}, true, ((${hoyEnMonterrey()}::date - 1) + time '23:30') at time zone 'America/Monterrey')`;
        await sql`insert into app.audit_log (user_id, engagement_id, accion, ok) values (${PERSONAS.principal}, ${ENG.principal}, 'propose_fe_domain_summary', true)`;
        const conEspacio = modelo();
        esperar(await pedirBorradorPersona(persona, conEspacio), 201, "la quinta llamada de hoy");
        revisar(conEspacio.llamadas() === 1, "no se llamó al modelo");

        await reiniciar();
        await sembrar(PERSONAS.principal, LIMITE_DIARIO_GUIA);
        const m = modelo();
        const audit = await contarAuditoria();
        const reservas = await contarReservas();
        esperarError(await pedirBorradorPersona(persona, m), 429, MENSAJES_GUIA.personaLimite, "la sexta llamada");
        revisar(m.llamadas() === 0, "se llamó al modelo");
        revisar((await contarAuditoria()) === audit, "se auditó el 429");
        revisar((await contarReservas()) === reservas, "el 429 apartó cupo");
        // Las de la persona no le cuentan al coach.
        esperar(await pedirBorradorCoach(coach, ENG.principal, modelo()), 201, "el coach con su propia cuenta");

        await reiniciar();
        await sql`insert into app.audit_log (user_id, engagement_id, accion, ok) values (${COACH}, ${ENG.principal}, ${ACCION_RESERVA_GUIA}, true)`;
        for (let i = 1; i < LIMITE_DIARIO_GUIA; i++) {
          await sql`insert into app.audit_log (user_id, engagement_id, accion, ok) values (${COACH}, ${ENG.principal}, ${ACCION_RESERVA_GUIA}, false)`;
        }
        esperarError(await pedirBorradorCoach(coach, ENG.principal, modelo()), 429, MENSAJES_GUIA.coachLimite, "el coach");

        // A las 23:30 de Monterrey ya es otro día en UTC, y todavía cuenta como el mismo.
        await reiniciar();
        await sql`insert into app.audit_log (user_id, engagement_id, accion, ok, created_at) values (${PERSONAS.principal}, ${ENG.principal}, ${ACCION_RESERVA_GUIA}, true, timestamp '2026-03-10 23:30' at time zone 'America/Monterrey')`;
        const contarEn = (ahora: Date) => withRls(persona.claims, (tx) => llamadasDeHoy(tx, PERSONAS.principal, ENG.principal, [ACCION_RESERVA_GUIA], ahora));
        revisar((await contarEn(new Date("2026-03-11T05:45:00.000Z"))) === 1, "las 23:45 de Monterrey no cuentan como el mismo día");
        revisar((await contarEn(new Date("2026-03-11T06:15:00.000Z"))) === 0, "las 00:15 de Monterrey cuentan como el día anterior");
      },
    },
    {
      id: "CA-009.19",
      descripcion: "una llamada exitosa y una fallida dejan dos filas, sin texto de la guía, del perfil ni del error",
      correr: async () => {
        await reiniciar();
        const falla = modeloQueFalla();
        esperarError(await pedirBorradorPersona(persona, falla), 502, MENSAJES_GUIA.personaErrorModelo, "falla");
        revisar(falla.llamadas() === 1, "no se llamó al modelo");
        revisar((await contarGuias()) === 0, "se guardó con la falla");
        esperar(await pedirBorradorPersona(persona, modelo()), 201, "éxito");
        const filas = await sql`select to_jsonb(a) as fila from app.audit_log a where engagement_id = ${ENG.principal} and accion = ${ACCION_GUIA} order by id`;
        revisar(filas.length === 2, `hay ${filas.length} filas`);
        const [mala, buena] = filas.map((f) => f.fila as { ok: boolean; error: string | null; prompt_version: string; modelo: string; tokens_entrada: number | null; latencia_ms: number });
        revisar(mala.ok === false && mala.error === "Error", `la fallida no lleva solo la clase: ${mala.error}`);
        revisar(mala.prompt_version === PROMPT_VERSION_GUIA, "la fallida no lleva la versión del prompt");
        revisar(buena.ok === true && buena.error === null, "la exitosa no dice ok");
        revisar(buena.modelo === "modelo-simulado" && buena.prompt_version === PROMPT_VERSION_GUIA && buena.tokens_entrada === USO.entrada && buena.latencia_ms === 7, "faltan datos de la llamada");
        const texto = JSON.stringify(filas);
        for (const fuera of [...Object.values(L), RESUMEN, DESC_LIDER, TEXTO_OBJETIVO]) revisar(!texto.includes(fuera), `la auditoría trae: ${fuera}`);
      },
    },
    {
      id: "CA-009.20",
      descripcion: "sin plan aprobado, o sin nada que pase el filtro: 409 con su texto, sin modelo ni audit_log",
      correr: async () => {
        const m = modelo();
        esperarError(await pedirBorradorPersona(comoUsuario(PERSONAS.sinPlan), m), 409, MENSAJES_GUIA.personaSinInsumos, "persona");
        esperarError(await pedirBorradorCoach(coach, ENG.sinPlan, m), 409, MENSAJES_GUIA.coachSinInsumos("Noa"), "coach");
        esperarError(await pedirBorradorPersona(comoUsuario(PERSONAS.sinOrigenes), m), 409, MENSAJES_GUIA.personaSinInsumos, "todo filtrado");
        revisar(m.llamadas() === 0, "se llamó al modelo");
        revisar((await contarAuditoria(ENG.sinPlan)) === 0 && (await contarAuditoria(ENG.sinOrigenes)) === 0, "se auditó");
      },
    },
    {
      id: "CA-009.21",
      descripcion: "con un borrador abierto: 409 sin modelo ni audit_log; dos pedidos simultáneos dejan uno, con el mismo 409",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        const m = modelo();
        const audit = await contarAuditoria();
        const reservas = await contarReservas();
        esperarError(await pedirBorradorCoach(coach, ENG.principal, m), 409, MENSAJES_GUIA.coachYaHayBorrador(NOMBRE), "coach");
        esperarError(await pedirBorradorPersona(persona, m), 409, MENSAJES_GUIA.personaYaHayBorrador, "persona");
        revisar(m.llamadas() === 0, "se llamó al modelo");
        revisar((await contarAuditoria()) === audit, "se auditó");
        revisar((await contarReservas()) === reservas, "un 409 antes del modelo apartó cupo (R-009.3)");

        // Otro pedido gana mientras responde el modelo: el 23505 de la base da el mismo 409.
        const lineas = await leerLineas(g.id);
        await reiniciar();
        const simultaneo = modelo(SALIDA_BUENA, async () => {
          await sql`
            insert into app.shared_guides (engagement_id, nombre_a_mostrar, lineas, generada_desde_snapshot_id, perfil_version, plan_version, generada_por)
            select ${ENG.principal}, 'Otro', ${sql.json(JSON.parse(JSON.stringify(lineas)))}, snapshot_id, 1, 1, ${PERSONAS.principal}
              from app.persona_profiles where engagement_id = ${ENG.principal} limit 1`;
        });
        esperarError(await pedirBorradorCoach(coach, ENG.principal, simultaneo), 409, MENSAJES_GUIA.coachYaHayBorrador(NOMBRE), "simultáneo");
        revisar((await contarAuditoria()) === 1, "la llamada no quedó en audit_log");
        revisar((await contarGuias()) === 1, "hay más de un borrador");
      },
    },
    {
      id: "CA-009.22",
      descripcion: "con una línea pendiente, Listo responde 400 con cuántas faltan y nada cambia",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        const antes = await filaGuia(g.id);
        esperarError(await marcarLista(persona, g.id), 400, MENSAJES_ACCIONES.faltaDecidir(5), "cinco pendientes");
        await incluirTodas(g, [g.lineas[0].id]);
        esperarError(await marcarLista(persona, g.id), 400, MENSAJES_ACCIONES.faltaDecidir(1), "una pendiente");
        const despues = await filaGuia(g.id);
        revisar(despues.estado === "borrador" && despues.version === null && despues.documento === null, "cambió la fila");
        revisar(antes.lineas.length === despues.lineas.length, "cambiaron las líneas");
      },
    },
    {
      id: "CA-009.23",
      descripcion: "editar deja el texto nuevo, conserva texto_ia y queda editada; volver al texto de la IA la deja pendiente; quitarla editada regresa el texto de la IA",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        const l = lineaDe(g, L.ayuda);
        const nuevo = "Un solo canal para pendientes, de preferencia el chat.";
        const editada = await decidirLinea(persona, g.id, l.id, { accion: "editar", texto: nuevo });
        esperar(editada, 200, "editar");
        let guardada = (await leerLineas(g.id)).find((x) => x.id === l.id)!;
        revisar(guardada.texto === nuevo && guardada.textoIa === L.ayuda && guardada.estado === "editada", `editada: ${JSON.stringify(guardada)}`);

        esperar(await decidirLinea(persona, g.id, l.id, { accion: "volver_al_texto_ia" }), 200, "volver");
        guardada = (await leerLineas(g.id)).find((x) => x.id === l.id)!;
        revisar(guardada.texto === L.ayuda && guardada.textoIa === L.ayuda && guardada.estado === "pendiente", `volvió: ${JSON.stringify(guardada)}`);

        // El coach puede leer lineas de una versión lista: una edición quitada no debe quedar en la fila (R-009.36).
        esperar(await decidirLinea(persona, g.id, l.id, { accion: "editar", texto: nuevo }), 200, "editar otra vez");
        esperar(await decidirLinea(persona, g.id, l.id, { accion: "quitar" }), 200, "quitar");
        guardada = (await leerLineas(g.id)).find((x) => x.id === l.id)!;
        revisar(guardada.texto === L.ayuda && guardada.estado === "quitada", `quitada: ${JSON.stringify(guardada)}`);
        revisar(!JSON.stringify(await filaGuia(g.id)).includes(nuevo), "la edición quitada sigue en la fila");

        // R-009.22: se puede regresar, y lo que no aplica responde 400.
        esperar(await decidirLinea(persona, g.id, l.id, { accion: "editar", texto: nuevo }), 400, "editar una quitada");
        esperar(await decidirLinea(persona, g.id, l.id, { accion: "volver_a_incluir" }), 200, "volver a incluir");
        guardada = (await leerLineas(g.id)).find((x) => x.id === l.id)!;
        revisar(guardada.estado === "incluida" && guardada.texto === L.ayuda, "no volvió a incluida");
        esperar(await decidirLinea(persona, g.id, l.id, { accion: "incluir" }), 400, "incluir una incluida");
        esperar(await decidirLinea(persona, g.id, l.id, { accion: "volver_al_texto_ia" }), 400, "volver sin edición");
        esperar(await decidirLinea(persona, g.id, randomUUID(), { accion: "incluir" }), 404, "una línea que no existe");
        esperar(await decidirLinea(persona, g.id, l.id, { accion: "aceptar_cambio" }), 400, "aceptar sin cambio");
      },
    },
    {
      id: "CA-009.24",
      descripcion: "una línea propia borrada no deja rastro: no está en lineas como owner ni en el historial; las de la IA no se borran",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        const secreto = "Una línea mía que luego borro.";
        const r = await agregarLinea(persona, g.id, { seccion: "ayuda", texto: secreto });
        esperar(r, 201, "agregar");
        const propia = lineaDe(GuiaVista.parse(cuerpo(r).guia), secreto);
        revisar(propia.estado === "propia" && propia.textoIa === null && propia.orden === 1, `propia: ${JSON.stringify(propia)}`);
        const guardada = (await leerLineas(g.id)).find((l) => l.id === propia.id)!;
        revisar(guardada.origenes.length === 0, "una línea propia con orígenes");
        const editada = "Una línea mía ya corregida.";
        esperar(await decidirLinea(persona, g.id, propia.id, { accion: "editar", texto: editada }), 200, "editar la propia");
        revisar((await leerLineas(g.id)).find((l) => l.id === propia.id)?.estado === "propia", "dejó de ser propia");
        esperar(await decidirLinea(persona, g.id, propia.id, { accion: "quitar" }), 400, "una propia no se quita, se borra");

        esperar(await borrarLineaPropia(persona, g.id, propia.id), 200, "borrar");
        const fila = JSON.stringify(await filaGuia(g.id));
        revisar(!fila.includes(secreto) && !fila.includes(editada), "el texto sigue en la fila");
        revisar(!JSON.stringify(cambiosDeGuia(await leerLineas(g.id))).includes(secreto), "el historial lo muestra");
        esperar(await borrarLineaPropia(persona, g.id, g.lineas[0].id), 400, "borrar una línea de la IA");
        revisar((await leerLineas(g.id)).length === 5, "se borró una línea de la IA");
      },
    },
    {
      id: "CA-009.25",
      descripcion: "una línea propia o una edición con un término no se guarda: 400 con el texto literal, y lineas no cambia",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        const antes = JSON.stringify(await leerLineas(g.id));
        for (const [texto, termino] of [
          ["Tengo TDAH y uso listas.", "TDAH"],
          ["Mi amigo es autista.", "autista"],
          ["Mi diagnóstico no importa.", "diagnóstico"],
          ["Me falla la memoria de trabajo.", "Memoria de trabajo"],
        ] as const) {
          esperarError(await agregarLinea(persona, g.id, { seccion: "ayuda", texto }), 400, mensajeBloqueo(termino), `agregar «${texto}»`);
          esperarError(await decidirLinea(persona, g.id, g.lineas[0].id, { accion: "editar", texto }), 400, mensajeBloqueo(termino), `editar con «${texto}»`);
        }
        // R-009.25: dice lo que ella escribió, no la etiqueta de la lista, que nombra una condición que ella no escribió.
        const conEtiqueta = await agregarLinea(persona, g.id, { seccion: "ayuda", texto: "Pido cierto nivel de apoyo al empezar un proyecto." });
        esperarError(conEtiqueta, 400, mensajeBloqueo("nivel de apoyo"), "agregar con «nivel de apoyo»");
        revisar(!JSON.stringify(conEtiqueta.cuerpo).includes("autismo") && !JSON.stringify(conEtiqueta.cuerpo).includes("severidad"), "el mensaje le atribuye una palabra que no escribió");
        // Ninguna confirmación lo salta: el pedido estricto no tiene dónde llevarla.
        esperar(await agregarLinea(persona, g.id, { seccion: "ayuda", texto: "Tengo TDAH.", confirmar: true }), 400, "con confirmar");
        revisar(JSON.stringify(await leerLineas(g.id)) === antes, "cambió lineas");
        // Y al marcar lista se vuelve a revisar lo que entra (R-009.29).
        const lineas = await leerLineas(g.id);
        await fijarLineas(g.id, lineas.map((l, i) => ({ ...l, estado: i === 0 ? "editada" : "incluida", texto: i === 0 ? "Tengo TDAH y uso listas." : l.texto })));
        esperarError(await marcarLista(persona, g.id), 400, mensajeBloqueo("TDAH"), "listo con un término colado");
        revisar((await filaGuia(g.id)).estado === "borrador", "se marcó lista");
      },
    },
    {
      id: "CA-009.26",
      descripcion: "una línea propia igual a una cita de las notas se guarda y la respuesta no dice nada de las notas",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        const r = await agregarLinea(persona, g.id, { seccion: "ayuda", texto: CITA_PERFIL });
        esperar(r, 201, "agregar");
        revisar((await leerLineas(g.id)).some((l) => l.texto === CITA_PERFIL && l.estado === "propia"), "no se guardó");
        const texto = JSON.stringify(r.cuerpo);
        revisar(!/nota|cita|coach/i.test(texto), `la respuesta menciona las notas: ${texto}`);
        // R-009.24: una palabra de uso diario tampoco bloquea (decisión abierta 2).
        esperar(await agregarLinea(persona, g.id, { seccion: "ayuda", texto: "Necesito flexibilidad en mi horario." }), 201, "flexibilidad");
      },
    },
    {
      id: "CA-009.28",
      descripcion: 'un nombre con "Renata (autista)" responde 400; con "Renata" se guarda y la hoja lo muestra',
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        revisar(g.nombreAMostrar === NOMBRE, "el valor inicial no es el nombre de pila");
        esperarError(await cambiarNombre(persona, g.id, { nombreAMostrar: "Renata (autista)" }), 400, mensajeBloqueo("autista", "Este nombre"), "con autista");
        revisar((await filaGuia(g.id)).nombre_a_mostrar === NOMBRE, "cambió el nombre");
        esperar(await cambiarNombre(persona, g.id, { nombreAMostrar: "x".repeat(81) }), 400, "más de 80");
        esperar(await cambiarNombre(persona, g.id, { nombreAMostrar: "   " }), 400, "vacío");
        const r = await cambiarNombre(persona, g.id, { nombreAMostrar: "Renata" });
        esperar(r, 200, "Renata");
        revisar(cuerpo(r).guia?.nombreAMostrar === "Renata", "la respuesta no trae el nombre");
        await incluirTodas(g);
        esperar(await marcarLista(persona, g.id), 200, "listo");
        revisar((await filaGuia(g.id)).documento?.nombre === "Renata", "la hoja no lo muestra");
      },
    },
    {
      id: "CA-009.31",
      descripcion: "Listo deja la fila lista, con versión, documento y aprobada_por_persona_en; lo quitado y lo pendiente no entran; una segunda vez responde 409",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        esperar(await decidirLinea(persona, g.id, lineaDe(g, L.cuesta).id, { accion: "quitar" }), 200, "quitar");
        await incluirTodas(g);
        const r = await marcarLista(persona, g.id);
        esperar(r, 200, "listo");
        revisar(cuerpo(r).guia?.estado === "lista" && cuerpo(r).guia?.version === 1, "la respuesta no dice la versión");
        const f = await filaGuia(g.id);
        revisar(f.estado === "lista" && f.version === 1 && f.aprobada_por_persona_en !== null, `fila: ${f.estado} ${f.version}`);
        revisar(f.documento?.nombre === NOMBRE, "documento sin nombre");
        const hoja = JSON.stringify(f.documento);
        revisar(hoja.includes(L.ayuda), "falta una línea incluida");
        revisar(!hoja.includes(L.cuesta), "CA-009.1: la línea quitada está en la hoja");
        revisar(!hoja.includes("origenes") && !hoja.includes("estado"), "la hoja trae estados u orígenes");
        revisar((await coachLee(g.id)).length === 1, "CA-009.2: el coach no lee la versión lista");
        esperarError(await marcarLista(persona, g.id), 409, MENSAJES_GUIA.yaEstaLista, "otra vez");
        esperarError(await decidirLinea(persona, g.id, g.lineas[0].id, { accion: "quitar" }), 409, MENSAJES_GUIA.yaEstaLista, "decidir una lista");
        esperarError(await cambiarNombre(persona, g.id, { nombreAMostrar: "Otro" }), 409, MENSAJES_GUIA.yaEstaLista, "renombrar una lista");
        esperarError(await descartarBorrador(persona, g.id), 409, MENSAJES_GUIA.yaEstaLista, "descartar una lista");
      },
    },
    {
      id: "CA-009.1",
      descripcion: 'una línea quitada tampoco está en la versión siguiente hecha con "Hacer cambios" (con regeneración, ver CA-009.44)',
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        esperar(await decidirLinea(persona, g.id, lineaDe(g, L.cuesta).id, { accion: "quitar" }), 200, "quitar");
        await incluirTodas(g);
        esperar(await marcarLista(persona, g.id), 200, "listo 1");
        const copia = await copiarVersion(persona, g.id);
        esperar(copia, 201, "copiar");
        const c = GuiaVista.parse(cuerpo(copia).guia);
        revisar(lineaDe(c, L.cuesta).estado === "quitada", "la copia no conserva el estado");
        esperar(await marcarLista(persona, c.id), 200, "listo 2");
        const f = await filaGuia(c.id);
        revisar(f.version === 2, "no es la versión 2");
        revisar(!JSON.stringify(f.documento).includes(L.cuesta), "la línea quitada volvió a la hoja");
      },
    },
    {
      id: "R-009.32",
      descripcion: '"Hacer cambios" crea un borrador copiado, sin modelo ni audit_log, con la base y sin prompt_version; con un borrador abierto responde 409',
      correr: async () => {
        await reiniciar();
        const id = await versionLista();
        const audit = await contarAuditoria();
        const r = await copiarVersion(persona, id);
        esperar(r, 201, "copiar");
        const c = GuiaVista.parse(cuerpo(r).guia);
        const f = await filaGuia(c.id);
        revisar(f.estado === "borrador" && f.version === null && f.documento === null, "no es un borrador");
        revisar(f.guia_base_id === id, "no apunta a su base");
        revisar(f.prompt_version === null && f.model === null, "guardó prompt_version o model sin llamar al modelo");
        revisar(f.lineas.every((l) => l.estado === "incluida" && l.origenes.length === 1), "no conservó estado u orígenes");
        revisar(f.lineas.every((l) => l.lineaAnteriorId !== null), "no apunta a la línea anterior");
        revisar((await contarAuditoria()) === audit, "contó para el límite");
        esperarError(await copiarVersion(persona, id), 409, MENSAJES_GUIA.personaYaHayBorrador, "con borrador abierto");
        esperar(await copiarVersion(persona, randomUUID()), 404, "un id que no existe");
        // Una versión vieja no es "la última" (R-009.32).
        esperar(await marcarLista(persona, c.id), 200, "listo");
        esperarError(await copiarVersion(persona, id), 409, MENSAJES_ACCIONES.noEsLaUltima, "copiar la versión anterior");
        esperar(await copiarVersion(persona, c.id), 201, "copiar la última");
      },
    },
    {
      id: "R-009.31",
      descripcion: "descartar deja la fila descartada y nadie la vuelve a usar: las acciones responden 404, no cuenta como versión y se puede pedir otra",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        const r = await descartarBorrador(persona, g.id);
        esperar(r, 200, "descartar");
        const f = await filaGuia(g.id);
        revisar(f.estado === "descartada" && f.descartada_en !== null, "no quedó descartada");
        esperar(await decidirLinea(persona, g.id, g.lineas[0].id, { accion: "incluir" }), 404, "decidir");
        esperar(await marcarLista(persona, g.id), 404, "listo");
        esperar(await descartarBorrador(persona, g.id), 404, "otra vez");
        esperar(await copiarVersion(persona, g.id), 404, "copiarla");
        // El coach todavía puede pedir: un descartado no es una versión (R-009.47).
        esperar(await pedirBorradorCoach(coach, ENG.principal, modelo()), 201, "pedir otro");
      },
    },
    {
      id: "R-009.38",
      descripcion: "retirar deja la versión retirada, el coach deja de verla y la persona la sigue viendo; no se puede dos veces ni sobre un borrador",
      correr: async () => {
        await reiniciar();
        const id = await versionLista();
        revisar((await coachLee(id)).length === 1, "el coach no la ve antes");
        const r = await retirarVersion(persona, id);
        esperar(r, 200, "retirar");
        revisar(cuerpo(r).guia?.estado === "retirada", "la respuesta no dice retirada");
        const f = await filaGuia(id);
        revisar(f.estado === "retirada" && f.retirada_en !== null && f.documento !== null, "no quedó retirada");
        revisar((await coachLee(id)).length === 0, "el coach la sigue viendo");
        esperarError(await retirarVersion(persona, id), 409, MENSAJES_ACCIONES.noEstaLista, "otra vez");
        // Para volver a compartirla usa "Hacer cambios".
        const copia = await copiarVersion(persona, id);
        esperar(copia, 201, "copiar la retirada");
        esperarError(await retirarVersion(persona, GuiaVista.parse(cuerpo(copia).guia).id), 409, MENSAJES_ACCIONES.noEstaLista, "retirar un borrador");
      },
    },
    {
      id: "R-009.45",
      descripcion: "otra persona o un id ajeno no alcanzan la guía: 404 en todas las acciones",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        const antes = await fotografia("shared_guides", ENG.principal);
        esperar(await decidirLinea(personaAjena, g.id, g.lineas[0].id, { accion: "incluir" }), 404, "decidir");
        esperar(await agregarLinea(personaAjena, g.id, { seccion: "ayuda", texto: "Una línea." }), 404, "agregar");
        esperar(await marcarLista(personaAjena, g.id), 404, "listo");
        esperar(await descartarBorrador(personaAjena, g.id), 404, "descartar");
        esperar(await copiarVersion(personaAjena, g.id), 404, "copiar");
        esperar(await pedirBorradorCoach(coachAjeno, ENG.principal, modelo()), 404, "coach ajeno");
        revisar((await fotografia("shared_guides", ENG.principal)) === antes, "cambió la fila");
      },
    },
    {
      id: "CA-009.43",
      descripcion: "aceptar o rechazar un cambio deja lo que dicen las reglas fijas; una línea con un cambio sin decidir no admite otra acción (con cambios fijados como owner)",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        const base = await leerLineas(g.id);
        const textoIaViejo = base[1].texto;
        const conCambio = (l: LineaGuia, tipo: "nueva" | "cambia" | "sale", extra: Partial<LineaGuia> = {}, textoAnterior: string | null = null): LineaGuia => ({
          ...l,
          ...extra,
          cambio: { tipo, textoAnterior, antesQuitada: false, decision: "pendiente" },
        });
        const preparar = () =>
          fijarLineas(g.id, [
            conCambio(base[0], "nueva"),
            conCambio(base[1], "cambia", { estado: "editada", texto: "La IA propone este texto.", textoIa: textoIaViejo }, "Mi texto editado."),
            conCambio(base[2], "sale", { estado: "editada", texto: "Mi otra edición.", textoIa: base[2].textoIa }),
            { ...base[3], estado: "incluida" },
            { ...base[4], estado: "incluida" },
          ]);
        const linea = async (i: number) => (await leerLineas(g.id))[i];

        await preparar();
        esperar(await decidirLinea(persona, g.id, base[0].id, { accion: "incluir" }), 400, "incluir con un cambio pendiente");
        esperar(await decidirLinea(persona, g.id, base[1].id, { accion: "editar", texto: "Otro." }), 400, "editar con un cambio pendiente");
        esperar(await decidirLinea(persona, g.id, base[2].id, { accion: "quitar" }), 400, "quitar con un cambio pendiente");
        esperarError(await marcarLista(persona, g.id), 400, MENSAJES_ACCIONES.faltaDecidir(3), "listo con cambios pendientes");

        // Rechazar: nueva queda quitada; cambia y sale conservan lo de la persona.
        for (const b of base.slice(0, 3)) esperar(await decidirLinea(persona, g.id, b.id, { accion: "rechazar_cambio" }), 200, "rechazar");
        let l = await linea(0);
        revisar(l.estado === "quitada" && l.cambio?.decision === "rechazado", `nueva rechazada: ${l.estado}`);
        l = await linea(1);
        revisar(l.estado === "editada" && l.texto === "Mi texto editado." && l.textoIa === textoIaViejo, `cambia rechazada: ${l.estado} ${l.texto}`);
        l = await linea(2);
        revisar(l.estado === "editada" && l.texto === "Mi otra edición.", `sale rechazada: ${l.estado} ${l.texto}`);

        // Aceptar: nueva queda incluida; cambia deja el texto de la IA; sale la quita con el texto de la IA.
        await preparar();
        for (const b of base.slice(0, 3)) esperar(await decidirLinea(persona, g.id, b.id, { accion: "aceptar_cambio" }), 200, "aceptar");
        l = await linea(0);
        revisar(l.estado === "incluida" && l.cambio?.decision === "aceptado", `nueva aceptada: ${l.estado}`);
        l = await linea(1);
        revisar(l.estado === "incluida" && l.texto === "La IA propone este texto." && l.textoIa === "La IA propone este texto.", `cambia aceptada: ${l.estado} ${l.texto}`);
        l = await linea(2);
        revisar(l.estado === "quitada" && l.texto === base[2].textoIa, `sale aceptada: ${l.estado} ${l.texto}`);
        esperar(await marcarLista(persona, g.id), 200, "listo con todo decidido");
      },
    },
    {
      id: "CA-009.45",
      descripcion: 'un borrador de regeneración con cambios sin decidir no se marca listo; "Dejar todo como estaba" lo descarta y la versión anterior sigue igual',
      correr: async () => {
        await conInsumosNuevos(async () => {
          const baseId = await versionLista(SALIDA_POR_ORIGEN);
          const fotoBase = JSON.stringify(await filaGuia(baseId));
          await planNuevo(ITEMS_IGUALES.filter((i) => i.de !== DESC_EQUIPO));
          const c = await regenerar(modelo());
          esperarError(await marcarLista(persona, c.id), 400, MENSAJES_ACCIONES.faltaDecidir(1), "listo");
          // El trigger también lo rechaza si se intenta como SQL (CA-009.22).
          let rechazado = false;
          try {
            await sql`update app.shared_guides set estado = 'lista', version = 2, documento = ${sql.json({ nombre: "Luz", secciones: [] })} where id = ${c.id}`;
          } catch {
            rechazado = true;
          }
          revisar(rechazado, "el trigger dejó marcar lista con un cambio sin decidir");
          esperar(await descartarBorrador(persona, c.id), 200, "dejar como estaba");
          revisar((await filaGuia(c.id)).estado === "descartada", "no quedó descartada");
          revisar(JSON.stringify(await filaGuia(baseId)) === fotoBase, "cambió la versión anterior");
          // Un borrador descartado no sirve de base: la siguiente parte de la misma versión (R-009.31).
          const otra = await regenerar(modelo());
          revisar((await filaGuia(otra.id)).guia_base_id === baseId, "la base no es la última versión");
        });
      },
    },
    {
      id: "CA-009.46",
      descripcion: "generar, editar y marcar lista no cambian el perfil, el plan, las señales ni la etapa",
      correr: async () => {
        await reiniciar();
        const tablas = ["profile_snapshots", "persona_profiles", "plans", "plan_items", "signal_states", "profile_events", "sessions"];
        const fotos = async () => {
          const partes: string[] = [];
          for (const t of tablas) partes.push(await fotografia(t, ENG.principal));
          partes.push(await fotografia("engagements", ENG.principal, "id"));
          return partes.join("|");
        };
        const antes = await fotos();
        const g = await borrador();
        esperar(await decidirLinea(persona, g.id, g.lineas[0].id, { accion: "editar", texto: "Lo escribo con mis palabras." }), 200, "editar");
        esperar(await agregarLinea(persona, g.id, { seccion: "ayuda", texto: "Una línea mía." }), 201, "agregar");
        await incluirTodas(g);
        esperar(await marcarLista(persona, g.id), 200, "listo");
        esperar(await retirarVersion(persona, g.id), 200, "retirar");
        revisar((await fotos()) === antes, "cambió el perfil, el plan, las señales o la etapa");
      },
    },
    {
      id: "CA-009.53",
      descripcion: "con una versión, también retirada, el coach recibe 409 sin saber si hay retiradas; una versión que aparece durante la llamada da el mismo 409",
      correr: async () => {
        await reiniciar();
        const id = await versionLista();
        const m = modelo();
        const audit = await contarAuditoria();
        const guias = await contarGuias();
        esperarError(await pedirBorradorCoach(coach, ENG.principal, m), 409, MENSAJES_GUIA.coachYaHayVersiones(NOMBRE), "con una lista");
        esperar(await retirarVersion(persona, id), 200, "retirar");
        const conRetirada = await pedirBorradorCoach(coach, ENG.principal, m);
        esperarError(conRetirada, 409, MENSAJES_GUIA.coachYaHayVersiones(NOMBRE), "con una retirada");
        revisar(!/retir/i.test(JSON.stringify(conRetirada.cuerpo)), "el cuerpo dice que hay retiradas");
        revisar(m.llamadas() === 0, "se llamó al modelo");
        revisar((await contarAuditoria()) === audit, "se auditó");
        revisar((await contarGuias()) === guias, "se creó una guía");

        // Aparece mientras responde el modelo: como owner, para no chocar con el índice de un borrador.
        await reiniciar();
        const lineas = await (async () => {
          const g = await borrador();
          const l = await leerLineas(g.id);
          await reiniciar();
          return l;
        })();
        const durante = modelo(SALIDA_BUENA, async () => {
          await sql`
            insert into app.shared_guides (engagement_id, version, estado, nombre_a_mostrar, lineas, documento, generada_desde_snapshot_id, perfil_version, plan_version, generada_por, aprobada_por_persona_en)
            select ${ENG.principal}, 1, 'lista', 'Otra', ${sql.json(JSON.parse(JSON.stringify(lineas)))}, ${sql.json({ nombre: "Otra", secciones: [] })}, snapshot_id, 1, 1, ${PERSONAS.principal}, now()
              from app.persona_profiles where engagement_id = ${ENG.principal} limit 1`;
        });
        esperarError(await pedirBorradorCoach(coach, ENG.principal, durante), 409, MENSAJES_GUIA.coachYaHayVersiones(NOMBRE), "durante la llamada");
        revisar((await contarGuias()) === 1, "se guardó el borrador");
        revisar((await contarAuditoria()) === 1, "la llamada no quedó en audit_log");
      },
    },
    {
      id: "CA-009.41",
      descripcion: "sin ningún cambio no se llama al modelo y responde 409, con la versión lista o retirada; con un ítem que no cambió, ese ítem no llega al modelo",
      correr: async () => {
        await conInsumosNuevos(async () => {
          const id = await versionLista(SALIDA_POR_ORIGEN);
          const m = modelo();
          const audit = await contarAuditoria();
          const reservas = await contarReservas();
          const guias = await contarGuias();
          revisar((await leerPersona()).avisoCambios === false, "avisa sin que haya cambios");
          esperarError(await pedirBorradorPersona(persona, m), 409, MENSAJES_GUIA.personaSinCambios, "sin cambios, con una lista");
          esperar(await retirarVersion(persona, id), 200, "retirar");
          esperarError(await pedirBorradorPersona(persona, m), 409, MENSAJES_GUIA.personaSinCambios, "sin cambios, con una retirada");

          // Un plan nuevo con los mismos textos: otro número, nada que proponer.
          await planNuevo(ITEMS_IGUALES);
          revisar((await leerPersona()).avisoCambios === false, "avisa con un plan con los mismos textos: no habría nada que pedir (R-009.46)");
          const conPlanIgual = await pedirBorradorPersona(persona, m);
          revisar(cuerpo(conPlanIgual).error === MENSAJES_GUIA.personaSinCambios, `con un plan igual: ${JSON.stringify(conPlanIgual.cuerpo)}`);

          revisar(m.llamadas() === 0, "se llamó al modelo");
          revisar((await contarAuditoria()) === audit, "se auditó sin llamar al modelo");
          revisar((await contarReservas()) === reservas, "apartó cupo sin llamar al modelo");
          revisar((await contarGuias()) === guias, "se creó una guía");
        });

        await conInsumosNuevos(async () => {
          await versionLista(SALIDA_POR_ORIGEN);
          await planNuevo(conCambiado(DESC_LIDER, { descripcion: "Avisar los cambios de prioridad dos días antes." }));
          const m = modelo({ lineas: [lineaIa("cambios", "Avísame de los cambios dos días antes.", ["O-01"])] });
          const g = await regenerar(m);
          revisar(m.llamadas() === 1, "no se llamó al modelo");
          const entrada = m.entradas[0];
          revisar(entrada.soloEstos === true, "el mensaje no dice que son solo estos");
          revisar(entrada.origenes.length === 1 && entrada.origenes[0].texto === "Avisar los cambios de prioridad dos días antes.", `al modelo le llegó: ${JSON.stringify(entrada.origenes)}`);
          const mensaje = mensajeUsuarioGuia(entrada);
          for (const prohibido of [RESUMEN, TEXTO_OBJETIVO, TEXTO_APOYO, DESC_EQUIPO, DESC_AJUSTE, DESC_INSTRUCCION, DESC_LIDER, ...Object.values(T), CITA_PERFIL, CITA_SENAL, CITA_PLAN, CEDULA]) {
            revisar(!mensaje.includes(prohibido), `llegó al modelo: ${prohibido}`);
          }
          // Lo que no cambió se copia, con el origen del ítem equivalente.
          revisar(lineaDe(g, T.apoyo).cambio === null, "cambió una línea cuyo origen no cambió");
          const fila = await filaGuia(g.id);
          const [equivalente] = await sql`select i.id from app.plan_items i join app.plans p on p.id = i.plan_id where p.engagement_id = ${ENG.principal} and p.version = 2 and i.descripcion = ${DESC_APOYO}`;
          const copiada = fila.lineas.find((l) => l.texto === T.apoyo);
          revisar(copiada?.origenes[0]?.tipo === "plan_item" && copiada.origenes[0].planItemId === (equivalente.id as string), "el origen no se actualizó al ítem equivalente");
          revisar(fila.guia_base_id !== null && fila.prompt_version === PROMPT_VERSION_GUIA && fila.model === "modelo-simulado", "la fila no dice de dónde salió");
        });
      },
    },
    {
      id: "CA-009.42",
      descripcion: "un origen cambiado, uno sin equivalente y un ítem nuevo dan cambia, sale y nueva por la ruta, siguiendo origen_item_id, y una línea que repite la base se cuenta sin su texto",
      correr: async () => {
        await conInsumosNuevos(async () => {
          const base = await versionLista(SALIDA_POR_ORIGEN);
          await planNuevo([
            ...ITEMS_IGUALES.filter((i) => i.de !== DESC_EQUIPO && i.de !== DESC_LIDER),
            { de: DESC_LIDER, tipo: "comunicacion_lider", descripcion: "Avisar los cambios de prioridad dos días antes." },
            { tipo: "instruccion", descripcion: "Dejar cada acuerdo también en el chat del equipo." },
          ]);
          const propuestaLider = "Avísame de los cambios dos días antes.";
          const propuestaNueva = "Cada acuerdo también en el chat del equipo.";
          const m = modelo({
            lineas: [
              lineaIa("cambios", propuestaLider, ["O-01"]),
              lineaIa("comunicacion", propuestaNueva, ["O-02"]),
              lineaIa("ayuda", T.apoyo, ["O-02"]),
            ],
          });
          const antesAudit = await contarAuditoria();
          const g = await regenerar(m);
          revisar(m.entradas[0].origenes.length === 2, `al modelo le llegaron ${m.entradas[0].origenes.length} orígenes`);
          revisar((await contarAuditoria()) === antesAudit + 1, "la llamada no quedó en audit_log (R-009.15)");

          const cambia = lineaDe(g, propuestaLider);
          revisar(cambia.cambio?.tipo === "cambia" && cambia.cambio.textoAnterior === T.lider && cambia.cambio.decision === "pendiente", `cambia: ${JSON.stringify(cambia.cambio)}`);
          const sale = lineaDe(g, T.equipo);
          revisar(sale.cambio?.tipo === "sale", `sale: ${JSON.stringify(sale.cambio)}`);
          const nueva = lineaDe(g, propuestaNueva);
          revisar(nueva.cambio?.tipo === "nueva" && nueva.estado === "pendiente", `nueva: ${JSON.stringify(nueva.cambio)}`);
          revisar(lineaDe(g, T.apoyo).cambio === null, "se volvió a proponer una línea igual");

          const fila = await filaGuia(g.id);
          revisar(fila.guia_base_id === base, "no apunta a su base");
          revisar(fila.descartes.repetida === 1, `descartes: ${JSON.stringify(fila.descartes)}`);
          revisar(!JSON.stringify(fila.descartes).includes(T.apoyo), "los descartes traen texto (R-009.12)");
          revisar(g.descartadas === 1, "la pantalla no dice cuántas se quitaron");
        });
      },
    },
    {
      id: "CA-009.43",
      descripcion: "con una regeneración real: rechazar un cambio deja su texto, aceptar deja el de la IA, y una línea propia no aparece como cambio",
      correr: async () => {
        await conInsumosNuevos(async () => {
          const g = await borrador(SALIDA_POR_ORIGEN);
          const lider = lineaDe(g, T.lider);
          const objetivo = lineaDe(g, T.objetivo);
          esperar(await decidirLinea(persona, g.id, lider.id, { accion: "editar", texto: "Mi texto para los cambios." }), 200, "editar");
          esperar(await decidirLinea(persona, g.id, objetivo.id, { accion: "editar", texto: "Mi lista de cada mañana." }), 200, "editar");
          esperar(await agregarLinea(persona, g.id, { seccion: "cambios", texto: "Una línea mía sobre los cambios." }), 201, "agregar");
          await incluirTodas(g);
          esperar(await marcarLista(persona, g.id), 200, "listo");

          await planNuevo(
            ITEMS_IGUALES.map((i) => {
              if (i.de === DESC_LIDER) return { ...i, descripcion: "Avisar los cambios de prioridad dos días antes." };
              if (i.de === DESC_OBJETIVO) return { ...i, textoPersona: "Revisa tu lista cada mañana y márcala al terminar." };
              return i;
            }),
          );
          // La línea propia está en "cambios" y comparte sección con lo que escribe el modelo: no se toca.
          const d = await regenerar(
            modelo({ lineas: [lineaIa("ayuda", "Revisar mi lista y marcarla al terminar.", ["O-01"]), lineaIa("cambios", "Avísame dos días antes.", ["O-02"])] }),
          );
          const propia = lineaDe(d, "Una línea mía sobre los cambios.");
          revisar(propia.estado === "propia" && propia.cambio === null, "la línea propia aparece como cambio");
          const rechazar = lineaDe(d, "Avísame dos días antes.");
          revisar(rechazar.estado === "editada" && rechazar.cambio?.textoAnterior === "Mi texto para los cambios.", `editada: ${JSON.stringify(rechazar)}`);
          const aceptar = lineaDe(d, "Revisar mi lista y marcarla al terminar.");
          revisar(aceptar.cambio?.textoAnterior === "Mi lista de cada mañana.", `editada: ${JSON.stringify(aceptar)}`);

          esperarError(await marcarLista(persona, d.id), 400, MENSAJES_ACCIONES.faltaDecidir(2), "listo con cambios sin decidir");
          esperar(await decidirLinea(persona, d.id, rechazar.id, { accion: "rechazar_cambio" }), 200, "rechazar");
          esperar(await decidirLinea(persona, d.id, aceptar.id, { accion: "aceptar_cambio" }), 200, "aceptar");

          const lineas = await leerLineas(d.id);
          const rechazada = lineas.find((l) => l.id === rechazar.id)!;
          revisar(rechazada.texto === "Mi texto para los cambios." && rechazada.estado === "editada", `rechazada: ${rechazada.estado} ${rechazada.texto}`);
          const aceptada = lineas.find((l) => l.id === aceptar.id)!;
          revisar(aceptada.texto === "Revisar mi lista y marcarla al terminar." && aceptada.estado === "incluida" && aceptada.textoIa === aceptada.texto, `aceptada: ${aceptada.estado} ${aceptada.texto}`);
          revisar(!JSON.stringify(lineas).includes("Mi lista de cada mañana."), "su texto de antes sigue en la fila que lee el coach");

          esperar(await marcarLista(persona, d.id), 200, "listo con todo decidido");
          const v2 = await filaGuia(d.id);
          revisar(v2.version === 2 && v2.estado === "lista", `versión: ${v2.version} ${v2.estado}`);
          const hoja = JSON.stringify(v2.documento);
          revisar(hoja.includes("Mi texto para los cambios.") && hoja.includes("Una línea mía sobre los cambios.") && hoja.includes("Revisar mi lista y marcarla al terminar."), `la hoja: ${hoja}`);
          revisar(!hoja.includes("Avísame dos días antes."), "la propuesta rechazada llegó a la hoja");
          revisar((await leerPersona()).avisoCambios === false, "sigue avisando después de la versión nueva");
        });
      },
    },
    {
      id: "CA-009.44",
      descripcion: "una quitada con el origen igual no se propone; con el origen cambiado se propone como nueva con la nota, y el texto quitado no llega a la hoja (CA-009.1)",
      correr: async () => {
        await conInsumosNuevos(async () => {
          const g = await borrador(SALIDA_POR_ORIGEN);
          esperar(await decidirLinea(persona, g.id, lineaDe(g, T.apoyo).id, { accion: "quitar" }), 200, "quitar la del origen que sigue igual");
          esperar(await decidirLinea(persona, g.id, lineaDe(g, T.ajuste).id, { accion: "quitar" }), 200, "quitar la del origen que cambia");
          await incluirTodas(g);
          esperar(await marcarLista(persona, g.id), 200, "listo");

          await planNuevo(conCambiado(DESC_AJUSTE, { descripcion: "Un lugar con menos ruido y audífonos por la tarde." }));
          const propuesta = "Me cuesta concentrarme por la tarde; pido audífonos y un lugar tranquilo.";
          // También propone su mismo texto: una línea que ya quitó no vuelve.
          const d = await regenerar(modelo({ lineas: [lineaIa("cuesta_y_pido", propuesta, ["O-01"]), lineaIa("ayuda", T.apoyo, ["O-01"])] }));

          const igual = lineaDe(d, T.apoyo);
          revisar(igual.estado === "quitada" && igual.cambio === null, `quitada con el origen igual: ${igual.estado} ${JSON.stringify(igual.cambio)}`);
          const conNota = lineaDe(d, propuesta);
          revisar(conNota.cambio?.tipo === "nueva" && conNota.cambio.antesQuitada === true, `con el origen cambiado: ${JSON.stringify(conNota.cambio)}`);
          revisar(!JSON.stringify(d).includes(T.ajuste), "el texto que quitó sigue en la propuesta");

          esperar(await decidirLinea(persona, d.id, conNota.id, { accion: "rechazar_cambio" }), 200, "rechazar");
          esperar(await marcarLista(persona, d.id), 200, "listo");
          const hoja = JSON.stringify((await filaGuia(d.id)).documento);
          for (const quitado of [T.apoyo, T.ajuste, propuesta]) revisar(!hoja.includes(quitado), `llegó a la hoja: ${quitado}`);
          // Lo del coach: lo quitado de la propuesta de la IA, con esta nueva versión (R-009.36).
          revisar(cambiosDeGuia(await leerLineas(d.id)).quitadas.includes(T.apoyo), "el historial no dice lo que quitó");
        });
      },
    },
    {
      id: "R-009.47",
      descripcion: "si solo hay orígenes que ya no existen, el borrador se crea sin modelo; la base es la versión más alta, también retirada, con el nombre que ella eligió; el coach sigue sin poder pedir",
      correr: async () => {
        await conInsumosNuevos(async () => {
          const g = await borrador(SALIDA_POR_ORIGEN);
          esperar(await cambiarNombre(persona, g.id, { nombreAMostrar: "Luz María" }), 200, "nombre");
          await incluirTodas(g);
          esperar(await marcarLista(persona, g.id), 200, "listo");
          esperar(await retirarVersion(persona, g.id), 200, "retirar");

          await planNuevo(ITEMS_IGUALES.filter((i) => i.de !== DESC_EQUIPO));
          const m = modelo();
          const audit = await contarAuditoria();
          const d = await regenerar(m);
          revisar(m.llamadas() === 0, "se llamó al modelo");
          revisar((await contarAuditoria()) === audit, "se auditó sin llamar al modelo");
          revisar(d.lineas.filter((l) => l.cambio?.decision === "pendiente").length === 1, `cambios: ${JSON.stringify(d.lineas.map((l) => l.cambio))}`);
          revisar(lineaDe(d, T.equipo).cambio?.tipo === "sale", "no propone quitarla");
          revisar((await leerPersona()).borrador?.insumosCambiaron === false, "avisa de cambios por un sale que ya está en este borrador");
          revisar(d.nombreAMostrar === "Luz María", `nombre: ${d.nombreAMostrar}`);

          const fila = await filaGuia(d.id);
          revisar(fila.prompt_version === null && fila.model === null, "la fila dice que se llamó al modelo");
          revisar(fila.guia_base_id === g.id, "la base no es la retirada");

          // El coach no regenera, aunque su sesión pida: 409, sin saber si hay retiradas (R-009.47).
          await reiniciar();
          await versionLista(SALIDA_POR_ORIGEN);
          const delCoach = modelo();
          esperarError(await pedirBorradorCoach(coach, ENG.principal, delCoach), 409, MENSAJES_GUIA.coachYaHayVersiones(NOMBRE), "coach");
          revisar(delCoach.llamadas() === 0, "el coach llamó al modelo");
        });
      },
    },
    {
      id: "R-009.46",
      descripcion: "el aviso compara el perfil por contenido y no sale con un borrador abierto; una dimensión con otro resumen llega al modelo y sigue con sus reglas",
      correr: async () => {
        await conInsumosNuevos(async () => {
          await versionLista(SALIDA_POR_ORIGEN);
          // Solo se aprobó una señal: otro snapshot con el mismo contenido. Avisar delataría la señal (C-09).
          await perfilNuevo();
          revisar((await leerPersona()).avisoCambios === false, "avisa con el mismo contenido");
          const nadie = modelo();
          esperarError(await pedirBorradorPersona(persona, nadie), 409, MENSAJES_GUIA.personaSinCambios, "mismo contenido");
          revisar(nadie.llamadas() === 0, "se llamó al modelo con el mismo contenido");

          const resumen = "Prefiere los acuerdos por escrito y ya los pide en el chat.";
          await perfilNuevo({ comunicacion_escrita: { resumen, tipo: "fortaleza" } });
          revisar((await leerPersona()).avisoCambios === true, "no avisa con un resumen distinto");

          const m = modelo({ lineas: [lineaIa("comunicacion", "Acuerdos en el chat después de cada reunión.", ["O-01"])] });
          const d = await regenerar(m);
          revisar(m.entradas[0].origenes.length === 1 && m.entradas[0].origenes[0].texto === resumen, `al modelo le llegó: ${JSON.stringify(m.entradas[0].origenes)}`);
          revisar(lineaDe(d, "Acuerdos en el chat después de cada reunión.").cambio?.tipo === "nueva", "no es una línea nueva");
          const delBorrador = await leerPersona();
          revisar(delBorrador.avisoCambios === false, "avisa con un borrador abierto: no podría pedir otro");
          revisar(delBorrador.borrador?.insumosCambiaron === false, "el borrador de la regeneración ya trae lo último");

          // Lo que ella escribió en la guía anterior tampoco le llega al modelo (R-009.8).
          revisar(!mensajeUsuarioGuia(m.entradas[0]).includes(T.lider), "le llegó una línea de la guía anterior");
        });
      },
    },
    {
      id: "R-009.18",
      descripcion: "una regeneración que falla no guarda nada; lo que el modelo escribió igual no crea un borrador; retirar el consentimiento mientras responde da 409",
      correr: async () => {
        await conInsumosNuevos(async () => {
          await versionLista(SALIDA_POR_ORIGEN);
          await planNuevo(conCambiado(DESC_LIDER, { descripcion: "Avisar los cambios de prioridad dos días antes." }));
          const guias = await contarGuias();
          let audit = await contarAuditoria();

          // El modelo falla.
          const falla = await pedirBorradorPersona(persona, modeloQueFalla());
          esperarError(falla, 502, MENSAJES_GUIA.personaErrorModelo, "el modelo falla");
          revisar((await contarAuditoria()) === ++audit, "la falla no quedó en audit_log");

          // Sale sin líneas: 502, como en la primera generación (R-009.18).
          esperarError(await pedirBorradorPersona(persona, modelo({ lineas: [] })), 502, MENSAJES_GUIA.personaErrorModelo, "sin líneas");
          revisar((await contarAuditoria()) === ++audit, "la salida vacía no quedó en audit_log");

          // Una sección fuera de las cinco, o una llave extra.
          esperarError(await pedirBorradorPersona(persona, modelo({ lineas: [{ seccion: "otra", texto: "Una.", origenes: ["O-01"] }] })), 502, MENSAJES_GUIA.personaErrorModelo, "otra sección");
          revisar((await contarGuias()) === guias, "se guardó algo");

          // Retira el consentimiento mientras responde el modelo.
          await sql`delete from app.audit_log where engagement_id = ${ENG.principal}`;
          const retiro = modelo({ lineas: [lineaIa("cambios", "Avísame dos días antes.", ["O-01"])] }, () => retirar(ENG.principal, PERSONAS.principal));
          try {
            esperarError(await pedirBorradorPersona(persona, retiro), 409, MENSAJES_GUIA.personaRetiroDuranteLaLlamada, "retiro");
            revisar((await contarGuias()) === guias, "se guardó el borrador sin consentimiento");
          } finally {
            await otorgar(ENG.principal, PERSONAS.principal);
          }

          // Con el límite del día, tampoco.
          await sql`delete from app.audit_log where engagement_id = ${ENG.principal}`;
          for (let i = 0; i < LIMITE_DIARIO_GUIA; i++) {
            await sql`insert into app.audit_log (user_id, engagement_id, accion, modelo, prompt_version, ok) values (${PERSONAS.principal}, ${ENG.principal}, ${ACCION_RESERVA_GUIA}, 'modelo-simulado', ${PROMPT_VERSION_GUIA}, true)`;
          }
          const limite = modelo();
          esperarError(await pedirBorradorPersona(persona, limite), 429, MENSAJES_GUIA.personaLimite, "límite");
          revisar(limite.llamadas() === 0, "se llamó al modelo con el límite");

          // Escribe el mismo texto: ya pasó la llamada, pero no hay nada que mostrarle. Va al final porque queda anotado
          // que ya se revisó, y ya no se le vuelve a llamar (R-009.46).
          await sql`delete from app.audit_log where engagement_id = ${ENG.principal}`;
          esperarError(await pedirBorradorPersona(persona, modelo({ lineas: [lineaIa("cambios", T.lider, ["O-01"])] })), 409, MENSAJES_GUIA.personaSinCambios, "el mismo texto");
          revisar((await contarAuditoria()) === 1, "esa llamada no quedó en audit_log");
          revisar((await contarGuias()) === guias, "se guardó algo");
        });
      },
    },
    {
      id: "CA-009.55",
      descripcion: "con 20 incluidas, incluir, editar, una línea propia, volver a incluir y aceptar un cambio responden 400 y nada cambia; con 21, Listo responde 400",
      correr: async () => {
        await reiniciar();
        const g = await borrador(SALIDA_LLENA);
        revisar(g.lineas.length === 25, `quedaron ${g.lineas.length} líneas`);
        const base = await leerLineas(g.id);
        const veinte = base.map((l, i) => (i < 20 ? { ...l, estado: "incluida" as const } : l));
        await fijarLineas(g.id, veinte);
        const antes = JSON.stringify(await leerLineas(g.id));
        const tope = MENSAJES_ACCIONES.tope;
        esperarError(await decidirLinea(persona, g.id, base[20].id, { accion: "incluir" }), 400, tope, "incluir");
        esperarError(await decidirLinea(persona, g.id, base[20].id, { accion: "editar", texto: "Mi texto." }), 400, tope, "editar");
        esperarError(await agregarLinea(persona, g.id, { seccion: "ayuda", texto: "Una línea mía." }), 400, tope, "línea propia");
        revisar(JSON.stringify(await leerLineas(g.id)) === antes, "cambió lineas");
        // Editar una que ya estaba incluida no suma.
        esperar(await decidirLinea(persona, g.id, base[0].id, { accion: "editar", texto: "Mi texto." }), 200, "editar una incluida");

        await fijarLineas(g.id, veinte.map((l, i) => (i === 20 ? { ...l, estado: "quitada" as const } : l)));
        esperarError(await decidirLinea(persona, g.id, base[20].id, { accion: "volver_a_incluir" }), 400, tope, "volver a incluir");
        const conCambio = veinte.map((l, i) => (i === 20 ? { ...l, cambio: { tipo: "nueva" as const, textoAnterior: null, antesQuitada: false, decision: "pendiente" as const } } : l));
        await fijarLineas(g.id, conCambio);
        esperarError(await decidirLinea(persona, g.id, base[20].id, { accion: "aceptar_cambio" }), 400, tope, "aceptar un cambio");

        // Con 21 (por SQL), Listo se niega; quitar una siempre se puede.
        const veintiuna = base.map((l, i) => (i < 21 ? { ...l, estado: "incluida" as const } : { ...l, estado: "quitada" as const }));
        await fijarLineas(g.id, veintiuna);
        esperarError(await marcarLista(persona, g.id), 400, tope, "listo con 21");
        revisar((await filaGuia(g.id)).estado === "borrador", "se marcó lista");
        esperar(await decidirLinea(persona, g.id, base[0].id, { accion: "quitar" }), 200, "quitar con 21");
        esperar(await marcarLista(persona, g.id), 200, "listo con 20");
      },
    },
    {
      id: "CA-009.58",
      descripcion: "dos Listo simultáneos dejan una sola versión; el segundo responde 409 con yaEstaLista",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        await incluirTodas(g);
        // Dos transacciones en conexiones distintas: la segunda espera el bloqueo de la fila.
        const respuestas = await Promise.all([marcarLista(persona, g.id), marcarLista(persona, g.id)]);
        const codigos = respuestas.map((r) => r.status).sort();
        revisar(codigos.join() === "200,409", `códigos: ${codigos.join()}`);
        const conflicto = respuestas.find((r) => r.status === 409)!;
        esperarError(conflicto, 409, MENSAJES_GUIA.yaEstaLista, "el segundo");
        revisar((await contar("shared_guides", ENG.principal, "and version is not null")) === 1, "hay más de una versión");
        revisar((await filaGuia(g.id)).version === 1, "la versión no es la 1");
      },
    },
    {
      id: "CA-009.59",
      descripcion: "si pide el coach y el modelo falla, o no queda ninguna línea después de limpiar: 502 con su texto y no se guarda nada",
      correr: async () => {
        for (const [nombre, deps] of [
          ["el modelo falla", modeloQueFalla()],
          ["nada pasa la limpieza", modelo({ lineas: [lineaIa("ayuda", "Tengo TDAH y uso lista."), lineaIa("ayuda", "Sin un origen válido.", ["O-99"])] })],
          ["salida vacía", modelo({ lineas: [] })],
        ] as const) {
          await reiniciar();
          esperarError(await pedirBorradorCoach(coach, ENG.principal, deps), 502, MENSAJES_GUIA.coachErrorModelo, nombre);
          revisar((await contarGuias()) === 0, `${nombre}: se guardó`);
          revisar((await contarAuditoria()) === 1, `${nombre}: no se auditó`);
        }
        const [a] = await sql`select ok, error from app.audit_log where engagement_id = ${ENG.principal} and accion = ${ACCION_GUIA}`;
        revisar(a.ok === false && a.error === "sin_lineas", `la auditoría: ${JSON.stringify(a)}`);
      },
    },
    {
      id: "CA-009.13",
      descripcion: "lo que lee la página de la persona no trae orígenes, textos internos ni quién pidió el borrador, y un descartado no aparece",
      correr: async () => {
        await reiniciar();
        const r = await pedirBorradorCoach(coach, ENG.principal, modelo());
        esperar(r, 201, "pedir como coach");
        const delCoach = await withRls(persona.claims, (tx) => leerGuiasPersona(tx, ENG.principal, PERSONAS.principal));
        revisar(delCoach.borrador?.pedidoPorMi === false, "no dice que lo pidió el coach");
        revisar(delCoach.borrador?.insumosCambiaron === false, "avisa de cambios sin que los haya");
        const texto = JSON.stringify(delCoach);
        for (const fuera of ["origenes", "lineaAnteriorId", "generadaPor", COACH, ...CENTINELAS_INTERNOS]) revisar(!texto.includes(fuera), `trae: ${fuera}`);
        esperar(await descartarBorrador(persona, delCoach.borrador!.guia.id), 200, "descartar");
        const despues = await withRls(persona.claims, (tx) => leerGuiasPersona(tx, ENG.principal, PERSONAS.principal));
        revisar(despues.borrador === null && despues.versiones.length === 0, "el descartado sigue apareciendo");

        const propia = await borrador();
        const mia = await withRls(persona.claims, (tx) => leerGuiasPersona(tx, ENG.principal, PERSONAS.principal));
        revisar(mia.borrador?.pedidoPorMi === true && mia.borrador.guia.id === propia.id, "no dice que lo pidió ella");
        revisar(mia.borrador.guia.lineas.every((l) => !("origenes" in l)), "una línea trae orígenes");
      },
    },
    {
      id: "CA-009.29",
      descripcion: "la vista previa y la hoja dicen lo mismo; una línea pendiente o quitada no aparece; la vista previa solo es de un borrador",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        const sinDecidir = lineaDe(g, L.ayuda);
        const quitada = lineaDe(g, L.cuesta);
        esperar(await decidirLinea(persona, g.id, quitada.id, { accion: "quitar" }), 200, "quitar");
        await incluirTodas(g, [sinDecidir.id]);
        const conPendiente = await withRls(persona.claims, (tx) => leerVistaPrevia(tx, ENG.principal, g.id));
        revisar(conPendiente && !JSON.stringify(conPendiente).includes(L.ayuda), "la vista previa trae una línea pendiente");
        revisar(!JSON.stringify(conPendiente).includes(L.cuesta), "la vista previa trae una línea quitada");

        esperar(await decidirLinea(persona, g.id, sinDecidir.id, { accion: "incluir" }), 200, "incluir");
        const previa = await withRls(persona.claims, (tx) => leerVistaPrevia(tx, ENG.principal, g.id));
        esperar(await marcarLista(persona, g.id), 200, "listo");
        const hoja = await withRls(persona.claims, (tx) => leerHoja(tx, g.id));
        revisar(JSON.stringify(previa) === JSON.stringify(hoja), `la vista previa y la hoja no coinciden: ${JSON.stringify({ previa, hoja })}`);
        revisar(!JSON.stringify(hoja).includes(L.cuesta), "la hoja trae una línea quitada");
        revisar((await withRls(persona.claims, (tx) => leerVistaPrevia(tx, ENG.principal, g.id))) === null, "hay vista previa de una versión lista");
      },
    },
    {
      id: "CA-009.39",
      descripcion: "la hoja solo existe para una versión lista: un borrador, una retirada, otra persona o un coach ajeno no la leen",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        revisar((await withRls(persona.claims, (tx) => leerHoja(tx, g.id))) === null, "hay hoja de un borrador");
        await incluirTodas(g);
        esperar(await marcarLista(persona, g.id), 200, "listo");
        const hoja = await withRls(persona.claims, (tx) => leerHoja(tx, g.id));
        revisar(hoja?.nombre === NOMBRE && hoja.secciones.length === 5, `la hoja: ${JSON.stringify(hoja)}`);
        revisar((await withRls(personaAjena.claims, (tx) => leerHoja(tx, g.id))) === null, "otra persona lee la hoja");
        revisar((await withRls(coachAjeno.claims, (tx) => leerHoja(tx, g.id))) === null, "un coach ajeno lee la hoja");
        esperar(await retirarVersion(persona, g.id), 200, "retirar");
        revisar((await withRls(persona.claims, (tx) => leerHoja(tx, g.id))) === null, "hay hoja de una versión retirada");
        const copia = await withRls(persona.claims, (tx) => leerGuiasPersona(tx, ENG.principal, PERSONAS.principal));
        revisar(copia.versiones.length === 1 && copia.versiones[0].estado === "retirada" && copia.versiones[0].version === 1, "la persona no ve la retirada en su historial");
      },
    },
    {
      id: "CA-009.56",
      descripcion: "con las versiones 1 y 3 listas y la 2 retirada, el coach recibe dos, la más nueva primero, sin número, y la persona ve las tres con número",
      correr: async () => {
        await reiniciar();
        const v1 = await versionLista();
        const copia2 = await copiarVersion(persona, v1);
        esperar(copia2, 201, "hacer cambios");
        const v2 = GuiaVista.parse(cuerpo(copia2).guia).id;
        esperar(await marcarLista(persona, v2), 200, "listo 2");
        const copia3 = await copiarVersion(persona, v2);
        esperar(copia3, 201, "hacer cambios otra vez");
        const v3Vista = GuiaVista.parse(cuerpo(copia3).guia);
        const editada = v3Vista.lineas.find((l) => l.seccion === "ayuda")!;
        esperar(await decidirLinea(persona, v3Vista.id, editada.id, { accion: "editar", texto: "Un solo canal, el de siempre." }), 200, "editar");
        const quitada = v3Vista.lineas.find((l) => l.seccion === "cambios")!;
        esperar(await decidirLinea(persona, v3Vista.id, quitada.id, { accion: "quitar" }), 200, "quitar");
        esperar(await agregarLinea(persona, v3Vista.id, { seccion: "esperar", texto: "Una línea mía para probar." }), 201, "agregar");
        esperar(await marcarLista(persona, v3Vista.id), 200, "listo 3");
        esperar(await retirarVersion(persona, v2), 200, "retirar la 2");

        const delCoach = await withRls(coach.claims, (tx) => leerVersionesCoach(tx, ENG.principal));
        revisar(delCoach.length === 2 && delCoach[0].id === v3Vista.id && delCoach[1].id === v1, `el coach recibió: ${delCoach.map((v) => v.id).join()}`);
        const texto = JSON.stringify(delCoach);
        for (const fuera of ['"version"', "origenes", "lineaAnteriorId", "estado"]) revisar(!texto.includes(fuera), `al coach le llega: ${fuera}`);
        // CA-009.34: el historial con lo que cambió.
        const { cambios } = delCoach[0];
        revisar(cambios.quitadas.join() === L.cambios, `quitadas: ${JSON.stringify(cambios.quitadas)}`);
        revisar(cambios.editadas.length === 1 && cambios.editadas[0].textoIa === L.ayuda && cambios.editadas[0].texto === "Un solo canal, el de siempre.", `editadas: ${JSON.stringify(cambios.editadas)}`);
        revisar(cambios.agregadas.join() === "Una línea mía para probar.", `agregadas: ${JSON.stringify(cambios.agregadas)}`);
        revisar(cambios.sinCambios === 3, `sin cambios: ${cambios.sinCambios}`);

        revisar((await withRls(coachAjeno.claims, (tx) => leerVersionesCoach(tx, ENG.principal))).length === 0, "un coach ajeno lee versiones");

        const dePersona = await withRls(persona.claims, (tx) => leerGuiasPersona(tx, ENG.principal, PERSONAS.principal));
        revisar(dePersona.versiones.map((v) => `${v.version}:${v.estado}`).join() === "3:lista,2:retirada,1:lista", `la persona ve: ${JSON.stringify(dePersona.versiones)}`);
      },
    },
    {
      id: "CA-009.40",
      descripcion: "un snapshot nuevo con el mismo contenido para la persona no avisa; con otro resumen, sí",
      correr: async () => {
        await conInsumosNuevos(async () => {
          await borrador();
          const leer = async () => (await leerPersona()).borrador?.insumosCambiaron;
          revisar((await leer()) === false, "avisa sin cambios");
          await perfilNuevo();
          revisar((await leer()) === false, "avisa con el mismo contenido: delataría una señal (C-09)");
          await perfilNuevo({ comunicacion_escrita: { resumen: "Otro resumen del perfil, distinto al de antes.", tipo: "fortaleza" } });
          revisar((await leer()) === true, "no avisa con un resumen distinto");
        });
      },
    },
    {
      id: "R-009.18 (versión durante la llamada)",
      descripcion: "si aparece una versión mientras responde el modelo, la persona recibe 409 y no se guarda nada: ni desde una base vieja ni desde cero",
      correr: async () => {
        // Regeneración: la otra pestaña quita una línea y marca otra versión.
        await conInsumosNuevos(async () => {
          const v1 = await versionLista(SALIDA_POR_ORIGEN);
          await planNuevo(conCambiado(DESC_LIDER, { descripcion: "Avisar los cambios de prioridad dos días antes." }));
          let v2 = "";
          const m = modelo({ lineas: [lineaIa("cambios", "Avísame dos días antes.", ["O-01"])] }, async () => {
            const copia = await copiarVersion(persona, v1);
            esperar(copia, 201, "hacer cambios en la otra pestaña");
            const g = GuiaVista.parse(cuerpo(copia).guia);
            v2 = g.id;
            esperar(await decidirLinea(persona, g.id, lineaDe(g, T.apoyo).id, { accion: "quitar" }), 200, "quitar en la otra pestaña");
            esperar(await marcarLista(persona, g.id), 200, "listo en la otra pestaña");
          });
          const guias = await contarGuias();
          esperarError(await pedirBorradorPersona(persona, m), 409, MENSAJES_GUIA.personaHojaCambio, "regeneración");
          revisar((await contarGuias()) === guias + 1, "se guardó el borrador de la regeneración");
          const quitada = (await leerLineas(v2)).find((l) => l.texto === T.apoyo);
          revisar(quitada?.estado === "quitada", "la otra versión cambió");
          revisar((await contarAuditoria()) === 2, "la llamada no quedó en audit_log (R-009.15)");
        });

        // Primera generación: su coach pide otro y ella lo marca mientras responde el modelo.
        await reiniciar();
        const m = modelo(SALIDA_BUENA, async () => {
          esperar(await pedirBorradorCoach(coach, ENG.principal, modelo()), 201, "el coach pide");
          const g = await ultimaGuia();
          for (const l of g.lineas) esperar(await decidirLinea(persona, g.id, l.id, { accion: l.texto === L.ayuda ? "quitar" : "incluir" }), 200, "decidir");
          esperar(await marcarLista(persona, g.id), 200, "listo");
        });
        esperarError(await pedirBorradorPersona(persona, m), 409, MENSAJES_GUIA.personaHojaCambio, "primera generación");
        revisar((await contarGuias()) === 1, "se guardó un borrador desde cero, con la línea que quitó");
      },
    },
    {
      id: "R-009.17 (pedidos encimados)",
      descripcion: "un pedido en camino ya cuenta: encimados no pasan del límite, y solo apartan cupo los que llaman al modelo",
      correr: async () => {
        const sembrar = async (n: number) => {
          for (let i = 0; i < n; i++) await sql`insert into app.audit_log (user_id, engagement_id, accion, ok) values (${PERSONAS.principal}, ${ENG.principal}, ${ACCION_RESERVA_GUIA}, true)`;
        };

        // El segundo pedido llega mientras el primero espera al modelo.
        await reiniciar();
        await sembrar(LIMITE_DIARIO_GUIA - 1);
        const segundo = modelo();
        let respuesta: RespuestaRuta | null = null;
        const primero = modelo(SALIDA_BUENA, async () => {
          respuesta = await pedirBorradorPersona(persona, segundo);
        });
        esperar(await pedirBorradorPersona(persona, primero), 201, "el primero");
        revisar(respuesta !== null, "no corrió el segundo");
        esperarError(respuesta, 429, MENSAJES_GUIA.personaLimite, "el segundo");
        revisar(segundo.llamadas() === 0, "el segundo llamó al modelo");
        revisar((await contarReservas()) === LIMITE_DIARIO_GUIA, `hay ${await contarReservas()} reservas`);
        revisar((await contarAuditoria()) === 1, "hay más de una llamada en audit_log (R-009.15)");

        // Tres al mismo tiempo, con un solo lugar: uno llama.
        await reiniciar();
        await sembrar(LIMITE_DIARIO_GUIA - 1);
        const juntos = modelo();
        const respuestas = await Promise.all([pedirBorradorPersona(persona, juntos), pedirBorradorPersona(persona, juntos), pedirBorradorPersona(persona, juntos)]);
        revisar(juntos.llamadas() === 1, `se llamó ${juntos.llamadas()} veces al modelo`);
        const estados = respuestas.map((r) => r.status).sort().join();
        revisar(estados === "201,429,429", `respondieron: ${estados}`);
      },
    },
    {
      id: "R-009.29 (lo que mostró la pantalla)",
      descripcion: "Listo solo congela lo que la pantalla mostró: con otro estado, otro nombre u otra línea responde 409 y nada cambia",
      correr: async () => {
        await reiniciar();
        const g = await borrador();
        await incluirTodas(g);
        const quitar = g.lineas[0];
        esperar(await decidirLinea(persona, g.id, quitar.id, { accion: "quitar" }), 200, "quitar");
        const huellaVieja = await huellaActual(g.id);

        // La otra pestaña la vuelve a incluir: esta sigue enseñándola como quitada.
        esperar(await decidirLinea(persona, g.id, quitar.id, { accion: "volver_a_incluir" }), 200, "volver a incluir");
        const vieja = await marcarListaConHuella(persona, g.id, { huella: huellaVieja });
        esperarError(vieja, 409, MENSAJES_ACCIONES.borradorCambio, "línea que cambió");
        const sigue = await filaGuia(g.id);
        revisar(sigue.estado === "borrador" && sigue.version === null && sigue.documento === null, "se congeló algo que no mostró");

        const huellaConNombre = await huellaActual(g.id);
        esperar(await cambiarNombre(persona, g.id, { nombreAMostrar: "Luz María" }), 200, "nombre");
        esperarError(await marcarListaConHuella(persona, g.id, { huella: huellaConNombre }), 409, MENSAJES_ACCIONES.borradorCambio, "nombre que cambió");
        const huellaConLineas = await huellaActual(g.id);
        esperar(await agregarLinea(persona, g.id, { seccion: "ayuda", texto: "Una línea mía de la otra pestaña." }), 201, "agregar");
        esperarError(await marcarListaConHuella(persona, g.id, { huella: huellaConLineas }), 409, MENSAJES_ACCIONES.borradorCambio, "línea agregada");

        // Sin huella, o con otra llave, no pasa.
        esperarError(await marcarListaConHuella(persona, g.id, {}), 400, MENSAJES_ACCIONES.invalido, "sin huella");
        esperarError(await marcarListaConHuella(persona, g.id, null), 400, MENSAJES_ACCIONES.invalido, "sin cuerpo");

        // La respuesta de cada acción trae la huella con la que sigue la pantalla, y con ella sí pasa.
        const ultima = await cambiarNombre(persona, g.id, { nombreAMostrar: "Luz" });
        esperar(ultima, 200, "nombre");
        const vista = GuiaVista.parse(cuerpo(ultima).guia);
        esperar(await marcarListaConHuella(persona, g.id, { huella: vista.huella }), 200, "con la huella de la última respuesta");
        revisar(JSON.stringify((await filaGuia(g.id)).documento).includes(quitar.texto), "el documento no trae lo que mostró");
      },
    },
    {
      id: "R-009.46 (el aviso tiene salida)",
      descripcion: "un plan igual no avisa; si el modelo revisó y no cambió nada, el aviso se va y no se vuelve a llamar; lo nuevo avisa otra vez",
      correr: async () => {
        await conInsumosNuevos(async () => {
          const id = await versionLista(SALIDA_POR_ORIGEN);
          await planNuevo(ITEMS_IGUALES);
          revisar((await leerPersona()).avisoCambios === false, "avisa con un plan con los mismos textos");
          // Con "Hacer cambios" y Listo tampoco reaparece.
          const copia = await copiarVersion(persona, id);
          esperar(copia, 201, "hacer cambios");
          const c = GuiaVista.parse(cuerpo(copia).guia);
          revisar((await leerPersona()).borrador?.insumosCambiaron === false, "el borrador dice que cambiaron");
          esperar(await marcarLista(persona, c.id), 200, "listo");
          revisar((await leerPersona()).avisoCambios === false, "avisa después de la versión nueva");

          // Cambia un texto del coach, y el modelo escribe lo mismo que ya está en la hoja.
          const texto = "Avisar los cambios de prioridad dos días antes.";
          await planNuevo(conCambiado(DESC_LIDER, { descripcion: texto }));
          revisar((await leerPersona()).avisoCambios === true, "no avisa con un texto distinto");
          const igual = modelo({ lineas: [lineaIa("cambios", T.lider, ["O-01"])] });
          const guias = await contarGuias();
          esperarError(await pedirBorradorPersona(persona, igual), 409, MENSAJES_GUIA.personaSinCambios, "el modelo escribe lo mismo");
          revisar(igual.llamadas() === 1, "no se llamó al modelo");
          revisar((await contarGuias()) === guias, "se creó una guía");
          revisar((await leerPersona()).avisoCambios === false, "el aviso sigue aunque ya se revisó");

          // Una pestaña vieja no gasta otra llamada.
          const reservas = await contarReservas();
          const otra = modelo();
          esperarError(await pedirBorradorPersona(persona, otra), 409, MENSAJES_GUIA.personaSinCambios, "pestaña vieja");
          revisar(otra.llamadas() === 0 && (await contarReservas()) === reservas, "la pestaña vieja gastó una llamada");

          // Los mismos textos en otro plan no avisan; uno nuevo, sí.
          await planNuevo(conCambiado(DESC_LIDER, { de: texto, descripcion: texto }));
          revisar((await leerPersona()).avisoCambios === false, "avisa con los mismos textos ya revisados");
          await planNuevo(conCambiado(DESC_LIDER, { de: texto, descripcion: "Avisar los cambios de prioridad tres días antes." }));
          revisar((await leerPersona()).avisoCambios === true, "no avisa con un texto nuevo");
        });
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
    // El log del servidor de estas funciones sí se revisa: no debe traer texto de la guía ni del plan (C-17).
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
    const prohibidos = [...CENTINELAS_INTERNOS, RESUMEN, TEXTO_OBJETIVO, TEXTO_APOYO, ...Object.values(L), "TDAH"];
    const conTexto = lineas.filter((l) => prohibidos.some((t) => l.includes(t)));
    if (conTexto.length > 0) {
      fallas++;
      console.log(`FALLA R-009.15 el log del servidor trae texto de la guía o del plan: ${conTexto.length} líneas`);
    } else {
      console.log(`OK    R-009.15 ${lineas.length} líneas de log del servidor, ninguna con texto de la guía o del plan`);
    }
  } finally {
    await limpiar();
    await sql.end();
  }
  console.log(`\n${total - fallas} de ${total} casos pasaron. ${fallas ? `${fallas} fallaron.` : "Ninguno falló."} Se borró lo creado.`);
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error("guia-check no pudo correr:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
