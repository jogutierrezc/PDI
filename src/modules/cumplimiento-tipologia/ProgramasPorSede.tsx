/* =============================================================================
   Cumplimiento de Tipología · «Programas por sede»: la vista de la vicerrectoría.
   Porcentaje de profesores que cumplen en cada programa y sede, con la lectura
   por colores de la maqueta. Pulsar una celda abre ese programa y sede.
   ========================================================================== */

import { useMemo } from "react";
import { Icon } from "../../components/ui/Icon";
import { LECTURA, nombreSede, type CeldaMatriz } from "./modelo";

/** El orden de las sedes en la maqueta aprobada. */
const SEDES_ORDEN = ["buc", "val", "cuc", "bog"] as const;

type Tono = "ok" | "wait" | "risk";
const tonoDe = (pc: number): Tono => (pc >= LECTURA.matrizBueno ? "ok" : pc >= LECTURA.matrizAmbar ? "wait" : "risk");

export function ProgramasPorSede({ celdas, onElegir }: { celdas: CeldaMatriz[]; onElegir: (programaNorm: string, sede: string) => void }) {
  const programas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of celdas) if (!mapa.has(c.programa_norm)) mapa.set(c.programa_norm, c.programa);
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [celdas]);
  const porClave = useMemo(() => new Map(celdas.map((c) => [`${c.programa_norm}|${c.sede}`, c])), [celdas]);

  return (
    <section className="ct-panel">
      <h2 className="ct-h2">Cumplimiento por programa y sede</h2>
      <p className="ct-sub">Porcentaje de profesores que cumplen la tipología. Pulse una celda para ver el programa.</p>
      <div className="ct-tbl-scroll">
        <div className="ct-matrix" role="table" aria-label="Cumplimiento por programa y sede">
          <div className="ct-matrix__fila" role="row">
            <div className="ct-mh" role="columnheader">
              Programa
            </div>
            {SEDES_ORDEN.map((s) => (
              <div className="ct-mh" role="columnheader" key={s}>
                {nombreSede(s)}
              </div>
            ))}
          </div>
          {programas.map(([norm, nombre]) => (
            <div className="ct-matrix__fila" role="row" key={norm}>
              <div className="ct-mp" role="rowheader">
                {nombre}
              </div>
              {SEDES_ORDEN.map((s) => {
                const c = porClave.get(`${norm}|${s}`);
                if (!c) {
                  return (
                    <div className="ct-mc ct-mc--none" role="cell" key={s}>
                      <span>Sin corte</span>
                    </div>
                  );
                }
                const evaluables = c.cumplen + c.no_cumplen;
                if (evaluables === 0) {
                  return (
                    <div className="ct-mcell" role="cell" key={s}>
                      <button type="button" className="ct-mc" onClick={() => onElegir(norm, s)}>
                        <span className="ct-mc__pc" data-t="neutral">
                          Sin regla
                        </span>
                        <small className="ct-num">{c.profesores} profesores</small>
                      </button>
                    </div>
                  );
                }
                const pc = Math.round((c.cumplen / evaluables) * 100);
                const t = tonoDe(pc);
                return (
                  <div className="ct-mcell" role="cell" key={s}>
                    <button type="button" className="ct-mc" onClick={() => onElegir(norm, s)} aria-label={`${nombre}, ${nombreSede(s)}: ${pc} % cumple, ${c.cumplen} de ${evaluables}`}>
                      <span className="ct-mc__pc" data-t={t}>
                        <Icon name={t === "ok" ? "check" : t === "wait" ? "clock" : "alert"} size={15} />
                        <span className="ct-num">{pc} %</span>
                      </span>
                      <span className="ct-bar" aria-hidden="true">
                        <i data-t={t} style={{ width: `${pc}%` }} />
                      </span>
                      <small className="ct-num">
                        {c.cumplen} de {evaluables} cumplen
                      </small>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <ul className="ct-legend ct-legend--sola">
        <li>
          <span className="ct-dot" data-t="ok" />
          {LECTURA.matrizBueno} % o más
        </li>
        <li>
          <span className="ct-dot" data-t="wait" />
          {LECTURA.matrizAmbar} a {LECTURA.matrizBueno - 1} %
        </li>
        <li>
          <span className="ct-dot" data-t="risk" />
          Menos de {LECTURA.matrizAmbar} %
        </li>
      </ul>
    </section>
  );
}
