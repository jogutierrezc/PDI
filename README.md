# Portal PDI · Universidad de Santander by Planeación Institucional 

Portal público y de administración del Plan de Desarrollo Institucional 2024-2028.
React 18 + TypeScript + Vite sobre **Supabase** (Postgres, Auth y Edge Functions).
El sistema de diseño es propio y vive en `src/styles/tokens.css`.

No queda ningún dato escrito a mano: todo lo que muestra el portal sale de la base
de datos.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # y rellena las dos variables
npm run dev
```

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Comprobación de tipos + compilación de producción |
| `npm run preview` | Sirve `dist/` como en producción |
| `npm run smoke` | Monta cada ruta en un DOM con un Supabase simulado y comprueba los datos |
| `npm run optimize:assets` | Regenera las imágenes optimizadas de `public/` |

---

# Base de datos

## Qué subir y en qué orden

Los archivos de `supabase/migrations/` se ejecutan **en orden numérico**. Puedes
pegarlos en el editor SQL del panel de Supabase o aplicarlos con la CLI
(`supabase db push`).

| Archivo | Contenido |
| --- | --- |
| `0001_schema.sql` | Tipos, 14 tablas, índices, restricciones y disparadores |
| `0002_rls.sql` | Funciones de autorización y políticas de seguridad por fila |
| `0003_views.sql` | Vistas derivadas (avance por pilar, resumen global, catálogos resueltos) |
| `0004_seed.sql` | Datos iniciales para que el portal funcione desde el primer despliegue |
| `0005_areas_y_proyectos.sql` | Retira `pillars.progress` y enlaza los proyectos con sus líneas de acción |
| `0006_edicion_y_trazabilidad.sql` | Indicadores y documentos dentro de la estructura + control de cambios automático |
| `0007_permisos_y_cache.sql` | Permisos de la API y recarga de su caché |
| `0008_cascada_de_avance.sql` | El avance se propaga del indicador al pilar |
| `0009_desarrollo_tecnologico.sql` | Catálogo de los desarrollos web de la oficina |
| `0010_metas_y_cumplimiento.sql` | Meta y avance absolutos + conteos del cuadro de mando |
| `0011_indicadores_por_anio.sql` | Unidad, línea base y serie anual del indicador + observaciones del pilar |
| `0012_cascada_anual.sql` | La cascada, año a año, y el indicador sin proyecto cuenta para su línea |
| `0013_modulo_de_proyectos.sql` | Proyectos transversales: formulación, vínculos a varios pilares, impactos y archivo en Storage |
| `0014_aporte_en_todos_los_vinculos.sql` | Un proyecto compartido lleva sus cifras a cada pilar al que aporta |
| `0015_presupuesto.sql` | Reporte anual de presupuesto y cierre del dinero al público |
| `0016_pdi_por_facultad.sql` | Facultades, sus planes de acción y el enganche con los pilares del PDI |
| `0017_pdi_por_campus.sql` | Estructura real del plan (21 áreas, 62 líneas) y lo que reporta cada sede |
| `0018_normalizar_estructura.sql` | Fusionar la estructura duplicada y retirar la de ejemplo |
| `0019_udes_en_cifras.sql` | UDES en Cifras: periodo global, campus, oficinas, informes, indicadores por periodos A y B con regla anual, años con dato, conjuntos visuales (varios por tipo: desgloses, evolución histórica, tuberías, mapas de calor, mapas), diseño de la ficha, trazabilidad y RLS |
| `0020_udes_en_cifras_datos_iniciales.sql` | Periodo 2020-2025 con los nueve informes y cifras **ilustrativas** (generada, no editar a mano) |
| `0021_desgloses_por_periodo.sql` | Desgloses por A/B y cifra anual; clave de guardado por periodo y años habilitados |

Todos son idempotentes: volver a ejecutarlos no duplica nada.

**Si ya habías aplicado una versión anterior de 0019/0020** (antes de los periodos A y B),
vuelve a ejecutar, en este orden, `0019`, `0020` y `0021`. La 0019 convierte lo que
había sin perder datos: los valores anuales pasan a periodo B, las cohortes de la tubería
de "2021" a "2021-A" y la tubería única queda con la clave `tuberia`. La 0020 completa el
periodo A de las cifras ilustrativas. Las tres son idempotentes y se probaron en
Postgres en base nueva y en base con la versión anterior.

Para actualizar los desgloses, aplica `0021_desgloses_por_periodo.sql` antes de
publicar la aplicación. Conserva los valores existentes como cifras anuales
independientes; A y B quedan sin reportar. En **Captura → Desgloses** se elige
la regla anual (suma, promedio, último periodo o reporte aparte). Los años se
habilitan en Captura con **Todos / Solo algunos**; en el portal, **Años visibles**
filtra la consulta sin cambiar la configuración guardada.

Antes de subir una migración, `npm run check:sql` avisa de las columnas que
referencia y no existen —el fallo que Supabase reporta como `column p.area_id
does not exist`, pero con el archivo y la línea—. No sustituye a aplicarla: no
ve el SQL dinámico, las vistas ni el orden de las sentencias.

> **Termina siempre con `0007`.** PostgREST guarda el esquema en una caché; sin
> recargarla, una tabla recién creada sigue dando 404 durante un rato.

### El disparador de auth.users

`0001` intenta crear un disparador en `auth.users` para que cada usuario nuevo
tenga su perfil automáticamente. En algunos proyectos el rol que ejecuta las
migraciones no es dueño de esa tabla y la operación falla.

La migración lo tiene previsto: en ese caso emite un **aviso** y continúa, en
lugar de tumbar la transacción. Si ves el aviso, todo lo demás se aplicó, pero
tendrás que fijar el rol a mano tras dar de alta a alguien:

```sql
update public.profiles set role = 'planeacion' where email = 'persona@udes.edu.co';
```

> **Requiere Postgres 15 o superior** (usa `NULLS NOT DISTINCT` y
> `security_invoker` en vistas). Cualquier proyecto de Supabase creado desde 2023
> lo cumple.

## Modelo

```
                       ┌───────────┐        ┌──────────────────┐
                       │ profiles  │───────<│  pillar_owners   │>──┐
                       │  (roles)  │        └──────────────────┘   │
                       └───────────┘                               │
                                                                   ▼
  report_periods        parameters                            ┌─────────┐
  (corte vigente)   (catálogos globales)──────┐               │ pillars │
                                              │               └────┬────┘
                                              │                    │
        ┌────────────┬───────────────┬────────┴──────┬─────────────┼──────────────┐
        ▼            ▼               ▼               ▼             ▼              ▼
  strategic_areas  indicators    activities      projects  pillar_observations  change_log
        │            (protocolos)      │               │       (lectura del avance)  glossary_terms
        ▼                              ▼               ▼                             documents
   action_lines               activity_targets   project_links                      (repositorio)
                          (meta / resultado por año,   (a qué pilares,
                            de donde sale el avance)    áreas y líneas)
