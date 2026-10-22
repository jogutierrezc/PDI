/* =============================================================================
   Portal de agentes · los avisos cuando la bandeja no está a la vista.

   Sonido discreto, notificación del navegador y título parpadeante para quien
   está en otra pestaña; y si el portal se instaló como app (PWA), Web Push
   para cuando está cerrado. La parte que decide «qué avisar» es pura y se
   prueba en node: compara dos instantes de la bandeja y dice qué hay nuevo
   para este agente. Lo demás es el navegador: permiso, campanita, título y
   la suscripción de push que se guarda en la función `soporte`.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { soporte } from "../soporte/llamada";

/* --- Qué avisar (puro) ----------------------------------------------------------------------------- */

export interface ConvAviso {
  id: string;
  status: string;
  offered_to: string | null;
  offer_expires_at: string | null;
}

/** Un instante de la bandeja: las conversaciones, lo sin leer y el reloj. */
export interface Instante {
  convs: ConvAviso[];
  unread: Record<string, number>;
  now: number;
}

export type TipoAviso = "oferta" | "mensaje" | "apuro";

export interface Aviso {
  tipo: TipoAviso;
  id: string;
  /** Para la oferta: cuántos segundos tenía para aceptar; para el apuro: los que quedan. */
  segundos: number;
}

/** Qué hay de nuevo entre dos instantes, para este agente. */
export function avisosNuevos(prev: Instante | null, next: Instante, meId: string, acceptSeconds = 45): Aviso[] {
  const salida: Aviso[] = [];
  const antes = new Map((prev?.convs ?? []).map((c) => [c.id, c]));
  for (const c of next.convs) {
    const viejo = antes.get(c.id);
    if (c.status === "offered" && c.offered_to === meId) {
      // Una oferta nueva para mí (o una re-oferta con otra ventana de tiempo).
      if (!viejo || viejo.status !== "offered" || viejo.offered_to !== meId || viejo.offer_expires_at !== c.offer_expires_at) {
        salida.push({ tipo: "oferta", id: c.id, segundos: acceptSeconds });
      }
      // La misma oferta, por vencerse: solo se avisa cuando cruza la línea de los 15 segundos.
      const vence = Date.parse(c.offer_expires_at ?? "");
      const quedan = vence - next.now;
      if (vence && quedan > 0 && quedan < 15_000) {
        const antesVence = viejo?.offer_expires_at ? Date.parse(viejo.offer_expires_at) - (prev?.now ?? next.now) : Number.POSITIVE_INFINITY;
        if (antesVence >= 15_000) salida.push({ tipo: "apuro", id: c.id, segundos: Math.max(1, Math.round(quedan / 1000)) });
      }
    }
    // Un mensaje de la persona que aún no leo, en una conversación mía.
    if ((next.unread[c.id] ?? 0) > (prev?.unread[c.id] ?? 0) && (c.status === "open" || c.status === "snoozed")) {
      salida.push({ tipo: "mensaje", id: c.id, segundos: 0 });
    }
  }
  return salida;
}

export const TEXTO: Record<TipoAviso, (segundos: number) => { titulo: string; cuerpo: string }> = {
  oferta: (s) => ({ titulo: "Nueva conversación para ti", cuerpo: `Tienes ${s} segundos para aceptarla.` }),
  apuro: (s) => ({ titulo: "Se acaba tu tiempo", cuerpo: `Quedan ${s} segundos para aceptar la conversación.` }),
  mensaje: () => ({ titulo: "La persona te escribió", cuerpo: "Hay un mensaje nuevo en tu bandeja." }),
};

/* --- El navegador ----------------------------------------------------------------------------------- */

export type Permiso = NotificationPermission | "sin-api";

export function permisoAvisos(): Permiso {
  return typeof Notification === "undefined" ? "sin-api" : Notification.permission;
}

export async function pedirAvisos(): Promise<Permiso> {
  if (typeof Notification === "undefined") return "sin-api";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Una campanita corta hecha con WebAudio: sin archivos, sin bajar nada. */
export function campanita() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    [880, 1175].forEach((frecuencia, i) => {
      const oscilador = ctx.createOscillator();
      const volumen = ctx.createGain();
      oscilador.type = "sine";
      oscilador.frequency.value = frecuencia;
      const t0 = ctx.currentTime + i * 0.14;
      volumen.gain.setValueAtTime(0, t0);
      volumen.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      volumen.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      oscilador.connect(volumen).connect(ctx.destination);
      oscilador.start(t0);
      oscilador.stop(t0 + 0.24);
    });
    setTimeout(() => void ctx.close(), 900);
  } catch {
    /* sin sonido */
  }
}

let parpadeoTimer: ReturnType<typeof setInterval> | null = null;

