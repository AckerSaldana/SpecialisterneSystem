// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// PATCH /api/persona/shared-guides/[id]
// La persona cambia el nombre que se muestra en la hoja (spec 009, R-009.24, R-009.26). La lógica vive en
// lib/guia/acciones.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { cambiarNombre, MENSAJES_ACCIONES } from "@/lib/guia/acciones";
import { esUuid } from "@/lib/plan/server";

export async function PATCH(req: Request, ctx: RouteContext<"/api/persona/shared-guides/[id]">) {
  const user = await getUserWithRole("persona");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de participante."));

  const { id } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, MENSAJES_ACCIONES.sinGuia));

  const body = await req.json().catch(() => null);
  return responder(await cambiarNombre(user, id, body));
}