```

`planning_items` sigue en la base con sus filas, pero ya no se muestra ni se
consulta: la sustituyeron los indicadores de resultado. Se puede retirar en una
migración futura.

**El avance no se guarda en ninguna columna: se propaga hacia arriba.** Cada
nivel es el promedio del nivel inferior, y el indicador es la hoja:

```
indicador   →  cumplimiento de su año más reciente (la hoja)
proyecto    →  promedio de sus indicadores, o su reporte si no tiene
línea       →  promedio de sus piezas,      o su reporte si no tiene
área        →  promedio de sus líneas
pilar       →  promedio de sus áreas, o de sus indicadores si no hay áreas
```

Las **piezas** de una línea son sus proyectos y los indicadores que cuelgan de
ella sin proyecto. Cada una pesa lo mismo. Un indicador que sí tiene proyecto ya
llega por él y no se cuenta dos veces.

Un proyecto cuenta en **cada línea a la que esté vinculado**. Si aporta a tres,
su porcentaje entra en el promedio de las tres: refleja que el trabajo empuja
los tres frentes, a cambio de que ese mismo avance pese tres veces en el total
del plan. Es una decisión deliberada, no un efecto secundario.

> Hasta la migración `0012`, la línea solo promediaba proyectos: un indicador
> colgado directamente de ella no movía nada, ni la línea, ni el área, ni el
> pilar. Aplicar `0012` puede cambiar el porcentaje de esas líneas — antes se
> ignoraban, ahora pesan.

Mover el avance de un proyecto sube por la línea, el área y el pilar hasta el
tablero, sin que nadie tenga que actualizar nada. Lo resuelven las vistas
`v_project_progress`, `v_line_progress`, `v_area_progress` y
`v_pillar_progress`; no hay columnas denormalizadas que puedan quedar
desincronizadas.

El reporte manual sigue existiendo como respaldo: una línea sin proyectos
conserva el porcentaje que valida el comité, y la intranet indica cuál de los dos
está mandando (`promedio de N proyectos` frente a `cumplimiento reportado`), para
que nadie edite un número que ya no se usa.

Aparte del avance, `v_pillar_progress` conserva los **conteos por estado** de los
indicadores: alimentan la barra apilada y las tarjetas del tablero, que responden
a otra pregunta —cuántos hay de cada clase— distinta de cuánto se ha avanzado.
Ese segundo número se llama `completion_rate`.

> Si en algún momento apareció una columna `pillars.progress`, era un síntoma de
> un fallo del formulario de la intranet, no una necesidad del modelo. La
> migración `0005` la retira. **No vuelvas a crearla**: guardar el porcentaje
> permitiría que el número del pilar y el de sus indicadores se separaran.

### La misma cascada, año a año

La cascada de arriba responde a "cómo va". Para responder a "cómo iba en 2024",
`0012` la recorre entera **para cada año**, con las mismas reglas aplicadas al
cumplimiento de ese año concreto:

```
v_activity_year → v_project_year → v_line_year → v_area_year → v_pillar_year
```

Los cinco se apilan en `v_year_progress`, con una columna `scope` que dice de
qué nivel es cada fila. Una tabla con una columna por año necesita el avance de
todas sus filas a la vez; con cinco vistas serían cinco peticiones por pantalla,
y así es una.

**Un año solo existe donde hay algo reportado.** Una línea cuyos proyectos aún no
han reportado 2026 no aparece con un cero en 2026: aparece sin 2026, y la
interfaz deja la celda en blanco. Un cero dicho por falta de datos se lee como
"no se cumplió", que es una afirmación distinta de "todavía no se sabe".

Las dos lecturas conviven en la misma tabla: las columnas por año son el
cumplimiento de cada corte, y la última columna —**acumulado**— es el estado
actual, con el último dato de cada indicador. No son la misma pregunta y por eso
no se sustituyen: un área con 2024 al 90 % y 2025 al 40 % tiene un acumulado del
40 %, y las tres cifras dicen algo que las otras dos no.

En el portal se ven en el cuadro de mando (una columna por año en las tres
tablas), en la ficha del pilar (el rastro anual bajo cada área, línea y proyecto)
y en **Configurar pilar → Metas y cumplimiento**.

### La barra de años y el avance del plan

El tablero, la página de implementación y la ficha del pilar llevan una **barra
de seis paradas**: el plan entero y sus cinco cortes. Todo lo que hay debajo la
sigue —el anillo, las tarjetas de pilar, las áreas, las líneas y los proyectos—,
y cada parada muestra ya su cifra, así que la barra es a la vez el filtro y el
resumen del quinquenio. En la ficha del pilar va junto al selector de áreas, y
al elegir un área pasa a hablar de esa área.

Arranca siempre en la posición del plan: quien abre el tablero busca la lectura
de conjunto, y una cifra de un año suelto pasaría por la del plan.

**El avance del plan pondera hasta el último año del horizonte.** Los cinco años
pesan lo mismo y los que todavía no se han reportado cuentan como cero, porque
todavía no están cumplidos:

```
   2024  85 %  × 20 %  =  17,0
   2025  72 %  × 20 %  =  14,4
   2026  sin reportar  =   0,0
   2027  sin reportar  =   0,0
   2028  sin reportar  =   0,0
                          ─────
   Avance del plan          31 %
