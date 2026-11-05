/* =============================================================================
   Cumplimiento de Tipología · «Programas y unidades» (solo el administrador).

   El Warehouse conoce el programa por el nombre del departamento o carrera de la
   nómina. Quién ve cada programa lo decide la unidad del organigrama a la que se
   asigne aquí: la pertenencia de cada persona a esa unidad (o a una de la que
   cuelga, como la facultad o la vicerrectoría) viene de «Estructura y usuarios».
   Un programa sin unidad solo lo ve el administrador del módulo.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useAsignarPrograma, useProgramas, useUnidades } from "./api";
import { entero, mensajeDe } from "./modelo";

const TIPO_UNIDAD: Record<string, string> = { vicerrectoria: "Vicerrectoría", facultad: "Facultad", programa: "Programa", oficina: "Oficina", otra: "Otra" };

export function Unidades() {
  const programas = useProgramas(true);
  const unidades = useUnidades(true);
  const asignar = useAsignarPrograma();
  const [q, setQ] = useState("");
  const [soloSin, setSoloSin] = useState(false);

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (programas.data ?? []).filter((p) => (!soloSin || !p.unit_id) && (!t || p.programa.toLowerCase().includes(t)));
  }, [programas.data, q, soloSin]);
  const sinUnidad = (programas.data ?? []).filter((p) => !p.unit_id).length;

  const porTipo = useMemo(() => {
    const grupos = new Map<string, { id: string; nombre: string }[]>();
    for (const u of unidades.data ?? []) {
      const lista = grupos.get(u.tipo) ?? [];
      lista.push({ id: u.id, nombre: u.nombre });
      grupos.set(u.tipo, lista);
    }
    return [...grupos.entries()];
  }, [unidades.data]);

  if (programas.isPending || unidades.isPending) return <LoadingBlock rows={5} label="Leyendo los programas" />;
  if (programas.error) return <ErrorBlock error={programas.error} onRetry={() => void programas.refetch()} />;
  if (unidades.error) return <ErrorBlock error={unidades.error} onRetry={() => void unidades.refetch()} />;

  return (
    <section className="ct-panel">
      <h2 className="ct-h2">Programas y unidades</h2>
      <p className="ct-sub">
        Cada programa de la nómina, con la unidad del organigrama que decide quién lo ve. {sinUnidad > 0 ? `${sinUnidad} siguen sin unidad.` : "Todos tienen unidad."} Las personas se asignan a las unidades en «Estructura y usuarios».
      </p>
      <div className="ct-tools">
        <label className="ct-search">
          <span className="sr-only">Buscar programa</span>
          <Icon name="search" size={16} />
          <input type="search" placeholder="Buscar programa" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="ct-fchips" role="group" aria-label="Filtrar programas">
          <button type="button" aria-pressed={!soloSin} onClick={() => setSoloSin(false)}>
            Todos <span className="ct-num">{programas.data?.length ?? 0}</span>
          </button>
          <button type="button" aria-pressed={soloSin} onClick={() => setSoloSin(true)}>
            Sin unidad <span className="ct-num">{sinUnidad}</span>
          </button>
        </div>
      </div>
      {asignar.error && (
        <p className="ct-error" role="alert">
          {mensajeDe(asignar.error)}
        </p>
      )}
      {filas.length === 0 ? (
        <p className="ct-vacio">{(programas.data ?? []).length === 0 ? "Todavía no hay programas: se llenan al calcular el primer corte." : "Ningún programa coincide."}</p>
      ) : (
        <div className="ct-tbl-scroll">
          <table className="ct-tbl ct-tbl--chica">
            <thead>
              <tr>
                <th scope="col">Programa (departamento o carrera de la nómina)</th>
                <th scope="col">Profesores</th>
                <th scope="col">Unidad que lo ve</th>
                <th scope="col">Cómo se asignó</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.programa_norm}>
                  <td>{p.programa}</td>
                  <td className="ct-num">{entero(p.profesores)}</td>
                  <td>
                    <select
                      className="ct-select"
                      aria-label={`Unidad de ${p.programa}`}
                      value={p.unit_id ?? ""}
                      disabled={asignar.isPending}
                      onChange={(e) => asignar.mutate({ programaNorm: p.programa_norm, unitId: e.target.value || null })}
                    >
                      <option value="">Sin unidad: solo el administrador</option>
                      {porTipo.map(([tipo, lista]) => (
                        <optgroup key={tipo} label={TIPO_UNIDAD[tipo] ?? tipo}>
                          {lista.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.nombre}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="ct-chip" data-t={!p.unit_id ? "wait" : p.origen === "manual" ? "ok" : "neutral"}>
                      {!p.unit_id ? "Pendiente" : p.origen === "manual" ? "Manual" : "Sugerida por nombre"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
