/* =============================================================================
   Estado del prototipo de la intranet de Impacto.

   Vive en este navegador (localStorage) mientras no existe el modelo en
   Supabase: catálogo publicado o no, periodo 2026-2, registros de cada
   asignación y la bitácora de transiciones, que solo crece.

   Arranca con el recorrido a medio camino para que cada rol tenga algo que
   hacer: Medicina capturando, Enfermería enviada a decanatura y parte de
   Enfermería aprobada, esperando a las vicerrectorías.
   ========================================================================== */

import { useSyncExternalStore } from "react";
import { PILOT_INDICATORS, PROGRAMS, applies, indicatorByCode, programBySlug } from "../data/catalog";
import { DEMO_RECORDS, CURRENT_PERIOD } from "../data/demo";
import { emptyDraft } from "../data/validate";
import type { Draft } from "../data/validate";
import type { CampusId, FunctionId, RecordState } from "../data/types";

export type Role = "administrador" | "director" | "decano" | "vicerrector";

export interface Person {
  id: string;
  name: string;
  role: Role;
  /** Programa, facultad o función de la que responde. */
  scope: string;
}

export const PEOPLE: Person[] = [
  { id: "admin", name: "Planeación Institucional", role: "administrador", scope: "udes" },
  { id: "dir-medicina", name: "Dirección de Medicina", role: "director", scope: "medicina" },
  { id: "dec-fcms", name: "Decanatura de Ciencias Médicas y de la Salud", role: "decano", scope: "ciencias-medicas-y-de-la-salud" },
  { id: "vi", name: "Vicerrectoría de Investigaciones", role: "vicerrector", scope: "investigacion" },
  { id: "ve", name: "Vicerrectoría de Enseñanza", role: "vicerrector", scope: "ensenanza" },
  { id: "vx", name: "Vicerrectoría de Extensión", role: "vicerrector", scope: "extension" },
];

export const RETURN_REASONS = [
  ["dato_incompleto", "Dato incompleto"],
  ["formula_mal_aplicada", "Fórmula mal aplicada"],
  ["evidencia_insuficiente", "Evidencia insuficiente"],
  ["evidencia_no_corresponde", "La evidencia no corresponde"],
  ["variacion_sin_justificar", "Variación sin justificar"],
  ["falta_grupo_comparacion", "Falta el grupo de comparación"],
  ["duplicidad", "Duplicidad"],
  ["ventana_temporal_errada", "Ventana temporal errada"],
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number][0];

export interface RecordRow {
  id: string;
  codigo: string;
  program: string;
  campus: CampusId | null;
  draft: Draft;
  estado: RecordState;
  capturedBy: string | null;
  updatedAt: string | null;
  /** La última devolución, que se muestra arriba de la ficha. */
  devolucion: { motivo: ReturnReason; comentario: string; por: string } | null;
}

export interface Transition {
  record: string;
  from: RecordState;
  to: RecordState;
  by: string;
  at: string;
  motivo?: ReturnReason;
  comentario?: string;
}

export interface State {
  version: 1;
  personId: string;
  catalog: { published: number | null; draftChanges: number };
  period: { code: string; open: boolean; cuts: { programa: string; decanatura: string; vicerrectoria: string } };
  records: Record<string, RecordRow>;
  log: Transition[];
}

const KEY = "impacto:prototipo";
const now = () => new Date().toISOString();

export const recordId = (codigo: string, program: string, campus: CampusId | null) => `${codigo}|${program}|${campus ?? "-"}`;

/** Las asignaciones del periodo: reglas de asignación sobre el catálogo publicado. */
export function assignmentsFor(period: string) {
  const rows: { codigo: string; program: string; campus: CampusId | null }[] = [];
  for (const indicator of PILOT_INDICATORS) {
    for (const program of PROGRAMS) {
      if (!applies(indicator, program, period)) continue;
      const sites: (CampusId | null)[] = indicator.ficha?.nivelReporte === "programa_sede" ? program.campus : [null];
      for (const campus of sites) rows.push({ codigo: indicator.codigo, program: program.slug, campus });
    }
  }
  return rows;
}

/** El mismo registro en el periodo anterior, para la variación (V05). */
export function previousOf(codigo: string, program: string, campus: CampusId | null) {
  const annual = indicatorByCode.get(codigo)?.ficha?.periodicidad === "anual";
  const period = annual ? "2025-2" : "2026-1";
  const row = DEMO_RECORDS.find((r) => r.codigo === codigo && r.program === program && r.campus === campus && r.period === period);
  return row ? { period, row } : null;
}

function fromDemo(codigo: string, program: string, campus: CampusId | null, bump = 1.05): Draft {
  const prev = previousOf(codigo, program, campus)?.row;
  if (!prev) return emptyDraft();
  const scale = (v: number | null | undefined) => (typeof v === "number" ? Math.round(v * bump) : null);
  const draft: Draft = {
    ...emptyDraft(),
    numerador: scale(prev.numerador),
    denominador: prev.denominador ?? null,
    n: prev.n ?? null,
    numComparacion: prev.numComparacion ?? null,
    denComparacion: prev.denComparacion ?? null,
  };
  const overOne = indicatorByCode.get(codigo)?.ficha?.admiteMayorQueUno;
  if (!overOne && draft.denominador !== null && draft.numerador !== null && draft.numerador > draft.denominador) draft.numerador = draft.denominador;
  if (indicatorByCode.get(codigo)?.ficha?.modo === "precargado") draft.confirma = true;
  return draft;
}

