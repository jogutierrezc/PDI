# Datos de Sostenibilidad · base, lógica y pantallas

La réplica de Programas en Cifras para los **indicadores de sostenibilidad** de UDES Sostenible. Cada oficina (UDES Verde, Planeación Institucional…) trabaja como en OneDrive: carpetas con **libros de datos** que son Tablas o Listas con columnas tipadas. Cada libro se **conecta a un indicador de sostenibilidad** con un mapa: qué columna da el valor, cuál el periodo, el campus, la fuente y la evidencia.

La base (`supabase/migrations/0178_datos_sostenibilidad.sql`), la lógica pura (`lib/`) y los hooks (`datos.ts`) son el paquete 1. Las pantallas (`ui/`) son el paquete 2: `/admin/datos-sostenibilidad`, dentro del marco de la intranet (AdminShell), no del marco de pantalla completa de Programas en Cifras.

## Modelo (0178)

| Tabla | Qué guarda |
|---|---|
| `ds_miembros` | Quién es `gestor` o `colaborador` de una oficina (una fila por persona × oficina). El gestor además nombra a su gente. |
| `ds_indicadores` | El catálogo de indicadores (ODS, código, nombre, unidad). Sembrado con los cuatro del ODS 13 (los del marco THE definidos en `sostenible/ods-data.ts`); el resto los añade la administración. |
| `ds_carpetas` | Dos fijas (`indicadores`, `trabajo`) y las que cree cada oficina. |
| `ds_libros` | Libro de datos de una oficina: `tipo` (`tabla` \| `lista`), `estado` (`borrador` \| `listo`). |
| `ds_columnas` | Columnas: clave, etiqueta, tipo (`texto`, `numero`, `fecha`, `lista`, `porcentaje`), obligatorio, opciones, `solo_lectura`, `posterior_a`. La misma forma que en Programas en Cifras. |
| `ds_filas` | Filas: `datos` jsonb `{clave: valor}`. |
| `ds_respuestas` | La conexión `libro × indicador`: `mapa` jsonb `{slot: clave de la columna}`. |
| `ds_actividad` | Historial (`libro_creado`, `libro_eliminado`, `estado`, `estructura`, `filas`). |

**Los slots.** Todos los indicadores se responden igual (los define `ds_slots()` en la base y `lib/indicadores.ts` en TypeScript):

| Slot | Qué da | Obligatorio |
|---|---|---|
| `valor` | La cifra del indicador (columna de número o porcentaje) | sí |
| `periodo` | Cuándo: año, semestre, corte | sí |
| `campus` | Dónde, si el dato es por campus | no |
| `fuente` | Quién reporta la cifra | no |
| `evidencia` | El documento o enlace que la respalda | no |

## Roles

| Quién | Qué puede |
|---|---|
| **Gestor de oficina** (`ds_miembros.rol = 'gestor'`) | Crea y edita los libros de su oficina, conecta indicadores, nombra colaboradores. |
| **Colaborador** (`rol = 'colaborador'`) | Edita igual que el gestor, sin repartir accesos. |
| **Planeación** (`role >= 'planeacion'`) | Ve todo, no edita nada (como en Programas en Cifras). |
| Cualquier otra persona, y `anon` | No ve nada, ni el catálogo. |
| `admin` | Además mantiene el catálogo de indicadores y nombra a cualquiera. |

Espejo en TypeScript: `lib/permisos.ts` (`rolEn`, `puedeEditar`, `puedeRepartir`).

## Reglas que hace cumplir la base

- **RLS por oficina**: gestor y colaborador editan lo suyo; Planeación solo lee; el resto no ve.
- **Estados** `borrador → listo`: solo con `ds_marcar_listo`, que rechaza si hay errores de validación. Editar filas o columnas de un libro listo lo devuelve a borrador.
- **Validación**: la misma de Programas en Cifras (`ds_error_valor`, `ds_validar_forma`, `ds_errores_libro`); la lógica pura se reutiliza de `programas-en-cifras/lib/validacion.ts`, no se copió.
- **La conexión** (`ds_respuestas_guard`): slots válidos, el valor sale de una columna de número o porcentaje, y siempre hay `valor`. Si se quita la columna que daba el valor, la conexión desaparece con ella.
- **RPC**: `ds_crear_libro` (libro + columnas + filas + conexiones en una llamada), `ds_guardar_filas` (lotes de hasta 20.000), `ds_marcar_listo`, `ds_yo`, `ds_resumen_libros`, `ds_errores_libro`.

## Contrato de `datos.ts` (para la UI, sin leer SQL)

Todo lo que depende de una oficina recibe `oficina` (uuid de `units`). Sin la migración aplicada, la consulta falla con `FaltaMigracion` (`esFaltaMigracion`); el catálogo cae a `INDICADORES_DS`.

