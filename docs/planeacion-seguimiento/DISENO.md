# Planeación y Seguimiento · diseño del módulo

Estado: **propuesta para aprobar** (Fase 0). No hay código del módulo en `src/` ni migraciones en `supabase/`.
Prototipo navegable: <https://claude.ai/artifact/4eMdbVh69CH4MCMyCy1QJ5> (privado: lo abre quien tenga acceso a la cuenta; se comparte desde su menú «Compartir»).

Cómo leer este documento: lo que viene **de la matriz** es dato real; lo que el prototipo **inventa** está marcado como «demostración»; lo que yo **supongo** va marcado como «inferencia». Al final hay una lista corta de decisiones que son suyas.

---

## 1. Objetivo y alcance

**Objetivo.** Un módulo de la intranet donde Planeación Institucional carga un plan (hoy, el PDIFyT 2027-2035 de la Vicerrectoría Administrativa y Financiera), cada oficina lo ejecuta con un tablero de actividades tipo Planner, y la dirección ve cómo va, con control de versiones: se sabe qué plan estaba vigente cuando se reportó cada avance, y cada cambio al plan deja huella.

**Qué entra**
- Resumen del plan, con la visual del tablero de ejemplo (KPIs, pilar, prioridad, sede, fuente, inversión por año, cronograma, estado de la evaluación) y datos nuevos de salud del seguimiento.
- Seguimiento: actividades por proyecto, asignación a personas, avances con evidencia, revisión del gestor, riesgos y acciones, comentarios.
- Control de versiones: línea base v1.0, solicitudes de cambio, borrador con diff, aprobación, publicación inmutable, comparar, restaurar, carga de Excel como borrador.
- Cortes de seguimiento congelados (trimestrales o los que se definan) y bitácora inmutable.
- Avisos por correo (asignación, vencimiento, devolución, solicitud pendiente).

**Qué no entra (todavía)**
- Ejecución presupuestal real. El avance financiero es un **porcentaje que reporta la oficina y valida el gestor**; no se conecta con el sistema financiero. Es una decisión abierta (sección 12).
- Planes distintos del PDIFyT. El modelo admite varios planes, pero la primera entrega carga uno.
- Edición libre del plan en pantalla. El plan solo cambia por solicitud de cambio o por carga de Excel, y siempre a través de un borrador.

## 2. Vocabulario

| Término | Significado |
| --- | --- |
| **Plan** | Contenedor: «PDIFyT 2027-2035». Tiene una versión vigente. |
| **Línea / proyecto** | Cada fila de la matriz (75). Tiene una clave estable (`no`) aunque cambie de versión. |
| **Versión** | Instantánea completa del plan: v1.0, v1.1… Estados: borrador, publicada. Publicada = inmutable. |
| **Vigente** | La última versión publicada. El seguimiento apunta a ella. |
| **Solicitud de cambio (SC)** | Alta, edición, baja o reprogramación de una línea (o una carga de Excel), con motivo de al menos 20 caracteres. No cambia el plan por sí sola. |
| **Actividad** | Tarea concreta de un proyecto, a cargo de una oficina. Es lo que se arrastra en el tablero. |
| **Avance** | Reporte de avance físico y financiero de una actividad, con fecha, nota y evidencia. Solo cuenta cuando el gestor lo valida. |
| **Cubo** | Columna del tablero: Por iniciar, En curso, En riesgo, En revisión del gestor, Hecho. |
| **Corte** | Foto congelada del seguimiento a una fecha (por ejemplo 2027-T1), de la que salen los informes. |
| **Oficina** | Unidad responsable (existe en el portal como `units`). |
| **Gestor** | Jefe de la oficina para este módulo. Asigna, valida, comenta. |

## 3. Qué es real y qué es demostración

