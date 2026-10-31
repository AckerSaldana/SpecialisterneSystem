// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/profile-events/[id]/decision
// El coach aprueba una parte (o todo) de una propuesta de la IA, o la rechaza. La lógica vive en
// lib/followup/decision.ts (spec 004).
import { responder, conError } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { decidirPropuesta } from "@/lib/followup/decision";
import { esUuid, MENSAJES } from "@/lib/plan/server";

export async function POST(req: Request, ctx: RouteContext<"/api/profile-events/[id]/decision">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id: eventId } = await ctx.params;
  if (!esUuid(eventId)) return responder(conError(404, "No encontramos esta propuesta."));

  const body = await req.json().catch(() => null);
  return responder(await decidirPropuesta(user, eventId, body));
}
