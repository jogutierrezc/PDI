/* =============================================================================
   Gestión de convenios · lógica sin base de datos (la usan las pantallas):
     · la cola de avisos (qué regla toca a cada convenio, qué se envió ya);
     · la biblioteca de campos de los modelos y sus valores desde la ficha del convenio;
     · marcadores {{campo}}, [campo] y <<campo>>: detectarlos y normalizarlos;
     · el saneado del HTML del editor y el documento final (HTML) con sus logos;
     · la huella SHA-256 del archivo generado.
   El editor guarda HTML con una lista corta de etiquetas; nada de lo que escriba la
   persona (ni lo que venga de un Word) se inserta en la página sin pasar por aquí.
   ========================================================================== */

import { diasFaltantes, etapaDe } from "../convenios/logica";
import type { Convenio } from "../convenios/logica";
import { fechaLegible } from "../../../../supabase/functions/conv-avisos/plantilla";
import type { Idioma } from "../../../../supabase/functions/conv-avisos/plantilla";
import type { EnvioAviso, ReglaAviso } from "./datos";

export const VENTANA_RECUPERACION = 7;

/* ---------- Cola de avisos --------------------------------------------------------- */

export interface FilaCola {
  convenio: Convenio;
  faltan: number;
  /** El último aviso que salió (días de su regla), si hubo. */
  ultimo: { dias: number | null; cuando: string; estado: EnvioAviso["estado"] } | null;
  /** La regla que sigue (o que toca hoy) y la fecha en que corresponde. */
  proxima: { regla: ReglaAviso; fecha: string; hoyToca: boolean } | null;
}

const sumarDias = (f: string, n: number) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)) + n)).toISOString().slice(0, 10);

/** Convenios firmados que terminan pronto, con su último aviso y la regla que sigue. */
export function colaDe(convenios: readonly Convenio[], reglas: readonly ReglaAviso[], envios: readonly EnvioAviso[], hoy: string, horizonte = 200): FilaCola[] {
  const activas = reglas.filter((r) => r.activa).sort((a, b) => b.dias - a.dias);
  const porConvenio = new Map<string, EnvioAviso[]>();
  for (const e of envios) porConvenio.set(e.convenio_id, [...(porConvenio.get(e.convenio_id) ?? []), e]);
  const filas: FilaCola[] = [];
  for (const c of convenios) {
    if (etapaDe(c) !== "Firmado" || c.indefinido || !c.fecha_terminacion) continue;
    const faltan = diasFaltantes(c, hoy);
    if (faltan == null || faltan < 0 || faltan > horizonte) continue;
    const mios = porConvenio.get(c.id) ?? [];
    const enviado = mios.filter((e) => e.estado === "enviado" || e.estado === "sin_contacto").sort((a, b) => b.created_at.localeCompare(a.created_at));
    const yaSalio = (r: ReglaAviso) => enviado.some((e) => e.regla_dias === r.dias && e.fecha_vencimiento === c.fecha_terminacion);
    const toca = activas.filter((r) => faltan <= r.dias && r.dias - faltan <= VENTANA_RECUPERACION && !yaSalio(r)).sort((a, b) => a.dias - b.dias)[0];
    const siguiente = toca ?? activas.filter((r) => r.dias < faltan).sort((a, b) => b.dias - a.dias)[0];
    const ult = enviado[0];
    filas.push({
      convenio: c,
      faltan,
      ultimo: ult ? { dias: ult.regla_dias, cuando: ult.created_at, estado: ult.estado } : null,
      proxima: siguiente ? { regla: siguiente, fecha: toca ? hoy : sumarDias(c.fecha_terminacion, -siguiente.dias), hoyToca: Boolean(toca) } : null,
    });
  }
  return filas.sort((a, b) => a.faltan - b.faltan);
}

export const textoRegla = (dias: number): string => (dias > 0 ? `${dias} días antes` : dias === 0 ? "el día del vencimiento" : `${-dias} días después`);
export const corto = (dias: number | null): string => (dias == null ? "manual" : dias > 0 ? `${dias} días` : dias === 0 ? "vencimiento" : `+${-dias} días`);

/* ---------- Campos de los modelos ---------------------------------------------------- */

