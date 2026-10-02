# Contrato · Usuarios de Pilo (0120)

Cuentas que solo sirven para Mr. Pilo. No son usuarios de la intranet: no tienen fila en `profiles`
y ninguna política de la intranet las reconoce. Lo que está aquí ya existe y está probado
(`tests/db/pilo-usuarios.test.ts`, `src/components/pilo/ai/funcion-preguntar.test.ts`).

## Reglas del dueño
- Solo correos `@mail.udes.edu.co`, `@udes.edu.co`, `@bucaramanga.udes.edu.co`, `@cucuta.udes.edu.co`, `@valledupar.udes.edu.co`.
- `@mail.udes.edu.co` → estudiante o profesor. Los demás → administrativo o profesor.
- La sede sale del dominio cuando lo dice; si no (`@mail…`, `@udes.edu.co`), se pregunta: Bucaramanga, Cúcuta, Valledupar o Bogotá.
- Se entra con **nombre de usuario** y contraseña. El registro lo guía Pilo.
- Pilo también se usa **sin cuenta**: en ese caso solo se pregunta cómo quiere que Pilo la llame y en qué tono.
  Quien se registra tiene funciones ampliadas, respuestas a su medida y más cupo.
- La tabla «Usuarios de Pilo» de la intranet es solo para administración.

## Base (migración `0120_pilo_usuarios.sql`)
- `pilo_users`: `id` (= auth.users), `username`, `full_name`, `email`, `rol` (`estudiante|profesor|administrativo`),
  `campus` (`''|bucaramanga|cucuta|valledupar|bogota`), `status` (`activa|suspendida`), `nick`, `tone` (`cercano|formal|directo`),
  `length` (`corta|normal|detallada`), `about` (≤400), `program` (≤120), `created_at`, `last_seen_at`.
  RLS: cada quien **lee** su fila; la administración lee, cambia y borra todas. La persona no escribe directo.
- `pilo_user_update_prefs(p_patch jsonb) → pilo_users`: la persona cambia `nick`, `tone`, `length`, `about`, `program` y,
  solo si su correo no la fija, `campus`. Cualquier otra clave se ignora.
- `pilo_users_admin()` → filas con `confirmed` (confirmó su correo). Solo administración.
- `pilo_is_member()` → boolean.
- `pilo_email_rule(p_email) → { roles: string[], campus: string } | null` (anon puede llamarla: sirve para validar en vivo).
- `pilo_user_saved`: `id`, `user_id` (por defecto el de la sesión), `space` (`planeacion|ensenanza`), `question` (≤600),
  `answer` (≤12000), `sources jsonb` (lista), `created_at`. RLS: solo su dueño con cuenta activa (select, insert, delete).
  Tope de 300 por persona (el insert falla con un mensaje claro).
- `pilo_extras` gana `member_factor` (1–20, partida 3) y `member_max_tokens` (400–4000, partida 1200).

## Función `pilo-cuentas` (`supabase/functions/pilo-cuentas/index.ts`)
POST JSON a `functions/v1/pilo-cuentas` (con la clave anónima; no hace falta sesión salvo `eliminar`).
| Acción | Cuerpo | Respuesta |
|---|---|---|
| `usuario` | `{ username }` | `{ free: true }` o `{ free: false, reason }` |
| `registrar` | `{ email, rol, campus?, full_name, username, password, nick?, tone? }` | `{ ok: true }` — se envía un correo de confirmación; hasta confirmarlo no se puede entrar |
| `ingresar` | `{ username, password }` | `{ session: { access_token, refresh_token } }` → `supabase.auth.setSession(...)` |
| `reenviar` | `{ username }` | `{ ok: true }` siempre |
| `recuperar` | `{ username }` | `{ ok: true }` siempre; el correo lleva a `/app/cuenta?clave=1` |
| `eliminar` | `{ user_id }` (sesión de administración) | `{ ok: true }` |

Errores: `{ error, code }` con `code` en `correo | rol | sede | nombre | usuario | clave | existe | intranet | correos | alta |
credenciales | sin_confirmar | suspendida | bloqueada | limite | migracion`. `limite` trae `retry_after` (segundos).
El enlace de confirmación abre `/app/cuenta?confirmada=1` con la sesión ya iniciada (supabase-js la toma de la dirección).
Reglas del usuario: `^[a-z0-9._]{4,20}$`, sin punto o guion bajo al inicio, al final ni dobles; hay nombres reservados.
Contraseña: 8 a 72 caracteres, con una letra y un número.

## Función `pilo-ia`
- Una cuenta de Pilo activa llega **sin rol de intranet** y con `member`. Cuenta como sesión para `preguntar` y `voz`
  (audiencia «Con sesión») y para las funciones ampliadas; nunca como administración, y **no** ve los pasajes
  «con sesión» ni la memoria de Impacto (siguen siendo del personal).
- `canUse(rules, portal, action, role, member = false)` en `src/components/pilo/ai/logic.ts`.
- `extraAllowed(aud, role)`: para una cuenta de Pilo pase `"miembro"` como `role`.
- En Enseñanza, el rol que cuenta es el de la cuenta (estudiante o profesor), no el que mande la página.
- Sin cuenta: `preguntar` acepta `visitor: { nick, tone }` (nombre de hasta 30 letras; tono `cercano|formal|directo`).
- Con cuenta: límite por persona × `member_factor` y respuestas hasta `member_max_tokens`.
- Las respuestas a la medida de una cuenta (o de un visitante con nombre) no se guardan en las respuestas compartidas.

## Pendiente (otro paquete)
- «Mis clases» (Moodle con la cuenta de la persona, beta, solo lectura y recordatorios).
- Documentos para el Pilo de la Universidad y memoria selectiva entre los dos Pilos.
- «Pilo me ayuda» (notas del estudiante): por ahora solo diseño.
