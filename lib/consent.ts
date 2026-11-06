// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Consentimiento vigente (spec 002, R-002.28 y R-002.31). Es el único chequeo del sistema:
// rutas y páginas usan estas funciones, y las políticas RLS usan private.app_has_consent,
// que aplica la misma regla en la base. Nadie lee otra columna para decidir si hay consentimiento.
import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { consentEvents } from "@/lib/db/schema";
import type { Tx } from "@/lib/db/rls";

export type EstadoConsentimiento =
  | { estado: "sin_eventos" }
  | { estado: "vigente"; fecha: Date; versionAviso: string }
  | { estado: "retirado"; fecha: Date; versionAviso: string };

// Último evento del acompañamiento. Lo leen el coach y la persona de ese acompañamiento (RLS).
export async function estadoConsentimiento(tx: Tx, engagementId: string): Promise<EstadoConsentimiento> {
  const [ultimo] = await tx
    .select({ tipo: consentEvents.tipo, fecha: consentEvents.fecha, versionAviso: consentEvents.versionAviso })
    .from(consentEvents)
    .where(eq(consentEvents.engagementId, engagementId))
    .orderBy(desc(consentEvents.id))
    .limit(1);
  if (!ultimo) return { estado: "sin_eventos" };
  return {
    estado: ultimo.tipo === "otorgado" ? "vigente" : "retirado",
    fecha: ultimo.fecha,
    versionAviso: ultimo.versionAviso,
  };
}

// Para rutas que guardan notas o llaman al modelo: true solo con consentimiento vigente.
// Usa la misma función que las políticas, así la ruta y la base nunca opinan distinto.
export async function exigirConsentimiento(tx: Tx, engagementId: string): Promise<boolean> {
  const [fila] = await tx.execute<{ ok: boolean }>(
    sql`select private.app_has_consent(${engagementId}::uuid) as ok`,
  );
  return fila?.ok === true;
}
