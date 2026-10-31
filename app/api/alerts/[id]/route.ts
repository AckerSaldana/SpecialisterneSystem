// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// PATCH /api/alerts/[id]
// "Ya la pasé" y "Atendida" (R-004.42).
import { responder, conError } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { cambiarAlerta } from "@/lib/followup/acciones";
import { esUuid, MENSAJES } from "@/lib/plan/server";

export async function PATCH(req: Request, ctx: RouteContext<"/api/alerts/[id]">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, "No encontramos esta alerta."));

  const body = await req.json().catch(() => null);
  return responder(await cambiarAlerta(user, id, body));
}
