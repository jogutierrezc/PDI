/* =============================================================================
   Exportar una gráfica como imagen (PNG o JPG), tal como se ve.

   Se fotografía el panel entero de la gráfica con html-to-image: título, cuerpo
   y fuente, con los estilos y el tema de la página. Lo que solo sirve en
   pantalla (conmutadores, botones de descarga, tablas desplegables) lleva
   data-export-ignore y no sale en la imagen. Mientras dura la captura el panel
   lleva data-exporting, que muestra el sello de procedencia, abre los marcos
   desplazables y detiene las animaciones.

   Dos arreglos para que la imagen sea fiel:
   · Las gráficas SVG pintan con variables CSS (fill: var(--od-series-1)). Al
     rasterizar, esas reglas se pierden y salen negras o vacías; antes de la
     captura se escriben los colores y trazos ya resueltos en cada elemento, y
     después se devuelven como estaban.
   · Las fuentes vienen de Google Fonts, cuya hoja no se puede leer desde la
     página. Se descarga una vez y se incrusta, solo latín y latín extendido.
   ========================================================================== */

import { toJpeg, toPng } from "html-to-image";
import { slugify } from "../data/slug";

export type ImageFormat = "png" | "jpg";

// El nombre del archivo sale del mismo sitio que el de los CSV.
export { slugify };

/** Color de fondo real del panel: un JPG no tiene transparencia. */
function backgroundOf(node: HTMLElement): string {
  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return "#ffffff";
}

/* --- SVG: estilos resueltos ---------------------------------------------------------- */

const PAINT = ["fill", "stroke"] as const;
const PLAIN = [
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "visibility",
] as const;

/** rgba(r, g, b, a) → color sólido y opacidad aparte, que el SVG rasterizado respeta. */
function splitColor(value: string): { color: string; alpha: number | null } {
  const match = value.match(/^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)$/);
  if (!match) return { color: value, alpha: null };
  return { color: `rgb(${match[1]}, ${match[2]}, ${match[3]})`, alpha: Number(match[4]) };
}

/** Escribe en cada elemento SVG sus estilos calculados. Devuelve cómo deshacerlo. */
function inlineSvgStyles(root: HTMLElement): () => void {
  const restores: (() => void)[] = [];
  root.querySelectorAll<SVGElement>("svg, svg *").forEach((el) => {
    if (el instanceof SVGDefsElement || el.closest("defs, pattern, linearGradient, radialGradient, clipPath, mask")) return;
    const computed = getComputedStyle(el);
    const previous = el.getAttribute("style");
    const declarations: string[] = [];
    for (const property of PAINT) {
      const value = computed.getPropertyValue(property);
      if (!value) continue;
      // Los rellenos con patrón o gradiente (url(#…)) se dejan como están.
      if (value.startsWith("url(")) {
        declarations.push(`${property}: ${value}`);
        continue;
      }
      const { color, alpha } = splitColor(value);
      declarations.push(`${property}: ${alpha === 0 ? "none" : color}`);
      if (alpha !== null && alpha > 0) declarations.push(`${property}-opacity: ${alpha * Number(computed.getPropertyValue(`${property}-opacity`) || 1)}`);
      else if (alpha === null) {
        const own = computed.getPropertyValue(`${property}-opacity`);
        if (own) declarations.push(`${property}-opacity: ${own}`);
      }
    }
    for (const property of PLAIN) {
      const value = computed.getPropertyValue(property);
      if (value) declarations.push(`${property}: ${value}`);
    }
    el.setAttribute("style", `${previous ? `${previous}; ` : ""}${declarations.join("; ")}`);
    restores.push(() => (previous === null ? el.removeAttribute("style") : el.setAttribute("style", previous)));
  });
  return () => restores.forEach((restore) => restore());
}

/* --- Fuentes incrustadas ------------------------------------------------------------- */

let fontCss: Promise<string | null> | null = null;

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

function embeddedFonts(): Promise<string | null> {
  fontCss ??= (async () => {
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]'));
    if (!links.length) return null;
    const blocks: string[] = [];
    for (const link of links) {
      const css = await (await fetch(link.href)).text();
      // Cada @font-face va precedido de su subconjunto: /* latin */, /* cyrillic */…
      for (const match of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g)) {
        if (match[1] !== "latin" && match[1] !== "latin-ext") continue;
        let face = match[2];
        for (const url of face.match(/https:[^)'"]+/g) ?? []) {
          face = face.replace(url, await toDataUrl(await (await fetch(url)).blob()));
        }
        blocks.push(face);
      }
    }
    return blocks.join("\n");
  })().catch(() => null);
  return fontCss;
}

/* --- Exportar ---------------------------------------------------------------------- */

export async function exportChart(node: HTMLElement, name: string, format: ImageFormat): Promise<void> {
  node.dataset.exporting = "";
  let restore = () => {};
  try {
    await document.fonts?.ready;
    const fontEmbedCSS = await embeddedFonts();
    // Dos cuadros: que el sello, los marcos abiertos y el fin de las animaciones se pinten.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    restore = inlineSvgStyles(node);
    const options = {
      pixelRatio: Math.max(2, window.devicePixelRatio || 1),
      backgroundColor: backgroundOf(node),
      cacheBust: true,
      width: node.scrollWidth,
      ...(fontEmbedCSS ? { fontEmbedCSS } : { skipFonts: true }),
      filter: (el: Node) => !(el instanceof HTMLElement && el.dataset.exportIgnore !== undefined),
    };
    const url = format === "png" ? await toPng(node, options) : await toJpeg(node, { ...options, quality: 0.95 });
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(name)}.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    restore();
    delete node.dataset.exporting;
  }
}
