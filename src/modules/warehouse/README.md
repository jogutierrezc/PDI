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
2. **La política de privacidad vive en la base** (`wh_politicas`). `wh_agregar_filas` descarta lo no permitido y reemplaza por un seudónimo (HMAC con sal propia, irreversible) el código del estudiante y el docente. Un conjunto sin política no se puede guardar.
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

## Pendiente
- Aplicar 0155, desplegar la función y definir `WAREHOUSE_MASTER_USER` / `WAREHOUSE_MASTER_PASSWORD` (cuenta de servicio, no la de una persona).
- Adaptador para los catálogos JSON, para `dv_fin`, `ms_nom` y `ms_doc` (primero su política) y para `gl_uso` (una hoja por semana).
- Decidir si el código real del estudiante se guarda (hoy es un seudónimo irreversible: sirve para contar, no para contactar).
- Re-exportar los HAR de aspirantes y capturar deserciones.
- Carga programada (cron). Las sedes Cúcuta y Bogotá ya están en el catálogo y en la función (`master-cuc` y `master-bog`, puerto 81).
- Probar la función contra Master real: la petición está verificada en el HAR, la conexión desde el servidor no.
