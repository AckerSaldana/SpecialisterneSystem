// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Seed por etapa del caso de demo (spec 007, R-007.59, R-007.60, R-007.70): Renata, con su cuenta y
// su acompañamiento propios. No llama al modelo: las propuestas son las fijas de
// eval/cases/*_caso-demo-01.json y sus eventos llevan prompt_version "seed-demo". No escribe en
// audit_log.
//
// Uso (después de npm run seed; necesita DATABASE_URL en .env.local):
//   npm run seed-demo -- --hasta <evaluacion_inicial|perfil|plan|seguimiento>
//
// Cuenta de prueba (valor de prueba, solo para este prototipo):
//   persona  renata@caja-mex.test  / caja-mex-renata-demo
//
// Repetible: primero borra las filas de este acompañamiento en el orden de TABLAS_PURGA y la fila
// de engagements, y las vuelve a crear con ids fijos. No toca otras cuentas ni otros acompañamientos.
// TABLAS_PURGA incluye shared_guides: una guía de Renata de una corrida anterior se borra aquí. El seed no
// crea una guía, y su consentimiento va con el aviso vigente (spec 009, tarea 23, decisión abierta 4).
// También incluye task_step_events, task_breakdowns y task_templates (spec 010, R-010.52): lo que Renata pidió o marcó en
// una corrida anterior se borra, y el seed no crea nada de eso. Una plantilla que salió de su acompañamiento también se
// borra. Si otro coach ya la aplicó a otra persona, ese desglose sigue, y lo único que cambia es su plantilla_id, que queda
// nulo (on delete set null, decisión abierta 5, opción B).
// La etapa nunca se escribe: la cambian los triggers de 003 al aprobar el snapshot, insertar el
// primer borrador de plan y aprobarlo, con decidirPropuesta y decidirPlan y los claims del coach.
//
// Las fechas salen de calendarioDemo (R-007.60), no del día en que corre: decidirPropuesta y decidirPlan
// reciben la hora de la aprobación, y lo que la base fecha sola con now() se corrige aquí, como owner.
import { resolve } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";
import type { RespuestaRuta, UsuarioRuta } from "@/lib/api/ruta";
import { decidirPropuesta } from "@/lib/followup/decision";
import { AVISO_VERSION } from "@/lib/legal/aviso";
import { decidirPlan } from "@/lib/plan/decision";
import { calendarioDemo, leerCasoDemo, payloadDeSesion, problemasCasoDemo, propuestaPlanDemo, type CasoDemo, type SesionDemo } from "../eval/demo";
import { columnaDe, TABLAS_PURGA } from "./tablas-purga";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const PROMPT_SEED = "seed-demo";

const ETAPAS = ["evaluacion_inicial", "perfil", "plan", "seguimiento"] as const;
type Etapa = (typeof ETAPAS)[number];

const ORG = "11111111-1111-4111-8111-111111111111";
const COACH = "22222222-2222-4222-8222-222222222222"; // del seed
const coach: UsuarioRuta = { id: COACH, claims: { sub: COACH, role: "authenticated" } };

// Ids fijos e inventados de este seed.
const RENATA = "d0000000-0000-4000-8000-000000000011";
const IDENTIDAD = "d0000000-0000-4000-8000-000000000012";
const ENG = "d0000000-0000-4000-8000-000000000021";
const PLAN = "d0000000-0000-4000-8000-000000000031";

type Sql = postgres.Sql;

const etapaPedida = (args: string[]): Etapa | null => {
  const i = args.indexOf("--hasta");
  const valor = i >= 0 ? args[i + 1] : undefined;
  return (ETAPAS as readonly string[]).includes(valor ?? "") ? (valor as Etapa) : null;
};

// decidirPropuesta y decidirPlan contestan como una ruta: aquí, cualquier cosa que no sea 200 corta.
function exigirOk(paso: string, r: RespuestaRuta) {
  if (r.status !== 200) throw new Error(`${paso}: ${r.status} ${JSON.stringify(r.cuerpo)}`);
}

