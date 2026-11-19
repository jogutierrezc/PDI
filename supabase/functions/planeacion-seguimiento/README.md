# Función de borde `planeacion-seguimiento`

Envía los avisos por correo de Planeación y Seguimiento (migración `0287`) y genera los avisos de vencimiento.
La base deja cada aviso en la cola `ps_avisos`; esta función los toma y se los entrega a la función `correos`
(acción `ps`, solo con la clave de servicio), que aplica el interruptor general, los dominios permitidos, el tope por hora
y la bitácora `correo_log` con el destinatario enmascarado. Las plantillas `c-ps-*` se editan en la pantalla **Correos**.

## Acciones (POST, JSON)

| Acción | Quién | Qué hace |
| --- | --- | --- |
| `{"action":"avisos"}` | sesión con acceso al módulo, o cron, o clave de servicio | Vacía la cola (hasta 3 intentos por aviso; luego `error`). |
| `{"action":"vencimientos"}` | solo cron (`x-ps-cron`) o clave de servicio | Llama a `ps_generar_avisos_vencimiento()` (idempotente) y vacía la cola. |

Respuesta: `{ ok, enviados, errores, omitidos, pendientes }` (y `generados: {por_vencer, vencidas, gestor}` en vencimientos).

## Variables de la función

- `PS_AVISOS_CRON`: secreto largo y al azar del cron. Se guarda como secreto de la función; **no se escribe en el repositorio**.
- `CORREOS_FUNCION_URL` (opcional), `CORREOS_URL_PUBLICA` (opcional, `https://planeacion.udes.edu.co`),
  `PS_RUTA_ENLACE` (opcional, ruta del botón; por omisión `/admin/planeacion-seguimiento/mis-tareas`).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` las pone la plataforma.

## Despliegue

Lo hace `supabase/actualizar-planeacion-seguimiento-f2.sh` (copia esta carpeta y `correos`, con respaldo, y reinicia el contenedor).
La función se despliega sin verificación de JWT (las acciones validan la sesión o el secreto a mano):
`supabase functions deploy planeacion-seguimiento --no-verify-jwt`.

## Programar los vencimientos (una vez al día, p. ej. 7:00 de Bogotá = 12:00 UTC)

La dirección debe ser la **pública https** de la función, no la red interna. Cree antes el secreto `PS_AVISOS_CRON` en la función
y use el mismo valor en el cron. Los plazos (7 y 3 días antes, el día de la fecha; vencida: diario hasta 3 veces y copia al gestor a las
24 h) están en la tabla `ps_config` y son valores por defecto que el usuario debe confirmar.

### Opción A: pg_cron + pg_net (en Coolify hay que activar las extensiones)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('ps-vencimientos-diario', '0 12 * * *', $cron$
  select net.http_post(
    url     := 'https://<su-dominio>/functions/v1/planeacion-seguimiento',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ps-cron', '<PS_AVISOS_CRON>'),
    body    := '{"action":"vencimientos"}'::jsonb
  );
$cron$);
-- Para vaciar la cola cada 10 minutos (por si hubo reintentos):
select cron.schedule('ps-avisos-cola', '*/10 * * * *', $cron$
  select net.http_post(
    url     := 'https://<su-dominio>/functions/v1/planeacion-seguimiento',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ps-cron', '<PS_AVISOS_CRON>'),
    body    := '{"action":"avisos"}'::jsonb
  );
$cron$);
-- Quitarlas: select cron.unschedule('ps-vencimientos-diario'); select cron.unschedule('ps-avisos-cola');
```

(El texto `<PS_AVISOS_CRON>` es un marcador: ponga el valor real solo en el servidor, nunca en un archivo del repositorio.)

### Opción B: tarea programada de Coolify

Una tarea diaria (`0 12 * * *`) y, si quiere reintentos, otra cada 10 minutos, con el secreto en una variable de entorno de la tarea:

```sh
curl -s -X POST https://<su-dominio>/functions/v1/planeacion-seguimiento \
     -H "x-ps-cron: $PS_AVISOS_CRON" -H "Content-Type: application/json" -d '{"action":"vencimientos"}'
```

Sin ninguna de las dos, los avisos inmediatos (asignación, transferencia, devolución, cumplida) solo salen cuando alguien con acceso
llama a `avisos` (la interfaz lo hace tras cada acción) y no habrá avisos de vencimiento.
