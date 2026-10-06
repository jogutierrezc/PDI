/* =============================================================================
   Medallero en la intranet.

   · MedalBoardForm (Estructura): qué medallero es, cómo se llama su columna de
     filas, qué categorías de medalla reparte y cómo se ordena.
   · MedalCapture (Captura): las filas de un corte. Una fila por competencia
     —o por campus, o por disciplina: lo decide quien lo monta— con cuántas
     medallas de cada categoría.

   Dos cosas que el editor no deja hacer, a propósito:

   · Cambiar el rótulo de una categoría no cambia su clave. Las cifras ya
     capturadas cuelgan de la clave; si se renombrara, «Oro» pasaría a
     «Primer puesto» y los tres oros de 2024 se quedarían huérfanos.
   · Una casilla vacía no se guarda como cero. Vacío es «no compitió» y cero es
     «compitió y no ganó»: son cosas distintas y la ficha las dibuja distinto,
     así que el editor tiene que poder decir las dos.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdMedalBoardRow } from "../../../../types/database";
import {
  DEFAULT_TIERS,
  MAX_TIERS,
  MEDAL_REPORTING,
  MEDAL_SCOPE,
  MEDAL_SORT,
  orderedTiers,
} from "../../../datos-abiertos/data/medals";
import type { MedalReporting, MedalScope, MedalSort, MedalTier } from "../../../datos-abiertos/data/medals";
import type { StationProps } from "../OdAdmin";
import { useSaveMedalEntries } from "../od-data";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../ui";
import { useReorder, moved } from "../../components/reorder";
import { parseNumber } from "../sheet";

/** Lo escrito en una casilla de medallas. Vacío es «no compitió», no un cero. */
const countOf = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const parsed = parseNumber(raw);
  return parsed.ok && parsed.value !== null ? Math.max(0, Math.round(parsed.value)) : null;
};

/* --- Estructura: definir un medallero ------------------------------------------- */

export interface MedalBoardFields {
  title: string;
  description: string;
  row_label: string;
  reporting: MedalReporting;
  scope: MedalScope;
  fixed_year: string;
  sort: MedalSort;
  tiers: MedalTier[];
  note: string;
  office_id: string;
}

/** Clave estable de una categoría. Se calcula al crearla y ya no se toca. */
const tierKey = (label: string, taken: string[]) => {
  const base =
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "categoria";
  let key = base;
  let n = 2;
  while (taken.includes(key)) key = `${base}-${n++}`;
  return key;
};

