// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/task-breakdowns/[id]/ajustes
// La persona guarda qué ajustes usa, una sola vez (spec 010, R-010.38). Si un ajuste elegido ya no sirve, responde 400 con
// el texto que nombra el paso y no cambia nada. La lógica vive en lib/desglose/acciones.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { decidirAjustes, MENSAJES_MARCAS } from "@/lib/desglose/acciones";
import { exigirPersonaActiva } from "@/lib/desglose/ruta-persona";
import { esUuid } from "@/lib/plan/server";

export async function POST(request: Request, ctx: RouteContext<"/api/task-breakdowns/[id]/ajustes">) {
  const user = await getUserWithRole("persona");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de participante."));

  const { id } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, MENSAJES_MARCAS.sinTarea));

  const bloqueo = await exigirPersonaActiva(user);
  if (bloqueo) return responder(bloqueo);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return responder(conError(400, MENSAJES_MARCAS.decidirInvalido));
  }
  return responder(await decidirAjustes(user, id, json));
}
