# Libros de Excel del módulo Informes Institucionales

Ejemplos generados con el código real del módulo (`armarLibro`, `armarLibrosPorEquipo`, `construirLibro`) y datos ficticios: «Facultad de Ingeniería», plantilla A, ciclo 2026. Se comprobaron releyéndolos con exceljs y pasándolos por `leerLibro`, `validarControl`, `clasificar` y `aplicar`. Las imágenes de cada hoja están en `../capturas/xls-*.png`; los scripts que las hacen, en `../herramientas/`.

Roles (según el uso en pantalla): **Administrador** (Planeación) define estructuras y datos requeridos; **Gestor** (quien lidera el informe) descarga, reparte e importa; **Contribuyente** (equipo u oficina) diligencia las hojas que le tocan y devuelve el archivo.

## Mapa de archivos

| Carpeta / archivo | Para qué sirve | Quién lo usa |
|---|---|---|
| `01-libro-completo-vacio/Informe_Gestion_2026_A.xlsx` | Libro completo que recibe la unidad, con filas de ejemplo | Gestor lo descarga; Contribuyente lo diligencia |
| `02-libro-diligenciado/Informe_Gestion_2026_A.xlsx` | El mismo libro ya lleno: muestra cómo queda | Gestor / Contribuyente (referencia) |
| `03-libros-por-equipo/Informe_Gestion_2026_A_<equipo>.xlsx` | Un libro por equipo, solo con sus hojas | Gestor reparte; Contribuyente diligencia |
| `04-libro-con-errores/Informe_Gestion_2026_A.xlsx` | Errores a propósito para ver los avisos de importación | Referencia del manual |
| `05-libro-de-otro-informe/Informe_Gestion_2026_A.xlsx` | Libro de otra unidad («Facultad de Salud»): el sistema lo rechaza | Referencia del manual |
| `06-plantillas-de-filas/plantilla-*.xlsx` | Plantilla de una sola sección (botón «Descargar plantilla» dentro de la sección) | Contribuyente |
| `07-plantilla-resultados/plantilla-resultados-y-evidencias.xlsx` | Plantilla de cifras y acciones de «Resultados y evidencias» | Contribuyente |
| `08-datos-requeridos-admin/datos-requeridos.xlsx` | Configuración de los datos que pide Planeación, por plantilla | Administrador |

Nombre del libro: `Informe_Gestion_<año>_<plantilla>.xlsx`; el de equipo agrega `_<equipo-sin-tildes-con-guiones>`. Equipos del ejemplo (los sugeridos por la pantalla): Quien lidera el informe (resumen, síntesis, conclusiones, anexos), Dirección de programa (alineación, metas, puntos críticos), Secretaría académica (criterios, resultados, evidencias) y Coordinación de extensión (logros).

Nota sobre el Plan de decanatura o de unidad: no usa Excel; se carga con un JSON o un PDF de seguimiento (`plan-importar.ts`). Por eso no hay libro de ejemplo.

## Cómo se ve cada hoja del libro completo

Las hojas con banda tienen tres filas azules (título con el logo, subtítulo, ayuda) y el **encabezado en la fila 4**; los datos empiezan en la fila 5. Debajo de los datos hay filas libres con color y lista (6 a 40 según la hoja).

| Color | Significado |
|---|---|
| Azul claro | La persona diligencia (opcional) |
| Amarillo | Obligatoria |
| Gris | La pone el sistema; está bloqueada |

Si al descargar se dejó marcada «Bloquear las celdas grises», cada hoja con celdas grises queda protegida **sin contraseña**: solo se escribe en las celdas de color. Se quita en Excel desde Revisar → Desproteger hoja.

### 00 Portada (`xls-instrucciones.png`)
Columnas Campo / Valor: unidad, plantilla (y quién la diligencia), destino, ciclo, equipo (solo en libros por equipo), fecha de exportación, número de hojas, las seis instrucciones y la leyenda de colores. No se importa.

### 01 Resumen ejecutivo y 09 Conclusiones (`xls-resumen.png`, `xls-conclusiones.png`)
- **Texto de la sección** (amarilla, obligatoria): el texto completo en una celda. Cifras vivas del informe se citan con `[[clave]]`; en Excel solo texto.
- **Palabras** (gris): lo cuenta el sistema.

