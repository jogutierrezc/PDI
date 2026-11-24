# Hoja de hechos · GESTOR (rol `jefe` de la unidad: diligencia y envía)

Rutas relativas a `src/modules/informes/` salvo indicación. Cita: `archivo:línea`. «NO VERIFICADO» = deducido, no leído. En el manual se dice «campus»; los textos de pantalla que dicen «sede» están en `articulacion.md` §12.

Complementos: `articulacion.md` (plantillas, secciones, cifras, Excel, PDF, presentación) y `contribuyente.md` (lo que el Gestor comparte con el Contribuyente). Aquí se documenta el recorrido completo del Gestor y lo exclusivo suyo.

---

## 1. Quién es el Gestor

- Papel `jefe` de la unidad. Nombre en pantalla: «Gestor» (`rankings/reporte/envio.ts:37-50`; `mejoras-logica.ts:102`). Ayuda oficial: «Diligencia y envía el informe» (`mejoras-logica.ts:104`).
- Cómo llega a serlo (cualquiera de dos caminos):
  1. «Dónde trabaja» (`unit_members`): pertenencia a la unidad con función `jefe`. Planeación también lo asigna desde el Tablero → «Responsables» (papel «Gestor»; `Responsables.tsx`).
  2. Un rol de acceso con módulo «Informes de gestión» en nivel «Ver» y «Quién hace el informe» = «Diligencia y envía» («Además lo envía a revisión, como un Gestor.»), con «Toda la estructura» o unidades elegidas (`admin/usuarios/RolesView.tsx:241-246, 289-340`). Se toma el papel más fuerte entre pertenencia y rol (`0192:157-179` `informe_actor`; `ui/objetivo.tsx:70`).
  3. Condición adicional: si la persona tiene un rol de acceso que NO marca la pantalla «informes», el módulo queda cerrado aunque pertenezca a una unidad (`README.md:143, 178`).
- Si una persona trabaja en varias unidades: se abre la de mayor función y, a igual función, la primera del organigrama; las demás salen como enlaces «Sus otras unidades:» (`objetivo.tsx:70-84, 157-168`).
- Un Gestor de una unidad que es destino de otros informes (p. ej. una Rectoría de campus que recibe los de las facultades) también ve «Revisión» y puede **devolver** esos informes (`InformesAdmin.tsx:68-70, 97-101`; `0281`).

### 1.1 Qué puede hacer
- Ver y diligenciar el informe de su unidad cuando está en borrador o devuelto y el ciclo está abierto (`estados.ts:39-42`).
- Enviar (el informe queda aprobado) (`estados.ts:24-31` `draft→sent`, `back→sent`: `jefe`).
- Reabrir un informe devuelto (pasa a borrador al guardar; `back→draft`).
- Usar el libro de Excel (exportar e importar), Vista del informe en papel y PDF, presentación con Pilo, Pilo redacta, guía.
- Cambiar el diseño del informe (papel, portada, cierre, contraportada) mientras sea borrador o devuelto.
- Cambiar el perfil de la oficina: color de acento, monograma, escudo, contacto y línea del pie (`VistaInforme.tsx:88`: `puedePerfil = actor === "planeacion" || actor === "jefe"`). Esto lo distingue del Contribuyente.
- Sugerir un criterio propio a Planeación (RLS permite `jefe` y `editor`; `0252:109-120`).
- Devolver los informes que le llegan, si su unidad es destino (pestaña «Revisión»).

### 1.2 Qué NO puede hacer
- Abrir el informe de la unidad si no existe: quien no gestiona ve «Planeación todavía no abre el informe <año> de <unidad>.» (`MiInforme.tsx:121`). La interfaz solo ofrece «Abrir el informe» a quien gestiona (`puedeAbrir={o.planeacion}`, `:111`).
- Ver el Tablero, el Consolidador, la Capacitación de Pilo o las Estructuras (redirige a Mi informe).
- Aprobar (no es necesario: enviar ya aprueba) ni cambiar la plantilla/estructura/requisitos.
- Editar tras el envío: con el informe `sent`/`ok` todo queda en lectura y los botones de edición desaparecen o se bloquean. Solo Planeación o la unidad destino lo devuelven (`0281`: «El informe ya se envió: solo Planeación o su unidad destino lo pueden devolver»).
- Escribir el informe de otra unidad aunque tenga acceso de lectura (la URL con `?unidad=` ajeno: «Esa unidad no está entre las suyas. Abra el informe de la unidad donde trabaja.», `MiInforme.tsx:84`).
- Editar una sección marcada «Solo lectura» por Planeación (la ve, cuenta como lista) (`MiInforme.tsx:310`, `validacion.ts:48`).
- Editar si el ciclo no está «Abierto»: la base lo rechaza (la pantalla no lo avisa; ver §6).

