// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/engagements/[id]/funcion-ejecutiva/resumenes
// El coach pide la propuesta de resumen de un dominio (spec 008, R-008.33, R-008.36 a R-008.39). La
// lógica vive en lib/trayectoria/resumen.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { esUuid, MENSAJES } from "@/lib/plan/server";
import { pedirResumen } from "@/lib/trayectoria/resumen";

export async function POST(req: Request, ctx: RouteContext<"/api/engagements/[id]/funcion-ejecutiva/resumenes">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id: engagementId } = await ctx.params;
  if (!esUuid(engagementId)) return responder(conError(404, MENSAJES.sinAcompanamiento));

  const body = await req.json().catch(() => null);
  return responder(await pedirResumen(user, engagementId, body));
}
