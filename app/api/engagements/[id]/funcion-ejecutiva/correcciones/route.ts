// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/engagements/[id]/funcion-ejecutiva/correcciones
// El coach corrige el dominio o la dirección de una línea (spec 008, R-008.28 a R-008.30). Sin
// consentimiento vigente, 409. La lógica vive en lib/trayectoria/correccion.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { esUuid, MENSAJES } from "@/lib/plan/server";
import { corregirLinea } from "@/lib/trayectoria/correccion";

export async function POST(req: Request, ctx: RouteContext<"/api/engagements/[id]/funcion-ejecutiva/correcciones">) {
  const user = await getUserWithRole("coach");
  if (!user) return responder(conError(401, MENSAJES.noCoach));

  const { id: engagementId } = await ctx.params;
  if (!esUuid(engagementId)) return responder(conError(404, MENSAJES.sinAcompanamiento));

  const body = await req.json().catch(() => null);
  return responder(await corregirLinea(user, engagementId, body));
}
