/* =============================================================================
   Capacitación de Pilo · la paginación de la bandeja, sin React ni base.

   La bandeja trae 10 preguntas por página (range + count exacto en Supabase).
   Aquí vive lo que se calcula con eso: cuántas páginas hay, qué página pide la
   dirección (?pagina=3), el texto «Mostrando 11–20 de 114» y la ventana de
   números con puntos suspensivos. Todo puro, con sus pruebas (paginacion.test.ts).
   ========================================================================== */

export const PAGE_SIZE = 10;

/** Cuántas páginas hay. Con cero preguntas sigue habiendo una (vacía). */
export function totalPages(total: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** La página que pide la dirección (?pagina=…). Lo que no sea un número ≥ 1 vuelve a la primera. */
export function parsePagina(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** La página dentro de rango: si pide una que ya no existe (se atendieron preguntas), va a la última. */
export function clampPagina(page: number, total: number, size: number = PAGE_SIZE): number {
  return Math.min(Math.max(1, Math.floor(page)), totalPages(total, size));
}

/** Qué posiciones muestra la página (1 a 10 de 114 → from 1, to 10). Sin preguntas, 0 y 0. */
export function rangoDePagina(page: number, total: number, size: number = PAGE_SIZE): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (page - 1) * size + 1;
  return { from, to: Math.min(page * size, total) };
}

/** La línea de la bandeja: «Mostrando 11–20 de 114». */
export function textoRango(page: number, total: number, size: number = PAGE_SIZE): string {
  if (total <= 0) return "Sin preguntas pendientes";
  const { from, to } = rangoDePagina(page, total, size);
  return `Mostrando ${from}–${to} de ${total}`;
}

export type Hueco = "…";

/**
 * Los números de página que se muestran: siempre la primera y la última, la
 * actual y sus vecinas. Entre dos números que se separan en uno, se muestra
 * ese número; si hay más, puntos suspensivos.
 */
export function ventanaDePaginas(page: number, total: number, size: number = PAGE_SIZE): (number | Hueco)[] {
  const last = totalPages(total, size);
  const keep = [...new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last))].sort((a, b) => a - b);
  const out: (number | Hueco)[] = [];
  keep.forEach((p, i) => {
    if (i > 0) {
      const gap = p - keep[i - 1];
      if (gap === 2) out.push(keep[i - 1] + 1);
      else if (gap > 2) out.push("…");
    }
    out.push(p);
  });
  return out;
}
