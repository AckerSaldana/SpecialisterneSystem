// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/engagements/[id]/sessions
// El coach envía su nota. La sesión se guarda, la IA propone y la propuesta queda como evento
// "proposed". El flujo vive en lib/sessions/proponer.ts (spec 004).
import { responder, conError } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { esUuid, MENSAJES } from "@/lib/plan/server";
import { crearSesion } from "@/lib/sessions/proponer";

export async function POST(req: Request, ctx: RouteContext<"/api/engagements/[id]/sessions">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id: engagementId } = await ctx.params;
  // Un id que no es UUID haría fallar a Postgres; se responde igual que "no existe".
  if (!esUuid(engagementId)) return responder(conError(404, MENSAJES.sinAcompanamiento));

  const body = await req.json().catch(() => null);
  return responder(await crearSesion(user, engagementId, body));
}
