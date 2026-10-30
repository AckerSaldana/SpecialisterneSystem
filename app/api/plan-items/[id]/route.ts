// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// PATCH  /api/plan-items/[id]   edita un punto del borrador
// DELETE /api/plan-items/[id]   quita un punto del borrador
// Spec 003, tarea 16 (R-003.22 a R-003.27, R-003.50, R-003.51). Solo en borrador: un plan ya
// revisado responde 409. Cada cambio se guarda en el momento y las banderas se recalculan.
//
// Qué cuenta como "cambio" de un punto de la IA (pasa a ia_editado, R-003.23 y R-003.25): la
// descripción, el texto para la persona, la ficha o las citas. Cambiar el orden o "Sigue al punto"
// no cambia lo que propuso la IA, así que no cambia el origen.
// El texto original de la IA no se toca: sigue en plans.propuesta_ia (sin permiso de UPDATE).
import { eq } from "drizzle-orm";
import { ItemPlanEditar, type ItemPlanRespuesta } from "@/lib/api/contracts";
import { getUserWithRole } from "@/lib/auth";
import { withRls, type Tx } from "@/lib/db/rls";
import { planItems } from "@/lib/db/schema";
import { logError } from "@/lib/log";
import { esVisiblePersona } from "@/lib/plan/schema";
import {
  citasDelPerfil,
  columnasItem,
  esUuid,
  evidenciaEnPerfil,
  fichaVerificada,
  leerPlanBloqueado,
  MENSAJES,
  origenItemValido,
  respuestaError,
  vistaItem,
  violaUnico,
} from "@/lib/plan/server";

type Resultado<T> = { ok: true; respuesta: T } | { ok: false; status: number; mensaje: string };

