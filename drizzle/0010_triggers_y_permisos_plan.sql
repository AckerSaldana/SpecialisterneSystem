-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Spec 003 (plan de acompañamiento): triggers de las transiciones de etapa y permisos por columna.
-- RLS (lib/db/schema.ts) decide qué filas; estos grants deciden qué columnas puede escribir
-- authenticated. propuesta_ia, prompt_version, model, profile_snapshot_id y created_by de plans,
-- y tipo y propuesta_ref de plan_items, no tienen permiso de UPDATE (R-003.20, R-003.26).

create trigger app_on_snapshot
  after insert on app.profile_snapshots
  for each row execute function private.app_on_snapshot();
--> statement-breakpoint
create trigger app_on_plan_insert
  after insert on app.plans
  for each row execute function private.app_on_plan_insert();
--> statement-breakpoint
create trigger app_on_plan_aprobado
  after update of status on app.plans
  for each row execute function private.app_on_plan_aprobado();
--> statement-breakpoint
revoke update on app.plans from authenticated;
--> statement-breakpoint
grant update (titulo, status, version, approved_by, approved_at) on app.plans to authenticated;
--> statement-breakpoint
revoke update on app.plan_items from authenticated;
--> statement-breakpoint
grant update (descripcion, texto_persona, dominio_fe, knowledge_card_id, evidencia, orden, origen, origen_item_id, editado_por, editado_en) on app.plan_items to authenticated;
--> statement-breakpoint
-- La tabla nueva no la cubrió el "grant select on all tables" de 0002_permisos.sql.
revoke all on app.persona_plans from public, anon, authenticated;
--> statement-breakpoint
grant select, insert on app.persona_plans to authenticated;
