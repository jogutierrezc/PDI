-- =============================================================================
-- PDI · 0029 · Separadores en la ficha de un informe
--
-- Un informe grande mezcla fuentes de datos de temas distintos. El separador
-- es un bloque de la ficha con título y descripción ("Graduados") que agrupa
-- todos los bloques que le siguen hasta el próximo separador. La ficha web lo
-- pinta como franja de sección y el Boletín lo usa para paginar: cada
-- separador abre página y entra al índice bajo su capítulo.
--
--   od_block_kind + 'separador'
--   settings.title, settings.description   lo que dice el separador
--   settings.slot                           distingue varios bloques del mismo
--                                           tipo sin conjunto: varios separadores,
--                                           o un tablero de indicadores por grupo
--
-- La unicidad de 0022 (informe, tipo, conjunto, punto) impedía un segundo
-- separador o un segundo tablero. Se rehace sumando settings.slot, que viaja
-- en settings: od_copy_period lo copia sin cambios.
--
-- Requiere 0019 y 0022. Idempotente.
-- =============================================================================

alter type public.od_block_kind add value if not exists 'separador';

alter table public.od_report_blocks drop constraint if exists od_report_blocks_section_unique;

create unique index if not exists od_report_blocks_slot_unique
  on public.od_report_blocks (report_id, kind, ref_id, section_id, (coalesce(settings ->> 'slot', '')))
  nulls not distinct;

comment on index public.od_report_blocks_slot_unique is
  'Un bloque por tipo, conjunto y punto; settings.slot permite varios separadores o tableros en una ficha.';

notify pgrst, 'reload schema';
