// Convierte una hoja de un .xlsx en HTML fiel (anchos, rellenos, fuentes, combinadas, listas desplegables,
// pestañas) con un marco tipo ventana de Excel. Se usa desde capturar-excel.mjs.
import ExcelJS from "exceljs";

const PX_COL = (w) => Math.round((w ?? 8.43) * 7 + 5);
const PT = (pt) => Math.round((pt * 4) / 3);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LETRA = (n) => {
  let s = "";
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const argb = (c) => (c?.argb && c.argb.length === 8 ? `#${c.argb.slice(2)}` : null);

export function textoDe(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v).replace(".", ",");
  if (typeof v === "boolean") return v ? "VERDADERO" : "FALSO";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return textoDe(v.result);
    if (v.text !== undefined) return textoDe(v.text);
    if (v.hyperlink) return v.hyperlink;
  }
  return "";
}

export async function abrir(ruta) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  return wb;
}

function lista(dv, wb) {
  const f = dv?.formulae?.[0];
  if (dv?.type !== "list" || typeof f !== "string") return null;
  if (f.startsWith('"')) return { tipo: "texto", items: f.slice(1, -1).split(",") };
  const m = /^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+):\$?[A-Z]+\$?(\d+)$/.exec(f);
  if (m) {
    const hoja = wb.getWorksheet(m[1]);
    const col = m[2].split("").reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
    const items = [];
    if (hoja) for (let r = Number(m[3]); r <= Number(m[4]); r++) { const t = textoDe(hoja.getCell(r, col).value); if (t) items.push(t); }
    return { tipo: "rango", hoja: m[1], items };
  }
  return null;
}

/**
 * Una hoja como HTML. opciones: { columnas: [desde, hasta] (índices desde 0), filasLibres (extra bajo los datos, 4),
 * marcar: ["C8", ...] (celdas con error), nuevo: ["A12"] (celdas con aviso informativo), titulo (nombre del archivo),
 * ocultas: mostrar hojas ocultas como pestañas punteadas (true) }
 */
