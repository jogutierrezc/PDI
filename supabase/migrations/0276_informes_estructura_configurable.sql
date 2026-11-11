-- =============================================================================
-- PDI · 0276 · Informes de gestión · estructura configurable por ciclo
--
-- Requiere 0153, 0192 (informe_gestiona, informe_puede_leer_ciclo) y 0272. Idempotente.
--
-- Planeación arma, por ciclo y plantilla (A–D), qué secciones lleva el informe:
-- activa o no, orden, título propio, si la unidad la puede editar («solo lectura»
-- para ella) y secciones libres nuevas (clave x1, x2…). Sin fila de configuración
-- manda la plantilla del código, así que nada cambia hasta que Planeación configure.
--
--   informe_secciones_config           una fila por ciclo + plantilla + clave
--   informe_secciones_config_guard     reglas del ciclo: abierto o cerrado solo permite
--                                      activar/desactivar y cambiar la edición; sin agregar,
--                                      borrar, renombrar ni reordenar (solo en preparación)
--   informe_secciones_config_baja      al borrar una libre se borra lo escrito en ella
--   informe_secciones_solo_lectura     una sección en solo lectura no cambia de contenido
--                                      si quien escribe no gestiona los informes
--   informe_validar_envio              (reescrita de 0153) no exige las secciones inactivas
--                                      ni justificar cifras de una sección inactiva
--
-- LÍMITE: «solo lectura» cubre el contenido de la sección (informe_secciones). Las cifras
-- que cuelgan de una sección (informe_cifras: indicadores conectados, datos propios) las
-- bloquea la pantalla, no la base.
-- =============================================================================

create table if not exists public.informe_secciones_config (
  ciclo_id            uuid not null references public.informe_ciclos (id) on delete cascade,
  plantilla           text not null,
  clave               text not null,
  activa              boolean not null default true,
  orden               integer,
  titulo              text,
  editable_por_unidad boolean not null default true,
  libre               boolean not null default false,
  minimo              integer,
  updated_at          timestamptz not null default now(),
  constraint informe_secciones_config_pk primary key (ciclo_id, plantilla, clave),
  constraint informe_secciones_config_plantilla check (plantilla in ('A', 'B', 'C', 'D')),
  constraint informe_secciones_config_clave check ((libre and clave ~ '^x[0-9]{1,3}$') or (not libre and clave ~ '^s[0-9]{1,3}$')),
  constraint informe_secciones_config_titulo check (titulo is null or char_length(btrim(titulo)) between 1 and 120),
  constraint informe_secciones_config_libre_titulo check (not libre or titulo is not null),
  constraint informe_secciones_config_minimo check (minimo is null or minimo between 0 and 2000)
);

comment on table public.informe_secciones_config is
  'Estructura del informe por ciclo y plantilla (0276). Sin fila: la plantilla del código. orden y titulo nulos: los de la plantilla; libre: sección nueva (x1…).';

-- -----------------------------------------------------------------------------
-- Reglas del ciclo
-- -----------------------------------------------------------------------------

create or replace function public.informe_secciones_config_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ciclo  uuid := case when tg_op = 'DELETE' then old.ciclo_id else new.ciclo_id end;
  v_estado text;
  v_old    public.informe_secciones_config%rowtype;
begin
  if tg_op <> 'DELETE' then
    new.updated_at := now();
  end if;
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  select c.estado into v_estado from public.informe_ciclos c where c.id = v_ciclo;
  if v_estado is distinct from 'preparacion' then
    if tg_op = 'DELETE' then
      raise exception 'Con el ciclo abierto o cerrado no se pueden borrar secciones' using errcode = '23514';
    end if;
    -- Un upsert dispara este INSERT antes de saber si la fila ya existe: si existe, se compara con ella.
    if tg_op = 'UPDATE' then
      v_old := old;
    else
      select * into v_old from public.informe_secciones_config k
       where k.ciclo_id = new.ciclo_id and k.plantilla = new.plantilla and k.clave = new.clave;
    end if;
    if v_old.clave is null then
      if new.libre or new.orden is not null or new.titulo is not null or new.minimo is not null then
        raise exception 'Con el ciclo abierto o cerrado no se pueden agregar, renombrar ni reordenar secciones' using errcode = '23514';
      end if;
    elsif new.libre is distinct from v_old.libre
       or new.orden is distinct from v_old.orden
       or new.titulo is distinct from v_old.titulo
       or new.minimo is distinct from v_old.minimo then
      raise exception 'Con el ciclo abierto o cerrado solo se puede activar, desactivar o cambiar la edición de una sección' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists informe_secciones_config_guard_trg on public.informe_secciones_config;
create trigger informe_secciones_config_guard_trg before insert or update or delete on public.informe_secciones_config
  for each row execute function public.informe_secciones_config_guard();

/** Al borrar una sección libre se borra lo que las unidades escribieron en ella. */
create or replace function public.informe_secciones_config_baja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes text := current_setting('informe.sistema', true);
begin
  if old.libre then
    perform set_config('informe.sistema', 'si', true);
    delete from public.informe_secciones s
     using public.informe_instancias i
     where s.instancia_id = i.id and i.ciclo_id = old.ciclo_id and i.plantilla = old.plantilla and s.clave = old.clave;
    perform set_config('informe.sistema', coalesce(v_antes, ''), true);
  end if;
  return old;
end;
$$;

