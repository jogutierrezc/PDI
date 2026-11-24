-- =============================================================================
-- PDI · 0076 · Desgloses: «Composición» como gráfica por defecto
--
-- Un desglose con varios cortes (años o periodos académicos) se lee mejor en
-- la vista Composición: una columna al 100 % por corte, a lo largo del
-- periodo. La ficha ya la ofrece, pero solo se podía fijar Circular o Barras
-- como vista de entrada. Se añade el valor al tipo que la guarda
-- (od_breakdowns.default_chart).
--
-- No se cambia ningún dato: los desgloses siguen abriendo como hasta ahora.
-- Idempotente.
-- =============================================================================

alter type public.od_chart_kind add value if not exists 'composicion';