export interface CampoDef {
  k: string;
  etiqueta: string;
  origen: "ficha" | "manual" | "sistema" | "imagen";
  ayuda: string;
  ejemplo: string;
}

export const CAMPOS: readonly CampoDef[] = [
  { k: "institucion", etiqueta: "Institución", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "Universidad de Barcelona - UB" },
  { k: "pais", etiqueta: "País", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "España" },
  { k: "codigo", etiqueta: "Código del convenio", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "CI-01-123" },
  { k: "documento", etiqueta: "Clase de documento", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "Convenio" },
  { k: "tipo", etiqueta: "Tipo (marco o específico)", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "Marco" },
  { k: "objeto", etiqueta: "Objeto", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "el intercambio de estudiantes de práctica clínica" },
  { k: "modalidad", etiqueta: "Modalidad", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "Cooperación Académica" },
  { k: "campus", etiqueta: "Campus", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "Bucaramanga" },
  { k: "facultad", etiqueta: "Facultad", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "Facultad de Ciencias de la Salud" },
  { k: "programas", etiqueta: "Programas", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "Medicina" },
  { k: "fecha_firma", etiqueta: "Fecha de firma", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "12 de marzo de 2026" },
  { k: "fecha_terminacion", etiqueta: "Fecha de terminación", origen: "ficha", ayuda: "Ficha del convenio", ejemplo: "12 de marzo de 2031" },
  { k: "vigencia", etiqueta: "Vigencia", origen: "ficha", ayuda: "Calculada con las fechas", ejemplo: "5 años" },
  { k: "fecha_documento", etiqueta: "Fecha del documento", origen: "sistema", ayuda: "La de hoy", ejemplo: "30 de octubre de 2026" },
  { k: "representante", etiqueta: "Representante de la contraparte", origen: "manual", ayuda: "Se escribe al generar", ejemplo: "Dra. Marta Ribas" },
  { k: "cargo", etiqueta: "Cargo del representante", origen: "manual", ayuda: "Se escribe al generar", ejemplo: "Vicerrectora de Internacionalización" },
  { k: "logo_udes", etiqueta: "Logo de la UDES", origen: "imagen", ayuda: "Imagen del modelo", ejemplo: "" },
  { k: "logo_institucion", etiqueta: "Logo de la institución", origen: "imagen", ayuda: "Se carga al generar", ejemplo: "" },
];

export const CLAVES_CONOCIDAS: ReadonlySet<string> = new Set(CAMPOS.map((c) => c.k));
export const CLAVES_IMAGEN = ["logo_udes", "logo_institucion"] as const;
const MANUALES = CAMPOS.filter((c) => c.origen === "manual").map((c) => c.k);

export function vigenciaTexto(c: Pick<Convenio, "fecha_firma" | "fecha_terminacion" | "indefinido">, idioma: Idioma): string {
  if (c.indefinido) return idioma === "es" ? "indefinida" : "indefinite";
  if (!c.fecha_firma || !c.fecha_terminacion) return "";
  const meses = Math.round((Date.parse(c.fecha_terminacion) - Date.parse(c.fecha_firma)) / (30.4375 * 86_400_000));
  if (meses <= 0) return "";
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  const a = anios ? (idioma === "es" ? `${anios} ${anios === 1 ? "año" : "años"}` : `${anios} ${anios === 1 ? "year" : "years"}`) : "";
  const m = resto ? (idioma === "es" ? `${resto} ${resto === 1 ? "mes" : "meses"}` : `${resto} ${resto === 1 ? "month" : "months"}`) : "";
  return [a, m].filter(Boolean).join(idioma === "es" ? " y " : " and ");
}

/** Los valores que salen de la ficha del convenio (y la fecha de hoy). Los campos manuales quedan vacíos. */
export function valoresDeConvenio(c: Convenio, idioma: Idioma, hoy: string): Record<string, string> {
  return {
    institucion: c.institucion,
    pais: c.pais,
    codigo: c.codigo.toUpperCase(),
    documento: c.documento,
    tipo: c.tipo,
    objeto: c.objeto,
    modalidad: c.modalidad,
    campus: c.campus,
    facultad: c.facultad,
    programas: c.programas,
    fecha_firma: fechaLegible(c.fecha_firma, idioma),
    fecha_terminacion: c.indefinido ? (idioma === "es" ? "indefinida" : "indefinite") : fechaLegible(c.fecha_terminacion, idioma),
    vigencia: vigenciaTexto(c, idioma),
    fecha_documento: fechaLegible(hoy, idioma),
    representante: "",
    cargo: "",
  };
}

