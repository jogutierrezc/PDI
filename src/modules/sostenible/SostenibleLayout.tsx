/* =============================================================================
   UDES Sostenible · marco del portal.

   La barra de Planeación y su pie, más la barra propia del portal (inicio,
   un micrositio por ranking, indicadores e informes) y la intro de la gota,
   que solo se ve la primera vez de cada sesión en la portada.
   ========================================================================== */

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PlanLayout } from "../planeacion/PlanLayout";
import { RANKINGS } from "./data";
import { reduced } from "./widgets";
import "./sostenible.css";

const INTRO_KEY = "udes-sostenible-intro";

const introSeen = () => {
  try {
    return sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
};

export function SostenibleLayout({ title, children }: { title: string; children: ReactNode }) {
  const { pathname, hash } = useLocation();
  return (
    <PlanLayout title={`${title} · UDES Sostenible`}>
      <div className="sos">
        <nav className="sos-sub" aria-label="UDES Sostenible">
          <div className="sos-wrap">
            <NavLink to="/sostenible" end className="sos-sub__link" aria-current={pathname === "/sostenible" && !hash ? "page" : undefined}>
              Inicio
            </NavLink>
            {RANKINGS.map((r) => (
              <NavLink key={r.id} to={`/sostenible/${r.id}`} className="sos-sub__link">
                {r.short}
              </NavLink>
            ))}
            <Link to="/sostenible#indicadores" className="sos-sub__link">
              Indicadores
            </Link>
            <Link to="/sostenible#informes" className="sos-sub__link">
              Informes
            </Link>
          </div>
        </nav>
        {children}
      </div>
    </PlanLayout>
  );
}

/** La gota que se dibuja y se abre en el nombre del portal. Llama a `onDone` al terminar o al saltarla. */
export function useIntro(): { showing: boolean; skip: () => void; scope: React.RefObject<HTMLDivElement> } {
  const [showing, setShowing] = useState(() => !reduced() && !introSeen());
  const scope = useRef<HTMLDivElement>(null);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* sin almacenamiento: la intro simplemente se verá otra vez */
    }
    const el = scope.current;
    if (!el) return setShowing(false);
    gsap.to(el, { clipPath: "inset(0 0 100% 0)", duration: 0.7, ease: "power4.inOut", onComplete: () => setShowing(false) });
  };

  useGSAP(
    () => {
      if (!showing) return;
      const drop = scope.current?.querySelector<SVGGeometryElement>(".sos-intro__drop");
      const leaf = scope.current?.querySelector<SVGGeometryElement>(".sos-intro__leaf");
      if (!drop || !leaf) return;
      const dl = drop.getTotalLength();
      const ll = leaf.getTotalLength();
      gsap.set(drop, { strokeDasharray: dl, strokeDashoffset: dl });
      gsap.set(leaf, { strokeDasharray: ll, strokeDashoffset: ll });
      gsap
        .timeline({ onComplete: () => window.setTimeout(finish, 300) })
        .to(drop, { strokeDashoffset: 0, duration: 1, ease: "power2.inOut" })
        .to(leaf, { strokeDashoffset: 0, duration: 0.7, ease: "power2.out" }, "-=0.2")
        .from(".sos-intro__t span", { yPercent: 110, duration: 0.6, ease: "power4.out", stagger: 0.12 }, "-=0.3")
        .from(".sos-intro__s", { opacity: 0, y: 8, duration: 0.5 }, "-=0.2");
      const safety = window.setTimeout(finish, 5000);
      return () => window.clearTimeout(safety);
    },
    { scope, dependencies: [showing] },
  );

  return { showing, skip: finish, scope };
}

export function Intro({ scope, skip }: { scope: React.RefObject<HTMLDivElement>; skip: () => void }) {
  return (
    <div ref={scope} className="sos-intro" role="presentation">
      <button type="button" className="sos-intro__skip" onClick={skip}>
        Saltar intro
      </button>
      <div className="sos-intro__stage">
        <svg viewBox="0 0 120 150" aria-hidden="true">
          <path className="sos-intro__drop" d="M60 8C60 8 14 62 14 96a46 46 0 0 0 92 0C106 62 60 8 60 8Z" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path className="sos-intro__leaf" d="M60 118V70M60 100c-14 0-22-8-24-22 14 0 22 8 24 22ZM60 90c12 0 20-8 22-20-12 0-20 8-22 20Z" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="sos-intro__t" aria-label="UDES Sostenible">
          <span>UDES</span> <span>Sostenible</span>
        </div>
        <div className="sos-intro__s">Universidad de Santander</div>
      </div>
    </div>
  );
}
