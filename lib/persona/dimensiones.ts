// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Qué dimensiones del perfil ve la persona y con qué etiqueta (spec 005, R-005.4, R-005.45).
// Es la única constante de visibilidad: una dimensión fuera de esta lista no aparece en /persona,
// no tiene botón y /api/persona/feedback responde 400 si la recibe. Mientras el partner no responda
// están las 15 (decisión abierta 3). Las etiquetas van en segunda persona solo aquí; DIMENSIONES de
// lib/profile/schema.ts no cambia, porque la usan el coach, el prompt y el eval.
import type { DimensionId, PerfilPersona, TipoHallazgo } from "@/lib/profile/schema";

export type DimensionVisible = { id: DimensionId; etiqueta: string };

export const DIMENSIONES_PERSONA: readonly DimensionVisible[] = [
  { id: "antecedentes_experiencia", etiqueta: "Antecedentes y experiencia" },
  { id: "estilo_comunicacion", etiqueta: "Estilo de comunicación y ambiente seguro" },
  { id: "interaccion_companeros", etiqueta: "Interacción con compañeros" },
  { id: "trato_uno_a_uno", etiqueta: "Trato uno a uno" },
  { id: "comunicacion_escrita", etiqueta: "Comunicación escrita" },
  { id: "trabajo_en_equipo", etiqueta: "Trabajo en equipo y rol que asumes" },
  { id: "conflictos", etiqueta: "Conflictos" },
  { id: "disparadores_estres", etiqueta: "Disparadores de estrés y qué te ayuda" },
  { id: "indicadores_estres", etiqueta: "Indicadores observables de estrés" },
  { id: "aspectos_sensoriales", etiqueta: "Aspectos sensoriales" },
  { id: "motivacion_intereses", etiqueta: "Motivación, habilidades e intereses" },
  { id: "forma_aprender", etiqueta: "Forma de aprender" },
  { id: "concentracion", etiqueta: "Concentración" },
  { id: "retroalimentacion", etiqueta: "Cómo prefieres recibir retroalimentación" },
  { id: "ajustes_razonables", etiqueta: "Ajustes razonables" },
];

export function esDimensionVisible(id: DimensionId, visibles: readonly DimensionVisible[] = DIMENSIONES_PERSONA): boolean {
  return visibles.some((d) => d.id === id);
}

// Dimensiones visibles de un tipo que el perfil sí trae, en el orden de la constante (R-005.3).
export function dimensionesDeGrupo(
  perfil: PerfilPersona,
  tipo: TipoHallazgo,
  visibles: readonly DimensionVisible[] = DIMENSIONES_PERSONA,
): DimensionVisible[] {
  return visibles.filter((d) => perfil.dimensiones[d.id]?.tipo === tipo);
}
