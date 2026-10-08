# Guía de estilo · Manual de uso del Portal de Planeación Institucional

Esta guía dice cómo escribir y maquetar cada página del manual para que todas se vean como la propuesta aprobada. Sirve para quien redacta, para quien maqueta y para un agente de IA al que se le pida una página.

**Archivos de esta carpeta**

| Archivo | Para qué |
| --- | --- |
| `GUIA-DE-ESTILO.md` | Este documento. |
| `manual.css` | La hoja de estilo: tokens, paleta partida, pasos, boleto, estados. Es la única fuente de las clases que se nombran abajo. |
| `manual-prototipo.html` | Las seis páginas de la propuesta, compiladas. Es la plantilla viva: se copia un bloque `<section class="sheet">` y se cambia el contenido. |
| `manual-uso-portal-prototipo.pdf` | Cómo se ve impreso. |
| `assets/` | Logo UDES y las dos expresiones aprobadas de Mr. Pilo (`feliz`, `idea`). No se redibujan ni se estiran. |

El diseño vive también como lienzo editable: <https://claude.ai/artifact/KamSvLgdScg6cmM8s46yMa> (privado; se comparte desde su menú «Share»).

---

## 1. La idea: el tablero de llegadas

El portal ya tiene un mundo visual propio (`DESIGN.md`, «El tablero de llegadas de la universidad»). El manual lo hereda y lo convierte en una guía de viaje: **cada capítulo es un destino y cada página dice en qué ruta del portal está.**

Cinco decisiones que no se negocian:

1. **La ruta va en paleta partida.** `/pdi`, `/datos-abiertos`, `/pregunta` se dibujan con celdas de Barlow Condensed, no con texto corriente. Es lo que hace reconocible el manual.
2. **El capítulo se encuentra por la posición, no por el color.** La pestaña del borde lleva solo el número, y baja 78 px por capítulo.
3. **El ámbar es de lo nuevo.** Solo marca la edición y el capítulo que se abre. No decora.
4. **Una cifra siempre dice de dónde sale.** La nota «Fuente y corte» (el boleto perforado) acompaña a toda página que explique cifras. Un dato que falta es «sin reportar», nunca cero.
5. **Nada se dice solo con color.** Estados con glifo y palabra; informes con su código de dos letras; pestañas con número.

---

## 2. Estructura del manual

| N.º | Capítulo | Ruta | Tipo de contenido |
| --- | --- | --- | --- |
| 01 | Antes de empezar | — | Qué es el portal, a quién sirve, cómo leer el manual |
| 02 | Portal de Planeación Institucional | `/` | Buscador, mosaico de portales, lo más reciente, equipo (`/equipo`) |
| 03 | Portal PDI | `/pdi` | Pilares, áreas, líneas, proyectos, indicadores, ODS, facultades, campus |
| 04 | UDES en Cifras | `/datos-abiertos` | Los once informes y cómo leer una cifra |
| 05 | Mr. Pilo | `/pregunta` | Preguntar, entender la respuesta, la app |
| 06 | Intranet | `/admin` | Captura, validación y publicación (personal de Planeación) |
| 07 | Alertas de emergencia | — | Qué ve la persona cuando Aluna declara una emergencia |
| 08 | Ayuda y glosario | — | Términos, contactos, preguntas frecuentes |

**Orden de un capítulo:** apertura → páginas de procedimiento y de referencia → (opcional) página de preguntas frecuentes del capítulo. Las páginas de apertura van siempre en página impar.

**Orden del libro:** portada · contenido · capítulos 01–08 · contraportada. Folios en cifras de dos dígitos (`02`, `18`); la portada no lleva folio.

---

## 3. Formato de página

