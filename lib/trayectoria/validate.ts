// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Reglas fijas sobre las etiquetas de la spec 008, fuera del LLM (funciones puras, sin red ni base).
// limpiarEtiquetas corre después de sanitizeUpdate o sanitizeFollowup y no quita elementos ni citas:
// por eso las rutas de sus descartes y los índices de evidenciaId son los de la propuesta ya limpia.
// revisarResumen corre sobre la salida del modelo del resumen por dominio, antes de guardar nada.
import { z } from "zod";
import { soloParticipacion } from "@/lib/followup/validate";
import type { Descartado, EntradaIndiceObservacion, EvidenciaEtiquetada, EvidenciaPropuesta } from "@/lib/profile/schema";
import { buscarCondiciones, buscarTerminos, normalizar } from "@/lib/profile/terminos";
import type { EntradaIndiceResumen } from "@/lib/trayectoria/lineas";

type CitaFE = EvidenciaEtiquetada | EvidenciaPropuesta;
type ConEvidencia = { evidencia: CitaFE[] };

// Lo que hace falta de ResultadoSanitizado o ResultadoSeguimiento.
type Resultado = { update: { cambios: ConEvidencia[]; avance?: ConEvidencia[] }; descartados: Descartado[] };

// Orden de R-008.7: (a) sin dominio no hay dirección ni referencia; (b) un "cambio" necesita una
// observación del mismo dominio en el índice; (c) otra dirección no lleva referencia. Luego R-008.8:
// hablar poco no es un área de apoyo, y la cita no entra a la trayectoria como tal.
export function limpiarEtiquetas<R extends Resultado>(resultado: R, indice: EntradaIndiceObservacion[]): R {
  const descartados = [...resultado.descartados];

  function limpiarCita(e: CitaFE, ruta: string): CitaFE {
    // Una cita sin etiquetas viene de un payload viejo. Aquí no llega, porque proponer.ts valida con el
    // esquema etiquetado, pero tampoco se le inventan llaves.
    if (!("dominio" in e)) return e;
    if (e.dominio === null) return { ...e, direccion: null, anteriorRef: null };
    if (e.direccion === "cambio") {
      const anterior = indice.find((o) => o.ref === e.anteriorRef);
      if (anterior?.dominio === e.dominio) return e;
      descartados.push({ ruta, cita: e.cita, motivo: "etiqueta_sin_anterior" });
      return { ...e, direccion: null, anteriorRef: null };
    }
    if (e.direccion === "apoyo" && soloParticipacion([e.cita])) {
      descartados.push({ ruta, cita: e.cita, motivo: "etiqueta_participacion" });
      return { ...e, dominio: null, direccion: null, anteriorRef: null };
    }
    return { ...e, anteriorRef: null };
  }

  function limpiarLista<T extends ConEvidencia>(lista: T[], nombre: string): T[] {
    return lista.map((item, i) => ({
      ...item,
      evidencia: item.evidencia.map((e, j) => limpiarCita(e, `${nombre}[${i}].evidencia[${j}]`)),
    }));
  }

  const { update } = resultado;
  return {
    ...resultado,
    update: {
      ...update,
      cambios: limpiarLista(update.cambios, "cambios"),
      ...(update.avance ? { avance: limpiarLista(update.avance, "avance") } : {}),
    },
    descartados,
  };
}

// ---------------------------------------------------------------------------
// Resumen por dominio (R-008.35, R-008.36, R-008.38)
// ---------------------------------------------------------------------------

// Lo que devuelve el modelo. Estricto: sin campos de puntaje, nivel, severidad ni comparación. Un ref
// malo no lleva patrón aquí: lo rechaza revisarResumen, con su motivo en audit_log.
export const ResumenDominioIA = z.strictObject({
  oracion: z.string().min(1).max(300),
  lineaRefs: z.array(z.string()).min(1).max(10),
});
export type ResumenDominioIA = z.infer<typeof ResumenDominioIA>;

// Sobre el texto normalizado. La lista es interpretación del equipo ("Reglas fijas" de 008). Un número
// escrito cuenta igual que un dígito, aunque salga de una cita: el resumen no lleva frecuencias.
const PATRONES_PUNTAJE: RegExp[] = [
  /\d/,
  /%/,
  /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cien|mil)\b/,
  /\buna (vez|veces)\b/,
  /\bpuntajes?\b/,
  /\bcalificacion(es)?\b/,
  /\bporcentajes?\b/,
  /\bnivel(es)?\b/,
  /\bgrados?\b/,
  /\bseveridad(es)?\b/,
  /\bleves?\b/,
  /\bmoderad/,
  /\bgraves?\b/,
  /\bmejor/,
  /\bpeor/,
  /\bmas que\b/,
  /\bmenos que\b/,
  /\bmayor/,
  /\bmenor/,
];

