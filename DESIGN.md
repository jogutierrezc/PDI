---
name: PDI UDES · Portal, Intranet y UDES en Cifras
description: Sistema visual de la Universidad de Santander para el Plan de Desarrollo, su intranet y el portal estadístico UDES en Cifras.
colors:
  brand-navy: "#0a2d63"
  brand-blue: "#2166d6"
  brand-blue-strong: "#1b52ad"
  brand-blue-soft: "#eaf1fd"
  brand-teal: "#0096a5"
  page: "#f4f7fb"
  surface: "#ffffff"
  surface-2: "#f8fafd"
  surface-3: "#eef3fa"
  ink: "#0d1c31"
  ink-secondary: "#45566d"
  ink-muted: "#6b7c93"
  ink-faint: "#93a2b6"
  line: "rgba(13, 40, 84, 0.11)"
  line-strong: "rgba(13, 40, 84, 0.2)"
  status-done: "#12833a"
  status-pending: "#b07d00"
  status-risk: "#d03b3b"
  status-pending-soft: "#fbf2e0"
  od-board: "#ffffff"
  od-board-night: "#06142b"
  od-flap: "#f6f8fc"
  od-flap-ink: "#0a2d63"
  od-signal: "#f6b93f"
  od-signal-text: "#8a5700"
  od-signal-ink: "#1d1402"
  od-previous: "#0a6f7c"
  od-ticket-stock: "#eef2f8"
  od-page: "#eef2f8"
  od-line-1: "#1f5fbf"
  od-line-2: "#0b7481"
  od-line-3: "#a4471f"
  od-line-4: "#6b3fa0"
  od-line-5: "#7f6200"
  od-line-6: "#ad2f58"
  od-line-7: "#43536b"
  od-line-8: "#2e6b2f"
  od-line-9: "#8a3b8f"
  od-series-1: "#1f5fbf"
  od-series-2: "#c2571a"
  od-series-3: "#0f8a6e"
  od-seq-0: "#eef3fa"
  od-seq-7: "#0d366b"
  bol-navy: "#072b58"
  bol-band: "#4078b9"
  bol-accent: "#e8892b"
  bol-ink: "#16243a"
  bol-rule: "#d6dee8"
  bol-paper-2: "#eef3f9"
typography:
  display:
    fontFamily: "Fraunces, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(2.1rem, 2.6vw + 1.5rem, 3.1rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.028em"
  headline:
    fontFamily: "Fraunces, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(1.35rem, 0.8vw + 1.15rem, 1.65rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.028em"
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 800
    lineHeight: 1.28
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.5
  sign-hero:
    fontFamily: "Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "clamp(2.7rem, 7.2vw, 6rem)"
    fontWeight: 700
    lineHeight: 1
  sign-label:
    fontFamily: "Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.08em"
  bulletin-header:
    fontFamily: "Montserrat, Manrope, system-ui, sans-serif"
    fontSize: "7.7mm"
    fontWeight: 700
    lineHeight: 1
  bulletin-anchor:
    fontFamily: "Montserrat, Manrope, system-ui, sans-serif"
    fontSize: "9mm"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  bulletin-body:
    fontFamily: "Montserrat, Manrope, system-ui, sans-serif"
    fontSize: "2.6mm"
    fontWeight: 500
    lineHeight: 1.35
  bulletin-label:
    fontFamily: "Montserrat, Manrope, system-ui, sans-serif"
    fontSize: "2.3mm"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
rounded:
  flap: "0.1em"
  ticket: "3px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  pill: "999px"
  bol-code: "0.8mm"
  bol-tile: "1.2mm"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "32px"
  "8": "40px"
  "9": "48px"
  "10": "64px"
