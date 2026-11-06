// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/engagements/[id]/task-breakdowns
// La persona o su coach piden un desglose de tareas (spec 010, R-010.1 a R-010.3). Si se guarda, responde 201 con su id.
// La lógica vive en lib/desglose/generar.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getSessionUser } from "@/lib/auth";
import { MENSAJES_DESGLOSE, pedirDesglose } from "@/lib/desglose/generar";
import { exigirPersonaActiva } from "@/lib/desglose/ruta-persona";
import { esUuid } from "@/lib/plan/server";

export async function POST(request: Request, ctx: RouteContext<"/api/engagements/[id]/task-breakdowns">) {
  const user = await getSessionUser();
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta."));

  const { id: engagementId } = await ctx.params;
  if (!esUuid(engagementId)) return responder(conError(404, MENSAJES_DESGLOSE.sinAcompanamiento));

  if (user.role === "persona") {
    const bloqueo = await exigirPersonaActiva(user);
    if (bloqueo) return responder(bloqueo);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return responder(conError(400, MENSAJES_DESGLOSE.invalido));
  }
  return responder(await pedirDesglose(user, engagementId, json));
}
