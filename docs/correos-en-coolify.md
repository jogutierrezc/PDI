# Correos: cómo dejarlo funcionando en su servidor (Coolify)

Esta guía es para dejar andando el módulo **Correos** de la intranet en su
Supabase autoalojado en Coolify. Son seis pasos. Hágalos en orden; después de
cada uno hay algo que mirar para saber que quedó bien.

**Qué cambia.** Hoy los correos de cuenta (activar la cuenta, «olvidé mi
contraseña»…) los envía el servidor de cuentas de Supabase con los cinco
archivos de `public/correos/`. Con este módulo, el servidor de cuentas le pasa
cada pedido a una función del proyecto llamada `correos`, que arma el correo
con lo que usted escribió en la intranet y lo envía por el SMTP de la
universidad.

**Nada se pierde.** Los archivos de `public/correos/` y la configuración SMTP
que ya puso en Coolify se quedan como están. Si algo falla, una sola variable
devuelve todo a como está hoy (paso 5).

> **Lo que no pude comprobar.** Escribí esto sin ver su instalación y sin poder
> enviar un correo de verdad. Donde dice **«Confirme»**, es algo que usted debe
> mirar en su servidor porque puede llamarse distinto. Están reunidos al final.

---

## 1. Aplicar la migración 0137

Aplique `supabase/migrations/0137_correos.sql` en la base de datos, igual que
las anteriores (se puede aplicar dos veces sin dañar nada).

**Cómo saber que quedó:** entre a la intranet con una cuenta de administración,
menú **Sistema › Correos**. Deben verse las plantillas. Si en cambio dice
«Falta la migración 0137», no se aplicó.

Publique también el portal (como siempre) para que aparezca la pantalla.

## 2. Poner la función `correos` en el servidor

En Supabase autoalojado no existe `supabase functions deploy`. Las funciones
son carpetas dentro de un volumen del contenedor de funciones.

1. Encuentre la carpeta de funciones en el servidor. Es **la misma donde ya
   están** `pilo-ia`, `pilo-cuentas`, `pilo-clases` y las demás. En la
   plantilla de Supabase de Coolify suele ser:

   ```
   /data/coolify/services/<identificador-del-servicio>/volumes/functions/
   ```

   Ahí dentro hay una carpeta por función y una llamada `main`.

2. Cree la carpeta `correos` y copie dentro el archivo
   `supabase/functions/correos/index.ts` del proyecto. Debe quedar:

   ```
   …/volumes/functions/correos/index.ts
   ```

   No hay que tocar `main/index.ts`: reparte los pedidos por el nombre de la
   carpeta, así que `/functions/v1/correos` llega solo.

3. Reinicie el servicio de funciones en Coolify (en la plantilla se llama
   `supabase-edge-functions`).

**La primera vez** la función descarga de internet la librería con que envía
correos (`nodemailer`). El contenedor de funciones necesita salida a internet
en ese momento; después queda guardada.

**Confirme:** la ruta exacta de la carpeta y el nombre del servicio. Si no los
encuentra, en Coolify abra el servicio de Supabase › *Edit Compose File* y
busque la línea que termina en `:/home/deno/functions`: lo que está antes de
los dos puntos es la carpeta.

**De paso (recomendado):** copie también la versión nueva de
`supabase/functions/pilo-cuentas/index.ts` a su carpeta `pilo-cuentas`. Cambió
una sola línea: ahora, al crear una cuenta de Pilo, anota el perfil y la sede
junto a la cuenta, y con eso la bienvenida sabe si le escribe a un estudiante,
a un profesor o a un administrativo. Sin esa copia todo funciona, pero la
primera bienvenida sale siempre con el mensaje de estudiante.

## 3. Las variables

Hay que poner variables en **dos** servicios: el de funciones y el de cuentas.

### 3.1. Genere el secreto

El servidor de cuentas firma cada pedido con un secreto, y la función solo
obedece los pedidos que traen esa firma. En cualquier terminal (la del
servidor sirve):

```
openssl rand -base64 32
```

Sale algo como `kq3J…8Zw=`. El secreto completo es eso con `v1,whsec_`
delante, sin espacios:

```
v1,whsec_kq3J…8Zw=
```

Guárdelo como una contraseña. **El mismo valor, idéntico, va en los dos
servicios.**

