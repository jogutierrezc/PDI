/* =============================================================================
   UDES en Cifras · el taller: lo que está escrito y todavía no llegó a la base.

   Todo cambio del taller pasa primero por este borrador: cifras de la rejilla,
   ajustes de un indicador y el orden de los bloques. Qué se hace con él
   depende del informe:

   · Informe sin publicar: se escribe solo, un segundo después de la última
     tecla, con las mutaciones de siempre.
   · Informe publicado: no hay capa de borrador en la base y guardar se vería
     en el portal al instante. Los cambios se quedan aquí, pendientes, hasta
     que la persona pulse «Publicar cambios»; se guardan en el navegador (por
     informe y periodo) para que sobrevivan a una recarga.

   La vista del taller se dibuja con el borrador puesto encima de lo guardado
   (`overlayRows`): lo pendiente se ve, y la gráfica cambia mientras se escribe.

   Módulo puro: no conoce React, la base ni `window`. El almacenamiento entra
   como parámetro y cada acceso va en try/catch (ventana privada, cuota llena).
   ========================================================================== */

import type { OdBlockKind, OdIndicatorRow, OdReportBlockRow, OdValueRow } from "../../../../types/database";
import type { OpenDataRows } from "../../../datos-abiertos/data/repository";
import { TOTAL, draftToValues, splitColumnKey, splitRowKey, storedKeyOf } from "../indicator-grid";
import type { CellKey } from "../sheet";

/* --- Forma ------------------------------------------------------------------ */

/** Lo que el taller deja cambiar de un indicador. La clave no está: no cambia tras crear. */
export const INDICATOR_FIELDS = ["label", "unit", "format", "direction", "aggregation", "reporting", "annual_rule", "office_id", "definition", "years"] as const;
export type IndicatorField = (typeof INDICATOR_FIELDS)[number];
export type IndicatorPatch = Partial<Pick<OdIndicatorRow, IndicatorField>>;

export type DraftBlock = Omit<OdReportBlockRow, "id" | "report_id"> & { id?: string; tempId: string };

export interface BlocksDraft {
  list: DraftBlock[];
  /** Ids de bloques guardados que se quitaron de la ficha. */
  removed: string[];
}

export interface TallerDraft {
  /** Casillas cambiadas, con la clave de DataGrid. `null` es «sin reportar». */
  values: Record<CellKey, number | null>;
  /** Alguna de esas casillas llegó pegada desde Excel: el rastro en od_imports lo dice. */
  pasted: boolean;
  /** Ajustes por id de indicador. */
  indicators: Record<string, IndicatorPatch>;
  /** La lista de bloques entera cuando cambió; null si está como en la base. */
  blocks: BlocksDraft | null;
}

export const emptyDraft = (): TallerDraft => ({ values: {}, pasted: false, indicators: {}, blocks: null });

export interface ChangeCount {
  cells: number;
  settings: number;
  blocks: number;
  total: number;
}

/** Cuántos cambios hay: cada casilla, cada ajuste de indicador y la ficha (orden y bloques) como uno. */
export function countChanges(draft: TallerDraft): ChangeCount {
  const cells = Object.keys(draft.values).length;
  const settings = Object.values(draft.indicators).reduce((sum, patch) => sum + Object.keys(patch).length, 0);
  const blocks = draft.blocks ? 1 : 0;
  return { cells, settings, blocks, total: cells + settings + blocks };
}

export const isEmptyDraft = (draft: TallerDraft) => countChanges(draft).total === 0;

/** «3 casillas · 1 ajuste de indicador · el orden de la ficha». */
export function describeChanges(count: ChangeCount): string {
  const parts: string[] = [];
  if (count.cells) parts.push(`${count.cells} ${count.cells === 1 ? "casilla" : "casillas"}`);
  if (count.settings) parts.push(`${count.settings} ${count.settings === 1 ? "ajuste de indicador" : "ajustes de indicador"}`);
  if (count.blocks) parts.push("los bloques de la ficha");
  return parts.join(" · ");
}

/* --- Cifras ------------------------------------------------------------------ */

/**
 * La rejilla entrega su borrador completo (ya sin las casillas que volvieron a
 * su valor guardado): se pone tal cual. `pasted` solo se enciende; se apaga
 * cuando ya no queda ninguna casilla por guardar.
 */
