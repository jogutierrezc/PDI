/* =============================================================================
   Pie de página único de los portales de Planeación.

   Gris claro (y gris azulado en oscuro, desde los mismos tokens), con el logo
   suelto —sin caja—, el contacto de la oficina, los portales y la oficina en
   dos columnas, y una barra final con el volver arriba. Entra escalonado al
   verse; con movimiento reducido ya está puesto. La oficina viene publicada
   desde la intranet («Página de la oficina»).
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { useOfficePage } from "../../modules/planeacion/page";
import { UdesLogo } from "./UdesLogo";
import "./site-footer.css";

const PORTALS: [string, string][] = [
  ["/pdi", "Plan de Desarrollo"],
  ["/datos-abiertos", "UDES en Cifras"],
  ["/datos-abiertos/observatorio", "Observatorio"],
  ["/sostenible", "UDES Sostenible"],
  ["/datos-abiertos/boletines", "Boletines"],
  ["/rutas", "Rutas de transporte"],
];

const OFFICE: [string, string][] = [
  ["/equipo", "Nuestro equipo"],
  ["/documentos", "Documentos"],
  ["/pregunta", "Pregúntele a Pilo"],
  ["/desarrollo-tecnologico", "Desarrollo tecnológico"],
  ["/acceso-intranet", "Iniciar sesión"],
];

const reduced = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** El botón de volver arriba: un anillo que se llena con lo que llevas leído de la página. */
function BackToTop() {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      ref.current?.style.setProperty("--p", String(max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 100));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <button ref={ref} type="button" className="sf-top" aria-label="Volver arriba" onClick={() => window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" })}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}

export function SiteFooter({ note }: { note?: ReactNode }) {
  const { page } = useOfficePage();
  const office = page.office;
  const root = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el || reduced() || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <footer ref={root} className="sf" id="pie" data-seen={seen}>
      <div className="sf-wrap">
        <div className="sf-main">
          <section className="sf-brand sf-r" style={{ "--i": 0 } as React.CSSProperties} aria-label="Contacto">
            <UdesLogo height={52} />
            <p className="sf-tag">
              <strong>{office.name}</strong>
              Cifras oficiales de la Universidad, con su corte y su procedencia.
            </p>
            <ul className="sf-contact">
              {office.address && (
                <li>
                  <Icon name="pin" size={16} />
                  <span>{office.address}</span>
                </li>
              )}
              {office.phone && (
                <li>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
                  </svg>
                  <a href={`tel:${office.phone.replace(/\s+/g, "")}`}>{office.phone}</a>
                </li>
              )}
              <li>
                <Icon name="mail" size={16} />
                <a href={`mailto:${office.email}`}>{office.email}</a>
              </li>
            </ul>
            {note && <p className="sf-note">{note}</p>}
          </section>

          <nav className="sf-col sf-r" style={{ "--i": 1 } as React.CSSProperties} aria-label="Portales">
            <h2 className="sf-h">Portales</h2>
            {PORTALS.map(([to, label]) => (
              <Link key={to} className="sf-link" to={to}>
                {label}
              </Link>
            ))}
          </nav>

          <nav className="sf-col sf-r" style={{ "--i": 2 } as React.CSSProperties} aria-label="La oficina">
            <h2 className="sf-h">La oficina</h2>
            {OFFICE.map(([to, label]) => (
              <Link key={to} className="sf-link" to={to}>
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="sf-bar sf-r" style={{ "--i": 3 } as React.CSSProperties}>
          <small>
            © {new Date().getFullYear()} {office.university} · {office.name}. Datos publicados para consulta y reutilización citando la fuente.
          </small>
          <BackToTop />
        </div>
      </div>
    </footer>
  );
}