- **Tamaño:** A4 vertical, 794 × 1123 px (a 96 px/in). 1 pt = 4/3 px; 1 mm ≈ 3,78 px.
- **Márgenes:** 72 px (19 mm) por los cuatro lados. Nada de texto fuera de ellos.
- **Cabeza corriente:** a `top: 30px`, alto 42 px, filete inferior de 1 px. A la izquierda, la **ruta del capítulo** en paleta partida oscura (18 px); a la derecha, «Manual de uso · Portal de Planeación Institucional» (12 px).
- **Pie:** a `bottom: 30px`, alto 40 px, filete superior de 1 px. El **folio va al borde exterior**: derecha en páginas impares, izquierda en pares. Del otro lado, «Capítulo N · **Nombre**».
- **Pestaña del borde:** 30 × 66 px, navy, con el número del capítulo en Barlow 24 px. Posición: `top = 100 + (N − 1) × 78` px. Derecha en impares (`class="tab"`), izquierda en pares (`class="tab l"`).
- **Contenido:** entre `top: 104px` (título) y `top: 1040px`. El pie empieza en 1053 px: no se invade.
- **Sangrado:** portada, apertura y contraportada llegan al borde. En el archivo de imprenta, 3 mm de sangrado; el prototipo no lo trae.

### Espacio vertical de una página de procedimiento (referencia)

| Zona | Desde | Alto |
| --- | --- | --- |
| Título (Fraunces 40) | 104 | ~50 |
| Párrafo de entrada (17 px) | 160 | 2 líneas |
| Captura con marcas | 226 | ~320 |
| Pasos (4) | 554 | ~270 |
| Fila inferior (estados + consejo de Pilo) | 892 | ~120 |

Más de cuatro pasos por página: se parte en dos páginas, no se reduce la letra.

---

## 4. Tipografía

Las tres familias ya cargan en el portal. En el manual se piden por Google Fonts (`Barlow Condensed 600/700`, `Fraunces 500/700`, `Manrope 500–800`); sin red, el PDF sale con la letra de reserva y se ve distinto.

| Uso | Familia y peso | px / pt |
| --- | --- | --- |
| Portada | Fraunces 700 | 88 / 66 |
| Apertura de capítulo | Fraunces 700 | 72 / 54 |
| Título de página (`.h1`) | Fraunces 700, −0,028 em | 40 / 30 |
| Título de paso (`.h3`) | Manrope 800 | 16 / 12 |
| Cuerpo | Manrope 500, interlineado 1,55 | 16 / 12 |
| Párrafo de entrada (`.lead`) | Manrope 500 | 17–18 |
| Descripción | Manrope 500 | 14 / 10,5 |
| Pie y notas (`.cap`) | Manrope 600 | 12 / 9 (**mínimo**) |
| Número de capítulo, folio, ruta | Barlow Condensed 700, en celdas | 14–290 |
| Rótulos de columna (`.sign`) | Barlow Condensed 600, mayúsculas, +0,08 em | 14 |

Reglas: cuerpo nunca menor de 12 pt; párrafos largos en una columna de 600 px como máximo (unos 75 caracteres); `text-wrap: balance` en títulos y `pretty` en párrafos; numerales tabulares siempre.

---

## 5. Color

Los valores están como variables en `manual.css`. **No se inventan colores.**

| Rol | Variable | Valor | Contraste sobre papel |
| --- | --- | --- | --- |
| Títulos, portada, números | `--navy` | `#0a2d63` | 13,4:1 |
| Tablero de portada y contraportada | `--navy-deep` | `#061e46` | — |
| Franja del logo | `--page` | `#f4f7fb` | — |
| Texto principal | `--ink` | `#0d1c31` | 17,1:1 |
| Descripciones | `--ink-2` | `#45566d` | 7,5:1 |
| Notas y pies (el gris más claro permitido) | `--ink-3` | `#5b6c83` | 5,4:1 |
| Lo recién llegado | `--signal` | `#f6b93f` (tinta `#1d1402`, 10,3:1) | — |
| Nota «Fuente y corte» | `--ticket` | `#eef2f8` | — |
| Estados | `--done` · `--pending` · `--risk` | `#0d6a2e` · `#8a5f00` · `#b52e2e` | ≥ 4,5:1 sobre su fondo suave |
| Once informes | `--od-line-1…11` | `#1f5fbf #0b7481 #a4471f #6b3fa0 #7f6200 #ad2f58 #43536b #2e6b2f #8a3b8f #1a6b5a #7a4a2b` | ≥ 5,5:1 con tinta blanca |

