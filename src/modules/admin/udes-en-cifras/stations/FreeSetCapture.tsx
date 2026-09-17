/* =============================================================================
   Conjuntos libres en la intranet (0033).

   · FreeSetForm (Estructura): título, temporalidad y columnas. La clave de
     cada columna sale de su nombre al crearla y no cambia después: enlaza las
     casillas guardadas y las vistas.
   · FreeSetCapture (Captura), por conjunto:
     1. Filas: una rejilla con las columnas del conjunto (y el año, si es
        anual). Cada fila es un dato, un título que agrupa las que siguen o un
        total que el portal calcula sobre las filas de datos de su grupo; se
        añaden, duplican, ordenan y quitan una por una.
        Se escribe casilla por casilla o se pega un rango de Excel,
        con o sin la fila de encabezados. Cada casilla se lee según su columna:
        cifras en formato de Excel en español (un texto que no es número queda
        en rojo y no se guarda), fechas como 2025-03-01 o el año, territorios
        contra los departamentos y países conocidos. Vacío es null, no cero.
        Guardar reemplaza todas las filas del conjunto.
     2. Gráficas: las vistas del conjunto. Viven aquí, junto a los datos, y no
        en Diseño visual: una vista es parte de la fuente (qué columnas dibuja)
        y se guarda con ella; Diseño visual solo elige qué bloque la muestra.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdFreeSetRecordRow, OdFreeSetRow, OdReportBlockRow, OdValueFormat } from "../../../../types/database";
import { CHART_TYPES, COLUMN_KIND_LABEL, TEMPORALITY_LABEL, freeTotalAt, territoryCode, viewProblems } from "../../../datos-abiertos/data/free-sets";
import type {
  FreeCell,
  FreeChartType,
  FreeColumn,
  FreeColumnKind,
  FreeRow,
  FreeRowKind,
  FreeSet,
  FreeTemporality,
  FreeTerritory,
  FreeView,
} from "../../../datos-abiertos/data/free-sets";
import type { StationProps } from "../OdAdmin";
import { useReplaceFreeSetRows, useSaveFreeSet } from "../od-data";
import { ConfirmButton, Panel, SaveState, StageEmpty, slugify } from "../ui";
import { editableText, parseClipboardGrid, parseCsv, parseNumber } from "../sheet";
import { PasteMessages } from "../PasteTable";
import { formatValue } from "../../../datos-abiertos/data/open-data";

const FORMAT_LABEL: Record<OdValueFormat, string> = { entero: "Entero", decimal: "Decimal", porcentaje: "Porcentaje" };
const TERRITORY_LABEL: Record<FreeTerritory, string> = { departamento: "Departamento de Colombia", pais: "País" };

/** Clave legible y única: "sede", "sede-2"… */
const uniqueSlug = (text: string, taken: Iterable<string>, fallback: string) => {
  const used = new Set(taken);
  const base = slugify(text) || fallback;
  let key = base;
  for (let n = 2; used.has(key); n += 1) key = `${base}-${n}`;
  return key;
};

