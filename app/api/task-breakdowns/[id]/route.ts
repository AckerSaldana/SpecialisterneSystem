// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// PATCH /api/task-breakdowns/[id]
// "Ya no la uso": la persona o el coach quitan un desglose de la lista de la persona (spec 010, R-010.29). La lógica
// vive en lib/desglose/acciones.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getSessionUser } from "@/lib/auth";
import { archivarDesglose, MENSAJES_MARCAS } from "@/lib/desglose/acciones";
import { exigirPersonaActiva } from "@/lib/desglose/ruta-persona";
import { esUuid } from "@/lib/plan/server";

export async function PATCH(request: Request, ctx: RouteContext<"/api/task-breakdowns/[id]">) {
  const user = await getSessionUser();
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta."));

  const { id } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, MENSAJES_MARCAS.sinTarea));

  if (user.role === "persona") {
    const bloqueo = await exigirPersonaActiva(user);
    if (bloqueo) return responder(bloqueo);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return responder(conError(400, MENSAJES_MARCAS.archivarInvalido));
  }
  return responder(await archivarDesglose(user, id, json));
}
