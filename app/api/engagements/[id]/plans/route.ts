// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// POST /api/engagements/[id]/plans   (sin body)
// El coach pide una propuesta de plan a la IA (spec 003, tarea 15). Pasos:
//   1. tx1 (con RLS): engagement visible (404), consentimiento vigente (409, R-003.2), ningún
//      borrador abierto (409, R-003.3), último snapshot del perfil (409, R-003.1), fichas
//      verificadas (R-003.5) y nombre de pila. Si algo falla aquí no se llama al modelo ni se
//      escribe nada, tampoco en audit_log (CA-003.1 a CA-003.3).
//   2. Fuera de cualquier transacción: proposePlan (puede tardar varios segundos).
//   3. tx2 (con RLS): sanitizePlan, guarda el plan en borrador con sus ítems y audita
//      "propose_plan". El trigger app_on_plan_insert pasa la etapa de perfil a plan (R-003.57).
// Si el modelo falla o su salida no cumple el contrato, se audita con ok = false y no se guarda
// ningún plan (R-003.7, R-003.12, CA-003.22).
import { and, desc, eq } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/ai/audit";
import { MODEL_ID } from "@/lib/ai/model";
import { proposePlan, type FichaPrompt } from "@/lib/ai/propose-plan";
import type { ProposePlanResponse } from "@/lib/api/contracts";
import { getUserWithRole } from "@/lib/auth";
import { exigirConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { engagements, knowledgeCards, planItems, plans, profileSnapshots, users } from "@/lib/db/schema";
import { logError, resumirError } from "@/lib/log";
import { PayloadPlanIA, esVisiblePersona, type EvidenciaPlan } from "@/lib/plan/schema";
import { esUuid, MENSAJES, respuestaError, violaUnico } from "@/lib/plan/server";
import { sanitizePlan } from "@/lib/plan/validate";
import { DominioFE } from "@/lib/profile/schema";
import { notasDelAcompanamiento } from "@/lib/sessions/copiado";
import { PROMPT_VERSION_PLAN } from "@/lib/prompts";

const ACCION = "propose_plan";

// Resultado de tx1: o un error listo para responder, o lo que necesita la llamada al modelo.
type Contexto =
  | { ok: false; status: number; mensaje: string }
  | {
      ok: true;
      nombrePila: string;
      engagementType: (typeof engagements.$inferSelect)["type"];
      snapshot: { id: string; perfil: (typeof profileSnapshots.$inferSelect)["perfil"] };
      fichas: FichaPrompt[];
      notas: string[]; // R-003.62: solo para las banderas, no van al modelo
    };

export async function POST(_req: Request, ctx: RouteContext<"/api/engagements/[id]/plans">) {
  const user = await getUserWithRole("coach");
  if (!user) return respuestaError(401, MENSAJES.noCoach);

  const { id: engagementId } = await ctx.params;
  if (!esUuid(engagementId)) return respuestaError(404, MENSAJES.sinAcompanamiento);

  // --- 1. tx1: revisar que se puede pedir la propuesta y leer lo que va al modelo ------------
  let contexto: Contexto;
  try {
    contexto = await withRls(user.claims, async (tx): Promise<Contexto> => {
      // RLS: si el coach no es de este acompañamiento, no hay fila.
      const [engagement] = await tx
        .select({ type: engagements.type, personaId: engagements.personaId })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      if (!engagement) return { ok: false, status: 404, mensaje: MENSAJES.sinAcompanamiento };

      const [persona] = await tx
        .select({ nombrePila: users.nombrePila })
        .from(users)
        .where(eq(users.id, engagement.personaId))
        .limit(1);
      const nombrePila = persona?.nombrePila ?? "la persona";

      // Mismo chequeo que la política plans_insert_coach (private.app_has_consent).
      if (!(await exigirConsentimiento(tx, engagementId))) {
        return { ok: false, status: 409, mensaje: MENSAJES.sinConsentimiento(nombrePila) };
      }

      const [borrador] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(and(eq(plans.engagementId, engagementId), eq(plans.status, "borrador")))
        .limit(1);
      if (borrador) return { ok: false, status: 409, mensaje: MENSAJES.borradorAbierto };

      const [snapshot] = await tx
        .select({ id: profileSnapshots.id, perfil: profileSnapshots.perfil })
        .from(profileSnapshots)
        .where(eq(profileSnapshots.engagementId, engagementId))
        .orderBy(desc(profileSnapshots.version))
        .limit(1);
      if (!snapshot) return { ok: false, status: 409, mensaje: MENSAJES.sinPerfil };

      // R-003.5: solo fichas verificadas. Sin ninguna, la llamada sigue sin fichas.
      const fichas = await tx
        .select({
          id: knowledgeCards.id,
          titulo: knowledgeCards.titulo,
          tipo: knowledgeCards.tipo,
          dominioFe: knowledgeCards.dominioFe,
          contenido: knowledgeCards.contenido,
        })
        .from(knowledgeCards)
        .where(eq(knowledgeCards.verificada, true))
        .orderBy(knowledgeCards.id);

      const notas = await notasDelAcompanamiento(tx, engagementId);
      return { ok: true, nombrePila, engagementType: engagement.type, snapshot, fichas, notas };
    });
  } catch (e) {
    logError("plans: error al leer el acompañamiento", e);
    return respuestaError(500, MENSAJES.errorModelo);
  }
  if (!contexto.ok) return respuestaError(contexto.status, contexto.mensaje);

  // Audita una llamada que no terminó en un plan guardado. Va en su propia transacción porque
  // la de guardar el plan ya se deshizo (o nunca empezó).
  // Si el modelo ya respondió, la fila lleva también sus tokens (R-003.12).
  const auditarFalla = async (
    e: unknown,
    datos: {
      modelo: string;
      promptVersion: string;
      latenciaMs: number;
      usage?: { entrada?: number; salida?: number; cacheLectura?: number };
    },
  ) => {
    try {
      await withRls(user.claims, (tx) =>
        registrarAuditoria(tx, {
          userId: user.id,
          engagementId,
          accion: ACCION,
          modelo: datos.modelo,
          promptVersion: datos.promptVersion,
          tokensEntrada: datos.usage?.entrada,
          tokensSalida: datos.usage?.salida,
          tokensCacheLectura: datos.usage?.cacheLectura,
          latenciaMs: datos.latenciaMs,
          ok: false,
          // Resumen sin datos personales (lib/log.ts), nunca el message completo.
          error: resumirError(e),
        }),
      );
    } catch (auditError) {
      logError("plans: no se pudo escribir audit_log", auditError);
    }
  };

  // --- 2. Llamada al modelo, fuera de la transacción ----------------------------------------
  // Las señales activas no entran (decisión 5): proposePlan arma el mensaje solo con dimensiones.
  const inicio = Date.now();
  let resultado: Awaited<ReturnType<typeof proposePlan>>;
  try {
    resultado = await proposePlan({
      nombrePila: contexto.nombrePila,
      engagementType: contexto.engagementType,
      perfil: contexto.snapshot.perfil,
      fichas: contexto.fichas,
    });
  } catch (e) {
    logError("plans: error del modelo", e);
    await auditarFalla(e, { modelo: MODEL_ID, promptVersion: PROMPT_VERSION_PLAN, latenciaMs: Date.now() - inicio });
    return respuestaError(502, MENSAJES.errorModelo);
  }

  // Lo que se audita si la respuesta del modelo no termina en un plan guardado: con tokens y latencia.
  const datosRespuesta = {
    modelo: resultado.modelo,
    promptVersion: resultado.promptVersion,
    latenciaMs: resultado.latenciaMs,
    usage: resultado.usage,
  };

  // --- 3. Validación con código (R-003.13 a R-003.19) ----------------------------------------
  const fichasEnviadas = contexto.fichas.map((f) => f.id);
  const { indice } = resultado;
  let payload: PayloadPlanIA;
  try {
    const limpio = sanitizePlan(resultado.propuesta, { fichasEnviadas, indice, notas: contexto.notas });
    payload = PayloadPlanIA.parse({
      propuesta: limpio.propuesta,
      descartados: limpio.descartados,
      banderas: limpio.banderas,
      fichasEnviadas,
      evidenciaEnviada: indice.lista.map((e) => e.id),
    });
  } catch (e) {
    logError("plans: la salida del modelo no cumple el contrato", e);
    await auditarFalla(e, datosRespuesta);
    return respuestaError(502, MENSAJES.errorModelo);
  }

  // Ítems del borrador desde la propuesta limpia. propuesta_ref = índice en propuesta_ia (R-003.21).
  const filas = payload.propuesta.items.map((item, i) => {
    // R-003.14: el código convierte cada E-nn en { cita, sessionId } del snapshot.
    const evidencia: EvidenciaPlan[] = item.evidencia.flatMap((e) => {
      const encontrada = indice.porId.get(e.evidenciaId);
      return encontrada ? [{ cita: encontrada.cita, sessionId: encontrada.sessionId }] : [];
    });
    return {
      tipo: item.tipo,
      descripcion: item.descripcion,
      // R-003.11: solo objetivo y apoyo_fe llevan texto para la persona.
      textoPersona: esVisiblePersona(item.tipo) ? item.textoPersona : null,
      // R-003.19: solo un ID de DOMINIOS_FE; si no, nulo.
      dominioFe: DominioFE.safeParse(item.dominioFE).success ? item.dominioFE : null,
      // R-003.15: solo una ficha que se envió (sanitizePlan ya quitó las demás; se repite por seguridad).
      knowledgeCardId: item.fichaId && fichasEnviadas.includes(item.fichaId) ? item.fichaId : null,
      evidencia,
      orden: i,
      origen: "ia" as const,
      propuestaRef: i,
    };
  });

  // --- 4. tx2: guardar el borrador y auditar ------------------------------------------------
  let planId: string | null;
  try {
    planId = await withRls(user.claims, async (tx) => {
      // El consentimiento pudo retirarse mientras esperábamos al modelo.
      if (!(await exigirConsentimiento(tx, engagementId))) return null;

      const [plan] = await tx
        .insert(plans)
        .values({
          engagementId,
          titulo: "Plan de acompañamiento",
          status: "borrador",
          profileSnapshotId: contexto.snapshot.id,
          propuestaIa: payload,
          promptVersion: resultado.promptVersion,
          model: resultado.modelo,
          createdBy: user.id,
        })
        .returning({ id: plans.id });

      if (filas.length > 0) {
        await tx.insert(planItems).values(filas.map((f) => ({ ...f, planId: plan.id, engagementId })));
      }

      await registrarAuditoria(tx, {
        userId: user.id,
        engagementId,
        accion: ACCION,
        modelo: resultado.modelo,
        promptVersion: resultado.promptVersion,
        tokensEntrada: resultado.usage.entrada,
        tokensSalida: resultado.usage.salida,
        tokensCacheLectura: resultado.usage.cacheLectura,
        latenciaMs: resultado.latenciaMs,
        ok: true,
      });

      return plan.id;
    });
  } catch (e) {
    await auditarFalla(e, datosRespuesta);
    // Otra solicitud guardó un borrador mientras esperábamos al modelo (índice plans_un_borrador).
    if (violaUnico(e, "plans_un_borrador")) return respuestaError(409, MENSAJES.borradorAbierto);
    logError("plans: error al guardar el borrador", e);
    return respuestaError(500, MENSAJES.errorModelo);
  }
  if (!planId) {
    await auditarFalla(new Error("sin_consentimiento"), datosRespuesta);
    return respuestaError(409, MENSAJES.sinConsentimiento(contexto.nombrePila));
  }

  return Response.json({ planId } satisfies ProposePlanResponse);
}
