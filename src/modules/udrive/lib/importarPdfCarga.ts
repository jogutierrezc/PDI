/* =============================================================================
   UDrive · carga de pdf.js para importar un PDF como informe.

   Es el único archivo de UDrive que nombra `pdfjs-dist`, y solo por `import()`
   dinámico (la librería y su worker quedan en trozos aparte). Por cada página
   saca tres cosas y las entrega a lib/importarPdf.ts, que no sabe de pdf.js:

   - el texto, con posición, tamaño y negrita (el nombre real de la fuente sale
     de `commonObjs` una vez leída la lista de operadores);
   - las cajas de las imágenes incrustadas y los trazos vectoriales (líneas,
     rectángulos, formas), llevando la matriz de transformación de la página
     (save / restore / transform / formularios) para dejarlos en el espacio
     del PDF;
   - después del análisis, el recorte de cada figura desde el render de su
     página a doble resolución (para una gráfica vectorial es la única vía).

   Se trabaja página por página y se cede el control entre páginas para no
   congelar la pantalla; el render se libera apenas se recortan sus figuras.
   ========================================================================== */

import type { Elemento, ImagenExtraida } from "./importar";
import { analizarPdf } from "./importarPdf";
import type { Caja, FiguraPdf, ItemPdf, PaginaPdf, Trazo } from "./importarPdf";

export const MAX_PAGINAS = 150;
const MAX_TRAZOS = 40_000;
const ESCALA = 2;
const LADO_MAX = 3600;

type Matriz = [number, number, number, number, number, number];
const IDENTIDAD: Matriz = [1, 0, 0, 1, 0, 0];

