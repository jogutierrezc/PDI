# Plan · Pilo Enseñanza (segundo Mr. Pilo)

## Órdenes del dueño (2026-10-01)
- Segundo Pilo con conocimiento propio: innovación educativa, políticas institucionales, mirada global. Se presenta como
  «la Inteligencia Artificial de la Universidad de Santander».
- Portal propio (`/pilo-ensenanza`) con el DISEÑO ACTUAL de Pregúntele a Pilo y bienvenida propia; Pilo en otros portales
  con el diseño del emergente actual.
- Intranet «Mr. Pilo en Enseñanza»: Pregúntele a Pilo, Memoria, Catálogo, Bitácora. Sin Conexión ni Voz (compartidas
  con Mr. Pilo con IA). Capa dinámica con los colores del sitio (GSAP: transiciones, cargas, Pilo «pensando» en Memoria).
- Memoria: lee DOCX, XLSX, CSV, PDF y arma un mapa de conexiones. Lee cursos de Moodle por API; guía de configuración.
- Primer uso: pregunta el rol (estudiante / profesor) y adapta redacción, emoción y voz.
- Nunca se mezclan memoria, catálogo, respuestas guardadas, bandeja ni bitácora de los dos Pilos. Cupo propio.
- El dueño aplica migraciones y despliega `pilo-ia`. Última migración: 0112 → siguen 0113…0116.

## 1. Separación: columna `space` + `p_space` (valor de partida `'planeacion'`)
Refuerzos: (1) un CHECK ata `source` a `space` en `pilo_memory`, `pilo_nodes`, `pilo_edges`; (2) valor de partida
`'planeacion'` en columnas y parámetros, así el código y la función viejos solo ven al Pilo actual; (3) pruebas de fuga.
Cada función que gana parámetros se hace con `drop function if exists <firma vieja>` + `create` + `revoke/grant` en la
misma migración (un `create or replace` con más parámetros dejaría una sobrecarga ambigua para PostgREST).

### 0113_pilo_espacios.sql (idempotente, requiere 0089–0112, guardas para PGlite como 0108/0112)
Columnas (`add column if not exists`):
| Tabla | Columnas |
|---|---|
| `pilo_memory` | `space text not null default 'planeacion'`, `vis text not null default 'publico'` |
| `pilo_answers` | `space`, `rol text not null default ''` |
| `pilo_catalog` | `space`, `rol text not null default ''` |
| `pilo_inbox` | `space`, `rol` |
| `pilo_nodes`, `pilo_edges` | `space` |
| `pilo_ai_log` | `space`, `rol` |

Restricciones (`drop constraint if exists` + `add`):
- `space in ('planeacion','ensenanza')` en todas; `vis in ('publico','sesion','oculto')`; `rol in ('','estudiante','profesor')`.
- `pilo_memory_source`: `(space='planeacion' and source in ('cifras','boletines','pdi','observatorio','impacto')) or
  (space='ensenanza' and source in ('innovacion','politicas','global','moodle'))`. Igual en nodos y relaciones, que además
  admiten `'mapa'` en `ensenanza`.
- Catálogo: la llave `key` sigue global; Enseñanza usa prefijos `ER-` (respuestas) y `EC-` (capciosas).
  `pilo_catalog_import` no pisa una clave de otro espacio (`… do update … where c.space = p_space`) y cuenta las rechazadas.
- Índices: `pilo_memory(space, source)`, `pilo_answers(space, created_at desc)`, `pilo_catalog(space, kind, active)`,
  `pilo_ai_log(space, created_at desc)`; `pilo_inbox_pending_idx` pasa a único en `(space, qnorm, reason) where status='pendiente'`.

