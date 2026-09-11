/* =============================================================================
   PDI por campus.

   La página responde una pregunta que el portal no podía contestar: qué hizo
   cada sede y contra qué parte del plan lo hizo.

   Y responde antes otra que nadie hace pero que decide cómo leer todo lo demás:
   **estas tres sedes no son comparables**. Cúcuta y Valledupar declaran metas y
   su cumplimiento se calcula; Bucaramanga reporta logros sin meta programada y
   el suyo no existe. Por eso la advertencia va arriba y no en una nota al pie:
   quien vea "No calculable" junto a dos porcentajes tiene que saber por qué
   antes de sacar conclusiones.

   El puente con el resto del portal son los pilares: cada uno enlaza a su ficha
   de implementación y a su cuadro de mando, que es donde vive el compromiso del
   plan frente a lo que aquí se reporta.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "../../components/layout/PublicLayout";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import {
  useCampusFacts,
  useCampusIndicators,
  useCampusPillar,
  useCampusSummary,
} from "../../data/queries";
import {
  accentFor,
  campusStateMeta,
  campusStateOrder,
  confidenceLabels,
  coveragePct,
  formatCompliance,
} from "../../data/pdi";
import { prefetchProps } from "../../lib/prefetch";
import type { CampusFact, CampusSummary } from "../../types/database";
import "./campus.css";

export function CampusPortal() {
  const summary = useCampusSummary();
  const matrix = useCampusPillar();

  const rows = useMemo(
    () => (summary.data ?? []).filter((row) => row.year !== null),
    [summary.data],
  );

  // La sede y el año elegidos. Se guardan como texto porque salen de botones,
  // y se resuelven contra lo que la base devolvió: si el lote de un año se
  // despublica, la selección cae en la primera fila disponible en vez de dejar
  // la página en blanco.
  const [campusSlug, setCampusSlug] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);

  const campusRows = useMemo(() => {
    const bySlug = new Map<string, CampusSummary[]>();
    for (const row of rows) {
      const list = bySlug.get(row.campus_slug) ?? [];
      list.push(row);
      bySlug.set(row.campus_slug, list);
    }
    return bySlug;
  }, [rows]);

  const activeSlug = campusSlug && campusRows.has(campusSlug)
    ? campusSlug
    : rows[0]?.campus_slug ?? null;

  const years = useMemo(
    () =>
      [...new Set((campusRows.get(activeSlug ?? "") ?? []).map((r) => r.year as number))].sort(
        (a, b) => b - a,
      ),
    [campusRows, activeSlug],
  );

  const activeYear = year && years.includes(year) ? year : years[0] ?? null;

  const current = rows.find(
    (row) => row.campus_slug === activeSlug && row.year === activeYear,
  );

  const facts = useCampusFacts(activeSlug ?? undefined, activeYear ?? undefined);
  const indicators = useCampusIndicators(activeSlug ?? undefined);

  const loading = summary.isPending || matrix.isPending;

  return (
    <PublicLayout className="campus-page">
      <div className="u-container campus-shell">
        <header className="campus-intro">
          <span className="eyebrow">PDI por campus</span>
          <h1>Qué reportó cada sede contra el plan</h1>
          <p className="lede">
            Los informes de gestión de Bucaramanga, Cúcuta y Valledupar, traducidos a la estructura
            del PDI: cada meta y cada logro conectado con la línea de acción a la que aporta.
          </p>
        </header>

        {loading ? (
          <LoadingBlock rows={4} label="Cargando el reporte de las sedes" />
        ) : summary.isError ? (
          <ErrorBlock error={summary.error} onRetry={() => void summary.refetch()} />
        ) : matrix.isError ? (
          <ErrorBlock error={matrix.error} onRetry={() => void matrix.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyBlock
            title="Todavía no hay reportes publicados"
            hint="Los informes se cargan desde la intranet, en PDI por campus, subiendo el libro de indicadores de la vigencia."
          />
        ) : (
          <>
            <ComparabilityNote rows={rows} />

            <CampusSelector
              rows={rows}
              activeSlug={activeSlug}
              activeYear={activeYear}
              years={years}
              onCampus={(slug) => {
                setCampusSlug(slug);
                setYear(null);
              }}
              onYear={setYear}
            />

            {current && <CampusHeadline row={current} />}

            {activeSlug && (
              <PillarMatrix
                slug={activeSlug}
                year={activeYear}
                cells={matrix.data ?? []}
              />
            )}

            <section className="campus-section" aria-labelledby="reportado-title">
              <div className="section-heading">
                <span className="eyebrow">Lo reportado</span>
                <h2 id="reportado-title">Metas y logros de la vigencia</h2>
                <p>
                  Cada fila conserva el texto del informe y la línea del plan a la que se conectó.
                </p>
              </div>

              {facts.isPending ? (
                <LoadingBlock rows={5} label="Cargando lo reportado" />
              ) : facts.isError ? (
                <ErrorBlock error={facts.error} onRetry={() => void facts.refetch()} />
              ) : (facts.data?.length ?? 0) === 0 ? (
                <EmptyBlock title="Sin registros publicados para esta vigencia" />
              ) : (
                <FactList facts={facts.data ?? []} />
              )}
            </section>

            {(indicators.data?.length ?? 0) > 0 && (
              <section className="campus-section" aria-labelledby="serie-title">
                <div className="section-heading">
                  <span className="eyebrow">Serie comparativa</span>
                  <h2 id="serie-title">Indicadores con línea base</h2>
                  <p>
                    La variación está recalculada sobre los valores de la propia tabla: varias de
                    las que traen los informes no coinciden con sus cifras.
                  </p>
                </div>
                <IndicatorTable rows={indicators.data ?? []} />
              </section>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}

/* --- La advertencia que gobierna la lectura -------------------------------- */