/* ---------- Marcadores {{x}} · [x] · <<x>> ---------------------------------------------------- */

const quitarTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** «Fecha de Firma» → «fecha_de_firma»; nulo si no sirve como nombre de campo. */
export function claveDe(crudo: string): string | null {
  const k = quitarTildes(crudo).toLowerCase().trim().replace(/[\s-]+/g, "_");
  return /^[a-z][a-z0-9_]{0,39}$/.test(k) ? k : null;
}

/** El mismo patrón para el texto plano y el XML ya decodificado. Los corchetes solo valen para campos conocidos. */
export function patronMarcadores(): RegExp {
  return /\{\{\s*([^{}\n]{1,60}?)\s*\}\}|<<\s*([^<>\n]{1,60}?)\s*>>|\[\s*([a-z][a-z0-9_]{1,39})\s*\]/g;
}

export interface Hallazgo {
  inicio: number;
  fin: number;
  clave: string;
}

/** Los marcadores de un texto, con su posición. `conocidos` decide si un [campo] cuenta. */
export function hallarMarcadores(texto: string, conocidos: ReadonlySet<string>): Hallazgo[] {
  const re = patronMarcadores();
  const sal: Hallazgo[] = [];
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    const crudo = m[1] ?? m[2] ?? m[3] ?? "";
    const clave = claveDe(crudo);
    if (!clave) continue;
    if (m[3] !== undefined && !conocidos.has(clave)) continue;
    sal.push({ inicio: m.index, fin: m.index + m[0].length, clave });
  }
  return sal;
}

export function clavesDe(texto: string, conocidos: ReadonlySet<string>): string[] {
  return [...new Set(hallarMarcadores(texto, conocidos).map((h) => h.clave))];
}

/** Qué falta por llenar al generar: los campos usados que no son imagen y no traen valor. */
export function camposPorPedir(usados: readonly string[], valores: Record<string, string>): string[] {
  return usados.filter((k) => !(CLAVES_IMAGEN as readonly string[]).includes(k) && !(valores[k] ?? "").trim());
}

export const esManual = (k: string, personalizados: readonly { k: string }[]) => MANUALES.includes(k) || personalizados.some((p) => p.k === k);

/* ---------- HTML del editor ----------------------------------------------------------------------- */

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const BLOQUES = new Set(["P", "H1", "H2", "H3", "H4", "LI"]);
const SIMPLES = new Set(["B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "P", "H1", "H2", "H3", "H4", "BR"]);
const DESCARTAR = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "NOSCRIPT", "TEMPLATE", "SVG", "MATH", "LINK", "META"]);

function alineacion(el: Element): string | null {
  const s = (el as HTMLElement).style?.textAlign || el.getAttribute("align") || "";
  return ["left", "center", "right", "justify"].includes(s) ? s : null;
}

