/* =============================================================================
   Portal de Impacto · el mapa de red de un programa.

   Recrea el «Mapa de Red» de la herramienta anterior, ahora dentro de cada
   programa. Allí los 33 indicadores de impacto se unían por «temas
   transversales»; aquí los temas son los pilares del PDI y los ODS que
   comparten los indicadores del programa (sus cruces confirmados).

   - Nodos: las fichas que eligió el programa y, aparte (anillo hueco), sus
     indicadores propios. En el centro, el programa (nodo dorado), al que se
     une cada indicador.
   - Hilos: dos indicadores que comparten un pilar o un ODS. Un indicador
     propio se une además a la ficha con la que se relaciona.
   - Disposición: un triángulo fijo, como el original —Investigación arriba,
     Enseñanza abajo a la izquierda, Extensión abajo a la derecha—, cada
     función en una rejilla ordenada por código. Sin simulación: el mismo
     programa se dibuja siempre igual.
   ========================================================================== */

import { FUNCTIONS } from "../model";
import type { Stage, SubstantiveFunction } from "../model";
import type { PortalData } from "./data";

export interface NetNode {
  id: string;
  code: string;
  /** La etiqueta corta del mapa: el código (P-001 en los propios). */
  label: string;
  name: string;
  fn: SubstantiveFunction;
  stage: Stage;
  own: boolean;
  parentId: string | null;
  /** Pilares y ODS del indicador: "pilar:<id>", "ods:<n>". */
  keys: string[];
}

export interface NetEdge {
  a: string;
  b: string;
  /** Lo que comparten; "ficha" si es un propio unido a su ficha. */
  keys: string[];
  cross: boolean;
  kind: "hilo" | "ficha";
}

export interface NetTheme {
  key: string;
  label: string;
  hint: string;
  /** Cuántos hilos pasan por él. */
  edges: number;
}

export interface Network {
  nodes: NetNode[];
  edges: NetEdge[];
  themes: NetTheme[];
}

const shortCode = (code: string) => (code.startsWith("P-") ? `P-${code.split("-").pop()}` : code);

export function programNetwork(data: PortalData, programId: string, campusId: string | null = null): Network {
  const keysOf = new Map<string, string[]>();
  for (const a of data.alignments) {
    const key = a.target === "pilar" ? (a.pillarId ? `pilar:${a.pillarId}` : null) : a.sdg ? `ods:${a.sdg}` : null;
    if (!key) continue;
    const list = keysOf.get(a.indicatorId) ?? [];
    if (!list.includes(key)) list.push(key);
    keysOf.set(a.indicatorId, list);
  }

  const adopted = new Set(data.adoptions.filter((a) => a.programId === programId && (!campusId || a.campusId === campusId)).map((a) => a.indicatorId));
  const nodes: NetNode[] = [
    ...data.indicators
      .filter((i) => adopted.has(i.id))
      .map((i) => ({ id: i.id, code: i.code, label: i.code, name: i.name, fn: i.fn, stage: i.stage, own: false, parentId: null, keys: keysOf.get(i.id) ?? [] })),
    ...data.programIndicators
      .filter((i) => i.programId === programId && (!campusId || i.campusId === campusId))
      .map((i) => ({ id: i.id, code: i.code, label: shortCode(i.code), name: i.name, fn: i.fn, stage: i.stage, own: true, parentId: i.parentId, keys: keysOf.get(i.id) ?? [] })),
  ].sort((a, b) => Number(a.own) - Number(b.own) || a.code.localeCompare(b.code, "es", { numeric: true }));

  const edges: NetEdge[] = [];
  const ids = new Set(nodes.map((n) => n.id));
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const shared = a.keys.filter((k) => b.keys.includes(k));
      if (shared.length) edges.push({ a: a.id, b: b.id, keys: shared, cross: a.fn !== b.fn, kind: "hilo" });
    }
  }
  for (const n of nodes) {
    if (n.own && n.parentId && ids.has(n.parentId) && !edges.some((e) => (e.a === n.id && e.b === n.parentId) || (e.b === n.id && e.a === n.parentId))) {
      const parent = nodes.find((m) => m.id === n.parentId)!;
      edges.push({ a: n.parentId, b: n.id, keys: ["ficha"], cross: parent.fn !== n.fn, kind: "ficha" });
    }
  }

  const pillar = new Map(data.pillars.map((p) => [p.id, p]));
  const count = new Map<string, number>();
  for (const e of edges) for (const k of e.keys) if (k !== "ficha") count.set(k, (count.get(k) ?? 0) + 1);
  const themes = [...count.entries()]
    .map(([key, edges]) => {
      const [kind, id] = key.split(":");
      if (kind === "pilar") {
        const p = pillar.get(id);
        return { key, label: `Pilar ${p?.numeral ?? "?"}`, hint: p?.name ?? "", edges };
      }
      return { key, label: `ODS ${id}`, hint: "", edges };
    })
    .sort((a, b) => (a.key.startsWith("pilar") === b.key.startsWith("pilar") ? b.edges - a.edges || a.label.localeCompare(b.label, "es", { numeric: true }) : a.key.startsWith("pilar") ? -1 : 1));

  return { nodes, edges, themes };
}

