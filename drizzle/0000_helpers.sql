-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Funciones auxiliares para las políticas RLS de lib/db/schema.ts.
-- security definer: corren con permisos del dueño y no pasan por RLS, así una política
-- sobre "users" puede consultar "users" sin recursión.
-- plpgsql (no sql) para que se puedan crear antes que las tablas que consultan (esquema "app").
-- search_path vacío y nombres calificados para que no se puedan secuestrar.
-- Viven en el esquema "private", que la Data API de Supabase no expone: así no se pueden
-- llamar como /rest/v1/rpc/... El rol authenticated solo necesita usage para las políticas.

create schema if not exists private;
--> statement-breakpoint
revoke all on schema private from public, anon;
--> statement-breakpoint
grant usage on schema private to authenticated;
--> statement-breakpoint
create or replace function private.app_role() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select u.role::text from app.users u where u.id = auth.uid());
end;
$$;
--> statement-breakpoint
create or replace function private.app_org_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select u.org_id from app.users u where u.id = auth.uid());
end;
$$;
--> statement-breakpoint
create or replace function private.app_is_coach_of(eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from app.engagements e where e.id = eid and e.coach_id = auth.uid());
end;
$$;
--> statement-breakpoint
create or replace function private.app_is_persona_of(eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from app.engagements e where e.id = eid and e.persona_id = auth.uid());
end;
$$;
--> statement-breakpoint
create or replace function private.app_has_consent(eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from app.engagements e where e.id = eid and e.consentimiento_en is not null);
end;
$$;
--> statement-breakpoint
revoke execute on function private.app_role(), private.app_org_id(), private.app_is_coach_of(uuid), private.app_is_persona_of(uuid), private.app_has_consent(uuid) from public, anon;
--> statement-breakpoint
grant execute on function private.app_role(), private.app_org_id(), private.app_is_coach_of(uuid), private.app_is_persona_of(uuid), private.app_has_consent(uuid) to authenticated;
