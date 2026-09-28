/* =============================================================================
   Mr. Pilo en SVG · separa los dibujos en capas animables.

   Entrada: public/datos-abiertos/pilosvg/pilo_<emoción>.svg (calco automático,
   un <path> por color, sin nombres). Los originales no se tocan.
   Salida:  public/pilo-svg/<emoción>.svg, con grupos de clase estable:

     pm-back    silueta rellena de piel (tapa las rendijas del calco y lo que
                queda al descubierto cuando una capa se mueve)
     pm-face    piel, sombras y todo lo que no se mueve por separado
     pm-hair    pelo
     pm-eyes    › pm-eye-l / pm-eye-r › pm-pupil (iris, pupila y brillos)
     pm-brows   cejas › pm-brow-l / pm-brow-r
     pm-beak    pico superior y boca › pm-jaw (pico inferior y lengua)
     pm-glasses montura y cristales
     pm-extra   lo propio de cada gesto (en «pensar», la mano y las marcas)

   Cada parte se reconoce por la familia de color (lib.mjs · family) y por
   su posición: las regiones de SPEC están en una rejilla de 1000 × 1000 sobre
   el dibujo (×1,254 = coordenadas originales). Las ids llevan el marcador
   «__PM__» para que el componente las haga únicas por instancia.

   Ejecutar con: node scripts/pilo-svg/build.mjs          (escribe las capas)
                 node scripts/pilo-svg/build.mjs --debug  (y una lámina de
                 control por colores en scripts/pilo-svg/debug/)
   ========================================================================== */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseRings, ringsToShapes, shapeToD, family, hsl, inEllipse, pointInRing, ringToD } from "./lib.mjs";

const SRC = "public/datos-abiertos/pilosvg";
const OUT = "public/pilo-svg";
const K = 1.254; // rejilla de 1000 → coordenadas del dibujo
const EPS = 1.1; // tolerancia de simplificación (unidades del dibujo)
const DEBUG = process.argv.includes("--debug");

/*
 * Regiones por gesto, en la rejilla de 1000. Polígonos [[x, y], …], elipses
 * [cx, cy, rx, ry]. hinge: bisagra de la mandíbula (y signo del giro que abre
 * la boca). Las pupilas se buscan dentro del iris; los ojos, dentro de la
 * elipse del ojo; el resto por polígono.
 */
