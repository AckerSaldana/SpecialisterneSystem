// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Pedir un desglose de tareas (spec 010, R-010.1 a R-010.11, R-010.18, R-010.46 a R-010.48). Con el mismo orden que
// lib/sessions/proponer.ts y lib/guia/generar.ts:
//   1. tx1 (con RLS): acompañamiento (404), consentimiento (409), perfil (409), límite (429) y, si pide el coach, lo
//      que escribió (400). Cualquiera de estos cortes no llama al modelo, no audita y no guarda. Si pasa todo, reserva su
//      cupo con una fila propia, para que un pedido en camino ya cuente (R-010.48).
//   2. Fuera de cualquier transacción: el modelo, solo con la tarea, su contexto y la lista de apoyos (R-010.5).
//   3. Esquema estricto y validarPasos. Con problemas, una sola llamada más con sus códigos (R-010.18), si el
//      consentimiento sigue vigente (R-010.46, C-10). Una salida fuera del esquema no se reintenta: 502.
//   4. Cada llamada va a audit_log en su propia transacción, también si falla, sin texto: error solo lleva clase, código
//      o motivo (R-010.47). Para el límite solo cuentan las reservas, una por pedido (R-010.48).
//   5. limpiarPasos y tx2 (con RLS): consentimiento otra vez y guardado (R-010.46).
// Repetir una tarea sigue el mismo orden, sin reintento, y sin marcas no llama al modelo (R-010.35 a R-010.37).
// El desglose le llega a la persona sin revisión previa (D-070). Nada de esto toca el perfil, el plan o la etapa
// (R-010.10), y "Me atoré aquí" no pasa por aquí. No importa lib/auth, solo su tipo, y el modelo llega como parámetro,
// así un script lo prueba sin red (lib/api/ruta.ts).
import "server-only";
import { randomUUID } from "node:crypto";
import { NoObjectGeneratedError } from "ai";
import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { registrarAuditoria } from "@/lib/ai/audit";
import { bloquearCupo, llamadasDeHoy } from "@/lib/ai/limite";
import { MODEL_ID } from "@/lib/ai/model";
import { proposeAjustes, proposeDesglose, type ResultadoAjustesModelo, type ResultadoDesgloseModelo } from "@/lib/ai/propose-desglose";
import type { UsoTokens } from "@/lib/ai/propose-profile-update";
import { PedirDesgloseRequest, RepetirDesgloseRequest, type DesgloseCreadoResponse, type RepetirDesgloseResponse } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import type { AppRole } from "@/lib/auth";
import * as TEXTOS_COACH from "@/components/coach/desglose/textos";
import { sinConsentimiento } from "@/components/coach/plan/textos";
import * as TEXTOS_PERSONA from "@/components/persona/desglose/textos";
import { exigirConsentimiento } from "@/lib/consent";
import { withRls, type Tx } from "@/lib/db/rls";
import { engagements, taskBreakdowns, taskStepEvents, users } from "@/lib/db/schema";
import { construirApoyos, perfilMarcaIniciacion, refsDeInicio, type Apoyo } from "@/lib/desglose/adaptaciones";
import { copiarPasos, entradaDeAjustes, limpiarAjustes, textosDelPedido } from "@/lib/desglose/ajustes";
import { leerPerfilParaDesglose, leerPlanParaDesglose, type PerfilParaDesglose } from "@/lib/desglose/lectura";
import { AjustesProposal, DesgloseProposal, LIMITE_DIARIO_DESGLOSE, type ContextoDesglose, type DescartadoDesglose, type PasoDesglose } from "@/lib/desglose/schema";
import { limpiarPasos, mensajeBloqueoCoach, revisarTextoDesglose, validarPasos, type OpcionesValidacion, type ProblemaDePaso } from "@/lib/desglose/validate";
import { miAcompanamiento } from "@/lib/engagements/persona";
import { leerUltimoSnapshot } from "@/lib/followup/lectura";
import { logError, resumirError } from "@/lib/log";
import { citasDelPerfil } from "@/lib/plan/server";
import { copiasEn, notasDelAcompanamiento, type FuentesDeCopia } from "@/lib/sessions/copiado";
import { mensajeUsuarioAjustes, mensajeUsuarioDesglose, PROMPT_VERSION_DESGLOSE, PROMPT_VERSION_DESGLOSE_AJUSTES, type EntradaAjustesModelo, type EntradaDesgloseModelo } from "@/lib/prompts";