Firmas (se parte del último cuerpo vigente):
| Función | Firma nueva |
|---|---|
| `pilo_memory_search` (0094) | `(p_q text, p_sources text[] default null, p_limit int default 6, p_space text default 'planeacion', p_public_only boolean default false)` |
| `pilo_memory_semantic` (0108) | `(p_embedding text, p_model text, p_sources text[] default null, p_limit int default 8, p_min real default 0.3, p_space text default 'planeacion', p_public_only boolean default false)` |
| `pilo_answer_candidates` (0094) | `(p_qnorm text, p_space text default 'planeacion', p_rol text default '', p_public_only boolean default false)` |
| `pilo_catalog_active` (0096) | `(p_space text default 'planeacion')` |
| `pilo_catalog_import` (0096) | `(p_kind text, p_rows jsonb, p_replace boolean default false, p_space text default 'planeacion')` |
| `pilo_catalog_semantic` (0112) | `(p_embedding text, p_model text, p_min real default 0.8, p_space text default 'planeacion')` |
| `pilo_catalog_near` (0112) | `(p_embedding text, p_model text, p_limit int default 5, p_space text default 'planeacion')` |
| `pilo_graph_around` (0097) | `(p_ids text[], p_sources text[] default null, p_up int default 6, p_down int default 1, p_limit int default 80, p_space text default 'planeacion')` |
| `pilo_graph_overview` (0097) | `(p_sources text[] default null, p_space text default 'planeacion')` |
| `pilo_embed_status` (0112) | `(p_model text, p_space text default 'planeacion')` |
| `pilo_embed_pending` (0112) | `(p_model text, p_limit int default 64, p_space text default 'planeacion')` |
| `pilo_inbox_add` (0109) | los seis de hoy + `p_space text default 'planeacion', p_rol text default ''` |
| `pilo_ai_key_status` (0110) | misma firma; `today`/`today_voice` cuentan solo `space='planeacion'` |
| `pilo_space_usage` (nueva, admin) | `(p_space text) returns jsonb` → `{today, limit, by_rol:{estudiante,profesor,''}, today_voice}` |
| `pilo_ai_public_config` (0111) | misma firma; añade `spaces` |

Filtros dentro de las funciones: memoria `m.space = p_space and m.vis <> 'oculto' and (not p_public_only or m.vis = 'publico')`;
respuestas guardadas: mismo `space` y mismo `rol`, y `fresh` falso si un pasaje citado no es público con `p_public_only`.
Sin cambio de firma: `pilo_memory_replace`, `pilo_graph_replace` (solo las cinco fuentes de hoy), `pilo_embed_save`,
`pilo_catalog_hit`, `pilo_facts_*`, `pilo_visitor_hit` (el espacio entra en la huella).

## 2. `pilo_spaces` y cómo resuelve el espacio la función
| Grupo | Columnas |
|---|---|
| Identidad | `id text primary key` (`^[a-z]{3,20}$`, distinto de `planeacion`), `name text` |
| Apertura | `on boolean default false`, `aud text` (`admin|sesion|publico`, partida `admin`), `ai boolean default true`, `welcome boolean default true` |
| Persona | `intro text` (≤300; partida «la Inteligencia Artificial de la Universidad de Santander»), `focus text` (≤600), `greeting text` (≤300) |
| Rol | `ask_rol boolean default true`, `roles jsonb` |
| Memoria | `memory_sources jsonb` (`{"innovacion":true,"politicas":true,"global":true,"moodle":true}`), `memory_indexed_at` |
| Cupos | `daily_limit int default 200`, `visitor_limit int default 20`, `visitor_window_seconds int default 600` |
| Widget | `widget_on boolean default false`, `widget_origins text[]` (≤50) |
| Auditoría | `updated_by`, `updated_at` |

`roles`: `{"estudiante": {"tone":"", "suggestions":[], "voice_style":"", "expression":"feliz", "mood":"emocionado"},
"profesor": {…, "expression":"graduado", "mood":"atento"}}`.
RLS: administración lee y cambia; `anon` sin acceso. Fila inicial `ensenanza`, apagada y con audiencia `admin`.
No se duplica proveedor, modelo, clave, voz ni topes de redacción: salen de `pilo_ai_settings` / `pilo_ai_secret`.

Configuración pública — `pilo_ai_public_config()` suma:
`"spaces": {"ensenanza": {"on","aud","welcome","ai","name","greeting","ask_rol","roles":{"estudiante":{"suggestions","expression","mood"},"profesor":{…}},"sources":{…},"widget":{"on","origins"}}}`.
No expone `focus`, `tone`, `voice_style`, Moodle ni cupos.

En la función:
- El espacio sale del campo `portal` que ya existe: `spaceOfPortal("pregunta") → "planeacion"`, `("ensenanza") → "ensenanza"`.
  No hay campo `space` en `preguntar`, `calificar` ni `voz`. `Portal`/`PORTALS` suman `"ensenanza"`.