/** Copia solo lo permitido: texto, negrita, cursiva, subrayado, listas, títulos, alineación, campos y cajas de firma. */
export function sanearHoja(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html.slice(0, 450_000)}</body>`, "text/html");
  const salida = document.createElement("div");
  const copiar = (origen: Node, destino: Node, profundidad: number) => {
    if (profundidad > 30) return;
    origen.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        destino.appendChild(document.createTextNode(n.textContent ?? ""));
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const el = n as Element;
      const t = el.tagName;
      if (DESCARTAR.has(t)) return;
      if (t === "SPAN" && el.hasAttribute("data-campo")) {
        const k = claveDe(el.getAttribute("data-campo") ?? "");
        if (k) {
          const s = document.createElement("span");
          s.className = "gest-var";
          s.setAttribute("data-campo", k);
          s.setAttribute("contenteditable", "false");
          s.textContent = `{{${k}}}`;
          destino.appendChild(s);
        }
        return;
      }
      if (t === "DIV" && el.classList.contains("gest-firma")) {
        const orden = Number(el.getAttribute("data-firma"));
        if (orden >= 1 && orden <= 6) {
          const d = document.createElement("div");
          d.className = "gest-firma";
          d.setAttribute("data-firma", String(orden));
          d.setAttribute("contenteditable", "false");
          d.textContent = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || `Firma ${orden}`;
          destino.appendChild(d);
        }
        return;
      }
      if (SIMPLES.has(t)) {
        const e = document.createElement(t.toLowerCase());
        if (BLOQUES.has(t)) {
          const al = alineacion(el);
          if (al) e.setAttribute("style", `text-align:${al}`);
        }
        if (t === "H3" && el.classList.contains("gest-clausula")) e.className = "gest-clausula";
        copiar(el, e, profundidad + 1);
        destino.appendChild(e);
        return;
      }
      // DIV, FONT, SPAN con estilos y demás: se conserva el contenido; los bloques sueltos pasan a párrafo.
      if (t === "DIV") {
        const p = document.createElement("p");
        const al = alineacion(el);
        if (al) p.setAttribute("style", `text-align:${al}`);
        copiar(el, p, profundidad + 1);
        destino.appendChild(p);
        return;
      }
      copiar(el, destino, profundidad + 1);
    });
  };
  copiar(doc.body, salida, 0);
  return salida.innerHTML;
}

/** El HTML de las claves de campo usadas en el modelo del editor. */
export function camposDeHoja(html: string): string[] {
  const claves = new Set<string>();
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll("span[data-campo]").forEach((s) => {
    const k = claveDe(s.getAttribute("data-campo") ?? "");
    if (k) claves.add(k);
  });
  return [...claves];
}

export function firmasDeHoja(html: string): { firmante: number; ancla: string }[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return [...doc.querySelectorAll("div.gest-firma[data-firma]")].map((d) => ({ firmante: Number(d.getAttribute("data-firma")), ancla: (d.textContent ?? "").trim() }));
}

const ORDINALES = ["primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima", "octava", "novena", "décima", "undécima", "duodécima", "decimotercera", "decimocuarta", "decimoquinta", "decimosexta", "decimoséptima", "decimoctava", "decimonovena", "vigésima"];

export interface DocumentoFinal {
  html: string;
  /** Campos usados que quedaron sin valor. */
  faltan: string[];
}

export interface LogosDocumento {
  udes: string | null;
  institucion: string | null;
}

/** El convenio del editor ya con valores, cláusulas numeradas y logos: una página HTML completa. */
export function documentoFinal(hoja: string, valores: Record<string, string>, idioma: Idioma, logos: LogosDocumento, titulo: string): DocumentoFinal {
  const doc = new DOMParser().parseFromString(`<body>${sanearHoja(hoja)}</body>`, "text/html");
  const faltan = new Set<string>();
  doc.querySelectorAll("span[data-campo]").forEach((s) => {
    const k = s.getAttribute("data-campo") ?? "";
    const v = (valores[k] ?? "").trim();
    if (!v) faltan.add(k);
    s.replaceWith(document.createTextNode(v || "________"));
  });
  let n = 0;
  doc.querySelectorAll("h3.gest-clausula").forEach((h) => {
    n += 1;
    const prefijo = idioma === "es" ? `Cláusula ${ORDINALES[n - 1] ?? `${n}.ª`}. ` : `Clause ${n}. `;
    h.classList.remove("gest-clausula");
    h.prepend(document.createTextNode(prefijo));
  });
  doc.querySelectorAll("div.gest-firma").forEach((d) => {
    d.classList.remove("gest-firma");
    d.classList.add("firma");
    d.removeAttribute("contenteditable");
  });
  const img = (src: string | null, alt: string) => (src ? `<img src="${esc(src)}" alt="${esc(alt)}">` : "<span></span>");
  const html = `<!doctype html><html lang="${idioma}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title><style>
