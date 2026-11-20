/* =============================================================================
   Planeación y Seguimiento · VAF · «FINANCIACIÓN Y PRESUPUESTO» (la entrada del módulo para la VAF).
   Pestañas: Por evaluar (cola de la VAF) · Presupuesto (plan activo) · Alertas (vigilancia) · Configuración.
   La VAF (financiero) y el administrador operan; aprobador y lector solo miran. Las oficinas ven el presupuesto de sus
   líneas dentro del detalle de la línea y de la actividad, no aquí.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { EmptyBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useOficinas } from "../api";
import { useAct } from "../actividades/hooks";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { fecha } from "../modelo";
import { ResumenAprobacionVista } from "../proyectos/ResumenAprobacion";
import { useProyectosOps } from "../proyectos/hooksProy";
import { CifrasPpto, ChipEstadoFinanciero, EjecucionVsAvance, ItemAlerta, Pesos, ordenarAlertas } from "./partesVaf";
import { useVafConfig, useVafEvaluaciones, useVafPendientes, usePresupuestoPlan, useVigilancia, useUmbrales } from "./hooksVaf";
import { ROTULO_EVALUACION, ROTULO_SEVERIDAD, antiguedadDias, esFinanciero, estadoFinancieroPlan, porcentajeVaf, puntos, textoAntiguedad, veFinanciacion, type SeveridadAlerta } from "./modeloVaf";

const PESTANAS = [
  { id: "evaluar", texto: "Por evaluar" },
  { id: "aprobacion", texto: "Solicitado vs aprobado" },
  { id: "presupuesto", texto: "Presupuesto" },
  { id: "alertas", texto: "Alertas" },
  { id: "config", texto: "Configuración" },
] as const;

export function Financiacion() {
  const { nivel, plan, ruta } = usePs();
  const [params, setParams] = useSearchParams();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pestana = PESTANAS.find((p) => p.id === params.get("pestana"))?.id ?? "evaluar";
  const cambiar = (p: string) => { const s = new URLSearchParams(params); if (p === "evaluar") s.delete("pestana"); else s.set("pestana", p); setParams(s, { replace: true }); };
  const teclear = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const sig = PESTANAS[(i + d + PESTANAS.length) % PESTANAS.length].id;
    cambiar(sig);
    refs.current[sig]?.focus();
  };
  if (!veFinanciacion(nivel)) return <p className="ps-aviso"><Icon name="lock" size={16} /> Esta pantalla es de la VAF y del administrador (aprobador y lector la ven en lectura). Las oficinas ven el presupuesto de sus líneas en el detalle de cada línea.</p>;
  return (
    <div className="ps-seccion">
      <p className="ps-sub">La VAF evalúa lo financiero de cada plan y vigila el presupuesto y su ejecución. La evaluación <strong>no bloquea</strong> a las oficinas: pueden crear actividades y reportar avances mientras tanto. {esFinanciero(nivel) ? "Usted evalúa y registra." : "Usted lo ve en solo lectura."}</p>
      <div className="ps-pestanas" role="tablist" aria-label="Financiación y presupuesto">
        {PESTANAS.map((p, i) => (
          <button key={p.id} ref={(el) => void (refs.current[p.id] = el)} type="button" role="tab" id={`fin-${p.id}`} aria-selected={pestana === p.id} aria-controls="fin-panel" tabIndex={pestana === p.id ? 0 : -1} onClick={() => cambiar(p.id)} onKeyDown={(e) => teclear(e, i)}>{p.texto}</button>
        ))}
      </div>
      <div id="fin-panel" role="tabpanel" aria-labelledby={`fin-${pestana}`} className="ps-pestana-panel">
        {pestana === "evaluar" ? <PorEvaluar /> : null}
        {pestana === "aprobacion" ? <ResumenAprobacionVista /> : null}
        {pestana === "presupuesto" ? <PresupuestoPlan planId={plan?.id ?? null} nombre={plan?.nombre ?? ""} /> : null}
        {pestana === "alertas" ? <Alertas planId={plan?.id ?? null} nombre={plan?.nombre ?? ""} /> : null}
        {pestana === "config" ? <ConfigResumen /> : null}
      </div>
      <p className="ps-nota"><Link to={ruta("planes")} state={DESDE_MODULO}>Ver todos los planes</Link></p>
    </div>
  );
}

/* ---------- Por evaluar ---------- */

