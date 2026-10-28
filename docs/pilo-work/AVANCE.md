# Pilo at Work: avance

Última actualización: 2026-10-28 (segunda tanda).

## Hecho antes (fases A a D y cierre)

Base (0243), Chat, Cowork, Datos locales, Microsoft y avisos (0244), Pilo for Teams (0245), «Cómo está construido». Ver `README.md`.

## Tanda 2026-10-28

### 1. Errores reales

- **Chat «pensando» para siempre (causa).** No había ningún tope de tiempo en la cadena: la llamada al modelo (`llamar`), la lectura del flujo, las llamadas a Graph de `pw-microsoft` y el `callFn` del navegador esperaban sin límite. Si cualquiera se quedaba colgado (Graph lento, token vencido que se renovaba, proveedor sin responder), la herramienta de correo nunca devolvía resultado, el cliente seguía esperándola y el indicador giraba. Además `leer_correo` pedía `$filter=isRead eq false` junto con `$orderby=receivedDateTime`, que Graph rechaza («InefficientFilter»). No pude reproducirlo contra un servidor real: es la causa que sale de leer el flujo completo.
- **Blindaje.** Servidor: cierre SIEMPRE (`RUN_FINISHED` o `RUN_ERROR`) en un `finally`, tope de 90 s y de pasos por turno (`max_pasos`), ids de herramienta de 9 caracteres (exigencia de Mistral), mensaje si el modelo calla. Proveedor: tiempo al primer fragmento, silencio máximo entre fragmentos (15 s), tope total sin streaming (40 s). Cliente: `callFn` con tope (30 s) y cancelación, toda herramienta devuelve resultado o error legible, vigilante de 25 s sin señales (no cuenta la espera de una aprobación) con «Pilo tardó demasiado», **Reintentar** y **Cancelar** (`stop()` real), y al salir del chat las aprobaciones pendientes se resuelven en «no».
- Herramientas nuevas de correo: `contar_correos`, `listar_correos`, `leer_correo` (cuerpo), `resumir_correo` (mensaje o hilo). Todo contenido de terceros va marcado «DATO NO CONFIABLE».
- **Calendario (causa).** Se leía solo lunes–viernes y de 8:00 a 18:00, sin paginar, sin eventos de todo el día ni que cruzan la medianoche, con eventos solapados encimados, la semana fija (sin navegar) y la línea de «ahora» con la hora del equipo. Reescrito: lunes–domingo, 24 h con scroll, calendarView paginado con `Prefer: outlook.timezone="SA Pacific Standard Time"`, franja de todo el día, partición por día, columnas lado a lado, anterior/siguiente/hoy, ahora en hora de Bogotá, carga/vacío/error con reintento.

### 2. Agenda: clic para ver o crear
Detalle de reunión (descripción saneada, asistentes con respuesta, Teams, Outlook, preparar con Pilo, editar, cancelar/eliminar con confirmación y foco en «No cancelar») y «Nueva reunión» (clic en espacio vacío redondeado a 15 min, botón y tecla N, aviso de choque sin bloquear, enlace de Teams copiable). Eventos son botones enfocables.

### 3. Correo
Lector de solo lectura: carpetas, filtros, paginación, cuerpo saneado (`sanear.ts`, lista blanca; imágenes remotas bloqueadas hasta «Mostrar imágenes»), adjuntos con descarga (tope 8 MB), «Resumir con Pilo» (mensaje o hilo; acción `resumir_correo` de `pilo-work`) y borrador de respuesta con aprobación («Crear borrador en Outlook», nunca se envía). No se añadió marcar leído.

### 4. OneDrive y SharePoint
Vista «Archivos» (Mis fuentes), explorador reutilizable, permisos por módulo, herramientas del chat (`listar_archivos`, `leer_archivo`, `crear_carpeta`, `guardar_archivo`), Cowork «Abrir desde OneDrive» y «Guardar en OneDrive» (con tarjeta de aprobación y «Reemplazar» solo con casilla explícita). Ver «Límites de subida» abajo.

