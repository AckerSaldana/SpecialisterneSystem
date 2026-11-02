-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Spec 009 ("Cómo trabajar conmigo"): trigger de transiciones y permisos de la tabla nueva. RLS
-- (lib/db/schema.ts) decide qué filas; estos grants deciden qué columnas puede escribir authenticated. La
-- tabla nueva no la cubrió el "grant select on all tables" de 0002_permisos.sql (R-009.56).
-- El coach no tiene política de UPDATE: estos grants no le dan ninguna fila (R-009.34). Sin grant de DELETE.

create trigger app_shared_guide_transicion
  before update on app.shared_guides
  for each row execute function private.app_shared_guide_transicion();
--> statement-breakpoint
revoke all on app.shared_guides from public, anon, authenticated;
--> statement-breakpoint
grant select, insert on app.shared_guides to authenticated;
--> statement-breakpoint
grant update (lineas, nombre_a_mostrar, estado, version, documento) on app.shared_guides to authenticated;