### 3.2. En el servicio de funciones (`supabase-edge-functions`)

| Variable | Valor |
| --- | --- |
| `SEND_EMAIL_HOOK_SECRET` | el secreto: `v1,whsec_…` |

Opcionales:

| Variable | Para qué |
| --- | --- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | Una conexión de respaldo. La función la usa **solo** si en la intranet no hay servidor escrito. Sirve para arrancar sin entrar a la pantalla. En `SMTP_SECURE` escriba `ssl` con el puerto 465; con el 587 déjela vacía. |
| `CORREOS_URL_PUBLICA` | `https://planeacion.udes.edu.co`. Solo hace falta si los enlaces de los correos salen con una dirección que no abre (ver paso 6). |

### 3.3. En el servicio de cuentas (`supabase-auth`)

| Variable | Valor |
| --- | --- |
| `GOTRUE_HOOK_SEND_EMAIL_ENABLED` | `true` |
| `GOTRUE_HOOK_SEND_EMAIL_URI` | `https://planeacion.udes.edu.co/functions/v1/correos` |
| `GOTRUE_HOOK_SEND_EMAIL_SECRETS` | el secreto: `v1,whsec_…` |

**Cómo se ponen en Coolify.** Si al agregarlas en la lista de variables del
servicio no surten efecto, es porque la plantilla solo le pasa a cada
contenedor las variables que nombra. En ese caso abra *Edit Compose File* y
agréguelas en el bloque `environment:` de cada servicio:

```yaml
  supabase-auth:
    environment:
      # …lo que ya está…
      - GOTRUE_HOOK_SEND_EMAIL_ENABLED=${GOTRUE_HOOK_SEND_EMAIL_ENABLED:-false}
      - GOTRUE_HOOK_SEND_EMAIL_URI=${GOTRUE_HOOK_SEND_EMAIL_URI}
      - GOTRUE_HOOK_SEND_EMAIL_SECRETS=${SEND_EMAIL_HOOK_SECRET}

  supabase-edge-functions:
    environment:
      # …lo que ya está…
      - SEND_EMAIL_HOOK_SECRET=${SEND_EMAIL_HOOK_SECRET}
```

y defina `SEND_EMAIL_HOOK_SECRET`, `GOTRUE_HOOK_SEND_EMAIL_ENABLED` y
`GOTRUE_HOOK_SEND_EMAIL_URI` en las variables de Coolify. Así el secreto se
escribe una sola vez y llega a los dos servicios. Después, reinicie los dos.

### 3.4. Sobre la dirección del gancho (léalo: aquí es donde más se falla)

Lo natural sería apuntar por la red interna de Docker, con algo como
`http://supabase-kong:8000/functions/v1/correos` o
`http://supabase-edge-functions:9000/correos`. **No sirve.** El servidor de
cuentas solo acepta una dirección `http://` si es `localhost`, `127.0.0.1` o
`host.docker.internal`; cualquier otro nombre debe ser `https://`. Con una de
esas dos direcciones internas el servicio de cuentas da error de configuración
y **puede no arrancar**, y entonces nadie puede iniciar sesión.

Por eso hay dos formas que sí valen:

- **A. Por la dirección pública (la recomendada):**
  `https://planeacion.udes.edu.co/functions/v1/correos`. El pedido sale por
  Traefik y vuelve a entrar; viaja cifrado y firmado.

- **B. Por la red interna, a la manera oficial:**
  `http://host.docker.internal:8000/functions/v1/correos`. Pide dos cosas en el
  *Compose*: que el servicio de cuentas tenga

  ```yaml
      extra_hosts:
        - "host.docker.internal:host-gateway"
  ```

  y que el puerto 8000 de Kong esté publicado en el servidor (en la plantilla
  de Coolify normalmente no lo está). Úsela solo si la A no funciona porque el
  servidor no logra llamarse a sí mismo por su dominio.

**Si después de reiniciar nadie puede entrar:** quite
`GOTRUE_HOOK_SEND_EMAIL_ENABLED` (o póngala en `false`) y reinicie el servicio
de cuentas. Vuelve a como estaba. Luego mire los registros de ese servicio:
dicen qué variable no le gustó.

### 3.5. La función debe aceptar pedidos sin sesión

