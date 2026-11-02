// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// La parte de los esquemas de "Cómo trabajar conmigo" (spec 009) que puede correr en el navegador de la
// persona. No importa lib/profile/schema, ni siquiera a través de otro archivo: ese módulo trae los nombres
// de los dominios y de las señales, y la persona nunca los ve (C-09). lib/guia/schema.ts vuelve a exportar
// lo de aquí y suma lo que necesita DimensionId, igual que lib/api/contracts.ts con contracts-cliente.
import { z } from "zod";

// R-009.1: el nombre en todas las pantallas. shared_guides es solo un nombre interno.
export const TITULO_GUIA = "Cómo trabajar conmigo";

// R-009.4: solo estas cinco, en este orden. Es la única lista de secciones.
export const SECCIONES_GUIA = [
  { id: "comunicacion", titulo: "Cómo me comunico mejor" },
  { id: "ayuda", titulo: "Qué me ayuda a hacer bien mi trabajo" },
  { id: "cuesta_y_pido", titulo: "Qué me cuesta y qué pido" },
  { id: "cambios", titulo: "Cómo avisarme de cambios" },
  { id: "esperar", titulo: "Qué puedes esperar de mí" },
] as const;

export const SeccionGuia = z.enum(["comunicacion", "ayuda", "cuesta_y_pido", "cambios", "esperar"]);
export type SeccionGuia = z.infer<typeof SeccionGuia>;

export const tituloSeccion = (id: SeccionGuia) => SECCIONES_GUIA.find((s) => s.id === id)!.titulo;

// R-009.5 y R-009.26. El tope de 20 también está en el trigger de drizzle/0020_funciones_guia.sql.
export const MAX_TEXTO_LINEA = 160;
export const MAX_LINEAS_IA_POR_SECCION = 5;
export const MAX_LINEAS_INCLUIDAS = 20;
export const MAX_NOMBRE_A_MOSTRAR = 80;

export const EstadoLinea = z.enum(["pendiente", "incluida", "editada", "quitada", "propia"]);
export type EstadoLinea = z.infer<typeof EstadoLinea>;

// Lo que propone una regeneración sobre una línea (R-009.48). Decide la persona (R-009.49).
export const CambioLinea = z.strictObject({
  tipo: z.enum(["nueva", "cambia", "sale"]),
  textoAnterior: z.string().nullable(),
  antesQuitada: z.boolean(),
  decision: z.enum(["pendiente", "aceptado", "rechazado"]),
});
export type CambioLinea = z.infer<typeof CambioLinea>;

// Campos de una línea que sí puede recibir el navegador. lib/guia/schema.ts les suma origenes y lineaAnteriorId.
export const CAMPOS_LINEA_VISTA = {
  id: z.uuid(),
  seccion: SeccionGuia,
  texto: z.string().min(1).max(MAX_TEXTO_LINEA),
  estado: EstadoLinea,
  // Nulo en una línea propia.
  textoIa: z.string().min(1).max(MAX_TEXTO_LINEA).nullable(),
  orden: z.int(),
  cambio: CambioLinea.nullable(),
};

// R-009.33: lo que recibe el navegador, sin orígenes.
export const LineaGuiaVista = z.strictObject(CAMPOS_LINEA_VISTA);
export type LineaGuiaVista = z.infer<typeof LineaGuiaVista>;

// R-009.42: la hoja para el líder. Sin lugar para estados, orígenes ni líneas quitadas.
export const DocumentoGuia = z.strictObject({
  nombre: z.string().min(1).max(MAX_NOMBRE_A_MOSTRAR),
  secciones: z.array(
    z.strictObject({
      id: SeccionGuia,
      lineas: z.array(z.string().min(1).max(MAX_TEXTO_LINEA)).min(1),
    }),
  ),
});
export type DocumentoGuia = z.infer<typeof DocumentoGuia>;

// ---------------------------------------------------------------------------
// Contratos de las rutas de la persona (spec 009, "Rutas"). También corren en el navegador.
// ---------------------------------------------------------------------------

const TextoDeLinea = z.string().trim().min(1).max(MAX_TEXTO_LINEA);

// POST /api/persona/shared-guides/[id]/lineas
export const AgregarLineaRequest = z.strictObject({ seccion: SeccionGuia, texto: TextoDeLinea });
export type AgregarLineaRequest = z.infer<typeof AgregarLineaRequest>;

// PATCH /api/persona/shared-guides/[id]/lineas/[lineaId]. Estricto: ninguna confirmación salta la revisión
// de R-009.24, porque no hay dónde mandarla.
export const AccionLineaRequest = z.discriminatedUnion("accion", [
  z.strictObject({ accion: z.literal("editar"), texto: TextoDeLinea }),
  z.strictObject({ accion: z.enum(["incluir", "quitar", "volver_a_incluir", "volver_al_texto_ia", "aceptar_cambio", "rechazar_cambio"]) }),
]);
export type AccionLineaRequest = z.infer<typeof AccionLineaRequest>;

// PATCH /api/persona/shared-guides/[id]
export const NombreGuiaRequest = z.strictObject({ nombreAMostrar: z.string().trim().min(1).max(MAX_NOMBRE_A_MOSTRAR) });
export type NombreGuiaRequest = z.infer<typeof NombreGuiaRequest>;

// POST /api/persona/shared-guides/[id]/listo. La huella del borrador que la pantalla pintó (R-009.29).
export const ListoRequest = z.strictObject({ huella: z.string().min(1) });
export type ListoRequest = z.infer<typeof ListoRequest>;

export const EstadoGuia = z.enum(["borrador", "lista", "retirada", "descartada"]);
export type EstadoGuia = z.infer<typeof EstadoGuia>;

// Lo que responden las rutas de la persona. Sin orígenes (R-009.33). De los descartes solo el total: la
// pantalla dice cuántas líneas se quitaron, sin decir por qué ni cuáles (R-009.12).
export const GuiaVista = z.strictObject({
  id: z.uuid(),
  estado: EstadoGuia,
  version: z.int().nullable(),
  nombreAMostrar: z.string(),
  lineas: z.array(LineaGuiaVista),
  descartadas: z.int(),
  // Identifica lo que se está mostrando: "Listo" la regresa y la ruta la compara con la fila (R-009.29).
  huella: z.string(),
});
export type GuiaVista = z.infer<typeof GuiaVista>;
