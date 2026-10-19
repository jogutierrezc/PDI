# Internacionalización · backend y lógica (paquete 1 de 2)

Repositorio único de la Oficina de Internacionalización: los datos se guardan una vez, por campus, y responden muchas plantillas (SNIES, CNA, rankings). Este paquete deja la base (migración `0151_internacionalizacion.sql`), la lógica pura (`lib/`) y los hooks (`datos.ts`). Las pantallas van en el paquete 2.

## Modelo (0151)

| Tabla | Qué guarda |
|---|---|
| `int_miembros` | Quién trabaja en el módulo: `director` (global, sin campus), `coordinador` o `gestor` de un campus. Una fila por campus: alguien puede coordinar o gestionar varios. |
| `int_conceptos` | Catálogo compartido. Una columna con el mismo concepto significa lo mismo en todas las tablas. `periodo` y `campus` son implícitos: van en la fila. Semilla espejo de `lib/conceptos.ts` (`CONCEPTOS_BASE`). |
| `int_libros` → `int_hojas` → `int_columnas` | Las tablas. `int_libros.captura`: `campus` (cada campus sus filas) u `oficina` (solo el Director). `int_hojas.clase`: `movilidad`, `convenio` o `general`, y `sentido` (`saliente`/`entrante`) para hojas de movilidad sin columna de sentido. Con concepto, `int_columnas.clave` es el id del concepto; sin él, empieza por `propio_`. Así `datos->>'pais_contraparte'` se lee igual en todas las hojas. |
| `int_filas` | Una fila de la hoja × periodo × campus. `datos` jsonb `{clave: valor}`: número, fecha `AAAA-MM-DD`, opción de la lista o texto. |
| `int_periodos` | `2026-2`, `abierto`/`cerrado`. Puede haber varios. |
| `int_ventanas` | Periodo × hoja (× campus opcional): `abre`, `cierra`. La del campus manda sobre la general. Sin ventana, no se captura. |
| `int_envios` (+ `int_envios_historial`) | Estado de (periodo, hoja, campus). Si no hay fila, es `borrador`. |
| `int_reaperturas` | Cada reapertura (envío aprobado, ventana vencida o periodo cerrado): quién, cuándo y por qué. |
| `int_plantillas` (+ `int_plantilla_columnas`) | Plantillas CNA, rankings u otras que carga el Director, con el emparejamiento columna ↔ concepto (`directo`, `derivado` o `falta`). Las de SNIES no van aquí: se leen del catálogo de Reportes. |
| `int_envios_snies` (+ `_filas`) | Bitácora del puente a Reportes Institucionales. |

Los campus salen de `public.campuses` (0017/0063), la misma tabla de `program_campuses`, `unit_members.campus_id` y `ri_sedes`.

## Roles y transiciones

| Quién | Qué puede hacer |
|---|---|
| **Director** (`int_miembros.rol = 'director'`, o `profiles.role = 'admin'`) | Todo: estructura, catálogo, plantillas, periodos y ventanas. Aprueba, reabre con motivo, usa el puente SNIES y nombra coordinadores y gestores. Edita filas de cualquier campus y fuera de la ventana. |
| **Coordinador** de un campus | Ve y corrige las filas de su campus dentro de la ventana mientras la hoja esté en `borrador` o `enviado`. Valida, o devuelve con nota. |
| **Gestor** de un campus | Captura y carga Excel de su campus dentro de la ventana mientras la hoja esté en `borrador`, y la envía. |

```
borrador ──enviar (gestor, coordinador, director)──▶ enviado
enviado  ──validar (coordinador del campus, director)──▶ validado
validado ──aprobar (director)──▶ aprobado
enviado | validado ──devolver con nota (coordinador, director)──▶ borrador
aprobado ──reabrir con motivo (director; queda en int_reaperturas)──▶ borrador
```

Reglas que hace cumplir la base, no la pantalla:

