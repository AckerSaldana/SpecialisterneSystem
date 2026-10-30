// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Revisión determinista de lo que propuso el modelo (función pura, sin red ni base).
//
// 1. Citas: cada evidencia.cita tiene que aparecer en la nota del coach. Se comparan
//    versiones normalizadas (minúsculas, sin acentos, espacios colapsados, comillas y
//    puntuación de los bordes recortadas). Además la cita normalizada debe tener al menos
//    8 caracteres y empezar y terminar en límite de palabra (no puede haber una letra o un
//    dígito pegado antes o después en la nota): así no pasan fragmentos como "gus" o
//    "usta trabaj". La que no cumple se quita y se anota en "descartados". Un cambio, señal
//    o relación que se queda sin evidencia se quita completo.
//    Las rutas de "descartados" se refieren a la respuesta ORIGINAL del modelo.
//
// 2. Dimensiones duplicadas: si quedan dos cambios para la misma dimensión, se conserva el
//    primero y los demás se anotan en "descartados" con motivo "dimension_duplicada"
//    (ruta del cambio, cita ""). Así applyApproval nunca sobrescribe un cambio con otro.
//
// 3. Banderas: términos no permitidos en resumen, descripcion y preguntas. No quitan nada;
//    solo avisan al coach. Las rutas de "banderas" se refieren al update YA LIMPIO (el que
//    ve el coach).
import type { Bandera, CambioDimension, Descartado, DimensionId, ProfileUpdate } from "@/lib/profile/schema";

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
// sanitizeUpdate
// ---------------------------------------------------------------------------

export type ResultadoSanitizado = {
  update: ProfileUpdate;
  descartados: Descartado[];
  banderas: Bandera[];
};

export function sanitizeUpdate(update: ProfileUpdate, nota: string): ResultadoSanitizado {
  const notaNormal = normalizar(nota);
  const descartados: Descartado[] = [];

  // Deja solo las citas que están en la nota. "ruta" es la ruta del elemento en la respuesta original.
  function filtrarEvidencia<T extends { evidencia: { cita: string }[] }>(item: T, ruta: string): T | null {
    const evidencia = item.evidencia.filter((e, i) => {
      const esta = citaEnNota(normalizar(e.cita), notaNormal);
      if (!esta) descartados.push({ ruta: `${ruta}.evidencia[${i}]`, cita: e.cita, motivo: "cita_no_encontrada" });
      return esta;
    });
    // Sin evidencia, el elemento no se propone.
    return evidencia.length > 0 ? { ...item, evidencia } : null;
  }

  // Aplica filtrarEvidencia a una lista y quita los elementos que quedaron en null.
  function filtrarLista<T extends { evidencia: { cita: string }[] }>(lista: T[], nombre: string): T[] {
    return lista
      .map((item, i) => filtrarEvidencia(item, `${nombre}[${i}]`))
      .filter((item): item is T => item !== null);
  }

  // Cambios: primero se filtran las citas; luego se conserva solo el primero por dimensión.
  const dimensionesVistas = new Set<DimensionId>();
  const cambios: CambioDimension[] = [];
  update.cambios.forEach((c, i) => {
    const conEvidencia = filtrarEvidencia(c, `cambios[${i}]`);
    if (!conEvidencia) return;
    if (dimensionesVistas.has(conEvidencia.dimension)) {
      descartados.push({ ruta: `cambios[${i}]`, cita: "", motivo: "dimension_duplicada" });
      return;
    }
    dimensionesVistas.add(conEvidencia.dimension);
    cambios.push(conEvidencia);
  });

  const limpio: ProfileUpdate = {
    cambios,
    senales: filtrarLista(update.senales, "senales"),
    relacionesConPerfilPrevio: filtrarLista(update.relacionesConPerfilPrevio, "relacionesConPerfilPrevio"),
    preguntasParaSiguienteSesion: [...update.preguntasParaSiguienteSesion],
  };

  // Banderas sobre el texto que escribió el modelo (no sobre las citas, que son del coach).
  const banderas: Bandera[] = [];
  const revisar = (texto: string, ruta: string) => {
    for (const termino of buscarTerminos(texto)) banderas.push({ ruta, termino, motivo: "termino_no_permitido" });
  };
  limpio.cambios.forEach((c, i) => revisar(c.resumen, `cambios[${i}].resumen`));
  limpio.senales.forEach((s, i) => revisar(s.descripcion, `senales[${i}].descripcion`));
  limpio.relacionesConPerfilPrevio.forEach((r, i) => revisar(r.descripcion, `relacionesConPerfilPrevio[${i}].descripcion`));
  limpio.preguntasParaSiguienteSesion.forEach((p, i) => revisar(p, `preguntasParaSiguienteSesion[${i}]`));

  return { update: limpio, descartados, banderas };
}