/** Aplica `a` y luego `b` (convención de PDF: x' = a·x + c·y + e). */
const mul = (a: Matriz, b: Matriz): Matriz => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
const punto = (m: Matriz, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const cajaDe = (puntos: [number, number][]): Caja => ({
  x0: Math.min(...puntos.map((p) => p[0])),
  y0: Math.min(...puntos.map((p) => p[1])),
  x1: Math.max(...puntos.map((p) => p[0])),
  y1: Math.max(...puntos.map((p) => p[1])),
});

const cederPaso = () => new Promise<void>((r) => window.setTimeout(r, 0));

export interface ResultadoPdfCargado {
  elementos: Elemento[];
  avisos: string[];
  descartes: string[];
  paginas: number;
  portada?: { titulo: string; subtitulo: string };
}

export async function leerPdf(archivo: File, alProgreso?: (texto: string) => void): Promise<ResultadoPdfCargado> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const OPS = pdfjs.OPS as unknown as Record<string, number>;
  const tarea = pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) });
  const doc = await tarea.promise;
  const avisos: string[] = [];
  try {
    const total = Math.min(doc.numPages, MAX_PAGINAS);
    if (doc.numPages > MAX_PAGINAS) avisos.push(`El PDF tiene ${doc.numPages} páginas: se leyeron las primeras ${MAX_PAGINAS}. Divídalo para importar el resto.`);

    const pintan = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
    const rellenan = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
    const trazan = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
    const imagenOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].filter((x) => typeof x === "number"));

    const paginas: PaginaPdf[] = [];
    let rotadas = 0;
    let densas = 0;
    for (let n = 1; n <= total; n++) {
      alProgreso?.(`Leyendo el PDF… página ${n} de ${total}`);
      const page = await doc.getPage(n);
      if (page.rotate) rotadas++;
      const [vx0, vy0, vx1, vy1] = page.view as number[];
      const caja: Caja = { x0: Math.min(vx0, vx1), y0: Math.min(vy0, vy1), x1: Math.max(vx0, vx1), y1: Math.max(vy0, vy1) };

      // 1) La lista de operadores primero: así las fuentes quedan cargadas para saber cuáles son negritas.
      const ops = await page.getOperatorList();
      const imagenes: Caja[] = [];
      const trazos: Trazo[] = [];
      let m: Matriz = IDENTIDAD;
      const pila: Matriz[] = [];
      let lleno = false;
      for (let k = 0; k < ops.fnArray.length; k++) {
        const fn = ops.fnArray[k];
        const args = ops.argsArray[k] as unknown[] | undefined;
        if (fn === OPS.save) pila.push(m);
        else if (fn === OPS.restore) m = pila.pop() ?? IDENTIDAD;
        else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) m = mul(args.slice(0, 6) as Matriz, m);
        else if (fn === OPS.paintFormXObjectBegin) {
          pila.push(m);
          const mat = Array.isArray(args) && Array.isArray(args[0]) && (args[0] as number[]).length >= 6 ? ((args[0] as number[]).slice(0, 6) as Matriz) : null;
          if (mat) m = mul(mat, m);
        } else if (fn === OPS.paintFormXObjectEnd) m = pila.pop() ?? IDENTIDAD;
        else if (imagenOps.has(fn)) {
          imagenes.push(cajaDe([punto(m, 0, 0), punto(m, 1, 0), punto(m, 0, 1), punto(m, 1, 1)]));
        } else if (fn === OPS.constructPath && Array.isArray(args) && !lleno) {
          const op = args[0];
          const datos = (args[1] as unknown[] | undefined)?.[0] as ArrayLike<number> | null | undefined;
          if (typeof op !== "number" || !pintan.has(op) || !datos || typeof datos.length !== "number") continue;
          if (trazos.length > MAX_TRAZOS) {
            lleno = true;
            densas++;
            continue;
          }
          trazarCamino(datos, m, rellenan.has(op), trazan.has(op), trazos);
        }
      }

      // 2) El texto.
      const contenido = await page.getTextContent();
      const negritas = new Map<string, boolean>();
      const esNegrita = (id: string): boolean => {
        const previa = negritas.get(id);
        if (previa !== undefined) return previa;
        let b = false;
        let resuelta = false;
        try {
          if (page.commonObjs.has(id)) {
            const f = page.commonObjs.get(id) as { name?: string; bold?: boolean; black?: boolean } | null;
            b = Boolean(f?.bold || f?.black) || /bold|black|heavy|semibold|demi|negrit/i.test(String(f?.name ?? ""));
            resuelta = true;
          }
        } catch {
          /* la fuente aún no está resuelta */
        }
        if (!resuelta) b = /bold|black|heavy/i.test(String(contenido.styles?.[id]?.fontFamily ?? ""));
        else negritas.set(id, b);
        return b;
      };
      const items: ItemPdf[] = [];
      for (const it of contenido.items) {
        if (!("str" in it)) continue;
        const t = it.transform as number[];
        const tam = Math.hypot(t[0], t[1]);
        if (!it.str.trim() || !(tam > 0)) continue;
        items.push({ texto: it.str, x: t[4], y: t[5], ancho: it.width, tam, negrita: esNegrita(it.fontName) });
      }
      paginas.push({ numero: n, caja, items, imagenes, trazos });
      page.cleanup();
      await cederPaso();
    }
    if (rotadas) avisos.push(`${rotadas} ${rotadas === 1 ? "página está girada" : "páginas están giradas"}: el orden de lectura puede salir alterado.`);
    if (densas) avisos.push(`${densas} ${densas === 1 ? "página trae" : "páginas traen"} dibujos muy densos: algunas figuras pueden salir recortadas de más.`);

    alProgreso?.("Ordenando el contenido del PDF…");
    await cederPaso();
    const r = analizarPdf(paginas);
    if (r.escaneado) throw new Error("Este PDF es una imagen: no trae texto que leer. Use el Word original o un PDF con texto.");
    avisos.push(...r.avisos);

    // 3) Recortar las figuras, página por página.
    const porPagina = new Map<number, { elemento: Extract<Elemento, { t: "imagen" }>; figura: FiguraPdf }[]>();
    for (const f of r.figuras) porPagina.set(f.figura.pagina, [...(porPagina.get(f.figura.pagina) ?? []), f]);
    let hechas = 0;
    let fallidas = 0;
    for (const [numero, lista] of porPagina) {
      alProgreso?.(`Recortando figuras… ${hechas} de ${r.figuras.length}`);
      const page = await doc.getPage(numero);
      let lienzo: HTMLCanvasElement | null = null;
      try {
        let escala = ESCALA;
        const base = page.getViewport({ scale: 1 });
        if (Math.max(base.width, base.height) * escala > LADO_MAX) escala = LADO_MAX / Math.max(base.width, base.height);
        const vista = page.getViewport({ scale: escala });
        lienzo = document.createElement("canvas");
        lienzo.width = Math.max(1, Math.ceil(vista.width));
        lienzo.height = Math.max(1, Math.ceil(vista.height));
        const ctx = lienzo.getContext("2d");
        if (!ctx) throw new Error("sin lienzo");
        await page.render({ canvasContext: ctx, canvas: lienzo, viewport: vista, background: "rgb(255,255,255)" }).promise;
        for (const { elemento, figura } of lista) {
          try {
            const [ax, ay] = vista.convertToViewportPoint(figura.caja.x0, figura.caja.y0) as [number, number];
            const [bx, by] = vista.convertToViewportPoint(figura.caja.x1, figura.caja.y1) as [number, number];
            const sx = Math.max(0, Math.floor(Math.min(ax, bx)));
            const sy = Math.max(0, Math.floor(Math.min(ay, by)));
            const sw = Math.min(lienzo.width - sx, Math.ceil(Math.abs(bx - ax)));
            const sh = Math.min(lienzo.height - sy, Math.ceil(Math.abs(by - ay)));
            if (sw < 24 || sh < 24) throw new Error("recorte vacío");
            elemento.imagen = await recortar(lienzo, sx, sy, sw, sh, figura.origen === "pdf-imagen");
            elemento.pagina = numero;
          } catch {
            fallidas++;
          }
          hechas++;
        }
      } catch {
        fallidas += lista.length;
      } finally {
        if (lienzo) lienzo.width = lienzo.height = 0;
        page.cleanup();
      }
      await cederPaso();
    }
    if (fallidas) avisos.push(`${fallidas} ${fallidas === 1 ? "figura no se pudo recortar" : "figuras no se pudieron recortar"}: quedan como imagen pendiente.`);

    return { elementos: r.elementos, avisos, descartes: r.descartes, paginas: doc.numPages, portada: r.portada };
  } finally {
    await tarea.destroy();
  }
}