---

## 2. Recorrido paso a paso (orden real de la interfaz)

### Paso 1 · Entrar
- Ruta: `/admin/informes-gestion` → como no gestiona, abre directamente **Mi informe** (`InformesAdmin.tsx:76`). Menú: «Informes Institucionales» → «Informes de gestión». También `/admin/informes-gestion/mi-informe` y la tarjeta «Mi informe» del lanzador («Secciones, cifras vivas, evidencias y envío»).
- Pestañas que ve: «Mi informe», «Vista del informe», «Guía con Pilo» (y «Revisión» solo si es destino). Título: «Mi informe» · «Las cifras de UDES en Cifras y del Plan de Desarrollo ya cargadas; usted escribe lo que solo su unidad puede decir». Kicker «Informes Institucionales · <año>».
- Banner de bienvenida: «¿Primera vez aquí? Pilo le explica el informe paso a paso, con texto y voz. También puede pulsar el ? de cualquier zona.» con «Empezar la guía» y «Ahora no» (se recuerda en el navegador) (`guia/BannerGuia.tsx`).
- Mensajes de entrada posibles: «Cargando su informe…»; «Su usuario no tiene ninguna unidad asignada en «Dónde trabaja». Pida a Planeación que se la asigne, con su sede, o que su rol le dé el informe de una.»; «Planeación todavía no abre el ciclo del informe de gestión.»; «Planeación todavía no abre el informe <año> de <unidad>.» (`MiInforme.tsx:83-96, 121`; `InformesAdmin.tsx:162`).

### Paso 2 · Leer el riel izquierdo (`data-guia="estado"`, `MiInforme.tsx:339-429`)
En este orden:
1. Eyebrow «<Plantilla A> · <Decanatura>» y nombre de la unidad con «?».
2. «Informe <año> · su papel: Gestor».
3. Pastilla de estado («◐ Borrador») y «N de M listas»; barra «Secciones listas».
4. Aviso «Las cifras siguen en vivo hasta que envíe.» (o «Las cifras quedaron congeladas al enviar.»).
5. Enlaces «Vista del informe en papel» y «Libro de Excel».
6. Si está devuelto: cuadro «Planeación lo devolvió» + nota general.
7. Lista «Secciones del informe»: botones con número, título y punto de avance (`Sin empezar` / `En curso` / `Lista`); la activa lleva `aria-current`.
8. Zona de envío: botón «Enviar» + razones pendientes (§4).
- El guardado es automático: 800 ms después de escribir (`MiInforme.tsx:232`); leyenda «Guardando…», «Cambios guardados» o «No se guardó: <motivo>». Al salir de la pantalla lo pendiente se guarda. En pantallas angostas las secciones son una tira horizontal (`responsivo.css`).

### Paso 3 · Abrir una sección y leer su cabecera
- Ruta: `/admin/informes-gestion/mi-informe?s=<n>` (n = posición, base 1). Cabecera: «Sección N de M», título, pastilla de avance (no en Anexos), línea de ayuda por tipo (`AYUDA_TIPO`, ver `articulacion.md` §2) y, si el informe está devuelto, el cuadro «Planeación pide en esta sección» con la nota de esa sección (`MiInforme.tsx:447-452`).
- Panel derecho «Controles» (qué falta) y «Datos que puede consultar» con enlaces «Abrir UDES en Cifras» (`/datos-abiertos`), «Abrir el portal de implementación» (`/implementacion`), «Preguntar a Pilo» (`/pregunta`), todos en pestaña nueva.

### Paso 4 · Diligenciar cada tipo de sección (en el orden en que aparecen en la plantilla)

**4.1 Resumen ejecutivo / Conclusiones / Presentación / Introducción (tipo texto)**: etiqueta «Aporte» + extensión; campo con contador «N palabras · mínimo M»; «Insertar una cifra viva…» + «Insertar»; «Así se leerá, con las cifras vivas»; en las secciones con borrador, botón «Pilo redacta un borrador» (`PiloRedacta`, `MiInforme.tsx:966-995`). Pide confirmación si ya hay texto: «El borrador de Pilo reemplaza el texto de esta sección. ¿Continuar?». Tras usarlo: insignia «Borrador de Pilo · confirme cada cifra». Controles: ver §5.

