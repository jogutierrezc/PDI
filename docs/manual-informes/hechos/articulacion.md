# Hoja de hechos · Articulación del formato y exportables

Módulo: Informes Institucionales (`/admin/informes-gestion`). Rutas relativas a `src/modules/informes/` salvo que se indique otra cosa. Formato de cita: `archivo:línea`. «NO VERIFICADO» marca lo que se dedujo sin haberlo leído.

Convención de redacción del manual: decir «campus» donde la interfaz diga «sede». Los lugares donde la interfaz sí dice «sede» están listados al final (sección 12).

---

## 0. Cómo se llama todo en pantalla (para no confundir al lector)

- Menú de la plataforma: grupo «Informes Institucionales» (`admin/components/AdminShell.tsx:275-281`), ítem «Informes de gestión», ruta `/admin/informes-gestion`.
- Título de la pantalla (kicker): «Informes Institucionales · <año>» (`InformesAdmin.tsx:173`).
- Pestañas (riel «Secciones de Informes Institucionales», `InformesAdmin.tsx:88-125`), en este orden y con estas condiciones:
  1. «Tablero del ciclo» (solo quien gestiona) → `/admin/informes-gestion`
  2. «Mi informe» (todos) → `/admin/informes-gestion/mi-informe`
  3. «Revisión» (quien gestiona, o quien recibe informes de otras unidades) → `/admin/informes-gestion/revision`. Con contador de informes en estado «sent» solo para quien gestiona (`:98`).
  4. «Consolidador» (solo quien gestiona) → `/consolidador`. Es una pantalla de «próxima fase»: título «El consolidador llega en la próxima fase» (`:134-137`).
  5. «Capacitación de Pilo» (solo quien gestiona) → `/capacitacion`
  6. «Estructuras» (solo quien gestiona) → `/estructuras`
  7. «Vista del informe» (todos) → `/vista`
  8. «Guía con Pilo» (solo aparece estando en Mi informe; abre/cierra la guía; `:120-124`)
- Títulos y subtítulos de cada pantalla (`InformesAdmin.tsx:44-52`):
  - Tablero: «Tablero del ciclo» · «Estado por unidad, fecha límite, plantillas y qué cifras se justifican»
  - Mi informe: «Mi informe» · «Las cifras de UDES en Cifras y del Plan de Desarrollo ya cargadas; usted escribe lo que solo su unidad puede decir»
  - Revisión: «Revisión» · «Los informes enviados quedan aprobados; Planeación y la unidad destino pueden devolverlos, con una nota por sección»
  - Consolidador: «Consolidador» · «Cada nivel recibe lo aprobado del nivel de abajo y decide qué entra»
  - Capacitación: «Capacitación de Pilo» · «Los informes de 2025 le enseñan a Pilo cómo escribe cada unidad»
  - Estructuras: «Estructuras» · «Las plantillas A–D y las estructuras propias, y qué oficinas puede usar cada una»
  - Vista: «Vista del informe» · «El informe como saldrá en papel, en Carta o A4, con su portada y su PDF»
- Parámetros de URL: `?anio=<n>` (ciclo; por defecto el abierto o el más reciente, `InformesAdmin.tsx:77-79`), `?unidad=<id>` (Mi informe y Vista; `ui/objetivo.tsx:86-98`), `?s=<n>` (sección abierta en Mi informe, base 1, `ui/MiInforme.tsx:186`), `?informe=<id>` (Revisión, `ui/Revision.tsx:60`). `?sede=<slug>`: ver sección 12.
- Una sección desconocida o sin acceso redirige a `/admin/informes-gestion/mi-informe` (`InformesAdmin.tsx:83-84`).
- Si no existe ningún ciclo, quien no gestiona ve «Planeación todavía no abre el ciclo del informe de gestión.» (`:162`).

---

## 1. Plantillas A–D y estructuras propias (X1…)

Fuente: `plantillas.ts`. Las secciones se numeran `s1`, `s2`… por posición (`plantillas.ts:38-39`). Tipos de sección: `narr`, `pdi`, `metas`, `dim`, `matriz`, `filas`, `logros`, `evid`, `anexos` y `libre` (solo en configuración por ciclo).

| Plantilla | Quién la diligencia | A quién se envía | Secciones (título exacto, tipo) |
|---|---|---|---|
| A (`:56-73`) | Decanatura | Rectoría de Campus | 1 Resumen ejecutivo (narr, mín. 25 palabras, «1 a 3 párrafos», con borrador de Pilo) · 2 Alineación estratégica con el PDI (pdi) · 3 Objetivos y metas 2026 (metas) · 4 Resultados por dimensión estratégica (dim: acad, prof, cal, inv, ext, fin) · 5 Síntesis de resultados institucionales (matriz) · 6 Puntos críticos y acciones de mejora (filas: Dimensión, Punto crítico, Acción, Tiempo, Recursos) · 7 Logros destacados (logros) · 8 Evidencias y fuentes de verificación (evid) · 9 Conclusiones (narr, mín. 25) · 10 Anexos (anexos). Total 10 |
| B (`:74-90`) | Vicerrectoría u oficina | Rectoría General | 1 Resumen ejecutivo (narr, «1 a 3 párrafos, máximo dos páginas», mín. 25, con Pilo) · 2 Alineación estratégica (pdi) · 3 Objetivos y metas anuales de la unidad (metas) · 4 Resultados y evidencias (dim: ext, inv, fin) · 5 Logros (logros) · 6 Análisis de retos y oportunidades (filas: Reto, Aprendizaje, Oportunidad, Propuesta) · 7 Evidencia y fuentes de verificación (evid; nótese «Evidencia» en singular) · 8 Conclusiones (narr, «1 a 3 párrafos, tono claro y propositivo», mín. 25) · 9 Anexos. Total 9 |
| C (`:91-106`) | Rectoría de campus | Rectoría General | 1 Resumen ejecutivo del campus (narr, «1 a 3 párrafos del rector», mín. 25, con Pilo) · 2 Alineación estratégica con el PDI · 3 Objetivos y metas del campus · 4 Consolidado por función sustantiva (dim: inv, ext, acad, fin; `consolida`) · 5 Resultados y evidencias (matriz) · 6 Análisis de retos y oportunidades (filas) · 7 Conclusiones (narr, mín. 25) · 8 Anexos. `conEvidencia` (`:47-53`) agrega «Evidencias y fuentes de verificación» con clave `s9`, colocada antes de Anexos. Total efectivo 9 (el README dice 8: está desactualizado) |
| D (`:107-122`) | Rectoría General | Consejo Superior | 1 Presentación del Rector (narr, «una página», mín. 40, con Pilo) · 2 Introducción (narr, «2 a 3 párrafos: propósito, periodo y organización», mín. 30) · 3 I. Investigación (dim inv, consolida) · 4 II. Extensión (dim ext, consolida) · 5 III. Enseñanza (dim acad, prof, cal, consolida) · 6 IV. Gestión administrativa y financiera (dim fin, consolida) · 7 V. Síntesis y proyecciones 2027 (matriz) · 8 Anexos; más `s9` Evidencias (conEvidencia). Total efectivo 9 |

