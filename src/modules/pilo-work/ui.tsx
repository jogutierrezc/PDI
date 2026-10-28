/* =============================================================================
   Pilo at Work · piezas compartidas: contexto de la sesión, avisos breves,
   iconos, cara de Pilo y los controles pequeños del prototipo aprobado.
   ========================================================================== */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { movimientoReducido } from "../rankings/movimiento";
import type { Perfil } from "./api";

export const MOOD = {
  feliz: "/pilo-moods/feliz-160.webp",
  piensa: "/pilo-moods/piensa-160.webp",
  idea: "/pilo-moods/idea-160.webp",
  excelente: "/pilo-moods/excelente-160.webp",
  bien: "/pilo-moods/bien-160.webp",
} as const;
export type Mood = keyof typeof MOOD;

export const Cara = ({ mood = "feliz", className = "pface" }: { mood?: Mood; className?: string }) => (
  <span className={className}>
    <img src={MOOD[mood]} alt="" />
  </span>
);

/* --- Contexto -------------------------------------------------------------------------------- */

export interface Avisar {
  t: string;
  b: string;
  ir?: string;
}
export interface WorkCtx {
  perfil: Perfil;
  esAdmin: boolean;
  conCorreo: boolean;
  toast: (mensaje: string) => void;
  aviso: (a: Avisar) => void;
  ir: (ruta: string) => void;
  /** Cuántas filas salieron del equipo hacia la IA (siempre 0 salvo aprobación). */
  filas: number;
  setFilas: (n: number) => void;
  /** Lo que la persona escribió en el inicio, para abrirlo en el chat. */
  pedido: string;
  setPedido: (q: string) => void;
  /** El esquema permitido de los datos abiertos en este equipo (nunca filas). */
  esquema: unknown;
  setEsquema: (e: unknown) => void;
  avisosApp: boolean;
  setAvisosApp: (v: boolean) => void;
  refrescarNav: () => void;
  /** Funciones que la administración dejó encendidas (pw_config; por defecto todas) y el tope de subida en MB. */
  funciones: Record<string, boolean>;
  subidaMaxMb: number;
  /** El perfil de la persona («Mi perfil»): abre el diálogo y el nombre para mostrar. */
  abrirPerfil: () => void;
  nombreMostrar: string;
  /** El último modelo que respondió en el chat (para el chip superior). */
  modelo: ModeloUsado | null;
  setModelo: (m: ModeloUsado | null) => void;
}
export interface ModeloUsado {
  proveedor: string;
  modelo: string;
  nivel: string;
  conmutado: boolean;
  motivo: string;
  ms: number;
}
const Ctx = createContext<WorkCtx | null>(null);
export const WorkProvider = Ctx.Provider;
export function useWork(): WorkCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWork fuera de PiloWork");
  return c;
}

/** El mensaje breve de abajo (toast). */
export function useToastState() {
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState(false);
  const h = useRef<number>();
  const toast = useCallback((m: string) => {
    setMsg(m);
    setOn(true);
    window.clearTimeout(h.current);
    h.current = window.setTimeout(() => setOn(false), 2800);
  }, []);
  return { msg, on, toast };
}

/* --- Movimiento ---------------------------------------------------------------------------- */

const EASE = "expo.out";
/** Los hijos entran escalonados al montar la vista (omitido con movimiento reducido o si lo pidió el teclado). */
export function useEntra(selector: string, dep: unknown = 0, desde = 12) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const raiz = ref.current;
    if (!raiz || movimientoReducido()) return;
    const els = raiz.querySelectorAll(selector);
    if (!els.length) return;
    const t = gsap.fromTo(els, { opacity: 0, y: desde }, { opacity: 1, y: 0, duration: 0.34, ease: EASE, stagger: 0.045, clearProps: "opacity,transform" });
    return () => {
      t.kill();
      gsap.set(els, { clearProps: "opacity,transform" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta la clave
  }, [dep]);
  return ref;
}

export const entra = (el: Element | null, opts: gsap.TweenVars = {}) => {
  if (!el || movimientoReducido()) return;
  gsap.fromTo(el, { opacity: 0, y: 10, ...opts }, { opacity: 1, y: 0, x: 0, duration: 0.3, ease: EASE, clearProps: "opacity,transform" });
};

