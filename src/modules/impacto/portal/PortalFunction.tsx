/* =============================================================================
   Portal de Impacto · la vista de una vicerrectoría (una función).

   Su cauce del río, su matriz de cadena de valor, a qué otras funciones se
   enlaza, cómo van sus indicadores de impacto real frente a la meta y qué
   programas, facultad por facultad, eligieron indicadores suyos.
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
      </section>

      <section className="ipo-section">
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

      <section className="ipo-section ipo-section--surface" aria-labelledby="cadena-titulo" data-tour="ipo-fn-matrix">
        <div className="u-container">
          <SectionHead id="cadena-titulo" title="La cadena de cada dimensión" hint="Pase el cursor por una cifra para ver los códigos." />
          <ValueMatrixTable rows={rows} caption={`Matriz de cadena de valor de ${FUNCTION_LABEL[fn]}`} />
          <PiloBanner note={matrixNote(rows, fn)} />
        </div>
      </section>

      <section className="ipo-section">
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
