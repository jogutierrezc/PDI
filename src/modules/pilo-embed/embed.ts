/* =============================================================================
   Pilo en otros portales · lo que no necesita pantalla.

   El chat vive en un marco (iframe) que carga /pilo-embed desde este portal;
   quien lo aloja solo pega public/pilo.js. Los dos se hablan con mensajes
   mínimos: el marco dice qué tamaño necesita y la página anfitriona dice si
   lo está mostrando a pantalla completa (móvil). Nada de lo conversado sale
   del marco.

   Hay un chat por espacio de Pilo (0113): el de siempre en /pilo-embed y
   Mr. Pilo en Enseñanza en /pilo-ensenanza-embed (data-pilo="ensenanza" en la
   línea que se pega). Cada uno tiene su propio interruptor y su lista de
   portales autorizados.
   ========================================================================== */

import type { Tema } from "../pregunta/store";
import { ASK_SPACES, isAskSpace } from "../pregunta/space";
import type { SpaceId } from "../pregunta/space";

export type Lado = "der" | "izq";

/** Lo que el marco necesita mostrar: nada, el botón, el botón con su saludo o el chat. */
export type FrameState = "oculto" | "cerrado" | "saludo" | "abierto";

export interface EmbedParams {
  tema: Tema;
  lado: Lado;
  /** El espacio del marco, cuando no es el de siempre. */
  space?: SpaceId;
}

/**
 * Lo que pidió la página anfitriona en la dirección del marco (?tema=…&lado=…).
 * El espacio lo fija la ruta del marco, no la dirección: solo se anota cuando
 * no es el de siempre.
 */
export function readParams(search: string, space: SpaceId = "planeacion"): EmbedParams {
  const q = new URLSearchParams(search);
  const tema = (q.get("tema") ?? "").trim().toLowerCase();
  const lado = (q.get("lado") ?? "").trim().toLowerCase();
  return {
    tema: tema === "soleado" || tema === "negro" ? tema : "blanco",
    lado: lado.startsWith("izq") ? "izq" : "der",
    ...(isAskSpace(space) && space !== "planeacion" ? { space } : {}),
  };
}

type Widget = { on: boolean; origins: string[] };

/**
 * El interruptor y los portales autorizados del chat de un espacio: el de
 * siempre los tiene en `widget` (0111); los demás, en `spaces[espacio].widget`
 * (0113). null si el espacio no existe en la configuración.
 */
export function spaceWidget(config: { widget?: Widget | null; spaces?: Record<string, { widget?: Widget | null } | undefined> | null } | null | undefined, space: SpaceId = "planeacion"): Widget | null {
  if (!config) return null;
  return (space === "planeacion" ? config.widget : config.spaces?.[space]?.widget) ?? null;
}

export const frameMessage = (state: FrameState) => ({ source: "pilo-embed", type: "estado", state }) as const;

/** El mensaje de la página anfitriona, o null si no es suyo o no se entiende. */
export function readHostMessage(data: unknown): { full: boolean } | null {
  const m = data as { source?: unknown; full?: unknown } | null;
  if (!m || typeof m !== "object" || m.source !== "pilo-host") return null;
  return { full: m.full === true };
}

/** «www.udes.edu.co/», «https://Admisiones.udes.edu.co/ruta» → su origen; null si no es la dirección de un sitio. */
export function normalizeOrigin(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * El origen de la página que aloja el marco: el primero de ancestorOrigins
 * (Chromium y Safari) o, si no lo hay, el del referente con que se cargó.
 * null si no se puede saber: fuera de un marco, o con el referente quitado.
 */
export function hostOrigin(ancestors: ArrayLike<string> | null | undefined, referrer: string): string | null {
  const first = ancestors && ancestors.length > 0 ? ancestors[0] : "";
  return normalizeOrigin(first || referrer);
}

/**
 * ¿Puede esta página mostrar el chat? Este portal, siempre. Otro, solo con el
 * interruptor encendido y su origen en la lista (0111); si no se sabe quién
 * aloja el marco, no.
 */
export function widgetAllowed(widget: { on: boolean; origins: string[] } | null | undefined, host: string | null, self: string): boolean {
  if (!host) return false;
  if (host === self) return true;
  if (!widget?.on) return false;
  return widget.origins.some((o) => normalizeOrigin(o) === host);
}

/** La línea que se pega en el otro portal. Otro espacio de Pilo se pide con `data-pilo`. */
export function widgetSnippet(origin: string, tema: Tema, lado: Lado, space: SpaceId = "planeacion"): string {
  const pilo = isAskSpace(space) && space !== "planeacion" ? ` data-pilo="${space}"` : "";
  return `<script src="${origin.replace(/\/+$/, "")}/pilo.js"${pilo} data-tema="${tema}" data-esquina="${lado === "izq" ? "izquierda" : "derecha"}" defer></script>`;
}

/** La ruta del marco de un espacio (la misma que arma public/pilo.js). */
export const embedRoute = (space: SpaceId = "planeacion"): string => (ASK_SPACES[space] ?? ASK_SPACES.planeacion).embedRoute;

/** A dónde lleva una fuente: su página en el portal, o la página de ese Pilo (Pregúntele a Pilo, si no se dice otra) cuando no tiene una. */
export function sourceUrl(path: string | null | undefined, origin: string, fallback = "/pregunta"): string {
  const p = (path ?? "").trim();
  if (/^https?:\/\//i.test(p)) return p;
  return `${origin.replace(/\/+$/, "")}${p.startsWith("/") ? p : fallback}`;
}
