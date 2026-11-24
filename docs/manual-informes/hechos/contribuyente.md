# Hoja de hechos · CONTRIBUYENTE (rol `editor`: diligencia, no envía) y CONSULTA (rol `visor`: solo lee)

Rutas relativas a `src/modules/informes/` salvo indicación. Cita: `archivo:línea`. «NO VERIFICADO» = deducido, no leído. En el manual se dice «campus»; los textos de pantalla que dicen «sede» están en `articulacion.md` §12.

El Contribuyente usa las mismas pantallas y el mismo editor que el Gestor. Para no repetir, el detalle campo por campo de cada tipo de sección está en `gestor.md` §2 Paso 4 y en `articulacion.md` §2; aquí van las diferencias, el recorrido resumido en el orden real, los bloqueos y los textos exactos que solo ve este papel.

---

## 1. Quién es

- Contribuyente = papel `editor` de la unidad. Nombre en pantalla: «Contribuyente» («Diligencia el informe; no lo envía», `mejoras-logica.ts:102-107`; `rankings/reporte/envio.ts:37-50`). Consulta = papel `visor`: «Consulta» («Solo lo ve»).
- Cómo se obtiene: (1) pertenencia a la unidad en «Dónde trabaja» con función `editor`/`visor`, o asignación de Planeación en Tablero → «Responsables» («Contribuyente»/«Consulta»; `Responsables.tsx`); (2) un rol de acceso con módulo «Informes de gestión» en «Ver» y «Quién hace el informe» = «Diligencia» («Escribe el informe de las unidades que elija, como un Contribuyente.»; `RolesView.tsx:242-246`). La Consulta no se otorga por rol de «Quién hace el informe» (solo existen «Solo el de su unidad», «Diligencia», «Diligencia y envía»); se obtiene por pertenencia o por «Responsables».
- Si el rol de acceso de la persona no marca la pantalla «informes», no ve nada aunque pertenezca a la unidad (`README.md:143, 178`).

### 1.1 Qué puede el Contribuyente (con el informe en `draft` o `back` y el ciclo abierto; `estados.ts:39-42`)
- Abrir Mi informe y editar todas las secciones, cifras, anexos (subir, enlazar, editar, quitar).
- Usar «Pilo redacta un borrador», «Pilo mejora el texto», Pilo en alineación y plan.
- Usar el Libro de Excel (exportar e importar).
- Subir/cambiar portada, cierre y contraportada (diseño del informe) y el papel Carta/A4 (`VistaInforme.tsx:87`: `puedeDiseno` = puede editar).
- Sugerir un criterio propio a Planeación (`0252:109-120`: `informe_actor` ∈ {jefe, editor}).
- Reabrir un informe devuelto: al guardar pasa de «Devuelto» a «Borrador» (`back→draft` permitido a `editor`, `estados.ts:28`).
- Ver el informe en papel, descargar el PDF, crear presentaciones con Pilo.
- Usar la guía con Pilo.

### 1.2 Qué NO puede
- **Enviar.** El botón «Enviar» queda deshabilitado y debajo dice «Solo el Gestor de la unidad o Planeación envían el informe.» (`estados.ts:49`). La base también lo impide («Cambio de estado no permitido: draft → sent (editor)», `0281`/`0153:684`).
- **Cambiar el perfil de la oficina**: color de acento, monograma, escudo, contacto y línea del pie. Los campos salen bloqueados y el mensaje es: «Solo el Gestor de la unidad o Planeación cambian el acento, el monograma y el escudo.» (`EditorPortada.tsx:383`) y «Solo el Gestor de la unidad o Planeación cambian el contacto y el pie.» (`EditorCierre.tsx:91`). Comprobación: `puedePerfil = actor === "planeacion" || actor === "jefe"` (`VistaInforme.tsx:88`).
- Ver la pestaña «Revisión» (solo gestión o jefe de unidad destino; `InformesAdmin.tsx:68-70`), el Tablero, Consolidador, Capacitación de Pilo, Estructuras.
- Abrir el informe si Planeación no lo abrió: «Planeación todavía no abre el informe <año> de <unidad>.» (`MiInforme.tsx:121`).
- Escribir tras el envío o en secciones «Solo lectura» de Planeación.
- Devolver un informe (aunque la unidad sea destino, solo cuenta el `jefe`).
- No existe en el módulo un aviso al Gestor cuando el Contribuyente termina: NO VERIFICADO (no se leyó ninguna notificación en el código del módulo). El Contribuyente debe avisar fuera del sistema.

