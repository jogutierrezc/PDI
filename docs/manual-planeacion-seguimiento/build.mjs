// Genera manual-planeacion-seguimiento.html (y el PDF con --pdf).
// Uso: node docs/manual-planeacion-seguimiento/build.mjs [--pdf]
// Las páginas son fijas (Carta, 816 × 1056 px). El texto se reparte solo: se mide cada bloque en Chrome (Edge) y se llena
// cada página por orden; cada capítulo empieza en página nueva. El índice recibe los números de página reales.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/519be8fa-3f90-41c1-9488-e21afcaa3e74/scratchpad/cap/node_modules/playwright-core/index.mjs";
import { fls, missing, PORTAL } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const DOC = { titulo: "Manual de uso · Planeación y Seguimiento", edicion: "Noviembre de 2026", ed: "01" };
const CAP_W = 704; // ancho del cuerpo
const CAP_H = 874; // alto del cuerpo sin nota al pie
const CAP_HN = 838; // con nota al pie de capturas
const GAP = 14;
const FRONT = 3; // portada + 2 páginas de contenido

// ---- imágenes (PNG 2x de capturas -> JPEG) ----------------------------------------------------
fs.mkdirSync(path.join(here, "imagenes"), { recursive: true });
for (const f of fs.readdirSync(path.join(here, "capturas")).filter((x) => x.endsWith(".png"))) {
  const out = path.join(here, "imagenes", f.replace(/\.png$/, ".jpg"));
  const src = path.join(here, "capturas", f);
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs) {
    execSync(`sips -s format jpeg -s formatOptions 84 -Z 1500 "${src}" --out "${out}" >/dev/null`);
  }
}

// ---- contenido ----------------------------------------------------------------------------------
const CAPS = [];
for (const f of fs.readdirSync(path.join(here, "contenido")).filter((x) => /^cap\d+\.mjs$/.test(x)).sort()) {
  CAPS.push((await import(pathToFileURL(path.join(here, "contenido", f)).href + "?v=" + Date.now())).default);
}
function openBlock(c) {
  return `<div class="blk open"><div><div class="sign">Capítulo ${c.n === 0 ? "cero" : c.n}</div><h1>${c.nombre}</h1><p>${c.desc}</p><div class="rutaf">${fls(c.ruta, "", 13)}</div></div><div>${fls(String(c.n).padStart(2, "0"), "", 70)}</div></div>`;
}

const headHtml = `<meta charset="utf-8"><meta name="viewport" content="width=816"><title>${DOC.titulo}</title><link rel="stylesheet" href="manual-ps.css">`;

// ---- medir ------------------------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const all = CAPS.flatMap((c) => c.blocks.map((b, i) => ({ ...b, cap: c, i })));
const mhtml = `<!doctype html><html lang="es"><head>${headHtml}</head><body><div class="pg" style="height:auto;overflow:visible;margin:0"><div class="body" style="position:static;width:${CAP_W}px;height:auto;overflow:visible">${CAPS.map((c, i) => `<div data-o="${i}">${openBlock(c)}</div>`).join("")}${all.map((b, k) => (b.pb ? "" : `<div data-k="${k}">${b.html}</div>`)).join("")}</div></div></body></html>`;
fs.writeFileSync(path.join(here, "_medir.html"), mhtml);
await page.goto("file://" + path.join(here, "_medir.html"), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
const hs = await page.evaluate((sels) => Object.fromEntries([...document.querySelectorAll("[data-k]")].map((e) => [e.dataset.k, { h: e.getBoundingClientRect().height, it: sels[e.dataset.k] ? [...e.querySelectorAll(sels[e.dataset.k])].map((x) => x.getBoundingClientRect().height) : null }])), Object.fromEntries(all.map((b, k) => [k, b.split?.sel]).filter((x) => x[1])));
all.forEach((b, k) => { b.h = hs[k]?.h || 0; if (b.split && hs[k]?.it) { b.split.h = hs[k].it; b.split.over = b.h - hs[k].it.reduce((s, x) => s + x, 0); } });
const ho = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-o]")].map((e) => [e.dataset.o, e.getBoundingClientRect().height])));
CAPS.forEach((c, i) => (c.openH = ho[i]));

