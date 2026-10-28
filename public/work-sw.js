/* =============================================================================
   Pilo at Work · el service worker (/work).

   Propio y pequeño. Hace tres cosas:
     - guarda el esqueleto de la app (la página /work, los iconos y la cara de
       Pilo) y los archivos del sitio (/assets/…) para abrir al instante;
     - recibe los avisos de Web Push (reuniones y plazos) y los muestra, aunque
       la app esté cerrada, si la persona lo permitió;
     - al pulsar un aviso, abre o enfoca la app.

   NUNCA guarda respuestas de Pilo, de Supabase ni de /api: todo lo que no es un
   GET de este mismo sitio pasa de largo. Para publicar un cambio, suba VERSION.
   ========================================================================== */

const VERSION = "v1";
const SHELL = `pilo-work-esqueleto-${VERSION}`;
const ASSETS = `pilo-work-archivos-${VERSION}`;
const SHELL_URL = "/work";
const ASSET_LIMIT = 90;
const PRECACHE = [SHELL_URL, "/work-manifest.webmanifest", "/pilo-app/icon-192.png", "/pilo-app/icon-512.png", "/logo-udes.svg", "/logo-udes-oscuro.svg", "/pilo-moods/feliz-160.webp", "/pilo-moods/piensa-160.webp", "/pilo-moods/idea-160.webp", "/pilo-moods/excelente-160.webp", "/pilo-moods/bien-160.webp"];
const NEVER = /^\/(api|functions|rest|auth|storage|realtime)(\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => undefined)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pilo-work-") && k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function recortar(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - ASSET_LIMIT; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return;
  if (request.mode === "navigate") {
    if (url.pathname !== SHELL_URL && !url.pathname.startsWith(SHELL_URL + "/")) return;
    event.respondWith(fetch(request).catch(() => caches.match(SHELL_URL).then((r) => r || Response.error())));
    return;
  }
  if (url.search || (!/^\/(assets|pilo-face|pilo-moods|pilo-app)\//.test(url.pathname) && !PRECACHE.includes(url.pathname))) return;
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(ASSETS).then((c) => c.put(request, copia).then(() => recortar(c)));
          }
          return resp;
        }),
    ),
  );
});

/* --- Avisos (Web Push) --- */
self.addEventListener("push", (event) => {
  let aviso = { titulo: "Pilo at Work", cuerpo: "Tiene un aviso.", url: "/work" };
  try {
    if (event.data) aviso = { ...aviso, ...event.data.json() };
  } catch (error) {
    if (event.data) aviso.cuerpo = event.data.text().slice(0, 200);
  }
  event.waitUntil(
    self.registration.showNotification(aviso.titulo, { body: aviso.cuerpo, tag: aviso.tag, icon: "/pilo-app/icon-192.png", badge: "/pilo-app/icon-192.png", data: { url: aviso.url || "/work" } }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/work";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if (c.url.includes("/work") && "focus" in c) {
          if ("navigate" in c) c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
