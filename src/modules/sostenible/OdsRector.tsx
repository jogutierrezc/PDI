/* =============================================================================
   UDES Sostenible · presentación rectoral de los informes ODS.

   Retrato (marcador mientras llega la fotografía oficial), título, carta con
   la frase destacada, firma y tres cifras. El texto es el mismo del portal y
   de la segunda página del boletín; se edita en el generador del boletín.
   ========================================================================== */

import { useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { OdsShell } from "./OdsShell";
import { OdsBulletinDownload } from "./OdsBulletinDownload";
import { ODS_CURRENT, ODS_LIST, ODS_ROUTES, RECTOR, odsTotals, rectorParagraphs } from "./ods-data";
import { useRectorText } from "./ods-selection";
import { reduced } from "./widgets";
import "./ods-portal.css";

gsap.registerPlugin(useGSAP);

export function OdsRector() {
  const { text, edited } = useRectorText();
  const paras = rectorParagraphs(text);
  const totals = odsTotals();
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".opt-portrait", { opacity: 0, scale: 0.97, duration: 0.45, ease: "power3.out", clearProps: "opacity,transform" });
      gsap.from(".opt-letter > *", { opacity: 0, y: 14, duration: 0.42, ease: "power3.out", stagger: 0.05, delay: 0.08, clearProps: "opacity,transform" });
    },
    { scope: root },
  );

  return (
    <OdsShell title="Presentación rectoral" active="rector">
      <div ref={root} className="odsx-wrap opt-view">
        <div className="opt-rect">
          <figure className="opt-portrait" aria-label="Fotografía del Rector pendiente">
            <b aria-hidden="true">R</b>
            <figcaption>Aquí va la fotografía oficial del Rector</figcaption>
          </figure>
          <article className="opt-letter">
            <p className="odsx-eyebrow">Presentación rectoral · Edición {ODS_CURRENT}</p>
            <h1 className="opt-letter__title">{RECTOR.title}</h1>
            {paras.slice(0, 1).map((p, i) => (
              <p key={`a${i}`} className="opt-letter__p">
                {p}
              </p>
            ))}
            <blockquote className="opt-pull">
              <p>{RECTOR.quote}</p>
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
            <div style={{ marginTop: 18 }}>
              <OdsBulletinDownload />
            </div>
            <div className="opt-commit">
              <div className="opt-kpi">
                <b>{ODS_LIST.length}</b>
                <span>informes ODS</span>
              </div>
              <div className="opt-kpi">
                <b>{totals.the}</b>
                <span>
                  ODS para THE <span className="odsx-ilus">Ilustrativo</span>
                </span>
              </div>
              <div className="opt-kpi">
                <b>{ODS_CURRENT}</b>
                <span>edición vigente</span>
              </div>
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
          </article>
        </div>
      </div>
    </OdsShell>
  );
}
