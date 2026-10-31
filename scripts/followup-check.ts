// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Pruebas de ruta de la spec 004 (R-004.50, tarea 19): llama a las funciones de lib/ que usan los
// route.ts, con un modelo simulado y cuentas sintéticas. Sin red y sin caminos de prueba en el
// servidor. La capa de cookies y el 401 se cubren en el navegador.
// Uso: npm run followup-check  (necesita DATABASE_URL en .env.local, las migraciones y el seed).
//
// Crea sus propios acompañamientos con ids fijos y los borra al empezar y al terminar. No toca el
// demo. Imprime "OK|FALLA <ID> <descripción>" por caso y sale con 1 si alguno falla.
import { resolve } from "node:path";
import { config } from "dotenv";
import { NoObjectGeneratedError } from "ai";
import { sql as drizzleSql } from "drizzle-orm";
import postgres from "postgres";
import type { ResultadoSeguimientoModelo } from "@/lib/ai/propose-followup";
import type { ResultadoPropuesta } from "@/lib/ai/propose-profile-update";
import type { UsuarioRuta, RespuestaRuta } from "@/lib/api/ruta";
import { withRls } from "@/lib/db/rls";
import { cambiarAlerta, cerrarSenal, crearAlerta, quitarContexto } from "@/lib/followup/acciones";
import { historialDeItem } from "@/lib/followup/avance";
import { decidirPropuesta } from "@/lib/followup/decision";
import { aRealizadaEn, hoyEnMonterrey } from "@/lib/followup/fecha";
import { leerPlanConAvance, leerSeguimiento, leerVistaPropuesta } from "@/lib/followup/lectura";
import { PayloadSeguimientoIA, type FollowupUpdate } from "@/lib/followup/schema";
import { PayloadPropuestaIA, type Perfil } from "@/lib/profile/schema";
import { PROMPT_VERSION, PROMPT_VERSION_SEGUIMIENTO, type EntradaSeguimiento } from "@/lib/prompts";
import { crearSesion, reintentarPropuesta, type DepsModelo } from "@/lib/sessions/proponer";

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
const COACH_AJENO = "a0000000-0000-4000-8000-000000000001";

const PERSONAS = {
  incl: "a0000000-0000-4000-8000-000000000011",
  ws: "a0000000-0000-4000-8000-000000000012",
  sinPlan: "a0000000-0000-4000-8000-000000000013",
  perfil: "a0000000-0000-4000-8000-000000000014",
} as const;
const ENG = {
  incl: "a0000000-0000-4000-8000-000000000021",
  ws: "a0000000-0000-4000-8000-000000000022",
  sinPlan: "a0000000-0000-4000-8000-000000000023",
  perfil: "a0000000-0000-4000-8000-000000000024",
} as const;
const TODOS_ENG = Object.values(ENG);

const AVISO = "2026-10-31";
const usuario: UsuarioRuta = { id: COACH, claims: { sub: COACH, role: "authenticated" } };
const ajeno: UsuarioRuta = { id: COACH_AJENO, claims: { sub: COACH_AJENO, role: "authenticated" } };

const NOTA =
  "La sesión fue tranquila. Avanzó con el reporte semanal y lo entregó a tiempo. Comentó que se muda de ciudad el próximo mes. " +
  "También dijo que el ruido de la oficina le sigue costando trabajo. Se va de vacaciones la próxima semana.";
const CITA_AVANCE = "Avanzó con el reporte semanal";
const CITA_MUDANZA = "se muda de ciudad el próximo mes";
const CITA_RUIDO = "el ruido de la oficina le sigue costando trabajo";
const CITA_VACACIONES = "Se va de vacaciones la próxima semana";
const ev = (cita: string) => [{ cita }];

function updateVacio(): FollowupUpdate {
  return { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [], avance: [], contexto: [], siguientePaso: null };
}

function updateCompleto(ref = "P-01"): FollowupUpdate {
  return {
    ...updateVacio(),
    cambios: [
      {
        dimension: "aspectos_sensoriales",
        resumen: "A Sol le ayuda trabajar en un lugar con poco ruido.",
        tipo: "area_de_apoyo",
        dominiosFE: [],
        evidencia: ev(CITA_RUIDO),
      },
    ],
    senales: [{ tipo: "cambio_de_vida", descripcion: "Se muda de ciudad.", evidencia: ev(CITA_MUDANZA) }],
    preguntasParaSiguienteSesion: ["¿Cómo va la mudanza?"],
    avance: [{ itemRef: ref, estado: "avanza", resumen: "Entregó el reporte a tiempo.", evidencia: ev(CITA_AVANCE) }],
    contexto: [{ texto: "Vacaciones la próxima semana.", evidencia: ev(CITA_VACACIONES) }],
    siguientePaso: { texto: "Revisar el reporte de la siguiente semana", itemRef: ref, fichaId: null, evidencia: ev(CITA_AVANCE) },
  };
}

// ---------------------------------------------------------------------------
// Modelo simulado
// ---------------------------------------------------------------------------

function resultadoSeguimiento(update: FollowupUpdate): ResultadoSeguimientoModelo {
  return {
    update,
    usage: { entrada: 100, salida: 50, cacheLectura: 0 },
    latenciaMs: 7,
    modelo: "modelo-simulado",
    promptVersion: PROMPT_VERSION_SEGUIMIENTO,
  };
}

function modeloCon(update: FollowupUpdate, alLlamar?: (entrada: EntradaSeguimiento) => void | Promise<void>): DepsModelo {
  return {
    proponerPerfil: async (): Promise<ResultadoPropuesta> => {
      throw new Error("este caso no debía usar el prompt de 001");
    },
    proponerSeguimiento: async (entrada) => {
      await alLlamar?.(entrada);
      return resultadoSeguimiento(update);
    },
  };
}

