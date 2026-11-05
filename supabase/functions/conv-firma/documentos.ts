/* =============================================================================
   conv-firma · HTML de los PDF que se convierten con Gotenberg (Chromium):
     · bloque de firma (trazo o datos del certificado + QR de validación + datos),
     · página de firmas (cuando el modelo no define cajas o el origen es un Word),
     · certificado de trazabilidad (A4, es/en), con el diseño aprobado en el artifact «firmante».

   Estilo: documento sobrio. Azul institucional #014898 solo en títulos y filetes; jerarquía por tamaño y peso,
   no por adornos. Sin sellos ni logos sobre la firma. Tipografía: IBM Plex si el servidor la tiene; si no,
   Liberation/Arial (Gotenberg las trae).
   Seguridad: todo texto externo pasa por esc(); cada documento lleva una política CSP que prohíbe scripts
   y cualquier recurso que no sea data: (Chromium no sale a la red desde estos PDF).
   ========================================================================== */

import { LOGO_UDES } from "./logo.ts";
import { qrSvg } from "./qr.ts";
import { NORMAS_COLOMBIA, NORMAS_INTERNACIONALES, nombrePais, PAISES } from "./normas.ts";
import type { Norma } from "./normas.ts";
import { EVENTOS, TEXTOS } from "./textos.ts";
import type { Idioma } from "./plantilla.ts";
import { appUrl, dispositivoDe, esc, ipEnmascarada, utcLegible } from "./util.ts";

export const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">`;

const SANS = `"IBM Plex Sans","Liberation Sans",Arial,Helvetica,sans-serif`;
const MONO = `"IBM Plex Mono","Liberation Mono","Courier New",monospace`;

export interface FirmanteDoc {
  orden: number;
  rol: string;
  rolTexto: string;
  /** «Universidad de Santander» o la institución de la contraparte: de quién es la firma. */
  parte: string;
  nombre: string;
  correo: string;
  codigoIdentidad: string;
  metodo: string;
  firmadoEn: string;
  certSujeto?: string | null;
  certEmisor?: string | null;
  certSerie?: string | null;
  certDesde?: string | null;
  certHasta?: string | null;
  certCadena?: string | null;
  ip?: string | null;
  pais?: string | null;
  agente?: string | null;
  /** Data URI del PNG del trazo (dibujo y móvil). */
  trazo?: string;
}

export const urlVerificacion = (codigo: string, huella: string, clave: string): string =>
  `${appUrl()}/verificar/${encodeURIComponent(codigo)}?h=${huella}&f=${encodeURIComponent(clave)}`;

const tipoFirma = (metodo: string, idioma: Idioma): string => {
  const t = TEXTOS[idioma];
  return metodo === "certificado" ? t.tCertif : metodo === "movil" ? t.tMovil : t.tDibu;
};

const fechaCorta = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : "");

export const CSS_BLOQUE = `
.fb{display:inline-block;vertical-align:top;width:47%;margin:18px 2% 12px 0;break-inside:avoid;page-break-inside:avoid;font:8.6pt/1.4 ${SANS};color:#0d1c31;text-align:left}
.fb .quien{display:block;font-weight:600;font-size:9.4pt;margin-bottom:5px}
.fb .campo{height:21mm;border-bottom:1.2px solid #8a9bb0;display:flex;align-items:flex-end;padding:0 2mm 1mm;overflow:hidden}
.fb .campo img{max-height:18.5mm;max-width:100%;display:block}
.fb .campo .cert{font:7.2pt/1.35 ${MONO};color:#33465e;overflow-wrap:anywhere}
.fb .val{display:flex;gap:3mm;margin-top:3mm;align-items:flex-start}
.fb .qr{width:22mm;height:22mm;flex:none;border:1px solid #cfd8e3;padding:1mm;background:#fff}
.fb .qr svg{width:100%;height:100%;display:block}
.fb dl{display:grid;grid-template-columns:16mm 1fr;gap:.3mm 2mm;margin:0;font-size:7.2pt;line-height:1.35;min-width:0}
.fb dt{color:#5b6875}
.fb dd{margin:0;overflow-wrap:anywhere;font-weight:500}
.fb dd.mono{font:7pt/1.35 ${MONO};font-weight:400}
.fb .ver{font-size:6.8pt;color:#5b6875;margin-top:2mm}
`;