- La guía de Pilo dice «entre ocho y diez secciones» (`guia/pasos.ts:35`).
- Plantilla sugerida para abrir (`plantillas.ts:223-227`): nombre con «rectoría general» → D; con «campus», «sede» o «rectoría» → C; facultad → A; resto → B. Los programas no escriben informe (`escribeInforme`, `:220`): el Tablero solo lista unidades que no son programas.
- Nombre en pantalla de una plantilla: A–D «Plantilla A · Decanatura» (Tablero, `ui/Tablero.tsx:466`: «`<nombre> · <quién>`»); en los selectores segmentados «A · Decanatura».
- **Estructuras propias** (migración 0279; `ui/Estructuras.tsx`): claves `X1`, `X2`… (regex `^X[0-9]{1,2}$`, `0279:256`; mensaje «Ya no caben más estructuras propias»). Se registran en tiempo de ejecución junto a A–D y el resto del módulo las trata igual (`plantillas.ts:154-171`). Una estructura con informes abiertos no cambia sus secciones ni se elimina; solo nombre, quién la diligencia, a quién se envía, descripción y «Activa» (`ui/Estructuras.tsx:240, 278-282`; `0279:125, 134`). Reglas de validación visibles en pantalla (`mejoras-logica.ts:55-71`): nombre 3–80 caracteres; 2 a 30 secciones; título obligatorio (≤120); `dim` con al menos una dimensión; `filas` con al menos una columna; debe llevar «Evidencias y fuentes de verificación»; solo una sección de anexos. Anexos siempre al final (`moverSeccion`, `:99-105`).
- Una estructura propia desconocida se lee como la A (proxy en `plantillas.ts:129-131`).
- **Quién puede usar cada plantilla** (`ui/Estructuras.tsx:543-650`, tabla `informe_plantilla_unidades`): «Todas las oficinas» o «Solo estas oficinas». Sin filas = todas (`mejoras-logica.ts:37-40`). Si una unidad no puede usar una plantilla, la base responde «Esa plantilla no está habilitada para esta unidad» o «Esa estructura está desactivada» (`0279:209, 212`) (solo se aplica a quien no gestiona).
- Configuración por ciclo (migración 0276; `secciones-config.ts`, `ui/EstructuraConfig.tsx`): por plantilla y ciclo, cada sección tiene `activa`, `orden`, `titulo`, `editable_por_unidad`, `libre`, `minimo`. Sin fila manda el código. En ciclo «En preparación» se puede todo; con ciclo «Abierto» o «Cerrado» solo se activa/desactiva y se cambia «La unidad edita» (`EstructuraConfig.tsx:47, 100`; `0276:72-89`). «Evidencias y fuentes de verificación» no se puede desactivar (`secciones-config.ts:33`, `EstructuraConfig.tsx:147,149`). Siempre queda al menos una sección activa (`EstructuraConfig.tsx:147`).
- Tipos en la lista de estructura (`EstructuraConfig.tsx:20-31`): Texto, Alineación con el PDI, Objetivos y metas, Resultados, Síntesis, Tabla de filas, Logros, Evidencias, Anexos, Libre. En el creador de estructuras propias los nombres son otros (`mejoras-logica.ts:12-22`): Texto, Alineación estratégica, Objetivos y metas, Resultados y evidencias, Síntesis, Tabla de filas, Logros e innovaciones, Evidencias y fuentes de verificación, Anexos.

---

## 2. Secciones por tipo: qué hace la unidad en cada una

Fuente principal: `ui/MiInforme.tsx:613-962` (`CuerpoSeccion`) y `plantillas.ts:194-205` (`AYUDA_TIPO`, la línea bajo el título).

| Tipo | Línea de ayuda bajo el título | Qué ve y hace la unidad (con el informe editable) | Cuándo queda «Lista» (`validacion.ts:44-91`) |
|---|---|---|---|
| `narr` | «Lo escribe la unidad» (+ « · <extensión>.») | Campo de texto con «Insertar una cifra viva…», contador «N palabras · mínimo M», vista «Así se leerá, con las cifras vivas» y botón «Pilo redacta un borrador» (si `borrador`) (`MiInforme.tsx:691-700`, `Texto.tsx`) | N palabras ≥ mínimo (o ≥1) |
| `pdi` | «Pilares y avance vienen del Plan de Desarrollo; usted marca con cuáles se articula» | `Alineacion.tsx`: lista de pilares del PDI; botón «Redactar aporte a este pilar»; aporte de texto; «Pilo: redactar el aporte con estos resultados»; acciones («+ Agregar una acción», título, descripción, tablas/gráficas) | Al menos un pilar incluido, todos con aporte de ≥10 palabras y ninguna acción sin título (`alineacion.ts:75-85`). Contenido antiguo (sin `alineacion`): ≥3 pilares marcados |
| `metas` | «En un programa o facultad vienen de los indicadores del programa; el resultado se calcula solo» | Plan de Trabajo (importar JSON/PDF, «Escribir el plan a mano»…), tabla de metas de Impacto bloqueada con columna Análisis, y tabla «Añadir meta» con Objetivo/Programado/Alcanzado; Excel «objetivos-y-metas-anuales» (`MiInforme.tsx:721-782`) | Hay ≥1 meta y todas con meta y alcanzado (`validacion.ts:56-60`) |
| `dim` | «Las cifras vienen solas; usted explica lo que no se ve en ellas» | Selector «¿A qué criterios reporta su oficina?», datos que pide Planeación, cifras y acciones por criterio, conexión opcional a UDES en Cifras/PDI, texto «Análisis de <título>» (`MiInforme.tsx:783-856`) | Todo lo pedido justificado, indicadores y acciones completos, requeridos respondidos |
| `matriz` | «La matriz se arma con las cifras de las secciones anteriores» | Panel de síntesis automático + matriz de indicadores + «Comentario de la matriz» (mín. 10 palabras) | ≥10 palabras |
| `filas` | «Una fila por punto, con acción y fecha» | `ImportarFilas` + `TablaFilas` («Añadir fila») | Al menos una fila con todas las celdas llenas |
| `logros` | «Cada logro con su evidencia» | Excel «logros», «Añadir logro» (título, contexto y resultado, «Evidencia…»), «Logros que propone el sistema» | ≥1 logro con título y resultado |
| `evid` | «Cargue aquí cada archivo una sola vez» | Zona «Suelte archivos o haga clic» (PDF, Word, Excel o imagen · hasta 15 MB), enlace https, tabla de anexos con Abrir/Editar/Quitar, «Evidencias de actividades e indicadores» del sistema | Hay ≥1 anexo (`:81-82`) |
| `anexos` | «Se arma sola con los archivos que cargue» | Tabla numerada de solo lectura | Siempre lista (`:83-84`); no muestra etiqueta de avance (`MiInforme.tsx:442`) |
| `libre` | «Sección propia de este ciclo: texto y tablas o gráficas de UDrive» | Bloques: «+ Agregar texto», «+ Agregar una tabla de Excel», «+ Agregar tablas o gráficas de UDrive» (`BloquesLibres.tsx:304-310`) | Contenido y mínimo de palabras (opcional) |

