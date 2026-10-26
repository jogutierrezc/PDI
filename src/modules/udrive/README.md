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

## Pilo redactor: «Que Pilo lo redacte» (hecho)
En el panel «Bloque» de un párrafo, lista, cuadro destacado o nota (solo si se puede editar): `ui/documento/PanelPilo.tsx`. Acciones: redactar desde un pedido, mejorar, resumir, desarrollar más, más formal y corregir ortografía. Siempre es una **propuesta**: aparece aparte y entra al informe solo con «Reemplazar» o «Agregar debajo» (un bloque nuevo, con `acc.insertarConContenido`); «Descartar» la quita. Si el bloque cambió después de pedirla, no se puede reemplazar a ciegas.
- **Qué ve Pilo** (`datosPilo.contextoParaPilo`): solo las cifras vivas que el documento ya usa (clave y valor ya resuelto), sus fuentes (cómo se lee la cita), sus figuras, el capítulo donde va y el párrafo anterior. Nada más.
- **Qué no puede hacer** (se verifica en el servidor, `udrive.ts`, y otra vez en el navegador, `propuestaSegura`): usar una `[[clave]]`, `{{cita:id}}` o `{{ref:id}}` que el documento no tenga; escribir una cifra a mano (todo número debe estar ya en el texto, el pedido o el contexto); perder las marcas del texto original (salvo al resumir); agregar enlaces; usar títulos, viñetas, HTML o emojis; pasar de los topes del bloque (nota 600, destacado 500). Si no pasa, se reintenta una vez con el error y, si persiste, responde 422.
- **Sin huellas de IA**: el prompt aplica la guía «Signs of AI writing» (vocabulario inflado, «no solo… sino», gerundios de relleno, cierres de plantilla, atribuciones vagas, cortesías de chatbot) y la verificación rechaza las más claras.
- **Acceso y registro**: función `pilo-informes`, acción `udrive_redactar`; exige `drive_entra()` (rol + pantalla UDrive, migración 0187). Mismo proveedor que Informes y bitácora propia en `news_runs` (fuente «Pilo en UDrive»). No gasta el cupo de /pregunta.

## Importar Word y PDF (hecho)
«Informe desde Word o PDF» en el menú «Nuevo» del explorador, e «Importar Word o PDF» dentro de un informe (agrega los bloques al final). `ui/documento/ImportarInforme.tsx` → `lib/importar.ts`.
- **Todo en el navegador**: el archivo no se sube a Storage (hoy inestable). Word: `lib/importarDocx.ts` (fflate + DOMParser): títulos por estilo u nivel de esquema, listas con o sin número según `numbering.xml`, negrita, cursiva y enlaces ya en las marcas de `lib/texto.ts`, tablas e imágenes (estas quedan como bloque de imagen «pendiente», sin archivo). PDF: el lector de Pilo Enseñanza (`admin/pilo-ensenanza/ingest`): títulos por tamaño de letra o patrón («Capítulo 2», «1.2 …»), encabezados y pies repetidos fuera, y listas reagrupadas aquí. **Las tablas de un PDF no se reconocen** (quedan como texto); un PDF escaneado se rechaza.
- **Primero lo determinista, Pilo solo en lo ambiguo** (acción `udrive_estructurar`, tres tareas): `niveles` (si algún título de un PDF se dedujo solo por la letra: puede decir que una línea no es título), `limpiar` (palabras partidas, espacios; solo se acepta un texto con **las mismas letras y números** que el original) y `nombres` (título del informe y de cada tabla, sin cifras que no estén en la muestra). Cada ayuda es opcional: si falla, queda la lectura directa y se avisa.
- **Revisión antes de crear**: lista de los bloques con casilla, nivel editable de cada título (o pasarlo a párrafo) y «revisar nivel» en los dudosos. Se respetan los 2000 bloques y los 3 MB (`validarDocumento`); hasta 30 tablas por importación.
- **Tablas**: cada una se crea como tabla de UDrive en la misma carpeta (`tablaDesdeMatriz`, columnas tipadas) y el informe la usa por su id. El informe nuevo trae el índice de contenido si hay 3 títulos o más.

