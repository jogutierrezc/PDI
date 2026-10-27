# Observatorio de Analítica: permisos por panel, varios observatorios e insertados

Paquete O1 (base, permisos, lógica y tiempo de ejecución público) y paquete O2
(las pantallas de los paneles **Observatorios** e **Insertar y publicar** y la
portada pública multi-observatorio; ver «Paquete O2: pantallas» al final).

## Migraciones y orden de aplicación

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | `0230_obs_observatorios_modelo.sql` | `obs_observatorios`, `obs_lineas`, `obs_responsables`; amplía `obs_topics` (14 temas a filas), y `observatorio_id` en datasets, views y bulletins. Siembra «Observatorio de Analítica» (slug `analitica`, `principal`). Tablas nuevas con RLS cerrada. |
| 2 | `0231_obs_permisos_por_panel.sql` | `access_roles.obs_nivel` y `all_obs`; migra los roles actuales; funciones `obs_nivel_actual`, `obs_tiene_panel`, `obs_nivel`, `obs_puede`…; políticas de las tablas nuevas y de las de 0049 (iguales o más estrictas). |
| 3 | `0232_obs_insertados.sql` | `obs_insertados`, `obs_dominios`, `obs_metricas`, `obs_limite`. Sin escritura directa. |
| 4 | `0233_obs_insertados_funciones.sql` | Funciones de administración y la lectura pública `obs_publico_insertado`. |
| 5 | `0234_obs_tema_mover.sql` | (O2) `obs_tema_mover` (mueve un tema con sus tablas, visores e insertados) y `obs_vista_previa` (vista previa de un insertado sin guardar). |

Aplicar en ese orden (0234 es de O2). Cada archivo requiere los anteriores; ninguno depende de
una versión intermedia de otro. Aplique 0231 **junto con** el despliegue de la
interfaz: un rol creado con la interfaz vieja entre ambos pasos tendría la
entrada pero ningún panel (falla cerrado, no abre nada).

## Permisos

Paneles (pantallas de rol, `access_roles.screens`): `observatorio` (entrada),
`obs_captura`, `obs_diseno`, `obs_tableros`, `obs_boletin` (las 4 estaciones),
`obs_observatorios`, `obs_insertar` (nuevos).

Niveles (`obs_nivel`): **Ver** consulta; **Editar** prepara y organiza en los
paneles marcados; **Administrar** además crea y archiva observatorios, aprueba
dominios externos y revoca insertados. Editar y Administrar piden capacidad de
Planeación (como el taller de 0049).

Alcance (`all_obs`): todos los observatorios, o solo aquellos donde la persona
figure en `obs_responsables`. **Acceso efectivo = panel marcado en el rol Y
(alcance «todos» O persona asignada), dentro del nivel del rol.**

Compatibilidad: los roles con la pantalla `observatorio` reciben los 4 paneles y
un nivel derivado de su capacidad (admin → administrar, planeación → editar, el
resto → ver), con alcance «todos». `obs_nivel = none` significa «anterior a
0231» y se sigue derivando de la capacidad. Los paneles nuevos **nunca** se
heredan de «todas las pantallas» (`EXPLICIT_ONLY` en `role-matrix.ts`; en SQL,
`obs_tiene_panel`); solo la administración los tiene siempre, y a los roles de
capacidad admin se les marcan explícitos. Sin rol de acceso: Planeación edita las
4 estaciones, el resto las lee, los paneles nuevos solo la administración.

RLS de tablas de 0049: lectura pública solo de lo publicado de un observatorio
publicado; borradores a quien tenga algún panel del taller en ese observatorio;
escritura con capacidad de Planeación + nivel editar + panel. Afinable después
(hoy datasets ← captura o tableros; views ← captura, diseño o tableros; topics ←
tableros u observatorios; bulletins ← boletín) porque las estaciones se escriben
entre sí.

## Defensa de los insertados (con sus límites)

