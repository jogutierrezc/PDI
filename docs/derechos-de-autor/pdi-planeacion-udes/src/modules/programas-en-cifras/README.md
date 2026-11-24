# Programas en Cifras · backend y lógica (paquete 1 de 2)

Cada programa académico, en cada campus donde se ofrece, trabaja como en OneDrive: carpetas con archivos que son **Tablas** o **Listas** con columnas tipadas. Cada archivo «responde» a un cuadro del CNA o a una plantilla del SNIES uniendo sus columnas (un **mapa**). Con eso se emite el Cuadro Maestro del CNA.

Este paquete deja la base (`supabase/migrations/0164_programas_en_cifras.sql`), la lógica pura (`lib/`) y los hooks (`datos.ts`). **No hay pantallas**: van en el paquete 2. La propuesta visual aprobada está en `docs/propuestas/programas-en-cifras.prototipo.{html,css,js}`.

Dependencias nuevas para la UI: `@tanstack/react-table`, `@tanstack/react-virtual`.

## Modelo (0164)

Se trabaja por pareja **programa × campus**. Programa = `units.kind = 'programa'`; campus = `public.campuses`; qué programa se ofrece en qué campus lo dice `program_campuses`.

| Tabla | Qué guarda |
|---|---|
| `pc_miembros` | Quién es `director` o `coordinador` de un programa en un campus (una fila por programa × campus). |
| `pc_dominios` | Listas cerradas: el libro «Menú» del CNA y los dominios del SNIES. `numerado`: el CNA antepone la posición al emitir («2. Maestría»). |
| `pc_destinos` + `pc_destino_columnas` | Los cuadros del CNA (01–09 de Programas, 10 de Salud) y las plantillas SNIES que ya se capturan. Cada columna tiene `clave` estable, tipo, obligatorio, dominio, `solo_lectura`, `posterior_a` y `personal`. Ver abajo. |
| `pc_carpetas` | Tres fijas (`cna`, `snies`, `trabajo`; sin programa) y las que cree un programa. |
| `pc_archivos` | Tabla o lista de un programa × campus. `estado`: `borrador` \| `listo`. `bloqueado`: estructura fijada por el CNA. `destino_origen`: el cuadro del que parte. |
| `pc_columnas` | Columnas del archivo: `clave`, `etiqueta`, `tipo` (`texto`, `numero`, `fecha`, `lista`, `porcentaje`), `obligatorio`, `opciones`, `solo_lectura`, `posterior_a`, `personal`. |
| `pc_filas` | Filas: `datos` jsonb `{clave de columna: valor}` (número, `AAAA-MM-DD`, opción de la lista o texto). Lleva copia de `programa_id` y `campus_id` (la pone el disparador). Puede contener datos personales. |
| `pc_respuestas` | `archivo × destino` → `mapa` jsonb `{clave de la columna del destino: clave de la columna del archivo}`. |
| `pc_ventanas` | Ventana de observación: `anios` (5, 6, 8 o 10) hasta `hasta` (`AAAA-01`/`AAAA-02`). |
| `pc_periodos_cerrados` | Periodos cerrados, siempre en orden. |
| `pc_actividad` | Historial (`archivo_creado`, `archivo_eliminado`, `estado`, `estructura`, `filas`, `ventana`, `periodo_cerrado`, `periodo_reabierto`, `emision`). |

El **catálogo** (`pc_destinos`, `pc_destino_columnas`, `pc_dominios`) se siembra desde `lib/destinos.ts`: el CNA a mano (columnas de los Excel de «CNA - Cuadros Maestros») y el SNIES derivado de `reportes/snies/plantillas`. La prueba `tests/programas-en-cifras` comprueba que la semilla y `lib/destinos.ts` coinciden. Si cambia el catálogo, se regenera el bloque de semilla del SQL desde el TS (el `on conflict … do update` de la migración lo hace idempotente).

