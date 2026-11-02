// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/persona/shared-guides/[id]/copiar
// "Hacer cambios": un borrador desde la última versión, sin el modelo (spec 009, R-009.32). La lógica vive en lib/guia/acciones.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { copiarVersion, MENSAJES_ACCIONES } from "@/lib/guia/acciones";
import { esUuid } from "@/lib/plan/server";

export async function POST(_req: Request, ctx: RouteContext<"/api/persona/shared-guides/[id]/copiar">) {
  const user = await getUserWithRole("persona");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de participante."));

  const { id } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, MENSAJES_ACCIONES.sinGuia));

  return responder(await copiarVersion(user, id));
}