- Lee su fila de `pilo_spaces` e inyecta `rules.portals.ensenanza = {on, aud, fns:["preguntar","leer"]}` antes de `canUse`.
- Las fuentes las fija el servidor: `SPACES[space].sources ∩ memory_sources` encendidas. `publicOnly = !role`.
- `indexar`, `comprender`, `moodle` llevan `space` en el cuerpo, exigen `role === "admin"` y `space ∈ SPACES`.
- `catalogCache` y `embedCache` pasan a ser mapas por espacio.
- Cupo por espacio (`overLimit` filtra por `space`, usa su `daily_limit`, cuenta solo `preguntar` para el espacio nuevo).
  Guarda `spacesReady` (consulta a `pilo_spaces`, recordada 60 s): sin 0113, Planeación usa la consulta de hoy y
  Enseñanza responde «Falta la migración 0113».
- La función nueva manda `p_space` / `p_public_only` solo cuando el espacio no es el de partida.
- Huella del límite por visitante: suma el espacio solo si no es el de partida.

## 3. Documentos (se leen en el navegador de la intranet)
| Formato | Lector | Reutiliza |
|---|---|---|
| DOCX | bloques con estilo y tablas | `readDocx()` de `src/modules/admin/udes-en-cifras/import/docx.ts` |
| XLSX | cada hoja → `string[][]` | `import("exceljs")` |
| CSV | filas, separador detectado | `parseCsv`/`detectSeparator` de `admin/udes-en-cifras/sheet.ts` |
| PDF | texto por página con tamaño de letra | `pdfjs-dist` (nuevo), solo por `import()` dinámico |

- PDF escaneado: media < 40 caracteres por página o más de la mitad con < 20 → estado `escaneado`, sin pasajes.
- Troceo (puro): DOCX/PDF por títulos (estilo; en PDF letra ≥ 1,15 × mediana o `^\d+(\.\d+)*\s`, `CAPÍTULO`, `Artículo N`);
  `section` = ruta de títulos; pasajes de 900–1.500 caracteres, los < 200 se unen. XLSX/CSV: «Columna: valor; …» por fila,
  hasta 25 filas o 1.400 caracteres, `section` = «Hoja · filas 26–50».
- Límites: 25 MB, 400 pasajes por documento, 2.000 filas por hoja; lo recortado se informa.
- Limpieza: `clean()`, `noMoney()` de `memory.ts` + `redactPersonal()` nuevo (correos, teléfonos, documentos → «[dato omitido]», con conteo).

### 0114_pilo_documentos.sql
- Bucket privado `pilo-docs` (25 MB; docx/xlsx/csv/pdf), políticas de administración como 0101. Ruta `<space>/<doc_id>/<nombre>`.
- `pilo_docs`: `id uuid pk`, `space`, `origin` (`archivo|moodle`), `kind` (`docx|xlsx|csv|pdf|curso`), `source`
  (`innovacion|politicas|global|moodle`), `title`, `file_path`, `file_name`, `file_size`, `file_hash` (único por espacio si
  `origin='archivo'`), `external_id` (único por `(space, origin)`), `vis` (`publico|sesion`), `active`, `status`
  (`leido|en_pasajes|entendido|en_mapa|escaneado|error`), `status_detail`, `pages`, `passages`, `content_hash`,
  `understood_at`, `synced_at`, `created_by`, `created_at`, `updated_at`. RLS: administración solo lee; se escribe por RPC.
- `pilo_memory.doc_id uuid references pilo_docs(id) on delete cascade`.
- RPC: `pilo_doc_save(p_space, p_doc jsonb) returns uuid`; `pilo_doc_replace(p_doc uuid, p_rows jsonb) returns jsonb`
  (filas `[{seq,title,section,body,path,cut}]`, `ref = 'doc:'||id||':'||seq`, hereda `space/source/vis`, compara como
  `pilo_memory_replace`, devuelve `{added,changed,removed,total}`); `pilo_doc_update(p_doc, p_patch jsonb)`;
  `pilo_doc_delete(p_doc) returns jsonb` (pasajes en cascada, respuestas guardadas que lo citan, nodos y temas huérfanos).

