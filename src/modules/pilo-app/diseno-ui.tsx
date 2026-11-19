/* =============================================================================
   Mr. Pilo · la app móvil · piezas del diseño nuevo (beta).

   El conmutador de Yo y de Ajustes, el título grande de las pestañas y el
   gancho que pone `data-scrolled` cuando el contenido se desplazó (el título
   grande «colapsa»: el título pequeño de la cabecera aparece con un fundido).
   Nada de esto se ve en el diseño clásico.
   ========================================================================== */

import { useEffect } from "react";
import type { RefObject } from "react";
import { tr, useLang } from "../../components/pilo/i18n";
import { useDiseno, writeDiseno } from "./diseno";

/** «Diseño nuevo (beta)»: un interruptor (role=switch) que cambia el diseño de este dispositivo. */
export function DisenoSwitch({ className }: { className?: string }) {
  useLang();
  const { diseno, setDiseno } = useDiseno();
  const on = diseno === "nuevo";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`pa-diseno${className ? ` ${className}` : ""}`}
      onClick={() => {
        const next = on ? "clasico" : "nuevo";
        writeDiseno(next);
        setDiseno(next);
      }}
    >
      <span className="pa-diseno__t">
        <strong>{tr("Diseño nuevo (beta)")}</strong>
        <small>{tr("El aspecto de Mr. Pilo para Apple. Se recuerda en este dispositivo.")}</small>
      </span>
      <span className="pa-diseno__sw" aria-hidden="true">
        <i />
      </span>
    </button>
  );
}

/**
 * Marca `data-scrolled` en el marco cuando algo dentro se desplazó más de 24 px (el evento de
 * desplazamiento no burbujea: se escucha en la captura). Solo en el diseño nuevo.
 */
export function useScrolledMark(frame: RefObject<HTMLElement>) {
  const { diseno } = useDiseno();
  useEffect(() => {
    const el = frame.current;
    if (diseno !== "nuevo" || !el) return;
    let on = false;
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.scrollTop !== "number") return;
      const next = t.scrollTop > 24;
      if (next === on) return;
      on = next;
      if (on) el.setAttribute("data-scrolled", "");
      else el.removeAttribute("data-scrolled");
    };
    el.addEventListener("scroll", onScroll, true);
    return () => {
      el.removeEventListener("scroll", onScroll, true);
      el.removeAttribute("data-scrolled");
    };
  }, [frame, diseno]);
}

/** El título grande de una pestaña (Pilo U, Carnet): 34/41 y se hace pequeño al desplazar. Solo en el diseño nuevo. */
export function TabTitle({ title }: { title: string }) {
  const { diseno } = useDiseno();
  if (diseno !== "nuevo") return null;
  return (
    <header className="pa-lt">
      <p className="pa-lt__t">{title}</p>
    </header>
  );
}