- Cuadros **automáticos** (`automatico` no nulo): 02, 03, 05 y 06. Los llena el sistema; no llevan archivo (la base lo rechaza).
- Cuadros de **estructura bloqueada** (`estructura_bloqueada`): todos los CNA con archivo (01, 04, 07, 08, 09, 10). Un archivo por programa × campus (índice único).
- **Solo salud**: el 10 (`solo_salud`). La base no sabe qué programa es de salud (ver «Dudas»); la UI decide si lo ofrece.
- Columnas de **solo lectura** en el 04: cédula, nombres, tipo de contratación, tipo de dedicación y horas de docencia (origen «Warehouse»).

## Roles: cómo se mapean (decisión)

`unit_members` tiene tres funciones (Gestor / Contribuyente / Consulta, `jefe` / `editor` / `visor`) pensadas para tableros e Impacto, y heredan por el árbol de unidades: no distinguen «Director» de «Coordinador» ni acotan por campus. Por eso hay una **tabla propia `pc_miembros`**, al estilo de `int_miembros`:

| Quién | Qué puede |
|---|---|
| **Director de programa** (`pc_miembros.rol = 'director'`) | Edita lo de **su programa y campus**: archivos, columnas, filas, mapas, ventana, periodos, emisión. Nombra Coordinadores de su programa y campus. |
| **Coordinador de programa** (`rol = 'coordinador'`) | Edita igual que el Director. |
| **Planeación** (`profiles.role >= 'planeacion'`, o sea también `admin`) | **Ve todo, no edita nada** (ni filas, ni estado, ni periodos). Si además es Director/Coordinador de un programa, en ese programa edita como tal (pertenecer gana). |
| Cualquier otra persona, y `anon` | No ve nada (ni el catálogo). |
| `admin` | Además nombra a cualquiera en `pc_miembros` y mantiene el catálogo. |

`pc_miembros` solo admite programas que se ofrecen en ese campus (`program_campuses`). Se pueden tener varias filas (un director de varios programas o campus).

Espejo en TypeScript: `lib/permisos.ts` (`rolEn`, `puedeEditar`, `puedeCambiarEstructura`…). Si cambia una regla, hay que cambiarla en los dos lados.

**Menú:** pertenecer al módulo es el permiso (como Internacionalización). La pantalla decide con `useYo()`: `esMiembro(yo)` (`planeacion` o alguna pareja). El paquete 2 tendrá que añadir `"programas-en-cifras"` a `AdminScreen`, a `SCREEN_PATHS` y a `screenVisible`, y llenar `inProgramasEnCifras` en `AuthProvider` (igual que `inInternacionalizacion`); eso no está hecho aquí.

## Reglas que hace cumplir la base (no la pantalla)

- **RLS por programa × campus** y disparadores `pc_archivos_guard`, `pc_columnas_guard`, `pc_filas_guard`, `pc_respuestas_guard`.
- **Estados**: `borrador → listo`. El estado no se cambia con un `update`; solo con `pc_marcar_listo`, que **rechaza si hay errores de validación** (`pc_errores_archivo`: tipos, listas, obligatorios, porcentaje 0–100, fechas `AAAA-MM-DD`, `fin ≥ inicio`). **Editar un archivo listo** (filas o columnas) lo devuelve a borrador (disparadores de sentencia).
- **Estructura bloqueada**: en un cuadro del CNA no se agregan, cambian ni quitan columnas, ni se borra el archivo, ni se desconecta del cuadro de origen. Un archivo libre sí cambia su estructura; al quitar una columna se limpian los valores de las filas y los mapas que la usaban.
- **Solo lectura** (`solo_lectura`): ni se insertan ni se cambian esos valores; `pc_guardar_filas` los conserva solos. Esas columnas no se validan (la persona no puede corregirlas). Las filas del sistema (Warehouse) las escribe el servicio, sin sesión, con `origen = 'sistema'`.
- **Borrador con errores**: el disparador solo exige la **forma** (`pc_validar_forma`: objeto, columnas que existen, texto o número, hasta 4000 caracteres). Un borrador conserva lo escrito aunque tenga errores de tipo (se pintan en rojo, como en el prototipo y al pegar de Excel); los errores solo impiden marcar listo y cerrar periodos.
- **Periodos en orden estricto** (`pc_cerrar_periodo`): solo el siguiente de la ruta (`AAAA-01` antes que `AAAA-02`, cada año tras el anterior); nunca uno si el anterior está abierto; y los archivos de la carpeta `cna` no pueden tener errores. `pc_reabrir_periodo` reabre solo el **último** cerrado. `pc_definir_ventana` cambia la ventana solo si lo ya cerrado sigue siendo el comienzo de la nueva ruta.
- **Emitir** (`pc_registrar_emision`): deja constancia en `pc_actividad`; exige ventana completa y todos los archivos de la carpeta `cna` listos. El resto (fecha única, cuadro 04 = cuadro 03, autorización de datos) lo valida el cliente al generar (`lib/emision-checks.ts`).

