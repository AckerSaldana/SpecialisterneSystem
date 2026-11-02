// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Caso de demo de la spec 007 (R-007.58, R-007.69): esquema y validación. Funciones puras, sin red
// ni base, para que las usen eval/compare.ts y scripts/seed-demo.ts. Vive aparte porque compare.ts
// corre main al importarse.
//
// El caso trae las sesiones en orden, cada una con su propuesta fija y sus etiquetas, y el plan
// aprobado. No trae perfilAprobado: el snapshot sale de aprobar cada propuesta. Tampoco trae
// indiceObservaciones: se calcula con armarLineas desde las sesiones anteriores (R-008.6, R-008.7).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { bloqueosDeCambios, citasDePropuesta, comoFollowup, aprobacionVacia, seleccionValida } from "@/lib/followup/aprobacion";
import { armarIndicePlan } from "@/lib/followup/avance";
import { aRealizadaEn, esFechaFutura } from "@/lib/followup/fecha";
import { FollowupUpdateEtiquetado, PayloadSeguimientoIA, TipoSesion, type EntradaIndicePlan } from "@/lib/followup/schema";
import { sanitizeFollowup } from "@/lib/followup/validate";
import { indiceEvidencia } from "@/lib/plan/evidence";
import { EvidenciaPlan, TipoItemPlan, esVisiblePersona, type PayloadPlanIA } from "@/lib/plan/schema";
import { banderasDeItem, banderasQueBloquean } from "@/lib/plan/validate";
import { applyApproval, validarIndices } from "@/lib/profile/merge";
import { Aprobacion, DominioFE, PayloadPropuestaIA, PERFIL_VACIO, ProfileUpdateEtiquetado, type Perfil, type ProfileEventPayload } from "@/lib/profile/schema";
import { buscarTerminos } from "@/lib/profile/terminos";
import { sanitizeUpdate } from "@/lib/profile/validate";
import { armarLineas, indiceObservaciones, type EventoLineas } from "@/lib/trayectoria/lineas";
import { limpiarEtiquetas } from "@/lib/trayectoria/validate";

export const SesionDemo = z.strictObject({
  id: z.uuid(),
  tipo: TipoSesion,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nota: z.string().min(1),
  eventoId: z.uuid(),
  // La primera sesión es de evaluación inicial; las demás, de seguimiento. Toda cita lleva sus
  // etiquetas, como la salida del modelo (R-007.69, R-008.4).
  update: z.union([ProfileUpdateEtiquetado, FollowupUpdateEtiquetado]),
  aprobacion: Aprobacion,
});
export type SesionDemo = z.infer<typeof SesionDemo>;

// Forma de plan_items (R-007.53). En esta fase ningún ítem cita una ficha: siguen sin verificar
// (decisión 5 de 007, decisión 1 de 003).
export const ItemPlanDemo = z.strictObject({
  id: z.uuid(),
  tipo: TipoItemPlan,
  descripcion: z.string().min(1),
  texto_persona: z.string().min(1).nullable(),
  dominio_fe: DominioFE.nullable(),
  knowledge_card_id: z.null(),
  evidencia: z.array(EvidenciaPlan).min(1),
});
export type ItemPlanDemo = z.infer<typeof ItemPlanDemo>;

// Estricto (R-007.1): una llave de cuenta, consentimiento, verificación, perfilAprobado o
// indiceObservaciones hace inválido el caso (R-007.69).
export const CasoDemo = z.strictObject({
  _atribucion: z.string(),
  _nota: z.string().includes("Persona y datos inventados."),
  formato: z.literal(2),
  autor: z.string().min(1),
  revision: z.strictObject({
    estado: z.enum(["borrador", "revisado_equipo", "revisado_partner"]),
    por: z.string().nullable(),
    fecha: z.string().nullable(),
  }),
  etapas: z.tuple([z.literal("demo")]),
  id: z.string(),
  descripcion: z.string(),
  basadoEn: z.string(),
  engagementType: z.literal("workplace_support"),
  nombrePila: z.string(),
  sesiones: z.array(SesionDemo),
  planAprobado: z.strictObject({ items: z.array(ItemPlanDemo).min(1) }),
});
export type CasoDemo = z.infer<typeof CasoDemo>;

