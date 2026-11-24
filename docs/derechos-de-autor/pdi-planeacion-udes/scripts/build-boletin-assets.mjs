/* =============================================================================
   Recursos del Boletín UDES en Cifras.

   Parte de las tres páginas modelo que entregó Planeación (Modelo Informe/
   Imagenes, A4 a 300 ppp, 2480×3508): portada, contraportada y contenido.
   · portada.jpg y contraportada.jpg: las páginas completas, como fondo.
   · cabecera-edificios.png: el dibujo de edificios de la franja azul, sin el
     título (que el boletín escribe en vivo), en trazo blanco transparente.
   · logo-udes-blanco.png: el logo blanco de la barra azul marino, igual.

   Las medidas salen de la página de contenido: la barra azul marino ocupa las
   filas 0–108 y la franja azul 110–325; el título ocupa hasta la columna 905 y
   el dibujo de edificios empieza en la 1420.

   Ejecutar con: node scripts/build-boletin-assets.mjs
   ========================================================================== */

import { mkdirSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "Modelo Informe/Imagenes";
const OUT = "public/boletin";
mkdirSync(OUT, { recursive: true });

// JPEG: Chrome lo incrusta tal cual al guardar como PDF; un WebP lo descomprime.
await sharp(`${SOURCE}/Portada.webp`).jpeg({ quality: 84, mozjpeg: true }).toFile(`${OUT}/portada.jpg`);
await sharp(`${SOURCE}/Contraportada.webp`).jpeg({ quality: 84, mozjpeg: true }).toFile(`${OUT}/contraportada.jpg`);

/**
 * Trazo blanco con transparencia: la luminosidad por encima del fondo liso se
 * vuelve opacidad. Así el dibujo y el logo sirven sobre cualquier color de
 * cabecera que se elija en la plantilla.
 */
async function whiteMatte(region, background, out) {
  const { data, info } = await sharp(`${SOURCE}/contenido.webp`).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const floor = 0.2126 * background[0] + 0.7152 * background[1] + 0.0722 * background[2];
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const alpha = Math.max(0, Math.min(1, (lum - floor - 6) / (255 - floor - 6)));
    rgba[j] = rgba[j + 1] = rgba[j + 2] = 255;
    rgba[j + 3] = Math.round(Math.pow(alpha, 0.85) * 255);
  }
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(out);
}

// Franja azul #4078b9: el dibujo de edificios, sin el título.
await whiteMatte({ left: 1420, top: 110, width: 1060, height: 216 }, [0x40, 0x78, 0xb9], `${OUT}/cabecera-edificios.png`);
// Barra azul marino #072b58: el logo blanco.
await whiteMatte({ left: 150, top: 8, width: 250, height: 96 }, [0x07, 0x2b, 0x58], `${OUT}/logo-udes-blanco.png`);

console.log(`${OUT}: portada.jpg, contraportada.jpg, cabecera-edificios.png, logo-udes-blanco.png`);