components:
  button-primary:
    backgroundColor: "{colors.brand-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brand-navy}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  od-button-signal:
    backgroundColor: "{colors.od-signal}"
    textColor: "{colors.od-signal-ink}"
    rounded: "{rounded.xs}"
  input-field:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "20px"
  od-ticket:
    backgroundColor: "{colors.od-ticket-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.ticket}"
    padding: "5px 12px 5px 20px"
  od-flap-cell:
    backgroundColor: "{colors.od-flap}"
    textColor: "{colors.od-flap-ink}"
    rounded: "{rounded.flap}"
    width: "0.7em"
    height: "1.24em"
---

# Design System: PDI UDES · Portal, Intranet y UDES en Cifras

## Overview

**Creative North Star: "El tablero de llegadas de la universidad"**

Un solo código atiende tres superficies con un mismo suelo: el portal del Plan de Desarrollo, la intranet de Planeación y el portal estadístico UDES en Cifras. El suelo común es institucional y sobrio: planos blancos y gris azulado, tinta azul marino, azul institucional reservado para la acción, Fraunces para los títulos y Manrope para todo lo demás. Sobre ese suelo, UDES en Cifras monta su propio mundo: un tablero de paletas partidas (Solari) donde cada cifra voltea hasta asentarse en el dato oficial, con boletos de origen de papel perforado que dicen quién la reporta, para qué campus y con qué corte.

La intranet es el otro extremo: densa, callada y orientada a la tarea. Estaciones fijas, rejillas tipo hoja de cálculo, estado siempre con glifo y texto. El color de estado solo aparece cuando algo está completo, pendiente o en riesgo. Los dos temas (claro y oscuro) son reales en todo el sistema: cada token de color se redefine por tema, no se invierte automáticamente.

**Key Characteristics:**
- Planos claros en capas tonales (page → surface → surface-2 → surface-3) con sombras en capas muy suaves.
- Azul institucional solo para acción principal, selección y foco.
- Cifras en numerales tabulares; vacío ("sin reportar") nunca es cero y se dibuja distinto.
- En UDES en Cifras: paletas partidas, rótulos condensados de señalética en mayúsculas, ámbar para lo recién llegado, cian para el corte anterior.
- Identidad nunca solo por color: código de dos letras, leyenda, glifo o etiqueta acompañan siempre al tono.

## Colors

Institucional y frío en su base, con dos acentos de señal (ámbar y cian) que viven solo en el tablero de UDES en Cifras.

### Primary
- **Azul Institucional** (brand-blue): acción principal (botón primario), elemento seleccionado, anillo de foco, estación activa. Su versión suave (brand-blue-soft) rellena la selección en listas y el cajón activo.
- **Azul Marino UDES** (brand-navy): títulos en Fraunces, botones secundarios, tinta de las paletas en tema claro.

### Secondary
- **Ámbar de Señal** (od-signal): exclusivo del tablero. Destello de la paleta al asentarse, acción principal del portal estadístico, control activo y flujos del mapa. Como texto usa od-signal-text, que sí alcanza 4.5:1 sobre blanco.

### Tertiary
- **Cian Corte Anterior** (od-previous): la cifra del corte anterior y su barra de comparación. Nunca se usa para otra cosa.

### Neutral
- **Papel Azulado** (page): fondo de página del portal y la intranet.
- **Blanco Superficie** (surface) y sus capas surface-2 / surface-3: paneles, campos, cabeceras de tabla, hover.
- **Tinta Noche** (ink), **Tinta Pizarra** (ink-secondary), **Tinta Niebla** (ink-muted), **Tinta Tenue** (ink-faint): de texto principal a marcadores de posición y guiones de vacío.
- **Línea** (line, line-strong): bordes de panel y divisores, siempre translúcidos sobre el azul marino.
- **Papel de Boleto** (od-ticket-stock): el boleto de origen es papel claro en los dos temas, como el objeto real.
- **Tablero Noche** (od-board-night): el tablero en tema oscuro; en claro el tablero es blanco.

