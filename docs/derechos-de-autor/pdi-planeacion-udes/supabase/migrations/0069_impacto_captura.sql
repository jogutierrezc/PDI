-- =============================================================================
-- PDI · 0069 · Impacto: captura en línea del programa
--
--   imp_my_programs      los programas donde quien pregunta captura, y si
--                        además puede enviar.
--   imp_capture_rows     cada registro con lo que la ficha de captura muestra
--                        de contexto: indicador, sede, periodo, meta del año,
--                        valor del periodo anterior (validado) y la última
--                        devolución. security_invoker: respeta el RLS.
--   quién guardó         un disparador anota updated_by y, la primera vez,
--                        captured_by. Es lo que permite que nadie apruebe lo
--                        que capturó.
--   evidencias           bucket privado «impacto», una carpeta por registro.
--   imp_submit_program   envía a decanatura el paquete del programa: todos
--                        sus registros en borrador o devueltos, con la
--                        certificación, y una transición por registro.
--
-- Las validaciones (V01–V12) viven en un único servicio en TypeScript
-- (src/modules/impacto/data/validate.ts) que usan la captura en línea y la
-- importación de Excel. La base garantiza lo estructural —no negativos, valor
-- calculado, flujo permitido, quién puede qué— y no repite esas reglas.
--
-- Requiere 0068. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Los programas de quien captura
-- -----------------------------------------------------------------------------

drop function if exists public.imp_my_programs();
create or replace function public.imp_my_programs()
returns table (program_id uuid, program_name text, program_code text, faculty_name text, can_send boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name, u.code, f.name,
         public.imp_can('impacto.enviar', u.id, false)
    from public.units u
    left join public.units f on f.id = u.parent_id
   where u.kind = 'programa'
     and public.imp_can('impacto.capturar', u.id, false)
   order by u.name;
$$;

comment on function public.imp_my_programs() is
  'Programas donde quien pregunta tiene impacto.capturar puesto en el propio programa.';

-- -----------------------------------------------------------------------------
-- 2. Lo que ve la ficha de captura
-- -----------------------------------------------------------------------------

create or replace view public.imp_capture_rows
with (security_invoker = true)
as
select
  r.id,
  r.assignment_id,
  r.numerator,
  r.denominator,
  r.value,
  r.comparison_value,
  r.n_responses,
  r.num_comparison,
  r.den_comparison,
  r.text_value,
  r.confirms_preloaded,
  r.preloaded,
  r.no_data,
  r.justification,
  r.observations,
  r.state,
  r.channel,
  r.version,
  r.captured_by,
  r.updated_by,
  r.updated_at,
  a.program_id,
  a.campus_id,
  a.period_id,
  p.code as period_code,
  p.state as period_state,
  p.cutoff_program,
  u.name as program_name,
  c.name as campus_name,
  i.id as indicator_id,
  i.code,
  i.name,
  i.description,
  i.function_id,
  i.level,
  i.unit,
  i.calc_type,
  i.numerator_def,
  i.denominator_def,
  i.factor,
  i.aggregation,
  i.direction,
  i.periodicity,
  i.capture_mode,
  i.evidence_type,
  i.evidence_required,
  i.variation_threshold,
  i.range_min,
  i.range_max,
  i.n_minimum,
  i.allows_over_one,
  t.numeric_value as target_numeric,
  t.text_value as target_text,
  prev.value as previous_value,
  prev.period_code as previous_period,
  ret.reason as return_reason,
  ret.comment as return_comment,
  (select count(*) from public.imp_evidence e where e.record_id = r.id) as evidence_count
from public.imp_records r
join public.imp_assignments a on a.id = r.assignment_id and a.active
join public.imp_periods p on p.id = a.period_id
join public.imp_indicators i on i.id = a.indicator_id
join public.units u on u.id = a.program_id
left join public.campuses c on c.id = a.campus_id
left join public.imp_targets t on t.indicator_id = i.id and t.year = left(p.code, 4)::smallint
left join lateral (
  -- El mismo indicador, programa y sede en el último periodo anterior con dato validado.
  select r2.value, p2.code as period_code
    from public.imp_records r2
    join public.imp_assignments a2 on a2.id = r2.assignment_id
    join public.imp_periods p2 on p2.id = a2.period_id
    join public.imp_indicators i2 on i2.id = a2.indicator_id
   where a2.program_id = a.program_id
     and a2.campus_id is not distinct from a.campus_id
     and i2.code = i.code
     and p2.code < p.code
     and r2.state = 'validado'
     and r2.value is not null
   order by p2.code desc
   limit 1
) prev on true
left join lateral (
  select tr.reason, tr.comment
    from public.imp_transitions tr
   where tr.record_id = r.id and tr.to_state = 'devuelto_programa'
   order by tr.at desc, tr.id desc
   limit 1
) ret on true;

comment on view public.imp_capture_rows is
  'Registros con su contexto de captura: ficha, sede, meta del año, valor anterior validado y última devolución.';

grant select on public.imp_capture_rows to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Quién guardó
-- -----------------------------------------------------------------------------

create or replace function public.imp_records_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and (
       new.numerator is distinct from old.numerator
    or new.denominator is distinct from old.denominator
    or new.n_responses is distinct from old.n_responses
    or new.num_comparison is distinct from old.num_comparison
    or new.den_comparison is distinct from old.den_comparison
    or new.text_value is distinct from old.text_value
    or new.confirms_preloaded is distinct from old.confirms_preloaded
    or new.no_data is distinct from old.no_data
    or new.justification is distinct from old.justification
    or new.observations is distinct from old.observations) then
    new.updated_by := auth.uid();
    -- Quien captura es quien escribe datos por primera vez; un precargado no cuenta.
    if old.captured_by is null and exists (
      select 1 from public.imp_assignments a where a.id = new.assignment_id and public.imp_can('impacto.capturar', a.program_id, false)) then
      new.captured_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists imp_records_stamp on public.imp_records;
create trigger imp_records_stamp
  before update on public.imp_records
  for each row execute function public.imp_records_stamp();

-- -----------------------------------------------------------------------------
-- 4. Evidencias: bucket privado, una carpeta por registro
-- -----------------------------------------------------------------------------

/** El registro de una ruta «<registro>/<archivo>»; nulo si la ruta no empieza por un uuid. */
create or replace function public.imp_evidence_record(object_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.imp_can_see_record(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.imp_record_scope(target) s where public.imp_can_see_program(s.program_id, s.function_id));
$$;

create or replace function public.imp_can_capture_record(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.imp_record_scope(target) s
     where public.imp_can('impacto.capturar', s.program_id, false)
       and s.state in ('borrador', 'devuelto_programa'));
$$;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('impacto', 'impacto', false, 10485760, array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists impacto_lectura on storage.objects';
  execute $pol$
    create policy impacto_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'impacto' and public.imp_can_see_record(public.imp_evidence_record(name)))
  $pol$;

  execute 'drop policy if exists impacto_escritura on storage.objects';
  execute $pol$
    create policy impacto_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'impacto' and public.imp_can_capture_record(public.imp_evidence_record(name)))
  $pol$;

  execute 'drop policy if exists impacto_borrado on storage.objects';
  execute $pol$
    create policy impacto_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'impacto' and public.imp_can_capture_record(public.imp_evidence_record(name)))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "impacto" (%). Créelo a mano desde Storage: privado, 10 MB por archivo, PDF, Excel e imágenes.',
      sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Enviar el paquete del programa a decanatura
