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

   Leer la página (0127): si la línea lleva data-leer="si", el marco le pide a
   la página anfitriona su texto visible cuando alguien pregunta. Con la
   pregunta viajan solo los pasajes que más tienen que ver con ella; la página
   entera va aparte, una vez, a la bandeja de lecturas de la administración.
   ========================================================================== */

import type { Tema } from "../pregunta/store";
import { ASK_SPACES, isAskSpace } from "../pregunta/space";
import type { SpaceId } from "../pregunta/space";
import { PAGE_CAPTURE_CHARS, PAGE_PASSAGE_CHARS, PAGE_PASSAGES, pageUrl } from "../../components/pilo/ai/logic";
import { pickPassages } from "../pregunta/attach";

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
export function readHostMessage(data: unknown): { full: boolean; read?: true } | null {
  const m = data as { source?: unknown; full?: unknown; read?: unknown } | null;
  if (!m || typeof m !== "object" || m.source !== "pilo-host") return null;
  // «read» solo viaja cuando la línea lo pide: sin él, el mensaje es el de siempre.
  return { full: m.full === true, ...(m.read === true ? { read: true as const } : {}) };
}

/* --- Leer la página anfitriona (0127) -------------------------------------------------- */

/** Lo que el marco le pide a la página: su texto, ahora. El `id` empareja la respuesta con el pedido. */
export const pageRequest = (id: string) => ({ source: "pilo-embed", type: "leer", id }) as const;

export interface PageBlock {
  /** Es un título. */
  h: boolean;
  t: string;
}

/** La página tal como la leyó public/pilo.js, ya revisada aquí. */
export interface HostPage {
  url: string;
  title: string;
  blocks: PageBlock[];
}

const BLOCKS_MAX = 2000;

/**
 * La respuesta de la página a un pedido de lectura. null si no es suya, no es
 * de este pedido o no se entiende; `page: null` si la página no se deja leer
 * (sin data-leer) o no tiene texto.
 */
export function readHostPage(data: unknown, id: string): { page: HostPage | null } | null {
  const m = data as { source?: unknown; type?: unknown; id?: unknown; page?: unknown } | null;
  if (!m || typeof m !== "object" || m.source !== "pilo-host" || m.type !== "pagina" || m.id !== id) return null;
  const p = m.page as { url?: unknown; title?: unknown; blocks?: unknown } | null;
  if (!p || typeof p !== "object") return { page: null };
  const url = pageUrl(p.url);
  if (!url) return { page: null };
  let size = 0;
  const blocks: PageBlock[] = [];
  for (const b of Array.isArray(p.blocks) ? p.blocks.slice(0, BLOCKS_MAX) : []) {
    const t = typeof (b as { t?: unknown })?.t === "string" ? (b as { t: string }).t.replace(/\s+/g, " ").trim() : "";
    if (t.length < 2) continue;
    if (size + t.length > PAGE_CAPTURE_CHARS) break;
    size += t.length;
    blocks.push({ h: Boolean((b as { h?: unknown }).h), t });
  }
  if (!blocks.length) return { page: null };
  const title = (typeof p.title === "string" ? p.title : "").replace(/\s+/g, " ").trim().slice(0, 200);
  return { page: { url, title: title || hostLabel(url), blocks } };
}

/** «www.udes.edu.co/admisiones»: la dirección como se le dice a la persona, sin protocolo ni parámetros. */
export function hostLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

/**
 * La página en pasajes: cada título abre uno y va en su primera línea, y un
 * pasaje que se pasa del tope se parte. Con títulos, cada pasaje dice de qué
 * sección es; sin ellos, la página queda en trozos de su tamaño.
 */
export function pagePassages(page: HostPage, chars: number = PAGE_PASSAGE_CHARS): string[] {
  const out: string[] = [];
  let heading = "";
  let body = "";
  const flush = () => {
    const text = body.trim();
    if (text) out.push(heading ? `${heading}\n${text}` : text);
    body = "";
  };
  for (const b of page.blocks) {
    if (b.h) {
      flush();
      heading = b.t.slice(0, 200);
      continue;
    }
    const room = chars - heading.length - 1;
    for (let rest = b.t; rest; rest = rest.slice(room)) {
      const piece = rest.slice(0, room);
      if (body && body.length + piece.length + 1 > room) flush();
      body += (body ? "\n" : "") + piece;
    }
  }
  flush();
  return out;
}

