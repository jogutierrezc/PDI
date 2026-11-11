-- =============================================================================
-- 0275 · Estructura institucional ordenada para el Monitor y el Portal de alertas
--
-- Regla acordada con Planeación:
--   · Cada programa cuelga de su facultad (units.parent_id) y se ofrece en sus
--     sedes (program_campuses). La facultad reporta a su vicerrectoría (reports_to).
--   · Los programas de posgrado se quedan en su facultad y, además, se conectan
--     con la Vicerrectoría de Posgrados (units.secondary_reports_to).
--
-- Qué hace:
--   1. units.secondary_reports_to + vínculo de los posgrados con su vicerrectoría.
--   2. v_estructura: vicerrectoría → facultad → programa → sede, con SNIES, nivel,
--      modalidad y DIVIPOLA. Una sola fuente para agrupar en los cuatro módulos.
--   3. wh_unit_visible: quien pertenece a una vicerrectoría ve en el Monitor los
--      programas de sus facultades (y la de Posgrados, los de posgrado). Antes
--      unit_chain solo subía por parent_id y la vicerrectoría no veía nada.
--   4. wh_monitor_mapa trae SNIES, vicerrectoría y si el programa se ofrece en la
--      sede cargada; wh_monitor_autoasignar distingue entre programas del mismo
--      nombre por sede (Derecho tiene un SNIES por sede).
--
-- No toca datos de notas. Idempotente. Requiere 0057, 0160, 0161.
-- =============================================================================

-- 1. Vínculo de los posgrados con la Vicerrectoría de Posgrados ----------------
alter table public.units
  add column if not exists secondary_reports_to uuid references public.units (id) on delete set null;

comment on column public.units.secondary_reports_to is
  'Segunda vicerrectoría a la que se conecta el programa (los posgrados, con la de Posgrados). El programa sigue en su facultad.';

update public.units set name = 'Vicerrectoría de Extensión'
 where kind = 'vicerrectoria' and name = 'Vicerrectoria de Extensión';

update public.units p
   set secondary_reports_to = v.id
  from public.units v
 where v.kind = 'vicerrectoria'
   and public.wh_norm_nombre(v.name) = 'VICERRECTORIA DE POSGRADOS'
   and p.kind = 'programa'
   and p.degree_level in ('especializacion', 'especializacion_medicoquirurgica', 'maestria', 'doctorado')
   and p.secondary_reports_to is distinct from v.id;

-- 2. La estructura en una sola vista ------------------------------------------
create or replace view public.v_estructura
with (security_invoker = true)
as
select v.id   as vicerrectoria_id,
       v.name as vicerrectoria,
       f.id   as facultad_id,
       f.name as facultad,
       p.id   as programa_id,
       p.name as programa,
       p.snies_code   as snies,
       p.degree_level as nivel,
       p.modality     as modalidad,
       p.secondary_reports_to as vicerrectoria_posgrados_id,
       vp.name        as vicerrectoria_posgrados,
       c.id   as campus_id,
       c.code as campus_codigo,
       c.name as campus,
       s.municipio as divipola
  from public.units p
  join public.units f on f.id = p.parent_id and f.kind = 'facultad'
  left join public.units v  on v.id = f.reports_to
  left join public.units vp on vp.id = p.secondary_reports_to
  join public.program_campuses pc on pc.program_id = p.id and pc.active
  join public.campuses c on c.id = pc.campus_id
  left join public.ri_sedes s on s.campus_id = c.id
 where p.kind = 'programa';

comment on view public.v_estructura is
  'Vicerrectoría → facultad → programa → sede, con SNIES, nivel, modalidad y DIVIPOLA (una fila por programa y sede).';
grant select on public.v_estructura to authenticated;

-- 3. Quién ve un programa en el Monitor ---------------------------------------
create or replace function public.wh_unit_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.unit_can_view(target)
      or exists (
        select 1
          from public.units p
          left join public.units f on f.id = p.parent_id and f.kind = 'facultad'
          join public.unit_members m
            on m.profile_id = auth.uid()
           and m.unit_id in (p.secondary_reports_to, f.reports_to)
         where p.id = target and p.kind = 'programa'
      );
$$;
revoke all on function public.wh_unit_visible(uuid) from public, anon;
grant execute on function public.wh_unit_visible(uuid) to authenticated;

