// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Las líneas de la trayectoria de función ejecutiva (spec 008). Funciones puras: reciben las filas ya
// leídas con RLS (lib/trayectoria/lectura.ts). No hay tabla de líneas ni vista: la lógica depende de
// approved_payload y de las correcciones, y una vista obligaría a repetirla en SQL (R-008.20).
//
// De una cita a una línea, en este orden:
//   1. Solo lo aprobado: evento propuesta_ia en approved, índices de cambios y avance (R-008.13).
//   2. Etiquetas: las de la IA, o lo que se lee del cambio en un evento viejo (R-008.14 a R-008.16).
//   3. Una sola línea por cita y dominio dentro del evento, con las etiquetas de la IA (R-008.19).
//   4. La cita tiene que estar en la nota de su sesión (R-008.17).
//   5. Una cita con palabras prohibidas no es línea: solo queda su fecha (R-008.18).
//   6. La corrección con el id más alto manda (R-008.29).
//
// Nada de aquí es un conteo (R-008.26): la posición de una línea se lee de su id, no de un número.
import { PayloadSeguimientoIA, type TipoSesion } from "@/lib/followup/schema";
import { soloParticipacion } from "@/lib/followup/validate";
import {
  Aprobacion,
  DOMINIOS_FE,
  PayloadPropuestaIA,
  type DireccionFE,
  type DominioFE,
  type EntradaIndiceObservacion,
  type TipoHallazgo,
} from "@/lib/profile/schema";
import { buscarCondiciones, buscarTerminos, citaEnNota, normalizar } from "@/lib/profile/terminos";

// ---------------------------------------------------------------------------
// IDs (R-008.11, R-008.12)
// ---------------------------------------------------------------------------

type Lista = "cambios" | "avance";

export const evidenciaId = (eventId: string, lista: Lista, i: number, j: number) => `${eventId}:${lista}[${i}].evidencia[${j}]`;

// Solo una cita de un evento viejo puede caer en varios dominios: esa lleva el dominio en el id.
export const lineaId = (evidencia: string, dominioLeido: DominioFE | null = null) =>
  dominioLeido ? `${evidencia}@${dominioLeido}` : evidencia;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type EventoLineas = {
  id: string;
  tipo: string;
  status: string;
  sessionId: string | null;
  createdAt: Date;
  payload: unknown;
  approvedPayload: unknown;
  sesion: { tipo: TipoSesion; realizadaEn: Date; nota: string } | null;
  decididoPor?: string | null; // quien aprobó el evento, para el historial (R-008.16)
};

export type CorreccionLineas = {
  id: number;
  lineaId: string;
  dominio: DominioFE | null;
  direccion: DireccionFE | null;
  anteriorLineaId: string | null;
  autor: string;
  createdAt: Date;
};

export type CorreccionLinea = Omit<CorreccionLineas, "id" | "lineaId" | "createdAt"> & { fecha: Date };

export type Linea = {
  lineaId: string;
  evidenciaId: string;
  eventId: string;
  sessionId: string;
  fecha: Date; // sessions.realizada_en
  eventoCreadoEn: Date; // profile_events.created_at, segundo criterio del orden (R-008.22)
  decididoPor: string | null; // quien aprobó el evento, para decir quién editó el tipo (R-008.16)
  tipoSesion: TipoSesion;
  cita: string;
  // Lo vigente: lo de la última corrección o, si no hay, lo de "ia".
  dominio: DominioFE | null;
  direccion: DireccionFE | null;
  anteriorLineaId: string | null;
  // Lo que propuso la IA. "direccion" es la de antes de la regla de participación (R-008.15, R-008.16).
  ia: {
    dominio: DominioFE | null;
    direccion: DireccionFE | null;
    anteriorLineaId: string | null;
    origen: "etiqueta_ia" | "lectura_anterior";
    tipoEditado: TipoHallazgo | null;
    sinDireccionPorParticipacion: boolean;
  };
  correcciones: CorreccionLinea[]; // de la más antigua a la más reciente
};

