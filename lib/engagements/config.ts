// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Un solo pipeline, configurado por tipo de engagement.
// Inclusión: proceso completo de los proyectos de inclusión (CONTEXTO §4).
// Workplace Support: el mismo coaching para personas que ya trabajan; empieza con
// una evaluación corta y luego objetivos y estrategias.

export type EngagementType = "inclusion" | "workplace_support";
export type EngagementStage = "alta" | "evaluacion_inicial" | "perfil" | "plan" | "seguimiento" | "cierre";

export const ETAPAS: { id: EngagementStage; etiqueta: string }[] = [
  { id: "alta", etiqueta: "Alta y consentimiento" },
  { id: "evaluacion_inicial", etiqueta: "Evaluación inicial" },
  { id: "perfil", etiqueta: "Perfil" },
  { id: "plan", etiqueta: "Plan de acompañamiento" },
  { id: "seguimiento", etiqueta: "Sesiones de seguimiento" },
  { id: "cierre", etiqueta: "Cierre" },
];

export const ENGAGEMENT_CONFIG: Record<
  EngagementType,
  {
    etiqueta: string;
    descripcion: string;
    etapas: EngagementStage[];
    // Spec 002 (R-002.12): si el alta exige el diagnóstico verificado. true en los dos tipos hasta que
    // el partner responda si Workplace Support también lo pide (decisión abierta c). Si cambia, también
    // cambia la política consent_events_insert_persona (R-002.37).
    requiereDiagnostico: boolean;
  }
> = {
  inclusion: {
    etiqueta: "Proyecto de inclusión",
    descripcion: "Acompañamiento de 6 meses después de la contratación, con la red de apoyo (líder y mentor).",
    etapas: ["alta", "evaluacion_inicial", "perfil", "plan", "seguimiento", "cierre"],
    requiereDiagnostico: true,
  },
  workplace_support: {
    etiqueta: "Workplace Support",
    descripcion: "Coaching para una persona que ya trabaja. Evaluación corta, luego objetivos y estrategias.",
    etapas: ["alta", "evaluacion_inicial", "perfil", "plan", "seguimiento", "cierre"],
    requiereDiagnostico: true,
  },
};

export const etiquetaEtapa = (id: EngagementStage) => ETAPAS.find((e) => e.id === id)!.etiqueta;
