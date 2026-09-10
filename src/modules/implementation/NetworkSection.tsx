/* =============================================================================
   El mapa numerado de relacionamiento.

   Empezó siendo dos mapas —relacionamiento y declarado-vs-presupuesto— porque
   así venían los dos prototipos. Puestos uno debajo de otro se veía que eran el
   mismo dibujo dos veces, así que se fundieron en uno con un selector de vista.

   Después se retiraron las vistas de presupuesto. No por diseño: este portal es
   público y las cifras presupuestales de la universidad no lo son. El mapa que
   compara lo declarado con lo proyectado y lo ejecutado vive en la intranet,
   donde el presupuesto tiene su propio módulo; aquí queda el relacionamiento,
   que sí es información pública del plan.

   `budgetView()` sigue existiendo en `network.ts` para ese módulo interno.
   ========================================================================== */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../components/ui/QueryState";
import { accentFor } from "../../data/pdi";
import { NetworkMap } from "./NetworkMap";
import { buildNetwork } from "./network";
import type { AreaWithLines, PillarWithProgress } from "../../data/queries";
import type { ProjectWithLinks } from "../../types/database";

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

  const { counts } = network;

  const heading = (
    <div className="section-heading">
      <span className="eyebrow">Relacionamiento</span>
      <h2 id="mapa-title">Mapa numerado — Pilar › Área estratégica › Línea de acción › Proyecto</h2>
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
          Mapa numerado — Pilar › Área estratégica › Línea de acción › Proyecto
        </h2>
        <p>
          Cada elemento lleva su número: P = pilar, AE = área estratégica, LA = línea de acción, PR
          = proyecto. Pasa el cursor por un nodo para ver su cadena y <b>púlsalo para fijarla</b>:
          se queda encendida aunque busques otra cosa o te desplaces. Ctrl + rueda del ratón hace
          zoom. Los ODS de cada proyecto aparecen en su ficha al posar el cursor; la lectura
          completa está en <Link to="/ods">PDI y los ODS</Link>.
        </p>
      </div>

      <NetworkMap
        network={network}
        legend={legend}
        label={`Mapa numerado del PDI: ${counts.pilares} pilares, ${counts.areas} áreas estratégicas, ${counts.lineas} líneas de acción y ${counts.proyectos} proyectos.`}
        onRefresh={onRetry}
        refreshing={refreshing}
        footer={`${counts.pilares} pilares · ${counts.areas} áreas estratégicas · ${counts.lineas} líneas de acción · ${counts.proyectos} proyectos · ${counts.relaciones} relaciones`}
      />
    </section>
  );
}
