-- Repara el despliegue donde 0077 quedó registrada como aplicada sin ejecutarse.
-- Conserva la tabla legacy y sus datos; únicamente la renombra y restaura sus
-- políticas y guardián para el esquema vigente.
do $$
begin
  if to_regclass('public.program_campuses') is null
     and to_regclass('public.imp_program_campuses') is not null then
    alter table public.imp_program_campuses rename to program_campuses;
  end if;

  if to_regclass('public.program_campuses') is null then
    raise exception 'No existe public.imp_program_campuses ni public.program_campuses';
  end if;

  if to_regclass('public.imp_program_campuses_campus_idx') is not null
     and to_regclass('public.program_campuses_campus_idx') is null then
    alter index public.imp_program_campuses_campus_idx rename to program_campuses_campus_idx;
  end if;

  if exists (select 1 from pg_constraint where conname = 'imp_program_campuses_pkey')
     and not exists (select 1 from pg_constraint where conname = 'program_campuses_pkey') then
    alter table public.program_campuses rename constraint imp_program_campuses_pkey to program_campuses_pkey;
  end if;
end $$;

comment on table public.program_campuses is
  'Oferta por sede: en qué campus se ofrece cada programa. La edita Estructura institucional.';

create or replace function public.program_campuses_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.units u where u.id = new.program_id and u.kind = 'programa') then
    raise exception 'Solo un programa se ofrece en una sede.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists imp_program_campuses_guard on public.program_campuses;
drop trigger if exists program_campuses_guard on public.program_campuses;
create trigger program_campuses_guard
  before insert or update on public.program_campuses
  for each row execute function public.program_campuses_guard();

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'program_campuses'
  loop
    execute format('drop policy %I on public.program_campuses', pol.policyname);
  end loop;
end $$;

alter table public.program_campuses enable row level security;

create policy program_campuses_read on public.program_campuses
  for select to authenticated using (true);

create policy program_campuses_write on public.program_campuses
  for all to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

grant select, insert, update, delete on public.program_campuses to authenticated;

notify pgrst, 'reload schema';