// "mas" y "menos" solos comparan, salvo que salgan de una cita ("cuando tiene menos tareas").
const COMPARATIVOS = ["mas", "menos"];

// Lista corta y suposición; se pregunta al partner. Un verbo de ser o de atribuir, o "persona" o
// "conducta", seguido de la raíz. Los determinantes y adverbios en medio no la esquivan.
const RAICES_ETIQUETA = "(desorganizad|impulsiv|inflexible|rigid|olvidadiz|distraid|ansios|floj|perezos|incapaz)";
const EN_MEDIO_ETIQUETA = "((un|una|unos|unas|muy|bastante|algo|poco|tan|mas|persona|personas|conducta|conductas),? )*";
const PATRONES_ETIQUETA_PERSONA: RegExp[] = [
  new RegExp(`\\b(es|son|era|eran|fue|fueron|sea|sean|muestra|muestran|mostro|mostraron|tiene|tienen|presenta|presentan) ${EN_MEDIO_ETIQUETA}${RAICES_ETIQUETA}`),
  new RegExp(`\\b(persona|personas|conducta|conductas) ${EN_MEDIO_ETIQUETA}${RAICES_ETIQUETA}`),
];

// Conectores y verbos de reporte, ya normalizados, de 4 letras o más. No hay palabras de frecuencia, de
// grado ni de género ("siempre", "cada", "toda", "algo", "ella", "sola"), ni palabras que describen a
// alguien ("persona", "conducta", "tiene"), ni las que cambian el sentido ("solo", "fuera", "contra"):
// esas tienen que salir de una cita. Si el eval muestra muchos rechazos, se ajusta esta lista antes de
// cambiar la regla (decisión abierta 4).
const PALABRAS_PUENTE = new Set(
  [
    "ademas ahora ante antes aquella aquellas aquello aquellos asimismo aunque como cual cuales cuando cuyo cuya",
    "desde despues dentro donde durante embargo entonces entre esas esos esta estas este esto estos estaba estaban estan estar",
    "hacia hasta hubo incluso luego mientras otra otras otro otros para pero porque quien quienes segun sesion sesiones sido siendo",
    "sino sobre suya suyo tambien tras cita citas nota notas",
    "anota anotan anoto anotaron anotado anotada anotados anotadas",
    "aparece aparecen aparecio aparecieron",
    "comenta comentan comento comentaron comentado comentada",
    "describe describen describio describieron descrito descrita",
    "dice dicen dijo dijeron",
    "indica indican indico indicaron indicado indicada",
    "menciona mencionan menciono mencionaron mencionado mencionada",
    "muestra muestran mostro mostraron",
    "observa observan observo observaron observado observada observados observadas observacion observaciones",
    "registra registran registro registraron registrado registrada registrados registradas",
    "senala senalan senalo senalaron senalado senalada",
  ].flatMap((grupo) => grupo.split(" ")),
);

// Las únicas palabras de menos de 4 letras que no tienen que salir de una cita: artículos, preposiciones
// y conectores. "no", "ni", "ya", "sin", "mal", "muy" y cualquier otra sí, porque cambian lo que se dice.
const CONECTORES_CORTOS = new Set("a al con de del e el en es esa ese ha han hay la las le les lo los o por que se si son su sus u un una y".split(" "));

const palabras = (texto: string): string[] => normalizar(texto).match(/[\p{L}\p{N}]+/gu) ?? [];

// Sin saltos de línea, termina en un solo punto, y sin otro ".", "?", "!" o ";" seguido de espacio. Pegado
// a una letra también parte la oración ("Olvida.Abre"), salvo que esa palabra salga de una cita ("p.ej").
function esUnaOracion(oracion: string, citas: string[]): boolean {
  if (/[\r\n]/.test(oracion) || !oracion.endsWith(".") || oracion.endsWith("..")) return false;
  const cuerpo = oracion.slice(0, -1);
  if (/[.?!;]\s/.test(cuerpo)) return false;
  const enCitas = citas.flatMap((c) => c.split(/\s+/)).map(normalizar);
  return cuerpo
    .split(/\s+/)
    .filter((p) => /[.?!;][¿¡]?\p{L}/u.test(p))
    .every((p) => enCitas.includes(normalizar(p)));
}