export function setValues(draft: TallerDraft, values: Record<CellKey, number | null>, pasted = false): TallerDraft {
  const any = Object.keys(values).length > 0;
  return { ...draft, values, pasted: any && (draft.pasted || pasted) };
}

/** Fusiona casillas sueltas: la que vuelve a lo guardado deja de ser un cambio. */
export function mergeValues(
  draft: TallerDraft,
  edits: Record<CellKey, number | null>,
  stored: Map<string, number | null>,
  pasted = false,
): TallerDraft {
  const values = { ...draft.values };
  for (const [key, value] of Object.entries(edits) as [CellKey, number | null][]) {
    if (value === storedOf(stored, key)) delete values[key];
    else values[key] = value;
  }
  return setValues(draft, values, pasted);
}

/** Lo guardado en la base para una casilla de la rejilla. */
export function storedOf(stored: Map<string, number | null>, key: CellKey): number | null {
  const [rowKey, column] = key.split("|");
  const { indicatorId, campus } = splitRowKey(rowKey);
  const { year, term } = splitColumnKey(column);
  return stored.get(storedKeyOf(indicatorId, year, term, campus)) ?? null;
}

/**
 * Para «Deshacer» un pegado: lo que valía cada casilla que el pegado tocó.
 * Se devuelve como ediciones, listas para `mergeValues`: funciona aunque el
 * pegado ya se haya guardado solo.
 */
export function undoEdits(
  before: Record<CellKey, number | null>,
  after: Record<CellKey, number | null>,
  stored: Map<string, number | null>,
): Record<CellKey, number | null> {
  const edits: Record<CellKey, number | null> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<CellKey>;
  for (const key of keys) {
    const was = key in before ? before[key] : storedOf(stored, key);
    const is = key in after ? after[key] : storedOf(stored, key);
    if (was !== is) edits[key] = was;
  }
  return edits;
}

/* --- Indicadores -------------------------------------------------------------- */

/** Fusiona un ajuste: el campo que vuelve a lo guardado deja de ser un cambio. */
export function patchIndicator(draft: TallerDraft, stored: OdIndicatorRow, patch: IndicatorPatch): TallerDraft {
  const merged: IndicatorPatch = { ...draft.indicators[stored.id], ...patch };
  const kept: Record<string, unknown> = {};
  for (const field of INDICATOR_FIELDS) {
    if (!(field in merged)) continue;
    const base = field === "reporting" ? stored.reporting ?? "periodo" : stored[field];
    // Los años con dato son una lista (o null: todos): se comparan por contenido.
    const same = field === "years" ? JSON.stringify(merged[field] ?? null) === JSON.stringify(base ?? null) : merged[field] === base;
    if (!same) kept[field] = merged[field];
  }
  const indicators = { ...draft.indicators };
  if (Object.keys(kept).length) indicators[stored.id] = kept as IndicatorPatch;
  else delete indicators[stored.id];
  return { ...draft, indicators };
}

/** El indicador como quedaría: lo guardado con su ajuste pendiente encima. */
export const effectiveIndicator = (stored: OdIndicatorRow, draft: TallerDraft): OdIndicatorRow =>
  draft.indicators[stored.id] ? { ...stored, ...draft.indicators[stored.id] } : stored;

/**
 * Cambiar cómo se reporta arrastra la regla del año, igual que en Estructura:
 * por año, la cifra del año es la reportada; de vuelta a periodos, si la regla
 * era «se reporta aparte» pasa a «suma de los periodos 1 y 2».
 */
export function reportingPatch(indicator: Pick<OdIndicatorRow, "annual_rule">, reporting: "periodo" | "anual"): IndicatorPatch {
  return {
    reporting,
    annual_rule: reporting === "anual" ? "reportado" : indicator.annual_rule === "reportado" ? "suma" : indicator.annual_rule,
  };
}

/** Cuántas cifras tiene cargadas un indicador en esos periodos, contando lo pendiente. */
function countFigures(indicatorId: string, stored: Map<string, number | null>, values: Record<CellKey, number | null>, terms: readonly string[]): number {
  const filled = new Map<string, boolean>();
  for (const [key, value] of stored) {
    const [id, , term] = key.split("|");
    if (id === indicatorId && terms.includes(term)) filled.set(key, value !== null);
  }
  for (const [key, value] of Object.entries(values) as [CellKey, number | null][]) {
    const [rowKey, column] = key.split("|");
    const { indicatorId: id, campus } = splitRowKey(rowKey);
    const { year, term } = splitColumnKey(column);
    if (id === indicatorId && terms.includes(term)) filled.set(storedKeyOf(id, year, term, campus), value !== null);
  }
  return Array.from(filled.values()).filter(Boolean).length;
}