const modeloQueFalla: DepsModelo = {
  proponerPerfil: async () => {
    throw new Error("falla simulada del modelo");
  },
  proponerSeguimiento: async () => {
    throw new Error("falla simulada del modelo");
  },
};

const modeloPerfil: DepsModelo = {
  proponerPerfil: async () => ({
    update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] },
    usage: { entrada: 1, salida: 1, cacheLectura: 0 },
    latenciaMs: 1,
    modelo: "modelo-simulado",
    promptVersion: PROMPT_VERSION,
  }),
  proponerSeguimiento: async () => {
    throw new Error("este caso no debía usar el prompt de seguimiento");
  },
};

// ---------------------------------------------------------------------------
// Preparación y limpieza (como owner)
// ---------------------------------------------------------------------------

async function limpiar() {
  await sql`delete from app.audit_log where engagement_id = any(${TODOS_ENG}::uuid[])`;
  for (const tabla of [
    "plan_item_updates",
    "followup_context",
    "signal_states",
    "strong_alerts",
    "persona_plans",
    "plan_items",
    "plans",
    "persona_profiles",
    "profile_snapshots",
    "profile_events",
    "sessions",
  ]) {
    await sql.unsafe(`delete from app.${tabla} where engagement_id = any($1::uuid[])`, [TODOS_ENG]);
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

async function crearEngagement(id: string, persona: string, tipo: string, etapa: string) {
  await sql`
    insert into app.engagements (id, org_id, type, stage, coach_id, persona_id, diagnostico_verificado, cedula_profesional, diagnostico_verificado_por, diagnostico_verificado_en)
    values (${id}, ${ORG}, ${tipo}, ${etapa}, ${COACH}, ${persona}, true, '1234567', ${COACH}, now())`;
  await sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${id}, ${persona}, 'otorgado', ${AVISO})`;
}

const PERFIL_BASE = (sesion: string, evento: string): Perfil => ({
  dimensiones: {},
  senalesActivas: [
    {
      tipo: "estres_desregulacion",
      descripcion: "Señal sintética de estrés.",
      evidencia: [{ cita: "Cita sintética anterior de estrés", sessionId: sesion }],
      detectadaEn: "2026-10-01T18:00:00.000Z",
      eventoId: evento,
    },
  ],
});

// Snapshot versión 1 con una señal activa y plan aprobado versión 1 con dos ítems.
async function sembrarPerfilYPlan(engagementId: string): Promise<{ items: string[]; planId: string }> {
  const [s] = await sql`
    insert into app.sessions (engagement_id, coach_id, nota_original) values (${engagementId}, ${COACH}, 'Nota sintética anterior de followup-check.') returning id`;
  const payload = { tipo: "propuesta_ia", update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] }, descartados: [], banderas: [] };
  const [e] = await sql`
    insert into app.profile_events (engagement_id, session_id, tipo, status, payload, created_by)
    values (${engagementId}, ${s.id}, 'propuesta_ia', 'approved', ${sql.json(payload)}, ${COACH}) returning id`;
  const [snap] = await sql`
    insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
    values (${engagementId}, 1, ${sql.json(PERFIL_BASE(s.id, e.id))}, ${e.id}, ${COACH}) returning id`;
  await sql`insert into app.persona_profiles (snapshot_id, engagement_id, version, contenido) values (${snap.id}, ${engagementId}, 1, ${sql.json({ dimensiones: {} })})`;
  const [plan] = await sql`
    insert into app.plans (engagement_id, titulo, status, version, profile_snapshot_id, created_by, approved_by, approved_at)
    values (${engagementId}, 'Plan sintético', 'aprobado', 1, ${snap.id}, ${COACH}, ${COACH}, now()) returning id`;
  const [a] = await sql`
    insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, orden) values (${plan.id}, ${engagementId}, 'objetivo', 'Entregar el reporte semanal', 0) returning id`;
  const [b] = await sql`
    insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, orden) values (${plan.id}, ${engagementId}, 'ajuste_razonable', 'Lugar con poco ruido', 1) returning id`;
  return { items: [a.id, b.id], planId: plan.id };
}

async function preparar() {
  await limpiar();
  await crearUsuario(COACH_AJENO, "coach-ajeno-fc@caja-mex.test", "coach", "Coach Ajeno");
  await crearUsuario(PERSONAS.incl, "persona-incl-fc@caja-mex.test", "persona", "Sol");
  await crearUsuario(PERSONAS.ws, "persona-ws-fc@caja-mex.test", "persona", "Noa");
  await crearUsuario(PERSONAS.sinPlan, "persona-sinplan-fc@caja-mex.test", "persona", "Río");
  await crearUsuario(PERSONAS.perfil, "persona-perfil-fc@caja-mex.test", "persona", "Ale");
  await crearEngagement(ENG.incl, PERSONAS.incl, "inclusion", "seguimiento");
  await crearEngagement(ENG.ws, PERSONAS.ws, "workplace_support", "seguimiento");
  await crearEngagement(ENG.sinPlan, PERSONAS.sinPlan, "inclusion", "seguimiento");
  await crearEngagement(ENG.perfil, PERSONAS.perfil, "inclusion", "perfil");
  const incl = await sembrarPerfilYPlan(ENG.incl);
  await sembrarPerfilYPlan(ENG.ws);
  return incl;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

class Falla extends Error {}

function revisar(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new Falla(mensaje);
}

const cuerpo = (r: RespuestaRuta) => r.cuerpo as { error?: string; ruta?: string; sessionId?: string; eventId?: string; snapshotId?: string | null; version?: number | null; id?: string };

function esperar(r: RespuestaRuta, status: number, que: string) {
  revisar(r.status === status, `${que}: se esperaba ${status} y llegó ${r.status} (${cuerpo(r).error ?? "sin error"})`);
}

async function contar(tabla: string, engagementId: string, extra = ""): Promise<number> {
  const [r] = await sql.unsafe(`select count(*)::int as n from app.${tabla} where engagement_id = $1 ${extra}`, [engagementId]);
  return r.n as number;
}

async function retirar(engagementId: string, persona: string) {
  await sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${engagementId}, ${persona}, 'retirado', ${AVISO})`;
}
async function otorgar(engagementId: string, persona: string) {
  await sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${engagementId}, ${persona}, 'otorgado', ${AVISO})`;
}

const APROBAR = (a: Record<string, unknown>) => ({ accion: "aprobar", aprobacion: { cambios: [], senales: [], ...a } });

// Crea una sesión con propuesta. Devuelve sus ids.
async function sesionConPropuesta(engagementId: string, update: FollowupUpdate) {
  const r = await crearSesion(usuario, engagementId, { nota: NOTA }, modeloCon(update));
  esperar(r, 200, "crear la sesión");
  return { sessionId: cuerpo(r).sessionId!, eventId: cuerpo(r).eventId! };
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

type Caso = { id: string; descripcion: string; correr: () => Promise<void> };

function casos(demo: { items: string[]; planId: string }): Caso[] {
  return [
    {
      id: "CA-004.1",
      descripcion: "una sesión con la red de apoyo de hace tres días queda con ese tipo y esa fecha",
      correr: async () => {
        const hace3 = new Date(Date.now() - 3 * 86_400_000);
        const fecha = hoyEnMonterrey(hace3);
        const r = await crearSesion(usuario, ENG.incl, { nota: NOTA, tipo: "red_de_apoyo", fecha }, modeloCon(updateVacio()));
        esperar(r, 200, "crear");
        const [s] = await sql`select tipo::text as tipo, realizada_en from app.sessions where id = ${cuerpo(r).sessionId!}`;
        revisar(s.tipo === "red_de_apoyo", `tipo guardado: ${s.tipo}`);
        revisar((s.realizada_en as Date).getTime() === aRealizadaEn(fecha).getTime(), "realizada_en no es las 12:00 de ese día");
      },
    },
    {
      id: "CA-004.2",
      descripcion: "una fecha de mañana responde 400 y no crea sesión",
      correr: async () => {
        const antes = await contar("sessions", ENG.incl);
        const manana = hoyEnMonterrey(new Date(Date.now() + 86_400_000));
        const r = await crearSesion(usuario, ENG.incl, { nota: NOTA, fecha: manana }, modeloCon(updateVacio()));
        esperar(r, 400, "fecha futura");
        revisar(cuerpo(r).error === "La fecha de la sesión no puede ser después de hoy.", "mensaje distinto al de la spec");
        revisar((await contar("sessions", ENG.incl)) === antes, "se creó una sesión");
      },
    },
    {
      id: "CA-004.3",
      descripcion: "sin consentimiento responde 409, sin sesión nueva ni auditoría",
      correr: async () => {
        const sesiones = await contar("sessions", ENG.ws);
        const auditoria = await contar("audit_log", ENG.ws);
        await retirar(ENG.ws, PERSONAS.ws);
        try {
          const r = await crearSesion(usuario, ENG.ws, { nota: NOTA }, modeloQueFalla);
          esperar(r, 409, "sin consentimiento");
          revisar((await contar("sessions", ENG.ws)) === sesiones, "se creó una sesión");
          revisar((await contar("audit_log", ENG.ws)) === auditoria, "se escribió en audit_log");
        } finally {
          await otorgar(ENG.ws, PERSONAS.ws);
        }
      },
    },
    {
      id: "CA-004.4",
      descripcion: "en seguimiento sin plan aprobado la sesión se guarda, sin ítems al modelo ni avance en la propuesta",
      correr: async () => {
        let recibido: EntradaSeguimiento | null = null;
        const r = await crearSesion(usuario, ENG.sinPlan, { nota: NOTA }, modeloCon(updateCompleto(), (e) => void (recibido = e)));
        esperar(r, 200, "crear");
        const entrada = recibido as EntradaSeguimiento | null;
        revisar(entrada?.itemsPlan.length === 0, "el mensaje al modelo trae ítems del plan");
        const [e] = await sql`select payload, plan_base_id from app.profile_events where id = ${cuerpo(r).eventId!}`;
        const payload = PayloadSeguimientoIA.parse(e.payload);
        revisar(payload.update.avance.length === 0, "la propuesta trae avance");
        revisar(e.plan_base_id === null, "plan_base_id no es nulo");
        const datos = await withRls(usuario.claims, (tx) => leerSeguimiento(tx, ENG.sinPlan, null));
        revisar(datos.hayPlanVigente === false, "la pantalla no sabría que falta el plan");
      },
    },
    {
      id: "CA-004.5",
      descripcion: "inclusión y Workplace Support dejan un evento proposed que pasa el mismo esquema",
      correr: async () => {
        for (const eng of [ENG.incl, ENG.ws]) {
          const { eventId } = await sesionConPropuesta(eng, updateCompleto());
          const [e] = await sql`select status::text as status, payload from app.profile_events where id = ${eventId}`;
          revisar(e.status === "proposed", `status ${e.status}`);
          PayloadSeguimientoIA.parse(e.payload);
        }
      },
    },
    {
      id: "CA-004.15",
      descripcion: "un campo de puntaje en la salida del modelo responde 502 y deja la nota sin propuesta",
      correr: async () => {
        const conPuntaje = { ...updateVacio(), puntaje: 80 } as unknown as FollowupUpdate;
        const r = await crearSesion(usuario, ENG.incl, { nota: NOTA }, modeloCon(conPuntaje));
        esperar(r, 502, "salida con puntaje");
        const sessionId = cuerpo(r).sessionId;
        revisar(sessionId, "el 502 no trae sessionId");
        const [n] = await sql`select count(*)::int as n from app.profile_events where session_id = ${sessionId}`;
        revisar(n.n === 0, "se guardó un evento");
        const [s] = await sql`select count(*)::int as n from app.sessions where id = ${sessionId}`;
        revisar(s.n === 1, "la nota no quedó guardada");
      },
    },
    {
      id: "CA-004.29",
      descripcion: "tras un 502, el reintento usa la misma sesión y guarda perfil_version_base y plan_base_id",
      correr: async () => {
        const antes = await contar("sessions", ENG.incl);
        const r = await crearSesion(usuario, ENG.incl, { nota: NOTA }, modeloQueFalla);
        esperar(r, 502, "modelo que falla");
        const sessionId = cuerpo(r).sessionId!;
        const [{ version }] = await sql`select max(version)::int as version from app.profile_snapshots where engagement_id = ${ENG.incl}`;
        const otra = await reintentarPropuesta(usuario, ENG.incl, sessionId, modeloCon(updateCompleto()));
        esperar(otra, 200, "reintento");
        revisar((await contar("sessions", ENG.incl)) === antes + 1, "el reintento creó otra sesión");
        const [e] = await sql`select session_id, perfil_version_base, plan_base_id from app.profile_events where id = ${cuerpo(otra).eventId!}`;
        revisar(e.session_id === sessionId, "el evento no es de esa sesión");
        revisar(e.perfil_version_base === version, `perfil_version_base ${e.perfil_version_base}, último snapshot ${version}`);
        revisar(e.plan_base_id === demo.planId, "plan_base_id no es el plan vigente");
      },
    },
    {
      id: "CA-004.30",
      descripcion: "con propuesta existente el reintento responde 409 sin auditar; dos reintentos a la vez dejan un solo evento",
      correr: async () => {
        const { sessionId, eventId } = await sesionConPropuesta(ENG.incl, updateVacio());
        const auditoria = await contar("audit_log", ENG.incl);
        const r = await reintentarPropuesta(usuario, ENG.incl, sessionId, modeloQueFalla);
        esperar(r, 409, "reintento con propuesta");
        revisar(cuerpo(r).eventId === eventId, "el 409 no trae el eventId");
        revisar((await contar("audit_log", ENG.incl)) === auditoria, "se escribió en audit_log");

        const sinPropuesta = await crearSesion(usuario, ENG.incl, { nota: NOTA }, modeloQueFalla);
        const id = cuerpo(sinPropuesta).sessionId!;
        const [a, b] = await Promise.all([
          reintentarPropuesta(usuario, ENG.incl, id, modeloCon(updateVacio())),
          reintentarPropuesta(usuario, ENG.incl, id, modeloCon(updateVacio())),
        ]);
        const [n] = await sql`select count(*)::int as n from app.profile_events where session_id = ${id}`;
        revisar(n.n === 1, `quedaron ${n.n} eventos`);
        revisar([a.status, b.status].sort().join() === "200,409", `respuestas ${a.status} y ${b.status}`);
      },
    },
    {
      id: "CA-004.35",
      descripcion: "la propuesta queda en audit_log con acción, modelo, versión, tokens y latencia, sin texto de la nota",
      correr: async () => {
        await sql`delete from app.audit_log where engagement_id = ${ENG.ws}`;
        await sesionConPropuesta(ENG.ws, updateVacio());
        const filas = await sql`select * from app.audit_log where engagement_id = ${ENG.ws}`;
        revisar(filas.length === 1, `${filas.length} filas de auditoría`);
        const f = filas[0];
        revisar(f.accion === "propose_followup_update", `accion ${f.accion}`);
        revisar(f.modelo === "modelo-simulado" && f.prompt_version === PROMPT_VERSION_SEGUIMIENTO, "modelo o versión de prompt");
        revisar(f.tokens_entrada === 100 && f.tokens_salida === 50 && f.latencia_ms === 7 && f.ok === true, "tokens, latencia u ok");
        revisar(!JSON.stringify(f).includes("reporte semanal"), "la fila trae texto de la nota");
      },
    },
    {
      id: "CA-004.37",
      descripcion: "después de guardar y aprobar una sesión, la etapa sigue en seguimiento",
      correr: async () => {
        const { eventId } = await sesionConPropuesta(ENG.ws, updateCompleto());
        esperar(await decidirPropuesta(usuario, eventId, APROBAR({ cambios: [0], senales: [0], avance: [0] })), 200, "aprobar");
        const [e] = await sql`select stage::text as stage from app.engagements where id = ${ENG.ws}`;
        revisar(e.stage === "seguimiento", `etapa ${e.stage}`);
      },
    },
    {
      id: "CA-004.10",
      descripcion: "el historial de un ítem muestra los estados en orden y el último es el más reciente",
      correr: async () => {
        const uno = await sesionConPropuesta(ENG.incl, updateCompleto());
        esperar(await decidirPropuesta(usuario, uno.eventId, APROBAR({ avance: [0] })), 200, "aprobar Avanza");
        const cumplido = updateCompleto();
        cumplido.avance[0].estado = "cumplido";
        const dos = await sesionConPropuesta(ENG.incl, cumplido);
        esperar(await decidirPropuesta(usuario, dos.eventId, APROBAR({ avance: [0] })), 200, "aprobar Cumplido");
        const plan = await withRls(usuario.claims, (tx) => leerPlanConAvance(tx, ENG.incl));
        const historia = historialDeItem(plan.items[0].id, plan.cadena, plan.updates);
        revisar(historia.length >= 2, `${historia.length} estados`);
        revisar(historia.at(-1)?.estado === "cumplido", `el último es ${historia.at(-1)?.estado}`);
      },
    },
    {
      id: "CA-004.41",
      descripcion: "con otra versión del plan, el avance se guarda en el equivalente y el de un ítem sin equivalente no se aprueba",
      correr: async () => {
        const dosAvances: FollowupUpdate = {
          ...updateVacio(),
          avance: [
            { itemRef: "P-01", estado: "avanza", resumen: "Entregó el reporte.", evidencia: ev(CITA_AVANCE) },
            { itemRef: "P-02", estado: "sin_cambios", resumen: "El ruido sigue.", evidencia: ev(CITA_RUIDO) },
          ],
        };
        const { eventId } = await sesionConPropuesta(ENG.incl, dosAvances);
        // Versión 2 del plan: sigue al primer ítem; el segundo ya no está.
        const [snap] = await sql`select id from app.profile_snapshots where engagement_id = ${ENG.incl} order by version desc limit 1`;
        const [{ v }] = await sql`select max(version)::int + 1 as v from app.plans where engagement_id = ${ENG.incl}`;
        const [plan2] = await sql`
          insert into app.plans (engagement_id, titulo, status, version, profile_snapshot_id, created_by, approved_by, approved_at)
          values (${ENG.incl}, 'Plan sintético 2', 'aprobado', ${v}, ${snap.id}, ${COACH}, ${COACH}, now()) returning id`;
        const [nuevo] = await sql`
          insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, origen_item_id, orden)
          values (${plan2.id}, ${ENG.incl}, 'objetivo', 'Entregar el reporte semanal, versión 2', ${demo.items[0]}, 0) returning id`;

        const vista = await withRls(usuario.claims, (tx) => leerVistaPropuesta(tx, ENG.incl, eventId));
        revisar(vista?.avisoPlan?.actual === v, "la revisión no trae el aviso de versión del plan");
        revisar(vista?.avanceSinEquivalente.join() === "1", `sin equivalente: ${vista?.avanceSinEquivalente.join()}`);

        const bloqueado = await decidirPropuesta(usuario, eventId, APROBAR({ avance: [1] }));
        esperar(bloqueado, 400, "avance sin equivalente");
        revisar(cuerpo(bloqueado).ruta === "avance[1]", `ruta ${cuerpo(bloqueado).ruta}`);

        esperar(await decidirPropuesta(usuario, eventId, APROBAR({ avance: [0] })), 200, "avance con equivalente");
        const filas = await sql`select plan_item_id from app.plan_item_updates where event_id = ${eventId}`;
        revisar(filas.length === 1 && filas[0].plan_item_id === nuevo.id, "el avance no quedó en el ítem de la versión vigente");
      },
    },
    {
      id: "CA-004.43",
      descripcion: "un texto editado con una condición, una etiqueta o una cita responde 400 sin escribir; limpio se aprueba",
      correr: async () => {
        const { eventId } = await sesionConPropuesta(ENG.ws, updateCompleto());
        const snapshots = await contar("profile_snapshots", ENG.ws);
        const vistas = await contar("persona_profiles", ENG.ws);
        for (const malo of ["Sol es autista y le ayuda el silencio.", "Le cuesta la memoria de trabajo.", `Sol dijo que ${CITA_RUIDO}.`]) {
          const r = await decidirPropuesta(usuario, eventId, APROBAR({ cambios: [0], ediciones: [{ indice: 0, resumen: malo }] }));
          esperar(r, 400, `texto "${malo.slice(0, 20)}"`);
          revisar(cuerpo(r).ruta === "cambios[0].resumen", `ruta ${cuerpo(r).ruta}`);
          revisar(cuerpo(r).error?.startsWith("Hay texto que no puede llegar a"), "mensaje distinto al de la spec");
        }
        revisar((await contar("profile_snapshots", ENG.ws)) === snapshots, "se creó un snapshot");
        revisar((await contar("persona_profiles", ENG.ws)) === vistas, "se creó una copia para la persona");
        const [e] = await sql`select status::text as status from app.profile_events where id = ${eventId}`;
        revisar(e.status === "proposed", `el evento quedó ${e.status}`);

        const limpio = "A Sol le ayuda trabajar en un lugar tranquilo.";
        const ok = await decidirPropuesta(usuario, eventId, APROBAR({ cambios: [0], ediciones: [{ indice: 0, tipo: "contexto", resumen: limpio }] }));
        esperar(ok, 200, "texto limpio");
        const [pp] = await sql`select contenido from app.persona_profiles where snapshot_id = ${cuerpo(ok).snapshotId!}`;
        revisar(pp.contenido.dimensiones.aspectos_sensoriales.resumen === limpio, "la persona no ve el texto editado");
        revisar(pp.contenido.dimensiones.aspectos_sensoriales.tipo === "contexto", "la persona no ve el tipo editado");
        const [dec] = await sql`select payload, approved_payload from app.profile_events where id = ${eventId}`;
        revisar(dec.payload.update.cambios[0].tipo === "area_de_apoyo" && dec.approved_payload.ediciones[0].tipo === "contexto", "la decisión no guarda los dos tipos");
        revisar(dec.payload.update.cambios[0].resumen !== limpio && dec.approved_payload.ediciones[0].resumen === limpio, "la decisión no guarda los dos textos");
      },
    },
    {
      id: "CA-004.44",
      descripcion: "si falla el guardado después de una llamada exitosa, audit_log conserva la fila con ok = true",
      correr: async () => {
        const auditoria = await contar("audit_log", ENG.ws, "and ok");
        // La sesión se borra mientras el modelo responde: la llave foránea rechaza el insert del evento.
        const m = modeloCon(updateVacio(), async () => {
          await sql`delete from app.sessions where id = (select id from app.sessions where engagement_id = ${ENG.ws} order by created_at desc limit 1)`;
        });
        const r = await crearSesion(usuario, ENG.ws, { nota: NOTA }, m);
        esperar(r, 500, "guardado que falla");
        revisar(cuerpo(r).sessionId, "el 500 no trae sessionId");
        revisar((await contar("audit_log", ENG.ws, "and ok")) === auditoria + 1, "no quedó la fila con ok = true");
      },
    },
    {
      id: "CA-004.44",
      descripcion: "si el consentimiento se retira mientras responde el modelo, responde 409, audita la llamada y no ofrece reintento",
      correr: async () => {
        const auditoria = await contar("audit_log", ENG.ws, "and ok");
        const m = modeloCon(updateVacio(), () => retirar(ENG.ws, PERSONAS.ws));
        try {
          const r = await crearSesion(usuario, ENG.ws, { nota: NOTA }, m);
          esperar(r, 409, "retiro durante la llamada");
          revisar(!cuerpo(r).sessionId && !cuerpo(r).eventId, "el 409 ofrece un reintento");
          revisar((await contar("audit_log", ENG.ws, "and ok")) === auditoria + 1, "no quedó la fila con ok = true");
        } finally {
          await otorgar(ENG.ws, PERSONAS.ws);
        }
      },
    },
    {
      id: "R-004.35",
      descripcion: "una salida que el SDK rechaza se audita con sus tokens y ok = false",
      correr: async () => {
        const antes = await contar("audit_log", ENG.ws, "and not ok and tokens_entrada = 321");
        const error = new NoObjectGeneratedError({
          response: { id: "x", timestamp: new Date(), modelId: "modelo-simulado" },
          usage: { inputTokens: 321, outputTokens: 12 } as never,
          finishReason: "length" as never,
        });
        const m: DepsModelo = {
          ...modeloQueFalla,
          proponerSeguimiento: async () => {
            throw error;
          },
        };
        esperar(await crearSesion(usuario, ENG.ws, { nota: NOTA }, m), 502, "salida rechazada");
        revisar((await contar("audit_log", ENG.ws, "and not ok and tokens_entrada = 321")) === antes + 1, "la fila no lleva los tokens");
      },
    },
    {
      id: "R-004.10",
      descripcion: "la historia de un ítem que salió del plan se sigue viendo en el historial",
      correr: async () => {
        const antes = await withRls(usuario.claims, (tx) => leerSeguimiento(tx, ENG.sinPlan, null));
        revisar(antes.avanceFuera.length === 0, "control");
        // Plan 1 con un ítem con avance, plan 2 sin ese ítem.
        const [s] = await sql`insert into app.sessions (engagement_id, coach_id, nota_original) values (${ENG.sinPlan}, ${COACH}, 'Nota sintética del historial de followup-check.') returning id`;
        const payload = { tipo: "propuesta_ia", update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] }, descartados: [], banderas: [] };
        const [e] = await sql`insert into app.profile_events (engagement_id, session_id, tipo, status, payload, created_by) values (${ENG.sinPlan}, ${s.id}, 'propuesta_ia', 'approved', ${sql.json(payload)}, ${COACH}) returning id`;
        const [snap] = await sql`insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by) values (${ENG.sinPlan}, 1, ${sql.json({ dimensiones: {}, senalesActivas: [] })}, ${e.id}, ${COACH}) returning id`;
        const [p1] = await sql`insert into app.plans (engagement_id, titulo, status, version, profile_snapshot_id, created_by, approved_by, approved_at) values (${ENG.sinPlan}, 'Plan 1', 'aprobado', 1, ${snap.id}, ${COACH}, ${COACH}, now()) returning id`;
        const [i1] = await sql`insert into app.plan_items (plan_id, engagement_id, tipo, descripcion) values (${p1.id}, ${ENG.sinPlan}, 'objetivo', 'Punto que sale del plan') returning id`;
        await sql`insert into app.plan_item_updates (engagement_id, plan_item_id, session_id, event_id, estado, resumen, evidencia, approved_by) values (${ENG.sinPlan}, ${i1.id}, ${s.id}, ${e.id}, 'cumplido', 'Hecho.', '[]'::jsonb, ${COACH})`;
        await sql`insert into app.plans (engagement_id, titulo, status, version, profile_snapshot_id, created_by, approved_by, approved_at) values (${ENG.sinPlan}, 'Plan 2', 'aprobado', 2, ${snap.id}, ${COACH}, ${COACH}, now())`;
        const datos = await withRls(usuario.claims, (tx) => leerSeguimiento(tx, ENG.sinPlan, null));
        revisar(datos.avance.length === 0, "el plan vigente no debería tener ese punto");
        revisar(datos.avanceFuera.length === 1 && datos.avanceFuera[0].descripcion === "Punto que sale del plan", "no aparece en el historial");
        revisar(datos.avanceFuera[0].historial[0]?.estado === "cumplido", "sin su estado");
      },
    },
    {
      id: "CA-004.45",
      descripcion: "una salida que no pasa el contrato responde 502, deja la nota y audita con ok = false",
      correr: async () => {
        const fallas = await contar("audit_log", ENG.ws, "and not ok");
        const invalido = { ...updateVacio(), senales: [{ tipo: "otra_cosa", descripcion: "x", evidencia: ev(CITA_RUIDO) }] } as unknown as FollowupUpdate;
        const r = await crearSesion(usuario, ENG.ws, { nota: NOTA }, modeloCon(invalido));
        esperar(r, 502, "salida inválida");
        const [s] = await sql`select count(*)::int as n from app.sessions where id = ${cuerpo(r).sessionId!}`;
        revisar(s.n === 1, "la nota no quedó guardada");
        revisar((await contar("audit_log", ENG.ws, "and not ok")) === fallas + 1, "no quedó la fila con ok = false");
      },
    },
    {
      id: "CA-004.47",
      descripcion: "con el consentimiento retirado el reintento responde 409 sin eventId, sin llamar al modelo ni auditar",
      correr: async () => {
        const sin = await crearSesion(usuario, ENG.ws, { nota: NOTA }, modeloQueFalla);
        const id = cuerpo(sin).sessionId!;
        const auditoria = await contar("audit_log", ENG.ws);
        await retirar(ENG.ws, PERSONAS.ws);
        try {
          const r = await reintentarPropuesta(usuario, ENG.ws, id, {
            ...modeloQueFalla,
            proponerSeguimiento: async () => {
              throw new Falla("llamó al modelo");
            },
          });
          esperar(r, 409, "reintento sin consentimiento");
          revisar(cuerpo(r).eventId === undefined, "el 409 trae eventId");
          revisar((await contar("audit_log", ENG.ws)) === auditoria, "se escribió en audit_log");
        } finally {
          await otorgar(ENG.ws, PERSONAS.ws);
        }
      },
    },
    {
      id: "CA-004.54",
      descripcion: "aprobar una señal de un tipo cerrado reemplaza la entrada y agrega la fila activa",
      correr: async () => {
        const uno = await sesionConPropuesta(ENG.incl, updateCompleto());
        esperar(await decidirPropuesta(usuario, uno.eventId, APROBAR({ senales: [0] })), 200, "aprobar la señal");
        esperar(await cerrarSenal(usuario, ENG.incl, "cambio_de_vida", { motivo: "Ya se mudó." }), 200, "cerrar la señal");

        const nueva = updateCompleto();
        nueva.senales[0] = { tipo: "cambio_de_vida", descripcion: "Otra mudanza.", evidencia: ev(CITA_VACACIONES) };
        const dos = await sesionConPropuesta(ENG.incl, nueva);
        const r = await decidirPropuesta(usuario, dos.eventId, APROBAR({ senales: [0] }));
        esperar(r, 200, "aprobar la señal otra vez");
        const [snap] = await sql`select perfil from app.profile_snapshots where id = ${cuerpo(r).snapshotId!}`;
        const entradas = (snap.perfil as Perfil).senalesActivas.filter((s) => s.tipo === "cambio_de_vida");
        revisar(entradas.length === 1, `${entradas.length} entradas de ese tipo`);
        revisar(entradas[0].evidencia.length === 1 && entradas[0].evidencia[0].cita === CITA_VACACIONES, "no trae solo la evidencia nueva");
        const estados = await sql`select estado::text as estado from app.signal_states where engagement_id = ${ENG.incl} and tipo = 'cambio_de_vida' order by created_at`;
        revisar(estados.map((e) => e.estado).join() === "cerrada,activa", `estados ${estados.map((e) => e.estado).join()}`);
      },
    },
    {
      id: "CA-004.55",
      descripcion: "aprobar solo avance y una pregunta no crea snapshot; sin selección responde 400",
      correr: async () => {
        const { eventId } = await sesionConPropuesta(ENG.incl, updateCompleto());
        const vacio = await decidirPropuesta(usuario, eventId, APROBAR({}));
        esperar(vacio, 400, "sin selección");
        revisar(cuerpo(vacio).error === "Selecciona al menos un punto para aprobar.", "mensaje distinto al de la spec");

        const snapshots = await contar("profile_snapshots", ENG.incl);
        const vistas = await contar("persona_profiles", ENG.incl);
        const r = await decidirPropuesta(usuario, eventId, APROBAR({ avance: [0], preguntas: [0] }));
        esperar(r, 200, "aprobar");
        revisar(cuerpo(r).snapshotId === null && cuerpo(r).version === null, "la respuesta trae snapshot");
        revisar((await contar("profile_snapshots", ENG.incl)) === snapshots, "se creó un snapshot");
        revisar((await contar("persona_profiles", ENG.incl)) === vistas, "cambió persona_profiles");
        const [p] = await sql`select count(*)::int as n from app.followup_context where event_id = ${eventId} and tipo = 'pregunta'`;
        revisar(p.n === 1, "no se guardó la pregunta");
      },
    },
    {
      id: "CA-004.56",
      descripcion: "en etapa perfil se usa el prompt de 001 y se ignora el tipo; en seguimiento el payload es propuesta_seguimiento",
      correr: async () => {
        const r = await crearSesion(usuario, ENG.perfil, { nota: NOTA, tipo: "red_de_apoyo" }, modeloPerfil);
        esperar(r, 200, "etapa perfil");
        const [s] = await sql`select tipo::text as tipo from app.sessions where id = ${cuerpo(r).sessionId!}`;
        revisar(s.tipo === "persona", `tipo ${s.tipo}`);
        const [e] = await sql`select tipo::text as tipo, payload, prompt_version from app.profile_events where id = ${cuerpo(r).eventId!}`;
        revisar(e.tipo === "propuesta_ia", `columna tipo ${e.tipo}`);
        PayloadPropuestaIA.parse(e.payload);
        revisar(e.prompt_version === PROMPT_VERSION, `prompt ${e.prompt_version}`);

        const { eventId } = await sesionConPropuesta(ENG.ws, updateVacio());
        const [e2] = await sql`select tipo::text as tipo, payload from app.profile_events where id = ${eventId}`;
        revisar(e2.tipo === "propuesta_ia" && e2.payload.tipo === "propuesta_seguimiento", "el payload no es de seguimiento");
      },
    },
    {
      id: "R-004.56",
      descripcion: "una propuesta de 001 también guarda sus preguntas aprobadas en followup_context",
      correr: async () => {
        const m: DepsModelo = {
          ...modeloPerfil,
          proponerPerfil: async () => ({
            update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: ["¿Cómo va la mudanza?"] },
            usage: { entrada: 1, salida: 1, cacheLectura: 0 },
            latenciaMs: 1,
            modelo: "modelo-simulado",
            promptVersion: PROMPT_VERSION,
          }),
        };
        const r = await crearSesion(usuario, ENG.perfil, { nota: NOTA }, m);
        esperar(r, 200, "crear");
        esperar(await decidirPropuesta(usuario, cuerpo(r).eventId!, APROBAR({ preguntas: [0] })), 200, "aprobar la pregunta");
        const [p] = await sql`select count(*)::int as n from app.followup_context where event_id = ${cuerpo(r).eventId!}`;
        revisar(p.n === 1, "no se guardó la pregunta");
      },
    },
    {
      id: "R-004.13",
      descripcion: "cerrar una señal: sale de las activas, sin snapshot; cerrarla otra vez responde 409; otro coach recibe 404",
      correr: async () => {
        const snapshots = await contar("profile_snapshots", ENG.incl);
        esperar(await cerrarSenal(ajeno, ENG.incl, "estres_desregulacion", {}), 404, "coach ajeno");
        esperar(await cerrarSenal(usuario, ENG.incl, "no_existe", {}), 404, "tipo fuera de la lista");
        esperar(await cerrarSenal(usuario, ENG.incl, "estres_desregulacion", { motivo: "Motivo sintético" }), 200, "cerrar");
        esperar(await cerrarSenal(usuario, ENG.incl, "estres_desregulacion", {}), 409, "cerrar otra vez");
        revisar((await contar("profile_snapshots", ENG.incl)) === snapshots, "se creó un snapshot");
        const datos = await withRls(usuario.claims, async (tx) => {
          const [s] = await tx.execute<{ perfil: Perfil }>(
            sql_perfil(ENG.incl),
          );
          return leerSeguimiento(tx, ENG.incl, s.perfil);
        });
        revisar(!datos.senales.some((s) => s.tipo === "estres_desregulacion"), "la señal sigue en las activas");
        revisar(datos.estadosSenal.some((e) => e.tipo === "estres_desregulacion" && e.estado === "cerrada" && e.por), "no queda en el historial con su nombre");
      },
    },
    {
      id: "R-004.42",
      descripcion: "una alerta avanza de abierta a escalada a atendida; no se salta pasos; no hay dos vigentes del mismo tipo",
      correr: async () => {
        const r = await crearAlerta(usuario, ENG.ws, { tipoSenal: "estres_desregulacion", nota: "Nota sintética" });
        esperar(r, 200, "crear");
        const id = cuerpo(r).id!;
        esperar(await crearAlerta(usuario, ENG.ws, { tipoSenal: "estres_desregulacion" }), 409, "otra vigente");
        esperar(await crearAlerta(usuario, ENG.ws, { tipoSenal: "desajuste_con_rol" }), 409, "sobre una señal que no está activa");
        esperar(await crearAlerta(ajeno, ENG.ws, { tipoSenal: "estres_desregulacion" }), 404, "coach ajeno");
        esperar(await cambiarAlerta(usuario, id, { estado: "atendida" }), 409, "saltarse un paso");
        esperar(await cambiarAlerta(ajeno, id, { estado: "escalada" }), 404, "coach ajeno cambia el estado");
        esperar(await cambiarAlerta(usuario, id, { estado: "escalada", notaEscalada: "La pasé por el canal." }), 200, "Ya la pasé");
        esperar(await cambiarAlerta(usuario, id, { estado: "atendida" }), 200, "Atendida");
        esperar(await cambiarAlerta(usuario, id, { estado: "atendida" }), 409, "otra vez");
        const [a] = await sql`select estado::text as estado, nota_escalada, escalada_en, atendida_en from app.strong_alerts where id = ${id}`;
        revisar(a.estado === "atendida" && a.nota_escalada && a.escalada_en && a.atendida_en, "no quedaron estado, nota y fechas");
      },
    },
    {
      id: "R-004.23",
      descripcion: "quitar contexto lo saca del panel y queda en el historial; quitarlo otra vez responde 404",
      correr: async () => {
        const { eventId } = await sesionConPropuesta(ENG.ws, updateCompleto());
        esperar(await decidirPropuesta(usuario, eventId, APROBAR({ contexto: [0], siguientePaso: true })), 200, "aprobar");
        const filas = await sql`select id, tipo::text as tipo, plan_item_id from app.followup_context where event_id = ${eventId} order by tipo`;
        revisar(filas.length === 2, `${filas.length} filas`);
        const paso = filas.find((f) => f.tipo === "siguiente_paso");
        revisar(paso?.plan_item_id, "el siguiente paso no apunta a un ítem del plan");
        esperar(await quitarContexto(ajeno, paso.id), 404, "coach ajeno");
        esperar(await quitarContexto(usuario, paso.id), 200, "quitar");
        esperar(await quitarContexto(usuario, paso.id), 404, "quitar otra vez");
        const datos = await withRls(usuario.claims, (tx) => leerSeguimiento(tx, ENG.ws, null));
        revisar(!datos.guardado.some((c) => c.id === paso.id), "sigue en el panel");
        revisar(datos.quitado.some((c) => c.id === paso.id && c.quitadaPor && c.saleDe), "no queda en el historial con quién y de dónde sale");
      },
    },
  ];
}

// Lee el último perfil dentro de withRls con la misma consulta que usan las páginas.
function sql_perfil(engagementId: string) {
  return drizzleSql`select perfil from app.profile_snapshots where engagement_id = ${engagementId} order by version desc limit 1`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  let fallas = 0;
  let total = 0;
  try {
    const demo = await preparar();
    // El log del servidor de estas funciones sí se imprime: es parte de lo que se revisa (sin texto de la nota).
    const errorOriginal = console.error;
    const lineas: string[] = [];
    console.error = (...args: unknown[]) => void lineas.push(args.join(" "));
    try {
      for (const caso of casos(demo)) {
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
    const conNota = lineas.filter((l) => l.includes("reporte semanal") || l.includes("mudanza"));
    if (conNota.length > 0) {
      fallas++;
      console.log(`FALLA R-004.47 el log del servidor trae texto de la nota: ${conNota.length} líneas`);
    } else {
      console.log(`OK    R-004.47 ${lineas.length} líneas de log del servidor, ninguna con texto de la nota`);
    }
  } finally {
    await limpiar();
    await sql.end();
  }
  console.log(`\n${total - fallas} de ${total} casos pasaron. ${fallas ? `${fallas} fallaron.` : "Ninguno falló."} Se borró lo creado.`);
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error("followup-check no pudo correr:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
