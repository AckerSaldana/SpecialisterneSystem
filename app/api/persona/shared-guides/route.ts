// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/persona/shared-guides
// La persona pide un borrador de "Cómo trabajar conmigo" (spec 009, R-009.2). El acompañamiento sale de
// miAcompanamiento, no del cliente. La lógica vive en lib/guia/generar.ts.
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { pedirBorradorPersona } from "@/lib/guia/generar";

export async function POST() {
  const user = await getUserWithRole("persona");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de participante."));

  return responder(await pedirBorradorPersona(user));
}