// Un ProfileUpdate también pasa como unión; la posición decide qué esquema le toca.
const esSeguimiento = (update: SesionDemo["update"]): update is FollowupUpdateEtiquetado => "avance" in update;

export const indicePlanDemo = (caso: Pick<CasoDemo, "planAprobado">): EntradaIndicePlan[] => armarIndicePlan(caso.planAprobado.items);

const citasDelPerfil = (perfil: Perfil) => [
  ...Object.values(perfil.dimensiones).flatMap((d) => d?.evidencia ?? []),
  ...perfil.senalesActivas.flatMap((s) => s.evidencia),
].map((e) => e.cita);

type CasoLimpieza = Pick<CasoDemo, "planAprobado" | "sesiones">;

// Lo que limpia la app antes de guardar la propuesta de una sesión, con las observaciones de las
// sesiones anteriores (R-007.69). En la primera sesión el índice queda vacío.
export function limpiarSesion(caso: CasoLimpieza, sesion: SesionDemo) {
  const anteriores = caso.sesiones.slice(0, caso.sesiones.findIndex((s) => s.id === sesion.id));
  const { lineas } = armarLineas(anteriores.map((s) => eventoDeSesion(caso, s)), []);
  const { indice } = indiceObservaciones(lineas);
  const citasPrevias = indice.map((e) => e.cita);
  if (esSeguimiento(sesion.update)) {
    const limpio = sanitizeFollowup(sesion.update, sesion.nota, { indicePlan: indicePlanDemo(caso), fichasVerificadas: [], citasPrevias });
    return { ...limpiarEtiquetas(limpio, indice), indiceObservaciones: indice };
  }
  return { ...limpiarEtiquetas(sanitizeUpdate(sesion.update, sesion.nota, citasPrevias), indice), indiceObservaciones: indice };
}

// El payload que guarda el seed en profile_events, igual de limpio que el de la app.
export function payloadDeSesion(caso: CasoLimpieza, sesion: SesionDemo): ProfileEventPayload {
  const limpio = limpiarSesion(caso, sesion);
  return esSeguimiento(sesion.update)
    ? PayloadSeguimientoIA.parse({ tipo: "propuesta_seguimiento", ...limpio, indicePlan: indicePlanDemo(caso) })
    : PayloadPropuestaIA.parse({ tipo: "propuesta_ia", ...limpio });
}

// Una sesión ya aprobada, como la lee lib/trayectoria/lectura.ts.
function eventoDeSesion(caso: CasoLimpieza, sesion: SesionDemo): EventoLineas {
  const realizadaEn = aRealizadaEn(sesion.fecha);
  return {
    id: sesion.eventoId,
    tipo: "propuesta_ia",
    status: "approved",
    sessionId: sesion.id,
    createdAt: realizadaEn,
    payload: payloadDeSesion(caso, sesion),
    approvedPayload: sesion.aprobacion,
    sesion: { tipo: sesion.tipo, realizadaEn, nota: sesion.nota },
  };
}

// Las líneas de la trayectoria de todas las sesiones, sin correcciones (R-007.69).
export const lineasDeDemo = (caso: CasoLimpieza) => armarLineas(caso.sesiones.map((s) => eventoDeSesion(caso, s)), []);

// Las fechas de lo que escribe el seed salen de las sesiones del caso, no del día en que corre
// (R-007.60). El orden es el de la historia: el acompañamiento, la verificación, el consentimiento de
// la persona, la primera sesión y su aprobación, el borrador del plan y su aprobación, y cada sesión de
// seguimiento con su aprobación. Cada aprobación es el mismo día que su sesión.
const HORA = 3_600_000;
const DIA = 24 * HORA;

export function calendarioDemo(caso: Pick<CasoDemo, "sesiones">) {
  const primera = aRealizadaEn(caso.sesiones[0].fecha).getTime();
  const enPrimera = (dias: number, horas = 0) => new Date(primera + dias * DIA + horas * HORA);
  return {
    acompanamiento: enPrimera(-6),
    verificacion: enPrimera(-6, 1),
    consentimiento: enPrimera(-5),
    sesiones: caso.sesiones.map((s) => {
      const realizadaEn = aRealizadaEn(s.fecha);
      return { id: s.id, realizadaEn, propuesta: new Date(realizadaEn.getTime() + HORA), aprobacion: new Date(realizadaEn.getTime() + 3 * HORA) };
    }),
    borradorPlan: enPrimera(1),
    aprobacionPlan: enPrimera(2),
  };
}

