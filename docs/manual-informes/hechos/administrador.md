# Hoja de hechos · ADMINISTRADOR (Planeación: gestiona los informes)

Rutas relativas a `src/modules/informes/` salvo indicación. Cita: `archivo:línea`. «NO VERIFICADO» = deducido, no leído. En el manual se dice «campus»; los textos de pantalla que dicen «sede» están en `articulacion.md` sección 12.

Complemento: `articulacion.md` (plantillas, tipos de sección, cifras, Excel, PDF, presentación) y `gestor.md` / `contribuyente.md`.

---

## 1. Quién es «Administrador» en el código

- «Gestionar» = `puedeGestionarInformes` en la interfaz y `informe_gestiona()` en la base, la misma regla (`README.md:172-176`; `supabase/migrations/0192:1-60`):
  - la administración general siempre gestiona;
  - Planeación SIN rol de acceso gestiona;
  - Planeación CON rol de acceso gestiona solo si el rol marca la pantalla «informes» y lleva `informe_gestion = true`, que se escribe cuando en la matriz del rol el nivel del módulo «Informes de gestión» es **Editar** (`admin/usuarios/RolesView.tsx:748-752`: «Con «Editar» el rol ve y gestiona los informes de todas las unidades, por eso no se eligen unidades aquí. Para dar solo el informe de una o varias unidades, deje «Ver».»). «Ver» no gestiona.
  - Roles personalizados que gestionaban por capacidad perdieron la gestión con 0192 hasta que alguien marque «Editar» en «Informes de gestión» y guarde el rol (`0192:55-64`).
- Qué ve quien gestiona en la barra: pestañas «Tablero del ciclo», «Mi informe», «Revisión», «Consolidador», «Capacitación de Pilo», «Estructuras», «Vista del informe» (`InformesAdmin.tsx:88-125`). Abre `/admin/informes-gestion` y llega al Tablero (`:76`).
- Quien NO gestiona y entra a `/tablero`, `/revision` (sin ser destino), `/consolidador`, `/capacitacion` o `/estructuras` es redirigido a Mi informe (`:83-84`), y aunque se montaran, las pantallas muestran «El tablero del ciclo es de quien gestiona los informes.» (`Tablero.tsx:51`), «Las estructuras de informe son de quien gestiona los informes.» (`Estructuras.tsx:52`), «La capacitación de Pilo es de quien gestiona los informes.» (`Capacitacion.tsx:40`).
- Llamar «Administrador» al papel en el manual es una convención del equipo: en pantalla el papel de este perfil se llama «Planeación» (`rankings/reporte/envio.ts:37-50`, `nombreRol`).

### 1.1 Qué puede hacer (código)
1. Crear/editar el ciclo del año, abrirlo, cerrarlo, preparar el siguiente (`Tablero.tsx:81-189`).
2. Ver el avance de todas las unidades, filtrar, abrir informes (uno a uno o «Abrir los N que faltan»), elegir plantilla por unidad (`Tablero.tsx:356-724`).
3. Configurar por plantilla y ciclo la estructura (secciones activas, orden, títulos, solo lectura, secciones libres) (`EstructuraConfig.tsx`).
4. Fijar qué cifras se justifican (14 automáticas) y los «datos que pide cada tipo de unidad» (`Tablero.tsx:193-279`, `RequisitosConfig.tsx`).
5. Fijar datos propios por sección, exigir fuente y pilar (`Tablero.tsx:283-322`).
6. Crear/aprobar/rechazar/archivar criterios de Resultados (`CriteriosAdmin.tsx`).
7. Asignar responsables (Gestor/Contribuyente/Consulta) a cada unidad (`Responsables.tsx`).
8. Crear estructuras propias X1… y decidir qué oficinas usan cada plantilla (`Estructuras.tsx`).
9. Leer cualquier informe (Mi informe → «Ver el informe de…» y Revisión) y devolverlo con nota (`Revision.tsx`).
10. Capacitar a Pilo con informes en Word/PDF y ver lo aprendido (`Capacitacion.tsx`).
11. Ver el informe en papel de cualquier unidad, descargar PDF, crear presentaciones con Pilo, descargar el libro de Excel de cualquier informe (exportar).

