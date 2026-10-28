# Pilo at Work: guía del dueño

Pilo at Work es el agente de IA para las oficinas de la universidad. Vive dentro del portal, en `/work`, como una app de escritorio instalable (su propio manifiesto, su service worker y su alcance, independientes de la app móvil de Pilo en `/app`). Solo entran personas con un **rol asignado**.

## Qué hay

| Parte | Dónde |
|---|---|
| App (React) | `src/modules/pilo-work/` (ruta `/work/*` en `src/App.tsx`) |
| PWA | `public/work-manifest.webmanifest`, `public/work-sw.js`, cabeceras en `vercel.json`, inyección en `index.html` |
| Chat y Cowork (IA) | función `supabase/functions/pilo-work/` |
| Microsoft 365 | función `supabase/functions/pw-microsoft/` |
| Avisos (Web Push) | función `supabase/functions/pw-avisos/` |
| Datos | migraciones `0243_pw_base`, `0244_pw_microsoft_avisos`, `0245_pw_equipos` (tablas `pw_*`) |

La IA usa el **mismo proveedor y las mismas claves que Pilo** (`pilo_ai_settings` y `pilo_ai_secret`, Mistral con NVIDIA de apoyo). No hay claves nuevas de IA ni en el navegador.

## Pasos, en este orden

### 1. Migraciones (en el SQL editor del servidor, una tras otra)

1. `0243_pw_base.sql`: roles, memoria personal y colectiva, propuestas, skills, documentos, bitácora.
2. `0244_pw_microsoft_avisos.sql`: tokens cifrados de Microsoft, suscripciones push y recordatorios.
3. `0245_pw_equipos.sql`: equipos, aportes con consentimiento y conversación en Realtime.

Cada una es idempotente. Al final de la 0244 hay instrucciones (comentadas) para programar los avisos.

### 2. Funciones (copiar la carpeta al servidor y reiniciar, como en `docs/correos-en-coolify.md`)

- `supabase/functions/pilo-work/` (necesita las variables normales de Supabase; `PW_LIMITE_HORA` es opcional y vale 60 mensajes por hora y persona).
- `supabase/functions/pw-microsoft/` (ver paso 4).
- `supabase/functions/pw-avisos/` (ver paso 5).

Hacen falta las funciones `pilo-cuentas` y `correos` que ya existen: la cuenta, el código de seis dígitos y «Continuar con Microsoft» salen de ahí.

### 3. Dar el primer rol

Quien administra el portal (rol `admin` en la intranet) **es administración de Pilo at Work sin fila**. Esa persona entra a `/work` con su correo y contraseña de la intranet y, en «Acceso y roles», asigna los demás roles:

| Rol | Qué puede |
|---|---|
| Colaborador | Chat, Cowork, agenda, datos locales, equipos y memoria personal |
| Colaborador con correo | Suma el correo de Microsoft 365 |
| Coordinación | Como el anterior |
| Administración | Asigna roles, cura la memoria colectiva, ve el uso (sin contenidos) y «Cómo está construido» |

Quien crea su cuenta y verifica el código queda como «Pide rol» en esa pantalla.

En Supabase Auth, añada `https://planeacion.udes.edu.co/work` (o `https://planeacion.udes.edu.co/**`) a las **URL de redirección permitidas**, para «Continuar con Microsoft» desde `/work`.

### 4. Microsoft 365 (lo hace TIC)

1. En **Microsoft Entra ID** › Registros de aplicaciones › Nuevo registro. Un solo inquilino (el de la UDES).
2. Plataforma **Web** con URI de redirección: `https://planeacion.udes.edu.co/work/microsoft`
3. Permisos de API (Microsoft Graph, **delegados**): `User.Read`, `offline_access`, `Mail.Read`, `Mail.ReadWrite`, `Calendars.ReadWrite`, `OnlineMeetings.ReadWrite`. **No** agregue `Mail.Send`: Pilo no envía ni borra correo. Conceda el consentimiento del administrador (o deje que cada persona consienta).
4. Certificados y secretos › nuevo secreto de cliente.
5. Variables de entorno de la función `pw-microsoft` (nunca en archivos):
   - `MS_CLIENT_ID`, `MS_TENANT_ID`, `MS_CLIENT_SECRET`
   - `MS_REDIRECT_URI` = `https://planeacion.udes.edu.co/work/microsoft`
   - `PW_TOKEN_KEY` = una frase larga y aleatoria (de ella sale la clave AES-GCM con que se cifran los tokens). Si la cambia, todas las personas deben volver a conectar Microsoft.

Mientras no estén esas variables, la app lo dice («aún no está configurado por TIC») y todo lo demás funciona.

### 5. Avisos con la app cerrada (Web Push)

1. Genere un par de llaves VAPID: con la clave de servicio, `POST /functions/v1/pw-avisos` con `{"action":"generar_claves"}`. Devuelve `public` y `private`; no se guardan en ningún sitio.
2. Variables de la función `pw-avisos`: `PW_VAPID_PUBLIC`, `PW_VAPID_PRIVATE`, `PW_VAPID_SUBJECT` (un `mailto:` de Planeación).
3. Programe el envío cada 5 minutos: pg_cron o el cron de Coolify, con las instrucciones al final de `0244_pw_microsoft_avisos.sql`. `pw-avisos` primero trae las reuniones próximas de quienes conectaron su calendario y luego avisa 10 minutos antes.

Sin esto, los avisos solo salen mientras la app está abierta.

### 6. Publicar la web

Desplegar el portal como siempre. `vercel.json` ya sirve `work-sw.js` con `Service-Worker-Allowed: /work` y el manifiesto con su tipo. Para instalarla, abrir `https://planeacion.udes.edu.co/work` en Edge o Chrome y usar «Instalar».

## Reglas que el servidor impone

- Sin fila en `pw_roles`, ninguna tabla `pw_*` se lee ni se escribe y las funciones responden 403. La interfaz solo lo refleja.
- «Acceso y roles», «Memoria colectiva» y «Cómo está construido» dependen de `pw_es_admin()`; sus rutas no abren para los demás.
- La memoria personal es de cada persona. El Pilo de un equipo solo lee las reglas que su dueña aceptó compartir (una fila en `pw_equipo_aportes`), y la colectiva.
- Nunca se envía ni se borra correo. Organizar, borradores y reuniones piden aprobación en cada caso y las etiquetas se pueden deshacer.
- Los archivos Excel/CSV se leen en un Web Worker del navegador. A la IA solo viaja la pregunta, el esquema que la persona dejó permitido y los agregados que aprobó; las columnas sensibles detectadas quedan cerradas. El contador «filas enviadas» es 0.
- La bitácora (`pw_bitacora`) dice quién usó qué y cuándo; nunca el contenido.
