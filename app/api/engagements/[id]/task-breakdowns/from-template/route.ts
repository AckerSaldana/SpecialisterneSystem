// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/engagements/[id]/task-breakdowns/from-template
// El coach del acompañamiento aplica una plantilla de su organización (spec 010, R-010.42). Si se guarda, responde 201 con
// el id del desglose. La lógica vive en lib/desglose/plantillas.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { MENSAJES_DESGLOSE } from "@/lib/desglose/generar";
import { aplicarPlantilla, MENSAJES_PLANTILLAS } from "@/lib/desglose/plantillas";
import { esUuid } from "@/lib/plan/server";

export async function POST(request: Request, ctx: RouteContext<"/api/engagements/[id]/task-breakdowns/from-template">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de coach."));

  const { id: engagementId } = await ctx.params;
  if (!esUuid(engagementId)) return responder(conError(404, MENSAJES_DESGLOSE.sinAcompanamiento));

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return responder(conError(400, MENSAJES_PLANTILLAS.aplicarInvalido));
  }
  return responder(await aplicarPlantilla(user, engagementId, json));
}
