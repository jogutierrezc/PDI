# Presentación con Pilo

Botón **«Crear presentación con Pilo»** en la vista del informe (`vista/VistaInforme.tsx`) y en la revisión
(`ui/Revision.tsx`). Pilo arma una presentación a partir del informe, **siempre con Pilo Astra 1.0**, y la dibuja
sobre la plantilla institucional «Bucaramanga Plantilla Presentación 2026».

## Piezas

| Qué | Dónde |
| --- | --- |
| Función de borde | `supabase/functions/pilo-presentaciones/` (`index.ts` solo conecta; `handler.ts` es el manejador) |
| Esquema cerrado y validación | `…/esquema.ts` (12 tipos, campos acotados y tolerantes: se recorta y se anota, no se rechaza; reparto en láminas «parte n de m» de tablas, texto largo y listas) |
| Anti-invención | `…/verificar.ts` (cada cifra, enlace y valor de gráfica debe estar en el informe; lo demás queda «[por completar]» y se informa en `no_verificado`) |
| Voces | `…/tonos.ts` (institucional, cercano, ejecutivo, académico) |
| Prompts | `…/prompt.ts` |
| Llamada a Astra (SSE, `reasoning_content`) | `…/astra.ts` |
| Cliente SSE | `presentaciones.ts` · hook `usePresentacion.ts` |
| Persistencia | `datos.ts` + migración `0284_informe_presentaciones.sql` |
| Visor | `Visor.tsx` (miniaturas, teclado, presentar, edición en línea, PDF) · `Laminas.tsx` (una por tipo) · `presentacion.css` |
| Animaciones | `animar.ts` (GSAP por import dinámico; ≤ 700 ms; respeta «reducir movimiento») |
| Fondos | `public/presentaciones/fondo1..6.jpg` (1 portada · 2 franja · 3 banda larga · 4 banda corta · 5 sección · 6 cierre) |
| Datos de ejemplo | `ejemplo.ts` |

## Contenido completo (no resumido)

- **El informe viaja entero.** `modelo.ts › informeParaPresentacion` solo aligera si pasa de 300 KB, y pierde lo menos posible
  (matriz y UDrive, detalle redundante, textos larguísimos, y solo al final bloques y alineación). El servidor lo compacta
  (`prompt.ts › compactarInforme`) a `PRESUPUESTO_INFORME` (60 000 caracteres) recortando primero listas y luego textos
  (`TEXTO_LARGO` = 3 000). Ese tope sale del contexto de Astra (32 768 tokens): instrucciones ≈ 3 000, informe ≈ 18 000 y
  respuesta ≈ 10 000. Subirlo sin subir el contexto de Astra ahoga la respuesta.
- **Narración fiel.** El prompt pide cubrir cada sección y llevar los textos casi tal cual. Lo que no cabe en una lámina
  sigue en otra: `repartirTextos` (≈ 12 líneas por lámina de texto, cortando entre frases), `repartirTablas` (8 filas) y
  `repartirListas` (4 tarjetas/cifras/logros, 6 filas de cumplimiento o anexos, 10 barras, 8 columnas). Las continuaciones
  llevan `parte: {n, de}` y el visor escribe «Parte n de m». Una narración metida en una tarjeta o un logro pasa entera a
  una lámina de texto.
- **Gráficas** (`grafica`): `forma` = barras | columnas | dona | progreso; `series` = `{etiqueta, valor (número), meta?, unidad?}`.
  `verificar.ts` quita la serie cuyo valor o meta no esté en el informe (y la lámina si no queda ninguna). El SVG está en
  `Laminas.tsx`; las medidas puras, en `modelo.ts`. Texto accesible: rótulo del grupo y tabla de datos solo para lectores.

## Reglas que conviene no romper

- **Solo Astra.** Si `pw_config.astra_habilitado` es falso o falta dirección, modelo o clave, la función responde
  `astra_apagado` (503); nunca cae a otro modelo.
- **El servidor no se fía del cliente para permisos**: exige sesión y pregunta a la base (`informe_instancia_visible`)
  con el token de la persona. Límite por persona y hora: `pw_config.astra_limite_hora`.
- **No inventar.** El prompt lo prohíbe y `verificar.ts` lo comprueba (números y enlaces). No comprueba nombres
  propios ni cifras escritas con letras.
- Compatibilidad: los tipos y campos nuevos son opcionales y los límites solo se relajaron; una presentación guardada con el esquema anterior abre igual.
- Títulos de la banda: hasta 28 caracteres; la banda corta (fondo 4) solo con 10 o menos.
- El contenido no pasa de y≈900 (el logo de la plantilla ocupa la esquina inferior derecha): `Flujo` en `Laminas.tsx`
  achica hasta un 60 % lo que no quepa.

## No incluido en esta fase

- **Exportar a `.pptx`.** Hoy se exporta con «PDF / Imprimir» (16:9, `@page 1920×1080 px`). Para `.pptx` habría que
  mapear cada tipo de diapositiva a objetos de PowerPoint (por ejemplo con `pptxgenjs`), usando los mismos fondos.
- Presentar con notas del orador en una segunda ventana.
