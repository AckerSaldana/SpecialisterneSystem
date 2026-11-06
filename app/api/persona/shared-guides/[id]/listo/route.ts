// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/persona/shared-guides/[id]/listo
// La persona marca la hoja como lista para compartir (spec 009, R-009.28, R-009.29). La lógica vive en lib/guia/acciones.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { marcarLista, MENSAJES_ACCIONES } from "@/lib/guia/acciones";
import { esUuid } from "@/lib/plan/server";

export async function POST(req: Request, ctx: RouteContext<"/api/persona/shared-guides/[id]/listo">) {
  const user = await getUserWithRole("persona");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de participante."));

  const { id } = await ctx.params;
  if (!esUuid(id)) return responder(conError(404, MENSAJES_ACCIONES.sinGuia));

  const body = await req.json().catch(() => null);
  return responder(await marcarLista(user, id, body));
}
