import { describe, expect, it } from "vitest";
import type { OdIndicatorRow, OdReportBlockRow } from "../../../../types/database";
import { assembleCatalog } from "../../../datos-abiertos/data/repository";
import type { OpenDataRows } from "../../../datos-abiertos/data/repository";
import { TOTAL, indexValues, rowKeyOf } from "../indicator-grid";
import { cellKey } from "../sheet";
import type { CellKey } from "../sheet";
import {
  addBlock,
  adoptSavedIds,
  blockKeys,
  blocksFromRows,
  blocksPayload,
  countChanges,
  describeChanges,
  draftKey,
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
  readView,
  removeBlock,
  reportingPatch,
  restoreBlock,
  saveDraft,
  setBlocks,
  setValues,
  settle,
  termFiguresOf,
  undoEdits,
  valuesPayload,
  workingBlocks,
  writeMode,
  writeView,
} from "./draft";
import type { DraftStorage, TallerDraft } from "./draft";

const REPORT = "r1";

const indicatorRow = (patch: Partial<OdIndicatorRow> = {}): OdIndicatorRow => ({
  id: "mat",
  report_id: REPORT,
  key: "matriculados",
  label: "Estudiantes matriculados",
  unit: "estudiantes",
  format: "entero",
  direction: "sube",
  aggregation: "suma",
  reporting: "periodo",
  annual_rule: "ultimo",
  years: null,
  definition: "",
  office_id: null,
  position: 1,
  is_kpi: true,
  kpi_position: 1,
  is_headline: true,
  ...patch,
});

const blockRow = (id: string, kind: OdReportBlockRow["kind"], position: number, patch: Partial<OdReportBlockRow> = {}): OdReportBlockRow => ({
  id,
  report_id: REPORT,
  kind,
  ref_id: null,
  position,
  visible: true,
  settings: {},
  ...patch,
});

const BLOCK_ROWS = [blockRow("b1", "separador", 1, { settings: { title: "Matrícula", slot: "s1" } }), blockRow("b2", "kpis", 2), blockRow("b3", "evolucion", 3), blockRow("x9", "kpis", 1, { report_id: "otro" })];

const rows = (): OpenDataRows =>
  ({
    period: { id: "p1", label: "2024-2025", start_year: 2024, end_year: 2025, status: "publicado", is_current: true },
    campuses: [
      { period_id: "p1", campus_id: "buc", label: "Bucaramanga", slug: "bucaramanga", position: 1 },
      { period_id: "p1", campus_id: "cuc", label: "Cúcuta", slug: "cucuta", position: 2 },
    ],
    offices: [{ id: "o1", name: "Admisiones y Registro Académico" }],
    reports: [
      { id: REPORT, period_id: "p1", slug: "poblacional", code: "PO", name: "Poblacional", line: 1, status: "publicado", position: 1 },
      { id: "otro", period_id: "p1", slug: "permanencia", code: "PE", name: "Permanencia", line: 2, status: "borrador", position: 2 },
    ],
    indicators: [indicatorRow(), indicatorRow({ id: "aj", report_id: "otro", key: "ajeno", label: "Ajeno" })],
    values: [
      { indicator_id: "mat", year: 2025, term: "A", campus_id: "buc", value: 100 },
      { indicator_id: "mat", year: 2025, term: "A", campus_id: "cuc", value: 40 },
      { indicator_id: "mat", year: 2025, term: "B", campus_id: "buc", value: 110 },
      { indicator_id: "aj", year: 2025, term: "A", campus_id: "buc", value: 7 },
    ],
    breakdowns: [], breakdownValues: [], heatmaps: [], heatmapCells: [], maps: [], mapValues: [], pipelines: [], pipelineValues: [],
    histories: [], historyValues: [], sections: [], tables: [], rankings: [], rankingEditions: [], saberPro: [], saberProResults: [],
    freeSets: [], freeSetRows: [], saberTyt: [], saberTytResults: [], models: [], medalBoards: [], medalEntries: [], tableRows: [],
    blocks: BLOCK_ROWS,
  }) as unknown as OpenDataRows;

