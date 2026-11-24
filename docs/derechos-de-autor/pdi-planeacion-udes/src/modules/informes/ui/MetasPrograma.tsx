/* Las metas que vienen de los indicadores que el programa seleccionó en
   Impacto: bloqueadas, con su origen. La unidad solo añade el análisis de
   cada una (y, aparte, «Meta adicional»). */

import { Link } from "react-router-dom";
import { formatoCifra } from "../cifras-vivas";
import type { FilaMetaPrograma } from "../metas-programa";
import { SemaforoPill } from "./comunes";
import { TONO_RESULTADO } from "./Bloques";

const DONDE_ELEGIR = "/admin/impacto/elegir";

export function TablaMetasPrograma({
  filas,
  observaciones,
  editable,
  cambiarObservacion,
  aceptar,
  esperaIndicadores,
}: {
  filas: FilaMetaPrograma[];
  observaciones: Record<string, string>;
  editable: boolean;
  cambiarObservacion: (clave: string, texto: string) => void;
  aceptar: (clave: string, valor: number) => void;
  /** Programa o facultad: si no hay filas, se dice por qué y dónde se eligen. */
  esperaIndicadores: boolean;
}) {
  if (!filas.length) {
    return esperaIndicadores ? (
      <p className="inf-muted" role="status">
        Todavía no hay indicadores del programa para traer aquí. Se seleccionan en{" "}
        <Link className="inf-link" to={DONDE_ELEGIR}>
          Impacto → Elegir indicadores
        </Link>
        ; cuando el programa los elija, sus metas aparecerán solas. Mientras tanto puede añadir metas adicionales abajo.
      </p>
    ) : null;
  }
  const conLugar = new Set(filas.map((f) => f.donde)).size > 1;
  return (
    <div className="inf-tw">
      <table className="inf-tbl">
        <thead>
          <tr>
            <th>Objetivo (indicador del programa)</th>
            <th className="r" style={{ width: 100 }}>
              Meta
            </th>
            <th className="r" style={{ width: 100 }}>
              Alcanzado
            </th>
            <th style={{ width: 150 }}>Resultado</th>
            <th style={{ width: "28%" }}>Análisis</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave}>
              <td>
                <b>{f.nombre}</b>
                <div className="inf-muted">
                  {conLugar && f.donde ? `${f.donde} · ` : ""}
                  {f.origen === "propio" ? "Indicador propio del programa" : "Indicador del programa"}
                  {f.baja ? " · debe bajar" : ""}
                </div>
                {f.cambio && editable && (
                  <div className="inf-chg" role="status">
                    Cambió desde que lo revisó:{" "}
                    <b className="inf-num">
                      {formatoCifra(f.cambio.de, f.unidad)} → {formatoCifra(f.cambio.a, f.unidad)}
                    </b>
                    <button type="button" className="inf-link" onClick={() => aceptar(f.clave, f.cambio?.a ?? 0)}>
                      Aceptar
                    </button>
                  </div>
                )}
              </td>
              <td className="r inf-num">{f.meta !== null ? formatoCifra(f.meta, f.unidad) : f.metaTexto || <span className="inf-muted">Sin meta</span>}</td>
              <td className="r inf-num">
                {formatoCifra(f.alcanzado, f.unidad)}
                <div className="inf-muted">{f.congelada ? "Foto al enviar" : f.viva ? "En vivo" : ""}</div>
              </td>
              <td>
                {f.resultado ? <span className={`inf-pill ${TONO_RESULTADO[f.resultado]}`}>{f.resultado}</span> : <span className="inf-muted">—</span>}{" "}
                <SemaforoPill s={f.semaforo} />
              </td>
              <td>
                <input
                  value={observaciones[f.clave] ?? ""}
                  readOnly={!editable}
                  onChange={(e) => cambiarObservacion(f.clave, e.target.value)}
                  placeholder={editable ? "Qué explica este resultado" : ""}
                  aria-label={`Análisis de ${f.nombre}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
