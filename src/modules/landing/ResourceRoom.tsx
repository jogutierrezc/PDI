/* =============================================================================
   Sala de recursos.

   No duplica el repositorio de /implementacion: muestra los primeros documentos
   públicos —el acuerdo de aprobación y el libro del plan, si están cargados— y
   manda al repositorio completo para el resto. Los títulos salen de la base,
   así que publicar un documento desde la intranet lo hace aparecer aquí sin
   tocar código.
   ========================================================================== */

import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { usePublicDocuments } from "../../data/queries";
import { prefetchProps } from "../../lib/prefetch";

/** Cuántos caben antes de que la portada se convierta en un índice. */
const SHOWN = 4;

export function ResourceRoom() {
  const documents = usePublicDocuments();
  const shown = documents.data?.slice(0, SHOWN) ?? [];
  const remaining = (documents.data?.length ?? 0) - shown.length;

  return (
    <section className="resources" id="recursos" aria-labelledby="resources-title">
      <div className="u-container">
        <div className="section-heading">
          <span className="eyebrow">Sala de recursos</span>
          <h2 id="resources-title">Lee el plan en su fuente</h2>
          <p>
            El acuerdo que aprobó el PDI y el documento completo, tal como los publicó la Dirección de
            Planeación Institucional.
          </p>
        </div>

        {documents.isPending ? (
          <LoadingBlock rows={3} label="Cargando los documentos del plan" />
        ) : documents.isError ? (
          <ErrorBlock error={documents.error} onRetry={() => void documents.refetch()} />
        ) : shown.length === 0 ? (
          <EmptyBlock
            title="Aún no hay documentos publicados"
            hint="Los documentos del plan aparecen aquí al marcarlos como públicos desde la intranet."
          />
        ) : (
          <ul className="resource-grid stagger">
            {shown.map((doc) => (
              <li key={doc.id}>
                <a
                  className="resource-card card card--interactive"
                  href={doc.url}
                  target="_blank"
                  // noopener evita que la página destino manipule esta pestaña
                  // a través de window.opener.
                  rel="noopener noreferrer"
                  aria-label={`${doc.title}, ${doc.kind}${doc.size_label ? `, ${doc.size_label}` : ""}, se abre en una pestaña nueva`}
                >
                  <span className="resource-card__mark">
                    <Icon name="document" size={20} />
                  </span>
                  <span className="resource-card__body">
                    <strong>{doc.title}</strong>
                    <small>{doc.description}</small>
                  </span>
                  <span className="resource-card__foot">
                    <span className="meta-pill">
                      {doc.kind}
                      {doc.size_label ? ` · ${doc.size_label}` : ""}
                    </span>
                    <span className="resource-card__action">
                      <Icon name="download" size={16} />
                      Abrir
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <p className="resources__more">
          <Link to="/implementacion#repositorio" {...prefetchProps("/implementacion")}>
            {remaining > 0
              ? `Ver el repositorio completo · ${remaining} documento${remaining === 1 ? "" : "s"} más`
              : "Ver el repositorio completo"}{" "}
            <span data-arrow aria-hidden="true">
              →
            </span>
          </Link>
        </p>
      </div>
    </section>
  );
}
