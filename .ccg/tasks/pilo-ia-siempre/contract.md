# Contrato · `pilo-ia` › `preguntar` con IA siempre y streaming

Servidor: `supabase/functions/pilo-ia/index.ts` · lógica pura: `src/components/pilo/ai/logic.ts` · migración: `supabase/migrations/0110_pilo_ia_siempre.sql`.
La función trabaja igual sin 0110 (valores de partida, sin límite por visitante, sin motivo «general» en la bandeja).

## 1. Pedido

`POST {SUPABASE_URL}/functions/v1/pilo-ia` · `Content-Type: application/json` · cabeceras `apikey` y `Authorization: Bearer <anon o sesión>` como hoy.

```json
{
  "action": "preguntar",
  "portal": "pregunta",
  "question": "¿y en Cúcuta?",
  "history": [
    { "q": "¿Cuántos estudiantes matriculados hay?", "a": "En 2024 hubo 20.500 estudiantes [1]." }
  ],
  "stream": true
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `question` | string | obligatorio; se limpia de espacios y se recorta a 500 caracteres; menos de 2 → 400 |
| `history` | `{q, a}[]` | opcional, del más viejo al más nuevo. Se aceptan los últimos **12** turnos (`q` ≤ 500, `a` ≤ 2000 caracteres; lo demás se recorta). Al modelo pasan los últimos **6** (ajuste `ask_history_turns`), con `q` ≤ 300 y `a` ≤ 700 y sin las citas `[n]` |
| `stream` | boolean | opcional. `true` → `text/event-stream` cuando escribe el modelo (ver §3). Ausente o `false` → JSON, como hoy |

- **Mande en `q` lo que escribió la persona** (no `asked`) y en `a` el `text` final de la respuesta. Si llega una cadena `asked` («A → B»), el servidor la separa de nuevo, así que la página de hoy sigue funcionando.
- El cuerpo entero no puede pasar de 48.000 caracteres → 413.
- `supabase.functions.invoke` no entrega el flujo por partes de forma fiable: use `fetch` directo y lea `response.body`.

## 2. Cuándo vuelve JSON y cuándo un flujo

Mire el `Content-Type` de la respuesta, no lo que pidió.

| Caso | Respuesta |
|---|---|
| `stream: true` y va a escribir el modelo | `200 text/event-stream` (§3) |
| Vetado (dinero de la universidad, datos de personas) | `200 application/json`, `kind: "regla"` |
| Capciosa del catálogo | `200 application/json`, `kind: "capciosa"` |
| IA apagada, sin cupo de texto, o ajuste `ask_stream = false` | `200 application/json` (curada / memoria / malla / dato / extracto / regla / nada) |
| Sin `stream` | `200 application/json` con el objeto final (§4), o error HTTP |
| Error antes de abrir el flujo (pedido inválido, portal cerrado, límite por visitante, tamaño) | JSON con su estado HTTP (§6) |
| Error con el flujo ya abierto (también un fallo al buscar en lo publicado) | evento `error` (el HTTP ya fue 200) |

Las respuestas sin modelo **nunca** van como flujo: siempre JSON, igual que hoy.

## 3. Eventos del flujo (SSE)

Orden: `step`* → `meta` → `step` (redactar) → `thinking`* → `delta`* → `step`* → (`done` | `error`). Siempre termina con **un** `done` o **un** `error` y luego se cierra. Cabeceras CORS iguales a las del JSON.

`step` y `thinking` son **opcionales para la página**: quien los ignore ve `meta` → `delta`* → `done` | `error`, como antes. Ignore también cualquier evento que no conozca.

**Cuándo se abre el flujo (decisión):** después del enrutador y de mirar el cupo, y antes de la búsqueda. Lo vetado, las capciosas, la IA apagada y «sin cupo» se deciden antes y siguen saliendo como JSON (§2 no cambia). Una vez abierto, todo camino termina en `done` o `error`: si falla la búsqueda llega `error` con `code: "memoria"`; si falla el modelo, `done` con lo publicado (`fallback`) o `error`.

**Latido:** mientras el flujo está abierto va una línea de comentario `: ping` cada ~10 s (sobre todo mientras el modelo no da su primera palabra), para que ni el navegador ni un proxy corten la conexión. Siempre cae entre eventos enteros; un lector SSE la ignora. Se detiene al terminar o cancelar. Si la página cierra la conexión, se cancela el pedido al proveedor.

### `step` — lo que Pilo va haciendo (real, no texto inventado)
```
event: step
data: {"id":"cifras","label":"Consultando las cifras","state":"start"}

