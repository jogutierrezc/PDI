# Monitor de alertas tempranas

Portal dentro de la intranet donde las facultades y los programas ven cómo van las notas de sus estudiantes: **Institución → Facultad → Programa → Grupo → Estudiante (por código seudónimo)**, con el semáforo **NE · ED · RS** y, al final de cada vista, el análisis de Pilo. Ruta: `/admin/monitor-alertas` (`?periodo=&sede=&corte=&f=&p=&m=&g=&e=`). Pantalla de roles: `monitor`. Claro y oscuro por tokens; animaciones con GSAP que respetan «reducir movimiento».

## Quién ve qué (sin claves)
Lo deciden los roles y las unidades que ya asigna Planeación (migración `0160`):
- Planeación (con la pantalla `monitor`) y la administración ven todo.
- Quien pertenece a una facultad o a un programa (`unit_members`) ve lo de esa unidad y de las que cuelgan de ella (`unit_can_view`): una decanatura ve sus programas; una dirección, el suyo.
- La seguridad está en la base: las funciones `wh_monitor_*` solo devuelven lo permitido y ninguna entrega nombres (no se guardan; solo el código seudónimo).
- Davinci conoce los programas por un código interno. `wh_programas_unidad` los asocia a las unidades del organigrama; Planeación lo completa en el propio Monitor («Sugerir por nombre» + asignación a mano). Un programa sin unidad solo lo ve Planeación.

## Piezas
| Archivo | Qué es |
| --- | --- |
| `supabase/migrations/0160_monitor_alertas.sql` | tabla de asignación, `wh_monitor_puede/codigos/resumen/grupos/grupo_estudiantes/estudiante/mapa/asignar/autoasignar` |
| `logica.ts` | clasificación NE/ED/RS por corte (umbrales editables), agregación por facultad y programa, grupos, cursos críticos, resumen para Pilo |
| `datos.ts` | lectura de las funciones de la base |
| `piezas.tsx` | aletas (tablero de llegadas), barra de niveles, evolución, escala 0–5, semáforo con forma, tendencia |
| `MonitorAlertas.tsx` | la pantalla y todas sus vistas |
| `monitor.css` | estilos (prefijo `mo-`) |
| `tests/warehouse/monitor*.test.ts` | permisos por unidad (PGlite) y lógica |

## Reglas
Se clasifica en un corte solo a quien ya tiene nota en la mitad o más de sus materias. **NE**: promedio ≥ 3,5 y ninguna materia perdida. **ED**: 3,0–3,49 o una materia perdida. **RS**: promedio < 3,0, dos o más materias perdidas o caída ≥ 0,5. Un grupo requiere seguimiento con 30 % o más de su gente bajo la nota de aprobar. Son valores de partida (apoyados en el estudio de la UDES, Pérez et al., 2023) y se ajustan en pantalla.

## Pilo
`PanelPilo` (del Warehouse) va al final; la función `warehouse-pilo` acepta a quien tiene el Monitor y solo recibe conteos agregados. No se muestra el proveedor ni el modelo.

## Pendiente
Aplicar `0155`–`0160`, desplegar `warehouse` y `warehouse-pilo`, y asignar los programas a sus unidades. Con Saber 11, tutorías, estrato y trabajo se podría estimar el riesgo individual como lo hace el estudio.
