/* =============================================================================
   Observatorio de Indicadores de Gestión Académica · tablero del portal.

   Lo que ven vicerrectores y decanos en /datos-abiertos/observatorio/iga-financiero:
   el mismo tablero que la intranet, leído de lo PUBLICADO (tablas en estado
   «publicado» y su conexión en la Guía de datos). Los filtros van en la dirección
   (?vr=pos&fac=…&sede=…&prog=…), así que una vista se comparte con un enlace.
   ========================================================================== */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { datasetFrom } from "../../admin/observatorio/store";
import type { DatasetRow } from "../../admin/observatorio/store";
import type { Indicador } from "../../admin/observatorio/guia/api";
import { BarraFiltros } from "../../admin/observatorio/tablero-iga/BarraFiltros";
import { FinancieroIga } from "../../admin/observatorio/tablero-iga/Financiero";
import { CLAVES_FIN, NOMBRE_TABLA, construirProgramas, tablasFinancieras } from "../../admin/observatorio/tablero-iga/financiero-datos";
import type { FiltroFin } from "../../admin/observatorio/tablero-iga/financiero-datos";
import { DetallePrograma } from "../../admin/observatorio/tablero-iga/DetallePrograma";
import { useDetalleUrl } from "../../admin/observatorio/tablero-iga/detalle-url";
import "../../admin/observatorio/tablero-iga/tablero-iga.css";

function usePublicadoIga(obsId: string | null) {
  return useQuery({
    queryKey: ["obs-iga-publico", obsId],
    enabled: !!obsId,
    staleTime: 60_000,
    queryFn: async () => {
      const [ind, ds] = await Promise.all([
        supabase.from("obs_indicadores").select("*").eq("observatorio_id", obsId!),
        supabase.from("obs_datasets").select("*").eq("status", "publicado"),
      ]);
      if (ind.error || ds.error) throw ind.error ?? ds.error;
      return { indicadores: (ind.data ?? []) as Indicador[], datasets: (ds.data as DatasetRow[]).map(datasetFrom) };
    },
  });
}

export default function PortalIga({ obsId }: { obsId: string | null }) {
  const [sp, setSp] = useSearchParams();
  const detalle = useDetalleUrl();
  const q = usePublicadoIga(obsId);
  const tablas = useMemo(() => (q.data ? tablasFinancieras(q.data.indicadores, q.data.datasets) : {}), [q.data]);
  const programas = useMemo(() => construirProgramas(tablas), [tablas]);

  const filtros: FiltroFin = { vr: sp.get("vr") === "pos" ? "pos" : "", fac: sp.get("fac") ?? "", sede: sp.get("sede") ?? "", prog: sp.get("prog") ?? "" };
  const poner = (c: Partial<FiltroFin>) => {
    const n = new URLSearchParams(sp);
    const nuevo = { ...filtros, ...c };
    (Object.keys(nuevo) as (keyof FiltroFin)[]).forEach((k) => (nuevo[k] ? n.set(k, nuevo[k]) : n.delete(k)));
    setSp(n, { replace: true });
  };

  if (q.isPending) return <div className="obs-live__loading" aria-busy="true" />;
  if (q.isError || !programas.length) {
    return (
      <section className="obs-views" aria-label="Datos de Financiero">
        <p className="obs-note" role="note">
          <span className="od-stamp">Sin datos publicados</span>
          <span>
            Este tablero lee {Object.keys(CLAVES_FIN).length} tablas: {(Object.keys(CLAVES_FIN) as (keyof typeof CLAVES_FIN)[]).map((k) => NOMBRE_TABLA[k]).join(", ")}. Aparecerán aquí cuando se publiquen y se conecten en la Guía de datos.
          </span>
        </p>
      </section>
    );
  }
  return (
    <section className="iga iga--portal" aria-label="Tablero de Financiero">
      <BarraFiltros programas={programas} filtros={filtros} poner={poner} />
      <FinancieroIga programas={programas} filtros={filtros} poner={poner} onDetalle={detalle.abrir} />
      {detalle.k && q.data && <DetallePrograma k={detalle.k} programas={programas} indicadores={q.data.indicadores} datasets={q.data.datasets} onCerrar={detalle.cerrar} onFiltrar={(prog, sede) => poner({ prog, sede })} />}
    </section>
  );
}
