// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/persona/feedback: botón "Esto no me representa" de la persona, sobre su perfil o su plan.
// Guarda un profile_event tipo "no_me_representa" en estado "proposed" para que el coach lo revise
// con la persona. No cambia el perfil ni el plan. La lógica vive en lib/persona/feedback.ts (spec 005).
import { conError, responder } from "@/lib/api/ruta";
import { getUserWithRole } from "@/lib/auth";
import { enviarComentario } from "@/lib/persona/feedback";

export async function POST(request: Request) {
  const user = await getUserWithRole("persona");
  if (!user) return responder(conError(401, "Necesitas entrar con tu cuenta de participante."));

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return responder(conError(400, "No pudimos leer el mensaje. Intenta de nuevo."));
  }
  return responder(await enviarComentario(user, json));
}