### Data palettes
- **Líneas de informe** (od-line-1 … od-line-9): una por informe, con tinta blanca ≥ 4.5:1, siempre junto al código de dos letras.
- **Series por campus** (od-series-1..3): validadas todas contra todas para daltonismo y visión normal; siempre con leyenda.
- **Escala azul secuencial** (od-seq-0 … od-seq-7): mapa de calor y mapa de Colombia; claro = poco, oscuro = mucho.
- **Categorías de circulares** (od-cat-1..6, en tokens.css): orden fijo, nunca cíclico; la leyenda con cifra y porcentaje es obligatoria.

### Named Rules
**The Reserved Status Rule.** Verde, ámbar y rojo de estado (status-done, status-pending, status-risk) significan completo, pendiente y riesgo, y viajan siempre con glifo y texto. Nunca se reutilizan como serie de datos ni como decoración.

**The One Signal Rule.** El ámbar de señal existe solo dentro de UDES en Cifras y marca lo que acaba de llegar o lo que está activo. Si todo brilla en ámbar, nada llegó.

**The Selected Theme Rule.** El tema oscuro es una paleta elegida y validada contra su propia superficie, no un volteo. Todo token nuevo se declara en :root y se redefine en los dos bloques oscuros de tokens.css.

## Typography

**Display Font:** Fraunces (con Iowan Old Style, Georgia)
**Body Font:** Manrope (con ui-sans-serif, system-ui)
**Sign Font:** Barlow Condensed (con Arial Narrow, Roboto Condensed), solo en UDES en Cifras

**Character:** Fraunces da a los títulos el peso de un documento institucional; Manrope mantiene la interfaz legible y densa. Barlow Condensed es la señalética del tablero: mayúsculas espaciadas y cifras en celdas.

### Hierarchy
- **Display** (700, clamp 2.1–3.1rem, 1.08, tracking −0.028em): títulos de página en azul marino.
- **Headline** (700, clamp 1.35–1.65rem, 1.08): títulos de sección y de pantalla en la intranet ("Captura", "Publicación").
- **Title** (Manrope 800, 1.0625rem, 1.28): cabecera de panel, nombre de informe.
- **Body** (Manrope 500, 0.9375rem, 1.5): texto corrido; descripciones de panel a 0.75rem con máximo 64ch.
- **Label** (Manrope 700, 0.75rem): botones, rótulos de campo, cabeceras de rejilla.
- **Sign Hero** (Barlow Condensed 700, clamp 2.7–6rem): "Universidad de Santander" en la portada del tablero.
- **Sign Label** (Barlow Condensed 600, 0.8rem, tracking 0.08em, MAYÚSCULAS): rótulos del tablero, sellos y etiquetas de corte.

### Named Rules
**The Tabular Figure Rule.** Toda cifra que se compara (rejillas, tablero, tablas, KPI) usa numerales tabulares. En el tablero, cada carácter ocupa su propia celda de paleta.

**The Sign Belongs To The Board Rule.** Barlow Condensed y las mayúsculas espaciadas no salen del portal estadístico; la intranet y el PDI hablan en Manrope.

## Layout

Rejilla de espacio base 4px (space-1 = 4px … space-12 = 104px). Margen lateral fluido (gutter: clamp 16–40px) y ancho de lectura de 68ch; contenido público hasta 1220px.

**Intranet.** Barra lateral fija de 250px, agrupada por portal (Plan de Desarrollo, UDES en Cifras, Sistema), que se desplaza entera; cabecera pegajosa con ruta (portal › pantalla), título y acciones a la derecha. AdminShell publica su alto como `--admin-topbar-h` para que las cabeceras pegajosas de cada pantalla se coloquen debajo. UDES en Cifras organiza el trabajo en una barra de cinco estaciones, una lista de informes (16.5rem, 14rem por debajo de 1600px) y el área de trabajo; la vista previa es columna fija (14–15.5rem) en Estructura y Publicación desde 1280px, y cajón derecho en Captura y en pantallas medianas. Por debajo de 1100px todo va en una columna y las tiras de estaciones e informes se desplazan a lo ancho, dejando a la vista el elemento actual. Por debajo de 900px la barra lateral es un cajón con capa.

