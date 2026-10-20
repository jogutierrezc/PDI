-- =============================================================================
-- PDI · 0176 · Mis Tableros · plantillas por página y sección del visor
--
-- El taller del Observatorio sabe armar una página de cuatro maneras —tablero,
-- narrativo, comparativo y ficha técnica— y clasificar cada visor en una
-- sección: panorama, tendencia, composición, territorio o detalle. Mis
-- Tableros copiaba la captura de datos y la gráfica, pero no la página: toda
-- la vida la misma rejilla de dos columnas, sin texto y sin orden de lectura.
--
-- Dos piezas:
--
--   boards.pages        ya es jsonb: cada página gana `template` y `intro`
--                       dentro del propio objeto {slug, title}. No toca la
--                       forma de la tabla ni sus políticas; los tableros ya
--                       guardados simplemente quedan como «tablero», que era
--                       lo único que sabían ser.
--   board_views.section la sección de la página en la que se lee el visor.
--                       Columna aparte, como `page`, porque se pregunta en la
--                       consulta de la página y conviene indexarla con ella.
--
-- Requiere 0058 (board_views). Idempotente.
-- =============================================================================

alter table public.board_views
  add column if not exists section text not null default 'detalle';

comment on column public.board_views.section is
  'Sección de la página: panorama, tendencia, composicion, territorio o detalle. Igual que la sección del visor del Observatorio.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'board_views_section') then
    alter table public.board_views
      add constraint board_views_section check (section in ('panorama', 'tendencia', 'composicion', 'territorio', 'detalle'));
  end if;
end $$;

-- La sección entra en el mismo índice que la página: la página pública pide
-- los visores de una página, y de ellos, los de cada sección en su orden.
drop index if exists board_views_board_idx;
create index board_views_board_idx on public.board_views (board_id, page, section, position);