## Para desplegar la fase 3 (Pilo)
Sin migración nueva. Cambió la función `supabase/functions/pilo-informes/`: `udrive.ts` (nuevo), `index.ts` y `datos.ts` (parámetro opcional `fuente` en `bitacora`). Se despliega como las demás funciones (ver «servidor y funciones de Supabase»). Requiere que estén aplicadas 0187 y 0153.

## Importar Word y PDF, a fondo (fase 3)
El importador lee el archivo en el navegador (nada se sube todavía), arma un informe ordenado y deja revisarlo antes de crearlo. Código: `lib/importar.ts` (modelo y pasos comunes), `lib/importarDocx.ts` (Word), `lib/importarPdf.ts` (análisis del PDF, puro), `lib/importarPdfCarga.ts` (único que nombra pdfjs), `lib/importarEditar.ts` (operaciones de la revisión) y `ui/documento/ImportarInforme.tsx` + `subirFiguras.ts`.

**Qué extrae**
- **Word**: títulos por estilo u outline, listas con y sin número, tablas (celdas combinadas repartidas), imágenes de `word/media` en su posición del flujo, notas al pie (como «nota»), pies de figura por estilo `Caption`. La tabla de contenido (por estilo o campo) y una portada corta antes de ella se dejan fuera. EMF, WMF y otros formatos que el navegador no dibuja quedan como imagen pendiente con aviso.
- **PDF**: texto con posición, tamaño y negrita (la negrita sale de `commonObjs`). Orden de lectura con dos columnas (calle de espacio en blanco y títulos de ancho completo), líneas → párrafos (separación vertical y sangría; sangría francesa en referencias), palabras cortadas por guion, listas, títulos por tamaño, negrita y numeración. Fuera: encabezados y pies repetidos, números de página, logos repetidos, portada (de la que sale el título) e índices del propio informe.
- **Tablas del PDF**: (a) por rejilla de líneas y rectángulos (se leen los operadores de la página llevando la matriz `save/restore/transform`) y (b) por alineación de texto (ríos de espacio que cruzan las líneas; una línea sin primera celda y pegada a la anterior es continuación de celda). Un recuadro de una sola celda es un cuadro destacado. La cuadrícula de una gráfica no se toma por tabla.
- **Figuras del PDF**: imágenes incrustadas y regiones de dibujo vectorial denso (rejilla de 12 pt con componentes conexos); el texto de ejes y leyendas se queda con la figura. Cada una se recorta del render de su página a 2x y se guarda como PNG (JPEG si es una foto grande).
- **Pies y notas**: «Tabla 3. …» / «Gráfica 2. …» pasan a ser el título de la figura contigua (`asociarPies`, igual para Word y PDF) y «Nota. …» / «Fuente: …» su nota. La sección «Referencias» pasa a un bloque de referencias y cada entrada a una fuente APA (autores, año, título, origen) lo mejor que se pueda.

**Guardar las figuras**: se suben como imágenes a una carpeta nueva «Imágenes de <informe>» con el flujo de Subir archivo (reducción a 2000 px, sesión de la persona), con concurrencia 2 y 3 reintentos con espera. Si las tres primeras fallan sin un solo éxito se deja de intentar (Storage caído) y todas quedan como imagen pendiente; el resto del informe no se pierde.

**Revisar antes de crear**: lista virtualizada en orden de lectura con miniaturas, vista de tablas y título/nota editables; por elemento: incluir, cambiar de tipo, editar, unir con el anterior, partir en el cursor, subir/bajar, y pasar una tabla mal detectada a texto. Resumen de lo detectado y de lo descartado. «Reordenar con Pilo» reúne propuestas (niveles de título, palabras partidas, pies sueltos) que se aplican o no, con las mismas tareas de `pilo-informes` de antes: no hay cambios en la función edge.

**Límites**: 150 páginas de PDF (con aviso), 25 MB, 30 tablas y 80 figuras por importación, 2000 bloques. PDF escaneado (sin texto): se avisa, no hay OCR. Página girada: el orden puede salir alterado (aviso).

