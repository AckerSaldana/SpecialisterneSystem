// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Tipos y utilidades que comparten las piezas de la sección "Plan de acompañamiento" del coach
// (spec 003, tareas 18 y 19). Sin hooks ni "server-only": lo usan Server y Client Components.
import type { ItemPlanVista } from "@/lib/api/contracts";
import { TIPOS_ITEM_PLAN, type TipoItemPlan } from "@/lib/plan/schema";

// Un ítem del plan sin banderas: así se muestra el plan vigente (ya aprobado, no se edita).
export type ItemLectura = Omit<ItemPlanVista, "banderas">;

// Ficha para mostrar "Ficha {id}: {título}" y para el selector de ficha del borrador.
// En el selector solo entran las verificadas (R-003.24); las demás sirven para mostrar el título.
export type FichaOpcion = { id: string; titulo: string; verificada: boolean };

// Punto del plan vigente para el selector "Sigue al punto de la versión {v}:" (R-003.50).
export type PuntoVigente = { id: string; tipo: TipoItemPlan; descripcion: string };

// IDs de los elementos que reciben el foco después de router.refresh() (ver foco.ts).
export const ID_SECCION = "plan-de-acompanamiento";
export const ID_VIGENTE = "plan-vigente";
export const ID_BORRADOR = "borrador-plan";
export const idGrupo = (tipo: TipoItemPlan) => `borrador-grupo-${tipo}`;
export const idAgregar = (tipo: TipoItemPlan) => `agregar-${tipo}`;
export const idEditar = (itemId: string) => `editar-${itemId}`;

// Los seis grupos en el orden de la spec, cada uno con sus ítems ordenados por "orden".
// sort es estable: a igual orden se respeta el orden en que llegaron de la base (created_at).
export function agruparPorTipo<T extends { tipo: TipoItemPlan; orden: number }>(items: T[]) {
  return TIPOS_ITEM_PLAN.map((t) => ({
    ...t,
    items: items.filter((i) => i.tipo === t.id).sort((a, b) => a.orden - b.orden),
  }));
}

// Texto corto para una opción de <select>: las descripciones pueden tener hasta 800 caracteres.
export function recortar(texto: string, max = 120): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

// Clase de los <select> nativos: mismo aspecto que Textarea y foco visible.
export const CLASE_SELECT =
  "h-9 w-full max-w-prose rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm dark:bg-input/30";