function ComparabilityNote({ rows }: { rows: CampusSummary[] }) {
  const sinMetas = rows.filter((row) => !row.declares_targets);
  if (sinMetas.length === 0) return null;

  const nombres = [...new Set(sinMetas.map((row) => row.campus_name))];

  return (
    <aside className="campus-note" role="note">
      <span className="campus-note__mark" aria-hidden="true">
        <Icon name="alert" size={18} />
      </span>
      <div>
        <strong>Estas sedes no son comparables entre sí.</strong>
        <p>
          {nombres.join(" y ")} {nombres.length === 1 ? "reporta" : "reportan"} logros sin meta
          programada, así que su cumplimiento no se puede calcular: aparece como{" "}
          <em>no calculable</em>, que no es lo mismo que cero. Lo que sí compara esta página es la{" "}
          <strong>cobertura</strong>: cuánto del plan está reportando cada sede.
        </p>
      </div>
    </aside>
  );
}

/* --- Selector de sede y vigencia ------------------------------------------- */

interface SelectorProps {
  rows: CampusSummary[];
  activeSlug: string | null;
  activeYear: number | null;
  years: number[];
  onCampus: (slug: string) => void;
  onYear: (year: number) => void;
}

function CampusSelector({ rows, activeSlug, activeYear, years, onCampus, onYear }: SelectorProps) {
  const campuses = useMemo(() => {
    const seen = new Map<string, CampusSummary>();
    for (const row of rows) if (!seen.has(row.campus_slug)) seen.set(row.campus_slug, row);
    return [...seen.values()];
  }, [rows]);

  return (
    <div className="campus-picker">
      <div className="campus-picker__group" role="group" aria-label="Sede">
        {campuses.map((row) => (
          <button
            key={row.campus_slug}
            type="button"
            className={`campus-tab${row.campus_slug === activeSlug ? " is-active" : ""}`}
            aria-pressed={row.campus_slug === activeSlug}
            onClick={() => onCampus(row.campus_slug)}
          >
            <Icon name="pin" size={16} />
            {row.campus_name}
          </button>
        ))}
      </div>

      {/* El año solo aparece cuando hay más de uno que elegir: un selector con
          una sola opción es ruido que finge ser control. */}
      {years.length > 1 && (
        <div className="campus-picker__group" role="group" aria-label="Vigencia">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              className={`campus-year${y === activeYear ? " is-active" : ""}`}
              aria-pressed={y === activeYear}
              onClick={() => onYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- La cifra de cabecera de la sede --------------------------------------- */

function CampusHeadline({ row }: { row: CampusSummary }) {
  const cobertura = coveragePct(row.lines_covered, row.lines_total);

  return (
    <section className="campus-headline card" aria-label={`Resumen de ${row.campus_name}`}>
      <div className="campus-headline__lead">
        <h2>
          {row.campus_name}
          <span>{row.year}</span>
        </h2>
        <p>{row.report_kind}</p>
        <p className="campus-headline__structure">{row.report_structure}</p>
      </div>

      <dl className="campus-headline__stats">
        <div>
          <dt>Cumplimiento promedio</dt>
          <dd className={row.compliance_avg === null ? "is-void" : undefined}>
            {formatCompliance(row.compliance_avg)}
          </dd>
          <small>
            {row.declares_targets
              ? `${row.targets} ${row.targets === 1 ? "meta" : "metas"} con valor programado`
              : "El informe no declara metas programadas"}
          </small>
        </div>
        <div>
          <dt>Cobertura del plan</dt>
          <dd>{cobertura}%</dd>
          <small>
            {row.lines_covered} de {row.lines_total} líneas de acción
          </small>
        </div>
        <div>
          <dt>Registros</dt>
          <dd>{row.records}</dd>
          <small>
            {row.targets} {row.targets === 1 ? "meta" : "metas"} · {row.achievements}{" "}
            {row.achievements === 1 ? "logro" : "logros"}
          </small>
        </div>
        <div>
          <dt>Pilares tocados</dt>
          <dd>{row.pillars_covered}</dd>
          <small>de 6 pilares estratégicos</small>
        </div>
      </dl>

      {row.inferred > 0 && (
        <p className="campus-headline__inferred">
          <Icon name="alert" size={14} />
          {row.inferred} {row.inferred === 1 ? "registro tiene" : "registros tienen"} su línea
          inferida por afinidad temática: el informe no la nombra.
        </p>
      )}
    </section>
  );
}

/* --- La matriz de pilares: el puente con el resto del portal ---------------- */

interface MatrixProps {
  slug: string;
  year: number | null;
  cells: import("../../types/database").CampusPillarCell[];
}

function PillarMatrix({ slug, year, cells }: MatrixProps) {
  const mine = cells
    .filter((c) => c.campus_slug === slug && (year === null || c.year === year || c.year === null))
    .sort((a, b) => a.pillar_position - b.pillar_position);

  if (mine.length === 0) return null;

  return (
    <section className="campus-section" aria-labelledby="pilares-title">
      <div className="section-heading">
        <span className="eyebrow">Pilar a pilar</span>
        <h2 id="pilares-title">Dónde se concentra el reporte de esta sede</h2>
        <p>
          Un pilar en cero no significa que la sede no haga nada ahí: significa que su informe no lo
          reporta contra el plan.
        </p>
      </div>

      <ul className="campus-pillar-grid">
        {mine.map((cell) => (
          <li
            key={cell.pillar_id}
            className="campus-pillar card"
            style={{ "--accent": accentFor(cell.pillar_accent) } as React.CSSProperties}
          >
            <header>
              <span className="campus-pillar__numeral">{cell.pillar_numeral}</span>
              <h3>{cell.pillar_name}</h3>
            </header>

            <dl className="campus-pillar__figures">
              <div>
                <dt>Cumplimiento</dt>
                <dd className={cell.compliance_avg === null ? "is-void" : undefined}>
                  {formatCompliance(cell.compliance_avg)}
                </dd>
              </div>
              <div>
                <dt>Cobertura</dt>
                <dd>
                  {cell.lines_covered}
                  <span>/{cell.lines_total}</span>
                </dd>
              </div>
              <div>
                <dt>Registros</dt>
                <dd>{cell.records}</dd>
              </div>
            </dl>

            <span className="progress-track" aria-hidden="true">
              <span
                className="progress-track__fill"
                style={{
                  width: `${coveragePct(cell.lines_covered, cell.lines_total)}%`,
                  background: accentFor(cell.pillar_accent),
                }}
              />
            </span>

            {/* El puente: lo que el plan promete y cómo va, para el mismo pilar. */}
            <footer className="campus-pillar__links">
              <Link to={`/implementacion/pilar/${cell.pillar_slug}`}>
                Qué promete el plan <span data-arrow aria-hidden="true">→</span>
              </Link>
              <Link to={`/tablero/pilar/${cell.pillar_slug}`}>
                Cómo va <span data-arrow aria-hidden="true">→</span>
              </Link>
            </footer>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --- Lo reportado, agrupado por pilar -------------------------------------- */

function FactList({ facts }: { facts: CampusFact[] }) {
  const [state, setState] = useState<string>("todos");
  const [onlyConfirmed, setOnlyConfirmed] = useState(false);

  const visible = facts.filter(
    (f) =>
      (state === "todos" || f.state === state) && (!onlyConfirmed || f.confidence === "alta"),
  );

  const counts = campusStateOrder.map((id) => ({
    id,
    meta: campusStateMeta[id],
    n: facts.filter((f) => f.state === id).length,
  }));

  return (
    <>
      <div className="campus-filter" role="group" aria-label="Filtrar lo reportado">
        <button
          type="button"
          className={`campus-chip${state === "todos" ? " is-on" : ""}`}
          aria-pressed={state === "todos"}
          onClick={() => setState("todos")}
        >
          Todos <span>{facts.length}</span>
        </button>
        {counts
          .filter((c) => c.n > 0)
          .map((c) => (
            <button
              key={c.id}
              type="button"
              className={`campus-chip${state === c.id ? " is-on" : ""}`}
              aria-pressed={state === c.id}
              onClick={() => setState(c.id)}
              style={{ "--chip": c.meta.color } as React.CSSProperties}
            >
              <span aria-hidden="true">{c.meta.glyph}</span> {c.meta.label} <span>{c.n}</span>
            </button>
          ))}

        <label className="campus-toggle">
          <input
            type="checkbox"
            checked={onlyConfirmed}
            onChange={(e) => setOnlyConfirmed(e.target.checked)}
          />
          Solo mapeos confirmados
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyBlock title="Ningún registro con ese filtro" />
      ) : (
        <ul className="campus-facts">
          {visible.map((fact) => (
            <FactRow key={fact.id} fact={fact} />
          ))}
        </ul>
      )}
    </>
  );
}

function FactRow({ fact }: { fact: CampusFact }) {
  const meta = campusStateMeta[fact.state];

  return (
    <li
      className="campus-fact"
      style={{ "--accent": accentFor(fact.pillar_accent) } as React.CSSProperties}
    >
      <div className="campus-fact__body">
        <h3>{fact.action}</h3>

        <p className="campus-fact__chain">
          <strong>{fact.pillar_numeral}</strong> {fact.pillar_name}
          {fact.line_code && (
            <>
              {" · "}
              <span>
                {fact.line_code} {fact.line_name}
              </span>
            </>
          )}
        </p>

        {fact.note && <p className="campus-fact__note">{fact.note}</p>}

        <p className="campus-fact__meta">
          {fact.confidence !== "alta" && (
            <span className="campus-fact__inferred" title={confidenceLabels[fact.confidence]}>
              <Icon name="alert" size={13} /> Asignación inferida
            </span>
          )}
          {fact.evidence && <span>Verificable en: {fact.evidence}</span>}
        </p>
      </div>

      <div className="campus-fact__figure">
        <span className="status-badge" style={{ color: meta.color }}>
          <span className="status-badge__glyph" aria-hidden="true">
            {meta.glyph}
          </span>
          {meta.label}
        </span>

        {/* Una cifra retirada se explica; un hueco sin explicación parecería un
            fallo de carga. */}
        {fact.is_monetary ? (
          <small className="campus-fact__withheld">
            Cifra financiera, no publicada
          </small>
        ) : fact.record_kind === "meta" ? (
          <small>
            {fact.actual_value ?? "—"} de {fact.target_value ?? "—"} {fact.unit.toLowerCase()}
            {fact.compliance !== null && ` · ${Math.round(fact.compliance)}%`}
          </small>
        ) : (
          fact.actual_value !== null && (
            <small>
              {fact.actual_value} {fact.unit.toLowerCase()}
            </small>
          )
        )}
      </div>
    </li>
  );
}

/* --- La serie de dos años --------------------------------------------------- */

function IndicatorTable({ rows }: { rows: import("../../types/database").CampusIndicator[] }) {
  return (
    <div className="table-scroll">
      <table className="campus-table">
        <thead>
          <tr>
            <th scope="col">Indicador</th>
            <th scope="col">Pilar</th>
            <th scope="col">{rows[0]?.base_year ?? "Base"}</th>
            <th scope="col">{rows[0]?.last_year ?? "Actual"}</th>
            <th scope="col">Variación</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <strong>{row.name}</strong>
                {row.line_code && (
                  <small>
                    {row.line_code} {row.line_name}
                  </small>
                )}
              </th>
              <td>{row.pillar_numeral}</td>
              <td>{row.is_monetary ? "—" : (row.base_value ?? "—")}</td>
              <td>{row.is_monetary ? "—" : (row.last_value ?? "—")}</td>
              <td>
                {row.variation === null ? (
                  <span className="campus-table__void">No calculable</span>
                ) : (
                  <span className={row.variation >= 0 ? "is-up" : "is-down"}>
                    {row.variation >= 0 ? "+" : ""}
                    {Math.round(row.variation)}%
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
