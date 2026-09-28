-- =============================================================================
-- 0100 · Informes de Impacto con Mr. Pilo.
--
-- El mismo «Análisis de los datos» de UDES en Cifras, para un programa, una
-- facultad (decanatura) o una vicerrectoría: las cifras se calculan en el
-- navegador (sin IA) y la función `pilo-ia` escribe un capítulo a la vez.
--
--   pilo_ai_settings.impacto_report   a quién MÁS se abren los informes: por
--                                     defecto a nadie (solo la administración)
--   imp_report_switches()             lo que la pantalla necesita saber: si
--                                     la IA está encendida y qué tipos abrió
--   imp_report_allowed(kind, ref, campus)
--                                     ¿puede quien pide escribir el informe de
--                                     esa unidad? La administración, siempre;
--                                     los demás, si el tipo está abierto y
--                                     pertenecen a la unidad. La usan la
--                                     función del servidor (con la sesión de
--                                     quien pide) y la tabla de abajo.
--   imp_ai_reports                    los informes escritos: lo que se pagó a
--                                     la IA no se pierde al cerrar la ventana,
--                                     y de aquí sale el PDF. Los lee su autor
--                                     y la administración; solo su autor los
--                                     completa (título y contenido)
--
-- Requiere 0078 (imp_fn_member, unit_chain) y 0089 (pilo_ai_settings).
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El interruptor
-- -----------------------------------------------------------------------------

alter table public.pilo_ai_settings
  add column if not exists impacto_report jsonb not null
    default '{"programa": false, "facultad": false, "vicerrectoria": false}'::jsonb;

alter table public.pilo_ai_settings drop constraint if exists pilo_ai_settings_impacto_report;
alter table public.pilo_ai_settings
  add constraint pilo_ai_settings_impacto_report check (jsonb_typeof(impacto_report) = 'object');

comment on column public.pilo_ai_settings.impacto_report is
  'Informes de Impacto con Pilo: tipos de unidad (programa, facultad, vicerrectoria) a los que la administración los abrió. Por defecto, ninguno.';

/** Lo que la pantalla de Impacto necesita para pintar el botón. Sin URL, modelos ni claves. */
create or replace function public.imp_report_switches()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled', s.enabled,
    'programa', coalesce(s.impacto_report ->> 'programa', 'false') = 'true',
    'facultad', coalesce(s.impacto_report ->> 'facultad', 'false') = 'true',
    'vicerrectoria', coalesce(s.impacto_report ->> 'vicerrectoria', 'false') = 'true'
  )
  from public.pilo_ai_settings s
  where s.id = 1;
$$;

comment on function public.imp_report_switches() is
  'Informes de Impacto con Pilo: si la IA está encendida y a qué tipos de unidad se abrieron.';

revoke all on function public.imp_report_switches() from public, anon;
grant execute on function public.imp_report_switches() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. ¿De qué unidad puede pedir el informe?
-- -----------------------------------------------------------------------------

/**
 * programa       p_ref = id del programa; p_campus = la sede o null (todas).
 *                Pertenecer al programa o a su facultad; con una sede, que la
 *                pertenencia valga para ella; sin sede, una sin sede fija.
 * facultad       p_ref = id de la facultad; pertenecer a ella (decanatura).
 * vicerrectoria  p_ref = la función (investigacion, ensenanza, extension);
 *                pertenecer a una unidad que la lleva.
 */
create or replace function public.imp_report_allowed(p_kind text, p_ref text, p_campus uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_open boolean;
  target uuid;
begin
  if auth.uid() is null then
    return false;
  end if;
  if public.has_role_at_least('admin') then
    return true;
  end if;

  select coalesce(s.impacto_report ->> p_kind, 'false') = 'true' into is_open
    from public.pilo_ai_settings s
   where s.id = 1;
  if not coalesce(is_open, false) then
    return false;
  end if;

  if p_kind = 'vicerrectoria' then
    return p_ref in ('investigacion', 'ensenanza', 'extension') and public.imp_fn_member(p_ref, 'visor');
  end if;

  if p_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  target := p_ref::uuid;

  if p_kind = 'programa' then
    return exists (select 1 from public.units u where u.id = target and u.kind = 'programa')
       and exists (
         select 1
           from public.unit_members m
           join public.unit_chain(target) c on c.id = m.unit_id
          where m.profile_id = auth.uid()
            and (m.campus_id is null or m.campus_id = p_campus)
       );
  end if;

  if p_kind = 'facultad' then
    return exists (
      select 1
        from public.unit_members m
        join public.units u on u.id = m.unit_id
       where m.profile_id = auth.uid()
         and u.id = target
         and u.kind = 'facultad'
    );
  end if;

  return false;
end;
$$;

comment on function public.imp_report_allowed(text, text, uuid) is
  'Informes de Impacto con Pilo: la administración, siempre; los demás, si el tipo está abierto y pertenecen a la unidad.';

revoke all on function public.imp_report_allowed(text, text, uuid) from public, anon;
grant execute on function public.imp_report_allowed(text, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Los informes escritos
-- -----------------------------------------------------------------------------

create table if not exists public.imp_ai_reports (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  ref         text not null,
  campus_id   uuid references public.campuses (id) on delete set null,
  title       text not null,
  content     jsonb not null,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint imp_ai_reports_kind check (kind in ('programa', 'facultad', 'vicerrectoria')),
  constraint imp_ai_reports_ref check (char_length(ref) between 1 and 80),
  constraint imp_ai_reports_title check (char_length(btrim(title)) between 1 and 200),
  constraint imp_ai_reports_content check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 600000)
);

create index if not exists imp_ai_reports_owner_idx on public.imp_ai_reports (created_by, created_at desc);

comment on table public.imp_ai_reports is
  'Informes de Impacto escritos con Mr. Pilo (0100). Los ve quien los escribió y la administración; solo su autor los completa.';

alter table public.imp_ai_reports enable row level security;

drop policy if exists imp_ai_reports_read on public.imp_ai_reports;
create policy imp_ai_reports_read on public.imp_ai_reports for select to authenticated
  using (created_by = auth.uid() or public.has_role_at_least('admin'));

drop policy if exists imp_ai_reports_insert on public.imp_ai_reports;
create policy imp_ai_reports_insert on public.imp_ai_reports for insert to authenticated
  with check (created_by = auth.uid() and public.imp_report_allowed(kind, ref, campus_id));

-- Su autor lo completa (un capítulo vuelto a escribir), sin cambiarlo de unidad.
drop policy if exists imp_ai_reports_update on public.imp_ai_reports;
create policy imp_ai_reports_update on public.imp_ai_reports for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and public.imp_report_allowed(kind, ref, campus_id));

drop policy if exists imp_ai_reports_delete on public.imp_ai_reports;
create policy imp_ai_reports_delete on public.imp_ai_reports for delete to authenticated
  using (created_by = auth.uid() or public.has_role_at_least('admin'));

revoke all on public.imp_ai_reports from anon, public, authenticated;
grant select, insert, delete on public.imp_ai_reports to authenticated;
grant update (title, content) on public.imp_ai_reports to authenticated;

notify pgrst, 'reload schema';
