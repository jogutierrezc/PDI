-- =============================================================================
-- PDI · 0054 · El tipo «imagenes» en el enum de bloques
--
-- La 0053 creó el bucket de las fotografías y dio por hecho que `od_blocks.kind`
-- admitía cualquier texto. No es así: es el enum `od_block_kind`, y añadir el
-- bloque desde la intranet fallaba con
--
--   invalid input value for enum od_block_kind: "imagenes"
--
-- Cada tipo de bloque ha ido añadiendo su valor en su propia migración —
-- «tabla» en la 0022, «separador» en la 0029, «rankings» en la 0030, «libre»
-- en la 0033, «modelo» en la 0046—, y a este le faltaba la suya.
--
-- `add value if not exists` es idempotente y no reescribe la tabla: los valores
-- de un enum solo se añaden al final. Va en su propia sentencia y no se usa en
-- esta misma migración, que es la condición para que Postgres lo acepte dentro
-- de una transacción.
--
-- Requiere 0019 (el enum) y 0053 (el bucket «informes»).
-- =============================================================================

alter type public.od_block_kind add value if not exists 'imagenes';

notify pgrst, 'reload schema';
