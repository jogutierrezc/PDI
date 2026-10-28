# Pilo at Work: avance

Última actualización: 2026-10-28.

## Hecho

**Fase A · base**
- Migración `0243_pw_base.sql`.
- Función `pilo-work` (chat SSE con protocolo TanStack AI, memoria personal+colectiva, skills, herramientas de servidor `buscar_memoria`, `aplicar_skill`, `crear_documento`).
- PWA `/work` (manifiesto, service worker, ruta lazy, `index.html`, `vercel.json`).
- Acceso (entrar, crear cuenta, código de 6 dígitos, Microsoft, verificación, rol / sin rol), shell, Inicio, Chat, Memoria, Mis skills, Administración (roles y memoria colectiva).

**Fase B · Cowork y datos locales**
- Documentos persistentes con historial y deshacer, plantillas, sugerencias del modelo, barra de selección, pestañas Código y Revisión, exportar .docx.
- Datos en este equipo con Web Worker, columnas sensibles cerradas, agregados aprobados.

**Fase C · Microsoft y avisos**
- Migración `0244`; funciones `pw-microsoft` y `pw-avisos`.
- Correo, Agenda con Teams, Conectores, avisos en la app y Web Push.

**Fase D · Pilo for Teams**
- Migración `0245`: equipos, invitaciones, aportes con consentimiento, chat en Realtime, Pilo del equipo, asistente de 3 pasos.

**Cierre**
- «Cómo está construido» (solo admin). Guía del dueño en `README.md`.

## No probado (nadie lo ha corrido contra un servidor real)

- Las tres migraciones (escritas sin ejecutarlas).
- El flujo de streaming de `pilo-work` contra el cliente `@tanstack/ai-react` (el cliente compila con `tsc`; el protocolo AG-UI se escribió a mano según la documentación).
- OAuth y Graph (no hay credenciales): código completo, sin verificar contra Microsoft.
- Web Push de extremo a extremo y el cron.
- Realtime del chat de equipo.
- Lectura de .xlsx grandes en el worker.

## Pendiente / decisiones

- Memoria por significado (embeddings): la búsqueda es de texto completo en español (`tsvector`); los embeddings de NVIDIA quedan para una segunda vuelta.
- El historial del chat no se guarda (cada visita empieza limpia).
- Las skills no se «detectan» por IA: Pilo propone crear una cuando una tarea se repite 3 veces (señales en `pw_senales`).
