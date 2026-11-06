// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// "Esto no me representa" del lado de la persona (spec 005): guardar el comentario y leer lo que
// muestra /persona. El comentario no cambia el perfil ni el plan y no llega al modelo: lo lee el coach
// (R-005.22, R-005.23, R-005.32). No importa lib/auth, así scripts/persona-check.ts la llama con
// cuentas sintéticas (lib/api/ruta.ts).
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { FeedbackRequest, type FeedbackResponse } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { exigirConsentimiento } from "@/lib/consent";
import { personaPlans, profileEvents } from "@/lib/db/schema";
import { withRls, type Tx } from "@/lib/db/rls";
import { miAcompanamiento } from "@/lib/engagements/persona";
import { logError } from "@/lib/log";
import { DIMENSIONES_PERSONA, esDimensionVisible, type DimensionVisible } from "@/lib/persona/dimensiones";
import { PayloadNoMeRepresenta } from "@/lib/profile/schema";

const MENSAJES = {
  invalido: "El mensaje no es válido. Revisa que tenga menos de 2000 caracteres.",
  sinAcompanamiento: "No encontramos tu acompañamiento.",
  sinConsentimiento: "Tu consentimiento no está vigente. No guardamos tu mensaje.",
  planCambio: "Tu plan cambió. Recarga la página y vuelve a intentarlo.",
  errorGuardar: "No se pudo guardar tu mensaje. Intenta de nuevo.",
} as const;

// La persona solo lee persona_plans (R-005.6): ni plans ni plan_items.
async function leerPlanVigente(tx: Tx, engagementId: string) {
  const [plan] = await tx
    .select({ version: personaPlans.version, contenido: personaPlans.contenido, createdAt: personaPlans.createdAt })
    .from(personaPlans)
    .where(eq(personaPlans.engagementId, engagementId))
    .orderBy(desc(personaPlans.version))
    .limit(1);
  return plan ?? null;
}

// "visibles" solo cambia en pruebas: hoy la constante trae las 15 dimensiones (R-005.4).
export async function enviarComentario(
  user: UsuarioRuta,
  body: unknown,
  visibles: readonly DimensionVisible[] = DIMENSIONES_PERSONA,
): Promise<RespuestaRuta> {
  const parsed = FeedbackRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES.invalido);
  const { dimension, comentario } = parsed.data;
  const origen = parsed.data.origen ?? "perfil";
  const planItemId = parsed.data.planItemId ?? null;

  if (dimension && !esDimensionVisible(dimension, visibles)) return conError(400, MENSAJES.invalido);
  if (origen === "perfil" && planItemId) return conError(400, MENSAJES.invalido);

  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      // Su único acompañamiento (R-002.4). La persona no tiene SELECT sobre app.engagements (R-002.40).
      const engagement = await miAcompanamiento(tx);
      if (!engagement) return conError(404, MENSAJES.sinAcompanamiento);
      // R-005.46: la puerta de lib/persona/puerta.ts protege páginas, no rutas.
      if (!(await exigirConsentimiento(tx, engagement.id))) return conError(409, MENSAJES.sinConsentimiento);

      // R-005.33: el ítem se valida contra la versión vigente, y planVersion lo pone la ruta.
      let delPlan: Pick<PayloadNoMeRepresenta, "planItemId" | "planVersion"> = {};
      if (origen === "plan") {
        const plan = await leerPlanVigente(tx, engagement.id);
        if (!plan || dimension !== null) return conError(400, MENSAJES.planCambio);
        if (planItemId && !plan.contenido.items.some((i) => i.planItemId === planItemId)) {
          return conError(400, MENSAJES.planCambio);
        }
        delPlan = { planItemId, planVersion: plan.version };
      }

      const payload = PayloadNoMeRepresenta.parse({ tipo: "no_me_representa", dimension, comentario, origen, ...delPlan });
      const [evento] = await tx
        .insert(profileEvents)
        .values({ engagementId: engagement.id, tipo: "no_me_representa", status: "proposed", payload, createdBy: user.id })
        .returning({ id: profileEvents.id });
      const respuesta: FeedbackResponse = { eventId: evento.id };
      return { status: 201, cuerpo: respuesta };
    });
  } catch (e) {
    logError("persona/feedback", e);
    return conError(500, MENSAJES.errorGuardar);
  }
}

// Lo que /persona lee de su plan y de sus comentarios. No selecciona decided_by ni las columnas
// resuelto_*. RLS ya limita a sus propios comentarios; el filtro lo deja explícito.
export async function leerPlanYComentarios(tx: Tx, engagementId: string) {
  const plan = await leerPlanVigente(tx, engagementId);
  const comentarios = await tx
    .select({
      id: profileEvents.id,
      status: profileEvents.status,
      payload: profileEvents.payload,
      createdAt: profileEvents.createdAt,
      decidedAt: profileEvents.decidedAt,
    })
    .from(profileEvents)
    .where(and(eq(profileEvents.engagementId, engagementId), eq(profileEvents.tipo, "no_me_representa")));
  return { plan, comentarios };
}
