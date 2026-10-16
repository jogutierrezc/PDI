# Informes Institucionales (informes de gestión)

Portal interno donde decanaturas, vicerrectorías, rectorías de campus y la Rectoría General arman su informe de gestión anual sobre las plantillas A–D de `Informes Institucionales/Plantillas 2026`. Un ciclo por año y unidad con el mismo recorrido del reporte de rankings THE (0149): **abrir → diligenciar → enviar → aprobar/devolver**, más **consolidar** (cada nivel recibe lo aprobado del de abajo) y **exportar** (vista A4 / PDF).

Maqueta aprobada (comportamiento y diseño de referencia): `docs/informes/maqueta-informes.html` (artifact https://claude.ai/artifact/QPxm2ALBT9MAc1rmcm8rtD). Ruta: `/admin/informes-gestion/:seccion?`. Pantalla de roles: `informes`.

## Decisiones cerradas
1. **Cifras vivas mientras se escribe, foto al enviar.** Una cifra con fuente automática (UDES en Cifras, PDI/indicadores) se lee en vivo. Si cambia desde que la unidad la revisó, el editor avisa «cambió de X a Y» y la unidad la acepta. Al **enviar** (`informe_enviar`) el servidor guarda la foto (valor, fuente, fecha) y desde ahí el informe no cambia. Si Planeación lo devuelve (`back`), las cifras vuelven a ser vivas. Aprobado = congelado.
2. **Fuentes propias.** Cada cifra puede venir de: `auto` (UDES en Cifras), `pdi` (indicador del PDI), `aportes` (informes aprobados de unidades de abajo), `excel` (carga propia), `manual`, `url`. `excel`, `manual` y `url` exigen **nombre de la fuente** y se marcan «fuente propia». Planeación fija por ciclo cuántos datos propios por sección (por defecto 3) y si exige fuente y pilar del PDI.
3. **Qué justifica la unidad lo fija Planeación** por ciclo y plantilla (`informe_requisitos`): `justificar` (cifra bloqueada, con una línea de justificación obligatoria), `sugerido`, `no`.
4. **Narrativa con cifras enlazadas.** El texto usa tokens `[[clave]]` (clave de cifra, p. ej. `[[matric]]`). Se resuelven al valor vivo (o a la foto si el informe está enviado/aprobado). Las cifras escritas a mano en el texto generan una advertencia. Un `[corchete simple]` o «ejemplo:» se trata como texto de plantilla sin reemplazar (advertencia). Lógica pura en `tokens.ts`.
5. **Roles ya existentes** (`unit_members`, 0057): jefe=**Gestor** (diligencia y envía), editor=**Contribuyente** (diligencia), visor=**Consulta** (ve). Planeación y la administración leen y escriben todo, aprueban y devuelven. Quien aprueba o devuelve: solo Planeación. Lo hace cumplir un disparador, no solo la interfaz (patrón de `ranking_responses_guard`).
6. **PDF oficial** con el motor del boletín (`src/modules/boletin`); Word es copia editable, sin garantía de diseño.
7. **Pilo aprende** (función `pilo-informes`): se capacita con los informes 2025 ya escritos y aprende de lo que cada unidad redacta y Planeación aprueba. Solo lo **aprobado** entra al corpus. Nunca escribe cifras: usa tokens `[[clave]]`; nunca aprueba ni envía.

## Datos (migración 0153, tablas `informe_*`)
| Tabla | Guarda |
| --- | --- |
| `informe_ciclos` | `anio` (único), `nombre`, `fecha_limite`, `corte`, `estado` (preparacion \| abierto \| cerrado), `config` jsonb `{limite_propios, exigir_fuente, exigir_pilar}` |
| `informe_requisitos` | `ciclo_id`, `plantilla` (A–D), `clave` (cifra), `condicion` (justificar \| sugerido \| no) |
| `informe_instancias` | `ciclo_id`, `unit_id`, `plantilla` (A–D), `estado` (draft \| sent \| ok \| back), `nota_revision`, `enviado_en/por`, `aprobado_en/por`; único (`ciclo_id`,`unit_id`) |
| `informe_secciones` | `instancia_id`, `clave` (`s1`…), `orden`, `contenido` jsonb (texto con tokens, filas de metas, logros, etc. según el tipo), `listo` bool |
| `informe_cifras` | `instancia_id`, `clave`, `etiqueta`, `fuente_tipo`, `fuente_nombre`, `valor` (solo excel/manual), `unidad`, `meta`, `anterior`, `incluida`, `justificacion`, `propia`, `pilar`, `visto` (último valor aceptado), y la foto: `foto_valor`, `foto_en`, `foto_fuente` |
| `informe_fuentes` | catálogo de fuentes (`clave`, `nombre`, `tipo`, `consulta` jsonb, `activa`) |
| `informe_anexos` | `instancia_id`, `n`, `nombre`, `tipo` (archivo \| url), `ruta`, `descripcion`; bucket privado `informe-anexos` («<unidad>/<instancia>/<archivo>») |
| `informe_revisiones` | `instancia_id`, `seccion_clave` (opcional), `decision` (aprobado \| devuelto), `nota`, `por`, `en` |
| `informe_ejemplos` | corpus de Pilo: `origen` (informe2025 \| aprobado), `anio`, `plantilla`, `seccion_tipo`, `unidad_nombre`, `titulo`, `texto`, `hash` único, `aprobado` |
| `informe_aprendizaje` | `instancia_id`, `seccion_clave`, `borrador_pilo`, `final_unidad`, `creado_en` (cuánto cambió la unidad lo que Pilo escribió) |

Funciones (SECURITY DEFINER donde haga falta, `search_path` fijo): `informe_abrir(p_ciclo, p_unit, p_plantilla)`, `informe_guardar_seccion(p_instancia, p_clave, p_contenido jsonb, p_listo bool)`, `informe_guardar_cifra(...)`, `informe_enviar(p_instancia)` (toma la foto en el servidor; las cifras `excel`/`manual` conservan su valor), `informe_cambiar_estado(p_instancia, p_a, p_nota)` (sent→ok|back, ok→back, back→draft), `informe_consolidado(p_instancia)` (secciones aprobadas de las unidades hijas, para el consolidador).

## Pilo (función `pilo-informes`)
Solo con sesión. Acciones: `estado`, `redactar {instancia_id, seccion_clave, instruccion?}` → `{texto con tokens, usadas, ejemplos_usados, avisos}`, `mejorar {texto, objetivo}`, `aprender {instancia_id}` (solo Planeación, copia lo aprobado al corpus), `ingerir {anio, plantilla?, archivos:[{nombre, unidad?, secciones:[{titulo, texto}]}]}` (solo Planeación), `corpus {}` (lo que Pilo aprendió: conteos y perfil de estilo por tipo de sección). Mismo proveedor de IA que `pilo-rankingsod`.

## Plantillas (en `plantillas.ts`)
A Decanatura (10 secciones), B Vicerrectoría u oficina (9), C Rectoría de campus (8), D Rectoría General (8). Tipos de sección: `narr`, `pdi`, `metas`, `dim`, `matriz`, `filas`, `logros`, `evid`, `anexos`. Las secciones y sus claves salen de la maqueta (`TPL`).

## Pantallas (`InformesAdmin`)
Tablero del ciclo (Planeación) · Mi informe (editor) · Revisión (Planeación) · Consolidador (campus y rectoría) · Capacitación de Pilo (Planeación) · Vista A4 y exportación.

## Reglas de trabajo
Sin commit. No se aplican migraciones ni se despliegan funciones (lo hace el usuario). Todo DELETE lleva WHERE (safeupdate, 0095). Solo tema claro. Textos en español. Pruebas con Vitest.

## Objetivos y metas desde los indicadores del programa (migración 0165)
En la sección `metas` de un informe cuya unidad es un **programa** (o una **facultad**, que suma los de sus programas) las filas no se escriben: salen de lo que el programa seleccionó en Impacto.
- **Qué entra:** fichas adoptadas (`imp_adoptions` activas, publicadas) y indicadores propios (`imp_indicators.program_id`, no retirados), por cada sede donde el programa se ofrece. Quedan fuera los que el programa solo consulta (`program_reports = false`) y los medidos en pesos (el dinero sigue cerrado).
- **Cómo:** `informe_metas_sincronizar(p_instancia)` (la llama el editor al abrir, solo con el informe en borrador o devuelto y para quien puede editarlo) deja una fila de `informe_cifras` por indicador y sede: clave `meta_<hash>`, fuente `pdi`, `meta` = meta del año del ciclo, `consulta` = programa, sede, origen y si el indicador debe bajar. El valor vivo, el «visto» y la **foto al enviar** son los de siempre (`informe_vivas_de` → `informe_valor_pdi`, que ahora también lee indicadores propios del programa no retirados). Enviado o aprobado no se sincroniza: manda la foto.
- **Meta del año:** 2026 o antes → `target_2026_num`; 2028 o después → `target_2028_num`; 2027 → sin meta numérica (se muestra el texto de la ficha). La meta propia de la adopción manda sobre la de la ficha.
- **Resultado:** `resultadoMeta` (Superada / Cumplida / Parcial) y `semaforo`; si el indicador debe bajar (deserción), estar por debajo supera la meta. Lógica pura en `metas-programa.ts`.
- **Seguridad:** la función exige `informe_instancia_visible`; solo trae los indicadores del programa del informe (o de los programas de la facultad del informe). No abre `imp_*` a nadie más.
- **Qué escribe la unidad:** un análisis por meta (`contenido.observaciones[clave]`) y, aparte, «Meta adicional» (`contenido.metas`, como antes). Si el programa no ha seleccionado indicadores, el editor lo dice y enlaza a `/admin/impacto/elegir`. Las demás unidades (vicerrectorías, rectorías) no cambian.
- Las filas `meta_…` no cuentan como datos propios ni entran a la matriz o al texto (`[[clave]]`).
- Los programas no tienen plantilla propia ni aparecen en el Tablero (`escribeInforme`): hoy no hay botón para abrirles informe (la base lo permite con `informe_abrir`; la plantilla sugerida sería B). Decisión de negocio pendiente.

## Esquema final (migración `0153_informes_institucionales.sql`)

Lo que quedó en la base. La interfaz y `pilo-informes` se apoyan en esto; las pruebas están en `tests/informes/sql-*.test.ts`.

### Ajustes al contrato
1. **Rectorías como unidades:** se usan con `units.kind = 'otra'` (el enum no cambia, nada más se rompe). Qué es cada unidad en el informe lo dice la **plantilla** de la instancia (C = rectoría de campus, D = Rectoría General), no `kind`.
2. **A quién sube cada informe:** columna nueva `informe_instancias.destino` (unidad que lo consolida). No se usa `parent_id` para esto: colgar facultades de una rectoría les daría a los rectores, por herencia de 0057, edición sobre ellas. `informe_abrir` la llena con `p_destino`, o con `units.reports_to`, o con `units.parent_id`; Planeación la corrige con un `update` directo.
3. **`informe_cifras` lleva tres columnas más:** `seccion_clave` (para contar los datos propios por sección), `fuente_clave` (qué fila de `informe_fuentes` usa; vacía = la misma `clave`) y `consulta` jsonb (ajuste por unidad que se mezcla sobre la consulta del catálogo, p. ej. `{"sede":"cucuta"}`). `propia` es calculada (`excel`, `manual` o `url`).
4. **Función nueva `informe_cifras_vivas(p_instancia)`:** la misma lectura que usa la foto al enviar. La interfaz la llama para mostrar las cifras en vivo y el aviso «cambió de X a Y» (comparando con `visto`). Así el valor en pantalla y la foto salen del mismo cálculo.
5. **La foto la toma un disparador**, no solo `informe_enviar`: cualquier paso a `sent` (también un `update` directo) fotografía las cifras; cualquier paso a `back` las borra (vuelven a vivas). Las validaciones de envío también van en el disparador.
6. **Devolver pide nota** (`p_nota` obligatoria en `back`). Guardar una sección o una cifra en un informe `back` lo pasa solo a `draft`.
7. **`informe_ejemplos.hash`** es calculado (`md5(texto)`): `pilo-informes` inserta con `on conflict (hash) do nothing`.
8. Pantalla de roles `informes`: los roles de fábrica la alcanzan por `all_screens`; la migración la añade a los roles hechos a mano que ya tenían `rankings` o `reportes`. El tipo `AdminScreen` y la ruta van en la interfaz.

### Tablas y columnas definitivas
| Tabla | Columnas |
| --- | --- |
| `informe_ciclos` | `id` uuid · `anio` int único · `nombre` text · `fecha_limite` date · `corte` date · `estado` (`preparacion`\|`abierto`\|`cerrado`) · `config` jsonb `{limite_propios:3, exigir_fuente:true, exigir_pilar:false}` · `created_at` · `updated_at` |
| `informe_requisitos` | `id` · `ciclo_id` · `plantilla` (A–D) · `clave` · `condicion` (`justificar`\|`sugerido`\|`no`); único (`ciclo_id`,`plantilla`,`clave`) |
| `informe_instancias` | `id` · `ciclo_id` · `unit_id` · `plantilla` (A–D) · `destino` uuid (unidad) · `estado` (`draft`\|`sent`\|`ok`\|`back`) · `nota_revision` text · `enviado_en` · `enviado_por` · `aprobado_en` · `aprobado_por` · `updated_by` · `created_at` · `updated_at`; único (`ciclo_id`,`unit_id`) |
| `informe_secciones` | `id` · `instancia_id` · `clave` (`s1`…) · `orden` int (sale de la clave) · `contenido` jsonb (objeto) · `listo` bool · `updated_by` · `updated_at`; único (`instancia_id`,`clave`) |
| `informe_cifras` | `id` · `instancia_id` · `clave` · `etiqueta` · `seccion_clave` · `fuente_tipo` (`auto`\|`pdi`\|`aportes`\|`excel`\|`manual`\|`url`) · `fuente_nombre` · `fuente_clave` · `consulta` jsonb · `valor` numeric (nulo en `auto`/`pdi`) · `unidad` text · `meta` · `anterior` · `incluida` bool (true) · `justificacion` text · `propia` bool calculada · `pilar` text · `visto` numeric · `foto_valor` numeric · `foto_en` timestamptz · `foto_fuente` text · `updated_by` · `updated_at`; único (`instancia_id`,`clave`) |
| `informe_fuentes` | `clave` text pk · `nombre` · `tipo` (`auto`\|`pdi`) · `consulta` jsonb · `activa` bool · `created_at` · `updated_at` |
| `informe_anexos` | `id` · `instancia_id` · `n` int · `nombre` · `tipo` (`archivo`\|`url`) · `ruta` (ruta del bucket o URL https) · `descripcion` · `created_by` · `created_at`; único (`instancia_id`,`n`) |
| `informe_revisiones` | `id` · `instancia_id` · `seccion_clave` (opcional) · `decision` (`aprobado`\|`devuelto`) · `nota` · `por` · `en` |
| `informe_ejemplos` | `id` · `origen` (`informe2025`\|`aprobado`) · `anio` · `plantilla` (A–D o nulo) · `seccion_tipo` · `unidad_nombre` · `titulo` · `texto` · `hash` (= md5(texto), único) · `aprobado` bool · `created_at` |
| `informe_aprendizaje` | `id` · `instancia_id` · `seccion_clave` · `borrador_pilo` · `final_unidad` · `creado_en` |

Bucket privado **`informe-anexos`** (15 MB): ruta `<unit_id>/<instancia_id>/<archivo>`. Lee quien ve la unidad (o Planeación); sube, reemplaza o borra quien puede editar la instancia mientras esté abierta.

### Funciones (firmas exactas, todas para `authenticated`)
```sql
informe_abrir(p_ciclo uuid, p_unit uuid, p_plantilla text, p_destino uuid default null) returns uuid
  -- crea la instancia (o devuelve la que ya hay). Planeación siempre; jefe/editor de la unidad con el ciclo abierto.
informe_guardar_seccion(p_instancia uuid, p_clave text, p_contenido jsonb, p_listo boolean default false) returns informe_secciones
informe_guardar_cifra(p_instancia uuid, p_clave text, p_datos jsonb) returns informe_cifras
  -- p_datos: solo las claves que cambian, de: etiqueta, seccion_clave, fuente_tipo, fuente_nombre, fuente_clave,
  -- consulta, valor, unidad, meta, anterior, incluida, justificacion, pilar, visto. Revisa el límite de datos propios por sección.
informe_cifras_vivas(p_instancia uuid) returns table (clave text, fuente_tipo text, valor numeric, fuente text, corte text)
informe_enviar(p_instancia uuid) returns informe_instancias            -- jefe o Planeación; draft|back → sent; toma la foto
informe_cambiar_estado(p_instancia uuid, p_a text, p_nota text default null) returns informe_instancias
  -- sent→ok|back y ok→back (solo Planeación; back pide nota; deja fila en informe_revisiones); back→draft (jefe, editor o Planeación)
informe_consolidado(p_instancia uuid) returns table (instancia_id uuid, unit_id uuid, unit_nombre text, plantilla text,
  seccion_clave text, orden int, contenido jsonb, aprobado_en timestamptz)
  -- secciones de las instancias aprobadas (ok) del mismo ciclo cuyo destino es la unidad de p_instancia
-- auxiliar (la usan las dos de guardar): informe_reabrir_si_devuelto(p_instancia uuid) returns void
```
Reglas en la base (disparador `informe_instancias_guard`): transiciones `draft→sent` (jefe, Planeación), `sent→ok|back`, `ok→back` (Planeación), `back→draft` (jefe, editor, Planeación). Al enviar se exige: ciclo abierto, al menos una sección y todas `listo`, cada cifra incluida con fuente propia con `fuente_nombre` (si `exigir_fuente`) y `pilar` (si `exigir_pilar`), y justificación en las claves que `informe_requisitos` marca `justificar` para su plantilla. Con la instancia en `sent` u `ok` nadie más que Planeación cambia secciones, cifras ni anexos. Visor (Consulta) solo lee. `informe_ejemplos` e `informe_aprendizaje`: solo Planeación/admin y `service_role`.

### Cifras vivas: mapa clave → consulta
La cifra busca su fila en `informe_fuentes` por `coalesce(fuente_clave, clave)` y mezcla encima `informe_cifras.consulta`. El año es `consulta.anio` o, si falta, `informe_ciclos.anio`.

| `fuente_tipo` | `consulta` | Qué lee (lo mismo que el portal) |
| --- | --- | --- |
| `auto` (UDES en Cifras) | `{"indicador":"<od_indicators.key>", "informe":"<od_reports.slug>"?, "sede":"<campuses.slug>"?, "periodo":"<od_periods.label>"?, "anio":n?}` | `od_indicators` + `od_values` de un informe y periodo **publicados** que cubren el año (gana el periodo vigente). Cifra del año con la regla del portal (`annualFigure` de `datos-abiertos/data/terms.ts`): `suma` A+B, `promedio` (A+B)/2, `ultimo` B o A, `reportado` (o `reporting='anual'`) el valor anual. Sin sede = toda la UDES; si el total no se capturó y `aggregation='suma'`, sale de sumar todas las sedes del periodo (`od_period_campuses`), como en `repository.ts`. Corte: `od_periods.cutoff_date`. |
| `pdi` (indicador del PDI / Impacto) | `{"indicador":"<imp_indicators.code>", "programa":"<units.id>"?, "sede":"<campuses.slug>"?, "anio":n?}` | `imp_values.value_num` del indicador **publicado** en ese año; sin programa, la cifra global de la unidad dueña. `not_applicable` = sin cifra. |
| `aportes` | — | Suma de `foto_valor` de la misma `clave` en las instancias aprobadas (`ok`) del ciclo cuyo `destino` es esta unidad. |
| `excel`, `manual`, `url` | — | Su `valor`, con `fuente_nombre` como fuente. |

Ejemplos de catálogo: `('matric','Matrícula total','auto','{"indicador":"matriculados","informe":"poblacion-estudiantil"}')`, `('rc','Registros calificados','pdi','{"indicador":"EN3"}')`. La foto guarda en `foto_fuente` el texto «UDES en Cifras · <indicador> · <periodo>» (o «PDI · <código>», «Aportes aprobados», o el `fuente_nombre`).

## Interfaz (fase 1)
`InformesAdmin.tsx` monta la ruta y el riel; todo el acceso a Supabase y a `pilo-informes` está en `datos.ts`. Lógica pura con pruebas: `plantillas.ts`, `tokens.ts`, `cifras-vivas.ts`, `estados.ts`, `validacion.ts`, `capacitacion.ts`. Pantallas en `ui/`: `Tablero`, `MiInforme` (+ `Cifras`, `Bloques`, `Texto`, `modelo`), `Revision`, `Capacitacion`. Movimiento: hooks de `rankings/movimiento.ts`; base visual: `rankings/layout.css` + `informes.css`.
- El editor crea con `informe_guardar_cifra` las cifras de la plantilla que aún no tienen fila (sin fila, `informe_cifras_vivas` no las lee) y fija su primer `visto`.
- `listo` de cada sección lo calcula `validacion.ts` y el editor lo sincroniza aunque nadie escriba (p. ej. «Anexos» o una sección sin cifras que justificar).
- La nota de devolución va en `nota_revision` con una línea por sección («§s3 · Título: nota», `estados.ts`) y, además, una fila por sección en `informe_revisiones`.
- Datos propios: clave `propio_<seccion>_<base36>`, `fuente_tipo` `manual`.
- Pendiente (próxima fase): Consolidador (`informe_consolidado`, editar `destino`), Vista A4/PDF, acción `mejorar` de Pilo.
