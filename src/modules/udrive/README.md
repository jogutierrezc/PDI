# UDrive · fase 1

Gestor de archivos y editor de datos para armar informes. Ruta `/admin/udrive` (subrutas `galeria`, `tabla/:id`, `grafica/:id`, `cruce/:id`). Migración `supabase/migrations/0187_udrive.sql`.

## Decisiones
- Carpetas y archivos con permisos por árbol (`drive_rol_carpeta/archivo`); compartir por correo (lector/editor). Escrituras solo por columnas con grant; borrar, papelera y compartir van por funciones `security definer`.
- Tabla, gráfica y cruce viven en `drive_archivos.contenido` (jsonb) y se identifican por id: la fase 2 los insertará como bloques.
- Editor de tablas = editor compartido `components/espacio` (TanStack Table + Virtual) con una prop nueva opcional `colorCelda` (mapa de calor) en `Editor` y `Hoja`.
- Gráficas con `@tanstack/charts`; paleta institucional fija (`lib/graficas.ts`).
- Bucket privado `udrive`, 100 MB; las fotos se comprimen a 2000 px antes de subir.

# UDrive · fase 2: el informe por bloques

Ruta `/admin/udrive/documento/:id`. Migración `supabase/migrations/0188_udrive_documentos.sql` (requiere 0187). «Nuevo» → «Nuevo informe» en el explorador, y «Usar en un informe» en los editores de tabla y de gráfica.

## Qué hay
- **Modelo** (`lib/documento.ts`): JSON versionado en `drive_archivos.contenido` (`{ version: 1, plantilla, portada, indices, fuentes, bloques }`). Bloques: capítulo (1–3), párrafo, lista, tabla, gráfica, imagen, destacado, nota, salto de página y referencias. `normalizarDocumento` lee cualquier JSON y descarta o corrige lo que no sirve; `validarDocumento` revisa tamaño (3 MB) y cantidad de bloques (2000) antes de guardar.
- **Texto** (`lib/texto.ts`): cadena con marcas, no HTML: `**negrita**`, `*cursiva*`, `[texto](url)`, `[[clave]]` (cifra viva), `{{cita:id}}` (APA) y `{{ref:bloque}}` (referencia cruzada).
- **Numeración e índices** (`lib/numeracion.ts`): «Ilustración N», «Tabla N» y «Gráfica N» se numeran solas; las referencias cruzadas se resuelven a esos números. Contenido, ilustraciones, tablas y gráficas se generan de los títulos y pies.
- **Paginado** (`lib/paginado.ts`, `salida/PaginasPdf.tsx`): de dos pasadas. La primera dibuja cada unidad fuera de pantalla, la mide con las fuentes y las imágenes ya cargadas y la reparte en páginas Carta; la segunda imprime los índices con esos números. Una figura con su pie nunca se parte; un párrafo se parte por líneas (mínimo dos arriba y dos abajo); una tabla se parte por filas, repite el encabezado y lleva la nota al final; un título no queda solo al final de una página.
- **Plantillas** (`plantillas/`): «Lineamientos estratégicos» y «En blanco».
- **Cifras vivas**: reutiliza `informes/tokens.ts` y `informes/cifras-vivas.ts`. El valor sale de `drive_cifras_vivas` (el mismo cálculo `informe_valor_od` de los informes, con el catálogo `informe_fuentes`); el editor avisa si una cifra cambió desde que se revisó, y al aprobar se congela en `contenido.congeladas`.
- **Versiones y estado**: `drive_versiones` guarda el contenido y la instantánea de las tablas y gráficas usadas; se puede ver una versión con los datos de entonces, compararla y restaurarla. Borrador / En revisión / Aprobado con quién y cuándo. Un aprobado no cambia su contenido hasta volver a borrador (lo hace cumplir un disparador, no el cliente).
- **Turnos**: `bloqueado_por` / `bloqueado_hasta` en `drive_archivos`; el turno dura 3 minutos y se renueva cada uno. Otra persona lo ve en solo lectura, puede pedir el turno y quien lo tiene lo cede. Tomar o renovar el turno no mueve `updated_at`.
- **Comentarios** por bloque (`drive_comentarios`), sin menciones ni correos.

