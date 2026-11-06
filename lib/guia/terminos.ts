// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Lo que no puede ir en "Cómo trabajar conmigo" (spec 009). Funciones puras, sin red ni base, que
// reutilizan lib/profile/terminos.ts. Corren solo en el servidor: ese archivo trae lib/profile/schema, con
// los nombres de dominios y señales, y ninguno puede llegar al JavaScript que descarga la persona (C-09,
// R-009.24). El navegador muestra el mensaje del 400.
//   - revisarLineaIa: una línea que escribió el modelo. Nadie la revisa antes que la persona, así que un
//     hallazgo la descarta (R-009.11, D-070).
//   - revisarTextoPropio: lo que escribe la persona. Un hallazgo bloquea, sin confirmación que lo salte.
//     No busca citas: el bloqueo le diría qué frases están en las notas de su coach (R-009.25).
//   - revisarInsumo: un texto del perfil o del plan antes de mandarlo al modelo. Un hallazgo lo deja fuera (R-009.9).
// Las tres revisan cada forma de formasDeComparacion, para que un separador no esquive un término (R-009.24).
import {
  buscarClinicos,
  buscarCondiciones,
  buscarInternos,
  buscarTerminos,
  citasCopiadas,
  enCadaForma,
  formasDeComparacion,
  fragmentoDelTermino,
  normalizar,
  revisarTextoPersona,
} from "@/lib/profile/terminos";

// Viven en lib/profile/terminos.ts desde la spec 010, que también las usa (R-010.15).
export { buscarClinicos, TERMINOS_CLINICOS_GUIA } from "@/lib/profile/terminos";

// Decisión abierta 2, opción B: etiquetas internas que también son palabras de todos los días. En lo que
// escribe la persona no bloquean ("necesito flexibilidad en mi horario"); en una línea de la IA, sí.
export const PALABRAS_DE_USO_DIARIO: readonly string[] = ["Flexibilidad", "Cambios de vida"];

// R-009.9 (decisión abierta 12, propuesta): en un texto del coach, "Flexibilidad" no deja fuera el ítem, porque es la
// palabra común de un ajuste de horario. "Cambios de vida" sí, porque es la etiqueta de una señal y al modelo no le
// llegan señales (R-009.8). Lo que el modelo escriba con cualquiera de las dos se descarta en revisarLineaIa.
const PALABRAS_COMUNES_EN_INSUMOS: readonly string[] = ["Flexibilidad"];

// La excepción solo vale para la palabra escrita como texto común. El id de una señal ("cambio_de_vida") o la
// etiqueta con separadores ("cambios-de-vida") siguen contando: al quitar la forma común, todavía se encuentran.
function internosSalvo(forma: string, palabras: readonly string[]): string[] {
  return buscarInternos(forma).filter((termino) => {
    if (!palabras.includes(termino)) return true;
    return buscarInternos(normalizar(forma).replaceAll(normalizar(termino), " ")).includes(termino);
  });
}

// R-009.11: IDs internos, enlaces y el nombre que no se usa (C-08). Los IDs aceptan "-", "_" o espacio. E, P y O con
// espacio solo en mayúsculas y con dos dígitos: "uno o 2 recordatorios" es texto común. apoyo_fe es el tipo de un punto del
// plan, que el modelo recibe en sus orígenes; con espacio es texto común.
const IDS_INTERNOS = /(?<![\p{L}\p{N}])(?:[EPO][-_]\d+|(?:KC|CU)(?:[-_ ][A-Z]*\d+|\d+)|apoyo[-_]fe)(?![\p{L}\p{N}])/iu;
const IDS_CON_ESPACIO = /(?<![\p{L}\p{N}])[EPO] \d{2,}(?![\p{L}\p{N}])/u;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
// Cualquier palabra.tld, correos y esquemas. El TLD va todo en minúsculas o todo en mayúsculas, para no confundir
// "reunión.Pido" con un enlace. Una sola letra antes del punto solo cuenta con ruta ("t.co/abc"): "p.ej." no es enlace.
export const ENLACE =
  /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/|\b[wW]{3}\.|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+|[\p{L}\p{N}-]+\.(?:[a-z]{2,}|[A-Z]{2,})\/|[\p{L}\p{N}-]{2,}(?:\.[\p{L}\p{N}-]+)*\.(?:[a-z]{2,}|[A-Z]{2,})(?![\p{L}\p{N}])/u;
const BUSINESS_PROFILE = /\bbusiness[ _-]*profiles?\b/;

function buscarIds(forma: string): string[] {
  const id = IDS_INTERNOS.exec(forma) ?? IDS_CON_ESPACIO.exec(forma) ?? UUID.exec(forma);
  return id ? [id[0]] : [];
}

// Lo que impide guardar una línea de la IA. "citas" son las del acompañamiento (app_guia_insumos).
export function revisarLineaIa(texto: string, citas: string[]): string[] {
  const hallazgos = enCadaForma(texto, (forma) => [
    ...revisarTextoPersona(forma, citas).map((h) => h.termino),
    ...buscarIds(forma),
    ...(BUSINESS_PROFILE.test(normalizar(forma)) ? ["business profile"] : []),
  ]);
  hallazgos.push(...buscarClinicos(texto));
  const enlace = ENLACE.exec(formasDeComparacion(texto).limpia);
  if (enlace) hallazgos.push(enlace[0]);
  return hallazgos;
}

// Lo que impide guardar una línea propia, una edición o el nombre a mostrar. Sin citas (R-009.25).
export function revisarTextoPropio(texto: string): string[] {
  const hallazgos = enCadaForma(texto, (forma) => {
    const terminos = buscarTerminos(forma);
    return [...terminos, ...buscarCondiciones(forma, terminos), ...internosSalvo(forma, PALABRAS_DE_USO_DIARIO)];
  });
  return [...new Set([...hallazgos, ...buscarClinicos(texto)])];
}

// R-009.8 y R-009.9: lo que deja fuera un texto del perfil o del plan antes de mandarlo al modelo. plan_items.descripcion
// no pasa por los filtros de lo que lee la persona (banderasQueBloquean solo mira textoPersona).
export function revisarInsumo(texto: string, citas: string[]): string[] {
  const hallazgos = enCadaForma(texto, (forma) => {
    const terminos = buscarTerminos(forma);
    return [...terminos, ...buscarCondiciones(forma, terminos), ...internosSalvo(forma, PALABRAS_COMUNES_EN_INSUMOS), ...buscarIds(forma), ...citasCopiadas(forma, citas)];
  });
  return [...new Set([...hallazgos, ...buscarClinicos(texto)])];
}

// Texto literal de "Pantallas y textos" (decisión 2 del plan). También es el mensaje del 400.
export const mensajeBloqueo = (termino: string, sujeto: "Esta línea" | "Este nombre" = "Esta línea") =>
  `${sujeto} no se guardó porque dice «${termino}». Esa palabra no puede ir en esta hoja: la hoja habla de cómo trabajar contigo, no de tu salud, de un diagnóstico ni de términos técnicos. Puedes escribirlo con otras palabras o quitarlo. Si quieres contarle algo de esto a tu líder, puedes hacerlo por tu cuenta, cuando y como tú decidas. Esa decisión es tuya y esta app no la registra.`;

// R-009.25: el mensaje con lo primero que encontró, en las palabras de la persona. null: no hay nada que bloquear.
export function mensajeDeBloqueoDe(texto: string, sujeto?: "Esta línea" | "Este nombre"): string | null {
  const [termino] = revisarTextoPropio(texto);
  return termino === undefined ? null : mensajeBloqueo(fragmentoDelTermino(texto, termino), sujeto);
}
