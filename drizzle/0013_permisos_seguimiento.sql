-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Spec 004 (seguimiento y señales): permisos de las tablas nuevas. RLS (lib/db/schema.ts) decide
-- qué filas; estos grants deciden qué columnas puede escribir authenticated. Las tablas nuevas no
-- las cubrió el "grant select on all tables" de 0002_permisos.sql.
-- Ningún grant de UPDATE sobre app.engagements (R-004.38).

revoke all on app.plan_item_updates, app.followup_context, app.signal_states, app.strong_alerts from public, anon, authenticated;
--> statement-breakpoint
-- Avance y estado de señales: solo INSERT y SELECT. El historial no se edita.
grant select, insert on app.plan_item_updates, app.signal_states to authenticated;
--> statement-breakpoint
grant select, insert on app.followup_context, app.strong_alerts to authenticated;
--> statement-breakpoint
-- "Ya no aplica": solo quién la quitó y cuándo (R-004.23).
grant update (quitada_por, quitada_en) on app.followup_context to authenticated;
--> statement-breakpoint
-- La ruta solo deja avanzar de abierta a escalada a atendida (R-004.42).
grant update (estado, nota_escalada, escalada_en, atendida_en) on app.strong_alerts to authenticated;
