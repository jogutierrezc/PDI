/* =============================================================================
   Boletín de Impacto · el documento en páginas carta.

   Se pinta primero una copia invisible del contenido al ancho útil de la
   página y se mide cada bloque y cada fila; paginate() los acomoda y luego se
   pintan las páginas: portada en la primera, encabezado corrido en las demás
   y el pie en todas. Si el contenido cambia (llega la lectura de la IA), se
   vuelve a medir. Lo que se ve es lo que se imprime.
   ========================================================================== */

import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { paginate } from "./paginate";
import type { Item, Piece } from "./paginate";

export const PAGE_H = 1056;
const PAD_TOP = 32;
const FOOTER_H = 56;
const FOOT_GAP = 18;
const GAP = 18;

export type DocItem =
  | { key: string; kind: "block"; node: ReactNode }
  | {
      key: string;
      kind: "rows";
      /** Las columnas de la tabla (grid-template-columns). */
      cols: string;
      /** Título y fila de encabezados; `continued` en las páginas siguientes. */
      head: (continued: boolean) => ReactNode;
      rows: ReactNode[];
      foot?: ReactNode;
    };

export function PagedDocument({
  cover,
  running,
  footer,
  items,
  version,
  onReady,
}: {
  cover: ReactNode;
  running: ReactNode;
  footer: (page: number, total: number) => ReactNode;
  items: DocItem[];
  /** Cambia cuando cambia el contenido: se vuelve a medir. */
  version: string;
  onReady?: (pages: number) => void;
}) {
  const measure = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Piece[][] | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useLayoutEffect(() => {
    let alive = true;
    const run = () => {
      const root = measure.current;
      if (!root || !alive) return;
      const h = (key: string) => root.querySelector<HTMLElement>(`[data-m="${CSS.escape(key)}"]`)?.getBoundingClientRect().height ?? 0;
      const measured: Item[] = items.map((it) =>
        it.kind === "block"
          ? { key: it.key, kind: "block", h: h(it.key) }
          : { key: it.key, kind: "rows", head: h(`${it.key}:head`), rows: it.rows.map((_, i) => h(`${it.key}:${i}`)), foot: it.foot ? h(`${it.key}:foot`) : 0 },
      );
      const body = PAGE_H - PAD_TOP - FOOTER_H - FOOT_GAP;
      const result = paginate(measured, body - h("cover") - GAP, body - h("running") - GAP, GAP);
      setPages(result);
      ready.current?.(result.length);
    };
    // Medir con la fuente de reserva y pintar con la definitiva descuadraría las páginas.
    const fonts = typeof document !== "undefined" && "fonts" in document ? document.fonts.ready : Promise.resolve();
    void fonts.then(run);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const byKey = new Map(items.map((it) => [it.key, it]));
  const renderPiece = (piece: Piece) => {
    const it = byKey.get(piece.key);
    if (!it) return null;
    if (it.kind === "block" || piece.kind === "block") return <div key={piece.key}>{it.kind === "block" ? it.node : null}</div>;
    return (
      <div key={`${piece.key}-${piece.from}`} className="ibol-tbl" style={{ "--cols": it.cols } as CSSProperties}>
        <div>{it.head(!piece.first)}</div>
        {it.rows.slice(piece.from, piece.to).map((row, i) => (
          <div key={piece.from + i}>{row}</div>
        ))}
        {piece.last && it.foot && <div>{it.foot}</div>}
      </div>
    );
  };

  return (
    <>
      <div ref={measure} className="ibol-measure" aria-hidden="true">
        <div data-m="cover">{cover}</div>
        <div data-m="running">{running}</div>
        {items.map((it) =>
          it.kind === "block" ? (
            <div key={it.key} data-m={it.key}>
              {it.node}
            </div>
          ) : (
            <div key={it.key} className="ibol-tbl" style={{ "--cols": it.cols } as CSSProperties}>
              <div data-m={`${it.key}:head`}>{it.head(false)}</div>
              {it.rows.map((row, i) => (
                <div key={i} data-m={`${it.key}:${i}`}>
                  {row}
                </div>
              ))}
              {it.foot && <div data-m={`${it.key}:foot`}>{it.foot}</div>}
            </div>
          ),
        )}
      </div>

      {pages === null ? (
        <p className="ibol-paging ibol-noprint">Armando las páginas…</p>
      ) : (
        <div className="ibol-pages">
          {pages.map((page, k) => (
            <section key={k} className="ibol-page" aria-label={`Página ${k + 1} de ${pages.length}`}>
              {k === 0 ? cover : running}
              <div className="ibol-body">{page.map(renderPiece)}</div>
              {footer(k + 1, pages.length)}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
