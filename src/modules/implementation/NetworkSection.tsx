/* =============================================================================
   Los dos mapas de red, uno debajo del otro.

   El primero enseña el relacionamiento tal como está capturado: qué área cuelga
   de qué pilar, qué línea de qué área, a qué líneas apunta cada proyecto y a
   qué ODS aporta. El segundo es el mismo mapa mirado desde el dinero.

   Van juntos en un componente porque comparten el modelo: `buildNetwork()` se
   calcula una sola vez y el mapa de presupuesto solo filtra sus aristas. Dos
   componentes independientes armarían el grafo dos veces por carga, y con
   sesenta líneas de acción eso se nota.
   ========================================================================== */

import { useMemo, useState } from "react";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../components/ui/QueryState";
import { accentFor, formatBudget, EXECUTED_BUDGET } from "../../data/pdi";
import { NetworkMap } from "./NetworkMap";
import { budgetView, buildNetwork } from "./network";
import type { BudgetMode } from "./network";
import type { AreaWithLines, PillarWithProgress } from "../../data/queries";
import type { ProjectWithLinks } from "../../types/database";

const TABS: { id: BudgetMode; label: string }[] = [
  { id: "declarado", label: "Modelo declarado" },
  { id: "estimado", label: "Presupuesto estimado" },
  { id: "ejecutado", label: "Presupuesto ejecutado" },
];

interface NetworkSectionProps {
  pillars: PillarWithProgress[];
  areas: AreaWithLines[];
  projects: ProjectWithLinks[];
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function NetworkSection({
  pillars,
  areas,
  projects,
  pending,
  error,
  onRetry,
}: NetworkSectionProps) {
  const [mode, setMode] = useState<BudgetMode>("declarado");

  const network = useMemo(
    () => buildNetwork({ pillars, areas, projects }),
    [pillars, areas, projects],
  );

  const legend = useMemo(
    () =>
      [...pillars]
        .sort((a, b) => a.position - b.position)
        .map((pillar) => ({ id: pillar.id, name: pillar.name, color: accentFor(pillar.accent_slot) })),
    [pillars],
  );

  const budget = useMemo(() => budgetView(network, mode), [network, mode]);
  const declared = useMemo(() => budgetView(network, "declarado"), [network]);
  const estimated = useMemo(() => budgetView(network, "estimado"), [network]);

  const { counts } = network;

  if (error) {
    return (
      <section className="netmap-section" id="mapa" aria-labelledby="mapa-title">
        <div className="section-heading">
          <span className="eyebrow">Relacionamiento</span>
          <h2 id="mapa-title">Mapa numerado de relacionamiento</h2>
        </div>
        <ErrorBlock error={error} onRetry={onRetry} />
      </section>
    );
  }

  if (pending) {
    return (
      <section className="netmap-section" id="mapa" aria-labelledby="mapa-title">
        <div className="section-heading">
          <span className="eyebrow">Relacionamiento</span>
          <h2 id="mapa-title">Mapa numerado de relacionamiento</h2>
        </div>
        <CardSkeleton count={2} />
      </section>
    );
  }

  if (counts.pilares === 0) {
    return (
      <section className="netmap-section" id="mapa" aria-labelledby="mapa-title">
        <div className="section-heading">
          <span className="eyebrow">Relacionamiento</span>
          <h2 id="mapa-title">Mapa numerado de relacionamiento</h2>
        </div>
        <EmptyBlock title="Todavía no hay estructura publicada para dibujar el mapa." />
      </section>
    );
  }

  return (
    <>
      <section className="netmap-section" id="mapa" aria-labelledby="mapa-title">
        <div className="section-heading">
          <span className="eyebrow">Relacionamiento</span>
          <h2 id="mapa-title">
            Mapa numerado — Pilar › Área estratégica › Línea de acción › Proyecto › ODS
          </h2>
          <p>
            Cada elemento lleva su número: P = pilar, AE = área estratégica, LA = línea de acción,
            PR = proyecto, ODS = objetivo de desarrollo sostenible. Pasa el cursor sobre cualquier
            nodo para resaltar su cadena completa. Usa la búsqueda o la leyenda para aislar un
            pilar; Ctrl + rueda del ratón o los botones +/− hacen zoom.
          </p>
        </div>

        <NetworkMap
          network={network}
          legend={legend}
          label={`Mapa de relaciones del PDI: ${counts.pilares} pilares, ${counts.areas} áreas estratégicas, ${counts.lineas} líneas de acción, ${counts.proyectos} proyectos y ${counts.ods} objetivos de desarrollo sostenible.`}
          footer={`${counts.pilares} pilares · ${counts.areas} áreas estratégicas · ${counts.lineas} líneas de acción · ${counts.proyectos} proyectos · ${counts.ods} ODS · ${counts.relaciones} relaciones`}
        />
      </section>

      <section className="netmap-section" id="mapa-presupuesto" aria-labelledby="mapa-presupuesto-title">
        <div className="section-heading">
          <span className="eyebrow">Relacionamiento y recursos</span>
          <h2 id="mapa-presupuesto-title">Mapa numerado — declarado frente a presupuesto</h2>
          <p>
            El mismo mapa mirado desde el dinero. <b>Modelo declarado</b> son todas las relaciones
            capturadas; <b>presupuesto estimado</b> deja solo las de los proyectos que declaran un
            valor, con la curva más gruesa cuanto mayor es. Los nodos que una pestaña deja sin
            relación se atenúan: el hueco es el dato.
          </p>
        </div>

        <div className="netmap-tabs" role="tablist" aria-label="Qué mirar en el mapa de presupuesto">
          {TABS.map((tab) => {
            const count =
              tab.id === "declarado"
                ? declared.projects
                : tab.id === "estimado"
                  ? estimated.projects
                  : 0;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`netmap-tab-${tab.id}`}
                aria-selected={mode === tab.id}
                aria-controls="netmap-presupuesto"
                className={`netmap-tab${mode === tab.id ? " is-on" : ""}`}
                onClick={() => setMode(tab.id)}
              >
                {tab.label}{" "}
                <span>
                  {count} {count === 1 ? "proyecto" : "proyectos"}
                </span>
              </button>
            );
          })}
        </div>