- Además de las secciones de tipo distinto de `anexos`, `evid` y `libre`, toda sección lleva al pie el bloque «Tablas y gráficas de UDrive · se actualizan mientras el informe está en borrador» (`MiInforme.tsx:481-483`, `ElementosDrive.tsx:140`).
- Sección «Solo lectura» (configurada por Planeación, `editable_por_unidad = false`): la línea bajo el título dice «Planeación definió esta sección: se muestra lo que ya tiene, sin edición.» (`MiInforme.tsx:445`); cuenta como lista (`validacion.ts:48`); los controles dicen «Sección definida por Planeación: solo lectura» (`validacion.ts:98`).
- Textos de la barra lateral de «Controles» por tipo: `validacion.ts:94-153` (ver cada hoja de papel).
- Etiquetas de avance del punto de cada sección: «Sin empezar», «En curso», «Lista» (`validacion.ts:15`).
- Etiquetas pequeñas de bloque: «Aporte» (la escribe la unidad) y «Automático» (el sistema) (`comunes.tsx:90-92`).
- Criterios base de «Resultados» (`indicadores-manual.ts:80-87`): Extensión (`ext`), Internacionalización (`int`), Investigación (`inv`), Enseñanza (`ens`), Gestión administrativa y financiera (`fin`), Acciones estratégicas (`ae`); más los aprobados por Planeación y los propios de la unidad (`l_…`). Lo guardado con `acad`, `prof` o `cal` se lee como `ens` (`:89-93`). Las secciones que consolidan (`consolida`) muestran solo los criterios base de sus dimensiones (`:119-130`).
- Una cifra (indicador) tiene estado calculado: «Superada», «Cumplida», «Parcial», «Rezagada» (`vista/estados.ts:21-26`); sin meta, «Sin meta». El semáforo antiguo del editor usa «Cumplida», «En camino», «Rezagada» (`cifras-vivas.ts:37`).
- Una **acción** (tipo «accion») es solo texto: Nombre de la acción, Descripción de la acción, Qué se ha hecho con la acción, Cuándo se plantea su finalización, Proyecciones (texto), Proyecciones (número), Unidad; completa si tiene nombre, descripción y qué se ha hecho (`indicadores-manual.ts:187-203`, `ResultadosManuales.tsx:648-684`).

---

## 3. Cifras vivas y tokens `[[clave]]`

- El texto lleva tokens `[[clave]]` (letras, números, guion bajo; `tokens.ts:12`). En pantalla se ven como «chip» con el valor y la fuente al pasar el cursor (`Texto.tsx:21-39`). Un token sin valor o inexistente se muestra literal `[[clave]]` con el título «Esta cifra no tiene valor o no existe en el informe» (`Texto.tsx:33`).
- Cómo se inserta: desplegable «Insertar una cifra viva…» + botón «Insertar»; nota «La cifra queda como vínculo: si la fuente cambia, el texto cambia.» (`Texto.tsx:82-94`). Cada opción: «<etiqueta> (<valor>)».
- Qué claves existen (`ui/modelo.ts:113-114`): las cifras incluidas del informe (las 14 de `CIFRAS`, las agregadas de UDES en Cifras, los datos propios `propio_<sección>_<base36>`, los indicadores escritos `ind_<sección>_<id>`) y las de la síntesis `sint_…` (`sint_acciones`, `sint_acciones_completadas`, `sint_acciones_proceso`, `sint_actividades`, `sint_actividades_cumplidas`, `sint_avance_plan`, `sint_metas`, `sint_metas_cumplidas`, `sint_indicadores`, `sint_cumplen`, …; `sintesis.ts:198-250`).
- Catálogo de 14 cifras automáticas (`plantillas.ts:10-25`): `matric` Matrícula total · `deser` Deserción anual (menos es mejor) · `reten` Retención de primer semestre · `tyt` Saber PRO · promedio global · `doc` Profesores con doctorado · `eval` Evaluación docente · `rc` Registros calificados vigentes · `rct` Registros en trámite (menos es mejor) · `gru` Grupos categorizados · `sem` Semilleros activos · `nuc` Productos de nuevo conocimiento · `con` Convenios activos · `pext` Proyectos de extensión · `ejec` Ejecución presupuestal. Dimensiones (`:29-36`): acad Gestión académica, prof Gestión profesoral, cal Calidad y oferta, inv Investigación, ext Extensión, fin Gestión administrativa y financiera.
- Avisos del texto («Controles», `tokens.ts:91-108`):
  - «Extensión adecuada (N palabras)» / «Faltan N palabras para el mínimo»
  - «El texto parece un ejemplo de la plantilla. Reemplácelo.» / «Sin frases de ejemplo de la plantilla» (dispara con `[corchete simple]`, «ejemplo:», «lorem ipsum», «telecentro rural»)
  - «Hay N cifra escrita / cifras escritas a mano. Use «Insertar una cifra viva» para que sigan a su fuente.» / «Las cifras del texto están enlazadas a su fuente» (los años 19xx/20xx no cuentan)
  - «Cifras que no existen en este informe: [[x]], …»
- **Foto al enviar**: mientras el informe sea borrador/devuelto, las cifras con fuente automática se leen en vivo; al enviar la base toma la «foto» (valor, fuente, fecha) y desde ahí no cambia; al devolver las cifras vuelven a ser vivas (`README.md:8`, `0153:~735` disparador `informe_instancias_foto`; `0281:5-8`). En pantalla: etiqueta «En vivo» (con punto), «Foto del <fecha>», «Fuente propia» (`ui/Cifras.tsx:41-51`); texto del riel «Las cifras siguen en vivo hasta que envíe.» / «Las cifras quedaron congeladas al enviar.» (`MiInforme.tsx:358`); aviso de cambio: «Cambió desde que lo revisó: X → Y» + botón «Aceptar» (`Cifras.tsx:30-39`). En la vista en papel cada hoja lleva la marca «Cifras en vivo» o «Foto del <fecha>» (`VistaInforme.tsx:115`).
- Fuentes de una cifra (etiquetas, `cifras-vivas.ts:17-24`): `auto` «UDES en Cifras (en vivo)» · `pdi` «Indicador del PDI (en vivo)» · `aportes` «Aportes aprobados (en vivo)» · `excel` «Excel propio» · `manual` «Dato manual» · `url` «Documento o URL». El selector «Fuente» de la tarjeta ofrece auto, pdi, excel, manual, url (no `aportes`; `Cifras.tsx:13`). `excel`, `manual` y `url` exigen «Nombre de la fuente (obligatorio)» y se marcan «Fuente propia» y «Dato propio». Un dato propio se agrega con «Añadir un dato propio (sin UDES en Cifras)» (campos: «Nombre del dato», «Valor», «Fuente», «Pilar del PDI»; errores «Ponga nombre y un valor numérico.», «Falta la fuente.», «Elija el pilar del PDI.»; `Cifras.tsx:181-231`; `Dimensiones.tsx:319-322`). Tope por sección: «N de M datos propios que permite Planeación» (`Cifras.tsx:282-285`); la base responde «Esta sección ya tiene N datos propios: es el límite del ciclo» (`0153:879`).
- ATENCIÓN (hecho de la interfaz, `RequisitosConfig.tsx:284-286`): «Las 14 cifras automáticas — UDES en Cifras y PDI no están alimentando datos, y el envío exige justificar las cifras marcadas «Justificar». Si la plantilla X va a reportar todo a mano, pase esas cifras a «No pedir».» Y el libro de Excel lo repite: «Aún no hay cifras vivas del sistema: todo lo reporta la unidad.» (`libro-informe.ts:AYUDA_HOJA.dim`). Hoy, en la práctica, las unidades reportan a mano en «Resultados».

---

## 4. Requisitos: justificar / sugerido / no (dos mecanismos distintos)

**Mecanismo A: las 14 cifras automáticas** (`informe_requisitos`; Tablero, tarjeta «Qué datos debe justificar cada unidad», `Tablero.tsx:193-279`). Tabla Dato · Fuente · Condición; segmentado «Justificar | Sugerido | No pedir» por cifra; contadores «deben justificarse / sugeridos / no se piden». Texto: «Para la plantilla a (decanatura). Lo que marque como «Justificar» aparece bloqueado en el informe de cada unidad, con una línea de explicación obligatoria.» (`:205-208`). Guardado inmediato (cada clic). Efecto en la unidad: la tarjeta de la cifra muestra «Lo pide Planeación» con candado y un campo «Explique este resultado en una línea» (`Cifras.tsx:114-145`); «Sugerido» deja la casilla «Incluir»; «No pedir» no la muestra (`Cifras.tsx:263`).