### 1.2 Qué NO puede hacer (desde la pantalla)
- **Escribir el informe de una unidad a la que no pertenece.** En Mi informe, quien gestiona y no tiene función en esa unidad ve el informe en solo lectura: encabezado «Informe <año> · Administración: solo lectura» (`MiInforme.tsx:348`), y el papel se trata como Consulta (`ui/objetivo.tsx:104-106, 119`: `soloVer = planeacion && !miRol`; `actor: soloVer ? "visor" : …`). Descripción de la regla en `TodosLosInformes.tsx:66`: «Administración ve los N informes del ciclo, solo para leerlos. Escribe quien trabaja en la unidad; Al enviar, el informe queda aprobado; Planeación lo puede devolver en Revisión.» (la restricción es de la pantalla; `README.md:54`: la base seguiría permitiendo escribir a Planeación).
- **Cambiar el papel de portada/cierre desde la Vista** de una unidad ajena: `puedeDiseno = actor === "planeacion" || puedeEditar(...)` (`VistaInforme.tsx:87`) pero el `actor` que llega es «visor», así que los editores se abren en modo «Usted puede ver la portada, pero no cambiarla…» (`EditorPortada.tsx:200`). NO VERIFICADO en ejecución; deducido de `objetivo.tsx:119`.
- **Escribir una sección «Solo lectura»**. El README dice que quien gestiona sí puede escribirla desde el informe (`README.md:213`), pero en Mi informe `editableSec = editable && (!def.soloLectura || actor === "planeacion")` (`MiInforme.tsx:310`) y el `actor` nunca vale `"planeacion"` (siempre es el papel de pertenencia o `"visor"`, `objetivo.tsx:119`). Es decir, en la interfaz actual nadie escribe una sección de solo lectura (ni siquiera por el libro de Excel salvo `rol === "planeacion"`, `libro-informe.ts:1065`). Inconsistencia código/README: el manual no debe prometer que Planeación edita desde Mi informe. NO VERIFICADO si existe otra vía.
- **Enviar el informe de una unidad ajena** (mismo motivo: botón «Enviar» deshabilitado con «Solo el Gestor de la unidad o Planeación envían el informe.»).
- **Consolidar**: la pestaña «Consolidador» solo muestra «El consolidador llega en la próxima fase» (`InformesAdmin.tsx:130-139`). Sin función.
- **Word**: no existe (ver `articulacion.md` §8).
- **Aprobar** manualmente casi nunca: enviar ya aprueba (0281). El botón «Aprobar» solo aparece en informes en estado `sent` anteriores a 0281 (`Revision.tsx:219-223`).

---

## 2. Recorrido paso a paso (orden real de la interfaz)

### Paso 0 · Preparación fuera del módulo
1. Cada persona que escribe debe tener «Dónde trabaja» (pertenencia a una unidad con papel `jefe`/`editor`/`visor`) o un rol cuya matriz diga, en «Informes de gestión» nivel «Ver», «Quién hace el informe»: «Solo el de su unidad», «Diligencia» (Contribuyente) o «Diligencia y envía» (Gestor), con «Toda la estructura» o unidades elegidas por «Modelo A/B/C/D» (`RolesView.tsx:240-340`). Si se elige Diligencia/Envío sin alcance, el rol no se guarda: «En Informes de gestión, el papel de Diligencia o Envío pide un alcance: elija al menos una unidad, o marque «Toda la estructura». Si solo debe escribir el informe de la unidad a la que pertenece, deje el papel en «Solo el de su unidad».» (`RolesView.tsx:476-480`).
2. Un rol que no marque la pantalla «informes» cierra el módulo aunque la persona pertenezca a una unidad (`README.md:143, 178`).

### Paso 1 · Tablero del ciclo → tarjeta del ciclo (`Tablero.tsx:81-189`, `data-guia="t-head"`)
- Ruta: `/admin/informes-gestion` (o `?anio=2026`). Si no hay ciclo: texto «Abrir el ciclo del informe de gestión» y «Sin ciclo»; subtítulo «Un ciclo por año. Mientras esté en preparación, Planeación fija plantillas y requisitos; al abrirlo, las unidades empiezan a escribir.»
- Con ciclo: «Ciclo 2026» (eyebrow), título = nombre del ciclo; subtítulo «Fecha límite <fecha> · corte de las cifras <fecha>. Las unidades escriben mientras el ciclo esté abierto.» Si hay más de un ciclo, selector «Año».
- Campos: «Año» (bloqueado una vez creado), «Nombre» (por defecto «Informe de gestión <año>»), «Fecha límite», «Corte de las cifras», «Estado» con «En preparación», «Abierto», «Cerrado».
- Botones: «Crear el ciclo» / «Guardar el ciclo» («Guardando…»); «Preparar el ciclo siguiente» (crea año+1 «Informe de gestión <año+1>» en preparación, copia datos requeridos y estructura del ciclo actual y salta a ese año; `:164-180`).
- Qué significa cada estado (hechos de la base): en «En preparación» Planeación puede cambiar la estructura sin límite; solo con «Abierto» los Gestores/Contribuyentes pueden abrir su informe, guardar y enviar (`0192:221-238` `informe_instancia_abierta` exige `c.estado = 'abierto'` para quien no gestiona; `0276:72-89`; `0279:516`). Con ciclo «Cerrado» o «En preparación» una persona de la unidad que intente guardar recibe de la base «El informe ya se envió (o no es suyo): solo Planeación lo puede cambiar» (`0153:756`), mensaje engañoso: la causa es el estado del ciclo. La interfaz NO bloquea la edición por estado del ciclo (no hay `ciclo.estado` en Mi informe; grep sin resultados).
- Error posible: «Falta aplicar la migración 0153 (Informes Institucionales).» (`datos.ts:121`) y el aviso «Mientras tanto, esta pantalla no guarda nada. Cuando se aplique, recargue la página.» (`comunes.tsx:41-48`).