### 1.3 Qué hace la Consulta (visor)
- Ve Mi informe en lectura: todos los campos `readOnly`/`disabled`; las barras de importar/exportar Excel por sección no aparecen (`ImportarFilas.tsx:33`: `if (!editable) return null`); los bloques de Pilo no se muestran (`MiInforme.tsx:685`: `pie={editable ? … : undefined}`); no se crean cifras ni se sincronizan metas (`MiInforme.tsx:256-281` exigen `editable`); no aparece el aviso «Cambió desde que lo revisó» (solo editable, `Cifras.tsx:30`).
- «Su papel: Consulta» en el encabezado del riel (`MiInforme.tsx:348`).
- Botón «Enviar» deshabilitado con «Solo el Gestor de la unidad o Planeación envían el informe.»
- Libro de Excel: puede abrirlo y exportar; al importar el aviso rojo es «Su papel no permite escribir en este informe.» (`libro-informe.ts:1047`).
- Guía con Pilo: la tarjeta agrega «Usted tiene rol de Consulta: ve el informe pero no lo edita. La guía le sirve para entender lo que ve.» (`GuiaPilo.tsx:235`).
- Vista del informe: ve todo y puede descargar PDF y crear presentaciones; editores de portada y cierre abiertos solo para ver («Usted puede ver la portada, pero no cambiarla: el informe está enviado o su papel solo permite consultar.», `EditorPortada.tsx:200`; «Usted puede ver el cierre, pero no cambiarlo: …», `EditorCierre.tsx:58`). Papel Carta/A4: cambia solo en la sesión (no se guarda).
- Quien gestiona pero no pertenece a la unidad aparece igual como «Consulta» («Informe <año> · Administración: solo lectura», `MiInforme.tsx:348`).

---

## 2. Recorrido paso a paso (orden real de la interfaz)

