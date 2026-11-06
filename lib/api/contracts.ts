// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Contratos de los Route Handlers. El servidor valida el body con estos esquemas
// y la UI usa los mismos tipos para leer la respuesta.
import { z } from "zod";
import { ApiError, FeedbackCuerpo, FeedbackResponse } from "@/lib/api/contracts-cliente";
import { ContextoDesglose, MAX_ACCION, MAX_CRITERIO, MAX_PASOS, MAX_TAREA, MIN_TAREA } from "@/lib/desglose/schema-cliente";
import { TipoSesion } from "@/lib/followup/schema";
import { Aprobacion, DimensionId, DireccionFE, DominioFE, TipoSenal } from "@/lib/profile/schema";
import { BanderaPlan, EvidenciaPlan, OrigenItemPlan, TipoItemPlan } from "@/lib/plan/schema";

// POST /api/engagements/[id]/sessions
// Crea la sesión con la nota original, pide la propuesta a la IA, la valida y
// guarda un profile_event con status "proposed". Nada se aplica al perfil todavía.
// "tipo" y "fecha" solo cuentan en etapa de seguimiento (R-004.57).
export const ProposeRequest = z.strictObject({
  nota: z
    .string()
    .trim()
    .min(20, "La nota necesita al menos 20 caracteres.")
    .max(20000, "La nota puede tener hasta 20,000 caracteres."),
  tipo: TipoSesion.optional(),
  fecha: z.iso.date("Escribe la fecha de la sesión.").optional(),
  // Solo cuenta fuera de seguimiento (R-011.2).
  observador: z.string().trim().max(80, "Quién observó puede tener hasta 80 caracteres.").optional(),
});
export type ProposeRequest = z.infer<typeof ProposeRequest>;

// Lo mismo responde el reintento. La página de revisión lee el resto de profile_events (R-004.26).
export const ProposeResponse = z.strictObject({
  sessionId: z.uuid(),
  eventId: z.uuid(),
});
export type ProposeResponse = z.infer<typeof ProposeResponse>;

// POST /api/profile-events/[id]/decision
// El coach aprueba una parte (o todo) o rechaza. Aprobar crea un profile_snapshot nuevo.
export const DecisionRequest = z.discriminatedUnion("accion", [
  z.strictObject({ accion: z.literal("aprobar"), aprobacion: Aprobacion }),
  z.strictObject({ accion: z.literal("rechazar") }),
]);
export type DecisionRequest = z.infer<typeof DecisionRequest>;

export const DecisionResponse = z.strictObject({
  eventId: z.uuid(),
  status: z.enum(["approved", "rejected"]),
  snapshotId: z.uuid().nullable(),
  version: z.int().nullable(),
});
export type DecisionResponse = z.infer<typeof DecisionResponse>;

// POST /api/engagements/[id]/signals/[tipo]/close
export const CerrarSenalRequest = z.strictObject({ motivo: z.string().trim().max(1000).optional() });
export type CerrarSenalRequest = z.infer<typeof CerrarSenalRequest>;

// POST /api/engagements/[id]/alerts
export const CrearAlertaRequest = z.strictObject({
  tipoSenal: TipoSenal,
  nota: z.string().trim().max(1000).optional(),
});
export type CrearAlertaRequest = z.infer<typeof CrearAlertaRequest>;

// PATCH /api/alerts/[id]   ("Ya la pasé" y "Atendida")
export const CambiarAlertaRequest = z.strictObject({
  estado: z.enum(["escalada", "atendida"]),
  notaEscalada: z.string().trim().max(1000).optional(),
});
export type CambiarAlertaRequest = z.infer<typeof CambiarAlertaRequest>;

// POST /api/persona/feedback   (botón "esto no me representa")
// El cuerpo vive en contracts-cliente.ts, porque también corre en el navegador de la persona. El
// servidor además valida "dimension" contra DimensionId. Sigue siendo estricto.
export const FeedbackRequest = FeedbackCuerpo.extend({ dimension: DimensionId.nullable() });
export type FeedbackRequest = z.infer<typeof FeedbackRequest>;

export { FeedbackResponse };

// POST /api/profile-events/[id]/cierre   (el coach cierra un "no me representa", R-005.26, R-005.34)
// Con origen "perfil", "con_cambios" exige resueltoPorEvento; con origen "plan", resueltoPorPlan.
// Eso depende del evento, así que lo revisa lib/persona/cierre-comentario.ts.
export const CerrarComentarioRequest = z.discriminatedUnion("resultado", [
  z.strictObject({ resultado: z.literal("sin_cambios") }),
  z.strictObject({
    resultado: z.literal("con_cambios"),
    resueltoPorEvento: z.uuid().optional(),
    resueltoPorPlan: z.uuid().optional(),
  }),
]);
export type CerrarComentarioRequest = z.infer<typeof CerrarComentarioRequest>;

