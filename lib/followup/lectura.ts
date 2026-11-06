// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Lecturas de seguimiento que comparten rutas y páginas (spec 004). Todo recibe la transacción de
// withRls: con el consentimiento retirado, RLS no devuelve filas (R-004.48).
import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Tx } from "@/lib/db/rls";
import {
  followupContext,
  knowledgeCards,
  planItems,
  planItemUpdates,
  plans,
  profileEvents,
  profileSnapshots,
  sessions,
  signalStates,
  strongAlerts,
  users,
} from "@/lib/db/schema";
import { leerAtorados, type FilaAtorado } from "@/lib/desglose/lectura";
import { citasDePropuesta, comoFollowup } from "@/lib/followup/aprobacion";
import { historialDeItem, itemEquivalente, itemsFueraDelPlan, ultimoEstado, type FilaAvance, type ItemCadena } from "@/lib/followup/avance";
import { PayloadSeguimientoIA, type EntradaIndicePlan, type FollowupUpdate, type TipoSesion } from "@/lib/followup/schema";
import { citasDelPerfil, planVigente } from "@/lib/plan/server";
import { PayloadPropuestaIA, PERFIL_VACIO, type Bandera, type Descartado, type Perfil, type SenalActiva } from "@/lib/profile/schema";
import { senalesVigentes, type EstadoSenal } from "@/lib/profile/senales";


// ---------------------------------------------------------------------------
// Señales y último perfil
// ---------------------------------------------------------------------------

export async function leerEstadosSenales(tx: Tx, engagementId: string): Promise<EstadoSenal[]> {
  return tx
    .select({ tipo: signalStates.tipo, estado: signalStates.estado, createdAt: signalStates.createdAt })
    .from(signalStates)
    .where(eq(signalStates.engagementId, engagementId));
}

export async function leerUltimoSnapshot(tx: Tx, engagementId: string): Promise<{ version: number; perfil: Perfil } | null> {
  const [ultimo] = await tx
    .select({ version: profileSnapshots.version, perfil: profileSnapshots.perfil })
    .from(profileSnapshots)
    .where(eq(profileSnapshots.engagementId, engagementId))
    .orderBy(desc(profileSnapshots.version))
    .limit(1);
  return ultimo ?? null;
}

// ---------------------------------------------------------------------------
// Plan vigente con su avance
// ---------------------------------------------------------------------------

export type ItemVigente = { id: string; tipo: (typeof planItems.$inferSelect)["tipo"]; descripcion: string; origenItemId: string | null };

export type PlanConAvance = {
  vigente: { id: string; version: number } | null;
  items: ItemVigente[];
  // Todos los ítems de planes aprobados, para seguir origen_item_id hacia atrás (R-004.40).
  cadena: ItemCadena[];
  updates: FilaAvance[];
};

export async function leerPlanConAvance(tx: Tx, engagementId: string): Promise<PlanConAvance> {
  const vigente = await planVigente(tx, engagementId);
  if (!vigente) return { vigente: null, items: [], cadena: [], updates: [] };

  const items = await tx
    .select({ id: planItems.id, tipo: planItems.tipo, descripcion: planItems.descripcion, origenItemId: planItems.origenItemId })
    .from(planItems)
    .where(eq(planItems.planId, vigente.id))
    .orderBy(asc(planItems.orden), asc(planItems.createdAt));

  const cadena = await tx
    .select({ id: planItems.id, origenItemId: planItems.origenItemId, descripcion: planItems.descripcion })
    .from(planItems)
    .innerJoin(plans, eq(plans.id, planItems.planId))
    .where(and(eq(planItems.engagementId, engagementId), eq(plans.status, "aprobado")));

  const updates = await tx
    .select({
      planItemId: planItemUpdates.planItemId,
      estado: planItemUpdates.estado,
      resumen: planItemUpdates.resumen,
      approvedAt: planItemUpdates.approvedAt,
      aprobadoPor: users.nombrePila,
    })
    .from(planItemUpdates)
    .leftJoin(users, eq(users.id, planItemUpdates.approvedBy))
    .where(eq(planItemUpdates.engagementId, engagementId));

  return { vigente, items, cadena, updates };
}

