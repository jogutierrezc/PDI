/* =============================================================================
   UDES Sostenible · «La UDES en las noticias» al final de cada informe ODS.

   Muestra las notas de udes.edu.co que Planeación aprobó para este ODS
   (recolector de noticias, migración 0143): imagen, título y extracto, con el
   enlace a la nota completa. Sin notas aprobadas la sección no existe: ni
   encabezado ni mensaje. Nada de porcentajes ni estados: eso es de la intranet.

   Una nota que abre la sección (la de mejor imagen y afinidad) y el resto en
   lista. La imagen viene del sitio de la UDES; si no carga, queda el campo del
   color del ODS.
   ========================================================================== */

import { useState } from "react";
import type { CSSProperties } from "react";
import { useApprovedNews, ordenarParaOds } from "../rankings/noticias";
import type { NewsItem } from "../rankings/noticias";
import { odsOn } from "./OdsArt";
import { odsByNumber } from "./ods-data";
import "./ods-news.css";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (d: string | null) => {
  if (!d) return "";
  const [y, m, dia] = d.split("-");
  return `${Number(dia)} ${MESES[Number(m) - 1] ?? ""} ${y}`;
};

function Photo({ n, color, on }: { n: NewsItem; color: string; on: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="osn-photo" style={{ "--c": color, "--on": on } as CSSProperties}>
      {n.image_url && !failed ? <img src={n.image_url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span aria-hidden="true">UDES</span>}
    </div>
  );
}

const Meta = ({ n }: { n: NewsItem }) => (
  <p className="osn-meta">
    <b>{[n.section, n.campus].filter(Boolean).join(" · ")}</b>
    {n.published_on && <time dateTime={n.published_on}>{fecha(n.published_on)}</time>}
  </p>
);

export function OdsNews({ n }: { n: number }) {
  const q = useApprovedNews(n);
  const o = odsByNumber(n);
  const lista = o && q.data ? ordenarParaOds(q.data, n) : [];
  if (!o || !lista.length) return null;
  const on = odsOn(o.color);
  const [first, ...rest] = lista;

  return (
    <section className="osn" aria-labelledby="osn-h" style={{ "--c": o.color } as CSSProperties}>
      <div className="odsx-wrap">
        <header className="osn-head">
          <h2 id="osn-h">La UDES en las noticias</h2>
          <p>
            {lista.length === 1 ? "1 nota de 2025" : `${lista.length} notas de 2025`} sobre este ODS, en <a href="https://udes.edu.co/comunicaciones/noticias" target="_blank" rel="noopener noreferrer">udes.edu.co</a>.
          </p>
        </header>
        <div className="osn-grid">
          <article className="osn-lead">
            <a href={first.url} target="_blank" rel="noopener noreferrer" className="osn-photolink" tabIndex={-1} aria-hidden="true">
              <Photo n={first} color={o.color} on={on} />
            </a>
            <Meta n={first} />
            <h3>
              <a href={first.url} target="_blank" rel="noopener noreferrer">
                {first.title}
              </a>
            </h3>
            <p>{first.excerpt}</p>
            <a className="osn-more" href={first.url} target="_blank" rel="noopener noreferrer">
              Leer la nota en udes.edu.co <span aria-hidden="true">↗</span>
              <span className="osn-vh"> (se abre en otra pestaña)</span>
            </a>
          </article>
          {rest.length > 0 && (
            <ul className="osn-list">
              {rest.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="osn-photolink" tabIndex={-1} aria-hidden="true">
                    <Photo n={r} color={o.color} on={on} />
                  </a>
                  <div>
                    <Meta n={r} />
                    <h3>
                      <a href={r.url} target="_blank" rel="noopener noreferrer">
                        {r.title}
                      </a>
                    </h3>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
