// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/engagements/[id]/funcion-ejecutiva/resumenes/[resumenId]/decision
// El coach aprueba o descarta la propuesta de resumen (spec 008, R-008.37, R-008.38). La lógica vive en
// lib/trayectoria/resumen.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { esUuid, MENSAJES } from "@/lib/plan/server";
import { decidirResumen, MENSAJES_RESUMEN } from "@/lib/trayectoria/resumen";

export async function POST(req: Request, ctx: RouteContext<"/api/engagements/[id]/funcion-ejecutiva/resumenes/[resumenId]/decision">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id: engagementId, resumenId } = await ctx.params;
  if (!esUuid(engagementId)) return responder(conError(404, MENSAJES.sinAcompanamiento));
  if (!esUuid(resumenId)) return responder(conError(404, MENSAJES_RESUMEN.sinResumen));

  const body = await req.json().catch(() => null);
  return responder(await decidirResumen(user, engagementId, resumenId, body));
}
