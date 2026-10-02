# Mr. Pilo: un solo cerebro, varios portales · avance

Diseño: `propuesta.md` (sección 6). Contrato de la función: `.ccg/tasks/pilo-ia-siempre/contract.md`, Anexo E.

Estado al 2026-10-02: **los seis pasos construidos** (1 a 3 en `0121`; 4 a 6 en `0122`, más abajo). Sin commit, sin migrar, sin desplegar. La lectura entre ámbitos nace apagada: ninguna migración cambia una celda.

## Qué quedó hecho

### Paso 1 · Portales como dato

- `supabase/migrations/0121_pilo_portales.sql`:
  - `pilo_sources`: el catálogo de fuentes (ámbito de casa, nombre, `kind` portal/documentos/moodle, `staff_only`, `stays_home`).
  - `pilo_portals`: una fila por portal (`planeacion`, `ensenanza`) con `scope` (ámbito de casa), `written_for` («preparado para…»), `name` y `matrix` (`{fuente: casa | visita | no}`).
  - La matriz nace con lo de hoy, leída de los interruptores (`memory_sources`): Planeación, encendida salvo `false`; Enseñanza, solo lo que está en `true`. Nada del otro ámbito. Las colecciones nuevas de Planeación, en «no».
- La función lee la vista con `pilo_scope` (`loadView`, `portalView` en `logic.ts` y su copia en `index.ts`). Sin 0121, `SPACES` + `spaceSources`, como antes.
- Regresión: `funcion-preguntar.test.ts` › «los portales como vistas (0121)» compara el pedido al modelo con y sin la vista en 6 casos (los dos portales, visitante, personal, historia, vecinos): idénticos byte a byte. `rol.esperado.json` no cambió.

### Paso 2 · Un solo filtro en la base

- `pilo_scope(p_portal text, p_session boolean default false, p_member boolean default false)` → `(source, space, mode, vis text[], name)`. `stable`, `security definer`, solo servicio o administración.
- La usan `pilo_memory_search`, `pilo_memory_semantic`, `pilo_graph_neighbors`, `pilo_graph_around`, `pilo_answer_candidates` y la nueva `pilo_memory_readable`. `pilo_graph_overview` no (es el mapa completo de un ámbito, solo administración).
- Firmas: se borra la vieja y se crea la nueva en la misma migración; todos ganan `p_member boolean default false` (y `pilo_graph_around`, además, `p_public_only`). `p_space` pasa a significar «el portal que pregunta».
- Fuera los `CHECK` fuente ↔ espacio (`pilo_memory_source`, `pilo_nodes_source`, `pilo_edges_source`, `pilo_docs_source`). En su lugar, llaves a `pilo_sources (id, scope)` en `pilo_memory` y `pilo_docs`: la procedencia de un pasaje sigue siendo la de su fuente, pero como dato.
- La función ya no arma el filtro: manda `reader` (`p_space`, `p_public_only`, `p_member`) en cada lectura y dejó de leer `pilo_memory` directo cuando hay 0121.
- Pruebas de fuga: `tests/db/pilo-portales.test.ts`.

### Paso 3 · Documentos para el Pilo general

- `pilo_docs` acepta `planeacion` con tres colecciones: `institucional` («Documentos institucionales»), `normativa` («Normativa»), `lineamientos` («Lineamientos y guías»).
- Lo que asumía «solo Enseñanza tiene documentos» y se cambió: la llave `pilo_docs.space → pilo_spaces`, el `CHECK` de colecciones, `pilo_doc_save` y `pilo_map_save` (pedían fila en `pilo_spaces`), `pilo_doc_replace` (anotaba «actualizada» solo en `pilo_spaces`), `pilo_map_prune` (excluía `planeacion`), y en la función el rechazo de `comprender` para `planeacion`.
- Intranet, «Mr. Pilo con IA» › Memoria:
  - `PortalsMatrix.tsx` + `portals.ts`: el grupo «Qué lee cada portal».
  - `GeneralDocs.tsx`: monta `DocumentsPanel` y `ComprehendGroup` de Enseñanza con `space="planeacion"`.
  - `DocumentsPanel` recibe ahora `collections`, `disabledNote` y `note`; `ComprehendGroup` salió de `MemoriaPanel.tsx` a `pilo-ensenanza/memoria/ComprehendGroup.tsx` y recibe `space`, no la ficha.

