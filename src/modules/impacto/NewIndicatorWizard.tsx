/* =============================================================================
   Impacto · Nuevo indicador, a pantalla completa (vicerrectorías y oficinas).

   Crear una ficha es la tarea más delicada del catálogo: de ella dependen lo
   que los programas eligen y reportan. Por eso no va en el panel lateral sino
   en una ventana que ocupa toda la pantalla y pide lo necesario en cinco
   pasos, uno a la vez:

     1. Qué mide        nombre, descripción, dimensión y eslabón
     2. Cómo se mide    forma de medir, numerador y denominador, unidad, fuente
     3. Línea base y metas
     4. Pilares y ODS   el motor sugiere; la persona elige
     5. Revisar         lo que falta, y guardar como borrador o publicar

   A la derecha, siempre, «Así la verán los programas». Nada se guarda hasta
   el paso final (o «Guardar borrador», disponible desde que hay nombre).
   La ficha y sus cruces se guardan juntos.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { Icon } from "../../components/ui/Icon";
import { sdgById } from "../../data/pdi";
import { PiloAvatar, type PiloMood } from "../../components/pilo/PiloAvatar";
import type { ImpactAccess } from "./access";
import { suggest } from "./motor";
import {
  FUNCTION_LABEL,
  MEASURE_LABEL,
  STAGES,
  STAGE_LABEL,
  errorText,
  missingInSheet,
  parseFigure,
  parseTarget,
  type Indicator,
  type Measure,
  type Stage,
} from "./model";
import { toMotorCriteria, toPayload, useAddAlignments, useCriteria, useSaveIndicator, type Catalog, type ImpactBase } from "./store";
import { EASE_OUT, reducedMotion } from "./pilo/motion";
import "./new-indicator.css";

type Step = 1 | 2 | 3 | 4 | 5;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Qué mide" },
  { n: 2, label: "Cómo se mide" },
  { n: 3, label: "Línea base y metas" },
  { n: 4, label: "Pilares y ODS" },
  { n: 5, label: "Revisar y publicar" },
];

const HINT: Record<Step, { mood: PiloMood; text: string }> = {
  1: { mood: "feliz", text: "Un buen nombre dice qué se cuenta y de quién: «Estudiantes vinculados a semilleros», no «Semilleros»." },
  2: { mood: "idea", text: "Si se mide en porcentaje, escriba el numerador y el denominador: la cifra se calcula sola en la captura." },
  3: { mood: "piensa", text: "La línea base es 2023. Si la meta depende de otra cifra («+2 pp»), escríbala así: se guarda como texto." },
  4: { mood: "idea", text: "Le sugiero pilares y ODS por las palabras de la ficha. Elija los que de verdad correspondan." },
  5: { mood: "bien", text: "Publicada, los programas la pueden elegir. En borrador solo la ve su vicerrectoría." },
};

export function NewIndicatorWizard({
  draft,
  base,
  catalog,
  access,
  origin,
  onClose,
  onCreated,
}: {
  draft: Indicator;
  base: ImpactBase;
  catalog: Catalog;
  access: ImpactAccess;
  /** Dónde está el botón que la abrió: la ventana crece desde ahí. */
  origin: { x: string; y: string };
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<Indicator>(draft);
  const [picked, setPicked] = useState<string[]>([]);
  const save = useSaveIndicator();
  const addAlignments = useAddAlignments();
  const criteria = useCriteria();
  const scene = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const owners = access.ownersFor(form.fn);
  const dimensions = base.dimensions.filter((d) => d.fn === form.fn);
  const set = <K extends keyof Indicator>(key: K, value: Indicator[K]) => setForm((f) => ({ ...f, [key]: value }));
  const duplicate = catalog.indicators.some((i) => i.code === form.code.trim().toUpperCase());

  // Lo que sugiere el motor con lo escrito hasta ahora.
  const suggestions = useMemo(
    () =>
      suggest(
        {
          name: form.name,
          description: form.description,
          dimension: dimensions.find((d) => d.id === form.dimensionId)?.name ?? null,
          functionLabel: FUNCTION_LABEL[form.fn],
        },
        toMotorCriteria(criteria.data ?? []),
      ),
    [form.name, form.description, form.dimensionId, form.fn, dimensions, criteria.data],
  );
  const suggested = new Set(suggestions.map((s) => `${s.target}:${s.key}`));
  const options = [
    ...base.pillars.map((p) => ({ key: `pilar:${p.id}`, label: `Pilar ${p.numeral}`, hint: p.name })),
    ...Array.from({ length: 17 }, (_, k) => ({ key: `ods:${k + 1}`, label: `ODS ${k + 1}`, hint: sdgById.get(k + 1)?.label ?? "" })),
  ];

  const missing = missingInSheet(form);
  const canNext: Record<Step, boolean> = {
    1: form.name.trim().length > 3 && !duplicate && /^[A-Z]{1,4}[0-9]{1,3}$/.test(form.code.trim().toUpperCase()),
    2: Boolean(form.measure),
    3: true,
    4: true,
    5: true,
  };

  // La entrada: crece desde el botón.
  useLayoutEffect(() => {
    const node = scene.current;
    if (!node) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const ctx = gsap.context(() => {
      if (reducedMotion()) {
        gsap.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.15 });
        return;
      }
      gsap.fromTo(
        node,
        { clipPath: `circle(0px at ${origin.x} ${origin.y})` },
        { clipPath: `circle(150vmax at ${origin.x} ${origin.y})`, duration: 0.5, ease: EASE_OUT },
      );
    }, node);
    node.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      ctx.revert();
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada paso entra desde el lado hacia el que se avanza.
  const lastStep = useRef<Step>(1);
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node || lastStep.current === step) return;
    const direction = step > lastStep.current ? 1 : -1;
    lastStep.current = step;
    node.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    if (reducedMotion()) return;
    gsap.fromTo(
      node.querySelectorAll("[data-anim]"),
      { opacity: 0, x: 12 * direction, filter: "blur(2px)" },
      { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.2, stagger: 0.03, ease: EASE_OUT, clearProps: "transform,filter" },
    );
  }, [step]);

  const close = () => {
    const node = scene.current;
    if (!node || reducedMotion()) return onClose();
    gsap.to(node, { clipPath: `circle(0px at ${origin.x} ${origin.y})`, duration: 0.26, ease: "power3.inOut", onComplete: onClose });
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };

  const persist = async (publish: boolean) => {
    const payload = toPayload({
      ...form,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      status: publish ? "publicado" : "borrador",
      baselineNum: parseFigure(form.baselineText),
      target2026Num: parseTarget(form.target2026),
      target2028Num: parseTarget(form.target2028),
    });
    delete payload.id;
    try {
      const row = (await save.mutateAsync(payload)) as { id: string };
      if (picked.length) {
        await addAlignments.mutateAsync(
          picked.map((key) => {
            const [target, id] = key.split(":");
            return target === "pilar" ? { indicatorId: row.id, target: "pilar" as const, pillarId: id } : { indicatorId: row.id, target: "ods" as const, sdg: Number(id) };
          }),
        );
      }
      onCreated(row.id);
    } catch {
      // El error se muestra en el pie.
    }
  };

  const field = (label: string, node: ReactNode, hint?: string) => (
    <label className="nw-field" data-anim>
      <span>{label}</span>
      {node}
      {hint && <small>{hint}</small>}
    </label>
  );

  const style = { "--nw-x": origin.x, "--nw-y": origin.y } as CSSProperties;
  const busy = save.isPending || addAlignments.isPending;
  const error = save.error ?? addAlignments.error;

  return createPortal(
    <div ref={scene} className="nw" role="dialog" aria-modal="true" aria-labelledby="nw-title" style={style} onKeyDown={onKeyDown}>
      <header className="nw__top">
        <button type="button" className="nw__close" aria-label="Cerrar sin guardar" onClick={close}>
          <Icon name="close" size={16} />
        </button>
        <div className="nw__title">
          <span>
            {owners.find((o) => o.id === form.ownerUnitId)?.name ?? FUNCTION_LABEL[form.fn]} · código {form.code || "—"}
          </span>
          <strong id="nw-title">Nuevo indicador</strong>
        </div>
        <button type="button" className="button-secondary" disabled={!canNext[1] || busy} onClick={() => void persist(false)}>
          Guardar borrador
        </button>
      </header>

      <div className="nw__body">
        <nav className="nw__steps" aria-label="Pasos">
          <ol>
            {STEPS.map((s) => {
              const state = s.n === step ? "current" : s.n < step ? "done" : "todo";
              const reachable = s.n <= step || STEPS.slice(0, s.n - 1).every((x) => canNext[x.n]);
              return (
                <li key={s.n}>
                  <button type="button" data-state={state} aria-current={state === "current" ? "step" : undefined} disabled={!reachable} onClick={() => setStep(s.n)}>
                    <i aria-hidden="true">{state === "done" ? <Icon name="check" size={13} /> : s.n}</i>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="nw__pilo">
            <PiloAvatar mood={HINT[step].mood} size={48} />
            <p>{HINT[step].text}</p>
          </div>
        </nav>

        <section ref={panel} className="nw__panel">
          {step === 1 && (
            <>
              <header data-anim>
                <h2 tabIndex={-1} data-autofocus>¿Qué mide?</h2>
                <p>El nombre y la descripción son lo primero que leen los programas al elegir.</p>
              </header>
              {field(
                "Nombre del indicador",
                <textarea rows={2} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej. Estudiantes con desempeño alto en Saber PRO" />,
              )}
              {field("Qué mide y para qué", <textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />)}
              <div className="nw__row" data-anim>
                {field(
                  "Dimensión",
                  <select value={form.dimensionId ?? ""} onChange={(e) => set("dimensionId", e.target.value || null)}>
                    <option value="">Sin dimensión</option>
                    {dimensions.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>,
                )}
                {field(
                  "Código",
                  <input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} aria-invalid={duplicate || undefined} />,
                  duplicate ? "Ese código ya existe." : "Se propone el siguiente libre.",
                )}
                {owners.length > 1 &&
                  field(
                    "A nombre de",
                    <select value={form.ownerUnitId} onChange={(e) => set("ownerUnitId", e.target.value)}>
                      {owners.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>,
                  )}
              </div>
              <div className="nw-field" data-anim>
                <span>Eslabón de la cadena de valor</span>
                <div className="nw-seg" role="group" aria-label="Eslabón">
                  {STAGES.map((s: Stage) => (
                    <button key={s} type="button" aria-pressed={form.stage === s} onClick={() => set("stage", s)}>
                      {STAGE_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <header data-anim>
                <h2 tabIndex={-1} data-autofocus>¿Cómo se mide?</h2>
                <p>Una ficha clara hace que todos los programas reporten lo mismo.</p>
              </header>
              <div className="nw-field" data-anim>
                <span>Forma de medir</span>
                <div className="nw-seg" role="group" aria-label="Forma de medir">
                  {(Object.keys(MEASURE_LABEL) as Measure[]).map((m) => (
                    <button key={m} type="button" aria-pressed={form.measure === m} onClick={() => set("measure", m)}>
                      {MEASURE_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              {(form.measure === "porcentaje" || form.measure === "proporcion" || form.measure === "dual") && (
                <div className="nw__row" data-anim>
                  {field("Numerador", <input value={form.numerator} onChange={(e) => set("numerator", e.target.value)} placeholder="Lo que se cuenta" />)}
                  {field("Denominador", <input value={form.denominator} onChange={(e) => set("denominator", e.target.value)} placeholder="Sobre qué total" />)}
                </div>
              )}
              <div className="nw__row" data-anim>
                {field("Unidad", <input value={form.unitLabel} onChange={(e) => set("unitLabel", e.target.value)} placeholder="Ej. % estudiantes" />)}
                <div className="nw-field">
                  <span>Mejor si</span>
                  <div className="nw-seg" role="group" aria-label="Dirección">
                    <button type="button" aria-pressed={form.direction === "sube"} onClick={() => set("direction", "sube")}>Sube</button>
                    <button type="button" aria-pressed={form.direction === "baja"} onClick={() => set("direction", "baja")}>Baja</button>
                  </div>
                </div>
              </div>
              <div className="nw__row" data-anim>
                {field("Fuente de los datos", <input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="Dónde se consulta la cifra" />)}
                {field("Responsable", <input value={form.responsible} onChange={(e) => set("responsible", e.target.value)} placeholder="Quién la reporta" />)}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <header data-anim>
                <h2 tabIndex={-1} data-autofocus>Línea base y metas</h2>
                <p>Las de la UDES. Cada programa pondrá después las suyas.</p>
              </header>
              <div className="nw__row nw__row--3" data-anim>
                {field(`Línea base ${form.baselineYear}`, <input value={form.baselineText} onChange={(e) => set("baselineText", e.target.value)} placeholder="Ej. 72%" />)}
                {field("Meta 2026", <input value={form.target2026} onChange={(e) => set("target2026", e.target.value)} placeholder="Ej. ≥ 80%" />)}
                {field("Meta 2028", <input value={form.target2028} onChange={(e) => set("target2028", e.target.value)} placeholder="Ej. 85%" />)}
              </div>
              <label className="nw-check" data-anim>
                <input type="checkbox" checked={form.programReports} onChange={(e) => set("programReports", e.target.checked)} />
                <span>
                  <strong>Los programas reportan su propia cifra</strong>
                  <small>Desmárquelo si la cifra solo la tiene la vicerrectoría (acreditación CNA, por ejemplo): los programas la consultan.</small>
                </span>
              </label>
              {field(
                "Condiciones de calidad CESU (opcional)",
                <input
                  value={form.cesu.join(", ")}
                  onChange={(e) => set("cesu", e.target.value.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))}
                  placeholder="Ej. C23, C39"
                />,
                "Las que respalda: suben la ficha en las propuestas de Mr. Pilo para acreditación.",
              )}
            </>
          )}

          {step === 4 && (
            <>
              <header data-anim>
                <h2 tabIndex={-1} data-autofocus>Pilares del PDI y ODS</h2>
                <p>
                  {suggestions.length
                    ? `El motor sugiere ${suggestions.length}, marcados con un punto. Elija los que correspondan.`
                    : "El motor no halló coincidencias con lo escrito. Elija a mano."}
                </p>
              </header>
              <div className="nw-align" data-anim>
                {options.map((o) => {
                  const on = picked.includes(o.key);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      aria-pressed={on}
                      data-suggested={suggested.has(o.key) || undefined}
                      title={o.hint}
                      onClick={() => setPicked((list) => (on ? list.filter((k) => k !== o.key) : [...list, o.key]))}
                    >
                      <strong>{o.label}</strong>
                      <span>{o.hint}</span>
                    </button>
                  );
                })}
              </div>
              {suggestions.length > 0 && (
                <button
                  type="button"
                  className="button-ghost nw__take"
                  data-anim
                  onClick={() => setPicked((list) => [...new Set([...list, ...suggestions.map((s) => `${s.target}:${s.key}`)])])}
                >
                  <Icon name="spark" size={14} /> Tomar las sugerencias del motor
                </button>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <header data-anim>
                <h2 tabIndex={-1} data-autofocus>Revisar y publicar</h2>
                <p>Publicada, los programas la ven y la pueden elegir. En borrador, solo su vicerrectoría.</p>
              </header>
              {missing.length > 0 ? (
                <div className="nw-missing" data-anim>
                  <strong>Le falta para quedar completa</strong>
                  <ul>
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <span>Puede publicarla igual y completarla después desde el catálogo.</span>
                </div>
              ) : (
                <p className="nw-ready" data-anim>
                  <Icon name="check" size={16} /> La ficha está completa.
                </p>
              )}
              <dl className="nw-summary" data-anim>
                <dt>Eslabón</dt>
                <dd>{STAGE_LABEL[form.stage]}</dd>
                <dt>Se mide</dt>
                <dd>{MEASURE_LABEL[form.measure]}{form.unitLabel ? ` · ${form.unitLabel}` : ""} · mejor si {form.direction}</dd>
                <dt>Metas</dt>
                <dd>{[form.baselineText && `LB ${form.baselineText}`, form.target2026 && `2026 ${form.target2026}`, form.target2028 && `2028 ${form.target2028}`].filter(Boolean).join(" · ") || "Sin definir"}</dd>
                <dt>Pilares y ODS</dt>
                <dd>{picked.length ? picked.map((k) => options.find((o) => o.key === k)?.label).join(", ") : "Ninguno"}</dd>
              </dl>
            </>
          )}

          <footer className="nw__foot">
            <span>Paso {step} de 5</span>
            {error && (
              <span className="nw__error" role="alert">
                <Icon name="alert" size={14} /> {errorText(error)}
              </span>
            )}
            {step > 1 && (
              <button type="button" className="button-ghost" onClick={() => setStep((step - 1) as Step)}>
                Atrás
              </button>
            )}
            {step < 5 ? (
              <button type="button" className="button-primary" disabled={!canNext[step]} onClick={() => setStep((step + 1) as Step)}>
                Siguiente: {STEPS[step].label.toLowerCase()} <Icon name="arrow-right" size={15} />
              </button>
            ) : (
              <>
                <button type="button" className="button-secondary" disabled={busy} onClick={() => void persist(false)}>
                  Guardar como borrador
                </button>
                <button type="button" className="button-primary" disabled={busy} onClick={() => void persist(true)}>
                  {busy ? "Guardando…" : "Publicar"}
                </button>
              </>
            )}
          </footer>
        </section>

        <aside className="nw__preview" aria-label="Así la verán los programas">
          <span className="nw__preview-label">Así la verán los programas</span>
          <article>
            <span className="nw__preview-tags">
              <b>{form.code || "—"}</b>
              <i>{STAGE_LABEL[form.stage]}</i>
              <i data-tone="wait">Borrador</i>
            </span>
            <strong>{form.name.trim() || "Nombre del indicador"}</strong>
            {form.description && <p>{form.description}</p>}
            <small>
              {MEASURE_LABEL[form.measure]}
              {form.unitLabel ? ` · ${form.unitLabel}` : ""} · mejor si {form.direction}
            </small>
            {form.source && <small>Fuente: {form.source}</small>}
            {(form.target2026 || form.target2028) && (
              <small>
                Metas UDES: {[form.target2026 && `2026 ${form.target2026}`, form.target2028 && `2028 ${form.target2028}`].filter(Boolean).join(" · ")}
              </small>
            )}
          </article>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

/** Dónde está un elemento en pantalla, para que la ventana crezca desde él. */
export function originOf(element: Element | null): { x: string; y: string } {
  const rect = element?.getBoundingClientRect();
  return rect ? { x: `${rect.left + rect.width / 2}px`, y: `${rect.top + rect.height / 2}px` } : { x: "90%", y: "80px" };
}
