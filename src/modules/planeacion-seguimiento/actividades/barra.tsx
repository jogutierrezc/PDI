/* Planeación y Seguimiento · Fase 2 · barra de búsqueda y filtros compartida por Tablero, Lista y Cronograma.
   Todo vive en la dirección (?q=, ?alcance=, ?agrupar=, ?mias=): al volver con «Regresar» se conserva. */

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { usePs } from "../contexto";
import { AGRUPACIONES, ROTULO_AGRUPAR, filtrarActividades, type Agrupar } from "./filtros";
import { useAct, useActividades, useCatalogoPdi, useOficinaActual } from "./hooks";
import { pasaFiltroPdi } from "./pdi";
import { ROTULO_PDI, type ConexionPdi } from "./modeloF3";
import { SelectorOficina } from "./partes";
import type { Actividad } from "./modelo";

export interface FiltrosAct {
  alcance: "mi" | "todas";
  q: string;
  mias: boolean;
  agrupar: Agrupar;
  /** Fase 3: conexión con el PDI y pilar (en la dirección: ?pdi=, ?pilar=). */
  pdi: "" | ConexionPdi;
  pilar: string;
}

export function useFiltrosAct() {
  const [params, setParams] = useSearchParams();
  const agr = params.get("agrupar");
  const f: FiltrosAct = {
    alcance: params.get("alcance") === "todas" ? "todas" : "mi",
    q: params.get("q") ?? "",
    mias: params.get("mias") === "1",
    agrupar: (AGRUPACIONES as readonly string[]).includes(agr ?? "") ? (agr as Agrupar) : "estado",
    pdi: (["con_pdi", "sin_pdi", "sin_definir"] as const).find((x) => x === params.get("pdi")) ?? "",
    pilar: params.get("pilar") ?? "",
  };
  const poner = (cambios: Partial<Record<"alcance" | "q" | "mias" | "agrupar" | "pdi" | "pilar", string | null>>) => {
    const s = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "" || (k === "alcance" && v === "mi") || (k === "agrupar" && v === "estado") || (k === "mias" && v !== "1")) s.delete(k);
      else s.set(k, v);
    }
    setParams(s, { replace: true });
  };
  return { f, poner };
}

/** Las actividades del alcance elegido, ya buscadas y filtradas. */
export function useDatosActividades() {
  const { lineas } = usePs();
  const a = useAct();
  const { oficina, oficinas, elegir } = useOficinaActual();
  const { f, poner } = useFiltrosAct();
  const ids = useMemo(() => (f.alcance === "todas" ? oficinas.map((o) => o.id) : oficina ? [oficina.id] : []), [f.alcance, oficinas, oficina]);
  const q = useActividades(ids);
  const nombrePorNo = useMemo(() => new Map(lineas.map((l) => [l.no, l.nombre])), [lineas]);
  const nombreLinea = (no: string) => `${no} · ${(nombrePorNo.get(no) ?? "Línea del plan").replace(/\.$/, "")}`;
  const todas: Actividad[] = useMemo(() => q.data ?? [], [q.data]);
  const catalogo = useCatalogoPdi();
  const filtradas = useMemo(() => filtrarActividades(todas, { q: f.q, mias: f.mias, yo: a.yo }, { nombreDe: a.nombreDe, nombreLinea }).filter((x) => pasaFiltroPdi(x, { pdi: f.pdi, pilar: f.pilar })), [todas, f.q, f.mias, f.pdi, f.pilar, a.yo, a.personas, nombrePorNo]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...a, oficina, oficinas, elegir, f, poner, ids, todas, filtradas, pilares: catalogo.data ?? [], nombreLinea, cargandoActs: q.isPending && ids.length > 0, errorActs: q.error as Error | null };
}

export function BarraActividades({ d, agrupar = false }: { d: ReturnType<typeof useDatosActividades>; agrupar?: boolean }) {
  const { f, poner, oficina, oficinas, elegir } = d;
  return (
    <section className="ps-barra-act" aria-label="Buscar y filtrar actividades">
      <div className="ps-barra-act__fila">
        <div className="ps-buscar">
          <Icon name="search" size={15} />
          <input type="search" value={f.q} placeholder="Buscar actividad, línea o persona" aria-label="Buscar actividad, línea o persona" onChange={(e) => poner({ q: e.target.value })} />
        </div>
        <div className="ps-segmentos" role="radiogroup" aria-label="Qué actividades ver">
          <label><input type="radio" name="alcance" checked={f.alcance === "mi"} onChange={() => poner({ alcance: "mi" })} /><span>Mi oficina</span></label>
          <label><input type="radio" name="alcance" checked={f.alcance === "todas"} onChange={() => poner({ alcance: "todas" })} /><span>Todas</span></label>
        </div>
        <label className="ps-opcion ps-opcion--linea"><input type="checkbox" checked={f.mias} onChange={(e) => poner({ mias: e.target.checked ? "1" : null })} /><span>Solo las mías</span></label>
        <div className="ps-selector ps-selector--linea">
          <label htmlFor="ps-pdi">Plan de Desarrollo (PDI)</label>
          <select id="ps-pdi" value={f.pdi} onChange={(e) => poner({ pdi: e.target.value, ...(e.target.value === "sin_pdi" || e.target.value === "sin_definir" ? { pilar: null } : {}) })}>
            <option value="">Todas</option>
            {(["con_pdi", "sin_pdi", "sin_definir"] as const).map((c) => <option key={c} value={c}>{ROTULO_PDI[c]}</option>)}
          </select>
        </div>
        {f.pdi === "" || f.pdi === "con_pdi" ? (
          <div className="ps-selector ps-selector--linea">
            <label htmlFor="ps-pilar">Pilar</label>
            <select id="ps-pilar" value={f.pilar} onChange={(e) => poner({ pilar: e.target.value })}>
              <option value="">Todos los pilares</option>
              {d.pilares.map((p) => <option key={p.pillarId} value={p.pillarId}>{p.codigo} {p.nombre}</option>)}
            </select>
          </div>
        ) : null}
        {agrupar ? (
          <div className="ps-selector ps-selector--linea">
            <label htmlFor="ps-agrupar">Agrupar por</label>
            <select id="ps-agrupar" value={f.agrupar} onChange={(e) => poner({ agrupar: e.target.value })}>
              {AGRUPACIONES.map((g) => <option key={g} value={g}>{ROTULO_AGRUPAR[g]}</option>)}
            </select>
          </div>
        ) : null}
      </div>
      {f.alcance === "mi" && oficinas.length > 1 ? <SelectorOficina oficinas={oficinas} valor={oficina?.id} onElegir={elegir} /> : null}
    </section>
  );
}
