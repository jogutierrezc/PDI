// Captura por lote de Informes Institucionales con red simulada (fixtures.mjs + mock.mjs).
// Requiere: npm run dev en el puerto 5199 con VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=demo.
// Uso: node lote.mjs [filtro-regex]  ->  ../capturas/<n>.png y ../marcas.json (los guiones de la lista están en lista-capturas.mjs)
import { chromium } from "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/519be8fa-3f90-41c1-9488-e21afcaa3e74/scratchpad/pw/node_modules/playwright-core/index.mjs";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
import { LISTA } from "./lista-capturas.mjs";
import { fixtures } from "./fixtures.mjs";
import { instalarRed, ponerSesion } from "./mock.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const raizDoc = path.join(here, "..");
const filtro = process.argv[2] ? new RegExp(process.argv[2]) : null;
const mf = path.join(raizDoc, "marcas.json");
const marcas = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : {};
fs.mkdirSync(path.join(raizDoc, "capturas/textos"), { recursive: true });
// La presentación de ejemplo (ficticia) vive en src/modules/informes/presentacion/ejemplo.ts: Vite la sirve ya como JS y se lee de ahí (no se copia ni se toca).
try {
  const js = await (await fetch("http://127.0.0.1:5199/src/modules/informes/presentacion/ejemplo.ts")).text();
  globalThis.__presentacionEjemplo = (await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"))).presentacionEjemplo;
} catch (e) { console.log("sin presentación de ejemplo:", e.message); }
const b = await chromium.launch({ executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", headless: true });
for (const c of LISTA) {
  if (filtro && !filtro.test(c.n)) continue;
  const w = c.w || 1180;
  const fx = fixtures(c.papel || "admin");
  const ctx = await b.newContext({ viewport: { width: w, height: c.h || 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", isMobile: w < 500 });
  const reg = { sinSimular: new Set() };
  await instalarRed(ctx, fx, reg); await ponerSesion(ctx, fx.perfil);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  pageerror", c.n, e.message.slice(0, 160)));
  try {
    // La guarda de la ruta descarta la búsqueda (?s=4) en la primera carga: se entra por la ruta y luego se navega dentro de la aplicación.
    const [rutaBase, busqueda] = c.r.split("?");
    await p.goto("http://127.0.0.1:5199" + rutaBase, { waitUntil: "load" });
    await p.waitForTimeout(2500);
    if (busqueda) { await p.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, rutaBase + "?" + busqueda); await p.waitForTimeout(1500); }
    if (c.fn) { await c.fn(p); await p.waitForTimeout(800); }
    if (!c.fijo) { const hh = await p.evaluate(() => Math.max(document.documentElement.scrollHeight, document.querySelector(".admin-body")?.scrollHeight || 0));
    await p.setViewportSize({ width: w, height: Math.min(Math.max(hh, c.h || 900), 6000) }); await p.waitForTimeout(500); }
    const caja = await p.evaluate((sel) => { const e = document.querySelector(sel) || document.body; const r = e.getBoundingClientRect(); return { x: Math.max(r.left, 0), y: r.top + scrollY, w: r.width, h: r.height }; }, c.raiz || (w < 700 ? "body" : ".admin-body"));
    let y0 = caja.y;
    if (c.desde) y0 = await p.evaluate(([s, ar]) => { const e = (() => { try { return document.querySelector(s); } catch { return null; } })() || [...document.querySelectorAll("h1,h2,h3,h4,legend,summary,b,strong,span,p,label")].find((x) => x.textContent.trim().startsWith(s) && x.offsetParent !== null); if (!e) return null; return e.getBoundingClientRect().top + scrollY - ar; }, [c.desde, c.arriba ?? 14]);
    if (y0 === null) throw new Error("no se halló 'desde': " + c.desde);
    const h = Math.min(c.alto || caja.y + caja.h - y0, c.maxH || (c.fijo ? c.h : 1000), caja.y + caja.h - y0);
    const clip = { x: caja.x, y: y0, width: caja.w, height: h };
    await p.screenshot({ path: path.join(raizDoc, "capturas", c.n + ".png"), fullPage: true, clip });
    const ms = [];
    for (const [num, loc, dx = 0, dy = 0] of c.marks || []) {
      let bb;
      try { bb = await p.locator(loc).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; }, null, { timeout: 4000 }); } catch { console.log("  marca sin ubicar", c.n, num, loc); continue; }
      if (bb.y + dy - clip.y > clip.height || bb.y + dy < clip.y) { console.log("  marca fuera del recorte", c.n, num, loc); continue; }
      ms.push([num, +(((bb.x - clip.x + dx) / clip.width) * 100).toFixed(2), +(((bb.y - clip.y + dy) / clip.height) * 100).toFixed(2)]);
    }
    fs.writeFileSync(path.join(raizDoc, "capturas/textos", c.n + ".txt"), await p.evaluate(() => document.querySelector(".admin-body")?.innerText || document.body.innerText));
    marcas[c.n] = { ms, ratio: +(clip.height / clip.width).toFixed(4) };
    console.log("ok", c.n, Math.round(clip.height), reg.sinSimular.size ? "sin simular: " + [...reg.sinSimular].join("; ") : "");
  } catch (e) { console.log("FALLO", c.n, e.message.split("\n")[0]); }
  await ctx.close();
}
fs.writeFileSync(mf, JSON.stringify(marcas, null, 1));
await b.close();
