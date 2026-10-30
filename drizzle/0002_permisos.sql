-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Permisos de tabla y columna del esquema "app" (drizzle-kit no los genera).
-- RLS decide qué FILAS ve cada quien; estos grants deciden qué TABLAS y COLUMNAS puede
-- tocar el rol authenticated. withRls (lib/db/rls.ts) corre como authenticated, así que
-- todo lo que hace la app pasa por los dos filtros.
-- "anon" no recibe nada: sin sesión no se lee ni se escribe ninguna tabla.

revoke all on all tables in schema app from public, anon, authenticated;
--> statement-breakpoint
revoke all on schema app from public, anon;
--> statement-breakpoint
grant usage on schema app to authenticated;
--> statement-breakpoint
grant select on all tables in schema app to authenticated;
--> statement-breakpoint
grant insert on
  app.sessions, app.profile_events, app.profile_snapshots, app.persona_profiles,
  app.plans, app.plan_items, app.recommendations, app.audit_log
to authenticated;
--> statement-breakpoint
grant usage on sequence app.audit_log_id_seq to authenticated;
--> statement-breakpoint
-- En profile_events solo cambian la decisión y quién la tomó; el payload, el tipo, el autor y
-- el engagement quedan fijos después de crearse.
grant update (status, approved_payload, decided_by, decided_at) on app.profile_events to authenticated;
--> statement-breakpoint
grant update (titulo, status, approved_by, approved_at) on app.plans to authenticated;
--> statement-breakpoint
grant update (tipo, descripcion, dominio_fe, knowledge_card_id, evidencia, orden) on app.plan_items to authenticated;
--> statement-breakpoint
grant update (razon, status, approved_by) on app.recommendations to authenticated;
--> statement-breakpoint
grant delete on app.plan_items to authenticated;
