// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Índice de evidencia del plan (spec 003, R-003.4 y R-003.14; decisión 6).
// El modelo no copia citas: recibe cada cita del perfil aprobado con un ID corto ("E-01",
// "E-02"...) y responde con esos IDs. El código convierte cada ID de vuelta en { cita, sessionId }
// con este mismo índice, así el modelo nunca escribe el texto de una cita ni un sessionId.
//
// El orden es fijo: primero el orden de DIMENSIONES y, dentro de cada dimensión, el orden de su
// evidencia. Así el mismo snapshot siempre da los mismos IDs (en el prompt y al validar).
// Las señales activas no entran (decisión 5): sus citas no reciben ID.
import type { EvidenciaPlan } from "@/lib/plan/schema";
import { DIMENSIONES, type DimensionId, type Perfil } from "@/lib/profile/schema";

export type EvidenciaIndexada = { id: string; dimension: DimensionId; cita: string; sessionId: string };
export type IndiceEvidencia = { lista: EvidenciaIndexada[]; porId: Map<string, EvidenciaIndexada> };

export function indiceEvidencia(perfil: Perfil): IndiceEvidencia {
  const lista: EvidenciaIndexada[] = [];
  for (const { id: dimension } of DIMENSIONES) {
    const dim = perfil.dimensiones[dimension];
    if (!dim) continue;
    for (const e of dim.evidencia) {
      // E-01 ... E-99; si algún día hay más de 99 citas sigue con E-100 sin chocar.
      const id = `E-${String(lista.length + 1).padStart(2, "0")}`;
      lista.push({ id, dimension, cita: e.cita, sessionId: e.sessionId });
    }
  }
  return { lista, porId: new Map(lista.map((e) => [e.id, e])) };
}

// Convierte los IDs de un ítem ya limpio en lo que se guarda en plan_items.evidencia (R-003.14).
// Un ID que no está en el índice se salta (sanitizePlan ya los quitó; esto es por si acaso).
export function resolverEvidencia(evidencia: { evidenciaId: string }[], indice: IndiceEvidencia): EvidenciaPlan[] {
  return evidencia.flatMap(({ evidenciaId }) => {
    const e = indice.porId.get(evidenciaId);
    return e ? [{ cita: e.cita, sessionId: e.sessionId }] : [];
  });
}
