// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Pedir un borrador de "Cómo trabajar conmigo" (spec 009, R-009.2, R-009.3). Sirve a las dos rutas de generación,
// con el mismo orden que lib/sessions/proponer.ts:
//   1. tx1 (con RLS): acompañamiento (404), consentimiento (409), perfil y plan (409), límite (429), borrador
//      abierto (409) y, si pide el coach, versiones (409). En esos casos no se llama al modelo ni se audita. Si se va a
//      llamar, reserva el cupo en esa misma transacción: un pedido en camino ya cuenta (R-009.17).
//   2. Fuera de cualquier transacción: el modelo, solo con lo que deja pasar armarEntradaGuia (R-009.7 a .9).
//   3. Esquema estricto y limpieza con código. Si no queda ninguna línea: 502 y no se guarda nada (R-009.18).
//   4. La auditoría va en su propia transacción, también si falla. audit_log.error solo lleva clase, código o
//      motivo: nunca texto de la guía, del perfil ni del plan (R-009.15).
//   5. tx2 (con RLS): consentimiento otra vez, que siga siendo la misma base (R-009.18), y guardado. El insert no usa
//      returning, porque RLS exigiría que el coach pudiera leer la fila: el id lo genera el servidor (R-009.13).
// Con una versión, lo que pide la persona es una regeneración (R-009.47): la base es su versión más alta, lista o
// retirada; el modelo solo recibe los orígenes cambiados o nuevos, y compararConBase dice qué cambiaría. Si solo
// hay orígenes que ya no existen, no se llama al modelo. Si no hay nada que cambiar, 409, y si el modelo ya lo revisó y
// no cambió nada, eso queda en la base para que el aviso no vuelva a salir (R-009.46). El coach no regenera.
// Nada de esto cambia el perfil, el plan, las señales o la etapa (R-009.19). No importa lib/auth y el modelo
// llega como parámetro, así un script la prueba sin red (lib/api/ruta.ts).
import "server-only";
import { randomUUID } from "node:crypto";
import { NoObjectGeneratedError } from "ai";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/ai/audit";
import { bloquearCupo, llamadasDeHoy } from "@/lib/ai/limite";
import { MODEL_ID } from "@/lib/ai/model";
import type { UsoTokens } from "@/lib/ai/propose-profile-update";
import { proposeSharedGuide, type ResultadoGuiaModelo } from "@/lib/ai/propose-shared-guide";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { textoRetiroDuranteLaLlamada, textoYaHayVersiones } from "@/components/coach/guia/textos";
import { sinConsentimiento } from "@/components/coach/plan/textos";
import { HOJA_CAMBIO, SIN_CAMBIOS, YA_HAY_BORRADOR } from "@/components/persona/guia/textos";
import { exigirConsentimiento } from "@/lib/consent";
import { withRls, type Tx } from "@/lib/db/rls";
import { engagements, personaProfiles, sharedGuides, users } from "@/lib/db/schema";
import { miAcompanamiento } from "@/lib/engagements/persona";
import type { EngagementType } from "@/lib/engagements/config";
import { compararConBase, descartesConRepetidas, origenesCambiados, type InsumosComparacion } from "@/lib/guia/comparar";
import { armarEntradaGuia, huellaEntrada } from "@/lib/guia/entrada";
import { leerInsumosGuia } from "@/lib/guia/insumos";
import { GuiaPropuesta, LineaGuia, MAX_NOMBRE_A_MOSTRAR, vistaDeGuia, type GuiaVista, type DescartesGuia } from "@/lib/guia/schema";
import { sanitizeGuia } from "@/lib/guia/validate";
import { logError, resumirError } from "@/lib/log";
import { violaUnico } from "@/lib/plan/server";
import { PerfilPersona } from "@/lib/profile/schema";
import { PROMPT_VERSION_GUIA, type EntradaGuiaModelo } from "@/lib/prompts";

export const ACCION_GUIA = "propose_shared_guide";
// La fila que aparta el cupo antes de llamar al modelo (R-009.17). No lleva texto ni tokens.
export const ACCION_RESERVA_GUIA = "reserve_shared_guide";

// R-009.17 (decisión abierta 8).
export const LIMITE_DIARIO_GUIA = 5;

