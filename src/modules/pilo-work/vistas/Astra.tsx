/* =============================================================================
   Pilo at Work · Pilo Astra 1.0 · la interfaz del chat.

   Cuatro piezas, todas con los tokens de work.css:
     · MotorSwitch     el interruptor Pilo / Astra junto al campo de mensaje.
     · AstraOpciones   razonamiento (automático, profundo, apagado). La memoria, el rol y
                       las reglas de Pilo se muestran como siempre activos: no se apagan.
     · AstraBienvenida Pilo astronauta y, al lado, «Pilo Astra 1.0».
     · AstraAviso      el aviso de lanzamiento, una sola vez por persona.

   Movimiento (skills impeccable / emil / animate, con GSAP): ease-out fuerte (expo.out),
   entradas de 220 a 400 ms, solo transform y opacidad, nunca desde scale(0). Sin ciclos
   infinitos. Con prefers-reduced-motion todo queda visible y quieto.
   ========================================================================== */

import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { movimientoReducido } from "../../rankings/movimiento";
import { ASTRA_NOMBRE, RAZONAMIENTOS } from "../astra";
import type { Motor, Razonamiento } from "../astra";
import { IC } from "../ui";

const EO = "expo.out";
export const ASTRONAUTA = { chico: "/pilo-moods/astronauta-160.webp", medio: "/pilo-moods/astronauta-320.webp", grande: "/pilo-moods/astronauta-640.webp" } as const;

/** La estrella de Astra: una forma de cuatro puntas, sin relleno de marca ajena. */
export const Estrella = forwardRef<SVGSVGElement, { className?: string }>(function Estrella({ className = "astra-star" }, ref) {
  return (
    <svg ref={ref} className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2C12.8 8 16 11.2 22 12C16 12.8 12.8 16 12 22C11.2 16 8 12.8 2 12C8 11.2 11.2 8 12 2Z" fill="currentColor" />
    </svg>
  );
});

/** Un pequeño giro al pasar el puntero (solo con puntero fino), igual en todos los Pilo de esta pantalla. */
function useGiro<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || movimientoReducido() || !window.matchMedia("(hover:hover) and (pointer:fine)").matches) return;
    const dentro = () => gsap.to(el, { rotation: 5, y: -3, duration: 0.3, ease: EO, overwrite: "auto" });
    const fuera = () => gsap.to(el, { rotation: 0, y: 0, duration: 0.35, ease: EO, overwrite: "auto" });
    el.addEventListener("mouseenter", dentro);
    el.addEventListener("mouseleave", fuera);
    return () => {
      el.removeEventListener("mouseenter", dentro);
      el.removeEventListener("mouseleave", fuera);
      gsap.killTweensOf(el);
    };
  }, []);
  return ref;
}

/* --- El interruptor ------------------------------------------------------------------------- */

