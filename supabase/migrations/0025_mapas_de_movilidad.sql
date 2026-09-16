-- =============================================================================
-- PDI · 0025 · Mapas de movilidad internacional
--
-- Los mapas de UDES en Cifras eran solo por departamento: od_map_values guarda
-- (mapa, año, campus, departamento DANE) → personas. La movilidad internacional
-- tiene exactamente esa forma si el departamento se cambia por el país:
--
--   entrante   participantes que llegan de un país (origen) a un campus
--   saliente   participantes que salen de un campus a un país (destino)
--
-- Así que no hay tabla nueva: od_map_mode gana los dos valores y
-- department_code acepta, además del código DANE de dos dígitos, el código
-- ISO 3166-1 alfa-3 del país (COL, MEX, ESP…). Un disparador comprueba que cada
-- mapa reciba el código que le corresponde: DANE en origen y cobertura, ISO en
-- entrante y saliente.
--
-- Requiere 0019. Idempotente.
-- =============================================================================

alter type public.od_map_mode add value if not exists 'entrante';
alter type public.od_map_mode add value if not exists 'saliente';

alter table public.od_map_values drop constraint if exists od_map_values_department;
alter table public.od_map_values add constraint od_map_values_department
  check (department_code ~ '^([0-9]{2}|[A-Z]{3})$');

comment on column public.od_map_values.department_code is
  'Código DANE del departamento (dos dígitos) en mapas origen y cobertura; ISO 3166-1 alfa-3 del país en mapas entrante y saliente.';

-- El modo se compara como texto: los valores nuevos del enum no se pueden usar
-- como literal en la misma transacción que los crea.
create or replace function public.od_map_values_check_code()
returns trigger
language plpgsql
as $$
declare
  map_mode text;
begin
  select m.mode::text into map_mode from public.od_maps m where m.id = new.map_id;
  if map_mode in ('entrante', 'saliente') and new.department_code !~ '^[A-Z]{3}$' then
    raise exception 'El mapa de movilidad % espera un país en ISO alfa-3 (p. ej. MEX), no "%".', map_mode, new.department_code
      using errcode = 'check_violation';
  end if;
  if map_mode in ('origen', 'cobertura') and new.department_code !~ '^[0-9]{2}$' then
    raise exception 'El mapa por departamento espera un código DANE de dos dígitos, no "%".', new.department_code
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists od_map_values_check_code on public.od_map_values;
create trigger od_map_values_check_code
  before insert or update on public.od_map_values
  for each row execute function public.od_map_values_check_code();

notify pgrst, 'reload schema';
