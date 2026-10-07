# Mr. Pilo para escritorio (Microsoft Store)

La app de escritorio no es otro código: es la app de Pilo (`/app`) empaquetada
para Windows. Lo que se sube a la Store es un paquete que abre esa dirección en
su propia ventana. Cada vez que se publica el portal, la app instalada queda
actualizada sola; a la Store solo se vuelve si cambia la dirección, el nombre o
los iconos.

## Qué hace distinto la app en el computador

- **Bienvenida de escritorio.** Pilo se presenta diciendo que ahora está en el
  computador, con la escena a la medida de una ventana grande.
- **Cuenta obligatoria.** Al final de la bienvenida Pilo no pregunta con cuál
  Pilo hablar: pide crear la cuenta o entrar. Sin cuenta no se llega a la
  conversación, y en las pantallas de la cuenta no aparece «Usar Pilo sin
  cuenta». Vale la cuenta de Pilo o la sesión de la intranet.
- **En el teléfono y en la pestaña del navegador todo sigue igual**, con su
  modo sin cuenta.

La app se reconoce como «de escritorio» cuando corre instalada (en su propia
ventana) en un equipo que no es teléfono ni tableta. Eso incluye la instalada
desde la Store y la instalada con «Instalar» en Edge o Chrome.

Dónde está en el código:

| Qué | Archivo |
| --- | --- |
| Cuándo es la app de escritorio y a quién deja pasar | `src/modules/pilo-app/desktop.ts` |
| Lo que dice Pilo en la bienvenida de escritorio | `src/modules/pilo-app/welcome-script.ts` |
| La bienvenida | `src/modules/pilo-app/AppWelcome.tsx` |
| La regla de la cuenta obligatoria | `src/modules/pilo-app/PiloApp.tsx` |
| Registro e ingreso sin «sin cuenta» | `src/modules/pilo-app/account/AccountGate.tsx` |
| El manifiesto de la app | `public/manifest.webmanifest` |
| Pruebas | `src/modules/pilo-app/desktop.test.ts` |

## Antes de empaquetar

1. Publique el portal con estos cambios.
2. Pruebe sin la Store: abra `https://udesplanea.com/app` en Edge, menú
   «Aplicaciones» › «Instalar Mr. Pilo». En la ventana que se abre debe ver la
   bienvenida de escritorio y, al final, «Crear mi cuenta» / «Ya tengo cuenta».
   Si ya había visto la bienvenida en ese equipo, la app abre directo en el
   ingreso.

## Empaquetar con PWABuilder

1. En Partner Center, reserve el nombre de la app (por ejemplo «Mr. Pilo») y
   abra **Administración del producto › Identidad del producto**. Copie tres
   valores: *Package/Identity/Name*, *Package/Identity/Publisher* y
   *Package/Properties/PublisherDisplayName*.
2. Vaya a <https://www.pwabuilder.com>, escriba la dirección de la app
   (`https://udesplanea.com/app`) y pulse **Start**.
3. Pulse **Package for stores › Windows** y llene:
   - **Package ID**: el *Package/Identity/Name* de Partner Center.
   - **Publisher ID**: el *Package/Identity/Publisher* (empieza por `CN=`).
   - **Publisher display name**: el *PublisherDisplayName*.
   - **App name**: Mr. Pilo.
   - **App version**: `1.0.0` (suba este número en cada paquete nuevo).
4. Descargue el paquete. Trae un `.msixbundle` y un `.classic.appxbundle`.
5. En Partner Center, en el envío de la app, sección **Paquetes**, suba los dos
   archivos. Complete la ficha y envíe a certificación.

Guarde aquí, en esta carpeta, el archivo `.zip` que entrega PWABuilder de cada
versión: es la forma de saber qué se subió.

## Cuando la dirección pase a planeacion.udes.edu.co/app

El paquete lleva la dirección por dentro, así que el cambio de dominio sí pasa
por la Store:

1. Publique el portal en el dominio nuevo y deje el viejo redirigiendo a él.
2. Repita «Empaquetar con PWABuilder» con `https://planeacion.udes.edu.co/app`,
   **los mismos tres valores de identidad** y una versión mayor (`1.1.0`).
3. Súbalo en Partner Center como actualización de la misma app.
4. En Supabase › Authentication › URL Configuration, agregue el dominio nuevo
   a las direcciones de redirección: los correos de confirmación y de cambio de
   contraseña vuelven a `/app/cuenta`.
5. Si la función `pilo-ia` tiene la variable `ALLOWED_ORIGIN` con el dominio
   viejo, agregue el nuevo.

Quien ya tenía la app tendrá que entrar otra vez con su usuario: la sesión se
guarda por dominio. El manifiesto no hay que tocarlo, sus rutas son relativas.

## Lo que queda de su lado

- La ficha de la Store: descripción, capturas, categoría y clasificación por edad.
- La dirección de la política de privacidad para la ficha: `/pilo-politica`
  del dominio donde esté publicado el portal.
- Esperar la certificación de Microsoft.
