import { chromium } from "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/519be8fa-3f90-41c1-9488-e21afcaa3e74/scratchpad/cap/node_modules/playwright-core/index.mjs";
import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, "manual-aluna-planeacion.pdf");
const b = await chromium.launch({ executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", headless: true });
const p = await b.newPage({ viewport: { width: 816, height: 1056 } });
await p.goto("file://" + path.join(here, "manual-aluna-planeacion.html"), { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);
// Desbordes: el contenido de .body no debe pasar de su caja
const over = await p.evaluate(() => [...document.querySelectorAll(".pg")].map((pg, i) => { const b = pg.querySelector(".body"); return b ? { n: i + 1, sh: b.scrollHeight, ch: b.clientHeight } : null; }).filter((x) => x && x.sh > x.ch + 1));
console.log("Desbordes:", over.length ? JSON.stringify(over) : "ninguno");
const fonts = await p.evaluate(() => ["Fraunces", "Open Sans", "Barlow Condensed"].map((f) => f + ":" + document.fonts.check(`16px "${f}"`)));
console.log("Fuentes:", fonts.join(" "));
await p.pdf({ path: out, width: "816px", height: "1056px", printBackground: true, preferCSSPageSize: true });
console.log("PDF:", out);
await b.close();
