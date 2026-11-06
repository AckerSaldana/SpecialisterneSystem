// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Lectura de la trayectoria (spec 008). Recibe la transacción de withRls: con el consentimiento
// retirado, RLS no devuelve filas (R-008.42). Las líneas las arma lib/trayectoria/lineas.ts.
import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Tx } from "@/lib/db/rls";
import { feCorrections, feDomainSummaries, profileEvents, sessions, users } from "@/lib/db/schema";
import type { DominioFE } from "@/lib/profile/schema";
import { armarLineas, type EventoLineas, type LineasArmadas } from "@/lib/trayectoria/lineas";

// "notas" es sessionId -> nota original, para el plegable "Ver la nota de esa sesión". Va aparte de las
// líneas: armarLineas no copia la nota a ninguna.
export type TrayectoriaLeida = LineasArmadas & { notas: Record<string, string> };

// Solo eventos propuesta_ia aprobados, con su sesión, su nota y las correcciones (R-008.13, R-008.17).
export async function leerTrayectoria(tx: Tx, engagementId: string): Promise<TrayectoriaLeida> {
  // Alias: users se lee también para el autor de cada corrección.
  const aprobador = alias(users, "aprobador");
  const filas = await tx
    .select({
      id: profileEvents.id,
      tipo: profileEvents.tipo,
      status: profileEvents.status,
      sessionId: profileEvents.sessionId,
      createdAt: profileEvents.createdAt,
      payload: profileEvents.payload,
      approvedPayload: profileEvents.approvedPayload,
      decididoPor: aprobador.nombrePila,
      sesionTipo: sessions.tipo,
      realizadaEn: sessions.realizadaEn,
      nota: sessions.notaOriginal,
    })
    .from(profileEvents)
    .leftJoin(sessions, eq(sessions.id, profileEvents.sessionId))
    .leftJoin(aprobador, eq(aprobador.id, profileEvents.decidedBy))
    .where(and(eq(profileEvents.engagementId, engagementId), eq(profileEvents.tipo, "propuesta_ia"), eq(profileEvents.status, "approved")))
    .orderBy(asc(profileEvents.createdAt));

  const eventos: EventoLineas[] = filas.map(({ sesionTipo, realizadaEn, nota, ...f }) => ({
    ...f,
    sesion: sesionTipo && realizadaEn && nota !== null ? { tipo: sesionTipo, realizadaEn, nota } : null,
  }));

  const correcciones = await tx
    .select({
      id: feCorrections.id,
      lineaId: feCorrections.lineaId,
      dominio: feCorrections.dominio,
      direccion: feCorrections.direccion,
      anteriorLineaId: feCorrections.anteriorLineaId,
      autor: users.nombrePila,
      createdAt: feCorrections.createdAt,
    })
    .from(feCorrections)
    .innerJoin(users, eq(users.id, feCorrections.createdBy))
    .where(eq(feCorrections.engagementId, engagementId))
    .orderBy(asc(feCorrections.id));

  const armadas = armarLineas(eventos, correcciones);
  // Solo el id: ni la cita ni la nota llegan al log (R-008.17, C-17).
  for (const id of armadas.sinResolver) console.error(`[trayectoria: sin cita en su nota o evento ilegible] ${id}`);

  const notas: Record<string, string> = {};
  for (const { sessionId, sesion } of eventos) if (sessionId && sesion) notas[sessionId] = sesion.nota;
  return { ...armadas, notas };
}

export type ResumenLeido = {
  id: string;
  dominio: DominioFE;
  texto: string;
  lineaIds: string[];
  bloqueIds: string[];
  estado: "propuesto" | "aprobado";
  createdAt: Date;
  decidedAt: Date | null;
  decididoPor: string | null;
};

// Los resúmenes de la pantalla. Uno descartado deja de verse (CA-008.35). Solo se leen aquí (CA-008.42).
export async function leerResumenes(tx: Tx, engagementId: string): Promise<ResumenLeido[]> {
  const filas = await tx
    .select({
      id: feDomainSummaries.id,
      dominio: feDomainSummaries.dominio,
      texto: feDomainSummaries.texto,
      lineaIds: feDomainSummaries.lineaIds,
      bloqueIds: feDomainSummaries.bloqueIds,
      estado: feDomainSummaries.estado,
      createdAt: feDomainSummaries.createdAt,
      decidedAt: feDomainSummaries.decidedAt,
      decididoPor: users.nombrePila,
    })
    .from(feDomainSummaries)
    .leftJoin(users, eq(users.id, feDomainSummaries.decidedBy))
    .where(and(eq(feDomainSummaries.engagementId, engagementId), ne(feDomainSummaries.estado, "descartado")))
    .orderBy(asc(feDomainSummaries.createdAt));
  return filas.flatMap((f) => (f.estado === "descartado" ? [] : [{ ...f, estado: f.estado }]));
}