const SPEC = {
  atrevido: {
    eyeL: [265, 462, 88, 72],
    eyeR: [652, 572, 118, 92],
    irisL: [272, 468, 50, 52],
    irisR: [650, 565, 66, 72],
    browL: [[215, 262], [340, 262], [340, 335], [215, 335]],
    browR: [[575, 355], [815, 355], [815, 430], [575, 430]],
    hair: [[0, 0], [1000, 0], [1000, 620], [950, 600], [930, 480], [880, 380], [850, 330], [780, 300], [700, 290], [600, 290], [540, 300], [485, 330], [470, 420], [420, 425], [380, 370], [330, 300], [250, 282], [170, 300], [100, 325], [0, 340]],
    glasses: [
      [[40, 320], [130, 285], [270, 322], [400, 395], [500, 420], [600, 405], [780, 435], [875, 500], [880, 650], [720, 745], [545, 715], [505, 640], [480, 530], [420, 500], [370, 565], [250, 590], [120, 580], [80, 510], [35, 400]],
    ],
    lenses: [
      [[128, 350], [240, 378], [332, 420], [330, 480], [255, 522], [150, 528], [118, 450]],
      [[522, 482], [640, 456], [762, 482], [828, 550], [820, 650], [722, 690], [600, 668], [540, 600]],
    ],
    beak: [[95, 600], [200, 535], [330, 510], [425, 495], [490, 525], [565, 600], [610, 650], [600, 700], [520, 725], [420, 725], [330, 725], [255, 745], [185, 805], [150, 818], [115, 775], [95, 700]],
    jaw: [[240, 765], [330, 705], [430, 705], [560, 690], [625, 655], [650, 690], [605, 790], [525, 862], [400, 892], [290, 872], [240, 815]],
    hinge: [612, 668, -1],
  },
  emocionado: {
    eyeL: [272, 455, 92, 90],
    eyeR: [615, 540, 112, 102],
    irisL: [290, 455, 57, 57],
    irisR: [605, 545, 82, 87],
    browL: [[228, 232], [362, 232], [362, 302], [228, 302]],
    browR: [[588, 308], [792, 308], [792, 428], [588, 428]],
    hair: [[0, 0], [1000, 0], [1000, 600], [950, 560], [920, 470], [880, 400], [850, 330], [780, 290], [700, 280], [600, 290], [560, 320], [550, 390], [470, 400], [400, 380], [370, 320], [330, 270], [270, 250], [200, 290], [0, 300]],
    glasses: [
      [[85, 300], [200, 280], [335, 295], [420, 380], [520, 386], [660, 374], [815, 435], [885, 530], [865, 635], [740, 718], [555, 700], [490, 612], [465, 505], [405, 470], [345, 525], [305, 592], [160, 606], [95, 565], [75, 420]],
    ],
    lenses: [
      [[150, 345], [310, 340], [390, 420], [362, 520], [300, 562], [170, 562], [140, 450]],
      [[520, 445], [650, 425], [780, 470], [830, 540], [800, 620], [720, 665], [580, 650], [525, 560]],
    ],
    beak: [[112, 650], [215, 515], [330, 475], [440, 455], [540, 500], [565, 600], [575, 660], [520, 684], [420, 684], [320, 700], [260, 722], [180, 772], [148, 764], [128, 700]],
    jaw: [[268, 730], [360, 718], [470, 718], [560, 680], [595, 655], [595, 720], [562, 802], [522, 864], [450, 915], [350, 925], [288, 884], [262, 800]],
    hinge: [572, 680, -1],
  },
  loco: {
    eyeL: [290, 462, 112, 97],
    eyeR: [635, 540, 102, 77],
    irisL: [315, 468, 58, 58],
    irisR: [595, 512, 48, 48],
    browL: [[238, 232], [382, 232], [382, 312], [238, 312]],
    browR: [[572, 348], [772, 348], [772, 432], [572, 432]],
    hair: [[0, 0], [1000, 0], [1000, 600], [960, 520], [900, 470], [850, 400], [820, 330], [760, 300], [660, 310], [580, 330], [555, 380], [540, 440], [480, 450], [410, 420], [390, 350], [340, 290], [270, 265], [200, 290], [150, 330], [0, 330]],
    glasses: [
      [[80, 335], [180, 295], [325, 300], [445, 412], [540, 418], [705, 442], [848, 505], [878, 602], [815, 698], [698, 708], [552, 648], [512, 602], [488, 522], [440, 508], [425, 565], [352, 588], [200, 598], [105, 566], [72, 450]],
    ],
    lenses: [
      [[150, 350], [310, 345], [410, 440], [400, 520], [330, 560], [190, 565], [140, 450]],
      [[540, 480], [650, 470], [790, 520], [830, 590], [790, 650], [700, 660], [590, 610], [550, 560]],
    ],
    beak: [[148, 705], [200, 598], [300, 555], [420, 505], [505, 505], [585, 588], [635, 640], [622, 684], [540, 692], [430, 692], [320, 702], [250, 722], [200, 792], [158, 802]],
    jaw: [[248, 762], [330, 710], [450, 700], [560, 690], [635, 660], [635, 722], [592, 802], [522, 882], [430, 938], [330, 932], [288, 862], [258, 802]],
    hinge: [622, 672, -1],
  },
  pensar: {
    eyeL: [300, 410, 80, 90],
    eyeR: [615, 500, 112, 88],
    irisL: [285, 420, 50, 52],
    irisR: [580, 485, 64, 67],
    browL: [[258, 232], [382, 232], [382, 312], [258, 312]],
    browR: [[568, 292], [762, 292], [762, 402], [568, 402]],
    hair: [[0, 0], [1000, 0], [1000, 450], [930, 430], [900, 330], [850, 280], [760, 260], [640, 250], [560, 260], [540, 300], [540, 350], [500, 380], [420, 360], [380, 320], [350, 260], [300, 240], [240, 260], [0, 280]],
    glasses: [
      [[125, 300], [200, 268], [335, 280], [455, 362], [540, 368], [705, 392], [808, 445], [840, 522], [765, 648], [640, 660], [512, 615], [488, 522], [472, 448], [440, 448], [425, 488], [352, 522], [230, 540], [145, 518], [112, 400]],
    ],
    lenses: [
      [[190, 320], [330, 320], [430, 390], [410, 450], [340, 490], [230, 495], [180, 420]],
      [[530, 430], [640, 420], [760, 450], [800, 520], [760, 600], [660, 620], [560, 590], [520, 520]],
    ],
    beak: [[148, 640], [200, 558], [300, 498], [420, 478], [502, 508], [562, 578], [578, 630], [540, 660], [450, 670], [350, 680], [270, 690], [210, 722], [168, 702]],
    jaw: [[240, 682], [330, 662], [450, 652], [550, 625], [575, 650], [522, 702], [430, 722], [330, 732], [262, 722]],
    hinge: [562, 642, -1],
    // La mano bajo el pico.
    extra: [[[158, 832], [200, 758], [262, 698], [330, 688], [420, 688], [478, 700], [484, 762], [424, 782], [385, 800], [405, 852], [385, 892], [322, 925], [262, 965], [196, 955], [155, 900]]],
  },
};