**Real (de la matriz «Priorización y Evaluación 7.xlsx», hoja Matriz):** los 75 proyectos con su clasificación (PLF, IFT, IFT-LOG), nombre, descripción, sede, pilar, monto, prioridad (Crítico 16, Alto 24, Medio 23, Largo plazo 12), resultado de evaluación (63 aprobados, 12 sin evaluar), fuente de financiación, criterios, viabilidad, fechas y porcentaje por año 2027-2035. Inversión total: $ 133.374.668.643 (el prototipo la muestra truncada como $ 133.374 M, igual que el tablero de ejemplo). Aprobados: $ 78.036 M; sin evaluar: $ 55.337 M (41 % de la inversión).

**Demostración (inventado, con semilla fija, rotulado así en pantalla):**
- Oficinas y quién es responsable de cada proyecto. El Excel **no trae responsables**. El reparto del prototipo sigue una regla que **inferí** del nombre y la sede (IFT → Tecnología; IFT-LOG, obras de Bucaramanga → Infraestructura; «Compra…» → Compras; Valledupar y Cúcuta → su administración de sede; escenario, alojamiento y equipamiento deportivo → Bienestar). Hay que reemplazarla por el dato real.
- Personas («Colaborador/a 1 · TIC (demo)», «Gestor/a · INF (demo)»…). Ninguna es una persona real.
- Actividades (3 a 7 por proyecto en los 20 de mayor inversión, 2 a 4 en los demás evaluados; 248 en total), avances, evidencias, riesgos, comentarios, solicitudes de cambio SC-001 a SC-004, el borrador v1.1, el corte 2027-T1 y la bitácora.
- La **fecha «de hoy» es simulada: 30 de junio de 2027**. Sin ella no habría nada que mostrar, porque el plan empieza en 2027.
- Cargar Excel está **simulado**: el prototipo no lee el archivo; genera un ejemplo de 7 cambios.

## 4. Roles y permisos

Cinco roles. Cada uno es un **nivel explícito** en el rol de acceso del portal (sección 9), no una capacidad genérica.

| Capacidad | Administrador de planeación | Aprobador | Gestor de oficina | Colaborador | Lector / directivo |
| --- | :-: | :-: | :-: | :-: | :-: |
| Ver resumen y seguimiento | Sí | Sí | Sí | Sí | Sí |
| Cargar Excel, crear y publicar versiones, abrir y cerrar cortes | Sí | No | No | No | No |
| Solicitar cambios al plan | Sí | No | Solo proyectos de su oficina | No | No |
| Aprobar, devolver o rechazar solicitudes | No | Sí, nunca la propia | No | No | No |
| Asignar actividades | A personas de la oficina de la actividad | No | Solo a su oficina | No | No |
| Crear actividades, riesgos y acciones | Sí | No | Su oficina | No | No |
| Mover actividades entre cubos | Sí | No | Las de su oficina | Las suyas, hasta «En revisión» | No |
| Reportar avance con evidencia | Sí | No | Su oficina | Las asignadas | No |
| Validar un avance y pasar a Hecho | Respaldo del gestor; nunca el propio | No | Sí; nunca el propio | No | No |
| Comentar | Sí | Sí | Sí | Sí | No |
| Ver y copiar la bitácora completa | Sí | Sí | Su oficina | No | No |

**Reglas que no se negocian** (las hace cumplir la base, no la pantalla):
1. Nadie aprueba ni valida lo propio (CHECK `reportado_por <> revisado_por`; la función de decisión compara con `auth.uid()`).
2. Un gestor solo asigna a personas que son miembros de la oficina de la actividad (disparador sobre `ps_asignaciones`).
3. Una versión publicada y un corte cerrado no se pueden modificar (disparadores que rechazan `UPDATE` y `DELETE`).
4. Cada avance, actividad y evidencia guarda la versión del plan vigente cuando se creó.
5. `ps_eventos` solo admite `INSERT`.

**Por qué el colaborador no pasa a Hecho:** el avance que no revisa nadie no es un avance. Al arrastrar a «En revisión» se abre el formulario de reporte (físico, financiero, fecha, qué se hizo, evidencia); la tarjeta queda en ese cubo hasta que el gestor valide (y entonces puede pasarla a Hecho) o la devuelva con una nota de al menos 20 caracteres.

