# Monitor de alertas tempranas

Portal dentro de la intranet donde las facultades y los programas ven cómo van las notas de sus estudiantes: **Institución → Facultad → Programa → Grupo → Estudiante (por su código real, sin nombre)**, con el semáforo **NE · ED · RS** y, al final de cada vista, el análisis de Pilo. Ruta: `/admin/monitor-alertas` (`?periodo=&sede=&corte=&f=&p=&m=&g=&e=`). Pantalla de roles: `monitor`. Claro y oscuro por tokens; animaciones con GSAP (solo transform y opacidad, menos de 300 ms) que respetan «reducir movimiento».

## Quién ve qué (sin claves)
Lo deciden los roles y las unidades que ya asigna Planeación (migración `0160`):
- Planeación (con la pantalla `monitor`) y la administración ven todo.
- Quien pertenece a una facultad o a un programa (`unit_members`) ve lo de esa unidad y de las que cuelgan de ella (`unit_can_view`): una decanatura ve sus programas; una dirección, el suyo.
- La seguridad está en la base: las funciones `wh_monitor_*` solo devuelven lo permitido y ninguna entrega nombres (no se guardan; solo el código del estudiante).
- Davinci conoce los programas por un código interno. `wh_programas_unidad` los asocia a las unidades del organigrama; Planeación lo completa en el propio Monitor («Sugerir por nombre» + asignación a mano). Un programa sin unidad solo lo ve Planeación.

## El código del estudiante (migración `0161`)
Decisión de Planeación: el programa puede saber **quién es** su estudiante, **sin nombre**. Desde `0161` el Warehouse conserva el **código real** (`dv_notas`, `dv_matric`, `dv_grad`, `dv_homol`, `dv_global`) y la política (`wh_politicas.datos_personales`, `finalidad`) lo marca como **dato personal**: finalidad, seguimiento académico; acceso restringido por unidad.
- Nunca se guardan nombres, documento, fecha de nacimiento, dirección, salud, contraseñas, correo ni teléfono (un CHECK de la base impide ponerlos en una lista «permitir»).
- Quién lo ve lo decide la base: `wh_filas` solo la lee Planeación; el Monitor lo entrega por funciones `security definer` filtradas por `wh_monitor_puede` / `unit_can_view`.
- El HMAC con sal sigue siendo una opción de la política (`seudonimizar`) para otros conjuntos; los docentes siguen como seudónimo.
- **Lo ya cargado conserva su seudónimo `x-…`** (no se revierte). El Monitor avisa cuando los códigos lo parecen; hay que volver a cargar el «Reporte global de notas» (y matriculados) para ver los reales.
- Se puede buscar un estudiante por código en la caja de la parte superior (solo entre lo que la persona ya ve).

## Plan del grupo y clave de grupo (migración `0161`, parte 2)
- **Plan**: cómo se publica la nota de un grupo: «tres cortes», «única» o «formación permanente». El campo **llega en Master, reporte «Rendimiento por grupo»** (`ma_rendimiento`: código, letra, nombre, **plan**…); la política lo conserva (no es dato personal). El «Reporte global de notas» de Davinci (`dv_notas`) **no lo trae** en los HAR disponibles: el plan de cada grupo se une por código de materia + letra desde `ma_rendimiento` del mismo periodo y sede (`wh_monitor_planes`); si algún día `dv_notas` trae su columna `plan`, la política ya la deja pasar. **Sin plan = tres cortes** (degradación segura); la pantalla avisa cuando el plan aún no se ha cargado. **Falta**: cargar «Rendimiento por grupo» de Master (cualquier corte) para el periodo; sin eso todos los grupos cuentan como «tres cortes».
- **Regla**: P1, P2, P3, la evolución, las alertas y la tasa por corte usan SIEMPRE y solo grupos de plan «tres cortes». La **nota final** (nota acumulada) puede incluir además «única» y «formación permanente»: el selector «Tres cortes» · «Nota final: todos los planes» lo dice y debajo se ve cuántos grupos de cada plan hay (`wh_monitor_planes_resumen`).
- **Clave de grupo** = código de materia + letra (`SIS101~A`, `wh_grupo_clave`): une estudiante y grupo en SQL (índices por expresión en `wh_filas`) y en la URL (`?g=SIS101~A`; el par antiguo `?m=&g=` se sigue leyendo).

