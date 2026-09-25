/* =============================================================================
   Portal de Impacto · las facultades.

   /impacto/facultades: una piedra por facultad.
   /impacto/facultad/:slug: cómo van los indicadores de sus programas frente
   a su meta: el estado de cada programa, el mapa de cumplimiento de los
   indicadores más elegidos, qué tan parejos van los programas, hacia dónde
   apuntan sus indicadores y un indicador por sede.
   El filtro de sede vive en la dirección (?sede=bucaramanga).
   ========================================================================== */

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FUNCTIONS, FUNCTION_LABEL, FUNCTION_TONE } from "../model";
import { adoptionsByFunction, campusFigures, facultiesOf, mostAdopted, programsOf } from "./analysis";
import type { PortalData } from "./data";
import { CampusBars } from "./charts";
import { PiloBanner, PortalGate, PortalLayout, SectionHead } from "./parts";
import { pebbleShape } from "./shape";
import { countStandings, cutYear, gridOf, groupStandingNote, median, metShare, spreads, standingsOf, withTarget } from "./standing";
import { DotStrips, Pebble, Pebbles, StandingHeatmap, StandingLegend, StandingRows } from "./standingCharts";
import type { StackedRow } from "./standingCharts";

export function PortalFaculties() {
  return (
    <PortalGate title="Facultades">
      {(data) => {
        const programs = programsOf(data);
        const faculties = facultiesOf(data);
        return (
          <PortalLayout title="Facultades">
            <section className="ipo-unit-head">
              <div className="u-container">
                <span className="ipo-eyebrow">Facultades</span>
                <h1>Elija una facultad</h1>
                <p className="ipo-lede">Cada una muestra a qué función se conectan sus programas y si su cadena llega al impacto real.</p>
              </div>
            </section>
            <section className="ipo-section ipo-section--surface">
              <div className="u-container">
                {faculties.length === 0 ? (
                  <p className="ipo-muted">Aún no hay facultades en la estructura institucional.</p>
                ) : (
                  <ul className="ipo-stones">
                    {faculties.map((f) => {
                      const mine = programs.filter((p) => p.faculty?.id === f.id);
                      const connected = mine.filter((p) => data.adoptions.some((a) => a.programId === p.id)).length;
                      return (
                        <li key={f.id}>
                          <Link to={`/impacto/facultad/${f.slug}`} className="ipo-stone" style={{ "--shape": pebbleShape(f.id) } as CSSProperties}>
                            <span className="ipo-stone__detail">{f.code}</span>
                            <strong>{f.name}</strong>
                            <span className="ipo-stone__count">
                              {mine.length} {mine.length === 1 ? "programa" : "programas"} · {connected} con indicadores
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </PortalLayout>
        );
      }}
    </PortalGate>
  );
}

export function PortalFaculty() {
  const { slug } = useParams();
  return <PortalGate title="Facultad">{(data) => <FacultyView data={data} slug={slug ?? ""} />}</PortalGate>;
}

function FacultyView({ data, slug }: { data: PortalData; slug: string }) {
  const [params, setParams] = useSearchParams();
  const faculty = data.units.find((u) => u.kind === "facultad" && u.slug === slug);
  const sede = data.campuses.find((c) => c.slug === params.get("sede")) ?? null;

  const programs = useMemo(
    () => programsOf(data).filter((p) => p.faculty?.id === faculty?.id && (!sede || p.campusIds.includes(sede.id))),
    [data, faculty, sede],
  );
  const ids = useMemo(() => new Set(programs.map((p) => p.id)), [programs]);
  const standings = useMemo(() => standingsOf(data, programs, sede?.id ?? null), [data, programs, sede]);
  const names = useMemo(() => new Map(programs.map((p) => [p.id, p.name])), [programs]);
  const spreadRows = useMemo(() => spreads(standings, names), [standings, names]);
  const byFn = useMemo(() => adoptionsByFunction(data, ids), [data, ids]);
  const top = useMemo(() => mostAdopted(data, ids), [data, ids]);

  if (!faculty) {
    return (
      <PortalLayout title="Facultad">
        <div className="u-container ipo-state">
          <h1>No encontramos esa facultad</h1>
          <Link className="ipo-link" to="/impacto/facultades">
            Ver todas las facultades
          </Link>
        </div>
      </PortalLayout>
    );
  }

  const campuses = data.campuses.filter((c) => programsOf(data).some((p) => p.faculty?.id === faculty.id && p.campusIds.includes(c.id)));
  const chosen = top.find((t) => t.indicator.code === params.get("indicador")) ?? top[0];
  const figures = chosen ? campusFigures(data, chosen.indicator.id, ids) : [];
  const totalFn = FUNCTIONS.reduce((t, f) => t + byFn[f], 0);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const all = [...standings.values()].flat();
  const counts = countStandings(all);
  const perProgram = programs
    .map((p) => ({ program: p, counts: countStandings(standings.get(p.id) ?? []) }))
    .sort((a, b) => (metShare(b.counts) ?? -1) - (metShare(a.counts) ?? -1) || a.program.name.localeCompare(b.program.name, "es"));
  const stacked: StackedRow[] = [
    { key: "total", name: "Toda la facultad", detail: String(all.length), counts, total: true },
    ...perProgram.map(({ program, counts: c }) => ({
      key: program.id,
      name: program.name,
      to: `/impacto/programa/${program.slug}${sede ? `?sede=${sede.slug}` : ""}`,
      detail: String((standings.get(program.id) ?? []).length),
      counts: c,
    })),
  ];
  const mapped = spreadRows.slice(0, 6);
  const cells = programs.map((p) => gridOf(standings.get(p.id) ?? [], mapped.map((m) => m.indicator.id)));
  const distinct = new Set(all.map((r) => r.indicator.id)).size;
  const reported = all.filter((r) => r.value !== null).length;
  const lagging = perProgram.filter((p) => p.counts.rezagada > 0);
  const mid = median(all.map((r) => r.pct).filter((p): p is number => p !== null));
  const year = cutYear(all);
  const note = groupStandingNote(spreadRows, perProgram.map((p) => ({ name: p.program.name, counts: p.counts })), faculty.name);
  const doneByFn = Object.fromEntries(FUNCTIONS.map((f) => [f, all.filter((r) => r.indicator.fn === f && r.standing === "cumplida").length])) as Record<
    (typeof FUNCTIONS)[number],
    number
  >;

  return (
    <PortalLayout title={faculty.name}>
      <section className="ipo-unit-head">
        <div className="u-container ipo-unit-head__grid">
          <div>
            <Link className="ipo-back" to="/impacto/facultades">
              Facultades
            </Link>
            <h1>{faculty.name}</h1>
            <p className="ipo-lede">
              Lo que reportan sus {programs.length} programas, sumado: cuántos indicadores cumplen su meta, cuáles se quedan atrás y qué tan parejos van.
            </p>
          </div>
          <div className="ist-head-side">
          <div className="ipo-pills ipo-pills--solid" role="group" aria-label="Sede" data-tour="ipo-fac-campus">
            <button type="button" aria-pressed={!sede} onClick={() => setParam("sede", null)}>
              Todas las sedes
            </button>
            {campuses.map((c) => (
              <button key={c.id} type="button" aria-pressed={sede?.id === c.id} onClick={() => setParam("sede", c.slug)}>
                {c.name}
              </button>
            ))}
          </div>
          <span className="ist-cut">{year ? `Corte ${year} · meta 2026` : "Sin cifras todavía · meta 2026"}</span>
          </div>
        </div>
      </section>

      <section className="ipo-section">
        <div className="u-container ipo-two ipo-two--map">
          <div className="ist-stack">
            <Pebbles>
              <Pebble label="Indicadores elegidos" value={all.length} note={`${distinct} distintos entre ${programs.length} programas`} />
              <Pebble
                label={year ? `Con cifra en ${year}` : "Con cifra"}
                value={all.length ? `${Math.round((reported / all.length) * 100)} %` : "—"}
                note={`${reported} de ${all.length} · ${counts.sin_cifra} sin reportar`}
              />
              <Pebble
                label="Cumplen la meta 2026"
                value={counts.cumplida}
                of={`de ${withTarget(counts)} con meta`}
                note={counts.rezagada ? `${counts.rezagada} rezagados en ${lagging.length} ${lagging.length === 1 ? "programa" : "programas"}` : "Ninguno rezagado"}
                tone="bien"
              />
              <Pebble label="Avance mediano" value={mid === null ? "—" : `${Math.round(mid)} %`} note="Mediana: un programa alto no tapa a los demás" />
            </Pebbles>

            <div className="ipo-card" data-tour="ipo-fac-map">
              <div className="ipo-head">
                <div>
                  <h2>Estado por programa</h2>
                  <p>Cada barra es el 100 % de los indicadores del programa, ordenados por cuántos cumplen.</p>
                </div>
              </div>
              {programs.length === 0 ? (
                <p className="ipo-muted">No hay programas de esta facultad {sede ? `en ${sede.name}` : "en la estructura"}.</p>
              ) : (
                <>
                  <StandingRows rows={stacked} label="Estado de los indicadores de cada programa" unit="Programa" />
                  <StandingLegend />
                </>
              )}
            </div>
          </div>

          <div className="ipo-stack">
            <div className="ipo-card">
              <SectionHead title="Hacia dónde apuntan sus indicadores" />
              {totalFn === 0 ? (
                <p className="ipo-muted">Sus programas aún no han elegido indicadores.</p>
              ) : (
                <>
                  <div className="ipo-split" role="img" aria-label={FUNCTIONS.map((f) => `${FUNCTION_LABEL[f]} ${Math.round((byFn[f] / totalFn) * 100)}%`).join(", ")}>
                    {FUNCTIONS.map((f) => (byFn[f] ? <span key={f} style={{ flexGrow: byFn[f], background: FUNCTION_TONE[f] }} /> : null))}
                  </div>
                  <dl className="ipo-split__legend">
                    {FUNCTIONS.map((f) => (
                      <div key={f} style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
                        <dt>{FUNCTION_LABEL[f]}</dt>
                        <dd>
                          {Math.round((byFn[f] / totalFn) * 100)}% <small>· {doneByFn[f]} cumplen</small>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>
            <div className="ipo-card">
              <SectionHead title="Los más elegidos por sus programas" />
              {top.length === 0 ? (
                <p className="ipo-muted">Todavía ninguno.</p>
              ) : (
                <ol className="ipo-top">
                  {top.map((t) => (
                    <li key={t.indicator.id} style={{ "--tone": FUNCTION_TONE[t.indicator.fn] } as CSSProperties}>
                      <b>{t.indicator.code}</b>
                      <span>{t.indicator.name}</span>
                      <small>
                        {t.programs} {t.programs === 1 ? "programa" : "programas"}
                      </small>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </section>

      {mapped.length > 0 && (
        <section className="ipo-section ipo-section--surface">
          <div className="u-container ist-stack">
            <div className="ipo-card">
              <div className="ipo-head">
                <div>
                  <h2>Mapa de cumplimiento</h2>
                  <p>Los indicadores que más programas eligieron: avance de cada programa hacia su meta. «·» no lo eligió; «○» sin cifra.</p>
                </div>
              </div>
              <StandingHeatmap
                caption="Avance de cada programa en los indicadores más elegidos de la facultad"
                rows={programs.map((p) => ({ key: p.id, name: <Link to={`/impacto/programa/${p.slug}${sede ? `?sede=${sede.slug}` : ""}`}>{p.name}</Link> }))}
                cols={mapped.map((m) => ({ key: m.indicator.id, code: m.indicator.code, name: m.indicator.name, fn: m.indicator.fn }))}
                cells={cells}
              />
            </div>
            <div className="ipo-card">
              <div className="ipo-head">
                <div>
                  <h2>¿Qué tan parejos van los programas?</h2>
                  <p>Cada punto es un programa; la raya gruesa, la mediana de la facultad; la punteada, la meta.</p>
                </div>
              </div>
              <DotStrips rows={mapped} />
              <StandingLegend />
            </div>
          </div>
        </section>
      )}

      {chosen && (
        <section className="ipo-section ipo-section--surface">
          <div className="u-container">
            <div className="ipo-card">
              <div className="ipo-head">
                <div>
                  <h2>
                    {chosen.indicator.code} · {chosen.indicator.name}, por sede
                  </h2>
                  <p>La cifra de cada sede es el promedio simple de lo que reportan los programas de la facultad allí.</p>
                </div>
                <label className="ipo-select">
                  <span>Indicador</span>
                  <select value={chosen.indicator.code} onChange={(e) => setParam("indicador", e.target.value)}>
                    {top.map((t) => (
                      <option key={t.indicator.id} value={t.indicator.code}>
                        {t.indicator.code} · {t.indicator.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <CampusBars rows={figures} measure={chosen.indicator.measure} target={chosen.indicator.target2026Num} tone={FUNCTION_TONE[chosen.indicator.fn]} />
            </div>
          </div>
        </section>
      )}

      <section className="ipo-section">
        <div className="u-container">
          <PiloBanner note={note} />
        </div>
      </section>
    </PortalLayout>
  );
}