// ---- repartir en páginas ------------------------------------------------------------------------------
const pages = []; // { cap, blocks:[], h }
const warn = [];
for (const cap of CAPS) {
  let cur = null;
  const nueva = () => { cur = { cap, blocks: [], h: pages.every((p) => p.cap !== cap) ? cap.openH + GAP : 0, shot: false, first: pages.every((p) => p.cap !== cap) }; pages.push(cur); };
  nueva();
  const mine = all.filter((b) => b.cap === cap);
  for (let i = 0; i < mine.length; i++) {
    const b = mine[i];
    if (b.pb) { if (cur.blocks.length) nueva(); continue; }
    // grupo: encabezados con lo que sigue
    const grupo = [b];
    let j = i;
    while (mine[j].keep && mine[j + 1] && !mine[j + 1].pb && !(mine[j].shot && (mine[j + 1].h2 || mine[j + 1].shot))) { grupo.push(mine[j + 1]); j++; }
    const ult = grupo[grupo.length - 1];
    const minUlt = ult.split && ult.split.h.length > 3 ? ult.split.over + ult.split.h[0] + ult.split.h[1] : ult.h;
    const gh = grupo.reduce((s, x) => s + x.h, 0) + GAP * (grupo.length - 1);
    const ghMin = grupo.slice(0, -1).reduce((s, x) => s + x.h, 0) + GAP * (grupo.length - 1) + minUlt;
    const gs = grupo.some((x) => x.shot);
    const lim = (pg) => (pg.shot || gs ? CAP_HN : CAP_H);
    const libre = (pg) => lim(pg) - pg.h - (pg.blocks.length ? GAP : 0);
    const poner = (x, h) => { cur.h += (cur.blocks.length ? GAP : 0) + h; cur.blocks.push(x); if (x.shot) cur.shot = true; };
    const sh = grupo.find((x) => x.fit);
    let gh2 = 0;
    const ghx = () => grupo.reduce((s, x) => s + x.h, 0) + GAP * (grupo.length - 1);
    if (!(ghx() <= libre(cur)) && !(ult.split && ult.split.h.length > 3 && ghMin <= libre(cur))) {
      // intentar encoger la captura para que quepa en esta página
      const need = ghx() - libre(cur);
      let ok = false;
      if (sh && cur.blocks.length) { const w = Math.floor(sh.fit.W - need / sh.fit.ratio); if (w >= sh.fit.W * 0.72) { sh.html = sh.fit.mk(w); sh.h -= (sh.fit.W - w) * sh.fit.ratio; sh.fit.W = w; ok = true; } }
      if (!ok && sh && grupo[0] === sh && grupo.length > 1 && cur.h < CAP_H * 0.72) {
        // la captura va en esta página y lo que sigue pasa a la siguiente
        for (const x of grupo) {
          const lib = () => lim(cur) - cur.h - (cur.blocks.length ? GAP : 0);
          if (x.fit && x.h > lib()) { const w = Math.floor(x.fit.W - (x.h - lib()) / x.fit.ratio); if (w >= x.fit.W * 0.72) { x.html = x.fit.mk(w); x.h -= (x.fit.W - w) * x.fit.ratio; x.fit.W = w; } }
          if (x.h > lib()) nueva();
          poner(x, x.h);
        }
        i = j;
        continue;
      }
      if (!ok) nueva();
    }
    if (ghx() > libre(cur) && sh) { const need = ghx() - libre(cur); const w = Math.floor(sh.fit.W - need / sh.fit.ratio); if (w >= sh.fit.W * 0.72) { sh.html = sh.fit.mk(w); sh.h -= (sh.fit.W - w) * sh.fit.ratio; sh.fit.W = w; } }
    if (ghx() > libre(cur) && !(ult.split && ult.split.h.length > 3)) warn.push(`Bloque demasiado alto (${Math.round(ghx())} px) en ${cap.nombre}: ${grupo.map((x) => Math.round(x.h) + ":" + (x.html.match(/alt="([^"]{0,40})/) || x.html.slice(0, 40))[1]).join(" + ")}`);
    for (const x of grupo.slice(0, -1)) poner(x, x.h);
    // el último puede dividirse por filas
    if (ult.split && ult.split.h.length > 3) {
      let it = ult.split.items.slice(), hh = ult.split.h.slice();
      while (it.length) {
        const total = ult.split.over + hh.reduce((s, x) => s + x, 0);
        const disp = libre(cur);
        if (total <= disp) { poner({ html: ult.split.wrap(it), h: total }, total); break; }
        let n = 0, acc = ult.split.over;
        while (n < it.length && acc + hh[n] <= disp) { acc += hh[n]; n++; }
        if (it.length - n === 1) n--; // no dejar una fila sola
        if (n < 2) { if (cur.blocks.length) { nueva(); continue; } n = Math.max(1, n); acc = ult.split.over + hh.slice(0, n).reduce((s, x) => s + x, 0); }
        poner({ html: ult.split.wrap(it.slice(0, n)), h: ult.split.over + hh.slice(0, n).reduce((s, x) => s + x, 0) }, ult.split.over + hh.slice(0, n).reduce((s, x) => s + x, 0));
        it = it.slice(n); hh = hh.slice(n);
        nueva();
      }
    } else poner(ult, ult.h);
    i = j;
  }
}
// numeración
pages.forEach((p, i) => (p.n = FRONT + 1 + i));
const TOTAL = FRONT + pages.length;

