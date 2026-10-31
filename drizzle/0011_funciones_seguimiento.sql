-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Spec 004 (seguimiento y señales): funciones del esquema private. Van antes de 0012 porque las
-- políticas nuevas las usan. Mismas reglas que 0003 y 0007 (R-002.48): security definer,
-- search_path vacío, nombres calificados, stable, sin execute para public ni anon. plpgsql para
-- poder crearlas antes que las tablas que consultan.

-- El evento es de esa sesión y de ese acompañamiento. Así una fila de plan_item_updates o de
-- followup_context no puede apuntar a otro acompañamiento.
create or replace function private.app_evento_de_sesion(evento uuid, sesion uuid, eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1 from app.profile_events e
     where e.id = evento and e.session_id = sesion and e.engagement_id = eid
  );
end;
$$;
--> statement-breakpoint
-- El ítem es de un plan aprobado de ese acompañamiento.
create or replace function private.app_item_del_acompanamiento(item uuid, eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1 from app.plan_items i
      join app.plans p on p.id = i.plan_id
     where i.id = item and i.engagement_id = eid and p.engagement_id = eid and p.status = 'aprobado'
  );
end;
$$;
--> statement-breakpoint
revoke execute on function
  private.app_evento_de_sesion(uuid, uuid, uuid),
  private.app_item_del_acompanamiento(uuid, uuid)
from public, anon;
--> statement-breakpoint
grant execute on function
  private.app_evento_de_sesion(uuid, uuid, uuid),
  private.app_item_del_acompanamiento(uuid, uuid)
to authenticated;
