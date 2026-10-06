/* =============================================================================
   UDES en Cifras · el taller.

   Una sola pantalla donde se edita la ficha del informe tal como la ve el
   público: los bloques en su orden, cada uno dibujado con el componente del
   portal. Se toca un bloque para elegirlo y solo el elegido muestra sus
   controles, todos con palabras: «Editar», «Subir», «Bajar», «Ocultar»,
   «Quitar». Une lo que en la vista clásica hacen Estructura, Captura y Diseño;
   la vista clásica sigue ahí, sin tocar, y las dos leen y escriben lo mismo.

   Guardado (ver draft.ts):
   · Informe sin publicar: lo escrito se guarda solo, un segundo después de la
     última tecla, y lo dice («Guardando…», «Guardado»).
   · Informe publicado: guardar se vería en el portal al instante, así que los
     cambios quedan pendientes en este navegador hasta «Publicar cambios (n)».
     «Descartar cambios» los borra. Se dice a la vista que están solo aquí.

   Arriba, «Así lo ve el público»: el corte y el campus del portal. Cambian lo
   que se mira, nunca lo que se puede llenar: al editar están todos los años.

   Sin permiso sobre el informe, todo es de solo lectura (el aviso lo pone
   OdAdmin, el mismo de la vista clásica).
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { useTour } from "../../../../components/tour/TourProvider";
import type { OdBlockKind, OdImportKind, OdIndicatorRow } from "../../../../types/database";
import { BoardControls } from "../../../datos-abiertos/components/BoardControls";
import { withPeriodView } from "../../../datos-abiertos/data/open-data";
import { cutForYear, startingCut } from "../../../datos-abiertos/data/period-reading";
import type { Cut } from "../../../datos-abiertos/data/period-reading";
import { assembleCatalog } from "../../../datos-abiertos/data/repository";
import { ALL_YEARS, cutLabel } from "../../../datos-abiertos/data/terms";
import { ALL_CAMPUSES, BLOCK_LABELS } from "../../../datos-abiertos/data/types";
import type { CampusId, ReportBlock, Term } from "../../../datos-abiertos/data/types";
import type { StationProps } from "../OdAdmin";
import { BLOCK_CLASSIC, BLOCK_CREATE, BLOCK_FILL, BLOCK_GROUPS, blockHelp, blockHelpText } from "../block-help";
import { indexValues } from "../indicator-grid";
import { useSaveBlocks, useSaveIndicator, useSaveValues } from "../od-data";
import type { StationId } from "../progress";
import type { CellKey } from "../sheet";
import { ConfirmButton, StageEmpty } from "../ui";
import { blockName, boardIndicators, IndicatorLines, renderBlock } from "./BlockView";
import {
  addBlock,
  adoptSavedIds,
  blockKeys,
  blocksFromRows,
  blocksPayload,
  browserStorage,
  countChanges,
  describeChanges,
  draftKey,
  effectiveIndicator,
  emptyDraft,
  indicatorPayloads,
  isEmptyDraft,
  loadDraft,
  mergeValues,
  moveBlock,
  overlayRows,
  patchBlock,
  patchIndicator,
  pruneDraft,
  readMode,
  removeBlock,
  restoreBlock,
  saveDraft,
  setBlocks,
  setValues,
  settle,
  undoEdits,
  valuesPayload,
  workingBlocks,
  writeMode,
} from "./draft";
import type { BlocksDraft, DraftBlock, IndicatorPatch, TallerDraft, TallerMode } from "./draft";
import { KpiEditor } from "./KpiEditor";
import { PiloHelper } from "./PiloHelper";
import type { PiloSay } from "./PiloHelper";
import { enterToast, settleBlock } from "./pilo-motion";
import "./taller.css";

export const TALLER_TOUR = "intranet-taller-cifras";

/** Tipos que se editan dentro del taller en este incremento. */
const EDITABLE: OdBlockKind[] = ["kpis", "separador"];
/** Tipos que «Añadir algo a la ficha» crea aquí mismo; los demás, en la vista clásica. */
const ADDABLE: OdBlockKind[] = ["separador", "kpis"];
const ADD_LABEL: Partial<Record<OdBlockKind, string>> = { kpis: "Otro tablero de indicadores" };

/** Cuánto dura a la vista un aviso con «Deshacer». */
const TOAST_MS = 8000;
/** Cuánto se espera tras la última tecla antes de guardar solo. */
const AUTOSAVE_MS = 1000;

export interface TallerProps extends StationProps {
  /** Dirección de una estación de la vista clásica para este informe y periodo. */
  classicHref: (station: StationId, hash?: string) => string;
}

