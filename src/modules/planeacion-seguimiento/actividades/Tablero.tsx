/* =============================================================================
   Planeación y Seguimiento · Fase 2 · TABLERO tipo Planner.

   Cubos: Por iniciar · En curso · En riesgo · En revisión · Hecho. Agrupa por estado,
   persona, línea, prioridad o campus. Arrastrar y soltar con Pointer Events (ratón y
   lápiz desde toda la tarjeta; el tacto, desde el asa, para que las columnas sigan
   deslizándose) Y, siempre, el menú «Mover a…» que funciona con teclado y en el móvil.
   Los permisos son los de reglas.ts (colaborador: solo las suyas y hasta «En revisión»;
   gestor: las de su oficina). Rechazos con el motivo en línea.
   Movimiento: solo el asentado de la tarjeta soltada (GSAP, 220 ms); lo del teclado no se anima.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { EmptyBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { usePs } from "../contexto";
import { DESDE_MODULO } from "../marco/PaginaCompleta";
import { BarraActividades, useDatosActividades } from "./barra";
import { agrupar, type Columna } from "./filtros";
import { useAsignar, useEquipo, useMoverActividad } from "./hooks";
import { ROTULO_PODER, type Actividad, type EstadoAct, type Poder } from "./modelo";
import { asentarTarjeta, devolverTarjeta } from "./movimientoAct";
import { Avatar, Banner, ChecklistMini, ChipEstado, ChipPlazo, GlifoEstado, MenuMover, MensajeRechazo, PilaAvatares, PrioridadAct } from "./partes";
import { avisoAsignacion, puedeMover } from "./reglas";
import { SinOficinas } from "./vacios";
import { DEF_ESTADOS } from "./modelo";

const UMBRAL = 5;

interface Arrastre {
  act: Actividad;
  col: string;
  el: HTMLElement;
  x0: number;
  y0: number;
  x: number;
  y: number;
  activo: boolean;
  raf: number;
}

export function Tablero() {
  const d = useDatosActividades();
  const { ruta, ir } = usePs();
  const mover = useMoverActividad();
  const asignar = useAsignar();
  const equipoQ = useEquipo(d.f.alcance === "mi" ? (d.oficina?.id ?? null) : null);
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const cubos = useRef<HTMLDivElement>(null);
  const arr = useRef<Arrastre | null>(null);
  const asentar = useRef<{ id: string; col: string; rect: DOMRect } | null>(null);
  const sobreRef = useRef<string | null>(null);
  const swallow = useRef(false);
  const por = d.f.agrupar;
  const arrastrable = por === "estado" || por === "persona";

  const columnas: Columna[] = agrupar(d.filtradas, por, {
    nombreDe: d.nombreDe,
    nombreLinea: d.nombreLinea,
    personas: (equipoQ.data ?? []).filter((m) => m.asignable).map((m) => m.id),
    campus: ["Bucaramanga", "Valledupar", "Cúcuta", "Todos"],
    lineas: [],
  });

  // Asentado: cuando la tarjeta aparece en su cubo nuevo, llega desde donde se soltó (solo si se soltó con el puntero).
  useLayoutEffect(() => {
    const s = asentar.current;
    if (!s) return;
    const el = cubos.current?.querySelector<HTMLElement>(`[data-tarjeta="${s.id}"][data-col="${CSS.escape(s.col)}"]`);
    if (!el) return;
    asentar.current = null;
    asentarTarjeta(el, s.rect);
  });

  const manejadores = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: () => void } | null>(null);
  function limpiar() {
    const a = arr.current;
    if (a) {
      cancelAnimationFrame(a.raf);
      a.el.classList.remove("ps-tarjeta--en-vuelo");
    }
    document.body.classList.remove("ps-arrastrando");
    const h = manejadores.current;
    if (h) {
      window.removeEventListener("pointermove", h.move);
      window.removeEventListener("pointerup", h.up);
      window.removeEventListener("pointercancel", h.cancel);
      manejadores.current = null;
    }
    sobreRef.current = null;
    setSobre(null);
    arr.current = null;
  }
  const limpiarRef = useRef(limpiar);
  limpiarRef.current = limpiar;

  const columnaBajo = (x: number, y: number, el: HTMLElement): string | null => {
    el.style.pointerEvents = "none";
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-columna]");
    el.style.pointerEvents = "";
    return hit?.dataset.columna ?? null;
  };

  const ciclo = () => {
    const a = arr.current;
    if (!a || !a.activo) return;
    const c = cubos.current;
    if (c) {
      const r = c.getBoundingClientRect();
      const borde = 56;
      if (a.x < r.left + borde) c.scrollLeft -= 14;
      else if (a.x > r.right - borde) c.scrollLeft += 14;
    }
    a.raf = requestAnimationFrame(ciclo);
  };

  const mover_ = (e: PointerEvent) => {
    const a = arr.current;
    if (!a) return;
    a.x = e.clientX;
    a.y = e.clientY;
    const dx = e.clientX - a.x0;
    const dy = e.clientY - a.y0;
    if (!a.activo) {
      if (Math.hypot(dx, dy) < UMBRAL) return;
      a.activo = true;
      swallow.current = true;
      a.el.classList.add("ps-tarjeta--en-vuelo");
      document.body.classList.add("ps-arrastrando");
      a.raf = requestAnimationFrame(ciclo);
    }
    a.el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    const col = columnaBajo(e.clientX, e.clientY, a.el);
    if (col !== sobreRef.current) {
      sobreRef.current = col;
      setSobre(col);
    }
  };
  const cancelar_ = () => {
    const a = arr.current;
    if (a?.activo) devolverTarjeta(a.el);
    limpiar();
  };
  const soltar_ = (e: PointerEvent) => {
    const a = arr.current;
    if (!a) return;
    if (!a.activo) return limpiar();
    const destino = columnaBajo(e.clientX, e.clientY, a.el);
    const rect = a.el.getBoundingClientRect();
    const { act, col, el } = a;
    limpiar();
    window.setTimeout(() => (swallow.current = false), 0);
    if (!destino || destino === col) return devolverTarjeta(el);
    decidir(act, col, destino, el, rect);
  };

  function decidir(act: Actividad, desde: string, destino: string, el: HTMLElement, rect: DOMRect) {
    setRechazo(null);
    setAnuncio(null);
    const poder = d.poderDe(act.oficinaId);
    if (por === "estado") {
      const dec = puedeMover(poder, act, destino as EstadoAct, d.yo);
      if (!dec.ok) {
        devolverTarjeta(el);
        return setRechazo(dec.motivo);
      }
      // FASE 3: al soltar en «En revisión» (colaborador) o «Hecho» (gestor) se abrirá el reporte de avance a pantalla completa.
      el.style.transform = "";
      asentar.current = { id: act.id, col: destino, rect };
      mover.mutate({ id: act.id, estado: destino as EstadoAct }, { onSuccess: () => setAnuncio(`«${act.titulo}» pasó a ${DEF_ESTADOS[destino as EstadoAct].nombre}.`), onError: (er) => { asentar.current = null; setRechazo((er as Error).message); } });
      return;
    }
    // Por persona: solo el gestor reparte; de «Sin responsable» a una persona se asigna; de una persona a otra se transfiere (pide motivo).
    const rechazar = (m: string) => { devolverTarjeta(el); setRechazo(m); };
    if (poder !== "gestor") return rechazar(`Con acceso de ${ROTULO_PODER[poder].toLowerCase()} no puede repartir actividades: lo hace el gestor de la oficina.`);
    if (destino === "__sin__") return rechazar("Para quitarle una actividad a alguien se usa «Transferir» (pide un motivo), no soltarla en «Sin responsable».");
    if (act.asignados.includes(destino)) return rechazar(`${d.nombreDe(destino)} ya tiene asignada esta actividad.`);
    if (desde === "__sin__") {
      el.style.transform = "";
      asentar.current = { id: act.id, col: destino, rect };
      const equipo = equipoQ.data ?? [];
      asignar.mutate({ ids: [act.id], personaId: destino }, {
        onSuccess: () => { const n = avisoAsignacion([destino], equipo, d.yo).length; setAnuncio(`Se asignó «${act.titulo}» a ${d.nombreDe(destino)}.${n ? ` Se avisará a ${n} ${n === 1 ? "persona" : "personas"} por correo.` : ""}`); },
        onError: (er) => { asentar.current = null; setRechazo((er as Error).message); },
      });
      return;
    }
    devolverTarjeta(el);
    ir(`${ruta("transferir", act.id)}?de=${encodeURIComponent(desde)}&a=${encodeURIComponent(destino)}`);
  }

  const alPulsar = (e: React.PointerEvent<HTMLElement>, act: Actividad, col: string) => {
    if (!arrastrable) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const t = e.target as HTMLElement;
    const asa = t.closest("[data-asa]");
    if (t.closest("a,button,select,input,textarea,[role=menu]") && !asa) return;
    if (e.pointerType !== "mouse" && !asa) return;
    if (por === "persona" && d.poderDe(act.oficinaId) !== "gestor") return;
    if (arr.current) return;
    arr.current = { act, col, el: e.currentTarget, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, activo: false, raf: 0 };
    manejadores.current = { move: mover_, up: soltar_, cancel: cancelar_ };
    window.addEventListener("pointermove", mover_);
    window.addEventListener("pointerup", soltar_);
    window.addEventListener("pointercancel", cancelar_);
  };
  useEffect(() => () => limpiarRef.current(), []);

  if (d.cargando) return <LoadingBlock rows={4} label="Cargando el tablero" />;
  if (!d.oficinas.length) return <SinOficinas />;
  const poderAqui: Poder | null = d.f.alcance === "mi" && d.oficina ? d.oficina.poder : null;
  const total = d.filtradas.length;

  return (
    <div className="ps-seccion">
      <BarraActividades d={d} agrupar />
      <div className="ps-permisos-nota" role="note">
        <Icon name="shield" size={15} />
        <p>
          {poderAqui === "gestor" && <>Usted es <strong>gestor</strong> en {d.oficina?.nombre}: mueve cualquier actividad de la oficina, y pasar a «Hecho» lo hace usted directamente.</>}
          {poderAqui === "colaborador" && <>Usted es <strong>colaborador</strong> en {d.oficina?.nombre}: mueve solo las actividades que tiene asignadas y solo hasta «En revisión».</>}
          {poderAqui === "lector" && <>Usted es <strong>lector</strong> en {d.oficina?.nombre}: puede mirar el tablero, no moverlo.</>}
          {poderAqui === "ninguno" && <>No tiene permisos para operar en {d.oficina?.nombre}.</>}
          {poderAqui === null && <>Lo que puede mover depende de su permiso en la oficina de cada actividad.</>}
          {" "}{arrastrable ? "Arrastre una tarjeta o use «Mover a…» (también con teclado)." : "Para mover tarjetas, agrupe por Estado o Persona; con «Mover a…» siempre puede cambiar el estado."}
        </p>
      </div>
      <MensajeRechazo mensaje={rechazo} onCerrar={() => setRechazo(null)} />
      <p className="sr-only" role="status" aria-live="polite">{anuncio ?? ""}</p>
      {anuncio ? <Banner tipo="ok">{anuncio} <button type="button" className="ps-enlace" onClick={() => setAnuncio(null)}>Cerrar</button></Banner> : null}
      {d.errorActs ? <Banner tipo="error" rol="alert">No se pudieron leer las actividades: {d.errorActs.message}</Banner> : null}
      {d.cargandoActs ? <LoadingBlock rows={3} label="Cargando actividades" /> : d.todas.length === 0 ? (
        <EmptyBlock title="Tu oficina aún no tiene planificación" hint="Crea la primera actividad o impórtala desde Excel." />
      ) : (
        <>
          <p className="ps-contador-act" aria-live="polite">{total} {total === 1 ? "actividad" : "actividades"}{d.f.q || d.f.mias ? " con estos filtros" : ""}.</p>
          <div className="ps-cubos" ref={cubos} role="group" aria-label={`Tablero agrupado por ${por}`} data-agrupar={por}>
            {columnas.map((c) => (
              <section key={c.id} className="ps-cubo" data-columna={c.id} data-sobre={sobre === c.id || undefined} aria-labelledby={`cubo-${c.id}`}>
                <header className="ps-cubo__cab">
                  <h3 id={`cubo-${c.id}`}>
                    {c.estado ? <GlifoEstado estado={c.estado} /> : c.persona ? <Avatar nombre={c.titulo} tam={20} /> : null}
                    <span>{c.titulo}</span>
                  </h3>
                  <b className="ps-cubo__n" aria-label={`${c.acts.length} actividades`}>{c.acts.length}</b>
                </header>
                {c.ayuda ? <p className="ps-cubo__ayuda">{c.ayuda}</p> : null}
                <ul className="ps-cubo__lista">
                  {c.acts.map((a) => (
                    <li key={a.id} className="ps-tarjeta" data-tarjeta={a.id} data-col={c.id} data-vuelo-ok={arrastrable || undefined} onPointerDown={(e) => alPulsar(e, a, c.id)} onClickCapture={(e) => { if (swallow.current) { e.preventDefault(); e.stopPropagation(); } }}>
                      <Tarjeta a={a} d={d} mostrarEstado={por !== "estado"} arrastrable={arrastrable} detalle={ruta("actividad", a.id)} onMover={(estado) => { setRechazo(null); mover.mutate({ id: a.id, estado }, { onSuccess: () => setAnuncio(`«${a.titulo}» pasó a ${DEF_ESTADOS[estado].nombre}.`), onError: (er) => setRechazo((er as Error).message) }); }} onRechazo={(m) => { setAnuncio(null); setRechazo(m); }} />
                    </li>
                  ))}
                  {c.acts.length === 0 ? <li className="ps-cubo__vacio">{sobre === c.id ? "Suelte aquí" : "Nada por ahora."}</li> : null}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type Datos = ReturnType<typeof useDatosActividades>;

function Tarjeta({ a, d, mostrarEstado, arrastrable, detalle, onMover, onRechazo }: { a: Actividad; d: Datos; mostrarEstado: boolean; arrastrable: boolean; detalle: string; onMover: (e: EstadoAct) => void; onRechazo: (m: string) => void }) {
  const oficina = d.porId.get(a.oficinaId);
  return (
    <article className="ps-tarjeta__in" aria-label={a.titulo}>
      <div className="ps-tarjeta__cab">
        <span className="ps-tarjeta__linea">{a.lineaNo ? d.nombreLinea(a.lineaNo) : "Actividad propia de la oficina"}</span>
        {arrastrable ? <span className="ps-asa" data-asa aria-hidden="true"><Icon name="grip" size={14} /></span> : null}
      </div>
      <Link to={detalle} state={DESDE_MODULO} className="ps-tarjeta__titulo">{a.titulo}</Link>
      {d.f.alcance === "todas" ? <p className="ps-tarjeta__oficina">{oficina?.nombre ?? "Oficina"}</p> : null}
      <div className="ps-tarjeta__fila">
        <PrioridadAct valor={a.prioridad} />
        <ChipPlazo a={a} hoy={d.hoy} />
      </div>
      <div className="ps-tarjeta__fila">
        <PilaAvatares ids={a.asignados} personas={d.personas} />
        <ChecklistMini a={a} />
      </div>
      <div className="ps-tarjeta__pie">
        {mostrarEstado ? <ChipEstado estado={a.estado} /> : <span />}
        <MenuMover actividad={a} poder={d.poderDe(a.oficinaId)} yo={d.yo} onMover={onMover} onRechazo={onRechazo} compacto />
      </div>
    </article>
  );
}
