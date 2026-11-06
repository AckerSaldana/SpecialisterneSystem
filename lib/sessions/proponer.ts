// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Flujo de una sesión y de su propuesta (spec 001 y spec 004). Lo usan POST /sessions y el reintento.
//   1. tx1 (con RLS): engagement (404), consentimiento (409, R-004.2) y lo que va al modelo, con las
//      observaciones previas de la trayectoria (R-008.6). La etapa decide el flujo (R-004.57).
//   2. Fuera de cualquier transacción: el modelo (puede tardar varios segundos).
//   3. Limpieza con código, y después las etiquetas (R-008.7). Si la salida no cumple el contrato: 502
//      y ok = false (R-004.46, R-008.4).
//   4. La auditoría va en su propia transacción: una llamada exitosa queda registrada aunque después
//      falle el guardado (R-004.45). audit_log.error solo lleva clase y código (R-004.47).
//   5. tx2 (con RLS): guarda la propuesta con perfil_version_base y plan_base_id (R-004.27, R-004.41).
// Nada se aplica al perfil aquí: eso pasa cuando el coach aprueba (lib/followup/decision.ts).
// El modelo llega como parámetro para poder probar el flujo sin red (scripts/followup-check.ts).
import "server-only";
import { NoObjectGeneratedError } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/ai/audit";
import { MODEL_ID } from "@/lib/ai/model";
import { proposeFollowup, type ResultadoSeguimientoModelo } from "@/lib/ai/propose-followup";
import { proposeProfileUpdate, type ResultadoPropuesta, type UsoTokens } from "@/lib/ai/propose-profile-update";
import { ProposeRequest, type ProposeResponse } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { exigirConsentimiento } from "@/lib/consent";
import { withRls, type Tx } from "@/lib/db/rls";
import { engagements, followupContext, knowledgeCards, profileEvents, sessions, users } from "@/lib/db/schema";
import { armarIndicePlan, ultimoEstado } from "@/lib/followup/avance";
import { aRealizadaEn, esFechaFutura, hoyEnMonterrey } from "@/lib/followup/fecha";
import { leerEstadosSenales, leerPlanConAvance, leerUltimoSnapshot } from "@/lib/followup/lectura";
import { FollowupUpdateEtiquetado, PayloadSeguimientoIA, type EntradaIndicePlan, type TipoSesion } from "@/lib/followup/schema";
import { sanitizeFollowup } from "@/lib/followup/validate";
import { logError, resumirError } from "@/lib/log";
import { violaUnico } from "@/lib/plan/server";
import {
  PayloadPropuestaIA,
  PERFIL_VACIO,
  ProfileUpdateEtiquetado,
  type EntradaIndiceObservacion,
  type Perfil,
  type ProfileEventPayload,
} from "@/lib/profile/schema";
import { perfilConSenalesVigentes } from "@/lib/profile/senales";
import { sanitizeUpdate } from "@/lib/profile/validate";
import { PROMPT_VERSION, PROMPT_VERSION_SEGUIMIENTO, type FichaPrompt, type ItemPrompt, type ObservacionPrompt } from "@/lib/prompts";
import { leerTrayectoria } from "@/lib/trayectoria/lectura";
import { indiceObservaciones } from "@/lib/trayectoria/lineas";
import { limpiarEtiquetas } from "@/lib/trayectoria/validate";

const ACCION_PERFIL = "propose_profile_update";
const ACCION_SEGUIMIENTO = "propose_followup_update";