### Paso 2 · «La estructura de cada informe» (`EstructuraConfig.tsx`, columna izquierda del Tablero)
- Texto: «Elija qué secciones lleva cada plantilla en este ciclo. «Solo lectura» deja la sección como la dejó Planeación: la unidad la ve, no la cambia y cuenta como lista.» + «Puede renombrar, reordenar y agregar secciones libres.» (preparación) o «Con el ciclo abierto o cerrado solo se activan, desactivan o se cambia la edición.»
- Selector de plantilla (A · Decanatura, B · …, y las estructuras propias por su nombre).
- Por sección: número, campo título (placeholder = título de la plantilla; «Título de la sección N»; 120 caracteres; solo editable en preparación), tipo (Texto, Alineación con el PDI, Objetivos y metas, Resultados, Síntesis, Tabla de filas, Logros, Evidencias, Anexos, Libre), casilla «Activa», casilla «La unidad edita», «Mín.» (palabras mínimas, solo secciones libres, 0–2000), «Subir», «Bajar», «Eliminar» (solo libres).
- «Evidencias»: «Obligatoria en todo informe» y no se puede desactivar. No se puede desactivar la última activa.
- «+ Agregar una sección libre» (clave `x1`, `x2`… título inicial «Sección nueva»; solo preparación; «Solo con el ciclo en preparación.»).
- «Eliminar» una libre con contenido pide: ««<título>» ya tiene contenido en N informe(s). Si la elimina, ese contenido se borra. ¿Continuar?» (`:89`).
- «Restablecer a la plantilla» → confirmación (preparación: «Se borran los ajustes de <plantilla> en este ciclo: títulos, orden, activación, edición por la unidad y las secciones libres, junto con lo que las unidades hayan escrito en ellas. Las secciones vuelven a ser las de la plantilla.»; abierto/cerrado: «Con el ciclo abierto o cerrado no se borra nada: solo se reactivan las secciones desactivadas y se abren de nuevo a la unidad. Títulos, orden y secciones libres se quedan como están.») → «Sí, restablecer» / «Cancelar». Resultado: «Listo: se restablecieron N ajuste(s).» o «La plantilla ya estaba como la define Planeación; no hubo nada que cambiar.»
- Sin migración: «Falta aplicar la migración 0276. Mientras tanto los informes usan las plantillas tal como están.»
- Errores de la base: «Con el ciclo abierto o cerrado no se pueden borrar secciones», «Con el ciclo abierto o cerrado no se pueden agregar, renombrar ni reordenar secciones», «Con el ciclo abierto o cerrado solo se puede activar, desactivar o cambiar la edición de una sección» (`0276:72, 83, 89`).
- Efecto: sección inactiva no aparece, no cuenta en «N de M listas», no bloquea el envío; solo lectura: la unidad la ve y cuenta como lista (`README.md:212-214`).

### Paso 3 · «Qué datos debe justificar cada unidad» y «Los datos que pide cada tipo de unidad» (`Tablero.tsx:193-279`, `RequisitosConfig.tsx`)
- Detalle completo en `articulacion.md` §4.
- Secuencia recomendada por el código: elegir plantilla (A · Decanatura…); marcar «Justificar / Sugerido / No pedir» por cifra (se guarda al clic); en «Los datos que pide cada tipo de unidad» pulsar «+ Añadir dato», escribir «Nombre del indicador» (3–120), fuente, criterio, unidad, condición, y «Guardar los datos» («Configuración guardada.»). Avisos: «Hay cambios sin guardar.» / «Cada dato necesita un nombre de 3 a 120 caracteres.» / «La plantilla X aún no tiene datos propios. Añada el primero o copie los de otra plantilla.» / «Copiados N datos de la plantilla X. Revise y guarde.» / confirmación «Reemplaza los N datos de la plantilla X (se aplica al guardar). ¿Continuar?» / «La plantilla X no tiene datos configurados.».
- Excel: «Bajar Excel (las cuatro plantillas)» → `datos-requeridos.xlsx`; «Subir Excel» → mensaje «N datos añadidos desde <archivo>.» + hasta 3 avisos: «Fila N: plantilla «x» no es A, B, C ni D; se omitió.», «Fila N: el dato debe tener entre 3 y 120 caracteres; se omitió.», «Fila N: el criterio «x» no existe; quedó sin criterio.»; error «No se pudo leer el Excel: …».
- Botón «Pasar las 14 cifras automáticas a «No pedir»» con la nota: «UDES en Cifras y PDI no están alimentando datos, y el envío exige justificar las cifras marcadas «Justificar». Si la plantilla X va a reportar todo a mano, pase esas cifras a «No pedir».» Mensaje: «N cifras automáticas pasaron a «No pedir».» / «Las cifras automáticas ya estaban en «No pedir».»
- Sin migración 0253: «Falta aplicar la migración 0253. Mientras tanto no se puede guardar esta configuración.»
- Limitación observada: los datos que pide solo se leen para plantillas A–D (`requeridos-logica.ts:50, 151`).

