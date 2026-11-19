/* Planeación y Seguimiento · Fase 2 · LISTA ordenable de actividades (en móvil cada fila es una tarjeta). */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { EmptyBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { BarraActividades, useDatosActividades } from "./barra";
import { ordenarLista, type ColumnaLista, type OrdenLista } from "./filtros";
import { useMoverActividad } from "./hooks";
import { Banner, ChecklistMini, ChipEstado, ChipPlazo, MenuMover, MensajeRechazo, PilaAvatares, PrioridadAct } from "./partes";
import { SinOficinas } from "./vacios";

const COLUMNAS: { id: ColumnaLista; texto: string }[] = [
  { id: "titulo", texto: "Actividad" },
  { id: "linea", texto: "Línea" },
  { id: "responsable", texto: "Responsables" },
  { id: "estado", texto: "Estado" },
  { id: "fin", texto: "Fecha límite" },
  { id: "prioridad", texto: "Prioridad" },
];

export function Lista() {
  const d = useDatosActividades();
  const { ruta } = usePs();
  const [params, setParams] = useSearchParams();
  const mover = useMoverActividad();
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [col, dir] = (params.get("orden") ?? "fin:asc").split(":");
  const orden: OrdenLista = { col: (COLUMNAS.some((c) => c.id === col) ? col : "fin") as ColumnaLista, dir: dir === "desc" ? "desc" : "asc" };
  const ordenar = (c: ColumnaLista) => {
    const s = new URLSearchParams(params);
    s.set("orden", `${c}:${orden.col === c && orden.dir === "asc" ? "desc" : "asc"}`);
    setParams(s, { replace: true });
  };
  if (d.cargando) return <LoadingBlock rows={4} label="Cargando la lista" />;
  if (!d.oficinas.length) return <SinOficinas />;
  const filas = ordenarLista(d.filtradas, orden, { nombreDe: d.nombreDe, nombreLinea: d.nombreLinea, nombreOficina: (id) => d.porId.get(id)?.nombre ?? "" });
  return (
    <div className="ps-seccion">
      <BarraActividades d={d} />
      <MensajeRechazo mensaje={rechazo} onCerrar={() => setRechazo(null)} />
      {d.errorActs ? <Banner tipo="error" rol="alert">No se pudieron leer las actividades: {d.errorActs.message}</Banner> : null}
      {d.cargandoActs ? <LoadingBlock rows={4} label="Cargando actividades" /> : d.todas.length === 0 ? (
        <EmptyBlock title="Tu oficina aún no tiene planificación" hint="Crea la primera actividad o impórtala desde Excel." />
      ) : (
        <>
          <p className="ps-contador-act" aria-live="polite">{filas.length} {filas.length === 1 ? "actividad" : "actividades"}. Ordenadas por {COLUMNAS.find((c) => c.id === orden.col)?.texto.toLowerCase()} ({orden.dir === "asc" ? "de menor a mayor" : "de mayor a menor"}).</p>
          <div className="ps-tabla ps-lista-act" role="table" aria-label="Actividades">
            <div className="ps-tabla__fila ps-tabla__cab" role="row">
              {COLUMNAS.map((c) => (
                <span role="columnheader" key={c.id} aria-sort={orden.col === c.id ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="ps-orden" onClick={() => ordenar(c.id)}>{c.texto}{orden.col === c.id ? <Icon name="sort-asc" size={12} /> : null}</button>
                </span>
              ))}
              <span role="columnheader"><span className="sr-only">Acciones</span></span>
            </div>
            {filas.map((a) => (
              <div className="ps-tabla__fila" role="row" key={a.id}>
                <span role="cell" className="ps-tabla__t"><Link to={ruta("actividad", a.id)} state={DESDE_MODULO}>{a.titulo}</Link><em>{d.f.alcance === "todas" ? `${d.porId.get(a.oficinaId)?.nombre ?? ""} · ` : ""}<ChecklistMini a={a} /></em></span>
                <span role="cell" data-l="Línea">{a.lineaNo ? d.nombreLinea(a.lineaNo) : "Propia de la oficina"}</span>
                <span role="cell" data-l="Responsables"><PilaAvatares ids={a.asignados} personas={d.personas} /></span>
                <span role="cell" data-l="Estado"><ChipEstado estado={a.estado} /></span>
                <span role="cell" data-l="Fecha límite"><ChipPlazo a={a} hoy={d.hoy} /></span>
                <span role="cell" data-l="Prioridad"><PrioridadAct valor={a.prioridad} /></span>
                <span role="cell" className="ps-lista-act__acc"><MenuMover actividad={a} poder={d.poderDe(a.oficinaId)} yo={d.yo} compacto onMover={(estado) => { setRechazo(null); mover.mutate({ id: a.id, estado }, { onError: (e) => setRechazo((e as Error).message) }); }} onRechazo={setRechazo} /></span>
              </div>
            ))}
            {filas.length === 0 ? <p className="ps-nota ps-lista-act__vacio">Ninguna actividad coincide con la búsqueda.</p> : null}
          </div>
        </>
      )}
    </div>
  );
}