/** El bloque de una firma: trazo o texto del certificado, y a su lado el QR con los datos. */
export function bloqueFirmaHtml(f: FirmanteDoc, ctx: { codigo: string; huella: string; idioma: Idioma }): string {
  const t = TEXTOS[ctx.idioma];
  const campo =
    f.metodo === "certificado"
      ? `<div class="cert">${esc(t.tCertif)}<br>${esc(f.certSujeto ?? "")}</div>`
      : f.trazo
        ? `<img src="${esc(f.trazo)}" alt="">`
        : "";
  const fecha = utcLegible(f.firmadoEn);
  const filas: [string, string, boolean][] = [
    [t.dNom, f.nombre, false],
    [t.dMail, f.correo, false],
    [t.dId, f.codigoIdentidad, true],
    [t.dTipo, tipoFirma(f.metodo, ctx.idioma), false],
    [t.dFecha, fecha, false],
    [t.dHuella, `${ctx.huella.slice(0, 8)}…${ctx.huella.slice(-8)}`, true],
  ];
  return `<div class="fb"><span class="quien">${esc(t.firmaDe)} ${esc(f.parte)}</span><div class="campo">${campo}</div>
<div class="val"><div class="qr">${qrSvg(urlVerificacion(ctx.codigo, ctx.huella, f.codigoIdentidad))}</div><dl>${filas
    .map(([k, v, m]) => `<dt>${esc(k)}</dt><dd${m ? ' class="mono"' : ""}>${esc(v)}</dd>`)
    .join("")}</dl></div><div class="ver">${esc(t.ver2)} · ${esc(ctx.codigo)}</div></div>`;
}

/** Reemplaza las cajas «div[data-firma=N]» del HTML generado por los bloques. Devuelve cuáles se usaron. */
export function inyectarBloques(html: string, bloques: Map<number, string>): { html: string; usados: Set<number> } {
  const usados = new Set<number>();
  const salida = html.replace(/<div\b[^>]*\bdata-firma\s*=\s*["']?(\d{1,2})["']?[^>]*>[\s\S]*?<\/div>/gi, (m, n: string) => {
    const orden = Number(n);
    const b = bloques.get(orden);
    if (!b || usados.has(orden)) return m;
    usados.add(orden);
    return b;
  });
  return { html: salida, usados };
}

/** Pone la CSP y los estilos de impresión en un HTML ya generado (antes de mandarlo a Chromium). */
export function prepararHtmlGenerado(html: string): string {
  // Sin scripts ni controladores de eventos, aunque la CSP ya los frena: doble barrera.
  const limpio = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed|link|base)\b[^>]*>(\s*<\/\1>)?/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const cabeza = `${CSP}<style>${CSS_BLOQUE}@page{size:A4}</style>`;
  if (/<head[^>]*>/i.test(limpio)) return limpio.replace(/<head[^>]*>/i, (m) => m + cabeza);
  return `<!doctype html><html><head><meta charset="utf-8">${cabeza}</head><body>${limpio}</body></html>`;
}

function docHtml(idioma: Idioma, titulo: string, css: string, cuerpo: string): string {
  return `<!doctype html><html lang="${idioma}"><head><meta charset="utf-8">${CSP}<title>${esc(titulo)}</title><style>
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;color:#0d1c31;font:9pt/1.45 ${SANS}}
${css}
</style></head><body>${cuerpo}</body></html>`;
}

/* ---------- Página de firmas ------------------------------------------------------------------------ */

