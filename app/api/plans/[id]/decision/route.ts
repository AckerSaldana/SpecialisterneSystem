// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/plans/[id]/decision
// El coach aprueba o descarta el borrador del plan (spec 003, tarea 17). La lógica vive en
// lib/plan/decision.ts, para que el seed del demo apruebe por el mismo camino (R-007.70).
import { responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { decidirPlan } from "@/lib/plan/decision";
import { esUuid, MENSAJES, respuestaError } from "@/lib/plan/server";

export async function POST(req: Request, ctx: RouteContext<"/api/plans/[id]/decision">) {
  const user = await getUserWithRole("coach");
  if (!user) return respuestaError(401, MENSAJES.noCoach);

  const { id: planId } = await ctx.params;
  if (!esUuid(planId)) return respuestaError(404, MENSAJES.sinPlan);

  const body = await req.json().catch(() => null);
  return responder(await decidirPlan(user, planId, body));
}