El azul institucional `#2166d6` es el color de la acción en pantalla; en papel casi no se usa.

**Verde, ámbar y rojo de estado nunca se usan para otra cosa** (ni series ni adorno).

---

## 6. Componentes

Todos están en `manual.css`. Pegar tal cual.

### 6.1 Ruta y números en paleta partida

Una celda por carácter. La clase `d` es la variante oscura para papel; sin `d`, la clara para fondos navy. Se cambia el tamaño con `font-size` en el contenedor `.fls`.

```html
<span class="fls" style="font-size: 18px">
  <span class="fl d">/</span><span class="fl d">p</span><span class="fl d">d</span><span class="fl d">i</span>
</span>
```

- Rutas en minúscula tal como existen en el portal; la hoja las muestra en mayúscula.
- `fl s` es una celda angosta (para signos como `/`, `.`). `fl sg` es la celda ámbar.
- Folio y número de capítulo: dos celdas siempre (`0` `9`).

### 6.2 Paso numerado

```html
<div class="step">
  <span class="dot">1</span>
  <div>
    <div class="h3">Abra el Portal PDI</div>
    <p>Escriba <span class="rt">planeacion.udes.edu.co/pdi</span> en el navegador.</p>
  </div>
</div>
```

Un paso = un verbo en imperativo de «usted» + una acción. Título de una línea; texto de una o dos.

### 6.3 Captura de pantalla con marcas

La marca sobre la captura y el paso del texto llevan **el mismo número**. La barra superior muestra la dirección real de la pantalla.

```html
<div class="shot" style="position: absolute; left: 72px; right: 72px; top: 226px">
  <div class="shot-bar"><span class="shot-url">planeacion.udes.edu.co/pdi</span></div>
  <div class="shot-body" style="height: 280px"><img src="…" alt="Descripción de lo que se ve"></div>
  <span class="dot" style="left: 56px; top: 120px">2</span>
</div>
```

Mientras no haya captura real, el cuerpo lleva el rótulo `[CAPTURA DE PANTALLA · Portal · pantalla]` sobre el rayado.

### 6.4 Boleto «Fuente y corte»

```html
<div class="ticket">
  <b>Fuente y corte</b> Cada cifra dice qué oficina la reporta, para qué campus y a qué corte corresponde.
</div>
```

Otros rótulos válidos: «Antes de empezar», «Tenga en cuenta». No más de un boleto por página.

### 6.5 Estados

Siempre con glifo y palabra. Los tres SVG están en `manual-prototipo.html`, página 4.

```html
<span class="st ok"><svg …/>Completo</span>
<span class="st pe"><svg …/>Pendiente</span>
<span class="st ri"><svg …/>En riesgo</span>
```

### 6.6 Código de informe

```html
<span class="cd" style="background: #1f5fbf">PO</span>
```

El color es el de su línea (sección 5); el código de dos letras nunca se omite.

### 6.7 Consejo de Mr. Pilo

Un recuadro `#eaf1fd` con la expresión **aprobada** `idea-320.webp` (70 × 98 px, `object-fit: contain`), un título («Consejo de Mr. Pilo») y una frase corta que remite a `/pregunta`. Máximo uno por página. No se redibuja ni se recorta a Pilo.

### 6.8 Direcciones en el texto

`<span class="rt">planeacion.udes.edu.co/pdi</span>`. Se escribe la dirección completa la primera vez y solo la ruta después.

### 6.9 Pestaña y apertura

Ver la sección 3. En la apertura la pestaña va en ámbar (`style="background:#f6b93f;color:#1d1402"`) porque es el capítulo que se abre.

---

## 7. Plantillas de página

Se copian de `manual-prototipo.html` (cada `<section class="sheet">` es una página).

