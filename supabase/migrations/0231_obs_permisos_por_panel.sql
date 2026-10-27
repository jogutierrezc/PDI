-- =============================================================================
-- PDI · 0231 · Observatorio de Analítica: permisos por panel, nivel y alcance
--
-- Hasta ahora el Observatorio tenía UNA pantalla en el rol («observatorio») y
-- el nivel salía de la capacidad (Planeación editaba; el resto, leía). Esta
-- migración lo reparte como Impacto o Gestión Master: el rol dice QUÉ PANELES,
-- QUÉ NIVEL y SOBRE QUÉ OBSERVATORIOS, y la base lo hace cumplir.
--
-- PANELES (pantallas de rol, access_roles.screens):
--   observatorio        la entrada general al módulo (sigue siendo la de siempre)
--   obs_captura         Captura de datos      (estación 1)
--   obs_diseno          Diseño visual         (estación 2)
--   obs_tableros        Tableros              (estación 3)
--   obs_boletin         Boletín               (estación 4)
--   obs_observatorios   crear y organizar observatorios, temas y líneas   (NUEVO)
--   obs_insertar        generar scripts, dominios y registro de insertados (NUEVO)
--
-- NIVEL (access_roles.obs_nivel): ver · editar · administrar.
--   ver          consulta lo que hay en los paneles marcados.
--   editar       prepara y organiza contenido en los paneles marcados.
--   administrar  además crea y archiva observatorios, aprueba dominios externos
--                y revoca insertados.
--   none         rol anterior a esta migración o sin el módulo: se deriva de
--                la capacidad como antes (admin → administrar, planeación →
--                editar, el resto → ver). Es la red de seguridad de la
--                compatibilidad: nada que ya funcionaba deja de funcionar.
--   «editar» y «administrar» piden capacidad de Planeación (lo mismo que ya
--   pedía editar el taller, 0049); sin ella el nivel efectivo baja a «ver».
--
-- ALCANCE (access_roles.all_obs): «todos los observatorios» (true, el valor
--   con el que nace y con el que se migran los roles actuales) o «solo los que
--   le asignen» (false): entonces cuenta la tabla obs_responsables (0230).
--   Acceso efectivo = panel marcado en el rol Y (alcance «todos» O persona
--   asignada al observatorio), siempre dentro del nivel del rol.
--
-- COMPATIBILIDAD ESTRICTA
--   · Los roles que tenían la pantalla «observatorio» conservan exactamente su
--     acceso: se les agregan los CUATRO paneles equivalentes (las cuatro
--     estaciones) y su nivel se deriva de su capacidad, como antes. Los roles
--     «de fábrica» con all_screens = true siguen viendo las cuatro estaciones
--     sin tocar su lista.
--   · Los dos paneles NUEVOS (obs_observatorios, obs_insertar) no se otorgan
--     solos: ni siquiera «todas las pantallas» los incluye. Hay que marcarlos
--     de forma explícita en el rol. Solo la administración (capacidad admin)
--     los tiene siempre; a los roles de capacidad admin se les marcan por
--     claridad en el editor.
--   · Quien no tiene rol de acceso asignado (sesión «de antes de 0024») conserva
--     lo de siempre: Planeación edita las cuatro estaciones, el resto las lee,
--     todos los observatorios. Los paneles nuevos, solo la administración.
--
-- RLS: las tablas NUEVAS (0230, 0232) usan estas funciones. Las tablas de 0049
-- (obs_datasets, obs_views, obs_topics, obs_bulletins) NO se aflojan: siguen
-- pidiendo capacidad de Planeación para escribir y ahora, además, el nivel
-- «editar» y el panel que corresponde. Lo que se puede afinar después:
--   datasets ← captura o tableros; views ← captura, diseño o tableros;
--   topics ← tableros; bulletins ← boletín. (Las estaciones se escriben unas a
--   otras: captura crea visores y tableros publica tablas, de modo que exigir
--   un único panel por tabla rompería el taller de quien tiene solo uno.)
--
-- Requiere 0024 (has_role_at_least, is_direct_session…), 0049 y 0230. Idempotente.
-- =============================================================================

-- 1. Columnas del rol --------------------------------------------------------------

alter table public.access_roles
  add column if not exists obs_nivel text not null default 'none',
  add column if not exists all_obs boolean not null default true;

