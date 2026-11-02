// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Pruebas de ruta de la spec 008 (tarea 18): CA-008.1, .26, .27, .29, .30, .34 a .38 y .49. Llama a las
// funciones de lib/ que usan los route.ts, con un modelo simulado y cuentas sintéticas. Sin red y sin
// caminos de prueba en el servidor. La capa de cookies, el 401 y lo que se pinta se cubren en el navegador.
// Uso: npm run trayectoria-check  (necesita DATABASE_URL en .env.local, las migraciones y el seed).
//
// Crea sus propios acompañamientos con ids fijos y los borra al empezar y al terminar. No toca el demo
// ni otras cuentas. Imprime "OK|FALLA <ID> <descripción>" por caso y sale con 1 si alguno falla.
import { resolve } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";
import type { ResultadoSeguimientoModelo } from "@/lib/ai/propose-followup";
import type { ResultadoPropuesta } from "@/lib/ai/propose-profile-update";
import type { ResultadoResumenModelo } from "@/lib/ai/propose-resumen-dominio";
import type { RespuestaRuta, UsuarioRuta } from "@/lib/api/ruta";
import { withRls } from "@/lib/db/rls";
import { decidirPropuesta } from "@/lib/followup/decision";
import { aRealizadaEn } from "@/lib/followup/fecha";
import { leerVistaPropuesta } from "@/lib/followup/lectura";
import { PayloadSeguimientoIA, type FollowupUpdateEtiquetado } from "@/lib/followup/schema";
import {
  PayloadPropuestaIA,
  type Bandera,
  type DireccionFE,
  type DominioFE,
  type EntradaIndiceObservacion,
  type EvidenciaEtiquetada,
  type ProfileUpdateEtiquetado,
} from "@/lib/profile/schema";
import { PROMPT_VERSION, PROMPT_VERSION_RESUMEN_DOMINIO, PROMPT_VERSION_SEGUIMIENTO, type ObservacionPrompt } from "@/lib/prompts";
import { crearSesion, type DepsModelo } from "@/lib/sessions/proponer";
import { corregirLinea } from "@/lib/trayectoria/correccion";
import { leerResumenes, leerTrayectoria } from "@/lib/trayectoria/lectura";
import { evidenciaId, ERRORES_CORRECCION } from "@/lib/trayectoria/lineas";
import { decidirResumen, MENSAJES_RESUMEN, pedirResumen, type DepsResumen } from "@/lib/trayectoria/resumen";
import { resumenesDeDominio, TEXTO_BLOQUE_CAMBIO, vigenciaResumen, type ResumenDominioIA } from "@/lib/trayectoria/validate";
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
const COACH_AJENO = "e0000000-0000-4000-8000-000000000001";

const PERSONAS = {
  linea: "e0000000-0000-4000-8000-000000000011",
  resumen: "e0000000-0000-4000-8000-000000000012",
  perfil: "e0000000-0000-4000-8000-000000000013",
  seg: "e0000000-0000-4000-8000-000000000014",
} as const;
const ENG = {
  linea: "e0000000-0000-4000-8000-000000000021",
  resumen: "e0000000-0000-4000-8000-000000000022",
  perfil: "e0000000-0000-4000-8000-000000000023",
  seg: "e0000000-0000-4000-8000-000000000024",
} as const;
const TODOS_ENG = Object.values(ENG);

const AVISO = "2026-11-02";
const usuario: UsuarioRuta = { id: COACH, claims: { sub: COACH, role: "authenticated" } };
const ajeno: UsuarioRuta = { id: COACH_AJENO, claims: { sub: COACH_AJENO, role: "authenticated" } };
const persona: UsuarioRuta = { id: PERSONAS.resumen, claims: { sub: PERSONAS.resumen, role: "authenticated" } };

// Citas sintéticas, una por conducta. Ninguna debe aparecer en el log del servidor.
const CITA = {
  sinLista: "no arranca un proyecto sin una lista de pasos",
  conLista: "ya arranca sola cuando recibe la lista por escrito",
  deMemoria: "olvida las instrucciones que le dan de palabra",
  entregables: "termina antes cuando tiene entregables por semana",
  llamadas: "se levanta a caminar cuando entra una llamada",
  cambiaPlan: "cambia de plan sin problema cuando le avisan antes",
  revisa: "revisa cada reporte antes de mandarlo",
  impulso: "espera su turno antes de contestar en la junta",
  carpeta: "guarda cada archivo en una carpeta por mes",
  avanceViejo: "repasa sus pendientes cada mañana con una lista corta",
  fueraDelSnapshot: "anota en su libreta cada cambio de prioridad",
  nueva: "pidió por escrito el orden de las pruebas",
} as const;

const NOTA_BASE = Object.values(CITA)
  .map((c) => `${c[0].toUpperCase()}${c.slice(1)}.`)
  .join(" ");
const NOTA_NUEVA = "La sesión fue tranquila. Pidió por escrito el orden de las pruebas. Quedamos en revisarlo la siguiente semana.";

const cita = (texto: string, dominio: DominioFE | null = null, direccion: DireccionFE | null = null, anteriorRef: string | null = null): EvidenciaEtiquetada => ({
  cita: texto,
  dominio,
  direccion,
  anteriorRef,
});

const cambioFE = (evidencia: EvidenciaEtiquetada[], resumen = "Aprende mejor con una guía escrita al lado.") => ({
  dimension: "forma_aprender" as const,
  resumen,
  tipo: "contexto" as const,
  dominiosFE: [],
  evidencia,
});

function updatePerfil(cambios: ProfileUpdateEtiquetado["cambios"] = []): ProfileUpdateEtiquetado {
  return { cambios, senales: [], relacionesConPerfilPrevio: [], preguntasParaSiguienteSesion: [] };
}

function updateSeguimiento(cambios: FollowupUpdateEtiquetado["cambios"] = []): FollowupUpdateEtiquetado {
  return { ...updatePerfil(cambios), avance: [], contexto: [], siguientePaso: null };
}

// ---------------------------------------------------------------------------
// Modelos simulados
// ---------------------------------------------------------------------------

const USO = { entrada: 100, salida: 50, cacheLectura: 0 };