event: step
data: {"id":"cifras","label":"Consultando las cifras","detail":"2 cifras de Permanencia 2024","state":"done"}
```
Forma: `{ "id": string, "label": string, "detail"?: string, "state": "start" | "done" }`.

| `id` | `label` | Cuándo | `detail` (ejemplos) |
|---|---|---|---|
| `entender` | Entendiendo la pregunta | siempre, al abrir | «pregunta sobre la UDES · sede Cúcuta · año 2024», «sigue la conversación · sede Cúcuta», «tema general», «es un saludo» |
| `catalogo` | Revisando las respuestas oficiales | si no es saludo ni seguimiento | «1 respuesta oficial», «sin resultados» |
| `guardadas` | Recordando respuestas anteriores | si no es saludo ni seguimiento | «1 respuesta anterior», «sin resultados» |
| `cifras` | Consultando las cifras | si la pregunta pide una cifra o un corte | «2 cifras de Permanencia 2024», «sin resultados» |
| `memoria` | Buscando en lo que conozco | si no es saludo | «5 pasajes», «sin resultados» |
| `redactar` | Redactando la respuesta | `start` justo después de `meta`, al llamar al modelo; `done` cuando termina | «con 1 respuesta oficial, 2 indicadores y 3 pasajes»; «No hay datos de la UDES sobre esto; respondo con conocimiento general»; «No encontré datos publicados de la UDES sobre esto»; al fallar: «el modelo no respondió» |
| `verificar` | Verificando las cifras | solo si el modelo escribió | «cada número está en las fuentes», «1 número por revisar», «sin cifras de la UDES que verificar» |

Garantías:
- Cada `id` llega como mucho una vez con `start` y una con `done`, en ese orden; **todo paso empezado se cierra** antes de `done`/`error` (también si algo falla).
- `catalogo`, `guardadas`, `cifras` y `memoria` corren a la par: sus `start` salen todos antes del primer `done`, y cada `done` sale cuando esa búsqueda termina de verdad (orden real, no fijo). Todos terminan antes de `meta`.
- `redactar` `start` va después de `meta` y antes del primer `thinking`/`delta`; su `done` va después del último `delta`. Un `done` sin `detail` nuevo repite el del `start`.
- Los pasos que no aplican no se anuncian (un saludo: solo `entender`, `redactar`, `verificar`).
- `detail` solo trae cuentas y nombres cortos (indicador, sede, año): nunca el contenido de un pasaje, valores, dinero, datos de personas, puntajes, umbrales, tablas, proveedores ni claves. Un nombre que toque dinero o datos personales se omite («2 cifras»).

### `thinking` — el razonamiento del modelo, si lo manda
```
event: thinking
data: {"text":"Me preguntan por los matriculados. La fuente 1 trae la cifra de 2024. "}
```
- Se concatenan. Sale **solo** si el proveedor manda razonamiento aparte (`reasoning_content` / `reasoning` en el `delta`) o un bloque `<think>…</think>` en el contenido. Un modelo que no razona no manda ninguno: no dependa de ellos.
- Todos los `thinking` llegan **antes del primer `delta`**; el razonamiento que llegue después de empezar la respuesta se descarta.
- Solo frases completas, con los filtros de la respuesta y más: sin cifras de dinero no publicadas, sin datos de personas (correos, teléfonos, documentos, números largos sin fuente) y sin las marcas internas del pedido. Tope: 1.200 caracteres en total.
- Nunca entra en `delta`, en `done.text`, en lo que se guarda ni en la revisión de cifras. No se manda sin `stream`.
- El pedido le dice al modelo que, si razona aparte, lo haga en español y breve; no se le exige razonar ni escribir «pensamientos» en la respuesta.

### `meta` — una vez, antes de redactar
```
event: meta
data: {"asked":"¿Cuántos estudiantes matriculados hay? → ¿y en Cúcuta?","intent":"institucional","official":false,"model":"google/gemma-4-31b-it","sources":[{"n":1,"ref":"cifras:matriculados","source":"cifras","title":"Estudiantes matriculados","section":"Población","path":"/cifras/poblacion","cut":"2024","office":"Registro","excerpt":"En 2024 hubo…"}],"trail":[{"step":"Enrutador","status":"ok","detail":"Es sobre la universidad: …","ms":3}]}
```
- `asked`: cómo se leyó una pregunta de seguimiento (la cadena con « → »); `""` si se entiende sola.
- `intent`: `saludo | charla | institucional | general`.
- `sources`: **todas** las fuentes que se le dieron al modelo, con el número con que las cita mientras escribe. Sirven para pintar las citas en vivo. Las del final (`done.sources`) son solo las citadas y **renumeradas**.
- `official`: hay una respuesta oficial del catálogo como base. `mood`: solo si la trae el catálogo.
- `trail`: los pasos hasta ese momento (el paso «IA» llega en `done`).

### `delta` — cero o más
```
event: delta
data: {"text":"En 2024 hubo 20.500 estudiantes matriculados [1]. "}
```
- Se concatenan. Solo salen **frases completas** (hasta punto y espacio, o salto de línea), ya sin razonamiento del modelo y sin cifras de dinero no publicadas: lo mostrado nunca se desdice.
- Las citas `[n]` usan la numeración de `meta.sources`.
- Puede no llegar ninguno (el proveedor respondió entero, o el modelo falló): no dependa de ellos.

### `done` — el objeto final (§4)
```
event: done
data: {"kind":"ia","text":"En 2024 hubo 20.500 estudiantes matriculados [1].","sources":[{"n":1,"ref":"cifras:matriculados", "…":"…"}],"trail":[…],"intent":"institucional","grounding":"oficial","answerId":77,"verified":true,"unknown":[],"model":"google/gemma-4-31b-it","finish":"stop","usage":{"prompt":800,"completion":20,"total":820}}
```
**Reemplace** lo mostrado por `done.text` y `done.sources`: el texto final puede diferir de los `delta` (citas podadas y renumeradas, una frase de dinero quitada, nota añadida).
Solo en el flujo, `done` suma `steps` (`[{ "id", "label", "detail"?, "ms" }]`: los pasos terminados, en el orden en que terminaron) y `seconds` (segundos totales, un decimal), para guardar «cómo respondí». El JSON sin stream no los trae.
Si el modelo falló pero había algo publicado, `done` trae la respuesta sin IA (`kind: "extracto" | "dato" | "curada" | "memoria" | "malla" | "regla"`) con `fallback`.

### `error` — no hubo respuesta
```
event: error
data: {"message":"El proveedor de IA respondió con un error (503) y no encontré nada publicado con qué responder sin ella. Intente de nuevo en un momento.","code":"proveedor"}
```
`code`: `proveedor | tiempo | limite_proveedor | memoria | interno | cancelado`. Puede traer `detail`. Muestre `message` tal cual.

## 4. El objeto final (JSON sin stream, o `done`)

Los campos de hoy no cambian; lo nuevo solo se suma (todo opcional salvo donde se dice).

| Campo | Estado | Significado |
|---|---|---|
| `kind` | igual | `ia | curada | capciosa | memoria | malla | dato | extracto | regla | nada`. No hay valores nuevos |
| `text` | igual | Texto con citas `[n]`. **Nuevo:** con `kind: "ia"` puede traer Markdown básico (negritas `**…**`, listas `- ` / `1. `, párrafos con línea en blanco). Sin títulos ni tablas |
| `sources` | igual | `{n, ref, source, title, section, path, cut, office, excerpt}`; solo las citadas, en orden. **Nuevo:** puede venir `source: "catalogo"` (`ref: "catalogo:<clave>"`) también en `kind: "ia"`, con `path` posiblemente vacío |
| `trail` | igual | `{step, status: ok|skip|ai, detail, ms}`. Pasos: Enrutador, Catálogo, Respuestas guardadas, Entender, Cifras, Fuentes, Malla, IA (ya no hay «Reglas» ni «Catálogo por significado») |
| `answerId` | igual | id de la respuesta guardada (para calificar) o `null` |
| `asked` | igual, otro contenido | Solo en seguimientos: la cadena «anterior → actual». Ya no es una reescritura de la IA |
| `mood`, `graph` | igual | del catálogo / de la malla |
| `verified`, `unknown` | igual | `kind: "ia"`: `false` + lista si algún número no está en las fuentes (ni en la pregunta) |
| `intent` | **nuevo** | `saludo | charla | institucional | general | vetado | capciosa` |
| `grounding` | **nuevo** | `oficial | mixta | general` (ver §5). Ausente en `regla`, `capciosa`, `nada` |
| `fallback` | **nuevo** | El modelo falló y se respondió sin IA: `proveedor | tiempo | vacio | red | limite_proveedor` |
| `partial`, `notice` | **nuevo** | La redacción se cortó a medias: `text` es lo que alcanzó a escribir (revisado); `notice` es la frase para mostrar |
| `truncated` | **nuevo** | Llegó al tope de tokens (`finish: "length"`): el final puede quedar corto |
| `filtered` | **nuevo** | `["dinero"]`: se quitó una cifra de dinero no publicada; `text` termina con una nota |
| `finish`, `usage`, `model` | **nuevo** | Diagnóstico del proveedor, cuando lo manda |

## 5. Qué etiqueta poner (UI)

La marca de «conocimiento general» la calcula **el servidor** según haya citas válidas; no hay ningún marcador escrito por el modelo que interpretar.

| `kind` / `grounding` | Etiqueta sugerida |
|---|---|
| `ia` + `oficial` | «Redactada con IA · con fuentes de la UDES» |
| `ia` + `mixta` | «Redactada con IA · parte es conocimiento general» (algún párrafo de 80+ caracteres no cita fuente) |
| `ia` + `general` | «Conocimiento general · no es información oficial de la UDES» (sin fuentes; no mostrar la lista de fuentes) |
| `ia` + `intent` saludo/charla | sin etiqueta de fuentes (es conversación) |
| `ia` + `verified: false` | además «Revise las cifras» + `unknown` (como hoy) |
| `ia` + `partial` | mostrar `notice`; `truncated` → «La respuesta quedó corta» |
| `curada` | Respuesta oficial de Planeación (textual) · con `fallback`: «La IA no respondió: esta es la respuesta oficial tal cual» |
| `capciosa` | microexpresión del catálogo, textual, con su `mood` |
| `memoria`, `dato`, `extracto`, `malla` | como hoy (sin IA). Con `fallback`, avisar que la IA no respondió |
| `regla` | negativa (dinero / personas) o, sin IA, saludo fijo |
| `nada` | no encontró nada y no hay IA |

## 6. Errores y estados HTTP

| Estado | `code` | Cuándo |
|---|---|---|
| 400 | — | pregunta vacía, JSON inválido, acción desconocida |
| 403 | — | portal cerrado / pide sesión |
| 413 | `tamano` | cuerpo > 48.000 caracteres |
| 429 | `visitante` | límite por visitante. Trae `retry_after` (segundos) y cabecera `Retry-After`. Mostrar `error` |
| 429 | `limite_proveedor` | (sin stream) el proveedor limitó y no había nada publicado |
| 500 | `interno` | fallo dentro de la función al leer el pedido, redactar o guardar |
| 502 | `memoria` | fallo al buscar en lo publicado (o falta 0094) |
| 502 / 504 | `proveedor` / `tiempo` | (sin stream) el modelo falló o tardó y no había nada publicado |

Cuerpo: `{ "error": "mensaje para mostrar", "code": "...", "detail"?: "...", "advice"?: "..." }`.
Con stream, lo que falle después de abrir el flujo (búsqueda incluida) llega como evento `error` (el HTTP ya fue 200).
«Sin cupo de texto» y «IA apagada» **no** son errores: responden 200 con lo publicado.

## 7. Comportamiento del servidor (resumen)

1. **Enrutador** por reglas, sin bloquear. Solo responden sin modelo: capciosa del catálogo (por disparador, textual) y vetado (presupuesto/dinero de la universidad, sueldos; datos de personas). «Futuro», «inversión en investigación», «¿cuánto cuesta la matrícula?», «gracias, ¿y…?» y los saludos van al modelo (los dos primeros con un aviso en el prompt).
2. **Búsqueda en paralelo**: catálogo (palabras y significado), guardadas, cifras, memoria híbrida. Sin llamada previa al modelo. El seguimiento se une por reglas con su pregunta ancla.
3. **Un pedido** con bloques `[OFICIAL]` → `[GUARDADA]` → `[CIFRAS]` → `[PASAJES]` (una sola numeración), la conversación como turnos `user`/`assistant` y la pregunta.
4. **Tiempos**: Pilo espera al modelo todo lo que deja la plataforma: 130 s de redacción con el tope de 150 s (`DRAFT_TOTAL_MS` = `PLATFORM_CAP_MS` − 20 s), sin tope aparte para la primera señal. En un plan de pago, el secreto `PILO_PLATFORM_CAP_MS=400000` lo sube a 380 s. Si falla o tarda: lo publicado tal cual con `fallback`, o lo ya escrito con `partial`.
5. **Guardado**: solo `ia` verificada, `grounding: "oficial"`, completa, que no sea seguimiento y cuyas fuentes sean de la memoria (nunca `dato:` ni `catalogo:`).
6. **Bandeja**: `revisar` (número sin fuente), `sin_respuesta` (pregunta institucional sin nada publicado) y **`general`** (respondió de conocimiento general).
7. **Cupo**: la voz ya no gasta el cupo de texto (`voice_daily_limit` aparte). `calificar` también tiene límite por visitante (pasado, se ignora en silencio).

## 8. Ajustes nuevos (`pilo_ai_settings`, migración 0110)

| Columna | Partida | Margen | Qué hace |
|---|---|---|---|
| `ask_temperature` | 0.3 | 0–1 | temperatura de la redacción |
| `ask_max_tokens` | 800 | 100–2000 | tope de la respuesta |
| `ask_context_tokens` | 3500 | 800–8000 | cuánto contexto cabe (≈4 caracteres por token) |
| `ask_history_turns` | 6 | 0–6 | turnos anteriores que pasan al modelo |
| `system_role` | `auto` | `auto|system|user` | `auto`: con rol `system`; si el proveedor responde 400, reintenta con la persona en el primer mensaje y lo recuerda. `user`: nunca manda `system` |
| `ask_stream` | true | — | apagado → siempre JSON |
| `voice_daily_limit` | 1500 | 0–100000 | lecturas con voz del servicio por día |
| `visitor_limit` | 20 | 0–1000 | preguntas por visitante por ventana (0 = sin límite). Una misma dirección IP admite 10× (redes compartidas). La administración no tiene límite |
| `visitor_window_seconds` | 600 | 30–86400 | duración de la ventana |

Otros cambios de 0110: tabla `pilo_visitor_hits` (solo rol de servicio; guarda una huella con sal diaria, nunca la IP), `pilo_visitor_hit()`, `pilo_visitor_cleanup()`, motivo `general` en `pilo_inbox`, y `pilo_ai_key_status()` devuelve `today` (solo texto) y `today_voice`.
Variable de entorno opcional de la función: `PILO_VISITOR_SALT` (si falta, la sal sale de la clave de servicio).

**Para Administración** (`src/modules/admin/pilo/*`, no tocado aquí): `InboxReason` y `REASON_LABEL` necesitan `general` (hoy esa fila sale sin etiqueta); los ajustes de arriba no tienen control en pantalla; `today_voice` no se muestra.

## 9. «Probar conexión» (`action: "probar"`)

Hace dos llamadas con la **misma forma de mensajes** de una pregunta real (persona en `system`, un turno anterior, pregunta): una entera y una con `stream: true`.
```json
{ "ok": true, "ms": 950, "url": "…", "model": "google/gemma-4-31b-it",
  "system_role": "system", "stream": "sse", "reasoning": false, "finish": "stop", "sample": "OK",
  "notes": ["rol system aceptado", "streaming por partes"] }
```
`system_role: "user"` = el modelo rechazó `system` y se dobló la persona. `stream: "json"` = el proveedor ignora `stream` (la página verá un solo `delta`). `stream: "error"` + `stream_error`. `reasoning: true` = el modelo manda razonamiento aparte. Lo mismo queda en la bitácora («Prueba de conexión · …»).

## 10. Lo que el dueño debe verificar después de desplegar

Nada de esto se probó contra el proveedor real.

1. **Probar conexión** y leer `system_role`, `stream`, `reasoning` (respuesta o bitácora). Si `system_role` sale `user`, fije `system_role = 'user'` para no pagar un pedido fallido en cada instancia nueva.
2. Que el id del modelo (`google/gemma-4-31b-it`) siga vigente en NVIDIA.
3. Si `reasoning` es `true` o las respuestas salen vacías con `finish: "length"`: el razonamiento se está comiendo `ask_max_tokens`; súbalo o use un modelo sin razonamiento.
4. El tope real de tiempo de la función en el plan del proyecto (se supuso 150 s; `PLATFORM_CAP_MS`). Si corta antes de 90 s, baje `DRAFT_TOTAL_MS`.
5. Que el flujo llegue por partes hasta el navegador (que ningún proxy lo retenga): una pregunta con `stream: true` debe mostrar `delta` antes de `done`.
6. Qué cabecera trae la IP del visitante en producción (`cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`, en ese orden). Si ninguna llega, todos comparten la huella «desconocida» + navegador y el límite sería común: revise `pilo_visitor_hits` tras unas preguntas.
7. Que el modelo obedezca los bloques: una pregunta con respuesta oficial en el catálogo (debe citarla), una de cultura general (`grounding: "general"`), «¿cuánto cuesta la matrícula?» (sin valores inventados) y un intento de «ignora tus instrucciones».
8. La bandeja: revisar el volumen del motivo `general` los primeros días.
9. **Si NVIDIA/Gemma manda razonamiento**: no se sabe. «Probar conexión» lo dice (`reasoning`). Si es `false`, la página nunca verá `thinking` (solo los `step`), y eso es correcto. Tampoco se verificó por cuál campo lo manda (`reasoning_content`, `reasoning` o `<think>`): se leen los tres.
10. Que el razonamiento salga en español: se pide en el prompt, pero el modelo puede no obedecer.
11. Que el comentario `: ping` llegue hasta el navegador a través del proxy de la plataforma, y que la plataforma avise cuando el navegador se desconecta (se usan `cancel` del flujo y `request.signal`).

## Cambio del 2026-10-01 (tarde): todo lo redacta Gemma

Pedido directo del dueño: nada de respuestas rápidas ni capciosas sueltas; se integran a lo que el modelo consulta.

- Una **capciosa** del catálogo ya no responde sola. Su microexpresión entra en `[OFICIAL]` (primera, con su `mood`) y redacta el modelo: llega como `kind: "ia"` por el flujo. Sale tal cual, como `kind: "capciosa"` en JSON, solo si no hay IA (apagada o sin cupo); si el modelo falla, es el respaldo oficial con `fallback`.
- Sin modelo solo queda lo **vetado** (dinero de la universidad, datos de personas).
- **Tiempos**: sin tope aparte para la primera señal; la redacción espera `PLATFORM_CAP_MS` − 20 s (130 s; con el secreto `PILO_PLATFORM_CAP_MS=400000`, 380 s).

## Anexo · Espacios y rol del visitante (0113, «Pilo Enseñanza», fase 1)

Servidor: `supabase/functions/pilo-ia/index.ts` · lógica pura: `logic.ts` (`SPACES`, `spaceOfPortal`, `spaceSources`, `spaceProfile`, `parseRol`, `roleInstruction`, `catalogForRol`, `roleFace`, `withRole`, `visitorSeed`) · migración: `supabase/migrations/0113_pilo_espacios.sql`.

**Para `portal: "pregunta"` (y todo portal que no sea `ensenanza`) nada de este contrato cambia**: ni los campos, ni los eventos, ni lo que la función le manda a la base. `rol` se ignora ahí.

### A.1 El espacio sale del portal

| `portal` | Espacio | Fuentes de memoria (las fija el servidor) |
|---|---|---|
| `pregunta` y cualquier otro | `planeacion` | `cifras`, `boletines`, `pdi`, `observatorio`, `impacto` (con sesión), como hoy |
| `ensenanza` | `ensenanza` | `innovacion`, `politicas`, `global`, `moodle` ∩ las encendidas (`true`) en `pilo_spaces.memory_sources` |

- No hay campo `space` en `preguntar`, `calificar` ni `voz`: si la página lo manda, se ignora. Tampoco se aceptan fuentes de la página.
- El portal `ensenanza` no se configura en `pilo_ai_settings.portals`: su regla sale de su fila en `pilo_spaces` (`"on"`, `aud`) y solo tiene `preguntar` y `leer` (voz). Lo que hubiera en `pilo_ai_settings.portals.ensenanza` se descarta. Sin fila, apagado o con otra audiencia → 403, como un portal cerrado.
- Sin sesión solo se buscan pasajes `vis = 'publico'` (`p_public_only = true`); con sesión, también `sesion`. `oculto`, nunca.
- `pilo_spaces.ai = false` → el espacio responde con lo publicado, sin modelo (JSON, como «IA apagada»).
- La conexión, el modelo, la clave, la voz y los topes de redacción son los de `pilo_ai_settings`: no se duplican.

### A.2 Campo `rol` (pedido)

```json
{ "action": "preguntar", "portal": "ensenanza", "question": "¿Qué dice la política de evaluación?", "rol": "estudiante", "stream": true }
```

| Acción | Campo | Regla |
|---|---|---|
| `preguntar` | `rol` | opcional: `"estudiante"` o `"profesor"`. Ausente o cualquier otra cosa → `general`. Solo cuenta con `portal: "ensenanza"` |
| `calificar` | `rol` | igual; queda en la fila de la bandeja |
| `voz` | `rol` | igual; elige el estilo de voz (`pilo_spaces.roles[rol].voice_style`). El campo `style` de la página no cuenta (solo en `portal: "prueba"`, como hoy) |

Qué cambia con el rol (solo en `ensenanza`):
- **Redacción**: una instrucción fija por rol (nunca texto de la página) más el `tone` que puso la administración para ese rol (≤ 300 caracteres, como dato). `general` no añade nada.
- **Catálogo**: entradas con `rol` vacío o igual al de quien pregunta.
- **Respuestas guardadas**: separadas por espacio y rol (`general` se guarda como `''`).
- **Lo que se busca en la memoria no cambia** con el rol.
- **Bitácora y bandeja** guardan `space` y `rol` (`''`, `estudiante` o `profesor`); nada identifica al visitante.

### A.3 Campos nuevos en la respuesta (solo `portal: "ensenanza"`)

En el JSON sin stream, en `meta` y en `done`. Lo de siempre no cambia; esto solo se suma, al final:

| Campo | Significado |
|---|---|
| `rol` | `estudiante | profesor | general`: para quién se redactó (lo que el servidor entendió) |
| `expression` | la cara de partida del rol (`pilo_spaces.roles[rol].expression`). **Solo** si la respuesta no trae `mood` ni `expression` propios |
| `mood` | el ánimo de partida del rol, con la misma condición. **El `mood` del catálogo manda siempre**: si viene, no llega ni `expression` ni el `mood` del rol |

Con `rol: "general"` no llegan `expression` ni `mood` de rol. Los errores HTTP no llevan campos nuevos.

### A.4 Cupo, límite por visitante y bitácora

- **Cupo de texto por espacio**: `ensenanza` cuenta solo sus `preguntar` con IA contra `pilo_spaces.daily_limit`; `planeacion` cuenta solo sus filas contra `pilo_ai_settings.daily_limit`. Ninguno gasta el del otro. La voz se cuenta por espacio contra `voice_daily_limit`.
- **Límite por visitante**: `pilo_spaces.visitor_limit` / `visitor_window_seconds`; la huella incluye el espacio, así que las ventanas de los dos Pilos son independientes. El 429 (`code: "visitante"`) es el mismo.
- **Calificar**: una respuesta guardada solo se califica desde su propio espacio; el `answerId` de otro Pilo no vota y la opinión se anota con lo que mandó la página.

### A.5 `indexar` con `space` (solo administración)

```json
{ "action": "indexar", "step": "estado" | "lote" | "probar" | "catalogo" | "modelos", "space": "ensenanza", "q": "…" }
```
- `space` ausente → `planeacion`, como hoy. Presente: debe ser `planeacion` o `ensenanza` (otro → 400 «Espacio desconocido.») y quien llama debe ser administración (si no → 403).
- Las respuestas tienen la misma forma; los conteos, los pendientes y las pruebas son los de ese espacio.

### A.6 Sin la migración 0113

| Pedido | Respuesta |
|---|---|
| Cualquier portal de siempre | **igual que hoy**: mismas consultas y mismos parámetros (la función lo detecta con una lectura de `pilo_spaces`, recordada 60 s) |
| `portal: "ensenanza"` (`preguntar`, `calificar`, `voz`) o `indexar` con `space: "ensenanza"` | `500` `{ "error": "Falta la migración 0113 de los espacios de Mr. Pilo.", "advice": "…", "code": "migracion", "detail": "…" }`, sin tocar la memoria ni al proveedor |

Orden de despliegue recomendado: primero la migración, después la función.

### A.7 Lo que la función le manda a la base (para quien mantenga 0113)

Solo fuera de `planeacion`: `p_space` en `pilo_memory_search`, `pilo_memory_semantic` (ambas con `p_public_only`), `pilo_answer_candidates` (con `p_rol` y `p_public_only`), `pilo_catalog_active`, `pilo_catalog_semantic`, `pilo_catalog_near`, `pilo_graph_around`, `pilo_embed_status`, `pilo_embed_pending`, `pilo_inbox_add` (con `p_rol`); columnas `space` y `rol` en lo que inserta en `pilo_ai_log` y `pilo_answers`; filtro `space` (y `vis`) al leer `pilo_memory` y `pilo_answers`. Sin cambio: `pilo_visitor_hit`, `pilo_embed_save`, `pilo_catalog_hit`, `pilo_answer_vote`, `pilo_facts_*`. La prueba estática `aislamiento-funcion.test.ts` vigila que ninguna consulta nueva olvide el espacio.

## Anexo B · Mapa de conexiones y Moodle (0115 y 0116, «Pilo Enseñanza», fases 4 y 5)

Servidor: `supabase/functions/pilo-ia/index.ts` (`comprehendMap`, `moodleSync`, y el paso 2e' de `answerWork`) · lógica pura: `logic.ts` (`topicSlug`, `globalRefs`, `buildComprehendMessages`, `parseComprehend`, `mapLabel`, `comprehendRows`, `docOutline`, `mapNeighbors`, `passageWhere`, `MOODLE_ALLOWED`, `moodleEndpoint`, `privateAddress`, `moodleForm`, `moodleClean`, `moodleFault`, `moodleSite`, `htmlToText`, `redactContacts`, `moodleExtras`, `moodlePassages`) · migraciones: `0114_pilo_documentos.sql`, `0115_pilo_mapa.sql`, `0116_pilo_moodle.sql`.

**Para `portal: "pregunta"` (el Pilo de siempre) nada cambia**: no se llama a `pilo_graph_neighbors`, no hay paso `mapa`, las fuentes no llevan `via` y el pedido al modelo es idéntico. Las dos acciones nuevas rechazan `space: "planeacion"`.

### B.1 Lo común a `comprender` y `moodle`

- Solo administración (sesión con rol `admin`); el espacio va en el cuerpo (`space`), debe existir y no puede ser `planeacion`. El `portal` no cuenta.
- Sirven con la IA apagada o sin conectar, no miran ni gastan el cupo del día ni el límite por visitante, y quedan en `pilo_ai_log` con `action = 'comprender'` o `'moodle'` y el `space`.

| Caso | Respuesta |
|---|---|
| Sin sesión de administración | `403` `{ "error": "Solo la administración arma el mapa de conexiones de Pilo." }` (o «…conecta a Pilo con Moodle.») |
| `space` ausente o desconocido | `400` `{ "error": "Espacio desconocido." }` |
| `space: "planeacion"` | `400` `{ "error": "Ese espacio no tiene documentos propios: ni mapa de conexiones ni cursos de Moodle." }` |
| `step` desconocido | `400` `{ "error": "Paso desconocido." }` |
| Falta 0113 / 0115 / 0116 | `500` `{ "error": "Falta la migración 01xx …", "advice": "…", "code": "migracion" }` |

### B.2 `comprender` — de qué trata cada pasaje

```json
{ "action": "comprender", "space": "ensenanza", "step": "estado" | "lote", "doc": "<uuid, opcional>" }
```
`doc` limita a los pasajes de un documento; si no es un uuid → `400` «Ese documento no es válido.»

**`estado`** → `200`
```json
{ "ok": true, "ai": true, "status": { "space": "ensenanza", "total": 120, "mapped": 84, "pending": 36, "topics": 41, "refs": 9 } }
```
Sin IA (sin conectar, apagada o `pilo_spaces.ai = false`): `"ai": false, "basic": true, "note": "Sin IA, el mapa es el básico: la estructura de cada documento … y las normas que cita. …"`.

**`lote`** → siempre `200` si algo se pudo intentar. Toma hasta 18 pasajes pendientes (`pilo_map_pending`) y hace hasta 3 pedidos al modelo de 6 pasajes cada uno, en serie, con 60 s para todo el lote. La página repite hasta `done: true` o hasta que venga `stopped`.
```json
{ "ok": true, "ai": true, "asked": 18, "saved": 12, "failed": 0, "calls": 2, "done": false,
  "stopped": "limite_proveedor", "note": "El proveedor limitó los pedidos (429)…", "status": { "…": "como en estado" } }
```
| Campo | Significado |
|---|---|
| `asked` | pasajes pendientes que entraron al lote |
| `saved` | pasajes guardados en el mapa (`pilo_map_save`); quedan marcados aunque no tengan temas |
| `failed` | pasajes de pedidos cuya respuesta no se pudo leer: siguen pendientes |
| `calls` | pedidos al modelo |
| `done` | `status.pending === 0` |
| `stopped` | solo si el lote paró antes: `limite_proveedor` (429: lo guardado queda), `proveedor`, `tiempo`, `red`, `formato` (el modelo no devolvió nada legible y no se guardó nada: no insistir sola) |

Sin IA: `{ "ok": true, "ai": false, "basic": true, "note": "…", "asked": 0, "saved": 0, "failed": 0, "calls": 0, "done": true, "status": {…} }`, sin tocar al proveedor.

Seguridad: las instrucciones van fijas en el mensaje de sistema; los temas existentes y los pasajes, como datos entre `<<<DATOS … DATOS>>>` y pasados por `safeData`, en el del usuario. Lo que devuelve el modelo se valida: etiquetas de 3 a 60 caracteres, sin direcciones web, sin marcas del pedido, sin datos de personas ni dinero; a lo sumo 4 temas y 3 referencias por pasaje. Un tema cuya llave (`topicSlug`) ya existe conserva su nombre. Las referencias halladas por reglas (`globalRefs`) van primero.

Lo que se le manda a `pilo_map_save`: `[{ "ref": "doc:<uuid>:<n>", "topics": [{ "id": "tema:<llave>", "label": "…" }], "refs": [{ "id": "ref:<llave>", "label": "…" }] }]`.

### B.3 El mapa al preguntar: paso `mapa` y `via: "mapa"`

Solo con `portal: "ensenanza"`, solo cuando va a escribir el modelo y solo si la búsqueda halló algo. Con los 3 primeros pasajes se llama a `pilo_graph_neighbors(p_refs, p_space, p_sources, p_public_only, p_limit: 3)`; sin sesión, `p_public_only = true` (un visitante nunca recibe un vecino `sesion`).

- **Sin 0115, o sin vecinos**: la respuesta es exactamente la de la fase 1 (mismos pasos, mismas fuentes, mismo pedido al modelo). Si la base no tiene la función, no se vuelve a preguntar por un minuto.
- **Con vecinos** (hasta 3):
  - van **después** de los pasajes directos en `sources` (de `meta` y de `done`) y llevan un campo más: `"via": "mapa"`. Los directos no llevan `via`. Se citan con su número, como cualquier fuente.
  - evento `step` nuevo, después de `memoria` y antes de `meta`:
    ```
    event: step
    data: {"id":"mapa","label":"Siguiendo las conexiones","state":"start"}

    event: step
    data: {"id":"mapa","label":"Siguiendo las conexiones","detail":"2 pasajes relacionados por Evaluación formativa y ODS 4","state":"done"}
    ```
    El detalle es una cuenta y, si se saben, los temas que los unen (cortos; nunca contenido, dinero ni datos de personas). También aparece en `steps` del `done` y hay una entrada `{ "step": "Mapa", … }` en `trail`.
  - en el pedido al modelo, la línea de cada pasaje dice dónde queda: `[2] Innovación educativa › Guía de aprendizaje activo › Evaluar para aprender · temas: Evaluación formativa, UNESCO` (como dato, por `safeData`).
  - si no cabe todo en el contexto, los vecinos son lo primero que se queda fuera.
  - una respuesta que cita un vecino que no es público no se guarda (misma regla de la fase 1).
- Sin IA (apagada, sin cupo) no se siguen conexiones: lo publicado sale tal cual.

### B.4 `moodle` — leer cursos por la API

```json
{ "action": "moodle", "space": "ensenanza", "step": "probar" | "categorias" | "cursos" | "curso", "category": 3, "course": 42 }
```
La dirección sale de `pilo_spaces.moodle_url` y el token de `pilo_space_secret.moodle_token` (leído con el rol de servicio): **ninguno de los dos viaja en el pedido de la página**. `probar` funciona con `moodle_on` apagado; los demás pasos lo exigen encendido.

| Paso | Llama a Moodle | Respuesta `200` |
|---|---|---|
| `probar` | `core_webservice_get_site_info` | `{ "ok": true, "site": { "name", "release", "url" }, "functions": { "<función>": true|false, … }, "usable": ["…"], "missing": ["…"], "ms": 412 }`. `functions` tiene las 10 de la lista cerrada y dice cuáles puede usar el token. Guarda `{name, release, functions}` en `pilo_spaces.moodle_site` y la fecha en `moodle_checked_at`. Nunca devuelve el usuario técnico. |
| `categorias` | `core_course_get_categories` | `{ "ok": true, "categories": [{ "id", "name", "parent", "depth", "courses" }] }` (solo las visibles) |
| `cursos` (`category`) | `core_course_get_courses_by_field` (`field=category`) | `{ "ok": true, "category": 3, "saved": 12, "courses": [{ "id", "shortname", "fullname", "category_id", "category_name", "time_modified", "visible" }] }`. Los anota con `pilo_moodle_courses_save` (no los elige ni cambia su visibilidad). |
| `curso` (`course`) | `core_course_get_courses_by_field` (`field=id`), `core_course_get_contents` y hasta 3 de `mod_{page,book,label,url,resource,folder}_get_*_by_courses` | ver abajo |

**`curso`**: uno por llamada, a lo sumo 5 pedidos a Moodle de 20 s cada uno y 90 s en total. Las funciones `mod_*` solo se piden para los tipos de actividad que el curso tiene y que `probar` marcó como usables (sin haber probado, solo las páginas); la que falle o no alcance va en `skipped` y el curso se lee con lo demás.
```json
{ "ok": true, "course": { "id": 42, "fullname": "Didáctica general", "shortname": "DID-01" }, "selected": false,
  "doc": "<uuid>", "unchanged": false, "passages": 37, "added": 37, "changed": 0, "removed": 0, "mapped": true,
  "activities": 14, "dropped": 0, "redacted": 2, "calls": 3, "skipped": [], "ms": 2380 }
```
| Campo | Significado |
|---|---|
| `doc` | el documento de la memoria (`pilo_docs`: `origin = 'moodle'`, `kind = 'curso'`, `source = 'moodle'`, `external_id` = id del curso). Sus pasajes heredan `vis` del curso (`sesion` de partida) |
| `unchanged` | `true` si la huella del contenido es la misma de la última lectura: no se reescribe nada (`added/changed/removed` en 0) |
| `selected` | si el curso está elegido (`pilo_moodle_courses.selected`). Un curso sin elegir se lee igual, pero la base deja sus pasajes ocultos |
| `mapped` | si quedó su estructura en el mapa (`pilo_doc_outline`; `false` sin 0115) |
| `activities` | actividades con texto propio · `dropped`: pasajes que pasaron de 400 · `redacted`: correos, teléfonos y documentos omitidos |
| `empty: true, passages: 0, note` | el curso no tiene contenido legible |

Qué se lee: el nombre y el resumen del curso y de cada sección, y de cada actividad su nombre y su descripción (más el contenido de las páginas y la presentación de libros, etiquetas, enlaces, recursos y carpetas). De un foro o una tarea, solo nombre y descripción. **Nunca** matrícula, participantes, notas, entregas, mensajes, publicaciones de foro, archivos ni fechas. Lo oculto (`visible = 0`, `uservisible = false`) no entra. Cada pasaje: `title` = el curso, `section` = «sección › actividad», `path` = la dirección de la actividad.

Errores (el texto nunca lleva el token ni la consulta de una dirección):

| Estado | `code` | Cuándo |
|---|---|---|
| `400` | `config` | falta la dirección o el token; la dirección no es https, es una IP (escrita como sea), `localhost`, un nombre de red interna, lleva usuario, puerto, consulta o ancla, o resuelve a una red interna |
| `400` | `apagado` | `moodle_on = false` (salvo `probar`) |
| `400` | — | falta `category` o `course` |
| `404` | `moodle` | Moodle no encontró el curso |
| `502` | `token` | Moodle no aceptó el token (`invalidtoken`) |
| `502` | `moodle` | otro error de Moodle (llega como JSON con `exception`, aun con HTTP 200), una respuesta que no es JSON o un estado distinto de 200 |
| `502` | `red` | no hubo conexión, o Moodle respondió con una redirección (no se siguen) |
| `504` | `tiempo` | Moodle tardó más de 20 s, o se acabaron los 90 s |
| `500` | `migracion` / `interno` | falta 0114/0116, o falló la base |

En `curso`, un fallo de Moodle queda además en `pilo_moodle_courses.status = 'error'` y `error` (limpio). Los estados que escribe: `leido`, `sin_cambios`, `vacio`, `error`.

Cómo se llama a Moodle: `POST {moodle_url}/webservice/rest/server.php` (ruta fija), `Content-Type: application/x-www-form-urlencoded`, cuerpo `wstoken=…&wsfunction=…&moodlewsrestformat=json&…`, `redirect: "error"`. Solo las funciones de `MOODLE_ALLOWED`; cualquier otra se rechaza antes de salir.

### B.5 Lo que la función le manda a la base (para quien mantenga 0114–0116)

- `pilo_graph_neighbors { p_refs, p_space, p_sources, p_public_only, p_limit: 3 }` y, si hay vecinos, lecturas de `pilo_edges` (`space`, `rel in (trata, cita)`, `from_id in (…)`) y `pilo_nodes` (`space`, `id in (…)`) para los temas.
- `pilo_map_status { p_space, p_doc }`, `pilo_map_pending { p_space, p_doc, p_limit: 18 }`, `pilo_map_topics { p_space, p_limit: 80 }`, `pilo_map_save { p_space, p_rows }`.
- Lectura de `pilo_space_secret` (`space`), actualización de `pilo_spaces` (`moodle_site`, `moodle_checked_at`), `pilo_moodle_courses_save { p_space, p_rows }`, lectura de `pilo_moodle_courses` (`space`, `course_id`), `pilo_moodle_course_set { p_space, p_course, p_patch: { doc_id?, content_hash?, status, error, synced?, time_modified? } }`.
- `pilo_doc_save { p_space, p_doc: { id, origin: "moodle", kind: "curso", source: "moodle", title, external_id, vis } }`, `pilo_doc_replace { p_doc, p_rows: [{ seq, title, section, body, path, cut }] }`, `pilo_doc_outline { p_doc, p_nodes: [{ id, label, path?, props? }], p_edges: [{ from, to, rel: "contiene" | "cita" }] }`. Estas dos últimas no llevan espacio: trabajan sobre el documento que `pilo_doc_save` creó o halló con `p_space` (están en la lista de `aislamiento-funcion.test.ts`, con esa razón).

### B.6 Sin verificar (no hay Deno ni un Moodle de prueba)

- La versión del Moodle de la UDES y cuáles funciones tiene activas: `probar` lo dice con el token real. Las cinco `mod_{book,label,url,resource,folder}_get_*_by_courses` están por confirmar.
- Que el modelo configurado devuelva JSON de forma fiable en `comprender` (solo Mistral recibe `response_format`); si no, el lote termina con `stopped: "formato"`.
- Los topes de tiempo contra la plataforma real (60 s por lote, 90 s por curso, frente al corte de 150 s).
- `Deno.resolveDns` en el entorno de Supabase: si no está disponible, la revisión de que el nombre no resuelva a una red interna se omite (queda la revisión del nombre y `redirect: "error"`).

---

## Anexo C · Un solo camino más ágil y un mapa que comprende más (2026-10-02)

Nada de lo anterior cambia de forma: mismos pedidos, mismos eventos, mismos campos. Lo que sigue **reemplaza** las cifras de B.2, B.5 y B.6 donde se indica.

### C.1 `preguntar`: el mismo camino para los dos espacios, con menos esperas en serie

Los dos Pilos ya pasaban por la misma función (`answerWork`) y la misma página; lo que cambia de un espacio a otro es configuración (fuentes, catálogo, persona, rol, mapa, cupo). Lo que hacía esperar de más —y pesaba más en `planeacion`, que tiene vectores y cifras en vivo— eran lecturas en fila que no dependían unas de otras. Ahora van a la vez, en los dos espacios:

| Antes (en serie) | Ahora |
|---|---|
| sesión (`auth.getUser` + `profiles`) → `pilo_ai_settings` + `pilo_ai_secret` | las tres lecturas a la vez |
| `pilo_visitor_hit` → sedes + catálogo + cupo | todo a la vez, junto con `pilo_embed_status` (queda en memoria un minuto). Pasado el límite se responde el mismo `429`, sin buscar ni llamar al modelo |
| vector de la pregunta (pedido al proveedor de embeddings, hasta 6 s) → búsqueda por palabras + por significado | la búsqueda por palabras (`pilo_memory_search`, `pilo_facts_search`) sale de inmediato; solo la de significado espera al vector |
| pasajes de la respuesta guardada → vecinos del mapa → malla | las tres a la vez |

No cambia: qué se busca, con qué filtros (`p_space`, `p_sources`, `p_public_only`, rol), el orden de prioridad de los bloques, el veto de dinero y de datos personales, los cupos, ni el orden de los pasos (`step`) ni del rastro (`trail`). En `trail`, los `ms` de «Respuestas guardadas», «Mapa» y «Malla» ya no se pueden leer por separado: esas tres lecturas corren juntas y su tiempo queda en el primer paso que se anota después.

### C.2 `comprender`: más tiempo, más pasajes, más temas (reemplaza las cifras de B.2)

| | Antes | Ahora |
|---|---|---|
| Presupuesto de un lote | 60 s fijos | `comprehendBudget(tope)`: el tope de la plataforma (`PILO_PLATFORM_CAP_MS`, 150 s de partida) menos 30 s de reserva, y nunca más que el corte por inactividad (150 s) → **120 s**; con un tope menor, lo que quede (30 s o más) |
| Pasajes por lote (`p_limit` de `pilo_map_pending`) | 18 | **36** (la base acepta hasta 60) |
| Pasajes por pedido al modelo | 6 | 6 (hasta 6 pedidos por lote, en serie: cada uno recibe los temas de los anteriores) |
| Temas por pasaje | 4 | **6** |
| Referencias por pasaje | 3 | **5** |
| Temas conocidos que se le ofrecen (`p_limit` de `pilo_map_topics`) | 80 | **200** (la base da hasta 300) |
| Texto leído de cada pasaje | 1.500 caracteres | **2.400** |
| `max_tokens` de cada pedido | 1.200 | **3.000** |
| Espera de un pedido | lo que quedara del lote | lo que quede del lote menos 8 s para guardar; no se empieza un pedido con menos de 12 s, ni con menos de 1,25 × lo que tardó el más lento del lote |

**Un lote que se queda sin tiempo ya no se detiene si guardó algo.** Cada pedido se guarda en cuanto vuelve. Si el tiempo no alcanza para otro pedido (o el que estaba en curso se corta) y el lote ya guardó pasajes, la respuesta llega **sin** `stopped` y con `cut: "tiempo"`: la página sigue sola con el lote siguiente (`saved > 0`, `done: false`). Solo cuando se acaba el tiempo **sin haber guardado nada** viene `stopped: "tiempo"`, como antes.

Campos nuevos de la respuesta de `lote` con IA, todos opcionales (quien no los lea no nota nada):

| Campo | Significado |
|---|---|
| `cut` | `"tiempo"`: el lote quedó corto por tiempo pero guardó; no es una detención. Viene con su `note` |
| `skipped` | pasajes del lote que no se alcanzaron a pedir al modelo: siguen pendientes |
| `ms` | lo que duró el lote |
| `budget_ms` | el presupuesto con que corrió |

En la bitácora, ese lote queda como `parcial · comprender · tiempo`.

**Migración 0118** (`0118_pilo_mapa_mas_temas.sql`): `pilo_map_save` guarda hasta 6 temas y 5 referencias por pasaje (0115 recortaba a 4 y 3). Es la misma función, con esos dos topes. Sin aplicarla nada falla: la base sigue guardando 4 y 3.

En B.5: `pilo_map_pending { …, p_limit: 36 }` y `pilo_map_topics { …, p_limit: 200 }`.

### C.3 Sin verificar

- Cuánto baja de verdad la espera en `preguntar`: la mejora es estructural (menos idas y vueltas en serie); no se midió contra la base ni contra el proveedor reales.
- Que el proveedor aguante 6 pedidos seguidos por lote sin `429`, y que un pedido de 6 pasajes con 2.400 caracteres cada uno quepa en el contexto del modelo configurado.
- El corte de 150 s por inactividad frente a un lote de 120 s más lo que tarde en guardar y contar.

## Anexo D · Las cifras por periodo y su resumen (2026-10-02)

Sin migración. La forma de la respuesta (`kind`, `text`, `sources`, eventos) no cambia: cambia qué cifras elige Pilo y cómo las dice.

### D.1 Lectura por periodo

- **De partida, por periodo académico.** Sin año ni periodo en la pregunta, `pickCuts` da el periodo más reciente con dato y, para compararlo, el periodo anterior y el mismo periodo del año anterior (los que existan). Con varias sedes, el periodo más reciente de cada una. Con un año («en 2024»), los periodos de ese año, cada uno por separado.
- **La cifra del año** solo si se pide («anual», «en el año 2024», «en todo 2024», «por año») o si el indicador solo se publica por año; en ese caso el pasaje y la plantilla dicen «Este indicador se publica por año: no tiene cifras por periodo.». Siempre se escribe como «año 2024», nunca como un «2024» suelto.
- **Nunca se suma ni se promedia.** La cifra del año es la que calculó el portal. Si se pide la del año y no está publicada, van los periodos por separado y se dice.
- **Periodo sin cifra:** va en `missing` («Sin cifra publicada para 2025-2: un dato sin reportar no es un cero») y se ofrece el corte más cercano que sí la tiene («El corte más cercano con cifra: …»).
- **Formas de periodo que se entienden** (`parseSlots`): `2025-1`, `2025-01`, `2025 I`, `2025-II`, `2024A`/`2024B`, «primer/segundo periodo o semestre», «1er periodo», «periodo 2», «periodo académico 2», «II semestre», «¿y en el segundo?», «este periodo» / «semestre actual» (el que está en curso según la fecha de Bogotá: enero–junio es el 1, julio–diciembre el 2), «el periodo pasado/anterior» (el anterior al que está en curso o, en un seguimiento, al que se venía hablando) y «el último periodo» (el más reciente con dato). Los dos periodos a la vez («2024-1 y 2024-2») no eligen uno: se dan los dos.
- `Slots` gana dos campos opcionales: `annual` (`true` pide la del año, `false` la pide por periodo) y `rel` (`"ultimo" | "actual" | "anterior"`). El paso «entender» los anota: «periodo en curso», «cifra del año»…
- Una respuesta guardada que cita el pasaje de memoria de un indicador (su cifra del año) ya no tapa la lectura por periodo de ese mismo indicador: mandan las cifras en vivo.

### D.2 El resumen

Cuando el corte trae varias cifras de una misma serie, `factSummary` arma de 2 a 4 líneas: el dato más reciente y su cambio frente al periodo anterior y al mismo periodo del año anterior, o la sede más alta y la más baja de un mismo corte.

- Los números los calcula el servidor (`figureChange`, `changeText`) con las cifras de `pilo_facts`. Un conteo cambia en valor y en porcentaje (un decimal); **un porcentaje cambia en puntos porcentuales**, sin «% de cambio»; sin base (cero) no hay porcentaje; sin uno de los dos datos no hay cálculo; un año no se compara con un periodo.
- Sin IA (`kind: "dato"`), el texto termina con `\n\n**En resumen**\n- …\n- …` (Markdown básico: una negrita y una lista).
- Con IA, el resumen va escrito dentro del pasaje `[CIFRAS]` («Resumen calculado con estas cifras…») y el pedido lleva la regla «Cómo das las cifras» (solo cuando hay bloque `[CIFRAS]`; sin cifras el pedido es el de siempre, byte a byte). Como el resumen está en el pasaje, `finishAnswer`/`verifyNumbers` conoce sus números; un cálculo que el modelo haga por su cuenta sigue saliendo en `unknown` y va a la bandeja como «revisar».

### D.3 La memoria

`factRows()` añade a la cifra del año de cada indicador que se reporta por periodo un campo `k` dentro de `series`: `"suma"`, `"promedio"`, `"p1"` o `"p2"` (la regla anual del portal y, con «último», el periodo del que salió). Con él Pilo dice «año 2024 (la del periodo 2, el último reportado)». Va dentro del `jsonb` de la serie: no hace falta migración. El pasaje de memoria de cada indicador (`cifrasRows`) también pasa a contarse por periodo.

**Hay que pulsar «Actualizar la memoria» una vez** para que lleguen `k` y los pasajes nuevos (y para que las respuestas guardadas con la cifra del año dejen de servirse). Con la memoria de antes la función responde igual por periodo (la serie ya traía los periodos); solo no dice de qué regla sale la cifra del año.

### D.4 Sin verificar

- Que el modelo real (Gemma por NVIDIA) cierre con el resumen y no recalcule: es una instrucción del pedido; lo que sí está garantizado es que un número que no esté en el pasaje se marca.
- Cómo pinta la página la lista del resumen en la respuesta `dato` y cómo la lee la voz.
- La frontera de «este periodo» (1 de julio) contra el calendario académico real de la universidad.


## Anexo E · Un solo cerebro, varios portales (0121, pasos 1 a 3) (2026-10-02)

Servidor: `supabase/functions/pilo-ia/index.ts` (`loadView`, `reader`, y los cambios de `answerWork`, `meshAround`, `comprehendMap`) · lógica pura: `logic.ts` (`portalView`, `PortalView`) · migración: `0121_pilo_portales.sql` · diseño: `.ccg/tasks/pilo-un-cerebro/propuesta.md` · avance: `.ccg/tasks/pilo-un-cerebro/avance.md`.

**La forma del pedido y de la respuesta de `preguntar` no cambia** (`kind`, `text`, `sources`, eventos, errores). Con la matriz de partida, el pedido al modelo es byte a byte el de antes en los dos portales. Lo que cambia es de dónde salen las fuentes y quién aplica el filtro.

### E.1 De dónde salen las fuentes

| Base | Fuentes de un pedido | Filtro de cada lectura |
|---|---|---|
| Sin 0121 | `SPACES` + los interruptores (`memory_sources`), como en el Anexo A | el de 0113: `p_space` y `p_public_only`, solo fuera de `planeacion` |
| Con 0121 | lo que devuelve `pilo_scope(portal, sesión, cuenta)`: las filas `mode = "casa"`, en el orden de la base | el de la base: cada lectura lleva **quién lee**, también en `planeacion` |

La función pregunta por la vista en cada `preguntar` (`pilo_scope`); un cambio en la matriz vale de inmediato. Si `pilo_scope` no existe o falla, sigue como «Sin 0121» y no vuelve a preguntar durante un minuto en esa instancia.

`pilo_scope` → filas `{ source, space, mode, vis, name }`:

- `mode`: `"casa"` (se busca) o `"visita"` (de otro ámbito; **todavía no se busca**: la función la guarda en `PortalView.visiting` y no la usa).
- `vis`: las visibilidades de pasaje que esa persona puede recibir (`["publico"]`, o `["publico","sesion"]` para el personal de la intranet).
- `name`: el nombre de la fuente para citarla. Para las fuentes de siempre manda el de `SPACES` (así el pedido no cambia); para las nuevas, el de la base.

Quién pregunta, para la base: `p_session = Boolean(rol de la intranet)`, `p_member = tiene cuenta de Pilo`. Los dos salen de la sesión que el servidor comprobó, nunca de un campo de la página. Una cuenta de Pilo nunca cuenta como personal.

### E.2 Lo que la función le manda a la base (con 0121)

`reader = { p_space: <portal>, p_public_only: <no es personal con sesión>, p_member: <cuenta de Pilo> }` va en **todas** las lecturas de la memoria de `preguntar`, en los dos portales:

| Función | Parámetros |
|---|---|
| `pilo_scope` | `{ p_portal, p_session, p_member }` |
| `pilo_memory_search` | `{ p_q, p_sources, p_limit: 8, ...reader }` |
| `pilo_memory_semantic` | `{ p_embedding, p_model, p_sources, p_limit: 8, p_min, ...reader }` |
| `pilo_answer_candidates` | `{ p_qnorm, ...reader, p_rol }` |
| `pilo_graph_neighbors` | `{ p_refs, p_space, p_member, p_sources, p_public_only, p_limit: 3 }` |
| `pilo_graph_around` | `{ p_ids, p_sources, p_up: 6, p_down: 1, p_limit: 160, ...reader }` |
| `pilo_memory_readable` (nueva) | `{ p_refs, ...reader }` → los pasajes de una guardada que ese portal y esa persona pueden leer, con su `vis` |

Con 0121 la función ya **no lee la tabla `pilo_memory` directo**: los pasajes de una respuesta guardada y la revisión «¿todo lo citado es público?» pasan por `pilo_memory_readable`. Una guardada se usa solo si la base devuelve **todos** los pasajes que cita.

Lo que no es lectura de la memoria sigue igual que en el Anexo A: el catálogo (`pilo_catalog_active`, `_semantic`), la bandeja, la bitácora, el cupo y las guardadas son por portal y por rol; en `planeacion` no viaja ningún parámetro nuevo. Las cifras en vivo (`pilo_facts_*`) se piden solo si la vista trae `cifras`.

`p_space` es ahora **el portal que pregunta** (los ids son los de siempre). Todos los parámetros nuevos de la base tienen valor de partida: la función desplegada antes de 0121 sigue llamando igual y recibe lo mismo (probado comparando una base sin 0121 y otra con ella).

### E.3 Lo que cambia para quien pregunta

- **Con la matriz de partida, nada.** Cada portal lee lo mismo que antes.
- Una respuesta guardada deja de servirse si cita algo que ese portal o esa persona ya no pueden leer (antes solo se miraba el espacio y, fuera de `planeacion`, la visibilidad). En `planeacion` esto incluye ahora a Impacto: una guardada que lo cita no se le repite a un visitante ni a una cuenta de Pilo.
- En `planeacion`, una respuesta que cita un pasaje «con sesión» (un documento del Pilo general) no se guarda para servirla después, igual que ya pasaba en Enseñanza.
- El mapa (`pilo_graph_neighbors`, paso `mapa`, `via: "mapa"`; Anexo B.3) también puede aparecer en `portal: "pregunta"` cuando sus documentos tengan temas. Sin vecinos no hay paso ni campo nuevo, como antes.

### E.4 `comprender` acepta `space: "planeacion"`

El Pilo de siempre tiene desde 0121 documentos propios (colecciones `institucional`, `normativa`, `lineamientos`) y, con ellos, su mapa. Reemplaza la fila de B.1:

| Caso | Respuesta |
|---|---|
| `comprender` con `space: "planeacion"` | como con cualquier otro espacio (`estado`, `lote`) |
| `moodle` con `space: "planeacion"` | `400` `{ "error": "Ese Pilo no tiene cursos de Moodle: los cursos no salen de su portal." }` |

En `comprender` y `moodle` el espacio viaja siempre a la base (`p_space`), también para `planeacion`. Sin 0121, `comprender` en `planeacion` responde su `estado` con cero pasajes (no hay documentos que comprender).

`indexar` no cambia: los pasajes de los documentos del Pilo general son de `planeacion` y entran en su índice de siempre.

### E.5 La matriz, para la intranet

- `pilo_portals` (`id`, `scope`, `name`, `written_for`, `matrix`) y `pilo_sources` (`id`, `scope`, `name`, `kind`, `staff_only`, `stays_home`): la administración las lee; nadie las escribe directo.
- `pilo_portal_update(p_portal, p_patch)` con `p_patch = { "matrix": { "<fuente>": "casa" | "no" }, "written_for"?: "…" }` → `{ portal, scope, matrix, written_for, name, effects: [{ source, name, from, to, passages, answers }] }`. Rechaza (`22023`) una fuente desconocida, un valor que no sea `casa`/`visita`/`no`, `casa` sobre una fuente de otro ámbito y, por ahora, **cualquier `visita`** («La lectura «de visita» todavía no está disponible…»).
- `memory_sources` (en `pilo_ai_settings` y en `pilo_spaces`) es el espejo de las celdas de casa: cambiar uno cambia el otro (disparadores en los dos sentidos).

### E.6 Orden de despliegue

Cualquiera de los dos órdenes sirve:

- **Función nueva, base sin 0121:** `pilo_scope` no existe → todo como antes.
- **Base con 0121, función de antes:** las llamadas de siempre siguen valiendo; el filtro de la base se aplica igual (la función vieja manda sus fuentes y la base las cruza con la matriz).

No volver a aplicar 0113, 0114, 0115 ni 0118 después de 0121: devuelven sus funciones (y, en 0113, las restricciones) a como eran. Si pasa, volver a aplicar 0121, que es idempotente y las deja de nuevo con una sola firma.

### E.7 Sin verificar

- La función en Deno contra la base real: las pruebas corren el archivo de la función con una base de mentira, y las funciones SQL en PGlite (sin pgvector: `pilo_memory_semantic` se prueba con un doble del operador `<=>`).
- Que PostgREST resuelva bien las funciones con sus parámetros nuevos tras `notify pgrst, 'reload schema'` (cada una queda con una sola firma, que es lo que evita la ambigüedad).
- La pantalla «Qué lee cada portal» y la carga de documentos del Pilo general en un navegador con la base real.


## Anexo F · Puentes entre ámbitos y lectura de visita (0122, pasos 4 a 6) (2026-10-02)

Servidor: `supabase/functions/pilo-ia/index.ts` (`visitOf` y `searchFacts` en `answerWork`, `proposeBridges`, y una línea en `comprehendMap`) · lógica pura: `logic.ts` (`homeFallsShort`, `coversQuestion`, `visitPassages`, `visitLabel`, `visitRule`, `visitLead`, `visitAnswer`, `askerKind`, `buildBridgeMessages`, `parseBridges`, `bridgeWhy`) · migración: `0122_pilo_puentes.sql` · avance: `.ccg/tasks/pilo-un-cerebro/avance.md`.

**Con la matriz de partida nada cambia**: sin ninguna celda «De visita», `preguntar` no llama a ninguna función nueva de lectura y el pedido al modelo es byte a byte el de antes (`rol.esperado.json` no cambió; regresión en `funcion-preguntar.test.ts`). Lo único que viaja distinto es que las cifras en vivo llevan ahora quién lee (F.4).

### F.1 Cuándo entra algo de otro ámbito

Solo si la vista del portal (`pilo_scope`) trae alguna fuente con `mode = "visita"`, y solo por dos caminos:

| Camino | Cuándo | Llamada |
|---|---|---|
| `alcance` | lo de casa no alcanza (`homeFallsShort`) | `pilo_memory_visit { p_q, p_limit: 4, ...reader }` |
| `puente` | un puente **aprobado** une uno de los 3 primeros pasajes de casa con un pasaje de otro ámbito; solo cuando va a escribir el modelo | `pilo_bridge_neighbors { p_refs, ...reader, p_limit: 2 }` |

**«Lo de casa no alcanza»**, entera: la pregunta no es un saludo ni conversación, deja al menos una palabra clave (`extractKeywords`) y, tras buscar en casa, **no hay** respuesta oficial del catálogo, **ni** respuesta guardada que sirva, **ni** cifra en vivo de casa, **ni** un pasaje de casa que traiga al menos la mitad de las palabras clave de la pregunta (`coversQuestion`, `VISIT_COVERAGE = 0.5`). Con cualquiera de las cuatro, lo de casa alcanza y `pilo_memory_visit` no se llama.

Lo que entra de visita:

- va **después** de lo de casa en su bloque (`[CIFRAS]` o `[PASAJES]`) y es lo primero que se queda fuera si no cabe;
- a lo sumo **2** por respuesta (`VISIT_MAX`), sumando los dos caminos y la cifra;
- por `alcance`, además, tiene que traer la mitad de las palabras clave (el mismo criterio que a lo de casa);
- se revisa otra vez en la función (`visitPassages`): fuente que la vista trae «de visita», ámbito distinto del de casa, no repetido;
- **no se guarda**: una respuesta que cita un pasaje de visita no va a `pilo_answers` (y aunque fuera, las búsquedas de guardadas solo leen lo de casa: nunca estaría fresca).

Leer de visita no eleva permisos: la base aplica el mismo filtro con la otra celda. Lo `oculto` nunca; lo `sesion` solo al personal de la intranet (una cuenta de Pilo no lo es); Impacto solo al personal; Moodle no sale de su portal aunque la celda o un puente lo digan.

### F.2 Lo que cambia en la respuesta (todo opcional: quien no lo lea no nota nada)

Cada fuente de otro ámbito, en `sources` (de `meta` y de `done`, y del JSON sin stream), lleva:

```json
{ "n": 2, "ref": "doc:…:1", "source": "politicas", "title": "Política de evaluación", "…": "…",
  "via": "visita", "from": "De Pilo en Enseñanza · Políticas institucionales", "scope": "ensenanza",
  "written_for": "profesores y estudiantes" }
```

| Campo | Significado |
|---|---|
| `via` | `"visita"` (lo de casa no alcanzó) o `"puente"` (lo trajo un puente aprobado). Las de casa no lo llevan (salvo `"mapa"`, como antes) |
| `from` | la procedencia, escrita por el servidor: «De <portal de ese ámbito> · <fuente>». La página la muestra junto a la cita |
| `scope` | el ámbito del pasaje |
| `written_for` | solo si quien pregunta **no** es el público de ese ámbito (`pilo_portals.audience`): para quién fue preparado |

Evento `step` nuevo, solo cuando entró algo de visita, después de la búsqueda y antes de `meta`:

```
event: step
data: {"id":"visita","label":"Consultando otros ámbitos","detail":"1 pasaje de otro ámbito: Pilo en Enseñanza · Políticas institucionales","state":"done"}
```

y una entrada `{ "step": "Otros ámbitos", … }` en `trail`.

**En el pedido al modelo**, solo si hay algo de visita:

- la línea de la fuente empieza con su procedencia, como dato: `[2] (De Pilo en Enseñanza · Políticas institucionales) Política de evaluación · Capítulo 2`;
- va la regla fija `VISIT_RULE`, fuera del bloque de datos: presentarla como «esto viene de…» con ese nombre y, si contradice a una fuente de casa, responder con la de casa y decir que hay otra fuente que dice algo distinto;
- por cada ámbito cuyo público no es quien pregunta: «Lo de «Pilo en Enseñanza» fue preparado para profesores y estudiantes: dilo en una frase al usarlo.»

Quién pregunta, para esto (`askerKind`): `personal` (sesión de la intranet), el rol de la cuenta de Pilo, el rol que eligió un visitante (`estudiante`/`profesor`) o `visitante`. No es un permiso.

**Sin IA** (apagada, sin cupo, o si el proveedor falla): si lo de casa no alcanzó y otro ámbito sí lo tiene, la respuesta es `kind: "extracto"` con la plantilla del servidor:

> No encontré eso en lo de este portal, pero sí en otro ámbito de Pilo. Esto viene de Pilo en Enseñanza · Políticas institucionales, y fue preparado para profesores y estudiantes. Política de evaluación: La evaluación formativa tiene 3 momentos en cada curso. [1]

Sin IA no se siguen puentes (como el mapa).

### F.3 Los puentes (`pilo_bridges`)

Tabla propia —no columnas en `pilo_edges`—: las búsquedas recorren `pilo_edges`, y una relación entre ámbitos no debe poder seguirse por accidente. Un puente: `a_scope`/`a_id` ↔ `b_scope`/`b_id` (siempre con el ámbito menor primero, nunca dentro de un mismo ámbito), `kind` (`referencia`, `nombre`, `tema`, `relacion`), `why`, `origin` (`reglas` | `ia` | `admin`) y `status` (`propuesta` | `aprobada` | `rechazada`). Un extremo es un punto de la malla de su ámbito: un nodo (en Planeación, el ref de su pasaje), un documento (`doc:<uuid>`) o un tema o referencia que ese ámbito usa.

| Función | Quién | Qué hace |
|---|---|---|
| `pilo_bridges_sync()` | servicio o administración | calcula y guarda los de reglas. Se aprueban solos: la misma norma u ODS nombrados en los dos ámbitos, y un punto del Plan de Desarrollo y un punto de otro ámbito que se llaman igual. Quedan como `propuesta` (origen `ia`): un tema compartido y una referencia compartida que no es norma ni ODS. Lo que ya existe no se toca; lo que las reglas ya no dan se quita si nadie lo decidió a mano |
| `pilo_bridges_list(p_status?, p_limit?)` | servicio o administración | los puentes, los propuestos primero |
| `pilo_bridge_set(p_id, p_status)` | **solo administración** (ni el servicio) | aprueba o rechaza **uno** |
| `pilo_bridges_status(p_scope?)` | servicio o administración | cuentas, y cuántos puntos faltan por revisar |
| `pilo_bridge_candidates`, `pilo_bridge_targets`, `pilo_bridges_propose` | servicio o administración | lo que usa la acción `puentes` (F.5) |

La función llama a `pilo_bridges_sync()` al final de un lote de `comprender` que guardó algo (sin 0122, la llamada falla y se ignora).

### F.4 Las cifras en vivo pasan por la matriz

`pilo_facts_search` y `pilo_facts_semantic` ganan `p_space`, `p_public_only`, `p_member` (con valor de partida): la base las da solo si la celda `cifras` de ese portal las deja leer a esa persona, de casa o de visita. La función manda `reader` en las dos. Un portal con `cifras` en «visita» las recibe solo por el camino `alcance`, como una fuente más (`ref: "dato:…"`, `via: "visita"`, `from: "De Pilo de la Universidad · UDES en Cifras"`); el verificador de números sigue valiendo.

### F.5 `puentes` — la IA propone, la administración revisa

```json
{ "action": "puentes", "step": "estado" | "reglas" | "lote" }
```

Solo administración (`403` `{ "error": "Solo la administración propone puentes entre los ámbitos de Pilo." }`). No gasta cupo; queda en `pilo_ai_log` con `action = 'puentes'`.

| Paso | Respuesta `200` |
|---|---|
| `estado` | `{ "ok": true, "ai": true, "status": { "total", "aprobadas", "propuestas", "rechazadas", "reglas", "ia", "pending", "scanned", "targets" } }`. Sin IA: `"ai": false, "note": "Sin IA no se proponen puentes nuevos. Los puentes por reglas … siguen funcionando. …"` |
| `reglas` | `{ "ok": true, "ai": …, "rules": { "found", "added", "removed", "total", "aprobadas", "propuestas", "rechazadas" }, "status": {…} }`. Funciona sin IA |
| `lote` | `{ "ok": true, "ai": true, "asked": 24, "proposed": 3, "discarded": 0, "calls": 2, "done": false, "ms", "budget_ms", "status": {…} }`, y `stopped` (`limite_proveedor`, `proveedor`, `red`, `tiempo`, `formato`) con su `note` o `cut: "tiempo"`, como `comprender` |

`lote`: hasta 4 pedidos en serie de 12 puntos sin revisar de Planeación (`pilo_bridge_candidates`) contra los 60 documentos, temas y referencias más usados de los otros ámbitos (`pilo_bridge_targets`), con el presupuesto de `comprehendBudget`. Al modelo le llegan **solo nombres**, como datos entre `<<<DATOS … DATOS>>>`; responde `{"puentes":[{"a":1,"b":3,"porque":"…"}]}` con **números** de las dos listas, así que no puede inventar un id. Se descarta (`parseBridges`, `bridgeWhy`) lo que no señala un punto de cada lista, lo que une dos puntos del mismo ámbito, lo repetido, más de 2 por punto y lo que no trae un porqué de 12 a 180 caracteres sin direcciones web, órdenes, marcas del pedido, datos de personas ni dinero. La base (`pilo_bridges_propose`) revisa otra vez que cada extremo exista en su ámbito y guarda `status = 'propuesta'`, `origin = 'ia'`; lo que ya existe —también lo rechazado— no se toca: no se vuelve a proponer. Una respuesta ilegible detiene el lote (`stopped: "formato"`) sin anotar nada como revisado.

Errores: `400` `{ "error": "Paso desconocido." }`; sin 0122, `500` `{ "error": "Falta la migración 0122 de los puentes de Mr. Pilo.", "advice": "…", "code": "migracion" }`.

### F.6 La matriz: «De visita»

- `pilo_portal_update(p_portal, { "matrix": { "<fuente>": "casa" | "visita" | "no" }, "expect"?: { "<fuente>": "<valor que veía>" } })`. «visita» solo en fuentes de otro ámbito que puedan salir de su casa; rechaza `visita` sobre lo propio y sobre Moodle. Con `expect`, si la celda ya no está así (otra pestaña la cambió) no escribe nada (`40001`, «Esa celda cambió mientras tanto…»).
- `effects[]` gana `public`, `session` (pasajes públicos y «con sesión»), `bridges` (puentes aprobados entre los dos ámbitos), `staff_only`, `home` (el portal de esa fuente) y `written_for`.
- `pilo_portal_preview(p_portal, p_source, p_value)` devuelve ese mismo efecto **sin cambiar nada**: la pantalla lo pide antes de confirmar «De visita».
- `pilo_portals.audience` (`text[]`): el público de cada ámbito. De partida: Enseñanza `{estudiante, profesor}`, Planeación `{personal}`.
- `memory_sources` sigue siendo el espejo de las celdas **de casa**: nunca lleva una fuente de otro ámbito ni el valor «visita», y guardar los interruptores no toca una celda de visita.

### F.7 `comprender` también sobre los pasajes de portal

`pilo_map_pending`, `pilo_map_status` y `pilo_map_save` dejan de exigir que el pasaje sea de un documento. En Enseñanza nada cambia (todos lo son). En Planeación entran además los pasajes de sus portales (los de documentos van primero), que reutilizan los temas que ya existen; la relación queda en su ámbito y los vecinos no cruzan. `status.total` de `comprender` en `planeacion` cuenta ahora esos pasajes. `pilo_map_prune` quita además las relaciones de un pasaje de portal que «Actualizar la memoria» borró.

### F.8 Orden de despliegue

`0122` requiere `0121`. Los dos órdenes sirven:

- **Función nueva, base con 0121 y sin 0122:** las cifras se piden primero con quién lee; la base no conoce esos parámetros, la función las pide como antes y no insiste por un minuto. Las lecturas de visita no existen: si alguien dejó a mano una celda «visita», la función no lee nada de ella. `puentes` responde `500` con `code: "migracion"`.
- **Base con 0122, función de antes:** todas sus llamadas siguen valiendo (parámetros nuevos con valor de partida). No lee nada de visita, diga lo que diga la matriz.

No volver a aplicar 0121 después de 0122 (devolvería `pilo_portal_update` y las funciones del mapa a como eran); si pasa, aplicar 0122 otra vez.

### F.9 Sin verificar

- Nada corrió contra la base real ni en Deno: la función se probó con una base de mentira; el SQL, en PGlite.
- Que el modelo real presente lo de visita con «esto viene de…» y respete «manda lo de casa»: son instrucciones del pedido. Lo garantizado es lo que hace el servidor: la procedencia en la fuente, el orden, el tope y que no se guarde.
- Que el modelo real devuelva JSON legible en `puentes` y que sus propuestas sean buenas: por eso entran como propuesta.
- El costo de `pilo_bridges_sync()` y de `pilo_bridge_neighbors` con la malla real (miles de nodos).
- La pantalla de la matriz, la bandeja de puentes y la procedencia en la página pública, en un navegador.
