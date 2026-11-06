// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/profile-events/[id]/cierre
// El coach cierra un "Esto no me representa" (spec 005, R-005.26, R-005.34). La ruta de decisión
// responde 409 a estos eventos, por eso tiene ruta propia. La lógica vive en lib/persona/cierre-comentario.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { cerrarComentario } from "@/lib/persona/cierre-comentario";
import { esUuid, MENSAJES } from "@/lib/plan/server";

export async function POST(req: Request, ctx: RouteContext<"/api/profile-events/[id]/cierre">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id: eventId } = await ctx.params;
  if (!esUuid(eventId)) return responder(conError(404, "No encontramos este comentario."));

  const body = await req.json().catch(() => null);
  return responder(await cerrarComentario(user, eventId, body));
}