- **RLS por campus:** cada campus ve y escribe solo sus filas. El Director y la administración ven todo.
- **Disparador `int_filas_guard`** (mensajes en `int_motivo_bloqueo`): nadie escribe en una hoja aprobada. Las tablas de `oficina` solo las escribe el Director. Fuera de la ventana solo escribe el Director. Un Gestor no escribe después de enviar, ni un Coordinador después de validar. La forma de los datos se revisa en `int_validar_datos`: claves, número, fecha y opciones de lista.
- **Al enviar** (`int_cambiar_estado`), la hoja no puede tener obligatorios vacíos.
- **Reabrir** un periodo cerrado o una ventana vencida solo se puede con `int_reabrir`, que pide motivo. Un `update` directo se rechaza.
- **Solo lo aprobado** cuenta en `int_cifras` y en el puente SNIES.

El espejo en TypeScript de estas reglas está en `lib/permisos.ts`. Si cambia una regla, hay que cambiarla en los dos lados.

**Menú:** pertenecer al módulo es el permiso, como en Mis Tableros. `AdminScreen` incluye `"internacionalizacion"` (ruta `/admin/internacionalizacion` en `SCREEN_PATHS`). `screenVisible` lo muestra a la administración y a quien tenga `inInternacionalizacion`. `AuthProvider` llena ese valor leyendo `int_miembros` y lo expone en `useAuth().inInternacionalizacion`. No depende del rol de acceso.

## RPC (0151)

| Función | Para qué |
|---|---|
| `int_yo()` | `{director, coordinador: [campus], gestor: [campus]}` |
| `int_guardar_filas(hoja, periodo, filas, reemplazar?, origen?)` | Carga masiva. Es `security invoker`: RLS y el disparador deciden fila por fila. |
| `int_cambiar_estado(periodo, hoja, campus, estado, nota?)` | Mueve el flujo. |
| `int_reabrir(periodo, motivo, hoja?, campus?, cierra?)` | Reabre un periodo o una ventana. |
| `int_cifras(periodo, incluir?)` | Agregados. Devuelve `incluir`: `aprobado` (por defecto), `validado` o `enviado`; las dos últimas opciones solo valen para el Director. |
| `int_enviar_snies(periodo, plantilla, filas, clave)` | Puente a `ri_filas`. Solo para el Director. |
| `int_rol_en(campus)`, `int_ventana_abierta(...)`, `int_motivo_bloqueo(...)` | Ayudas que también puede llamar la pantalla. `int_estado_envio` e `int_validar_datos` son internas. |

## API de `datos.ts`

Todas las lecturas fallan con `FaltaMigracion` si no está la 0151. La pantalla debe decirlo, como en rankings/noticias.

**Lecturas:**

- `useYo()` → `Yo`
- `useCampus()` → `Campus[]`
- `useConceptos()` → `IntConceptoRow[]`
- `useEstructura()` → `LibroCompleto[]`: libros con sus hojas y columnas
- `usePeriodos()` → `IntPeriodoRow[]`
- `useVentanas(periodo)` → `IntVentanaRow[]`
- `useFilas(hoja, periodo)` → `IntFilaRow[]` (RLS deja solo los campus propios)
- `useEnvios(periodo)` → `IntEnvioRow[]`, con `estadoDe(envios, hoja, campus)`
- `useHistorial(periodo)`
- `useReaperturas(periodo)`
- `useMiembros()` → `Miembro[]` (con nombre y correo)
- `usePlantillas()` → `PlantillaConColumnas[]`
- `useCifras(periodo, incluir?)` → `CifrasRpc`
- `useEnviosSnies(periodo)`

**Escrituras** (`useMutation`):

- `useGuardarConcepto()`
- `useGuardarLibro()` → id
- `useBorrarLibro()`
- `useGuardarHoja()` → id
- `useGuardarColumnas({hoja, columnas})`: deja la hoja exactamente con esas columnas
- `useCrearTabla(TablaNueva)` → id del libro: libro, hojas y columnas de una vez, por ejemplo desde Excel
- `useGuardarPeriodo()`
- `useGuardarVentana()`
- `useBorrarVentana({id, periodo})`
- `useReabrir({periodo, motivo, hoja?, campus?, cierra?})`
- `useGuardarFilas({hoja, periodo, filas, reemplazar?, origen?})`
- `useBorrarFilas({ids, hoja, periodo})`
- `useCambiarEstado({periodo, hoja, campus, estado, nota?})`
- `useGuardarMiembro({user_id, rol, campus_id})`
- `useQuitarMiembro(id)`
- `useGuardarPlantilla({id?, nombre, tipo, descripcion?, columnas})`
- `useBorrarPlantilla(id)`
- `useEnviarSnies({periodo, plantilla, filas, clave})`