// R-010.47.
export const ACCION_DESGLOSE = "propose_task_breakdown";
export const ACCION_AJUSTES = "propose_task_adjustments";
export const ACCION_PLANTILLA = "adapt_task_template";
export const SUFIJO_REINTENTO = "_reintento";
// R-010.48: lo único que cuenta para el límite. Una por pedido que sí va a llamar al modelo, igual que en 009.
export const ACCION_RESERVA_DESGLOSE = "reserve_task_breakdown";

// R-010.48: va antes de contar y dura hasta el final de tx1. Quien sigue espera y ya ve la reserva del anterior.
async function limiteLleno(tx: Tx, user: UsuarioRuta, engagementId: string): Promise<boolean> {
  await bloquearCupo(tx, ACCION_RESERVA_DESGLOSE, user.id, engagementId);
  return (await llamadasDeHoy(tx, user.id, engagementId, [ACCION_RESERVA_DESGLOSE])) >= LIMITE_DIARIO_DESGLOSE;
}

// Solo cuando sí se va a llamar al modelo: en los demás cortes no se escribe en audit_log (R-010.3).
export const reservarCupo = (tx: Tx, user: UsuarioRuta, engagementId: string, promptVersion: string) =>
  registrarAuditoria(tx, { userId: user.id, engagementId, accion: ACCION_RESERVA_DESGLOSE, modelo: MODEL_ID, promptVersion, ok: true });

// Sin texto en la spec.
export const MENSAJES_DESGLOSE = {
  invalido: "Revisa lo que escribiste. La tarea debe tener entre 3 y 1000 caracteres, y cada dato opcional hasta 200.",
  sinAcompanamiento: "No encontramos este acompañamiento.",
  errorGuardar: "No se pudieron guardar los pasos. Puedes intentar otra vez.",
  repetirInvalido: "No se pudo leer lo que pediste. Intenta de nuevo.",
  sinTarea: "No encontramos esta tarea.",
} as const;

export type UsuarioDesglose = UsuarioRuta & { role: AppRole };

export type DepsDesglose = { proponer: (entrada: EntradaDesgloseModelo) => Promise<ResultadoDesgloseModelo> };

export const MODELO_REAL: DepsDesglose = { proponer: proposeDesglose };

type TextosSolicitud = {
  sinConsentimiento: string;
  perfilNoListo: string;
  limite: string;
  errorModelo: string;
  retiro: string;
};

const textosPersona: TextosSolicitud = {
  sinConsentimiento: TEXTOS_PERSONA.SIN_CONSENTIMIENTO,
  perfilNoListo: TEXTOS_PERSONA.PERFIL_NO_LISTO,
  limite: TEXTOS_PERSONA.LIMITE_ALCANZADO,
  errorModelo: TEXTOS_PERSONA.ERROR_PREPARAR,
  retiro: TEXTOS_PERSONA.RETIRO_DURANTE_LA_LLAMADA,
};

const textosCoach = (nombre: string): TextosSolicitud => ({
  sinConsentimiento: sinConsentimiento(nombre),
  perfilNoListo: TEXTOS_COACH.perfilNoListo(nombre),
  limite: TEXTOS_COACH.LIMITE_ALCANZADO,
  errorModelo: TEXTOS_COACH.ERROR_PREPARAR,
  retiro: TEXTOS_COACH.retiroDuranteLaLlamada(nombre),
});