**Lecturas**: `useYo()` (RPC `ds_yo`: mis oficinas y roles), `useIndicadores()`, `useCarpetas(oficina)`, `useLibros(oficina)`, `useEstructura(oficina)` (libros con columnas), `useFilas(libro)`, `useErrores(libro)`, `useResumenLibros(oficina)`, `useRespuestas(oficina)`, `useActividad(oficina)`, `useMiembros(oficina)`.

**Escrituras**: `useCrearLibro`, `useActualizarLibro`, `useBorrarLibro`, `useGuardarColumnas`, `useGuardarFilas`, `useMarcarListo`, `useGuardarRespuesta`, `useQuitarRespuesta`, `useCrearCarpeta`, `useBorrarCarpeta`, `useGuardarMiembro`, `useQuitarMiembro`.

**Lógica pura** (`lib/`): `indicadores.ts` (`SLOTS`, `INDICADORES_DS`, `autoMap` — propone el mapa con solo ver las columnas —, `faltanDelMapa`, `coberturaDelMapa`), `permisos.ts`. La validación de celdas, la lectura de valores y la inferencia de columnas desde un Excel son las de `programas-en-cifras/lib/{validacion,inferencia}.ts`, reutilizadas.

## Las pantallas (paquete H, 0202)

`/admin/datos-sostenibilidad/:vista?/:id?`, con entrada en el lanzador y en el menú (`AdminShell`). Entra quien tiene la pantalla habilitada (`sos_entra()`), Planeación y la administración. **Las pantallas de libros por oficina (0178) se retiraron**; las tablas `ds_*` y `ds_cifras_publicas()` siguen en la base, intactas, y `datos.ts` conserva sus hooks de libros sin uso desde la interfaz (candidatos a borrar cuando se decida dar de baja el modelo de 0178).

| Ruta | Qué hace |
|---|---|
| `/admin/datos-sostenibilidad` | **Archivos**: el `Explorador` de UDrive acotado a la unidad «Datos de Sostenibilidad», en el marco de la intranet (`incrustado`: sin la barra y el riel de pantalla completa). Carpetas, búsqueda, «Nuevo» (tabla, gráfica, cruce, Excel/CSV, carpeta) y, en el detalle de cada archivo, «Dónde se usa» y «Quién la ve». |
| `/indicadores` | **Indicadores**: el catálogo agrupado por ODS, de qué tabla y columna sale cada uno, último dato y avance a la meta. Crear, editar y publicar: administración y Administra de la unidad; el resto lo ve en solo lectura. |
| `/portal` | **Portal de sostenibilidad**: recorrido tabla → gráfica → indicador → portal, un campus a elegir, vista previa de `/sostenible` calculada en el cliente con `calcularIndicador` y los componentes reales del portal (`TileCuerpo`, `GraficasPublicadas`), «Qué se publica» (interruptores) y «Revisión antes de publicar». |
| `/tabla/:id`, `/grafica/:id`, `/cruce/:id` | Los editores de UDrive a pantalla completa, por rutas propias (la ruta `/admin/udrive` pide la pantalla «udrive»). Se vuelve con «← Archivos». El editor de tablas suma el panel **Conectar a un indicador** (`PanelConexion`, con el valor actual que parpadea al editar una celda); el de gráficas, **Publicar en el portal** (`PanelPublicar`: interruptor y sección del Observatorio). Quien no puede editar los ve en solo lectura. |

Cómo se montan: `udrive/ui/contexto.tsx` (`ProveedorDrive`) le dice al explorador y a los editores de UDrive su ruta base, a dónde volver, si van incrustados y qué paneles extra mostrar; sin proveedor son el UDrive de siempre. Archivos del módulo: `ui/DatosSostenibilidad.tsx` (rutas y marco), `Conexion.tsx` (paneles y «Dónde se usa»), `Indicadores.tsx`, `Portal.tsx`, `usos.ts` (unidad, tablas y gráficas), `piezas.tsx`, `movimiento.ts` (GSAP: entradas ≤ 240 ms, escalonado de 30 ms hasta 9, parpadeo verde, barras y líneas que se dibujan al abrir; nada por teclado; movimiento reducido = fundidos cortos) y `datos-sostenibilidad.css`.

Sin la migración 0202 las consultas fallan con `FaltaMigracion`: cada sección muestra el aviso (`ErrorSos`) y nada más; el portal público no cambia. Sin la unidad sembrada, la pantalla dice que no la encuentra.

**Gráficas en el portal**: `sostenible/GraficasSostenibles.tsx` dibuja `sos_graficas_publicas()` (barras y líneas, globo por ratón y teclado) agrupadas por sección. Aparecen en la página de respaldo (`SostenibleHome`, solo si hay publicadas) y en el bloque del CMS «Gráficas de sostenibilidad» (grupo «Datos en vivo», campo opcional de sección).