## Lógica pura (`lib/`)

| Archivo | Para qué |
|---|---|
| `validacion.ts` | `errorDeValor`, `errorDeCelda` (incluye `fin ≥ inicio` y solo lectura), `validarFila`, `validarArchivo`, `puedeMarcarseListo`, `validarForma`, `leerValor`/`leerFila` (de lo escrito a lo que se guarda: números, fechas ISO, opción de la lista). Espejo de `pc_error_valor` / `pc_errores_archivo` / `pc_validar_forma`. |
| `destinos.ts` | Catálogo local (`DESTINOS`, `DOMINIOS_PC`, `destino(id)`), `autoMap` (propone el mapa), `cobertura` (columnas mapeadas / columnas del destino), `coberturaCuadroMaestro`, `avisosDeDominio`, `sugerirDestino`, `columnasIniciales`, `opcionEmitida`. |
| `inferencia.ts` | `columnasDesdeMatriz` (columnas con tipo + filas tipadas desde la matriz de un Excel), `inferirTipo`, `claveDeEncabezado`. No lee archivos: el paquete 2 lee el Excel (ExcelJS) y entrega la matriz. |
| `periodos.ts` | `periodosDeVentana`, `estadoPeriodos`, `puedeCerrar`, `ventanaCompatible`, `ventanaPorDefecto`, `etiquetaPeriodo`, `porAnio`. Espejo de `pc_codigos_ventana` / `pc_estado_periodos`. |
| `permisos.ts` | Espejo de las reglas de la base (ver arriba). |
| `emision-checks.ts` | `revisarEmision(entrada)` → `{puede, hallazgos}` con las reglas: ventana completa, archivos CNA listos, fecha única de diligenciamiento (y de autoevaluación), cuadro 04 = último periodo del 03, autorización de datos personales. También `nombreArchivoEmitido`. |

Pruebas: `lib/logica.test.ts`, `datos.test.ts` y, contra Postgres en memoria, `tests/programas-en-cifras/programas-en-cifras-db.test.ts` (RLS, Planeación solo lee, estructura bloqueada, solo lectura, estados, periodos, y paridad SQL/TS de la validación y de la ruta de periodos).

## Contrato de `datos.ts` (para la UI, sin leer SQL)

Todo recibe `programa` (uuid de `units`) y `campus` (uuid de `campuses`). Sin ellos la consulta no corre. Si falta aplicar la migración, la consulta falla con `FaltaMigracion` (`esFaltaMigracion(error)`); la pantalla lo dice y, para el catálogo, puede caer a `DESTINOS` de `lib/destinos.ts`.

**Lecturas**

