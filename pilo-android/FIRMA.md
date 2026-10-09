# Firma de «Mr. Pilo» a nombre de la Universidad de Santander

Guía para quien decide (Planeación, TI, Jurídica) y para quien ejecuta. Estado al 2026-10-09.

## 0. Lo primero: la llave de prueba actual no sirve para producción

La llave que hoy firma el APK (`pilo-android/keys/mrpilo-release.keystore`) tiene un nombre
correcto (ver sección 3), pero **el archivo de la llave y el archivo con su contraseña
(`CLAVE-FIRMA.txt`) están dentro del repositorio de Git** (commit `7e6c361`, ya en `origin/main`),
y `.gitignore` no los cubre. Una llave de firma con su contraseña en el repositorio se debe dar por
comprometida: quien lea el repositorio puede firmar «actualizaciones» falsas de la app.

Además, el APK 1.0.0 firmado con ella ya está publicado en el portal
(`public/pilo-app/apk/Mr-Pilo-1.0.0.apk`), de modo que hay que asumir que **sí se distribuyó**.

Decisión recomendada: **generar una llave nueva** (sección 5) y retirar la anterior para siempre.
Eso resuelve la seguridad y, de paso, deja la llave bajo custodia de la universidad desde el primer día.

Acciones inmediatas (las ejecuta quien administra el repositorio, no este documento):

1. Añadir a `.gitignore`: `*.keystore`, `*.jks`, `pilo-android/keys/`, `**/CLAVE-FIRMA*`.
2. Quitar los dos archivos del índice (`git rm --cached`) sin reutilizarlos.
3. No intentar «limpiar» el historial como si eso la protegiera: si el repositorio es o fue visible
   para terceros, la llave ya está expuesta. Se retira y se reemplaza.
4. Cambiar `public/.well-known/assetlinks.json` a la huella nueva cuando exista (sección 9).

## 1. Cómo funciona la identidad de una app Android (en claro)

- Android no mira el «nombre» del certificado. El nombre (DN) es una etiqueta informativa; la
  confianza viene de que **cada actualización esté firmada por la misma llave** que la versión
  instalada. Quien tenga la llave puede publicar actualizaciones en nombre de la app; quien la
  pierda no puede actualizarla nunca más.
- La identidad real de la app son dos datos: el **identificador del paquete** (`co.edu.udes.mrpilo`)
  y la **huella SHA-256 del certificado** de la llave.
- Un DN con el nombre de la universidad ayuda a las personas (aparece en la información del
  certificado, en Play Console y en revisiones), pero no sustituye al registro de desarrollador
  ni a la custodia de la llave.

## 2. Verificación de desarrolladores de Google (estado verificado el 2026-10-09)

