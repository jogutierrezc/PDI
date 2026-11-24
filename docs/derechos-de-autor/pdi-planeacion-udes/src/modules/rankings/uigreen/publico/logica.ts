/* =============================================================================
   UI GreenMetric · página pública · lógica sin pantalla: rutas, años, formatos,
   enlace de evidencias y SEO. Nada de puntos ni pesos: no existen en estas lecturas.
   ========================================================================== */

import { useEffect } from "react";
import type { PeriodoPregunta, PublicoCicloListado } from "../lib/tipos";
import type { Lang } from "./textos";

export const RUTA_GREEN = "/sostenible/green";
export const rutaCategoria = (c: string, lang: Lang, edicion?: number | null) => conParams(`${RUTA_GREEN}/${c}`, lang, edicion);
export const rutaEvidencia = (q: string, lang: Lang, edicion?: number | null) => conParams(`${RUTA_GREEN}/evidencia/${encodeURIComponent(q)}`, lang, edicion);

function conParams(ruta: string, lang: Lang, edicion?: number | null): string {
  const p = new URLSearchParams();
  if (edicion) p.set("edicion", String(edicion));
  if (lang === "en") p.set("lang", "en");
  const s = p.toString();
  return s ? `${ruta}?${s}` : ruta;
}

/** Enlace público a un archivo de evidencia: lo sirve la función ugm-evidencia, nunca Storage. */
export function urlEvidencia(id: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/functions/v1/ugm-evidencia?id=${encodeURIComponent(id)}`;
}

/** Solo enlaces https sin espacios: lo demás no se enlaza. */
export const enlaceSeguro = (u: string | undefined): string | null => (u && /^https:\/\/[^\s]+$/.test(u) ? u : null);

/** Los ciclos con algo publicado, del más reciente al más antiguo. */
export const conContenido = (ciclos: PublicoCicloListado[] | undefined) => (ciclos ?? []).filter((c) => c.publicados > 0).sort((a, b) => b.anio - a.anio);

/** Año(s) de los datos según el periodo de la pregunta. */
export function aniosDatos(periodo: PeriodoPregunta | undefined, anioDatos: number): { a: number; b?: number; anterior?: boolean } {
  if (periodo === "anterior") return { a: anioDatos - 1, anterior: true };
  if (periodo === "tres_anios" || periodo === "serie") return { a: anioDatos - 2, b: anioDatos };
  return { a: anioDatos };
}

const LOCALE: Record<Lang, string> = { es: "es-CO", en: "en-GB" };
export const numero = (n: number, lang: Lang) => new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 }).format(n);
export const fecha = (d: string | null | undefined, lang: Lang) => {
  const t = d ? new Date(d) : null;
  return t && !Number.isNaN(t.getTime()) ? new Intl.DateTimeFormat(LOCALE[lang], { day: "numeric", month: "short", year: "numeric" }).format(t).replace(/\./g, "") : "";
};

/** Texto en párrafos (la base guarda saltos de línea). */
export const parrafos = (t: string | undefined): string[] => String(t ?? "").split(/\n+/).map((x) => x.trim()).filter(Boolean);

/** Título y descripción de la vista; Open Graph solo si la página ya trae esas etiquetas (index.html). Restaura al salir. */
export function useSeo(titulo: string, descripcion: string) {
  useEffect(() => {
    const previo = document.title;
    document.title = titulo;
    const tocados: [Element, string][] = [];
    for (const sel of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[name="twitter:title"]', 'meta[name="twitter:description"]']) {
      const el = document.head.querySelector(sel);
      if (!el) continue;
      tocados.push([el, el.getAttribute("content") ?? ""]);
      el.setAttribute("content", sel.includes("title") ? titulo : descripcion);
    }
    return () => {
      document.title = previo;
      for (const [el, v] of tocados) el.setAttribute("content", v);
    };
  }, [titulo, descripcion]);
}
