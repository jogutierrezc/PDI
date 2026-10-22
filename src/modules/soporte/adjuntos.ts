/* =============================================================================
   Portal de agentes · adjuntos permitidos (0181).

   Hasta 10 MB y solo imágenes, PDF, Word y Excel. El servidor lo comprueba otra
   vez con el tipo real del archivo (support_attachment_ok); esto evita subir lo
   que se va a rechazar.
   ========================================================================== */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 5;

/** extensión → tipo MIME. */
export const ATTACHMENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).map((e) => `.${e}`).join(",");

const extensionOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";

/** El tipo MIME que se sube: el del navegador si es de los permitidos; si no, el que dice la extensión. */
export function mimeFor(file: { name: string; type: string }): string {
  const allowed = Object.values(ATTACHMENT_TYPES);
  return allowed.includes(file.type) ? file.type : (ATTACHMENT_TYPES[extensionOf(file.name)] ?? "");
}

/** Qué le falta a un archivo para poder adjuntarse, o "" si sirve. */
export function attachmentProblem(file: { name: string; type: string; size: number }): string {
  if (!file.size) return "El archivo está vacío.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "El archivo pesa más de 10 MB.";
  if (!mimeFor(file)) return "Solo se admiten imágenes, PDF, Word y Excel.";
  return "";
}

/** Un nombre seguro para guardar en el bucket. */
export function safeFileName(name: string): string {
  const ext = extensionOf(name);
  const known = ext in ATTACHMENT_TYPES;
  const stem = known ? name.slice(0, -(ext.length + 1)) : name;
  const base = stem
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return `${base || "archivo"}${known ? `.${ext}` : ""}`;
}