// ---------------------------------------------------------------------------
// Panel "Antes de esta sesión" y página del acompañamiento
// ---------------------------------------------------------------------------

export type FilaContexto = {
  id: string;
  tipo: "pregunta" | "contexto" | "siguiente_paso";
  texto: string;
  saleDe: string | null;
  quitadaEn: Date | null;
  quitadaPor: string | null;
};

export type AvanceDeItem = {
  id: string;
  descripcion: string;
  ultimo: FilaAvance | null;
  historial: FilaAvance[];
};

export type FilaEstadoSenal = {
  id: string;
  tipo: EstadoSenal["tipo"];
  estado: EstadoSenal["estado"];
  motivo: string | null;
  createdAt: Date;
  por: string | null;
};

export type FilaAlerta = {
  id: string;
  tipoSenal: EstadoSenal["tipo"];
  estado: "abierta" | "escalada" | "atendida";
  nota: string | null;
  notaEscalada: string | null;
  marcadaEn: Date;
  escaladaEn: Date | null;
  atendidaEn: Date | null;
};

export type DatosSeguimiento = {
  sesiones: { id: string; tipo: TipoSesion; realizadaEn: Date }[];
  ultimaSesion: { tipo: TipoSesion; realizadaEn: Date } | null;
  guardado: FilaContexto[];
  quitado: FilaContexto[];
  avance: AvanceDeItem[];
  // Puntos con avance que ya no están en el plan vigente: solo para el historial.
  avanceFuera: AvanceDeItem[];
  senales: SenalActiva[];
  estadosSenal: FilaEstadoSenal[];
  alertas: FilaAlerta[];
  pendientes: { id: string; fecha: Date | null }[];
  sinPropuesta: { id: string; fecha: Date }[];
  hayPlanVigente: boolean;
  // "Me atoré aquí" sin revisar, aparte de las señales: no entra a senales, a signal_states ni al mensaje de
  // seguimiento, y no se cuenta (R-010.30, R-010.31).
  atorados: FilaAtorado[];
};

