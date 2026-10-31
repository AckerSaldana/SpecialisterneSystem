// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Aplica al perfil lo que el coach aprobó de una propuesta (función pura, sin red ni base).
// - Cada cambio aprobado reemplaza resumen, tipo y dominiosFE de su dimensión y suma su
//   evidencia a la que ya había (sin duplicados, máximo 10 citas por dimensión: se quedan
//   las más recientes). El tipo y el resumen pueden venir editados por el coach (R-004.43, R-004.44).
// - Cada señal aprobada queda como una sola entrada por tipo en senalesActivas (R-004.37). Si el
//   tipo está cerrado en signal_states, reemplaza la entrada; si sigue activo, conserva detectadaEn,
//   toma la descripción nueva y suma evidencia hasta 10 citas (R-004.55).
// El resultado pasa por Perfil.parse: si algo no cumple el esquema, lanza error y no se guarda.
import {
  Perfil,
  type AprobacionEntrada,
  type EvidenciaGuardada,
  type ProfileUpdate,
  type TipoSenal,
} from "@/lib/profile/schema";

const MAX_EVIDENCIA = 10;

export type ContextoAprobacion = {
  sessionId: string; // sesión de donde salieron las citas
  eventId: string; // profile_event de la propuesta
  now: Date;
  tiposCerrados?: TipoSenal[]; // tipos cuyo último estado en signal_states es "cerrada"
};

// Sin duplicados: misma cita de la misma sesión cuenta una vez. Se quedan las más recientes.
function unirEvidencia(evidencia: EvidenciaGuardada[]): EvidenciaGuardada[] {
  const unicas = evidencia.filter(
    (e, idx) => evidencia.findIndex((o) => o.cita === e.cita && o.sessionId === e.sessionId) === idx,
  );
  return unicas.slice(-MAX_EVIDENCIA);
}

// Revisa que los índices aprobados existan en la propuesta y que no haya dos cambios
// aprobados para la misma dimensión (el segundo sobrescribiría al primero). Lanza error si no.
export function validarIndices(update: ProfileUpdate, aprobacion: AprobacionEntrada): void {
  for (const i of aprobacion.cambios) {
    if (!Number.isInteger(i) || i < 0 || i >= update.cambios.length) throw new Error(`El cambio ${i} no existe en la propuesta`);
  }
  // Índices repetidos (el mismo cambio dos veces) sí se permiten; ver applyApproval.
  const dimensiones = new Set<string>();
  for (const i of new Set(aprobacion.cambios)) {
    const dimension = update.cambios[i].dimension;
    if (dimensiones.has(dimension)) throw new Error(`Hay dos cambios aprobados para la dimensión ${dimension}`);
    dimensiones.add(dimension);
  }
  for (const i of aprobacion.senales) {
    if (!Number.isInteger(i) || i < 0 || i >= update.senales.length) throw new Error(`La señal ${i} no existe en la propuesta`);
  }
  for (const { indice } of aprobacion.ediciones ?? []) {
    if (indice >= update.cambios.length) throw new Error(`La edición del cambio ${indice} no existe en la propuesta`);
  }
}

// Tipos que se vuelven a abrir con esta aprobación: la decisión les agrega una fila "activa".
export function tiposReabiertos(update: ProfileUpdate, aprobacion: AprobacionEntrada, tiposCerrados: TipoSenal[]): TipoSenal[] {
  const aprobados = new Set(aprobacion.senales.map((i) => update.senales[i].tipo));
  return tiposCerrados.filter((t) => aprobados.has(t));
}

export function applyApproval(
  perfilPrevio: Perfil,
  update: ProfileUpdate,
  aprobacion: AprobacionEntrada,
  { sessionId, eventId, now, tiposCerrados = [] }: ContextoAprobacion,
): Perfil {
  validarIndices(update, aprobacion);
  const fecha = now.toISOString();

  // Copia para no modificar el perfil previo.
  const perfil: Perfil = structuredClone(perfilPrevio);

  // Set quita índices repetidos (aprobar dos veces el mismo cambio no duplica nada).
  for (const i of new Set(aprobacion.cambios)) {
    const cambio = update.cambios[i];
    const edicion = aprobacion.ediciones?.find((e) => e.indice === i);
    const anterior = perfil.dimensiones[cambio.dimension];

    const nuevas: EvidenciaGuardada[] = cambio.evidencia.map((e) => ({ cita: e.cita, sessionId }));

    perfil.dimensiones[cambio.dimension] = {
      resumen: edicion?.resumen ?? cambio.resumen,
      tipo: edicion?.tipo ?? cambio.tipo,
      dominiosFE: cambio.dominiosFE,
      evidencia: unirEvidencia([...(anterior?.evidencia ?? []), ...nuevas]),
      actualizadoEn: fecha,
      eventoId: eventId,
    };
  }

  // Un tipo cerrado se reemplaza una sola vez: una segunda señal del mismo tipo en esta misma
  // aprobación ya suma evidencia a la entrada recién abierta.
  const porReemplazar = new Set(tiposCerrados);
  for (const i of new Set(aprobacion.senales)) {
    const senal = update.senales[i];
    const nuevas: EvidenciaGuardada[] = senal.evidencia.map((e) => ({ cita: e.cita, sessionId }));
    // Snapshots viejos pueden traer varias entradas del mismo tipo: quedan en una sola.
    const previas = perfil.senalesActivas.filter((s) => s.tipo === senal.tipo);
    const posicion = perfil.senalesActivas.findIndex((s) => s.tipo === senal.tipo);
    const reemplaza = previas.length === 0 || porReemplazar.has(senal.tipo);
    porReemplazar.delete(senal.tipo);

    const entrada = {
      tipo: senal.tipo,
      descripcion: senal.descripcion,
      evidencia: unirEvidencia(reemplaza ? nuevas : [...previas.flatMap((s) => s.evidencia), ...nuevas]),
      detectadaEn: reemplaza ? fecha : previas[0].detectadaEn,
      eventoId: eventId,
    };
    const otras = perfil.senalesActivas.filter((s) => s.tipo !== senal.tipo);
    otras.splice(posicion < 0 ? otras.length : posicion, 0, entrada);
    perfil.senalesActivas = otras;
  }

  return Perfil.parse(perfil);
}
