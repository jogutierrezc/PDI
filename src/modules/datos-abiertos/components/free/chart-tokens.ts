/* =============================================================================
   Conjuntos libres · colores y tema de las gráficas nivo.

   nivo pinta sus colores como atributos SVG, y un atributo no resuelve
   var(--token): los valores se leen ya calculados del documento y se vuelven
   a leer cuando cambia el tema (atributo data-theme o preferencia del sistema).
   Así las gráficas usan exactamente la paleta del portal en los dos temas.

   Categorías en el orden fijo de --od-cat-1..6, nunca en ciclo: con más de seis
   series o categorías, lo que sobra va a «Otros» o no se dibuja y se dice.
   ========================================================================== */

import { useEffect, useState } from "react";

export interface ChartTokens {
  ink: string;
  secondary: string;
  muted: string;
  line: string;
  lineStrong: string;
  surface: string;
  font: string;
  cats: string[];
  total: string;
  pos: string;
  posSoft: string;
  neg: string;
  negSoft: string;
  mid: string;
  /**
   * Tinta legible sobre cada tono de la paleta divergente. No se puede deducir
   * del nombre: en claro el tono fuerte es oscuro y en oscuro es claro, así que
   * cada uno trae su pareja y el contraste se mantiene en los dos temas.
   */
  posInk: string;
  posSoftInk: string;
  negInk: string;
  negSoftInk: string;
}

/** Valores del tema claro, por si el documento no los resuelve (pruebas, impresión). */
const FALLBACK: ChartTokens = {
  ink: "#0d1c31",
  secondary: "#45566d",
  muted: "#6b7c93",
  line: "rgba(13, 40, 84, 0.11)",
  lineStrong: "rgba(13, 40, 84, 0.2)",
  surface: "#ffffff",
  font: "Manrope, ui-sans-serif, system-ui, sans-serif",
  cats: ["#2a78d6", "#eb6834", "#1baf7a", "#7a5bd0", "#e87ba4", "#008300"],
  total: "#0d1c31",
  pos: "#2a63b8",
  posSoft: "#6fa4e8",
  neg: "#b9541f",
  negSoft: "#e79c69",
  mid: "#e9edf3",
  posInk: "#ffffff",
  posSoftInk: "#0d1c31",
  negInk: "#ffffff",
  negSoftInk: "#0d1c31",
};

export const MAX_CATEGORICAL = 6;

function read(): ChartTokens {
  if (typeof window === "undefined") return FALLBACK;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    ink: v("--ink", FALLBACK.ink),
    secondary: v("--ink-secondary", FALLBACK.secondary),
    muted: v("--ink-muted", FALLBACK.muted),
    line: v("--line", FALLBACK.line),
    lineStrong: v("--line-strong", FALLBACK.lineStrong),
    surface: v("--od-surface", FALLBACK.surface),
    font: v("--font-sans", FALLBACK.font),
    cats: FALLBACK.cats.map((fallback, i) => v(`--od-cat-${i + 1}`, fallback)),
    total: v("--od-series-total", FALLBACK.total),
    pos: v("--od-div-pos-2", FALLBACK.pos),
    posSoft: v("--od-div-pos-1", FALLBACK.posSoft),
    neg: v("--od-div-neg-2", FALLBACK.neg),
    negSoft: v("--od-div-neg-1", FALLBACK.negSoft),
    mid: v("--od-div-mid", FALLBACK.mid),
    posInk: v("--od-div-pos-2-ink", FALLBACK.posInk),
    posSoftInk: v("--od-div-pos-1-ink", FALLBACK.posSoftInk),
    negInk: v("--od-div-neg-2-ink", FALLBACK.negInk),
    negSoftInk: v("--od-div-neg-1-ink", FALLBACK.negSoftInk),
  };
}

export function useChartTokens(): ChartTokens {
  const [tokens, setTokens] = useState<ChartTokens>(read);
  useEffect(() => {
    const update = () => setTokens(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);
  return tokens;
}

/** Tema de nivo desde los tokens: ejes y rejilla recesivos, texto en tinta, tooltip como el del portal. */
export function nivoTheme(t: ChartTokens) {
  return {
    background: "transparent",
    text: { fontFamily: t.font, fontSize: 12, fill: t.secondary },
    axis: {
      domain: { line: { stroke: t.lineStrong, strokeWidth: 1 } },
      ticks: { line: { stroke: t.lineStrong, strokeWidth: 1 }, text: { fill: t.muted, fontSize: 11, fontFamily: t.font } },
      legend: { text: { fill: t.secondary, fontSize: 12, fontWeight: 600, fontFamily: t.font } },
    },
    grid: { line: { stroke: t.line, strokeWidth: 1 } },
    labels: { text: { fontFamily: t.font, fontSize: 11, fontWeight: 700 } },
    dots: { text: { fill: t.secondary, fontSize: 11 } },
    crosshair: { line: { stroke: t.ink, strokeWidth: 1, strokeOpacity: 0.35 } },
    tooltip: {
      container: {
        background: t.surface,
        color: t.ink,
        fontFamily: t.font,
        fontSize: 12,
        borderRadius: 8,
        boxShadow: "0 1px 2px rgba(10,34,73,.12), 0 8px 20px rgba(10,34,73,.16)",
        padding: "8px 10px",
      },
    },
  };
}

/** Texto legible sobre un color de relleno: tinta oscura o blanca según su luminancia. */
export function inkOn(color: string, t: ChartTokens): string {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return t.ink;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#0d1c31" : "#ffffff";
}