El servidor de cuentas no trae una sesión: trae su firma. Si el contenedor de
funciones está configurado para exigir una sesión a todo lo que llega, rechaza
el pedido antes de que la función lo vea.

**Confirme** en las variables de Coolify cuánto vale `FUNCTIONS_VERIFY_JWT`
(dentro del contenedor se llama `VERIFY_JWT`). Debe ser `false`.

No es un riesgo dejarla así: todas las funciones de este proyecto comprueban
por su cuenta quién las llama (así está anotado en `supabase/config.toml`), y
`correos` no hace nada sin la firma del servidor de cuentas o sin la sesión de
alguien de la administración. En el autoalojado esta variable vale para todas
las funciones a la vez; el `verify_jwt = false` de `config.toml` solo cuenta en
Supabase en la nube.

## 4. Probar

En la intranet, **Sistema › Correos**:

1. **Remitentes y conexión.** Escriba el servidor (por ejemplo
   `smtp.office365.com`), el puerto (587), la seguridad (STARTTLS) y el
   usuario. Escriba la contraseña y pulse **Guardar contraseña** (se guarda al
   momento y no vuelve a mostrarse). Pulse **Guardar**.

   Deje vacía la «Dirección» de los remitentes para empezar: se usa la del
   usuario de la conexión, que es lo que Microsoft 365 acepta sin permisos
   extra.

2. **Probar conexión.** Abre la conexión y se identifica, sin enviar nada. Debe
   decir «El servidor aceptó el usuario y la contraseña». Si no, el mensaje
   dice qué falló (ver paso 6).

3. **Plantillas › Enviar una prueba.** Escriba su correo y pulse el botón.
   Llega con «[Prueba]» en el asunto. Mírelo en el computador y en el celular.
   La prueba no lleva enlace personal: su botón abre el portal.

4. **La prueba de verdad.** En la página de ingreso del portal use «olvidé mi
   contraseña» con su propia cuenta. Debe llegar el correo nuevo y el enlace
   debe abrir la página para cambiarla. Luego mire la pestaña **Bitácora**:
   debe aparecer el envío, con su correo enmascarado.

   Si la prueba del punto 3 llega pero esta no, el problema está en el gancho
   (paso 3), no en el SMTP.

**Los correos de Mr. Pilo.** La bienvenida de Pilo solo se envía si la
confirmación del correo está encendida en la función `pilo-cuentas` (variable
`PILO_CONFIRMAR_CORREO=si` en el servicio de funciones). Hoy está apagada: las
cuentas de Pilo nacen confirmadas y no reciben correo. Enciéndala cuando ya
haya visto llegar bien los demás.

## 5. Vuelta atrás

En el servicio de cuentas (`supabase-auth`):

```
GOTRUE_HOOK_SEND_EMAIL_ENABLED=false
```

y reinicie ese servicio. Los correos vuelven a salir como hoy, con las
plantillas de `public/correos/` y el SMTP que ya tenía en Coolify. No se pierde
nada: las plantillas que escribió en la intranet y la bitácora siguen ahí para
cuando lo vuelva a encender.

Por eso mismo: **no borre** las variables `GOTRUE_SMTP_…`/`SMTP_…` ni las
`MAILER_TEMPLATES_…` que ya tiene. Son el respaldo.

Dentro de la pantalla hay además un interruptor, «El módulo envía los correos
de cuenta». Ese **no** es la vuelta atrás: apagado, los correos de cuenta
simplemente no salen y la persona ve un error. Sirve para frenar en seco si
algo sale mal; para volver a los correos de antes se apaga el gancho.

## 6. Si no llega

Empiece por **Probar conexión**: el mensaje casi siempre dice cuál es.

