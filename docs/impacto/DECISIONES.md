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
