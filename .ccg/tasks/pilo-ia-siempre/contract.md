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
