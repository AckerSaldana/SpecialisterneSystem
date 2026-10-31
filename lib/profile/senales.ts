// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Señales activas de un acompañamiento (R-004.52): las del último snapshot menos las que
// signal_states marca como cerradas. Es el único lugar con esta regla. Ningún lector toma
// senalesActivas directo del snapshot: ni los prompts, ni la página del coach, ni el panel
// "Antes de esta sesión", ni la entrada del cierre (006).
import type { Perfil, SenalActiva, TipoSenal } from "@/lib/profile/schema";

export type EstadoSenal = { tipo: TipoSenal; estado: "activa" | "cerrada"; createdAt: Date };

// La fila más reciente de cada tipo. Sin filas, el tipo cuenta como activo.
export function ultimoEstadoPorTipo(estados: EstadoSenal[]): Map<TipoSenal, "activa" | "cerrada"> {
  const ordenados = [...estados].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return new Map(ordenados.map((e) => [e.tipo, e.estado]));
}

export function tiposCerrados(estados: EstadoSenal[]): TipoSenal[] {
  return [...ultimoEstadoPorTipo(estados)].filter(([, estado]) => estado === "cerrada").map(([tipo]) => tipo);
}

export function senalesVigentes(perfil: Perfil, estados: EstadoSenal[]): SenalActiva[] {
  const cerrados = new Set(tiposCerrados(estados));
  return perfil.senalesActivas.filter((s) => !cerrados.has(s.tipo));
}

// El mismo perfil con solo sus señales vigentes, para los lectores que reciben un Perfil.
export function perfilConSenalesVigentes(perfil: Perfil, estados: EstadoSenal[]): Perfil {
  return { ...perfil, senalesActivas: senalesVigentes(perfil, estados) };
}
