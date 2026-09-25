-- =============================================================================
-- PDI · 0084 · Impacto: indicadores propios de los programas, cifras por sede
--               y el importador de las vicerrectorías
-- =============================================================================
-- 1. Un programa, en una sede, puede crear sus propios indicadores. Pueden
--    relacionarse con una ficha principal (parent_id) o no; no son adopciones
--    ni fichas institucionales. Viven en imp_indicators para reutilizar
--    cifras, cruces con pilares y ODS y el motor, con program_id y campus_id.
--    · Los ve y edita el programa en esa sede (y quien lo gestiona arriba).
--    · Los lee la vicerrectoría u oficina de su función, que además puede
--      reorganizarlos: relacionarlos con una ficha y cruzarlos con pilares y ODS.
--    · Ningún otro programa los ve.
--    Código automático: P-<programa>-<sede>-001.
--
-- 2. Una cifra puede ser de una sede sin programa (la de la UDES en Cúcuta,
--    por ejemplo). La escribe la unidad dueña de la ficha, como la global.
--
-- 3. imp_import_values(): el importador de Excel de las vicerrectorías.
--    imp_link_program_indicator(): la vicerrectoría relaciona un indicador
--    de programa con una ficha de su función.
--
-- 4. La sincronización con la hoja anterior crea indicadores de programa
--    (legacy_id = «P_FISBGA_012») y Mr. Pilo cuenta también los indicadores
--    propios que cuelgan de cada ficha.
--
-- Requiere 0078 y 0083. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Indicadores del programa
-- -----------------------------------------------------------------------------

alter table public.imp_indicators
  add column if not exists program_id uuid references public.units (id) on delete cascade,
  add column if not exists campus_id  uuid references public.campuses (id) on delete cascade,
  add column if not exists parent_id  uuid references public.imp_indicators (id) on delete set null,
  add column if not exists legacy_id  text;

comment on column public.imp_indicators.program_id is
  'Con valor: indicador propio de ese programa en campus_id. Vacío: ficha institucional.';
comment on column public.imp_indicators.parent_id is
  'Ficha institucional con la que se relaciona un indicador de programa. Opcional.';
comment on column public.imp_indicators.legacy_id is
  'Id en la herramienta anterior (P_FISBGA_012), para que la sincronización no duplique.';

create unique index if not exists imp_indicators_legacy_unique on public.imp_indicators (legacy_id) where legacy_id is not null;
create index if not exists imp_indicators_program_idx on public.imp_indicators (program_id, campus_id) where program_id is not null;
create index if not exists imp_indicators_parent_idx on public.imp_indicators (parent_id) where parent_id is not null;

alter table public.imp_indicators drop constraint if exists imp_indicators_code_format;
alter table public.imp_indicators add constraint imp_indicators_code_format check (
  (program_id is null and code ~ '^[A-Z]{1,4}[0-9]{1,3}$')
  or (program_id is not null and code ~ '^P-[A-Z0-9-]{1,40}$')
);

alter table public.imp_indicators drop constraint if exists imp_indicators_program_scope;
alter table public.imp_indicators add constraint imp_indicators_program_scope check ((program_id is null) = (campus_id is null));

/** El guardián de siempre, que ahora distingue las fichas de los indicadores de programa. */
create or replace function public.imp_indicators_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_program text;
  v_campus text;
  v_next integer;