export function MotorSwitch({ motor, onChange, nuevo }: { motor: Motor; onChange: (m: Motor) => void; nuevo: boolean }) {
  const ind = useRef<HTMLSpanElement>(null);
  const estrella = useRef<SVGSVGElement>(null);
  const primera = useRef(true);

  useLayoutEffect(() => {
    const el = ind.current;
    if (!el) return;
    const x = motor === "astra" ? 100 : 0;
    if (primera.current || movimientoReducido()) {
      gsap.set(el, { xPercent: x });
      primera.current = false;
      return;
    }
    gsap.to(el, { xPercent: x, duration: 0.28, ease: EO, overwrite: true });
    if (motor === "astra" && estrella.current) gsap.fromTo(estrella.current, { rotation: -90, scale: 0.6 }, { rotation: 0, scale: 1, duration: 0.4, ease: EO, clearProps: "transform" });
  }, [motor]);

  const flechas = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const otro: Motor = motor === "pilo" ? "astra" : "pilo";
    onChange(otro);
    (e.currentTarget.querySelector(`[data-motor="${otro}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div className="astra-eng" role="radiogroup" aria-label="Motor de Pilo" data-motor={motor} onKeyDown={flechas}>
      <span className="astra-eng__ind" ref={ind} aria-hidden="true" />
      <button type="button" role="radio" aria-checked={motor === "pilo"} tabIndex={motor === "pilo" ? 0 : -1} data-motor="pilo" onClick={() => onChange("pilo")}>
        Pilo
      </button>
      <button type="button" role="radio" aria-checked={motor === "astra"} tabIndex={motor === "astra" ? 0 : -1} data-motor="astra" onClick={() => onChange("astra")} title={ASTRA_NOMBRE}>
        <Estrella ref={estrella} />
        <span>Astra</span>
        {nuevo && motor !== "astra" && <span className="astra-new">Nuevo</span>}
      </button>
    </div>
  );
}

/* --- Las opciones ---------------------------------------------------------------------------- */

export function AstraOpciones({ abierto, razon, setRazon, cerrar, disparador }: { abierto: boolean; razon: Razonamiento; setRazon: (r: Razonamiento) => void; cerrar: () => void; disparador: React.RefObject<HTMLElement | null> }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (caja.current?.contains(t) || disparador.current?.contains(t)) return;
      cerrar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cerrar();
        disparador.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto, cerrar, disparador]);

  const ayuda = RAZONAMIENTOS.find((r) => r.id === razon)?.ayuda ?? "";
  return (
    <div className="astra-pop" ref={caja} id="astra-opciones" role="dialog" aria-label="Opciones de Pilo Astra 1.0" data-open={abierto || undefined} aria-hidden={!abierto}>
      <div className="astra-pop__row">
        <h4>Razonamiento</h4>
        <div className="astra-seg" role="radiogroup" aria-label="Razonamiento">
          {RAZONAMIENTOS.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={razon === r.id} onClick={() => setRazon(r.id)}>
              {r.etiqueta}
            </button>
          ))}
        </div>
        <p className="muted small">{ayuda}</p>
      </div>
      <div className="astra-lock">
        {IC.shield}
        <span>
          <b>Memoria, rol y reglas de Pilo: siempre activos.</b> No se pueden apagar con Astra.
        </span>
      </div>
    </div>
  );
}

/* --- La bienvenida --------------------------------------------------------------------------- */

export function AstraBienvenida({ nombre }: { nombre: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const giro = useGiro<HTMLImageElement>();
  useLayoutEffect(() => {
    if (movimientoReducido() || !caja.current) return;
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: EO } })
        .from(".astra-wel__pilo", { x: -22, opacity: 0, rotation: -6, duration: 0.55, clearProps: "transform,opacity" }, 0)
        .from(".astra-wel__wm .astra-star", { rotation: -180, scale: 0.4, opacity: 0, duration: 0.65, clearProps: "transform,opacity" }, 0.1)
        .from(".astra-wel__txt > *", { y: 10, opacity: 0, duration: 0.4, stagger: 0.06, clearProps: "transform,opacity" }, 0.1);
    }, caja);
    return () => ctx.revert();
  }, []);
  return (
    <div className="astra-wel" ref={caja}>
      <img ref={giro} className="astra-wel__pilo" src={ASTRONAUTA.medio} alt="Pilo con casco de astronauta" width={136} height={160} />
      <div className="astra-wel__txt">
        <div className="astra-wel__wm">
          <Estrella />
          {ASTRA_NOMBRE}
        </div>
        <h4>Hola, {nombre}. Cuénteme el problema y lo resolvemos paso a paso.</h4>
        <p className="muted">Razono, escribo código y entrego el trabajo ordenado. Tardo más que Pilo; vale la pena para lo complejo. Sigo siendo Pilo: con su memoria, su rol y sus reglas.</p>
      </div>
    </div>
  );
}

/* --- El aviso de lanzamiento ----------------------------------------------------------------- */

const CAPACIDADES: { icono: React.ReactNode; titulo: string; texto: string }[] = [
  { icono: <Estrella />, titulo: "Razona paso a paso", texto: "Matemática, lógica y cálculos con su desarrollo a la vista." },
  { icono: IC.cow, titulo: "Escribe y revisa código", texto: "SQL, Python, Excel, macros y cualquier otro lenguaje." },
  { icono: IC.doc, titulo: "Lee y entiende documentos", texto: "PDF, Word, Excel y CSV, procesados en el servidor de la universidad." },
  { icono: IC.send, titulo: "Entrega archivos listos", texto: "Excel, Word, PDF, CSV y código para descargar." },
];

export function AstraAviso({ onProbar, onCerrar }: { onProbar: () => void; onCerrar: () => void }) {
  const tarjeta = useRef<HTMLDivElement>(null);
  const probar = useRef<HTMLButtonElement>(null);
  const antes = useRef<Element | null>(null);

  useLayoutEffect(() => {
    antes.current = document.activeElement;
    probar.current?.focus({ preventScroll: true });
    if (movimientoReducido() || !tarjeta.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".astra-aviso__scrim", { opacity: 0, duration: 0.16, ease: "power1.out" });
      gsap
        .timeline({ defaults: { ease: EO } })
        .from(tarjeta.current, { opacity: 0, y: 8, scale: 0.97, duration: 0.24, clearProps: "transform,opacity" }, 0)
        .from(".astra-aviso__orbit", { rotation: -24, svgOrigin: "380 82", duration: 1.4 }, 0)
        .from(".astra-aviso__dots circle", { opacity: 0, duration: 0.5, stagger: 0.08 }, 0.2)
        .from(".astra-aviso__pilo", { y: 28, opacity: 0, rotation: -6, duration: 0.55, clearProps: "transform,opacity" }, 0.08)
        .from(".astra-aviso__wm", { x: -10, opacity: 0, duration: 0.4, clearProps: "transform,opacity" }, 0.15)
        .from(".astra-aviso h3, .astra-aviso__lead", { y: 8, opacity: 0, duration: 0.35, stagger: 0.05, clearProps: "transform,opacity" }, 0.15)
        .from(".astra-aviso__caps li", { x: -10, opacity: 0, duration: 0.35, stagger: 0.06, clearProps: "transform,opacity" }, 0.25)
        .from(".astra-aviso__same, .astra-aviso__acts", { y: 8, opacity: 0, duration: 0.3, stagger: 0.05, clearProps: "transform,opacity" }, 0.5);
    }, tarjeta);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const previo = antes.current as HTMLElement | null;
    return () => previo?.focus?.({ preventScroll: true });
  }, []);

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCerrar();
      return;
    }
    if (e.key !== "Tab" || !tarjeta.current) return;
    const bs = Array.from(tarjeta.current.querySelectorAll<HTMLElement>("button"));
    const a = bs[0];
    const z = bs[bs.length - 1];
    if (e.shiftKey && document.activeElement === a) {
      e.preventDefault();
      z.focus();
    } else if (!e.shiftKey && document.activeElement === z) {
      e.preventDefault();
      a.focus();
    }
  };

  return (
    <div className="astra-aviso" onKeyDown={teclas}>
      <div className="astra-aviso__scrim" onClick={onCerrar} aria-hidden="true" />
      <div className="astra-aviso__card" ref={tarjeta} role="dialog" aria-modal="true" aria-labelledby="astra-aviso-t">
        <div className="astra-aviso__art" aria-hidden="true">
          <svg className="astra-aviso__orb" viewBox="0 0 480 148" preserveAspectRatio="xMidYMid slice">
            <g className="astra-aviso__orbit" fill="none" stroke="#7fe7f0" strokeOpacity=".22">
              <ellipse cx="380" cy="82" rx="170" ry="46" transform="rotate(-14 380 82)" />
              <ellipse cx="380" cy="82" rx="120" ry="30" transform="rotate(-14 380 82)" />
              <ellipse cx="380" cy="82" rx="70" ry="16" transform="rotate(-14 380 82)" />
            </g>
            <g className="astra-aviso__dots" fill="#7fe7f0">
              <circle cx="226" cy="34" r="2.2" opacity=".8" />
              <circle cx="262" cy="118" r="1.6" opacity=".6" />
              <circle cx="468" cy="26" r="2" opacity=".7" />
              <circle cx="300" cy="62" r="1.4" opacity=".5" />
            </g>
          </svg>
          <span className="astra-new astra-aviso__badge">Nuevo en At Work</span>
          <div className="astra-aviso__wm">
            <Estrella />
            {ASTRA_NOMBRE}
          </div>
          <img className="astra-aviso__pilo" src={ASTRONAUTA.grande} alt="" width={128} height={150} />
        </div>
        <div className="astra-aviso__body">
          <h3 id="astra-aviso-t">Conozca {ASTRA_NOMBRE}</h3>
          <p className="astra-aviso__lead">Un motor más potente para el trabajo de oficina. Corre en el servidor propio de la universidad.</p>
          <ul className="astra-aviso__caps">
            {CAPACIDADES.map((c) => (
              <li key={c.titulo}>
                <span className="astra-aviso__ic">{c.icono}</span>
                <div>
                  <b>{c.titulo}</b>
                  <span>{c.texto}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="astra-aviso__same">
            <span aria-hidden="true">{IC.shield}</span>
            <span>Sigue siendo Pilo: conserva su memoria, su rol y sus reglas. Solo cambia el motor.</span>
          </div>
          <div className="astra-aviso__acts">
            <button type="button" className="btn primary" ref={probar} onClick={onProbar}>
              Probar Astra
            </button>
            <button type="button" className="btn" onClick={onCerrar}>
              Ahora no
            </button>
            <span className="astra-aviso__once muted small">Este aviso se muestra una sola vez.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
