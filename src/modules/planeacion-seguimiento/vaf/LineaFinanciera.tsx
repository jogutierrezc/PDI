/* =============================================================================
   Planeación y Seguimiento · VAF · UNA LÍNEA: presupuesto y ejecución junto al avance físico validado, financiación por
   año (la VAF la evalúa año por año, en esta misma página) y el libro de movimientos con registrar y anular.
   Ruta `vaf-linea/<ps_lineas.id>[?anio=]`. Las oficinas llegan aquí desde el detalle de su línea (lectura).
   ========================================================================== */

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { Campo } from "../marco/FormularioPasos";
import { DESDE_MODULO, PaginaCompleta } from "../marco/PaginaCompleta";
import { aniosDe, fecha } from "../modelo";
import { useUmbrales, usePresupuestoLinea, useVafOps } from "./hooksVaf";
import { ROTULO_FINANCIACION, ROTULO_MOV, esFinanciero, estadoFinancieroLinea, validarAnulacion, validarFinanciacion, type DatosFinanciacion, type EstadoFinanciacion, type MovPresupuesto } from "./modeloVaf";
import { CifrasPpto, ChipFinanciacionLinea, EjecucionVsAvance, Pesos } from "./partesVaf";

export function LineaFinanciera({ id }: { id: string }) {
  const { ruta, plan, lineas, nivel } = usePs();
  const q = usePresupuestoLinea(id);
  const umb = useUmbrales(plan?.id ?? null);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Financiación y presupuesto", a: `${ruta("financiacion")}?pestana=presupuesto` }, { texto: "Línea" }];
  const regresar = `${ruta("financiacion")}?pestana=presupuesto`;
  if (q.isPending) return <PaginaCompleta titulo="Presupuesto de la línea" migas={migas} regresarA={regresar}><LoadingBlock rows={4} label="Cargando el presupuesto de la línea" /></PaginaCompleta>;
  if (q.error || !q.data) return <PaginaCompleta titulo="Presupuesto de la línea" migas={migas} regresarA={regresar}><p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(q.error as Error | null)?.message ?? "Esa línea no existe o no puede verla."}</p></PaginaCompleta>;
  const l = q.data;
  const nombre = l.nombre ?? lineas.find((x) => x.no === l.clave)?.nombre ?? "Línea del plan";
  const vigencia = { ini: plan?.anioIni ?? Math.min(...(l.porAnio.map((a) => a.anio).concat(2027))), fin: plan?.anioFin ?? Math.max(...(l.porAnio.map((a) => a.anio).concat(2027))) };
  return (
    <PaginaCompleta
      titulo={`Línea #${l.clave}`}
      subtitulo={<>{nombre.replace(/\.$/, "")}</>}
      migas={migas}
      regresarA={regresar}
      claveFoco={id}
      acciones={esFinanciero(nivel) ? <Link className="button-primary" to={ruta("vaf-mov", encodeURIComponent(id))} state={DESDE_MODULO}><Icon name="plus" size={15} /> Registrar un movimiento</Link> : undefined}
    >
      <div className="ps-bloques">
        <div className="ps-fila-act ps-fila-act--ficha"><ChipFinanciacionLinea estado={estadoFinancieroLinea(l.financiacion)} />{l.ultimoMovimiento ? <span className="ps-nota">Último movimiento: {fecha(l.ultimoMovimiento)}</span> : <span className="ps-nota">Sin movimientos todavía</span>}</div>
        <CifrasPpto c={l} solicitado={l.solicitado} />
        <EjecucionVsAvance pct={l.pctEjecucion} fisico={l.avanceFisico} desviacion={l.desviacion} umbral={umb.data?.umbralDesviacion} />
        <section aria-labelledby="ln-anio"><h2 id="ln-anio">Por año</h2>
          <div className="ps-matriz-caja"><table className="ps-tabla-ppto"><caption className="sr-only">Presupuesto de la línea por año</caption><thead><tr><th scope="col">Año</th><th scope="col">Aprobado</th><th scope="col">Modificado</th><th scope="col">Vigente</th><th scope="col">Comprometido</th><th scope="col">Ejecutado</th><th scope="col">Pagado</th></tr></thead>
            <tbody>{l.porAnio.map((a) => <tr key={a.anio}><th scope="row">{a.anio}</th><td><Pesos n={a.aprobado} /></td><td><Pesos n={a.modificado} /></td><td><Pesos n={a.vigente} /></td><td><Pesos n={a.comprometido} /></td><td><Pesos n={a.ejecutado} /></td><td><Pesos n={a.pagado} /></td></tr>)}{l.porAnio.length === 0 ? <tr><td colSpan={7}>Aún no hay presupuesto registrado.</td></tr> : null}</tbody></table></div>
        </section>
        <Financiacion lineaId={id} vigencia={vigencia} />
        <Libro lineaId={id} movs={l.movimientos} puede={esFinanciero(nivel)} />
      </div>
    </PaginaCompleta>
  );
}

/* ---------- Financiación por año ---------- */