Fuentes: <https://android-developers.googleblog.com/2026/06/android-developer-verification.html>,
<https://developer.android.com/developer-verification> y su
[FAQ](https://developer.android.com/developer-verification/guides/faq).

- Desde el **2026-09-30** Google exige apps registradas a un desarrollador verificado, **en Brasil,
  Indonesia, Singapur y Tailandia**, en tiendas participantes (Google Play, Galaxy Store, etc.) y
  dispositivos certificados. La extensión global está anunciada para **2027** (fecha exacta: por
  confirmar en la página oficial).
- Según la FAQ de Google, **la instalación directa («sideload») y las otras tiendas «aún» no están
  sujetas** a estos requisitos, pero Google **recomienda registrar** las apps antes de 2027. Colombia
  no está en la primera fase. Para usuarios que instalen apps de desarrolladores no verificados
  existirá un «flujo avanzado» (modo desarrollador, reinicio, espera de un día, confirmación biométrica).
  Conclusión: **hoy un APK descargado del portal se instala en Colombia sin este requisito, pero en
  2027 una app sin registrar tendría una fricción grande**. Registrarla ya es barato.
- Se registra en la **Android Developer Console** (si solo se distribuye fuera de Play) o en la
  **Play Console** (si también se publica en Play; Play registra solo el 99 % de las apps).
- La FAQ habla de registrar el **paquete con sus llaves de firma** (se pueden verificar varias
  llaves para un mismo paquete) y advierte que si se pierde la llave de firma no se podrán registrar
  los paquetes. El texto exacto de qué se pide (por ejemplo, prueba de posesión de la llave) está
  **por confirmar** en <https://developer.android.com/developer-verification/guides>.
- Cuenta «Full Distribution» en la Android Developer Console: **US$ 25**; para organizaciones se
  exige **D-U-N-S** (gratuito vía Dun & Bradstreet, hasta 28 días) y verificación de identidad.
  Las cuentas de «distribución limitada» (hasta 20 dispositivos, sin costo ni documento) son para
  pruebas y no sirven para publicar a toda la comunidad.

## 3. La llave actual (solo para registro; no usar)

| Dato | Valor |
| --- | --- |
| Alias | `mrpilo` |
| Tipo de almacén | PKCS12 |
| Algoritmo | RSA de 2048 bits, firma SHA256withRSA |
| Vigencia | 2026-10-07 a 2054-02-22 |
| DN | `CN=Mr. Pilo, OU=Planeacion Institucional, O=Universidad de Santander, L=Bucaramanga, ST=Santander, C=CO` |
| SHA-256 del certificado | `69:6B:6C:C7:D6:B9:C3:0A:EE:FD:21:23:2A:38:27:E0:EB:61:C9:A5:B4:65:9E:67:BB:E9:F4:84:82:CF:36:A7` |

El DN **sí nombra a la universidad** (no es de prueba); lo que está mal es la custodia, no el nombre.

## 4. Qué necesita de la institución

1. **Datos legales**: razón social exacta («Universidad de Santander»), NIT, dirección, teléfono y
   correo institucional (no personal) de contacto, sitio web (`https://planeacion.udes.edu.co`).
2. **Número D-U-N-S** de la universidad (si no lo tiene, se solicita gratis en Dun & Bradstreet;
   puede tardar hasta 28 días: pedirlo ya).
3. **Representante legal o apoderado** que autorice el registro, y un correo institucional genérico
   (por ejemplo `apps@udes.edu.co`) como propietario de las cuentas, no el correo de una persona.
4. **Cuenta de Google Play Console de organización** (US$ 25, pago único; verificación de identidad
   y D-U-N-S; ver
   <https://support.google.com/googleplay/android-developer/answer/13634885>). Otros requisitos
   (por ejemplo pruebas cerradas antes de producción) cambian con el tiempo: por confirmar en la consola.
5. **Registro en la verificación de desarrolladores** (sección 2), con la misma identidad legal.
6. **Dos custodios designados** para la llave (sección 6) y un lugar de respaldo institucional.
7. **Política de privacidad** vigente (ya existe: `https://planeacion.udes.edu.co/pilo-politica`).

## 5. Parámetros de la llave nueva

| Parámetro | Valor recomendado | Razón |
| --- | --- | --- |
| DN | `CN=Mr. Pilo, OU=Planeacion Institucional, O=Universidad de Santander, L=Bucaramanga, ST=Santander, C=CO` | Mismo que el actual; sin tildes para evitar problemas de codificación entre herramientas |
| Algoritmo | RSA 4096, SHA256withRSA, PKCS12 | Play acepta RSA ≥ 2048; 4096 da margen de décadas (Play genera 4096 para sus llaves) |
| Vigencia | 30 años (mínimo 25) | Play exige vigencia más allá de 2033 y la llave no se puede cambiar sin migración |
| Alias | `mrpilo` | |
| Ubicación | Fuera del repositorio | Nunca en Git |

Se genera con `node scripts/android-keygen.cjs` (use `--dry-run` primero). La contraseña se pide por
entrada oculta o por `MRPILO_KEYSTORE_PASSWORD`; no se escribe en ningún archivo. En PKCS12 la
contraseña de la llave es la del almacén. Debe tener al menos 12 caracteres, generada por un
gestor de contraseñas. Lo ejecuta **el custodio**, no el equipo de desarrollo.

## 6. Custodia de la llave

- **Dos custodios** (cargos, no personas), cada uno con acceso independiente. Ninguno comparte su
  copia por correo ni por mensajería.
- **Copias**: (a) el equipo de firma, en un equipo que no sea portátil personal; (b) una copia
  **cifrada y fuera de línea** (memoria USB cifrada o bóveda institucional) en otra sede; la
  contraseña se guarda aparte, en un gestor de contraseñas de la universidad con acceso para los dos
  custodios. Prueba de restauración cada año.
- **Nunca** en Git, en el correo, en el chat, en carpetas sincronizadas públicas ni en el portal.
- **Registro**: quién firmó cada versión y cuándo (basta con la lista de versiones y el `.sha256`).
- **Si se pierde**: si la app está en Play con Play App Signing (sección 7), se pide a Google un
  restablecimiento de la llave de subida (se genera otra y se solicita en Play Console). Para el
  APK del portal no hay recuperación: habría que publicar una app con otro identificador y los
  usuarios tendrían que reinstalar. Por eso la copia fuera de línea es obligatoria.
- **Si se filtra**: avisar a los custodios, dejar de firmar con ella, generar otra y seguir la
  rotación (sección 8) o, si no hay usuarios que proteger, reinstalar.

## 7. Play App Signing: llave de subida y llave de firma

Fuente: <https://support.google.com/googleplay/android-developer/answer/9842756>.

- Con **Play App Signing**, Google guarda la **llave de firma** (la que firma lo que reciben los
  usuarios de Play) y la universidad conserva una **llave de subida**, con la que firma lo que sube.
  Si se pierde la llave de subida, Google la restablece. Google recomienda que sean distintas.
- Se puede dejar que Google genere la llave de firma (RSA 4096) o **entregarle una copia de la
  propia** (para apps existentes, con la herramienta PEPK; para apps nuevas, antes de abrir pruebas
  o producción).
- **Implicación para el portal**: si la llave de firma queda en Google, el APK del portal firmado
  con la llave propia tendría **otra huella** distinta del que Play entrega, y no podría actualizar
  encima del de Play (ni al revés). Opciones:
  1. **Una sola llave para todo**: crear la llave de la universidad (sección 5) y entregar una copia a Play
     como llave de firma. APK del portal y de Play son intercambiables. Es lo que recomienda esta guía.
  2. Llaves distintas: se tratan como dos canales; la persona elige uno y no mezcla.
- En el `assetlinks.json` (sección 9) deben figurar las huellas de **todas** las llaves que
  puedan firmar la app.

## 8. Continuidad con la llave anterior: la decisión pendiente

Pregunta para el usuario/universidad: **¿el APK 1.0.0 (llave de prueba) llegó a instalarse fuera de
pruebas internas?** Está publicado en el portal, así que hay que averiguar si alguien más que el
equipo lo descargó.

- **Ruta A: nadie fuera del equipo lo instaló.** Se cambia de llave libremente. Se retira
  `Mr-Pilo-1.0.0.apk` del portal; los pocos instalados se desinstalan y se instala el nuevo. No hay
  rotación. Es la ruta más simple y segura (y la única razonable si la llave está comprometida).
- **Ruta B: hay instalaciones reales.** Un APK con otra llave no puede actualizar a uno instalado:
  Android lo rechaza. Se necesita **rotación con APK Signature Scheme v3** (`apksigner rotate` crea un
  «linaje» de llaves y `apksigner sign --lineage …` firma con la cadena). Pasos:
  1. `apksigner rotate --out lineage.bin --old-signer --ks <vieja> --new-signer --ks <nueva>`.
  2. Firmar el APK con ambos firmantes y el linaje:
     `apksigner sign --ks <vieja> --next-signer --ks <nueva> --lineage lineage.bin --rotation-min-sdk-version 28 …`
     (Android 13 usa el bloque v3.1; el valor 28 mantiene la rotación en Android 9–12L).
  3. Conservar la llave vieja el tiempo que dure la transición; la llave nueva debe ser la de custodia.
  Limitación importante: **la llave vieja está comprometida**, y el linaje la sigue honrando en los
  dispositivos ya instalados. Por eso, aun si hay instalaciones, se recomienda la ruta A con
  reinstalación guiada, salvo que sean muchas. (Los datos de la cuenta de Pilo están en el servidor, no en la app.)
  Estos scripts no automatizan la rotación; se haría a mano o ampliando `android-sign.cjs`.

## 9. Enlaces de aplicación (App Links) y `assetlinks.json`

Para que el enlace del correo de confirmación de la cuenta abra la app (solo descripción; lo implementa el equipo de la app):

- `public/.well-known/assetlinks.json` debe llevar el paquete `co.edu.udes.mrpilo` y las huellas
  SHA-256 de **todas** las llaves de firma vigentes (la nueva, y la de Google si se usa Play App
  Signing; quitar la de prueba comprometida). Debe servirse por HTTPS, sin redirecciones, con
  `Content-Type: application/json` y sin autenticación. Con `autoVerify`, Android re-verifica
  periódicamente (hasta 7 días en Android 15+; en 14 o menos, al instalar o actualizar).
- En `AndroidManifest.xml`, dentro de la actividad principal:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="planeacion.udes.edu.co" android:pathPrefix="/app" />
</intent-filter>
```

  (ajuste `pathPrefix` a la ruta real del enlace del correo). La app, con Capacitor, escucha el
  evento `appUrlOpen` del plugin App para llevar la URL a la ruta interna. Se prueba con
  `adb shell pm verify-app-links --re-verify co.edu.udes.mrpilo` y `adb shell pm get-app-links co.edu.udes.mrpilo`.
  Fuente: <https://developer.android.com/training/app-links/verify-android-applinks>.

## 10. Firmar una versión, paso a paso

1. Subir `versionCode` y `versionName` en `pilo-android/capacitor/app/build.gradle`.
2. Compilar el release sin firmar (`gradlew assembleRelease` o `scripts/android-build.cjs`).
3. En el equipo del custodio, fuera del repositorio, definir las variables (no queda en el historial si se escriben en la sesión, no en archivos):
   - PowerShell: `$env:MRPILO_KEYSTORE='D:\llaves\mrpilo-universidad.keystore'; $env:MRPILO_KEY_ALIAS='mrpilo'` y luego la contraseña, sacada del gestor de contraseñas y pegada en la misma
     sesión (`$env:MRPILO_KEYSTORE_PASSWORD='…'`); al cerrar la ventana desaparece.
4. `node scripts/android-sign.cjs --dry-run` y luego `node scripts/android-sign.cjs`.
   Alinea (`zipalign`), firma (v1+v2+v3; `--v4` opcional), verifica y escribe
   `public/pilo-app/apk/Mr-Pilo-<versión>.apk` y `.apk.sha256`. Se niega a usar llaves dentro del
   repositorio, de depuración o la comprometida.
5. `node scripts/android-sign.cjs --verify public/pilo-app/apk/Mr-Pilo-<versión>.apk` y comparar la
   huella del certificado con la registrada en Google y en `assetlinks.json`.
6. Actualizar `APP_APK` en `src/modules/pilo-app/pwa.ts` (versión, nombre, tamaño), borrar el APK
   anterior de `public/` y correr `apk.test.ts`.
7. Publicar el portal y comprobar la descarga (sección 11). Para Play, subir el AAB firmado con la
   llave de subida.

## 11. Descarga desde el portal

- Debe servirse por **HTTPS** con `Content-Type: application/vnd.android.package-archive` y
  `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, y sin caché larga.
  Fragmento propuesto para `vercel.json` (**no aplicado**; verificar antes con `curl -I`, porque Vercel
  ya podría enviar el tipo correcto por la extensión):

```json
{
  "source": "/pilo-app/apk/(.*)\\.apk",
  "headers": [
    { "key": "Content-Type", "value": "application/vnd.android.package-archive" },
    { "key": "Content-Disposition", "value": "attachment" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
  ]
},
{
  "source": "/pilo-app/apk/(.*)\\.sha256",
  "headers": [
    { "key": "Content-Type", "value": "text/plain; charset=utf-8" },
    { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
  ]
},
{
  "source": "/.well-known/assetlinks.json",
  "headers": [ { "key": "Content-Type", "value": "application/json" } ]
}
```

- Publicar la **huella SHA-256 del archivo** (`Mr-Pilo-<versión>.apk.sha256`) y mostrarla en la hoja
  de descarga, con un enlace «Verificar la descarga» y la instrucción: PowerShell
  `Get-FileHash .\Mr-Pilo-1.1.0.apk` o, en Android, una app de hash. Para la mayoría de personas la
  verificación es opcional, pero sirve a soporte y a quien desconfía. También conviene publicar la
  **huella del certificado**, que es lo que Android compara en cada actualización.
- Mantener un solo APK vigente en `public/`.

## 12. Instalar desde el navegador en Android y Samsung (para explicar al usuario)

Pasos generales (Android 8+): al tocar «Descargar» el navegador avisa que el archivo puede dañar el
dispositivo (aceptar) → al abrirlo, Android pide **«Permitir de esta fuente»** para ese navegador
(Chrome, Samsung Internet) → volver y pulsar **Instalar**. El permiso se concede por navegador, en
Ajustes › Apps › Acceso especial › Instalar apps desconocidas.

En **Samsung (Galaxy Z Fold/Flip, One UI 6.1.1 o posterior)**: el **Auto Blocker**
(Ajustes › Seguridad y privacidad › Auto Blocker) puede **bloquear toda instalación fuera de Play y
Galaxy Store**, deja gris «Instalar apps desconocidas» y muestra un aviso. Para instalar, se
desactiva Auto Blocker, se instala y se vuelve a activar. Fuente:
<https://www.samsung.com/uk/support/mobile-devices/protect-your-galaxy-device-with-the-new-auto-blocker-feature/>.
Las fuentes discrepan sobre si viene activado de fábrica (Samsung dice que sí en equipos nuevos; otras que no); los nombres exactos de
los menús cambian por versión de One UI y deben **probarse en un Fold y un Flip reales** antes de
publicar las capturas.

**Play Protect** puede mostrar «Aplicación no reconocida / ¿Analizar la app?» con apps que no
vienen de Play; se explica a la persona que debe elegir «Más detalles › Instalar de todos modos»
(texto exacto y comportamiento: **por confirmar** en un teléfono real; fuente a mirar: ayuda de
Google Play Protect). Registrar la app y usar una firma estable reduce estos avisos; no los elimina.

## 13. Lista de verificación antes de publicar

- [ ] `.gitignore` cubre `*.keystore`, `*.jks`, `pilo-android/keys/`; los archivos de la llave vieja salieron del índice.
- [ ] Llave nueva generada por el custodio (RSA 4096, 30 años); dos copias cifradas fuera de línea; restauración probada.
- [ ] Huella de la llave nueva anotada y comparada en: APK firmado, `assetlinks.json`, registro de desarrolladores.
- [ ] Decisión de continuidad tomada (sección 8) y `Mr-Pilo-1.0.0.apk` retirado del portal.
- [ ] Cuenta de Play de organización (D-U-N-S) y registro en la verificación de desarrolladores iniciados.
- [ ] `versionCode` mayor que el anterior; APK alineado, firmado v1+v2+v3 y verificado (`--verify`).
- [ ] `.sha256` publicado y mostrado; cabeceras de descarga comprobadas con `curl -I`.
- [ ] `assetlinks.json` en producción (HTTPS, sin redirección, JSON) con todas las huellas vigentes.
- [ ] `APP_APK` en `pwa.ts` y `apk.test.ts` al día.
- [ ] Instalación probada en Samsung Fold y Flip (con y sin Auto Blocker) y en un Android sin Samsung.
- [ ] Política de privacidad enlazada en la ficha y en la hoja de descarga.

## 14. Qué es «por confirmar»

- Fecha y alcance exactos de la verificación fuera de las cuatro primeras naciones (2027 anunciado).
- Qué pide exactamente la consola de desarrolladores para registrar un paquete y sus llaves.
- Costo y requisitos vigentes de la cuenta de Play de organización (US$ 25 según la FAQ de Google «similar a Play»; verificar en la consola).
- Texto y pasos reales de Play Protect y de One UI en los equipos de la universidad.
