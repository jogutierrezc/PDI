// Piezas del manual (HTML en texto). Cada pieza devuelve un «bloque»: { html, keep?, h2?, shot?, pb? }.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const MARCAS = fs.existsSync(path.join(here, "marcas.json")) ? JSON.parse(fs.readFileSync(path.join(here, "marcas.json"), "utf8")) : {};
export const PORTAL = "planeacion.udes.edu.co";
export const RUTA = "/admin/planeacion-seguimiento";

export const fls = (txt, cls = "d", size = 16) =>
  `<span class="fls" style="font-size:${size}px">${[...txt]
    .map((c) => `<span class="fl ${cls}${/[\/.\-· ]/.test(c) ? " s" : ""}">${c === " " ? "&nbsp;" : c}</span>`)
    .join("")}</span>`;

const SVG = {
  ok: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M5.2 8.2l2 2 3.6-4"/></svg>`,
  pe: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.2 1.4"/></svg>`,
  ri: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2l6 10.8H2z"/><path d="M8 6.6v3M8 11.4v.1"/></svg>`,
  ne: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M5.5 8h5"/></svg>`,
  az: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v3.4M8 10.9v.1"/></svg>`,
};
export const st = (k, t) => `<span class="st ${k}">${SVG[k]}${t}</span>`;
export const q = (t) => `<span class="q">«${t}»</span>`;
export const rt = (t) => `<span class="rt">${t}</span>`;

const blk = (html, extra = {}) => ({ html: `<div class="blk">${html}</div>`, ...extra });

export const h2 = (title, id, first = false) => blk(`<h2 class="h2${first ? " first" : ""}">${title}</h2>`, { keep: true, h2: { title, id } });
export const h3 = (t) => blk(`<div class="h3">${t}</div>`, { keep: true });
export const lead = (t) => blk(`<p class="lead">${t}</p>`);
export const p = (t) => blk(`<p class="txt">${t}</p>`);
export const cap = (t) => blk(`<p class="cap">${t}</p>`);
export const list = (arr) => { const items = arr.map((x) => `<li>${x}</li>`); const wrap = (it) => `<div class="blk"><ul class="lst">${it.join("")}</ul></div>`; return { html: wrap(items), split: { items, wrap, sel: "ul > li" } }; };
export const ticket = (b, t) => blk(`<div class="ticket"><b class="t">${b}</b>${t}</div>`);
export const raw = (html) => blk(html);
export const pb = () => ({ html: "", pb: true });

export function pilo(mood, texto, nombre = "Pilo dice") {
  const f = { feliz: "pilo-feliz.webp", idea: "pilo-idea.webp", piensa: "pilo-piensa.webp", excelente: "pilo-excelente.webp", duda: "pilo-duda.webp", cuidado: "pilo-cuidado.webp", bien: "pilo-bien.webp", astronauta: "pilo-astronauta.webp" }[mood];
  const alt = { feliz: "Pilo sonriendo", idea: "Pilo con birrete", piensa: "Pilo pensando", excelente: "Pilo celebrando con los ojos cerrados", duda: "Pilo con gesto de duda", cuidado: "Pilo atento", bien: "Pilo guiñando el ojo", astronauta: "Pilo con casco de astronauta" }[mood];
  return blk(`<div class="pilo"><img class="cara" src="assets/${f}" alt="${alt}"><div class="globo"><b class="n">${nombre}</b>${texto}</div></div>`);
}

export function step(n, titulo, texto, cls = "") {
  return `<div class="step ${cls}"><span class="dot">${n}</span><div><div class="h3">${titulo}</div>${texto ? `<p>${texto}</p>` : ""}</div></div>`;
}
export const steps = (arr, { start = 1, two = false, c = false } = {}) => {
  const items = arr.map((s, i) => step(start + i, s[0], s[1], c ? "c" : ""));
  const wrap = (it) => `<div class="blk"><div class="steps${two ? " two" : ""}">${it.join("")}</div></div>`;
  return { html: wrap(items), split: two ? undefined : { items, wrap, sel: ".steps > .step" } };
};

export function tbl(head, rows, cls = "", widths) {
  const cg = widths ? `<colgroup>${widths.map((w) => `<col style="width:${w}">`).join("")}</colgroup>` : "";
  const trs = rows.map((r) => `<tr>${r.map((c) => (typeof c === "object" && c ? `<td class="${c.c}">${c.t}</td>` : `<td>${c}</td>`)).join("")}</tr>`);
  const wrap = (items) => `<div class="blk"><table class="tbl ${cls}">${cg}<thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${items.join("")}</tbody></table></div>`;
  return { html: wrap(trs), split: { items: trs, wrap, sel: "tbody > tr" } };
}

