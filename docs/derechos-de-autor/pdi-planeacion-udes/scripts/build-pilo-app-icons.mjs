/* =============================================================================
   Los iconos de la app móvil de Mr. Pilo (public/pilo-app).

   Salen de la cara aprobada (public/pilo-face/open.png, 450 × 631, que prepara
   scripts/pilo-face.py). No se redibuja, no se recorta y no se estira: la
   imagen se reduce entera, a su proporción, y se centra sobre el azul marino
   institucional.

     icon-192.png, icon-512.png   el icono (Pilo ocupa el 82 % del alto)
     icon-maskable-512.png        para los teléfonos que recortan el icono en
                                  círculo o en gota: Pilo cabe entero en la zona
                                  segura (el círculo del 80 %)
     apple-touch-icon.png         180 × 180, para «Añadir a pantalla de inicio»

   Ejecutar con: node scripts/build-pilo-app-icons.mjs
   ========================================================================== */

import { mkdir, stat } from "node:fs/promises";
import sharp from "sharp";

const SOURCE = "public/pilo-face/open.png";
const OUT = "public/pilo-app";
const NAVY = "#0a2d63";

/** Pilo entero, a su proporción, dentro de un cuadro de `size` px; `fill` es cuánto del alto ocupa. */
async function icon(size, fill, file) {
  const box = Math.round(size * fill);
  const pilo = await sharp(SOURCE)
    // `inside`: la imagen cabe entera en el cuadro; nunca se deforma ni se recorta.
    .resize({ width: box, height: box, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  const out = await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: pilo, gravity: "centre" }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer();
  await sharp(out).toFile(`${OUT}/${file}`);
  const { size: bytes } = await stat(`${OUT}/${file}`);
  console.log(`${file.padEnd(26)} ${size} × ${size}   ${(bytes / 1024).toFixed(1)} KB`);
}

await mkdir(OUT, { recursive: true });
await icon(192, 0.82, "icon-192.png");
await icon(512, 0.82, "icon-512.png");
// La diagonal de Pilo (450 × 631) debe caber en el círculo seguro, de diámetro 0.8: 0.8 / hypot(450/631, 1) ≈ 0.65.
await icon(512, 0.64, "icon-maskable-512.png");
await icon(180, 0.82, "apple-touch-icon.png");