| Página | Cuándo | Anatomía |
| --- | --- | --- |
| **Portada** | Una | Franja clara con logo (nunca sobre navy) · «Manual de uso» (Fraunces 88) · subtítulo · tablero de cuatro destinos con ruta, nombre y página · pie con la edición en ámbar. |
| **Contenido** | Una, o dos si hay subcapítulos | Título · una fila por capítulo: número oscuro, título 19 px, una línea de descripción, ruta pequeña (14 px) y página. Nota «Prototipo» solo mientras la paginación no sea final. |
| **Apertura de capítulo** | Una por capítulo, en impar | Bloque navy de 640 px · número en paleta partida de 290 px · título Fraunces 72 · ruta con su dirección · párrafo de entrada · «En este capítulo» con páginas. |
| **Procedimiento** | Pasos con captura | Cabeza con ruta · título · párrafo · captura con marcas · 3–4 pasos · fila inferior (estados o consejo de Pilo). |
| **Referencia** | Tablas, listas de informes, glosario | Título corto · párrafo · tabla con rótulos `.sign` y filetes de 1 px · boleto «Fuente y corte». |
| **Contraportada** | Una | Navy profundo · «¿Le queda una duda?» · Pilo (`feliz`) · contacto · QR · edición · franja clara con logo abajo. |

---

## 8. Voz y redacción

- **Trato de «usted».** «Abra», «Elija», «Verá». Nunca «tú», nunca «el usuario».
- **Verbo primero.** El título de cada paso empieza con un verbo en imperativo: «Abra», «Elija», «Lea», «Descargue».
- **Frases cortas.** Una idea por frase; la instrucción antes que la explicación.
- **El nombre de lo que se ve en pantalla va tal cual está en pantalla**, entre comillas angulares si es un botón: «Descargar informe».
- **Se explica de dónde sale cada número.** Si una página habla de una cifra, nombra la oficina que la reporta y el corte.
- **Lo que no se sabe se marca.** `[CORREO DE CONTACTO]`, `[QR al portal]`, `[CAPTURA DE PANTALLA · …]`. **Nunca** una cifra, un teléfono o una fecha inventados.
- **Las cifras de ejemplo** llevan la leyenda «Dato ilustrativo».
- **Estados con su palabra:** completo, pendiente, en riesgo. «Sin reportar» no es cero.
- **Sin adornos:** nada de «¡Bienvenido!», emojis ni exclamaciones. Sobrio y claro, como el portal.
- **Términos del portal:** «pilar», «área estratégica», «línea de acción», «proyecto», «indicador», «informe», «corte». Usar siempre el mismo.

---

## 9. Capturas de pantalla

1. Tema claro, ventana de 1280 px de ancho, sin barras de extensiones.
2. **Datos reales solo si son públicos.** Nada de correos, cédulas ni nombres de estudiantes. En la intranet, usar datos de prueba.
3. Una captura por paso clave, no por clic. Recortar a la parte útil.
4. Las marcas numeradas coinciden con los pasos del texto.
5. Cada imagen lleva texto alternativo que describe lo que se ve y qué hay que mirar.
6. Resolución mínima para imprimir: 150 ppp al tamaño final (≈ 1000 px de ancho para una captura de ancho completo).

---

## 10. Cómo se genera el PDF

1. Copiar las páginas que se necesiten a un HTML con la misma cabecera de `manual-prototipo.html` (incluye `manual.css`, las fuentes y `@page { size: 794px 1123px; margin: 0 }`).
2. Imprimir con Chrome, con red (las fuentes se piden a Google Fonts):

```bash
chrome --headless=new --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=15000 \
  --print-to-pdf=manual.pdf "file:///RUTA/manual-prototipo.html"
```

3. Abrir el PDF y comprobar: número de páginas, que ninguna página se desborde, que las imágenes carguen y que la letra sea Fraunces/Manrope/Barlow (no la de reserva).