export const CerrarComentarioResponse = z.strictObject({
  eventId: z.uuid(),
  status: z.enum(["approved", "rejected"]),
});
export type CerrarComentarioResponse = z.infer<typeof CerrarComentarioResponse>;

// ---------------------------------------------------------------------------
// Plan de acompañamiento (spec 003)
// ---------------------------------------------------------------------------

// Un ítem del plan como lo ve el coach, con sus banderas recalculadas (R-003.27).
export const ItemPlanVista = z.strictObject({
  id: z.uuid(),
  tipo: TipoItemPlan,
  descripcion: z.string(),
  textoPersona: z.string().nullable(),
  fichaId: z.string().nullable(),
  dominioFe: z.string().nullable(),
  evidencia: z.array(EvidenciaPlan),
  orden: z.int(),
  origen: OrigenItemPlan,
  origenItemId: z.uuid().nullable(),
  banderas: z.array(BanderaPlan),
});
export type ItemPlanVista = z.infer<typeof ItemPlanVista>;

// POST /api/engagements/[id]/plans   (sin body)
// Pide la propuesta a la IA y guarda el borrador. 409 sin perfil, sin consentimiento o con borrador abierto.
export const ProposePlanResponse = z.strictObject({ planId: z.uuid() });
export type ProposePlanResponse = z.infer<typeof ProposePlanResponse>;

// POST /api/plans/[id]/items   (el coach agrega un punto propio, sin evidencia: R-003.23, R-003.25)
export const ItemPlanCrear = z.strictObject({
  tipo: TipoItemPlan,
  descripcion: z.string().trim().min(1, "Escribe el punto.").max(800),
  textoPersona: z.string().trim().min(1).max(400).nullable(),
  fichaId: z.string().nullable(),
  origenItemId: z.uuid().nullable(),
});
export type ItemPlanCrear = z.infer<typeof ItemPlanCrear>;

// PATCH /api/plan-items/[id]   (editar un punto del borrador). Estricto: un campo "tipo" responde 400
// (R-003.26). Las citas solo se quitan, por índice; el coach no escribe citas (R-003.24).
export const ItemPlanEditar = z.strictObject({
  descripcion: z.string().trim().min(1, "Escribe el punto.").max(800).optional(),
  textoPersona: z.string().trim().min(1).max(400).nullable().optional(),
  fichaId: z.string().nullable().optional(),
  quitarEvidencia: z.array(z.int().nonnegative()).optional(),
  orden: z.int().optional(),
  origenItemId: z.uuid().nullable().optional(),
});
export type ItemPlanEditar = z.infer<typeof ItemPlanEditar>;

// Respuesta de crear y editar.
export const ItemPlanRespuesta = z.strictObject({ item: ItemPlanVista });
export type ItemPlanRespuesta = z.infer<typeof ItemPlanRespuesta>;

// DELETE /api/plan-items/[id] responde { ok: true }.

// POST /api/plans/[id]/decision
export const PlanDecisionRequest = z.discriminatedUnion("accion", [
  z.strictObject({ accion: z.literal("aprobar") }),
  z.strictObject({ accion: z.literal("descartar") }),
]);
export type PlanDecisionRequest = z.infer<typeof PlanDecisionRequest>;

export const PlanDecisionResponse = z.strictObject({
  planId: z.uuid(),
  status: z.enum(["aprobado", "descartado"]),
  version: z.int().nullable(),
});
export type PlanDecisionResponse = z.infer<typeof PlanDecisionResponse>;

// ---------------------------------------------------------------------------
// Trayectoria de función ejecutiva (spec 008)
// ---------------------------------------------------------------------------

// El id que arma lib/trayectoria/lineas.ts, nunca el modelo ("Reglas fijas" de 008).
const LineaIdCuerpo = z.string().regex(/^[0-9a-f-]{36}:(cambios|avance)\[\d+\]\.evidencia\[\d+\](@[a-z_]+)?$/);

// POST /api/engagements/[id]/funcion-ejecutiva/correcciones
// Dominio nulo es "Ninguno" y dirección nula es "Sin dirección". El resto de R-008.30 depende de las
// líneas de ese momento, así que lo revisa lib/trayectoria/correccion.ts.
export const CorregirLineaRequest = z.strictObject({
  lineaId: LineaIdCuerpo,
  dominio: DominioFE.nullable(),
  direccion: DireccionFE.nullable(),
  anteriorLineaId: LineaIdCuerpo.nullable(),
});
export type CorregirLineaRequest = z.infer<typeof CorregirLineaRequest>;