create or replace function public.wh_monitor_puede()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (public.has_role_at_least('planeacion') and public.has_screen('monitor'))
      or (
        public.current_role() is not null
        and exists (select 1 from public.wh_programas_unidad p where p.unit_id is not null and public.wh_unit_visible(p.unit_id))
      );
$$;

create or replace function public.wh_monitor_codigos()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
           when public.has_role_at_least('planeacion') then null
           else coalesce((select array_agg(p.codigo_programa) from public.wh_programas_unidad p where p.unit_id is not null and public.wh_unit_visible(p.unit_id)), '{}')
         end;
$$;

-- 4. Mapa de programas con SNIES, vicerrectoría y sede -------------------------
drop function if exists public.wh_monitor_mapa(text, text);
create function public.wh_monitor_mapa(p_periodo text, p_sede text)
returns table (
  codigo_programa text, nombre text, unit_id uuid, unidad text, facultad_id uuid, facultad text,
  snies text, vicerrectoria text, vicerrectoria_posgrados text, en_sede boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  visibles text[];
  carga uuid;
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  visibles := public.wh_monitor_codigos();
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  return query
    with codigos as (
      select f.datos->>'codigo_programa' as cod, min(f.datos->>'nombre_programa') as nom
        from public.wh_filas f
       where f.carga_id = carga
       group by f.datos->>'codigo_programa'
    )
    select c.cod,
           coalesce(nullif(m.nombre, ''), c.nom, ''),
           m.unit_id,
           u.name,
           fac.id,
           fac.name,
           u.snies_code,
           vic.name,
           vp.name,
           case when m.unit_id is null then null
                else exists (select 1 from public.program_campuses pc join public.campuses ca on ca.id = pc.campus_id
                              where pc.program_id = m.unit_id and pc.active and ca.code = upper(p_sede)) end
      from codigos c
      left join public.wh_programas_unidad m on m.codigo_programa = c.cod
      left join public.units u on u.id = m.unit_id
      left join public.units fac on fac.id = u.parent_id and fac.kind = 'facultad'
      left join public.units vic on vic.id = fac.reports_to
      left join public.units vp on vp.id = u.secondary_reports_to
     where visibles is null or c.cod = any (visibles);
end;
$$;
revoke all on function public.wh_monitor_mapa(text, text) from public, anon;
grant execute on function public.wh_monitor_mapa(text, text) to authenticated;

-- Sugerencia por nombre que respeta la sede: si el nombre está repetido (un SNIES por sede),
-- elige el que se ofrece en la sede cargada; si aun así hay duda, lo deja para asignar a mano.
create or replace function public.wh_monitor_autoasignar(p_periodo text, p_sede text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  carga uuid;
  total int;
begin
  if not (public.has_screen('monitor') and public.has_role_at_least('planeacion')) then
    raise exception 'monitor: la asignación de programas es de Planeación' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  with codigos as (
    select f.datos->>'codigo_programa' as cod, min(f.datos->>'nombre_programa') as nom
      from public.wh_filas f
     where f.carga_id = carga
     group by f.datos->>'codigo_programa'
  ),
  coincidencias as (
    select c.cod, c.nom, u.id as unidad,
           exists (select 1 from public.program_campuses pc join public.campuses ca on ca.id = pc.campus_id
                    where pc.program_id = u.id and pc.active and ca.code = upper(p_sede)) as en_sede
      from codigos c
      join public.units u on u.kind = 'programa' and public.wh_norm_nombre(u.name) = public.wh_norm_nombre(c.nom)
     where not exists (select 1 from public.wh_programas_unidad m where m.codigo_programa = c.cod and m.unit_id is not null)
  ),
  elegidos as (
    select cod, nom,
           (array_agg(unidad order by en_sede desc))[1] as unidad,
           count(*) filter (where en_sede) as n_sede,
           count(*) as n
      from coincidencias
     group by cod, nom
  ),
  hechos as (
    insert into public.wh_programas_unidad (codigo_programa, nombre, unit_id, asignado_por)
    select cod, nom, unidad, auth.uid() from elegidos where n_sede = 1 or (n_sede = 0 and n = 1)
    on conflict (codigo_programa) do update set unit_id = excluded.unit_id, nombre = excluded.nombre, asignado_por = auth.uid(), updated_at = now()
    returning 1
  )
  select count(*) into total from hechos;
  return total;
end;
$$;
