---
version: 1
slug: "src-modules-documentos-documentportal-tsx"
primary_target: "src/modules/documentos/DocumentPortal.tsx"
related_targets: ["src/modules/documentos/CollectionPage.tsx","src/modules/admin/documentos/DocumentsAdmin.tsx","src/components/layout/SiteHeader.tsx"]
---

# Portal Documentos (`/documentos`) y su editor

Scope: `/documentos` (la estantería), `/documentos/:slug/:section?` (el tomo abierto y sus divisorias) y `/admin/documentos/:slug?` (el editor, dentro del grupo «Portal de Planeación» de la intranet). Incluye la referencia «Documentos» de la barra unificada, que hasta ahora apuntaba a un ancla del PDI y no llevaba a ningún sitio propio.
Visitor mode: Operate. Quien llega busca un documento concreto —un acta, un reglamento vigente, el informe de un año— y su éxito es tenerlo abierto o descargado en segundos. Planeación (capacidad `planeacion`) escribe; consulta lee.

Audience and job: público general, entes de acreditación, funcionarios y egresados que necesitan el soporte oficial de algo; y la oficina, que carga colecciones, sube archivos o pega enlaces y decide qué se publica. Frecuencia: consulta puntual y por búsqueda, no navegación recreativa; carga en tandas cuando se cierra un periodo o se aprueba una norma.
Task and states: colección en borrador o publicada; sección en borrador o publicada (y escondida entera si su colección está en borrador); documento suelto en la colección o dentro de una sección; documento en borrador o publicado; documento que es archivo subido frente a documento que es enlace externo; documento con versiones anteriores y documento sin ellas; colección vacía; año sin documentos dentro de una colección; base sin la migración 0051; lectura sin permiso de edición.
Constraints: un solo nivel de secciones, y lo impide la base con un disparador, no la interfaz. Mundo visual de Planeación (`pl-*`): azul UDES, Fraunces en títulos, Manrope en el resto. Ni ámbar de señal ni Barlow Condensed, que pertenecen a UDES en Cifras. Los archivos viven en el bucket `documentos` de Storage, no en la base. No se mezcla con el repositorio del PDI (`/implementacion#repositorio`), que conserva su tabla `documents` y su sección intacta.

Memorable moment: el lomo. Cada colección dice de qué años es y cuántos documentos guarda —los suyos y los de sus divisorias— antes de que nadie la abra, y esa misma cifra es la que el editor muestra mientras se carga.

## Direction contract

THESIS: Cada colección es un tomo encuadernado. La fotografía es su tapa, una banda de tela lleva el nombre y el subtítulo, y el lomo —visible a la izquierda, escrito en vertical— dice el rango de años y cuántos documentos guarda, secciones incluidas. Entrar en una colección es abrir el tomo: tapa grande a la izquierda, índice numerado a la derecha. Las secciones son las divisorias del tomo: se recorren con su pestaña o se elige una y el índice se queda en ella, y lo que no está en ninguna va primero, sin pestaña. Rechaza la rejilla de tarjetas iguales donde la imagen es decoración y hay que abrir cada una para saber si tiene lo que buscas.

OWN-WORLD: el portal de Planeación (`pl-*`): marino de marca en las franjas, azul institucional solo para acción y foco, papel azulado de página, superficie blanca para el tomo. Fraunces en el título del tomo y del documento, Manrope en todo lo demás, cifras en numerales tabulares. El lomo es marino con tinta blanca; la banda de tela es superficie con un filete superior. Sin ámbar de señal y sin rotulación condensada: eso vive en UDES en Cifras.

STORY: Quien llega ve la estantería completa y lee en los lomos qué años cubre cada tomo; busca por texto —que también entra en los nombres de las divisorias— o acota por año, y entonces los tomos sin nada de ese año se apagan en su sitio en lugar de desaparecer; abre uno, elige una divisoria o las recorre todas, sigue el índice agrupado por año, ve cuál es la versión vigente y, si le hace falta, despliega las anteriores desde su pliegue; descarga el archivo o sale al enlace, sabiendo antes de pulsar de qué tipo es y cuánto pesa.

FIRST VIEWPORT: franja marina corta con el título «Repositorio documental», una línea de qué contiene y el buscador del repositorio. Debajo, sobre papel azulado, la fila de filtros por año y la rejilla de tomos: tres por fila desde 1100px, dos en tableta, uno en el móvil. Cada tomo es lomo + tapa fotográfica + banda con título, subtítulo y conteo. La acción principal es el buscador; no hay ninguna llamada a la acción compitiendo con él.

FORM: la estantería de tomos, séptimo y último de mi lista ordenada por resonancia; lo repartió la tirada. Seed 52d93fae, `--scope surface --mode operate`, índices repartidos 7, 6, 3 con el 7 al frente. Construcción dirigida por código: esta sesión no tiene generación de imágenes, así que las tres propuestas se sirvieron como esquemas y la ambición vive en este bloque y en la interacción firmada —el lomo que se lee sin abrir, y las versiones que se pliegan bajo la vigente—.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
