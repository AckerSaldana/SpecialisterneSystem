// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Borrado de datos después de retirar el consentimiento (spec 002, R-002.49, CA-002.42).
// Borrador sin revisión legal (decisión abierta d). Script manual; un trabajo programado queda
// en What's next.
//
// Para cada acompañamiento cuyo ÚLTIMO evento de app.consent_events es "retirado" con fecha de
// hace más de 6 meses, borra sus filas de las tablas de TABLAS_PURGA. Deja app.engagements y
// app.consent_events, para que quede el rastro del retiro y del borrado.
//
// Uso (necesita DATABASE_URL en .env.local; entra como owner, que ignora RLS):
//   npm run purge-retirados                          → borra lo que ya cumplió 6 meses
//   npm run purge-retirados -- --dry-run             → solo lista qué borraría, no borra
//   npm run purge-retirados -- --engagement <uuid>   → borra ya ese acompañamiento, a pedido de la
//                                                      persona; exige que su último evento sea retirado
//   npm run purge-retirados -- --test                → prueba de CA-002.42 en una transacción con rollback
//
// El resumen solo dice ids, fechas y cuántas filas se borraron por tabla. Nunca imprime notas.
import { resolve } from "node:path";
import { config } from "dotenv";
import postgres, { type TransactionSql } from "postgres";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

type Tx = TransactionSql;

// Orden de borrado según las llaves foráneas de lib/db/schema.ts:
// recommendations → plan_items → plans; persona_profiles → profile_snapshots → profile_events → sessions.
// 003 a 006 agregan aquí las tablas de su lista de bloqueo (R-002.44), respetando sus llaves.
// Todas tienen columna engagement_id. engagements y consent_events no se tocan nunca.
// Orden por llaves foráneas: lo que apunta a otra tabla se borra antes. persona_plans y
// plan_items van antes que plans, y plans antes que profile_snapshots (plans.profile_snapshot_id).
// Spec 004: sus cuatro tablas apuntan a plan_items, sessions y profile_events, así que van primero.
const TABLAS_PURGA = [
  "plan_item_updates",
  "followup_context",
  "signal_states",
  "strong_alerts",
  "recommendations",
  "persona_plans",
  "plan_items",
  "plans",
  "persona_profiles",
  "profile_snapshots",
  "profile_events",
  "sessions",
] as const;

const PLAZO = "6 months";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Candidato = { engagementId: string; retiradoEn: Date };
type Conteo = Record<(typeof TABLAS_PURGA)[number], number>;

class Rollback extends Error {}

// Acompañamientos cuyo último evento es "retirado" y tiene más de 6 meses.
async function candidatos(tx: Tx | postgres.Sql): Promise<Candidato[]> {
  const filas = await tx`
    with ultimo as (
      select distinct on (engagement_id) engagement_id, tipo, fecha
      from app.consent_events
      order by engagement_id, id desc
    )
    select engagement_id, fecha from ultimo
    where tipo = 'retirado' and fecha < now() - ${PLAZO}::interval
    order by fecha`;
  return filas.map((f) => ({ engagementId: f.engagement_id as string, retiradoEn: f.fecha as Date }));
}

async function ultimoEvento(tx: Tx, engagementId: string): Promise<{ tipo: string; fecha: Date } | null> {
  const [f] = await tx`
    select tipo::text as tipo, fecha from app.consent_events where engagement_id = ${engagementId} order by id desc limit 1`;
  return f ? { tipo: f.tipo as string, fecha: f.fecha as Date } : null;
}

async function contar(tx: Tx | postgres.Sql, engagementId: string): Promise<Conteo> {
  const conteo = {} as Conteo;
  for (const tabla of TABLAS_PURGA) {
    // tabla viene de la constante de arriba, nunca de una entrada.
    const [r] = await tx.unsafe(`select count(*)::int as n from app.${tabla} where engagement_id = $1`, [engagementId]);
    conteo[tabla] = r.n as number;
  }
  return conteo;
}

async function purgar(tx: Tx, engagementId: string): Promise<Conteo> {
  const conteo = {} as Conteo;
  for (const tabla of TABLAS_PURGA) {
    const r = await tx.unsafe(`delete from app.${tabla} where engagement_id = $1`, [engagementId]);
    conteo[tabla] = r.count ?? 0;
  }
  return conteo;
}