function Financiacion({ lineaId, vigencia }: { lineaId: string; vigencia: { ini: number; fin: number } }) {
  const { nivel } = usePs();
  const q = usePresupuestoLinea(lineaId);
  const ops = useVafOps();
  const [params, setParams] = useSearchParams();
  const anioEditar = Number(params.get("anio")) || null;
  const f = q.data?.financiacion ?? [];
  const operador = esFinanciero(nivel);
  const abrir = (a: number | null) => { const s = new URLSearchParams(params); if (a) s.set("anio", String(a)); else s.delete("anio"); setParams(s, { replace: true }); };
  const anios = aniosDe(vigencia.ini, Math.min(vigencia.fin, vigencia.ini + 30));
  return (
    <section aria-labelledby="ln-fin" className="ps-bloque">
      <h2 id="ln-fin">Financiación aprobada por la VAF</h2>
      <p className="ps-sub">Lo que la VAF aprueba para esta línea en cada año. Si el libro no tiene un «aprobado» del año, esto es lo que cuenta como aprobado.</p>
      <div className="ps-matriz-caja"><table className="ps-tabla-ppto"><caption className="sr-only">Financiación por año</caption>
        <thead><tr><th scope="col">Año</th><th scope="col">Estado</th><th scope="col">Monto aprobado</th><th scope="col">Fuente</th><th scope="col">Nota</th>{operador ? <th scope="col"><span className="sr-only">Acción</span></th> : null}</tr></thead>
        <tbody>
          {anios.map((a) => {
            const x = f.find((y) => y.anio === a);
            const estado: EstadoFinanciacion = x?.estado ?? "sin_evaluar";
            return (
              <tr key={a}>
                <th scope="row">{a}</th>
                <td><span className="ps-est ps-est--fin" data-tono={estado === "aprobada" ? "ok" : estado === "rechazada" ? "riesgo" : estado === "ajustada" ? "pend" : "neutro"}><Icon name={estado === "aprobada" ? "check" : estado === "rechazada" ? "alert" : estado === "ajustada" ? "clock" : "info"} size={12} />{ROTULO_FINANCIACION[estado]}</span></td>
                <td>{x && x.estado !== "sin_evaluar" ? <Pesos n={x.montoAprobado} /> : "—"}</td><td>{x?.fuente || "—"}</td><td>{x?.nota || "—"}</td>
                {operador ? <td><button type="button" className="button-secondary ps-btn-peq" onClick={() => abrir(a)} aria-label={`${x ? "Cambiar" : "Evaluar"} la financiación de ${a}`}>{x && x.estado !== "sin_evaluar" ? "Cambiar" : "Evaluar"}</button></td> : null}
              </tr>
            );
          })}
        </tbody></table></div>
      {operador && anioEditar ? <FormFinanciacion key={anioEditar} lineaId={lineaId} anio={anioEditar} previo={f.find((x) => x.anio === anioEditar)} vigencia={vigencia} onCerrar={() => abrir(null)} ops={ops} /> : null}
    </section>
  );
}

function FormFinanciacion({ lineaId, anio, previo, vigencia, onCerrar, ops }: { lineaId: string; anio: number; previo: { montoAprobado: number; fuente: string; estado: EstadoFinanciacion; nota: string } | undefined; vigencia: { ini: number; fin: number }; onCerrar: () => void; ops: ReturnType<typeof useVafOps> }) {
  const [v, setV] = useState({ monto: String(previo?.montoAprobado ?? ""), fuente: previo?.fuente ?? "", estado: (previo && previo.estado !== "sin_evaluar" ? previo.estado : "aprobada") as EstadoFinanciacion, nota: previo?.nota ?? "" });
  const [intento, setIntento] = useState(false);
  const monto = v.monto.trim() === "" ? null : Number(v.monto.replace(/[.\s]/g, "").replace(",", "."));
  const datos: DatosFinanciacion = { anio, monto, fuente: v.fuente, estado: v.estado, nota: v.nota };
  const errs = new Map(validarFinanciacion(datos, vigencia).map((e) => [e.campo, e.mensaje]));
  const mostrar = (c: string) => (intento ? (errs.get(c) ?? null) : null);
  const enviar = () => { setIntento(true); const p = [...errs.keys()][0]; if (p) return void document.getElementById(p)?.focus(); ops.lineaEvaluar.mutate({ lineaId, datos }, { onSuccess: onCerrar }); };
  return (
    <form className="ps-form-en-linea" onSubmit={(e) => { e.preventDefault(); enviar(); }} aria-label={`Financiación de ${anio}`}>
      <h3>Financiación de {anio}</h3>
      {ops.lineaEvaluar.error ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {(ops.lineaEvaluar.error as Error).message}</p> : null}
      <fieldset className="ps-radios" id="fn-estado"><legend>Resultado</legend>
        {(["aprobada", "ajustada", "rechazada", "sin_evaluar"] as const).map((e) => <label key={e} className="ps-opcion"><input type="radio" name="fn-estado" checked={v.estado === e} onChange={() => setV((x) => ({ ...x, estado: e }))} /><span>{ROTULO_FINANCIACION[e]}</span></label>)}
      </fieldset>
      <Campo id="fn-monto" etiqueta="Monto aprobado (pesos)" ayuda={`Solo el número. Equivale a ${monto !== null && Number.isFinite(monto) ? `$ ${new Intl.NumberFormat("es-CO").format(monto)}` : "—"}. Cero si se rechaza.`} error={mostrar("fn-monto")} obligatorio>
        {(p) => <input {...p} type="text" inputMode="numeric" value={v.monto} onChange={(e) => setV((x) => ({ ...x, monto: e.target.value }))} autoComplete="off" />}
      </Campo>
      <Campo id="fn-fuente" etiqueta="Fuente" error={mostrar("fn-fuente")}>{(p) => <input {...p} type="text" maxLength={200} value={v.fuente} onChange={(e) => setV((x) => ({ ...x, fuente: e.target.value }))} autoComplete="off" />}</Campo>
      <Campo id="fn-nota" etiqueta="Nota" ayuda={v.estado === "ajustada" || v.estado === "rechazada" ? `Obligatoria: al menos 10 caracteres (lleva ${v.nota.trim().length}).` : "Opcional."} error={mostrar("fn-nota")} obligatorio={v.estado === "ajustada" || v.estado === "rechazada"}>{(p) => <textarea {...p} rows={3} value={v.nota} onChange={(e) => setV((x) => ({ ...x, nota: e.target.value }))} />}</Campo>
      <div className="ps-botones"><button type="submit" className="button-primary" disabled={ops.lineaEvaluar.isPending} aria-busy={ops.lineaEvaluar.isPending || undefined}>Guardar la financiación de {anio}</button><button type="button" className="button-secondary" onClick={onCerrar}>Cancelar</button></div>
    </form>
  );
}