1. **Estado y vencimiento** (activo / pausado / revocado / vence_en): se avisa sin datos.
2. **Observatorio publicado**: al despublicar o archivar, «sin publicar»; nunca el último dato.
3. **Dominio**: el marco averigua quién lo aloja (`ancestorOrigins`, luego `document.referrer`, luego el origen que declara `obs.js`) y la base compara el host con `obs_dominios` (`*.udes.edu.co` automático; lo externo lo aprueba Administrar). **Límite:** la base no puede verificar ese origen; quien fabrique la petición a mano puede declarar uno permitido. Es barrera contra el uso casual y base de las métricas, no un control de acceso.
4. **Clave opcional**: hash SHA-256 con sal. **No es un secreto**: viaja en el código pegado.
5. **Solo lo publicado y agregado**: temas, tablas y visores publicados; la reserva «< 5» se aplica en la base (mínimo 5, solo cifras enteras de tablas que no son tasas ni modelo) y se retiran las columnas marcadas como dato personal. No hay camino a borradores ni a filas individuales. Esa es la protección que cuenta: el peor caso de una petición forjada es leer datos que ya son públicos.
6. **Límite**: 600 lecturas por minuto y por insertado. **Límite:** quien lo agote puede hacer que el insertado muestre «demasiadas consultas» un minuto.
7. **Caché**: 1 hora en la sesión del marco. No hay caché de borde (la función registra métricas y se llama por POST); «purgar al republicar» solo alcanza a quien vuelva a cargar tras la hora. Si hace falta caché de borde, se separa una función de solo lectura.
8. **Métricas**: conteo por insertado, dominio y día; sin cookies ni IP; una vista por sesión del marco.

Lo que no se puede garantizar: que un sitio ignore la política de marcos, que
copie lo que muestra el marco, o que el origen declarado sea real.

### Qué debe configurar el usuario (no está hecho)

El portal es una SPA estática: el encabezado no puede ser dinámico por insertado.
Hoy `vercel.json` no define cabeceras de marcos. Propuesta, para añadir al arreglo
`headers` de `vercel.json` (Vercel; en Coolify/nginx, lo equivalente):

```json
{
  "source": "/obs-embed",
  "headers": [{ "key": "Content-Security-Policy", "value": "frame-ancestors *" }]
},
{
  "source": "/((?!obs-embed|pilo-embed|pilo-ensenanza-embed|assets/).*)",
  "headers": [
    { "key": "Content-Security-Policy", "value": "frame-ancestors 'self'" },
    { "key": "X-Frame-Options", "value": "SAMEORIGIN" }
  ]
}
```

La segunda regla protege el resto del sitio contra clickjacking; dejé fuera
`pilo-embed` y `pilo-ensenanza-embed` porque ya se incrustan. Revise antes que
nada más se incruste hoy (la intranet dentro de otro sitio, la app móvil) y
pruebe en una vista previa de Vercel. En Coolify, nginx: `location = /obs-embed {
add_header Content-Security-Policy "frame-ancestors *"; }` y las mismas dos
cabeceras para el resto. Hasta hacerlo, `/obs-embed` se puede enmarcar desde
cualquier sitio (la lista de dominios sigue valiendo en la base).

## Contrato para O2

Todo en `src/modules/admin/observatorio/publicar/`:

- `permisos.ts`: `usePermisosObservatorio()` → `{ nivel, todos, asignados, tiene(panel, obsId?), puede(panel, obsId, minimo) }` (espeja la base), `OBS_PANELS`, `permisosObservatorio()` pura.
- `api.ts`: lecturas `useObservatorios`, `useLineas(obs)`, `useTemas(obs)`, `useResponsables(obs)`, `useDominios(obs)`, `useInsertados(obs)`, `useMetricas(obs, dias)`; escrituras `useGuardarInsertado`, `useEstadoInsertado` (activo/pausado/revocado), `useDuplicarInsertado`, `useProponerDominio`, `useDecidirDominio`, `useRetirarDominio`, `useCrearObservatorio`, `useArchivarObservatorio`, y `useEditarObservatorios()` (identidad, líneas, temas, personas responsables por RLS); público `useObservatoriosPublicos()`. Si faltan migraciones lanzan `FaltaMigracion`.
- `opciones.ts`: `validarOpciones`, `leerFiltros/escribirFiltros`, `generarCodigo(portal, datos, "script" | "iframe" | "enlace")`, `PLATAFORMAS`. Vista previa en el taller: `/obs-embed?id=<codigo>&origen=@vista-previa` (la base lo acepta solo con el panel Insertar; no cuenta métricas).
- Rutas: el taller abre `/admin/observatorio/observatorios` y `/admin/observatorio/insertar` (hoy `ObsAdmin.tsx` muestra un aviso; O2 las reemplaza).
- El portal público sigue con la constante hasta que haya filas legibles; `useObservatoriosPublicos` da las filas para la pantalla multi-observatorio.
- Los slugs de tema son únicos en todo el portal (llave de `obs_topics`).

