// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/plans/[id]/items
// El coach agrega un punto propio al borrador (spec 003, tarea 16; R-003.22 a R-003.25, R-003.50,
// R-003.51). El punto nace con origen "coach", sin propuesta_ref y sin evidencia: el coach no
// escribe citas. Solo en borrador; un plan ya revisado responde 409.
import { eq, max } from "drizzle-orm";
import { ItemPlanCrear, type ItemPlanRespuesta } from "@/lib/api/contracts";
import { getUserWithRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { planItems } from "@/lib/db/schema";
import { logError } from "@/lib/log";
import { esVisiblePersona } from "@/lib/plan/schema";
import {
  citasDelPerfil,
  columnasItem,
  esUuid,
  fichaVerificada,
  leerPlanBloqueado,
  MENSAJES,
  origenItemValido,
  respuestaError,
  vistaItem,
  violaUnico,
} from "@/lib/plan/server";

type Resultado = { ok: true; respuesta: ItemPlanRespuesta } | { ok: false; status: number; mensaje: string };

export async function POST(req: Request, ctx: RouteContext<"/api/plans/[id]/items">) {
  const user = await getUserWithRole("coach");
  if (!user) return respuestaError(401, MENSAJES.noCoach);

  const { id: planId } = await ctx.params;
  if (!esUuid(planId)) return respuestaError(404, MENSAJES.sinPlan);

  const body = await req.json().catch(() => null);
  const parsed = ItemPlanCrear.safeParse(body);
  if (!parsed.success) return respuestaError(400, parsed.error.issues[0]?.message ?? "El punto no es válido.");
  const nuevo = parsed.data;

  // R-003.11: objetivo_equipo, ajuste_razonable, instruccion y comunicacion_lider no llevan textoPersona.
  if (nuevo.textoPersona !== null && !esVisiblePersona(nuevo.tipo)) {
    return respuestaError(400, MENSAJES.textoPersonaNoAplica);
  }

  let resultado: Resultado;
  try {
    resultado = await withRls(user.claims, async (tx): Promise<Resultado> => {
      const lectura = await leerPlanBloqueado(tx, planId, "share");
      if (lectura.estado === "no_existe") return { ok: false, status: 404, mensaje: MENSAJES.sinPlan };
      if (lectura.estado === "revisado") return { ok: false, status: 409, mensaje: MENSAJES.planRevisado };
      const { plan } = lectura;

      if (nuevo.fichaId !== null && !(await fichaVerificada(tx, nuevo.fichaId))) {
        return { ok: false, status: 400, mensaje: MENSAJES.fichaInvalida };
      }
      if (
        nuevo.origenItemId !== null &&
        !(await origenItemValido(tx, {
          engagementId: plan.engagementId,
          planId: plan.id,
          tipo: nuevo.tipo,
          origenItemId: nuevo.origenItemId,
          itemId: null,
        }))
      ) {
        return { ok: false, status: 400, mensaje: MENSAJES.origenInvalido };
      }

      // El punto nuevo va al final del borrador.
      const [{ ultimo }] = await tx
        .select({ ultimo: max(planItems.orden) })
        .from(planItems)
        .where(eq(planItems.planId, plan.id));

      const [fila] = await tx
        .insert(planItems)
        .values({
          planId: plan.id,
          engagementId: plan.engagementId,
          tipo: nuevo.tipo,
          descripcion: nuevo.descripcion,
          textoPersona: nuevo.textoPersona,
          knowledgeCardId: nuevo.fichaId,
          evidencia: [],
          orden: (ultimo ?? -1) + 1,
          origen: "coach",
          propuestaRef: null,
          origenItemId: nuevo.origenItemId,
        })
        .returning(columnasItem);

      return { ok: true, respuesta: { item: vistaItem(fila, citasDelPerfil(plan.perfil)) } };
    });
  } catch (e) {
    if (violaUnico(e, "plan_items_origen_unico")) return respuestaError(400, MENSAJES.origenInvalido);
    logError("plan items: error al agregar un punto", e);
    return respuestaError(500, MENSAJES.errorGuardar);
  }

  if (!resultado.ok) return respuestaError(resultado.status, resultado.mensaje);
  return Response.json(resultado.respuesta);
}
