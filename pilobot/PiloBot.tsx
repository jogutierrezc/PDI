// ─── PiloBot.tsx (extendido para dos actores) ────────────────────────────────
// Cambios respecto a la versión original:
//   • Recibe `actor: PiloActor` en lugar de `site: ProgramSite`
//   • PiloGuide usa el motor extendido y muestra alertas institucionales
//   • Voz de Mr. Pilo es parametrizada (piloSpeech)
//   • Mandatorios siempre fijos, no desactivables
//   • Panel de necesidades institucionales en Paso 3 (solo vice)

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/ui/Icon";
import { STAGE_LABEL, FUNCTION_LABEL, type Stage, type SubstantiveFunction } from "../model";
import {
  useAdoptMany, useAdoptions, usePeerAdoptions, useValues,
  useAdaptations, useInstitutionalNeeds, useMandatoryIndicators,
  type Catalog, type ImpactBase,
} from "../store";
import {
  PILO_GOALS, PILO_SIZES, STAGES,
  recommend, piloSpeech,
  type PiloIndicator, type PiloPick,
} from "./recommend";
import type { PiloActor } from "./model";
import "./pilo.css";

const INTENT_MS = 400;
const AVATAR    = "/pilo-96.webp";
const AVATAR_2X = "/pilo-192.webp";
const AVATAR_LG = "/pilo-384.webp";

type Step = 1 | 2 | 3 | 4;

// ─── Botón ────────────────────────────────────────────────────────────────────

export function PiloBot({
  actor,
  base,
  catalog,
  canEdit,
}: {
  actor: PiloActor;
  base: ImpactBase;
  catalog: Catalog;
  canEdit: boolean;
}) {
  const [open, setOpen]     = useState(false);
  const [intent, setIntent] = useState(false);
  const [origin, setOrigin] = useState({ x: "90%", y: "40px" });
  const button = useRef<HTMLButtonElement>(null);
  const timer  = useRef<number | null>(null);

  const clearIntent = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setIntent(false);
  };

  const show = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setIntent(false);
    const rect = button.current?.getBoundingClientRect();
    if (rect) setOrigin({ x: `${rect.left + rect.width / 2}px`, y: `${rect.top + rect.height / 2}px` });
    setOpen(true);
  }, []);

  const onEnter = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse" || open) return;
    setIntent(true);
    timer.current = window.setTimeout(show, INTENT_MS);
  };

  useEffect(() => () => clearIntent(), []);

  const close = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => button.current?.focus());
  }, []);

  const subtitle = actor.kind === "vicerectoria"
    ? "Gestione sus indicadores"
    : "Arme sus indicadores";

  const peekTitle = actor.kind === "vicerectoria"
    ? `Configure los indicadores de ${actor.name}`
    : `Personalice los indicadores de ${actor.name}`;

  const peekBody = actor.kind === "vicerectoria"
    ? "Defina qué publican y midan sus programas — con datos reales de cobertura y brechas CNA."
    : "Tres preguntas y Mr. Pilo le propone qué seguir, con el porqué de cada uno.";

  return (
    <>
      <span className="pilo-anchor">
        <button
          ref={button}
          type="button"
          className="pilo-btn"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-intent={intent || undefined}
          data-actor={actor.kind}
          onPointerEnter={onEnter}
          onPointerLeave={clearIntent}
          onClick={show}
        >
          <span className="pilo-btn__face">
            <img src={AVATAR} srcSet={`${AVATAR} 1x, ${AVATAR_2X} 2x`} alt="" width={40} height={40} />
          </span>
          <span className="pilo-btn__text">
            <strong>Mr. Pilo Bot</strong>
            <small>{subtitle}</small>
          </span>
        </button>
        {intent && (
          <span className="pilo-peek" role="tooltip">
            <strong>{peekTitle}</strong>
            <span>{peekBody}</span>
            <i aria-hidden="true" />
          </span>
        )}
      </span>
      {open && createPortal(
        <PiloGuide actor={actor} base={base} catalog={catalog} canEdit={canEdit} origin={origin} onClose={close} />,
        document.body,
      )}
    </>
  );
}

// ─── Guía ─────────────────────────────────────────────────────────────────────

