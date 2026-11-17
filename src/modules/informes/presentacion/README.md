# Presentación con Pilo

Botón **«Crear presentación con Pilo»** en la vista del informe (`vista/VistaInforme.tsx`) y en la revisión
(`ui/Revision.tsx`). Pilo arma una presentación a partir del informe, **siempre con Pilo Astra 1.0**, y la dibuja
sobre la plantilla institucional «Bucaramanga Plantilla Presentación 2026».

## Piezas

| Qué | Dónde |
| --- | --- |
| Función de borde | `supabase/functions/pilo-presentaciones/` (`index.ts` solo conecta; `handler.ts` es el manejador) |
| Esquema cerrado y validación | `…/esquema.ts` (11 tipos, campos acotados, reparto de tablas de más de 8 filas) |
| Anti-invención | `…/verificar.ts` (cada cifra y enlace debe estar en el informe; lo demás queda «[por completar]» y se informa en `no_verificado`) |
| Voces | `…/tonos.ts` (institucional, cercano, ejecutivo, académico) |
| Prompts | `…/prompt.ts` |
| Llamada a Astra (SSE, `reasoning_content`) | `…/astra.ts` |
| Cliente SSE | `presentaciones.ts` · hook `usePresentacion.ts` |
| Persistencia | `datos.ts` + migración `0284_informe_presentaciones.sql` |
| Visor | `Visor.tsx` (miniaturas, teclado, presentar, edición en línea, PDF) · `Laminas.tsx` (una por tipo) · `presentacion.css` |
| Animaciones | `animar.ts` (GSAP por import dinámico; ≤ 700 ms; respeta «reducir movimiento») |
| Fondos | `public/presentaciones/fondo1..6.jpg` (1 portada · 2 franja · 3 banda larga · 4 banda corta · 5 sección · 6 cierre) |
| Datos de ejemplo | `ejemplo.ts` |

## Reglas que conviene no romper

- **Solo Astra.** Si `pw_config.astra_habilitado` es falso o falta dirección, modelo o clave, la función responde
  `astra_apagado` (503); nunca cae a otro modelo.
- **El servidor no se fía del cliente para permisos**: exige sesión y pregunta a la base (`informe_instancia_visible`)
  con el token de la persona. Límite por persona y hora: `pw_config.astra_limite_hora`.
- **No inventar.** El prompt lo prohíbe y `verificar.ts` lo comprueba (números y enlaces). No comprueba nombres
  propios ni cifras escritas con letras.
- Títulos de la banda: hasta 28 caracteres; la banda corta (fondo 4) solo con 10 o menos.
- El contenido no pasa de y≈900 (el logo de la plantilla ocupa la esquina inferior derecha): `Flujo` en `Laminas.tsx`
  achica hasta un 60 % lo que no quepa.

## No incluido en esta fase

- **Exportar a `.pptx`.** Hoy se exporta con «PDF / Imprimir» (16:9, `@page 1920×1080 px`). Para `.pptx` habría que
  mapear cada tipo de diapositiva a objetos de PowerPoint (por ejemplo con `pptxgenjs`), usando los mismos fondos.
- Presentar con notas del orador en una segunda ventana.