body{margin:0;background:#f4f7fb;color:#0d1c31;font:12pt/1.55 "Times New Roman",Georgia,serif}
main{max-width:794px;margin:24px auto;background:#fff;padding:56px 64px;box-shadow:0 1px 4px rgba(10,34,73,.12)}
header{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:28px;min-height:48px}
header img{max-height:56px;max-width:220px}
h1,h2,h3,h4{font-weight:bold;margin:1.2em 0 .4em;line-height:1.3}h1{font-size:15pt;text-align:center;text-transform:uppercase}h2{font-size:13pt}h3,h4{font-size:12pt}
p{margin:0 0 .7em;text-align:justify}li{margin-bottom:.3em}
.firma{display:inline-block;width:44%;margin:36px 3% 0 0;padding-top:64px;border-top:1px solid #0d1c31;font:10pt Arial,sans-serif;vertical-align:top}
@media print{body{background:#fff}main{margin:0;box-shadow:none;max-width:none;padding:0}}
</style></head><body><main><header>${img(logos.udes, "Universidad de Santander")}${img(logos.institucion, "")}</header>${doc.body.innerHTML}</main></body></html>`;
  return { html, faltan: [...faltan] };
}

/* ---------- Huella y utilidades ---------------------------------------------------------------------- */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const nombreSeguro = (s: string): string =>
  quitarTildes(s)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "documento";

export const tamanoLegible = (n: number | null | undefined): string => (n == null ? "" : n >= 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const IMAGEN_MAX_BYTES = 2 * 1024 * 1024;
export const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/svg+xml"] as const;

/** Revisa tipo y tamaño de un logo. Devuelve el motivo si no sirve. */
export function motivoImagenNoValida(f: Pick<File, "type" | "size" | "name">): string | null {
  if (!(TIPOS_IMAGEN as readonly string[]).includes(f.type)) return "El logo debe ser PNG, JPG o SVG.";
  if (f.size > IMAGEN_MAX_BYTES) return "El logo pesa más de 2 MB.";
  if (f.size === 0) return "El archivo está vacío.";
  return null;
}

/* ---------- Variables de los correos (igual que variablesDe en la función conv-avisos) ---------- */

export function variablesAviso(c: Pick<Convenio, "id" | "codigo" | "institucion" | "pais" | "fecha_terminacion"> & { tipo: string }, hoy: string, idioma: Idioma, base: string): Record<string, string> {
  const dias = c.fecha_terminacion ? Math.abs(Math.round((Date.parse(c.fecha_terminacion) - Date.parse(hoy)) / 86_400_000)) : 0;
  return {
    institucion: c.institucion,
    pais: c.pais,
    codigo: c.codigo.toUpperCase(),
    fecha_termino: fechaLegible(c.fecha_terminacion, idioma),
    dias: String(dias),
    tipo: c.tipo,
    enlace_renovacion: `${base}/admin/internacionalizacion/gestion?tab=modelos&convenio=${c.id}`,
    enlace_firma: `${base}/firmar/ejemplo`,
    vence: fechaLegible(sumarDias(hoy, 7), idioma),
    nombre_firmante: idioma === "es" ? "Persona de ejemplo" : "Sample Person",
    codigo_certificado: "UDES-0000-0000",
  };
}

export const ROTULO_ESTADO_ENVIO: Record<string, { texto: string; clase: "ok" | "warn" | "bad" | "idle" }> = {
  enviado: { texto: "Enviado", clase: "ok" },
  sin_contacto: { texto: "Sin contacto: avisó al equipo", clase: "idle" },
  error: { texto: "Error", clase: "bad" },
  rebote: { texto: "Rebotó", clase: "bad" },
  pendiente: { texto: "En curso", clase: "warn" },
};

/** Descarga unos bytes como archivo. */
export function descargarBytes(bytes: Uint8Array | string, nombre: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Abre el diálogo de impresión de una página HTML (de ahí se guarda como PDF). */
export function imprimirHtml(html: string): void {
  const marco = document.createElement("iframe");
  marco.setAttribute("aria-hidden", "true");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  marco.srcdoc = html;
  marco.onload = () => {
    marco.contentWindow?.focus();
    marco.contentWindow?.print();
    window.setTimeout(() => marco.remove(), 60_000);
  };
  document.body.appendChild(marco);
}