const key = (campus: string, column: string) => cellKey(rowKeyOf("mat", campus), column);
const stored = () => indexValues(rows().values);

/** Un `localStorage` de mentira: lo que hay sobrevive mientras se conserve el objeto. */
function memoryStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("borrador pendiente: añadir, fusionar y contar", () => {
  it("empieza vacío", () => {
    expect(isEmptyDraft(emptyDraft())).toBe(true);
    expect(countChanges(emptyDraft())).toEqual({ cells: 0, settings: 0, blocks: 0, total: 0 });
  });

  it("añade casillas y fusiona las siguientes sin perder las anteriores", () => {
    let draft = mergeValues(emptyDraft(), { [key("cuc", "2025-B")]: 45 }, stored());
    draft = mergeValues(draft, { [key("buc", "2024-A")]: 90, [key("cuc", "2025-B")]: 46 }, stored());
    expect(draft.values).toEqual({ [key("cuc", "2025-B")]: 46, [key("buc", "2024-A")]: 90 });
    expect(countChanges(draft).cells).toBe(2);
  });

  it("una casilla que vuelve a lo guardado deja de contar; vaciarla sí cuenta y guarda null", () => {
    let draft = mergeValues(emptyDraft(), { [key("buc", "2025-A")]: 105 }, stored());
    draft = mergeValues(draft, { [key("buc", "2025-A")]: 100 }, stored());
    expect(isEmptyDraft(draft)).toBe(true);
    draft = mergeValues(draft, { [key("buc", "2025-A")]: null }, stored());
    expect(draft.values[key("buc", "2025-A")]).toBeNull();
    expect(valuesPayload(draft)).toEqual([{ indicator_id: "mat", year: 2025, term: "A", campus_id: "buc", value: null }]);
  });

  it("recuerda que hubo un pegado hasta que no quedan casillas", () => {
    let draft = setValues(emptyDraft(), { [key("cuc", "2025-B")]: 45 }, true);
    draft = setValues(draft, { ...draft.values, [key("buc", "2024-A")]: 1 });
    expect(draft.pasted).toBe(true);
    expect(setValues(draft, {}).pasted).toBe(false);
  });

  it("cuenta casillas, ajustes de indicador y la ficha, y lo dice en palabras", () => {
    let draft = mergeValues(emptyDraft(), { [key("cuc", "2025-B")]: 45, [key("buc", "2024-A")]: 90 }, stored());
    draft = patchIndicator(draft, indicatorRow(), { unit: "personas" });
    draft = setBlocks(draft, moveBlock(workingBlocks(draft, blocksFromRows(BLOCK_ROWS, REPORT)), "b3", -1), blocksFromRows(BLOCK_ROWS, REPORT));
    const count = countChanges(draft);
    expect(count).toEqual({ cells: 2, settings: 1, blocks: 1, total: 4 });
    expect(describeChanges(count)).toBe("2 casillas · 1 ajuste de indicador · los bloques de la ficha");
  });

  it("deshacer un pegado devuelve cada casilla a lo que valía, aunque ya se hubiera guardado", () => {
    const before = { [key("buc", "2025-A")]: 101 } as Record<CellKey, number | null>;
    const after = { [key("buc", "2025-A")]: 500, [key("cuc", "2025-A")]: 600 } as Record<CellKey, number | null>;
    expect(undoEdits(before, after, stored())).toEqual({ [key("buc", "2025-A")]: 101, [key("cuc", "2025-A")]: 40 });
    // Ya guardado: el borrador quedó vacío y la base tiene lo pegado.
    const saved = indexValues([{ indicator_id: "mat", year: 2025, term: "A", campus_id: "cuc", value: 600 }]);
    const back = mergeValues(emptyDraft(), { [key("cuc", "2025-A")]: 40 }, saved);
    expect(back.values).toEqual({ [key("cuc", "2025-A")]: 40 });
  });
});

