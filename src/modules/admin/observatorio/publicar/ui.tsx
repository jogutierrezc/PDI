/* =============================================================================
   Observatorio · piezas comunes de los paneles «Observatorios» e «Insertar y
   publicar» (O2): ventana emergente (<dialog>), menú que nace en su botón,
   avisos, selector segmentado, copiar y movimiento (GSAP).

   Reglas de movimiento (Emil): entradas ≤ 240 ms con power4.out, escalonado
   ≤ 30 ms y máximo 9 elementos, modales que van de .96 a 1 y salen más rápido,
   popovers que nacen en su botón, nada al teclear ni en acciones de teclado,
   movimiento reducido = solo fundidos ≤ 120 ms, y gsap.context para que React
   StrictMode no deje tweens colgados.
   ========================================================================== */

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { Icon } from "../../../../components/ui/Icon";
import { FaltaMigracion } from "./api";

const useLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

export const reducido = (): boolean => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/* --- Iconos de un solo trazo que Icon no trae ----------------------------------------- */

const TRAZOS = {
  more: "M5 12h.01M12 12h.01M19 12h.01",
  pause: "M9 5v14M15 5v14",
  archive: "M3 7h18v4H3zM5 11v8h14v-8M10 15h4",
  copy: "M9 9h10v11H9zM5 15V4h10",
  move: "M5 12h14M13 6l6 6-6 6",
  refresh: "M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4",
  x: "M6 6l12 12M18 6L6 18",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  duplicate: "M8 8h12v12H8zM4 16V4h12",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
} as const;
export type IcoName = keyof typeof TRAZOS;

export function Ico({ name, size = 16 }: { name: IcoName; size?: number }) {
  return (
    <svg className="obsx-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={TRAZOS[name]} />
    </svg>
  );
}

/* --- Entrada en cascada --------------------------------------------------------------- */

/** Los hijos que casan con `selector` entran al cambiar `clave` (≤ 240 ms, hasta 9 con 30 ms de escalón). */
export function useCascada(ref: RefObject<HTMLElement>, selector: string, clave: unknown) {
  useLayout(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const ctx = gsap.context(() => {
      const items = Array.from(nodo.querySelectorAll(selector));
      if (!items.length) return;
      if (reducido()) gsap.from(items, { opacity: 0, duration: 0.12, clearProps: "opacity" });
      else {
        gsap.from(items.slice(0, 9), { opacity: 0, y: 8, duration: 0.24, ease: "power4.out", stagger: 0.03, clearProps: "opacity,transform" });
      }
    }, nodo);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta la clave
  }, [clave]);
}

/** FLIP corto: antes de cambiar el orden se guardan las posiciones; después, cada fila viaja desde donde estaba. */
export function useFlip(ref: RefObject<HTMLElement>, selector: string, clave: unknown) {
  const antes = useRef(new Map<string, number>());
  const animar = useRef(false);
  useLayout(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const filas = Array.from(nodo.querySelectorAll<HTMLElement>(selector));
    if (animar.current && !reducido()) {
      for (const f of filas) {
        const y0 = antes.current.get(f.dataset.flip ?? "");
        if (y0 === undefined) continue;
        const dy = y0 - f.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) gsap.fromTo(f, { y: dy }, { y: 0, duration: 0.18, ease: "power3.out", clearProps: "transform", overwrite: true });
      }
    }
    animar.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta la clave
  }, [clave]);
  /** Se llama justo antes de cambiar el orden con el puntero (no con el teclado). */
  return useCallback(() => {
    const nodo = ref.current;
    if (!nodo) return;
    antes.current = new Map(Array.from(nodo.querySelectorAll<HTMLElement>(selector)).map((f) => [f.dataset.flip ?? "", f.getBoundingClientRect().top]));
    animar.current = true;
  }, [ref, selector]);
}

/* --- Ventana emergente ---------------------------------------------------------------- */

