/* =============================================================================
   UDES en Cifras · el taller.

   Una sola pantalla donde se edita la ficha del informe tal como la ve el
   público: los bloques en su orden, cada uno dibujado con el componente del
   portal. Se toca un bloque para elegirlo y solo el elegido muestra sus
   controles, todos con palabras: «Editar», «Subir», «Bajar», «Ocultar»,
   «Quitar». Une lo que en la vista clásica hacen Estructura, Captura y Diseño;
   la vista clásica sigue ahí, sin tocar, y las dos leen y escriben lo mismo.

   Todas las fuentes de datos se diligencian aquí: «Editar» abre, dentro del
   bloque, el editor de su familia (BlockEditors.tsx monta el de Captura,
   acotado al conjunto del bloque) y «Añadir algo a la ficha» crea el conjunto
   con el formulario de Estructura. Hay un solo editor abierto a la vez; cerrar
   uno que puede tener cambios sin guardar lo avisa antes.

   Guardado (ver draft.ts):
   · Informe sin publicar: lo escrito se guarda solo, un segundo después de la
     última tecla, y lo dice («Guardando…», «Guardado»).
   · Informe publicado: guardar se vería en el portal al instante, así que los
     cambios quedan pendientes en este navegador hasta «Publicar cambios (n)».
     «Descartar cambios» los borra. Se dice a la vista que están solo aquí.
   · Eso vale para el tablero de indicadores, el separador, las imágenes, la
     evolución y los ajustes de cada bloque. Los editores montados desde
     Captura conservan su propio «Guardar», con el aviso de siempre cuando el
     informe está publicado: lo guardado se ve de inmediato en el portal.

   Arriba, «Así lo ve el público»: el corte y el campus del portal. Cambian lo
   que se mira, nunca lo que se puede llenar: al editar están todos los años.

   Sin permiso sobre el informe, todo es de solo lectura (el aviso lo pone
   OdAdmin, el mismo de la vista clásica).
   ========================================================================== */

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { customViewOf } from "../../../datos-abiertos/data/custom-table";
import { ALL_CAMPUSES, BLOCK_LABELS } from "../../../datos-abiertos/data/types";
import type { CampusId, ReportBlock, Term } from "../../../datos-abiertos/data/types";
import type { StationProps } from "../OdAdmin";
import { BLOCK_CLASSIC, BLOCK_FILL, BLOCK_GROUPS, blockHelp, blockHelpText } from "../block-help";
import { indexValues } from "../indicator-grid";
import { useDeleteIndicator, useSaveBlocks, useSaveIndicator, useSaveValues } from "../od-data";
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

// Los editores montados desde Captura y Estructura bajan al pulsar «Editar» o «Añadir».
const loadEditors = () => import("./BlockEditors");
const BlockEditor = lazy(() => loadEditors().then((m) => ({ default: m.BlockEditor })));
const AddDataset = lazy(() => loadEditors().then((m) => ({ default: m.AddDataset })));
const NewIndicator = lazy(() => loadEditors().then((m) => ({ default: m.NewIndicator })));