describe("ajustes de un indicador", () => {
  it("fusiona campos y descarta el que vuelve a lo guardado", () => {
    let draft = patchIndicator(emptyDraft(), indicatorRow(), { unit: "personas", definition: "Matrícula al cierre" });
    draft = patchIndicator(draft, indicatorRow(), { unit: "estudiantes" });
    expect(draft.indicators).toEqual({ mat: { definition: "Matrícula al cierre" } });
    draft = patchIndicator(draft, indicatorRow(), { definition: "" });
    expect(draft.indicators).toEqual({});
  });

  it("pasar a «por año» pone la regla en «se reporta aparte», como en Estructura", () => {
    expect(reportingPatch(indicatorRow({ annual_rule: "ultimo" }), "anual")).toEqual({ reporting: "anual", annual_rule: "reportado" });
  });

  it("volver a «por periodo» conserva la regla, salvo «se reporta aparte», que pasa a suma", () => {
    expect(reportingPatch(indicatorRow({ annual_rule: "promedio" }), "periodo")).toEqual({ reporting: "periodo", annual_rule: "promedio" });
    expect(reportingPatch(indicatorRow({ annual_rule: "reportado" }), "periodo")).toEqual({ reporting: "periodo", annual_rule: "suma" });
  });

  it("un indicador sin `reporting` guardado se trata como por periodo", () => {
    const legacy = indicatorRow({ reporting: undefined });
    expect(patchIndicator(emptyDraft(), legacy, { reporting: "periodo" }).indicators).toEqual({});
  });

  it("cuenta las cifras por periodo cargadas, con lo pendiente", () => {
    expect(termFiguresOf("mat", stored(), {})).toBe(3);
    expect(termFiguresOf("mat", stored(), { [key("cuc", "2025-B")]: 45, [key("buc", "2025-A")]: null, [key("buc", "2025-anual")]: 9 })).toBe(3);
    expect(termFiguresOf("otro", stored(), {})).toBe(0);
  });

  it("arma una fila por indicador para la mutación de Estructura", () => {
    const draft = patchIndicator(emptyDraft(), indicatorRow(), reportingPatch(indicatorRow(), "anual"));
    expect(indicatorPayloads(draft, REPORT)).toEqual([{ id: "mat", report_id: REPORT, reporting: "anual", annual_rule: "reportado" }]);
  });
});

