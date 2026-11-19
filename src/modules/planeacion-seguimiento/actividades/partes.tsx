/* =============================================================================
   Planeación y Seguimiento · Fase 2 · piezas compartidas de las pantallas de
   actividades: estado con glifo y texto, avatares, prioridad, plazo, checklist,
   selector de oficina, menú «Mover a…» (la alternativa de teclado y móvil al
   arrastre) y la vista previa de a quién se avisa.
   ========================================================================== */

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { DEF_ESTADOS, ESTADOS, PRIORIDADES_ACT, estadoPlazo, iniciales, progresoChecklist, rangoPrioridad, textoPlazo, type Actividad, type AvisoPrevio, type EstadoAct, type MiembroEquipo, type OficinaVista, type Poder } from "./modelo";
import { ROTULO_AVISO, destinosPosibles, requiereNotaDevolucion } from "./reglas";
import type { ConflictoCampus, PersonaRef } from "./contratoApi";
import { usePs } from "../contexto";

/* ---------- Estado ---------- */

/** Un glifo dibujado por estado: la forma cambia, no solo el color. */
export function GlifoEstado({ estado, size = 14 }: { estado: EstadoAct; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true, focusable: false } as const;
  switch (estado) {
    case "por_iniciar": return <svg {...p}><circle cx="8" cy="8" r="5.5" /></svg>;
    case "en_curso": return <svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" /></svg>;
    case "en_riesgo": return <svg {...p} strokeLinejoin="round"><path d="M8 2 14.2 13H1.8z" /><path d="M8 6.4v3.2M8 11.3v.2" strokeLinecap="round" /></svg>;
    case "en_revision": return <svg {...p} strokeLinejoin="round"><path d="M8 1.8 14.2 8 8 14.2 1.8 8z" /><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" /></svg>;
    case "hecho": return <svg {...p} strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="5.8" fill="currentColor" fillOpacity=".16" /><path d="m5.2 8.2 2 2 3.6-4" /></svg>;
  }
}

export function ChipEstado({ estado }: { estado: EstadoAct }) {
  const d = DEF_ESTADOS[estado];
  return <span className="ps-est" data-tono={d.tono}><GlifoEstado estado={estado} />{d.nombre}</span>;
}

export function ChipPlazo({ a, hoy }: { a: Pick<Actividad, "estado" | "fin" | "esHito">; hoy: string }) {
  const p = estadoPlazo(a, hoy);
  const t = textoPlazo(a, hoy);
  return (
    <span className="ps-plazo" data-p={p}>
      {p === "vencida" ? <Icon name="alert" size={13} /> : p === "hecha" ? <Icon name="check" size={13} /> : <Icon name="clock" size={13} />}
      <span>{a.esHito ? "Hito · " : ""}{t}</span>
    </span>
  );
}

export const PrioridadAct = ({ valor }: { valor: string }) => (
  <span className="ps-prio" data-n={rangoPrioridad(valor)}><i aria-hidden="true" />{valor}</span>
);
export { PRIORIDADES_ACT, ESTADOS };

/* ---------- Personas ---------- */

export function Avatar({ nombre, tam = 26 }: { nombre: string; tam?: number }) {
  return <span className="ps-avatar" style={{ width: tam, height: tam }} title={nombre} aria-hidden="true">{iniciales(nombre)}</span>;
}

export function PilaAvatares({ ids, personas, max = 3 }: { ids: string[]; personas: Map<string, PersonaRef>; max?: number }) {
  if (!ids.length) return <span className="ps-sin-resp"><Icon name="user" size={13} /> Sin responsable</span>;
  const nombres = ids.map((id) => personas.get(id)?.nombre ?? "Persona sin nombre");
  return (
    <span className="ps-pila">
      <span className="ps-pila__av" aria-hidden="true">
        {nombres.slice(0, max).map((n, i) => <Avatar key={i} nombre={n} />)}
        {nombres.length > max ? <span className="ps-avatar ps-avatar--mas" style={{ width: 26, height: 26 }}>+{nombres.length - max}</span> : null}
      </span>
      <span className="sr-only">Asignada a {nombres.join(", ")}</span>
      <span className="ps-pila__txt" aria-hidden="true">{nombres.length === 1 ? nombres[0] : `${nombres.length} personas`}</span>
    </span>
  );
}

export function ChecklistMini({ a }: { a: Pick<Actividad, "checklist"> }) {
  const { hechos, total } = progresoChecklist(a);
  if (!total) return null;
  return (
    <span className="ps-check-mini" aria-label={`Checklist: ${hechos} de ${total}`}>
      <Icon name="clipboard" size={13} /> {hechos}/{total}
    </span>
  );
}

