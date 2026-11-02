// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// PATCH /api/task-step-events/[id]
// "Ya lo revisé": el coach marca que leyó un "Me atoré aquí" (spec 010, R-010.33). El id es entero, no UUID. Si guarda,
// responde 200 con el id de la marca. La lógica vive en lib/desglose/acciones.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { MENSAJES_MARCAS, revisarMarca } from "@/lib/desglose/acciones";

export async function PATCH(request: Request, ctx: RouteContext<"/api/task-step-events/[id]">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de coach."));

  const { id } = await ctx.params;
  const marcaId = /^[1-9]\d*$/.test(id) ? Number(id) : null;
  if (marcaId === null || !Number.isSafeInteger(marcaId)) return responder(conError(404, MENSAJES_MARCAS.sinMarca));

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return responder(conError(400, MENSAJES_MARCAS.revisarInvalido));
  }
  return responder(await revisarMarca(user, marcaId, json));
}