describe("orden de los bloques y deshacer", () => {
  const base = () => blocksFromRows(BLOCK_ROWS, REPORT);
  const ids = new Set(["b1", "b2", "b3"]);

  it("lee solo los bloques del informe, en su orden", () => {
    expect(base().map((b) => b.tempId)).toEqual(["b1", "b2", "b3"]);
  });

  it("sube y baja un bloque y renumera; en los extremos no hace nada", () => {
    const working = { list: base(), removed: [] };
    const moved = moveBlock(working, "b3", -1);
    expect(moved.list.map((b) => [b.tempId, b.position])).toEqual([["b1", 1], ["b3", 2], ["b2", 3]]);
    expect(moveBlock(working, "b1", -1)).toBe(working);
    expect(moveBlock(working, "b3", 1)).toBe(working);
  });

  it("mover y devolver deja el borrador sin cambios de bloques", () => {
    let draft = setBlocks(emptyDraft(), moveBlock({ list: base(), removed: [] }, "b2", 1), base());
    expect(draft.blocks).not.toBeNull();
    draft = setBlocks(draft, moveBlock(workingBlocks(draft, base()), "b2", -1), base());
    expect(draft.blocks).toBeNull();
  });

  it("ocultar no quita: el bloque sigue en la lista, marcado", () => {
    const hidden = patchBlock({ list: base(), removed: [] }, "b3", { visible: false });
    expect(hidden.list).toHaveLength(3);
    expect(hidden.list[2].visible).toBe(false);
  });

  it("quitar saca el bloque y deshacer lo devuelve a su sitio, sin cambios pendientes", () => {
    const { blocks, undo } = removeBlock({ list: base(), removed: [] }, "b2");
    expect(blocks.list.map((b) => b.tempId)).toEqual(["b1", "b3"]);
    expect(blocks.removed).toEqual(["b2"]);
    const restored = restoreBlock(blocks, undo!, ids);
    expect(restored.list.map((b) => [b.tempId, b.position])).toEqual([["b1", 1], ["b2", 2], ["b3", 3]]);
    expect(restored.removed).toEqual([]);
    expect(setBlocks(emptyDraft(), restored, base()).blocks).toBeNull();
  });

  it("deshacer después de que la quita ya se guardó lo devuelve como bloque nuevo", () => {
    const { undo } = removeBlock({ list: base(), removed: [] }, "b2");
    // La base ya no tiene b2: la lista guardada es b1, b3.
    const savedIds = new Set(["b1", "b3"]);
    const after = { list: base().filter((b) => b.tempId !== "b2"), removed: [] };
    const restored = restoreBlock(after, undo!, savedIds);
    expect(restored.list.map((b) => b.tempId)).toEqual(["b1", "b2", "b3"]);
    expect(restored.list[1].id).toBeUndefined();
    const payload = blocksPayload(restored, REPORT, savedIds);
    expect(payload.remove).toEqual([]);
    expect(payload.blocks.map((b) => b.id)).toEqual(["b1", undefined, "b3"]);
    expect(payload.blocks[1]).toMatchObject({ kind: "kpis", report_id: REPORT, position: 2 });
  });

  it("deshacer dos veces no duplica el bloque", () => {
    const { blocks, undo } = removeBlock({ list: base(), removed: [] }, "b2");
    const once = restoreBlock(blocks, undo!, ids);
    expect(restoreBlock(once, undo!, ids)).toBe(once);
  });

  it("añade un separador y otro tablero al final, cada uno con su clave", () => {
    const withDivider = addBlock({ list: base(), removed: [] }, "separador", "abc");
    expect(withDivider.tempId).toBe("nuevo-separador-abc");
    expect(withDivider.blocks.list[3]).toMatchObject({ kind: "separador", position: 4, visible: true, settings: { title: "", slot: "abc" } });
    const withBoard = addBlock(withDivider.blocks, "kpis", "xyz");
    expect(withBoard.blocks.list[4]).toMatchObject({ kind: "kpis", position: 5, settings: { slot: "xyz" } });
  });

  it("quitar un bloque recién añadido no pide borrar nada en la base", () => {
    const added = addBlock({ list: base(), removed: [] }, "separador", "abc");
    const { blocks } = removeBlock(added.blocks, added.tempId);
    expect(blocks.removed).toEqual([]);
    expect(setBlocks(emptyDraft(), blocks, base()).blocks).toBeNull();
  });

  it("la lista para la base: con id se actualiza, sin id se inserta, y lo quitado se borra", () => {
    const added = addBlock({ list: base(), removed: [] }, "separador", "abc");
    const { blocks } = removeBlock(added.blocks, "b3");
    const payload = blocksPayload(blocks, REPORT, ids);
    expect(payload.remove).toEqual(["b3"]);
    expect(payload.blocks.map((b) => [b.id, b.kind, b.position])).toEqual([["b1", "separador", 1], ["b2", "kpis", 2], [undefined, "separador", 3]]);
    expect(payload.blocks.every((b) => b.report_id === REPORT && !("tempId" in b))).toBe(true);
  });
});