```

Es una cifra deliberadamente más baja que el acumulado, y responde a otra
pregunta: **cuánto llevamos del plan**, no **cómo se cumplió lo comprometido
hasta ahora**. Un plan que va perfecto marca 40 % a finales de 2025, y eso es
correcto: le quedan tres años por cumplir. El acumulado sigue publicándose en el
cuadro de mando, en la última columna de sus tablas.

Las dos lecturas tratan el silencio de forma distinta, a propósito:

- **Un año concreto** promedia solo a quien lo reportó, y quien no lo reportó
  aparece en blanco, no en cero. Un cero por falta de datos se lee como "no se
  cumplió", que es otra afirmación. El anillo, en ese caso, muestra una raya y
  anuncia "sin reportar" también a los lectores de pantalla.
- **El plan** cuenta como cero los años no reportados de quien ya reporta: ahí
  el cero sí significa algo.

Y, como en el resto de la cascada, **una entidad que todavía no ha capturado
ningún año conserva su avance acumulado** en la posición del plan. Aplicarle la
ponderación la mandaría a cero de golpe el día que se aplica la migración, sin
que nada haya cambiado en su ejecución.

Los años del horizonte viven en `planYears`, en `src/data/pdi.ts`. Cambiar ese
arreglo cambia a la vez la rejilla de captura, las columnas de las tablas y el
divisor de la ponderación.

### El indicador de resultado y su serie anual

La hoja del modelo es la tabla `activities`. En la interfaz se llama **indicador
de resultado**, que es como lo nombra el reporte institucional; la tabla conserva
el nombre antiguo para no romper la trazabilidad ya escrita.

Un indicador tiene unidad de medida (referencia a `parameters`, categoría
`unidad`), línea base con su año, y una fila por año en `activity_targets`:

| Indicador | Unidad | Base 2023 | Meta 24 | Result. 24 | Cumpl. 24 | Meta 25 | … |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Convenios vigentes | Convenios | 28 | 40 | 34 | 85 % | 50 | … |

**El cumplimiento no se captura: es una columna generada.** Vale
`result_value / target_value`, salvo que se escriba un `compliance_override`,
que es lo que se usa en los indicadores de reducción, con tope, o los que ajusta
el comité. Al ser generada no puede quedarse desfasada respecto a las dos cifras
que tiene al lado.

**El avance del indicador lo fija el año más reciente con cumplimiento.** Lo hace
el disparador `activity_targets_sync_progress` sobre
`sync_activity_progress()`, y de ahí sube por la cascada hasta el pilar: el
número que se lee en la tabla y el que pinta el tablero son el mismo. Si el año
más reciente baja del 100 %, el estado `cumplida` baja a `curso` con él, porque
la base rechaza "cumplida al 94 %".

Mientras un indicador **no tenga ningún año capturado**, su porcentaje sigue
siendo el que se escribe a mano. Es lo que deja intactos los pilares cargados
antes de la migración `0011`.

Los años que se abren a captura son los del plan (2024-2028) y viven en
`planYears`, en `src/data/pdi.ts`. La base admite cualquier año entre 2000 y
2100: si alguien captura uno fuera del plan, las tablas lo muestran igual.

### El proyecto, y por qué es uno solo

Un proyecto es lo único transversal del plan: puede aportar al pilar de ambiente
tecnológico y al de apropiación social a la vez. Por eso se administra en su
propio módulo (`/admin/proyectos`) y no dentro de "Configurar pilar", que
siempre habla de uno.

Se amplió la tabla `projects` que ya existía en vez de crear otra al lado. Son el
mismo objeto —el que se formula y el que agrupa indicadores—; dos tablas
llamadas "proyecto" obligarían a capturar dos veces lo mismo y a decidir en cada
pantalla cuál de las dos se está mirando. La configuración del pilar sigue
listándolos, pero ya no los crea ni los edita: creado desde ahí, un proyecto
nacería atado a ese pilar y sin manera de vincularlo a otro.

Un proyecto lleva: título, fechas de inicio y finalización, programas o unidades
académicas, Objetivos de Desarrollo Sostenible, valor total, descripción corta,
los impactos declarados (tipo, plazo y justificación) y el documento que lo
formula.

**`project_links`** guarda a qué apunta: una fila por pilar, área y línea. El
primer vínculo es el **principal** y es el que hereda `projects.pillar_id`, que
decide quién puede editarlo; los demás son igual de reales para el avance y para
la visibilidad. La migración crea el vínculo de los proyectos ya cargados a
partir de su pilar y su línea, de modo que ninguno desaparece de su ficha.

Los ODS, los tipos de impacto y los plazos son listas cerradas en
`src/data/pdi.ts` y no catálogos de `parameters`: ninguna de las tres la decide
la universidad. Los ODS son los diecisiete de Naciones Unidas, con su color
oficial —que se usa como refuerzo del número, nunca como único dato.

Los impactos viajan como JSON dentro de la fila, igual que los autores de
`web_projects`: son una lista corta que solo se lee entera.

### El archivo del proyecto

Es lo primero que el portal guarda de verdad en lugar de enlazar. Vive en el
bucket **`proyectos`** de Supabase Storage, público en lectura —el documento que
formula un proyecto es del mismo tipo que lo que ya se publica en el
repositorio— y con escritura para `responsable` en adelante. Máximo 25 MB.

El nombre en Storage lleva delante el id del proyecto y un sello de tiempo, y va
sin tildes ni espacios porque forma parte de una URL; el nombre original se
conserva en `attachment_name`, que es el que se muestra. Al reemplazarlo se
borra el anterior: un archivo que ya no referencia nadie sigue ocupando la cuota.

Todo eso vive en `src/data/storage.ts` y en ningún otro sitio. Si la migración
no pudo crear el bucket —en algunos proyectos el rol que migra no es dueño de
`storage.objects`— la migración avisa y hay que crearlo a mano desde Storage.

### Observaciones del pilar

`pillar_observations` guarda la lectura cualitativa del avance: por qué un
indicador se quedó corto, qué se decidió en el comité, de qué depende lo que
falta. Cuelga del pilar y no del indicador porque es un balance del conjunto.

Cada observación puede anclarse a un año —"Corte 2025"— o quedarse sin año, y
entonces se lee como el estado vigente. Se escriben en **Configurar pilar →
Observaciones del pilar** y se publican en la ficha, debajo de la tabla de
indicadores. La sección no aparece si no hay ninguna: una sección vacía no
informa de nada.

En la página va solo el encabezado y dos líneas de adelanto; **el texto se lee en
su propia ventana**, justificado y con partición de palabras, al ancho de lectura
del modal (`size="reader"`, 46rem). Un balance de varios párrafos intercalado
entre dos tablas de cifras compite con ellas y no gana: o interrumpe la lectura
de la tabla, o se salta. Los saltos de línea dobles del formulario se respetan
como párrafos.

### Decisiones que conviene conocer

- **El color del pilar es un índice, no un hex.** `pillars.accent_slot` guarda
  1-6 y la aplicación lo traduce a `var(--pillar-N)`. El color vive en CSS
  porque el tema oscuro tiene su propia paleta validada; guardar el hex haría
  que el modo oscuro heredara colores pensados para fondo claro. La restricción
  limita el rango a 1-6: añadir un séptimo pilar exige re-validar la paleta para
  daltonismo antes de ampliarla.
- **`activity_status` es un enum, no un catálogo editable.** Cada uno de sus
  cuatro valores tiene asignado un color validado y un glifo (`✓ ◐ ○ ▲`).
- **Nivel, unidad y periodicidad son referencias a `parameters`**, no copias del
  texto: renombrar "Táctico" en el catálogo se refleja en todas partes, y
  borrarlo mientras está en uso falla en vez de dejar indicadores huérfanos.
- **Restricciones que impiden estados imposibles**: un indicador `cumplido`
  debe estar al 100 %; un `slug` solo admite minúsculas, números y guiones; una
  URL de documento debe empezar por `http`; solo puede haber un corte vigente;
  un indicador no puede tener dos filas del mismo año.

## Roles y permisos

| Rol | Lee | Edita | Publica | Usuarios |
| --- | --- | --- | --- | --- |
| *(anónimo)* | solo pilares publicados | — | — | — |
| `consulta` | toda la intranet | — | — | — |
| `responsable` | toda la intranet | **solo sus pilares asignados** | — | — |
| `planeacion` | toda la intranet | todos los pilares | sí | — |
| `admin` | toda la intranet | todos los pilares | sí | sí |

La asignación pilar-responsable vive en `pillar_owners` y se gestiona desde
**Gestión de pilares**.

**La autorización está en la base de datos, no en React.** Las políticas RLS de
`0002_rls.sql` deciden qué filas puede ver y tocar cada quien; la guarda de rutas
del frontend solo evita mostrar pantallas llenas de botones que no funcionarían.
Un `responsable` que abriera la consola del navegador y llamara a la API
directamente seguiría sin poder tocar un pilar que no es suyo.

Tres disparadores protegen lo que una política no puede:

- nadie que no sea `admin` puede cambiar su propio rol ni su estado;
- el portal no puede quedarse sin ningún administrador activo;
- solo Planeación puede cambiar el estado de publicación de un pilar.

## Variables de entorno

```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

