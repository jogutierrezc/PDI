// Captura páginas del manual HTML a PNG: node paginas.mjs 1 5 12  -> /tmp-scratch/pag-N.png
import { chromium } from "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/519be8fa-3f90-41c1-9488-e21afcaa3e74/scratchpad/pw/node_modules/playwright-core/index.mjs";
import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/519be8fa-3f90-41c1-9488-e21afcaa3e74/scratchpad/pag";
import fs from "node:fs"; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", headless: true });
const p = await b.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 1 });
await p.goto("file://" + path.join(here, "manual-informes.html"), { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
for (const n of process.argv.slice(2)) { const el = p.locator("#p" + n); await el.screenshot({ path: path.join(out, "pag-" + n + ".png") }); console.log(path.join(out, "pag-" + n + ".png")); }
await b.close();