/* ---------- Libro de movimientos ---------- */

function Libro({ lineaId, movs, puede }: { lineaId: string; movs: MovPresupuesto[]; puede: boolean }) {
  const ops = useVafOps();
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [intento, setIntento] = useState(false);
  void lineaId;
  const error = intento ? validarAnulacion(motivo) : null;
  return (
    <section aria-labelledby="ln-libro"><h2 id="ln-libro">Libro de movimientos</h2>
      <p className="ps-sub">Solo se agrega: un movimiento no se edita ni se borra; se anula con otro que lo referencia y queda en el libro.</p>
      {ops.anular.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(ops.anular.error as Error).message}</p> : null}
      {movs.length === 0 ? <p className="ps-nota">Aún no hay movimientos en esta línea.</p> : (
        <ul className="ps-libro">
          {movs.map((m) => (
            <li key={m.id} data-anulado={m.anulado || undefined} data-anula={m.anulaId ? "1" : undefined}>
              <span className="ps-libro__f">{fecha(m.fecha)}</span>
              <span className="ps-libro__t"><strong>{m.anulaId ? `Anulación de ${ROTULO_MOV[m.tipo].toLowerCase()}` : ROTULO_MOV[m.tipo]}</strong> · {m.anio}{m.referencia ? ` · ${m.referencia}` : ""}{m.fuente ? ` · ${m.fuente}` : ""}{m.nota ? <em>{m.nota}</em> : null}</span>
              <span className="ps-libro__m" data-neg={m.monto < 0 || m.anulaId ? "1" : undefined}><Pesos n={m.anulaId ? -m.monto : m.monto} fuerte /></span>
              <span className="ps-libro__e">{m.anulado ? <span className="ps-est" data-tono="neutro"><Icon name="close" size={12} />Anulado</span> : m.anulaId ? <span className="ps-est" data-tono="pend">Anula otro</span> : null}</span>
              {puede && !m.anulado && !m.anulaId ? <button type="button" className="button-secondary ps-btn-peq" aria-expanded={anulando === m.id} onClick={() => { setAnulando(anulando === m.id ? null : m.id); setMotivo(""); setIntento(false); }}>Anular<span className="sr-only"> el movimiento del {fecha(m.fecha)}</span></button> : <span />}
              {anulando === m.id ? (
                <div className="ps-libro__anular ps-aviso ps-aviso--info" role="group" aria-label="Anular el movimiento"><Icon name="info" size={16} />
                  <div>
                    <label htmlFor={`an-${m.id}`}><strong>¿Por qué lo anula?</strong> (al menos 10 caracteres; queda en el libro)</label>
                    <textarea id={`an-${m.id}`} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `an-${m.id}-e` : undefined} />
                    {error ? <p className="ps-campo__error" id={`an-${m.id}-e`}><Icon name="alert" size={14} /> {error}</p> : null}
                    <div className="ps-botones"><button type="button" className="button-primary ps-btn-peq" disabled={ops.anular.isPending} onClick={() => { setIntento(true); if (validarAnulacion(motivo)) return; ops.anular.mutate({ id: m.id, motivo }, { onSuccess: () => setAnulando(null) }); }}>Anular el movimiento</button><button type="button" className="button-secondary ps-btn-peq" onClick={() => setAnulando(null)}>Cancelar</button></div>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
