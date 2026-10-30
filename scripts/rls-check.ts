// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
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
import { resolve } from "node:path";
import { config } from "dotenv";
import postgres, { type PostgresError, type Row, type TransactionSql } from "postgres";

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
// (decisión b, R-002.30, R-002.44). 003 agrega plans y plan_items (R-003.53) y sus tablas nuevas;
// 004 a 006 agregan las suyas. Todas deben tener columna engagement_id.
const TABLAS_BLOQUEO = ["sessions", "profile_events", "profile_snapshots", "persona_profiles", "recommendations"];

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
  const [r] = await tx.unsafe(`select count(*)::int as n from app.${tabla} where engagement_id = $1 ${extra}`, [engagementId]);
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

type DatosDemo = { sessionId: string; eventoId: string; snapshotId: string; snapshotSinVistaId: string; planId: string; planItemId: string };

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
  const [plan] = await tx`
    insert into app.plans (engagement_id, titulo, status) values (${ENG_DEMO}, 'Plan sintético de rls-check', 'aprobado') returning id`;
  const [item] = await tx`
    insert into app.plan_items (plan_id, engagement_id, tipo, descripcion)
    values (${plan.id}, ${ENG_DEMO}, 'objetivo', 'Objetivo sintético de rls-check') returning id`;
  await tx`
    insert into app.recommendations (engagement_id, catalog_unit_id, plan_item_id, razon, status)
    values (${ENG_DEMO}, 'CU-001', ${item.id}, 'Razón sintética de rls-check', 'aprobada')`;
  // Un "no me representa" propio de la persona.
  const nmr = { tipo: "no_me_representa", dimension: null, comentario: "Comentario sintético de rls-check." };
  await tx`
    insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
    values (${ENG_DEMO}, 'no_me_representa', 'proposed', ${JSON.stringify(nmr)}::jsonb, ${PERSONA})`;
  return {
    sessionId: s.id as string,
    eventoId: ev.id as string,
    snapshotId: snap.id as string,
    snapshotSinVistaId: snap2.id as string,
    planId: plan.id as string,
    planItemId: item.id as string,
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
      for (const tabla of ["sessions", "profile_events", "profile_snapshots", "persona_profiles", "plans", "plan_items", "recommendations", "consent_events", "invitations"]) {
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
      await como(tx, PERSONA);
      for (const tabla of tablas) {
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
