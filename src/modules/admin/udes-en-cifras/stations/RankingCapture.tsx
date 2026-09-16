/* =============================================================================
   Rankings universitarios en la intranet.

   · RankingForm (Estructura): qué ranking es, su color de acento y la vista con
     la que abre en la ficha.
   · RankingCapture (Captura): una edición por año con sus posiciones (número o
     banda), puntaje, estrellas por categoría, ODS en los que participó, áreas
     (QS Subject) y campos propios. Se guarda la edición completa.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdRankingEditionRow, OdRankingRow } from "../../../../types/database";
import {
  ACCENT_PRESETS,
  QS_STAR_CATEGORIES,
  RANKING_SYSTEMS,
  RANKING_VIEWS,
  SDGS,
  editionFromRow,
  isRankText,
} from "../../../datos-abiertos/data/rankings";
import type { RankingEdition, RankingSystem, RankingView } from "../../../datos-abiertos/data/rankings";
import type { StationProps } from "../OdAdmin";
import { useDeleteRankingEdition, useSaveRankingEdition } from "../od-data";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../ui";
import { parseNumber } from "../sheet";

/* --- Estructura: definir un ranking ------------------------------------------------ */

export interface RankingFields {
  title: string;
  description: string;
  system: RankingSystem;
  accent: string;
  view: RankingView;
  office_id: string;
}