| Hook | Devuelve |
|---|---|
| `useYo()` | `Yo = {planeacion: boolean, programas: {programa_id, campus_id, rol: 'director'\|'coordinador'\|'planeacion', programa, programa_codigo, campus}[]}`. Para Planeación trae todas las parejas que ofrece `program_campuses`. Con esto se arma el selector programa/campus y `rolEn(yo, p, c)`. |
| `useCampus()` | `Campus[]`. |
| `useDestinos()` | `DestinoCompleto[]`: destinos con `columnas` (con `opciones` ya resueltas del dominio). |
| `useCarpetas(p, c)` | `PcCarpetaRow[]`: las fijas (`clave`: `cna`, `snies`, `trabajo`) y las propias. |
| `useArchivos(p, c)` | `PcArchivoRow[]` (sin columnas ni filas), lo más reciente primero. |
| `useEstructura(p, c)` | `ArchivoCompleto[]`: archivos con `columnas` ordenadas. Es lo que necesitan el editor y la cobertura. |
| `useResumenArchivos(p, c)` | `{archivo_id, filas, errores}[]` para el explorador («3 errores»). Lo calcula la base (`pc_resumen_archivos`). |
| `useFilas(archivo)` | `PcFilaRow[]` en orden. |
| `useErrores(archivo)` | `{fila_id, orden, clave, mensaje}[]` (la base, celda por celda). En el navegador, `validarArchivo` da lo mismo sin viaje. |
| `useRespuestas(p, c)` | `PcRespuestaRow[]` (los mapas) de todos los archivos de la pareja. |
| `usePeriodos(p, c)` | `EstadoPeriodos = {ventana: {anios, hasta}\|null, periodos: {codigo, cerrado, cerrado_en}[], siguiente, completa, cerrados, total}`. |
| `useActividad(p, c, archivo?, limite?)` | `PcActividadRow[]`, lo último primero. |
| `useMiembros(p, c)` | Director y Coordinadores con nombre y correo. |

**Escrituras** (todas invalidan lo que cambian; los errores de la base llegan en español en `error.message`)

| Hook | Manda | Notas |
|---|---|---|
| `useCrearArchivo()` | `{programa, campus, carpeta, nombre, tipo?, destino?, columnas?, filas?, mapas?}` | Una sola operación (`pc_crear_archivo`). Con un cuadro del CNA, las columnas las pone la base (se ignora `columnas`) y el mapa directo queda hecho. Con plantilla SNIES o libre, `columnas: [{clave, etiqueta, tipo, obligatorio?, opciones?, posterior_a?}]`. `filas: [{datos, orden?}]` (Excel subido; hasta 20.000). `mapas: {destino: {clave del destino: clave de la columna}}` (use `autoMap`). Devuelve `PcArchivoRow`. Falla si el cuadro del CNA ya tiene archivo. |
| `useActualizarArchivo()` | `{id, programa, campus, nombre?, carpeta?}` | Renombrar o mover. |
| `useBorrarArchivo()` | `{id, programa, campus}` | La base no deja borrar los de un cuadro del CNA. |
| `useMarcarListo()` | `{archivo, listo, programa, campus}` | `listo: true` falla con «El archivo tiene N celda(s) con error…». `false` vuelve a borrador. |
| `useGuardarColumnas()` | `{archivo, programa, campus, columnas}` | Deja las columnas **exactamente** como la lista (crea, actualiza y quita). Falla en cuadros del CNA. |
| `useGuardarFilas()` | `{archivo, programa, campus, filas: [{id?, datos, orden?}], borrar?: id[], reemplazar?, origen?}` | `id` actualiza (mande la fila completa; los valores de solo lectura los conserva la base); sin `id` inserta al final. `reemplazar` borra todo antes. Devuelve `{insertadas, actualizadas, borradas}`. Guarde en lotes (por ejemplo al salir de la celda o cada 500 ms), no tecla por tecla. |
| `useGuardarRespuesta()` / `useQuitarRespuesta()` | `{archivo, destino, mapa, programa, campus}` / `{archivo, destino, programa, campus}` | El mapa se puede editar aunque la estructura esté bloqueada; el cuadro de origen de un archivo del CNA no se desconecta. |
| `useCrearCarpeta()` / `useBorrarCarpeta()` | `{programa, campus, nombre, subtitulo?}` / `{id, programa, campus}` | Solo propias. |
| `useDefinirVentana()` | `{programa, campus, anios: 5\|6\|8\|10, hasta}` | Devuelve `EstadoPeriodos`. |
| `useCerrarPeriodo()` / `useReabrirPeriodo()` | `{programa, campus, codigo}` | Cerrar: solo el `siguiente`, sin errores en los archivos del CNA. Reabrir: solo el último cerrado. |
| `useRegistrarEmision()` | `{programa, campus, nombre, detalle?}` | Llamar **después** de generar el Excel (o antes de descargarlo) con `revisarEmision` ya en verde. |
| `useGuardarMiembro()` / `useQuitarMiembro()` | `{user_id, rol, programa, campus}` / `{id, programa, campus}` | Administración: cualquiera; Director: Coordinadores de su pareja. |