export async function leerSeguimiento(tx: Tx, engagementId: string, perfil: Perfil | null): Promise<DatosSeguimiento> {
  const sesiones = await tx
    .select({ id: sessions.id, tipo: sessions.tipo, realizadaEn: sessions.realizadaEn })
    .from(sessions)
    .where(eq(sessions.engagementId, engagementId))
    .orderBy(desc(sessions.realizadaEn), desc(sessions.createdAt));

  const quito = alias(users, "quito");
  const filasContexto = await tx
    .select({
      id: followupContext.id,
      tipo: followupContext.tipo,
      texto: followupContext.texto,
      item: planItems.descripcion,
      ficha: knowledgeCards.titulo,
      quitadaEn: followupContext.quitadaEn,
      quitadaPor: quito.nombrePila,
    })
    .from(followupContext)
    .leftJoin(planItems, eq(planItems.id, followupContext.planItemId))
    .leftJoin(knowledgeCards, eq(knowledgeCards.id, followupContext.knowledgeCardId))
    .leftJoin(quito, eq(quito.id, followupContext.quitadaPor))
    .where(eq(followupContext.engagementId, engagementId))
    .orderBy(asc(followupContext.approvedAt));
  const contexto: FilaContexto[] = filasContexto.map(({ item, ficha, ...f }) => ({ ...f, saleDe: item ?? ficha }));

  const plan = await leerPlanConAvance(tx, engagementId);
  const avance: AvanceDeItem[] = plan.items.map((item) => ({
    id: item.id,
    descripcion: item.descripcion,
    ultimo: ultimoEstado(item.id, plan.cadena, plan.updates),
    historial: historialDeItem(item.id, plan.cadena, plan.updates),
  }));
  const avanceFuera: AvanceDeItem[] = itemsFueraDelPlan(plan.items.map((i) => i.id), plan.cadena, plan.updates).map((id) => ({
    id,
    descripcion: plan.cadena.find((i) => i.id === id)?.descripcion ?? "Punto de una versión anterior",
    ultimo: ultimoEstado(id, plan.cadena, plan.updates),
    historial: historialDeItem(id, plan.cadena, plan.updates),
  }));

  const quien = alias(users, "quien");
  const estadosSenal = await tx
    .select({
      id: signalStates.id,
      tipo: signalStates.tipo,
      estado: signalStates.estado,
      motivo: signalStates.motivo,
      createdAt: signalStates.createdAt,
      por: quien.nombrePila,
    })
    .from(signalStates)
    .leftJoin(quien, eq(quien.id, signalStates.createdBy))
    .where(eq(signalStates.engagementId, engagementId))
    .orderBy(desc(signalStates.createdAt));

  const alertas = await tx
    .select({
      id: strongAlerts.id,
      tipoSenal: strongAlerts.tipoSenal,
      estado: strongAlerts.estado,
      nota: strongAlerts.nota,
      notaEscalada: strongAlerts.notaEscalada,
      marcadaEn: strongAlerts.marcadaEn,
      escaladaEn: strongAlerts.escaladaEn,
      atendidaEn: strongAlerts.atendidaEn,
    })
    .from(strongAlerts)
    .where(eq(strongAlerts.engagementId, engagementId))
    .orderBy(desc(strongAlerts.marcadaEn));

  // Propuesta sin revisar (R-004.26) y sesiones sin propuesta (R-004.31).
  const pendientes = await tx
    .select({ id: profileEvents.id, fecha: sessions.realizadaEn })
    .from(profileEvents)
    .leftJoin(sessions, eq(sessions.id, profileEvents.sessionId))
    .where(
      and(
        eq(profileEvents.engagementId, engagementId),
        eq(profileEvents.tipo, "propuesta_ia"),
        eq(profileEvents.status, "proposed"),
      ),
    )
    .orderBy(desc(profileEvents.createdAt));

  const sinPropuesta = await tx
    .select({ id: sessions.id, fecha: sessions.realizadaEn })
    .from(sessions)
    .leftJoin(profileEvents, and(eq(profileEvents.sessionId, sessions.id), eq(profileEvents.tipo, "propuesta_ia")))
    .where(and(eq(sessions.engagementId, engagementId), isNull(profileEvents.id)))
    .orderBy(desc(sessions.realizadaEn));

  return {
    sesiones,
    ultimaSesion: sesiones[0] ?? null,
    guardado: contexto.filter((c) => c.quitadaEn === null),
    quitado: contexto.filter((c) => c.quitadaEn !== null),
    avance,
    avanceFuera,
    senales: senalesVigentes(perfil ?? PERFIL_VACIO, estadosSenal),
    estadosSenal,
    alertas,
    pendientes,
    sinPropuesta,
    hayPlanVigente: plan.vigente !== null,
    atorados: await leerAtorados(tx, engagementId),
  };
}

// ---------------------------------------------------------------------------
// Revisión de una propuesta: se arma con lo guardado, sin llamar al modelo (R-004.26)
// ---------------------------------------------------------------------------

export type VistaPropuesta = {
  eventId: string;
  engagementId: string;
  status: "proposed" | "approved" | "rejected";
  seguimiento: boolean; // propuesta de seguimiento o de 001
  modelo: string | null;
  promptVersion: string | null;
  update: FollowupUpdate;
  descartados: Descartado[];
  banderas: Bandera[];
  indicePlan: EntradaIndicePlan[];
  sesion: { tipo: TipoSesion; fecha: Date; observador: string | null } | null;
  // Spec 011 (R-011.8): de qué sesión sale la frase anterior de cada relación.
  origenes: Record<string, { observador: string | null; fecha: Date }>;
  nota: string | null;
  avisoPerfil: { base: number; actual: number } | null;
  avisoPlan: { base: number; actual: number } | null;
  // Índices de update.avance cuyo ítem ya no tiene equivalente en la versión vigente (R-004.41).
  avanceSinEquivalente: number[];
  pasoSinEquivalente: boolean;
  // Citas de la propuesta, del último snapshot y de las observaciones previas, para revisar el texto
  // en pantalla (R-004.59, R-008.6).
  citasBase: string[];
  fichas: Record<string, string>;
};

