-- =============================================================================
-- Informes de gestión · 0281 · Enviar es aprobar; se puede devolver.
--
-- Hasta aquí enviar dejaba el informe en «Enviado» a la espera de Planeación.
-- Ahora, al enviar, el informe queda revisado y aprobado en el mismo acto:
--
--     draft | back → sent → ok     (una sola transacción)
--
-- La foto de las cifras la sigue tomando el disparador al pasar a «sent»; el
-- paso a «ok» sella aprobado_en y aprobado_por (quien envía) y deja una fila en
-- informe_revisiones («Aprobado automáticamente al enviar»).
--
-- Devolver para modificaciones: Planeación y la unidad DESTINO (el jefe de la
-- unidad a la que se entrega el informe: rectoría de campus o general) pueden
-- pasar un informe enviado o aprobado a «back» con una nota. El destino solo
-- puede eso: no toca ninguna otra columna.
--
-- Cambios:
--   informe_es_destino(uuid)             nueva: ¿soy el jefe de esa unidad destino?
--   informe_mis_destinos()               nueva: las unidades destino de las que soy jefe
--   informe_transicion_permitida         sent→back y ok→back también para 'destino'
--   informe_instancia_visible            el destino lee los informes que le llegan
--   informe_instancias_guard             actor 'destino'; deja pasar el paso interno
--                                        sent→ok de informe_enviar (informe.sistema)
--   informe_enviar                       envía y aprueba (security definer)
--   informe_cambiar_estado               permite al destino devolver (security definer)
--
-- Es idempotente. Se aplica después de 0280.
-- =============================================================================

-- 1. El destino -------------------------------------------------------------

