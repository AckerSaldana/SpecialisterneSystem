// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Búsqueda de texto que no debe llegar a la persona (funciones puras, sin red ni base; también
// corre en el navegador). Es el único lugar con estas reglas: lo usan lib/profile/validate.ts,
// lib/plan/validate.ts, lib/followup/validate.ts, la revisión de la propuesta y la ruta de decisión
// (R-004.59, misma regla que R-003.30).
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
// (como R-005.18) y "función ejecutiva". Se buscan normalizadas y por palabra completa.
const TERMINOS_INTERNOS: string[] = [
  ...DOMINIOS_FE.map((d) => d.etiqueta),
  ...SENALES.map((s) => s.etiqueta),
  "función ejecutiva",
  "funciones ejecutivas",
];

// Escapa un texto para usarlo dentro de una expresión regular.
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Patrón de "palabra completa" que también sirve para frases: no puede haber una letra o un
// dígito pegado antes o después. Se arma una vez por término.
const PATRONES_INTERNOS = TERMINOS_INTERNOS.map((termino) => ({
  termino,
  patron: new RegExp(`(?<![\\p{L}\\p{N}])${escapar(normalizar(termino))}(?![\\p{L}\\p{N}])`, "u"),
}));

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

// ---------------------------------------------------------------------------
// Texto que llega a la persona
// ---------------------------------------------------------------------------

export type MotivoTexto = "termino_no_permitido" | "mencion_condicion" | "termino_interno" | "cita_en_texto_persona";

// Lo que impide que un texto llegue a la persona (R-004.59). "citas" son las de la propuesta y las
// del último snapshot. Una cita copiada se devuelve completa, para que el coach la encuentre.
export function revisarTextoPersona(texto: string, citas: string[]): { termino: string; motivo: MotivoTexto }[] {
  const terminos = buscarTerminos(texto);
  return [
    ...terminos.map((termino) => ({ termino, motivo: "termino_no_permitido" as const })),
    ...buscarCondiciones(texto, terminos).map((termino) => ({ termino, motivo: "mencion_condicion" as const })),
    ...buscarInternos(texto).map((termino) => ({ termino, motivo: "termino_interno" as const })),
    ...citasCopiadas(texto, citas).map((termino) => ({ termino, motivo: "cita_en_texto_persona" as const })),
  ];
}
