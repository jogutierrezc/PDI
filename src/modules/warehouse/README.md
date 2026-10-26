# Warehouse UDES

Guarda por periodo los reportes de Master, Galileo y Davinci para consultarlos sin volver a pedirlos, con gráficos y alertas tempranas de rendimiento académico. Ruta: `/admin/warehouse/:seccion?` (`tablero`, `catalogo`, `cargas`, `explorar`, `alertas`, `almacen`; periodo y sede en `?periodo=2026b&sede=buc`). Pantalla de roles: `warehouse`, solo Planeación o superior (como en la base, `wh_autorizado()`). Temas claro y oscuro por tokens.

## Piezas
| Archivo | Qué es |
| --- | --- |
| `supabase/migrations/0155_warehouse_udes.sql` | tablas `wh_*`, políticas de privacidad, funciones de carga, vistas |
| `supabase/functions/warehouse/` | `motor.ts` (lógica pura, la usan también el navegador y las pruebas) e `index.ts` (pide a Master con la cuenta de servicio) |
| `conjuntos.ts` | catálogo de conjuntos (de los HAR de `har warehouse`) |
| `reglas.ts` | alertas tempranas, lógica pura |
| `store.ts` | lectura y carga contra Supabase |
| `graficos.tsx` | barras, anillo, líneas, mapa de calor, dispersión, apiladas (SVG con tokens) |
| `Warehouse.tsx` + una pantalla por sección | la interfaz |
| `tests/warehouse/` | SQL (PGlite), motor, reglas y coherencia catálogo ↔ políticas |

## Decisiones
1. **Una sola tabla de filas (`wh_filas`, jsonb)** en vez de una tabla por conjunto: el encabezado de muchos reportes no se capturó. Cada conjunto con columnas confirmadas suma una vista tipada (`v_wh_rendimiento` hoy).
2. **La política de privacidad vive en la base** (`wh_politicas`). `wh_agregar_filas` descarta lo no permitido y reemplaza por un seudónimo (HMAC con sal propia, irreversible) lo que la política marque en `seudonimizar` (hoy, la identificación del docente). Desde **0161** el **código real del estudiante se conserva** (sin nombre) y la política lo marca como **dato personal** (`datos_personales`; finalidad: seguimiento académico; acceso restringido por unidad: solo Planeación lee `wh_filas`, y el Monitor lo entrega por funciones `security definer` filtradas por `unit_can_view`). Nunca se guardan nombres, documento, nacimiento, dirección, salud, contraseñas, correo ni teléfono: un CHECK impide ponerlos en una lista «permitir». La sal/HMAC sigue disponible como opción de la política para otros conjuntos. Un conjunto sin política no se puede guardar.
3. **No se guarda el Excel original**: trae documento, dirección, salud, contraseñas. Queda el manifiesto (nombre, huella, columnas).
4. **La huella es del contenido**, no del archivo: el .xlsx lleva la hora de creación. La misma huella no crea versión.
5. **Versiones**: recargar con contenido distinto crea otra versión y deja la anterior «reemplazada». Un periodo cerrado exige motivo; cerrarlo es de Planeación, reabrirlo de la administración.
6. **Periodo del rendimiento**: Master solo entrega el periodo abierto en la sesión; la función lo lee de `current_period` y no deja elegirlo. Historial = cargar cada corte cuando ocurre.
7. **Quién escribe**: nadie directo en las tablas; todo por `wh_abrir_carga → wh_agregar_filas → wh_cerrar_carga`, con la sesión de quien carga (también desde la función).

## Lo que los HAR dieron (y no)
- `ma_rendimiento` (HAR «Reporte de notas global y por corte»): `POST /master/mod_reports/reports/matriculated_mortality/download/` con `{period: "1"|"2"|"3"|"f", title}`. Excel en base64 con una fila por **grupo**: código, letra, nombre, plan, «Programa» (en realidad el departamento), docente, matriculados, reprobados, aprobados, no presenta, %, promedio. ~1.879 filas por corte. **No trae notas por estudiante.**
- Notas por estudiante y materia: `dv_notas` = «Reporte global de notas» de Davinci (`global_scores/{periodo}/download/`; HAR `rendimientoacademicoporestudiante`, que estaba en `Roomy App/roomy/har2`): P1, P2, P3 y acumulada, ~29.000 filas y ~4.250 estudiantes en Bucaramanga. Deserciones (`dv_deser`) sigue sin HAR.
- Velocidad (0157): `wh_notas_resumen` entrega un renglón por estudiante (la pantalla no baja las 29.000 filas); las páginas de filas se piden de a cuatro en paralelo; una versión guardada no se vuelve a pedir (no cambia); la sal del seudónimo se lee una vez por llamada.
- Con los HAR de las tres plataformas, la función `warehouse` sabe pedir los reportes de `reportes.ts` (`sondear`, `cargar` y `periodos`; desde la pantalla, uno o varios a la vez, en una o en las cuatro sedes). Cada plataforma inicia sesión aparte en `/{sistema}/mod_auth/login/`. `dv_fin` (tarea sin terminar en el HAR) queda sin verificar. El filtro `courses` de matriculados (semestres 5–8 y electivas en el HAR) hay que confirmarlo.
- Los HAR de octubre de 2026 (carpetas `Master Har` y `davinci har`, todos de Bucaramanga) corrigieron el aspirantes (vive en Master; bajo `/davinci/` responde 404), la nómina (ruta y Excel nuevos) y añadieron ocho reportes. Los Excel de varias hojas o con títulos de varias filas se leen con los lectores `tabla`, `aspirantes` y `desercion` (`motor.ts`).