**UDES en Cifras público.** Portada con vídeo a sangre completa y rótulo abajo a la izquierda; tablero de nueve informes; fichas con bloques en el orden que decide la intranet. Tablas, mapas y rejillas anchas se desplazan dentro de su marco; la página nunca se desplaza en horizontal.

**Densidad.** Paneles con 16–20px de relleno y 20px entre bloques; filas de rejilla de 36px; en el móvil la columna de rótulos de la rejilla baja a 8rem y los rótulos parten línea.

## Elevation & Depth

Híbrido: la profundidad viene sobre todo de capas tonales (page, surface, surface-2, surface-3) y bordes translúcidos; las sombras son en capas, muy suaves y teñidas de azul marino, nunca un solo desenfoque gris. En oscuro las sombras se vuelven negras y más densas. El tablero tiene su propia profundidad física: cada paleta lleva una sombra de 1px y una bisagra, y al voltear se oscurece y se ilumina como una hoja real.

### Shadow Vocabulary
- **Reposo** (`--shadow-xs: 0 1px 2px rgba(10,34,73,.06)`): paneles y botón secundario.
- **Levantado** (`--shadow-md` / `--shadow-lg`): tarjetas al pasar el puntero, tooltips.
- **Cajón** (`--shadow-xl`): cajón de navegación móvil y cajón de vista previa.
- **Acento** (`--shadow-accent: 0 8px 20px rgba(33,102,214,.24)`): solo el botón primario.
- **Panel de tablero** (`--od-shadow-panel`): paneles de gráfica del portal estadístico.
- **Foco** (`--ring: 0 0 0 3px rgba(33,102,214,.32)`): campos enfocados; el resto de controles usan contorno de 2px azul con 2px de separación.

### Named Rules
**The Tinted Shadow Rule.** Una sombra en tema claro se tiñe de azul marino (rgba 10,34,73) y se apila en dos capas. Una sombra gris neutra de un solo desenfoque no pertenece a este sistema.

## Shapes

Esquinas generosas en la interfaz y precisas en los objetos del tablero. Botones del PDI y la intranet en píldora (999px); campos a 12px; paneles a 16px; botones de icono y celdas enfocadas a 8px. Los objetos físicos del tablero conservan su forma real: la paleta con esquinas de 0.1em partida en dos mitades, el boleto de origen a 3px con muesca perforada (máscara radial) en el borde izquierdo y una línea de corte discontinua. Los sellos del tablero usan borde discontinuo a 4px. Las casillas vacías de la rejilla llevan un rayado diagonal de 135° en línea tenue, no un color.

## Components

### Buttons
- **Shape:** píldora (999px); acciones de panel compactas a 0.75rem con relleno 8px 16px.
- **Primary:** azul institucional con tinta blanca y sombra de acento; uno por zona de trabajo, arriba a la derecha.
- **Secondary:** superficie blanca, tinta azul marino, borde line-strong.
- **Ghost:** transparente, tinta pizarra, borde line.
- **Hover / Focus:** transición de color y borde en 220ms; pulsación a escala 0.97 en 140ms; foco con contorno azul de 2px.
- **Link button (intranet):** texto azul sin borde. La variante destructiva ("Borrar") descansa en tinta pizarra y solo se vuelve roja al apuntarla, al enfocarla y en su confirmación.
- **Señal (portal estadístico):** ámbar con tinta casi negra, esquina 8px; la variante fantasma pasa a ámbar al apuntarla.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** surface; variante callada en surface-2 sin sombra.
- **Shadow Strategy:** reposo (shadow-xs).
- **Border:** 1px line.
- **Internal Padding:** cabecera 16px 20px con divisor tenue; cuerpo 20px. Desde 1100px la cabecera es rejilla título | acciones.

