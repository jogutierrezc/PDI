-- =============================================================================
-- PDI · 0169 · Roles de acceso que escriben informes (Informes Institucionales)
--
-- En Informes Institucionales quien escribe el informe de una unidad es quien
-- PERTENECE a ella (unit_members: editor = Contribuyente, jefe = Gestor). Al
-- crear un rol de acceso no había dónde decir «este rol escribe el informe de
-- estas unidades». Esto lo añade, igual que 0154 hizo con Impacto:
--
--   access_roles.informe_level        none · editor · jefe
--                                     editor  diligencia el informe (Contribuyente)
--                                     jefe    además lo envía (Gestor)
--   access_roles.all_informe_units    el alcance es toda la estructura
--   access_role_informe_units         si no: estas unidades (exactas, sin herencia
--                                     por el árbol: la facultad no arrastra a sus
--                                     programas, cada informe es de una unidad)
--
-- NINGUNA POLÍTICA PARA OTROS MÓDULOS CAMBIA. Solo las funciones de permiso de
-- los informes preguntan ahora a informe_actor(), que une el papel por
-- pertenencia con el que da el rol. unit_role_at / unit_can_* no se tocan (los
-- usan Mis Tableros y Rankings). Planeación sigue mandando sobre todo.
--
-- Requiere 0024, 0057, 0149 y 0153. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El rol lleva su nivel y su alcance
-- -----------------------------------------------------------------------------

alter table public.access_roles
  add column if not exists informe_level text not null default 'none',
  add column if not exists all_informe_units boolean not null default false;

alter table public.access_roles drop constraint if exists access_roles_informe_level_check;
alter table public.access_roles
  add constraint access_roles_informe_level_check check (informe_level in ('none', 'editor', 'jefe'));

comment on column public.access_roles.informe_level is
  'Informes Institucionales: none (solo el de su unidad, si pertenece a una), editor (diligencia) o jefe (además envía) los informes de su alcance.';
comment on column public.access_roles.all_informe_units is
  'Informes Institucionales: el alcance del rol es toda la estructura; si no, las unidades de access_role_informe_units.';

create table if not exists public.access_role_informe_units (
  access_role_id uuid not null references public.access_roles (id) on delete cascade,
  unit_id        uuid not null references public.units (id) on delete cascade,
  primary key (access_role_id, unit_id)
);

create index if not exists access_role_informe_units_unit_idx on public.access_role_informe_units (unit_id);

comment on table public.access_role_informe_units is
  'Alcance de un rol en Informes Institucionales: las unidades cuyo informe escribe quien lleve el rol.';

alter table public.access_role_informe_units enable row level security;

drop policy if exists access_role_informe_units_read on public.access_role_informe_units;
create policy access_role_informe_units_read on public.access_role_informe_units for select to authenticated
  using (public.has_role_at_least('consulta'));

drop policy if exists access_role_informe_units_write on public.access_role_informe_units;
create policy access_role_informe_units_write on public.access_role_informe_units for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.access_role_informe_units to authenticated;
grant insert, update, delete on public.access_role_informe_units to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Lo que el rol le da a quien pregunta, y su papel en cada unidad
-- -----------------------------------------------------------------------------