export function paginaFirmasHtml(p: { idioma: Idioma; titulo: string; codigo: string; bloques: string[] }): string {
  const t = TEXTOS[p.idioma];
  const css = `
@page{size:A4;margin:18mm 16mm 18mm}
.cab{display:flex;justify-content:space-between;align-items:center;padding-bottom:6mm;border-bottom:1.5px solid #014898;margin-bottom:8mm}
.cab img{height:13mm}
.cab .c{font:8pt ${MONO};color:#5b6875;text-align:right}
h1{font-size:15pt;margin:0 0 3mm;color:#014898;font-weight:600}
p.s{margin:0 0 4mm;color:#33465e;font-size:9.5pt}
${CSS_BLOQUE}`;
  const cuerpo = `<div class="cab"><img src="${LOGO_UDES}" alt="${esc(t.universidad)}"><div class="c">${esc(p.codigo)}</div></div>
<h1>${esc(t.pagFirmas)}</h1><p class="s">${esc(p.titulo)}</p><p class="s">${esc(t.pagFirmasD)}</p>
<div>${p.bloques.join("")}</div>`;
  return docHtml(p.idioma, t.pagFirmas, css, cuerpo);
}

/* ---------- Certificado de trazabilidad ------------------------------------------------------------- */

export interface SelloInfo {
  modo: "prueba" | "real" | "sin_sello";
  prueba: boolean;
  sujeto?: string | null;
  emisor?: string | null;
  serie?: string | null;
  desde?: string | null;
  hasta?: string | null;
  horaUtc: string;
  tsa?: string | null;
  tsaError?: string | null;
}

export interface EventoDoc {
  ocurrio_en: string;
  tipo: string;
  firmante_id: string | null;
}

export interface DatosCertificado {
  idioma: Idioma;
  codigo: string;
  emitido: Date;
  nombreDocumento: string;
  convenio: string;
  institucion: string;
  paginas: number;
  huellaDocumento: string;
  huellaFinal: string;
  huellaRegistro: string;
  integridadOk: boolean;
  firmantes: (FirmanteDoc & { id: string })[];
  eventos: EventoDoc[];
  sello: SelloInfo;
}