// Una palabra de 4 letras o más comparte sus primeras 5 letras, o toda la palabra si es más corta, con
// una palabra de las citas referidas. Una más corta tiene que estar igual en ellas o ser un conector. Así
// una conducta que no está en las citas no entra (R-008.36). Revisa palabras y no el sentido: una oración
// que quita el "no" de una cita o junta palabras de dos citas pasa aquí, y eso lo decide el coach.
function cubiertaPorCitas(oracion: string, citas: string[]): boolean {
  const deCitas = citas.flatMap(palabras);
  return palabras(oracion).every((p) => {
    if (p.length < 4) return CONECTORES_CORTOS.has(p) || deCitas.includes(p);
    return PALABRAS_PUENTE.has(p) || deCitas.some((c) => c.startsWith(p.slice(0, 5)));
  });
}

// El motivo va a audit_log.error: es un código, nunca lleva el texto de la oración ni de una cita (R-008.39).
export type MotivoResumen = "varias_oraciones" | "ref_fuera_del_indice" | "termino_no_permitido" | "puntaje_o_comparacion" | "etiqueta_a_la_persona" | "palabra_fuera_de_citas";

export type RevisionResumen = { ok: true; oracion: string; lineaIds: string[] } | { ok: false; motivo: MotivoResumen };

// Mayúscula inicial y punto final si faltan. Son formato, no contenido: lo demás no se arregla.
function conBordes(texto: string): string {
  const t = texto.trim();
  const conPunto = /[.?!;:,]$/.test(t) ? t : `${t}.`;
  return conPunto.charAt(0).toLocaleUpperCase("es") + conPunto.slice(1);
}

// "bloque" es el índice que recibió el modelo. Rechaza la salida completa: no hay arreglos parciales.
export function revisarResumen(salida: ResumenDominioIA, bloque: EntradaIndiceResumen[]): RevisionResumen {
  const fallo = (motivo: MotivoResumen): RevisionResumen => ({ ok: false, motivo });
  const oracion = conBordes(salida.oracion);
  const usadas = [...new Set(salida.lineaRefs)].map((ref) => bloque.find((e) => e.ref === ref));
  const lineas = usadas.flatMap((e) => (e ? [e] : []));
  const citas = lineas.map((e) => e.cita);
  if (!esUnaOracion(oracion, citas)) return fallo("varias_oraciones");
  if (usadas.some((e) => !e)) return fallo("ref_fuera_del_indice");

  const terminos = buscarTerminos(oracion);
  if (terminos.length > 0 || buscarCondiciones(oracion, terminos).length > 0) return fallo("termino_no_permitido");
  const normal = normalizar(oracion);
  if (PATRONES_PUNTAJE.some((p) => p.test(normal))) return fallo("puntaje_o_comparacion");
  const deCitas = citas.flatMap(palabras);
  if (palabras(oracion).some((p) => COMPARATIVOS.includes(p) && !deCitas.includes(p))) return fallo("puntaje_o_comparacion");
  if (PATRONES_ETIQUETA_PERSONA.some((p) => p.test(normal))) return fallo("etiqueta_a_la_persona");
  if (!cubiertaPorCitas(oracion, citas)) return fallo("palabra_fuera_de_citas");

  return { ok: true, oracion, lineaIds: lineas.map((e) => e.lineaId) };
}

// El 409 al aprobar y el aviso de la pantalla dicen lo mismo (R-008.38).
export const TEXTO_BLOQUE_CAMBIO = "Este bloque cambió después de la propuesta. Descártala y pide otra.";

// Compara un resumen con las líneas de ahora de su bloque, sin filtros (R-008.38). "lineaCambio": una
// línea usada ya no está, porque se corrigió o se excluyó. "citasNuevas": el bloque ganó líneas.
export function vigenciaResumen(resumen: { lineaIds: string[]; bloqueIds: string[] }, bloque: string[]): { lineaCambio: boolean; citasNuevas: boolean } {
  return {
    lineaCambio: resumen.lineaIds.some((id) => !bloque.includes(id)),
    citasNuevas: bloque.some((id) => !resumen.bloqueIds.includes(id)),
  };
}

type ResumenConEstado = { dominio: string; estado: "propuesto" | "aprobado"; decidedAt: Date | null };

// La propuesta abierta del dominio y su resumen vigente: el aprobado con decided_at más reciente (R-008.37).
export function resumenesDeDominio<R extends ResumenConEstado>(resumenes: R[], dominio: string): { propuesta: R | null; vigente: R | null } {
  const delDominio = resumenes.filter((r) => r.dominio === dominio);
  const aprobados = delDominio
    .filter((r) => r.estado === "aprobado")
    .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0));
  return { propuesta: delDominio.find((r) => r.estado === "propuesto") ?? null, vigente: aprobados[0] ?? null };
}
