/* =============================================================================
   Relaciones · armar el correo de una plantilla. PURO: sin red ni imports (lo usan
   igual la función rel-correos, en Deno, y la vista previa del navegador).

   Texto plano -> HTML con estilos en línea y tablas (lo que leen Outlook y Gmail), más
   la versión en texto plano. Los colores van en hexadecimal porque un correo no
   puede leer las variables CSS de la intranet: son los de la marca (tokens.css):
   brand-navy, brand-blue-strong, ink, ink-secondary, line y brand-blue-soft.
   ========================================================================== */

export const VARIABLES = ["nombre", "cargo", "institucion", "pais", "actividad"] as const;

export interface Actividad {
  nom: string;
  fec: string;
  hor: string;
  lug: string;
  btn: string;
  lim: string;
}

export interface PlantillaCorreo {
  asunto: string;
  cuerpo: string;
  usa_actividad: boolean;
  actividad: Partial<Actividad>;
}

export interface Destinatario {
  nombre: string;
  cargo: string;
  institucion: string;
  pais: string;
}

export const ACTIVIDAD_VACIA: Actividad = { nom: "", fec: "", hor: "", lug: "", btn: "", lim: "" };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** {{variable}} por su valor; una variable que no existe se deja tal cual para que se note. */
export function sustituir(texto: string, d: Destinatario, a: Partial<Actividad>): string {
  const v: Record<string, string> = { nombre: d.nombre, cargo: d.cargo, institucion: d.institucion, pais: d.pais, actividad: a.nom || "la actividad" };
  return texto.replace(/\{\{(\w+)\}\}/g, (m, k: string) => v[k] ?? m);
}

export function fechaLarga(f: string): string {
  if (!f) return "";
  const d = new Date(`${f}T12:00:00`);
  return Number.isNaN(d.getTime()) ? f : d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export const asuntoDe = (p: PlantillaCorreo, d: Destinatario) => sustituir(p.asunto, d, p.actividad).replace(/\s+/g, " ").trim();

export interface OpcionesArmado {
  /** Enlace de «Dejar de recibir mensajes». */
  urlBaja: string;
  /** Correo al que responde el botón de la actividad (mailto). */
  responderA: string;
}

export function htmlDe(p: PlantillaCorreo, d: Destinatario, o: OpcionesArmado): string {
  const a = p.actividad;
  const parrafos = sustituir(p.cuerpo, d, a)
    .split(/\n{2,}/)
    .filter((x) => x.trim())
    .map((x) => `<p style="margin:0 0 14px;font:15px/1.6 Arial,Helvetica,sans-serif;color:#0d1c31">${esc(x).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const mailto = `mailto:${encodeURIComponent(o.responderA).replace(/%40/g, "@")}?subject=${encodeURIComponent(`Confirmo: ${a.nom ?? ""}`)}`;
  const tarjeta = p.usa_actividad
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border:1px solid #cfdcf3;background:#eaf1fd"><tr><td style="padding:14px 16px;font:14px/1.6 Arial,Helvetica,sans-serif;color:#0d1c31">
<div style="font:bold 18px Arial,Helvetica,sans-serif;margin:0 0 8px;color:#0a2d63">${esc(a.nom ?? "")}</div>
<div><b>Fecha:</b> ${esc(fechaLarga(a.fec ?? ""))}${a.hor ? ` · ${esc(a.hor)}` : ""}</div><div><b>Lugar:</b> ${esc(a.lug ?? "")}</div>
${a.lim ? `<div style="color:#45566d;margin-top:6px">Le pedimos responder antes del ${esc(fechaLarga(a.lim))}.</div>` : ""}</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="background:#1b52ad"><a href="${esc(mailto)}" style="display:inline-block;padding:12px 24px;font:bold 15px Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none">${esc(a.btn || "Responder")}</a></td></tr></table>`
    : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f7fb"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #d6dde8">
<tr><td style="background:#0a2d63;padding:16px 24px;font:bold 15px Arial,Helvetica,sans-serif;color:#ffffff">Universidad de Santander <span style="font-weight:normal">· Relaciones Internacionales</span></td></tr>
<tr><td style="padding:26px 24px 8px">${parrafos}${tarjeta}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #d6dde8;font:12px/1.5 Arial,Helvetica,sans-serif;color:#45566d">Recibe este mensaje porque figura en el directorio de aliados de la UDES. <a href="${esc(o.urlBaja)}" style="color:#1b52ad">Dejar de recibir mensajes</a></td></tr>
</table></td></tr></table></body></html>`;
}

export function textoDe(p: PlantillaCorreo, d: Destinatario, o: OpcionesArmado): string {
  const a = p.actividad;
  const bloque = p.usa_actividad
    ? `\n\n${a.nom ?? ""}\n${fechaLarga(a.fec ?? "")}${a.hor ? ` ${a.hor}` : ""}\n${a.lug ?? ""}${a.lim ? `\nResponder antes del ${fechaLarga(a.lim)}.` : ""}\n${a.btn || "Responder"}: responda este mensaje.`
    : "";
  return `${sustituir(p.cuerpo, d, a)}${bloque}\n\n--\nPara dejar de recibir mensajes: ${o.urlBaja}`;
}

/** Forma de correo (nivel 1 de la validación). */
export const formatoCorreo = (c: string): boolean => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(c) && c.length <= 254;