// Textos de la spec 004, "Pantallas y textos".
export const MENSAJES_SESION = {
  sinAcompanamiento: "No encontramos este acompañamiento.",
  sinSesion: "No encontramos esta sesión.",
  sinConsentimiento: "La persona no tiene consentimiento vigente. No se guardó la nota ni se envió a la IA.",
  retiroDuranteLaLlamada: "La persona retiró su consentimiento mientras se generaba la propuesta. La propuesta no se guardó.",
  fechaFutura: "La fecha de la sesión no puede ser después de hoy.",
  errorGuardarNota: "No se pudo guardar la nota. Intenta de nuevo.",
  errorModelo: "No se pudo generar la propuesta. La nota quedó guardada. Puedes pedir la propuesta otra vez sin escribirla de nuevo.",
  errorGuardarPropuesta: "No se pudo guardar la propuesta. La nota quedó guardada. Puedes pedir la propuesta otra vez sin escribirla de nuevo.",
  yaTienePropuesta: "Esta sesión ya tiene una propuesta.",
} as const;

export type DepsModelo = {
  proponerPerfil: (entrada: Parameters<typeof proposeProfileUpdate>[0]) => Promise<ResultadoPropuesta>;
  proponerSeguimiento: (entrada: Parameters<typeof proposeFollowup>[0]) => Promise<ResultadoSeguimientoModelo>;
};

const MODELO_REAL: DepsModelo = { proponerPerfil: proposeProfileUpdate, proponerSeguimiento: proposeFollowup };

type Engagement = { id: string; type: (typeof engagements.$inferSelect)["type"]; stage: (typeof engagements.$inferSelect)["stage"]; personaId: string };

// Lo que necesita el modelo. Sale de tx1 y se usa fuera de la transacción.
type EntradaModelo = {
  seguimiento: boolean;
  engagementType: Engagement["type"];
  nombrePila: string;
  perfilPrevio: Perfil;
  perfilVersionBase: number;
  planBaseId: string | null;
  indicePlan: EntradaIndicePlan[];
  itemsPlan: ItemPrompt[];
  contextoGuardado: { tipo: "pregunta" | "contexto" | "siguiente_paso"; texto: string }[];
  fichas: FichaPrompt[];
  // R-008.6: el modelo ve "observacionesPrevias"; el payload guarda "indiceObservaciones".
  observacionesPrevias: ObservacionPrompt[];
  indiceObservaciones: EntradaIndiceObservacion[];
};

async function leerEngagement(tx: Tx, engagementId: string): Promise<Engagement | null> {
  // RLS: si el coach no participa en este engagement, la consulta no devuelve filas.
  const [engagement] = await tx
    .select({ id: engagements.id, type: engagements.type, stage: engagements.stage, personaId: engagements.personaId })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  return engagement ?? null;
}

async function leerEntradaModelo(tx: Tx, engagement: Engagement): Promise<EntradaModelo> {
  const engagementId = engagement.id;
  const [persona] = await tx
    .select({ nombrePila: users.nombrePila })
    .from(users)
    .where(eq(users.id, engagement.personaId))
    .limit(1);

  const ultimo = await leerUltimoSnapshot(tx, engagementId);
  // R-004.52: ningún lector toma senalesActivas directo del snapshot.
  const perfilPrevio = perfilConSenalesVigentes(ultimo?.perfil ?? PERFIL_VACIO, await leerEstadosSenales(tx, engagementId));

  const plan = await leerPlanConAvance(tx, engagementId);
  const indicePlan = armarIndicePlan(plan.items);
  const itemsPlan = plan.items.map((item, i) => ({
    ref: indicePlan[i].ref,
    tipo: item.tipo,
    descripcion: item.descripcion,
    ultimoEstado: ultimoEstado(item.id, plan.cadena, plan.updates)?.estado ?? null,
  }));

  const seguimiento = engagement.stage === "seguimiento";
  const contextoGuardado = seguimiento
    ? await tx
        .select({ tipo: followupContext.tipo, texto: followupContext.texto })
        .from(followupContext)
        .where(and(eq(followupContext.engagementId, engagementId), isNull(followupContext.quitadaEn)))
    : [];
  // R-004.24: solo fichas verificadas, con el mismo filtro de 003.
  const fichas = seguimiento
    ? await tx
        .select({
          id: knowledgeCards.id,
          titulo: knowledgeCards.titulo,
          tipo: knowledgeCards.tipo,
          dominioFe: knowledgeCards.dominioFe,
          contenido: knowledgeCards.contenido,
        })
        .from(knowledgeCards)
        .where(eq(knowledgeCards.verificada, true))
        .orderBy(knowledgeCards.id)
    : [];

  const { lineas } = await leerTrayectoria(tx, engagementId);
  const { indice, observaciones } = indiceObservaciones(lineas);

  return {
    seguimiento,
    engagementType: engagement.type,
    // Si por alguna razón no se puede leer el nombre, el prompt usa un genérico.
    nombrePila: persona?.nombrePila ?? "la persona",
    perfilPrevio,
    perfilVersionBase: ultimo?.version ?? 0,
    planBaseId: plan.vigente?.id ?? null,
    indicePlan,
    itemsPlan,
    contextoGuardado,
    fichas,
    observacionesPrevias: observaciones,
    indiceObservaciones: indice,
  };
}

