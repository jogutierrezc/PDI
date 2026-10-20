# Pilo: código al crear la cuenta e ingreso con Microsoft (0175)

Qué cambia para quien usa Pilo:

- **Crear la cuenta con correo y contraseña.** Después de escribir el correo de la UDES, Pilo envía un código de 6 cifras (vale 10 minutos, 5 intentos, 60 segundos entre envíos). Sin el código verificado la función no crea la cuenta.
- **Continuar con Microsoft.** En el registro y en el ingreso. Microsoft ya comprobó el correo: no se pide código ni contraseña, solo perfil, sede si el dominio no la dice, nombre, usuario y trato.
- **Correos que acepta Pilo.** Estudiantes y profesores: `mail.udes.edu.co`. Administrativos: `udes.edu.co`, `valledupar.udes.edu.co`, `bogota.udes.edu.co`, `cucuta.udes.edu.co` (y `bucaramanga.udes.edu.co`, que ya estaba). Bogotá es nueva.

## Qué hay que hacer para que funcione

1. **Aplicar la migración** `supabase/migrations/0175_pilo_codigo_y_microsoft.sql` (tabla de códigos, sus funciones, la regla de Bogotá y el tipo «codigo» de la bitácora).
2. **Copiar al servidor las dos funciones** (en el servidor propio no se despliegan con la CLI): `supabase/functions/correos/` y `supabase/functions/pilo-cuentas/`.
3. **Correos listos.** El código sale por la conexión de Correos (intranet › Correos › Remitentes y conexión). Sin servidor de correo configurado, pedir el código responde «No pudimos enviarle el código» y el motivo queda en la bitácora.
4. **Microsoft.** El proveedor «azure» ya sirve a la intranet. Falta que Supabase Auth acepte el regreso a Pilo: agregar `https://planeacion.udes.edu.co/app/cuenta` (o `https://planeacion.udes.edu.co/**`) a las URL de redirección permitidas.
5. **Variables opcionales** de `pilo-cuentas`:
   - `PILO_CODIGO_REGISTRO=no` vuelve al registro sin código (no toca lo ya creado).
   - `CORREOS_FUNCION_URL` si `SUPABASE_URL/functions/v1/correos` no se alcanza desde dentro del servidor.

## Cómo funciona

- `pilo-cuentas` · `codigo_enviar` genera el código, guarda solo su huella (`correo_codigos`, con sal) y le pide el envío a `correos` (acción interna `codigo`, que solo acepta la clave de servicio). `codigo_verificar` compara y entrega un **tiquete**; `registrar` lo exige y lo gasta al crear la cuenta.
- Con el código ya comprobado el correo está verificado: la cuenta nace confirmada y no se manda un segundo enlace.
- `pilo-cuentas` · `ms_preparar` / `ms_crear`: con la sesión de Microsoft revisa el dominio, y crea `pilo_users` con el mismo id del usuario de auth.
- La plantilla del código es `pilo-codigo` (texto en `servidor-logica.ts`). Si en la intranet existe una fila con esa clave, manda la fila; todavía no aparece en la pantalla de plantillas.

## Lo que conviene saber

- **El perfil de «invitado».** Quien entra por Microsoft por primera vez recibe, por el disparador de la intranet (0162), un perfil inactivo de invitado. Al volver a Pilo ese perfil, y solo ese (inactivo, de invitado y de menos de 24 horas), se retira y la cuenta se marca como de Pilo. Si la lista de acceso de la intranet incluye el dominio, esa persona queda con perfil activo y Pilo la trata como usuaria de la intranet (no se le crea cuenta de Pilo: esa cuenta ya le sirve).
- **Quien abandona a la mitad** de «Continuar con Microsoft» queda con un usuario de autenticación sin cuenta de Pilo, sin perfil de intranet. No tiene acceso a nada.
- **Correo de Microsoft.** Pilo confía en el correo que entrega el proveedor. Conviene que la aplicación de Azure sea de un solo inquilino (el de la UDES): con varios inquilinos, el correo de una cuenta ajena no es de fiar.
- **Aplicación de Android/Windows de la tienda.** El botón de Microsoft no se muestra en la app nativa de Android (el regreso del navegador no está resuelto allí).

## Sin verificar aún

No se probó un envío real de código, ni un ingreso real con Microsoft, ni las funciones dentro del Edge Runtime del servidor propio. Las pruebas cubren la lógica pura, las reglas de la pantalla y la base (código, intentos, vigencia, tiquete, permisos).
