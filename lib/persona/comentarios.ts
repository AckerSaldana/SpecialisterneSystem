// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Ciclo de "Esto no me representa" (spec 005), en funciones puras, sin red ni base:
//   - el estado de cada parte del perfil y del plan, y su texto para la persona (R-005.24, R-005.28,
//     R-005.35). Por parte manda el comentario más reciente;
//   - qué propuesta o versión del plan puede resolver un comentario (R-005.27, R-005.34, R-005.49);
//   - los textos del coach por origen (R-005.25, "Pantallas y textos").
import { textoEstado, type ParteComentario, type VistaEstado } from "@/lib/persona/texto-comentario";
import type { PlanPersona } from "@/lib/plan/schema";
import {
  etiquetaDimension,
  type AprobacionEntrada,
  type DimensionId,
  type OrigenComentario,
  type PayloadNoMeRepresenta,
  type ProfileEventPayload,
} from "@/lib/profile/schema";

type StatusEvento = "proposed" | "approved" | "rejected";

// Un evento guardado sin "origen" cuenta como "perfil" (R-005.33).
export const origenDe = (payload: Pick<PayloadNoMeRepresenta, "origen">): OrigenComentario => payload.origen ?? "perfil";

// ---------------------------------------------------------------------------
// Lo que ve la persona
// ---------------------------------------------------------------------------

export type EstadoParte = ParteComentario & {
  fecha: Date; // pendiente: cuándo lo envió. Cerrado: cuándo lo cerró el coach.
};

export type EstadosComentarios = {
  perfilGeneral: EstadoParte | null;
  dimensiones: Partial<Record<DimensionId, EstadoParte>>;
  planGeneral: EstadoParte | null;
  // Por planItemId de la versión vigente.
  items: Record<string, EstadoParte>;
};

export type FilaComentario = {
  status: StatusEvento;
  payload: ProfileEventPayload;
  createdAt: Date;
  decidedAt: Date | null;
};

const RESULTADO: Record<StatusEvento, EstadoParte["resultado"]> = {
  proposed: "pendiente",
  approved: "con_cambios",
  rejected: "sin_cambios",
};

// R-005.35: el ítem de la versión vigente que es el del comentario o lo tiene en itemsAnteriores.
function itemEquivalente(planItemId: string, plan: PlanPersona | null): string | null {
  const item = plan?.items.find((i) => i.planItemId === planItemId || i.itemsAnteriores.includes(planItemId));
  return item?.planItemId ?? null;
}

export function estadosDeComentarios(filas: FilaComentario[], plan: PlanPersona | null): EstadosComentarios {
  const estados: EstadosComentarios = { perfilGeneral: null, dimensiones: {}, planGeneral: null, items: {} };
  // Del más viejo al más reciente: en cada parte se queda el último que se escribe.
  const enOrden = [...filas].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const fila of enOrden) {
    if (fila.payload.tipo !== "no_me_representa") continue;
    const origen = origenDe(fila.payload);
    // El resumen de cierre se muestra en su página, con 006 (R-005.47).
    if (origen === "cierre") continue;
    const resultado = RESULTADO[fila.status];
    const fecha = resultado === "pendiente" ? fila.createdAt : (fila.decidedAt ?? fila.createdAt);
    const estado: EstadoParte = { origen, resultado, fecha };
    if (origen === "perfil") {
      if (fila.payload.dimension) estados.dimensiones[fila.payload.dimension] = estado;
      else estados.perfilGeneral = estado;
    } else {
      const item = fila.payload.planItemId ? itemEquivalente(fila.payload.planItemId, plan) : null;
      if (item) estados.items[item] = estado;
      else estados.planGeneral = estado;
    }
  }
  return estados;
}

// textoEstado vive aparte porque también corre en el navegador (lib/persona/texto-comentario.ts).
export { textoEstado };

export function vistaEstado(estado: EstadoParte | null | undefined, formatear: (fecha: Date) => string): VistaEstado | null {
  if (!estado) return null;
  return { pendiente: estado.resultado === "pendiente", texto: textoEstado(estado, formatear(estado.fecha)) };
}

// ---------------------------------------------------------------------------
// Qué puede resolver un comentario
// ---------------------------------------------------------------------------

export type PropuestaAprobada = {
  id: string;
  tipo: "propuesta_ia" | "no_me_representa";
  status: StatusEvento;
  decidedAt: Date | null;
  approvedPayload: AprobacionEntrada | null;
};

// R-005.27 y R-005.49: un comentario cerrado también queda "approved", así que se filtra por la columna
// tipo. R-004.56 permite aprobar sin cambiar el perfil, así que se exige approved_payload.cambios.
export function propuestaResuelve(p: PropuestaAprobada, comentarioEn: Date): boolean {
  return (
    p.tipo === "propuesta_ia" &&
    p.status === "approved" &&
    p.decidedAt !== null &&
    p.decidedAt.getTime() > comentarioEn.getTime() &&
    (p.approvedPayload?.cambios.length ?? 0) > 0
  );
}

export type PlanAprobado = { id: string; status: string; version: number | null; approvedAt: Date | null };

// R-005.34.
export function planResuelve(p: PlanAprobado, comentarioEn: Date): boolean {
  return p.status === "aprobado" && p.approvedAt !== null && p.approvedAt.getTime() > comentarioEn.getTime();
}

// ---------------------------------------------------------------------------
// Textos del coach
// ---------------------------------------------------------------------------

export const ETIQUETA_ORIGEN_COMENTARIO: Record<OrigenComentario, string> = {
  perfil: "Sobre el perfil",
  plan: "Sobre el plan",
  cierre: "Sobre el resumen de cierre",
};

export type VersionPlanPersona = { version: number; contenido: PlanPersona };

// La línea "Sobre". El texto del ítem sale de persona_plans de esa versión: es lo que la persona vio.
export function sobreComentario(payload: PayloadNoMeRepresenta, planes: VersionPlanPersona[]): string {
  const origen = origenDe(payload);
  if (origen === "cierre") return "El resumen de cierre";
  if (origen === "perfil") return payload.dimension ? etiquetaDimension(payload.dimension) : "El perfil en general";
  if (!payload.planItemId) return "El plan en general";
  const item = planes
    .find((p) => p.version === payload.planVersion)
    ?.contenido.items.find((i) => i.planItemId === payload.planItemId);
  return item ? `El plan, versión ${payload.planVersion}: ${item.texto}` : `El plan, versión ${payload.planVersion}`;
}

export function estadoComentarioCoach(status: StatusEvento, origen: OrigenComentario): string {
  if (status === "proposed") return "Sin revisar";
  if (origen === "cierre") return "Revisado";
  const parte = origen === "plan" ? "plan" : "perfil";
  return status === "approved" ? `Revisado, con cambios al ${parte}` : `Revisado, sin cambios al ${parte}`;
}

export const textoAvisoComentarios = (nombre: string, n: number) =>
  n === 1 ? `${nombre} tiene 1 comentario sin revisar.` : `${nombre} tiene ${n} comentarios sin revisar.`;
