-- =============================================================================
-- UDrive · estilos de informe (0190).
--
-- Un estilo de informe (portada, texto, tablas, cabecera y pie, página) es un
-- archivo más de UDrive: `drive_archivos.tipo = 'estilo'`, con su JSON en
-- `contenido`. Así hereda lo que ya funciona sin tablas ni políticas nuevas:
--   · carpetas (un estilo vive donde la persona lo guarde y se mueve igual);
--   · compartir por correo con rol de lector o editor (drive_compartir);
--   · permisos por árbol (drive_rol_archivo, drive_rol_carpeta, 0187);
--   · papelera y borrado definitivo (drive_a_papelera, drive_restaurar...).
-- Las funciones de 0187 y 0188 reciben 'carpeta' o 'archivo' como tipo de
-- elemento, no el tipo de archivo, así que ninguna lista las rompe; la del
-- documento (0188) solo actúa sobre tipo = 'documento'.
--
-- Qué hace esta migración:
--   1. Amplía el check de `tipo` con 'estilo' (idempotente: busca el check por
--      lo que dice y no por su nombre).
--   2. Acota el contenido de un estilo: un objeto de hasta 200 KB. El cliente
--      valida y normaliza cada campo al leerlo; la base solo cuida la forma y
--      el peso. Las imágenes (foto de portada, logo propio, marca de agua) no
--      van dentro: son archivos de UDrive que el estilo nombra por id.
--
-- Los cuatro estilos de fábrica (Institucional, Académico, Ejecutivo y Clásico)
-- viven en el código, no en la base. Mientras esta migración no se aplique,
-- UDrive funciona con ellos y avisa que guardar estilos propios la requiere.
-- Requiere 0187. Idempotente.
-- =============================================================================

do $$
declare
  c record;
begin
  -- El check inline de 0187 se llama drive_archivos_tipo_check, pero se busca por su definición.
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.drive_archivos'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%array%archivo%tabla%grafica%'
       and conname <> 'drive_archivos_tipo_con_estilo'
  loop
    execute format('alter table public.drive_archivos drop constraint %I', c.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.drive_archivos'::regclass and conname = 'drive_archivos_tipo_con_estilo'
  ) then
    alter table public.drive_archivos
      add constraint drive_archivos_tipo_con_estilo
      check (tipo in ('archivo', 'tabla', 'grafica', 'cruce', 'documento', 'estilo'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.drive_archivos'::regclass and conname = 'drive_archivos_estilo_forma'
  ) then
    alter table public.drive_archivos
      add constraint drive_archivos_estilo_forma
      check (
        tipo <> 'estilo'
        or (contenido is not null
            and jsonb_typeof(contenido) = 'object'
            and octet_length(contenido::text) <= 200000)
      ) not valid;
  end if;
end $$;

comment on constraint drive_archivos_tipo_con_estilo on public.drive_archivos is
  'Tipos de archivo de UDrive. «estilo» (0190) guarda un estilo de informe en `contenido`.';

notify pgrst, 'reload schema';
