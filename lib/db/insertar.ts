// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Inserts con lista de columnas explícita para las tablas con permisos por columna
// (drizzle/0006_triggers_y_permisos_alta.sql). Drizzle arma el INSERT con TODAS las columnas y
// pone DEFAULT en las que no se pasan; Postgres pide permiso sobre cada columna de la lista,
// aunque el valor sea DEFAULT, y responde "permission denied". Por eso estas tablas no usan
// tx.insert(...): así authenticated no necesita permiso sobre id, fecha, stage, usada_en, etc.,
// que los pone la base (R-002.8, R-002.23, R-002.41).
import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import type { EngagementType } from "@/lib/engagements/config";

export async function insertarPersona(
  tx: Tx,
  v: { id: string; orgId: string; nombrePila: string },
): Promise<void> {
  await tx.execute(
    sql`insert into app.users (id, org_id, role, nombre_pila) values (${v.id}, ${v.orgId}, 'persona', ${v.nombrePila})`,
  );
}

export async function insertarAcompanamiento(
  tx: Tx,
  v: { orgId: string; type: EngagementType; coachId: string; personaId: string },
): Promise<{ id: string }> {
  const [fila] = await tx.execute<{ id: string }>(
    sql`insert into app.engagements (org_id, type, coach_id, persona_id)
        values (${v.orgId}, ${v.type}, ${v.coachId}, ${v.personaId})
        returning id`,
  );
  return fila;
}

export async function insertarEventoConsentimiento(
  tx: Tx,
  v: { engagementId: string; userId: string; tipo: "otorgado" | "retirado"; versionAviso: string },
): Promise<void> {
  await tx.execute(
    sql`insert into app.consent_events (engagement_id, user_id, tipo, version_aviso)
        values (${v.engagementId}, ${v.userId}, ${v.tipo}, ${v.versionAviso})`,
  );
}

export async function insertarInvitacion(
  tx: Tx,
  v: { engagementId: string; personaId: string; creadaPor: string; expiraEn: Date },
): Promise<void> {
  await tx.execute(
    sql`insert into app.invitations (engagement_id, persona_id, creada_por, expira_en)
        values (${v.engagementId}, ${v.personaId}, ${v.creadaPor}, ${v.expiraEn.toISOString()})`,
  );
}