export function hojaAHtml(wb, nombreHoja, o = {}) {
  const ws = wb.getWorksheet(nombreHoja);
  if (!ws) throw new Error(`No existe la hoja ${nombreHoja}`);
  const nCol = Math.max(ws.columnCount, 1);
  const [c0, c1] = o.columnas ?? [0, nCol - 1];
  let ultimaConValor = 0;
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    let hay = false;
    row.eachCell({ includeEmpty: false }, (c) => { if (textoDe(c.value) !== "") hay = true; });
    if (hay) ultimaConValor = n;
  });
  const hasta = Math.min(ws.rowCount, ultimaConValor + (o.filasLibres ?? 4));
  const anchos = [];
  for (let c = 0; c < nCol; c++) anchos.push(PX_COL(ws.getColumn(c + 1).width));
  const merges = new Map(); // "r,c" -> {r2, c2}
  const cubiertas = new Set();
  for (const m of ws.model.merges ?? []) {
    const [a, b] = m.split(":");
    const dec = (x) => { const g = /([A-Z]+)(\d+)/.exec(x); return [Number(g[2]), g[1].split("").reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1]; };
    const [r1, cc1] = dec(a);
    const [r2, cc2] = dec(b);
    merges.set(`${r1},${cc1}`, { r2, c2: cc2 });
    for (let r = r1; r <= r2; r++) for (let c = cc1; c <= cc2; c++) if (r !== r1 || c !== cc1) cubiertas.add(`${r},${c}`);
  }
  const marcar = new Set((o.marcar ?? []).map((x) => x.toUpperCase()));
  const nuevo = new Set((o.nuevo ?? []).map((x) => x.toUpperCase()));
  const validadas = new Map(); // columna -> lista
  const alturaFila = (r) => { const h = ws.getRow(r).height; return h ? PT(h) : null; };

  let filas = "";
  for (let r = 1; r <= hasta; r++) {
    const h = alturaFila(r);
    let tds = `<th class="rn">${r}</th>`;
    for (let c = c0; c <= c1; c++) {
      if (cubiertas.has(`${r},${c}`) && !(merges.has(`${r},${c}`))) {
        // celda cubierta por una combinada cuyo origen está dentro del rango visible: se omite
        let dentro = false;
        for (const [k, m] of merges) { const [mr, mc] = k.split(",").map(Number); if (mr <= r && r <= m.r2 && mc <= c && c <= m.c2 && mc >= c0) dentro = true; }
        if (dentro) continue;
      }
      const cel = ws.getCell(r, c + 1);
      const mg = merges.get(`${r},${c}`);
      let colspan = 1, rowspan = 1;
      if (mg) { colspan = Math.min(mg.c2, c1) - c + 1; rowspan = mg.r2 - r + 1; }
      const fondo = argb(cel.fill?.fgColor);
      const f = cel.font ?? {};
      const al = cel.alignment ?? {};
      const est = [];
      if (fondo) est.push(`background:${fondo}`);
      if (argb(f.color)) est.push(`color:${argb(f.color)}`);
      if (f.bold) est.push("font-weight:700");
      if (f.italic) est.push("font-style:italic");
      if (f.size) est.push(`font-size:${(f.size * 4) / 3}px`);
      est.push(`vertical-align:${al.vertical === "middle" ? "middle" : al.vertical === "top" ? "top" : "bottom"}`);
      if (al.indent) est.push(`padding-left:${5 + al.indent * 9}px`);
      const texto = textoDe(cel.value);
      const wrap = al.wrapText;
      const dir = `${LETRA(c)}${r}`;
      const cls = ["c", wrap ? "w" : "nw"];
      if (marcar.has(dir)) cls.push("err");
      if (nuevo.has(dir)) cls.push("nuevo");
      const dv = cel.dataValidation;
      let flecha = "";
      if (dv && dv.type === "list") {
        if (!validadas.has(c)) validadas.set(c, lista(dv, wb));
        if (r > 4 || !o.sinBanner) flecha = '<i class="dd">▾</i>';
      }
      const num = typeof cel.value === "number";
      if (num) est.push("text-align:right");
      tds += `<td class="${cls.join(" ")}" colspan="${colspan}" rowspan="${rowspan}" style="${est.join(";")}"><div class="t">${esc(texto)}</div>${flecha}${marcar.has(dir) ? '<b class="mk"></b>' : ""}</td>`;
    }
    filas += `<tr${h ? ` style="height:${h}px"` : ""}>${tds}</tr>`;
  }
  const cols = Array.from({ length: c1 - c0 + 1 }, (_, i) => `<col style="width:${anchos[c0 + i]}px">`).join("");
  const letras = `<th class="corner"></th>` + Array.from({ length: c1 - c0 + 1 }, (_, i) => `<th class="cl">${LETRA(c0 + i)}</th>`).join("");
  const ancho = 46 + anchos.slice(c0, c1 + 1).reduce((a, b) => a + b, 0);

  // Logo (solo si cae en el rango visible)
  let logo = "";
  if (c0 === 0) {
    for (const im of ws.getImages?.() ?? []) {
      const media = wb.getImage(Number(im.imageId));
      const tl = im.range?.tl;
      const ext = im.range?.ext;
      if (!media?.buffer || !tl) continue;
      const left = 46 + Math.round((tl.nativeCol ?? tl.col ?? 0) * anchos[0]) + 0;
      const alto1 = alturaFila(1) ?? 20;
      const top = 24 + Math.round((tl.nativeRow ?? tl.row ?? 0) * alto1);
      const w = ext?.width ?? 120, h = ext?.height ?? 34;
      logo += `<img class="logo" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px" src="data:image/${media.extension || "png"};base64,${Buffer.from(media.buffer).toString("base64")}">`;
    }
  }

  // Notas de listas desplegables
  const nombresCol = (c) => textoDe(ws.getCell(o.filaEncabezado ?? (ws.getCell(1, 1).fill?.fgColor?.argb === "FF014898" ? 4 : 1), c + 1).value);
  const notas = [];
  for (const [c, l] of validadas) {
    if (!l || c < c0 || c > c1) continue;
    const lbl = nombresCol(c);
    const items = l.items.length > 8 ? `${l.items.slice(0, 8).join(" · ")} · …` : l.items.join(" · ");
    notas.push(`<span class="nota"><i class="dd2">▾</i> <b>${esc(lbl)}</b>: ${esc(items)}${l.tipo === "rango" ? ` <em>(lista de la hoja ${esc(l.hoja)})</em>` : ""}</span>`);
  }

  // Pestañas
  const todas = wb.worksheets.map((w) => ({ n: w.name, oculta: w.state !== "visible" }));
  const mostrar = todas.filter((t) => o.ocultas !== false || !t.oculta);
  const est = (t) => 34 + t.n.length * 7.3;
  const idxAct = mostrar.findIndex((t) => t.n === nombreHoja);
  const anchoWin = Math.max(ancho, o.anchoMin ?? 1180);
  const maxAncho = anchoWin - 150;
  let ini = 0;
  const cabe = (a, b) => mostrar.slice(a, b + 1).reduce((s, t) => s + est(t), 0) <= maxAncho;
  while (ini < idxAct && !cabe(ini, idxAct)) ini++;
  let fin = idxAct;
  while (fin + 1 < mostrar.length && cabe(ini, fin + 1)) fin++;
  const tabs = mostrar
    .slice(ini, fin + 1)
    .map((t) => `<span class="tab${t.n === nombreHoja ? " act" : ""}${t.oculta ? " ocu" : ""}">${esc(t.n)}${t.oculta ? " <small>oculta</small>" : ""}</span>`)
    .join("");
  const hayOcultaVisible = mostrar.slice(ini, fin + 1).some((t) => t.oculta);
  const ocultaEsta = ws.state !== "visible";

  return `<div class="win" style="width:${anchoWin}px">
  <div class="tit"><span class="pts"><i></i><i></i><i></i></span><span class="nom">${esc(o.titulo ?? "Libro.xlsx")}</span></div>
  <div class="gw"><table class="g" style="width:${ancho}px"><colgroup><col style="width:46px">${cols}</colgroup><thead><tr>${letras}</tr></thead><tbody>${filas}</tbody></table>${logo}</div>
  ${ocultaEsta ? '<div class="aviso-ocu">Hoja oculta: en Excel no se ve en las pestañas (clic derecho · Mostrar). El sistema la usa para leer el libro.</div>' : ""}
  ${notas.length ? `<div class="notas">${notas.join("")}</div>` : ""}
  <div class="tb"><span class="fl">◂ ▸</span>${tabs}${ini > 0 || fin < mostrar.length - 1 ? '<span class="mas">…</span>' : ""}${hayOcultaVisible ? '<span class="lg">Punteadas: hojas ocultas</span>' : ""}</div>
</div>`;
}

