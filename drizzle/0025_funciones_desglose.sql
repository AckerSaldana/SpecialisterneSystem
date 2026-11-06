-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
--
-- Spec 010 (desglose de tareas): funciones del esquema private. Van antes de 0026 porque las políticas nuevas
-- las usan. Mismas reglas que 0007, 0011 y 0020 (R-002.48): security definer, search_path vacío, nombres
-- calificados, stable salvo la que escribe, sin execute para public ni anon. plpgsql para poder crearlas antes
-- que la tabla que consultan. app_snapshot_del_acompanamiento ya existe desde 0020 y se reutiliza.

-- La persona no lee profile_snapshots, y así sigue: las dos rutas leen el perfil solo por aquí (R-010.4). Del último
-- snapshot solo salen estas columnas, sin evidencia, citas ni señales. dominios_fe se queda en el servidor: lo
-- traduce lib/desglose/adaptaciones.ts y nunca llega al modelo ni a la pantalla (R-010.6). Quien no participa o
-- sin consentimiento vigente recibe 0 filas, y sin dimensiones también.
create or replace function private.app_perfil_para_desglose(eid uuid)
returns table (snapshot_id uuid, version integer, dimension text, tipo text, resumen text, dominios_fe jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not ((private.app_is_persona_of(eid) or private.app_is_coach_of(eid)) and private.app_has_consent(eid)) then
    return;
  end if;

  return query
    select s.id, s.version, d.key, d.value ->> 'tipo', d.value ->> 'resumen', coalesce(d.value -> 'dominiosFE', '[]'::jsonb)
      from (
        select p.id, p.version, p.perfil
          from app.profile_snapshots p
         where p.engagement_id = eid
         order by p.version desc
         limit 1
      ) s
      cross join lateral jsonb_each(case when jsonb_typeof(s.perfil -> 'dimensiones') = 'object' then s.perfil -> 'dimensiones' else '{}'::jsonb end) d
     order by d.key;
end;
$$;
--> statement-breakpoint
-- La plantilla es de la organización de quien llama, no está archivada y su origen tiene consentimiento vigente.
-- Esta función no pasa por RLS: sin esa última condición dejaría aplicar una plantilla que su política ya oculta
-- (R-010.42, R-010.45, decisión abierta 5, opción B).
create or replace function private.app_plantilla_de_mi_org(plantilla uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1 from app.task_templates t
     where t.id = plantilla
       and t.org_id = private.app_org_id()
       and t.archivada_en is null
       and private.app_has_consent(t.origen_engagement_id)
  );
end;
$$;
--> statement-breakpoint
-- El desglose es de ese acompañamiento: una repetición no copia el de otra persona (R-010.35).
create or replace function private.app_desglose_del_acompanamiento(desglose uuid, eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from app.task_breakdowns b where b.id = desglose and b.engagement_id = eid);
end;
$$;
--> statement-breakpoint
-- El paso está en pasos, el desglose no está archivado y no tiene ajustes sin decidir (R-010.26, R-010.29, R-010.38).
create or replace function private.app_paso_marcable(desglose uuid, paso uuid, eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1 from app.task_breakdowns b
     where b.id = desglose
       and b.engagement_id = eid
       and b.archivado_en is null
       and not (b.ajustes is not null and b.ajustes_decididos_en is null)
       and jsonb_path_exists(b.pasos, '$[*] ? (@.id == $paso)', jsonb_build_object('paso', paso::text))
  );
end;
$$;
--> statement-breakpoint
-- La persona decide sus ajustes una sola vez (R-010.38). Así no necesita permiso de UPDATE sobre pasos. Los pasos
-- finales los arma y valida lib/desglose/ajustes.ts; aquí solo se revisa quién, y que haya algo sin decidir.
-- Devuelve si escribió.
create or replace function private.app_decidir_ajustes(desglose uuid, pasos_nuevos jsonb, aceptados jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  escritas integer;
begin
  if jsonb_typeof(pasos_nuevos) is distinct from 'array' or jsonb_typeof(aceptados) is distinct from 'array' then
    return false;
  end if;

  update app.task_breakdowns b
     set pasos = pasos_nuevos,
         ajustes_aceptados = aceptados,
         ajustes_decididos_en = now()
   where b.id = desglose
     and b.creado_por = auth.uid()
     and private.app_is_persona_of(b.engagement_id)
     and private.app_has_consent(b.engagement_id)
     and b.ajustes is not null
     and b.ajustes_decididos_en is null;
  get diagnostics escritas = row_count;
  return escritas = 1;
end;
$$;
--> statement-breakpoint
revoke execute on function
  private.app_perfil_para_desglose(uuid),
  private.app_plantilla_de_mi_org(uuid),
  private.app_desglose_del_acompanamiento(uuid, uuid),
  private.app_paso_marcable(uuid, uuid, uuid),
  private.app_decidir_ajustes(uuid, jsonb, jsonb)
from public, anon;
--> statement-breakpoint
grant execute on function
  private.app_perfil_para_desglose(uuid),
  private.app_plantilla_de_mi_org(uuid),
  private.app_desglose_del_acompanamiento(uuid, uuid),
  private.app_paso_marcable(uuid, uuid, uuid),
  private.app_decidir_ajustes(uuid, jsonb, jsonb)
to authenticated;
