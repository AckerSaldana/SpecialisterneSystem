// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Única fuente de verdad del perfil. De aquí salen:
//   - los tipos TS (z.infer),
//   - el JSON Schema que recibe el modelo (Output.object en lib/ai),
//   - el validador que corre sobre la respuesta del modelo y sobre lo que se guarda.
//
// Reglas que este archivo hace cumplir por construcción:
//   - No existe campo de diagnóstico, tipo o nivel. Los objetos son estrictos:
//     una llave extra (por ejemplo "diagnostico" o "nivel") hace fallar la validación.
//   - Toda dimensión, señal y relación lleva evidencia citada de la nota (mínimo 1).
//   - Las dimensiones son las 15 que describió y autorizó el partner (CONTEXTO §5, 45:53).
//   - Los dominios de función ejecutiva son solo los nombres de BRIEF-A (F-017), sin ítems.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export const SECCIONES = [
  { id: "competencias_profesionales", etiqueta: "Competencias profesionales y técnicas" },
  { id: "competencias_compartidas", etiqueta: "Competencias compartidas" },
  // El título de la sección 3 no se leía en el video (CONTEXTO §5); es provisional.
  { id: "motivacion_aprendizaje", etiqueta: "Motivación y aprendizaje" },
  { id: "ambiente_trabajo", etiqueta: "Ambiente de trabajo" },
] as const;

export type SeccionId = (typeof SECCIONES)[number]["id"];

export const DIMENSIONES = [
  { id: "antecedentes_experiencia", seccion: "competencias_profesionales", etiqueta: "Antecedentes y experiencia" },
  { id: "estilo_comunicacion", seccion: "competencias_compartidas", etiqueta: "Estilo de comunicación y ambiente seguro" },
  { id: "interaccion_companeros", seccion: "competencias_compartidas", etiqueta: "Interacción con compañeros" },
  { id: "trato_uno_a_uno", seccion: "competencias_compartidas", etiqueta: "Trato uno a uno" },
  { id: "comunicacion_escrita", seccion: "competencias_compartidas", etiqueta: "Comunicación escrita" },
  { id: "trabajo_en_equipo", seccion: "competencias_compartidas", etiqueta: "Trabajo en equipo y rol que asume" },
  { id: "conflictos", seccion: "competencias_compartidas", etiqueta: "Conflictos" },
  { id: "disparadores_estres", seccion: "competencias_compartidas", etiqueta: "Disparadores de estrés y qué le ayuda" },
  { id: "indicadores_estres", seccion: "competencias_compartidas", etiqueta: "Indicadores observables de estrés" },
  { id: "aspectos_sensoriales", seccion: "competencias_compartidas", etiqueta: "Aspectos sensoriales" },
  { id: "motivacion_intereses", seccion: "motivacion_aprendizaje", etiqueta: "Motivación, habilidades e intereses" },
  { id: "forma_aprender", seccion: "motivacion_aprendizaje", etiqueta: "Forma de aprender" },
  { id: "concentracion", seccion: "motivacion_aprendizaje", etiqueta: "Concentración" },
  { id: "retroalimentacion", seccion: "motivacion_aprendizaje", etiqueta: "Cómo prefiere recibir retroalimentación" },
  { id: "ajustes_razonables", seccion: "ambiente_trabajo", etiqueta: "Ajustes razonables" },
] as const satisfies ReadonlyArray<{ id: string; seccion: SeccionId; etiqueta: string }>;

export const DIMENSION_IDS = DIMENSIONES.map((d) => d.id) as [
  (typeof DIMENSIONES)[number]["id"],
  ...(typeof DIMENSIONES)[number]["id"][],
];
export const DimensionId = z.enum(DIMENSION_IDS);
export type DimensionId = z.infer<typeof DimensionId>;

// Nombres de las 9 escalas de BRIEF-A (F-017). Solo los nombres; los ítems tienen derechos.
export const DOMINIOS_FE = [
  { id: "inhibicion", etiqueta: "Inhibición" },
  { id: "automonitoreo", etiqueta: "Automonitoreo" },
  { id: "flexibilidad", etiqueta: "Flexibilidad" },
  { id: "control_emocional", etiqueta: "Control emocional" },
  { id: "iniciacion", etiqueta: "Iniciación" },
  { id: "memoria_de_trabajo", etiqueta: "Memoria de trabajo" },
  { id: "planeacion_organizacion", etiqueta: "Planeación y organización" },
  { id: "monitoreo_de_tareas", etiqueta: "Monitoreo de tareas" },
  { id: "organizacion_de_materiales", etiqueta: "Organización de materiales" },
] as const;