**4.2 Alineación estratégica (`pdi`)**: etiqueta «Plan de Desarrollo · elija un pilar y redacte el aporte de su unidad, con sus acciones, tablas y gráficas». Columna izquierda «Pilares del Plan de Desarrollo» con resumen «N de M pilares con aporte» y por pilar estado «Sin aporte», «Por redactar», «Aporte corto», «Con aporte» (`alineacion.ts:61-65`). Detalle: «Pilar N», nombre, «Avance del pilar en el Plan: N %». Botón «Redactar aporte a este pilar» (si aún no aporta: «La oficina aún no aporta a este pilar en este informe.»), «Quitar este aporte». Dentro: «Conectado a este pilar en el sistema» (indicadores de Impacto y acciones del Plan de Trabajo), «Resultados y acciones conectados con este pilar» (las cifras/acciones de Resultados con ese pilar), «Pilo: redactar el aporte con estos resultados» / «Pilo: reescribir el aporte…» / «Pilo está redactando…», cuadro de texto («Cuente qué aporta su oficina a este pilar y con qué resultados…»), «Acciones articuladas con este pilar» («Aún no hay acciones. Agregue una para describirla y apoyarla con tablas o gráficas.»), «+ Agregar una acción» (campos «Nombre corto de la acción», «Qué se hizo y qué resultó»; «Subir», «Bajar», «Quitar acción»; bloques de texto/tabla de Excel/UDrive). Si el informe tiene contenido anterior (`pilares` + `texto`): «Texto anterior de la sección» con «Copiar al aporte de este pilar» y «Quitar texto anterior». Lista cuando hay ≥1 pilar con aporte ≥10 palabras y ninguna acción sin título (`alineacion.ts:75-85`).

**4.3 Objetivos y metas (`metas`)** (`MiInforme.tsx:721-782`):
- Facultades: bloque «Plan de Trabajo 2026 · sincronizado con el plan; importe el seguimiento (JSON o PDF) o edítelo a mano» (o «plan propio de la unidad: se importa o se escribe aquí y se corrige fila por fila»). Botones: «Importar JSON o PDF» («Leyendo el archivo…»), «Editar a mano lo sincronizado», «Escribir el plan a mano», «Volver a la sincronización» (confirma «Se descarta el plan propio de esta sección y vuelve la sincronización. ¿Continuar?»), «Descartar». Vista previa «Vista previa · N acciones y M actividades» → «Usar este plan» / «Descartar» (si ya hay acciones: «Reemplaza las N acciones que ya tiene esta sección. ¿Continuar?»). Errores: «Elija un archivo .json o .pdf del seguimiento del Plan de Trabajo.», «No se pudo abrir el PDF: …», «No se pudo leer el archivo». Sin acciones: «Esta unidad aún no tiene plan de trabajo. Importe el seguimiento (JSON o PDF) o escríbalo a mano.» / «Esta facultad todavía no tiene acciones en el Plan de Trabajo 2026.» Cada acción lleva observaciones con «¿Cómo va esta acción, qué la frena y qué sigue?» y botón de Pilo.
- Programas/facultades con indicadores de Impacto: tabla «Objetivo (indicador del programa)» con Resultado y columna «Análisis» (placeholder «Qué explica este resultado»); etiqueta «Foto tomada al enviar» o «En vivo hasta que envíe»; si aún no hay: «Todavía no hay indicadores del programa para traer aquí. Se seleccionan en Impacto → Elegir indicadores; cuando el programa los elija, sus metas aparecerán solas. Mientras tanto puede añadir metas adicionales abajo.» (enlace a `/admin/impacto/elegir`).
- «Meta adicional» (o «El resultado se calcula solo. Nada de tablas pegadas desde Excel.»): «Descargar plantilla», «Importar Excel», «Bajar lo escrito» (`objetivos-y-metas-anuales`) y tabla «Meta», «Programado», «Alcanzado», «Resultado» con «Añadir meta»; el botón de quitar es «✕» (nombre accesible «Quitar meta»). Ayudas del Excel: «Una fila por objetivo o meta anual de la unidad.» «Programado y Alcanzado: solo números (puede usar coma decimal). El resultado (Superada, Cumplida o Parcial) lo calcula el informe.» «Alcanzado puede quedar vacío si el año aún no termina.» (`excel-secciones.ts:28-32`).

