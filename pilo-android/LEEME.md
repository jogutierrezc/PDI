# Mr. Pilo para Android

La app de Android es la app de Pilo (`/app`) dentro de una **envoltura nativa
con Capacitor**: el APK lleva la web compilada adentro y la abre en su propio
WebView, con pantalla de inicio nativa, barra de estado, botón «atrás»,
vibración y teclado. Se distribuye **desde el portal web** y, más adelante,
también por Google Play.

> Antes se empaquetaba como TWA (una pestaña de Chrome sin barra, en
> `pilo-android/twa/`, con Bubblewrap). Ese empaquetado queda como respaldo y ya
> no se usa: el aspecto de «página web» que tenía venía justo de ahí.

## Qué hay en esta carpeta

| Qué | Dónde |
| --- | --- |
| Proyecto Android generado por Capacitor | `capacitor/` |
| Configuración de Capacitor | `../capacitor.config.ts` (raíz del proyecto) |
| La web de la app, compilada | `../dist-android/` (no se versiona) |
| Puente nativo en la web (botón atrás, splash, vibración) | `../src/modules/pilo-app/native.ts` |
| Script de compilación | `../scripts/android-build.cjs` (`npm run android…`) |
| Firma a nombre de la universidad | `FIRMA.md` y `../scripts/android-sign.cjs` |
| Empaquetado anterior (TWA) y su llave | `twa/`, `keys/`, `dist/` |

Datos del paquete: **`co.edu.udes.mrpilo`** (el mismo del TWA), versión 1.1.0
(versionCode 2), minSdk 24, targetSdk 36.

## Compilar

Necesita **JDK 21** y el **SDK de Android** (el script los busca en
`~/android-tools/jdk-21` y `~/android-tools/sdk`, o en `JAVA_HOME` /
`ANDROID_HOME`). No hace falta Android Studio.

```
npm run android:web       # compila la web de la app en dist-android
npm run android:sync      # la copia al proyecto Android
npm run android:debug     # APK de pruebas (firma de depuración)
npm run android:release   # APK de producción SIN firmar
npm run android           # todo lo anterior
```

Los APK quedan en `capacitor/app/build/outputs/apk/{debug,release}/`.

El de **producción sale sin firmar** a propósito: la firma de la universidad se
pone después (`scripts/android-sign.cjs`, ver `FIRMA.md`), con una llave que
custodia la institución y que nunca vive en el repositorio. El de depuración
sirve para probar en un teléfono, pero **no se publica**.

## Cómo se comporta dentro de la app

- **Mismo origen que el portal.** La app se sirve como `https://<dominio del
  portal>` (por defecto `planeacion.udes.edu.co`; se cambia compilando con
  `PILO_NATIVE_HOST=<dominio>`). Así las funciones del servidor, que solo
  aceptan el origen del portal (`ALLOWED_ORIGIN`), responden sin tocar su
  configuración. Si el portal cambia de dominio, hay que recompilar con el
  nuevo y volver a publicar el APK.
- **Abre en Pilo.** Dentro de la app, `/` redirige a `/app`.
- **Sin service worker.** Los archivos ya viajan en el APK.
- **Plegables Samsung.** La actividad no se reinicia al plegar o desplegar el
  teléfono (`configChanges` con `screenSize|smallestScreenSize|screenLayout|density`)
  y es redimensionable (`resizeableActivity`), sin bloqueo de orientación: la
  interfaz recibe el cambio de tamaño y conserva su estado.
- **Permisos:** internet y micrófono (la llamada con Pilo). Cámara y
  notificaciones se agregan cuando existan el escáner de carnets y las alertas
  de emergencia.

## Distribución desde el portal

1. Compilar (`npm run android:release`) y **firmar** con la llave de la
   universidad (`FIRMA.md`).
2. Dejar el APK firmado en `public/pilo-app/apk/Mr-Pilo-<versión>.apk`, con su
   huella `.sha256` al lado, y actualizar la ficha `APP_APK` de
   `src/modules/pilo-app/pwa.ts` (la prueba `apk.test.ts` vigila que ficha y
   archivo cuenten lo mismo).
3. Publicar el portal. La hoja «Conseguir la app» del chat ofrece la descarga a
   quien entra desde un Android.

## Pendiente antes de la primera versión pública

- Una llave de firma de la universidad y su custodia (`FIRMA.md`). Hasta
  entonces el APK de `public/pilo-app/apk/` sigue siendo el del TWA.
- Probar en un teléfono real y en un plegable Samsung (aquí no hay dispositivo).
- Decidir si el enlace del correo de confirmación debe abrir la app (enlaces de
  aplicación, `assetlinks.json` con la huella de la llave definitiva).
- Notificaciones (alertas de emergencia) con Firebase Cloud Messaging, si se
  quiere que lleguen con la app cerrada.
- Reemplazar la interfaz por el rediseño aprobado (artifact «Mr. Pilo Móvil»):
  hoy el APK lleva la interfaz actual de `/app`.
