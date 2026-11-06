// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/engagements/[id]/signals/[tipo]/close
// "Ya no está activa" (R-004.13). No crea snapshot ni cambia la versión del perfil.
import { responder, conError } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { cerrarSenal } from "@/lib/followup/acciones";
import { esUuid, MENSAJES } from "@/lib/plan/server";

export async function POST(req: Request, ctx: RouteContext<"/api/engagements/[id]/signals/[tipo]/close">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id: engagementId, tipo } = await ctx.params;
  if (!esUuid(engagementId)) return responder(conError(404, MENSAJES.sinAcompanamiento));

  const body = await req.json().catch(() => null);
  return responder(await cerrarSenal(user, engagementId, tipo, body));
}
