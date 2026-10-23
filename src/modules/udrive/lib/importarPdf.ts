/* =============================================================================
   UDrive · analizar un PDF para importarlo como informe (fase 3), sin pdfjs.

   Recibe, por página, lo que lib/importarPdfCarga.ts saca con pdf.js: los
   fragmentos de texto con su posición, tamaño y negrita; las cajas de las
   imágenes incrustadas; y los trazos vectoriales (líneas, rectángulos,
   formas). Todo en el espacio del PDF (y crece hacia arriba). Aquí se arma el
   informe:

   - Figuras: imágenes incrustadas y regiones de dibujo vectorial denso
     (gráficas, mapas, diagramas). El texto de sus ejes y leyendas se queda con
     la figura. Cada figura se recorta después del render de la página.
   - Tablas: por rejilla (líneas y rectángulos) y por alineación de texto
     (ríos de espacio en blanco entre columnas). Un recuadro de una sola celda
     es un cuadro destacado.
   - Texto: orden de lectura con columnas, líneas → párrafos (por separación
     vertical y sangría), listas, títulos por tamaño, negrita y numeración,
     palabras cortadas por guion, y fuera los encabezados y pies repetidos, los
     números de página, la portada y los índices del propio informe.

   Los pies de figura («Tabla 3. …») y las notas se unen a su figura después,
   en lib/importar.ts (`asociarPies`), igual que en Word.
   ========================================================================== */

import { escapar } from "./texto";
import type { Elemento } from "./importar";

/* ---------- el modelo de entrada ------------------------------------------------------------------------ */

