// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Esquemas del plan de acompañamiento (spec 003). Única fuente de verdad del plan:
//   - lo que propone el modelo (PlanProposal),
//   - lo que se guarda de la propuesta (PayloadPlanIA, en plans.propuesta_ia),
//   - lo que ve la persona (PlanPersona, en persona_plans.contenido).
// fichaId, dominioFE y evidenciaId son strings sin patrón a propósito: un ID mal formado lo quita
// sanitizePlan (lib/plan/validate.ts) en vez de tumbar toda la respuesta del modelo.
import { z } from "zod";

// R-003.8: seis tipos. objetivo_equipo y ajuste_razonable son nuevos (decisión 10).
export const TIPOS_ITEM_PLAN = [
  { id: "objetivo", grupo: "Objetivos", agregar: "Agregar objetivo" },
  { id: "objetivo_equipo", grupo: "Objetivos del equipo", agregar: "Agregar objetivo del equipo" },
  { id: "apoyo_fe", grupo: "Apoyos de función ejecutiva", agregar: "Agregar apoyo" },
  { id: "ajuste_razonable", grupo: "Ajustes razonables", agregar: "Agregar ajuste razonable" },
  { id: "instruccion", grupo: "Cómo darle instrucciones", agregar: "Agregar instrucción" },
  { id: "comunicacion_lider", grupo: "Qué comunicar al líder", agregar: "Agregar punto para el líder" },
] as const;

export const TipoItemPlan = z.enum([
  "objetivo",
  "objetivo_equipo",
  "apoyo_fe",
  "ajuste_razonable",
  "instruccion",
  "comunicacion_lider",
]);
export type TipoItemPlan = z.infer<typeof TipoItemPlan>;

// R-003.11 y decisión 4: solo estos tipos llevan textoPersona y llegan a la persona.
export const TIPOS_VISIBLES_PERSONA = ["objetivo", "apoyo_fe"] as const satisfies readonly TipoItemPlan[];
export const esVisiblePersona = (t: TipoItemPlan) => (TIPOS_VISIBLES_PERSONA as readonly string[]).includes(t);

export const OrigenItemPlan = z.enum(["ia", "ia_editado", "coach"]);
export type OrigenItemPlan = z.infer<typeof OrigenItemPlan>;

// ---------------------------------------------------------------------------
// Lo que devuelve el modelo
// ---------------------------------------------------------------------------

export const ItemPropuesto = z.strictObject({
  tipo: TipoItemPlan,
  descripcion: z
    .string()
    .min(1)
    .max(800)
    .describe("Para el coach: tercera persona con el nombre de pila, conductas observables, tono positivo."),
  textoPersona: z
    .string()
    .min(1)
    .max(400)
    .nullable()
    .describe("Solo en objetivo y apoyo_fe: segunda persona, frases cortas y literales. null en los demás tipos."),
  dominioFE: z.string().nullable().describe("ID de un dominio de función ejecutiva de la lista, o null."),
  fichaId: z.string().nullable().describe("ID de una ficha de la lista, o null si ninguna aplica."),
  evidencia: z
    .array(z.strictObject({ evidenciaId: z.string().describe("ID corto de la lista de evidencia, p. ej. E-03.") }))
    .min(1)
    .max(5),
});
export type ItemPropuesto = z.infer<typeof ItemPropuesto>;

export const PlanProposal = z.strictObject({ items: z.array(ItemPropuesto).max(16) });
export type PlanProposal = z.infer<typeof PlanProposal>;

// ---------------------------------------------------------------------------
// Lo que guarda la validación (plans.propuesta_ia)
// ---------------------------------------------------------------------------

export const DescartadoPlan = z.strictObject({
  ruta: z.string(), // p. ej. "items[3]" o "items[3].evidencia[1]", sobre la respuesta original del modelo
  motivo: z.enum(["evidencia_no_existe", "ficha_no_existe", "sin_evidencia", "textoPersona_en_tipo_interno"]),
  valor: z.string(), // el ID inválido, o "" cuando no aplica
});
export type DescartadoPlan = z.infer<typeof DescartadoPlan>;

export const MotivoBanderaPlan = z.enum([
  "termino_no_permitido",
  "mencion_condicion",
  "termino_interno",
  "cita_en_texto_persona",
  "cita_en_texto_lider",
]);
export type MotivoBanderaPlan = z.infer<typeof MotivoBanderaPlan>;

export const BanderaPlan = z.strictObject({
  ruta: z.string(), // sobre la propuesta limpia, p. ej. "items[2]"
  campo: z.enum(["descripcion", "textoPersona"]),
  termino: z.string(),
  motivo: MotivoBanderaPlan,
});
export type BanderaPlan = z.infer<typeof BanderaPlan>;

export const PayloadPlanIA = z.strictObject({
  propuesta: PlanProposal, // ya limpia
  descartados: z.array(DescartadoPlan),
  banderas: z.array(BanderaPlan),
  fichasEnviadas: z.array(z.string()),
  evidenciaEnviada: z.array(z.string()),
});
export type PayloadPlanIA = z.infer<typeof PayloadPlanIA>;

// Evidencia guardada en plan_items.evidencia: la pone el código desde el snapshot (R-003.14).
export const EvidenciaPlan = z.strictObject({ cita: z.string(), sessionId: z.uuid() });
export type EvidenciaPlan = z.infer<typeof EvidenciaPlan>;

// ---------------------------------------------------------------------------
// Lo que ve la persona (persona_plans.contenido)
// ---------------------------------------------------------------------------

export const PlanPersona = z.strictObject({
  items: z.array(
    z.strictObject({
      planItemId: z.uuid(),
      tipo: z.enum(TIPOS_VISIBLES_PERSONA),
      texto: z.string().min(1).max(400),
      orden: z.int(),
      // R-003.61: IDs de sus equivalentes en versiones aprobadas anteriores, del más reciente al más viejo.
      itemsAnteriores: z.array(z.uuid()),
    }),
  ),
});
export type PlanPersona = z.infer<typeof PlanPersona>;

export const etiquetaTipoPlan = (t: TipoItemPlan) => TIPOS_ITEM_PLAN.find((x) => x.id === t)!.grupo;
