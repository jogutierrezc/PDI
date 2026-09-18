---
version: 1
slug: "src-modules-admin-observatorio-obsadmin-tsx"
primary_target: "src/modules/admin/observatorio/ObsAdmin.tsx"
related_targets: ["src/modules/admin/components/AdminShell.tsx", "src/modules/admin/observatorio/ObsBulletinPage.tsx"]
---

# Intranet · Taller del Observatorio de Analítica

Scope: `/admin/observatorio/:estacion/:tema?` (Captura de datos, Diseño visual, Tableros, Boletín) y `/admin/observatorio-boletin/:id` (A4 para imprimir). Incluye el menú lateral plegable de la intranet (completo, íconos, oculto; grupos plegables).
Visitor mode: Operate. Planeación Institucional alimenta el Observatorio; consulta lee.

Audience and job: importar tablas (Excel/CSV/pegado, también microdatos), dejar que el taller las perfile y anonimice (quita identificadores, cuenta por categorías, reserva < 5), armar visores sobre ellas con un estudio tipo Tableau/Power BI, ordenar la página de cada uno de los 14 temas y sacar boletines PDF recortados por temas, años, periodos, fuentes y tipos de dato.
Task and states: borrador local (sin migración 0049) frente a base; tabla con o sin acta de anonimización; datos de ejemplo marcados; visor incompleto (dice qué le falta); tipos de gráfica apagados con el motivo; lectura sin permiso de edición.
Constraints: mismo sistema que las estaciones de UDES en Cifras (oda-*); los quince tipos de conjuntos libres se dibujan con FreeChart, los siete de informes (mapa de calor, mosaico, embudo, puntos, bosque, ranking, mapa por municipio) en ObsCharts; nada personal sale del navegador; valores sensibles nunca se muestran en el perfil.

Memorable moment: el perfil de columnas tacha lo sensible y dice por qué, y el acta de anonimización viaja con la tabla hasta la metodología del boletín.

## Direction contract

THESIS: Un taller de datos en cuatro estaciones, heredero de las estaciones de UDES en Cifras, donde la galería de minivistas y los estantes hacen de la visualización una elección informada por los datos (recomendados con su porqué). Rechaza el formulario de "elige un tipo de gráfica" a ciegas.

OWN-WORLD: la intranet existente (superficies, azul institucional para acción y selección, verde de estado para cifras y lo completo, ámbar para pendiente, rojo de riesgo solo para lo sensible). Minivistas con la paleta institucional pastel (--od-inst-*). Numerales tabulares; casilla vacía rayada; reserva en ámbar.

FIRST VIEWPORT: barra de cuatro estaciones con su avance; lista de 14 temas con conteo de tablas y visores (salvo en Diseño y Boletín, que necesitan el ancho); el trabajo de la estación.
