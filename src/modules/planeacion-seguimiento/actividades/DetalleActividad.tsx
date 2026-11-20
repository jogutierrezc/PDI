/* =============================================================================
   Planeación y Seguimiento · Fase 2 · DETALLE DE UNA ACTIVIDAD, a pantalla completa (ruta propia).
   «Regresar» vuelve al tablero o a la lista tal como estaban (filtros y posición).
   Pestañas: Resumen · Avances · Evidencias · Riesgos y acciones · Comentarios · Checklist · Asignaciones · Historial.
   (Fase 3: avances, evidencias con descarga por URL firmada, riesgos con acciones, comentarios y la conexión con el PDI.)
   ========================================================================== */

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { DESDE_MODULO, PaginaCompleta } from "../marco/PaginaCompleta";
import { fecha, rotuloCampus } from "../modelo";
import { useAct, useActividad, useAgregarItem, useMarcarChecklist, useMoverActividad } from "./hooks";
import { ROTULO_PODER, progresoChecklist, type EventoActividad } from "./modelo";
import { Avatar, Banner, ChipEstado, ChipPlazo, MenuMover, MensajeRechazo, PrioridadAct } from "./partes";
import { PanelAvances, PanelComentarios, PanelEvidencias, PanelRiesgos } from "./PestanasDetalle";
import { BarraAvance, ChipPdi } from "./partesF3";
import { PanelPresupuestoLinea } from "../vaf/PanelPresupuestoLinea";
import { puedeEditar, puedeMarcarChecklist, puedeTransferir } from "./reglas";

const PESTANAS = [
  { id: "resumen", texto: "Resumen" },
  { id: "avances", texto: "Avances" },
  { id: "evidencias", texto: "Evidencias" },
  { id: "riesgos", texto: "Riesgos y acciones" },
  { id: "comentarios", texto: "Comentarios" },
  { id: "checklist", texto: "Checklist" },
  { id: "asignaciones", texto: "Asignaciones" },
  { id: "historial", texto: "Historial" },
] as const;