// Lo anterior como una lista en orden, para revisar que ningún paso se adelante a otro.
export function pasosDelCalendario(caso: Pick<CasoDemo, "sesiones">): { paso: string; fecha: Date }[] {
  const c = calendarioDemo(caso);
  const [inicial, ...seguimiento] = c.sesiones;
  return [
    { paso: "el acompañamiento", fecha: c.acompanamiento },
    { paso: "la verificación", fecha: c.verificacion },
    { paso: "el consentimiento", fecha: c.consentimiento },
    { paso: "la primera sesión", fecha: inicial.realizadaEn },
    { paso: "su propuesta", fecha: inicial.propuesta },
    { paso: "su aprobación", fecha: inicial.aprobacion },
    { paso: "el borrador del plan", fecha: c.borradorPlan },
    { paso: "la aprobación del plan", fecha: c.aprobacionPlan },
    ...seguimiento.flatMap((s) => [
      { paso: `la sesión ${s.id}`, fecha: s.realizadaEn },
      { paso: `la propuesta de la sesión ${s.id}`, fecha: s.propuesta },
      { paso: `la aprobación de la sesión ${s.id}`, fecha: s.aprobacion },
    ]),
  ];
}

// El perfil que resulta de aprobar la evaluación inicial: de ahí sale el índice E-nn del plan.
export function perfilInicial(sesion: SesionDemo): Perfil {
  return applyApproval(PERFIL_VACIO, comoFollowup(sesion.update), sesion.aprobacion, {
    sessionId: sesion.id,
    eventId: sesion.eventoId,
    now: new Date(`${sesion.fecha}T12:00:00.000Z`),
  });
}

// El perfil que resulta de aprobar todas las sesiones: el de su último snapshot. Un caso de desglose de Renata tiene que
// traer este, tal cual (R-010.53).
export function perfilFinalDemo(caso: Pick<CasoDemo, "sesiones">): Perfil {
  return caso.sesiones.reduce(
    (perfil, s) =>
      applyApproval(perfil, esSeguimiento(s.update) ? s.update : comoFollowup(s.update), s.aprobacion, {
        sessionId: s.id,
        eventId: s.eventoId,
        now: new Date(`${s.fecha}T12:00:00.000Z`),
      }),
    PERFIL_VACIO,
  );
}

// R-007.1: las llaves extra que empiezan con "_" se aceptan y no cuentan para el esquema. La usan
// eval/compare.ts y leerCasoDemo, para que el eval y el seed apliquen la misma regla.
export function sinLlavesExtra(json: unknown): unknown {
  if (typeof json !== "object" || json === null) return json;
  return Object.fromEntries(Object.entries(json).filter(([k]) => !k.startsWith("_") || k === "_atribucion" || k === "_nota"));
}