## Decisiones
- **Motor del PDF: la hoja de impresión del navegador** (`@page` Carta, márgenes en cero, `print-color-adjust: exact`), igual que el boletín, que abre `window.print()` desde `BulletinViewer`. Ni el boletín ni Informes usan una librería de PDF (el boletín maqueta con DOM y deja que el navegador lo convierta), así que no hay un motor que reutilizar aparte de esa idea. Es la vía que deja texto y gráficas SVG como vectores, conserva los enlaces del índice y no añade dependencias. Costo: el PDF lo genera el diálogo «Guardar como PDF» del navegador, no se descarga solo.
- **Fuentes del PDF**: la sans del portal (Open Sans, ya cargada por `index.html`) para títulos y la serif del sistema (Georgia / Times) para el cuerpo; el proyecto no tiene ninguna serif propia ni se descarga nada en tiempo de ejecución.
- **Editor de texto: `contentEditable` controlado**, sin TipTap ni ProseMirror (cero dependencias nuevas). El formato pedido es mínimo y el modelo ya es una cadena con marcas; el navegador aplica negrita y cursiva (`execCommand`), se lee el DOM al escribir y solo se reescribe cuando el valor cambia desde fuera (deshacer, restaurar). Lo pegado entra como texto plano y todo lo que se pinta pasa por React o por un `aHtml` que escapa.
- **Una sola hoja de dibujo**: el editor y el PDF usan las mismas piezas (`salida/Piezas.tsx`) y las mismas clases (`ud-pdf-`); el editor las escala con `transform`, así lo que se ve es lo que sale. Las tablas y gráficas se leen de UDrive con la misma caché de la fase 1: un cambio en la tabla se ve en el documento.
- Los números de página del editor son estimados (hoja continua); los del índice son los del paginado de dos pasadas. La vista previa avisa «Los números de página se calculan al exportar» si al medir faltaban fuentes o imágenes.

## Para la fase 3
Importar Word/PDF con Pilo, mapas OpenStreetMap, exportar a Word y Pilo redactor (los hooks están: «Que Pilo lo redacte» en el diseño aprobado).

# UDrive · fase 3 (en construcción)

## Exportar a Word (hecho)
«Exportar Word» en el editor y en la vista previa. `salida/aWord.ts` arma un .docx con la librería `docx` (se carga solo al exportar) a partir de la misma `EntradaPdf` que el PDF: cifras, citas APA, numeración de figuras y datos de tablas y gráficas. Títulos 1–3 reales (el contenido es un campo de Word que se rellena al abrir), tablas de Word con mapa de calor, listas con numeración, fuentes APA con sangría francesa, encabezado con «BORRADOR» y número de página. Las gráficas salen como PNG (`salida/graficaAImagen.ts`: se dibuja el SVG fuera de pantalla, se copian los estilos calculados y se pasa por un canvas al doble de resolución). Los índices de ilustraciones, tablas y gráficas van sin número de página.

## Bloque «mapa» (hecho)
Insertar → «Mapa». Un mapa de OpenStreetMap con título, nota, texto alternativo, ancho y marcadores con rótulo; se numera como «Ilustración» (entra en ese índice si `enIndice`). Guarda en el JSON del documento solo centro (`lat`, `lng`), `zoom` y `marcadores` (hasta 50): no hay archivo ni tabla de por medio.
- **Dibujo** (`lib/mapa.ts`, `salida/MapaOsm.tsx`): sin librería ni clave. Teselas estándar de `tile.openstreetmap.org` como `<img crossOrigin>` en una rejilla de porcentajes sobre un lienzo lógico de 640 × 360 (16:9) y marcadores encima; el ancho del bloque solo lo escala (los textos van en `cqw`). El paginado espera esas imágenes como cualquier otra. La atribución «© colaboradores de OpenStreetMap» va siempre visible. Solo se piden las teselas que se ven, zoom 2–18.
- **Word** (`salida/mapaAImagen.ts`): vuelve a cargar las mismas teselas (con CORS) en un canvas al doble de resolución, dibuja marcadores y atribución y lo mete como PNG. Si no carga ninguna tesela, el Word lleva un aviso en lugar del mapa.
- **Editor** (`ui/documento/PanelMapa.tsx`): buscar un lugar con Nominatim (una consulta al pulsar «Buscar», nunca al escribir; hasta 5 resultados con «Centrar aquí» / «Centrar y marcar»), clic en la vista para centrar, zoom con botones y deslizador, marcadores con rótulo. No hay arrastre del mapa.
- Un mapa nuevo empieza en Bucaramanga, zoom 13.