## Importadores y su estado frente a los HAR
Estado: **funciona** (coincide con un HAR), **corregido** (el HAR mostró otra cosa y se cambió), **nuevo** (HAR nuevo), **sin HAR nuevo** (no cambia; sigue como estaba). Todo está verificado solo contra Bucaramanga.

| Conjunto | Plataforma · ruta | Entrega | Estado |
| --- | --- | --- | --- |
| `ma_rendimiento` | Master · `matriculated_mortality/download/` (`?selected_period`) | archivo | funciona |
| `dv_matric` | Davinci · `students_matriculated/{p}/download/` | archivo | sin HAR nuevo (filtro `courses` sin confirmar en otras sedes) |
| `dv_global`, `dv_notas` | Davinci · `global_enrollments`, `global_scores` | archivo | sin HAR nuevo |
| `dv_fin` | Davinci · `general_enrollment_and_financial_report/{p}/task/` | tarea | sin HAR nuevo; sin verificar, sin política |
| `dv_grad` | Davinci · `graduates/{p}/all/download/` | archivo | funciona |
| `dv_homol` | Davinci · `homologations_report/{p}/download/` | archivo | corregido (lector: el Excel trae títulos antes de la tabla; verifica el periodo del título) |
| `ms_asp` | **Master** · `applicants_consolidated/{p}/download/` (`formation: pre`) | archivo | corregido (estaba en Davinci: 404) |
| `ms_asppos` | Master · igual con `formation: pos` | archivo | nuevo, sin verificar (ningún HAR de posgrado) |
| `dv_cred` | Davinci · `credits_sumary/{p}/download/` | archivo | nuevo |
| `dv_prom` | Davinci · `student_averages/{p}/download/` | archivo | nuevo |
| `dv_cond` | Davinci · `conditionalities/{p}/download/` | archivo | nuevo |
| `dv_deser` | Davinci · `general_defactor_history/download/` (`is_posgraduate: false`) | archivo | nuevo (ya estaba en el catálogo sin reporte) |
| `dv_deserpos` | Davinci · igual con `is_posgraduate: true` | archivo | nuevo, sin verificar |
| `ms_nuevos` | Master · `new_students_matriculated/download/` | archivo | nuevo |
| `ms_activos` | Master · `active_students/` | tarea | nuevo (el HAR sí la muestra terminar) |
| `ms_actdir` | Master · `mod_activities/activities/download/` | archivo | nuevo |
| `ms_posgmat` | Master · `postgraduate_enrollments_groups/download/` | archivo | nuevo (distinto de `ms_posg`) |
| `ms_nom` | Master · `paysheet/consolidated/download/` (antes `consolidated_table`) | tarea | corregido (ruta, cuerpo, lector y política) |
| `ms_comp`, `ms_eval` | Master · `get_consolidated_by_competence_xls`, `get_consolidated_report` | archivo | funciona; lector corregido (títulos antes de la tabla). El HAR no lleva `selected_period` en la URL |
| `ms_hordep` | Master · `excel/departments_schedules/download/` | archivo | funciona |
| `ms_hor`, `ms_audit`, `ms_posg`, `gl_uso` | Master / Galileo | archivo | sin HAR nuevo |
| `ms_doc`, `gl_eq`, `dm_*` | catálogos JSON | json | sin HAR nuevo (las listas de periodos `periods_applicants` y `periods_to_student_desertion_report` se usan para validar aspirantes y deserciones) |

Los datos personales de los Excel nuevos nunca se guardan: cada conjunto tiene su política en `wh_politicas` (0193). Lo que conservan, el código real del estudiante, queda marcado como dato personal (0161).

## Multicampus (Bucaramanga, Cúcuta, Valledupar, Bogotá)
- El servidor es `https://master-{sede}.udes.edu.co:81` (o `WAREHOUSE_MASTER_URL_{SEDE}`). Cada sede y cada plataforma inician sesión por separado; la función cierra la sesión al terminar. En Master se comprueba además `mod_auth/headquarter`: si el servidor de una sede responde como otra, la carga se detiene.
- El título de cada petición lleva el código de la sede (BUC, VAL, CUC, BOG; el nombre completo en la evaluación docente). Rutas y cuerpos son los de Bucaramanga: ningún HAR de las otras tres.
- La clave de cada carga incluye la sede (`wh_cargas`: conjunto, periodo, sede, corte): la huella y las versiones de una sede nunca reemplazan a las de otra. En la pantalla, la lista de periodos y los datos se piden por sede.
- «Sondear» por sede compara las columnas del archivo con las que la política conserva (`faltan`, `otroReporte`), muestra el periodo que dice el archivo y avisa lo que puede ser propio de Bucaramanga (filtro `courses` de `dv_matric`, `dpt_ref` e `is_posgraduate` de `ms_posg`). Un 404 o 403 de la plataforma sale con su explicación.
- «Traer varios reportes» permite marcar las cuatro sedes: sedes en paralelo, reportes uno tras otro dentro de cada sede, y un resultado por celda (guardado, sin cambios o error legible).

