// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Pruebas de RLS y permisos contra la base (spec 002, R-002.46; hueco H-8 de 001).
// Uso: npm run rls-check  (necesita DATABASE_URL en .env.local, las migraciones y el seed).
//
// Cada caso corre en su propia transacción y termina SIEMPRE con rollback: no deja nada en la base.
// Dentro del caso se entra como un usuario del seed igual que withRls (lib/db/rls.ts):
// set_config('request.jwt.claims', ...) con su "sub" y "set local role authenticated".
// Los estados que hacen falta (datos de sesiones, verificación, eventos, invitaciones) se preparan
// como owner (el rol de DATABASE_URL, que ignora RLS) dentro de la misma transacción, antes de
// bajar de rol; "reset role" vuelve a owner cuando hace falta.
// Cada intento que puede fallar va en un savepoint que siempre se deshace, para que un error
// esperado no aborte la transacción y un intento aceptado no cambie lo que ven los siguientes.
//
// Imprime "OK|FALLA <ID> <descripción>" por caso, un resumen, y sale con 1 si alguno falla.
//
// Para 003 a 006: agreguen sus casos al final de CASOS (mismo formato) y sus tablas con datos
// derivados de las notas a TABLAS_BLOQUEO (R-002.44). No hagan un script propio.
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config } from "dotenv";
import postgres, { type PostgresError, type Row, type TransactionSql } from "postgres";
import { InsumosGuia } from "@/lib/guia/schema";
import { columnaDe } from "./tablas-purga";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

type Tx = TransactionSql;

