/* =============================================================================
   Informes de gestión · «Ver el informe de…»: quien gestiona (administración y Planeación)
   abre desde Mi informe el informe de cualquier unidad y sede del ciclo, solo para leerlo.
   Escribir es de quien trabaja en la unidad; aprobar o devolver, de Revisión.
   ========================================================================== */

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useInstancias, useOfertaSedes, useUnidades } from "../datos";
import { ETIQUETA_ESTADO } from "../estados";
import { PLANTILLAS } from "../plantillas";
import { nombreConSede } from "../sedes";
import type { CicloRow } from "../types";

export function TodosLosInformes({ ciclo }: { ciclo: CicloRow }) {
  const [params, setParams] = useSearchParams();
  const instancias = useInstancias(ciclo.id);
  const unidades = useUnidades();
  const oferta = useOfertaSedes();

  const opciones = useMemo(() => {
    const porId = new Map((unidades.data ?? []).map((u) => [u.id, u]));
    const sedes = new Map((oferta.data?.sedes ?? []).map((s) => [s.id, s]));
    return (instancias.data ?? [])
      .map((i) => {
        const unidad = porId.get(i.unit_id);
        const sede = i.campus_id ? (sedes.get(i.campus_id) ?? null) : null;
        return { valor: `${i.unit_id}|${sede?.slug ?? ""}`, unidad: i.unit_id, sede: sede?.slug ?? "", nombre: nombreConSede(unidad?.name ?? "Unidad", sede), estado: ETIQUETA_ESTADO[i.estado], plantilla: PLANTILLAS[i.plantilla]?.nombre ?? i.plantilla };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [instancias.data, unidades.data, oferta.data]);

  if (!opciones.length) return null;
  const actual = `${params.get("unidad") ?? ""}|${params.get("sede") ?? ""}`;
  const elegida = opciones.some((o) => o.valor === actual) ? actual : "";

  return (
    <div className="inf-row inf-todos" style={{ alignItems: "end" }}>
      <label className="inf-lab" style={{ minWidth: 280, flex: "1 1 280px", maxWidth: 520 }}>
        Ver el informe de
        <select
          className="inf-in"
          value={elegida}
          onChange={(e) => {
            const o = opciones.find((x) => x.valor === e.target.value);
            if (!o) return;
            const p = new URLSearchParams(params);
            p.set("unidad", o.unidad);
            if (o.sede) p.set("sede", o.sede);
            else p.delete("sede");
            p.delete("s");
            setParams(p, { replace: true });
          }}
        >
          <option value="" disabled>
            Elija una unidad…
          </option>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.nombre} · {o.plantilla} · {o.estado}
            </option>
          ))}
        </select>
      </label>
      <span className="inf-hint">
        Administración ve los {opciones.length} informes del ciclo, solo para leerlos. Escribe quien trabaja en la unidad; Planeación aprueba o devuelve en Revisión.
      </span>
    </div>
  );
}
