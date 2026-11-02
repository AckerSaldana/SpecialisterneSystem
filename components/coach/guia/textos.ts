// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Textos literales de la pantalla del coach de "Cómo trabajar conmigo" (spec 009, "Coach"). Los errores al pedir
// llegan en la respuesta de la ruta (MENSAJES_GUIA en lib/guia/generar.ts).
import { sinConsentimiento } from "@/components/coach/plan/textos";
import { TITULO_GUIA } from "@/lib/guia/schema-cliente";

export const TITULO = TITULO_GUIA;
export const textoVolver = (nombre: string) => `Volver al acompañamiento de ${nombre}`;
export const textoIntro = (nombre: string) =>
  `Es una hoja que ${nombre} escribe para su líder. Solo ves las versiones que marca como listas. ${nombre} decide si la comparte y con quién. La app no se la manda a nadie.`;
export const SIN_VERSIONES = "No hay versiones listas.";

export const textoBoton = (nombre: string) => `Pedir un borrador para ${nombre}`;
export const textoAyuda = (nombre: string) =>
  `La IA usa el perfil y el plan aprobados, incluidos los puntos que solo ves tú. No usa tus notas ni sus citas. ${nombre} lo revisa línea por línea. Tú no vas a poder leerlo hasta que lo marque como listo.`;
export const textoHayVersiones = (nombre: string) => `Los cambios a esta hoja los pide ${nombre} desde su página.`;

// También son mensajes de los 409 al pedir: lib/guia/generar.ts los usa.
export const textoYaHayVersiones = (nombre: string) => `${nombre} ya empezó esta hoja. Los cambios los pide ${nombre} desde su página.`;
export const textoRetiroDuranteLaLlamada = (nombre: string) => `${nombre} retiró su consentimiento mientras se escribía el borrador. El borrador no se guardó.`;

// Ids para el foco: los párrafos que la página pinta en lugar del botón.
export const ID_HAY_VERSIONES = "hay-versiones";
export const ID_SIN_CONSENTIMIENTO = "sin-consentimiento";

// Con estos 409, el botón y su mensaje se van con el refresco: el foco va a lo que la página pinta en su lugar. Devuelve
// null si el botón se queda (R-009.59).
export function idFocoTras409(error: string, nombre: string): string | null {
  if (error === textoYaHayVersiones(nombre)) return ID_HAY_VERSIONES;
  if (error === sinConsentimiento(nombre) || error === textoRetiroDuranteLaLlamada(nombre)) return ID_SIN_CONSENTIMIENTO;
  return null;
}

export const DIALOGO_PEDIR = {
  titulo: "¿Pedir un borrador?",
  texto: (nombre: string) => `${nombre} lo va a ver cuando entre a su página. La app no le manda ningún aviso.`,
  cancelar: "Cancelar",
  confirmar: "Pedir borrador",
};

export const textoResultado = (nombre: string) => `Listo. ${nombre} ya lo puede revisar.`;
// Sin texto en la spec: el mismo tono que el de la persona.
export const ESPERANDO = "Escribiendo el borrador. Esto puede tardar unos segundos.";
// Sin respuesta legible de la ruta (sin red).
export const ERROR_RED = "No se pudo pedir el borrador. Revisa tu conexión e intenta de nuevo.";

export const textoLista = (fecha: string) => `Lista desde el ${fecha}.`;
export const VIGENTE = "Vigente.";

export const textoTituloHistorial = (nombre: string) => `Lo que ${nombre} cambió de la propuesta de la IA`;
export const textoQuito = (texto: string) => `Quitó: «${texto}»`;
export const textoCambio = (textoIa: string, texto: string) => `Cambió: «${textoIa}» por «${texto}»`;
export const textoAgrego = (texto: string) => `Agregó: «${texto}»`;
export const textoSinCambios = (n: number) => `Sin cambios: ${n} ${n === 1 ? "línea" : "líneas"}.`;
