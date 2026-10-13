/* =============================================================================
   Informes ODS con Pilo · recorte de fotografías y pasajes citados.

   Funciones puras (sin red ni React), compartidas por la intranet y el portal:
   · el recorte: punto de interés (fx, fy de 0 a 1) y proporción de la ventana.
     Las imágenes de las noticias llegan en 3:1; el recorte decide qué parte
     se ve en cada ranura (portada ancha, dentro del texto, galería).
   · el pasaje literal de una nota que sostiene un párrafo, resaltado.
   · la numeración de las referencias del relato.
   ========================================================================== */

import type { CSSProperties } from "react";
import type { Fuente, ProporcionFoto, RanuraFoto, Recorte } from "./tipos";

export const PROPORCIONES: ProporcionFoto[] = ["3:1", "16:9", "4:3", "1:1"];

/** Proporciones que admite cada ranura; la primera es la de siempre. */
export const PROPORCIONES_RANURA: Record<RanuraFoto, ProporcionFoto[]> = {
  portada: ["3:1", "16:9"],
  n1: ["4:3"],
  n2: ["4:3"],
  galeria: ["4:3", "1:1"],
};

export const RECORTE_INICIAL: Recorte = { fx: 0.5, fy: 0.5, ratio: "16:9" };

const limitar = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/** «16:9» → 16/9. */
export function valorProporcion(r: ProporcionFoto): number {
  const [a, b] = r.split(":").map(Number);
  return a / b;
}

/** La proporción con la que se muestra una foto en una ranura: la guardada si la ranura la admite. */
export function proporcionEn(slot: RanuraFoto | undefined, ratio: ProporcionFoto | undefined): ProporcionFoto {
  if (!slot) return ratio && PROPORCIONES.includes(ratio) ? ratio : RECORTE_INICIAL.ratio;
  const admite = PROPORCIONES_RANURA[slot];
  return ratio && admite.includes(ratio) ? ratio : admite[0];
}

/** Un recorte válido aunque la base traiga algo a medias. */
export function normalizarRecorte(c: Partial<Recorte> | null | undefined): Recorte {
  return {
    fx: limitar(c?.fx ?? 0.5),
    fy: limitar(c?.fy ?? 0.5),
    ratio: c?.ratio && PROPORCIONES.includes(c.ratio) ? c.ratio : RECORTE_INICIAL.ratio,
  };
}

const pct = (v: number) => `${Math.round(limitar(v) * 1000) / 10}%`;

/**
 * Estilo de la imagen recortada: la ventana con su proporción y la foto que la
 * cubre alineada en el punto de interés. Con `slot`, la proporción es la que
 * admite esa ranura (la portada siempre ancha).
 */
export function estiloRecorte(crop: Partial<Recorte> | null | undefined, slot?: RanuraFoto): CSSProperties {
  const c = normalizarRecorte(crop);
  const r = proporcionEn(slot, crop?.ratio);
  return {
    aspectRatio: r.replace(":", " / "),
    objectFit: "cover",
    objectPosition: `${pct(c.fx)} ${pct(c.fy)}`,
  };
}

/**
 * La ventana que deja ver el recorte sobre la imagen completa, en fracciones
 * (0 a 1) del ancho y del alto. Usa la misma regla que `object-position`: el
 * punto fx de la imagen queda en el fx de la ventana.
 */
export function ventanaRecorte(imagen: number, crop: Partial<Recorte>): { left: number; top: number; width: number; height: number } {
  const c = normalizarRecorte(crop);
  const r = valorProporcion(crop.ratio && PROPORCIONES.includes(crop.ratio) ? crop.ratio : c.ratio);
  const img = imagen > 0 && Number.isFinite(imagen) ? imagen : 3;
  const width = r < img ? r / img : 1;
  const height = r < img ? 1 : img / r;
  return { left: (1 - width) * c.fx, top: (1 - height) * c.fy, width, height };
}

/** El punto de interés a partir de un clic sobre la imagen (coordenadas relativas a su caja). */
export function puntoDesde(x: number, y: number, ancho: number, alto: number): { fx: number; fy: number } {
  const r = (v: number, t: number) => Math.round(limitar(t > 0 ? v / t : 0.5) * 100) / 100;
  return { fx: r(x, ancho), fy: r(y, alto) };
}

/* ---------- Pasajes citados ---------------------------------------------------- */

const espacios = (s: string) => s.replace(/\s+/g, " ").trim();

export interface Pasaje {
  antes: string;
  cita: string;
  despues: string;
}

/**
 * El pasaje literal de la nota donde aparece cada cita, con algo de contexto a
 * cada lado. Las citas que no están en el cuerpo vuelven en `faltan`.
 */
export function pasajes(cuerpo: string, citas: string[], margen = 70): { encontrados: Pasaje[]; faltan: string[] } {
  const body = espacios(cuerpo ?? "");
  const hallados: { i: number; q: string }[] = [];
  const faltan: string[] = [];
  for (const raw of citas) {
    const q = espacios(raw);
    if (!q) continue;
    const i = body.indexOf(q);
    if (i < 0) faltan.push(raw);
    else hallados.push({ i, q });
  }
  hallados.sort((a, b) => a.i - b.i);
  const encontrados = hallados.map(({ i, q }) => {
    const s = Math.max(0, i - margen);
    const e = Math.min(body.length, i + q.length + margen);
    return { antes: (s > 0 ? "…" : "") + body.slice(s, i), cita: body.slice(i, i + q.length), despues: body.slice(i + q.length, e) + (e < body.length ? "…" : "") };
  });
  return { encontrados, faltan };
}

/** Las notas que cita un párrafo, en orden de aparición y sin repetir. */
export function notasCitadas(sources: Fuente[]): string[] {
  const ids: string[] = [];
  for (const s of sources) if (!ids.includes(s.news_id)) ids.push(s.news_id);
  return ids;
}

/** Numeración de las referencias del relato: la primera nota citada es la 1. */
export function numerarReferencias(parrafos: { sources: Fuente[] }[]): Map<string, number> {
  const orden = new Map<string, number>();
  for (const p of parrafos) for (const id of notasCitadas(p.sources)) if (!orden.has(id)) orden.set(id, orden.size + 1);
  return orden;
}

/* ---------- Fechas ------------------------------------------------------------------ */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2025-03-14» → «14 mar 2025». */
export function fechaCorta(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, dia] = d.slice(0, 10).split("-");
  if (!y || !m || !dia) return d;
  return `${Number(dia)} ${MESES[Number(m) - 1] ?? ""} ${y}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** «2025-03-14» → «14 March 2025» (para la página de evidencia en inglés). */
export function fechaIngles(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, dia] = d.slice(0, 10).split("-");
  if (!y || !m || !dia) return d;
  return `${Number(dia)} ${MONTHS[Number(m) - 1] ?? ""} ${y}`;
}

/** La dirección de una nota escrita como texto, sin protocolo: «udes.edu.co/comunicaciones/noticias/…». */
export function direccionTexto(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
}