**4.4 Resultados (`dim`)** (`MiInforme.tsx:783-856`, `ResultadosManuales.tsx`):
1. Aviso, si ya hay objetivos y metas: «Esta unidad ya tiene objetivos y metas: no hace falta elegir criterios. Los avances del plan de trabajo por dimensión aparecen más abajo como sugeridos.»
2. «¿A qué criterios reporta su oficina?» (opcional): «Es opcional: marque solo los que aplican. Cada criterio marcado abre su formulario de indicadores y acciones; los demás no le exigen nada.» Cada criterio: «Lo pide Planeación», «Ya tiene N registro(s); quítelos para dejar de reportar», «Reporta», «Criterio propio», «Aprobado por Planeación». Sin criterios: «Aún no hay criterios marcados — Marque arriba los criterios a los que su oficina reporta para abrir su formulario. Si no reporta a ninguno, puede dejar esta parte vacía y seguir con los aportes.»
3. «Un criterio propio para su informe» (placeholder «Ej.: Bienestar y permanencia estudiantil», «Crear criterio», mínimo 3 letras; «Ya existe un criterio con ese nombre.»). Nota: «Lo usa ya en este informe. Si le sirve a otras unidades, sugiéralo a Planeación y se aprueba para el siguiente ciclo.» y enlace «Sugerir a Planeación para próximos ciclos» → «Sugerido a Planeación» / ««x» quedó sugerido a Planeación.»
4. Excel de resultados: «Importar Excel», «Descargar plantilla», «Bajar lo escrito» (ver `articulacion.md` §6.3). Vista previa «Vista previa · N indicadores de <archivo>» con «Añadir a lo que ya hay», «Reemplazar todo» («Reemplaza los N indicadores escritos. ¿Continuar?»), «Descartar».
5. «Lo que pide Planeación» (si Planeación configuró datos): tabla Dato · Unidad · Mejor · Anterior · Actual · Meta · Estado, con «Fuente propia de la unidad» y «Justificación (obligatoria)».
6. Por criterio marcado: tabla de cifras (Indicador, Unidad (Conteo/%/pp/$), Mejor (Más/Menos), Anterior, Actual, Meta, Estado, «Detalle», «Quitar»), con frase de lectura («Cumplió la meta (100 %)», «Superó la meta…», «Alcanzó N % de la meta (Parcial) y mejoró N % frente al periodo anterior…», «Sin meta ni dato anterior con qué comparar.», «Falta la cifra actual.»), selector «Se conecta con el pilar del PDI» («Ninguno (no se conecta)»), «Evidencias (anexos) que respaldan esto» y, en «Detalle», «Fuente» («(obligatoria)» si Planeación la exige) y «Nota de la unidad» («¿Qué explica el movimiento de esta cifra?»). Acciones: ficha «Acción» («Completa» / «Incompleta») con «Nombre de la acción», «Descripción de la acción», «Qué se ha hecho con la acción», «Cuándo se plantea su finalización» (ej. «junio de 2027»), «Proyecciones (texto)», «Proyecciones (número)», «Unidad». Botones «+ Añadir cifra» y «+ Añadir acción». Si falta algo: «Falta el nombre, la cifra actual, la meta, la fuente.» / «Falta la descripción de la acción y qué se ha hecho con la acción.»
7. «Conectar indicadores de UDES en Cifras o del PDI (opcional)» (`<details>`): tarjetas por dimensión con «+ Agregar indicador» (buscador «Busque un indicador: matrícula, deserción, grupos…», selector de informe de UDES en Cifras, «Toda la UDES», «Cerrar»), «N cifra(s) sugerida(s) sin conectar» con «Conectar a un indicador», vista «Tabla»/«Gráfica», y «Añadir un dato propio (sin UDES en Cifras)» con tope «N de M datos propios que permite Planeación». Cada tarjeta de cifra: «Lo pide Planeación» + línea «Explique este resultado en una línea», «Incluir», «Cambiar fuente», «Cambió desde que lo revisó: X → Y — Aceptar».
8. «Lo que ya cargó el sistema · sugerido» (dimensiones del plan, indicadores de Impacto): botones de llevar al análisis. «Avance del Plan de Trabajo por dimensión · sugerido» (facultades). En secciones que consolidan: «Aportes aprobados de las unidades» («Los aportes aprobados de las unidades que le entregan llegarán aquí con el Consolidador (próxima fase).»).
9. Texto de cierre: «Análisis de <título>» (o «Análisis de la rectoría») con «Escriba su lectura de estos resultados…» y «Pilo mejora el texto» / «Pilo redacta un borrador».

**4.5 Síntesis (`matriz`)**: «Se arma sola con Objetivos y metas y con Resultados por dimensión. Sus cifras se pueden citar en el texto («Insertar una cifra viva»).» + «Matriz de indicadores con las cifras incluidas» + «Comentario de media página (mínimo 10 palabras)» con el campo «Comentario de la matriz» (placeholder «¿Qué explica los semáforos amarillos y rojos?»). Panel: «Todavía no hay datos. Esta síntesis se arma sola cuando se reporten las acciones en Objetivos y metas y los indicadores en Resultados por dimensión.» (`Sintesis.tsx:34`). Matriz: tabla Indicador · … · Actual · Cumplimiento · Fuente; «No hay cifras incluidas en el informe.»