alter table public.access_roles drop constraint if exists access_roles_obs_nivel;
alter table public.access_roles
  add constraint access_roles_obs_nivel check (obs_nivel in ('none', 'ver', 'editar', 'administrar'));

comment on column public.access_roles.obs_nivel is
  'Observatorio (0231): none (se deriva de la capacidad, como antes) · ver · editar · administrar. Exige la pantalla «observatorio» y los paneles obs_*.';
comment on column public.access_roles.all_obs is
  'Observatorio (0231): true = todos los observatorios; false = solo aquellos donde la persona figure en obs_responsables.';

-- 2. Migración de los roles actuales (idempotente) ----------------------------------
-- Solo toca los roles que aún no se han migrado (obs_nivel = none) y que ya
-- tenían el Observatorio (la pantalla marcada, o todas).

update public.access_roles r
   set obs_nivel = case r.base_role::text when 'admin' then 'administrar' when 'planeacion' then 'editar' else 'ver' end,
       screens = case
         when r.all_screens then r.screens
         else (
           select coalesce(array_agg(distinct s order by s), '{}')
             from unnest(
               r.screens
               || array['obs_captura', 'obs_diseno', 'obs_tableros', 'obs_boletin']
               || case when r.base_role::text = 'admin' then array['obs_observatorios', 'obs_insertar'] else '{}'::text[] end
             ) as s
         )
       end
 where r.obs_nivel = 'none'
   and (r.all_screens or 'observatorio' = any (r.screens));

-- Los roles de capacidad admin con «todas las pantallas»: los paneles nuevos,
-- explícitos (all_screens no los incluye a propósito).
update public.access_roles r
   set screens = (select coalesce(array_agg(distinct s order by s), '{}') from unnest(r.screens || array['obs_observatorios', 'obs_insertar']) as s)
 where r.all_screens
   and r.base_role::text = 'admin'
   and not (r.screens @> array['obs_observatorios', 'obs_insertar']);

-- 3. Las preguntas que hace la seguridad ---------------------------------------------
-- Todas SECURITY DEFINER con search_path fijo: leen profiles y access_roles, que
-- el llamante no necesariamente puede leer. Ninguna recibe la identidad por
-- parámetro: siempre es auth.uid().