export function Taller(props: TallerProps) {
  const { report, periodId } = props;
  if (!report?.uuid) {
    return <StageEmpty title="Elija un informe">La ficha se edita informe por informe: tóquelo en la lista.</StageEmpty>;
  }
  // Cada informe tiene su borrador: cambiar de informe monta un taller nuevo.
  return <TallerReport key={`${periodId}:${report.uuid}`} {...props} reportId={report.uuid} />;
}

interface Picked {
  id: string;
  /** Dónde estaba: si su id cambia al guardarse (un bloque nuevo), se le sigue por su sitio. */
  index: number;
  editing: boolean;
}

interface Toast {
  id: number;
  text: string;
  undo?: () => void;
}

/** La copia de la ficha no recibe el foco ni el tabulador (The Inert Preview Rule). */
const makeInert = (node: HTMLElement | null) => node?.setAttribute("inert", "");

function TallerReport({ data, report, reportId, periodId, canEdit, classicHref }: TallerProps & { reportId: string }) {
  const storage = useMemo(browserStorage, []);
  const storageKey = draftKey(periodId, reportId);
  const live = report!.status === "publicado";
  const tour = useTour();

  const saveBlocks = useSaveBlocks();
  const saveIndicator = useSaveIndicator();
  const saveValues = useSaveValues();

  /* --- Lo guardado ---------------------------------------------------------- */

  const stored = useMemo(() => indexValues(data.rows.values), [data.rows.values]);
  const storedBlocks = useMemo(() => blocksFromRows(data.rows.blocks, reportId), [data.rows.blocks, reportId]);
  const storedIds = useMemo(() => new Set(storedBlocks.map((b) => b.tempId)), [storedBlocks]);
  const indicatorRows = useMemo(
    () => data.rows.indicators.filter((i) => i.report_id === reportId).sort((a, b) => a.position - b.position),
    [data.rows.indicators, reportId],
  );

  /* --- El borrador ------------------------------------------------------------ */

  const [draft, setDraftState] = useState<TallerDraft>(() =>
    canEdit ? pruneDraft(loadDraft(storage, storageKey), data.rows, reportId) : emptyDraft(),
  );
  const draftRef = useRef(draft);
  /** ¿El navegador dejó guardar lo pendiente? Si no, se avisa: se pierde al recargar. */
  const [kept, setKept] = useState(true);

  // Todo cambio pasa por aquí: estado, referencia y navegador a la vez, para que
  // nada de lo escrito dependa de que la pantalla siga montada.
  const update = useCallback(
    (change: (current: TallerDraft) => TallerDraft) => {
      const next = change(draftRef.current);
      if (next === draftRef.current) return;
      draftRef.current = next;
      setDraftState(next);
      setKept(saveDraft(storage, storageKey, next));
    },
    [storage, storageKey],
  );

  const latest = useRef({ stored, storedBlocks, storedIds, live, canEdit });
  latest.current = { stored, storedBlocks, storedIds, live, canEdit };

  /* --- Guardar ----------------------------------------------------------------- */

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const flushing = useRef(false);
  /** El borrador que falló: no se reintenta solo hasta que cambie. */
  const failed = useRef<TallerDraft | null>(null);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    const sent = draftRef.current;
    if (isEmptyDraft(sent)) return;
    flushing.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      // Por partes, y cada parte sale del borrador en cuanto llega: si la
      // siguiente falla, lo ya escrito no se vuelve a mandar.
      if (sent.blocks) {
        // Un bloque nuevo que ya se guardó y siguió cambiando lleva el id de lo guardado: no se inserta dos veces.
        const blocks = adoptSavedIds(sent.blocks, latest.current.storedBlocks);
        await saveBlocks.mutateAsync(blocksPayload(blocks, reportId, latest.current.storedIds));
        update((d) => settle(d, { blocks: sent.blocks }));
      }
      for (const row of indicatorPayloads(sent, reportId)) {
        await saveIndicator.mutateAsync(row);
        const { id, report_id: _report, ...patch } = row;
        update((d) => settle(d, { indicators: { [id]: patch } }));
      }
      const values = valuesPayload(sent);
      if (values.length) {
        const kind: OdImportKind = sent.pasted ? "pegado" : "rejilla";
        await saveValues.mutateAsync({ periodId, reportId, kind, values });
        update((d) => settle(d, { values: sent.values }));
      }
      failed.current = null;
      setSavedAt(Date.now());
    } catch (error) {
      failed.current = draftRef.current;
      setSaveError(error);
    } finally {
      flushing.current = false;
      setSaving(false);
    }
  }, [periodId, reportId, saveBlocks, saveIndicator, saveValues, update]);

  // Informe sin publicar: se guarda solo, un segundo después del último cambio.
  useEffect(() => {
    if (live || !canEdit || saving || isEmptyDraft(draft) || failed.current === draft) return;
    const timer = window.setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, live, canEdit, saving, flush]);

  // Al salir de la pantalla con algo por guardar (y sin publicar), se guarda de una vez.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(
    () => () => {
      if (!latest.current.live && latest.current.canEdit && !isEmptyDraft(draftRef.current)) void flushRef.current();
    },
    [],
  );

  /* --- La ficha, con lo pendiente encima ------------------------------------------ */

  const view = useMemo(() => {
    const catalog = withPeriodView(assembleCatalog(overlayRows(data.rows, reportId, draft)));
    return { catalog, report: catalog.reports[0] };
  }, [data.rows, reportId, draft]);

  const [cut, setCut] = useState<Cut>(() => (view.report ? startingCut(view.report, view.catalog.years) : { year: ALL_YEARS, term: null }));
  const [campus, setCampus] = useState<CampusId>(ALL_CAMPUSES);
  const [mode, setMode] = useState<TallerMode>(() => readMode(storage));

  const working = workingBlocks(draft, storedBlocks);
  const keys = blockKeys(working.list);
  const catalogBlocks = useMemo(() => new Map((view.report?.blocks ?? []).map((b) => [b.uuid, b])), [view.report]);

  /* --- Elegir --------------------------------------------------------------------- */

  const [pick, setPick] = useState<Picked | null>(null);
  const pickedIndex = pick
    ? (() => {
        const at = working.list.findIndex((b) => b.tempId === pick.id);
        return at >= 0 ? at : Math.min(pick.index, working.list.length - 1);
      })()
    : -1;
  const picked = pickedIndex >= 0 ? working.list[pickedIndex] : undefined;

  // Un bloque nuevo cambia de id al guardarse: la elección lo sigue por su sitio.
  useEffect(() => {
    if (pick && picked && (pick.id !== picked.tempId || pick.index !== pickedIndex)) {
      setPick({ ...pick, id: picked.tempId, index: pickedIndex });
    }
  }, [pick, picked, pickedIndex]);

  const select = (block: DraftBlock, index: number) => {
    if (picked?.tempId === block.tempId) return;
    setPick({ id: block.tempId, index, editing: false });
  };

  /* --- Avisos y Pilo ---------------------------------------------------------------- */

  const [toast, setToast] = useState<Toast | null>(null);
  const toastNode = useRef<HTMLDivElement>(null);
  const toastSeq = useRef(0);
  const notify = (text: string, undo?: () => void) => setToast({ id: (toastSeq.current += 1), text, undo });
  useEffect(() => {
    if (!toast) return;
    enterToast(toastNode.current);
    const timer = window.setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const [say, setSay] = useState<PiloSay | null>(null);
  const saySeq = useRef(0);
  const speak = (title: string, text: string, mood: PiloSay["mood"] = "idea") => setSay({ id: (saySeq.current += 1), title, text, mood });

  const [adding, setAdding] = useState(false);
  const addPanel = useRef<HTMLDivElement>(null);

  /* --- Bloques ------------------------------------------------------------------------ */

  const list = useRef<HTMLOListElement>(null);
  /** Tras mover un bloque: a qué botón vuelve el foco y desde dónde llega. */
  const moved = useRef<{ id: string; action: "subir" | "bajar" } | null>(null);
  useLayoutEffect(() => {
    const last = moved.current;
    if (!last) return;
    moved.current = null;
    const node = list.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(last.id)}"]`);
    if (!node) return;
    settleBlock(node, last.action === "subir" ? 1 : -1);
    const button = node.querySelector<HTMLButtonElement>(`[data-act="${last.action}"]`);
    (button && !button.disabled ? button : node.querySelector<HTMLButtonElement>(".odt-block__head"))?.focus();
  });

  const changeBlocks = (next: BlocksDraft) => update((d) => setBlocks(d, next, latest.current.storedBlocks));
  const currentBlocks = () => workingBlocks(draftRef.current, latest.current.storedBlocks);

  const nameOf = (block: DraftBlock): string => {
    const shown = catalogBlocks.get(block.id ?? block.tempId);
    return shown && view.report ? blockName(view.report, shown, BLOCK_LABELS[block.kind]) : block.settings.title || BLOCK_LABELS[block.kind];
  };

  const move = (block: DraftBlock, delta: -1 | 1) => {
    moved.current = { id: block.tempId, action: delta < 0 ? "subir" : "bajar" };
    changeBlocks(moveBlock(currentBlocks(), block.tempId, delta));
  };

  const remove = (block: DraftBlock, index: number) => {
    const name = nameOf(block);
    const { blocks, undo } = removeBlock(currentBlocks(), block.tempId);
    if (!undo) return;
    changeBlocks(blocks);
    const neighbour = blocks.list[Math.min(index, blocks.list.length - 1)];
    setPick(neighbour ? { id: neighbour.tempId, index: Math.min(index, blocks.list.length - 1), editing: false } : null);
    notify(`Se quitó «${name}» de la ficha. Sus cifras siguen guardadas.`, () => {
      changeBlocks(restoreBlock(currentBlocks(), undo, latest.current.storedIds));
      setPick({ id: undo.block.tempId, index: undo.index, editing: false });
    });
  };

  const add = (kind: OdBlockKind) => {
    const { blocks, tempId } = addBlock(currentBlocks(), kind);
    changeBlocks(blocks);
    setAdding(false);
    setPick({ id: tempId, index: blocks.list.length - 1, editing: true });
    notify(
      kind === "kpis"
        ? "Añadí otro tablero de indicadores al final de la ficha. Elija abajo qué indicadores muestra."
        : `Añadí «${BLOCK_LABELS[kind]}» al final de la ficha. Use «Subir» para llevarlo a su sitio.`,
    );
  };

  /* --- Cifras e indicadores ------------------------------------------------------------- */

  /** Las casillas como estaban antes del último cambio de la rejilla: para deshacer un pegado. */
  const beforePaste = useRef<Record<CellKey, number | null>>({});
  const onValues = (next: Record<CellKey, number | null>) => {
    beforePaste.current = draftRef.current.values;
    update((d) => setValues(d, next));
  };
  const onPasted = (count: number) => {
    const edits = undoEdits(beforePaste.current, draftRef.current.values, latest.current.stored);
    update((d) => (Object.keys(d.values).length ? { ...d, pasted: true } : d));
    notify(
      `Se ${count === 1 ? "pegó 1 casilla" : `pegaron ${count} casillas`} desde Excel. Las casillas calculadas se saltaron.`,
      Object.keys(edits).length ? () => update((d) => mergeValues(d, edits, latest.current.stored)) : undefined,
    );
  };
  const onPatchIndicator = (indicatorId: string, patch: IndicatorPatch) => {
    const row = indicatorRows.find((i) => i.id === indicatorId);
    if (row) update((d) => patchIndicator(d, row, patch));
  };

  if (!view.report) {
    return <StageEmpty title="No se pudo abrir este informe">Vuelva a elegirlo en la lista o use la vista clásica.</StageEmpty>;
  }

  const viewReport = view.report;
  const years = view.catalog.years;
  const count = countChanges(draft);
  const context = { catalog: view.catalog, report: viewReport, cut, campus, noop: () => undefined };
  const cutText = cut.year === ALL_YEARS ? `todo el periodo ${cutLabel(ALL_YEARS, null)}` : cut.term ? `periodo ${cutLabel(cut.year, cut.term)}` : `año ${cut.year}`;

  /** Los indicadores de un tablero, como filas de la base con su ajuste pendiente. */
  const rowsOfBoard = (block: ReportBlock): OdIndicatorRow[] =>
    boardIndicators(viewReport, block)
      .map((i) => indicatorRows.find((row) => row.id === i.uuid))
      .filter((row): row is OdIndicatorRow => Boolean(row))
      .map((row) => effectiveIndicator(row, draft));

  const pendingIn = (block: ReportBlock): boolean => {
    if (block.kind !== "kpis") return false;
    const ids = new Set(boardIndicators(viewReport, block).map((i) => i.uuid));
    return Object.keys(draft.indicators).some((id) => ids.has(id)) || Object.keys(draft.values).some((key) => ids.has(key.split("::")[0]));
  };

  const helpBlock = (block: DraftBlock) => speak(`Sobre «${nameOf(block)}»`, blockHelpText(block.kind), "idea");

  return (
    <div className="odt" data-mode={mode}>
      {/* --- Estado y modo ---------------------------------------------------- */}
      <div className="odt-bar">
        <div className="odt-status" data-tour="odt-guardado" aria-live="polite">
          <SaveStatus live={live} canEdit={canEdit} saving={saving} error={saveError} savedAt={savedAt} pending={count.total} onRetry={() => void flush()} />
        </div>
        <div className="odt-field odt-field--inline" role="group" aria-labelledby="odt-modo">
          <span className="odt-field__label" id="odt-modo">Modo</span>
          <span className="odt-seg">
            {(["sencillo", "completo"] as TallerMode[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => {
                  setMode(option);
                  writeMode(storage, option);
                }}
              >
                {option === "sencillo" ? "Sencillo" : "Completo"}
              </button>
            ))}
          </span>
        </div>
      </div>

      {live && canEdit && (
        <div className="odt-live" role="note">
          <p>
            <Icon name="alert" size={16} />
            <span>
              <strong>Este informe está publicado.</strong> Lo que cambie aquí no sale al portal todavía: queda pendiente{" "}
              <strong>solo en este equipo</strong> (en este navegador) hasta que usted pulse «Publicar cambios». Al publicarlos,
              el público los ve de inmediato.
            </span>
          </p>
          {count.total > 0 && (
            <div className="odt-live__actions">
              <span className="odt-live__count">Pendiente: {describeChanges(count)}.</span>
              <button type="button" className="button-primary" disabled={saving} onClick={() => void flush()}>
                Publicar cambios ({count.total})
              </button>
              <ConfirmButton
                label="Descartar cambios"
                subject={`${count.total === 1 ? "el cambio pendiente" : `los ${count.total} cambios pendientes`}`}
                confirmLabel="Se borran de este equipo. Lo que ya está publicado no cambia."
                confirmAction="Sí, descartar"
                disabled={saving}
                onConfirm={() => {
                  failed.current = null;
                  setSaveError(null);
                  update(() => emptyDraft());
                  notify("Se descartaron los cambios pendientes. La ficha vuelve a lo publicado.");
                }}
              />
            </div>
          )}
          {count.total > 0 && !kept && (
            <p className="odt-live__warn">
              <Icon name="alert" size={15} />
              Este navegador no deja guardar los cambios pendientes: si cierra o recarga la página antes de publicarlos, se pierden.
            </p>
          )}
        </div>
      )}

      {/* --- Así lo ve el público ------------------------------------------------- */}
      <section className="odt-public" data-tour="odt-publico" aria-labelledby="odt-publico-titulo">
        <div className="odt-public__head">
          <h3 id="odt-publico-titulo">Así lo ve el público</h3>
          <p>
            Corte y campus del portal: cambian lo que usted mira, nunca lo que puede llenar. Ahora mira el {cutText}.
          </p>
        </div>
        <BoardControls
          data={view.catalog}
          year={cut.year}
          term={cut.term}
          campus={campus}
          setYear={(year) => setCut((current) => cutForYear(viewReport, year, current))}
          setTerm={(term: Term | null) => setCut((current) => ({ year: current.year, term: current.year === ALL_YEARS ? null : term }))}
          setCampus={setCampus}
        />
        <Link className="odt-link" to={`/datos-abiertos/${viewReport.slug}?vista-previa`} target="_blank" rel="noreferrer">
          Abrir la ficha guardada en otra pestaña <Icon name="external" size={14} />
        </Link>
      </section>

      {/* --- La ficha ----------------------------------------------------------------- */}
      {working.list.length === 0 ? (
        <StageEmpty title="La ficha todavía no tiene bloques">
          Use «Añadir algo a la ficha» para empezar, o arme la ficha en la vista clásica (Diseño visual).
        </StageEmpty>
      ) : (
        <ol className="odt-ficha" ref={list} data-tour="odt-ficha" aria-label={`Bloques de la ficha de ${viewReport.name}, en su orden`}>
          {working.list.map((block, index) => {
            const shown = catalogBlocks.get(block.id ?? block.tempId);
            const selected = picked?.tempId === block.tempId;
            const editing = selected && Boolean(pick?.editing) && canEdit && EDITABLE.includes(block.kind);
            const name = nameOf(block);
            const classic = BLOCK_CLASSIC[block.kind];
            const rendered = shown && block.visible ? renderBlock(shown, context) : { embedded: true, node: null };
            const boardRows = shown && block.kind === "kpis" ? rowsOfBoard(shown) : [];
            const tourTarget = selected || (!picked && index === 0);
            // En modo sencillo, al editar queda la rejilla sola; en completo, la ficha va al lado.
            const showView = !editing || mode === "completo";

            return (
              <li
                key={keys[index]}
                className="odt-block"
                data-block={block.tempId}
                data-kind={block.kind}
                data-selected={selected || undefined}
                data-editing={editing || undefined}
                data-hidden={!block.visible || undefined}
                data-tour={tourTarget ? "odt-bloque" : undefined}
                onClick={() => select(block, index)}
              >
                <button type="button" className="odt-block__head" aria-pressed={selected} onClick={() => select(block, index)}>
                  <span className="odt-block__pos" aria-hidden="true">{index + 1}</span>
                  <span className="odt-block__title">
                    <span className="odt-block__kind">{BLOCK_LABELS[block.kind]}</span>
                    <strong>{name}</strong>
                  </span>
                  <span className="odt-block__marks">
                    {!block.visible && (
                      <span className="odt-mark" data-tone="muted">
                        <Icon name="eye-off" size={13} /> Oculto: el público no lo ve
                      </span>
                    )}
                    {live && shown && pendingIn(shown) && (
                      <span className="odt-mark" data-tone="pending">
                        <Icon name="alert" size={13} /> Con cambios pendientes
                      </span>
                    )}
                    {live && !block.id && (
                      <span className="odt-mark" data-tone="pending">
                        <Icon name="alert" size={13} /> Nuevo, sin publicar
                      </span>
                    )}
                    <span className="odt-block__hint">{selected ? "Elegido" : "Toque para elegir"}</span>
                  </span>
                </button>

                {selected && (
                  <div className="odt-tools" role="toolbar" aria-label={`Acciones de «${name}»`}>
                    {canEdit && EDITABLE.includes(block.kind) && (
                      <button type="button" className="button-primary" data-act="editar" onClick={() => setPick({ id: block.tempId, index, editing: !editing })}>
                        {editing ? "Listo" : "Editar"}
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <button type="button" className="button-secondary" data-act="subir" disabled={index === 0 || saving} onClick={() => move(block, -1)}>
                          Subir
                        </button>
                        <button type="button" className="button-secondary" data-act="bajar" disabled={index === working.list.length - 1 || saving} onClick={() => move(block, 1)}>
                          Bajar
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          data-act="ocultar"
                          disabled={saving}
                          onClick={() => changeBlocks(patchBlock(currentBlocks(), block.tempId, { visible: !block.visible }))}
                        >
                          {block.visible ? "Ocultar" : "Mostrar"}
                        </button>
                      </>
                    )}
                    <button type="button" className="button-ghost" data-act="ayuda" onClick={() => helpBlock(block)}>
                      Ayúdeme con esto
                    </button>
                    {!EDITABLE.includes(block.kind) && (
                      <Link className="button-ghost" to={classicHref(classic.station, classic.hash)}>
                        Editar en la vista clásica <small>({classic.where})</small>
                      </Link>
                    )}
                    {canEdit && (
                      <button type="button" className="button-ghost odt-danger" data-act="quitar" disabled={saving} onClick={() => remove(block, index)}>
                        Quitar
                      </button>
                    )}
                  </div>
                )}

                <div className="odt-block__body">
                  {editing && block.kind === "separador" && (
                    <div className="odt-editor">
                      <label className="admin-field admin-field--wide">
                        <span>Título del separador</span>
                        <input
                          autoFocus
                          value={block.settings.title ?? ""}
                          placeholder="Graduados"
                          onChange={(e) => changeBlocks(patchBlock(currentBlocks(), block.tempId, { settings: { ...block.settings, title: e.target.value || undefined } }))}
                        />
                      </label>
                      <label className="admin-field admin-field--wide">
                        <span>Descripción</span>
                        <input
                          value={block.settings.description ?? ""}
                          placeholder="Quiénes obtienen título y cómo se reparten"
                          onChange={(e) => changeBlocks(patchBlock(currentBlocks(), block.tempId, { settings: { ...block.settings, description: e.target.value || undefined } }))}
                        />
                      </label>
                      <p className="odt-note">
                        Un separador agrupa los bloques que le siguen, hasta el próximo separador. En el Boletín abre página.
                      </p>
                    </div>
                  )}

                  {editing && block.kind === "kpis" && (
                    <div className="odt-editor-wrap">
                      <KpiEditor
                        indicators={boardRows}
                        campuses={data.rows.campuses}
                        offices={data.rows.offices}
                        years={years}
                        stored={stored}
                        values={draft.values}
                        mode={mode}
                        canEdit={canEdit}
                        onValues={onValues}
                        onPasted={onPasted}
                        onPatch={onPatchIndicator}
                        structureHref={classicHref("estructura")}
                      />
                      <BoardPicker
                        indicators={indicatorRows}
                        chosen={block.settings.indicators ?? []}
                        disabled={saving}
                        startOpen={boardRows.length === 0}
                        onChange={(keys) =>
                          changeBlocks(patchBlock(currentBlocks(), block.tempId, { settings: { ...block.settings, indicators: keys.length ? keys : undefined } }))
                        }
                      />
                    </div>
                  )}

                  {showView && (
                    <div className="odt-block__view">
                      {editing && <span className="odt-block__viewlabel">Así queda en la ficha · {cutText}</span>}
                      {!block.visible ? (
                        <p className="odt-empty">Este bloque está oculto: sigue en la ficha, pero el público no lo ve. Pulse «Mostrar» para devolverlo.</p>
                      ) : !rendered.embedded ? (
                        <div className="odt-card">
                          <p>{blockHelp(block.kind)}</p>
                          <p>
                            <strong>Cómo se llena.</strong> {BLOCK_FILL[block.kind]}
                          </p>
                          <p className="odt-note">
                            Este tipo de bloque todavía no se dibuja ni se edita en el taller: se maneja en la vista clásica ({classic.where}).
                          </p>
                        </div>
                      ) : rendered.node ? (
                        <div className="odt-copy" ref={makeInert} aria-hidden="true">
                          {rendered.node}
                        </div>
                      ) : (
                        <p className="odt-empty">
                          {block.kind === "kpis"
                            ? "Este tablero no tiene indicadores que mostrar. Pulse «Editar» y elija cuáles muestra."
                            : "Este bloque todavía no tiene datos: el público no lo ve hasta que los tenga."}
                        </p>
                      )}
                      {/* Modo completo: la evolución por campus, viva, con las cifras que se están escribiendo. */}
                      {editing && mode === "completo" && block.kind === "kpis" && shown && (
                        <div className="odt-copy odt-evolution" ref={makeInert} aria-hidden="true">
                          {boardIndicators(viewReport, shown).map((indicator) => (
                            <figure key={indicator.id}>
                              <figcaption>
                                Evolución por campus · {indicator.label}
                                <small>{indicator.reporting === "anual" ? "por año" : "por periodo"} · un hueco en la línea es un corte sin reportar</small>
                              </figcaption>
                              <IndicatorLines catalog={view.catalog} indicator={indicator} cut={cut} />
                            </figure>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* --- Añadir -------------------------------------------------------------------- */}
      <div className="odt-add" data-tour="odt-anadir" data-open={adding || undefined} ref={addPanel}>
        {!adding ? (
          <button type="button" className="button-secondary" disabled={!canEdit} onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> Añadir algo a la ficha
          </button>
        ) : (
          <>
            <div className="odt-add__head">
              <strong>¿Qué quiere añadir? Estos son los veinte tipos de bloque de la ficha.</strong>
              <button type="button" className="button-ghost" autoFocus onClick={() => setAdding(false)}>
                Cancelar
              </button>
            </div>
            <p className="odt-note">
              En el taller se añaden, por ahora, el separador y otro tablero de indicadores. Los demás se crean en la vista
              clásica y aparecen aquí en cuanto existen.
            </p>
            {BLOCK_GROUPS.map((group) => (
              <section key={group.title} className="odt-add__group" aria-label={group.title}>
                <h4>{group.title}</h4>
                <ul>
                  {group.kinds.map((kind) => {
                    const here = ADDABLE.includes(kind);
                    const create = BLOCK_CREATE[kind];
                    return (
                      <li key={kind} className="odt-option" data-live={here || undefined}>
                        <strong>{ADD_LABEL[kind] ?? BLOCK_LABELS[kind]}</strong>
                        <span>{blockHelp(kind)}</span>
                        <div className="odt-option__actions">
                          {here ? (
                            <button type="button" className="button-secondary" onClick={() => add(kind)}>
                              Añadir
                            </button>
                          ) : (
                            <Link className="odt-link" to={classicHref(create.station, create.hash)}>
                              Disponible en la vista clásica <small>({create.where})</small>
                            </Link>
                          )}
                          <button type="button" className="odt-link" onClick={() => speak(BLOCK_LABELS[kind], blockHelpText(kind), "idea")}>
                            ¿Cómo funciona?
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
        {!canEdit && <small className="odt-note">Su rol consulta este informe: no puede añadir bloques.</small>}
      </div>

      {/* --- Esquina: avisos y Pilo -------------------------------------------------------- */}
      <div className="odt-corner">
        <div className="odt-toasts" aria-live="polite" aria-atomic="true">
          {toast && (
            <div ref={toastNode} key={toast.id} className="odt-toast">
              <span>{toast.text}</span>
              {toast.undo && (
                <button
                  type="button"
                  onClick={() => {
                    toast.undo?.();
                    setToast(null);
                  }}
                >
                  Deshacer
                </button>
              )}
              <button type="button" aria-label="Cerrar este aviso" onClick={() => setToast(null)}>
                Cerrar
              </button>
            </div>
          )}
        </div>
        <PiloHelper
          say={say}
          blockName={picked ? nameOf(picked) : undefined}
          onCall={() =>
            speak(
              "Su guía en el taller",
              "Aquí estoy. Puedo mostrarle el recorrido de esta pantalla, explicarle cada tipo de bloque o ayudarle con el bloque que tenga elegido.",
              "feliz",
            )
          }
          onClose={() => setSay(null)}
          onTour={() => {
            setSay(null);
            tour.start(TALLER_TOUR);
          }}
          onHelpBlock={picked ? () => helpBlock(picked) : undefined}
          onKinds={() => {
            setAdding(true);
            speak(
              "Los tipos de bloque",
              "Abrí la lista de los veinte tipos de bloque, al final de la ficha. En cada uno hay un «¿Cómo funciona?»: tóquelo y se lo explico.",
              "bien",
            );
            window.requestAnimationFrame(() => addPanel.current?.scrollIntoView({ block: "start", behavior: "auto" }));
          }}
        />
      </div>
    </div>
  );
}

/* --- Estado del guardado ------------------------------------------------------------------- */

function SaveStatus({
  live,
  canEdit,
  saving,
  error,
  savedAt,
  pending,
  onRetry,
}: {
  live: boolean;
  canEdit: boolean;
  saving: boolean;
  error: unknown;
  savedAt: number | null;
  pending: number;
  onRetry: () => void;
}) {
  if (!canEdit) {
    return (
      <span className="odt-save">
        <Icon name="lock" size={14} /> Solo lectura: su rol consulta este informe.
      </span>
    );
  }
  if (saving) {
    return (
      <span className="odt-save" data-state="pending">
        <span className="oda-save__spinner" aria-hidden="true" /> {live ? "Publicando…" : "Guardando…"}
      </span>
    );
  }
  if (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar.";
    return (
      <span className="odt-save" data-state="error" role="alert">
        <Icon name="alert" size={14} /> No se pudo {live ? "publicar" : "guardar"}: {message}{" "}
        <button type="button" className="button-secondary" onClick={onRetry}>
          Reintentar
        </button>
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span className="odt-save" data-state={live ? "waiting" : "pending"}>
        {live ? (
          <>
            <Icon name="alert" size={14} /> {pending} {pending === 1 ? "cambio pendiente" : "cambios pendientes"}, solo en este equipo
          </>
        ) : (
          <>
            <span className="oda-save__spinner" aria-hidden="true" /> Guardando…
          </>
        )}
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="odt-save" data-state="ok">
        <Icon name="check" size={14} /> {live ? "Cambios publicados" : "Guardado"}
      </span>
    );
  }
  return (
    <span className="odt-save">
      {live ? "Sin cambios pendientes." : "Lo que escriba se guarda solo."}
    </span>
  );
}

/* --- Qué indicadores muestra un tablero -------------------------------------------------------- */

function BoardPicker({
  indicators,
  chosen,
  disabled,
  startOpen,
  onChange,
}: {
  indicators: OdIndicatorRow[];
  chosen: string[];
  disabled: boolean;
  startOpen: boolean;
  onChange: (keys: string[]) => void;
}) {
  if (!indicators.length) return null;
  return (
    <details
      className="odt-picker"
      // Abierto de entrada solo cuando el tablero aún no muestra nada; después lo decide quien lo usa.
      ref={(node) => {
        if (node && startOpen && !node.dataset.ready) node.open = true;
        if (node) node.dataset.ready = "1";
      }}
    >
      <summary>
        Indicadores de este tablero:{" "}
        {chosen.length
          ? `${chosen.length} ${chosen.length === 1 ? "elegido" : "elegidos"}`
          : "los que ningún otro tablero eligió"}
      </summary>
      <div className="odt-picker__body">
        {indicators.map((indicator) => (
          <label key={indicator.id} className="odt-check">
            <input
              type="checkbox"
              disabled={disabled}
              checked={chosen.includes(indicator.key)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? indicators.map((i) => i.key).filter((key) => key === indicator.key || chosen.includes(key))
                    : chosen.filter((key) => key !== indicator.key),
                )
              }
            />
            {indicator.label}
          </label>
        ))}
        <p className="odt-note">
          Sin elegir ninguno, el primer tablero sin elección muestra los indicadores que ningún otro eligió; los demás quedan
          vacíos. Así no se repiten entre secciones.
        </p>
      </div>
    </details>
  );
}