/* ---------- Avisos por correo (los envía el servidor) ---------- */

export function VistaPreviaAvisos({ avisos, que }: { avisos: AvisoPrevio[]; que: string }) {
  if (!avisos.length) return <div className="ps-previa-avisos"><p><Icon name="mail" size={14} /> <span>No se avisará a nadie por correo: {que}</span></p></div>;
  return (
    <div className="ps-previa-avisos">
      <p><Icon name="mail" size={14} /> <span><strong>Se avisará a {avisos.length} {avisos.length === 1 ? "persona" : "personas"}</strong> por correo. Lo envía el servidor, no esta pantalla.</span></p>
      <ul>
        {avisos.map((a) => (
          <li key={`${a.personaId}-${a.motivo}`}><Avatar nombre={a.nombre} tam={22} /> <span><b>{a.nombre}</b> {a.correo ? <em>{a.correo}</em> : null}</span> <small>{ROTULO_AVISO[a.motivo]}</small></li>
        ))}
      </ul>
    </div>
  );
}

/** La base no asigna a alguien con otro campus sin que quien asigna lo confirme; nada cambió todavía. */
export function ConfirmarCampus({ conflictos, onConfirmar, ocupado }: { conflictos: ConflictoCampus[]; onConfirmar: () => void; ocupado?: boolean }) {
  if (!conflictos.length) return null;
  return (
    <div className="ps-aviso ps-aviso--info" role="alert">
      <Icon name="info" size={16} />
      <div>
        <strong>Antes de seguir, confirme el campus.</strong> Aún no se ha cambiado nada.
        <ul className="ps-lista-errores">
          {conflictos.map((c, i) => <li key={`${c.personaId}-${i}`}>{c.nombre} trabaja en el campus {c.campusPersona ?? "—"} y la actividad es de {c.campusActividad ?? "todos los campus"}.</li>)}
        </ul>
        <button type="button" className="button-secondary" onClick={onConfirmar} disabled={ocupado} aria-busy={ocupado || undefined}>{ocupado ? "Un momento…" : "Confirmar el campus y continuar"}</button>
      </div>
    </div>
  );
}

/* ---------- Oficina ---------- */

export function SelectorOficina({ oficinas, valor, onElegir, etiqueta = "Oficina" }: { oficinas: OficinaVista[]; valor: string | undefined; onElegir: (id: string) => void; etiqueta?: string }) {
  const id = useId();
  if (oficinas.length <= 1) return <p className="ps-oficina-fija"><span>{etiqueta}</span><strong>{oficinas[0]?.nombre}</strong></p>;
  return (
    <div className="ps-selector">
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} value={valor ?? ""} onChange={(e) => onElegir(e.target.value)}>
        {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
      </select>
    </div>
  );
}

export const ROTULO_PODER_PERSONA: Record<Poder, string> = { ninguno: "Sin acceso", lector: "Lector", colaborador: "Colaborador", gestor: "Gestor" };

export function Banner({ tipo = "info", children, rol }: { tipo?: "info" | "error" | "ok"; children: ReactNode; rol?: "alert" | "status" }) {
  return (
    <div className={`ps-aviso ps-aviso--${tipo}`} role={rol}>
      <Icon name={tipo === "error" ? "alert" : tipo === "ok" ? "check" : "info"} size={16} />
      <div>{children}</div>
    </div>
  );
}

export function AvisoDemo() {
  return <p className="ps-demo-nota"><Icon name="info" size={14} /> <strong>Demostración.</strong> Las oficinas, personas y actividades son inventadas para probar la pantalla; las 75 líneas del plan son las reales.</p>;
}

/* ---------- Menú «Mover a…» ---------- */

/**
 * La alternativa accesible al arrastre: un botón que abre un menú con los cubos. Los que el permiso no deja se
 * muestran con el motivo; elegirlos no hace nada y avisa en línea. No lleva animación (es una acción de teclado).
 */
