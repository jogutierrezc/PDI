# Plan · Exportar conjuntos visuales en CSV

Base: `src/modules/datos-abiertos` (= `DA`). Solo frontend, sin migraciones.

## Decisiones de arquitectura
1. **Un escritor, muchos constructores.** `DA/data/csv-export.ts`: `CsvTable { header; rows }`, `toCsvText()` (BOM, `;`, coma decimal, comillas en `; " \r \n`, guarda de fórmulas: texto que empieza por `= + - @` lleva `'`; los números nunca) y un `xToTable()` por tipo de conjunto.
2. **Un registro.** `DA/data/export-registry.ts`: `reportExports(report, catalog) → ExportEntry[]` (`id`, `kind`, `label`, `group`, `blockKey`, `files[{filename, build}]`). Lo consumen la acción de cada bloque y el selector global: la lista del selector es, por construcción, lo que la ficha pinta.
3. **Mismas reglas que la ficha.** `orderedBlocks`, `pairedMaps` y `lastFreeBlock` pasan de `OpenDataReport.tsx` a `groups.ts`; ficha y registro leen los mismos helpers.
4. **La reserva se decide en un solo sitio** (el serializador), con pruebas que buscan el número oculto en el texto final.
5. **`sheet.ts` no se toca** (ida y vuelta de las plantillas de captura).
6. **Zip perezoso.** `fflate` por `import()` dentro del clic; un solo conjunto marcado baja el CSV directo.

## Formato de cada CSV
| Conjunto | Forma | Columnas |
|---|---|---|
| Indicadores | ancha (la actual) | Informe; Clave; Indicador; Unidad; Campus; cortes…; Regla anual; Fuente |
| Desglose | larga | Desglose; Año; Periodo; Categoría; Valor; Reservado; Unidad; Fuente — sin `Total` |
| Mapa depto / país | larga | Mapa; (Sentido); Año; Campus; Código; Nombre; Valor; Unidad; Fuente |
| Mapa municipio | larga | …; DIVIPOLA; Municipio; Depto; Valor; Reservado — solo filas de municipio |
| Tubería | larga | Cohorte; Campus; N.º etapa; Etapa; Valor; Retiro del tramo; Causa principal |
| Histórico | larga | Periodo; Categoría; Valor; Unidad |
| Mapa de calor | ancha | fila × columnas (la matriz que se ve) |
| Tabla | ancha | sus columnas, orden de origen |
| Ranking | larga, un archivo | Ranking; Sistema; Año; Sección (General/Estrellas/ODS/Materia/Dato); Ítem; puestos; Puntaje… |
| Medallero | ancha | Año; Periodo; fila; un nivel por columna; Nota — sin total ni puesto |
| Saber PRO | larga | Año; Ámbito; Sede; Facultad; Programa; Competencia; Evaluados; Promedio; niveles; Pocos evaluados |
| Saber TyT | larga, 3 archivos | resultados (escalares + cuadrantes + transiciones) · curvas de referencia · modelos Alpha |
| Conjunto libre / Observatorio / Tablero | ancha | (Año); (Tipo de fila); columnas del conjunto; totales con `freeTotalAt` |
| Modelo | larga, un archivo | Sección (Coeficiente/Prueba conjunta/Ajuste/Clasificación/Muestra/Ficha); … |
| Diversidad | reutiliza los anteriores | sus indicadores, desgloses (periodo B), matriz INES y mapa por municipio |

El zip añade `LEEME.txt` (informe, corte publicado, formato, significado de vacío y de `< n`, fuente de cada archivo).
Nombres: `udes-en-cifras-{informe}.zip` · miembros `{nn}-{tipo}-{clave}.csv` · suelto `udes-en-cifras-{informe}-{tipo}-{clave}.csv`.

## Brief de diseño (impeccable · modo Operate)
- **Trabajo:** quien consulta una cifra quiere llevársela. La acción no compite con la gráfica: vive en el pie, junto a quien la reporta, como un talón del mismo boleto de origen.
- **Acción por conjunto:** fila de pie `Reporta: … ⟷ CSV`. Rótulo condensado en mayúsculas igual que `.od-export__option`, icono de 14 px, sin relleno ámbar (regla de la señal única), área táctil ampliada en punteros gruesos. Excluida de la imagen PNG/JPG. Nombre accesible «Descargar los datos de {título} en CSV».
- **Selector global:** `Modal` `size="form"`, cuerpo y pie `od-*`. Un `fieldset` por grupo (Indicadores · Desgloses · Mapas · Tablas y series · Rankings y medallero · Pruebas Saber y modelos · Diversidad), casillas nativas como `YearFilter`, «Marcar todos / Quitar todos», todo marcado al abrir. Pie fijo: contador (`aria-live`) + Cancelar + única acción ámbar («Descargar CSV» / «Descargar {n} archivos (.zip)»). Cero marcados → botón deshabilitado y el contador dice por qué.
- **Estados:** generando (`Preparando la descarga…`), listo, error (el modal no se cierra), informe sin conjuntos (botón de la barra deshabilitado con motivo).
- **Móvil:** el modal ya limita a 88vh; pie con botones apilados bajo 480 px.