-- -----------------------------------------------------------------------------

create or replace function public.imp_submit_program(period uuid, program uuid, certified boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not coalesce(certified, false) then
    raise exception 'Para enviar hay que certificar que la información es veraz y cuenta con los soportes correspondientes.'
      using errcode = '23514';
  end if;
  if not public.imp_can('impacto.enviar', program, false) then
    raise exception 'Solo la dirección del programa envía el reporte a decanatura.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.imp_periods p where p.id = period and p.state = 'abierto') then
    raise exception 'El periodo no existe o está cerrado.' using errcode = '55000';
  end if;

  with pending as (
    select r.id, r.state
      from public.imp_records r
      join public.imp_assignments a on a.id = r.assignment_id and a.active
     where a.period_id = period and a.program_id = program
       and r.state in ('borrador', 'devuelto_programa')
     for update of r
  ), logged as (
    insert into public.imp_transitions (record_id, from_state, to_state, actor_id, comment)
    select id, state, 'enviado', auth.uid(),
           'Certifico que la información reportada es veraz y cuenta con los soportes correspondientes.'
      from pending
    returning record_id
  )
  update public.imp_records r set state = 'enviado' from logged l where r.id = l.record_id;
  get diagnostics n = row_count;

  if n = 0 then
    raise exception 'No hay registros por enviar: todo el paquete ya salió del programa.' using errcode = '55000';
  end if;
  return n;
end;
$$;

comment on function public.imp_submit_program(uuid, uuid, boolean) is
  'Envía a decanatura los registros en borrador o devueltos de un programa, con la certificación y su transición.';

do $$
declare
  fn text;
begin
  foreach fn in array array['imp_my_programs()', 'imp_submit_program(uuid, uuid, boolean)', 'imp_can_see_record(uuid)', 'imp_can_capture_record(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
