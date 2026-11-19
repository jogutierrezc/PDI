/* Planeación y Seguimiento · resumen del plan (la visual del prototipo aprobado, con los tokens del portal). Solo cifras reales del plan: no hay avances todavía. */

import { useRef } from "react";
import { Link } from "react-router-dom";
import { porOficina, resumir, SIN_OFICINA } from "./calculos";
import { usePs } from "./contexto";
import { Gantt } from "./Cronograma";
import { DESDE_MODULO } from "./marco/PaginaCompleta";
import { useEntradaResumen } from "./movimiento";
import { AnilloPrioridad, BarraFiltros, EstadoEvaluacion, InversionPorAnio, ListaBarras, Nota, Panel, Prioridad } from "./partes";
import { clavePilar, entero, millones, millones1, porcentaje, rotuloCampus } from "./modelo";

export function Resumen() {
  const { filtradas, lineas, plan, ruta, nivel } = usePs();
  const raiz = useRef<HTMLDivElement>(null);
  const r = resumir(filtradas);
  useEntradaResumen(raiz, plan?.version?.id);
  if (!plan?.version) return null;
  const aniosPlan = resumir(filtradas, Array.from({ length: plan.anioFin - plan.anioIni + 1 }, (_, i) => plan.anioIni + i)).porAnio;
  const oficinas = porOficina(filtradas);
  const conOf = filtradas.length ? r.conOficina / filtradas.length : 0;
  const top = [...filtradas].sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0)).slice(0, 8);
  const pesoSin = r.monto ? r.montoSinEvaluar / r.monto : 0;
  return (
    <div className="ps-seccion" ref={raiz}>
      <BarraFiltros />
      <dl className="ps-kpis" aria-label="Cifras del plan">
        <div><dt>Líneas</dt><dd data-cuenta={r.n}>{entero(r.n)}</dd><dd className="ps-kpis__s">de {entero(lineas.length)} en la versión {plan.version.etiqueta}</dd></div>
        <div><dt>Inversión del plan</dt><dd data-cuenta={r.monto} data-formato="millones">{millones(r.monto)}</dd><dd className="ps-kpis__s">M = millones de pesos</dd></div>
        <div><dt>Evaluadas</dt><dd>{r.evaluados}<small> / {r.n}</small></dd><dd className="ps-kpis__s">{r.sinEvaluar} sin evaluar</dd></div>
        <div><dt>Sin evaluar</dt><dd data-cuenta={r.montoSinEvaluar} data-formato="millones">{millones(r.montoSinEvaluar)}</dd><dd className="ps-kpis__s">{porcentaje(pesoSin)} de la inversión</dd></div>
        <div><dt>Con oficina responsable</dt><dd>{r.conOficina}<small> / {r.n}</small></dd><dd className="ps-kpis__s">{porcentaje(conOf)} de las líneas</dd></div>
      </dl>
      <div className="ps-rejilla">
        <Panel titulo="Estado de la evaluación" ancho={4}>
          <p className="ps-grande"><strong>{r.evaluados}</strong> de {r.n} líneas evaluadas y aprobadas</p>
          <div className="ps-medidor" role="img" aria-label={`${r.evaluados} de ${r.n} evaluadas`}><i data-barra="x" style={{ width: `${r.n ? (r.evaluados / r.n) * 100 : 0}%` }} /></div>
          <ul className="ps-lista-datos">
            <li><span>Aprobadas</span><b>{r.evaluados} · {millones(r.montoEvaluado)}</b></li>
            <li><span>Sin evaluar</span><b>{r.sinEvaluar} · {millones(r.montoSinEvaluar)}</b></li>
            <li><span>Peso de lo no evaluado</span><b>{porcentaje(pesoSin)} de la inversión</b></li>
          </ul>
          <Nota>{r.sinEvaluar ? "Las líneas sin evaluar no tienen fechas ni distribución anual: se diligencian cuando se evalúen. Se aplica lo definido en el Plan Operativo del PDIFyT." : "Todas las líneas filtradas están evaluadas."}</Nota>
        </Panel>
        <Panel titulo="Cobertura de oficina" ancho={8} sub="Qué líneas ya tienen una oficina responsable. Sin ella no habrá seguimiento por oficina (fase 2).">
          <div className="ps-tabla-simple" role="table" aria-label="Líneas por oficina responsable">
            <div role="row" className="ps-tabla-simple__cab"><span role="columnheader">Oficina responsable</span><span role="columnheader" className="ps-der">Líneas</span><span role="columnheader" className="ps-der">Inversión</span></div>
            {oficinas.map((o) => (
              <div role="row" key={o.clave}><span role="cell">{o.clave === SIN_OFICINA ? <em>Sin oficina asignada</em> : o.clave}</span><span role="cell" className="ps-der">{o.n}</span><span role="cell" className="ps-der">{millones(o.monto)}</span></div>
            ))}
          </div>
          {r.conOficina === 0 ? <Nota>La matriz no trae responsables. Se asignan con la columna «Oficina responsable» de la plantilla{nivel === "admin" ? <> (<Link to={ruta("cargar")} state={DESDE_MODULO}>Cargar la planificación</Link>)</> : ""}.</Nota> : null}
        </Panel>
        <Panel titulo="Inversión por año" ancho={8} sub="Monto de la línea × su porcentaje programado cada año.">
          <InversionPorAnio datos={aniosPlan} />
          <Nota>Millones de pesos (M). Solo líneas evaluadas: las {r.sinEvaluar} sin evaluar aún no tienen distribución anual.</Nota>
        </Panel>
        <Panel titulo="Por prioridad" ancho={4}><AnilloPrioridad filas={r.porPrioridad} total={r.n} /></Panel>
        <Panel titulo="Por pilar" ancho={4}><ListaBarras filas={r.porPilar} color={(f) => `var(--pillar-${clavePilar(f.clave.slice(0, 2)) || 1})`} /></Panel>
        <Panel titulo="Por campus" ancho={4}><ListaBarras filas={r.porCampus.map((c) => ({ ...c, etiqueta: rotuloCampus(c.clave) }))} /></Panel>
        <Panel titulo="Por fuente de financiación" ancho={4}><ListaBarras filas={r.porFuente} /></Panel>
        <Panel titulo={`Cronograma ${plan.anioIni}-${plan.anioFin}`} ancho={12} sub={<>Las 14 líneas de mayor inversión con fechas. El plan completo está en <Link to={ruta("cronograma")} state={DESDE_MODULO}>Cronograma</Link>.</>}>
          <Gantt lineas={filtradas} anioIni={plan.anioIni} anioFin={plan.anioFin} limite={14} />
        </Panel>
        <Panel titulo="Mayor inversión" ancho={12}>
          <div className="ps-tabla ps-tabla--corta" role="table" aria-label="Líneas de mayor inversión">
            <div className="ps-tabla__fila ps-tabla__cab" role="row"><span role="columnheader">Línea</span><span role="columnheader">Campus</span><span role="columnheader">Prioridad</span><span role="columnheader" className="ps-der">Monto</span><span role="columnheader">Evaluación</span></div>
            {top.map((l) => (
              <div className="ps-tabla__fila" role="row" key={l.no}>
                <span role="cell" className="ps-tabla__t"><Link to={ruta("proyectos", l.no)} state={DESDE_MODULO}>{l.nombre.replace(/\.$/, "")}</Link><em>#{l.no} · {l.clasif}</em></span>
                <span role="cell" data-l="Campus">{rotuloCampus(l.campus)}</span>
                <span role="cell" data-l="Prioridad"><Prioridad valor={l.prioridad} /></span>
                <span role="cell" className="ps-der" data-l="Monto">{l.monto === null ? "Sin monto" : millones1(l.monto)}</span>
                <span role="cell" data-l="Evaluación"><EstadoEvaluacion evaluada={Boolean(l.resultado)} /></span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
