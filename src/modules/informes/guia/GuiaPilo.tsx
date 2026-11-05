/* =============================================================================
   La Guía con Pilo: una tarjeta flotante (en móvil, una hoja inferior) sobre la
   pantalla REAL, más un foco que se mueve al elemento de cada paso
   (data-guia="<zona>"). No comprime ni mueve el contenido de fondo y nunca
   escribe datos: cada paso solo cambia de pantalla, de sección (en la
   dirección) o pinta un estado de demostración (ver contexto.tsx).
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef } from "react";
import type { PointerEvent as PointerReact } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { PiloFace } from "../../../components/pilo/PiloFace";
import { movimientoReducido } from "../../rankings/movimiento";
import { useGuia } from "./contexto";
import { CAPITULOS } from "./pasos";
import { useVoz } from "./voz";

const BASE = "/admin/informes-gestion";

export function GuiaPilo() {
  const { abierta } = useGuia();
  return abierta ? createPortal(<Tarjeta />, document.body) : null;
}

function Tarjeta() {
  const { pasos, paso, ir, cerrar, hablar, setHablar, registro } = useGuia();
  const p = pasos[paso];
  const tarjeta = useRef<HTMLElement>(null);
  const foco = useRef<HTMLDivElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const arrastrada = useRef(false);
  const arrastre = useRef<{ dx: number; dy: number } | null>(null);
  const { estado, aviso, decir, parar } = useVoz();
  const loc = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { seccion } = useParams();
  const reducido = movimientoReducido();
  const dur = (s: number) => (reducido ? 0.01 : s);

  /* ---- Cada paso lleva la pantalla real a su lugar (solo la dirección: no se toca ningún dato) ---- */
  useEffect(() => {
    if (!p) return;
    const q = new URLSearchParams();
    const anio = params.get("anio");
    if (anio) q.set("anio", anio);
    if (p.v === "mi-informe" || p.v === "vista") {
      const unidad = params.get("unidad");
      if (unidad) q.set("unidad", unidad);
    }
    if (p.v === "mi-informe") {
      const i = p.tipo && registro ? registro.tipos.indexOf(p.tipo) : -1;
      const s = i >= 0 ? String(i + 1) : params.get("s");
      if (s) q.set("s", s);
    }
    const ruta = p.v === "tablero" ? BASE : `${BASE}/${p.v}`;
    const sigue = loc.pathname.replace(/\/$/, "") === ruta || (p.v === "tablero" && !seccion && loc.pathname.replace(/\/$/, "") === BASE);
    if (sigue && loc.search.replace(/^\?/, "") === q.toString()) return;
    navigate({ pathname: ruta, search: q.toString() }, { replace: true });
    // Solo al cambiar de paso: lo que la persona haga después con la pantalla es suyo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, p?.z, p?.v, p?.tipo]);

  /* ---- Foco y colocación de la tarjeta ---- */
  useLayoutEffect(() => {
    const c = tarjeta.current;
    if (!c) return;
    gsap.set(c, { x: window.innerWidth - c.offsetWidth - 16, y: window.innerHeight - c.offsetHeight - 16 });
    gsap.fromTo(c, { opacity: 0 }, { opacity: 1, duration: dur(0.25), ease: "expo.out" });
    const previo = document.activeElement;
    c.focus({ preventScroll: true });
    document.body.classList.add("guia-abierta");
    return () => {
      document.body.classList.remove("guia-abierta");
      if (previo instanceof HTMLElement && document.contains(previo)) previo.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const f = foco.current;
    const c = tarjeta.current;
    if (!p || !f || !c) return;
    arrastrada.current = false;
    let ultimo: Element | null = null;
    let firma = "";
    let raf = 0;

    const ubicarFoco = (r: DOMRect, animar: boolean) => {
      const a = { x: r.left - 6, y: r.top - 6, width: r.width + 12, height: r.height + 12, opacity: 1 };
      gsap.killTweensOf(f);
      if (animar && !reducido && +gsap.getProperty(f, "opacity") > 0) gsap.to(f, { ...a, duration: 0.5, ease: "expo.out" });
      else gsap.set(f, a);
    };
    // La tarjeta se va a la esquina que menos tapa el elemento señalado.
    const ubicarTarjeta = (r: DOMRect) => {
      if (window.innerWidth <= 700 || arrastrada.current) return;
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      const m = 16;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const esquinas = [
        { x: vw - w - m, y: vh - h - m },
        { x: m, y: vh - h - m },
        { x: vw - w - m, y: m },
        { x: m, y: m },
      ];
      const solape = (e: { x: number; y: number }) =>
        Math.max(0, Math.min(e.x + w, r.right + 14) - Math.max(e.x, r.left - 14)) * Math.max(0, Math.min(e.y + h, r.bottom + 14) - Math.max(e.y, r.top - 14));
      let mejor = esquinas[0];
      for (const e of esquinas) if (solape(e) < solape(mejor) - 1) mejor = e;
      gsap.killTweensOf(c, "x,y");
      if (reducido) gsap.set(c, mejor);
      else gsap.to(c, { ...mejor, duration: 0.45, ease: "expo.out" });
    };

    const tick = () => {
      const el = document.querySelector(`[data-guia="${p.z}"]`);
      if (!el) {
        if (ultimo) gsap.to(f, { opacity: 0, duration: dur(0.2) });
        ultimo = null;
        firma = "";
        return;
      }
      const r = el.getBoundingClientRect();
      const nueva = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (el !== ultimo) {
        ultimo = el;
        firma = nueva;
        const tope = window.innerWidth <= 700 ? window.innerHeight * 0.5 : window.innerHeight;
        const lejos = r.top < 90 || r.bottom > tope - 20;
        if (lejos) window.scrollTo({ top: window.scrollY + r.top - 100, behavior: reducido ? "auto" : "smooth" });
        ubicarFoco(r, !lejos);
        ubicarTarjeta(r);
      } else if (nueva !== firma) {
        firma = nueva;
        ubicarFoco(r, false);
      }
    };
    const alMover = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    // El intervalo recoge lo que tarda en cargar (datos, cambio de sección) y los cambios de tamaño.
    const reloj = window.setInterval(tick, 200);
    window.addEventListener("scroll", alMover, { passive: true });
    window.addEventListener("resize", alMover);
    tick();
    return () => {
      window.clearInterval(reloj);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", alMover);
      window.removeEventListener("resize", alMover);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, p?.z]);

  /* ---- Texto del paso: entra con un movimiento corto; en movimiento reducido, solo un fundido ---- */
  useLayoutEffect(() => {
    if (cuerpo.current) gsap.fromTo(cuerpo.current, { opacity: 0, y: reducido ? 0 : 8 }, { opacity: 1, y: 0, duration: dur(0.3), ease: "expo.out", clearProps: "transform" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  /* ---- «Leer cada paso» ---- */
  useEffect(() => {
    parar();
    if (!hablar || !p) return;
    const t = window.setTimeout(() => void decir(p.x), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, hablar]);

  /* ---- Teclado: Escape cierra, flechas navegan (salvo escribiendo) ---- */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!document.querySelector(".guia-globo")) cerrar();
        return;
      }
      const t = e.target as HTMLElement | null;
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !t?.closest("input, textarea, select, [contenteditable='true']")) {
        e.preventDefault();
        ir(paso + (e.key === "ArrowRight" ? 1 : -1));
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [paso, ir, cerrar]);

  if (!p) return null;
  const ultimoPaso = paso === pasos.length - 1;
  const capitulos = CAPITULOS.map((nombre, i) => ({ nombre, i, primero: pasos.findIndex((x) => x.c === i) })).filter((c) => c.primero >= 0);

  const empezarArrastre = (e: PointerReact<HTMLDivElement>) => {
    const c = tarjeta.current;
    if (!c || window.innerWidth <= 700 || (e.target as HTMLElement).closest("button")) return;
    arrastre.current = { dx: e.clientX - +gsap.getProperty(c, "x"), dy: e.clientY - +gsap.getProperty(c, "y") };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const arrastrar = (e: PointerReact<HTMLDivElement>) => {
    const c = tarjeta.current;
    if (!arrastre.current || !c) return;
    arrastrada.current = true;
    gsap.killTweensOf(c, "x,y");
    gsap.set(c, { x: Math.min(Math.max(0, e.clientX - arrastre.current.dx), window.innerWidth - c.offsetWidth), y: Math.min(Math.max(0, e.clientY - arrastre.current.dy), window.innerHeight - 60) });
  };

  return (
    <>
      <div ref={foco} className="guia-foco" aria-hidden="true" />
      <aside ref={tarjeta} className="guia" role="dialog" aria-label="Guía con Pilo" tabIndex={-1}>
        <div className="guia__cab" title="Arrastre para mover" onPointerDown={empezarArrastre} onPointerMove={arrastrar} onPointerUp={() => (arrastre.current = null)} onPointerCancel={() => (arrastre.current = null)}>
          <PiloFace size={56} expression="feliz" talking={estado === "suena"} alive />
          <div className="guia__tit">
            <b>Guía con Pilo</b>
            <span>
              Paso {paso + 1} de {pasos.length} · {CAPITULOS[p.c]}
            </span>
          </div>
          <button type="button" className="guia__x" aria-label="Cerrar la guía" onClick={cerrar}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="guia__prog" role="progressbar" aria-label="Avance de la guía" aria-valuemin={1} aria-valuemax={pasos.length} aria-valuenow={paso + 1}>
          <i style={{ transform: `scaleX(${(paso + 1) / pasos.length})` }} />
        </div>
        <div className="guia__cuerpo">
          <div ref={cuerpo} aria-live="polite" aria-atomic="true" className="guia__paso">
            <h2>{p.t}</h2>
            {registro?.visor && <p className="guia__nota">Usted tiene rol de Consulta: ve el informe pero no lo edita. La guía le sirve para entender lo que ve.</p>}
            <p className={estado === "suena" ? "guia__txt is-leyendo" : "guia__txt"}>{p.x}</p>
            {aviso && (
              <p className="guia-aviso" role="status">
                {aviso}
              </p>
            )}
          </div>
        </div>
        <div className="guia__pie">
          <div className="guia-fila">
            <button type="button" className="inf-btn inf-btn--sm" aria-pressed={estado !== "quieto"} onClick={() => (estado === "quieto" ? void decir(p.x) : parar())}>
              {estado === "quieto" ? "Escuchar" : estado === "cargando" ? "Cargando la voz…" : "Detener"}
            </button>
            <label className="guia__leer">
              <input type="checkbox" checked={hablar} onChange={(e) => setHablar(e.target.checked)} />
              Leer cada paso
            </label>
          </div>
          <div className="guia-fila">
            <button type="button" className="inf-btn" disabled={paso === 0} onClick={() => ir(paso - 1)}>
              Anterior
            </button>
            <button type="button" className="inf-btn inf-btn--pri" onClick={() => (ultimoPaso ? cerrar() : ir(paso + 1))}>
              {ultimoPaso ? "Terminar" : "Siguiente"}
            </button>
          </div>
          <div className="guia__caps">
            {capitulos.map((c) => (
              <button key={c.i} type="button" aria-pressed={c.i === p.c} onClick={() => ir(c.primero)}>
                {c.nombre}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