/** Los vecinos de un nodo en un conjunto de hilos. */
export function neighbours(edges: NetEdge[], id: string): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.a === id) out.add(e.b);
    else if (e.b === id) out.add(e.a);
  }
  return out;
}

/* --- La disposición -------------------------------------------------------------------- */

export interface Point {
  x: number;
  y: number;
}

export interface Placed extends Point {
  /** Hacia dónde va la etiqueta, según su dirección desde el centro. */
  anchor: "start" | "middle" | "end";
  lx: number;
  ly: number;
}

export interface Layout {
  nodes: Map<string, Placed>;
  hub: Point;
  /** Dónde va el nombre de cada función, fuera de su grupo. */
  titles: Record<SubstantiveFunction, Point & { anchor: "start" | "middle" | "end" }>;
  viewBox: { x: number; y: number; w: number; h: number };
}

const ANCHOR: Record<SubstantiveFunction, Point> = {
  investigacion: { x: 520, y: 145 },
  ensenanza: { x: 325, y: 490 },
  extension: { x: 715, y: 490 },
};
const CELL_W = 67;
const CELL_H = 33;
const PUSH = 16;
const MARGIN = 42;

export function layoutNetwork(nodes: NetNode[]): Layout {
  const centroid = {
    x: (ANCHOR.investigacion.x + ANCHOR.ensenanza.x + ANCHOR.extension.x) / 3,
    y: (ANCHOR.investigacion.y + ANCHOR.ensenanza.y + ANCHOR.extension.y) / 3,
  };
  const placed = new Map<string, Placed>();
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const titles = {} as Layout["titles"];

  for (const fn of FUNCTIONS) {
    const mine = nodes.filter((n) => n.fn === fn);
    const base = ANCHOR[fn];
    const dx = base.x - centroid.x;
    const dy = base.y - centroid.y;
    const len = Math.hypot(dx, dy) || 1;
    const anchor = { x: base.x + (dx / len) * PUSH, y: base.y + (dy / len) * PUSH };
    const cols = Math.max(2, Math.min(5, Math.ceil(Math.sqrt(mine.length * (fn === "investigacion" ? 1.2 : 1.6)))));
    const rows = Math.max(1, Math.ceil(mine.length / cols));
    const w = (cols - 1) * CELL_W;
    const h = (rows - 1) * CELL_H;
    mine.forEach((n, k) => {
      const x = anchor.x - w / 2 + (k % cols) * CELL_W;
      const y = anchor.y - h / 2 + Math.floor(k / cols) * CELL_H;
      const ax = x - centroid.x;
      const ay = y - centroid.y;
      const al = Math.hypot(ax, ay) || 1;
      const side = ax / al;
      const labelAnchor = side > 0.35 ? "start" : side < -0.35 ? "end" : "middle";
      const lx = x + (labelAnchor === "start" ? 11 : labelAnchor === "end" ? -11 : 0);
      const ly = y + (labelAnchor === "middle" ? (ay < 0 ? -12 : 19) : 4);
      placed.set(n.id, { x, y, anchor: labelAnchor, lx, ly });
      const tw = n.label.length * 6.4;
      const tx0 = labelAnchor === "start" ? lx : labelAnchor === "end" ? lx - tw : lx - tw / 2;
      boxes.push({ x0: Math.min(x - 9, tx0), y0: Math.min(y - 9, ly - 11), x1: Math.max(x + 9, tx0 + tw), y1: Math.max(y + 9, ly + 4) });
    });
    // El nombre de la función, más allá del borde exterior de su grupo.
    const out = { x: dx / len, y: dy / len };
    const reach = Math.max(w, h) / 2 + 30;
    const t = { x: anchor.x + out.x * reach, y: anchor.y + out.y * reach + (fn === "investigacion" ? -8 : 18) };
    titles[fn] = { ...t, anchor: fn === "investigacion" ? "middle" : fn === "ensenanza" ? "end" : "start" };
    boxes.push({ x0: t.x - 90, y0: t.y - 16, x1: t.x + 90, y1: t.y + 6 });
  }
  boxes.push({ x0: centroid.x - 60, y0: centroid.y - 36, x1: centroid.x + 60, y1: centroid.y + 16 });

  const x0 = Math.min(...boxes.map((b) => b.x0)) - MARGIN;
  const y0 = Math.min(...boxes.map((b) => b.y0)) - MARGIN;
  const x1 = Math.max(...boxes.map((b) => b.x1)) + MARGIN;
  const y1 = Math.max(...boxes.map((b) => b.y1)) + MARGIN;
  return { nodes: placed, hub: centroid, titles, viewBox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/** El trazo de un hilo: entre funciones, curvo hacia el centro; dentro de una, un arco hacia afuera. */
export function edgePath(a: Point, b: Point, cross: boolean, centre: Point): string {
  if (cross) {
    const c1 = { x: a.x + (centre.x - a.x) * 0.28, y: a.y + (centre.y - a.y) * 0.28 };
    const c2 = { x: b.x + (centre.x - b.x) * 0.28, y: b.y + (centre.y - b.y) * 0.28 };
    return `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
  }
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ox = mid.x - centre.x;
  const oy = mid.y - centre.y;
  const ol = Math.hypot(ox, oy) || 1;
  return `M${a.x},${a.y} Q${mid.x + (ox / ol) * 16},${mid.y + (oy / ol) * 16} ${b.x},${b.y}`;
}