/** Hace parpadear el título de la pestaña hasta que alguien vuelve a mirarla. */
export function parpadear(mensaje: string, tituloOriginal: string) {
  detenerParpadeo(tituloOriginal);
  let alterno = false;
  parpadeoTimer = setInterval(() => {
    alterno = !alterno;
    document.title = alterno ? mensaje : tituloOriginal;
  }, 900);
}

export function detenerParpadeo(titulo: string) {
  if (parpadeoTimer) {
    clearInterval(parpadeoTimer);
    parpadeoTimer = null;
  }
  if (typeof document !== "undefined") document.title = titulo;
}

/** Avisa: notificación del navegador, campanita y título parpadeante. Solo si la pestaña no está a la vista. */
export function avisar(titulo: string, cuerpo: string, opciones: { tag?: string; url?: string; tituloOriginal?: string } = {}) {
  if (typeof document === "undefined" || document.visibilityState === "visible") return;
  campanita();
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const n = new Notification(titulo, { body: cuerpo, tag: opciones.tag });
      n.onclick = () => {
        window.focus();
        if (opciones.url) window.location.href = opciones.url;
        n.close();
      };
    }
  } catch {
    /* sin notificaciones */
  }
  parpadear(titulo, opciones.tituloOriginal ?? document.title);
}

/* --- Web Push (el portal cerrado) -------------------------------------------------------------------- */

/** Suscribe el navegador de este agente a los avisos push. */
export async function suscribirPush(clavePublica: string): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !clavePublica) return null;
  try {
    await navigator.serviceWorker.register("/agentes-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const registro = await navigator.serviceWorker.getRegistration();
    if (!registro) return null;
    const existente = await registro.pushManager.getSubscription();
    return existente ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clavePublica }));
  } catch {
    return null;
  }
}

/** Enciende los avisos push: pide la llave a la función, suscribe y guarda la suscripción. */
export async function activarPush(): Promise<boolean> {
  try {
    const clave = await soporte<{ public: string | null }>({ action: "push_clave" }, { session: true });
    if (!clave.public) return false;
    const sub = await suscribirPush(clave.public);
    if (!sub) return false;
    const json = sub.toJSON();
    await soporte({ action: "push_guardar", endpoint: sub.endpoint, p256dh: String(json.keys?.p256dh ?? ""), auth: String(json.keys?.auth ?? "") }, { session: true });
    return true;
  } catch {
    return false;
  }
}

/** Apaga los avisos push de este navegador. */
export async function apagarPush(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registro = await navigator.serviceWorker.getRegistration();
    const sub = await registro?.pushManager.getSubscription();
    if (sub) {
      await soporte({ action: "push_quitar", endpoint: sub.endpoint }, { session: true }).catch(() => undefined);
      await sub.unsubscribe();
    }
  } catch {
    /* ya estaba apagado */
  }
}

/* --- El gancho que ve pasar la bandeja -------------------------------------------------------------- */

/** Mira dos instantes de la bandeja y avisa lo nuevo. Se monta una vez en el marco. */
export function useAvisos(meId: string | null, convs: ConvAviso[] | undefined, unread: Record<string, number> | undefined, acceptSeconds: number, tituloOriginal: string) {
  const previo = useRef<Instante | null>(null);
  const tituloBase = useRef(tituloOriginal);
  useEffect(() => {
    if (!meId || !convs || !unread) return;
    const instante: Instante = { convs, unread, now: Date.now() };
    const antes = previo.current;
    previo.current = instante;
    if (!antes) return;
    for (const a of avisosNuevos(antes, instante, meId, acceptSeconds)) {
      const texto = TEXTO[a.tipo](a.segundos);
      avisar(texto.titulo, texto.cuerpo, { tag: a.id, url: a.tipo === "mensaje" ? `/agentes?c=${a.id}` : "/agentes", tituloOriginal: tituloBase.current });
    }
  }, [meId, convs, unread, acceptSeconds]);

  // Al volver a mirar la pestaña, el título deja de parpadear.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") detenerParpadeo(tituloBase.current);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);
}

/** El botón de «Instalar la app» (el navegador lo ofrece una sola vez; index.html lo guarda). */
export function useInstalacion() {
  const [evento, setEvento] = useState<false | Event>(false);
  useEffect(() => {
    const listo = () => setEvento((window as unknown as { __agentesInstall?: Event }).__agentesInstall ?? false);
    listo();
    window.addEventListener("agentes-install", listo);
    return () => window.removeEventListener("agentes-install", listo);
  }, []);
  return {
    hay: Boolean(evento),
    instalar: async () => {
      const e = (window as unknown as { __agentesInstall?: (Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> }) | undefined }).__agentesInstall;
      if (!e) return false;
      await e.prompt();
      (window as unknown as { __agentesInstall?: Event }).__agentesInstall = undefined;
      setEvento(false);
      return true;
    },
  };
}