/** Decodifica un camino de pdf.js (moveTo=0, lineTo=1, curveTo=2, quadraticCurveTo=3, closePath=4) a trazos en el espacio del PDF. */
function trazarCamino(datos: ArrayLike<number>, m: Matriz, relleno: boolean, borde: boolean, salida: Trazo[]) {
  const sub: [number, number][][] = [];
  let actual: [number, number][] = [];
  let curvo = false;
  let cerrado = false;
  const todos: [number, number][] = [];
  const cerrar = () => {
    if (actual.length) sub.push(actual);
    actual = [];
  };
  for (let i = 0; i < datos.length; ) {
    const op = datos[i++];
    if (op === 0) {
      cerrar();
      const p = punto(m, datos[i++], datos[i++]);
      actual.push(p);
      todos.push(p);
    } else if (op === 1) {
      const p = punto(m, datos[i++], datos[i++]);
      actual.push(p);
      todos.push(p);
    } else if (op === 2) {
      curvo = true;
      for (let q = 0; q < 3; q++) todos.push(punto(m, datos[i++], datos[i++]));
    } else if (op === 3) {
      curvo = true;
      for (let q = 0; q < 2; q++) todos.push(punto(m, datos[i++], datos[i++]));
    } else if (op === 4) cerrado = true;
    else break;
  }
  cerrar();
  if (!todos.length) return;
  const total = cajaDe(todos);
  if (curvo) {
    salida.push({ t: "forma", caja: total });
    return;
  }
  const eje = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) < 0.6 || Math.abs(a[1] - b[1]) < 0.6;
  let sinEjes = false;
  for (const s of sub) {
    const rect = s.length >= 4 && s.length <= 5 && s.every((p, k) => k === 0 || eje(s[k - 1], p));
    if (rect && (cerrado || relleno || s.length === 5)) {
      const c = cajaDe(s);
      const w = c.x1 - c.x0;
      const h = c.y1 - c.y0;
      if (h <= 2.2 && w >= 8) salida.push({ t: "h", caja: { x0: c.x0, x1: c.x1, y0: (c.y0 + c.y1) / 2, y1: (c.y0 + c.y1) / 2 } });
      else if (w <= 2.2 && h >= 8) salida.push({ t: "v", caja: { x0: (c.x0 + c.x1) / 2, x1: (c.x0 + c.x1) / 2, y0: c.y0, y1: c.y1 } });
      else if (w > 2.2 && h > 2.2) salida.push({ t: "rect", caja: c, relleno, borde });
      continue;
    }
    for (let k = 1; k < s.length; k++) {
      const a = s[k - 1];
      const b = s[k];
      if (Math.abs(a[1] - b[1]) < 0.6 && Math.abs(a[0] - b[0]) >= 6) salida.push({ t: "h", caja: { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: a[1], y1: a[1] } });
      else if (Math.abs(a[0] - b[0]) < 0.6 && Math.abs(a[1] - b[1]) >= 6) salida.push({ t: "v", caja: { x0: a[0], x1: a[0], y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) } });
      else if (Math.abs(a[0] - b[0]) >= 0.6 && Math.abs(a[1] - b[1]) >= 0.6) sinEjes = true;
    }
  }
  if (sinEjes) salida.push({ t: "forma", caja: total });
}

async function recortar(origen: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, foto: boolean): Promise<ImagenExtraida> {
  const lienzo = document.createElement("canvas");
  lienzo.width = sw;
  lienzo.height = sh;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("sin lienzo");
  ctx.drawImage(origen, sx, sy, sw, sh, 0, 0, sw, sh);
  const jpeg = foto && sw * sh > 700_000;
  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, jpeg ? "image/jpeg" : "image/png", 0.9));
  lienzo.width = lienzo.height = 0;
  if (!blob) throw new Error("sin imagen");
  return { blob, mime: jpeg ? "image/jpeg" : "image/png", ancho: sw, alto: sh };
}
