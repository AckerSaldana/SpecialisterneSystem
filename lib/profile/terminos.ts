// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Búsqueda de texto que no debe llegar a la persona (funciones puras, sin red ni base; también
// corre en el navegador del coach, nunca en el de la persona: trae los nombres de dominios y señales, C-09).
// Es el único lugar con estas reglas: lo usan lib/profile/validate.ts, lib/plan/validate.ts,
// lib/followup/validate.ts, lib/guia/terminos.ts, lib/desglose/validate.ts, la revisión de la propuesta y
// la ruta de decisión (R-004.59, misma regla que R-003.30).
import { DOMINIOS_FE, SENALES } from "@/lib/profile/schema";

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

// Comillas y signos que se recortan de los bordes de una cita.
const BORDES = /^[\s"'«»“”‘’`.,;:!?¡¿()[\]{}…-]+|[\s"'«»“”‘’`.,;:!?¡¿()[\]{}…-]+$/g;

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos y diéresis (la ñ queda como n)
    .toLowerCase()
    .replace(/[“”«»„]/g, '"') // todas las comillas dobles iguales
    .replace(/[‘’‚`]/g, "'") // todas las comillas simples iguales
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(BORDES, "");
}

// Largo mínimo de una cita ya normalizada.
export const MIN_CITA = 8;

const LETRA_O_DIGITO = /[\p{L}\p{N}]/u;

// true si "cita" aparece en "nota" con límites de palabra. Ambas ya normalizadas.
// Revisa cada aparición: basta una que no tenga letra o dígito pegado a los lados.
export function citaEnNota(cita: string, nota: string): boolean {
  if (cita.length < MIN_CITA) return false;
  for (let i = nota.indexOf(cita); i !== -1; i = nota.indexOf(cita, i + 1)) {
    const antes = nota[i - 1] ?? "";
    const despues = nota[i + cita.length] ?? "";
    if (!LETRA_O_DIGITO.test(antes) && !LETRA_O_DIGITO.test(despues)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Términos no permitidos
// ---------------------------------------------------------------------------

// Se buscan sobre el texto normalizado (sin acentos, minúsculas).
// "nivel" y "grado" solo cuentan junto a palabras de severidad: "nivel de inglés" no es bandera.
const TERMINOS: { termino: string; patron: RegExp }[] = [
  { termino: "diagnóstico", patron: /\bdiagnostic\w*/ }, // diagnóstico, diagnosticar, diagnosticada
  { termino: "trastorno", patron: /\btrastornos?\b/ },
  { termino: "asperger", patron: /\basperger\b/ },
  { termino: "autismo leve/moderado/severo", patron: /\bautismo (leve|moderado|severo)\b/ },
  { termino: "nivel 1/2/3", patron: /\bnivel (1|2|3|uno|dos|tres)\b/ },
  {
    termino: "nivel o grado de autismo/apoyo/severidad/funcionamiento",
    patron: /\b(nivel|niveles|grado|grados) de (autismo|apoyo|severidad|funcionamiento)\b/,
  },
  { termino: "alto/bajo funcionamiento", patron: /\b(alto|bajo) funcionamiento\b/ },
  { termino: "paciente", patron: /\bpacientes?\b/ },
  { termino: "debilidad", patron: /\bdebilidad(es)?\b/ },
  { termino: "déficit", patron: /\bdeficits?\b/ },
  { termino: "síntoma", patron: /\bsintomas?\b/ },
];

// "TEA" se busca en el texto original y solo en mayúsculas, para no confundirlo con otras palabras.
const SIGLA_TEA = /\bTEA\b/;

export function buscarTerminos(texto: string): string[] {
  const normal = normalizar(texto);
  const encontrados = TERMINOS.filter((t) => t.patron.test(normal)).map((t) => t.termino);
  if (SIGLA_TEA.test(texto)) encontrados.push("TEA");
  return encontrados;
}

const PALABRA_ESCRITA = /[\p{L}\p{N}\p{M}]+/gu;

// R-009.25: lo que coincidió de un término de TERMINOS, como está escrito en el texto. La etiqueta de la lista es para el coach
// y para el código: "nivel o grado de autismo/apoyo/severidad/funcionamiento" le diría a la persona que escribió palabras que
// no escribió. Un término fuera de TERMINOS se devuelve igual, porque su etiqueta ya es la palabra.
export function fragmentoDelTermino(texto: string, termino: string): string {
  const entrada = TERMINOS.find((t) => t.termino === termino);
  if (!entrada) return termino;
  for (const forma of formasDeComparacion(texto).todas) {
    const coincidencia = entrada.patron.exec(normalizar(forma));
    if (coincidencia) return tramoEscrito(texto, coincidencia[0]);
  }
  return termino;
}

// El tramo normalizado, con los acentos y las mayúsculas de quien lo escribió. Con un carácter raro en medio no se puede
// ubicar, y se queda normalizado.
function tramoEscrito(texto: string, tramo: string): string {
  const buscadas = tramo.match(/[\p{L}\p{N}]+/gu) ?? [];
  const palabras = [...texto.matchAll(PALABRA_ESCRITA)];
  for (let i = 0; i + buscadas.length <= palabras.length; i++) {
    if (buscadas.every((b, j) => normalizar(palabras[i + j]![0]) === b)) {
      const ultima = palabras[i + buscadas.length - 1]!;
      return texto.slice(palabras[i]!.index, ultima.index + ultima[0].length);
    }
  }
  return tramo;
}

// ---------------------------------------------------------------------------
// Condiciones, términos internos y citas copiadas
// ---------------------------------------------------------------------------

// Decisión 9 (a) de 003: lista corta de nombres de condiciones que buscarTerminos no cubre siempre
// (buscarTerminos solo marca "autismo" con leve, moderado o severo). La lista larga es una
// pregunta para el partner.
export const TERMINOS_CONDICION: readonly string[] = ["autismo", "autista", "TEA", "Asperger"];

// Cómo se busca cada término de TERMINOS_CONDICION, sobre el texto normalizado (sin acentos,
// minúsculas) y por palabra completa, con plural y variantes cercanas.
const PATRONES_CONDICION: { termino: string; patron: RegExp }[] = [
  { termino: "autismo", patron: /\bautismos?\b/ },
  { termino: "autista", patron: /\b(autistas?|autistic[oa]s?)\b/ },
  { termino: "Asperger", patron: /\baspergers?\b/ },
];

// Palabras que la persona no debe leer (C-09): etiquetas de DOMINIOS_FE, etiquetas de SENALES
// (como R-005.18) y "función ejecutiva". Se buscan normalizadas y por palabra completa. También sus
// ids, porque el modelo los recibe y puede escribirlos (R-008.40): "planeacion_organizacion" no se
// parece a su etiqueta. Una coincidencia con el id se reporta con la etiqueta, para que el resto del
// código la trate igual.
const TERMINOS_INTERNOS: { termino: string; id?: string }[] = [
  ...DOMINIOS_FE.map((d) => ({ termino: d.etiqueta, id: d.id })),
  ...SENALES.map((s) => ({ termino: s.etiqueta, id: s.id })),
  { termino: "función ejecutiva" },
  { termino: "funciones ejecutivas" },
];

// Escapa un texto para usarlo dentro de una expresión regular.
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Une las palabras de un término con el separador dado.
const conSeparador = (texto: string, separador: string) => texto.split(/[ _]/).map(escapar).join(separador);

// Patrón de "palabra completa" que también sirve para frases: no puede haber una letra o un
// dígito pegado antes o después. Una etiqueta vale con espacios, "_" o "-" entre sus palabras
// ("funcion-ejecutiva"). Un id solo con "_" o "-": "cambio de vida" escrito con espacios es texto
// común, y su etiqueta es "Cambios de vida". Se arma una vez por término.
const PATRONES_INTERNOS = TERMINOS_INTERNOS.map(({ termino, id }) => {
  const formas = [conSeparador(normalizar(termino), "[ _-]+"), ...(id ? [conSeparador(id, "[_-]+")] : [])];
  return { termino, patron: new RegExp(`(?<![\\p{L}\\p{N}])(?:${formas.join("|")})(?![\\p{L}\\p{N}])`, "u") };
});

export function buscarCondiciones(texto: string, yaMarcados: string[]): string[] {
  const normal = normalizar(texto);
  const encontrados = PATRONES_CONDICION.filter((t) => t.patron.test(normal)).map((t) => t.termino);
  if (SIGLA_TEA.test(texto)) encontrados.push("TEA");
  // Si buscarTerminos ya marcó el mismo término en este campo (p. ej. "asperger", "TEA" o
  // "autismo leve/moderado/severo"), no se repite como mencion_condicion: una sola bandera basta.
  const marcados = yaMarcados.map(normalizar);
  return encontrados.filter((t) => !marcados.some((m) => m.includes(normalizar(t))));
}

export function buscarInternos(texto: string): string[] {
  const normal = normalizar(texto);
  return PATRONES_INTERNOS.filter((t) => t.patron.test(normal)).map((t) => t.termino);
}

// Citas que aparecen completas en el texto (con límites de palabra). Una misma cita puede venir de
// varios elementos de la propuesta y cuenta una vez.
export function citasCopiadas(texto: string, citas: string[]): string[] {
  const normal = normalizar(texto);
  const vistas = new Set<string>();
  return citas.filter((c) => {
    const cita = normalizar(c);
    if (vistas.has(cita) || !citaEnNota(cita, normal)) return false;
    vistas.add(cita);
    return true;
  });
}

// R-004.59: cuántas palabras seguidas iguales a una fuente cuentan como copiadas. Con 5 ya caen frases comunes
// que no delatan la nota, como "la causa de una falla". Un parafraseo o un orden distinto no se detecta.
export const MIN_PALABRAS_COPIADAS = 6;

const palabrasDe = (texto: string) => normalizar(texto).match(/[\p{L}\p{N}]+/gu) ?? [];

// Los tramos de MIN_PALABRAS_COPIADAS o más palabras seguidas que el texto comparte con alguna fuente, como están
// escritos en el texto. Cruza puntuación: "se queda en silencio, aprieta las manos" cuenta como una sola frase.
export function pedazosCopiados(texto: string, fuentes: string[]): string[] {
  const clave = (palabras: string[], i: number) => palabras.slice(i, i + MIN_PALABRAS_COPIADAS).join(" ");
  const enFuentes = new Set<string>();
  for (const fuente of fuentes) {
    const palabras = palabrasDe(fuente);
    for (let i = 0; i + MIN_PALABRAS_COPIADAS <= palabras.length; i++) enFuentes.add(clave(palabras, i));
  }

  const palabras = palabrasDe(texto);
  const pedazos: string[] = [];
  let i = 0;
  while (i + MIN_PALABRAS_COPIADAS <= palabras.length) {
    if (!enFuentes.has(clave(palabras, i))) {
      i++;
      continue;
    }
    // Junta los tramos que se enciman en uno solo, también si vienen de fuentes distintas.
    let fin = i + MIN_PALABRAS_COPIADAS;
    for (let j = i + 1; j < fin; j++) if (enFuentes.has(clave(palabras, j))) fin = j + MIN_PALABRAS_COPIADAS;
    pedazos.push(tramoEscrito(texto, palabras.slice(i, fin).join(" ")));
    i = fin;
  }
  return [...new Set(pedazos)];
}

// ---------------------------------------------------------------------------
// Texto que llega a la persona
// ---------------------------------------------------------------------------

export type MotivoTexto = "termino_no_permitido" | "mencion_condicion" | "termino_interno" | "cita_en_texto_persona";

// Lo que impide que un texto llegue a la persona (R-004.59, R-003.30). "citas" son las de la propuesta y las
// del último snapshot; "notas", el texto completo que recibió el modelo, porque también copia lo que no citó.
// Una cita copiada se devuelve completa y un pedazo tal como se lee, para que el coach lo encuentre.
// Un término clínico (TDAH, dislexia, terapia) cuenta como mención de una condición.
export function revisarTextoPersona(texto: string, citas: string[], notas: string[] = []): { termino: string; motivo: MotivoTexto }[] {
  const terminos = buscarTerminos(texto);
  const condiciones = buscarCondiciones(texto, terminos);
  const clinicos = buscarClinicos(texto).filter((t) => !terminos.includes(t) && !condiciones.includes(t));
  // Lo mismo copiado no se reporta dos veces: se queda lo más largo, para que el coach vea todo lo que tiene que cambiar.
  const plano = (t: string) => ` ${palabrasDe(t).join(" ")} `;
  const todasCopiadas = citasCopiadas(texto, citas);
  const todosPedazos = pedazosCopiados(texto, [...citas, ...notas]);
  const copiadas = todasCopiadas.filter((c) => !todosPedazos.some((p) => plano(p) !== plano(c) && plano(p).includes(plano(c))));
  const pedazos = todosPedazos.filter((p) => !todasCopiadas.some((c) => plano(c).includes(plano(p))));
  return [
    ...terminos.map((termino) => ({ termino, motivo: "termino_no_permitido" as const })),
    ...[...condiciones, ...clinicos].map((termino) => ({ termino, motivo: "mencion_condicion" as const })),
    ...buscarInternos(texto).map((termino) => ({ termino, motivo: "termino_interno" as const })),
    ...[...copiadas, ...pedazos].map((termino) => ({ termino, motivo: "cita_en_texto_persona" as const })),
  ];
}

// ---------------------------------------------------------------------------
// Cómo se compara lo que revisan 009 y 010 (R-009.24, R-010.15)
// ---------------------------------------------------------------------------

// normalizar no quita separadores, y \b trata "_" como letra: "mi_TDAH", "neuro-divergente", "T.D.A.H.", un carácter
// invisible en medio o las formas de ancho completo lo esquivarían. Vive aparte de normalizar porque las citas y
// las banderas de seguimiento comparan con guiones y puntos tal cual.
const GUIONES = /[‐-―−﹘﹣－]/gu;
const PUNTO_ENTRE_LETRAS = /(?<=[\p{L}\p{N}])\.(?=[\p{L}\p{N}])/gu;
const LETRAS_SUELTAS = /(?<![\p{L}\p{N}])\p{L}(?: \p{L})+(?![\p{L}\p{N}])/gu;

// Letras cirílicas y griegas que se ven iguales a una latina: "TDАH" con una А cirílica no es "TDAH" para una expresión
// regular. Solo las más comunes. El texto en español no las usa, así que no cambia nada más.
const HOMOGLIFOS: Readonly<Record<string, string>> = {
  а: "a", в: "b", е: "e", і: "i", ј: "j", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", ѕ: "s", һ: "h", ԁ: "d", ԛ: "q", ԝ: "w",
  А: "A", В: "B", Е: "E", І: "I", Ј: "J", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Ѕ: "S", Т: "T", У: "Y", Х: "X",
  α: "a", ε: "e", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x",
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
};
const OTRO_ALFABETO = new RegExp(`[${Object.keys(HOMOGLIFOS).join("")}]`, "gu");
const aLatin = (texto: string) => texto.replace(OTRO_ALFABETO, (letra) => HOMOGLIFOS[letra] ?? letra);

// Conservan las mayúsculas: "TEA" solo cuenta en mayúsculas, también con acento ("TÉA").
//   - limpia: NFKD, sin acentos ni caracteres invisibles, sin letras de otro alfabeto y todos los guiones iguales.
//   - separada: "_", guiones y puntos entre letras como espacio ("mi_TDAH", "memoria.de.trabajo").
//   - compacta: cada palabra sin lo que no es letra o dígito ("neuro-divergente", "T.D.A.H."), y las letras sueltas
//     juntas ("T. D. A. H."). Nunca junta dos palabras separadas por un espacio: "sin tomas" no es "síntomas".
//   - espaciada: todo lo que no es letra o dígito como espacio ("memoria/de/trabajo", "función:ejecutiva"), y un carácter
//     invisible también, porque en limpia se borra y pega las palabras.
export function formasDeComparacion(texto: string): { limpia: string; todas: string[] } {
  const descompuesta = texto.normalize("NFKD").replace(/\p{M}/gu, "");
  const limpia = aLatin(descompuesta.replace(/\p{Cf}/gu, "")).replace(GUIONES, "-");
  const separada = limpia.replace(/[_-]+/g, " ").replace(PUNTO_ENTRE_LETRAS, " ");
  const espaciada = aLatin(descompuesta).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const compacta = limpia
    .split(/\s+/)
    .map((palabra) => palabra.replace(/[^\p{L}\p{N}]/gu, ""))
    .join(" ")
    .replace(LETRAS_SUELTAS, (letras) => letras.replaceAll(" ", ""));
  return { limpia, todas: [...new Set([texto, limpia, separada, compacta, espaciada])] };
}

export const enCadaForma = (texto: string, buscar: (forma: string) => string[]) => [...new Set(formasDeComparacion(texto).todas.flatMap(buscar))];

// ---------------------------------------------------------------------------
// Términos clínicos (R-009.24, R-010.15, R-004.59, R-003.30).
// ---------------------------------------------------------------------------

// R-009.24 (decisión abierta 3, opción A): TERMINOS_CONDICION no cubre TDAH ni dislexia. Se buscan sobre el
// texto normalizado (sin acentos, minúsculas), por palabra completa, con plural y variantes cercanas.
const PATRONES_CLINICOS: { termino: string; patron: RegExp }[] = [
  { termino: "TDAH", patron: /\btdah\b/ },
  { termino: "ADHD", patron: /\badhd\b/ },
  // "dis lexia" y "neuro divergente": el error común de escribirlas separadas. Solo estas palabras compuestas, porque juntar
  // palabras en general daría falsos positivos (formasDeComparacion).
  { termino: "dislexia", patron: /\bdis ?(lexias?|lexic[oa]s?)\b/ },
  { termino: "dispraxia", patron: /\bdis ?(praxias?|praxic[oa]s?)\b/ },
  { termino: "discalculia", patron: /\bdis ?(calculias?|calculic[oa]s?)\b/ },
  { termino: "discapacidad", patron: /\bdis ?capacidad(es)?\b|\bdiscapacitad[oa]s?\b/ },
  { termino: "neurodivergente", patron: /\bneuro ?divergentes?\b/ },
  { termino: "neurodivergencia", patron: /\bneuro ?divergencias?\b/ },
  { termino: "neurodiversidad", patron: /\bneuro ?diversidad(es)?\b/ },
  { termino: "neurotípico", patron: /\bneuro ?tipic[oa]s?\b/ },
  { termino: "espectro", patron: /\bespectros?\b/ },
  { termino: "cédula", patron: /\bcedulas?\b/ },
  { termino: "terapia", patron: /\bterapias?\b/ },
  { termino: "terapeuta", patron: /\bterapeutas?\b/ },
  { termino: "psiquiatra", patron: /\bpsiquiatras?\b/ },
  { termino: "psicólogo", patron: /\bpsicologos?\b/ },
  { termino: "psicóloga", patron: /\bpsicologas?\b/ },
  { termino: "neurólogo", patron: /\bneurologos?\b/ },
  { termino: "neuróloga", patron: /\bneurologas?\b/ },
  { termino: "medicamento", patron: /\bmedicamentos?\b/ },
  { termino: "medicación", patron: /\bmedicacion(es)?\b/ },
];

export const TERMINOS_CLINICOS_GUIA: readonly string[] = PATRONES_CLINICOS.map((t) => t.termino);

// Formas cercanas de un término que ya cuenta: "diagnóstico" está en buscarTerminos con diagnostic\w*, que no cubre "te
// diagnostiqué", y buscarTerminos no cambia para 003 y 004. No suman términos a la lista de R-009.24.
const PATRONES_CERCANOS: { termino: string; patron: RegExp }[] = [{ termino: "diagnóstico", patron: /\bdiagnostiqu\w*/ }];

export function buscarClinicos(texto: string): string[] {
  const normales = formasDeComparacion(texto).todas.map(normalizar);
  return [...PATRONES_CLINICOS, ...PATRONES_CERCANOS].filter((t) => normales.some((n) => t.patron.test(n))).map((t) => t.termino);
}

// ---------------------------------------------------------------------------
// Etiquetas de dominio en otra forma (R-010.15). Solo lo que revisa 010.
// ---------------------------------------------------------------------------

// Plurales de las etiquetas, "planeación/organización" sin la "y", y "planeación" sola, que es como muchos escribirían ese
// dominio. buscarInternos no cambia para 003 y 004, y en 009 lo que escribe la persona no se bloquea por esto.
const PATRONES_INTERNOS_CERCANOS: { termino: string; patron: RegExp }[] = [
  { termino: "Memoria de trabajo", patron: /\bmemorias de trabajo\b/ },
  { termino: "Iniciación", patron: /\biniciaciones\b/ },
  { termino: "Inhibición", patron: /\binhibiciones\b/ },
  { termino: "Automonitoreo", patron: /\bautomonitoreos\b/ },
  { termino: "Flexibilidad", patron: /\bflexibilidades\b/ },
  { termino: "Control emocional", patron: /\bcontroles emocionales\b/ },
  { termino: "Monitoreo de tareas", patron: /\bmonitoreos de tareas\b/ },
  { termino: "Organización de materiales", patron: /\borganizaciones de materiales\b/ },
  { termino: "Planeación y organización", patron: /\bplaneacion(es)? (y )?organizacion(es)?\b/ },
  { termino: "Planeación", patron: /\bplaneacion(es)?\b/ },
];

export function buscarInternosCercanos(texto: string): string[] {
  const normales = formasDeComparacion(texto).todas.map(normalizar);
  return PATRONES_INTERNOS_CERCANOS.filter((t) => normales.some((n) => t.patron.test(n))).map((t) => t.termino);
}

// R-011.20: el resumen lo lee la persona y no debe decir quién observó. El código no distingue "su líder le avisa" de
// una opinión en todos los casos, así que esto solo avisa al coach; no bloquea.
const CARGO = "(?:lider|mentora?|jefe|jefa|supervisora?|coach)";
const ATRIBUCION = new RegExp(
  `\\b${CARGO}\\b[^.;]{0,30}\\b(?:opina|dice|dijo|cree|conto|considera|piensa|comenta|comento|noto|observo|senala|senalo)\\b|\\bsegun\\b[^.;]{0,30}\\b${CARGO}\\b`,
);

export function atribuyeObservador(texto: string): boolean {
  return ATRIBUCION.test(normalizar(texto));
}
