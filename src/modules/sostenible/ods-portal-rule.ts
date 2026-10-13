/* =============================================================================
   UDES Sostenible · subrayado que se desliza bajo la opción activa.

   Lo usan la barra de vistas de los informes ODS y los conmutadores del
   portal. Es un filete de 1 px de ancho que se lleva con transform
   (translate + scaleX) hasta la opción con aria-pressed="true" o
   aria-current="page". Con `memory`, recuerda dónde estaba al cambiar de
   página y arranca desde ahí. Sin JS, la opción activa se subraya en CSS.
   ========================================================================== */

import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { reduced } from "./widgets";

const last = new Map<string, string>();

export function useSlidingRule(box: RefObject<HTMLElement | null>, dep: unknown, memory?: string) {
  const ready = useRef(false);

  useLayoutEffect(() => {
    const el = box.current;
    const rule = el?.querySelector<HTMLElement>(":scope > .opt-rule");
    if (!el || !rule) return;

    const place = (animate: boolean) => {
      const on = el.querySelector<HTMLElement>('[aria-pressed="true"], [aria-current="page"]');
      if (!on) {
        rule.style.opacity = "0";
        return;
      }
      const t = `translate(${on.offsetLeft}px, ${on.offsetTop + on.offsetHeight - 2}px) scaleX(${on.offsetWidth})`;
      rule.style.transition = animate && !reduced() ? "" : "none";
      rule.style.opacity = "1";
      rule.style.transform = t;
      if (memory) last.set(memory, t);
    };

    const from = memory ? last.get(memory) : undefined;
    if (!ready.current && from && !reduced()) {
      rule.style.transition = "none";
      rule.style.opacity = "1";
      rule.style.transform = from;
      void rule.offsetWidth;
      place(true);
    } else {
      place(ready.current);
    }
    ready.current = true;
    el.classList.add("has-rule");

    /* El observador avisa una vez al empezar: esa primera llamada no debe cortar el deslizamiento. */
    let first = true;
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (first) first = false;
            else place(false);
          });
    ro?.observe(el);
    /* Al llegar la fuente cambian los anchos de las opciones. */
    let live = true;
    if (document.fonts && document.fonts.status !== "loaded") void document.fonts.ready.then(() => live && place(false));
    return () => {
      live = false;
      ro?.disconnect();
    };
  }, [box, dep, memory]);
}
