// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Qué cambiaría una regeneración de "Cómo trabajar conmigo" (spec 009, R-009.47, R-009.48, R-009.50). Funciones
// puras, sin red ni base. El modelo no declara qué cambió: lo calcula este archivo, con las reglas de "Reglas
// fijas". El modelo solo recibe los orígenes cambiados o nuevos, para que una línea no cambie solo porque el
// modelo la redactó distinto.
//
// La IA nunca sobrescribe lo que escribió la persona: una línea propia se copia sin comparar, y una editada con
// el origen cambiado enseña los dos textos y se queda con el suyo si rechaza (R-009.50). Los textos de un origen
// solo sirven aquí para comparar; lo que sale de este archivo son líneas, con los IDs de sus orígenes.
import { armarEntradaGuia, claveOrigen, huellaEntrada, textoDeItem } from "@/lib/guia/entrada";
import { LineaGuia, type DescartesGuia, type InsumosGuia, type ItemInsumo, type OrigenLinea } from "@/lib/guia/schema";
import { cadenaAnterior } from "@/lib/plan/persona";
import type { DimensionId, PerfilPersona } from "@/lib/profile/schema";
import { normalizar } from "@/lib/profile/terminos";

export type InsumosComparacion = Pick<InsumosGuia, "perfil" | "items" | "itemsBase" | "origenes">;

export type ClaseOrigen = "igual" | "cambiado" | "sin_equivalente";

// Lo que recibe el modelo de cada origen (R-009.7). Si esto no cambió, la línea tampoco tiene por qué cambiar.
const huellaItem = (i: ItemInsumo) => JSON.stringify([i.tipo, textoDeItem(i)]);
const huellaDimension = (d: { tipo: string; resumen: string }) => JSON.stringify([d.tipo, d.resumen]);

const mapaDeOrigenes = (insumos: InsumosComparacion) => new Map(insumos.origenes.map((o) => [o.id, o.origenItemId]));

// El ítem y sus versiones anteriores, siguiendo origen_item_id (R-009.48).
const versionesDe = (item: ItemInsumo, origenes: Map<string, string | null>) => [item.id, ...cadenaAnterior(origenes.get(item.id) ?? null, origenes)];

// R-009.47: los orígenes vigentes cambiados o nuevos. Es lo único que recibe el modelo en una regeneración.
export function origenesCambiados(insumos: InsumosComparacion, perfilBase: PerfilPersona | null): Set<string> {
  const cambiados = new Set<string>();

  for (const [id, actual] of Object.entries(insumos.perfil?.dimensiones ?? {})) {
    const dimension = id as DimensionId;
    const antes = perfilBase?.dimensiones[dimension];
    if (actual && (!antes || huellaDimension(antes) !== huellaDimension(actual))) cambiados.add(claveOrigen({ tipo: "dimension", dimension }));
  }

  const origenes = mapaDeOrigenes(insumos);
  const enBase = new Map(insumos.itemsBase.map((i) => [i.id, i]));
  for (const item of insumos.items) {
    if (textoDeItem(item) === null) continue;
    const antes = versionesDe(item, origenes).flatMap((id) => enBase.get(id) ?? [])[0];
    if (!antes || huellaItem(antes) !== huellaItem(item)) cambiados.add(claveOrigen({ tipo: "plan_item", planItemId: item.id }));
  }
  return cambiados;
}

type OrigenClasificado = { clase: ClaseOrigen; equivalente: OrigenLinea | null };

function clasificador(insumos: InsumosComparacion, perfilBase: PerfilPersona | null): (origen: OrigenLinea) => OrigenClasificado {
  const origenes = mapaDeOrigenes(insumos);
  const enBase = new Map(insumos.itemsBase.map((i) => [i.id, i]));
  // Cualquier versión de un ítem → el ítem vigente que la continúa.
  const vigente = new Map<string, ItemInsumo>();
  for (const item of insumos.items) for (const id of versionesDe(item, origenes)) if (!vigente.has(id)) vigente.set(id, item);

  return (origen) => {
    if (origen.tipo === "dimension") {
      const actual = insumos.perfil?.dimensiones[origen.dimension];
      if (!actual) return { clase: "sin_equivalente", equivalente: null };
      const antes = perfilBase?.dimensiones[origen.dimension];
      return { clase: antes && huellaDimension(antes) === huellaDimension(actual) ? "igual" : "cambiado", equivalente: origen };
    }
    const actual = vigente.get(origen.planItemId);
    if (!actual) return { clase: "sin_equivalente", equivalente: null };
    const antes = enBase.get(origen.planItemId);
    return { clase: antes && huellaItem(antes) === huellaItem(actual) ? "igual" : "cambiado", equivalente: { tipo: "plan_item", planItemId: actual.id } };
  };
}

