// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Rastro de una versión del plan (spec 003, R-003.35): qué propuso la IA y qué cambió el coach.
// Función pura. Todo se calcula desde plans.propuesta_ia (que no cambia) y plan_items:
//   - "sin_cambios": ítem de la IA tal como lo propuso (origen "ia").
//   - "editado": ítem de la IA que el coach cambió (origen "ia_editado"), con el texto original
//     tomado de propuesta_ia por su propuesta_ref.
//   - "coach": ítem que escribió el coach (origen "coach").
//   - quitados: ítems de la propuesta limpia que ya no están en plan_items.
// A qué punto de la versión anterior sigue cada ítem viene en origenItemId; la pantalla lo resuelve.
import type { OrigenItemPlan, PayloadPlanIA, TipoItemPlan } from "@/lib/plan/schema";

export type ItemRastro = {
  id: string;
  tipo: TipoItemPlan;
  descripcion: string;
  textoPersona: string | null;
  origen: OrigenItemPlan;
  propuestaRef: number | null;
  origenItemId: string | null;
};

export type Rastro = {
  items: (ItemRastro & {
    estado: "sin_cambios" | "editado" | "coach";
    original: { descripcion: string; textoPersona: string | null } | null;
  })[];
  quitados: { ref: number; tipo: TipoItemPlan; descripcion: string }[];
};

const ESTADO: Record<OrigenItemPlan, Rastro["items"][number]["estado"]> = {
  ia: "sin_cambios",
  ia_editado: "editado",
  coach: "coach",
};

export function rastroPlan(propuestaIa: PayloadPlanIA | null, items: ItemRastro[]): Rastro {
  const propuestos = propuestaIa?.propuesta.items ?? [];

  const conEstado = items.map((it) => {
    const estado = ESTADO[it.origen];
    // El original solo se muestra en los editados (R-003.35: "con el texto original de la IA").
    const delModelo = it.propuestaRef !== null ? propuestos[it.propuestaRef] : undefined;
    const original =
      estado === "editado" && delModelo ? { descripcion: delModelo.descripcion, textoPersona: delModelo.textoPersona } : null;
    return { ...it, estado, original };
  });

  // Un ítem de la IA cuyo índice ya no aparece en plan_items es uno que el coach quitó.
  const presentes = new Set(items.map((it) => it.propuestaRef).filter((r): r is number => r !== null));
  const quitados = propuestos.flatMap((p, ref) =>
    presentes.has(ref) ? [] : [{ ref, tipo: p.tipo, descripcion: p.descripcion }],
  );

  return { items: conEstado, quitados };
}
