-- =============================================================================
-- 0124 · UDES en Cifras · desgloses: mostrar o no el total.
--
-- «Ver datos por corte» suma las categorías de cada corte en una columna
-- «Total». No en todos los desgloses esa suma dice algo (porcentajes,
-- promedios, tasas, categorías que se solapan): cada desglose decide en la
-- intranet (Estructura → Conjuntos visuales → Desglose → «Mostrar total»).
--
-- Valor de partida: con total. Los desgloses que ya existen quedan como están.
-- Idempotente. No toca políticas: la columna hereda las de od_breakdowns.
-- =============================================================================

alter table public.od_breakdowns add column if not exists show_total boolean not null default true;

comment on column public.od_breakdowns.show_total is
  'Columna «Total» (suma de categorías) en «Ver datos por corte» del portal. true = se muestra (valor de partida).';
