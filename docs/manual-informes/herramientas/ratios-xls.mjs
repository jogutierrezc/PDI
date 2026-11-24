// Calcula la proporción alto/ancho de cada captura xls-*.png y la guarda en marcas-xls.json (sin marcas).
import { execSync } from "node:child_process"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = {};
for (const f of fs.readdirSync(path.join(here, "capturas")).filter((x) => /^xls-.*\.png$/.test(x))) {
  const s = execSync(`sips -g pixelWidth -g pixelHeight "${path.join(here, "capturas", f)}"`).toString();
  const w = +s.match(/pixelWidth: (\d+)/)[1], h = +s.match(/pixelHeight: (\d+)/)[1];
  out[f.replace(/\.png$/, "")] = { ms: [], ratio: +(h / w).toFixed(4) };
}
fs.writeFileSync(path.join(here, "marcas-xls.json"), JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, "imágenes");
