/* =============================================================================
   Optimización de imágenes estáticas.

   udesback.png pesaba 957 KB: un PNG sin pérdida de 1672x940 con canal alfa.
   No es una fotografía sino una filigrana decorativa (alfa medio 42/255), así
   que se conserva la transparencia —aplanarla sobre blanco la destruiría— y se
   comprime en WebP con alfa, donde baja a ~150 KB sin diferencia perceptible
   al 50 % de opacidad con la que se muestra.

   Además genera la tarjeta social: las redes no leen WebP de forma fiable, así
   que esa sí va en JPEG y aplanada sobre el azul institucional.

   Las fuentes originales viven en assets-source/ y no se publican.
   Ejecutar con: npm run optimize:assets
   ========================================================================== */

import { stat } from "node:fs/promises";
import sharp from "sharp";

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const SOURCE = "assets-source/udesback.png";

const before = (await stat(SOURCE)).size;

const watermark = await sharp(SOURCE)
  .resize({ width: 1600, withoutEnlargement: true })
  .webp({ quality: 62, alphaQuality: 40, effort: 6 })
  .toBuffer();
await sharp(watermark).toFile("public/udesback.webp");
console.log(`filigrana:      ${kb(before)} → ${kb(watermark.length)}  (public/udesback.webp)`);

const card = await sharp(SOURCE)
  .resize({ width: 1200, height: 630, fit: "cover", position: "centre" })
  .flatten({ background: "#0a2d63" })
  .jpeg({ quality: 82, mozjpeg: true })
  .toBuffer();
await sharp(card).toFile("public/og-card.jpg");
console.log(`tarjeta social: ${kb(card.length)}  (public/og-card.jpg)`);