/** Las unidades cuyo informe puede escribir quien pregunta por su rol de acceso, con el papel que le da. */
create or replace function public.informe_mis_unidades()
returns table (unit_id uuid, role text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         case r.informe_level when 'jefe' then 'jefe' else 'editor' end
    from public.profiles p
    join public.access_roles r on r.id = p.access_role_id
    join public.units u on true
   where p.id = auth.uid()
     and p.is_active
     and r.informe_level <> 'none'
     and (
       r.all_informe_units
       or exists (select 1 from public.access_role_informe_units ru where ru.access_role_id = r.id and ru.unit_id = u.id)
     );
$$;

comment on function public.informe_mis_unidades() is
  'Informes: las unidades que el rol de acceso de quien pregunta le da para escribir (editor) o enviar (jefe) su informe.';

/**
 * El papel de quien pregunta frente al informe de una unidad: Planeación, o el
 * más fuerte entre su pertenencia (con la herencia del árbol) y lo que le da su
 * rol de acceso. Nulo si no tiene ninguno.
 */
create or replace function public.informe_actor(unidad uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when public.has_role_at_least('planeacion') then 'planeacion'
           else (
             select x.rol
               from (
                 select public.unit_role_at(unidad) as rol
                 union all
                 select s.role from public.informe_mis_unidades() s where s.unit_id = unidad
               ) x
              where x.rol is not null
              order by case x.rol when 'jefe' then 3 when 'editor' then 2 else 1 end desc
              limit 1
           )
         end;
$$;

create or replace function public.informe_can_view(unidad uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('admin') or public.informe_actor(unidad) is not null;
$$;

create or replace function public.informe_can_edit(unidad uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.informe_actor(unidad) in ('editor', 'jefe');
$$;

revoke all on function public.informe_mis_unidades() from public, anon;
revoke all on function public.informe_actor(uuid) from public, anon;
revoke all on function public.informe_can_view(uuid) from public, anon;
revoke all on function public.informe_can_edit(uuid) from public, anon;
grant execute on function public.informe_mis_unidades() to authenticated;
grant execute on function public.informe_actor(uuid) to authenticated;
grant execute on function public.informe_can_view(uuid) to authenticated;
grant execute on function public.informe_can_edit(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Las funciones de 0153, sobre el papel efectivo (mismas firmas)
-- -----------------------------------------------------------------------------

create or replace function public.informe_instancia_visible(inst uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
      or exists (
           select 1 from public.informe_instancias i
            where i.id = inst
              and public.informe_can_view(i.unit_id)
         );
$$;

create or replace function public.informe_instancia_abierta(inst uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
      or exists (
           select 1
             from public.informe_instancias i
             join public.informe_ciclos c on c.id = i.ciclo_id
            where i.id = inst
              and i.estado in ('draft', 'back')
              and c.estado = 'abierto'
              and public.informe_can_edit(i.unit_id)
         );
$$;

create or replace function public.informe_abrir(p_ciclo uuid, p_unit uuid, p_plantilla text, p_destino uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select i.id into v_id from public.informe_instancias i where i.ciclo_id = p_ciclo and i.unit_id = p_unit;
  if v_id is not null then
    return v_id;
  end if;
  if not (public.has_role_at_least('planeacion') or public.informe_can_edit(p_unit)) then
    raise exception 'Sin permiso para abrir el informe de esta unidad' using errcode = '42501';
  end if;
  insert into public.informe_instancias (ciclo_id, unit_id, plantilla, destino)
  values (p_ciclo, p_unit, upper(btrim(p_plantilla)),
          coalesce(p_destino, (select coalesce(u.reports_to, u.parent_id) from public.units u where u.id = p_unit)))
  on conflict (ciclo_id, unit_id) do nothing
  returning id into v_id;
  if v_id is null then
    select i.id into v_id from public.informe_instancias i where i.ciclo_id = p_ciclo and i.unit_id = p_unit;
  end if;
  return v_id;
end;
$$;

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

  actor := public.informe_actor(new.unit_id);
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
    end if;
    new.updated_by := auth.uid();
    return new;
  end if;

  if actor <> 'planeacion' then
    if old.estado in ('sent', 'ok') then
      raise exception 'El informe ya se envió: solo Planeación lo puede cambiar' using errcode = '42501';
    end if;
    if (new.ciclo_id, new.unit_id, new.plantilla, new.destino, new.nota_revision)
       is distinct from (old.ciclo_id, old.unit_id, old.plantilla, old.destino, old.nota_revision) then
      raise exception 'Solo Planeación cambia la plantilla, el destino o la nota de revisión' using errcode = '42501';
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

create or replace function public.informe_consolidado(p_instancia uuid)
returns table (instancia_id uuid, unit_id uuid, unit_nombre text, plantilla text,
               seccion_clave text, orden int, contenido jsonb, aprobado_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inst record;
begin
  select i.unit_id, i.ciclo_id into inst from public.informe_instancias i where i.id = p_instancia;
  if inst.unit_id is null
     or not (public.has_role_at_least('planeacion') or public.informe_can_view(inst.unit_id)) then
    raise exception 'Sin permiso para ver el consolidado' using errcode = '42501';
  end if;
  return query
    select h.id, h.unit_id, u.name::text, h.plantilla, s.clave, s.orden, s.contenido, h.aprobado_en
      from public.informe_instancias h
      join public.units u on u.id = h.unit_id
      join public.informe_secciones s on s.instancia_id = h.id
     where h.ciclo_id = inst.ciclo_id
       and h.destino = inst.unit_id
       and h.estado = 'ok'
       and h.id <> p_instancia
     order by u.name, s.orden;
end;
$$;

drop policy if exists informe_instancias_read on public.informe_instancias;
create policy informe_instancias_read on public.informe_instancias for select to authenticated
  using (public.has_role_at_least('planeacion')
         or public.informe_can_view(unit_id)
         or (destino is not null and public.informe_can_view(destino)));
drop policy if exists informe_instancias_insert on public.informe_instancias;
create policy informe_instancias_insert on public.informe_instancias for insert to authenticated
  with check (public.has_role_at_least('planeacion') or public.informe_can_edit(unit_id));
drop policy if exists informe_instancias_update on public.informe_instancias;
create policy informe_instancias_update on public.informe_instancias for update to authenticated
  using (public.has_role_at_least('planeacion') or public.informe_can_edit(unit_id))
  with check (public.has_role_at_least('planeacion') or public.informe_can_edit(unit_id));

notify pgrst, 'reload schema';
