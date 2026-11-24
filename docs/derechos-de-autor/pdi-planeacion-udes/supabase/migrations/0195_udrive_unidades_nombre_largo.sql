-- =============================================================================
-- PDI · 0195 · Nombres largos en las unidades de trabajo de UDrive
--
-- La 0191 limitaba el nombre de una unidad a 60 caracteres. La carpeta raíz de
-- la unidad toma ese nombre y las carpetas de UDrive admiten hasta 120, así que
-- el tope sube a 120. Idempotente.
-- =============================================================================

alter table public.drive_unidades drop constraint if exists drive_unidades_nombre_ok;
alter table public.drive_unidades
  add constraint drive_unidades_nombre_ok
  check (char_length(btrim(nombre)) between 3 and 120 and nombre !~ '[/\\]' and nombre !~ '[[:cntrl:]]');
