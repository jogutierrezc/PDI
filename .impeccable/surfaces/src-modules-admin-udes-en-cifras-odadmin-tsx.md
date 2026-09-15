---
version: 1
slug: "src-modules-admin-udes-en-cifras-odadmin-tsx"
primary_target: "src/modules/admin/udes-en-cifras/OdAdmin.tsx"
related_targets: ["src/modules/admin/components/AdminShell.tsx"]
---

# Intranet · UDES en Cifras

Scope: `/admin/udes-en-cifras/:estacion/:informe?` y la reorganización del marco de la intranet (`AdminShell`): menú agrupado por portal y ruta de navegación en la cabecera.
Visitor mode: Operate. Quien usa esto es Planeación Institucional (roles planeacion y admin escriben; consulta lee).

Audience and job: Planeación configura el periodo global (2020-2025), la estructura de los nueve informes y sus KPI, carga las cifras por año y campus, organiza la visualización de cada ficha y publica. Frecuencia: carga intensiva al cierre de cada corte; ajustes puntuales durante el año.
Task and states: periodo en borrador o publicado; informe en borrador, revisión o publicado; casillas vacías (sin reportar) frente a cero; cambios desde la última publicación; errores de validación de pegado y plantilla; lectura sin permiso de edición.
Constraints: sistema visual de la intranet existente (tokens del portal, Manrope, azul institucional); solo Planeación envía; captura por rejilla, pegado desde Excel y plantilla CSV; el portal público refleja exactamente la base.

Memorable moment: la barra de estaciones muestra en un vistazo cuánto le falta al periodo, y publicar un informe enseña casilla por casilla lo que cambió desde la última publicación antes de confirmar.

Unresolved: carga por oficina y flujo de revisión quedan fuera (decisión: solo Planeación).

## Direction contract

THESIS: El periodo avanza por cinco estaciones fijas (Periodo y campus, Estructura y KPI, Captura, Diseño visual, Publicación) y cada informe lleva su marca en cada una. Rechaza el panel CRUD de pestañas sueltas donde nadie sabe qué falta para publicar.

OWN-WORLD: La intranet existente: superficies blancas y gris azulado, tinta azul marino, azul institucional solo para acción principal, selección y foco; verde de estado para lo completo, ámbar de estado para lo pendiente, siempre con glifo y texto. Manrope en toda la interfaz; cifras en numerales tabulares. Menú lateral agrupado por portal. Rejillas densas tipo hoja de cálculo con la casilla vacía rayada.

STORY: Planeación entra, ve en la barra qué estación está incompleta, elige un informe en la lista (que marca su estado por estación), trabaja la estación a pleno ancho, comprueba en la tira de vista previa cómo quedará la ficha y publica viendo lo que cambió.

FIRST VIEWPORT: Menú agrupado a la izquierda. Arriba del contenido, la ruta de navegación y el selector de periodo; debajo, la barra de cinco estaciones con número, nombre y avance, la activa resaltada. Columna izquierda de nueve informes con código de línea y cinco marcas de estado. Centro: el trabajo de la estación. Derecha: tira de vista previa con los bloques de la ficha y el botón Vista previa. Acción primaria de la estación arriba a la derecha del área de trabajo.

FORM: Estaciones del periodo (asistente guiado), sexto de la lista propia; seed 236388a3. Raise: prueba antes de fijar, publicar muestra la diferencia desde la última publicación (darkroom-safelight-bay).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