/** Los títulos de la página, en orden y sin repetir: lo que Pilo muestra mientras la lee. */
export function pageHeadings(page: HostPage, max = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of page.blocks) {
    if (!b.h || seen.has(b.t)) continue;
    seen.add(b.t);
    out.push(b.t.slice(0, 80));
    if (out.length >= max) break;
  }
  return out;
}

/** Lo que el turno recuerda de la página: nunca su contenido. */
export interface TurnPage {
  url: string;
  title: string;
  /** Pasajes que tiene la página y cuántos viajaron con esta pregunta. */
  total: number;
  sent: number;
  headings: string[];
  /** La huella de lo leído (pageStamp): con ella se sabe qué pasó con esta lectura en la bandeja. */
  stamp: string;
}

/** Lo que viaja con una pregunta, y lo que el turno recuerda de ello. */
export function pageForQuestion(page: HostPage, question: string): { wire: { url: string; title: string; passages: string[] }; turn: TurnPage } {
  const all = pagePassages(page);
  const passages = pickPassages(all, question, PAGE_PASSAGES, PAGE_PASSAGE_CHARS);
  return {
    wire: { url: page.url, title: page.title, passages },
    turn: { url: page.url, title: page.title, total: all.length, sent: passages.length, headings: pageHeadings(page), stamp: pageStamp(page) },
  };
}

/** Una huella corta del contenido, para no mandar dos veces la misma página en una visita. No es criptográfica. */
export function pageStamp(page: HostPage): string {
  let h = 5381;
  for (const b of page.blocks) for (let i = 0; i < b.t.length; i++) h = ((h << 5) + h + b.t.charCodeAt(i)) | 0;
  return `${page.url}#${(h >>> 0).toString(36)}`;
}

/** Qué pasó con la lectura en la bandeja de la administración; lo dice el servidor. */
export type CaptureStatus = "nueva" | "vista" | "guardada" | "descartada" | "llena" | "no";

export const captureStatus = (raw: unknown): CaptureStatus =>
  raw === "nueva" || raw === "vista" || raw === "guardada" || raw === "descartada" || raw === "llena" ? raw : "no";

/** La línea del recibo. Vacía cuando no hay nada cierto que decir (descartada, bandeja llena, sin 0127). */
export function captureLine(status: CaptureStatus): string {
  if (status === "nueva" || status === "vista") return "Enviada a Planeación para guardarla en mi memoria";
  if (status === "guardada") return "Ya está en mi memoria";
  return "";
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
export function widgetSnippet(origin: string, tema: Tema, lado: Lado, space: SpaceId = "planeacion", read = false): string {
  const pilo = isAskSpace(space) && space !== "planeacion" ? ` data-pilo="${space}"` : "";
  // Leer la página (0127) se pide en la línea: quien administra ese portal lo ve y lo decide.
  const leer = read ? ' data-leer="si"' : "";
  return `<script src="${origin.replace(/\/+$/, "")}/pilo.js"${pilo} data-tema="${tema}" data-esquina="${lado === "izq" ? "izquierda" : "derecha"}"${leer} defer></script>`;
}

/** La ruta del marco de un espacio (la misma que arma public/pilo.js). */
export const embedRoute = (space: SpaceId = "planeacion"): string => (ASK_SPACES[space] ?? ASK_SPACES.planeacion).embedRoute;

/** A dónde lleva una fuente: su página en el portal, o la página de ese Pilo (Pregúntele a Pilo, si no se dice otra) cuando no tiene una. */
export function sourceUrl(path: string | null | undefined, origin: string, fallback = "/pregunta"): string {
  const p = (path ?? "").trim();
  if (/^https?:\/\//i.test(p)) return p;
  return `${origin.replace(/\/+$/, "")}${p.startsWith("/") ? p : fallback}`;
}