// Revisa un caso de demo ya parseado (R-007.53, R-007.69). Devuelve los motivos por los que es inválido.
export function problemasCasoDemo(
  archivo: string,
  caso: CasoDemo,
  base: { id: string; nota: string; nombrePila: string } | null,
  ahora: Date = new Date(),
): string[] {
  const problemas: string[] = [];
  const nombre = /^\d{4}-\d{2}-\d{2}_(caso-[a-z0-9-]+-\d{2})\.json$/.exec(archivo);
  if (!nombre) problemas.push("el nombre de archivo no sigue AAAA-MM-DD_caso-<tipo>-<nn>.json");
  else if (nombre[1] !== caso.id) problemas.push(`el id "${caso.id}" no coincide con el archivo`);

  const { sesiones } = caso;
  if (sesiones.length < 2) problemas.push("tiene que traer al menos una sesión de evaluación inicial y una de seguimiento");

  // La primera nota es la de su caso base, carácter por carácter.
  if (!base || sesiones[0]?.nota !== base.nota) problemas.push(`la primera nota no es igual a la de ${caso.basadoEn}`);
  if (base && caso.nombrePila !== base.nombrePila) problemas.push(`el nombre de pila no es el de ${caso.basadoEn}`);

  // Fechas distintas, en orden y no posteriores a hoy.
  sesiones.forEach((s, i) => {
    if (esFechaFutura(s.fecha, ahora)) problemas.push(`la fecha de la sesión ${s.id} es posterior a hoy`);
    if (i > 0 && s.fecha <= sesiones[i - 1].fecha) problemas.push(`la fecha de la sesión ${s.id} no es posterior a la anterior`);
  });
  const ids = sesiones.flatMap((s) => [s.id, s.eventoId]);
  if (new Set(ids).size !== ids.length) problemas.push("hay sesiones o eventos con el mismo id");

  let citasAnteriores: string[] = [];
  let perfilAcumulado: Perfil = PERFIL_VACIO;
  // Sin una aprobación válida en la primera sesión no hay perfil v1 contra el cual revisar el plan.
  let primeraAprobacionOk = sesiones.length > 0;
  sesiones.forEach((s, i) => {
    // R-007.6 y R-007.7 también en estas notas.
    for (const termino of buscarTerminos(s.nota)) problemas.push(`la nota tiene un término no permitido: ${termino}`);
    if (/@|\d{7,}/.test(s.nota)) problemas.push("la nota tiene un correo, un teléfono o un número largo");

    if (i === 0 && esSeguimiento(s.update)) problemas.push(`la sesión ${s.id} es de evaluación inicial y trae una propuesta de seguimiento`);
    if (i > 0 && !esSeguimiento(s.update)) problemas.push(`la sesión ${s.id} es de seguimiento y su propuesta no trae avance, contexto ni siguiente paso`);

    // Cada update pasa la limpieza sin descartes y sin banderas: el seed no llama al modelo.
    const limpio = limpiarSesion(caso, s);
    for (const d of limpio.descartados) {
      if (d.motivo === "etiqueta_sin_anterior" || d.motivo === "etiqueta_participacion") problemas.push(`limpiarEtiquetas descartó algo en la sesión ${s.id}: ${d.motivo}`);
      else problemas.push(`la limpieza descartó algo en la sesión ${s.id}: ${d.ruta} ${d.motivo}`);
    }
    for (const b of limpio.banderas) problemas.push(`la limpieza marcó algo en la sesión ${s.id}: ${b.ruta} ${b.motivo} «${b.termino}»`);

    // La aprobación tiene que pasar por decidirPropuesta tal cual.
    const update = esSeguimiento(s.update) ? s.update : comoFollowup(s.update);
    if (aprobacionVacia(s.aprobacion)) problemas.push(`la aprobación de la sesión ${s.id} está vacía`);
    let indicesOk = seleccionValida(update, s.aprobacion);
    try {
      validarIndices(update, s.aprobacion);
    } catch {
      indicesOk = false;
    }
    if (!indicesOk) {
      if (i === 0) primeraAprobacionOk = false;
      problemas.push(`la aprobación de la sesión ${s.id} no coincide con su propuesta`);
      return;
    }
    const citas = [...citasDePropuesta(update), ...citasAnteriores, ...limpio.indiceObservaciones.map((e) => e.cita)];
    for (const b of bloqueosDeCambios(update, s.aprobacion, citas, [s.nota])) {
      problemas.push(`la aprobación de la sesión ${s.id} se bloquearía: ${b.ruta} «${b.termino}»`);
    }
    perfilAcumulado = applyApproval(perfilAcumulado, update, s.aprobacion, {
      sessionId: s.id,
      eventId: s.eventoId,
      now: new Date(`${s.fecha}T12:00:00.000Z`),
    });
    citasAnteriores = citasDelPerfil(perfilAcumulado);
  });

  // La trayectoria muestra un cambio con su cita anterior, y toda línea sale de la nota de su sesión.
  if (sesiones.length > 0) {
    const { lineas, sinResolver } = lineasDeDemo(caso);
    if (!lineas.some((l) => l.direccion === "cambio" && l.anteriorLineaId)) problemas.push("ninguna línea tiene un cambio con su cita anterior");
    for (const id of sinResolver) problemas.push(`una línea no sale de la nota de su sesión: ${id}`);

    // R-007.60: ningún paso se adelanta a otro, y todo queda antes de hoy.
    pasosDelCalendario(caso).forEach(({ paso, fecha }, i, pasos) => {
      if (i > 0 && fecha.getTime() <= pasos[i - 1].fecha.getTime()) problemas.push(`${paso} queda antes de ${pasos[i - 1].paso}`);
      if (fecha.getTime() > ahora.getTime()) problemas.push(`${paso} queda después de hoy`);
    });
  }

  // Plan: al menos un objetivo, evidencia que sale del perfil v1 y textos que se pueden aprobar.
  const { items } = caso.planAprobado;
  if (!items.some((i) => i.tipo === "objetivo")) problemas.push("el plan aprobado necesita al menos un objetivo");
  const planIds = items.map((i) => i.id);
  if (new Set(planIds).size !== planIds.length) problemas.push("hay ítems del plan con el mismo id");
  if (primeraAprobacionOk) {
    const perfil = perfilInicial(sesiones[0]);
    const validas = new Set(indiceEvidencia(perfil).lista.map((e) => `${e.sessionId}\u0000${e.cita}`));
    const citas = citasDelPerfil(perfil);
    items.forEach((item, k) => {
      for (const e of item.evidencia) {
        if (!validas.has(`${e.sessionId}\u0000${e.cita}`)) problemas.push(`una cita del plan no sale del perfil v1: "${e.cita}"`);
      }
      if (item.texto_persona !== null && !esVisiblePersona(item.tipo)) problemas.push(`el ítem ${k + 1} es de tipo ${item.tipo} y no lleva texto para la persona`);
      const banderas = banderasDeItem(
        { tipo: item.tipo, descripcion: item.descripcion, textoPersona: item.texto_persona },
        { citas, ruta: `items[${k}]` },
      );
      for (const b of banderasQueBloquean(banderas)) problemas.push(`el plan no se podría aprobar: ${b.ruta}.${b.campo} ${b.motivo} «${b.termino}»`);
    });
  }
  return problemas;
}

