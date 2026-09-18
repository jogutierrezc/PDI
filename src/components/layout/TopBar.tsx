/* =============================================================================
   Cabecera del Portal PDI.

   El PDI comparte la barra unificada de los portales de Planeación
   (SiteHeader): su menú «Plan de Desarrollo» lleva a Implementación, Tablero,
   facultades, campus, ODS y los pilares; la búsqueda es la transversal de la
   portada, que también encuentra pilares, proyectos e indicadores.
   ========================================================================== */

import { SiteHeader } from "./SiteHeader";

export function TopBar() {
  return <SiteHeader />;
}