## Decisiones

1. **`pilo_portals` referencia, no absorbe.** La persona, el tono por rol, los cupos, el chat emergente y Moodle siguen en `pilo_spaces` (y, para Planeación, en `pilo_ai_settings`). Moverlos habría obligado a reescribir las dos pantallas de administración y la configuración pública sin cambiar nada para nadie. Lo único que estaba repetido —`memory_sources`— queda como **espejo** de las celdas de casa, con disparadores en los dos sentidos. La verdad es la matriz: es lo que leen las búsquedas.
2. **Una tabla de fuentes aparte (`pilo_sources`).** El filtro necesita saber de cada fuente su ámbito, si pide sesión y si sale de casa. Así una fuente nueva es una fila.
3. **«De casa» solo vale en lo propio.** `pilo_scope` ignora una celda `casa` sobre una fuente de otro ámbito, y `pilo_portal_update` la rechaza. En esta entrega es imposible leer entre ámbitos, diga lo que diga la matriz.
4. **«De visita» existe pero no se lee.** `pilo_scope` la devuelve con `mode = 'visita'` (sin Moodle, y con Impacto solo para personal); ninguna búsqueda usa esas filas; `pilo_portal_update` rechaza marcarla; la pantalla la muestra deshabilitada con «Próximamente».
5. **Una cuenta de Pilo nunca es personal**, aunque llegue `p_session = true`: `v_staff := p_session and not p_member`.
6. **Nadie escribe `pilo_portals` directo**, tampoco la administración: solo por `pilo_portal_update`, que revisa cada celda y devuelve el efecto (pasajes y guardadas afectadas).
7. **Temas y referencias comunes desde ya.** `tema:…` y `ref:…` tienen id global; con documentos en dos ámbitos el mismo tema chocaba y Planeación se quedaba sin relación. Ahora el nodo es común y la relación (`pilo_edges.space`) sigue siendo del ámbito del pasaje, así que los vecinos no cruzan. Adelanta una parte del paso 4.
8. **La matriz se confirma antes de aplicar** (en el mismo sitio, nombrando la consecuencia) y se aplica al momento, sin esperar a «Guardar cambios».

## Cambios de comportamiento con la matriz de partida

Llamando como llama la función desplegada hoy, la base con 0121 devuelve lo mismo que sin ella (probado comparando dos bases). Con la función nueva hay dos endurecimientos, los dos pedidos en el encargo:

- En `planeacion`, una respuesta guardada que cita Impacto ya no se le repite a un visitante ni a una cuenta de Pilo. Antes sí: la frescura solo miraba el espacio.
- En `planeacion`, una respuesta que cita un pasaje «con sesión» no se guarda.

## Pruebas

- `tests/db/pilo-portales.test.ts` (19 pruebas). Los casos salen de la matriz: 2 portales × 12 fuentes × 3 visibilidades × 4 «quién pregunta» = **288 casos** por matriz, cada uno por 6 caminos (palabras, significado, vecinos, legibles, guardadas, guardada de otro portal) más 96 comprobaciones de la malla: **1.824 comprobaciones por barrido**, 4 barridos (partida, todo abierto con celdas indebidas, celdas en «no», vuelta a la partida).
- Antes/después: dos bases (sin 0121 y con ella), mismas filas, llamadas con las formas de hoy; todo igual.
- Mutaciones: se quitaron a mano 9 condiciones del filtro, una por una; las 9 hicieron fallar la suite.
- `funcion-preguntar.test.ts`: 10 pruebas nuevas con la vista. `aislamiento-funcion.test.ts`: cada lectura de la memoria lleva `reader`.
- Pruebas existentes que hubo que cambiar porque afirmaban la regla vieja: `pilo-espacios` (los CHECK), `pilo-documentos` (Planeación sin documentos), `pilo-mapa` (temas por espacio), y sus pruebas de idempotencia, que ahora aplican 0113/0114/0115 seguidas de 0121.

## Para desplegar

1. Aplicar `0121_pilo_portales.sql` (requiere 0113–0120). De una sola vez.
2. Desplegar `pilo-ia`.

