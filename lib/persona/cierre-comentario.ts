// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// El coach cierra un "Esto no me representa" (spec 005, R-005.26, R-005.27, R-005.34, R-005.49) y lee
// las opciones para hacerlo. Cerrar solo marca el evento: no crea snapshot, versión del perfil ni
// versión del plan, y no cambia la etapa (R-005.41). Un cambio al perfil o al plan entra por su camino
// normal, y aquí solo se elige cuál lo resolvió. No importa lib/auth, así scripts/persona-check.ts
// la llama con cuentas sintéticas (lib/api/ruta.ts).
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { CerrarComentarioRequest, type CerrarComentarioResponse } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { personaPlans, plans, profileEvents } from "@/lib/db/schema";
import { withRls, type Tx } from "@/lib/db/rls";
import { logError } from "@/lib/log";
import { origenDe, planResuelve, propuestaResuelve, type PlanAprobado, type PropuestaAprobada, type VersionPlanPersona } from "@/lib/persona/comentarios";
import type { OrigenComentario } from "@/lib/profile/schema";

const MENSAJES = {
  invalido: "La decisión no es válida.",
  noEncontrado: "No encontramos este comentario.",
  noEsComentario: "Este evento no es un comentario de la persona.",
  deCierre: "Este comentario se revisa desde el resumen de cierre.",
  yaRevisado: "Este comentario ya fue revisado. Recarga la página para ver su estado.",
  propuestaNoValida: "Esa propuesta no cambió el perfil o es anterior al comentario. Elige otra.",
  planNoValido: "Esa versión del plan es anterior al comentario. Elige otra.",
  errorGuardar: "No se pudo guardar. Intenta de nuevo.",
} as const;

const columnasPropuesta = {
  id: profileEvents.id,
  tipo: profileEvents.tipo,
  status: profileEvents.status,
  decidedAt: profileEvents.decidedAt,
  approvedPayload: profileEvents.approvedPayload,
};

const columnasPlan = { id: plans.id, status: plans.status, version: plans.version, approvedAt: plans.approvedAt };

export async function cerrarComentario(user: UsuarioRuta, eventId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = CerrarComentarioRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES.invalido);
  const pedido = parsed.data;

  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      // "for update" bloquea la fila, como lib/followup/decision.ts: si llegan dos cierres a la vez,
      // el segundo espera y luego ve el status ya cambiado (responde 409).
      const [evento] = await tx
        .select({
          id: profileEvents.id,
          engagementId: profileEvents.engagementId,
          tipo: profileEvents.tipo,
          status: profileEvents.status,
          payload: profileEvents.payload,
          createdAt: profileEvents.createdAt,
        })
        .from(profileEvents)
        .where(eq(profileEvents.id, eventId))
        .limit(1)
        .for("update");

      // RLS: sin ser su coach o sin consentimiento vigente, el evento no se ve.
      if (!evento) return conError(404, MENSAJES.noEncontrado);
      if (evento.tipo !== "no_me_representa" || evento.payload.tipo !== "no_me_representa") {
        return conError(409, MENSAJES.noEsComentario);
      }
      const origen = origenDe(evento.payload);
      // R-005.47: el cierre de estos comentarios se construye con 006.
      if (origen === "cierre") return conError(400, MENSAJES.deCierre);
      if (evento.status !== "proposed") return conError(409, MENSAJES.yaRevisado);

      const decision = { decidedBy: user.id, decidedAt: new Date() };

      if (pedido.resultado === "sin_cambios") {
        await tx.update(profileEvents).set({ status: "rejected", ...decision }).where(eq(profileEvents.id, evento.id));
        const respuesta: CerrarComentarioResponse = { eventId: evento.id, status: "rejected" };
        return { status: 200, cuerpo: respuesta };
      }

      const { resueltoPorEvento, resueltoPorPlan } = pedido;
      let resuelto: { resueltoPorEvento: string } | { resueltoPorPlan: string };

      if (origen === "perfil") {
        if (!resueltoPorEvento || resueltoPorPlan) return conError(400, MENSAJES.invalido);
        const [propuesta] = await tx
          .select(columnasPropuesta)
          .from(profileEvents)
          .where(and(eq(profileEvents.id, resueltoPorEvento), eq(profileEvents.engagementId, evento.engagementId)))
          .limit(1);
        if (!propuesta || !propuestaResuelve(propuesta, evento.createdAt)) return conError(409, MENSAJES.propuestaNoValida);
        resuelto = { resueltoPorEvento: propuesta.id };
      } else {
        if (!resueltoPorPlan || resueltoPorEvento) return conError(400, MENSAJES.invalido);
        const [plan] = await tx
          .select(columnasPlan)
          .from(plans)
          .where(and(eq(plans.id, resueltoPorPlan), eq(plans.engagementId, evento.engagementId)))
          .limit(1);
        if (!plan || !planResuelve(plan, evento.createdAt)) return conError(409, MENSAJES.planNoValido);
        resuelto = { resueltoPorPlan: plan.id };
      }

      await tx.update(profileEvents).set({ status: "approved", ...decision, ...resuelto }).where(eq(profileEvents.id, evento.id));
      const respuesta: CerrarComentarioResponse = { eventId: evento.id, status: "approved" };
      return { status: 200, cuerpo: respuesta };
    });
  } catch (e) {
    logError("cierre de comentario", e);
    return conError(500, MENSAJES.errorGuardar);
  }
}

// ---------------------------------------------------------------------------
// Lectura para la página del acompañamiento
// ---------------------------------------------------------------------------

export type DatosCierre = {
  propuestas: PropuestaAprobada[];
  planes: PlanAprobado[];
  // Lo que vio la persona en cada versión, para la línea "Sobre" del comentario.
  planesPersona: VersionPlanPersona[];
};

export async function leerDatosCierre(tx: Tx, engagementId: string): Promise<DatosCierre> {
  const propuestas = await tx
    .select(columnasPropuesta)
    .from(profileEvents)
    .where(and(eq(profileEvents.engagementId, engagementId), eq(profileEvents.tipo, "propuesta_ia"), eq(profileEvents.status, "approved")))
    .orderBy(desc(profileEvents.decidedAt));
  const planes = await tx
    .select(columnasPlan)
    .from(plans)
    .where(and(eq(plans.engagementId, engagementId), eq(plans.status, "aprobado")))
    .orderBy(desc(plans.version));
  const planesPersona = await tx
    .select({ version: personaPlans.version, contenido: personaPlans.contenido })
    .from(personaPlans)
    .where(eq(personaPlans.engagementId, engagementId));
  return { propuestas, planes, planesPersona };
}

export type OpcionCierre =
  | { tipo: "propuesta"; id: string; fecha: Date; cambios: number }
  | { tipo: "plan"; id: string; fecha: Date; version: number };

// Lo que el coach puede elegir como "Hubo cambios" para un comentario. Vacío: la opción se deshabilita.
export function opcionesDeCierre(datos: DatosCierre, origen: OrigenComentario, comentarioEn: Date): OpcionCierre[] {
  if (origen === "perfil") {
    return datos.propuestas
      .filter((p) => propuestaResuelve(p, comentarioEn))
      .map((p) => ({ tipo: "propuesta", id: p.id, fecha: p.decidedAt!, cambios: p.approvedPayload!.cambios.length }));
  }
  if (origen === "plan") {
    return datos.planes
      .filter((p) => planResuelve(p, comentarioEn))
      .map((p) => ({ tipo: "plan", id: p.id, fecha: p.approvedAt!, version: p.version ?? 0 }));
  }
  return [];
}