### 5. Mi perfil
Migración 0246 (`pw_perfiles`, solo la dueña). Diálogo desde el avatar del riel y Ctrl K, vista previa «Cómo me verá Pilo», «Restablecer». `pilo-work` inyecta un resumen (≤ ~2 600 caracteres, ≈ 600 tokens), Pilo puede proponer cambios con `proponer_perfil` (tarjeta de aprobación). Inicio saluda con el nombre del perfil.

### Modelos de IA (Mistral primero, NVIDIA por capacidad, prioridad a la velocidad)
`proveedor.ts`: dos niveles. **Rápido** = Mistral (modelo de Mr. Pilo), siempre en streaming. **Capacidad** = NVIDIA (o el Mistral configurado si no hay clave). Reglas simples en código (`elegirNivel`), sin llamada previa al modelo: pasan a capacidad más de **12 000 caracteres** (≈ 3 000 tokens; lo que un modelo pequeño resume mal de una vez), generación de código, «varios documentos/archivos», revisión normativa profunda (Cowork «revisar») y un JSON roto o vacío del rápido (se reintenta una vez en capacidad). Si Mistral no empieza en **7 s** (configurable) se aborta y se usa NVIDIA, con un evento `CUSTOM pilo_modelo` y el chip del encabezado muestra el modelo real y el motivo (title). 404/410 = modelo retirado: se anota sin contenidos y se cae al siguiente. Bitácora: una fila por pedido con proveedor, modelo, nivel, conmutación, motivo y ms al primer fragmento (sin contenidos). Temperatura 0.3 (chat), 0.2 (JSON).

### Configuración en Planeación (`/admin/pilo-work`)
Nueva pantalla en «Sistema» (grupo Mr. Pilo del tablero), solo administración: modelos por nivel (proveedor y modelo editables, claves solo sí/no y enlace a Mr. Pilo), umbrales, «Probar conexión», límites (mensajes/hora, subida, retención), funciones habilitadas (Chat, Cowork, Datos, Correo, Agenda, Archivos, Teams, Perfil), estado de Microsoft 365 (booleanos de `MS_*`/`PW_TOKEN_KEY`, alcances por módulo, personas conectadas) y uso (conteos). Migración **0247** (`pw_config`, una fila, RLS `has_role_at_least('admin')`, cambios en bitácora sin valores). Sin 0247 la pantalla avisa y las funciones usan los valores por defecto. En `/work` no hay configuración de IA; «Acceso y roles» solo trae el enlace «Configurar en Planeación».

### Guía de estilo de las respuestas (dónde vive)
`supabase/functions/pilo-work/index.ts`, constante `PERSONA` (voz, usted, 3 a 6 frases, sin emojis ni `---` ni encabezados, sin promesas no verificadas, 3 ejemplos) y función `capacidades()` (inventario real según rol, funciones de `pw_config` y lo conectado; también filtra las herramientas que llegan al modelo). Red de seguridad: `src/modules/pilo-work/limpiar.ts` (cliente; quita emojis, `---`, `#` en respuestas cortas y cierres de relleno, sin tocar código, tablas ni enlaces) y `sinEmojis` en el flujo del servidor. Para ajustar el tono basta editar `PERSONA`. Ancho: hilo hasta 980 px (1 100 plegado), párrafos a 88ch, tablas con scroll horizontal.

## No probado (nadie lo ha corrido contra un servidor real)
Las migraciones 0243–0247; el flujo SSE contra `@tanstack/ai-react` (cierre, evento `pilo_modelo`); Graph (conteo, calendarView paginado, eventos, archivos, sesiones de subida y su CORS desde el navegador); Web Push; Realtime; `deno check` de las funciones (Deno no está instalado). Verificado: `tsc --noEmit` y `vite build`, y una revisión visual del diálogo, la tabla markdown y la tarjeta del vigilante en un arnés temporal (borrado).

## Pendiente / decisiones
- Lectura de Excel y PDF desde OneDrive no existe (solo texto y .docx): no hay librería de lectura en el cliente salvo `exceljs` en el worker.
- Marcar leído/no leído: no se añadió (no estaba aprobado).
- Retención de la bitácora: `pw_purgar_bitacora()` hay que programarla con cron.
