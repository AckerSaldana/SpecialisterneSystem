// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/engagements/[id]/alerts
// El coach marca una señal activa como alerta fuerte (R-004.15, R-004.16). La app no avisa a nadie.
import { responder, conError } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { crearAlerta } from "@/lib/followup/acciones";
import { esUuid, MENSAJES } from "@/lib/plan/server";

export async function POST(req: Request, ctx: RouteContext<"/api/engagements/[id]/alerts">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id: engagementId } = await ctx.params;
  if (!esUuid(engagementId)) return responder(conError(404, MENSAJES.sinAcompanamiento));

  const body = await req.json().catch(() => null);
  return responder(await crearAlerta(user, engagementId, body));
}
