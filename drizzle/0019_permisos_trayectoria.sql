-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
--
-- Spec 008 (trayectoria de función ejecutiva): permisos de las tablas nuevas. RLS (lib/db/schema.ts)
-- decide qué filas; estos grants deciden qué columnas puede escribir authenticated. Las tablas nuevas
-- no las cubrió el "grant select on all tables" de 0002_permisos.sql.
-- La persona no tiene políticas sobre ellas: estos grants no le dan ninguna fila (R-008.40).

revoke all on app.fe_corrections, app.fe_domain_summaries from public, anon, authenticated;
--> statement-breakpoint
-- Correcciones: solo INSERT y SELECT. El historial no se edita (R-008.28, R-008.29).
grant select, insert on app.fe_corrections, app.fe_domain_summaries to authenticated;
--> statement-breakpoint
grant usage on sequence app.fe_corrections_id_seq to authenticated;
--> statement-breakpoint
-- Resúmenes: solo la decisión. El texto no se edita (R-008.37, decisión abierta 7).
grant update (estado, decided_by, decided_at) on app.fe_domain_summaries to authenticated;
