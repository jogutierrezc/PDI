/* =============================================================================
   Cumplimiento de Tipología · la lista de profesores del programa, con filtros.
   Pulsar una fila abre la ficha (Ficha.tsx). La clave de cada profesor es su
   seudónimo; el nombre aparece solo cuando se ha leído en vivo del Master.
   ========================================================================== */

import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "../../components/ui/Icon";
import { filtrarResumenes, type ObservacionFiltrable } from "./motor/filtros";
import { CANASTAS_UI, abreviado, horas, nombreLegible, type Resumen } from "./modelo";
import { ChipMaster, ChipVeredicto, PerfilTag, Sugerencia } from "./partes";

type Chip = "todos" | "no" | "si" | "sin";

const SIN_OBSERVACIONES = new Map<string, ObservacionFiltrable[]>();

export function ListaProfesores({
  filas,
  nombres,
  abierto,
  onAbrir,
  accionNombres,
}: {
  filas: Resumen[];
  nombres: Record<string, string>;
  abierto: string | null;
  onAbrir: (id: string) => void;
  /** El botón «Ver los nombres», que vive junto a la búsqueda. */
  accionNombres: ReactNode;
}) {
  const [chip, setChip] = useState<Chip>("todos");
  const [perfil, setPerfil] = useState("");
  const [q, setQ] = useState("");

  const cuenta = useMemo(() => {
    const si = filas.filter((f) => f.veredicto === "Cumple").length;
    const no = filas.filter((f) => f.veredicto === "No cumple").length;
    return { todos: filas.length, no, si, sin: filas.length - si - no };
  }, [filas]);

  const perfiles = useMemo(() => [...new Set(filas.map((f) => f.perfil))].sort(), [filas]);

  const visibles = useMemo(() => {
    const porChip = filas.filter((f) => (chip === "todos" ? true : chip === "si" ? f.veredicto === "Cumple" : chip === "no" ? f.veredicto === "No cumple" : f.veredicto !== "Cumple" && f.veredicto !== "No cumple"));
    const conNombre = porChip.map((f) => ({ ...f, nombre: nombres[f.seudonimo] ?? "" }));
    return filtrarResumenes(conNombre, { busqueda: q, perfil }, SIN_OBSERVACIONES);
  }, [filas, nombres, chip, perfil, q]);

  const chips: { id: Chip; texto: string; n: number }[] = [
    { id: "todos", texto: "Todos", n: cuenta.todos },
    { id: "no", texto: "No cumplen", n: cuenta.no },
    { id: "si", texto: "Cumplen", n: cuenta.si },
  ];
  if (cuenta.sin > 0) chips.push({ id: "sin", texto: "Sin regla automática", n: cuenta.sin });

  return (
    <section className="ct-panel" aria-label="Profesores">
      <div className="ct-tools">
        <div className="ct-fchips" role="group" aria-label="Filtrar por veredicto">
          {chips.map((c) => (
            <button key={c.id} type="button" aria-pressed={chip === c.id} onClick={() => setChip(c.id)}>
              {c.texto} <span className="ct-num">{c.n}</span>
            </button>
          ))}
        </div>
        <div className="ct-tools__right">
          <label className="ct-search">
            <span className="sr-only">Buscar profesor</span>
            <Icon name="search" size={16} />
            <input type="search" placeholder={Object.keys(nombres).length ? "Buscar profesor" : "Buscar por perfil o contrato"} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="ct-select" aria-label="Perfil" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
            <option value="">Todos los perfiles</option>
            {perfiles.map((p) => (
              <option key={p} value={p}>
                {p || "Sin perfil"}
              </option>
            ))}
          </select>
          {accionNombres}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="ct-vacio">Ningún profesor coincide con esos filtros.</p>
      ) : (
        <div className="ct-tbl-scroll">
          <table className="ct-tbl">
            <thead>
              <tr>
                <th scope="col">Profesor</th>
                <th scope="col">Perfil</th>
                <th scope="col">Estado en Master</th>
                <th scope="col">Horas</th>
                <th scope="col">Veredicto</th>
                <th scope="col">Preventivas</th>
                <th scope="col">Tipología sugerida</th>
                <th scope="col">
                  <span className="sr-only">Abrir ficha</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const nombre = nombres[f.seudonimo];
                const contrato = f.horas_esperadas ?? f.horas_total;
                const base = Math.max(f.horas_total, contrato || 1);
                const n = f.incumplimientos + f.preventivas;
                return (
                  <tr
                    key={f.id}
                    tabIndex={0}
                    data-fid={f.id}
                    data-abierto={abierto === f.id || undefined}
                    aria-label={`Abrir la ficha de ${nombre ? nombreLegible(nombre) : abreviado(f.seudonimo)}`}
                    onClick={() => onAbrir(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onAbrir(f.id);
                      }
                    }}
                  >
                    <td>
                      <div className="ct-pname">{nombre ? nombreLegible(nombre) : `Profesor ${abreviado(f.seudonimo)}`}</div>
                      <div className="ct-pdoc ct-num">{nombre ? abreviado(f.seudonimo) : f.escalafon || "Identificado por seudónimo"}</div>
                    </td>
                    <td>
                      <PerfilTag perfil={f.perfil} />
                    </td>
                    <td>
                      <ChipMaster estado={f.estado_master} />
                    </td>
                    <td>
                      <span className="ct-num">
                        <b>{horas(f.horas_total)}</b>
                        {f.horas_esperadas != null ? ` / ${horas(f.horas_esperadas)}` : ""} h
                      </span>
                      <div className="ct-mini" aria-hidden="true">
                        {CANASTAS_UI.map((c) => (
                          <i key={c.campo} style={{ width: `${(Number(f[c.campo] ?? 0) / base) * 100}%`, background: c.color }} />
                        ))}
                      </div>
                    </td>
                    <td>
                      <ChipVeredicto veredicto={f.veredicto} />
                    </td>
                    <td className="ct-num">{n > 0 ? <b>{n}</b> : <span className="ct-muted">0</span>}</td>
                    <td>
                      <Sugerencia fila={f} />
                    </td>
                    <td className="ct-arrow">
                      <Icon name="chevron-right" size={16} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