// Quién pide. nombrePila solo existe si pide el coach: la persona no lo necesita para sus textos.
export type Solicitud = { esCoach: false; textos: TextosSolicitud } | { esCoach: true; nombrePila: string; textos: TextosSolicitud };

// R-010.2. null: 404. La persona no lee app.engagements, y su acompañamiento tiene que coincidir con el id de la URL.
async function leerSolicitud(tx: Tx, user: UsuarioDesglose, engagementId: string): Promise<Solicitud | null> {
  if (user.role === "persona") {
    const mio = await miAcompanamiento(tx);
    return mio?.id === engagementId ? { esCoach: false, textos: textosPersona } : null;
  }
  // RLS ya oculta el acompañamiento de otro coach; el filtro por coach lo deja explícito.
  const [engagement] = await tx
    .select({ personaId: engagements.personaId })
    .from(engagements)
    .where(and(eq(engagements.id, engagementId), eq(engagements.coachId, user.id)))
    .limit(1);
  if (!engagement) return null;
  const [persona] = await tx.select({ nombrePila: users.nombrePila }).from(users).where(eq(users.id, engagement.personaId)).limit(1);
  const nombrePila = persona?.nombrePila ?? "La persona";
  return { esCoach: true, nombrePila, textos: textosCoach(nombrePila) };
}

// Lo que ya pasó R-010.3.
export type ChequeosDelPedido = { solicitud: Solicitud; perfil: PerfilParaDesglose };

// Sale de tx1 y se usa fuera de la transacción.
export type ListoParaGenerar = ChequeosDelPedido & { apoyos: Apoyo[] };

// R-010.3, en este orden. El acompañamiento es lo primero. Aplicar una plantilla lee la suya entre esto y lo que sigue.
export async function chequeosDelPedido(tx: Tx, user: UsuarioDesglose, engagementId: string): Promise<RespuestaRuta | ChequeosDelPedido> {
  const solicitud = await leerSolicitud(tx, user, engagementId);
  if (!solicitud) return conError(404, MENSAJES_DESGLOSE.sinAcompanamiento);
  const { textos } = solicitud;

  if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, textos.sinConsentimiento);

  const perfil = await leerPerfilParaDesglose(tx, engagementId);
  if (!perfil) return conError(409, textos.perfilNoListo);

  if (await limiteLleno(tx, user, engagementId)) return conError(429, textos.limite);

  return { solicitud, perfil };
}

// R-010.55: las citas del último snapshot y las notas de las sesiones. Solo en el camino del coach, que sí las lee (RLS).
export async function fuentesDelCoach(tx: Tx, engagementId: string): Promise<FuentesDeCopia> {
  const [notas, snapshot] = await Promise.all([notasDelAcompanamiento(tx, engagementId), leerUltimoSnapshot(tx, engagementId)]);
  return { citas: snapshot ? citasDelPerfil(snapshot.perfil) : [], notas };
}

// Después de R-010.3: R-010.1 para lo que escribió el coach, y la lista de apoyos.
export async function revisarLoEscrito(tx: Tx, engagementId: string, { solicitud, perfil }: ChequeosDelPedido, tarea: string, contexto: ContextoDesglose | null): Promise<RespuestaRuta | ListoParaGenerar> {
  // Lo que escribe el coach le llega a la persona sin otra revisión (R-010.1, R-010.11). Lo que ella escribe para sí
  // misma no se bloquea aquí, y nunca se compara con notas ni citas (decisión abierta 2).
  if (solicitud.esCoach) {
    const textos = textosDelPedido(tarea, contexto);
    const [termino] = textos.flatMap(revisarTextoDesglose);
    if (termino) return conError(400, mensajeBloqueoCoach(solicitud.nombrePila, termino));
    // R-010.55: tampoco copia sus notas ni las citas del perfil.
    const [copia] = copiasEn(textos, await fuentesDelCoach(tx, engagementId));
    if (copia) return conError(400, mensajeBloqueoCoach(solicitud.nombrePila, copia));
  }

  const plan = await leerPlanParaDesglose(tx, engagementId);
  return { solicitud, perfil, apoyos: construirApoyos(perfil.dimensiones, plan) };
}

