# Capturas del manual de Informes Institucionales

Todas son de la aplicación real (Vite en desarrollo) con la red de Supabase simulada y **datos ficticios** (herramientas/fixtures.mjs, herramientas/mock.mjs). Se regeneran con `node docs/manual-informes/herramientas/lote.mjs [filtro]` (el servidor debe estar en el puerto 5199 con `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=demo`). Las marcas están en `docs/manual-informes/marcas.json` con la forma `{nombre:{ms:[[n,x%,y%],...],ratio}}`. Ancho de vista: 1180 px (listas, tableros), 1500 px (tablas anchas del Tablero), 390 px (móvil). Todas salen a 2x.

Ruta base: `/admin/informes-gestion`. Roles simulados: **Planeación/Administración** (rol admin), **Gestor** (jefe de la Facultad de Ingeniería), **Contribuyente** (editor), **Consulta** (visor).

## Administrador (Planeación)

| Captura | Ruta | Qué muestra | Marcas (texto exacto) |
|---|---|---|---|
| adm-tablero | `/` (Tablero) | Entrega por unidad: avance general, contadores por estado, filtros y filas con estado y responsables | 1 «avance general»; 2 «Buscar unidad»; 3 «Abrir los 4 que faltan»; 4 «Responsables»; 5 «Revisar» |
| adm-ciclo | `/` (parte superior) | Ficha del ciclo 2026: año, nombre, fecha límite, corte y estado | 1 selector «Año»; 2 «Fecha límite»; 3 «Estado»; 4 «Guardar el ciclo»; 5 «Preparar el ciclo siguiente» |
| adm-ciclo-limites | `/` | «Los datos libres»: límite de datos propios por sección, exigir fuente y pilar | 1 «Datos propios por sección»; 2 «Exigir fuente en cada dato propio»; 3 «Exigir un pilar del PDI vinculado» |
| adm-requisitos | `/` (1500 px) | «Qué datos debe justificar cada unidad»: cifras con Justificar, Sugerido y No pedir | 1 pestaña «A · Decanatura»; 2 «sugeridos»; 3 «Justificar»; 4 «No pedir» |
| adm-requeridos | `/` (1500 px) | «Los datos que pide cada tipo de unidad» (datos requeridos con fuente, criterio y condición) | 1 «+ Añadir dato»; 2 «Guardar los datos»; 3 «Copiar de la plantilla B»; 4 «Bajar Excel (las cuatro plantillas)» |
| adm-estructura-ciclo | `/` (1500 px) | «La estructura de cada informe»: secciones activas, quién las edita, sección libre | 1 «Activa»; 2 «La unidad edita»; 3 «+ Agregar una sección libre»; 4 «Restablecer a la plantilla» |
| adm-criterios | `/` (1500 px) | «Criterios de Resultados por dimensión»: sugeridos, aprobados, crear uno | 1 «Sugeridos por las unidades (1)»; 2 «Aprobar»; 3 «Aprobados (2)»; 4 «Crear criterio» |
| adm-responsables | `/` → «Responsables» (cajón) | Asignar Gestor, Contribuyente o Consulta a las personas de la unidad | 1 selector de papel (Gestor); 2 «Quitar»; 3 buscador «Al menos 2 letras»; 4 «Restablecer responsables» |
| adm-estructuras | `/estructuras` | Plantillas A–D (solo lectura) y estructuras propias (X1 activa, X2 inactiva) | 1 «Plantilla A»; 2 «Informe de oficina de apoyo»; 3 «Nueva estructura»; 4 «Copiar como estructura nueva»; 5 «¿Quién puede usarla?» |
| adm-estructura-edit | `/estructuras` → «Informe de centro de investigación» | Editor de una estructura propia sin informes (nombre, quién diligencia, secciones) | 1 campo «Nombre»; 2 «Secciones del informe»; 3 «Guardar» |
| adm-revision | `/revision` | Lista de informes enviados con filtros Enviados, Devueltos, Todos | 1 «Enviados»; 2 primer informe de la lista; 3 «Elija un informe de la lista para leerlo y decidir.» |
| adm-revision-uno | `/revision` → Facultad de Ciencias de la Salud | Lectura del informe enviado, con cifras congeladas y nota por sección | 1 informe elegido; 2 «Ver el informe como saldrá en papel (Carta, A4 y PDF)»; 3 «Nota para esta sección (solo si la devuelve)» |
| adm-revision-decidir | igual, pie del informe | Decisión: nota general escrita y botones | 1 «Nota general para la unidad»; 2 «Aprobar»; 3 «Devolver con nota» |
| adm-capacitacion | `/capacitacion` | Capacitación de Pilo: subida de informes y lo que aprendió | 1 «Suelte los informes o haga clic»; 2 «Lo que Pilo aprendió» |
| adm-libro-exportar | `/mi-informe`, unidad elegida → «Libro de Excel» (cajón) | Pestaña 1 · Exportar: libro completo o por equipo, hojas, bloquear celdas | 1 pestaña «1 · Exportar»; 2 «Un libro por equipo»; 3 «Bloquear las celdas grises»; 4 pestaña «2 · Importar» |
| adm-libro-importar | igual, pestaña «2 · Importar» | Libro devuelto cargado (el mismo que se descargó): hojas y a qué sección va cada una | 1 pestaña «2 · Importar»; 2 nombre del archivo y «Libro del sistema · reconocido»; 3 «Qué hoja va a qué sección»; 4 «Cargar otro» |
| adm-vista | `/vista` (desde «Vista del informe» del Tablero) | Vista Carta del informe con la portada | 1 «Carta»; 2 «A4»; 3 «Personalizar portada»; 4 «Descargar PDF» |
| adm-portada | `/vista` → «Personalizar portada» | Editor de portada. **Rol Gestor**: Planeación solo la ve, no la cambia | 1 «Composición»; 2 «Título»; 3 «Color de acento»; 4 «Así saldrá la portada en Carta.» |