create or replace function public.obs_rank(p_nivel text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_nivel when 'administrar' then 3 when 'editar' then 2 when 'ver' then 1 else 0 end;
$$;

-- Nivel efectivo de quien pregunta en el módulo, sin mirar paneles ni alcance.
create or replace function public.obs_nivel_actual()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol   text;
  v_ar    uuid;
  r       record;
  v_nivel text;
begin
  if auth.uid() is null then
    return 'none';
  end if;
  select p.role::text, p.access_role_id into v_rol, v_ar
    from public.profiles p
   where p.id = auth.uid() and p.is_active;
  if not found then
    return 'none';
  end if;
  if v_rol = 'admin' then
    return 'administrar';
  end if;
  -- Sin rol de acceso: lo de siempre.
  if v_ar is null then
    return case when v_rol = 'planeacion' then 'editar' else 'ver' end;
  end if;
  select a.obs_nivel, a.base_role::text as base_role, a.all_screens, a.screens into r
    from public.access_roles a where a.id = v_ar;
  if not found or not (r.all_screens or 'observatorio' = any (r.screens)) then
    return 'none';
  end if;
  v_nivel := case
    when r.obs_nivel <> 'none' then r.obs_nivel
    when r.base_role = 'admin' then 'administrar'
    when r.base_role = 'planeacion' then 'editar'
    else 'ver'
  end;
  -- Editar y administrar piden capacidad de Planeación (como el taller de 0049).
  if v_nivel in ('editar', 'administrar') and v_rol not in ('planeacion', 'admin') then
    v_nivel := 'ver';
  end if;
  return v_nivel;
end;
$$;

comment on function public.obs_nivel_actual() is
  'Observatorio (0231): nivel de quien pregunta (none · ver · editar · administrar). Se deriva de la capacidad en roles anteriores a 0231.';

-- ¿Su alcance incluye TODOS los observatorios?
create or replace function public.obs_todos()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_ar  uuid;
  v_all boolean;
begin
  if auth.uid() is null then
    return false;
  end if;
  select p.role::text, p.access_role_id into v_rol, v_ar from public.profiles p where p.id = auth.uid() and p.is_active;
  if not found then
    return false;
  end if;
  if v_rol = 'admin' or v_ar is null then
    return true;
  end if;
  select a.all_obs into v_all from public.access_roles a where a.id = v_ar;
  return coalesce(v_all, false);
end;
$$;

create or replace function public.obs_es_responsable(p_obs uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_obs is not null and exists (
    select 1 from public.obs_responsables x
     where x.observatorio_id = p_obs and x.persona_id = auth.uid()
  );
$$;

-- ¿Alcanza este observatorio? (alcance, sin mirar paneles)
create or replace function public.obs_alcanza(p_obs uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.obs_nivel_actual() <> 'none' and (p_obs is null or public.obs_todos() or public.obs_es_responsable(p_obs));
$$;

-- ¿Tiene este panel marcado (y, si se indica el observatorio, lo alcanza)?
create or replace function public.obs_tiene_panel(p_panel text, p_obs uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol    text;
  v_ar     uuid;
  r        record;
  v_listed boolean;
begin
  if p_panel is null or p_panel not in ('observatorio', 'obs_captura', 'obs_diseno', 'obs_tableros', 'obs_boletin', 'obs_observatorios', 'obs_insertar') then
    return false;
  end if;
  if public.obs_nivel_actual() = 'none' then
    return false;
  end if;
  select p.role::text, p.access_role_id into v_rol, v_ar from public.profiles p where p.id = auth.uid() and p.is_active;
  if v_rol = 'admin' then
    return true;
  end if;
  if v_ar is null then
    -- Sin rol de acceso: las estaciones de siempre; los paneles nuevos, no.
    return p_panel not in ('obs_observatorios', 'obs_insertar');
  end if;
  select a.all_screens, a.screens, a.all_obs into r from public.access_roles a where a.id = v_ar;
  v_listed := case
    -- Los paneles nuevos jamás se heredan de «todas las pantallas».
    when p_panel in ('obs_observatorios', 'obs_insertar') then p_panel = any (r.screens)
    else r.all_screens or p_panel = any (r.screens)
  end;
  if not v_listed then
    return false;
  end if;
  return p_obs is null or r.all_obs or public.obs_es_responsable(p_obs);
end;
$$;

comment on function public.obs_tiene_panel(text, uuid) is
  'Observatorio (0231): panel marcado en el rol Y (alcance «todos» O persona asignada al observatorio). Los paneles nuevos exigen marca explícita.';

-- Nivel efectivo en un panel y observatorio: none si no tiene el panel o no lo alcanza.
create or replace function public.obs_nivel(p_panel text, p_obs uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when public.obs_tiene_panel(p_panel, p_obs) then public.obs_nivel_actual() else 'none' end;
$$;

-- ¿Puede, en este panel y observatorio, al menos este nivel?
create or replace function public.obs_puede(p_panel text, p_obs uuid, p_minimo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.obs_rank(public.obs_nivel(p_panel, p_obs)) >= greatest(public.obs_rank(p_minimo), 1);
$$;

-- ¿Tiene alguno de los cuatro paneles del taller en este observatorio?
create or replace function public.obs_ve_taller(p_obs uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.obs_tiene_panel('obs_captura', p_obs) or public.obs_tiene_panel('obs_diseno', p_obs)
      or public.obs_tiene_panel('obs_tableros', p_obs) or public.obs_tiene_panel('obs_boletin', p_obs);
$$;

-- ¿Está publicado este observatorio? (lo público solo cuelga de uno publicado)
create or replace function public.obs_publicado(p_obs uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.obs_observatorios o where o.id = p_obs and o.estado = 'publicado');
$$;

-- La función de 0049, ahora más estricta: capacidad de Planeación, pantalla y nivel «editar».
create or replace function public.obs_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion') and public.has_screen('observatorio')
     and public.obs_rank(public.obs_nivel_actual()) >= 2;
$$;

-- Las usan las políticas de lectura, que también evalúa el rol anon: para él todas
-- devuelven none/false (auth.uid() es nulo), pero necesita poder ejecutarlas.
grant execute on function public.obs_nivel_actual(), public.obs_todos(), public.obs_alcanza(uuid),
  public.obs_tiene_panel(text, uuid), public.obs_nivel(text, uuid), public.obs_puede(text, uuid, text),
  public.obs_es_responsable(uuid), public.obs_ve_taller(uuid), public.obs_publicado(uuid), public.obs_rank(text)
  to anon, authenticated;

-- 4. Políticas de las tablas nuevas (0230) -------------------------------------------

grant select on public.obs_observatorios, public.obs_lineas to anon;
grant select, insert, update, delete on public.obs_observatorios, public.obs_lineas, public.obs_responsables to authenticated;

-- Observatorios: el público lee los publicados; la intranet, los que alcanza.
drop policy if exists obs_observatorios_read on public.obs_observatorios;
create policy obs_observatorios_read on public.obs_observatorios for select to anon, authenticated
  using (estado = 'publicado' or (public.obs_nivel_actual() <> 'none' and public.obs_alcanza(id)));

-- Crear: solo «administrar» en el panel Observatorios, con alcance sobre TODOS
-- (quien administra solo los suyos no abre observatorios nuevos), y nunca el principal.
drop policy if exists obs_observatorios_insert on public.obs_observatorios;
create policy obs_observatorios_insert on public.obs_observatorios for insert to authenticated
  with check (public.obs_puede('obs_observatorios', null, 'administrar') and public.obs_todos() and principal = false);

-- Organizar: «editar» en el panel Observatorios sobre ese observatorio. Las
-- decisiones de «administrar» (archivar, cambiar el enlace) las vigila el disparador.
drop policy if exists obs_observatorios_update on public.obs_observatorios;
create policy obs_observatorios_update on public.obs_observatorios for update to authenticated
  using (public.obs_puede('obs_observatorios', id, 'editar'))
  with check (public.obs_puede('obs_observatorios', id, 'editar'));

-- Borrar: solo «administrar», nunca el principal (y la llave foránea impide borrar uno con temas).
drop policy if exists obs_observatorios_delete on public.obs_observatorios;
create policy obs_observatorios_delete on public.obs_observatorios for delete to authenticated
  using (public.obs_puede('obs_observatorios', id, 'administrar') and principal = false);

create or replace function public.obs_observatorios_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if public.is_direct_session() or public.is_admin() then
      return new;
    end if;
    if new.principal is distinct from old.principal then
      raise exception 'El observatorio principal no se cambia desde la aplicación.' using errcode = 'insufficient_privilege';
    end if;
    if old.principal and new.estado = 'archivado' then
      raise exception 'El observatorio principal no se archiva.' using errcode = 'insufficient_privilege';
    end if;
    -- Archivar, reabrir y cambiar el enlace son decisiones de quien administra.
    if (new.slug is distinct from old.slug
        or (new.estado = 'archivado') is distinct from (old.estado = 'archivado'))
       and not public.obs_puede('obs_observatorios', old.id, 'administrar') then
      raise exception 'Archivar, reabrir o cambiar el enlace de un observatorio pide el nivel Administrar.' using errcode = 'insufficient_privilege';
    end if;
    if new.plantilla_origen is distinct from old.plantilla_origen then
      new.plantilla_origen := old.plantilla_origen;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists obs_observatorios_guardia_trg on public.obs_observatorios;
create trigger obs_observatorios_guardia_trg before update on public.obs_observatorios
  for each row execute function public.obs_observatorios_guardia();

-- Quien crea un observatorio queda como su responsable: no lo pierde si su alcance es «solo los asignados».
create or replace function public.obs_observatorios_creador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.creado_por is not null and exists (select 1 from public.profiles p where p.id = new.creado_por) then
    insert into public.obs_responsables (observatorio_id, persona_id) values (new.id, new.creado_por)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists obs_observatorios_creador_trg on public.obs_observatorios;
create trigger obs_observatorios_creador_trg after insert on public.obs_observatorios
  for each row execute function public.obs_observatorios_creador();

-- Líneas: el público lee las de observatorios publicados.
drop policy if exists obs_lineas_read on public.obs_lineas;
create policy obs_lineas_read on public.obs_lineas for select to anon, authenticated
  using (public.obs_publicado(observatorio_id) or (public.obs_nivel_actual() <> 'none' and public.obs_alcanza(observatorio_id)));

drop policy if exists obs_lineas_write on public.obs_lineas;
create policy obs_lineas_write on public.obs_lineas for all to authenticated
  using (public.obs_puede('obs_observatorios', observatorio_id, 'editar'))
  with check (public.obs_puede('obs_observatorios', observatorio_id, 'editar'));

-- Personas responsables: las ve quien tiene el panel; las asigna quien administra.
drop policy if exists obs_responsables_read on public.obs_responsables;
create policy obs_responsables_read on public.obs_responsables for select to authenticated
  using (persona_id = auth.uid() or public.obs_puede('obs_observatorios', observatorio_id, 'ver'));

drop policy if exists obs_responsables_write on public.obs_responsables;
create policy obs_responsables_write on public.obs_responsables for all to authenticated
  using (public.obs_puede('obs_observatorios', observatorio_id, 'administrar'))
  with check (public.obs_puede('obs_observatorios', observatorio_id, 'administrar'));

-- 5. Las tablas de 0049: igual o más estrictas -----------------------------------------
-- Lectura pública: sigue siendo solo lo publicado (ahora, de un observatorio
-- publicado). Lectura de borradores: quien tiene algún panel del taller en ese
-- observatorio. Escritura: capacidad de Planeación + nivel «editar» + panel.

drop policy if exists obs_datasets_read on public.obs_datasets;
create policy obs_datasets_read on public.obs_datasets for select to anon, authenticated
  using ((status = 'publicado' and public.obs_publicado(observatorio_id)) or public.obs_ve_taller(observatorio_id));

drop policy if exists obs_datasets_write on public.obs_datasets;
create policy obs_datasets_write on public.obs_datasets for all to authenticated
  using (public.obs_can_edit() and (public.obs_puede('obs_captura', observatorio_id, 'editar') or public.obs_puede('obs_tableros', observatorio_id, 'editar')))
  with check (public.obs_can_edit() and (public.obs_puede('obs_captura', observatorio_id, 'editar') or public.obs_puede('obs_tableros', observatorio_id, 'editar')));

drop policy if exists obs_views_read on public.obs_views;
create policy obs_views_read on public.obs_views for select to anon, authenticated
  using (
    public.obs_ve_taller(observatorio_id)
    or (visible and public.obs_publicado(observatorio_id)
        and exists (select 1 from public.obs_datasets d where d.id = dataset_id and d.status = 'publicado'))
  );

drop policy if exists obs_views_write on public.obs_views;
create policy obs_views_write on public.obs_views for all to authenticated
  using (public.obs_can_edit() and (public.obs_puede('obs_captura', observatorio_id, 'editar') or public.obs_puede('obs_diseno', observatorio_id, 'editar') or public.obs_puede('obs_tableros', observatorio_id, 'editar')))
  with check (public.obs_can_edit() and (public.obs_puede('obs_captura', observatorio_id, 'editar') or public.obs_puede('obs_diseno', observatorio_id, 'editar') or public.obs_puede('obs_tableros', observatorio_id, 'editar')));

drop policy if exists obs_topics_read on public.obs_topics;
create policy obs_topics_read on public.obs_topics for select to anon, authenticated
  using ((status = 'publicado' and public.obs_publicado(observatorio_id)) or public.obs_ve_taller(observatorio_id));

-- Temas: quien tiene Tableros los configura; quien tiene Observatorios los organiza (línea, nombre, orden).
drop policy if exists obs_topics_write on public.obs_topics;
create policy obs_topics_write on public.obs_topics for all to authenticated
  using (public.obs_can_edit() and (public.obs_puede('obs_tableros', observatorio_id, 'editar') or public.obs_puede('obs_observatorios', observatorio_id, 'editar')))
  with check (public.obs_can_edit() and (public.obs_puede('obs_tableros', observatorio_id, 'editar') or public.obs_puede('obs_observatorios', observatorio_id, 'editar')));

drop policy if exists obs_bulletins_read on public.obs_bulletins;
create policy obs_bulletins_read on public.obs_bulletins for select to authenticated
  using (public.obs_ve_taller(observatorio_id));

drop policy if exists obs_bulletins_write on public.obs_bulletins;
create policy obs_bulletins_write on public.obs_bulletins for all to authenticated
  using (public.obs_can_edit() and public.obs_puede('obs_boletin', observatorio_id, 'editar'))
  with check (public.obs_can_edit() and public.obs_puede('obs_boletin', observatorio_id, 'editar'));
