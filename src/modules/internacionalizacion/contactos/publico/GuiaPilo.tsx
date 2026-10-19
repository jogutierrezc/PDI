/* =============================================================================
   Contactos · público · Mr. Pilo guía el proceso.

   La escena de la presentación de Pilo (burbuja y cara) llevada al enlace de
   invitación: Pilo habla en una burbuja, las palabras llegan una a una y su cara
   cambia de gesto según el momento (las imágenes aprobadas de public/pilo-moods).

   Movimiento (GSAP, siempre dentro de un contexto que se revierte al desmontar):
     · la burbuja escribe palabra a palabra (≤ 180 ms cada una, expo.out); si el
       mensaje cambia mientras escribe —o cambia otra vez enseguida, como al pasar
       de un campo a otro— se cancela el anterior y el nuevo aparece sin animación;
     · la cara da un pulso corto (300 ms) al cambiar de gesto;
     · con movimiento reducido: todo aparece de una vez.
   La burbuja es aria-live="polite": lee el mensaje completo una sola vez.
   ========================================================================== */

import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { movimientoReducido } from "../../ui/movimiento";

export type GestoPilo = "feliz" | "idea" | "piensa" | "excelente" | "duda" | "bien";

export interface MensajePilo {
  /** Cambia con cada mensaje, aunque el texto se repita (para volver a escribirlo). */
  id: number;
  texto: string;
  gesto: GestoPilo;
  /** Una línea pequeña debajo («Correo confirmado por Microsoft»). */
  nota?: string;
}

export type Decir = (texto: string, gesto?: GestoPilo, nota?: string) => void;

const DecirCtx = createContext<Decir>(() => undefined);
export const DecirProvider = DecirCtx.Provider;
/** Para que una pantalla le dé la palabra a Pilo. */
export const useDecir = (): Decir => useContext(DecirCtx);

const useLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

const base = () => (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
const rutaGesto = (g: GestoPilo, ancho: 160 | 320) => `${base()}pilo-moods/${g}-${ancho}.webp`;

/** La cara de Pilo con el gesto del momento. Pulso corto al cambiar de gesto. */
export function CaraPilo({ gesto, tamano = 92, className }: { gesto: GestoPilo; tamano?: number; className?: string }) {
  const img = useRef<HTMLImageElement>(null);
  const primero = useRef(true);
  useLayout(() => {
    if (primero.current) {
      primero.current = false;
      return;
    }
    const nodo = img.current;
    if (!nodo || movimientoReducido()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(nodo, { scale: 0.92, y: 5 }, { scale: 1, y: 0, duration: 0.3, ease: "expo.out", clearProps: "transform" });
    }, nodo);
    return () => ctx.revert();
  }, [gesto]);
  return (
    <img
      ref={img}
      className={className}
      src={rutaGesto(gesto, 160)}
      srcSet={`${rutaGesto(gesto, 160)} 160w, ${rutaGesto(gesto, 320)} 320w`}
      sizes={`${tamano}px`}
      alt=""
      width={tamano}
      height={tamano}
      decoding="async"
    />
  );
}

/** Pilo hablando: la cara y la burbuja. */
export function PiloHabla({ mensaje }: { mensaje: MensajePilo }) {
  const burbuja = useRef<HTMLDivElement>(null);
  const ultimo = useRef(0);

  // Palabra a palabra. Cambiar de mensaje revierte el contexto: se cancela el que iba a medias.
  useLayout(() => {
    const nodo = burbuja.current;
    if (!nodo) return;
    const ahora = Date.now();
    const rapido = ahora - ultimo.current < 500;
    ultimo.current = ahora;
    if (movimientoReducido() || rapido) return;
    const ctx = gsap.context(() => {
      const palabras = nodo.querySelectorAll<HTMLElement>("[data-w]");
      if (!palabras.length) return;
      gsap.fromTo(palabras, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.18, ease: "expo.out", stagger: Math.min(0.028, 0.9 / palabras.length), clearProps: "transform,opacity" });
    }, nodo);
    return () => ctx.revert();
  }, [mensaje.id]);

  const trozos = mensaje.texto.split(/(\s+)/);
  return (
    <div className="cp-pilo">
      <div className="cp-cara">
        <CaraPilo gesto={mensaje.gesto} />
      </div>
      <div className="cp-burbuja" ref={burbuja} role="status" aria-live="polite" aria-atomic="true">
        <span className="cp-burbuja-quien" aria-hidden="true">
          Mr. Pilo
        </span>
        {trozos.map((w, i) =>
          /^\s+$/.test(w) ? (
            <span className="cp-w" key={i}>
              {" "}
            </span>
          ) : (
            <span className="cp-w" data-w key={i}>
              {w}
            </span>
          ),
        )}
        {mensaje.nota && <small>{mensaje.nota}</small>}
      </div>
    </div>
  );
}

/** El titular grande: las palabras entran escalonadas (40 ms) cuando cambia `clave`. */
export function Titular({ texto, bajada, clave }: { texto: string; bajada: string; clave: string }) {
  const raiz = useRef<HTMLDivElement>(null);
  useLayout(() => {
    const nodo = raiz.current;
    if (!nodo) return;
    const ctx = gsap.context(() => {
      const palabras = nodo.querySelectorAll<HTMLElement>("[data-t]");
      const lead = nodo.querySelector<HTMLElement>("[data-lead]");
      if (movimientoReducido()) {
        gsap.fromTo(nodo, { opacity: 0 }, { opacity: 1, duration: 0.14, ease: "power2.out", clearProps: "opacity" });
        return;
      }
      gsap.fromTo(palabras, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: "expo.out", stagger: 0.04, clearProps: "transform,opacity" });
      if (lead) gsap.fromTo(lead, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "expo.out", delay: 0.12, clearProps: "transform,opacity" });
    }, nodo);
    return () => ctx.revert();
  }, [clave]);
  const palabras = texto.split(" ");
  return (
    <div ref={raiz} className="cp-titular">
      <h1>
        {palabras.map((w, i) => (
          <span className="cp-t" data-t key={i}>
            {w}
            {i < palabras.length - 1 ? " " : ""}
          </span>
        ))}
      </h1>
      <p className="cp-lead" data-lead>
        {bajada}
      </p>
    </div>
  );
}
