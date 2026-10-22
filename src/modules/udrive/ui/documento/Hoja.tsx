/* =============================================================================
   UDrive · la hoja Carta del editor.

   Una hoja continua de 816 px de ancho con la portada y los índices resumidos
   arriba y los bloques debajo, con el «+» entre cada par. Las rayas
   punteadas marcan dónde cambiaría de página a esa altura; son una estimación
   (el paginado exacto, con figuras que no se parten y títulos que no quedan
   solos, se calcula al exportar), y de ahí salen los números de página
   estimados de la lista de estructura.
   ========================================================================== */

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import type { Documento } from "../../lib/documento";
import { ALTO_CUERPO } from "../../lib/paginado";
import type { AccionesBloque } from "./Bloques";
import { BloqueEnHoja, FilaInsertar } from "./Bloques";

export interface Estimado {
  total: number;
  porBloque: ReadonlyMap<string, number>;
}

export function Hoja({
  doc,
  seleccion,
  editable,
  comentarios,
  resumenIndices,
  paginasAntes,
  acc,
  onEstimado,
}: {
  doc: Documento;
  /** Id de bloque, «portada» o nulo. */
  seleccion: string | null;
  editable: boolean;
  /** Comentarios sin resolver por bloque. */
  comentarios: ReadonlyMap<string, number>;
  resumenIndices: string;
  /** Páginas que van antes del cuerpo: portada e índices. */
  paginasAntes: number;
  acc: AccionesBloque;
  onEstimado(e: Estimado): void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const alEstimar = useRef(onEstimado);
  alEstimar.current = onEstimado;
  const ultima = useRef("");
  const [medidas, setMedidas] = useState({ inicio: 76, alto: 1056 });

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const medir = () => {
      const primero = el.querySelector<HTMLElement>("[data-bloque]");
      const inicio = primero ? primero.offsetTop : 0;
      const porBloque = new Map<string, number>();
      el.querySelectorAll<HTMLElement>("[data-bloque]").forEach((b) => porBloque.set(b.dataset.bloque ?? "", paginasAntes + 1 + Math.floor(Math.max(0, b.offsetTop - inicio) / ALTO_CUERPO)));
      const total = paginasAntes + Math.max(1, Math.ceil(Math.max(0, el.offsetHeight - 76 - inicio) / ALTO_CUERPO));
      const firma = `${total}|${[...porBloque].map(([k, v]) => `${k}:${v}`).join(",")}`;
      if (firma === ultima.current) return;
      ultima.current = firma;
      setMedidas({ inicio, alto: el.offsetHeight });
      alEstimar.current({ total, porBloque });
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, [paginasAntes, doc.bloques.length]);

  // Rayas de cambio de página, a partir del primer bloque.
  const cortes = Array.from({ length: Math.min(400, Math.max(0, Math.ceil((medidas.alto - 76 - medidas.inicio) / ALTO_CUERPO) - 1)) }, (_, k) => k + 1);

  return (
    <div ref={raiz} className="ud-hoja ud-doc" lang="es" onClick={() => acc.seleccionar(null)}>
      <button
        type="button"
        className="ud-doc-resumen"
        aria-pressed={seleccion === "portada"}
        onClick={(e) => {
          e.stopPropagation();
          acc.seleccionar("portada");
        }}
      >
        <b>{doc.portada.titulo.trim() || "Portada sin título"}</b>
        <span>{[doc.portada.subtitulo, doc.portada.entidad, doc.portada.anio].filter((x) => x.trim()).join(" · ")}</span>
        <span>Portada a sangre. Se edita en «Documento», a la derecha.</span>
      </button>
      {resumenIndices ? (
        <div className="ud-doc-resumen" aria-label="Índices automáticos">
          <b>Índices automáticos</b>
          <span>{resumenIndices}</span>
        </div>
      ) : null}
      <FilaInsertar despuesDe={null} editable={editable} acc={acc} />
      {doc.bloques.map((b, i) => {
        const sangria = i > 0 && doc.bloques[i - 1].tipo !== "capitulo" && doc.bloques[i - 1].tipo !== "salto" && doc.bloques[i - 1].tipo !== "referencias";
        return (
          <Fragment key={b.id}>
            <BloqueEnHoja b={b} indice={i} total={doc.bloques.length} sel={seleccion === b.id} editable={editable} sangria={sangria} comentarios={comentarios.get(b.id) ?? 0} acc={acc} />
            <FilaInsertar despuesDe={b.id} editable={editable} acc={acc} />
          </Fragment>
        );
      })}
      {cortes.map((k) => (
        <div key={k} className="ud-hoja-corte" style={{ top: medidas.inicio + k * ALTO_CUERPO }} aria-hidden="true">
          <span>Página {paginasAntes + k + 1} (estimada)</span>
        </div>
      ))}
    </div>
  );
}