// Textos de la spec 009, "Mensajes de las rutas".
export const MENSAJES_GUIA = {
  sinAcompanamiento: "No encontramos este acompañamiento.",
  personaSinConsentimiento: "No tienes consentimiento vigente. No se guardó nada y no se envió nada a la IA.",
  personaRetiroDuranteLaLlamada: "Retiraste tu consentimiento mientras se escribía el borrador. El borrador no se guardó.",
  personaSinInsumos: "Todavía no se puede. Tu perfil y tu plan tienen que estar aprobados primero. Habla con tu coach.",
  personaLimite: "Ya pediste varios borradores hoy. Puedes pedir otro mañana. Si lo necesitas antes, habla con tu coach.",
  personaYaHayBorrador: YA_HAY_BORRADOR,
  personaHojaCambio: HOJA_CAMBIO,
  personaErrorModelo: "No se pudo escribir el borrador. No se guardó nada. Intenta de nuevo.",
  personaSinCambios: SIN_CAMBIOS,
  yaEstaLista: "Esta versión ya está lista. Vuelve a abrir la página para verla.",
  coachSinConsentimiento: sinConsentimiento,
  coachRetiroDuranteLaLlamada: textoRetiroDuranteLaLlamada,
  coachSinInsumos: (nombre: string) => `Todavía no se puede. El perfil y el plan de ${nombre} tienen que estar aprobados primero.`,
  coachLimite: "Ya pediste varios borradores hoy. Puedes pedir otro mañana.",
  coachYaHayBorrador: (nombre: string) => `${nombre} ya tiene un borrador abierto. ${nombre} decide cuándo está listo.`,
  coachYaHayVersiones: textoYaHayVersiones,
  coachErrorModelo: "No se pudo escribir el borrador. No se guardó nada. Intenta de nuevo.",
  // Sin texto en la spec.
  errorGuardar: "No se pudo guardar el borrador. Intenta de nuevo.",
} as const;

export type DepsGuia = { proponer: (entrada: EntradaGuiaModelo) => Promise<ResultadoGuiaModelo> };

const MODELO_REAL: DepsGuia = { proponer: proposeSharedGuide };

// Lo que cambia entre las dos rutas. El resto del flujo es el mismo.
type Solicitud = {
  engagementId: string;
  engagementType: EngagementType;
  nombrePila: string;
  esCoach: boolean;
};

type TextosSolicitud = {
  retiro: string;
  yaHayBorrador: string;
  errorModelo: string;
  sinConsentimiento: string;
  sinInsumos: string;
  limite: string;
};

const textosPersona: TextosSolicitud = {
  retiro: MENSAJES_GUIA.personaRetiroDuranteLaLlamada,
  yaHayBorrador: MENSAJES_GUIA.personaYaHayBorrador,
  errorModelo: MENSAJES_GUIA.personaErrorModelo,
  sinConsentimiento: MENSAJES_GUIA.personaSinConsentimiento,
  sinInsumos: MENSAJES_GUIA.personaSinInsumos,
  limite: MENSAJES_GUIA.personaLimite,
};

const textosCoach = (nombre: string): TextosSolicitud => ({
  retiro: MENSAJES_GUIA.coachRetiroDuranteLaLlamada(nombre),
  yaHayBorrador: MENSAJES_GUIA.coachYaHayBorrador(nombre),
  errorModelo: MENSAJES_GUIA.coachErrorModelo,
  sinConsentimiento: MENSAJES_GUIA.coachSinConsentimiento(nombre),
  sinInsumos: MENSAJES_GUIA.coachSinInsumos(nombre),
  limite: MENSAJES_GUIA.coachLimite,
});

// La versión de la que parte una regeneración (R-009.47). perfilBase es lo que la persona ya puede leer de su
// snapshot; nunca le llega al modelo nada de lo que ella escribió en la guía (R-009.8).
type BaseGuia = {
  id: string;
  nombreAMostrar: string;
  lineas: LineaGuia[];
  planVersion: number;
  perfilBase: PerfilPersona | null;
  revisadaSinCambios: string | null;
};

const LineasGuardadas = z.array(LineaGuia);

