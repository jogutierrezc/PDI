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

export const Logo = ({ alto = 22 }: { alto?: number }) => (
  <span className="logo">
    <img src="/logo-udes.svg" alt="Universidad de Santander" style={{ height: alto }} />
  </span>
);

export const iniciales = (n: string) => n.split(" ").filter(Boolean).map((x) => x.charAt(0)).slice(0, 2).join("").toUpperCase();

/** Un texto con «**negrita**» y listas sencillas, sin HTML crudo (el contenido viene del modelo). */
export function Md({ texto }: { texto: string }) {
  const bloques = texto.split(/\n{2,}/);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
  return (
    <div className="md">
      {bloques.map((b, i) => {
        const lineas = b.split("\n");
        if (lineas.every((l) => /^\s*[-*•]\s+/.test(l)))
          return (
            <ul key={i}>
              {lineas.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
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
      })}
    </div>
  );
}
