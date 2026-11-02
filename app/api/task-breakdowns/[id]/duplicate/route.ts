// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/task-breakdowns/[id]/duplicate
// La persona repite una tarea suya (spec 010, R-010.35 a R-010.37). Solo ella: el coach no repite desgloses. Si guarda,
// responde 201 con el id de la copia y qué pasó con ella. Si el modelo falla, 502 y el origen no cambia. La lógica vive en
// lib/desglose/generar.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { MENSAJES_DESGLOSE, repetirDesglose } from "@/lib/desglose/generar";
import { exigirPersonaActiva } from "@/lib/desglose/ruta-persona";
import { esUuid } from "@/lib/plan/server";

export async function POST(request: Request, ctx: RouteContext<"/api/task-breakdowns/[id]/duplicate">) {
  const user = await getUserWithRole("persona");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de participante."));

  const { id } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, MENSAJES_DESGLOSE.sinTarea));

  const bloqueo = await exigirPersonaActiva(user);
  if (bloqueo) return responder(bloqueo);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return responder(conError(400, MENSAJES_DESGLOSE.repetirInvalido));
  }
  return responder(await repetirDesglose(user, id, json));
}
