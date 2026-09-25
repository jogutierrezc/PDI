/* =============================================================================
   Impacto · Mi programa (propuestas B2 y B4).

   Lo que un programa reporta en una sede, en dos formas que se alternan:

     Un indicador a la vez (B2)  la lista a la izquierda y, al centro, la hoja
                                 del indicador: su cifra del año (o numerador
                                 ÷ denominador), la serie contra las metas, la
                                 evidencia; a la derecha, lo de la vicerrectoría
                                 y lo que falta para quedar completo.
     Frente a la UDES (B4)       cada indicador en una línea: el recorrido del
                                 programa, la cifra UDES y la meta de la
                                 vicerrectoría; elegir uno abre su hoja.

   El programa escribe sus cifras, su línea base y sus metas. Lo de la
   vicerrectoría se ve y no se toca.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { SaveState, StageEmpty } from "../admin/udes-en-cifras/ui";
import {
  COMPLETE_YEAR,
  FUNCTION_LABEL,
  STAGES,
  STAGE_LABEL,
  YEARS,
  byChain,
  displayValue,
  formatFigure,
  latestValue,
  missingForComplete,
  parseFigure,
  parseTarget,
  programState,
  type Adoption,
  type Indicator,
  type ProgramSite,
  type Value,
} from "./model";
import {
  ownAdoption,
  useAdoptions,
  useSaveAdoptionTargets,
  useSaveValues,
  useValues,
  type Catalog,
  type ImpactBase,
} from "./store";
import { StateMark } from "./Capture";

type Mode = "serie" | "comparar";

export function ProgramWork({
  site,
  base,
  catalog,
  canEdit,
  mode,
  setMode,
  onChoose,
}: {
  site: ProgramSite;
  base: ImpactBase;
  catalog: Catalog;
  canEdit: boolean;
  mode: Mode;
  setMode: (mode: Mode) => void;
  onChoose: () => void;
}) {
  const adoptions = useAdoptions({ programId: site.programId, campusId: site.campusId });
  // Lo que sigue: las fichas adoptadas y sus propios indicadores en esta sede.
  const own = useMemo(
    () =>
      catalog.programIndicators.filter(
        (i) => i.programId === site.programId && i.campusId === site.campusId && i.status !== "retirado",
      ),
    [catalog.programIndicators, site.programId, site.campusId],
  );
  const active = useMemo(
    () => [...(adoptions.data ?? []).filter((a) => a.active), ...own.map(ownAdoption)],
    [adoptions.data, own],
  );
  const indicators = useMemo(
    () => [...catalog.indicators, ...own].filter((i) => active.some((a) => a.indicatorId === i.id)).sort(byChain),
    [catalog.indicators, own, active],
  );
  const ids = useMemo(() => indicators.map((i) => i.id), [indicators]);
  const values = useValues(ids, site);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId || !ids.includes(selectedId)) setSelectedId(ids[0] ?? null);
  }, [ids, selectedId]);

  const mineOf = (id: string) => (values.data ?? []).filter((v) => v.indicatorId === id && v.programId === site.programId && v.campusId === site.campusId);
  const udesOf = (id: string) => (values.data ?? []).filter((v) => v.indicatorId === id && !v.programId);
  const adoptionOf = (id: string) => active.find((a) => a.indicatorId === id)!;

  if (adoptions.isPending || (ids.length > 0 && values.isPending)) return <p className="admin-loading">Cargando lo reportado…</p>;

  if (indicators.length === 0) {
    return (
      <StageEmpty title="La captura se habilita cuando el programa tenga indicadores">
        Elija primero a qué indicadores de las vicerrectorías aporta, con Mr. Pilo o a mano, o cree los suyos en Mi
        catálogo.{" "}
        <button type="button" className="oda-link-button" onClick={onChoose}>
          Elegir indicadores
        </button>
      </StageEmpty>
    );
  }

  const complete = indicators.filter((i) => programState(adoptionOf(i.id), mineOf(i.id)) === "completo").length;
  const selected = indicators.find((i) => i.id === selectedId) ?? indicators[0];

  return (
    <div className="imp-program">
      <div className="imp-toolbar">
        <div className="imp-seg" role="group" aria-label="Cómo verlo">
          <button type="button" aria-pressed={mode === "serie"} onClick={() => setMode("serie")}>
            <Icon name="document" size={14} /> Un indicador a la vez
          </button>
          <button type="button" aria-pressed={mode === "comparar"} onClick={() => setMode("comparar")}>
            <Icon name="chart" size={14} /> Frente a la UDES
          </button>
        </div>
        <span className="imp-progress-line">
          <b>
            {complete} de {indicators.length}
          </b>{" "}
          completos a corte {COMPLETE_YEAR}
          <span className="imp-bar" aria-hidden="true">
            <i style={{ width: `${Math.round((complete / indicators.length) * 100)}%` }} />
          </span>
        </span>
      </div>

      {mode === "comparar" ? (
        <Compare
          indicators={indicators}
          base={base}
          mineOf={mineOf}
          udesOf={udesOf}
          adoptionOf={adoptionOf}
          onOpen={(id) => {
            setSelectedId(id);
            setMode("serie");
          }}
        />
      ) : (
        <div className="imp-series">
          <nav className="imp-queue" aria-label="Indicadores que sigue el programa">
            {STAGES.filter((s) => indicators.some((i) => i.stage === s)).map((stage) => (
              <div key={stage}>
                <span className="imp-queue__head">{STAGE_LABEL[stage]}</span>
                {indicators
                  .filter((i) => i.stage === stage)
                  .map((i) => (
                    <button key={i.id} type="button" aria-current={i.id === selected.id || undefined} onClick={() => setSelectedId(i.id)}>
                      <span className="imp-code" data-own={i.programId ? "" : undefined}>{i.programId ? "Propio" : i.code}</span>
                      <span className="imp-queue__name">{i.name}</span>
                      <QueueMark state={programState(adoptionOf(i.id), mineOf(i.id))} />
                    </button>
                  ))}
              </div>
            ))}
          </nav>
          <IndicatorSheet
            key={selected.id}
            indicator={selected}
            adoption={adoptionOf(selected.id)}
            mine={mineOf(selected.id)}
            udes={udesOf(selected.id)}
            site={site}
            base={base}
            canEdit={canEdit && selected.programReports}
            onNext={() => {
              const k = indicators.findIndex((i) => i.id === selected.id);
              setSelectedId(indicators[(k + 1) % indicators.length].id);
            }}
          />
        </div>
      )}
    </div>
  );
}

function QueueMark({ state }: { state: ReturnType<typeof programState> }) {
  const label = state === "completo" ? "Completo" : state === "en_proceso" ? "En proceso" : "Sin iniciar";
  return (
    <span className="imp-queue__mark" data-state={state} title={label}>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* --- B2 · la hoja de un indicador --------------------------------------------------- */

