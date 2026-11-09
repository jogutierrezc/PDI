/* =============================================================================
   Panel de Documentos · la miniatura de un documento, hecha en el navegador de
   quien lo publica.

     · PDF            → la primera página, con pdf.js.
     · Word           → la primera página, convertida con docx-preview y dibujada.
     · HTML, Quarto, R → una captura ESTÁTICA de la parte superior: se quitan los
                        scripts y los recursos externos, se dibuja el resto. Un
                        gráfico que se pinta con JavaScript (plotly, htmlwidgets)
                        sale vacío; si la captura sale casi en blanco se descarta
                        y el portal dibuja una portada con el tipo y el título.
     · Imagen subida  → se recorta a 3:4 y se reduce.

   Nada aquí lanza: si algo falla devuelve null y el portal usa su portada.
   El resultado es una imagen WebP (o PNG si el navegador no escribe WebP) de
   360 × 480 píxeles.
   ========================================================================== */

import type { DocFormat } from "../../documentos/tipos";

export const THUMB_W = 360;
export const THUMB_H = 480;

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/webp", 0.82);
    } catch {
      resolve(null);
    }
  });

/** ¿Casi todo el lienzo es blanco o transparente? Entonces la captura no dice nada. */
function isBlank(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d");
  if (!context) return true;
  try {
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    const step = 4 * 7;
    let total = 0;
    for (let i = 0; i < data.length; i += step) {
      total += 1;
      const alpha = data[i + 3];
      if (alpha > 20 && (data[i] < 238 || data[i + 1] < 238 || data[i + 2] < 238)) ink += 1;
    }
    return ink / Math.max(1, total) < 0.015;
  } catch {
    return true;
  }
}

function newCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, THUMB_W, THUMB_H);
  }
  return canvas;
}

/* --- PDF ------------------------------------------------------------------------------- */

async function fromPdf(file: File): Promise<Blob | null> {
  const { openPdfBytes } = await import("../../documentos/visor/pdf");
  const pdf = await openPdfBytes(new Uint8Array(await file.arrayBuffer()));
  try {
    const page = document.createElement("canvas");
    await pdf.render(1, page, THUMB_W);
    const canvas = newCanvas();
    // La página puede ser más alta o más baja que 3:4: se alinea arriba.
    canvas.getContext("2d")?.drawImage(page, 0, 0, THUMB_W, (page.height / page.width) * THUMB_W);
    return await toBlob(canvas);
  } finally {
    await pdf.destroy();
  }
}

/* --- HTML y Word: dibujar un trozo de DOM ------------------------------------------------ */

/** Dibuja un elemento como imagen con un <foreignObject>. Solo sirve para contenido ya sin scripts. */
async function rasterize(node: Element, width: number): Promise<HTMLCanvasElement | null> {
  const height = Math.round((width * THUMB_H) / THUMB_W);
  const xhtml = new XMLSerializer().serializeToString(node);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:#fff;color:#111;font:16px/1.5 system-ui,sans-serif">${xhtml}</div></foreignObject></svg>`;
  const image = new Image();
  image.decoding = "async";
  const loaded = new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  if (!(await loaded)) return null;
  const canvas = newCanvas();
  canvas.getContext("2d")?.drawImage(image, 0, 0, THUMB_W, THUMB_H);
  return canvas;
}

/** El HTML sin scripts, enlaces, recursos de red ni manejadores: solo lo que se puede dibujar sin ejecutar nada. */
function inertBody(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, link, meta, base, iframe, object, embed, noscript").forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attribute of [...el.attributes]) {
      if (/^on/i.test(attribute.name)) el.removeAttribute(attribute.name);
    }
    if (el instanceof HTMLImageElement && !/^data:/i.test(el.getAttribute("src") ?? "")) el.removeAttribute("src");
  });
  const wrapper = doc.createElement("div");
  doc.head.querySelectorAll("style").forEach((style) => wrapper.append(style.cloneNode(true)));
  wrapper.append(...Array.from(doc.body.childNodes).map((child) => child.cloneNode(true)));
  return wrapper;
}

async function fromHtml(file: File): Promise<Blob | null> {
  const body = inertBody(await file.text());
  const canvas = await rasterize(body, 900);
  if (!canvas || isBlank(canvas)) return null;
  return toBlob(canvas);
}

async function fromDocx(file: File): Promise<Blob | null> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-12000px;top:0;width:820px;pointer-events:none";
  document.body.append(host);
  try {
    const { renderAsync } = await import("docx-preview");
    await renderAsync(await file.arrayBuffer(), host, undefined, { className: "dv-docx", inWrapper: false, breakPages: true });
    const first = host.querySelector("section.dv-docx") ?? host;
    const clone = first.cloneNode(true) as HTMLElement;
    // Los estilos de docx-preview viven en el contenedor: se llevan junto con la página.
    const wrapper = document.createElement("div");
    host.querySelectorAll("style").forEach((style) => wrapper.append(style.cloneNode(true)));
    clone.style.cssText += ";box-shadow:none;margin:0;width:100%;min-height:0";
    wrapper.append(clone);
    const canvas = await rasterize(inertBody(wrapper.innerHTML), 820);
    if (!canvas || isBlank(canvas)) return null;
    return toBlob(canvas);
  } finally {
    host.remove();
  }
}

/* --- Imagen subida ----------------------------------------------------------------------- */

export async function thumbFromImage(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = newCanvas();
    const context = canvas.getContext("2d");
    if (!context) return null;
    // Se cubre el 3:4 y se alinea arriba: en una portada, lo importante está arriba.
    const scale = Math.max(THUMB_W / bitmap.width, THUMB_H / bitmap.height);
    context.drawImage(bitmap, (THUMB_W - bitmap.width * scale) / 2, 0, bitmap.width * scale, bitmap.height * scale);
    bitmap.close();
    return await toBlob(canvas);
  } catch {
    return null;
  }
}

/** La miniatura automática de un archivo; null si no se pudo (el portal dibuja una portada). */
export async function autoThumbnail(file: File, format: DocFormat): Promise<Blob | null> {
  try {
    if (format === "pdf") return await fromPdf(file);
    if (format === "doc") return await fromDocx(file);
    if (format === "html" || format === "qmd" || format === "r") return await fromHtml(file);
    return null;
  } catch {
    return null;
  }
}
