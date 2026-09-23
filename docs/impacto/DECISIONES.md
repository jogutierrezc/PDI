# Módulo Impacto · decisiones

Registro de decisiones menores y supuestos. Las decisiones que cambian el diseño se consultan antes.

## Etapa de diseño (2026-09-23)

### Diseño
- **Una sola propuesta visual**, por decisión expresa del usuario, construida con impeccable dentro del mundo visual existente (tokens, Fraunces + Manrope, temas claro y oscuro). DESIGN.md no cambia.
- **Portal «Impacto Institucional»** en `/impacto`: solo con sesión (`RequireRole minimum="consulta"`); la entrada «Impacto» de la barra superior solo aparece si hay sesión.
- **Lo orgánico entra por la forma, no por color nuevo**: la cadena de valor se dibuja como tres cauces (uno por función) que cruzan las cuatro estaciones; piedras con radios desiguales; borde de sección ondulado. Los radios fuera de la escala de DESIGN.md son intencionales en este módulo.
- **Tintas por función**: Investigación `--od-series-1`, Enseñanza `--od-series-3`, Extensión `--od-series-2`, las de las series de UDES en Cifras.
- **Lentes**: vicerrectoría, facultad, programa y campus. En la lente de campus solo se ven los indicadores que se reportan por sede; los que se reportan por programa no se reparten entre sedes.
- **Simplicidad**: la cadena de una unidad muestra por defecto solo lo que tiene cifra; lo demás aparece con un clic. El vacío se dibuja hueco y dice por qué (sugerido, fuera del piloto, sin desagregar, sin registros).
- **Intranet `/admin/impacto`**: una pantalla, cuatro vistas (Catálogo, Periodo, Mi reporte, Revisión). Captura en patrón lista + ficha al lado, sin modales.

### Datos del prototipo
- El catálogo sale de la matriz real: `scripts/build-impacto-matriz.py` genera `src/modules/impacto/data/matriz.generated.ts`. Resultado con la vr7: 106 indicadores (37 · 27 · 42), 93 oficiales y 13 sugeridos, 55 variantes de unidad, 81 líneas base «Por definir» (27 + 12 + 42), 13 dimensiones «Por definir» (las de los 13 sugeridos).
- Códigos asignados en el orden de la matriz: I01–I37, E01–E27, X01–X42.
- **Facultades**: las siete de la migración 0016. **Programas y su oferta por sede: ilustrativos**, igual que todas las cifras de programas. Cada vista lo dice.
- **Vicerrectorías**: Investigaciones, Enseñanza y Extensión, con el nombre que usa la columna RESPONSABLE de la matriz.
- El estado de la intranet vive en `localStorage` (`impacto:prototipo`) hasta que exista el modelo en Supabase (fase 1). «Ver como» cambia de persona para recorrer el circuito en una sola sesión.

### Fichas técnicas del piloto (supuestos)
| Código | Indicador | Tipo | Supuestos |
| --- | --- | --- | --- |
| I01 | Estudiantes vinculados a semilleros | conteo | Solo pregrado; programa × sede. El 1920 de la columna de unidad se trata como hallazgo (probable línea base desplazada). |
| I04 | Profesores en actividades de investigación | conteo | Todos los niveles; programa × sede. |
| I34 | Desempeño académico en formación investigativa | comparación | Promedio ≥ 4,0; grupo de comparación: estudiantes del mismo programa que no participan. Anual. |
| E01 | Profesores con maestría y doctorado | razón, precargado | Desde Gestión Humana; el programa confirma o declara discrepancia. |
| E03 | Beneficiarios de PAIPE | conteo | Pregrado; programa × sede. |
| E04 | Tasa de retención | razón, precargado | Desde Registro y Control; umbral de variación 15 %. |
| E08 | Horas de formación profesoral | razón | Horas ÷ profesores; admite valores mayores que 1. Anual. |
| E13 | Innovaciones pedagógicas | conteo | Evidencia obligatoria; umbral 50 %. Anual. |
| E10 | Resultados Saber Pro | puntaje, precargado | Rango 0–300; n mínimo 10; promedio ponderado por evaluados. Anual. |
| X04 | Profesores vinculados a extensión | conteo | Programa × sede. |
| X07 | Proyectos de proyección social activos | conteo | Evidencia obligatoria (acta de inicio o informe); pregrado y especialización. |
| X18 | Beneficiarios directos | conteo | Umbral 40 %. |
| X22 | Percepción de cambios favorables | razón, encuesta | n mínimo 30; anual. |