export const DominioFE = z.enum(
  DOMINIOS_FE.map((d) => d.id) as [(typeof DOMINIOS_FE)[number]["id"], ...(typeof DOMINIOS_FE)[number]["id"][]],
);
export type DominioFE = z.infer<typeof DominioFE>;

// Riesgos que se registran en el seguimiento de coaching (CONTEXTO §5).
export const SENALES = [
  { id: "estres_desregulacion", etiqueta: "Estrés o desregulación" },
  { id: "intencion_de_renunciar", etiqueta: "Quiere renunciar" },
  { id: "cambio_de_vida", etiqueta: "Cambios de vida" },
  { id: "desajuste_con_rol", etiqueta: "Desajuste con el rol" },
] as const;

export const TipoSenal = z.enum(
  SENALES.map((s) => s.id) as [(typeof SENALES)[number]["id"], ...(typeof SENALES)[number]["id"][]],
);
export type TipoSenal = z.infer<typeof TipoSenal>;

// "fortaleza" y "area_de_apoyo" (nunca "debilidad"); "contexto" para datos neutrales.
export const TipoHallazgo = z.enum(["fortaleza", "area_de_apoyo", "contexto"]);
export type TipoHallazgo = z.infer<typeof TipoHallazgo>;

// ---------------------------------------------------------------------------
// Lo que devuelve el modelo: ProfileUpdate
// ---------------------------------------------------------------------------

const Cita = z
  .string()
  .min(8)
  .max(600)
  .describe("Fragmento copiado tal cual de la nota del coach. No se parafrasea.");

export const EvidenciaPropuesta = z.strictObject({ cita: Cita });
export type EvidenciaPropuesta = z.infer<typeof EvidenciaPropuesta>;

const ListaEvidencia = z.array(EvidenciaPropuesta).min(1).max(5);

export const CambioDimension = z.strictObject({
  dimension: DimensionId,
  resumen: z
    .string()
    .min(1)
    .max(1200)
    .describe(
      "Prosa en tercera persona con el nombre de pila. Tono positivo y respetuoso. Describe conductas observables, no etiquetas.",
    ),
  tipo: TipoHallazgo,
  dominiosFE: z.array(DominioFE).max(3),
  evidencia: ListaEvidencia,
});
export type CambioDimension = z.infer<typeof CambioDimension>;

export const Senal = z.strictObject({
  tipo: TipoSenal,
  descripcion: z.string().min(1).max(600),
  evidencia: ListaEvidencia,
});
export type Senal = z.infer<typeof Senal>;

export const RelacionConPerfil = z.strictObject({
  tipo: z.enum(["coincidencia", "contradiccion"]),
  dimension: DimensionId,
  descripcion: z.string().min(1).max(600),
  evidencia: ListaEvidencia,
});
export type RelacionConPerfil = z.infer<typeof RelacionConPerfil>;

export const ProfileUpdate = z.strictObject({
  cambios: z.array(CambioDimension).max(15),
  senales: z.array(Senal).max(4),
  relacionesConPerfilPrevio: z.array(RelacionConPerfil).max(10),
  preguntasParaSiguienteSesion: z.array(z.string().min(1).max(300)).max(5),
});
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;

// ---------------------------------------------------------------------------
// Lo que se guarda: perfil consolidado (profile_snapshots.perfil)
// ---------------------------------------------------------------------------

export const EvidenciaGuardada = z.strictObject({
  cita: Cita,
  sessionId: z.uuid(),
});
export type EvidenciaGuardada = z.infer<typeof EvidenciaGuardada>;

export const DimensionPerfil = z.strictObject({
  resumen: z.string().min(1).max(1200),
  tipo: TipoHallazgo,
  dominiosFE: z.array(DominioFE).max(3),
  evidencia: z.array(EvidenciaGuardada).min(1),
  actualizadoEn: z.iso.datetime({ offset: true }),
  eventoId: z.uuid(),
});
export type DimensionPerfil = z.infer<typeof DimensionPerfil>;

