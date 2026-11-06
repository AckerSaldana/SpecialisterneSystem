-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
--
-- Spec 009 ("Cómo trabajar conmigo"): funciones del esquema private. Van antes de 0021 porque las
-- políticas nuevas las usan. Mismas reglas que 0007 y 0011 (R-002.48): security definer, search_path
-- vacío, nombres calificados, stable salvo la de trigger, sin execute para public ni anon. plpgsql para
-- poder crearlas antes que la tabla que consultan.

-- Transiciones y congelamiento de una guía (R-009.56). Los permisos por columna son iguales para coach
-- y persona, y RLS no compara el estado anterior con el nuevo, así que esto vive en un trigger.
-- Las fechas de cada transición las pone la base. Cualquier otro caso lanza una excepción, también como owner.
create or replace function private.app_shared_guide_transicion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  antes jsonb := to_jsonb(old);
  despues jsonb := to_jsonb(new);
begin
  if old.estado = 'borrador' and new.estado = 'borrador' then
    if despues - array['lineas', 'nombre_a_mostrar'] is distinct from antes - array['lineas', 'nombre_a_mostrar'] then
      raise exception 'shared_guides: en un borrador solo cambian lineas y nombre_a_mostrar' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if old.estado = 'borrador' and new.estado = 'lista' then
    if despues - array['estado', 'version', 'documento', 'aprobada_por_persona_en'] is distinct from antes - array['estado', 'version', 'documento', 'aprobada_por_persona_en'] then
      raise exception 'shared_guides: al marcarla lista solo cambian estado, version y documento' using errcode = 'check_violation';
    end if;
    if new.version is null or new.documento is null then
      raise exception 'shared_guides: una guía lista lleva version y documento' using errcode = 'check_violation';
    end if;
    -- R-009.28: nada sin decidir.
    if jsonb_path_exists(new.lineas, '$[*] ? (@.estado == "pendiente" || @.cambio.decision == "pendiente")') then
      raise exception 'shared_guides: hay líneas o cambios sin decidir' using errcode = 'check_violation';
    end if;
    -- R-009.5, R-009.28: el tope es MAX_LINEAS_INCLUIDAS de lib/guia/schema-cliente.ts.
    if jsonb_array_length(jsonb_path_query_array(new.lineas, '$[*] ? (@.estado == "incluida" || @.estado == "editada" || @.estado == "propia")')) > 20 then
      raise exception 'shared_guides: más de 20 líneas incluidas' using errcode = 'check_violation';
    end if;
    new.aprobada_por_persona_en := now();
    return new;
  end if;

  if old.estado = 'borrador' and new.estado = 'descartada' then
    if despues - array['estado', 'descartada_en'] is distinct from antes - array['estado', 'descartada_en'] then
      raise exception 'shared_guides: al descartar no cambia nada más' using errcode = 'check_violation';
    end if;
    new.descartada_en := now();
    return new;
  end if;

  if old.estado = 'lista' and new.estado = 'retirada' then
    if despues - array['estado', 'retirada_en'] is distinct from antes - array['estado', 'retirada_en'] then
      raise exception 'shared_guides: al retirar no cambia nada más' using errcode = 'check_violation';
    end if;
    new.retirada_en := now();
    return new;
  end if;

  raise exception 'shared_guides: transición no permitida de % a %', old.estado, new.estado using errcode = 'check_violation';
