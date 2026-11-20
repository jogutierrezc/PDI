# Función de borde `planeacion-seguimiento`

Envía los avisos por correo de Planeación y Seguimiento (migraciones `0287` y `0288`) y genera los avisos de vencimiento y de avances sin revisar.
La base deja cada aviso en la cola `ps_avisos`; esta función los toma y se los entrega a la función `correos`
(acción `ps`, solo con la clave de servicio), que aplica el interruptor general, los dominios permitidos, el tope por hora
y la bitácora `correo_log` con el destinatario enmascarado. Las plantillas `c-ps-*` se editan en la pantalla **Correos**.

## Acciones (POST, JSON)

| Acción | Quién | Qué hace |
| --- | --- | --- |
| `{"action":"avisos"}` | sesión con acceso al módulo, o cron, o clave de servicio | Vacía la cola (hasta 3 intentos por aviso; luego `error`). |
| `{"action":"vencimientos"}` | solo cron (`x-ps-cron`) o clave de servicio | Llama a `ps_generar_avisos_vencimiento()` (idempotente) y vacía la cola. |

Respuesta: `{ ok, enviados, errores, omitidos, pendientes }` (y `generados: {por_vencer, vencidas, gestor, validacion}` en vencimientos).

## Avisos que llegan a la cola

| Clave | A quién | Cuándo |
| --- | --- | --- |
| `c-ps-asignacion`, `c-ps-transferencia`, `c-ps-devuelto`, `c-ps-cumplida` | ver fase 2 | al asignar, transferir, devolver, pasar a hecho |
| `c-ps-por-vencer`, `c-ps-vencida` | responsables (o gestores) | con los plazos **de la oficina** (`ps_config_oficina`) o, si no tiene, los generales (`ps_config`) |
| `c-ps-avance` (0288) | gestores de la oficina, menos el autor | al reportar un avance (`ps_avance_reportar`) |
| `c-ps-validado` (0288) | quien reportó el avance | al validarlo (`ps_avance_validar`, el lote, `ps_actividad_mover` a hecho) |
| `c-ps-devuelto` (0288) | quien reportó el avance | al devolverlo (`ps_avance_devolver`) |
| `c-ps-validacion-pendiente` (0288) | gestores de la oficina | desde `vencimientos`: «Hay N avances esperando su revisión» cuando pasan `validar_horas` (72 por omisión, plazo por oficina); una vez por conjunto de avances |

**La interfaz debe llamar a `avisos`** justo después de reportar, validar o devolver un avance (como con asignar o devolver) para que el correo salga sin esperar al cron.
El texto de cada aviso lo redacta `avisos.ts`; `correos` (acción `ps`) usa la plantilla `c-ps-*` de la base y, si falta, un texto de respaldo por clave.

## Variables de la función

- `PS_AVISOS_CRON`: secreto largo y al azar del cron. Se guarda como secreto de la función; **no se escribe en el repositorio**.
- `CORREOS_FUNCION_URL` (opcional), `CORREOS_URL_PUBLICA` (opcional, `https://planeacion.udes.edu.co`),
  `PS_RUTA_ENLACE` (opcional, ruta del botón; por omisión `/admin/planeacion-seguimiento/mis-tareas`).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` las pone la plataforma.

## Despliegue

Lo hacen `supabase/actualizar-planeacion-seguimiento-f2.sh` (fase 2) y `supabase/actualizar-planeacion-seguimiento-f3.sh` (fase 3: aplica la migración `0288` y vuelve a copiar esta carpeta y `correos`, con respaldo, y reinicia el contenedor).
La función se despliega sin verificación de JWT (las acciones validan la sesión o el secreto a mano):
`supabase functions deploy planeacion-seguimiento --no-verify-jwt`.

## Programar los vencimientos (una vez al día, p. ej. 7:00 de Bogotá = 12:00 UTC)

La dirección debe ser la **pública https** de la función, no la red interna. Cree antes el secreto `PS_AVISOS_CRON` en la función
y use el mismo valor en el cron. Los plazos (7 y 3 días antes, el día de la fecha; vencida: diario hasta 3 veces y copia al gestor a las
24 h; validación de avances a las 72 h) están en la tabla `ps_config` y son valores por defecto que el usuario debe confirmar; desde la fase 3 cada oficina puede tener los suyos (`ps_config_oficina`, que gestiona su gestor o el administrador).

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

Sin ninguna de las dos, los avisos inmediatos (asignación, transferencia, devolución, cumplida, avance, validado) solo salen cuando alguien con acceso
llama a `avisos` (la interfaz lo hace tras cada acción) y no habrá avisos de vencimiento ni de avances sin revisar.