# Estilos de informe (0190)

Un **estilo** es un perfil de diseño con nombre (portada, texto, tablas y gráficas, cabecera y pie, página) que se aplica a cualquier informe sin tocar su contenido. Migración `supabase/migrations/0190_udrive_estilos.sql` (requiere 0187). Propuesta aprobada: `docs/udrive/propuesta-impresion.html`.

## Qué hay
- **Modelo** (`lib/estilo.ts`): `Estilo` (JSON versionado), cuatro estilos de fábrica en código (`f:institucional`, `f:academico`, `f:ejecutivo`, `f:clasico`), `normalizarEstilo` (que es también el guardarriel: acota cada valor y nunca lanza), `temaDe` (medidas en píxeles de la hoja: papel, márgenes, cabecera, alto de línea, columnas), `variablesCss` y `atributosEstilo` (lo que el estilo pone sobre `.ud-doc`) y `avisosDeEstilo` (combinaciones que se pueden hacer pero suelen salir mal).
- **Dónde vive un estilo propio**: un archivo de UDrive de tipo `estilo` (`drive_archivos.tipo`), con su JSON en `contenido`. Hereda carpetas, compartir por correo, permisos por árbol (`drive_rol_archivo`), papelera y mover; no hay tablas ni políticas nuevas. La migración solo amplía el `check` de `tipo` (lo busca por su definición, es idempotente) y acota el contenido a un objeto de hasta 200 KB. Las funciones de 0187 y 0188 reciben `'carpeta'` o `'archivo'` como tipo de elemento y la del documento solo actúa sobre `tipo = 'documento'`, así que ninguna lista las rompe.
- **Qué guarda el informe** (`lib/documento.ts`, `version` sigue en 1; campos opcionales): `estilo` (`{ id, v }`), `instantanea` (copia completa del estilo al aplicarlo), `ajustes` (solo lo que este informe cambia sobre su estilo), `papel` (Carta o A4), `cierre` (mensaje, hasta 3 responsables, créditos, contacto, frase y si lleva cierre y contraportada) y, en `portada`, `autor`, `afiliacion`, `fecha`, `nota` y `foto` (encuadre: `x`, `y`, `zoom`, `ajuste` cubrir o contener, `velo`). Lo que se imprime sale siempre de la instantánea más los ajustes (`estiloDelInforme`): el informe no cambia si el estilo cambia después, no se puede leer o está aprobado. Si el estilo propio tiene una versión nueva, «Documento» avisa y ofrece Actualizar.
- **Sin estilo = Clásico.** Un documento sin `estilo` ni `instantanea` se imprime con el estilo «Clásico UDrive», que es el CSS y las constantes de antes (Georgia 15 px, interlineado 22,5 px, márgenes 72/76 px, portada de siempre, marca diagonal roja). Las variantes nuevas solo se activan con `data-ud-*` que el Clásico no usa. Una pantalla vieja que reescriba el documento descartaría los campos nuevos: se despliega primero este código y después se usa.
- **Por defecto**: informes nuevos (`NuevoInforme`, importar Word o PDF) parten de `ESTILO_INFORME_NUEVO` (Institucional); los existentes, de `ESTILO_SIN_ELEGIR` (Clásico). Los dos están en constantes al inicio de `lib/estilo.ts`.
- **Logo de la Universidad obligatorio**: el modelo lo lleva en `true`, el editor no ofrece quitarlo y `normalizarEstilo` lo restituye. El monograma (3 a 4 caracteres) y el logo propio son opcionales.
- **Contraste**: el color de acento debe dar 4,5:1 con texto blanco; el editor no lo aplica si no cumple y ofrece oscurecerlo, y el normalizador lo oscurece solo si llega uno malo. Límites: cuerpo de 9 a 12 pt, interlineado 1,3 a 1,8, márgenes 14 a 30 mm, marca de agua de 5 a 15 % (aviso sobre 10 %).
- **Marca de agua libre**: texto (hasta 24 caracteres) o imagen de UDrive, horizontal, nunca en la portada; más «BORRADOR automático» mientras el informe no esté aprobado.
- **Fuentes**: Montserrat y Open Sans con el cargador del boletín (`boletin/fonts.ts`); Source Serif 4 con el mismo método (`salida/fuentes.ts`); Georgia es del sistema. El paginado espera a `document.fonts` antes de medir.

