-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Spec 003 (plan de acompañamiento): funciones del esquema private. Van antes de 0008 porque
-- las políticas nuevas las usan. Mismas reglas que 0003 (R-002.48): security definer,
-- search_path vacío, nombres calificados, stable salvo las de trigger, sin execute para
-- public ni anon. plpgsql para poder crearlas antes que las columnas que consultan.

-- Los ítems de un plan solo se escriben mientras el plan está en borrador (R-003.32), y el plan
-- tiene que ser del mismo acompañamiento que el ítem.
create or replace function private.app_plan_en_borrador(pid uuid, eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from app.plans p where p.id = pid and p.engagement_id = eid and p.status = 'borrador');
end;
$$;
--> statement-breakpoint
-- persona_plans solo recibe la copia de un plan aprobado del mismo acompañamiento (R-003.37).
create or replace function private.app_plan_aprobado(pid uuid, eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from app.plans p where p.id = pid and p.engagement_id = eid and p.status = 'aprobado');
end;
$$;
--> statement-breakpoint
-- Transiciones de etapa (tabla de transiciones de la spec 003, R-003.55 a R-003.60).
-- Cada una solo avanza desde su etapa de origen; si la etapa ya es otra, no hace nada.

-- evaluacion_inicial → perfil: al crear el snapshot versión 1 (R-003.56).
create or replace function private.app_on_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.version = 1 then
    update app.engagements set stage = 'perfil'
     where id = new.engagement_id and stage = 'evaluacion_inicial';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
-- perfil → plan: al guardar el primer borrador de plan (R-003.57, decisión 12).
create or replace function private.app_on_plan_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update app.engagements set stage = 'plan'
   where id = new.engagement_id and stage = 'perfil';
  return new;
end;
$$;
--> statement-breakpoint
-- plan → seguimiento: cuando un plan pasa a aprobado (R-003.58). Con la etapa ya en
-- seguimiento, aprobar otra versión no hace nada (R-003.60).
create or replace function private.app_on_plan_aprobado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'aprobado' and old.status is distinct from 'aprobado' then
    update app.engagements set stage = 'seguimiento'
     where id = new.engagement_id and stage = 'plan';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
revoke execute on function
  private.app_plan_en_borrador(uuid, uuid),
  private.app_plan_aprobado(uuid, uuid),
  private.app_on_snapshot(),
  private.app_on_plan_insert(),
  private.app_on_plan_aprobado()
from public, anon;
--> statement-breakpoint
grant execute on function
  private.app_plan_en_borrador(uuid, uuid),
  private.app_plan_aprobado(uuid, uuid)
to authenticated;
