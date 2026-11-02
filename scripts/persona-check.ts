// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Pruebas de ruta de la spec 005, fase del 31 oct (tarea 13): llama a las funciones de lib/ que usan
// los route.ts, con cuentas sintéticas. Sin red, sin modelo y sin caminos de prueba en el servidor.
// La capa de cookies y el 401 se cubren en el navegador.
// Uso: npm run persona-check  (necesita DATABASE_URL en .env.local, las migraciones y el seed).
//
// Crea sus propios acompañamientos con ids fijos y los borra al empezar y al terminar. No toca el
// demo. Imprime "OK|FALLA <ID> <descripción>" por caso y sale con 1 si alguno falla.
import { resolve } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";
import type { RespuestaRuta, UsuarioRuta } from "@/lib/api/ruta";
import { withRls } from "@/lib/db/rls";
import { cerrarComentario, leerDatosCierre, opcionesDeCierre } from "@/lib/persona/cierre-comentario";
import { estadosDeComentarios, textoEstado, type EstadosComentarios } from "@/lib/persona/comentarios";
import { DIMENSIONES_PERSONA } from "@/lib/persona/dimensiones";
import { enviarComentario, leerPlanYComentarios } from "@/lib/persona/feedback";
import { decidirPropuesta } from "@/lib/followup/decision";
import type { OrigenComentario } from "@/lib/profile/schema";

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
const COACH_AJENO = "b0000000-0000-4000-8000-000000000001";

const PERSONAS = {
  uno: "b0000000-0000-4000-8000-000000000011",
  otra: "b0000000-0000-4000-8000-000000000012",
  sinPlan: "b0000000-0000-4000-8000-000000000013",
  versiones: "b0000000-0000-4000-8000-000000000014",
} as const;
const ENG = {
  uno: "b0000000-0000-4000-8000-000000000021",
  otra: "b0000000-0000-4000-8000-000000000022",
  sinPlan: "b0000000-0000-4000-8000-000000000023",
  versiones: "b0000000-0000-4000-8000-000000000024",
} as const;
const TODOS_ENG = Object.values(ENG);

const AVISO = "2026-10-31";
const ETAPA = "seguimiento";
// Texto que no debe aparecer en ningún log del servidor (C-17).
const COMENTARIO = "Comentario sintético de persona-check que no debe salir en un log.";

const SIN_CONSENTIMIENTO = "Tu consentimiento no está vigente. No guardamos tu mensaje.";
const PLAN_CAMBIO = "Tu plan cambió. Recarga la página y vuelve a intentarlo.";

const usuarioDe = (id: string): UsuarioRuta => ({ id, claims: { sub: id, role: "authenticated" } });
const coach = usuarioDe(COACH);
const ajeno = usuarioDe(COACH_AJENO);
const persona = {
  uno: usuarioDe(PERSONAS.uno),
  otra: usuarioDe(PERSONAS.otra),
  sinPlan: usuarioDe(PERSONAS.sinPlan),
  versiones: usuarioDe(PERSONAS.versiones),
};

// ---------------------------------------------------------------------------
// Preparación y limpieza (como owner)
// ---------------------------------------------------------------------------

