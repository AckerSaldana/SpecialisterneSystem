// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Decisión del coach sobre el borrador del plan (spec 003, tarea 17). Vive aquí con la forma de
// lib/api/ruta.ts para que el seed del demo apruebe por el mismo camino que la app (spec 007,
// R-007.59, R-007.70). Todo pasa en una sola transacción con RLS, con la fila del plan bloqueada
// ("for update"):
//   - descartar: status "descartado", sin versión (R-003.34).
//   - aprobar (R-003.28): vuelve a validar fichas, citas y "Sigue al punto"; exige al menos un
//     objetivo (R-003.29); bloquea con las banderas de R-003.30; asigna versión = última + 1;
//     status "aprobado"; y escribe la copia para la persona en persona_plans con itemsAnteriores
//     (R-003.37, R-003.48, R-003.61). El trigger app_on_plan_aprobado pasa la etapa de plan a
//     seguimiento la primera vez (R-003.58).
// Dos aprobaciones a la vez: la segunda espera el bloqueo y responde 409. Si aun así dos planes
// guardan la misma versión, plans_engagement_version rechaza el segundo: 409 (R-003.31).
import "server-only";
import { and, eq, inArray, max } from "drizzle-orm";
import { PlanDecisionRequest, type PlanDecisionResponse } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { withRls } from "@/lib/db/rls";
import { engagements, knowledgeCards, personaPlans, planItems, plans, users } from "@/lib/db/schema";
import { logError } from "@/lib/log";
import { vistaPersonaPlan } from "@/lib/plan/persona";
import { etiquetaTipoPlan } from "@/lib/plan/schema";
import {
  banderasDeFila,
  citasDelPerfil,
  columnasItem,
  evidenciaEnPerfil,
  leerPlanBloqueado,
  MENSAJES,
  planVigente,
  violaUnico,
} from "@/lib/plan/server";
import { banderasQueBloquean } from "@/lib/plan/validate";

// "ruta": id del punto que bloquea la aprobación, para que la UI lleve al coach a él (R-003.30).
const falla = (status: number, mensaje: string, ruta?: string): RespuestaRuta => conError(status, mensaje, ruta === undefined ? {} : { ruta });

const respuesta = (cuerpo: PlanDecisionResponse): RespuestaRuta => ({ status: 200, cuerpo });

