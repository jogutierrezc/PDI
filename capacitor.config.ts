/* =============================================================================
   Mr. Pilo para Android · Capacitor.

   La app de Android es la app de Pilo (`/app`) dentro de una envoltura nativa:
   Capacitor guarda la web compilada dentro del APK y la abre en un WebView
   propio, con pantalla de inicio nativa, barra de estado, botón «atrás»,
   vibración y teclado. Reemplaza al empaquetado anterior (TWA, una pestaña de
   Chrome sin barra), que no podía hacer nada de eso.

   Mismo identificador que el TWA (co.edu.udes.mrpilo) y misma llave de firma:
   Play lo recibe como una actualización de la misma app, no como una nueva.

   El proyecto Android vive en pilo-android/capacitor (ver pilo-android/LEEME.md).
   La web se compila aparte, en dist-android, para no pisar la carpeta dist del
   portal.
   ========================================================================== */

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "co.edu.udes.mrpilo",
  appName: "Mr. Pilo",
  webDir: "dist-android",
  backgroundColor: "#0a2d63",
  android: {
    path: "pilo-android/capacitor",
    backgroundColor: "#0a2d63",
    allowMixedContent: false,
  },
  server: {
    // La app se sirve con el MISMO origen que el portal (https://<dominio>), no con https://localhost.
    // Así las funciones del servidor, que solo aceptan el origen del portal (ALLOWED_ORIGIN), responden
    // sin tocar su configuración. Las peticiones a este dominio se atienden con los archivos del APK;
    // Supabase y los demás servicios, que son otros dominios, salen a internet con normalidad.
    // Si el portal cambia de dominio: PILO_NATIVE_HOST=<dominio> al compilar.
    hostname: process.env.PILO_NATIVE_HOST ?? "planeacion.udes.edu.co",
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      // Se oculta desde la web en cuanto Pilo está listo; la duración es solo el seguro por si algo falla.
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#0a2d63",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
    },
  },
};

export default config;