// ---- índice ----------------------------------------------------------------------------------------------
const toc = CAPS.map((c) => ({ c, pg: pages.find((p) => p.cap === c).n, subs: [] }));
for (const p of pages) for (const b of p.blocks) if (b.h2) toc.find((t) => t.c === p.cap).subs.push({ ...b.h2, pg: p.n });

// ---- piezas de página -------------------------------------------------------------------------------------------
const chLabel = (c) => (c.n === 0 ? `<b>${c.nombre}</b>` : `Capítulo ${c.n} · <b>${c.nombre}</b>`);
function marco(n, c, inner, { shot = false, extra = "" } = {}) {
  const left = n % 2 === 0;
  const tabTop = 112 + c.n * 66;
  const folio = fls(String(n).padStart(2, "0"), "d", 17);
  return `<section class="pg" id="p${n}">
    <div class="run"><div class="run-l"><img src="assets/logo-udes.svg" alt="Universidad de Santander"><i></i><span><b>Manual de uso</b>Planeación y Seguimiento</span></div>
      <div class="run-r"><span>${chLabel(c)}</span></div></div>
    ${c.tab === false ? "" : `<div class="tab${left ? " l" : ""}" style="top:${tabTop}px">${c.n}</div>`}
    <div class="body${shot ? " fnb" : ""}">${inner}</div>
    ${shot ? `<div class="fn">Las capturas son del modo de demostración: nombres, oficinas, cifras y fechas son ficticios.</div>` : ""}
    <div class="foot${left ? " l" : ""}"><span>Edición ${DOC.ed} · ${DOC.edicion}</span><span>${folio}</span></div>
    ${extra}</section>`;
}

const sheets = [];
// Portada
const filas = CAPS.filter((c) => c.portada);
sheets.push(`<section class="pg" id="p1" style="background:var(--navy-deep)">
  <div style="position:absolute;left:0;right:0;top:0;height:560px;background:var(--paper)"></div>
  <div style="position:absolute;left:56px;top:48px"><img src="assets/logo-udes.svg" alt="Universidad de Santander" style="height:62px;display:block"></div>
  <div style="position:absolute;left:56px;top:168px;width:520px">
    <div style="font-family:var(--f-display);font-weight:700;font-size:78px;line-height:.98;letter-spacing:-.035em;color:var(--navy)">Manual<br>de uso</div>
    <div style="margin-top:22px">${fls("planeación y seguimiento", "d", 27)}</div>
    <p style="margin-top:22px;font-size:16px;line-height:1.5;color:var(--ink-2);font-weight:500;max-width:470px">Cómo armar un plan, repartir el trabajo entre las oficinas, reportar avances y vigilar el presupuesto, paso a paso y con las pantallas del módulo.</p>
  </div>
  <img src="assets/pilo-feliz.webp" alt="Pilo, la mascota de Planeación, sonriendo" style="position:absolute;right:50px;top:150px;width:210px;height:auto">
  <div style="position:absolute;left:56px;right:56px;top:590px">
    ${filas.map((c) => `<div style="display:grid;grid-template-columns:56px 1fr auto 48px;gap:14px;align-items:center;height:56px;border-top:1px solid rgba(195,213,242,.22)"><span>${fls(String(c.n).padStart(2, "0"), "", 24)}</span><span style="color:#fff;font-weight:800;font-size:17.5px">${c.portada}</span><span>${fls(c.ruta, "", 13)}</span><span style="text-align:right;color:var(--on-navy);font-weight:700;font-size:13px">pág. ${toc.find((t) => t.c === c).pg}</span></div>`).join("")}
    <div style="border-top:1px solid rgba(195,213,242,.22)"></div>
  </div>
  <div style="position:absolute;left:56px;right:56px;bottom:40px;display:flex;align-items:center;justify-content:space-between;color:var(--on-navy);font-size:12.5px;font-weight:600"><span style="display:flex;align-items:center;gap:12px">${fls("edición " + DOC.ed, "sg", 18)}<span>${DOC.edicion}</span></span><span>Oficina de Planeación Institucional · Universidad de Santander</span></div>
</section>`);
// Contenido (2 páginas): se reparte por altura
const tocRows = [];
for (const t of toc) {
  tocRows.push({ h: 46, html: `<div class="toc-ch"><span>${fls(String(t.c.n).padStart(2, "0"), "d", 20)}</span><span class="t">${t.c.nombre}</span><span class="p">${t.pg}</span></div>` });
  for (const s of t.subs) tocRows.push({ h: 17, html: `<div class="toc-s"><span></span><span class="dl"><span>${s.title}</span><i></i></span><span class="p">${s.pg}</span></div>` });
}
const tocPages = [[], []];
{
  // por capítulo completo: una página (capacidades en px de cuerpo) no parte un capítulo
  const caps = []; let cur = null;
  for (const r of tocRows) { if (r.html.includes("toc-ch")) { cur = { h: 0, rows: [] }; caps.push(cur); } cur.h += r.h; cur.rows.push(r.html); }
  const cap = [700, 850]; let k = 0, h = 0;
  for (const c of caps) { if (h + c.h > cap[k] && k < 1) { k++; h = 0; } tocPages[k].push(...c.rows); h += c.h; }
}
const tc = { n: 0, nombre: "Contenido", ruta: "contenido", tab: false };
sheets.push(marco(2, tc, `<div class="blk"><h1 class="h1">Contenido</h1></div><div class="blk lead">Diez capítulos. Busque el suyo por su papel: administrador, gestor de oficina, colaborador o financiero. Los capítulos 0 y 1 son para todos.</div><div>${tocPages[0].join("")}</div>`));
sheets.push(marco(3, tc, `<div>${tocPages[1].join("")}</div>`));