end;
$$;
--> statement-breakpoint
-- Lo que hace falta para escribir una guía (R-009.10). La persona no lee plans, plan_items ni
-- profile_snapshots, y así sigue: el servidor lee estas entradas solo por aquí, y el resultado se queda en
-- el servidor (lib/guia/insumos.ts). Quien no sea la persona o el coach de eid, o sin consentimiento
-- vigente, recibe null. Sin dominios, fichas ni evidencia por ítem; citas solo sirve para R-009.9 y R-009.11.
-- hayBorrador y hayVersiones son booleanos: es lo único que el coach sabe de filas que no puede leer (R-009.34).
create or replace function private.app_guia_insumos(eid uuid, plan_version_base integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  perfil_actual record;
  plan_vigente record;
begin
  if not ((private.app_is_persona_of(eid) or private.app_is_coach_of(eid)) and private.app_has_consent(eid)) then
    return null;
  end if;

  select pp.snapshot_id, pp.version, pp.contenido into perfil_actual
    from app.persona_profiles pp
   where pp.engagement_id = eid
   order by pp.version desc
   limit 1;

  select p.id, p.version into plan_vigente
    from app.plans p
   where p.engagement_id = eid and p.status = 'aprobado'
   order by p.version desc
   limit 1;

  return jsonb_build_object(
    'snapshotId', perfil_actual.snapshot_id,
    'perfilVersion', perfil_actual.version,
    'perfil', perfil_actual.contenido,
    'planVersion', plan_vigente.version,
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', i.id, 'tipo', i.tipo, 'descripcion', i.descripcion, 'textoPersona', i.texto_persona, 'orden', i.orden)
               order by i.orden, i.created_at, i.id)
        from app.plan_items i
       where i.engagement_id = eid and i.plan_id = plan_vigente.id
    ), '[]'::jsonb),
    'itemsBase', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', i.id, 'tipo', i.tipo, 'descripcion', i.descripcion, 'textoPersona', i.texto_persona, 'orden', i.orden)
               order by i.orden, i.created_at, i.id)
        from app.plan_items i
        join app.plans p on p.id = i.plan_id
       where i.engagement_id = eid and p.engagement_id = eid and p.status = 'aprobado' and p.version = plan_version_base
    ), '[]'::jsonb),
    'origenes', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'origenItemId', i.origen_item_id) order by i.id)
        from app.plan_items i
        join app.plans p on p.id = i.plan_id
       where i.engagement_id = eid and p.engagement_id = eid and p.status = 'aprobado'
    ), '[]'::jsonb),
    'citas', coalesce((
      select jsonb_agg(c.cita order by c.cita)
        from (
          select jsonb_path_query(s.perfil, '$.dimensiones.*.evidencia[*].cita') as cita
            from app.profile_snapshots s where s.engagement_id = eid
          union
          select jsonb_path_query(s.perfil, '$.senalesActivas[*].evidencia[*].cita')
            from app.profile_snapshots s where s.engagement_id = eid
          union
          select jsonb_path_query(i.evidencia, '$[*].cita')
            from app.plan_items i where i.engagement_id = eid and i.plan_id = plan_vigente.id
        ) c
    ), '[]'::jsonb),
    'hayBorrador', exists (select 1 from app.shared_guides g where g.engagement_id = eid and g.estado = 'borrador'),
    'hayVersiones', exists (select 1 from app.shared_guides g where g.engagement_id = eid and g.version is not null)
  );
end;
$$;
--> statement-breakpoint
-- El snapshot es de ese acompañamiento. La persona no puede leer profile_snapshots, por eso va aquí (R-009.63).
-- 010 la reutiliza sin volver a crearla.
create or replace function private.app_snapshot_del_acompanamiento(snap uuid, eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from app.profile_snapshots s where s.id = snap and s.engagement_id = eid);
end;
$$;
--> statement-breakpoint
-- La guía es de ese acompañamiento y tiene versión: un borrador descartado no sirve de base (R-009.31, R-009.63).
create or replace function private.app_guia_del_acompanamiento(guia uuid, eid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from app.shared_guides g where g.id = guia and g.engagement_id = eid and g.version is not null);
end;
$$;
--> statement-breakpoint
revoke execute on function
  private.app_shared_guide_transicion(),
  private.app_guia_insumos(uuid, integer),
  private.app_snapshot_del_acompanamiento(uuid, uuid),
  private.app_guia_del_acompanamiento(uuid, uuid)
from public, anon;
--> statement-breakpoint
grant execute on function
  private.app_guia_insumos(uuid, integer),
  private.app_snapshot_del_acompanamiento(uuid, uuid),
  private.app_guia_del_acompanamiento(uuid, uuid)
to authenticated;