export function RankingForm({
  offices,
  initial,
  onSubmit,
  onCancel,
}: {
  offices: StationProps["data"]["rows"]["offices"];
  initial?: Partial<RankingFields>;
  onSubmit: (fields: RankingFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<RankingFields>({
    title: "",
    description: "",
    system: "qs_world",
    accent: ACCENT_PRESETS[0],
    view: "medallas",
    office_id: "",
    ...initial,
  });
  const set = (patch: Partial<RankingFields>) => setF({ ...f, ...patch });
  const validAccent = /^#[0-9a-fA-F]{6}$/.test(f.accent);

  return (
    <form className="oda-inline-form" onSubmit={(e) => { e.preventDefault(); if (f.title.trim() && validAccent) onSubmit(f); }}>
      <div className="oda-form-grid">
        <label className="admin-field">
          <span>Ranking</span>
          <select
            value={f.system}
            onChange={(e) => {
              const system = e.target.value as RankingSystem;
              // Al elegir el sistema se propone su nombre, si el título seguía siendo el propuesto.
              const proposed = Object.values(RANKING_SYSTEMS).some((s) => s.label === f.title) || !f.title;
              set({ system, title: proposed && system !== "otro" ? RANKING_SYSTEMS[system].label : f.title, view: system === "the_impact" ? "ods" : f.view });
            }}
          >
            {(Object.keys(RANKING_SYSTEMS) as RankingSystem[]).map((key) => (
              <option key={key} value={key}>
                {RANKING_SYSTEMS[key].label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field admin-field--wide">
          <span>Título</span>
          <input autoFocus required value={f.title} placeholder={RANKING_SYSTEMS[f.system].label} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Descripción</span>
          <textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <fieldset className="admin-field oda-accent">
          <legend>Color del ranking</legend>
          <div className="oda-accent__row">
            {ACCENT_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                className="oda-accent__swatch"
                style={{ "--swatch": color } as CSSProperties}
                aria-pressed={f.accent.toLowerCase() === color}
                aria-label={`Color ${color}`}
                onClick={() => set({ accent: color })}
              />
            ))}
            <label className="oda-accent__custom">
              <input type="color" value={validAccent ? f.accent : "#1f5fbf"} aria-label="Otro color" onChange={(e) => set({ accent: e.target.value })} />
              <input value={f.accent} aria-label="Color en hexadecimal" maxLength={7} onChange={(e) => set({ accent: e.target.value })} />
            </label>
          </div>
          {!validAccent && <small className="oda-field-warning">Escribe el color como #1f5fbf.</small>}
          <RankingPreview system={f.system} accent={validAccent ? f.accent : "#1f5fbf"} title={f.title || RANKING_SYSTEMS[f.system].label} />
        </fieldset>
        <label className="admin-field">
          <span>Vista con la que abre</span>
          <select value={f.view} onChange={(e) => set({ view: e.target.value as RankingView })}>
            {(Object.keys(RANKING_VIEWS) as RankingView[]).map((view) => (
              <option key={view} value={view}>
                {RANKING_VIEWS[view]}
              </option>
            ))}
          </select>
          <small>En la ficha se puede cambiar de vista; esta es la primera que se ve.</small>
        </label>
        <label className="admin-field">
          <span>Oficina que reporta</span>
          <select value={f.office_id} onChange={(e) => set({ office_id: e.target.value })}>
            <option value="">Sin oficina</option>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      </div>
      <div className="oda-inline-form__actions">
        <button type="button" className="button-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button-primary" disabled={!validAccent}>{initial?.title ? "Guardar ranking" : "Crear ranking"}</button>
      </div>
    </form>
  );
}

/** Cómo se verá la insignia del ranking con el color elegido. */
function RankingPreview({ system, accent, title }: { system: RankingSystem; accent: string; title: string }) {
  const publisher = RANKING_SYSTEMS[system].publisher;
  return (
    <div className="oda-accent__preview" style={{ "--rk-accent": accent } as CSSProperties} aria-hidden="true">
      <span className="oda-accent__badge">{publisher || "R"}</span>
      <span className="oda-accent__ring">#145</span>
      <span className="oda-accent__title">{title}</span>
      <span className="oda-accent__stars">★★★★☆</span>
    </div>
  );
}

/* --- Captura: ediciones anuales ------------------------------------------------------- */

const emptyEdition = (year: number): RankingEdition => ({
  year, global_rank: "", regional_rank: "", national_rank: "", evaluated: null, score: null,
  stars: [], sdgs: [], subjects: [], custom: [], note: "",
});

export function RankingCapture({ data, report, periodId, canEdit }: StationProps) {
  const rankings = (data.rows.rankings ?? []).filter((r) => r.report_id === report!.uuid).sort((a, b) => a.position - b.position);
  const [active, setActive] = useState(rankings[0]?.id);
  const ranking = rankings.find((r) => r.id === active) ?? rankings[0];
  if (!ranking) {
    return (
      <StageEmpty title="Este informe no tiene rankings">
        Créalos en Estructura y KPI → Conjuntos visuales → Ranking universitario. Luego vuelve aquí para cargar cada edición.
      </StageEmpty>
    );
  }
  return (
    <RankingEditor
      key={ranking.id + (data.rows.rankingEditions ?? []).filter((e) => e.ranking_id === ranking.id).map((e) => `${e.year}${e.global_rank}`).join()}
      ranking={ranking}
      rankings={rankings}
      onPick={setActive}
      rows={(data.rows.rankingEditions ?? []).filter((e) => e.ranking_id === ranking.id)}
      periodId={periodId}
      reportId={report!.uuid!}
      canEdit={canEdit}
      years={data.catalog.years}
    />
  );
}

function RankingEditor({
  ranking, rankings, onPick, rows, periodId, reportId, canEdit, years,
}: {
  ranking: OdRankingRow;
  rankings: OdRankingRow[];
  onPick: (id: string) => void;
  rows: OdRankingEditionRow[];
  periodId: string;
  reportId: string;
  canEdit: boolean;
  years: number[];
}) {
  const stored = useMemo(() => rows.map(editionFromRow).sort((a, b) => b.year - a.year), [rows]);
  const [year, setYear] = useState<number>(stored[0]?.year ?? years[years.length - 1] ?? new Date().getFullYear());
  const [newYear, setNewYear] = useState<string>("");
  const [extraYears, setExtraYears] = useState<number[]>([]);
  const allYears = Array.from(new Set([...stored.map((e) => e.year), ...extraYears])).sort((a, b) => b - a);
  const original = stored.find((e) => e.year === year) ?? emptyEdition(year);
  const [draft, setDraft] = useState<RankingEdition>(original);
  const save = useSaveRankingEdition();
  const remove = useDeleteRankingEdition();

  const switchYear = (next: number) => {
    setYear(next);
    setDraft(stored.find((e) => e.year === next) ?? emptyEdition(next));
  };
  const set = (patch: Partial<RankingEdition>) => setDraft({ ...draft, ...patch });
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  const rankErrors = [
    ["Mundial", draft.global_rank],
    ["Latinoamérica", draft.regional_rank],
    ["Colombia", draft.national_rank],
    ...draft.sdgs.flatMap((s) => [[`ODS ${s.sdg} mundial`, s.global_rank], [`ODS ${s.sdg} Colombia`, s.national_rank]]),
    ...draft.subjects.flatMap((s) => [[`${s.subject || "Área"} mundial`, s.global_rank], [`${s.subject || "Área"} Colombia`, s.national_rank]]),
  ].filter(([, value]) => !isRankText(value)).map(([label]) => label);
  const blankLabels = draft.subjects.some((s) => !s.subject.trim()) || draft.custom.some((c) => !c.label.trim()) || draft.stars.some((s) => !s.category.trim());
  const valid = rankErrors.length === 0 && !blankLabels;

  const toRow = (): OdRankingEditionRow => ({
    ranking_id: ranking.id,
    year: draft.year,
    global_rank: draft.global_rank.trim(),
    regional_rank: draft.regional_rank.trim(),
    national_rank: draft.national_rank.trim(),
    evaluated: draft.evaluated,
    score: draft.score,
    stars: draft.stars.map((s) => ({ category: s.category.trim(), stars: s.stars })),
    sdgs: draft.sdgs.map((s) => ({ sdg: s.sdg, global_rank: s.global_rank.trim(), national_rank: s.national_rank.trim(), score: s.score ?? null })),
    subjects: draft.subjects.map((s) => ({ subject: s.subject.trim(), global_rank: s.global_rank.trim(), national_rank: s.national_rank.trim() })),
    custom: draft.custom.map((c) => ({ label: c.label.trim(), value: c.value.trim() })),
    note: draft.note.trim(),
  });

  const system = RANKING_SYSTEMS[ranking.system];
  const suggestStars = ranking.system.startsWith("qs");
  const suggestSdgs = ranking.system === "the_impact" || ranking.system === "qs_sustainability";
  const suggestSubjects = ranking.system === "qs_subject";

  return (
    <Panel
      id="oda-rankings"
      title="Rankings"
      description="Una edición por año. Las posiciones admiten número (145), empate (=145) o banda (801-1000, 1001+). Vacío es «no aparece»."
      actions={
        <>
          {rankings.length > 1 && (
            <label className="oda-add-select">
              <span className="sr-only">Ranking</span>
              <select value={ranking.id} onChange={(e) => onPick(e.target.value)}>
                {rankings.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </label>
          )}
          <SaveState pending={save.isPending || remove.isPending} error={save.error ?? remove.error} success={save.isSuccess} idle={!valid ? "Revisa las posiciones" : undefined} />
          <button type="button" className="button-primary" disabled={!canEdit || !dirty || !valid || save.isPending} onClick={() => save.mutate({ periodId, reportId, edition: toRow() })}>
            Guardar edición {draft.year}
          </button>
        </>
      }
    >
      <div className="oda-ranking" style={{ "--rk-accent": ranking.accent } as CSSProperties}>
        <p className="oda-panel__lede">
          <span className="oda-ranking__badge">{system.publisher || "R"}</span>
          <strong>{ranking.title}</strong> · {RANKING_VIEWS[ranking.view as RankingView]} por defecto
        </p>

        <div className="oda-ranking__years" role="group" aria-label="Edición">
          {allYears.map((y) => (
            <button key={y} type="button" className="oda-chip" aria-pressed={y === year} onClick={() => switchYear(y)}>
              {y}
              {!stored.some((e) => e.year === y) && <small> · nueva</small>}
            </button>
          ))}
          {canEdit && (
            <span className="oda-ranking__add-year">
              <input type="number" inputMode="numeric" min={2000} max={2100} placeholder="Año" value={newYear} aria-label="Año de la nueva edición" onChange={(e) => setNewYear(e.target.value)} />
              <button
                type="button"
                className="button-secondary"
                disabled={!/^\d{4}$/.test(newYear) || allYears.includes(Number(newYear))}
                onClick={() => {
                  const y = Number(newYear);
                  setExtraYears([...extraYears, y]);
                  switchYear(y);
                  setNewYear("");
                }}
              >
                <Icon name="plus" size={15} /> Edición
              </button>
            </span>
          )}
          {canEdit && stored.some((e) => e.year === year) && (
            <ConfirmButton label={`Borrar ${year}`} confirmLabel={`¿Borrar la edición ${year}?`} onConfirm={() => remove.mutate({ rankingId: ranking.id, year })} />
          )}
        </div>

        <fieldset className="oda-ranking__block" disabled={!canEdit}>
          <legend>Posición · edición {draft.year}</legend>
          <div className="oda-ranking__ranks">
            <RankInput label="Mundial" value={draft.global_rank} onChange={(v) => set({ global_rank: v })} />
            <RankInput label="Latinoamérica" hint="si aplica" value={draft.regional_rank} onChange={(v) => set({ regional_rank: v })} />
            <RankInput label="Colombia" value={draft.national_rank} onChange={(v) => set({ national_rank: v })} />
            <label className="admin-field">
              <span>Puntaje <small>opcional</small></span>
              <NumberInput value={draft.score} onChange={(v) => set({ score: v })} />
            </label>
            <label className="admin-field">
              <span>Instituciones evaluadas <small>opcional</small></span>
              <NumberInput value={draft.evaluated} integer onChange={(v) => set({ evaluated: v })} />
            </label>
          </div>
        </fieldset>

        <fieldset className="oda-ranking__block" disabled={!canEdit}>
          <legend>Estrellas por categoría {suggestStars ? "(QS Stars)" : ""}</legend>
          {draft.stars.length === 0 && <p className="oda-muted">Sin estrellas en esta edición.</p>}
          <ul className="oda-ranking__stars">
            {draft.stars.map((s, i) => (
              <li key={i}>
                <input list="oda-qs-categorias" value={s.category} placeholder="Categoría" aria-label="Categoría"
                  onChange={(e) => set({ stars: draft.stars.map((x, k) => (k === i ? { ...x, category: e.target.value } : x)) })} />
                <span className="oda-ranking__star-picker" role="radiogroup" aria-label={`Estrellas de ${s.category || "la categoría"}`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={s.stars === n} aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`} data-on={n <= s.stars || undefined}
                      onClick={() => set({ stars: draft.stars.map((x, k) => (k === i ? { ...x, stars: x.stars === n ? n - 1 : n } : x)) })}>
                      ★
                    </button>
                  ))}
                </span>
                <button type="button" className="icon-button" aria-label="Quitar categoría" onClick={() => set({ stars: draft.stars.filter((_, k) => k !== i) })}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <datalist id="oda-qs-categorias">
            {QS_STAR_CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
          <div className="oda-ranking__adders">
            <button type="button" className="button-secondary" onClick={() => set({ stars: [...draft.stars, { category: "", stars: 0 }] })}>
              <Icon name="plus" size={15} /> Categoría
            </button>
            {suggestStars && draft.stars.length === 0 && (
              <button type="button" className="button-ghost" onClick={() => set({ stars: QS_STAR_CATEGORIES.slice(0, 9).map((category) => ({ category, stars: 0 })) })}>
                Usar las categorías de QS Stars
              </button>
            )}
          </div>
        </fieldset>

        <fieldset className="oda-ranking__block" disabled={!canEdit}>
          <legend>ODS en los que participó {suggestSdgs ? "(THE Impact)" : ""}</legend>
          <div className="oda-ranking__sdg-picker" role="group" aria-label="ODS en los que participó">
            {SDGS.map((sdg) => {
              const on = draft.sdgs.some((s) => s.sdg === sdg.n);
              return (
                <button key={sdg.n} type="button" style={{ "--sdg": sdg.color } as CSSProperties} aria-pressed={on} title={sdg.name}
                  onClick={() => set({ sdgs: on ? draft.sdgs.filter((s) => s.sdg !== sdg.n) : [...draft.sdgs, { sdg: sdg.n, global_rank: "", national_rank: "", score: null }].sort((a, b) => a.sdg - b.sdg) })}>
                  {sdg.n}
                </button>
              );
            })}
          </div>
          {draft.sdgs.length > 0 && (
            <table className="oda-ranking__table">
              <thead>
                <tr><th scope="col">ODS</th><th scope="col">Mundial</th><th scope="col">Colombia</th><th scope="col">Puntaje</th></tr>
              </thead>
              <tbody>
                {draft.sdgs.map((s) => (
                  <tr key={s.sdg}>
                    <th scope="row"><i style={{ "--sdg": SDGS[s.sdg - 1].color } as CSSProperties}>{s.sdg}</i> {SDGS[s.sdg - 1].name}</th>
                    <td><RankCell value={s.global_rank} label={`ODS ${s.sdg} mundial`} onChange={(v) => set({ sdgs: draft.sdgs.map((x) => (x.sdg === s.sdg ? { ...x, global_rank: v } : x)) })} /></td>
                    <td><RankCell value={s.national_rank} label={`ODS ${s.sdg} Colombia`} onChange={(v) => set({ sdgs: draft.sdgs.map((x) => (x.sdg === s.sdg ? { ...x, national_rank: v } : x)) })} /></td>
                    <td><NumberInput value={s.score ?? null} onChange={(v) => set({ sdgs: draft.sdgs.map((x) => (x.sdg === s.sdg ? { ...x, score: v } : x)) })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </fieldset>

        <fieldset className="oda-ranking__block" disabled={!canEdit}>
          <legend>Posición por área {suggestSubjects ? "(QS Subject)" : ""}</legend>
          {draft.subjects.length > 0 && (
            <table className="oda-ranking__table">
              <thead>
                <tr><th scope="col">Área</th><th scope="col">Mundial</th><th scope="col">Colombia</th><th scope="col"><span className="sr-only">Quitar</span></th></tr>
              </thead>
              <tbody>
                {draft.subjects.map((s, i) => (
                  <tr key={i}>
                    <th scope="row"><input value={s.subject} placeholder="Medicine, Engineering…" aria-label="Área" onChange={(e) => set({ subjects: draft.subjects.map((x, k) => (k === i ? { ...x, subject: e.target.value } : x)) })} /></th>
                    <td><RankCell value={s.global_rank} label="Mundial" onChange={(v) => set({ subjects: draft.subjects.map((x, k) => (k === i ? { ...x, global_rank: v } : x)) })} /></td>
                    <td><RankCell value={s.national_rank} label="Colombia" onChange={(v) => set({ subjects: draft.subjects.map((x, k) => (k === i ? { ...x, national_rank: v } : x)) })} /></td>
                    <td><button type="button" className="icon-button" aria-label="Quitar área" onClick={() => set({ subjects: draft.subjects.filter((_, k) => k !== i) })}><Icon name="close" size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="oda-ranking__adders">
            <button type="button" className="button-secondary" onClick={() => set({ subjects: [...draft.subjects, { subject: "", global_rank: "", national_rank: "" }] })}>
              <Icon name="plus" size={15} /> Área
            </button>
          </div>
        </fieldset>

        <fieldset className="oda-ranking__block" disabled={!canEdit}>
          <legend>Campos propios</legend>
          <p className="oda-muted">Lo que el ranking publica y no tiene casilla: «Puntaje de empleabilidad», «Categoría», «Percentil»…</p>
          <ul className="oda-ranking__custom">
            {draft.custom.map((c, i) => (
              <li key={i}>
                <input value={c.label} placeholder="Nombre del campo" aria-label="Nombre del campo" onChange={(e) => set({ custom: draft.custom.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                <input value={c.value} placeholder="Cifra o texto" aria-label="Valor" onChange={(e) => set({ custom: draft.custom.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
                <button type="button" className="icon-button" aria-label="Quitar campo" onClick={() => set({ custom: draft.custom.filter((_, k) => k !== i) })}><Icon name="close" size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="oda-ranking__adders">
            <button type="button" className="button-secondary" onClick={() => set({ custom: [...draft.custom, { label: "", value: "" }] })}>
              <Icon name="plus" size={15} /> Campo
            </button>
          </div>
          <label className="admin-field">
            <span>Nota de la edición <small>opcional</small></span>
            <textarea rows={2} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
          </label>
        </fieldset>

        {!valid && (
          <p className="oda-field-warning" role="alert">
            {rankErrors.length > 0 && <>Posiciones que no se entienden: {rankErrors.join(", ")}. Usa 145, =145, 801-1000 o 1001+. </>}
            {blankLabels && <>Hay categorías, áreas o campos sin nombre.</>}
          </p>
        )}
      </div>
    </Panel>
  );
}

function RankInput({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (value: string) => void }) {
  const invalid = !isRankText(value);
  return (
    <label className="admin-field">
      <span>
        {label} {hint && <small>{hint}</small>}
      </span>
      <input className="oda-ranking__rank" value={value} placeholder="145 o 801-1000" aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function RankCell({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  return <input className="oda-ranking__rank" value={value} aria-label={label} aria-invalid={!isRankText(value) || undefined} placeholder="—" onChange={(e) => onChange(e.target.value)} />;
}

function NumberInput({ value, onChange, integer = false }: { value: number | null; onChange: (value: number | null) => void; integer?: boolean }) {
  const [text, setText] = useState(value === null ? "" : String(value).replace(".", ","));
  const parsed = parseNumber(text);
  return (
    <input
      inputMode="decimal"
      value={text}
      aria-invalid={!parsed.ok || undefined}
      onChange={(e) => {
        setText(e.target.value);
        const next = parseNumber(e.target.value);
        if (next.ok) onChange(next.value === null ? null : integer ? Math.round(next.value) : next.value);
      }}
    />
  );
}