## Periodo
Toda carga se guarda con un periodo (`2026b`) o con `permanente` (catálogos).
- **ruta** (Davinci, aspirantes): el periodo va en la URL; se valida contra la lista de la plataforma y, si el Excel lo dice (títulos, nombre de hojas), contra el archivo.
- **consulta** (`ma_rendimiento`, `ms_comp`, `ms_eval`): `?selected_period=`. `ma_rendimiento` está probado; los otros dos no dicen su periodo en el archivo y, si se pide uno distinto del abierto, se guardan marcados «sin confirmar».
- **cuerpo** (`ms_nom`, `ms_nuevos`, `ms_activos`): `selected_period` en el cuerpo (`null` si es el abierto) y también en la URL. Nómina y activos dicen su periodo (título del Excel, nombre de la tarea) y se comparan; nuevos matriculados no lo dice, así que solo se acepta el periodo abierto de la sede.
- **sesión** (horarios, auditoría, posgrado, actividades, uso de aulas, deserciones): la plataforma solo entrega el periodo abierto. Si se pide otro, la carga falla con «periodo distinto del pedido» en vez de guardarse con la etiqueta equivocada.
- **sin periodo**: el histórico de deserciones no lleva periodo en la ruta; se asocia al periodo abierto, que debe coincidir con su última columna. Los catálogos se guardan como `permanente`.
- Si la plataforma o el archivo dicen otro periodo que el pedido, no se guarda nada. En una subida manual se hace la misma comprobación con el archivo.
- La lista de periodos de la pantalla sale de `get_periods` de la sede (acción `periodos`) más los ya guardados; sin respuesta de la plataforma, los guardados más los calculados desde 2018b. La búsqueda `?periodo=2026b` funciona para todos los conjuntos.

## Alertas de notas y Pilo (0159, función `warehouse-pilo`)
Basadas en el estudio de la UDES (Pérez et al., 2023; DOI 10.37885/230914480, `230914480.pdf` en la raíz): nota de aprobar 3,0 (Medicina 3,5), periodo de prueba bajo 3,2, éxito sobre 3,8, deserción 16,7× con promedio < 3,3 y 2,2× con 3,3–4,3, edad (21–25: 3,1×; 26+: 5,1×) y origen fuera de Santander (1,4×). `estudio.ts` guarda esas cifras; `reglas.ts` las usa. Niveles NE / ED / RS. «Cursos con alta reprobación» = Alerta Temprana 4 del estudio (`wh_notas_grupos`). `dv_matric` deriva `grupo_etario` y `origen` al cargar y sigue sin guardar la fecha de nacimiento ni la ciudad.
Pilo (`PanelPilo.tsx`) recibe solo un resumen agregado (`paraPilo.ts`: conteos por nivel, programa y materia; sin códigos), responde en JSON y cada cifra se verifica contra los datos y el estudio (`warehouse-pilo/analisis.ts`). Usa el proveedor de IA de Mr. Pilo; bitácora en `news_runs`.
Lo que el estudio usa y estos datos NO tienen: Saber 11, tutorías asistidas, estrato, trabajo, entorno familiar. Con ellos se podría estimar el riesgo de cada estudiante como lo hace el estudio (regresión logística); hoy solo se ordena con sus cifras.

## Pendiente
- Aplicar 0155, desplegar la función y definir `WAREHOUSE_MASTER_USER` / `WAREHOUSE_MASTER_PASSWORD` (cuenta de servicio, no la de una persona).
- Aplicar **0193** (políticas de los conjuntos nuevos y columnas de la nómina) y volver a desplegar la función `warehouse` (`index.ts`, `motor.ts` y `reportes.ts`).
- `dv_fin`: sin política ni HAR completo.
- Aplicar 0161 y **volver a cargar** los reportes de notas y matriculados: lo ya guardado conserva su seudónimo `x-…` (no se revierte) hasta que haya una versión nueva.
- HAR de Cúcuta, Valledupar y Bogotá, y de los reportes de posgrado (`ms_asppos`, `dv_deserpos`).
- Carga programada (cron). Las sedes Cúcuta y Bogotá ya están en el catálogo y en la función (`master-cuc` y `master-bog`, puerto 81).
- Probar la función contra Master real: la petición está verificada en el HAR, la conexión desde el servidor no.
