// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// PATCH /api/persona/shared-guides/[id]/lineas/[lineaId]: la persona decide una línea (spec 009, R-009.20 a
// R-009.22).
// DELETE: borra una línea propia del JSON, no la fila (R-009.23). La lógica vive en lib/guia/acciones.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { borrarLineaPropia, decidirLinea, MENSAJES_ACCIONES } from "@/lib/guia/acciones";
import { esUuid } from "@/lib/plan/server";

type Contexto = RouteContext<"/api/persona/shared-guides/[id]/lineas/[lineaId]">;

export async function PATCH(req: Request, ctx: Contexto) {
  const user = await getUserWithRole("persona");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de participante."));

  const { id, lineaId } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, MENSAJES_ACCIONES.sinGuia));
  if (!esUuid(lineaId)) return responder(conError(404, MENSAJES_ACCIONES.sinLinea));

  const body = await req.json().catch(() => null);
  return responder(await decidirLinea(user, id, lineaId, body));
}

export async function DELETE(_req: Request, ctx: Contexto) {
  const user = await getUserWithRole("persona");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de participante."));

  const { id, lineaId } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, MENSAJES_ACCIONES.sinGuia));
  if (!esUuid(lineaId)) return responder(conError(404, MENSAJES_ACCIONES.sinLinea));

  return responder(await borrarLineaPropia(user, id, lineaId));
}
