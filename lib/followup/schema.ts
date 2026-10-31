// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Lo que devuelve el modelo en una sesión de seguimiento (spec 004) y lo que se guarda en
// profile_events.payload. FollowupUpdate es ProfileUpdate más avance, contexto y siguiente paso.
//
// Los objetos son estrictos: una llave extra (puntaje, probabilidad, nivel, severidad, alerta,
// ítems nuevos del plan) hace fallar la validación (R-004.9, R-004.14, R-004.15).
//
// Las reglas de itemRef y de traer exactamente un destino no van en Zod: una regla aquí haría
// fallar toda la propuesta con 502. Las revisa sanitizeFollowup y solo descarta ese elemento.
//
// Este archivo importa valores de lib/profile/schema.ts; ese archivo solo importa de aquí tipos.
import { z } from "zod";
import { Bandera, Descartado, ListaEvidencia, ProfileUpdate } from "@/lib/profile/schema";

// Etiquetas de R-004.6.
export const ESTADOS_AVANCE = [
  { id: "avanza", etiqueta: "Avanza" },
  { id: "sin_cambios", etiqueta: "Sin cambios" },
  { id: "necesita_ajuste", etiqueta: "Necesita ajuste" },
  { id: "cumplido", etiqueta: "Cumplido" },
] as const;

export const EstadoAvance = z.enum(
  ESTADOS_AVANCE.map((e) => e.id) as [(typeof ESTADOS_AVANCE)[number]["id"], ...(typeof ESTADOS_AVANCE)[number]["id"][]],
);
export type EstadoAvance = z.infer<typeof EstadoAvance>;

export const etiquetaEstadoAvance = (id: EstadoAvance) => ESTADOS_AVANCE.find((e) => e.id === id)!.etiqueta;

export const TipoSesion = z.enum(["persona", "red_de_apoyo"]);
export type TipoSesion = z.infer<typeof TipoSesion>;

export const AvancePropuesto = z.strictObject({
  itemRef: z.string().describe("ID corto del punto del plan, por ejemplo P-01. Solo de la lista que recibes."),
  estado: EstadoAvance,
  resumen: z.string().min(1).max(400).describe("Una o dos frases literales sobre qué pasó con este punto."),
  evidencia: ListaEvidencia,
});
export type AvancePropuesto = z.infer<typeof AvancePropuesto>;

export const NotaContextoPropuesta = z.strictObject({
  texto: z.string().min(1).max(300),
  evidencia: ListaEvidencia,
});
export type NotaContextoPropuesta = z.infer<typeof NotaContextoPropuesta>;

export const SiguientePasoPropuesto = z.strictObject({
  texto: z.string().min(1).max(300),
  itemRef: z.string().nullable(),
  fichaId: z.string().nullable(),
  evidencia: ListaEvidencia,
});
export type SiguientePasoPropuesto = z.infer<typeof SiguientePasoPropuesto>;

export const FollowupUpdate = ProfileUpdate.extend({
  avance: z.array(AvancePropuesto),
  contexto: z.array(NotaContextoPropuesta).max(5),
  siguientePaso: SiguientePasoPropuesto.nullable(),
});
export type FollowupUpdate = z.infer<typeof FollowupUpdate>;

// Índice P-nn → plan_item_id (R-004.54). El modelo no ve ni escribe el id real.
export const EntradaIndicePlan = z.strictObject({
  ref: z.string(),
  planItemId: z.uuid(),
  descripcion: z.string(),
});
export type EntradaIndicePlan = z.infer<typeof EntradaIndicePlan>;

export const PayloadSeguimientoIA = z.strictObject({
  tipo: z.literal("propuesta_seguimiento"),
  update: FollowupUpdate,
  descartados: z.array(Descartado),
  banderas: z.array(Bandera),
  indicePlan: z.array(EntradaIndicePlan),
});
export type PayloadSeguimientoIA = z.infer<typeof PayloadSeguimientoIA>;