### Paso 4 · «Los datos libres» (`Tablero.tsx:283-322`, columna derecha)
- «Datos propios por sección» con «−» y «+» (0–10; por defecto 3), «Exigir fuente en cada dato propio», «Exigir un pilar del PDI vinculado». Texto: «Cada unidad puede sumar sus propios datos sin salirse del plan de diseño.»

### Paso 5 · «Criterios de Resultados por dimensión» (`CriteriosAdmin.tsx`)
- Texto: «Los seis criterios base (Gestión académica, profesoral, calidad, investigación, extensión y financiera) siempre están. Aquí crea otros para todas las unidades y decide sobre los que ellas sugieren.» (nota: los seis base reales son Extensión, Internacionalización, Investigación, Enseñanza, Gestión administrativa y financiera, Acciones estratégicas, `indicadores-manual.ts:80-87`; el texto de la tarjeta está desactualizado.)
- «Sugeridos por las unidades (N)» con «Sugerido por <unidad>», «Rige desde» (por defecto año del ciclo + 1), «Aprobar», «Motivo si lo rechaza», «Rechazar».
- «Aprobados (N)» con ámbito («todas las plantillas» o «Decanatura, …»), «rige ya» / «desde <año>», «Archivar», «Borrar» (confirma «Borrar «x». Los indicadores ya escritos conservan su nombre.»).
- «Crear un criterio»: «Nombre» (3–80), «Para qué sirve (opcional)», casillas por plantilla («Sin marcar: todas.»), «Rige desde», «Crear criterio». Error «Ya existe un criterio con ese nombre.» Sin migración 0252: «Falta aplicar la migración 0252 para crear y aprobar criterios.»

### Paso 6 · «Entrega por unidad» (`Tablero.tsx:356-724`, `data-guia="t-tabla"`)
- Subtítulo: «Fecha límite <fecha>. N de M informes abiertos.»; vacío: «Todavía no hay unidades que escriban informe. Cuando existan, aparecerán aquí.»
- Resumen por estado (botones que filtran; glifos ○ ◐ ◉ ↺ ●): «Sin abrir», «Borrador», «Enviado», «Devuelto», «Aprobado» (`tablero-logica.ts:28-29`), «NN % avance general» con barra y «N informe(s) lleva(n) evidencias».
- Filtros: «Buscar unidad» (placeholder «Nombre de la unidad»), «Estado» (Todos…), «Tipo de unidad» (Todos + tipos de unidad en español), «Quitar los filtros», «N unidades» / «N de M unidades», «Mostrar N más» (de 60 en 60), «Ninguna unidad coincide con los filtros.»
- Fila de unidad: nombre, tipo (+ « · Plantilla A · Decanatura»), estado (pastilla con glifo; sin informe «Sin iniciar» arriba y «Sin abrir» abajo), barra «N de M secciones[ · con evidencias]», bloque de responsables («Responsables» / «Cargando…» / «No disponible» / «Nadie escribe aún» / nombre + «y N más»), y acciones:
  - sin informe: selector «Plantilla de <unidad>» (solo las permitidas para esa unidad) y botón «Abrir»;
  - con informe: enlace «Revisar» (si está enviado/aprobado → `/revision?informe=<id>`) o «Ver» (→ `/mi-informe?unidad=<id>`), y «Vista del informe» (→ `/vista?unidad=<id>`).
- «Abrir los N que faltan» («Abriendo…»; «Con la plantilla que muestra cada fila.») abre en serie y se detiene en el primer error mostrando «<unidad>: <error>».
- Error posible: «Sin permiso para abrir el informe de esta unidad» (`0192:254`), «Esa plantilla no está habilitada para esta unidad», «Esa estructura está desactivada» (solo si no gestiona).
- Sin migración 0279: «Falta aplicar la migración 0279: por ahora todas las oficinas pueden usar todas las plantillas.»
- El «avance» se cuenta como secciones «listas» (no inactivas) entre las del total de la plantilla (`Tablero.tsx:397-436`, `useListas`).

