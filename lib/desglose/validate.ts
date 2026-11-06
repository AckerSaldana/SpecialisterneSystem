// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Revisión determinista de lo que el modelo le escribe a la persona en un desglose de tareas (spec 010). Funciones
// puras, sin red ni base. Nadie revisa estos pasos antes que ella (D-070), y son revisiones por lista y por patrón:
// reducen errores, pero no prueban que un paso sea correcto. El eval las complementa (R-010.53).
//   - revisarTextoDesglose (R-010.15): lo que no puede llegarle, en cada forma del texto. Corre solo en el
//     servidor: trae lib/profile/terminos.ts y este archivo no llega al JavaScript de la persona (C-09). Su excepción
//     solo cubre una lista cerrada de palabras con otro sentido en el trabajo, nunca una condición o una severidad.
//   - validarPasos (R-010.12 a R-010.17): problemas por número de paso, sin texto de la tarea. Provocan el
//     único reintento (R-010.18).
//   - limpiarPasos (R-010.20 a R-010.22, R-010.24): quita lo que no se sostiene y arma lo que se guarda. Una nota
//     descartada no tumba el paso, y de ella solo queda la ruta y el motivo, porque la persona lee toda su fila.
import "server-only";
import type { Apoyo } from "@/lib/desglose/adaptaciones";
import { PasoDesglose, type DescartadoDesglose, type PasoPropuesto, type ProblemaPaso } from "@/lib/desglose/schema";
import { ENLACE } from "@/lib/guia/terminos";
import { buscarClinicos, buscarInternosCercanos, enCadaForma, formasDeComparacion, normalizar, revisarTextoPersona } from "@/lib/profile/terminos";

// ---------------------------------------------------------------------------
// Listas fijas (interpretación del equipo). Se comparan normalizadas.
// ---------------------------------------------------------------------------

// R-010.12: verbos que, después de " y " o de una coma, dicen que hay una segunda acción.
export const VERBOS_ACCION: readonly string[] = [
  "abre", "actualiza", "adjunta", "agrega", "anota", "avisa", "borra", "busca", "cambia", "cierra", "compara", "completa",
  "comprueba", "confirma", "copia", "corrige", "crea", "descarga", "elige", "elimina", "enlista", "entra", "entrega", "envia",
  "escribe", "firma", "guarda", "haz", "imprime", "lee", "llena", "manda", "marca", "mueve", "nombra", "ordena", "pega", "pide",
  "pon", "pregunta", "prepara", "prueba", "quita", "renombra", "repite", "revisa", "sal", "selecciona", "separa", "sube",
  "subraya", "termina", "usa", "valida", "verifica",
];

// R-010.12. También van en el prompt, para que el prompt y el filtro digan lo mismo.
export const PALABRAS_SEGUNDA_ACCION: readonly string[] = ["después", "luego", "además", "por último"];

// R-010.13. Frases, no raíces: cada conjugación que se usa va en la lista. "ya terminaste" y "terminaste de" solo dicen que
// terminó, sin decir qué se ve.
export const CRITERIOS_VAGOS: readonly string[] = [
  "te sientas", "sientas", "sientes", "sentirte", "creas", "crees", "consideres", "parezca", "pienses", "piensas", "tengas claro", "tienes claro",
  "quede bien", "queda bien", "quedó bien", "esté bien", "está bien", "lo mejor posible", "ya terminaste", "terminaste de",
];
const MIN_CRITERIO = 12;

// R-010.14.
export const VERBOS_INICIO: readonly string[] = ["abre", "crea", "escribe", "copia", "pega", "nombra", "guarda", "entra"];
export const VERBOS_NO_INICIO: readonly string[] = ["piensa", "planea", "decide", "organiza", "analiza", "reflexiona", "pensar", "planear", "decidir", "organizar", "analizar", "reflexionar"];

// R-010.16.
export const PALABRAS_URGENCIA: readonly string[] = ["urgente", "apúrate", "rápido", "de inmediato", "cuanto antes", "ya mismo", "temporizador", "cronómetro", "sin falta"];