## Lógica pura (`lib/`)

- **`conceptos.ts`**
  - `CONCEPTOS_BASE`
  - `normalizar(texto)`: quita acentos y signos
  - `emparejarConcepto(encabezado, conceptos, excluir?)`: busca primero la coincidencia exacta y luego la parecida, y gana la más larga
  - `claveDePropio`
  - `opcionDe`
- **`validacion.ts`**
  - `leerValor(columna, crudo)`: lee números con coma, fechas de Excel, ISO o `dd/mm/aaaa`, y opciones de lista sin importar acentos
  - `calcular`: la duración, en días entre dos fechas
  - `validarDatos(columnas, datos, fila)`: obligatorios, tipos, listas, claves desconocidas y fin ≥ inicio
- **`importador-excel.ts`** recibe un `ExcelJS.Workbook` ya cargado. Para cargarlo en el navegador: `const wb = new (await import("exceljs")).default.Workbook(); await wb.xlsx.load(await file.arrayBuffer())`.
  - `analizarLibro(wb, conceptos)` detecta las hojas visibles, la fila de encabezados y el emparejamiento con el catálogo. Infiere el tipo de cada columna e incluye las advertencias.
  - `columnasParaCrear(hoja)` da la estructura para `useCrearTabla`.
  - `prepararCarga(hoja, columnasDestino, {campus, permitidos, campusFijo?, periodo})` devuelve la vista previa sin guardar: filas con sus errores por celda, filas válidas, columnas ignoradas, obligatorias faltantes y conteo por campus. Para el Gestor, `permitidos` son sus campus. Para el Director, todos.
  - `paraGuardar(carga)` da el cuerpo de `useGuardarFilas`.
- **`permisos.ts`**
  - `TRANSICIONES`, `transicionPermitida`, `accionesPermitidas`, `pideNota`, `esReapertura`
  - `rolEn`, `campusVisibles`, `ventanaVigente`, `ventanaAbierta`
  - `motivoBloqueoFilas`, `puedeNombrar`
  - `ETIQUETA_ESTADO`, `ETIQUETA_ROL`
- **`cobertura.ts`**
  - `disponiblesDe(hojas)` dice qué concepto está en qué hoja.
  - `cobertura(plantilla, disponibles)` marca cada columna como `directo`, `derivado` o `falta`, con su motivo, y da el % y las obligatorias faltantes.
  - `plantillaDesdeSnies(spec)` lee el catálogo **real** de `reportes/snies/plantillas` con `MAPEO_SNIES`.
  - `encabezadosDeCsv` y `propuestaPlantilla` sirven para CNA y rankings.
  - `plantillaDesdeFilas` toma lo guardado en `int_plantilla_columnas`.
- **`puente-snies.ts`**
  - `PUENTE_SNIES`
  - `puedeAlimentar(spec, disponibles)`
  - `filaSnies`
  - `construirEnvioSnies(spec, filasConEstado, {contexto, periodo, sedePorCampus?})`: usa `motor.canonizar` y `motor.validarCeldas` de Reportes, toma solo filas aprobadas y no repite claves
  - `claveDeFila`
- **`cifras.ts`**
  - `calcularCifras(filas, hojas, {incluir, director, referencia})` es el espejo de `int_cifras`.
  - `estadosQueCuentan`
  - `totalSentido`

## Puente SNIES: qué alimenta y por qué

El catálogo de hoy (`reportes/snies/plantillas`) tiene estas plantillas:

- Participante
- Inscritos
- Inscritos por programa
- Admitidos
- Primer curso
- Matriculados
- Graduados
- Docentes (sin campos)

**Ninguna es de movilidad ni de convenios.**