// Pide la propuesta para una sesión ya guardada, la limpia, la audita y la guarda.
async function proponerYGuardar(
  user: UsuarioRuta,
  engagementId: string,
  sesion: { id: string; nota: string; tipo: TipoSesion },
  entrada: EntradaModelo,
  modelo: DepsModelo,
): Promise<RespuestaRuta> {
  const accion = entrada.seguimiento ? ACCION_SEGUIMIENTO : ACCION_PERFIL;
  const promptVersion = entrada.seguimiento ? PROMPT_VERSION_SEGUIMIENTO : PROMPT_VERSION;

  const auditar = async (datos: {
    ok: boolean;
    modelo: string;
    promptVersion: string;
    latenciaMs: number;
    usage?: UsoTokens;
    error?: string;
  }) => {
    try {
      await withRls(user.claims, (tx) =>
        registrarAuditoria(tx, {
          userId: user.id,
          engagementId,
          accion,
          modelo: datos.modelo,
          promptVersion: datos.promptVersion,
          tokensEntrada: datos.usage?.entrada,
          tokensSalida: datos.usage?.salida,
          tokensCacheLectura: datos.usage?.cacheLectura,
          latenciaMs: datos.latenciaMs,
          ok: datos.ok,
          error: datos.error,
        }),
      );
    } catch (e) {
      // Si tampoco se puede auditar, el log del servidor registra solo la acción y el código.
      logError(`${accion}: no se pudo escribir audit_log`, e);
    }
  };

  const inicio = Date.now();
  let resultado: ResultadoPropuesta | ResultadoSeguimientoModelo;
  try {
    resultado = entrada.seguimiento
      ? await modelo.proponerSeguimiento({
          nota: sesion.nota,
          nombrePila: entrada.nombrePila,
          engagementType: entrada.engagementType,
          tipoSesion: sesion.tipo,
          perfilPrevio: entrada.perfilPrevio,
          itemsPlan: entrada.itemsPlan,
          contextoGuardado: entrada.contextoGuardado,
          fichas: entrada.fichas,
          observacionesPrevias: entrada.observacionesPrevias,
        })
      : await modelo.proponerPerfil({
          nota: sesion.nota,
          nombrePila: entrada.nombrePila,
          engagementType: entrada.engagementType,
          perfilPrevio: entrada.perfilPrevio,
          observacionesPrevias: entrada.observacionesPrevias,
        });
  } catch (e) {
    logError(`${accion}: error del modelo`, e);
    // Una salida que no pasa el esquema también se cobró: la fila lleva sus tokens (R-004.35).
    const uso = NoObjectGeneratedError.isInstance(e) ? e.usage : undefined;
    await auditar({
      ok: false,
      modelo: MODEL_ID,
      promptVersion,
      latenciaMs: Date.now() - inicio,
      usage: uso
        ? { entrada: uso.inputTokens ?? null, salida: uso.outputTokens ?? null, cacheLectura: uso.inputTokenDetails?.cacheReadTokens ?? null }
        : undefined,
      error: resumirError(e),
    });
    return conError(502, MENSAJES_SESION.errorModelo, { sessionId: sesion.id });
  }

  const datosRespuesta = {
    modelo: resultado.modelo,
    promptVersion: resultado.promptVersion,
    latenciaMs: resultado.latenciaMs,
    usage: resultado.usage,
  };

  // Validación final antes de escribir: si algo no cumple el contrato, falla aquí y no en la UI.
  // El esquema estricto va primero: sanitize arma objetos nuevos y dejaría fuera una llave extra,
  // como un puntaje o una severidad, sin que nadie se entere (R-004.14). Es el etiquetado, no el de
  // lectura, porque el de lectura también aceptaría una cita sin etiquetas (R-008.4).
  const { indiceObservaciones: indice } = entrada;
  const citasPrevias = indice.map((e) => e.cita);
  let payload: ProfileEventPayload;
  try {
    if (entrada.seguimiento) {
      const limpio = sanitizeFollowup(FollowupUpdateEtiquetado.parse(resultado.update), sesion.nota, {
        indicePlan: entrada.indicePlan,
        fichasVerificadas: entrada.fichas.map((f) => f.id),
        citasPrevias,
      });
      payload = PayloadSeguimientoIA.parse({
        tipo: "propuesta_seguimiento",
        ...limpiarEtiquetas(limpio, indice),
        indicePlan: entrada.indicePlan,
        indiceObservaciones: indice,
      });
    } else {
      const limpio = sanitizeUpdate(ProfileUpdateEtiquetado.parse(resultado.update), sesion.nota, citasPrevias, entrada.perfilPrevio);
      payload = PayloadPropuestaIA.parse({ tipo: "propuesta_ia", ...limpiarEtiquetas(limpio, indice), indiceObservaciones: indice });
    }
  } catch (e) {
    logError(`${accion}: la salida del modelo no cumple el contrato`, e);
    await auditar({ ok: false, ...datosRespuesta, error: resumirError(e) });
    return conError(502, MENSAJES_SESION.errorModelo, { sessionId: sesion.id });
  }

  await auditar({ ok: true, ...datosRespuesta });

  try {
    const eventId = await withRls(user.claims, async (tx) => {
      // El consentimiento pudo retirarse mientras esperábamos al modelo. Un reintento no serviría.
      if (!(await exigirConsentimiento(tx, engagementId))) return null;
      const [evento] = await tx
        .insert(profileEvents)
        .values({
          engagementId,
          sessionId: sesion.id,
          tipo: "propuesta_ia",
          status: "proposed",
          payload,
          promptVersion: resultado.promptVersion,
          model: resultado.modelo,
          createdBy: user.id,
          perfilVersionBase: entrada.perfilVersionBase,
          planBaseId: entrada.planBaseId,
        })
        .returning({ id: profileEvents.id });
      return evento.id;
    });
    if (!eventId) return conError(409, MENSAJES_SESION.retiroDuranteLaLlamada);
    return { status: 200, cuerpo: { sessionId: sesion.id, eventId } satisfies ProposeResponse };
  } catch (e) {
    // Dos reintentos al mismo tiempo: el índice único deja solo la primera propuesta (R-004.30).
    if (violaUnico(e, "profile_events_una_propuesta")) {
      const eventId = await withRls(user.claims, (tx) => propuestaDeSesion(tx, sesion.id));
      return conError(409, MENSAJES_SESION.yaTienePropuesta, { sessionId: sesion.id, eventId: eventId ?? undefined });
    }
    logError(`${accion}: error al guardar la propuesta`, e);
    return conError(500, MENSAJES_SESION.errorGuardarPropuesta, { sessionId: sesion.id });
  }
}

