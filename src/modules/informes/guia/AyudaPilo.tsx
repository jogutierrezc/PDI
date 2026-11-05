/* =============================================================================
   El «?» de cada zona: abre un globo con la explicación corta de Pilo, con
   «Escuchar» y «Seguir la guía desde aquí». Se pone dentro del elemento que
   lleva data-guia="<zona>" (el texto sale de AYUDAS en pasos.ts).
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { PiloFace } from "../../../components/pilo/PiloFace";
import { movimientoReducido } from "../../rankings/movimiento";
import { AYUDAS } from "./pasos";
import { useGuia } from "./contexto";
import { useVoz } from "./voz";

/** `borde`: se monta sobre el borde superior del elemento (donde no hay un título en el que ponerlo en línea). */
export function AyudaPilo({ zona, borde = false }: { zona: string; borde?: boolean }) {
  const ayuda = AYUDAS[zona];
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  if (!ayuda) return null;
  return (
    <>
      <button
        ref={boton}
        type="button"
        className={borde ? "guia-q guia-q--borde" : "guia-q"}
        aria-label={`Pilo explica: ${ayuda.nombre}`}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        onClick={() => setAbierto((v) => !v)}
      >
        ?
      </button>
      {abierto && (
        <Globo
          zona={zona}
          ancla={boton}
          cerrar={() => {
            setAbierto(false);
            boton.current?.focus();
          }}
        />
      )}
    </>
  );
}

function Globo({ zona, ancla, cerrar }: { zona: string; ancla: React.RefObject<HTMLButtonElement>; cerrar: () => void }) {
  const { abrir, pasos } = useGuia();
  const voz = useVoz();
  const raiz = useRef<HTMLDivElement>(null);
  const { texto } = AYUDAS[zona];
  const enGuia = pasos.some((p) => p.z === zona);

  useLayoutEffect(() => {
    const el = raiz.current;
    const b = ancla.current?.getBoundingClientRect();
    if (!el || !b) return;
    const w = el.offsetWidth;
    const alto = el.offsetHeight;
    const izq = Math.min(Math.max(12, b.right - w), window.innerWidth - w - 12);
    const arriba = b.bottom + 8 + alto > window.innerHeight ? Math.max(12, b.top - alto - 8) : b.bottom + 8;
    el.style.left = `${izq}px`;
    el.style.top = `${arriba}px`;
    gsap.fromTo(el, { opacity: 0, scale: movimientoReducido() ? 1 : 0.96 }, { opacity: 1, scale: 1, duration: movimientoReducido() ? 0.01 : 0.2, ease: "expo.out" });
    el.querySelector<HTMLButtonElement>("[data-escuchar]")?.focus();
  }, [ancla]);

  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!raiz.current?.contains(t) && !ancla.current?.contains(t)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", cerrar, { passive: true });
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", cerrar);
      window.removeEventListener("resize", cerrar);
    };
  });

  return createPortal(
    <div ref={raiz} className="guia-globo" role="dialog" aria-label="Explicación de Pilo">
      <div className="guia-globo__cab">
        <PiloFace size={40} expression="feliz" talking={voz.estado === "suena"} />
        <b>Pilo explica</b>
      </div>
      <p className={voz.estado === "suena" ? "is-leyendo" : undefined}>{texto}</p>
      {voz.aviso && (
        <p className="guia-aviso" role="status">
          {voz.aviso}
        </p>
      )}
      <div className="guia-fila">
        <button type="button" className="inf-btn inf-btn--sm" data-escuchar aria-pressed={voz.estado !== "quieto"} onClick={() => (voz.estado === "quieto" ? void voz.decir(texto) : voz.parar())}>
          {voz.estado === "quieto" ? "Escuchar" : voz.estado === "cargando" ? "Cargando la voz…" : "Detener"}
        </button>
        <button
          type="button"
          className="inf-btn inf-btn--pri inf-btn--sm"
          onClick={() => {
            voz.parar();
            abrir(enGuia ? zona : undefined);
            cerrar();
          }}
        >
          {enGuia ? "Seguir la guía desde aquí" : "Ver la guía completa"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
