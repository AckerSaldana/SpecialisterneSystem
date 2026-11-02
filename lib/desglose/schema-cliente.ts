// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// La parte de los esquemas del desglose de tareas (spec 010) que puede correr en el navegador de la persona.
// No importa lib/profile/schema, ni siquiera a través de otro archivo: ese módulo trae los nombres de los
// dominios y de las señales, y la persona nunca los ve (C-09). lib/desglose/schema.ts vuelve a exportar lo de
// aquí y suma lo que necesita DimensionId, igual que lib/guia/schema-cliente.ts. Todos los objetos son estrictos.
import { z } from "zod";

// R-010.1 y "Esquemas": los largos son suposición.
export const MIN_TAREA = 3;
export const MAX_TAREA = 1000;
export const MAX_CAMPO_CONTEXTO = 200;
export const MAX_TEXTO_MARCA = 1000;
export const MAX_PASOS = 15;
export const MAX_ACCION = 160;
export const MAX_CRITERIO = 200;
export const MAX_NOTA = 240;
export const MAX_MINUTOS = 480;
export const MAX_AJUSTES = 5;
export const MAX_MOTIVO = 200;

// R-010.48 (decisión abierta 4). Aquí porque también lo dicen los textos de la pantalla de la persona.
export const LIMITE_DIARIO_DESGLOSE = 10;

const CampoContexto = z.string().trim().min(1).max(MAX_CAMPO_CONTEXTO);

// R-010.1: tres campos opcionales. Sin lugar para archivos.
export const ContextoDesglose = z.strictObject({
  herramienta: CampoContexto.optional(),
  plazo: CampoContexto.optional(),
  conQuien: CampoContexto.optional(),
});
export type ContextoDesglose = z.infer<typeof ContextoDesglose>;

export const EstadoPaso = z.enum(["hecho", "atorado", "pendiente"]);
export type EstadoPaso = z.infer<typeof EstadoPaso>;

export const TipoAjuste = z.enum(["cambiar", "agregar_antes"]);
export type TipoAjuste = z.infer<typeof TipoAjuste>;

// ---------------------------------------------------------------------------
// Lo que recibe el navegador
// ---------------------------------------------------------------------------

// Campos de un paso que sí puede recibir el navegador. lib/desglose/schema.ts les suma origen.
export const CAMPOS_PASO_VISTA = {
  id: z.uuid(),
  accion: z.string().min(1).max(MAX_ACCION),
  criterioTerminado: z.string().min(1).max(MAX_CRITERIO),
  // R-010.21: la nota la escribe el modelo y porQue lo arma el código. Van los dos o ninguno.
  notaApoyo: z.string().min(1).max(MAX_NOTA).nullable(),
  porQue: z.string().min(1).nullable(),
  minutos: z.int().min(1).max(MAX_MINUTOS).nullable(),
};

export const PasoDesgloseVista = z.strictObject(CAMPOS_PASO_VISTA);
export type PasoDesgloseVista = z.infer<typeof PasoDesgloseVista>;

export const AjusteVista = z.strictObject({
  id: z.uuid(),
  tipo: TipoAjuste,
  pasoId: z.uuid(),
  paso: PasoDesgloseVista,
  motivo: z.string().min(1).max(MAX_MOTIVO),
});
export type AjusteVista = z.infer<typeof AjusteVista>;

// R-010.27: el estado de un paso es su fila más reciente, la de id más alto; sin filas, está pendiente.
export function ultimasMarcas<M extends { id: number; pasoId: string }>(marcas: readonly M[]): Map<string, M> {
  const ultimas = new Map<string, M>();
  for (const marca of marcas) {
    const actual = ultimas.get(marca.pasoId);
    if (!actual || marca.id > actual.id) ultimas.set(marca.pasoId, marca);
  }
  return ultimas;
}

export function estadoDePaso(pasoId: string, ultimas: ReadonlyMap<string, { estado: EstadoPaso }>): EstadoPaso {
  return ultimas.get(pasoId)?.estado ?? "pendiente";
}

// Para armar frases con un texto que puede terminar en punto, sin que salgan dos.
export const sinPuntoFinal = (texto: string) => texto.trim().replace(/[.\s]+$/, "");

// ---------------------------------------------------------------------------
// Contratos de las rutas de la persona (spec 010, "Rutas"). También corren en el navegador.
// ---------------------------------------------------------------------------

// POST /api/engagements/[id]/task-breakdowns. La persona y el coach mandan lo mismo.
export const PedirDesgloseRequest = z.strictObject({
  tarea: z.string().trim().min(MIN_TAREA).max(MAX_TAREA),
  contexto: ContextoDesglose.optional(),
});
export type PedirDesgloseRequest = z.infer<typeof PedirDesgloseRequest>;

export const DesgloseCreadoResponse = z.strictObject({ breakdownId: z.uuid() });
export type DesgloseCreadoResponse = z.infer<typeof DesgloseCreadoResponse>;

// PATCH /api/task-breakdowns/[id] ("Ya no la uso", R-010.29). La persona y el coach mandan lo mismo.
export const ArchivarDesgloseRequest = z.strictObject({ accion: z.literal("archivar") });
export type ArchivarDesgloseRequest = z.infer<typeof ArchivarDesgloseRequest>;

// POST /api/task-breakdowns/[id]/steps/[pasoId]/events (R-010.26, R-010.28). Solo "Me atoré aquí" lleva texto.
export const MarcarPasoRequest = z.discriminatedUnion("estado", [
  z.strictObject({ estado: z.literal("atorado"), texto: z.string().trim().max(MAX_TEXTO_MARCA).optional() }),
  z.strictObject({ estado: z.enum(["hecho", "pendiente"]) }),
]);
export type MarcarPasoRequest = z.infer<typeof MarcarPasoRequest>;

export const MarcarPasoResponse = z.strictObject({ marcaId: z.int() });
export type MarcarPasoResponse = z.infer<typeof MarcarPasoResponse>;

// POST /api/task-breakdowns/[id]/duplicate (R-010.35 a R-010.37). Solo confirma: lo demás sale del origen.
export const RepetirDesgloseRequest = z.strictObject({});
export type RepetirDesgloseRequest = z.infer<typeof RepetirDesgloseRequest>;

// Qué pasó con la copia, para que la pantalla diga su texto literal. Sin datos de la tarea.
export const ResultadoRepetir = z.enum(["sin_marcas", "sin_ajustes", "con_ajustes"]);
export type ResultadoRepetir = z.infer<typeof ResultadoRepetir>;

export const RepetirDesgloseResponse = z.strictObject({ breakdownId: z.uuid(), resultado: ResultadoRepetir });
export type RepetirDesgloseResponse = z.infer<typeof RepetirDesgloseResponse>;

// POST /api/task-breakdowns/[id]/ajustes (R-010.38). Lista vacía: no usa ninguno.
export const DecidirAjustesRequest = z.strictObject({ aceptados: z.array(z.uuid()).max(MAX_AJUSTES) });
export type DecidirAjustesRequest = z.infer<typeof DecidirAjustesRequest>;
