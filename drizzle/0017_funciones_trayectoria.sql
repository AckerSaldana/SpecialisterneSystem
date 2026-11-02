-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Spec 008 (trayectoria de función ejecutiva): función del esquema private. Va antes de 0018 porque la
-- política fe_corrections_insert_coach la usa. Mismas reglas que 0011 (R-002.48): security definer,
-- search_path vacío, nombres calificados, stable, sin execute para public ni anon.

-- El evento es una propuesta aprobada de ese acompañamiento. Así una corrección no puede apuntar a otro
-- acompañamiento ni a algo que el coach no aprobó (CA-008.40).
create or replace function private.app_evento_aprobado(evento uuid, eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1 from app.profile_events e
     where e.id = evento and e.engagement_id = eid and e.tipo = 'propuesta_ia' and e.status = 'approved'
  );
end;
$$;
--> statement-breakpoint
revoke execute on function private.app_evento_aprobado(uuid, uuid) from public, anon;
--> statement-breakpoint
grant execute on function private.app_evento_aprobado(uuid, uuid) to authenticated;
