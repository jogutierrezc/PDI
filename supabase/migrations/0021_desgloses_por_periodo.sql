-- Desgloses por periodo académico. Las cifras existentes siguen siendo anuales:
-- no se atribuyen a A o B ni se reemplazan al capturar un periodo.
begin;

-- Idempotente y en cualquier orden: si la base aún no tiene los tipos de los
-- periodos A y B (0019 anterior), se crean aquí con los mismos valores.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'od_term') then
    create type public.od_term as enum ('A', 'B', 'anual');
  end if;
  if not exists (select 1 from pg_type where typname = 'od_annual_rule') then
    create type public.od_annual_rule as enum ('suma', 'ultimo', 'promedio', 'reportado');
  end if;
end $$;


alter table public.od_indicators add column if not exists years smallint[];
alter table public.od_breakdowns add column if not exists years smallint[];
alter table public.od_breakdowns
  add column if not exists annual_rule public.od_annual_rule not null default 'reportado';
alter table public.od_breakdown_values
  add column if not exists term public.od_term not null default 'anual';

alter table public.od_breakdown_values drop constraint if exists od_breakdown_values_unique;
do $$
begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.od_breakdown_values'::regclass and conname = 'od_breakdown_values_term_unique') then
    alter table public.od_breakdown_values add constraint od_breakdown_values_term_unique
      unique (breakdown_id, year, term, label);
  end if;
end $$;

comment on column public.od_breakdowns.annual_rule is
  'Regla anual por categoría: suma, promedio, último periodo o cifra anual independiente.';
comment on column public.od_breakdown_values.term is
  'A, B o anual. Los datos anteriores se conservan como anual.';

notify pgrst, 'reload schema';
commit;