El orden entre 1 y 2 no importa. **No volver a aplicar 0113, 0114, 0115 ni 0118 después de 0121**; si pasa, aplicar 0121 otra vez.

## Sin verificar

- Nada corrió contra la base real ni en Deno. Las funciones SQL se probaron en PGlite; `pilo_memory_semantic`, con un doble de pgvector.
- Las pantallas nuevas no se abrieron en un navegador: pasan `tsc` y el build, nada más.
- Que el bucket `pilo-docs` acepte la ruta `planeacion/<id>/<nombre>` (sus políticas solo miran el bucket y el rol, así que debería).

---

# Pasos 4, 5 y 6 · puentes y lectura de visita (`0122_pilo_puentes.sql`)

Contrato: `.ccg/tasks/pilo-ia-siempre/contract.md`, Anexo F. Sin commit, sin migrar, sin desplegar.

## Qué quedó hecho

### Paso 4 · Temas comunes y puentes por reglas

- **«Comprender» sobre Planeación.** `pilo_map_pending`, `pilo_map_status` y `pilo_map_save` ya no exigen que el pasaje sea de un documento: en Planeación entran también los pasajes de sus portales (los de documentos van primero) y reutilizan los temas que ya existen. La relación queda en el ámbito del pasaje; los vecinos de casa no cruzan. `pilo_map_prune` limpia las relaciones de un pasaje de portal que «Actualizar la memoria» borró. El panel es el mismo `ComprehendGroup` de «Mr. Pilo con IA» › Memoria: ahora cuenta esos pasajes.
- **Los puentes se guardan.** Tabla nueva `pilo_bridges` (más `pilo_bridge_scan` para lo que la IA ya revisó). `pilo_bridges_sync()` calcula y guarda los de reglas; `pilo_bridges_list()`, `pilo_bridges_status()` y `pilo_bridge_set(id, estado)` los leen, cuentan y deciden. La función llama a `pilo_bridges_sync()` al final de un lote de «comprender» que guardó algo.
- **El mapa global los lee** (`mapa-global/data.ts`, `global.ts`, `GlobalMap.tsx`): con 0122 ya no calcula nada; pone cada puente guardado sobre sus puntos, con su estado y su origen (trazo de rayas si está aprobado, de puntos si espera revisión; los rechazados no se dibujan; en el detalle, con glifo y texto). Sin 0122 los calcula al dibujar, como antes, y lo dice.

### Paso 5 · Lectura de visita

- **La matriz.** `pilo_portal_update` deja marcar «De visita» (solo en fuentes de otro ámbito que puedan salir de su casa: nunca Moodle, nunca lo propio) y acepta `expect`. `pilo_portal_preview` cuenta el efecto sin cambiar nada. En la intranet (`portals.ts`, `PortalsMatrix.tsx`): el botón «De visita» ya se puede pulsar; antes de confirmar dice cuántos pasajes de qué fuente podrá leer el portal, cuántos son públicos y cuántos «con sesión», quién los verá, cuántos puentes aprobados hay y cómo se presentarán; el botón de confirmar espera a que la base cuente.
- **La base.** Dos funciones nuevas y ninguna más leen lo de otro ámbito: `pilo_memory_visit` (por palabras) y `pilo_bridge_neighbors` (por un puente aprobado, desde pasajes que el portal lee de casa). Las dos pasan por `pilo_scope` y devuelven cada pasaje con su procedencia. Las búsquedas de siempre no cambian: siguen leyendo solo «de casa».
- **Las cifras en vivo** pasan por el filtro: `pilo_facts_search` y `pilo_facts_semantic` reciben quién lee y revisan la celda `cifras`.
- **La función** (`answerWork` › `visitOf`): decide cuándo (`homeFallsShort`), arma la procedencia (`visitPassages`, `visitLabel`), pone lo de visita al final de su bloque con tope 2, añade la regla fija al pedido (`visitRule`), no guarda lo que cita algo de visita y, sin IA, responde con una plantilla (`visitAnswer`).
- **La página pública**: `AskSource` gana `via`, `from`, `written_for`. La procedencia va junto a la cita con texto y glifo (↗) y borde de rayas en `/pregunta` (`AskPilo.tsx`); en la app (`AppMenu.tsx`), en la lista «De dónde sale»; y en las tres (también el chat emergente) como nota escrita bajo la respuesta (`notesOf` › `originNote`).

