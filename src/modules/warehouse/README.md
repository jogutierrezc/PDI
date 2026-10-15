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
- Con los HAR de las tres plataformas, la función `warehouse` sabe pedir los reportes de `reportes.ts` (`sondear` y `cargar`; desde la pantalla, uno o varios a la vez). Cada plataforma inicia sesión aparte en `/{sistema}/mod_auth/login/`. `dv_fin` (tarea sin terminar en el HAR) y `dv_asp` (HAR cortado) quedan sin verificar: se «sondean» para escribir su política. El filtro `courses` de matriculados (semestres 5–8 y electivas en el HAR) hay que confirmarlo.

## Alertas de notas y Pilo (0159, función `warehouse-pilo`)
Basadas en el estudio de la UDES (Pérez et al., 2023; DOI 10.37885/230914480, `230914480.pdf` en la raíz): nota de aprobar 3,0 (Medicina 3,5), periodo de prueba bajo 3,2, éxito sobre 3,8, deserción 16,7× con promedio < 3,3 y 2,2× con 3,3–4,3, edad (21–25: 3,1×; 26+: 5,1×) y origen fuera de Santander (1,4×). `estudio.ts` guarda esas cifras; `reglas.ts` las usa. Niveles NE / ED / RS. «Cursos con alta reprobación» = Alerta Temprana 4 del estudio (`wh_notas_grupos`). `dv_matric` deriva `grupo_etario` y `origen` al cargar y sigue sin guardar la fecha de nacimiento ni la ciudad.
Pilo (`PanelPilo.tsx`) recibe solo un resumen agregado (`paraPilo.ts`: conteos por nivel, programa y materia; sin códigos), responde en JSON y cada cifra se verifica contra los datos y el estudio (`warehouse-pilo/analisis.ts`). Usa el proveedor de IA de Mr. Pilo; bitácora en `news_runs`.
Lo que el estudio usa y estos datos NO tienen: Saber 11, tutorías asistidas, estrato, trabajo, entorno familiar. Con ellos se podría estimar el riesgo de cada estudiante como lo hace el estudio (regresión logística); hoy solo se ordena con sus cifras.

## Pendiente
- Aplicar 0155, desplegar la función y definir `WAREHOUSE_MASTER_USER` / `WAREHOUSE_MASTER_PASSWORD` (cuenta de servicio, no la de una persona).
- Adaptador para los catálogos JSON, para `dv_fin`, `ms_nom` y `ms_doc` (primero su política) y para `gl_uso` (una hoja por semana).
- Aplicar 0161 y **volver a cargar** los reportes de notas y matriculados: lo ya guardado conserva su seudónimo `x-…` (no se revierte) hasta que haya una versión nueva.
- Re-exportar los HAR de aspirantes y capturar deserciones.
- Carga programada (cron). Las sedes Cúcuta y Bogotá ya están en el catálogo y en la función (`master-cuc` y `master-bog`, puerto 81).
- Probar la función contra Master real: la petición está verificada en el HAR, la conexión desde el servidor no.