async function revisarAntesDelModelo(tx: Tx, user: UsuarioDesglose, engagementId: string, tarea: string, contexto: ContextoDesglose | null): Promise<RespuestaRuta | ListoParaGenerar> {
  const chequeos = await chequeosDelPedido(tx, user, engagementId);
  if ("status" in chequeos) return chequeos;
  const revisado = await revisarLoEscrito(tx, engagementId, chequeos, tarea, contexto);
  if (!("status" in revisado)) await reservarCupo(tx, user, engagementId, PROMPT_VERSION_DESGLOSE);
  return revisado;
}

type DatosAuditoria = { ok: boolean; modelo: string; promptVersion: string; latenciaMs: number; usage?: UsoTokens; error?: string };

// En su propia transacción: una llamada exitosa queda registrada aunque después falle el guardado (R-010.47).
async function auditar(user: UsuarioRuta, engagementId: string, accion: string, datos: DatosAuditoria): Promise<void> {
  try {
    await withRls(user.claims, (tx) =>
      registrarAuditoria(tx, {
        userId: user.id,
        engagementId,
        accion,
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
    logError(`${accion}: no se pudo escribir audit_log`, e);
  }
}

type RespuestaModelo<S> = { salida: S; usage: UsoTokens; latenciaMs: number; modelo: string; promptVersion: string };

// Una llamada, con su fila de auditoría si falla o sale del esquema. null: no hay de dónde seguir.
async function llamarAlModelo<S>(user: UsuarioRuta, engagementId: string, accion: string, promptVersion: string, llamar: () => Promise<RespuestaModelo<S>>, esquema: z.ZodType<S>) {
  const inicio = Date.now();
  let resultado: RespuestaModelo<S>;
  try {
    resultado = await llamar();
  } catch (e) {
    logError(`${accion}: error del modelo`, e);
    // Una salida que no pasa el esquema también se cobró: la fila lleva sus tokens (R-004.35).
    const uso = NoObjectGeneratedError.isInstance(e) ? e.usage : undefined;
    await auditar(user, engagementId, accion, {
      ok: false,
      modelo: MODEL_ID,
      promptVersion,
      latenciaMs: Date.now() - inicio,
      usage: uso ? { entrada: uso.inputTokens ?? null, salida: uso.outputTokens ?? null, cacheLectura: uso.inputTokenDetails?.cacheReadTokens ?? null } : undefined,
      // Con el modelo real, una salida fuera del esquema llega aquí y no al safeParse de abajo: es el mismo error (R-010.47).
      error: NoObjectGeneratedError.isInstance(e) ? "esquema" : resumirError(e),
    });
    return null;
  }

  const datos = { modelo: resultado.modelo, promptVersion: resultado.promptVersion, latenciaMs: resultado.latenciaMs, usage: resultado.usage };
  // El modelo simulado y cualquier llamador pasan por aquí: la limpieza arma objetos nuevos y dejaría fuera una llave
  // extra sin que nadie se entere (R-010.8).
  const salida = esquema.safeParse(resultado.salida);
  if (!salida.success) {
    await auditar(user, engagementId, accion, { ok: false, ...datos, error: "esquema" });
    return null;
  }
  return { salida: salida.data, datos };
}

// Códigos sin repetir, nunca texto de la tarea o de los pasos (R-010.47).
const errorDeValidacion = (problemas: readonly ProblemaDePaso[]) => `validacion: ${[...new Set(problemas.map((p) => p.problema))].join(",")}`;

// Lo que se le pidió al modelo, fuera de la lista de apoyos: una llave de aquí no cuenta (R-010.24).
export const textosDeLaEntrada = (entrada: EntradaDesgloseModelo): string[] => [...textosDelPedido(entrada.tarea, entrada.contexto), ...(entrada.plantilla?.pasos ?? []).flatMap((p) => [p.accion, p.criterioTerminado])];

export type PasosGenerados = { pasos: PasoDesglose[]; descartados: DescartadoDesglose[]; modelo: string; promptVersion: string };

// R-010.46: lo que tiene que seguir cierto antes de volver a mandarle datos al modelo y antes de guardar. La respuesta es el
// conflicto, o null si se puede seguir. Es la misma revisión en los dos lugares.
export type SigueVigente = (tx: Tx) => Promise<RespuestaRuta | null>;

// R-010.46 y C-10: el reintento vuelve a mandar la tarea y los apoyos, y sin consentimiento no se manda nada. Si no se puede
// revisar, tampoco: null, que es un 502.
async function revisarAntesDelReintento(user: UsuarioRuta, accion: string, sigueVigente: SigueVigente): Promise<RespuestaRuta | "seguir" | null> {
  try {
    return (await withRls(user.claims, sigueVigente)) ?? "seguir";
  } catch (e) {
    logError(`${accion}: no se pudo revisar el consentimiento antes del reintento`, e);
    return null;
  }
}

// R-010.18: el modelo, sus filtros y un solo reintento. null: 502. Una respuesta de ruta: el conflicto de sigueVigente, sin
// volver a llamar al modelo. Aplicar una plantilla también lo usa, con su acción.
export async function generarPasos(
  user: UsuarioRuta,
  engagementId: string,
  accion: string,
  entrada: EntradaDesgloseModelo,
  opciones: Omit<OpcionesValidacion, "entradaModelo" | "pedido">,
  apoyos: readonly Apoyo[],
  deps: DepsDesglose,
  sigueVigente: SigueVigente,
): Promise<PasosGenerados | RespuestaRuta | null> {
  // R-010.17 compara con lo que recibió el modelo, sin los códigos del reintento. R-010.24 no cuenta lo que ya venía en el pedido.
  const validacion: OpcionesValidacion = {
    ...opciones,
    entradaModelo: mensajeUsuarioDesglose(entrada),
    pedido: textosDeLaEntrada(entrada),
  };

  let problemas: ProblemaDePaso[] = [];
  for (const accionLlamada of [accion, `${accion}${SUFIJO_REINTENTO}`]) {
    if (problemas.length > 0) {
      const revision = await revisarAntesDelReintento(user, accion, sigueVigente);
      if (revision !== "seguir") return revision;
    }
    const entradaLlamada = problemas.length > 0 ? { ...entrada, problemas } : entrada;
    const respuesta = await llamarAlModelo(user, engagementId, accionLlamada, PROMPT_VERSION_DESGLOSE, () => deps.proponer(entradaLlamada), DesgloseProposal);
    if (!respuesta) return null;

    problemas = validarPasos(respuesta.salida.pasos, validacion);
    if (problemas.length > 0) {
      await auditar(user, engagementId, accionLlamada, { ok: false, ...respuesta.datos, error: errorDeValidacion(problemas) });
      continue;
    }

    try {
      const { pasos, descartados } = limpiarPasos(respuesta.salida.pasos, { apoyos });
      await auditar(user, engagementId, accionLlamada, { ok: true, ...respuesta.datos });
      return { pasos, descartados, modelo: respuesta.datos.modelo, promptVersion: respuesta.datos.promptVersion };
    } catch (e) {
      logError(`${accionLlamada}: la salida del modelo no cumple el contrato`, e);
      await auditar(user, engagementId, accionLlamada, { ok: false, ...respuesta.datos, error: resumirError(e) });
      return null;
    }
  }
  return null;
}

// POST /api/engagements/[id]/task-breakdowns. La persona y el coach mandan lo mismo.
export async function pedirDesglose(user: UsuarioDesglose, engagementId: string, body: unknown, deps: DepsDesglose = MODELO_REAL): Promise<RespuestaRuta> {
  const parsed = PedirDesgloseRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_DESGLOSE.invalido);
  const { tarea } = parsed.data;
  const contexto = parsed.data.contexto && Object.keys(parsed.data.contexto).length > 0 ? parsed.data.contexto : null;

  let listo: RespuestaRuta | ListoParaGenerar;
  try {
    listo = await withRls(user.claims, (tx) => revisarAntesDelModelo(tx, user, engagementId, tarea, contexto));
  } catch (e) {
    logError(`${ACCION_DESGLOSE}: error al leer el perfil`, e);
    return conError(500, MENSAJES_DESGLOSE.errorGuardar);
  }
  if ("status" in listo) return listo;
  const { solicitud, perfil, apoyos } = listo;

  // R-010.46: el consentimiento pudo retirarse mientras esperábamos al modelo.
  const sigueVigente: SigueVigente = async (tx) => ((await exigirConsentimiento(tx, engagementId)) ? null : conError(409, solicitud.textos.retiro));

  const generados = await generarPasos(
    user,
    engagementId,
    ACCION_DESGLOSE,
    { tarea, contexto, apoyos },
    {
      // R-010.15 y R-010.16: la excepción solo cubre lo que escribió la persona, nunca el coach.
      textoPersona: solicitud.esCoach ? [] : textosDelPedido(tarea, contexto),
      exigirInicio: perfilMarcaIniciacion(perfil.dimensiones) ? refsDeInicio(apoyos) : undefined,
    },
    apoyos,
    deps,
    sigueVigente,
  );
  if (!generados) return conError(502, solicitud.textos.errorModelo);
  if ("status" in generados) return generados;

  const id = randomUUID();
  try {
    const conflicto = await withRls(user.claims, async (tx) => {
      const vigente = await sigueVigente(tx);
      if (vigente) return vigente;
      await tx.insert(taskBreakdowns).values({
        id,
        engagementId,
        tareaOriginal: tarea,
        contexto,
        pasos: generados.pasos,
        // R-010.9: el id del snapshot, nunca una copia de su contenido.
        generadoDesde: perfil.snapshotId,
        promptVersion: generados.promptVersion,
        model: generados.modelo,
        descartados: generados.descartados,
        creadoPor: user.id,
      });
      return null;
    });
    if (conflicto) return conflicto;
  } catch (e) {
    logError(`${ACCION_DESGLOSE}: error al guardar`, e);
    return conError(500, MENSAJES_DESGLOSE.errorGuardar);
  }

  return { status: 201, cuerpo: { breakdownId: id } satisfies DesgloseCreadoResponse };
}

// ---------------------------------------------------------------------------
// Repetir una tarea (R-010.35 a R-010.37, R-010.46 a R-010.48)
// ---------------------------------------------------------------------------

export type DepsAjustes = { proponerAjustes: (entrada: EntradaAjustesModelo) => Promise<ResultadoAjustesModelo> };

const MODELO_REAL_AJUSTES: DepsAjustes = { proponerAjustes: proposeAjustes };

const respuestaCopia = (breakdownId: string, resultado: RepetirDesgloseResponse["resultado"]): RespuestaRuta => ({ status: 201, cuerpo: { breakdownId, resultado } satisfies RepetirDesgloseResponse });

type OrigenDeLaCopia = { tareaOriginal: string; contexto: ContextoDesglose | null; pasos: PasoDesglose[]; creadoPor: string };

// Sale de tx1 y se usa fuera de la transacción.
type ListoParaAjustes = { engagementId: string; origen: OrigenDeLaCopia; marcas: { pasoId: string; texto: string | null }[]; perfil: PerfilParaDesglose; apoyos: Apoyo[] };

// R-010.3 en su orden, y entre el consentimiento y el perfil, lo del origen. Sin marcas la copia se guarda aquí mismo: no
// llama al modelo y no cuenta para el límite (R-010.35, R-010.48).
async function revisarAntesDeRepetir(tx: Tx, user: UsuarioRuta, breakdownId: string): Promise<RespuestaRuta | ListoParaAjustes> {
  // Su único acompañamiento (R-002.4). La persona no tiene SELECT sobre app.engagements (R-002.40).
  const mio = await miAcompanamiento(tx);
  if (!mio) return conError(404, MENSAJES_DESGLOSE.sinTarea);
  if (!(await exigirConsentimiento(tx, mio.id))) return conError(409, TEXTOS_PERSONA.SIN_CONSENTIMIENTO);

  const [origen] = await tx
    .select({
      tareaOriginal: taskBreakdowns.tareaOriginal,
      contexto: taskBreakdowns.contexto,
      pasos: taskBreakdowns.pasos,
      creadoPor: taskBreakdowns.creadoPor,
      generadoDesde: taskBreakdowns.generadoDesde,
      promptVersion: taskBreakdowns.promptVersion,
      model: taskBreakdowns.model,
      archivadoEn: taskBreakdowns.archivadoEn,
      ajustes: taskBreakdowns.ajustes,
      ajustesDecididosEn: taskBreakdowns.ajustesDecididosEn,
    })
    .from(taskBreakdowns)
    .where(and(eq(taskBreakdowns.id, breakdownId), eq(taskBreakdowns.engagementId, mio.id)))
    .limit(1);
  if (!origen) return conError(404, MENSAJES_DESGLOSE.sinTarea);
  if (origen.archivadoEn) return conError(409, TEXTOS_PERSONA.TAREA_YA_NO_DISPONIBLE); // R-010.29
  if (origen.ajustes && !origen.ajustesDecididosEn) return conError(409, TEXTOS_PERSONA.DECIDE_AJUSTES); // R-010.38

  // Solo las de este desglose (R-010.36). También las de antes de un "Deshacer": el diálogo le dijo que le llegan a la IA (R-010.28).
  const marcas = await tx
    .select({ pasoId: taskStepEvents.pasoId, texto: taskStepEvents.texto })
    .from(taskStepEvents)
    .where(and(eq(taskStepEvents.breakdownId, breakdownId), eq(taskStepEvents.estado, "atorado")))
    .orderBy(asc(taskStepEvents.id));

  if (marcas.length === 0) {
    const id = randomUUID();
    await tx.insert(taskBreakdowns).values({
      id,
      engagementId: mio.id,
      tareaOriginal: origen.tareaOriginal,
      contexto: origen.contexto,
      pasos: copiarPasos(origen.pasos),
      generadoDesde: origen.generadoDesde,
      promptVersion: origen.promptVersion,
      model: origen.model,
      origenBreakdownId: breakdownId,
      creadoPor: user.id,
    });
    return respuestaCopia(id, "sin_marcas");
  }

  const perfil = await leerPerfilParaDesglose(tx, mio.id);
  if (!perfil) return conError(409, TEXTOS_PERSONA.PERFIL_NO_LISTO);
  if (await limiteLleno(tx, user, mio.id)) return conError(429, TEXTOS_PERSONA.LIMITE_ALCANZADO);

  const plan = await leerPlanParaDesglose(tx, mio.id);
  await reservarCupo(tx, user, mio.id, PROMPT_VERSION_DESGLOSE_AJUSTES);
  return { engagementId: mio.id, origen, marcas, perfil, apoyos: construirApoyos(perfil.dimensiones, plan) };
}

// POST /api/task-breakdowns/[id]/duplicate. Solo la persona: el coach no repite desgloses (R-010.35). Si el modelo falla o
// responde fuera del esquema, no se crea la copia y el origen no cambia (R-010.36). Si no queda ningún ajuste, se crea la
// copia con ajustes nulo y la persona puede marcar pasos (R-010.37).
export async function repetirDesglose(user: UsuarioRuta, breakdownId: string, body: unknown, deps: DepsAjustes = MODELO_REAL_AJUSTES): Promise<RespuestaRuta> {
  if (!RepetirDesgloseRequest.safeParse(body).success) return conError(400, MENSAJES_DESGLOSE.repetirInvalido);

  let listo: RespuestaRuta | ListoParaAjustes;
  try {
    listo = await withRls(user.claims, (tx) => revisarAntesDeRepetir(tx, user, breakdownId));
  } catch (e) {
    logError(`${ACCION_AJUSTES}: error al leer el origen`, e);
    return conError(500, MENSAJES_DESGLOSE.errorGuardar);
  }
  if ("status" in listo) return listo;
  const { engagementId, origen, marcas, perfil, apoyos } = listo;

  const pasos = copiarPasos(origen.pasos);
  const { entrada, refs, conAtoro } = entradaDeAjustes(origen, pasos, marcas, apoyos);

  const respuesta = await llamarAlModelo(user, engagementId, ACCION_AJUSTES, PROMPT_VERSION_DESGLOSE_AJUSTES, () => deps.proponerAjustes(entrada), AjustesProposal);
  if (!respuesta) return conError(502, TEXTOS_PERSONA.ERROR_REPETIR);

  let limpios: ReturnType<typeof limpiarAjustes>;
  try {
    limpios = limpiarAjustes(respuesta.salida.ajustes, {
      refs,
      conAtoro,
      apoyos,
      // R-010.37: la excepción de R-010.15 y R-010.16 es lo que ella escribió en el pedido, nunca las marcas, y lo del
      // coach no excusa nada. Una copia queda a su nombre: una copia de lo que preparó el coach sí usa este texto, que ya
      // pasó R-010.1 sin términos, así que la diferencia solo alcanza a las palabras de urgencia.
      textoPersona: origen.creadoPor === user.id ? textosDelPedido(origen.tareaOriginal, origen.contexto) : [],
      entradaModelo: mensajeUsuarioAjustes(entrada),
      pedido: textosDelPedido(origen.tareaOriginal, origen.contexto),
      exigirInicio: perfilMarcaIniciacion(perfil.dimensiones) ? refsDeInicio(apoyos) : undefined,
    });
    // Estos descartes no provocan reintento y la llamada sí sirvió (R-010.37).
    await auditar(user, engagementId, ACCION_AJUSTES, { ok: true, ...respuesta.datos });
  } catch (e) {
    logError(`${ACCION_AJUSTES}: la salida del modelo no cumple el contrato`, e);
    await auditar(user, engagementId, ACCION_AJUSTES, { ok: false, ...respuesta.datos, error: resumirError(e) });
    return conError(502, TEXTOS_PERSONA.ERROR_REPETIR);
  }

  const id = randomUUID();
  try {
    const conflicto = await withRls(user.claims, async (tx) => {
      // R-010.46: el consentimiento pudo retirarse mientras esperábamos al modelo.
      if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, TEXTOS_PERSONA.RETIRO_DURANTE_LA_LLAMADA);
      await tx.insert(taskBreakdowns).values({
        id,
        engagementId,
        tareaOriginal: origen.tareaOriginal,
        contexto: origen.contexto,
        pasos,
        generadoDesde: perfil.snapshotId,
        promptVersion: respuesta.datos.promptVersion,
        model: respuesta.datos.modelo,
        origenBreakdownId: breakdownId,
        // Sin ajustes que usar, nulo: la base rechaza una lista vacía y nadie queda esperando una decisión (R-010.37).
        ajustes: limpios.ajustes.length > 0 ? limpios.ajustes : null,
        descartados: limpios.descartados,
        creadoPor: user.id,
      });
      return null;
    });
    if (conflicto) return conflicto;
  } catch (e) {
    logError(`${ACCION_AJUSTES}: error al guardar`, e);
    return conError(500, MENSAJES_DESGLOSE.errorGuardar);
  }

  return respuestaCopia(id, limpios.ajustes.length > 0 ? "con_ajustes" : "sin_ajustes");
}
