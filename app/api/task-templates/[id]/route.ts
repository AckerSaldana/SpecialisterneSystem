// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// PATCH /api/task-templates/[id]
// Un coach de la organización archiva una plantilla (spec 010, R-010.41). Una plantilla no se edita. La lógica vive en
// lib/desglose/plantillas.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { archivarPlantilla, MENSAJES_PLANTILLAS } from "@/lib/desglose/plantillas";
import { esUuid } from "@/lib/plan/server";

export async function PATCH(request: Request, ctx: RouteContext<"/api/task-templates/[id]">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de coach."));

  const { id } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, MENSAJES_PLANTILLAS.noDisponible));

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return responder(conError(400, MENSAJES_PLANTILLAS.archivarInvalido));
  }
  return responder(await archivarPlantilla(user, id, json));
}