| Lo que dice o pasa | Qué revisar |
| --- | --- |
| «No encontré ese servidor» | El nombre del servidor está mal escrito. |
| «No respondió a tiempo» o «no acepta conexiones en ese puerto» | El servidor de la universidad no deja salir por el **puerto 587**. Pida a infraestructura que abran la salida por el 587 (o el 465) desde ese servidor hacia el de correo. Es la causa más común. |
| «Falló el cifrado» | Con el puerto 587 va STARTTLS; con el 465, SSL/TLS. |
| «Rechazó el usuario o la contraseña» | Revíselos. En Microsoft 365 el buzón debe tener permitido «SMTP autenticado» (*Authenticated SMTP*), y si la cuenta tiene verificación en dos pasos hace falta una contraseña de aplicación. |
| «No deja enviar con esa dirección de remitente» | En Microsoft 365 la dirección del remitente debe ser **el buzón de la conexión**, o uno sobre el que ese buzón tenga permiso «Enviar como». Deje la «Dirección» vacía para usar la del buzón. |
| La bitácora dice «Aceptado» pero no llega | Mire el correo no deseado. Si está ahí, es el **SPF** del dominio: hoy `udes.edu.co` autoriza a Outlook (Microsoft 365) y a Amazon SES. Si envía por otro servidor, ese servidor no está autorizado y los correos caen en no deseado o se rechazan. Envíe por Microsoft 365 o pida que agreguen ese servidor al SPF. |
| «Ya se enviaron N correos de cuenta a esta dirección hoy» | Es el tope por persona (Remitentes y conexión › Límites). Súbalo o espere. |
| «Esa dirección no es de un dominio permitido» | Hay dominios escritos en «Solo se envía a estos dominios» y esa cuenta usa otro. Vacíe el campo o agregue el dominio. |
| La prueba llega, «olvidé mi contraseña» no, y la bitácora no muestra nada | El servidor de cuentas no está llamando a la función: revise las tres variables `GOTRUE_HOOK_SEND_EMAIL_…` y que reinició el servicio. |
| La persona ve un error y la bitácora no muestra nada | La función rechazó el pedido antes de atenderlo: el secreto no es **idéntico** en los dos servicios, o `FUNCTIONS_VERIFY_JWT` no está en `false` (paso 3.5). |
| El enlace del correo no abre, o empieza por `http://kong…` | Ponga `CORREOS_URL_PUBLICA=https://planeacion.udes.edu.co` en el servicio de funciones y reinícielo. Revise también que la dirección del portal del servicio de cuentas (`SITE_URL`) sea `https://planeacion.udes.edu.co`. |
| En los correos de Pilo no se ve su cara | Es una imagen que publica el portal (`/pilo-face/closed.png`). Muchos programas ocultan las imágenes hasta que la persona lo permite; el correo se entiende igual. |
| La función no arranca tras copiarla | En los registros del servicio de funciones, busque un error al descargar `nodemailer`: ese contenedor necesita salida a internet la primera vez. |

---

## Qué confirmar en su instalación (resumen)

1. La **carpeta de funciones** en el servidor y el **nombre de los servicios**
   (`supabase-edge-functions`, `supabase-auth`): pueden variar según la versión
   de la plantilla de Coolify.
2. Que `FUNCTIONS_VERIFY_JWT` esté en `false`.
3. Que el servidor de cuentas acepte la dirección pública del gancho (forma A)
   y que el servidor pueda llamarse a sí mismo por su dominio.
4. Que su versión del servidor de cuentas (GoTrue) tenga el gancho «Send
   Email» (existe desde mediados de 2024) y lo envíe con el formato que la
   función espera. Si la imagen es muy antigua, hay que actualizarla.
5. Que la librería de correo (`nodemailer`) funcione dentro del contenedor de
   funciones: se sabe con «Probar conexión».
6. Que el servidor deje salir por el puerto 587.

## Qué decide la función por su cuenta

- **Identidad.** Si la cuenta es de Mr. Pilo, el correo sale con la identidad
  de Pilo; si es de la intranet, con la de Planeación.
- **Mensaje por rol.** En la bienvenida de Pilo, según sea estudiante, profesor
  o administrativo. Si no se sabe el rol, sale el de estudiante.
- **Los correos de cuenta no esperan.** El tope «por hora» no los frena: nadie
  se queda sin poder entrar por un tope. Sí los corta el tope «por persona al
  día», con un mensaje que la persona entiende.
- **Privacidad.** En la bitácora el destinatario queda enmascarado
  (`l•••a.gomez@mail.udes.edu.co`). Ni el contenido, ni el enlace, ni la
  contraseña SMTP se guardan o se escriben en los registros.
- **Pedidos repetidos.** Si el servidor de cuentas repite un pedido que ya
  salió, no se envía dos veces.
