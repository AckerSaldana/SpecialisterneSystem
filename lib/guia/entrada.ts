// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Lo que le llega al modelo para escribir una guía (spec 009, R-009.6 a R-009.9). Función pura, sin red
// ni base. El modelo ve un ID corto O-nn y el texto; el índice con los IDs reales se queda en el servidor.
//
// Entra: dimensiones de persona_profiles (resumen y tipo), texto_persona de objetivo y apoyo_fe, y
// descripcion de los cuatro tipos internos (D-070). Nunca entran las citas: solo sirven aquí para dejar
// fuera lo que las copia, porque plan_items.descripcion puede traer una (cita_en_texto_lider solo avisa).
import { createHash } from "node:crypto";
import { revisarInsumo } from "@/lib/guia/terminos";
import type { InsumosGuia, ItemInsumo, OrigenLinea } from "@/lib/guia/schema";
import { esVisiblePersona } from "@/lib/plan/schema";
import { DIMENSIONES } from "@/lib/profile/schema";

export type OrigenEntrada = { ref: string; tipo: string; texto: string };

export type EntradaGuia = {
  // Lo único de aquí que va al mensaje.
  origenes: OrigenEntrada[];
  // O-nn → el origen que se guarda. No sale del servidor.
  indice: Map<string, OrigenLinea>;
};

// Identifica un origen sin importar su forma. Sirve para decirle a armarEntradaGuia cuáles mandar (R-009.47).
export const claveOrigen = (o: OrigenLinea) => (o.tipo === "plan_item" ? `plan_item:${o.planItemId}` : `dimension:${o.dimension}`);

// R-009.9: un texto con una cita copiada, un término no permitido, una mención de condición, una etiqueta interna o un
// ID no entra. Ver revisarInsumo.
const textoPermitido = (texto: string, citas: string[]) => revisarInsumo(texto, citas).length === 0;

// R-009.7: de objetivo y apoyo_fe solo texto_persona; de los tipos internos, descripcion. Es lo que recibe el
// modelo, así que también es lo que compara una regeneración (R-009.47).
export function textoDeItem(item: ItemInsumo): string | null {
  const texto = esVisiblePersona(item.tipo) ? item.textoPersona : item.descripcion;
  return texto !== null && texto.trim() !== "" ? texto : null;
}

export function armarEntradaGuia(insumos: InsumosGuia, soloOrigenes?: ReadonlySet<string>): EntradaGuia {
  const candidatos: { origen: OrigenLinea; tipo: string; texto: string }[] = [];

  for (const { id } of DIMENSIONES) {
    const d = insumos.perfil?.dimensiones[id];
    if (d) candidatos.push({ origen: { tipo: "dimension", dimension: id }, tipo: d.tipo, texto: d.resumen });
  }
  const items = [...insumos.items].sort((a, b) => a.orden - b.orden);
  for (const item of items) {
    const texto = textoDeItem(item);
    if (texto !== null) candidatos.push({ origen: { tipo: "plan_item", planItemId: item.id }, tipo: item.tipo, texto });
  }

  const origenes: OrigenEntrada[] = [];
  const indice = new Map<string, OrigenLinea>();
  for (const c of candidatos) {
    if (soloOrigenes && !soloOrigenes.has(claveOrigen(c.origen))) continue;
    if (!textoPermitido(c.texto, insumos.citas)) continue;
    const ref = `O-${String(origenes.length + 1).padStart(2, "0")}`;
    origenes.push({ ref, tipo: c.tipo, texto: c.texto });
    indice.set(ref, c.origen);
  }
  return { origenes, indice };
}

// R-009.46: identifica lo que recibiría el modelo. Sin ids: un plan nuevo con los mismos textos da la misma huella.
export function huellaEntrada(entrada: EntradaGuia): string {
  const textos = entrada.origenes.map((o) => JSON.stringify([o.tipo, o.texto])).sort();
  return createHash("sha256").update(JSON.stringify(textos)).digest("hex");
}
