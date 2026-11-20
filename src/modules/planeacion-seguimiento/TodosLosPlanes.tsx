/* =============================================================================
   Planeación y Seguimiento · Fase 3B · «TODOS LOS PLANES»: la visión de seguimiento del administrador
   (aprobador y lector la ven en solo lectura). Los cálculos los hace la base (`ps_tablero_admin`): aquí solo se muestran.
     tarjetas por plan · matriz plan × oficina (mapa de calor con el número escrito) · alertas ·
     comparación de avance por oficina · ritmo semanal de avances validados.
   ========================================================================== */

import { useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useOficinas, useTableroAdmin } from "./api";
import { usePs } from "./contexto";
import { PaginaCompleta } from "./marco/PaginaCompleta";
import { entero, fecha, millones } from "./modelo";
import { ROTULO_ALCANCE, ROTULO_SALUD, nivelCalor, ordenarPlanes, puedeVerTodosLosPlanes, type EstadoPlan, type FiltrosTablero, type OrdenPlanes, type PlanTablero, type SaludPlan } from "./modeloPlanes";
import { useEntradaResumen } from "./movimiento";
import { ChipFinanciero } from "./SelectorPlan";
import { Pesos } from "./vaf/partesVaf";

const GLIFO_SALUD: Record<SaludPlan, "check" | "alert" | "clock" | "info"> = { verde: "check", ambar: "clock", rojo: "alert", sin_datos: "info" };
const Salud = ({ s }: { s: SaludPlan }) => <span className="ps-salud" data-s={s}><Icon name={GLIFO_SALUD[s]} size={13} />{ROTULO_SALUD[s]}</span>;
const pct = (n: number | null) => (n === null ? "—" : `${n} %`);

