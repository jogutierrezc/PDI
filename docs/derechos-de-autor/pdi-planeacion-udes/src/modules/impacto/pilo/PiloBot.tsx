/* =============================================================================
   Mr. Pilo Bot · la guía de los programas.

   Tres pasos: qué impactos quiere demostrar el programa (al menos uno por
   función: Enseñanza, Investigación y Extensión), cuánto puede reportar y
   la propuesta, ordenada por función e impacto. La propuesta trae siempre
   la cadena completa —insumos, procesos, productos e impacto real— en cada
   función, y no se adopta si se quita un eslabón: la cadena explica cómo el
   programa llega a sus resultados, y sin uno de ellos se rompe.

   Lo que el programa ya sigue, sus indicadores propios y las obligatorias de
   la vicerrectoría cuentan en la cadena y no se quitan. Nada se guarda
   hasta «Adoptar». Los pesos del motor son los que Planeación ajusta, y lo
   que los reportes P1P2P3 ya traen del programa sube en la lista.
   ========================================================================== */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { FUNCTION_LABEL, STAGE_LABEL, errorText, type ProgramSite, type Stage, type SubstantiveFunction } from "../model";
import {
  useAdoptMany,
  useAdoptions,
  usePeerAdoptions,
  usePiloSettings,
  useSourceFigures,
  useValues,
  type Catalog,
  type ImpactBase,
} from "../store";
import {
  DEFAULT_WEIGHTS,
  FNS,
  GOALS_PER_FN,
  PILO_GOALS,
  PILO_SIZES,
  STAGES,
  chainGaps,
  missingFunctions,
  recommend,
  type PiloIndicator,
  type PiloPick,
} from "./recommend";
import { PiloClose, PiloLauncher, PiloScene, PiloSpeech, type PiloOrigin } from "./PiloLauncher";
import { playPulse } from "./motion";
import { describeGaps, piloMood, piloSpeech, type SpeechContext } from "./speech";
import { PiloAvatar } from "../../../components/pilo/PiloAvatar";
import { PiloChat } from "./chat/PiloChat";

type Step = 1 | 2 | 3 | 4;

export function PiloBot({ site, base, catalog, canEdit }: { site: ProgramSite; base: ImpactBase; catalog: Catalog; canEdit: boolean }) {
  return (
    <PiloLauncher
      sub="Arme sus indicadores"
      peekTitle={`Personalice los indicadores de ${site.programName}`}
      peekText="Tres pasos y Mr. Pilo le propone qué seguir, con la cadena completa y el porqué de cada uno."
    >
      {({ origin, onClose }) => <PiloBotScene site={site} base={base} catalog={catalog} canEdit={canEdit} origin={origin} onClose={onClose} />}
    </PiloLauncher>
  );
}

/**
 * La escena abre en la conversación (chat/PiloChat.tsx); la guía por pasos
 * de siempre sigue a un clic («Guía por pasos») y de ella se vuelve a
 * conversar. Las dos usan el mismo motor (recommend).
 */
function PiloBotScene(props: { site: ProgramSite; base: ImpactBase; catalog: Catalog; canEdit: boolean; origin: PiloOrigin; onClose: () => void }) {
  const [mode, setMode] = useState<"chat" | "guia">("chat");
  return mode === "chat" ? <PiloChat {...props} onClassic={() => setMode("guia")} /> : <PiloGuide {...props} onChat={() => setMode("chat")} />;
}