**Mecanismo B: datos que pide Planeación en «Resultados»** (`informe_datos_requeridos`, migración 0253; Tablero, tarjeta «Los datos que pide cada tipo de unidad», `RequisitosConfig.tsx`). Cada dato: «Dato» (3–120 caracteres), «Fuente» (tipo Manual/Excel/UDES en Cifras/PDI + «Dónde se consigue»), «Criterio y unidad» (criterio, Conteo/%/pp/$, «Más es mejor/Menos es mejor») y «Condición» («Justificar», «Sugerido», «No pedir»). Botones: «+ Añadir dato», «Guardar los datos», «Copiar de la plantilla X», «Bajar Excel (las cuatro plantillas)», «Subir Excel», «Pasar las 14 cifras automáticas a «No pedir»». Texto: ««Justificar» es obligatorio para enviar; «Sugerido» aparece pero no bloquea; «No pedir» no se muestra.» (`:47`). Efecto en la unidad: bloque «Lo que pide Planeación» con insignia «Lo pide Planeación» o «Sugerido por Planeación»; nombre, unidad y sentido fijos; la unidad llena Anterior, Actual, Meta, «Fuente propia de la unidad» y «Justificación (obligatoria)» (mín. 10 caracteres, `requeridos-logica.ts:40, 85-93`). Falta se dice «Falta la cifra actual, la meta, la justificación (mínimo 10 caracteres).» (`ResultadosManuales.tsx:523`).
  - NOTA técnica (observado en código): `normalizarRequerido` descarta filas cuya plantilla no sea A–D (`requeridos-logica.ts:50`) y la carga por Excel solo acepta A–D (`:151`). Por tanto los datos requeridos solo funcionan para A–D, aunque el selector del Tablero lista también las estructuras X (`RequisitosConfig.tsx:55`). NO VERIFICADO si la tabla en base también lo restringe.

**Ajustes generales por ciclo** (tarjeta «Los datos libres», `Tablero.tsx:283-322`): «Datos propios por sección» (− / + entre 0 y 10, por defecto 3), casilla «Exigir fuente en cada dato propio» (por defecto sí), casilla «Exigir un pilar del PDI vinculado» (por defecto no) (`ui/modelo.ts:26`).

**Criterios** (tarjeta «Criterios de Resultados por dimensión», `CriteriosAdmin.tsx`): crea, aprueba, rechaza (con «Motivo si lo rechaza»), archiva o borra criterios; «Rige desde» año; «Sugeridos por las unidades (N)»; el criterio propio de la unidad se crea con «Crear criterio» y se sugiere con «Sugerir a Planeación para próximos ciclos» → luego «Sugerido a Planeación».

**Cuándo bloquea el envío** (`0279:499-566`, `estados.ts`): ver `administrador.md`, `gestor.md`.

---

## 5. Fuentes (resumen)

| `fuente_tipo` | De dónde sale el valor | Mensajes en pantalla |
|---|---|---|
| `auto` | UDES en Cifras (indicador publicado, año del ciclo) | «En vivo», «corte <fecha>» |
| `pdi` | Indicador de Impacto/PDI publicado | «En vivo» |
| `aportes` | Suma de lo aprobado de las unidades que entregan a esta (consolidador, próxima fase) | «Aportes aprobados (en vivo)» |
| `excel`, `manual`, `url` | Lo escribe la unidad | «Fuente propia», exige nombre de fuente |

(`README.md:117-126` para el mapa clave → consulta; el consolidador aún no existe en pantalla.)

---

## 6. Libro de Excel del informe (botón «Libro de Excel» en Mi informe)

- Dónde: en Mi informe, riel izquierdo, enlace «Libro de Excel» (`MiInforme.tsx:362-364`) → cajón lateral «Libro de Excel» (subtítulo: nombre de la unidad) con pestañas «1 · Exportar» y «2 · Importar» (`LibroExcel.tsx:78-87`). Texto: «Todo el informe en un solo libro, para compartirlo con su equipo o con otras oficinas, recoger la información y cargarla de vuelta.»
- Está disponible para cualquier papel que vea Mi informe (también Consulta y la administración en solo lectura), pero importar se bloquea (ver «Bloqueos» en 6.2).

### 6.1 Exportar (`LibroExcel.tsx:103-249`)
- «Qué descargar»: «Un libro completo» («Todas las hojas en un solo archivo.») o «Un libro por equipo» («Asigne cada sección a un equipo y se descarga un libro por equipo, solo con sus hojas.»).
- «Hojas · N de M»: casilla «Incluir <título>» por sección, con número `01`, `02`… y una insignia: «Automática» (matriz y anexos), «Cifras y acciones de la unidad» (dim), «Se diligencia» (resto).
- Equipos sugeridos (se puede escribir otro; `:54-55`): «Quien lidera el informe», «Decanatura», «Dirección de programa», «Coordinación de investigación», «Coordinación de extensión», «Secretaría académica». Por defecto: narr → Quien lidera; pdi/metas/filas → Dirección de programa; dim/evid → Secretaría académica; matriz/anexos/libre → Quien lidera; logros → Coordinación de extensión. Error: «Falta el equipo de alguna hoja.»
- Casilla «Bloquear las celdas grises» (por defecto marcada): «Protege la hoja sin contraseña: solo se escribe en las celdas de color. Se quita desde Revisar → Desproteger hoja.»
- Lista «Archivos»: nombre del archivo y «N hojas» (hojas de contenido + 3: portada, Listas, _Control; `:229`). Mensaje «Elija al menos una hoja.»
- Botón «Descargar libro» / «Descargar N libros» / «Preparando…». Resultado: «Se descargó <archivo>.» o «Se descargaron N libros. Si su navegador pidió permiso para varias descargas, acéptelo.» Error: «No se pudo crear el libro: …».
- **Nombre del archivo** (`libro-informe.ts:410-411`): `Informe_Gestion_<año>_<plantilla>.xlsx`, p. ej. `Informe_Gestion_2026_A.xlsx`; por equipo `Informe_Gestion_<año>_<plantilla>_<equipo en minúscula, sin tildes, con guiones>.xlsx`, p. ej. `Informe_Gestion_2026_A_secretaria-academica.xlsx` (sin equipo: `equipo`).
- **Hojas** (`libro-informe.ts:319-400`):
  - `00 Portada` (campos Unidad, Plantilla «Plantilla A · la diligencia Decanatura», Destino, Ciclo, [Equipo], Fecha de exportación, Hojas de contenido; seis instrucciones «Cómo diligenciarlo»; leyenda de colores «Azul claro», «Amarillo», «Gris»). Banner «Informe de gestión <año>» · «<unidad> · Libro de recopilación».
  - Una hoja por sección: nombre `NN <Título>` (NN = posición en la estructura completa, máximo 31 caracteres, `:93`). La sección `dim` que no consolida trae primero `NN Criterios` y luego `NN <Título>` (`:233-251`).
  - `Listas` (oculta) y `_Control` (oculta). 
  - Cada hoja: banda azul de tres filas (título con logo, subtítulo «Informe de gestión <año> · <unidad> · Hoja NN», ayuda) y **encabezado en la fila 4** (`FILA_ENCABEZADO = 4`, `:62`).
  - Colores: azul claro = se diligencia, amarillo = obligatoria, gris = la pone el sistema.