**4.6 Puntos críticos y acciones de mejora / Análisis de retos y oportunidades (`filas`)**: «Una fila por punto. Se recomienda con acción y fecha.» Excel «Descargar plantilla», «Importar Excel», «Bajar lo escrito», tabla editable con «Añadir fila»; para quitar una fila el botón visible es «✕» (nombre accesible «Quitar fila»). Columnas: A → Dimensión, Punto crítico, Acción, Tiempo, Recursos; B/C → Reto, Aprendizaje, Oportunidad, Propuesta. En la plantilla A la primera columna es una lista con los criterios base. Fechas ISO se pasan a dd/mm/aaaa; máx. 500 filas.

**4.7 Logros (`logros`)**: «N logro(s) · todos los que haya, cada uno con su evidencia y, si quiere, tablas de UDrive». Excel «logros» (Logro, Contexto y resultado, N.º de anexo; ayudas: «Un logro por fila, todos los que haya: no hay tope. Son los innovadores o excepcionales del año, no la actividad ordinaria.»). Lista: «Logro», «Contexto y resultado», «Evidencia…» (elige un anexo), «Subir», «Bajar», «Quitar logro», «Añadir logro»; «Cargue primero los archivos en «Evidencias» para enlazarlos a cada logro.» Bloque «Logros que propone el sistema» (actividades del Plan de Trabajo ya cumplidas).

**4.8 Evidencias y fuentes de verificación (`evid`)** — OBLIGATORIA:
- Zona «Suelte archivos o haga clic» («PDF, Word, Excel o imagen · hasta 15 MB»), «Subiendo…», varios archivos a la vez; error «No se suben (pesan más de 15 MB): <archivos>» / ««x» pesa más de 15 MB.» / «No se pudo subir «x»: …».
- Enlace: campo «https://… (documento en línea)» + «Nombre del documento» + «Añadir enlace»; error «Escriba una dirección completa que empiece por https://».
- Tabla «N.º · Archivo o enlace · Fecha» con «Abrir» (URL firmada 10 min; «No se pudo abrir el anexo.»), «Editar» (formulario «Nombre en el informe», «Dirección del enlace» o «Cambiar el archivo (opcional, máx. 15 MB)», «Descripción (opcional)» «Qué demuestra este anexo», «Guardar cambios»/«Cancelar»; conserva el número del anexo) y «Quitar». Vacía: «Aún no hay archivos ni enlaces.»
- «Evidencias de actividades e indicadores»: «Enlaces que la unidad ya cargó en el Plan de Trabajo y en Impacto. Al anexarlos, quedan numerados y se pueden citar en los logros.» con «Añadir las N como anexos» / «Ya es anexo».
- La sección queda «Lista» con ≥1 anexo; sin anexos el envío se bloquea (§4 de validaciones).

**4.9 Anexos**: tabla numerada de solo lectura («Lista numerada con los archivos y enlaces cargados»).

**4.10 Secciones libres** (creadas por Planeación): «+ Agregar texto», «+ Agregar una tabla de Excel» (pegar desde Excel, subir .xlsx/.csv, rango opcional «B2:F30», máx. 200 filas × 20 columnas; título y nota editables; «Reemplazar pegando o subiendo otra»; «Quitar columna», «Quitar fila»), «+ Agregar tablas o gráficas de UDrive»; «Subir bloque», «Quitar bloque» (confirma «Este bloque tiene contenido y se borrará. ¿Continuar?»); «Esta sección aún no tiene bloques. Agregue texto, una tabla de Excel o tablas y gráficas de UDrive.» Errores: «No hay nada que convertir. Copie las celdas en Excel y péguelas aquí.», «Los .xls antiguos no se pueden leer aquí. Ábralo en Excel y guárdelo como .xlsx o .csv.», «El rango no se entiende. Escriba algo como B2:F30, o déjelo vacío para toda la hoja.», «El archivo o el rango no tienen datos.»

**4.11 Tablas y gráficas de UDrive** (en casi todas las secciones): «Tablas y gráficas de UDrive · se actualizan mientras el informe está en borrador»; buscador «Busque en su UDrive una tabla o una gráfica»; «Leyendo su UDrive…»; «No hay tablas ni gráficas que mostrar. Créelas en UDrive y vuelva.»; campos «Título en el informe (vacío: el de UDrive)» y «Nota o fuente (vacío: la de UDrive)». Si falla: «No se pudo leer la tabla de UDrive: ya no existe, está en la papelera o no tiene permiso para verla.» (`ElementosDrive.tsx`).

