/* =============================================================================
   Planeación y Seguimiento · proyectos · «EVALUAR PROYECTO», a pantalla completa (`proyecto-evaluar/<N.º>`).
   Solo el rol financiero (VAF) y el administrador ven **Aprobar** y **Rechazar**; gestor, colaborador y lector ven el resultado en
   solo lectura con un aviso claro. Aprobar pide criterios y viabilidades, prioridad, fechas, distribución anual que sume 100 %,
   monto aprobado (nota de al menos 20 caracteres si difiere del solicitado); rechazar pide una nota de al menos 20 caracteres.
   Teclado y lector de pantalla: total en vivo con aria-live, resumen de errores y foco al primer campo con error.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { listaDeConfig } from "../modeloPlanes";
import { useConfigPlan } from "../api";
import { sinEvaluar } from "../calculos";
import { usePs } from "../contexto";
import { Campo, EstadoGuardado, useBorradorLocal } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { CRITERIOS, VIABILIDADES, aniosDe, fecha, pesos, pilarCodigo, pilarNombre, rotuloCampus, type ClaveCriterio, type ClaveViabilidad, type Linea } from "../modelo";
import { Nota } from "../partes";
import { useEvaluacionesProyecto, useProyectosOps } from "./hooksProy";
import {
  MIN_NOTA_PROYECTO, VIABILIDADES_EVALUADAS, distribuirParejo, estadoProyecto, datosInicialesEvaluacion, numeroDeTexto, puedeEvaluarProyecto, sumaEs100, sumaPorcentajes, textoTotalPct, validarEvaluacionProyecto,
  type ClaveViabilidadEvaluada, type DatosEvaluacionProyecto, type DecisionProyecto, type ErrorProy, type EvaluacionProyecto,
} from "./modeloProy";
import { ChipEstadoProyecto, PreguntaSiNo } from "./partesProy";

interface V {
  criterios: Record<ClaveCriterio, boolean | null>;
  viabilidad: Record<ClaveViabilidadEvaluada, boolean | null>;
  prioridad: string;
  inicio: string;
  fin: string;
  pct: Record<string, string>;
  monto: string;
  nota: string;
}
const aTexto = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n).replace(".", ","));

function valoresDe(l: Linea, anios: number[]): V {
  const d = datosInicialesEvaluacion(l, anios);
  return { criterios: d.criterios, viabilidad: d.viabilidad, prioridad: d.prioridad, inicio: d.inicio, fin: d.fin, pct: Object.fromEntries(Object.entries(d.pct).map(([a, x]) => [a, aTexto(x)])), monto: d.montoAprobado === null ? "" : String(Math.round(d.montoAprobado)), nota: "" };
}
function datosDe(v: V, decision: DecisionProyecto): DatosEvaluacionProyecto {
  return { decision, criterios: v.criterios, viabilidad: v.viabilidad, prioridad: v.prioridad, inicio: v.inicio, fin: v.fin, pct: Object.fromEntries(Object.entries(v.pct).map(([a, t]) => [a, numeroDeTexto(t)])), montoAprobado: numeroDeTexto(v.monto), nota: v.nota };
}

export function EvaluarProyecto({ id }: { id: string }) {
  const { lineas, plan, ruta, nivel } = usePs();
  const l = lineas.find((x) => x.no === id);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Proyectos", a: ruta("proyectos") }, { texto: l ? `#${l.no}` : "Evaluar" , a: l ? ruta("proyectos", l.no) : undefined }, { texto: "Evaluar proyecto" }];
  if (!l || !plan) {
    return <PaginaCompleta titulo="No encuentro ese proyecto" migas={migas} regresarA={ruta("proyectos")} regresarTexto="Regresar a proyectos"><p className="ps-aviso"><Icon name="alert" size={16} /> El proyecto «{id}» no está en la versión que se muestra.</p></PaginaCompleta>;
  }
  return puedeEvaluarProyecto(nivel) ? <Formulario l={l} migas={migas} /> : <SoloLectura l={l} migas={migas} />;
}

/* ---------- Contexto del proyecto e historial ---------- */