Umbral de variación por defecto: 30 %. Vicerrectoría validadora: la de la función del indicador.

### Reglas ya implementadas en el prototipo
- Consolidación en `data/aggregate.ts`: suma, razón de sumas (nunca promedio de porcentajes), promedio ponderado, no agregable.
- Validaciones V01–V11 en un único servicio, `data/validate.ts`, pensado para que lo use también la importación de Excel (fase 6).
- Separación de funciones: nadie aprueba ni valida lo que capturó.
- Devoluciones con motivo de lista cerrada y comentario obligatorio; la bitácora de transiciones solo crece.

### Pendiente (fases 1–8)
Modelo en Supabase y migraciones, importador real con reporte descargable, edición persistente de fichas y versiones, carga de precargados, plantilla Excel con HMAC y su importación, pruebas de aceptación.

## Fase 0 · exploración y plan (2026-09-23)

- **Estructura existente**: se reutilizan `units`, `unit_members` y `campuses` en lugar de crear `unidad_organizacional`, `usuario_rol` y `sede`. (Usuario.)
- **Roles configurables**: `access_roles` gana capacidades de Impacto y `unit_members` gana el rol con el que cada persona trabaja en cada unidad. Planeación puede crear roles nuevos. (Usuario.)
- **Dependencias aprobadas**: ExcelJS, Vitest y PGlite. (Usuario.)
- **Semillas de prueba fuera de las migraciones**: `supabase/seed/impacto_prueba.sql`. (Usuario.)
- Tablas nuevas con prefijo `imp_` y nombres en inglés, como el resto del esquema; la correspondencia con la especificación está en PLAN.md.
- HMAC de la plantilla con `pgcrypto` y clave guardada en la base, fuera del alcance de `anon` y `authenticated`.
- La matriz vr7 queda en la raíz del repositorio (`UDES_Matriz_Impacto_Institucional_vr7.xlsx`), donde la dejó el usuario, y no en `docs/impacto/`.

## Fase 1 · modelo de datos (2026-09-23)

- **Migraciones**: 0063 (estructura y roles), 0064 (modelo), 0065 (catálogos de PORTADA). Se aplican en orden en el editor SQL.
- **Bogotá** se agrega a `campuses` en **borrador**: existe para Impacto y el portal público de campus no la muestra hasta publicarla.
- **Capacidades de Impacto** en `access_roles.capabilities` (`impacto.catalogo`, `.periodo`, `.capturar`, `.enviar`, `.aprobar`, `.validar`) y rol por unidad en `unit_members.access_role_id`. Cinco roles de partida marcados como del sistema.
- **Capturar no se hereda** (`imp_can(cap, unidad, inherit => false)`); aprobar sí baja de la facultad a sus programas; validar va por la función de la vicerrectoría (`units.substantive_function`).
- La administración (`profiles.role = admin`) conserva las capacidades globales de Impacto, como en 0061.
- **Estado de la ficha** calculado (`imp_sheet_complete(indicador)`), no marcado a mano.
- **Valor del registro** calculado por un disparador; lo que mande el cliente se ignora. `version` sube en cada cambio para detectar conflictos con plantillas viejas.
- **Quitar una asignación** es `active = false` con justificación obligatoria; agregar a mano exige justificación.
- **Bitácoras** (`imp_transitions`, `imp_import_batches`, `imp_import_batch_records`): disparadores que rechazan UPDATE, DELETE y TRUNCATE también para el dueño, y sin permisos de escritura para `authenticated`. Se escriben solo desde funciones `security definer` (fases 6 y 7).
- **Transiciones permitidas** en `imp_transition_allowed`; devolver exige motivo de la lista y comentario.
- Los 14 ODS de PORTADA son los que se siembran; un ODS fuera de la lista será hallazgo del importador, no se agrega para que cuadre.
- **Vitest 2** (no 5): Vitest 5 pide Vite 6+ y el proyecto usa Vite 5.
- **Corrección en 0061**: `board_under_review(target)` comparaba contra la columna `board_reviews.target` en vez del parámetro, y Postgres rechazaba la función al crearla. Ahora usa `board_under_review.target`.

