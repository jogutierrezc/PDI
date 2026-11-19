/* Planeación y Seguimiento · proyectos: las líneas del plan con búsqueda, filtros y orden. Cada una se abre a pantalla completa. */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { sinEvaluar } from "./calculos";
import { usePs } from "./contexto";
import { DESDE_MODULO } from "./marco/PaginaCompleta";
import { BarraFiltros, EstadoEvaluacion, Prioridad } from "./partes";
import { Icon } from "../../components/ui/Icon";
import { PRIORIDADES, clavePilar, entero, llano, millones1, pilarCodigo, rotuloCampus, type Linea } from "./modelo";

type Orden = "monto" | "nombre" | "numero" | "prioridad" | "campus";
const ORDENES: { id: Orden; texto: string }[] = [
  { id: "monto", texto: "Mayor inversión" },
  { id: "nombre", texto: "Nombre" },
  { id: "numero", texto: "N.º de la línea" },
  { id: "prioridad", texto: "Prioridad" },
  { id: "campus", texto: "Campus" },
];
const comparar: Record<Orden, (a: Linea, b: Linea) => number> = {
  monto: (a, b) => (b.monto ?? -1) - (a.monto ?? -1),
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
  numero: (a, b) => a.no.localeCompare(b.no, "es", { numeric: true }),
  prioridad: (a, b) => PRIORIDADES.indexOf(a.prioridad as (typeof PRIORIDADES)[number]) - PRIORIDADES.indexOf(b.prioridad as (typeof PRIORIDADES)[number]) || (b.monto ?? 0) - (a.monto ?? 0),
  campus: (a, b) => a.campus.localeCompare(b.campus, "es") || (b.monto ?? 0) - (a.monto ?? 0),
};

export function Proyectos() {
  const { filtradas, ruta } = usePs();
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<Orden>("monto");
  const filas = useMemo(() => {
    const t = llano(q);
    const base = t ? filtradas.filter((l) => llano(`${l.no} ${l.nombre} ${l.descripcion ?? ""} ${l.oficina ?? ""}`).includes(t)) : filtradas;
    return [...base].sort(comparar[orden]);
  }, [filtradas, q, orden]);
  return (
    <div className="ps-seccion">
      <BarraFiltros />
      <div className="ps-herramientas">
        <label className="ps-buscar">
          <Icon name="search" size={15} />
          <span className="sr-only">Buscar por nombre, descripción o número</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, descripción o N.º" />
        </label>
        <label className="ps-orden">
          <span>Ordenar por</span>
          <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
            {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
          </select>
        </label>
        <p className="ps-herramientas__n" aria-live="polite">{entero(filas.length)} {filas.length === 1 ? "línea" : "líneas"}</p>
      </div>
      {filas.length === 0 ? (
        <p className="ps-vacio-linea">Ninguna línea coincide con la búsqueda y los filtros. Quite alguno para ver más.</p>
      ) : (
        <div className="ps-tabla" role="table" aria-label="Líneas del plan">
          <div className="ps-tabla__fila ps-tabla__cab" role="row">
            <span role="columnheader">Línea</span><span role="columnheader">Campus</span><span role="columnheader">Prioridad</span><span role="columnheader" className="ps-der">Monto</span><span role="columnheader">Evaluación</span>
          </div>
          {filas.map((l) => (
            <div className="ps-tabla__fila" role="row" key={l.no}>
              <span role="cell" className="ps-tabla__t">
                <Link to={ruta("proyectos", l.no)} state={DESDE_MODULO}>{l.nombre.replace(/\.$/, "")}</Link>
                <em>#{l.no} · {l.clasif} · {pilarCodigo(l.pilar)}{l.oficina ? ` · ${l.oficina}` : ""}</em>
              </span>
              <span role="cell" data-l="Campus">{rotuloCampus(l.campus)}</span>
              <span role="cell" data-l="Prioridad"><Prioridad valor={l.prioridad} /></span>
              <span role="cell" className="ps-der" data-l="Monto">{l.monto === null ? "Sin monto" : millones1(l.monto)}</span>
              <span role="cell" data-l="Evaluación"><EstadoEvaluacion evaluada={!sinEvaluar(l)} /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { clavePilar };
