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