// Una salida que no cumple el esquema también llega: la revisa el código, no el tipo (R-008.4).
const modeloCon = (salida: unknown, alLlamar?: (observaciones: ObservacionPrompt[]) => void): DepsModelo => ({
  proponerPerfil: async (entrada): Promise<ResultadoPropuesta> => {
    alLlamar?.(entrada.observacionesPrevias);
    return { update: salida as ProfileUpdateEtiquetado, usage: USO, latenciaMs: 7, modelo: "modelo-simulado", promptVersion: PROMPT_VERSION };
  },
  proponerSeguimiento: async (entrada): Promise<ResultadoSeguimientoModelo> => {
    alLlamar?.(entrada.observacionesPrevias);
    return { update: salida as FollowupUpdateEtiquetado, usage: USO, latenciaMs: 7, modelo: "modelo-simulado", promptVersion: PROMPT_VERSION_SEGUIMIENTO };
  },
});

function resultadoResumen(salida: unknown): ResultadoResumenModelo {
  return { salida: salida as ResumenDominioIA, usage: USO, latenciaMs: 7, modelo: "modelo-simulado", promptVersion: PROMPT_VERSION_RESUMEN_DOMINIO };
}

// Cuenta las llamadas: un 409 antes del modelo no debe llegar aquí.
function modeloResumen(salida: unknown, alLlamar?: () => void | Promise<void>): DepsResumen & { llamadas: () => number } {
  let llamadas = 0;
  return {
    llamadas: () => llamadas,
    proponer: async () => {
      llamadas++;
      await alLlamar?.();
      return resultadoResumen(salida);
    },
  };
}

// Una oración que pasa revisarResumen: usa solo palabras de la cita.
const oracionDe = (texto: string) => `Se observó que ${texto}.`;
const salidaDe = (texto: string): ResumenDominioIA => ({ oracion: oracionDe(texto), lineaRefs: ["L-01"] });

// ---------------------------------------------------------------------------
// Preparación y limpieza (como owner)
// ---------------------------------------------------------------------------

async function limpiar() {
  await sql`delete from app.audit_log where engagement_id = any(${TODOS_ENG}::uuid[])`;
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

async function crearEngagement(id: string, personaId: string, etapa: string) {
  await sql`
    insert into app.engagements (id, org_id, type, stage, coach_id, persona_id, diagnostico_verificado, cedula_profesional, diagnostico_verificado_por, diagnostico_verificado_en)
    values (${id}, ${ORG}, 'workplace_support', ${etapa}, ${COACH}, ${personaId}, true, '1234567', ${COACH}, now())`;
  await otorgar(id, personaId);
}

async function retirar(engagementId: string, personaId: string) {
  await sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${engagementId}, ${personaId}, 'retirado', ${AVISO})`;
}
async function otorgar(engagementId: string, personaId: string) {
  await sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso) values (${engagementId}, ${personaId}, 'otorgado', ${AVISO})`;
}

// Una sesión con su propuesta ya aprobada, como queda en la base. Devuelve el id del evento.
async function sembrarEvento(
  engagementId: string,
  fecha: string,
  { cambios = [], avance = [], indice = [] }: { cambios?: EvidenciaEtiquetada[]; avance?: EvidenciaEtiquetada[]; indice?: EntradaIndiceObservacion[] },
): Promise<string> {
  const listaCambios = cambios.length ? [cambioFE(cambios)] : [];
  const payload =
    avance.length > 0
      ? PayloadSeguimientoIA.parse({
          tipo: "propuesta_seguimiento",
          update: { ...updateSeguimiento(listaCambios), avance: [{ itemRef: "P-01", estado: "avanza", resumen: "Avanzó.", evidencia: avance }] },
          descartados: [],
          banderas: [],
          indicePlan: [],
          indiceObservaciones: indice,
        })
      : PayloadPropuestaIA.parse({ tipo: "propuesta_ia", update: updatePerfil(listaCambios), descartados: [], banderas: [], indiceObservaciones: indice });
  const aprobacion = { cambios: listaCambios.map((_, i) => i), senales: [], avance: avance.length ? [0] : [], preguntas: [], contexto: [], siguientePaso: false, ediciones: [] };
  const [s] = await sql`
    insert into app.sessions (engagement_id, coach_id, nota_original, realizada_en)
    values (${engagementId}, ${COACH}, ${NOTA_BASE}, ${aRealizadaEn(fecha)}) returning id`;
  const [e] = await sql`
    insert into app.profile_events (engagement_id, session_id, tipo, status, payload, approved_payload, created_by, decided_by, decided_at)
    values (${engagementId}, ${s.id as string}, 'propuesta_ia', 'approved', ${sql.json(JSON.parse(JSON.stringify(payload)))}, ${sql.json(aprobacion)}, ${COACH}, ${COACH}, now()) returning id`;
  return e.id as string;
}

// Perfil, copia para la persona, plan y una señal: lo que una corrección no debe tocar (CA-008.29).
async function sembrarRegistro(engagementId: string) {
  const [e] = await sql`select id from app.profile_events where engagement_id = ${engagementId} order by created_at limit 1`;
  const perfil = { dimensiones: {}, senalesActivas: [] };
  const [snap] = await sql`
    insert into app.profile_snapshots (engagement_id, version, perfil, source_event_id, created_by)
    values (${engagementId}, 1, ${sql.json(perfil)}, ${e.id as string}, ${COACH}) returning id`;
  await sql`insert into app.persona_profiles (snapshot_id, engagement_id, version, contenido) values (${snap.id as string}, ${engagementId}, 1, ${sql.json({ dimensiones: {} })})`;
  const [plan] = await sql`
    insert into app.plans (engagement_id, titulo, status, version, profile_snapshot_id, created_by, approved_by, approved_at)
    values (${engagementId}, 'Plan sintético', 'aprobado', 1, ${snap.id as string}, ${COACH}, ${COACH}, now()) returning id`;
  await sql`insert into app.plan_items (plan_id, engagement_id, tipo, descripcion, orden) values (${plan.id as string}, ${engagementId}, 'objetivo', 'Objetivo sintético', 0)`;
  await sql`insert into app.signal_states (engagement_id, tipo, estado, motivo, created_by) values (${engagementId}, 'cambio_de_vida', 'cerrada', 'Motivo sintético.', ${COACH})`;
}

const F1 = "2026-10-01";
const F2 = "2026-10-10";
const F3 = "2026-10-20";

type Preparado = {
  primero: string; // evento con iniciación y memoria de trabajo
  segundo: string; // evento con un "cambio" en iniciación y una línea de planeación
  lineaApoyo: string;
  lineaMemoria: string;
  lineaCambio: string;
  lineaPlaneacion: string;
};

