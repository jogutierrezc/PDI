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
  od-div-neg-2: "#b9541f"
  od-div-neg-1: "#e79c69"
  od-div-mid: "#e9edf3"
  od-div-pos-1: "#6fa4e8"
  od-div-pos-2: "#2a63b8"
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
- **Escala divergente** (od-div-neg-3 … od-div-pos-2): Saber PRO; terracota bajo un umbral o el promedio nacional, azul sobre él, gris azulado en el centro.
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

### Section Divider (UDES en Cifras)
Separador de la ficha de un informe ("Graduados"): banda en `--od-board-raised` con ficha numerada en el color de la línea del informe, kicker con el nombre del informe, título en letra de señalización más grande que el de cualquier bloque (clamp 2.8–4.4rem) y regla inferior de 4px en el color de la línea. Cada sección muestra sus indicadores y desgloses con un tablero y un bloque de desgloses propios, con lo suyo elegido; un bloque sin elección muestra lo que nadie eligió, y solo el primero (`blockPicks` en `groups.ts`), así nada se repite entre secciones. Con dos o más separadores, un índice "En esta ficha" bajo la barra del informe enlaza a cada uno. El bloque siguiente no repite su regla superior.

### University Rankings (UDES en Cifras)
Bloque "Rankings" con selector de vista (`RankingsBlock.tsx`). Cada ranking trae su color de acento (`--rk-accent`, elegido en la intranet), que marca identidad y nunca la cifra: insignia QS/THE, anillo de la medalla, estrellas encendidas, línea de evolución. Las cifras van en tinta del tablero y en la letra de señalización.
- **Medallas:** cada ranking es una placa del tablero, no una tarjeta con anillo. Franja de identidad con la insignia QS/THE sobre un tinte del acento, cerrada por una regla de 1px del mismo color (nunca una banda gruesa). La posición principal llega volteando en paletas partidas, una celda por cifra, con el signo (# de puesto, = de empate) fuera de las celdas; debajo, la variación dicha en palabras ("sube 9 puestos"; con bandas, "sube desde 1201–1400", nunca un número de puestos inventado con puntos medios) y el corte anterior en cian. Cuando la edición dice cuántas instituciones evaluó, una escala fina sitúa el puesto dentro de ese universo y una banda ocupa su tramo, no un punto inventado. Los demás ámbitos y el puntaje son celdas de la rejilla del tablero, y la última estira hasta el borde para no dejar huecos. Estrellas 0–5 por categoría con guía de puntos, encendida rellena y apagada solo contorno; fichas de ODS en su color oficial, áreas plegables y campos propios. Cada placa cierra con su boleto de origen bajo una regla, así todas las de una fila terminan a la misma altura. Solo la posición voltea: si todo se moviera, no llegaría nada.
- **Tabla comparativa** y **Rueda de ODS** (17 segmentos; los que participan se encienden en su color y se eligen con clic o teclado).
- **Evolución:** escala logarítmica invertida (puesto 1 arriba) y las bandas dibujadas como un trazo vertical translúcido, en dos formas con selector propio. *Cada ranking* (por defecto) da una tira a cada uno sobre la superficie elevada del tablero, con su insignia, su nombre en dos líneas reservadas y **su propia escala**: así se leen con el mismo detalle un puesto mundial de cuatro cifras y uno nacional de dos, y nada se cruza por muchos rankings que haya. El dominio de cada tira sale de sus datos con un recorrido mínimo, para que un puesto de diferencia no llene la tira ni desaparezca. *Todos juntos* mantiene el lienzo único: los rótulos viven en una columna a la derecha —ancha según el nombre más largo—, se empujan entre sí cuando quedarían a menos de una línea y cada uno llega a su punto por un hilo punteado, aunque ese ranking deje de reportar antes del último año. Por debajo de cierto ancho el lienzo se desplaza dentro de su marco en vez de aplastarse.
- En el Boletín, una hoja por ranking: posiciones con variación, **su traza de evolución** (el mismo dibujo de la ficha, en milímetros), estrellas, tabla de ODS con su color, áreas, campos propios e historia de ediciones. Cuando el informe sigue dos o más rankings con historia, una hoja de conjunto más, «Evolución de los rankings», los pone a todos en un lienzo con los rótulos en columna a la derecha y, debajo, la tabla con los mismos puestos: la gráfica enseña la forma del recorrido y la tabla da la cifra, así la hoja se lee sin el color.

**The Nearest Scope Rule.** Donde hay que elegir un solo ámbito y no hay selector —el papel—, se toma el más cercano que el dato permita: Colombia, si no Latinoamérica, si no el mundial (`SCOPE_PREFERENCE`). En la ficha, ese mismo orden decide qué ámbito se abre en la Evolución, pero los botones y las columnas de la tabla conservan su orden de siempre (mundial, Latinoamérica, Colombia). La hoja de conjunto del Boletín además exige que dos rankings reporten ese ámbito: un lienzo con una sola línea no es una comparación.

### Resultados Saber PRO (UDES en Cifras)
Bloque `saber_pro` del informe Enseñanza (`SaberProBlock.tsx`, datos en `data/saber-pro.ts`, 0031). Todo gira alrededor de una competencia: un carril de seis paletas con código de dos letras (PG, LC, RC, CC, CE, IN) la elige, y la activa enciende su código en ámbar como cualquier control del tablero. Debajo, filtros de sede, facultad y programa, y una fila de llegadas con el promedio del corte, el nacional y la participación en niveles altos, en paletas partidas que voltean en ola al cambiar la competencia. Competencia, vista y filtros viajan en la URL (`sp`, `sp-vista`, `sp-sede`, `sp-facultad`, `sp-programa`).
- **Niveles (escalera, vista por defecto):** por año, el reparto de evaluados en los niveles de desempeño, anclado en el umbral alto (nivel 3; B1 en inglés) con una regla de tinta de 2px. Lo que queda por debajo crece a la izquierda en terracota, lo que lo supera a la derecha en azul; cada tramo lleva su porcentaje y la columna derecha dice el % alto con su variación en p. p. El puntaje global no tiene niveles: la misma fila dibuja el reparto del puntaje en tramos de 10 puntos, partido en el promedio nacional (terracota debajo, azul encima), con el promedio del corte en línea continua y el nacional punteado.
- **Brecha con el país:** tabla semántica sede → programa por año; cada casilla es la diferencia en puntos con el promedio nacional, en cinco pasos (10 o más bajo, 3 a 9 bajo, como el país, 3 a 9 sobre, 10 o más sobre) y siempre con su cifra con signo. Con menos de 10 evaluados la casilla va sin color, en cursiva y con contorno punteado; sin evaluados, rayada.
- **Evolución:** `LineChart` con el promedio del corte y el nacional punteado.
- Un año con solo el promedio oficial (2025) aparece en la brecha y la evolución, no en la escalera: no tiene reparto. Los niveles de la fila de llegadas salen del último año con resultados por evaluado y lo dicen en el rótulo. Menos de 30 evaluados atenúa la fila de la escalera.

- **En el Boletín** (`boletin/saber.tsx`): una entrada por competencia en la plantilla (`saber:<conjunto>:<competencia>`), cada una con dos hojas anchas. *Niveles*: cifras clave (promedio y país, % alto y su cambio), la escalera de toda la UDES dibujada en milímetros y la tabla del % alto por sede y año; en el puntaje global, el reparto por tramos partido en el promedio nacional y la tabla del promedio por sede con la fila del país. *Brecha con el país*: la misma tabla de la ficha, en los cinco pasos con su cifra; con menos de 10 evaluados, la cifra va entre paréntesis y sin tono. Sigue en páginas de continuación y una sede nunca queda sola al pie. Los tonos son `--bol-div-*`, fijos como todo el papel.
- Un programa es sede + nombre, como viene en la fuente; los evaluados sin código SNIES van en su propia fila ("Derecho · sin código SNIES"). En la ficha, elegir un programa sin sede fija también su sede: nunca se suman programas de sedes distintas.

**The Diverging Scale Rule.** `--od-div-neg-3..1`, `--od-div-mid` y `--od-div-pos-1..2`, cada uno con su tinta `-ink`, son la escala de polaridad frente a un umbral: terracota debajo, azul encima, y cuanto más lejos del centro, más contraste con la superficie (en claro más oscuro, en oscuro más brillante). Validada en orden adyacente para daltonismo y visión normal en los dos temas; los pasos cercanos al centro no llegan a 3:1 con la superficie, por eso cada marca lleva su cifra. No es una serie categórica ni un estado.

### Motor Beta · Saber TyT (UDES en Cifras)
Bloque `saber_tyt` (`SaberTytBlock.tsx`, contrato en `data/saber-tyt.ts`, 0035). El segundo modelo de lectura del portal: Saber PRO mira una prueba contra el país; este mira dos pruebas de la misma persona, la de entrada (Saber 11) y la de salida (Saber TyT). Mismo tablero que Saber PRO, con tres diferencias: el carril de competencias lleva **los dos nombres** de cada una ("Matemáticas → Razonamiento cuantitativo") y marca las que solo existen en una prueba; las cifras van en **percentil**, no en puntos; y la fila de llegadas cierra con el **valor agregado**, la única cifra con signo, sobre la superficie elevada.
- **Perfil:** los polígonos de entrada y salida superpuestos (radar), con su tabla al lado.
- **Dispersión:** entrada × salida con la diagonal de igualdad punteada en tinta; azul por encima, terracota por debajo. Dos modos: por programa (tamaño = evaluados con las dos pruebas) o nube de evaluados en celdas de 5 percentiles, que nunca dibuja a una persona.
- **Tránsito:** una barra al 100 % por cuarto de entrada, en la escala azul secuencial, y la lectura en palabras ("de cada diez que entraron en el cuarto más bajo, 3,2 salieron en los dos altos").
- **Valor agregado:** barras divergentes por programa a lado y lado del cero, atenuadas con menos de 10 evaluados.
- **Cómo funciona el Motor Beta:** cierra el bloque a ancho completo, en cuatro tarjetas (dibujo a la izquierda, texto justificado a la derecha) numeradas en ámbar, y un aviso final de cómo no leerlo. Los cuatro dibujos son el mismo lenguaje de la ficha a escala de explicación: las dos escalas traducidas a un percentil, las competencias emparejadas con flechas, la resta del valor agregado sobre la escala y la diagonal con un punto arriba y otro abajo.
- **En el Boletín** (`boletin/tyt.tsx`): cada competencia con pareja de pruebas (`tyt:<conjunto>:<competencia>`) ocupa **tres unidades**, porque las dos lecturas y la tabla no caben en una hoja. *Posición de entrada y de salida* (Beta): las tres cifras clave, el valor agregado por programa —hasta 14 barras: con más programas, los diez primeros y los cuatro últimos, y el pie lo dice— y el tránsito por cuartos. *Lo que se esperaba y lo que ocurrió* (Alpha): el plano de 96 mm con la diagonal, las cifras de esperado, real y valor agregado, los pesos del ajuste guardado y una nota que lo compara con el del artículo, con la cita en la franja de notas. *Por programa*: la tabla de nueve columnas, los percentiles del Beta y los puntos del Alpha, con «con Saber 11» y «con modelo» como las dos poblaciones. El plano recorta el 0,5 % de cada cola para que la nube ocupe el cuadro.

- **Motor Alpha** (`SaberAlphaViews.tsx`, `data/saber-alpha.ts`, 0037): segunda lectura del mismo conjunto, con su conmutador de modelo junto al de vista. Es el modelo publicado por León, Tobar Sánchez, González Calderón y Suárez Arias (Innovaciencia 2025; 13(1): e4589, CC BY-NC 4.0): una regresión lineal múltiple que estima el puntaje esperado de cada estudiante a partir de sus cinco competencias del Saber 11, y el valor agregado es lo real menos lo esperado, en puntos de la prueba. Sus cuatro vistas son *Plano* (esperado × real con la diagonal de igualdad, por programa o como nube en celdas de 5 puntos), *Cuadrantes* (el plano del artículo: cada burbuja es una celda de 5 puntos del cruce Saber 11 × Saber TyT y los dos promedios nacionales lo parten en cuatro, con su número al fondo de cada cuarto y una leyenda que da la cifra y el conteo de cada uno), *El modelo* (los coeficientes de los dos ajustes —el del artículo y el ampliado sin ciencias naturales— con su R², su n y su error típico) y *Valor agregado* por programa. La fila de llegadas cambia a esperado, real y la resta. La explicación cierra con la cita completa y el enlace al DOI: el modelo no es nuestro y la ficha lo dice.

**The Credit Rule.** Un modelo de análisis que viene de una investigación ajena se publica con sus autores, su revista, su licencia y su enlace, en el mismo bloque donde se leen sus cifras, no en una nota al pie.

**The Motion Rule.** Las gráficas propias llegan: los puntos aparecen con un `pop` y las barras crecen desde su origen (`od-tyt-pop`, `od-tyt-grow`, `od-tyt-rise`), escalonadas por índice y disparadas una sola vez al entrar en pantalla (`useInView`). Nada se mueve en bucle, el estado final es el que se dibuja sin animación, y con `prefers-reduced-motion` no se anima nada. Los dos ganchos —`useInView` y `usePrefersReducedMotion`— se llaman siempre, nunca detrás de un `||`.

**The Percentile Reference Rule.** El percentil se calcula dentro de la cohorte histórica de la universidad, así que el promedio institucional queda en la mitad de la escala y el valor agregado del conjunto ronda el cero por construcción: el bloque compara programas y años entre sí, nunca la universidad frente al país, y lo dice donde se lee la cifra.

### Conjuntos libres (UDES en Cifras)
Bloque `libre` (`FreeSetBlock.tsx`, gráficas en `components/free/`, contrato en `data/free-sets.ts`, 0033). Una fuente con las columnas que define quien reporta (texto, cifra con formato y unidad, fecha, territorio) y su temporalidad: **sin tiempo** ("Dato sin fecha"), **por año** (selector de año en la cabecera; líneas, área y Gantt recorren todos los años) o **por periodo** (sello "Periodo 2020–2025"). Cada vista lee una sola fuente; el bloque muestra una vista (`settings.view`) o todas.
- **Gráficas:** barras (agrupadas, apiladas y al 100 %, verticales u horizontales), circular y dona (con la lista de cifra y % al lado; más de seis categorías van a «Otros»), radar (cada eje en % de su máximo, cifra real en el tooltip), líneas y área (apilada con varias series), histograma y diagrama de caja (cada fila es una observación), cascada (suma en azul, resta en terracota, total en tinta, conectores punteados), Gantt (tareas con inicio y fin, marca de hoy), mapa (Colombia o mundo con la escala azul secuencial y ranking al lado), cifras clave (paletas del tablero) y tabla.
- Barras, circular, radar, líneas, área y caja usan **nivo**; cascada, Gantt y mapa son SVG propios. nivo pinta con atributos, así que los colores se leen ya calculados de los tokens (`useChartTokens`) y se releen al cambiar de tema. Categorías en el orden fijo `--od-cat-1..6`, nunca en ciclo; con dos o más series hay leyenda y cada gráfica trae su tabla para lectores de pantalla.
- Paneles: las pequeñas (circular, dona, radar, histograma, caja, cifras) se emparejan en dos columnas; las demás ocupan la fila.
- **Filas con tipo** (0034): una fila es un **dato**, un **título de grupo** (agrupa las que siguen hasta el próximo título) o un **total**, que el portal calcula sobre las filas de datos de su grupo: suma las columnas de enteros y promedia las de decimales y porcentajes, y lo dice junto a su rótulo. Las gráficas solo leen las filas de datos, que un total junto a sus partes contaría dos veces; la tabla muestra los tres tipos, con el título en letra de señalización y el total en tinta sobre la superficie elevada.
- **En el Boletín** (`boletin/free.tsx`): una entrada por vista (`libre:<fuente>:<vista>`), hoja ancha con notas (gráfica, lectura, corte). Las gráficas de la ficha se dibujan a 680 px con la paleta fija del papel y sin animación, dentro de `.bol-fit`, que las escala al cuerpo; el mapa usa el coroplético del boletín con su tabla, la tabla usa la del boletín con continuaciones y las cifras clave van en tinta.

## Boletín UDES en Cifras (papel A4)

El boletín es papel, no pantalla: un documento A4 de 210×297 mm que se imprime a PDF desde el navegador. Su marco lo fijó Planeación con tres páginas modelo (`Modelo Informe/Imagenes`): portada, contraportada y página de contenido. Vive en `src/modules/boletin/` y su plantilla (textos, imágenes, colores, fuente, contenido) se edita en la estación 6 de la intranet.

**Creative North Star: "El anuario con columna de notas."** Cada indicador es una hoja documentada: a la izquierda, la columna de notas dice qué mide, quién lo reporta, cómo se calcula y a qué corte pertenece; a la derecha, el cuerpo lo prueba con la cifra ancla, la evolución, el reparto por campus y la tabla.

### Named Rules
**The Paper Is Not Themed Rule.** Los colores del boletín (`--bol-*`) no se redefinen en tema oscuro: el papel es blanco en los dos temas. Solo el visor que lo rodea usa los tokens de la aplicación.

**The Millimetre Rule.** Dentro del documento todo se mide en milímetros: márgenes, radios (`bol-code` 0,8 mm, `bol-tile` 1,2 mm) y tipografía. Las gráficas son SVG con viewBox en milímetros, así que un `font-size` de 2,2 en un SVG son 2,2 mm impresos, no píxeles.

**The Pinned Frame Rule.** La cabecera de las páginas de contenido reproduce el modelo al milímetro: barra de 9,1 mm con el logo blanco y la dependencia, franja de 18,4 mm con el título y el dibujo de edificios a la derecha, sin nada más: el capítulo va en el pie. Portada y contraportada son las imágenes del modelo; los textos de la plantilla se escriben encima solo donde la imagen no los trae. Desde la plantilla se pueden cambiar la portada, la contraportada, un fondo A4 para las páginas de contenido (si ya trae la cabecera dibujada, el boletín no pinta la suya), el dibujo de la franja y el logo de la barra.

**The Chapter Colour Rule.** La barra y la franja de la cabecera son las dos únicas piezas del papel que cambian de color con el capítulo. Cada página de informe reescribe `--bol-chrome-band` con el color de línea de su informe —el mismo de su insignia en el portal y de su pestaña en el borde— y `--bol-chrome-bar` con ese color mezclado al 58 % sobre azul noche, para que el logo blanco siga leyéndose; la insignia rellena escribe su código en ese mismo tono. Portada, contenido y resumen no pertenecen a ningún informe y se quedan con el tema, y desde la plantilla («Color de la cabecera») se puede volver al tema en todas las páginas. Los datos no se tiñen: `--bol-band` sigue mandando en gráficas, mapas y tablas, porque el color de una serie no depende de en qué capítulo cayó la hoja.

**The Plantilla Colours Rule.** `bol-navy`, `bol-band` y `bol-accent` son los valores por defecto de la plantilla y se pueden cambiar desde la intranet; las series de campus (`--bol-s2` a `--bol-s5`) y las líneas de informe repiten las del portal en claro. La fuente por defecto es Montserrat (la del modelo); Manrope, Source Sans 3, Roboto y Lato se cargan desde Google Fonts solo si la plantilla las elige.

### Components
- **Hoja de indicador:** columna de notas de 38 mm en `bol-paper-2` con rótulos en mayúsculas de 2,3 mm; cuerpo con título de 4,4 mm, cifra ancla Montserrat 800 de 9 mm, gráficas de 36 mm de alto y tabla de reglas finas con cabecera azul marino y la columna del corte resaltada. Tiene variante compacta para no dejar media página vacía.
- **Hoja de conjunto:** desgloses en barras con participación; mapas coropléticos (Colombia o mundo, con rutas en movilidad) junto al ranking; tuberías con el mismo dibujo de la ficha web (LeakyPipeline en modo papel, quieto y escalado); evolución histórica en columnas apiladas; mapas de calor como tabla sombreada; evolución de los rankings universitarios en escala logarítmica invertida, con el rótulo de cada uno en la columna derecha y un hilo hasta su último punto. Con muchas columnas, las notas pasan a una franja arriba.
- **Tabla:** las columnas de texto parten línea a la izquierda, las cifras van a la derecha; si aun así no cabe, la tabla se reduce hasta el margen.
- **Apertura de capítulo:** regla superior y cuadro de código en el color de la línea del informe, cifras clave con la unidad debajo del número.
- **Presentación y contenido:** la presentación va justificada; el contenido lista cada capítulo y, sangradas debajo, sus hojas con su página. Si no cabe bajo la presentación, sigue en páginas "Contenido (continuación)".
- **Formato ejecutivo:** página "Resumen ejecutivo" (cada informe en una fila con sus tres cifras titulares) y una ficha por informe con hasta seis cifras clave en filas: qué mide, cifra y lectura, tendencias del total por periodo y por año lado a lado, reparto por campus y, debajo, lo esencial de sus mapas, desgloses, históricos y tablas (un informe que reporta solo en conjuntos también tiene ficha).
- **Navegación:** las entradas del contenido, las pestañas de capítulo y el número de página del pie son enlaces internos que Chrome conserva en el PDF. Las pestañas van en el borde derecho, fuera del margen: franja fina en el color de cada informe y la del capítulo actual ancha, con su código.
- **Secciones (separadores de la ficha):** un separador de la estación Diseño ("Graduados") agrupa los bloques que le siguen; sus indicadores salen de los tableros del grupo con indicadores elegidos (ver `groups.ts`). En el boletín, lo general del informe va primero y cada sección abre página con `.bol-group`: código del informe y "sección n de N", número grande en `--line`, título en `--bol-navy`, descripción y la lista de sus hojas. La apertura del capítulo enumera sus secciones; en el índice van entre el capítulo y sus hojas (hojas sangradas 3 mm) y el pie de página dice "Informe · Sección".
- **Periodos académicos:** lo que se reporta por periodo se muestra como se reportó, numerado (2024-1, 2024-2; en la base siguen siendo A y B), junto a la cifra del año según su regla. Hoja de indicador: línea de periodos bajo la cifra ancla, gráfica "Por periodo académico" (eje con el número del periodo y el año bajo cada par), "Cifra del año" (con la regla suma, columnas apiladas periodo 1 + periodo 2 en `--bol-term-1`/`--bol-term-2`) y tablas por tramos de tres años con la columna del año en negrita. Lo que solo se reporta por año no dibuja columnas de periodo vacías. Si falta la cifra del año, la hoja muestra el último periodo reportado y lo dice.
- **Tablas largas:** la hoja lleva las primeras 12 filas y el resto sigue en tramos de 14 pegados a la anterior, con el encabezado repetido y "continuación".
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
