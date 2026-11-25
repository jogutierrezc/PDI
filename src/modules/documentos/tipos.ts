/* =============================================================================
   Repositorio documental · el tipo de cada documento.

   Un solo lugar decide qué es un documento (PDF, Word, HTML, Quarto, R,
   Markdown, enlace al Repositorio Digital, otro enlace, u otro archivo), cómo se
   rotula y si el portal sabe mostrarlo. El portal, el visor y el panel lo usan.

   El tipo sale de lo que ya se guarda: si es enlace, de su dirección; si es
   archivo, de la extensión y, para un .html, de `flavor` (Quarto o R Markdown).
   ========================================================================== */

import type { DocItem } from "./data";

export type DocFormat = "pdf" | "doc" | "html" | "qmd" | "r" | "md" | "video" | "portal" | "repo" | "link" | "file";

export const REPO_HOST = "repositorio.udes.edu.co";

export const FORMAT_LABEL: Record<DocFormat, string> = {
  pdf: "PDF",
  doc: "Word",
  html: "HTML",
  qmd: "Quarto",
  r: "R",
  md: "Markdown",
  video: "Video",
  portal: "Microportal",
  repo: "Repositorio",
  link: "Enlace",
  file: "Archivo",
};

/** Siglas para la miniatura generada. */
export const FORMAT_ABBR: Record<DocFormat, string> = {
  pdf: "PDF",
  doc: "DOC",
  html: "HTML",
  qmd: "QMD",
  r: "R",
  md: "MD",
  video: "VID",
  portal: "WEB",
  repo: "REPO",
  link: "URL",
  file: "FILE",
};

/** Orden en que se ofrecen los filtros por tipo. */
export const FORMAT_ORDER: DocFormat[] = ["pdf", "doc", "html", "qmd", "r", "md", "video", "portal", "repo", "link", "file"];

/** Los que el portal abre dentro de su visor. */
const PREVIEWABLE: ReadonlySet<DocFormat> = new Set<DocFormat>(["pdf", "doc", "html", "qmd", "r", "md", "video", "portal"]);
export const isPreviewableFormat = (format: DocFormat) => PREVIEWABLE.has(format);

/** Lo que cada tipo explica al elegir la miniatura. */
export const THUMB_NOTE: Record<DocFormat, string> = {
  pdf: "La primera página del PDF.",
  doc: "La primera página del Word, convertida en el navegador.",
  html: "Una captura de la parte superior. Si sale en blanco, se genera una portada.",
  qmd: "Una captura del documento. Si sale en blanco, se genera una portada.",
  r: "Una captura del documento. Si sale en blanco, se genera una portada.",
  md: "Una portada generada con el título.",
  video: "Un fotograma del video si subes el archivo; si es un enlace, una portada generada con el título (o la imagen que subas).",
  portal: "Una captura de la página de entrada. Si sale en blanco, se genera una portada.",
  repo: "Una portada generada con el título.",
  link: "Una portada generada con el título y el sitio.",
  file: "Una portada generada con el título.",
};

const extensionOf = (name: string): string => {
  const clean = name.split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  return dot < 0 ? "" : clean.slice(dot + 1).toLowerCase();
};

export function hostOf(url: string | null | undefined): string {
  try {
    return new URL(url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Videos que el navegador reproduce sin ayuda. */
export const VIDEO_EXTENSIONS = ["mp4", "webm"];

/**
 * La dirección con la que se incrusta un video de YouTube, Vimeo o Google Drive;
 * null si el enlace es de otro sitio (entonces es un enlace común).
 * YouTube va por youtube-nocookie.com: no deja cookies de seguimiento al abrir la página.
 */
export function videoEmbedUrl(url: string | null | undefined): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url ?? "");
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.replace(/^(www|m)\./, "");
  const parts = parsed.pathname.split("/").filter(Boolean);
  const idOk = (value: string | undefined) => (value && /^[\w-]{6,}$/.test(value) ? value : null);

  if (host === "youtu.be") {
    const id = idOk(parts[0]);
    return id ? youtubeEmbed(id, parsed) : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id =
      parts[0] === "watch" ? idOk(parsed.searchParams.get("v") ?? undefined) : ["embed", "shorts", "live", "v"].includes(parts[0]) ? idOk(parts[1]) : null;
    return id ? youtubeEmbed(id, parsed) : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parts.find((part) => /^\d{5,}$/.test(part));
    if (!id) return null;
    // Los videos privados de Vimeo llevan una clave (?h=…, o /<id>/<clave>).
    const hash = parsed.searchParams.get("h") ?? parts[parts.indexOf(id) + 1];
    return `https://player.vimeo.com/video/${id}${hash && /^[a-f0-9]{6,}$/i.test(hash) ? `?h=${hash}` : ""}`;
  }
  if (host === "drive.google.com") {
    // /file/d/<id>/view · /file/u/0/d/<id>/view · open?id=<id> · uc?id=<id>
    const at = parts.indexOf("d");
    const id = at >= 0 ? idOk(parts[at + 1]) : idOk(parsed.searchParams.get("id") ?? undefined);
    return id && (at >= 0 || parts[0] === "open" || parts[0] === "uc") ? `https://drive.google.com/file/d/${id}/preview` : null;
  }
  return null;
}

function youtubeEmbed(id: string, from: URL): string {
  const start = /^(\d+)/.exec(from.searchParams.get("t") ?? from.searchParams.get("start") ?? "")?.[1];
  return `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`;
}

/** Qué es este documento. */
export function formatOf(item: Pick<DocItem, "kind" | "url" | "path" | "fileName" | "flavor"> & { siteDir?: string | null }): DocFormat {
  if (item.kind === "enlace") {
    if (hostOf(item.url) === REPO_HOST) return "repo";
    return videoEmbedUrl(item.url) ? "video" : "link";
  }
  if (item.siteDir) return "portal";
  const extension = extensionOf(item.fileName || item.path || "");
  if (extension === "pdf") return "pdf";
  if (extension === "doc" || extension === "docx") return "doc";
  if (extension === "html" || extension === "htm") {
    return item.flavor === "quarto" ? "qmd" : item.flavor === "rmarkdown" ? "r" : "html";
  }
  if (extension === "md" || extension === "markdown") return "md";
  if (VIDEO_EXTENSIONS.includes(extension)) return "video";
  return "file";
}

/** El resumen que se ve en el índice: el escrito a mano o, si falta, el comienzo de la descripción. */
export function shortDescription(item: Pick<DocItem, "summary" | "description">, max = 190): string {
  const summary = item.summary.trim();
  if (summary) return summary;
  const text = item.description.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

/** ¿Hay más que decir que el resumen? Entonces se ofrece «Leer más». */
export const hasMore = (item: Pick<DocItem, "summary" | "description">): boolean => {
  const description = item.description.replace(/\s+/g, " ").trim();
  return Boolean(description) && description !== shortDescription(item);
};

/** La dirección de la página que muestra un documento. */
export const viewerPath = (itemId: string) => `/documentos/ver/${itemId}`;
