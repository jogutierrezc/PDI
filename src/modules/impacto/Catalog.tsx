/* =============================================================================
   Impacto · Catálogo (propuesta A1).

   La tabla manda: cada fila es una ficha, agrupadas por eslabón de la cadena.
   Al elegir una, su ficha se abre a la derecha; la ficha se pliega a una franja
   para devolverle el ancho a la tabla, y la preferencia se recuerda.

   Crear una ficha es de la administración y de quien es editor o jefe de una
   vicerrectoría u oficina que lleva la función. Lo demás, consulta.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../components/ui/Icon";
import { SaveState } from "../admin/udes-en-cifras/ui";
import type { ImpactAccess } from "./access";
import {
  MEASURE_LABEL,
  STAGES,
  STAGE_LABEL,
  STATUS_LABEL,
  byChain,
  missingInSheet,
  nextCode,
  parseFigure,
  parseTarget,
  type Indicator,
  type IndicatorStatus,
  type Measure,
  type Stage,
  type SubstantiveFunction,
} from "./model";
import { toPayload, useSaveIndicator, type Catalog as CatalogData, type ImpactBase } from "./store";
import { AlignmentEditor, AlignmentChips } from "./Alignments";

const FOLD_KEY = "impacto:ficha-plegada";

function readFold() {
  try {
    return window.localStorage.getItem(FOLD_KEY) === "1";
  } catch {
    return false;
  }
}

export function Catalog({
  fn,
  base,
  catalog,
  access,
}: {
  fn: SubstantiveFunction;
  base: ImpactBase;
  catalog: CatalogData;
  access: ImpactAccess;
}) {
  const [query, setQuery] = useState("");
  const [stages, setStages] = useState<Stage[]>(STAGES);
  const [status, setStatus] = useState<"todas" | "completas" | "pendientes">("todas");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Indicator | null>(null);
  const [folded, setFoldedState] = useState(readFold);
  const setFolded = (next: boolean) => {
    setFoldedState(next);
    try {
      window.localStorage.setItem(FOLD_KEY, next ? "1" : "0");
    } catch {
      /* ventana privada: la ficha vuelve a abrirse al recargar */
    }
  };

  const dimensions = base.dimensions.filter((d) => d.fn === fn);
  const dimName = (id: string | null) => dimensions.find((d) => d.id === id)?.name ?? "";
  const all = useMemo(() => catalog.indicators.filter((i) => i.fn === fn).sort(byChain), [catalog.indicators, fn]);

  const shown = all.filter((i) => {
    if (!stages.includes(i.stage)) return false;
    const missing = missingInSheet(i).length;
    if (status === "completas" && missing) return false;
    if (status === "pendientes" && !missing) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || dimName(i.dimensionId).toLowerCase().includes(q);
  });

  const selected = draft ?? all.find((i) => i.id === selectedId) ?? null;
  const owners = access.ownersFor(fn);

  // Cambiar de función cierra la ficha abierta.
  useEffect(() => {
    setSelectedId(null);
    setDraft(null);
  }, [fn]);

  const startNew = () => {
    const owner = owners[0];
    if (!owner) return;
    setSelectedId(null);
    setFolded(false);
    setDraft({
      id: "",
      code: nextCode(fn, catalog.indicators),
      fn,
      stage: "insumos",
      suggested: false,
      dimensionId: dimensions[0]?.id ?? null,
      ownerUnitId: owner.id,
      name: "",
      description: "",
      unitLabel: "",
      measure: "numero",
      numerator: "",
      denominator: "",
      direction: "sube",
      baselineYear: 2023,
      baselineText: "",
      baselineNum: null,
      target2026: "",
      target2026Num: null,
      target2028: "",
      target2028Num: null,
      source: "",
      responsible: "",
      projectsText: "",
      cesu: [],
      sheet: {},
      programReports: true,
      status: "borrador",
      position: all.length,
      updatedAt: "",
      programId: null,
      campusId: null,
      parentId: null,
      mandatory: false,
      legacyId: null,
    });
  };

  const toggleStage = (stage: Stage) =>
    setStages((current) => (current.includes(stage) ? current.filter((s) => s !== stage) : [...current, stage]));

  return (
    <div className="imp-catalog" data-folded={folded || !selected || undefined}>
      <div className="imp-catalog__main">
        <div className="imp-toolbar">
          <label className="imp-search">
            <Icon name="search" size={15} />
            <span className="sr-only">Buscar</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Código, nombre o dimensión" />
          </label>
          <div className="imp-chips" role="group" aria-label="Eslabones">
            {STAGES.map((stage) => (
              <button key={stage} type="button" className="imp-chip" aria-pressed={stages.includes(stage)} onClick={() => toggleStage(stage)}>
                {STAGE_LABEL[stage]}
                <span>{all.filter((i) => i.stage === stage).length}</span>
              </button>
            ))}
          </div>
          <div className="imp-seg imp-seg--quiet" role="group" aria-label="Estado de la ficha">
            {(["todas", "completas", "pendientes"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
                {s === "todas" ? "Todas" : s === "completas" ? "Completas" : "Por completar"}
              </button>
            ))}
          </div>
          {owners.length > 0 && (
            <button type="button" className="button-primary imp-toolbar__new" onClick={startNew}>
              <Icon name="plus" size={15} /> Nuevo indicador
            </button>
          )}
        </div>

        <div className="imp-table-wrap">
          <table className="imp-table">
            <thead>
              <tr>
                <th scope="col" className="imp-col-code">Código</th>
                <th scope="col">Indicador</th>
                <th scope="col">Dimensión</th>
                <th scope="col">Unidad</th>
                <th scope="col" className="imp-num">Meta 2026</th>
                <th scope="col" className="imp-num">Meta 2028</th>
                <th scope="col">Pilares · ODS</th>
                <th scope="col">Ficha</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.filter((stage) => shown.some((i) => i.stage === stage)).map((stage) => (
                <StageRows
                  key={stage}
                  stage={stage}
                  rows={shown.filter((i) => i.stage === stage)}
                  selectedId={selected?.id ?? null}
                  dimName={dimName}
                  catalog={catalog}
                  base={base}
                  onPick={(id) => {
                    setDraft(null);
                    setSelectedId(id);
                    setFolded(false);
                  }}
                />
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="imp-empty-row">
                    Ningún indicador con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <Sheet
          key={selected.id || "nueva"}
          indicator={selected}
          base={base}
          catalog={catalog}
          access={access}
          folded={folded}
          setFolded={setFolded}
          onClose={() => {
            setDraft(null);
            setSelectedId(null);
          }}
          onCreated={(id) => {
            setDraft(null);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

function StageRows({
  stage,
  rows,
  selectedId,
  dimName,
  catalog,
  base,
  onPick,
}: {
  stage: Stage;
  rows: Indicator[];
  selectedId: string | null;
  dimName: (id: string | null) => string;
  catalog: CatalogData;
  base: ImpactBase;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <tr className="imp-group">
        <th colSpan={8} scope="rowgroup">
          {STAGE_LABEL[stage]} <span>{rows.length}</span>
        </th>
      </tr>
      {rows.map((i) => {
        const missing = missingInSheet(i);
        return (
          <tr key={i.id} aria-selected={i.id === selectedId} data-status={i.status}>
            <td className="imp-col-code">
              <span className="imp-code">{i.code}</span>
            </td>
            <td className="imp-name">
              {/* Toda la fila se elige con este botón: la tabla no se vuelve una trampa de foco. */}
              <button type="button" onClick={() => onPick(i.id)}>
                {i.name}
              </button>
              {i.suggested && <span className="imp-tag">Sugerido CESU</span>}
              {i.status !== "publicado" && <span className="imp-tag" data-tone="quiet">{STATUS_LABEL[i.status]}</span>}
            </td>
            <td className="imp-muted">{dimName(i.dimensionId) || "—"}</td>
            <td className="imp-muted">{i.unitLabel || "—"}</td>
            <td className="imp-num">{i.target2026 || "—"}</td>
            <td className="imp-num">{i.target2028 || "—"}</td>
            <td>
              <AlignmentChips indicatorId={i.id} catalog={catalog} base={base} compact />
            </td>
            <td>
              {missing.length === 0 ? (
                <span className="imp-mark" data-state="ok">
                  <Icon name="check" size={13} /> Completa
                </span>
              ) : (
                <span className="imp-mark" data-state="wait" title={`Falta: ${missing.join(", ")}`}>
                  <HalfDot /> Falta {missing.length === 1 ? missing[0].toLowerCase() : `${missing.length} datos`}
                </span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function HalfDot() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  );
}

/* --- La ficha ------------------------------------------------------------------ */

function Sheet({
  indicator,
  base,
  catalog,
  access,
  folded,
  setFolded,
  onClose,
  onCreated,
}: {
  indicator: Indicator;
  base: ImpactBase;
  catalog: CatalogData;
  access: ImpactAccess;
  folded: boolean;
  setFolded: (next: boolean) => void;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState(indicator);
  const save = useSaveIndicator();
  // Lo guardado vuelve de la base (con las metas ya convertidas a número): la
  // ficha toma esa versión en cuanto llega.
  useEffect(() => {
    setForm(indicator);
  }, [indicator.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const isNew = !indicator.id;
  const canEdit = access.canDefine(indicator.fn, indicator.ownerUnitId);
  const owners = access.ownersFor(indicator.fn);
  const dimensions = base.dimensions.filter((d) => d.fn === indicator.fn);
  const dirty = JSON.stringify(form) !== JSON.stringify(indicator);
  const set = <K extends keyof Indicator>(key: K, value: Indicator[K]) => setForm((f) => ({ ...f, [key]: value }));
  const duplicate = isNew && catalog.indicators.some((i) => i.code === form.code.trim().toUpperCase());

  const submit = () => {
    const payload = toPayload({
      ...form,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      baselineNum: parseFigure(form.baselineText),
      target2026Num: parseTarget(form.target2026),
      target2028Num: parseTarget(form.target2028),
    });
    if (isNew) delete payload.id;
    save.mutate(payload, { onSuccess: (row) => isNew && row && onCreated((row as { id: string }).id) });
  };

  if (folded) {
    return (
      <aside className="imp-sheet imp-sheet--folded" aria-label={`Ficha ${indicator.code}`}>
        <button type="button" className="icon-button" onClick={() => setFolded(false)} aria-label="Abrir la ficha" title="Abrir la ficha">
          <Icon name="sidebar" size={17} />
        </button>
        <span className="imp-code">{indicator.code || "Nueva"}</span>
        <span className="imp-sheet__vertical">{indicator.name || "Nueva ficha"}</span>
      </aside>
    );
  }

  const field = (label: string, node: ReactNode, wide = false) => (
    <label className={`admin-field${wide ? " admin-field--wide" : ""}`}>
      <span>{label}</span>
      {node}
    </label>
  );

  return (
    <aside className="imp-sheet" aria-label={`Ficha ${indicator.code}`}>
      <header className="imp-sheet__head">
        <div className="imp-sheet__ids">
          <span className="imp-code" data-strong>{form.code || "—"}</span>
          <span className="imp-muted">
            {STAGE_LABEL[form.stage]}
            {form.suggested ? " · sugerido CESU" : ""}
          </span>
          <span className="imp-sheet__tools">
            <button type="button" className="icon-button" onClick={() => setFolded(true)} aria-label="Plegar la ficha" title="Plegar para ver la tabla completa">
              <Icon name="sidebar" size={16} />
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar la ficha">
              <Icon name="close" size={16} />
            </button>
          </span>
        </div>
        {canEdit ? (
          <textarea
            className="imp-sheet__title-input"
            rows={2}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Nombre del indicador"
            aria-label="Nombre del indicador"
          />
        ) : (
          <h2 className="imp-sheet__title">{form.name}</h2>
        )}
      </header>

      <div className="imp-sheet__body">
        <fieldset className="imp-fieldset" disabled={!canEdit}>
          <legend>Qué es</legend>
          <div className="oda-form-grid">
            {isNew &&
              field(
                "Código",
                <input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} aria-invalid={duplicate || undefined} />,
              )}
            {field(
              "Eslabón",
              <select value={form.stage} onChange={(e) => set("stage", e.target.value as Stage)}>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>,
            )}
            {field(
              "Dimensión",
              <select value={form.dimensionId ?? ""} onChange={(e) => set("dimensionId", e.target.value || null)}>
                <option value="">Sin dimensión (transversal)</option>
                {dimensions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>,
            )}
            {owners.length > 1 &&
              field(
                "La define",
                <select value={form.ownerUnitId} onChange={(e) => set("ownerUnitId", e.target.value)}>
                  {owners.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>,
              )}
          </div>
          {duplicate && <p className="oda-field-warning">Ya existe un indicador con el código {form.code}.</p>}
        </fieldset>

        <fieldset className="imp-fieldset" disabled={!canEdit}>
          <legend>Cómo se mide</legend>
          {field("Qué mide", <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />, true)}
          <div className="imp-seg imp-seg--block" role="group" aria-label="Cómo se registra">
            {(["numero", "porcentaje", "proporcion", "dual", "pesos", "texto"] as Measure[]).map((m) => (
              <button key={m} type="button" aria-pressed={form.measure === m} onClick={() => set("measure", m)} disabled={!canEdit}>
                {MEASURE_LABEL[m]}
              </button>
            ))}
          </div>
          <div className="oda-form-grid">
            {field("Unidad de medida", <input value={form.unitLabel} onChange={(e) => set("unitLabel", e.target.value)} placeholder="% graduados" />)}
            {field(
              "Mejor si",
              <select value={form.direction} onChange={(e) => set("direction", e.target.value as Indicator["direction"])}>
                <option value="sube">Sube</option>
                <option value="baja">Baja (como la deserción)</option>
              </select>,
            )}
            {(form.measure === "porcentaje" || form.measure === "proporcion" || form.measure === "dual") && (
              <>
                {field("Numerador", <input value={form.numerator} onChange={(e) => set("numerator", e.target.value)} />)}
                {field("Denominador", <input value={form.denominator} onChange={(e) => set("denominator", e.target.value)} />)}
              </>
            )}
          </div>
        </fieldset>

        <fieldset className="imp-fieldset" disabled={!canEdit}>
          <legend>Metas institucionales</legend>
          <div className="imp-targets">
            {field(`Línea base ${form.baselineYear}`, <input value={form.baselineText} onChange={(e) => set("baselineText", e.target.value)} />)}
            {field("Meta 2026", <input value={form.target2026} onChange={(e) => set("target2026", e.target.value)} placeholder="≥ 80%" />)}
            {field("Meta 2028", <input value={form.target2028} onChange={(e) => set("target2028", e.target.value)} />)}
          </div>
          <p className="oda-field-hint">
            Una meta con número («72%», «≥ 80%», «0,22») calcula sola el avance. Una relativa («+2 pp vs LB») se muestra tal
            cual.
          </p>
        </fieldset>

        <fieldset className="imp-fieldset" disabled={!canEdit}>
          <legend>Procedencia</legend>
          <div className="oda-form-grid">
            {field("Fuente de verificación", <input value={form.source} onChange={(e) => set("source", e.target.value)} />, true)}
            {field("Responsable", <input value={form.responsible} onChange={(e) => set("responsible", e.target.value)} />, true)}
          </div>
          {form.cesu.length > 0 && <p className="imp-muted imp-small">CESU (Acuerdo 01/2025): {form.cesu.join(" · ")}</p>}
          <label className="oda-check imp-check">
            <input type="checkbox" checked={!form.programReports} onChange={(e) => set("programReports", !e.target.checked)} />
            <span>Solo institucional: los programas lo consultan, no lo reportan</span>
          </label>
        </fieldset>

        {!isNew && (
          <fieldset className="imp-fieldset">
            <legend>Pilares del PDI y ODS</legend>
            <AlignmentEditor indicator={indicator} base={base} catalog={catalog} canEdit={canEdit} />
          </fieldset>
        )}
      </div>

      {canEdit && (
        <footer className="imp-sheet__foot">
          <div className="imp-seg imp-seg--quiet" role="group" aria-label="Estado de la ficha">
            {(["borrador", "publicado"] as IndicatorStatus[]).map((s) => (
              <button key={s} type="button" aria-pressed={form.status === s} onClick={() => set("status", s)}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess && !dirty} />
          <button
            type="button"
            className="button-primary"
            onClick={submit}
            disabled={!dirty || save.isPending || !form.name.trim() || duplicate || !form.code.trim()}
          >
            {isNew ? "Crear ficha" : "Guardar"}
          </button>
        </footer>
      )}
    </aside>
  );
}