/** Tipos sin captura: sus datos salen de otra parte, y el bloque lo explica. */
const NO_CAPTURE: OdBlockKind[] = ["tabla", "tabla_dinamica", "metodologia", "diversidad", "modelo"];
/** Tipos cuyo editor es el de Captura, con su propio «Guardar» dentro del bloque. */
const OWN_SAVE: OdBlockKind[] = ["desgloses", "historico", "mapa_calor", "tuberia", "mapa", "rankings", "medallero", "saber_pro", "saber_tyt", "libre", "tablas_personalizadas"];
const isEditable = (kind: OdBlockKind) => !NO_CAPTURE.includes(kind);
/** Bloques que «Añadir» pone en la ficha sin crear ningún conjunto. */
const PLAIN_BLOCKS: OdBlockKind[] = ["separador", "kpis", "imagenes", "evolucion", "tabla_dinamica", "metodologia"];
/** De esos, los que la ficha admite una sola vez. */
const ONCE: OdBlockKind[] = ["evolucion", "tabla_dinamica", "metodologia"];
/** Familias cuyo conjunto se crea aquí con su formulario de definición. */
const CREATABLE: OdBlockKind[] = ["desgloses", "historico", "mapa_calor", "mapa", "tuberia", "rankings", "medallero", "saber_pro", "saber_tyt", "libre", "tablas_personalizadas"];
const ADD_LABEL: Partial<Record<OdBlockKind, string>> = { kpis: "Otro tablero de indicadores", desgloses: "Desglose", tablas_personalizadas: "Tabla personalizada" };
/** De dónde salen los datos de los tipos sin captura. */
const NO_CAPTURE_WHY: Partial<Record<OdBlockKind, string>> = {
  tabla_dinamica: "No se llena: se arma sola con las cifras de los indicadores del informe. Si le falta una cifra, se llena en el tablero de indicadores.",
  metodologia: "No se llena aquí: toma de cada indicador lo escrito en «Qué mide y cómo» y su oficina. Se cambian en el tablero de indicadores, en modo completo.",
  diversidad: "No se llena aquí: lee indicadores y desgloses del informe por su clave. Si una cifra falta, se llena en su indicador (tablero) o en su desglose.",
  modelo: "No tiene formulario: el modelo lo carga Planeación con su especificación.",
  tabla: "Esta tabla llegó con «Importar informe» y no tiene editor propio. Se vuelve a cargar desde la vista clásica.",
};

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

