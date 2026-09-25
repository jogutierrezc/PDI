/* =============================================================================
   Portal de Impacto · la vista de una vicerrectoría (una función).

   Primero, cómo van sus indicadores sumando todas las facultades y todos
   los programas: el cumplimiento por facultad, la cifra institucional de
   cada indicador junto al reparto de los programas que lo eligieron y el
   avance mediano por facultad. Después, su cauce del río, su matriz de
   cadena de valor, sus lazos, el impacto real y los programas conectados.
   ========================================================================== */

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { FUNCTIONS, FUNCTION_LABEL, FUNCTION_TONE, formatFigure, progress } from "../model";
import type { SubstantiveFunction } from "../model";
import {
  FN_SLUG,
  chainCoverage,
  functionLinks,
  globalFigure,
  isFunction,
  matrixNote,
  programChain,
  programsOf,
  riverCounts,
  riverNote,
  valueMatrix,
} from "./analysis";
import type { PiloNote } from "./analysis";
import type { PortalData } from "./data";
import { ValueMatrixTable } from "./charts";
import { PiloBanner, PortalGate, PortalLayout, SectionHead } from "./parts";
import { ValueRiver } from "./ValueRiver";
import { countStandings, gridOf, groupStandingNote, metShare, spreads, standingOf, standingsOf, withTarget } from "./standing";
import { InstitutionRows, Pebble, Pebbles, StandingHeatmap, StandingLegend, StandingRows } from "./standingCharts";
import type { StackedRow } from "./standingCharts";

export function PortalFunction() {
  const { fn } = useParams();
  if (!isFunction(fn)) return <Navigate to="/impacto/vicerrectoria/investigacion" replace />;
  return <PortalGate title={FUNCTION_LABEL[fn]}>{(data) => <FunctionView data={data} fn={fn} />}</PortalGate>;
}

