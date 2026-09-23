/* =============================================================================
   Periodo · Planeación Institucional.

   Abrir 2026-2 con sus tres fechas de corte y, antes de confirmar, ver qué le
   toca a cada programa. Quitar una asignación exige decir por qué: queda
   escrito junto a ella.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { FACULTIES, INDICATORS, PROGRAMS, campusName, indicatorByCode, DEGREES } from "../data/catalog";
import { actions, assignmentsFor, recordId, useImpactStore } from "./store";

export function PeriodView() {
  const state = useImpactStore();
  const { period, catalog } = state;
  const all = useMemo(() => assignmentsFor(period.code), [period.code]);
  const [open, setOpen] = useState<string | null>("medicina");
  const [excluded, setExcluded] = useState<Record<string, string>>({});
  const [cuts, setCuts] = useState(period.cuts);

  const suggested = INDICATORS.filter((i) => i.estado === "sugerido").length;
  const annual = INDICATORS.filter((i) => i.ficha?.periodicidad === "anual").length;
  const active = all.filter((a) => !(recordId(a.codigo, a.program, a.campus) in excluded));
  const missingReason = Object.values(excluded).some((r) => !r.trim());

  return (
    <>
      <section className="admin-card ia-period">
        <div className="ia-period__head">
          <div>
            <h2>Periodo {period.code}</h2>
            <p>
              {period.open ? "Abierto." : "Cerrado."} Catálogo versión {catalog.published ?? "sin publicar"}. Segundo semestre:
              entran también los {annual} indicadores anuales del piloto.
            </p>
          </div>
          <span className={`ia-pill ${period.open ? "ia-pill--done" : ""}`}>{period.open ? "Abierto" : "Cerrado"}</span>
        </div>

        <div className="admin-form__grid">
          {(
            [
              ["programa", "Cierre para programas"],
              ["decanatura", "Cierre para decanaturas"],
              ["vicerrectoria", "Cierre para vicerrectorías"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="admin-field">
              <span>{label}</span>
              <input
                type="date"
                value={cuts[key]}
                onChange={(e) => setCuts({ ...cuts, [key]: e.target.value })}
                onBlur={() => actions.setCuts(cuts)}
              />
            </label>
          ))}
        </div>

        <ul className="ia-rules">
          <li>
            <Icon name="check" size={14} /> Solo indicadores oficiales de la versión publicada: los {suggested} sugeridos no se asignan.
          </li>
          <li>
            <Icon name="check" size={14} /> Por nivel de formación y modalidad del programa, y por sede cuando el indicador se reporta por sede.
          </li>
          <li>
            <Icon name="check" size={14} /> Los anuales solo en el segundo semestre.
          </li>
        </ul>
      </section>

      <section className="admin-card">
        <div className="admin-card__head">
          <div>
            <h2>Asignaciones</h2>
            <p className="ia-muted">
              {active.length} registros para {PROGRAMS.length} programas. Abra un programa para ver o quitar sus asignaciones.
            </p>
          </div>
        </div>

        {FACULTIES.map((faculty) => {
          const programs = PROGRAMS.filter((p) => p.faculty === faculty.slug);
          if (!programs.length) return null;
          return (
            <div key={faculty.slug} className="ia-faculty">
              <h3>{faculty.name}</h3>
              <ul className="ia-programs">
                {programs.map((program) => {
                  const own = all.filter((a) => a.program === program.slug);
                  const kept = own.filter((a) => !(recordId(a.codigo, a.program, a.campus) in excluded));
                  const expanded = open === program.slug;
                  return (
                    <li key={program.slug}>
                      <button
                        type="button"
                        className="ia-programs__row"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : program.slug)}
                      >
                        <span>
                          <strong>{program.name}</strong>
                          <small>
                            {DEGREES[program.degree]} · {program.campus.map((c) => campusName(c)).join(", ")}
                          </small>
                        </span>
                        <span className="ia-programs__count">{kept.length} registros</span>
                        <svg className="ia-chevron" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {expanded && (
                        <table className="ia-table">
                          <thead>
                            <tr>
                              <th scope="col">Indicador</th>
                              <th scope="col">Sede</th>
                              <th scope="col">
                                <span className="sr-only">Quitar</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {own.map((a) => {
                              const id = recordId(a.codigo, a.program, a.campus);
                              const out = id in excluded;
                              return (
                                <tr key={id} data-out={out || undefined}>
                                  <td>
                                    <span className="ia-code">{a.codigo}</span> {indicatorByCode.get(a.codigo)?.nombre}
                                  </td>
                                  <td>{campusName(a.campus)}</td>
                                  <td>
                                    {out ? (
                                      <div className="ia-exclude">
                                        <input
                                          aria-label={`Por qué se quita ${a.codigo}`}
                                          placeholder="Por qué se quita (obligatorio)"
                                          value={excluded[id]}
                                          onChange={(e) => setExcluded({ ...excluded, [id]: e.target.value })}
                                        />
                                        <button
                                          type="button"
                                          className="button-ghost"
                                          onClick={() => {
                                            const next = { ...excluded };
                                            delete next[id];
                                            setExcluded(next);
                                          }}
                                        >
                                          Mantener
                                        </button>
                                      </div>
                                    ) : (
                                      <button type="button" className="button-ghost" onClick={() => setExcluded({ ...excluded, [id]: "" })}>
                                        Quitar
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        <div className="ia-actions">
          {missingReason && <p className="ia-error">Cada asignación que se quita necesita su justificación.</p>}
          <button
            type="button"
            className="button-primary"
            disabled={!catalog.published || missingReason}
            onClick={() => actions.openPeriod(Object.keys(excluded))}
          >
            {period.open ? `Regenerar las ${active.length} asignaciones` : `Abrir ${period.code} con ${active.length} asignaciones`}
          </button>
        </div>
      </section>

      <section className="admin-card ia-preload">
        <div>
          <h2>Valores precargados</h2>
          <p className="ia-muted">
            Retención (E04), profesores con maestría y doctorado (E01) y Saber Pro (E10) llegan de su fuente institucional.
            El programa solo confirma o declara la discrepancia.
          </p>
        </div>
        <button type="button" className="button-secondary" disabled title="Llega en la fase 4">
          <Icon name="upload" size={15} />
          Cargar CSV o Excel
        </button>
      </section>
    </>
  );
}