const sinRepetir = (origenes: OrigenLinea[]) => {
  const vistos = new Set<string>();
  return origenes.filter((o) => {
    const clave = claveOrigen(o);
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
};

export type Comparacion = {
  lineas: LineaGuia[];
  // Cuántas líneas traen un cambio por decidir. Con 0, no hay nada que mostrarle (R-009.47).
  cambios: number;
  // R-009.12: solo el conteo de las que se descartaron por repetir una línea base.
  repetidas: number;
};

type EntradaComparacion = {
  base: LineaGuia[];
  // Las líneas que escribió el modelo, ya limpias con sanitizeGuia. Vacía si no se llamó al modelo.
  nuevas: LineaGuia[];
  insumos: InsumosComparacion;
  perfilBase: PerfilPersona | null;
  nuevoId?: () => string;
};

// R-009.48, con las reglas de "Reglas fijas". El número de cada regla es el de la spec.
export function compararConBase({ base, nuevas, insumos, perfilBase, nuevoId = () => crypto.randomUUID() }: EntradaComparacion): Comparacion {
  const clasificar = clasificador(insumos, perfilBase);
  const clasificadas = base.map((linea) => ({ linea, origenes: linea.origenes.map(clasificar) }));

  const textosDe = (l: LineaGuia) => [l.texto, ...(l.textoIa === null ? [] : [l.textoIa])].map(normalizar);
  const textosBase = new Set(base.flatMap(textosDe));

  // Regla 6: cada línea base se empareja máximo con una línea nueva, primero por más orígenes en común y luego por
  // orden. Regla 3: de la misma sección y compartiendo un origen, con su equivalente por origen_item_id. Regla 5: una
  // línea nueva que repite otra línea base, también una quitada, no se empareja: la pantalla preguntaría si cambiar
  // su línea por un texto que ella ya quitó, sin decirle que lo quitó (R-009.50).
  const candidatas: { deBase: number; nueva: number; comunes: number }[] = [];
  clasificadas.forEach(({ linea, origenes }, deBase) => {
    if (linea.estado === "propia" || !origenes.some((o) => o.clase === "cambiado")) return;
    const equivalentes = new Set(origenes.flatMap((o) => (o.equivalente ? [claveOrigen(o.equivalente)] : [])));
    const propios = new Set(textosDe(linea));
    nuevas.forEach((n, nueva) => {
      if (n.seccion !== linea.seccion) return;
      const normal = normalizar(n.texto);
      if (textosBase.has(normal) && !propios.has(normal)) return;
      const comunes = n.origenes.filter((o) => equivalentes.has(claveOrigen(o))).length;
      if (comunes > 0) candidatas.push({ deBase, nueva, comunes });
    });
  });
  candidatas.sort((a, b) => b.comunes - a.comunes || a.deBase - b.deBase || a.nueva - b.nueva);

  const parejaDe = new Map<number, number>();
  const nuevasUsadas = new Set<number>();
  for (const { deBase, nueva } of candidatas) {
    if (parejaDe.has(deBase) || nuevasUsadas.has(nueva)) continue;
    parejaDe.set(deBase, nueva);
    nuevasUsadas.add(nueva);
  }

  const lineas: LineaGuia[] = clasificadas.map(({ linea, origenes }, i): LineaGuia => {
    // Regla 7: los orígenes se actualizan al ítem equivalente. Una línea que se queda sin ninguno conserva los
    // suyos: una línea de la IA siempre lleva al menos un origen (R-009.6).
    const equivalentes = sinRepetir(origenes.flatMap((o) => o.equivalente ?? []));
    const copia = (cambio: LineaGuia["cambio"] = null): LineaGuia => ({
      ...linea,
      id: nuevoId(),
      origenes: equivalentes.length ? equivalentes : linea.origenes,
      lineaAnteriorId: linea.id,
      cambio,
    });

    // Regla 1.
    if (linea.estado === "propia") return copia();

    // Regla 3.
    if (origenes.some((o) => o.clase === "cambiado")) {
      const n = parejaDe.has(i) ? nuevas[parejaDe.get(i)!] : null;
      const textoIgual = n && [linea.textoIa ?? linea.texto, linea.texto].some((t) => normalizar(t) === normalizar(n.texto));
      if (!n || textoIgual) return copia();
      const unidos = sinRepetir([...n.origenes, ...equivalentes]).slice(0, 3);
      // Lo que quitó no vuelve con su texto: se propone como nueva, con la nota (R-009.50).
      if (linea.estado === "quitada") {
        return { ...copia({ tipo: "nueva", textoAnterior: null, antesQuitada: true, decision: "pendiente" }), texto: n.texto, textoIa: n.texto, estado: "pendiente", origenes: unidos };
      }
      // El texto de la IA queda en "texto" hasta que decida; su estado y su textoIa son los de antes (R-009.49).
      return { ...copia({ tipo: "cambia", textoAnterior: linea.texto, antesQuitada: false, decision: "pendiente" }), texto: n.texto, origenes: unidos };
    }

    // Regla 4. Con algún origen que sigue igual, la línea todavía tiene de dónde salir y se copia. Una decisión ya
    // tomada no se vuelve a preguntar: si rechazó un "sale", la línea se queda.
    if (origenes.every((o) => o.clase === "sin_equivalente") && linea.estado !== "quitada") {
      if (linea.cambio?.tipo === "sale" && linea.cambio.decision === "rechazado") return copia(linea.cambio);
      return copia({ tipo: "sale", textoAnterior: null, antesQuitada: false, decision: "pendiente" });
    }

    // Regla 2, también si es quitada.
    return copia();
  });

  // Regla 5: una línea nueva sin pareja es "nueva", salvo que repita una línea base, también una que quitó.
  const ultimoOrden = new Map<string, number>();
  for (const l of lineas) ultimoOrden.set(l.seccion, Math.max(ultimoOrden.get(l.seccion) ?? -1, l.orden));
  let repetidas = 0;
  nuevas.forEach((n, i) => {
    if (nuevasUsadas.has(i)) return;
    if (textosBase.has(normalizar(n.texto))) {
      repetidas += 1;
      return;
    }
    const orden = (ultimoOrden.get(n.seccion) ?? -1) + 1;
    ultimoOrden.set(n.seccion, orden);
    lineas.push({ ...n, orden, cambio: { tipo: "nueva", textoAnterior: null, antesQuitada: false, decision: "pendiente" } });
  });

  return { lineas: lineas.map((l) => LineaGuia.parse(l)), cambios: lineas.filter((l) => l.cambio?.decision === "pendiente").length, repetidas };
}

// R-009.46 y R-009.47: si hay algo que proponer. El aviso y la regeneración usan esta misma cuenta, para que el aviso no
// prometa lo que la regeneración no puede dar. Hay algo si el modelo recibiría un origen cambiado o nuevo, salvo que esos
// mismos textos ya se revisaron sin cambios, o si una línea viene de un origen que ya no existe.
export function hayAlgoQueProponer({
  base,
  insumos,
  perfilBase,
  revisadaSinCambios,
}: {
  base: LineaGuia[];
  insumos: InsumosGuia;
  perfilBase: PerfilPersona | null;
  revisadaSinCambios: string | null;
}): boolean {
  const entrada = armarEntradaGuia(insumos, origenesCambiados(insumos, perfilBase));
  if (entrada.origenes.length > 0 && huellaEntrada(entrada) !== revisadaSinCambios) return true;
  // En un borrador de una regeneración, un cambio sin decidir ya está en pantalla: no es algo nuevo que proponer.
  const yaPropuestos = base.filter((l) => l.cambio?.decision !== "pendiente");
  return compararConBase({ base: yaPropuestos, nuevas: [], insumos, perfilBase }).cambios > 0;
}

// Los conteos de la limpieza más las repetidas de la regla 5 (R-009.12).
export function descartesConRepetidas(descartes: DescartesGuia, repetidas: number): DescartesGuia {
  return repetidas === 0 ? descartes : { ...descartes, repetida: (descartes.repetida ?? 0) + repetidas };
}