// Lee el punto (sin bloqueo: con RLS, "for update" sobre plan_items no devolvería los de un plan
// revisado y no podríamos responder 409) y su plan con bloqueo compartido.
async function leerItemYPlan(tx: Tx, itemId: string) {
  const [item] = await tx.select(columnasItem).from(planItems).where(eq(planItems.id, itemId)).limit(1);
  if (!item) return { ok: false as const, status: 404, mensaje: MENSAJES.sinItem };
  const lectura = await leerPlanBloqueado(tx, item.planId, "share");
  if (lectura.estado === "no_existe") return { ok: false as const, status: 404, mensaje: MENSAJES.sinItem };
  if (lectura.estado === "revisado") return { ok: false as const, status: 409, mensaje: MENSAJES.planRevisado };
  return { ok: true as const, item, plan: lectura.plan };
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/plan-items/[id]">) {
  const user = await getUserWithRole("coach");
  if (!user) return respuestaError(401, MENSAJES.noCoach);

  const { id: itemId } = await ctx.params;
  if (!esUuid(itemId)) return respuestaError(404, MENSAJES.sinItem);

  const body = await req.json().catch(() => null);
  const parsed = ItemPlanEditar.safeParse(body);
  if (!parsed.success) {
    // El contrato es estricto: un campo "tipo" llega como clave no reconocida (R-003.26, CA-003.25).
    const pideTipo = parsed.error.issues.some((i) => i.code === "unrecognized_keys" && i.keys.includes("tipo"));
    return respuestaError(400, pideTipo ? MENSAJES.tipoNoCambia : (parsed.error.issues[0]?.message ?? "El cambio no es válido."));
  }
  const cambio = parsed.data;
  if (Object.values(cambio).every((v) => v === undefined)) return respuestaError(400, MENSAJES.sinCambios);

  let resultado: Resultado<ItemPlanRespuesta>;
  try {
    resultado = await withRls(user.claims, async (tx): Promise<Resultado<ItemPlanRespuesta>> => {
      const lectura = await leerItemYPlan(tx, itemId);
      if (!lectura.ok) return lectura;
      const { item, plan } = lectura;

      // R-003.11: solo objetivo y apoyo_fe llevan textoPersona.
      if (cambio.textoPersona != null && !esVisiblePersona(item.tipo)) {
        return { ok: false, status: 400, mensaje: MENSAJES.textoPersonaNoAplica };
      }

      // R-003.24: la ficha nueva existe y está verificada (quitarla, con null, siempre se puede).
      if (cambio.fichaId != null && cambio.fichaId !== item.knowledgeCardId && !(await fichaVerificada(tx, cambio.fichaId))) {
        return { ok: false, status: 400, mensaje: MENSAJES.fichaInvalida };
      }

      // Las citas solo se quitan, por su índice actual (decisión 2).
      let evidencia = item.evidencia;
      if (cambio.quitarEvidencia && cambio.quitarEvidencia.length > 0) {
        const quitar = new Set(cambio.quitarEvidencia);
        if ([...quitar].some((i) => i >= item.evidencia.length)) {
          return { ok: false, status: 400, mensaje: MENSAJES.citaInvalida };
        }
        evidencia = item.evidencia.filter((_, i) => !quitar.has(i));
      }
      // Las que quedan tienen que estar en el snapshot base del plan.
      if (!evidenciaEnPerfil(evidencia, plan.perfil)) {
        return { ok: false, status: 400, mensaje: MENSAJES.citaInvalida };
      }

      // R-003.51: "Sigue al punto" apunta a un ítem del plan vigente, del mismo tipo y sin repetir.
      if (
        cambio.origenItemId != null &&
        cambio.origenItemId !== item.origenItemId &&
        !(await origenItemValido(tx, {
          engagementId: plan.engagementId,
          planId: plan.id,
          tipo: item.tipo,
          origenItemId: cambio.origenItemId,
          itemId: item.id,
        }))
      ) {
        return { ok: false, status: 400, mensaje: MENSAJES.origenInvalido };
      }

      const nuevos = {
        descripcion: cambio.descripcion ?? item.descripcion,
        textoPersona: cambio.textoPersona !== undefined ? cambio.textoPersona : item.textoPersona,
        knowledgeCardId: cambio.fichaId !== undefined ? cambio.fichaId : item.knowledgeCardId,
        evidencia,
        orden: cambio.orden ?? item.orden,
        origenItemId: cambio.origenItemId !== undefined ? cambio.origenItemId : item.origenItemId,
      };

      const cambioContenido =
        nuevos.descripcion !== item.descripcion ||
        nuevos.textoPersona !== item.textoPersona ||
        nuevos.knowledgeCardId !== item.knowledgeCardId ||
        nuevos.evidencia.length !== item.evidencia.length;

      const [fila] = await tx
        .update(planItems)
        .set({
          ...nuevos,
          ...(cambioContenido
            ? {
                // R-003.23: un punto de la IA que el coach cambia pasa a ia_editado.
                origen: item.origen === "ia" ? ("ia_editado" as const) : item.origen,
                editadoPor: user.id,
                editadoEn: new Date(),
              }
            : {}),
        })
        .where(eq(planItems.id, item.id))
        .returning(columnasItem);

      // R-003.27: banderas recalculadas con el texto guardado.
      return { ok: true, respuesta: { item: vistaItem(fila, citasDelPerfil(plan.perfil)) } };
    });
  } catch (e) {
    if (violaUnico(e, "plan_items_origen_unico")) return respuestaError(400, MENSAJES.origenInvalido);
    logError("plan items: error al editar un punto", e);
    return respuestaError(500, MENSAJES.errorGuardar);
  }

  if (!resultado.ok) return respuestaError(resultado.status, resultado.mensaje);
  return Response.json(resultado.respuesta);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/plan-items/[id]">) {
  const user = await getUserWithRole("coach");
  if (!user) return respuestaError(401, MENSAJES.noCoach);

  const { id: itemId } = await ctx.params;
  if (!esUuid(itemId)) return respuestaError(404, MENSAJES.sinItem);

  let resultado: Resultado<{ ok: true }>;
  try {
    resultado = await withRls(user.claims, async (tx): Promise<Resultado<{ ok: true }>> => {
      const lectura = await leerItemYPlan(tx, itemId);
      if (!lectura.ok) return lectura;
      // Un punto de la IA que se quita sigue en plans.propuesta_ia: el historial lo muestra
      // en "Puntos de la IA que el coach quitó" (rastroPlan).
      await tx.delete(planItems).where(eq(planItems.id, lectura.item.id));
      return { ok: true, respuesta: { ok: true } };
    });
  } catch (e) {
    logError("plan items: error al quitar un punto", e);
    return respuestaError(500, MENSAJES.errorGuardar);
  }

  if (!resultado.ok) return respuestaError(resultado.status, resultado.mensaje);
  return Response.json(resultado.respuesta);
}
