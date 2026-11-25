import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url"; import { join, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch({ executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" });
const p = await b.newPage();
await p.goto(pathToFileURL(join(here, "video.html")).href + "?render"); await p.evaluate(() => window.__ready);
console.log(await p.evaluate(() => ({ n: WS.length, a: words("bienvenido al informe de gestion"), w0: WS.slice(0,6).map(x=>x.n), f: find(words("bienvenido al informe de gestion"), 0, WS.length), I0: JSON.stringify(I0) })));
await b.close();
