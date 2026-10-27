-- =============================================================================
-- PDI · 0205 · Subir archivos dentro de una unidad de trabajo de UDrive
--
-- La restricción drive_archivos_ruta_ok (0187) solo aceptaba la ruta de Storage
-- «<persona>/<archivo>/<nombre>». La 0191 manda los archivos de una unidad a
-- «unidades/<unidad>/<archivo>/<nombre>» y nunca ajustó la restricción, así que
-- toda subida a una unidad fallaba con:
--   new row for relation "drive_archivos" violates check constraint "drive_archivos_ruta_ok"
--
-- Ahora se aceptan las dos formas, y cada una sigue atada a quien la sube:
--   · personal: el prefijo es creada_por/id, como siempre.
--   · de unidad: el prefijo es unidades/<unidad_id>/<id>; la unidad la pone el
--     disparador de 0191 desde la carpeta, el cliente no la manda, así que la
--     ruta no puede apuntar a la unidad de otro.
-- Las filas que ya existen cumplen la forma personal, de modo que la nueva
-- restricción las acepta todas. Idempotente.
-- =============================================================================

alter table public.drive_archivos drop constraint if exists drive_archivos_ruta_ok;

alter table public.drive_archivos
  add constraint drive_archivos_ruta_ok check (
    ruta_storage is null
    or (
      ruta_storage like creada_por::text || '/' || id::text || '/%'
      and ruta_storage ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,150}$'
    )
    or (
      unidad_id is not null
      and ruta_storage like 'unidades/' || unidad_id::text || '/' || id::text || '/%'
      and ruta_storage ~ '^unidades/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,150}$'
    )
  );