export const cols = (a, b, wide = false) => blk(`<div class="cols${wide ? " w" : ""}"><div>${a}</div><div>${b}</div></div>`);
export const card = (titulo, inner) => `<div class="card"><div class="h3">${titulo}</div>${inner}</div>`;
export const rolcard = (titulo, inner, nota = "") => `<div class="rolcard"><div class="h3">${titulo}</div><p>${inner}</p>${nota ? `<p class="cap">${nota}</p>` : ""}</div>`;
export const faq = (pregunta, resp) => blk(`<div class="faq"><div class="h3">${pregunta}</div><p>${resp}</p></div>`);

export function cadena(nodos) {
  return blk(`<div class="cadena">${nodos.map(([n, t, d, vaf], i) => `<div class="nodo${vaf ? " vaf" : ""}"><span class="n">${String(i + 1).padStart(2, "0")}</span><b>${t}</b><span class="d">${d}</span></div>`).join("")}</div>`);
}
export function flujo(filas) {
  const items = filas.map(([n, quien, que]) => `<div class="f"><span class="dot">${n}</span><span class="who">${quien}</span><span class="what">${que}</span></div>`);
  const wrap = (it) => `<div class="blk"><div class="flujo">${it.join("")}</div></div>`;
  return { html: wrap(items), split: { items, wrap, sel: ".flujo > .f" } };
}
// shot: f = nombre de la captura (imagenes/<f>.jpg), url = ruta que se ve en la barra, marks = true (usa marcas.json) o lista [[n,x,y]],
// maxh = alto máximo en px de página, w = ancho en px (por defecto el de la columna).
export const missing = [];
export function shot({ f, url, alt, maxh = 520, w, marks = true, miss, cut = false, keep = true }) {
  const file = path.join(here, "imagenes", f + ".jpg");
  const info = MARCAS[f];
  const ok = fs.existsSync(file) && info;
  const ratio = info?.ratio || 0.6;
  const W = w ? w : Math.min(704, Math.floor((Math.max(Math.min(maxh, 640), 520) - 30) / ratio));
  let inner;
  if (ok) {
    const ms = marks === true ? info.ms : marks || [];
    inner = `<div class="shot-img${cut || Math.abs(ratio - 0.7093) < 0.001 || Math.abs(ratio - 0.7627) < 0.001 ? " cut" : ""}"><img src="imagenes/${f}.jpg" alt="${alt}">${ms.map(([n, x, y]) => `<span class="dot" style="left:${Math.max(x, 2.6)}%;top:${Math.max(y, 1.5)}%">${n}</span>`).join("")}</div>`;
  } else {
    missing.push(`${f}: ${miss || alt}`);
    inner = `<div class="shot-miss" style="min-height:${miss ? 170 : 140}px">[CAPTURA PENDIENTE · ${miss || alt}]</div>`;
  }
  const mk = (w) => `<div class="blk"><figure class="shot" style="width:${w}px"><div class="shot-bar"><span class="shot-url">${PORTAL}${url}</span></div>${inner}</figure></div>`;
  return { html: mk(W), shot: true, keep, fit: ok ? { ratio, W, mk } : null };
}

// Dos capturas lado a lado (vistas de conjunto; el texto fino no se lee, importa la forma).
export function shotpair(a, b) {
  const fig = ({ f, url, alt }) => {
    const info = MARCAS[f];
    const ok = fs.existsSync(path.join(here, "imagenes", f + ".jpg")) && info;
    if (!ok) missing.push(`${f}: ${alt}`);
    return `<figure class="shot" style="width:100%;margin:0"><div class="shot-bar"><span class="shot-url">…${url}</span></div>${ok ? `<div class="shot-img cut"><img src="imagenes/${f}.jpg" alt="${alt}"></div>` : `<div class="shot-miss">[CAPTURA PENDIENTE · ${alt}]</div>`}</figure>`;
  };
  const mk = (w) => `<div class="blk"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${fig(a)}${fig(b)}</div></div>`;
  const ratio = Math.max(MARCAS[a.f]?.ratio || 0.6, MARCAS[b.f]?.ratio || 0.6);
  return { html: mk(), shot: true, keep: true, fit: null };
}
