-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
--
-- Spec 002 (alta y consentimiento): funciones del esquema private.
-- Van antes de 0004 porque las políticas nuevas las usan.
-- Reglas (R-002.48): security definer, search_path vacío, nombres calificados,
-- stable salvo las de trigger, sin execute para public ni anon. Son plpgsql para poder
-- crearse antes que las tablas que consultan (app.consent_events, app.invitations).

-- Consentimiento vigente (R-002.28): el evento con el id más alto es "otorgado".
-- Reemplaza la versión de 0000_helpers.sql, que leía engagements.consentimiento_en.
create or replace function private.app_has_consent(eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return coalesce(
    (select c.tipo = 'otorgado'
       from app.consent_events c
      where c.engagement_id = eid
      order by c.id desc
      limit 1),
    false
  );
end;
$$;
--> statement-breakpoint
-- R-002.38: con una invitación usada ya no se generan códigos nuevos.
create or replace function private.app_invitacion_usada(eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from app.invitations i where i.engagement_id = eid and i.usada_en is not null);
end;
$$;
--> statement-breakpoint
-- R-002.37: otorgar el consentimiento exige el diagnóstico verificado. Hace falta como
-- función porque la persona ya no lee app.engagements directo (R-002.40).
create or replace function private.app_alta_verificada(eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from app.engagements e where e.id = eid and e.diagnostico_verificado);
end;
$$;
--> statement-breakpoint
-- R-002.40 (decisión e): lo único que la persona lee de su acompañamiento.
-- Sin columnas de la verificación del diagnóstico.
create or replace function private.app_mi_acompanamiento()
returns table (id uuid, type app.engagement_type, stage app.engagement_stage)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select e.id, e.type, e.stage
      from app.engagements e
     where e.persona_id = auth.uid();
end;
$$;
--> statement-breakpoint
-- Trigger before update en engagements (R-002.8): quién y cuándo los pone la base.
-- Si la verificación queda en false, se limpian cédula, quién y cuándo.
create or replace function private.app_on_verificacion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.diagnostico_verificado is distinct from old.diagnostico_verificado
     or new.cedula_profesional is distinct from old.cedula_profesional then
    if new.diagnostico_verificado then
      new.diagnostico_verificado_por := auth.uid();
      new.diagnostico_verificado_en := now();
    else
      new.cedula_profesional := null;
      new.diagnostico_verificado_por := null;
      new.diagnostico_verificado_en := null;
    end if;
  end if;
  return new;
end;
$$;
--> statement-breakpoint
-- Trigger after insert en consent_events (R-002.25): el primer "otorgado" pasa la etapa de
-- alta a evaluacion_inicial. Corre como dueño: la persona no necesita permiso de UPDATE.
create or replace function private.app_on_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'otorgado' then
    update app.engagements
       set stage = 'evaluacion_inicial'
     where id = new.engagement_id
       and stage = 'alta';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
revoke execute on function
  private.app_has_consent(uuid),
  private.app_invitacion_usada(uuid),
  private.app_alta_verificada(uuid),
  private.app_mi_acompanamiento(),
  private.app_on_verificacion(),
  private.app_on_consent()
from public, anon;
--> statement-breakpoint
grant execute on function
  private.app_has_consent(uuid),
  private.app_invitacion_usada(uuid),
  private.app_alta_verificada(uuid),
  private.app_mi_acompanamiento()
to authenticated;