## El portal lee los libros (paquete B, migración 0198)

`ds_cifras_publicas()` (security definer, ejecutable por `anon` y `authenticated`) devuelve `{"13.2": [{valor, periodo, campus, fuente, evidencia}, ...]}` con las filas de los libros en estado **listo** conectados a un indicador, leídas con el mapa de `ds_respuestas`. Omite las filas sin número o sin periodo y no entrega oficinas, usuarios ni libros en borrador.

En el portal (`sostenible/cifras-reales.ts`):

- `useCifrasReales()` consume la función con react-query; sin migración, sin red o sin datos devuelve vacío y el portal queda como estaba.
- `IND_DE_DS` es la equivalencia explícita indicador del catálogo → tarjeta del portal (`IndKey`). Hoy solo `13.2 → solar` («Energía con bajas emisiones» ↔ «Energía renovable»). El resto no tiene equivalencia clara y sigue siendo de muestra; al añadir indicadores al catálogo se mapean ahí.
- El periodo se lee como el primer año de cuatro cifras que sea una edición del portal (2022 a 2025; «2024-1» vale 2024). El campus vacío o «Institucional» es **Todos**; un campus que no sea uno de los del portal se omite. Con varias filas del mismo campus y año gana la última.
- `IndicatorBoard` (y con él el inicio, los rankings y el bloque «indicadores» del CMS) usa la cifra real si existe para ese indicador, campus y año, con su fuente y evidencia; si no, la de muestra, marcada «Dato ilustrativo» en la tarjeta. La nota inferior solo aparece si alguna tarjeta es de muestra. Con cifra real, la gráfica y el cambio usan solo los años que tienen cifra real.

## Catálogo de indicadores (solo administración)

Sección **Indicadores** en el riel de `/admin/datos-sostenibilidad`, visible solo para `admin`: crea y edita indicadores de los 17 ODS (`useGuardarIndicador`). La RLS de 0178 ya basta (`ds_indicadores_admin`: todo para `admin`); 0198 solo añade una restricción mínima al id. No hay borrado: quitar un indicador borraría en cascada las conexiones de los libros.

## Dudas abiertas

- La equivalencia `13.2 → solar` es aproximada (bajas emisiones no es lo mismo que renovable); si UDES Verde prefiere no mapearla, se quita de `IND_DE_DS`.
- Las tarjetas del portal (energía, agua, residuos…) no tienen indicador en el catálogo; la administración debe crearlos y mapearlos para que dejen de ser de muestra.
- Las oficinas son unidades del organigrama (`units`): UDES Verde y Planeación Institucional tienen que existir como unidades; las crea la administración en Mis Tableros.

# Datos de Sostenibilidad «al estilo UDrive» (0202)

El módulo pasa de «libros por oficina» a trabajar sobre **UDrive**: una unidad de trabajo sembrada («Datos de Sostenibilidad», carpetas Energía y clima, Agua, Residuos, Campus verde) donde carpetas, tablas y gráficas son libres. Migración `supabase/migrations/0202_sostenibilidad_estilo_udrive.sql` (requiere 0178, 0198, 0187, 0188, 0191, 0195). Lo viejo (`ds_libros`…) sigue en la base; su interfaz ya se retiró. Los porqués de seguridad están en la cabecera de la migración.

## Reglas
- **Ver**: toda persona que pasa `sos_entra()` (pantalla `datos-sostenibilidad` habilitada, o en `ds_miembros`, o Planeación/administración) recibe al menos **Solo ver** en la unidad (`drive_unidades.lectura_abierta`), sin ser miembro. Ve todas las carpetas, tablas y gráficas.
- **Editar**: quien tenga papel en `drive_unidad_miembros` (Solo ver / Editar / Crear / Administra, los de 0191). La administración general administra siempre.
- **Catálogo de indicadores**: crear/editar y marcar publicado = administración o **Administra** en la unidad. Publicar exige un vínculo válido.
- **Vincular** una tabla a un indicador y **publicar una gráfica**: papel **Crear** o más sobre el archivo (si el indicador ya está publicado, cambiar su vínculo pide Administra).
- **Público**: solo indicadores y gráficas publicados, con datos agregados y solo las columnas que usan. Las tablas crudas no salen. Una tabla con columna sensible (marca `sensible: true` o nombre típico de dato personal) no se publica; las gráficas de dispersión y burbujas tampoco, ni tablas de más de 500 filas.
- **Qué valida la base** (SQL sobre el jsonb de UDrive): archivo tipo `tabla` de la unidad, columnas existentes, columna del valor `numero|porcentaje`, columnas no sensibles. **Qué no puede**: si una columna de texto libre cuela datos personales (revisión humana), ni cambios posteriores a la tabla (el RPC público los vuelve a comprobar y omite lo que ya no vale).

