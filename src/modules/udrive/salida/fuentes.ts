/* =============================================================================
   UDrive · las fuentes de un estilo.

   Montserrat y Open Sans se cargan con el cargador del boletín
   (boletin/fonts.ts); Source Serif 4 se carga igual, desde Google Fonts, solo
   cuando un estilo la usa. Georgia es del sistema. La medición del paginado
   espera a estas promesas: medir con la letra de reserva y pintar con la
   definitiva descuadraría las páginas. Sin red, a los 4 segundos se sigue con
   la letra de reserva y la vista previa lo dice.
   ========================================================================== */

import { loadBulletinFont } from "../../boletin/fonts";
import type { Estilo, Familia } from "../lib/estilo";
import { familiasDe } from "../lib/estilo";

const cargadas = new Map<string, Promise<void>>();

function cargarSerif(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return Promise.resolve();
  const previa = cargadas.get("Source Serif 4");
  if (previa) return previa;
  const promesa = new Promise<void>((resolver) => {
    const enlace = document.createElement("link");
    enlace.rel = "stylesheet";
    enlace.href = "https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400;1,600&display=block";
    enlace.dataset.udFuente = "Source Serif 4";
    const listo = () => {
      const caras = ["400", "600", "700"].map((w) => document.fonts?.load(`${w} 12px "Source Serif 4"`));
      Promise.all(caras)
        .catch(() => undefined)
        .finally(() => resolver());
    };
    enlace.onload = listo;
    enlace.onerror = () => resolver();
    document.head.appendChild(enlace);
    window.setTimeout(resolver, 4000);
  });
  cargadas.set("Source Serif 4", promesa);
  return promesa;
}

export function cargarFamilia(f: Familia): Promise<void> {
  if (f === "Georgia") return Promise.resolve();
  if (f === "Source Serif 4") return cargarSerif();
  return loadBulletinFont(f);
}

/** Carga las letras que el estilo usa. Nunca falla: una fuente que no llega no detiene la vista previa. */
export function cargarFuentesDelEstilo(e: Estilo): Promise<void> {
  return Promise.all(familiasDe(e).map((f) => cargarFamilia(f).catch(() => undefined))).then(() => undefined);
}