## 4. Mapa de conexiones · 0115_pilo_mapa.sql (reutiliza la malla de 0097)
- Relaciones nuevas `trata` (pasaje → tema) y `cita` (pasaje → referencia). `pilo_memory.mapped_at`.
- Nodos: `fuente:<colección>`, `doc:<uuid>`, `doc:<uuid>#<sección>`, `tema:<slug>`, `ref:<slug>` (`source='mapa'`, `props.kind`).
- RPC: `pilo_doc_outline(p_doc, p_nodes, p_edges)`; `pilo_map_pending(p_space, p_doc default null, p_limit default 18)`;
  `pilo_map_topics(p_space, p_limit default 80)`; `pilo_map_save(p_space, p_rows jsonb) returns int`;
  `pilo_graph_neighbors(p_refs text[], p_space, p_sources text[], p_public_only boolean, p_limit int default 3)`.
- Sin IA: estructura colección › documento › sección + referencias por reglas (`globalRefs`: Ley/Decreto/Acuerdo/Resolución,
  `ODS n`, MEN, CNA, UNESCO, OCDE…). El documento llega a «en el mapa» sin modelo.
- Con IA: acción `comprender` (solo administración; el nombre `entender` ya existe): `{action:"comprender", space, doc?, step:"estado"|"lote"}`;
  lote de 18 pasajes en 3 pedidos de 6, presupuesto 60 s, reutiliza temas existentes, ≤ 4 temas y ≤ 3 referencias por pasaje.
  Puras en `logic.ts`: `buildComprehendMessages`, `parseComprehend`, `topicSlug`, `globalRefs`. No gasta el cupo público.
- Dibujo: `TeachMap.tsx` con `layoutColumns()` (colección → documento → tema → referencia); reutiliza `mesh-view.ts` y
  `MeshSearch`, `MeshTree`, `NodePanel`, `usePassage` de `MeshView.tsx` (solo exportarlos).
- Búsqueda: tras `search(query)`, hasta 3 vecinos por `pilo_graph_neighbors` después de los directos (`via: "mapa"`);
  paso nuevo `id: "mapa"`, «Siguiendo las conexiones».

## 5. Moodle · 0116_pilo_moodle.sql
- Llamada: `POST {sitio}/webservice/rest/server.php`, `application/x-www-form-urlencoded` con `wstoken`, `wsfunction`,
  `moodlewsrestformat=json`. El token en el cuerpo, nunca en la URL. Los errores llegan como JSON con `exception`.
- Funciones (lista cerrada `MOODLE_ALLOWED` en `logic.ts`): `core_webservice_get_site_info`, `core_course_get_categories`,
  `core_course_get_courses_by_field`, `core_course_get_contents`, `mod_page_get_pages_by_courses`; por verificar en la
  versión de la UDES: `mod_book_get_books_by_courses`, `mod_label_get_labels_by_courses`, `mod_url_get_urls_by_courses`,
  `mod_resource_get_resources_by_courses`, `mod_folder_get_folders_by_courses`. Nunca matrícula, notas, entregas,
  mensajes ni foros.
- `pilo_space_secret(space pk, moodle_token, …)` sin políticas; `pilo_space_set_secret(p_space, p_which, p_value)` devuelve
  los 4 últimos caracteres; `pilo_space_secret_status(p_space)`.
- `pilo_spaces` suma `moodle_on`, `moodle_url` (CHECK `^https://`), `moodle_site jsonb`, `moodle_checked_at`.
- `pilo_moodle_courses`: llave `(space, course_id)`, `category_id`, `category_name`, `shortname`, `fullname`,
  `selected default false`, `vis default 'sesion'`, `doc_id → pilo_docs`, `time_modified`, `synced_at`, `content_hash`, `status`, `error`.
  Cada curso es un `pilo_docs` (`origin='moodle'`, `kind='curso'`, `source='moodle'`).
- Acción `moodle` (solo administración): pasos `probar`, `categorias`, `cursos` (`category`), `curso` (`course`; uno por
  llamada, ≤ 5 llamadas de 20 s, 90 s en total). `htmlToText()` y `moodlePassages()` puras.
