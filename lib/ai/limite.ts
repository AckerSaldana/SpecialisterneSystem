// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Límite diario de llamadas al modelo pedidas por una cuenta (decisión 8 del plan, R-009.17). Se cuentan sus
// filas de audit_log, también las fallidas: la política audit_log_select_self deja leer solo las propias.
// "Hoy" es el día en Monterrey (R-004.58), no el del servidor. Cada spec fija su máximo; 010 usa el mismo
// módulo (R-010.48).
//
// La fila de la llamada se escribe cuando responde el modelo, así que un pedido en camino no contaría. Por eso el cupo
// se reserva antes de llamar, con una fila propia: audit_log no tiene UPDATE, y la fila de la llamada sigue siendo una
// por llamada (R-009.15, R-010.47). bloquearCupo hace que dos pedidos a la vez no cuenten el mismo número. El candado dura
// lo que la transacción, así que nunca espera al modelo.
import "server-only";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { auditLog } from "@/lib/db/schema";
import { hoyEnMonterrey, ZONA } from "@/lib/followup/fecha";

export async function llamadasDeHoy(
  tx: Tx,
  userId: string,
  engagementId: string,
  acciones: readonly string[],
  ahora: Date = new Date(),
): Promise<number> {
  const [fila] = await tx
    .select({ n: count() })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.userId, userId),
        eq(auditLog.engagementId, engagementId),
        inArray(auditLog.accion, [...acciones]),
        sql`(${auditLog.createdAt} at time zone ${ZONA}::text)::date = ${hoyEnMonterrey(ahora)}::date`,
      ),
    );
  return fila?.n ?? 0;
}

// Va antes de contar y dura hasta el final de la transacción: quien sigue espera y ya ve la reserva.
export async function bloquearCupo(tx: Tx, accionReserva: string, userId: string, engagementId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${accionReserva}:${userId}:${engagementId}`}, 0))`);
}
