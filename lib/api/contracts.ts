// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Contratos de los Route Handlers. El servidor valida el body con estos esquemas
// y la UI usa los mismos tipos para leer la respuesta.
import { z } from "zod";
import { Aprobacion, Bandera, Descartado, DimensionId, ProfileUpdate } from "@/lib/profile/schema";

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

// Errores: siempre { error: string } con un mensaje en lenguaje literal.
export const ApiError = z.strictObject({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;