1. **Entrar.** `/admin/informes-gestion` → abre Mi informe (`InformesAdmin.tsx:76`); menú «Informes Institucionales» → «Informes de gestión». Pestañas visibles: «Mi informe», «Vista del informe», «Guía con Pilo». Banner «¿Primera vez aquí?» (`guia/BannerGuia.tsx`). Ver los mensajes de entrada en `gestor.md` §2 Paso 1.
2. **Riel izquierdo.** Eyebrow «<Plantilla> · <quién la diligencia>», nombre de la unidad, «Informe <año> · su papel: Contribuyente», pastilla de estado, «N de M listas», barra, aviso de cifras en vivo, enlaces «Vista del informe en papel» y «Libro de Excel», lista de secciones con puntos «Sin empezar/En curso/Lista», zona de envío (inactiva para este papel).
3. **Abrir una sección.** `?s=<n>`. Cabecera «Sección N de M», título, avance, línea de ayuda por tipo. Si el informe está devuelto, «Planeación pide en esta sección» con la nota.
4. **Diligenciar.** Las mismas secciones y los mismos campos que el Gestor (detalle completo en `gestor.md` Paso 4): texto con «Insertar una cifra viva…»; Alineación estratégica por pilar; Objetivos y metas (plan de trabajo, indicadores del programa, «Meta adicional»); Resultados (criterios, cifras, acciones, datos que pide Planeación, conexión opcional con UDES en Cifras/PDI); Síntesis (comentario ≥10 palabras); Puntos críticos/Retos (tabla); Logros; Evidencias y fuentes (archivo ≤15 MB o enlace https); Anexos (solo lectura); secciones libres; tablas y gráficas de UDrive. Guardado automático a los 800 ms («Guardando…», «Cambios guardados», «No se guardó: <motivo>»).
5. **Controles.** Barra derecha «Controles» («!» ámbar = por corregir, «✓» = bien); mensajes exactos en `gestor.md` §5.
6. **Excel para los equipos.** Cajón «Libro de Excel»: «1 · Exportar» y «2 · Importar» (ver `articulacion.md` §6). Importar solo funciona con el informe en borrador/devuelto.
7. **Vista del informe.** `/vista`: papel, «Personalizar portada» y «Personalizar cierre» (puede cambiar composición, textos, fondo, imagen, firmas, créditos, contraportada; NO acento, monograma, escudo, contacto ni pie), «Descargar PDF», presentación con Pilo.
8. **Dejar el informe listo para el Gestor.** Cuando todas las secciones estén «Lista» y haya al menos una evidencia, el Contribuyente avisa al Gestor (fuera del módulo, NO VERIFICADO que exista notificación). Sigue viendo «Enviar» deshabilitado con «Solo el Gestor de la unidad o Planeación envían el informe.»
9. **Tras el envío por el Gestor.** El informe pasa a «● Aprobado» y queda en lectura: «Enviado y aprobado el <fecha>. Queda congelado; Planeación o su destino pueden devolverlo para modificaciones.» Las cifras quedan en foto.
10. **Si lo devuelven.** Estado «↺ Devuelto»; cuadro «Planeación lo devolvió» con la nota general; «Planeación pide en esta sección» por sección; las cifras vuelven a ser vivas. El Contribuyente corrige y, al guardar, el informe pasa a «Borrador»; el Gestor reenvía.

---

## 3. Estados del informe y qué ve el Contribuyente / la Consulta

| Estado | Pastilla | Contribuyente | Consulta |
|---|---|---|---|
| Sin abrir | — | «Planeación todavía no abre el informe <año> de <unidad>.» | igual |
| `draft` Borrador | «◐ Borrador» | Edita; «Enviar» deshabilitado (solo Gestor/Planeación) | Lee; sin edición |
| `back` Devuelto | «↺ Devuelto» | Edita (al guardar vuelve a Borrador); ve notas | Lee; ve notas |
| `sent` (antiguo) | «◉ Enviado» | Lee | Lee |
| `ok` Aprobado | «● Aprobado» | Lee; botón «Enviado» deshabilitado; importar libro bloqueado: «El informe ya se envió: no admite cambios. Pida que lo devuelvan para modificaciones.» | Lee |

Fuentes: `estados.ts:17-42`, `MiInforme.tsx:390-398`, `comunes.tsx:9-19`.

---

## 4. Validaciones que bloquean el envío (las ve, no las ejecuta)

Bajo el botón «Enviar» (`estados.ts:45-53`):
1. «Solo el Gestor de la unidad o Planeación envían el informe.» (siempre, para este papel y para Consulta)
2. «Se habilita cuando las N secciones estén listas (van K).»
3. «Faltan las evidencias y fuentes de verificación: cargue al menos un archivo o enlace. Es obligatorio en todo informe.»

Lo que el Contribuyente puede y debe resolver para que el Gestor pueda enviar: todas las secciones en «Lista», al menos un anexo, justificar las cifras marcadas «Lo pide Planeación», dar nombre de fuente a los datos propios (y pilar si Planeación lo exige) y llenar los datos que pide Planeación. Mensajes de la base si el Gestor intenta enviar sin eso: «Faltan secciones por terminar: <claves>», «Falta justificar (y dejar incluidas) las cifras: <claves>», «Falta el nombre de la fuente en: <claves>», «Falta el pilar del PDI en: <claves>», «Faltan las evidencias y fuentes de verificación: cargue al menos un archivo o enlace antes de enviar», «El ciclo no está abierto: no se puede enviar» (`0279:499-566`).