- URL validada: https, sin IP literal, `localhost` ni rangos privados, ruta fija, `redirect: "error"`.
- Visibilidad: los pasajes heredan `vis` del curso (`sesion` de partida); una respuesta que cite un pasaje no público no se guarda.
- En Moodle: activar servicios web y REST; servicio externo «Pilo lectura» con solo esas funciones; usuario técnico con rol
  de solo ver cursos y actividades, sin participantes, calificaciones ni mensajes; token para ese usuario y servicio.
- Archivos enlazados dentro de un recurso: fuera de la primera entrega.

## 6. Página pública y widget
`src/modules/pregunta/space.ts`: `SpaceProfile { id, portal, route, embedRoute, title, docTitle, name, beats, hello{h1,p},
suggestions, sources[], accent, storagePrefix, gateFallback{to,label} }` y `ASK_SPACES`. El perfil `planeacion` copia los
textos de hoy (`Welcome.tsx`, `AskPilo.tsx`, `PiloEmbed.tsx`).
- `store.ts`: `storageKey(prefix, name)`; `planeacion` conserva `pilo-pregunta:*` y `pilo-embed:*`; `ensenanza` usa
  `pilo-ensenanza:*` y `pilo-ensenanza-embed:*`; `readRol`/`writeRol` (`<prefijo>:rol`). El tema se comparte.
- `AskPilo({ space = "planeacion" })`, `Welcome` con `beats`, `title` y el paso de rol, `PiloEmbed({ space })`, `RolePicker.tsx`.
- `client.ts`: `askQuestionStream(question, history, handlers, opts?: { portal?, rol? })`, `rateAnswer({…, portal?, rol?})`,
  voz con `rol`; la caché de audio suma el rol. `config.ts` lee `spaces`.
- `App.tsx`: `/pilo-ensenanza` y `/pilo-ensenanza-embed`. `public/pilo.js`: `data-pilo="ensenanza"`, guarda por espacio.

## 7. Intranet
Ruta `/admin/mr-pilo-ensenanza?seccion=…`, `<RequireRole minimum="admin" screen="pilo_ensenanza">`. `AdminScreen` suma
`"pilo_ensenanza"` (`src/types/database.ts`, `src/lib/auth.tsx`, `src/components/layout/intranet-links.ts`, `AdminShell.tsx`).
Carpeta `src/modules/admin/pilo-ensenanza/`, pestañas como `PiloAiSettings.tsx`.
- Pregúntele a Pilo: presentación, enfoque, saludo, «Preguntar el rol la primera vez», tarjeta por rol (tono, sugeridas,
  estilo de voz de `voice_styles`, expresión), cupos, widget. Enlace a Mr. Pilo con IA para conexión y voz.
- Memoria: `DocumentsPanel`, `TeachMap`, `MoodlePanel`, búsqueda por significado con `space`.
- Catálogo: `CatalogSection({ space })`, `CatalogModal` con prefijo y columna «para quién», bandeja `useInbox(limit, space)`.
- Bitácora: `usePiloLog(space)`, `pilo_space_usage`, reparto por rol.
Parámetro `space` (partida `"planeacion"`) obligatorio en los ganchos de `src/modules/admin/pilo/*` (`useCatalog`, importación,
`CatalogModal`, `useInbox`, `useSavedAnswers`, `useEmbedStatus`, `useIndexMemory`, `useTryMemory`, `useTryCatalog`,
`usePiloLog`, `usePassage`): sin él, el Pilo actual mostraría filas de Enseñanza.

## 8. Rol del visitante
- Se elige una vez (bienvenida y saludo del widget), se guarda en `localStorage` por espacio, se puede cambiar. Sin elección: `general`.
  `profiles` no dice quién es estudiante o profesor: no se deriva.
- Campo `rol` en `preguntar`, `calificar` y `voz` (`role` ya es el rol de la intranet). En `logic.ts`:
  `type Rol = "estudiante" | "profesor" | "general"`, `parseRol(v)`, `roleInstruction(rol)` (texto fijo por rol + `tone` de la
  administración ≤ 300 caracteres pasado por `safeData`). `buildAskMessages(plan, prompt)` con `prompt.space` y `prompt.rol`;
  sin ellos, idéntico byte a byte a hoy.
- Estudiante: palabras sencillas, un ejemplo, define la jerga, cierra con un paso concreto. Profesor: más preciso, vocabulario
  pedagógico y normativo, cita la política, sugiere cómo llevarlo al aula.