function PiloGuide({
  site,
  base,
  catalog,
  canEdit,
  origin,
  onClose,
  onChat,
}: {
  site: ProgramSite;
  base: ImpactBase;
  catalog: Catalog;
  canEdit: boolean;
  origin: PiloOrigin;
  onClose: () => void;
  onChat?: () => void;
}) {
  const titleId = useId();
  const [step, setStep] = useState<Step>(1);
  const [goals, setGoals] = useState<string[]>([]);
  const [size, setSize] = useState<number>(18);
  const [preferData, setPreferData] = useState(true);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<PiloPick[]>([]);
  const [added, setAdded] = useState(0);

  const published = useMemo(() => catalog.indicators.filter((i) => i.status === "publicado"), [catalog.indicators]);
  const own = useMemo(
    () => catalog.programIndicators.filter((i) => i.programId === site.programId && i.campusId === site.campusId && i.status !== "retirado"),
    [catalog.programIndicators, site.programId, site.campusId],
  );
  const ids = useMemo(() => published.map((i) => i.id), [published]);
  const adoptions = useAdoptions({ programId: site.programId, campusId: site.campusId });
  const values = useValues(ids, site);
  const peers = usePeerAdoptions(site);
  const settings = usePiloSettings();
  const sources = useSourceFigures(site);
  const adopt = useAdoptMany();

  const adopted = useMemo(
    () => new Set((adoptions.data ?? []).filter((a) => a.active).map((a) => a.indicatorId)),
    [adoptions.data],
  );

  // Los periodos que P1P2P3 trae del programa, por cada ficha que esa fuente alimenta.
  const sourcePeriods = useMemo(() => {
    const periods = [...new Set((sources.data ?? []).filter((f) => f.source === "p1p2p3").map((f) => f.period))].sort();
    const out = new Map<string, string[]>();
    if (!periods.length) return out;
    const codes = new Set((settings.data?.sourceMap.p1p2p3 ?? []).map((c) => c.toUpperCase()));
    for (const i of published) if (codes.has(i.code)) out.set(i.id, periods);
    return out;
  }, [sources.data, settings.data, published]);

  const proposal = useMemo(() => {
    const dimName = new Map(base.dimensions.map((d) => [d.id, d.name]));
    const pillar = new Map(base.pillars.map((p) => [p.id, p]));
    const indicators: PiloIndicator[] = published.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      fn: i.fn,
      stage: i.stage,
      dimensionName: i.dimensionId ? dimName.get(i.dimensionId) ?? null : null,
      cesu: i.cesu,
      programReports: i.programReports,
      mandatory: i.mandatory,
    }));
    const years = new Map<string, number[]>();
    for (const v of values.data ?? []) {
      if (!v.programId || (v.valueNum === null && !v.valueText && !v.notApplicable)) continue;
      years.set(v.indicatorId, [...(years.get(v.indicatorId) ?? []), v.year]);
    }
    const alignments = new Map<string, string[]>();
    for (const a of catalog.alignments) {
      if (!a.confirmed && a.origin === "motor") continue;
      const label = a.target === "pilar" ? `Pilar ${pillar.get(a.pillarId ?? "")?.position ?? ""}`.trim() : `ODS ${a.sdg}`;
      alignments.set(a.indicatorId, [...(alignments.get(a.indicatorId) ?? []), label]);
    }
    return recommend({
      indicators,
      goals,
      size,
      preferData,
      adopted,
      years,
      sourcePeriods,
      alignments,
      weights: settings.data?.weights ?? DEFAULT_WEIGHTS,
      peers: new Map((peers.data ?? []).map((p) => [p.indicatorId, p])),
    });
  }, [published, base.dimensions, base.pillars, catalog.alignments, values.data, peers.data, goals, size, preferData, adopted, sourcePeriods, settings.data]);

  // Los indicadores propios del programa cuentan en la cadena.
  const ownPicks: PiloPick[] = own.map((i) => ({
    indicator: { id: i.id, code: i.code, name: i.name, fn: i.fn, stage: i.stage, dimensionName: null, cesu: [], programReports: true },
    score: 0,
    goalId: null,
    kept: true,
    mandatory: false,
    chain: false,
    reasons: ["Indicador propio del programa"],
  }));

  const picks = [...proposal.picks, ...extra.filter((e) => !proposal.picks.some((p) => p.indicator.id === e.indicator.id))];
  const locked = (p: PiloPick) => p.kept || p.mandatory;
  const chosen = picks.filter((p) => locked(p) || !off.has(p.indicator.id));
  const toAdd = chosen.filter((p) => !p.kept);
  const chosenFns = FNS.filter((fn) => PILO_GOALS.some((g) => g.fn === fn && goals.includes(g.id)));
  const withOwn = [...chosen, ...ownPicks];
  const gaps = chainGaps(withOwn, chosenFns);
  // Con qué llenar un eslabón vacío: primero lo que la persona desmarcó de la
  // propuesta; si no, la mejor ficha que no estaba en ella.
  const fillerFor = (fn: SubstantiveFunction, stage: Stage) =>
    picks
      .filter((p) => off.has(p.indicator.id) && p.indicator.fn === fn && p.indicator.stage === stage)
      .sort((a, b) => b.score - a.score)[0] ?? proposal.fillers.get(`${fn}|${stage}`);
  const fillable = gaps.filter((g) => fillerFor(g.fn, g.stage));
  const unfillable = gaps.filter((g) => !fillerFor(g.fn, g.stage));
  const missing = missingFunctions(goals);

  const reset = () => {
    setOff(new Set());
    setExtra([]);
  };

  // Hasta tres por función: el cuarto reemplaza al más antiguo de esa función.
  const pickGoal = (id: string) => {
    reset();
    setGoals((current) => {
      if (current.includes(id)) return current.filter((g) => g !== id);
      const fn = PILO_GOALS.find((g) => g.id === id)?.fn;
      const same = current.filter((g) => PILO_GOALS.find((x) => x.id === g)?.fn === fn);
      const trimmed = same.length >= GOALS_PER_FN.max ? current.filter((g) => g !== same[0]) : current;
      return [...trimmed, id];
    });
  };

  const fill = (fn: SubstantiveFunction, stage: Stage) => {
    const filler = fillerFor(fn, stage);
    if (!filler) return;
    const next = new Set(off);
    next.delete(filler.indicator.id);
    setOff(next);
    if (!picks.some((p) => p.indicator.id === filler.indicator.id)) setExtra((list) => [...list, filler]);
  };

  const toggle = (p: PiloPick) => {
    if (locked(p)) return;
    const next = new Set(off);
    if (next.has(p.indicator.id)) next.delete(p.indicator.id);
    else next.add(p.indicator.id);
    setOff(next);
  };

  const confirm = async () => {
    try {
      const count = await adopt.mutateAsync({
        indicatorIds: toAdd.map((p) => p.indicator.id),
        programId: site.programId,
        campusId: site.campusId,
      });
      setAdded(count);
      setStep(4);
    } catch {
      // El error se muestra en el pie (adopt.error).
    }
  };

  const loading = adoptions.isPending || values.isPending || settings.isPending;
  const periods = [...new Set([...sourcePeriods.values()].flat())].sort();
  const speechContext: SpeechContext = {
    programName: site.programName,
    campusName: site.campusName,
    goalsCount: goals.length,
    missingFns: missing,
    kept: adopted.size + own.length,
    mandatory: chosen.filter((p) => p.mandatory).length,
    sourcePeriods: periods,
    readyToReport: chosen.filter((p) => sourcePeriods.has(p.indicator.id) || p.reasons.some((r) => r.startsWith("Ya tiene cifras"))).length,
    gaps: step === 3 ? fillable : [],
    impossible: unfillable,
    selected: chosen.length,
    added,
    total: adopted.size + own.length,
    loading,
  };
  const speech = piloSpeech(step, speechContext);
  const mood = piloMood(step, speechContext);

  return (
    <PiloScene origin={origin} onClose={onClose} titleId={titleId} focusKey={step}>
      <aside className="pilo__side">
        <PiloClose onClose={onClose} />
        {onChat && (
          <button type="button" className="pilo__tochat" onClick={onChat}>
            Conversar con Pilo
          </button>
        )}
        <div className="pilo__intro">
          <span className="pilo__avatar">
            <PiloAvatar mood={mood} size={116} alive />
          </span>
          <h1 id={titleId}>Hola, soy Mr. Pilo</h1>
          <PiloSpeech text={speech} />
        </div>
        <ol className="pilo__steps">
          {["Qué impactos mostrar", "Cuánto reportar", "Su propuesta"].map((label, index) => {
            const n = (index + 1) as Step;
            const state = step === n ? "current" : step > n ? "done" : "todo";
            return (
              <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
                <span aria-hidden="true">{state === "done" ? <Icon name="check" size={13} /> : n}</span>
                {label}
              </li>
            );
          })}
        </ol>
        <p className="pilo__site">
          {site.programName} · {site.campusName}
          <br />
          Nada se guarda hasta que usted lo apruebe.
        </p>
      </aside>

      <section className="pilo__panel">
        {step === 1 && (
          <>
            <header className="pilo__head" data-anim>
              <h2 tabIndex={-1} data-autofocus>
                ¿Qué impactos quiere demostrar su programa?
              </h2>
              <p>Elija al menos uno por función y hasta tres en cada una. Cada impacto se traduce en indicadores de las vicerrectorías.</p>
            </header>
            <div className="pilo__goals">
              {FNS.map((fn) => {
                const count = goals.filter((id) => PILO_GOALS.find((g) => g.id === id)?.fn === fn).length;
                return (
                  <section key={fn} className="pilo__fn" data-fn={fn} aria-label={FUNCTION_LABEL[fn]} data-anim>
                    <h3>
                      <i aria-hidden="true" />
                      {FUNCTION_LABEL[fn]}
                      <span data-missing={count === 0 || undefined}>{count === 0 ? "Elija al menos uno" : `${count} de ${GOALS_PER_FN.max}`}</span>
                    </h3>
                    {PILO_GOALS.filter((g) => g.fn === fn).map((g) => {
                      const on = goals.includes(g.id);
                      return (
                        <button key={g.id} type="button" className="pilo-tile" aria-pressed={on} onClick={() => pickGoal(g.id)}>
                          <strong>{g.title}</strong>
                          {on && (
                            <span className="pilo-tile__check" aria-hidden="true">
                              <Icon name="check" size={14} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <header className="pilo__head" data-anim>
              <h2 tabIndex={-1} data-autofocus>
                ¿Cuánto quiere reportar cada año?
              </h2>
              <p>Todas las opciones dejan la cadena completa en cada función: insumos, procesos, productos e impacto real.</p>
            </header>
            <div className="pilo__sizes">
              {PILO_SIZES.map((z) => (
                <button
                  key={z.n}
                  type="button"
                  className="pilo-size"
                  data-anim
                  aria-pressed={size === z.n}
                  onClick={() => {
                    reset();
                    setSize(z.n);
                  }}
                >
                  <span className="pilo-size__name">{z.name}</span>
                  <span className="pilo-size__n">{z.n}</span>
                  <span className="pilo-size__unit">indicadores · {z.perFn}</span>
                  <span className="pilo-size__hint">{z.hint}</span>
                  {"recommended" in z && z.recommended && <span className="pilo-size__rec">Recomendado para empezar</span>}
                </button>
              ))}
            </div>
            <label className="pilo__prefer" data-anim>
              <input type="checkbox" checked={preferData} onChange={(e) => setPreferData(e.target.checked)} />
              <span>
                <strong>Primero lo que ya se puede reportar</strong>
                <span>
                  Mr. Pilo sube lo que {site.programName} ya capturó
                  {periods.length ? ` y lo que los reportes P1P2P3 traen de ${periods.join(", ")}` : ""}.
                </span>
              </span>
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <header className="pilo__head pilo__head--row" data-anim>
              <div>
                <h2 tabIndex={-1} data-autofocus>
                  {loading ? "Armando su propuesta…" : `Le propongo ${chosen.length} indicadores`}
                </h2>
                <p>Quite los que no le sirvan, sin romper la cadena. Cada uno dice por qué está aquí.</p>
              </div>
            </header>

            <div className="pilo-matrix" role="table" aria-label="Cadena de valor por función" data-anim>
              <div role="row" className="pilo-matrix__head">
                <span role="columnheader" />
                {STAGES.map((s) => (
                  <span key={s} role="columnheader">{STAGE_LABEL[s]}</span>
                ))}
              </div>
              {chosenFns.map((fn) => (
                <div key={fn} role="row" data-fn={fn}>
                  <span role="rowheader">
                    <i aria-hidden="true" />
                    {FUNCTION_LABEL[fn]}
                  </span>
                  {STAGES.map((s) => {
                    const n = withOwn.filter((p) => p.indicator.fn === fn && p.indicator.stage === s).length;
                    return <ChainCell key={s} label={STAGE_LABEL[s]} count={n} />;
                  })}
                </div>
              ))}
            </div>

            {fillable.length > 0 && (
              <div className="pilo__gap" role="status">
                <Icon name="alert" size={17} />
                <span>
                  <strong>Falta {describeGaps(fillable)}.</strong> La cadena tiene que quedar completa en cada función para
                  adoptar.
                </span>
                <span className="pilo__gap-actions">
                  {fillable.map((g) => {
                    const f = fillerFor(g.fn, g.stage)!;
                    return (
                      <button key={`${g.fn}|${g.stage}`} type="button" onClick={() => fill(g.fn, g.stage)}>
                        Añadir {f.indicator.code} · {f.indicator.name}
                      </button>
                    );
                  })}
                </span>
              </div>
            )}
            {unfillable.length > 0 && (
              <p className="pilo__note">
                <Icon name="alert" size={15} /> El catálogo aún no tiene fichas publicadas de {describeGaps(unfillable)}. Puede crear un
                indicador propio de ese eslabón en Mi catálogo.
              </p>
            )}

            <div className="pilo__list">
              {picks.length === 0 && !loading ? (
                <p className="pilo__empty">
                  No hay fichas publicadas para esos impactos todavía. Vuelva atrás y elija otros, o pida a la vicerrectoría que
                  publique las suyas.
                </p>
              ) : (
                FNS.map((fn) => {
                  const rows = picks.filter((p) => p.indicator.fn === fn);
                  if (!rows.length) return null;
                  const sections = [
                    { key: "obligatorias", title: "Obligatorias de la vicerrectoría", rows: rows.filter((p) => p.mandatory) },
                    { key: "ya", title: "Ya los sigue", rows: rows.filter((p) => p.kept && !p.mandatory) },
                    ...PILO_GOALS.filter((g) => g.fn === fn).map((g) => ({
                      key: g.id,
                      title: g.title,
                      rows: rows.filter((p) => !p.kept && !p.mandatory && p.goalId === g.id),
                    })),
                    { key: "cadena", title: "Para completar la cadena", rows: rows.filter((p) => !p.kept && !p.mandatory && !p.goalId) },
                  ].filter((x) => x.rows.length);
                  return (
                    <div key={fn} className="pilo__group" data-fn={fn} data-anim>
                      <h3>
                        <i aria-hidden="true" />
                        {FUNCTION_LABEL[fn]} · {rows.filter((p) => locked(p) || !off.has(p.indicator.id)).length}
                      </h3>
                      {sections.map((section) => (
                        <div key={section.key} className="pilo__goal">
                          <h4>{section.title}</h4>
                          {[...section.rows]
                            .sort((x, y) => STAGES.indexOf(x.indicator.stage) - STAGES.indexOf(y.indicator.stage))
                            .map((p) => (
                              <PickRow key={p.indicator.id} pick={p} on={locked(p) || !off.has(p.indicator.id)} locked={locked(p)} onToggle={() => toggle(p)} />
                            ))}
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {step === 4 && (
          <div className="pilo__done">
            <span className="pilo__done-mark" aria-hidden="true">
              <Icon name="check" size={34} />
            </span>
            <h2 tabIndex={-1} data-autofocus>
              Listo: {site.programName} · {site.campusName} sigue {adopted.size + own.length} indicadores
            </h2>
            <p>
              {added
                ? `Se añadieron ${added}, con la cadena completa en cada función. Los encuentra en Mi catálogo; el siguiente paso es poner la línea base y las metas.`
                : "No hacía falta añadir nada: ya seguía todo lo propuesto."}
            </p>
            <div className="pilo__done-actions">
              <button type="button" className="button-primary" onClick={onClose}>
                Ir a Mi catálogo
              </button>
              <button
                type="button"
                className="button-ghost"
                onClick={() => {
                  setStep(1);
                  reset();
                }}
              >
                Empezar de nuevo
              </button>
            </div>
          </div>
        )}

        {step < 4 && (
          <footer className="pilo__foot">
            <span>
              {step === 1
                ? missing.length
                  ? `Falta elegir en ${missing.map((f) => FUNCTION_LABEL[f]).join(" y ")}`
                  : `${goals.length} impactos elegidos en las tres funciones`
                : step === 2
                  ? "Podrá añadir o quitar indicadores después, desde «Elegir indicadores»."
                  : !canEdit
                    ? "Puede ver la propuesta, pero solo quien gestiona el programa la adopta."
                    : fillable.length
                      ? `Complete la cadena para adoptar: falta ${describeGaps(fillable)}.`
                      : `${toAdd.length} nuevos · ${chosen.length - toAdd.length} que ya sigue se conservan`}
            </span>
            {adopt.error && (
              <span className="pilo__error" role="alert">
                <Icon name="alert" size={14} /> {errorText(adopt.error)}
              </span>
            )}
            {step > 1 && (
              <button type="button" className="button-ghost" onClick={() => setStep((step - 1) as Step)}>
                Atrás
              </button>
            )}
            {step < 3 ? (
              <button type="button" className="button-primary" disabled={step === 1 && missing.length > 0} onClick={() => setStep((step + 1) as Step)}>
                Siguiente <Icon name="arrow-right" size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="button-primary"
                disabled={!canEdit || adopt.isPending || loading || chosen.length === 0 || fillable.length > 0}
                onClick={confirm}
              >
                {adopt.isPending ? "Guardando…" : toAdd.length ? `Adoptar ${toAdd.length} indicadores` : "Terminar"}
              </button>
            )}
          </footer>
        )}
      </section>
    </PiloScene>
  );
}

/** Un eslabón de la cadena. Si estaba vacío y se llena, late una vez. */
function ChainCell({ label, count }: { label: string; count: number }) {
  const node = useRef<HTMLSpanElement>(null);
  const previous = useRef(count);
  useEffect(() => {
    if (previous.current === 0 && count > 0 && node.current) playPulse(node.current);
    previous.current = count;
  }, [count]);
  return (
    <span ref={node} role="cell" data-empty={count === 0 || undefined} aria-label={`${label}: ${count}`}>
      {count === 0 ? <Icon name="alert" size={13} /> : count}
    </span>
  );
}

function PickRow({ pick, on, locked, onToggle }: { pick: PiloPick; on: boolean; locked: boolean; onToggle: () => void }) {
  const { indicator } = pick;
  return (
    <label className="pilo-pick" data-off={!on || undefined} data-kept={locked || undefined}>
      <input type="checkbox" checked={on} disabled={locked} onChange={onToggle} />
      <span className="pilo-pick__code">{indicator.code}</span>
      <span className="pilo-pick__body">
        <strong>{indicator.name}</strong>
        <span>{pick.reasons.filter((r) => !r.startsWith("Responde a")).slice(0, 2).join(" · ") || "Responde a este impacto"}</span>
      </span>
      <span className="pilo-pick__stage">{STAGE_LABEL[indicator.stage]}</span>
    </label>
  );
}