## Paginado y salida
- `lib/paginado.ts`: `paginar` acepta un alto por página (función) y un espacio ya usado en la primera hoja; `paginarColumnas` reparte el texto corrido en dos columnas tratando cada una como una página angosta (con las mismas reglas de viudas, huérfanas y títulos pegados). Las tablas, figuras, índices y capítulos de nivel 1 ocupan el ancho completo y cortan el tramo. La última hoja de un tramo no equilibra las columnas.
- `salida/PaginasPdf.tsx`: las constantes de antes (`LINEA`, `MARGEN_P`, `ALTO_CUERPO`) salen del tema. Cada **sección** (la orientación cambia con un bloque «Salto de página» de orientación horizontal) se mide y se reparte con sus propias medidas; las hojas horizontales usan la página con nombre `ud-horizontal`. Cabecera de dos niveles, sencilla o ninguna; folio al borde exterior, centrado o a la derecha; cierre y contraportada se suman al conteo.
- `salida/Portadas.tsx`: las cinco composiciones de Informes Institucionales (mismas clases `vi-*` de `informes/vista/vista.css`, mismos helpers de `informes/vista/perfil.ts`) con los campos de UDrive. En `informes/vista/EditorPortada.tsx` solo se exportó `Encuadre`, que se reutiliza para encuadrar la foto (arrastrar, flechas, zoom).
- `salida/imprimir.ts`: fija `@page` según el papel del informe (Carta o A4) y la página con nombre `ud-horizontal` al abrir la ventana de impresión.
- **Revisar antes de imprimir** (`lib/revision.ts`, `ui/estilos/Revision.tsx`): figuras sin título, bloques sin archivo, tablas más anchas que la hoja (se miden en el paginado), imágenes de más de 2,5 MB, fuentes sin citar o citas sin definir, cifras vivas que cambiaron y los avisos del estilo. «Bloquea» impide abrir la impresión o bajar el Word hasta corregirlo o dejarlo así hallazgo por hallazgo.

## Word con estilo
`salida/aWord.ts` lee el estilo: familias y tamaños, colores, márgenes, papel (Carta o A4), interlineado, alineación, encabezados de tabla, cebra, bordes y mapa de calor, destacados, títulos de figura arriba o abajo, numeración de capítulos, folio exterior (encabezados de páginas pares e impares), dos columnas (por tramos: texto en dos columnas, tablas y figuras a todo el ancho) y secciones horizontales. La **portada y la contraportada** van como imagen a página completa (`salida/paginaAImagen.ts`, con `html-to-image` sobre la hoja ya paginada, a doble resolución). Si el navegador no puede dibujarlas (una imagen sin permiso CORS, una fuente que no se pudo incrustar) la portada va como texto y se avisa; la contraportada se omite con aviso.
- Se conserva: letras y tamaños (si la computadora tiene la fuente instalada), acento, márgenes, columnas, secciones horizontales, cebra y bordes, mapa de calor, folio exterior, portada y contraportada como imagen, cierre como texto.
- Se simplifica: la cabecera de dos niveles pasa a una línea con filete; los destacados en caja a sombreado y filete.
- No se conserva: la marca de agua (el Word lleva «BORRADOR» en la cabecera como antes) y el dibujo de edificios.
- El Clásico exporta el mismo Word de antes.

