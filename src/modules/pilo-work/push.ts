/* =============================================================================
   Pilo at Work · avisos del sistema (Web Push) desde el navegador.

   Registra el service worker propio (/work-sw.js, alcance /work), pide permiso y
   guarda la suscripción de ESTE dispositivo en pw_push_suscripciones. La llave VAPID
   pública la entrega la función pw-avisos; la privada nunca sale del servidor.
   ========================================================================== */

import { supabase } from "../../lib/supabase";
import { callFn } from "./api";

export const SW_URL = "/work-sw.js";

export function registrarWorker() {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(SW_URL, { scope: "/work" }).catch(() => undefined);
}

export const pushDisponible = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const aBytes = (b64: string): Uint8Array => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const aB64url = (buf: ArrayBuffer | null): string => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "");

export interface Prefs {
  avisarEquipo: boolean;
  segundoPlano: boolean;
}

export async function leerPrefs(): Promise<Prefs & { suscrito: boolean }> {
  if (!pushDisponible()) return { avisarEquipo: false, segundoPlano: false, suscrito: false };
  const reg = await navigator.serviceWorker.getRegistration("/work");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return { avisarEquipo: false, segundoPlano: false, suscrito: false };
  const { data } = await supabase.from("pw_push_suscripciones").select("avisar_equipo, segundo_plano").eq("endpoint", sub.endpoint).maybeSingle();
  return { avisarEquipo: Boolean(data?.avisar_equipo), segundoPlano: Boolean(data?.segundo_plano), suscrito: true };
}

/** Pide permiso, suscribe este dispositivo y guarda las preferencias. Lanza un texto claro si no se puede. */
export async function guardarPrefs(prefs: Prefs, userId: string): Promise<void> {
  if (!pushDisponible()) throw new Error("Este navegador no permite avisos del sistema.");
  if (!prefs.avisarEquipo && !prefs.segundoPlano) {
    const reg = await navigator.serviceWorker.getRegistration("/work");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.from("pw_push_suscripciones").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    return;
  }
  if (Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission !== "granted") throw new Error("Los avisos están bloqueados en este navegador. Actívelos en la configuración del sitio.");
  const reg = (await navigator.serviceWorker.getRegistration("/work")) ?? (await navigator.serviceWorker.register(SW_URL, { scope: "/work" }));
  await navigator.serviceWorker.ready;
  const { public: llave } = await callFn<{ public: string | null }>("pw-avisos", { action: "clave" });
  if (!llave) throw new Error("Los avisos con la app cerrada aún no están configurados por TIC. Mientras la app esté abierta, sí le avisamos.");
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(llave) as unknown as BufferSource }));
  const { error } = await supabase.from("pw_push_suscripciones").upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: aB64url(sub.getKey("p256dh")),
      auth_key: aB64url(sub.getKey("auth")),
      dispositivo: navigator.userAgent.slice(0, 120),
      avisar_equipo: prefs.avisarEquipo,
      segundo_plano: prefs.segundoPlano,
      visto_en: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error("No se pudo guardar el aviso. Intente de nuevo.");
}
