/* =============================================================================
   UI GreenMetric · piezas comunes de las pantallas (prefijo ugm-).
   Estados de carga, la ventana emergente accesible, el interruptor, las barras
   y los anillos. El movimiento (GSAP) respeta las reglas del proyecto: entradas
   cortas, nada al teclear, movimiento reducido = solo fundidos, limpieza al
   desmontar (gsap.context).
   ========================================================================== */

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { movimientoReducido } from "../../../../components/espacio/movimiento";
import { abrirModal, cerrarModal, entradaPorTeclado } from "../../../datos-sostenibilidad/ui/movimiento";
import { Icon } from "../../../../components/ui/Icon";
import { esFaltaMigracion } from "../datos";
import { ETIQUETA_ESTADO } from "../lib/estados";
import type { EstadoRespuesta } from "../lib/tipos";

export { entrar, crecerMedidores } from "../../../datos-sostenibilidad/ui/movimiento";

/* ---------- Movimiento propio ------------------------------------------------------------------- */

/** Los anillos de avance se llenan al entrar (stroke-dashoffset). */
export function llenarAnillos(raiz: Element | null): () => void {
  if (!raiz) return () => {};
  const ctx = gsap.context(() => {
    const anillos = [...raiz.querySelectorAll<SVGCircleElement>("[data-anillo]")];
    if (!anillos.length) return;
    if (movimientoReducido()) {
      gsap.fromTo(anillos, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none", clearProps: "opacity" });
      return;
    }
    anillos.forEach((c) => gsap.from(c, { strokeDashoffset: Number(c.getAttribute("stroke-dasharray") ?? 0), duration: 0.7, ease: "power3.out", clearProps: "strokeDashoffset" }));
  }, raiz);
  return () => ctx.revert();
}

/** Confirmación sobria: la zona se tiñe de verde un instante (no se anima por teclado). */
export function confirmar(el: Element | null) {
  if (!el || entradaPorTeclado() || movimientoReducido()) return;
  gsap.fromTo(el, { backgroundColor: "var(--status-done-soft)" }, { backgroundColor: "transparent", duration: 0.9, ease: "power2.out", clearProps: "backgroundColor" });
}

/* ---------- Formatos ---------------------------------------------------------------------------- */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
export function hace(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.floor(s / 86400)} d`;
  return fechaCorta(iso);
}
export function diasHasta(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  return Math.round((new Date(`${iso.slice(0, 10)}T12:00:00`).getTime() - hoy.getTime()) / 86400000);
}
export const textoVence = (iso: string | null | undefined): string => {
  const d = diasHasta(iso);
  return d === null ? "Sin fecha" : d < 0 ? `Vencido hace ${-d} d` : d === 0 ? "Vence hoy" : d === 1 ? "Vence mañana" : `En ${d} días`;
};
export const iniciales = (nombre: string): string => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
export const bytesLegibles = (n: number | null | undefined): string => (!n ? "—" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
export const mensajeDe = (e: unknown): string => (e instanceof Error ? e.message : "No se pudo completar la acción.");

/* ---------- Estados y avisos de carga ---------------------------------------------------------- */

export function Estado({ estado }: { estado: EstadoRespuesta }) {
  return <span className={`ugm-pill ugm-st-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>;
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <p className="ugm-estado" role="status">
      <span className="ugm-spin" aria-hidden="true" />
      {texto}
    </p>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="ugm-estado ugm-estado--vacio">{children}</p>;
}