interface DialogoProps {
  titulo: string;
  sub?: ReactNode;
  ancho?: number;
  /** Casi toda la pantalla (el panel «Insertar en otra página»). */
  hoja?: boolean;
  onCerrar: () => void;
  children: ReactNode | ((cerrar: () => void) => ReactNode);
  pie?: ReactNode | ((cerrar: () => void) => ReactNode);
}

/** <dialog> modal: el foco queda atrapado, Esc y el fondo cierran, vuelve el foco a quien la abrió. */
export function Dialogo({ titulo, sub, ancho = 560, hoja, onCerrar, children, pie }: DialogoProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cerrando = useRef(false);
  const origen = useRef<Element | null>(null);
  const idTitulo = useId();
  const salir = useRef(onCerrar);
  salir.current = onCerrar;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    origen.current = document.activeElement;
    if (!d.open) d.showModal();
    const ctx = gsap.context(() => {
      if (reducido()) gsap.from(d, { opacity: 0, duration: 0.12 });
      else gsap.from(d, { opacity: 0, scale: 0.96, duration: 0.2, ease: "power4.out" });
    }, d);
    return () => {
      ctx.revert();
      if (d.open) d.close();
      const o = origen.current as HTMLElement | null;
      if (o?.isConnected) o.focus?.({ preventScroll: true });
    };
  }, []);

  const cerrar = useCallback(() => {
    const d = ref.current;
    if (!d || cerrando.current) return;
    cerrando.current = true;
    if (reducido()) gsap.to(d, { opacity: 0, duration: 0.1, onComplete: () => salir.current() });
    else gsap.to(d, { opacity: 0, scale: 0.98, duration: 0.12, ease: "power2.in", onComplete: () => salir.current() });
  }, []);

  return (
    <dialog
      ref={ref}
      className="obsx-dialog"
      data-hoja={hoja || undefined}
      style={hoja ? undefined : { width: `min(${ancho}px, calc(100vw - 24px))` }}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        cerrar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) cerrar();
      }}
    >
      <div className="obsx-dialog__caja">
        <header className="obsx-dialog__cab">
          <div>
            <h2 id={idTitulo}>{titulo}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="icon-button" onClick={cerrar} aria-label="Cerrar">
            <Ico name="x" />
          </button>
        </header>
        <div className="obsx-dialog__cuerpo">{typeof children === "function" ? children(cerrar) : children}</div>
        {pie && <footer className="obsx-dialog__pie">{typeof pie === "function" ? pie(cerrar) : pie}</footer>}
      </div>
    </dialog>
  );
}

/** Confirmación corta para acciones que afectan a otras páginas. */
export function Confirmar({ titulo, texto, accion, peligro, onSi, onNo }: { titulo: string; texto: ReactNode; accion: string; peligro?: boolean; onSi: () => void; onNo: () => void }) {
  return (
    <Dialogo
      titulo={titulo}
      ancho={440}
      onCerrar={onNo}
      pie={(cerrar) => (
        <>
          <button type="button" className="button-secondary" onClick={cerrar}>Cancelar</button>
          <button type="button" className={peligro ? "button-primary obsx-peligro" : "button-primary"} onClick={() => { onSi(); cerrar(); }}>{accion}</button>
        </>
      )}
    >
      <p className="obsx-texto">{texto}</p>
    </Dialogo>
  );
}

/* --- Menú que nace en su botón ------------------------------------------------------- */

export interface ItemMenu { texto: string; icono?: IcoName; peligro?: boolean; hecho: () => void }

