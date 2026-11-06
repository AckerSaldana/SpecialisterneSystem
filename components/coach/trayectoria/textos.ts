// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Textos literales e ids de la pantalla "Función ejecutiva" (spec 008, "Pantallas y textos"). Sin hooks
// ni "server-only": lo usan Server y Client Components. Solo para el coach: importa los nombres de los
// dominios, así que ninguna pantalla de /persona lo puede usar (C-09).
import { ETIQUETA_TIPO, formatFecha } from "@/components/coach/labels";
import { etiquetaDireccionFE, etiquetaDominioFE, type DireccionFE, type DominioFE } from "@/lib/profile/schema";
import type { Linea } from "@/lib/trayectoria/lineas";

// ---------------------------------------------------------------------------
// Ids para el foco (R-008.27)
// ---------------------------------------------------------------------------

export const ID_FILTROS = "filtros";
export const idBloque = (dominio: DominioFE | null) => (dominio ? `bloque-${dominio}` : "citas-sin-dominio");
export const idLinea = (lineaId: string) => `linea-${lineaId}`;
export const idResumen = (dominio: DominioFE) => `resumen-${dominio}`;

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const textoDominio = (dominio: DominioFE | null) => (dominio ? etiquetaDominioFE(dominio) : "Ninguno");
export const textoDireccion = (direccion: DireccionFE | null) => (direccion ? etiquetaDireccionFE(direccion) : "Sin dirección");

export const TITULO_PANTALLA = "Función ejecutiva";
export const textoVolver = (nombre: string) => `Volver al perfil de ${nombre}`;
export const textoIntro = (nombre: string) =>
  `Aquí están las conductas que anotaste en tus sesiones, ordenadas por dominio de función ejecutiva. Esto no es una medición: no hay puntajes, niveles ni clasificación. Que un dominio no tenga observaciones no dice nada sobre ${nombre}. ${nombre} no ve esta pantalla.`;

export const ERROR_FECHAS = 'Revisa las fechas. "Desde" no puede ser después de "Hasta".';

export const VACIO_BLOQUE = "Sin observaciones";
export const VACIO_POR_FILTROS = "Sin líneas con estos filtros.";

export const TITULO_SIN_DOMINIO = "Citas sin dominio";
export const AYUDA_SIN_DOMINIO = "Estas citas no están ligadas a ningún dominio. Puedes asignarles uno con Corregir.";
export const VACIO_SIN_DOMINIO = "No hay citas sin dominio.";

export const TITULO_NO_MOSTRADAS = "Citas no mostradas";
export const textoNoMostrada = (fecha: Date) =>
  `La cita de la sesión del ${formatFecha(fecha)} no se muestra aquí porque usa una palabra que esta vista no permite. Puedes leerla en la nota de esa sesión.`;

export const VER_NOTA = "Ver la nota de esa sesión";
export const VER_HISTORIAL = "Historial de esta línea";

export const textoCorregida = (autor: string, fecha: Date) => `Lo corrigió ${autor} el ${formatFecha(fecha)}.`;

// Lo que se dice de una línea con dirección "cambio". "porId" trae todas las líneas de ahora, sin
// filtros: una cita anterior puede quedar fuera de los filtros y seguir mostrándose aquí. Ya no estar
// quiere decir que ya no se muestra, por R-008.17 o R-008.18.
export function textoCambio(linea: Linea, porId: Map<string, Linea>): { texto: string; cita: string | null; donde: string | null } | null {
  if (linea.direccion !== "cambio") return null;
  const anterior = linea.anteriorLineaId ? porId.get(linea.anteriorLineaId) : undefined;
  if (!anterior) return { texto: "Cambio respecto a una cita que ya no se muestra.", cita: null, donde: null };
  const donde = anterior.dominio === linea.dominio ? null : `Ahora está en ${anterior.dominio ? etiquetaDominioFE(anterior.dominio) : TITULO_SIN_DOMINIO}.`;
  return { texto: `Cambio respecto a la cita del ${formatFecha(anterior.fecha)}:`, cita: anterior.cita, donde };
}

