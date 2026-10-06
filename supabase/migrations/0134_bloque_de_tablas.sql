-- =============================================================================
-- PDI · 0134 · El tipo «tablas_personalizadas» en el enum de bloques
--
-- Una tabla personalizada es un conjunto libre (0033) con su vista de tabla, y
-- hasta ahora entraba a la ficha con un bloque «libre» propio: una tabla, un
-- bloque. Para agruparlas —unas bajo un separador y otras bajo otro— hace falta
-- un bloque que reúna varias, como el de desgloses, el de rankings (0030) y el
-- medallero (0056):
--
--   · sin conjunto (`ref_id` vacío) y con su `slot`, que distingue un bloque
--     de tablas de otro (0029);
--   · `settings.tablas` guarda las claves de las tablas que muestra. Sin
--     elección, el primer bloque muestra las que ningún otro eligió y que no
--     tienen ya su bloque «libre» a la vista; los siguientes, nada.
--
-- No se migran datos: los bloques «libre» que ya existen siguen funcionando.
-- Una tabla que un bloque de tablas elige sale ahí y su bloque «libre» deja de
-- pintarla, para que no se repita.
--
-- `od_report_blocks.kind` es el enum `od_block_kind`: sin este valor, añadir el
-- bloque desde la intranet falla con «invalid input value for enum» (ver 0054).
-- `add value if not exists` es idempotente y no reescribe la tabla. Va en su
-- propia sentencia y no se usa en esta misma migración, que es la condición
-- para que Postgres lo acepte dentro de una transacción.
--
-- Requiere 0019 (el enum), 0029 (el `slot`) y 0033 (conjuntos libres).
-- =============================================================================

alter type public.od_block_kind add value if not exists 'tablas_personalizadas';

notify pgrst, 'reload schema';
