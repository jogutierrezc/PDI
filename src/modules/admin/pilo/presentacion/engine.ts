/* =============================================================================
   La capa profunda de Pilo · el motor de la presentación.

   Sin React: recibe un lienzo y los datos del plan, y dibuja la malla de la
   memoria como un árbol radial que sale de Pilo (fuentes › pilares › áreas ›
   líneas de acción › proyectos, con la numeración del Mapa numerado). GSAP
   anima un solo objeto de estado —nube↔malla, relaciones, atenuado, anillos
   de las capas, pasajes encendidos, ruta— y el lienzo se redibuja en cada
   cuadro a partir de él.

   Los pasos (qué se anima en cada uno) viven aquí; su texto, en
   Presentation.tsx. Con movimiento reducido cada paso llega a su estado final
   sin recorrido, y la malla no respira.
   ========================================================================== */

import gsap from "gsap";

export interface PresentationData {
  pillars: { code: string; name: string }[];
  areas: { code: string; name: string; p: number }[];
  lines: { code: string; name: string; a: number }[];
  projects: { code: string; name: string; to: ["l" | "a", number][] }[];
  reports: { code: string; name: string }[];
  obs: string[];
}

export type SourceKey = "pdi" | "cifras" | "obs" | "bol" | "imp";

export const SOURCES: Record<SourceKey, { name: string; color: string }> = {
  pdi: { name: "Plan de Desarrollo", color: "#b592e6" },
  cifras: { name: "UDES en Cifras", color: "#6fa4f5" },
  obs: { name: "Observatorio", color: "#4fc2cf" },
  bol: { name: "Boletines", color: "#e58a5c" },
  imp: { name: "Portal de Impacto", color: "#7cc27d" },
};
export const SOURCE_ORDER: SourceKey[] = ["pdi", "cifras", "obs", "bol", "imp"];

interface Node {
  id: string;
  level: number;
  src: SourceKey;
  code: string;
  name: string;
  type: string;
  pi?: number;
  ghost?: boolean;
  hidden?: boolean;
  ang: number;
  cx: number;
  cy: number;
  phase: number;
}