### 02 Alineación estratégica con el PDI (`xls-pdi.png`)
- **Pilar del PDI** y **Avance del plan** (grises): vienen del Plan de Desarrollo.
- **Articula con su unidad** (amarilla, lista ▾ Sí / No).
- **Aporte de la unidad** (azul): qué aporta la unidad al pilar.
Una fila con «Sí» o con aporte escrito se importa; con «No» no se agrega nada.

### 03 Objetivos y metas 2026 (`xls-metas.png`)
- **Objetivo o meta anual** (amarilla) y **Programado** (amarilla, solo número; admite coma decimal y %).
- **Alcanzado** (azul, número; puede quedar vacío si el año no termina).
- **Resultado** (gris): Superada, Cumplida o Parcial; lo calcula el informe.
El libro vacío trae dos filas de ejemplo marcadas «(borre esta fila)».

### 04 Criterios (`xls-criterios.png`)
Aparece solo en secciones de resultados que no consolidan.
- **Criterio** (gris en los criterios del sistema; amarilla en las filas libres para escribir uno propio).
- **¿Reporta aquí?** (amarilla, lista ▾ Sí / No).
- **Origen** (gris): Base, Aprobado por Planeación o Propio de la unidad.
Solo los criterios con «Sí» salen en la hoja de resultados. Un criterio nuevo escrito en las filas finales con «Sí» se crea como criterio propio. «No» nunca quita un criterio ya marcado.

### 04 Resultados por dimensión estratégica (`xls-resultados-a.png`, `xls-resultados-b.png`)
Una fila por cifra o por acción; 18 columnas (la imagen se parte en dos).

| Columna | Color | Qué va |
|---|---|---|
| Criterio | amarilla ▾ | Lista de los criterios de la hoja oculta `Listas`; admite escribir uno nuevo |
| Indicador | amarilla | Nombre corto de la cifra o la acción |
| Unidad | azul | Vacío para conteos; `%` o `pp` |
| Qué es mejor | azul ▾ | «Más es mejor» o «Menos es mejor» |
| Año anterior, Cifra actual, Meta | azul | Solo números |
| Fuente, Nota | azul | Texto; la nota explica por qué se movió la cifra |
| Tipo | amarilla ▾ | «Cifra» o «Acción»; vacío se toma como cifra (con aviso) |
| Descripción de la acción, Qué se ha hecho | azul | Solo para acciones; ambas hacen falta para darla por completa |
| Finalización, Proyección (texto), Proyección (número) | azul | Opcionales; para acciones |
| Pilar del PDI | azul ▾ | «1. Nombre del pilar» (lista de `Listas`) |
| N.º de anexos | azul | Números de los anexos de «Evidencias», separados por coma o espacio |
| Estado (lo calcula el sistema) | gris | Cumplida, Parcial…; no se escribe ni se lee |

### 05 Síntesis de resultados institucionales (`xls-sintesis.png`)
Solo referencia, todo gris: Criterio, Cifras reportadas, Sin dato, Lectura. Se arma sola con las otras hojas. No se importa.

### 06 Puntos críticos y acciones de mejora (`xls-puntos-criticos.png`)
- **Dimensión** (amarilla ▾): Extensión, Internacionalización, Investigación, Enseñanza, Gestión administrativa y financiera, Acciones estratégicas. Otra escrita se importa como texto libre, con aviso.
- **Punto crítico**, **Acción**, **Tiempo** (amarillas) y **Recursos** (azul, opcional).
En el libro vacío las dos filas de ejemplo solo traen la dimensión (no dicen «borre esta fila»): si se devuelven así, avisan que falta el resto.

### 07 Logros destacados (`xls-logros.png`)
**Logro** y **Contexto y resultado** (amarillas); **N.º de anexo** (azul, entero positivo de la hoja de evidencias).

### 08 Evidencias y fuentes de verificación (`xls-evidencias.png`)
**N.º** (gris), **Documento** y **Descripción** (amarillas), **Enlace** (azul, `https://`). Los archivos ya cargados viajan en el libro y no se vuelven a importar. Para sumar una evidencia desde Excel hay que escribir su nombre, para qué sirve y un enlace `https://`; los archivos se suben desde el informe.

### 10 Anexos (`xls-anexos.png`)
Solo referencia: N.º, Documento, Origen (Archivo o Enlace). No se importa.