type Caso = {
  id: string;
  descripcion: string;
  correr: (sql: Tx) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Ids del seed (scripts/seed.sql) y de usuarios que solo existen dentro de una transacción
// ---------------------------------------------------------------------------

const ORG = "11111111-1111-4111-8111-111111111111";
const COACH = "22222222-2222-4222-8222-222222222222";
const PERSONA = "33333333-3333-4333-8333-333333333333";
const ENG_DEMO = "44444444-4444-4444-8444-444444444444"; // evaluacion_inicial, verificado, con consentimiento
const PERSONA_ALTA = "35353535-3535-4535-8535-353535353535";
const ENG_ALTA = "46464646-4646-4646-8646-464646464646"; // alta, sin verificación ni consentimiento

// Se crean como owner dentro de un caso y desaparecen con el rollback.
const COACH_SIN = "77777777-7777-4777-8777-777777777777"; // coach de la misma organización, sin acompañamientos
const PERSONA_NUEVA = "78787878-7878-4878-8878-787878787878"; // persona sin acompañamiento

const AVISO = "2026-10-29";

// Tablas con datos derivados de las notas que dejan de verse sin consentimiento vigente
// (decisión b, R-002.30, R-002.44). 003 agrega plans, plan_items y persona_plans (R-003.53);
// 004 a 006 agregan las suyas. Todas deben tener columna engagement_id, salvo las de COLUMNA_ACOMPANAMIENTO.
const TABLAS_BLOQUEO = [
  "sessions",
  "profile_events",
  "profile_snapshots",
  "persona_profiles",
  "recommendations",
  "plans",
  "plan_items",
  "persona_plans",
  // Spec 004 (R-004.48).
  "plan_item_updates",
  "followup_context",
  "signal_states",
  "strong_alerts",
  // Spec 008 (R-008.42).
  "fe_corrections",
  "fe_domain_summaries",
  // Spec 009 (R-009.51, R-009.57).
  "shared_guides",
  // Spec 010 (R-010.45, R-010.52). task_templates va por decisión abierta 5, opción B, y se liga por origen_engagement_id.
  "task_breakdowns",
  "task_step_events",
  "task_templates",
];

// Tablas de la trayectoria de función ejecutiva (spec 008).
const TABLAS_TRAYECTORIA = ["fe_corrections", "fe_domain_summaries"];

// Tablas de seguimiento (spec 004).
const TABLAS_SEGUIMIENTO = ["plan_item_updates", "followup_context", "signal_states", "strong_alerts"];

// Tablas del plan (spec 003). knowledge_cards no tiene engagement_id: se cuenta aparte.
const TABLAS_PLAN = ["plans", "plan_items", "persona_plans"];
const PROMPT_PLAN = "2026-10-29_plan-acompanamiento";
const PROMPT_RESUMEN = "2026-10-31_resumen-dominio";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

class Rollback extends Error {}
class Falla extends Error {}
class Deshacer extends Error {
  constructor(readonly count: number, readonly rows: Row[]) {
    super("deshacer savepoint");
  }
}

function esPostgresError(e: unknown): e is PostgresError {
  return e instanceof Error && e.name === "PostgresError";
}

function revisar(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new Falla(mensaje);
}

// Entra como un usuario del seed, igual que withRls.
async function como(tx: Tx, userId: string) {
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
  await tx`set local role authenticated`;
}

// Vuelve al rol de DATABASE_URL (owner, ignora RLS) y sin claims.
async function comoOwner(tx: Tx) {
  await tx`reset role`;
  await tx`select set_config('request.jwt.claims', '', true)`;
}

type Intento = { ok: true; count: number; rows: Row[] } | { ok: false; error: PostgresError };

// Corre una consulta en un savepoint que siempre se deshace y dice qué pasó.
async function intentar(tx: Tx, consulta: (sp: Tx) => Promise<postgres.RowList<Row[]>>): Promise<Intento> {
  try {
    await tx.savepoint(async (sp) => {
      const r = await consulta(sp);
      throw new Deshacer(r.count ?? 0, [...r]);
    });
  } catch (e) {
    if (e instanceof Deshacer) return { ok: true, count: e.count, rows: e.rows };
    if (esPostgresError(e)) return { ok: false, error: e };
    throw e;
  }
  throw new Error("savepoint sin resultado");
}

type Rechazo = "permiso" | "rls" | "unique" | "check" | "cualquiera";

const PATRONES: Record<Exclude<Rechazo, "cualquiera">, { codigo: string; mensaje?: RegExp }> = {
  permiso: { codigo: "42501", mensaje: /permission denied/i },
  rls: { codigo: "42501", mensaje: /row-level security/i },
  unique: { codigo: "23505" },
  check: { codigo: "23514" },
};

function describir(i: Intento) {
  return i.ok ? `aceptado (${i.count} filas)` : `${i.error.code} ${i.error.message}`;
}

async function rechaza(tx: Tx, que: string, tipo: Rechazo, consulta: (sp: Tx) => Promise<postgres.RowList<Row[]>>) {
  const i = await intentar(tx, consulta);
  revisar(!i.ok, `${que}: la base lo aceptó (${describir(i)})`);
  if (tipo === "cualquiera") return i.error;
  const p = PATRONES[tipo];
  revisar(
    i.error.code === p.codigo && (!p.mensaje || p.mensaje.test(i.error.message)),
    `${que}: se esperaba rechazo "${tipo}" y llegó ${describir(i)}`,
  );
  return i.error;
}

async function ceroFilas(tx: Tx, que: string, consulta: (sp: Tx) => Promise<postgres.RowList<Row[]>>) {
  const i = await intentar(tx, consulta);
  revisar(i.ok && i.count === 0, `${que}: se esperaban 0 filas y llegó ${describir(i)}`);
}

// "La base lo rechaza" para UPDATE o DELETE: error de permisos/RLS o 0 filas afectadas.
async function rechazaOCero(tx: Tx, que: string, consulta: (sp: Tx) => Promise<postgres.RowList<Row[]>>) {
  const i = await intentar(tx, consulta);
  revisar(!i.ok || i.count === 0, `${que}: se esperaba rechazo o 0 filas y llegó ${describir(i)}`);
  if (!i.ok) revisar(i.error.code === "42501", `${que}: falló por otra razón (${describir(i)})`);
}

async function acepta(tx: Tx, que: string, consulta: (sp: Tx) => Promise<postgres.RowList<Row[]>>, filas = 1) {
  const i = await intentar(tx, consulta);
  revisar(i.ok && i.count === filas, `${que}: se esperaba que la base lo aceptara (${filas} filas) y llegó ${describir(i)}`);
}

async function contar(tx: Tx, tabla: string, engagementId: string, extra = ""): Promise<number> {
  // tabla siempre viene de una constante de este archivo, nunca de una entrada.
  const [r] = await tx.unsafe(`select count(*)::int as n from app.${tabla} where ${columnaDe(tabla)} = $1 ${extra}`, [engagementId]);
  return r.n as number;
}

async function ultimoEvento(tx: Tx, engagementId: string): Promise<string | null> {
  const [r] = await tx`select tipo::text as tipo from app.consent_events where engagement_id = ${engagementId} order by id desc limit 1`;
  return (r?.tipo as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Preparación de estados (siempre como owner)
// ---------------------------------------------------------------------------

async function crearUsuario(tx: Tx, id: string, email: string, rol: "coach" | "persona", nombre: string) {
  await tx`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated', ${email}, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '')`;
  await tx`insert into app.users (id, org_id, role, nombre_pila) values (${id}, ${ORG}, ${rol}, ${nombre})`;
}

async function crearCoachSin(tx: Tx) {
  await crearUsuario(tx, COACH_SIN, "coach-sin@caja-mex.test", "coach", "Coach Sin Casos");
}

async function crearPersonaNueva(tx: Tx) {
  await crearUsuario(tx, PERSONA_NUEVA, "persona-nueva@caja-mex.test", "persona", "Río");
}

async function evento(tx: Tx, engagementId: string, userId: string, tipo: "otorgado" | "retirado") {
  await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${engagementId}, ${userId}, ${tipo}, ${AVISO})`;
}

// Garantiza consentimiento vigente en el acompañamiento de demo aunque alguien lo haya retirado a mano.
async function asegurarConsentimientoDemo(tx: Tx) {
  if ((await ultimoEvento(tx, ENG_DEMO)) !== "otorgado") await evento(tx, ENG_DEMO, PERSONA, "otorgado");
}

type DatosDemo = {
  sessionId: string;
  eventoId: string;
  snapshotId: string;
  snapshotSinVistaId: string;
  planId: string;
  planItemId: string;
  contextoId: string;
  alertaId: string;
  lineaId: string;
  resumenId: string;
  guiaListaId: string;
  guiaListaVersion: number;
  guiaBorradorId: string;
  desgloseId: string;
  pasoId: string;
  pasoLibreId: string;
  marcaId: number;
  plantillaId: string;
};

// Una fila sintética en cada tabla del acompañamiento de demo, para que las lecturas en 0 signifiquen algo.
async function prepararDatosDemo(tx: Tx): Promise<DatosDemo> {
  await asegurarConsentimientoDemo(tx);
  const [s] = await tx`
    insert into app.sessions (engagement_id, coach_id, nota_original)
    values (${ENG_DEMO}, ${COACH}, 'Nota sintética de rls-check. No corresponde a una persona real.') returning id`;
  const payload = { tipo: "propuesta_ia", update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] }, descartados: [], banderas: [] };
  const [ev] = await tx`
    insert into app.profile_events (engagement_id, session_id, tipo, status, payload, created_by)
    values (${ENG_DEMO}, ${s.id}, 'propuesta_ia', 'approved', ${JSON.stringify(payload)}::jsonb, ${COACH}) returning id`;
  const [{ v }] = await tx`select coalesce(max(version), 0)::int + 1 as v from app.profile_snapshots where engagement_id = ${ENG_DEMO}`;
  const perfil = { dimensiones: {}, senalesActivas: [] };
  const [snap] = await tx`
    insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
    values (${ENG_DEMO}, ${v}, ${JSON.stringify(perfil)}::jsonb, ${ev.id}, ${COACH}) returning id`;
  const [snap2] = await tx`
    insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
    values (${ENG_DEMO}, ${(v as number) + 1}, ${JSON.stringify(perfil)}::jsonb, ${ev.id}, ${COACH}) returning id`;
  await tx`
    insert into app.persona_profiles (snapshot_id, engagement_id, version, contenido)
    values (${snap.id}, ${ENG_DEMO}, ${v}, '{}'::jsonb)`;
  // Plan aprobado con su copia para la persona (spec 003).
  const plan = await crearPlan(tx, ENG_DEMO, snap.id as string, "aprobado", { conPersona: true });
  await tx`
    insert into app.recommendations (engagement_id, catalog_unit_id, plan_item_id, razon, status)
    values (${ENG_DEMO}, 'CU-001', ${plan.itemId}, 'Razón sintética de rls-check', 'aprobada')`;
  // Spec 004: una fila en cada tabla de seguimiento.
  const evidencia = JSON.stringify([{ cita: "Cita sintética de rls-check", sessionId: s.id }]);
  await tx`
    insert into app.plan_item_updates (engagement_id, plan_item_id, session_id, event_id, estado, resumen, evidencia, approved_by)
    values (${ENG_DEMO}, ${plan.itemId}, ${s.id}, ${ev.id}, 'avanza', 'Avance sintético', ${evidencia}::jsonb, ${COACH})`;
  const [ctx] = await tx`
    insert into app.followup_context (engagement_id, tipo, texto, evidencia, session_id, event_id, approved_by)
    values (${ENG_DEMO}, 'contexto', 'Contexto sintético', ${evidencia}::jsonb, ${s.id}, ${ev.id}, ${COACH}) returning id`;
  await tx`
    insert into app.signal_states (engagement_id, tipo, estado, motivo, created_by)
    values (${ENG_DEMO}, 'cambio_de_vida', 'cerrada', 'Motivo sintético', ${COACH})`;
  const [alerta] = await tx`
    insert into app.strong_alerts (engagement_id, tipo_senal, event_id, marcada_por, nota)
    values (${ENG_DEMO}, 'estres_desregulacion', ${ev.id}, ${COACH}, 'Nota sintética') returning id`;
  // Un "no me representa" propio de la persona.
  const nmr = { tipo: "no_me_representa", dimension: null, comentario: "Comentario sintético de rls-check." };
  await tx`
    insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
    values (${ENG_DEMO}, 'no_me_representa', 'proposed', ${JSON.stringify(nmr)}::jsonb, ${PERSONA})`;
  // Spec 008: una corrección y un resumen ya aprobado.
  const lineaId = `${ev.id}:cambios[0].evidencia[0]`;
  await tx`
    insert into app.fe_corrections (engagement_id, event_id, linea_id, dominio, direccion, created_by)
    values (${ENG_DEMO}, ${ev.id}, ${lineaId}, 'iniciacion', 'apoyo', ${COACH})`;
  const [resumen] = await tx`
    insert into app.fe_domain_summaries (engagement_id, dominio, texto, linea_ids, bloque_ids, estado, prompt_version, model, created_by, decided_by, decided_at)
    values (${ENG_DEMO}, 'iniciacion', 'Resumen sintético de rls-check.', ${tx.json([lineaId])}, ${tx.json([lineaId])}, 'aprobado',
      ${PROMPT_RESUMEN}, 'rls-check', ${COACH}, ${COACH}, now()) returning id`;
  // Spec 009: una versión lista y un borrador abierto.
  const guiaLista = await crearGuia(tx, ENG_DEMO, snap.id as string, "lista");
  const guiaBorrador = await crearGuia(tx, ENG_DEMO, snap.id as string, "borrador");
  // Spec 010: una plantilla, un desglose de dos pasos y una marca "Me atoré aquí" en el primero.
  const plantillaId = await crearPlantilla(tx, { origen: ENG_DEMO });
  const desglose = await crearDesglose(tx, ENG_DEMO, snap.id as string, { creadoPor: PERSONA });
  const [marca] = await tx`
    insert into app.task_step_events (engagement_id, breakdown_id, paso_id, estado, texto, creado_por)
    values (${ENG_DEMO}, ${desglose.id}, ${desglose.pasos[0]}, 'atorado', 'Texto sintético de rls-check.', ${PERSONA}) returning id`;
  return {
    sessionId: s.id as string,
    eventoId: ev.id as string,
    snapshotId: snap.id as string,
    snapshotSinVistaId: snap2.id as string,
    planId: plan.planId,
    planItemId: plan.itemId,
    contextoId: ctx.id as string,
    alertaId: alerta.id as string,
    lineaId,
    resumenId: resumen.id as string,
    guiaListaId: guiaLista.id,
    guiaListaVersion: guiaLista.version as number,
    guiaBorradorId: guiaBorrador.id,
    desgloseId: desglose.id,
    pasoId: desglose.pasos[0],
    pasoLibreId: desglose.pasos[1],
    marcaId: Number(marca.id),
    plantillaId,
  };
}

async function crearInvitacion(tx: Tx, engagementId: string, personaId: string, opciones: { vencida?: boolean; usada?: boolean } = {}) {
  const expira = opciones.vencida ? tx`now() - interval '1 day'` : tx`now() + interval '7 days'`;
  const usada = opciones.usada ? tx`now()` : tx`null`;
  const [r] = await tx`
    insert into app.invitations (engagement_id, persona_id, creada_por, expira_en, usada_en)
    values (${engagementId}, ${personaId}, ${COACH}, ${expira}, ${usada}) returning id`;
  return r.id as string;
}

const NMR = (comentario: string) => JSON.stringify({ tipo: "no_me_representa", dimension: null, comentario });

// ----- Spec 003: plan de acompañamiento -----

// Lo mínimo de PayloadPlanIA (lib/plan/schema.ts) para que propuesta_ia no vaya vacío. Sintético.
const PROPUESTA_IA = JSON.stringify({
  propuesta: {
    items: [
      {
        tipo: "objetivo",
        descripcion: "Objetivo sintético de rls-check.",
        textoPersona: "Texto sintético de rls-check.",
        dominioFE: null,
        fichaId: null,
        evidencia: [{ evidenciaId: "E-01" }],
      },
    ],
  },
  descartados: [],
  banderas: [],
  fichasEnviadas: [],
  evidenciaEnviada: ["E-01"],
});

async function siguienteVersionPlan(tx: Tx, engagementId: string): Promise<number> {
  const [r] = await tx`select coalesce(max(version), 0)::int + 1 as v from app.plans where engagement_id = ${engagementId}`;
  return r.v as number;
}

// Snapshot nuevo (con su evento de origen) como owner. Devuelve su id y versión.
async function crearSnapshot(tx: Tx, engagementId: string): Promise<{ id: string; version: number }> {
  const payload = { tipo: "propuesta_ia", update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] }, descartados: [], banderas: [] };
  const [ev] = await tx`
    insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
    values (${engagementId}, 'propuesta_ia', 'approved', ${JSON.stringify(payload)}::jsonb, ${COACH}) returning id`;
  const [{ v }] = await tx`select coalesce(max(version), 0)::int + 1 as v from app.profile_snapshots where engagement_id = ${engagementId}`;
  const [snap] = await tx`
    insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
    values (${engagementId}, ${v}, '{"dimensiones":{},"senalesActivas":[]}'::jsonb, ${ev.id}, ${COACH}) returning id`;
  return { id: snap.id as string, version: v as number };
}

type EstadoPlan = "borrador" | "aprobado" | "descartado";

// Plan con un ítem objetivo, como owner. Un aprobado recibe la versión siguiente y, si se pide,
// su copia en persona_plans; borrador y descartado quedan sin versión (R-003.34).
async function crearPlan(
  tx: Tx,
  engagementId: string,
  snapshotId: string,
  status: EstadoPlan,
  opciones: { conPersona?: boolean } = {},
): Promise<{ planId: string; itemId: string; version: number | null }> {
  const version = status === "aprobado" ? await siguienteVersionPlan(tx, engagementId) : null;
  const aprobadoPor = status === "aprobado" ? COACH : null;
  const aprobadoEn = status === "aprobado" ? tx`now()` : tx`null`;
  const [plan] = await tx`
    insert into app.plans (engagement_id, titulo, status, profile_snapshot_id, version, propuesta_ia, prompt_version, model, created_by, approved_by, approved_at)
    values (${engagementId}, 'Plan de acompañamiento', ${status}, ${snapshotId}, ${version}, ${PROPUESTA_IA}::jsonb,
      ${PROMPT_PLAN}, 'rls-check', ${COACH}, ${aprobadoPor}, ${aprobadoEn}) returning id`;
  const [item] = await tx`
    insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, texto_persona, origen, propuesta_ref)
    values (${plan.id}, ${engagementId}, 'objetivo', 'Objetivo sintético de rls-check.', 'Texto sintético de rls-check.', 'ia', 0) returning id`;
  if (status === "aprobado" && opciones.conPersona) {
    const contenido = { items: [{ planItemId: item.id, tipo: "objetivo", texto: "Texto sintético de rls-check.", orden: 0, itemsAnteriores: [] }] };
    await tx`
      insert into app.persona_plans (plan_id, engagement_id, version, contenido)
      values (${plan.id}, ${engagementId}, ${version}, ${JSON.stringify(contenido)}::jsonb)`;
  }
  return { planId: plan.id as string, itemId: item.id as string, version };
}

// Borrador como lo inserta la ruta de propuesta (R-003.20): status y version por defecto.
function insertarBorrador(sp: Tx, engagementId: string, snapshotId: string) {
  return sp`
    insert into app.plans (engagement_id, titulo, profile_snapshot_id, propuesta_ia, prompt_version, model, created_by)
    values (${engagementId}, 'Plan de acompañamiento', ${snapshotId}, ${PROPUESTA_IA}::jsonb, ${PROMPT_PLAN}, 'rls-check', ${COACH})
    returning id`;
}

// Etapa leída como owner; deja la sesión como owner.
async function etapa(tx: Tx, engagementId: string): Promise<string> {
  await comoOwner(tx);
  const [r] = await tx`select stage::text as stage from app.engagements where id = ${engagementId}`;
  return r.stage as string;
}

async function contarKnowledgeCards(tx: Tx): Promise<number> {
  const [r] = await tx`select count(*)::int as n from app.knowledge_cards`;
  return r.n as number;
}

// ----- Spec 009: "Cómo trabajar conmigo" -----

type EstadoLineaGuia = "pendiente" | "incluida" | "editada" | "quitada" | "propia";

// Una línea como la guarda la app (LineaGuia de lib/guia/schema.ts). Sintética.
function lineaGuia(estado: EstadoLineaGuia, extra: Record<string, unknown> = {}) {
  const propia = estado === "propia";
  return {
    id: randomUUID(),
    seccion: "comunicacion",
    texto: "Instrucciones por escrito después de la reunión.",
    estado,
    textoIa: propia ? null : "Instrucciones por escrito después de la reunión.",
    origenes: propia ? [] : [{ tipo: "dimension", dimension: "retroalimentacion" }],
    orden: 0,
    lineaAnteriorId: null,
    cambio: null,
    ...extra,
  };
}

const DOCUMENTO_GUIA = { nombre: "Nombre sintético", secciones: [{ id: "comunicacion", lineas: ["Instrucciones por escrito después de la reunión."] }] };

// jsonb de verdad. Con JSON.stringify(x)::jsonb el driver guarda un texto, y jsonb_path no ve sus llaves.
const json = (sql: Tx, valor: unknown) => sql.json(valor as postgres.JSONValue);

type EstadoGuia = "borrador" | "lista" | "retirada" | "descartada";

async function siguienteVersionGuia(tx: Tx, engagementId: string): Promise<number> {
  const [r] = await tx`select coalesce(max(version), 0)::int + 1 as v from app.shared_guides where engagement_id = ${engagementId}`;
  return r.v as number;
}

// Una guía en cualquier estado, como owner. Sin trigger: es un INSERT. Lista y retirada llevan versión.
async function crearGuia(
  tx: Tx,
  engagementId: string,
  snapshotId: string,
  estado: EstadoGuia,
  opciones: { lineas?: unknown[]; base?: string | null; generadaPor?: string } = {},
): Promise<{ id: string; version: number | null }> {
  const conVersion = estado === "lista" || estado === "retirada";
  const version = conVersion ? await siguienteVersionGuia(tx, engagementId) : null;
  const lineas = json(tx, opciones.lineas ?? [lineaGuia("incluida")]);
  const [g] = await tx`
    insert into app.shared_guides (engagement_id, version, estado, nombre_a_mostrar, lineas, documento, generada_desde_snapshot_id,
      perfil_version, plan_version, guia_base_id, generada_por, aprobada_por_persona_en, retirada_en, descartada_en)
    values (${engagementId}, ${version}, ${estado}, 'Nombre sintético', ${lineas}, ${conVersion ? json(tx, DOCUMENTO_GUIA) : null}, ${snapshotId},
      1, 1, ${opciones.base ?? null}, ${opciones.generadaPor ?? PERSONA},
      ${conVersion ? tx`now()` : tx`null`}, ${estado === "retirada" ? tx`now()` : tx`null`}, ${estado === "descartada" ? tx`now()` : tx`null`})
    returning id`;
  return { id: g.id as string, version };
}

// Un borrador como lo inserta la ruta (R-009.13): el id lo genera el servidor y no usa returning.
function pedirBorrador(sp: Tx, g: { engagementId: string; snapshotId: string; generadaPor: string; base?: string | null; id?: string }) {
  return sp`
    insert into app.shared_guides (id, engagement_id, nombre_a_mostrar, lineas, generada_desde_snapshot_id, perfil_version, plan_version, guia_base_id, generada_por, prompt_version, model)
    values (${g.id ?? randomUUID()}, ${g.engagementId}, 'Nombre sintético', ${json(sp, [lineaGuia("pendiente")])}, ${g.snapshotId}, 1, 1, ${g.base ?? null}, ${g.generadaPor}, 'rls-check', 'rls-check')`;
}

// Lo que hace "Listo" (R-009.29): la base pone aprobada_por_persona_en.
function marcarLista(sp: Tx, id: string, version: number) {
  return sp`update app.shared_guides set estado = 'lista', version = ${version}, documento = ${json(sp, DOCUMENTO_GUIA)} where id = ${id}`;
}

async function insumosDeGuia(tx: Tx, engagementId: string, planVersionBase: number | null = null) {
  const [r] = await tx`select private.app_guia_insumos(${engagementId}::uuid, ${planVersionBase}::integer) as insumos`;
  return r.insumos as Record<string, unknown> | null;
}

// ----- Spec 010: desglose de tareas -----

const ACCION_DESGLOSE = "Abre un documento en blanco.";
const CRITERIO_DESGLOSE = "El documento nuevo está abierto en tu pantalla.";

// Un paso como lo guarda la app (PasoDesglose de lib/desglose/schema.ts). Sintético, sin nota.
function pasoDesglose(id: string = randomUUID()) {
  return { id, accion: ACCION_DESGLOSE, criterioTerminado: CRITERIO_DESGLOSE, notaApoyo: null, porQue: null, origen: null, minutos: null };
}

type FilaDesglose = {
  id?: string;
  engagementId: string;
  snapshotId: string;
  creadoPor: string;
  pasos?: unknown[];
  plantillaId?: string | null;
  origenId?: string | null;
  ajustes?: unknown[] | null;
  decididosEn?: boolean;
  archivadoPor?: string | null;
};

// Un desglose como lo inserta la ruta. Sin returning, igual que el borrador de una guía: el id lo genera el servidor.
function insertarDesglose(sp: Tx, d: FilaDesglose) {
  return sp`
    insert into app.task_breakdowns (id, engagement_id, tarea_original, pasos, generado_desde, prompt_version, model, plantilla_id, origen_breakdown_id,
      ajustes, ajustes_decididos_en, creado_por, archivado_por)
    values (${d.id ?? randomUUID()}, ${d.engagementId}, 'Tarea sintética de rls-check.', ${json(sp, d.pasos ?? [pasoDesglose()])}, ${d.snapshotId}, 'rls-check', 'rls-check',
      ${d.plantillaId ?? null}, ${d.origenId ?? null}, ${d.ajustes === undefined || d.ajustes === null ? null : json(sp, d.ajustes)}, ${d.decididosEn ? sp`now()` : sp`null`}, ${d.creadoPor}, ${d.archivadoPor ?? null})`;
}

// Como owner. Devuelve su id y el de sus dos pasos.
async function crearDesglose(
  tx: Tx,
  engagementId: string,
  snapshotId: string,
  opciones: { creadoPor?: string; plantillaId?: string; ajustes?: unknown[] } = {},
): Promise<{ id: string; pasos: [string, string] }> {
  const id = randomUUID();
  const pasos: [string, string] = [randomUUID(), randomUUID()];
  await insertarDesglose(tx, { id, engagementId, snapshotId, creadoPor: opciones.creadoPor ?? PERSONA, pasos: pasos.map(pasoDesglose), plantillaId: opciones.plantillaId, ajustes: opciones.ajustes });
  return { id, pasos };
}

function marcarPaso(sp: Tx, m: { engagementId?: string; desgloseId: string; pasoId: string; estado?: "hecho" | "atorado" | "pendiente"; texto?: string | null; creadoPor?: string; revisadoPor?: string }) {
  return sp`
    insert into app.task_step_events (engagement_id, breakdown_id, paso_id, estado, texto, creado_por, revisado_por)
    values (${m.engagementId ?? ENG_DEMO}, ${m.desgloseId}, ${m.pasoId}, ${m.estado ?? "hecho"}, ${m.texto ?? null}, ${m.creadoPor ?? PERSONA}, ${m.revisadoPor ?? null})`;
}

function insertarPlantilla(sp: Tx, t: { id?: string; orgId?: string; origen: string; creadaPor: string; archivadaPor?: string | null }) {
  return sp`
    insert into app.task_templates (id, org_id, origen_engagement_id, puesto, titulo, tarea, pasos, creada_por, archivada_por)
    values (${t.id ?? randomUUID()}, ${t.orgId ?? ORG}, ${t.origen}, 'Pruebas de software', 'Título sintético', 'Tarea sintética de rls-check.',
      ${json(sp, [{ id: randomUUID(), accion: ACCION_DESGLOSE, criterioTerminado: CRITERIO_DESGLOSE }])}, ${t.creadaPor}, ${t.archivadaPor ?? null})`;
}

// Como owner.
async function crearPlantilla(tx: Tx, t: { orgId?: string; origen: string; creadaPor?: string }): Promise<string> {
  const id = randomUUID();
  await insertarPlantilla(tx, { id, orgId: t.orgId, origen: t.origen, creadaPor: t.creadaPor ?? COACH });
  return id;
}

// Una organización y un coach que solo existen dentro de la transacción (R-010.41). Como owner. También un
// acompañamiento de esa organización, porque una plantilla siempre sale de uno.
const ORG_OTRA = "79797979-1111-4111-8111-111111111111";
const COACH_OTRA = "79797979-2222-4222-8222-222222222222";
const PERSONA_OTRA = "79797979-3333-4333-8333-333333333333";
const ENG_OTRA = "79797979-4444-4444-8444-444444444444";

async function crearOtraOrganizacion(tx: Tx) {
  await tx`insert into app.organizations (id, nombre) values (${ORG_OTRA}, 'Organización sintética de rls-check')`;
  for (const [id, email, rol, nombre] of [
    [COACH_OTRA, "coach-otra-org@caja-mex.test", "coach", "Otra Coach"],
    [PERSONA_OTRA, "persona-otra-org@caja-mex.test", "persona", "Otra Persona"],
  ] as const) {
    await crearUsuario(tx, id, email, rol, nombre);
    await tx`update app.users set org_id = ${ORG_OTRA} where id = ${id}`;
  }
  await tx`
    insert into app.engagements (id, org_id, type, stage, coach_id, persona_id, diagnostico_verificado, cedula_profesional, diagnostico_verificado_por, diagnostico_verificado_en)
    values (${ENG_OTRA}, ${ORG_OTRA}, 'workplace_support', 'evaluacion_inicial', ${COACH_OTRA}, ${PERSONA_OTRA}, true, '1234567', ${COACH_OTRA}, now())`;
  await evento(tx, ENG_OTRA, PERSONA_OTRA, "otorgado");
}

// Un perfil con citas, señales y dominios, para ver qué sale de private.app_perfil_para_desglose (R-010.4). Sintético.
const CITA_PERFIL = "Cita sintética que nunca debe salir de esta función";
const DESCRIPCION_SENAL = "Señal sintética que nunca debe salir de esta función";

function perfilConDimensiones(eventoId: string, sessionId: string) {
  const dimension = (resumen: string, tipo: string, dominiosFE: string[]) => ({
    resumen,
    tipo,
    dominiosFE,
    evidencia: [{ cita: CITA_PERFIL, sessionId }],
    actualizadoEn: "2026-10-01T10:00:00.000Z",
    eventoId,
  });
  return {
    dimensiones: {
      concentracion: dimension("Se concentra mejor con una lista.", "area_de_apoyo", ["iniciacion"]),
      forma_aprender: dimension("Aprende mejor con ejemplos.", "fortaleza", []),
      antecedentes_experiencia: dimension("Trabajó en un archivo.", "contexto", []),
    },
    senalesActivas: [{ tipo: "cambio_de_vida", descripcion: DESCRIPCION_SENAL, evidencia: [{ cita: CITA_PERFIL, sessionId }], detectadaEn: "2026-10-01T10:00:00.000Z", eventoId }],
  };
}

const perfilParaDesglose = (sp: Tx, engagementId: string) => sp`select * from private.app_perfil_para_desglose(${engagementId}::uuid)`;

async function decidirAjustes(tx: Tx, desgloseId: string, pasos: unknown[], aceptados: string[]): Promise<boolean> {
  const [r] = await tx`select private.app_decidir_ajustes(${desgloseId}::uuid, ${json(tx, pasos)}, ${json(tx, aceptados)}) as escribio`;
  return r.escribio as boolean;
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

const CASOS: Caso[] = [
  // ----- 001 (hueco H-8) -----
  {
    id: "CA-001.8",
    descripcion: "la persona lee 0 filas de sessions, profile_snapshots y profile_events propuesta_ia (el coach sí las ve)",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      await como(tx, COACH);
      revisar((await contar(tx, "sessions", ENG_DEMO)) > 0, "el coach no ve sus sesiones (control)");
      revisar((await contar(tx, "profile_snapshots", ENG_DEMO)) > 0, "el coach no ve los snapshots (control)");
      revisar((await contar(tx, "profile_events", ENG_DEMO, "and tipo = 'propuesta_ia'")) > 0, "el coach no ve las propuestas (control)");
      await como(tx, PERSONA);
      revisar((await contar(tx, "sessions", ENG_DEMO)) === 0, "la persona ve sesiones");
      revisar((await contar(tx, "profile_snapshots", ENG_DEMO)) === 0, "la persona ve snapshots");
      revisar((await contar(tx, "profile_events", ENG_DEMO, "and tipo = 'propuesta_ia'")) === 0, "la persona ve propuestas de la IA");
    },
  },
  {
    id: "CA-001.8",
    descripcion: "la persona inserta un no_me_representa propio en proposed, pero no con otro created_by ni en approved",
    correr: async (tx) => {
      await asegurarConsentimientoDemo(tx);
      await como(tx, PERSONA);
      await acepta(tx, "no_me_representa propio en proposed", (sp) => sp`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_DEMO}, 'no_me_representa', 'proposed', ${NMR("Prueba")}::jsonb, ${PERSONA})`);
      await rechaza(tx, "no_me_representa con created_by del coach", "rls", (sp) => sp`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_DEMO}, 'no_me_representa', 'proposed', ${NMR("Prueba")}::jsonb, ${COACH})`);
      await rechaza(tx, "no_me_representa en approved", "rls", (sp) => sp`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_DEMO}, 'no_me_representa', 'approved', ${NMR("Prueba")}::jsonb, ${PERSONA})`);
    },
  },
  {
    id: "CA-001.8",
    descripcion: "un UPDATE de la persona sobre profile_events afecta 0 filas; uno de payload responde permission denied",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      await como(tx, PERSONA);
      revisar((await contar(tx, "profile_events", ENG_DEMO)) > 0, "la persona no ve su no_me_representa (control)");
      await ceroFilas(tx, "UPDATE de status", (sp) => sp`update app.profile_events set status = 'approved' where engagement_id = ${ENG_DEMO}`);
      await rechaza(tx, "UPDATE de payload", "permiso", (sp) => sp`update app.profile_events set payload = '{}'::jsonb where engagement_id = ${ENG_DEMO}`);
    },
  },
  {
    id: "CA-001.8",
    descripcion: "un coach sin acompañamientos lee 0 filas de las tablas del acompañamiento del seed",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      await crearInvitacion(tx, ENG_ALTA, PERSONA_ALTA);
      await crearCoachSin(tx);
      await como(tx, COACH_SIN);
      const [e] = await tx`select count(*)::int as n from app.engagements`;
      revisar(e.n === 0, `ve ${e.n} acompañamientos`);
      for (const tabla of ["sessions", "profile_events", "profile_snapshots", "persona_profiles", "plans", "plan_items", "persona_plans", "recommendations", "consent_events", "invitations"]) {
        for (const eid of [ENG_DEMO, ENG_ALTA]) {
          const n = await contar(tx, tabla, eid);
          revisar(n === 0, `ve ${n} filas de ${tabla} del acompañamiento ${eid}`);
        }
      }
    },
  },

  // ----- 002: creación del acompañamiento -----
  {
    id: "CA-002.4",
    descripcion: "la persona no puede insertar en app.engagements ni en app.users",
    correr: async (tx) => {
      await crearPersonaNueva(tx);
      // Cuenta de Auth sin fila en app.users, para probar el insert de la persona.
      await tx`delete from app.users where id = ${PERSONA_NUEVA}`;
      await crearUsuario(tx, COACH_SIN, "coach-sin@caja-mex.test", "coach", "Coach Sin Casos");
      await como(tx, PERSONA);
      await rechaza(tx, "persona inserta un usuario persona", "rls", (sp) => sp`
        insert into app.users (id, org_id, role, nombre_pila) values (${PERSONA_NUEVA}, ${ORG}, 'persona', 'Río')`);
      await comoOwner(tx);
      await tx`insert into app.users (id, org_id, role, nombre_pila) values (${PERSONA_NUEVA}, ${ORG}, 'persona', 'Río')`;
      await como(tx, PERSONA);
      await rechaza(tx, "persona inserta un acompañamiento", "rls", (sp) => sp`
        insert into app.engagements (org_id, type, coach_id, persona_id) values (${ORG}, 'inclusion', ${COACH}, ${PERSONA_NUEVA})`);
      await rechaza(tx, "persona inserta un acompañamiento propio con otro coach", "rls", (sp) => sp`
        insert into app.engagements (org_id, type, coach_id, persona_id) values (${ORG}, 'inclusion', ${COACH_SIN}, ${PERSONA})`);
    },
  },
  {
    id: "CA-002.4",
    descripcion: "el coach no inserta con otro coach_id, con etapa distinta de alta ni con una persona que ya tiene acompañamiento",
    correr: async (tx) => {
      await crearPersonaNueva(tx);
      await crearCoachSin(tx);
      await como(tx, COACH);
      await rechaza(tx, "acompañamiento con otro coach_id", "rls", (sp) => sp`
        insert into app.engagements (org_id, type, coach_id, persona_id) values (${ORG}, 'inclusion', ${COACH_SIN}, ${PERSONA_NUEVA})`);
      await rechaza(tx, "acompañamiento con etapa evaluacion_inicial", "permiso", (sp) => sp`
        insert into app.engagements (org_id, type, stage, coach_id, persona_id) values (${ORG}, 'inclusion', 'evaluacion_inicial', ${COACH}, ${PERSONA_NUEVA})`);
      await rechaza(tx, "acompañamiento ya verificado", "permiso", (sp) => sp`
        insert into app.engagements (org_id, type, coach_id, persona_id, diagnostico_verificado) values (${ORG}, 'inclusion', ${COACH}, ${PERSONA_NUEVA}, true)`);
      await rechaza(tx, "segundo acompañamiento para la persona del seed", "unique", (sp) => sp`
        insert into app.engagements (org_id, type, coach_id, persona_id) values (${ORG}, 'inclusion', ${COACH}, ${PERSONA})`);
      await rechaza(tx, "usuario nuevo con rol coach", "rls", (sp) => sp`
        insert into app.users (id, org_id, role, nombre_pila) values (${COACH_SIN}, ${ORG}, 'coach', 'Otro')`);
      // Control: el alta correcta sí entra, en etapa alta (R-002.2, R-002.5).
      const i = await intentar(tx, (sp) => sp`
        insert into app.engagements (org_id, type, coach_id, persona_id) values (${ORG}, 'inclusion', ${COACH}, ${PERSONA_NUEVA}) returning stage::text as stage`);
      revisar(i.ok && i.rows[0]?.stage === "alta", `el alta correcta no entró en etapa alta (${describir(i)})`);
    },
  },

  // ----- 002: verificación del diagnóstico -----
  {
    id: "CA-002.7",
    descripcion: "el coach no escribe quién ni cuándo; al guardar la verificación los pone la base",
    correr: async (tx) => {
      await como(tx, COACH);
      await rechaza(tx, "UPDATE de diagnostico_verificado_por", "permiso", (sp) => sp`
        update app.engagements set diagnostico_verificado_por = ${COACH} where id = ${ENG_ALTA}`);
      await rechaza(tx, "UPDATE de diagnostico_verificado_en", "permiso", (sp) => sp`
        update app.engagements set diagnostico_verificado_en = now() where id = ${ENG_ALTA}`);
      const r = await tx`update app.engagements set diagnostico_verificado = true, cedula_profesional = '1234567' where id = ${ENG_ALTA}`;
      revisar(r.count === 1, `guardar la verificación afectó ${r.count} filas`);
      await comoOwner(tx);
      const [e] = await tx`
        select diagnostico_verificado_por as por, diagnostico_verificado_en = now() as ahora, cedula_profesional as cedula
        from app.engagements where id = ${ENG_ALTA}`;
      revisar(e.por === COACH, `diagnostico_verificado_por quedó en ${e.por}`);
      revisar(e.ahora === true, "diagnostico_verificado_en no es la hora de la base");
      revisar(e.cedula === "1234567", "la cédula no se guardó");
    },
  },
  {
    id: "CA-002.8",
    descripcion: "como owner, el check rechaza diagnostico_verificado = true con cedula_profesional nula",
    correr: async (tx) => {
      const e1 = await rechaza(tx, "UPDATE de la cédula a nula", "check", (sp) => sp`
        update app.engagements set cedula_profesional = null where id = ${ENG_DEMO}`);
      revisar(e1.constraint_name === "engagements_verificacion_completa", `lo rechazó otra restricción: ${e1.constraint_name}`);
      await crearPersonaNueva(tx);
      const e2 = await rechaza(tx, "INSERT verificado sin cédula", "check", (sp) => sp`
        insert into app.engagements (org_id, type, coach_id, persona_id, diagnostico_verificado, cedula_profesional, diagnostico_verificado_por, diagnostico_verificado_en)
        values (${ORG}, 'inclusion', ${COACH}, ${PERSONA_NUEVA}, true, null, ${COACH}, now())`);
      revisar(e2.constraint_name === "engagements_verificacion_completa", `lo rechazó otra restricción: ${e2.constraint_name}`);
    },
  },
  {
    id: "CA-002.9",
    descripcion: "fuera de alta el coach no cambia la cédula; otro coach de la organización no verifica",
    correr: async (tx) => {
      await crearCoachSin(tx);
      await como(tx, COACH);
      await ceroFilas(tx, "el coach cambia la cédula en evaluacion_inicial", (sp) => sp`
        update app.engagements set cedula_profesional = '7654321' where id = ${ENG_DEMO}`);
      await como(tx, COACH_SIN);
      await ceroFilas(tx, "otro coach verifica el acompañamiento en alta", (sp) => sp`
        update app.engagements set diagnostico_verificado = true, cedula_profesional = '7654321' where id = ${ENG_ALTA}`);
      await comoOwner(tx);
      const [e] = await tx`select diagnostico_verificado as v from app.engagements where id = ${ENG_ALTA}`;
      revisar(e.v === false, "el acompañamiento en alta quedó verificado");
    },
  },

  // ----- 002: consentimiento -----
  {
    id: "CA-002.20",
    descripcion: "el coach no registra consentimiento; la persona no lo registra para otro, con otro user_id ni con fecha propia, ni edita ni borra",
    correr: async (tx) => {
      await asegurarConsentimientoDemo(tx);
      await como(tx, COACH);
      await rechaza(tx, "coach inserta otorgado por la persona en alta", "rls", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_ALTA}, ${PERSONA_ALTA}, 'otorgado', ${AVISO})`);
      await rechaza(tx, "coach inserta retirado con su propio user_id", "rls", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${COACH}, 'retirado', ${AVISO})`);
      await rechaza(tx, "coach hace UPDATE de un evento", "permiso", (sp) => sp`
        update app.consent_events set tipo = 'retirado' where engagement_id = ${ENG_DEMO}`);
      await rechaza(tx, "coach hace DELETE de un evento", "permiso", (sp) => sp`delete from app.consent_events where engagement_id = ${ENG_DEMO}`);
      await como(tx, PERSONA);
      await rechaza(tx, "persona inserta evento en otro acompañamiento", "rls", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_ALTA}, ${PERSONA}, 'retirado', ${AVISO})`);
      await rechaza(tx, "persona inserta evento con otro user_id", "rls", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA_ALTA}, 'retirado', ${AVISO})`);
      await rechaza(tx, "persona inserta evento con fecha propia", "permiso", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso, fecha) values (${ENG_DEMO}, ${PERSONA}, 'otorgado', ${AVISO}, now() - interval '1 year')`);
      await rechaza(tx, "persona hace UPDATE de su evento", "permiso", (sp) => sp`
        update app.consent_events set tipo = 'retirado' where engagement_id = ${ENG_DEMO}`);
      await rechaza(tx, "persona hace DELETE de su evento", "permiso", (sp) => sp`delete from app.consent_events where engagement_id = ${ENG_DEMO}`);
      // Control: la persona sí registra su propio evento.
      await acepta(tx, "persona inserta retirado propio", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA}, 'retirado', ${AVISO})`);
    },
  },
  {
    id: "CA-002.22",
    descripcion: "al retirar, el último evento es retirado, app_has_consent da false y la base no deja guardar sesiones (parte de base)",
    correr: async (tx) => {
      await asegurarConsentimientoDemo(tx);
      const [antes] = await tx`select count(*)::int as n from app.sessions where engagement_id = ${ENG_DEMO}`;
      await como(tx, PERSONA);
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA}, 'retirado', ${AVISO})`;
      revisar((await ultimoEvento(tx, ENG_DEMO)) === "retirado", "el último evento no es retirado");
      await como(tx, COACH);
      const [c] = await tx`select private.app_has_consent(${ENG_DEMO}) as v`;
      revisar(c.v === false, "app_has_consent sigue en true");
      await rechaza(tx, "el coach guarda una sesión sin consentimiento", "rls", (sp) => sp`
        insert into app.sessions (engagement_id, coach_id, nota_original) values (${ENG_DEMO}, ${COACH}, 'Nota sintética')`);
      await comoOwner(tx);
      const [despues] = await tx`select count(*)::int as n from app.sessions where engagement_id = ${ENG_DEMO}`;
      revisar(antes.n === despues.n, "cambió el número de sesiones");
    },
  },
  {
    id: "CA-002.24",
    descripcion: "con el consentimiento retirado el coach no ve notas, perfil ni historial, la persona no ve su perfil y nada se borró",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      const antes: Record<string, number> = {};
      for (const t of TABLAS_BLOQUEO) antes[t] = await contar(tx, t, ENG_DEMO);
      await como(tx, COACH);
      for (const t of TABLAS_BLOQUEO) revisar((await contar(tx, t, ENG_DEMO)) > 0, `el coach no ve ${t} con consentimiento (control)`);
      await como(tx, PERSONA);
      revisar((await contar(tx, "persona_profiles", ENG_DEMO)) > 0, "la persona no ve su perfil con consentimiento (control)");
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA}, 'retirado', ${AVISO})`;
      revisar((await contar(tx, "persona_profiles", ENG_DEMO)) === 0, "la persona ve su perfil sin consentimiento");
      revisar((await contar(tx, "recommendations", ENG_DEMO)) === 0, "la persona ve recomendaciones sin consentimiento");
      await como(tx, COACH);
      for (const t of ["sessions", "profile_events", "profile_snapshots", "persona_profiles"]) {
        revisar((await contar(tx, t, ENG_DEMO)) === 0, `el coach ve ${t} sin consentimiento`);
      }
      await comoOwner(tx);
      for (const t of TABLAS_BLOQUEO) {
        const n = await contar(tx, t, ENG_DEMO);
        revisar(n === antes[t], `${t} cambió de ${antes[t]} a ${n} filas`);
      }
    },
  },
  {
    id: "CA-002.37",
    descripcion: `con el consentimiento retirado, coach y persona leen 0 filas de ${TABLAS_BLOQUEO.join(", ")}`,
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      await como(tx, PERSONA);
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA}, 'retirado', ${AVISO})`;
      for (const usuario of [COACH, PERSONA]) {
        await como(tx, usuario);
        for (const t of TABLAS_BLOQUEO) {
          const n = await contar(tx, t, ENG_DEMO);
          revisar(n === 0, `${usuario === COACH ? "el coach" : "la persona"} lee ${n} filas de ${t}`);
        }
      }
      // El coach tampoco edita ni borra recomendaciones (recommendations_all_coach).
      await como(tx, COACH);
      await ceroFilas(tx, "el coach edita una recomendación", (sp) => sp`update app.recommendations set razon = razon where engagement_id = ${ENG_DEMO}`);
    },
  },
  {
    id: "CA-002.31",
    descripcion: "sin verificación, la persona no puede otorgar (la etapa sigue en alta) pero sí retirar",
    correr: async (tx) => {
      await como(tx, PERSONA_ALTA);
      await rechaza(tx, "otorgado sin verificación", "rls", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_ALTA}, ${PERSONA_ALTA}, 'otorgado', ${AVISO})`);
      const [m] = await tx`select stage::text as stage from private.app_mi_acompanamiento()`;
      revisar(m?.stage === "alta", `la etapa quedó en ${m?.stage}`);
      await acepta(tx, "retirado sin verificación", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_ALTA}, ${PERSONA_ALTA}, 'retirado', ${AVISO})`);
    },
  },
  {
    id: "CA-002.33",
    descripcion: "la persona lee 0 filas de app.engagements, app_mi_acompanamiento da id, type y stage, y con la verificación completa puede otorgar",
    correr: async (tx) => {
      await como(tx, PERSONA);
      const filas = await tx`select * from app.engagements`;
      revisar(filas.length === 0, `la persona lee ${filas.length} filas de engagements`);
      const mio = await tx`select * from private.app_mi_acompanamiento()`;
      revisar(mio.length === 1, `app_mi_acompanamiento devolvió ${mio.length} filas`);
      const columnas = Object.keys(mio[0]).sort().join(",");
      revisar(columnas === "id,stage,type", `app_mi_acompanamiento devolvió las columnas ${columnas}`);
      revisar(mio[0].id === ENG_DEMO, "app_mi_acompanamiento devolvió otro acompañamiento");
      // El coach verifica el acompañamiento en alta y la persona otorga: la etapa pasa a evaluacion_inicial (R-002.25).
      await como(tx, COACH);
      const r = await tx`update app.engagements set diagnostico_verificado = true, cedula_profesional = '1234567' where id = ${ENG_ALTA}`;
      revisar(r.count === 1, "el coach no pudo verificar (preparación)");
      await como(tx, PERSONA_ALTA);
      revisar((await tx`select * from app.engagements`).length === 0, "la persona en alta lee filas de engagements");
      await acepta(tx, "otorgado con la verificación completa", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_ALTA}, ${PERSONA_ALTA}, 'otorgado', ${AVISO})`);
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_ALTA}, ${PERSONA_ALTA}, 'otorgado', ${AVISO})`;
      const [m] = await tx`select stage::text as stage from private.app_mi_acompanamiento()`;
      revisar(m?.stage === "evaluacion_inicial", `la etapa quedó en ${m?.stage} después de otorgar`);
    },
  },
  {
    id: "CA-002.34",
    descripcion: "nadie escribe stage; la persona no actualiza su acompañamiento; la única política de UPDATE es engagements_update_coach_alta",
    correr: async (tx) => {
      const politicas = await tx`
        select policyname from pg_policies
        where schemaname = 'app' and tablename = 'engagements' and cmd in ('UPDATE', 'ALL') order by policyname`;
      const nombres = politicas.map((p) => p.policyname).join(",");
      revisar(nombres === "engagements_update_coach_alta", `políticas de UPDATE en engagements: ${nombres || "ninguna"}`);
      await como(tx, COACH);
      await rechaza(tx, "el coach escribe stage en alta", "permiso", (sp) => sp`update app.engagements set stage = 'evaluacion_inicial' where id = ${ENG_ALTA}`);
      await rechaza(tx, "el coach escribe stage en evaluacion_inicial", "permiso", (sp) => sp`update app.engagements set stage = 'plan' where id = ${ENG_DEMO}`);
      for (const [usuario, eid] of [[PERSONA, ENG_DEMO], [PERSONA_ALTA, ENG_ALTA]]) {
        await como(tx, usuario);
        await rechaza(tx, `la persona ${usuario} escribe stage`, "permiso", (sp) => sp`update app.engagements set stage = 'plan' where id = ${eid}`);
        await ceroFilas(tx, `la persona ${usuario} escribe diagnostico_verificado`, (sp) => sp`
          update app.engagements set diagnostico_verificado = diagnostico_verificado where id = ${eid}`);
        await ceroFilas(tx, `la persona ${usuario} escribe cedula_profesional`, (sp) => sp`
          update app.engagements set cedula_profesional = '1234567' where id = ${eid}`);
      }
    },
  },

  // ----- 002: lo que escribe la persona (R-002.45) -----
  {
    id: "CA-002.38",
    descripcion: "la persona no hace INSERT en ninguna tabla fuera de la lista de R-002.45",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearPersonaNueva(tx);
      await tx`delete from app.users where id = ${PERSONA_NUEVA}`; // queda solo la cuenta de Auth
      await como(tx, PERSONA);
      const intentos: [string, Rechazo, (sp: Tx) => Promise<postgres.RowList<Row[]>>][] = [
        ["organizations", "permiso", (sp) => sp`insert into app.organizations (nombre) values ('Otra organización')`],
        ["users", "rls", (sp) => sp`insert into app.users (id, org_id, role, nombre_pila) values (${PERSONA_NUEVA}, ${ORG}, 'persona', 'Río')`],
        ["engagements", "rls", (sp) => sp`insert into app.engagements (org_id, type, coach_id, persona_id) values (${ORG}, 'inclusion', ${COACH}, ${PERSONA})`],
        ["sessions", "rls", (sp) => sp`insert into app.sessions (engagement_id, coach_id, nota_original) values (${ENG_DEMO}, ${PERSONA}, 'Nota sintética')`],
        ["profile_events (propuesta_ia)", "rls", (sp) => sp`
          insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
          values (${ENG_DEMO}, 'propuesta_ia', 'proposed', '{}'::jsonb, ${PERSONA})`],
        ["profile_snapshots", "rls", (sp) => sp`
          insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
          values (${ENG_DEMO}, 999999, '{}'::jsonb, ${d.eventoId}, ${PERSONA})`],
        ["persona_profiles", "rls", (sp) => sp`
          insert into app.persona_profiles (snapshot_id, engagement_id, version, contenido) values (${d.snapshotSinVistaId}, ${ENG_DEMO}, 999999, '{}'::jsonb)`],
        ["plans", "rls", (sp) => sp`insert into app.plans (engagement_id, titulo) values (${ENG_DEMO}, 'Plan')`],
        ["plan_items", "rls", (sp) => sp`
          insert into app.plan_items (plan_id, engagement_id, tipo, descripcion) values (${d.planId}, ${ENG_DEMO}, 'objetivo', 'Objetivo')`],
        ["persona_plans", "rls", (sp) => sp`
          insert into app.persona_plans (plan_id, engagement_id, version, contenido) values (${d.planId}, ${ENG_DEMO}, 999999, '{"items":[]}'::jsonb)`],
        ["knowledge_cards", "permiso", (sp) => sp`
          insert into app.knowledge_cards (id, titulo, tipo, contenido, fuente) values ('KC-999', 'T', 'senal', 'C', 'F-000')`],
        ["catalog_units", "permiso", (sp) => sp`
          insert into app.catalog_units (id, titulo, competencia, formato, duracion_min, carga_cognitiva, fuente)
          values ('CU-999', 'T', 'C', 'lectura', 1, 'baja', 'x')`],
        ["recommendations", "rls", (sp) => sp`
          insert into app.recommendations (engagement_id, catalog_unit_id, razon) values (${ENG_DEMO}, 'CU-001', 'Razón')`],
        ["invitations", "rls", (sp) => sp`
          insert into app.invitations (engagement_id, persona_id, creada_por, expira_en) values (${ENG_DEMO}, ${PERSONA}, ${PERSONA}, now() + interval '7 days')`],
        ["audit_log con otro user_id", "rls", (sp) => sp`insert into app.audit_log (user_id, accion, ok) values (${COACH}, 'rls_check', true)`],
        ["plan_item_updates", "rls", (sp) => sp`
          insert into app.plan_item_updates (engagement_id, plan_item_id, session_id, event_id, estado, resumen, evidencia, approved_by)
          values (${ENG_DEMO}, ${d.planItemId}, ${d.sessionId}, ${d.eventoId}, 'avanza', 'Avance', '[]'::jsonb, ${PERSONA})`],
        ["followup_context", "rls", (sp) => sp`
          insert into app.followup_context (engagement_id, tipo, texto, session_id, event_id, approved_by)
          values (${ENG_DEMO}, 'contexto', 'Contexto', ${d.sessionId}, ${d.eventoId}, ${PERSONA})`],
        ["signal_states", "rls", (sp) => sp`
          insert into app.signal_states (engagement_id, tipo, estado, created_by) values (${ENG_DEMO}, 'cambio_de_vida', 'cerrada', ${PERSONA})`],
        ["strong_alerts", "rls", (sp) => sp`
          insert into app.strong_alerts (engagement_id, tipo_senal, event_id, marcada_por) values (${ENG_DEMO}, 'cambio_de_vida', ${d.eventoId}, ${PERSONA})`],
        ["fe_corrections", "rls", (sp) => sp`
          insert into app.fe_corrections (engagement_id, event_id, linea_id, dominio, created_by)
          values (${ENG_DEMO}, ${d.eventoId}, ${d.lineaId}, 'flexibilidad', ${PERSONA})`],
        ["fe_domain_summaries", "rls", (sp) => sp`
          insert into app.fe_domain_summaries (engagement_id, dominio, texto, linea_ids, bloque_ids, prompt_version, model, created_by)
          values (${ENG_DEMO}, 'flexibilidad', 'Sintético.', ${sp.json([d.lineaId])}, ${sp.json([d.lineaId])}, ${PROMPT_RESUMEN}, 'rls-check', ${PERSONA})`],
        // La persona sí escribe su guía (R-002.45), pero solo un borrador suyo, sin versión ni documento.
        ["shared_guides (ya lista)", "rls", (sp) => sp`
          insert into app.shared_guides (engagement_id, version, estado, nombre_a_mostrar, lineas, documento, generada_desde_snapshot_id, perfil_version, plan_version, generada_por, aprobada_por_persona_en)
          values (${ENG_DEMO}, 999999, 'lista', 'Nombre', '[]'::jsonb, ${json(sp, DOCUMENTO_GUIA)}, ${d.snapshotId}, 1, 1, ${PERSONA}, now())`],
        ["shared_guides (a nombre de otro)", "rls", (sp) => pedirBorrador(sp, { engagementId: ENG_DEMO, snapshotId: d.snapshotId, generadaPor: COACH })],
        // La persona sí escribe sus desgloses y sus marcas (R-010.51), pero solo a su nombre. Plantillas, ninguna.
        ["task_breakdowns (a nombre de otro)", "rls", (sp) => insertarDesglose(sp, { engagementId: ENG_DEMO, snapshotId: d.snapshotId, creadoPor: COACH })],
        ["task_step_events (a nombre de otro)", "rls", (sp) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId, creadoPor: COACH })],
        ["task_templates", "rls", (sp) => insertarPlantilla(sp, { origen: ENG_DEMO, creadaPor: PERSONA })],
      ];
      for (const [tabla, tipo, consulta] of intentos) await rechaza(tx, `INSERT en ${tabla}`, tipo, consulta);
      // Si una spec agrega una tabla al esquema app, este caso tiene que probarla.
      await comoOwner(tx);
      const tablas = (await tx`select tablename from pg_tables where schemaname = 'app' order by tablename`).map((t) => t.tablename as string);
      const cubiertas = new Set([...intentos.map(([t]) => t.split(" ")[0]), "consent_events"]);
      const faltan = tablas.filter((t) => !cubiertas.has(t));
      revisar(faltan.length === 0, `tablas de app sin prueba de INSERT de la persona: ${faltan.join(", ")}`);
    },
  },
  {
    id: "CA-002.38",
    descripcion: "la persona no hace UPDATE de ninguna columna fuera de la lista de R-002.45",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      // Invitación ya usada de la persona del seed: no debe poder tocarla.
      await crearInvitacion(tx, ENG_DEMO, PERSONA, { usada: true });
      const tablas = (await tx`select tablename from pg_tables where schemaname = 'app' order by tablename`).map((t) => t.tablename as string);
      const conPermiso = await tx`
        select table_name as tabla, column_name as columna from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'app' and privilege_type = 'UPDATE'
        order by table_name, column_name`;
      const columnas = await tx`
        select table_name as tabla, min(column_name) as columna from information_schema.columns
        where table_schema = 'app' group by table_name`;
      // La guía sí está en la lista (R-002.45). Su permiso por columna es exacto, y sus casos van en
      // "la persona sí escribe su guía" y en CA-009.32.
      const deGuia = conPermiso.filter((c) => c.tabla === "shared_guides").map((c) => c.columna).join(",");
      revisar(deGuia === "documento,estado,lineas,nombre_a_mostrar,revisada_sin_cambios,version", `columnas de UPDATE en shared_guides: ${deGuia}`);
      // Spec 010: el permiso por columna es exacto. La persona archiva lo suyo (R-010.29, CA-010.29). pasos no está.
      const deTabla = (tabla: string) => conPermiso.filter((c) => c.tabla === tabla).map((c) => c.columna).join(",");
      revisar(deTabla("task_breakdowns") === "archivado_en,archivado_por", `columnas de UPDATE en task_breakdowns: ${deTabla("task_breakdowns")}`);
      revisar(deTabla("task_step_events") === "revisado_en,revisado_por", `columnas de UPDATE en task_step_events: ${deTabla("task_step_events")}`);
      revisar(deTabla("task_templates") === "archivada_en,archivada_por", `columnas de UPDATE en task_templates: ${deTabla("task_templates")}`);
      await como(tx, PERSONA);
      for (const tabla of tablas.filter((t) => t !== "shared_guides")) {
        const permitidas = conPermiso.filter((c) => c.tabla === tabla);
        if (permitidas.length === 0) {
          const col = columnas.find((c) => c.tabla === tabla)?.columna as string;
          await rechaza(tx, `UPDATE de ${tabla}.${col}`, "permiso", (sp) => sp.unsafe(`update app.${tabla} set ${col} = ${col}`));
          continue;
        }
        for (const { columna } of permitidas) {
          await rechazaOCero(tx, `UPDATE de ${tabla}.${columna}`, (sp) => sp.unsafe(`update app.${tabla} set ${columna} = ${columna}`));
        }
      }
    },
  },
  {
    id: "CA-002.38",
    descripcion: "la persona no hace DELETE en ninguna tabla del esquema app",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      const tablas = (await tx`select tablename from pg_tables where schemaname = 'app' order by tablename`).map((t) => t.tablename as string);
      await como(tx, PERSONA);
      for (const tabla of tablas) await rechazaOCero(tx, `DELETE en ${tabla}`, (sp) => sp.unsafe(`delete from app.${tabla}`));
    },
  },
  {
    id: "CA-002.38",
    descripcion: "la persona sí escribe lo que permite la lista: consentimiento, canje de su invitación, no_me_representa y su audit_log",
    correr: async (tx) => {
      await asegurarConsentimientoDemo(tx);
      const vencida = await crearInvitacion(tx, ENG_ALTA, PERSONA_ALTA, { vencida: true });
      await tx`update app.invitations set reemplazada_en = now() where id = ${vencida}`;
      const vencidaSinReemplazo = await crearInvitacion(tx, ENG_ALTA, PERSONA_ALTA, { vencida: true });
      const pendiente = await crearInvitacion(tx, ENG_ALTA, PERSONA_ALTA);
      await como(tx, PERSONA_ALTA);
      await ceroFilas(tx, "canje de una invitación reemplazada", (sp) => sp`update app.invitations set usada_en = now() where id = ${vencida}`);
      await ceroFilas(tx, "canje de una invitación vencida", (sp) => sp`update app.invitations set usada_en = now() where id = ${vencidaSinReemplazo}`);
      await rechaza(tx, "la persona marca su invitación como reemplazada", "rls", (sp) => sp`
        update app.invitations set reemplazada_en = now() where id = ${pendiente}`);
      await acepta(tx, "canje de su invitación pendiente", (sp) => sp`update app.invitations set usada_en = now() where id = ${pendiente}`);
      await acepta(tx, "retirado propio", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_ALTA}, ${PERSONA_ALTA}, 'retirado', ${AVISO})`);
      await como(tx, PERSONA);
      await ceroFilas(tx, "canje de la invitación de otra persona", (sp) => sp`update app.invitations set usada_en = now() where id = ${pendiente}`);
      await acepta(tx, "otorgado propio con la verificación completa", (sp) => sp`
        insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA}, 'otorgado', ${AVISO})`);
      await acepta(tx, "no_me_representa propio", (sp) => sp`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_DEMO}, 'no_me_representa', 'proposed', ${NMR("Prueba")}::jsonb, ${PERSONA})`);
      await acepta(tx, "audit_log propio", (sp) => sp`insert into app.audit_log (user_id, engagement_id, accion, ok) values (${PERSONA}, ${ENG_DEMO}, 'rls_check', true)`);
    },
  },
  {
    id: "CA-002.38",
    descripcion: "la persona sí escribe su guía: pedir, decidir, nombre, listo, retirar, copiar y descartar; otra persona no",
    correr: async (tx) => {
      await asegurarConsentimientoDemo(tx);
      const { id: snapshotId } = await crearSnapshot(tx, ENG_DEMO);
      const version = await siguienteVersionGuia(tx, ENG_DEMO);
      const id = randomUUID();
      await como(tx, PERSONA);
      await pedirBorrador(tx, { id, engagementId: ENG_DEMO, snapshotId, generadaPor: PERSONA });
      const decididas = [lineaGuia("incluida"), lineaGuia("propia", { orden: 1 })];
      await acepta(tx, "decidir líneas", (sp) => sp`update app.shared_guides set lineas = ${json(sp, decididas)} where id = ${id}`);
      await tx`update app.shared_guides set lineas = ${json(tx, decididas)}, nombre_a_mostrar = 'Otro nombre' where id = ${id}`;
      await como(tx, PERSONA_ALTA);
      await ceroFilas(tx, "otra persona decide líneas", (sp) => sp`update app.shared_guides set lineas = '[]'::jsonb where id = ${id}`);
      await como(tx, PERSONA);
      await marcarLista(tx, id, version);
      const [lista] = await tx`select estado::text as estado, version, aprobada_por_persona_en from app.shared_guides where id = ${id}`;
      revisar(lista?.estado === "lista" && lista.version === version && lista.aprobada_por_persona_en !== null, "no quedó lista con versión y fecha");
      // "Hacer cambios" copia con la versión lista como base (R-009.32), y ese borrador se descarta.
      const copia = randomUUID();
      await pedirBorrador(tx, { id: copia, engagementId: ENG_DEMO, snapshotId, generadaPor: PERSONA, base: id });
      await tx`update app.shared_guides set estado = 'descartada' where id = ${copia}`;
      const [descartada] = await tx`select estado::text as estado, descartada_en from app.shared_guides where id = ${copia}`;
      revisar(descartada?.estado === "descartada" && descartada.descartada_en !== null, "no quedó descartada con fecha");
      await tx`update app.shared_guides set estado = 'retirada' where id = ${id}`;
      const [retirada] = await tx`select estado::text as estado, retirada_en from app.shared_guides where id = ${id}`;
      revisar(retirada?.estado === "retirada" && retirada.retirada_en !== null, "no quedó retirada con fecha");
    },
  },
  {
    id: "CA-002.44",
    descripcion: "con el consentimiento retirado la persona no inserta un no_me_representa, una guía, un desglose ni una marca; con otorgado sí, y no los de otro acompañamiento",
    correr: async (tx) => {
      await asegurarConsentimientoDemo(tx);
      const { id: snapshotId } = await crearSnapshot(tx, ENG_DEMO);
      const desglose = await crearDesglose(tx, ENG_DEMO, snapshotId);
      const pedirDesglose = (sp: Tx, engagementId: string) => insertarDesglose(sp, { engagementId, snapshotId, creadoPor: PERSONA });
      await evento(tx, ENG_DEMO, PERSONA, "retirado");
      await como(tx, PERSONA);
      const nmr = (sp: Tx, engagementId: string) => sp`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${engagementId}, 'no_me_representa', 'proposed', ${NMR("Prueba")}::jsonb, ${PERSONA})`;
      await rechaza(tx, "no_me_representa con el retiro vigente", "rls", (sp) => nmr(sp, ENG_DEMO));
      await rechaza(tx, "guía con el retiro vigente", "rls", (sp) => pedirBorrador(sp, { engagementId: ENG_DEMO, snapshotId, generadaPor: PERSONA }));
      await rechaza(tx, "desglose con el retiro vigente", "rls", (sp) => pedirDesglose(sp, ENG_DEMO));
      await rechaza(tx, "marca con el retiro vigente", "rls", (sp) => marcarPaso(sp, { desgloseId: desglose.id, pasoId: desglose.pasos[0] }));
      await comoOwner(tx);
      await evento(tx, ENG_DEMO, PERSONA, "otorgado");
      await como(tx, PERSONA);
      await acepta(tx, "no_me_representa con otorgado", (sp) => nmr(sp, ENG_DEMO));
      await acepta(tx, "guía con otorgado", (sp) => pedirBorrador(sp, { engagementId: ENG_DEMO, snapshotId, generadaPor: PERSONA }));
      await acepta(tx, "desglose con otorgado", (sp) => pedirDesglose(sp, ENG_DEMO));
      await acepta(tx, "marca con otorgado", (sp) => marcarPaso(sp, { desgloseId: desglose.id, pasoId: desglose.pasos[0] }));
      await rechaza(tx, "no_me_representa de otro acompañamiento", "rls", (sp) => nmr(sp, ENG_ALTA));
      await rechaza(tx, "guía de otro acompañamiento", "rls", (sp) => pedirBorrador(sp, { engagementId: ENG_ALTA, snapshotId, generadaPor: PERSONA }));
      await rechaza(tx, "desglose de otro acompañamiento", "rls", (sp) => pedirDesglose(sp, ENG_ALTA));
    },
  },

  // ----- 003: plan de acompañamiento -----
  {
    id: "CA-003.2",
    descripcion: "sin consentimiento vigente (sin eventos o con retirado al final) la política rechaza el INSERT directo del coach en app.plans",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      // El acompañamiento en alta no tiene eventos de consentimiento; se le da un perfil aprobado.
      const snapAlta = await crearSnapshot(tx, ENG_ALTA);
      const antes = { demo: await contar(tx, "plans", ENG_DEMO), alta: await contar(tx, "plans", ENG_ALTA) };
      await como(tx, COACH);
      await acepta(tx, "borrador con consentimiento vigente (control)", (sp) => insertarBorrador(sp, ENG_DEMO, d.snapshotId));
      await rechaza(tx, "borrador en un acompañamiento sin eventos de consentimiento", "rls", (sp) => insertarBorrador(sp, ENG_ALTA, snapAlta.id));
      await como(tx, PERSONA);
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA}, 'retirado', ${AVISO})`;
      await como(tx, COACH);
      await rechaza(tx, "borrador con el consentimiento retirado", "rls", (sp) => insertarBorrador(sp, ENG_DEMO, d.snapshotId));
      await comoOwner(tx);
      revisar((await contar(tx, "plans", ENG_DEMO)) === antes.demo, "hay planes nuevos en el acompañamiento de demo");
      revisar((await contar(tx, "plans", ENG_ALTA)) === antes.alta, "hay planes nuevos en el acompañamiento en alta");
    },
  },
  {
    id: "CA-003.10",
    descripcion: "el coach no cambia propuesta_ia, profile_snapshot_id, prompt_version, model ni created_by de un plan (permisos de columna)",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const b = await crearPlan(tx, ENG_DEMO, d.snapshotId, "borrador");
      await como(tx, COACH);
      await rechaza(tx, "UPDATE de propuesta_ia", "permiso", (sp) => sp`update app.plans set propuesta_ia = '{}'::jsonb where id = ${b.planId}`);
      await rechaza(tx, "UPDATE de profile_snapshot_id", "permiso", (sp) => sp`
        update app.plans set profile_snapshot_id = ${d.snapshotSinVistaId} where id = ${b.planId}`);
      await rechaza(tx, "UPDATE de prompt_version", "permiso", (sp) => sp`update app.plans set prompt_version = 'otra' where id = ${b.planId}`);
      await rechaza(tx, "UPDATE de model", "permiso", (sp) => sp`update app.plans set model = 'otro' where id = ${b.planId}`);
      await rechaza(tx, "UPDATE de created_by", "permiso", (sp) => sp`update app.plans set created_by = ${COACH} where id = ${b.planId}`);
      // Control: el título del borrador sí se puede cambiar.
      await acepta(tx, "UPDATE del título del borrador (control)", (sp) => sp`update app.plans set titulo = 'Otro título' where id = ${b.planId}`);
    },
  },
  {
    id: "CA-003.15",
    descripcion: "en un plan aprobado o descartado el coach no edita, agrega ni quita ítems, ni cambia el plan; tampoco borra planes",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const descartado = await crearPlan(tx, ENG_DEMO, d.snapshotId, "descartado");
      const borrador = await crearPlan(tx, ENG_DEMO, d.snapshotId, "borrador");
      await como(tx, COACH);
      for (const [estado, planId, itemId] of [
        ["aprobado", d.planId, d.planItemId],
        ["descartado", descartado.planId, descartado.itemId],
      ]) {
        revisar((await tx`select id from app.plan_items where id = ${itemId}`).length === 1, `el coach no ve el ítem del plan ${estado} (control)`);
        await ceroFilas(tx, `UPDATE de un ítem del plan ${estado}`, (sp) => sp`
          update app.plan_items set descripcion = 'Cambio', texto_persona = 'Cambio' where id = ${itemId}`);
        await rechaza(tx, `INSERT de un ítem en el plan ${estado}`, "rls", (sp) => sp`
          insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, origen) values (${planId}, ${ENG_DEMO}, 'objetivo', 'Nuevo', 'coach')`);
        await ceroFilas(tx, `DELETE de un ítem del plan ${estado}`, (sp) => sp`delete from app.plan_items where id = ${itemId}`);
        await ceroFilas(tx, `UPDATE del plan ${estado}`, (sp) => sp`update app.plans set titulo = 'Cambio', status = 'borrador' where id = ${planId}`);
        await rechaza(tx, `DELETE del plan ${estado}`, "permiso", (sp) => sp`delete from app.plans where id = ${planId}`);
      }
      // Control: en el borrador las mismas operaciones sí pasan.
      await acepta(tx, "UPDATE de un ítem del borrador (control)", (sp) => sp`
        update app.plan_items set descripcion = 'Cambio', origen = 'ia_editado', editado_por = ${COACH}, editado_en = now() where id = ${borrador.itemId}`);
      await acepta(tx, "INSERT de un ítem en el borrador (control)", (sp) => sp`
        insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, origen) values (${borrador.planId}, ${ENG_DEMO}, 'objetivo', 'Nuevo', 'coach')`);
      await acepta(tx, "DELETE de un ítem del borrador (control)", (sp) => sp`delete from app.plan_items where id = ${borrador.itemId}`);
      await comoOwner(tx);
      const [i] = await tx`select descripcion from app.plan_items where id = ${d.planItemId}`;
      revisar(i?.descripcion === "Objetivo sintético de rls-check.", "el ítem del plan aprobado cambió");
    },
  },
  {
    id: "CA-003.16",
    descripcion: "otro plan del mismo acompañamiento con la misma versión lo rechaza plans_engagement_version (owner y aprobación del coach); un segundo borrador lo rechaza plans_un_borrador",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const [{ version }] = await tx`select version from app.plans where id = ${d.planId}`;
      const e1 = await rechaza(tx, "INSERT como owner con versión repetida", "unique", (sp) => sp`
        insert into app.plans (engagement_id, titulo, status, profile_snapshot_id, version, created_by, approved_by, approved_at)
        values (${ENG_DEMO}, 'Plan de acompañamiento', 'aprobado', ${d.snapshotId}, ${version}, ${COACH}, ${COACH}, now())`);
      revisar(e1.constraint_name === "plans_engagement_version", `lo rechazó otra restricción: ${e1.constraint_name}`);
      const b = await crearPlan(tx, ENG_DEMO, d.snapshotId, "borrador");
      // La aprobación que llega tarde con la misma versión (R-003.31).
      await como(tx, COACH);
      const e2 = await rechaza(tx, "el coach aprueba el borrador con versión repetida", "unique", (sp) => sp`
        update app.plans set status = 'aprobado', version = ${version}, approved_by = ${COACH}, approved_at = now() where id = ${b.planId}`);
      revisar(e2.constraint_name === "plans_engagement_version", `lo rechazó otra restricción: ${e2.constraint_name}`);
      const e3 = await rechaza(tx, "segundo borrador del mismo acompañamiento", "unique", (sp) => insertarBorrador(sp, ENG_DEMO, d.snapshotId));
      revisar(e3.constraint_name === "plans_un_borrador", `lo rechazó otra restricción: ${e3.constraint_name}`);
    },
  },
  {
    id: "CA-003.18",
    descripcion: "la persona lee 0 filas de plans, plan_items y knowledge_cards, y de persona_plans solo las de su acompañamiento",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      // Otro acompañamiento con consentimiento y plan aprobado, para que "solo las suyas" signifique algo.
      await evento(tx, ENG_ALTA, PERSONA_ALTA, "otorgado");
      const snapAlta = await crearSnapshot(tx, ENG_ALTA);
      await crearPlan(tx, ENG_ALTA, snapAlta.id, "aprobado", { conPersona: true });
      await como(tx, COACH);
      for (const t of TABLAS_PLAN) revisar((await contar(tx, t, ENG_DEMO)) > 0, `el coach no ve ${t} (control)`);
      revisar((await contarKnowledgeCards(tx)) > 0, "el coach no ve knowledge_cards (control)");
      for (const [persona, propio, ajeno] of [
        [PERSONA, ENG_DEMO, ENG_ALTA],
        [PERSONA_ALTA, ENG_ALTA, ENG_DEMO],
      ]) {
        await como(tx, persona);
        for (const t of ["plans", "plan_items"]) {
          const [r] = await tx.unsafe(`select count(*)::int as n from app.${t}`);
          revisar(r.n === 0, `la persona ${persona} lee ${r.n} filas de ${t}`);
        }
        const kc = await contarKnowledgeCards(tx);
        revisar(kc === 0, `la persona ${persona} lee ${kc} fichas`);
        const [todas] = await tx`select count(*)::int as n from app.persona_plans`;
        const propias = await contar(tx, "persona_plans", propio);
        revisar(propias > 0, `la persona ${persona} no ve su plan (control)`);
        revisar(todas.n === propias, `la persona ${persona} lee ${todas.n - propias} filas de persona_plans de otro acompañamiento`);
        revisar((await contar(tx, "persona_plans", ajeno)) === 0, `la persona ${persona} lee persona_plans de ${ajeno}`);
      }
    },
  },
  {
    id: "CA-003.25",
    descripcion: "el coach no cambia plan_items.tipo ni plan_items.propuesta_ref de un borrador (permisos de columna)",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const b = await crearPlan(tx, ENG_DEMO, d.snapshotId, "borrador");
      await como(tx, COACH);
      await rechaza(tx, "UPDATE de tipo", "permiso", (sp) => sp`update app.plan_items set tipo = 'apoyo_fe' where id = ${b.itemId}`);
      await rechaza(tx, "UPDATE de propuesta_ref", "permiso", (sp) => sp`update app.plan_items set propuesta_ref = 5 where id = ${b.itemId}`);
      await acepta(tx, "UPDATE de la descripción (control)", (sp) => sp`
        update app.plan_items set descripcion = 'Cambio', origen = 'ia_editado' where id = ${b.itemId}`);
    },
  },
  {
    id: "CA-003.28",
    descripcion: "el coach no hace UPDATE, INSERT ni DELETE en app.knowledge_cards y KC-001 a KC-003 siguen sin verificar",
    correr: async (tx) => {
      await como(tx, COACH);
      revisar((await contarKnowledgeCards(tx)) > 0, "el coach no ve knowledge_cards (control)");
      await rechaza(tx, "UPDATE de verificada", "permiso", (sp) => sp`update app.knowledge_cards set verificada = true where id = 'KC-001'`);
      await rechaza(tx, "UPDATE de contenido", "permiso", (sp) => sp`update app.knowledge_cards set contenido = 'Otro' where id = 'KC-001'`);
      await rechaza(tx, "INSERT de una ficha", "permiso", (sp) => sp`
        insert into app.knowledge_cards (id, titulo, tipo, contenido, fuente, verificada) values ('KC-999', 'T', 'estrategia_fe', 'C', 'F-000', true)`);
      await rechaza(tx, "DELETE de una ficha", "permiso", (sp) => sp`delete from app.knowledge_cards where id = 'KC-001'`);
      await comoOwner(tx);
      const fichas = await tx`select id from app.knowledge_cards where id in ('KC-001', 'KC-002', 'KC-003') and verificada = false`;
      revisar(fichas.length === 3, `solo ${fichas.length} de KC-001 a KC-003 siguen con verificada = false`);
    },
  },
  {
    id: "CA-003.32",
    descripcion: "con el consentimiento retirado coach y persona leen 0 filas de plans, plan_items y persona_plans; nada se borra y la etapa no cambia",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      const antes: Record<string, number> = {};
      for (const t of TABLAS_PLAN) antes[t] = await contar(tx, t, ENG_DEMO);
      const etapaAntes = await etapa(tx, ENG_DEMO);
      await como(tx, COACH);
      for (const t of TABLAS_PLAN) revisar((await contar(tx, t, ENG_DEMO)) > 0, `el coach no ve ${t} con consentimiento (control)`);
      await como(tx, PERSONA);
      revisar((await contar(tx, "persona_plans", ENG_DEMO)) > 0, "la persona no ve su plan con consentimiento (control)");
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA}, 'retirado', ${AVISO})`;
      for (const usuario of [COACH, PERSONA]) {
        await como(tx, usuario);
        for (const t of TABLAS_PLAN) {
          const n = await contar(tx, t, ENG_DEMO);
          revisar(n === 0, `${usuario === COACH ? "el coach" : "la persona"} lee ${n} filas de ${t} sin consentimiento`);
        }
      }
      await comoOwner(tx);
      for (const t of TABLAS_PLAN) {
        const n = await contar(tx, t, ENG_DEMO);
        revisar(n === antes[t], `${t} cambió de ${antes[t]} a ${n} filas`);
      }
      const etapaDespues = await etapa(tx, ENG_DEMO);
      revisar(etapaDespues === etapaAntes, `retirar el consentimiento cambió la etapa de ${etapaAntes} a ${etapaDespues}`);
    },
  },
  {
    id: "CA-003.34",
    descripcion: "etapas: snapshot v1 → perfil, primer plan → plan, aprobarlo → seguimiento; otro snapshot, descartar o aprobar la v2 no la mueven",
    correr: async (tx) => {
      // Se recorre el acompañamiento en alta con las sesiones reales del coach y de la persona,
      // así cada paso pasa por las políticas y los triggers de verdad.
      for (const t of ["profile_snapshots", "plans"]) {
        revisar((await contar(tx, t, ENG_ALTA)) === 0, `el acompañamiento en alta ya tiene ${t}; vuelve a cargar el seed`);
      }
      await como(tx, COACH);
      const r = await tx`update app.engagements set diagnostico_verificado = true, cedula_profesional = '1234567' where id = ${ENG_ALTA}`;
      revisar(r.count === 1, "el coach no pudo verificar (preparación)");
      await como(tx, PERSONA_ALTA);
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_ALTA}, ${PERSONA_ALTA}, 'otorgado', ${AVISO})`;
      revisar((await etapa(tx, ENG_ALTA)) === "evaluacion_inicial", "la etapa no quedó en evaluacion_inicial (preparación)");

      const payload = JSON.stringify({ tipo: "propuesta_ia", update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] }, descartados: [], banderas: [] });
      const perfil = '{"dimensiones":{},"senalesActivas":[]}';
      const snapshot = async (version: number) => {
        await como(tx, COACH);
        const [ev] = await tx`
          insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
          values (${ENG_ALTA}, 'propuesta_ia', 'proposed', ${payload}::jsonb, ${COACH}) returning id`;
        const [s] = await tx`
          insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
          values (${ENG_ALTA}, ${version}, ${perfil}::jsonb, ${ev.id}, ${COACH}) returning id`;
        return s.id as string;
      };
      const borrador = async (snapshotId: string) => {
        await como(tx, COACH);
        const [p] = await insertarBorrador(tx, ENG_ALTA, snapshotId);
        await tx`insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, origen) values (${p.id}, ${ENG_ALTA}, 'objetivo', 'Objetivo sintético', 'coach')`;
        return p.id as string;
      };
      const decidir = async (planId: string, status: "aprobado" | "descartado", version: number | null) => {
        await como(tx, COACH);
        const aprobado = status === "aprobado";
        const u = await tx`
          update app.plans set status = ${status}, version = ${version},
            approved_by = ${aprobado ? COACH : null}, approved_at = ${aprobado ? tx`now()` : tx`null`}
          where id = ${planId}`;
        revisar(u.count === 1, `el coach no pudo dejar el plan en ${status}`);
      };
      const esperar = async (esperada: string, paso: string) => {
        const actual = await etapa(tx, ENG_ALTA);
        revisar(actual === esperada, `${paso}: la etapa quedó en ${actual} y se esperaba ${esperada}`);
      };

      const s1 = await snapshot(1);
      await esperar("perfil", "snapshot versión 1");
      const p1 = await borrador(s1);
      await esperar("plan", "primer borrador");
      await decidir(p1, "aprobado", 1);
      await esperar("seguimiento", "aprobar el primer plan");
      const s2 = await snapshot(2);
      await esperar("seguimiento", "snapshot versión 2");
      await decidir(await borrador(s2), "descartado", null);
      await esperar("seguimiento", "descartar un borrador");
      await decidir(await borrador(s2), "aprobado", 2);
      await esperar("seguimiento", "aprobar la versión 2");
      await como(tx, PERSONA_ALTA);
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_ALTA}, ${PERSONA_ALTA}, 'retirado', ${AVISO})`;
      await esperar("seguimiento", "retirar el consentimiento");
    },
  },
  {
    id: "CA-003.35",
    descripcion: "ni el coach ni la persona hacen UPDATE de app.engagements.stage",
    correr: async (tx) => {
      const antes = await etapa(tx, ENG_DEMO);
      for (const usuario of [COACH, PERSONA]) {
        await como(tx, usuario);
        for (const destino of ["perfil", "plan", "seguimiento", "cierre"]) {
          await rechaza(tx, `${usuario === COACH ? "el coach" : "la persona"} pone stage = ${destino}`, "permiso", (sp) => sp`
            update app.engagements set stage = ${destino} where id = ${ENG_DEMO}`);
        }
      }
      const despues = await etapa(tx, ENG_DEMO);
      revisar(antes === despues, `la etapa cambió de ${antes} a ${despues}`);
    },
  },
  {
    id: "CA-003.36",
    descripcion: "la persona no hace INSERT, UPDATE ni DELETE en plans, plan_items, persona_plans ni knowledge_cards",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const b = await crearPlan(tx, ENG_DEMO, d.snapshotId, "borrador");
      const sinCopia = await crearPlan(tx, ENG_DEMO, d.snapshotId, "aprobado"); // aprobado sin persona_plans
      const antes: Record<string, number> = {};
      for (const t of TABLAS_PLAN) antes[t] = await contar(tx, t, ENG_DEMO);
      await como(tx, PERSONA);
      // INSERT
      await rechaza(tx, "INSERT en plans", "rls", (sp) => sp`
        insert into app.plans (engagement_id, titulo, profile_snapshot_id, created_by) values (${ENG_DEMO}, 'Plan', ${d.snapshotId}, ${PERSONA})`);
      await rechaza(tx, "INSERT en plan_items de un borrador", "rls", (sp) => sp`
        insert into app.plan_items (plan_id, engagement_id, tipo, descripcion) values (${b.planId}, ${ENG_DEMO}, 'objetivo', 'Objetivo')`);
      await rechaza(tx, "INSERT en persona_plans de un plan aprobado", "rls", (sp) => sp`
        insert into app.persona_plans (plan_id, engagement_id, version, contenido) values (${sinCopia.planId}, ${ENG_DEMO}, ${sinCopia.version}, '{"items":[]}'::jsonb)`);
      await rechaza(tx, "INSERT en knowledge_cards", "permiso", (sp) => sp`
        insert into app.knowledge_cards (id, titulo, tipo, contenido, fuente) values ('KC-999', 'T', 'estrategia_fe', 'C', 'F-000')`);
      // UPDATE
      for (const planId of [b.planId, d.planId]) {
        await rechazaOCero(tx, "UPDATE de plans.titulo", (sp) => sp`update app.plans set titulo = 'Cambio' where id = ${planId}`);
        await rechazaOCero(tx, "UPDATE de plans.status", (sp) => sp`update app.plans set status = 'aprobado', version = 999999 where id = ${planId}`);
        await rechazaOCero(tx, "UPDATE de plan_items", (sp) => sp`update app.plan_items set texto_persona = 'Cambio' where plan_id = ${planId}`);
      }
      await rechaza(tx, "UPDATE de persona_plans", "permiso", (sp) => sp`update app.persona_plans set contenido = '{"items":[]}'::jsonb where plan_id = ${d.planId}`);
      await rechaza(tx, "UPDATE de knowledge_cards", "permiso", (sp) => sp`update app.knowledge_cards set verificada = true where id = 'KC-001'`);
      // DELETE
      await rechaza(tx, "DELETE en plans", "permiso", (sp) => sp`delete from app.plans where engagement_id = ${ENG_DEMO}`);
      await rechazaOCero(tx, "DELETE en plan_items", (sp) => sp`delete from app.plan_items where engagement_id = ${ENG_DEMO}`);
      await rechaza(tx, "DELETE en persona_plans", "permiso", (sp) => sp`delete from app.persona_plans where engagement_id = ${ENG_DEMO}`);
      await rechaza(tx, "DELETE en knowledge_cards", "permiso", (sp) => sp`delete from app.knowledge_cards where id = 'KC-001'`);
      await comoOwner(tx);
      for (const t of TABLAS_PLAN) {
        const n = await contar(tx, t, ENG_DEMO);
        revisar(n === antes[t], `${t} cambió de ${antes[t]} a ${n} filas`);
      }
      const [p] = await tx`select status::text as status from app.plans where id = ${b.planId}`;
      revisar(p.status === "borrador", `el borrador quedó en ${p.status}`);
    },
  },

  // ----- 004: seguimiento y señales -----
  {
    id: "CA-004.3",
    descripcion: "sin consentimiento vigente el coach no inserta en sessions ni en las tablas de seguimiento",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await como(tx, PERSONA);
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA}, 'retirado', ${AVISO})`;
      await como(tx, COACH);
      await rechaza(tx, "INSERT en sessions", "rls", (sp) => sp`
        insert into app.sessions (engagement_id, coach_id, nota_original) values (${ENG_DEMO}, ${COACH}, 'Nota sintética')`);
      await rechaza(tx, "INSERT en plan_item_updates", "rls", (sp) => sp`
        insert into app.plan_item_updates (engagement_id, plan_item_id, session_id, event_id, estado, resumen, evidencia, approved_by)
        values (${ENG_DEMO}, ${d.planItemId}, ${d.sessionId}, ${d.eventoId}, 'avanza', 'Avance', '[]'::jsonb, ${COACH})`);
      await rechaza(tx, "INSERT en followup_context", "rls", (sp) => sp`
        insert into app.followup_context (engagement_id, tipo, texto, session_id, event_id, approved_by)
        values (${ENG_DEMO}, 'contexto', 'Contexto', ${d.sessionId}, ${d.eventoId}, ${COACH})`);
      await rechaza(tx, "INSERT en signal_states", "rls", (sp) => sp`
        insert into app.signal_states (engagement_id, tipo, estado, created_by) values (${ENG_DEMO}, 'desajuste_con_rol', 'cerrada', ${COACH})`);
      await rechaza(tx, "INSERT en strong_alerts", "rls", (sp) => sp`
        insert into app.strong_alerts (engagement_id, tipo_senal, event_id, marcada_por) values (${ENG_DEMO}, 'desajuste_con_rol', ${d.eventoId}, ${COACH})`);
    },
  },
  {
    id: "CA-004.6",
    descripcion: "la persona no lee una sesión de tipo red de apoyo",
    correr: async (tx) => {
      await asegurarConsentimientoDemo(tx);
      const [s] = await tx`
        insert into app.sessions (engagement_id, coach_id, nota_original, tipo)
        values (${ENG_DEMO}, ${COACH}, 'Nota sintética de la red de apoyo.', 'red_de_apoyo') returning id`;
      await como(tx, COACH);
      const leidas = await tx`select id from app.sessions where id = ${s.id}`;
      revisar(leidas.length === 1, "el coach no lee la sesión (control)");
      await como(tx, PERSONA);
      await ceroFilas(tx, "la persona lee la sesión", (sp) => sp`select id from app.sessions where id = ${s.id}`);
    },
  },
  {
    id: "CA-004.14",
    descripcion: "cerrar una señal escribe solo en signal_states: sin snapshot nuevo y sin cambiar persona_profiles; el historial no se edita",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      const snapshots = await contar(tx, "profile_snapshots", ENG_DEMO);
      const vistas = await contar(tx, "persona_profiles", ENG_DEMO);
      await como(tx, COACH);
      await acepta(tx, "cerrar la señal", (sp) => sp`
        insert into app.signal_states (engagement_id, tipo, estado, motivo, created_by)
        values (${ENG_DEMO}, 'desajuste_con_rol', 'cerrada', 'Ya no aplica', ${COACH})`);
      await tx`
        insert into app.signal_states (engagement_id, tipo, estado, motivo, created_by)
        values (${ENG_DEMO}, 'desajuste_con_rol', 'cerrada', 'Ya no aplica', ${COACH})`;
      await rechaza(tx, "UPDATE de signal_states", "permiso", (sp) => sp`update app.signal_states set motivo = 'Cambio' where engagement_id = ${ENG_DEMO}`);
      await rechaza(tx, "DELETE de signal_states", "permiso", (sp) => sp`delete from app.signal_states where engagement_id = ${ENG_DEMO}`);
      await rechaza(tx, "UPDATE de plan_item_updates", "permiso", (sp) => sp`update app.plan_item_updates set resumen = 'Cambio' where engagement_id = ${ENG_DEMO}`);
      await rechaza(tx, "DELETE de plan_item_updates", "permiso", (sp) => sp`delete from app.plan_item_updates where engagement_id = ${ENG_DEMO}`);
      await comoOwner(tx);
      revisar((await contar(tx, "profile_snapshots", ENG_DEMO)) === snapshots, "cambió el número de snapshots");
      revisar((await contar(tx, "persona_profiles", ENG_DEMO)) === vistas, "cambió el número de persona_profiles");
    },
  },
  {
    id: "CA-004.16",
    descripcion: "ni otro coach ni la persona crean una alerta fuerte; el coach sí, solo como abierta y a su nombre",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      for (const usuario of [COACH_SIN, PERSONA]) {
        await como(tx, usuario);
        await rechaza(tx, "INSERT en strong_alerts", "rls", (sp) => sp`
          insert into app.strong_alerts (engagement_id, tipo_senal, event_id, marcada_por) values (${ENG_DEMO}, 'cambio_de_vida', ${d.eventoId}, ${usuario})`);
      }
      await como(tx, COACH);
      await acepta(tx, "el coach crea la alerta", (sp) => sp`
        insert into app.strong_alerts (engagement_id, tipo_senal, event_id, marcada_por) values (${ENG_DEMO}, 'cambio_de_vida', ${d.eventoId}, ${COACH})`);
      await rechaza(tx, "la alerta se crea a nombre de otro", "rls", (sp) => sp`
        insert into app.strong_alerts (engagement_id, tipo_senal, event_id, marcada_por) values (${ENG_DEMO}, 'cambio_de_vida', ${d.eventoId}, ${PERSONA})`);
      await rechaza(tx, "la alerta nace atendida", "rls", (sp) => sp`
        insert into app.strong_alerts (engagement_id, tipo_senal, event_id, marcada_por, estado) values (${ENG_DEMO}, 'cambio_de_vida', ${d.eventoId}, ${COACH}, 'atendida')`);
      await rechaza(tx, "dos alertas vigentes del mismo tipo", "unique", (sp) => sp`
        insert into app.strong_alerts (engagement_id, tipo_senal, event_id, marcada_por) values (${ENG_DEMO}, 'estres_desregulacion', ${d.eventoId}, ${COACH})`);
    },
  },
  {
    id: "CA-004.17",
    descripcion: "la persona no lee alertas fuertes ni el estado de las señales",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      await como(tx, PERSONA);
      revisar((await contar(tx, "strong_alerts", ENG_DEMO)) === 0, "la persona lee alertas");
      revisar((await contar(tx, "signal_states", ENG_DEMO)) === 0, "la persona lee el estado de las señales");
      revisar((await contar(tx, "profile_snapshots", ENG_DEMO)) === 0, "la persona lee los snapshots con las señales");
    },
  },
  {
    id: "CA-004.37",
    descripcion: "el coach no hace UPDATE directo de app.engagements.stage; las tablas de esta spec no tienen permiso sobre engagements",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      const antes = await etapa(tx, ENG_DEMO);
      await como(tx, COACH);
      await rechaza(tx, "UPDATE de engagements.stage", "permiso", (sp) => sp`update app.engagements set stage = 'cierre' where id = ${ENG_DEMO}`);
      revisar((await etapa(tx, ENG_DEMO)) === antes, "la etapa cambió");
    },
  },
  {
    id: "CA-004.38",
    descripcion: "la persona no inserta en sessions, avance, contexto, estado de señales ni alertas",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await como(tx, PERSONA);
      await rechaza(tx, "INSERT en sessions", "rls", (sp) => sp`
        insert into app.sessions (engagement_id, coach_id, nota_original) values (${ENG_DEMO}, ${PERSONA}, 'Nota sintética')`);
      await rechaza(tx, "INSERT en plan_item_updates", "rls", (sp) => sp`
        insert into app.plan_item_updates (engagement_id, plan_item_id, session_id, event_id, estado, resumen, evidencia, approved_by)
        values (${ENG_DEMO}, ${d.planItemId}, ${d.sessionId}, ${d.eventoId}, 'avanza', 'Avance', '[]'::jsonb, ${PERSONA})`);
      await rechaza(tx, "INSERT en followup_context", "rls", (sp) => sp`
        insert into app.followup_context (engagement_id, tipo, texto, session_id, event_id, approved_by)
        values (${ENG_DEMO}, 'contexto', 'Contexto', ${d.sessionId}, ${d.eventoId}, ${PERSONA})`);
      await rechaza(tx, "INSERT en signal_states", "rls", (sp) => sp`
        insert into app.signal_states (engagement_id, tipo, estado, created_by) values (${ENG_DEMO}, 'cambio_de_vida', 'cerrada', ${PERSONA})`);
      await rechaza(tx, "INSERT en strong_alerts", "rls", (sp) => sp`
        insert into app.strong_alerts (engagement_id, tipo_senal, event_id, marcada_por) values (${ENG_DEMO}, 'cambio_de_vida', ${d.eventoId}, ${PERSONA})`);
    },
  },
  {
    id: "CA-004.38",
    descripcion: "una fila de avance o de contexto no apunta a otro acompañamiento, y el contexto no nace quitado",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      // El mismo coach con consentimiento en los dos: solo lo detienen las funciones de private.
      await evento(tx, ENG_ALTA, PERSONA_ALTA, "otorgado");
      await como(tx, COACH);
      await rechaza(tx, "avance con la sesión de otro acompañamiento", "rls", (sp) => sp`
        insert into app.plan_item_updates (engagement_id, plan_item_id, session_id, event_id, estado, resumen, evidencia, approved_by)
        values (${ENG_ALTA}, ${d.planItemId}, ${d.sessionId}, ${d.eventoId}, 'avanza', 'Avance', '[]'::jsonb, ${COACH})`);
      await rechaza(tx, "contexto con la sesión de otro acompañamiento", "rls", (sp) => sp`
        insert into app.followup_context (engagement_id, tipo, texto, session_id, event_id, approved_by)
        values (${ENG_ALTA}, 'contexto', 'Contexto', ${d.sessionId}, ${d.eventoId}, ${COACH})`);
      await rechaza(tx, "contexto que nace quitado", "rls", (sp) => sp`
        insert into app.followup_context (engagement_id, tipo, texto, session_id, event_id, approved_by, quitada_por, quitada_en)
        values (${ENG_DEMO}, 'contexto', 'Contexto', ${d.sessionId}, ${d.eventoId}, ${COACH}, ${COACH}, now())`);
      await comoOwner(tx);
      const b = await crearPlan(tx, ENG_DEMO, d.snapshotId, "borrador");
      await como(tx, COACH);
      await rechaza(tx, "avance sobre un ítem de un borrador", "rls", (sp) => sp`
        insert into app.plan_item_updates (engagement_id, plan_item_id, session_id, event_id, estado, resumen, evidencia, approved_by)
        values (${ENG_DEMO}, ${b.itemId}, ${d.sessionId}, ${d.eventoId}, 'avanza', 'Avance', '[]'::jsonb, ${COACH})`);
      await acepta(tx, "contexto ligado a un ítem aprobado", (sp) => sp`
        insert into app.followup_context (engagement_id, tipo, texto, plan_item_id, session_id, event_id, approved_by)
        values (${ENG_DEMO}, 'siguiente_paso', 'Paso', ${d.planItemId}, ${d.sessionId}, ${d.eventoId}, ${COACH})`);
    },
  },
  {
    id: "CA-004.39",
    descripcion: "el coach cambia el estado de su alerta y quita contexto; otro coach no; solo se escriben las columnas permitidas",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      await como(tx, COACH_SIN);
      await ceroFilas(tx, "otro coach escala la alerta", (sp) => sp`update app.strong_alerts set estado = 'escalada', escalada_en = now() where id = ${d.alertaId}`);
      await ceroFilas(tx, "otro coach quita el contexto", (sp) => sp`update app.followup_context set quitada_por = ${COACH_SIN}, quitada_en = now() where id = ${d.contextoId}`);
      await como(tx, PERSONA);
      await ceroFilas(tx, "la persona escala la alerta", (sp) => sp`update app.strong_alerts set estado = 'escalada', escalada_en = now() where id = ${d.alertaId}`);
      await como(tx, COACH);
      await acepta(tx, "el coach escala la alerta", (sp) => sp`update app.strong_alerts set estado = 'escalada', nota_escalada = 'Nota', escalada_en = now() where id = ${d.alertaId}`);
      await rechaza(tx, "editar la nota original de la alerta", "permiso", (sp) => sp`update app.strong_alerts set nota = 'Cambio' where id = ${d.alertaId}`);
      await rechaza(tx, "cambiar el tipo de la alerta", "permiso", (sp) => sp`update app.strong_alerts set tipo_senal = 'cambio_de_vida' where id = ${d.alertaId}`);
      await rechaza(tx, "editar el texto del contexto", "permiso", (sp) => sp`update app.followup_context set texto = 'Cambio' where id = ${d.contextoId}`);
      await rechaza(tx, "quitar el contexto a nombre de otro", "rls", (sp) => sp`update app.followup_context set quitada_por = ${PERSONA}, quitada_en = now() where id = ${d.contextoId}`);
      await tx`update app.followup_context set quitada_por = ${COACH}, quitada_en = now() where id = ${d.contextoId}`;
      await ceroFilas(tx, "volver a quitar lo ya quitado", (sp) => sp`update app.followup_context set quitada_por = ${COACH}, quitada_en = now() where id = ${d.contextoId}`);
    },
  },
  {
    id: "CA-004.47",
    descripcion: "al retirar el consentimiento el coach deja de ver avance, contexto, señales y alertas, y ninguna fila se borra",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      const antes: Record<string, number> = {};
      for (const t of TABLAS_SEGUIMIENTO) antes[t] = await contar(tx, t, ENG_DEMO);
      await como(tx, PERSONA);
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA}, 'retirado', ${AVISO})`;
      await como(tx, COACH);
      for (const t of TABLAS_SEGUIMIENTO) revisar((await contar(tx, t, ENG_DEMO)) === 0, `el coach ve ${t} sin consentimiento`);
      await comoOwner(tx);
      for (const t of TABLAS_SEGUIMIENTO) {
        const n = await contar(tx, t, ENG_DEMO);
        revisar(n === antes[t] && n > 0, `${t} cambió de ${antes[t]} a ${n} filas`);
      }
    },
  },
  {
    id: "CA-004.58",
    descripcion: "con consentimiento, su coach ve las cuatro tablas de seguimiento; la persona y un coach ajeno leen 0 filas",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      await como(tx, COACH);
      for (const t of TABLAS_SEGUIMIENTO) revisar((await contar(tx, t, ENG_DEMO)) > 0, `el coach no ve ${t}`);
      for (const usuario of [PERSONA, COACH_SIN]) {
        await como(tx, usuario);
        for (const t of TABLAS_SEGUIMIENTO) {
          const n = await contar(tx, t, ENG_DEMO);
          revisar(n === 0, `${usuario === PERSONA ? "la persona" : "el coach ajeno"} lee ${n} filas de ${t}`);
        }
      }
    },
  },

  // ----- 005: vista de la persona y "Esto no me representa" (R-005.42) -----
  {
    id: "CA-005.1",
    descripcion: "la persona lee 0 filas de profile_snapshots, sessions y profile_events propuesta_ia, y sí su propio comentario",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      await como(tx, PERSONA);
      revisar((await contar(tx, "profile_snapshots", ENG_DEMO)) === 0, "la persona ve snapshots");
      revisar((await contar(tx, "sessions", ENG_DEMO)) === 0, "la persona ve sesiones");
      revisar((await contar(tx, "profile_events", ENG_DEMO, "and tipo = 'propuesta_ia'")) === 0, "la persona ve propuestas de la IA");
      revisar((await contar(tx, "profile_events", ENG_DEMO, "and tipo = 'no_me_representa'")) > 0, "la persona no ve su comentario (control)");
    },
  },
  {
    id: "CA-005.2",
    descripcion: "con plan vigente la persona lee 0 filas de plans y plan_items, y persona_plans no tiene columnas de evidencia, dominio ni fichas",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      const [{ columnas }] = await tx`
        select string_agg(column_name, ',' order by column_name) as columnas
        from information_schema.columns where table_schema = 'app' and table_name = 'persona_plans'`;
      revisar(columnas === "contenido,created_at,engagement_id,plan_id,version", `columnas de persona_plans: ${columnas}`);
      await como(tx, PERSONA);
      revisar((await contar(tx, "plans", ENG_DEMO)) === 0, "la persona ve plans");
      revisar((await contar(tx, "plan_items", ENG_DEMO)) === 0, "la persona ve plan_items");
      revisar((await contar(tx, "persona_plans", ENG_DEMO)) > 0, "la persona no ve persona_plans (control)");
    },
  },
  {
    id: "CA-005.20",
    descripcion: "un comentario sobre un ítem queda en proposed sin cambiar plans ni persona_plans; en otro acompañamiento la base lo rechaza",
    correr: async (tx) => {
      const datos = await prepararDatosDemo(tx);
      const antes = { plans: await contar(tx, "plans", ENG_DEMO), persona: await contar(tx, "persona_plans", ENG_DEMO) };
      const payload = tx.json({ tipo: "no_me_representa", dimension: null, comentario: "Prueba", origen: "plan", planItemId: datos.planItemId, planVersion: 1 });
      await como(tx, PERSONA);
      await tx`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_DEMO}, 'no_me_representa', 'proposed', ${payload}, ${PERSONA})`;
      await rechaza(tx, "comentario en otro acompañamiento", "rls", (sp) => sp`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_ALTA}, 'no_me_representa', 'proposed', ${payload}, ${PERSONA})`);
      await comoOwner(tx);
      revisar((await contar(tx, "plans", ENG_DEMO)) === antes.plans, "cambió plans");
      revisar((await contar(tx, "persona_plans", ENG_DEMO)) === antes.persona, "cambió persona_plans");
      const [e] = await tx`
        select status::text as status, payload from app.profile_events
        where engagement_id = ${ENG_DEMO} and tipo = 'no_me_representa' and payload ->> 'origen' = 'plan' and created_by = ${PERSONA}
        order by created_at desc limit 1`;
      revisar(e?.status === "proposed", `el comentario quedó ${e?.status}`);
      revisar(e.payload.planItemId === datos.planItemId, "el comentario no guarda el ítem");
    },
  },
  {
    id: "CA-005.31",
    descripcion: "con retirado como último evento la base rechaza el no_me_representa propio; con otorgado lo acepta",
    correr: async (tx) => {
      await asegurarConsentimientoDemo(tx);
      await evento(tx, ENG_DEMO, PERSONA, "retirado");
      await como(tx, PERSONA);
      await rechaza(tx, "no_me_representa con el consentimiento retirado", "rls", (sp) => sp`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_DEMO}, 'no_me_representa', 'proposed', ${NMR("Prueba")}::jsonb, ${PERSONA})`);
      await comoOwner(tx);
      await evento(tx, ENG_DEMO, PERSONA, "otorgado");
      await como(tx, PERSONA);
      await acepta(tx, "no_me_representa con el consentimiento vigente", (sp) => sp`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_DEMO}, 'no_me_representa', 'proposed', ${NMR("Prueba")}::jsonb, ${PERSONA})`);
    },
  },
  {
    id: "CA-005.38",
    descripcion: "un UPDATE de status o resuelto_por_plan de la persona o de un coach ajeno afecta 0 filas; el del coach del acompañamiento se acepta; la persona no puede insertar un comentario con lo que decide el coach (R-005.50)",
    correr: async (tx) => {
      const datos = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      const [c] = await tx`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_DEMO}, 'no_me_representa', 'proposed', ${NMR("Prueba")}::jsonb, ${PERSONA}) returning id`;
      for (const usuario of [PERSONA, COACH_SIN]) {
        await como(tx, usuario);
        await ceroFilas(tx, "UPDATE de status", (sp) => sp`update app.profile_events set status = 'rejected' where id = ${c.id}`);
        await ceroFilas(tx, "UPDATE de resuelto_por_plan", (sp) => sp`update app.profile_events set resuelto_por_plan = ${datos.planId} where id = ${c.id}`);
        await ceroFilas(tx, "UPDATE de resuelto_por_evento", (sp) => sp`update app.profile_events set resuelto_por_evento = ${datos.eventoId} where id = ${c.id}`);
      }
      // R-005.50: al insertar, la persona solo escribe el acompañamiento, el tipo, el estado, el payload y
      // quién lo creó. Los valores son constantes de este archivo o ids sintéticos, nunca una entrada.
      await como(tx, PERSONA);
      const ajenas: [columna: string, valor: string][] = [
        ["decided_by", `'${COACH}'`],
        ["decided_at", "now()"],
        ["approved_payload", `'{"cambios":[0]}'::jsonb`],
        ["resuelto_por_evento", `'${datos.eventoId}'`],
        ["resuelto_por_plan", `'${datos.planId}'`],
        ["session_id", `'${datos.sessionId}'`],
        ["plan_base_id", `'${datos.planId}'`],
        ["perfil_version_base", "1"],
        ["prompt_version", "'inventada'"],
        ["model", "'inventado'"],
        ["created_at", "now() - interval '30 days'"],
      ];
      for (const [columna, valor] of ajenas) {
        await rechaza(tx, `INSERT de la persona con ${columna}`, "rls", (sp) =>
          sp.unsafe(
            `insert into app.profile_events (engagement_id, tipo, status, payload, created_by, ${columna})
             values ('${ENG_DEMO}', 'no_me_representa', 'proposed', '${NMR("Prueba")}'::jsonb, '${PERSONA}', ${valor})`,
          ),
        );
      }
      await acepta(tx, "INSERT de la persona solo con lo suyo", (sp) => sp`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_DEMO}, 'no_me_representa', 'proposed', ${NMR("Prueba")}::jsonb, ${PERSONA})`);
      await como(tx, COACH);
      await acepta(tx, "UPDATE del coach", (sp) => sp`
        update app.profile_events set status = 'approved', decided_by = ${COACH}, decided_at = now(), resuelto_por_plan = ${datos.planId} where id = ${c.id}`);
      await acepta(tx, "UPDATE del coach con la propuesta", (sp) => sp`
        update app.profile_events set status = 'approved', decided_by = ${COACH}, decided_at = now(), resuelto_por_evento = ${datos.eventoId} where id = ${c.id}`);
    },
  },

  // ----- 008: trayectoria de función ejecutiva (R-008.45) -----
  {
    id: "CA-008.9",
    descripcion: "como authenticated, un UPDATE de profile_events.payload es rechazado: el id de una evidencia no cambia (R-008.11)",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const [antes] = await tx`select payload from app.profile_events where id = ${d.eventoId}`;
      await como(tx, COACH);
      await rechaza(tx, "UPDATE de payload", "permiso", (sp) => sp`update app.profile_events set payload = '{}'::jsonb where id = ${d.eventoId}`);
      await comoOwner(tx);
      const [despues] = await tx`select payload from app.profile_events where id = ${d.eventoId}`;
      revisar(JSON.stringify(despues.payload) === JSON.stringify(antes.payload), "cambió el payload");
    },
  },
  {
    id: "CA-008.39",
    descripcion: "con una fila en cada tabla nueva, su coach las ve; la persona y un coach ajeno reciben 0 filas y no pueden insertar",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      await como(tx, COACH);
      for (const t of TABLAS_TRAYECTORIA) revisar((await contar(tx, t, ENG_DEMO)) > 0, `el coach no ve ${t}`);
      for (const usuario of [PERSONA, COACH_SIN]) {
        await comoOwner(tx);
        await como(tx, usuario);
        for (const t of TABLAS_TRAYECTORIA) revisar((await contar(tx, t, ENG_DEMO)) === 0, `${usuario} ve ${t}`);
        await rechaza(tx, `corrección de ${usuario}`, "rls", (sp) => sp`
          insert into app.fe_corrections (engagement_id, event_id, linea_id, dominio, direccion, created_by)
          values (${ENG_DEMO}, ${d.eventoId}, ${d.lineaId}, 'flexibilidad', null, ${usuario})`);
        await rechaza(tx, `resumen de ${usuario}`, "rls", (sp) => sp`
          insert into app.fe_domain_summaries (engagement_id, dominio, texto, linea_ids, bloque_ids, prompt_version, model, created_by)
          values (${ENG_DEMO}, 'flexibilidad', 'Sintético.', ${sp.json([d.lineaId])}, ${sp.json([d.lineaId])}, ${PROMPT_RESUMEN}, 'rls-check', ${usuario})`);
      }
      await comoOwner(tx);
      await como(tx, COACH);
      await acepta(tx, "corrección del coach", (sp) => sp`
        insert into app.fe_corrections (engagement_id, event_id, linea_id, dominio, direccion, created_by)
        values (${ENG_DEMO}, ${d.eventoId}, ${d.lineaId}, 'flexibilidad', null, ${COACH})`);
      await acepta(tx, "resumen del coach", (sp) => sp`
        insert into app.fe_domain_summaries (engagement_id, dominio, texto, linea_ids, bloque_ids, prompt_version, model, created_by)
        values (${ENG_DEMO}, 'flexibilidad', 'Sintético.', ${sp.json([d.lineaId])}, ${sp.json([d.lineaId])}, ${PROMPT_RESUMEN}, 'rls-check', ${COACH})`);
    },
  },
  {
    id: "CA-008.40",
    descripcion: "el coach no edita ni borra correcciones, no cambia el texto ni un resumen ya aprobado, y una corrección ajena a su evento se rechaza",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      // Un evento sin aprobar del mismo acompañamiento y uno aprobado de otro.
      const payload = { tipo: "propuesta_ia", update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] }, descartados: [], banderas: [] };
      const [sinAprobar] = await tx`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_DEMO}, 'propuesta_ia', 'proposed', ${tx.json(payload)}, ${COACH}) returning id`;
      const [ajeno] = await tx`
        insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
        values (${ENG_ALTA}, 'propuesta_ia', 'approved', ${tx.json(payload)}, ${COACH}) returning id`;
      const [propuesto] = await tx`
        insert into app.fe_domain_summaries (engagement_id, dominio, texto, linea_ids, bloque_ids, prompt_version, model, created_by)
        values (${ENG_DEMO}, 'flexibilidad', 'Sintético.', ${tx.json([d.lineaId])}, ${tx.json([d.lineaId])}, ${PROMPT_RESUMEN}, 'rls-check', ${COACH}) returning id`;

      await como(tx, COACH);
      await rechazaOCero(tx, "UPDATE de una corrección", (sp) => sp`update app.fe_corrections set dominio = 'flexibilidad' where engagement_id = ${ENG_DEMO}`);
      await rechazaOCero(tx, "DELETE de una corrección", (sp) => sp`delete from app.fe_corrections where engagement_id = ${ENG_DEMO}`);
      await rechazaOCero(tx, "UPDATE de texto", (sp) => sp`update app.fe_domain_summaries set texto = 'Otro.' where id = ${propuesto.id}`);
      await rechazaOCero(tx, "DELETE de un resumen", (sp) => sp`delete from app.fe_domain_summaries where id = ${propuesto.id}`);
      await rechazaOCero(tx, "cambiar un resumen ya aprobado", (sp) => sp`
        update app.fe_domain_summaries set estado = 'descartado', decided_by = ${COACH}, decided_at = now() where id = ${d.resumenId}`);
      await rechaza(tx, "aprobar a nombre de otro", "rls", (sp) => sp`
        update app.fe_domain_summaries set estado = 'aprobado', decided_by = ${PERSONA}, decided_at = now() where id = ${propuesto.id}`);
      await rechaza(tx, "dejar la decisión en propuesto", "rls", (sp) => sp`
        update app.fe_domain_summaries set estado = 'propuesto', decided_by = ${COACH} where id = ${propuesto.id}`);
      await rechaza(tx, "insertar un resumen ya aprobado", "rls", (sp) => sp`
        insert into app.fe_domain_summaries (engagement_id, dominio, texto, linea_ids, bloque_ids, estado, prompt_version, model, created_by)
        values (${ENG_DEMO}, 'inhibicion', 'Sintético.', ${sp.json([d.lineaId])}, ${sp.json([d.lineaId])}, 'aprobado', ${PROMPT_RESUMEN}, 'rls-check', ${COACH})`);
      await rechaza(tx, "segunda propuesta abierta en el mismo dominio", "unique", (sp) => sp`
        insert into app.fe_domain_summaries (engagement_id, dominio, texto, linea_ids, bloque_ids, prompt_version, model, created_by)
        values (${ENG_DEMO}, 'flexibilidad', 'Otra.', ${sp.json([d.lineaId])}, ${sp.json([d.lineaId])}, ${PROMPT_RESUMEN}, 'rls-check', ${COACH})`);
      await acepta(tx, "aprobar la propuesta", (sp) => sp`
        update app.fe_domain_summaries set estado = 'aprobado', decided_by = ${COACH}, decided_at = now() where id = ${propuesto.id}`);

      const correccion = (sp: Tx, eventId: string, lineaId: string, dominio: string | null = "flexibilidad", direccion: string | null = null, anterior: string | null = null) => sp`
        insert into app.fe_corrections (engagement_id, event_id, linea_id, dominio, direccion, anterior_linea_id, created_by)
        values (${ENG_DEMO}, ${eventId}, ${lineaId}, ${dominio}, ${direccion}, ${anterior}, ${COACH})`;
      await rechaza(tx, "corrección con el evento de otro acompañamiento", "rls", (sp) => correccion(sp, ajeno.id as string, `${ajeno.id}:cambios[0].evidencia[0]`));
      await rechaza(tx, "corrección de un evento sin aprobar", "rls", (sp) => correccion(sp, sinAprobar.id as string, `${sinAprobar.id}:cambios[0].evidencia[0]`));
      await rechaza(tx, "corrección con un linea_id de otro evento", "check", (sp) => correccion(sp, d.eventoId, `${sinAprobar.id}:cambios[0].evidencia[0]`));
      await rechaza(tx, "dirección sin dominio", "check", (sp) => correccion(sp, d.eventoId, d.lineaId, null, "apoyo"));
      await rechaza(tx, "cambio sin la línea anterior", "check", (sp) => correccion(sp, d.eventoId, d.lineaId, "flexibilidad", "cambio"));
      await rechaza(tx, "otra dirección con línea anterior", "check", (sp) => correccion(sp, d.eventoId, d.lineaId, "flexibilidad", "apoyo", d.lineaId));
      await rechaza(tx, "sin dirección con línea anterior", "check", (sp) => correccion(sp, d.eventoId, d.lineaId, "flexibilidad", null, d.lineaId));
      await acepta(tx, "corrección válida", (sp) => correccion(sp, d.eventoId, d.lineaId, "flexibilidad", "cambio", d.lineaId));
      await acepta(tx, "corrección a Ninguno", (sp) => correccion(sp, d.eventoId, d.lineaId, null, null));
    },
  },
  {
    id: "CA-008.41",
    descripcion: "persona_profiles no cambia de columnas, ninguna política de las tablas nuevas menciona a la persona y ella lee 0 filas",
    correr: async (tx) => {
      await prepararDatosDemo(tx);
      const [{ columnas }] = await tx`
        select string_agg(column_name, ',' order by column_name) as columnas
        from information_schema.columns where table_schema = 'app' and table_name = 'persona_profiles'`;
      revisar(columnas === "contenido,created_at,engagement_id,snapshot_id,version", `columnas de persona_profiles: ${columnas}`);
      const [{ n }] = await tx`
        select count(*)::int as n from pg_policies
        where schemaname = 'app' and tablename = any(${TABLAS_TRAYECTORIA}::text[]) and (qual ilike '%persona_of%' or with_check ilike '%persona_of%')`;
      revisar(n === 0, `${n} políticas de las tablas nuevas mencionan a la persona`);
      await como(tx, PERSONA);
      for (const t of TABLAS_TRAYECTORIA) revisar((await contar(tx, t, ENG_DEMO)) === 0, `la persona ve ${t}`);
    },
  },
  {
    id: "CA-008.43",
    descripcion: "con el consentimiento retirado el coach recibe 0 filas de las tablas nuevas, no inserta y como owner las filas siguen",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const antes = { c: await contar(tx, "fe_corrections", ENG_DEMO), r: await contar(tx, "fe_domain_summaries", ENG_DEMO) };
      await evento(tx, ENG_DEMO, PERSONA, "retirado");
      await como(tx, COACH);
      for (const t of TABLAS_TRAYECTORIA) revisar((await contar(tx, t, ENG_DEMO)) === 0, `el coach ve ${t} sin consentimiento`);
      await rechaza(tx, "corrección sin consentimiento", "rls", (sp) => sp`
        insert into app.fe_corrections (engagement_id, event_id, linea_id, dominio, direccion, created_by)
        values (${ENG_DEMO}, ${d.eventoId}, ${d.lineaId}, 'flexibilidad', null, ${COACH})`);
      await rechaza(tx, "resumen sin consentimiento", "rls", (sp) => sp`
        insert into app.fe_domain_summaries (engagement_id, dominio, texto, linea_ids, bloque_ids, prompt_version, model, created_by)
        values (${ENG_DEMO}, 'flexibilidad', 'Sintético.', ${sp.json([d.lineaId])}, ${sp.json([d.lineaId])}, ${PROMPT_RESUMEN}, 'rls-check', ${COACH})`);
      await comoOwner(tx);
      revisar((await contar(tx, "fe_corrections", ENG_DEMO)) === antes.c, "se borraron correcciones");
      revisar((await contar(tx, "fe_domain_summaries", ENG_DEMO)) === antes.r, "se borraron resúmenes");
    },
  },

  // ----- Spec 009: "Cómo trabajar conmigo" (tarea 7) -----
  {
    id: "CA-009.2",
    descripcion: "el coach no lee un borrador; cuando la persona lo marca lista, recibe esa fila",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const coachLee = (sp: Tx) => sp`select id from app.shared_guides where id = ${d.guiaBorradorId}`;
      await como(tx, COACH);
      await ceroFilas(tx, "el coach lee el borrador", coachLee);
      await como(tx, PERSONA);
      await acepta(tx, "la persona lee su borrador", coachLee);
      await marcarLista(tx, d.guiaBorradorId, d.guiaListaVersion + 1);
      await como(tx, COACH);
      await acepta(tx, "el coach lee la versión lista", coachLee);
    },
  },
  {
    id: "CA-009.3",
    descripcion: "el coach no lee el borrador que él mismo insertó, y un insert suyo con returning falla",
    correr: async (tx) => {
      await asegurarConsentimientoDemo(tx);
      const { id: snapshotId } = await crearSnapshot(tx, ENG_DEMO);
      const id = randomUUID();
      await como(tx, COACH);
      await rechaza(tx, "insert del coach con returning", "rls", (sp) => sp`
        insert into app.shared_guides (id, engagement_id, nombre_a_mostrar, lineas, generada_desde_snapshot_id, perfil_version, plan_version, generada_por)
        values (${id}, ${ENG_DEMO}, 'Nombre sintético', '[]'::jsonb, ${snapshotId}, 1, 1, ${COACH}) returning id`);
      await pedirBorrador(tx, { id, engagementId: ENG_DEMO, snapshotId, generadaPor: COACH });
      await ceroFilas(tx, "el coach lee lo que insertó", (sp) => sp`select id from app.shared_guides where id = ${id}`);
      await como(tx, PERSONA);
      const filas = await tx`select generada_por from app.shared_guides where id = ${id}`;
      revisar(filas[0]?.generada_por === COACH, "la persona no ve quién pidió el borrador");
    },
  },
  {
    id: "CA-009.6",
    descripcion: "con el consentimiento retirado nadie ve ni escribe la guía y las filas siguen; al darlo otra vez se ven iguales",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const leer = (sp: Tx) => sp`select id, estado::text as estado, version, nombre_a_mostrar, lineas, documento from app.shared_guides where engagement_id = ${ENG_DEMO} order by id`;
      await como(tx, PERSONA);
      const antes = JSON.stringify(await leer(tx));
      revisar(JSON.parse(antes).length >= 2, "la persona no ve sus guías con consentimiento (control)");
      await comoOwner(tx);
      await evento(tx, ENG_DEMO, PERSONA, "retirado");
      for (const usuario of [PERSONA, COACH]) {
        await como(tx, usuario);
        revisar((await contar(tx, "shared_guides", ENG_DEMO)) === 0, `${usuario} ve guías sin consentimiento`);
      }
      await como(tx, PERSONA);
      await ceroFilas(tx, "la persona decide líneas sin consentimiento", (sp) => sp`update app.shared_guides set lineas = '[]'::jsonb where id = ${d.guiaBorradorId}`);
      await comoOwner(tx);
      revisar(JSON.stringify(await leer(tx)) === antes, "como owner las filas cambiaron");
      await evento(tx, ENG_DEMO, PERSONA, "otorgado");
      await como(tx, PERSONA);
      revisar(JSON.stringify(await leer(tx)) === antes, "al dar el consentimiento otra vez las filas no se ven iguales");
      await como(tx, COACH);
      await acepta(tx, "el coach vuelve a ver la versión lista", (sp) => sp`select id from app.shared_guides where id = ${d.guiaListaId}`);
    },
  },
  {
    id: "CA-009.12",
    descripcion: "la persona lee 0 filas de plans, plan_items y snapshots; app_guia_insumos da lo de la spec solo a la persona y al coach con consentimiento",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      // Un perfil vigente con citas en una dimensión y en una señal, y un ítem con cita, dominio y ficha.
      const { id: snapshotId, version: perfilVersion } = await crearSnapshot(tx, ENG_DEMO);
      const conCitas = {
        dimensiones: { retroalimentacion: { resumen: "Resumen.", tipo: "contexto", dominiosFE: ["iniciacion"], evidencia: [{ cita: "Cita de dimensión de rls-check", sessionId: d.sessionId }] } },
        senalesActivas: [{ tipo: "cambio_de_vida", evidencia: [{ cita: "Cita de señal de rls-check", sessionId: d.sessionId }] }],
      };
      await tx`update app.profile_snapshots set perfil = ${json(tx, conCitas)} where id = ${snapshotId}`;
      const contenido = { dimensiones: { retroalimentacion: { resumen: "Resumen.", tipo: "contexto" } } };
      await tx`insert into app.persona_profiles (snapshot_id, engagement_id, version, contenido) values (${snapshotId}, ${ENG_DEMO}, ${perfilVersion}, ${json(tx, contenido)})`;
      await tx`
        update app.plan_items set dominio_fe = 'iniciacion', evidencia = ${json(tx, [{ cita: "Cita de ítem de rls-check", sessionId: d.sessionId }])}
        where id = ${d.planItemId}`;

      await como(tx, PERSONA);
      for (const t of ["plans", "plan_items", "profile_snapshots"]) revisar((await contar(tx, t, ENG_DEMO)) === 0, `la persona lee ${t}`);

      for (const usuario of [PERSONA, COACH]) {
        await como(tx, usuario);
        const insumos = InsumosGuia.parse(await insumosDeGuia(tx, ENG_DEMO));
        revisar(insumos.snapshotId === snapshotId && insumos.perfilVersion === perfilVersion, "no trae el último perfil");
        revisar(insumos.items.some((i) => i.id === d.planItemId), "no trae el ítem del plan vigente");
        revisar(insumos.origenes.some((o) => o.id === d.planItemId), "no trae los orígenes de los planes aprobados");
        revisar(insumos.itemsBase.length === 0, "sin versión base, itemsBase va vacío");
        for (const cita of ["Cita de dimensión de rls-check", "Cita de señal de rls-check", "Cita de ítem de rls-check"]) revisar(insumos.citas.includes(cita), `falta: ${cita}`);
        revisar(insumos.hayBorrador && insumos.hayVersiones, "los booleanos no reflejan el borrador y la versión");
        const texto = JSON.stringify({ ...insumos, citas: [] });
        for (const fuera of ["iniciacion", "dominio", "evidencia", "knowledge", "nota_original", "cedula"]) revisar(!texto.includes(fuera), `trae ${fuera}`);
      }
      await como(tx, COACH);
      const conBase = InsumosGuia.parse(await insumosDeGuia(tx, ENG_DEMO, InsumosGuia.parse(await insumosDeGuia(tx, ENG_DEMO)).planVersion));
      revisar(conBase.itemsBase.some((i) => i.id === d.planItemId), "itemsBase no trae la versión pedida");

      // Null: acompañamiento ajeno, coach ajeno, sin consentimiento.
      await comoOwner(tx);
      await crearCoachSin(tx);
      await como(tx, PERSONA);
      revisar((await insumosDeGuia(tx, ENG_ALTA)) === null, "la persona recibe insumos de otro acompañamiento");
      await como(tx, PERSONA_ALTA);
      revisar((await insumosDeGuia(tx, ENG_DEMO)) === null, "otra persona recibe insumos");
      await como(tx, COACH_SIN);
      revisar((await insumosDeGuia(tx, ENG_DEMO)) === null, "un coach ajeno recibe insumos");
      await comoOwner(tx);
      await evento(tx, ENG_DEMO, PERSONA, "retirado");
      for (const usuario of [PERSONA, COACH]) {
        await como(tx, usuario);
        revisar((await insumosDeGuia(tx, ENG_DEMO)) === null, `${usuario} recibe insumos sin consentimiento`);
      }
      await como(tx, COACH);
      revisar((await insumosDeGuia(tx, ENG_ALTA)) === null, "el coach recibe insumos del acompañamiento sin consentimiento");
    },
  },
  {
    id: "CA-009.12",
    descripcion: "hayBorrador y hayVersiones: un descartado no cuenta y una retirada sí; las funciones no tienen execute para public ni anon",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await tx`delete from app.shared_guides where engagement_id = ${ENG_DEMO}`;
      const booleanos = async () => {
        await como(tx, COACH);
        const i = InsumosGuia.parse(await insumosDeGuia(tx, ENG_DEMO));
        await comoOwner(tx);
        return `${i.hayBorrador},${i.hayVersiones}`;
      };
      // El contenido '{}' de prepararDatosDemo no es un perfil válido: aquí no importa cuál sea el perfil.
      await tx`update app.persona_profiles set contenido = '{"dimensiones":{}}'::jsonb where engagement_id = ${ENG_DEMO}`;
      revisar((await booleanos()) === "false,false", "sin guías");
      await crearGuia(tx, ENG_DEMO, d.snapshotId, "descartada");
      revisar((await booleanos()) === "false,false", "un descartado no es borrador ni versión");
      await crearGuia(tx, ENG_DEMO, d.snapshotId, "borrador");
      revisar((await booleanos()) === "true,false", "un borrador no es versión");
      await crearGuia(tx, ENG_DEMO, d.snapshotId, "retirada");
      revisar((await booleanos()) === "true,true", "una retirada cuenta como versión");
      const permisos = await tx`
        select grantee, routine_name from information_schema.routine_privileges
        where routine_schema = 'private' and privilege_type = 'EXECUTE' and grantee in ('PUBLIC', 'anon')
          and routine_name in ('app_guia_insumos', 'app_snapshot_del_acompanamiento', 'app_guia_del_acompanamiento', 'app_shared_guide_transicion')`;
      revisar(permisos.length === 0, `con execute: ${permisos.map((p) => `${p.grantee} ${p.routine_name}`).join(", ")}`);
    },
  },
  {
    id: "CA-009.21",
    descripcion: "un segundo borrador en el mismo acompañamiento lo rechaza el índice único (23505), también para el coach",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await como(tx, PERSONA);
      await rechaza(tx, "segundo borrador de la persona", "unique", (sp) => pedirBorrador(sp, { engagementId: ENG_DEMO, snapshotId: d.snapshotId, generadaPor: PERSONA }));
      await como(tx, COACH);
      await rechaza(tx, "segundo borrador del coach", "unique", (sp) => pedirBorrador(sp, { engagementId: ENG_DEMO, snapshotId: d.snapshotId, generadaPor: COACH }));
    },
  },
  {
    id: "CA-009.22",
    descripcion: "el trigger no deja marcar lista una guía con líneas pendientes o con un cambio sin decidir",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const cambioPendiente = { tipo: "cambia", textoAnterior: "Texto anterior.", antesQuitada: false, decision: "pendiente" };
      const version = d.guiaListaVersion + 1;
      await como(tx, PERSONA);
      await tx`update app.shared_guides set lineas = ${json(tx, [lineaGuia("incluida"), lineaGuia("pendiente", { orden: 1 })])} where id = ${d.guiaBorradorId}`;
      await rechaza(tx, "lista con una línea pendiente", "check", (sp) => marcarLista(sp, d.guiaBorradorId, version));
      await tx`update app.shared_guides set lineas = ${json(tx, [lineaGuia("editada", { cambio: cambioPendiente })])} where id = ${d.guiaBorradorId}`;
      await rechaza(tx, "lista con un cambio sin decidir", "check", (sp) => marcarLista(sp, d.guiaBorradorId, version));
      await tx`update app.shared_guides set lineas = ${json(tx, [lineaGuia("editada", { cambio: { ...cambioPendiente, decision: "rechazado" } })])} where id = ${d.guiaBorradorId}`;
      await rechaza(tx, "lista sin versión", "check", (sp) => sp`update app.shared_guides set estado = 'lista', documento = ${json(sp, DOCUMENTO_GUIA)} where id = ${d.guiaBorradorId}`);
      await rechaza(tx, "lista sin documento", "check", (sp) => sp`update app.shared_guides set estado = 'lista', version = ${version} where id = ${d.guiaBorradorId}`);
      await rechaza(tx, "lista cambiando también las líneas", "check", (sp) => sp`
        update app.shared_guides set estado = 'lista', version = ${version}, documento = ${json(sp, DOCUMENTO_GUIA)}, lineas = '[]'::jsonb where id = ${d.guiaBorradorId}`);
      await rechaza(tx, "lista con una versión que ya existe", "unique", (sp) => marcarLista(sp, d.guiaBorradorId, d.guiaListaVersion));
      await acepta(tx, "lista con todo decidido", (sp) => marcarLista(sp, d.guiaBorradorId, version));
    },
  },
  {
    id: "CA-009.32",
    descripcion: "una versión lista no se edita: el trigger rechaza a la persona, y el coach recibe 0 filas en cualquier UPDATE y al bloquear",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const politicas = (await tx`select policyname from pg_policies where schemaname = 'app' and tablename = 'shared_guides' order by policyname`).map((p) => p.policyname).join(",");
      revisar(
        politicas === "shared_guides_insert_coach,shared_guides_insert_persona,shared_guides_select_coach,shared_guides_select_persona,shared_guides_update_persona",
        `políticas de shared_guides: ${politicas}`,
      );
      const id = d.guiaListaId;
      const intentos: [string, (sp: Tx) => Promise<postgres.RowList<Row[]>>][] = [
        ["lineas", (sp) => sp`update app.shared_guides set lineas = '[]'::jsonb where id = ${id}`],
        ["documento", (sp) => sp`update app.shared_guides set documento = '{"nombre":"Otro","secciones":[]}'::jsonb where id = ${id}`],
        ["nombre_a_mostrar", (sp) => sp`update app.shared_guides set nombre_a_mostrar = 'Otro' where id = ${id}`],
        ["version", (sp) => sp`update app.shared_guides set version = 999999 where id = ${id}`],
        ["regresar a borrador", (sp) => sp`update app.shared_guides set estado = 'borrador' where id = ${id}`],
        ["descartar", (sp) => sp`update app.shared_guides set estado = 'descartada' where id = ${id}`],
        ["sin cambios", (sp) => sp`update app.shared_guides set estado = 'lista' where id = ${id}`],
        ["retirar y cambiar otra cosa", (sp) => sp`update app.shared_guides set estado = 'retirada', nombre_a_mostrar = 'Otro' where id = ${id}`],
      ];
      await como(tx, PERSONA);
      for (const [que, consulta] of intentos) await rechaza(tx, `la persona cambia ${que} de una versión lista`, "check", consulta);
      await rechaza(tx, "la persona escribe aprobada_por_persona_en", "permiso", (sp) => sp`update app.shared_guides set aprobada_por_persona_en = now() where id = ${id}`);
      await rechaza(tx, "la persona escribe descartes", "permiso", (sp) => sp`update app.shared_guides set descartes = '{}'::jsonb where id = ${d.guiaBorradorId}`);
      await rechaza(tx, "la persona borra su guía", "permiso", (sp) => sp`delete from app.shared_guides where id = ${id}`);
      // R-009.46: en una versión solo cambia la huella de lo ya revisado, y sola.
      await rechaza(tx, "la huella junto con otra columna", "check", (sp) => sp`update app.shared_guides set revisada_sin_cambios = 'otra', nombre_a_mostrar = 'Otro' where id = ${id}`);
      await rechaza(tx, "la huella en un borrador", "check", (sp) => sp`update app.shared_guides set revisada_sin_cambios = 'una' where id = ${d.guiaBorradorId}`);
      await acepta(tx, "la persona anota la huella de lo ya revisado", (sp) => sp`update app.shared_guides set revisada_sin_cambios = 'una' where id = ${id} returning id`);
      // Un borrador solo cambia lineas y nombre_a_mostrar.
      await rechaza(tx, "version en un borrador", "check", (sp) => sp`update app.shared_guides set version = 999999 where id = ${d.guiaBorradorId}`);
      await rechaza(tx, "documento en un borrador", "check", (sp) => sp`update app.shared_guides set documento = ${json(sp, DOCUMENTO_GUIA)} where id = ${d.guiaBorradorId}`);

      await como(tx, COACH);
      await acepta(tx, "el coach lee la versión lista (control)", (sp) => sp`select id from app.shared_guides where id = ${id}`);
      for (const [que, consulta] of intentos) await ceroFilas(tx, `el coach cambia ${que}`, consulta);
      await ceroFilas(tx, "el coach retira", (sp) => sp`update app.shared_guides set estado = 'retirada' where id = ${id}`);
      await ceroFilas(tx, "el coach bloquea la fila", (sp) => sp`select id from app.shared_guides where id = ${id} for update`);
      await rechaza(tx, "el coach borra", "permiso", (sp) => sp`delete from app.shared_guides where id = ${id}`);

      // El trigger también vale como owner: no es una regla solo de la sesión.
      await comoOwner(tx);
      await rechaza(tx, "el owner regresa una lista a borrador", "check", (sp) => sp`update app.shared_guides set estado = 'borrador' where id = ${id}`);
    },
  },
  {
    id: "CA-009.33",
    descripcion: "un coach ajeno recibe 0 filas, también de versiones listas, y no inserta",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      await como(tx, COACH_SIN);
      await ceroFilas(tx, "el coach ajeno lee guías", (sp) => sp`select id from app.shared_guides where engagement_id = ${ENG_DEMO}`);
      await ceroFilas(tx, "el coach ajeno actualiza", (sp) => sp`update app.shared_guides set lineas = '[]'::jsonb where id = ${d.guiaListaId}`);
      await rechaza(tx, "el coach ajeno pide un borrador", "rls", (sp) => pedirBorrador(sp, { engagementId: ENG_DEMO, snapshotId: d.snapshotId, generadaPor: COACH_SIN }));
    },
  },
  {
    id: "CA-009.35",
    descripcion: "al retirar una versión el coach deja de leerla, la persona la ve como retirada, no se deshace y la fila sigue",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const id = d.guiaListaId;
      await como(tx, PERSONA);
      await tx`update app.shared_guides set estado = 'retirada' where id = ${id}`;
      const [mia] = await tx`select estado::text as estado, retirada_en from app.shared_guides where id = ${id}`;
      revisar(mia?.estado === "retirada" && mia.retirada_en !== null, "la persona no la ve como retirada con su fecha");
      await rechaza(tx, "volver a marcarla lista", "check", (sp) => sp`update app.shared_guides set estado = 'lista' where id = ${id}`);
      await como(tx, COACH);
      await ceroFilas(tx, "el coach lee la retirada", (sp) => sp`select id from app.shared_guides where id = ${id}`);
      await comoOwner(tx);
      const [{ n }] = await tx`select count(*)::int as n from app.shared_guides where id = ${id}`;
      revisar(n === 1, "se borró la fila");
    },
  },
  {
    id: "CA-009.36",
    descripcion: "con dos versiones listas, si la persona retira la más alta, el coach sigue leyendo la anterior; una nueva no retira las anteriores",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const segunda = await crearGuia(tx, ENG_DEMO, d.snapshotId, "lista", { base: d.guiaListaId });
      const versiones = async () => (await tx`select version from app.shared_guides where engagement_id = ${ENG_DEMO}`).map((r) => r.version as number);
      await como(tx, COACH);
      const antes = await versiones();
      revisar(antes.includes(d.guiaListaVersion) && antes.includes(segunda.version as number), "una versión nueva retiró a la anterior");
      await como(tx, PERSONA);
      await tx`update app.shared_guides set estado = 'retirada' where id = ${segunda.id}`;
      await como(tx, COACH);
      const despues = await versiones();
      revisar(!despues.includes(segunda.version as number), "el coach sigue leyendo la retirada");
      revisar(Math.max(...despues) === d.guiaListaVersion, "el coach no ve la anterior como la más alta");
    },
  },
  {
    id: "CA-009.55",
    descripcion: "el trigger no deja marcar lista una guía con más de 20 líneas incluidas; con 20 sí, y las quitadas no cuentan",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const version = d.guiaListaVersion + 1;
      const conEstados = (estados: EstadoLineaGuia[]) => json(tx, estados.map((e, orden) => lineaGuia(e, { orden })));
      const repetir = (e: EstadoLineaGuia, n: number) => Array<EstadoLineaGuia>(n).fill(e);
      await como(tx, PERSONA);
      await tx`update app.shared_guides set lineas = ${conEstados([...repetir("incluida", 19), "editada", "propia"])} where id = ${d.guiaBorradorId}`;
      await rechaza(tx, "lista con 21 líneas", "check", (sp) => marcarLista(sp, d.guiaBorradorId, version));
      await tx`update app.shared_guides set lineas = ${conEstados([...repetir("incluida", 19), "propia", ...repetir("quitada", 3)])} where id = ${d.guiaBorradorId}`;
      await acepta(tx, "lista con 20 líneas y 3 quitadas", (sp) => marcarLista(sp, d.guiaBorradorId, version));
    },
  },
  {
    id: "CA-009.57",
    descripcion: "una guía no apunta a un snapshot ni a una versión de otro acompañamiento, ni a un descartado; el coach no pone base",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const ajeno = await crearSnapshot(tx, ENG_ALTA);
      const guiaAjena = await crearGuia(tx, ENG_ALTA, ajeno.id, "lista", { generadaPor: PERSONA_ALTA });
      // Sin borrador abierto: lo aceptado en este caso no debe chocar con el índice único.
      await tx`update app.shared_guides set estado = 'descartada' where id = ${d.guiaBorradorId}`;
      const pedir = (sp: Tx, generadaPor: string, snapshotId: string, base: string | null = null) => pedirBorrador(sp, { engagementId: ENG_DEMO, snapshotId, generadaPor, base });

      await como(tx, PERSONA);
      await rechaza(tx, "la persona con un snapshot de otro acompañamiento", "rls", (sp) => pedir(sp, PERSONA, ajeno.id));
      await rechaza(tx, "la persona con una base de otro acompañamiento", "rls", (sp) => pedir(sp, PERSONA, d.snapshotId, guiaAjena.id));
      await rechaza(tx, "la persona con un descartado como base", "rls", (sp) => pedir(sp, PERSONA, d.snapshotId, d.guiaBorradorId));
      await acepta(tx, "la persona con una versión suya como base", (sp) => pedir(sp, PERSONA, d.snapshotId, d.guiaListaId));

      await como(tx, COACH);
      await rechaza(tx, "el coach con un snapshot de otro acompañamiento", "rls", (sp) => pedir(sp, COACH, ajeno.id));
      await rechaza(tx, "el coach con cualquier base", "rls", (sp) => pedir(sp, COACH, d.snapshotId, d.guiaListaId));
      await acepta(tx, "el coach sin base", (sp) => pedir(sp, COACH, d.snapshotId));
    },
  },

  // ----- 010: desglose de tareas -----
  {
    id: "CA-010.4",
    descripcion: "app_perfil_para_desglose da las dimensiones del último snapshot, sin evidencia ni señales; la persona sigue sin leer profile_snapshots; ajenos, sin consentimiento o sin dimensiones reciben 0 filas",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      // El último snapshot manda. crearSnapshot arma uno sin dimensiones, para el último caso.
      const [{ v }] = await tx`select coalesce(max(version), 0)::int + 1 as v from app.profile_snapshots where engagement_id = ${ENG_DEMO}`;
      await tx`
        insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
        values (${ENG_DEMO}, ${v}, ${json(tx, { dimensiones: { concentracion: { resumen: "De un snapshot anterior.", tipo: "fortaleza", dominiosFE: [] } }, senalesActivas: [] })}, ${d.eventoId}, ${COACH})`;
      const [ultimo] = await tx`
        insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
        values (${ENG_DEMO}, ${(v as number) + 1}, ${json(tx, perfilConDimensiones(d.eventoId, d.sessionId))}, ${d.eventoId}, ${COACH}) returning id, version`;

      for (const usuario of [PERSONA, COACH]) {
        await como(tx, usuario);
        const filas = await perfilParaDesglose(tx, ENG_DEMO);
        revisar(filas.length === 3, `recibió ${filas.length} filas`);
        revisar(Object.keys(filas[0]).sort().join(",") === "dimension,dominios_fe,resumen,snapshot_id,tipo,version", `columnas: ${Object.keys(filas[0]).join(",")}`);
        revisar(filas.every((f) => f.snapshot_id === ultimo.id && f.version === ultimo.version), "no es el último snapshot");
        const texto = JSON.stringify(filas);
        for (const prohibido of ["evidencia", "cita", CITA_PERFIL, DESCRIPCION_SENAL, "senales", "De un snapshot anterior"]) revisar(!texto.includes(prohibido), `salió ${prohibido}`);
        const concentracion = filas.find((f) => f.dimension === "concentracion");
        revisar(concentracion?.tipo === "area_de_apoyo" && concentracion.resumen === "Se concentra mejor con una lista.", "no devolvió la dimensión");
        revisar(JSON.stringify(concentracion.dominios_fe) === '["iniciacion"]', "dominios_fe no es una lista jsonb");
      }
      await como(tx, PERSONA);
      await ceroFilas(tx, "la persona lee profile_snapshots", (sp) => sp`select id from app.profile_snapshots where engagement_id = ${ENG_DEMO}`);
      await como(tx, PERSONA_ALTA);
      await ceroFilas(tx, "una persona ajena", (sp) => perfilParaDesglose(sp, ENG_DEMO));
      await como(tx, COACH_SIN);
      await ceroFilas(tx, "un coach ajeno", (sp) => perfilParaDesglose(sp, ENG_DEMO));

      await comoOwner(tx);
      await evento(tx, ENG_DEMO, PERSONA, "retirado");
      for (const usuario of [PERSONA, COACH]) {
        await como(tx, usuario);
        await ceroFilas(tx, "sin consentimiento", (sp) => perfilParaDesglose(sp, ENG_DEMO));
      }
      await comoOwner(tx);
      await evento(tx, ENG_DEMO, PERSONA, "otorgado");
      await crearSnapshot(tx, ENG_DEMO);
      await como(tx, PERSONA);
      await ceroFilas(tx, "sin dimensiones", (sp) => perfilParaDesglose(sp, ENG_DEMO));

      await comoOwner(tx);
      const permisos = await tx`
        select grantee, routine_name from information_schema.routine_privileges
        where routine_schema = 'private' and privilege_type = 'EXECUTE' and grantee in ('PUBLIC', 'anon')
          and routine_name in ('app_perfil_para_desglose', 'app_plantilla_de_mi_org', 'app_desglose_del_acompanamiento', 'app_paso_marcable', 'app_decidir_ajustes')`;
      revisar(permisos.length === 0, `con execute: ${permisos.map((p) => `${p.grantee} ${p.routine_name}`).join(", ")}`);
    },
  },
  {
    id: "CA-010.26",
    descripcion: "la persona dueña marca un paso; su coach, un coach ajeno y otra persona no",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      const marca = (sp: Tx, creadoPor: string) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId, creadoPor });
      await como(tx, PERSONA);
      await acepta(tx, "la persona marca su paso", (sp) => marca(sp, PERSONA));
      await rechaza(tx, "un paso que no está en el desglose", "rls", (sp) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: randomUUID() }));
      await rechaza(tx, "una marca ya revisada", "rls", (sp) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId, revisadoPor: PERSONA }));
      await como(tx, COACH);
      await rechaza(tx, "su coach marca", "rls", (sp) => marca(sp, COACH));
      await rechaza(tx, "su coach marca a nombre de ella", "rls", (sp) => marca(sp, PERSONA));
      await como(tx, COACH_SIN);
      await rechaza(tx, "un coach ajeno marca", "rls", (sp) => marca(sp, COACH_SIN));
      await como(tx, PERSONA_ALTA);
      await rechaza(tx, "otra persona marca", "rls", (sp) => marca(sp, PERSONA_ALTA));
      await rechaza(tx, "otra persona marca en su propio acompañamiento un paso ajeno", "rls", (sp) => marcarPaso(sp, { engagementId: ENG_ALTA, desgloseId: d.desgloseId, pasoId: d.pasoLibreId, creadoPor: PERSONA_ALTA }));
    },
  },
  {
    id: "CA-010.27",
    descripcion: "marcar hecho y luego pendiente deja las dos filas y gana la de id más alto; la persona no edita ni borra una marca; el texto solo va en atorado y hasta 1000",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await como(tx, PERSONA);
      await marcarPaso(tx, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId, estado: "hecho" });
      await marcarPaso(tx, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId, estado: "pendiente" });
      const filas = await tx`select estado::text as estado from app.task_step_events where breakdown_id = ${d.desgloseId} and paso_id = ${d.pasoLibreId} order by id desc`;
      revisar(filas.map((f) => f.estado).join(",") === "pendiente,hecho", `filas: ${filas.map((f) => f.estado).join(",")}`);
      await rechaza(tx, "la persona edita el texto", "permiso", (sp) => sp`update app.task_step_events set texto = 'Otro' where id = ${d.marcaId}`);
      await rechaza(tx, "la persona cambia el estado", "permiso", (sp) => sp`update app.task_step_events set estado = 'hecho' where id = ${d.marcaId}`);
      await rechaza(tx, "la persona borra una marca", "permiso", (sp) => sp`delete from app.task_step_events where id = ${d.marcaId}`);
      await rechaza(tx, "texto en hecho", "check", (sp) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId, estado: "hecho", texto: "No va aquí." }));
      await rechaza(tx, "texto de 1001 caracteres", "check", (sp) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId, estado: "atorado", texto: "x".repeat(1001) }));
      await acepta(tx, "texto de 1000 caracteres", (sp) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId, estado: "atorado", texto: "x".repeat(1000) }));
      await acepta(tx, "atorado sin texto", (sp) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId, estado: "atorado" }));
    },
  },
  {
    id: "CA-010.29",
    descripcion: "un desglose archivado no acepta marcas y el coach lo sigue leyendo; la persona y su coach archivan, otros no, ni a nombre de otro, y no se deshace",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      const archivar = (sp: Tx, id: string, por: string) => sp`update app.task_breakdowns set archivado_por = ${por}, archivado_en = now() where id = ${id}`;
      await como(tx, COACH_SIN);
      await ceroFilas(tx, "un coach ajeno archiva", (sp) => archivar(sp, d.desgloseId, COACH_SIN));
      await como(tx, PERSONA_ALTA);
      await ceroFilas(tx, "otra persona archiva", (sp) => archivar(sp, d.desgloseId, PERSONA_ALTA));
      await como(tx, COACH);
      await acepta(tx, "su coach archiva", (sp) => archivar(sp, d.desgloseId, COACH));
      await rechaza(tx, "su coach archiva a nombre de ella", "rls", (sp) => archivar(sp, d.desgloseId, PERSONA));
      await como(tx, PERSONA);
      await rechaza(tx, "la persona archiva a nombre de su coach", "rls", (sp) => archivar(sp, d.desgloseId, COACH));
      await archivar(tx, d.desgloseId, PERSONA);
      await ceroFilas(tx, "volver a archivar o deshacerlo", (sp) => sp`update app.task_breakdowns set archivado_en = null, archivado_por = ${PERSONA} where id = ${d.desgloseId}`);
      await rechaza(tx, "una marca en un desglose archivado", "rls", (sp) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId }));
      await como(tx, COACH);
      const [leido] = await tx`select archivado_por from app.task_breakdowns where id = ${d.desgloseId}`;
      revisar(leido?.archivado_por === PERSONA, "el coach ya no lee el desglose archivado");
    },
  },
  {
    id: "CA-010.33",
    descripcion: "el coach marca \"Ya lo revisé\" una sola vez y solo en atorado; la persona y un coach ajeno no; el coach no escribe ninguna otra columna; la persona lee que ya se revisó",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      const revisarMarca = (sp: Tx, id: number, por: string) => sp`update app.task_step_events set revisado_por = ${por}, revisado_en = now() where id = ${id}`;
      await como(tx, PERSONA);
      await ceroFilas(tx, "la persona revisa", (sp) => revisarMarca(sp, d.marcaId, PERSONA));
      await marcarPaso(tx, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId, estado: "hecho" });
      const [hecho] = await tx`select id from app.task_step_events where breakdown_id = ${d.desgloseId} and estado = 'hecho'`;
      await como(tx, COACH_SIN);
      await ceroFilas(tx, "un coach ajeno revisa", (sp) => revisarMarca(sp, d.marcaId, COACH_SIN));
      await como(tx, COACH);
      await rechaza(tx, "el coach escribe el texto", "permiso", (sp) => sp`update app.task_step_events set texto = 'Otro' where id = ${d.marcaId}`);
      await rechaza(tx, "el coach escribe el estado", "permiso", (sp) => sp`update app.task_step_events set estado = 'hecho' where id = ${d.marcaId}`);
      await rechaza(tx, "el coach borra", "permiso", (sp) => sp`delete from app.task_step_events where id = ${d.marcaId}`);
      await rechaza(tx, "el coach revisa a nombre de otro", "rls", (sp) => revisarMarca(sp, d.marcaId, PERSONA));
      await ceroFilas(tx, "el coach revisa una marca hecho", (sp) => revisarMarca(sp, Number(hecho.id), COACH));
      await acepta(tx, "el coach revisa", (sp) => revisarMarca(sp, d.marcaId, COACH));
      await revisarMarca(tx, d.marcaId, COACH);
      await ceroFilas(tx, "el coach revisa otra vez", (sp) => revisarMarca(sp, d.marcaId, COACH));
      await como(tx, PERSONA);
      const [leida] = await tx`select revisado_por, revisado_en from app.task_step_events where id = ${d.marcaId}`;
      revisar(leida?.revisado_por === COACH && leida.revisado_en !== null, "la persona no lee que su coach lo revisó");
    },
  },
  {
    id: "CA-010.38",
    descripcion: "con ajustes sin decidir no se marca; decidir escribe pasos una sola vez y solo a quien lo pidió; nadie escribe pasos directo",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const pasoOrigen = randomUUID();
      const ajuste = { id: randomUUID(), tipo: "cambiar", pasoId: pasoOrigen, paso: pasoDesglose(), motivo: "Motivo sintético." };
      const conAjustes = await crearDesglose(tx, ENG_DEMO, d.snapshotId, { ajustes: [ajuste] });
      const pasoNuevo = randomUUID();
      const nuevos = [pasoDesglose(pasoNuevo)];

      await como(tx, PERSONA);
      await rechaza(tx, "marcar con ajustes sin decidir", "rls", (sp) => marcarPaso(sp, { desgloseId: conAjustes.id, pasoId: conAjustes.pasos[0] }));
      await rechaza(tx, "la persona escribe pasos directo", "permiso", (sp) => sp`update app.task_breakdowns set pasos = ${json(sp, nuevos)} where id = ${conAjustes.id}`);
      await rechaza(tx, "la persona escribe ajustes_aceptados directo", "permiso", (sp) => sp`update app.task_breakdowns set ajustes_aceptados = '[]'::jsonb where id = ${conAjustes.id}`);
      await rechaza(tx, "la persona escribe ajustes_decididos_en directo", "permiso", (sp) => sp`update app.task_breakdowns set ajustes_decididos_en = now() where id = ${conAjustes.id}`);
      await como(tx, COACH);
      revisar((await decidirAjustes(tx, conAjustes.id, nuevos, [ajuste.id])) === false, "el coach decide");
      await como(tx, PERSONA_ALTA);
      revisar((await decidirAjustes(tx, conAjustes.id, nuevos, [ajuste.id])) === false, "otra persona decide");
      await comoOwner(tx);
      await evento(tx, ENG_DEMO, PERSONA, "retirado");
      await como(tx, PERSONA);
      revisar((await decidirAjustes(tx, conAjustes.id, nuevos, [ajuste.id])) === false, "decide sin consentimiento");
      await comoOwner(tx);
      await evento(tx, ENG_DEMO, PERSONA, "otorgado");
      const [intacto] = await tx`select pasos, ajustes_decididos_en from app.task_breakdowns where id = ${conAjustes.id}`;
      revisar(intacto.ajustes_decididos_en === null && (intacto.pasos as { id: string }[])[0].id === conAjustes.pasos[0], "los intentos cambiaron algo");

      await como(tx, PERSONA);
      revisar((await decidirAjustes(tx, conAjustes.id, "no es una lista" as unknown as unknown[], [])) === false, "pasos que no son una lista");
      revisar((await decidirAjustes(tx, conAjustes.id, nuevos, [ajuste.id])) === true, "la persona no pudo decidir");
      const [decidido] = await tx`select pasos, ajustes_aceptados, ajustes_decididos_en from app.task_breakdowns where id = ${conAjustes.id}`;
      revisar((decidido.pasos as { id: string }[])[0].id === pasoNuevo, "no escribió pasos");
      revisar(JSON.stringify(decidido.ajustes_aceptados) === JSON.stringify([ajuste.id]) && decidido.ajustes_decididos_en !== null, "no escribió la decisión");
      revisar((await decidirAjustes(tx, conAjustes.id, [], [])) === false, "una segunda decisión escribió");
      await acepta(tx, "marcar después de decidir", (sp) => marcarPaso(sp, { desgloseId: conAjustes.id, pasoId: pasoNuevo }));
      await rechaza(tx, "marcar un paso que ya no está", "rls", (sp) => marcarPaso(sp, { desgloseId: conAjustes.id, pasoId: conAjustes.pasos[0] }));
    },
  },
  {
    id: "CA-010.41",
    descripcion: "otro coach de la organización lee, aplica y archiva una plantilla; un coach de otra organización y una persona no; solo el coach del origen la guarda; pasos no se edita",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      await crearOtraOrganizacion(tx);
      const leer = (sp: Tx) => sp`select id from app.task_templates where id = ${d.plantillaId}`;
      await como(tx, COACH_SIN);
      await acepta(tx, "otro coach de la organización la lee", leer);
      await rechaza(tx, "otro coach de la organización guarda con un origen que no es suyo", "rls", (sp) => insertarPlantilla(sp, { origen: ENG_DEMO, creadaPor: COACH_SIN }));
      await rechaza(tx, "un UPDATE de pasos", "permiso", (sp) => sp`update app.task_templates set pasos = '[]'::jsonb where id = ${d.plantillaId}`);
      await rechaza(tx, "un UPDATE de tarea", "permiso", (sp) => sp`update app.task_templates set tarea = 'Otra' where id = ${d.plantillaId}`);
      await rechaza(tx, "un UPDATE de origen_engagement_id", "permiso", (sp) => sp`update app.task_templates set origen_engagement_id = ${ENG_ALTA} where id = ${d.plantillaId}`);
      await rechaza(tx, "un DELETE", "permiso", (sp) => sp`delete from app.task_templates where id = ${d.plantillaId}`);
      const archivar = (sp: Tx, por: string) => sp`update app.task_templates set archivada_por = ${por}, archivada_en = now() where id = ${d.plantillaId}`;
      await rechaza(tx, "archiva a nombre de otro", "rls", (sp) => archivar(sp, COACH));
      await acepta(tx, "otro coach de la organización la archiva", (sp) => archivar(sp, COACH_SIN));

      await como(tx, COACH_OTRA);
      await ceroFilas(tx, "un coach de otra organización la lee", leer);
      await ceroFilas(tx, "un coach de otra organización la archiva", (sp) => archivar(sp, COACH_OTRA));
      await rechaza(tx, "un coach de otra organización guarda en esta", "rls", (sp) => insertarPlantilla(sp, { origen: ENG_OTRA, creadaPor: COACH_OTRA }));
      await rechaza(tx, "un coach de otra organización guarda con un origen de esta", "rls", (sp) => insertarPlantilla(sp, { orgId: ORG_OTRA, origen: ENG_DEMO, creadaPor: COACH_OTRA }));
      await acepta(tx, "un coach de otra organización guarda en la suya", (sp) => insertarPlantilla(sp, { orgId: ORG_OTRA, origen: ENG_OTRA, creadaPor: COACH_OTRA }));

      await como(tx, PERSONA);
      await ceroFilas(tx, "la persona la lee", leer);
      await rechaza(tx, "la persona guarda", "rls", (sp) => insertarPlantilla(sp, { origen: ENG_DEMO, creadaPor: PERSONA }));

      await como(tx, COACH);
      await acepta(tx, "su coach la lee", leer);
      await acepta(tx, "su coach guarda otra", (sp) => insertarPlantilla(sp, { origen: ENG_DEMO, creadaPor: COACH }));
      await rechaza(tx, "guardar a nombre de otro", "rls", (sp) => insertarPlantilla(sp, { origen: ENG_DEMO, creadaPor: COACH_SIN }));
      await rechaza(tx, "guardar ya archivada", "rls", (sp) => insertarPlantilla(sp, { origen: ENG_DEMO, creadaPor: COACH, archivadaPor: COACH }));
    },
  },
  {
    id: "CA-010.42",
    descripcion: "solo el coach del acompañamiento aplica una plantilla de su organización, sin archivar y con el consentimiento de su origen vigente; la repetición solo es de la persona y de un desglose suyo",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      await crearOtraOrganizacion(tx);
      const deOtraOrg = await crearPlantilla(tx, { orgId: ORG_OTRA, origen: ENG_OTRA, creadaPor: COACH_OTRA });
      const archivada = await crearPlantilla(tx, { origen: ENG_DEMO });
      await tx`update app.task_templates set archivada_por = ${COACH}, archivada_en = now() where id = ${archivada}`;
      // ENG_ALTA no tiene consentimiento: su plantilla no se ve, y esta función tampoco la deja aplicar.
      const oculta = await crearPlantilla(tx, { origen: ENG_ALTA });
      const snapshotAjeno = await crearSnapshot(tx, ENG_ALTA);
      const conPlantilla = (sp: Tx, creadoPor: string, plantillaId: string, engagementId = ENG_DEMO) => insertarDesglose(sp, { engagementId, snapshotId: d.snapshotId, creadoPor, plantillaId });

      await como(tx, COACH);
      await acepta(tx, "su coach aplica", (sp) => conPlantilla(sp, COACH, d.plantillaId));
      await rechaza(tx, "una plantilla de otra organización", "rls", (sp) => conPlantilla(sp, COACH, deOtraOrg));
      await rechaza(tx, "una plantilla archivada", "rls", (sp) => conPlantilla(sp, COACH, archivada));
      await rechaza(tx, "una plantilla oculta por falta de consentimiento en su origen", "rls", (sp) => conPlantilla(sp, COACH, oculta));
      await rechaza(tx, "el coach repite un desglose", "rls", (sp) => insertarDesglose(sp, { engagementId: ENG_DEMO, snapshotId: d.snapshotId, creadoPor: COACH, origenId: d.desgloseId }));
      await rechaza(tx, "un snapshot de otro acompañamiento", "rls", (sp) => insertarDesglose(sp, { engagementId: ENG_DEMO, snapshotId: snapshotAjeno.id, creadoPor: COACH }));

      await como(tx, COACH_SIN);
      await rechaza(tx, "un coach ajeno aplica", "rls", (sp) => conPlantilla(sp, COACH_SIN, d.plantillaId));
      await como(tx, PERSONA);
      await rechaza(tx, "la persona aplica", "rls", (sp) => conPlantilla(sp, PERSONA, d.plantillaId));
      await acepta(tx, "la persona repite un desglose suyo", (sp) => insertarDesglose(sp, { engagementId: ENG_DEMO, snapshotId: d.snapshotId, creadoPor: PERSONA, origenId: d.desgloseId }));

      // La plantilla oculta se vuelve a poder aplicar cuando su origen tiene consentimiento, y deja de poder con el retiro.
      await como(tx, COACH);
      await tx`update app.engagements set diagnostico_verificado = true, cedula_profesional = '1234567' where id = ${ENG_ALTA}`;
      await comoOwner(tx);
      await evento(tx, ENG_ALTA, PERSONA_ALTA, "otorgado");
      await como(tx, COACH);
      await acepta(tx, "con el consentimiento de su origen vigente", (sp) => conPlantilla(sp, COACH, oculta));
      await comoOwner(tx);
      await evento(tx, ENG_ALTA, PERSONA_ALTA, "retirado");
      await como(tx, COACH);
      await rechaza(tx, "con el retiro en su origen", "rls", (sp) => conPlantilla(sp, COACH, oculta));

      // Un desglose ajeno no sirve de origen.
      await comoOwner(tx);
      const otroSnapshot = await crearSnapshot(tx, ENG_OTRA);
      const ajeno = await crearDesglose(tx, ENG_OTRA, otroSnapshot.id, { creadoPor: PERSONA_OTRA });
      await como(tx, PERSONA);
      await rechaza(tx, "la persona repite un desglose ajeno", "rls", (sp) => insertarDesglose(sp, { engagementId: ENG_DEMO, snapshotId: d.snapshotId, creadoPor: PERSONA, origenId: ajeno.id }));
    },
  },
  {
    id: "CA-010.45",
    descripcion: "con el retiro, desgloses, marcas y la plantilla de ese origen dejan de verse para todos y no se borran; la plantilla no se aplica ni se archiva; un desglose ajeno hecho con ella sigue; al volver el consentimiento se ven",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await crearCoachSin(tx);
      // Un desglose de otra persona, en otro acompañamiento, hecho con esa plantilla.
      const snapshotAjeno = await crearSnapshot(tx, ENG_ALTA);
      const ajeno = await crearDesglose(tx, ENG_ALTA, snapshotAjeno.id, { creadoPor: COACH, plantillaId: d.plantillaId });
      const tablas = ["task_breakdowns", "task_step_events", "task_templates"];
      const antes: Record<string, number> = {};
      for (const t of tablas) antes[t] = await contar(tx, t, ENG_DEMO);
      for (const t of tablas) revisar(antes[t] > 0, `${t} sin filas (preparación)`);

      await como(tx, COACH);
      for (const t of tablas) revisar((await contar(tx, t, ENG_DEMO)) === antes[t], `el coach no ve ${t} con consentimiento (control)`);
      await como(tx, PERSONA);
      await tx`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${ENG_DEMO}, ${PERSONA}, 'retirado', ${AVISO})`;
      for (const t of tablas) revisar((await contar(tx, t, ENG_DEMO)) === 0, `la persona lee ${t} sin consentimiento`);
      for (const coach of [COACH, COACH_SIN]) {
        await como(tx, coach);
        for (const t of tablas) revisar((await contar(tx, t, ENG_DEMO)) === 0, `${coach} lee ${t} sin consentimiento`);
        await ceroFilas(tx, "archivar la plantilla oculta", (sp) => sp`update app.task_templates set archivada_por = ${coach}, archivada_en = now() where id = ${d.plantillaId}`);
      }
      await como(tx, COACH);
      await ceroFilas(tx, "archivar un desglose sin consentimiento", (sp) => sp`update app.task_breakdowns set archivado_por = ${COACH}, archivado_en = now() where id = ${d.desgloseId}`);
      await ceroFilas(tx, "revisar una marca sin consentimiento", (sp) => sp`update app.task_step_events set revisado_por = ${COACH}, revisado_en = now() where id = ${d.marcaId}`);
      await rechaza(tx, "guardar una plantilla con el retiro", "rls", (sp) => insertarPlantilla(sp, { origen: ENG_DEMO, creadaPor: COACH }));
      await rechaza(tx, "aplicar la plantilla oculta en otro acompañamiento", "rls", (sp) => insertarDesglose(sp, { engagementId: ENG_ALTA, snapshotId: snapshotAjeno.id, creadoPor: COACH, plantillaId: d.plantillaId }));
      await como(tx, PERSONA);
      await rechaza(tx, "marcar con el retiro", "rls", (sp) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId }));

      await comoOwner(tx);
      for (const t of tablas) revisar((await contar(tx, t, ENG_DEMO)) === antes[t], `${t} cambió con el retiro`);
      const [fila] = await tx`select plantilla_id from app.task_breakdowns where id = ${ajeno.id}`;
      revisar(fila?.plantilla_id === d.plantillaId, "el desglose de otra persona cambió");

      await evento(tx, ENG_DEMO, PERSONA, "otorgado");
      await como(tx, PERSONA);
      for (const t of ["task_breakdowns", "task_step_events"]) revisar((await contar(tx, t, ENG_DEMO)) === antes[t], `la persona no vuelve a ver ${t}`);
      await ceroFilas(tx, "la persona nunca ve la plantilla", (sp) => sp`select id from app.task_templates where id = ${d.plantillaId}`);
      for (const coach of [COACH, COACH_SIN]) {
        await como(tx, coach);
        await acepta(tx, "la plantilla vuelve a verse", (sp) => sp`select id from app.task_templates where id = ${d.plantillaId}`);
      }
      await como(tx, COACH);
      for (const t of tablas) revisar((await contar(tx, t, ENG_DEMO)) === antes[t], `el coach no vuelve a ver ${t}`);
    },
  },
  {
    id: "CA-010.51",
    descripcion: "la persona no escribe pasos directo ni crea una fila con otro creado_por, ni ya archivada o decidida; el coach no inserta marcas",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      const fila = (extra: Partial<FilaDesglose> = {}) => ({ engagementId: ENG_DEMO, snapshotId: d.snapshotId, creadoPor: PERSONA, ...extra });
      await como(tx, PERSONA);
      await acepta(tx, "la persona pide un desglose (control)", (sp) => insertarDesglose(sp, fila()));
      await rechaza(tx, "pasos directo", "permiso", (sp) => sp`update app.task_breakdowns set pasos = '[]'::jsonb where id = ${d.desgloseId}`);
      await rechaza(tx, "tarea_original directo", "permiso", (sp) => sp`update app.task_breakdowns set tarea_original = 'Otra' where id = ${d.desgloseId}`);
      await rechaza(tx, "generado_desde directo", "permiso", (sp) => sp`update app.task_breakdowns set generado_desde = ${d.snapshotSinVistaId} where id = ${d.desgloseId}`);
      await rechaza(tx, "borrar un desglose", "permiso", (sp) => sp`delete from app.task_breakdowns where id = ${d.desgloseId}`);
      await rechaza(tx, "otro creado_por", "rls", (sp) => insertarDesglose(sp, fila({ creadoPor: COACH })));
      await rechaza(tx, "ya archivada", "rls", (sp) => insertarDesglose(sp, fila({ archivadoPor: PERSONA })));
      await rechaza(tx, "ya decidida", "rls", (sp) => insertarDesglose(sp, fila({ decididosEn: true })));
      await rechaza(tx, "otro acompañamiento", "rls", (sp) => insertarDesglose(sp, fila({ engagementId: ENG_ALTA })));
      await como(tx, COACH);
      await rechaza(tx, "el coach escribe pasos directo", "permiso", (sp) => sp`update app.task_breakdowns set pasos = '[]'::jsonb where id = ${d.desgloseId}`);
    },
  },
  {
    id: "CA-010.59",
    descripcion: "un INSERT con ajustes vacíos lo rechaza la base; con ajustes nulos se puede marcar y app_decidir_ajustes no escribe",
    correr: async (tx) => {
      const d = await prepararDatosDemo(tx);
      await como(tx, PERSONA);
      await rechaza(tx, "ajustes vacíos", "check", (sp) => insertarDesglose(sp, { engagementId: ENG_DEMO, snapshotId: d.snapshotId, creadoPor: PERSONA, ajustes: [] }));
      revisar((await decidirAjustes(tx, d.desgloseId, [pasoDesglose()], [])) === false, "app_decidir_ajustes escribió sin ajustes");
      const [fila] = await tx`select pasos, ajustes_decididos_en from app.task_breakdowns where id = ${d.desgloseId}`;
      revisar(fila.ajustes_decididos_en === null && (fila.pasos as { id: string }[])[0].id === d.pasoId, "cambió la fila");
      await acepta(tx, "marcar con ajustes nulos", (sp) => marcarPaso(sp, { desgloseId: d.desgloseId, pasoId: d.pasoLibreId }));
      const [marcable] = await tx`select private.app_paso_marcable(${d.desgloseId}::uuid, ${d.pasoLibreId}::uuid, ${ENG_DEMO}::uuid) as si`;
      revisar(marcable.si === true, "app_paso_marcable dijo que no");
    },
  },
];

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

// Cada caso parte del estado del seed aunque la base se haya usado (por ejemplo, después de un
// recorrido en el navegador): el acompañamiento en alta vuelve a estar sin verificar, sin
// eventos de consentimiento ni invitaciones. Corre como owner dentro de la transacción del caso,
// así que el rollback final lo deshace igual que todo lo demás.
async function prepararEstadoInicial(tx: Tx) {
  await comoOwner(tx);
  await tx`delete from app.consent_events where engagement_id = ${ENG_ALTA}`;
  await tx`delete from app.invitations where engagement_id = ${ENG_ALTA}`;
  await tx`update app.engagements set stage = 'alta', diagnostico_verificado = false where id = ${ENG_ALTA}`;
  // Spec 003: si quedó un borrador de plan abierto en el demo, plans_un_borrador no dejaría crear otro.
  await tx`update app.plans set status = 'descartado' where engagement_id = ${ENG_DEMO} and status = 'borrador'`;
  // Spec 004: una alerta vigente de un recorrido no debe chocar con strong_alerts_una_vigente.
  await tx`update app.strong_alerts set estado = 'atendida' where engagement_id = ${ENG_DEMO}`;
  // Spec 008: una propuesta de un recorrido no debe chocar con fe_domain_summaries_una_propuesta.
  await tx`update app.fe_domain_summaries set estado = 'descartado' where engagement_id = ${ENG_DEMO} and estado = 'propuesto'`;
  // Spec 009: un borrador de un recorrido no debe chocar con shared_guides_un_borrador.
  await tx`update app.shared_guides set estado = 'descartada' where engagement_id = ${ENG_DEMO} and estado = 'borrador'`;
}

async function main(url: string) {
  // prepare: false porque el transaction pooler de Supabase no soporta prepared statements.
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  let fallas = 0;
  try {
    for (const caso of CASOS) {
      let error: unknown = null;
      try {
        await sql.begin(async (tx) => {
          await prepararEstadoInicial(tx);
          await caso.correr(tx);
          throw new Rollback("fin del caso");
        });
      } catch (e) {
        if (!(e instanceof Rollback)) error = e;
      }
      if (error) {
        fallas++;
        console.log(`FALLA ${caso.id} ${caso.descripcion}`);
        // Sin datos de personas: los mensajes son de este archivo o de Postgres sobre datos sintéticos.
        console.log(`      ${error instanceof Error ? error.message : String(error)}`);
      } else {
        console.log(`OK    ${caso.id} ${caso.descripcion}`);
      }
    }
  } finally {
    await sql.end();
  }
  const ids = new Set(CASOS.map((c) => c.id)).size;
  console.log(`\n${CASOS.length - fallas} de ${CASOS.length} casos pasaron (${ids} criterios). ${fallas ? `${fallas} fallaron.` : "Ninguno falló."}`);
  process.exitCode = fallas ? 1 : 0;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env.local. Cópiala de Supabase (Connect → Transaction pooler) y vuelve a correr.");
  process.exit(1);
}

main(url).catch((e) => {
  console.error("rls-check no pudo correr:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