export const sale = (el: Element | null, fin: () => void) => {
  if (!el || movimientoReducido()) return fin();
  gsap.to(el, { opacity: 0, x: 16, duration: 0.18, ease: "power2.in", onComplete: fin });
};

/** Diálogo modal: foco adentro al abrir, Tab atrapado, Esc cierra y el foco vuelve a quien lo abrió. */
export function useDialogo(cerrar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cierre = useRef(cerrar);
  cierre.current = cerrar;
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const raiz = ref.current;
    const foco = () => Array.from(raiz?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? []);
    if (!raiz?.contains(document.activeElement)) foco()[0]?.focus();
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") return cierre.current();
      if (e.key !== "Tab") return;
      const l = foco();
      if (!l.length) return;
      const [a, z] = [l[0], l[l.length - 1]];
      if (e.shiftKey && document.activeElement === a) {
        z.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === z) {
        a.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", f);
    return () => {
      document.removeEventListener("keydown", f);
      previo?.focus?.();
    };
  }, []);
  return ref;
}

/* --- Iconos -------------------------------------------------------------------------------- */

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const svg = (d: ReactNode) => <svg viewBox="0 0 20 20" {...P}>{d}</svg>;
export const IC = {
  chat: svg(<path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2H9l-4 3v-3a2 2 0 01-2-2z" />),
  cow: svg(<><rect x="3" y="3" width="9" height="14" rx="1.5" /><path d="M15 6l2 2-6 6-3 1 1-3z" /></>),
  mail: svg(<><rect x="3" y="5" width="14" height="10" rx="2" /><path d="M3 7l7 5 7-5" /></>),
  data: svg(<><ellipse cx="10" cy="5" rx="6" ry="2.5" /><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" /></>),
  mem: svg(<><path d="M10 3a5 5 0 00-3 9v3h6v-3a5 5 0 00-3-9z" /><path d="M8 17h4" /></>),
  plug: svg(<path d="M7 3v4M13 3v4M5 7h10v3a5 5 0 01-10 0zM10 15v3" />),
  key: svg(<><circle cx="7" cy="12" r="3.5" /><path d="M9.5 9.5L16 3M13 6l2 2" /></>),
  arch: svg(<><rect x="3" y="3" width="6" height="5" rx="1" /><rect x="11" y="3" width="6" height="5" rx="1" /><rect x="7" y="12" width="6" height="5" rx="1" /><path d="M6 8v2h8V8M10 10v2" /></>),
  home: svg(<><path d="M3 9l7-6 7 6v8H3z" /><path d="M8 17v-5h4v5" /></>),
  cal: svg(<><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></>),
  team: svg(<><circle cx="7" cy="8" r="3" /><circle cx="14" cy="9" r="2.4" /><path d="M2 17c0-3 2.5-5 5-5s5 2 5 5M12.5 13.2c.5-.2 1-.3 1.5-.3 2 0 4 1.4 4 4" /></>),
  spark: svg(<path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8z" />),
  shield: svg(<><path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5z" /><path d="M7 10l2 2 4-4" /></>),
  doc: svg(<><path d="M4 3h8l4 4v10H4z" /><path d="M12 3v4h4" /></>),
  lock: svg(<><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6a3 3 0 016 0v3" /></>),
  send: <svg width="16" height="16" viewBox="0 0 20 20" {...P} strokeWidth={2}><path d="M3 10l14-7-5 14-2-6z" /></svg>,
  folder: svg(<path d="M3 6a2 2 0 012-2h3l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2z" />),
  file: svg(<><path d="M5 3h6l4 4v10H5z" /><path d="M11 3v4h4M8 11h4M8 14h4" /></>),
  cloud: svg(<path d="M6.5 15a3.5 3.5 0 01-.4-6.98A4.5 4.5 0 0114.6 7.6 3.7 3.7 0 0114 15z" />),
  user: svg(<><circle cx="10" cy="7" r="3.2" /><path d="M3.5 17c.6-3.2 3.1-5 6.5-5s5.9 1.8 6.5 5" /></>),
  up: svg(<path d="M10 14V4M6 8l4-4 4 4M4 16h12" />),
  close: svg(<path d="M5 5l10 10M15 5L5 15" />),
  link: svg(<path d="M8.5 11.5a3 3 0 004.2 0l2.3-2.3a3 3 0 00-4.2-4.2l-.8.8M11.5 8.5a3 3 0 00-4.2 0L5 10.8A3 3 0 009.2 15l.8-.8" />),
  video: svg(<><rect x="2.5" y="5.5" width="10" height="9" rx="2" /><path d="M12.5 9l5-2.5v7L12.5 11z" /></>),
  clock: svg(<><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>),
  chevL: svg(<path d="M12 4l-6 6 6 6" />),
  chevR: svg(<path d="M8 4l6 6-6 6" />),
  refresh: svg(<path d="M16 10a6 6 0 11-1.8-4.3M16 3v4h-4" />),
  panel: svg(<><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12" /></>),
  out: svg(<path d="M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h3M12 7l3 3-3 3M15 10H8" />),
  plus: svg(<path d="M10 4v12M4 10h12" />),
  arrow: <svg width="14" height="14" viewBox="0 0 14 14" {...P} strokeWidth={1.8}><path d="M2 7h9M7 3l4 4-4 4" /></svg>,
};

/* --- Controles ----------------------------------------------------------------------------- */

export function Tg({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="tg" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string>({ valor, opciones, onChange, etiqueta, tab }: { valor: T; opciones: [T, string][]; onChange: (v: T) => void; etiqueta: string; tab?: boolean }) {
  return (
    <div className="seg" role={tab ? "tablist" : "group"} aria-label={etiqueta}>
      {opciones.map(([v, t]) => (
        <button key={v} type="button" role={tab ? "tab" : undefined} aria-pressed={tab ? undefined : valor === v} aria-selected={tab ? valor === v : undefined} onClick={() => onChange(v)}>
          {t}
        </button>
      ))}
    </div>
  );
}

/** El logo de la UDES sin placa: el original sobre fondos claros, el blanco sobre oscuros; «tema» cambia con el tema. */
const RAZON_LOGO = 2757 / 991;
export const Logo = ({ alto = 22, variante = "tema" }: { alto?: number; variante?: "tema" | "original" | "blanco" }) => {
  const dim = { width: Math.round(alto * RAZON_LOGO), height: alto };
  return (
    <span className={`logo logo--${variante}`} role="img" aria-label="Universidad de Santander" style={dim}>
      {variante !== "blanco" && <img className="lg-o" src="/logo-udes.svg" alt="" aria-hidden="true" {...dim} />}
      {variante !== "original" && <img className="lg-b" src="/logo-udes-blanco.png" alt="" aria-hidden="true" {...dim} />}
    </span>
  );
};

/* --- Diálogo animado -------------------------------------------------------------------------
   Modal con foco atrapado y devuelto (useDialogo), aria-modal y Esc. Entrada ≤ 300 ms (expo.out,
   scale .96 + opacity, desde el disparador si se pasa `origen`), salida más corta. Esc y todo lo
   que viene del teclado cierran SIN animación; movimiento reducido: solo un fundido. */
export function Dialogo({ titulo, onCerrar, children, ancho = 560, origen, pie, descripcion }: { titulo: string; onCerrar: () => void; children: ReactNode; ancho?: number; origen?: { x: number; y: number } | null; pie?: ReactNode; descripcion?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const cerrando = useRef(false);
  const caja = useDialogo(() => onCerrar());
  const idT = useRef(`dlg-${Math.random().toString(36).slice(2, 8)}`).current;
  useEffect(() => {
    const p = panel.current;
    const f = fondo.current;
    if (!p || !f) return;
    if (movimientoReducido()) {
      gsap.fromTo([f, p], { opacity: 0 }, { opacity: 1, duration: 0.12, clearProps: "opacity" });
      return;
    }
    if (origen) {
      const r = p.getBoundingClientRect();
      p.style.transformOrigin = `${Math.round(origen.x - r.left)}px ${Math.round(origen.y - r.top)}px`;
    }
    gsap.fromTo(f, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out", clearProps: "opacity" });
    gsap.fromTo(p, { opacity: 0, scale: 0.96, y: 8 }, { opacity: 1, scale: 1, y: 0, duration: 0.26, ease: "expo.out", clearProps: "opacity,transform" });
    return () => {
      gsap.killTweensOf([f, p]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);
  /** Cierre con el puntero: sale más rápido de lo que entró. */
  const cerrar = () => {
    if (cerrando.current) return;
    cerrando.current = true;
    const p = panel.current;
    const f = fondo.current;
    if (!p || !f || movimientoReducido()) return onCerrar();
    gsap.to(p, { opacity: 0, scale: 0.97, duration: 0.14, ease: "power2.in" });
    gsap.to(f, { opacity: 0, duration: 0.16, ease: "power2.in", onComplete: onCerrar });
  };
  return (
    <div className="dlg" ref={fondo} onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="dlg__p" ref={panel} style={{ maxWidth: ancho }}>
        <div ref={caja} role="dialog" aria-modal="true" aria-labelledby={idT} aria-describedby={descripcion ? `${idT}-d` : undefined} className="dlg__i">
          <header className="dlg__h">
            <h2 id={idT}>{titulo}</h2>
            <button type="button" className="tbtn dlg__x" aria-label="Cerrar" onClick={cerrar}>
              {IC.close}
            </button>
          </header>
          {descripcion && (
            <p className="muted small" id={`${idT}-d`}>
              {descripcion}
            </p>
          )}
          <div className="dlg__b">{children}</div>
          {pie && <footer className="dlg__f">{pie}</footer>}
        </div>
      </div>
    </div>
  );
}

export const iniciales =(n: string) => n.split(" ").filter(Boolean).map((x) => x.charAt(0)).slice(0, 2).join("").toUpperCase();

/** Markdown seguro (nunca HTML crudo): párrafos, listas, tablas, citas, encabezados, código, negrita, cursiva, código en línea y enlaces http(s). */
export function Md({ texto }: { texto: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((p, i) => {
      if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
      if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
      if (p.length > 2 && p.startsWith("*") && p.endsWith("*")) return <i key={i}>{p.slice(1, -1)}</i>;
      const m = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (m) return <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}</a>;
      return <span key={i}>{p}</span>;
    });
  const celdas = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const bloque = (b: string, i: number): ReactNode => {
    const lineas = b.split("\n");
    if (lineas.length >= 2 && lineas[0].includes("|") && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lineas[1])) {
      const cab = celdas(lineas[0]);
      return (
        <div className="md-tabla" key={i} tabIndex={0} role="region" aria-label="Tabla">
          <table>
            <thead><tr>{cab.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
            <tbody>{lineas.slice(2).map((l, r) => <tr key={r}>{cab.map((_, j) => <td key={j}>{inline(celdas(l)[j] ?? "")}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    if (lineas.every((l) => /^\s*[-*•]\s+/.test(l))) return <ul key={i}>{lineas.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>)}</ul>;
    if (lineas.every((l) => /^\s*\d+[.)]\s+/.test(l))) return <ol key={i}>{lineas.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}</ol>;
    if (lineas.every((l) => /^\s*>/.test(l))) return <blockquote key={i}>{inline(lineas.map((l) => l.replace(/^\s*>\s?/, "")).join(" "))}</blockquote>;
    const h = lineas.length === 1 ? lineas[0].match(/^\s*(#{1,6})\s+(.+)$/) : null;
    if (h) return <p className="md-h" key={i}><b>{inline(h[2])}</b></p>;
    return (
      <p key={i}>
        {lineas.map((l, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {inline(l)}
          </span>
        ))}
      </p>
    );
  };
  return (
    <div className="md">
      {texto.split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g).map((pieza, k) => {
        if (k % 2 === 1) return <pre key={k} tabIndex={0}><code>{pieza.replace(/^```[^\n]*\n/, "").replace(/```$/, "").replace(/\n$/, "")}</code></pre>;
        return pieza.split(/\n{2,}/).filter((b) => b.trim()).map((b, i) => bloque(b, k * 1000 + i));
      })}
    </div>
  );
}