        <div id="netmap-presupuesto" role="tabpanel" aria-labelledby={`netmap-tab-${mode}`}>
          {mode === "ejecutado" && (
            <p className="netmap-notice">
              <b>{formatBudget(EXECUTED_BUDGET)} ejecutados.</b> El portal todavía no tiene dónde
              registrar ejecución presupuestal, así que ninguna relación tiene dinero girado detrás.
              La estructura del plan se mantiene y los proyectos aparecen atenuados: esta pestaña
              queda lista para cuando ese dato entre.
            </p>
          )}

          {mode === "estimado" && (
            <p className="netmap-notice">
              <b>{formatBudget(estimated.total)} estimados</b> en {estimated.projects} de{" "}
              {counts.proyectos} {counts.proyectos === 1 ? "proyecto" : "proyectos"}. Es lo que los
              proyectos declaran que valen, no lo que se ha girado. Un proyecto que aporta a varias
              líneas dibuja su valor en cada una; el total no las suma.
            </p>
          )}

          <NetworkMap
            network={budget.network}
            legend={legend}
            label={`Mapa de relaciones del PDI según el presupuesto ${mode}.`}
            weightByValue={mode !== "declarado"}
            dimmed={mode === "declarado" ? undefined : budget.dimmed}
            footer={`${budget.network.counts.relaciones} relaciones en pie · ${budget.projects} de ${counts.proyectos} proyectos con relación en esta pestaña · ${formatBudget(budget.total)}`}
          />
        </div>
      </section>
    </>
  );
}
