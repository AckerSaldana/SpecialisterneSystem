-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
--
-- Spec 009 ("Cómo trabajar conmigo"), R-009.46: una versión lista o retirada guarda la huella de lo que el modelo ya
-- revisó sin proponer nada, para que el aviso de cambios tenga salida. Es lo único que cambia en una versión: el trigger
-- sigue rechazando todo lo demás (R-009.56). Solo la persona tiene política de UPDATE (R-009.34).

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

  -- R-009.46: en una versión, solo la huella de lo ya revisado, y solo si cambia de verdad.
  if old.estado in ('lista', 'retirada') and new.estado = old.estado
     and new.revisada_sin_cambios is not null
     and new.revisada_sin_cambios is distinct from old.revisada_sin_cambios then
    if despues - 'revisada_sin_cambios' is distinct from antes - 'revisada_sin_cambios' then
      raise exception 'shared_guides: en una versión solo cambia revisada_sin_cambios' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  raise exception 'shared_guides: transición no permitida de % a %', old.estado, new.estado using errcode = 'check_violation';
end;
$$;
--> statement-breakpoint
grant update (revisada_sin_cambios) on app.shared_guides to authenticated;