drop trigger if exists informe_secciones_config_baja_trg on public.informe_secciones_config;
create trigger informe_secciones_config_baja_trg after delete on public.informe_secciones_config
  for each row execute function public.informe_secciones_config_baja();

-- -----------------------------------------------------------------------------
-- Solo lectura: el contenido de la sección no lo cambia la unidad
-- -----------------------------------------------------------------------------

create or replace function public.informe_secciones_solo_lectura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solo boolean;
begin
  if auth.uid() is null or current_setting('informe.sistema', true) = 'si' then
    return new;
  end if;
  if public.informe_gestiona() then
    return new;
  end if;
  select exists (
    select 1
      from public.informe_instancias i
      join public.informe_secciones_config k
        on k.ciclo_id = i.ciclo_id and k.plantilla = i.plantilla and k.clave = new.clave
     where i.id = new.instancia_id and not k.editable_por_unidad
  ) into v_solo;
  if not v_solo then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.contenido, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Esta sección es de solo lectura: la definió Planeación' using errcode = '42501';
    end if;
  elsif new.contenido is distinct from old.contenido then
    raise exception 'Esta sección es de solo lectura: la definió Planeación' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists informe_secciones_solo_lectura_trg on public.informe_secciones;
create trigger informe_secciones_solo_lectura_trg before insert or update on public.informe_secciones
  for each row execute function public.informe_secciones_solo_lectura();

-- -----------------------------------------------------------------------------
-- Lo que se exige para enviar (0153) sin las secciones inactivas
-- -----------------------------------------------------------------------------

create or replace function public.informe_validar_envio(p_instancia uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inst    record;
  faltan  text;
begin
  select i.plantilla, i.ciclo_id, c.estado as ciclo_estado, c.config into inst
    from public.informe_instancias i
    join public.informe_ciclos c on c.id = i.ciclo_id
   where i.id = p_instancia;

  if inst.ciclo_estado <> 'abierto' then
    raise exception 'El ciclo no está abierto: no se puede enviar' using errcode = '23514';
  end if;
  if not exists (select 1 from public.informe_secciones s where s.instancia_id = p_instancia) then
    raise exception 'El informe no tiene secciones' using errcode = '23514';
  end if;
  select string_agg(s.clave, ', ' order by s.orden) into faltan
    from public.informe_secciones s
   where s.instancia_id = p_instancia and not s.listo
     and not exists (
       select 1 from public.informe_secciones_config k
        where k.ciclo_id = inst.ciclo_id and k.plantilla = inst.plantilla and k.clave = s.clave and not k.activa
     );
  if faltan is not null then
    raise exception 'Faltan secciones por terminar: %', faltan using errcode = '23514';
  end if;

  if coalesce((inst.config ->> 'exigir_fuente')::boolean, true) then
    select string_agg(x.clave, ', ' order by x.clave) into faltan
      from public.informe_cifras x
     where x.instancia_id = p_instancia and x.incluida and x.propia and btrim(x.fuente_nombre) = '';
    if faltan is not null then
      raise exception 'Falta el nombre de la fuente en: %', faltan using errcode = '23514';
    end if;
  end if;
  if coalesce((inst.config ->> 'exigir_pilar')::boolean, false) then
    select string_agg(x.clave, ', ' order by x.clave) into faltan
      from public.informe_cifras x
     where x.instancia_id = p_instancia and x.incluida and x.propia and coalesce(btrim(x.pilar), '') = '';
    if faltan is not null then
      raise exception 'Falta el pilar del PDI en: %', faltan using errcode = '23514';
    end if;
  end if;

  select string_agg(x.clave, ', ' order by x.clave) into faltan
    from public.informe_requisitos r
    join public.informe_cifras x on x.instancia_id = p_instancia and x.clave = r.clave
   where r.ciclo_id = inst.ciclo_id and r.plantilla = inst.plantilla and r.condicion = 'justificar'
     and (not x.incluida or btrim(x.justificacion) = '')
     and not exists (
       select 1 from public.informe_secciones_config k
        where k.ciclo_id = inst.ciclo_id and k.plantilla = inst.plantilla and k.clave = x.seccion_clave and not k.activa
     );
  if faltan is not null then
    raise exception 'Falta justificar (y dejar incluidas) las cifras: %', faltan using errcode = '23514';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS (como informe_requisitos tras 0192)
-- -----------------------------------------------------------------------------

alter table public.informe_secciones_config enable row level security;

drop policy if exists informe_secciones_config_read on public.informe_secciones_config;
create policy informe_secciones_config_read on public.informe_secciones_config for select to authenticated
  using (public.informe_puede_leer_ciclo());
drop policy if exists informe_secciones_config_write on public.informe_secciones_config;
create policy informe_secciones_config_write on public.informe_secciones_config for all to authenticated
  using (public.informe_gestiona())
  with check (public.informe_gestiona());

grant select, insert, update, delete on public.informe_secciones_config to authenticated;

-- -----------------------------------------------------------------------------
-- Siembra: cada plantilla de cada ciclo existente, con los valores del código
-- (todas activas y editables). A=10, B=9, C=8, D=8 secciones. Sin título ni orden propios.
-- -----------------------------------------------------------------------------

insert into public.informe_secciones_config (ciclo_id, plantilla, clave)
select c.id, p.plantilla, 's' || n
  from public.informe_ciclos c
  cross join (values ('A', 10), ('B', 9), ('C', 8), ('D', 8)) as p (plantilla, total)
  cross join lateral generate_series(1, p.total) as n
on conflict (ciclo_id, plantilla, clave) do nothing;