La clave anónima es pública por diseño: viaja en el bundle y no concede nada por
sí sola. **La `service_role` key no debe aparecer nunca en `src/`**; solo la usa
la Edge Function, donde la inyecta la plataforma.

## Edge Function `admin-users`

Crear una cuenta exige la clave de servicio, que no puede vivir en el navegador.
La función verifica que quien llama es administrador y solo entonces la usa.

```bash
supabase functions deploy admin-users
```

Asignar un rol a alguien que ya existe **no** pasa por aquí: es un `UPDATE`
normal sobre `profiles` que las políticas ya limitan a administradores.

## Edge Function `sync-facultades`

Trae los planes de acción de las facultades desde su aplicación de Google, que
los publica como JSON:

```
GET ?action=list        → { ok, data: [ {facultad, decano, fase_actual, …} ] }
GET ?facultad=<CÓDIGO>  → { ok, found, row: { …, json_data: "<JSON del plan>" } }
```

```bash
supabase functions deploy sync-facultades
supabase secrets set FACULTY_SOURCE_URL="https://script.google.com/macros/s/<ID>/exec"
supabase secrets set FACULTY_SYNC_TOKEN="<una cadena larga y aleatoria>"
```

Se dispara desde **Sincronizar ahora** en `/admin/facultades` —con la sesión del
portal, si el rol es `planeacion` o superior— o con la cabecera `x-sync-token`
desde un cron.

**El portal tira del origen; no lo lee en cada visita.** La URL responde JSON y
admite cualquier origen, así que leerla desde el navegador parecía lo simple. No
lo es: cada visitante esperaría entre uno y tres segundos, sin caché, y la
página pública se quedaría en blanco cada vez que Google tarde. Sincronizando,
el portal sirve siempre lo último que trajo y una caída del origen se nota en la
intranet, donde alguien puede hacer algo.

**La sincronización no pisa lo que decidió el portal.** Cada acción se reconoce
por el identificador que le puso el origen (`source_id`, del estilo `d1_2`)
dentro de su facultad. Se actualiza lo que la facultad escribe; se quedan
intactos `status`, `note`, `area_id` y `action_line_id`. Tampoco borra: una
acción que desaparece del origen se reporta en el informe de la corrida y se
deja como está.

### El enganche con el PDI

El plan de la facultad no conoce el PDI salvo por un campo: cada acción declara
su pilar como texto. Esos textos **coinciden exactamente** con `pillars.name`
—"Gobernanza para el buen gobierno", "Personalización", "Ambiente tecnológico",
"Sostenibilidad", "Apropiación social"—, así que el disparador
`faculty_action_fill` los resuelve por igualdad y guarda además el texto
original en `declared_pillar`: si mañana el origen cambia una etiqueta, se ve
cuál dejó de casar en vez de perderse en silencio.

Lo que no case aparece en rojo en `/admin/facultades` y no se puede publicar
(`faculty_actions_pillar_before_publish`). Se resuelve anclando la acción a una
línea de acción del plan, que rellena el área y el pilar hacia arriba.

El área estratégica y la línea de acción son un refinamiento opcional: el origen
no las pide, y exigirlas dejaría el módulo vacío esperando un dato que nadie
está capturando.

## Primer administrador

El disparador `handle_new_user` crea el perfil con rol `consulta`, así que el
primer usuario hay que ascenderlo a mano una sola vez:

1. Crea el usuario en el panel de Supabase (**Authentication → Add user**).
2. En el editor SQL:

```sql
update public.profiles
set role = 'admin', full_name = 'Nombre Apellido'
where email = 'tu.correo@udes.edu.co';
```

A partir de ahí, el resto de altas se hacen desde **Usuarios y roles**.

---

# Rutas

| Ruta | Pantalla | Acceso |
| --- | --- | --- |
| `/` | Portada | Público |
| `/tablero` | Tablero de cumplimiento | Público |
| `/tablero/pilar/:slug` | Cuadro de mando de un pilar | Público |
| `/implementacion` | Avance por pilar + repositorio documental | Público |
| `/implementacion/pilar/:slug` | Ficha del pilar, con filtro por área estratégica | Público |
| `/facultades` | PDI por facultad: matriz facultad × pilar e índice de facultades | Público |
| `/facultades/:slug` | Plan de acción de una facultad, por dimensiones | Público |
| `/desarrollo-tecnologico` | Desarrollos web de la oficina | Público |
| `/datos-abiertos` | UDES en Cifras: portada con vídeo y tablero de los nueve informes | Público |
| `/datos-abiertos/:informe` | Ficha de un informe: cifras clave, evolución, campus, desgloses, tabla y CSV | Público |
| `/acceso-intranet` | Inicio de sesión | Público |
| `/admin/pilares` | Gestión de pilares y responsables | `consulta`+ |
| `/admin/pilares/:slug/configurar` | Áreas, líneas, indicadores, observaciones y soportes | `consulta`+ |
| `/admin/proyectos` | Proyectos del plan: formulación, vínculos a varios pilares, impactos y archivo | `consulta`+ |
| `/admin/facultades` | Sincronizar con el origen, revisar el enganche y publicar | `consulta`+ (edita `planeacion`+) |
| `/admin/campus` | Cargar el libro de indicadores por campus | `consulta`+ (edita `planeacion`+) |
| `/admin/estructura` | Fusionar áreas y líneas duplicadas, retirar las de ejemplo | `consulta`+ (edita `planeacion`+) |
| `/admin/presupuesto` | Reporte anual de presupuesto por proyecto | `consulta`+ |
| `/admin/parametros` | Catálogos globales | `consulta`+ |
| `/admin/desarrollo` | Proyectos web y sus autores | `consulta`+ |
| `/admin/usuarios` | Usuarios y roles | `admin` |
| `/admin/udes-en-cifras/:estacion/:informe` | UDES en Cifras: periodo, estructura y KPI, captura, diseño visual y publicación | `consulta`+ (edita `planeacion`+) |
| `/sin-permiso` | Rol insuficiente | Autenticado |
| cualquier otra | Página 404 | Público |

Las pantallas de intranet son legibles desde `consulta` y muestran un aviso de
solo lectura; los controles de edición aparecen según el rol.

## Trazabilidad automática

Cada alta, actualización y baja de un **proyecto** o de un **indicador** deja su
propia entrada en el control de cambios, con la versión correlativa (`1.0`,
`1.1`, `1.2`…), quién la hizo y qué cambió en concreto —"Avance 60 % → 75 %",
"Estado pendiente → curso", "Se destacó en el tablero público"—.

Lo hacen disparadores en la base de datos y no el código de React, por dos
razones: el registro es atómico con el cambio que documenta (no puede guardarse
el proyecto y perderse su traza), y ocurre igual venga de la intranet o de una
llamada directa a la API.