export function MenuMover({ actividad, poder, yo, onMover, onRechazo, etiqueta = "Mover a…", compacto = false }: { actividad: Pick<Actividad, "id" | "titulo" | "estado" | "asignados">; poder: Poder; yo: string | null; onMover: (estado: EstadoAct) => void; onRechazo: (motivo: string) => void; etiqueta?: string; compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; arriba: boolean } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const id = useId();
  const { ir, ruta } = usePs();
  const opciones = destinosPosibles(poder, actividad, yo);

  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    const ancho = 290;
    const alto = 5 * 56 + 12;
    const arriba = r.bottom + alto > window.innerHeight && r.top > alto;
    setPos({ top: arriba ? r.top - 4 : r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)), arriba });
  }, [abierto]);
  useEffect(() => {
    if (!abierto) setPos(null);
  }, [abierto]);
  useEffect(() => {
    // El foco entra al menú en cuanto tiene su sitio (antes está oculto y no lo recibiría).
    if (abierto && pos) menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [abierto, pos]);
  useEffect(() => {
    if (!abierto) return;
    const y0 = window.scrollY;
    const ancho0 = window.innerWidth;
    const x0 = boton.current?.closest<HTMLElement>(".ps-cubos")?.scrollLeft ?? 0;
    const fuera = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) setAbierto(false);
    };
    // El menú es fijo: si la página se desplaza de verdad o cambia de ancho, se cierra (el sitio ya no valdría).
    const alDesplazar = (e: Event) => {
      if (menu.current?.contains(e.target as Node)) return;
      if (Math.abs(window.scrollY - y0) > 60 || (e.target instanceof HTMLElement && e.target.classList.contains("ps-cubos") && Math.abs(e.target.scrollLeft - x0) > 40)) setAbierto(false);
    };
    const alAjustar = () => window.innerWidth !== ancho0 && setAbierto(false);
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("scroll", alDesplazar, true);
    window.addEventListener("resize", alAjustar);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("scroll", alDesplazar, true);
      window.removeEventListener("resize", alAjustar);
    };
  }, [abierto]);

  const cerrar = (volver = true) => {
    setAbierto(false);
    if (volver) boton.current?.focus();
  };
  const alTeclear = (e: React.KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(); }
    else if (e.key === "Tab") setAbierto(false);
  };
  return (
    <>
      <button ref={boton} type="button" className={compacto ? "ps-mover ps-mover--compacto" : "ps-mover"} aria-haspopup="menu" aria-expanded={abierto} aria-controls={abierto ? id : undefined} aria-label={`${etiqueta} ${actividad.titulo}`} onClick={() => setAbierto((a) => !a)}>
        <Icon name="columns-view" size={14} /> <span>{etiqueta}</span>
      </button>
      {abierto ? (
        <ul ref={menu} id={id} role="menu" aria-label={`Mover «${actividad.titulo}» a`} className="ps-menu" onKeyDown={alTeclear} style={pos ? { top: pos.top, left: pos.left, transform: pos.arriba ? "translateY(-100%)" : undefined } : { visibility: "hidden" }}>
          {opciones.map(({ estado, decision }, i) => {
            const actual = estado === actividad.estado;
            // El mismo motivo no se repite en cada cubo: se dice una vez y los demás quedan atenuados.
            const repetido = !decision.ok && opciones.findIndex((o) => !o.decision.ok && o.estado !== actividad.estado && (o.decision as { motivo: string }).motivo === decision.motivo) !== i;
            return (
              <li role="none" key={estado}>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={!decision.ok || undefined}
                  aria-current={actual || undefined}
                  className="ps-menu__item"
                  onClick={() => {
                    if (actual) return cerrar();
                    if (!decision.ok) {
                      cerrar();
                      onRechazo(decision.motivo);
                      return;
                    }
                    // Devolver de «En revisión» pide una nota (≥ 20 caracteres): es una pantalla completa.
                    if (requiereNotaDevolucion(actividad.estado, estado)) {
                      cerrar(false);
                      ir(`${ruta("devolver", actividad.id)}?a=${estado}`);
                      return;
                    }
                    // FASE 3: al pasar a «En revisión» (colaborador) o a «Hecho» (gestor), aquí se abrirá el reporte de
                    // avance a pantalla completa (físico, financiero, nota y evidencia). En la fase 2 se mueve directo.
                    cerrar();
                    onMover(estado);
                  }}
                >
                  <GlifoEstado estado={estado} />
                  <span><b>{DEF_ESTADOS[estado].nombre}{actual ? " (actual)" : ""}</b>{!decision.ok && !actual && !repetido ? <small>{decision.motivo}</small> : null}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

/** Un solo mensaje en línea para los rechazos de permiso; se anuncia a lectores de pantalla. */
export function MensajeRechazo({ mensaje, onCerrar }: { mensaje: string | null; onCerrar: () => void }) {
  return (
    <div className="ps-rechazo-zona" role="alert" aria-live="assertive">
      {mensaje ? (
        <div className="ps-aviso ps-aviso--error">
          <Icon name="lock" size={16} />
          <div><strong>No se movió.</strong> {mensaje}</div>
          <button type="button" className="ps-enlace" onClick={onCerrar}>Entendido</button>
        </div>
      ) : null}
    </div>
  );
}

export type { MiembroEquipo };
