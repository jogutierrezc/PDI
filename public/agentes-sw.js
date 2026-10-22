/* =============================================================================
   Portal de agentes · el service worker (/agentes).

   Pequeño, propio y PASIVO: no intercepta nada de la red (las páginas del
   portal siempre hablan directo con Supabase). Solo hace dos cosas:

     - recibe los avisos de Web Push (cifrados, RFC 8291) y los muestra;
     - abre el portal cuando alguien pulsa un aviso.

   La suscripción la guarda el portal con la función `soporte`
   (push_guardar), y las llaves VAPID viven en la base (0184).
   ========================================================================== */

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event && event.waitUntil && event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* El aviso: lo que manda la función soporte viene cifrado y en JSON. */
self.addEventListener("push", (event) => {
  let aviso = { titulo: "Portal de agentes", cuerpo: "Hay novedades en su bandeja.", url: "/agentes" };
  try {
    if (event.data) aviso = { ...aviso, ...event.data.json() };
  } catch (error) {
    if (event.data) aviso.cuerpo = event.data.text().slice(0, 200);
  }
  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      tag: aviso.tag,
      icon: "/pilo-app/icon-192.png",
      badge: "/pilo-app/icon-192.png",
      data: { url: aviso.url || "/agentes" },
    }),
  );
});

/* Al pulsar el aviso: abrir (o despertar) el portal y enfocar la ventana. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/agentes";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if (cliente.url.includes("/agentes") && "focus" in cliente) return cliente.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
