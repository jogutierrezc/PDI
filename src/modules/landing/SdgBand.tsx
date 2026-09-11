/* =============================================================================
   El PDI y los ODS, en la portada.

   No es un resumen escrito a mano: la relación entre el plan y los objetivos no
   está declarada en ninguna parte, se deduce de los proyectos publicados —los
   mismos que lee /ods— y por eso las cifras cambian solas cuando se formula un
   proyecto nuevo.

   Aquí se pintan los diecisiete, con aporte y sin él. Esconder los que nadie
   toca haría parecer que el plan cubre el mapa entero; enseñarlos apagados dice
   dónde todavía no llega, que es justo lo que un plan público debe admitir.
   ========================================================================== */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useProjects } from "../../data/queries";
import { sdgGoals, tallySdg } from "../../data/pdi";
import { SdgMarks } from "./SdgMarks";

export function SdgBand() {
  const projects = useProjects();
  const rows = useMemo(() => projects.data ?? [], [projects.data]);

  const reached = useMemo(
    () =>
      tallySdg(rows)
        .filter((row) => row.projects.length > 0)
        .map((row) => row.goal.id),
    [rows],
  );

  const declaring = rows.filter((project) => (project.sdg_goals ?? []).length > 0).length;

  return (
    <section className="sdg-band" id="ods" aria-labelledby="sdg-band-title">
      <div className="u-container">
        <div className="sdg-band__inner card">
          <div className="sdg-band__copy">
            <span className="eyebrow">El plan y el mundo</span>
            <h2 id="sdg-band-title">A qué se compromete el PDI más allá del campus</h2>
            <p>
              Cada proyecto declara a qué Objetivos de Desarrollo Sostenible aporta. De ahí —y no de
              una declaración de intenciones— sale este mapa.
            </p>
          </div>

          {projects.isPending ? (
            <LoadingBlock rows={2} label="Cargando el aporte a los ODS" />
          ) : projects.isError ? (
            <ErrorBlock error={projects.error} onRetry={() => void projects.refetch()} />
          ) : (
            <>
              <dl className="sdg-band__figures">
                <div>
                  <dt>Objetivos con aporte</dt>
                  <dd>
                    {reached.length}
                    <span>/{sdgGoals.length}</span>
                  </dd>
                </div>
                <div>
                  <dt>Proyectos que lo declaran</dt>
                  <dd>{declaring}</dd>
                </div>
              </dl>

              <SdgMarks goals={reached} showAll label="Los diecisiete Objetivos de Desarrollo Sostenible" />

              <p className="sdg-band__foot">
                <Link to="/ods">
                  Ver el PDI objetivo por objetivo{" "}
                  <span data-arrow aria-hidden="true">
                    →
                  </span>
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