// El id de la sesión lleva a su nota, donde el coach sí puede leer la cita (R-008.18).
export type CitaNoMostrada = { fecha: Date; sessionId: string };

export type LineasArmadas = {
  lineas: Linea[];
  // Citas con palabras prohibidas: su fecha y su sesión, nunca su texto (R-008.18).
  noMostradas: CitaNoMostrada[];
  // Ids de líneas sin cita en su nota y de eventos que no se pudieron leer. Solo para el log: nunca
  // llevan el texto de una cita (R-008.17).
  sinResolver: string[];
};

// ---------------------------------------------------------------------------
// armarLineas
// ---------------------------------------------------------------------------

// Tabla de R-008.15: la dirección que da el tipo final de un cambio.
const DIRECCION_POR_TIPO: Record<TipoHallazgo, DireccionFE | null> = {
  fortaleza: "fortaleza",
  area_de_apoyo: "apoyo",
  contexto: null,
};

// Lista prohibida de R-008.18. buscarInternos no entra: el coach sí puede leer nombres de dominios.
const usaPalabraProhibida = (cita: string) => buscarTerminos(cita).length > 0 || buscarCondiciones(cita, []).length > 0;

function leerPayload(payload: unknown) {
  const tipo = (payload as { tipo?: unknown } | null)?.tipo;
  const r = tipo === "propuesta_seguimiento" ? PayloadSeguimientoIA.safeParse(payload) : PayloadPropuestaIA.safeParse(payload);
  if (!r.success) return null;
  const avance = "avance" in r.data.update ? r.data.update.avance : [];
  return { cambios: r.data.update.cambios, avance, indice: r.data.indiceObservaciones };
}

type EvidenciaLeida = { cita: string; dominio?: DominioFE | null; direccion?: DireccionFE | null; anteriorRef?: string | null };

type Candidata = Pick<Linea, "lineaId" | "evidenciaId" | "cita" | "dominio" | "direccion" | "anteriorLineaId" | "ia">;

// Una cita etiquetada: una sola línea (R-008.14, R-008.16).
function deEtiqueta(
  id: string,
  e: EvidenciaLeida,
  indice: EntradaIndiceObservacion[],
  tipoEditado: TipoHallazgo | null,
): Candidata {
  const dominio = e.dominio ?? null;
  let direccion = dominio ? (e.direccion ?? null) : null;
  let anteriorLineaId: string | null = null;
  if (direccion === "cambio") {
    anteriorLineaId = indice.find((o) => o.ref === e.anteriorRef)?.lineaId ?? null;
    if (!anteriorLineaId) direccion = null;
  }
  // La decisión del coach manda, pero "cambio" no se toca (R-008.16).
  const iaDireccion = e.direccion ?? null;
  if (tipoEditado && (direccion === "apoyo" || direccion === "fortaleza")) direccion = DIRECCION_POR_TIPO[tipoEditado];
  const sinDireccionPorParticipacion = tipoEditado !== null && direccion === "apoyo" && soloParticipacion([e.cita]);
  if (sinDireccionPorParticipacion) direccion = null;
  return {
    lineaId: id,
    evidenciaId: id,
    cita: e.cita,
    dominio,
    direccion,
    anteriorLineaId,
    ia: { dominio, direccion: iaDireccion, anteriorLineaId, origen: "etiqueta_ia", tipoEditado, sinDireccionPorParticipacion },
  };
}