- **Participante: sí.** Toda persona de la comunidad académica va ahí, también el estudiante o docente extranjero que llega. Sus obligatorios son conceptos del repositorio: tipo y número de documento, nombres, sexo, estado civil, fecha y país de nacimiento. Se alimenta desde una hoja que los lleve todos (`puedeAlimentar`).
- **Las de estudiantes: no.** Piden datos que no son de Internacionalización: código de estudiante, matrícula, Saber 11/Pro, estrato… Su cobertura se calcula igual, para que se vea qué falta.
- **El día que el catálogo tenga una plantilla de movilidad:** se añade a `PUENTE_SNIES` y, si trae campos nuevos, a `MAPEO_SNIES`. La RPC `int_enviar_snies` también necesita que `ri_exigir_plantilla` la conozca.

`int_enviar_snies` funciona así:

- **Solo filas aprobadas:** comprueba en la base que cada fila de origen esté aprobada en ese periodo.
- **Agrega, no reemplaza:** añade a la entrega de `ri_entregas` (`snies`, plantilla, `periodo.codigo`) solo las filas cuya clave no está ya en `ri_filas`. Para Participante, la clave es `NUM_DOCUMENTO` sin puntos ni espacios.
- **No pisa lo cargado por otros medios** y es idempotente.
- **Entregas enviadas:** se niega si la entrega ya se envió a HECAA.
- **Validación:** la entrega vuelve a `cargada` y hay que validarla de nuevo en Reportes.
- **Bitácora:** deja registro en `int_envios_snies`.

No cambia ninguna tabla de Reportes.

## Decisiones tomadas

1. **Roles:** son una tabla propia, `int_miembros`. No se cambia el esquema de roles existente (`profiles.role`, `access_roles`, `unit_members`). La administración de la intranet cuenta como Director.
   - Un Director solo lo nombra la administración. El Director nombra coordinadores y gestores.
   - Planeación **no** entra al módulo por su rol: tiene que estar en `int_miembros`.
2. **Estado:** se lleva por (hoja, periodo, campus) en `int_envios`, no por fila. Una fila «está aprobada» cuando su hoja y campus lo están en ese periodo.
3. **Excel:** no se guarda el original, porque se lee en el navegador. Por eso no hay bucket.
4. **Datos personales:** la bitácora del puente solo la lee el Director. Las filas siguen la RLS por campus. Los conceptos marcados `personal` son para que la pantalla los enmascare.
5. **Ventanas:** sin ventana definida, la hoja no se captura, salvo para el Director. Las fechas se cuentan en hora de Bogotá (`int_hoy()`).
6. **Correcciones del Coordinador:** puede corregir filas de su campus estando la hoja en `enviado` (antes de validar) y dentro de la ventana.

## Pendiente o para decidir

- ¿La administración debe contar como Director, o solo verlo todo? Hoy aprueba y reabre.
- ¿El puente SNIES debe exigir también la pantalla «reportes» (`ri_exigir_captura`)? Hoy basta ser Director de Internacionalización.
- La hoja «Profesores visitantes» del diseño tiene sentido entrante. Hay que crearla con `clase = 'movilidad'` y `sentido = 'entrante'` para que cuente en cifras.

## Pruebas

- `src/modules/internacionalizacion/**/*.test.ts`: lógica pura, con el Excel de ejemplo construido en memoria y el catálogo SNIES real.
- `tests/internacionalizacion/internacionalizacion-db.test.ts`: Postgres en memoria (PGlite) con todas las migraciones. Cubre:
  - RLS por campus
  - ventanas
  - flujo
  - cifras solo de lo aprobado
  - puente idempotente
  - accesos
  - idempotencia de la migración

```
npx vitest run src/modules/internacionalizacion tests/internacionalizacion
```


## Carpetas, Multicampus y autoría (migración 0166)

Rediseño de «Tablas» (maqueta aprobada «Internacionalización · Tablas y Multicampus»).

**Carpetas con subcarpetas.** `int_carpetas` (`parent_id`, hasta 5 niveles, sin ciclos: disparador `int_carpetas_guard`; dos hermanas no se llaman igual sin distinguir mayúsculas). `int_libros.carpeta_id` nulo = «Sin carpeta». Una carpeta con tablas o subcarpetas no se borra (FK `restrict`). Antes eran cuatro constantes deducidas de la clase de las hojas (`CARPETAS_INT`, retiradas). Lógica pura en `lib/carpetas.ts`; barra lateral en `ui/ArbolCarpetas.tsx`.