/** Minúsculas, sin tildes ni espacios de más: para casar encabezados pegados con columnas. */
const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? one : many}`;

/* --- Estructura: definir el conjunto ----------------------------------------------- */

export interface FreeSetFields {
  title: string;
  description: string;
  office_id: string;
  temporality: FreeTemporality;
  period_label: string;
  columns: FreeColumn[];
}

interface ColumnDraft extends FreeColumn {
  /** Clave de React; la clave de la columna se asigna al guardar. */
  draftId: string;
  /** Ya guardada: su clave no cambia. */
  fixed: boolean;
}

let draftCounter = 0;
const newDraftId = () => `columna-${(draftCounter += 1)}`;

/** Solo los campos que usa el tipo de columna. */
const cleanColumn = ({ key, label, kind, format, unit, territory }: FreeColumn): FreeColumn => ({
  key,
  label: label.trim(),
  kind,
  ...(kind === "cifra" ? { format: format ?? "entero", ...(unit?.trim() ? { unit: unit.trim() } : {}) } : {}),
  ...(kind === "territorio" ? { territory: territory ?? "departamento" } : {}),
});

export function FreeSetForm({
  offices,
  initial,
  rowCount = 0,
  filled = {},
  views = [],
  takenKeys = [],
  onSubmit,
  onCancel,
}: {
  offices: StationProps["data"]["rows"]["offices"];
  initial?: FreeSetFields;
  /** Filas guardadas del conjunto. */
  rowCount?: number;
  /** Casillas con dato por clave de columna. */
  filled?: Record<string, number>;
  views?: FreeView[];
  /** Claves que ya aparecen en las filas guardadas (también de columnas quitadas). */
  takenKeys?: string[];
  onSubmit: (fields: FreeSetFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    office_id: initial?.office_id ?? "",
    temporality: initial?.temporality ?? ("sin_tiempo" as FreeTemporality),
    period_label: initial?.period_label ?? "",
  });
  const [columns, setColumns] = useState<ColumnDraft[]>(() =>
    initial?.columns.length
      ? initial.columns.map((c) => ({ ...c, draftId: newDraftId(), fixed: true }))
      : [
          { key: "", label: "", kind: "texto", draftId: newDraftId(), fixed: false },
          { key: "", label: "", kind: "cifra", format: "entero", draftId: newDraftId(), fixed: false },
        ],
  );
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const patchColumn = (draftId: string, patch: Partial<ColumnDraft>) => setColumns(columns.map((c) => (c.draftId === draftId ? { ...c, ...patch } : c)));
  const move = (index: number, delta: number) => {
    const next = [...columns];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setColumns(next);
  };

  const labels = columns.map((c) => fold(c.label)).filter(Boolean);
  const repeated = Array.from(new Set(labels.filter((l, i) => labels.indexOf(l) !== i)));
  const problems = [
    ...(f.title.trim() ? [] : ["Ponle un título."]),
    ...(columns.length ? [] : ["Añade al menos una columna."]),
    ...(columns.some((c) => !c.label.trim()) ? ["Cada columna necesita un nombre."] : []),
    ...(repeated.length ? ["Dos columnas no pueden llamarse igual: al pegar desde Excel se casan por nombre."] : []),
    ...(f.temporality === "periodo" && !f.period_label.trim() ? ["Escribe el periodo que cubre."] : []),
  ];

  const temporalityChanged = Boolean(initial && rowCount > 0 && initial.temporality !== f.temporality);
  const usedBy = (key: string) =>
    views.filter((v) => v.category === key || v.start === key || v.end === key || (v.series ?? []).includes(key));

  const submit = () => {
    if (problems.length) return;
    const taken = new Set([...columns.filter((c) => c.fixed).map((c) => c.key), ...takenKeys]);
    const out = columns.map((c) => {
      if (c.fixed) return cleanColumn(c);
      const key = uniqueSlug(c.label, taken, "columna");
      taken.add(key);
      return cleanColumn({ ...c, key });
    });
    onSubmit({ ...f, title: f.title.trim(), description: f.description.trim(), period_label: f.temporality === "periodo" ? f.period_label.trim() : "", columns: out });
  };

  return (
    <form className="oda-inline-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="oda-form-grid">
        <label className="admin-field admin-field--wide">
          <span>Título</span>
          <input autoFocus required value={f.title} placeholder="Oferta y satisfacción por sede" onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Descripción</span>
          <textarea rows={2} value={f.description} placeholder="Qué reúne la fuente y de dónde sale" onChange={(e) => set({ description: e.target.value })} />
        </label>
        <fieldset className="admin-field--wide oda-free-fieldset oda-free-temporality">
          <legend>Temporalidad</legend>
          <div role="radiogroup" aria-label="Temporalidad">
            {(Object.keys(TEMPORALITY_LABEL) as FreeTemporality[]).map((value) => (
              <label key={value} className="oda-check">
                <input type="radio" name="temporalidad" value={value} checked={f.temporality === value} onChange={() => set({ temporality: value })} />
                {TEMPORALITY_LABEL[value]}
              </label>
            ))}
          </div>
          {temporalityChanged && (
            <small className="oda-field-warning" role="note">
              {initial!.temporality === "anual"
                ? `Las ${plural(rowCount, "fila", "filas")} conservan su año, pero el portal deja de usarlo: la ficha ya no filtra ni recorre los años.`
                : f.temporality === "anual"
                  ? `Las ${plural(rowCount, "fila", "filas")} ya cargadas no tienen año: no se ven en el portal hasta que les pongas uno en Captura.`
                  : "Las filas no cambian; solo cambia cómo se rotula el conjunto en el portal."}
            </small>
          )}
        </fieldset>
        {f.temporality === "periodo" && (
          <label className="admin-field">
            <span>Periodo que cubre</span>
            <input value={f.period_label} placeholder="2020–2025" onChange={(e) => set({ period_label: e.target.value })} />
          </label>
        )}
        <label className="admin-field">
          <span>Oficina que reporta</span>
          <select value={f.office_id} onChange={(e) => set({ office_id: e.target.value })}>
            <option value="">Sin oficina</option>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>

        <fieldset className="admin-field--wide oda-free-fieldset oda-free-columns">
          <legend>Columnas</legend>
          <ol>
            {columns.map((c, index) => {
              const data = c.fixed ? filled[c.key] ?? 0 : 0;
              const using = c.fixed ? usedBy(c.key) : [];
              const kindChanged = c.fixed && data > 0 && initial?.columns.find((x) => x.key === c.key)?.kind !== c.kind;
              return (
                <li key={c.draftId}>
                  <span className="oda-free-columns__pos" aria-hidden="true">{index + 1}</span>
                  <label className="oda-inline-field oda-inline-field--wide">
                    <span>Nombre</span>
                    <input value={c.label} placeholder={index === 0 ? "Sede" : "Estudiantes"} aria-label={`Nombre de la columna ${index + 1}`} onChange={(e) => patchColumn(c.draftId, { label: e.target.value })} />
                  </label>
                  <label className="oda-inline-field">
                    <span>Tipo</span>
                    <select value={c.kind} onChange={(e) => patchColumn(c.draftId, { kind: e.target.value as FreeColumnKind })}>
                      {(Object.keys(COLUMN_KIND_LABEL) as FreeColumnKind[]).map((kind) => <option key={kind} value={kind}>{COLUMN_KIND_LABEL[kind]}</option>)}
                    </select>
                  </label>
                  {c.kind === "cifra" && (
                    <>
                      <label className="oda-inline-field">
                        <span>Formato</span>
                        <select value={c.format ?? "entero"} onChange={(e) => patchColumn(c.draftId, { format: e.target.value as OdValueFormat })}>
                          {(Object.keys(FORMAT_LABEL) as OdValueFormat[]).map((format) => <option key={format} value={format}>{FORMAT_LABEL[format]}</option>)}
                        </select>
                      </label>
                      <label className="oda-inline-field">
                        <span>Unidad</span>
                        <input value={c.unit ?? ""} placeholder="estudiantes, %, puntos" onChange={(e) => patchColumn(c.draftId, { unit: e.target.value })} />
                      </label>
                    </>
                  )}
                  {c.kind === "territorio" && (
                    <label className="oda-inline-field">
                      <span>Territorio</span>
                      <select value={c.territory ?? "departamento"} onChange={(e) => patchColumn(c.draftId, { territory: e.target.value as FreeTerritory })}>
                        {(Object.keys(TERRITORY_LABEL) as FreeTerritory[]).map((t) => <option key={t} value={t}>{TERRITORY_LABEL[t]}</option>)}
                      </select>
                    </label>
                  )}
                  <span className="oda-free-columns__tools">
                    <small>{c.fixed ? `clave ${c.key}` : "nueva"}</small>
                    <button type="button" className="icon-button" aria-label={`Subir ${c.label || `la columna ${index + 1}`}`} disabled={index === 0} onClick={() => move(index, -1)}>
                      <Icon name="chevron-down" size={15} style={{ transform: "rotate(180deg)" }} />
                    </button>
                    <button type="button" className="icon-button" aria-label={`Bajar ${c.label || `la columna ${index + 1}`}`} disabled={index === columns.length - 1} onClick={() => move(index, 1)}>
                      <Icon name="chevron-down" size={15} />
                    </button>
                    {data > 0 ? (
                      <ConfirmButton
                        label="Quitar"
                        confirmLabel={`Sus ${plural(data, "casilla con dato deja", "casillas con dato dejan")} de verse${using.length ? ` y ${using.map((v) => `«${v.title}»`).join(", ")} ${using.length === 1 ? "queda incompleta" : "quedan incompletas"}` : ""}.`}
                        onConfirm={() => setColumns(columns.filter((x) => x.draftId !== c.draftId))}
                      />
                    ) : (
                      <button type="button" className="icon-button" aria-label={`Quitar ${c.label || `la columna ${index + 1}`}`} onClick={() => setColumns(columns.filter((x) => x.draftId !== c.draftId))}>
                        <Icon name="close" size={15} />
                      </button>
                    )}
                  </span>
                  {kindChanged && (
                    <small className="oda-field-warning oda-free-columns__note">
                      Las casillas ya cargadas se leen ahora como {COLUMN_KIND_LABEL[c.kind].toLowerCase()}: revísalas en Captura.
                    </small>
                  )}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="button-ghost"
            onClick={() => setColumns([...columns, { key: "", label: "", kind: "cifra", format: "entero", draftId: newDraftId(), fixed: false }])}
          >
            <Icon name="plus" size={15} /> Añadir columna
          </button>
        </fieldset>
      </div>
      {problems.length > 0 && (
        <ul className="oda-paste__warning oda-free__problems">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <p className="oda-form-note">
        Texto da las categorías (sede, programa); cifra, los números que se dibujan; fecha, el inicio y el fin de un Gantt;
        territorio, el departamento o el país de un mapa. Las filas —y sus títulos de grupo y sus totales— se cargan en
        Captura, en la pestaña «Conjuntos libres», y allí mismo se arman las gráficas.
      </p>
      <div className="oda-inline-form__actions">
        <button type="button" className="button-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button-primary" disabled={problems.length > 0}>{initial ? "Guardar conjunto" : "Crear conjunto libre"}</button>
      </div>
    </form>
  );
}

/* --- Captura --------------------------------------------------------------------------- */

/** Resumen corto de un texto largo: para la clave de la rejilla, no para seguridad. */
const signature = (text: string) => {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33) ^ text.charCodeAt(i);
  return `${text.length}-${(hash >>> 0).toString(36)}`;
};

export function FreeSetCapture({ data, report, periodId, canEdit }: StationProps) {
  const sets = (data.rows.freeSets ?? []).filter((fs) => fs.report_id === report!.uuid).sort((a, b) => a.position - b.position);
  const [chosen, setChosen] = useState(sets[0]?.id ?? "");
  const set = sets.find((s) => s.id === chosen) ?? sets[0];
  if (!set) return <StageEmpty title="Este informe no tiene conjuntos libres">Créalos en Estructura, en Conjuntos visuales.</StageEmpty>;

  const rows = (data.rows.freeSetRows ?? []).filter((r) => r.set_id === set.id).sort((a, b) => a.position - b.position);
  const blocks = data.rows.blocks.filter((b) => b.report_id === report!.uuid && b.kind === "libre" && b.ref_id === set.id);
  const published = report!.status === "publicado";

  return (
    <div className="oda-stack">
      {sets.length > 1 && (
        <div className="oda-grid-toolbar">
          <label className="oda-grid-toolbar__field">
            <span>Conjunto</span>
            <select value={set.id} onChange={(e) => setChosen(e.target.value)}>
              {sets.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
        </div>
      )}
      <FreeRowsEditor
        key={`${set.id}-${signature(JSON.stringify([set.columns, set.temporality, rows]))}`}
        set={set}
        rows={rows}
        periodId={periodId}
        published={published}
        canEdit={canEdit}
      />
      <FreeViewsEditor key={`${set.id}-${signature(JSON.stringify(set.views))}`} set={set} blocks={blocks} published={published} canEdit={canEdit} />
    </div>
  );
}

/* --- 1. Filas ---------------------------------------------------------------------------- */

interface DraftRow {
  id: string;
  /** Texto del año. En conjuntos que no son anuales se conserva el guardado, sin mostrarlo. */
  year: string;
  /** Dato, título de grupo o total. */
  kind: FreeRowKind;
  /** Texto del título o del total; vacío en una fila de datos. */
  label: string;
  /** Texto de cada casilla, en el orden de las columnas. */
  cells: string[];
}

interface CellRead {
  value: FreeCell;
  error?: string;
  warning?: string;
}

const ROW_KIND_LABEL: Record<FreeRowKind, string> = {
  dato: "Dato",
  grupo: "Título de grupo",
  total: "Total",
};

let rowCounter = 0;
const newRowId = () => `fila-${(rowCounter += 1)}`;

const cellText = (cell: FreeCell | undefined) => (cell === null || cell === undefined ? "" : typeof cell === "number" ? editableText(cell) : String(cell));

/** Lee una casilla según el tipo de su columna. */
function readCell(column: FreeColumn, raw: string): CellRead {
  const text = raw.trim();
  if (!text) return { value: null };
  if (column.kind === "texto") return { value: text };
  if (column.kind === "cifra") {
    // parseNumber no admite negativos; una cascada sí los necesita (lo que resta).
    const negative = /^[-−]\s*\d/.test(text);
    const parsed = parseNumber(negative ? text.replace(/^[-−]\s*/, "") : text);
    if (!parsed.ok) return { value: null, error: parsed.reason };
    return { value: parsed.value === null ? null : negative ? -parsed.value : parsed.value };
  }
  if (column.kind === "fecha") {
    if (/^\d{4}$/.test(text)) return { value: text };
    const iso = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
    const local = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const [y, m, d] = iso ? [iso[1], iso[2], iso[3] ?? "1"] : local ? [local[3], local[2], local[1]] : ["", "", ""];
    const date = y ? new Date(Number(y), Number(m) - 1, Number(d)) : null;
    if (!date || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
      return { value: null, error: `"${text}" no es una fecha: usa 2025-03-01, 01/03/2025 o el año` };
    }
    return { value: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` };
  }
  const territory = column.territory ?? "departamento";
  return territoryCode(territory, text)
    ? { value: text }
    : { value: text, warning: `«${text}» no es un ${territory === "pais" ? "país" : "departamento"} conocido: se guarda el texto, pero no se ubica en el mapa` };
}

