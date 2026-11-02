// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/task-breakdowns/[id]/steps/[pasoId]/events
// La persona marca un paso: "Ya lo hice", "Me atoré aquí" o "Deshacer" (spec 010, R-010.26 a R-010.28). Si guarda, responde
// 201 con el id de la marca. La lógica vive en lib/desglose/acciones.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { marcarPaso, MENSAJES_MARCAS } from "@/lib/desglose/acciones";
import { exigirPersonaActiva } from "@/lib/desglose/ruta-persona";
import { esUuid } from "@/lib/plan/server";

export async function POST(request: Request, ctx: RouteContext<"/api/task-breakdowns/[id]/steps/[pasoId]/events">) {
  const user = await getUserWithRole("persona");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de participante."));

  const { id, pasoId } = await ctx.params;
  if (!esUuid(id) || !esUuid(pasoId)) return responder(conError(404, MENSAJES_MARCAS.sinTarea));

  const bloqueo = await exigirPersonaActiva(user);
  if (bloqueo) return responder(bloqueo);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return responder(conError(400, MENSAJES_MARCAS.marcaInvalida));
  }
  return responder(await marcarPaso(user, id, pasoId, json));
}
