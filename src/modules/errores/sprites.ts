/* =============================================================================
   Páginas de error · sprites en pixel art.

   Cada sprite es una cuadrícula de letras con su paleta. Se pinta una sola vez
   en un canvas y se entrega como data URL; se muestra ampliado con
   `image-rendering: pixelated`, así que no pesa nada y no depende de archivos.
   ========================================================================== */

export type SpriteNombre = "star" | "coin" | "q" | "bolt" | "gear" | "cone" | "lock" | "cloud";

interface Definicion {
  filas: string[];
  paleta: Record<string, string>;
}

const DEFINICIONES: Record<SpriteNombre, Definicion> = {
  star: {
    filas: ["....o....", "...oyo...", "...oyo...", "ooooyoooo", "oywyyyyyo", ".oyyyyyo.", ".oyyyyyo.", "oyyoooyyo", "ooo...ooo"],
    paleta: { o: "#B4540A", y: "#FFD21F", w: "#FFF6B0" },
  },
  coin: {
    filas: ["..oooo..", ".oyyyyo.", "oywwyydo", "oywyyydo", "oyyyyydo", "oyyyyddo", ".oddddo.", "..oooo.."],
    paleta: { o: "#9A5A00", y: "#FFC52E", w: "#FFF1A8", d: "#E39A12" },
  },
  q: {
    filas: [".wwwww.", "ww...ww", "ww...ww", ".....ww", "...www.", "...ww..", ".......", "...ww..", "...ww.."],
    paleta: { w: "#FFFFFF" },
  },
  bolt: {
    filas: ["....yyy", "...yyy.", "..yyy..", ".yyyyyy", "...yyy.", "..yyy..", ".yyy...", ".yy....", "yy.....", "y......"],
    paleta: { y: "#FFE14A" },
  },
  gear: {
    filas: ["...ggg...", ".g.ggg.g.", ".ggggggg.", "ggg...ggg", "ggg...ggg", "ggg...ggg", ".ggggggg.", ".g.ggg.g.", "...ggg..."],
    paleta: { g: "#C9D6F5" },
  },
  cone: {
    filas: ["...oo...", "..oooo..", "..owwo..", ".oooooo.", ".owwwwo.", ".oooooo.", "oooooooo", "oooooooo", "dddddddd"],
    paleta: { o: "#FF7A1A", w: "#FFFFFF", d: "#2B2B2B" },
  },
  lock: {
    filas: ["..dddd..", ".d....d.", ".d....d.", "dddddddd", "dyyyyyyd", "dyyddyyd", "dyyddyyd", "dyyyyyyd", "dddddddd"],
    paleta: { d: "#7A4B00", y: "#FFC93C" },
  },
  cloud: {
    filas: [
      "......wwww..........",
      "....wwwwwwww..wwww..",
      "..wwwwwwwwwwwwwwwwww",
      "wwwwwwwwwwwwwwwwwwww",
      "wwwwwwwwwwwwwwwwwwww",
      ".ssssssssssssssssss.",
    ],
    paleta: { w: "#FFFFFF", s: "#BFD6F2" },
  },
};

export interface Sprite {
  src: string;
  w: number;
  h: number;
}

const cache = new Map<SpriteNombre, Sprite>();

export function sprite(nombre: SpriteNombre): Sprite {
  const guardado = cache.get(nombre);
  if (guardado) return guardado;
  const { filas, paleta } = DEFINICIONES[nombre];
  const h = filas.length;
  const w = filas[0].length;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (g) {
    filas.forEach((fila, y) =>
      [...fila].forEach((letra, x) => {
        const color = paleta[letra];
        if (color) {
          g.fillStyle = color;
          g.fillRect(x, y, 1, 1);
        }
      }),
    );
  }
  const hecho = { src: canvas.toDataURL(), w, h };
  cache.set(nombre, hecho);
  return hecho;
}

/** Un <img> del sprite, ampliado a `ancho` píxeles de pantalla. */
export function imagenSprite(nombre: SpriteNombre, ancho: number): HTMLImageElement {
  const s = sprite(nombre);
  const img = document.createElement("img");
  const alto = Math.round((ancho * s.h) / s.w);
  img.src = s.src;
  img.alt = "";
  img.width = ancho;
  img.height = alto;
  img.style.width = `${ancho}px`;
  img.style.height = `${alto}px`;
  return img;
}
