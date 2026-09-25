/* =============================================================================
   Portal de Impacto · la ficha de un indicador, en una ventana.

   Se abre desde la lista de indicadores del programa y desde el mapa de red.
   Cada línea dice su valor y, debajo, qué es esa línea. Al final, las cifras
   que ha reportado el programa, sede por sede. Esc o «Cerrar» la cierran y
   el foco vuelve a donde estaba.
   ========================================================================== */

import { useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/ui/Icon";
import { FUNCTION_LABEL, FUNCTION_TONE, STAGE_LABEL, formatFigure } from "../model";
import type { PortalData, PortalIndicator } from "./data";
import { indicatorSheet } from "./sheet";

export function IndicatorSheetDialog({
  data,
  indicator,
  programId,
  onClose,
}: {
  data: PortalData;
  indicator: PortalIndicator;
  programId?: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  // Quien la abre pasa una función nueva en cada pintada: se guarda aparte para no reabrir el efecto.
  const closeFn = useRef(onClose);
  closeFn.current = onClose;
  const sheet = indicatorSheet(data, indicator, programId);
  const own = "programId" in indicator;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeFn.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  // Las cifras del programa: la última de cada sede y su serie.
  const values = programId ? data.values.filter((v) => v.indicatorId === indicator.id && v.programId === programId && !v.notApplicable && v.valueNum !== null) : [];
  const years = [...new Set(values.map((v) => v.year))].sort((a, b) => a - b).slice(-4);
  const campuses = data.campuses.filter((c) => values.some((v) => v.campusId === c.id));

  return createPortal(
    <div className="isheet" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="isheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ "--tone": FUNCTION_TONE[indicator.fn] } as CSSProperties}>
        <header className="isheet__head">
          <div>
            <span className="isheet__eyebrow">
              Ficha metodológica · {own ? "indicador propio del programa" : "ficha institucional"}
            </span>
            <h2 id={titleId}>
              <b>{indicator.code}</b> {indicator.name}
            </h2>
            <span className="isheet__tags">
              <i>{FUNCTION_LABEL[indicator.fn]}</i>
              <i>{STAGE_LABEL[indicator.stage]}</i>
              {indicator.direction === "baja" && <i>Mejor si baja</i>}
            </span>
          </div>
          <button ref={closeRef} type="button" className="isheet__close" onClick={onClose}>
            <Icon name="close" size={16} /> Cerrar
          </button>
        </header>

        <div className="isheet__body">
          {sheet.preliminary && (
            <p className="isheet__warn">
              <strong>Contenido preliminar.</strong> Parte de esta ficha (las líneas marcadas «plantilla») se armó con el texto base del modelo de impacto y está
              pendiente de validación por su responsable.
            </p>
          )}

          {sheet.sections.map((section) => (
            <section key={section.title} className="isheet__section">
              <h3>{section.title}</h3>
              <dl>
                {section.lines.map((line) => (
                  <div key={line.key} data-empty={line.value === "Por definir" || undefined}>
                    <dt>
                      {line.label}
                      <small>{line.help}</small>
                    </dt>
                    <dd>
                      {line.value}
                      {line.generated && <em>plantilla</em>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          {sheet.notes.map((note) => (
            <aside key={note.title} className="isheet__note" data-tone={note.tone}>
              <strong>{note.title}</strong>
              <p>{note.text}</p>
            </aside>
          ))}

          {programId && (
            <section className="isheet__section">
              <h3>Cifras que ha reportado el programa</h3>
              {values.length === 0 ? (
                <p className="ipo-muted">Aún no hay cifras del programa en este indicador. Un vacío no es un cero.</p>
              ) : (
                <div className="ist-heat-wrap">
                  <table className="isheet__table">
                    <caption className="sr-only">Cifras del programa por sede y año</caption>
                    <thead>
                      <tr>
                        <th scope="col">Sede</th>
                        {years.map((y) => (
                          <th key={y} scope="col">
                            {y}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {campuses.map((c) => (
                        <tr key={c.id}>
                          <th scope="row">{c.name}</th>
                          {years.map((y) => {
                            const v = values.find((x) => x.campusId === c.id && x.year === y);
                            return <td key={y}>{v?.valueNum != null ? formatFigure(Math.round(v.valueNum * 100) / 100, indicator.measure) : "—"}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
