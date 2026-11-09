/* =============================================================================
   Repositorio documental · el tipo de cada documento.

   Un solo lugar decide qué es un documento (PDF, Word, HTML, Quarto, R,
   Markdown, enlace al Repositorio Digital, otro enlace, u otro archivo), cómo se
   rotula y si el portal sabe mostrarlo. El portal, el visor y el panel lo usan.

   El tipo sale de lo que ya se guarda: si es enlace, de su dirección; si es
   archivo, de la extensión y, para un .html, de `flavor` (Quarto o R Markdown).
   ========================================================================== */

import type { DocItem } from "./data";

export type DocFormat = "pdf" | "doc" | "html" | "qmd" | "r" | "md" | "repo" | "link" | "file";

export const REPO_HOST = "repositorio.udes.edu.co";

export const FORMAT_LABEL: Record<DocFormat, string> = {
  pdf: "PDF",
  doc: "Word",
  html: "HTML",
  qmd: "Quarto",
  r: "R",
  md: "Markdown",
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
  repo: "REPO",
  link: "URL",
  file: "FILE",
};

/** Orden en que se ofrecen los filtros por tipo. */
export const FORMAT_ORDER: DocFormat[] = ["pdf", "doc", "html", "qmd", "r", "md", "repo", "link", "file"];

/** Los que el portal abre dentro de su visor. */
const PREVIEWABLE: ReadonlySet<DocFormat> = new Set<DocFormat>(["pdf", "doc", "html", "qmd", "r", "md"]);
export const isPreviewableFormat = (format: DocFormat) => PREVIEWABLE.has(format);

/** Lo que cada tipo explica al elegir la miniatura. */
export const THUMB_NOTE: Record<DocFormat, string> = {
  pdf: "La primera página del PDF.",
  doc: "La primera página del Word, convertida en el navegador.",
  html: "Una captura de la parte superior. Si sale en blanco, se genera una portada.",
  qmd: "Una captura del documento. Si sale en blanco, se genera una portada.",
  r: "Una captura del documento. Si sale en blanco, se genera una portada.",
  md: "Una portada generada con el título.",
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

/** Qué es este documento. */
export function formatOf(item: Pick<DocItem, "kind" | "url" | "path" | "fileName" | "flavor">): DocFormat {
  if (item.kind === "enlace") return hostOf(item.url) === REPO_HOST ? "repo" : "link";
  const extension = extensionOf(item.fileName || item.path || "");
  if (extension === "pdf") return "pdf";
  if (extension === "doc" || extension === "docx") return "doc";
  if (extension === "html" || extension === "htm") {
    return item.flavor === "quarto" ? "qmd" : item.flavor === "rmarkdown" ? "r" : "html";
  }
  if (extension === "md" || extension === "markdown") return "md";
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
