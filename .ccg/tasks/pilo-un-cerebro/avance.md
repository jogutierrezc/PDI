# Mr. Pilo: un solo cerebro, varios portales · avance

Diseño: `propuesta.md` (sección 6). Contrato de la función: `.ccg/tasks/pilo-ia-siempre/contract.md`, Anexo E.

Estado al 2026-10-02: **pasos 1, 2 y 3 construidos**. Sin commit, sin migrar, sin desplegar. Pasos 4 a 6 pendientes.

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

## Lo que necesita el encargo siguiente (pasos 4 a 6)

- **Paso 4.** Los temas ya son comunes; falta correr «comprender» sobre los pasajes de portal de Planeación (`pilo_map_pending` solo toma pasajes con `doc_id`) y guardar los puentes por referencia que hoy calcula `mapa-global/global.ts`. `pilo_edges.origin` solo admite `reglas`/`ia`: hay que sumar `admin` y el estado (`propuesta`/`aprobada`/`rechazada`). El mapa global pide hoy las cinco fuentes de portal por nombre; el mapa de documentos de Planeación (fuente `mapa`) aún no se dibuja ahí.
- **Paso 5.** Encender «visita»: quitar el rechazo en `pilo_portal_update`, habilitar el botón en `portals.ts` (`cellChoices`), y que las búsquedas usen las filas `mode = 'visita'` de `pilo_scope` (hoy filtran `sc.mode = 'casa'`). `pilo_graph_neighbors` y `pilo_graph_around` recorren solo el ámbito de casa (`e.space = v_scope`): cruzar por puentes aprobados es ahí. `PortalView.visiting` ya llega a la función. `written_for` está guardado y sin usar.
- **Riesgos antes de encender «visita»:**
  - Las cifras en vivo (`pilo_facts_*`) no pasan por `pilo_scope`: la función las pide si la vista trae `cifras`. Si `cifras` puede ir de visita, ese permiso debe bajar a la base.
  - El catálogo y las guardadas son por portal, pero una guardada puede citar pasajes de visita: la frescura ya lo revisa, falta decidir si se guardan.
  - Los nombres de las fuentes ajenas llegarán al modelo y a la página: la procedencia la debe poner el servidor.
  - El espejo `memory_sources` solo conoce «sí/no» de casa; no debe aprender «visita».
  - La pantalla de administración abierta en dos pestañas puede guardar interruptores viejos sobre una celda recién cambiada (solo celdas de casa).
- **Paso 6.** Bandeja de puentes propuestos por IA en el mapa global.
