-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Spec 010 (desglose de tareas): permisos de las tablas nuevas. RLS (lib/db/schema.ts) decide qué filas; estos
-- grants deciden qué columnas puede escribir authenticated. Las tablas nuevas no las cubrió el "grant select on all
-- tables" de 0002_permisos.sql (R-010.52). Sin grant de DELETE. Nadie escribe pasos directo: la persona decide sus
-- ajustes por private.app_decidir_ajustes (R-010.38, R-010.51).

revoke all on app.task_breakdowns, app.task_step_events, app.task_templates from public, anon, authenticated;
--> statement-breakpoint
grant select, insert on app.task_breakdowns, app.task_step_events, app.task_templates to authenticated;
--> statement-breakpoint
grant update (archivado_por, archivado_en) on app.task_breakdowns to authenticated;
--> statement-breakpoint
grant update (revisado_por, revisado_en) on app.task_step_events to authenticated;
--> statement-breakpoint
grant update (archivada_por, archivada_en) on app.task_templates to authenticated;
--> statement-breakpoint
-- Igual que audit_log en 0002 y consent_events en 0006: sin esto, la persona no puede insertar marcas.
grant usage on sequence app.task_step_events_id_seq to authenticated;
