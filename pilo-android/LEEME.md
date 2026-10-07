# Mr. Pilo para Android (Google Play)

La app de Android no es otro código: es la app de Pilo (`/app`) empaquetada como
**Trusted Web Activity (TWA)**. Abre `https://planeacion.udes.edu.co/app` en su
propia ventana, sin barra de direcciones, como una app nativa. Cada vez que se
publica el portal, la app instalada queda actualizada sola; a Play Store solo
se vuelve si cambia la dirección, el nombre, los iconos o la versión.

## Qué hay en esta carpeta

| Qué | Dónde |
| --- | --- |
| APK firmado (instalación directa de prueba) | `dist/app-release-signed.apk` |
| AAB firmado (el que se sube a Play Store) | `dist/app-release-bundle.aab` |
| Proyecto Android generado | `twa/` |
| Llave de firma y su clave | `keys/mrpilo-release.keystore` y `keys/CLAVE-FIRMA.txt` |
| Registro de la última compilación | `build.log` |

Datos del paquete:

| Campo | Valor |
| --- | --- |
| Application ID | `co.edu.udes.mrpilo` |
| Nombre | Mr. Pilo |
| Versión | 1.0.0 (versionCode 1) |
| Dominio verificado | `planeacion.udes.edu.co` (inicio: `/app`) |
| targetSdkVersion | 36 (cumple los requisitos de Play) |
| Huella SHA-256 de la llave | `69:6B:6C:C7:D6:B9:C3:0A:EE:FD:21:23:2A:38:27:E0:EB:61:C9:A5:B4:65:9E:67:BB:E9:F4:84:82:CF:36:A7` |

## Antes de publicar en Play Store

1. **Publique el portal con `public/.well-known/assetlinks.json` incluido.**
   Google comprueba que la app pertenece al dominio leyendo
   `https://planeacion.udes.edu.co/.well-known/assetlinks.json`; hoy esa
   dirección devuelve el HTML del portal porque el archivo no existe en
   producción. Sin él, la app instalada muestra una barra de direcciones.
2. Instale el APK de prueba (`dist/app-release-signed.apk`) en una tableta con
   «instalar apps de fuentes desconocidas» habilitado y revise la bienvenida,
   el modo sin cuenta y los atajos (Universidad / Enseñanza).
3. Cree la cuenta de Google Play (console.google.com/play, US$ 25 una sola
   vez) a nombre de la universidad.
4. Suba `dist/app-release-bundle.aab` como primera versión de producción.
   Play Console pedirá aceptar que Google guarde la llave de firma
   (*Play App Signing*): su llave queda como llave de carga. Acepte.
5. Complete la ficha: descripción, capturas, categoría (Educación),
   clasificación por edad y la política de privacidad
   (`https://planeacion.udes.edu.co/pilo-politica`).

## La descarga desde el chat de Pilo

El APK no se esconde: el propio chat de `/app` lo ofrece.

| Pieza | Dónde |
| --- | --- |
| El archivo publicado | `public/pilo-app/apk/Mr-Pilo-1.0.0.apk` |
| La ficha (URL, versión, tamaño) | `src/modules/pilo-app/pwa.ts` (`APP_APK`) |
| La hoja de descarga (pasos de instalación) | `AndroidSheet` en `src/modules/pilo-app/AppMenu.tsx` |
| El aviso del dock y la entrada «Conseguir la app» | `src/modules/pilo-app/AppShell.tsx` |
| La propuesta visual que la guio | `propuesta-descarga.html` |
| La prueba de que ficha y archivo cuentan lo mismo | `src/modules/pilo-app/apk.test.ts` |

En Android el aviso del dock dice «Conseguir la app» y abre la hoja con las dos
vías: el APK directo y, si el navegador lo ofrece, instalar sin descargar. En el
menú queda la entrada para siempre («Conseguir la app»). El iPhone y el
computador conservan su flujo de siempre. El service worker no cachea el APK.

**Al publicar una versión nueva**, además del paso 5 del box anterior:
copie el APK a `public/pilo-app/apk/Mr-Pilo-<versión>.apk`, borre el anterior y
actualice `APP_APK` en `pwa.ts` (versión, nombre, tamaño). La prueba `apk.test.ts`
exige que el archivo exista y coincida.

## La llave de firma es para siempre

Toda actualización futura debe firmarse con `keys/mrpilo-release.keystore` y la
clave que está en `keys/CLAVE-FIRMA.txt`. Si se pierden, no se puede actualizar
la app publicada: habría que publicarla como app nueva. Respalde ambos archivos
fuera de esta máquina también.

## Cómo recompilar (tras cambiar algo del portal no hace falta; solo si cambia dirección, nombre, iconos o versión)

Requisitos ya instalados en este equipo: JDK 17 y Android SDK en
`C:\Users\Admin\android-tools\`, Bubblewrap (`npm i -g @bubblewrap/cli`) y la
configuración en `C:\Users\Admin\.bubblewrap\config.json`.

```bash
# 1. Regenerar el proyecto TWA desde el manifiesto (solo si cambió el dominio)
node scripts/bubblewrap-init.cjs

# 2. Fijar versión (edite scripts/bubblewrap-set-version.cjs si sube la versión)
node scripts/bubblewrap-set-version.cjs

# 3. Copiar a ruta ASCII (Android no compila bajo "Planeación Desarrollos 2026")
node scripts/bubblewrap-setup-ascii.cjs

# 4. Compilar y firmar (lee la clave de keys/CLAVE-FIRMA.txt)
TWA_PROJECT_DIR="C:\Users\Admin\android-tools\mrpilo-twa" node scripts/bubblewrap-build.cjs

# 5. Traer los artefactos al repo
cp /c/Users/Admin/android-tools/mrpilo-twa/app-release-signed.apk dist/
cp /c/Users/Admin/android-tools/mrpilo-twa/app-release-bundle.aab dist/
```

El build escribe su registro en `build.log`. Los scripts usan el manifiesto
publicado en `https://planeacion.udes.edu.co/manifest.webmanifest` (los iconos
y atajos salen de ahí).

## Si la dirección llega a cambiar de dominio

Igual que en escritorio: repetir `bubblewrap-init.cjs` con la nueva dirección,
subir versión (`1.1.0`, versionCode 2) y publicar como actualización de la
misma app, con **la misma llave** y el mismo Application ID. Actualizar
`public/.well-known/assetlinks.json` no hace falta si el paquete no cambia de
llave, pero sí publicarlo en el dominio nuevo.
