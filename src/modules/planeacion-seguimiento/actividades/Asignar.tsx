/* Planeación y Seguimiento · Fase 2 · ASIGNAR (solo gestor y administrador): el equipo con su carga, las actividades
   sin responsable, la asignación masiva y el acceso a «Transferir». Un gestor solo asigna a miembros de su oficina. */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { EmptyBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { useAct, useActividades, useAsignar, useEquipo, useOficinaActual } from "./hooks";
import { comparar } from "./filtros";
import { ROTULO_PAPEL } from "./modelo";
import { Banner, ChipEstado, ChipPlazo, ConfirmarCampus, SelectorOficina, VistaPreviaAvisos } from "./partes";
import type { ConflictoCampus } from "./contratoApi";
import { avisoAsignacion, puedeAsignar } from "./reglas";
import { SinOficinas } from "./vacios";

export function Asignar() {
  const a = useAct();
  const { ruta } = usePs();
  const { oficina, oficinas, elegir } = useOficinaActual();
  const gestionables = oficinas.filter((o) => puedeAsignar(o.poder));
  const id = gestionables.find((o) => o.id === oficina?.id)?.id ?? gestionables[0]?.id ?? null;
  const equipoQ = useEquipo(id);
  const actsQ = useActividades(id ? [id] : []);
  const asignar = useAsignar();
  const [sel, setSel] = useState<string[]>([]);
  const [persona, setPersona] = useState("");
  const [ver, setVer] = useState("");
  const [resultado, setResultado] = useState<string | null>(null);
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [conflictos, setConflictos] = useState<ConflictoCampus[]>([]);
  const equipo = useMemo(() => equipoQ.data ?? [], [equipoQ.data]);
  const acts = useMemo(() => actsQ.data ?? [], [actsQ.data]);
  const sinResp = useMemo(() => acts.filter((x) => !x.asignados.length && x.estado !== "hecho").sort(comparar), [acts]);

  if (a.cargando) return <LoadingBlock rows={4} label="Cargando" />;
  if (!a.oficinas.length) return <SinOficinas />;
  if (!gestionables.length) return <Banner><Icon name="lock" size={14} /> Asignar es del gestor de la oficina y del administrador. Con su acceso actual puede ver el tablero y sus tareas, pero no repartir actividades.</Banner>;
  const of = gestionables.find((o) => o.id === id) ?? gestionables[0];
  const asignables = equipo.filter((m) => m.asignable);
  const maxCarga = Math.max(1, ...asignables.map((m) => m.carga.activas));
  const todas = sinResp.length > 0 && sel.length === sinResp.length;
  const avisos = persona ? avisoAsignacion([persona], equipo, a.yo) : [];
  const deVer = ver ? acts.filter((x) => x.asignados.includes(ver) && x.estado !== "hecho").sort(comparar) : [];

  const enviar = (confirmar = false) => {
    setResultado(null);
    setErrorCampo(null);
    if (!sel.length) return setErrorCampo("Marque al menos una actividad.");
    if (!persona) return setErrorCampo("Elija a quién se las asigna.");
    asignar.mutate({ ids: sel, personaId: persona, confirmar }, {
      onSuccess: (r) => {
        setConflictos(r.conflictos);
        if (r.conflictos.length) return;
        setResultado(`Se asignaron ${sel.length} ${sel.length === 1 ? "actividad" : "actividades"} a ${a.nombreDe(persona)}.${r.avisara.length ? ` Se avisará a ${r.avisara.length} ${r.avisara.length === 1 ? "persona" : "personas"} por correo.` : ""}`);
        setSel([]);
      },
    });
  };

  return (
    <div className="ps-seccion">
      <SelectorOficina oficinas={gestionables} valor={of.id} onElegir={(x) => { elegir(x); setSel([]); setResultado(null); }} />
      {resultado ? <Banner tipo="ok" rol="status">{resultado}</Banner> : null}
      <section className="ps-bloque" aria-labelledby="as-equipo">
        <h2 id="as-equipo">Equipo de {of.nombre}</h2>
        <p className="ps-sub">Su carga hoy: actividades sin cerrar. Solo los miembros de la oficina reciben actividades.</p>
        {equipoQ.isPending ? <p className="ps-nota">Cargando el equipo…</p> : (
          <div className="ps-tabla ps-equipo" role="table" aria-label="Equipo y carga">
            <div className="ps-tabla__fila ps-tabla__cab" role="row"><span role="columnheader">Persona</span><span role="columnheader">Papel</span><span role="columnheader">Activas</span><span role="columnheader">Vencidas</span><span role="columnheader">En riesgo</span><span role="columnheader"><span className="sr-only">Acciones</span></span></div>
            {equipo.map((m) => (
              <div className="ps-tabla__fila" role="row" key={m.id}>
                <span role="cell" className="ps-tabla__t"><strong>{m.nombre}{m.esYo ? " (usted)" : ""}</strong><em>{m.correo}</em></span>
                <span role="cell" data-l="Papel">{ROTULO_PAPEL[m.papel]}</span>
                <span role="cell" data-l="Activas">{m.asignable ? <span className="ps-carga"><span className="ps-medidor" aria-hidden="true"><i style={{ width: `${(m.carga.activas / maxCarga) * 100}%` }} /></span><b>{m.carga.activas}</b></span> : <em>No recibe</em>}</span>
                <span role="cell" data-l="Vencidas" className={m.carga.vencidas ? "ps-venc" : undefined}>{m.asignable ? m.carga.vencidas : "—"}</span>
                <span role="cell" data-l="En riesgo">{m.asignable ? m.carga.enRiesgo : "—"}</span>
                <span role="cell">{m.asignable && m.carga.activas ? <button type="button" className="ps-enlace" onClick={() => setVer(ver === m.id ? "" : m.id)} aria-expanded={ver === m.id}>{ver === m.id ? "Ocultar" : "Ver sus actividades"}</button> : null}</span>
              </div>
            ))}
          </div>
        )}
        {ver ? (
          <div className="ps-bloque ps-bloque--hijo">
            <h3>Actividades de {a.nombreDe(ver)}</h3>
            <ul className="ps-tareas">
              {deVer.map((x) => (
                <li key={x.id} className="ps-tarea">
                  <div className="ps-tarea__t"><Link to={ruta("actividad", x.id)} state={DESDE_MODULO}>{x.titulo}</Link></div>
                  <ChipEstado estado={x.estado} />
                  <ChipPlazo a={x} hoy={a.hoy} />
                  <Link className="button-secondary" to={`${ruta("transferir", x.id)}?de=${encodeURIComponent(ver)}`} state={DESDE_MODULO}>Transferir…</Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="ps-bloque" aria-labelledby="as-sin">
        <h2 id="as-sin">Actividades sin responsable <b className="ps-cubo__n">{sinResp.length}</b></h2>
        {actsQ.isPending ? <p className="ps-nota">Cargando…</p> : sinResp.length === 0 ? (
          <EmptyBlock title="Todas las actividades tienen responsable" hint="Cuando cree o importe actividades sin responsable, aparecerán aquí para repartirlas." />
        ) : (
          <>
            <label className="ps-opcion ps-opcion--grande"><input type="checkbox" checked={todas} onChange={(e) => setSel(e.target.checked ? sinResp.map((x) => x.id) : [])} /><span>Marcar las {sinResp.length}</span></label>
            <ul className="ps-tareas ps-tareas--marcar">
              {sinResp.map((x) => (
                <li key={x.id} className="ps-tarea">
                  <label className="ps-opcion"><input type="checkbox" checked={sel.includes(x.id)} onChange={(e) => setSel(e.target.checked ? [...sel, x.id] : sel.filter((y) => y !== x.id))} /><span className="ps-tarea__t"><Link to={ruta("actividad", x.id)} state={DESDE_MODULO}>{x.titulo}</Link><em>{x.lineaNo ? `Línea #${x.lineaNo}` : "Propia de la oficina"}</em></span></label>
                  <ChipPlazo a={x} hoy={a.hoy} />
                </li>
              ))}
            </ul>
            <div className="ps-asignar-barra">
              <div className="ps-selector">
                <label htmlFor="as-persona">Asignar {sel.length ? `las ${sel.length} marcadas` : "las marcadas"} a</label>
                <select id="as-persona" value={persona} onChange={(e) => { setPersona(e.target.value); setErrorCampo(null); }} aria-invalid={Boolean(errorCampo && !persona)}>
                  <option value="">Elija a una persona…</option>
                  {asignables.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.esYo ? " (usted)" : ""} · {m.carga.activas} activas</option>)}
                </select>
              </div>
              <button type="button" className="button-primary" onClick={() => enviar()} disabled={asignar.isPending} aria-busy={asignar.isPending || undefined}>{asignar.isPending ? "Un momento…" : `Asignar${sel.length ? ` ${sel.length}` : ""}`}</button>
            </div>
            {errorCampo ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {errorCampo}</p> : null}
            {asignar.error ? <Banner tipo="error" rol="alert">{(asignar.error as Error).message}</Banner> : null}
            <ConfirmarCampus conflictos={conflictos} ocupado={asignar.isPending} onConfirmar={() => enviar(true)} />
            {persona ? <VistaPreviaAvisos avisos={avisos} que="la persona elegida es quien está asignando." /> : null}
          </>
        )}
      </section>
    </div>
  );
}
