-- =============================================================================
-- PDI · 0055 · Que la captura de UDES en Cifras abra rápido
--
-- Síntoma: la pantalla de captura de datos tardaba mucho y a veces no llegaba
-- a cargar.
--
-- Causa: las tablas de valores —las que cuelgan de un indicador, un desglose,
-- un mapa, un ranking, un Saber…— decidían el permiso con una subconsulta
-- *correlacionada*:
--
--   using (public.od_can_read((select sp.report_id from od_saber_pro sp
--                              where sp.id = saber_id)))
--
-- Al depender de `saber_id`, esa expresión se vuelve a evaluar **en cada
-- fila**: por cada una, una búsqueda en la tabla padre y una llamada a
-- `od_can_read`, que a su vez consulta el informe, el periodo y el perfil de
-- quien pregunta. Con 2.500 filas de Saber PRO eso son miles de consultas
-- encadenadas para leer una tabla pequeña.
--
-- Medido contra la base real, con la clave anónima, antes de esta migración —y
-- conviene leerlo con cuidado, porque el resultado depende del estado de la
-- instancia:
--
--   · contar `od_saber_pro_results` (2.427 filas) falló dos veces seguidas con
--     el error 57014, «canceling statement due to statement timeout», a los
--     3 s; leerla entera costó 7,2 s;
--   · veinte minutos después, ya caliente, la misma cuenta tardó 0,18 s y la
--     lectura entera 1,2 s.
--
-- Es decir: el coste por fila no siempre revienta, pero deja el margen tan
-- estrecho que basta con que la instancia esté fría o cargada para que la
-- pantalla de captura caiga. Que una cuenta sobre 2.427 filas llegue siquiera
-- a rozar el límite es la señal.
--
-- Y el intranet lo paga más caro que el portal público. Para quien no ha
-- entrado, `od_can_read` resuelve con `od_report_is_public` y corta ahí: una
-- consulta. Para quien ha entrado y está mirando un borrador, encadena
-- `has_role_at_least` → `current_role` → perfil, y `od_can_see_report` →
-- `has_access_role` → `has_all_reports` → `od_report_assigned`: cinco o seis
-- consultas más. Por cada fila. Por eso el tablero público va bien y la
-- captura no.
--
-- Arreglo: preguntar una sola vez. La subconsulta deja de mirar la fila de
-- fuera, así que el planificador la resuelve una vez, llama a `od_can_read`
-- una vez por *padre* —hay decenas, no miles— y cada fila se resuelve con una
-- búsqueda en memoria:
--
--   using (saber_id in (select sp.id from od_saber_pro sp
--                       where public.od_can_read(sp.report_id)))
--
-- El permiso concedido es exactamente el mismo: una fila se ve si, y solo si,
-- su padre pertenece a un informe legible. Las claves foráneas son
-- obligatorias, de modo que no hay filas huérfanas cuyo caso cambie.
--
-- No se tocan las políticas de las tablas padre (`od_reports`, `od_indicators`,
-- `od_saber_pro`…): ahí la función se llama una vez por fila y las filas son
-- pocas. Queda pendiente, y aparte, envolver los `has_role_at_least` de las
-- políticas de escritura de la 0019 en un `(select …)` para que se evalúen una
-- vez por sentencia; aquí solo se corrigen las que estaban correlacionadas.
--
-- Requiere 0019, 0022, 0030, 0031, 0033, 0035. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lectura
-- -----------------------------------------------------------------------------

drop policy if exists od_values_read on public.od_values;
create policy od_values_read on public.od_values for select to anon, authenticated
  using (indicator_id in (select i.id from public.od_indicators i where public.od_can_read(i.report_id)));

drop policy if exists od_breakdown_values_read on public.od_breakdown_values;
create policy od_breakdown_values_read on public.od_breakdown_values for select to anon, authenticated
  using (breakdown_id in (select b.id from public.od_breakdowns b where public.od_can_read(b.report_id)));

drop policy if exists od_heatmap_cells_read on public.od_heatmap_cells;
create policy od_heatmap_cells_read on public.od_heatmap_cells for select to anon, authenticated
  using (heatmap_id in (select h.id from public.od_heatmaps h where public.od_can_read(h.report_id)));

drop policy if exists od_map_values_read on public.od_map_values;
create policy od_map_values_read on public.od_map_values for select to anon, authenticated
  using (map_id in (select m.id from public.od_maps m where public.od_can_read(m.report_id)));

