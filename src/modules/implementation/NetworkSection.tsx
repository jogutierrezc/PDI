/* =============================================================================
   El mapa numerado, en una sola sección.

   Empezó siendo dos mapas —relacionamiento arriba, declarado-vs-presupuesto
   abajo— porque así venían los dos prototipos. Puestos uno debajo de otro se
   veía que eran el mismo dibujo dos veces: mismas columnas, mismos nodos,
   mismas curvas, y como única diferencia qué aristas quedaban en pie. Se
   fundieron en uno con un selector de vista.

   Lo que se gana no es solo espacio: la selección se mantiene al cambiar de
   vista. Fijar una línea de acción y pasar a "presupuesto estimado" responde de
   un golpe a la pregunta que motivaba el segundo mapa —"esto que está
   declarado, ¿tiene dinero detrás?"—, algo que con dos lienzos separados
   obligaba a buscar el mismo nodo dos veces.
   ========================================================================== */

import { useMemo, useState } from "react";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../components/ui/QueryState";
import { accentFor, formatBudget, EXECUTED_BUDGET } from "../../data/pdi";
import { NetworkMap } from "./NetworkMap";
import { budgetView, buildNetwork } from "./network";
import type { BudgetMode } from "./network";
import type { AreaWithLines, PillarWithProgress } from "../../data/queries";
import type { ProjectWithLinks } from "../../types/database";

const VIEWS: { id: BudgetMode; label: string; hint: string }[] = [
  {
    id: "declarado",
    label: "Relaciones declaradas",
    hint: "Todo lo capturado: qué área cuelga de qué pilar, qué línea de qué área, a qué apunta cada proyecto y a qué ODS aporta.",
  },
  {
    id: "estimado",
    label: "Presupuesto estimado",
    hint: "Solo las relaciones de proyectos que declaran un valor. La curva engorda con el importe.",
  },
  {
    id: "ejecutado",
    label: "Presupuesto ejecutado",
    hint: "Lo que se ha girado de verdad.",
  },
];

interface NetworkSectionProps {
  pillars: PillarWithProgress[];
  areas: AreaWithLines[];
  projects: ProjectWithLinks[];
  pending: boolean;
  refreshing?: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function NetworkSection({
  pillars,
  areas,
  projects,
  pending,
  refreshing = false,
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
        .map((pillar) => ({
          id: pillar.id,
          name: pillar.name,
          color: accentFor(pillar.accent_slot),
        })),
    [pillars],
  );

  const view = useMemo(() => budgetView(network, mode), [network, mode]);
  const estimated = useMemo(() => budgetView(network, "estimado"), [network]);

  const { counts } = network;

  const heading = (
    <div className="section-heading">
      <span className="eyebrow">Relacionamiento</span>
      <h2 id="mapa-title">
        Mapa numerado — Pilar › Área estratégica › Línea de acción › Proyecto › ODS
      </h2>
    </div>
  );

  if (error) {
    return (
      <section className="netmap-section" id="mapa" aria-labelledby="mapa-title">
        {heading}
        <ErrorBlock error={error} onRetry={onRetry} />
      </section>
    );
  }

  if (pending) {
    return (
      <section className="netmap-section" id="mapa" aria-labelledby="mapa-title">
        {heading}
        <CardSkeleton count={2} />
      </section>
    );
  }

  if (counts.pilares === 0) {
    return (
      <section className="netmap-section" id="mapa" aria-labelledby="mapa-title">
        {heading}
        <EmptyBlock title="Todavía no hay estructura publicada para dibujar el mapa." />
      </section>
    );
  }

  return (
    <section className="netmap-section" id="mapa" aria-labelledby="mapa-title">
      <div className="section-heading">
        <span className="eyebrow">Relacionamiento</span>
        <h2 id="mapa-title">
          Mapa numerado — Pilar › Área estratégica › Línea de acción › Proyecto › ODS
        </h2>
        <p>
          Cada elemento lleva su número: P = pilar, AE = área estratégica, LA = línea de acción, PR
          = proyecto, ODS = objetivo de desarrollo sostenible. Pasa el cursor por un nodo para ver
          su cadena y <b>púlsalo para fijarla</b>: se queda encendida aunque cambies de vista,
          busques otra cosa o te desplaces. Ctrl + rueda del ratón hace zoom.
        </p>
      </div>

      <div className="netmap-tabs" role="tablist" aria-label="Qué mirar en el mapa">
        {VIEWS.map((tab) => {
          const count =
            tab.id === "declarado"
              ? counts.proyectos
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
              aria-controls="netmap-panel"
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

      <div id="netmap-panel" role="tabpanel" aria-labelledby={`netmap-tab-${mode}`}>
        {mode === "estimado" && (
          <p className="netmap-notice">
            <b>{formatBudget(estimated.total)} estimados</b> en {estimated.projects} de{" "}
            {counts.proyectos} {counts.proyectos === 1 ? "proyecto" : "proyectos"}. Es lo que los
            proyectos declaran que valen, no lo que se ha girado. Un proyecto que aporta a varias
            líneas dibuja su valor en cada una; el total no las suma. Lo que queda atenuado es lo
            que no tiene cifra declarada.
          </p>
        )}

        {mode === "ejecutado" && (
          <p className="netmap-notice">
            <b>{formatBudget(EXECUTED_BUDGET)} ejecutados.</b> El portal todavía no tiene dónde
            registrar ejecución presupuestal, así que ninguna relación tiene dinero girado detrás.
            La estructura del plan se mantiene y los proyectos aparecen atenuados: la vista queda
            lista para cuando ese dato entre.
          </p>
        )}

        <NetworkMap
          network={view.network}
          legend={legend}
          label={`Mapa numerado del PDI: ${counts.pilares} pilares, ${counts.areas} áreas estratégicas, ${counts.lineas} líneas de acción, ${counts.proyectos} proyectos y ${counts.ods} objetivos de desarrollo sostenible.`}
          weightByValue={mode !== "declarado"}
          dimmed={mode === "declarado" ? undefined : view.dimmed}
          onRefresh={onRetry}
          refreshing={refreshing}
          footer={
            mode === "declarado"
              ? `${counts.pilares} pilares · ${counts.areas} áreas estratégicas · ${counts.lineas} líneas de acción · ${counts.proyectos} proyectos · ${counts.ods} ODS · ${counts.relaciones} relaciones`
              : `${view.network.counts.relaciones} relaciones en pie · ${view.projects} de ${counts.proyectos} proyectos con relación en esta vista · ${formatBudget(view.total)}`
          }
        />
      </div>
    </section>
  );
}
