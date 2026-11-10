-- =============================================================================
-- PDI · 0270 · UDrive · el tipo de archivo «tablero»
--
-- Un tablero del Warehouse es un archivo más de UDrive: `drive_archivos.tipo = 'tablero'`, con su
-- definición en `contenido` (fuentes, reglas de reconstrucción aprobadas, medidas, páginas y
-- visuales; ver src/modules/warehouse/modelo). NO guarda datos: se leen del Warehouse cada vez
-- con wh_explorar y compañía (0269), así que quien abre el tablero sin acceso al Warehouse no ve
-- cifras. Hereda carpetas, compartir por correo, unidades de trabajo, permisos por árbol,
-- papelera y mover, como los estilos de informe (0190). No hay tablas ni políticas nuevas.
--
-- Esta migración solo amplía el `check` de `tipo` con 'tablero' (lo busca por su definición, como
-- 0190) y acota el contenido a un objeto de hasta 1 MB. Requiere 0187 y 0190. Idempotente.
-- =============================================================================

do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.drive_archivos'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%array%archivo%tabla%grafica%'
       and conname <> 'drive_archivos_tipo_con_tablero'
  loop
    execute format('alter table public.drive_archivos drop constraint %I', c.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.drive_archivos'::regclass and conname = 'drive_archivos_tipo_con_tablero'
  ) then
    alter table public.drive_archivos
      add constraint drive_archivos_tipo_con_tablero
      check (tipo in ('archivo', 'tabla', 'grafica', 'cruce', 'documento', 'estilo', 'tablero'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.drive_archivos'::regclass and conname = 'drive_archivos_tablero_forma'
  ) then
    alter table public.drive_archivos
      add constraint drive_archivos_tablero_forma
      check (
        tipo <> 'tablero'
        or (contenido is not null
            and jsonb_typeof(contenido) = 'object'
            and octet_length(contenido::text) <= 1000000)
      ) not valid;
  end if;
end $$;

comment on constraint drive_archivos_tipo_con_tablero on public.drive_archivos is
  'Tipos de archivo de UDrive. «tablero» (0270) guarda la definición de un tablero del Warehouse en `contenido`.';

notify pgrst, 'reload schema';
