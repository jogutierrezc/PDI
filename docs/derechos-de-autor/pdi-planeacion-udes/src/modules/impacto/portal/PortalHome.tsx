/* =============================================================================
   Portal de Impacto · la vista institucional.

   1. El río (del primer portal): las tres funciones cruzando las cuatro
      estaciones de la cadena de valor, con cuántas fichas tienen cifra.
   2. Mirar por unidad: vicerrectorías, facultades y programas como piedras.
   3. Los lazos entre funciones: pilares y ODS que comparten.
   4. La matriz de cadena de valor, función por función.
   5. Resultados: indicadores por eslabón y metas 2026.
   Mr. Pilo explica cada gráfica y señala la brecha más seria de la matriz.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { FUNCTIONS, FUNCTION_LABEL, FUNCTION_TONE } from "../model";
import type { SubstantiveFunction } from "../model";
import {
  FN_SLUG,
  chainSummary,
  facultiesOf,
  functionLinks,
  goalStates,
  goalsNote,
  linksNote,
  matrixNote,
  programsOf,
  riverCounts,
  riverNote,
  valueMatrix,
} from "./analysis";
import type { PortalData } from "./data";
import { FunctionLinks, GoalBar, StageBars, ValueMatrixTable } from "./charts";
import { PiloBanner, PiloExplain, PortalGate, PortalLayout, SectionHead } from "./parts";
import { ValueRiver } from "./ValueRiver";
import { pebbleShape } from "./shape";

export function PortalHome() {
  return <PortalGate title="Institucional">{(data) => <Home data={data} />}</PortalGate>;
}

type Lens = "vicerrectoria" | "facultad" | "programa";

function Home({ data }: { data: PortalData }) {
  const counts = useMemo(() => riverCounts(data), [data]);
  const links = useMemo(() => functionLinks(data), [data]);
  const chains = useMemo(() => chainSummary(data), [data]);
  const goals = useMemo(() => goalStates(data), [data]);
  const programs = useMemo(() => programsOf(data), [data]);
  const faculties = useMemo(() => facultiesOf(data), [data]);
  const [fn, setFn] = useState<SubstantiveFunction>("investigacion");
  const [lens, setLens] = useState<Lens>("facultad");
  const rows = useMemo(() => valueMatrix(data, fn), [data, fn]);

  const totals = Object.fromEntries(FUNCTIONS.map((f) => [f, data.indicators.filter((i) => i.fn === f).length])) as Record<
    SubstantiveFunction,
    number
  >;
  const impact = data.indicators.filter((i) => i.stage === "impacto");
  const suggested = impact.filter((i) => i.suggested).length;
  const adopting = new Set(data.adoptions.map((a) => a.programId)).size;

  const stones =
    lens === "vicerrectoria"
      ? FUNCTIONS.map((f) => ({
          key: f,
          to: `/impacto/vicerrectoria/${FN_SLUG[f]}`,
          detail: "Vicerrectoría",
          name: FUNCTION_LABEL[f],
          count: `${totals[f]} indicadores`,
          tone: FUNCTION_TONE[f],
        }))
      : lens === "facultad"
        ? faculties.map((f) => {
            const n = programs.filter((p) => p.faculty?.id === f.id).length;
            return { key: f.id, to: `/impacto/facultad/${f.slug}`, detail: f.code, name: f.name, count: `${n} ${n === 1 ? "programa" : "programas"}`, tone: undefined };
          })
        : programs.map((p) => {
            const n = new Set(data.adoptions.filter((a) => a.programId === p.id).map((a) => a.indicatorId)).size;
            return {
              key: p.id,
              to: `/impacto/programas?programa=${p.slug}`,
              detail: p.faculty?.name ?? "Sin facultad",
              name: p.name,
              count: `${n} ${n === 1 ? "indicador elegido" : "indicadores elegidos"}`,
              tone: undefined,
            };
          });

  return (
    <PortalLayout title="Institucional">
      <section className="ipo-hero">
        <div className="u-container ipo-hero__grid">
          <div className="ipo-hero__copy">
            <span className="ipo-eyebrow">Vista institucional</span>
            <h1>Impacto Institucional</h1>
            <p className="ipo-lede">
              Cómo la investigación, la enseñanza y la extensión convierten lo que la universidad tiene en cambios que se
              pueden medir. {data.indicators.length} indicadores, de los insumos al impacto real.
            </p>
            <ul className="ipo-hero__functions">
              {FUNCTIONS.map((f) => (
                <li key={f} style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
                  <Link to={`/impacto/vicerrectoria/${FN_SLUG[f]}`}>
                    <strong>{totals[f]}</strong>
                    <span>{FUNCTION_LABEL[f]}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="ipo-hero__actions">
              <a className="button-primary" href="#matriz">
                Ver la matriz
                <Icon name="arrow-right" size={16} />
              </a>
              <a className="button-ghost" href="#unidades">
                Elegir una unidad
              </a>
            </div>
          </div>
          <div className="ipo-hero__river" data-tour="ipo-river">
            <div className="ipo-hero__explain">
              <PiloExplain note={riverNote(counts)} />
            </div>
            <ValueRiver counts={counts} />
          </div>
        </div>
      </section>

      <section className="ipo-kpis" aria-label="En cifras">
        <div className="u-container ipo-kpis__grid">
          <div>
            <strong>{data.indicators.length}</strong>
            <span>indicadores publicados</span>
          </div>
          <div>
            <strong>{impact.length}</strong>
            <span>
              miden impacto real{suggested ? ` (${suggested} sugeridos)` : ""}
            </span>
          </div>
          <div>
            <strong>
              {chains.complete} <small>de {chains.dimensions}</small>
            </strong>
            <span>dimensiones con la cadena completa</span>
          </div>
          <div>
            <strong>{adopting}</strong>
            <span>programas con indicadores elegidos</span>
          </div>
        </div>
      </section>

      <section className="ipo-section ipo-section--surface" id="unidades" aria-labelledby="unidades-titulo" data-tour="ipo-lenses">
        <div className="u-container">
          <SectionHead id="unidades-titulo" title="Mirar por unidad" hint="Cada unidad tiene su propia cadena, armada con lo que eligen y reportan sus programas." />
          <div className="ipo-tabs" role="tablist" aria-label="Tipo de unidad">
            {(
              [
                ["vicerrectoria", "Vicerrectorías", 3],
                ["facultad", "Facultades", faculties.length],
                ["programa", "Programas", programs.length],
              ] as [Lens, string, number][]
            ).map(([k, label, n]) => (
              <button key={k} type="button" role="tab" aria-selected={lens === k} onClick={() => setLens(k)}>
                {label}
                <span>{n}</span>
              </button>
            ))}
          </div>
          {stones.length === 0 ? (
            <p className="ipo-muted">Aún no hay unidades de este tipo en la estructura.</p>
          ) : (
            <ul className="ipo-stones" role="tabpanel">
              {stones.slice(0, lens === "programa" ? 12 : undefined).map((s) => (
                <li key={s.key}>
                  <Link to={s.to} className="ipo-stone" style={{ "--shape": pebbleShape(s.key), ...(s.tone ? { "--tone": s.tone } : {}) } as CSSProperties}>
                    <span className="ipo-stone__detail">{s.detail}</span>
                    <strong>{s.name}</strong>
                    <span className="ipo-stone__count">{s.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {lens === "programa" && stones.length > 12 && (
            <Link className="ipo-link" to="/impacto/programas">
              Ver los {stones.length} programas con filtros de sede y facultad <Icon name="arrow-right" size={14} />
            </Link>
          )}
        </div>
      </section>

      <section className="ipo-section" aria-labelledby="lazos-titulo" data-tour="ipo-links">
        <div className="u-container ipo-links-grid">
          <div className="ipo-card">
            <SectionHead
              id="lazos-titulo"
              title="Las tres funciones y sus vínculos"
              hint="El círculo es cuántos indicadores tiene cada función; el grosor del lazo, cuántos pilares y ODS comparten."
              note={linksNote(links)}
            />
            <FunctionLinks totals={totals} links={links} />
          </div>
          <ul className="ipo-linklist">
            {links.map((l, i) => (
              <li key={`${l.a}-${l.b}`} className="ipo-card">
                <strong className="ipo-linklist__score">{l.score}</strong>
                <div>
                  <h3>
                    {FUNCTION_LABEL[l.a]} ⟷ {FUNCTION_LABEL[l.b]}
                    {i === 0 && l.score > 0 ? " · el lazo más fuerte" : i === links.length - 1 && l.score > 0 ? " · el lazo por fortalecer" : ""}
                  </h3>
                  <p>
                    {l.shared.length
                      ? `Comparten ${l.shared
                          .slice(0, 3)
                          .map((s) => s.label)
                          .join(", ")}.`
                      : "Aún no comparten pilares ni ODS confirmados."}
                  </p>
                </div>
              </li>
            ))}
            <li className="ipo-note">El número del lazo suma, por cada pilar y ODS, cuántos indicadores de ambas funciones coinciden en él.</li>
          </ul>
        </div>
      </section>

      <section className="ipo-section ipo-section--surface" id="matriz" aria-labelledby="matriz-titulo" data-tour="ipo-matrix">
        <div className="u-container">
          <SectionHead
            id="matriz-titulo"
            title="La matriz de cadena de valor"
            hint="Filas: las dimensiones de cada función. Columnas: los cuatro eslabones. Cada cifra es un número de indicadores."
          />
          <div className="ipo-tabs" role="tablist" aria-label="Función">
            {FUNCTIONS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={fn === f}
                onClick={() => setFn(f)}
                style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}
                data-tone
              >
                {FUNCTION_LABEL[f]}
                <span>{totals[f]}</span>
              </button>
            ))}
          </div>
          <ValueMatrixTable rows={rows} caption={`Matriz de cadena de valor de ${FUNCTION_LABEL[fn]}`} />
          <PiloBanner
            note={matrixNote(rows, fn)}
            action={
              <Link className="ipo-pilo__go" to={`/impacto/vicerrectoria/${FN_SLUG[fn]}`}>
                Ver {FUNCTION_LABEL[fn]}
              </Link>
            }
          />
        </div>
      </section>

      <section className="ipo-section" aria-label="Resultados" data-tour="ipo-results">
        <div className="u-container ipo-two">
          <div className="ipo-card">
            <SectionHead title="Indicadores por eslabón" note={riverNote(counts)} />
            <StageBars counts={counts} />
          </div>
          <div className="ipo-card">
            <SectionHead title="Metas 2026 de la universidad" hint="La última cifra de la UDES frente a la meta de cada ficha." note={goalsNote(goals)} />
            <GoalBar states={goals} />
          </div>
        </div>
      </section>
    </PortalLayout>
  );
}