// Borra lo del acompañamiento y lo deja en evaluacion_inicial con consentimiento vigente.
async function recrearAcompanamiento(sql: Sql, caso: CasoDemo) {
  const fechas = calendarioDemo(caso);
  await sql.begin(async (tx) => {
    for (const tabla of TABLAS_PURGA) {
      // tabla viene de la constante, nunca de una entrada.
      await tx.unsafe(`delete from app.${tabla} where ${columnaDe(tabla)} = $1`, [ENG]);
    }
    // Con la fila se van sus consent_events e invitations (on delete cascade).
    await tx`delete from app.engagements where id = ${ENG}`;

    // Misma forma que las cuentas de scripts/seed.sql.
    await tx`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', ${RENATA}, 'authenticated', 'authenticated',
        'renata@caja-mex.test', extensions.crypt('caja-mex-renata-demo', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '')
      on conflict do nothing`;
    await tx`
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      values (${IDENTIDAD}, ${RENATA}, ${RENATA}, 'email',
        jsonb_build_object('sub', ${RENATA}::text, 'email', 'renata@caja-mex.test', 'email_verified', true),
        now(), now(), now())
      on conflict do nothing`;
    await tx`
      insert into app.users (id, org_id, role, nombre_pila) values (${RENATA}, ${ORG}, 'persona', ${caso.nombrePila})
      on conflict do nothing`;
    // La cuenta existe desde el alta, también si ya estaba de una corrida anterior. Solo la de Renata.
    await tx`update auth.users set created_at = ${fechas.acompanamiento}, updated_at = ${fechas.acompanamiento}, email_confirmed_at = ${fechas.acompanamiento} where id = ${RENATA}`;
    await tx`update auth.identities set created_at = ${fechas.acompanamiento}, updated_at = ${fechas.acompanamiento}, last_sign_in_at = ${fechas.acompanamiento} where id = ${IDENTIDAD}`;
    await tx`update app.users set created_at = ${fechas.acompanamiento} where id = ${RENATA}`;

    // Verificación sintética, con cédula inventada (R-007.58). El INSERT no pasa por app_on_verificacion.
    await tx`
      insert into app.engagements (id, org_id, type, stage, coach_id, persona_id,
        diagnostico_verificado, cedula_profesional, diagnostico_verificado_por, diagnostico_verificado_en, created_at)
      values (${ENG}, ${ORG}, ${caso.engagementType}, 'evaluacion_inicial', ${COACH}, ${RENATA}, true, '0000000', ${COACH}, ${fechas.verificacion}, ${fechas.acompanamiento})`;
    // Va con el aviso vigente, aunque la fecha sea anterior a ese archivo: es el que se le muestra (R-007.60).
    await tx`
      insert into app.consent_events (engagement_id, user_id, tipo, version_aviso, fecha)
      values (${ENG}, ${RENATA}, 'otorgado', ${AVISO_VERSION}, ${fechas.consentimiento})`;
  });
}

// La sesión y su propuesta entran como owner, igual de limpias que las guarda la app. Se aprueban con
// decidirPropuesta: snapshot, persona_profiles, avance, contexto y triggers son los de la app.
async function cargarSesion(sql: Sql, caso: CasoDemo, sesion: SesionDemo, base: { perfilVersion: number; planId: string | null }) {
  // sql.json: con un texto de JSON y un cast a jsonb, postgres.js guarda un texto y no un objeto, y lo que lee esa columna con SQL
  // no encuentra nada (private.app_guia_insumos, jsonb_path_query). Drizzle lo esconde porque vuelve a parsear al leer.
  const payload = sql.json(payloadDeSesion(caso, sesion) as postgres.JSONValue);
  const fechas = calendarioDemo(caso).sesiones.find((s) => s.id === sesion.id)!;

  await sql`
    insert into app.sessions (id, engagement_id, coach_id, nota_original, tipo, realizada_en, created_at)
    values (${sesion.id}, ${ENG}, ${COACH}, ${sesion.nota}, ${sesion.tipo}, ${fechas.realizadaEn}, ${fechas.realizadaEn})`;
  await sql`
    insert into app.profile_events (id, engagement_id, session_id, tipo, status, payload, prompt_version, created_by, perfil_version_base, plan_base_id, created_at)
    values (${sesion.eventoId}, ${ENG}, ${sesion.id}, 'propuesta_ia', 'proposed', ${payload}, ${PROMPT_SEED}, ${COACH}, ${base.perfilVersion}, ${base.planId}, ${fechas.propuesta})`;

  exigirOk(
    `aprobar la sesión ${sesion.id}`,
    await decidirPropuesta(coach, sesion.eventoId, { accion: "aprobar", aprobacion: sesion.aprobacion }, { ahora: fechas.aprobacion }),
  );

  // El snapshot y la copia para la persona los fecha la base con now().
  await sql`update app.profile_snapshots set created_at = ${fechas.aprobacion} where source_event_id = ${sesion.eventoId}`;
  await sql`
    update app.persona_profiles set created_at = ${fechas.aprobacion}
    where snapshot_id in (select id from app.profile_snapshots where source_event_id = ${sesion.eventoId})`;
}

