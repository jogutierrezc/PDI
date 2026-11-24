/* =============================================================================
   Pilo at Work · HTML de correos y reuniones, saneado con lista blanca.

   El HTML de un correo o de una invitación es contenido de terceros: aquí NUNCA se inyecta
   crudo. Se analiza con DOMParser (documento inerte: no ejecuta scripts ni carga imágenes),
   se recorre y se reconstruye solo con etiquetas y atributos permitidos. Sin estilos en
   línea (evitan rastreadores y trampas visuales), enlaces solo http/https/mailto en pestaña
   nueva con rel="noopener noreferrer", imágenes remotas bloqueadas salvo que la persona lo pida.
   ========================================================================== */

const TAGS = new Set(["a", "b", "strong", "i", "em", "u", "s", "p", "br", "div", "span", "ul", "ol", "li", "blockquote", "pre", "code", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "img", "hr", "sub", "sup", "font", "center"]);
/** Estas se descartan con todo lo que llevan dentro. */
const FUERA = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "svg", "math", "link", "meta", "base", "noscript", "template", "head", "title", "audio", "video", "source", "canvas", "applet"]);

export interface Saneado {
  html: string;
  /** Cuántas imágenes remotas se bloquearon. */
  bloqueadas: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sanearHtml(entrada: string, opciones: { imagenes?: boolean } = {}): Saneado {
  const doc = new DOMParser().parseFromString(entrada, "text/html");
  let bloqueadas = 0;
  const num = (v: string | null) => (v && /^\d{1,4}$/.test(v) ? v : "");

  const visitar = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent ?? "");
    if (n.nodeType !== Node.ELEMENT_NODE) return "";
    const el = n as Element;
    const t = el.tagName.toLowerCase();
    if (FUERA.has(t)) return "";
    const hijos = Array.from(el.childNodes).map(visitar).join("");
    if (!TAGS.has(t)) return hijos; // etiqueta desconocida: se queda el texto, no la etiqueta
    if (t === "br" || t === "hr") return `<${t}>`;
    if (t === "a") {
      const href = (el.getAttribute("href") ?? "").trim();
      if (!/^(https?:|mailto:)/i.test(href)) return hijos;
      return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${hijos}</a>`;
    }
    if (t === "img") {
      const src = (el.getAttribute("src") ?? "").trim();
      const datos = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(src);
      if (datos || (opciones.imagenes && /^https:\/\//i.test(src))) {
        const w = num(el.getAttribute("width"));
        const h = num(el.getAttribute("height"));
        return `<img src="${esc(src)}" alt="${esc(el.getAttribute("alt") ?? "")}"${w ? ` width="${w}"` : ""}${h ? ` height="${h}"` : ""} loading="lazy" referrerpolicy="no-referrer">`;
      }
      if (/^(https?:)?\/\//i.test(src)) bloqueadas++;
      return "";
    }
    if (t === "td" || t === "th") {
      const cs = num(el.getAttribute("colspan"));
      const rs = num(el.getAttribute("rowspan"));
      return `<${t}${cs ? ` colspan="${cs}"` : ""}${rs ? ` rowspan="${rs}"` : ""}>${hijos}</${t}>`;
    }
    return `<${t}>${hijos}</${t}>`;
  };

  return { html: Array.from(doc.body.childNodes).map(visitar).join(""), bloqueadas };
}