Para la imprenta: pedir CMYK y 3 mm de sangrado; la conversión se hace en el taller o en un programa de maquetación, no en el HTML.

---

## 11. Lista de revisión antes de dar una página por buena

**Contenido**
- [ ] El título dice qué se logra («Consultar el avance de un pilar»), no el nombre de la pantalla.
- [ ] Cada paso empieza con un verbo y cabe en dos líneas.
- [ ] Toda cifra dice oficina y corte, o la página lleva el boleto.
- [ ] No hay datos personales ni cifras inventadas; lo pendiente está entre corchetes.
- [ ] Los nombres coinciden con los de la pantalla.

**Diseño**
- [ ] Márgenes de 72 px; nada invade cabeza ni pie.
- [ ] Ruta del capítulo en la cabeza, folio al borde exterior, pestaña en su posición.
- [ ] Máximo un boleto y un consejo de Pilo por página.
- [ ] Ningún texto menor de 12 px ni más claro que `#5b6c83`.
- [ ] Trazos de 1 px o más.

**Accesibilidad e impresión**
- [ ] Se entiende en escala de grises (estados con glifo y palabra, informes con código).
- [ ] Toda imagen tiene texto alternativo.
- [ ] Contraste de texto ≥ 4,5:1.
- [ ] El PDF abre con todas las páginas y las imágenes visibles.

---

## 12. Qué no hacer

- No usar tarjetas de ícono + título + texto como estructura de página.
- No poner una etiqueta pequeña encima de un título (los títulos hablan solos).
- No colorear un borde lateral de una nota; la nota es el boleto.
- No usar gradientes, sombras duras, vidrio ni emojis. El único rayado permitido es el del marcador de captura.
- No redibujar ni deformar a Mr. Pilo; solo las expresiones aprobadas de `assets/`.
- No poner el logo sobre azul: va sobre la franja clara.
- No reutilizar el verde, el ámbar o el rojo de estado como adorno.
- No numerar secciones dentro de un capítulo: la numeración es solo de capítulos y pasos.

---

## 13. Pedido listo para un agente de IA

Pegar al inicio de la conversación, con el material de la página al final:

```text
Vas a redactar y maquetar UNA página del «Manual de uso del Portal de Planeación
Institucional» de la Universidad de Santander. Sigue al pie de la letra
docs/manual/GUIA-DE-ESTILO.md y usa docs/manual/manual.css y la plantilla de
docs/manual/manual-prototipo.html. No inventes colores, componentes ni cifras.

Reglas clave:
- Página A4 de 794 × 1123 px, márgenes de 72 px, cabeza y pie como en la guía.
- Trato de «usted», verbo en imperativo al inicio de cada paso, frases cortas.
- La ruta del capítulo va en paleta partida (clases .fls/.fl d) en la cabeza.
- Folio al borde exterior (derecha en impar, izquierda en par); pestaña del capítulo
  en top = 100 + (N − 1) × 78 px.
- Toda cifra dice oficina y corte, o la página lleva el boleto «Fuente y corte».
- Estados con glifo y palabra; informes con código de dos letras.
- Lo que no tengas va entre corchetes: [CAPTURA DE PANTALLA · …], [CORREO DE CONTACTO].
- Entrega solo el bloque <section class="sheet">…</section> listo para pegar, y una
  lista corta de lo que quedó pendiente de reemplazar.

Datos de la página:
- Capítulo (número y nombre):
- Ruta del portal:
- Número de página (folio):
- Qué logra la persona al terminar:
- Pasos o contenido:
- Capturas disponibles:
```

---

## 14. Pendiente de la propuesta

- Paginación real y texto de todos los capítulos.
- Capturas de pantalla, QR, correo y teléfono de contacto.
- Capítulo 07 «Alertas de emergencia»: documentar con las pantallas reales (alerta de pantalla completa, franja, «Todo está bien», simulacro y la sección «Emergencias» del admin de Pilo).
- Archivo de imprenta: 3 mm de sangrado y CMYK.
- Decidir si el manual se publica también en el portal como página descargable.
