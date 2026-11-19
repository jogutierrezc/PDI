/* Planeación y Seguimiento · cronograma 2027-2035 (Gantt de solo lectura). */

import { Link } from "react-router-dom";
import { posicionBarra, sinEvaluar } from "./calculos";
import { usePs } from "./contexto";
import { DESDE_MODULO } from "./marco/PaginaCompleta";
import { BarraFiltros, Nota } from "./partes";
import { aniosDe, clavePilar, fecha, pilarCodigo, pilarNombre, type Linea } from "./modelo";

export function Gantt({ lineas, anioIni, anioFin, limite = 0 }: { lineas: Linea[]; anioIni: number; anioFin: number; limite?: number }) {
  const { ruta } = usePs();
  const conFechas = lineas.filter((l) => l.inicio && l.fin);
  let filas = [...conFechas].sort((a, b) => (a.inicio! < b.inicio! ? -1 : a.inicio! > b.inicio! ? 1 : (b.monto ?? 0) - (a.monto ?? 0)));
  if (limite) filas = [...conFechas].sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0)).slice(0, limite).sort((a, b) => (a.inicio! < b.inicio! ? -1 : 1));
  const anios = aniosDe(anioIni, anioFin);
  const pilares = [...new Set(filas.map((l) => l.pilar))].sort((a, b) => clavePilar(a) - clavePilar(b));
  const sin = lineas.length - conFechas.length;
  return (
    <>
      <div className="ps-gantt" role="table" aria-label="Cronograma de las líneas del plan" style={{ ["--n" as string]: anios.length }}>
        <div className="ps-gantt__fila ps-gantt__cab" role="row">
          <span role="columnheader" className="ps-gantt__l">Línea</span>
          <span role="columnheader" className="ps-gantt__t" style={{ gridTemplateColumns: `repeat(${anios.length}, 1fr)` }}>
            {anios.map((a) => <span key={a}>{a}</span>)}
          </span>
        </div>
        {filas.map((l) => {
          const p = posicionBarra(l.inicio!, l.fin!, anioIni, anioFin);
          return (
            <div className="ps-gantt__fila" role="row" key={l.no}>
              <span role="cell" className="ps-gantt__l">
                <Link to={ruta("proyectos", l.no)} state={DESDE_MODULO}>
                  <b>#{l.no}</b> {l.nombre}
                </Link>
                <em className="ps-gantt__fechas">{fecha(l.inicio)} a {fecha(l.fin)}</em>
              </span>
              <span role="cell" className="ps-gantt__t" style={{ gridTemplateColumns: `repeat(${anios.length}, 1fr)` }} aria-hidden="true">
                <i className="ps-gantt__barra" data-pilar={clavePilar(l.pilar)} style={{ left: `${p.izquierda}%`, width: `${p.ancho}%` }} />
              </span>
            </div>
          );
        })}
      </div>
      <ul className="ps-leyenda ps-leyenda--linea">
        {pilares.map((p) => (
          <li key={p}><i className="ps-sw" data-pilar={clavePilar(p)} aria-hidden="true" />{pilarCodigo(p)} {pilarNombre(p)}</li>
        ))}
      </ul>
      {sin > 0 ? <Nota>{sin} líneas sin fechas{lineas.some(sinEvaluar) ? " (sin evaluar)" : ""} no aparecen en el cronograma.</Nota> : null}
    </>
  );
}

export function Cronograma() {
  const { filtradas, plan } = usePs();
  if (!plan) return null;
  return (
    <div className="ps-seccion">
      <BarraFiltros />
      <Gantt lineas={filtradas} anioIni={plan.anioIni} anioFin={plan.anioFin} />
    </div>
  );
}