export const CorregirLineaResponse = z.strictObject({ correccionId: z.int() });
export type CorregirLineaResponse = z.infer<typeof CorregirLineaResponse>;

// POST /api/engagements/[id]/funcion-ejecutiva/resumenes
export const PedirResumenRequest = z.strictObject({ dominio: DominioFE });
export type PedirResumenRequest = z.infer<typeof PedirResumenRequest>;

export const PedirResumenResponse = z.strictObject({ resumenId: z.uuid() });
export type PedirResumenResponse = z.infer<typeof PedirResumenResponse>;

// POST /api/engagements/[id]/funcion-ejecutiva/resumenes/[resumenId]/decision
export const DecidirResumenRequest = z.strictObject({ accion: z.enum(["aprobar", "descartar"]) });
export type DecidirResumenRequest = z.infer<typeof DecidirResumenRequest>;

export const DecidirResumenResponse = z.strictObject({ resumenId: z.uuid(), estado: z.enum(["aprobado", "descartado"]) });
export type DecidirResumenResponse = z.infer<typeof DecidirResumenResponse>;

// ---------------------------------------------------------------------------
// Desglose de tareas (spec 010). Los contratos de las rutas de la persona viven en
// lib/desglose/schema-cliente.ts, porque este archivo llega a lib/profile/schema y ella no puede importarlo (C-09).
// ---------------------------------------------------------------------------

export {
  ArchivarDesgloseRequest,
  DecidirAjustesRequest,
  DesgloseCreadoResponse,
  MarcarPasoRequest,
  MarcarPasoResponse,
  PedirDesgloseRequest,
  RepetirDesgloseRequest,
  RepetirDesgloseResponse,
} from "@/lib/desglose/schema-cliente";

// POST /api/engagements/[id]/task-breakdowns/from-template (R-010.42). La tarea sale de la plantilla.
export const AplicarPlantillaRequest = z.strictObject({ plantillaId: z.uuid(), contexto: ContextoDesglose.optional() });
export type AplicarPlantillaRequest = z.infer<typeof AplicarPlantillaRequest>;

// PATCH /api/task-step-events/[id] ("Ya lo revisé", R-010.33). El id de la marca es entero.
export const RevisarMarcaRequest = z.strictObject({ accion: z.literal("revisar") });
export type RevisarMarcaRequest = z.infer<typeof RevisarMarcaRequest>;

export const RevisarMarcaResponse = z.strictObject({ marcaId: z.int() });
export type RevisarMarcaResponse = z.infer<typeof RevisarMarcaResponse>;

// POST /api/task-templates (R-010.39). Cada paso solo trae lo que se guarda: una nota, el origen, los minutos o
// el contexto hacen fallar el contrato. El largo de puesto y título es suposición. El id de cada paso lo pone el código.
export const MAX_PUESTO = 120;
export const MAX_TITULO_PLANTILLA = 160;
export const GuardarPlantillaRequest = z.strictObject({
  breakdownId: z.uuid(),
  puesto: z.string().trim().min(1).max(MAX_PUESTO),
  titulo: z.string().trim().min(1).max(MAX_TITULO_PLANTILLA),
  tarea: z.string().trim().min(MIN_TAREA).max(MAX_TAREA),
  pasos: z
    .array(z.strictObject({ accion: z.string().trim().min(1).max(MAX_ACCION), criterioTerminado: z.string().trim().min(1).max(MAX_CRITERIO) }))
    .min(1)
    .max(MAX_PASOS),
  // R-010.56: el coach vio el aviso de texto copiado de sus notas y guarda de todos modos.
  aceptoAviso: z.literal(true).optional(),
});
export type GuardarPlantillaRequest = z.infer<typeof GuardarPlantillaRequest>;

// Sin origen_engagement_id: ninguna respuesta lo muestra (R-010.39).
export const GuardarPlantillaResponse = z.strictObject({ plantillaId: z.uuid() });
export type GuardarPlantillaResponse = z.infer<typeof GuardarPlantillaResponse>;

// PATCH /api/task-templates/[id] (R-010.41)
export const ArchivarPlantillaRequest = z.strictObject({ accion: z.literal("archivar") });
export type ArchivarPlantillaRequest = z.infer<typeof ArchivarPlantillaRequest>;

// Errores: el contrato vive en contracts-cliente.ts, porque también corre en el navegador de la persona.
export { ApiError };