function seed(): State {
  const records: Record<string, RecordRow> = {};
  const log: Transition[] = [];
  const at = "2026-09-15T14:00:00.000Z";
  for (const a of assignmentsFor(CURRENT_PERIOD)) {
    const id = recordId(a.codigo, a.program, a.campus);
    const program = programBySlug.get(a.program)!;
    let row: RecordRow = { id, ...a, draft: emptyDraft(), estado: "borrador", capturedBy: null, updatedAt: null, devolucion: null };

    if (a.program === "medicina") {
      // Media captura: la mitad llena, el resto por hacer.
      const filled = ["E01", "E04", "E10", "I01", "X04", "X18"].includes(a.codigo);
      if (filled) row = { ...row, draft: fromDemo(a.codigo, a.program, a.campus), capturedBy: "dir-medicina", updatedAt: at };
    } else if (program.faculty === "ciencias-medicas-y-de-la-salud") {
      const approved = a.program === "enfermeria" && ["I01", "I04", "E03", "X04"].includes(a.codigo);
      const estado: RecordState = approved ? "aprobado_decanatura" : "enviado";
      row = { ...row, draft: fromDemo(a.codigo, a.program, a.campus, 1.02), estado, capturedBy: `dir-${a.program}`, updatedAt: at };
      log.push({ record: id, from: "borrador", to: "enviado", by: `dir-${a.program}`, at });
      if (approved) log.push({ record: id, from: "enviado", to: "aprobado_decanatura", by: "dec-fcms", at: "2026-09-18T10:00:00.000Z" });
    }
    records[id] = row;
  }
  return {
    version: 1,
    personId: "dir-medicina",
    catalog: { published: 1, draftChanges: 0 },
    period: { code: CURRENT_PERIOD, open: true, cuts: { programa: "2026-10-15", decanatura: "2026-10-25", vicerrectoria: "2026-11-05" } },
    records,
    log,
  };
}

function load(): State {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    /* Sin almacenamiento: el prototipo arranca de cero en cada visita. */
  }
  return seed();
}

let state: State = typeof window === "undefined" ? seed() : load();
const listeners = new Set<() => void>();

function commit(next: State) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Ventana privada: se pierde al recargar, y está bien para un prototipo. */
  }
  listeners.forEach((l) => l());
}

export function useImpactStore(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

export const me = (s: State) => PEOPLE.find((p) => p.id === s.personId)!;

/* --- Acciones ---------------------------------------------------------------- */

export const actions = {
  reset() {
    commit(seed());
  },
  become(personId: string) {
    commit({ ...state, personId });
  },
  publish() {
    commit({ ...state, catalog: { published: (state.catalog.published ?? 0) + 1, draftChanges: 0 } });
  },
  editSheet() {
    commit({ ...state, catalog: { ...state.catalog, draftChanges: state.catalog.draftChanges + 1 } });
  },
  setCuts(cuts: State["period"]["cuts"]) {
    commit({ ...state, period: { ...state.period, cuts } });
  },
  openPeriod(excluded: string[]) {
    const records: Record<string, RecordRow> = {};
    for (const a of assignmentsFor(state.period.code)) {
      const id = recordId(a.codigo, a.program, a.campus);
      if (excluded.includes(id)) continue;
      records[id] = state.records[id] ?? { id, ...a, draft: emptyDraft(), estado: "borrador", capturedBy: null, updatedAt: null, devolucion: null };
    }
    commit({ ...state, period: { ...state.period, open: true }, records });
  },
  closePeriod() {
    commit({ ...state, period: { ...state.period, open: false } });
  },
  save(id: string, draft: Draft) {
    const row = state.records[id];
    if (!row || !editable(row.estado)) return;
    commit({ ...state, records: { ...state.records, [id]: { ...row, draft, capturedBy: state.personId, updatedAt: now() } } });
  },
  /** Mueve varios registros a la vez y deja una fila de bitácora por cada uno. */
  move(ids: string[], to: RecordState, reason?: { motivo: ReturnReason; comentario: string }) {
    const records = { ...state.records };
    const log = [...state.log];
    for (const id of ids) {
      const row = records[id];
      if (!row) continue;
      log.push({ record: id, from: row.estado, to, by: state.personId, at: now(), ...reason });
      records[id] = {
        ...row,
        estado: to,
        devolucion: reason ? { ...reason, por: state.personId } : to === "enviado" ? null : row.devolucion,
      };
    }
    commit({ ...state, records, log });
  },
};

export const editable = (estado: RecordState) => estado === "borrador" || estado === "devuelto_programa";

export const STATE_LABEL: Record<RecordState, string> = {
  borrador: "Borrador",
  enviado: "Enviado a decanatura",
  aprobado_decanatura: "Aprobado por decanatura",
  validado: "Validado",
  devuelto_programa: "Devuelto al programa",
  devuelto_decanatura: "Devuelto a decanatura",
};

export function functionOf(codigo: string): FunctionId {
  return indicatorByCode.get(codigo)!.funcion;
}