describe("un bloque nuevo que se guarda mientras se sigue editando", () => {
  const base = () => blocksFromRows(BLOCK_ROWS, REPORT);

  it("toma el id de lo guardado (mismo tipo y misma clave) y así no se inserta dos veces", () => {
    const added = addBlock({ list: base(), removed: [] }, "separador", "abc");
    // La base ya lo guardó con su id; en el borrador sigue sin id y con el título a medio escribir.
    const typing = patchBlock(added.blocks, added.tempId, { settings: { title: "Gradua", slot: "abc" } });
    const saved = [...base(), { ...added.blocks.list[3], id: "b9", tempId: "b9" }];
    const adopted = adoptSavedIds(typing, saved);
    expect(adopted.list[3]).toMatchObject({ id: "b9", settings: { title: "Gradua", slot: "abc" } });
    const payload = blocksPayload(adopted, REPORT, new Set(["b1", "b2", "b3", "b9"]));
    expect(payload.blocks.map((b) => b.id)).toEqual(["b1", "b2", "b3", "b9"]);
  });

  it("no toca nada si no hay nada que adoptar, ni le da el mismo id a dos bloques", () => {
    const working = { list: base(), removed: [] };
    expect(adoptSavedIds(working, base())).toBe(working);
    const one = addBlock(working, "kpis", "abc");
    const two = addBlock(one.blocks, "kpis", "abc");
    const saved = [...base(), { ...one.blocks.list[3], id: "b9", tempId: "b9" }];
    expect(adoptSavedIds(two.blocks, saved).list.map((b) => b.id)).toEqual(["b1", "b2", "b3", "b9", undefined]);
  });

  it("su clave en pantalla no cambia al guardarse: sigue siendo el mismo elemento", () => {
    const added = addBlock({ list: base(), removed: [] }, "separador", "abc");
    const before = blockKeys(added.blocks.list);
    const saved = [...base(), { ...added.blocks.list[3], id: "b9", tempId: "b9" }];
    expect(blockKeys(saved)[3]).toBe(before[3]);
    expect(before[3]).toBe("separador:abc");
    // Sin clave corta, o si se repite, vale su id.
    expect(before[1]).toBe("b2");
    const twin = [...added.blocks.list, { ...added.blocks.list[3], tempId: "otro" }];
    expect(blockKeys(twin).slice(3)).toEqual(["nuevo-separador-abc", "otro"]);
  });
});

describe("descartar y sobrevivir a una recarga", () => {
  const filled = (): TallerDraft => {
    let draft = mergeValues(emptyDraft(), { [key("cuc", "2025-B")]: 45, [key("buc", "2025-A")]: null }, stored(), true);
    draft = patchIndicator(draft, indicatorRow(), { unit: "personas" });
    return setBlocks(draft, moveBlock({ list: blocksFromRows(BLOCK_ROWS, REPORT), removed: [] }, "b3", -1), blocksFromRows(BLOCK_ROWS, REPORT));
  };

  it("lo guardado en el navegador vuelve igual tras recargar", () => {
    const storage = memoryStorage();
    const k = draftKey("p1", REPORT);
    expect(saveDraft(storage, k, filled())).toBe(true);
    // Otra «pantalla»: lee del mismo almacenamiento.
    expect(loadDraft(storage, k)).toEqual(filled());
  });

  it("cada informe y cada periodo tienen su propio borrador", () => {
    const storage = memoryStorage();
    saveDraft(storage, draftKey("p1", REPORT), filled());
    expect(isEmptyDraft(loadDraft(storage, draftKey("p1", "otro")))).toBe(true);
    expect(isEmptyDraft(loadDraft(storage, draftKey("p2", REPORT)))).toBe(true);
  });

  it("descartar (guardar el borrador vacío) borra la entrada", () => {
    const storage = memoryStorage();
    const k = draftKey("p1", REPORT);
    saveDraft(storage, k, filled());
    saveDraft(storage, k, emptyDraft());
    expect(storage.data.has(k)).toBe(false);
    expect(isEmptyDraft(loadDraft(storage, k))).toBe(true);
  });

  it("sin almacenamiento, o si falla, no revienta: no hay borrador y lo dice", () => {
    const broken: DraftStorage = {
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("cuota"); },
      removeItem: () => { throw new Error("bloqueado"); },
    };
    expect(isEmptyDraft(loadDraft(broken, "x"))).toBe(true);
    expect(saveDraft(broken, "x", filled())).toBe(false);
    expect(saveDraft(null, "x", filled())).toBe(false);
    expect(isEmptyDraft(loadDraft(undefined, "x"))).toBe(true);
  });

  it("ignora lo ilegible y lo que no tiene la forma esperada", () => {
    const storage = memoryStorage();
    storage.setItem("a", "{no es json");
    storage.setItem("b", JSON.stringify({ values: { "mat::buc|2025-A": "cien", "mal": 3, "mat::cuc|2025-B": 45 }, indicators: { mat: { key: "otra", unit: "personas" } }, blocks: "nada" }));
    expect(isEmptyDraft(loadDraft(storage, "a"))).toBe(true);
    const read = loadDraft(storage, "b");
    expect(read.values).toEqual({ "mat::cuc|2025-B": 45 });
    // La clave de un indicador no se cambia desde el taller: se descarta.
    expect(read.indicators).toEqual({ mat: { unit: "personas" } });
    expect(read.blocks).toBeNull();
  });

  it("al recuperarlo se le quita lo que ya no existe en el periodo", () => {
    const draft: TallerDraft = {
      values: { [key("cuc", "2025-B")]: 45, [cellKey(rowKeyOf("borrado", "buc"), "2025-A")]: 1, [key("val", "2025-A")]: 2, [key("buc", "2019-A")]: 3 },
      pasted: false,
      indicators: { mat: { unit: "personas" }, borrado: { unit: "x" } },
      blocks: { list: blocksFromRows(BLOCK_ROWS, REPORT), removed: ["b2", "ya-no"] },
    };
    const pruned = pruneDraft(draft, rows(), REPORT);
    expect(pruned.values).toEqual({ [key("cuc", "2025-B")]: 45 });
    expect(pruned.indicators).toEqual({ mat: { unit: "personas" } });
    expect(pruned.blocks?.removed).toEqual(["b2"]);
  });

  it("recuerda la vista y el modo; sin elección, clásica y sencillo", () => {
    const storage = memoryStorage();
    expect(readView(storage)).toBe("clasica");
    expect(readMode(storage)).toBe("sencillo");
    writeView(storage, "taller");
    writeMode(storage, "completo");
    expect(readView(storage)).toBe("taller");
    expect(readMode(storage)).toBe("completo");
    expect(readView(null)).toBe("clasica");
  });
});