/** El error de una consulta; si faltan las migraciones, lo dice con las palabras de Rankings. */
export function ErrorConsulta({ error, reintentar }: { error: unknown; reintentar?: () => void }) {
  const falta = esFaltaMigracion(error);
  return (
    <div className={`ugm-alerta ${falta ? "ugm-alerta--aviso" : "ugm-alerta--error"}`} role="alert">
      <Icon name="alert" size={18} />
      <div>
        <strong>{falta ? "Falta aplicar las migraciones de UI GreenMetric" : "No se pudo cargar"}</strong>
        <p>{falta ? "Aplique 0208 a 0213 en Supabase, en orden, y vuelva a abrir esta pantalla." : mensajeDe(error)}</p>
        {reintentar && !falta && (
          <button type="button" className="ugm-btn ugm-btn--sm" onClick={reintentar}>
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

export function Alerta({ tipo = "info", children }: { tipo?: "info" | "aviso" | "error" | "ok"; children: ReactNode }) {
  return (
    <div className={`ugm-alerta ugm-alerta--${tipo}`} role={tipo === "error" ? "alert" : undefined}>
      <Icon name={tipo === "ok" ? "check" : tipo === "info" ? "info" : "alert"} size={18} />
      <div>{children}</div>
    </div>
  );
}

/* ---------- Interruptor, barras y anillos ------------------------------------------------------- */

export function Interruptor({ activo, onChange, etiqueta, deshabilitado, detalle }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string; deshabilitado?: boolean; detalle?: ReactNode }) {
  return (
    <div className="ugm-switchrow">
      <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={deshabilitado} className="ugm-switch" onClick={() => onChange(!activo)}>
        <i />
      </button>
      <span>
        <strong>{etiqueta}</strong>
        {detalle && <small>{detalle}</small>}
      </span>
    </div>
  );
}

/** Barra de avance: `aprobado` (verde) y `curso` (azul) en porcentaje del total. */
export function Barra({ aprobado, curso = 0, etiqueta }: { aprobado: number; curso?: number; etiqueta: string }) {
  return (
    <div className="ugm-bar" role="img" aria-label={etiqueta}>
      <i data-medidor className="ugm-bar__ok" style={{ width: `${Math.min(100, aprobado)}%` }} />
      <i data-medidor className="ugm-bar__curso" style={{ width: `${Math.min(100 - Math.min(100, aprobado), curso)}%` }} />
    </div>
  );
}

export function Anillo({ pct, etiqueta, tam = 112 }: { pct: number; etiqueta: string; tam?: number }) {
  const r = (tam - 12) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ugm-anillo" style={{ width: tam, height: tam }} role="img" aria-label={`${etiqueta}: ${Math.round(pct)} %`}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} aria-hidden="true">
        <circle cx={tam / 2} cy={tam / 2} r={r} className="ugm-anillo__pista" />
        <circle data-anillo cx={tam / 2} cy={tam / 2} r={r} className="ugm-anillo__valor" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, pct) / 100)} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
      </svg>
      <b className="ugm-num">{Math.round(pct)} %</b>
    </div>
  );
}

/* ---------- Ventana emergente accesible (<dialog> modal, foco atrapado por el navegador) -------- */

export function Dialogo({ titulo, descripcion, onCerrar, children, ancho = 560 }: { titulo: string; descripcion?: string; onCerrar: () => void; children: ReactNode; ancho?: number }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const previo = useRef<Element | null>(null);
  const cerrando = useRef(false);

  const cerrar = useCallback(() => {
    if (cerrando.current) return;
    cerrando.current = true;
    cerrarModal(dlg.current, caja.current, () => {
      dlg.current?.close();
      onCerrar();
    });
  }, [onCerrar]);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    previo.current = document.activeElement;
    if (!d.open) d.showModal();
    const limpia = abrirModal(d, caja.current);
    const enfocar = caja.current?.querySelector<HTMLElement>("[autofocus], input:not([type=hidden]), select, textarea");
    (enfocar ?? caja.current)?.focus({ preventScroll: true });
    return () => {
      limpia();
      if (d.open) d.close();
      if (previo.current instanceof HTMLElement && previo.current.isConnected) previo.current.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dlg}
      className="ugm-dlg"
      aria-labelledby="ugm-dlg-t"
      onCancel={(e) => {
        e.preventDefault();
        cerrar();
      }}
      onMouseDown={(e) => {
        if (e.target === dlg.current) cerrar();
      }}
    >
      <div ref={caja} className="ugm-dlg__caja" style={{ maxWidth: ancho }} tabIndex={-1}>
        <header className="ugm-dlg__cab">
          <div>
            <h2 id="ugm-dlg-t">{titulo}</h2>
            {descripcion && <p>{descripcion}</p>}
          </div>
          <button type="button" className="ugm-btn ugm-btn--icono" aria-label="Cerrar" onClick={cerrar}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="ugm-dlg__cuerpo">{children}</div>
      </div>
    </dialog>
  );
}

/** Campo con su etiqueta y ayuda. */
export function Campo({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="ugm-campo">
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      {ayuda && <small id={`${id}-a`}>{ayuda}</small>}
    </div>
  );
}
