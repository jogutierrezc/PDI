// Comprueba el PDF: páginas, tamaño, fuentes incrustadas (pdf.js) y genera hojas de contacto de páginas pedidas.
// Uso: node verificar-pdf.mjs [pagina,pagina,...]  -> /tmp/pdfpg.png
import { chromium } from "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/519be8fa-3f90-41c1-9488-e21afcaa3e74/scratchpad/pw/node_modules/playwright-core/index.mjs";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const R = "/Users/coordinadorinteligenciadenegocios/Documents/PDI/";
const D = R + "docs/manual-informes/";
const pdf = fs.readFileSync(D + "manual-informes.pdf");
const pidas = (process.argv[2] || "1,2").split(",").map(Number);
const srv = http.createServer((q, r) => {
  if (q.url === "/x") { r.writeHead(200, { "content-type": "text/html" }); return r.end("<html><body></body></html>"); }
  const f = q.url === "/pdf" ? D + "manual-informes.pdf" : R + "node_modules/pdfjs-dist/build/" + q.url.slice(1);
  try { const b = fs.readFileSync(f); r.writeHead(200, { "content-type": f.endsWith(".mjs") ? "text/javascript" : "application/octet-stream", "access-control-allow-origin": "*" }); r.end(b); } catch { r.writeHead(404); r.end(); }
}).listen(5871);
const br = await chromium.launch({ executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", headless: true });
const p = await br.newPage({ viewport: { width: 1800, height: 900 } });
await p.goto("http://localhost:5871/x"); 
const res = await p.evaluate(async (pidas) => {
  const pdfjs = await import("http://localhost:5871/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "http://localhost:5871/pdf.worker.mjs";
  const doc = await pdfjs.getDocument({ url: "http://localhost:5871/pdf" }).promise;
  const fuentes = new Set(), noInc = new Set();
  const out = { paginas: doc.numPages, imgs: [] };
  const pg1 = await doc.getPage(1); const vp = pg1.getViewport({ scale: 1 }); out.tam = [vp.width, vp.height];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i); await pg.getOperatorList();
    const ol = await pg.getOperatorList();
    ol.fnArray.forEach((fn, j) => { if (fn === pdfjs.OPS.setFont) { const id = ol.argsArray[j][0]; try { const f = pg.commonObjs.get(id); fuentes.add((f.name || id) + (f.isType3Font ? " [Type3]" : "") + (f.data ? ` [incrustada ${f.data.length} B]` : f.systemFontInfo ? " [SISTEMA]" : "")); } catch {} } });
    if (pidas.includes(i)) {
      const v = pg.getViewport({ scale: 1.3 }); const c = document.createElement("canvas"); c.width = v.width; c.height = v.height;
      await pg.render({ canvasContext: c.getContext("2d"), viewport: v }).promise; out.imgs.push(c.toDataURL("image/png"));
    }
  }
  out.fuentes = [...fuentes];
  const tc = await (await doc.getPage(8)).getTextContent(); out.texto = tc.items.map((x) => x.str).join(" ").slice(0, 160);
  out.outline = (await doc.getOutline())?.length ?? 0;
  return out;
}, pidas);
console.log("Páginas:", res.paginas, "Tamaño pt:", res.tam.map((x) => x.toFixed(1)).join(" × "), "(Carta = 612 × 792)");
console.log("Texto p8:", res.texto, "| marcadores:", res.outline);
console.log("Fuentes:", res.fuentes.join(" | "));
const h = `<body style="margin:0;background:#778;display:grid;grid-template-columns:repeat(${Math.min(3, res.imgs.length)},1fr);gap:8px;padding:8px">${res.imgs.map((x) => `<img src="${x}" style="width:100%">`).join("")}</body>`;
const q = await br.newPage({ viewport: { width: 1800, height: 900 } }); await q.setContent(h); await q.waitForTimeout(500);
await q.screenshot({ path: "/tmp/pdfpg.png", fullPage: true });
await br.close(); srv.close();