async function propuestaDeSesion(tx: Tx, sessionId: string): Promise<string | null> {
  const [evento] = await tx
    .select({ id: profileEvents.id })
    .from(profileEvents)
    .where(and(eq(profileEvents.sessionId, sessionId), eq(profileEvents.tipo, "propuesta_ia")))
    .limit(1);
  return evento?.id ?? null;
}

// POST /api/engagements/[id]/sessions
export async function crearSesion(
  user: UsuarioRuta,
  engagementId: string,
  body: unknown,
  modelo: DepsModelo = MODELO_REAL,
): Promise<RespuestaRuta> {
  const parsed = ProposeRequest.safeParse(body);
  if (!parsed.success) return conError(400, parsed.error.issues[0]?.message ?? "La nota no es válida.");
  const { nota, tipo, fecha, observador } = parsed.data;

  let contexto;
  try {
    contexto = await withRls(user.claims, async (tx) => {
      const engagement = await leerEngagement(tx, engagementId);
      if (!engagement) return conError(404, MENSAJES_SESION.sinAcompanamiento);
      // Sin consentimiento vigente no se guarda la nota ni se manda a la IA. Es el mismo chequeo
      // que la política sessions_insert_coach (R-002.31): ninguna otra columna decide.
      if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, MENSAJES_SESION.sinConsentimiento);

      // R-004.57: solo en seguimiento cuentan el tipo y la fecha; en otra etapa se ignoran.
      const seguimiento = engagement.stage === "seguimiento";
      const fechaSesion = seguimiento ? (fecha ?? hoyEnMonterrey()) : null;
      if (fechaSesion && esFechaFutura(fechaSesion)) return conError(400, MENSAJES_SESION.fechaFutura);
      const tipoSesion: TipoSesion = seguimiento ? (tipo ?? "persona") : "persona";

      const entrada = await leerEntradaModelo(tx, engagement);
      const [sesion] = await tx
        .insert(sessions)
        .values({
          engagementId,
          coachId: user.id,
          notaOriginal: nota,
          tipo: tipoSesion,
          observador: seguimiento ? null : observador || null, // R-011.2
          ...(fechaSesion ? { realizadaEn: aRealizadaEn(fechaSesion) } : {}),
        })
        .returning({ id: sessions.id });
      return { sesion: { id: sesion.id, nota, tipo: tipoSesion }, entrada };
    });
  } catch (e) {
    logError("sessions: error al guardar la sesión", e);
    return conError(500, MENSAJES_SESION.errorGuardarNota);
  }
  if ("status" in contexto) return contexto;

  return proponerYGuardar(user, engagementId, contexto.sesion, contexto.entrada, modelo);
}