// Su versión más alta, lista o retirada. Una a la vez: es la misma transacción y la misma conexión.
async function leerBase(tx: Tx, engagementId: string): Promise<BaseGuia | null> {
  const [fila] = await tx
    .select({
      id: sharedGuides.id,
      nombreAMostrar: sharedGuides.nombreAMostrar,
      lineas: sharedGuides.lineas,
      planVersion: sharedGuides.planVersion,
      snapshotId: sharedGuides.generadaDesdeSnapshotId,
      revisadaSinCambios: sharedGuides.revisadaSinCambios,
    })
    .from(sharedGuides)
    .where(and(eq(sharedGuides.engagementId, engagementId), isNotNull(sharedGuides.version)))
    .orderBy(desc(sharedGuides.version))
    .limit(1);
  if (!fila) return null;
  const [perfil] = await tx.select({ contenido: personaProfiles.contenido }).from(personaProfiles).where(eq(personaProfiles.snapshotId, fila.snapshotId)).limit(1);
  return {
    id: fila.id,
    nombreAMostrar: fila.nombreAMostrar,
    lineas: LineasGuardadas.parse(fila.lineas),
    planVersion: fila.planVersion,
    perfilBase: perfil ? PerfilPersona.parse(perfil.contenido) : null,
    revisadaSinCambios: fila.revisadaSinCambios,
  };
}