### Paso 5 · Revisar los «Controles» de la sección y completar todas las secciones
Ver §5. La sección pasa a «Lista» sola cuando no queda nada ámbar; «Lista» se sincroniza con la base aunque la persona no escriba (`MiInforme.tsx:283-297`).

### Paso 6 · Libro de Excel (opcional, para recoger datos de equipos)
Ver `articulacion.md` §6. Para el Gestor: pestaña «1 · Exportar» («Un libro completo» o «Un libro por equipo»), compartir, y «2 · Importar» → «Aplicar al informe». El campo «Quién aporta este libro» deja constancia en el aviso y en las evidencias nuevas.

### Paso 7 · Vista del informe, personalización y PDF
Ver `articulacion.md` §7. Exclusivo del Gestor (frente al Contribuyente): puede guardar el color de acento, monograma, escudo, contacto y pie («Estos datos son de la unidad y valen para todos sus informes.»).

### Paso 8 · Enviar (`MiInforme.tsx:388-428`, `data-guia="enviar"`)
- Botón «Enviar» (deshabilitado mientras haya razones; «Enviando…» al pulsar). Debajo, una lista con lo pendiente o «Todo listo. Al enviar, el informe queda aprobado, con la foto de las cifras, y se bloquea.»
- Al pulsar: se guarda lo pendiente (`enviarInforme`, `:327-334`), se llama `informe_enviar` (draft/back → sent → ok en una transacción, `0281:226-266`) y se limpia la nota de devolución (`nota_revision = ''`). El servidor toma la foto de las cifras; se escribe una fila en `informe_revisiones` («Aprobado automáticamente al enviar»).
- Luego Pilo aprende del informe (`useEnviar`, `datos.ts:629-641`). Si falla: «El informe quedó enviado y aprobado. Pilo no pudo aprender de él esta vez: <motivo>».
- Después de enviar: botón «Enviado» deshabilitado y «Enviado y aprobado el <fecha>. Queda congelado; Planeación o su destino pueden devolverlo para modificaciones.» (`:395-397`); estado «● Aprobado». (Para informes `sent` antiguos: «Enviado el <fecha>.»)
- Errores bajo el botón (rojo, `role="alert"`): los de la base (§4).

### Paso 9 · Si lo devuelven
- Quién devuelve: Planeación o la unidad destino, con nota obligatoria (`0281`).
- Qué ve el Gestor: estado «↺ Devuelto»; cuadro «Planeación lo devolvió» con la nota general (el texto dice «Planeación» aunque lo haya devuelto la unidad destino, `MiInforme.tsx:372`); en cada sección «Planeación pide en esta sección» con la nota por sección; las cifras vuelven a ser vivas y vuelve a poder editar.
- Al guardar cualquier sección o cifra el informe pasa a «Borrador» (`informe_reabrir_si_devuelto`, `0192:~275`; `README.md:77`). Luego «Enviar» de nuevo.
- La guía de Pilo tiene pasos de demostración «Si lo devuelven» y «Cuando se envía» que solo pintan etiquetas; el aviso en pantalla es «Demostración de la guía: su informe no cambió.» (`MiInforme.tsx:365-369`).

### Paso 10 · Informes que le llegan (solo si su unidad es destino)
- Pestaña «Revisión» (`/revision`): ve únicamente los informes con destino en su unidad (`Revision.tsx:72`). Puede leerlos, crear presentaciones y devolverlos con nota (botón «Devolver con nota» o «Reabrir y devolver con nota»); no puede aprobar. Ver `administrador.md` §2 Paso 9 para la pantalla completa.

---

## 3. Estados del informe y qué ve el Gestor

| Estado | Pastilla | Qué puede hacer el Gestor |
|---|---|---|
| Sin abrir | — | Nada: ve «Planeación todavía no abre el informe <año> de <unidad>.» |
| `draft` Borrador | «◐ Borrador» | Editar todo, enviar si está todo lista. Cifras vivas |
| `back` Devuelto | «↺ Devuelto» | Editar (al guardar vuelve a Borrador), ver notas, enviar de nuevo. Cifras vivas |
| `sent` Enviado (solo antiguos) | «◉ Enviado» | Solo leer; «Enviado el <fecha>.» |
| `ok` Aprobado | «● Aprobado» | Solo leer. «Enviado y aprobado el <fecha>. Queda congelado…». Cifras en foto. Libro de Excel: importar bloqueado con «El informe ya se envió: no admite cambios. Pida que lo devuelvan para modificaciones.» |

---

## 4. Validaciones que bloquean el envío (texto exacto)