### Paso 7 · Responsables de la unidad (`Responsables.tsx`, botón «Responsables» en cada fila)
- Cajón «Responsables del informe» con el nombre de la unidad: «Quién puede escribir el informe de esta unidad con su usuario. Los papeles son los de la unidad: cambiarlos aquí los cambia en toda la plataforma.»
- Leyenda de papeles (`mejoras-logica.ts:102-107`): **Gestor** «Diligencia y envía el informe»; **Contribuyente** «Diligencia el informe; no lo envía»; **Consulta** «Solo lo ve».
- «Integrantes de la unidad»: avatar, nombre, correo, insignia «Asignado desde Informes», selector «Papel de <nombre>», botón «Quitar» → confirmación («Se deshace esta asignación: vuelve a su papel anterior en la unidad, o sale si no era integrante.» / «Esta persona deja de ser integrante de la unidad.») → «Sí, quitar» / «Cancelar» → «<nombre> ya no figura como responsable.» Cambiar papel → «<nombre> ahora es <Papel>.» Lista vacía: «Esta unidad todavía no tiene integrantes. Busque a una persona para asignarla.»
- «Agregar a una persona»: «Buscar por nombre o correo» (placeholder «Al menos 2 letras»), resultados con «Ya es <Papel>», selector «Papel que tendrá <nombre>» (por defecto Contribuyente), botón «Asignar» o «Cambiar papel» → «<nombre> quedó como <Papel>.» Vacío: «Nadie coincide con «x».»
- «Restablecer responsables»: «Deshace solo lo asignado desde Informes. No toca a los demás integrantes.» → «Sí, restablecer» → «Se restablecieron N persona(s).» / «No había nada que restablecer.» («No hay asignaciones hechas desde Informes.» si no hay).
- Sin migración 0279: «Falta aplicar la migración 0279 (Informes · mejoras). Mientras tanto no se pueden ver ni asignar responsables desde aquí.»
- Solo Planeación puede (base): «Solo Planeación asigna responsables», «Solo Planeación quita responsables de los informes», «El papel debe ser jefe, editor o visor», «No existe esa unidad», «No existe esa persona» (`0279:376-456`).

### Paso 8 · Pestaña «Estructuras» (`Estructuras.tsx`, `/estructuras`)
- Izquierda: lista «Plantillas A–D» (solo lectura) y «Estructuras propias» («Aún no hay estructuras propias.»; cada una «<clave> · <quién>[ · inactiva]»), selector «Partir de» («En blanco (estructura mínima)» o A–D) y botón «Nueva estructura».
- Plantilla A–D: eyebrow «Plantilla del código · solo lectura», «Se envía a <destino>. … No se edita: si necesita otra distribución, cópiela como estructura nueva.», lista numerada de secciones y botón «Copiar como estructura nueva».
- Estructura propia («Estructura propia · X1» / «Estructura nueva»): campos «Nombre» (≤80), «Quién la diligencia» (ej. «Planeación Institucional»), «A quién se envía» (ej. «Vicerrectoría Académica»), «Descripción», casilla «Activa: se ofrece al abrir informes»; sección «Secciones del informe» («En el orden en que aparecen. «Evidencias y fuentes de verificación» es obligatoria y los anexos van siempre al final.»); por sección título, tipo, «Subir», «Bajar», «Quitar»; extra por tipo: «Extensión esperada» y «Mínimo de palabras» (texto), «Dimensiones a las que puede reportar» (resultados: Gestión académica, Gestión profesoral, Calidad y oferta, Investigación, Extensión e internacionalización, Gestión administrativa y financiera), «Columnas (separadas por coma)» (tabla de filas); «Tipo de la sección nueva» + «Agregar sección»; aviso «Antes de guardar:» con los problemas; «Indique quién la diligencia y a quién se envía.»; botones «Crear la estructura» / «Guardar cambios», «Duplicar», «Eliminar» (confirma «Se elimina «x» y también la lista de oficinas que la usan. No se puede deshacer.» → «Sí, eliminar»). Con informes: «Ya hay N informe(s) con esta estructura. Sus secciones no se pueden cambiar. Puede ajustar el nombre, quién la diligencia, a quién se envía, la descripción y si está activa; para otra distribución, use «Duplicar».»; «Ya tiene N informe(s): no se puede eliminar. Desactívela para que no se ofrezca, o duplíquela.»
- Tarjeta «¿Quién puede usarla?»: «Todas las oficinas» / «Solo estas oficinas», «Buscar una oficina», chips, «Guardar quién la usa»; «Elija al menos una oficina o deje «Todas las oficinas».»; «Aplica a los informes que se abran desde ahora.»
- Sin migración 0279: «Falta aplicar la migración 0279 (Informes · mejoras). Mientras tanto solo se ven las plantillas A–D y no se puede crear ni limitar nada.»
- Errores de la base: «Solo Planeación gestiona las estructuras de informe», «Ya no caben más estructuras propias», «La estructura X ya tiene informes abiertos: no se puede eliminar, solo desactivar», «La estructura X ya la usan informes abiertos: sus secciones no se pueden cambiar. Duplíquela para hacer una nueva», «Plantilla no válida» (`0279:125-296`).