// Frase completa sobre texto normalizado: sin letra o dígito pegado a los lados.
const comoFrase = (frase: string) => new RegExp(`(?<![\\p{L}\\p{N}])${normalizar(frase)}(?![\\p{L}\\p{N}])`, "u");
const SEGUNDA_ACCION = PALABRAS_SEGUNDA_ACCION.map(comoFrase);
const PATRONES_VAGOS = CRITERIOS_VAGOS.map(comoFrase);
const PATRONES_URGENCIA = PALABRAS_URGENCIA.map((palabra) => ({ palabra, patron: comoFrase(palabra) }));

// Un verbo también cuenta con un pronombre pegado: "guárdalo", "envíale".
const PRONOMBRE = /(?:melo|telo|selo|noslo|los|las|les|nos|lo|la|le|me|te|se)$/;
function esVerbo(palabra: string, verbos: ReadonlySet<string>): boolean {
  return verbos.has(palabra) || verbos.has(palabra.replace(PRONOMBRE, ""));
}
const conjunto = (lista: readonly string[]) => new Set(lista.map(normalizar));
const SET_ACCION = conjunto(VERBOS_ACCION);
const SET_INICIO = conjunto(VERBOS_INICIO);
const SET_NO_INICIO = conjunto(VERBOS_NO_INICIO);

const palabrasDe = (normal: string): readonly string[] => normal.match(/[\p{L}\p{N}]+/gu) ?? [];

// R-010.12: una palabra de VERBOS_ACCION después de estas es sustantivo ("tu firma", "hoja de copia", "lo que revisa").
const ANTES_DE_UN_NOMBRE: ReadonlySet<string> = new Set(["el", "la", "los", "las", "lo", "un", "una", "unos", "unas", "tu", "tus", "su", "sus", "mi", "mis", "este", "esta", "ese", "esa", "de", "del", "al", "que"]);
// R-010.12: también son adjetivos ("la lista completa", "una firma valida"). Solo cuentan justo después del separador.
const VERBOS_QUE_SON_ADJETIVO: ReadonlySet<string> = new Set(["completa", "valida"]);

// R-010.17: con qué puede empezar una oración de un criterio de terminado sin nombrar nada de afuera. Un criterio no empieza
// con un verbo en imperativo, así que una herramienta inventada cabe ahí: "Jira muestra el ticket". Lista cerrada; lo que no
// esté aquí ni en la entrada cuenta como ajeno y provoca el reintento, y lo demás lo cubre el eval.
const INICIO_DE_CRITERIO: ReadonlySet<string> = conjunto([
  "el", "la", "los", "las", "lo", "un", "una", "unos", "unas", "tu", "tus", "su", "sus", "mi", "mis", "este", "esta", "esto", "estos", "estas", "ese", "esa", "eso", "esos", "esas",
  "cada", "todo", "toda", "todos", "todas", "ambos", "ambas", "ningún", "ninguna", "ninguno", "nada", "algo", "otro", "otra", "otros", "otras", "varios", "varias",
  "ya", "se", "te", "le", "les", "me", "nos", "hay", "sí", "si", "no", "cuando", "mientras", "aunque", "como", "donde", "que", "quien",
  "en", "con", "de", "del", "al", "a", "para", "por", "sin", "sobre", "entre", "desde", "hasta", "tras", "ante", "bajo", "según", "durante", "antes", "después", "ahora", "aquí", "ahí", "allí",
  "está", "están", "es", "son", "fue", "queda", "quedan", "quedó", "aparece", "aparecen", "ves", "ve", "puedes", "tienes", "tiene", "tienen", "sabes", "conoces", "cuentas", "lees", "recibes", "confirmas", "logras", "sale", "salen", "muestra", "muestran",
  "dice", "dicen", "existe", "existen", "contiene", "contienen", "lleva", "llevan", "incluye", "incluyen", "encuentras", "encuentra",
  "archivo", "archivos", "documento", "documentos", "reporte", "reportes", "carpeta", "carpetas", "lista", "listas", "tabla", "tablas", "hoja", "hojas", "correo", "correos", "mensaje", "mensajes",
  "nota", "notas", "título", "títulos", "nombre", "nombres", "fecha", "fechas", "ticket", "tickets", "pantalla", "pantallas", "pendiente", "pendientes", "paso", "pasos", "tarea", "tareas",
  "texto", "textos", "dato", "datos", "formato", "formatos", "plantilla", "plantillas", "registro", "registros", "resultado", "resultados", "equipo", "líder", "cliente", "clientes", "página", "páginas", "sistema", "sesión",
]);
// "Guardaste", "Terminaste", "Guardado", "Enviada": lo que ya hizo, en cualquier verbo.
const FORMA_DE_VERBO_HECHO = /(?:aste|iste|ado|ada|ados|adas|ido|ida|idos|idas)$/;