**Mejora propuesta sobre su idea.** Si el autor del avance es el gestor, lo valida Planeación. Así la regla «nadie aprueba lo propio» no deja el flujo bloqueado.

## 5. Flujos

### 5.1 Asignación
1. El gestor abre **Asignar** (o arrastra en la vista agrupada por Persona). Ve su equipo con la carga (activas por persona) y las actividades sin responsable.
2. Selecciona una o varias, elige a la persona, «Añadir a la persona». También puede cambiar la asignación de una actividad desde su fila.
3. La base valida que la persona sea de la oficina. Se registra `tarea.asignada` y se encola el aviso `c-ps-asignacion`.

### 5.2 Reporte de avance y revisión del gestor
1. El colaborador reporta (desde el cubo o el cajón de la actividad). Estado del avance: `pendiente`; la tarjeta pasa a «En revisión del gestor».
2. El gestor ve «Por validar» en **Mis tareas**. **Valida** (el avance cuenta, actualiza el avance validado de la actividad) o **devuelve** con nota (≥ 20 caracteres; la tarjeta vuelve a «En curso» y se avisa al colaborador).
3. Pasar a Hecho es del gestor; si hay un avance pendiente de otra persona, lo valida en el mismo gesto.
4. Todo queda en la bitácora con la versión del plan vigente.

### 5.3 Solicitud de cambio → versión → aprobación → publicación
1. El gestor (de sus proyectos) o el administrador crea la solicitud: tipo, línea, nuevos valores, motivo ≥ 20 caracteres. Estado `enviada`. **La base calcula el diff** antes → después contra la versión vigente.
2. El aprobador (Vicerrectoría Administrativa y Financiera) aprueba, devuelve o rechaza, con nota de ≥ 20 caracteres también al aprobar (es la regla que ya usa Gestión Master). No decide sobre su propia solicitud.
3. Al aprobar, el cambio entra en el **borrador** (si no existe, se crea v1.1 a partir de la vigente). El borrador muestra el diff acumulado: líneas añadidas, retiradas, modificadas, variación de inversión y fechas de fin movidas.
4. Planeación **publica**: el borrador pasa a publicada y vigente, queda congelada. Las solicitudes pendientes no entran: esperan al siguiente borrador.
5. **Restaurar** una versión anterior crea un borrador nuevo con su contenido (no toca lo publicado). **Comparar** dos versiones calcula el diff completo en la base, campo a campo.

Decisión de diseño: un solo camino de entrada. La **carga de Excel** también produce una solicitud (tipo «Carga de Excel») con sus cambios, pasa por el mismo aprobador y no publica nada por sí sola.

### 5.4 Cortes
Planeación abre un corte (por ejemplo 2027-T2, «hasta 30 jun»). Al cerrarlo se congela un resumen (avance físico y financiero ponderado por monto, proyectos, actividades, versión del plan) que ya no cambia aunque después se validen avances con fecha anterior. De los cortes salen los informes y se pueden cargar al Warehouse (sección 10).

## 6. Pantallas (prototipo)

