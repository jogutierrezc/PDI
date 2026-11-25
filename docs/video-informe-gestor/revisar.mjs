import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url"; import { join, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch({ executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; p.on("pageerror", e => errs.push("PAGE " + e.message)); p.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
await p.goto(pathToFileURL(join(here, "video.html")).href + "?render"); await p.evaluate(() => window.__ready);
console.log("dur", await p.evaluate(() => window.__dur)); { const a = await p.evaluate(() => [...new Set(window.__avisos)]); console.log("avisos únicos:", a.length); console.log(a.join(" | ")); }
console.log("inicios", JSON.stringify(await p.evaluate(() => Object.fromEntries(Object.entries(I0).map(([k, v]) => [k, +WS[v].s.toFixed(1)])))));
console.log("errores:", errs.filter(e => !/fonts|PISTAS/.test(e)).length, errs.filter(e => !/fonts|PISTAS/.test(e)).slice(0,3));
await b.close();
