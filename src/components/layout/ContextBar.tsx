/* =============================================================================
   Barra de contexto (debajo de la barra unificada).

   La usan el Plan de Desarrollo y el Observatorio, con la misma forma:
   · Regresar: al índice de lo que se está viendo.
   · Un conmutador pequeño entre vistas hermanas (PDI) o accesos sueltos
     (Boletines en UDES en Cifras y el Observatorio).
   · Los destinos del mismo nivel (pilares, temas): color y código siempre;
     el actual se despliega con su nombre y los demás lo muestran en un
     rótulo al pasar el cursor o el foco.

   Es pegajosa. Mientras está en la página su alto se suma a --header-h, así
   lo que ya se pegaba bajo la cabecera se corre solo debajo de ella.
   ========================================================================== */

import { useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import "./context-bar.css";

export interface ContextView {
  label: string;
  to: string;
  current: boolean;
}

export interface ContextItem {
  key: string;
  to: string;
  code: string;
  name: string;
  /** Color del destino (variable CSS). */
  tone: string;
  current: boolean;
  /** Rótulo completo para el cursor y los lectores de pantalla. */
  label: string;
  /** Avance 0-100 para el filete inferior; sin él, no se dibuja. */
  fill?: number;
  /** Marca adicional (por ejemplo, un tema que ya publica datos). */
  flag?: boolean;
}

export function ContextBar({
  label,
  back,
  viewsLabel,
  views,
  links,
  itemsLabel,
  items,
}: {
  label: string;
  back: { to: string; label: string };
  viewsLabel?: string;
  views?: ContextView[];
  /** Accesos sueltos junto a regresar (por ejemplo, Boletines). */
  links?: { label: string; to: string }[];
  itemsLabel: string;
  items: ContextItem[];
}) {
  const bar = useRef<HTMLDivElement>(null);

  // Su alto se suma a --header-h: lo pegajoso de la página se acomoda debajo.
  useLayoutEffect(() => {
    const el = bar.current;
    const root = document.documentElement;
    if (!el) return;
    const apply = () => root.style.setProperty("--ctx-bar-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    apply();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--ctx-bar-h");
    };
  }, []);

  return (
    <div ref={bar} className="ctx-bar" role="navigation" aria-label={label}>
      <div className="ctx-bar__inner">
        <Link className="ctx-bar__back" to={back.to}>
          <Icon name="arrow-left" size={16} />
          <span>{back.label}</span>
        </Link>

        {views && views.length > 0 && (
          <div className="ctx-bar__views" role="group" aria-label={viewsLabel}>
            {views.map((v) => (
              <Link key={v.to} to={v.to} aria-current={v.current ? "page" : undefined}>
                {v.label}
              </Link>
            ))}
          </div>
        )}
        {links?.map((l) => (
          <Link key={l.to} className="ctx-bar__link" to={l.to}>
            <Icon name="document" size={15} />
            {l.label}
          </Link>
        ))}

        <ol className="ctx-bar__items" aria-label={itemsLabel} data-many={items.length > 8 || undefined}>
          {items.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                className="ctx-pill"
                aria-current={item.current ? "page" : undefined}
                aria-label={item.label}
                data-label={item.label}
                data-flag={item.flag || undefined}
                style={{ "--tone": item.tone, "--fill": `${Math.min(100, Math.max(4, item.fill ?? 0))}%` } as CSSProperties}
              >
                <span className="ctx-pill__code">{item.code}</span>
                {item.current && <span className="ctx-pill__name">{item.name}</span>}
                {item.fill !== undefined && <i className="ctx-pill__bar" aria-hidden="true" />}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
