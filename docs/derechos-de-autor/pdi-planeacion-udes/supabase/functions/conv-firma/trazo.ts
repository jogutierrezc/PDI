/* =============================================================================
   conv-firma · validar y recortar el trazo de la firma (PNG).
   Se decodifica con @pdf-lib/upng (JavaScript puro) y se vuelve a codificar: lo que se guarda y se
   imprime es un PNG nuevo y limpio, nunca los bytes que mandó el cliente.
   ========================================================================== */

import UPNG from "npm:@pdf-lib/upng@1.0.1";
import { ErrorFirma } from "./util.ts";

const MAX_BYTES = 400_000;
const MAX_ANCHO = 2000;
const MAX_ALTO = 1000;
const MIN_LADO = 24;
const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Quita el prefijo data:image/png;base64, si lo trae. */
export function base64DeImagen(valor: unknown): string {
  if (typeof valor !== "string") throw new ErrorFirma("trazo_invalido", "Falta la imagen de la firma.");
  const m = /^data:image\/png;base64,/.exec(valor);
  const b64 = (m ? valor.slice(m[0].length) : valor).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length < 100) throw new ErrorFirma("trazo_invalido", "La imagen de la firma no es válida.");
  if (b64.length > MAX_BYTES * 1.4) throw new ErrorFirma("trazo_grande", "La imagen de la firma es demasiado grande.", 413);
  return b64;
}

/**
 * Valida (firma PNG, tamaño, dimensiones declaradas ANTES de decodificar), recorta los márgenes vacíos
 * (transparentes o blancos) y devuelve un PNG nuevo con 6 px de aire.
 */
export function prepararTrazo(bytes: Uint8Array): Uint8Array {
  if (bytes.length > MAX_BYTES) throw new ErrorFirma("trazo_grande", "La imagen de la firma es demasiado grande.", 413);
  if (bytes.length < 60 || FIRMA_PNG.some((b, i) => bytes[i] !== b)) throw new ErrorFirma("trazo_invalido", "La firma debe ser una imagen PNG.");
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // IHDR: ancho y alto en los bytes 16..23 (el decodificador no se ejecuta hasta comprobarlos: evita bombas de descompresión).
  const ancho = vista.getUint32(16);
  const alto = vista.getUint32(20);
  if (ancho < MIN_LADO || alto < MIN_LADO || ancho > MAX_ANCHO || alto > MAX_ALTO) {
    throw new ErrorFirma("trazo_dimensiones", `La imagen de la firma debe medir entre ${MIN_LADO} y ${MAX_ANCHO} × ${MAX_ALTO} píxeles.`);
  }
  let img;
  try {
    img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new ErrorFirma("trazo_invalido", "No se pudo leer la imagen de la firma.");
  }
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const w = img.width as number;
  const h = img.height as number;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, tinta = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3];
      // Tinta: algo visible que no sea (casi) blanco.
      if (a > 24 && !(rgba[i] > 240 && rgba[i + 1] > 240 && rgba[i + 2] > 240)) {
        tinta++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0 || tinta < 40) throw new ErrorFirma("trazo_vacio", "La firma está vacía. Dibuje su firma e intente de nuevo.");
  const pad = 6;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const salida = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const desde = ((y + y0) * w + x0) * 4;
    salida.set(rgba.subarray(desde, desde + cw * 4), y * cw * 4);
  }
  // Fondo blanco opaco o casi blanco → transparente, para que la firma no tape el texto del documento.
  for (let i = 0; i < salida.length; i += 4) {
    if (salida[i + 3] > 0 && salida[i] > 240 && salida[i + 1] > 240 && salida[i + 2] > 240) salida[i + 3] = 0;
  }
  return new Uint8Array(UPNG.encode([salida.buffer], cw, ch, 0));
}
