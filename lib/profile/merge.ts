// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Aplica al perfil lo que el coach aprobó de una propuesta (función pura, sin red ni base).
// - Cada cambio aprobado reemplaza resumen, tipo y dominiosFE de su dimensión y suma su
//   evidencia a la que ya había (sin duplicados, máximo 10 citas por dimensión: se quedan
//   las más recientes).
// - Cada señal aprobada se agrega a senalesActivas.
// El resultado pasa por Perfil.parse: si algo no cumple el esquema, lanza error y no se guarda.
import { Perfil, type Aprobacion, type EvidenciaGuardada, type ProfileUpdate } from "@/lib/profile/schema";

const MAX_EVIDENCIA_POR_DIMENSION = 10;

export type ContextoAprobacion = {
  sessionId: string; // sesión de donde salieron las citas
  eventId: string; // profile_event de la propuesta
  now: Date;
};

// Revisa que los índices aprobados existan en la propuesta y que no haya dos cambios
// aprobados para la misma dimensión (el segundo sobrescribiría al primero). Lanza error si no.
export function validarIndices(update: ProfileUpdate, aprobacion: Aprobacion): void {
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
}

export function applyApproval(
  perfilPrevio: Perfil,
  update: ProfileUpdate,
  aprobacion: Aprobacion,
  { sessionId, eventId, now }: ContextoAprobacion,
): Perfil {
  validarIndices(update, aprobacion);
  const fecha = now.toISOString();

  // Copia para no modificar el perfil previo.
  const perfil: Perfil = structuredClone(perfilPrevio);

  // Set quita índices repetidos (aprobar dos veces el mismo cambio no duplica nada).
  for (const i of new Set(aprobacion.cambios)) {
    const cambio = update.cambios[i];
    const anterior = perfil.dimensiones[cambio.dimension];

    const nuevas: EvidenciaGuardada[] = cambio.evidencia.map((e) => ({ cita: e.cita, sessionId }));
    const todas = [...(anterior?.evidencia ?? []), ...nuevas];
    // Sin duplicados: misma cita de la misma sesión cuenta una vez.
    const unicas = todas.filter(
      (e, idx) => todas.findIndex((o) => o.cita === e.cita && o.sessionId === e.sessionId) === idx,
    );

    perfil.dimensiones[cambio.dimension] = {
      resumen: cambio.resumen,
      tipo: cambio.tipo,
      dominiosFE: cambio.dominiosFE,
      evidencia: unicas.slice(-MAX_EVIDENCIA_POR_DIMENSION),
      actualizadoEn: fecha,
      eventoId: eventId,
    };
  }

  for (const i of new Set(aprobacion.senales)) {
    const senal = update.senales[i];
    perfil.senalesActivas.push({
      tipo: senal.tipo,
      descripcion: senal.descripcion,
      evidencia: senal.evidencia.map((e) => ({ cita: e.cita, sessionId })),
      detectadaEn: fecha,
      eventoId: eventId,
    });
  }

  return Perfil.parse(perfil);
}
