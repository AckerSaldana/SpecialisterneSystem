// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/persona/feedback: botón "Esto no me representa" de la persona.
// Guarda un profile_event tipo "no_me_representa" en estado "proposed" para que
// el coach lo revise con la persona. No cambia el perfil.
// La política RLS profile_events_insert_persona_feedback exige justo estos valores.
// El acompañamiento se lee con miAcompanamiento (spec 002, R-002.40): la persona no tiene
// SELECT sobre app.engagements.
import { FeedbackRequest, FeedbackResponse, type ApiError } from "@/lib/api/contracts";
import { getUserWithRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { logError } from "@/lib/log";
import { profileEvents } from "@/lib/db/schema";
import { miAcompanamiento } from "@/lib/engagements/persona";
import { PayloadNoMeRepresenta } from "@/lib/profile/schema";

function error(mensaje: string, status: number) {
  return Response.json({ error: mensaje } satisfies ApiError, { status });
}

export async function POST(request: Request) {
  const user = await getUserWithRole("persona");
  if (!user) return error("Necesitas entrar con tu cuenta de participante.", 401);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return error("No pudimos leer el mensaje. Intenta de nuevo.", 400);
  }
  const body = FeedbackRequest.safeParse(json);
  if (!body.success) return error("El mensaje no es válido. Revisa que tenga menos de 2000 caracteres.", 400);

  try {
    const eventId = await withRls(user.claims, async (tx) => {
      // Mismo criterio que /persona: su único acompañamiento (R-002.4).
      const engagement = await miAcompanamiento(tx);
      if (!engagement) return null;

      const payload = PayloadNoMeRepresenta.parse({
        tipo: "no_me_representa",
        dimension: body.data.dimension,
        comentario: body.data.comentario,
      });

      const [evento] = await tx
        .insert(profileEvents)
        .values({
          engagementId: engagement.id,
          tipo: "no_me_representa",
          status: "proposed",
          payload,
          createdBy: user.id,
        })
        .returning({ id: profileEvents.id });
      return evento.id;
    });

    if (!eventId) return error("No encontramos tu acompañamiento.", 404);
    return Response.json(FeedbackResponse.parse({ eventId }), { status: 201 });
  } catch (e) {
    logError("persona/feedback", e);
    return error("No se pudo guardar tu mensaje. Intenta de nuevo.", 500);
  }
}
