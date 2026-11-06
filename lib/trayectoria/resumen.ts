// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Resumen por dominio (spec 008, R-008.33, R-008.36 a R-008.39). Lo pide el coach y lo aprueba o descarta.
//   1. tx1 (con RLS): acompañamiento (404), consentimiento (409, sin auditoría), bloque vacío o propuesta
//      abierta (409). En esos casos no se llama al modelo.
//   2. Fuera de cualquier transacción: el modelo, con solo las líneas del bloque sin filtros (R-008.34).
//   3. Revisión con código: si no pasa, 502 y no se guarda nada (R-008.36).
//   4. La auditoría va en su propia transacción, también si falla. audit_log.error solo lleva la clase, el
//      código o el motivo del rechazo: nunca una cita ni la oración (R-008.39).
//   5. tx2 (con RLS): consentimiento otra vez y guardado. El índice único deja una sola propuesta.
// No importa lib/auth y el modelo llega como parámetro, así un script la prueba sin red (lib/api/ruta.ts).
import "server-only";
import { NoObjectGeneratedError } from "ai";
import { and, eq } from "drizzle-orm";
import { registrarAuditoria } from "@/lib/ai/audit";
import { MODEL_ID } from "@/lib/ai/model";
import { proposeResumenDominio, type ResultadoResumenModelo } from "@/lib/ai/propose-resumen-dominio";
import type { UsoTokens } from "@/lib/ai/propose-profile-update";
import { DecidirResumenRequest, PedirResumenRequest, type DecidirResumenResponse, type PedirResumenResponse } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { exigirConsentimiento } from "@/lib/consent";
import { withRls, type Tx } from "@/lib/db/rls";
import { engagements, feDomainSummaries } from "@/lib/db/schema";
import { logError, resumirError } from "@/lib/log";
import { violaUnico } from "@/lib/plan/server";
import type { DominioFE } from "@/lib/profile/schema";
import { PROMPT_VERSION_RESUMEN_DOMINIO, type EntradaResumenDominio } from "@/lib/prompts";
import { leerTrayectoria } from "@/lib/trayectoria/lectura";
import { armarTrayectoria, indiceResumen, type EntradaIndiceResumen, type Linea } from "@/lib/trayectoria/lineas";
import { ResumenDominioIA, revisarResumen, TEXTO_BLOQUE_CAMBIO, vigenciaResumen } from "@/lib/trayectoria/validate";

const ACCION = "propose_fe_domain_summary";

// Textos de la spec 008, "Pantallas y textos". Los que no tienen texto ahí siguen el mismo tono.
export const MENSAJES_RESUMEN = {
  propuestaAbierta: "Ya hay una propuesta para este dominio. Apruébala o descártala primero.",
  bloqueVacio: "Este dominio no tiene observaciones. No hay nada que resumir.",
  bloqueCambio: TEXTO_BLOQUE_CAMBIO,
  sinConsentimiento: "La persona no tiene consentimiento vigente. No se envió nada a la IA.",
  retiroDuranteLaLlamada: "La persona retiró su consentimiento mientras se generaba el resumen. El resumen no se guardó.",
  errorModelo: "No se pudo generar un resumen que cumpla las reglas. No se guardó nada. Puedes pedirlo otra vez.",
  // Sin texto en la spec.
  invalido: "El pedido no es válido. Recarga la página.",
  sinAcompanamiento: "No encontramos este acompañamiento.",
  sinResumen: "No encontramos este resumen.",
  yaDecidido: "Este resumen ya se decidió. Recarga la página para ver su estado.",
  sinConsentimientoDecidir: "La persona no tiene consentimiento vigente. No se guardó tu decisión.",
  errorGuardar: "No se pudo guardar el resumen. Intenta de nuevo.",
  errorDecidir: "No se pudo guardar tu decisión. Intenta de nuevo.",
} as const;

export type DepsResumen = { proponer: (entrada: EntradaResumenDominio) => Promise<ResultadoResumenModelo> };

const MODELO_REAL: DepsResumen = { proponer: proposeResumenDominio };