### Inputs / Fields
- **Style:** fondo surface-2, borde 1px line, esquina 12px, relleno 12px 16px.
- **Focus:** borde azul institucional más anillo de 3px.
- **Error / Disabled:** error en status-risk con glifo y mensaje en línea; deshabilitado en tinta tenue.

### Navigation
- **Intranet:** barra lateral de 250px con grupos rotulados en 0.6875rem; enlaces con icono de 17px, activo con relleno brand-blue-soft y tinta azul. Ruta en la cabecera con chevron dibujado en CSS. En el móvil, cajón deslizante de 300ms con curva de cajón.
- **Estaciones del periodo:** cinco pasos numerados con valor, detalle y medidor; el activo con relleno azul suave y barra inferior; completo muestra check verde.

### Status Mark (intranet)
Círculo de 16px por estación: vacío con borde tenue, pendiente en ámbar suave con glifo de alerta, completo en verde con check blanco. Cada marca lleva texto oculto para lectores de pantalla y título al apuntarla.

### Data Grid (intranet)
Rejilla tipo hoja de cálculo: columna de rótulos pegajosa a la izquierda (12.5rem), casillas de al menos 5.5rem con numerales tabulares alineados a la derecha, cabecera pegajosa bajo la cabecera de la intranet. Filas de total en cursiva y bloqueadas cuando se calculan. Casilla cambiada resaltada antes de guardar; casilla vacía rayada; error en rojo con mensaje. Pegar un rango de Excel rellena desde la casilla enfocada.

### Inline Confirmation
Borrar y cambiar lo que ve el público nunca abre un modal: la confirmación aparece en el mismo sitio, con fondo ámbar suave, y la pregunta nombra la consecuencia ("Poblacional deja de verse en el portal").

### Split-Flap Cell (UDES en Cifras)
Celda de 0.7em × 1.24em partida en mitad superior (od-flap) e inferior (od-flap-low). Al cambiar, la hoja superior cae con aceleración y la inferior se asienta con rebote; la duración depende de cuántos caracteres recorre. Al llegar, destello ámbar breve. Con movimiento reducido, el valor aparece sin voltear. La insignia de informe es la misma paleta en el color de su línea con tinta blanca.

### Origin Ticket (UDES en Cifras)
Boleto de papel claro bajo cada cifra: oficina que reporta en negrita, campus y sello de corte en mayúsculas, muesca perforada a la izquierda. Debajo, el corte anterior en cian con su variación (puntos porcentuales para tasas, porcentaje para conteos).

## Boletín UDES en Cifras (papel A4)

El boletín es papel, no pantalla: un documento A4 de 210×297 mm que se imprime a PDF desde el navegador. Su marco lo fijó Planeación con tres páginas modelo (`Modelo Informe/Imagenes`): portada, contraportada y página de contenido. Vive en `src/modules/boletin/` y su plantilla (textos, imágenes, colores, fuente, contenido) se edita en la estación 6 de la intranet.

**Creative North Star: "El anuario con columna de notas."** Cada indicador es una hoja documentada: a la izquierda, la columna de notas dice qué mide, quién lo reporta, cómo se calcula y a qué corte pertenece; a la derecha, el cuerpo lo prueba con la cifra ancla, la evolución, el reparto por campus y la tabla.

### Named Rules
**The Paper Is Not Themed Rule.** Los colores del boletín (`--bol-*`) no se redefinen en tema oscuro: el papel es blanco en los dos temas. Solo el visor que lo rodea usa los tokens de la aplicación.

**The Millimetre Rule.** Dentro del documento todo se mide en milímetros: márgenes, radios (`bol-code` 0,8 mm, `bol-tile` 1,2 mm) y tipografía. Las gráficas son SVG con viewBox en milímetros, así que un `font-size` de 2,2 en un SVG son 2,2 mm impresos, no píxeles.