### Paso 9 · Vigilar y revisar (pestaña «Revisión», `/revision`; `Revision.tsx`)
- Lista izquierda («cola de revisión», `data-guia="r-cola"`): segmentado «Enviados» (estado `ok` o `sent`), «Devueltos», «Todos»; cada elemento: nombre, pastilla de estado, «Plantilla X · enviado <fecha>». Vacío: «No hay informes enviados.» / «No hay informes en este estado.» Sin selección: «Elija un informe de la lista para leerlo y decidir.»
- Detalle: eyebrow «<Plantilla> · <quién> · <año>», título con nombre de la unidad y pastilla de estado; «Las cifras son la foto tomada al enviar.» / «Las cifras se leen en vivo: el informe no está enviado.» + «Enviado el <fecha>.»; botones de presentación («Crear presentación con Pilo», «Presentaciones de este informe»); enlace «Ver el informe como saldrá en papel (Carta, A4 y PDF)»; si está devuelto, «Nota con la que se devolvió»; cada sección numerada «N. <título>» con su lectura y, si el informe es `sent` u `ok`, un campo «Nota para esta sección (solo si la devuelve)» (placeholder; `aria-label` «Nota para <título>»).
- Al pie (solo `sent`/`ok`): «Nota general para la unidad» (placeholder «Qué debe corregir la unidad»), botones «Aprobar» (solo en `sent` antiguo), «Devolver con nota» (o «Reabrir y devolver con nota» si está aprobado) y la ayuda «Para devolver, escriba al menos una nota.» (el botón está deshabilitado sin notas).
- Resultados: «Devuelto a la unidad con su nota. Las cifras vuelven a ser vivas.»; al aprobar: «Aprobado y congelado. Pilo aprendió de este informe.» o «Aprobado y congelado. Pilo no pudo aprender esta vez: <motivo>».
- Errores: «Escriba una nota para la unidad antes de devolver.» (`datos.ts:707`); base: «Para devolver un informe escriba la nota» (`0281:~`), «Cambio de estado no permitido: X → Y (rol)».
- La nota se guarda en `nota_revision` con la general y una línea por sección «§s3 · Título: nota» (`estados.ts:57-74`), y además una fila por sección en `informe_revisiones`.
- La unidad destino (jefe de la unidad a la que se entrega el informe) también ve «Revisión» y solo puede devolver (`InformesAdmin.tsx:68-70`, `Revision.tsx:44-51`; `0281`): ve únicamente los informes cuyo `destino` es suya (`Revision.tsx:72`). Si no es destino: «La revisión es de quien gestiona los informes o recibe los de otras unidades.»
- Devolver desde `ok` a `back`: el informe pasa a «Devuelto», las cifras vuelven a ser vivas y se borran las fotos (`README.md:76`).

### Paso 10 · «Capacitación de Pilo» (`Capacitacion.tsx`, `data-guia="k-corpus"`)
- Título «Enseñarle a Pilo con los informes ya escritos»: «Suba los informes de gestión en Word o PDF. El texto se lee en este computador, se divide por sus títulos y usted decide qué entra. Pilo guarda los textos sin cifras: aprende la forma de escribir, no los datos de un año.»
- «Año de los informes» (2025 por defecto); zona «Suelte los informes o haga clic» («Word (.docx) o PDF con texto. Un PDF escaneado no se puede leer.»). Solo acepta `.docx` y `.pdf`.
- Por archivo: «Leyendo el archivo…», campos «Unidad» (se adivina del nombre) y «Plantilla» («Que Pilo la deduzca» o A–D / estructuras), avisos del lector, «N de M secciones entran» (casillas «Incluir «<título>»»), «N descartadas» con motivo («Índice o tabla de contenido», «Título sin texto», «Muy corto (N palabras)» si <25), «Quitar».
- Botón «Enviar a Pilo · N secciones de M informes» / «Enviando a Pilo…». Resultado «Pilo recibió los informes»: «N secciones nuevas en el corpus de M enviadas · K ya estaban · D descartadas por Pilo».
- «Lo que Pilo aprendió»: «Textos en su corpus y cómo escribe cada tipo de sección. Crece con cada informe que Planeación aprueba.»; cifras «textos en el corpus / de los informes ya escritos / aprobados en el portal / tipos de sección con estilo propio»; por tipo (Resumen ejecutivo, Alineación con el PDI, Objetivos y metas, Resultados, Retos y oportunidades, Logros, Conclusiones, Presentación, Otras secciones) «N textos · mediana de M palabras», «Suele empezar:», «Conectores:»; vacío «Pilo todavía no tiene textos en su corpus.»
- Errores: «No se pudo llegar a la función pilo-informes: ¿está desplegada?» (`datos.ts:750`); migración 0153.

### Paso 11 · Ver cualquier informe y su papel
- Mi informe: para quien gestiona aparece arriba el selector «Ver el informe de» (opciones «<unidad> · <plantilla> · <estado>»; placeholder «Elija una unidad…»; `TodosLosInformes.tsx:37-67`). Si no tiene unidad propia: «Elija un informe…» con el Tablero. Si la unidad aún no tiene informe: tarjeta con selector de plantilla y botón «Abrir el informe» («Esta unidad aún no tiene informe <año>. Ábralo con la plantilla que le corresponde.»; `MiInforme.tsx:118-145`).
- Vista del informe: igual que el Tablero la enlaza; ver `articulacion.md` §7.