function readYear(raw: string): CellRead & { value: number | null } {
  const text = raw.trim();
  if (!text) return { value: null, warning: "sin año: la fila no se ve en el portal hasta ponerle uno" };
  const year = Number(text);
  if (!/^\d{4}$/.test(text) || year < 1900 || year > 2200) return { value: null, error: `"${text}" no es un año` };
  return { value: year };
}

/** Una fila de datos sin nada escrito; los títulos y los totales nunca están en blanco. */
const isBlank = (row: DraftRow, anual: boolean) =>
  row.kind === "dato" && (!anual || !row.year.trim()) && row.cells.every((c) => !c.trim());

function FreeRowsEditor({ set, rows, periodId, published, canEdit }: {
  set: OdFreeSetRow; rows: OdFreeSetRecordRow[]; periodId: string; published: boolean; canEdit: boolean;
}) {
  const save = useReplaceFreeSetRows();
  const anual = set.temporality === "anual";
  const columns = set.columns;
  const initial = useMemo<DraftRow[]>(
    () =>
      rows.map((r) => ({
        id: newRowId(), year: r.year === null ? "" : String(r.year), kind: r.kind ?? "dato", label: r.label ?? "",
        cells: columns.map((c) => cellText(r.cells[c.key])),
      })),
    // Sin dependencias: la rejilla se monta de nuevo (key) cuando cambian las filas guardadas.
    [],
  );
  const emptyRow = (kind: FreeRowKind = "dato"): DraftRow => ({ id: newRowId(), year: "", kind, label: "", cells: columns.map(() => "") });
  const [draft, setDraft] = useState<DraftRow[]>(() => (initial.length ? initial : [emptyRow()]));
  const [via, setVia] = useState<"rejilla" | "pegado">("rejilla");
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const refs = useRef(new Map<string, HTMLInputElement>());

  /** Campos de la rejilla: el año primero en los anuales, después las columnas. */
  const fields = [...(anual ? [{ label: "Año", kind: "anio" as const }] : []), ...columns.map((c) => ({ label: c.label, kind: c.kind }))];
  const offset = anual ? 1 : 0;
  const textAt = (row: DraftRow, field: number) => (anual && field === 0 ? row.year : row.cells[field - offset] ?? "");
  const withText = (row: DraftRow, field: number, text: string): DraftRow =>
    anual && field === 0 ? { ...row, year: text } : { ...row, cells: row.cells.map((c, i) => (i === field - offset ? text : c)) };

  const cellsOf = (row: DraftRow) => Object.fromEntries(columns.map((c, i) => [c.key, readCell(c, row.cells[i] ?? "").value])) as Record<string, FreeCell>;

  const outputOf = (list: DraftRow[]) =>
    list
      .filter((row) => !isBlank(row, anual))
      .map((row) => {
        // En un conjunto que no es anual el año guardado se conserva tal cual.
        const stored = /^\d{4}$/.test(row.year.trim()) ? Number(row.year.trim()) : null;
        return {
          year: anual ? readYear(row.year).value : stored,
          kind: row.kind,
          label: row.kind === "dato" ? "" : row.label.trim(),
          // El total lo calcula el portal sobre las filas de su grupo; se guarda sin casillas.
          cells: row.kind === "dato" ? cellsOf(row) : {},
        };
      });
  const baseline = useMemo(() => JSON.stringify(outputOf(initial)), [initial]);

  const reads = draft.map((row) => ({ year: anual ? readYear(row.year) : null, cells: columns.map((c, i) => readCell(c, row.cells[i] ?? "")) }));
  /** La fuente tal como la leería el portal, para calcular los totales en vivo. */
  const asRows: FreeRow[] = draft.map((row) => ({
    year: anual ? readYear(row.year).value : null,
    kind: row.kind,
    label: row.label.trim(),
    cells: row.kind === "dato" ? cellsOf(row) : {},
  }));
  const totalAt = (index: number) => freeTotalAt(asRows, index, columns);

  const errors: string[] = [];
  const warnings: string[] = [];
  draft.forEach((row, ri) => {
    if (row.kind !== "dato") {
      if (!row.label.trim()) {
        errors.push(
          row.kind === "grupo"
            ? `Fila ${ri + 1}: un título de grupo necesita su texto (por ejemplo, «Ciencias de la Salud»).`
            : `Fila ${ri + 1}: un total necesita su texto (por ejemplo, «Total Bucaramanga»).`,
        );
      }
      if (row.kind === "total" && totalAt(ri).count === 0) {
        errors.push(`Fila ${ri + 1}: el total no tiene filas de datos encima en su grupo; muévelo o añade filas antes.`);
      }
      return;
    }
    if (isBlank(row, anual)) return;
    const note = (label: string, cell: CellRead | null) => {
      if (cell?.error) errors.push(`Fila ${ri + 1} · ${label}: ${cell.error}.`);
      if (cell?.warning) warnings.push(`Fila ${ri + 1} · ${label}: ${cell.warning}.`);
    };
    note("Año", reads[ri].year);
    reads[ri].cells.forEach((cell, ci) => note(columns[ci].label, cell));
  });
  const output = outputOf(draft);
  const dirty = JSON.stringify(output) !== baseline;
  const canSave = canEdit && dirty && errors.length === 0 && !save.isPending;

  const change = (next: DraftRow[]) => {
    setDraft(next);
    setConfirming(false);
  };
  const patchRow = (id: string, patch: Partial<DraftRow>) => change(draft.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) => {
    const next = [...draft];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item);
    change(next);
  };
  const duplicate = (index: number) => {
    const next = [...draft];
    next.splice(index + 1, 0, { ...draft[index], id: newRowId() });
    change(next);
  };

  /**
   * Reparte un rango pegado desde la fila y el campo dados. Si la primera fila
   * trae los nombres de las columnas, cada columna pegada va a la suya por
   * nombre; si no, en orden desde el campo de partida. Lo pegado siempre son
   * filas de datos: los títulos y los totales que haya en medio se saltan.
   */
  const applyGrid = (grid: string[][], base: DraftRow[], startRow: number, startField: number) => {
    const lines = grid.filter((line) => line.some((cell) => cell.trim() !== ""));
    if (!lines.length) return;
    const names = fields.map((field) => fold(field.label));
    const head = lines[0].map((cell) => fold(cell));
    const filledHead = head.filter(Boolean);
    const mapped = head.map((cell) => (cell ? names.indexOf(cell) : -1));
    const matches = mapped.filter((i) => i >= 0).length;
    const byName = filledHead.length > 0 && matches === filledHead.length && matches >= Math.min(2, fields.length);
    const body = byName ? lines.slice(1) : lines;
    const target = (dc: number) => (byName ? mapped[dc] : startField + dc);

    const next = [...base];
    let cursor = startRow;
    for (const line of body) {
      while (next[cursor] && next[cursor].kind !== "dato") cursor += 1;
      while (next.length <= cursor) next.push(emptyRow());
      let row = next[cursor];
      line.forEach((raw, dc) => {
        const field = target(dc);
        if (field === undefined || field < 0 || field >= fields.length) return;
        row = withText(row, field, raw.trim());
      });
      next[cursor] = row;
      cursor += 1;
    }
    change(next);
    setVia("pegado");
    setPasteNote(
      `${plural(body.length, "fila pegada", "filas pegadas")} ${byName ? "con encabezados: cada columna fue a la suya por nombre" : `desde la columna «${fields[startField]?.label}»`}.`,
    );
  };

  const onCellPaste = (event: ClipboardEvent<HTMLInputElement>, ri: number, field: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text)) return;
    event.preventDefault();
    applyGrid(parseClipboardGrid(text), draft, ri, field);
  };

  const readPasted = (text: string) => (text.includes("\t") ? parseClipboardGrid(text) : parseCsv(text));
  const kept = draft.filter((row) => !isBlank(row, anual));
  const dataRows = kept.filter((row) => row.kind === "dato");

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, ri: number, field: number) => {
    if (event.key !== "Enter" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const up = event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey);
    const target = ri + (up ? -1 : 1);
    if (target < 0) return;
    if (target >= draft.length) {
      if (event.key !== "Enter") return;
      const next = [...draft, emptyRow()];
      change(next);
      requestAnimationFrame(() => refs.current.get(`${next[target].id}|${field}`)?.focus());
      return;
    }
    refs.current.get(`${draft[target].id}|${field}`)?.focus();
  };

  const apply = () => {
    setConfirming(false);
    save.mutate({ periodId, reportId: set.report_id, setId: set.id, rows: output, kind: via });
  };

  /** Las cifras que tendrá una fila de total, en palabras: se calculan al publicar. */
  const totalPreview = (index: number) => {
    const { cells, basis, count } = totalAt(index);
    const parts = columns
      .filter((c) => c.kind === "cifra" && cells[c.key] !== null && cells[c.key] !== undefined)
      .map((c) => `${c.label} ${formatValue(cells[c.key] as number, c.format ?? "entero")} (${basis[c.key] === "promedio" ? "promedio" : "suma"})`);
    if (!count) return "sin filas de datos encima: el total no se puede calcular";
    return `${plural(count, "fila de datos", "filas de datos")}: ${parts.join(" · ") || "sin columnas de cifra"}`;
  };

  return (
    <Panel
      id="oda-libre-filas"
      title={set.title}
      description={
        <>
          Las filas de la fuente se cargan aquí: añádelas, duplícalas, ordénalas, agrúpalas con un título y ciérralas con un
          total. Las columnas se definen en Estructura. {TEMPORALITY_LABEL[set.temporality]}
          {set.temporality === "periodo" && set.period_label ? ` (${set.period_label})` : ""}. Vacío es «sin dato», nunca cero.
        </>
      }
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          {dirty && (
            <button type="button" className="button-ghost" onClick={() => { change(initial.length ? initial : [emptyRow()]); setPasteNote(null); setVia("rejilla"); }}>
              Descartar
            </button>
          )}
        </>
      }
    >
      {columns.length === 0 ? (
        <StageEmpty title="El conjunto no tiene columnas">Defínelas en Estructura, en Conjuntos visuales.</StageEmpty>
      ) : (
        <div className="oda-free">
          <details className="oda-paste">
            <summary>
              <Icon name="table" size={15} /> Pegar un rango de Excel
            </summary>
            <div className="oda-paste__body">
              <p className="oda-muted">
                Copia las filas en Excel y pégalas aquí. Si la primera fila trae los nombres de las columnas
                ({fields.map((field) => field.label).join(", ")}), cada columna va a la suya; si no, se toman en ese orden.
                Lo pegado siempre son filas de datos: «Añadir al final» respeta los títulos y los totales que ya haya.
                También puedes pegar directamente en una casilla de la rejilla.
              </p>
              <textarea
                className="oda-paste__area"
                aria-label="Rango copiado de Excel"
                placeholder="Pega aquí (Ctrl+V)."
                value={pasteText}
                disabled={!canEdit}
                rows={pasteText ? 4 : 3}
                spellCheck={false}
                onChange={(e) => setPasteText(e.target.value)}
              />
              {pasteText.trim() && (
                <div className="oda-paste__actions">
                  <button type="button" className="button-secondary" onClick={() => { applyGrid(readPasted(pasteText), [], 0, 0); setPasteText(""); }}>
                    Reemplazar las filas
                  </button>
                  <button type="button" className="button-ghost" onClick={() => { applyGrid(readPasted(pasteText), kept, kept.length, 0); setPasteText(""); }}>
                    Añadir al final
                  </button>
                  <small>Nada se guarda hasta pulsar Guardar.</small>
                </div>
              )}
            </div>
          </details>
          {pasteNote && <p className="oda-import__ok" role="status"><Icon name="check" size={14} /> {pasteNote}</p>}

          <div className="oda-grid-wrap" role="region" aria-label={`Filas de ${set.title}, desplazable`} tabIndex={-1}>
            <table className="oda-grid oda-free-grid">
              <caption className="sr-only">Filas de {set.title}</caption>
              <thead>
                <tr>
                  <th scope="col">Fila</th>
                  {fields.map((field, fi) => {
                    const column = fi >= offset ? columns[fi - offset] : null;
                    return (
                      <th key={column?.key ?? "anio"} scope="col" data-kind={field.kind}>
                        {field.label}
                        {column && <small>{column.kind === "cifra" ? column.unit || FORMAT_LABEL[column.format ?? "entero"].toLowerCase() : COLUMN_KIND_LABEL[column.kind].split(" ")[0].toLowerCase()}</small>}
                      </th>
                    );
                  })}
                  <th scope="col"><span className="sr-only">Mover, duplicar o quitar la fila</span></th>
                </tr>
              </thead>
              <tbody>
                {draft.map((row, ri) => {
                  const named = row.label.trim() || `la fila ${ri + 1}`;
                  return (
                    <tr key={row.id} data-row-kind={row.kind}>
                      <th scope="row">
                        <span className="oda-free-grid__pos">{ri + 1}</span>
                        <select
                          className="oda-free-grid__kind"
                          value={row.kind}
                          disabled={!canEdit}
                          aria-label={`Tipo de la fila ${ri + 1}`}
                          onChange={(e) => patchRow(row.id, { kind: e.target.value as FreeRowKind })}
                        >
                          {(Object.keys(ROW_KIND_LABEL) as FreeRowKind[]).map((kind) => <option key={kind} value={kind}>{ROW_KIND_LABEL[kind]}</option>)}
                        </select>
                      </th>
                      {row.kind === "dato" ? (
                        fields.map((field, fi) => {
                          const read = anual && fi === 0 ? reads[ri].year : reads[ri].cells[fi - offset];
                          const blank = isBlank(row, anual);
                          const error = blank ? undefined : read?.error;
                          const warning = blank ? undefined : read?.warning;
                          const text = textAt(row, fi);
                          const refKey = `${row.id}|${fi}`;
                          return (
                            <td
                              key={refKey}
                              data-kind={field.kind}
                              data-empty={!text.trim() || undefined}
                              data-error={error ? true : undefined}
                              data-warning={!error && warning ? true : undefined}
                              title={error ?? warning}
                            >
                              <input
                                ref={(node) => {
                                  if (node) refs.current.set(refKey, node);
                                  else refs.current.delete(refKey);
                                }}
                                value={text}
                                readOnly={!canEdit}
                                inputMode={field.kind === "cifra" || field.kind === "anio" ? "decimal" : undefined}
                                aria-label={`Fila ${ri + 1}, ${field.label}`}
                                aria-invalid={error ? true : undefined}
                                placeholder="—"
                                onChange={(e) => change(draft.map((r) => (r.id === row.id ? withText(r, fi, e.target.value) : r)))}
                                onKeyDown={(e) => onKeyDown(e, ri, fi)}
                                onPaste={(e) => onCellPaste(e, ri, fi)}
                              />
                            </td>
                          );
                        })
                      ) : (
                        <td className="oda-free-grid__label" colSpan={fields.length} data-error={!row.label.trim() || undefined}>
                          <input
                            value={row.label}
                            readOnly={!canEdit}
                            aria-label={`Fila ${ri + 1}, ${ROW_KIND_LABEL[row.kind].toLowerCase()}`}
                            aria-invalid={!row.label.trim() || undefined}
                            placeholder={row.kind === "grupo" ? "Ciencias de la Salud" : "Total Bucaramanga"}
                            onChange={(e) => patchRow(row.id, { label: e.target.value })}
                          />
                          <small>
                            {row.kind === "grupo"
                              ? "Título: agrupa las filas que siguen, hasta el próximo título. No entra en las gráficas."
                              : `Se calcula al publicar sobre ${totalPreview(ri)}.`}
                          </small>
                        </td>
                      )}
                      <td className="oda-free-grid__tools">
                        <button type="button" className="icon-button" aria-label={`Subir ${named}`} disabled={!canEdit || ri === 0} onClick={() => move(ri, -1)}>
                          <Icon name="chevron-down" size={14} style={{ transform: "rotate(180deg)" }} />
                        </button>
                        <button type="button" className="icon-button" aria-label={`Bajar ${named}`} disabled={!canEdit || ri === draft.length - 1} onClick={() => move(ri, 1)}>
                          <Icon name="chevron-down" size={14} />
                        </button>
                        <button type="button" className="oda-link-button" disabled={!canEdit} onClick={() => duplicate(ri)}>
                          <span className="sr-only">Duplicar {named}</span>
                          <span aria-hidden="true">Duplicar</span>
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Quitar ${named}`}
                          disabled={!canEdit}
                          onClick={() => change(draft.length > 1 ? draft.filter((r) => r.id !== row.id) : [emptyRow()])}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="oda-grid-toolbar">
            <button type="button" className="button-secondary" disabled={!canEdit} onClick={() => change([...draft, emptyRow()])}>
              <Icon name="plus" size={15} /> Añadir fila
            </button>
            <button type="button" className="button-ghost" disabled={!canEdit} onClick={() => change([...draft, emptyRow("grupo")])}>
              <Icon name="plus" size={15} /> Añadir título de grupo
            </button>
            <button type="button" className="button-ghost" disabled={!canEdit} onClick={() => change([...draft, emptyRow("total")])}>
              <Icon name="plus" size={15} /> Añadir total
            </button>
            <span className="oda-muted">
              {plural(dataRows.length, "fila con datos", "filas con datos")}
              {kept.length > dataRows.length ? ` · ${plural(kept.length - dataRows.length, "título o total", "títulos y totales")}` : ""}
            </span>
          </div>

          <PasteMessages errors={errors} warnings={warnings} />

          <footer className="oda-import__apply">
            <p>
              <Icon name="alert" size={15} />
              <span>
                Guardar <strong>reemplaza todas las filas</strong> de «{set.title}» por las de la rejilla.
                {errors.length > 0 ? " Corrige lo marcado en rojo para poder guardar." : ""}
                {published ? " El informe está publicado: el cambio se ve en el portal de inmediato." : ""}
              </span>
            </p>
            <div className="oda-import__actions">
              {!confirming || !canSave ? (
                <button type="button" className="button-primary" disabled={!canSave} onClick={() => setConfirming(true)}>
                  Guardar {plural(output.length, "fila", "filas")}
                </button>
              ) : (
                <span className="oda-confirm" role="group" aria-label="Confirmar el reemplazo de las filas">
                  <span>
                    Las {plural(output.length, "fila", "filas")} de «{set.title}» se reemplazan {published ? "en el portal" : "en el borrador"}.
                  </span>
                  <button type="button" className="button-primary" onClick={apply}>Sí, reemplazar</button>
                  <button type="button" className="oda-link-button" onClick={() => setConfirming(false)}>Cancelar</button>
                </span>
              )}
            </div>
          </footer>
        </div>
      )}
    </Panel>
  );
}

/* --- 2. Gráficas (vistas) ------------------------------------------------------------------ */

const TYPE_GROUPS: { label: string; types: FreeChartType[] }[] = [
  { label: "Comparar", types: ["barras", "barras_apiladas", "barras_100", "radar"] },
  { label: "Reparto", types: ["circular", "dona", "cascada"] },
  { label: "Distribución", types: ["histograma", "caja"] },
  { label: "Tiempo", types: ["lineas", "area", "gantt"] },
  { label: "Territorio", types: ["mapa"] },
  { label: "Otros", types: ["cifras", "tabla"] },
];

const BARS: FreeChartType[] = ["barras", "barras_apiladas", "barras_100"];
const SORTABLE: FreeChartType[] = ["barras", "barras_apiladas", "barras_100", "circular", "dona"];
const SORT_LABEL: Record<NonNullable<FreeView["sort"]>, string> = {
  fuente: "Como vienen en la fuente",
  desc: "De mayor a menor",
  asc: "De menor a mayor",
};

/** Solo los campos que usa el tipo de gráfica: cambiar de tipo no deja restos. */
function cleanView(v: FreeView): FreeView {
  const spec = CHART_TYPES[v.type];
  const out: FreeView = { key: v.key, title: v.title.trim(), type: v.type };
  if (v.description?.trim()) out.description = v.description.trim();
  if (spec.category !== "ninguna" && v.category) out.category = v.category;
  if (spec.series !== "ninguna" && v.series?.length) out.series = spec.series === "una" ? v.series.slice(0, 1) : v.series;
  if (BARS.includes(v.type)) out.orientation = v.orientation ?? "vertical";
  if (SORTABLE.includes(v.type) && v.sort && v.sort !== "fuente") out.sort = v.sort;
  if (v.type === "histograma" && v.bins) out.bins = v.bins;
  if (spec.dates) {
    if (v.start) out.start = v.start;
    if (v.end) out.end = v.end;
  }
  if (v.type === "cascada") out.total = Boolean(v.total);
  return out;
}

const asFreeSet = (set: OdFreeSetRow): FreeSet => ({
  id: set.key, uuid: set.id, title: set.title, description: set.description, source: "", officeId: set.office_id,
  temporality: set.temporality, periodLabel: set.period_label, columns: set.columns, rows: [], views: set.views,
});

function FreeViewsEditor({ set, blocks, published, canEdit }: {
  set: OdFreeSetRow; blocks: OdReportBlockRow[]; published: boolean; canEdit: boolean;
}) {
  const save = useSaveFreeSet();
  const [editing, setEditing] = useState<string | null>(null);
  const views = set.views;
  const freeSet = asFreeSet(set);
  const saveViews = (next: FreeView[]) => save.mutate({ id: set.id, report_id: set.report_id, views: next }, { onSuccess: () => setEditing(null) });
  const showing = (key: string) => blocks.filter((b) => b.settings.view === key).length;

  return (
    <Panel
      id="oda-libre-vistas"
      title={`Gráficas de «${set.title}» (${views.length})`}
      description="Cada gráfica lee las columnas de este conjunto. En Diseño visual se decide qué bloque muestra una gráfica o todas; un bloque sin gráfica elegida las muestra todas, en este orden."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button type="button" className="button-secondary" disabled={!canEdit || set.columns.length === 0} onClick={() => setEditing("nueva")}>
            <Icon name="plus" size={15} /> Nueva gráfica
          </button>
        </>
      }
    >
      {editing === "nueva" && (
        <ViewForm set={freeSet} takenKeys={views.map((v) => v.key)} onCancel={() => setEditing(null)} onSubmit={(view) => saveViews([...views, view])} />
      )}
      <ul className="oda-datasets">
        {views.map((view, index) => {
          const problems = viewProblems(freeSet, view);
          const used = showing(view.key);
          return (
            <li key={view.key} className="oda-dataset" data-editing={editing === view.key || undefined}>
              <div className="oda-dataset__row">
                <span className="oda-badge">{CHART_TYPES[view.type]?.label ?? view.type}</span>
                <strong>{view.title}</strong>
                <small>
                  {problems.length ? (
                    <span className="oda-badge" data-tone="warn"><Icon name="alert" size={12} /> {problems[0]}</span>
                  ) : used ? (
                    `en ${plural(used, "bloque propio", "bloques propios")}`
                  ) : (
                    "lista"
                  )}
                </small>
                <span className="oda-table__actions">
                  <button type="button" className="icon-button" aria-label={`Subir ${view.title}`} disabled={!canEdit || index === 0 || save.isPending}
                    onClick={() => { const next = [...views]; next.splice(index - 1, 0, next.splice(index, 1)[0]); saveViews(next); }}>
                    <Icon name="chevron-down" size={15} style={{ transform: "rotate(180deg)" }} />
                  </button>
                  <button type="button" className="oda-link-button" disabled={!canEdit} onClick={() => setEditing(view.key)}>Editar</button>
                  {canEdit && (
                    <ConfirmButton
                      label="Borrar"
                      confirmLabel={
                        !used
                          ? "¿Borrar la gráfica?"
                          : used === blocks.length
                            ? `«${view.title}» sale de ${published ? "la ficha publicada" : "la ficha"}: ${used === 1 ? "su bloque pasa" : "uno de sus bloques pasa"} a mostrar todas las gráficas del conjunto${used > 1 ? " y los demás se quitan" : ""}.`
                            : `«${view.title}» sale de ${published ? "la ficha publicada" : "la ficha"}: ${used === 1 ? "su bloque se quita" : `sus ${used} bloques se quitan`}.`
                      }
                      onConfirm={() => saveViews(views.filter((v) => v.key !== view.key))}
                    />
                  )}
                </span>
              </div>
              {editing === view.key && (
                <ViewForm
                  set={freeSet}
                  initial={view}
                  takenKeys={views.map((v) => v.key)}
                  onCancel={() => setEditing(null)}
                  onSubmit={(next) => saveViews(views.map((v) => (v.key === view.key ? next : v)))}
                />
              )}
            </li>
          );
        })}
        {views.length === 0 && editing !== "nueva" && (
          <li className="oda-muted">Este conjunto todavía no tiene gráficas: la ficha no muestra nada de él hasta crear una.</li>
        )}
      </ul>
    </Panel>
  );
}

function ViewForm({ set, initial, takenKeys, onSubmit, onCancel }: {
  set: FreeSet; initial?: FreeView; takenKeys: string[]; onSubmit: (view: FreeView) => void; onCancel: () => void;
}) {
  const [v, setV] = useState<FreeView>(initial ?? { key: "", title: "", type: "barras" });
  const patch = (change: Partial<FreeView>) => setV({ ...v, ...change });
  const spec = CHART_TYPES[v.type];
  const view = cleanView(v);
  const problems = [...(view.title ? [] : ["Ponle un título."]), ...viewProblems(set, view)];

  const numbers = set.columns.filter((c) => c.kind === "cifra");
  const dates = set.columns.filter((c) => c.kind === "fecha");
  const categories = set.columns.filter((c) => (spec.category === "territorio" ? c.kind === "territorio" : c.kind === "texto" || c.kind === "territorio"));
  const series = v.series ?? [];

  const submit = () => {
    if (problems.length) return;
    onSubmit({ ...view, key: initial?.key ?? uniqueSlug(view.title, takenKeys, "grafica") });
  };

  return (
    <form className="oda-inline-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="oda-form-grid">
        <label className="admin-field admin-field--wide">
          <span>Título de la gráfica</span>
          <input autoFocus value={v.title} placeholder="Estudiantes y docentes por sede" onChange={(e) => patch({ title: e.target.value })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Descripción <small>opcional</small></span>
          <input value={v.description ?? ""} placeholder="Qué se lee en ella" onChange={(e) => patch({ description: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>Tipo</span>
          <select value={v.type} onChange={(e) => patch({ type: e.target.value as FreeChartType })}>
            {TYPE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.types.map((type) => <option key={type} value={type}>{CHART_TYPES[type].label}</option>)}
              </optgroup>
            ))}
          </select>
          <small className="oda-field-hint">{spec.hint}</small>
        </label>

        {spec.category !== "ninguna" && (
          <label className="admin-field">
            <span>{v.type === "gantt" ? "Tareas" : v.type === "mapa" ? "Territorio" : v.type === "caja" ? "Grupos" : "Categorías"}</span>
            <select value={v.category ?? ""} onChange={(e) => patch({ category: e.target.value || undefined })}>
              <option value="">{spec.category === "opcional" ? (v.type === "caja" ? "Sin grupos: una sola caja" : "Sin categoría") : "Elige una columna…"}</option>
              {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
        )}

        {spec.series === "una" && (
          <label className="admin-field">
            <span>Cifra</span>
            <select value={series[0] ?? ""} onChange={(e) => patch({ series: e.target.value ? [e.target.value] : [] })}>
              <option value="">Elige una columna…</option>
              {numbers.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
        )}

        {spec.series === "varias" && (
          <fieldset className="admin-field--wide oda-free-fieldset oda-free-series">
            <legend>Cifras{v.type === "radar" ? " (una por eje, al menos tres)" : ""}</legend>
            {numbers.length === 0 && <small className="oda-muted">El conjunto no tiene columnas de cifra.</small>}
            {numbers.map((c) => (
              <label key={c.key} className="oda-check">
                <input
                  type="checkbox"
                  checked={series.includes(c.key)}
                  onChange={(e) =>
                    patch({ series: e.target.checked ? numbers.map((n) => n.key).filter((k) => k === c.key || series.includes(k)) : series.filter((k) => k !== c.key) })
                  }
                />
                {c.label}
              </label>
            ))}
          </fieldset>
        )}

        {BARS.includes(v.type) && (
          <label className="admin-field">
            <span>Orientación</span>
            <select value={v.orientation ?? "vertical"} onChange={(e) => patch({ orientation: e.target.value as FreeView["orientation"] })}>
              <option value="vertical">Barras verticales</option>
              <option value="horizontal">Barras horizontales</option>
            </select>
          </label>
        )}

        {SORTABLE.includes(v.type) && (
          <label className="admin-field">
            <span>Orden</span>
            <select value={v.sort ?? "fuente"} onChange={(e) => patch({ sort: e.target.value as FreeView["sort"] })}>
              {(Object.keys(SORT_LABEL) as NonNullable<FreeView["sort"]>[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </select>
          </label>
        )}

        {v.type === "histograma" && (
          <label className="admin-field">
            <span>Tramos <small>vacío: se calculan solos</small></span>
            <input type="number" min={1} max={40} value={v.bins ?? ""} onChange={(e) => patch({ bins: e.target.value ? Math.max(1, Math.min(40, Number(e.target.value))) : undefined })} />
          </label>
        )}

        {spec.dates && (
          <>
            <label className="admin-field">
              <span>Inicio</span>
              <select value={v.start ?? ""} onChange={(e) => patch({ start: e.target.value || undefined })}>
                <option value="">Elige una columna de fecha…</option>
                {dates.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span>Fin</span>
              <select value={v.end ?? ""} onChange={(e) => patch({ end: e.target.value || undefined })}>
                <option value="">Elige una columna de fecha…</option>
                {dates.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          </>
        )}

        {v.type === "cascada" && (
          <label className="oda-inline-check admin-field--wide">
            <input type="checkbox" checked={Boolean(v.total)} onChange={(e) => patch({ total: e.target.checked })} />
            <span>Añadir la barra del total al final</span>
          </label>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="oda-paste__warning oda-free__problems" aria-live="polite">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="oda-inline-form__actions">
        <button type="button" className="button-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button-primary" disabled={problems.length > 0}>{initial ? "Guardar gráfica" : "Crear gráfica"}</button>
      </div>
    </form>
  );
}