## Mapa de riesgo (`?vista=riesgo`)
Campus → Facultad → Programa → Curso (`f`, `p`, `c`, `corte=1|2|3|f`, `alc=todos`), con tarjetas de indicadores (tasa de reprobación, matrículas reprobadas, cursos con reprobación, cursos de 50 % o más, programas con curso crítico, cursos con detalle), tasa por corte, ranking de cursos, dispersión tamaño del grupo vs reprobación (con lista equivalente y flechas) y distribución por tramos. Sale de `wh_monitor_riesgo`: ya agregado por programa × curso × grupo × corte y con el alcance de cada quien; **no baja ninguna nota individual**. Reprobar = menos de 3,0 (Medicina 3,5); los cursos con menos de 5 matrículas con nota no se detallan.

## Cómo se navega y se mueve
Cada nivel tiene **una idea principal**: «dónde hay que actuar» (lista ordenada por seguimiento, con «Empiece por aquí» y el resto a un clic). La evolución y los cursos críticos son pestañas de un mismo bloque; «Cómo se clasifica» y «Cómo leer» van plegados; Pilo, al final. Al abrir una fila, su nombre viaja hasta el título del siguiente nivel; las barras, la lista (FLIP) y la gráfica de evolución se transforman al cambiar de corte o de alcance en vez de recargarse; las cifras cuentan; al apuntar una fila, las demás ceden.

## Piezas
| Archivo | Qué es |
| --- | --- |
| `supabase/migrations/0160_monitor_alertas.sql` | tabla de asignación, `wh_monitor_puede/codigos/resumen/grupos/grupo_estudiantes/estudiante/mapa/asignar/autoasignar` |
| `logica.ts` | clasificación NE/ED/RS por corte (umbrales editables), agregación por facultad y programa, grupos, cursos críticos, resumen para Pilo |
| `datos.ts` | lectura de las funciones de la base |
| `MapaRiesgo.tsx`, `graficas.tsx` | el mapa de riesgo y sus gráficas (barras, ranking, dispersión) |
| `piezas.tsx` | aletas (tablero de llegadas), barra de niveles (FLIP), evolución (morfa entre alcances), escala 0–5, semáforo con forma, tendencia, `useEntrada` (vuelo del título), `useFlip`, `Cuenta` |
| `MonitorAlertas.tsx` | la pantalla y todas sus vistas |
| `monitor.css` | estilos (prefijo `mo-`) |
| `tests/warehouse/monitor*.test.ts` | permisos por unidad (PGlite) y lógica |

## Reglas
Se clasifica en un corte solo a quien ya tiene nota en la mitad o más de sus materias. **NE**: promedio ≥ 3,5 y ninguna materia perdida. **ED**: 3,0–3,49 o una materia perdida. **RS**: promedio < 3,0, dos o más materias perdidas o caída ≥ 0,5. Un grupo requiere seguimiento con 30 % o más de su gente bajo la nota de aprobar. Son valores de partida (apoyados en el estudio de la UDES, Pérez et al., 2023) y se ajustan en pantalla.

## Pilo
`PanelPilo` (del Warehouse) va al final; la función `warehouse-pilo` acepta a quien tiene el Monitor y solo recibe conteos agregados. No se muestra el proveedor ni el modelo.

## Pendiente
Aplicar `0155`–`0161` (en ese orden; la 0161 incluye código real, plan, clave de grupo y mapa de riesgo), cargar «Rendimiento por grupo» de Master para tener el plan, y volver a cargar las notas para ver los códigos reales, desplegar `warehouse` y `warehouse-pilo`, y asignar los programas a sus unidades. Con Saber 11, tutorías, estrato y trabajo se podría estimar el riesgo individual como lo hace el estudio.