export async function leerVistaPropuesta(tx: Tx, engagementId: string, eventId: string): Promise<VistaPropuesta | null> {
  const [evento] = await tx
    .select({
      id: profileEvents.id,
      tipo: profileEvents.tipo,
      status: profileEvents.status,
      payload: profileEvents.payload,
      modelo: profileEvents.model,
      promptVersion: profileEvents.promptVersion,
      perfilVersionBase: profileEvents.perfilVersionBase,
      planBaseId: profileEvents.planBaseId,
      sesionTipo: sessions.tipo,
      sesionFecha: sessions.realizadaEn,
      sesionObservador: sessions.observador,
      nota: sessions.notaOriginal,
    })
    .from(profileEvents)
    .leftJoin(sessions, eq(sessions.id, profileEvents.sessionId))
    .where(and(eq(profileEvents.id, eventId), eq(profileEvents.engagementId, engagementId)))
    .limit(1);
  if (!evento || evento.tipo !== "propuesta_ia") return null;

  const seguimiento = evento.payload.tipo === "propuesta_seguimiento";
  const payload = seguimiento ? PayloadSeguimientoIA.parse(evento.payload) : PayloadPropuestaIA.parse(evento.payload);
  const update = "indicePlan" in payload ? payload.update : comoFollowup(payload.update);
  const indicePlan = "indicePlan" in payload ? payload.indicePlan : [];

  const ultimo = await leerUltimoSnapshot(tx, engagementId);
  const actualPerfil = ultimo?.version ?? 0;
  const avisoPerfil =
    evento.perfilVersionBase !== null && evento.perfilVersionBase !== actualPerfil
      ? { base: evento.perfilVersionBase, actual: actualPerfil }
      : null;

  const plan = await leerPlanConAvance(tx, engagementId);
  let avisoPlan: VistaPropuesta["avisoPlan"] = null;
  if (evento.planBaseId && plan.vigente && evento.planBaseId !== plan.vigente.id) {
    const [base] = await tx.select({ version: plans.version }).from(plans).where(eq(plans.id, evento.planBaseId)).limit(1);
    if (base?.version) avisoPlan = { base: base.version, actual: plan.vigente.version };
  }

  const vigentes = plan.items.map((i) => i.id);
  const sinEquivalente = (ref: string) => {
    const entrada = indicePlan.find((e) => e.ref === ref);
    return !entrada || itemEquivalente(entrada.planItemId, vigentes, plan.cadena) === null;
  };
  const avanceSinEquivalente = update.avance.flatMap((a, i) => (sinEquivalente(a.itemRef) ? [i] : []));
  const pasoSinEquivalente = update.siguientePaso?.itemRef ? sinEquivalente(update.siguientePaso.itemRef) : false;

  const fichaId = update.siguientePaso?.fichaId;
  const fichas: Record<string, string> = {};
  if (fichaId) {
    const [ficha] = await tx
      .select({ titulo: knowledgeCards.titulo })
      .from(knowledgeCards)
      .where(eq(knowledgeCards.id, fichaId))
      .limit(1);
    if (ficha) fichas[fichaId] = ficha.titulo;
  }

  const sesionesPrevias = [...new Set(update.relacionesConPerfilPrevio.flatMap((r) => (r.sesionPrevia ? [r.sesionPrevia] : [])))];
  const origenes: VistaPropuesta["origenes"] = {};
  if (sesionesPrevias.length > 0) {
    const filas = await tx
      .select({ id: sessions.id, observador: sessions.observador, fecha: sessions.realizadaEn })
      .from(sessions)
      .where(and(inArray(sessions.id, sesionesPrevias), eq(sessions.engagementId, engagementId)));
    for (const { id, observador, fecha } of filas) origenes[id] = { observador, fecha };
  }

  return {
    eventId: evento.id,
    engagementId,
    status: evento.status,
    seguimiento,
    modelo: evento.modelo,
    promptVersion: evento.promptVersion,
    update,
    descartados: payload.descartados,
    banderas: payload.banderas,
    indicePlan,
    sesion: evento.sesionTipo && evento.sesionFecha ? { tipo: evento.sesionTipo, fecha: evento.sesionFecha, observador: evento.sesionObservador } : null,
    origenes,
    nota: evento.nota,
    avisoPerfil,
    avisoPlan,
    avanceSinEquivalente,
    pasoSinEquivalente,
    citasBase: [...citasDePropuesta(update), ...citasDelPerfil(ultimo?.perfil ?? PERFIL_VACIO), ...payload.indiceObservaciones.map((e) => e.cita)],
    fichas,
  };
}