// El plegable "Historial de esta línea", de lo más antiguo a lo más reciente (R-008.29).
export function textosHistorial(linea: Linea, nombre: string): string[] {
  const { ia } = linea;
  const textos = [
    ia.origen === "etiqueta_ia"
      ? `La IA propuso: ${textoDominio(ia.dominio)}, ${textoDireccion(ia.direccion)}.`
      : `La IA no etiquetó esta cita. Se leyó del cambio aprobado: ${textoDominio(ia.dominio)}, ${textoDireccion(ia.direccion)}.`,
  ];
  if (ia.tipoEditado) textos.push(`Al aprobar, ${linea.decididoPor ?? "el coach"} cambió el tipo del cambio a ${ETIQUETA_TIPO[ia.tipoEditado]}.`);
  if (ia.sinDireccionPorParticipacion) {
    textos.push(`Esta cita solo dice que ${nombre} habla o participa poco, y hablar poco no cuenta como área de apoyo. Por eso esta línea no tiene dirección.`);
  }
  for (const c of linea.correcciones) {
    textos.push(`${c.autor} lo cambió a ${textoDominio(c.dominio)}, ${textoDireccion(c.direccion)}, el ${formatFecha(c.fecha)}.`);
  }
  return textos;
}

// Diálogo de corrección.
export const TEXTOS_CORREGIR = {
  boton: "Corregir",
  titulo: "Corregir esta línea",
  ayuda: (nombre: string) => `Lo que propuso la IA queda en el historial de esta línea. ${nombre} no ve esta corrección.`,
  dominio: "Dominio",
  direccion: "Dirección",
  anterior: "Cambio respecto a",
  sinAnteriores: "No hay citas anteriores en este dominio. Para marcar un cambio hace falta una.",
  participacion: (nombre: string) =>
    `Revisa esta corrección. Su única evidencia es que ${nombre} habla o participa poco, y hablar poco no cuenta como área de apoyo.`,
  // No tiene texto en la spec; explica por qué "Dirección" no se puede elegir (R-008.30).
  sinDominio: "Una cita sin dominio no lleva dirección.",
  cancelar: "Cancelar",
  guardar: "Guardar corrección",
  guardando: "Guardando.",
  guardada: "Se guardó tu corrección.",
} as const;

// Resumen al pie de un bloque (R-008.37, R-008.38). Los errores de la ruta llegan en su respuesta. El
// aviso "Este bloque cambió" es TEXTO_BLOQUE_CAMBIO de lib/trayectoria/validate.ts: lo usa también la ruta.
export const TEXTOS_RESUMEN = {
  // No tiene texto en la spec; es el destino del foco al llegar o decidir una propuesta (R-008.27).
  titulo: "Resumen",
  proponer: "Proponer resumen",
  proponerOtro: "Proponer otro resumen",
  generando: "Generando la propuesta.",
  marcaPropuesta: "Propuesta de la IA. No está aprobada.",
  verCitas: "Citas que usa este resumen",
  ayuda: (nombre: string) => `Este resumen toma todo el bloque, sin filtros. ${nombre} no lo ve.`,
  aprobar: "Aprobar",
  tituloAprobar: "¿Aprobar este resumen?",
  textoAprobar: (nombre: string) => `Queda como el resumen de este dominio. ${nombre} no lo ve. Si después cambian las citas, te lo vamos a decir aquí.`,
  descartar: "Descartar",
  tituloDescartar: "¿Descartar esta propuesta?",
  textoDescartar: "Esto no se puede deshacer. Puedes pedir otra.",
  aprobado: (coach: string, fecha: string) => `Resumen aprobado por ${coach} el ${fecha}.`,
  citasNuevas: "Hay citas nuevas después de este resumen. No las toma en cuenta.",
  aprobadoCambio: (fecha: string) => `El resumen aprobado el ${fecha} ya no coincide con este bloque porque cambió una de sus citas. Puedes pedir otro.`,
  // Sin respuesta legible de la ruta (sin red): el mismo texto del 502.
  errorModelo: "No se pudo generar un resumen que cumpla las reglas. No se guardó nada. Puedes pedirlo otra vez.",
} as const;
