/* =============================================================================
   CMS Portales · bloque vivo «Avance del plan».

   Copia de la sección home-pulse de routes/Home.tsx; si cambia allí, cambiar
   aquí (la sección vive dentro de Home(), no se puede exportar sin refactorizar
   la portada). Mismas clases (estilos globales), mismos hooks y la misma flecha
   `data-arrow`, para que el bloque muestre lo mismo que la portada del PDI.
   ========================================================================== */

import { Link } from "react-router-dom";
import { ProgressRing } from "../../../../components/ui/ProgressRing";
import { ErrorBlock, LoadingBlock } from "../../../../components/ui/QueryState";
import { useCurrentPeriod, useSummary } from "../../../../data/queries";
import { emptySummary } from "../../../../data/pdi";
import { prefetchProps } from "../../../../lib/prefetch";

export function AvancePlan() {
  const summary = useSummary();
  const period = useCurrentPeriod();

  const totals = summary.data ?? emptySummary;

  return (
    <section className="home-pulse" aria-label="Avance del plan de un vistazo">
      <div className="u-container home-pulse__inner">
        {summary.isPending ? (
          <LoadingBlock rows={2} label="Cargando el avance del plan" />
        ) : summary.isError ? (
          <ErrorBlock error={summary.error} onRetry={() => void summary.refetch()} />
        ) : (
          <>
            <div className="home-pulse__figure">
              <ProgressRing value={totals.progress} size={104} label="Avance global" />
              <div>
                <span className="eyebrow">Avance global</span>
                <p>
                  Promedio de {totals.pillar_count}{" "}
                  {totals.pillar_count === 1 ? "pilar" : "pilares"}
                  {totals.total > 0 ? ` · ${totals.done} de ${totals.total} indicadores cumplidos` : ""}
                  {period.data ? ` · ${period.data.label}` : ""}
                </p>
              </div>
            </div>

            <dl className="home-pulse__stats">
              <div>
                <dt>Pilares estratégicos</dt>
                <dd>{totals.pillar_count}</dd>
              </div>
              <div>
                <dt>En curso</dt>
                <dd>{totals.active}</dd>
              </div>
              <div>
                <dt>Requieren atención</dt>
                <dd>{totals.risk}</dd>
              </div>
            </dl>

            <Link className="button-secondary" to="/tablero" {...prefetchProps("/tablero")}>
              Ir al tablero <span data-arrow aria-hidden="true">→</span>
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
