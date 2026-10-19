-- =============================================================================
-- PDI · 0168 · Equivalencias de facultad entre el portal y la API del plan
-- =============================================================================
-- El portal identifica cada facultad con su propio código en units.code
-- (FACSOC, FAINT, FACSALUD, FACCNA, FACAVET, FCEAC, UDESTEC); la API
-- «Plan de Trabajo Decanatura UDES 2026» usa otros (FCS, FIT, FCMS, FCN,
-- FCAV, FCEAC, CFTT). La función edge `informe-plan` traduce de unos a otros
-- antes de llamar a la API.
--
--   facultades_plan   la tabla que conecta los dos mundos. La función lee
--                     codigo_api con la fila de units.code; si la tabla no
--                     existe o la unidad no está, cae al mapa que lleva
--                     dentro como respaldo. Planeación puede corregir o
--                     agregar una facultad con un UPDATE/INSERT, sin tocar
--                     ni redesplegar la función.
--
-- Solo la lee la función edge (con la clave de servicio): RLS activado y
-- sin políticas para anon ni authenticated, como los demás catálogos
-- internos. Idempotente.
-- =============================================================================

create table if not exists public.facultades_plan (
  codigo_portal text primary key,
  codigo_api    text not null unique,
  notas         text not null default '',
  modificado_en timestamptz not null default now()
);

comment on table public.facultades_plan is
  'Equivalencia units.code ↔ código de facultad de la API «Plan de Trabajo Decanatura UDES 2026». La lee la función edge informe-plan.';

insert into public.facultades_plan (codigo_portal, codigo_api) values
  ('FACSOC',   'FCS'),
  ('FAINT',    'FIT'),
  ('FACSALUD', 'FCMS'),
  ('FACCNA',   'FCN'),
  ('FACAVET',  'FCAV'),
  ('FCEAC',    'FCEAC'),
  ('UDESTEC',  'CFTT')
on conflict (codigo_portal) do update
  set codigo_api = excluded.codigo_api,
      modificado_en = now()
where public.facultades_plan.codigo_api is distinct from excluded.codigo_api;

alter table public.facultades_plan enable row level security;
revoke all on public.facultades_plan from anon, authenticated;