## Decisiones aprobadas y abiertas

Aprobadas: `obs.js` en el mismo portal; dominios (gestor propone, administración aprueba lo externo); clave opcional con aviso; caché de 1 hora; primera entrega portada/tema/sección/visor (tableros y filtro cruzado después, con los huecos `filtrable/resaltar/cruzado/tips` en las opciones); aviso al despublicar; métricas sin cookies ni IP.

Abiertas: (1) las opciones `barra` y `fuente` ocultan por CSS la barra de acciones y la fuente de cada gráfica; `csv` no tiene efecto propio todavía (va con la barra). (2) El nivel Administrar crea observatorios con alcance «todos» (el prototipo decía «solo la administración»; se siguió la petición del usuario). (3) Revocar: Administrar o quien creó el insertado. (4) `data-tema/seccion/visor` del cargador solo documentan: el destino lo fija el insertado.

## Paquete O2: pantallas

### Rutas

| Ruta | Qué abre |
|------|----------|
| `/admin/observatorio/observatorios` | Panel **Observatorios**: lista con identidad, estado y conteos. |
| `/admin/observatorio/observatorios/<enlace>?tab=temas\|portada\|identidad\|responsables` | Un observatorio por dentro. |
| `/admin/observatorio/insertar[/<enlace>]` | Panel **Insertar y publicar**: registro y dominios del observatorio. |
| `/admin/observatorio/insertar/<enlace>?nuevo=portada\|tema&tema=<slug>` | Abre el editor «Insertar en otra página» ya apuntando a esa portada o tema (los botones «Insertar» de Observatorios usan esto). |
| `/datos-abiertos/observatorio/o/<enlace>` | Portada pública de un observatorio publicado (cualquiera, el principal incluido). |

Se llega a los dos paneles nuevos desde la franja de enlaces sobre las estaciones del taller; cada enlace aparece solo si el rol tiene el panel. Código en `publicar/`: `ObservatoriosPanel.tsx`, `InsertarPanel.tsx` (registro, dominios, «Cómo funciona»), `EditorInsertado.tsx` (opciones, vista previa, código), `registro.ts` (lógica pura), `ui.tsx` (ventana `<dialog>`, menú, avisos, movimiento GSAP) y `obsx.css`.

### Observatorios

- **Crear** (nivel Administrar con alcance «todos»): asistente de tres pasos; plantilla vacío, copia (líneas y fichas de temas como borradores, sin tablas ni visores) o desde Datos de Sostenibilidad (una línea por ODS y un tema por indicador de `ds_indicadores`). Quien edita se asigna como persona responsable.
- **Temas y líneas**: arrastre con puntero y tacto sobre el asa (la fila viaja con el dedo y las demás se abren paso con un FLIP corto); con teclado, asa enfocada y flechas (un lugar a la vez, cruza de línea al llegar al borde); y «Subir/Bajar un lugar» en el menú de cada tema. Crear, renombrar, subir y bajar líneas; crear tema (nombre, pregunta guía, fuente, línea, código), editar, duplicar (copia la ficha), publicar o pasar a borrador, archivar y restaurar. Despublicar o archivar algo con insertados pide confirmación y dice cuántos se afectan.
- **Mover** a otra línea u otro observatorio usa `obs_tema_mover` (0234): lleva también tablas, visores e insertados, con permiso de edición en ambos observatorios.
- **Portada pública**: vista previa en escritorio, tableta y teléfono de lo que verá el público (solo temas publicados y no archivados).
- **Identidad** (nombre, descripción, color, icono, oficina; el enlace no se cambia aquí) y **Responsables** (personas del directorio con `SelectorPersona`; interruptor «Proponer dominios»).

### Insertar y publicar