function TallerReport({ data, report, reportId, periodId, canEdit, progress, classicHref }: TallerProps & { reportId: string }) {
  const storage = useMemo(browserStorage, []);
  const storageKey = draftKey(periodId, reportId);
  const live = report!.status === "publicado";
  const tour = useTour();

  const saveBlocks = useSaveBlocks();
  const saveIndicator = useSaveIndicator();
  const saveValues = useSaveValues();
  const deleteIndicator = useDeleteIndicator();

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

  /* --- Un solo editor abierto, y aviso si se deja algo sin guardar ------------------- */

  /** Se tocó algo en un editor con su propio «Guardar» desde la última vez que la base cambió. */
  const dirty = useRef(false);
  const [leave, setLeave] = useState<{ run: () => void } | null>(null);
  useEffect(() => {
    dirty.current = false;
  }, [data.rows]);
  const touch = (event: { target: EventTarget }) => {
    // Lo que va al borrador del taller (título propio, qué conjuntos muestra) ya queda guardado o pendiente.
    if (event.target instanceof Element && event.target.closest("[data-odt-draft]")) return;
    dirty.current = true;
  };
  /** Hace `run`; si el editor abierto puede tener cambios sin guardar, pregunta antes. */
  const guard = (run: () => void) => {
    if (dirty.current) setLeave({ run });
    else run();
  };
  const openEditor = pick?.editing ? picked : undefined;

  const select = (block: DraftBlock, index: number) => {
    if (picked?.tempId === block.tempId) return;
    // Elegir otro bloque cierra el editor abierto: solo hay uno a la vez.
    guard(() => {
      dirty.current = false;
      setPick({ id: block.tempId, index, editing: false });
    });
  };
  const toggleEdit = (block: DraftBlock, index: number, editing: boolean) => {
    if (!editing) void loadEditors().catch(() => undefined);
    guard(() => {
      dirty.current = false;
      setPick({ id: block.tempId, index, editing: !editing });
    });
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
  /** Familia cuyo formulario de alta está abierto dentro de «Añadir». */
  const [creating, setCreating] = useState<OdBlockKind | null>(null);
  const [newIndicator, setNewIndicator] = useState(false);
  /** Tras crear un conjunto: en cuanto llegue su bloque, se elige y se abre para llenarlo. */
  const [awaiting, setAwaiting] = useState<{ kind: OdBlockKind; known: string[] } | null>(null);
  /** Los conjuntos de la familia que ya existían al abrir el formulario: el que no esté aquí es el nuevo. */
  const knownSets = useRef<string[]>([]);
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

  const add = (kind: OdBlockKind, refId: string | null = null, label = BLOCK_LABELS[kind]) => {
    const { blocks, tempId } = addBlock(currentBlocks(), kind, undefined, refId);
    changeBlocks(blocks);
    setAdding(false);
    setCreating(null);
    void loadEditors().catch(() => undefined);
    setPick({ id: tempId, index: blocks.list.length - 1, editing: isEditable(kind) && !refId });
    notify(
      kind === "kpis"
        ? "Añadí otro tablero de indicadores al final de la ficha. Elija abajo qué indicadores muestra."
        : `Añadí «${label}» al final de la ficha. Use «Subir» para llevarlo a su sitio.`,
    );
  };

  /** Los conjuntos del informe de la familia de un tipo de bloque. */
  const familyRows = (kind: OdBlockKind): { id: string; key: string }[] => {
    const own = <T extends { id: string; key: string; report_id: string }>(rows: T[] | undefined) => (rows ?? []).filter((x) => x.report_id === reportId);
    if (kind === "desgloses") return own(data.rows.breakdowns);
    if (kind === "mapa_calor") return own(data.rows.heatmaps);
    if (kind === "mapa") return own(data.rows.maps);
    if (kind === "tuberia") return own(data.rows.pipelines);
    if (kind === "historico") return own(data.rows.histories);
    if (kind === "rankings") return own(data.rows.rankings);
    if (kind === "medallero") return own(data.rows.medalBoards);
    if (kind === "saber_pro") return own(data.rows.saberPro);
    if (kind === "saber_tyt") return own(data.rows.saberTyt);
    if (kind === "libre" || kind === "tablas_personalizadas") return own(data.rows.freeSets);
    return [];
  };
  const beginCreate = (kind: OdBlockKind) => {
    knownSets.current = familyRows(kind).map((x) => x.id);
    setCreating(kind);
  };

  /** Un conjunto recién creado trae su bloque (lo pone la base): se espera, se elige y se abre. */
  const created = (kind: OdBlockKind) => {
    setCreating(null);
    setAdding(false);
    setAwaiting({ kind, known: knownSets.current });
    notify(`Se creó «${ADD_LABEL[kind] ?? BLOCK_LABELS[kind]}». Su bloque queda en la ficha, listo para llenar.`);
  };
  useEffect(() => {
    if (!awaiting) return;
    // Si en unos segundos no llegó, se deja de esperar: no se abre nada por sorpresa más tarde.
    const giveUp = window.setTimeout(() => setAwaiting(null), 8000);
    const fresh = familyRows(awaiting.kind).find((x) => !awaiting.known.includes(x.id));
    if (fresh) {
      const blocks = workingBlocks(draftRef.current, storedBlocks);
      // Su bloque propio; o, si la familia comparte bloque (desgloses, rankings, tablas…), el primero de ese tipo.
      const own = blocks.list.findIndex((b) => b.ref_id === fresh.id);
      const at = own >= 0 ? own : blocks.list.findIndex((b) => b.kind === awaiting.kind);
      if (at >= 0) {
        window.clearTimeout(giveUp);
        setAwaiting(null);
        const target = blocks.list[at];
        // Un bloque compartido que eligió los suyos no mostraría el nuevo: se le suma.
        const field = ({ desgloses: "breakdowns", rankings: "rankings", medallero: "medalleros", tablas_personalizadas: "tablas" } as const)[target.kind as "desgloses"];
        const chosen = field ? target.settings[field] : undefined;
        if (own < 0 && field && chosen?.length && !chosen.includes(fresh.key)) {
          changeBlocks(patchBlock(blocks, target.tempId, { settings: { ...target.settings, [field]: [...chosen, fresh.key] } }));
        }
        void loadEditors().catch(() => undefined);
        setPick({ id: target.tempId, index: at, editing: true });
      }
    }
    return () => window.clearTimeout(giveUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting, storedBlocks, data.rows]);

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
  /** Borrar un indicador es de inmediato (con su confirmación): lo pendiente de ese indicador se va con él. */
  const onDeleteIndicator = (indicatorId: string) => {
    deleteIndicator.mutate(indicatorId, {
      onSuccess: () =>
        update((d) => {
          const indicators = { ...d.indicators };
          delete indicators[indicatorId];
          const values = Object.fromEntries(Object.entries(d.values).filter(([key]) => !key.startsWith(`${indicatorId}::`))) as typeof d.values;
          return { ...d, indicators, values, pasted: d.pasted && Object.keys(values).length > 0 };
        }),
    });
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

  /** Conjuntos que el informe tiene y ningún bloque de la ficha muestra. */
  const orphans: { kind: OdBlockKind; id: string; title: string }[] = (() => {
    const refs = new Set(working.list.map((b) => b.ref_id).filter(Boolean));
    const own = <T extends { id: string; report_id: string; title: string }>(list: T[] | undefined, kind: OdBlockKind) =>
      (list ?? []).filter((x) => x.report_id === reportId && !refs.has(x.id)).map((x) => ({ kind, id: x.id, title: x.title }));
    const tables = working.list.some((b) => b.kind === "tablas_personalizadas");
    return [
      ...own(data.rows.heatmaps, "mapa_calor"),
      ...own(data.rows.maps, "mapa").filter((m) => !working.list.some((b) => b.kind === "mapa" && b.settings.mapWith === data.rows.maps.find((x) => x.id === m.id)?.key)),
      ...own(data.rows.pipelines, "tuberia"),
      ...own(data.rows.histories, "historico"),
      ...own((data.rows.freeSets ?? []).filter((fs) => !(tables && customViewOf(fs))), "libre"),
    ];
  })();
  const has = (kind: OdBlockKind) => working.list.some((b) => b.kind === kind);
  const station = { data, report, periodId, canEdit, progress };

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
            const editing = selected && Boolean(pick?.editing) && canEdit && isEditable(block.kind);
            const ownSave = OWN_SAVE.includes(block.kind);
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
                    {canEdit && isEditable(block.kind) && (
                      <button
                        type="button"
                        className="button-primary"
                        data-act="editar"
                        onMouseEnter={() => void loadEditors().catch(() => undefined)}
                        onFocus={() => void loadEditors().catch(() => undefined)}
                        onClick={() => toggleEdit(block, index, editing)}
                      >
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
                    {block.kind === "tabla" && (
                      <Link className="button-ghost" to={classicHref(classic.station, classic.hash)}>
                        Volver a cargarla en la vista clásica <small>({classic.where})</small>
                      </Link>
                    )}
                    {canEdit && (
                      <button type="button" className="button-ghost odt-danger" data-act="quitar" disabled={saving} onClick={() => guard(() => { dirty.current = false; remove(block, index); })}>
                        Quitar
                      </button>
                    )}
                  </div>
                )}

                {leave && openEditor?.tempId === block.tempId && (
                  <div className="odt-ask" role="alertdialog" aria-labelledby="odt-salir-titulo" aria-describedby="odt-salir-texto">
                    <p>
                      <strong id="odt-salir-titulo">
                        <Icon name="alert" size={15} /> ¿Cerrar «{name}» sin guardar?
                      </strong>
                      <span id="odt-salir-texto">
                        Puede haber cambios sin guardar en este bloque. Si lo cierra ahora, se pierden. Para conservarlos, pulse
                        «Seguir editando» y después «Guardar» dentro del bloque.
                      </span>
                    </p>
                    <div className="odt-ask__actions">
                      <button type="button" className="button-primary" autoFocus onClick={() => setLeave(null)}>
                        Seguir editando
                      </button>
                      <button
                        type="button"
                        className="button-ghost"
                        onClick={() => {
                          const run = leave.run;
                          dirty.current = false;
                          setLeave(null);
                          run();
                        }}
                      >
                        Cerrar sin guardar
                      </button>
                    </div>
                  </div>
                )}

                <div className="odt-block__body">
                  {editing && block.kind !== "separador" && block.kind !== "kpis" && (
                    <div
                      className="odt-editor-wrap"
                      // Cualquier cosa escrita, elegida o pegada en un editor con su propio «Guardar» cuenta como «puede haber cambios».
                      onInputCapture={ownSave ? touch : undefined}
                      onChangeCapture={ownSave ? touch : undefined}
                      onPasteCapture={ownSave ? touch : undefined}
                    >
                      {ownSave && (
                        <p className={live ? "oda-banner" : "odt-tip"} role="note">
                          {live && <Icon name="alert" size={16} />}
                          {live ? (
                            <span>
                              <strong>Este informe está publicado: lo que guarde en este bloque se ve en el portal de inmediato.</strong> Este
                              editor no usa los cambios pendientes: guarda con su propio botón «Guardar».
                            </span>
                          ) : (
                            <span>
                              Este bloque se guarda con su propio botón <strong>«Guardar»</strong>, aquí dentro. Al guardar, la ficha de abajo se
                              actualiza.
                            </span>
                          )}
                        </p>
                      )}
                      <Suspense fallback={<p className="odt-empty">Abriendo el editor…</p>}>
                        <BlockEditor
                          block={block}
                          shown={shown}
                          station={station}
                          viewReport={viewReport}
                          mode={mode}
                          onSettings={(settings) => changeBlocks(patchBlock(currentBlocks(), block.tempId, { settings }))}
                          guard={guard}
                        />
                      </Suspense>
                    </div>
                  )}

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
                        onDelete={onDeleteIndicator}
                        deleting={deleteIndicator.isPending}
                        deleteError={deleteIndicator.error}
                        live={live}
                      />
                      {newIndicator ? (
                        <Suspense fallback={<p className="odt-empty">Abriendo el formulario…</p>}>
                          {live && (
                            <p className="oda-banner" role="note">
                              <Icon name="alert" size={16} />
                              Este informe está publicado: el indicador nuevo se guarda de inmediato y sale en el portal como «sin reportar» hasta que tenga cifras.
                            </p>
                          )}
                          <NewIndicator
                            station={station}
                            onCancel={() => setNewIndicator(false)}
                            onCreated={(key) => {
                              setNewIndicator(false);
                              // Un tablero con indicadores elegidos suma el nuevo a los suyos; uno sin elección ya lo recoge.
                              if (block.settings.indicators?.length) {
                                changeBlocks(patchBlock(currentBlocks(), block.tempId, { settings: { ...block.settings, indicators: [...block.settings.indicators, key] } }));
                              }
                              notify("Se creó el indicador. Ya puede llenar sus cifras en la rejilla.");
                            }}
                          />
                        </Suspense>
                      ) : (
                        <div>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={!canEdit}
                            onClick={() => {
                              void loadEditors().catch(() => undefined);
                              setNewIndicator(true);
                            }}
                          >
                            <Icon name="plus" size={15} /> Nuevo indicador
                          </button>
                        </div>
                      )}
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
                        </div>
                      ) : rendered.node ? (
                        <div className="odt-copy" ref={makeInert} aria-hidden="true">
                          {rendered.node}
                        </div>
                      ) : (
                        <p className="odt-empty">
                          {block.kind === "kpis"
                            ? "Este tablero no tiene indicadores que mostrar. Pulse «Editar» y elija cuáles muestra."
                            : isEditable(block.kind)
                              ? "Este bloque todavía no tiene datos: el público no lo ve hasta que los tenga. Pulse «Editar» para llenarlo."
                              : "Este bloque todavía no tiene datos: el público no lo ve hasta que los tenga."}
                        </p>
                      )}
                      {selected && NO_CAPTURE_WHY[block.kind] && <p className="odt-note odt-origin">{NO_CAPTURE_WHY[block.kind]}</p>}
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
          <button
            type="button"
            className="button-secondary"
            disabled={!canEdit}
            onMouseEnter={() => void loadEditors().catch(() => undefined)}
            onFocus={() => void loadEditors().catch(() => undefined)}
            onClick={() => guard(() => { dirty.current = false; setPick((current) => (current ? { ...current, editing: false } : current)); setAdding(true); })}
          >
            <Icon name="plus" size={15} /> Añadir algo a la ficha
          </button>
        ) : creating ? (
          <>
            <div className="odt-add__head">
              <strong>Crear: {ADD_LABEL[creating] ?? BLOCK_LABELS[creating]}</strong>
              <button type="button" className="button-ghost" onClick={() => setCreating(null)}>
                Volver a la lista
              </button>
            </div>
            <p className={live ? "oda-banner" : "odt-note"} role="note">
              {live && <Icon name="alert" size={16} />}
              {live
                ? "Este informe está publicado: lo que cree aquí se guarda de inmediato. El portal no lo dibuja hasta que tenga cifras."
                : "Al crearlo queda su bloque en la ficha, al final, listo para llenar."}
            </p>
            <Suspense fallback={<p className="odt-empty">Abriendo el formulario…</p>}>
              <AddDataset kind={creating} station={station} onDone={() => created(creating)} onCancel={() => setCreating(null)} />
            </Suspense>
          </>
        ) : (
          <>
            <div className="odt-add__head">
              <strong>¿Qué quiere añadir? Estos son los veinte tipos de bloque de la ficha.</strong>
              <button type="button" className="button-ghost" autoFocus onClick={() => setAdding(false)}>
                Cancelar
              </button>
            </div>
            {orphans.length > 0 && (
              <section className="odt-add__group" aria-label="Lo que el informe tiene y la ficha no muestra">
                <h4>El informe tiene esto y la ficha no lo muestra</h4>
                <ul>
                  {orphans.map((orphan) => (
                    <li key={`${orphan.kind}-${orphan.id}`} className="odt-option" data-live>
                      <strong>{orphan.title}</strong>
                      <span>{BLOCK_LABELS[orphan.kind]}</span>
                      <div className="odt-option__actions">
                        <button type="button" className="button-secondary" onClick={() => add(orphan.kind, orphan.id, orphan.title)}>
                          Poner en la ficha
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {BLOCK_GROUPS.map((group) => (
              <section key={group.title} className="odt-add__group" aria-label={group.title}>
                <h4>{group.title}</h4>
                <ul>
                  {group.kinds.map((kind) => {
                    const plain = PLAIN_BLOCKS.includes(kind);
                    const repeated = ONCE.includes(kind) && has(kind);
                    const single = (kind === "saber_pro" && (data.rows.saberPro ?? []).some((x) => x.report_id === reportId)) || (kind === "saber_tyt" && (data.rows.saberTyt ?? []).some((x) => x.report_id === reportId));
                    const creatable = CREATABLE.includes(kind) && !single;
                    // Un bloque que lee lo que el informe ya tiene: se pone si falta.
                    const reads =
                      !has(kind) &&
                      ((kind === "diversidad" && indicatorRows.some((i) => i.key === "grupo-especial")) ||
                        (kind === "modelo" && (data.rows.models ?? []).some((m) => m.report_id === reportId)) ||
                        (kind === "desgloses" && data.rows.breakdowns.some((b) => b.report_id === reportId)) ||
                        (kind === "rankings" && (data.rows.rankings ?? []).some((r) => r.report_id === reportId)) ||
                        (kind === "medallero" && (data.rows.medalBoards ?? []).some((m) => m.report_id === reportId)) ||
                        (kind === "tablas_personalizadas" && (data.rows.freeSets ?? []).some((fs) => fs.report_id === reportId && customViewOf(fs))) ||
                        single);
                    const why =
                      repeated || (single && has(kind))
                        ? "Ya está en la ficha."
                        : kind === "tabla"
                          ? "Solo llega con «Importar informe», en la vista clásica."
                          : kind === "diversidad" && !reads
                            ? has(kind) ? "Ya está en la ficha." : "Lee indicadores con claves propias del informe de Diversidad: este informe no los tiene."
                            : kind === "modelo" && !reads
                              ? has(kind) ? "Ya está en la ficha." : "El modelo lo carga Planeación; este informe no tiene uno."
                              : null;
                    return (
                      <li key={kind} className="odt-option" data-live={((plain && !repeated) || creatable || reads) || undefined}>
                        <strong>{ADD_LABEL[kind] ?? BLOCK_LABELS[kind]}</strong>
                        <span>{blockHelp(kind)}</span>
                        <div className="odt-option__actions">
                          {plain && !repeated && (
                            <button type="button" className="button-secondary" onClick={() => add(kind)}>
                              Añadir
                            </button>
                          )}
                          {creatable && (
                            <button type="button" className="button-secondary" onClick={() => beginCreate(kind)}>
                              Crear uno nuevo
                            </button>
                          )}
                          {reads && (
                            <button type="button" className="button-secondary" onClick={() => add(kind)}>
                              Poner el bloque en la ficha
                            </button>
                          )}
                          {why && <small className="odt-note">{why}</small>}
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
