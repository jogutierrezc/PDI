-- =============================================================================
-- 0150 · Catálogo abierto del reporte THE Impact
--
-- Cualquier oficina puede aportar a cualquier indicador (la asignación de 0149
-- solo sugiere). Faltaban dos cosas en la base:
--
--   1. Saber quién más aportó. Las oficinas siguen leyendo SOLO sus respuestas
--      (la política ranking_responses_read de 0149 no cambia); la RPC
--      `ranking_aportes(ciclo)` devuelve, por aporte, el indicador, la oficina,
--      su estado y si es la oficial. Nada de valores, comentarios ni evidencias.
--
--   2. Elegir la oficial. Columna `oficial` en ranking_responses: a lo sumo una
--      por indicador (índice único parcial). Solo Planeación la cambia, y solo
--      sobre una respuesta aprobada; lo hace cumplir el disparador. Si una
--      respuesta deja de estar aprobada, pierde la marca sola. Para marcar se
--      usa `ranking_marcar_oficial(resp)`, que quita la marca de las demás del
--      mismo indicador en la misma transacción.
--      Sin marca, la pantalla toma como oficial la aprobada más reciente.
--
-- Cómo probarla (SQL editor, con una sesión de prueba o como servicio):
--   select * from public.ranking_aportes('<ciclo>');            -- quién aportó
--   select public.ranking_marcar_oficial('<respuesta aprobada>'); -- Planeación
--   select indicador, unidad, oficial from public.ranking_responses where oficial;
--
-- Requiere 0149. Idempotente. Esta migración no borra filas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La columna «oficial»
-- -----------------------------------------------------------------------------

alter table public.ranking_responses add column if not exists oficial boolean not null default false;

comment on column public.ranking_responses.oficial is
  'La respuesta que va a THE por este indicador. Una por indicador; solo Planeación la marca, sobre una aprobada (ranking_marcar_oficial).';

-- Si alguna fila quedó marcada sin estar aprobada (no debería), se corrige antes del índice.
update public.ranking_responses set oficial = false where oficial and estado <> 'ok';

create unique index if not exists ranking_responses_oficial_unica
  on public.ranking_responses (ciclo, indicador) where oficial;

-- -----------------------------------------------------------------------------
-- 2. El disparador de 0149, ahora también con la marca oficial
-- -----------------------------------------------------------------------------

create or replace function public.ranking_responses_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  new.updated_at := now();

  if auth.uid() is null then
    -- Solo una aprobada puede ser la oficial: si deja de estarlo, pierde la marca.
    if new.estado <> 'ok' then
      new.oficial := false;
    end if;
    return new;
  end if;

  actor := public.ranking_actor(new.unidad);
  if actor is null or actor = 'visor' then
    raise exception 'Sin permiso para cambiar esta respuesta' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.estado not in ('none', 'draft') and actor <> 'planeacion' then
      raise exception 'Una respuesta nueva empieza en borrador' using errcode = '42501';
    end if;
    if new.oficial and (actor <> 'planeacion' or new.estado <> 'ok') then
      raise exception 'Solo Planeación marca la respuesta oficial, y sobre una aprobada' using errcode = '42501';
    end if;
    new.updated_by := auth.uid();
    return new;
  end if;

  if old.estado in ('sent', 'ok') and actor <> 'planeacion' then
    raise exception 'La respuesta ya se envió: solo Planeación la puede cambiar' using errcode = '42501';
  end if;

  if new.estado is distinct from old.estado
     and not public.ranking_transicion_permitida(old.estado, new.estado, actor) then
    raise exception 'Cambio de estado no permitido: % → % (%)', old.estado, new.estado, actor
      using errcode = '42501';
  end if;

  -- Marcar o desmarcar la oficial: solo Planeación.
  if new.oficial is distinct from old.oficial and actor <> 'planeacion' then
    raise exception 'Solo Planeación marca la respuesta oficial' using errcode = '42501';
  end if;

  -- Solo una aprobada puede ser la oficial: si deja de estarlo (p. ej. ok → back), pierde la marca.
  if new.estado <> 'ok' then
    new.oficial := false;
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Marcar la oficial (solo Planeación, solo una aprobada)
-- -----------------------------------------------------------------------------

create or replace function public.ranking_marcar_oficial(resp uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fila public.ranking_responses%rowtype;
begin
  if not public.has_role_at_least('planeacion') then
    raise exception 'Solo Planeación marca la respuesta oficial' using errcode = '42501';
  end if;

  select * into fila from public.ranking_responses where id = resp for update;
  if not found then
    raise exception 'No existe esa respuesta' using errcode = 'P0002';
  end if;
  if fila.estado <> 'ok' then
    raise exception 'Solo una respuesta aprobada puede ser la oficial' using errcode = '23514';
  end if;

  -- Primero se quita la de las demás (el índice único no admite dos a la vez).
  update public.ranking_responses
     set oficial = false
   where ciclo = fila.ciclo and indicador = fila.indicador and oficial and id <> resp;

  update public.ranking_responses set oficial = true where id = resp and not oficial;
end;
$$;

comment on function public.ranking_marcar_oficial(uuid) is
  'Marca la respuesta aprobada como la oficial de su indicador y quita la marca a las demás. Solo Planeación.';

-- -----------------------------------------------------------------------------
-- 4. Quién aportó a cada indicador (sin contenido)
-- -----------------------------------------------------------------------------

create or replace function public.ranking_aportes(p_ciclo uuid)
returns table (indicador text, unidad uuid, unidad_nombre text, estado text, oficial boolean, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Planeación o cualquier miembro de una oficina (visor, editor o jefe), como leer el catálogo.
  if not public.ranking_puede_leer_ciclo() then
    raise exception 'Sin permiso para ver los aportes' using errcode = '42501';
  end if;

  return query
    select r.indicador, r.unidad, u.name::text, r.estado, r.oficial, r.updated_at
      from public.ranking_responses r
      join public.units u on u.id = r.unidad
     where r.ciclo = p_ciclo
       and r.estado <> 'none'
     order by r.indicador, u.name;
end;
$$;

comment on function public.ranking_aportes(uuid) is
  'Por aporte (estado distinto de none): indicador, oficina, estado y si es la oficial. Sin valores ni comentarios. Planeación o miembros de oficina.';

revoke all on function public.ranking_aportes(uuid) from public, anon;
revoke all on function public.ranking_marcar_oficial(uuid) from public, anon;
grant execute on function public.ranking_aportes(uuid) to authenticated;
grant execute on function public.ranking_marcar_oficial(uuid) to authenticated;

notify pgrst, 'reload schema';