## Gestor

| Captura | Ruta | Qué muestra | Marcas |
|---|---|---|---|
| ges-mi-informe | `/mi-informe` | Editor: ficha del informe, avance, lista de secciones y Enviar | 1 «7 de 10 listas»; 2 «Libro de Excel»; 3 «Resumen ejecutivo»; 4 «Enviar» |
| ges-seccion-narrativa | `/mi-informe` (sección 1) | Texto con [[clave]], selector de cifra viva, vista «Así se leerá» y Pilo | 1 «Insertar una cifra viva…»; 2 cuadro de texto; 3 «Pilo redacta un borrador»; 4 «Así se leerá, con las cifras vivas» |
| ges-cifras | sección 4, «Conectar indicadores de UDES en Cifras o del PDI (opcional)», fila «Detalle» abierta | Cifras vivas, «Cambió desde que lo revisó: 2.840 → 2.851», fuente y justificación | 1 «Conectar indicadores de UDES en Cifras o del PDI (opcional)»; 2 «Matrícula total»; 3 «Cambió desde que lo revisó»; 4 «Cambiar fuente»; 5 cuadro de justificación («Subió por el programa nocturno de Sistemas.») |
| ges-dimensiones | sección 4 | Resultados por dimensión: criterios, datos que pide Planeación con su estado y evidencias | 1 «¿A qué criterios reporta su oficina?»; 2 «Lo que pide Planeación»; 3 «Fuente propia de la unidad»; 4 «Justificación (obligatoria)»; 5 «Importar Excel» |
| ges-metas | sección 3 | Objetivos y metas: plan de trabajo, metas adicionales | 1 «Importar JSON o PDF»; 2 «Escribir el plan a mano»; 3 «Añadir meta»; 4 «Importar Excel» |
| ges-alineacion | sección 2 | Alineación por pilar con aporte, acciones y resultados conectados | 1 «2 de 4 pilares con aporte»; 2 «Quitar este aporte»; 3 «Resultados y acciones conectados con este pilar»; 4 «Pilo: reescribir el aporte con estos resultados» |
| ges-anexos | sección 7 (Evidencias) | Evidencias y fuentes de verificación: subir, enlazar, editar, quitar | 1 «Suelte archivos o haga clic»; 2 «Añadir enlace»; 3 «Editar»; 4 «Quitar» |
| ges-enviar | sección 8 | Envío bloqueado: «Se habilita cuando las 10 secciones estén listas (van 7)» y controles con lo que falta («Faltan 25 palabras para el mínimo») | 1 «Enviar»; 2 «Se habilita cuando las 10 secciones estén listas»; 3 «Faltan 25 palabras para el mínimo»; 4 «7 de 10 listas» |
| ges-enviar-listo | sección 8 (informe completo, simulado) | Informe con 9 de 10 listas: la sección 4 sigue «En curso» (ver no logrado) | 1 «Enviar»; 2 contador de listas |
| ges-enviado | Facultad de Ciencias de la Salud (enviada), sección 4 | Informe enviado: cifras congeladas, solo lectura | 1 «Enviado»; 2 «Las cifras quedaron congeladas al enviar.»; 3 «Vista del informe en papel» |
| ges-devuelto | Facultad de Ciencias Económicas (devuelta) | «Planeación lo devolvió» con la nota por sección | 1 «Planeación lo devolvió»; 2 nota «§s4 · …»; 3 «Resumen ejecutivo»; 4 «Enviar» |
| ges-libro | «Libro de Excel» (cajón) | Exportar el libro desde el editor | 1 «1 · Exportar»; 2 «Un libro por equipo»; 3 «Bloquear las celdas grises»; 4 «2 · Importar» |
| ges-guia-pilo | pestaña «Guía con Pilo» | Guía paso a paso de Pilo (paso 1 de 19) | 1 «Siguiente»; 2 «Escuchar»; 3 «Leer cada paso»; 4 «Reportar con Pilo» |
| ges-movil | 390 px, `/mi-informe` | Editor en móvil: secciones como tira deslizable | 1 «Libro de Excel»; 2 «Enviar» |

