// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Copia del plan aprobado para la persona (spec 003, R-003.37, R-003.48, R-003.61).
// Función pura: la ruta de aprobación la llama dentro de la transacción y guarda el resultado en
// persona_plans.contenido.
//
// Solo pasan los ítems objetivo y apoyo_fe que tienen textoPersona, y de cada uno solo el texto,
// el tipo, el orden, su ID y la cadena de IDs de sus versiones anteriores. Nada de descripción del
// coach, citas, fichas ni dominios (C-09).
import { esVisiblePersona, PlanPersona, type TipoItemPlan } from "@/lib/plan/schema";

type ItemParaPersona = {
  id: string;
  tipo: TipoItemPlan;
  textoPersona: string | null;
  orden: number;
  origenItemId: string | null;
};

// Tope de seguridad por si los datos tuvieran un ciclo (no debería pasar: cada versión liga solo
// con la anterior).
const MAX_VERSIONES = 1000;

// Sigue origen_item_id hacia atrás: el ítem anterior, el anterior a ese... hasta uno sin origen.
// "origenes" es id → origen_item_id de TODOS los ítems de planes aprobados del acompañamiento,
// incluidos los que no llegaron a persona_plans por no tener texto (R-003.61). También la usa la
// regeneración de "Cómo trabajar conmigo" (R-009.48).
export function cadenaAnterior(origenItemId: string | null, origenes: Map<string, string | null>): string[] {
  const cadena: string[] = [];
  let actual = origenItemId;
  while (actual !== null && !cadena.includes(actual) && cadena.length < MAX_VERSIONES) {
    cadena.push(actual);
    actual = origenes.get(actual) ?? null;
  }
  return cadena;
}

export function vistaPersonaPlan(items: ItemParaPersona[], origenes: Map<string, string | null>): PlanPersona {
  const visibles = items
    .filter((it) => esVisiblePersona(it.tipo) && it.textoPersona !== null && it.textoPersona.trim() !== "")
    .sort((a, b) => a.orden - b.orden);

  return PlanPersona.parse({
    items: visibles.map((it) => ({
      planItemId: it.id,
      tipo: it.tipo,
      texto: it.textoPersona,
      orden: it.orden,
      itemsAnteriores: cadenaAnterior(it.origenItemId, origenes),
    })),
  });
}
