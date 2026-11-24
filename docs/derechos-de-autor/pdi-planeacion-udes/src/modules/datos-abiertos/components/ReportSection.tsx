/* =============================================================================
   Un punto de un informe institucional.

   Abre con su número y su título, dice su estado (completo, información
   parcial, no recibida, insumo no oficial, sección abierta), la frase que lo
   resume y, si aplica, la advertencia de cobertura. Debajo van sus bloques.

   Cuando la información no llegó, el punto no se esconde: dice qué se pidió,
   a quién y con qué periodicidad. Un informe honesto muestra lo que falta.
   ========================================================================== */

import type { ReactNode } from "react";
import type { ReportSection as Section, SectionStatus } from "../data/types";
import "./report-sections.css";

export const SECTION_STATUS_LABEL: Record<SectionStatus, string> = {
  completo: "Información completa",
  parcial: "Información parcial",
  no_recibido: "Información no recibida",
  no_oficial: "Insumo no oficial: no se publica",
  abierto: "Sección abierta",
};

const STATUS_GLYPH: Record<SectionStatus, string> = {
  completo: "M3 8.5 6.5 12 13 4.5",
  parcial: "M8 3v6M8 12.5v.5",
  no_recibido: "M4 4l8 8M12 4l-8 8",
  no_oficial: "M8 3v6M8 12.5v.5",
  abierto: "M3 8h10M8 3v10",
};

export function ReportSectionView({ section, children }: { section: Section; children?: ReactNode }) {
  const empty = section.status === "no_recibido" || section.status === "no_oficial";
  return (
    <section className="od-point" id={`od-${section.key}`} data-status={section.status} aria-labelledby={`od-${section.key}-titulo`}>
      <div className="u-container">
        <header className="od-point__head">
          {section.number !== null && (
            <span className="od-point__number" aria-hidden="true">
              {String(section.number).padStart(2, "0")}
            </span>
          )}
          <div className="od-point__titles">
            <span className="od-point__kicker">{section.number !== null ? `Punto ${section.number}` : "Sección"}</span>
            <h2 id={`od-${section.key}-titulo`}>{section.title}</h2>
            <span className="od-point__status" data-status={section.status}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d={STATUS_GLYPH[section.status]} />
              </svg>
              {SECTION_STATUS_LABEL[section.status]}
            </span>
          </div>
        </header>

        {section.lede && <p className="od-point__lede">{section.lede}</p>}
        {section.warning && (
          <p className="od-point__warning" role="note">
            <strong>{section.status === "no_oficial" ? "Por qué no se publica:" : "Advertencia de cobertura:"}</strong> {section.warning}
          </p>
        )}

        {empty && section.requested.length > 0 && (
          <div className="od-point__missing">
            <h3>Qué información hace falta</h3>
            <div className="od-table-wrap" tabIndex={0} role="region" aria-label="Información requerida, desplazable">
              <table className="od-table">
                <thead>
                  <tr>
                    <th scope="col">Dato requerido</th>
                    <th scope="col">Responsable sugerido</th>
                    <th scope="col">Periodicidad</th>
                  </tr>
                </thead>
                <tbody>
                  {section.requested.map((item, index) => (
                    <tr key={index}>
                      <th scope="row">{item.dato}</th>
                      <td>{item.responsable}</td>
                      <td>{item.periodicidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {children && <div className="od-point__blocks">{children}</div>}

        {section.source && <p className="od-point__source">Fuente: {section.source}</p>}
      </div>
    </section>
  );
}