drop policy if exists od_pipeline_values_read on public.od_pipeline_values;
create policy od_pipeline_values_read on public.od_pipeline_values for select to anon, authenticated
  using (pipeline_id in (select p.id from public.od_pipelines p where public.od_can_read(p.report_id)));

drop policy if exists od_history_values_read on public.od_history_values;
create policy od_history_values_read on public.od_history_values for select to anon, authenticated
  using (history_id in (select s.id from public.od_histories s where public.od_can_read(s.report_id)));

drop policy if exists od_table_rows_read on public.od_table_rows;
create policy od_table_rows_read on public.od_table_rows for select to anon, authenticated
  using (table_id in (select t.id from public.od_tables t where public.od_can_read(t.report_id)));

drop policy if exists od_ranking_editions_read on public.od_ranking_editions;
create policy od_ranking_editions_read on public.od_ranking_editions for select to anon, authenticated
  using (ranking_id in (select rk.id from public.od_rankings rk where public.od_can_read(rk.report_id)));

drop policy if exists od_saber_pro_results_read on public.od_saber_pro_results;
create policy od_saber_pro_results_read on public.od_saber_pro_results for select to anon, authenticated
  using (saber_id in (select sp.id from public.od_saber_pro sp where public.od_can_read(sp.report_id)));

drop policy if exists od_saber_tyt_results_read on public.od_saber_tyt_results;
create policy od_saber_tyt_results_read on public.od_saber_tyt_results for select to anon, authenticated
  using (tyt_id in (select t.id from public.od_saber_tyt t where public.od_can_read(t.report_id)));

drop policy if exists od_free_set_rows_read on public.od_free_set_rows;
create policy od_free_set_rows_read on public.od_free_set_rows for select to anon, authenticated
  using (set_id in (select fs.id from public.od_free_sets fs where public.od_can_read(fs.report_id)));

-- -----------------------------------------------------------------------------
-- 2. Escritura
--
-- El mismo problema, y se nota al importar: una importación sube las filas de
-- 500 en 500, y cada fila volvía a preguntar por su informe. Aquí la lista de
-- padres permitidos también se resuelve una vez por sentencia.
-- -----------------------------------------------------------------------------

drop policy if exists od_ranking_editions_write on public.od_ranking_editions;
create policy od_ranking_editions_write on public.od_ranking_editions for all to authenticated
  using (ranking_id in (select rk.id from public.od_rankings rk where public.od_can_edit_report(rk.report_id)))
  with check (ranking_id in (select rk.id from public.od_rankings rk where public.od_can_edit_report(rk.report_id)));

drop policy if exists od_saber_pro_results_write on public.od_saber_pro_results;
create policy od_saber_pro_results_write on public.od_saber_pro_results for all to authenticated
  using (saber_id in (select sp.id from public.od_saber_pro sp where public.od_can_edit_report(sp.report_id)))
  with check (saber_id in (select sp.id from public.od_saber_pro sp where public.od_can_edit_report(sp.report_id)));

drop policy if exists od_saber_tyt_results_write on public.od_saber_tyt_results;
create policy od_saber_tyt_results_write on public.od_saber_tyt_results for all to authenticated
  using (tyt_id in (select t.id from public.od_saber_tyt t where public.od_can_edit_report(t.report_id)))
  with check (tyt_id in (select t.id from public.od_saber_tyt t where public.od_can_edit_report(t.report_id)));

drop policy if exists od_free_set_rows_write on public.od_free_set_rows;
create policy od_free_set_rows_write on public.od_free_set_rows for all to authenticated
  using (set_id in (select fs.id from public.od_free_sets fs where public.od_can_edit_report(fs.report_id)))
  with check (set_id in (select fs.id from public.od_free_sets fs where public.od_can_edit_report(fs.report_id)));

-- -----------------------------------------------------------------------------
-- 3. Que el planificador sepa cuántas filas hay
--
-- Las estadísticas de `od_saber_pro_results` estaban desfasadas —el
-- planificador estimaba 1.618 filas donde hay unas 2.500—, y con una política
-- cara eso lleva a elegir mal. `analyze` es barato y no bloquea lecturas.
-- -----------------------------------------------------------------------------

analyze public.od_saber_pro_results;
analyze public.od_saber_tyt_results;
analyze public.od_values;
analyze public.od_breakdown_values;
analyze public.od_map_values;

notify pgrst, 'reload schema';
