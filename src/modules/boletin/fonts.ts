/* =============================================================================
   Boletín · fuentes.

   La fuente del boletín se elige en la plantilla y se carga solo cuando se
   usa, desde Google Fonts (el mismo origen que el resto del portal). La
   paginación espera a que esté lista: medir con la fuente de reserva y pintar
   con la definitiva descuadraría las páginas.
   ========================================================================== */

import type { BulletinFont } from "./model";

const SPEC: Record<BulletinFont, string> = {
  Montserrat: "Montserrat:ital,wght@0,400..900;1,400..900",
  Manrope: "Manrope:wght@400..800",
  "Source Sans 3": "Source+Sans+3:ital,wght@0,400..900;1,400..900",
  Roboto: "Roboto:ital,wght@0,400..900;1,400..900",
  Lato: "Lato:ital,wght@0,400;0,700;0,900;1,400;1,700;1,900",
};

const loaded = new Map<BulletinFont, Promise<void>>();

export function loadBulletinFont(font: BulletinFont): Promise<void> {
  // Sin API de fuentes (pruebas en DOM sintético), no hay nada que esperar.
  if (typeof document === "undefined" || !("fonts" in document)) return Promise.resolve();
  const existing = loaded.get(font);
  if (existing) return existing;
  const promise = new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${SPEC[font]}&display=block`;
    link.dataset.bulletinFont = font;
    const done = () => {
      // La hoja declara las caras; hay que pedirlas para que descarguen.
      const faces = ["400", "600", "700", "800"].map((w) => document.fonts?.load(`${w} 12px "${font}"`));
      Promise.all(faces)
        .catch(() => undefined)
        .finally(() => resolve());
    };
    link.onload = done;
    link.onerror = () => resolve();
    document.head.appendChild(link);
    // Sin red (o en pruebas sin DOM de fuentes), no bloquear el documento.
    window.setTimeout(resolve, 4000);
  });
  loaded.set(font, promise);
  return promise;
}