## Contribuyente y Consulta

| Captura | Rol | Qué muestra | Marcas |
|---|---|---|---|
| con-mi-informe | Contribuyente | Mismo editor, sin botón Enviar: «Solo el Gestor de la unidad o Planeación envían el informe.» | 1 «su papel: Contribuyente»; 2 el aviso anterior; 3 cuadro de texto |
| con-solo-lectura | Consulta | Mismo informe en solo lectura (campos bloqueados) | 1 «su papel: Consulta»; 2 cuadro de texto; 3 «Libro de Excel» |
| con-sin-acceso | Contribuyente, tras abrir `/revision` | El sistema lo devuelve a Mi informe: solo ve «Mi informe» y «Vista del informe» (no hay Tablero, Revisión, Consolidador, Capacitación ni Estructuras) | 1 «Mi informe»; 2 «Vista del informe» |

## Vista y exportables

| Captura | Rol | Qué muestra | Marcas |
|---|---|---|---|
| vista-carta | Gestor | Barra de papel y acciones, aviso «Las cifras están en vivo» y las primeras hojas | 1 «Carta»; 2 «A4»; 3 «Personalizar cierre»; 4 «Descargar PDF»; 5 «Crear presentación con Pilo» |
| vista-a4 | Gestor | Mismo informe en A4 | 1 «A4» |
| vista-portada | Gestor | La hoja de portada sola | 1 «Informe de gestión · 2026»; 2 pie con la unidad |
| vista-cierre | Gestor | La hoja de cierre sola | 1 título del cierre |
| presentacion | Gestor | Visor de la presentación con Pilo (14 diapositivas, ejemplo del repositorio) | 1 «Editar textos»; 2 «Presentar»; 3 «PDF / Imprimir»; 4 «Regenerar con otro tono»; 5 «Notas:» |

## Notas
- `vista-portada` y `vista-cierre` usan la foto institucional y los logos que trae la aplicación por defecto (no hay imágenes ficticias). La presentación usa la del ejemplo de `src/modules/informes/presentacion/ejemplo.ts` (unidad «Facultad de Ingenierías»).
- El texto de la interfaz «Sedes» aparece en la hoja de cierre (contraportada) con los datos por defecto «Bucaramanga · Cúcuta · Valledupar · Bogotá»; véase el informe final.