**Captura `multicampus`.** Un archivo al que aportan todos los campus:
- Todos los miembros (y Planeación) **ven todas las filas** y todos los estados de envío.
- **Escribir filas:** Bucaramanga (Gestor y Coordinador) edita las de cualquier campus; Valledupar, Cúcuta y Bogotá, solo las suyas; Planeación edita todas (con papel de Coordinador); el Director, todas. Lo decide `int_rol_fila(campus, hoja)` (espejo: `rolFila` en `lib/permisos.ts`); el disparador de filas y la ventana siguen igual.
- **Enviar, validar y aprobar sigue siendo por campus** (`int_cambiar_estado` usa el papel en ese campus: quien edita filas ajenas desde Bucaramanga no las envía). El avance de la tarjeta cuenta los campus que enviaron algo (`avanceMulticampus`): queda aprobada cuando lo están todos esos.
- **Quién la controla** (crear, cambiar estructura, borrar): Director, Planeación y el Coordinador de Bucaramanga. El campus central se busca por `slug = 'bucaramanga'` (`int_campus_central()`).

**Quién crea.**
| Qué | Quién |
|---|---|
| Carpetas y tablas «por campus» | Director, Planeación y cualquier Coordinador. Un Coordinador cambia y borra solo lo que creó. |
| Tablas «solo la oficina» | Director y Planeación |
| Tablas Multicampus | Director, Planeación y el Coordinador de Bucaramanga |
| Ventana de captura de una hoja | el Director, o quien administra esa tabla (`int_ventanas`). Los periodos siguen siendo del Director. |

Planeación **ve el módulo sin ser miembro** (`int_ve_modulo()`; pantalla visible por rol en `auth.tsx`), pero no aprueba, no reabre y no nombra miembros.

**Autoría.** Cada fila ya guardaba `created_by`, `updated_by` y `origen`; 0166 añade `archivo` (nombre del Excel) y `created_at` se muestra. En una tabla Multicampus la hoja trae las columnas de solo lectura **Registró · Cuándo · Origen** (`columnasInfo` de la rejilla compartida `components/espacio/Hoja`). `int_guardar_filas` recibe `p_archivo` (la versión de 5 parámetros se reemplaza; el cliente viejo sigue funcionando porque el parámetro nuevo tiene valor por defecto).

**Pantalla.** «Nuevo» es un menú (Carpeta · Tabla · Multicampus · Subir un Excel) y «Nueva tabla» es un solo panel (`ui/NuevoPanel.tsx`: nombre, carpeta, quién escribe, cómo empieza). Agregar una hoja a una tabla existente sigue en `NuevaTabla`. Movimiento: solo `transform`/`opacity`, 160 ms, `ease-out` fuerte, sin animación en el árbol y sin movimiento con `prefers-reduced-motion` (`ui/carpetas.css`).

**Pruebas.** `tests/internacionalizacion/multicampus-db.test.ts` (19 casos sobre la base: permisos, ciclos, 5 niveles, RLS, autoría y archivo), `lib/carpetas.test.ts`, `lib/multicampus.test.ts` y las de renderizado.


## Contactos: enlace público de invitación (migración 0167)

Personas invitadas, **sin cuenta**, comparten contactos académicos o de empleadores. Entran por `/contactos/i/:token`, se identifican (nombre, cargo en la UDES, correo institucional), eligen **uno a uno** o **importar un archivo**, y todo cae en la carpeta **«Contactos»** de Tablas: dos tablas Multicampus («Contactos académicos», 11 columnas; «Contactos de empleadores», 10) con las plantillas de Rua. Cada fila guarda quién la aportó (nombre, cargo, correo), cuándo y por dónde entró.

