// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/engagements/[id]/sessions/[sessionId]/proposal   (sin body)
// Pide otra vez la propuesta de una sesión ya guardada, sin duplicar la nota (R-004.29, R-004.30).
// Lleva el acompañamiento en la URL porque, con el consentimiento retirado, RLS oculta la sesión.
import { responder, conError } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { esUuid, MENSAJES } from "@/lib/plan/server";
import { MENSAJES_SESION, reintentarPropuesta } from "@/lib/sessions/proponer";

export async function POST(_req: Request, ctx: RouteContext<"/api/engagements/[id]/sessions/[sessionId]/proposal">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id: engagementId, sessionId } = await ctx.params;
  if (!esUuid(engagementId)) return responder(conError(404, MENSAJES.sinAcompanamiento));
  if (!esUuid(sessionId)) return responder(conError(404, MENSAJES_SESION.sinSesion));

  return responder(await reintentarPropuesta(user, engagementId, sessionId));
}