interface Edge {
  a: Node;
  b: Node;
  kind: "contiene" | "vincula";
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const STOP = new Set(["para", "desde", "sobre", "entre", "hacia", "fortalecimiento", "desarrollo", "programa", "proyecto", "institucional"]);

/* --- El modelo: nodos, relaciones y el ejemplo ------------------------------------------- */

export interface Model {
  nodes: Node[];
  edges: Edge[];
  counts: { nodes: number; edges: number };
  focus: Node | null;
  focusLines: number;
  focusPillars: Node[];
  matches: Set<Node>;
  question: string;
  answer: string;
}

export function buildModel(data: PresentationData): Model {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const add = (n: Omit<Node, "ang" | "cx" | "cy" | "phase">) => {
    const node = { ...n, ang: 0, cx: 0, cy: 0, phase: 0 } as Node;
    nodes.push(node);
    return node;
  };
  const link = (a: Node, b: Node, kind: Edge["kind"] = "contiene") => edges.push({ a, b, kind });
  const hubs = {} as Record<SourceKey, Node>;
  for (const k of SOURCE_ORDER) hubs[k] = add({ id: `fuente:${k}`, level: 1, src: k, code: "", name: SOURCES[k].name, type: "fuente" });

  const P = data.pillars.map((p, i) => add({ id: `p${i}`, level: 2, src: "pdi", code: p.code, name: p.name, type: "pilar", pi: i }));
  P.forEach((p) => link(hubs.pdi, p));
  const A = data.areas.map((a, i) => add({ id: `a${i}`, level: 3, src: "pdi", code: a.code, name: a.name, type: "área estratégica", pi: a.p }));
  A.forEach((a, i) => P[data.areas[i].p] && link(P[data.areas[i].p], a));
  const L = data.lines.map((l, i) =>
    add({ id: `l${i}`, level: 4, src: "pdi", code: l.code, name: l.name.replace(/^[a-z]\.\s*/i, ""), type: "línea de acción", pi: data.areas[l.a]?.p }),
  );
  L.forEach((l, i) => A[data.lines[i].a] && link(A[data.lines[i].a], l));
  const R = data.projects.map((r, i) => add({ id: `r${i}`, level: 5, src: "pdi", code: r.code, name: r.name, type: "proyecto" }));
  R.forEach((r, i) =>
    data.projects[i].to.forEach(([k, j]) => {
      const parent = k === "l" ? L[j] : A[j];
      if (parent) link(parent, r, "vincula");
    }),
  );
  const REP = data.reports.map((r, i) => add({ id: `i${i}`, level: 3, src: "cifras", code: r.code, name: r.name, type: "informe" }));
  REP.forEach((r) => link(hubs.cifras, r));
  const OBS = data.obs.map((t, i) => add({ id: `o${i}`, level: 3, src: "obs", code: "", name: t, type: "tema" }));
  OBS.forEach((t) => link(hubs.obs, t));
  // Boletines e Impacto: sus nodos llegan al actualizar la memoria; aquí se ve su lugar.
  const BOL = ["Boletín en línea", "Edición en PDF", "Edición en PDF"].map((t, i) => add({ id: `b${i}`, level: 3, src: "bol", code: "", name: t, type: "boletín", ghost: true }));
  BOL.forEach((b) => link(hubs.bol, b));
  const IMP = ["Programas", "Facultades", "Indicadores"].map((t, i) => add({ id: `m${i}`, level: 3, src: "imp", code: "", name: t, type: "con sesión", ghost: true }));
  IMP.forEach((m) => link(hubs.imp, m));

  const parentsOf = (n: Node) => edges.filter((e) => e.b === n).map((e) => e.a);
  const kidsOf = (n: Node) => edges.filter((e) => e.a === n).map((e) => e.b);

  // El trazado: cada fuente recibe un sector proporcional a lo que tiene.
  const weight: Record<SourceKey, number> = { pdi: Math.max(12, L.length), cifras: REP.length * 2.6, obs: OBS.length * 2.4, bol: 9, imp: 9 };
  const total = SOURCE_ORDER.reduce((s, k) => s + weight[k], 0);
  const GAP = 0.06;
  let start = -Math.PI / 2 - ((weight.pdi / total) * (Math.PI * 2 - GAP * SOURCE_ORDER.length)) / 2;
  const sector = {} as Record<SourceKey, [number, number]>;
  for (const k of SOURCE_ORDER) {
    const span = (weight[k] / total) * (Math.PI * 2 - GAP * SOURCE_ORDER.length);
    sector[k] = [start, start + span];
    start += span + GAP;
  }
  const mean = (arr: number[]) => (arr.length ? Math.atan2(arr.reduce((s, a) => s + Math.sin(a), 0), arr.reduce((s, a) => s + Math.cos(a), 0)) : 0);
  const leaves: Node[] = [];
  for (const p of P) {
    const areasOf = kidsOf(p);
    if (!areasOf.length) leaves.push(p);
    for (const a of areasOf) {
      const own = kidsOf(a).filter((n) => n.level === 4);
      if (own.length) leaves.push(...own);
      else leaves.push(a);
    }
  }
  const [s0, s1] = sector.pdi;
  leaves.forEach((n, i) => (n.ang = s0 + ((i + 0.5) / Math.max(1, leaves.length)) * (s1 - s0)));
  A.forEach((a) => {
    const k = kidsOf(a).filter((n) => n.level === 4);
    if (k.length) a.ang = mean(k.map((n) => n.ang));
  });
  P.forEach((p) => {
    const k = kidsOf(p);
    if (k.length) p.ang = mean(k.map((n) => n.ang));
  });
  hubs.pdi.ang = (s0 + s1) / 2;
  R.forEach((r) => (r.ang = mean(parentsOf(r).map((n) => n.ang))));
  for (const [k, list] of [
    ["cifras", REP],
    ["obs", OBS],
    ["bol", BOL],
    ["imp", IMP],
  ] as [SourceKey, Node[]][]) {
    const [a0, a1] = sector[k];
    list.forEach((n, i) => (n.ang = a0 + ((i + 0.5) / list.length) * (a1 - a0)));
    hubs[k].ang = (a0 + a1) / 2;
  }
  // La nube de pasajes: lo mismo, sin relaciones.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  nodes.forEach((n) => {
    const r = 0.22 + Math.sqrt(rnd()) * 0.78;
    const a = rnd() * Math.PI * 2;
    n.cx = Math.cos(a) * r;
    n.cy = Math.sin(a) * r;
    n.phase = rnd() * 6.28;
  });

  // El ejemplo: el proyecto más conectado del plan.
  const focus = [...R].sort((x, y) => parentsOf(y).length - parentsOf(x).length)[0] ?? null;
  const focusLineNodes = focus ? parentsOf(focus).filter((n) => n.level === 4) : [];
  const pillarOf = (n: Node): Node | undefined => (n.level === 2 ? n : parentsOf(n)[0] ? pillarOf(parentsOf(n)[0]) : undefined);
  const focusPillars = focus ? [...new Set(parentsOf(focus).map(pillarOf).filter(Boolean) as Node[])] : [];
  const words = focus
    ? fold(focus.name)
        .split(/[^a-z0-9ñ]+/)
        .filter((w) => w.length >= 5 && !STOP.has(w))
    : [];
  const matches = new Set(nodes.filter((n) => words.some((w) => fold(n.name).includes(w))));
  const question = focus ? `¿Con qué partes del Plan de Desarrollo se conecta el proyecto ${focus.name}?` : "¿Qué pilares tiene el Plan de Desarrollo?";
  const answer = focus
    ? `«${focus.code} · ${focus.name}» se vincula con ${focusLineNodes.length} ${focusLineNodes.length === 1 ? "línea de acción" : "líneas de acción"} de ${focusPillars.length} ${focusPillars.length === 1 ? "pilar" : "pilares"}: ${focusPillars.map((p) => `${p.code} · ${p.name}`).join(", ")}`
    : `El Plan de Desarrollo tiene ${P.length} pilares: ${P.map((p) => `${p.code} · ${p.name}`).join(", ")}`;

  return {
    nodes,
    edges,
    counts: { nodes: nodes.filter((n) => !n.ghost).length, edges: edges.length },
    focus,
    focusLines: focusLineNodes.length,
    focusPillars,
    matches,
    question,
    answer,
  };
}

