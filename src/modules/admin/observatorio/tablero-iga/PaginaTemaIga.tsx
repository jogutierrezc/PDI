/* Tablero IGA · un tema cualquiera: arma las tablas desde lo conectado en el taller y pinta su tablero.
   Con `conBarra` (portal) trae sus propios filtros; en la intranet los pone la pantalla de lectura. */

import { useMemo } from "react";
import type { ObsDataset } from "../model";
import type { Indicador } from "../guia/api";
import { BarraFiltros } from "./BarraFiltros";
import { DetallePrograma } from "./DetallePrograma";
import { useDetalleUrl } from "./detalle-url";
import { estructuraDe, resolverTablas } from "./motor";
import type { CfgTema } from "./motor";
import { TableroTema } from "./TableroTema";
import type { FiltroFin } from "./financiero-datos";

export function PaginaTemaIga({ cfg, datasets, indicadores, filtros, poner, conBarra = false }: { cfg: CfgTema; datasets: ObsDataset[]; indicadores: Indicador[]; filtros: FiltroFin; poner: (c: Partial<FiltroFin>) => void; conBarra?: boolean }) {
  const tablas = useMemo(() => resolverTablas(cfg.tablas, datasets, indicadores, cfg.slug), [cfg, datasets, indicadores]);
  const estructura = useMemo(() => estructuraDe(tablas), [tablas]);
  const detalle = useDetalleUrl();
  return (
    <>
      {conBarra && <BarraFiltros programas={estructura} filtros={filtros} poner={poner} />}
      <TableroTema cfg={cfg} tablas={tablas} filtros={filtros} poner={poner} onDetalle={detalle.abrir} />
      {detalle.k && <DetallePrograma k={detalle.k} programas={[]} indicadores={indicadores} datasets={datasets} onCerrar={detalle.cerrar} onFiltrar={(prog, sede) => poner({ prog, sede })} />}
    </>
  );
}
