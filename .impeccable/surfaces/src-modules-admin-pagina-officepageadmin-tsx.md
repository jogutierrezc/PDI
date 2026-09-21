---
version: 1
slug: "src-modules-admin-pagina-officepageadmin-tsx"
primary_target: "src/modules/admin/pagina/OfficePageAdmin.tsx"
related_targets: ["src/modules/admin/components/AdminShell.tsx","src/modules/planeacion/PlaneacionHome.tsx"]
---

# Intranet · Página de la oficina

Scope: `/admin/pagina/:estacion?` — el editor de la portada de Planeación (`/`) y de la página del equipo (`/equipo`). Incluye el grupo «Portal de Planeación» del menú lateral y el bucket `oficina` de Storage.
Visitor mode: Operate. Planeación (capacidad `planeacion` y `admin`) escribe; consulta lee.

Audience and job: la oficina redacta su propia página sin tocar código ni esperar un despliegue: titular y entradilla de la portada, la galería de fotos de la oficina, el equipo (foto, nombre, cargo, área, bio, formación, dedicación, enlaces), las áreas, los accesos y el contacto del pie. Frecuencia: ráfagas cortas —una foto nueva, una persona que entra o sale, un titular de campaña—, no carga masiva.
Task and states: borrador frente a publicado (el portal solo ve lo publicado); sin publicar nunca (el portal cae al contenido de `content.ts` y se avisa); base sin la migración 0050; foto que pesa de más o no es imagen; persona sin nombre (no se publica); galería vacía (la banda no sale); lectura sin permiso de edición.
Constraints: mismo sistema visual y mismas clases que las estaciones de UDES en Cifras (`oda-*`); las fotos viven en el bucket `oficina` de Storage, no en la base; ninguna cifra de dinero; nada de ámbar de señal ni Barlow Condensed fuera de UDES en Cifras; la vista previa usa los componentes públicos de verdad.

Memorable moment: la vista previa no es un esquema, es la banda real de la portada dibujada a escala con el mismo componente que ve el público; y publicar enumera, línea por línea, qué cambió desde la última publicación.

## Direction contract

THESIS: La portada se edita sobre la portada. Las cuatro bandas de la página pública —titular, galería, equipo, la oficina— son las cuatro estaciones del editor, y cada una trabaja al lado de su banda real dibujada a escala; la quinta compara borrador y publicado antes de publicar. Rechaza el formulario largo de campos sueltos («Título», «Subtítulo 1», «Imagen 3») donde nadie sabe dónde caerá lo que escribe.

OWN-WORLD: la intranet existente (`oda-*`, `admin-*`): superficies blancas sobre gris azulado, azul institucional solo para acción, selección y foco; verde de estado para lo completo, ámbar de estado para lo pendiente, rojo solo en confirmación destructiva, siempre con glifo y texto. Manrope en toda la interfaz, cifras en numerales tabulares. La vista previa se dibuja con las clases públicas `pl-*` dentro de un marco propio a escala, para que no se confunda con la interfaz que la rodea.

STORY: Quien edita entra, lee en la barra qué banda está incompleta y cuántos cambios lleva sin publicar, trabaja una banda con su vista previa al lado, sube una foto que se guarda con su texto alternativo obligatorio, ordena el equipo con las flechas, y en Publicación lee qué cambió desde la última publicación antes de confirmar.

FIRST VIEWPORT: menú lateral agrupado; ruta «Portal de Planeación › Página de la oficina» y el título de la estación; debajo, la barra de cinco estaciones con nombre, cifra y detalle, la activa resaltada y las completas con visto. Área de trabajo en dos columnas desde 1280px: paneles `oda-panel` a la izquierda, vista previa fiel de la banda a la derecha; por debajo de ese ancho la vista previa se pliega en un desplegable —«Ver cómo quedará»— colocado bajo la barra de estaciones y sobre los paneles, no al final de la columna. Acción principal arriba a la derecha de la cabecera: «Publicar» con el número de cambios pendientes; a su lado, el estado de guardado.

FORM: asistente guiado por bandas de página, heredero de las estaciones del periodo de UDES en Cifras; segundo de la lista propia. Sin tirada de concepto: extensión precisa dentro de un mundo asentado, donde la composición ya la fija `AdminShell` y el patrón de estaciones.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
