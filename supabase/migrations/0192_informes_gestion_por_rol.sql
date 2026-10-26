-- =============================================================================
-- PDI · 0192 · La gestión de Informes Institucionales la concede el rol de acceso
--
-- EL PROBLEMA. Todo el módulo decidía «¿gestiona?» con la capacidad global
-- (profiles.role >= planeacion). La capacidad de un rol es el MÁXIMO que pide
-- cualquiera de sus módulos, así que un rol con «Ver» en Informes y, por
-- ejemplo, «Editar» en el Portal tenía capacidad de Planeación y, con ella,
-- el tablero del ciclo, la revisión, el consolidador, la capacitación de Pilo y
-- el informe de cualquier unidad.
--
-- LA REGLA. Se gestiona (tablero, abrir y ver el informe de cualquier unidad,
-- revisión, consolidador, requisitos, ciclos, fuentes, corpus y aprendizaje de
-- Pilo) cuando:
--   · se es administrador general; o
--   · se tiene capacidad de Planeación y, o bien NO se tiene rol de acceso
--     (como siempre), o bien el rol marca la pantalla «informes» y lleva
--     access_roles.informe_gestion = true (se activa al elegir «Editar» en
--     Informes de gestión en la matriz del rol).
-- Quien no gestiona solo toca el informe de su unidad (pertenencia en
-- unit_members) y de las unidades que su rol le da (0169), y solo si su rol
-- (si tiene uno) marca la pantalla «informes»: la base queda alineada con la
-- interfaz, donde «un rol que no marca la pantalla la cierra».
--
-- OBJETOS NUEVOS
--   columna  access_roles.informe_gestion
--   función  informe_gestiona()              la regla de arriba
--   función  informe_puede_leer_ciclo()      leer ciclos, requisitos y fuentes
--
-- OBJETOS REESCRITOS (has_role_at_least('planeacion') → informe_gestiona())
--   funciones  informe_mis_unidades (exige la pantalla «informes»),
--              informe_actor (rama 'planeacion' y pantalla), informe_can_view,
--              informe_instancia_visible, informe_instancia_abierta,
--              informe_abrir, informe_reabrir_si_devuelto, informe_consolidado
--   políticas  informe_ciclos_read/write, informe_requisitos_read/write,
--              informe_fuentes_read/write, informe_instancias_read/insert/
--              update/delete, informe_revisiones_write, informe_ejemplos_
--              planeacion, informe_aprendizaje_planeacion, informe_perfiles_
--              lectura (0189)
--   storage    bucket informe-anexos: informe_anexos_lectura/escritura/
--              reemplazo/borrado; bucket informe-portadas: informe_portadas_
--              lectura/escritura/reemplazo/borrado
--
-- SIN CAMBIO, PORQUE YA CUELGAN DE LAS ANTERIORES: informe_instancias_guard
-- (usa informe_actor), informe_hijo_guard, informe_metas_sincronizar,
-- informe_cifras_vivas, políticas de secciones/cifras/anexos/informe_diseno
-- (usan informe_instancia_visible/abierta), informe_perfiles_alta/cambio
-- (usan informe_actor), informe_can_edit. informe_vivas_de y las internas
-- siguen revocadas a authenticated.
--
-- PASE A PRODUCCIÓN (leer antes de aplicar). El nuevo flag nace en falso. Solo
-- se activa, una vez, en los roles «de fábrica»: all_screens = true y
-- base_role planeacion o admin. Los roles PERSONALIZADOS que ya daban gestión
-- (por capacidad de Planeación) la pierden hasta que el administrador abra el
-- rol en Usuarios y roles, marque «Editar» en Informes de gestión y lo guarde.
-- Quien no tiene rol de acceso no cambia.
--
-- Requiere 0024, 0057, 0149, 0153, 0165, 0169 y 0189. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El flag del rol (y su backfill, una sola vez)
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'access_roles' and column_name = 'informe_gestion'
  ) then
    alter table public.access_roles add column informe_gestion boolean not null default false;
    update public.access_roles
       set informe_gestion = true
     where all_screens
       and base_role in ('planeacion', 'admin');
  end if;
end $$;

comment on column public.access_roles.informe_gestion is
  'Informes Institucionales (0192): el rol gestiona los informes de todas las unidades (tablero del ciclo, revisión, consolidador, capacitación de Pilo). Se activa al elegir «Editar» en Informes de gestión; exige capacidad de Planeación y la pantalla «informes».';

-- -----------------------------------------------------------------------------
-- 2. La regla
-- -----------------------------------------------------------------------------

/** ¿Gestiona los informes de todas las unidades quien pregunta? */
create or replace function public.informe_gestiona()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() is null then false
    when public.has_role_at_least('admin') then true
    when not public.has_role_at_least('planeacion') then false
    when not public.has_access_role() then true
    else exists (
      select 1
        from public.profiles p
        join public.access_roles r on r.id = p.access_role_id
       where p.id = auth.uid()
         and p.is_active
         and r.informe_gestion
         and (r.all_screens or 'informes' = any (r.screens))
    )
  end;