// ---------------------------------------------------------------------------
// Lo que no puede llegar a la persona (R-010.15)
// ---------------------------------------------------------------------------

// revisarTextoPersona más los términos clínicos, en cada forma del texto, para que "Tengo_TDAH", "neuro-divergente" o
// "T.D.A.H." no lo esquiven (R-009.24). Lista vacía de citas: el modelo no recibe ninguna (decisión abierta 2).
export function revisarTextoDesglose(texto: string): string[] {
  const hallazgos = enCadaForma(texto, (forma) => revisarTextoPersona(forma, []).map((h) => h.termino));
  return [...new Set([...hallazgos, ...buscarClinicos(texto), ...buscarInternosCercanos(texto)])];
}

// R-010.15: la excepción es una lista cerrada de palabras con otro sentido en el trabajo, y compara lo que aparece en el texto,
// no la etiqueta: "nivel de apoyo" no excusa "grado de autismo", aunque las dos tengan la misma etiqueta. Una condición o una
// severidad (TDAH, dislexia, autismo, TEA, Asperger, neurodivergente, grado de autismo, alto funcionamiento, nivel 2) nunca se
// excusa, así que escribirla en la tarea no abre el filtro (C-01, R-010.7). Sobre texto normalizado y sin letra o dígito pegado,
// porque "_" sí cuenta como letra para \b: "mi_diagnóstico" también es de la lista.
const conLimites = (patron: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${patron})(?![\\p{L}\\p{N}])`, "gu");
const EXCEPCION_LABORAL: readonly RegExp[] = [
  "diagnosti(?:c|qu)[\\p{L}\\p{N}]*",
  "espectros?",
  "cedulas?",
  "pacientes?",
  "nivel(?:es)? de apoyo",
  "planeacion(?:es)?",
  "flexibilidad(?:es)?",
  "monitoreos? de tareas",
  "organizacion(?:es)? de materiales",
].map(conLimites);

const formasNormales = (texto: string) => formasDeComparacion(texto).todas.map(normalizar);

// Las de la lista que escribió la persona.
function excepcionesDe(textoPersona: readonly string[]): RegExp[] {
  const suyo = textoPersona.flatMap(formasNormales);
  return EXCEPCION_LABORAL.filter((patron) => suyo.some((forma) => forma.search(patron) >= 0));
}

// Lo que cuenta en un texto después de quitarle lo que se excusa. "TEA" solo se busca en mayúsculas y nunca se excusa: se
// conserva del texto original, porque normalizar lo pierde.
function terminosSinExcepcion(texto: string, excepciones: readonly RegExp[]): string[] {
  const hallazgos = revisarTextoDesglose(texto);
  if (hallazgos.length === 0 || excepciones.length === 0) return hallazgos;
  const sinExcusa = formasNormales(texto).flatMap((forma) => revisarTextoDesglose(excepciones.reduce((resto, patron) => resto.replace(patron, " "), forma)));
  return [...new Set([...hallazgos.filter((h) => h === "TEA"), ...sinExcusa])];
}

// R-010.24: llaves que el modelo recibe y que la persona no lee, escritas dentro de un texto. A-nn y S-nn con dos dígitos, como
// los arma el código ("hoja A-4" es texto común) y, con espacio, solo en mayúsculas y con cero ("A 15 minutos" también). No
// busca "iniciar", "ordenar" ni "estimar": son verbos que un paso usa. No forma parte de revisarTextoDesglose porque un código
// así puede ser de la tarea ("el formato A-12") y eso no se le bloquea al coach ni a una plantilla: solo corre sobre lo que
// escribe el modelo.
const LLAVES_INTERNAS: readonly RegExp[] = [
  /(?<![\p{L}\p{N}])[AS][-_]\d{2,}(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])[AS] 0\d(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])(?:cambiar[-_]de[-_]tarea|apoyo[-_]fe)(?![\p{L}\p{N}])/iu,
];

export function buscarLlavesInternas(texto: string): string[] {
  return enCadaForma(texto, (forma) => LLAVES_INTERNAS.flatMap((patron) => patron.exec(forma)?.[0] ?? []));
}

// La misma llave con cualquier separador: "A-03" y "a_03" son una sola.
const claveDeLlave = (llave: string) => llave.toLowerCase().replace(/[-_ ]/g, "");

// Las llaves de un texto que no venían en lo que se pidió: un "formato A-12" escrito en la tarea no es una llave interna.
function llavesFueraDelPedido(texto: string, pedido: readonly string[]): string[] {
  const delPedido = new Set(pedido.flatMap(buscarLlavesInternas).map(claveDeLlave));
  return buscarLlavesInternas(texto).filter((llave) => !delPedido.has(claveDeLlave(llave)));
}

// R-010.16. En cada forma, por lo mismo.
export function buscarUrgencia(texto: string): string[] {
  return enCadaForma(texto, (forma) => {
    const normal = normalizar(forma);
    return PATRONES_URGENCIA.filter((p) => p.patron.test(normal)).map((p) => p.palabra);
  });
}

// R-010.40: el nombre de pila de la persona de origen, por palabra completa y en cada forma del texto. De un nombre
// compuesto cuenta cada parte, sin las partículas, que le pasarían a casi cualquier frase.
const PARTICULAS_NOMBRE: ReadonlySet<string> = new Set(["de", "del", "la", "las", "los", "y"]);
// "renatita" y "luisito": sin la vocal final, más un diminutivo. Por sufijo fijo, porque un prefijo daría falsos positivos: a
// un "Tomás" le bloquearía "tomaste la nota".
const esDiminutivo = (palabra: string, parte: string) => {
  if (parte.length < 3) return false;
  const raiz = parte.replace(/[aeiou]$/, "");
  return palabra.startsWith(raiz) && /^(?:c?it[oa]s?|ill[oa]s?)$/.test(palabra.slice(raiz.length));
};
// "RenataReporte": cada palabra pegada con mayúscula cuenta por separado.
const sinPegar = (forma: string) => forma.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
export function tieneNombre(texto: string, nombrePila: string): boolean {
  const partes = palabrasDe(normalizar(nombrePila)).filter((p) => p.length >= 2 && !PARTICULAS_NOMBRE.has(p));
  return enCadaForma(texto, (forma) => palabrasDe(normalizar(sinPegar(forma))).filter((p) => partes.some((parte) => p === parte || esDiminutivo(p, parte)))).length > 0;
}

// Textos literales de "Pantallas y textos". También son el mensaje del 400 (R-010.1, R-010.40).
export const mensajeBloqueoCoach = (nombre: string, termino: string) => `Este texto no puede llegar a ${nombre}: «${termino}». Corrígelo para preparar los pasos.`;
export const mensajeBloqueoPlantilla = (termino: string) => `Este texto no puede ir en una plantilla: «${termino}». Corrígelo para guardar.`;

// ---------------------------------------------------------------------------
// validarPasos (R-010.12 a R-010.17)
// ---------------------------------------------------------------------------

function esAccionMultiple(accion: string): boolean {
  if (accion.includes(";")) return true;
  // normalizar junta los espacios: un salto de línea se revisa antes, porque es otra oración.
  if (/[\r\n]/.test(accion.trim())) return true;
  const normal = normalizar(accion);
  // normalizar ya recortó el punto final: un signo seguido de más texto es otra oración.
  if (/[.!?…]\s+\S/u.test(normal)) return true;
  if (SEGUNDA_ACCION.some((p) => p.test(normal))) return true;
  // Todo el tramo después del primer " y ", " e ", " o " o coma, no solo su primera palabra: "y ahí escribe el título".
  const separador = normal.search(/\s[yeo]\s|,/u);
  if (separador < 0) return false;
  const tramo = palabrasDe(normal.slice(separador));
  return tramo.some((palabra, k) => {
    if (!esVerbo(palabra, SET_ACCION)) return false;
    // Justo después del separador cuenta siempre, como antes.
    if (k === 0 || (k === 1 && /^[yeo]$/.test(tramo[0]!))) return true;
    return !ANTES_DE_UN_NOMBRE.has(tramo[k - 1]!) && !VERBOS_QUE_SON_ADJETIVO.has(palabra);
  });
}

// Lo que dice que el paso falla en R-010.14.
export function problemasDeInicio(paso: Pick<PasoPropuesto, "accion" | "apoyoRef">, refsConIniciar: ReadonlySet<string>): ProblemaPaso[] {
  const problemas: ProblemaPaso[] = [];
  const palabras = palabrasDe(normalizar(paso.accion));
  const empiezaBien = palabras.length > 0 && esVerbo(palabras[0]!, SET_INICIO);
  // "Crea un plan" sigue siendo planear. "Abre tu plan" sí es concreto: ya existe.
  const creaUnPlan = palabras[0] === "crea" && palabras.includes("plan");
  if (!empiezaBien || creaUnPlan || palabras.some((p) => esVerbo(p, SET_NO_INICIO))) problemas.push("inicio_no_concreto");
  if (paso.apoyoRef === null || !refsConIniciar.has(paso.apoyoRef.trim())) problemas.push("inicio_sin_apoyo");
  return problemas;
}

const esInicioDeCriterio = (palabra: string) => INICIO_DE_CRITERIO.has(palabra) || SET_ACCION.has(palabra) || FORMA_DE_VERBO_HECHO.test(palabra);

// R-010.17: URL o correo, y palabra con mayúscula que no inicia oración. Lo que sí aparece en la entrada del modelo es de
// ella. Lo que sigue a ":" no inicia oración, y una palabra seguida de ":" tampoco es un verbo ("Jira: abre el tablero"). En
// un criterio, además, la primera palabra de una oración tiene que ser común (esCriterio).
function hayEntidadAjena(texto: string, entrada: { normal: string; palabras: ReadonlySet<string> }, esCriterio = false): boolean {
  const limpia = formasDeComparacion(texto).limpia;
  const enlaces = new RegExp(ENLACE.source, "gu");
  for (const [enlace] of limpia.matchAll(enlaces)) {
    if (!entrada.normal.includes(normalizar(enlace))) return true;
  }
  for (const m of limpia.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (!/\p{Lu}/u.test(m[0])) continue;
    const antes = limpia.slice(0, m.index).trimEnd();
    const iniciaOracion = antes === "" || /[.!?¿¡…]["'»”)]*$/u.test(antes);
    const esRotulo = /^\s*:/.test(limpia.slice(m.index + m[0].length));
    const palabra = normalizar(m[0]);
    if (iniciaOracion && !esRotulo && (!esCriterio || esInicioDeCriterio(palabra))) continue;
    if (!entrada.palabras.has(palabra)) return true;
  }
  return false;
}

function indiceDeEntrada(entradaModelo: string) {
  const normal = normalizar(entradaModelo);
  return { normal, palabras: new Set(palabrasDe(normal)) };
}

export type PasoParaValidar = {
  accion: string;
  criterioTerminado: string;
  notaApoyo?: string | null;
  apoyoRef?: string | null;
};

export type OpcionesValidacion = {
  // Lo que escribió la persona (tarea y contexto de su pedido): la excepción de R-010.15 y R-010.16. Vacío la quita.
  textoPersona: readonly string[];
  // El mensaje que recibió el modelo. Sin él no corre R-010.17.
  entradaModelo?: string;
  // Lo que se pidió, sin importar quién lo escribió: una llave de aquí no cuenta. Sin él no corre R-010.24, que es para lo
  // que escribe el modelo: una plantilla la escribe el coach.
  pedido?: readonly string[];
  // Los A-nn con la adaptación iniciar, solo si perfilMarcaIniciacion da verdadero. Sin él no corre R-010.14.
  exigirInicio?: ReadonlySet<string>;
};

export type ProblemaDePaso = { paso: number; problema: ProblemaPaso };

// Devuelve los problemas por número de paso, empezando en 1 y sin repetir. Sin texto de la tarea: esto vuelve al modelo.
export function validarPasos(pasos: readonly PasoParaValidar[], { textoPersona, entradaModelo, pedido, exigirInicio }: OpcionesValidacion): ProblemaDePaso[] {
  const excepciones = excepcionesDe(textoPersona);
  const urgenciaDeLaPersona = new Set(textoPersona.flatMap(buscarUrgencia));
  const entrada = entradaModelo === undefined ? null : indiceDeEntrada(entradaModelo);

  return pasos.flatMap((paso, i) => {
    const problemas = new Set<ProblemaPaso>();
    const textos = [paso.accion, paso.criterioTerminado];

    // R-010.12
    if (esAccionMultiple(paso.accion)) problemas.add("accion_multiple");

    // R-010.13
    const criterio = normalizar(paso.criterioTerminado);
    if (paso.criterioTerminado.trim().length < MIN_CRITERIO || PATRONES_VAGOS.some((p) => p.test(criterio))) problemas.add("criterio_vago");
    if (criterio === normalizar(paso.accion)) problemas.add("criterio_igual_a_accion");

    // R-010.14
    if (i === 0 && exigirInicio) {
      for (const problema of problemasDeInicio({ accion: paso.accion, apoyoRef: paso.apoyoRef ?? null }, exigirInicio)) problemas.add(problema);
    }

    // R-010.15 y R-010.16: la excepción solo cubre lo que escribió la persona, y en R-010.15 solo la lista cerrada.
    if (textos.some((t) => terminosSinExcepcion(t, excepciones).length > 0)) problemas.add("texto_no_permitido");
    if (textos.some((t) => buscarUrgencia(t).some((h) => !urgenciaDeLaPersona.has(h)))) problemas.add("urgencia");

    // R-010.24
    if (pedido && textos.some((t) => llavesFueraDelPedido(t, pedido).length > 0)) problemas.add("texto_no_permitido");

    // R-010.17: un paso con su nota, si trae.
    const ajena = entrada && (hayEntidadAjena(paso.criterioTerminado, entrada, true) || [paso.accion, ...(paso.notaApoyo ? [paso.notaApoyo] : [])].some((t) => hayEntidadAjena(t, entrada)));
    if (ajena) problemas.add("entidad_ajena");

    return [...problemas].map((problema) => ({ paso: i + 1, problema }));
  });
}

// ---------------------------------------------------------------------------
// limpiarPasos (R-010.20 a R-010.22, R-010.24)
// ---------------------------------------------------------------------------

export type ResultadoPasos = { pasos: PasoDesglose[]; descartados: DescartadoDesglose[] };

// Decide la nota de un paso. Sin excepción por el texto de la tarea, y sin citas: el modelo no recibe ninguna.
function notaDelPaso(paso: PasoPropuesto, apoyos: ReadonlyMap<string, Apoyo>): { nota: Pick<PasoDesglose, "notaApoyo" | "porQue" | "origen"> | null; motivo: DescartadoDesglose["motivo"] | null } {
  if (paso.notaApoyo === null || paso.notaApoyo.trim() === "") return { nota: null, motivo: null };
  const notaApoyo = paso.notaApoyo.trim();
  if (paso.apoyoRef === null) return { nota: null, motivo: "nota_sin_apoyo" };
  const apoyo = apoyos.get(paso.apoyoRef.trim());
  if (!apoyo) return { nota: null, motivo: "apoyo_no_existe" };
  const conTermino = [notaApoyo, apoyo.porQue].some((t) => revisarTextoDesglose(t).length > 0 || buscarUrgencia(t).length > 0);
  // R-010.24: solo en la nota, que la escribió el modelo. porQue lo arma el código con lo que la persona ya puede leer.
  if (conTermino || buscarLlavesInternas(notaApoyo).length > 0) return { nota: null, motivo: "nota_con_termino" };
  return { nota: { notaApoyo, porQue: apoyo.porQue, origen: apoyo.origen }, motivo: null };
}

export function limpiarPasos(propuestos: readonly PasoPropuesto[], { apoyos, nuevoId = () => crypto.randomUUID() }: { apoyos: readonly Apoyo[]; nuevoId?: () => string }): ResultadoPasos {
  const indice = new Map(apoyos.map((a) => [a.ref, a]));
  const descartados: DescartadoDesglose[] = [];
  const pasos = propuestos.map((paso, i) => {
    const { nota, motivo } = notaDelPaso(paso, indice);
    if (motivo) descartados.push({ ruta: `pasos[${i}].notaApoyo`, motivo });
    return PasoDesglose.parse({
      id: nuevoId(),
      accion: paso.accion.trim(),
      criterioTerminado: paso.criterioTerminado.trim(),
      notaApoyo: nota?.notaApoyo ?? null,
      porQue: nota?.porQue ?? null,
      origen: nota?.origen ?? null,
      minutos: paso.minutos,
    });
  });
  return { pasos, descartados };
}
