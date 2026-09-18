---
version: 1
slug: "src-modules-datos-abiertos-opendataportal-tsx"
primary_target: "src/modules/datos-abiertos/OpenDataPortal.tsx"
related_targets: ["src/modules/datos-abiertos/OpenDataReport.tsx"]
---

# Datos Abiertos · UDES en Cifras

Scope: `/datos-abiertos` (portada del portal estadístico) y `/datos-abiertos/:informe` (ficha por informe). Portal aparte dentro del mismo código: cabecera, marca y pie propios, sin la navegación del PDI.
Visitor mode: Persuade en la portada (entender qué es y abrir un informe en segundos); Read en la ficha (encontrar, entender y compartir una cifra).

Audience and job: público, aspirantes, pares y acreditadores buscan una cifra oficial con su corte y su fuente. Action: elegir un informe y abrir su ficha; en la ficha, filtrar por año y sede, leer y descargar.
Proof/content: cifras de ejemplo en un único archivo, marcadas "Dato ilustrativo" hasta definir la alimentación. Imágenes: fotogramas del vídeo institucional, marcados para reemplazo por fotografía oficial.
Constraints: tokens del proyecto, ambos temas, reduced-motion, nada de cifras de dinero.

Memorable moment: la portada escribe "UDES en Cifras" en paletas y, al bajar, un tablero de nueve informes cuyas cifras voltean y se asientan; cambiar el año re-voltea todo el tablero en ola.

Unresolved: modelo de datos en Supabase y flujo de carga por oficina (siguiente fase).
User changes after the direction round: tema claro/oscuro real en todo el portal; más tipos de gráfica dinámicos e interactivos (circulares, líneas, KPI, tubería de deserción, mapas animados de población y origen, mapa de calor azul, tablas dinámicas).

DE (2026-09-18): la ficha de Diversidad, Equidad e Inclusión abre con un bloque propio, `diversidad` (DiversityBoard). Dentro del mismo mundo de tablero de paletas: consola de corte y campus, titular en paletas con rejilla de cien casillas, cinco llegadas con su reparto por campus, columnas corte a corte, un mosaico de pueblos y comunidades, discapacidad con la cobertura del registro, un espectro de estratos con la tabla por campus, género y zona, y el INES como puntos por grupo de interés. Las celdas reservadas («< 5») se dibujan rayadas y nunca se dimensionan por su valor. Los bloques genéricos del informe quedan ocultos, no borrados (0043).

Mapa de origen (2026-09-18): tipo de mapa «municipio» (0044). De lejos, calor por departamento y resplandor ámbar; al acercarse (botones, doble clic, clic en departamento, pellizco o Ctrl + rueda; la rueda sola desplaza la página), un punto por municipio con su cifra; menos de 5 es anillo hueco «< 5». Sin cifras, el panel se dibuja igual con el aviso «Pendiente de carga». Se carga en la intranet desde el Excel de la caracterización (el navegador cuenta y solo sube conteos) o desde una tabla contada.

## Direction contract

THESIS: Las cifras de la universidad llegan como llegan los vuelos: un tablero de paletas que voltea hasta asentarse en el dato oficial. Rechaza el portal "U en cifras" de contadores sueltos y rejilla de tarjetas con ícono.

OWN-WORLD: Tablero de paletas que sigue el tema, por decisión expresa del usuario: en claro, paletas blancas con tinta azul marino sobre papel; en oscuro, azul noche con tinta blanca. Rótulos condensados de señalética en mayúsculas; cada carácter de una cifra en su celda. Ámbar solo para lo recién llegado (destello al asentarse), lo activo y la acción principal; cian para el corte anterior. Boletos de origen de papel claro perforado en ambos temas. Nueve informes con código de dos letras en insignia del color de su línea. Gráficas en paneles con franja de tablero: líneas por sede, circulares, tablero de KPI, tubería con fugas, mapa de Colombia con flujos de llegada, mapa de calor azul y tabla dinámica, todas animadas e interactivas.

STORY: El visitante ve la universidad en movimiento, lee que esto es UDES en Cifras, baja al tablero, reconoce los nueve informes con su cifra titular y su fuente, elige uno y abre la ficha, donde filtra, compara con el corte anterior y descarga.

FIRST VIEWPORT: Vídeo a sangre completa con velo azul noche desde abajo. Abajo a la izquierda, "Universidad de Santander" a escala de rótulo de estación; debajo "UDES en Cifras" en celdas de paleta que voltean al cargar; debajo el subtítulo. Franja inferior: fila de llegadas con cuatro cifras titulares y su boleto. Acción primaria "Ver informes" en la fila, a la derecha.

FORM: Tablero de paletas (Solari), cuarto de la lista propia; seed 73c21341. Raises: densidad tabular con columna de fuente y corte (ikeda-datamatics); balística con masa en cada paleta (vu-meter bridge); corte anterior legible bajo cada cifra (torn flyer wall); boleto de origen por cifra (moon-shadow bazaar); un control propaga el re-volteo a todo el tablero (miura sheet).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