begin
  if new.dimension_id is not null
     and not exists (select 1 from public.imp_dimensions d where d.id = new.dimension_id and d.fn = new.fn) then
    raise exception 'La dimensión no pertenece a esa función.' using errcode = '23514';
  end if;

  if new.program_id is null then
    if not exists (select 1 from public.imp_unit_functions f where f.unit_id = new.owner_unit_id and f.fn = new.fn) then
      raise exception 'La unidad dueña no lleva esa función sustantiva.' using errcode = '23514';
    end if;
  else
    if not exists (
      select 1 from public.program_campuses pc
       where pc.program_id = new.program_id and pc.campus_id = new.campus_id and pc.active
    ) then
      raise exception 'El programa no se ofrece en esa sede.' using errcode = '23514';
    end if;
    new.owner_unit_id := new.program_id;
    if new.parent_id is not null and not exists (
      select 1 from public.imp_indicators p where p.id = new.parent_id and p.program_id is null
    ) then
      raise exception 'Un indicador de programa solo se relaciona con una ficha institucional.' using errcode = '23514';
    end if;
    -- Código automático: P-FIS-BGA-001.
    if tg_op = 'INSERT' and (new.code is null or new.code = '' or new.code !~ '^P-') then
      select upper(regexp_replace(u.code, '[^A-Za-z0-9]', '', 'g')) into v_program from public.units u where u.id = new.program_id;
      select upper(regexp_replace(coalesce(nullif(c.code, ''), c.slug), '[^A-Za-z0-9]', '', 'g')) into v_campus
        from public.campuses c where c.id = new.campus_id;
      select coalesce(max(nullif(substring(i.code from '([0-9]+)$'), '')::integer), 0) + 1 into v_next
        from public.imp_indicators i
       where i.program_id = new.program_id and i.campus_id = new.campus_id;
      new.code := format('P-%s-%s-%s', left(coalesce(v_program, 'PRG'), 12), left(coalesce(v_campus, 'SEDE'), 12), lpad(v_next::text, 3, '0'));
    end if;
  end if;

  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Quién edita un indicador
-- -----------------------------------------------------------------------------

/**
 * ¿Puede quien pregunta editar este indicador? Una ficha: la administración o
 * su unidad dueña. Un indicador de programa: el programa en su sede.
 */
create or replace function public.imp_can_edit_indicator(p_indicator uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.imp_indicators i
     where i.id = p_indicator
       and (
         public.imp_can_define(i.fn, i.owner_unit_id)
         or (i.program_id is not null and public.imp_can_edit_program(i.program_id, i.campus_id))
       )
  );
$$;

/** ¿Puede reorganizarlo? Además de quien lo edita, la vicerrectoría u oficina de su función (editor o jefe). */
create or replace function public.imp_can_curate_indicator(p_indicator uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.imp_can_edit_indicator(p_indicator)
      or exists (
        select 1 from public.imp_indicators i
         where i.id = p_indicator and i.program_id is not null and public.imp_fn_member(i.fn, 'editor')
      );
$$;

revoke all on function public.imp_can_edit_indicator(uuid), public.imp_can_curate_indicator(uuid) from public;
grant execute on function public.imp_can_edit_indicator(uuid), public.imp_can_curate_indicator(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Permisos de las fichas y los indicadores de programa
-- -----------------------------------------------------------------------------

-- Lectura: su función la ve entera (fichas e indicadores de programa); los
-- programas ven las fichas publicadas y sus propios indicadores, nunca los
-- de otro programa.
drop policy if exists imp_indicators_read on public.imp_indicators;
create policy imp_indicators_read on public.imp_indicators
  for select to authenticated
  using (
    public.imp_can_read_fn(fn)
    or (program_id is null and status = 'publicado' and public.imp_on_program_side())
    or (program_id is not null and public.imp_can_view_program(program_id, campus_id))
  );

drop policy if exists imp_indicators_insert on public.imp_indicators;
create policy imp_indicators_insert on public.imp_indicators
  for insert to authenticated
  with check (
    (program_id is null and public.imp_can_define(fn, owner_unit_id))
    or (program_id is not null and public.imp_can_edit_program(program_id, campus_id))
  );

drop policy if exists imp_indicators_update on public.imp_indicators;
create policy imp_indicators_update on public.imp_indicators
  for update to authenticated
  using (
    (program_id is null and public.imp_can_define(fn, owner_unit_id))
    or (program_id is not null and public.imp_can_edit_program(program_id, campus_id))
  )
  with check (
    (program_id is null and public.imp_can_define(fn, owner_unit_id))
    or (program_id is not null and public.imp_can_edit_program(program_id, campus_id))
  );

-- El programa puede borrar lo suyo; las fichas, solo la administración.
drop policy if exists imp_indicators_delete on public.imp_indicators;
create policy imp_indicators_delete on public.imp_indicators
  for delete to authenticated
  using (
    public.has_role_at_least('admin')
    or (program_id is not null and public.imp_can_edit_program(program_id, campus_id))
  );

-- Cruces con pilares y ODS: quien edita el indicador, o la vicerrectoría de
-- su función si es de un programa.
drop policy if exists imp_alignments_write on public.imp_alignments;
create policy imp_alignments_write on public.imp_alignments
  for all to authenticated
  using (public.imp_can_curate_indicator(indicator_id))
  with check (public.imp_can_curate_indicator(indicator_id));

drop policy if exists imp_indicator_refs_write on public.imp_indicator_refs;
create policy imp_indicator_refs_write on public.imp_indicator_refs
  for all to authenticated
  using (public.imp_can_edit_indicator(indicator_id))
  with check (public.imp_can_edit_indicator(indicator_id));

-- Solo se adopta una ficha institucional publicada, nunca el indicador de otro programa.
create or replace function public.imp_adoptions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.program_campuses pc
     where pc.program_id = new.program_id and pc.campus_id = new.campus_id and pc.active
  ) then
    raise exception 'El programa no se ofrece en esa sede.' using errcode = '23514';
  end if;
  if exists (select 1 from public.imp_indicators i where i.id = new.indicator_id and i.program_id is not null) then
    raise exception 'Un indicador de programa no se adopta: ya es de su programa.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and not exists (
    select 1 from public.imp_indicators i where i.id = new.indicator_id and i.status = 'publicado'
  ) then
    raise exception 'Solo se adopta una ficha publicada.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Cifras por sede