## Pantallas
- **Explorador**: Nuevo → «Nuevo estilo de informe» (partir de uno de fábrica o propio, con nombre y carpeta); filtro «Estilos»; un estilo se abre en `/admin/udrive/estilo/:id`, se mueve, se comparte y se borra como cualquier archivo.
- **Editor de estilos** (`ui/estilos/EditorEstilo.tsx`, `PanelEstilo.tsx`): cinco grupos con «Más opciones» plegado y «Restablecer» por grupo; vista previa con un informe de muestra (datos de ejemplo) dibujado con el paginado real, en el papel del estilo, con portada, cierre y contraportada; vista de advertencias; se guarda solo. Un estilo de solo lectura se mira y se duplica.
- **Informe → Documento** (`ui/estilos/PanelesInforme.tsx`): estilo (cambiar, papel, ajustes de este informe, actualizar, guardar este aspecto como estilo propio), portada (textos, foto con encuadre, velo, cubrir o contener) y cierre y contraportada.
- La hoja continua del editor toma del estilo la letra, los colores y las variantes; el reparto exacto en páginas es el de la vista previa.

## Sin la migración
Los cuatro estilos de fábrica funcionan sin 0190. Guardar un estilo propio falla con «Falta aplicar la migración 0190 (estilos de informe)» (`datos.ts` → `errorDe`); la lista de «Mis estilos» sale vacía.

## Límites conocidos
- Dos columnas: el último tramo no equilibra las columnas y el texto en columnas se mide con un mínimo de espacio (160 px) para empezar en una hoja con otro contenido arriba.
- `@page` con nombre (hojas horizontales) lo respetan Chrome y Edge; Firefox y Safari hay que probarlos.
- Source Serif 4 se carga de Google Fonts como las fuentes del boletín; sin red se usa Georgia.


# Unidades de trabajo (0191)

Espacios con nombre, identidad y personas con papel, dentro de UDrive. Rutas: `/admin/udrive/unidades` (índice), `/unidades/nueva` (formulario), `/unidades/capacidad` (administración general), `/unidad/:id` (una unidad; `?s=archivos|personas|personalizar|espacio`). Acceso desde el riel del explorador («Unidades de trabajo»). Migración `supabase/migrations/0191_udrive_unidades.sql` (requiere 0057, 0187 y 0188). Propuesta de diseño aprobada: `docs/udrive/propuesta-unidades-de-trabajo.html`. Código en `unidades/`.

## Decisiones
- **Papeles**: Solo ver (lector), Editar, Crear (nuevo, `creador`) y Administra (propietario de la unidad). `drive_rango` pasa a cuatro niveles (propietario 4, creador 3, editor 2, lector 1); las comprobaciones de «propietario» de 0187 (compartir, borrar para siempre) pasan de >= 3 a >= 4. `lib/permisos.ts` es el espejo (`puedeCrearEn`, `puedeMoverEn`, `puedeBorrarEn`).
- **Dentro de una unidad el rango sale solo del papel** (`drive_unidad_miembros`); la autoría de una subcarpeta no da propiedad. Fuera de unidades todo sigue como en 0187. `drive_carpetas.unidad_id` y `drive_archivos.unidad_id` las pone un disparador (la unidad del padre); el cliente no las manda.
- Crear y subir pide Crear; mover pide Crear y no cruza el límite de la unidad (un disparador lo impide); papelera: Administra, o Crear sobre lo propio; borrar para siempre y vaciar la papelera: Administra. La carpeta raíz de la unidad no se mueve, renombra ni borra. No se comparte por correo dentro de una unidad.
- **Sin unidad sin dueño**: la creación exige un Administra (quien crea); un disparador impide degradar a la última persona que administra, `drive_unidad_miembro_quitar` impide quitarla y `drive_unidad_transferir` pasa la administración sin dejar el cargo vacío. Si la única persona que administra pierde su cuenta, la unidad queda `sin_admin` y la administración general la ve señalada.
- **Administración general** = `app_role = 'admin'` (`has_role_at_least('admin')`); Planeación no tiene acceso especial. Ve y edita todas las unidades. Entrar a una unidad ajena escribe un evento `ingreso_admin` (una vez cada 30 minutos). `drive_unidad_eventos` solo admite inserts (disparador).
- **Quién crea**: cualquiera con acceso a UDrive (`drive_entra()`), sin aprobación.
- **Vínculo con la estructura (`unit_id`)**: opcional y de una vía. El formulario puede traer a la gente de una unidad de la estructura con papel sugerido (Gestor administra, Contribuyente crea, Consulta ve); no se sincroniza.
- **Personas externas** (correo fuera de `drive_config.dominio_institucional`, por defecto udes.edu.co): vencimiento obligatorio, máximo 730 días, no pueden administrar. Pasada la fecha, `drive_unidad_rol` deja de darles papel: no depende del cliente. La lista muestra el vencimiento, avisa 14 días antes (a quien administra, en el inicio y en Personas) y deja renovarlo hasta el tope. Deben tener cuenta en la intranet.
- **Cuota**: 5 GB por unidad (`drive_config.cuota_unidad_bytes`, editable) comprobada al subir en el disparador de `drive_archivos` (cuenta también la papelera); error `drive_unidad_cuota`. Barra con aviso al 80 % y al 100 %. Quien administra pide ampliación con un motivo (`drive_unidad_pedir_ampliacion`, una abierta por unidad); la administración general aprueba o rechaza, o fija la cuota (`drive_unidad_cuota_fijar`). La vista de capacidad muestra los 512 GB (`capacidad_servidor_bytes`), lo comprometido (suma de cuotas de unidades activas) y lo usado; no deja comprometer más que la capacidad al fijar o aprobar.
- **Archivar**: la unidad queda de solo lectura (rango máximo 1 para todos) y sale del índice principal; se restaura desde Personas.
- **Registro** (`drive_unidad_eventos`): creación, personas, papeles, vencimientos, identidad, cuota, ampliaciones, archivado, vaciado de papelera e ingresos de la administración general.