## Hojas ocultas: no se tocan

| Hoja | Contenido | Por qué no tocarla |
|---|---|---|
| `Listas` (`xls-listas-oculta.png`) | Criterios, Tipo, Qué es mejor, Sí o no, Pilar del PDI | Alimenta las listas desplegables; si se borra, las listas dejan de funcionar |
| `_Control` (`xls-control-oculta.png`) | clave / valor: `formato` (libro-informe), `version_libro`, `ciclo`, `anio`, `plantilla`, `instancia`, `unidad`, **`huella`**, `generado`, `fila_encabezado` (4), `equipo` (solo libros por equipo) y, por cada hoja, su clave (`s1`, `s4:crit`…) con el nombre de la hoja | Une el libro con el informe. Con él, cada hoja se reconoce al 100 %. La **huella** es un código de la estructura (secciones, tipos, columnas, dimensiones): avisa si Planeación la cambió después de descargar |

Tampoco se deben cambiar los nombres de las hojas ni de los encabezados, ni borrar la fila 4. Las hojas de apoyo (`00 Portada`, `Listas`, `_Control` y las llamadas «Cómo llenar…») nunca se importan.

## Cómo se importa

Informe → botón «Libro de Excel» → paso «2 · Importar». Solo se leen `.xlsx` (un `.xls` o `.csv` hay que guardarlo antes como `.xlsx`).

1. El sistema valida `_Control` (libro de este informe, ciclo y plantilla).
2. Clasifica cada hoja: con `_Control`, por nombre (o por el número «05 …» si la renombraron); sin él, por encabezados (alias): 75 % o más «Reconocida», 40 % a 75 % «Revisar», menos «Sin destino». La persona puede corregir el destino de cada hoja o elegir «No importar». Una hoja renombrada, como «Mis soportes» en el libro de errores, se reconoce por encabezados (`xls-errores-clasificacion.png`).
3. Muestra el conteo (filas listas, con aviso, sin importar) y los avisos.
4. Se elige el modo de aplicación y se aplica.

**Modos de aplicación**
- **Agregar al final**: «Suma lo del libro a lo que ya está escrito. Lo que ya existe no se toca.» Las filas idénticas a una existente se omiten.
- **Llenar solo lo vacío**: «Completa las celdas que están vacías en el informe y suma las filas que no existen. Nada de lo escrito se cambia.»
- **Reemplazar la sección**: «Lo del libro queda en lugar de lo que había en cada sección importada.» Pide confirmación. Las evidencias no se reemplazan, solo se agregan las nuevas.

Se ignoran las filas con «(borre esta fila)» y las filas sin nada diligenciado; el tope es de 500 filas por hoja. Las fechas ISO pasan a dd/mm/aaaa. Si el libro trae `equipo` en `_Control`, ese nombre se anota como quien aporta. El resultado dice, por ejemplo: «29 filas agregadas al final en 7 secciones.»

### Avisos del libro completo (texto exacto)

Rechazos (el libro no se carga):
- «Solo se leen libros .xlsx. Si lo tiene en .xls o .csv, ábralo en Excel y guárdelo como .xlsx.»
- «Este archivo no es un libro de informe de gestión.»
- «Este libro es del informe de «Facultad de Salud», ciclo 2026, plantilla A y no corresponde a este informe. Descargue el libro desde este informe y vuelva a intentarlo.» (`xls-otro-informe-error.png`)
- «Este libro es de otro ciclo (2025). Descargue uno nuevo desde este informe.»
- «Este libro es de la plantilla B y el informe usa la A.»
- «El libro no tiene hojas con encabezado y filas para importar.»
- «No se pudo abrir el libro: …»

Avisos que no bloquean:
- «La estructura del informe cambió desde que se descargó este libro (secciones o columnas). Revise la clasificación antes de aplicar.»
- «Este libro salió de una versión más nueva del sistema; algunas columnas pueden no reconocerse.»
- «Otra sección puntúa igual: confirme.» (en la clasificación)