- **Columnas por tipo** (`libro-columnas.ts`; «O» = obligatoria/amarilla, «D» = diligenciar/azul, «B» = bloqueada/gris):
  - `narr` (`:37-40`): «Texto de la sección» (O) · «Palabras» (B).
  - `libre`: «Texto» (D) · «Palabras» (B). Un párrafo por fila; las tablas y gráficas de UDrive no viajan.
  - `pdi` (`:44-49`): «Pilar del PDI» (B) · «Avance del plan» (B) · «Articula con su unidad» (O; lista Sí/No) · «Aporte de la unidad» (D). Una fila por pilar del PDI.
  - `metas` (`:51-56`): «Objetivo o meta anual» (O) · «Programado» (O) · «Alcanzado» (D) · «Resultado» (B; Superada/Cumplida/Parcial). Si no hay metas trae dos filas de ejemplo «(borre esta fila)».
  - `dim` criterios (`:58-62`): «Criterio» (O) · «¿Reporta aquí?» (O; Sí/No) · «Origen» (B; Base / Aprobado por Planeación / Propio de la unidad). Seis filas libres al final para un criterio propio (se guarda en `contenido.criterios_propios`).
  - `dim` resultados (`indicadores-manual.ts:311-314, 512`; `libro-columnas.ts:64-89`): «Criterio» (O) · «Indicador» (O) · «Unidad» · «Qué es mejor» (lista «Más es mejor»/«Menos es mejor») · «Año anterior» · «Cifra actual» · «Meta» · «Fuente» · «Nota» · «Tipo» (O; lista «Cifra»/«Acción») · «Descripción de la acción» · «Qué se ha hecho» · «Finalización» · «Proyección (texto)» · «Proyección (número)» · «Pilar del PDI» (lista) · «N.º de anexos» (B) · «Estado (lo calcula el sistema)» (B). Una fila por cifra o acción.
  - `matriz` (referencia, no se importa): «Criterio» · «Cifras reportadas» · «Sin dato» · «Lectura». Sin datos: «Se arma sola cuando las demás hojas tengan cifras».
  - `filas`: las columnas de la estructura; opcionales (azul) «Recursos», «Aprendizaje», «Oportunidad»; el resto obligatorias. Si la primera columna es «Dimensión», lista con los criterios base.
  - `logros`: «Logro» (O) · «Contexto y resultado» (O) · «N.º de anexo» (D).
  - `evid`: «N.º» (B) · «Documento» (O) · «Descripción» (O) · «Enlace» (D). Solo se importan enlaces `https://`.
  - `anexos` (referencia, no se importa): «N.º» · «Documento» · «Origen» (Enlace/Archivo).
- **`_Control`** (clave/valor): `formato` = `libro-informe`, `version_libro` = 1, `ciclo` (id), `anio`, `plantilla`, `instancia` (id del informe), `unidad`, `huella`, `generado`, `fila_encabezado` = 4, `equipo` (si es por equipo) y `<claveSección>` → nombre de hoja (`<clave>:crit` para la de criterios). La `huella` es un hash corto de plantilla, claves, tipos, columnas y dimensiones de las secciones activas (`:109-117`).

### 6.2 Importar el libro devuelto (`LibroExcel.tsx:262-537`)
1. Zona «Cargue el libro devuelto» («Arrastre el .xlsx aquí o elíjalo. Si salió de este informe se reconoce solo; si lo armó otra oficina, se compara por encabezados.»), botón «Elegir archivo» / «Leyendo…».
2. Solo `.xlsx`: «Solo se leen libros .xlsx. Si lo tiene en .xls o .csv, ábralo en Excel y guárdelo como .xlsx.» Sin hojas utilizables: «El libro no tiene hojas con encabezado y filas para importar.» Fallo de lectura: «No se pudo abrir el libro: …».
3. Validación con `_Control` (`libro-informe.ts:509-519`): rechazo si «Este archivo no es un libro de informe de gestión.»; «Este libro es del informe de «<unidad>», ciclo <año>, plantilla <X> y no corresponde a este informe. Descargue el libro desde este informe y vuelva a intentarlo.»; «Este libro es de otro ciclo (<año>). Descargue uno nuevo desde este informe.»; «Este libro es de la plantilla X y el informe usa la Y.». Solo aviso: «Este libro salió de una versión más nueva del sistema; algunas columnas pueden no reconocerse.» y «La estructura del informe cambió desde que se descargó este libro (secciones o columnas). Revise la clasificación antes de aplicar.»
4. Cabecera del archivo cargado: «<archivo> · N hojas · M filas», insignia «Libro del sistema · reconocido» o «Libro de terceros · por encabezados», botón «Cargar otro».
5. «Qué hoja va a qué sección»: por hoja, selector de sección (o «No importar esta hoja» / «Solo referencia: no se importa»), chips «<encabezado> → <columna>» o «<columna> · falta», y confianza: «Por _Control · 100 %», «Elegida por usted», «Reconocida · N %», «Revisar · N %», «Sin destino · N %»; aviso «Otra sección puntúa igual: confirme.» Puntaje para libros sin `_Control` (`README.md:240`): ≥ 0,75 reconocida; 0,4–0,75 revisar; < 0,4 sin destino.
6. «Revisión»: contadores «filas listas», «con aviso», «sin importar»; lista de avisos (hasta 60; «y N avisos más.»); por sección «N nuevas · N completadas · N ya estaban». Mensajes típicos (`libro-informe.ts:703-880`): ««<hoja>», fila N: falta X y Y.»; ««<hoja>»: solo se importan las primeras 500 filas; el resto se omitió.»; ««<hoja>»: N filas de ejemplo se omitieron.»; ««<hoja>», fila N: «x» no es Sí ni No; se omitió.»; «…: el pilar «x» no es uno del Plan de Desarrollo; se omitió.»; «…: «x» no es un número en <columna>.»; «…: «x» no es un número de anexo; quedó vacío.»; «…: sin enlace https://. Los archivos se suben desde la sección de evidencias; se omitió.»; ««<hoja>», «<indicador>»: falta …»; ««<hoja>»: no hay texto para importar.»; ««<hoja>»: N filas tienen una dimensión que no es ninguna de las conocidas; se importó como texto libre.»; ««<hoja>»: N filas sin Tipo se tomaron como cifra.»
7. «Cómo aplicar» (modos, `libro-informe.ts:67-71`):
   - «Agregar al final»: «Suma lo del libro a lo que ya está escrito. Lo que ya existe no se toca.» (por defecto)
   - «Llenar solo lo vacío»: «Completa las celdas que están vacías en el informe y suma las filas que no existen. Nada de lo escrito se cambia.»
   - «Reemplazar la sección»: «Lo del libro queda en lugar de lo que había en cada sección importada.» (pide confirmación: «Reemplaza lo escrito en: <secciones>. Las evidencias no se reemplazan. ¿Continuar?»; conserva tablas de UDrive de un logro que sigue, acciones de un pilar que sigue y los indicadores que pidió Planeación, `README.md:240`).