$$;

comment on function public.informe_gestiona() is
  'Informes (0192): administrador general, o Planeación sin rol de acceso, o Planeación cuyo rol marca la pantalla informes y lleva informe_gestion.';

/** ¿Puede leer ciclos, requisitos y catálogo de fuentes? Gestión, o quien participa de algún informe y ve la pantalla. */
create or replace function public.informe_puede_leer_ciclo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.informe_gestiona()
      or (
        public.has_screen('informes')
        and (
          exists (select 1 from public.unit_members m where m.profile_id = auth.uid())
          or exists (select 1 from public.informe_mis_unidades())
        )
      );
$$;

-- -----------------------------------------------------------------------------
-- 3. Lo que el rol le da a quien pregunta, y su papel en cada unidad
-- -----------------------------------------------------------------------------

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
     and (r.all_screens or 'informes' = any (r.screens))
     and (
       r.all_informe_units
       or exists (select 1 from public.access_role_informe_units ru where ru.access_role_id = r.id and ru.unit_id = u.id)
     );
$$;

create or replace function public.informe_actor(unidad uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when public.informe_gestiona() then 'planeacion'
           when not public.has_screen('informes') then null
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
  select public.informe_gestiona() or public.informe_actor(unidad) is not null;
$$;

revoke all on function public.informe_gestiona() from public, anon;
revoke all on function public.informe_puede_leer_ciclo() from public, anon;
revoke all on function public.informe_mis_unidades() from public, anon;
revoke all on function public.informe_actor(uuid) from public, anon;
revoke all on function public.informe_can_view(uuid) from public, anon;
grant execute on function public.informe_gestiona() to authenticated;
grant execute on function public.informe_puede_leer_ciclo() to authenticated;
grant execute on function public.informe_mis_unidades() to authenticated;
grant execute on function public.informe_actor(uuid) to authenticated;
grant execute on function public.informe_can_view(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Las funciones del contrato (mismas firmas)
-- -----------------------------------------------------------------------------

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
  select public.informe_gestiona()
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
  if not (public.informe_gestiona() or public.informe_can_edit(p_unit)) then
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

create or replace function public.informe_reabrir_si_devuelto(p_instancia uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.informe_instancias set estado = 'draft'
   where id = p_instancia and estado = 'back' and not public.informe_gestiona();
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
     or not (public.informe_gestiona() or public.informe_can_view(inst.unit_id)) then
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

revoke all on function public.informe_abrir(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.informe_reabrir_si_devuelto(uuid) from public, anon;
revoke all on function public.informe_consolidado(uuid) from public, anon;
grant execute on function public.informe_abrir(uuid, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.informe_reabrir_si_devuelto(uuid) to authenticated, service_role;
grant execute on function public.informe_consolidado(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Políticas de las tablas
-- -----------------------------------------------------------------------------

drop policy if exists informe_ciclos_read on public.informe_ciclos;
create policy informe_ciclos_read on public.informe_ciclos for select to authenticated
  using (public.informe_puede_leer_ciclo());
drop policy if exists informe_ciclos_write on public.informe_ciclos;
create policy informe_ciclos_write on public.informe_ciclos for all to authenticated
  using (public.informe_gestiona())
  with check (public.informe_gestiona());

drop policy if exists informe_requisitos_read on public.informe_requisitos;
create policy informe_requisitos_read on public.informe_requisitos for select to authenticated
  using (public.informe_puede_leer_ciclo());
drop policy if exists informe_requisitos_write on public.informe_requisitos;
create policy informe_requisitos_write on public.informe_requisitos for all to authenticated
  using (public.informe_gestiona())
  with check (public.informe_gestiona());

drop policy if exists informe_fuentes_read on public.informe_fuentes;
create policy informe_fuentes_read on public.informe_fuentes for select to authenticated
  using (public.informe_puede_leer_ciclo());
drop policy if exists informe_fuentes_write on public.informe_fuentes;
create policy informe_fuentes_write on public.informe_fuentes for all to authenticated
  using (public.informe_gestiona())
  with check (public.informe_gestiona());

drop policy if exists informe_instancias_read on public.informe_instancias;
create policy informe_instancias_read on public.informe_instancias for select to authenticated
  using (public.informe_gestiona()
         or public.informe_can_view(unit_id)
         or (destino is not null and public.informe_can_view(destino)));
drop policy if exists informe_instancias_insert on public.informe_instancias;
create policy informe_instancias_insert on public.informe_instancias for insert to authenticated
  with check (public.informe_gestiona() or public.informe_can_edit(unit_id));
drop policy if exists informe_instancias_update on public.informe_instancias;
create policy informe_instancias_update on public.informe_instancias for update to authenticated
  using (public.informe_gestiona() or public.informe_can_edit(unit_id))
  with check (public.informe_gestiona() or public.informe_can_edit(unit_id));
drop policy if exists informe_instancias_delete on public.informe_instancias;
create policy informe_instancias_delete on public.informe_instancias for delete to authenticated
  using (public.informe_gestiona());

drop policy if exists informe_revisiones_write on public.informe_revisiones;
create policy informe_revisiones_write on public.informe_revisiones for all to authenticated
  using (public.informe_gestiona())
  with check (public.informe_gestiona());

drop policy if exists informe_ejemplos_planeacion on public.informe_ejemplos;
create policy informe_ejemplos_planeacion on public.informe_ejemplos for all to authenticated
  using (public.informe_gestiona())
  with check (public.informe_gestiona());

drop policy if exists informe_aprendizaje_planeacion on public.informe_aprendizaje;
create policy informe_aprendizaje_planeacion on public.informe_aprendizaje for all to authenticated
  using (public.informe_gestiona())
  with check (public.informe_gestiona());

drop policy if exists informe_perfiles_lectura on public.informe_perfiles;
create policy informe_perfiles_lectura on public.informe_perfiles
  for select to authenticated
  using (public.informe_gestiona() or public.informe_can_view(unit_id));

-- -----------------------------------------------------------------------------
-- 6. Buckets (privados). La ruta empieza por el id de la unidad.
--
-- Si quien aplica la migración no es dueño de storage.objects, el resto queda
-- aplicado y el aviso dice qué hacer. Los anexos pasan de unit_can_view/edit
-- (solo pertenencia) a informe_can_view/edit, que suma lo que da el rol (0169)
-- y exige la pantalla «informes».
-- -----------------------------------------------------------------------------

do $$
begin
  execute 'drop policy if exists informe_anexos_lectura on storage.objects';
  execute $pol$
    create policy informe_anexos_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'informe-anexos'
             and (public.informe_gestiona()
                  or public.informe_can_view(public.ranking_unidad_de_ruta(name))))
  $pol$;

  execute 'drop policy if exists informe_anexos_escritura on storage.objects';
  execute $pol$
    create policy informe_anexos_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'informe-anexos'
                  and (public.informe_gestiona()
                       or public.informe_can_edit(public.ranking_unidad_de_ruta(name)))
                  and public.informe_instancia_abierta(public.ranking_respuesta_de_ruta(name)))
  $pol$;

  execute 'drop policy if exists informe_anexos_reemplazo on storage.objects';
  execute $pol$
    create policy informe_anexos_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'informe-anexos'
             and (public.informe_gestiona()
                  or public.informe_can_edit(public.ranking_unidad_de_ruta(name)))
             and public.informe_instancia_abierta(public.ranking_respuesta_de_ruta(name)))
      with check (bucket_id = 'informe-anexos'
                  and (public.informe_gestiona()
                       or public.informe_can_edit(public.ranking_unidad_de_ruta(name)))
                  and public.informe_instancia_abierta(public.ranking_respuesta_de_ruta(name)))
  $pol$;

  execute 'drop policy if exists informe_anexos_borrado on storage.objects';
  execute $pol$
    create policy informe_anexos_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'informe-anexos'
             and (public.informe_gestiona()
                  or public.informe_can_edit(public.ranking_unidad_de_ruta(name)))
             and public.informe_instancia_abierta(public.ranking_respuesta_de_ruta(name)))
  $pol$;

  execute 'drop policy if exists informe_portadas_lectura on storage.objects';
  execute $pol$
    create policy informe_portadas_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'informe-portadas'
             and (public.informe_gestiona()
                  or public.informe_can_view(public.ranking_unidad_de_ruta(name))))
  $pol$;

  execute 'drop policy if exists informe_portadas_escritura on storage.objects';
  execute $pol$
    create policy informe_portadas_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'informe-portadas'
                  and (public.informe_gestiona()
                       or public.informe_can_edit(public.ranking_unidad_de_ruta(name))))
  $pol$;

  execute 'drop policy if exists informe_portadas_reemplazo on storage.objects';
  execute $pol$
    create policy informe_portadas_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'informe-portadas'
             and (public.informe_gestiona()
                  or public.informe_can_edit(public.ranking_unidad_de_ruta(name))))
      with check (bucket_id = 'informe-portadas'
                  and (public.informe_gestiona()
                       or public.informe_can_edit(public.ranking_unidad_de_ruta(name))))
  $pol$;

  execute 'drop policy if exists informe_portadas_borrado on storage.objects';
  execute $pol$
    create policy informe_portadas_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'informe-portadas'
             and (public.informe_gestiona()
                  or public.informe_can_edit(public.ranking_unidad_de_ruta(name))))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudieron reescribir las políticas de los buckets informe-anexos e informe-portadas (%). Reescríbalas a mano: donde decía has_role_at_least(''planeacion'') debe decir informe_gestiona().',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';
