# UDrive · fase 1

Gestor de archivos y editor de datos para armar informes. Ruta `/admin/udrive` (subrutas `galeria`, `tabla/:id`, `grafica/:id`, `cruce/:id`). Migración `supabase/migrations/0187_udrive.sql`.

## Decisiones
- Carpetas y archivos con permisos por árbol (`drive_rol_carpeta/archivo`); compartir por correo (lector/editor). Escrituras solo por columnas con grant; borrar, papelera y compartir van por funciones `security definer`.
- Tabla, gráfica y cruce viven en `drive_archivos.contenido` (jsonb) y se identifican por id: la fase 2 los insertará como bloques.
- Editor de tablas = editor compartido `components/espacio` (TanStack Table + Virtual) con una prop nueva opcional `colorCelda` (mapa de calor) en `Editor` y `Hoja`.
- Gráficas con `@tanstack/charts`; paleta institucional fija (`lib/graficas.ts`).
- Bucket privado `udrive`, 100 MB; las fotos se comprimen a 2000 px antes de subir.

## Para las fases siguientes
Documento por bloques con numeración, índices y PDF; importar Word/PDF con Pilo; mapas OpenStreetMap; descargar gráfica como imagen.