Avisos por hoja y fila (los del libro de errores, `xls-errores-avisos.png`; en cada hoja las celdas culpables están marcadas en rojo, `xls-errores-*.png`):
- «02 Alineación…», fila 10: el pilar «9. Pilar que no existe en el plan» no es uno del Plan de Desarrollo; se omitió.
- «03 Objetivos y metas 2026», fila 8: «cuatro» no es un número en Programado.
- «03 Objetivos y metas 2026», fila 9: falta «Programado».
- «04 Criterios», fila 6: «Tal vez» no es Sí ni No; se omitió.
- «04 Resultados…», «Artículos en revistas indexadas»: falta la cifra actual. / «Ahorro en contratación»: falta la meta. / «Feria de servicios a la comunidad»: falta la descripción de la acción, qué se ha hecho con la acción.
- «04 Resultados…»: 1 fila sin Tipo se tomó como cifra.
- «04 Resultados…», fila 15: el criterio «Criterio que no existe» no existe; se creó como criterio propio de la unidad.
- «04 Resultados…», fila 16: sin nombre de indicador, se omitió.
- «04 Resultados…», fila 17: «doce» no es un número en Cifra actual.
- «04 Resultados…», fila 18: el pilar «Pilar de prueba» no es uno del Plan de Desarrollo; quedó sin pilar.
- «06 Puntos críticos…», fila 8: falta «Acción».
- «06 Puntos críticos…»: 1 fila tiene una dimensión que no es ninguna de las conocidas; se importó como texto libre.
- «07 Logros destacados», fila 7: «abc» no es un número de anexo; quedó vacío.
- «07 Logros destacados», fila 8: falta «Contexto y resultado».
- «Mis soportes», fila 8 y fila 9: sin enlace https://. Los archivos se suben desde la sección de evidencias; se omitió. (la fila 9 trae `http://`, que tampoco vale)
- «09 Conclusiones»: no hay texto para importar.

Otros avisos posibles: «…: no hay columna para «X»; queda vacía.» y «…: sin columna para «X» (quedan vacías).» (falta una columna en la hoja); «…: solo se importan las primeras 500 filas; el resto se omitió.»; «…: una fila de ejemplo se omitió.» / «N filas de ejemplo se omitieron.»; «…, fila N: falta «A» y «B».» (varias obligatorias); «…, fila N: «X» no es un número en Año anterior / Meta / Proyección (número).»; «…, fila N: sin criterio, quedó en «Extensión».»; «Las evidencias no se reemplazan: solo se agregan las nuevas. Quite las que sobren desde la sección de evidencias.»; ««…» es de solo lectura (la definió Planeación): no se escribió.»

Aplicar se bloquea con: «El informe ya se envió: no admite cambios. Pida que lo devuelvan para modificaciones.» o «Su papel no permite escribir en este informe.»

### Qué pasa con el libro vacío devuelto sin diligenciar
Se reconoce al 100 % y no da errores de formato, pero avisa: «01 Resumen ejecutivo: no hay texto para importar», las filas de ejemplo omitidas, ««04 Criterios», fila N: falta «¿Reporta aquí?»» (una por criterio) y ««06 Puntos críticos…», fila N: falta «Punto crítico» y «Acción» y «Tiempo»». Con «Agregar al final» esas dos filas de puntos críticos con solo la dimensión sí entran. Conviene borrarlas.

### Errores frecuentes
- Escribir un número con letras («cuatro», «doce») o con texto en Programado, Alcanzado, Año anterior, Cifra actual o Meta.
- Dejar la fila de ejemplo sin borrar (si dice «(borre esta fila)» se omite; si no, entra).
- Quitar o renombrar encabezados, o mover el encabezado de la fila 4.
- Subir el libro de otra unidad, de otro ciclo o de otra plantilla.
- Escribir un criterio, pilar o dimensión distintos a los de la lista (el criterio se crea como propio; el pilar y la dimensión se omiten o quedan como texto libre).
- Poner una evidencia sin `https://`.
- Marcar «Tal vez» o dejar vacío «¿Reporta aquí?» en vez de Sí o No.
- Importar en «Reemplazar» creyendo que cambia las evidencias: no lo hace.
- Intentar importar cuando el informe ya fue enviado.

## Plantillas de una sola sección (`06-plantillas-de-filas`)

Se descargan con «Descargar plantilla» dentro de la sección y se importan con «Importar Excel» (vista previa, luego «Añadir a lo que ya hay» o «Reemplazar todo»). Sin banda de colores: encabezado azul oscuro en la fila 1, hoja `Filas` y una hoja `Cómo llenar Filas` con las instrucciones. Solo se lee la hoja `Filas` (o la primera). Se lee por nombre de encabezado; si no coinciden todos, por posición, con el aviso «Los encabezados no coinciden con los de la plantilla; se leyó por posición de columna.»

