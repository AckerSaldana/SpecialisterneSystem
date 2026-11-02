// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/task-templates
// El coach guarda un desglose como plantilla de un puesto (spec 010, R-010.39, R-010.40). Si se guarda, responde 201 con su
// id y nada más. La lógica vive en lib/desglose/plantillas.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { guardarPlantilla, MENSAJES_PLANTILLAS } from "@/lib/desglose/plantillas";

export async function POST(request: Request) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de coach."));

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return responder(conError(400, MENSAJES_PLANTILLAS.guardarInvalido));
  }
  return responder(await guardarPlantilla(user, json));
}