## Fase 2 · importador de la matriz (2026-09-23)

- **El Excel se lee en el navegador** (`src/modules/impacto/import/matrix.ts`, con ExcelJS cargado solo al importar) y la base recibe lo normalizado por la RPC `imp_import_catalog` (0066), en una sola transacción.
- **Resultado con la vr7**: 106 indicadores (37 · 27 · 42), 93 oficiales, 13 sugeridos, 428 hallazgos en 19 tipos.
- **Unidad de medida**: se mapea a las seis del catálogo solo cuando la celda trae una sola medida. Las que traen dos («N° proyectos / proporción», 20 casos) o ninguna reconocible (5) quedan vacías con hallazgo; la unidad la fija Planeación en la ficha.
- **Porcentajes escritos como fracción** (0.69 con unidad «% docentes», 9 casos): se importan tal cual y se reportan. No se multiplica por 100 sin que alguien lo confirme.
- **Líneas base**: «Por definir» (81) y «No existe» (10) quedan vacías con hallazgo; «≥13 horas» también (texto, 1 caso).
- **Metas «Por definir»** (108) no se guardan como meta; se reportan.
- **Proyectos**: «Proyecto N» se normaliza a PrN y se reporta (83). No se reconocen y se reportan: cinco «Proyecto 8» en Extensión (PORTADA define siete) y un «r6» en Investigación (probable Pr6); no se corrigen.
- **ODS 2 y 7** en I32 no están en la lista de PORTADA: se importan como alineación y se reportan.
- **Responsables múltiples** (45 celdas): se conserva el texto; el validador único lo fija la ficha. Por defecto, la vicerrectoría de la función.
- **Años de meta**: el año sale del encabezado de cada hoja; Extensión (META 2025) se reporta frente a META 2026 de las otras dos.
- **Reimportar**: si ya hay un borrador, se niega; `imp_discard_draft` lo borra. Al crear un borrador se copia la ficha técnica de la última versión publicada por código de indicador.
- **Reporte de hallazgos**: Excel (hoja «Hallazgos» con filtros y hoja «Resumen» por tipo) y CSV con `;` y BOM, que Excel en español abre sin romper tildes.
- **Prueba de humo**: el simulador de Supabase no entendía `gt`, `lt` ni `order` y la paginación por llave de UDES en Cifras no terminaba; corregido.

## Fase 3 · administración del catálogo (2026-09-23)