/* ── clasificar ───────────────────────────────────────────────────────────── */

const kp = (poly) => poly.map(([x, y]) => [x * K, y * K]);
const ke = ([cx, cy, rx, ry]) => [cx * K, cy * K, rx * K, ry * K];

function regions(spec) {
  return {
    eyeL: ke(spec.eyeL),
    eyeR: ke(spec.eyeR),
    irisL: ke(spec.irisL),
    irisR: ke(spec.irisR),
    browL: kp(spec.browL),
    browR: kp(spec.browR),
    hair: kp(spec.hair),
    glasses: spec.glasses.map(kp),
    lenses: spec.lenses.map(kp),
    beak: kp(spec.beak),
    jaw: kp(spec.jaw),
    extra: spec.extra ? spec.extra.map(kp) : [],
    hinge: [spec.hinge[0] * K, spec.hinge[1] * K, spec.hinge[2]],
  };
}

/** Qué parte es una forma. Devuelve la clave del grupo. */
export function classify(shape, fam, R) {
  const c = shape.center;
  const b = shape.box;
  const corners = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]];
  const within = (e, grow = 1) => corners.every((p) => inEllipse(p, [e[0], e[1], e[2] * grow, e[3] * grow]));
  // Voto de los vértices: una montura con forma de anillo tiene el centro
  // dentro del cristal, pero casi todos sus vértices sobre la montura.
  const step = Math.max(1, Math.floor(shape.outer.length / 24));
  const pts = shape.outer.filter((_, i) => i % step === 0);
  const share = (poly) => pts.filter((p) => pointInRing(p, poly)).length / pts.length;
  const inPoly = (poly) => share(poly) >= 0.55;

  if (R.extra.some(inPoly)) return "extra";
  if (fam !== "vivid") {
    // El iris del calco suele salirse un poco del círculo: basta con que el
    // centro caiga dentro y la caja no se vaya lejos.
    const iris = (e) => within(e, 1.12) || (fam !== "white" && inEllipse(c, [e[0], e[1], e[2] * 0.75, e[3] * 0.75]) && within(e, 1.4));
    if (iris(R.irisL)) return "pupilL";
    if (iris(R.irisR)) return "pupilR";
  }
  if (fam !== "vivid") {
    if (inEllipse(c, R.eyeL) && within(R.eyeL, 1.2)) return "eyeL";
    if (inEllipse(c, R.eyeR) && within(R.eyeR, 1.2)) return "eyeR";
  }
  if (fam === "ink" || fam === "red") {
    if (inPoly(R.browL)) return "browL";
    if (inPoly(R.browR)) return "browR";
  }
  if (inPoly(R.jaw) && fam !== "skin") return "jaw";
  if (inPoly(R.jaw) && fam === "skin" && hsl(shape.fill)[1] > 0.85) return "jaw";
  if (inPoly(R.beak) && fam !== "skin" && fam !== "vivid") return "beak";
  const onFrame = (poly) => share(poly) >= 0.6 && R.lenses.every((l) => share(l) < 0.4);
  if (fam !== "grey" && R.glasses.some(onFrame)) return "glasses";
  if (inPoly(R.beak) && (fam === "vivid" || fam === "red")) return "beak"; // boca
  if (inPoly(R.hair)) return "hair";
  return "face";
}