// "opciones.ahora" solo lo pasa el seed del demo, para que las fechas sigan la historia (R-007.60). La
// ruta no lo pasa y nada del body llega aquí.
export async function decidirPlan(user: UsuarioRuta, planId: string, body: unknown, opciones: { ahora?: Date } = {}): Promise<RespuestaRuta> {
  const parsed = PlanDecisionRequest.safeParse(body);
  if (!parsed.success) return conError(400, "La decisión no es válida.");
  const decision = parsed.data;

  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      const lectura = await leerPlanBloqueado(tx, planId, "update");
      if (lectura.estado === "no_existe") return falla(404, MENSAJES.sinPlan);
      if (lectura.estado === "revisado") return falla(409, MENSAJES.planRevisado);
      const { plan } = lectura;

      if (decision.accion === "descartar") {
        await tx.update(plans).set({ status: "descartado" }).where(eq(plans.id, plan.id));
        return respuesta({ planId: plan.id, status: "descartado", version: null });
      }

      // --- aprobar ---
      const items = await tx.select(columnasItem).from(planItems).where(eq(planItems.planId, plan.id)).orderBy(planItems.orden);

      // R-003.29: al menos un objetivo; un objetivo_equipo no cuenta.
      if (!items.some((i) => i.tipo === "objetivo")) return falla(400, MENSAJES.sinObjetivo);

      // R-003.24: cada ficha citada sigue existiendo y verificada.
      const fichaIds = [...new Set(items.flatMap((i) => (i.knowledgeCardId ? [i.knowledgeCardId] : [])))];
      if (fichaIds.length > 0) {
        const verificadas = await tx
          .select({ id: knowledgeCards.id })
          .from(knowledgeCards)
          .where(and(inArray(knowledgeCards.id, fichaIds), eq(knowledgeCards.verificada, true)));
        if (verificadas.length !== fichaIds.length) return falla(400, MENSAJES.fichaInvalida);
      }

      // R-003.24: cada cita está en el snapshot base del plan.
      if (!items.every((i) => evidenciaEnPerfil(i.evidencia, plan.perfil))) return falla(400, MENSAJES.citaInvalida);

      // R-003.51: cada "Sigue al punto" es un ítem del plan vigente y del mismo tipo. Que no se
      // repita lo garantiza el índice único plan_items_origen_unico.
      const ligados = items.filter((i) => i.origenItemId !== null);
      if (ligados.length > 0) {
        const vigente = await planVigente(tx, plan.engagementId);
        if (!vigente) return falla(400, MENSAJES.origenInvalido);
        const anteriores = await tx
          .select({ id: planItems.id, tipo: planItems.tipo })
          .from(planItems)
          .where(eq(planItems.planId, vigente.id));
        const tipoAnterior = new Map(anteriores.map((a) => [a.id, a.tipo]));
        if (ligados.some((i) => tipoAnterior.get(i.origenItemId!) !== i.tipo)) return falla(400, MENSAJES.origenInvalido);
      }

      // R-003.30: banderas que bloquean, recalculadas sobre el texto actual de cada punto.
      const citas = citasDelPerfil(plan.perfil);
      const bloqueantes = banderasQueBloquean(items.flatMap((i) => banderasDeFila(i, citas)));
      if (bloqueantes.length > 0) {
        const primera = bloqueantes[0];
        // La ruta de la bandera es el id del punto (lib/plan/server.ts): de ahí sale el grupo.
        const item = items.find((i) => i.id === primera.ruta);
        const grupo = item ? etiquetaTipoPlan(item.tipo) : "el plan";
        if (primera.motivo === "termino_no_permitido" || primera.motivo === "mencion_condicion") {
          return falla(400, MENSAJES.palabraNoPermitida(grupo, primera.termino), primera.ruta);
        }
        const [persona] = await tx
          .select({ nombrePila: users.nombrePila })
          .from(engagements)
          .innerJoin(users, eq(users.id, engagements.personaId))
          .where(eq(engagements.id, plan.engagementId))
          .limit(1);
        return falla(400, MENSAJES.textoPersonaInterno(persona?.nombrePila ?? "la persona", grupo), primera.ruta);
      }

      // Versión = la más alta aprobada + 1 (los descartados no tienen versión).
      const [{ ultima }] = await tx
        .select({ ultima: max(plans.version) })
        .from(plans)
        .where(eq(plans.engagementId, plan.engagementId));
      const version = (ultima ?? 0) + 1;

      await tx
        .update(plans)
        .set({ status: "aprobado", version, approvedBy: user.id, approvedAt: opciones.ahora ?? new Date() })
        .where(eq(plans.id, plan.id));

      // R-003.61: mapa id → origen_item_id de todos los ítems de planes aprobados del
      // acompañamiento (este plan ya cuenta como aprobado dentro de la transacción; se suman sus
      // ítems de todos modos para no depender de eso).
      const aprobados = await tx
        .select({ id: planItems.id, origenItemId: planItems.origenItemId })
        .from(planItems)
        .innerJoin(plans, eq(plans.id, planItems.planId))
        .where(and(eq(plans.engagementId, plan.engagementId), eq(plans.status, "aprobado")));
      const origenes = new Map<string, string | null>(aprobados.map((a) => [a.id, a.origenItemId]));
      for (const i of items) origenes.set(i.id, i.origenItemId);

      // R-003.37 y R-003.48: solo objetivos y apoyos con texto para la persona, sin citas,
      // fichas, dominios ni descripción del coach.
      await tx.insert(personaPlans).values({
        planId: plan.id,
        engagementId: plan.engagementId,
        version,
        contenido: vistaPersonaPlan(items, origenes),
      });

      return respuesta({ planId: plan.id, status: "aprobado", version });
    });
  } catch (e) {
    if (violaUnico(e, "plans_engagement_version")) return conError(409, MENSAJES.aprobacionSimultanea);
    logError("plan decision: error al guardar la decisión", e);
    return conError(500, "No se pudo guardar la decisión. Intenta de nuevo.");
  }
}