- **La vista Catálogo trabaja sobre la base** (0067). La abre quien tenga Planeación o más en su sesión real; la base exige además `impacto.catalogo`. Las vistas Periodo, Mi reporte y Revisión siguen con el «Ver como» del prototipo hasta sus fases.
- **Estado de la ficha** en la vista `imp_indicators_admin` (`sheet_complete`) y lo que falta en palabras (`imp_sheet_missing` / `imp_indicator_missing`): tipo de cálculo, numerador, denominador (si es razón o comparación), factor, agregación, sentido, periodicidad, nivel de reporte, niveles de formación, modo de captura, unidad, vicerrectoría validadora, n mínimo (si es puntaje) y tipo de evidencia (si es obligatoria).
- **Publicar** (`imp_publish_catalog`) se niega si un indicador en piloto tiene la ficha incompleta, y nombra los códigos; también si no hay ninguno en piloto.
- **Cambiar algo publicado** es `imp_new_draft`: copia la última versión publicada (fichas, metas, líneas base, alineaciones) a la versión siguiente en borrador. La publicada no cambia. Los hallazgos no se copian: son del archivo importado.
- **Códigos**: se asignan al importar en el orden de la matriz, se editan a mano (únicos por versión) y `imp_renumber_codes` los vuelve a asignar en el orden de la matriz.
- **Hallazgos**: se marcan resueltos o aceptados con nota, en cualquier versión; un disparador registra quién y cuándo, y reabrir lo borra.
- **Fichas del piloto precargables**: «Precargar las fichas propuestas del piloto» escribe en el borrador las 13 fichas de este documento, emparejadas por nombre del indicador (no por código). Planeación las revisa antes de publicar; no se publican solas.
- **Prueba de humo**: el simulador responde las RPC desde `FIXTURES["rpc:nombre"]`, y hay una ruta para el Catálogo.

## Fase 4 · periodos, asignaciones y precargados (2026-09-23)

- **Reglas de asignación** (`imp_assignment_candidates`, 0068): oficial en la versión del periodo, **ficha completa**, periodicidad (anuales solo en `-2`), reporte por programa o por programa y sede, programa con al menos una sede activa, nivel de formación en «aplica a» y, si la ficha nombra modalidades, la del programa entre ellas. Exigir la ficha completa no estaba escrito en la especificación: sin ella no se sabe qué pedir ni cómo validarlo.
- **Abrir es en dos pasos**: `imp_preview_assignments` no escribe nada; `imp_open_period` crea periodo, asignaciones y un registro en borrador por cada una activa, en una sola transacción.
- **Quitar** deja la asignación con `active = false` y su justificación; **agregar** la marca `manual` con la suya. Ninguna se borra. Con el periodo abierto, `imp_set_assignment` no quita una asignación cuyo registro ya salió del programa.
- **Programa activo** = tiene al menos una sede activa en `imp_program_campuses`; `units` no tiene una marca propia de activo.
- **Precargados** (`imp_load_preloaded`): el programa se identifica por código SNIES o por el código de la unidad; la sede por su nombre o slug. Se carga en el registro, se guarda aparte lo que llegó (`imp_records.preloaded`: numerador, denominador, n, archivo, fecha y quién) y `confirms_preloaded` vuelve a nulo para que el programa confirme o declare la discrepancia. Nunca sobrescribe un registro enviado. Devuelve cuántas filas cargó y el motivo de cada una que no.
- **Archivo de precargados**: CSV (`;` o `,`, con BOM y comillas) o la primera hoja de un Excel, con encabezados indicador, programa_snies, programa, sede, numerador, denominador y n. La pantalla genera la plantilla del periodo con una fila por registro precargado.
- **Cerrar** un periodo impide cargar precargados y cambiar asignaciones.
- La vista **Periodo** ya trabaja sobre la base y, como el Catálogo, la abre la sesión real con Planeación o más.

## Fase 5 · captura en línea (2026-09-23)