/** Cifras por periodo (1 y 2) cargadas: las que dejan de verse si el dato pasa a reportarse por año. */
export const termFiguresOf = (indicatorId: string, stored: Map<string, number | null>, values: Record<CellKey, number | null>) =>
  countFigures(indicatorId, stored, values, ["A", "B"]);

/** Cifras del año cargadas: las que dejan de verse si el dato pasa a reportarse por periodo con una regla que las calcula. */
export const annualFiguresOf = (indicatorId: string, stored: Map<string, number | null>, values: Record<CellKey, number | null>) =>
  countFigures(indicatorId, stored, values, ["anual"]);

/* --- Bloques ------------------------------------------------------------------- */

/** Los bloques guardados de un informe, en su orden, listos para editar. */
export function blocksFromRows(rows: OdReportBlockRow[], reportId: string): DraftBlock[] {
  return rows
    .filter((b) => b.report_id === reportId)
    .sort((a, b) => a.position - b.position)
    .map(({ report_id: _report, ...b }) => ({ ...b, tempId: b.id }));
}

const renumber = (list: DraftBlock[]) => list.map((b, i) => (b.position === i + 1 ? b : { ...b, position: i + 1 }));
const comparable = (list: DraftBlock[]) => JSON.stringify(renumber(list).map(({ tempId: _t, ...b }) => b));

/** Deja en el borrador la lista de bloques, o nada si quedó igual a la guardada. */
export function setBlocks(draft: TallerDraft, next: BlocksDraft, stored: DraftBlock[]): TallerDraft {
  const list = renumber(next.list);
  const same = next.removed.length === 0 && comparable(list) === comparable(stored);
  return { ...draft, blocks: same ? null : { list, removed: next.removed } };
}

/**
 * La lista con que se trabaja: la pendiente o, si no hay, la guardada. Con una
 * lista pendiente, un bloque guardado que ella no conoce (lo creó hace un
 * momento otro editor: un conjunto nuevo entra a la ficha con su bloque) se
 * añade al final, salvo que se haya quitado a propósito.
 */
export function workingBlocks(draft: TallerDraft, stored: DraftBlock[]): BlocksDraft {
  if (!draft.blocks) return { list: stored, removed: [] };
  const known = new Set<string>([...draft.blocks.list.flatMap((b) => [b.tempId, ...(b.id ? [b.id] : [])]), ...draft.blocks.removed]);
  // Un bloque nuevo ya guardado y todavía sin id en el borrador se reconoce por su tipo y su clave corta.
  const slots = new Set(draft.blocks.list.filter((b) => !b.id && b.settings.slot).map((b) => `${b.kind}:${b.settings.slot}`));
  const fresh = stored.filter((b) => !known.has(b.tempId) && !(b.settings.slot && slots.has(`${b.kind}:${b.settings.slot}`)));
  return fresh.length ? { list: renumber([...draft.blocks.list, ...fresh]), removed: draft.blocks.removed } : draft.blocks;
}

export function moveBlock(blocks: BlocksDraft, tempId: string, delta: -1 | 1): BlocksDraft {
  const from = blocks.list.findIndex((b) => b.tempId === tempId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= blocks.list.length) return blocks;
  const list = [...blocks.list];
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return { ...blocks, list: renumber(list) };
}

export function patchBlock(blocks: BlocksDraft, tempId: string, change: Partial<Pick<DraftBlock, "visible" | "settings">>): BlocksDraft {
  return { ...blocks, list: blocks.list.map((b) => (b.tempId === tempId ? { ...b, ...change } : b)) };
}

/** Clave corta para distinguir varios bloques del mismo tipo (ver 0029). */
export const newSlot = () => Math.random().toString(36).slice(2, 10);

export function addBlock(
  blocks: BlocksDraft,
  kind: OdBlockKind,
  slot: string = newSlot(),
  /** Un conjunto que ya existe y la ficha no muestra: el bloque apunta a él. */
  refId: string | null = null,
): { blocks: BlocksDraft; tempId: string } {
  const tempId = `nuevo-${kind}-${slot}`;
  const block: DraftBlock = {
    kind,
    ref_id: refId,
    visible: true,
    position: blocks.list.length + 1,
    settings: kind === "separador" ? { title: "", slot } : kind === "imagenes" ? { images: [], columns: 2, slot } : kind === "evolucion" ? { chart: "lineas", slot } : { slot },
    tempId,
  };
  return { blocks: { ...blocks, list: renumber([...blocks.list, block]) }, tempId };
}