function IndicatorSheet({
  indicator,
  adoption,
  mine,
  udes,
  site,
  base,
  canEdit,
  onNext,
}: {
  indicator: Indicator;
  adoption: Adoption;
  mine: Value[];
  udes: Value[];
  site: ProgramSite;
  base: ImpactBase;
  canEdit: boolean;
  onNext: () => void;
}) {
  const cut = Math.min(new Date().getFullYear() - 1, 2028);
  const [year, setYear] = useState(cut);
  const current = mine.find((v) => v.year === year);
  const ratio = indicator.measure === "porcentaje" || indicator.measure === "proporcion" || indicator.measure === "dual";

  const [text, setText] = useState("");
  const [num, setNum] = useState("");
  const [den, setDen] = useState("");
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [na, setNa] = useState(false);
  const [targets, setTargets] = useState({ baseline: "", t26: "", t28: "" });

  // Al cambiar de año o de datos, el formulario toma lo guardado.
  useEffect(() => {
    setText(current && !current.notApplicable ? (current.valueNum !== null ? String(current.valueNum).replace(".", ",") : current.valueText) : "");
    setNum(current?.numerator !== null && current?.numerator !== undefined ? String(current.numerator) : "");
    setDen(current?.denominator !== null && current?.denominator !== undefined ? String(current.denominator) : "");
    setEvidence(current?.evidenceUrl ?? "");
    setNote(current?.note ?? "");
    setNa(current?.notApplicable ?? false);
  }, [current?.id, current?.updatedAt, year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTargets({ baseline: adoption.baselineText, t26: adoption.target2026, t28: adoption.target2028 });
  }, [adoption.id, adoption.baselineText, adoption.target2026, adoption.target2028]);

  const saveValues = useSaveValues();
  const saveTargets = useSaveAdoptionTargets();

  const numN = parseFigure(num);
  const denN = parseFigure(den);
  const computed = ratio && numN !== null && denN ? Math.round((numN / denN) * 10000) / 100 : null;
  const evidenceOk = !evidence || /^https?:\/\//i.test(evidence.trim());

  const valueDirty =
    (current
      ? text !== (current.notApplicable ? "" : current.valueNum !== null ? String(current.valueNum).replace(".", ",") : current.valueText) ||
        num !== (current.numerator !== null ? String(current.numerator) : "") ||
        den !== (current.denominator !== null ? String(current.denominator) : "") ||
        evidence !== current.evidenceUrl ||
        note !== current.note ||
        na !== current.notApplicable
      : Boolean(text || num || den || evidence || note || na));
  const targetsDirty =
    targets.baseline !== adoption.baselineText || targets.t26 !== adoption.target2026 || targets.t28 !== adoption.target2028;

  const submit = async (andNext: boolean) => {
    if (valueDirty) {
      const figure = parseFigure(text);
      await saveValues.mutateAsync([
        {
          id: current?.id,
          indicatorId: indicator.id,
          year,
          programId: site.programId,
          campusId: site.campusId,
          notApplicable: na,
          numerator: na ? null : numN,
          denominator: na ? null : denN,
          valueNum: na ? null : computed ?? (indicator.measure === "texto" ? null : figure),
          valueText: na ? "" : figure === null || indicator.measure === "texto" ? text.trim() : "",
          evidenceUrl: evidence.trim(),
          note: note.trim(),
        },
      ]);
    }
    if (targetsDirty) {
      await saveTargets.mutateAsync({
        id: adoption.id,
        baseline_text: targets.baseline.trim(),
        baseline_num: parseFigure(targets.baseline),
        target_2026: targets.t26.trim(),
        target_2026_num: parseTarget(targets.t26),
        target_2028: targets.t28.trim(),
        target_2028_num: parseTarget(targets.t28),
      });
    }
    if (andNext) onNext();
  };

  const missing = missingForComplete(adoption, mine);
  const udesLast = latestValue(udes);
  const dimension = base.dimensions.find((d) => d.id === indicator.dimensionId)?.name;
  const pending = saveValues.isPending || saveTargets.isPending;

  return (
    <>
      <section className="imp-sheet imp-sheet--work" aria-labelledby="imp-hoja-titulo">
        <header className="imp-sheet__head">
          <span className="imp-muted imp-small">
            {indicator.code} · {FUNCTION_LABEL[indicator.fn]}
            {dimension ? ` · ${dimension}` : ""} · {STAGE_LABEL[indicator.stage]}
          </span>
          <h2 id="imp-hoja-titulo" className="imp-sheet__title imp-sheet__title--lg">
            {indicator.name}
          </h2>
          {indicator.description && <p className="imp-muted imp-small">{indicator.description}</p>}
        </header>

        <div className="imp-sheet__body">
          {!indicator.programReports && (
            <p className="oda-banner" role="note">
              <Icon name="eye" size={16} /> Este indicador lo reporta la institución. Tu programa lo sigue para consultarlo.
            </p>
          )}

          <div className="imp-years" role="group" aria-label="Año que reportas">
            {YEARS.map((y) => {
              const v = mine.find((x) => x.year === y);
              return (
                <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)} data-filled={Boolean(v && (v.valueNum !== null || v.valueText || v.notApplicable)) || undefined}>
                  <span>{y === 2023 ? "LB 2023" : y}</span>
                  <b>{v ? displayValue(v, indicator.measure) || "—" : "—"}</b>
                </button>
              );
            })}
          </div>

          <fieldset className="imp-fieldset" disabled={!canEdit || na}>
            <legend>Tu cifra {year}</legend>
            {ratio ? (
              <div className="imp-ratio">
                <label className="admin-field">
                  <span>{indicator.numerator || "Numerador"}</span>
                  <input value={num} onChange={(e) => setNum(e.target.value)} inputMode="decimal" />
                </label>
                <span className="imp-ratio__op" aria-hidden="true">÷</span>
                <label className="admin-field">
                  <span>{indicator.denominator || "Denominador"}</span>
                  <input value={den} onChange={(e) => setDen(e.target.value)} inputMode="decimal" />
                </label>
                <span className="imp-ratio__op" aria-hidden="true">=</span>
                <label className="admin-field">
                  <span>Cifra</span>
                  {computed !== null ? (
                    <output className="imp-ratio__result">{formatFigure(computed, "porcentaje")}</output>
                  ) : (
                    <input value={text} onChange={(e) => setText(e.target.value)} placeholder="o escríbela" inputMode="decimal" />
                  )}
                </label>
              </div>
            ) : (
              <label className="admin-field imp-field-lg">
                <span>{indicator.unitLabel || "Cifra"}</span>
                <input value={text} onChange={(e) => setText(e.target.value)} inputMode={indicator.measure === "texto" ? "text" : "decimal"} />
              </label>
            )}
          </fieldset>

          <Series indicator={indicator} mine={mine} udes={udes} adoption={adoption} year={year} />

          <div className="oda-form-grid">
            <label className="admin-field">
              <span>Evidencia (enlace)</span>
              <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://…" disabled={!canEdit} aria-invalid={!evidenceOk || undefined} />
            </label>
            <label className="admin-field">
              <span>Observación</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} />
            </label>
          </div>
          {!evidenceOk && <p className="oda-field-warning">La evidencia tiene que ser un enlace que empiece por http:// o https://.</p>}
          <label className="oda-check imp-check">
            <input type="checkbox" checked={na} onChange={(e) => setNa(e.target.checked)} disabled={!canEdit} />
            <span>En {year} este indicador no aplica a mi programa</span>
          </label>
        </div>

        {canEdit && (
          <footer className="imp-sheet__foot">
            <SaveState pending={pending} error={saveValues.error ?? saveTargets.error} success={(saveValues.isSuccess || saveTargets.isSuccess) && !valueDirty && !targetsDirty} />
            <button type="button" className="button-ghost" onClick={() => void submit(false)} disabled={(!valueDirty && !targetsDirty) || pending || !evidenceOk}>
              Guardar
            </button>
            <button type="button" className="button-primary" onClick={() => void submit(true)} disabled={pending || !evidenceOk}>
              {valueDirty || targetsDirty ? "Guardar y seguir" : "Siguiente"}
            </button>
          </footer>
        )}
      </section>

      <aside className="imp-side" aria-label="La vicerrectoría y lo que falta">
        <section>
          <span className="imp-label">La vicerrectoría</span>
          <dl className="imp-kv">
            <div>
              <dt>Meta 2026</dt>
              <dd>{indicator.target2026 || "—"}</dd>
            </div>
            <div>
              <dt>Meta 2028</dt>
              <dd>{indicator.target2028 || "—"}</dd>
            </div>
            <div>
              <dt>Cifra UDES</dt>
              <dd>{udesLast ? `${displayValue(udesLast, indicator.measure)} · ${udesLast.year}` : "Sin reportar"}</dd>
            </div>
          </dl>
          {indicator.source && <p className="imp-muted imp-small">Fuente: {indicator.source}</p>}
        </section>
        <section>
          <span className="imp-label">Tus metas</span>
          <div className="imp-targets imp-targets--stack">
            {(
              [
                ["baseline", "Línea base 2023"],
                ["t26", "Meta 2026"],
                ["t28", "Meta 2028"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="admin-field">
                <span>{label}</span>
                <input value={targets[k]} onChange={(e) => setTargets((t) => ({ ...t, [k]: e.target.value }))} disabled={!canEdit} />
              </label>
            ))}
          </div>
        </section>
        <section>
          <span className="imp-label">Para quedar completo</span>
          {missing.length === 0 ? (
            <p className="imp-small" data-tone="ok">
              <Icon name="check" size={14} /> Completo: tiene todo a corte {COMPLETE_YEAR}.
            </p>
          ) : (
            <ul className="imp-missing">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </>
  );
}

/** La serie del programa contra la cifra UDES y las metas, en un dibujo sencillo. */
function Series({ indicator, mine, udes, adoption, year }: { indicator: Indicator; mine: Value[]; udes: Value[]; adoption: Adoption; year: number }) {
  const points = YEARS.map((y) => ({ y, v: mine.find((x) => x.year === y && !x.notApplicable)?.valueNum ?? null }));
  const udesPoints = YEARS.map((y) => ({ y, v: udes.find((x) => x.year === y && !x.notApplicable)?.valueNum ?? null }));
  const targets = [
    { label: "Meta VR 2026", v: indicator.target2026Num },
    { label: "Meta VR 2028", v: indicator.target2028Num },
    { label: "Tu meta 2026", v: adoption.target2026Num },
  ].filter((t) => t.v !== null) as { label: string; v: number }[];
  const all = [...points, ...udesPoints].map((p) => p.v).filter((v): v is number => v !== null).concat(targets.map((t) => t.v));
  if (all.length === 0) return <p className="imp-muted imp-small imp-series__empty">La serie aparece cuando haya cifras.</p>;

  const W = 640;
  const H = 128;
  const pad = 12;
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.12;
  max += span * 0.12;
  const x = (y: number) => pad + ((y - YEARS[0]) / (YEARS.length - 1)) * (W - pad * 2);
  const yy = (v: number) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const path = (ps: { y: number; v: number | null }[]) =>
    ps
      .filter((p) => p.v !== null)
      .map((p, k) => `${k ? "L" : "M"}${x(p.y).toFixed(1)},${yy(p.v!).toFixed(1)}`)
      .join(" ");

  return (
    <figure className="imp-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Serie de ${indicator.name}`}>
        {targets.map((t) => (
          <g key={t.label} className="imp-chart__target">
            <line x1={pad} x2={W - pad} y1={yy(t.v)} y2={yy(t.v)} />
            <text x={W - pad} y={yy(t.v) - 4} textAnchor="end">
              {t.label} · {formatFigure(t.v, indicator.measure)}
            </text>
          </g>
        ))}
        <line className="imp-chart__cut" x1={x(year)} x2={x(year)} y1={pad / 2} y2={H - pad / 2} />
        <path className="imp-chart__udes" d={path(udesPoints)} />
        <path className="imp-chart__mine" d={path(points)} />
        {points
          .filter((p) => p.v !== null)
          .map((p) => (
            <circle key={p.y} className="imp-chart__dot" data-current={p.y === year || undefined} cx={x(p.y)} cy={yy(p.v!)} r={p.y === year ? 5.5 : 4} />
          ))}
      </svg>
      <figcaption className="imp-legend">
        <span data-key="mine">Tu programa</span>
        <span data-key="udes">UDES</span>
        <span data-key="target">Metas</span>
      </figcaption>
    </figure>
  );
}

/* --- B4 · frente a la UDES --------------------------------------------------------- */

function Compare({
  indicators,
  base,
  mineOf,
  udesOf,
  adoptionOf,
  onOpen,
}: {
  indicators: Indicator[];
  base: ImpactBase;
  mineOf: (id: string) => Value[];
  udesOf: (id: string) => Value[];
  adoptionOf: (id: string) => Adoption;
  onOpen: (id: string) => void;
}) {
  // Agrupado por dimensión: es donde se lee la cadena del programa.
  const groups = new Map<string, Indicator[]>();
  for (const i of indicators) {
    const name = base.dimensions.find((d) => d.id === i.dimensionId)?.name ?? "Transversal";
    groups.set(name, [...(groups.get(name) ?? []), i]);
  }

  return (
    <section className="imp-compare">
      <div className="imp-legend imp-compare__legend">
        <span data-key="mine">Tu programa (año más reciente)</span>
        <span data-key="past">Años anteriores</span>
        <span data-key="udes">UDES</span>
        <span data-key="target">Meta VR 2026</span>
      </div>
      <div className="imp-compare__head" aria-hidden="true">
        <span>Indicador</span>
        <span>Recorrido</span>
        <span className="imp-num">Tú</span>
        <span className="imp-num">UDES</span>
        <span>Estado</span>
      </div>
      {[...groups].map(([name, rows]) => (
        <div key={name} className="imp-compare__group">
          <h3>{name}</h3>
          {rows.map((i) => {
            const mine = mineOf(i.id);
            const udes = udesOf(i.id);
            const lastMine = latestValue(mine);
            const lastUdes = latestValue(udes);
            const diff = lastMine?.valueNum !== null && lastMine?.valueNum !== undefined && lastUdes?.valueNum !== null && lastUdes?.valueNum !== undefined
              ? lastMine.valueNum - lastUdes.valueNum
              : null;
            return (
              <button key={i.id} type="button" className="imp-compare__row" onClick={() => onOpen(i.id)}>
                <span className="imp-compare__name">
                  <b>
                    <span className="imp-code">{i.code}</span> {i.name}
                  </b>
                  <small>
                    {STAGE_LABEL[i.stage]} · meta VR {i.target2026 || "—"}
                    {i.direction === "baja" ? " · menos es mejor" : ""}
                  </small>
                </span>
                <Track indicator={i} mine={mine} udes={lastUdes} />
                <span className="imp-num imp-compare__fig">
                  {lastMine ? displayValue(lastMine, i.measure) : <span className="imp-muted">Sin reportar</span>}
                  {diff !== null && (
                    <small>
                      {diff > 0 ? "+" : ""}
                      {formatFigure(Math.round(diff * 10) / 10, "numero")} {i.measure === "porcentaje" ? "pp" : ""}
                    </small>
                  )}
                </span>
                <span className="imp-num imp-muted">{lastUdes ? displayValue(lastUdes, i.measure) : "—"}</span>
                <StateMark state={programState(adoptionOf(i.id), mine)} />
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function Track({ indicator, mine, udes }: { indicator: Indicator; mine: Value[]; udes: Value | undefined }) {
  const pts = mine.filter((v) => !v.notApplicable && v.valueNum !== null).sort((a, b) => a.year - b.year);
  const target = indicator.target2026Num;
  const nums = [...pts.map((p) => p.valueNum!), ...(udes?.valueNum != null ? [udes.valueNum] : []), ...(target !== null ? [target] : [])];
  const W = 240;
  if (!nums.length) {
    return (
      <svg className="imp-track" viewBox={`0 0 ${W} 28`} aria-label="Sin cifras">
        <line x1="6" x2={W - 6} y1="14" y2="14" className="imp-track__rail" data-empty />
      </svg>
    );
  }
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const x = (v: number) => 10 + ((v - (min - span * 0.15)) / (span * 1.3)) * (W - 20);
  const last = pts[pts.length - 1];
  const label = [
    pts.length ? `Tu programa: ${pts.map((p) => `${p.year} ${formatFigure(p.valueNum, indicator.measure)}`).join(", ")}` : "Tu programa sin cifras",
    udes?.valueNum != null ? `UDES ${formatFigure(udes.valueNum, indicator.measure)}` : "",
    target !== null ? `meta ${formatFigure(target, indicator.measure)}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return (
    <svg className="imp-track" viewBox={`0 0 ${W} 28`} role="img" aria-label={label}>
      <line x1="6" x2={W - 6} y1="14" y2="14" className="imp-track__rail" />
      {target !== null && <line x1={x(target)} x2={x(target)} y1="3" y2="25" className="imp-track__target" />}
      {udes?.valueNum != null && (
        <rect x={x(udes.valueNum) - 5} y="9" width="10" height="10" transform={`rotate(45 ${x(udes.valueNum)} 14)`} className="imp-track__udes" />
      )}
      {pts.slice(0, -1).map((p) => (
        <circle key={p.year} cx={x(p.valueNum!)} cy="14" r="4" className="imp-track__past" />
      ))}
      {last && <circle cx={x(last.valueNum!)} cy="14" r="6" className="imp-track__now" />}
    </svg>
  );
}

