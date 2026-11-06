// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/engagements/[id]/shared-guides
// El coach pide el primer borrador de "Cómo trabajar conmigo" (spec 009, R-009.2, R-009.13, R-009.47). Si
// crea, responde 201 {}: el coach no lee el borrador. La lógica vive en lib/guia/generar.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { MENSAJES_GUIA, pedirBorradorCoach } from "@/lib/guia/generar";
import { esUuid, MENSAJES } from "@/lib/plan/server";

export async function POST(_req: Request, ctx: RouteContext<"/api/engagements/[id]/shared-guides">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id: engagementId } = await ctx.params;
  if (!esUuid(engagementId)) return responder(conError(404, MENSAJES_GUIA.sinAcompanamiento));

  return responder(await pedirBorradorCoach(user, engagementId));
}
