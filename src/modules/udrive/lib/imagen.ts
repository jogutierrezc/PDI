/* =============================================================================
   UDrive · imágenes: cuándo y a qué tamaño se comprimen al subirlas.

   La compresión en sí (canvas) vive en ui/subida.ts porque necesita el
   navegador; aquí está la parte que se puede probar.
   ========================================================================== */

export const LADO_MAXIMO = 2000;

/** Solo se recomprimen las fotos; un GIF animado o un SVG se suben tal cual. */
export const esImagenComprimible = (mime: string | null | undefined): boolean => /^image\/(jpeg|png|webp)$/i.test(mime ?? "");

/** El tamaño que cabe en `max` px de lado conservando la proporción; no agranda nunca. */
export function dimensionesComprimidas(ancho: number, alto: number, max: number = LADO_MAXIMO): { ancho: number; alto: number; cambia: boolean } {
  if (!(ancho > 0) || !(alto > 0)) return { ancho: Math.max(1, ancho || 1), alto: Math.max(1, alto || 1), cambia: false };
  const mayor = Math.max(ancho, alto);
  if (mayor <= max) return { ancho, alto, cambia: false };
  const f = max / mayor;
  return { ancho: Math.max(1, Math.round(ancho * f)), alto: Math.max(1, Math.round(alto * f)), cambia: true };
}

/** La extensión y el tipo con que se vuelve a guardar: el PNG sigue PNG (puede tener transparencia); el resto, JPEG o WebP. */
export function formatoDeSalida(mime: string): { mime: string; extension: string; calidad: number } {
  if (/png/i.test(mime)) return { mime: "image/png", extension: ".png", calidad: 1 };
  if (/webp/i.test(mime)) return { mime: "image/webp", extension: ".webp", calidad: 0.85 };
  return { mime: "image/jpeg", extension: ".jpg", calidad: 0.85 };
}

/** ¿Vale la pena quedarse con la versión comprimida? Solo si pesa menos que la original. */
export const conviene = (original: number, comprimida: number): boolean => comprimida > 0 && comprimida < original;

/** Qué vista previa ofrecer en el panel de detalles. */
export function vistaPrevia(mime: string | null | undefined): "imagen" | "pdf" | null {
  if (/^image\/(jpeg|png|webp|gif)$/i.test(mime ?? "")) return "imagen";
  if (/^application\/pdf$/i.test(mime ?? "")) return "pdf";
  return null;
}
