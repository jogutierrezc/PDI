/* =============================================================================
   Planeación y Seguimiento · Fase 2 · «Mi planificación» / «Planificación de {oficina}».

   El corazón de la fase: con la oficina elegida (solo las suyas), muestra el resumen
   (líneas a cargo y su monto, actividades por estado, vencidas, sin responsable, carga por
   persona) y la lista de líneas del plan asignadas a la oficina con sus actividades.
   Desde aquí se crea una actividad (formulario por pasos) o se importa la planificación
   de la oficina desde Excel.
   ========================================================================== */

import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { EmptyBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { useEntradaResumen } from "../movimiento";
import { Prioridad } from "../partes";
import { entero, millones1, rotuloCampus } from "../modelo";
import { useAct, useActividades, useEquipo, useLineasOficina, useOficinaActual } from "./hooks";
import { DEF_ESTADOS, ESTADOS, ROTULO_PAPEL, ROTULO_PODER, estadoPlazo, resumirActividades, type Actividad } from "./modelo";
import { AvisoDemo, ChipEstado, ChipPlazo, GlifoEstado, PilaAvatares, SelectorOficina } from "./partes";
import { explicarPoder, puedeCrear, puedeImportar } from "./reglas";
import { SinOficinas } from "./vacios";

function FilaActividad({ a, hoy, personas, ruta }: { a: Actividad; hoy: string; personas: ReturnType<typeof useAct>["personas"]; ruta: string }) {
  return (
    <li className="ps-fila-act">
      <Link to={ruta} state={DESDE_MODULO} className="ps-fila-act__t">{a.titulo}</Link>
      <ChipEstado estado={a.estado} />
      <ChipPlazo a={a} hoy={hoy} />
      <PilaAvatares ids={a.asignados} personas={personas} />
    </li>
  );
}

export function Planificacion() {
  const { ruta, ir } = usePs();
  const act = useAct();
  const { oficina, oficinas, elegir } = useOficinaActual();
  const id = oficina?.id ?? null;
  const lineasQ = useLineasOficina(id);
  const actsQ = useActividades(id ? [id] : []);
  const equipoQ = useEquipo(id);
  const raiz = useRef<HTMLDivElement>(null);
  const acts = useMemo(() => actsQ.data ?? [], [actsQ.data]);
  const lineas = useMemo(() => [...(lineasQ.data ?? [])].sort((a, b) => Number(a.no) - Number(b.no)), [lineasQ.data]);
  useEntradaResumen(raiz, `${id}-${acts.length}-${lineas.length}`);

  if (act.cargando) return <LoadingBlock rows={5} label="Cargando su planificación" />;
  if (act.error) return <EmptyBlock title="No se pudieron leer sus oficinas" hint={act.error.message} />;
  if (!oficina) return <SinOficinas />;

  const r = resumirActividades(acts, act.hoy);
  const gestor = puedeCrear(oficina.poder);
  const montoLineas = lineas.reduce((s, l) => s + (l.monto ?? 0), 0);
  const nueva = `${ruta("actividad-nueva")}?oficina=${encodeURIComponent(oficina.id)}`;
  const importar = `${ruta("importar-actividades")}?oficina=${encodeURIComponent(oficina.id)}`;
  const propias = acts.filter((a) => !a.lineaNo);
  const miOficina = oficina.papel !== null && oficinas.filter((o) => o.papel !== null).length === 1;
  const maxCarga = Math.max(1, ...(equipoQ.data ?? []).map((m) => m.carga.activas));
  const sinActs = acts.length === 0;

  return (
    <div className="ps-seccion" ref={raiz}>
      {act.demo ? <AvisoDemo /> : null}
      <section className="ps-oficina-cab" aria-label="Oficina y permiso">
        <SelectorOficina oficinas={oficinas} valor={oficina.id} onElegir={elegir} etiqueta={miOficina ? "Su oficina" : "Oficina"} />
        <div className="ps-oficina-cab__poder">
          <p>
            <span className="ps-estado" data-tono={oficina.poder === "gestor" ? "ok" : oficina.poder === "ninguno" ? "mal" : "pend"}>{ROTULO_PODER[oficina.poder]}</span>
            {" "}en esta oficina{oficina.papel ? <> · papel: {ROTULO_PAPEL[oficina.papel].toLowerCase()}{oficina.heredadoDe ? ` (heredado de ${oficina.heredadoDe})` : ""}</> : null}
          </p>
          <p className="ps-sub">{explicarPoder(act.nivelModulo, oficina.papel, oficina.poder)}</p>
        </div>
        {gestor || puedeImportar(oficina.poder) ? (
          <div className="ps-botones">
            <button type="button" className="button-primary" onClick={() => ir(nueva)}><Icon name="plus" size={16} /> Crear actividad</button>
            <button type="button" className="button-secondary" onClick={() => ir(importar)}><Icon name="upload" size={16} /> Importar desde Excel</button>
          </div>
        ) : null}
      </section>

      {lineasQ.isPending || actsQ.isPending ? <LoadingBlock rows={3} label="Cargando la planificación de la oficina" /> : null}

      {sinActs && !actsQ.isPending ? (
        <div className="ps-vacio ps-vacio--oficina">
          <h2>Tu oficina aún no tiene planificación</h2>
          <p className="ps-sub">
            {gestor
              ? <>Crea la primera actividad o impórtala desde Excel. {lineas.length ? `${oficina.nombre} tiene ${entero(lineas.length)} ${lineas.length === 1 ? "línea del plan" : "líneas del plan"} a su cargo: cada actividad contribuye a una de ellas, o es una actividad propia de la oficina.` : "La oficina todavía no tiene líneas del plan a su cargo; puede crear actividades propias."}</>
              : <>El gestor de la oficina crea las actividades o las importa desde Excel; cuando lo haga, aparecerán aquí y en el tablero. No hace falta que haga nada.</>}
          </p>
          {gestor ? (
            <div className="ps-botones">
              <button type="button" className="button-primary" onClick={() => ir(nueva)}><Icon name="plus" size={16} /> Crear la primera actividad</button>
              <button type="button" className="button-secondary" onClick={() => ir(importar)}><Icon name="upload" size={16} /> Importar desde Excel</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!sinActs ? (
        <>
          <dl className="ps-kpis" aria-label={`Cifras de ${oficina.nombre}`}>
            <div><dt>Líneas del plan a su cargo</dt><dd data-cuenta={lineas.length}>{entero(lineas.length)}</dd><dd className="ps-kpis__s">{lineas.length ? millones1(montoLineas) : "Sin líneas asignadas"}</dd></div>
            <div><dt>Actividades</dt><dd data-cuenta={r.total}>{entero(r.total)}</dd><dd className="ps-kpis__s">{r.propias} propias de la oficina</dd></div>
            <div><dt>Vencidas</dt><dd data-cuenta={r.vencidas}>{entero(r.vencidas)}</dd><dd className="ps-kpis__s">{r.vencidas ? "pasó su fecha y no están hechas" : "ninguna"}</dd></div>
            <div><dt>Sin responsable</dt><dd data-cuenta={r.sinResponsable}>{entero(r.sinResponsable)}</dd><dd className="ps-kpis__s">{r.sinResponsable && gestor ? <Link to={`${ruta("asignar")}?oficina=${encodeURIComponent(oficina.id)}`} state={DESDE_MODULO}>asignarlas</Link> : r.sinResponsable ? "las reparte el gestor" : "todas tienen quién"}</dd></div>
            <div><dt>En riesgo</dt><dd data-cuenta={r.porEstado.en_riesgo}>{entero(r.porEstado.en_riesgo)}</dd><dd className="ps-kpis__s">{r.porEstado.en_revision} esperan revisión</dd></div>
          </dl>
          <div className="ps-dos">
            <section className="ps-bloque">
              <h3>Actividades por estado</h3>
              <ul className="ps-estados-lista">
                {ESTADOS.map((e) => (
                  <li key={e}>
                    <span className="ps-estados-lista__n"><GlifoEstado estado={e} /> {DEF_ESTADOS[e].nombre}</span>
                    <span className="ps-medidor" aria-hidden="true"><i data-barra="x" data-tono={DEF_ESTADOS[e].tono} style={{ width: `${r.total ? (r.porEstado[e] / r.total) * 100 : 0}%` }} /></span>
                    <b>{r.porEstado[e]}</b>
                  </li>
                ))}
              </ul>
              <p className="ps-nota"><Link to={`${ruta("tablero")}?oficina=${encodeURIComponent(oficina.id)}`} state={DESDE_MODULO}>Abrir el tablero</Link> para moverlas.</p>
            </section>
            <section className="ps-bloque">
              <h3>Carga por persona</h3>
              {equipoQ.isPending ? <p className="ps-nota">Cargando el equipo…</p> : (
                <ul className="ps-estados-lista">
                  {(equipoQ.data ?? []).filter((m) => m.asignable).map((m) => (
                    <li key={m.id}>
                      <span className="ps-estados-lista__n">{m.nombre}{m.esYo ? " (usted)" : ""}</span>
                      <span className="ps-medidor" aria-hidden="true"><i data-barra="x" style={{ width: `${(m.carga.activas / maxCarga) * 100}%` }} /></span>
                      <b>{m.carga.activas}<span className="sr-only"> activas</span>{m.carga.vencidas ? <em className="ps-venc"> · {m.carga.vencidas} vencida{m.carga.vencidas === 1 ? "" : "s"}</em> : null}</b>
                    </li>
                  ))}
                  {(equipoQ.data ?? []).filter((m) => m.asignable).length === 0 ? <li className="ps-nota">La oficina no tiene colaboradores todavía: pida al administrador que los agregue en Usuarios.</li> : null}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}

      <section aria-labelledby="ps-lineas-h">
        <div className="ps-seccion__cab">
          <h2 id="ps-lineas-h">Líneas del plan a cargo de {oficina.nombre}</h2>
          <p className="ps-sub">{lineas.length ? `${entero(lineas.length)} ${lineas.length === 1 ? "línea" : "líneas"}. Cada una despliega sus actividades.` : "El plan aún no le asigna líneas a esta oficina (se asignan en la columna «Oficina responsable» de la carga del plan)."}</p>
        </div>
        <ul className="ps-lineas-of">
          {lineas.map((l) => {
            const delas = acts.filter((a) => a.lineaNo === l.no);
            const vencidas = delas.filter((a) => estadoPlazo(a, act.hoy) === "vencida").length;
            return (
              <li key={l.no}>
                <details className="ps-linea-of">
                  <summary>
                    <span className="ps-linea-of__t"><span><b>#{l.no}</b> {l.nombre.replace(/\.$/, "")}</span><em>{l.clasif} · {rotuloCampus(l.campus)}</em></span>
                    <span className="ps-linea-of__d"><Prioridad valor={l.prioridad} /></span>
                    <span className="ps-linea-of__d ps-der">{l.monto === null ? "Sin monto" : millones1(l.monto)}</span>
                    <span className="ps-linea-of__d">
                      {delas.length ? `${delas.length} ${delas.length === 1 ? "actividad" : "actividades"}` : <span className="ps-estado" data-tono="pend"><Icon name="alert" size={12} />Sin actividades</span>}
                      {vencidas ? <span className="ps-estado" data-tono="mal"><Icon name="clock" size={12} />{vencidas} vencida{vencidas === 1 ? "" : "s"}</span> : null}
                    </span>
                  </summary>
                  <div className="ps-linea-of__cuerpo">
                    {delas.length ? (
                      <ul>{delas.map((a) => <FilaActividad key={a.id} a={a} hoy={act.hoy} personas={act.personas} ruta={ruta("actividad", a.id)} />)}</ul>
                    ) : <p className="ps-nota">Esta línea aún no tiene actividades de la oficina.</p>}
                    <div className="ps-botones">
                      <Link className="ps-enlace" to={`${ruta("proyectos", l.no)}`} state={DESDE_MODULO}>Ver la línea del plan</Link>
                      {gestor ? <button type="button" className="button-secondary" onClick={() => ir(`${nueva}&linea=${encodeURIComponent(l.no)}`)}><Icon name="plus" size={14} /> Agregar actividad a esta línea</button> : null}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
          {propias.length || gestor ? (
            <li>
              <details className="ps-linea-of" open={Boolean(propias.length) && !lineas.length}>
                <summary>
                  <span className="ps-linea-of__t">Actividades propias de la oficina<em>No contribuyen a una línea del plan</em></span>
                  <span className="ps-linea-of__d" />
                  <span className="ps-linea-of__d" />
                  <span className="ps-linea-of__d">{propias.length} {propias.length === 1 ? "actividad" : "actividades"}</span>
                </summary>
                <div className="ps-linea-of__cuerpo">
                  {propias.length ? <ul>{propias.map((a) => <FilaActividad key={a.id} a={a} hoy={act.hoy} personas={act.personas} ruta={ruta("actividad", a.id)} />)}</ul> : <p className="ps-nota">Aún no hay actividades propias.</p>}
                  {gestor ? <div className="ps-botones"><button type="button" className="button-secondary" onClick={() => ir(`${nueva}&linea=propia`)}><Icon name="plus" size={14} /> Agregar actividad propia</button></div> : null}
                </div>
              </details>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
