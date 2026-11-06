// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Avance de los puntos del plan a través de sus versiones (spec 004, R-004.40 y R-004.41).
// Funciones puras: reciben las filas ya leídas con RLS. plan_items.origen_item_id apunta al ítem
// equivalente de la versión anterior, así que la historia de un ítem es su cadena hacia atrás.
import type { EntradaIndicePlan, EstadoAvance } from "@/lib/followup/schema";

export type ItemCadena = { id: string; origenItemId: string | null; descripcion?: string };

export type FilaAvance = {
  planItemId: string;
  estado: EstadoAvance;
  resumen: string;
  approvedAt: Date;
  aprobadoPor: string | null;
};

// El ítem y los anteriores que sigue, del más nuevo al más viejo. El Set evita un ciclo si el dato
// estuviera roto.
export function cadenaDeItem(itemId: string, items: ItemCadena[]): string[] {
  const porId = new Map(items.map((i) => [i.id, i]));
  const cadena: string[] = [];
  const vistos = new Set<string>();
  let actual: string | null = itemId;
  while (actual && !vistos.has(actual)) {
    vistos.add(actual);
    cadena.push(actual);
    actual = porId.get(actual)?.origenItemId ?? null;
  }
  return cadena;
}

// Historia de un ítem, del estado más viejo al más nuevo (R-004.10). Un ítem sin origen_item_id
// solo trae lo suyo (R-004.40).
export function historialDeItem(itemId: string, items: ItemCadena[], updates: FilaAvance[]): FilaAvance[] {
  const cadena = new Set(cadenaDeItem(itemId, items));
  return updates
    .filter((u) => cadena.has(u.planItemId))
    .sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime());
}

export function ultimoEstado(itemId: string, items: ItemCadena[], updates: FilaAvance[]): FilaAvance | null {
  return historialDeItem(itemId, items, updates).at(-1) ?? null;
}

// El ítem de la versión vigente que sigue a "itemId", o él mismo si ya es vigente. Null si ya no
// tiene equivalente: ese avance no se puede aprobar (R-004.41).
export function itemEquivalente(itemId: string, vigentes: string[], items: ItemCadena[]): string | null {
  return vigentes.find((v) => cadenaDeItem(v, items).includes(itemId)) ?? null;
}

// Ítems con avance cuya cadena no llega a ninguna versión vigente: salieron del plan, o el coach no
// ligó su equivalente. Sus filas siguen en plan_item_updates y su historia se tiene que seguir viendo
// (R-004.10). Devuelve el ítem más nuevo de cada cadena.
export function itemsFueraDelPlan(vigentes: string[], items: ItemCadena[], updates: FilaAvance[]): string[] {
  const enElPlan = new Set(vigentes.flatMap((v) => cadenaDeItem(v, items)));
  const siguiente = new Map(items.filter((i) => i.origenItemId).map((i) => [i.origenItemId as string, i.id]));
  const fuera = new Set<string>();
  for (const { planItemId } of updates) {
    if (enElPlan.has(planItemId)) continue;
    const vistos = new Set<string>();
    let actual = planItemId;
    while (siguiente.has(actual) && !vistos.has(actual)) {
      vistos.add(actual);
      actual = siguiente.get(actual)!;
    }
    fuera.add(actual);
  }
  return [...fuera];
}

// Índice P-nn de los ítems de la versión vigente, en su orden (R-004.54).
export function armarIndicePlan(items: { id: string; descripcion: string }[]): EntradaIndicePlan[] {
  return items.map((item, i) => ({
    ref: `P-${String(i + 1).padStart(2, "0")}`,
    planItemId: item.id,
    descripcion: item.descripcion,
  }));
}
