-- =============================================================================
-- PDI · 0034 · Conjuntos libres: filas con tipo
--
-- Una fila de un conjunto libre ya no es solo un dato: puede ser un título que
-- agrupa las que siguen, o un total.
--
--   kind = 'dato'   una fila de datos, como hasta ahora
--          'grupo'  un título que agrupa las filas siguientes hasta el próximo
--                   grupo; no tiene cifras y no entra en las gráficas
--          'total'  una fila de total, calculada sobre las filas de datos de su
--                   grupo (o de toda la fuente si no hay grupos): suma las
--                   columnas de enteros y promedia las de decimales y
--                   porcentajes. No entra en las gráficas.
--
--   label           el texto del título o del total ("Ciencias de la Salud",
--                   "Total Bucaramanga"). En una fila de datos va vacío.
--
-- Las gráficas solo leen las filas 'dato': un total dibujado junto a sus partes
-- contaría dos veces lo mismo. La tabla sí muestra los tres tipos.
--
-- Requiere 0033. Idempotente.
-- =============================================================================

alter table public.od_free_set_rows
  add column if not exists kind text not null default 'dato',
  add column if not exists label text not null default '';

alter table public.od_free_set_rows drop constraint if exists od_free_set_rows_kind;
alter table public.od_free_set_rows
  add constraint od_free_set_rows_kind check (kind in ('dato', 'grupo', 'total'));

comment on column public.od_free_set_rows.kind is
  'dato | grupo (título que agrupa las filas siguientes) | total (calculado sobre las filas de datos de su grupo).';
comment on column public.od_free_set_rows.label is
  'Texto del título o del total; vacío en una fila de datos.';

notify pgrst, 'reload schema';