export function MedalBoardForm({
  offices,
  initial,
  onSubmit,
  onCancel,
}: {
  offices: StationProps["data"]["rows"]["offices"];
  initial?: Partial<MedalBoardFields>;
  onSubmit: (fields: MedalBoardFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<MedalBoardFields>({
    title: "",
    description: "",
    row_label: "Competencia",
    reporting: "anual",
    scope: "por_ano",
    fixed_year: "",
    sort: "medallero",
    tiers: DEFAULT_TIERS,
    note: "",
    office_id: "",
    ...initial,
  });
  const set = (patch: Partial<MedalBoardFields>) => setF({ ...f, ...patch });

  const setTier = (index: number, label: string) =>
    set({ tiers: f.tiers.map((t, i) => (i === index ? { ...t, label } : t)) });

  const addTier = () => {
    if (f.tiers.length >= MAX_TIERS) return;
    const label = `Categoría ${f.tiers.length + 1}`;
    set({
      tiers: [...f.tiers, { key: tierKey(label, f.tiers.map((t) => t.key)), label, position: f.tiers.length + 1 }],
    });
  };

  const dropTier = (index: number) =>
    set({ tiers: f.tiers.filter((_, i) => i !== index).map((t, i) => ({ ...t, position: i + 1 })) });

  const valid = f.title.trim() && f.row_label.trim() && f.tiers.length > 0 && f.tiers.every((t) => t.label.trim());

  return (
    <form
      className="oda-inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(f);
      }}
    >
      <div className="oda-form-grid">
        <label className="admin-field">
          <span>Nombre del medallero</span>
          <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Juegos Universitarios ASCUN" required />
        </label>

        <label className="admin-field">
          <span>Cabecera de la primera columna</span>
          <input value={f.row_label} onChange={(e) => set({ row_label: e.target.value })} placeholder="Competencia" required />
          <small className="oda-field-hint">
            Qué compara cada fila: «Competencia» si cada fila es un juego, «Campus» si compiten las sedes,
            «Disciplina» si son modalidades de unos mismos juegos.
          </small>
        </label>

        <label className="admin-field admin-field--wide">
          <span>Descripción <small>opcional</small></span>
          <input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Participación de la UDES en la fase nacional" />
        </label>

        <label className="admin-field">
          <span>Cómo reporta</span>
          <select value={f.reporting} onChange={(e) => set({ reporting: e.target.value as MedalReporting })}>
            {(Object.keys(MEDAL_REPORTING) as MedalReporting[]).map((key) => (
              <option key={key} value={key}>
                {MEDAL_REPORTING[key]}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-field">
          <span>Qué enseña la ficha</span>
          <select value={f.scope} onChange={(e) => set({ scope: e.target.value as MedalScope })}>
            {(Object.keys(MEDAL_SCOPE) as MedalScope[]).map((key) => (
              <option key={key} value={key}>
                {MEDAL_SCOPE[key].label}
              </option>
            ))}
          </select>
          <small className="oda-field-hint">{MEDAL_SCOPE[f.scope].hint}</small>
        </label>

        {f.scope === "por_ano" && (
          <label className="admin-field">
            <span>Año con el que abre <small>opcional</small></span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={f.fixed_year}
              onChange={(e) => set({ fixed_year: e.target.value })}
              placeholder="El último con dato"
            />
            <small className="oda-field-hint">
              Déjalo vacío y abre con el último año capturado. Ponle un año y abre siempre por ese, mientras tenga dato.
            </small>
          </label>
        )}

        <label className="admin-field">
          <span>Orden de las filas</span>
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value as MedalSort })}>
            {(Object.keys(MEDAL_SORT) as MedalSort[]).map((key) => (
              <option key={key} value={key}>
                {MEDAL_SORT[key].label}
              </option>
            ))}
          </select>
          <small className="oda-field-hint">{MEDAL_SORT[f.sort].hint}</small>
        </label>

        <label className="admin-field">
          <span>Oficina que reporta <small>opcional</small></span>
          <select value={f.office_id} onChange={(e) => set({ office_id: e.target.value })}>
            <option value="">Sin oficina</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="oda-tiers">
        <legend>Categorías de medalla</legend>
        <p className="oda-field-hint">
          De la más alta a la más baja: la primera es la que manda en el orden del medallero. Las tres primeras se
          dibujan en oro, plata y bronce; de la cuarta en adelante, con su nombre y sin metal.
        </p>
        <ol className="oda-tiers__list">
          {f.tiers.map((tier, index) => (
            <li key={tier.key} className="oda-tiers__item">
              <span className="oda-tiers__rank" data-metal={index < 3 ? String(index + 1) : "rest"}>
                {index + 1}
              </span>
              <input
                value={tier.label}
                onChange={(e) => setTier(index, e.target.value)}
                aria-label={`Nombre de la categoría ${index + 1}`}
                required
              />
              {f.tiers.length > 1 && (
                <button type="button" className="oda-icon-button" onClick={() => dropTier(index)} aria-label={`Quitar ${tier.label}`}>
                  <Icon name="close" size={15} />
                </button>
              )}
            </li>
          ))}
        </ol>
        {f.tiers.length < MAX_TIERS && (
          <button type="button" className="button-secondary" onClick={addTier}>
            <Icon name="plus" size={15} /> Otra categoría
          </button>
        )}
      </fieldset>

      <div className="oda-inline-form__actions">
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="button-primary" disabled={!valid}>
          Guardar medallero
        </button>
      </div>
    </form>
  );
}

/* --- Captura: las filas de un corte ---------------------------------------------- */

interface DraftRow {
  /** Identidad estable mientras se edita: el rótulo cambia mientras se escribe. */
  uid: string;
  label: string;
  counts: Record<string, string>;
  note: string;
}

const newUid = () => Math.random().toString(36).slice(2, 9);

export function MedalCapture({ data, report, periodId, canEdit, only }: StationProps) {
  const reportId = report?.uuid;
  if (!report || !reportId) return <StageEmpty title="Elige un informe">Los medalleros se cargan informe por informe.</StageEmpty>;
  return <MedalBoards data={data} reportId={reportId} reportName={report.name} periodId={periodId} canEdit={canEdit} only={only} />;
}