- **Dos modos de trabajo** (pedido del usuario) sobre los mismos registros y el mismo servicio de validación: **sencillo** (lista y ficha de un indicador) y **hoja de cálculo** (rejilla tipo Excel: edición en la celda, flechas, Tab, Enter, F2, Escape, Supr, Ctrl+C, Ctrl+V desde Excel, Ctrl+S; editables en amarillo, bloqueadas en gris, errores en rojo). El modo se recuerda en el navegador. Las columnas de la hoja son las de la plantilla de la fase 6.
- **Validaciones**: viven solo en `validate.ts` y las usan los dos modos (y la importación de la fase 6). La base garantiza lo estructural (no negativos, valor calculado, flujo, permisos) y no repite reglas V01–V12.
- **Conflictos**: guardar compara `version`; si alguien guardó antes, no se pisa y se avisa.
- **Quién capturó**: un disparador anota `captured_by` la primera vez que alguien con `impacto.capturar` en el programa escribe datos (un precargado no cuenta) y `updated_by` en cada guardado. Es la base de la separación de funciones de la fase 7.
- **Evidencias**: bucket privado `impacto`, una carpeta por registro (`<registro>/<archivo>`); PDF, Excel o imagen de hasta 10 MB, o un enlace. Se ven con enlace firmado de 5 minutos. Se agregan y quitan al momento, sin esperar a «Guardar».
- **Envío** (`imp_submit_program`): lo hace quien tenga `impacto.enviar` en el programa, con la certificación; mueve a «enviado» todos los registros en borrador o devueltos y deja una transición por registro con el texto de la certificación.
- **Valor del periodo anterior**: el del mismo indicador, programa y sede en el último periodo anterior **validado**; sin él, V05 no se aplica.
- **Mi reporte** se muestra a quien captura en algún programa (`imp_my_programs`), no por el «Ver como» del prototipo. La ficha abre primero lo devuelto.
- **Observaciones** del programa se guardan en los dos modos.

## Fase 6 · plantilla Excel e importación (2026-09-23)

- **Plantilla firmada por la base** (`imp_sign_template`, 0070): cada descarga queda en `imp_templates` con programa, periodo, versión del catálogo, fecha de generación y asignaciones. La huella es HMAC-SHA256 de esos datos con una clave que vive en `imp_secrets` (sin acceso desde la aplicación). La hoja CONTROL va *muy oculta* y lleva esos datos y la huella.
- **Protección de hojas**: clave aleatoria por plantilla, guardada en la base y no mostrada. Es una comodidad para no escribir donde no toca; la garantía real es la huella. ExcelJS no protege la estructura del libro: cada hoja se protege por separado (sin insertar ni borrar filas o columnas).
- **Rechazo del archivo completo** (con el motivo en español): hojas o encabezados cambiados, CONTROL incompleto, huella que no coincide («fue alterada»), otro programa, periodo cerrado, otra versión del catálogo o asignaciones que cambiaron después de generar la plantilla. «Versión de catálogo vigente» = la del periodo.
- **La validación sigue en un solo lugar**: la vista previa usa `validate.ts` igual que la captura en línea; la base revisa pertenencia a la plantilla, estado editable y permisos. Cada error dice fila y columna.
- **V07 (evidencia obligatoria) se exige al enviar, no al importar**: los archivos se suben después en la plataforma; un enlace en la columna S cuenta como evidencia.
- **Celda vacía no borra**: solo se mandan los campos escritos y distintos de lo guardado. Filas de registros enviados o aprobados salen como «omitida» en la vista previa y como error si llegaran a la base.
- **Conflicto**: si el registro se guardó en línea después de generar la plantilla y ya tenía datos, la fila queda «en conflicto» y la dirección elige, fila por fila, cuál conservar (por defecto, lo guardado en línea).
- **IMPORTACION_TODO_O_NADA** vive en `imp_settings` (por defecto `false`: carga parcial) y lo cambia quien tenga `impacto.periodo`. Con `true`, un error en el navegador o en la base cancela todo el archivo.
- **Bitácora**: cada importación deja un lote en `imp_import_batches` (leídas, cargadas, con error, informe) y sus registros en `imp_import_batch_records`; ambos solo admiten inserción. Los registros cargados quedan en borrador con canal `excel`; importar nunca envía.
- **Devolver errores**: «Plantilla con errores marcados» descarga el mismo archivo con la columna V «Errores» y las celdas en rojo; ese archivo se puede corregir y volver a importar.