8. Campo «Quién aporta este libro» (placeholder «Equipo u oficina, p. ej. Secretaría académica», 120 caracteres; se rellena con `equipo` de `_Control`). Solo queda en el aviso final y en la descripción de las evidencias nuevas («(aportó: X)»); el informe no tiene campo para guardarlo en las demás secciones (`LibroExcel.tsx:364`).
9. Botón «Aplicar al informe» / «Aplicando…». Mensaje: «Libro aplicado» + resumen «N filas agregadas al final | puestas donde faltaban | en lugar de lo anterior en M secciones [y K evidencias nuevas]. Revise N avisos antes de enviar.» Si no hay nada: «No hay nada que aplicar con esta clasificación.»
10. Se escribe por la misma ruta del editor (guardado inmediato y recálculo de «lista»), `MiInforme.tsx:236-241`.
- **Bloqueos**: informe «sent»/«ok»: «El informe ya se envió: no admite cambios. Pida que lo devuelvan para modificaciones.»; papel sin permiso (Consulta, administración en solo lectura): «Su papel no permite escribir en este informe.»; sección de solo lectura: ««<título>» es de solo lectura (la definió Planeación): no se escribió.» (`libro-informe.ts:1047, 1065-1070`).
- **Evidencias**: solo entran enlaces `https://`; los archivos se suben desde la sección. «Reemplazar» no borra evidencias: aviso «Las evidencias no se reemplazan: solo se agregan las nuevas. Quite las que sobren desde la sección de evidencias.»
- **Un libro por equipo** → cada equipo devuelve su libro; se importan uno tras otro (cada uno conserva la huella de la estructura completa).

### 6.3 Otros Excel del módulo (nombres exactos de archivo)
| Dónde | Botón | Archivo | Hoja(s) |
|---|---|---|---|
| Resultados (sección `dim`), `ResultadosManuales.tsx` | «Descargar plantilla» | `plantilla-resultados-y-evidencias.xlsx` | «Cifras», «Acciones», «Criterios», «Pilares» |
| ídem | «Bajar lo escrito» | `resultados-y-evidencias.xlsx` | ídem |
| ídem | «Importar Excel» → «Vista previa · N indicadores de <archivo>» → «Añadir a lo que ya hay» / «Reemplazar todo» / «Descartar» | (lee `.xlsx` con hojas «Cifras» y/o «Acciones»; también la antigua «Indicadores») | Error: «El libro no tiene las hojas «Cifras» ni «Acciones». Use la plantilla que se descarga aquí.» |
| Secciones `filas`, `metas`, `logros`: `ImportarFilas.tsx` | «Descargar plantilla» | `plantilla-<archivo>.xlsx` con `<archivo>` = `puntos-criticos` (columnas empiezan por «Dimensión»), `retos-oportunidades`, `objetivos-y-metas-anuales`, `logros` | «Filas» |
| ídem | «Bajar lo escrito» | `<archivo>.xlsx` | «Filas» |
| ídem | «Importar Excel» → «Vista previa · N filas de <archivo>» → «Añadir a lo que ya hay» / «Reemplazar todo» (confirma «Reemplaza las N filas escritas. ¿Continuar?») / «Descartar» | máx. 500 filas | Avisos: «Los encabezados no coinciden con los de la plantilla; se leyó por posición de columna.», «Fila N: falta X», «El archivo no tiene filas debajo del encabezado.» |
| Requisitos de Planeación | «Bajar Excel (las cuatro plantillas)» / «Subir Excel» | `datos-requeridos.xlsx` | «Datos requeridos» (columnas Plantilla, Dato, Fuente (tipo), Fuente (nombre), Criterio, Unidad, Qué es mejor, Condición) |
| Bloque «tabla de Excel» en secciones libres | pegar o subir `.xlsx`/`.csv` | — | máx. 200 filas × 20 columnas |

---

## 7. Vista Carta / A4 / PDF (`vista/`, pestaña «Vista del informe»)

- Ruta: `/admin/informes-gestion/vista` (más `?unidad=<id>`). Desde Mi informe: enlace «Vista del informe en papel» (`MiInforme.tsx:359-361`); desde el Tablero, enlace «Vista del informe» por fila; desde Revisión, «Ver el informe como saldrá en papel (Carta, A4 y PDF)».
- Estructura del libro (`Libro.tsx:152-187`): hoja 1 portada · hoja 2 «Contenido» (índice con números de página reales) · hojas de cuerpo (cada sección abre hoja nueva; franja con el título de la sección y «(continuación)») · «Cierre del informe» · contraportada. Total «N hojas Carta|A4.» (`VistaInforme.tsx:143, 218`).
- Papel (`VistaInforme.tsx:160-170`, `perfil.ts:45-48`): segmentado «Papel» con «Carta» (215,9 × 279,4 mm, por defecto) y «A4» (210 × 297 mm). Márgenes 16 mm, cabecera 35,5 mm, pie 18 mm (`perfil.ts:33-35`). Se guarda por informe si quien lo cambia puede editar el diseño; si no, vale solo para la sesión. Aviso al guardar: «Papel guardado.»
- Barra de acciones: «Personalizar portada», «Personalizar cierre», «Crear presentación con Pilo», «Presentaciones de este informe», «Descargar PDF» (deshabilitado hasta que el libro esté medido: «Armando las páginas…» / «Leyendo las tablas y gráficas de UDrive…»).
- Aviso de estado (`VistaInforme.tsx:184-195`): borrador → «Las cifras están en vivo. Este informe es un borrador: las hojas llevan la marca «Cifras en vivo» y los valores cambian hasta que se envíe.»; enviado/aprobado → «Foto del <fecha>. El informe está aprobado|enviado: las cifras son las que se guardaron al enviarlo y ya no cambian.» + «Su papel: <Planeación|Gestor|Contribuyente|Consulta|Sin función>.»
- «Falta aplicar la migración 0189.» (si no está aplicada: «Puede cambiar el papel, personalizar y descargar el PDF, pero esos cambios no se guardan hasta que se aplique.»)
- **PDF**: el botón «Descargar PDF» abre «Previsualización del PDF» (barra: «Volver a la vista», «N hojas Carta|A4», Alejar `−`, «Ajustar»/«N %», Acercar `+`, «Descargar PDF»). Texto: «En el diálogo de impresión elija Guardar como PDF. El tamaño Carta|A4 y los márgenes ya vienen fijados.» (`VistaPrevia.tsx:59-90`). Usa la impresión del navegador (`imprimir.ts`): fija `@page` y el `document.title` como nombre sugerido del archivo: **«Informe de gestión <año> - <Unidad>»** (`perfil.ts:446-450`, p. ej. «Informe de gestión 2026 - Facultad de Ingeniería», sin `\ / : * ? " < > |`, máximo 120 caracteres). No hay PDF generado en el servidor. Si faltaban fuentes o imágenes: «· los números de página se afinan al imprimir: faltaban fuentes o imágenes por cargar».
- **Portada editable** («Personalizar portada» → «Guardar la portada»; `EditorPortada.tsx`): «Composición» (5: «Foto superior», «Bloque de color», «Tipográfica», «Barra lateral», «Franja institucional», `perfil.ts:277-281`); «Textos»: «Título» (máx. 90), «Subtítulo» (120), «Unidad» (70), «Año de gestión» (4, solo dígitos), «Ciclo» (60); «Fondo» («Foto institucional», «Color», «Imagen propia»; solo la composición «Foto superior» admite foto); «Imagen de la portada» («Subir una imagen» / «Cambiar la imagen»; JPG, PNG o WebP; máx. 5 MB: ««x» pesa más de 5 MB incluso comprimida. Pruebe con una imagen más pequeña.», «La imagen debe ser JPG, PNG o WebP.»); «Zoom» y «Alinear el recorte» («Arriba», «Centro», «Abajo»); «Color de acento» (tres sugeridos o libre; contraste ≥ 4,5:1); «Alineación» («Izquierda», «Centro»); «Tamaño del título» («S», «M», «L»); «Monograma y escudo de la oficina» (3 a 4 letras o números: «El monograma lleva de 3 a 4 letras o números.»; escudo PNG/WebP opcional). Fijo: «El logo de la UDES y su lugar los fija Planeación: no se puede quitar.» Si no hay permiso: «Usted puede ver la portada, pero no cambiarla: el informe está enviado o su papel solo permite consultar.»
- **Cierre y contraportada editables** («Personalizar cierre» → «Guardar el cierre»; `EditorCierre.tsx`): «Página de cierre» → «Mensaje de cierre» (máx. 420; «Un salto de línea abre un párrafo nuevo.»); «Responsables (hasta tres)» (Nombre ≤40, Cargo ≤46; «Un espacio vacío no se imprime.»); «Créditos» → «Elaboración y revisión» (240); «Contacto (opcional)» (Correo 80, Teléfono 36, Dirección 90, Sitio web 80, «Línea del pie de página» 80; «Vacío: el pie lleva el nombre de la unidad.»); «Contraportada» → «Tono» («Azul marino», «Color de la oficina», «Blanco con foto») y «Frase» (90, opcional). Fijo: «El aviso de la fuente de los datos lo redacta Planeación y se imprime siempre.» (en la página de cierre: «Fuente de los datos. Las cifras vienen de UDES en Cifras y del seguimiento del Plan de Desarrollo Institucional…», `Hoja.tsx:389`).
- Quién cambia qué (`VistaInforme.tsx:87-88`): diseño del informe (papel, portada, cierre, contraportada) = Planeación o quien puede editar el informe (Gestor o Contribuyente con el informe en borrador o devuelto); perfil de la oficina (acento, monograma, escudo, contacto, pie) = solo el Gestor o Planeación (`EditorPortada.tsx:383`: «Solo el Gestor de la unidad o Planeación cambian el acento, el monograma y el escudo.»; `EditorCierre.tsx:91`: «…cambian el contacto y el pie.»). NOTA: en la pantalla, quien gestiona sin pertenecer a la unidad aparece con papel «Consulta» (ver `administrador.md`), de modo que NO puede guardar el diseño desde ahí aunque la base lo permitiría.
- Contenido: sale del mismo modelo del editor (`vista/entrada.ts`); cifras en vivo o foto; gráficas de avance, matriz, filas, logros, anexos, tablas y gráficas de UDrive. Estados de cifra «Superada/Cumplida/Parcial/Rezagada» con forma y palabra (▲ ● ◐ ▼, `ResultadosManuales.tsx:49`). Todo texto corrido va justificado (`README.md:228`).