Mensajes de «Controles» exactos: `gestor.md` §5.

---

## 5. Errores comunes y cómo se resuelven

| Situación | Causa | Resolución |
|---|---|---|
| «Enviar» no se activa nunca | Papel Contribuyente | Es normal: lo envía el Gestor |
| Campos de acento/monograma/escudo/contacto/pie bloqueados | Son del Gestor | Pedir al Gestor, o usar solo composición, textos, imagen, firmas y créditos |
| «No se guardó: El informe ya se envió (o no es suyo): solo Planeación lo puede cambiar» | Informe aprobado, ciclo no abierto o rol sin escritura | Pedir devolución o apertura del ciclo a Planeación |
| «Su usuario no tiene ninguna unidad asignada en «Dónde trabaja»…» | Sin pertenencia ni rol | Pedir a Planeación asignación en «Responsables» |
| «Esa unidad no está entre las suyas…» | `?unidad=` de otra unidad | Volver a Mi informe |
| «Su papel no permite escribir en este informe.» (Libro) | Papel Consulta | Pedir cambio de papel |
| «Este libro es del informe de «X» … no corresponde a este informe» | Libro de otra unidad | Exportar desde su informe |
| Cifra «Lo pide Planeación» que el sistema no trae | Configuración de Planeación (UDES en Cifras/PDI aún no alimentan) | Justificar a mano o pedir a Planeación «No pedir» |
| «Esta sección ya tiene N datos propios: es el límite del ciclo» | Tope | Quitar uno |
| Archivo grande: ««x» pesa más de 15 MB.» / «No se suben (pesan más de 15 MB): …» | Límite de 15 MB | Comprimir o subir como enlace https |
| «Escriba una dirección completa que empiece por https://» | Enlace sin https | Corregir |
| «Pilo Astra 1.0 se enciende en la administración.» | Presentación apagada | Avisar a administración |

---

## 6. Rutas y parámetros

| Pantalla | Ruta | Parámetros |
|---|---|---|
| Mi informe | `/admin/informes-gestion/mi-informe` | `?unidad=<id>` (solo las suyas), `?s=<n>`, `?anio=<n>` |
| Vista del informe | `/admin/informes-gestion/vista` | `?unidad=<id>`, `?anio=<n>` |
| Guía con Pilo | pestaña en Mi informe | — |
| Tarjeta del lanzador | «Informes» → «El informe» → «Mi informe» | — |

Redirecciones: cualquier otra pestaña de gestión lleva a `/admin/informes-gestion/mi-informe` (`InformesAdmin.tsx:83-84`).

---

## 7. Cosas que vale la pena mostrar en captura (Contribuyente / Consulta)

1. El riel con «su papel: Contribuyente» y el botón «Enviar» deshabilitado con «Solo el Gestor de la unidad o Planeación envían el informe.»
2. La misma pantalla con «su papel: Consulta» (campos de solo lectura, sin botones de Excel por sección, sin botón de Pilo).
3. El editor de portada con los campos de acento/monograma/escudo bloqueados y el mensaje «Solo el Gestor de la unidad o Planeación cambian el acento, el monograma y el escudo.»
4. Una sección con un punto ámbar y su lista de «Controles».
5. El cajón «Libro de Excel» en «2 · Importar» con el aviso «Su papel no permite escribir en este informe.» (captura con papel Consulta) y, con papel Contribuyente, la clasificación y «Aplicar al informe».
6. Un informe devuelto con «Planeación lo devolvió» y «Planeación pide en esta sección».
7. Un informe aprobado: botón «Enviado» deshabilitado y el mensaje «Enviado y aprobado el …».