**The Pinned Frame Rule.** La cabecera de las páginas de contenido reproduce el modelo al milímetro: barra azul marino de 9,1 mm con el logo blanco y la dependencia, franja azul de 18,4 mm con el título y el dibujo de edificios a la derecha, sin nada más: el capítulo va en el pie. Portada y contraportada son las imágenes del modelo; los textos de la plantilla se escriben encima solo donde la imagen no los trae. Desde la plantilla se pueden cambiar la portada, la contraportada, un fondo A4 para las páginas de contenido (si ya trae la cabecera dibujada, el boletín no pinta la suya), el dibujo de la franja y el logo de la barra.

**The Plantilla Colours Rule.** `bol-navy`, `bol-band` y `bol-accent` son los valores por defecto de la plantilla y se pueden cambiar desde la intranet; las series de campus (`--bol-s2` a `--bol-s5`) y las líneas de informe repiten las del portal en claro. La fuente por defecto es Montserrat (la del modelo); Manrope, Source Sans 3, Roboto y Lato se cargan desde Google Fonts solo si la plantilla las elige.

### Components
- **Hoja de indicador:** columna de notas de 38 mm en `bol-paper-2` con rótulos en mayúsculas de 2,3 mm; cuerpo con título de 4,4 mm, cifra ancla Montserrat 800 de 9 mm, gráficas de 36 mm de alto y tabla de reglas finas con cabecera azul marino y la columna del corte resaltada. Tiene variante compacta para no dejar media página vacía.
- **Hoja de conjunto:** desgloses en barras con participación; mapas coropléticos (Colombia o mundo, con rutas en movilidad) junto al ranking; tuberías con el mismo dibujo de la ficha web (LeakyPipeline en modo papel, quieto y escalado); evolución histórica en columnas apiladas; mapas de calor como tabla sombreada. Con muchas columnas, las notas pasan a una franja arriba.
- **Tabla:** las columnas de texto parten línea a la izquierda, las cifras van a la derecha; si aun así no cabe, la tabla se reduce hasta el margen.
- **Apertura de capítulo:** regla superior y cuadro de código en el color de la línea del informe, cifras clave con la unidad debajo del número.
- **Presentación y contenido:** la presentación va justificada; el contenido lista cada capítulo y, sangradas debajo, sus hojas con su página. Si no cabe bajo la presentación, sigue en páginas "Contenido (continuación)".
- **Contraportada:** lista de oficinas que reportan en dos columnas (tres cuando pasan de 20) sobre el espacio blanco del modelo.

## Do's and Don'ts

### Do:
- **Do** declare every new color token in `:root` and redefine it in both dark blocks of `tokens.css`; `body` always gets an explicit background.
- **Do** pair every status color with a glyph and a text label, and every series or line color with a legend, code, or direct label.
- **Do** draw "sin reportar" as an empty, striped or dashed cell, never as 0.
- **Do** use tabular numerals for any figure that is compared.
- **Do** keep one primary action per work area, top right, in brand-blue.
- **Do** confirm destructive or visibility-changing actions inline, naming the consequence.
- **Do** keep wide tables, grids, and maps scrolling inside their own frame; the page body never scrolls horizontally.
- **Do** set SVG chart colors through `style` with `var()`, not presentation attributes.

### Don't:
- **Don't** reuse status green, amber, or red as a data series or decoration.
- **Don't** use the signal amber, Barlow Condensed, or uppercase sign labels outside UDES en Cifras.
- **Don't** show money figures on any public page.
- **Don't** rest destructive links in red; red arrives on hover, focus, and confirmation.
- **Don't** cycle categorical hues or generate a ninth line color; fold extras into "Otros".
- **Don't** add a thick colored side stripe to cards to signal category; category identity comes from the two-letter code and its line badge.