function MedalBoards({
  data,
  reportId,
  reportName,
  periodId,
  canEdit,
  only,
}: {
  data: StationProps["data"];
  reportId: string;
  reportName: string;
  periodId: string;
  canEdit: boolean;
  only?: string;
}) {
  const boards = (data.rows.medalBoards ?? [])
    .filter((b) => b.report_id === reportId && (!only || b.id === only))
    .sort((a, b) => a.position - b.position);
  const [activeId, setActiveId] = useState<string | undefined>(boards[0]?.id);
  const board = boards.find((b) => b.id === activeId) ?? boards[0];

  if (!board) {
    return (
      <StageEmpty title={`${reportName} todavía no tiene medalleros`}>
        En Estructura, «Añadir conjunto → Medallero», se crea uno: cómo se llama, qué compara cada fila y qué
        categorías de medalla reparte. Aquí se cargan sus cifras, año por año.
      </StageEmpty>
    );
  }

  return (
    <div className="oda-stack">
      {boards.length > 1 && (
        <label className="admin-field">
          <span>Medallero</span>
          <select value={board.id} onChange={(e) => setActiveId(e.target.value)}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <BoardEntries key={board.id} board={board} data={data} reportId={reportId} periodId={periodId} canEdit={canEdit} />
    </div>
  );
}

function BoardEntries({
  board,
  data,
  reportId,
  periodId,
  canEdit,
}: {
  board: OdMedalBoardRow;
  data: StationProps["data"];
  reportId: string;
  periodId: string;
  canEdit: boolean;
}) {
  const save = useSaveMedalEntries();
  const tiers = useMemo(() => orderedTiers(board), [board]);
  const stored = useMemo(
    () => (data.rows.medalEntries ?? []).filter((e) => e.board_id === board.id),
    [data.rows.medalEntries, board.id],
  );

  const years = useMemo(() => {
    const own = Array.from(new Set(stored.map((e) => e.year)));
    const period = data.rows.period;
    for (let y = period.start_year; y <= period.end_year; y += 1) if (!own.includes(y)) own.push(y);
    return own.sort((a, b) => b - a);
  }, [stored, data.rows.period]);

  const [year, setYear] = useState<number>(() => {
    const captured = stored.map((e) => e.year);
    return captured.length ? Math.max(...captured) : years[0];
  });
  const [term, setTerm] = useState<"A" | "B">("A");
  const cut = board.reporting === "periodo" ? term : null;

  const saved = useMemo(
    () => stored.filter((e) => e.year === year && (e.term ?? null) === cut).sort((a, b) => a.position - b.position),
    [stored, year, cut],
  );

  const [rows, setRows] = useState<DraftRow[]>([]);
  const [touched, setTouched] = useState(false);

  // Al cambiar de corte se vuelve a lo guardado: cada año es una captura propia.
  const key = `${board.id}|${year}|${cut ?? ""}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (loadedKey !== key) {
    setLoadedKey(key);
    setTouched(false);
    setRows(
      saved.map((e) => ({
        uid: newUid(),
        label: e.label,
        counts: Object.fromEntries(
          tiers.map((t) => [t.key, e.counts?.[t.key] === null || e.counts?.[t.key] === undefined ? "" : String(e.counts[t.key])]),
        ),
        note: e.note ?? "",
      })),
    );
  }

  const patch = (uid: string, next: Partial<DraftRow>) => {
    setTouched(true);
    setRows((list) => list.map((r) => (r.uid === uid ? { ...r, ...next } : r)));
  };

  const addRow = () => {
    setTouched(true);
    setRows((list) => [...list, { uid: newUid(), label: "", counts: Object.fromEntries(tiers.map((t) => [t.key, ""])), note: "" }]);
  };

  const dropRow = (uid: string) => {
    setTouched(true);
    setRows((list) => list.filter((r) => r.uid !== uid));
  };

  const reorder = useReorder(rows.length, (from, to) => {
    setTouched(true);
    setRows((list) => moved(list, from, to));
  });

  const named = rows.filter((r) => r.label.trim());
  const repeated = named.length !== new Set(named.map((r) => r.label.trim().toLowerCase())).size;
  const blank = rows.some((r) => !r.label.trim());

  const submit = () => {
    if (!canEdit || repeated) return;
    save.mutate({
      periodId,
      reportId,
      boardId: board.id,
      year,
      term: cut,
      entries: named.map((r, index) => ({
        label: r.label.trim(),
        // Una casilla vacía viaja como null: «no compitió». Un 0 escrito sí es un cero.
        counts: Object.fromEntries(tiers.map((t) => [t.key, countOf(r.counts[t.key] ?? "")])),
        note: r.note.trim(),
        position: index + 1,
      })),
    });
    setTouched(false);
  };

  return (
    <Panel
      title={board.title}
      description={`${board.row_label} · ${MEDAL_SORT[board.sort].label.toLowerCase()} · ${MEDAL_REPORTING[board.reporting].toLowerCase()}`}
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} idle={touched ? "Sin guardar" : undefined} />
          <button type="button" className="button-primary" disabled={!canEdit || !touched || repeated} onClick={submit}>
            Guardar {year}
            {cut ? `-${cut === "A" ? 1 : 2}` : ""}
          </button>
        </>
      }
    >
      <div className="oda-cut">
        <label className="admin-field">
          <span>Año</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
                {stored.some((e) => e.year === y) ? " · con dato" : ""}
              </option>
            ))}
          </select>
        </label>
        {board.reporting === "periodo" && (
          <label className="admin-field">
            <span>Periodo</span>
            <select value={term} onChange={(e) => setTerm(e.target.value as "A" | "B")}>
              <option value="A">{year}-1</option>
              <option value="B">{year}-2</option>
            </select>
          </label>
        )}
      </div>

      {rows.length === 0 ? (
        <StageEmpty title={`Sin filas en ${year}${cut ? `-${cut === "A" ? 1 : 2}` : ""}`}>
          Añade una fila por cada {board.row_label.toLowerCase()} y escribe cuántas medallas de cada categoría se
          ganaron. Deja la casilla vacía si no compitió; escribe 0 si compitió y no ganó.
        </StageEmpty>
      ) : (
        <div className="oda-scroll">
          <table className="oda-grid oda-medal-grid">
            <thead>
              <tr>
                <th scope="col" className="oda-medal-grid__grip"><span className="sr-only">Orden</span></th>
                <th scope="col">{board.row_label}</th>
                {tiers.map((tier, index) => (
                  <th key={tier.key} scope="col" className="oda-medal-grid__tier">
                    <span className="oda-tiers__rank" data-metal={index < 3 ? String(index + 1) : "rest"}>{index + 1}</span>
                    {tier.label}
                  </th>
                ))}
                <th scope="col">Nota <small>opcional</small></th>
                <th scope="col"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.uid}
                  ref={reorder.setRow(index)}
                  data-dragging={reorder.dragging === index || undefined}
                  data-drop={
                    reorder.marker === index
                      ? "antes"
                      : reorder.marker === index + 1 && index === rows.length - 1
                        ? "despues"
                        : undefined
                  }
                >
                  <td className="oda-medal-grid__grip">
                    <button type="button" className="oda-grip" disabled={!canEdit} {...reorder.handle(index, `Mover ${row.label || "la fila"}`)}>
                      <Icon name="grip" size={15} />
                    </button>
                  </td>
                  <td>
                    <input
                      value={row.label}
                      disabled={!canEdit}
                      onChange={(e) => patch(row.uid, { label: e.target.value })}
                      aria-label={board.row_label}
                      placeholder={board.row_label}
                    />
                  </td>
                  {tiers.map((tier) => (
                    <td key={tier.key} className="oda-medal-grid__tier">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={row.counts[tier.key] ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => patch(row.uid, { counts: { ...row.counts, [tier.key]: e.target.value } })}
                        aria-label={`${tier.label} de ${row.label || "la fila"}`}
                        placeholder="—"
                      />
                    </td>
                  ))}
                  <td>
                    <input value={row.note} disabled={!canEdit} onChange={(e) => patch(row.uid, { note: e.target.value })} aria-label="Nota" />
                  </td>
                  <td>
                    <ConfirmButton
                      label="Quitar"
                      subject={row.label ? `la fila «${row.label}»` : "la fila"}
                      confirmLabel="Sus medallas y su nota salen del medallero al guardar."
                      disabled={!canEdit}
                      onConfirm={() => dropRow(row.uid)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="oda-actions">
        <button type="button" className="button-secondary" disabled={!canEdit} onClick={addRow}>
          <Icon name="plus" size={15} /> Añadir {board.row_label.toLowerCase()}
        </button>
      </div>

      {repeated && (
        <p className="oda-banner" role="alert">
          <Icon name="alert" size={16} />
          Hay dos filas con el mismo nombre. Cada {board.row_label.toLowerCase()} va una sola vez por corte: si son
          cosas distintas, distínguelas en el nombre.
        </p>
      )}
      {blank && !repeated && (
        <p className="oda-field-hint">Las filas sin nombre no se guardan.</p>
      )}
    </Panel>
  );
}
