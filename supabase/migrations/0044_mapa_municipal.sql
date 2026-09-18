-- =============================================================================
-- PDI · 0044 · Mapa de origen por municipio
--
-- Un tipo de mapa nuevo, «municipio»: de lejos colorea los departamentos; al
-- acercarse muestra un punto por municipio de origen con su cifra.
--
-- · En od_map_values, department_code pasa a admitir también el código
--   DIVIPOLA del municipio (cinco dígitos). En un mapa «municipio» conviven
--   las filas de departamento (dos dígitos: el total exacto) y las de
--   municipio (cinco dígitos: el punto).
-- · Reserva estadística, como en los desgloses (0041): una celda con menos de
--   5 personas se guarda con reserved = true y sin valor. En un municipio
--   pequeño, la cifra exacta de un campus señalaría a personas concretas.
--
-- Las cifras llegan desde scripts/build-bi-agregados.py, nunca a mano.
-- Va sola en su archivo por el valor nuevo del enum. Requiere 0019 y 0025.
-- Idempotente.
-- =============================================================================

alter type public.od_map_mode add value if not exists 'municipio';

alter table public.od_map_values drop constraint if exists od_map_values_department;
alter table public.od_map_values add constraint od_map_values_department
  check (department_code ~ '^([0-9]{2}|[0-9]{5}|[A-Z]{3})$');

comment on column public.od_map_values.department_code is
  'Código DANE del departamento (dos dígitos) en mapas origen, cobertura y municipio; DIVIPOLA del municipio (cinco dígitos) en mapas municipio; ISO 3166-1 alfa-3 del país en mapas entrante, saliente y convenios.';

alter table public.od_map_values add column if not exists reserved boolean not null default false;
alter table public.od_map_values alter column value drop not null;

alter table public.od_map_values drop constraint if exists od_map_values_reserved;
alter table public.od_map_values add constraint od_map_values_reserved
  check ((reserved and value is null) or (not reserved and value is not null));

comment on column public.od_map_values.reserved is
  'Menos de 5 personas: la celda existe pero su cifra no se publica. El portal la escribe «< 5».';
