// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Reglas de una aprobación que comparten la pantalla de revisión y la ruta de decisión (funciones
// puras, también corren en el navegador). Así la pantalla deshabilita aprobar con la misma revisión
// que el servidor hace cumplir (R-004.59).
import type { FollowupUpdate } from "@/lib/followup/schema";
import { etiquetaDimension, type Aprobacion, type DimensionId, type ProfileUpdate } from "@/lib/profile/schema";
import { revisarTextoPersona, type MotivoTexto } from "@/lib/profile/terminos";

// Textos literales de la spec 004, "Pantallas y textos". También son los mensajes del 400 de la ruta.
export const SIN_SELECCION = "Selecciona al menos un punto para aprobar.";

export const textoBloqueo = (nombre: string, dimension: DimensionId, termino: string) =>
  `Hay texto que no puede llegar a ${nombre} en ${etiquetaDimension(dimension)}: «${termino}». Corrígelo para aprobar.`;

// Mientras el partner no conteste P-21 (decisión 2), en una sola constante; no es un dato de la base.
export const RESPONSABLE_ALERTAS = "la persona de Specialisterne que atiende alertas";

// Una propuesta de 001 se lee como una de seguimiento sin avance, contexto ni siguiente paso.
export function comoFollowup(update: ProfileUpdate): FollowupUpdate {
  return { ...update, avance: [], contexto: [], siguientePaso: null };
}

export function aprobacionVacia(a: Aprobacion): boolean {
  return (
    a.cambios.length === 0 &&
    a.senales.length === 0 &&
    a.avance.length === 0 &&
    a.preguntas.length === 0 &&
    a.contexto.length === 0 &&
    !a.siguientePaso
  );
}

// Lo que no valida validarIndices (lib/profile/merge.ts): lo que suma esta spec.
export function seleccionValida(update: FollowupUpdate, a: Aprobacion): boolean {
  const dentro = (indices: number[], largo: number) => indices.every((i) => i < largo);
  return (
    dentro(a.avance, update.avance.length) &&
    dentro(a.preguntas, update.preguntasParaSiguienteSesion.length) &&
    dentro(a.contexto, update.contexto.length) &&
    (!a.siguientePaso || update.siguientePaso !== null)
  );
}

// Citas de la propuesta. La ruta les suma las del último snapshot.
export function citasDePropuesta(update: FollowupUpdate): string[] {
  return [
    ...update.cambios.flatMap((c) => c.evidencia),
    ...update.senales.flatMap((s) => s.evidencia),
    ...update.relacionesConPerfilPrevio.flatMap((r) => r.evidencia),
    ...update.relacionesConPerfilPrevio.flatMap((r) => (r.citaPrevia ? [{ cita: r.citaPrevia }] : [])), // R-011.5
    ...update.avance.flatMap((a) => a.evidencia),
    ...update.contexto.flatMap((c) => c.evidencia),
    ...(update.siguientePaso?.evidencia ?? []),
  ].map((e) => e.cita);
}

export type BloqueoCambio = {
  indice: number;
  ruta: string;
  dimension: DimensionId;
  termino: string;
  motivo: MotivoTexto;
};

// Revisa el texto final de cada cambio seleccionado, editado o de la IA. Los no seleccionados no
// bloquean (R-004.59).
export function bloqueosDeCambios(
  update: Pick<ProfileUpdate, "cambios">,
  seleccion: Pick<Aprobacion, "cambios" | "ediciones">,
  citas: string[],
  notas: string[] = [],
): BloqueoCambio[] {
  return [...new Set(seleccion.cambios)].flatMap((indice) => {
    const cambio = update.cambios[indice];
    const texto = seleccion.ediciones.find((e) => e.indice === indice)?.resumen ?? cambio.resumen;
    return revisarTextoPersona(texto, citas, notas).map(({ termino, motivo }) => ({
      indice,
      ruta: `cambios[${indice}].resumen`,
      dimension: cambio.dimension,
      termino,
      motivo,
    }));
  });
}