| Pieza | Dónde |
|---|---|
| Plantillas de Rua, países, validación, CSV, lectura de archivos (puro, sin imports; lo usan igual el servidor y la pantalla) | `supabase/functions/int-contactos/contactos.ts` y `paises.ts` |
| Función pública (valida con lo anterior y llama a la base con la clave de servicio) | `supabase/functions/int-contactos/index.ts` (`--no-verify-jwt`) |
| Tablas y reglas | `0167_int_contactos.sql`: `int_invitaciones`, `int_aportantes`, `int_filas.aportante_id/canal`, `int_libros.plantilla_contactos`, `int_contactos_preparar()` y las `int_contactos_*` (solo `service_role`) |
| Página pública | `contactos/publico/` (`ContactosPublico`, `UnoAUno`, `ImportarArchivo`, `MisAportes`, `texto-legal.ts`) y `contactos/api.ts`, `contactos/archivos.ts` |
| Pantalla del equipo | sección «Contactos» (`ui/Contactos.tsx`): preparar la carpeta, crear/pausar enlaces, quién aportó, exportar |
| Exportar | `lib/exportar-contactos.ts` (puro) + `ui/ExportarContactos.tsx`; también el botón «Exportar» en los detalles de las dos tablas |

**Cómo funciona el aporte**
- La invitación lleva periodo, campus (o «que cada persona elija»), dominios de correo permitidos (por defecto `udes.edu.co`), tipos, máximo por persona (200) y vencimiento. Se crea quien puede crear (Director, Planeación, Coordinadores); cambia o borra su autor o quien controla Multicampus.
- **El correo a mano NO se confirma** (no se envían correos): se comprueba el dominio y queda `correo_verificado = false`. Con **«Continuar con Microsoft»** (0171) sí queda confirmado (ver abajo). Volver a identificarse con el mismo correo da una sesión nueva y cancela la anterior; si estaba confirmado y vuelve a entrar a mano, deja de estarlo.
- La sesión de la persona es un secreto en su navegador (`sessionStorage`); la base guarda su SHA-256. Solo puede ver y quitar **sus** filas.
- **El correo del contacto es la identidad** (como en Rua): si la misma persona lo vuelve a enviar, se actualiza; si lo aportó otra persona o está en la otra lista (académicos/empleadores), se conserva el primero y se avisa. Un correo repetido dentro del mismo envío se omite.
- Cuando el campus **envía su hoja a revisión**, ya no entran ni se quitan contactos; mientras esté en borrador, sí. El máximo por persona y el cierre los hace cumplir la base.
- Anti-abuso: dominio permitido, campo trampa para robots, tope de peticiones por IP y de ingresos por hora, hasta 500 filas por envío y 2.000 por archivo.
- La invitación reemplaza a la ventana de captura para el enlace público; al crearla, las dos hojas quedan con ventana (si no tenían) para que el equipo pueda corregir filas a mano en Tablas.

### Enlace guiado por Mr. Pilo (migración 0171)

La página sigue cuatro pasos con Pilo hablando en una burbuja (palabras una a una, cara que cambia de gesto con las imágenes de `public/pilo-moods`): **1 Quién es usted** (titular «Primero necesitamos saber quién es usted.»), **2 Cómo aportar** (académicos/empleadores, uno a uno o importar), **3 Sus contactos** (formulario con ayuda de Pilo por campo y contador; o archivo en tres pasos que Pilo revisa y resume en listas, con aviso, ya estaban y con error) y **4 Recibido** («¡Felicidades! Los datos compartidos fueron recibidos con éxito.»), que sale cada vez que un envío termina bien (uno a uno al pulsar «Terminar y enviar», e importar). «Enviar y agregar otro» no sale: cuenta y sigue. Archivos nuevos en `contactos/publico/`: `GuiaPilo.tsx` (burbuja, cara, titular), `Identificacion.tsx`, `ComoAportar.tsx`, `Recibido.tsx`, `tema.tsx`. El estado de «Mis aportes», los enlaces en pausa/vencidos/cerrados, el límite por persona y el campo trampa siguen igual.

