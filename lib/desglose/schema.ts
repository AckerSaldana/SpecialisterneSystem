// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Esquemas del desglose de tareas (spec 010). Única fuente de verdad:
//   - lo que propone el modelo (DesgloseProposal, AjustesProposal),
//   - lo que se guarda (PasoDesglose, AjusteGuardado, PasoPlantilla y DescartadoDesglose, en app.task_breakdowns
//     y app.task_templates).
// Este archivo importa lib/profile/schema: un componente de cliente de /persona importa de
// lib/desglose/schema-cliente.ts, nunca de aquí (C-09). lib/db/schema.ts solo importa sus tipos.
// apoyoRef y pasoRef son strings sin patrón, igual que en ItemPropuesto: un ID malo lo descarta el código sin
// tumbar toda la respuesta (R-010.20, R-010.37). Un paso sin criterioTerminado, en cambio, la hace fallar (R-010.8).
import { z } from "zod";
import { DimensionId } from "@/lib/profile/schema";
import {
  CAMPOS_PASO_VISTA,
  MAX_ACCION,
  MAX_AJUSTES,
  MAX_CRITERIO,
  MAX_MINUTOS,
  MAX_MOTIVO,
  MAX_NOTA,
  MAX_PASOS,
  TipoAjuste,
  type AjusteVista,
  type PasoDesgloseVista,
} from "@/lib/desglose/schema-cliente";

export * from "@/lib/desglose/schema-cliente";

// ---------------------------------------------------------------------------
// Lo que devuelve el modelo
// ---------------------------------------------------------------------------

export const PasoPropuesto = z.strictObject({
  accion: z.string().trim().min(1).max(MAX_ACCION).describe("Una sola acción. Empieza con un verbo."),
  criterioTerminado: z.string().trim().min(1).max(MAX_CRITERIO).describe("Algo que se puede ver o comprobar para saber que terminó."),
  notaApoyo: z.string().trim().min(1).max(MAX_NOTA).nullable().describe("Solo si un apoyo de la lista la justifica. Si no, null."),
  apoyoRef: z.string().nullable().describe("ID corto A-nn del apoyo que justifica el paso o la nota, o null."),
  minutos: z.int().min(1).max(MAX_MINUTOS).nullable().describe("Tiempo aproximado en minutos, o null."),
});
export type PasoPropuesto = z.infer<typeof PasoPropuesto>;

export const DesgloseProposal = z.strictObject({ pasos: z.array(PasoPropuesto).min(1).max(MAX_PASOS) });
export type DesgloseProposal = z.infer<typeof DesgloseProposal>;

export const AjustePropuesto = z.strictObject({
  tipo: TipoAjuste,
  pasoRef: z.string().describe("ID corto S-nn del paso con marca al que se refiere."),
  paso: PasoPropuesto,
  motivo: z.string().trim().min(1).max(MAX_MOTIVO).describe("Por qué se propone, sin interpretar a la persona."),
});
export type AjustePropuesto = z.infer<typeof AjustePropuesto>;

// R-010.36: no hay tipo para quitar un paso.
export const AjustesProposal = z.strictObject({ ajustes: z.array(AjustePropuesto).max(MAX_AJUSTES) });
export type AjustesProposal = z.infer<typeof AjustesProposal>;

// ---------------------------------------------------------------------------
// Lo que se guarda (app.task_breakdowns, app.task_templates)
// ---------------------------------------------------------------------------

// R-010.24: de dónde sale una nota, solo con IDs. La persona puede leer su fila y RLS filtra filas, no columnas:
// aquí no caben dominios, adaptaciones, citas ni señales.
export const OrigenPaso = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("dimension"), dimension: DimensionId }),
  z.strictObject({ tipo: z.literal("plan"), planItemId: z.uuid() }),
]);
export type OrigenPaso = z.infer<typeof OrigenPaso>;

export const PasoDesglose = z
  .strictObject({ ...CAMPOS_PASO_VISTA, origen: OrigenPaso.nullable() })
  .superRefine((p, ctx) => {
    // "Esquemas": notaApoyo, porQue y origen van los tres o ninguno.
    const conNota = p.notaApoyo !== null;
    if (conNota !== (p.porQue !== null)) ctx.addIssue({ code: "custom", path: ["porQue"], message: "notaApoyo y porQue van juntos" });
    if (conNota !== (p.origen !== null)) ctx.addIssue({ code: "custom", path: ["origen"], message: "notaApoyo y origen van juntos" });
  });
export type PasoDesglose = z.infer<typeof PasoDesglose>;

// Lo que responden las pantallas de la persona, sin origen. Se copia campo por campo: lo que no está aquí no sale.
export function vistaDePaso(p: PasoDesglose): PasoDesgloseVista {
  return { id: p.id, accion: p.accion, criterioTerminado: p.criterioTerminado, notaApoyo: p.notaApoyo, porQue: p.porQue, minutos: p.minutos };
}

// No guarda apoyoRef: solo vale para el índice de esa llamada ("Esquemas", R-010.37).
export const AjusteGuardado = z.strictObject({
  id: z.uuid(),
  tipo: TipoAjuste,
  pasoId: z.uuid(),
  paso: PasoDesglose,
  motivo: z.string().min(1).max(MAX_MOTIVO),
});
export type AjusteGuardado = z.infer<typeof AjusteGuardado>;

export function vistaDeAjuste(a: AjusteGuardado): AjusteVista {
  return { id: a.id, tipo: a.tipo, pasoId: a.pasoId, paso: vistaDePaso(a.paso), motivo: a.motivo };
}

// R-010.39: sin notas, porQue, origen ni minutos. Estricto: una llave de más hace fallar el esquema.
export const PasoPlantilla = z.strictObject({
  id: z.uuid(),
  accion: z.string().min(1).max(MAX_ACCION),
  criterioTerminado: z.string().min(1).max(MAX_CRITERIO),
});
export type PasoPlantilla = z.infer<typeof PasoPlantilla>;

// R-010.20, R-010.22 y R-010.37. La ruta y el motivo, nunca el texto: la persona lee toda su fila.
export const MotivoDescarteDesglose = z.enum([
  "apoyo_no_existe",
  "nota_sin_apoyo",
  "nota_con_termino",
  "ajuste_sin_atoro",
  "ajuste_duplicado",
  "ajuste_no_valido",
]);
export type MotivoDescarteDesglose = z.infer<typeof MotivoDescarteDesglose>;

export const DescartadoDesglose = z.strictObject({ ruta: z.string(), motivo: MotivoDescarteDesglose });
export type DescartadoDesglose = z.infer<typeof DescartadoDesglose>;

// ---------------------------------------------------------------------------
// Problemas de validarPasos (R-010.12 a R-010.17). Códigos, sin texto de la tarea.
// ---------------------------------------------------------------------------

export const ProblemaPaso = z.enum([
  "accion_multiple",
  "criterio_vago",
  "criterio_igual_a_accion",
  "inicio_no_concreto",
  "inicio_sin_apoyo",
  "texto_no_permitido",
  "urgencia",
  "entidad_ajena",
]);
export type ProblemaPaso = z.infer<typeof ProblemaPaso>;