// RLS ya oculta el acompañamiento de otro coach; el filtro por coach también deja fuera a la persona.
async function esDelCoach(tx: Tx, user: UsuarioRuta, engagementId: string): Promise<boolean> {
  const [fila] = await tx
    .select({ id: engagements.id })
    .from(engagements)
    .where(and(eq(engagements.id, engagementId), eq(engagements.coachId, user.id)))
    .limit(1);
  return Boolean(fila);
}

// Las líneas de ahora del bloque, sin filtros y sin las excluidas (R-008.18, R-008.34).
async function lineasDelBloque(tx: Tx, engagementId: string, dominio: DominioFE): Promise<Linea[]> {
  const { lineas, noMostradas } = await leerTrayectoria(tx, engagementId);
  return armarTrayectoria(lineas, noMostradas).bloques.find((b) => b.dominio === dominio)?.lineas ?? [];
}

// POST /api/engagements/[id]/funcion-ejecutiva/resumenes
export async function pedirResumen(user: UsuarioRuta, engagementId: string, body: unknown, deps: DepsResumen = MODELO_REAL): Promise<RespuestaRuta> {
  const parsed = PedirResumenRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_RESUMEN.invalido);
  const { dominio } = parsed.data;

  let contexto: RespuestaRuta | { indice: EntradaIndiceResumen[]; bloqueIds: string[] };
  try {
    contexto = await withRls(user.claims, async (tx) => {
      if (!(await esDelCoach(tx, user, engagementId))) return conError(404, MENSAJES_RESUMEN.sinAcompanamiento);
      if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, MENSAJES_RESUMEN.sinConsentimiento);

      const bloque = await lineasDelBloque(tx, engagementId, dominio);
      if (bloque.length === 0) return conError(409, MENSAJES_RESUMEN.bloqueVacio);

      const [abierta] = await tx
        .select({ id: feDomainSummaries.id })
        .from(feDomainSummaries)
        .where(and(eq(feDomainSummaries.engagementId, engagementId), eq(feDomainSummaries.dominio, dominio), eq(feDomainSummaries.estado, "propuesto")))
        .limit(1);
      if (abierta) return conError(409, MENSAJES_RESUMEN.propuestaAbierta);

      return { indice: indiceResumen(bloque), bloqueIds: bloque.map((l) => l.lineaId) };
    });
  } catch (e) {
    logError(`${ACCION}: error al leer el bloque`, e);
    return conError(500, MENSAJES_RESUMEN.errorGuardar);
  }
  if ("status" in contexto) return contexto;
  const { indice, bloqueIds } = contexto;

  const auditar = async (datos: { ok: boolean; modelo: string; promptVersion: string; latenciaMs: number; usage?: UsoTokens; error?: string }) => {
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
          ok: datos.ok,
          error: datos.error,
        }),
      );
    } catch (e) {
      // Si tampoco se puede auditar, el log del servidor registra solo la acción y el código.
      logError(`${ACCION}: no se pudo escribir audit_log`, e);
    }
  };

  const inicio = Date.now();
  let resultado: ResultadoResumenModelo;
  try {
    resultado = await deps.proponer({ lineas: indice });
  } catch (e) {
    logError(`${ACCION}: error del modelo`, e);
    // Una salida que no pasa el esquema también se cobró: la fila lleva sus tokens (R-004.35).
    const uso = NoObjectGeneratedError.isInstance(e) ? e.usage : undefined;
    await auditar({
      ok: false,
      modelo: MODEL_ID,
      promptVersion: PROMPT_VERSION_RESUMEN_DOMINIO,
      latenciaMs: Date.now() - inicio,
      usage: uso
        ? { entrada: uso.inputTokens ?? null, salida: uso.outputTokens ?? null, cacheLectura: uso.inputTokenDetails?.cacheReadTokens ?? null }
        : undefined,
      error: resumirError(e),
    });
    return conError(502, MENSAJES_RESUMEN.errorModelo);
  }

  const datosRespuesta = { modelo: resultado.modelo, promptVersion: resultado.promptVersion, latenciaMs: resultado.latenciaMs, usage: resultado.usage };

  // El esquema estricto va primero: una llave extra, como un puntaje, no pasa (R-008.35).
  const salida = ResumenDominioIA.safeParse(resultado.salida);
  if (!salida.success) {
    await auditar({ ok: false, ...datosRespuesta, error: "esquema" });
    return conError(502, MENSAJES_RESUMEN.errorModelo);
  }
  const revision = revisarResumen(salida.data, indice);
  if (!revision.ok) {
    await auditar({ ok: false, ...datosRespuesta, error: revision.motivo });
    return conError(502, MENSAJES_RESUMEN.errorModelo);
  }

  await auditar({ ok: true, ...datosRespuesta });

  try {
    const resumenId = await withRls(user.claims, async (tx) => {
      // El consentimiento pudo retirarse mientras esperábamos al modelo. Un reintento no serviría.
      if (!(await exigirConsentimiento(tx, engagementId))) return null;
      const [fila] = await tx
        .insert(feDomainSummaries)
        .values({
          engagementId,
          dominio,
          texto: revision.oracion,
          lineaIds: revision.lineaIds,
          bloqueIds,
          promptVersion: resultado.promptVersion,
          model: resultado.modelo,
          createdBy: user.id,
        })
        .returning({ id: feDomainSummaries.id });
      return fila.id;
    });
    if (!resumenId) return conError(409, MENSAJES_RESUMEN.retiroDuranteLaLlamada);
    return { status: 201, cuerpo: { resumenId } satisfies PedirResumenResponse };
  } catch (e) {
    // Dos pedidos al mismo tiempo: el índice único deja solo la primera propuesta (R-008.33).
    if (violaUnico(e, "fe_domain_summaries_una_propuesta")) return conError(409, MENSAJES_RESUMEN.propuestaAbierta);
    logError(`${ACCION}: error al guardar`, e);
    return conError(500, MENSAJES_RESUMEN.errorGuardar);
  }
}

