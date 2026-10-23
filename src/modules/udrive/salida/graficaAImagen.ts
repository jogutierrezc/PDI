/* =============================================================================
   UDrive · una gráfica como imagen PNG (para el Word).

   La gráfica es un SVG de TanStack Charts. Se dibuja fuera de pantalla con el
   mismo componente del editor y del PDF, se le copian los estilos calculados a
   cada elemento (el SVG suelto no ve las hojas de estilo) y se pasa por un
   canvas al doble de resolución.
   ========================================================================== */

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { TablaDatos, ConfigGrafica } from "../tipos";
import { GraficaVista } from "../ui/GraficaVista";

export interface ImagenPng {
  datos: Uint8Array;
  ancho: number;
  alto: number;
}

const PROPIEDADES = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline"] as const;

const esperar = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function copiarEstilos(origen: Element, copia: Element) {
  const calculado = getComputedStyle(origen);
  const partes: string[] = [];
  for (const p of PROPIEDADES) {
    const v = calculado.getPropertyValue(p);
    if (v) partes.push(`${p}:${v}`);
  }
  if (partes.length) (copia as SVGElement).setAttribute("style", partes.join(";"));
  const hijosO = origen.children;
  const hijosC = copia.children;
  for (let i = 0; i < hijosO.length && i < hijosC.length; i++) copiarEstilos(hijosO[i], hijosC[i]);
}

/** Dibuja la gráfica con `ancho` × `alto` píxeles y devuelve el PNG, o nulo si no se pudo. */
export async function graficaAImagen(tabla: TablaDatos, config: ConfigGrafica, ancho: number, alto: number): Promise<ImagenPng | null> {
  const caja = document.createElement("div");
  caja.setAttribute("aria-hidden", "true");
  caja.style.cssText = `position:fixed;left:-10000px;top:0;width:${ancho}px;height:${alto}px;background:#fff;pointer-events:none`;
  document.body.appendChild(caja);
  const raiz = createRoot(caja);
  try {
    raiz.render(createElement(GraficaVista, { tabla, config, altura: alto }));
    await document.fonts?.ready;
    // Dos cuadros y un respiro: la gráfica mide su caja y se dibuja después.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await esperar(250);
    const svg = caja.querySelector("svg");
    if (!svg) return null;
    const caja2 = svg.getBoundingClientRect();
    const w = Math.max(1, Math.round(caja2.width || ancho));
    const h = Math.max(1, Math.round(caja2.height || alto));
    const copia = svg.cloneNode(true) as SVGSVGElement;
    copiarEstilos(svg, copia);
    copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copia.setAttribute("width", String(w));
    copia.setAttribute("height", String(h));
    if (!copia.getAttribute("viewBox")) copia.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const xml = new XMLSerializer().serializeToString(copia);
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = new Image();
      img.decoding = "sync";
      await new Promise<void>((ok, fallo) => {
        img.onload = () => ok();
        img.onerror = () => fallo(new Error("No se pudo dibujar la gráfica."));
        img.src = url;
      });
      const lienzo = document.createElement("canvas");
      lienzo.width = w * 2;
      lienzo.height = h * 2;
      const c = lienzo.getContext("2d");
      if (!c) return null;
      c.fillStyle = "#fff";
      c.fillRect(0, 0, lienzo.width, lienzo.height);
      c.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/png"));
      if (!blob) return null;
      return { datos: new Uint8Array(await blob.arrayBuffer()), ancho: w, alto: h };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  } finally {
    raiz.unmount();
    caja.remove();
  }
}