async function limpiar() {
  for (const tabla of ["persona_plans", "plan_items", "plans", "persona_profiles", "profile_snapshots", "profile_events", "sessions"]) {
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

async function crearEngagement(id: string, personaId: string) {
  await sql`
    insert into app.engagements (id, org_id, type, stage, coach_id, persona_id, diagnostico_verificado, cedula_profesional, diagnostico_verificado_por, diagnostico_verificado_en)
    values (${id}, ${ORG}, 'workplace_support', ${ETAPA}, ${COACH}, ${personaId}, true, '1234567', ${COACH}, now())`;
  await sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${id}, ${personaId}, 'otorgado', ${AVISO})`;
}

const PERFIL_PERSONA = { dimensiones: { conflictos: { resumen: "Resumen sintético de persona-check.", tipo: "contexto" } } };
const PAYLOAD_VACIO = { tipo: "propuesta_ia", update: { cambios: [], senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] }, descartados: [], banderas: [] };

// Evento de una propuesta ya decidida, con lo que aprobó el coach. "despues": un segundo adelante, para
// que siempre sea posterior a un comentario recién enviado.
async function propuestaDecidida(
  engagementId: string,
  aprobacion: Record<string, unknown>,
  cuando: "antes" | "despues" = "despues",
): Promise<string> {
  const fecha = cuando === "antes" ? sql`now() - interval '1 day'` : sql`clock_timestamp() + interval '1 second'`;
  const [e] = await sql`
    insert into app.profile_events (engagement_id, tipo, status, payload, approved_payload, decided_by, decided_at, created_by)
    values (${engagementId}, 'propuesta_ia', 'approved', ${sql.json(PAYLOAD_VACIO)}, ${sql.json(aprobacion as never)}, ${COACH}, ${fecha}, ${COACH}) returning id`;
  return e.id as string;
}

// Perfil versión 1 para la persona. El plan se aprueba "ayer": todo comentario de una prueba es posterior.
async function sembrarPerfil(engagementId: string): Promise<string> {
  const evento = await propuestaDecidida(engagementId, { cambios: [0], senales: [] }, "antes");
  const [snap] = await sql`
    insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
    values (${engagementId}, 1, ${sql.json({ dimensiones: {}, senalesActivas: [] })}, ${evento}, ${COACH}) returning id`;
  await sql`insert into app.persona_profiles (snapshot_id, engagement_id, version, contenido) values (${snap.id}, ${engagementId}, 1, ${sql.json(PERFIL_PERSONA)})`;
  return snap.id as string;
}

type ItemSemilla = { tipo: "objetivo" | "apoyo_fe"; texto: string; origen?: string };

// Plan aprobado con sus ítems y su copia para la persona (persona_plans), con itemsAnteriores.
async function sembrarPlan(
  engagementId: string,
  snapshotId: string,
  version: number,
  items: ItemSemilla[],
  cuando: "antes" | "despues",
): Promise<{ planId: string; items: string[] }> {
  const fecha = cuando === "antes" ? sql`now() - interval '1 day'` : sql`clock_timestamp() + interval '1 second'`;
  const [plan] = await sql`
    insert into app.plans (engagement_id, titulo, status, version, profile_snapshot_id, created_by, approved_by, approved_at)
    values (${engagementId}, 'Plan sintético', 'aprobado', ${version}, ${snapshotId}, ${COACH}, ${COACH}, ${fecha}) returning id`;
  const ids: string[] = [];
  const contenido = [];
  for (const [orden, it] of items.entries()) {
    const [fila] = await sql`
      insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, texto_persona, orden, origen_item_id)
      values (${plan.id}, ${engagementId}, ${it.tipo}, 'Descripción sintética', ${it.texto}, ${orden}, ${it.origen ?? null}) returning id`;
    ids.push(fila.id as string);
    contenido.push({ planItemId: fila.id, tipo: it.tipo, texto: it.texto, orden, itemsAnteriores: it.origen ? [it.origen] : [] });
  }
  await sql`insert into app.persona_plans (plan_id, engagement_id, version, contenido) values (${plan.id}, ${engagementId}, ${version}, ${sql.json({ items: contenido } as never)})`;
  return { planId: plan.id as string, items: ids };
}

type Demo = {
  snapshotUno: string;
  planUno: { planId: string; items: string[] };
  planOtra: { planId: string; items: string[] };
  snapshotVersiones: string;
  planVersiones: { planId: string; items: string[] };
};

async function preparar(): Promise<Demo> {
  await limpiar();
  await crearUsuario(COACH_AJENO, "coach-ajeno-pc@caja-mex.test", "coach", "Coach Ajeno");
  await crearUsuario(PERSONAS.uno, "persona-uno-pc@caja-mex.test", "persona", "Sol");
  await crearUsuario(PERSONAS.otra, "persona-otra-pc@caja-mex.test", "persona", "Noa");
  await crearUsuario(PERSONAS.sinPlan, "persona-sinplan-pc@caja-mex.test", "persona", "Río");
  await crearUsuario(PERSONAS.versiones, "persona-versiones-pc@caja-mex.test", "persona", "Ale");
  await crearEngagement(ENG.uno, PERSONAS.uno);
  await crearEngagement(ENG.otra, PERSONAS.otra);
  await crearEngagement(ENG.sinPlan, PERSONAS.sinPlan);
  await crearEngagement(ENG.versiones, PERSONAS.versiones);
  const snapshotUno = await sembrarPerfil(ENG.uno);
  const dosItems: ItemSemilla[] = [
    { tipo: "objetivo", texto: "Entregar tu reporte cada semana." },
    { tipo: "apoyo_fe", texto: "Puedes pedir instrucciones por escrito." },
  ];
  const planUno = await sembrarPlan(ENG.uno, snapshotUno, 1, dosItems, "antes");
  const planOtra = await sembrarPlan(ENG.otra, await sembrarPerfil(ENG.otra), 1, dosItems, "antes");
  const snapshotVersiones = await sembrarPerfil(ENG.versiones);
  const planVersiones = await sembrarPlan(ENG.versiones, snapshotVersiones, 1, dosItems, "antes");
  return { snapshotUno, planUno, planOtra, snapshotVersiones, planVersiones };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

class Falla extends Error {}

function revisar(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new Falla(mensaje);
}

const cuerpo = (r: RespuestaRuta) => r.cuerpo as { error?: string; eventId?: string; status?: string };

function esperar(r: RespuestaRuta, status: number, que: string) {
  revisar(r.status === status, `${que}: se esperaba ${status} y llegó ${r.status} (${cuerpo(r).error ?? "sin error"})`);
}

function esperarError(r: RespuestaRuta, status: number, mensaje: string, que: string) {
  esperar(r, status, que);
  revisar(cuerpo(r).error === mensaje, `${que}: el mensaje es "${cuerpo(r).error}"`);
}

async function contar(tabla: string, engagementId: string, extra = ""): Promise<number> {
  const [r] = await sql.unsafe(`select count(*)::int as n from app.${tabla} where engagement_id = $1 ${extra}`, [engagementId]);
  return r.n as number;
}

const contarComentarios = (engagementId: string) => contar("profile_events", engagementId, "and tipo = 'no_me_representa'");

async function retirar(engagementId: string, personaId: string) {
  await sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${engagementId}, ${personaId}, 'retirado', ${AVISO})`;
}
async function otorgar(engagementId: string, personaId: string) {
  await sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${engagementId}, ${personaId}, 'otorgado', ${AVISO})`;
}

const SOBRE_PERFIL = { dimension: null, comentario: COMENTARIO };
const SOBRE_PLAN = (planItemId: string | null) => ({ dimension: null, comentario: COMENTARIO, origen: "plan", planItemId });

// Envía un comentario como la persona y devuelve su id.
async function comentar(usuario: UsuarioRuta, body: object): Promise<string> {
  const r = await enviarComentario(usuario, body);
  esperar(r, 201, "enviar el comentario");
  return cuerpo(r).eventId!;
}

async function leerEvento(id: string) {
  const [e] = await sql`
    select status::text as status, payload, decided_by, decided_at, resuelto_por_evento, resuelto_por_plan, created_at
    from app.profile_events where id = ${id}`;
  return e;
}

// Lo que ve la persona con su propia sesión, con la misma lectura que /persona.
async function estadosDe(usuario: UsuarioRuta, engagementId: string): Promise<EstadosComentarios> {
  const { plan, comentarios } = await withRls(usuario.claims, (tx) => leerPlanYComentarios(tx, engagementId));
  return estadosDeComentarios(comentarios, plan?.contenido ?? null);
}

// Las opciones de "Hubo cambios" que ve el coach para un comentario.
async function opcionesPara(engagementId: string, origen: OrigenComentario, creado: Date) {
  const datos = await withRls(coach.claims, (tx) => leerDatosCierre(tx, engagementId));
  return opcionesDeCierre(datos, origen, creado);
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

type Caso = { id: string; descripcion: string; correr: () => Promise<void> };

function casos(demo: Demo): Caso[] {
  return [
    {
      id: "R-005.22",
      descripcion: "un comentario sobre una dimensión queda en proposed con origen perfil y no cambia el perfil",
      correr: async () => {
        const vistas = await contar("persona_profiles", ENG.uno);
        const id = await comentar(persona.uno, { dimension: "conflictos", comentario: COMENTARIO });
        const e = await leerEvento(id);
        revisar(e.status === "proposed", `status ${e.status}`);
        revisar(e.payload.dimension === "conflictos" && e.payload.origen === "perfil", "no guarda dimensión y origen");
        revisar(e.payload.planVersion === undefined && e.payload.planItemId === undefined, "un comentario del perfil trae datos del plan");
        revisar((await contar("persona_profiles", ENG.uno)) === vistas, "cambió persona_profiles");
      },
    },
    {
      id: "R-005.4",
      descripcion: "una dimensión fuera de la constante de visibilidad responde 400 y no crea fila",
      correr: async () => {
        const antes = await contarComentarios(ENG.uno);
        const sinConflictos = DIMENSIONES_PERSONA.filter((d) => d.id !== "conflictos");
        esperar(await enviarComentario(persona.uno, { dimension: "conflictos", comentario: "" }, sinConflictos), 400, "dimensión no visible");
        revisar((await contarComentarios(ENG.uno)) === antes, "se creó una fila");
      },
    },
    {
      id: "CA-005.20",
      descripcion: "un comentario sobre un ítem guarda origen, ítem y versión sin cambiar el plan; un ítem de otro acompañamiento responde 400",
      correr: async () => {
        const planes = await contar("plans", ENG.uno);
        const vistas = await contar("persona_plans", ENG.uno);
        const id = await comentar(persona.uno, SOBRE_PLAN(demo.planUno.items[0]));
        const e = await leerEvento(id);
        revisar(e.status === "proposed", `status ${e.status}`);
        revisar(e.payload.origen === "plan" && e.payload.planItemId === demo.planUno.items[0] && e.payload.planVersion === 1, "no guarda origen, ítem y versión");
        revisar((await contar("plans", ENG.uno)) === planes, "cambió plans");
        revisar((await contar("persona_plans", ENG.uno)) === vistas, "cambió persona_plans");

        const antes = await contarComentarios(ENG.uno);
        const r = await enviarComentario(persona.uno, SOBRE_PLAN(demo.planOtra.items[0]));
        esperarError(r, 400, PLAN_CAMBIO, "ítem de otro acompañamiento");
        revisar((await contarComentarios(ENG.uno)) === antes, "se creó una fila");
      },
    },
    {
      id: "CA-005.37",
      descripcion: "con una versión 2, un ítem solo de la 1 responde 400; también con dimensión, sin plan y con planVersion del navegador",
      correr: async () => {
        const v2 = await sembrarPlan(
          ENG.versiones,
          demo.snapshotVersiones,
          2,
          [{ tipo: "objetivo", texto: "Entregar tu reporte cada dos semanas.", origen: demo.planVersiones.items[0] }],
          "antes",
        );
        const antes = await contarComentarios(ENG.versiones);
        esperarError(await enviarComentario(persona.versiones, SOBRE_PLAN(demo.planVersiones.items[0])), 400, PLAN_CAMBIO, "ítem solo de la versión 1");
        esperarError(
          await enviarComentario(persona.versiones, { ...SOBRE_PLAN(v2.items[0]), dimension: "conflictos" }),
          400,
          PLAN_CAMBIO,
          "origen plan con dimensión",
        );
        esperar(await enviarComentario(persona.versiones, { ...SOBRE_PLAN(v2.items[0]), planVersion: 2 }), 400, "planVersion del navegador");
        esperar(await enviarComentario(persona.versiones, { dimension: null, comentario: "", origen: "perfil", planItemId: v2.items[0] }), 400, "origen perfil con ítem");
        revisar((await contarComentarios(ENG.versiones)) === antes, "se creó una fila");

        const sinPlan = await contarComentarios(ENG.sinPlan);
        esperarError(await enviarComentario(persona.sinPlan, SOBRE_PLAN(null)), 400, PLAN_CAMBIO, "sin plan vigente");
        revisar((await contarComentarios(ENG.sinPlan)) === sinPlan, "se creó una fila sin plan");

        const id = await comentar(persona.versiones, SOBRE_PLAN(v2.items[0]));
        const e = await leerEvento(id);
        revisar(e.payload.planVersion === 2, `planVersion ${e.payload.planVersion}`);
        const general = await leerEvento(await comentar(persona.versiones, SOBRE_PLAN(null)));
        revisar(general.payload.planItemId === null && general.payload.planVersion === 2, "el plan en general no guarda la versión");
      },
    },
    {
      id: "CA-005.31",
      descripcion: "sin consentimiento vigente la ruta responde 409 con el texto de la spec y no hay fila nueva",
      correr: async () => {
        const antes = await contarComentarios(ENG.otra);
        await retirar(ENG.otra, PERSONAS.otra);
        try {
          esperarError(await enviarComentario(persona.otra, SOBRE_PERFIL), 409, SIN_CONSENTIMIENTO, "perfil sin consentimiento");
          esperarError(await enviarComentario(persona.otra, SOBRE_PLAN(demo.planOtra.items[0])), 409, SIN_CONSENTIMIENTO, "plan sin consentimiento");
          revisar((await contarComentarios(ENG.otra)) === antes, "se creó una fila");
        } finally {
          await otorgar(ENG.otra, PERSONAS.otra);
        }
        await comentar(persona.otra, SOBRE_PERFIL);
      },
    },
    {
      id: "CA-005.32",
      descripcion: "origen cierre responde 400 en la ruta de la persona; en la de cierre responde 400 y el evento no cambia",
      correr: async () => {
        const antes = await contarComentarios(ENG.uno);
        esperar(await enviarComentario(persona.uno, { dimension: null, comentario: "", origen: "cierre" }), 400, "origen cierre");
        revisar((await contarComentarios(ENG.uno)) === antes, "se creó una fila");

        const payload = { tipo: "no_me_representa", dimension: null, comentario: "Sintético", origen: "cierre" };
        const [c] = await sql`
          insert into app.profile_events (engagement_id, tipo, status, payload, created_by)
          values (${ENG.uno}, 'no_me_representa', 'proposed', ${sql.json(payload)}, ${PERSONAS.uno}) returning id`;
        const id = c.id as string;
        esperarError(await cerrarComentario(coach, id, { resultado: "sin_cambios" }), 400, "Este comentario se revisa desde el resumen de cierre.", "sin cambios");
        esperarError(await cerrarComentario(coach, id, { resultado: "con_cambios" }), 400, "Este comentario se revisa desde el resumen de cierre.", "con cambios");
        const e = await leerEvento(id);
        revisar(e.status === "proposed" && e.decided_by === null && e.decided_at === null, "el evento cambió");
        await sql`delete from app.profile_events where id = ${id}`;
      },
    },
    {
      id: "CA-005.12",
      descripcion: "cerrar sin cambios deja rejected con quién y cuándo, sin versión nueva, y la persona ve el resultado y el botón otra vez",
      correr: async () => {
        const id = await comentar(persona.uno, { dimension: "concentracion", comentario: COMENTARIO });
        const pendiente = (await estadosDe(persona.uno, ENG.uno)).dimensiones.concentracion;
        revisar(pendiente?.resultado === "pendiente", `antes de cerrar: ${pendiente?.resultado}`);

        const snapshots = await contar("profile_snapshots", ENG.uno);
        const vistas = await contar("persona_profiles", ENG.uno);
        const r = await cerrarComentario(coach, id, { resultado: "sin_cambios" });
        esperar(r, 200, "cerrar");
        revisar(cuerpo(r).status === "rejected" && cuerpo(r).eventId === id, "la respuesta no coincide");
        const e = await leerEvento(id);
        revisar(e.status === "rejected" && e.decided_by === COACH && e.decided_at, "no quedaron status, decided_by y decided_at");
        revisar(e.resuelto_por_evento === null && e.resuelto_por_plan === null, "guardó un resuelto_por");
        revisar((await contar("profile_snapshots", ENG.uno)) === snapshots, "se creó un snapshot");
        revisar((await contar("persona_profiles", ENG.uno)) === vistas, "se creó una versión de persona_profiles");

        const cerrado = (await estadosDe(persona.uno, ENG.uno)).dimensiones.concentracion;
        revisar(cerrado?.resultado === "sin_cambios", `después de cerrar: ${cerrado?.resultado}`);
        revisar(textoEstado(cerrado, "F") === "Tu coach lo revisó contigo el F. Acordaron dejar esta parte como está.", "texto para la persona");
        revisar((e.decided_at as Date).getTime() === cerrado.fecha.getTime(), "la fecha no es la del cierre");
      },
    },
    {
      id: "CA-005.13",
      descripcion: "sin propuesta con cambios posterior no hay opción y la ruta responde 409; con ella se aprueba y guarda cuál fue",
      correr: async () => {
        const id = await comentar(persona.uno, SOBRE_PERFIL);
        const { created_at: creado } = await leerEvento(id);
        const NO_VALIDA = "Esa propuesta no cambió el perfil o es anterior al comentario. Elige otra.";

        revisar((await opcionesPara(ENG.uno, "perfil", creado)).length === 0, "hay opciones sin propuesta posterior");
        esperar(await cerrarComentario(coach, id, { resultado: "con_cambios" }), 400, "con cambios sin elegir");
        esperar(await cerrarComentario(coach, id, { resultado: "con_cambios", resueltoPorPlan: demo.planUno.planId }), 400, "un plan en un comentario del perfil");

        const anterior = await propuestaDecidida(ENG.uno, { cambios: [0], senales: [] }, "antes");
        const soloAvance = await propuestaDecidida(ENG.uno, { cambios: [], senales: [], avance: [0] });
        const soloSenales = await propuestaDecidida(ENG.uno, { cambios: [], senales: [0] });
        const deOtra = await propuestaDecidida(ENG.otra, { cambios: [0], senales: [] });
        for (const [que, otra] of [["anterior", anterior], ["solo avance", soloAvance], ["solo señales", soloSenales], ["de otro acompañamiento", deOtra]]) {
          esperarError(await cerrarComentario(coach, id, { resultado: "con_cambios", resueltoPorEvento: otra }), 409, NO_VALIDA, que);
        }
        revisar((await opcionesPara(ENG.uno, "perfil", creado)).length === 0, "ofrece una propuesta que no cambió el perfil");
        revisar((await leerEvento(id)).status === "proposed", "el comentario cambió");

        const conCambios = await propuestaDecidida(ENG.uno, { cambios: [0], senales: [] });
        const opciones = await opcionesPara(ENG.uno, "perfil", creado);
        revisar(opciones.length === 1 && opciones[0].id === conCambios, `opciones: ${opciones.length}`);
        const snapshots = await contar("profile_snapshots", ENG.uno);
        const r = await cerrarComentario(coach, id, { resultado: "con_cambios", resueltoPorEvento: conCambios });
        esperar(r, 200, "con cambios");
        revisar(cuerpo(r).status === "approved", `status ${cuerpo(r).status}`);
        const e = await leerEvento(id);
        revisar(e.status === "approved" && e.resuelto_por_evento === conCambios && e.decided_by === COACH, "no guardó la propuesta elegida");
        revisar((await contar("profile_snapshots", ENG.uno)) === snapshots, "se creó un snapshot");
        revisar((await estadosDe(persona.uno, ENG.uno)).perfilGeneral?.resultado === "con_cambios", "la persona no ve el resultado");
      },
    },
    {
      id: "CA-005.34",
      descripcion: "un comentario cerrado con cambios no aparece como propuesta para otro, y la ruta lo rechaza con 409",
      correr: async () => {
        const cerrado = await comentar(persona.uno, SOBRE_PERFIL);
        const propuesta = await propuestaDecidida(ENG.uno, { cambios: [0], senales: [] });
        esperar(await cerrarComentario(coach, cerrado, { resultado: "con_cambios", resueltoPorEvento: propuesta }), 200, "cerrar con cambios");
        await sql`update app.profile_events set decided_at = clock_timestamp() + interval '2 seconds' where id = ${cerrado}`;

        const pendiente = await comentar(persona.uno, SOBRE_PERFIL);
        const { created_at: creado } = await leerEvento(pendiente);
        const opciones = await opcionesPara(ENG.uno, "perfil", creado);
        revisar(!opciones.some((o) => o.id === cerrado), "la lista trae el comentario cerrado");
        esperar(await cerrarComentario(coach, pendiente, { resultado: "con_cambios", resueltoPorEvento: cerrado }), 409, "el comentario cerrado como propuesta");
        esperar(await cerrarComentario(coach, pendiente, { resultado: "sin_cambios" }), 200, "cerrar el pendiente");
      },
    },
    {
      id: "CA-005.21",
      descripcion: "sin versión posterior no hay opción y responde 409; con ella queda approved con resuelto_por_plan y la persona lo ve en el ítem equivalente",
      correr: async () => {
        const id = await comentar(persona.otra, SOBRE_PLAN(demo.planOtra.items[0]));
        const { created_at: creado } = await leerEvento(id);
        revisar((await opcionesPara(ENG.otra, "plan", creado)).length === 0, "hay opciones sin versión posterior");
        esperarError(
          await cerrarComentario(coach, id, { resultado: "con_cambios", resueltoPorPlan: demo.planOtra.planId }),
          409,
          "Esa versión del plan es anterior al comentario. Elige otra.",
          "la versión anterior",
        );
        esperar(await cerrarComentario(coach, id, { resultado: "con_cambios", resueltoPorPlan: demo.planUno.planId }), 409, "un plan de otro acompañamiento");
        esperar(await cerrarComentario(coach, id, { resultado: "con_cambios", resueltoPorEvento: demo.planUno.planId }), 400, "una propuesta en un comentario del plan");

        const [snap] = await sql`select id from app.profile_snapshots where engagement_id = ${ENG.otra} order by version desc limit 1`;
        const v2 = await sembrarPlan(
          ENG.otra,
          snap.id as string,
          2,
          [{ tipo: "objetivo", texto: "Entregar tu reporte cada dos semanas.", origen: demo.planOtra.items[0] }],
          "despues",
        );
        const opciones = await opcionesPara(ENG.otra, "plan", creado);
        revisar(opciones.length === 1 && opciones[0].id === v2.planId, `opciones: ${opciones.length}`);

        const planes = await contar("plans", ENG.otra);
        esperar(await cerrarComentario(coach, id, { resultado: "con_cambios", resueltoPorPlan: v2.planId }), 200, "con cambios");
        const e = await leerEvento(id);
        revisar(e.status === "approved" && e.resuelto_por_plan === v2.planId, "no guardó la versión elegida");
        revisar((await contar("plans", ENG.otra)) === planes, "se creó una versión del plan");

        const estados = await estadosDe(persona.otra, ENG.otra);
        const enItem = estados.items[v2.items[0]];
        revisar(enItem?.resultado === "con_cambios", `en el ítem equivalente: ${enItem?.resultado}`);
        revisar(textoEstado(enItem, "F") === "Tu coach lo revisó contigo el F. Tu plan se actualizó.", "texto para la persona");
      },
    },
    {
      id: "R-005.35",
      descripcion: "un comentario sobre un ítem que ya no tiene equivalente se muestra en el plan en general",
      correr: async () => {
        // En la versión 1 de este acompañamiento, el segundo ítem no pasó a la versión 2 de CA-005.21.
        const estados = estadosDeComentarios(
          [
            {
              status: "proposed",
              payload: { tipo: "no_me_representa", dimension: null, comentario: "", origen: "plan", planItemId: demo.planOtra.items[1], planVersion: 1 },
              createdAt: new Date(),
              decidedAt: null,
            },
          ],
          (await withRls(persona.otra.claims, (tx) => leerPlanYComentarios(tx, ENG.otra))).plan?.contenido ?? null,
        );
        revisar(estados.planGeneral?.resultado === "pendiente", "no sale en el plan en general");
      },
    },
    {
      id: "R-005.26",
      descripcion: "la ruta de cierre responde 404 a un coach ajeno, 404 sin consentimiento y 409 a un evento cerrado o que no es comentario",
      correr: async () => {
        const id = await comentar(persona.uno, SOBRE_PERFIL);
        esperarError(await cerrarComentario(ajeno, id, { resultado: "sin_cambios" }), 404, "No encontramos este comentario.", "coach ajeno");
        esperarError(await cerrarComentario(persona.uno, id, { resultado: "sin_cambios" }), 404, "No encontramos este comentario.", "la persona");
        await retirar(ENG.uno, PERSONAS.uno);
        try {
          esperarError(await cerrarComentario(coach, id, { resultado: "sin_cambios" }), 404, "No encontramos este comentario.", "sin consentimiento");
        } finally {
          await otorgar(ENG.uno, PERSONAS.uno);
        }
        esperar(await cerrarComentario(coach, id, { resultado: "otro" }), 400, "body inválido");
        revisar((await leerEvento(id)).status === "proposed", "el comentario cambió");

        esperar(await cerrarComentario(coach, id, { resultado: "sin_cambios" }), 200, "cerrar");
        esperarError(
          await cerrarComentario(coach, id, { resultado: "sin_cambios" }),
          409,
          "Este comentario ya fue revisado. Recarga la página para ver su estado.",
          "cerrar otra vez",
        );
        const propuesta = await propuestaDecidida(ENG.uno, { cambios: [0], senales: [] }, "antes");
        esperarError(await cerrarComentario(coach, propuesta, { resultado: "sin_cambios" }), 409, "Este evento no es un comentario de la persona.", "una propuesta");
      },
    },
    {
      id: "R-005.26",
      descripcion: "la ruta de decisión de propuestas sigue respondiendo 409 a un comentario",
      correr: async () => {
        const id = await comentar(persona.uno, SOBRE_PERFIL);
        esperar(await decidirPropuesta(coach, id, { accion: "rechazar" }), 409, "decidir un comentario");
        esperar(await cerrarComentario(coach, id, { resultado: "sin_cambios" }), 200, "cerrarlo por su ruta");
      },
    },
    {
      id: "R-005.28",
      descripcion: "por parte manda el más reciente: con uno cerrado y otro nuevo, la persona ve el pendiente",
      correr: async () => {
        const uno = await comentar(persona.uno, { dimension: "forma_aprender", comentario: COMENTARIO });
        esperar(await cerrarComentario(coach, uno, { resultado: "sin_cambios" }), 200, "cerrar");
        await comentar(persona.uno, { dimension: "forma_aprender", comentario: COMENTARIO });
        const estado = (await estadosDe(persona.uno, ENG.uno)).dimensiones.forma_aprender;
        revisar(estado?.resultado === "pendiente", `estado ${estado?.resultado}`);
      },
    },
    {
      id: "R-005.1",
      descripcion: "la lectura de la persona no trae decided_by ni resuelto_*, y no ve comentarios de otra persona",
      correr: async () => {
        const { comentarios } = await withRls(persona.uno.claims, (tx) => leerPlanYComentarios(tx, ENG.uno));
        revisar(comentarios.length > 0, "la persona no lee sus comentarios");
        for (const c of comentarios) {
          revisar(!("decidedBy" in c) && !("resueltoPorPlan" in c) && !("resueltoPorEvento" in c), "trae columnas internas");
        }
        const ajenos = await withRls(persona.uno.claims, (tx) => leerPlanYComentarios(tx, ENG.otra));
        revisar(ajenos.comentarios.length === 0 && ajenos.plan === null, "ve datos de otro acompañamiento");
      },
    },
    {
      id: "CA-005.26",
      descripcion: "después de todas las acciones, ninguna etapa cambió",
      correr: async () => {
        const filas = await sql`select stage::text as stage from app.engagements where id = any(${TODOS_ENG}::uuid[])`;
        revisar(filas.length === TODOS_ENG.length, `${filas.length} acompañamientos`);
        revisar(filas.every((f) => f.stage === ETAPA), `etapas: ${filas.map((f) => f.stage).join()}`);
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
    const demo = await preparar();
    // El log del servidor de estas funciones sí se revisa: no debe traer el comentario (C-17).
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
    const conComentario = lineas.filter((l) => l.includes(COMENTARIO));
    if (conComentario.length > 0) {
      fallas++;
      console.log(`FALLA C-17 el log del servidor trae el comentario de la persona: ${conComentario.length} líneas`);
    } else {
      console.log(`OK    C-17 ${lineas.length} líneas de log del servidor, ninguna con el comentario de la persona`);
    }
  } finally {
    await limpiar();
    await sql.end();
  }
  console.log(`\n${total - fallas} de ${total} casos pasaron. ${fallas ? `${fallas} fallaron.` : "Ninguno falló."} Se borró lo creado.`);
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error("persona-check no pudo correr:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