export function certificadoHtml(d: DatosCertificado): string {
  const t = TEXTOS[d.idioma];
  const k = d.idioma === "en" ? 2 : 1;
  const nombres = new Map(d.firmantes.map((f) => [f.id, f.nombre]));
  const fila = (a: string, b: string) => `<tr><th>${esc(a)}</th><td>${b}</td></tr>`;
  const mono = (s: string) => `<span class="mono">${esc(s)}</span>`;
  const ley = (n: Norma) => `<li><b>${esc(n[0])}</b><span>${esc(n[k])}</span></li>`;

  // Países de la firma: los detectados por IP, sin repetir. Si no hay ninguno, solo Colombia e internacionales.
  const isoFirma = [...new Set(d.firmantes.map((f) => (f.pais ?? "").toUpperCase()).filter((p) => /^[A-Z]{2}$/.test(p)))];
  const marcoPais = isoFirma
    .filter((p) => p !== "CO")
    .map((p) => {
      const m = PAISES[p];
      return `<h4>${esc(t.cNormPais)}: ${esc(m ? (d.idioma === "es" ? m.nombre : nombrePais(p, "en")) : nombrePais(p, d.idioma))}</h4>${m && m.normas.length ? `<ul class="nl">${m.normas.map(ley).join("")}</ul>` : ""}`;
    })
    .join("");

  const filasFirmantes = d.firmantes
    .map((f) => {
      const pais = f.pais && /^[A-Z]{2}$/i.test(f.pais) ? nombrePais(f.pais.toUpperCase(), d.idioma) : t.cNoDet;
      const ip = ipEnmascarada(f.ip);
      const cert =
        f.metodo === "certificado"
          ? `<div class="sub">${esc(t.certSujeto)}: ${esc(f.certSujeto ?? "")}</div><div class="sub">${esc(t.certEmisor)}: ${esc(f.certEmisor ?? "")}</div><div class="sub">${esc(t.certSerie)}: ${esc(f.certSerie ?? "")} · ${esc(t.certVigencia)}: ${esc(fechaCorta(f.certDesde))} → ${esc(fechaCorta(f.certHasta))}</div><div class="sub">${esc(t.cCadena[f.certCadena ?? "no_verificada_acreditada"] ?? "")}</div>`
          : "";
      const disp = dispositivoDe(f.agente);
      return `<tr><td><b>${esc(f.nombre)}</b><div class="sub">${esc(f.correo)}</div><div class="mono">${esc(f.codigoIdentidad)}</div></td>
<td>${esc(t.roles[f.rol] ?? f.rol)}<div class="sub">${esc(f.parte)}</div></td>
<td>${esc(tipoFirma(f.metodo, d.idioma))}${disp ? `<div class="sub">${esc(t.cDisp)}: ${esc(disp)}</div>` : ""}${cert}</td>
<td>${ip ? `<span class="mono">${esc(ip)}</span> · ` : ""}${esc(pais)}${f.pais ? `<div class="sub">${esc(t.cDet)}</div>` : ""}</td>
<td class="mono">${esc(utcLegible(f.firmadoEn))}</td></tr>`;
    })
    .join("");

  const eventos = d.eventos
    .filter((e) => EVENTOS[d.idioma][e.tipo])
    .map((e) => {
      const n = e.firmante_id ? (nombres.get(e.firmante_id) ?? "") : "";
      return `<li><time class="mono">${esc(utcLegible(e.ocurrio_en))}</time><span>${esc(EVENTOS[d.idioma][e.tipo].replace("{n}", n).replace(" ()", ""))}</span></li>`;
    })
    .join("");

  const s = d.sello;
  const selloFilas =
    s.modo === "sin_sello"
      ? fila(t.cSelloCert, esc("—"))
      : fila(t.cSelloCert, `${esc(t.cSelloFirma)}<div class="sub">${esc(t.certSujeto)}: ${esc(s.sujeto ?? "")} · ${esc(t.certEmisor)}: ${esc(s.emisor ?? "")} · ${esc(t.certSerie)}: ${esc(s.serie ?? "")} · ${esc(t.certVigencia)}: ${esc(fechaCorta(s.desde))} → ${esc(fechaCorta(s.hasta))}</div>`);
  const selloTiempo = s.tsa
    ? `${esc(t.cSelloTsa)}: ${esc(s.tsa)}<div class="sub">${esc(s.horaUtc)}</div>`
    : `${esc(s.horaUtc)} · ${esc(t.cSelloV)}<div class="sub">${esc(s.tsaError ? t.cSelloFallo : t.cSelloSin)}</div>`;

  const qrUrl = urlVerificacion(d.codigo, d.huellaDocumento, "C");
  const css = `
@page{size:A4;margin:16mm 14mm 20mm}
.cab{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;padding-bottom:5mm;border-bottom:1.5px solid #014898;margin-bottom:5mm}
.cab img{height:13mm}
.cab .der{text-align:right}
.cab .der b{font-size:12pt;color:#014898;font-weight:600;display:block;max-width:92mm}
.mono{font-family:${MONO};font-size:7.8pt}
.sub{color:#5b6875;font-size:7.6pt}
h3{font-size:10pt;margin:6mm 0 2mm;padding-bottom:1mm;border-bottom:1px solid #cfd8e3;color:#014898;font-weight:600;break-after:avoid}
h4{font-size:8.6pt;margin:3.5mm 0 1.5mm;color:#014898;font-weight:600;break-after:avoid}
table{width:100%;border-collapse:collapse}
th,td{padding:1.4mm 2mm;border-bottom:1px solid #e6eaee;vertical-align:top;text-align:left;font-weight:400}
table.k th{width:44mm;color:#5b6875;font-size:8.2pt}
table.f thead th{font-size:7.6pt;color:#5b6875;font-weight:600;border-bottom:1.2px solid #8a9bb0}
table.f td{font-size:8.2pt}
tr{break-inside:avoid}
ul.tl{list-style:none;margin:0;padding:0}
ul.tl li{display:grid;grid-template-columns:42mm 1fr;gap:3mm;padding:.6mm 0;break-inside:avoid}
ul.tl time{color:#5b6875}
ul.nl{list-style:none;margin:0;padding:0}
ul.nl li{display:grid;gap:.3mm;padding:.9mm 0;break-inside:avoid;font-size:8.2pt}
ul.nl li span{color:#5b6875;font-size:7.8pt}
.ok{display:inline-block;padding:.5mm 2mm;background:#e3f2e9;color:#1e7a46;font-weight:600;font-size:8pt}
.mal{display:inline-block;padding:.5mm 2mm;background:#fbe4e2;color:#a8231b;font-weight:600;font-size:8pt}
.ver{display:flex;gap:5mm;align-items:center;break-inside:avoid}
.ver .qr{width:28mm;height:28mm;flex:none;border:1px solid #cfd8e3;padding:1.2mm}
.ver .qr svg{width:100%;height:100%;display:block}
.aviso{margin-top:3mm;color:#5b6875;font-size:7.6pt}
.fin{margin-top:8mm;padding-top:3mm;border-top:1px solid #cfd8e3;text-align:center;color:#5b6875;font-size:8pt}`;

  const cuerpo = `<div class="cab"><img src="${LOGO_UDES}" alt="${esc(t.universidad)}"><div class="der"><b>${esc(t.cT)}</b><div class="mono">${esc(t.cCod)} ${esc(d.codigo)}</div><div class="sub">${esc(t.cEm)}: ${esc(utcLegible(d.emitido))}</div></div></div>
<h3>1 · ${esc(t.c1)}</h3><table class="k">${fila(t.cNom, esc(d.nombreDocumento))}${fila(t.cConv, `${esc(d.convenio)} · ${esc(d.institucion)}`)}${fila(t.cPag, esc(String(d.paginas)))}${fila(t.cAlg, mono(d.huellaDocumento))}${fila(t.cAlgFinal, mono(d.huellaFinal))}</table>
<h3>2 · ${esc(t.c2)}</h3><table class="f"><thead><tr><th>${esc(t.dNom)}</th><th>${esc(t.cRol)}</th><th>${esc(t.cMet)}</th><th>${esc(t.cIp)}</th><th>${esc(t.dFecha)}</th></tr></thead><tbody>${filasFirmantes}</tbody></table>
<h3>3 · ${esc(t.c3)}</h3><ul class="tl">${eventos}</ul>
<h3>4 · ${esc(t.c4)}</h3><table class="k">${fila(t.cAlg, `SHA-256 · ${mono(d.huellaDocumento)}`)}${fila(t.cAlgFinal, `SHA-256 · ${mono(d.huellaFinal)}`)}${selloFilas}${fila(t.cSello, selloTiempo)}${fila(t.cRegistro, mono(d.huellaRegistro))}${fila("", d.integridadOk ? `<span class="ok">${esc(t.cInt)}</span>` : `<span class="mal">${esc(t.cIntNo)}</span>`)}</table>
<h3>5 · ${esc(t.c5)}</h3>
<h4>${esc(t.cNormCo)}</h4><ul class="nl">${NORMAS_COLOMBIA.map(ley).join("")}</ul>
${marcoPais || (isoFirma.length === 0 ? `<h4>${esc(t.cNormPais)}: ${esc(t.cNoDet)}</h4>` : "")}
<h4>${esc(t.cNormInt)}</h4><ul class="nl">${NORMAS_INTERNACIONALES.map(ley).join("")}</ul>
<p class="aviso">${esc(t.cAviso)}</p>
<h3>6 · ${esc(t.c6)}</h3><div class="ver"><div class="qr">${qrSvg(qrUrl)}</div><div>${esc(t.cVer)} <b>${esc(appUrl().replace(/^https?:\/\//, ""))}/verificar</b>.<div class="mono" style="margin-top:2mm">${esc(d.codigo)}</div></div></div>
<div class="fin">${esc(t.cEmi)}</div>`;
  return docHtml(d.idioma, t.cT, css, cuerpo);
}

/** Pie con paginación para el certificado y la página de firmas (Chromium lo repite en cada hoja). */
export function pieHtml(izquierda: string, idioma: Idioma): string {
  const t = TEXTOS[idioma];
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0 14mm;width:100%;font:7pt ${SANS};color:#5b6875;display:flex;justify-content:space-between}</style></head><body><span>${esc(izquierda)}</span><span>${esc(t.cPag2)} <span class="pageNumber"></span> / <span class="totalPages"></span></span></body></html>`;
}