function Ficha({ l }: { l: Linea }) {
  return (
    <dl className="ps-ficha">
      <div><dt>Monto solicitado</dt><dd><strong>{pesos(l.monto)}</strong></dd></div>
      <div><dt>Oficina responsable</dt><dd>{l.oficina ?? <em>Sin oficina asignada</em>}</dd></div>
      <div><dt>Campus</dt><dd>{rotuloCampus(l.campus)}</dd></div>
      <div><dt>Pilar</dt><dd>{l.pilar ? `${pilarCodigo(l.pilar)} · ${pilarNombre(l.pilar)}` : <em>Sin pilar</em>}</dd></div>
    </dl>
  );
}

function Historial({ no }: { no: string }) {
  const { planId } = usePs();
  const q = useEvaluacionesProyecto(planId, no);
  return (
    <section className="ps-bloque" aria-labelledby="pe-hist-h">
      <h2 id="pe-hist-h">Historial de evaluaciones</h2>
      {q.isPending ? <p className="ps-nota">Cargando…</p> : q.error ? <p className="ps-campo__error" role="alert">{(q.error as Error).message}</p> : (q.data ?? []).length === 0 ? <p className="ps-nota">Este proyecto aún no tiene evaluaciones registradas.</p> : (
        <ul className="ps-avances">
          {(q.data as EvaluacionProyecto[]).map((e) => (
            <li key={e.id} className="ps-avance">
              <header><span className="ps-avance__n"><b>{e.decision === "aprobado" ? "Aprobado" : "Rechazado"}</b>{e.version ? ` · versión ${e.version}` : ""}{e.decision === "aprobado" && e.montoAprobado !== null ? <> · {pesos(e.montoAprobado)} de {pesos(e.montoSolicitado)} solicitados</> : null}</span><ChipEstadoProyecto estado={e.decision} /></header>
              {e.nota ? <blockquote>{e.nota}</blockquote> : null}
              <p className="ps-avance__meta">Evaluó {e.evaluadoPor?.nombre ?? "la VAF"} el {fecha(e.evaluadoEn)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Solo lectura (gestor, colaborador, lector, aprobador) ---------- */

const SiNoTxt = ({ v }: { v: boolean | null }) => (v === null ? <span className="ps-sino" data-v="vacio"><b aria-hidden="true">○</b> Sin evaluar</span> : v ? <span className="ps-sino" data-v="si"><b aria-hidden="true">●</b> Sí</span> : <span className="ps-sino" data-v="no"><b aria-hidden="true">—</b> No</span>);

function SoloLectura({ l, migas }: { l: Linea; migas: { texto: string; a?: string }[] }) {
  const { plan, ruta } = usePs();
  const estado = estadoProyecto(l);
  const anios = plan ? aniosDe(plan.anioIni, plan.anioFin) : [];
  return (
    <PaginaCompleta titulo="Evaluar proyecto" subtitulo={<>#{l.no} · {l.nombre.replace(/\.$/, "")}</>} migas={migas} regresarA={ruta("proyectos", l.no)} regresarTexto="Regresar al proyecto" acciones={<ChipEstadoProyecto estado={estado} />}>
      <p className="ps-aviso ps-aviso--info" role="note"><Icon name="lock" size={16} /> <span><strong>Usted no puede editar esta evaluación.</strong> La aprueba o rechaza el rol financiero (VAF) o el administrador de planeación. Aquí ve el resultado en solo lectura.</span></p>
      <Ficha l={l} />
      {estado === "sin_evaluar" ? <p className="ps-nota">Este proyecto todavía está sin evaluar: no hay resultado que mostrar.</p> : (
        <>
          <dl className="ps-ficha">
            <div><dt>Resultado</dt><dd><ChipEstadoProyecto estado={estado} /></dd></div>
            <div><dt>Monto aprobado</dt><dd>{estado === "aprobado" ? pesos(l.montoAprobado ?? l.monto) : "No se aprobó monto"}</dd></div>
            {estado === "aprobado" ? <div><dt>Inicio y fin</dt><dd>{l.inicio && l.fin ? `${fecha(l.inicio)} a ${fecha(l.fin)}` : <em>Sin fechas</em>}</dd></div> : null}
            {estado === "aprobado" ? <div><dt>Prioridad</dt><dd>{l.prioridad}</dd></div> : null}
          </dl>
          {l.notaEvaluacion ? <section className="ps-bloque"><h2>Nota de la evaluación</h2><blockquote className="ps-cita">{l.notaEvaluacion}</blockquote></section> : null}
          {estado === "aprobado" ? (
            <>
              <div className="ps-dos">
                <section className="ps-bloque"><h2>Criterios de priorización</h2><ul className="ps-sinos">{Object.entries(CRITERIOS).map(([k, t]) => <li key={k}>{t}<SiNoTxt v={l.criterios[k as ClaveCriterio]} /></li>)}</ul></section>
                <section className="ps-bloque"><h2>Viabilidad</h2><ul className="ps-sinos">{Object.entries(VIABILIDADES).map(([k, t]) => <li key={k}>{t}<SiNoTxt v={l.viabilidad[k as ClaveViabilidad]} /></li>)}</ul></section>
              </div>
              <Nota>Distribución anual: {anios.filter((a) => (l.pct[String(a)] ?? 0) > 0).map((a) => `${a} ${((l.pct[String(a)] ?? 0) * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`).join(" · ") || "sin distribución"}.</Nota>
            </>
          ) : null}
        </>
      )}
      <Historial no={l.no} />
    </PaginaCompleta>
  );
}

/* ---------- Formulario (financiero y administrador) ---------- */

function Formulario({ l, migas }: { l: Linea; migas: { texto: string; a?: string }[] }) {
  const { plan, planId, ruta, ir, lineas } = usePs();
  const ops = useProyectosOps();
  const cfgQ = useConfigPlan(planId);
  const anios = useMemo(() => aniosDe(plan!.anioIni, plan!.anioFin), [plan]);
  const prioridades = useMemo(() => listaDeConfig(cfgQ.data, "prioridad"), [cfgQ.data]);
  const [v, setV] = useState<V>(() => valoresDe(l, anios));
  const [errores, setErrores] = useState<ErrorProy[]>([]);
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [hecho, setHecho] = useState<DecisionProyecto | null>(null);
  const [intento, setIntento] = useState<DecisionProyecto | null>(null);
  const resumen = useRef<HTMLDivElement>(null);
  const { guardado, descartar } = useBorradorLocal<V>(`proyecto-eval-${planId}-${l.no}`, v, (b) => setV((x) => ({ ...x, ...b })));
  const ctx = { montoSolicitado: l.monto, anioIni: plan!.anioIni, anioFin: plan!.anioFin, prioridades };
  const montoNum = numeroDeTexto(v.monto);
  const suma = sumaPorcentajes(Object.fromEntries(Object.entries(v.pct).map(([a, t]) => [a, numeroDeTexto(t)])));
  const porCampo = new Map(validarEvaluacionProyecto(datosDe(v, intento ?? "aprobado"), ctx).map((e) => [e.campo, e.mensaje]));
  const mostrar = (c: string) => (tocados[c] ? (porCampo.get(c) ?? null) : null);
  const salir = (c: string) => () => setTocados((t) => ({ ...t, [c]: true }));
  const poner = <K extends keyof V>(k: K, x: V[K]) => setV((s) => ({ ...s, [k]: x }));
  const diferente = montoNum !== null && l.monto !== null && Math.round(montoNum) !== Math.round(l.monto);

  useEffect(() => {
    if (errores.length) (document.getElementById(errores[0].campo) as HTMLElement | null)?.focus();
  }, [errores]);

  const decidir = async (decision: DecisionProyecto) => {
    setIntento(decision);
    const errs = validarEvaluacionProyecto(datosDe(v, decision), ctx);
    setTocados(Object.fromEntries(errs.map((e) => [e.campo, true])));
    setErrores(errs);
    if (errs.length) return;
    try {
      await ops.evaluar.mutateAsync({ planId: planId!, no: l.no, datos: datosDe(v, decision) });
      descartar();
      setHecho(decision);
    } catch {
      /* el error se muestra arriba */
    }
  };

  const siguiente = lineas.find((x) => x.no !== l.no && sinEvaluar(x));
  if (hecho) {
    return (
      <PaginaCompleta titulo={hecho === "aprobado" ? "Proyecto aprobado" : "Proyecto rechazado"} subtitulo={<>#{l.no} · {l.nombre.replace(/\.$/, "")}</>} migas={migas} regresarA={ruta("proyectos")} regresarTexto="Regresar a proyectos" claveFoco="hecho">
        <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> {hecho === "aprobado" ? `Quedó aprobado por ${pesos(montoNum)}.` : "Quedó rechazado y la razón consta en el historial."} Se avisó a la oficina responsable.</p>
        <div className="ps-botones">
          <button type="button" className="button-primary" onClick={() => ir(ruta("proyectos", l.no))}>Ver el proyecto</button>
          {siguiente ? <button type="button" className="button-secondary" onClick={() => ir(ruta("proyecto-evaluar", siguiente.no), { reemplazar: true })}>Evaluar el siguiente sin evaluar (#{siguiente.no})</button> : null}
          <button type="button" className="button-secondary" onClick={() => ir(ruta("proyectos"))}>Volver a proyectos</button>
        </div>
      </PaginaCompleta>
    );
  }
  const yaEvaluado = estadoProyecto(l) !== "sin_evaluar";
  return (
    <PaginaCompleta
      titulo="Evaluar proyecto"
      subtitulo={<>#{l.no} · {l.nombre.replace(/\.$/, "")}</>}
      migas={migas}
      regresarA={ruta("proyectos", l.no)}
      regresarTexto="Regresar al proyecto"
      acciones={<ChipEstadoProyecto estado={estadoProyecto(l)} />}
      claveFoco={l.no}
      pie={
        <>
          <div className="ps-pie__izq"><EstadoGuardado guardado={guardado} /></div>
          <div className="ps-pie__der">
            <button type="button" className="button-secondary ps-btn-rechazar" onClick={() => void decidir("rechazado")} disabled={ops.evaluar.isPending}>Rechazar</button>
            <button type="button" className="button-primary" onClick={() => void decidir("aprobado")} disabled={ops.evaluar.isPending} aria-busy={ops.evaluar.isPending || undefined}>{ops.evaluar.isPending ? "Un momento…" : "Aprobar"}</button>
          </div>
        </>
      }
    >
      {yaEvaluado ? <p className="ps-aviso ps-aviso--info"><Icon name="info" size={16} /> Este proyecto ya está {estadoProyecto(l) === "aprobado" ? "aprobado" : "rechazado"}. Si lo evalúa de nuevo, la decisión anterior queda en el historial.</p> : null}
      {ops.evaluar.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(ops.evaluar.error as Error).message}</p> : null}
      {errores.length ? (
        <div className="ps-resumen-errores" ref={resumen} role="alert" aria-labelledby="pe-err-t">
          <strong id="pe-err-t">{errores.length === 1 ? "Hay 1 cosa por corregir" : `Hay ${errores.length} cosas por corregir`} para {intento === "rechazado" ? "rechazar" : "aprobar"}</strong>
          <ul>{errores.map((e) => <li key={e.campo}><a href={`#${e.campo}`} onClick={(ev) => { ev.preventDefault(); (document.getElementById(e.campo) as HTMLElement | null)?.focus(); }}>{e.mensaje}</a></li>)}</ul>
        </div>
      ) : null}
      <Ficha l={l} />
      {l.descripcion ? <p className="ps-descripcion">{l.descripcion}</p> : null}
      <p className="ps-nota">Para <strong>aprobar</strong> diligencie todo el formulario. Para <strong>rechazar</strong> basta la nota con la razón (al menos {MIN_NOTA_PROYECTO} caracteres).</p>

      <div className="ps-dos">
        <section className="ps-bloque" aria-labelledby="pe-crit-h">
          <h2 id="pe-crit-h">Criterios de priorización</h2>
          <div id="pe-criterios" role="group" aria-labelledby="pe-crit-h" tabIndex={-1} data-error={mostrar("pe-criterios") ? "true" : undefined} aria-describedby={mostrar("pe-criterios") ? "pe-criterios-error" : undefined}>
            {(Object.keys(CRITERIOS) as ClaveCriterio[]).map((k) => <PreguntaSiNo key={k} id={`pe-crit-${k}`} etiqueta={CRITERIOS[k]} valor={v.criterios[k]} onCambio={(x) => poner("criterios", { ...v.criterios, [k]: x })} onBlur={salir("pe-criterios")} />)}
          </div>
          {mostrar("pe-criterios") ? <p className="ps-campo__error" id="pe-criterios-error"><Icon name="alert" size={14} /> {mostrar("pe-criterios")}</p> : null}
        </section>
        <section className="ps-bloque" aria-labelledby="pe-via-h">
          <h2 id="pe-via-h">Viabilidad</h2>
          <p className="ps-sub">Técnica, financiera y operativa.</p>
          <div id="pe-viabilidad" role="group" aria-labelledby="pe-via-h" tabIndex={-1} data-error={mostrar("pe-viabilidad") ? "true" : undefined} aria-describedby={mostrar("pe-viabilidad") ? "pe-viabilidad-error" : undefined}>
            {(Object.keys(VIABILIDADES_EVALUADAS) as ClaveViabilidadEvaluada[]).map((k) => <PreguntaSiNo key={k} id={`pe-via-${k}`} etiqueta={VIABILIDADES_EVALUADAS[k]} valor={v.viabilidad[k]} onCambio={(x) => poner("viabilidad", { ...v.viabilidad, [k]: x })} onBlur={salir("pe-viabilidad")} />)}
          </div>
          {mostrar("pe-viabilidad") ? <p className="ps-campo__error" id="pe-viabilidad-error"><Icon name="alert" size={14} /> {mostrar("pe-viabilidad")}</p> : null}
        </section>
      </div>

      <section className="ps-bloque" aria-labelledby="pe-cron-h">
        <h2 id="pe-cron-h">Prioridad y fechas</h2>
        <div className="ps-campos ps-campos--tres">
          <Campo id="pe-prioridad" etiqueta="Prioridad" error={mostrar("pe-prioridad")} obligatorio>
            {(p) => <select {...p} value={v.prioridad} onChange={(e) => poner("prioridad", e.target.value)} onBlur={salir("pe-prioridad")}><option value="">Elija una…</option>{prioridades.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
          </Campo>
          <Campo id="pe-inicio" etiqueta="Fecha de inicio" ayuda={`Entre ${plan!.anioIni} y ${plan!.anioFin}.`} error={mostrar("pe-inicio")} obligatorio>
            {(p) => <input {...p} type="date" value={v.inicio} min={`${plan!.anioIni}-01-01`} max={`${plan!.anioFin}-12-31`} onChange={(e) => poner("inicio", e.target.value)} onBlur={salir("pe-inicio")} />}
          </Campo>
          <Campo id="pe-fin" etiqueta="Fecha de fin" ayuda="No puede ser anterior al inicio." error={mostrar("pe-fin")} obligatorio>
            {(p) => <input {...p} type="date" value={v.fin} min={v.inicio || `${plan!.anioIni}-01-01`} max={`${plan!.anioFin}-12-31`} onChange={(e) => poner("fin", e.target.value)} onBlur={salir("pe-fin")} />}
          </Campo>
        </div>
      </section>

      <section className="ps-bloque" aria-labelledby="pe-pct-h">
        <div className="ps-seccion__cab"><h2 id="pe-pct-h">Distribución anual de la inversión</h2><p className="ps-sub">Qué porcentaje del monto se invierte cada año. Debe sumar exactamente 100 %.</p></div>
        <div className="ps-pct-grilla" role="group" aria-labelledby="pe-pct-h" data-error={mostrar("pe-pct") ? "true" : undefined} aria-describedby={mostrar("pe-pct") ? "pe-pct-error pe-total" : "pe-total"}>
          {anios.map((a, i) => (
            <label key={a} className="ps-pct-celda" htmlFor={i === 0 ? "pe-pct" : `pe-pct-${a}`}>
              <span>{a}</span>
              <span className="ps-pct-entrada"><input id={i === 0 ? "pe-pct" : `pe-pct-${a}`} type="text" inputMode="decimal" autoComplete="off" value={v.pct[String(a)] ?? ""} onChange={(e) => poner("pct", { ...v.pct, [String(a)]: e.target.value })} onBlur={salir("pe-pct")} aria-invalid={Boolean(mostrar("pe-pct")) || undefined} /><b aria-hidden="true">%</b></span>
              <span className="sr-only">por ciento</span>
            </label>
          ))}
        </div>
        <div className="ps-pct-pie">
          <p id="pe-total" className="ps-pct-total" data-ok={sumaEs100(suma) || undefined} role="status" aria-live="polite" aria-atomic="true"><Icon name={sumaEs100(suma) ? "check" : "info"} size={14} /> {textoTotalPct(suma)}</p>
          <button type="button" className="button-secondary ps-btn-peq" onClick={() => { const ini = Number(v.inicio.slice(0, 4)); const fin = Number(v.fin.slice(0, 4)); const rango = ini && fin && fin >= ini ? anios.filter((a) => a >= ini && a <= fin) : anios; const r = distribuirParejo(rango); poner("pct", Object.fromEntries(anios.map((a) => [String(a), aTexto(r[String(a)] ?? null)]))); }}>Repartir parejo entre los años del proyecto</button>
        </div>
        {mostrar("pe-pct") ? <p className="ps-campo__error" id="pe-pct-error"><Icon name="alert" size={14} /> {mostrar("pe-pct")}</p> : null}
      </section>

      <section className="ps-bloque" aria-labelledby="pe-monto-h">
        <h2 id="pe-monto-h">Monto y nota</h2>
        <div className="ps-campos">
          <Campo id="pe-monto" etiqueta="Monto aprobado (pesos)" ayuda={`Precargado con lo solicitado (${pesos(l.monto)}). Solo el número. Equivale a ${montoNum !== null ? pesos(montoNum) : "—"}.`} error={mostrar("pe-monto")} obligatorio>
            {(p) => <input {...p} type="text" inputMode="numeric" autoComplete="off" value={v.monto} onChange={(e) => poner("monto", e.target.value)} onBlur={salir("pe-monto")} />}
          </Campo>
          {diferente && montoNum !== null && l.monto ? <p className="ps-nota" role="status"><Icon name="info" size={13} /> Aprueba el {Math.round((montoNum / l.monto) * 100)} % de lo solicitado ({montoNum < l.monto ? "menos" : "más"} por {pesos(Math.abs(montoNum - l.monto))}). Explíquelo en la nota.</p> : null}
          <Campo id="pe-nota" etiqueta="Nota de la evaluación" ayuda={`Obligatoria al rechazar y cuando el monto aprobado difiere del solicitado: al menos ${MIN_NOTA_PROYECTO} caracteres (lleva ${v.nota.trim().length}). La verá la oficina responsable.`} error={mostrar("pe-nota")}>
            {(p) => <textarea {...p} rows={4} maxLength={2000} value={v.nota} onChange={(e) => poner("nota", e.target.value)} onBlur={salir("pe-nota")} />}
          </Campo>
        </div>
      </section>
      <Historial no={l.no} />
    </PaginaCompleta>
  );
}
