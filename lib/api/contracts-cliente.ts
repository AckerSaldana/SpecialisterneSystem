// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// La parte de los contratos que corre en el navegador de la persona. No importa lib/profile/schema,
// ni siquiera a través de otro archivo: ese módulo trae los nombres de los dominios y de las señales,
// y la persona nunca los ve (C-09, R-005.2). lib/api/contracts.ts vuelve a exportar lo de aquí.
import { z } from "zod";

// POST /api/persona/feedback   (botón "esto no me representa")
// Sin "origen" cuenta como "perfil". "cierre" no entra por aquí (R-005.47) y "planVersion" lo pone
// la ruta (R-005.33): por eso es estricto. Aquí "dimension" solo es texto, porque el botón la recibe
// ya tipada; el servidor la valida contra DimensionId con FeedbackRequest de lib/api/contracts.ts.
export const FeedbackCuerpo = z.strictObject({
  dimension: z.string().nullable(),
  comentario: z.string().trim().max(2000),
  origen: z.enum(["perfil", "plan"]).optional(),
  planItemId: z.uuid().nullable().optional(),
});

export const FeedbackResponse = z.strictObject({ eventId: z.uuid() });
export type FeedbackResponse = z.infer<typeof FeedbackResponse>;

// Errores: siempre { error: string } con un mensaje en lenguaje literal. "ruta" es opcional: al
// bloquear la aprobación por una bandera es el id del punto que hay que corregir (R-003.30).
// El 502 y el 500 de guardar la propuesta traen sessionId, para pedirla otra vez. El 409 del
// reintento trae eventId solo si ya existe propuesta (spec 004).
export const ApiError = z.strictObject({
  error: z.string(),
  ruta: z.string().optional(),
  sessionId: z.uuid().optional(),
  eventId: z.uuid().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