function PiloGuide({
  actor, base, catalog, canEdit, origin, onClose,
}: {
  actor: PiloActor;
  base: ImpactBase;
  catalog: Catalog;
  canEdit: boolean;
  origin: { x: string; y: string };
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog  = useRef<HTMLDivElement>(null);
  const [step, setStep]           = useState<Step>(1);
  const [goals, setGoals]         = useState<string[]>([]);
  const [size, setSize]           = useState<number>(
    actor.kind === "vicerectoria" ? 20 : 10,
  );
  const [preferData, setPreferData] = useState(true);
  const [off, setOff]               = useState<Set<string>>(new Set());
  const [extra, setExtra]           = useState<string[]>([]);
  const [added, setAdded]           = useState(0);

  // ── Datos ────────────────────────────────────────────────────────────────
  const published = useMemo(
    () => catalog.indicators.filter((i) => i.status === "publicado"),
    [catalog.indicators],
  );
  const ids = useMemo(() => published.map((i) => i.id), [published]);

  // Hooks existentes
  const adoptions  = useAdoptions({ programId: actor.id, campusId: actor.campusId ?? "" });
  const values     = useValues(ids, actor);
  const peers      = usePeerAdoptions(actor);
  const adopt      = useAdoptMany();

  // Hooks nuevos
  const adaptationsList = useAdaptations(actor.kind === "vicerectoria" ? actor.id : undefined);
  const needsList       = useInstitutionalNeeds(actor.id);
  const mandatoryList   = useMandatoryIndicators(actor);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [step]);

  // ── Trap de foco ─────────────────────────────────────────────────────────
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), a[href]",
    )];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  // ── Derivados ─────────────────────────────────────────────────────────────
  const adopted    = useMemo(() => new Set((adoptions.data ?? []).filter((a) => a.active).map((a) => a.indicatorId)), [adoptions.data]);
  const mandatory  = useMemo(() => new Set((mandatoryList.data ?? []).map((m) => m.indicatorId)), [mandatoryList.data]);
  const adaptMap   = useMemo(() => new Map((adaptationsList.data ?? []).map((a) => [a.indicatorId, a])), [adaptationsList.data]);
  const needsArr   = useMemo(() => needsList.data ?? [], [needsList.data]);

  const proposal = useMemo(() => {
    const dimName  = new Map(base.dimensions.map((d) => [d.id, d.name]));
    const pillar   = new Map(base.pillars.map((p) => [p.id, p]));
    const indicators: PiloIndicator[] = published.map((i) => ({
      id: i.id, code: i.code, name: i.name, fn: i.fn, stage: i.stage,
      dimensionName: i.dimensionId ? dimName.get(i.dimensionId) ?? null : null,
      cesu: i.cesu, programReports: i.programReports,
      origin: i.origin, mandatory: mandatory.has(i.id),
    }));

    const years = new Map<string, number[]>();
    for (const v of values.data ?? []) {
      if (!v.programId || (v.valueNum === null && !v.valueText && !v.notApplicable)) continue;
      years.set(v.indicatorId, [...(years.get(v.indicatorId) ?? []), v.year]);
    }

    const alignments = new Map<string, string[]>();
    for (const a of catalog.alignments) {
      if (!a.confirmed && a.origin === "motor") continue;
      const label = a.target === "pilar"
        ? `Pilar ${pillar.get(a.pillarId ?? "")?.position ?? ""}`.trim()
        : `ODS ${a.sdg}`;
      alignments.set(a.indicatorId, [...(alignments.get(a.indicatorId) ?? []), label]);
    }

    return recommend({
      actorKind: actor.kind,
      actorId:   actor.id,
      indicators,
      goals, size, preferData,
      adopted, mandatory,
      years, alignments,
      peers: new Map((peers.data ?? []).map((p) => [p.indicatorId, p])),
      adaptations: adaptMap,
      needs: needsArr,
    });
  }, [published, base, catalog.alignments, values.data, peers.data,
      goals, size, preferData, adopted, mandatory, adaptMap, needsArr, actor]);

  const extraPicks = proposal.gap && extra.includes(proposal.gap.pick.indicator.id)
    ? [proposal.gap.pick] : [];
  const picks   = [...proposal.picks, ...extraPicks];
  const chosen  = picks.filter((p) => !off.has(p.indicator.id) || p.mandatory);
  const toAdd   = chosen.filter((p) => !p.kept);
  const chain   = Object.fromEntries(STAGES.map((s) => [s, chosen.filter((p) => p.indicator.stage === s).length])) as Record<Stage, number>;
  const gapOpen = proposal.gap && !extra.includes(proposal.gap.pick.indicator.id) && chain[proposal.gap.stage] === 0;

  const pickGoal = (id: string) => {
    setOff(new Set()); setExtra([]);
    setGoals((cur) =>
      cur.includes(id) ? cur.filter((g) => g !== id)
      : cur.length >= 3 ? [...cur.slice(1), id]
      : [...cur, id],
    );
  };

  const confirm = async () => {
    const count = await adopt.mutateAsync({
      indicatorIds: toAdd.map((p) => p.indicator.id),
      actorId: actor.id,
      actorKind: actor.kind,
      campusId: actor.campusId,
    });
    setAdded(count);
    setStep(4);
  };

  // ── Voz parametrizada de Mr. Pilo ────────────────────────────────────────
  const speech = piloSpeech(step, actor.kind, actor.name, {
    goalsCount: goals.length,
    gapOpen: !!gapOpen,
    alerts: proposal.institutionalAlerts.length,
    added,
    total: adopted.size + added,
  });

  const loading = adoptions.isPending || values.isPending || needsList.isPending;
  const goalsForActor = PILO_GOALS.filter((g) => g.forActor.includes(actor.kind));
  const sizesForActor = PILO_SIZES.filter((z) => z.forActor.includes(actor.kind));

  const style = { "--pilo-x": origin.x, "--pilo-y": origin.y } as CSSProperties;

  return (
    <div ref={dialog} className="pilo" style={style} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} data-actor={actor.kind}>
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="pilo__side">
        <button type="button" className="pilo__close" onClick={onClose}>
          <Icon name="close" size={16} /> Cerrar
        </button>
        <div className="pilo__intro">
          <img className="pilo__avatar" src={AVATAR_LG} alt="" width={132} height={132} />
          <h1 id={titleId}>Hola, soy Mr. Pilo</h1>
          <p aria-live="polite">{speech}</p>
        </div>

        {/* Alertas institucionales — solo visible en paso 3 para vice */}
        {step === 3 && proposal.institutionalAlerts.length > 0 && (
          <div className="pilo__inst-alerts">
            <p className="pilo__inst-alerts-title">
              <Icon name="alert" size={14} /> Brechas de reporte detectadas
            </p>
            {proposal.institutionalAlerts.map((n) => (
              <div key={n.indicatorId} className="pilo__inst-alert" data-severity={n.severity}>
                <span>{n.reason}</span>
                {n.cnaLinked && <span className="pilo__inst-alert-cna">CNA</span>}
              </div>
            ))}
          </div>
        )}

        <ol className="pilo__steps">
          {["Qué quiere mostrar", "Cuánto reportar", "Su propuesta"].map((label, i) => {
            const n = (i + 1) as Step;
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
          {actor.name}{actor.campusId ? ` · ${actor.campusId}` : ""}
          <br />
          Nada se guarda hasta que usted lo apruebe.
        </p>
      </aside>

      {/* ── Panel de trabajo ────────────────────────────────────────────── */}
      <section className="pilo__panel">
        {/* Paso 1 */}
        {step === 1 && (
          <>
            <header className="pilo__head">
              <h2 tabIndex={-1} data-autofocus>
                {actor.kind === "vicerectoria"
                  ? "¿Qué quiere demostrar su vicerrectoría?"
                  : "¿Qué quiere demostrar su programa?"}
              </h2>
              <p>
                {actor.kind === "vicerectoria"
                  ? "Elija hasta tres. Se traducen en qué indicadores publicará para sus programas."
                  : "Elija hasta tres. Cada una se traduce en indicadores de las vicerrectorías."}
              </p>
            </header>
            <div className="pilo__goals">
              {goalsForActor.map((g) => {
                const on = goals.includes(g.id);
                return (
                  <button key={g.id} type="button" className="pilo-tile" aria-pressed={on} onClick={() => pickGoal(g.id)} data-fn={g.fn}>
                    <span className="pilo-fn">
                      <i aria-hidden="true" />
                      {FUNCTION_LABEL[g.fn]}
                    </span>
                    <strong>{g.title}</strong>
                    <small>{g.cesu ? "Condiciones de calidad (CESU)" : g.dimensions.join(" · ")}</small>
                    {on && <span className="pilo-tile__check" aria-hidden="true"><Icon name="check" size={14} /></span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Paso 2 */}
        {step === 2 && (
          <>
            <header className="pilo__head">
              <h2 tabIndex={-1} data-autofocus>¿Cuánto quiere reportar cada año?</h2>
              <p>Menos indicadores bien reportados valen más que muchos a medias.</p>
            </header>
            <div className="pilo__sizes">
              {sizesForActor.map((z) => (
                <button key={z.n} type="button" className="pilo-size" aria-pressed={size === z.n} onClick={() => setSize(z.n)}>
                  <span className="pilo-size__name">{z.name}</span>
                  <span className="pilo-size__n">{z.n}</span>
                  <span className="pilo-size__unit">indicadores</span>
                  <span className="pilo-size__hint">{z.hint}</span>
                  {"recommended" in z && z.recommended && <span className="pilo-size__rec">Recomendado para empezar</span>}
                </button>
              ))}
            </div>
            <label className="pilo__prefer">
              <input type="checkbox" checked={preferData} onChange={(e) => setPreferData(e.target.checked)} />
              <span>
                <strong>
                  {actor.kind === "vicerectoria"
                    ? "Primero los que más programas ya reportan"
                    : "Primero los que ya tienen cifras"}
                </strong>
                <span>
                  {actor.kind === "vicerectoria"
                    ? `Mr. Pilo prioriza indicadores con mayor cobertura de reporte en ${actor.name}.`
                    : `Mr. Pilo prioriza lo que ${actor.name} ya capturó, incluso en la herramienta anterior.`}
                </span>
              </span>
            </label>
          </>
        )}

        {/* Paso 3 */}
        {step === 3 && (
          <>
            <header className="pilo__head pilo__head--row">
              <div>
                <h2 tabIndex={-1} data-autofocus>
                  {loading ? "Armando su propuesta…" : `Le propongo ${chosen.length} indicadores`}
                </h2>
                <p>
                  {actor.kind === "vicerectoria"
                    ? "Los mandatorios no pueden desactivarse. Ajuste los sugeridos según su criterio."
                    : "Quite los que no le sirvan. Cada uno dice por qué está aquí."}
                </p>
              </div>
              <ol className="pilo-chain" aria-label="Cadena de valor">
                {STAGES.map((s) => (
                  <li key={s} data-empty={chain[s] === 0 || undefined}>
                    <span>{STAGE_LABEL[s]}</span>
                    <strong>{chain[s]}</strong>
                  </li>
                ))}
              </ol>
            </header>

            {/* Gap alert */}
            {gapOpen && proposal.gap && (
              <div className="pilo__gap" role="status">
                <Icon name="alert" size={17} />
                <span>
                  <strong>A su cadena le falta un eslabón de {STAGE_LABEL[proposal.gap.stage].toLowerCase()}.</strong>{" "}
                  Sin él no se ve cómo llega a los resultados.
                </span>
                <button type="button" onClick={() => setExtra([...extra, proposal.gap!.pick.indicator.id])}>
                  Añadir {proposal.gap.pick.indicator.code} · {proposal.gap.pick.indicator.name}
                </button>
              </div>
            )}

            {/* Lista de picks */}
            <div className="pilo__list">
              {picks.length === 0 && !loading ? (
                <p className="pilo__empty">
                  No hay fichas publicadas para esas metas todavía.
                  {actor.kind === "vicerectoria"
                    ? " Puede crearlas desde «Nuevo indicador» y volver aquí."
                    : " Vuelva atrás y elija otra, o pida a la vicerrectoría que publique las suyas."}
                </p>
              ) : (
                (["ensenanza", "investigacion", "extension"] as SubstantiveFunction[]).map((fn) => {
                  const rows = picks.filter((p) => p.indicator.fn === fn);
                  if (!rows.length) return null;
                  return (
                    <div key={fn} className="pilo__group" data-fn={fn}>
                      <h3><i aria-hidden="true" />{FUNCTION_LABEL[fn]} · {rows.length}</h3>
                      {rows.map((p) => (
                        <PickRow key={p.indicator.id} pick={p}
                          on={!off.has(p.indicator.id) || p.mandatory}
                          onToggle={() => {
                            if (p.mandatory) return;
                            const next = new Set(off);
                            if (next.has(p.indicator.id)) next.delete(p.indicator.id);
                            else next.add(p.indicator.id);
                            setOff(next);
                          }}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Paso 4 */}
        {step === 4 && (
          <div className="pilo__done">
            <span className="pilo__done-mark" aria-hidden="true"><Icon name="check" size={34} /></span>
            <h2 tabIndex={-1} data-autofocus>
              {actor.kind === "vicerectoria"
                ? `Listo: ${actor.name} publica ${adopted.size} indicadores`
                : `Listo: ${actor.name} sigue ${adopted.size} indicadores`}
            </h2>
            <p>
              {added
                ? actor.kind === "vicerectoria"
                  ? `Se publicaron ${added} indicadores nuevos. Sus programas ya pueden verlos y adoptarlos.`
                  : `Se añadieron ${added}. Los encuentra en Mi programa; el siguiente paso es poner la línea base y las metas de cada uno.`
                : "No hacía falta añadir nada: ya estaba todo lo propuesto."}
            </p>
            <div className="pilo__done-actions">
              <button type="button" className="button-primary" onClick={onClose}>
                {actor.kind === "vicerectoria" ? "Ir al panel de vicerrectoría" : "Ir a Mi programa"}
              </button>
              <button type="button" className="button-ghost" onClick={() => { setStep(1); setOff(new Set()); setExtra([]); }}>
                Empezar de nuevo
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {step < 4 && (
          <footer className="pilo__foot">
            <span>
              {step === 1
                ? `${goals.length} de 3 metas elegidas`
                : step === 2
                  ? "Podrá añadir o quitar indicadores después."
                  : !canEdit
                    ? "Puede ver la propuesta, pero no tiene permisos para adoptarla."
                    : `${toAdd.length} nuevos · ${chosen.length - toAdd.length} ya seguidos se conservan`}
            </span>
            {adopt.error && (
              <span className="pilo__error" role="alert">
                <Icon name="alert" size={14} /> {adopt.error.message}
              </span>
            )}
            {step > 1 && (
              <button type="button" className="button-ghost" onClick={() => setStep((step - 1) as Step)}>
                Atrás
              </button>
            )}
            {step < 3 ? (
              <button type="button" className="button-primary"
                disabled={step === 1 && goals.length === 0}
                onClick={() => setStep((step + 1) as Step)}>
                Siguiente <Icon name="arrow-right" size={15} />
              </button>
            ) : (
              <button type="button" className="button-primary"
                disabled={!canEdit || adopt.isPending || loading || chosen.length === 0}
                onClick={confirm}>
                {adopt.isPending
                  ? "Guardando…"
                  : toAdd.length
                    ? actor.kind === "vicerectoria"
                      ? `Publicar ${toAdd.length} indicadores`
                      : `Adoptar ${toAdd.length} indicadores`
                    : "Terminar"}
              </button>
            )}
          </footer>
        )}
      </section>
    </div>
  );
}

// ─── PickRow (extendido con badge mandatory y needSeverity) ───────────────────

function PickRow({ pick, on, onToggle }: { pick: PiloPick; on: boolean; onToggle: () => void }) {
  const { indicator } = pick;
  return (
    <label
      className="pilo-pick"
      data-off={!on || undefined}
      data-kept={pick.kept || undefined}
      data-mandatory={pick.mandatory || undefined}
      data-need={pick.needSeverity || undefined}
    >
      <input
        type="checkbox"
        checked={on || pick.kept}
        disabled={pick.kept || pick.mandatory}
        onChange={onToggle}
        aria-label={`${indicator.name}${pick.mandatory ? " — obligatorio" : ""}`}
      />
      <span className="pilo-pick__code">{indicator.code}</span>
      <span className="pilo-pick__body">
        <strong>{indicator.name}</strong>
        <span>{pick.reasons.slice(0, 2).join(" · ") || "Responde a sus metas"}</span>
      </span>
      <span className="pilo-pick__badges">
        {pick.mandatory && <span className="pilo-pick__badge pilo-pick__badge--mandatory">Obligatorio</span>}
        {pick.needSeverity === "critica" && <span className="pilo-pick__badge pilo-pick__badge--critica">Brecha crítica</span>}
        {pick.needSeverity === "importante" && <span className="pilo-pick__badge pilo-pick__badge--importante">Importante</span>}
        {indicator.origin === "programa" && <span className="pilo-pick__badge pilo-pick__badge--own">Propio</span>}
        <span className="pilo-pick__stage">{STAGE_LABEL[indicator.stage]}</span>
      </span>
    </label>
  );
}