describe("aplicar: lo que se manda y lo que queda", () => {
  it("lo enviado sale del borrador; lo que cambió mientras viajaba se queda", () => {
    let draft = mergeValues(emptyDraft(), { [key("cuc", "2025-B")]: 45, [key("buc", "2024-A")]: 90 }, stored(), true);
    draft = patchIndicator(draft, indicatorRow(), { unit: "personas", definition: "Uno" });
    const sent = draft;
    // Mientras se guardaba, la persona siguió escribiendo.
    draft = mergeValues(draft, { [key("cuc", "2025-B")]: 46 }, stored());
    draft = patchIndicator(draft, indicatorRow(), { definition: "Dos" });
    const left = settle(draft, { values: sent.values, indicators: sent.indicators });
    expect(left.values).toEqual({ [key("cuc", "2025-B")]: 46 });
    expect(left.indicators).toEqual({ mat: { definition: "Dos" } });
    expect(left.pasted).toBe(true);
  });

  it("si todo llegó, el borrador queda vacío", () => {
    let draft = mergeValues(emptyDraft(), { [key("cuc", "2025-B")]: 45 }, stored(), true);
    draft = patchIndicator(draft, indicatorRow(), { unit: "personas" });
    draft = setBlocks(draft, moveBlock({ list: blocksFromRows(BLOCK_ROWS, REPORT), removed: [] }, "b3", -1), blocksFromRows(BLOCK_ROWS, REPORT));
    const done = settle(draft, draft);
    expect(isEmptyDraft(done)).toBe(true);
    expect(done.pasted).toBe(false);
  });

  it("los bloques que cambiaron de nuevo durante el envío no se dan por guardados", () => {
    const base = blocksFromRows(BLOCK_ROWS, REPORT);
    const sent = setBlocks(emptyDraft(), moveBlock({ list: base, removed: [] }, "b3", -1), base);
    const again = setBlocks(sent, moveBlock(workingBlocks(sent, base), "b1", 1), base);
    expect(settle(again, { blocks: sent.blocks }).blocks).toBe(again.blocks);
  });

  it("por partes: guardar solo los bloques deja las cifras pendientes", () => {
    const base = blocksFromRows(BLOCK_ROWS, REPORT);
    let draft = mergeValues(emptyDraft(), { [key("cuc", "2025-B")]: 45 }, stored());
    draft = setBlocks(draft, moveBlock({ list: base, removed: [] }, "b3", -1), base);
    const left = settle(draft, { blocks: draft.blocks });
    expect(left.blocks).toBeNull();
    expect(countChanges(left).cells).toBe(1);
  });
});

