/* =============================================================================
   UDrive · una página ya dibujada como imagen PNG (para el Word).

   La portada y la contraportada de un estilo (composiciones con foto, bloques
   de color, letras grandes) no se pueden armar con las piezas de Word. Se
   toman tal como están en la vista previa, ya paginada y con las fuentes
   cargadas, con html-to-image: el navegador dibuja el elemento y lo devuelve
   a doble resolución. En el Word va como imagen a página completa, detrás del
   texto, así que se ve igual que en el PDF aunque no se pueda editar.

   Si el navegador no puede (una imagen sin permiso CORS, una fuente que no se
   pudo incrustar), se reintenta sin incrustar las fuentes; si tampoco, queda
   nulo y el Word lleva una portada de texto con un aviso.
   ========================================================================== */

import { toPng } from "html-to-image";
import type { ImagenPng } from "./graficaAImagen";

const RESOLUCION = 2;

function aBytes(dataUrl: string): Uint8Array | null {
  const i = dataUrl.indexOf(",");
  if (i < 0) return null;
  try {
    const bin = atob(dataUrl.slice(i + 1));
    const datos = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) datos[k] = bin.charCodeAt(k);
    return datos;
  } catch {
    return null;
  }
}

/** Dibuja `el` (de `ancho` × `alto` píxeles CSS) como PNG. Devuelve las medidas en píxeles CSS, no las de la imagen. */
export async function paginaAImagen(el: HTMLElement, ancho: number, alto: number): Promise<ImagenPng | null> {
  const opciones = { pixelRatio: RESOLUCION, width: ancho, height: alto, cacheBust: false, backgroundColor: "#ffffff", style: { transform: "none", margin: "0" } };
  for (const sinFuentes of [false, true]) {
    try {
      const url = await toPng(el, { ...opciones, skipFonts: sinFuentes });
      const datos = aBytes(url);
      if (datos && datos.length > 2000) return { datos, ancho, alto };
    } catch {
      // se reintenta sin incrustar las fuentes
    }
  }
  return null;
}