---

## 8. Word

- NO existe exportación a Word en este módulo. Búsqueda en `src/modules/informes/` de «docx/Word»: la única mención en pantalla es la lista de tipos de evidencia («PDF, Word, Excel o imagen · hasta 15 MB», `ui/Bloques.tsx:281`) y la lectura de Word en «Capacitación de Pilo». El README (`:167`) dice: «Word queda para después» y la decisión 6 dice «Word es copia editable, sin garantía de diseño» (`README.md:13`), pero no hay botón ni código que lo haga. (La función «Exportar a Word» existe en UDrive, `src/modules/udrive/salida/aWord.ts`, y no es un botón de Informes.) El redactor del manual NO debe describir un botón «Descargar Word» de informes: pasar por alto o marcarlo como «no disponible».

---

## 9. Presentación con Pilo

- Dónde: botón «Crear presentación con Pilo» (con ícono de chispa; título emergente «Pilo arma una presentación con este informe, con Pilo Astra 1.0»; deshabilitado con «Espere a que el informe termine de cargar») y botón «Presentaciones de este informe», en la barra de la Vista del informe y en el detalle de Revisión (`presentacion/PresentacionConPilo.tsx:105-110`). Disponible para quien vea el informe (RLS: `informe_instancia_visible`, `0284:43-57`).
- Cajón «Crear presentación con Pilo» · «Pilo Astra 1.0»: texto «Pilo lee este informe y arma las diapositivas sobre la plantilla institucional. No inventa cifras, nombres ni fechas: lo que falte queda como «[por completar]».» Campos: «Tono» (Institucional: «Sobrio y formal, para consejos, directivos y entes externos.»; Cercano: «Cálido y directo, para el equipo y la comunidad académica.»; Ejecutivo: «Breve y con la conclusión primero, para decidir rápido.»; Académico: «Preciso y con respaldo, para pares, comités y acreditación.»), «Duración (minutos, opcional)» (1–180: «La duración va de 1 a 180 minutos.»), «Enfoque (opcional)» (300 caracteres). Botones «Cancelar» y «Crear».
- Mientras trabaja: pasos «Leyendo el informe», «Organizando las diapositivas», «Redactando con Pilo Astra 1.0», «Revisando cifras y enlaces»; «Astra razona antes de responder: puede tardar uno o dos minutos. Puede cancelar cuando quiera.»
- Errores: «astra_apagado» → «Pilo Astra 1.0 se enciende en la administración.» + enlace «Ir a Administración · Pilo Work»; «astra_limite» → «Puede volver a intentarlo en unos N min.»
- Visor (`presentacion/Visor.tsx`): botones «Editar textos» (clic en un texto; «Enter guarda y Esc descarta»), «Regenerar con otro tono», «Guardar» (estado «Guardada» / «Cambios sin guardar» / «Sin guardar»), «PDF / Imprimir» (16:9, `@page 1920×1080 px`; nombre del archivo = título de la presentación, sin `/ : * ? " < > |`, ≤120), «Presentar» (pantalla completa, tecla P), «Cerrar» (Esc). Tabla de «Presentaciones de este informe» con «Abrir», «Eliminar» → «Sí, eliminar»/«No»; vacía: «Este informe todavía no tiene presentaciones. Cree la primera con Pilo.»
- Anti-invención: `verificar.ts` comprueba cada cifra, enlace y valor de gráfica contra el informe; lo no verificable queda «[por completar]» y se informa (`presentacion/README.md`). Exporta solo PDF/Imprimir; `.pptx` NO existe («No incluido en esta fase»).
- La presentación se guarda al crearla (migración 0284, tabla `informe_presentaciones`).

---

## 10. Pilo en el módulo

