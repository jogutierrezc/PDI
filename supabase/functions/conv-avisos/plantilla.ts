/* =============================================================================
   Gestión de convenios · armar el correo de una plantilla (migración 0256).
   PURO: sin red ni imports, para que lo usen igual la función conv-avisos (Deno) y la
   vista previa del navegador (Gestión › Avisos › Plantillas de correo).

   La plantilla guarda un cuerpo HTML con una lista corta de etiquetas. Antes de usarlo se
   SANEA (solo esas etiquetas, enlaces https o mailto) y después se sustituyen las variables
   {{x}} con el valor ESCAPADO. El HTML final va con estilos en línea y tablas (lo que leen
   Outlook y Gmail). Los colores son los de la marca (tokens.css) en hexadecimal, porque un
   correo no puede leer variables CSS.
   ========================================================================== */

export type Idioma = "es" | "en";

export const VARIABLES_AVISO = ["institucion", "pais", "codigo", "fecha_termino", "dias", "tipo", "enlace_renovacion"] as const;
export const VARIABLES_FIRMA = ["enlace_firma", "vence", "nombre_firmante", "institucion", "codigo_certificado", "codigo_verificacion"] as const;

/** Claves de plantilla que la pantalla reconoce, con el conjunto de variables que ofrece cada una. */
export const CLAVES_FIRMA = ["firma_solicitud", "firma_certificado"] as const;

export type Variables = Record<string, string>;

const MESES: Record<Idioma, string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** «2026-10-30» → «30 de octubre de 2026» / «October 30, 2026». */
export function fechaLegible(f: string | null | undefined, idioma: Idioma): string {
  if (!f) return "";
  const [a, m, d] = f.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return f;
  return idioma === "es" ? `${d} de ${MESES.es[m - 1]} de ${a}` : `${MESES.en[m - 1]} ${d}, ${a}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const desesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

const ETIQUETAS = new Set(["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h3", "a"]);
const HREF_OK = /^(https:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|\{\{\s*[a-z_]+\s*\}\})$/i;

/** Deja solo las etiquetas permitidas, sin atributos salvo href (https, mailto o variable) y class="boton" en <a>. */
export function sanearCorreo(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*\/?>/g, (tag: string, nombre: string, attrs: string) => {
      const n = nombre.toLowerCase();
      if (!ETIQUETAS.has(n)) return "";
      if (tag.startsWith("</")) return `</${n}>`;
      if (n === "br") return "<br>";
      if (n !== "a") return `<${n}>`;
      const href = /href\s*=\s*"([^"]*)"/i.exec(attrs) ?? /href\s*=\s*'([^']*)'/i.exec(attrs);
      const valor = href ? desesc(href[1]).trim() : "";
      const boton = /class\s*=\s*["']?[^"'>]*\bboton\b/i.test(attrs);
      if (!HREF_OK.test(valor)) return "<a>";
      return `<a href="${esc(valor)}"${boton ? ' class="boton"' : ""}>`;
    })
    .replace(/<(?![/a-zA-Z])/g, "&lt;");
}

/** Sustituye {{variable}} por su valor (ya ESCAPADO por quien llama si va a HTML); lo desconocido queda tal cual. */
export function sustituir(texto: string, v: Variables, comoHtml: boolean): string {
  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => (k in v ? (comoHtml ? esc(v[k]) : v[k]) : m));
}

export const asuntoDe = (asunto: string, v: Variables): string => sustituir(asunto, v, false).replace(/\s+/g, " ").trim().slice(0, 250);

const COLOR = { navy: "#0a2d63", azul: "#1b52ad", ink: "#0d1c31", sec: "#45566d", linea: "#d6dde8" };

const PIE: Record<Idioma, string> = {
  es: "Universidad de Santander · Oficina de Relaciones Internacionales. Este mensaje es un aviso automático del módulo de Convenios.",
  en: "Universidad de Santander · International Relations Office. This message is an automatic notice from the Agreements module.",
};

export interface OpcionesCorreo {
  idioma: Idioma;
  /** Dirección pública del logo (PNG blanco, que sí se ve en Gmail y Outlook). */
  logo: string;
  /** Marca de prueba que se antepone al asunto y se muestra arriba del cuerpo. */
  prueba?: boolean;
}

/** El correo completo: plantilla base institucional con el logo de la UDES y el cuerpo ya con sus variables. */
export function htmlDe(cuerpo: string, v: Variables, o: OpcionesCorreo): string {
  const limpio = sustituir(sanearCorreo(cuerpo), v, true)
    .replace(/<p>/g, `<p style="margin:0 0 14px;font:15px/1.6 Arial,Helvetica,sans-serif;color:${COLOR.ink}">`)
    .replace(/<h3>/g, `<h3 style="margin:0 0 10px;font:bold 17px Arial,Helvetica,sans-serif;color:${COLOR.navy}">`)
    .replace(/<ul>/g, `<ul style="margin:0 0 14px;padding-left:22px;font:15px/1.6 Arial,Helvetica,sans-serif;color:${COLOR.ink}">`)
    .replace(/<ol>/g, `<ol style="margin:0 0 14px;padding-left:22px;font:15px/1.6 Arial,Helvetica,sans-serif;color:${COLOR.ink}">`)
    .replace(/<a href="([^"]*)" class="boton">/g, `<a href="$1" style="display:inline-block;padding:12px 24px;background:${COLOR.azul};font:bold 15px Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none">`)
    .replace(/<a href="([^"]*)">/g, `<a href="$1" style="color:${COLOR.azul}">`);
  const aviso = o.prueba
    ? `<tr><td style="padding:8px 24px;background:#fbefd9;font:bold 12px Arial,Helvetica,sans-serif;color:#5c3604">${o.idioma === "es" ? "Mensaje de prueba" : "Test message"}</td></tr>`
    : "";
  return `<!doctype html><html lang="${o.idioma}"><body style="margin:0;background:#f4f7fb"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid ${COLOR.linea}">
<tr><td style="background:${COLOR.navy};padding:16px 24px"><img src="${esc(o.logo)}" alt="Universidad de Santander" height="34" style="display:block;height:34px;border:0"></td></tr>
${aviso}<tr><td style="padding:26px 24px 8px">${limpio}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid ${COLOR.linea};font:12px/1.5 Arial,Helvetica,sans-serif;color:${COLOR.sec}">${PIE[o.idioma]}</td></tr>
</table></td></tr></table></body></html>`;
}

/** La versión en texto plano, derivada del mismo cuerpo. */
export function textoDe(cuerpo: string, v: Variables, o: OpcionesCorreo): string {
  const t = sanearCorreo(cuerpo)
    .replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_m, h: string, x: string) => `${x} (${desesc(h)})`)
    .replace(/<\/(p|h3|ul|ol)>/g, "\n\n")
    .replace(/<br>/g, "\n")
    .replace(/<li>/g, "- ")
    .replace(/<\/li>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return `${o.prueba ? (o.idioma === "es" ? "[Mensaje de prueba]\n\n" : "[Test message]\n\n") : ""}${sustituir(desesc(t), v, false).replace(/\n{3,}/g, "\n\n").trim()}\n\n--\n${PIE[o.idioma]}`;
}

/** Forma de correo. */
export const formatoCorreo = (c: string): boolean => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(c) && c.length <= 254;