const hora = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fecha(iso) : `${fecha(iso)}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

function LineaDeTiempo({ eventos }: { eventos: EventoActividad[] }) {
  if (!eventos.length) return <p className="ps-nota">Aún no hay movimientos.</p>;
  return (
    <ol className="ps-historial">
      {eventos.map((e) => (
        <li key={e.id}>
          <span className="ps-historial__f">{hora(e.en)}</span>
          <span className="ps-historial__d"><strong>{e.por}</strong> · {e.detalle}{e.motivo ? <blockquote>Motivo: {e.motivo}</blockquote> : null}</span>
        </li>
      ))}
    </ol>
  );
}

export function DetalleActividad({ id }: { id: string }) {
  const { ruta } = usePs();
  const a = useAct();
  const q = useActividad(id);
  const mover = useMoverActividad();
  const marcar = useMarcarChecklist();
  const agregar = useAgregarItem();
  const [params, setParams] = useSearchParams();
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pestana = PESTANAS.find((p) => p.id === params.get("pestana"))?.id ?? "resumen";
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Tablero", a: ruta("tablero") }];

  if (a.cargando || q.isPending) return <PaginaCompleta titulo="Actividad" migas={[...migas, { texto: "Actividad" }]} regresarA={ruta("tablero")}><LoadingBlock rows={4} label="Cargando la actividad" /></PaginaCompleta>;
  if (q.error || !q.data) {
    return <PaginaCompleta titulo="No encuentro esa actividad" migas={[...migas, { texto: "Actividad" }]} regresarA={ruta("tablero")} regresarTexto="Regresar al tablero"><Banner tipo="error" rol="alert">{(q.error as Error | null)?.message ?? "Esa actividad no existe o no puede verla."} Puede que la dirección esté mal escrita o que sea de una oficina que usted no ve.</Banner></PaginaCompleta>;
  }
  const { actividad: x, eventos } = q.data;
  const det = q.data;
  const abiertos = det.riesgos.filter((r) => r.estado !== "cerrado").length;
  const oficina = a.porId.get(x.oficinaId);
  const poder = a.poderDe(x.oficinaId);
  const cl = progresoChecklist(x);
  const puedeCheck = puedeMarcarChecklist(poder, x, a.yo);
  const cambiar = (p: string) => {
    const s = new URLSearchParams(params);
    if (p === "resumen") s.delete("pestana");
    else s.set("pestana", p);
    setParams(s, { replace: true, state: DESDE_MODULO });
  };
  const alTeclear = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const sig = PESTANAS[(i + d + PESTANAS.length) % PESTANAS.length].id;
    cambiar(sig);
    refs.current[sig]?.focus();
  };
  const asignaciones = eventos.filter((e) => e.tipo === "asignada" || e.tipo === "quitada" || e.tipo === "transferida");
  const ficha: [string, React.ReactNode][] = [
    ["Oficina", oficina?.nombre ?? "—"],
    ["Línea del plan", x.lineaNo ? <Link to={ruta("proyectos", x.lineaNo)} state={DESDE_MODULO}>#{x.lineaNo}</Link> : <em>Actividad propia de la oficina</em>],
    [x.esHito ? "Fecha del hito" : "Fechas", x.esHito ? fecha(x.fin) : `${fecha(x.inicio)} a ${fecha(x.fin)}`],
    ["Campus", rotuloCampus(x.campus)],
    ["Creada", `${fecha(x.creadaEn)} por ${a.nombreDe(x.creadaPor)}`],
    ["Su permiso aquí", `${ROTULO_PODER[poder]}${oficina?.papel ? "" : ""}`],
  ];
  return (
    <PaginaCompleta
      titulo={x.titulo}
      subtitulo={<>{oficina?.nombre}{x.lineaNo ? ` · línea #${x.lineaNo}` : " · propia de la oficina"}</>}
      migas={[...migas, { texto: "Actividad" }]}
      regresarA={ruta("tablero")}
      regresarTexto="Regresar"
      claveFoco={x.id}
      acciones={
        <>
          <MenuMover actividad={x} poder={poder} yo={a.yo} etiqueta="Mover a…" onMover={(estado) => { setRechazo(null); mover.mutate({ id: x.id, estado }, { onError: (e) => setRechazo((e as Error).message) }); }} onRechazo={setRechazo} />
          {puedeEditar(poder) ? <Link className="button-secondary" to={`${ruta("actividad-editar", x.id)}?oficina=${encodeURIComponent(x.oficinaId)}`} state={DESDE_MODULO}><Icon name="pen" size={14} /> Editar</Link> : null}
          {puedeTransferir(poder) && x.asignados.length ? <Link className="button-secondary" to={ruta("transferir", x.id)} state={DESDE_MODULO}>Transferir…</Link> : null}
        </>
      }
    >
      <MensajeRechazo mensaje={rechazo} onCerrar={() => setRechazo(null)} />
      <div className="ps-fila-act ps-fila-act--ficha"><ChipEstado estado={x.estado} /><ChipPlazo a={x} hoy={a.hoy} /><PrioridadAct valor={x.prioridad} /><BarraAvance avance={x.avance} compacta /><ChipPdi pdi={x.pdi} /></div>
      <div className="ps-pestanas" role="tablist" aria-label="Secciones de la actividad">
        {PESTANAS.map((p, i) => (
          <button key={p.id} ref={(el) => void (refs.current[p.id] = el)} type="button" role="tab" id={`pest-${p.id}`} aria-selected={pestana === p.id} aria-controls="pest-panel" tabIndex={pestana === p.id ? 0 : -1} onClick={() => cambiar(p.id)} onKeyDown={(e) => alTeclear(e, i)}>
            {p.texto}{p.id === "checklist" && cl.total ? ` (${cl.hechos}/${cl.total})` : ""}{p.id === "avances" && det.avances.length ? ` (${det.avances.length})` : ""}{p.id === "riesgos" && abiertos ? ` (${abiertos})` : ""}
          </button>
        ))}
      </div>
      <div id="pest-panel" role="tabpanel" aria-labelledby={`pest-${pestana}`} className="ps-pestana-panel">
        {pestana === "resumen" ? (
          <>
            {x.descripcion ? <p className="ps-descripcion">{x.descripcion}</p> : <p className="ps-nota">Esta actividad no trae descripción.</p>}
            <dl className="ps-ficha">
              {ficha.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              <div><dt>Avance validado</dt><dd><BarraAvance avance={x.avance} />{x.avance.financiero !== null ? <small className="ps-nota"> · financiero {x.avance.financiero} %</small> : null}</dd></div>
              <div><dt>Plan de Desarrollo Institucional</dt><dd>{x.pdi.conexion === "con_pdi" ? <ul className="ps-pdi-lista">{x.pdi.items.map((i) => <li key={`${i.pillarId}-${i.lineaId}`}><strong>{i.pilar}</strong>{i.linea ? <span>{i.area ? `${i.area} · ` : ""}{i.lineaCodigo} {i.linea}</span> : <span>Pilar completo</span>}</li>)}</ul> : x.pdi.conexion === "sin_pdi" ? "No tiene conexión con el PDI." : <em>Sin definir (es anterior a este dato).{puedeEditar(poder) ? " Edite la actividad para definirlo." : ""}</em>}</dd></div>
              <div><dt>Responsables</dt><dd>{x.asignados.length ? <ul className="ps-resp">{x.asignados.map((p) => <li key={p}><Avatar nombre={a.nombreDe(p)} tam={22} /> {a.nombreDe(p)}</li>)}</ul> : <em>Sin responsable</em>}</dd></div>
            </dl>
            {x.lineaNo ? <PanelPresupuestoLinea no={x.lineaNo} /> : null}
          </>
        ) : null}
        {pestana === "avances" ? <PanelAvances x={x} det={det} poder={poder} /> : null}
        {pestana === "evidencias" ? <PanelEvidencias det={det} /> : null}
        {pestana === "riesgos" ? <PanelRiesgos x={x} det={det} poder={poder} /> : null}
        {pestana === "comentarios" ? <PanelComentarios x={x} det={det} poder={poder} /> : null}
        {pestana === "checklist" ? (
          <>
            {cl.total ? <p className="ps-sub" role="status">{cl.hechos} de {cl.total} elementos hechos.</p> : <p className="ps-nota">La actividad no tiene checklist.{puedeEditar(poder) ? " Agregue el primer elemento." : ""}</p>}
            {cl.total ? (
              <ul className="ps-checklist">
                {x.checklist.map((i) => (
                  <li key={i.id}>
                    <label className="ps-opcion">
                      <input type="checkbox" checked={i.hecho} disabled={!puedeCheck || marcar.isPending} onChange={(e) => marcar.mutate({ id: x.id, item: i.id, hecho: e.target.checked }, { onError: (er) => setRechazo((er as Error).message) })} />
                      <span data-hecho={i.hecho || undefined}>{i.texto}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
            {!puedeCheck && cl.total ? <p className="ps-nota"><Icon name="lock" size={13} /> {poder === "lector" ? "Con acceso de lector solo puede mirar el checklist." : "Solo las personas asignadas y el gestor marcan el checklist."}</p> : null}
            {puedeEditar(poder) ? (
              <form className="ps-agregar" onSubmit={(e) => { e.preventDefault(); if (nuevo.trim().length >= 2) agregar.mutate({ id: x.id, texto: nuevo }, { onSuccess: () => setNuevo("") }); }}>
                <label htmlFor="nuevo-item">Agregar un elemento</label>
                <div><input id="nuevo-item" type="text" value={nuevo} onChange={(e) => setNuevo(e.target.value)} maxLength={200} autoComplete="off" /><button type="submit" className="button-secondary" disabled={nuevo.trim().length < 2 || agregar.isPending}>Agregar</button></div>
                {agregar.error ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {(agregar.error as Error).message}</p> : null}
              </form>
            ) : null}
          </>
        ) : null}
        {pestana === "asignaciones" ? (
          <>
            <h3>Quién la tiene ahora</h3>
            {x.asignados.length ? <ul className="ps-resp ps-resp--grande">{x.asignados.map((p) => <li key={p}><Avatar nombre={a.nombreDe(p)} tam={28} /> <span><strong>{a.nombreDe(p)}</strong><em>{a.personas.get(p)?.correo}</em></span></li>)}</ul> : <p className="ps-nota">Nadie. {puedeTransferir(poder) ? <Link to={`${ruta("asignar")}?oficina=${encodeURIComponent(x.oficinaId)}`} state={DESDE_MODULO}>Asignarla desde «Asignar»</Link> : "El gestor de la oficina la reparte."}</p>}
            <h3>Historial de asignaciones y transferencias</h3>
            <LineaDeTiempo eventos={[...asignaciones].reverse()} />
          </>
        ) : null}
        {pestana === "historial" ? <LineaDeTiempo eventos={[...eventos].reverse()} /> : null}
      </div>
    </PaginaCompleta>
  );
}