### Paso 6 · Puentes por IA con revisión

- Acción nueva de la función: `puentes` (`estado`, `reglas`, `lote`), solo administración, por lotes y con el presupuesto de tiempo de «comprender». Al modelo le llegan nombres; responde con números de las dos listas (no puede inventar un id) y un porqué que se valida. Entran como `propuesta`.
- En el mapa global, la bandeja **«Puentes por revisar»** (`mapa-global/BridgeInbox.tsx`): cada propuesta con sus dos extremos (se puede saltar al punto en el mapa), su porqué, de dónde sale y Aprobar / Rechazar, uno por uno. Lo ya decidido se puede revisar y cambiar. Sin IA lo dice, y «Recalcular los de reglas» sigue funcionando.

## Decisiones

1. **Tabla propia para los puentes, no columnas en `pilo_edges`.** Las búsquedas (`pilo_graph_neighbors`, `pilo_graph_around`) recorren `pilo_edges`; una relación entre ámbitos guardada ahí podría seguirse por accidente con solo olvidar una condición. En `pilo_bridges` una relación entre ámbitos solo existe como puente con estado, y solo la lee una función. El par se guarda con el ámbito menor primero y nunca dentro de un mismo ámbito (un `CHECK`).
2. **Un puente une puntos, no pasajes.** Un extremo puede ser un nodo, un documento o un tema; «toca» un pasaje si es ese pasaje, si es su documento o si el pasaje trata o cita ese tema en su ámbito. Así un puente por «Ley 30» vale para todos los pasajes que la citan, de los dos lados.
3. **Qué se aprueba solo.** Solo lo que sale de una regla sin IA: la misma norma u ODS (por su clave normalizada) y un punto del Plan de Desarrollo que se llama igual que un punto de otro ámbito. Un tema compartido y una referencia compartida que no es norma ni ODS los puso la IA al comprender: entran como propuesta. Es más estricto que lo que dibujaba el mapa (que unía cualquier par con el mismo nombre).
4. **«Lo de casa no alcanza»**: ni respuesta oficial, ni guardada, ni cifra de casa, ni un pasaje de casa con la mitad de las palabras clave de la pregunta. Se mide por palabras y no por significado a propósito: con vectores casi siempre hay algún pasaje «parecido», y la regla no dispararía nunca. Lo de visita, por este camino, tiene que pasar la misma vara.
5. **La visita por palabras, no por significado.** `pilo_memory_visit` no usa vectores: es más conservador y evita un pedido más al proveedor de embeddings.
6. **Las cifras de visita solo por «alcance».** Un portal con `cifras` en «visita» las recibe cuando lo suyo no alcanza y la pregunta pide una cifra; cuentan dentro del tope de 2.
7. **El público de cada ámbito es un dato** (`pilo_portals.audience`), para decidir cuándo decir «fue preparado para…». El aviso que ya recibía un administrativo en Enseñanza (sobre lo de casa) queda como estaba: el pedido de hoy no cambia.
8. **Sin IA, si lo de casa no alcanzó y otro ámbito lo tiene, responde ese ámbito** con la plantilla del servidor, antes que un extracto de casa que no trae lo que se pregunta.
9. **Solo la administración aprueba**, ni siquiera la función del servidor: `pilo_bridge_set` no está concedida al rol de servicio.

## Los riesgos que dejó anotados el encargo anterior

- **Las cifras en vivo no pasaban por `pilo_scope`**: ahora sí (`pilo_facts_search`, `pilo_facts_semantic`), y la función manda quién lee.
- **El espejo `memory_sources` no aprende «visita»**: el disparador solo copia las celdas de casa y solo de fuentes del propio ámbito. Probado: marcar «visita» no añade la fuente a los interruptores, y guardar los interruptores (aunque nombren la fuente ajena) no toca la celda.
- **Dos pestañas abiertas**: (a) la matriz manda `expect` y la base no escribe si la celda cambió; (b) «Guardar cambios» de las dos fichas ya no manda los interruptores de «Fuentes» si esa pestaña no los tocó y, si tocó alguno, lo aplica sobre lo que la base tiene en ese momento (`mergeSourceFlags`).
- **Una guardada que cita pasajes de visita**: no se guardan.
- **Los nombres de las fuentes ajenas**: la procedencia la arma el servidor (`visitLabel`), limpia de marcas del pedido.