const fecha = (d: Date) => d.toISOString().slice(0, 10);
const resumen = (c: Conteo) => TABLAS_PURGA.map((t) => `${t} ${c[t]}`).join(", ");

// ---------------------------------------------------------------------------
// Modos
// ---------------------------------------------------------------------------

async function listar(sql: postgres.Sql) {
  const lista = await candidatos(sql);
  if (!lista.length) {
    console.log("Ningún acompañamiento tiene un retiro de hace más de 6 meses. No hay nada que borrar.");
    return;
  }
  console.log(`Se borrarían los datos de ${lista.length} acompañamiento(s) (modo --dry-run, no se borró nada):`);
  for (const c of lista) {
    console.log(`  ${c.engagementId} · retirado el ${fecha(c.retiradoEn)} · filas: ${resumen(await contar(sql, c.engagementId))}`);
  }
}

async function borrarVencidos(sql: postgres.Sql) {
  await sql.begin(async (tx) => {
    const lista = await candidatos(tx);
    if (!lista.length) {
      console.log("Ningún acompañamiento tiene un retiro de hace más de 6 meses. No se borró nada.");
      return;
    }
    for (const c of lista) {
      const conteo = await purgar(tx, c.engagementId);
      console.log(`Borrado ${c.engagementId} · retirado el ${fecha(c.retiradoEn)} · filas borradas: ${resumen(conteo)}`);
    }
    console.log(`Listo: ${lista.length} acompañamiento(s). Se conservan sus filas de engagements y consent_events.`);
  });
}

async function borrarUno(sql: postgres.Sql, engagementId: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const ultimo = await ultimoEvento(tx, engagementId);
    if (ultimo?.tipo !== "retirado") {
      console.error(
        `No se borró nada: el último evento de consentimiento de ${engagementId} no es "retirado" (${ultimo?.tipo ?? "sin eventos"}). ` +
          "Solo se borra a pedido de la persona después de que retiró su consentimiento.",
      );
      return false;
    }
    const conteo = await purgar(tx, engagementId);
    console.log(`Borrado ${engagementId} a pedido de la persona · retirado el ${fecha(ultimo.fecha)} · filas borradas: ${resumen(conteo)}`);
    console.log("Se conservan su fila de engagements y sus consent_events.");
    return true;
  });
}

// ---------------------------------------------------------------------------
// --test: CA-002.42 dentro de una transacción que termina con rollback
// ---------------------------------------------------------------------------

const ORG = "11111111-1111-4111-8111-111111111111";
const COACH = "22222222-2222-4222-8222-222222222222";
const PERSONA = "33333333-3333-4333-8333-333333333333";
const ENG_DEMO = "44444444-4444-4444-8444-444444444444";
const PERSONA_ALTA = "35353535-3535-4535-8535-353535353535";
const ENG_ALTA = "46464646-4646-4646-8646-464646464646";
// Solo existen dentro de la transacción de prueba.
const PERSONA_TEST = "79797979-7979-4979-8979-797979797979";
const ENG_TEST = "48484848-4848-4848-8848-484848484848";