## Contrato para las pantallas

Todo en `sos.ts` (hooks) y `tipos.ts` (tipos). Sin la migración, las consultas fallan con `FaltaMigracion` (`esFaltaMigracion`). Las tablas y gráficas en sí se leen/editan con UDrive (`../udrive/datos.ts`: `useContenido(id)`, `useArchivos()`, `useCarpetas()`, `useGuardarContenido()`…; la unidad con `drive_unidades_listar()` y su `mi_rol`).

**Tablas nuevas**
- `ds_indicadores` (ampliada): `id, ods, nombre, descripcion, unidad, position` + `mejor 'sube'|'baja'`, `resumen 'promedio'|'suma'|'ultimo'`, `meta numeric|null`, `decimales 0..3`, `publicado bool`, `tarjeta` (`energia|solar|agua|residuos|verde|arboles|movil|volunt`, única, `null` = tarjeta nueva), `nota`. Los 4 indicadores de 0178 quedan con valores por defecto y sin publicar.
- `sos_vinculos` (uno por indicador): `id, indicador_id, archivo_id, col_valor, col_periodo, col_campus|null, filtro_col|null, filtro_valor|null`. `col_*` son las `clave` de las columnas de la tabla de UDrive.
- `sos_publicaciones` (por gráfica): `archivo_id, seccion ('panorama'|'tendencia'|'composicion'|'territorio'|'detalle'), orden, publicado, por, en`.

**Hooks** (react-query)
| Hook | Devuelve / hace |
|---|---|
| `useIndicadoresSos()` | `IndicadorSos[]` (catálogo con los campos de 0202) |
| `useGuardarIndicador()` | `mutate(IndicadorSos sin publicado)` crea/edita (upsert por `id`); no toca `publicado` |
| `usePublicarIndicador()` | `mutate({ id, publicado })`; Administra; rechaza si no hay vínculo |
| `useVinculos()` | `VinculoSos[]` |
| `useGuardarVinculo()` | `mutate(VinculoSosEntrada)` upsert por `indicador_id`; la base valida tabla/columnas y devuelve el motivo en español |
| `useQuitarVinculo()` | `mutate(indicadorId)`; si era el último vínculo de un indicador publicado, lo despublica |
| `usePublicacionesGraficas()` | `PublicacionSos[]` |
| `usePublicarGrafica()` | `mutate({ archivo_id, publicado, seccion?, orden? })` |
| `useCifrasPublicas()` | `CifraPublicaSos[]` lo que ve hoy el público (sin error: sin migración, `[]`) |
| `useGraficasPublicas()` | `GraficaPublicaSos[]` ídem |

**Lógica pura** (para la vista previa del portal sin ir a la base)
- `calcularIndicador(ind, vinculo, tabla, campus = null)` → `IndicadorCalculado { serie, actual, previo, meta, cambioPct, mejora, avanceMeta, avisos }`. `ind` = `{ resumen, meta, mejor }`; `tabla` = `TablaDatos` de UDrive (`{ columnas, filas }`); `campus` nulo o «Todos» = institucional. Replica `sos_cifras_publicas()`: año = primer número de cuatro cifras del periodo; resumen por campus y año; si hay campus pero no fila institucional, «Todos» se calcula con todos los campus.
- `agregarSerie(ind, vinculo, tabla)` → `PuntoSerieSos[]` (todas las series). `avisosDeVinculo(vinculo, tabla)` y `columnaSensible(col)` avisan antes de que la base rechace.

**RPC públicas** (anon y authenticated, `SECURITY DEFINER`)
- `sos_cifras_publicas()` → `[{ id, ods, nombre, unidad, mejor, meta, tarjeta, decimales, nota, resumen, fuente (nombre del archivo), serie: [{ campus|null, anio, periodo, valor }] }]`.
- `sos_graficas_publicas()` → `[{ id, nombre, seccion, orden, fuente, actualizado, config (tipo, titulo, nota, x, series, tamano, filaCalor, ejeX, ejeY, ejeY2, min, max, tendencia, rotular), columnas: [{ clave, etiqueta, tipo }], filas: [{ <clave>: valor }] }]`.

**Portal**: `sostenible/cifras-reales.ts` lee `sos_cifras_publicas()` y, mientras una tarjeta no tenga vínculo nuevo, `ds_cifras_publicas()` (0198). Con `tarjeta` reemplaza la cifra de muestra; sin ella, `IndicatorBoard nuevos` (Inicio y CMS) añade una tarjeta propia solo si hay cifra real para el campus y año elegidos. `sos_graficas_publicas()` se pinta con `sostenible/GraficasSostenibles.tsx` (página de respaldo y bloque `graficas-sostenibles` del CMS).