describe("lo pendiente, a la vista", () => {
  it("la ficha se arma con las cifras pendientes: total y cifra del año incluidos", () => {
    const draft = mergeValues(emptyDraft(), { [key("cuc", "2025-B")]: 45 }, stored());
    const catalog = assembleCatalog(overlayRows(rows(), REPORT, draft));
    expect(catalog.reports.map((r) => r.slug)).toEqual(["poblacional"]);
    const indicator = catalog.reports[0].indicators[0];
    expect(indicator.terms?.[2025]?.B?.cucuta).toBe(45);
    // Total del periodo 2: 110 + 45. Antes del cambio faltaba Cúcuta y no había total.
    expect(indicator.terms?.[2025]?.B?.todas).toBe(155);
    expect(assembleCatalog(overlayRows(rows(), REPORT, emptyDraft())).reports[0].indicators[0].terms?.[2025]?.B?.todas).toBeNull();
    // Regla «último periodo»: la cifra del año de Cúcuta pasa a ser la del periodo 2.
    expect(indicator.values[2025]?.cucuta).toBe(45);
  });

  it("una casilla vaciada se ve sin reportar y deja el total vacío, no en cero", () => {
    const draft = mergeValues(emptyDraft(), { [key("cuc", "2025-A")]: null }, stored());
    const indicator = assembleCatalog(overlayRows(rows(), REPORT, draft)).reports[0].indicators[0];
    expect(indicator.terms?.[2025]?.A?.cucuta).toBeNull();
    expect(indicator.terms?.[2025]?.A?.todas).toBeNull();
  });

  it("un ajuste pendiente cambia cómo se lee el indicador", () => {
    let draft = patchIndicator(emptyDraft(), indicatorRow(), { annual_rule: "suma", unit: "personas", office_id: "o1" });
    const bySum = assembleCatalog(overlayRows(rows(), REPORT, draft)).reports[0].indicators[0];
    expect(bySum.values[2025]?.bucaramanga).toBe(210);
    expect(bySum.unit).toBe("personas");
    expect(bySum.source).toBe("Admisiones y Registro Académico");

    draft = patchIndicator(emptyDraft(), indicatorRow(), reportingPatch(indicatorRow(), "anual"));
    draft = mergeValues(draft, { [key("buc", "2025-anual")]: 230 }, stored());
    const byYearIndicator = assembleCatalog(overlayRows(rows(), REPORT, draft)).reports[0].indicators[0];
    // Por año: las cifras por periodo dejan de leerse (siguen en la base) y vale la del año.
    expect(byYearIndicator.reporting).toBe("anual");
    expect(byYearIndicator.terms).toBeUndefined();
    expect(byYearIndicator.values[2025]?.bucaramanga).toBe(230);
  });

  it("los bloques salen en su orden pendiente, con los nuevos incluidos", () => {
    const base = blocksFromRows(BLOCK_ROWS, REPORT);
    const added = addBlock(moveBlock({ list: base, removed: [] }, "b3", -1), "separador", "abc");
    const draft = setBlocks(emptyDraft(), added.blocks, base);
    const report = assembleCatalog(overlayRows(rows(), REPORT, draft)).reports[0];
    const ordered = [...(report.blocks ?? [])].sort((a, b) => a.position - b.position);
    expect(ordered.map((b) => b.uuid)).toEqual(["b1", "b3", "b2", "nuevo-separador-abc"]);
  });

  it("no toca lo guardado ni mezcla cifras de otros informes", () => {
    const original = rows();
    const before = JSON.stringify(original);
    const overlaid = overlayRows(original, REPORT, mergeValues(emptyDraft(), { [key("cuc", "2025-B")]: 45 }, stored()));
    expect(JSON.stringify(original)).toBe(before);
    expect(overlaid.values.every((v) => v.indicator_id === "mat")).toBe(true);
    expect(overlaid.values).toHaveLength(4);
    expect(overlaid.values.some((v) => v.campus_id === null && rowKeyOf("mat", TOTAL))).toBe(false);
  });
});
