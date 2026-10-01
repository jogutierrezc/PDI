# Análisis · Exportar conjuntos visuales en CSV

Dos análisis independientes (datos/arquitectura y UI/UX). Los modelos externos no estuvieron disponibles
(`agy` no instalado; `codex` configurado con `gpt-5.4-mini`, que la cuenta no admite), así que ambos
los hicieron subagentes de Claude en contextos separados.

## Hallazgos que condicionan el diseño

### Datos
- Hay seis escritores de CSV con su propio `escape`; ninguno protege contra inyección de fórmulas y
  discrepan en BOM y decimales. `Observatory.tsx:471` no escapa ni pone BOM; `LiveTopic.tsx:22` pierde el año.
- `sheet.ts` (`toCsv`/`parseCsv`/`parseNumber`) **no se toca**: las plantillas de captura se reimportan.
- Nada enumera «los conjuntos que la ficha muestra»: la lógica vive dentro de `renderBlock`
  (`OpenDataReport.tsx:204-596`) y en parte en `groups.ts`.
- `open-data.ts` importa `repository.ts` → `lib/supabase` (`import.meta.env`): un serializador probado en
  node no puede importarlo. Hay que extraer `valueOf`, `formatReserved`, `slugify` a módulos puros.
- `fflate` no está en el chunk público: se carga con `import()` dinámico al hacer clic.

### Reserva estadística (lo que un CSV ingenuo filtraría)
1. `BreakdownItem` puede traer `value` no nulo con `reserved: true` (`repository.ts:444-451`). Regla: nunca leer `.value` si `.reserved`.
2. La columna `Total` del CSV actual de desgloses (`BreakdownChart.tsx:133`) permite despejar la celda reservada por resta. Regla: ningún total calculado en ningún CSV.
3. La clave `ALL_YEARS` es derivada (promedios) y en desgloses ignora `reserved`. Regla: no se exporta, salvo mapas `reporting: "global"`.
4. Mapa por municipio: las filas de departamento contienen a las personas de los municipios reservados. Regla: solo filas de 5 dígitos + reservadas como `< 5`.
5. `MapDataset.reserved` en otros modos no se pinta en pantalla. Regla: se omite.
6. Saber PRO / TyT no tienen bandera de reserva; histogramas y nubes por programa con 1 evaluado identifican a una persona.

### UI
- `ChartFrame` solo pinta el pie si hay `source`; `.od-frame` tiene `overflow:hidden` (un popover se recorta).
- La barra del informe es `sticky`, se pliega sola a los 480 px y oculta su contenido: ni panel en línea ni popover sirven.
- `Modal` (`components/ui`) ya es compartido con el público (`PillarViewer`), con trampa de foco, Escape y tema oscuro.
- Cuatro bloques no tienen marco: KPI, medallero, placas de rankings, tabla de origen de conjuntos libres.
- `KpiBoard`: cada celda es un `<button>`; la acción va bajo la rejilla.
- Botones a retirar por duplicados: `BreakdownChart.tsx:350`, `LiveTopic.tsx:59`, `Observatory.tsx:490`. «Descargar esta vista» de la tabla dinámica se queda (baja otra cosa).
- El boletín no usa `ChartFrame`: no ve la acción mientras no entre en `FreeChart` ni `LeakyPipeline`.

## Alternativas

### Arquitectura de datos
| | Descripción | A favor | En contra |
|---|---|---|---|
| **A (elegida)** | Constructores puros `xToTable()` + un único escritor + registro `reportExports()` | Probable en node; un solo punto de control de la reserva; la acción por bloque y el selector comparten entradas | El registro replica reglas de `renderBlock` → se mitiga moviendo `orderedBlocks`/`pairedMaps`/`lastFreeBlock` a `groups.ts` y haciendo que la ficha los consuma |
| B | Cada componente registra su CSV por contexto | La visibilidad es lo que se montó | Lógica en `.tsx` (vitest solo corre `*.test.ts`); reserva repartida en 14 componentes; orden dependiente del montaje |
| C | Modelo de tabla compartido entre pantalla y CSV | El CSV es la página por construcción | Refactor grande de componentes que funcionan |
| D | XLSX con una hoja por conjunto | Resuelve ceros a la izquierda y fórmulas | Contradice el pedido (CSV); exceljs pesa en el chunk público |

### Acción por conjunto
| | | |
|---|---|---|
| Solo prop en `ChartFrame` | Un sitio | Deja fuera 4 bloques sin marco |
| Solo `<CsvAction>` suelto | Libre | ~35 sitios a mano; fácil olvidar `data-export-ignore` |
| **Ambos (elegida)** | `ChartFrame csv={…}` pinta `<CsvAction>` en el pie; los 4 bloques sin marco lo usan directo | Dos entradas, un solo componente visual |

### Selector global
| | | |
|---|---|---|
| **Modal (elegida)** | Foco, Escape, móvil resueltos; no depende de la barra | Primer modal del portal |
| Panel en la barra | Sin capa | Se cierra al desplazarse; en móvil tapa la pantalla |
| Popover | — | Lo recorta `overflow:hidden`; sería reinventar el modal |

### Descarga múltiple
Zip con `fflate` dinámico (elegida) · CSV combinado (rompe los esquemas) · descargas en serie (el navegador las bloquea).
