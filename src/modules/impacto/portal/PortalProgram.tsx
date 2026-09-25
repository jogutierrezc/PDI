/* =============================================================================
   Portal de Impacto · el detalle de un programa.

   /impacto/programa/:slug: cómo van los indicadores que eligió el programa
   frente a su meta 2026. Arriba las cifras y la barra de estados; luego su
   reparto por función y eslabón, la lista indicador por indicador (primero
   lo rezagado) y un indicador comparado entre sus sedes y con la UDES.
   Todo el estado vive en la dirección: ?sede=&funcion=&indicador=.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FUNCTIONS, FUNCTION_LABEL, FUNCTION_TONE, formatFigure } from "../model";
import { campusFigures, globalFigure, isFunction, programsOf } from "./analysis";
import type { PortalData } from "./data";
import { CampusBars } from "./charts";
import { PiloBanner, PortalGate, PortalLayout, SectionHead } from "./parts";
import { IndicatorSheetDialog } from "./IndicatorSheetDialog";
import { ProgramNetwork } from "./ProgramNetwork";
import { LAGGING_BELOW, countStandings, ownStandings, cutYear, median, measured, programStandingNote, programStandings, stageCounts, withTarget } from "./standing";
import { IndicatorStandingList, Pebble, Pebbles, StageCountGrid, StandingBar, StandingLegend } from "./standingCharts";

export function PortalProgram() {
  const { slug } = useParams();
  return <PortalGate title="Programa">{(data) => <ProgramView data={data} slug={slug ?? ""} />}</PortalGate>;
}

function ProgramView({ data, slug }: { data: PortalData; slug: string }) {
  const [params, setParams] = useSearchParams();
  const program = useMemo(() => programsOf(data).find((p) => p.slug === slug) ?? null, [data, slug]);
  const sede = data.campuses.find((c) => c.slug === params.get("sede") && program?.campusIds.includes(c.id)) ?? null;
  const fnParam = params.get("funcion") ?? undefined;
  const fn = isFunction(fnParam) ? fnParam : null;
  const rows = useMemo(() => (program ? programStandings(data, program.id, sede?.id ?? null) : []), [data, program, sede]);
  const own = useMemo(() => (program ? ownStandings(data, program.id, sede?.id ?? null) : []), [data, program, sede]);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = openId ? (data.indicators.find((i) => i.id === openId) ?? data.programIndicators.find((i) => i.id === openId)) : undefined;

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  if (!program) {
    return (
      <PortalLayout title="Programa">
        <div className="u-container ipo-state">
          <h1>No encontramos ese programa</h1>
          <Link className="ipo-link" to="/impacto/programas">
            Ver todos los programas
          </Link>
        </div>
      </PortalLayout>
    );
  }

  const counts = countStandings(rows);
  const byFn = FUNCTIONS.map((f) => ({ fn: f, rows: rows.filter((r) => r.indicator.fn === f) }));
  const shown = fn ? rows.filter((r) => r.indicator.fn === fn) : rows;
  const pcts = rows.map((r) => r.pct).filter((p): p is number => p !== null);
  const mid = median(pcts);
  const year = cutYear(rows);
  const missing = rows.filter((r) => r.standing === "sin_cifra");
  const stages = stageCounts(rows);
  const gaps = FUNCTIONS.flatMap((f) =>
    byFn.find((b) => b.fn === f)!.rows.length ? (Object.entries(stages[f]) as [string, number][]).filter(([, n]) => n === 0).map(([s]) => ({ fn: f, stage: s })) : [],
  );
  const campuses = data.campuses.filter((c) => program.campusIds.includes(c.id));

  const chosen = rows.find((r) => r.indicator.code === params.get("indicador")) ?? rows.find((r) => r.value !== null) ?? rows[0];
  const figures = chosen ? campusFigures(data, chosen.indicator.id, new Set([program.id])).filter((f) => program.campusIds.includes(f.campus.id)) : [];
  const udes = chosen ? globalFigure(data, chosen.indicator.id) : undefined;

  return (
    <PortalLayout title={program.name}>
      <section className="ipo-unit-head" style={fn ? ({ "--tone": FUNCTION_TONE[fn] } as CSSProperties) : undefined}>
        <div className="u-container ipo-unit-head__grid">
          <div>
            <Link className="ipo-back" to={`/impacto/programas${program.faculty ? `?facultad=${program.faculty.slug}` : ""}`}>
              Programas
            </Link>
            <span className="ipo-eyebrow">
              {program.faculty ? <Link to={`/impacto/facultad/${program.faculty.slug}`}>{program.faculty.name}</Link> : "Sin facultad"} · {campuses.length}{" "}
              {campuses.length === 1 ? "sede" : "sedes"}
            </span>
            <h1>{program.name}</h1>
            <p className="ipo-lede">
              Cómo van {rows.length === 1 ? "el indicador que eligió" : `los ${rows.length} indicadores que eligió`}, cada uno frente a su meta 2026
              {sede ? ` en ${sede.name}` : ""}.
            </p>
          </div>
          <div className="ist-head-side">
            {campuses.length > 1 && (
              <div className="ipo-pills ipo-pills--solid" role="group" aria-label="Sede" data-tour="ipo-prog-campus">
                <button type="button" aria-pressed={!sede} onClick={() => set("sede", null)}>
                  Todas
                </button>
                {campuses.map((c) => (
                  <button key={c.id} type="button" aria-pressed={sede?.id === c.id} onClick={() => set("sede", c.slug)}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <span className="ist-cut">{year ? `Corte ${year} · meta 2026` : "Sin cifras todavía · meta 2026"}</span>
          </div>
        </div>
      </section>

      <section className="ipo-section">
        <div className="u-container ist-stack">
          {rows.length === 0 ? (
            <div className="ipo-card">
              <p className="ipo-muted">
                Este programa aún no ha elegido fichas institucionales{sede ? ` en ${sede.name}` : ""}.{own.length ? " Sus indicadores propios están abajo." : ""}
              </p>
            </div>
          ) : (
            <>
              <Pebbles>
                <Pebble label="Indicadores elegidos" value={rows.length} note={byFn.map((b) => `${b.rows.length} de ${FUNCTION_LABEL[b.fn]}`).join(" · ")} />
                <Pebble
                  label={year ? `Con cifra en ${year}` : "Con cifra"}
                  value={rows.filter((r) => r.value !== null).length}
                  of={`de ${rows.length}`}
                  note={missing.length ? `Falta: ${missing.slice(0, 2).map((r) => r.indicator.name).join(", ")}${missing.length > 2 ? "…" : ""}` : "Todos tienen cifra"}
                />
                <Pebble
                  label="Ya cumplen la meta 2026"
                  value={counts.cumplida}
                  of={`de ${withTarget(counts)} con meta`}
                  note={counts.rezagada ? `${counts.rezagada} ${counts.rezagada === 1 ? "va rezagado" : "van rezagados"} (menos del ${LAGGING_BELOW} %)` : "Ninguno rezagado"}
                  tone="bien"
                />
                <Pebble label="Avance mediano" value={mid === null ? "—" : `${Math.round(mid)} %`} note={measured(counts) ? "La mitad de sus indicadores va por encima" : "Sin cifras frente a meta"} />
              </Pebbles>

              <div className="ipo-card" data-tour="ipo-prog-state">
                <SectionHead title={`Estado de sus ${rows.length} indicadores`} hint={`Cifra más reciente frente a la meta 2026 que fijó el programa${sede ? ` en ${sede.name}` : ""}.`} />
                <StandingBar counts={counts} size="lg" />
                <StandingLegend counts={counts} />
              </div>

              <div className="ipo-two">
                <div className="ipo-card">
                  <SectionHead title="Distribución en la cadena de valor" hint="Cuántos indicadores tiene en cada función y eslabón." />
                  <StageCountGrid counts={stages} />
                  {gaps.length > 0 && (
                    <p className="ist-warn">
                      <strong>▲ Eslabón vacío:</strong>{" "}
                      {gaps
                        .slice(0, 3)
                        .map((g) => `${FUNCTION_LABEL[g.fn]} no tiene indicador de ${g.stage === "impacto" ? "impacto real" : g.stage}`)
                        .join("; ")}
                      .
                    </p>
                  )}
                </div>
                <div className="ipo-card">
                  <SectionHead title="Cumplimiento por función" hint="Cada tramo es un indicador, en su estado." />
                  <ul className="ist-fnbars">
                    {byFn.map((b) => {
                      const c = countStandings(b.rows);
                      return (
                        <li key={b.fn} style={{ "--tone": FUNCTION_TONE[b.fn] } as CSSProperties}>
                          <span>
                            <b>{FUNCTION_LABEL[b.fn]}</b>
                            <small>{b.rows.length ? `${c.cumplida} de ${withTarget(c)} cumplen` : "Sin indicadores"}</small>
                          </span>
                          <StandingBar counts={c} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <div className="ipo-card" data-tour="ipo-prog-list">
                <div className="ipo-head">
                  <div>
                    <h2>Cumplimiento por indicador</h2>
                    <p>Primero lo que necesita atención: rezagados, sin cifra, en camino, cumplidos.</p>
                  </div>
                  <div className="ipo-pills" role="group" aria-label="Función">
                    <button type="button" aria-pressed={!fn} onClick={() => set("funcion", null)}>
                      Todas <small>{rows.length}</small>
                    </button>
                    {byFn.map((b) => (
                      <button key={b.fn} type="button" aria-pressed={fn === b.fn} disabled={!b.rows.length} onClick={() => set("funcion", b.fn)} style={{ "--tone": FUNCTION_TONE[b.fn] } as CSSProperties}>
                        <i aria-hidden="true" />
                        {FUNCTION_LABEL[b.fn]} <small>{b.rows.length}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <IndicatorStandingList rows={shown} onOpen={setOpenId} />
                <p className="ist-foot">
                  Avance = cifra más reciente del programa ÷ meta 2026 que fijó para cada sede (sin sede elegida, el promedio de sus sedes). En los indicadores que
                  deben bajar se invierte. Un indicador sin cifra no cuenta como cero: se muestra aparte.
                </p>
              </div>

              <div className="ipo-two ipo-two--wide">
                {chosen && (
                  <div className="ipo-card">
                    <div className="ipo-head">
                      <div>
                        <h2>Un indicador, sede por sede</h2>
                        <p>
                          El programa en cada sede frente a su meta
                          {udes?.valueNum != null ? ` · la UDES va en ${formatFigure(Math.round(udes.valueNum * 100) / 100, chosen.indicator.measure)} (${udes.year})` : ""}.
                        </p>
                      </div>
                      <label className="ipo-select">
                        <span>Indicador</span>
                        <select value={chosen.indicator.code} onChange={(e) => set("indicador", e.target.value)}>
                          {rows.map((r) => (
                            <option key={r.indicator.id} value={r.indicator.code}>
                              {r.indicator.code} · {r.indicator.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <CampusBars rows={figures} measure={chosen.indicator.measure} target={chosen.target} tone={FUNCTION_TONE[chosen.indicator.fn]} />
                  </div>
                )}
                <PiloBanner note={programStandingNote(program.name, rows)} />
              </div>
            </>
          )}
              {own.length > 0 && (
                <div className="ipo-card" data-tour="ipo-prog-own">
                  <SectionHead
                    title={`Indicadores propios del programa · ${own.length}`}
                    hint="Los que creó el programa, aparte de las fichas institucionales, con las metas que les puso en su sede."
                  />
                  <StandingBar counts={countStandings(own)} />
                  <IndicatorStandingList rows={own} label="Cumplimiento de los indicadores propios del programa" onOpen={setOpenId} />
                </div>
              )}

              {(rows.length > 0 || own.length > 0) && (
              <div className="ipo-card" data-tour="ipo-prog-network">
                <SectionHead
                  title="Mapa de red"
                  hint="Sus indicadores unidos por los pilares del PDI y los ODS que comparten; en el centro, el programa. Toque uno para ver con quién se conecta y abrir su ficha."
                />
                <ProgramNetwork data={data} programId={program.id} programName={program.name} campusId={sede?.id ?? null} onOpen={setOpenId} />
              </div>
              )}

        </div>
      </section>
      {opened && <IndicatorSheetDialog data={data} indicator={opened} programId={program.id} onClose={() => setOpenId(null)} />}
    </PortalLayout>
  );
}