Las partes puras (`errorDe`, `armarEstructura`, `armarDestinos`, `PC_CLAVES`) están exportadas y probadas.

## Qué falta para el paquete 2 (UI)

1. Ruta, entrada de menú y permiso (`AdminScreen`, `SCREEN_PATHS`, `screenVisible`, `AuthProvider`), como Internacionalización.
2. Selector de programa × campus (de `useYo`) y modo observador para Planeación (`rolEn`, `puedeEditar`).
3. Explorador (carpetas, mosaicos/lista, filtros, detalles con cobertura), editor a pantalla completa con `@tanstack/react-table` + `@tanstack/react-virtual` (tabla/lista, pegar desde Excel, siguiente error), panel «Campos» y panel «Responde a» (`autoMap`, `cobertura`, `avisosDeDominio`).
4. Asistente «Nuevo archivo» (en blanco, desde Excel con `columnasDesdeMatriz`, o desde un destino).
5. Ruta de periodos y «Emitir»: leer el Excel de la plantilla oficial y generar el Cuadro Maestro (ExcelJS) con los mapas; aplicar `opcionEmitida` en las listas del CNA y convertir las fechas al formato de cada plantilla; llamar `revisarEmision` y luego `useRegistrarEmision`.
6. Los cuadros 02, 03, 05 y 06 (los llena el sistema) y el total de profesores del último periodo del 03 para `revisarEmision` (`profesoresUltimoPeriodo`): vienen de Reportes SNIES, el Warehouse e Internacionalización, y no están conectados en este paquete.
7. Pantalla de equipo (`useMiembros` / `useGuardarMiembro`) y de actividad.
8. Carga de las filas de solo lectura del cuadro 04 desde el Warehouse (el servicio las inserta con `origen = 'sistema'`).

## Dudas abiertas

- ¿Cómo se sabe que un programa es **del área de la salud** (cuadro 10)? `units` no lo dice; hoy `solo_salud` es una marca del destino y la UI decide.
- Listas del **Menú de Salud** (nivel de formación con «1ª/2ª/3ª Especialidad MQ», dedicación con «Tiempo parcial»): el catálogo usa las del libro de Programas; para programas de salud habría que ofrecer los dominios de Salud.
- El **Cuadro Maestro Institucional** (otro libro de «CNA - Cuadros Maestros») no está en este módulo: es de la institución, no de un programa.
- Cuadro 01: el bloque «información de la IES» (nombre, SNIES de la IES, naturaleza jurídica…) es el mismo para todos los programas y no está en el catálogo; el emisor lo toma de constantes institucionales.
- Cerrar un periodo exige **cero errores** en los archivos del CNA (como en el prototipo), aunque no estén marcados como listos. ¿Se prefiere exigir también que estén listos?