| Pantalla | Qué hace |
| --- | --- |
| Resumen | Filtros multiselección persistentes con contador; 7 KPIs; salud del seguimiento por proyecto y por oficina; estado de la evaluación (63/75); inversión por año con %; prioridad (anillo), pilar, sede, fuente; cronograma; mayor inversión. |
| Proyectos | Las 75 líneas, con oficina, avance y salud. Abre el cajón. |
| Cronograma | Gantt 2027-2035 por proyecto o por oficina, con avance validado y marca de «hoy». |
| Tablero | Cubos tipo Planner; agrupar por estado, oficina, persona, proyecto, pilar o prioridad; buscar; mi oficina / todas; arrastre (ratón y lápiz) y botón «Mover a…» (teclado y móvil); aviso de lo que permite tu rol. |
| Lista | Las mismas actividades, ordenables. En ≤ 900 px cada fila es una tarjeta. |
| Mis tareas | Vencidas, próximas, más adelante, hechas; «Por validar» para el gestor. |
| Asignar | Equipo con carga, actividades sin asignar, asignación masiva. Solo gestor y administrador. |
| Cajón | Pestañas Resumen, Actividades, Avances, Evidencias, Riesgos y acciones, Comentarios, Historial (versiones del plan y eventos). Sirve para proyecto y para actividad. |
| Versiones y cambios | Pestañas: Versiones (con diff y publicar con confirmación en línea), Solicitudes de cambio, Comparar, Cortes, Cargar Excel (cuatro pasos). |
| Calidad de datos | Revisa la matriz: distingue pendiente de diligenciar, no aplica todavía e inconsistente. |
| Bitácora | Eventos con búsqueda por tipo, persona o detalle; «Copiar CSV». |
| Roles y permisos | La matriz de la sección 4. |

En el prototipo: selector **«Ver como»** (Administrador, Aprobador, Gestor de TIC, Gestor de Infraestructura, Colaborador/a 1 · TIC, Lector). Con el colaborador, arrastrar una tarjeta propia a «Hecho» se rechaza con el motivo; a «En revisión» abre el reporte. Los botones, el arrastre y las pantallas cambian con el rol. El estado se guarda en el navegador (`localStorage`); «Restablecer demostración» lo borra.

Accesibilidad: foco visible, roles ARIA (`tablist`, `menu`, `table`, `dialog`), todo movimiento de tarjetas disponible sin arrastre, estado siempre con glifo y texto, avatares con nombre, cajón y diálogos nativos (`<dialog>`: foco atrapado y Escape). Los colores de estado son los reservados del sistema (verde completo, ámbar pendiente, rojo riesgo); la prioridad usa una rampa azul con texto, no rojo.

Movimiento (GSAP 3.12.5, con parquedad): entrada del resumen (conteo de KPIs y barras que crecen, unos 600 ms, solo al entrar a la vista), asentado de la tarjeta soltada (FLIP de 220 ms), aviso y menús (150 a 200 ms), transición de vistas de 180 ms. Cajón y diálogos usan la Web Animations API (ver nota abajo). Nada se anima si la acción viene del teclado. Con «reducir movimiento» no se anima nada y todo queda en su estado final.

## 7. Modelo de datos propuesto (prefijo `ps_`)

Sigue el patrón de `gm_*`: se escribe por funciones `security definer` con `search_path` fijo; las tablas no tienen política de escritura directa. **Es propuesta**: los nombres de columnas pueden ajustarse al escribir la migración.

**Plan y versiones**
- `ps_planes (id, nombre, anio_ini, anio_fin, version_vigente_id)`.
- `ps_lineas (id, plan_id, clave)`: identidad estable de una línea entre versiones (la columna `no` de la matriz).
- `ps_versiones (id, plan_id, etiqueta, estado, base_id, origen, huella, nota, publicada_en, publicada_por)`. `estado ∈ {borrador, publicada}`. Una versión publicada **no se modifica**. Un índice único garantiza un solo borrador abierto por plan.
- `ps_version_lineas (version_id, linea_id, clasif, nombre, descripcion, sede, pilar, monto, prioridad, resultado, fuente, criterios jsonb, viabilidad jsonb, inicio, fin, pct jsonb, origen, oficina_id)`: la **instantánea completa** de cada versión. Se guarda entera (75 filas por versión) y no como deltas: es más simple de consultar, de congelar y de restaurar. 75 filas por versión son un costo despreciable.
- `ps_diff(version_a, version_b)`: función SQL que compara dos versiones y devuelve añadidas, retiradas y modificadas con `{campo: {antes, despues}}` y los totales. El navegador no decide qué cambió (misma lección de `gm_solicitud_lineas.cambios`).