async function preparar(): Promise<Preparado> {
  await limpiar();
  await crearUsuario(COACH_AJENO, "coach-ajeno-tc@caja-mex.test", "coach", "Coach Ajeno");
  await crearUsuario(PERSONAS.linea, "persona-linea-tc@caja-mex.test", "persona", "Sol");
  await crearUsuario(PERSONAS.resumen, "persona-resumen-tc@caja-mex.test", "persona", "Noa");
  await crearUsuario(PERSONAS.perfil, "persona-perfil-tc@caja-mex.test", "persona", "Ale");
  await crearUsuario(PERSONAS.seg, "persona-seg-tc@caja-mex.test", "persona", "Río");
  await crearEngagement(ENG.linea, PERSONAS.linea, "seguimiento");
  await crearEngagement(ENG.resumen, PERSONAS.resumen, "seguimiento");
  await crearEngagement(ENG.perfil, PERSONAS.perfil, "perfil");
  await crearEngagement(ENG.seg, PERSONAS.seg, "seguimiento");

  // Correcciones.
  const primero = await sembrarEvento(ENG.linea, F1, { cambios: [cita(CITA.sinLista, "iniciacion", "apoyo"), cita(CITA.deMemoria, "memoria_de_trabajo", "apoyo")] });
  const lineaApoyo = evidenciaId(primero, "cambios", 0, 0);
  const lineaMemoria = evidenciaId(primero, "cambios", 0, 1);
  const segundo = await sembrarEvento(ENG.linea, F2, {
    cambios: [cita(CITA.conLista, "iniciacion", "cambio", "O-01"), cita(CITA.entregables, "planeacion_organizacion", "fortaleza")],
    indice: [{ ref: "O-01", lineaId: lineaApoyo, dominio: "iniciacion", cita: CITA.sinLista }],
  });
  await sembrarRegistro(ENG.linea);

  // Resúmenes: un dominio por criterio, para que uno no le estorbe a otro. "inhibicion" queda vacío.
  await sembrarEvento(ENG.resumen, F1, {
    cambios: [
      cita(CITA.sinLista, "iniciacion", "apoyo"),
      cita(CITA.cambiaPlan, "flexibilidad", "fortaleza"),
      cita(CITA.deMemoria, "memoria_de_trabajo", "apoyo"),
      cita(CITA.llamadas, "control_emocional", "fortaleza"),
      cita(CITA.revisa, "monitoreo_de_tareas", "fortaleza"),
    ],
  });
  await sembrarEvento(ENG.resumen, F2, {
    cambios: [cita(CITA.impulso, "automonitoreo", "fortaleza"), cita(CITA.entregables, "automonitoreo", "fortaleza"), cita(CITA.avanceViejo, "planeacion_organizacion", "fortaleza"), cita(CITA.carpeta, "organizacion_de_materiales", "fortaleza")],
  });

  return {
    primero,
    segundo,
    lineaApoyo,
    lineaMemoria,
    lineaCambio: evidenciaId(segundo, "cambios", 0, 0),
    lineaPlaneacion: evidenciaId(segundo, "cambios", 0, 1),
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

class Falla extends Error {}

function revisar(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new Falla(mensaje);
}

const cuerpo = (r: RespuestaRuta) => r.cuerpo as { error?: string; ruta?: string; sessionId?: string; eventId?: string; resumenId?: string; estado?: string; correccionId?: number };

function esperar(r: RespuestaRuta, status: number, que: string) {
  revisar(r.status === status, `${que}: se esperaba ${status} y llegó ${r.status} (${cuerpo(r).error ?? "sin error"})`);
}

async function contar(tabla: string, engagementId: string, extra = ""): Promise<number> {
  const [r] = await sql.unsafe(`select count(*)::int as n from app.${tabla} where engagement_id = $1 ${extra}`, [engagementId]);
  return r.n as number;
}

// Las filas de una tabla tal como están, para comparar antes y después.
async function fotografia(tabla: string, engagementId: string): Promise<string> {
  const filas = await sql.unsafe(`select to_jsonb(t) as fila from app.${tabla} t where engagement_id = $1 order by (to_jsonb(t))::text`, [engagementId]);
  return JSON.stringify(filas.map((f) => f.fila as unknown));
}

async function auditoria(engagementId: string, accion = "propose_fe_domain_summary") {
  return sql`
    select to_jsonb(a) as fila from app.audit_log a
    where engagement_id = ${engagementId} and accion = ${accion} order by id`;
}

const leerLineas = (engagementId: string) => withRls(usuario.claims, (tx) => leerTrayectoria(tx, engagementId));
const resumenes = (engagementId: string) => withRls(usuario.claims, (tx) => leerResumenes(tx, engagementId));

// Pide un resumen que sí se guarda y devuelve su id.
async function pedirConExito(dominio: DominioFE, texto: string): Promise<string> {
  const r = await pedirResumen(usuario, ENG.resumen, { dominio }, modeloResumen(salidaDe(texto)));
  esperar(r, 201, `pedir el resumen de ${dominio}`);
  return cuerpo(r).resumenId!;
}

const aprobar = (id: string) => decidirResumen(usuario, ENG.resumen, id, { accion: "aprobar" });
const descartar = (id: string) => decidirResumen(usuario, ENG.resumen, id, { accion: "descartar" });

async function estadoResumen(id: string) {
  const [f] = await sql`select estado::text as estado, decided_by, decided_at from app.fe_domain_summaries where id = ${id}`;
  return f as { estado: string; decided_by: string | null; decided_at: Date | null };
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

type Caso = { id: string; descripcion: string; correr: () => Promise<void> };

const SALIDAS_INVALIDAS = (conEvidencia: (evidencia: unknown[]) => unknown) => [
  { nombre: "una cita sin dominio", salida: conEvidencia([{ cita: CITA.nueva }]) },
  { nombre: 'dominio = "atencion"', salida: conEvidencia([{ cita: CITA.nueva, dominio: "atencion", direccion: null, anteriorRef: null }]) },
  { nombre: "una llave puntaje", salida: conEvidencia([{ cita: CITA.nueva, dominio: null, direccion: null, anteriorRef: null, puntaje: 3 }]) },
];

function casos(p: Preparado): Caso[] {
  return [
    {
      id: "CA-008.1",
      descripcion: "una cita sin dominio, con dominio inventado o con puntaje responde 502, sin evento y con ok = false, en perfil y en seguimiento",
      correr: async () => {
        for (const engagementId of [ENG.perfil, ENG.seg]) {
          const seguimiento = engagementId === ENG.seg;
          const accion = seguimiento ? "propose_followup_update" : "propose_profile_update";
          const conEvidencia = (evidencia: unknown[]) => {
            const cambios = [{ ...cambioFE([]), evidencia } as ProfileUpdateEtiquetado["cambios"][number]];
            return seguimiento ? updateSeguimiento(cambios) : updatePerfil(cambios);
          };
          for (const { nombre, salida } of SALIDAS_INVALIDAS(conEvidencia)) {
            const eventos = await contar("profile_events", engagementId);
            const filas = await auditoria(engagementId, accion);
            const r = await crearSesion(usuario, engagementId, { nota: NOTA_NUEVA }, modeloCon(salida));
            esperar(r, 502, nombre);
            revisar((await contar("profile_events", engagementId)) === eventos, `${nombre}: se guardó un evento`);
            const despues = await auditoria(engagementId, accion);
            revisar(despues.length === filas.length + 1, `${nombre}: no se auditó la llamada`);
            const fila = despues.at(-1)!.fila as { ok: boolean };
            revisar(fila.ok === false, `${nombre}: la auditoría no dice ok = false`);
            revisar(!JSON.stringify(fila).includes(CITA.nueva), `${nombre}: la auditoría trae la cita`);
          }
        }
      },
    },
    {
      id: "CA-008.26",
      descripcion: "corregir guarda una fila con autor, cambia la vista, deja el payload igual y el historial muestra los dos valores; con otra corrección vale la más reciente",
      correr: async () => {
        const [antes] = await sql`select payload from app.profile_events where id = ${p.primero}`;

        const r1 = await corregirLinea(usuario, ENG.linea, { lineaId: p.lineaMemoria, dominio: "monitoreo_de_tareas", direccion: "fortaleza", anteriorLineaId: null });
        esperar(r1, 201, "primera corrección");
        revisar(typeof cuerpo(r1).correccionId === "number", "no devolvió correccionId");
        const [fila] = await sql`select created_by, dominio::text as dominio, direccion::text as direccion from app.fe_corrections where id = ${cuerpo(r1).correccionId!}`;
        revisar(fila.created_by === COACH, "la fila no trae al coach como autor");
        revisar(fila.dominio === "monitoreo_de_tareas" && fila.direccion === "fortaleza", "la fila no trae lo pedido");

        const vista = (await leerLineas(ENG.linea)).lineas.find((l) => l.lineaId === p.lineaMemoria)!;
        revisar(vista.dominio === "monitoreo_de_tareas" && vista.direccion === "fortaleza", "la vista no cambió");
        revisar(vista.ia.dominio === "memoria_de_trabajo" && vista.ia.direccion === "apoyo", "el historial perdió lo que propuso la IA");
        revisar(vista.correcciones.length === 1, "el historial no trae la corrección");

        const r2 = await corregirLinea(usuario, ENG.linea, { lineaId: p.lineaMemoria, dominio: null, direccion: null, anteriorLineaId: null });
        esperar(r2, 201, "segunda corrección");
        const vista2 = (await leerLineas(ENG.linea)).lineas.find((l) => l.lineaId === p.lineaMemoria)!;
        revisar(vista2.dominio === null && vista2.direccion === null, "no vale la corrección más reciente");
        revisar(vista2.correcciones.length === 2, "el historial no trae las dos correcciones");
        revisar(vista2.correcciones[0].dominio === "monitoreo_de_tareas" && vista2.correcciones[1].dominio === null, "las correcciones no van en orden");

        // Volver a lo que propuso la IA es otra corrección (R-008.29).
        esperar(await corregirLinea(usuario, ENG.linea, { lineaId: p.lineaMemoria, dominio: "memoria_de_trabajo", direccion: "apoyo", anteriorLineaId: null }), 201, "volver a la IA");
        revisar((await contar("fe_corrections", ENG.linea, `and linea_id = '${p.lineaMemoria}'`)) === 3, "no quedaron las tres filas");

        const [despues] = await sql`select payload from app.profile_events where id = ${p.primero}`;
        revisar(JSON.stringify(antes.payload) === JSON.stringify(despues.payload), "el payload cambió");
      },
    },
    {
      id: "CA-008.27",
      descripcion: "cada caso inválido de R-008.30 responde 400, con su mensaje y sin fila nueva",
      correr: async () => {
        const otraLinea = evidenciaId("e0000000-0000-4000-8000-0000000000ff", "cambios", 0, 0);
        const casosInvalidos: { nombre: string; body: unknown; error: string }[] = [
          { nombre: "lineaId que no existe", body: { lineaId: otraLinea, dominio: "iniciacion", direccion: null, anteriorLineaId: null }, error: ERRORES_CORRECCION.sinLinea },
          { nombre: "dirección sin dominio", body: { lineaId: p.lineaApoyo, dominio: null, direccion: "apoyo", anteriorLineaId: null }, error: ERRORES_CORRECCION.direccionSinDominio },
          { nombre: "cambio sin anterior", body: { lineaId: p.lineaCambio, dominio: "memoria_de_trabajo", direccion: "cambio", anteriorLineaId: null }, error: ERRORES_CORRECCION.sinAnterior },
          { nombre: "otra dirección con anterior", body: { lineaId: p.lineaCambio, dominio: "iniciacion", direccion: "fortaleza", anteriorLineaId: p.lineaApoyo }, error: ERRORES_CORRECCION.anteriorSinCambio },
          { nombre: "anterior que no existe", body: { lineaId: p.lineaCambio, dominio: "iniciacion", direccion: "cambio", anteriorLineaId: otraLinea }, error: ERRORES_CORRECCION.anteriorInvalida },
          { nombre: "anterior de otro dominio", body: { lineaId: p.lineaCambio, dominio: "flexibilidad", direccion: "cambio", anteriorLineaId: p.lineaApoyo }, error: ERRORES_CORRECCION.anteriorInvalida },
          { nombre: "anterior que no es anterior", body: { lineaId: p.lineaApoyo, dominio: "iniciacion", direccion: "cambio", anteriorLineaId: p.lineaCambio }, error: ERRORES_CORRECCION.anteriorInvalida },
          { nombre: "valores iguales", body: { lineaId: p.lineaCambio, dominio: "iniciacion", direccion: "cambio", anteriorLineaId: p.lineaApoyo }, error: ERRORES_CORRECCION.sinCambios },
        ];
        const filas = await contar("fe_corrections", ENG.linea);
        for (const { nombre, body, error } of casosInvalidos) {
          const r = await corregirLinea(usuario, ENG.linea, body);
          esperar(r, 400, nombre);
          revisar(cuerpo(r).error === error, `${nombre}: mensaje distinto (${cuerpo(r).error})`);
        }
        esperar(await corregirLinea(usuario, ENG.linea, { lineaId: "no-es-un-id" }), 400, "cuerpo inválido");
        revisar((await contar("fe_corrections", ENG.linea)) === filas, "se escribió una fila");
      },
    },
    {
      id: "CA-008.27b",
      descripcion: "corregir: un coach ajeno recibe 404 y sin consentimiento vigente responde 409, sin fila",
      correr: async () => {
        const body = { lineaId: p.lineaApoyo, dominio: "flexibilidad", direccion: null, anteriorLineaId: null };
        const filas = await contar("fe_corrections", ENG.linea);
        esperar(await corregirLinea(ajeno, ENG.linea, body), 404, "coach ajeno");
        await retirar(ENG.linea, PERSONAS.linea);
        try {
          esperar(await corregirLinea(usuario, ENG.linea, body), 409, "sin consentimiento");
        } finally {
          await otorgar(ENG.linea, PERSONAS.linea);
        }
        revisar((await contar("fe_corrections", ENG.linea)) === filas, "se escribió una fila");
      },
    },
    {
      id: "CA-008.29",
      descripcion: "una corrección no cambia profile_snapshots, persona_profiles, plans, plan_items ni signal_states",
      correr: async () => {
        const tablas = ["profile_snapshots", "persona_profiles", "plans", "plan_items", "signal_states"];
        for (const t of tablas) revisar((await contar(t, ENG.linea)) > 0, `${t} está vacía: la prueba no revisaría nada`);
        // Una por una: varias consultas a la vez en una conexión se quedan esperando en el pooler.
        const fotos = async () => {
          const filas: string[] = [];
          for (const t of tablas) filas.push(await fotografia(t, ENG.linea));
          return filas;
        };
        const antes = await fotos();
        esperar(await corregirLinea(usuario, ENG.linea, { lineaId: p.lineaPlaneacion, dominio: "monitoreo_de_tareas", direccion: "fortaleza", anteriorLineaId: null }), 201, "corregir");
        const despues = await fotos();
        tablas.forEach((t, i) => revisar(antes[i] === despues[i], `${t} cambió`));
      },
    },
    {
      id: "CA-008.30",
      descripcion: "bloque vacío o propuesta abierta responden 409 sin modelo ni auditoría; dos pedidos a la vez dejan una sola propuesta",
      correr: async () => {
        const filas = (await auditoria(ENG.resumen)).length;

        const vacio = modeloResumen(salidaDe(CITA.impulso));
        const r1 = await pedirResumen(usuario, ENG.resumen, { dominio: "inhibicion" }, vacio);
        esperar(r1, 409, "bloque vacío");
        revisar(cuerpo(r1).error === MENSAJES_RESUMEN.bloqueVacio, "mensaje distinto en bloque vacío");
        revisar(vacio.llamadas() === 0, "bloque vacío: se llamó al modelo");
        revisar((await auditoria(ENG.resumen)).length === filas, "bloque vacío: hay fila en audit_log");

        const id = await pedirConExito("iniciacion", CITA.sinLista);
        const filasConUna = (await auditoria(ENG.resumen)).length;
        const abierta = modeloResumen(salidaDe(CITA.sinLista));
        const r2 = await pedirResumen(usuario, ENG.resumen, { dominio: "iniciacion" }, abierta);
        esperar(r2, 409, "propuesta abierta");
        revisar(cuerpo(r2).error === MENSAJES_RESUMEN.propuestaAbierta, "mensaje distinto con propuesta abierta");
        revisar(abierta.llamadas() === 0, "propuesta abierta: se llamó al modelo");
        revisar((await auditoria(ENG.resumen)).length === filasConUna, "propuesta abierta: hay fila en audit_log");
        esperar(await descartar(id), 200, "descartar");

        // La barrera hace que los dos pasen la primera lectura antes de guardar.
        let llegaron = 0;
        let soltar!: () => void;
        // Con un tope, para que una falla aquí se reporte en lugar de dejar el script esperando.
        const barrera = new Promise<void>((res) => {
          soltar = res;
          setTimeout(res, 15_000);
        });
        const conBarrera = modeloResumen(salidaDe(CITA.cambiaPlan), async () => {
          if (++llegaron === 2) soltar();
          await barrera;
        });
        const [a, b] = await Promise.all([
          pedirResumen(usuario, ENG.resumen, { dominio: "flexibilidad" }, conBarrera),
          pedirResumen(usuario, ENG.resumen, { dominio: "flexibilidad" }, conBarrera),
        ]);
        revisar([a.status, b.status].sort().join(",") === "201,409", `dos pedidos: llegaron ${a.status} y ${b.status}`);
        revisar(conBarrera.llamadas() === 2, "la barrera no los juntó en el modelo");
        revisar((await contar("fe_domain_summaries", ENG.resumen, `and dominio = 'flexibilidad' and estado = 'propuesto'`)) === 1, "no quedó una sola propuesta");
      },
    },
    {
      id: "CA-008.34",
      descripcion: "una salida rechazada responde 502, sin resumen, y audit_log dice ok = false con el motivo y sin la oración; el coach puede pedirlo otra vez",
      correr: async () => {
        const inventada = "Se observó que llega tarde a sus juntas.";
        const casosRechazo: { nombre: string; salida: unknown; motivo: string }[] = [
          { nombre: "palabra que no sale de las citas", salida: { oracion: inventada, lineaRefs: ["L-01"] }, motivo: "palabra_fuera_de_citas" },
          { nombre: "dos oraciones", salida: { oracion: `${oracionDe(CITA.deMemoria)} ${oracionDe(CITA.deMemoria)}`, lineaRefs: ["L-01"] }, motivo: "varias_oraciones" },
          { nombre: "referencia fuera del índice", salida: { oracion: oracionDe(CITA.deMemoria), lineaRefs: ["L-99"] }, motivo: "ref_fuera_del_indice" },
          { nombre: "lenguaje de puntaje", salida: { oracion: "Se observó que olvida las instrucciones tres veces.", lineaRefs: ["L-01"] }, motivo: "puntaje_o_comparacion" },
          { nombre: "llave extra", salida: { oracion: oracionDe(CITA.deMemoria), lineaRefs: ["L-01"], nivel: 2 }, motivo: "esquema" },
        ];
        for (const { nombre, salida, motivo } of casosRechazo) {
          const r = await pedirResumen(usuario, ENG.resumen, { dominio: "memoria_de_trabajo" }, modeloResumen(salida));
          esperar(r, 502, nombre);
          revisar(cuerpo(r).error === MENSAJES_RESUMEN.errorModelo, `${nombre}: mensaje distinto`);
          revisar((await contar("fe_domain_summaries", ENG.resumen, `and dominio = 'memoria_de_trabajo'`)) === 0, `${nombre}: se guardó un resumen`);
          const fila = (await auditoria(ENG.resumen)).at(-1)!.fila as { ok: boolean; error: string };
          revisar(fila.ok === false && fila.error === motivo, `${nombre}: la auditoría dice ${fila.ok} y ${fila.error}`);
          revisar(!JSON.stringify(fila).includes(typeof salida === "object" && salida && "oracion" in salida ? String(salida.oracion) : "\u0000"), `${nombre}: la auditoría trae la oración`);
        }

        const conError: DepsResumen = {
          proponer: async () => {
            throw new Error(`falla simulada con ${CITA.deMemoria}`);
          },
        };
        esperar(await pedirResumen(usuario, ENG.resumen, { dominio: "memoria_de_trabajo" }, conError), 502, "el modelo falla");
        const fila = (await auditoria(ENG.resumen)).at(-1)!.fila as { ok: boolean };
        revisar(fila.ok === false, "el modelo falla: la auditoría no dice ok = false");
        revisar(!JSON.stringify(fila).includes(CITA.deMemoria), "el modelo falla: la auditoría trae la cita");

        // R-008.36: el coach puede pedirlo otra vez.
        await pedirConExito("memoria_de_trabajo", CITA.deMemoria);
      },
    },
    {
      id: "CA-008.35",
      descripcion: "una propuesta se lee como propuesta; aprobar guarda quién y cuándo; descartar la deja de mostrar; el aprobado nuevo es el vigente y el anterior sigue en la tabla",
      correr: async () => {
        const id = await pedirConExito("control_emocional", CITA.llamadas);
        const leida = (await resumenes(ENG.resumen)).find((r) => r.id === id)!;
        revisar(leida.estado === "propuesto", "no se lee como propuesta");

        const aprobado = await aprobar(id);
        esperar(aprobado, 200, "aprobar");
        revisar(cuerpo(aprobado).estado === "aprobado", "la respuesta no dice aprobado");
        const fila = await estadoResumen(id);
        revisar(fila.estado === "aprobado" && fila.decided_by === COACH && fila.decided_at, "no quedó quién y cuándo al aprobar");
        esperar(await aprobar(id), 409, "decidir otra vez");

        const otra = await pedirConExito("monitoreo_de_tareas", CITA.revisa);
        esperar(await descartar(otra), 200, "descartar");
        const filaOtra = await estadoResumen(otra);
        revisar(filaOtra.estado === "descartado" && filaOtra.decided_by === COACH && filaOtra.decided_at, "no quedó quién y cuándo al descartar");
        revisar(!(await resumenes(ENG.resumen)).some((r) => r.id === otra), "lo descartado se sigue leyendo");

        // R-008.37: aprobar uno nuevo lo vuelve el vigente; el anterior queda en la tabla.
        const nueva = await pedirConExito("control_emocional", CITA.llamadas);
        esperar(await aprobar(nueva), 200, "aprobar el nuevo");
        const { vigente, propuesta } = resumenesDeDominio(await resumenes(ENG.resumen), "control_emocional");
        revisar(vigente?.id === nueva, "el nuevo no es el vigente");
        revisar(propuesta === null, "quedó una propuesta abierta");
        revisar((await contar("fe_domain_summaries", ENG.resumen, `and dominio = 'control_emocional' and estado = 'aprobado'`)) === 2, "el anterior ya no está en la tabla");
      },
    },
    {
      id: "CA-008.35b",
      descripcion: "un coach ajeno, la persona y un resumen de otro acompañamiento reciben 404, sin fila ni cambio",
      correr: async () => {
        const modelo = modeloResumen(salidaDe(CITA.impulso));
        esperar(await pedirResumen(ajeno, ENG.resumen, { dominio: "automonitoreo" }, modelo), 404, "pedir como coach ajeno");
        esperar(await pedirResumen(persona, ENG.resumen, { dominio: "automonitoreo" }, modelo), 404, "pedir como persona");
        revisar(modelo.llamadas() === 0, "se llamó al modelo");

        const id = await pedirConExito("automonitoreo", CITA.impulso);
        esperar(await decidirResumen(ajeno, ENG.resumen, id, { accion: "aprobar" }), 404, "decidir como coach ajeno");
        esperar(await decidirResumen(persona, ENG.resumen, id, { accion: "aprobar" }), 404, "decidir como persona");
        esperar(await decidirResumen(usuario, ENG.linea, id, { accion: "aprobar" }), 404, "decidir desde otro acompañamiento");
        esperar(await decidirResumen(usuario, ENG.resumen, id, { accion: "publicar" }), 400, "acción inválida");
        revisar((await estadoResumen(id)).estado === "propuesto", "la propuesta cambió");
        esperar(await descartar(id), 200, "descartar");
      },
    },
    {
      id: "CA-008.36",
      descripcion: "aprobar con una línea usada ya corregida responde 409; un aprobado deja de valer si cambia una línea usada y solo avisa si el bloque gana una",
      correr: async () => {
        const bloque = async (dominio: DominioFE) =>
          (await leerLineas(ENG.resumen)).lineas.filter((l) => l.dominio === dominio);
        const filaResumen = async (id: string) => {
          const [f] = await sql`select linea_ids, bloque_ids from app.fe_domain_summaries where id = ${id}`;
          return { lineaIds: f.linea_ids as string[], bloqueIds: f.bloque_ids as string[] };
        };

        // Propuesta: la línea usada se corrige a otro dominio. L-01 es la más antigua del bloque.
        const propuesta = await pedirConExito("automonitoreo", CITA.impulso);
        const [usada] = await bloque("automonitoreo");
        revisar(usada?.cita === CITA.impulso, "L-01 no es la línea esperada");
        esperar(await corregirLinea(usuario, ENG.resumen, { lineaId: usada.lineaId, dominio: "flexibilidad", direccion: null, anteriorLineaId: null }), 201, "corregir la línea usada");
        const r = await aprobar(propuesta);
        esperar(r, 409, "aprobar");
        revisar(cuerpo(r).error === TEXTO_BLOQUE_CAMBIO, "mensaje distinto al aprobar");
        revisar((await estadoResumen(propuesta)).estado === "propuesto", "la propuesta cambió");
        esperar(await descartar(propuesta), 200, "descartar siempre se puede");

        // Aprobado: la misma corrección le quita el texto.
        const aprobado = await pedirConExito("planeacion_organizacion", CITA.avanceViejo);
        esperar(await aprobar(aprobado), 200, "aprobar");
        const usadaAprobado = (await bloque("planeacion_organizacion"))[0];
        const sinCambios = vigenciaResumen(await filaResumen(aprobado), (await bloque("planeacion_organizacion")).map((l) => l.lineaId));
        revisar(!sinCambios.lineaCambio && !sinCambios.citasNuevas, "marca un cambio que no pasó");
        esperar(await corregirLinea(usuario, ENG.resumen, { lineaId: usadaAprobado.lineaId, dominio: "flexibilidad", direccion: null, anteriorLineaId: null }), 201, "corregir");
        const cambio = vigenciaResumen(await filaResumen(aprobado), (await bloque("planeacion_organizacion")).map((l) => l.lineaId));
        revisar(cambio.lineaCambio, "no marca que cambió una línea usada");

        // Aprobado: una línea nueva en el bloque solo avisa.
        const conNueva = await pedirConExito("organizacion_de_materiales", CITA.carpeta);
        esperar(await aprobar(conNueva), 200, "aprobar");
        await sembrarEvento(ENG.resumen, F3, { cambios: [cita(CITA.cambiaPlan, "organizacion_de_materiales", "fortaleza")] });
        const nuevas = vigenciaResumen(await filaResumen(conNueva), (await bloque("organizacion_de_materiales")).map((l) => l.lineaId));
        revisar(!nuevas.lineaCambio && nuevas.citasNuevas, "no avisa de la línea nueva, o le quita el texto");
      },
    },
    {
      id: "CA-008.37",
      descripcion: "sin consentimiento responde 409 sin modelo ni auditoría; si se retira durante la llamada, 409, sin resumen y con la llamada auditada",
      correr: async () => {
        const dominio = "memoria_de_trabajo";
        // El de CA-008.34 sigue abierto: se descarta para llegar al modelo.
        const abierta = (await resumenes(ENG.resumen)).find((r) => r.dominio === dominio && r.estado === "propuesto");
        if (abierta) esperar(await descartar(abierta.id), 200, "descartar la abierta");

        const filas = (await auditoria(ENG.resumen)).length;
        const sinLlamar = modeloResumen(salidaDe(CITA.deMemoria));
        await retirar(ENG.resumen, PERSONAS.resumen);
        try {
          const r = await pedirResumen(usuario, ENG.resumen, { dominio }, sinLlamar);
          esperar(r, 409, "sin consentimiento");
          revisar(cuerpo(r).error === MENSAJES_RESUMEN.sinConsentimiento, "mensaje distinto sin consentimiento");
          revisar(sinLlamar.llamadas() === 0, "se llamó al modelo");
          revisar((await auditoria(ENG.resumen)).length === filas, "hay fila en audit_log");
        } finally {
          await otorgar(ENG.resumen, PERSONAS.resumen);
        }

        const propuestas = await contar("fe_domain_summaries", ENG.resumen, `and dominio = '${dominio}'`);
        const durante = modeloResumen(salidaDe(CITA.deMemoria), () => retirar(ENG.resumen, PERSONAS.resumen));
        try {
          const r = await pedirResumen(usuario, ENG.resumen, { dominio }, durante);
          esperar(r, 409, "retiro durante la llamada");
          revisar(cuerpo(r).error === MENSAJES_RESUMEN.retiroDuranteLaLlamada, "mensaje distinto en el retiro");
          revisar((await contar("fe_domain_summaries", ENG.resumen, `and dominio = '${dominio}'`)) === propuestas, "se guardó el resumen");
          revisar((await auditoria(ENG.resumen)).length === filas + 1, "la llamada no quedó auditada");
        } finally {
          await otorgar(ENG.resumen, PERSONAS.resumen);
        }
      },
    },
    {
      id: "R-008.42",
      descripcion: "con el consentimiento retirado, decidir un resumen responde 409 y la fila sigue como owner",
      correr: async () => {
        const id = await pedirConExito("memoria_de_trabajo", CITA.deMemoria);
        await retirar(ENG.resumen, PERSONAS.resumen);
        try {
          const r = await aprobar(id);
          esperar(r, 409, "decidir");
          revisar(cuerpo(r).error === MENSAJES_RESUMEN.sinConsentimientoDecidir, "mensaje distinto");
          revisar((await resumenes(ENG.resumen)).length === 0, "RLS deja leer resúmenes sin consentimiento");
          revisar((await estadoResumen(id)).estado === "propuesto", "la fila cambió");
        } finally {
          await otorgar(ENG.resumen, PERSONAS.resumen);
        }
        esperar(await descartar(id), 200, "descartar con consentimiento");
      },
    },
    {
      id: "CA-008.38",
      descripcion: "una llamada exitosa deja una fila con acción, modelo, versión, tokens y latencia, y ninguna columna trae una cita",
      correr: async () => {
        const id = await pedirConExito("memoria_de_trabajo", CITA.deMemoria);
        const fila = (await auditoria(ENG.resumen)).at(-1)!.fila as Record<string, unknown>;
        revisar(fila.accion === "propose_fe_domain_summary", "acción distinta");
        revisar(fila.modelo === "modelo-simulado", "modelo distinto");
        revisar(fila.prompt_version === PROMPT_VERSION_RESUMEN_DOMINIO, `versión distinta: ${String(fila.prompt_version)}`);
        revisar(fila.tokens_entrada === 100 && fila.tokens_salida === 50, "faltan los tokens");
        revisar(fila.latencia_ms === 7, "falta la latencia");
        revisar(fila.ok === true && fila.error === null, "la fila no dice ok = true");
        revisar(fila.user_id === COACH, "la fila no trae al coach");
        const texto = JSON.stringify(fila);
        for (const c of Object.values(CITA)) revisar(!texto.includes(c), "una columna trae una cita");
        revisar(!texto.includes(oracionDe(CITA.deMemoria)), "una columna trae la oración");

        const [guardado] = await sql`select prompt_version, model, created_by, estado::text as estado, linea_ids from app.fe_domain_summaries where id = ${id}`;
        revisar(guardado.prompt_version === PROMPT_VERSION_RESUMEN_DOMINIO && guardado.model === "modelo-simulado", "el resumen no guarda modelo y versión");
        revisar(guardado.created_by === COACH && guardado.estado === "propuesto", "el resumen no guarda autor y estado");
        revisar((guardado.linea_ids as string[]).length === 1, "el resumen no guarda sus líneas");
        esperar(await descartar(id), 200, "descartar");
      },
    },
    {
      id: "CA-008.49",
      descripcion: "copiar en un resumen una observación que nunca entró al snapshot o que ya salió se marca, llega a citasBase y la decisión responde 400 sin snapshot, también si lo escribe el coach",
      correr: async () => {
        for (const engagementId of [ENG.perfil, ENG.seg]) {
          // Una de avance, que nunca entra a un snapshot, y otra de un cambio que el snapshot ya no trae:
          // el perfil de este acompañamiento no tiene ninguna, igual que si hubiera salido por el tope de 10.
          await sembrarEvento(engagementId, F1, { avance: [cita(CITA.avanceViejo, "planeacion_organizacion", "fortaleza")] });
          await sembrarEvento(engagementId, F2, { cambios: [cita(CITA.fueraDelSnapshot, "monitoreo_de_tareas", "fortaleza")] });
          const copias = [CITA.avanceViejo, CITA.fueraDelSnapshot];
          const seguimiento = engagementId === ENG.seg;
          const armar = (resumen: string) => {
            const cambios = [cambioFE([cita(CITA.nueva)], resumen)];
            return seguimiento ? updateSeguimiento(cambios) : updatePerfil(cambios);
          };

          for (const copia of copias) {
            let vistas: ObservacionPrompt[] = [];
            const r = await crearSesion(usuario, engagementId, { nota: NOTA_NUEVA }, modeloCon(armar(`Su coach anotó que ${copia} y sigue así.`), (o) => (vistas = o)));
            esperar(r, 200, "crear la sesión");
            revisar(vistas.some((o) => o.cita === copia && /^O-\d\d$/.test(o.ref)), "el modelo no recibió la observación con su O-nn");
            revisar(!JSON.stringify(vistas).includes(engagementId), "el modelo recibió un id de la base");

            const eventId = cuerpo(r).eventId!;
            const [evento] = await sql`select payload from app.profile_events where id = ${eventId}`;
            const payload = evento.payload as { banderas: Bandera[]; indiceObservaciones: { cita: string; lineaId: string }[] };
            revisar(
              payload.banderas.some((b) => b.motivo === "cita_en_texto_persona" && b.ruta === "cambios[0].resumen"),
              "la limpieza no le puso la bandera",
            );
            revisar(payload.indiceObservaciones.some((e) => e.cita === copia), "el payload no guarda la cita en el índice");

            const vista = await withRls(usuario.claims, (tx) => leerVistaPropuesta(tx, engagementId, eventId));
            revisar(vista?.citasBase.includes(copia), "citasBase no trae la observación");

            const snapshots = await contar("profile_snapshots", engagementId);
            const copiasPersona = await contar("persona_profiles", engagementId);
            const decision = await decidirPropuesta(usuario, eventId, { accion: "aprobar", aprobacion: { cambios: [0], senales: [] } });
            esperar(decision, 400, "aprobar con la cita copiada");
            revisar((await contar("profile_snapshots", engagementId)) === snapshots, "se creó un snapshot");
            revisar((await contar("persona_profiles", engagementId)) === copiasPersona, "se creó una copia para la persona");
          }

          // El coach escribe esa cita al editar el resumen.
          const limpia = await crearSesion(usuario, engagementId, { nota: NOTA_NUEVA }, modeloCon(armar("Aprende mejor con una guía escrita al lado.")));
          esperar(limpia, 200, "crear la sesión limpia");
          const eventId = cuerpo(limpia).eventId!;
          const snapshots = await contar("profile_snapshots", engagementId);
          for (const copia of copias) {
            const editada = await decidirPropuesta(usuario, eventId, {
              accion: "aprobar",
              aprobacion: { cambios: [0], senales: [], ediciones: [{ indice: 0, resumen: `Su coach anotó que ${copia} y sigue así.` }] },
            });
            esperar(editada, 400, "aprobar con la cita escrita por el coach");
            revisar((await contar("profile_snapshots", engagementId)) === snapshots, "se creó un snapshot");
          }
          // Control: sin copiar nada, la misma propuesta sí se aprueba.
          esperar(await decidirPropuesta(usuario, eventId, { accion: "aprobar", aprobacion: { cambios: [0], senales: [] } }), 200, "aprobar sin copiar");
          revisar((await contar("profile_snapshots", engagementId)) === snapshots + 1, "no se creó el snapshot");
        }
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
    const preparado = await preparar();
    // El log del servidor de estas funciones sí se revisa: no debe traer citas ni oraciones (C-17).
    const errorOriginal = console.error;
    const lineas: string[] = [];
    console.error = (...args: unknown[]) => void lineas.push(args.join(" "));
    try {
      for (const caso of casos(preparado)) {
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
    const conTexto = lineas.filter((l) => Object.values(CITA).some((c) => l.includes(c)));
    if (conTexto.length > 0) {
      fallas++;
      console.log(`FALLA R-008.39 el log del servidor trae texto de una cita: ${conTexto.length} líneas`);
    } else {
      console.log(`OK    R-008.39 ${lineas.length} líneas de log del servidor, ninguna con texto de una cita`);
    }
  } finally {
    await limpiar();
    await sql.end();
  }
  console.log(`\n${total - fallas} de ${total} casos pasaron. ${fallas ? `${fallas} fallaron.` : "Ninguno falló."} Se borró lo creado.`);
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => {
  console.error("trayectoria-check no pudo correr:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