-- -----------------------------------------------------------------------------

alter table public.imp_values drop constraint if exists imp_values_scope;
alter table public.imp_values add constraint imp_values_scope check (program_id is null or campus_id is not null);

comment on table public.imp_values is
  'Cifra de un indicador en un año: la global (sin programa ni sede), la de una sede (sin programa) o la de un programa en una sede.';

-- -----------------------------------------------------------------------------
-- 5. El importador de Excel
-- -----------------------------------------------------------------------------
-- p_rows = [{indicator_code, year, program_id, campus_id, value_num, numerator,
--            denominator, value_text, not_applicable, note, evidence_url}]
-- Corre con los permisos de quien llama: RLS decide fila a fila, y una fila
-- ajena detiene el lote entero.

create or replace function public.imp_import_values(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
  v_ind uuid;
  n_created integer := 0;
  n_updated integer := 0;
  v_existing uuid;
begin
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Las cifras deben ser una lista.' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    select id into v_ind from public.imp_indicators where code = r ->> 'indicator_code';
    if v_ind is null then
      raise exception 'La ficha % no existe.', r ->> 'indicator_code' using errcode = '23503';
    end if;
    if not public.imp_can_edit_indicator(v_ind)
       and not (nullif(r ->> 'program_id', '') is not null
                and public.imp_can_edit_program((r ->> 'program_id')::uuid, (r ->> 'campus_id')::uuid)) then
      raise exception 'No puede cargar cifras de %.', r ->> 'indicator_code' using errcode = '42501';
    end if;

    select v.id into v_existing
      from public.imp_values v
     where v.indicator_id = v_ind
       and v.year = (r ->> 'year')::smallint
       and v.program_id is not distinct from nullif(r ->> 'program_id', '')::uuid
       and v.campus_id is not distinct from nullif(r ->> 'campus_id', '')::uuid;

    if v_existing is null then
      insert into public.imp_values (indicator_id, year, program_id, campus_id, value_num, numerator, denominator,
                                     value_text, not_applicable, note, evidence_url)
      values (v_ind, (r ->> 'year')::smallint, nullif(r ->> 'program_id', '')::uuid, nullif(r ->> 'campus_id', '')::uuid,
              (r ->> 'value_num')::numeric, (r ->> 'numerator')::numeric, (r ->> 'denominator')::numeric,
              coalesce(r ->> 'value_text', ''), coalesce((r ->> 'not_applicable')::boolean, false),
              coalesce(r ->> 'note', ''), coalesce(r ->> 'evidence_url', ''));
      n_created := n_created + 1;
    else
      update public.imp_values v
         set value_num = (r ->> 'value_num')::numeric,
             numerator = (r ->> 'numerator')::numeric,
             denominator = (r ->> 'denominator')::numeric,
             value_text = coalesce(r ->> 'value_text', ''),
             not_applicable = coalesce((r ->> 'not_applicable')::boolean, false),
             note = case when coalesce(r ->> 'note', '') = '' then v.note else r ->> 'note' end,
             evidence_url = case when coalesce(r ->> 'evidence_url', '') = '' then v.evidence_url else r ->> 'evidence_url' end
       where v.id = v_existing;
      n_updated := n_updated + 1;
    end if;
  end loop;

  return jsonb_build_object('creadas', n_created, 'actualizadas', n_updated);
end;
$$;

comment on function public.imp_import_values(jsonb) is
  'Carga cifras desde el importador de Excel: global, por sede o por programa en una sede. Todo o nada; RLS decide.';

revoke all on function public.imp_import_values(jsonb) from public;
grant execute on function public.imp_import_values(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. La vicerrectoría relaciona un indicador de programa con una ficha
-- -----------------------------------------------------------------------------

create or replace function public.imp_link_program_indicator(p_indicator uuid, p_parent uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fn text;
begin
  select fn into v_fn from public.imp_indicators where id = p_indicator and program_id is not null;
  if v_fn is null then
    raise exception 'No es un indicador de programa.' using errcode = 'P0002';
  end if;
  if not public.imp_can_curate_indicator(p_indicator) then
    raise exception 'Solo el programa o la vicerrectoría de su función lo reorganizan.' using errcode = '42501';
  end if;
  if p_parent is not null and not exists (
    select 1 from public.imp_indicators p where p.id = p_parent and p.program_id is null and p.fn = v_fn
  ) then
    raise exception 'La ficha debe ser institucional y de la misma función.' using errcode = '23514';
  end if;
  update public.imp_indicators set parent_id = p_parent where id = p_indicator;
end;
$$;

comment on function public.imp_link_program_indicator(uuid, uuid) is
  'Relaciona (o suelta, con null) un indicador de programa con una ficha institucional de su función.';

revoke all on function public.imp_link_program_indicator(uuid, uuid) from public;
grant execute on function public.imp_link_program_indicator(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Mr. Pilo cuenta también lo que cuelga de cada ficha
-- -----------------------------------------------------------------------------
-- Un programa «sigue» una ficha si la adoptó o si tiene un indicador propio
-- relacionado con ella.

create or replace function public.imp_peer_adoptions(p_program uuid, p_campus uuid)
returns table (indicator_id uuid, peers_faculty integer, total_faculty integer, peers_all integer, total_all integer)
language sql
stable
security definer
set search_path = public
as $$
  with parent as (
    select u.parent_id from public.units u where u.id = p_program
  ),
  follows as (
    select a.indicator_id, a.program_id, a.campus_id from public.imp_adoptions a where a.active
    union
    select i.parent_id, i.program_id, i.campus_id from public.imp_indicators i
     where i.program_id is not null and i.parent_id is not null and i.status <> 'retirado'
  ),
  others as (
    select f.*, (u.parent_id is not distinct from (select parent_id from parent) and (select parent_id from parent) is not null) as same_faculty
      from follows f
      join public.units u on u.id = f.program_id
     where not (f.program_id = p_program and f.campus_id = p_campus)
  ),
  totals as (
    select count(distinct (program_id, campus_id)) filter (where same_faculty)::integer as faculty,
           count(distinct (program_id, campus_id))::integer as everyone
      from others
  )
  select o.indicator_id,
         count(distinct (o.program_id, o.campus_id)) filter (where o.same_faculty)::integer,
         (select faculty from totals),
         count(distinct (o.program_id, o.campus_id))::integer,
         (select everyone from totals)
    from others o
   group by o.indicator_id;
$$;

-- -----------------------------------------------------------------------------
-- 8. La sincronización crea indicadores de programa
-- -----------------------------------------------------------------------------
-- p_batch gana program_indicators: [{legacy_id, program_id, campus_id, fn,
-- stage, name, description, unit_label, parent_code, baseline_text, …}], y en
-- values se admite legacy_id en vez de indicator_code.

create or replace function public.imp_sync_apply(p_batch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
  v_ind uuid;
  v_base boolean;
  v_t26 boolean;
  v_t28 boolean;
  n_programs integer := 0;
  n_indicators integer := 0;
  n_program_indicators integer := 0;
  n_adoptions integer := 0;
  n_values integer := 0;
  v_run uuid;
begin
  if not public.has_role_at_least('admin') then
    raise exception 'Solo la administración sincroniza con la hoja anterior.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_batch, '{}'::jsonb)) <> 'object' then
    raise exception 'El lote debe ser un objeto.' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_batch -> 'programs', '[]'::jsonb)) loop
    insert into public.imp_legacy_programs (code, program_id, campus_id, name, updated_at)
    values (upper(trim(r ->> 'code')), (r ->> 'program_id')::uuid, (r ->> 'campus_id')::uuid, coalesce(r ->> 'name', ''), now())
    on conflict (code) do update
      set program_id = excluded.program_id, campus_id = excluded.campus_id, name = excluded.name, updated_at = now();
    n_programs := n_programs + 1;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_batch -> 'indicators', '[]'::jsonb)) loop
    update public.imp_indicators i
       set baseline_text   = case when r ? 'baseline_text' then coalesce(r ->> 'baseline_text', '') else i.baseline_text end,
           baseline_num    = case when r ? 'baseline_text' then (r ->> 'baseline_num')::numeric else i.baseline_num end,
           target_2026     = case when r ? 'target_2026' then coalesce(r ->> 'target_2026', '') else i.target_2026 end,
           target_2026_num = case when r ? 'target_2026' then (r ->> 'target_2026_num')::numeric else i.target_2026_num end,
           target_2028     = case when r ? 'target_2028' then coalesce(r ->> 'target_2028', '') else i.target_2028 end,
           target_2028_num = case when r ? 'target_2028' then (r ->> 'target_2028_num')::numeric else i.target_2028_num end
     where i.code = r ->> 'code' and i.program_id is null;
    if found then
      n_indicators := n_indicators + 1;
    end if;
  end loop;

  -- Indicadores propios de los programas, por su id en la hoja.
  for r in select * from jsonb_array_elements(coalesce(p_batch -> 'program_indicators', '[]'::jsonb)) loop
    select id into v_ind from public.imp_indicators where legacy_id = r ->> 'legacy_id';
    if v_ind is null then
      insert into public.imp_indicators (code, fn, stage, owner_unit_id, program_id, campus_id, parent_id, legacy_id,
                                         name, description, unit_label, measure, status,
                                         baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num)
      values ('', r ->> 'fn', r ->> 'stage', (r ->> 'program_id')::uuid, (r ->> 'program_id')::uuid, (r ->> 'campus_id')::uuid,
              (select p.id from public.imp_indicators p where p.code = r ->> 'parent_code' and p.program_id is null),
              r ->> 'legacy_id', r ->> 'name', coalesce(r ->> 'description', ''), coalesce(r ->> 'unit_label', ''),
              coalesce(r ->> 'measure', 'numero'), 'publicado',
              coalesce(r ->> 'baseline_text', ''), (r ->> 'baseline_num')::numeric,
              coalesce(r ->> 'target_2026', ''), (r ->> 'target_2026_num')::numeric,
              coalesce(r ->> 'target_2028', ''), (r ->> 'target_2028_num')::numeric);
    else
      update public.imp_indicators i
         set name = coalesce(r ->> 'name', i.name),
             description = coalesce(r ->> 'description', i.description),
             unit_label = coalesce(r ->> 'unit_label', i.unit_label),
             baseline_text   = case when r ? 'baseline_text' then coalesce(r ->> 'baseline_text', '') else i.baseline_text end,
             baseline_num    = case when r ? 'baseline_text' then (r ->> 'baseline_num')::numeric else i.baseline_num end,
             target_2026     = case when r ? 'target_2026' then coalesce(r ->> 'target_2026', '') else i.target_2026 end,
             target_2026_num = case when r ? 'target_2026' then (r ->> 'target_2026_num')::numeric else i.target_2026_num end,
             target_2028     = case when r ? 'target_2028' then coalesce(r ->> 'target_2028', '') else i.target_2028 end,
             target_2028_num = case when r ? 'target_2028' then (r ->> 'target_2028_num')::numeric else i.target_2028_num end
       where i.id = v_ind;
    end if;
    n_program_indicators := n_program_indicators + 1;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_batch -> 'adoptions', '[]'::jsonb)) loop
    select id into v_ind from public.imp_indicators where code = r ->> 'indicator_code' and program_id is null;
    if v_ind is null then
      raise exception 'La ficha % no existe.', r ->> 'indicator_code' using errcode = '23503';
    end if;
    v_base := r ? 'baseline_text';
    v_t26 := r ? 'target_2026';
    v_t28 := r ? 'target_2028';
    update public.imp_adoptions a
       set active          = true,
           baseline_text   = case when v_base then coalesce(r ->> 'baseline_text', '') else a.baseline_text end,
           baseline_num    = case when v_base then (r ->> 'baseline_num')::numeric else a.baseline_num end,
           target_2026     = case when v_t26 then coalesce(r ->> 'target_2026', '') else a.target_2026 end,
           target_2026_num = case when v_t26 then (r ->> 'target_2026_num')::numeric else a.target_2026_num end,
           target_2028     = case when v_t28 then coalesce(r ->> 'target_2028', '') else a.target_2028 end,
           target_2028_num = case when v_t28 then (r ->> 'target_2028_num')::numeric else a.target_2028_num end
     where a.indicator_id = v_ind
       and a.program_id = (r ->> 'program_id')::uuid
       and a.campus_id = (r ->> 'campus_id')::uuid;
    if not found then
      insert into public.imp_adoptions (indicator_id, program_id, campus_id, active,
                                        baseline_text, baseline_num, target_2026, target_2026_num, target_2028, target_2028_num)
      values (v_ind, (r ->> 'program_id')::uuid, (r ->> 'campus_id')::uuid, true,
              coalesce(r ->> 'baseline_text', ''), (r ->> 'baseline_num')::numeric,
              coalesce(r ->> 'target_2026', ''), (r ->> 'target_2026_num')::numeric,
              coalesce(r ->> 'target_2028', ''), (r ->> 'target_2028_num')::numeric);
    end if;
    n_adoptions := n_adoptions + 1;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_batch -> 'values', '[]'::jsonb)) loop
    if r ? 'legacy_id' then
      select id into v_ind from public.imp_indicators where legacy_id = r ->> 'legacy_id';
    else
      select id into v_ind from public.imp_indicators where code = r ->> 'indicator_code';
    end if;
    if v_ind is null then
      raise exception 'El indicador % no existe.', coalesce(r ->> 'legacy_id', r ->> 'indicator_code') using errcode = '23503';
    end if;
    insert into public.imp_values as v (indicator_id, year, program_id, campus_id, value_num, value_text, not_applicable, note)
    values (v_ind, (r ->> 'year')::smallint, nullif(r ->> 'program_id', '')::uuid, nullif(r ->> 'campus_id', '')::uuid,
            (r ->> 'value_num')::numeric, coalesce(r ->> 'value_text', ''),
            coalesce((r ->> 'not_applicable')::boolean, false), coalesce(r ->> 'note', ''))
    on conflict (indicator_id, year,
                 coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(campus_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set value_num = excluded.value_num,
                  numerator = null,
                  denominator = null,
                  value_text = excluded.value_text,
                  not_applicable = excluded.not_applicable,
                  note = case when excluded.note = '' then v.note else excluded.note end;
    n_values := n_values + 1;
  end loop;

  insert into public.imp_sync_runs (source_url, summary, run_by)
  values (
    coalesce(p_batch ->> 'source_url', ''),
    coalesce(p_batch -> 'summary', '{}'::jsonb)
      || jsonb_build_object('programas', n_programs, 'fichas', n_indicators, 'propios', n_program_indicators,
                            'adopciones', n_adoptions, 'cifras', n_values),
    auth.uid()
  )
  returning id into v_run;

  return jsonb_build_object('run', v_run, 'programas', n_programs, 'fichas', n_indicators, 'propios', n_program_indicators,
                            'adopciones', n_adoptions, 'cifras', n_values);
end;
$$;

notify pgrst, 'reload schema';
