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

## Las pantallas (paquete 2)

`/admin/datos-sostenibilidad`, con entrada en el lanzador y en el menú (`AdminShell`). Pertenecer a `ds_miembros` es el permiso (`inDatosSostenibilidad` en `lib/auth.tsx`).

| Pantalla | Qué hace |
|---|---|
| `DatosSostenibilidad.tsx` | El shell: selector de oficina (`useYo`), riel con Libros y Equipo, banner de Planeación observador, aviso de migración pendiente. La oficina y el libro abierto viajan en la dirección (`?oficina=…&libro=…`). |
| `ExploradorLibros.tsx` | Carpetas como pestañas (las fijas y las propias), libros con filas, errores, estado y a qué indicadores responden; marcar listo, volver a borrador, borrar; nueva carpeta. |
| `AsistenteLibro.tsx` | «Nuevo libro»: en blanco (columnas a mano) o subiendo un Excel/CSV — `leerArchivoEnNavegador` + `columnasDesdeMatriz` de pc proponen columnas con tipo y filas. Nada sale del navegador hasta Crear. |
| `EditorLibro.tsx` | Tres pestañas: **Filas** (grilla de celdas tipadas, errores pintados, «siguiente error», pegar desde Excel con o sin reemplazo, guardar por lotes), **Columnas** (añadir, tipo, obligatoria, opciones; la clave de una existente no se toca), **Responde a** (conectar el libro a un indicador con `autoMap`, ver lo que falta, desconectar). |
| `EquipoOficina.tsx` | El equipo de la oficina: añadir gestor o colaborador del directorio de la intranet, quitar. Del gestor o de la administración. |

## Dudas abiertas

- El catálogo solo trae los indicadores del ODS 13: cuando UDES Verde y Planeación definan el marco completo (los 17 ODS del THE), la administración los siembra en `ds_indicadores` (y el espejo `INDICADORES_DS` se actualiza con ellos).
- Las oficinas son unidades del organigrama (`units`): UDES Verde y Planeación Institucional tienen que existir como unidades; las crea la administración en Mis Tableros.
- La lectura que UDES Sostenible haría de estos libros (alimentar las cifras del portal ODS desde `ds_respuestas`) no está en este paquete: primero los libros deben existir.