Bajo el botón «Enviar» (`estados.ts:45-53`):
1. «Solo el Gestor de la unidad o Planeación envían el informe.» (no aplica al Gestor salvo que esté en solo lectura)
2. «Se habilita cuando las N secciones estén listas (van K).»
3. «Faltan las evidencias y fuentes de verificación: cargue al menos un archivo o enlace. Es obligatorio en todo informe.»
4. «Ya se envió.» / «Ya se envió y quedó aprobado.»

Al pulsar, errores de la base (`0279:499-566`, `0153:928`, `0281`):
- «El ciclo no está abierto: no se puede enviar»
- «El informe no tiene secciones»
- «Faltan secciones por terminar: <claves>»
- «Faltan las evidencias y fuentes de verificación: cargue al menos un archivo o enlace antes de enviar»
- «Falta el nombre de la fuente en: <claves>»
- «Falta el pilar del PDI en: <claves>»
- «Falta justificar (y dejar incluidas) las cifras: <claves>»
- «Solo se envía un informe en borrador o devuelto»
- «Sin permiso para enviar este informe»

Qué hace que una sección NO esté «Lista» (la causa de «van K de N»): ver la columna «Cuándo queda Lista» de `articulacion.md` §2. Resumen: texto sin llegar al mínimo de palabras; alineación sin aportes de 10 palabras; metas sin «meta» o «alcanzado»; Resultados con cifras «Justificar» sin justificar, indicadores sin nombre/cifra actual, acciones sin descripción o «qué se ha hecho», datos de Planeación sin cifra/meta/justificación (≥10 caracteres); síntesis con <10 palabras; filas sin ninguna fila completa; logros sin título y resultado; evidencias sin anexos.

---

## 5. Los «Controles» (mensajes exactos de la barra derecha, `validacion.ts:94-153`, `tokens.ts:91-108`)

- Solo lectura: «Sección definida por Planeación: solo lectura» · «Cuenta como lista».
- Resultados: «N indicador(es) sin nombre o sin cifra actual» / «N indicador(es) escrito(s) con su estado calculado»; «N acción(es) sin descripción o sin lo que se ha hecho» / «N acción(es) descrita(s)»; «N dato(s) que pide Planeación sin cifra actual, meta o justificación» / «Los N datos que pide Planeación están respondidos»; «N cifra(s) que pide Planeación aún sin justificación» / «Todas las cifras pedidas están justificadas»; «N cifra(s) con fuente propia sin nombre de fuente» / «Cada cifra tiene su fuente».
- Textos (narr, dim, matriz): «Extensión adecuada (N palabras)» / «Faltan N palabras para el mínimo»; «El texto parece un ejemplo de la plantilla. Reemplácelo.» / «Sin frases de ejemplo de la plantilla»; «Hay N cifra(s) escrita(s) a mano. Use «Insertar una cifra viva» para que sigan a su fuente.» / «Las cifras del texto están enlazadas a su fuente»; «Cifras que no existen en este informe: [[x]]».
- Alineación: «Contenido de la versión anterior: redacte el aporte a cada pilar marcado»; «Aún no hay pilares con aporte»; «Pilar N sin aporte»; «Pilar N: el aporte tiene K palabra(s) (mínimo 10)»; «Pilar N: una acción sin título» / «K acciones sin título»; «N pilar(es) con aporte»; «N acción(es) articulada(s)».
- Sección libre: «Aún no hay texto, tablas ni gráficas».
- Metas: «N meta(s) viene(n) de los indicadores del programa»; «N acción(es) viene(n) del Plan de Trabajo»; «Resultado calculado a partir de programado y alcanzado» / «Aún no hay metas».
- Logros: «N logro(s) sin evidencia».
- Siempre al final: «Cifras en vivo hasta que envíe[. Corte de referencia: <fecha>]» o «Cifras congeladas al enviar: el informe ya no cambia».
- Iconos: ✓ (bien) y ! (revisar); cada línea lleva texto oculto «Bien:» / «Revisar:».

---

## 6. Errores comunes y cómo se resuelven

