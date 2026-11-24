/* =============================================================================
   Boletín de Impacto · el reparto en páginas.

   El contenido se mide en pantalla (cada bloque y cada fila de tabla) y aquí
   se acomoda en páginas carta: los bloques no se parten; las tablas sí, fila
   por fila, repitiendo su encabezado, y nunca dejan una o dos filas sueltas
   al pie de una página si pueden empezar en la siguiente. Función pura: se
   prueba sin navegador.
   ========================================================================== */

export type Item =
  | { key: string; kind: "block"; h: number }
  /** Una tabla: su encabezado (título y fila de columnas), sus filas y su nota final. */
  | { key: string; kind: "rows"; head: number; rows: number[]; foot: number };

export type Piece =
  | { key: string; kind: "block" }
  | { key: string; kind: "rows"; from: number; to: number; first: boolean; last: boolean };

const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

/**
 * @param firstCap alto útil de la primera página (sin la portada, si la portada es un bloque)
 * @param cap      alto útil de las demás (ya sin su encabezado corrido)
 * @param gap      separación entre bloques
 * @param minRows  filas mínimas para empezar una tabla al final de una página
 */
export function paginate(items: Item[], firstCap: number, cap: number, gap: number, minRows = 3): Piece[][] {
  const pages: Piece[][] = [[]];
  let left = firstCap;
  const page = () => pages[pages.length - 1];
  const newPage = () => {
    pages.push([]);
    left = cap;
  };
  const spacing = () => (page().length ? gap : 0);

  for (const item of items) {
    if (item.kind === "block") {
      if (item.h + spacing() > left && page().length) newPage();
      left -= item.h + spacing();
      page().push({ key: item.key, kind: "block" });
      continue;
    }

    let i = 0;
    if (!item.rows.length) {
      if (item.head + item.foot + spacing() > left && page().length) newPage();
      left -= item.head + item.foot + spacing();
      page().push({ key: item.key, kind: "rows", from: 0, to: 0, first: true, last: true });
      continue;
    }
    while (i < item.rows.length) {
      const room = left - spacing() - item.head;
      let n = 0;
      let used = 0;
      while (i + n < item.rows.length && used + item.rows[i + n] <= room) {
        used += item.rows[i + n];
        n++;
      }
      // La nota final va con la última fila.
      if (i + n === item.rows.length && used + item.foot > room && n > 0) {
        n--;
        used -= item.rows[i + n];
      }
      const remaining = item.rows.length - i;
      if (n < Math.min(minRows, remaining) && page().length) {
        newPage();
        continue;
      }
      if (n === 0) {
        // Ni una fila cabe en una página vacía: va igual, para no quedar en bucle.
        n = 1;
        used = item.rows[i];
      }
      const last = i + n === item.rows.length;
      left -= spacing() + item.head + used + (last ? item.foot : 0);
      page().push({ key: item.key, kind: "rows", from: i, to: i + n, first: i === 0, last });
      i += n;
      if (!last) newPage();
    }
  }
  return pages.filter((p, k) => p.length || k === 0);
}

export const heightOf = (item: Item) => (item.kind === "block" ? item.h : item.head + sum(item.rows) + item.foot);
