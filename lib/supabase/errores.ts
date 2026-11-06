// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Qué tipo de falla trajo Supabase Auth (R-002.17). signInWithPassword no lanza: sin red, con un 5xx o con el límite de
// intentos también llega como { error }, y ahí decirle "no coinciden" a la persona sería falso. Solo se separan estos casos:
// cualquier otro rechazo (correo sin confirmar, cuenta bloqueada) sigue con el mismo mensaje, para no revelar si el correo existe.
import { isAuthRetryableFetchError } from "@supabase/supabase-js";

export function authNoRespondio(error: { status?: number }): boolean {
  const { status } = error;
  return isAuthRetryableFetchError(error) || status === 0 || status === 429 || (status !== undefined && status >= 500);
}

// Para el log: nunca el mensaje de Supabase, que podría repetir lo que se envió.
export const resumenAuth = (error: { status?: number; code?: string }) => new Error(error.code ?? `status ${error.status ?? "desconocido"}`);
