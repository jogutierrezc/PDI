-- =============================================================================
-- PDI · 0075 · Niveles de formación: técnico profesional, tecnológico y
--             especialización médico-quirúrgica
--
-- La UDES ofrece programas técnicos profesionales, tecnológicos y
-- especializaciones médico-quirúrgicas (las residencias, con reglas propias de
-- duración y práctica), y 0063 solo admitía pregrado, especialización,
-- maestría y doctorado. Se amplían las dos listas que lo fijan:
--
--   units.degree_level             el nivel de cada programa;
--   imp_indicators.applies_degrees a qué niveles aplica cada indicador.
--
-- «pregrado» sigue siendo el valor del profesional universitario: cambiarlo
-- movería datos que ya existen.
--
-- No se cambia ningún dato. Un programa de estos niveles recibe los
-- indicadores que marquen su nivel en «Aplica a»; los de una versión ya
-- publicada no lo tienen (las versiones publicadas no se tocan), así que se
-- marcan en el borrador de la siguiente versión del catálogo.
--
-- Requiere 0063 y 0064. Idempotente.
-- =============================================================================

alter table public.units drop constraint if exists units_degree_level_check;
alter table public.units add constraint units_degree_level_check
  check (degree_level is null or degree_level in
    ('tecnico', 'tecnologico', 'pregrado', 'especializacion', 'especializacion_medicoquirurgica', 'maestria', 'doctorado'));

comment on column public.units.degree_level is
  'Nivel de formación del programa: tecnico (técnico profesional), tecnologico, pregrado (profesional universitario), especializacion, especializacion_medicoquirurgica, maestria o doctorado. Decide qué indicadores le aplican.';

alter table public.imp_indicators drop constraint if exists imp_indicators_degrees;
alter table public.imp_indicators add constraint imp_indicators_degrees
  check (applies_degrees <@ array['tecnico', 'tecnologico', 'pregrado', 'especializacion', 'especializacion_medicoquirurgica', 'maestria', 'doctorado']);

notify pgrst, 'reload schema';
