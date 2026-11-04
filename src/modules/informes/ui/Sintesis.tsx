/* =============================================================================
   Síntesis de resultados institucionales (pantalla). Se arma sola con lo que la
   unidad ya reportó en Objetivos y metas y en Resultados por dimensión; aquí
   solo se lee. Estados con forma y palabra, nunca solo color.
   ========================================================================== */

import { resumenEnTexto } from "../sintesis";
import type { Sintesis } from "../sintesis";
import { ETIQUETA_ESTADO_META } from "../vista/estados";
import type { Conteo, EstadoMeta } from "../vista/estados";
import { Barra } from "./comunes";

const ORDEN: EstadoMeta[] = ["superada", "cumplida", "parcial", "rezagada"];

/** Barra apilada de estados: cada tramo lleva su número y su nombre en el título. */
export function BarraEstados({ conteo, etiqueta }: { conteo: Conteo; etiqueta: string }) {
  const total = ORDEN.reduce((s, k) => s + conteo[k], 0) + conteo.sinMeta;
  if (!total) return null;
  const partes = [...ORDEN.map((k) => ({ k: k as string, n: conteo[k], t: ETIQUETA_ESTADO_META[k] })), { k: "sinmeta", n: conteo.sinMeta, t: "Sin meta" }].filter((p) => p.n > 0);
  return (
    <div className="inf-stk" role="img" aria-label={`${etiqueta}: ${partes.map((p) => `${p.n} ${p.t.toLowerCase()}`).join(", ")}`}>
      {partes.map((p) => (
        <span key={p.k} className={`is-${p.k}`} style={{ flex: p.n }} title={`${p.n} ${p.t}`}>
          {p.n}
        </span>
      ))}
    </div>
  );
}

export function PanelSintesis({ s }: { s: Sintesis }) {
  const frase = resumenEnTexto(s);
  if (!frase && !s.criterios.length) {
    return <p className="inf-muted">Todavía no hay datos. Esta síntesis se arma sola cuando se reporten las acciones en Objetivos y metas y los indicadores en Resultados por dimensión.</p>;
  }
  return (
    <div className="inf-sint">
      {frase && <p className="inf-sint__frase">{frase}</p>}

      {s.plan && (
        <div className="inf-sint__bloque">
          <h4>Objetivos y metas</h4>
          <div className="inf-plan__dims" role="list" aria-label="Avance del plan por dimensión">
            {s.plan.dimensiones.map((d) => (
              <div key={d.dimension} className="inf-plan__dim-card" role="listitem">
                <span className="inf-eyebrow">{d.dimension.toUpperCase()}</span>
                <b>{d.nombre}</b>
                <Barra valor={(d.avance ?? 0) / 100} etiqueta={d.nombre} />
                <small className="inf-muted">
                  {d.avance === null ? "Sin avance informado" : `${d.avance} % de avance`} · {d.completadas} de {d.total} completadas · {d.enProceso} en proceso
                </small>
              </div>
            ))}
          </div>
        </div>
      )}

      {s.metas && (
        <div className="inf-sint__bloque">
          <h4>Metas con resultado ({s.metas.total})</h4>
          <BarraEstados conteo={s.metas.conteo} etiqueta="Metas por estado" />
        </div>
      )}

      {s.criterios.length > 0 && (
        <div className="inf-sint__bloque">
          <h4>Resultados por dimensión ({s.indicadores.total} indicadores)</h4>
          <div className="inf-dimtab-wrap">
            <table className="inf-dimtab">
              <thead>
                <tr>
                  <th scope="col">Criterio</th>
                  <th scope="col" className="r">
                    Indicadores
                  </th>
                  <th scope="col">Estado frente a la meta</th>
                </tr>
              </thead>
              <tbody>
                {s.criterios.map((g) => (
                  <tr key={g.id}>
                    <th scope="row">{g.nombre}</th>
                    <td className="r inf-num">{g.total}</td>
                    <td>
                      <BarraEstados conteo={g.conteo} etiqueta={g.nombre} />
                    </td>
                  </tr>
                ))}
                {s.criterios.length > 1 && (
                  <tr>
                    <th scope="row">Todos</th>
                    <td className="r inf-num">{s.indicadores.total}</td>
                    <td>
                      <BarraEstados conteo={s.indicadores.conteo} etiqueta="Todos los indicadores" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="inf-hint">
            Superada, Cumplida, Parcial (desde el 70 % de la meta) y Rezagada. {s.indicadores.conAnterior > 0 && `${s.indicadores.mejoran} de ${s.indicadores.conAnterior} con dato anterior mejoraron.`}
          </p>
        </div>
      )}
    </div>
  );
}