## Storage
- Bucket `udrive`: los archivos de una unidad van en `unidades/<unidad>/<archivo>/<nombre>`. Suben y reemplazan quienes tienen Crear; borra quien administra, o quien crea si el objeto ya no tiene fila.
- Bucket nuevo `udrive-unidades` (privado, 5 MB): imagen de cabecera, `<unidad>/<archivo>`; la ven quienes tienen papel y la cambia quien administra. La imagen se sube después de crear la unidad (antes no existe su carpeta con permisos). Se comprime con `ui/navegador.ts` y se encuadra con `Encuadre` de `informes/vista/EditorPortada.tsx`.

## Pantallas
- Formulario en cuatro pasos (Datos, Identidad, Personas, Revisar) con la tarjeta en vivo; valores por defecto del nombre (monograma, acento, composición, icono); contraste de acento ≥ 4,5:1 comprobado en la pantalla y en la base.
- Índice con búsqueda, filtros (todas, mías, compartidas conmigo, archivadas; sin ser miembro y sin quien las administre para administración general) y lista alterna. Inicio de la unidad con bloques en el orden elegido; Personas; Personalizar (color, composición, imagen, orden y anclas, con vista previa); Espacio.
- El explorador (`ui/Explorador.tsx`) acepta `unidad`: muestra solo la unidad y, sin ella, oculta todo lo que vive en unidades de «Mis archivos» (se calcula con las carpetas raíz que devuelve `drive_unidades_listar`).
- Movimiento (GSAP, `unidades/movimiento.ts`): fichas 140/220/380 ms, escalón 45 ms (máx. 8), curva power4.out; con movimiento reducido solo hay fundidos de 120 ms. Especificación completa en la propuesta.

## Sin la migración
Las lecturas de unidades fallan con «Falta aplicar la migración 0191 (unidades de trabajo de UDrive)» (`FaltaMigracion`); el resto de UDrive funciona igual y el riel del explorador no muestra «Unidades de trabajo».

## Pendientes y riesgos
- No hay «convertir una carpeta en unidad» ni mover entre una unidad y «Mis archivos» (se descarga y se sube).
- El aviso de 14 días es dentro de la aplicación; no se envía correo.
- `drive_rol_carpeta` hace una consulta más por llamada (busca la unidad de la carpeta): medirlo con un árbol grande.
- La función `pilo-informes` usa `drive_entra`; no conoce las unidades.
