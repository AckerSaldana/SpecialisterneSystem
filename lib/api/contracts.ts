// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Contratos de los Route Handlers. El servidor valida el body con estos esquemas
// y la UI usa los mismos tipos para leer la respuesta.
import { z } from "zod";
import { Aprobacion, Bandera, Descartado, DimensionId, ProfileUpdate } from "@/lib/profile/schema";
import { BanderaPlan, EvidenciaPlan, OrigenItemPlan, TipoItemPlan } from "@/lib/plan/schema";

// POST /api/engagements/[id]/sessions
// Crea la sesión con la nota original, pide la propuesta a la IA, la valida y
// guarda un profile_event con status "proposed". Nada se aplica al perfil todavía.
export const ProposeRequest = z.strictObject({
  nota: z
    .string()
    .trim()
    .min(20, "La nota necesita al menos 20 caracteres.")
    .max(20000, "La nota puede tener hasta 20,000 caracteres."),
});
export type ProposeRequest = z.infer<typeof ProposeRequest>;

export const ProposeResponse = z.strictObject({
  sessionId: z.uuid(),
  eventId: z.uuid(),
  propuesta: ProfileUpdate, // ya sin las citas que no estaban en la nota
  descartados: z.array(Descartado),
  banderas: z.array(Bandera),
  promptVersion: z.string(),
  modelo: z.string(),
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

// POST /api/persona/feedback   (botón "esto no me representa")
export const FeedbackRequest = z.strictObject({
  dimension: DimensionId.nullable(),
  comentario: z.string().trim().max(2000),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequest>;

export const FeedbackResponse = z.strictObject({ eventId: z.uuid() });
export type FeedbackResponse = z.infer<typeof FeedbackResponse>;

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

// Errores: siempre { error: string } con un mensaje en lenguaje literal. "ruta" es opcional: al
// bloquear la aprobación por una bandera es el id del punto que hay que corregir (R-003.30).
export const ApiError = z.strictObject({ error: z.string(), ruta: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;
