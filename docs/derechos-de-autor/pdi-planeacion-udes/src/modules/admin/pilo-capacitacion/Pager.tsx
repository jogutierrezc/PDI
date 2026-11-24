/* =============================================================================
   Capacitación de Pilo · el paginador de la bandeja.

   Anterior / Siguiente y los números de página, con puntos suspensivos cuando
   hay muchas (ventanaDePaginas). La página actual lleva aria-current="page".
   Los números no van con color solo: la actual se ve por su forma y su marca.
   ========================================================================== */

import { totalPages, ventanaDePaginas } from "./paginacion";

export function Pager({ page, total, size, onGo }: { page: number; total: number; size: number; onGo: (page: number) => void }) {
  const last = totalPages(total, size);
  return (
    <nav className="pcap-pager" aria-label="Paginación de la bandeja">
      <button type="button" className="button-secondary press" disabled={page <= 1} onClick={() => onGo(page - 1)}>
        Anterior
      </button>
      <ul className="pcap-pager__pages">
        {ventanaDePaginas(page, total, size).map((p, i) =>
          p === "…" ? (
            <li key={`hueco-${i}`} className="pcap-pager__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <button type="button" className="pcap-pager__num" aria-label={`Página ${p}`} aria-current={p === page ? "page" : undefined} onClick={() => onGo(p)}>
                {p}
              </button>
            </li>
          ),
        )}
      </ul>
      <button type="button" className="button-secondary press" disabled={page >= last} onClick={() => onGo(page + 1)}>
        Siguiente
      </button>
    </nav>
  );
}