export function MenuAcciones({ etiqueta, items, claseBoton = "icon-button" }: { etiqueta: string; items: (ItemMenu | "-" | null | false)[]; claseBoton?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; arriba: boolean } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const lista = items.filter((i): i is ItemMenu | "-" => Boolean(i));

  const abrir = () => {
    const r = boton.current!.getBoundingClientRect();
    const alto = lista.length * 38 + 12;
    const arriba = r.bottom + alto > window.innerHeight - 8 && r.top > alto;
    setPos({ top: arriba ? r.top - 6 : r.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - 228, r.right - 220)), arriba });
  };
  const cerrar = useCallback((devolverFoco = true) => {
    setPos(null);
    if (devolverFoco) boton.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!pos) return;
    const nodo = caja.current!;
    nodo.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
    const ctx = gsap.context(() => {
      gsap.from(nodo, reducido() ? { opacity: 0, duration: 0.1 } : { opacity: 0, scale: 0.95, duration: 0.14, ease: "power3.out" });
    }, nodo);
    const fuera = (e: PointerEvent) => {
      if (!nodo.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) cerrar(false);
    };
    const mover = () => cerrar(false);
    document.addEventListener("pointerdown", fuera, true);
    window.addEventListener("resize", mover);
    window.addEventListener("scroll", mover, true);
    return () => {
      ctx.revert();
      document.removeEventListener("pointerdown", fuera, true);
      window.removeEventListener("resize", mover);
      window.removeEventListener("scroll", mover, true);
    };
  }, [pos, cerrar]);

  const teclas = (e: React.KeyboardEvent) => {
    const todos = Array.from(caja.current!.querySelectorAll<HTMLElement>("[role=menuitem]"));
    const i = todos.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); todos[(i + 1) % todos.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); todos[(i - 1 + todos.length) % todos.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); todos[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); todos[todos.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(); }
    else if (e.key === "Tab") cerrar(false);
  };

  return (
    <>
      <button ref={boton} type="button" className={claseBoton} aria-label={etiqueta} aria-haspopup="menu" aria-expanded={Boolean(pos)} onClick={() => (pos ? cerrar() : abrir())}>
        <Ico name="more" />
      </button>
      {pos &&
        createPortal(
          <div ref={caja} role="menu" aria-label={etiqueta} className="obsx-menu" style={{ top: pos.top, left: pos.left, transformOrigin: `right ${pos.arriba ? "bottom" : "top"}`, translate: pos.arriba ? "0 -100%" : undefined }} onKeyDown={teclas}>
            {lista.map((it, n) =>
              it === "-" ? (
                <hr key={n} />
              ) : (
                <button key={it.texto} type="button" role="menuitem" data-peligro={it.peligro || undefined} onClick={() => { cerrar(false); it.hecho(); }}>
                  {it.icono && <Ico name={it.icono} />}
                  {it.texto}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/* --- Avisos (una línea que habla y se va) ------------------------------------------ */

export function useAvisos() {
  const [aviso, setAviso] = useState<{ texto: string; mala?: boolean; n: number } | null>(null);
  const temporizador = useRef<number>();
  const decir = useCallback((texto: string, mala?: boolean) => {
    window.clearTimeout(temporizador.current);
    setAviso((a) => ({ texto, mala, n: (a?.n ?? 0) + 1 }));
    temporizador.current = window.setTimeout(() => setAviso(null), mala ? 7000 : 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(temporizador.current), []);
  const nodo = (
    <div className="obsx-avisos" role="status" aria-live="polite">
      {aviso && (
        <p key={aviso.n} data-mala={aviso.mala || undefined}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
  return { decir, nodo };
}

/* --- Selector segmentado (radios nativos: flechas del teclado incluidas) ------------- */

export function Seg<T extends string>({ valor, opciones, onChange, etiqueta, deshabilitado }: { valor: T; opciones: readonly (readonly [T, string])[]; onChange: (v: T) => void; etiqueta: string; deshabilitado?: boolean }) {
  const nombre = useId();
  return (
    <div className="obsx-seg" role="radiogroup" aria-label={etiqueta}>
      {opciones.map(([v, texto]) => (
        <label key={v}>
          <input type="radio" name={nombre} value={v} checked={valor === v} disabled={deshabilitado} onChange={() => onChange(v)} />
          <span>{texto}</span>
        </label>
      ))}
    </div>
  );
}

/* --- Etiquetas de estado ------------------------------------------------------------- */

export function Chip({ tono, icono, children }: { tono?: "ok" | "warn" | "bad" | "brand"; icono?: ReactNode; children: ReactNode }) {
  return (
    <span className="obsx-chip" data-tono={tono}>
      {icono}
      {children}
    </span>
  );
}

/* --- Copiar al portapapeles, con respaldo de selección ----------------------------- */

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = texto;
    t.setAttribute("readonly", "");
    t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(t);
    t.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      t.remove();
    }
  }
}

/** Botón de copiar: dice «Copiado» un momento y avisa a lectores de pantalla. */
export function BotonCopiar({ texto, etiqueta = "Copiar", pequeno, deshabilitado, onResultado, soloIcono }: { texto: string | (() => string); etiqueta?: string; pequeno?: boolean; deshabilitado?: boolean; onResultado?: (ok: boolean) => void; soloIcono?: boolean }) {
  const [estado, setEstado] = useState<"" | "ok" | "mal">("");
  const t = useRef<number>();
  useEffect(() => () => window.clearTimeout(t.current), []);
  const copiar = async () => {
    const ok = await copiarTexto(typeof texto === "function" ? texto() : texto);
    setEstado(ok ? "ok" : "mal");
    onResultado?.(ok);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setEstado(""), 1800);
  };
  const rotulo = estado === "ok" ? "Copiado" : estado === "mal" ? "No se pudo copiar" : etiqueta;
  return (
    <button type="button" className={soloIcono ? "icon-button" : pequeno ? "button-secondary obsx-pequeno" : "button-secondary"} onClick={() => void copiar()} disabled={deshabilitado} aria-label={soloIcono ? rotulo : undefined} title={soloIcono ? rotulo : undefined}>
      {estado === "ok" ? <Icon name="check" size={16} /> : <Ico name="copy" />}
      {!soloIcono && <span aria-live="polite">{rotulo}</span>}
    </button>
  );
}

/* --- Estados vacíos y de migración --------------------------------------------------- */

export function EstadoMigracion({ error }: { error: unknown }) {
  const m = error instanceof FaltaMigracion ? error.migracion : null;
  return (
    <div className="obsx-vacio" role="alert">
      <Icon name="alert" size={22} />
      <strong>{m ? `Falta aplicar la migración ${m} del Observatorio` : "No se pudo leer esta parte del Observatorio"}</strong>
      <p>
        {m
          ? "La base todavía no tiene las tablas de los observatorios y los insertados. Aplica las migraciones 0230 a 0234 en orden y vuelve a abrir este panel."
          : error instanceof Error
            ? error.message
            : "Intenta de nuevo en un momento."}
      </p>
    </div>
  );
}

export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="obsx-vacio">
      <strong>{titulo}</strong>
      {children && <p>{children}</p>}
      {accion}
    </div>
  );
}

/* --- Pequeños ayudantes ------------------------------------------------------------- */

export const slugify = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const codigoDe = (nombre: string) => {
  const p = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/).filter((x) => x.length > 2);
  const letras = p.length >= 2 ? p[0][0] + p[1][0] : (p[0] ?? nombre).replace(/[^A-Za-z0-9]/g, "").slice(0, 2);
  return (letras || "NT").toUpperCase();
};

/** Colores de identidad: los de línea del portal (tokens, así siguen el tema claro y oscuro). */
export const COLORES_OBS = Array.from({ length: 8 }, (_, i) => `var(--od-line-${i + 1})`);
export const ICONOS_OBS = ["spark-chart", "compass", "layers", "chart", "users", "library", "shield", "table", "leaf", "community", "columns-view", "tiles"] as const;
export const nombreColor = (c: string) => `Color ${c.replace(/\D/g, "") || c}`;

/** Contexto mínimo para que un panel hijo pueda avisar sin recibir la función por todos lados. */
export const AvisosContexto = createContext<(texto: string, mala?: boolean) => void>(() => undefined);
export const useDecir = () => useContext(AvisosContexto);

export const fechaCorta = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "");