## Pruebas

- `tests/db/pilo-portales.test.ts` (20 pruebas). El barrido sale de la matriz: 2 portales × 12 fuentes × 3 visibilidades × 4 «quién pregunta» = **288 casos**, cada uno ahora por **8 caminos** (los seis de casa, más `pilo_memory_visit` y `pilo_bridge_neighbors`, con un puente aprobado sembrado por caso) y 96 comprobaciones de la malla: **2.400 comprobaciones por barrido**, 4 barridos (partida, todo abierto con celdas indebidas, celdas en «no» con una de visita por portal, vuelta a la partida) = 9.600; más **576** con todos los puentes en «propuesta» y en «rechazada» (no traen nada). **10.176 comprobaciones generadas.**
- `tests/db/pilo-puentes.test.ts` (15 pruebas, nuevo): las reglas, quién calcula y quién decide, extremos por tema y por documento, los dos sentidos, propuesta/rechazada, Moodle, lo que propone la IA, las cifras por la matriz, «comprender» en portal.
- Mutaciones: 18 condiciones del filtro quitadas una por una (14 de 0122 y 4 de `pilo_scope`). 15 hicieron fallar la suite. Las 3 que no: dos son redundantes por construcción (en `pilo_bridge_neighbors`, «mode = visita» y «el pasaje de entrada se lee de casa» ya los garantizan el `CHECK` de ámbitos distintos y la unión con `pilo_scope`); la tercera («visita» sobre una fuente propia en `pilo_scope`) era un hueco de la prueba: el barrido «todo abierto» lleva ahora una celda así. Esa mutación no se volvió a correr después del arreglo.
- `funcion-preguntar.test.ts`: 17 pruebas nuevas (visita de punta a punta, cifras, base sin 0122, vetos, la acción `puentes`). `visita.test.ts` (19, nuevo): lo puro. `aislamiento-funcion.test.ts`: las dos lecturas de visita llevan quién lee y aparecen una sola vez.
- Pruebas existentes que hubo que cambiar porque afirmaban la regla vieja: «visita todavía no» (`pilo-portales`, `funcion-preguntar`, `portals.test`), «lo pendiente en Planeación está vacío» (`pilo-mapa`, `pilo-portales`), y las de idempotencia, que ahora aplican también 0122.

## Para desplegar

1. Aplicar `0121_pilo_portales.sql` (si no está) y después `0122_pilo_puentes.sql`. En ese orden.
2. Desplegar `pilo-ia`.

El orden entre 2 y las migraciones no importa (Anexo F.8). **No volver a aplicar 0121 después de 0122**; si pasa, aplicar 0122 otra vez.

Nada cambia para quien pregunta hasta que la administración marque una celda «De visita».

## Sin verificar

- Nada corrió contra la base real ni en Deno. El SQL se probó en PGlite.
- Ninguna pantalla se abrió en un navegador: pasan `tsc` y el build.
- El modelo real: que presente lo de visita como se le pide, que devuelva JSON en `puentes`.
- El costo de `pilo_bridges_sync()` y `pilo_bridge_neighbors` con la malla real.
- El mapa global no dibuja el mapa de los documentos de Planeación ni los temas que Planeación usa: un puente con un extremo ahí se ve en la bandeja y se cuenta («une puntos que este mapa no dibuja»), pero no se traza.

## Antes de encender la primera celda «De visita»

1. Abrir la matriz y leer el efecto que anuncia: cuántos pasajes son «con sesión».
2. Revisar la visibilidad de los documentos de esa fuente (cada pasaje conserva la suya).
3. Recalcular los puentes por reglas en el mapa global y mirar los aprobados que tocan esa fuente.
4. Revisar `written_for` y `audience` del portal de esa fuente (`pilo_portals`): es lo que Pilo dirá.
5. Probar con una pregunta que solo el otro ámbito responde, como visitante, como cuenta de Pilo y como personal.