/* ── escribir ─────────────────────────────────────────────────────────────── */

const ORDER = ["face", "hair", "eyes", "brows", "beak", "glasses", "extra"];

function build(emotion) {
  const src = readFileSync(`${SRC}/pilo_${emotion}.svg`, "utf8");
  const clip = src.match(/<clipPath[^>]*><path d="([^"]+)"/)[1];
  const paths = [...src.matchAll(/<path fill="(#[0-9a-f]{6})"[^>]*?d="([^"]+)"/gi)];
  const R = regions(SPEC[emotion]);
  const groups = {};
  const push = (key, fill, d) => ((groups[key] ??= new Map()).get(fill) ? groups[key].get(fill).push(d) : groups[key].set(fill, [d]));
  const stats = {};
  for (const [, fill, d] of paths) {
    const fam = family(fill);
    for (const s of ringsToShapes(parseRings(d))) {
      s.fill = fill;
      const key = classify(s, fam, R);
      stats[key] = (stats[key] ?? 0) + 1;
      const dd = shapeToD(s, EPS, 1);
      if (dd) push(key, fill, dd);
    }
  }

  const paint = (key) =>
    groups[key]
      ? [...groups[key]].map(([fill, ds]) => `<path fill="${fill}" stroke="${fill}" d="${ds.join("")}"/>`).join("")
      : "";
  // Relleno bajo cada ojo (color del blanco) para que la pupila, al moverse,
  // no deje ver la piel; y bajo la boca, el rojo oscuro de la garganta.
  const whiteOf = (key) => {
    const g = groups[key];
    if (!g) return "#f4f1f0";
    let best = "#f4f1f0", bl = 0;
    for (const f of g.keys()) if (family(f) === "white" && hsl(f)[2] > bl) (bl = hsl(f)[2]), (best = f);
    return best;
  };
  const eye = (side) => {
    const key = side === "l" ? "eyeL" : "eyeR";
    const pk = side === "l" ? "pupilL" : "pupilR";
    return (
      `<g class="pm-eye pm-eye-${side}">` +
      paint(key) +
      (groups[pk] ? `<path class="pm-sclera" fill="${whiteOf(key)}" d="${outline(groups[pk])}"/>` : "") +
      `<g class="pm-pupil">${paint(pk)}</g></g>`
    );
  };
  const throat = groups.jaw
    ? `<path class="pm-throat" fill="${darkest(groups.beak) ?? "#5a1204"}" d="${outline(groups.jaw)}"/>`
    : "";
  const [hx, hy, hs] = R.hinge;
  const skin = mostCommonSkin(groups.face);

  const body = [
    `<g class="pm-back" clip-path="url(#__PM__clip)"><path fill="${skin}" d="${ringToD(parseRings(clip)[0])}"/></g>`,
    `<g class="pm-face" clip-path="url(#__PM__clip)">${paint("face")}</g>`,
    `<g class="pm-hair" clip-path="url(#__PM__clip)">${paint("hair")}</g>`,
    `<g class="pm-eyes">${eye("l")}${eye("r")}</g>`,
    `<g class="pm-brows"><g class="pm-brow-l">${paint("browL")}</g><g class="pm-brow-r">${paint("browR")}</g></g>`,
    `<g class="pm-beak" data-hinge="${r1(hx)} ${r1(hy)} ${hs}">${throat}${paint("beak")}<g class="pm-jaw">${paint("jaw")}</g></g>`,
    `<g class="pm-glasses">${paint("glasses")}</g>`,
    `<g class="pm-extra">${paint("extra")}${extraMarks(emotion)}</g>`,
    // Luz y volumen: un brillo suave arriba a la izquierda y la sombra del
    // borde de la esfera. El componente los desplaza al revés de la mirada,
    // como si la luz se quedara quieta mientras la cabeza gira.
    `<g clip-path="url(#__PM__clip)" stroke="none"><g class="pm-light">` +
      `<rect x="-200" y="-200" width="1654" height="1654" fill="url(#__PM__shade)" style="mix-blend-mode:multiply"/>` +
      `<ellipse cx="440" cy="400" rx="380" ry="300" fill="url(#__PM__glow)" style="mix-blend-mode:soft-light"/>` +
      `</g></g>`,
  ].join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" data-emotion="${emotion}">` +
    `<defs><clipPath id="__PM__clip"><path d="${ringToD(parseRings(clip)[0])}"/></clipPath>` +
    `<radialGradient id="__PM__glow"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="__PM__shade" cx="600" cy="560" r="720" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#7a2e12" stop-opacity="0"/><stop offset="1" stop-color="#7a2e12" stop-opacity=".42"/></radialGradient></defs>` +
    // El trazo del mismo color cierra las rendijas que deja el calco entre
    // manchas vecinas (sin él se ve la piel del fondo como grietas).
    `<g fill-rule="evenodd" stroke-width="3" stroke-linejoin="round">${body}</g></svg>`;
  return { svg, stats };
}

