# Requisitos · Exportar conjuntos visuales en CSV

## Petición original
> tenemos que habilitar acciones para que todos los tipos de conjuntos visuales puedan exportar los datos en CSV con una pequeña opción debajo de cada dato dentro del portal correspondiente y también en la opción global con un selector de lo que sí o no descargar

## Objetivo
1. **Por conjunto**: cada conjunto visual publicado ofrece una acción pequeña «CSV» justo debajo de sus datos (junto a la línea «Reporta: …»), que descarga los datos de ese conjunto.
2. **Global**: el botón «CSV» de la barra de la ficha (`od-report-bar__downloads`) deja de bajar solo los indicadores y abre un selector con casillas: qué conjuntos del informe se descargan y cuáles no.

## Alcance (tipos de conjunto)
Portal UDES en Cifras (`src/modules/datos-abiertos`, ficha `OpenDataReport.tsx`):

| Bloque | Dato | Hoy |
|---|---|---|
| kpis / evolucion / tabla_dinamica | `Indicator[]` | CSV global de indicadores; tabla dinámica baja «esta vista» |
| desgloses | `Breakdown` | ya tiene «Descargar CSV» dentro de «Ver datos por corte» (respeta reserva `< n`) |
| mapa (origen, cobertura, entrante, saliente, convenios, municipio) | `MapDataset` (+ `reserved`) | nada |
| tuberia | `PipelineData` | nada |
| historico | `HistoryData` | nada |
| mapa_calor | `HeatmapData` | nada |
| tabla | `TableData` | nada |
| rankings | `RankingData` (ediciones, estrellas, ODS, materias) | nada |
| medallero | `MedalBoard` | nada |
| saber_pro | `SaberProData` | nada |
| saber_tyt | `SaberTytData` (beta + alpha) | nada |
| libre | `FreeSet` | nada |
| diversidad | indicadores + desgloses + calor + mapa por claves fijas | nada |
| modelo | `ModelData` (coeficientes, ajuste, clasificación, muestra) | nada |

Sin datos que exportar: separador, imagenes, metodologia.

Otros portales con conjuntos (misma acción bajo cada dato):
- Observatorio (`LiveTopic.tsx`, `Observatory.tsx`): ya hay CSV, pero en `actions` del marco y, en los ejemplos, sin BOM ni escape. Unificar.
- Tableros de unidad (`tableros/BoardPage.tsx`): sin CSV; usa `ChartFrame` + `ObsDataset`.

Fuera de alcance: Impacto (gráficas propias, sin `ChartFrame`), boletín (solo PDF), intranet de captura.

## Restricciones
- Formato ya establecido: separador `;`, BOM, coma decimal, vacío para `null` (Excel en español). Un solo serializador, no un cuarto `escape` copiado.
- **Reserva estadística**: el CSV no puede decir lo que la ficha calla (`< n` en desgloses, `reserved` en mapas por municipio).
- `null` ≠ 0: no reportado se exporta vacío.
- Solo frontend: sin migraciones, sin cambios de esquema ni de RLS. Los datos ya están en el catálogo público cargado.
- Accesible (botón con nombre propio por conjunto, selector operable por teclado), y la acción no sale en la imagen exportada (`data-export-ignore`).
- Sigue DESIGN.md y las clases `od-*` existentes.

## Supuestos (a confirmar en la aprobación del plan)
- A1. El CSV de un conjunto baja **todo el conjunto** (todos los años/campus), no solo el corte en pantalla. Es lo que hace hoy el CSV global; la «vista actual» ya la cubre la tabla dinámica.
- A2. La descarga global con varios conjuntos produce **un .zip con un CSV por conjunto** (`fflate` ya es dependencia); con uno solo, el CSV directo.
- A3. «Portal correspondiente» = UDES en Cifras, Observatorio y Tableros.
- A4. El selector parte con todo marcado y agrupa por tipo de conjunto.

## Criterios de aceptación
- Cada bloque con datos de la ficha muestra la acción CSV bajo sus datos y descarga un archivo que abre bien en Excel es-CO.
- El selector global lista exactamente los conjuntos visibles del informe, permite marcar/desmarcar (todos/ninguno) y descarga solo lo marcado.
- Ninguna celda reservada aparece con su número en ningún CSV.
- Pruebas vitest (entorno node) para cada serializador; `npm run build` y `npm test` pasan.

## Puntuación de completitud: 7,5 / 10
Objetivo 3/3 · Resultado esperado 2/3 · Alcance 1,5/2 · Restricciones 1/2 → continúa.

## Instrucción añadida por el usuario (2026-10-01)
> usa las skills de impeccable y gsap para animaciones y diseño ten eso en cuenta

- Diseño con la skill `impeccable` (contexto PRODUCT.md + DESIGN.md cargado; modo Operate; mundo «tablero de llegadas»: señalética condensada, ámbar de señal solo para la acción principal, boletos de origen).
- Movimiento con GSAP (`gsap` + `@gsap/react` ya son dependencias; hoy no se usan en `datos-abiertos`). No hay una skill llamada «gsap» instalada: se siguen `impeccable animate` y los patrones GSAP del repo (`src/modules/reportes/movimiento.ts`).
- `prefers-reduced-motion` obligatorio; la animación confirma una acción o explica un cambio de estado, no decora.