// Una fila sintética en cada tabla de TABLAS_PURGA para el acompañamiento.
async function sembrar(tx: Tx, engagementId: string) {
  const [s] = await tx`
    insert into app.sessions (engagement_id, coach_id, nota_original)
    values (${engagementId}, ${COACH}, 'Nota sintética de purge-retirados --test.') returning id`;
  const [ev] = await tx`
    insert into app.profile_events (engagement_id, session_id, tipo, status, payload, created_by)
    values (${engagementId}, ${s.id}, 'propuesta_ia', 'approved', '{}'::jsonb, ${COACH}) returning id`;
  const [{ v }] = await tx`select coalesce(max(version), 0)::int + 1 as v from app.profile_snapshots where engagement_id = ${engagementId}`;
  const [snap] = await tx`
    insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
    values (${engagementId}, ${v}, '{}'::jsonb, ${ev.id}, ${COACH}) returning id`;
  await tx`insert into app.persona_profiles (snapshot_id, engagement_id, version, contenido) values (${snap.id}, ${engagementId}, ${v}, '{}'::jsonb)`;
  // Spec 003: un plan necesita su perfil base y quién lo creó; el aprobado lleva su copia para la persona.
  // La versión sigue a la última: el demo puede tener planes aprobados de un recorrido.
  const [{ vp }] = await tx`select coalesce(max(version), 0)::int + 1 as vp from app.plans where engagement_id = ${engagementId}`;
  const [plan] = await tx`
    insert into app.plans (engagement_id, titulo, status, version, profile_snapshot_id, created_by)
    values (${engagementId}, 'Plan sintético', 'aprobado', ${vp}, ${snap.id}, ${COACH}) returning id`;
  const [item] = await tx`
    insert into app.plan_items (plan_id, engagement_id, tipo, descripcion) values (${plan.id}, ${engagementId}, 'objetivo', 'Objetivo sintético') returning id`;
  await tx`
    insert into app.persona_plans (plan_id, engagement_id, version, contenido) values (${plan.id}, ${engagementId}, ${vp}, '{"items":[]}'::jsonb)`;
  await tx`
    insert into app.recommendations (engagement_id, catalog_unit_id, plan_item_id, razon) values (${engagementId}, 'CU-001', ${item.id}, 'Razón sintética')`;
  // Spec 004: una fila en cada tabla, y un evento con plan_base_id para cubrir el ciclo de llaves
  // plans → profile_snapshots → profile_events → plans.
  await tx`update app.profile_events set plan_base_id = ${plan.id} where id = ${ev.id}`;
  await tx`
    insert into app.plan_item_updates (engagement_id, plan_item_id, session_id, event_id, estado, resumen, evidencia, approved_by)
    values (${engagementId}, ${item.id}, ${s.id}, ${ev.id}, 'avanza', 'Avance sintético', '[]'::jsonb, ${COACH})`;
  await tx`
    insert into app.followup_context (engagement_id, tipo, texto, plan_item_id, session_id, event_id, approved_by)
    values (${engagementId}, 'siguiente_paso', 'Paso sintético', ${item.id}, ${s.id}, ${ev.id}, ${COACH})`;
  await tx`
    insert into app.signal_states (engagement_id, tipo, estado, event_id, created_by)
    values (${engagementId}, 'cambio_de_vida', 'cerrada', ${ev.id}, ${COACH})`;
  // "do nothing": una alerta vigente de un recorrido no debe tumbar la prueba.
  await tx`
    insert into app.strong_alerts (engagement_id, tipo_senal, event_id, marcada_por)
    values (${engagementId}, 'cambio_de_vida', ${ev.id}, ${COACH}) on conflict do nothing`;
}

async function eventoConFecha(tx: Tx, engagementId: string, userId: string, tipo: "otorgado" | "retirado", hace: string) {
  await tx`
    insert into app.consent_events (engagement_id, user_id, tipo, version_aviso, fecha)
    values (${engagementId}, ${userId}, ${tipo}, '2026-10-29', now() - ${hace}::interval)`;
}

async function contarFila(tx: Tx, tabla: "engagements" | "consent_events", engagementId: string) {
  const columna = tabla === "engagements" ? "id" : "engagement_id";
  const [r] = await tx.unsafe(`select count(*)::int as n from app.${tabla} where ${columna} = $1`, [engagementId]);
  return r.n as number;
}

