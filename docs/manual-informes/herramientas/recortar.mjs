// Recorta por arriba las capturas muy altas (para que se lean en la página) y ajusta marcas.json.
// Se corre después de `node build.mjs` (que convierte los PNG a JPG) y antes del PDF. Es idempotente.
import { execSync } from "node:child_process"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OBJ = { "ges-dimensiones": 1.2, "adm-responsables": 1.55, "adm-portada": 1.2, "ges-metas": 1.25, "ges-alineacion": 1.25, "vista-carta": 1.2, "vista-a4": 1.2, "adm-libro-exportar": 1.3, "adm-libro-importar": 1.3, "ges-libro": 1.3, "ges-anexos": 1.25 };
const mf = path.join(here, "marcas.json"); const M = JSON.parse(fs.readFileSync(mf, "utf8"));
for (const [n, t] of Object.entries(OBJ)) {
  const f = path.join(here, "imagenes", n + ".jpg"); const info = M[n];
  if (!info || !fs.existsSync(f) || info.ratio <= t + 0.005) continue;
  const w = +execSync(`sips -g pixelWidth "${f}"`).toString().match(/pixelWidth: (\d+)/)[1];
  const h = Math.round(w * t);
  execSync(`sips -c ${h} ${w} --cropOffset 0 0 "${f}" >/dev/null`);
  const k = info.ratio / t;
  info.ms = info.ms.map(([a, x, y]) => [a, x, +(y * k).toFixed(2)]).filter((m) => m[2] <= 96);
  info.ratio = t; console.log("recortada", n, "->", t);
}
fs.writeFileSync(mf, JSON.stringify(M, null, 1));