// Lo que se guarda en plans.propuesta_ia del borrador, con los E-nn del perfil v1. Va marcado con la
// prompt_version del seed; no viene del modelo (R-007.60).
export function propuestaPlanDemo(caso: CasoDemo): PayloadPlanIA {
  const indice = indiceEvidencia(perfilInicial(caso.sesiones[0]));
  const idDe = (e: { cita: string; sessionId: string }) => indice.lista.find((x) => x.cita === e.cita && x.sessionId === e.sessionId)!.id;
  return {
    propuesta: {
      items: caso.planAprobado.items.map((i) => ({
        tipo: i.tipo,
        descripcion: i.descripcion,
        textoPersona: i.texto_persona,
        dominioFE: i.dominio_fe,
        fichaId: null,
        evidencia: i.evidencia.map((e) => ({ evidenciaId: idDe(e) })),
      })),
    },
    descartados: [],
    banderas: [],
    fichasEnviadas: [],
    evidenciaEnviada: indice.lista.map((e) => e.id),
  };
}

// Lee el caso de demo y su caso base de eval/cases. Lo usa el seed; el eval ya los trae leídos.
export function leerCasoDemo(dir: string): { archivo: string; caso: CasoDemo; base: { id: string; nota: string; nombrePila: string } | null } | { problema: string } {
  if (!existsSync(dir)) return { problema: `no existe ${dir}` };
  const archivos = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((archivo) => ({ archivo, json: JSON.parse(readFileSync(path.join(dir, archivo), "utf8")) as { id?: unknown; etapas?: unknown; nota?: unknown; nombrePila?: unknown } }));
  const demo = archivos.filter(({ json }) => Array.isArray(json.etapas) && json.etapas.includes("demo"));
  if (demo.length !== 1) return { problema: `tiene que haber un caso de demo y hay ${demo.length}` };
  const parse = CasoDemo.safeParse(sinLlavesExtra(demo[0].json));
  if (!parse.success) return { problema: parse.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ") };
  const base = archivos.find(({ json }) => json.id === parse.data.basadoEn)?.json;
  const casoBase = typeof base?.nota === "string" && typeof base.nombrePila === "string" ? { id: parse.data.basadoEn, nota: base.nota, nombrePila: base.nombrePila } : null;
  return { archivo: demo[0].archivo, caso: parse.data, base: casoBase };
}