/** Lo necesario para deshacer un «Quitar»: el bloque y dónde estaba. */
export interface RemovedBlock {
  block: DraftBlock;
  index: number;
}

/** Quita el bloque de la ficha. No borra sus cifras: solo deja de mostrarse. */
export function removeBlock(blocks: BlocksDraft, tempId: string): { blocks: BlocksDraft; undo: RemovedBlock | null } {
  const index = blocks.list.findIndex((b) => b.tempId === tempId);
  if (index < 0) return { blocks, undo: null };
  const block = blocks.list[index];
  return {
    blocks: {
      list: renumber(blocks.list.filter((b) => b.tempId !== tempId)),
      removed: block.id ? [...blocks.removed, block.id] : blocks.removed,
    },
    undo: { block, index },
  };
}

/**
 * Devuelve a su sitio un bloque quitado. Si la quita ya se había guardado (el
 * bloque ya no está en la base), vuelve como bloque nuevo, con su mismo
 * contenido: la mutación lo insertará en vez de actualizar un id que no existe.
 */
export function restoreBlock(blocks: BlocksDraft, undo: RemovedBlock, storedIds: ReadonlySet<string>): BlocksDraft {
  if (blocks.list.some((b) => b.tempId === undo.block.tempId)) return blocks;
  const gone = Boolean(undo.block.id) && !storedIds.has(undo.block.id!);
  const { id: _id, ...rest } = undo.block;
  const block: DraftBlock = gone ? rest : undo.block;
  const list = [...blocks.list];
  list.splice(Math.min(undo.index, list.length), 0, block);
  return { list: renumber(list), removed: blocks.removed.filter((id) => id !== undo.block.id) };
}

/**
 * Clave de React de un bloque. Un bloque nuevo cambia de id al guardarse; con
 * su `slot` (la clave corta que lleva todo separador o tablero añadido) sigue
 * siendo el mismo elemento en pantalla, y quien estaba escribiendo su título
 * no pierde el foco. Sin `slot`, o si se repite, vale su id.
 */
export function blockKeys(list: DraftBlock[]): string[] {
  const bySlot = list.map((b) => (b.settings.slot ? `${b.kind}:${b.settings.slot}` : null));
  return list.map((b, i) => (bySlot[i] && bySlot.indexOf(bySlot[i]) === bySlot.lastIndexOf(bySlot[i]) ? bySlot[i]! : b.tempId));
}

/**
 * Un bloque nuevo que ya se guardó (la base ya lo tiene, con su id) pero que
 * siguió cambiando mientras viajaba, sigue en el borrador sin id. Antes de
 * volver a mandarlo se le pone el id del guardado —el del mismo tipo y la
 * misma `slot`—, o la base lo insertaría dos veces.
 */
export function adoptSavedIds(blocks: BlocksDraft, stored: DraftBlock[]): BlocksDraft {
  const taken = new Set(blocks.list.map((b) => b.id).filter(Boolean));
  let changed = false;
  const list = blocks.list.map((b) => {
    if (b.id || !b.settings.slot) return b;
    const saved = stored.find((s) => s.id && !taken.has(s.id) && s.kind === b.kind && s.settings.slot === b.settings.slot);
    if (!saved?.id) return b;
    taken.add(saved.id);
    changed = true;
    return { ...b, id: saved.id };
  });
  return changed ? { ...blocks, list } : blocks;
}

/* --- Lo que se manda a la base ---------------------------------------------------- */

export interface BlocksPayload {
  reportId: string;
  blocks: (Omit<OdReportBlockRow, "id"> & { id?: string })[];
  remove: string[];
}

/** La lista de bloques para `useSaveBlocks`: con id se actualiza, sin id se inserta. */
export function blocksPayload(blocks: BlocksDraft, reportId: string, storedIds: ReadonlySet<string>): BlocksPayload {
  return {
    reportId,
    remove: blocks.removed.filter((id) => storedIds.has(id)),
    blocks: renumber(blocks.list).map(({ tempId: _t, id, ...b }) => ({
      ...b,
      report_id: reportId,
      ...(id && storedIds.has(id) ? { id } : {}),
    })),
  };
}