// Una versión a la vez, por acompañamiento. Lo toman quien marca una versión y quien guarda un borrador, para que la
// revisión de R-009.18 y el guardado no dejen un hueco. Dura lo que la transacción: nunca espera al modelo.
export async function bloquearVersiones(tx: Tx, engagementId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`shared_guides_version:${engagementId}`}, 0))`);
}

// La versión más alta que ve la persona, o null. Es lo que compara tx2 con la base de tx1 (R-009.18).
async function idVersionMasAlta(tx: Tx, engagementId: string): Promise<string | null> {
  const [fila] = await tx
    .select({ id: sharedGuides.id })
    .from(sharedGuides)
    .where(and(eq(sharedGuides.engagementId, engagementId), isNotNull(sharedGuides.version)))
    .orderBy(desc(sharedGuides.version))
    .limit(1);
  return fila?.id ?? null;
}

// Lo que necesita el modelo y lo que se guarda con el borrador. Sale de tx1 y se usa fuera de la transacción.
type ListoParaGenerar = {
  entrada: ReturnType<typeof armarEntradaGuia>;
  citas: string[];
  snapshotId: string;
  perfilVersion: number;
  planVersion: number;
  // Solo en una regeneración. Se queda en el servidor, como todo lo que sale de los insumos (R-009.10).
  regeneracion: { base: BaseGuia; insumos: InsumosComparacion } | null;
};

// R-009.3, en este orden. El acompañamiento (404) ya se revisó al armar la solicitud.
async function revisarAntesDelModelo(tx: Tx, user: UsuarioRuta, solicitud: Solicitud, textos: TextosSolicitud): Promise<RespuestaRuta | ListoParaGenerar> {
  const { engagementId } = solicitud;
  if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, textos.sinConsentimiento);

  // El coach no lee las retiradas y no regenera (R-009.47): su camino nunca toca la base.
  const base = solicitud.esCoach ? null : await leerBase(tx, engagementId);

  // null solo si el consentimiento se retiró entre las dos consultas.
  const insumos = await leerInsumosGuia(tx, engagementId, base?.planVersion ?? null);
  if (!insumos) return conError(409, textos.sinConsentimiento);
  if (!insumos.perfil || insumos.snapshotId === null || insumos.perfilVersion === null || insumos.planVersion === null) {
    return conError(409, textos.sinInsumos);
  }

  // R-009.17: se cuentan las reservas, y el candado dura hasta el final de esta transacción. Así un pedido en camino ya
  // cuenta, también si responde después de otro.
  await bloquearCupo(tx, ACCION_RESERVA_GUIA, user.id, engagementId);
  if ((await llamadasDeHoy(tx, user.id, engagementId, [ACCION_RESERVA_GUIA])) >= LIMITE_DIARIO_GUIA) return conError(429, textos.limite);
  if (insumos.hayBorrador) return conError(409, textos.yaHayBorrador);
  // El coach solo pide el primer borrador (R-009.47). hayVersiones no dice si hay retiradas.
  if (solicitud.esCoach && insumos.hayVersiones) return conError(409, MENSAJES_GUIA.coachYaHayVersiones(solicitud.nombrePila));

  const comun = { citas: insumos.citas, snapshotId: insumos.snapshotId, perfilVersion: insumos.perfilVersion, planVersion: insumos.planVersion };
  // Solo cuando sí se va a llamar al modelo: en las demás respuestas no se escribe en audit_log (R-009.3).
  const reservarCupo = () =>
    registrarAuditoria(tx, { userId: user.id, engagementId, accion: ACCION_RESERVA_GUIA, modelo: MODEL_ID, promptVersion: PROMPT_VERSION_GUIA, ok: true });

  if (base) {
    const cambiada = armarEntradaGuia(insumos, origenesCambiados(insumos, base.perfilBase));
    // Lo mismo que el modelo ya revisó sin cambios no se le vuelve a mandar: el aviso ya no sale, y esto solo llega
    // desde una pestaña vieja (R-009.46).
    const entrada = huellaEntrada(cambiada) === base.revisadaSinCambios ? armarEntradaGuia(insumos, new Set()) : cambiada;
    if (entrada.origenes.length > 0) await reservarCupo();
    return { ...comun, entrada, regeneracion: { base, insumos } };
  }

  const entrada = armarEntradaGuia(insumos);
  // Si todo quedó fuera por R-009.9, el modelo no tiene de dónde escribir. No se gasta la llamada.
  if (entrada.origenes.length === 0) return conError(409, textos.sinInsumos);

  await reservarCupo();
  return { ...comun, entrada, regeneracion: null };
}

// tx2: consentimiento otra vez, que siga siendo la misma base, y guardado. Sin returning (R-009.13).
async function guardarBorrador(
  user: UsuarioRuta,
  solicitud: Solicitud,
  textos: TextosSolicitud,
  listo: ListoParaGenerar,
  datos: { lineas: LineaGuia[]; descartes: DescartesGuia; promptVersion: string | null; modelo: string | null },
): Promise<RespuestaRuta | { guardado: GuiaVista }> {
  const { engagementId } = solicitud;
  const id = randomUUID();
  const nombreAMostrar = listo.regeneracion?.base.nombreAMostrar ?? solicitud.nombrePila.slice(0, MAX_NOMBRE_A_MOSTRAR);
  try {
    const conflicto = await withRls(user.claims, async (tx) => {
      // El consentimiento pudo retirarse mientras esperábamos al modelo. Un reintento no serviría.
      if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, textos.retiro);
      await bloquearVersiones(tx, engagementId);
      // R-009.18: la persona pudo marcar una versión mientras tanto. El coach no regenera. A ella, guardar desde una
      // base vieja o desde cero le regresaría líneas que ya quitó (R-009.47, R-009.50).
      if (solicitud.esCoach) {
        const insumos = await leerInsumosGuia(tx, engagementId);
        if (insumos?.hayVersiones) return conError(409, MENSAJES_GUIA.coachYaHayVersiones(solicitud.nombrePila));
      } else if ((await idVersionMasAlta(tx, engagementId)) !== (listo.regeneracion?.base.id ?? null)) {
        return conError(409, MENSAJES_GUIA.personaHojaCambio);
      }
      await tx.insert(sharedGuides).values({
        id,
        engagementId,
        nombreAMostrar,
        lineas: datos.lineas,
        descartes: datos.descartes,
        generadaDesdeSnapshotId: listo.snapshotId,
        perfilVersion: listo.perfilVersion,
        planVersion: listo.planVersion,
        guiaBaseId: listo.regeneracion?.base.id ?? null,
        generadaPor: user.id,
        promptVersion: datos.promptVersion,
        model: datos.modelo,
      });
      return null;
    });
    if (conflicto) return conflicto;
  } catch (e) {
    // Dos pedidos al mismo tiempo: la llamada ya pasó y ya está en audit_log; el índice único deja uno (R-009.14).
    if (violaUnico(e, "shared_guides_un_borrador")) return conError(409, textos.yaHayBorrador);
    logError(`${ACCION_GUIA}: error al guardar`, e);
    return conError(500, MENSAJES_GUIA.errorGuardar);
  }
  return { guardado: vistaDeGuia({ id, estado: "borrador", version: null, nombreAMostrar, lineas: datos.lineas, descartes: datos.descartes }) };
}

// R-009.47: si no hay nada que mandarle al modelo, no se le llama. Con orígenes que ya no existen sí hay algo que
// mostrarle, y el borrador se crea sin prompt ni modelo. Sin ningún cambio, 409.
async function regenerarSinModelo(
  user: UsuarioRuta,
  solicitud: Solicitud,
  textos: TextosSolicitud,
  listo: ListoParaGenerar,
  regeneracion: NonNullable<ListoParaGenerar["regeneracion"]>,
): Promise<RespuestaRuta | { guardado: GuiaVista }> {
  const { lineas, cambios } = compararConBase({ base: regeneracion.base.lineas, nuevas: [], insumos: regeneracion.insumos, perfilBase: regeneracion.base.perfilBase });
  if (cambios === 0) return conError(409, MENSAJES_GUIA.personaSinCambios);
  return guardarBorrador(user, solicitud, textos, listo, { lineas, descartes: {}, promptVersion: null, modelo: null });
}

// Si esto falla, la persona solo vuelve a ver el aviso: no cambia la respuesta.
async function anotarRevisada(user: UsuarioRuta, guiaId: string, huella: string): Promise<void> {
  try {
    await withRls(user.claims, (tx) => tx.update(sharedGuides).set({ revisadaSinCambios: huella }).where(eq(sharedGuides.id, guiaId)));
  } catch (e) {
    logError(`${ACCION_GUIA}: no se pudo anotar la revisión`, e);
  }
}

async function generarYGuardar(
  user: UsuarioRuta,
  solicitud: Solicitud,
  textos: TextosSolicitud,
  listo: ListoParaGenerar,
  deps: DepsGuia,
): Promise<RespuestaRuta | { guardado: GuiaVista }> {
  const { engagementId } = solicitud;
  const { regeneracion } = listo;

  if (regeneracion && listo.entrada.origenes.length === 0) return regenerarSinModelo(user, solicitud, textos, listo, regeneracion);

  const auditar = async (datos: { ok: boolean; modelo: string; promptVersion: string; latenciaMs: number; usage?: UsoTokens; error?: string }) => {
    try {
      await withRls(user.claims, (tx) =>
        registrarAuditoria(tx, {
          userId: user.id,
          engagementId,
          accion: ACCION_GUIA,
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
      logError(`${ACCION_GUIA}: no se pudo escribir audit_log`, e);
    }
  };

  const inicio = Date.now();
  let resultado: ResultadoGuiaModelo;
  try {
    resultado = await deps.proponer({
      nombrePila: solicitud.nombrePila,
      engagementType: solicitud.engagementType,
      origenes: listo.entrada.origenes,
      soloEstos: regeneracion !== null,
    });
  } catch (e) {
    logError(`${ACCION_GUIA}: error del modelo`, e);
    // Una salida que no pasa el esquema también se cobró: la fila lleva sus tokens (R-004.35).
    const uso = NoObjectGeneratedError.isInstance(e) ? e.usage : undefined;
    await auditar({
      ok: false,
      modelo: MODEL_ID,
      promptVersion: PROMPT_VERSION_GUIA,
      latenciaMs: Date.now() - inicio,
      usage: uso
        ? { entrada: uso.inputTokens ?? null, salida: uso.outputTokens ?? null, cacheLectura: uso.inputTokenDetails?.cacheReadTokens ?? null }
        : undefined,
      error: resumirError(e),
    });
    return conError(502, textos.errorModelo);
  }

  const datosRespuesta = { modelo: resultado.modelo, promptVersion: resultado.promptVersion, latenciaMs: resultado.latenciaMs, usage: resultado.usage };

  // El esquema estricto va primero: una sección fuera de las cinco o una llave extra, como un dominio, no pasa
  // (R-009.4, R-009.16). sanitizeGuia arma objetos nuevos y dejaría fuera esa llave sin que nadie se entere.
  const salida = GuiaPropuesta.safeParse(resultado.salida);
  if (!salida.success) {
    await auditar({ ok: false, ...datosRespuesta, error: "esquema" });
    return conError(502, textos.errorModelo);
  }

  let lineas: LineaGuia[];
  let descartes: DescartesGuia;
  let cambios: number | null = null;
  try {
    ({ lineas, descartes } = sanitizeGuia(salida.data, { indice: listo.entrada.indice, citas: listo.citas }));
    if (regeneracion) {
      const comparacion = compararConBase({ base: regeneracion.base.lineas, nuevas: lineas, insumos: regeneracion.insumos, perfilBase: regeneracion.base.perfilBase });
      // Sin líneas limpias todavía puede haber algo que mostrar: un "sale" no necesita al modelo.
      if (lineas.length > 0 || comparacion.cambios > 0) {
        lineas = comparacion.lineas;
        descartes = descartesConRepetidas(descartes, comparacion.repetidas);
        cambios = comparacion.cambios;
      }
    }
  } catch (e) {
    logError(`${ACCION_GUIA}: la salida del modelo no cumple el contrato`, e);
    await auditar({ ok: false, ...datosRespuesta, error: resumirError(e) });
    return conError(502, textos.errorModelo);
  }
  if (lineas.length === 0) {
    await auditar({ ok: false, ...datosRespuesta, error: "sin_lineas" });
    return conError(502, textos.errorModelo);
  }

  await auditar({ ok: true, ...datosRespuesta });

  // El modelo respondió, pero lo que escribió no cambia nada de la hoja (R-009.47). Queda anotado en la base: sin esto,
  // el aviso seguiría saliendo y cada clic gastaría una llamada para llegar a lo mismo (R-009.46, C-14).
  if (cambios === 0) {
    if (regeneracion) await anotarRevisada(user, regeneracion.base.id, huellaEntrada(listo.entrada));
    return conError(409, MENSAJES_GUIA.personaSinCambios);
  }

  return guardarBorrador(user, solicitud, textos, listo, { lineas, descartes, promptVersion: resultado.promptVersion, modelo: resultado.modelo });
}

// POST /api/engagements/[id]/shared-guides. El cuerpo va vacío: sin líneas, conteos ni id (R-009.13).
export async function pedirBorradorCoach(user: UsuarioRuta, engagementId: string, deps: DepsGuia = MODELO_REAL): Promise<RespuestaRuta> {
  let contexto: RespuestaRuta | { solicitud: Solicitud; textos: TextosSolicitud; listo: ListoParaGenerar };
  try {
    contexto = await withRls(user.claims, async (tx) => {
      // RLS ya oculta el acompañamiento de otro coach; el filtro por coach también deja fuera a la persona.
      const [engagement] = await tx
        .select({ id: engagements.id, type: engagements.type, personaId: engagements.personaId })
        .from(engagements)
        .where(and(eq(engagements.id, engagementId), eq(engagements.coachId, user.id)))
        .limit(1);
      if (!engagement) return conError(404, MENSAJES_GUIA.sinAcompanamiento);

      const [persona] = await tx.select({ nombrePila: users.nombrePila }).from(users).where(eq(users.id, engagement.personaId)).limit(1);
      const nombrePila = persona?.nombrePila ?? "La persona";
      const solicitud: Solicitud = { engagementId, engagementType: engagement.type, nombrePila, esCoach: true };
      const textos = textosCoach(nombrePila);

      const listo = await revisarAntesDelModelo(tx, user, solicitud, textos);
      return "status" in listo ? listo : { solicitud, textos, listo };
    });
  } catch (e) {
    logError(`${ACCION_GUIA}: error al leer los insumos`, e);
    return conError(500, MENSAJES_GUIA.errorGuardar);
  }
  if ("status" in contexto) return contexto;

  const resultado = await generarYGuardar(user, contexto.solicitud, contexto.textos, contexto.listo, deps);
  return "guardado" in resultado ? { status: 201, cuerpo: {} } : resultado;
}

// POST /api/persona/shared-guides. El acompañamiento sale de miAcompanamiento. Responde solo lo que la
// persona ya puede leer de su fila, sin orígenes (R-009.33).
export async function pedirBorradorPersona(user: UsuarioRuta, deps: DepsGuia = MODELO_REAL): Promise<RespuestaRuta> {
  let contexto: RespuestaRuta | { solicitud: Solicitud; listo: ListoParaGenerar };
  try {
    contexto = await withRls(user.claims, async (tx) => {
      // Su único acompañamiento (R-002.4). La persona no tiene SELECT sobre app.engagements (R-002.40).
      const engagement = await miAcompanamiento(tx);
      if (!engagement) return conError(404, MENSAJES_GUIA.sinAcompanamiento);

      const [persona] = await tx.select({ nombrePila: users.nombrePila }).from(users).where(eq(users.id, user.id)).limit(1);
      const solicitud: Solicitud = { engagementId: engagement.id, engagementType: engagement.type, nombrePila: persona?.nombrePila ?? "La persona", esCoach: false };

      const listo = await revisarAntesDelModelo(tx, user, solicitud, textosPersona);
      return "status" in listo ? listo : { solicitud, listo };
    });
  } catch (e) {
    logError(`${ACCION_GUIA}: error al leer los insumos`, e);
    return conError(500, MENSAJES_GUIA.errorGuardar);
  }
  if ("status" in contexto) return contexto;

  const resultado = await generarYGuardar(user, contexto.solicitud, textosPersona, contexto.listo, deps);
  return "guardado" in resultado ? { status: 201, cuerpo: { guia: resultado.guardado } } : resultado;
}
