# Pilo at Work: guía del dueño

Pilo at Work es el agente de IA para las oficinas de la universidad. Vive dentro del portal, en `/work`, como una app de escritorio instalable (su propio manifiesto, su service worker y su alcance, independientes de la app móvil de Pilo en `/app`). Entran personas con un **rol asignado** y, desde la 0261, **invitados** (cuenta UDES verificada con perfil completo).

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

Quien crea su cuenta, verifica el código y completa su perfil entra como **invitado** y aparece en «Perfiles nuevos de Pilo At Work» (arriba de esa pantalla y desde Usuarios y roles).

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

- Sin fila en `pw_roles`, ninguna tabla `pw_*` se lee ni se escribe y las funciones `pw-microsoft` y `pw-avisos` responden 403 (el invitado cae aquí: `pw_mi_rol()` no cambió). La interfaz solo lo refleja.
- «Acceso y roles», «Memoria colectiva» y «Cómo está construido» dependen de `pw_es_admin()`; sus rutas no abren para los demás.
- La memoria personal es de cada persona. El Pilo de un equipo solo lee las reglas que su dueña aceptó compartir (una fila en `pw_equipo_aportes`), y la colectiva.
- Nunca se envía ni se borra correo. Organizar, borradores y reuniones piden aprobación en cada caso y las etiquetas se pueden deshacer.
- Los archivos Excel/CSV se leen en un Web Worker del navegador. A la IA solo viaja la pregunta, el esquema que la persona dejó permitido y los agregados que aprobó; las columnas sensibles detectadas quedan cerradas. El contador «filas enviadas» es 0.
- La bitácora (`pw_bitacora`) dice quién usó qué y cuándo; nunca el contenido.

## Tanda 2026-10-28: qué hay que hacer para activarla

### Migraciones nuevas (en este orden, tras 0243–0245)
1. `0246_pw_perfiles.sql`: «Mi perfil» (`pw_perfiles`, solo la dueña lee y escribe su fila).
2. `0247_pw_config.sql`: configuración global (`pw_config`), funciones de uso y retención. Programar la retención: `select cron.schedule('pw-purgar-bitacora', '15 3 * * *', $$select public.pw_purgar_bitacora()$$);`

### Funciones que hay que volver a copiar al servidor (y reiniciar)
- `supabase/functions/pilo-work/` (`index.ts` y `proveedor.ts`)
- `supabase/functions/pw-microsoft/`
`pw-avisos` no cambió.

### Permisos nuevos en Microsoft Entra (los concede TIC)
Además de los de correo y agenda, agregue permisos **delegados** de Microsoft Graph: `Files.ReadWrite` y `Sites.ReadWrite.All` (consentimiento de administrador). Siguen sin pedirse `Mail.Send` ni permisos de administración de sitios. **Cada persona debe pulsar «Conectar archivos»** (en Conectores o en Archivos): los alcances se suman a los de correo y agenda, no los reemplazan. Si falta el consentimiento, el mensaje dice que se pida a TIC.

### Límites de subida (verificados en la documentación de Microsoft Graph, 2026-10)
- Subida simple (`PUT /content`): hasta 250 MB según Microsoft; aquí solo se usa hasta **1 MiB** por la función.
- Sesión de subida (`createUploadSession`): trozos múltiplos de 320 KiB, menos de 60 MiB por petición, recomendado 5–10 MiB y reanudable (`nextExpectedRanges`). Aquí: trozos de **3 932 160 bytes** (12 × 320 KiB), enviados **directo del navegador** a la `uploadUrl` (ya autenticada; no lleva `Authorization`), con 3 reintentos, reanudación, progreso y cancelación. Si el navegador no llega (CORS/red) pasa a relevo por `pw-microsoft` (`archivos_trozo`).
- Tope en la interfaz: **100 MB** (constante `MAX_SUBIDA_MB` y límite del servidor; `pw_config.subida_max_mb` puede bajarlo). Lectura de archivos: hasta 8 MB, texto y .docx.
- `conflictBehavior: "rename"` por defecto; «Reemplazar» solo con casilla explícita.
Fuentes: learn.microsoft.com/graph/api/driveitem-createuploadsession y driveitem-put-content.

### Configuración desde Planeación
`/admin/pilo-work` (Sistema, junto a Mr. Pilo): modelos por nivel, umbrales, límites, funciones habilitadas, estado de Microsoft 365 y uso. En el panel de Mr. Pilo debe estar el proveedor = Mistral con su modelo rápido y la **clave de NVIDIA** presente.

## Invitados y perfil (migración 0261)

- **Acceso**: Cuenta (Microsoft, o correo UDES y contraseña; el usuario sale del correo) · Código (Microsoft lo salta) · Perfil · Listo. El Perfil (`PerfilPaso.tsx`) pide nombre completo, sede, tipo (administrativo o profesor), dependencia (selector con búsqueda sobre `units`), cargo y, si es profesor, vinculación; y los datos opcionales del carnet. Guarda con `pw_guardar_perfil` (solicitud para Planeación, con `unit_id`) y en `pilo_user_perfil` (reutiliza `pilo-app/carnet`).
- **Invitado**: `pw_mi_nivel()` devuelve el rol de `pw_roles` o `invitado` (correo UDES verificado y `pw_solicitudes.perfil_completo`). `pw_mi_rol()` sigue devolviendo solo roles reales, así que todas las políticas RLS siguen cerradas para el invitado. Solo ve Inicio, Chat y Datos en este equipo; lo demás dice «Disponible con rol». La función `pilo-work` le deja chat (sin equipo), redactar, sugerir, transformar y revisar, sin memoria colectiva, skills, herramientas del servidor ni Microsoft.
- **Límite del invitado**: `pw_config.limite_hora_invitado` (10 por defecto), en `/admin/pilo-work` · Límites de uso.
- **Administración**: «Perfiles nuevos de Pilo At Work» en Acceso y roles (`AdmRoles.tsx`). «Aprobar y asignar» llama a `pw_asignar_rol(user, rol, unidad, papel)`: crea/actualiza `profiles` (sin tocar el rol de intranet), `unit_members` (visor, editor o jefe; en pantalla Consulta, Contribuyente, Gestor) y `pw_roles`. «Dejar como invitado» llama a `pw_dejar_invitado`.
- **Sin hacer**: el aviso por correo al aprobar (la función `correos` no tiene una acción para esto).
- **Para activarlo**: aplicar `0261_pw_invitados_perfil.sql` y volver a copiar la carpeta `supabase/functions/pilo-work` (`index.ts` y `proveedor.ts`) al servidor, y reiniciar.