Reordenar una lista o corregir una descripción no genera entrada: solo lo que
cambia el sentido del registro (avance, estado, nombre, responsable, fecha,
línea, y en indicadores también el destacado). Guardar la serie anual cambia el
avance del indicador, así que también deja su entrada.

Las entradas automáticas **no se pueden editar** desde la intranet —reescribir
una traza destruye el registro de lo que pasó—; el botón de edición solo aparece
en las que se registraron a mano. Esas siguen sirviendo para lo que se decide
fuera del portal: actas, avales y reformas del protocolo de medición.

## Qué se edita desde la intranet

En **Configurar pilar** se crean, editan y eliminan áreas estratégicas, líneas de
acción, indicadores de resultado, observaciones y documentos de soporte. Los
proyectos se listan ahí pero se administran en **Proyectos**, porque uno puede
apuntar a varios pilares. Los formularios sirven para las dos cosas: al abrirlos sobre una fila
llegan rellenos con sus valores.

El formulario del indicador incluye la **rejilla de metas por año**: una fila por
corte del plan, con meta y resultado uno al lado del otro y el cumplimiento
calculándose mientras se escribe. Un año sin ninguna de las tres cifras es un año
no reportado, no un año en cero: no se guarda, y si estaba guardado se borra.
Guardar el indicador escribe también su serie anual —el formulario resuelve las
dos tablas en una sola operación.

Proyectos, indicadores y documentos eligen su **línea de acción** en un
desplegable agrupado por área. En los documentos hay además un selector de área:
si se elige una línea, su área manda sobre él, de modo que un soporte nunca queda
colocado en dos sitios a la vez.

## El filtro por área en la ficha del pilar

El selector de la barra pegajosa recorre las **áreas estratégicas** del pilar.
Al elegir una:

- la ficha pasa a describir el área —pilar, acción y su descripción— con su
  avance, sus líneas y sus proyectos, en lugar del indicador del pilar;
- se retiran el presupuesto y el tiempo transcurrido, que miden el indicador
  completo y no el área;
- se filtran los proyectos y el desglose de líneas.

El control de cambios **no** se filtra: es la historia del pilar entero.

La sección **Indicadores de resultado** ocupa el lugar de la antigua "Planeación
de resultados". Es la tabla del reporte institucional: unidad, línea base y, por
cada año del plan, meta, resultado y cumplimiento. El año que fija el avance del
indicador va marcado, porque de los cinco cortes solo uno llega al pilar.

Debajo, **Observaciones sobre los indicadores** publica el balance cualitativo
del pilar, si lo hay.

Sin filtro, la sección **Áreas estratégicas del pilar** muestra una rejilla con
el avance de cada una —el promedio del cumplimiento reportado de sus líneas— y
cada tarjeta funciona también como filtro.

Cada proyecto muestra además su cadena completa —pilar › área › línea de
acción—, de modo que la estructura del plan se lee en la propia página y no solo
en la base de datos.

Un proyecto sin `action_line_id` no pertenece a ningún área y por tanto no
aparece al filtrar. Tanto el visor público como la configuración de la intranet
lo señalan en vez de dejarlo desaparecer sin explicación; se le asigna una línea
desde **Configurar pilar → Proyectos estratégicos**.

## Dos lecturas del mismo pilar

| | `/implementacion/pilar/:slug` | `/tablero/pilar/:slug` |
| --- | --- | --- |
| Pregunta | Qué es el pilar y qué hay dentro | Cuánto se ha cumplido |
| Contenido | Protocolo de medición, áreas, proyectos, indicadores, observaciones, trazabilidad | Convención de bandas, cuatro resultados generales y cuatro tablas |
| Se llega desde | Implementación del PDI | Tablero PDI |

Las dos enlazan entre sí, así que nadie queda atrapado en una.

### Bandas de cumplimiento

Cinco tramos con nombre: **Bajo** (0-24 %), **Medio bajo** (25-49), **Medio**
(50-69), **Medio alto** (70-89) y **Satisfactorio** (90-100). Los umbrales viven
en `complianceBands`, en `src/data/pdi.ts`, y en ningún otro sitio.

La escala va de naranja a verde, que es justo el par que **no** distingue el
daltonismo. Por eso se apoya además en la luminosidad —baja de forma monótona de
L 0,74 a L 0,46, con saltos de 0,07— y se verificó con el validador ordinal:
monotonía, salto suficiente entre bandas y contraste del extremo claro. En
greyscale la escala sigue leyéndose.

Y sobre todo: **ningún porcentaje se comunica solo con color.** Cada ficha lleva
la cifra y el nombre de su banda; la convención está en la propia página; la
banda del pilar actual se marca con texto, no solo resaltando su fila.

### Meta y avance

