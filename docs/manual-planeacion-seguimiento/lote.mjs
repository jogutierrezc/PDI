// Captura por lote desde el modo demostración (npm run dev --port 5199).
// Cada captura recorta la zona de contenido (.ps-main) y calcula la posición de las marcas numeradas.
// Uso: node lote.mjs [filtro]   ->  capturas/<n>.png y marcas.json
import { chromium } from "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/519be8fa-3f90-41c1-9488-e21afcaa3e74/scratchpad/cap/node_modules/playwright-core/index.mjs";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
import { LISTA } from "./lista-capturas.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const filtro = process.argv[2] ? new RegExp(process.argv[2]) : null;
const mf = path.join(here, "marcas.json");
const marcas = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : {};
const b = await chromium.launch({ executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", headless: true });
for (const c of LISTA) {
  if (filtro && !filtro.test(c.n)) continue;
  const w = c.w || 1180;
  const ctx = await b.newContext({ viewport: { width: w, height: c.h || 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", isMobile: w < 500 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  pageerror", c.n, e.message));
  try {
    await p.goto("http://localhost:5199" + c.r, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    if (c.fn) { await c.fn(p); await p.waitForTimeout(700); }
    { const hh = await p.evaluate(() => document.documentElement.scrollHeight); await p.setViewportSize({ width: w, height: Math.min(Math.max(hh, c.h || 900), 5000) }); await p.waitForTimeout(400); }
    const raiz = c.nav ? "body" : ".ps-main";
    const caja = await p.evaluate((sel) => { const e = document.querySelector(sel); const r = e.getBoundingClientRect(); const ps = document.querySelector(".ps"); const pb = ps ? ps.getBoundingClientRect().bottom + scrollY : r.bottom + scrollY; return { x: 0, y: r.top + scrollY, w: innerWidth, h: sel === "body" ? r.height : Math.min(r.height, pb - (r.top + scrollY) + 28) }; }, raiz);
    const h = Math.min(caja.h, c.maxH || 900);
    const clip = { x: 0, y: c.nav ? 0 : caja.y, width: caja.w, height: h };
    await p.screenshot({ path: path.join(here, "capturas", c.n + ".png"), fullPage: true, clip });
    const ms = [];
    for (const [num, loc, dx = 0, dy = 0] of c.marks || []) {
      let bb;
      try { bb = await p.locator(loc).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; }, null, { timeout: 4000 }); } catch { console.log("  marca sin ubicar", c.n, num, loc); continue; }
      if (bb.y + (dy || 0) - clip.y > clip.height) { console.log("  marca fuera del recorte", c.n, num); continue; }
      ms.push([num, +(((bb.x + dx) / clip.width) * 100).toFixed(2), +(((bb.y - clip.y + dy) / clip.height) * 100).toFixed(2)]);
    }
    fs.mkdirSync(path.join(here, "capturas/textos"), { recursive: true });
    fs.writeFileSync(path.join(here, "capturas/textos", c.n + ".txt"), await p.evaluate(() => document.querySelector(".ps-main").innerText));
    marcas[c.n] = { ms, ratio: +(clip.height / clip.width).toFixed(4) };
    console.log("ok", c.n, Math.round(clip.height));
  } catch (e) { console.log("FALLO", c.n, e.message.split("\n")[0]); }
  await ctx.close();
}
fs.writeFileSync(mf, JSON.stringify(marcas, null, 1));
await b.close();
