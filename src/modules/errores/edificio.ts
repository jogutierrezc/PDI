/* =============================================================================
   Páginas de error · el campus en pixel art.

   Un SVG de rectángulos (sin curvas, con `crispEdges`) que imita el edificio de
   la referencia: ladrillo naranja, torre de vidrio, letrero «UDES ¡Piensa
   Global!», escaleras, setos y palmera. Los colores del vidrio y de las
   ventanas salen de variables CSS, así que el mismo dibujo sirve de día, de
   noche y en tormenta. El andamio y la cinta de obra solo se ven en el 503.
   ========================================================================== */

const r = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

function construir(): string {
  let s = `<svg viewBox="0 0 480 300" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="err-brk" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#E58A47"/><rect y="7" width="16" height="1" fill="#C86A2E"/><rect y="15" width="16" height="1" fill="#C86A2E"/><rect x="7" width="1" height="7" fill="#C86A2E"/><rect x="15" y="8" width="1" height="7" fill="#C86A2E"/></pattern>
    <pattern id="err-tape" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#FFD21F"/><rect x="8" width="8" height="8" fill="#2B2B2B"/></pattern>
  </defs>`;
  s += r(0, 0, 480, 300, "url(#err-brk)") + r(0, 0, 480, 6, "#B85A27");
  for (const y of [112, 186]) s += r(0, y, 480, 5, "#F2B06B") + r(0, y + 5, 480, 2, "#C27A3A");

  // Ventanas de las alas.
  const ventanas: Array<[number, number]> = [[20, 50], [80, 50], [20, 124], [80, 124], [20, 198], [80, 198], [336, 50], [396, 50], [336, 124], [396, 124], [336, 198], [396, 198]];
  ventanas.forEach(([x, y], i) => {
    const vidrio = i % 3 === 1 ? "var(--e-glass)" : "var(--e-win)";
    s += r(x - 3, y - 3, 50, 44, "#233A7A") + r(x, y, 44, 34, vidrio) + r(x, y, 44, 4, "rgba(255,255,255,.35)") + r(x + 21, y, 2, 34, "#233A7A") + r(x - 4, y + 38, 52, 4, "#F2B06B");
  });

  // Pilastras y torre de vidrio.
  for (const x of [162, 292]) s += r(x, 8, 26, 262, "#F2B06B") + r(x, 8, 4, 262, "#FFD3A0") + r(x + 22, 8, 4, 262, "#C27A3A");
  s += r(190, 14, 100, 256, "#25408F") + r(194, 18, 92, 248, "var(--e-glass)");
  for (let y = 18; y < 266; y += 24) s += r(194, y, 92, 3, "#25408F");
  s += r(240, 18, 3, 248, "#25408F") + r(200, 24, 6, 90, "rgba(255,255,255,.28)") + r(212, 40, 3, 60, "rgba(255,255,255,.2)");

  // Letrero.
  s += r(184, 146, 112, 46, "#fff") + r(187, 149, 106, 40, "#1F3FA8");
  s += `<text x="240" y="171" text-anchor="middle" fill="#fff" font-family="Pixelify Sans, sans-serif" font-weight="700" font-size="22" font-style="italic" shape-rendering="auto">UDES</text>`;
  s += `<text x="240" y="184" text-anchor="middle" fill="#cfe0ff" font-family="Pixelify Sans, sans-serif" font-size="9" font-style="italic" shape-rendering="auto">¡Piensa Global!</text>`;

  // Puerta y escaleras.
  s += r(204, 206, 72, 62, "#1B2750") + r(208, 210, 30, 54, "var(--e-glass)") + r(242, 210, 30, 54, "var(--e-glass)");
  s += r(208, 210, 30, 5, "rgba(255,255,255,.3)") + r(242, 210, 30, 5, "rgba(255,255,255,.3)") + r(236, 232, 2, 12, "#F2B06B") + r(242, 232, 2, 12, "#F2B06B");
  for (const [x, y, w] of [[196, 270, 88], [190, 276, 100], [184, 282, 112], [178, 288, 124], [172, 294, 136]]) s += r(x, y, w, 6, "#F4A765") + r(x, y + 4, w, 2, "#D9783A");

  // Setos, cipreses y palmera.
  for (const x of [84, 314]) s += r(x, 268, 82, 32, "#2F9E44") + r(x, 268, 82, 5, "#4CC261") + r(x, 294, 82, 6, "#1F7A33");
  for (const x of [150, 322]) s += r(x + 4, 226, 8, 48, "#1F7A33") + r(x, 234, 16, 32, "#2F9E44") + r(x + 3, 220, 10, 14, "#2F9E44") + r(x + 6, 214, 4, 8, "#2F9E44");
  s += r(60, 226, 6, 46, "#8A5A2B") + r(50, 214, 26, 6, "#2F9E44") + r(62, 214, 26, 6, "#2F9E44") + r(54, 208, 14, 6, "#4CC261") + r(64, 208, 14, 6, "#4CC261") + r(44, 220, 12, 6, "#1F7A33") + r(70, 220, 12, 6, "#1F7A33") + r(58, 202, 16, 6, "#2F9E44");

  // Andamio y cinta de obra (mantenimiento).
  s += `<g class="err-andamio">`;
  for (let x = 10; x <= 154; x += 36) s += r(x, 36, 3, 234, "#E8E1D0") + r(x + 1, 36, 1, 234, "#9A927E");
  for (let y = 56; y <= 256; y += 50) s += r(10, y, 147, 4, "#F2B33A") + r(10, y + 4, 147, 2, "#9A6A10");
  for (let y = 56; y < 256; y += 50) for (let x = 10; x < 154; x += 36) s += r(x + 3, y + 6, 33, 2, "rgba(232,225,208,.8)");
  s += `</g><g class="err-cinta">${r(196, 224, 88, 8, "url(#err-tape)")}${r(196, 246, 88, 8, "url(#err-tape)")}</g>`;
  return `${s}</svg>`;
}

export const EDIFICIO_SVG = construir();