// Capítulos
for (const p of pages) {
  const inner = (p.first ? openBlock(p.cap) : "") + p.blocks.map((b) => b.html).join("");
  sheets.push(marco(p.n, p.cap, inner, { shot: p.shot }));
}
const html = `<!doctype html><html lang="es"><head>${headHtml}</head><body>${sheets.join("\n")}</body></html>`;
fs.writeFileSync(path.join(here, "manual-planeacion-seguimiento.html"), html);

// ---- informe de llenado -----------------------------------------------------------------------------------------------------
console.log(`Páginas: ${TOTAL} (${pages.length} de capítulos)`);
for (const p of pages) {
  const lim = p.shot ? CAP_HN : CAP_H;
  const pct = Math.round(((p.h + (p.first ? 0 : 0)) / lim) * 100);
  console.log(`  p${String(p.n).padStart(2, "0")} cap${p.cap.n} ${String(pct).padStart(3)}% ${p.shot ? "[captura]" : ""}${pct < 55 ? "  <-- casi vacía" : ""}`);
}
if (warn.length) console.log("AVISOS:\n  " + warn.join("\n  "));
if (missing.length) console.log("CAPTURAS PENDIENTES:\n  " + [...new Set(missing)].join("\n  "));

// ---- PDF -----------------------------------------------------------------------------------------------------------------------------------------
if (process.argv.includes("--pdf")) {
  const p2 = await browser.newPage({ viewport: { width: 816, height: 1056 } });
  await p2.goto("file://" + path.join(here, "manual-planeacion-seguimiento.html"), { waitUntil: "networkidle" });
  await p2.evaluate(() => document.fonts.ready);
  await p2.waitForTimeout(800);
  const over = await p2.evaluate(() => [...document.querySelectorAll(".pg")].map((pg, i) => { const b = pg.querySelector(".body"); return b && b.scrollHeight > b.clientHeight + 1 ? { pagina: i + 1, sh: b.scrollHeight, ch: b.clientHeight } : null; }).filter(Boolean));
  console.log("Desbordes:", over.length ? JSON.stringify(over) : "ninguno");
  console.log("Fuentes:", (await p2.evaluate(() => ["Fraunces", "Open Sans", "Barlow Condensed"].map((f) => f + ":" + document.fonts.check(`16px "${f}"`)))).join(" "));
  await p2.pdf({ path: path.join(here, "manual-planeacion-seguimiento.pdf"), width: "816px", height: "1056px", printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
  console.log("PDF listo");
}
await browser.close();
