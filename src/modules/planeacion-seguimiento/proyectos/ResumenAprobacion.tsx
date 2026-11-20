/* =============================================================================
   Planeación y Seguimiento · proyectos · «SOLICITADO VS APROBADO» (`ps_resumen_aprobacion`).
   Tarjetas (solicitado, aprobado, rechazado, sin evaluar: monto y cantidad), barras comparativas por pilar, campus, oficina y
   año, y la tabla de proyectos con ambos montos y la diferencia. Se usa en Resumen (compacto) y en Financiación (completo).
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { Nota, Panel } from "../partes";
import { entero, llano, millones, millones1, porcentaje } from "../modelo";
import { useResumenAprobacion } from "./hooksProy";
import { ROTULO_ESTADO_PROYECTO, type EstadoProyecto } from "./modeloProy";
import { BarrasComparativas, ChipEstadoProyecto, LeyendaComparativa } from "./partesProy";

export function ResumenAprobacionVista({ compacto = false }: { compacto?: boolean }) {
  const { planId, ruta, plan } = usePs();
  const q = useResumenAprobacion(planId);
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState<EstadoProyecto | "">("");
  const filas = useMemo(() => {
    const t = llano(buscar);
    return (q.data?.proyectos ?? []).filter((p) => (!estado || p.estado === estado) && (!t || llano(`${p.no} ${p.nombre} ${p.oficina ?? ""}`).includes(t)));
  }, [q.data, buscar, estado]);
  if (q.isPending) return <LoadingBlock rows={3} label="Calculando solicitado y aprobado" />;
  if (q.error || !q.data) return <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(q.error as Error | null)?.message ?? "No se pudo leer el resumen de aprobación."}</p>;
  const r = q.data;
  const pctAprob = r.solicitado.monto ? r.aprobado.monto / r.solicitado.monto : 0;
  const tarjetas: { id: string; titulo: string; monto: number; n: number; nota: string; tono?: string }[] = [
    { id: "sol", titulo: "Solicitado", monto: r.solicitado.monto, n: r.solicitado.n, nota: "lo que pidieron las oficinas" },
    { id: "apr", titulo: "Aprobado", monto: r.aprobado.monto, n: r.aprobado.n, nota: `${porcentaje(pctAprob)} de lo solicitado`, tono: "ok" },
    { id: "rec", titulo: "Rechazado", monto: r.rechazado.monto, n: r.rechazado.n, nota: "monto que se había solicitado", tono: "mal" },
    { id: "sin", titulo: "Sin evaluar", monto: r.sinEvaluar.monto, n: r.sinEvaluar.n, nota: "esperan a la VAF", tono: "pend" },
  ];
  return (
    <section className="ps-seccion" aria-labelledby="apr-h">
      <div className="ps-seccion__cab">
        <h2 id="apr-h">Solicitado vs aprobado{plan ? ` · ${plan.nombre}` : ""}</h2>
        <p className="ps-sub">Lo que pidieron las oficinas frente a lo que aprobó la VAF, proyecto por proyecto. Un proyecto sin evaluar todavía no suma a lo aprobado.</p>
      </div>
      <dl className="ps-kpis" aria-label="Solicitado, aprobado, rechazado y sin evaluar">
        {tarjetas.map((t) => (
          <div key={t.id} data-tono={t.tono}><dt>{t.titulo}</dt><dd>{millones(t.monto)}</dd><dd className="ps-kpis__s"><strong>{entero(t.n)}</strong> {t.n === 1 ? "proyecto" : "proyectos"} · {t.nota}</dd></div>
        ))}
      </dl>
      <LeyendaComparativa />
      <div className="ps-rejilla">
        <Panel titulo="Por pilar" ancho={6}><BarrasComparativas titulo="Solicitado y aprobado por pilar" filas={r.porPilar} /></Panel>
        <Panel titulo="Por campus" ancho={6}><BarrasComparativas titulo="Solicitado y aprobado por campus" filas={r.porCampus} /></Panel>
        <Panel titulo="Por oficina" ancho={6}><BarrasComparativas titulo="Solicitado y aprobado por oficina" filas={r.porOficina} /></Panel>
        <Panel titulo="Por año" ancho={6} sub="Solo proyectos aprobados: son los que traen distribución anual."><BarrasComparativas titulo="Solicitado y aprobado por año" filas={r.porAnio} /></Panel>
      </div>
      {compacto ? (
        <Nota>La tabla de proyectos con la diferencia de cada uno está en <Link to={`${ruta("financiacion")}?pestana=aprobacion`} state={DESDE_MODULO}>Financiación y presupuesto › Solicitado vs aprobado</Link>.</Nota>
      ) : (
        <section className="ps-bloque" aria-labelledby="apr-tabla-h">
          <h3 id="apr-tabla-h">Proyectos ({entero(filas.length)})</h3>
          <div className="ps-herramientas">
            <label className="ps-buscar"><Icon name="search" size={15} /><span className="sr-only">Buscar un proyecto</span><input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, N.º u oficina" /></label>
            <label className="ps-orden"><span>Estado</span>
              <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoProyecto | "")}><option value="">Todos</option>{(Object.keys(ROTULO_ESTADO_PROYECTO) as EstadoProyecto[]).map((k) => <option key={k} value={k}>{ROTULO_ESTADO_PROYECTO[k]}</option>)}</select>
            </label>
          </div>
          <div className="ps-matriz-caja">
            <table className="ps-tabla-ppto ps-tabla-apr">
              <caption className="sr-only">Proyectos con el monto solicitado, el aprobado y la diferencia</caption>
              <thead><tr><th scope="col">Proyecto</th><th scope="col">Estado</th><th scope="col" className="ps-der">Solicitado</th><th scope="col" className="ps-der">Aprobado</th><th scope="col" className="ps-der">Diferencia</th></tr></thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.no}>
                    <th scope="row"><Link to={ruta("proyectos", p.no)} state={DESDE_MODULO}>#{p.no}</Link> <span>{p.nombre.replace(/\.$/, "").slice(0, 80)}</span></th>
                    <td><ChipEstadoProyecto estado={p.estado} /></td>
                    <td className="ps-der">{millones1(p.solicitado)}</td>
                    <td className="ps-der">{p.aprobado === null ? "—" : millones1(p.aprobado)}</td>
                    <td className="ps-der" data-signo={p.diferencia === null ? undefined : p.diferencia < 0 ? "menos" : p.diferencia > 0 ? "mas" : "cero"}>{p.diferencia === null ? <span className="sr-only">Sin evaluar</span> : `${p.diferencia > 0 ? "+" : p.diferencia < 0 ? "−" : ""}${millones1(Math.abs(p.diferencia))}`}{p.diferencia === null ? "—" : null}</td>
                  </tr>
                ))}
                {filas.length === 0 ? <tr><td colSpan={5}>Ningún proyecto coincide.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