export const CSS = `
*{box-sizing:border-box}
body{margin:0;padding:18px;background:#e9edf2;font-family:Aptos,Calibri,Carlito,"Segoe UI","Helvetica Neue",Arial,sans-serif;color:#1b1b1b;width:max-content}
.win{background:#fff;border:1px solid #b9c0c9;border-radius:9px;overflow:hidden;box-shadow:0 6px 22px rgba(20,40,70,.18)}
.tit{height:34px;background:linear-gradient(#f6f7f9,#e9ecf0);border-bottom:1px solid #cfd5dc;display:flex;align-items:center;position:relative}
.pts{display:flex;gap:7px;padding-left:13px}.pts i{width:12px;height:12px;border-radius:50%;background:#c9ced6;display:block}
.pts i:nth-child(1){background:#ee6a5f}.pts i:nth-child(2){background:#f4be4f}.pts i:nth-child(3){background:#61c554}
.nom{position:absolute;left:0;right:0;text-align:center;font-size:13px;color:#4a525c;font-weight:600}
.gw{position:relative;background:#fff}
table.g{border-collapse:collapse;table-layout:fixed;font-size:14.5px}
table.g th{background:#f0f2f4;color:#5a626c;font-weight:500;font-size:12.5px;border:1px solid #d3d7dc;height:24px;padding:0 4px;text-align:center}
table.g th.rn{background:#f0f2f4;width:46px;height:auto}
table.g th.corner{background:#f0f2f4}
table.g td{border:1px solid #dadde1;padding:2px 5px;height:20px;position:relative;overflow:hidden;line-height:1.25}
td.nw .t{white-space:nowrap;overflow:hidden}
td.w .t{white-space:pre-wrap;word-break:break-word}
td.err{outline:2.5px solid #d6293e;outline-offset:-2px;z-index:2}
td.nuevo{outline:2.5px solid #1f7ae0;outline-offset:-2px;z-index:2}
.dd{position:absolute;right:2px;bottom:2px;width:16px;height:16px;border:1px solid #b9bec5;background:#f6f7f9;color:#4a525c;font-size:11px;line-height:14px;text-align:center;font-style:normal;border-radius:2px;opacity:.9}
.logo{position:absolute;z-index:3}
.notas{background:#f7f8fa;border-top:1px solid #dfe3e8;padding:7px 12px;font-size:12.5px;color:#39424d;display:flex;flex-wrap:wrap;gap:4px 22px}
.nota em{color:#6a7480;font-style:normal}.dd2{font-style:normal;border:1px solid #b9bec5;background:#fff;padding:0 3px;border-radius:2px;font-size:10px}
.aviso-ocu{background:#fff7e0;border-top:1px solid #ecd9a0;color:#6b5311;font-size:12.5px;padding:6px 12px}
.tb{background:#f0f2f4;border-top:1px solid #cfd5dc;height:36px;display:flex;align-items:flex-end;padding:0 8px;gap:2px;font-size:12.5px;white-space:nowrap;overflow:hidden}
.fl{color:#8a929c;padding:0 10px 8px 4px;letter-spacing:3px;align-self:center}
.tab{padding:6px 13px;color:#3d4650;border:1px solid transparent;border-bottom:none;border-radius:4px 4px 0 0;margin-bottom:0}
.tab.act{background:#fff;color:#107c41;font-weight:700;border-color:#cfd5dc;border-bottom:3px solid #107c41;margin-top:3px;padding-bottom:5px}
.tab.ocu{border:1px dashed #9aa3ae;border-bottom:none;color:#6b7480;font-style:italic;background:#f7f8fa}
.tab.ocu.act{background:#fff;color:#107c41}
.tab small{font-size:10.5px;color:#9a6a00;font-style:normal;font-weight:600;margin-left:2px}
.mas{align-self:center;color:#8a929c;padding:0 8px 6px}
.lg{margin-left:auto;align-self:center;color:#6b7480;padding:0 8px 6px;font-size:11.5px}
`;

export const pagina = (cuerpo) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${cuerpo}</body></html>`;