`strategic_areas`, `action_lines` y `projects` tienen `target_value`,
`achieved_value` y `measure_unit` para capturar metas absolutas ("28 de 40
convenios"). Son opcionales.

Se configuran en **Configurar pilar → Metas y cumplimiento**, una tabla que
reúne cada área con sus líneas y muestra meta, avance y cumplimiento de un
vistazo, con un botón de edición por fila. Usa el mismo aspecto que el cuadro de
mando público a propósito: se configura viendo lo que se va a publicar. Los
proyectos llevan sus metas en su propio formulario.

El **cumplimiento no se escribe** en esa tabla: el del área sale de sus líneas y
el de la línea, de sus proyectos. Cada fila dice de dónde viene su porcentaje
—"promedio de 3 líneas", "cumplimiento reportado"— para que nadie edite un
número que no se está usando.

Mientras no se capturen, las columnas **Meta** y **Avance** de las tablas cuentan
indicadores —comprometidos y cumplidos—, y la tabla lo dice al pie. El
**porcentaje** es siempre el avance en cascada, venga de donde venga la meta: una
sola fuente para toda la aplicación.

No hay que confundirlas con la meta anual del indicador: aquellas son el
compromiso agregado del área, la línea o el proyecto —"28 de 40 convenios"— y
estas son la serie que se reporta cada año. Las primeras se escriben; las
segundas se calculan y son las que mandan.

## Desarrollo tecnológico

`web_projects` es un catálogo aparte: son las herramientas que construye la
oficina, no proyectos del plan. Por eso no cuelgan de ningún pilar y su edición
es de `planeacion` en adelante, sin entrar en el reparto por responsable.

Cada proyecto lleva nombre, descripción, enlace público, tipo de repositorio
(GitHub o Repositorio UDES), enlace del repositorio y una lista de autores con
nombre y cargo. Solo los que están en estado **publicado** salen en la página
pública.

Los autores van en una columna `jsonb` y no en una tabla hija: son una lista
ordenada que solo existe dentro de su proyecto, no se consultan por separado ni
se enlazan con perfiles. Así el alta, la edición y el borrado son una sola
operación. A cambio la base no puede imponer columnas, y eso lo cubre la función
`web_project_authors_ok`, que exige que cada elemento sea un objeto con
`full_name` no vacío.

# Datos Abiertos · UDES en Cifras

Portal estadístico aparte dentro del mismo código (`src/modules/datos-abiertos/`):
cabecera, marca y pie propios, sin la navegación del PDI. Nueve informes —Poblacional,
Permanencia, Visibilidad, Enseñanza, Extensión y Proyección Social, Investigación,
Infraestructura Física y Tecnológica, UDES Sostenible y Plan de Desarrollo Institucional—.

**El portal lee la base.** `useOpenDataCatalog()` (`data/open-data.ts`) pide las tablas
`od_*` con `data/repository.ts` y las arma en el catálogo que consumen las pantallas.
Muestra el periodo vigente y publicado, y solo sus informes publicados. Con
`?vista-previa` en la URL, alguien con sesión de intranet ve también los borradores. Sin
periodo publicado, la página lo dice en lugar de quedar en blanco.

## El modelo en la base (0019)

```
od_periods ─┬─ od_period_campuses          campus que cubre el periodo (enlaza a campuses)
            └─ od_reports ─┬─ od_indicators ── od_values (año × periodo A/B × campus; campus NULL = total)
                           ├─ od_breakdowns ── od_breakdown_values (año × periodo × categoría)
                           ├─ od_histories ─── od_history_values (periodo "2020-A" × categoría)
                           ├─ od_heatmaps ──── od_heatmap_cells
                           ├─ od_maps ──────── od_map_values (año × campus × departamento DANE)
                           ├─ od_pipelines ─── od_pipeline_values (cohorte "2014-A" × campus × etapa)
                           └─ od_report_blocks  orden, visibilidad y ajustes de la ficha
od_offices        oficinas fuente ("Reporta:")
od_imports        rastro de cada carga: rejilla, pegado o plantilla
od_publications   rastro de cada publicación (lo escribe un disparador)
```

- **El periodo es global.** Un periodo vigente (2020-2025) para todos los informes. Sus
  años son las columnas de la captura, y un valor fuera de ellos se rechaza en la base.
  `od_copy_period()` abre el siguiente y copia la estructura: informes, indicadores con
  sus KPI, conjuntos y diseño. No copia cifras.
- **Periodos A y B.** Cada indicador se captura por periodo académico de cada año
  (`od_values.term`). La cifra del año no se guarda: sale de A y B según
  `annual_rule` del indicador: `suma` (graduados, primer ingreso), `ultimo` (matrícula,
  docentes: el B, o el A si falta el B), `promedio` (tasas) o `reportado` (se captura
  en su propia columna, periodo `anual`). La regla vive en `data/terms.ts` y la usan a la
  vez el portal y la rejilla de captura. En el portal, **Periodo: Año · A · B** cambia el
  corte de toda la ficha (`?periodo=B`), y el boleto dice de dónde sale la cifra del año
  ("A + B", "periodo B").
- **Años con dato.** Indicadores, desgloses y mapas tienen `years`: `NULL` es "todos los
  del periodo"; una lista deja fuera los años sin reporte. Se ajusta en Estructura y KPI
  y en Captura (**Años con dato**). Ni la captura ni las gráficas pintan años fuera.
- **Conjuntos a elección.** Un informe puede tener varios conjuntos de cada tipo. Al crear
  uno, entra solo a la ficha como bloque visible (antes había que añadirlo en Diseño
  visual, y por eso una tubería recién creada no se veía). Borrar un conjunto borra su
  bloque (disparador).
- **Tuberías.** Cada tubería es **un solo flujo de cohortes reportado junto**, con su
  rango histórico (`2014-A a 2023-B`), que se indica en Captura. Cada una elige qué se
  captura: `estudiantes` que siguen, `permanencia` (% del flujo que sigue) o `desercion`
  (% que se retira en cada tramo). El portal siempre la muestra como deserción acumulada
  en % (componente `LeakyPipeline`). Los porcentajes admiten decimales (12,5) y, con
  porcentajes, el total institucional se captura: no se suma. Si una base trae varias
  cohortes de la versión anterior, Captura trabaja la más completa y ofrece quitar las demás.
- **Evolución histórica.** La cifra en los periodos que se elijan (2020-A: 14.324 →
  2025-B: 8.888) con sus categorías (pregrado, posgrado). El portal compara dos periodos
  con la variación, el % de cada categoría frente al total y la serie completa.
- **Vacío no es cero.** Un valor ausente es `NULL` y el portal lo pinta "sin reportar".
- **El total institucional** es la fila con `campus_id` NULL. Si el indicador agrega por
  `suma`, el portal suma los campus cuando no se capturó. Si agrega por `reportado`
  (tasas, promedios), se captura aparte.
- **KPI.** `is_kpi` y `kpi_position` ordenan el tablero de indicadores. `is_headline` es la
  cifra titular del informe, única por informe (índice único).
- **Seguridad.** El público lee solo lo publicado. `consulta` en adelante lee todo, y solo
  `planeacion` y `admin` escriben.

**La semilla (0020) es ilustrativa y se genera**:

```bash
node scripts/build-od-seed.mjs
```

El comando lee `src/modules/datos-abiertos/data/seed/` y escribe la migración `0020` más
`scripts/fixtures/udes-en-cifras.json`, que usa la prueba de humo. Deja el periodo
marcado como ilustrativo. Cuando lleguen las cifras oficiales, se cargan desde la intranet
y se desmarca "Cifras ilustrativas" en la estación Periodo y campus.

## La intranet: estaciones del periodo

`/admin/udes-en-cifras` organiza el trabajo en cinco estaciones fijas. La barra superior
dice cuánto le falta a cada una. La lista de la izquierda marca cada informe en cada
estación.

1. **Periodo y campus**: años, fecha de corte, marca de cifras ilustrativas, estado de
   publicación, campus cubiertos, oficinas fuente y apertura del periodo siguiente.
2. **Estructura y KPI**: ficha del informe (nombre, código, color de línea, textos,
   imagen), indicadores, tablero de KPI con titular y conjuntos visuales.
3. **Captura**: rejillas por indicador × campus × año con sus columnas A, B y la cifra del
   año (calculada, o editable si se reporta aparte), y también para desgloses, evolución
   histórica, mapas de calor, mapas y tuberías (cohortes por rango de periodos). Al pegar
   desde Excel se saltan las columnas calculadas. Se escribe casilla por casilla, se pega un rango de Excel o se
   sube la plantilla CSV, con vista previa de cada cambio antes de pasarla a la rejilla.
   Nada se guarda sin pulsar Guardar, y cada guardado queda en `od_imports`.
4. **Diseño visual**: orden de los bloques de la ficha (arrastrando o con flechas),
   visibilidad, título propio y gráfica con la que abre la evolución.
5. **Publicación**: lo que falta, las cifras que cambiaron desde la última publicación y la
   vista previa. Desde aquí se publica o se retira cada informe, con su bitácora. Publicar,
   retirar o cambiar el estado pide confirmar en el mismo sitio.

**Publicar no es una zona de espera.** Solo Planeación edita, así que lo que se guarda en un
informe ya publicado se ve en el portal de inmediato; la estación lo dice así ("ya visibles
en el portal"). Para cargar sin exponer cifras, pasa el informe a borrador primero.

El menú de la intranet se agrupa por portal: Plan de Desarrollo, UDES en Cifras y
Sistema. La cabecera lleva la ruta (portal › pantalla).

## El portal

- **Corte y campus viajan en la URL** (`?corte=2024&campus=cucuta`; `?sede=` sigue
  funcionando): un enlace compartido abre el tablero o la ficha tal como se veía.
- **Cada cifra lleva su boleto**: oficina que la reporta, campus y corte, y debajo el corte
  anterior con su variación (las tasas en puntos porcentuales, los conteos en porcentaje).
- **Desgloses a todo el ancho.** Cada desglose ocupa su fila. Los periodos A y B se
  muestran por separado, como se reportaron (2024-A, 2024-B); la cifra del año solo
  aparece donde se reportó como año, así nada se suma dos veces. Vistas: circular y
  barras de un corte (con selector 2024-A / 2024-B / 2024 si ese año tiene varios),
  composición al 100 % por corte, líneas y líneas y barras.
- **Cada gráfica se descarga como imagen.** Los botones PNG y JPG del panel generan la
  imagen tal como se ve (html-to-image), sin los controles y con un sello de procedencia
  y fecha. Ver `components/chart-export.ts`.
- **La ficha pinta sus bloques** en el orden y con la visibilidad que decide la intranet.
  Un bloque sin datos no se pinta.
- **La ficha descarga un CSV** con punto y coma y BOM, que Excel en español abre directo.

**Gráficas de la ficha**, todas animadas al entrar en pantalla e interactivas (tooltip,
clic, teclado), cada una con su fuente al pie:

| Componente | Qué muestra |
| --- | --- |
| `KpiBoard` | Todos los indicadores del informe con variación, rastro de cortes y boleto |
| `LineChart` | Evolución por campus (paleta validada para daltonismo) con total punteado |
| `Donut` | Desgloses y reparto por campus, con leyenda de cifra y porcentaje |
| `Pipeline` | Tubería con fugas: la deserción de una cohorte, tramo a tramo (Permanencia) |
| `ColombiaMap` | Origen de estudiantes y cobertura por departamento, con flujos hacia cada campus |
| `Heatmap` | Mapa de calor en escala azul, por matriz o por fila |
| `PivotTable` | Tabla dinámica: indicador, campus y año en filas, columnas o fijo; CSV de la vista |

Mapas, mapas de calor y tubería salen de sus tablas (`od_maps`, `od_heatmaps`, `od_pipelines`).
Sus cifras de ejemplo se generaron con reglas deterministas en `data/seed/visual-data.ts`. `data/colombia-map.ts` sale de la cartografía
departamental del DANE proyectada y simplificada; no se edita a mano.

El portal sigue el tema claro/oscuro del sitio: el tablero cambia de paletas blancas con
tinta azul marino a azul noche con tinta blanca.

El tablero es de paletas partidas (`components/SplitFlap.tsx`): las cifras voltean al
entrar en pantalla y al cambiar de corte o campus. Con `prefers-reduced-motion` se escriben
directamente. Las imágenes de `public/datos-abiertos/` son fotogramas del vídeo
institucional, provisionales hasta tener fotografía oficial; su procedencia está en el
`.json` que acompaña a cada una. El vídeo de portada corta el bucle en el segundo 39,2,
antes del cierre rosa del archivo.

# Estructura del código

```
src/
  styles/tokens.css    Sistema de diseño: color, tipografía, espacio, forma, movimiento
  styles/base.css      Reset, primitivas compartidas, cabecera, pie y estados de carga
  styles/app.css       Portada, tablero, buscador y 404
  types/database.ts    Contrato con el esquema (regenerable con `supabase gen types`)
  lib/supabase.ts      Cliente y llamada a la Edge Function
  lib/auth.tsx         Sesión, perfil y jerarquía de roles
  data/queries.ts      Qué columnas pide cada pantalla + claves de caché
  data/mutations.ts    Escrituras y qué invalidan
  data/pdi.ts          Traducción de la base de datos a la interfaz (colores, glifos, formatos)
  components/ui/       Icon, ProgressRing, StackedProgress, FilterChips, Modal, SearchDialog, QueryState
  components/layout/   TopBar, PublicLayout, ScrollManager
  routes/              Home, Dashboard, NotFound/Forbidden
  modules/landing/     Bloques narrativos de la portada + su contenido editorial
  modules/facultades/  PDI por facultad: índice con la matriz y plan de cada facultad
  modules/             implementation, pillar-viewer, ods, login, admin
supabase/
  migrations/          El esquema, en orden
  functions/           Edge Functions
scripts/               Prueba de humo y optimización de imágenes
```

Después de guardar en la intranet, las claves de caché declaradas en
`pillarScope()` invalidan a la vez el tablero público y la ficha del pilar: es lo
que evita que la intranet muestre un dato ya editado y el portal el anterior.

## La portada y su contenido editorial

Los bloques narrativos de la portada —barra de contexto, el contraste entre el
modelo que se supera y el del plan, la vocación de cada sede, el selector de ruta
y la sala de recursos— viven en `modules/landing/`. El texto está separado de los
componentes en `modules/landing/content.ts`: lemas, cifras del diagnóstico,
vocaciones regionales y rutas por perfil se editan ahí, sin tocar JSX.

Lo que sí es dato sigue viniendo de Supabase: el avance de cada pilar, los
indicadores, los pilares que recomienda el selector de ruta y los documentos de
la sala de recursos. La narrativa se engancha a los pilares **por `slug`**, así
que un pilar sin entrada en `pillarNarratives` se pinta igual, solo que sin lema
ni etiquetas.

Las cifras de `planFigures` (6 pilares, 21 áreas, 61 líneas, 3 sedes) describen
el **documento aprobado**, no el seguimiento: no cambian con el corte del mes y
por eso no salen de la base.

**Ninguna cifra de dinero entra en este archivo.** La portada es pública y la
migración 0015 ya cierra el presupuesto a `anon` en la base; escribirlo a mano en
el texto editorial lo volvería a publicar por la puerta de al lado. La prueba de
humo comprueba la portada contra `SIN_DINERO`, y además contra «billones» y
«USD», que son las dos formas en que se había colado.

**El selector "tu ruta"** vive aparte, en `modules/landing/route-content.ts`,
porque es con diferencia lo más largo de la portada: siete perfiles por siete
intereses, cuarenta y nueve cruces.

El interés dice qué pone en marcha el plan —igual para todo el mundo, porque el
plan es uno solo— y `routeMatrix[perfil][interés]` dice qué significa eso para
quien pregunta: «emprender» no quiere decir lo mismo para un aspirante que para
una directiva que tiene que sostenerlo. Los siete intereses están escogidos para
que los seis pilares sean la respuesta principal de alguno: ninguno se queda sin
puerta de entrada.

Los perfiles incluyen a quien ejecuta el plan y a quien lo decide —personal
administrativo y directivos—, no solo a quien estudia o contrata: el PDI lo
sostiene gente que antes no se veía reflejada en esta pantalla.

Una casilla que falte no rompe nada: el componente muestra el resto del resultado
sin esa línea, así que añadir un perfil no obliga a escribir sus siete cruces
antes de publicarlo. Los pilares y los ODS del resultado no se escriben nunca:
salen de los proyectos publicados.

`landing.css` se importa desde `main.tsx`, no desde `Home.tsx`. La portada no se
carga bajo demanda, así que su hoja viaja en el bundle principal de todas formas;
importarla desde el componente la colocaba *antes* que `base.css`, y `.card`
acababa pisando el relleno y el fondo de sus bloques.

# Sistema de diseño

Los tokens de `tokens.css` son la única fuente de valores. Ninguna hoja de
estilos declara un color, un radio o una duración a mano.

**Tema claro y oscuro.** Tres estados: claro, oscuro y "según el sistema". La
elección se guarda en `localStorage` y se aplica en `index.html` antes del primer
pintado, así que no hay destello blanco al recargar en oscuro.

**Paleta de pilares.** Los seis acentos están verificados con el validador de
paletas: banda de luminosidad, croma, separación bajo daltonismo en *todos* los
pares (no solo los contiguos), y contraste ≥ 3:1 sobre la superficie. La paleta
anterior fallaba: rojo y verde quedaban a ΔE 6,0 bajo deuteranopía, es decir,
indistinguibles. Además, cada pilar lleva siempre su nombre y su ícono, de modo
que la identidad nunca depende solo del color.

**Colores de estado.** Verde, azul, ámbar y rojo no son separables bajo
daltonismo por definición, así que viajan siempre con un glifo (`✓ ◐ ○ ▲`) y su
etiqueta.

**Colores de los ODS.** Los diecisiete son los oficiales de Naciones Unidas y no
se pueden cambiar, así que el objetivo se identifica por su **número**, nunca por
su tono: diecisiete colores no se separan bajo daltonismo de ninguna manera. Cada
objetivo lleva además su tinta en `sdgGoals[].ink`, porque diez de los diecisiete
no llegan a 4,5:1 con texto blanco —el amarillo del objetivo 7 se quedaba en
1,62:1—. La tinta es un valor fijo y no un token: el fondo es el color de la ONU
en los dos temas, así que la tinta tampoco puede cambiar con el tema.

**Movimiento.** Curvas propias (`--ease-out`, `--ease-in-out`, `--ease-drawer`)
porque las nativas de CSS son demasiado tibias. Duraciones por debajo de 300 ms
en todo lo que es interfaz. Los efectos de `:hover` van dentro de
`@media (hover: hover)` para que un toque en móvil no los dispare, y
`prefers-reduced-motion` retira el desplazamiento conservando color y opacidad.

# Recursos estáticos

- Reemplaza `public/logo-udes.svg` por el logotipo oficial. Se usa en la
  cabecera, el inicio de sesión, la administración y como favicon.
- `public/udesback.webp` y `public/og-card.jpg` se generan desde
  `assets-source/udesback.png` con `npm run optimize:assets`. No los edites a
  mano: cambia el original y vuelve a ejecutar el script.

### Pendiente: el vídeo de portada

`public/Multimedia1.mp4` pesa **15 MB**, mucho más que todo el resto del sitio
junto. El código ya lo mitiga —solo se descargan los metadatos hasta que el
vídeo entra en pantalla, se pausa al salir y no se descarga en absoluto con
`prefers-reduced-motion`— pero conviene recodificarlo. Con ffmpeg instalado:

```bash
ffmpeg -i public/Multimedia1.mp4 -vf "scale=1600:-2" -c:v libx264 -crf 28 \
  -preset slow -profile:v high -pix_fmt yuv420p -an -movflags +faststart \
  public/Multimedia1.mp4.tmp && mv public/Multimedia1.mp4.tmp public/Multimedia1.mp4
```

`-an` quita la pista de audio (el vídeo se reproduce silenciado) y
`-movflags +faststart` mueve el índice al principio para que empiece a
reproducirse antes de terminar de descargarse. Con eso debería quedar entre 1,5
y 3 MB.

# Publicación

Es una aplicación de una sola página: el servidor debe devolver `index.html`
para cualquier ruta que no sea un archivo, o `/tablero` dará 404 al recargar.

- **Netlify** — ya incluido en `public/_redirects`
- **Vercel** — `vercel.json` con un *rewrite* de `/(.*)` a `/index.html`
- **Apache** — `RewriteRule . /index.html [L]` en `.htaccess`
- **Nginx** — `try_files $uri $uri/ /index.html;`
- **GitHub Pages** — copia `dist/index.html` a `dist/404.html`

Recuerda añadir la URL de producción en **Authentication → URL Configuration**
de Supabase, o los enlaces de invitación y de recuperación de contraseña
apuntarán a `localhost`.

# Si la API devuelve 404

Síntoma: la pantalla dice *"La base de datos todavía no tiene las tablas del
portal"* y la consola muestra
`Could not find the table 'public.…' in the schema cache`.

No es un problema de las variables de entorno: si la URL o la clave estuvieran
mal, la respuesta sería 401, no 404. Ese 404 significa que PostgREST no
encuentra el objeto en su caché de esquema, y eso ocurre por dos motivos.

**1. Las migraciones no llegaron a aplicarse.** El editor SQL de Supabase
ejecuta cada script dentro de una transacción: si una sola sentencia falla, se
revierte el script entero y no queda ni una tabla. Por eso fallan a la vez
`pillars`, `activities` y las vistas.

**2. La caché de la API está vieja o falta un permiso.** Sin `SELECT` para el rol
`anon`, PostgREST ni siquiera incluye el objeto en su caché y responde 404 en
lugar de 401.

Para distinguirlas, ejecuta **`supabase/diagnostico.sql`** en el editor SQL. Te
dice cuántas tablas, vistas, políticas y disparadores existen, quién puede
leerlas y cuántas filas hay.

- Si dice **0 tablas** → vuelve a aplicar las migraciones en orden y mira el
  panel de mensajes por si alguna sentencia falló.
- Si están todas pero la API sigue en 404 → ejecuta
  **`0007_permisos_y_cache.sql`**, o pulsa *Reload schema cache* en
  Settings → API.

# Despliegue en Vercel

`vercel.json` ya trae la reescritura que necesita una aplicación de una sola
página y el cacheado de los recursos con huella.

Dos cosas que hay que configurar en el panel de Vercel:

1. **Variables de entorno** — `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
   Vite las inserta *en el momento de compilar*, no en tiempo de ejecución: si
   las añades después, hay que volver a desplegar para que surtan efecto.
2. **URLs en Supabase** — añade tu dominio en Authentication → URL
   Configuration (*Site URL* y *Redirect URLs*), o los enlaces de invitación y
   de recuperación de contraseña seguirán apuntando a `localhost`.

# Aviso de seguridad conocido

`npm audit` reporta una vulnerabilidad de esbuild que llega a través de Vite 5.
**Solo afecta al servidor de desarrollo**, no a lo que se publica. Se resuelve
actualizando Vite a la versión 7 o superior, que es un cambio mayor y conviene
probar aparte.