// Una cita de un evento anterior a esta spec (R-008.12, R-008.15). Sin dominio no hay dirección, igual
// que en R-008.7 y en fe_corrections_sin_dominio.
function deLecturaAnterior(
  id: string,
  cita: string,
  dominios: DominioFE[],
  tipoFinal: TipoHallazgo,
  tipoEditado: TipoHallazgo | null,
): Candidata[] {
  const comun = { evidenciaId: id, cita, anteriorLineaId: null };
  const ia = { anteriorLineaId: null, origen: "lectura_anterior" as const, tipoEditado };
  if (dominios.length === 0) {
    return [{ ...comun, lineaId: id, dominio: null, direccion: null, ia: { ...ia, dominio: null, direccion: null, sinDireccionPorParticipacion: false } }];
  }
  const derivada = DIRECCION_POR_TIPO[tipoFinal];
  const sinDireccionPorParticipacion = derivada === "apoyo" && soloParticipacion([cita]);
  return dominios.map((dominio) => ({
    ...comun,
    lineaId: lineaId(id, dominio),
    dominio,
    direccion: sinDireccionPorParticipacion ? null : derivada,
    ia: { ...ia, dominio, direccion: derivada, sinDireccionPorParticipacion },
  }));
}

function candidatasDelEvento(eventId: string, payload: NonNullable<ReturnType<typeof leerPayload>>, aprobacion: Aprobacion): Candidata[] {
  const candidatas: Candidata[] = [];
  const ordenados = (indices: number[], largo: number) => [...new Set(indices)].filter((i) => i < largo).sort((a, b) => a - b);

  for (const i of ordenados(aprobacion.cambios, payload.cambios.length)) {
    const cambio = payload.cambios[i];
    const editado = aprobacion.ediciones.find((e) => e.indice === i)?.tipo;
    const tipoEditado = editado && editado !== cambio.tipo ? editado : null;
    cambio.evidencia.forEach((e: EvidenciaLeida, j) => {
      const id = evidenciaId(eventId, "cambios", i, j);
      if ("dominio" in e) candidatas.push(deEtiqueta(id, e, payload.indice, tipoEditado));
      else candidatas.push(...deLecturaAnterior(id, e.cita, cambio.dominiosFE, tipoEditado ?? cambio.tipo, tipoEditado));
    });
  }
  for (const i of ordenados(aprobacion.avance, payload.avance.length)) {
    payload.avance[i].evidencia.forEach((e: EvidenciaLeida, j) => {
      const id = evidenciaId(eventId, "avance", i, j);
      if ("dominio" in e) candidatas.push(deEtiqueta(id, e, payload.indice, null));
      else candidatas.push(...deLecturaAnterior(id, e.cita, [], "contexto", null)); // Sin dominio ni dirección.
    });
  }
  return candidatas;
}