- **Dominios.** El correo se escribe como «parte local» + dominio de una lista con `udes.edu.co`, `valledupar.`, `cucuta.`, `bogota.` y `mail.udes.edu.co` (más los de la invitación). Por defecto va el del campus del enlace (Valledupar, Cúcuta, Bogotá; Bucaramanga y desconocidos, `udes.edu.co`). Si se pega el correo completo, el dominio se separa solo; si no es institucional, Pilo lo dice y no deja continuar. **El servidor manda** (`validarAportante` en `contactos.ts` y la función SQL): los cinco dominios se aceptan SIEMPRE además de los de la invitación, así que las invitaciones ya creadas con solo `udes.edu.co` o con otro dominio siguen funcionando y aceptan los cinco. Una invitación con la lista de dominios vacía sigue sin restringir.
- **Continuar con Microsoft.** El botón llama a `signInWithOAuth({ provider: "azure" })` con `redirectTo` igual al enlace. Al volver, la página (solo si la persona salió desde ese enlace, marca en `sessionStorage`) manda el `access_token` en `Authorization` a la acción `microsoft_datos` de `int-contactos`, que lo valida con `auth.getUser`, exige identidad Azure y dominio permitido y devuelve nombre y correo; enseguida la página cierra la sesión de Supabase del navegador (`signOut({ scope: "local" })`). Pilo saluda, dice que Microsoft confirmó el correo y pide **solo el cargo** (y el campus si el enlace no lo fija); la acción `identificar_microsoft` crea o reutiliza al aportante con `correo_verificado = true` (`int_contactos_identificar_microsoft`, 0171). En el encabezado aparece «Correo confirmado por Microsoft». Si la cuenta no es de un dominio permitido, Pilo lo explica y queda el formulario.
- **Aviso de cuentas.** Entrar por Microsoft crea en `auth.users`/`profiles` una cuenta **inactiva (rol Invitado)** por persona. Si un dominio completo está en `access_allowlist` con un rol, quien entre por aquí quedaría **activo** con ese rol. No se resuelve en este módulo: conviene revisar la lista de acceso antes de publicar. Además, la dirección del enlace (`/contactos/i/*`) debe estar entre las URL de redirección permitidas de Supabase Auth.
- **Tema.** Claro, oscuro (paleta «noche» de la presentación de Pilo) o automático, con un interruptor en la cabecera; `data-theme` va en el contenedor de la página, no en `<html>`, y se recuerda en `localStorage`. La intranet sigue siendo solo clara.
- **Voz de Pilo.** No hay botón «Escuchar a Pilo»: la voz oficial (`pilo-ia`, acción `voz`) depende del perfil y de las reglas de audiencia que fija la administración y gasta cupo; una página anónima sin portal propio no puede usarla. Nunca se usa la voz del navegador.
- **Movimiento.** GSAP en contextos que se revierten; ≤ 300 ms, `expo.out`, escalón de 40 ms, presión a 0,97; la burbuja cancela el mensaje anterior y no anima si cambia en menos de 0,5 s; con movimiento reducido, solo fundidos.

**Qué debe hacer quien administra:** aplicar `0171_int_contactos_microsoft.sql`; desplegar `supabase functions deploy int-contactos --no-verify-jwt`; publicar el portal; comprobar en Supabase Auth que el proveedor Azure y la URL de redirección del enlace estén permitidos.

**Exportar.** Plantilla académica y de empleadores: solo las columnas de Rua con su grafía original (se pueden volver a importar), un correo una sola vez (queda la fila más reciente). Libreta completa: las dos listas con campus, periodo, quién aportó, cuándo y por dónde entró, sin quitar repetidos. Filtros: campus, periodo, todo lo recibido o solo lo aprobado (con un periodo elegido). Excel o CSV UTF-8 con BOM.

**Pendiente (fase 3).** Verificar que el buzón existe (el proveedor de Rua, paso aparte y de pago), confirmar el correo de quien aporta cuando haya envío de correos, y el texto de autorización de datos que debe aprobar la Universidad (`contactos/publico/texto-legal.ts`).

**Pruebas.** `tests/internacionalizacion/contactos-db.test.ts` (24 casos contra la base real), `contactos-lib.test.ts`, `lib/exportar-contactos.test.ts`, `contactos-microsoft-db.test.ts` (0171), `contactos/publico/render-publico.test.ts`, `contactos/publico/interaccion-publico.test.ts` y los casos de «Contactos» en `render-internacionalizacion.test.ts`.
