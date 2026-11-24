/* =============================================================================
   UDrive · un mapa de OpenStreetMap como imagen PNG (para el Word).

   Carga las mismas teselas que ve el editor (con CORS, para poder pasarlas a un
   canvas), las dibuja en rejilla y pone encima los marcadores y la atribución.
   Si ninguna tesela carga devuelve nulo y el Word queda con un aviso.
   ========================================================================== */

import type { Marcador } from "../lib/documento";
import { ALTO_MAPA, ANCHO_MAPA, ATRIBUCION, puntoEnMapa, teselasVisibles } from "../lib/mapa";
import type { ImagenPng } from "./graficaAImagen";

const cargar = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = url;
  });

/** Dibuja el mapa para mostrarse a `anchoPx` de ancho; el PNG sale al doble de resolución. */
export async function mapaAImagen(lat: number, lng: number, zoom: number, marcadores: readonly Marcador[], anchoPx: number): Promise<ImagenPng | null> {
  try {
    const k = (anchoPx * 2) / ANCHO_MAPA;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(ANCHO_MAPA * k);
    lienzo.height = Math.round(ALTO_MAPA * k);
    const c = lienzo.getContext("2d");
    if (!c) return null;
    c.fillStyle = "#e8eef5";
    c.fillRect(0, 0, lienzo.width, lienzo.height);
    const teselas = teselasVisibles(lat, lng, zoom);
    const imgs = await Promise.all(teselas.map((t) => cargar(t.url)));
    let dibujadas = 0;
    teselas.forEach((t, i) => {
      const im = imgs[i];
      if (!im) return;
      c.drawImage(im, t.x * k, t.y * k, 256 * k, 256 * k);
      dibujadas += 1;
    });
    if (!dibujadas) return null;

    for (const m of marcadores) {
      const p = puntoEnMapa(m.lat, m.lng, { lat, lng, zoom });
      if (p.x < -40 || p.x > ANCHO_MAPA + 40 || p.y < -20 || p.y > ALTO_MAPA + 60) continue;
      const x = p.x * k;
      const y = p.y * k;
      const e = (22 * k) / 24; // el alfiler mide 22 px lógicos de ancho
      c.save();
      c.translate(x - 12 * e, y - 31 * e);
      c.scale(e, e);
      const forma = new Path2D("M12 31C12 31 2 19.5 2 12a10 10 0 0120 0c0 7.5-10 19-10 19z");
      c.fillStyle = "#c0392b";
      c.fill(forma);
      c.lineWidth = 2;
      c.strokeStyle = "#fff";
      c.stroke(forma);
      c.beginPath();
      c.arc(12, 12, 4, 0, Math.PI * 2);
      c.fillStyle = "#fff";
      c.fill();
      c.restore();
      if (m.etiqueta.trim()) {
        const tam = 13 * k;
        c.font = `600 ${tam}px Calibri, Arial, sans-serif`;
        const w = c.measureText(m.etiqueta).width;
        c.fillStyle = "rgba(255,255,255,0.92)";
        c.fillRect(x + 12 * e - 2 * k, y - 24 * e, w + 8 * k, tam + 6 * k);
        c.fillStyle = "#111";
        c.textBaseline = "top";
        c.fillText(m.etiqueta, x + 12 * e + 2 * k, y - 24 * e + 3 * k);
      }
    }

    const tam = 10 * k;
    c.font = `${tam}px Calibri, Arial, sans-serif`;
    const w = c.measureText(ATRIBUCION).width;
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.fillRect(lienzo.width - w - 10 * k, lienzo.height - tam - 8 * k, w + 10 * k, tam + 8 * k);
    c.fillStyle = "#333";
    c.textBaseline = "top";
    c.fillText(ATRIBUCION, lienzo.width - w - 5 * k, lienzo.height - tam - 4 * k);

    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/png"));
    if (!blob) return null;
    return { datos: new Uint8Array(await blob.arrayBuffer()), ancho: anchoPx, alto: Math.round((anchoPx * ALTO_MAPA) / ANCHO_MAPA) };
  } catch {
    // Un canvas "manchado" (teselas sin CORS) o sin memoria: sin imagen, el Word lleva el aviso.
    return null;
  }
}
