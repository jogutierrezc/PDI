# conv-firma · puesta en marcha

Firma electrónica de convenios (migración `0258_conv_firma.sql`). Contrato para las pantallas: `CONTRATO.md`.

## 1. Qué hay que montar

1. Aplicar la migración `0258` (incluye un bloque previo de reparación de `conv_convenios`, idempotente).
2. Montar **Gotenberg** en Coolify (abajo) y definir `GOTENBERG_URL` en la función.
3. Cargar el certificado de firma de la UDES (abajo).
4. Desplegar la función: `supabase functions deploy conv-firma --no-verify-jwt` (o copiar la carpeta al servidor como las demás, reiniciar el contenedor de funciones).
5. Programar la acción `vencer` cada hora.

## 2. Variables de entorno de la función

| Variable | Obligatoria | Para qué |
|---|---|---|
| `GOTENBERG_URL` | sí | Servicio de conversión a PDF, p. ej. `http://gotenberg:3000` |
| `GOTENBERG_USUARIO`, `GOTENBERG_CLAVE` | no | Si Gotenberg tiene autenticación básica |
| `CONV_FIRMA_P12` | sí | Certificado de la UDES (PKCS#12) en base64 |
| `CONV_FIRMA_P12_CLAVE` | sí | Clave del PKCS#12 |
| `CONV_TSA_URL` | no | Autoridad de sello de tiempo RFC 3161 |
| `CONV_URL_APP` | no | Base pública (por omisión `https://planeacion.udes.edu.co`); arma los enlaces |
| `CONV_URL_SUPABASE_PUBLICA` | no | Origen público de Storage para las URL firmadas (por omisión `CONV_URL_APP`) |
| `CONV_FIRMA_CRON` | sí para el cron | Secreto de la acción `vencer` |
| `CONV_FIRMA_PIMIENTA` | recomendada | Clave para el HMAC de los códigos de 6 dígitos (si falta se deriva de la clave de servicio) |
| `CONV_FIRMA_RAICES_PEM` | no | Raíces de confianza (PEM) para los certificados de los firmantes |
| `CONV_FIRMA_PAIS_ENCABEZADOS` | no | `ninguno` para ignorar `cf-ipcountry` y similares |
| `REL_MAILPIT_*`, `SMTP_*`, `CONV_LOGO_URL` | como en `conv-avisos` | Correo: el modo (prueba/real) lo da `conv_aviso_config` |

## 3. Gotenberg en Coolify

- Recurso nuevo → Docker Image → `gotenberg/gotenberg:8` (fije una versión menor, p. ej. `8.39`).
- Puerto interno `3000`. **No exponer dominio público**: póngalo en la misma red de Docker que el contenedor de funciones y use `http://<nombre-del-servicio>:3000`.
- Comando: `gotenberg --api-timeout=60s`. Con autenticación básica opcional (`--api-enable-basic-auth`, variables `GOTENBERG_API_BASIC_AUTH_USERNAME` y `_PASSWORD`; en la función `GOTENBERG_USUARIO` y `GOTENBERG_CLAVE`). Los HTML de los PDF llevan una política CSP que solo permite imágenes `data:`, así que Chromium no sale a la red desde ellos; deje además Gotenberg sin acceso a redes internas que no necesite.
- Verificación: `GET /health` debe devolver `{"status":"up"}`. El panel lo muestra en `estado_certificado_udes.gotenberg`.
- Recursos: 1 CPU y 1–2 GB de RAM alcanzan. Gotenberg usa Chromium para el HTML y LibreOffice para los `.docx`.

## 4. Certificado de firma de la UDES

El PDF final y el certificado de trazabilidad se sellan con una firma digital de certificación (CMS `adbe.pkcs7.detached`, DocMDP «sin cambios permitidos»):
cualquier lector de PDF avisa si se altera el archivo.

**Cargar (o cambiar) el certificado, sin tocar código:** codifique el `.p12` en base64 (`base64 -w0 udes.p12`) y reemplace los secretos
`CONV_FIRMA_P12` y `CONV_FIRMA_P12_CLAVE`; reinicie el contenedor de funciones. El panel (`estado_certificado_udes`) muestra sujeto, emisor, serie y vigencia.

**Certificado provisional** (autofirmado), mientras llega el definitivo. La opción `-legacy`/`-certpbe` hace el `.p12` compatible con la librería de lectura:

```
openssl req -x509 -newkey rsa:3072 -sha256 -days 365 -nodes -keyout udes.key -out udes.crt \
  -subj "/C=CO/O=Universidad de Santander/CN=UDES Firma de convenios" \
  -addext "keyUsage=digitalSignature,nonRepudiation"
openssl pkcs12 -export -inkey udes.key -in udes.crt -out udes.p12 -name udes \
  -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1 -passout pass:CAMBIE_ESTA_CLAVE
```

El certificado definitivo debe ser de **firma de persona jurídica / sello de entidad**, emitido por una entidad de certificación digital
**acreditada por ONAC** (Colombia), con clave RSA de 2048 bits o más y uso `digitalSignature`/`nonRepudiation`; conviene la vigencia más larga que ofrezca (1 a 2 años) y
un calendario de renovación. Si la entidad lo entrega en HSM o en la nube (sin permitir exportar el `.p12`), use el punto de extensión de abajo.

**Sello de tiempo:** con `CONV_TSA_URL` (autoridad RFC 3161, p. ej. la de la entidad certificadora) cada sello lleva la hora de la autoridad como atributo
no firmado de la firma. Sin ella, el certificado de trazabilidad dice con claridad que la hora es la del servidor de la UDES. Si la autoridad no responde, el cierre continúa sin sello y queda anotado.

**Servicio de firma del emisor (HSM/nube), punto de extensión ya soportado:** defina `CONV_FIRMA_SERVICIO_URL` (y `CONV_FIRMA_SERVICIO_TOKEN`).
Para cada PDF la función hace `POST` (cuerpo binario = los bytes que se firman, `application/octet-stream`) y espera como respuesta la firma CMS/PKCS#7 desprendida en DER.
Describa el certificado con `CONV_FIRMA_SERVICIO_SUJETO`, `_EMISOR`, `_SERIE`, `_DESDE`, `_HASTA`. Si está definida tiene prioridad sobre el `.p12`.
Cuando el servicio del emisor use otro protocolo, se adapta en `sello.ts` (clase `SelloServicio`) sin tocar el resto.

## 5. Cifrado del PDF: decisión

La integridad y la autenticidad las da la firma digital con certificado. Cifrar con contraseña de propietario (AES-256, que Gotenberg puede aplicar) **no se implementó** porque:
cifrar después de firmar invalida la firma; y firmar un PDF ya cifrado no es fiable con la pila usada (pdf-lib no escribe archivos cifrados, y la firma necesita reescribir el PDF).
La restricción de edición ya la da la firma de certificación (DocMDP: cualquier cambio queda marcado como alteración), y el acceso a los archivos se protege con
buckets privados, URL firmadas de 90–120 s y permisos. Si más adelante se exige cifrado, el orden correcto sería cifrar con Gotenberg el PDF final y firmar por actualización incremental con un servicio externo (qpdf/HSM), no con esta librería.

## 6. Cron

```
select cron.schedule('conv-firma-vencer', '15 * * * *', $cron$
  select net.http_post(
    url     := 'https://<su-dominio>/functions/v1/conv-firma',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-conv-firma-cron', '<CONV_FIRMA_CRON>'),
    body    := '{"action":"vencer"}'::jsonb);
$cron$);
```
O una tarea de Coolify con `curl -X POST ... -H "x-conv-firma-cron: $CONV_FIRMA_CRON" -d '{"action":"vencer"}'`. Marca vencidas las solicitudes de más de 15 días y reintenta los cierres que fallaron (hasta 5 veces).

## 7. Seguridad, en corto

Tokens de enlace (256 bits) y sesiones: solo hash SHA-256. Códigos de 6 dígitos: solo HMAC-SHA256 con clave del servidor; 10 minutos, 5 intentos, un código nuevo invalida el anterior, reenvío cada 60 s y 10 por día, bloqueo de una hora tras 20 fallos.
Comparaciones en tiempo constante. Límites por IP y por firmante en `conv_firma_limites`. Eventos inmutables y encadenados por huellas. La IP se toma de `X-Real-Ip`/`X-Forwarded-For`: en Traefik mantenga
el valor por defecto (no confiar en reenvíos externos) para que el cliente no pueda falsearla. El país solo se registra si el proxy lo informa (`cf-ipcountry`, `x-vercel-ip-country`); si no, queda «No determinado».