- «Pilo redacta un borrador» (secciones de texto con `borrador`; pide confirmación si ya hay texto: «El borrador de Pilo reemplaza el texto de esta sección. ¿Continuar?»; estado «Pilo está escribiendo…»; insignia «Borrador de Pilo · confirme cada cifra»; aviso «Se guió por N informe(s) aprobado(s)»; `MiInforme.tsx:966-995`). Pilo nunca escribe cifras: usa `[[clave]]`; nunca envía ni aprueba (`guia/pasos.ts:47`).
- «Pilo mejora el texto» / «Pilo redacta un borrador» en otras secciones (`PiloAyuda.tsx`; confirma «Pilo parte de lo que ya escribió y lo reemplaza por su versión; podrá deshacerlo. ¿Continuar?»; insignia «Borrador de Pilo · edítelo a su gusto»).
- Pilo aprende al ENVIAR (el informe queda aprobado): `useEnviar` llama `piloAprender`; si falla: «El informe quedó enviado y aprobado. Pilo no pudo aprender de él esta vez: <motivo>» (`MiInforme.tsx:421`). Solo se aprende lo aprobado; nunca cifras (`capacitacion`, `README.md:14`).
- «Capacitación de Pilo» (solo gestión): ver `administrador.md`.
- Guía con Pilo: 24 pasos (`guia/pasos.ts:32-57`), capítulos «Primer vistazo», «Escribir cada sección», «Controles y datos de apoyo», «Reportar con Pilo», «Enviar y revisión», «Para quien gestiona» (los 4 pasos del último, solo para quien gestiona). Pestaña «Guía con Pilo» y banner «¿Primera vez aquí?» (botones «Empezar la guía» / «Ahora no»), «?» en cada zona («Pilo explica», «Ver la guía completa»/«Seguir la guía desde aquí»). Botones de la tarjeta: «Escuchar»/«Cargando la voz…»/«Detener», «Siguiente»/«Terminar», «Cerrar la guía». Sin voz: «La voz de Pilo no está disponible en este momento. Puede leer el texto.» Recuerda en el navegador (`localStorage informes:guia:*`). Para Consulta la tarjeta añade: «Usted tiene rol de Consulta: ve el informe pero no lo edita. La guía le sirve para entender lo que ve.»

---

## 11. Qué exporta cada cosa (cuadro resumen)

| Acción en pantalla | Qué sale | Nombre exacto del archivo |
|---|---|---|
| Mi informe → «Libro de Excel» → «Descargar libro» | Libro completo del informe | `Informe_Gestion_<año>_<plantilla>.xlsx` |
| ídem, «Un libro por equipo» → «Descargar N libros» | Un libro por equipo | `Informe_Gestion_<año>_<plantilla>_<equipo-con-guiones>.xlsx` |
| Resultados → «Descargar plantilla» | Plantilla con ejemplos | `plantilla-resultados-y-evidencias.xlsx` |
| Resultados → «Bajar lo escrito» | Lo escrito | `resultados-y-evidencias.xlsx` |
| Filas/Metas/Logros → «Descargar plantilla» | Plantilla | `plantilla-puntos-criticos.xlsx`, `plantilla-retos-oportunidades.xlsx`, `plantilla-objetivos-y-metas-anuales.xlsx`, `plantilla-logros.xlsx` |
| Filas/Metas/Logros → «Bajar lo escrito» | Lo escrito | `puntos-criticos.xlsx`, `retos-oportunidades.xlsx`, `objetivos-y-metas-anuales.xlsx`, `logros.xlsx` |
| Tablero → «Bajar Excel (las cuatro plantillas)» | Datos requeridos | `datos-requeridos.xlsx` |
| Vista → «Descargar PDF» (diálogo del navegador) | PDF Carta/A4 | Nombre sugerido: «Informe de gestión <año> - <Unidad>» (+ `.pdf` del navegador) |
| Presentación → «PDF / Imprimir» | PDF 16:9 | Título de la presentación |
| Word | No existe | — |
| Anexo (evidencia) | Se abre con «Abrir» (URL firmada 10 min; si falla «No se pudo abrir el anexo.») | el nombre original |

---

## 12. Textos de la interfaz que dicen «sede» (en el manual escribir «campus»)

El informe es ÚNICO por unidad desde la migración 0280: ya no se parte por campus (`sedes.ts:1-9, 23-25, 46-51`: `sedesPorUnidad` devuelve listas vacías; `nombreConSede` devuelve solo el nombre de la unidad). Por eso la mayoría de estos textos no se ven en la práctica. Lugares:

1. `ui/MiInforme.tsx:96` (visible): «Su usuario no tiene ninguna unidad asignada en «Dónde trabaja». Pida a Planeación que se la asigne, **con su sede**, o que su rol le dé el informe de una.» (pantalla Mi informe de una persona sin unidad). Misma frase en `vista/VistaInforme.tsx:52`.
2. `vista/VistaInforme.tsx:52` (visible, gestión): «Elija el informe desde el Tablero del ciclo: ahí están todas las unidades y **sedes**.»
3. `ui/objetivo.tsx:135-155`: etiqueta «**Sede**» de un selector que solo aparecería si una unidad ofreciera varios campus; con la regla actual (listas vacías) no se muestra (`elegirSede` requiere `ofrecidas.length > 1`). NO VERIFICADO en producción.
4. `ui/Dimensiones.tsx:81-88`: selector con `aria-label="Sede"` y opción «Toda la UDES» dentro del buscador de indicadores de UDES en Cifras (al conectar un indicador): lista los campuses de UDES en Cifras. Visible para el lector de pantalla; el texto de opciones es el nombre del campus.
5. `vista/Hoja.tsx:430-433` y `vista/perfil.ts:365, SEDES`: en la **contraportada** del PDF aparece la línea «**Sedes** — Bucaramanga · Cúcuta · Valledupar · Bogotá» (por defecto `sedes: true`; no hay interruptor en el editor). Esto SÍ sale impreso.
6. `ui/MiInforme.tsx:596`: etiqueta de un indicador conectado con campus: «<indicador> · <campus>».
7. `datos.ts:263`: error «Falta aplicar la migración 0272 (informes por **sede**).» (solo si se intenta abrir informe con campus sin la migración).
8. Parámetro de URL `?sede=<slug>` (`ui/objetivo.tsx:127`, `ui/TodosLosInformes.tsx:34-52`): existe, pero con la regla actual `enlaceInforme` solo lo agrega si hay campus (no ocurre). Los enlaces del Tablero llevan solo `?unidad=<id>`.
9. `plantillas.ts:225`: la heurística de plantilla reconoce «campus|sede|rectoría» en el nombre de la unidad.
10. `capacitacion.ts`: `plantillaDesdeNombre` reconoce «campus|valledupar|cúcuta|bogotá|sede» en el nombre del archivo.
11. Pantalla de roles (`admin/usuarios/RolesView.tsx`, módulo «Informes de gestión»): NO VERIFICADO si algún texto dice «sede»; en las líneas leídas (245-340, 410-482, 745-812) no aparece.
12. README (documentación, no pantalla): títulos «Un informe por unidad y por sede (0272)».

---

## 13. Cosas que vale la pena mostrar en captura (articulación)

1. Mi informe con una plantilla A: riel con las 10 secciones y puntos de avance.
2. Una sección de texto con «Insertar una cifra viva…» y «Así se leerá, con las cifras vivas» mostrando un chip con valor.
3. El aviso ámbar «Hay N cifras escritas a mano…» frente al verde «Las cifras del texto están enlazadas a su fuente».
4. Resultados y evidencias con el selector «¿A qué criterios reporta su oficina?» y un indicador con estado «Parcial».
5. El cajón «Libro de Excel» pestaña «1 · Exportar» con «Un libro por equipo» y equipos asignados.
6. El cajón pestaña «2 · Importar» con un libro cargado: chips de columnas, «Reconocida · 100 %», contadores y «Cómo aplicar».
7. El libro abierto en Excel: hoja `00 Portada`, hoja de resultados con encabezado en fila 4 y colores azul/amarillo/gris.
8. Vista del informe: barra con «Carta | A4», «Personalizar portada», «Descargar PDF», y la marca «Cifras en vivo» en una hoja; luego «Foto del <fecha>» en un informe aprobado.
9. Editor de portada con las cinco composiciones; editor de cierre con firmas.
10. Previsualización del PDF con el diálogo de impresión «Guardar como PDF».
11. Cajón «Crear presentación con Pilo» (tono, duración, enfoque) y el visor de diapositivas.
