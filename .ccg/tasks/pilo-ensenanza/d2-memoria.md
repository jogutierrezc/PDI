# Encargo D2 · Memoria de Enseñanza: Documentos, Moodle y Mapa de conexiones

El dueño aprobó el diseño interno (artifact v2, pantallas «Memoria» y «Conectar Moodle»:
https://claude.ai/artifact/SgnPEggKcWkTS5hi34WHXP; plantilla en el scratchpad de la sesión, `pilo/ensenanza-template.html`).
Falta construir de verdad esos tres paneles dentro de `src/modules/admin/pilo-ensenanza/memoria/`, que D1 dejó como
marcadores: `DocumentsPanel.tsx`, `MoodlePanel.tsx`, `TeachMap.tsx`.

## Lo que debe verse (del diseño aprobado)
- **Franja «Pilo leyendo»**: mientras se lee un documento o un curso, Pilo en pose `pensar` (PiloFace), el paso en curso
  en palabras, una barra de avance y un contador. Sin trabajo en curso, la franja dice el estado de la memoria.
- **Documentos**: zona para soltar o elegir archivos (DOCX, PDF, XLSX, CSV), colección de destino (innovación, políticas,
  mirada global), vista previa antes de guardar (pasajes, avisos de recorte, datos omitidos, PDF escaneado), y la lista con
  el recorrido de cada uno: leído → en pasajes → entendido → en el mapa. Por documento: quién lo ve (con sesión / público),
  activo, reemplazar, borrar (diciendo qué se borra con él).
- **Moodle**: estado de la conexión, dirección del sitio y token (solo los 4 últimos caracteres), «Probar conexión» con lo
  que el token puede leer, categorías y cursos para elegir, por curso «Público» / «Con sesión», sincronizar con el mismo
  recorrido que un documento, última lectura. La guía de configuración en Moodle (qué lee y qué nunca lee; pasos en Moodle
  y en la intranet) va como sección plegable o pestaña propia.
- **Mapa de conexiones**: cuatro columnas — colección → documento → tema → referencia — con sus relaciones; tocar un punto
  enciende sus vecinos y abre su detalle (pasajes, con qué se conecta); buscador; «Probar la memoria» enciende el camino
  usado, marcando lo que llegó por el mapa. «Comprender» (con IA) por lotes, con avance; sin IA dice «mapa básico:
  estructura y normas citadas».

## Contratos reales

### Lectores (`src/modules/admin/pilo-ensenanza/ingest/index.ts`)
- `readDocument(file: File): Promise<ParsedDocument>` con `{ kind, pages, blocks, warnings, scanned }`; lanza error sobre 25 MB.
- `toPassagesReport(parsed, { title, cut? })` → `{ passages: {seq,title,section,body,cut}[], warnings, redacted }`.
- `kindOf`, `LIMITS`, `SCANNED_MESSAGE`. PDF y XLSX se cargan por `import()` dinámico (no deben llegar a los trozos públicos:
  tras el build, buscar «pdfjs» en los trozos de `/pregunta` y `/datos-abiertos`).

### Base (migraciones 0114–0116; leerlas para los detalles)
- Bucket privado `pilo-docs`, ruta `<space>/<doc_id>/<nombre>`. El cliente genera el `id` del documento.
- `pilo_docs` (solo lectura para administración): `id, space, origin, kind, source, title, file_*, external_id, vis, active,
  status, status_detail, pages, passages, content_hash, understood_at, synced_at, …`. `vis` nace en `sesion`.
- `pilo_doc_save(p_space, p_doc jsonb) → uuid` (con `file_hash` repetido devuelve el id existente: si es distinto del enviado,
  borrar lo recién subido y avisar «ya está»).
- `pilo_doc_replace(p_doc, p_rows jsonb) → {doc, added, changed, removed, total, skipped}` (corta en 400).
- `pilo_doc_update(p_doc, p_patch jsonb)`: `title, source, vis, active, status, status_detail, pages, file_*, content_hash, understood, synced`.
- `pilo_doc_delete(p_doc) → {doc, space, file_path, passages, answers, nodes, edges, topics}` (el archivo del bucket lo borra quien llama).
- Mapa: `pilo_doc_outline(p_doc, p_nodes, p_edges) → {doc, nodes, edges, removed, rejected}`,
  `pilo_map_status(p_space, p_doc?) → {space, total, mapped, pending, topics, refs}`,
  `pilo_map_topics(p_space, p_limit) → (id, label, kind, uses)`, `pilo_graph_overview(p_sources, p_space)`,
  `pilo_graph_around(p_ids, p_sources, p_up, p_down, p_limit, p_space)`. Las relaciones del mapa llevan `source='mapa'` y
  `origin` (`reglas` | `ia`).
- Moodle: `pilo_space_set_secret(p_space, 'moodle', p_value) → text` (4 últimos), `pilo_space_secret_status(p_space) →
  {space, moodle:{has,last4}, updated_at}`, columnas `moodle_on`, `moodle_url`, `moodle_site`, `moodle_checked_at` en
  `pilo_spaces`, tabla `pilo_moodle_courses`, `pilo_moodle_course_set(p_space, p_course, p_patch)`.
- Vectores: `pilo_embed_status(p_model, p_space)` y el indexado con `space` (ganchos de `src/modules/admin/pilo/memory.ts`).

### Función `pilo-ia` (ver el anexo de `.ccg/tasks/pilo-ia-siempre/contract.md` cuando B2 termine)
- `{action:"comprender", space, doc?, step:"estado"|"lote"}` — repetir «lote» hasta que no quede nada pendiente.
- `{action:"moodle", space, step:"probar"|"categorias"|"cursos"|"curso", …}` — un curso por llamada.
- `{action:"indexar", space, step:…}` para los vectores.

## Recorrido de un documento (lo que orquesta el panel)
1. Elegir archivo → `readDocument` → vista previa con `toPassagesReport` (avisos, omitidos, escaneado: no se guarda).
2. Subir el original al bucket → `pilo_doc_save` → `pilo_doc_replace` (estado `en_pasajes`).
3. Estructura del mapa sin IA: `pilo_doc_outline` (colección › documento › secciones, y las normas citadas por reglas) → `en_mapa`.
4. Vectores: indexar lo pendiente del espacio.
5. «Comprender» con IA, por lotes, opcional → `entendido`.
Cada paso puede fallar por separado: decir cuál, dejar el documento en su último estado bueno y ofrecer reintentar desde ahí.

## Reglas
- Solo archivos nuevos o los tres marcadores de `memoria/`, más lo mínimo en `MemoriaPanel.tsx` para montarlos. No tocar
  `ingest/`, la función, las migraciones ni el módulo público.
- La cara es `PiloFace`. Movimiento con GSAP (`src/modules/admin/pilo/motion.ts`, guías de impeccable y de Emil): avance de
  cada paso, entrada de filas una sola vez, el mapa que se traza, la franja de Pilo leyendo; menos de 300 ms en lo que es
  interfaz, salida fuerte, camino con movimiento reducido, solo transform y opacidad. **Ningún texto puede quedar oculto si
  una animación se interrumpe**: terminar el tween (`progress(1)`) o limpiar sus propiedades antes de matarlo.
- Tokens del sitio; nada de colores escritos a mano. Estados con glifo y texto, nunca solo color.
- Sin la migración aplicada (0114, 0115 o 0116), cada panel dice cuál falta y se desactiva; no rompe los demás.
- Textos en español, voz sobria de la intranet; sin cifras ni nombres inventados de la UDES.
- Pruebas (vitest, node) de lo puro: `layoutColumns`, el armado de nodos y relaciones de la estructura, la máquina de
  estados del recorrido, el mapeo de errores.

## Tarea adicional del mismo agente · La voz de la presentación
Pedido del dueño: cuando Mr. Pilo se presenta (la bienvenida de la página y el saludo del emergente), su voz debe ser
**la misma que usa la IA al leer las respuestas** — en los dos Pilos, el original y el de Enseñanza.

- Averiguar primero cómo suena hoy cada cosa: la lectura de respuestas (`sayWithPilo` / `prefetchPilo` en
  `src/components/pilo/ai/client.ts`, acción `voz` de `pilo-ia`, estilo por portal y por rol) y la presentación
  (`src/modules/pregunta/Welcome.tsx`, el saludo de `AskPilo.tsx`, `src/modules/pilo-embed/PiloEmbed.tsx`): si usa la voz
  del navegador (`speechSynthesis`), un audio fijo u otro estilo, eso es lo que hay que unificar.
- La presentación debe pedir su audio por el mismo camino que una respuesta (mismo proveedor, mismo estilo de voz, mismo
  ánimo según el rol, misma caché), de modo que no se note el cambio de voz entre el saludo y la primera respuesta.
- Los textos de la bienvenida son fijos: su audio se puede pedir por adelantado y guardar en la caché que ya existe, para
  que el saludo no espere al proveedor. Si la voz de la IA no está disponible (función «leer» apagada para el portal, sin
  cupo de voz, error del proveedor), la presentación no debe caer a otra voz distinta sin avisar: se queda en silencio con
  el texto en pantalla, como hoy hace una respuesta sin voz, salvo que el código actual defina otra cosa para las respuestas
  — en ese caso, el mismo comportamiento que ellas.
- El navegador solo deja sonar audio tras un gesto de la persona: respetar el gesto que ya exige la bienvenida y no
  inventar reproducción automática.
- La boca de `PiloFace` se mueve mientras suena (ya tiene `talking`); que arranque y pare con el audio real.
- Esta tarea toca archivos del módulo público (`src/modules/pregunta/**`, `src/modules/pilo-embed/**`,
  `src/components/pilo/ai/client.ts`). Hacerla al final, releer esos archivos antes de editarlos (otro agente los cambió hoy)
  y mantener intactos sus arreglos: en particular, ningún texto puede quedar oculto si una animación se interrumpe.
- Pruebas de lo puro (qué se pide para el saludo: portal, rol, estilo, clave de caché) y decir con claridad qué no se pudo
  oír ni verificar sin un navegador y sin el proveedor real.