export function TodosLosPlanes() {
  const { nivel, ruta, ir, elegirPlan } = usePs();
  const [params, setParams] = useSearchParams();
  const oficinasQ = useOficinas();
  const raiz = useRef<HTMLDivElement>(null);
  const filtros: FiltrosTablero = { estado: (params.get("estado") as EstadoPlan | null) ?? "", salud: (params.get("salud") as SaludPlan | null) ?? "", oficinaId: params.get("oficina") ?? "", anio: Number(params.get("anio")) || undefined };
  const orden = (["nombre", "avance", "salud", "vencidas"] as const).find((o) => o === params.get("orden")) ?? "salud";
  const q = useTableroAdmin(filtros, puedeVerTodosLosPlanes(nivel));
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Todos los planes" }];
  const poner = (k: string, v: string) => { const s = new URLSearchParams(params); if (v) s.set(k, v); else s.delete(k); setParams(s, { replace: true }); };
  const t = q.data;
  const planes = useMemo(() => ordenarPlanes(t?.planes ?? [], orden as OrdenPlanes), [t, orden]);
  useEntradaResumen(raiz, `${planes.length}-${t?.totales.actividades}`);

  const oficinas = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of planes) for (const o of p.porOficina) m.set(o.unitId, o.nombre);
    return [...m].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [planes]);
  const porOficina = useMemo(() => oficinas.map((o) => {
    const celdas = planes.flatMap((p) => p.porOficina.filter((c) => c.unitId === o.id));
    const acts = celdas.reduce((s, c) => s + c.actividades, 0);
    return { ...o, actividades: acts, avance: acts ? Math.round(celdas.reduce((s, c) => s + c.avance * c.actividades, 0) / acts) : 0, vencidas: celdas.reduce((s, c) => s + c.vencidas, 0) };
  }).filter((o) => o.actividades > 0).sort((a, b) => b.avance - a.avance), [oficinas, planes]);
  const ritmo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of planes) for (const r of p.ritmoSemanas) m.set(r.semana, (m.get(r.semana) ?? 0) + r.avancesValidados);
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([semana, n]) => ({ semana, n }));
  }, [planes]);
  const maxRitmo = Math.max(1, ...ritmo.map((r) => r.n));
  const abrir = (p: PlanTablero) => { elegirPlan(p.id); ir(ruta("planificacion")); };

  if (!puedeVerTodosLosPlanes(nivel)) return <PaginaCompleta titulo="Todos los planes" migas={migas} regresarA={ruta("resumen")}><p className="ps-aviso"><Icon name="lock" size={16} /> Esta visión es del administrador de planeación; aprobadores y lectores la ven en lectura.</p></PaginaCompleta>;
  return (
    <PaginaCompleta titulo="Todos los planes" subtitulo={nivel === "admin" ? "El seguimiento de todos los planes de la Universidad en una sola pantalla." : "El seguimiento de todos los planes (solo lectura)."} migas={migas} regresarA={ruta("resumen")}>
      <div className="ps-seccion" ref={raiz}>
        <section className="ps-barra-act" aria-label="Filtrar los planes">
          <div className="ps-barra-act__fila">
            <div className="ps-selector ps-selector--linea"><label htmlFor="tp-estado">Estado</label><select id="tp-estado" value={filtros.estado} onChange={(e) => poner("estado", e.target.value)}><option value="">Todos</option><option value="activo">Activos</option><option value="archivado">Archivados</option></select></div>
            <div className="ps-selector ps-selector--linea"><label htmlFor="tp-salud">Salud</label><select id="tp-salud" value={filtros.salud} onChange={(e) => poner("salud", e.target.value)}><option value="">Todas</option>{(["rojo", "ambar", "verde", "sin_datos"] as const).map((s) => <option key={s} value={s}>{ROTULO_SALUD[s]}</option>)}</select></div>
            <div className="ps-selector ps-selector--linea"><label htmlFor="tp-of">Oficina</label><select id="tp-of" value={filtros.oficinaId} onChange={(e) => poner("oficina", e.target.value)}><option value="">Todas</option>{(oficinasQ.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></div>
            <div className="ps-selector ps-selector--linea"><label htmlFor="tp-anio">Año</label><input id="tp-anio" className="ps-anio" type="text" inputMode="numeric" maxLength={4} value={params.get("anio") ?? ""} onChange={(e) => poner("anio", e.target.value.replace(/\D/g, ""))} placeholder="2027" /></div>
            <div className="ps-selector ps-selector--linea"><label htmlFor="tp-orden">Ordenar por</label><select id="tp-orden" value={orden} onChange={(e) => poner("orden", e.target.value)}><option value="salud">Salud (los más urgentes primero)</option><option value="avance">Avance</option><option value="vencidas">Vencidas</option><option value="nombre">Nombre</option></select></div>
          </div>
        </section>
        {q.isPending ? <LoadingBlock rows={4} label="Calculando el seguimiento de los planes" /> : q.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> No se pudo leer el tablero: {(q.error as Error).message}</p> : !t || planes.length === 0 ? <EmptyBlock title="No hay planes con estos filtros" hint="Cambie el estado, la salud, la oficina o el año." /> : (
          <>
            <dl className="ps-kpis" aria-label="Totales">
              <div><dt>Planes</dt><dd data-cuenta={t.totales.planes}>{t.totales.planes}</dd><dd className="ps-kpis__s">{t.totales.activos} activos</dd></div>
              <div><dt>Líneas</dt><dd data-cuenta={t.totales.lineas}>{entero(t.totales.lineas)}</dd><dd className="ps-kpis__s">{millones(t.totales.monto)} planeados</dd></div>
              <div><dt>Actividades</dt><dd data-cuenta={t.totales.actividades}>{entero(t.totales.actividades)}</dd><dd className="ps-kpis__s">{t.totales.enRiesgo} en riesgo</dd></div>
              <div><dt>Vencidas</dt><dd data-cuenta={t.totales.vencidas}>{entero(t.totales.vencidas)}</dd><dd className="ps-kpis__s">{t.totales.porValidar} avances por validar</dd></div>
              <div><dt>Avance físico validado</dt><dd data-cuenta={t.totales.avanceFisico} data-formato="pct">{t.totales.avanceFisico} %</dd><dd className="ps-kpis__s">financiero: {pct(t.totales.avanceFinanciero)}</dd></div>
              {t.totales.presupuesto ? <div><dt>Presupuesto vigente</dt><dd><Pesos n={t.totales.presupuesto.vigente} fuerte /></dd><dd className="ps-kpis__s">ejecutado {t.totales.presupuesto.pctEjecucion ?? 0} %</dd></div> : null}
            </dl>

            {t.alertas.length ? (
              <section className="ps-bloque" aria-labelledby="tp-alertas">
                <h2 id="tp-alertas">Alertas ({t.alertas.length})</h2>
                <ul className="ps-alertas">
                  {t.alertas.map((a, i) => (
                    <li key={i} data-sev={a.severidad}>
                      <Icon name={a.severidad === "alta" ? "alert" : "info"} size={15} />
                      <span><strong className="ps-alertas__sev">{a.severidad === "alta" ? "Urgente" : a.severidad === "media" ? "Atención" : "Aviso"}:</strong> {a.texto}</span>
                      <button type="button" className="button-secondary ps-btn-peq" onClick={() => { const p = planes.find((x) => x.id === a.planId); if (p) abrir(p); }}>Abrir el plan</button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : <p className="ps-nota"><Icon name="check" size={13} /> No hay alertas.</p>}

            <section aria-labelledby="tp-planes">
              <h2 id="tp-planes">Los planes ({planes.length})</h2>
              <ul className="ps-planes">
                {planes.map((p) => (
                  <li key={p.id} className="ps-plan-tarjeta" data-archivado={p.estado === "archivado" || undefined}>
                    <header>
                      <h3>{p.nombre}</h3>
                      <Salud s={p.salud} />
                    </header>
                    <p className="ps-plan-tarjeta__of">{p.oficina?.nombre ?? "Sin oficina asignada"} · {ROTULO_ALCANCE[p.alcance].toLowerCase()} · {p.anioIni} a {p.anioFin}{p.estado === "archivado" ? " · archivado" : ""}</p>
                    <div className="ps-plan-tarjeta__av">
                      <span className="ps-av-resumen__k">Avance físico validado</span>
                      <span className="ps-avbar"><span className="ps-avbar__pista" role="img" aria-label={`Avance físico validado: ${p.avanceFisico} %`}><i data-barra="x" style={{ width: `${p.avanceFisico}%` }} /></span><b>{p.avanceFisico} %</b></span>
                      <small>Financiero: {pct(p.avanceFinanciero)}</small>
                    </div>
                    {p.presupuesto ? <p className="ps-plan-tarjeta__ppto">Presupuesto vigente <Pesos n={p.presupuesto.vigente} fuerte /> · ejecutado <Pesos n={p.presupuesto.ejecutado} /> ({p.presupuesto.pctEjecucion === null ? "sin vigente" : `${p.presupuesto.pctEjecucion} %`})</p> : null}
                    <dl className="ps-plan-tarjeta__cifras">
                      <div><dt>Líneas</dt><dd>{p.lineas}</dd></div>
                      <div><dt>Actividades</dt><dd>{p.actividades}</dd></div>
                      <div><dt>Vencidas</dt><dd data-mal={p.vencidas > 0 || undefined}>{p.vencidas}</dd></div>
                      <div><dt>Por validar</dt><dd>{p.porValidar}</dd></div>
                    </dl>
                    <div className="ps-plan-tarjeta__pie"><ChipFinanciero conteos={p.evaluacionesVaf} />{!p.oficina && nivel === "admin" ? <button type="button" className="button-secondary ps-btn-peq" onClick={() => ir(ruta("plan-editar", p.id))}>Asignar la oficina</button> : null}<button type="button" className="button-primary ps-btn-peq" onClick={() => abrir(p)}>Abrir el plan<span className="sr-only"> «{p.nombre}»</span></button></div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="ps-bloque" aria-labelledby="tp-matriz">
              <h2 id="tp-matriz">Matriz plan × oficina</h2>
              <p className="ps-sub">Avance físico validado de las actividades de cada oficina en cada plan; entre paréntesis, cuántas actividades son. Más oscuro, más avance.</p>
              <div className="ps-matriz-caja">
                <table className="ps-matriz">
                  <caption className="sr-only">Avance físico validado por plan y oficina</caption>
                  <thead><tr><th scope="col">Plan</th>{oficinas.map((o) => <th key={o.id} scope="col">{o.nombre}</th>)}</tr></thead>
                  <tbody>
                    {planes.map((p) => (
                      <tr key={p.id}>
                        <th scope="row">{p.nombre}</th>
                        {oficinas.map((o) => {
                          const c = p.porOficina.find((x) => x.unitId === o.id);
                          return c && c.actividades > 0 ? <td key={o.id} data-calor={nivelCalor(c.avance, c.actividades)} data-venc={c.vencidas > 0 || undefined}><b>{c.avance} %</b> <small>({c.actividades}{c.vencidas ? `, ${c.vencidas} venc.` : ""})</small></td> : <td key={o.id} data-calor="0"><span aria-label="Sin actividades">—</span></td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="ps-dos">
              <section className="ps-bloque" aria-labelledby="tp-of-h">
                <h2 id="tp-of-h">Avance por oficina</h2>
                <p className="ps-sub">Todos los planes juntos, ponderado por actividades.</p>
                <ul className="ps-estados-lista">
                  {porOficina.map((o) => (
                    <li key={o.id}><span className="ps-estados-lista__n">{o.nombre}</span><span className="ps-medidor" aria-hidden="true"><i data-barra="x" style={{ width: `${o.avance}%` }} /></span><b>{o.avance} %<span className="sr-only"> de avance, {o.actividades} actividades</span></b></li>
                  ))}
                </ul>
              </section>
              <section className="ps-bloque" aria-labelledby="tp-ritmo-h">
                <h2 id="tp-ritmo-h">Ritmo: avances validados por semana</h2>
                <p className="ps-sub">Las últimas ocho semanas, en todos los planes.</p>
                <ol className="ps-ritmo" aria-label="Avances validados por semana">
                  {ritmo.map((r) => (
                    <li key={r.semana}><span className="ps-ritmo__n">{r.n}</span><span className="ps-ritmo__b" aria-hidden="true"><i data-barra="y" style={{ height: `${(r.n / maxRitmo) * 100}%` }} /></span><span className="ps-ritmo__f">{fecha(r.semana).replace(/ de \d{4}$/, "")}<span className="sr-only"> (semana que empieza ese día): {r.n} avances</span></span></li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        )}
      </div>
    </PaginaCompleta>
  );
}