---

## 3. Estados del informe y qué ve el Administrador

Definidos en `estados.ts:17-22`: `draft` «Borrador», `sent` «Enviado», `ok` «Aprobado», `back` «Devuelto». Pastilla: «◐ Borrador» (gris), «◉ Enviado» (azul), «● Aprobado» (verde), «↺ Devuelto» (rojo); sin informe «○ Sin iniciar» (`comunes.tsx:9-19`).

Flujo (0281, `estados.ts:3-6`): `draft → sent → ok` ocurre **de una vez al enviar** (una transacción: `informe_enviar`). `sent` solo queda en informes anteriores a 0281. `back → draft` al guardar algo; `ok|sent → back` al devolver con nota.

Transiciones permitidas (`estados.ts:24-31`, espejo del disparador `0281:90-100`): `draft→sent` y `back→sent`: Planeación, Gestor; `back→draft`: Planeación, Gestor, Contribuyente; `sent→ok`: Planeación; `sent→back` y `ok→back`: Planeación y la unidad destino.

| Estado | Qué ve el Administrador |
|---|---|
| Sin abrir | Fila «Sin abrir» en el Tablero con selector de plantilla y «Abrir»; en Mi informe → «Abrir el informe» |
| Borrador | «Ver» (Mi informe en solo lectura), «Vista del informe»; cifras en vivo; no hay «Revisar» |
| Enviado (antiguo) | Contador en la pestaña «Revisión»; «Revisar»; botones «Aprobar» y «Devolver con nota» |
| Aprobado | Pastilla «Aprobado»; «Revisar»; cifras = foto; «Reabrir y devolver con nota» |
| Devuelto | Pastilla «Devuelto»; en Revisión «Nota con la que se devolvió»; la unidad corrige y reenvía; las cifras vuelven a vivas |

---

## 4. Validaciones que bloquean el envío (y mensajes exactos)

(Aplican a Gestor/administración cuando envía; el Administrador las ve explicadas a la unidad.)

En la interfaz (`estados.ts:45-53`, mostradas bajo el botón «Enviar»):
- «Solo el Gestor de la unidad o Planeación envían el informe.» (si el papel no puede enviar: Contribuyente, Consulta, administración en solo lectura)
- «Se habilita cuando las N secciones estén listas (van K).»
- «Faltan las evidencias y fuentes de verificación: cargue al menos un archivo o enlace. Es obligatorio en todo informe.»
- «Ya se envió.» / «Ya se envió y quedó aprobado.»

En la base (`0279:499-566`, aparece bajo el botón en rojo):
- «El ciclo no está abierto: no se puede enviar»
- «El informe no tiene secciones»
- «Faltan secciones por terminar: s2, s5» (claves)
- «Faltan las evidencias y fuentes de verificación: cargue al menos un archivo o enlace antes de enviar»
- «Falta el nombre de la fuente en: <claves>» (si «Exigir fuente»)
- «Falta el pilar del PDI en: <claves>» (si «Exigir un pilar del PDI vinculado»)
- «Falta justificar (y dejar incluidas) las cifras: <claves>» (las marcadas «Justificar» en el Mecanismo A)
- «Solo se envía un informe en borrador o devuelto» (`0281`/`0153:928`)
- «Sin permiso para enviar este informe»
Texto de confirmación cuando todo está listo: «Todo listo. Al enviar, el informe queda aprobado, con la foto de las cifras, y se bloquea.» (`MiInforme.tsx:411`).

Nota: lo que exigen los «datos que pide Planeación» (Mecanismo B) y los indicadores/acciones incompletos se traduce en que la sección no queda «Lista» (por eso «Faltan secciones por terminar»), no en un mensaje propio.

---

## 5. Errores comunes y cómo se resuelven