create or replace function public.informe_es_destino(p_destino uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_destino is not null
     and not public.informe_gestiona()
     and public.informe_actor(p_destino) = 'jefe';
$$;

revoke all on function public.informe_es_destino(uuid) from public, anon;
grant execute on function public.informe_es_destino(uuid) to authenticated;

/** Las unidades destino a las que el usuario pertenece como jefe y que reciben algún informe. */
create or replace function public.informe_mis_destinos()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct i.destino
    from public.informe_instancias i
   where i.destino is not null
     and public.informe_es_destino(i.destino);
$$;

revoke all on function public.informe_mis_destinos() from public, anon;
grant execute on function public.informe_mis_destinos() to authenticated;

-- 2. Transiciones -------------------------------------------------------------

create or replace function public.informe_transicion_permitida(de text, a text, actor text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    case
      when de = 'draft' and a = 'sent'           then actor in ('planeacion', 'jefe')
      when de = 'sent'  and a = 'ok'             then actor = 'planeacion'
      when de = 'sent'  and a = 'back'           then actor in ('planeacion', 'destino')
      when de = 'ok'    and a = 'back'           then actor in ('planeacion', 'destino')
      when de = 'back'  and a = 'draft'          then actor in ('planeacion', 'jefe', 'editor')
      else false
    end,
    false
  );
$$;

-- 3. Visibilidad: el destino lee lo que le llega ----------------------------------

create or replace function public.informe_instancia_visible(inst uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.informe_gestiona()
      or exists (
           select 1 from public.informe_instancias i
            where i.id = inst
              and (public.informe_can_view(i.unit_id)
                   or (i.destino is not null and public.informe_can_view(i.destino)))
         );
$$;

-- 4. El guardián ----------------------------------------------------------------

create or replace function public.informe_instancias_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'sent' then
      new.enviado_en := now();
      new.enviado_por := auth.uid();
      new.aprobado_en := null;
      new.aprobado_por := null;
    elsif new.estado = 'ok' then
      new.aprobado_en := now();
      new.aprobado_por := auth.uid();
    else
      new.aprobado_en := null;
      new.aprobado_por := null;
    end if;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  -- Escrituras del sistema que no cambian el estado (la foto del resumen, 0282):
  -- solo corren dentro de funciones security definer que marcan informe.sistema.
  if tg_op = 'UPDATE'
     and coalesce(current_setting('informe.sistema', true), '') = 'si'
     and new.estado is not distinct from old.estado then
    new.updated_by := auth.uid();
    return new;
  end if;

  -- El paso interno sent → ok de informe_enviar (security definer) ya pasó por
  -- este guardián en su primer paso, el que valida quién envía y qué falta.
  if tg_op = 'UPDATE'
     and coalesce(current_setting('informe.sistema', true), '') = 'si'
     and old.estado = 'sent' and new.estado = 'ok' then
    new.updated_by := auth.uid();
    return new;
  end if;

  actor := public.informe_actor(new.unit_id);
  if (actor is null or actor = 'visor') and tg_op = 'UPDATE' and public.informe_es_destino(old.destino) then
    actor := 'destino';
  end if;
  if actor is null or actor = 'visor' then
    raise exception 'Sin permiso para cambiar este informe' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if actor <> 'planeacion' then
      if new.estado <> 'draft' then
        raise exception 'Un informe nuevo empieza en borrador' using errcode = '42501';
      end if;
      if not exists (select 1 from public.informe_ciclos c where c.id = new.ciclo_id and c.estado = 'abierto') then
        raise exception 'El ciclo no está abierto' using errcode = '42501';
      end if;
      if not public.informe_sede_ok(new.unit_id, new.campus_id) then
        raise exception 'Su pertenencia no incluye esa sede' using errcode = '42501';
      end if;
    end if;
    new.updated_by := auth.uid();
    return new;
  end if;

  if actor = 'destino' then
    -- La unidad destino solo devuelve, con nota, y no cambia nada más.
    if (new.ciclo_id, new.unit_id, new.campus_id, new.plantilla, new.destino)
       is distinct from (old.ciclo_id, old.unit_id, old.campus_id, old.plantilla, old.destino) then
      raise exception 'La unidad destino solo puede devolver el informe' using errcode = '42501';
    end if;
    if new.estado is not distinct from old.estado then
      raise exception 'La unidad destino solo puede devolver el informe' using errcode = '42501';
    end if;
    if new.estado = 'back' and coalesce(btrim(new.nota_revision), '') = '' then
      raise exception 'Para devolver un informe escriba la nota' using errcode = '23514';
    end if;
  elsif actor <> 'planeacion' then
    if old.estado in ('sent', 'ok') then
      raise exception 'El informe ya se envió: solo Planeación o su unidad destino lo pueden devolver' using errcode = '42501';
    end if;
    if (new.ciclo_id, new.unit_id, new.campus_id, new.plantilla, new.destino, new.nota_revision)
       is distinct from (old.ciclo_id, old.unit_id, old.campus_id, old.plantilla, old.destino, old.nota_revision) then
      raise exception 'Solo Planeación cambia la sede, la plantilla, el destino o la nota de revisión' using errcode = '42501';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    if not public.informe_transicion_permitida(old.estado, new.estado, actor) then
      raise exception 'Cambio de estado no permitido: % → % (%)', old.estado, new.estado, actor
        using errcode = '42501';
    end if;
    if new.estado = 'sent' then
      perform public.informe_validar_envio(new.id);
    end if;
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

-- 5. Enviar es aprobar ---------------------------------------------------------------

/** Envía el informe (jefe o Planeación) y lo deja aprobado. La foto la toma el disparador al pasar a «sent». */
create or replace function public.informe_enviar(p_instancia uuid)
returns public.informe_instancias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  r        public.informe_instancias;
begin
  if auth.uid() is null then
    raise exception 'Sin permiso para enviar este informe' using errcode = '42501';
  end if;
  select i.estado into v_estado from public.informe_instancias i where i.id = p_instancia;
  if v_estado is null then
    raise exception 'No existe ese informe' using errcode = 'P0002';
  end if;
  if not public.informe_instancia_visible(p_instancia) then
    raise exception 'Sin permiso para enviar este informe' using errcode = '42501';
  end if;
  if v_estado not in ('draft', 'back') then
    raise exception 'Solo se envía un informe en borrador o devuelto' using errcode = '23514';
  end if;

  -- Los dos pasos pasan por el guardián: quien no es jefe ni Planeación no pasa del primero.
  if v_estado = 'back' then
    update public.informe_instancias set estado = 'draft' where id = p_instancia;
  end if;
  update public.informe_instancias set estado = 'sent' where id = p_instancia;

  perform set_config('informe.sistema', 'si', true);
  update public.informe_instancias
     set estado = 'ok', nota_revision = ''
   where id = p_instancia and estado = 'sent'
  returning * into r;
  perform set_config('informe.sistema', '', true);

  if r.id is null then
    raise exception 'No se pudo enviar el informe' using errcode = '42501';
  end if;
  insert into public.informe_revisiones (instancia_id, decision, nota, por)
  values (p_instancia, 'aprobado', 'Aprobado automáticamente al enviar', auth.uid());
  return r;
end;
$$;

-- 6. Devolver (o reabrir un devuelto) -------------------------------------------------

/** Devolver con nota, aprobar a mano (solo Planeación) o pasar un devuelto a borrador. Deja la revisión escrita. */
create or replace function public.informe_cambiar_estado(p_instancia uuid, p_a text, p_nota text default null)
returns public.informe_instancias
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.informe_instancias;
begin
  if auth.uid() is null then
    raise exception 'No existe ese informe o no tiene permiso' using errcode = '42501';
  end if;
  if p_a not in ('ok', 'back', 'draft') then
    raise exception 'Estado no válido aquí: % (para enviar use informe_enviar)', p_a using errcode = '22023';
  end if;
  if p_a = 'back' and coalesce(btrim(p_nota), '') = '' then
    raise exception 'Para devolver un informe escriba la nota' using errcode = '23514';
  end if;
  if not public.informe_instancia_visible(p_instancia) then
    raise exception 'No existe ese informe o no tiene permiso' using errcode = '42501';
  end if;

  -- El guardián decide quién puede cada paso.
  if p_a = 'draft' then
    update public.informe_instancias set estado = 'draft' where id = p_instancia returning * into r;
  else
    update public.informe_instancias
       set estado = p_a, nota_revision = coalesce(p_nota, '')
     where id = p_instancia
    returning * into r;
  end if;
  if r.id is null then
    raise exception 'No existe ese informe o no tiene permiso' using errcode = '42501';
  end if;

  if p_a in ('ok', 'back') then
    insert into public.informe_revisiones (instancia_id, decision, nota, por)
    values (p_instancia, case p_a when 'ok' then 'aprobado' else 'devuelto' end, coalesce(p_nota, ''), auth.uid());
  end if;
  return r;
end;
$$;

revoke all on function public.informe_enviar(uuid) from public, anon;
revoke all on function public.informe_cambiar_estado(uuid, text, text) from public, anon;
grant execute on function public.informe_enviar(uuid) to authenticated;
grant execute on function public.informe_cambiar_estado(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