const r1 = (n) => Math.round(n);

function darkest(g) {
  if (!g) return null;
  let best = null, bl = 1;
  for (const f of g.keys()) {
    const [h, s, l] = hsl(f);
    if (s > 0.4 && (h < 30 || h > 340) && l < bl && l > 0.08) (bl = l), (best = f);
  }
  return best;
}

/** Contornos exteriores de un grupo (sin agujeros): lo que queda al moverlo. */
function outline(g) {
  const outs = [];
  for (const ds of g.values()) for (const d of ds) outs.push(d.split("z")[0] + "z");
  return outs.join("");
}

function mostCommonSkin(g) {
  let best = "#f7c79c", n = 0;
  for (const [f, ds] of g ?? []) if (family(f) === "skin" && ds.length > n) (n = ds.length), (best = f);
  return best;
}

/** «pensar» no trae marcas de pensamiento: se dibujan aquí, arriba a la derecha. */
function extraMarks(emotion) {
  if (emotion !== "pensar") return "";
  return (
    `<g class="pm-thought" fill="#fffaf3" stroke="#6b2a12" stroke-width="9">` +
    `<circle cx="1110" cy="132" r="14"/><circle cx="1160" cy="84" r="20"/><circle cx="1214" cy="32" r="26"/></g>`
  );
}

/* ── lámina de control ────────────────────────────────────────────────────── */

async function debugSheet(emotion, svg) {
  const { default: sharp } = await import("sharp");
  mkdirSync("scripts/pilo-svg/debug", { recursive: true });
  let t = svg.replaceAll("__PM__", "d");
  // Cada grupo en un tinte plano; la mandíbula y la pupila aparte.
  const style =
    `<style>.pm-hair path{fill:#e23}.pm-eye path{fill:#2c6}.pm-pupil path{fill:#fd0}.pm-brow-l path{fill:#f0f}.pm-brow-r path{fill:#f8f}` +
    `.pm-beak path{fill:#0cf}.pm-jaw path{fill:#80f}.pm-glasses path{fill:#24f}.pm-extra path,.pm-extra circle{fill:#000}.pm-throat{fill:#600!important}.pm-sclera{fill:#fff!important}</style>`;
  t = t.replace("<defs>", `<rect width="1254" height="1254" fill="#111"/><defs>`).replace("</svg>", style + "</svg>");
  const a = await sharp(Buffer.from(svg.replaceAll("__PM__", "o"))).resize(500).png().toBuffer();
  const b = await sharp(Buffer.from(t)).resize(500).png().toBuffer();
  await sharp({ create: { width: 1000, height: 500, channels: 4, background: "#fff" } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: 500, top: 0 }])
    .png()
    .toFile(`scripts/pilo-svg/debug/${emotion}.png`);
}

mkdirSync(OUT, { recursive: true });
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
for (const emotion of Object.keys(SPEC)) {
  if (only && only !== emotion) continue;
  const { svg, stats } = build(emotion);
  writeFileSync(`${OUT}/${emotion}.svg`, svg);
  console.log(`${emotion}: ${(svg.length / 1024).toFixed(0)} KB`, JSON.stringify(stats));
  if (DEBUG) await debugSheet(emotion, svg);
}