export function armarLineas(eventos: EventoLineas[], correcciones: CorreccionLineas[]): LineasArmadas {
  const lineas: Linea[] = [];
  const noMostradas: CitaNoMostrada[] = [];
  const sinResolver: string[] = [];

  // De la más antigua a la más reciente: la última es la vigente, sin importar cómo lleguen.
  const porLinea = new Map<string, CorreccionLineas[]>();
  for (const c of [...correcciones].sort((a, b) => a.id - b.id)) {
    porLinea.set(c.lineaId, [...(porLinea.get(c.lineaId) ?? []), c]);
  }

  for (const evento of eventos) {
    if (evento.tipo !== "propuesta_ia" || evento.status !== "approved") continue;
    const payload = leerPayload(evento.payload);
    const aprobacion = Aprobacion.safeParse(evento.approvedPayload);
    if (!payload || !aprobacion.success) {
      sinResolver.push(evento.id);
      continue;
    }

    const vistas = new Set<string>();
    const excluidas = new Set<string>();
    for (const c of candidatasDelEvento(evento.id, payload, aprobacion.data)) {
      // Con las etiquetas de la IA, antes de las correcciones, para que no cambie con el tiempo (R-008.19).
      const clave = `${normalizar(c.cita)}\u0000${c.dominio ?? ""}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);

      if (!evento.sessionId || !evento.sesion || !citaEnNota(normalizar(c.cita), normalizar(evento.sesion.nota))) {
        sinResolver.push(c.lineaId);
        continue;
      }
      if (usaPalabraProhibida(c.cita)) {
        // Una cita de un evento viejo puede caer en varios dominios: el aviso sale una vez.
        if (!excluidas.has(c.evidenciaId)) noMostradas.push({ fecha: evento.sesion.realizadaEn, sessionId: evento.sessionId });
        excluidas.add(c.evidenciaId);
        continue;
      }

      const historial = porLinea.get(c.lineaId) ?? [];
      const vigente = historial.at(-1);
      lineas.push({
        ...c,
        eventId: evento.id,
        sessionId: evento.sessionId,
        fecha: evento.sesion.realizadaEn,
        eventoCreadoEn: evento.createdAt,
        decididoPor: evento.decididoPor ?? null,
        tipoSesion: evento.sesion.tipo,
        dominio: vigente ? vigente.dominio : c.dominio,
        direccion: vigente ? vigente.direccion : c.direccion,
        anteriorLineaId: vigente ? vigente.anteriorLineaId : c.anteriorLineaId,
        correcciones: historial.map((h) => ({
          dominio: h.dominio,
          direccion: h.direccion,
          anteriorLineaId: h.anteriorLineaId,
          autor: h.autor,
          fecha: h.createdAt,
        })),
      });
    }
  }

  return { lineas: lineas.sort(compararLineas), noMostradas, sinResolver };
}

// ---------------------------------------------------------------------------
// Orden (R-008.22)
// ---------------------------------------------------------------------------

const RUTA_EVIDENCIA = /:(cambios|avance)\[(\d+)\]\.evidencia\[(\d+)\]/;

// Lista, cambio y cita, leídos del id. Primero cambios y luego avance.
function posicion(evidencia: string): [number, number, number] {
  const m = RUTA_EVIDENCIA.exec(evidencia);
  return m ? [m[1] === "cambios" ? 0 : 1, Number(m[2]), Number(m[3])] : [0, 0, 0];
}

type LineaOrdenable = Pick<Linea, "fecha" | "eventoCreadoEn" | "evidenciaId" | "lineaId">;

// De la más antigua a la más reciente: realizada_en, created_at y posición en el payload.
export function compararLineas(a: LineaOrdenable, b: LineaOrdenable): number {
  const porTiempo = a.fecha.getTime() - b.fecha.getTime() || a.eventoCreadoEn.getTime() - b.eventoCreadoEn.getTime();
  if (porTiempo !== 0) return porTiempo;
  const [pa, pb] = [posicion(a.evidenciaId), posicion(b.evidenciaId)];
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2] || a.lineaId.localeCompare(b.lineaId);
}

// ---------------------------------------------------------------------------
// Corrección (R-008.30)
// ---------------------------------------------------------------------------

export type CorreccionPedida = Pick<Linea, "lineaId" | "dominio" | "direccion" | "anteriorLineaId">;

export const ERRORES_CORRECCION = {
  sinLinea: "Esta línea ya no existe. Recarga la página.",
  sinCambios: "No cambiaste nada.",
  sinAnterior: "Elige la cita anterior para marcar un cambio.",
  anteriorInvalida: "La cita anterior tiene que ser de este dominio y de antes que esta línea.",
  // Estos dos no los puede pedir el diálogo; siguen el mismo tono literal.
  direccionSinDominio: "Una cita sin dominio no lleva dirección.",
  anteriorSinCambio: "Solo un cambio lleva cita anterior.",
} as const;

// "lineas" son las de ahora, ya con las correcciones: una línea excluida (R-008.18) no está y no se
// puede corregir ni elegir como anterior. Una cita sobre hablar poco sí se puede marcar como apoyo: el
// diálogo avisa y no bloquea (R-008.31).
export function revisarCorreccion(lineas: Linea[], pedida: CorreccionPedida): { linea: Linea; error: null } | { linea: null; error: string } {
  const fallo = (error: string) => ({ linea: null, error });
  const linea = lineas.find((l) => l.lineaId === pedida.lineaId);
  if (!linea) return fallo(ERRORES_CORRECCION.sinLinea);
  if (pedida.direccion && !pedida.dominio) return fallo(ERRORES_CORRECCION.direccionSinDominio);
  if (pedida.direccion === "cambio") {
    if (!pedida.anteriorLineaId) return fallo(ERRORES_CORRECCION.sinAnterior);
    const anterior = lineas.find((l) => l.lineaId === pedida.anteriorLineaId);
    if (!anterior || anterior.dominio !== pedida.dominio || compararLineas(anterior, linea) >= 0) {
      return fallo(ERRORES_CORRECCION.anteriorInvalida);
    }
  } else if (pedida.anteriorLineaId) {
    return fallo(ERRORES_CORRECCION.anteriorSinCambio);
  }
  const iguales = pedida.dominio === linea.dominio && pedida.direccion === linea.direccion && pedida.anteriorLineaId === linea.anteriorLineaId;
  return iguales ? fallo(ERRORES_CORRECCION.sinCambios) : { linea, error: null };
}

// ---------------------------------------------------------------------------
// Trayectoria: lo que muestra la pantalla
// ---------------------------------------------------------------------------

export type BloqueDominio = { dominio: DominioFE; lineas: Linea[] };

export type Trayectoria = {
  // Siempre los 9, siempre en el orden de DOMINIOS_FE, sin importar cuántas líneas tenga cada uno (C-01).
  bloques: BloqueDominio[];
  sinDominio: Linea[];
  noMostradas: CitaNoMostrada[];
};

export function armarTrayectoria(lineas: Linea[], noMostradas: CitaNoMostrada[] = []): Trayectoria {
  const ordenadas = [...lineas].sort(compararLineas);
  return {
    bloques: DOMINIOS_FE.map(({ id }) => ({ dominio: id, lineas: ordenadas.filter((l) => l.dominio === id) })),
    sinDominio: ordenadas.filter((l) => l.dominio === null),
    noMostradas: [...noMostradas].sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
  };
}

// ---------------------------------------------------------------------------
// Observaciones previas (R-008.6)
// ---------------------------------------------------------------------------

// Lo que recibe el modelo de cada observación. No lleva lineaId: lo guarda "indice".
export type ObservacionIndice = { ref: string; dominio: DominioFE; direccion: DireccionFE | null; cita: string };

// El tope es suposición (R-008.6).
const OBSERVACIONES_POR_DOMINIO = 5;

// Las 5 más recientes por dominio, con las correcciones ya aplicadas. Una línea excluida (R-008.18) ya
// no está en "lineas". Una línea sin dominio no es observación de ningún dominio.
export function indiceObservaciones(lineas: Linea[]): { indice: EntradaIndiceObservacion[]; observaciones: ObservacionIndice[] } {
  const indice: EntradaIndiceObservacion[] = [];
  const observaciones: ObservacionIndice[] = [];
  for (const { dominio, lineas: delDominio } of armarTrayectoria(lineas).bloques) {
    for (const l of delDominio.slice(-OBSERVACIONES_POR_DOMINIO)) {
      const ref = `O-${String(indice.length + 1).padStart(2, "0")}`;
      indice.push({ ref, lineaId: l.lineaId, dominio, cita: l.cita });
      observaciones.push({ ref, dominio, direccion: l.direccion, cita: l.cita });
    }
  }
  return { indice, observaciones };
}

// ---------------------------------------------------------------------------
// Entrada del resumen por dominio (R-008.34)
// ---------------------------------------------------------------------------

// Lo que se revisa de cada línea. El modelo no recibe el lineaId: lo deja fuera el armado de su mensaje.
export type EntradaIndiceResumen = { ref: string; lineaId: string; direccion: DireccionFE | null; cita: string };

// El tope es suposición (R-008.34).
const LINEAS_POR_RESUMEN = 20;

// Recibe las líneas del bloque completo, sin filtros: una línea excluida (R-008.18) ya no está.
export function indiceResumen(lineas: Linea[]): EntradaIndiceResumen[] {
  return [...lineas]
    .sort(compararLineas)
    .slice(-LINEAS_POR_RESUMEN)
    .map((l, i) => ({ ref: `L-${String(i + 1).padStart(2, "0")}`, lineaId: l.lineaId, direccion: l.direccion, cita: l.cita }));
}