// El primer borrador de plan: el trigger app_on_plan_insert pasa la etapa a plan.
async function cargarBorrador(sql: Sql, caso: CasoDemo) {
  const { borradorPlan } = calendarioDemo(caso);
  const [snapshot] = await sql`select id from app.profile_snapshots where engagement_id = ${ENG} and version = 1`;
  if (!snapshot) throw new Error("no hay snapshot v1 para el plan");
  await sql.begin(async (tx) => {
    await tx`
      insert into app.plans (id, engagement_id, titulo, status, profile_snapshot_id, propuesta_ia, prompt_version, created_by, created_at)
      values (${PLAN}, ${ENG}, 'Plan de acompañamiento', 'borrador', ${snapshot.id as string}, ${tx.json(propuestaPlanDemo(caso) as postgres.JSONValue)}, ${PROMPT_SEED}, ${COACH}, ${borradorPlan})`;
    for (const [orden, item] of caso.planAprobado.items.entries()) {
      await tx`
        insert into app.plan_items (id, plan_id, engagement_id, tipo, descripcion, texto_persona, dominio_fe, evidencia, orden, origen, propuesta_ref, created_at)
        values (${item.id}, ${PLAN}, ${ENG}, ${item.tipo}, ${item.descripcion}, ${item.texto_persona}, ${item.dominio_fe},
          ${tx.json(item.evidencia as postgres.JSONValue)}, ${orden}, 'ia', ${orden}, ${borradorPlan})`;
    }
  });
}

// Lo que se lee con SQL tiene que ser un arreglo o un objeto, nunca un texto con JSON adentro. Cuántas filas no lo cumplen.
async function jsonGuardadoComoTexto(sql: Sql): Promise<number> {
  const [fila] = await sql`
    select (select count(*) from app.plan_items where engagement_id = ${ENG} and jsonb_typeof(evidencia) <> 'array')::int
      + (select count(*) from app.profile_events where engagement_id = ${ENG} and jsonb_typeof(payload) <> 'object')::int
      + (select count(*) from app.plans where engagement_id = ${ENG} and jsonb_typeof(propuesta_ia) <> 'object')::int as n`;
  return fila.n as number;
}

async function etapaActual(sql: Sql): Promise<string> {
  const [fila] = await sql`select stage::text as stage from app.engagements where id = ${ENG}`;
  return fila.stage as string;
}

async function main(url: string) {
  const etapa = etapaPedida(process.argv.slice(2));
  if (!etapa) {
    console.error(`--hasta necesita una de estas etapas: ${ETAPAS.join(", ")}.`);
    process.exitCode = 1;
    return;
  }

  const leido = leerCasoDemo(resolve(process.cwd(), "eval/cases"));
  if ("problema" in leido) throw new Error(leido.problema);
  const problemas = problemasCasoDemo(leido.archivo, leido.caso, leido.base);
  if (problemas.length) throw new Error(`el caso de demo no es válido: ${problemas.join("; ")}`);
  const { caso } = leido;
  const [inicial, ...seguimiento] = caso.sesiones;

  // prepare: false porque el transaction pooler de Supabase no soporta prepared statements.
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const [existe] = await sql`select 1 as ok from app.users where id = ${COACH} and role = 'coach'`;
    if (!existe) {
      console.error("No se pudo cargar el caso de demo: el coach del seed no existe. Corre primero npm run seed.");
      process.exitCode = 1;
      return;
    }

    await recrearAcompanamiento(sql, caso);

    const hasta = ETAPAS.indexOf(etapa);
    if (hasta >= ETAPAS.indexOf("perfil")) await cargarSesion(sql, caso, inicial, { perfilVersion: 0, planId: null });
    if (hasta >= ETAPAS.indexOf("plan")) await cargarBorrador(sql, caso);
    if (hasta >= ETAPAS.indexOf("seguimiento")) {
      const { aprobacionPlan } = calendarioDemo(caso);
      exigirOk("aprobar el plan", await decidirPlan(coach, PLAN, { accion: "aprobar" }, { ahora: aprobacionPlan }));
      // La copia para la persona la fecha la base con now(), y "Tu plan" dice ese día (R-007.60).
      await sql`update app.persona_plans set created_at = ${aprobacionPlan} where plan_id = ${PLAN}`;
      let perfilVersion = 1;
      for (const sesion of seguimiento) {
        await cargarSesion(sql, caso, sesion, { perfilVersion, planId: PLAN });
        perfilVersion += 1;
      }
    }

    const final = await etapaActual(sql);
    if (final !== etapa) throw new Error(`se esperaba la etapa ${etapa} y quedó ${final}`);
    const comoTexto = await jsonGuardadoComoTexto(sql);
    if (comoTexto > 0) throw new Error(`${comoTexto} filas guardaron JSON como texto`);
    console.log(`Caso de demo cargado hasta la etapa ${etapa}.`);
    console.log("El caso de demo se cargó sin recursos ni módulo: quedan fuera de esta fase (D-073).");
  } finally {
    await sql.end();
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env.local. Cópiala de Supabase (Connect → Transaction pooler) y vuelve a correr.");
  process.exit(1);
}

main(url)
  .then(() => process.exit(process.exitCode ?? 0)) // la conexión de lib/db/client.ts sigue abierta
  .catch((e) => {
    console.error("No se pudo cargar el caso de demo:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
