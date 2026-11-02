// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Esquemas de "Cómo trabajar conmigo" (spec 009). Única fuente de verdad de la guía:
//   - lo que propone el modelo (GuiaPropuesta),
//   - lo que se guarda (LineaGuia, DocumentoGuia y DescartesGuia, en app.shared_guides),
//   - lo que recibe el navegador (LineaGuiaVista),
//   - lo que devuelve private.app_guia_insumos (InsumosGuia).
// Este archivo importa lib/profile/schema: un componente de cliente de /persona importa de
// lib/guia/schema-cliente.ts, nunca de aquí (C-09). Como en lib/plan/schema.ts, texto y origenes de
// GuiaPropuesta son permisivos a propósito: una línea larga o un ref malo los descarta sanitizeGuia
// (lib/guia/validate.ts) sin tumbar toda la respuesta del modelo.
import { createHash } from "node:crypto";
import { z } from "zod";
import { TipoItemPlan } from "@/lib/plan/schema";
import { DimensionId, PerfilPersona } from "@/lib/profile/schema";
import { CAMPOS_LINEA_VISTA, SeccionGuia, type EstadoGuia, type GuiaVista, type LineaGuiaVista } from "@/lib/guia/schema-cliente";

export * from "@/lib/guia/schema-cliente";

// ---------------------------------------------------------------------------
// Lo que devuelve el modelo
// ---------------------------------------------------------------------------

export const GuiaPropuesta = z.strictObject({
  lineas: z
    .array(
      z.strictObject({
        seccion: SeccionGuia,
        texto: z
          .string()
          .min(1)
          .max(300)
          .describe("Primera persona. Un apoyo concreto y observable, hasta 160 caracteres, en lenguaje de trabajo."),
        origenes: z.array(z.string().describe("ID corto de la lista de orígenes, p. ej. O-03.")).min(1).max(3),
      }),
    )
    .max(30),
});
export type GuiaPropuesta = z.infer<typeof GuiaPropuesta>;

// ---------------------------------------------------------------------------
// Lo que se guarda (app.shared_guides)
// ---------------------------------------------------------------------------

// R-009.6: solo IDs, nunca texto, citas ni dominios. RLS filtra filas, no columnas.
export const OrigenLinea = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("plan_item"), planItemId: z.uuid() }),
  z.strictObject({ tipo: z.literal("dimension"), dimension: DimensionId }),
]);
export type OrigenLinea = z.infer<typeof OrigenLinea>;

export const LineaGuia = z
  .strictObject({
    ...CAMPOS_LINEA_VISTA,
    origenes: z.array(OrigenLinea).max(3),
    lineaAnteriorId: z.uuid().nullable(),
  })
  .superRefine((l, ctx) => {
    // R-009.23: una línea propia no tiene texto de la IA ni orígenes. R-009.6: las demás sí.
    const propia = l.estado === "propia";
    if (propia !== (l.textoIa === null)) ctx.addIssue({ code: "custom", path: ["textoIa"], message: "textoIa es nulo solo en una línea propia" });
    if (propia !== (l.origenes.length === 0)) ctx.addIssue({ code: "custom", path: ["origenes"], message: "origenes está vacío solo en una línea propia" });
  });
export type LineaGuia = z.infer<typeof LineaGuia>;

// R-009.33: ninguna pantalla muestra los orígenes. Se copia campo por campo: lo que no está aquí no sale.
export function vistaDeLinea(l: LineaGuia): LineaGuiaVista {
  return { id: l.id, seccion: l.seccion, texto: l.texto, estado: l.estado, textoIa: l.textoIa, orden: l.orden, cambio: l.cambio };
}

export const MotivoDescarte = z.enum([
  "origen_no_existe",
  "sin_origen",
  "texto_no_permitido",
  "texto_largo",
  "repetida",
  "sobra_en_seccion",
  "solo_participacion",
]);
export type MotivoDescarte = z.infer<typeof MotivoDescarte>;

// R-009.12: solo conteos por motivo, nunca el texto: la persona lee toda su fila.
export const DescartesGuia = z.partialRecord(MotivoDescarte, z.int().positive());
export type DescartesGuia = z.infer<typeof DescartesGuia>;

// R-009.29: identifica el nombre y las líneas de un borrador, para saber si lo que se va a congelar es lo que la pantalla
// mostró. Solo lleva lo que la persona ya lee, sin orígenes, en un orden fijo: jsonb no conserva el de las llaves.
export function huellaDeGuia(g: { nombreAMostrar: string; lineas: LineaGuia[] }): string {
  const lineas = g.lineas.map((l) => [l.id, l.seccion, l.texto, l.estado, l.textoIa, l.orden, l.cambio && [l.cambio.tipo, l.cambio.textoAnterior, l.cambio.antesQuitada, l.cambio.decision]]);
  return createHash("sha256").update(JSON.stringify([g.nombreAMostrar, lineas])).digest("hex");
}

// Lo que responden las rutas de la persona. Se copia campo por campo, igual que vistaDeLinea.
export function vistaDeGuia(g: {
  id: string;
  estado: EstadoGuia;
  version: number | null;
  nombreAMostrar: string;
  lineas: LineaGuia[];
  descartes: DescartesGuia;
}): GuiaVista {
  return {
    id: g.id,
    estado: g.estado,
    version: g.version,
    nombreAMostrar: g.nombreAMostrar,
    lineas: g.lineas.map(vistaDeLinea),
    descartadas: Object.values(g.descartes).reduce((total, n) => total + (n ?? 0), 0),
    huella: huellaDeGuia(g),
  };
}

// ---------------------------------------------------------------------------
// Lo que devuelve private.app_guia_insumos (R-009.10). Se queda en el servidor.
// ---------------------------------------------------------------------------

const ItemInsumo = z.strictObject({
  id: z.uuid(),
  tipo: TipoItemPlan,
  descripcion: z.string(),
  textoPersona: z.string().nullable(),
  orden: z.int(),
});
export type ItemInsumo = z.infer<typeof ItemInsumo>;

// Perfil y plan son nulos si todavía no hay ninguno aprobado (R-009.3).
export const InsumosGuia = z.strictObject({
  snapshotId: z.uuid().nullable(),
  perfilVersion: z.int().nullable(),
  perfil: PerfilPersona.nullable(),
  planVersion: z.int().nullable(),
  items: z.array(ItemInsumo),
  itemsBase: z.array(ItemInsumo),
  origenes: z.array(z.strictObject({ id: z.uuid(), origenItemId: z.uuid().nullable() })),
  citas: z.array(z.string()),
  hayBorrador: z.boolean(),
  hayVersiones: z.boolean(),
});
export type InsumosGuia = z.infer<typeof InsumosGuia>;