**Estructura de trabajo**
- `ps_oficinas (id, unit_id → units, plan_id, nombre)`: enlaza una oficina del plan con una unidad existente. Los miembros salen de `unit_members` (sección 9). `ps_version_lineas.oficina_id` es el responsable de cada línea.
- `ps_actividades (id, linea_id, oficina_id, titulo, descripcion, estado, prioridad, inicio, fin, es_hito, version_creacion_id, creada_por)`. `estado ∈ {por_iniciar, en_curso, en_riesgo, en_revision, hecho}`.
- `ps_checklist (actividad_id, orden, texto, hecho)`.
- `ps_asignaciones (actividad_id, profile_id, asignado_por, asignado_en, quitado_en)`. Disparador: el perfil debe ser miembro de `ps_oficinas.unit_id` de la actividad.
- `ps_avances (id, actividad_id, version_id, fecha, av_fisico, av_financiero, nota, estado, reportado_por, revisado_por, nota_revision, creado_en)`. `estado ∈ {pendiente, validado, devuelto}`. CHECK `revisado_por is distinct from reportado_por`. CHECK de monotonía: el físico validado no baja.
- `ps_evidencias (id, avance_id, actividad_id, nombre, storage_path, huella_sha256, version_id, subido_por)`. Archivos en Storage con política propia.
- `ps_riesgos (id, linea_id, texto, nivel, estado, mitigacion)` y `ps_acciones (id, riesgo_id, texto, responsable, vence, estado)`.
- `ps_comentarios (id, linea_id, actividad_id null, autor, texto, creado_en)`.

**Cambios, cortes y trazabilidad**
- `ps_solicitudes (id, folio 'SC-AAAA-NNNN', plan_id, tipo, estado, solicitante, motivo, borrador_id, decidida_por, decision_nota, creado_en)`. CHECK `char_length(btrim(motivo)) >= 20`; igual para `decision_nota`. Estados: enviada, en_revision, aprobada, devuelta, rechazada.
- `ps_solicitud_items (solicitud_id, linea_clave, tipo, cambios jsonb)`: `cambios` se calcula en la base contra la versión vigente al guardar.
- `ps_cortes (id, plan_id, nombre, hasta, estado, version_id, cerrado_en, cerrado_por, resumen jsonb)`. Cerrado = inmutable.
- `ps_eventos (id, tipo, actor_id, objeto_tipo, objeto_id, linea_clave, version_id, datos jsonb, creado_en)`: **solo `INSERT`** (disparador que rechaza `UPDATE` y `DELETE`), como `gm_eventos`.
- `ps_avisos (id, tipo, destinatario, objeto_id, estado, intentos)`: cola de correos, como `gm_avisos`.

**Cálculos en la base, no en el navegador:** avance de un proyecto (promedio de sus actividades con el último avance validado), avance del plan (ponderado por monto sobre proyectos evaluados), salud (completo, al día, en riesgo o atrasado, sin iniciar, sin evaluar), cobertura de asignación, `ps_diff`. Se exponen como funciones o vistas para que la pantalla y Pilo lean la misma cifra.

## 8. Seguridad (RLS) siguiendo la lección de Gestión Master

La capacidad de un rol de acceso (`base_role`) es el máximo de lo que piden sus módulos; no debe abrir nada aquí (migración 0192, citada en `src/modules/gestion-master/README.md`). Por eso:

- `access_roles.ps_nivel` (`none`, `lector`, `colaborador`, `gestor`, `aprobador`, `admin`), con valor inicial `none`: ningún rol existente entra al aplicar la migración. Más la pantalla `planeacion_seguimiento`.
- Funciones `ps_nivel_actual()`, `ps_puede(accion text)`, `ps_oficinas_de(uuid)` y `ps_visible(...)`, todas `security definer`, `search_path` fijo, sin `has_role_at_least('planeacion')` ni capacidad del rol. Solo la administración general entra sin rol.
- Visibilidad: cada quien ve el plan completo en modo lectura (el resumen es de todos los niveles); **lo operativo** (actividades, avances, evidencias) lo ve y lo toca según su oficina, vía `unit_members`; el aprobador ve las solicitudes; el administrador, todo.
- Escritura solo por funciones que comprueban nivel, oficina, estado (borrador abierto, corte abierto) y la regla de no firmar lo propio. Todo `DELETE` y `UPDATE` lleva `WHERE`.
- La bitácora solo admite `INSERT`.
- Las cifras de dinero siguen **cerradas a `anon`** (PRODUCT.md): el módulo es de intranet; ninguna página pública publica estos montos.