/* --- El lienzo ------------------------------------------------------------------------------- */

const RING: Record<number, number> = { 1: 0.27, 2: 0.45, 3: 0.63, 4: 0.82, 5: 1.0 };
const SIZE: Record<number, number> = { 1: 7, 2: 5.5, 3: 3.6, 4: 2.3, 5: 4.6 };
const PILLAR_TINT = ["#c3a4ee", "#a88be0", "#d0b6f2", "#9b7ad6", "#b99ae8", "#e0cdf7"];
const LAYERS = [
  { r: 0.105, name: "Catálogo" },
  { r: 0.145, name: "Reglas" },
  { r: 0.185, name: "Guardadas" },
  { r: 0.225, name: "IA" },
];
const CYAN = "#7fe7f0";

function rgba(hex: string, a: number) {
  const v = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${Math.max(0, Math.min(1, a))})`;
}

export type Face = "feliz" | "piensa" | "idea" | "bien";

export interface StageHandle {
  step: (i: number) => void;
  toggleSource: (k: SourceKey, on: boolean) => void;
  setExplore: (on: boolean) => void;
  destroy: () => void;
}

export function createStage(canvas: HTMLCanvasElement, host: HTMLElement, tip: HTMLElement, model: Model, reduce: boolean): StageHandle {
  const ctx = canvas.getContext("2d")!;
  const S = { morph: 0, edges: 0, nodes: 1, dim: 0, rings: 0, ringHot: -1, match: 0, chain: 0, labels: 0, face: "feliz" as Face };
  const { nodes, edges } = model;
  const parentsOf = (n: Node) => edges.filter((e) => e.b === n).map((e) => e.a);
  const kidsOf = (n: Node) => edges.filter((e) => e.a === n).map((e) => e.b);
  const chainOf = (n: Node): [Set<Node>, Set<Edge>] => {
    const ns = new Set<Node>([n]);
    const es = new Set<Edge>();
    const up = (x: Node) =>
      parentsOf(x).forEach((p) => {
        const e = edges.find((y) => y.a === p && y.b === x);
        if (e) es.add(e);
        if (!ns.has(p)) {
          ns.add(p);
          up(p);
        }
      });
    up(n);
    kidsOf(n).forEach((k) => {
      ns.add(k);
      const e = edges.find((y) => y.a === n && y.b === k);
      if (e) es.add(e);
    });
    return [ns, es];
  };
  const [focusNodes, focusEdges] = model.focus ? chainOf(model.focus) : [new Set<Node>(), new Set<Edge>()];
  let hover: Node | null = null;
  let pinned: Node | null = null;
  let explore = false;
  let W = 0;
  let H = 0;
  let CX = 0;
  let CY = 0;
  let RAD = 0;
  let time = 0;

  const faces = {} as Record<Face, HTMLImageElement>;
  for (const f of ["feliz", "piensa", "idea", "bien"] as Face[]) {
    const im = new Image();
    im.src = `/pilo-moods/${f}-320.webp`;
    faces[f] = im;
  }

  const resize = () => {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CX = W / 2;
    CY = H / 2;
    RAD = Math.min(W, H) * 0.44;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const pos = (n: Node): [number, number] => {
    const t = S.morph;
    const ease = t * t * (3 - 2 * t);
    const rr = RING[n.level] * RAD;
    const tx = CX + Math.cos(n.ang) * rr;
    const ty = CY + Math.sin(n.ang) * rr;
    const bx = CX + n.cx * RAD * 1.05;
    const by = CY + n.cy * RAD * 1.05;
    const k = Math.min(1, Math.max(0, ease * 1.15 - (n.level - 1) * 0.04));
    return [bx + (tx - bx) * k, by + (ty - by) * k];
  };
  const colorOf = (n: Node) => (n.src === "pdi" && n.level >= 2 ? PILLAR_TINT[(n.pi ?? 0) % PILLAR_TINT.length] : SOURCES[n.src].color);

  const draw = () => {
    time += 1 / 60;
    ctx.clearRect(0, 0, W, H);
    const active = explore ? pinned || hover : null;
    const [actN, actE] = active ? chainOf(active) : [null, null];
    const chainN = actN ?? (S.chain > 0 ? focusNodes : null);
    const chainE = actE ?? (S.chain > 0 ? focusEdges : null);
    const dimAmount = actN ? 1 : S.dim;

    // Las capas de adentro, como anillos alrededor de Pilo.
    if (S.rings > 0.01) {
      LAYERS.forEach((g, i) => {
        const hot = S.ringHot === i;
        const r = g.r * RAD * 2.1;
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, Math.PI * 2);
        ctx.strokeStyle = hot ? rgba(CYAN, 0.85 * S.rings) : rgba("#b9c9e6", 0.14 * S.rings);
        ctx.lineWidth = hot ? 2.2 : 1;
        ctx.setLineDash(i === 3 ? [3, 5] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = hot ? rgba(CYAN, S.rings) : rgba("#8196ba", 0.8 * S.rings);
        ctx.font = `700 ${hot ? 11 : 10}px Manrope, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(g.name.toUpperCase(), CX, CY - r - 5);
      });
    }

    // Relaciones: curvas que se doblan hacia el centro.
    if (S.edges > 0.01) {
      for (const e of edges) {
        if (e.a.hidden || e.b.hidden) continue;
        const [x1, y1] = pos(e.a);
        const [x2, y2] = pos(e.b);
        const lit = Boolean(chainE?.has(e));
        let a = (e.kind === "vincula" ? 0.22 : 0.16) * S.edges;
        if (!lit) a *= 1 - 0.85 * dimAmount;
        else a = Math.max(a, 0.9 * (actE ? 1 : S.chain));
        if (a < 0.01) continue;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const pull = e.kind === "vincula" ? 1.12 : 0.9;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(CX + (mx - CX) * pull, CY + (my - CY) * pull, x2, y2);
        ctx.strokeStyle = lit ? rgba(CYAN, a) : rgba(colorOf(e.b), a);
        ctx.lineWidth = lit ? 1.8 : e.kind === "vincula" ? 1 : 0.8;
        ctx.stroke();
      }
    }

    // Nodos: pasajes que respiran; los encontrados, encendidos.
    for (const n of nodes) {
      if (n.hidden) continue;
      const [x, y] = pos(n);
      const breathe = reduce ? 0 : Math.sin(time * 1.4 + n.phase) * 0.35;
      let r = (SIZE[n.level] + breathe) * (0.75 + S.morph * 0.25);
      let a = n.ghost ? 0.4 : 0.9;
      const lit = Boolean(chainN?.has(n));
      if (!lit) a *= 1 - 0.82 * dimAmount;
      const matched = model.matches.has(n) && S.match > 0;
      if (matched) {
        r += 2.5 * S.match;
        a = Math.max(a, S.match);
      }
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.8, r), 0, Math.PI * 2);
      if (n.ghost) {
        ctx.strokeStyle = rgba(colorOf(n), a);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = lit || matched ? rgba(CYAN, a) : rgba(colorOf(n), a * S.nodes);
        ctx.fill();
      }
      if (matched && !reduce) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5 + Math.sin(time * 4) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(CYAN, 0.35 * S.match);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Rótulos sin encimarse: primero el nodo en foco, luego fuentes, pilares, proyectos, áreas y líneas.
    const labelled = new Set<Node>();
    if (S.labels > 0.01) for (const n of nodes) if (n.level <= 2) labelled.add(n);
    if (chainN && (actN || S.chain > 0.5)) chainN.forEach((n) => labelled.add(n));
    const focusNode = active ?? (S.chain > 0.5 ? model.focus : null);
    const prio = (n: Node) => (n === focusNode ? 0 : n.level === 1 ? 1 : n.level === 2 ? 2 : n.level === 5 ? 3 : n.level === 3 ? 4 : 5);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const fits = (x: number, y: number, w: number, h: number) =>
      x > 4 && x + w < W - 4 && y - h / 2 > 4 && y + h / 2 < H - 4 && !placed.some((q) => x < q.x + q.w && x + w > q.x && y - h / 2 < q.y + q.h / 2 && y + h / 2 > q.y - q.h / 2);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const n of [...labelled].sort((m, k) => prio(m) - prio(k))) {
      if (n.hidden) continue;
      const [x, y] = pos(n);
      const isChain = Boolean(chainN?.has(n) && (actN || S.chain > 0.5));
      const a = isChain ? 1 : S.labels * (actN || S.dim > 0.5 ? 0.35 : 0.9);
      if (a < 0.02) continue;
      ctx.font = `${n.level <= 2 || n === focusNode ? 800 : 700} ${n.level === 1 ? 12.5 : 11}px Manrope, sans-serif`;
      const full = n.code ? `${n.code} · ${n.name}` : n.name;
      const options = [full.length > 38 ? `${full.slice(0, 37)}…` : full];
      if (n.code && n !== focusNode) options.push(n.code);
      let done = false;
      for (const t of options) {
        const w = ctx.measureText(t).width;
        const prefer = Math.cos(n.ang) >= 0;
        for (const right of [prefer, !prefer]) {
          const lx = right ? x + 9 : x - 9 - w;
          if (!fits(lx, y, w, 15)) continue;
          placed.push({ x: lx - 3, y, w: w + 6, h: 15 });
          ctx.lineWidth = 4;
          ctx.strokeStyle = rgba("#040d1f", 0.88 * a);
          ctx.strokeText(t, lx, y);
          ctx.fillStyle = isChain ? rgba(n === focusNode ? CYAN : "#eef4ff", a) : rgba(n.level === 1 ? colorOf(n) : "#b9c9e6", a);
          ctx.fillText(t, lx, y);
          done = true;
          break;
        }
        if (done) break;
      }
    }

    // Pilo en el centro: de ahí sale todo.
    const face = faces[S.face];
    const fr = Math.max(26, RAD * 0.11);
    ctx.beginPath();
    ctx.arc(CX, CY, fr + 6, 0, Math.PI * 2);
    ctx.fillStyle = rgba(CYAN, 0.08 + (reduce ? 0 : Math.sin(time * 1.2) * 0.03));
    ctx.fill();
    if (face?.complete && face.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, fr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(face, CX - fr, CY - fr, fr * 2, fr * 2);
      ctx.restore();
    }
  };
  gsap.ticker.add(draw);

  /* Explorar: el nodo más cercano al puntero, con su ruta en una ficha. */
  const nearest = (mx: number, my: number) => {
    let best: Node | null = null;
    let bd = 14 * 14;
    for (const n of nodes) {
      if (n.hidden) continue;
      const [x, y] = pos(n);
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  };
  const showTip = (n: Node | null, mx = 0, my = 0) => {
    if (!n) {
      tip.removeAttribute("data-on");
      return;
    }
    const route: string[] = [];
    const seen = new Set<Node>();
    let c: Node | undefined = n;
    while (c && !seen.has(c)) {
      seen.add(c);
      route.unshift(c.code || c.name);
      c = parentsOf(c)[0];
    }
    const k = kidsOf(n).length;
    const pr = parentsOf(n).length;
    tip.replaceChildren();
    const title = document.createElement("b");
    title.textContent = n.code ? `${n.code} · ${n.name}` : n.name;
    const kind = document.createElement("span");
    kind.textContent = `${n.type} · ${SOURCES[n.src].name}`;
    const path = document.createElement("span");
    path.textContent = route.join(" › ");
    tip.append(title, kind, path);
    if (k) tip.append(Object.assign(document.createElement("span"), { textContent: `Contiene ${k}` }));
    if (pr > 1) tip.append(Object.assign(document.createElement("span"), { textContent: `Cuelga de ${pr} lugares` }));
    tip.style.left = `${Math.min(W - 290, mx + 14)}px`;
    tip.style.top = `${Math.min(H - 120, my + 14)}px`;
    tip.dataset.on = "";
  };
  const onMove = (e: PointerEvent) => {
    if (!explore) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    hover = nearest(mx, my);
    canvas.style.cursor = hover ? "pointer" : "default";
    showTip(hover, mx, my);
  };
  const onLeave = () => {
    hover = null;
    showTip(null);
  };
  const onClick = (e: MouseEvent) => {
    if (!explore) return;
    const r = canvas.getBoundingClientRect();
    const n = nearest(e.clientX - r.left, e.clientY - r.top);
    pinned = n && n !== pinned ? n : null;
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);

  /* Los pasos. */
  let tl: gsap.core.Timeline | null = null;
  const STEPS: ((t: gsap.core.Timeline) => void)[] = [
    (t) => t.to(S, { morph: 1, edges: 1, labels: 1, dim: 0, rings: 0, match: 0, chain: 0, duration: 1.2, ease: "power3.inOut" }).set(S, { face: "feliz" }, 0),
    (t) => t.to(S, { morph: 1, edges: 1, dim: 0.7, rings: 1, ringHot: -1, labels: 0.4, match: 0, chain: 0, duration: 0.7, ease: "power3.out" }).set(S, { face: "piensa" }, 0),
    (t) => t.to(S, { morph: 1, edges: 1, dim: 0.7, rings: 1, labels: 0.4, duration: 0.3 }).set(S, { ringHot: 0 }).to({}, { duration: 0.55 }).set(S, { ringHot: 1 }).to({}, { duration: 0.55 }).set(S, { ringHot: -1 }),
    (t) => t.to(S, { morph: 1, edges: 1, dim: 0.7, rings: 1, labels: 0.4, duration: 0.3 }).set(S, { ringHot: 2 }).to({}, { duration: 0.8 }).set(S, { ringHot: -1 }),
    (t) =>
      t
        .to(S, { edges: 0, labels: 0, dim: 0, rings: 0.35, chain: 0, duration: 0.5, ease: "power2.out" })
        .to(S, { morph: 0, duration: 1.3, ease: "power3.inOut" }, 0.1)
        .to(S, { match: 1, duration: 0.6, ease: "power2.out" }, 1.1)
        .set(S, { face: "piensa" }, 0),
    (t) =>
      t
        .to(S, { morph: 1, rings: 0.35, duration: 1.5, ease: "power3.inOut" })
        .to(S, { edges: 1, labels: 1, duration: 0.8, ease: "power2.out" }, 0.9)
        .to(S, { match: 0, dim: 0.85, duration: 0.5 }, 1.4)
        .to(S, { chain: 1, duration: 0.6, ease: "power2.out" }, 1.5)
        .set(S, { face: "idea" }, 1.5),
    (t) => t.to(S, { morph: 1, edges: 1, labels: 1, dim: 0.85, chain: 1, rings: 0.6, match: 0, duration: 0.6 }).set(S, { ringHot: 3, face: "bien" }).to({}, { duration: 0.35 }).set(S, { ringHot: -1 }),
    (t) => t.to(S, { morph: 1, edges: 1, labels: 1, dim: 0, chain: 0, rings: 0, match: 0, duration: 0.7, ease: "power3.out" }).set(S, { face: "feliz" }, 0),
  ];

  return {
    step(i) {
      tl?.progress(1).kill();
      pinned = null;
      hover = null;
      showTip(null);
      tl = gsap.timeline();
      STEPS[Math.max(0, Math.min(STEPS.length - 1, i))](tl);
      if (reduce) tl.progress(1);
    },
    toggleSource(k, on) {
      nodes.forEach((n) => {
        if (n.src === k) n.hidden = !on;
      });
    },
    setExplore(on) {
      explore = on;
      if (!on) {
        pinned = null;
        hover = null;
        showTip(null);
      }
    },
    destroy() {
      tl?.kill();
      gsap.ticker.remove(draw);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
    },
  };
}

export const STEP_COUNT = 8;
