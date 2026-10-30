// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Lo único que la persona lee de su acompañamiento (spec 002, R-002.40, decisión e).
// La persona no tiene SELECT sobre app.engagements; esta función devuelve id, tipo y etapa,
// nunca la verificación del diagnóstico ni la cédula.
import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import type { EngagementStage, EngagementType } from "@/lib/engagements/config";

export type MiAcompanamiento = { id: string; type: EngagementType; stage: EngagementStage };

export async function miAcompanamiento(tx: Tx): Promise<MiAcompanamiento | null> {
  const filas = await tx.execute<MiAcompanamiento>(sql`select id, type, stage from private.app_mi_acompanamiento()`);
  return filas[0] ?? null;
}
