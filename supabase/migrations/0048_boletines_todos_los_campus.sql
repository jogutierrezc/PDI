-- =============================================================================
-- PDI · 0048 · Boletines: todos los campus
--
-- Los boletines global, Poblacional e Investigación se crearon cuando el
-- periodo 2020-2025 solo tenía registrado Bucaramanga, y guardaron ese campus
-- en su plantilla. Desde 0043 el periodo cubre los tres campus, pero el PDF
-- seguía filtrado a Bucaramanga (661 estudiantes de grupos especiales en vez
-- de 2.354), así que no coincidía con el portal, que muestra todos.
--
-- Pasa a «todos los campus» solo las plantillas que tienen Bucaramanga; el
-- resto de la plantilla queda igual. Un boletín publicado cambia en el portal
-- en cuanto se aplica.
--
-- Requiere 0027 y 0043. Idempotente.
-- =============================================================================

update public.od_bulletins
set settings = jsonb_set(settings, '{campus}', '"todas"'::jsonb)
where settings ->> 'campus' = 'bucaramanga';