export interface Caja {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ItemPdf {
  texto: string;
  x: number;
  /** Línea base. */
  y: number;
  ancho: number;
  tam: number;
  negrita: boolean;
}

export type Trazo =
  | { t: "h" | "v"; caja: Caja }
  | { t: "rect"; caja: Caja; relleno: boolean; borde: boolean }
  | { t: "forma"; caja: Caja };

export interface PaginaPdf {
  numero: number;
  caja: Caja;
  items: ItemPdf[];
  imagenes: Caja[];
  trazos: Trazo[];
}

export interface FiguraPdf {
  pagina: number;
  caja: Caja;
  origen: "pdf-imagen" | "pdf-dibujo";
}

export interface ResultadoAnalisis {
  elementos: Elemento[];
  /** Cada figura con el elemento de imagen al que hay que ponerle el recorte. */
  figuras: { elemento: Extract<Elemento, { t: "imagen" }>; figura: FiguraPdf }[];
  descartes: string[];
  avisos: string[];
  portada?: { titulo: string; subtitulo: string };
  escaneado: boolean;
}

/* ---------- geometría ------------------------------------------------------------------------------------- */

const ancho = (c: Caja) => c.x1 - c.x0;
const alto = (c: Caja) => c.y1 - c.y0;
const area = (c: Caja) => Math.max(0, ancho(c)) * Math.max(0, alto(c));
const interseca = (a: Caja, b: Caja, m = 0) => a.x0 - m < b.x1 && a.x1 + m > b.x0 && a.y0 - m < b.y1 && a.y1 + m > b.y0;
const unir = (a: Caja, b: Caja): Caja => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const contienePunto = (c: Caja, x: number, y: number, m = 0) => x >= c.x0 - m && x <= c.x1 + m && y >= c.y0 - m && y <= c.y1 + m;
const cajaDeItem = (i: ItemPdf): Caja => ({ x0: i.x, x1: i.x + Math.max(i.ancho, 0.1), y0: i.y - i.tam * 0.22, y1: i.y + i.tam * 0.82 });
const centroX = (c: Caja) => (c.x0 + c.x1) / 2;
const centroY = (c: Caja) => (c.y0 + c.y1) / 2;
const mediana = (v: number[]): number => {
  if (!v.length) return 0;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
};
const colapsar = (t: string) => t.replace(/\s+/g, " ").trim();

/* ---------- líneas ---------------------------------------------------------------------------------------- */

interface Seg {
  x0: number;
  x1: number;
  texto: string;
}

interface Linea {
  pagina: number;
  banda: number;
  col: number;
  x0: number;
  x1: number;
  y: number;
  tam: number;
  negrita: boolean;
  texto: string;
  segs: Seg[];
  items: ItemPdf[];
}

function unirItems(items: ItemPdf[]): string {
  let texto = "";
  let prev: ItemPdf | null = null;
  for (const it of items) {
    if (prev) {
      const hueco = it.x - (prev.x + prev.ancho);
      if (hueco > prev.tam * 0.14 && !/\s$/.test(texto) && !/^\s/.test(it.texto)) texto += " ";
    }
    texto += it.texto;
    prev = it;
  }
  return colapsar(texto);
}

function tamDominante(items: ItemPdf[]): number {
  const por = new Map<number, number>();
  for (const it of items) {
    const k = Math.round(it.tam * 2) / 2;
    por.set(k, (por.get(k) ?? 0) + it.texto.trim().length);
  }
  return [...por.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/** Agrupa fragmentos en líneas (por la línea base) y cada línea en segmentos separados por huecos anchos. */
function lineasDe(items: ItemPdf[], pagina: number, banda: number, col: number): Linea[] {
  const utiles = items.filter((i) => i.texto.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const grupos: ItemPdf[][] = [];
  for (const it of utiles) {
    const g = grupos[grupos.length - 1];
    if (g && Math.abs(g[0].y - it.y) <= Math.max(1.6, it.tam * 0.42)) g.push(it);
    else grupos.push([it]);
  }
  const salida: Linea[] = [];
  for (const g of grupos) {
    g.sort((a, b) => a.x - b.x);
    const tam = tamDominante(g);
    const segs: Seg[] = [];
    let actual: ItemPdf[] = [];
    const cerrar = () => {
      if (!actual.length) return;
      const ult = actual[actual.length - 1];
      segs.push({ x0: actual[0].x, x1: ult.x + ult.ancho, texto: unirItems(actual) });
      actual = [];
    };
    for (const it of g) {
      const prev = actual[actual.length - 1];
      if (prev && it.x - (prev.x + prev.ancho) > Math.max(6, tam * 1.2)) cerrar();
      actual.push(it);
    }
    cerrar();
    const texto = colapsar(segs.map((s) => s.texto).join(" "));
    if (!texto) continue;
    const chars = g.reduce((s, i) => s + i.texto.trim().length, 0) || 1;
    const negras = g.reduce((s, i) => s + (i.negrita ? i.texto.trim().length : 0), 0);
    const ult = g[g.length - 1];
    salida.push({ pagina, banda, col, x0: g[0].x, x1: ult.x + ult.ancho, y: g[0].y, tam, negrita: negras / chars > 0.55, texto, segs, items: g });
  }
  return salida;
}

/* ---------- columnas de la página ----------------------------------------------------------------------- */

interface Columnas {
  /** Mitad de la calle entre columnas. */
  corte: number;
  izq: number;
  der: number;
}

function detectarColumnas(items: ItemPdf[], caja: Caja): Columnas | null {
  const utiles = items.filter((i) => i.texto.trim() !== "");
  if (utiles.length < 40) return null;
  const W = ancho(caja);
  const paso = 3;
  const n = Math.ceil(W / paso);
  const cuenta = new Array<number>(n).fill(0);
  for (const it of utiles) {
    const a = Math.max(0, Math.floor((it.x - caja.x0) / paso));
    const b = Math.min(n - 1, Math.floor((it.x + it.ancho - caja.x0) / paso));
    for (let k = a; k <= b; k++) cuenta[k]++;
  }
  const tope = Math.max(1, Math.floor(utiles.length * 0.05));
  let mejor: [number, number] | null = null;
  let ini = -1;
  for (let k = Math.floor(n * 0.3); k <= Math.ceil(n * 0.7); k++) {
    if (cuenta[k] <= tope) {
      if (ini < 0) ini = k;
      if (!mejor || k - ini > mejor[1] - mejor[0]) mejor = [ini, k];
    } else ini = -1;
  }
  if (!mejor || (mejor[1] - mejor[0] + 1) * paso < 9) return null;
  const izq = caja.x0 + mejor[0] * paso;
  const der = caja.x0 + (mejor[1] + 1) * paso;
  const corte = (izq + der) / 2;
  const lados = utiles.filter((i) => i.x + i.ancho <= izq + 2 || i.x >= der - 2);
  const a = lados.filter((i) => i.x < corte).length;
  const b = lados.length - a;
  if (a < lados.length * 0.25 || b < lados.length * 0.25) return null;
  return { corte, izq, der };
}

/* ---------- rejillas (tablas con líneas) --------------------------------------------------------------- */

interface Red {
  caja: Caja;
  filasY: number[];
  colsX: number[];
  cerrada: boolean;
  /** Las filas vienen de las franjas de color: varias líneas de texto sin separador entre ellas son una sola fila. */
  porBandas?: boolean;
  /** Dos reglas con el encabezado entre ellas y nada más: la tabla sigue en la página siguiente. */
  soloEncabezado?: boolean;
}

function agrupar(n: number, unidos: (i: number, j: number) => boolean): number[][] {
  const padre = Array.from({ length: n }, (_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (unidos(i, j)) padre[raiz(j)] = raiz(i);
  const g = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = raiz(i);
    g.set(r, [...(g.get(r) ?? []), i]);
  }
  return [...g.values()];
}

function distintos(valores: number[], tol: number): number[] {
  const o = [...valores].sort((a, b) => a - b);
  const salida: number[] = [];
  for (const v of o) {
    if (!salida.length || v - salida[salida.length - 1] > tol) salida.push(v);
  }
  return salida;
}

/**
 * Suma a una tabla sin reglas las líneas de texto que le quedan pegadas arriba y abajo (hasta tres renglones por
 * lado) y el texto de las celdas que sobresale a la izquierda de las franjas. Para en los pies («Nota.», «Fuente»)
 * y en las líneas más anchas que la tabla.
 */
function extenderPorTexto(caja: Caja, items: ItemPdf[], pagina: Caja, cerradaArriba: boolean, cerradaAbajo: boolean): Caja {
  const PARAR = /^(nota|notas|fuente|fuentes|tabla|cuadro|gr[aá]fica|gr[aá]fico|figura|ilustraci[oó]n)/i;
  const lineasY = (): { y: number; its: ItemPdf[] }[] => {
    const ord = [...items].filter((i) => i.texto.trim()).sort((a, b) => b.y - a.y);
    const salida: { y: number; its: ItemPdf[] }[] = [];
    for (const it of ord) {
      const l = salida[salida.length - 1];
      if (l && Math.abs(l.y - it.y) <= Math.max(1.6, it.tam * 0.45)) l.its.push(it);
      else salida.push({ y: it.y, its: [it] });
    }
    return salida;
  };
  const lineas = lineasY();
  let c = { ...caja };
  const caben = (l: { its: ItemPdf[] }) => Math.min(...l.its.map((i) => i.x)) >= c.x0 - 60 && Math.max(...l.its.map((i) => i.x + i.ancho)) <= c.x1 + 3;
  const texto = (l: { its: ItemPdf[] }) => [...l.its].sort((a, b) => a.x - b.x).map((i) => i.texto).join(" ").trim();
  if (!cerradaAbajo) {
    for (let n = 0; n < 3; n++) {
      const sig = lineas.filter((l) => l.y < c.y0 - 1).sort((a, b) => b.y - a.y)[0];
      if (!sig || c.y0 - sig.y > Math.max(...sig.its.map((i) => i.tam)) * 2.1 || !caben(sig) || PARAR.test(texto(sig)) || texto(sig).length > 150) break;
      c = { ...c, y0: sig.y - Math.max(...sig.its.map((i) => i.tam)) * 0.3 };
    }
  }
  if (!cerradaArriba) {
    for (let n = 0; n < 2; n++) {
      const ant = lineas.filter((l) => l.y > c.y1 + 1).sort((a, b) => a.y - b.y)[0];
      if (!ant || ant.y - c.y1 > Math.max(...ant.its.map((i) => i.tam)) * 2.1 || !caben(ant) || PARAR.test(texto(ant)) || texto(ant).length > 150 || ant.its.length < 2) break;
      c = { ...c, y1: ant.y + Math.max(...ant.its.map((i) => i.tam)) * 0.9 };
    }
  }
  const izq = items.filter((i) => i.y >= c.y0 && i.y <= c.y1 && i.x < c.x0 - 1 && i.x > pagina.x0 + 20).map((i) => i.x);
  if (izq.length) c = { ...c, x0: Math.min(c.x0, ...izq) - 2 };
  return c;
}

function detectarRedes(p: PaginaPdf): Red[] {
  const hs: Caja[] = [];
  const vs: Caja[] = [];
  const franjas: Caja[] = [];
  const paginaArea = area(p.caja);
  for (const t of p.trazos) {
    if (t.t === "h") hs.push(t.caja);
    else if (t.t === "v") vs.push(t.caja);
    else if (t.t === "rect" && t.borde && ancho(t.caja) >= 10 && alto(t.caja) >= 8 && area(t.caja) < paginaArea * 0.6) {
      const c = t.caja;
      hs.push({ x0: c.x0, x1: c.x1, y0: c.y1, y1: c.y1 }, { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y0 });
      vs.push({ x0: c.x0, x1: c.x0, y0: c.y0, y1: c.y1 }, { x0: c.x1, x1: c.x1, y0: c.y0, y1: c.y1 });
    } else if (t.t === "rect" && t.relleno && !t.borde && ancho(t.caja) >= 18 && alto(t.caja) >= 8 && alto(t.caja) <= 260 && area(t.caja) < paginaArea * 0.5) franjas.push(t.caja);
  }
  const largas = hs.filter((h) => ancho(h) >= 24);
  const solape = (a: Caja, b: Caja) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const redes: Red[] = [];
  const cubierto: Caja[] = [];

  // Tablas «cebra»: filas sombreadas (sin líneas verticales) entre una regla de arriba y otra de abajo. Las
  // franjas de una misma fila comparten alto; las columnas salen de los bordes x de las franjas.
  {
    const filasF = new Map<string, Caja[]>();
    for (const f of franjas) filasF.set(`${Math.round(f.y0 / 2)}:${Math.round(f.y1 / 2)}`, [...(filasF.get(`${Math.round(f.y0 / 2)}:${Math.round(f.y1 / 2)}`) ?? []), f]);
    const filas = [...filasF.values()].map((g) => ({ caja: g.reduce(unir), n: g.length, partes: g }));
    // Una fila de tabla son 2+ franjas contiguas o una franja ancha; se agrupan las filas apiladas que comparten el mismo ancho.
    const aptas = filas.filter((f) => ancho(f.caja) >= 120 && (f.n >= 2 || ancho(f.caja) >= 200));
    const grupos = agrupar(aptas.length, (i, j) => {
      const a = aptas[i].caja;
      const b = aptas[j].caja;
      return (Math.abs(a.x0 - b.x0) <= 3 || Math.abs(a.x1 - b.x1) <= 3) && solape(a, b) >= 0.5 * Math.min(ancho(a), ancho(b)) && Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1) <= 200;
    });
    for (const g of grupos) {
      const cajas = g.map((k) => aptas[k].caja);
      let caja = cajas.reduce(unir);
      // Reglas de arriba y de abajo (encabezado y cierre) que cubren el mismo ancho.
      const reglas = largas.filter((h) => solape(h, caja) >= 0.8 * ancho(caja) && h.y0 >= caja.y0 - 170 && h.y0 <= caja.y1 + 90 && ancho(h) <= ancho(caja) * 1.08);
      // Sin reglas hacen falta al menos tres filas del mismo ancho (las barras de una gráfica no lo tienen).
      if (reglas.length < 1 ? g.length < 3 : g.length < 2 && reglas.length < 2) continue;
      const ys = reglas.map((r) => r.y0);
      if (ys.length) caja = { x0: Math.min(caja.x0, ...reglas.map((r) => r.x0)), x1: Math.max(caja.x1, ...reglas.map((r) => r.x1)), y0: Math.min(caja.y0, ...ys), y1: Math.max(caja.y1, ...ys) };
      // Las filas sin sombra de arriba y de abajo (el encabezado, el último renglón) son texto pegado a la tabla.
      caja = extenderPorTexto(caja, p.items, p.caja, reglas.some((r) => r.y0 >= caja.y1 - 3), reglas.some((r) => r.y0 <= caja.y0 + 3));
      const bordes = g.flatMap((k) => aptas[k].partes.flatMap((f) => [f.x0, f.x1]));
      const colsX = distintos([caja.x0, caja.x1, ...bordes], 2.5);
      // Filas = las franjas de la primera columna (o de ancho completo) y los huecos sin sombra entre ellas.
      const izq = Math.min(...g.flatMap((k) => aptas[k].partes.map((f) => f.x0)));
      const bandas = g
        .flatMap((k) => aptas[k].partes.filter((f) => Math.abs(f.x0 - izq) <= 3))
        .sort((a, b) => b.y1 - a.y1);
      const separadores: number[] = [...ys];
      for (let k = 0; k < bandas.length; k++) {
        separadores.push(bandas[k].y1, bandas[k].y0);
      }
      redes.push({ caja, filasY: distintos(separadores, 1.5).sort((a, b) => b - a), colsX: colsX.length >= 3 ? colsX : [], cerrada: false, porBandas: true });
      cubierto.push(caja);
    }
  }

  // Una banda con sombras propias dentro de una tabla (un título de grupo) no es otra tabla.
  for (let i = redes.length - 1; i >= 0; i--) {
    const c = redes[i].caja;
    if (redes.some((o, j) => j !== i && o.caja.x0 <= c.x0 + 2 && o.caja.x1 >= c.x1 - 2 && o.caja.y0 <= c.y0 + 2 && o.caja.y1 >= c.y1 - 2 && area(o.caja) > area(c))) redes.splice(i, 1);
  }

  if (!largas.length) return redes;
  const grupos = agrupar(largas.length, (i, j) => {
    const a = largas[i];
    const b = largas[j];
    return solape(a, b) >= 0.5 * Math.min(ancho(a), ancho(b)) && Math.abs(a.y0 - b.y0) <= 220;
  });
  for (const g of grupos) {
    const lineas = g.map((k) => largas[k]);
    let caja: Caja = { x0: Math.min(...lineas.map((l) => l.x0)), x1: Math.max(...lineas.map((l) => l.x1)), y0: Math.min(...lineas.map((l) => l.y0)), y1: Math.max(...lineas.map((l) => l.y1)) };
    if (cubierto.some((c) => interseca(c, caja, -2))) continue;
    const dentro = vs.filter((v) => centroX(v) >= caja.x0 - 2 && centroX(v) <= caja.x1 + 2 && v.y1 >= caja.y0 - 4 && v.y0 <= caja.y1 + 4);
    const verticalesUtiles = dentro.filter((v) => alto(v) >= 0.5 * alto(caja) || alto(v) >= 10);
    const filasY = distintos(lineas.map((l) => l.y0), 2).sort((a, b) => b - a);
    const colsX = distintos(verticalesUtiles.map((v) => centroX(v)), 2.5);
    if (lineas.length === 2 && colsX.length < 2 && alto(caja) <= 44 && ancho(caja) >= 250 && Math.abs(lineas[0].y0 - lineas[1].y0) >= 8) {
      redes.push({ caja, filasY, colsX: [], cerrada: false, soloEncabezado: true });
      continue;
    }
    if (lineas.length < 3 && !(lineas.length >= 2 && colsX.length >= 2)) continue;
    for (const v of verticalesUtiles) caja = unir(caja, v);
    if (ancho(caja) < 90 || alto(caja) < 14) continue;
    redes.push({ caja, filasY, colsX, cerrada: colsX.length >= 2 && filasY.length >= 2 });
  }
  return redes;
}

/* ---------- tablas desde fragmentos ---------------------------------------------------------------------- */

interface FilaTabla {
  y: number;
  celdas: string[];
}

/**
 * Los fragmentos de una región → matriz de texto. Las columnas salen de los «ríos» de espacio en blanco que
 * atraviesan todas las líneas (o de las líneas verticales de la rejilla); las filas, de las líneas de texto, con
 * un salto forzado donde hay una línea horizontal. Una línea sin texto en la primera columna, pegada a la
 * anterior, es la continuación de una celda partida en varias líneas.
 */
export function matrizDeItems(items: ItemPdf[], colsX: number[], separadoresY: number[], tamMed: number, porBandas = false): string[][] {
  const utiles = items.filter((i) => i.texto.trim() !== "");
  if (!utiles.length) return [];
  const hueco = Math.max(5, tamMed * 0.9);
  let columnas: { x0: number; x1: number }[] = [];
  const porRios = (lista: ItemPdf[]) => {
    const iv = lista.map((i) => ({ x0: i.x, x1: i.x + i.ancho })).sort((a, b) => a.x0 - b.x0);
    const salida: { x0: number; x1: number }[] = [];
    for (const v of iv) {
      const u = salida[salida.length - 1];
      if (u && v.x0 - u.x1 <= hueco) u.x1 = Math.max(u.x1, v.x1);
      else salida.push({ ...v });
    }
    return salida;
  };
  if (colsX.length >= 3) {
    const lim = [...colsX].sort((a, b) => a - b);
    columnas = lim.slice(0, -1).map((x, k) => ({ x0: x, x1: lim[k + 1] }));
  } else {
    columnas = porRios(utiles);
    if (columnas.length < 2) {
      // Un encabezado centrado sobre varias columnas puede taparlas: se prueba sin la primera línea.
      const ys = [...new Set(utiles.map((i) => Math.round(i.y)))].sort((a, b) => b - a);
      columnas = porRios(utiles.filter((i) => Math.round(i.y) !== ys[0]));
    }
  }
  if (columnas.length < 2) return [];
  const colDe = (i: ItemPdf): number => {
    const cx = i.x + i.ancho / 2;
    let mejor = 0;
    let dist = Infinity;
    columnas.forEach((c, k) => {
      const d = cx >= c.x0 - hueco / 2 && cx <= c.x1 + hueco / 2 ? 0 : Math.min(Math.abs(cx - c.x0), Math.abs(cx - c.x1));
      if (d < dist) (dist = d), (mejor = k);
    });
    return mejor;
  };
  // Líneas de texto de la región.
  const ord = [...utiles].sort((a, b) => b.y - a.y || a.x - b.x);
  const lineas: ItemPdf[][] = [];
  for (const it of ord) {
    const l = lineas[lineas.length - 1];
    if (l && Math.abs(l[0].y - it.y) <= Math.max(1.6, it.tam * 0.42)) l.push(it);
    else lineas.push([it]);
  }
  const filas: FilaTabla[] = [];
  let yPrev = Infinity;
  for (const l of lineas) {
    const celdas = new Array<string>(columnas.length).fill("");
    const porCol = new Map<number, ItemPdf[]>();
    for (const it of l.sort((a, b) => a.x - b.x)) porCol.set(colDe(it), [...(porCol.get(colDe(it)) ?? []), it]);
    for (const [k, v] of porCol) celdas[k] = unirItems(v);
    const primera = celdas.findIndex((c) => c !== "");
    const y = l[0].y;
    const forzado = separadoresY.some((s) => yPrev > s && s > y);
    const tam = l[0].tam;
    const pegada = filas.length > 0 && !forzado && (porBandas || (primera > 0 && yPrev - y <= tam * 1.55 && colsX.length < 3));
    if (pegada) {
      const f = filas[filas.length - 1];
      celdas.forEach((c, k) => {
        if (c) f.celdas[k] = f.celdas[k] ? `${f.celdas[k]} ${c}` : c;
      });
      f.y = y;
    } else filas.push({ y, celdas });
    yPrev = y;
  }
  // Fuera columnas y filas vacías.
  const usadas = columnas.map((_, k) => filas.some((f) => f.celdas[k] !== ""));
  return filas
    .map((f) => f.celdas.filter((_, k) => usadas[k]))
    .filter((c) => c.some((x) => x !== ""))
    .map((c) => c.map((x) => x.trim()));
}

/** ¿La matriz parece una tabla de verdad? Al menos 2×2, celdas cortas y casi todas las filas con 2+ celdas llenas. */
function tablaValida(m: string[][]): boolean {
  if (m.length < 2) return false;
  const cols = Math.max(...m.map((f) => f.length));
  if (cols < 2) return false;
  const conVarias = m.filter((f) => f.filter((c) => c !== "").length >= 2).length;
  if (conVarias < Math.max(2, Math.ceil(m.length * 0.6))) return false;
  const largas = m.flat().filter((c) => c.length > 140).length;
  return largas <= Math.ceil(m.flat().length * 0.1);
}

/* ---------- figuras --------------------------------------------------------------------------------------- */

interface ResultadoFiguras {
  figuras: FiguraPdf[];
  absorbidos: Set<number>;
}

const CABEZA_DE_PIE = /^(?:(?:tabla|cuadro|gr[aá]fica|gr[aá]fico|figura|ilustraci[oó]n|imagen|mapa|esquema|diagrama|foto|fotograf[ií]a)\s+\d{1,3}|(?:notas?|fuentes?)\s*[.:])/i;

function detectarFiguras(p: PaginaPdf, redes: Red[], tamPag: number): ResultadoFiguras {
  const pagArea = area(p.caja);
  const candidatas: { caja: Caja; origen: FiguraPdf["origen"] }[] = [];
  for (const im of p.imagenes) {
    if (ancho(im) < 36 || alto(im) < 30 || area(im) > pagArea * 0.85) continue;
    candidatas.push({ caja: im, origen: "pdf-imagen" });
  }

  // Dibujo vectorial: se pinta una rejilla de 12 pt y se unen las celdas vecinas.
  const paso = 12;
  const nx = Math.ceil(ancho(p.caja) / paso) + 1;
  const ny = Math.ceil(alto(p.caja) / paso) + 1;
  const ocupada = new Map<number, number[]>();
  const registros: { caja: Caja; t: Trazo["t"] }[] = [];
  for (const t of p.trazos) {
    if (area(t.caja) > pagArea * 0.5) continue;
    if (redes.some((r) => contienePunto(r.caja, centroX(t.caja), centroY(t.caja), 2))) continue;
    if ((t.t === "h" && ancho(t.caja) > ancho(p.caja) * 0.7) || (t.t === "v" && alto(t.caja) > alto(p.caja) * 0.7)) continue;
    registros.push({ caja: t.caja, t: t.t });
  }
  registros.forEach((r, id) => {
    const a = Math.max(0, Math.floor((r.caja.x0 - p.caja.x0) / paso));
    const b = Math.min(nx - 1, Math.floor((r.caja.x1 - p.caja.x0) / paso));
    const c = Math.max(0, Math.floor((r.caja.y0 - p.caja.y0) / paso));
    const d = Math.min(ny - 1, Math.floor((r.caja.y1 - p.caja.y0) / paso));
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) ocupada.set(i * ny + j, [...(ocupada.get(i * ny + j) ?? []), id]);
  });
  const visto = new Set<number>();
  for (const [inicio] of ocupada) {
    if (visto.has(inicio)) continue;
    const pila = [inicio];
    visto.add(inicio);
    const ids = new Set<number>();
    while (pila.length) {
      const k = pila.pop()!;
      for (const id of ocupada.get(k) ?? []) ids.add(id);
      const i = Math.floor(k / ny);
      const j = k % ny;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          const q = (i + di) * ny + (j + dj);
          if (i + di >= 0 && j + dj >= 0 && ocupada.has(q) && !visto.has(q)) (visto.add(q), pila.push(q));
        }
    }
    const lista = [...ids].map((id) => registros[id]);
    const caja = lista.map((r) => r.caja).reduce(unir);
    const formas = lista.filter((r) => r.t === "forma").length;
    const rects = lista.filter((r) => r.t === "rect").length;
    if (ancho(caja) < 70 || alto(caja) < 45) continue;
    if (formas + rects < 3 && lista.length < 12) continue;
    // Franjas de color apiladas a todo el ancho son filas de una tabla «cebra» o fondos, no una gráfica.
    const franjas = lista.filter((r) => r.t === "rect" && ancho(r.caja) >= ancho(caja) * 0.8).length;
    if (formas === 0 && franjas >= lista.length * 0.6) continue;
    candidatas.push({ caja, origen: "pdf-dibujo" });
  }

  // Cajas que se tocan o están a menos de 14 pt son la misma figura.
  let cajas = candidatas;
  for (let cambio = true; cambio; ) {
    cambio = false;
    outer: for (let i = 0; i < cajas.length; i++)
      for (let j = i + 1; j < cajas.length; j++)
        if (interseca(cajas[i].caja, cajas[j].caja, 14)) {
          cajas = [
            ...cajas.filter((_, k) => k !== i && k !== j),
            { caja: unir(cajas[i].caja, cajas[j].caja), origen: cajas[i].origen === "pdf-dibujo" || cajas[j].origen === "pdf-dibujo" ? "pdf-dibujo" : "pdf-imagen" },
          ];
          cambio = true;
          break outer;
        }
  }

  // El texto de ejes, leyendas y rótulos se queda con la figura; los pies («Ilustración 5. …») y las notas, no.
  const vetados = new Set<number>();
  {
    const porLinea = new Map<number, number[]>();
    p.items.forEach((it, k) => {
      if (!it.texto.trim()) return;
      const y = Math.round(it.y / 2);
      const clave = [y, y - 1, y + 1].find((c) => porLinea.has(c)) ?? y;
      porLinea.set(clave, [...(porLinea.get(clave) ?? []), k]);
    });
    for (const ks of porLinea.values()) {
      const primero = ks.map((k) => p.items[k]).sort((a, b) => a.x - b.x)[0];
      if (CABEZA_DE_PIE.test(primero.texto.trim())) ks.forEach((k) => vetados.add(k));
    }
  }
  const largoDeLinea = new Map<number, number>();
  p.items.forEach((it, k) => {
    let n = 0;
    for (const o of p.items) if (Math.abs(o.y - it.y) <= Math.max(1.6, it.tam * 0.42)) n += o.texto.trim().length;
    largoDeLinea.set(k, n);
  });
  const absorbidos = new Set<number>();
  const figuras: FiguraPdf[] = [];
  const alturaPag = alto(p.caja);
  for (const f of cajas) {
    let caja = f.caja;
    const enBorde = centroY(caja) > p.caja.y1 - alturaPag * 0.1 || centroY(caja) < p.caja.y0 + alturaPag * 0.1;
    if (enBorde && area(caja) < 4800) continue;
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      p.items.forEach((it, k) => {
        if (absorbidos.has(k) || vetados.has(k) || !it.texto.trim()) return;
        const c = cajaDeItem(it);
        const dentro = contienePunto(caja, centroX(c), centroY(c), 1);
        // El texto de fuera solo se suma a un dibujo (los ejes de una gráfica), nunca a una foto, y si su línea es corta: una línea de párrafo no es un rótulo.
        const cerca = f.origen === "pdf-dibujo" && interseca(caja, c, 28) && it.texto.trim().length <= 30 && it.tam <= tamPag * 1.12 && (largoDeLinea.get(k) ?? 0) <= 42;
        if (dentro || cerca) {
          absorbidos.add(k);
          caja = unir(caja, c);
        }
      });
    }
    // Una foto se recorta justo en su borde (un margen traería la línea de texto vecina); un dibujo lleva un respiro.
    const mg = f.origen === "pdf-imagen" ? 0.5 : 4;
    const final: Caja = { x0: Math.max(p.caja.x0, caja.x0 - mg), y0: Math.max(p.caja.y0, caja.y0 - mg), x1: Math.min(p.caja.x1, caja.x1 + mg), y1: Math.min(p.caja.y1, caja.y1 + mg) };
    figuras.push({ pagina: p.numero, caja: final, origen: f.origen });
  }
  return { figuras, absorbidos };
}

/* ---------- piezas de la página ---------------------------------------------------------------------------- */

interface Orden {
  banda: number;
  col: number;
  y: number;
}

type Pieza =
  | { k: "linea"; pagina: number; orden: Orden; lin: Linea }
  | { k: "tabla"; pagina: number; orden: Orden; filas: string[][] }
  | { k: "destacado"; pagina: number; orden: Orden; texto: string }
  | { k: "figura"; pagina: number; orden: Orden; fig: FiguraPdf };

const comparar = (a: Pieza, b: Pieza) => a.pagina - b.pagina || a.orden.banda - b.orden.banda || a.orden.col - b.orden.col || b.orden.y - a.orden.y;

interface PaginaLista {
  numero: number;
  caja: Caja;
  piezas: Pieza[];
  cajaFiguras: Caja[];
}

function prepararPagina(p: PaginaPdf): PaginaLista {
  const tamPag = mediana(p.items.filter((i) => i.texto.trim().length > 2).map((i) => i.tam)) || 10;
  const redes = detectarRedes(p);

  // 1) Las rejillas que de verdad son tablas. Las demás (cuadrícula de una gráfica, recuadros) no tapan las figuras.
  const itemsDe = (caja: Caja, fuera: ReadonlySet<number>): number[] => {
    const salida: number[] = [];
    p.items.forEach((it, k) => {
      if (fuera.has(k) || !it.texto.trim()) return;
      const c = cajaDeItem(it);
      if (contienePunto(caja, centroX(c), centroY(c), 1.5)) salida.push(k);
    });
    return salida;
  };
  const sinNada = new Set<number>();
  const tablasOk: { red: Red; filas: string[][]; idx: number[] }[] = [];
  const noTablas: Red[] = [];
  for (const r of redes) {
    const idx = itemsDe(r.caja, sinNada);
    const m = idx.length >= 3 || (r.soloEncabezado && idx.length >= 3) ? matrizDeItems(idx.map((k) => p.items[k]), r.colsX, r.filasY, tamPag, r.porBandas) : [];
    // Las franjas de color alineadas con reglas son prueba suficiente: sus celdas pueden ser largas (listas, párrafos).
    const porFranjas = r.porBandas && m.length >= 2 && m.every((f) => f.length >= 2) && m.filter((f) => f.filter((c) => c !== "").length >= 1).length === m.length;
    const soloEnc = r.soloEncabezado && m.length === 1 && m[0].filter((c) => c !== "").length >= 3 && m[0].every((c) => c.length <= 40);
    if (porFranjas || soloEnc || tablaValida(m)) tablasOk.push({ red: r, filas: m, idx });
    else noTablas.push(r);
  }

  // 2) Figuras, sin mirar dentro de las tablas.
  const { figuras, absorbidos } = detectarFiguras(p, tablasOk.map((t) => t.red), tamPag);

  const piezas: Pieza[] = [];
  const consumidos = new Set<number>(absorbidos);
  const tablas: { caja: Caja; filas: string[][] | null; texto: string }[] = [];
  for (const t of tablasOk) {
    tablas.push({ caja: t.red.caja, filas: t.filas, texto: "" });
    t.idx.forEach((k) => consumidos.add(k));
  }
  // 3) Un recuadro cerrado de una sola celda, sin figura encima, es un cuadro destacado.
  for (const r of noTablas) {
    if (!r.cerrada || alto(r.caja) >= alto(p.caja) * 0.6 || figuras.some((f) => interseca(f.caja, r.caja))) continue;
    const idx = itemsDe(r.caja, consumidos);
    if (idx.length < 3) continue;
    const texto = colapsar(lineasDe(idx.map((k) => p.items[k]), p.numero, 0, 0).map((l) => l.texto).join(" "));
    if (texto.length < 20) continue;
    tablas.push({ caja: r.caja, filas: null, texto });
    idx.forEach((k) => consumidos.add(k));
  }

  const restantes = p.items.filter((_, k) => !consumidos.has(k));
  const cols = detectarColumnas(restantes, p.caja);
  const completos = cols ? restantes.filter((i) => i.x < cols.izq - 2 && i.x + i.ancho > cols.der + 2) : [];
  const seps = cols ? lineasDe(completos, p.numero, 0, -1).map((l) => l.y) : [];
  const bandaDe = (y: number) => seps.filter((s) => s > y + 2).length;

  if (!cols) {
    for (const lin of lineasDe(restantes, p.numero, 0, 0)) piezas.push({ k: "linea", pagina: p.numero, orden: { banda: 0, col: 0, y: lin.y }, lin });
  } else {
    const enCol = restantes.filter((i) => !completos.includes(i));
    for (const lin of lineasDe(completos, p.numero, 0, -1)) piezas.push({ k: "linea", pagina: p.numero, orden: { banda: bandaDe(lin.y) + 0.5, col: -1, y: lin.y }, lin: { ...lin, banda: bandaDe(lin.y) + 0.5 } });
    for (const col of [0, 1]) {
      const del = enCol.filter((i) => (i.x + i.ancho / 2 < cols.corte ? 0 : 1) === col);
      // Cada columna se parte en bandas según los títulos de ancho completo.
      const porBanda = new Map<number, ItemPdf[]>();
      for (const it of del) porBanda.set(bandaDe(it.y), [...(porBanda.get(bandaDe(it.y)) ?? []), it]);
      for (const [banda, lista] of porBanda) for (const lin of lineasDe(lista, p.numero, banda, col)) piezas.push({ k: "linea", pagina: p.numero, orden: { banda, col, y: lin.y }, lin });
    }
  }

  const ubicar = (caja: Caja): Orden => {
    if (!cols) return { banda: 0, col: 0, y: caja.y1 };
    const ancha = caja.x0 < cols.izq && caja.x1 > cols.der;
    return { banda: bandaDe(caja.y1) + (ancha ? 0.5 : 0), col: ancha ? -1 : centroX(caja) < cols.corte ? 0 : 1, y: caja.y1 };
  };
  for (const t of tablas) {
    const orden = ubicar(t.caja);
    if (t.filas) piezas.push({ k: "tabla", pagina: p.numero, orden, filas: t.filas });
    else piezas.push({ k: "destacado", pagina: p.numero, orden, texto: t.texto });
  }
  for (const f of figuras) piezas.push({ k: "figura", pagina: p.numero, orden: ubicar(f.caja), fig: f });
  return { numero: p.numero, caja: p.caja, piezas, cajaFiguras: figuras.map((f) => f.caja) };
}

/* ---------- reglas del texto ---------------------------------------------------------------------------------- */

const UNIDAD = /^(cap[ií]tulo|t[ií]tulo|secci[oó]n)\s+(\d+|[ivxlc]+|[úu]nico|[úu]nica)\b/i;
const ARTICULO = /^art[ií]culo\s+\d+[º°o]?\.?/i;
const NUMERADO = /^(\d{1,2}(?:\.\d{1,2})*)\.?\s+\p{Lu}/u;
const PIE = /^(tabla|cuadro|gr[aá]fica|gr[aá]fico|figura|ilustraci[oó]n|imagen|mapa|esquema|diagrama|foto|fotograf[ií]a)\s+\d{1,3}\b/i;
const PIE_SOLO_ETIQUETA = /^(tabla|cuadro|gr[aá]fica|gr[aá]fico|figura|ilustraci[oó]n|imagen|mapa|esquema|diagrama|foto|fotograf[ií]a)\s+\d{1,3}\s*[.:]?\s*$/i;
const VINETA = /^(?:[•●·▪‣◦■□▫–—\-\uE000-\uF8FF]|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+\S/;
const ORDENADA = /^\(?(?:\d{1,2}|[a-z])[.)]\s/;
const FIN_ORACION = /[.!?:;…)”"»]\s*$/;
const NUM_PAGINA = /^\s*(?:p[áa]g(?:ina|\.)?\s*)?(?:\d{1,4}|[ivxlcdm]{1,6})(?:\s*(?:de|\/)\s*\d{1,4})?\s*$|^\s*[-–—]\s*\d{1,4}\s*[-–—]\s*$/i;
const TITULO_INDICE = /^(tabla de contenidos?|contenidos?|[ií]ndice(?: general)?|[ií]ndice de (?:tablas|gr[aá]ficas?|gr[aá]ficos|figuras|ilustraciones|cuadros|mapas)|lista de (?:tablas|figuras|gr[aá]ficas?|ilustraciones|cuadros|siglas|abreviaturas))\s*$/i;
const REFERENCIAS = /^(referencias(?: bibliogr[aá]ficas)?|bibliograf[ií]a|fuentes consultadas|obras citadas)\s*$/i;
const HOJA_SIN_FIN = /(\.{3,}|…+|(?:\.\s){3,})\s*(?:\d{1,4}|[ivxlcdm]{1,6})\s*$/i;

function nivelPorPatron(texto: string): number {
  const u = texto.match(UNIDAD);
  if (u) return /^secci/i.test(u[1]) ? 2 : 1;
  if (ARTICULO.test(texto)) return 3;
  const n = texto.match(NUMERADO);
  if (n && !/[.;,]$/.test(texto)) return Math.min(n[1].split(".").length, 3);
  return 0;
}

const esEntradaDeIndice = (l: Linea): boolean => {
  if (HOJA_SIN_FIN.test(l.texto)) return true;
  const ult = l.segs[l.segs.length - 1];
  const pen = l.segs[l.segs.length - 2];
  return l.segs.length >= 2 && /^\d{1,4}$|^[ivxlcdm]{1,6}$/i.test(ult.texto) && ult.x0 - pen.x1 >= l.tam * 3 && /\p{L}{3}/u.test(pen.texto);
};

/* ---------- el análisis ------------------------------------------------------------------------------------------- */

/**
 * Quita lo que se repite igual en muchas páginas: la marca de agua («BORRADOR») es un trazo grande que, si no se
 * quitara, se uniría a las tablas y gráficas que cruza y las volvería una sola figura.
 */
function sinMarcasDeAgua(paginas: readonly PaginaPdf[]): PaginaPdf[] {
  const clave = (c: Caja) => `${Math.round(c.x0 / 3)}:${Math.round(c.y0 / 3)}:${Math.round(c.x1 / 3)}:${Math.round(c.y1 / 3)}`;
  const veces = new Map<string, Set<number>>();
  for (const p of paginas)
    for (const t of p.trazos) if (t.t === "forma" && ancho(t.caja) >= 60 && alto(t.caja) >= 40) veces.set(clave(t.caja), (veces.get(clave(t.caja)) ?? new Set()).add(p.numero));
  const minimo = Math.max(3, Math.ceil(paginas.length * 0.25));
  const marcas = new Set([...veces].filter(([, v]) => v.size >= minimo).map(([k]) => k));
  if (!marcas.size) return [...paginas];
  return paginas.map((p) => ({ ...p, trazos: p.trazos.filter((t) => !(t.t === "forma" && marcas.has(clave(t.caja)))) }));
}

export function analizarPdf(entrada: readonly PaginaPdf[]): ResultadoAnalisis {
  const descartes: string[] = [];
  const avisos: string[] = [];
  const paginas = sinMarcasDeAgua(entrada);
  const listas = paginas.map(prepararPagina);

  // ¿Escaneado? Casi sin texto por página.
  const chars = paginas.map((p) => p.items.reduce((s, i) => s + i.texto.trim().length, 0));
  const promedio = chars.reduce((a, b) => a + b, 0) / Math.max(1, paginas.length);
  if (!paginas.length || promedio < 40 || chars.filter((n) => n < 20).length > paginas.length / 2) {
    return { elementos: [], figuras: [], descartes, avisos, escaneado: true };
  }

  let piezas = listas.flatMap((l) => l.piezas).sort(comparar);
  const cajaPag = new Map(listas.map((l) => [l.numero, l.caja]));

  /* ---- encabezados, pies y números de página ---- */
  const franja = (lin: Linea): boolean => {
    const c = cajaPag.get(lin.pagina);
    if (!c) return false;
    const h = alto(c);
    return lin.y > c.y1 - h * 0.085 || lin.y < c.y0 + h * 0.085;
  };
  const clave = (t: string) => t.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  const veces = new Map<string, Set<number>>();
  for (const z of piezas) if (z.k === "linea" && franja(z.lin)) veces.set(clave(z.lin.texto), (veces.get(clave(z.lin.texto)) ?? new Set()).add(z.pagina));
  const minimo = paginas.length <= 4 ? 2 : Math.max(3, Math.ceil(paginas.length * 0.35));
  let fuera = 0;
  piezas = piezas.filter((z) => {
    if (z.k !== "linea" || !franja(z.lin)) return true;
    if (NUM_PAGINA.test(z.lin.texto) || (veces.get(clave(z.lin.texto))?.size ?? 0) >= minimo) {
      fuera++;
      return false;
    }
    return true;
  });
  if (fuera) descartes.push(`${fuera} ${fuera === 1 ? "encabezado o pie" : "encabezados o pies"} de página`);

  /* ---- figuras repetidas (logos, marcas de agua) o decorativas ---- */
  const firma = (f: FiguraPdf) => `${Math.round(f.caja.x0 / 8)}:${Math.round(f.caja.y0 / 8)}:${Math.round(ancho(f.caja) / 8)}:${Math.round(alto(f.caja) / 8)}`;
  const repetidas = new Map<string, Set<number>>();
  for (const z of piezas) if (z.k === "figura") repetidas.set(firma(z.fig), (repetidas.get(firma(z.fig)) ?? new Set()).add(z.pagina));
  let logos = 0;
  piezas = piezas.filter((z) => {
    if (z.k !== "figura") return true;
    if ((repetidas.get(firma(z.fig))?.size ?? 0) >= 3) {
      logos++;
      return false;
    }
    return true;
  });
  if (logos) descartes.push(`${logos} ${logos === 1 ? "logo repetido" : "logos repetidos"}`);

  /* ---- tamaño del cuerpo ---- */
  const lineas = piezas.flatMap((z) => (z.k === "linea" ? [z.lin] : []));
  const ponderado = [...lineas].filter((l) => l.texto.length >= 25).sort((a, b) => a.tam - b.tam);
  const totalCh = ponderado.reduce((s, l) => s + l.texto.length, 0);
  let acum = 0;
  let cuerpo = 10;
  for (const l of ponderado) {
    acum += l.texto.length;
    if (acum >= totalCh / 2) {
      cuerpo = l.tam || 10;
      break;
    }
  }

  /* ---- portada ---- */
  let portada: ResultadoAnalisis["portada"];
  const de1 = piezas.filter((z) => z.pagina === paginas[0].numero);
  const lin1 = de1.flatMap((z) => (z.k === "linea" ? [z.lin] : []));
  const ch1 = lin1.reduce((s, l) => s + l.texto.length, 0);
  const max1 = Math.max(0, ...lin1.map((l) => l.tam));
  const figuraGrande = de1.some((z) => z.k === "figura" && area(z.fig.caja) > area(paginas[0].caja) * 0.3);
  if (lin1.length && ch1 <= 700 && (max1 >= cuerpo * 1.5 || figuraGrande) && paginas.length > 1) {
    const grandes = lin1.filter((l) => l.tam >= max1 * 0.9);
    const resto = lin1.filter((l) => !grandes.includes(l) && l.tam >= cuerpo * 1.1).sort((a, b) => b.tam - a.tam);
    portada = { titulo: colapsar(grandes.map((l) => l.texto).join(" ")).slice(0, 300), subtitulo: colapsar(resto.slice(0, 2).map((l) => l.texto).join(" ")).slice(0, 300) };
    piezas = piezas.filter((z) => z.pagina !== paginas[0].numero);
    descartes.push("portada");
  }

  /* ---- notas al pie: letra menor al pie de la página; partirían los párrafos que siguen en la página de al lado ---- */
  {
    let notas = 0;
    piezas = piezas.filter((z) => {
      if (z.k !== "linea") return true;
      const c = cajaPag.get(z.lin.pagina);
      if (!c || z.lin.tam > cuerpo * 0.88 || z.lin.y > c.y0 + alto(c) * 0.3 || CABEZA_DE_PIE.test(z.lin.texto)) return true;
      notas++;
      return false;
    });
    if (notas) descartes.push(`${notas} ${notas === 1 ? "línea de notas al pie" : "líneas de notas al pie"}`);
  }

  /* ---- índices del propio informe ---- */
  let indices = 0;
  {
    const salida: Pieza[] = [];
    let i = 0;
    while (i < piezas.length) {
      const z = piezas[i];
      const esTitulo = z.k === "linea" && TITULO_INDICE.test(z.lin.texto);
      const desde = esTitulo ? i + 1 : i;
      let k = desde;
      let entradas = 0;
      let saltos = 0;
      while (k < piezas.length) {
        const w = piezas[k];
        if (w.k !== "linea") break;
        if (esEntradaDeIndice(w.lin)) {
          entradas++;
          saltos = 0;
        } else if (saltos < 1 && piezas[k + 1]?.k === "linea" && esEntradaDeIndice((piezas[k + 1] as Extract<Pieza, { k: "linea" }>).lin)) saltos++;
        else break;
        k++;
      }
      if (entradas >= (esTitulo ? 3 : 6)) {
        indices += entradas;
        i = k;
        continue;
      }
      salida.push(z);
      i++;
    }
    piezas = salida;
  }
  if (indices) descartes.push(`${indices} ${indices === 1 ? "entrada de índice" : "entradas de índice"}`);

  /* ---- tablas por alineación de texto ---- */
  piezas = tablasPorAlineacion(piezas, cuerpo);

  /* ---- una tabla que sigue en la página siguiente, sin nada en medio, es la misma ---- */
  {
    const salida: Pieza[] = [];
    for (const z of piezas) {
      const prev = salida[salida.length - 1];
      if (z.k === "tabla" && prev?.k === "tabla" && z.pagina === prev.pagina + 1 && Math.max(...z.filas.map((f) => f.length)) === Math.max(...prev.filas.map((f) => f.length))) {
        const repetida = z.filas[0].join("|") === prev.filas[0].join("|");
        // Un encabezado que cabe en una página y se completa en la siguiente («Descripción» + «(resumen)»).
        const completa = prev.filas.length === 1 && z.filas[0].some((c) => c === "") && z.filas[0].every((c, k) => c === "" || prev.filas[0][k] !== "");
        if (completa) prev.filas = [prev.filas[0].map((c, k) => (z.filas[0][k] ? `${c} ${z.filas[0][k]}` : c)), ...z.filas.slice(1)];
        else prev.filas = [...prev.filas, ...(repetida ? z.filas.slice(1) : z.filas)];
        prev.pagina = z.pagina;
        continue;
      }
      salida.push(z);
    }
    piezas = salida;
  }

  /* ---- armar los elementos ---- */
  const elementos: Elemento[] = [];
  const figuras: ResultadoAnalisis["figuras"] = [];
  const margenDe = new Map<string, number>();
  const derechaDe = new Map<string, number>();
  const grupos = new Map<string, Linea[]>();
  for (const z of piezas) if (z.k === "linea") grupos.set(`${z.lin.pagina}:${z.lin.banda}:${z.lin.col}`, [...(grupos.get(`${z.lin.pagina}:${z.lin.banda}:${z.lin.col}`) ?? []), z.lin]);
  for (const [g, ls] of grupos) {
    const largas = ls.filter((l) => l.texto.length >= 40);
    const base = largas.length ? largas : ls;
    const cuentas = new Map<number, number>();
    for (const l of base) cuentas.set(Math.round(l.x0 / 2) * 2, (cuentas.get(Math.round(l.x0 / 2) * 2) ?? 0) + 1);
    margenDe.set(g, [...cuentas.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? Math.min(...ls.map((l) => l.x0)));
    derechaDe.set(g, Math.max(...ls.map((l) => l.x1)));
  }
  const gk = (l: Linea) => `${l.pagina}:${l.banda}:${l.col}`;

  // Tamaños de los títulos por tamaño de letra.
  const tamTitulos = [...new Set(lineas.filter((l) => l.tam >= cuerpo * 1.12 && l.texto.length <= 110 && !PIE.test(l.texto) && !FIN_ORACION.test(l.texto) && /\p{L}{2}/u.test(l.texto)).map((l) => Math.round(l.tam * 2) / 2))].sort((a, b) => b - a);

  let parr: { texto: string; ult: Linea; pie?: boolean; ref?: boolean } | null = null;
  let lista: { ordenada: boolean; items: string[]; x0: number; ult: Linea } | null = null;
  let titulo: { nivel: 1 | 2 | 3; texto: string; ult: Linea; dudoso: boolean; unidad: boolean } | null = null;
  let modoRef = false;
  let indicesSueltos = 0;

  const vaciar = () => {
    if (titulo) {
      elementos.push({ t: "titulo", nivel: titulo.nivel, texto: titulo.texto.slice(0, 300), dudoso: titulo.dudoso });
      modoRef = REFERENCIAS.test(titulo.texto);
      titulo = null;
    }
    if (parr && parr.pie && /[^\d\s]\s+\d{1,3}$/.test(parr.texto) && parr.texto.length <= 220) {
      // «Tabla 6. Sistemas … análisis. 29»: la última entrada de un índice que quedó suelta.
      indicesSueltos++;
      parr = null;
    }
    if (parr) {
      elementos.push({ t: "parrafo", texto: escapar(parr.texto.trim()), ...(parr.pie ? { pie: true } : {}) });
      parr = null;
    }
    if (lista) {
      elementos.push({ t: "lista", ordenada: lista.ordenada, items: lista.items.map((t) => escapar(t.trim())) });
      lista = null;
    }
  };
  const unirTexto = (a: string, b: string) => (/\p{L}-$/u.test(a) && /^\p{Ll}/u.test(b) ? a.slice(0, -1) + b : `${a} ${b}`);

  piezas.forEach((z, idx) => {
    if (z.k === "tabla") {
      vaciar();
      elementos.push({ t: "tabla", filas: z.filas, titulo: "", nota: "", pagina: z.pagina });
      return;
    }
    if (z.k === "destacado") {
      vaciar();
      elementos.push({ t: "destacado", texto: escapar(z.texto) });
      return;
    }
    if (z.k === "figura") {
      vaciar();
      const el: Extract<Elemento, { t: "imagen" }> = { t: "imagen", descripcion: "", titulo: "", nota: "", imagen: null, origen: z.fig.origen, pagina: z.pagina };
      elementos.push(el);
      figuras.push({ elemento: el, figura: z.fig });
      return;
    }
    const L = z.lin;
    const g = gk(L);
    const margen = margenDe.get(g) ?? L.x0;
    const derecha = derechaDe.get(g) ?? L.x1;
    const prevZ = piezas[idx - 1];
    const siguienteZ = piezas[idx + 1];
    const mismoGrupoPrev = prevZ?.k === "linea" && gk(prevZ.lin) === g ? prevZ.lin : null;
    const mismoGrupoSig = siguienteZ?.k === "linea" && gk(siguienteZ.lin) === g ? siguienteZ.lin : null;
    const huecoAntes = mismoGrupoPrev ? mismoGrupoPrev.y - L.y : Infinity;
    const huecoDespues = mismoGrupoSig ? L.y - mismoGrupoSig.y : Infinity;

    // Título: en continuación de uno que ya está abierto (título partido en dos líneas).
    const tamRedondo = Math.round(L.tam * 2) / 2;
    const patron = nivelPorPatron(L.texto);
    const porTam = tamTitulos.includes(tamRedondo) && L.texto.length <= 110 && !FIN_ORACION.test(L.texto);
    const porNegrita = L.negrita && L.tam >= cuerpo * 0.95 && L.texto.length <= 90 && (patron > 0 || (!FIN_ORACION.test(L.texto) && (huecoAntes > L.tam * 1.5 || huecoAntes === Infinity) && huecoDespues > L.tam * 0.9));
    const esPie = PIE.test(L.texto);
    // «1. Diagnóstico…, que analiza el estado» seguido de una línea en minúscula es un ítem de lista, no un título.
    const sigueMinuscula = patron > 0 && mismoGrupoSig !== null && /^\p{Ll}/u.test(mismoGrupoSig.texto) && !UNIDAD.test(L.texto);
    // Una línea corta, sin punto, con aire de párrafo antes y después (los subtítulos de color, del mismo tamaño del texto).
    const aislada = !modoRef && !(parr && (parr as { pie?: boolean }).pie) && !CABEZA_DE_PIE.test(L.texto) && !L.negrita && L.texto.length <= 85 && L.texto.length >= 4 && !FIN_ORACION.test(L.texto) && !VINETA.test(L.texto) && /^\p{Lu}/u.test(L.texto) && huecoAntes >= L.tam * 1.85 && huecoDespues >= L.tam * 1.85 && !/,\s*\p{Ll}+\s*$/u.test(L.texto);
    const esTitulo = !esPie && !sigueMinuscula && /\p{L}{2}/u.test(L.texto) && !/[,;]$/.test(L.texto) && (porTam || porNegrita || aislada || (patron > 0 && patron <= 2 && L.tam >= cuerpo * 1.02 && L.negrita));
    if (esTitulo) {
      const abierto = titulo as { nivel: 1 | 2 | 3; texto: string; ult: Linea; dudoso: boolean; unidad: boolean } | null;
      if (abierto && abierto.ult.pagina === L.pagina && Math.abs(abierto.ult.tam - L.tam) < 0.6 && abierto.ult.y - L.y <= L.tam * 1.7 && !FIN_ORACION.test(abierto.texto) && patron === 0) {
        abierto.texto = unirTexto(abierto.texto, L.texto);
        abierto.ult = L;
        return;
      }
      if (abierto && abierto.unidad && abierto.ult.pagina === L.pagina && abierto.ult.y - L.y <= L.tam * 2.2 && patron === 0) {
        abierto.texto = `${abierto.texto} · ${L.texto}`;
        abierto.unidad = false;
        abierto.ult = L;
        return;
      }
      vaciar();
      const rango = tamTitulos.indexOf(tamRedondo);
      const porRango = Math.min(rango < 0 ? 3 : rango + 1, 3) as 1 | 2 | 3;
      // Una numeración «2.» en letra de cuerpo cuelga de los títulos de mayor tamaño: es de nivel 3, no 1.
      const nivel = ((patron && !UNIDAD.test(L.texto) && tamTitulos.length && L.tam < cuerpo * 1.12 ? 3 : patron) || porRango) as 1 | 2 | 3;
      titulo = { nivel, texto: L.texto, ult: L, dudoso: !patron && (rango < 0 || L.tam < cuerpo * 1.2), unidad: Boolean(UNIDAD.test(L.texto)) && L.texto.length < 16 };
      return;
    }
    // Un título partido: la línea siguiente, del mismo tamaño y en minúscula, es su continuación («…construidos por» / «estudiante.»).
    {
      const ab = titulo as { nivel: 1 | 2 | 3; texto: string; ult: Linea; dudoso: boolean; unidad: boolean } | null;
      if (ab && ab.ult.pagina === L.pagina && Math.abs(ab.ult.tam - L.tam) < 0.8 && ab.ult.y - L.y <= L.tam * 1.8 && /^\p{Ll}/u.test(L.texto) && L.texto.length <= 60) {
        ab.texto = unirTexto(ab.texto, L.texto.replace(/\.$/, ""));
        ab.ult = L;
        return;
      }
    }
    if (titulo) vaciar();

    // Pie de figura o de tabla: un párrafo propio.
    if (esPie) {
      vaciar();
      parr = { texto: L.texto, ult: L, pie: true };
      return;
    }
    const abiertoP = parr as { texto: string; ult: Linea; pie?: boolean; ref?: boolean } | null;
    if (abiertoP?.pie) {
      const soloEtiqueta = PIE_SOLO_ETIQUETA.test(abiertoP.texto);
      const sigue = abiertoP.ult.pagina === L.pagina && Math.abs(abiertoP.ult.tam - L.tam) < 1.2 && abiertoP.ult.y - L.y <= L.tam * (soloEtiqueta ? 2.6 : 1.5) && !VINETA.test(L.texto) && (soloEtiqueta || !FIN_ORACION.test(abiertoP.texto));
      if (sigue) {
        abiertoP.texto = unirTexto(abiertoP.texto, L.texto);
        abiertoP.ult = L;
        return;
      }
      vaciar();
    }

    // Listas.
    const marca = VINETA.test(L.texto) && L.texto.length >= 4 && !(parr && !FIN_ORACION.test((parr as { texto: string }).texto) && huecoAntes <= L.tam * 1.35 && L.x0 - margen < L.tam * 0.5 && !/^[•●·▪‣◦■□▫–—\-\uE000-\uF8FF]/.test(L.texto));
    if (marca && !modoRef) {
      const ordenada = ORDENADA.test(L.texto);
      const item = L.texto.replace(/^(?:[•●·▪‣◦■□▫–—\-\uE000-\uF8FF]|\(?(?:\d{1,2}|[a-z])[.)])\s*/, "");
      const actual = lista as { ordenada: boolean; items: string[]; x0: number; ult: Linea } | null;
      if (actual && actual.ordenada === ordenada) {
        actual.items.push(item);
        actual.ult = L;
      } else {
        vaciar();
        lista = { ordenada, items: [item], x0: L.x0, ult: L };
      }
      return;
    }
    const listaAbierta = lista as { ordenada: boolean; items: string[]; x0: number; ult: Linea } | null;
    if (listaAbierta) {
      const ultimo = listaAbierta.items[listaAbierta.items.length - 1];
      // Un ítem que se corta al final de la página sigue arriba de la siguiente, en minúscula.
      const continua = listaAbierta.ult.pagina === L.pagina ? listaAbierta.ult.y - L.y <= L.tam * 1.55 && (L.x0 > listaAbierta.x0 + L.tam * 0.2 || !FIN_ORACION.test(ultimo)) : /^\p{Ll}/u.test(L.texto) && !FIN_ORACION.test(ultimo);
      if (continua) {
        listaAbierta.items[listaAbierta.items.length - 1] = unirTexto(listaAbierta.items[listaAbierta.items.length - 1], L.texto);
        listaAbierta.ult = L;
        return;
      }
      vaciar();
    }

    // Párrafos.
    const p = parr as { texto: string; ult: Linea; pie?: boolean; ref?: boolean } | null;
    if (p) {
      const misma = p.ult.pagina === L.pagina && gk(p.ult) === g;
      let corta = false;
      if (modoRef) corta = L.x0 <= margen + L.tam * 0.6;
      else if (misma) {
        const sangria = L.x0 - margen > L.tam * 0.9 && p.ult.x0 - margen <= L.tam * 0.5;
        corta = p.ult.y - L.y > Math.max(p.ult.tam, L.tam) * 1.75 || (sangria && FIN_ORACION.test(p.texto)) || (FIN_ORACION.test(p.texto) && p.ult.x1 < derecha - L.tam * 3.5 && L.x0 - margen < L.tam * 0.6);
      } else {
        corta = FIN_ORACION.test(p.texto) || L.x0 - margen > L.tam * 0.9;
      }
      if (!corta) {
        p.texto = unirTexto(p.texto, L.texto);
        p.ult = L;
        return;
      }
      vaciar();
    }
    parr = { texto: L.texto, ult: L };
  });
  vaciar();
  if (indicesSueltos) descartes.push(`${indicesSueltos} ${indicesSueltos === 1 ? "entrada de índice suelta" : "entradas de índice sueltas"}`);

  // Una figura sin nada alrededor que sea menor a 40×30 pt ya se filtró; aquí solo se avisa de las muy numerosas.
  if (figuras.length > 80) avisos.push(`Se detectaron ${figuras.length} figuras: se importan las primeras 80; revise las demás en el PDF original.`);
  return { elementos, figuras: figuras.slice(0, 80), descartes, avisos, portada, escaneado: false };
}

/* ---------- tablas sin líneas ------------------------------------------------------------------------------------- */

function tablasPorAlineacion(piezas: Pieza[], cuerpo: number): Pieza[] {
  const salida: Pieza[] = [];
  let i = 0;
  const multi = (z: Pieza | undefined): boolean => z?.k === "linea" && z.lin.segs.length >= 2 && !VINETA.test(z.lin.texto);
  const mismaGrupo = (a: Linea, b: Linea) => a.pagina === b.pagina && a.banda === b.banda && a.col === b.col;
  while (i < piezas.length) {
    const z = piezas[i];
    if (z.k !== "linea" || !multi(z)) {
      salida.push(z);
      i++;
      continue;
    }
    // Una tabla: líneas con 2+ segmentos; se aceptan líneas sueltas (celdas partidas) si más abajo sigue la tabla.
    let fin = i;
    let k = i + 1;
    while (k < piezas.length) {
      const w = piezas[k];
      if (w.k !== "linea" || !mismaGrupo(z.lin, w.lin) || piezas[k - 1].k !== "linea") break;
      const previa = (piezas[k - 1] as Extract<Pieza, { k: "linea" }>).lin;
      const salto = previa.y - w.lin.y;
      if (salto > Math.max(w.lin.tam, previa.tam) * 2.4) break;
      if (multi(w)) fin = k;
      else if (!(salto <= w.lin.tam * 1.6 && multi(piezas[k + 1]) && w.lin.x0 > z.lin.x0 + 3)) break;
      k++;
    }
    const tramo = piezas.slice(i, fin + 1);
    const lins = tramo.flatMap((t) => (t.k === "linea" ? [t.lin] : []));
    const nMulti = lins.filter((l) => l.segs.length >= 2).length;
    if (nMulti >= 3 || (nMulti >= 2 && lins.some((l) => l.segs.length >= 3))) {
      const items = lins.flatMap((l) => l.items);
      const m = matrizDeItems(items, [], [], cuerpo);
      if (tablaValida(m)) {
        salida.push({ k: "tabla", pagina: z.pagina, orden: z.orden, filas: m });
        i = fin + 1;
        continue;
      }
    }
    salida.push(z);
    i++;
  }
  return salida;
}