- No cambia qué pasajes se buscan. Sí filtra el catálogo (`rol` vacío o igual) y separa las respuestas guardadas por rol.
- Voz: el servidor toma `roles[rol].voice_style` como estilo del portal. Cara: `roles[rol].expression` cuando la respuesta no
  trae una. Ánimo oral: `roles[rol].mood`. El `mood` del catálogo manda siempre.
- Bitácora y bandeja guardan `rol`; nada identifica al visitante.

## 9. Seguridad
RLS: `pilo_spaces` (admin lee y cambia), `pilo_docs` y `pilo_moodle_courses` (admin lee; escritura por RPC),
`pilo_space_secret` (sin políticas). Toda RPC nueva empieza con `pilo_is_service_or_admin()` o `has_role_at_least('admin')`
y lleva `revoke all … from public, anon`. Bucket privado. El token de Moodle nunca llega al navegador ni a la bitácora.
Inyección: todo pasaje entra entre `<<<DATOS … DATOS>>>` con `safeData`; la salida de `comprender` se valida (etiquetas de
3–60 caracteres, sin URL ni marcas del pedido). Dinero y datos personales: el veto y los filtros valen para todos los espacios.
Pendiente aparte (Pilo actual): las respuestas guardadas no miran la audiencia de sus pasajes (`impacto`).

## 10. Fases y paquetes
| Fase | Contenido | Migración |
|---|---|---|
| 1 · Espacios | columnas, `pilo_spaces`, RPC con `p_space`, la función entiende espacios y rol | 0113 |
| 2 · Página, widget, rol e intranet | `/pilo-ensenanza`, widget, bienvenida con rol; módulo con Pregúntele, Catálogo y Bitácora | — |
| 3 · Documentos | lectores, bucket, `pilo_docs`, panel de Memoria, vectores | 0114 |
| 4 · Mapa | `comprender`, mapa, vecinos en la búsqueda | 0115 |
| 5 · Moodle | secreto, acción `moodle`, panel, visibilidad por curso | 0116 |

Paquetes (archivos sin cruces):
- **A · Base**: `supabase/migrations/0113…0116`, `tests/db/pilo-{espacios,documentos,mapa,moodle}.test.ts`, `tests/db/supabase-stub.sql` si falta `storage`.
- **B · Función y espejo (un solo escritor)**: `supabase/functions/pilo-ia/index.ts`, `src/components/pilo/ai/logic.ts`, pruebas en
  `src/components/pilo/ai/` (`espacios`, `rol`, `comprender`, `moodle`, `aislamiento-funcion`), anexo en `.ccg/tasks/pilo-ia-siempre/contract.md`.
- **C · Lectores**: `src/modules/admin/pilo-ensenanza/ingest/*` (`docx`, `xlsx`, `csv`, `pdf`, `pdf-load`, `chunk`, `redact`, `types`, pruebas), `package.json` (`pdfjs-dist`).
  Contrato: `readDocument(file: File): Promise<{ kind, pages, blocks, warnings, scanned }>`, `toPassages(parsed, meta): { seq, title, section, body, cut }[]`.
- **D · Intranet**: `src/modules/admin/pilo-ensenanza/*` (salvo `ingest/`), el parámetro `space` en `src/modules/admin/pilo/*`,
  `src/types/database.ts`, `src/lib/auth.tsx`, `intranet-links.ts`, `AdminShell.tsx`, `scripts/smoke.mjs`.
- **E · Página y widget**: `src/modules/pregunta/*`, `src/modules/pilo-embed/*`, `public/pilo.js`, `src/components/pilo/ai/{client,config}.ts`, `src/App.tsx`.
Orden: A-0113 y B (fase 1) primero; con sus contratos, C, D y E a la par.

## 11. Por confirmar con el dueño
1. «Con sesión» hoy es solo personal de la intranet: no hay cuentas de estudiantes ni profesores.
2. Quién administra el espacio (solo administración, o Innovación Educativa con permiso propio).
3. Si este Pilo puede decir valores en pesos publicados en una política.
4. Quién autoriza marcar un curso de Moodle como público.
5. Moodle: versión, REST activo, funciones disponibles, restricción por IP (Supabase no tiene IP fija).
6. Orden de despliegue recomendado: migración primero, función después.