// POST /api/engagements/[id]/funcion-ejecutiva/resumenes/[resumenId]/decision
// Lleva el acompañamiento en la URL: con el consentimiento retirado, RLS oculta la fila y hay que poder
// responder 409 (misma razón que el reintento de 004).
export async function decidirResumen(user: UsuarioRuta, engagementId: string, resumenId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = DecidirResumenRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_RESUMEN.invalido);
  const estado = parsed.data.accion === "aprobar" ? "aprobado" : "descartado";

  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      if (!(await esDelCoach(tx, user, engagementId))) return conError(404, MENSAJES_RESUMEN.sinAcompanamiento);
      if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, MENSAJES_RESUMEN.sinConsentimientoDecidir);

      const donde = and(eq(feDomainSummaries.id, resumenId), eq(feDomainSummaries.engagementId, engagementId));
      const [resumen] = await tx
        .select({ dominio: feDomainSummaries.dominio, lineaIds: feDomainSummaries.lineaIds, bloqueIds: feDomainSummaries.bloqueIds, estado: feDomainSummaries.estado })
        .from(feDomainSummaries)
        .where(donde)
        .limit(1);
      if (!resumen) return conError(404, MENSAJES_RESUMEN.sinResumen);
      if (resumen.estado !== "propuesto") return conError(409, MENSAJES_RESUMEN.yaDecidido);

      // Las líneas se recalculan aquí: lo que vio el coach pudo cambiar (R-008.38). Descartar siempre se puede.
      if (estado === "aprobado") {
        const bloque = await lineasDelBloque(tx, engagementId, resumen.dominio);
        if (vigenciaResumen(resumen, bloque.map((l) => l.lineaId)).lineaCambio) return conError(409, MENSAJES_RESUMEN.bloqueCambio);
      }

      // El filtro por estado cubre dos decisiones al mismo tiempo: la segunda no encuentra la fila.
      const [fila] = await tx
        .update(feDomainSummaries)
        .set({ estado, decidedBy: user.id, decidedAt: new Date() })
        .where(and(donde, eq(feDomainSummaries.estado, "propuesto")))
        .returning({ id: feDomainSummaries.id });
      if (!fila) return conError(409, MENSAJES_RESUMEN.yaDecidido);

      return { status: 200, cuerpo: { resumenId: fila.id, estado } satisfies DecidirResumenResponse };
    });
  } catch (e) {
    logError(`${ACCION}: error al guardar la decisión`, e);
    return conError(500, MENSAJES_RESUMEN.errorDecidir);
  }
}
