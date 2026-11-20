/* Planeación y Seguimiento · Fase 2 · MIS TAREAS: lo que la persona tiene asignado en todas sus oficinas,
   en cuatro grupos: vencidas, próximas (14 días), más adelante y hechas. */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { useAct, useActividades, useMisAvances, useMoverActividad } from "./hooks";
import { ColaPorValidar } from "./Revisar";
import { BarraAvance, TarjetaAvance } from "./partesF3";
import { comparar } from "./filtros";
import { diasEntre, estadoPlazo, type Actividad } from "./modelo";
import { Banner, ChecklistMini, ChipEstado, ChipPlazo, MenuMover, MensajeRechazo, PrioridadAct } from "./partes";
import { SinOficinas } from "./vacios";

const GRUPOS = [
  { id: "vencidas", titulo: "Vencidas", vacio: "Ninguna vencida." },
  { id: "proximas", titulo: "Próximas (14 días)", vacio: "Nada vence en los próximos 14 días." },
  { id: "despues", titulo: "Más adelante", vacio: "Nada más adelante." },
  { id: "hechas", titulo: "Hechas", vacio: "Aún no ha cerrado ninguna." },
] as const;

export function MisTareas() {
  const a = useAct();
  const { ruta } = usePs();
  const q = useActividades(a.oficinas.map((o) => o.id));
  const mover = useMoverActividad();
  const mis = useMisAvances();
  const [rechazo, setRechazo] = useState<string | null>(null);
  const mias = useMemo(() => (q.data ?? []).filter((x) => a.yo && x.asignados.includes(a.yo)).sort(comparar), [q.data, a.yo]);
  if (a.cargando) return <LoadingBlock rows={4} label="Cargando sus tareas" />;
  if (!a.oficinas.length) return <SinOficinas />;
  if (q.isPending) return <LoadingBlock rows={4} label="Cargando sus tareas" />;
  const grupo = (x: Actividad) => (x.estado === "hecho" ? "hechas" : estadoPlazo(x, a.hoy) === "vencida" ? "vencidas" : x.fin && diasEntre(a.hoy, x.fin) <= 14 ? "proximas" : "despues");
  return (
    <div className="ps-seccion">
      {q.error ? <Banner tipo="error" rol="alert">No se pudieron leer las actividades: {(q.error as Error).message}</Banner> : null}
      <MensajeRechazo mensaje={rechazo} onCerrar={() => setRechazo(null)} />
      {a.oficinas.some((o) => o.poder === "gestor") ? <ColaPorValidar oficinaId={null} titulo="Por validar" /> : null}
      {(mis.data ?? []).filter((v) => v.estado === "devuelto").length ? (
        <section className="ps-tareas-grupo" aria-labelledby="tg-devueltos" data-grupo="devueltos">
          <h2 id="tg-devueltos">Avances devueltos <b className="ps-cubo__n">{(mis.data ?? []).filter((v) => v.estado === "devuelto").length}</b></h2>
          <p className="ps-sub">El gestor pidió correcciones. Léalas y reporte el avance de nuevo desde la actividad.</p>
          <div className="ps-avances">{(mis.data ?? []).filter((v) => v.estado === "devuelto").slice(0, 3).map((v) => <TarjetaAvance key={v.id} a={v}><div className="ps-botones"><Link className="button-secondary ps-btn-peq" to={ruta("actividad", v.actividadId)} state={DESDE_MODULO}>Abrir la actividad</Link></div></TarjetaAvance>)}</div>
        </section>
      ) : null}
      {mias.length === 0 ? (
        <EmptyBlock title="No tiene actividades asignadas" hint="Cuando el gestor de su oficina le asigne una, aparecerá aquí y recibirá un correo." />
      ) : (
        GRUPOS.map((g) => {
          const lista = mias.filter((x) => grupo(x) === g.id);
          return (
            <section key={g.id} className="ps-tareas-grupo" aria-labelledby={`tg-${g.id}`} data-grupo={g.id}>
              <h2 id={`tg-${g.id}`}>{g.titulo} <b className="ps-cubo__n">{lista.length}</b></h2>
              {lista.length === 0 ? <p className="ps-nota">{g.vacio}</p> : (
                <ul className="ps-tareas">
                  {lista.map((x) => (
                    <li key={x.id} className="ps-tarea">
                      <div className="ps-tarea__t">
                        <Link to={ruta("actividad", x.id)} state={DESDE_MODULO}>{x.titulo}</Link>
                        <em>{a.porId.get(x.oficinaId)?.nombre}{x.lineaNo ? ` · línea #${x.lineaNo}` : " · propia de la oficina"}</em>
                      </div>
                      <ChipEstado estado={x.estado} />
                      <ChipPlazo a={x} hoy={a.hoy} />
                      <PrioridadAct valor={x.prioridad} />
                      <ChecklistMini a={x} />
                      <BarraAvance avance={x.avance} compacta />
                      <MenuMover actividad={x} poder={a.poderDe(x.oficinaId)} yo={a.yo} compacto onMover={(estado) => { setRechazo(null); mover.mutate({ id: x.id, estado }, { onError: (e) => setRechazo((e as Error).message) }); }} onRechazo={setRechazo} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