## 9. Cómo encaja con lo que ya existe

Rutas verificadas en el repositorio.

| Qué se reutiliza | Dónde está | Uso en este módulo |
| --- | --- | --- |
| Unidades y miembros | `supabase/migrations/0057_unidades.sql` (`units`, `unit_members` con `unit_role` ∈ `visor`, `editor`, `jefe`; `unit_role_at`, `unit_can_view`; ajuste en `0061_solo_lo_asignado.sql`) | Oficina = unidad. Gestor = `jefe`, colaborador = `editor`. **Inferencia:** el rol de unidad por sí solo no distingue aprobador ni administrador del módulo: eso lo da `ps_nivel`. |
| Roles de acceso y pantallas | `supabase/migrations/0024_roles_de_acceso.sql` (`access_roles`); `src/modules/admin/components/AdminShell.tsx` (tipo de pantallas y menú, línea ~65 y ~234); `src/modules/admin/launcher/portales.ts` (lanzador); `src/modules/admin/usuarios/` (matriz de roles: `role-matrix.ts`, `RolesView.tsx`) | Columna `ps_nivel`, pantalla `planeacion_seguimiento` y una carpeta de módulo en el lanzador, como Gestión Master. |
| Precedente de niveles, flujos y eventos | `src/modules/gestion-master/README.md`, `modelo.ts`, `supabase/migrations/0194_gestion_master.sql` (`gm_nivel`, `gm_funcion`, `gm_flujos`, `gm_eventos`, `gm_avisos`) | Mismo diseño: nivel explícito, función que aprueba, nota ≥ 20 caracteres, nadie firma lo propio, eventos solo-anexar. Se puede **reutilizar `gm_funciones`/`gm_flujos`** para el flujo del aprobador o crear `ps_flujos`; decisión abierta. |
| Correos | `supabase/functions/correos/index.ts`; plantillas editables en `src/modules/admin/correos/`; patrón de cola en `supabase/functions/gestion-master/index.ts` | Plantillas nuevas `c-ps-asignacion`, `c-ps-vencimiento`, `c-ps-revision`, `c-ps-devolucion`, `c-ps-solicitud`, `c-ps-version`, `c-ps-corte`; acción nueva en `correos` y función `planeacion-seguimiento` que vacía `ps_avisos`. Los **vencimientos** necesitan una tarea programada: **inferencia**, hay que decidir dónde corre (pg_cron o función programada). |
| Warehouse | `src/modules/warehouse/README.md` y `store.ts`; `supabase/migrations/0155_warehouse_udes.sql`; flujo `wh_abrir_carga` → `wh_agregar_filas` → `wh_cerrar_carga` | Al cerrar un corte, un conjunto `ps_seguimiento` (como `gm_solicitudes`) con política de privacidad: sin nombres. Para tableros transversales. |
| Pilo | `supabase/functions/pilo-informes/` (`datos.ts`, `plantillas.ts`, `redaccion.ts`); `supabase/functions/pilo-tableros/` | Resúmenes ejecutivos y texto del informe de cada corte, leyendo las mismas funciones de cálculo. Fase 5. |
| Sistema visual | `DESIGN.md`, `PRODUCT.md`, `src/styles/tokens.css` | El prototipo usa los tokens del portal (Open Sans, azul #0a2d63 / #2166d6, estados reservados) en claro y oscuro. La implementación debe tomar los de `tokens.css` y no escribir colores a mano. |
| GSAP | `package.json` (`gsap`, `@gsap/react`); patrón `src/modules/gestion-master/movimiento.ts` | Mismo uso y mismas reglas de movimiento reducido. |

Lugar sugerido del código: `src/modules/planeacion-seguimiento/` (estructura análoga a `gestion-master`: `modelo.ts`, `api.ts`, `contexto.ts`, una pantalla por sección, `movimiento.ts`, `planeacion-seguimiento.css` con tokens), ruta `/admin/planeacion-seguimiento/:seccion?/:id?`. El resumen **de solo lectura para directivos** podría además publicarse en el portal PDI; decisión abierta (no se publicarían montos por texto editorial: regla de `PRODUCT.md`).

Nota técnica del prototipo: GSAP 3.12.5 desde cdnjs. Probé animar un `<dialog>` con GSAP y le quitaba el modo modal (queda como diálogo normal, sin capa superior). Para el cajón y los diálogos se usa la Web Animations API. Al portar, anime un contenedor interno o use CSS/WAAPI, no el `<dialog>` directamente.

## 10. Decisiones de diseño tomadas y por qué

1. **Instantánea completa por versión**, con diff calculado en la base. Más simple de congelar, restaurar y comparar que una cadena de deltas.
2. **Un solo camino de entrada al plan** (solicitud de cambio → borrador → publicación), también para la carga de Excel. Si el Excel publicara directo, el aprobador quedaría fuera.
3. **Un borrador abierto a la vez** por plan. Evita versiones paralelas que luego haya que fusionar.
4. **El avance solo cuenta cuando lo valida otra persona.** El tablero ya no se puede inflar desde abajo.
5. **El colaborador pide revisión, no cierra.** Es lo que usted definió, con el formulario de reporte como puerta.
6. **Estado con glifo y texto**, no solo color; prioridad en rampa azul para no usar el rojo reservado a riesgo.
7. **Todo lo que mueve una tarjeta tiene alternativa sin arrastre** (menú «Mover a…»): en móvil el arrastre táctil compite con el deslizamiento de columnas.
8. **Filtros del plan compartidos** por resumen, proyectos, cronograma y seguimiento, y persistentes por persona.
9. **Cortes congelados** como fuente de informes, en vez de calcular informes sobre datos vivos.

## 11. Riesgos

| Riesgo | Mitigación propuesta |
| --- | --- |
| El Excel no trae responsables: sin oficina por proyecto no hay asignación. | Cargar primero una tabla de responsables (línea → oficina → gestor) validada por cada vicerrectoría; el módulo no arranca sin ella. |
| La estructura de oficinas del portal (`units`) puede no coincidir con las dependencias reales del plan. | Revisar `units` antes de la Fase 2; el modelo tolera una tabla `ps_oficinas` propia. |
| Cambiar el formato del Excel rompe la carga. | Validación de encabezados y de calidad antes de crear la solicitud; la pantalla «Calidad de datos» muestra los vacíos. No se vio el Excel original en este trabajo: el esquema sale del JSON extraído. |
| Avance financiero sin conexión al sistema financiero: puede divergir de la ejecución real. | Rotularlo como «reportado por la oficina»; decisión abierta sobre una fuente oficial. |
| Los dos aprobadores posibles (Vicerrectoría y Planeación) generan ambigüedad de quién firma qué. | Resolver con el flujo configurable de `gm_flujos` o uno equivalente `ps_flujos`. |
| Carga de trabajo del gestor: validar cada avance puede ser un cuello de botella. | Validación por lote (hasta 50) como en Gestión Master; indicador de «por validar» en el menú. |
| Vencimientos por correo necesitan una tarea programada que hoy no existe en este módulo. | Definir en Fase 3 si va en pg_cron o en una función programada. |
| Datos de demostración confundidos con reales. | Rótulo visible en el prototipo; ninguna cifra de seguimiento se muestra como real hasta que haya carga. |

## 12. Decisiones que quedan para usted

1. **¿Quién aprueba?** Hoy el prototipo pone a la Vicerrectoría Administrativa y Financiera como única aprobadora de solicitudes y a Planeación como quien publica. ¿Se añade un segundo paso (Planeación revisa, como en Gestión Master)?
2. **Responsables reales.** ¿Quién entrega el listado línea → oficina → gestor? ¿Las oficinas del prototipo (Infraestructura, Tecnología, Compras, Bienestar, sedes Valledupar y Cúcuta) son las correctas?
3. **Avance financiero.** ¿Lo reporta la oficina como porcentaje, o debe venir del sistema financiero? ¿Lo valida la Dirección Financiera?
4. **Cortes.** ¿Trimestrales? ¿Con qué fechas y quién los cierra?
5. **Capacidad por persona.** El prototipo usa 10 actividades activas como referencia de carga: es un supuesto.
6. **¿Quién ve qué?** ¿Los directivos ven el resumen con montos en la intranet únicamente, o habrá una vista pública sin cifras de dinero?
7. **Evidencias.** ¿Dónde viven los archivos (Storage del portal, UDrive, SharePoint)? ¿Tamaño y tipos permitidos?
8. **Otros planes.** ¿Este módulo será también para el PDI 2024-2028 y otros planes (el modelo lo permite)?
9. **Notificaciones.** ¿Qué avisos son por correo y cuáles solo dentro del portal? ¿Plazos para validar un avance?
10. **¿Reutilizar `gm_*` o crear `ps_*` propio** para funciones y flujos de aprobación?

## 13. Plan por fases

Esfuerzos: **estimación mía, en días de una persona de desarrollo**, sin contar la revisión suya ni la carga de datos reales. Se ajustan después de revisar el esquema real de la matriz y las unidades.

| Fase | Contenido | Esfuerzo |
| --- | --- | --- |
| 0 | Diseño aprobado (este documento y el prototipo), decisiones de la sección 12. | 0,5 a 1 día de revisión conjunta |
| 1 | Migración base `ps_planes`, `ps_lineas`, `ps_versiones`, `ps_version_lineas`, niveles y pantalla; **carga de la matriz y versión v1.0**; Resumen, Proyectos, Cronograma y Calidad de datos en solo lectura. | 5 a 7 días |
| 2 | Oficinas, personas, actividades, asignaciones; Tablero (cubos, agrupar, arrastre y menú), Lista, Mis tareas, Asignar; avisos de asignación. | 6 a 8 días |
| 3 | Avances, evidencias, revisión del gestor, devolución, riesgos y acciones, comentarios; cajón completo; avisos de revisión y vencimiento. | 6 a 8 días |
| 4 | Solicitudes de cambio, borrador, `ps_diff`, aprobación, publicar, restaurar, comparar, carga de Excel como solicitud. | 7 a 9 días |
| 5 | Cortes congelados, informes, conjunto en el Warehouse, resúmenes con Pilo, bitácora exportable. | 4 a 6 días |

Prueba mínima por fase: SQL (PGlite, como `tests/warehouse/`) para RLS y reglas de no firmar lo propio; pruebas de pantalla para permisos del tablero.

## 14. Qué se verificó del prototipo y qué no

Verificado en Microsoft Edge (modo headless): resumen, tablero como gestor y como colaborador, cajón de tarea, versiones con diff, solicitud de cambio, carga de Excel simulada, calidad, roles, lista, cronograma, a 1440 × 900 y 390 × 844, en claro y oscuro (tablero y resumen); sin errores de consola; sin desbordamiento horizontal de la página a 390 px; reglas de permisos, publicar, restaurar, filtros persistentes, menú «Mover a…» con teclado y modo de movimiento reducido (todo queda en su estado final y no se anima).

No verificado: Safari y Firefox; un lector de pantalla real; el contraste medido con herramienta (se calculó a mano para los pares principales; los textos pequeños usan tonos más oscuros que `--ink-muted` por eso); toque real en un teléfono (el arrastre táctil se sustituye por el menú; no se probó en dispositivo); rendimiento medido (75 proyectos y 248 actividades se sienten fluidos en la prueba, sin cifras de cuadros por segundo); lectura real de un `.xlsx`.