// POST /api/engagements/[id]/sessions/[sessionId]/proposal (R-004.29, R-004.30)
export async function reintentarPropuesta(
  user: UsuarioRuta,
  engagementId: string,
  sessionId: string,
  modelo: DepsModelo = MODELO_REAL,
): Promise<RespuestaRuta> {
  let contexto;
  try {
    contexto = await withRls(user.claims, async (tx) => {
      const engagement = await leerEngagement(tx, engagementId);
      if (!engagement) return conError(404, MENSAJES_SESION.sinAcompanamiento);
      // Con el consentimiento retirado RLS oculta la sesión: este chequeo va antes de leerla, y el
      // 409 no lleva eventId (R-004.48).
      if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, MENSAJES_SESION.sinConsentimiento);

      const [sesion] = await tx
        .select({ id: sessions.id, nota: sessions.notaOriginal, tipo: sessions.tipo })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.engagementId, engagementId)))
        .limit(1);
      if (!sesion) return conError(404, MENSAJES_SESION.sinSesion);

      const eventId = await propuestaDeSesion(tx, sessionId);
      if (eventId) return conError(409, MENSAJES_SESION.yaTienePropuesta, { sessionId, eventId });

      return { sesion, entrada: await leerEntradaModelo(tx, engagement) };
    });
  } catch (e) {
    logError("sessions: error al leer la sesión del reintento", e);
    return conError(500, MENSAJES_SESION.errorGuardarPropuesta, { sessionId });
  }
  if ("status" in contexto) return contexto;

  return proponerYGuardar(user, engagementId, contexto.sesion, contexto.entrada, modelo);
}