- **Registro**: búsqueda, filtro por estado (activo, pausado, revocado, vencido, sin publicar), vistas de 30 días con mini gráfica, dominios donde se ha visto (los que ya no están autorizados salen «bloqueado»), alertas cuando el contenido se despublica o archiva, y acciones copiar, editar (sube la versión), pausar o reanudar, duplicar (sin la clave) y revocar con confirmación dentro de la fila.
- **Dominios**: proponer (nivel Editar), aprobar, rechazar y retirar (Administrar); `*.udes.edu.co` es automático.
- **Editor**: pestañas Contenido, Apariencia, Filtros y Seguridad; código en script, iframe, enlace y pestaña de plataformas (WordPress, Joomla, HTML, solo iframe, enlace, SharePoint, Moodle, Google Sites) con «Copiar» (portapapeles con respaldo de selección). La clave se guarda con hash y **no se puede leer**: solo se ve completa en el código mientras el editor sigue abierto; el código copiado desde el registro no la lleva y el panel lo avisa.
- **Vista previa en vivo**: el `/obs-embed` real con `?previa=1&origen=@vista-previa`. El panel le manda la configuración por `postMessage` (mismo origen) y el marco pide el contenido a `obs_vista_previa` (0234), así que funciona también con un insertado aún sin guardar, no cuenta vistas y muestra solo lo publicado. «En una página de ejemplo» pone el marco en una página falsa con dominio elegible (uno no autorizado muestra el aviso de dominio), selector de ancho y simulación de estados: cargando, sin filas, error, dominio no autorizado, sin publicar, pausado, revocado, vencido y clave. Los estados simulados usan el mismo catálogo de textos que el marco real (`textoEmbed`).
- Guardar permite contenido todavía no publicado (el pie lo avisa); el registro marca esas filas como «Sin publicar».

### Portada pública multi-observatorio

`datos-abiertos/observatorio/catalogo.ts` (`useCatalogo`) superpone la base a la constante `OBS_TOPICS` sin cambiar el aspecto:

- **Sin migraciones, sin observatorios publicados o con error de lectura**: la lista, los datos y las rutas son exactamente las de antes.
- **Observatorio principal publicado**: `/datos-abiertos/observatorio` conserva los catorce temas en su orden y con sus cifras de ejemplo, pero toma de la base nombre, código, resumen, pregunta y fuente; un tema archivado o movido a otro observatorio sale, y los temas nuevos publicados se añaden al final (sin cifras de ejemplo: «Sin datos publicados»). Los temas en borrador no se ven en público (RLS), así que sus cambios llegan al publicar.
- **Más de un observatorio publicado**: el Hub añade la sección «Observatorios» con una entrada por cada uno; el principal sigue en `/datos-abiertos/observatorio` y los demás en `/datos-abiertos/observatorio/o/<enlace>` (líneas con nombre y sus temas). Los temas siguen en `/datos-abiertos/observatorio/<tema>` porque el enlace del tema es único en todo el portal.

### Cómo probar

1. Aplicar 0230 a 0234 en orden y desplegar el front. Sin ellas, los paneles nuevos muestran «Falta aplicar la migración …».
2. Observatorios: crear uno con la plantilla vacía, crear dos líneas y tres temas, reordenar con el ratón, con el dedo (herramientas de dispositivo táctil) y con teclado (Tab al asa, flechas); mover un tema al otro observatorio; cambiar color e icono; publicar y abrir `/datos-abiertos/observatorio/o/<enlace>`.
3. Insertar: desde un tema publicado con visores, «Insertar»; cambiar opciones y ver el marco; elegir el dominio no autorizado en la página de ejemplo; guardar, copiar el código y pegarlo en una página de prueba; pausar, despublicar el tema (debe salir la alerta) y revocar.
4. Con un rol de alcance «solo donde sea responsable», comprobar que solo se ven los observatorios asignados.

### Pendiente o por decidir

- Tableros, filtro cruzado, resaltar y detalle al pasar el cursor siguen deshabilitados en el editor (fase 2).
- El prototipo bloqueaba guardar contenido no publicado; aquí se permite con aviso y alerta en el registro.
- Las cabeceras de marcos de `vercel.json` siguen sin configurarse (ver arriba).
