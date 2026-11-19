/* Planeación y Seguimiento · calidad de datos: distingue lo pendiente de diligenciar, lo que todavía no aplica y lo inconsistente. */

import { Link } from "react-router-dom";
import { calidadDeDatos, type EstadoCalidad } from "./calculos";
import { usePs } from "./contexto";
import { DESDE_MODULO } from "./marco/PaginaCompleta";
import { entero } from "./modelo";

const ESTADOS: Record<EstadoCalidad, { glifo: string; texto: string }> = {
  ok: { glifo: "●", texto: "Sin hallazgos" },
  pend: { glifo: "◆", texto: "Pendiente de diligenciar" },
  na: { glifo: "○", texto: "No aplica todavía" },
  warn: { glifo: "▲", texto: "Revisar" },
};

export function Calidad() {
  const { lineas, ruta } = usePs();
  const hallazgos = calidadDeDatos(lineas);
  return (
    <div className="ps-seccion">
      <div className="ps-calidad">
        {hallazgos.map((h) => {
          const e = ESTADOS[h.estado];
          const n = h.inconsistentes.length || h.lineas.length;
          const lista = h.inconsistentes.length ? h.inconsistentes : h.lineas;
          return (
            <details className="ps-hallazgo" key={h.clave} data-estado={h.estado}>
              <summary>
                <b className="ps-hallazgo__g" aria-hidden="true">{e.glifo}</b>
                <span className="ps-hallazgo__t">
                  <strong>{h.titulo}</strong>
                  <em>{e.texto}{h.inconsistentes.length ? ` · ${h.inconsistentes.length} inconsistentes` : ""}</em>
                </span>
                <span className="ps-hallazgo__n" aria-label={`${n} líneas`}>{entero(n)}</span>
              </summary>
              <p>{h.detalle}</p>
              {lista.length ? (
                <ul className="ps-hallazgo__lista">
                  {lista.slice(0, 14).map((l) => <li key={l.no}><Link to={ruta("proyectos", l.no)} state={DESDE_MODULO}>#{l.no} {l.nombre.replace(/\.$/, "")}</Link></li>)}
                  {lista.length > 14 ? <li className="ps-nota">y {lista.length - 14} más</li> : null}
                </ul>
              ) : null}
            </details>
          );
        })}
      </div>
    </div>
  );
}