| Situación | Causa | Resolución |
|---|---|---|
| «Enviar» deshabilitado con «Se habilita cuando las N secciones estén listas (van K).» | Hay secciones con punto «En curso» o «Sin empezar» | Abrir cada sección con punto no verde y leer «Controles» |
| «Faltan las evidencias y fuentes de verificación…» | Cero anexos | En «Evidencias y fuentes de verificación» subir un archivo (≤15 MB) o «Añadir enlace» (https) |
| «Falta justificar (y dejar incluidas) las cifras: matric, deser» | Cifras marcadas «Justificar» | En Resultados, escribir la justificación («Explique este resultado en una línea») y dejarlas incluidas; o pedir a Planeación que las pase a «No pedir» |
| «Falta el nombre de la fuente en: propio_s4_xxx» | Dato propio sin fuente | «Cambiar fuente» → «Nombre de la fuente» |
| «Esta sección ya tiene N datos propios: es el límite del ciclo» | Tope de datos propios | Quitar uno o pedir a Planeación que suba el tope |
| «No se guardó: El informe ya se envió (o no es suyo): solo Planeación lo puede cambiar» | Informe aprobado, o ciclo no abierto, o sin función de edición | Pedir devolución; verificar que el ciclo esté «Abierto» |
| «El informe ya se envió: no admite cambios. Pida que lo devuelvan para modificaciones.» (libro) | Informe aprobado | Que Planeación o el destino lo devuelva |
| «Este libro es del informe de «X», … y no corresponde a este informe.» | Importó el libro de otra unidad/ciclo/plantilla | Descargar el libro desde este informe |
| «Solo se leen libros .xlsx…» | Archivo .xls/.csv | Guardar como .xlsx |
| Texto con «[[matric]]» literal | Clave sin valor o inexistente | Usar «Insertar una cifra viva…» |
| Aviso ámbar «Hay N cifras escritas a mano» | Números tecleados en el texto | Reemplazar por cifras vivas (los años no cuentan) |
| «El texto parece un ejemplo de la plantilla» | Quedó `[algo entre corchetes]`, «ejemplo:», etc. | Reemplazar el texto de plantilla |
| Pilo no responde («No se pudo llegar a la función pilo-informes: ¿está desplegada?») | Función apagada | Reintentar o avisar a Planeación |
| «Pilo Astra 1.0 se enciende en la administración.» (presentación) | Astra apagado | Avisar a administración |
| PDF con «Cifras en vivo» | Informe en borrador | Normal; se congela al enviar |
| Cierre/portada no deja guardar | Falta de permiso o informe enviado | «Usted puede ver la portada, pero no cambiarla: el informe está enviado o su papel solo permite consultar.» |
| Imagen de portada rechazada | Formato/tamaño | JPG, PNG o WebP; hasta 5 MB |
| Una sección «Solo lectura» no deja editar | La configuró Planeación | Pedir cambio a Planeación |
| El informe devuelto muestra la nota con «Planeación lo devolvió» | Texto fijo; pudo devolverlo la unidad destino | Leer igual la nota |

---

## 7. Rutas y parámetros de las pantallas del Gestor

| Pantalla | Ruta | Parámetros |
|---|---|---|
| Mi informe | `/admin/informes-gestion/mi-informe` | `?unidad=<id>` (solo las suyas), `?s=<n>`, `?anio=<n>` |
| Vista del informe | `/admin/informes-gestion/vista` | `?unidad=<id>`, `?anio=<n>` |
| Revisión (si es destino) | `/admin/informes-gestion/revision` | `?informe=<id>` |
| Guía con Pilo | pestaña dentro de Mi informe | — (estado en el navegador `informes:guia:*`) |
| Tarjeta del lanzador | «Informes» → «El informe» → «Mi informe» | — |

---

## 8. Cosas que vale la pena mostrar en captura (Gestor)

1. Mi informe completo: riel (pastilla, «N de M listas», barra, enlaces, lista de secciones con puntos, botón «Enviar» con razones), sección al centro, «Controles» y «Datos que puede consultar» a la derecha.
2. El banner «¿Primera vez aquí?» y la tarjeta flotante «Guía con Pilo».
3. Una sección de texto con «Insertar una cifra viva…» y el cuadro «Así se leerá».
4. El aviso ámbar «Hay N cifras escritas a mano».
5. Alineación estratégica con un pilar y su aporte, «Resultados y acciones conectados con este pilar» y «Pilo: redactar el aporte con estos resultados».
6. Objetivos y metas de una facultad con «Importar JSON o PDF» y la vista previa «Usar este plan».
7. Resultados: selector «¿A qué criterios reporta su oficina?», una tabla de cifras con estado «Parcial», una ficha de acción «Incompleta», «Lo que pide Planeación».
8. Evidencias: zona de arrastre, enlace y tabla de anexos con «Abrir | Editar | Quitar».
9. Botón «Enviar» deshabilitado con la lista de razones; luego «Todo listo…»; luego «Enviado» con «Enviado y aprobado el …».
10. Un informe devuelto: «Planeación lo devolvió» + «Planeación pide en esta sección».
11. Vista del informe: barra «Carta | A4», «Personalizar portada», «Descargar PDF»; aviso «Las cifras están en vivo…»; portada con composición; editor de portada con acento y monograma (exclusivo del Gestor).
12. Cajón «Libro de Excel» en «1 · Exportar» (por equipo) y «2 · Importar» con clasificación y «Cómo aplicar».
13. Cajón «Crear presentación con Pilo».