/** Una fila por indicador con ajustes, para `useSaveIndicator`. */
export function indicatorPayloads(draft: TallerDraft, reportId: string): (IndicatorPatch & { id: string; report_id: string })[] {
  return Object.entries(draft.indicators).map(([id, patch]) => ({ ...patch, id, report_id: reportId }));
}

/** Las casillas pendientes como filas de `od_values`. */
export const valuesPayload = (draft: TallerDraft): OdValueRow[] => draftToValues(draft.values);

/**
 * Lo que se mandó ya está en la base: se quita del borrador. Lo que cambió
 * mientras viajaba (otra tecla, otro ajuste) se queda para el siguiente envío.
 */
export function settle(draft: TallerDraft, sent: Partial<TallerDraft>): TallerDraft {
  let next = draft;
  if (sent.blocks && draft.blocks === sent.blocks) next = { ...next, blocks: null };
  if (sent.indicators) {
    const indicators: Record<string, IndicatorPatch> = {};
    for (const [id, patch] of Object.entries(next.indicators)) {
      const done = sent.indicators[id] ?? {};
      const left = Object.fromEntries(Object.entries(patch).filter(([field, value]) => !(field in done) || (done as Record<string, unknown>)[field] !== value));
      if (Object.keys(left).length) indicators[id] = left as IndicatorPatch;
    }
    next = { ...next, indicators };
  }
  if (sent.values) {
    const values = { ...next.values };
    for (const [key, value] of Object.entries(sent.values) as [CellKey, number | null][]) {
      if (key in values && values[key] === value) delete values[key];
    }
    next = { ...next, values, pasted: Object.keys(values).length > 0 && next.pasted };
  }
  return next;
}

/* --- Lo pendiente, a la vista -------------------------------------------------------- */

/**
 * Las filas del informe con el borrador encima: indicadores ajustados, cifras
 * pendientes y bloques en su orden nuevo. Devuelve solo este informe (los
 * demás no hacen falta para dibujar su ficha), listo para `assembleCatalog`.
 */
export function overlayRows(rows: OpenDataRows, reportId: string, draft: TallerDraft): OpenDataRows {
  const indicators = rows.indicators
    .filter((i) => i.report_id === reportId)
    .map((i) => effectiveIndicator(i, draft));
  const ids = new Set(indicators.map((i) => i.id));

  const values = new Map<string, OdValueRow>();
  for (const v of rows.values) {
    if (ids.has(v.indicator_id)) values.set(storedKeyOf(v.indicator_id, v.year, v.term, v.campus_id ?? TOTAL), v);
  }
  for (const row of draftToValues(draft.values)) {
    if (!ids.has(row.indicator_id)) continue;
    const key = storedKeyOf(row.indicator_id, row.year, row.term, row.campus_id ?? TOTAL);
    values.set(key, { ...values.get(key), ...row });
  }

  const blocks: OdReportBlockRow[] = draft.blocks
    ? workingBlocks(draft, blocksFromRows(rows.blocks, reportId)).list.map(({ tempId, id, ...b }, index) => ({ ...b, id: id ?? tempId, report_id: reportId, position: index + 1 }))
    : rows.blocks.filter((b) => b.report_id === reportId);

  return {
    ...rows,
    reports: rows.reports.filter((r) => r.id === reportId),
    indicators,
    values: Array.from(values.values()),
    blocks,
  };
}

/**
 * Un borrador recuperado del navegador puede hablar de cosas que ya no están
 * (un indicador borrado, un campus que salió del periodo, un año fuera de él):
 * se le quita lo que ya no tiene dónde caer.
 */
export function pruneDraft(draft: TallerDraft, rows: OpenDataRows, reportId: string): TallerDraft {
  const ids = new Set(rows.indicators.filter((i) => i.report_id === reportId).map((i) => i.id));
  const campuses = new Set([TOTAL, ...rows.campuses.map((c) => c.campus_id)]);
  const values: Record<CellKey, number | null> = {};
  for (const [key, value] of Object.entries(draft.values) as [CellKey, number | null][]) {
    const [rowKey, column] = key.split("|");
    const { indicatorId, campus } = splitRowKey(rowKey ?? "");
    const { year, term } = splitColumnKey(column ?? "");
    const inPeriod = Number(year) >= rows.period.start_year && Number(year) <= rows.period.end_year;
    if (ids.has(indicatorId) && campuses.has(campus) && inPeriod && (term === "A" || term === "B" || term === "anual")) values[key] = value;
  }
  const indicators = Object.fromEntries(Object.entries(draft.indicators).filter(([id]) => ids.has(id)));
  const storedIds = new Set(rows.blocks.filter((b) => b.report_id === reportId).map((b) => b.id));
  const blocks = draft.blocks ? { list: draft.blocks.list, removed: draft.blocks.removed.filter((id) => storedIds.has(id)) } : null;
  return { values, pasted: draft.pasted && Object.keys(values).length > 0, indicators, blocks };
}

