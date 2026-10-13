/* =============================================================================
   UDES Sostenible · presentación rectoral de los informes ODS.

   Una carta a dos columnas asimétricas. A la izquierda, a sangre, el bloque
   verde institucional que marca el sitio del retrato mientras llega la
   fotografía oficial, cerrado por la tira de los 17 colores. A la derecha,
   el titular, la carta con la frase destacada en grande, la firma y tres
   cifras sobre un filete. El texto es el mismo del portal y de la segunda
   página del boletín; se edita en el generador del boletín.
   ========================================================================== */

import { useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { OdsShell } from "./OdsShell";
import { OdsBulletinDownload } from "./OdsBulletinDownload";
import { ODS_CURRENT, ODS_LIST, ODS_ROUTES, RECTOR, odsTotals, rectorParagraphs } from "./ods-data";
import { useRectorText } from "./ods-selection";
import { OdsPortalArrow } from "./OdsPortalArrow";
import { reduced } from "./widgets";
import "./ods-portal.css";

gsap.registerPlugin(useGSAP);

export function OdsRector() {
  const { text, edited } = useRectorText();
  const paras = rectorParagraphs(text);
  const totals = odsTotals();
  const root = useRef<HTMLDivElement>(null);

  /* El bloque verde se abre de abajo arriba y la tira se dibuja; la carta entra por líneas y bloques. */
  useGSAP(
    () => {
      if (reduced()) return;
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".opt-plate", { clipPath: "inset(100% 0% 0% 0%)", duration: 0.6, ease: "power4.out", clearProps: "clipPath" }, 0)
        .from(".opt-plate .opt-bands i", { scaleX: 0, transformOrigin: "0 50%", duration: 0.3, stagger: 0.02, clearProps: "transform" }, 0.25)
        .from(".opt-letter .opt-line > span", { yPercent: 104, duration: 0.6, ease: "power4.out", stagger: 0.08, clearProps: "transform" }, 0.1)
        .from(".opt-letter__body > *", { y: 14, opacity: 0, duration: 0.42, stagger: 0.05, clearProps: "opacity,transform" }, 0.3);
    },
    { scope: root },
  );

  return (
    <OdsShell title="Presentación rectoral" active="rector">
      <div ref={root} className="opt-view opt-rect">
        <figure className="opt-plate" aria-label="Fotografía del Rector pendiente">
          <span className="opt-plate__mark" aria-hidden="true">
            R
          </span>
          <figcaption>Aquí va la fotografía oficial del Rector</figcaption>
          <span className="opt-bands" aria-hidden="true">
            {ODS_LIST.map((o) => (
              <i key={o.n} style={{ background: o.color }} />
            ))}
          </span>
        </figure>

        <article className="opt-letter">
          <h1 className="opt-letter__title">
            <span className="opt-line">
              <span>{RECTOR.title}</span>
            </span>
          </h1>
          <div className="opt-letter__body">
            <p className="opt-letter__meta">Presentación rectoral · THE Impact Rankings {ODS_CURRENT}</p>
            {paras.slice(0, 1).map((p, i) => (
              <p key={`a${i}`} className="opt-letter__p opt-letter__p--lead">
                {p}
              </p>
            ))}
            <blockquote className="opt-pull">
              <p>«{RECTOR.quote}»</p>
            </blockquote>
            {paras.slice(1).map((p, i) => (
              <p key={`b${i}`} className="opt-letter__p">
                {p}
              </p>
            ))}
            <div className="opt-sign">
              <b>{RECTOR.name}</b>
              <span>{RECTOR.role}</span>
            </div>
            <div className="opt-figs opt-figs--letter">
              <p className="opt-fig">
                <b>{ODS_LIST.length}</b>
                <span>informes ODS</span>
              </p>
              <p className="opt-fig">
                <b>{totals.the}</b>
                <span>
                  ODS para THE <span className="odsx-ilus">Dato ilustrativo</span>
                </span>
              </p>
              <p className="opt-fig">
                <b>{ODS_CURRENT}</b>
                <span>edición vigente</span>
              </p>
            </div>
            <div className="opt-letter__acts">
              <OdsBulletinDownload />
              <Link to={ODS_ROUTES.portal} className="opt-link">
                Ver los 17 informes <OdsPortalArrow />
              </Link>
            </div>
            {(RECTOR.illustrative || edited) && (
              <p className="odsx-note opt-foot">
                {RECTOR.illustrative && <span className="odsx-ilus">Texto de ejemplo</span>} {edited ? "Este texto se editó en el generador del boletín y solo se ve en este navegador. " : ""}
                La presentación la redacta y aprueba la Rectoría. El mismo texto se usa en esta página, en el portal y en la segunda página del boletín. Se edita en la vista{" "}
                <Link to={ODS_ROUTES.bulletin} className="opt-inline">
                  «Boletín PDF»
                </Link>
                .
              </p>
            )}
          </div>
        </article>
      </div>
    </OdsShell>
  );
}
