/* Tablero IGA · Financiero: arma los datos desde las tablas conectadas en la Guía y pinta el tablero.
   Si falta conectar alguna tabla, dice cuál en vez de dibujar a medias. */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ObsDataset } from "../model";
import type { Indicador } from "../guia/api";
import { FinancieroIga } from "./Financiero";
import { CLAVES_FIN, NOMBRE_TABLA, construirProgramas, tablasFinancieras } from "./financiero-datos";
import type { FiltroFin } from "./financiero-datos";
import { DetallePrograma } from "./DetallePrograma";
import { useDetalleUrl } from "./detalle-url";

export function PaginaFinanciero({ enlace, indicadores, datasets, filtros, poner }: { enlace: string; indicadores: Indicador[]; datasets: ObsDataset[]; filtros: FiltroFin; poner: (c: Partial<FiltroFin>) => void }) {
  const tablas = useMemo(() => tablasFinancieras(indicadores, datasets), [indicadores, datasets]);
  const programas = useMemo(() => construirProgramas(tablas), [tablas]);
  const detalle = useDetalleUrl();
  const faltan = (Object.keys(CLAVES_FIN) as (keyof typeof CLAVES_FIN)[]).filter((k) => !tablas[k]);

  if (faltan.length === 3 || !programas.length) {
    return (
      <div className="iga iga-sin" role="note">
        <h3>Falta conectar las tablas de Financiero</h3>
        <p>Este tablero lee tres tablas del taller. Impórtalas en Captura de datos y conéctalas en la Guía de datos del tema «Financiero»:</p>
        <ul>{(Object.keys(CLAVES_FIN) as (keyof typeof CLAVES_FIN)[]).map((k) => <li key={k}><b>{CLAVES_FIN[k]}</b> · {NOMBRE_TABLA[k]}</li>)}</ul>
        <Link className="oda-link-button" to={`/admin/observatorio-ver/${enlace}/guia`}>Ver la guía de datos</Link>
      </div>
    );
  }
  return (
    <>
      {faltan.length > 0 && (
        <p className="iga-nota" role="note">
          Faltan por conectar: {faltan.map((k) => `${CLAVES_FIN[k]} (${NOMBRE_TABLA[k]})`).join(", ")}. Lo que depende de esas tablas sale vacío.
        </p>
      )}
      <FinancieroIga programas={programas} filtros={filtros} poner={poner} onDetalle={detalle.abrir} />
      {detalle.k && <DetallePrograma k={detalle.k} programas={programas} indicadores={indicadores} datasets={datasets} onCerrar={detalle.cerrar} onFiltrar={(prog, sede) => poner({ prog, sede })} />}
    </>
  );
}