function PorEvaluar() {
  const { ruta, planId, nivel } = usePs();
  const q = useVafPendientes();
  const hist = useVafEvaluaciones(planId);
  const ahora = `${useAct().hoy}T12:00:00Z`;
  const ops = useProyectosOps();
  if (q.isPending) return <LoadingBlock rows={3} label="Cargando la cola de evaluación" />;
  if (q.error) return <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(q.error as Error).message}</p>;
  const cola = q.data ?? [];
  return (
    <>
      <section aria-labelledby="fin-cola-h">
        <div className="ps-seccion__cab"><h2 id="fin-cola-h">Esperan su evaluación <b className="ps-cubo__n" aria-label={`${cola.length} planes`}>{cola.length}</b></h2><p className="ps-sub">Un plan entra a la cola al publicarse su primera versión, o una nueva con montos distintos. La más antigua, primero.</p></div>
        {esFinanciero(nivel) ? (
          <div className="ps-botones">
            <button type="button" className="button-secondary" onClick={() => ops.abrirPendientes.mutate()} disabled={ops.abrirPendientes.isPending} aria-busy={ops.abrirPendientes.isPending || undefined}><Icon name="clock" size={15} /> {ops.abrirPendientes.isPending ? "Abriendo…" : "Abrir evaluaciones pendientes"}</button>
            <span className="ps-nota">Para los planes ya publicados que todavía no tienen evaluación de la VAF.</span>
          </div>
        ) : null}
        <div role="status" aria-live="polite">
          {ops.abrirPendientes.data ? <p className="ps-aviso ps-aviso--ok"><Icon name="check" size={16} /> {ops.abrirPendientes.data.abiertas === 0 ? "No había planes publicados sin evaluación: nada que abrir." : `Se ${ops.abrirPendientes.data.abiertas === 1 ? "abrió 1 evaluación" : `abrieron ${ops.abrirPendientes.data.abiertas} evaluaciones`}: ${ops.abrirPendientes.data.planes.join("; ")}.`}</p> : null}
        </div>
        {ops.abrirPendientes.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(ops.abrirPendientes.error as Error).message}</p> : null}
        {cola.length === 0 ? <EmptyBlock title="No hay planes por evaluar" hint="Cuando se publique una versión con montos nuevos, aparecerá aquí y se avisará a la VAF." /> : (
          <ul className="ps-cola__lista">
            {cola.map((e) => {
              const dias = antiguedadDias(e.creadoEn, ahora);
              return (
                <li key={e.id} className="ps-cola__fila ps-vaf-fila" data-vencido={dias >= 10 || undefined}>
                  <div className="ps-cola__t"><strong>{e.plan}</strong><em>{e.oficina?.nombre ?? "Sin oficina"} · versión {e.version}</em></div>
                  <div className="ps-cola__d"><span><span className="ps-av-resumen__k">Solicitado</span> <Pesos n={e.montoSolicitado} fuerte /></span><span className="ps-cola__espera" data-vencido={dias >= 10 || undefined}><Icon name={dias >= 10 ? "alert" : "clock"} size={13} /> Espera {textoAntiguedad(dias).replace("desde", "desde")}</span></div>
                  <span className="ps-est" data-tono={e.estado === "pendiente" ? "pend" : "activo"}><Icon name="clock" size={13} />{ROTULO_EVALUACION[e.estado]}</span>
                  <Link className="button-primary ps-btn-peq" to={`${ruta("vaf-evaluar", e.planId)}?version=${encodeURIComponent(e.versionId)}`} state={DESDE_MODULO}>{esFinanciero(nivel) ? "Evaluar" : "Ver"}<span className="sr-only"> «{e.plan}»</span></Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="fin-hist-h" className="ps-bloque">
        <h2 id="fin-hist-h">Evaluaciones del plan activo</h2>
        {hist.isPending ? <p className="ps-nota">Cargando…</p> : (hist.data ?? []).length === 0 ? <p className="ps-nota">Este plan aún no tiene evaluaciones (se abre una al publicar su primera versión).</p> : (
          <ul className="ps-hist-vaf">
            {(hist.data ?? []).map((e) => (
              <li key={e.id}><ChipEstadoFinanciero estado={e.estado} corto /> <span>versión {e.version} · solicitado <Pesos n={e.montoSolicitado} />{e.montoAprobado !== null ? <> · aprobado <Pesos n={e.montoAprobado} /></> : null}</span><small>{e.evaluadoEn ? `Evaluó ${e.evaluadoPor?.nombre ?? "la VAF"} el ${fecha(e.evaluadoEn)}` : `Abierta el ${fecha(e.creadoEn)}`}</small></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* ---------- Presupuesto del plan ---------- */

function PresupuestoPlan({ planId, nombre }: { planId: string | null; nombre: string }) {
  const { ruta, nivel, plan } = usePs();
  const q = usePresupuestoPlan(planId);
  const evs = useVafEvaluaciones(planId);
  const oficinasQ = useOficinas();
  const [buscar, setBuscar] = useState("");
  const [oficina, setOficina] = useState("");
  const filas = useMemo(() => (q.data?.porLinea ?? []).filter((l) => (!oficina || l.oficinaId === oficina) && (!buscar || `${l.clave} ${l.nombre ?? ""}`.toLowerCase().includes(buscar.toLowerCase()))), [q.data, buscar, oficina]);
  if (!planId) return <EmptyBlock title="Aún no hay un plan" hint="Elija un plan en la barra de arriba." />;
  if (q.isPending) return <LoadingBlock rows={3} label="Calculando el presupuesto" />;
  if (q.error || !q.data) return <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(q.error as Error | null)?.message ?? "No se pudo leer el presupuesto."}</p>;
  const d = q.data;
  const operador = esFinanciero(nivel);
  return (
    <>
      <div className="ps-seccion__cab"><h2>Presupuesto de «{nombre}»</h2><p className="ps-sub">{evs.data ? <ChipEstadoFinanciero estado={estadoFinancieroPlan(evs.data)} /> : null}</p></div>
      {operador && plan ? (
        <div className="ps-botones">
          <Link className="button-secondary" to={`${ruta("vaf-cargar", planId)}?tipo=financiacion`} state={DESDE_MODULO}><Icon name="upload" size={15} /> Cargar la financiación (Excel)</Link>
          <Link className="button-secondary" to={`${ruta("vaf-cargar", planId)}?tipo=ejecucion`} state={DESDE_MODULO}><Icon name="upload" size={15} /> Cargar la ejecución (Excel)</Link>
        </div>
      ) : null}
      <CifrasPpto c={d.totales} solicitado={d.totales.solicitado} />
      <div className="ps-dos">
        <section className="ps-bloque" aria-labelledby="pp-anio"><h3 id="pp-anio">Por año</h3>
          <div className="ps-matriz-caja"><table className="ps-tabla-ppto"><caption className="sr-only">Presupuesto por año</caption><thead><tr><th scope="col">Año</th><th scope="col">Vigente</th><th scope="col">Comprometido</th><th scope="col">Ejecutado</th><th scope="col">Pagado</th></tr></thead>
            <tbody>{d.porAnio.map((a) => <tr key={a.anio}><th scope="row">{a.anio}</th><td><Pesos n={a.vigente} /></td><td><Pesos n={a.comprometido} /></td><td><Pesos n={a.ejecutado} /></td><td><Pesos n={a.pagado} /></td></tr>)}{d.porAnio.length === 0 ? <tr><td colSpan={5}>Aún no hay presupuesto registrado.</td></tr> : null}</tbody></table></div>
        </section>
        <section className="ps-bloque" aria-labelledby="pp-of"><h3 id="pp-of">Por oficina y pilar</h3>
          <h4 className="ps-subtitulo">Por oficina</h4>
          <ul className="ps-estados-lista">
            {d.porOficina.map((o) => <li key={`o${o.clave}`}><span className="ps-estados-lista__n">{o.nombre}</span><span className="ps-medidor" aria-hidden="true"><i data-barra="x" style={{ width: `${Math.min(100, o.pctEjecucion ?? 0)}%` }} /></span><b>{porcentajeVaf(o.pctEjecucion, 0)}<span className="sr-only"> ejecutado de <Pesos n={o.vigente} /> vigente</span></b></li>)}
          </ul>
          <h4 className="ps-subtitulo">Por pilar</h4>
          <ul className="ps-estados-lista">
            {d.porPilar.map((o) => <li key={`p${o.clave}`}><span className="ps-estados-lista__n">{o.nombre}</span><span className="ps-medidor" aria-hidden="true"><i data-barra="x" style={{ width: `${Math.min(100, o.pctEjecucion ?? 0)}%` }} /></span><b>{porcentajeVaf(o.pctEjecucion, 0)}<span className="sr-only"> ejecutado de <Pesos n={o.vigente} /> vigente</span></b></li>)}
          </ul>
          <p className="ps-nota">% de ejecución sobre lo vigente.</p>
        </section>
      </div>
      <section aria-labelledby="pp-lin">
        <div className="ps-seccion__cab"><h3 id="pp-lin">Por línea ({filas.length})</h3></div>
        <div className="ps-barra-act__fila">
          <div className="ps-buscar"><Icon name="search" size={15} /><input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar una línea" aria-label="Buscar una línea" /></div>
          <div className="ps-selector ps-selector--linea"><label htmlFor="pp-of-sel">Oficina</label><select id="pp-of-sel" value={oficina} onChange={(e) => setOficina(e.target.value)}><option value="">Todas</option>{(oficinasQ.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></div>
        </div>
        <div className="ps-matriz-caja">
          <table className="ps-tabla-ppto ps-tabla-ppto--lineas">
            <caption className="sr-only">Presupuesto por línea con el avance físico validado</caption>
            <thead><tr><th scope="col">Línea</th><th scope="col">Vigente</th><th scope="col">Ejecutado</th><th scope="col">% ejec.</th><th scope="col">Avance físico</th><th scope="col">Desviación</th></tr></thead>
            <tbody>
              {filas.map((l) => (
                <tr key={l.lineaId}>
                  <th scope="row"><Link to={ruta("vaf-linea", encodeURIComponent(l.lineaId))} state={DESDE_MODULO}>#{l.clave}</Link> <span>{(l.nombre ?? "").replace(/\.$/, "").slice(0, 70)}</span></th>
                  <td><Pesos n={l.vigente} /></td><td><Pesos n={l.ejecutado} /></td><td>{porcentajeVaf(l.pctEjecucion)}</td><td>{porcentajeVaf(l.avanceFisico)}</td>
                  <td data-alta={l.desviacion !== null && Math.abs(l.desviacion) > 15 || undefined}>{l.desviacion === null ? "—" : <span className="ps-inline"><Icon name={Math.abs(l.desviacion) > 15 ? "alert" : "check"} size={12} /> {puntos(l.desviacion)}</span>}</td>
                </tr>
              ))}
              {filas.length === 0 ? <tr><td colSpan={6}>Ninguna línea coincide.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ---------- Alertas de vigilancia ---------- */

function Alertas({ planId, nombre }: { planId: string | null; nombre: string }) {
  const { ruta, nivel, planes } = usePs();
  const [alcance, setAlcance] = useState<"plan" | "todos">("plan");
  const [sev, setSev] = useState<SeveridadAlerta | "">("");
  const [plan, setPlan] = useState("");
  const [oficina, setOficina] = useState("");
  const q = useVigilancia(alcance === "plan" ? planId : null);
  const umb = useUmbrales(alcance === "plan" ? planId : null);
  const oficinasQ = useOficinas();
  const todas = useMemo(() => ordenarAlertas(q.data ?? []), [q.data]);
  const lista = todas.filter((a) => (!sev || a.severidad === sev) && (!plan || a.planId === plan) && (!oficina || a.oficinaId === oficina));
  const cuenta = (s: SeveridadAlerta) => todas.filter((a) => a.severidad === s).length;
  const nombrePlan = (id: string) => planes.find((p) => p.id === id)?.nombre ?? "Plan";
  return (
    <>
      <div className="ps-barra-act__fila">
        <div className="ps-segmentos" role="radiogroup" aria-label="De qué planes">
          <label><input type="radio" name="al-alcance" checked={alcance === "plan"} onChange={() => setAlcance("plan")} /><span>Este plan</span></label>
          <label><input type="radio" name="al-alcance" checked={alcance === "todos"} onChange={() => setAlcance("todos")} /><span>Todos los planes</span></label>
        </div>
        <div className="ps-selector ps-selector--linea"><label htmlFor="al-sev">Severidad</label><select id="al-sev" value={sev} onChange={(e) => setSev(e.target.value as SeveridadAlerta | "")}><option value="">Todas</option>{(["alta", "media", "baja"] as const).map((s) => <option key={s} value={s}>{ROTULO_SEVERIDAD[s]} ({cuenta(s)})</option>)}</select></div>
        {alcance === "todos" ? <div className="ps-selector ps-selector--linea"><label htmlFor="al-plan">Plan</label><select id="al-plan" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="">Todos</option>{planes.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div> : null}
        <div className="ps-selector ps-selector--linea"><label htmlFor="al-of">Oficina</label><select id="al-of" value={oficina} onChange={(e) => setOficina(e.target.value)}><option value="">Todas</option>{(oficinasQ.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></div>
      </div>
      {alcance === "plan" && planId ? (
        <section className="ps-bloque" aria-labelledby="al-umb">
          <h3 id="al-umb">Umbrales de «{nombre}»</h3>
          {umb.isPending ? <p className="ps-nota">Leyendo…</p> : umb.data ? (
            <dl className="ps-ficha">
              <div><dt>Ejecución sobre el avance físico</dt><dd>Alerta si pasa de {umb.data.umbralDesviacion} puntos (en cualquier sentido)</dd></div>
              <div><dt>Sobreejecución</dt><dd>Alerta si lo ejecutado pasa del {umb.data.umbralSobreejecucion} % del vigente</dd></div>
              <div><dt>Sin movimientos</dt><dd>Alerta si una línea con presupuesto lleva {umb.data.mesesSinEjecucion} meses o más sin movimientos</dd></div>
            </dl>
          ) : null}
          {esFinanciero(nivel) ? <div className="ps-botones"><Link className="button-secondary ps-btn-peq" to={ruta("vaf-umbrales", planId)} state={DESDE_MODULO}><Icon name="pen" size={13} /> Cambiar los umbrales</Link></div> : <p className="ps-nota"><Icon name="lock" size={13} /> Los umbrales los cambia la VAF o el administrador.</p>}
        </section>
      ) : null}
      {q.isPending ? <LoadingBlock rows={3} label="Calculando las alertas" /> : q.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(q.error as Error).message}</p> : lista.length === 0 ? <EmptyBlock title="No hay alertas" hint={todas.length ? "Cambie los filtros." : "Ninguna línea supera los umbrales ni está sin evaluar."} /> : (
        <ul className="ps-alertas-v">
          {lista.map((a, i) => (
            <ItemAlerta key={`${a.lineaId}-${a.tipo}-${i}`} a={a}>
              <Link className="button-secondary ps-btn-peq" to={ruta("vaf-linea", encodeURIComponent(a.lineaId))} state={DESDE_MODULO}>Abrir la línea<span className="sr-only"> {a.lineaClave} de {nombrePlan(a.planId)}</span></Link>
            </ItemAlerta>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------- Configuración (resumen) ---------- */

function ConfigResumen() {
  const { ruta, nivel } = usePs();
  const q = useVafConfig();
  return (
    <section className="ps-bloque" aria-labelledby="cf-h">
      <h2 id="cf-h">Unidad de la VAF</h2>
      {q.isPending ? <p className="ps-nota">Leyendo…</p> : q.error ? <p className="ps-campo__error" role="alert">{(q.error as Error).message}</p> : q.data ? (
        <>
          <dl className="ps-ficha">
            <div><dt>Unidad</dt><dd>{q.data.unidad ? `${q.data.unidad.nombre}${q.data.unidad.codigo ? ` (${q.data.unidad.codigo})` : ""}` : <em>Sin unidad fijada: los avisos van a todas las personas con nivel financiero</em>}</dd></div>
            <div><dt>Reciben los avisos</dt><dd>{q.data.destinatarios} {q.data.destinatarios === 1 ? "persona" : "personas"} (miembros de la unidad con nivel financiero o administrador)</dd></div>
          </dl>
          {nivel === "admin" ? <div className="ps-botones"><Link className="button-secondary" to={ruta("vaf-config")} state={DESDE_MODULO}><Icon name="pen" size={14} /> Cambiar la unidad</Link></div> : <p className="ps-nota"><Icon name="lock" size={13} /> La unidad la fija el administrador del módulo.</p>}
        </>
      ) : null}
    </section>
  );
}
