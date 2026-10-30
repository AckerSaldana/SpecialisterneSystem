-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Spec 002 (alta y consentimiento): triggers y permisos de tabla y columna.
-- RLS (lib/db/schema.ts) decide qué filas; estos grants deciden qué columnas puede escribir
-- authenticated. stage, diagnostico_verificado_por, diagnostico_verificado_en y
-- consent_events.fecha no tienen permiso de escritura: los ponen la base y los triggers (R-002.41).

create trigger app_on_verificacion
  before update on app.engagements
  for each row execute function private.app_on_verificacion();
--> statement-breakpoint
create trigger app_on_consent
  after insert on app.consent_events
  for each row execute function private.app_on_consent();
--> statement-breakpoint
-- Las tablas nuevas no las cubrió el "grant select on all tables" de 0002_permisos.sql.
revoke all on app.consent_events, app.invitations from public, anon, authenticated;
--> statement-breakpoint
grant select on app.consent_events, app.invitations to authenticated;
--> statement-breakpoint
-- El coach da de alta a la persona (R-002.2, R-002.5). stage y diagnostico_verificado usan su default.
grant insert (id, org_id, role, nombre_pila) on app.users to authenticated;
--> statement-breakpoint
grant insert (org_id, type, coach_id, persona_id) on app.engagements to authenticated;
--> statement-breakpoint
-- Única escritura sobre engagements: la verificación, y solo en etapa alta (política engagements_update_coach_alta).
grant update (diagnostico_verificado, cedula_profesional) on app.engagements to authenticated;
--> statement-breakpoint
-- La persona registra o retira su consentimiento; no hay update ni delete para nadie (R-002.28).
grant insert (engagement_id, user_id, tipo, version_aviso) on app.consent_events to authenticated;
--> statement-breakpoint
grant usage on sequence app.consent_events_id_seq to authenticated;
--> statement-breakpoint
grant insert (engagement_id, persona_id, creada_por, expira_en) on app.invitations to authenticated;
--> statement-breakpoint
grant update (usada_en, reemplazada_en) on app.invitations to authenticated;
