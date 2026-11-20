/* Planeación y Seguimiento · proyectos: las líneas del plan con búsqueda, filtros y orden. Cada una se abre a pantalla completa. */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SIN_EVALUAR } from "./calculos";
import { usePs } from "./contexto";
import { DESDE_MODULO } from "./marco/PaginaCompleta";
import { BarraFiltros, Prioridad } from "./partes";
import { ChipEstadoProyecto } from "./proyectos/partesProy";
import { estadoProyecto, puedeEvaluarProyecto } from "./proyectos/modeloProy";
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
  const { filtradas, lineas, ruta, filtros, setFiltros, nivel } = usePs();
  const soloSin = filtros.evaluacion?.length === 1 && filtros.evaluacion[0] === SIN_EVALUAR;
  const alternarSin = () => { const f = { ...filtros }; if (soloSin) delete f.evaluacion; else f.evaluacion = [SIN_EVALUAR]; setFiltros(f); };
  const nSin = lineas.filter((l) => estadoProyecto(l) === "sin_evaluar").length;
  const nSinOficina = lineas.filter((l) => !l.oficina).length;
  const evalua = puedeEvaluarProyecto(nivel);
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
      {nivel === "admin" && nSinOficina > 0 ? (
        <p className="ps-aviso" role="note"><Icon name="info" size={16} /> <span><strong>{entero(nSinOficina)}</strong> {nSinOficina === 1 ? "proyecto no tiene" : "proyectos no tienen"} oficina responsable, así que nadie les planifica actividades. <Link to={ruta("asignar-oficinas")} state={DESDE_MODULO}>Asignar oficinas</Link></span></p>
      ) : null}
      <div className="ps-herramientas">
        <button type="button" className="ps-filtro-rapido" aria-pressed={soloSin} onClick={alternarSin}>
          <Icon name="clock" size={14} /> Solo sin evaluar <b>{entero(nSin)}</b>
        </button>
        {nivel === "admin" || nivel === "gestor" ? <Link className="button-secondary ps-btn-peq" to={ruta("proyectos-plan")} state={DESDE_MODULO}><Icon name="pen" size={13} /> Proyectos del plan</Link> : null}
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
        <div className="ps-tabla ps-tabla--evaluar" role="table" aria-label="Líneas del plan">
          <div className="ps-tabla__fila ps-tabla__cab" role="row">
            <span role="columnheader">Línea</span><span role="columnheader">Campus</span><span role="columnheader">Prioridad</span><span role="columnheader" className="ps-der">Monto</span><span role="columnheader">Evaluación</span><span role="columnheader">Acción</span>
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
              <span role="cell" data-l="Evaluación"><ChipEstadoProyecto estado={estadoProyecto(l)} /></span>
              <span role="cell" data-l="Acción">
                {evalua ? <Link className={estadoProyecto(l) === "sin_evaluar" ? "button-primary ps-btn-peq" : "button-secondary ps-btn-peq"} to={ruta("proyecto-evaluar", l.no)} state={DESDE_MODULO}>{estadoProyecto(l) === "sin_evaluar" ? "Evaluar" : "Revisar"}<span className="sr-only"> el proyecto {l.no}</span></Link>
                  : estadoProyecto(l) !== "sin_evaluar" ? <Link className="button-secondary ps-btn-peq" to={ruta("proyecto-evaluar", l.no)} state={DESDE_MODULO}>Ver evaluación<span className="sr-only"> del proyecto {l.no}</span></Link> : <span className="ps-nota">Espera a la VAF</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { clavePilar };
