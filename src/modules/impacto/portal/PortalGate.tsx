/* =============================================================================
   La puerta del portal: cargando, error y «aún no hay nada publicado».

   Las tres pantallas leen lo mismo (usePortal) y solo se pintan cuando hay un
   catálogo publicado. Sin él no hay qué mostrar: ni indicadores ni cifras.
   Con catálogo y sin cifras validadas, el portal sí se ve, con cada
   indicador hueco y un aviso que dice por qué.
   ========================================================================== */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { usePortal } from "../data/portal-db";
import type { PortalData } from "../data/lens";
import { ImpactLayout } from "./ImpactLayout";

export function PortalGate({ title, children }: { title: string; children: (data: PortalData) => ReactNode }) {
  const portal = usePortal();

  if (portal.isPending) {
    return (
      <ImpactLayout title={title}>
        <div className="u-container imp-state">
          <LoadingBlock rows={4} label="Cargando Impacto Institucional" />
        </div>
      </ImpactLayout>
    );
  }

  if (portal.isError) {
    return (
      <ImpactLayout title={title}>
        <div className="u-container imp-state">
          <ErrorBlock error={portal.error} onRetry={() => portal.refetch()} title="No se pudo cargar Impacto Institucional" />
        </div>
      </ImpactLayout>
    );
  }

  if (!portal.data.version) {
    return (
      <ImpactLayout title={title}>
        <div className="u-container imp-missing">
          <h1>Aún no hay cifras que mostrar</h1>
          <p>
            Planeación todavía no ha publicado el catálogo de indicadores. Cuando lo publique y las vicerrectorías validen
            el primer periodo, las cifras aparecerán aquí.
          </p>
          <Link className="button-ghost" to="/admin/impacto">
            Ir a Impacto en la intranet
          </Link>
        </div>
      </ImpactLayout>
    );
  }

  return <>{children(portal.data)}</>;
}
