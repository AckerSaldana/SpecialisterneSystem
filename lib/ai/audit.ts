// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Registra cada llamada al modelo en audit_log (éxito o error, tokens y latencia).
// Se llama dentro de un withRls(...): la política audit_log_insert_self exige que
// userId sea el usuario de la sesión. La fila va en su propia transacción, separada de la del
// evento, para que una llamada exitosa quede registrada aunque falle el guardado (R-004.45).
import "server-only";
import type { Tx } from "@/lib/db/rls";
import { auditLog } from "@/lib/db/schema";

export type EntradaAuditoria = {
  userId: string;
  engagementId: string | null;
  accion: string; // p. ej. "propose_profile_update"
  modelo: string | null;
  promptVersion: string | null;
  tokensEntrada?: number | null;
  tokensSalida?: number | null;
  tokensCacheLectura?: number | null;
  latenciaMs?: number | null;
  ok: boolean;
  error?: string | null;
};

// Largo máximo del mensaje de error que se guarda (los errores del proveedor pueden ser muy largos).
const MAX_ERROR = 1000;

export async function registrarAuditoria(tx: Tx, entrada: EntradaAuditoria): Promise<void> {
  await tx.insert(auditLog).values({
    userId: entrada.userId,
    engagementId: entrada.engagementId,
    accion: entrada.accion,
    modelo: entrada.modelo,
    promptVersion: entrada.promptVersion,
    tokensEntrada: entrada.tokensEntrada ?? null,
    tokensSalida: entrada.tokensSalida ?? null,
    tokensCacheLectura: entrada.tokensCacheLectura ?? null,
    latenciaMs: entrada.latenciaMs ?? null,
    ok: entrada.ok,
    error: entrada.error ? entrada.error.slice(0, MAX_ERROR) : null,
  });
}