async function prueba(sql: postgres.Sql): Promise<boolean> {
  const fallas: string[] = [];
  const revisar = (ok: boolean, mensaje: string) => {
    console.log(`  ${ok ? "OK   " : "FALLA"} ${mensaje}`);
    if (!ok) fallas.push(mensaje);
  };

  try {
    await sql.begin(async (tx) => {
      // 1. Demo: retirado hace 7 meses → se borra.
      await sembrar(tx, ENG_DEMO);
      await eventoConFecha(tx, ENG_DEMO, PERSONA, "retirado", "7 months");
      // 2. Segundo acompañamiento: retirado hace 1 mes → no se toca.
      await sembrar(tx, ENG_ALTA);
      await eventoConFecha(tx, ENG_ALTA, PERSONA_ALTA, "retirado", "1 month");
      // 3. Acompañamiento de prueba: retirado hace 8 meses y otorgado después → no se toca.
      await tx`
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change)
        values ('00000000-0000-0000-0000-000000000000', ${PERSONA_TEST}, 'authenticated', 'authenticated',
          'persona-purga@caja-mex.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
          now(), now(), '', '', '', '')`;
      await tx`insert into app.users (id, org_id, role, nombre_pila) values (${PERSONA_TEST}, ${ORG}, 'persona', 'Noa')`;
      await tx`
        insert into app.engagements (id, org_id, type, stage, coach_id, persona_id, diagnostico_verificado, cedula_profesional, diagnostico_verificado_por, diagnostico_verificado_en)
        values (${ENG_TEST}, ${ORG}, 'workplace_support', 'evaluacion_inicial', ${COACH}, ${PERSONA_TEST}, true, '1234567', ${COACH}, now())`;
      await sembrar(tx, ENG_TEST);
      await eventoConFecha(tx, ENG_TEST, PERSONA_TEST, "retirado", "8 months");
      await eventoConFecha(tx, ENG_TEST, PERSONA_TEST, "otorgado", "7 months");

      const antes = {
        alta: await contar(tx, ENG_ALTA),
        test: await contar(tx, ENG_TEST),
        eventosDemo: await contarFila(tx, "consent_events", ENG_DEMO),
      };

      const lista = await candidatos(tx);
      const ids = lista.map((c) => c.engagementId);
      revisar(ids.includes(ENG_DEMO), "el acompañamiento retirado hace 7 meses es candidato");
      revisar(!ids.includes(ENG_ALTA), "el acompañamiento retirado hace 1 mes no es candidato");
      revisar(!ids.includes(ENG_TEST), "el acompañamiento con un otorgado posterior no es candidato");

      for (const c of lista) {
        const conteo = await purgar(tx, c.engagementId);
        console.log(`  Borrado ${c.engagementId} · retirado el ${fecha(c.retiradoEn)} · filas borradas: ${resumen(conteo)}`);
      }

      const demo = await contar(tx, ENG_DEMO);
      for (const t of TABLAS_PURGA) revisar(demo[t] === 0, `demo: 0 filas en ${t} (quedan ${demo[t]})`);
      revisar((await contarFila(tx, "engagements", ENG_DEMO)) === 1, "demo: sigue su fila de engagements");
      revisar((await contarFila(tx, "consent_events", ENG_DEMO)) === antes.eventosDemo, "demo: siguen todos sus consent_events");

      const alta = await contar(tx, ENG_ALTA);
      revisar(resumen(alta) === resumen(antes.alta), "retirado hace 1 mes: no se tocó ninguna fila");
      const test = await contar(tx, ENG_TEST);
      revisar(resumen(test) === resumen(antes.test), "otorgado posterior: no se tocó ninguna fila");

      // La guarda de --engagement: solo con el último evento "retirado".
      revisar((await ultimoEvento(tx, ENG_TEST))?.tipo === "otorgado", "--engagement rechazaría el acompañamiento con un otorgado posterior");

      throw new Rollback("fin de la prueba");
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log(fallas.length ? `\nFALLA CA-002.42 (${fallas.length} comprobaciones). Se hizo rollback.` : "\nOK CA-002.42. Se hizo rollback: la base quedó como estaba.");
  return fallas.length === 0;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(url: string) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--engagement");
  const engagementId = i >= 0 ? args[i + 1] : undefined;
  if (i >= 0 && (!engagementId || !UUID.test(engagementId))) {
    console.error("Uso: npm run purge-retirados -- --engagement <uuid del acompañamiento>");
    process.exitCode = 1;
    return;
  }

  // prepare: false porque el transaction pooler de Supabase no soporta prepared statements.
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    if (args.includes("--test")) {
      console.log("Prueba de CA-002.42 (todo dentro de una transacción con rollback):");
      process.exitCode = (await prueba(sql)) ? 0 : 1;
    } else if (args.includes("--dry-run") && engagementId) {
      const ultimo = await sql.begin((tx) => ultimoEvento(tx, engagementId));
      const puede = ultimo?.tipo === "retirado";
      console.log(
        `${engagementId} · último evento: ${ultimo ? `${ultimo.tipo} el ${fecha(ultimo.fecha)}` : "sin eventos"} · ` +
          `${puede ? "se borraría" : "no se puede borrar"} (modo --dry-run, no se borró nada) · filas: ${resumen(await contar(sql, engagementId))}`,
      );
    } else if (args.includes("--dry-run")) {
      await listar(sql);
    } else if (engagementId) {
      process.exitCode = (await borrarUno(sql, engagementId)) ? 0 : 1;
    } else {
      await borrarVencidos(sql);
    }
  } finally {
    await sql.end();
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env.local. Cópiala de Supabase (Connect → Transaction pooler) y vuelve a correr.");
  process.exit(1);
}

main(url).catch((e) => {
  console.error("purge-retirados falló:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