| Situación | Causa | Qué hacer |
|---|---|---|
| Una unidad «no puede guardar» y ve «El informe ya se envió (o no es suyo): solo Planeación lo puede cambiar» | El ciclo está «En preparación» o «Cerrado», o el informe ya está enviado/aprobado, o la persona no tiene pertenencia/rol | Poner el ciclo en «Abierto»; si el informe está aprobado, «Reabrir y devolver con nota»; verificar «Responsables» |
| «Sin permiso para abrir el informe de esta unidad» | No es de la unidad y no gestiona | Asignar papel en «Responsables» o abrir desde el Tablero |
| La persona ve «Su usuario no tiene ninguna unidad asignada en «Dónde trabaja»…» | Sin pertenencia ni rol con «Quién hace el informe» | Asignar en «Responsables» (papel Contribuyente/Gestor) o dar rol |
| «Esa unidad no está entre las suyas. Abra el informe de la unidad donde trabaja.» | `?unidad=` ajeno | Usar el enlace correcto |
| Una cifra queda «Lo pide Planeación» y bloquea el envío aunque el sistema no la trae | Las 14 automáticas están en «Justificar» pero UDES en Cifras/PDI no alimentan datos | «Pasar las 14 cifras automáticas a «No pedir»» o aclarar a la unidad que la justifique a mano |
| La estructura propia no ofrece «Datos que pide» | Solo A–D | Usar A–D o avisar de la limitación |
| No puedo borrar/renombrar secciones | Ciclo abierto/cerrado | Volver el ciclo a «En preparación» (la base lo permite) o solo activar/desactivar |
| No puedo eliminar una estructura propia | Ya hay informes que la usan | «Desactívela» (casilla «Activa») o «Duplicar» |
| «Falta aplicar la migración 0xxx…» | Falta aplicar migración | Pedir al equipo técnico (no es acción de la interfaz) |
| «Cambio de estado no permitido: ok → sent (planeacion)» | Se intentó una transición no válida | Devolver y que la unidad reenvíe |
| La nota de devolución llega con «Planeación lo devolvió» aunque la devolvió la unidad destino | Texto fijo (`MiInforme.tsx:372`) | Aclarar en el manual |
| «Pilo no pudo aprender de él esta vez» | Falla de la función `pilo-informes` | El informe queda aprobado igual; reintentar con «Capacitación» o avisar a soporte |
| El PDF sale con «Cifras en vivo» | El informe aún es borrador | Es esperado; se fotografía al enviar |
| No hay botón de Word | No existe | Usar PDF o el libro de Excel |

---

## 6. Rutas y parámetros de cada pantalla

| Pantalla | Ruta | Parámetros | Notas |
|---|---|---|---|
| Tablero del ciclo | `/admin/informes-gestion` | `?anio=<n>` | Sin `:seccion` (solo gestión). Desde el lanzador: tarjeta «Tablero del ciclo» (`admin/launcher/portales.ts:196`) |
| Mi informe | `/admin/informes-gestion/mi-informe` | `?unidad=<id>`, `?s=<n>`, `?anio=<n>` | Para gestión sin unidad: «Ver el informe de» |
| Revisión | `/admin/informes-gestion/revision` | `?informe=<id>` | Tarjeta del lanzador «Revisión» («Aprobar o devolver con nota por sección») |
| Consolidador | `/admin/informes-gestion/consolidador` | — | «Próxima fase» |
| Capacitación de Pilo | `/admin/informes-gestion/capacitacion` | — | |
| Estructuras | `/admin/informes-gestion/estructuras` | — | No sale en el lanzador (solo la pestaña) |
| Vista del informe | `/admin/informes-gestion/vista` | `?unidad=<id>` | |
| Roles (otra pantalla) | `/admin/usuarios` («Usuarios y roles», `AdminShell.tsx:321`; vista de roles `:vista?`, `App.tsx:710`) | — | Módulo «Informes de gestión»: Ver / Editar |

Lanzador (`launcher/portales.ts:181-205`): módulo «Informes» con sección «El informe» (tarjeta «Mi informe»: «Secciones, cifras vivas, evidencias y envío») y sección «Planeación» (tarjetas «Tablero del ciclo» «Estado por unidad, plantillas y qué se justifica», «Revisión», «Capacitación de Pilo» «Los informes de 2025 y lo que Pilo aprendió»).

---

## 7. Cosas que vale la pena mostrar en captura (Administrador)

1. Tablero completo con la tarjeta del ciclo (campos y estado «Abierto»).
2. «Entrega por unidad» con el resumen por estado, filtros y una fila de cada estado (Sin abrir con selector de plantilla; Borrador con barra; Aprobado con «Revisar»).
3. «La estructura de cada informe» con una sección libre, una en «La unidad edita» desmarcado y el aviso de ciclo abierto.
4. «Qué datos debe justificar cada unidad» con el segmentado «Justificar | Sugerido | No pedir» y los tres contadores.
5. «Los datos que pide cada tipo de unidad» con un dato «Justificar» y los botones «Bajar Excel…»/«Subir Excel».
6. La nota amarilla «Las 14 cifras automáticas».
7. «Los datos libres» (stepper − 3 +).
8. «Criterios de Resultados por dimensión» con un criterio sugerido por una unidad (Aprobar / Rechazar).
9. Cajón «Responsables del informe» con la leyenda de papeles y la búsqueda.
10. Pestaña «Estructuras»: lista A–D, estructura propia en edición con sus secciones y «¿Quién puede usarla?».
11. «Revisión»: cola con filtros «Enviados/Devueltos/Todos», detalle, campos «Nota para esta sección» y el botón «Devolver con nota».
12. «Capacitación de Pilo»: archivo cargado con secciones y descartes, y «Lo que Pilo aprendió».
13. Pantalla de roles: módulo «Informes de gestión» con «Editar» y con «Ver» + «Quién hace el informe».
14. Mi informe de otra unidad con el aviso «Administración: solo lectura» y el selector «Ver el informe de».