| Archivo | Columnas | Lista ▾ |
|---|---|---|
| `plantilla-puntos-criticos.xlsx` (`xls-plantilla-puntos-criticos.png`) | Dimensión, Punto crítico, Acción, Tiempo, Recursos | Dimensión (seis criterios) |
| `plantilla-retos-oportunidades.xlsx` (`xls-plantilla-retos.png`) | Reto, Aprendizaje, Oportunidad, Propuesta (plantillas B y C) | — |
| `plantilla-logros.xlsx` (`xls-plantilla-logros.png`) | Logro, Contexto y resultado, N.º de anexo | — |
| `plantilla-objetivos-y-metas-anuales.xlsx` (`xls-plantilla-metas.png`) | Objetivo o meta anual, Programado, Alcanzado | — |

Avisos: «Fila N: falta <columna>» (una fila incompleta se importa, pero la sección no queda lista), «N filas tienen una dimensión que no es ninguna de las conocidas; se importó como texto libre.», «El archivo no tiene filas debajo del encabezado.», «No se encontró ninguna fila con contenido.», «Solo se importan las primeras 500 filas; el resto se omitió.»

### Plantilla de resultados (`07-plantilla-resultados`)
Hojas `Cifras` (Criterio, Indicador, Unidad, Qué es mejor, Año anterior, Cifra actual, Meta, Fuente, Nota, Pilar del PDI; `xls-plantilla-resultados-cifras-a.png`), `Acciones` (Criterio, Acción, Descripción de la acción, Qué se ha hecho, Finalización, Proyección (texto), Proyección (número), Unidad de la proyección, Fuente, Nota, Pilar del PDI; `xls-plantilla-resultados-acciones.png`), más `Criterios` y `Pilares` como listas visibles, y las hojas «Cómo llenar Cifras / Acciones». También se lee la hoja única antigua `Indicadores`. Avisos propios: «El libro no tiene las hojas «Cifras» ni «Acciones». Use la plantilla que se descarga aquí.» y «No se encontró ninguna cifra ni acción en el archivo.»; el resto son los de la hoja de resultados (criterio que no existe, no es un número, pilar que no existe…).

### Datos requeridos (`08-datos-requeridos-admin`, solo Administrador; `xls-datos-requeridos.png`)
Hoja `Datos requeridos`: Plantilla (A, B, C o D ▾), Dato (3 a 120 caracteres), Fuente (tipo) ▾ (Manual, Excel, UDES en Cifras, PDI), Fuente (nombre), Criterio ▾, Unidad, Qué es mejor ▾, Condición ▾ (Justificar, Sugerido, No pedir). Al subirlo, las filas se **añaden** a la configuración de cada plantilla. Avisos: «Fila N: plantilla «X» no es A, B, C ni D; se omitió.», «Fila N: el dato debe tener entre 3 y 120 caracteres; se omitió.», «Fila N: el criterio «X» no existe; quedó sin criterio.»

## Notas sobre cómo se hicieron
- Los libros de los puntos 01 a 05 salen directo de `armarLibro` / `armarLibrosPorEquipo` + `construirLibro` (con el logo real). El de errores parte del diligenciado y se alteraron celdas antes de escribirlo.
- Las plantillas de `06`, `07` y `08` replican la llamada a `descargarLibro` de `ImportarFilas.tsx`, `ResultadosManuales.tsx` y `RequisitosConfig.tsx` (no son funciones exportadas), con los mismos argumentos.
- Las imágenes se generan leyendo el `.xlsx` real (`herramientas/xlsx-a-html.mjs`) y se capturan con `herramientas/capturar-excel.mjs`; los tres paneles de avisos (`xls-errores-avisos`, `xls-errores-clasificacion`, `xls-otro-informe-error`) son una maqueta sencilla con el texto exacto devuelto por el código (`herramientas/paneles-avisos.mjs`), no una captura de la pantalla real.
- `herramientas/generar-excel.test.ts.txt` es la prueba temporal de Vitest que generó y verificó los libros (para volver a ejecutarla, copiarla a `tests/` con extensión `.ts`).