function FunctionView({ data, fn }: { data: PortalData; fn: SubstantiveFunction }) {
  const rows = useMemo(() => valueMatrix(data, fn), [data, fn]);
  const counts = useMemo(() => riverCounts(data), [data]);
  const links = useMemo(() => functionLinks(data).filter((l) => l.a === fn || l.b === fn), [data, fn]);
  const programs = useMemo(() => programsOf(data), [data]);
  const standings = useMemo(() => {
    const all = standingsOf(data, programs);
    for (const [id, list] of all) all.set(id, list.filter((r) => r.indicator.fn === fn));
    return all;
  }, [data, programs, fn]);
  const names = useMemo(() => new Map(programs.map((p) => [p.id, p.name])), [programs]);
  const spreadRows = useMemo(() => spreads(standings, names), [standings, names]);

  const vr = data.units.find((u) => u.kind === "vicerrectoria" && data.unitFunctions.some((f) => f.unitId === u.id && f.fn === fn));
  const own = data.indicators.filter((i) => i.fn === fn);
  const chains = rows.filter((r) => !r.unassigned);

  // Programas conectados: los que tienen al menos un eslabón de esta función.
  const connected = programs
    .map((p) => ({ program: p, coverage: chainCoverage(programChain(data, p.id), fn) }))
    .filter((p) => p.coverage.connected);
  const byFaculty = new Map<string, { name: string; total: number; complete: number }>();
  for (const c of connected) {
    const key = c.program.faculty?.id ?? "sin";
    const entry = byFaculty.get(key) ?? { name: c.program.faculty?.name ?? "Sin facultad", total: 0, complete: 0 };
    entry.total += 1;
    if (c.coverage.missing.length === 0) entry.complete += 1;
    byFaculty.set(key, entry);
  }
  const faculties = [...byFaculty.values()].sort((a, b) => b.total - a.total);
  const mostPrograms = Math.max(1, ...faculties.map((f) => f.total));

  // Lo que alimenta a otras funciones: vínculos de la matriz hacia dimensiones ajenas.
  const dimFn = new Map(data.dimensions.map((d) => [d.id, d]));
  const byId = new Map(data.indicators.map((i) => [i.id, i]));
  const feeds = data.refs
    .map((r) => ({ ref: r, indicator: byId.get(r.indicatorId), dim: dimFn.get(r.dimensionId) }))
    .filter((x) => x.indicator?.fn === fn && x.dim && x.dim.fn !== fn);

  // Impacto real: cifra de la UDES frente a línea base y meta 2026.
  const results = own
    .filter((i) => i.stage === "impacto")
    .map((i) => ({ indicator: i, value: globalFigure(data, i.id) }))
    .sort((a, b) => Number(Boolean(b.value)) - Number(Boolean(a.value)) || a.indicator.code.localeCompare(b.indicator.code));
  const withFigure = results.filter((r) => r.value);
  const resultsNote: PiloNote = withFigure.length
    ? {
        mood: "idea",
        title: "Cómo leer estas barras",
        lines: [
          "La barra clara es la línea base; la intensa, la última cifra; la raya, la meta 2026.",
          `${withFigure.length} de ${results.length} indicadores de impacto real ya tienen cifra de la UDES.`,
        ],
      }
    : { mood: "duda", title: "Sin cifras todavía", lines: ["Cuando la vicerrectoría registre la cifra de la UDES en Captura, aquí se verá contra su meta."] };

  // Cumplimiento: programa × indicador de esta función, sumado por facultad.
  const adopting = programs.filter((p) => (standings.get(p.id) ?? []).length > 0);
  const allRows = adopting.flatMap((p) => standings.get(p.id) ?? []);
  const standing = countStandings(allRows);
  const reporting = adopting.filter((p) => (standings.get(p.id) ?? []).some((r) => r.value !== null)).length;
  const groups = new Map<string, { key: string; name: string; slug: string | null; programs: typeof adopting }>();
  for (const p of adopting) {
    const key = p.faculty?.id ?? "sin";
    const g = groups.get(key) ?? { key, name: p.faculty?.name ?? "Sin facultad", slug: p.faculty?.slug ?? null, programs: [] };
    g.programs.push(p);
    groups.set(key, g);
  }
  const perFaculty = [...groups.values()]
    .map((g) => ({ ...g, counts: countStandings(g.programs.flatMap((p) => standings.get(p.id) ?? [])) }))
    .sort((a, b) => (metShare(b.counts) ?? -1) - (metShare(a.counts) ?? -1) || a.name.localeCompare(b.name, "es"));
  const stacked: StackedRow[] = [
    { key: "total", name: "Toda la UDES", detail: `${adopting.length} prog.`, counts: standing, total: true },
    ...perFaculty.map((g) => ({
      key: g.key,
      name: g.name,
      to: g.slug ? `/impacto/facultad/${g.slug}` : undefined,
      detail: `${g.programs.length} prog.`,
      counts: g.counts,
    })),
  ];
  const institution = spreadRows.map((sp) => {
    const value = globalFigure(data, sp.indicator.id);
    const target = sp.indicator.target2026Num;
    return { spread: sp, udes: { value: value?.valueNum ?? null, target, pct: progress(value?.valueNum ?? null, target, sp.indicator.direction) } };
  });
  const udesMeasured = institution.filter((r) => r.udes.pct !== null);
  const udesMet = udesMeasured.filter((r) => standingOf(r.udes.pct, true) === "cumplida");
  const heatCells = spreadRows.map((sp) => perFaculty.map((g) => gridOf(g.programs.flatMap((p) => standings.get(p.id) ?? []), [sp.indicator.id])[0]));
  const standingNote = groupStandingNote(spreadRows, perFaculty.map((g) => ({ name: g.name, counts: g.counts })), FUNCTION_LABEL[fn]);

  return (
    <PortalLayout title={FUNCTION_LABEL[fn]}>
      <section className="ipo-unit-head" style={{ "--tone": FUNCTION_TONE[fn] } as CSSProperties}>
        <div className="u-container ipo-unit-head__grid">
          <div>
            <nav className="ipo-pills" aria-label="Función">
              {FUNCTIONS.map((f) => (
                <Link key={f} to={`/impacto/vicerrectoria/${FN_SLUG[f]}`} aria-current={f === fn ? "page" : undefined} style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
                  <i aria-hidden="true" />
                  {FUNCTION_LABEL[f]}
                </Link>
              ))}
            </nav>
            <h1>{vr?.name ?? `Vicerrectoría de ${FUNCTION_LABEL[fn]}`}</h1>
            <p className="ipo-lede">
              Sus {own.length} indicadores en {chains.length} {chains.length === 1 ? "dimensión" : "dimensiones"}, cómo se encadenan
              hasta el impacto real y qué programas los han tomado.
            </p>
          </div>
          <div className="ist-head-side">
          <Link className="button-secondary ist-pdf" to={`/impacto/boletin/vicerrectoria/${FN_SLUG[fn]}`}>
            Boletín PDF
          </Link>
          <div className="ipo-minikpis">
            <div>
              <strong>{own.length}</strong>
              <span>indicadores</span>
            </div>
            <div>
              <strong>
                {chains.filter((r) => r.complete).length} <small>de {chains.length}</small>
              </strong>
              <span>cadenas completas</span>
            </div>
            <div>
              <strong>{connected.length}</strong>
              <span>programas conectados</span>
            </div>
          </div>
          </div>
        </div>
      </section>

      <section className="ipo-section" aria-labelledby="cumplimiento-titulo">
        <div className="u-container ist-stack">
          <h2 id="cumplimiento-titulo" className="sr-only">
            Cumplimiento de los indicadores de {FUNCTION_LABEL[fn]}
          </h2>
          <Pebbles>
            <Pebble label="Programas que eligieron sus indicadores" value={adopting.length} note={`${allRows.length} indicadores elegidos en total`} />
            <Pebble label="Programas que reportan" value={reporting} of={`de ${adopting.length}`} note={`${standing.sin_cifra} cifras pendientes`} />
            <Pebble
              label="Metas de programa cumplidas"
              value={metShare(standing) === null ? "—" : `${metShare(standing)} %`}
              note={`${standing.cumplida} de ${withTarget(standing)} con meta`}
              tone="bien"
            />
            <Pebble
              label="Cifra institucional en meta"
              value={udesMet.length}
              of={`de ${udesMeasured.length} con cifra`}
              note={udesMet.length ? udesMet.slice(0, 2).map((r) => r.spread.indicator.name).join(" · ") : "La UDES aún no cumple ninguna"}
            />
          </Pebbles>

          {adopting.length === 0 ? (
            <div className="ipo-card">
              <p className="ipo-muted">Ningún programa ha elegido todavía indicadores de {FUNCTION_LABEL[fn]}.</p>
            </div>
          ) : (
            <>
              <div className="ipo-card" data-tour="ipo-fn-standing">
                <div className="ipo-head">
                  <div>
                    <h2>Cumplimiento por facultad</h2>
                    <p>Todos los indicadores de {FUNCTION_LABEL[fn]} que eligieron sus programas, en su estado frente a la meta 2026.</p>
                  </div>
                </div>
                <StandingRows rows={stacked} label={`Cumplimiento de ${FUNCTION_LABEL[fn]} por facultad`} unit="Facultad" />
                <StandingLegend />
              </div>

              <div className="ipo-card">
                <div className="ipo-head">
                  <div>
                    <h2>Cada indicador: la UDES y sus programas</h2>
                    <p>
                      La cifra institucional frente a su meta y cómo se reparten los programas que lo eligieron: la caja es la mitad central, la raya la mediana,
                      los bigotes el más bajo y el más alto.
                    </p>
                  </div>
                </div>
                <InstitutionRows rows={institution} />
              </div>

              <div className="ipo-card">
                <div className="ipo-head">
                  <div>
                    <h2>Indicador por facultad</h2>
                    <p>Avance mediano de los programas de cada facultad. «·» ningún programa lo eligió; «○» sin cifra.</p>
                  </div>
                </div>
                <StandingHeatmap
                  caption={`Avance mediano por facultad en los indicadores de ${FUNCTION_LABEL[fn]}`}
                  rows={spreadRows.map((sp) => ({
                    key: sp.indicator.id,
                    name: (
                      <>
                        <b className="ist-code" style={{ "--tone": FUNCTION_TONE[fn] } as CSSProperties}>
                          {sp.indicator.code}
                        </b>{" "}
                        {sp.indicator.name}
                      </>
                    ),
                  }))}
                  cols={perFaculty.map((g) => ({ key: g.key, code: "", name: g.name, fn }))}
                  cells={heatCells}
                />
              </div>

              <PiloBanner note={standingNote} />
            </>
          )}
        </div>
      </section>

      <section className="ipo-section ipo-section--surface">
        <div className="u-container ipo-two ipo-two--wide">
          <div className="ipo-card" data-tour="ipo-fn-river">
            <SectionHead title="Su cauce" hint="De los insumos al impacto real." note={riverNote(counts)} />
            <ValueRiver counts={counts} functions={[fn]} compact />
          </div>
          <div className="ipo-card">
            <SectionHead title="Sus lazos" hint="Pilares y ODS que comparte con las otras funciones." />
            <ul className="ipo-feed">
              {links.map((l) => {
                const other = l.a === fn ? l.b : l.a;
                return (
                  <li key={other} style={{ "--tone": FUNCTION_TONE[other] } as CSSProperties}>
                    <strong>
                      {FUNCTION_LABEL[other]} · {l.score}
                    </strong>
                    <span>{l.shared.length ? l.shared.slice(0, 3).map((s) => s.label).join(", ") : "Sin pilares ni ODS en común todavía."}</span>
                  </li>
                );
              })}
              {feeds.slice(0, 4).map((x) => (
                <li key={`${x.ref.indicatorId}-${x.ref.dimensionId}-${x.ref.stage}`} style={{ "--tone": FUNCTION_TONE[x.dim!.fn] } as CSSProperties}>
                  <strong>
                    {x.indicator!.code} alimenta {x.dim!.name}
                  </strong>
                  <span>{x.ref.note || `Cuenta como antecedente en ${FUNCTION_LABEL[x.dim!.fn]}.`}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="ipo-section" aria-labelledby="cadena-titulo" data-tour="ipo-fn-matrix">
        <div className="u-container">
          <SectionHead id="cadena-titulo" title="La cadena de cada dimensión" hint="Pase el cursor por una cifra para ver los códigos." />
          <ValueMatrixTable rows={rows} caption={`Matriz de cadena de valor de ${FUNCTION_LABEL[fn]}`} />
          <PiloBanner note={matrixNote(rows, fn)} />
        </div>
      </section>

      <section className="ipo-section ipo-section--surface">
        <div className="u-container ipo-two">
          <div className="ipo-card">
            <SectionHead title="Impacto real: línea base, cifra y meta" note={resultsNote} />
            {results.length === 0 ? (
              <p className="ipo-muted">Esta función aún no tiene indicadores de impacto real publicados.</p>
            ) : (
              <ul className="ipo-results" style={{ "--tone": FUNCTION_TONE[fn] } as CSSProperties}>
                {results.slice(0, 8).map(({ indicator: i, value }) => {
                  const scale = Math.max(1, i.target2026Num ?? 0, i.baselineNum ?? 0, value?.valueNum ?? 0) * 1.1;
                  const pct = progress(value?.valueNum ?? null, i.target2026Num, i.direction);
                  return (
                    <li key={i.id}>
                      <span className="ipo-results__name">
                        <b>{i.code}</b> {i.name}
                      </span>
                      <div className="ipo-results__bars" aria-hidden="true">
                        {i.baselineNum !== null && <span className="ipo-results__base" style={{ width: `${(i.baselineNum / scale) * 100}%` }} />}
                        {value?.valueNum != null && <span className="ipo-results__now" style={{ width: `${(value.valueNum / scale) * 100}%` }} />}
                        {i.target2026Num !== null && <i style={{ left: `${(i.target2026Num / scale) * 100}%` }} />}
                      </div>
                      <span className="ipo-results__value">
                        {value?.valueNum != null ? formatFigure(value.valueNum, i.measure) : "Sin cifra"}
                        {pct !== null && <small>{pct}% de la meta</small>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="ipo-card" data-tour="ipo-fn-programs">
            <SectionHead title={`Programas conectados a ${FUNCTION_LABEL[fn]}`} hint="Por facultad. La parte intensa: programas con la cadena completa." />
            {faculties.length === 0 ? (
              <p className="ipo-muted">Ningún programa ha elegido todavía indicadores de esta función.</p>
            ) : (
              <ul className="ipo-facbars" style={{ "--tone": FUNCTION_TONE[fn] } as CSSProperties}>
                {faculties.map((f) => (
                  <li key={f.name}>
                    <span>{f.name}</span>
                    <div style={{ width: `${(f.total / mostPrograms) * 100}%` }}>
                      <span style={{ width: `${(f.complete / f.total) * 100}%` }} />
                    </div>
                    <strong>
                      {f.total}
                      <small>{f.complete} completas</small>
                    </strong>
                  </li>
                ))}
              </ul>
            )}
            <Link className="ipo-link" to="/impacto/facultades">
              Abrir una facultad
            </Link>
          </div>
        </div>
      </section>
    </PortalLayout>
  );
}
