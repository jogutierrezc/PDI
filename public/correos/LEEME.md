# Plantillas de correo

Son los cinco correos que envía el servidor de cuentas (Supabase Auth). Al
publicar el portal quedan en `https://<dominio>/correos/<archivo>`, y el
servidor los lee de ahí cada vez que envía uno.

| Archivo | Cuándo se envía |
| --- | --- |
| `confirmacion.html` | Alguien se registra y debe confirmar su correo |
| `invitacion.html` | Se crea una cuenta para alguien (intranet o Mr. Pilo) |
| `recuperar.html` | «Olvidé mi contraseña» |
| `enlace-de-acceso.html` | Entrar con un enlace, sin contraseña |
| `cambio-de-correo.html` | Cambiar el correo de la cuenta |

## Cómo cambiar un texto

Abra el archivo con cualquier editor de texto. Lo que se puede cambiar está
marcado con comentarios: CABECERA, CUERPO, BOTÓN y PIE. Cambie las frases y
guarde. Los colores están escritos junto a cada parte (`#0a2d63` es el azul
marino; `#2166d6`, el azul del botón).

No cambie lo que va entre llaves dobles: lo reemplaza el sistema al enviar.

| Marcador | Qué pone |
| --- | --- |
| `{{ .ConfirmationURL }}` | El enlace que la persona debe abrir |
| `{{ .Email }}` | El correo de la persona |
| `{{ .NewEmail }}` | El correo nuevo (solo en el cambio de correo) |
| `{{ .SiteURL }}` | La dirección del portal |
| `{{ .Token }}` | Un código de seis dígitos, si se prefiere código en vez de enlace |

Un correo no es una página web: no admite hojas de estilo externas, ni
JavaScript, ni imágenes SVG. Por eso todo va en tablas con el estilo escrito
en cada etiqueta. Para poner un logo, use un PNG publicado en el portal y
escriba su dirección completa (`https://…/logo.png`).

## Cómo se activan (una sola vez)

En Coolify, en las variables del servicio de Supabase, con su dominio:

```
MAILER_SUBJECTS_CONFIRMATION=Confirme su correo · Planeación UDES
MAILER_TEMPLATES_CONFIRMATION=https://planeacion.udes.edu.co/correos/confirmacion.html
MAILER_SUBJECTS_INVITE=Active su cuenta · Planeación UDES
MAILER_TEMPLATES_INVITE=https://planeacion.udes.edu.co/correos/invitacion.html
MAILER_SUBJECTS_RECOVERY=Cambie su contraseña · Planeación UDES
MAILER_TEMPLATES_RECOVERY=https://planeacion.udes.edu.co/correos/recuperar.html
MAILER_SUBJECTS_MAGIC_LINK=Su enlace para entrar · Planeación UDES
MAILER_TEMPLATES_MAGIC_LINK=https://planeacion.udes.edu.co/correos/enlace-de-acceso.html
MAILER_SUBJECTS_EMAIL_CHANGE=Confirme su correo nuevo · Planeación UDES
MAILER_TEMPLATES_EMAIL_CHANGE=https://planeacion.udes.edu.co/correos/cambio-de-correo.html
```

Si en su plantilla de Coolify las variables de correo llevan el prefijo
`GOTRUE_` (por ejemplo `GOTRUE_SMTP_HOST`), póngales el mismo prefijo a
estas. Después reinicie el servicio.

El asunto se cambia en la variable `MAILER_SUBJECTS_…`, no en el archivo.

## Después de cambiar un texto

Publique el portal. El servidor de cuentas guarda cada plantilla un rato: si
el cambio no se ve en el siguiente correo, reinicie el servicio de Supabase.
