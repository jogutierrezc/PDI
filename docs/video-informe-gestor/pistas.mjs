import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url"; import { join, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch({ executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" });
const p = await b.newPage(); await p.goto(pathToFileURL(join(here, "video.html")).href + "?render"); await p.evaluate(() => window.__ready);
const r = await p.evaluate(() => { const seen = new Set(); return window.__pistas.filter(x => { const k = x.id + x.phrase; if (seen.has(k)) return false; seen.add(k); return true; }); });
for (const x of r) console.log(x.id, x.t.toFixed(1).padStart(6), "|", x.phrase.padEnd(34), "|", x.ctx);
await b.close();
