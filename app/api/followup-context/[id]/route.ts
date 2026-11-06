// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// PATCH /api/followup-context/[id]   (sin body)
// "Ya no aplica" (R-004.23). Lo quitado queda en el historial con quién y cuándo.
import { responder, conError } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { quitarContexto } from "@/lib/followup/acciones";
import { esUuid, MENSAJES } from "@/lib/plan/server";

export async function PATCH(_req: Request, ctx: RouteContext<"/api/followup-context/[id]">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, "No encontramos este punto."));

  return responder(await quitarContexto(user, id));
}