export const SenalActiva = z.strictObject({
  tipo: TipoSenal,
  descripcion: z.string().min(1).max(600),
  evidencia: z.array(EvidenciaGuardada).min(1),
  detectadaEn: z.iso.datetime({ offset: true }),
  eventoId: z.uuid(),
});
export type SenalActiva = z.infer<typeof SenalActiva>;

export const Perfil = z.strictObject({
  dimensiones: z.partialRecord(DimensionId, DimensionPerfil),
  senalesActivas: z.array(SenalActiva),
});
export type Perfil = z.infer<typeof Perfil>;

export const PERFIL_VACIO: Perfil = { dimensiones: {}, senalesActivas: [] };

// Lo que puede leer la persona (persona_profiles.contenido). Sin citas (salen de las
// notas privadas del coach), sin señales de riesgo y sin dominios de función ejecutiva.
// Vive en otra tabla porque RLS filtra filas, no columnas: si la persona pudiera leer
// profile_snapshots, la Data API de Supabase le daría el perfil completo.
export const PerfilPersona = z.strictObject({
  dimensiones: z.partialRecord(
    DimensionId,
    z.strictObject({ resumen: z.string().min(1).max(1200), tipo: TipoHallazgo }),
  ),
});
export type PerfilPersona = z.infer<typeof PerfilPersona>;

export function vistaPersona(perfil: Perfil): PerfilPersona {
  const dimensiones: PerfilPersona["dimensiones"] = {};
  for (const [id, d] of Object.entries(perfil.dimensiones) as [DimensionId, DimensionPerfil][]) {
    dimensiones[id] = { resumen: d.resumen, tipo: d.tipo };
  }
  return PerfilPersona.parse({ dimensiones });
}

// ---------------------------------------------------------------------------
// Payload de profile_events.payload
// ---------------------------------------------------------------------------

// Lo que la validación de lib/profile/validate.ts quitó o marcó.
export const Descartado = z.strictObject({
  // "cita_no_encontrada": ruta de la cita, p. ej. "cambios[2].evidencia[0]", y la cita.
  // "dimension_duplicada": ruta del cambio, p. ej. "cambios[3]", y cita "".
  ruta: z.string(),
  cita: z.string(),
  motivo: z.enum(["cita_no_encontrada", "dimension_duplicada"]),
});
export type Descartado = z.infer<typeof Descartado>;

export const Bandera = z.strictObject({
  ruta: z.string(),
  termino: z.string(),
  motivo: z.literal("termino_no_permitido"),
});
export type Bandera = z.infer<typeof Bandera>;

export const PayloadPropuestaIA = z.strictObject({
  tipo: z.literal("propuesta_ia"),
  update: ProfileUpdate,
  descartados: z.array(Descartado),
  banderas: z.array(Bandera),
});

// Botón "esto no me representa" del lado persona.
export const PayloadNoMeRepresenta = z.strictObject({
  tipo: z.literal("no_me_representa"),
  dimension: DimensionId.nullable(),
  comentario: z.string().max(2000),
});

export const ProfileEventPayload = z.discriminatedUnion("tipo", [PayloadPropuestaIA, PayloadNoMeRepresenta]);
export type ProfileEventPayload = z.infer<typeof ProfileEventPayload>;

// Lo que el coach aprobó de una propuesta (profile_events.approved_payload).
export const Aprobacion = z.strictObject({
  cambios: z.array(z.int().nonnegative()), // índices de update.cambios
  senales: z.array(z.int().nonnegative()), // índices de update.senales
});
export type Aprobacion = z.infer<typeof Aprobacion>;

// ---------------------------------------------------------------------------
// Utilidades de presentación
// ---------------------------------------------------------------------------

export const etiquetaDimension = (id: DimensionId) => DIMENSIONES.find((d) => d.id === id)!.etiqueta;
export const etiquetaDominioFE = (id: DominioFE) => DOMINIOS_FE.find((d) => d.id === id)!.etiqueta;
export const etiquetaSenal = (id: TipoSenal) => SENALES.find((s) => s.id === id)!.etiqueta;