/* --- En el navegador ------------------------------------------------------------------- */

/** Lo mínimo de `localStorage` que hace falta: en las pruebas entra uno de mentira. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const draftKey = (periodId: string, reportId: string) => `odt:pendiente:${periodId}:${reportId}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Lee el borrador guardado. Algo ilegible o de otra forma se trata como «no hay». */
export function loadDraft(storage: DraftStorage | null | undefined, key: string): TallerDraft {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return emptyDraft();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return emptyDraft();
    const values: Record<CellKey, number | null> = {};
    if (isRecord(parsed.values)) {
      for (const [k, v] of Object.entries(parsed.values)) {
        if (/^[^|]+::[^|]+\|\d{4}-(A|B|anual)$/.test(k) && (v === null || (typeof v === "number" && Number.isFinite(v)))) values[k as CellKey] = v;
      }
    }
    const indicators: Record<string, IndicatorPatch> = {};
    if (isRecord(parsed.indicators)) {
      for (const [id, patch] of Object.entries(parsed.indicators)) {
        if (!isRecord(patch)) continue;
        const clean = Object.fromEntries(Object.entries(patch).filter(([field]) => (INDICATOR_FIELDS as readonly string[]).includes(field)));
        if (Object.keys(clean).length) indicators[id] = clean as IndicatorPatch;
      }
    }
    let blocks: BlocksDraft | null = null;
    if (isRecord(parsed.blocks) && Array.isArray(parsed.blocks.list) && Array.isArray(parsed.blocks.removed)) {
      const list = (parsed.blocks.list as unknown[]).filter(
        (b): b is DraftBlock => isRecord(b) && typeof b.kind === "string" && typeof b.tempId === "string" && isRecord(b.settings),
      );
      blocks = { list, removed: (parsed.blocks.removed as unknown[]).filter((id): id is string => typeof id === "string") };
    }
    return { values, pasted: parsed.pasted === true && Object.keys(values).length > 0, indicators, blocks };
  } catch {
    return emptyDraft();
  }
}

/** Guarda el borrador; vacío, borra la entrada. Devuelve si quedó escrito. */
export function saveDraft(storage: DraftStorage | null | undefined, key: string, draft: TallerDraft): boolean {
  try {
    if (!storage) return false;
    if (isEmptyDraft(draft)) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage: DraftStorage | null | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* sin almacenamiento: no había nada que borrar */
  }
}

/** `localStorage`, o nada si el navegador no lo deja tocar. */
export function browserStorage(): DraftStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/* --- Preferencias de la vista (por navegador) --------------------------------------------- */

export type TallerView = "taller" | "clasica";
export type TallerMode = "sencillo" | "completo";

const VIEW_KEY = "odt:vista";
const MODE_KEY = "odt:modo";

/** La vista elegida; sin elección guardada, la clásica. */
export function readView(storage: DraftStorage | null | undefined): TallerView {
  try {
    return storage?.getItem(VIEW_KEY) === "taller" ? "taller" : "clasica";
  } catch {
    return "clasica";
  }
}

export function writeView(storage: DraftStorage | null | undefined, view: TallerView): void {
  try {
    storage?.setItem(VIEW_KEY, view);
  } catch {
    /* no se recuerda; la vista funciona igual */
  }
}

/** El modo del editor; sin elección guardada, sencillo. */
export function readMode(storage: DraftStorage | null | undefined): TallerMode {
  try {
    return storage?.getItem(MODE_KEY) === "completo" ? "completo" : "sencillo";
  } catch {
    return "sencillo";
  }
}

export function writeMode(storage: DraftStorage | null | undefined, mode: TallerMode): void {
  try {
    storage?.setItem(MODE_KEY, mode);
  } catch {
    /* no se recuerda */
  }
}