## Movimiento (GSAP · `DA/components/csv-motion.ts`, patrón de `reportes/movimiento.ts`)
Tesis: el tablero confirma una salida, como confirma una llegada.
- **Momento focal — «salida confirmada»:** al descargar desde el selector, las filas marcadas se sellan una a una (barrido ámbar de izquierda a derecha, 35 ms de escalón, tope 420 ms) mientras el contador cuenta hasta «Listo: n archivos».
- **Continuidad:** al abrir, los grupos entran en cascada (8 px + fundido, 30 ms de escalón, tope 240 ms). «Marcar/Quitar todos» recorre las casillas con el mismo escalón corto.
- **Respuesta:** la acción «CSV» de cada conjunto voltea su rótulo a «Descargado» (160 ms, destello ámbar breve) y vuelve a «CSV» a los 2 s.
- **Presupuesto:** solo `transform` y `opacity`, `clearProps` al terminar, nada en bucle, interrumpible (`gsap.killTweensOf`).
- **Movimiento reducido:** sin desplazamiento ni cascada; el estado final aparece de una vez y el texto de estado sigue anunciándose.
- `DESIGN.md` se actualiza: hoy dice que GSAP vive solo en la intranet («nada más»).

## Pasos (por capas, archivos sin solaparse)

### Capa 1 · módulos puros
- **1a** `DA/data/slug.ts` (sale de `chart-export.ts`, reexportado), `DA/data/reserve.ts` (`formatReserved`, `RESERVE_DEFAULT`, `valueOf`; reexportados desde `open-data.ts`), `DA/data/download.ts` (`downloadBlob`, `downloadText`, `downloadZip` con `import("fflate")`).
- **1b** `DA/data/csv-export.ts` + `csv-export.test.ts`.
- **1c** `DA/data/groups.ts` (recibe `orderedBlocks`, `pairedMaps`, `lastFreeBlock`), `DA/data/export-registry.ts` + `export-registry.test.ts`.

### Capa 2 · piezas de interfaz
- **2a** `DA/components/CsvAction.tsx`, `ChartFrame.tsx` (prop `csv`, pie con `source || csv`), `chart-export.css`, `csv-motion.ts`.
- **2b** `DA/components/ExportSelector.tsx` + `export-selector.css`.

### Capa 3 · conexión
- **3a** `OpenDataReport.tsx`: registro, selector en la barra, `csv` en mapas, tubería, histórico, calor, evolución, tabla dinámica; `<CsvAction>` bajo el tablero de KPI.
- **3b** Bloques: `TableBlock`, `BreakdownChart` (retira su botón), `FreeSetBlock`, `RankingsBlock`, `MedalBoardBlock`, `SaberProBlock`, `SaberTytBlock`, `DiversityBoard`, `PredictiveModel`, `PivotTable` (cambia de escritor, conserva «Descargar esta vista»).
- **3c** Otros portales: `observatorio/LiveTopic.tsx`, `observatorio/Observatory.tsx`, `tableros/BoardPage.tsx`.

### Capa 4 · cierre
- `DESIGN.md` (acción CSV, selector, regla de movimiento).
- `npm test`, `npm run build`; revisión visual en escritorio y móvil (una ronda + una de confirmación).
- Puertas de calidad: `verify-security`, `verify-quality`, `verify-change`.

## Pruebas
- Escritor: BOM, separador, comillas, `1.5 → 1,5`, `-3` intacto, `null` vacío, guarda de fórmulas (`=1+1`, `+x`, `-x`, `@x`, `=145`), `< 5` intacto, ida y vuelta con `parseCsv`.
- Un `describe` por constructor con fixture mínimo.
- Reserva: `{value: 7, reserved: true}` nunca escribe `7`; `terms` reservado; municipio sin filas de departamento; modos no municipio omiten reservadas; `ALL_YEARS` omitido salvo `Dato global`; ninguna columna `Total`.
- Registro: orden por defecto, bloque oculto, mapas emparejados, municipio + diversidad, conjunto libre con vistas propias, tipos suprimidos dentro de puntos, ids y nombres únicos.

## Riesgos
| Riesgo | Mitigación |
|---|---|
| El registro se desvía de `renderBlock` | Helpers compartidos en `groups.ts` + prueba de registro |
| Fuga de reserva | Un solo punto de control + pruebas que buscan el número |
| Códigos DANE pierden el cero inicial en Excel | Columna de nombre al lado; nota en LEEME |
| Nubes de Saber TyT enormes e identificables | Fuera de esta entrega |
| La acción sale en la imagen exportada | `data-export-ignore` en el botón, o en la fila si no hay fuente |
| `fflate` engorda la ficha | `import()` dinámico |

## Decisiones que confirma el usuario
1. El CSV de cada conjunto baja **el conjunto completo** (todos los cortes y campus), no solo lo que hay en pantalla.
2. Varios conjuntos → **un .zip** con un CSV por conjunto y un `LEEME.txt`.
3. Portales: **UDES en Cifras, Observatorio y Tableros** (Impacto y boletín quedan fuera).
4. El CSV de desgloses **pierde la columna `Total`** (permitía despejar celdas reservadas).
5. El CSV del mapa por municipio **no incluye filas de departamento** (misma razón).
6. Saber PRO/TyT: promedios y niveles con columna «Pocos evaluados»; **sin histogramas ni nubes por programa**.
7. Diversidad: **una acción discreta en cada uno de sus 7 marcos** (alternativa: una sola para todo el tablero).
8. **GSAP entra al portal público** para este selector; se actualiza `DESIGN.md`.

## Fuera de alcance (se dejan anotados)
- En pantalla, el corte «todo el periodo» de los desgloses promedia ignorando `reserved` (`open-data.ts:80-93`) y `StrataSpectrum` lee `value` sin mirar `reserved`.
- `od_breakdown_values` no tiene restricción que impida `value` no nulo con `reserved` (requiere migración).
- La ficha ya muestra departamento y municipios a la vez en el mapa de origen (divulgación complementaria en pantalla).
