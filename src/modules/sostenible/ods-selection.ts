/* =============================================================================
   UDES Sostenible · selección compartida del boletín ODS.

   El portal de los 17 informes y el generador del boletín comparten qué ODS
   entran al boletín (por defecto, los que se envían a THE) y el texto de la
   presentación rectoral cuando se edita. Se guarda en este navegador si se
   puede; sin almacenamiento (ventana privada, pruebas) funciona igual en
   memoria.
   ========================================================================== */

import { useSyncExternalStore } from "react";
import { ODS_LIST, RECTOR } from "./ods-data";

interface SelectionState {
  /** Números de los ODS incluidos, en orden. */
  included: readonly number[];
  /** Texto editado de la presentación rectoral; `null` usa el texto de `RECTOR`. */
  rectorText: string | null;
}

const KEY = "udes-sostenible-ods-boletin-v1";
const DEFAULT_INCLUDED = ODS_LIST.filter((o) => o.the).map((o) => o.n);
const DEFAULT: SelectionState = { included: DEFAULT_INCLUDED, rectorText: null };

const valid = (n: unknown): n is number => typeof n === "number" && ODS_LIST.some((o) => o.n === n);

function load(): SelectionState {
  try {
    if (typeof window === "undefined") return DEFAULT;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const data = JSON.parse(raw) as Partial<SelectionState>;
    const included = Array.isArray(data.included) ? [...new Set(data.included.filter(valid))].sort((a, b) => a - b) : DEFAULT_INCLUDED;
    const rectorText = typeof data.rectorText === "string" ? data.rectorText : null;
    return { included, rectorText };
  } catch {
    return DEFAULT;
  }
}

let state: SelectionState = load();
const listeners = new Set<() => void>();

function commit(next: SelectionState) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Sin almacenamiento: la selección vive solo en esta pestaña. */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => state;

function useSelectionState() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Qué ODS entran al boletín, compartido entre el portal y el generador. */
export function useBulletinSelection() {
  const { included } = useSelectionState();
  return {
    included,
    isIncluded: (n: number) => included.includes(n),
    toggle: (n: number) => {
      const has = state.included.includes(n);
      const next = has ? state.included.filter((x) => x !== n) : [...state.included, n].sort((a, b) => a - b);
      commit({ ...state, included: next });
    },
    setIncluded: (list: number[]) => commit({ ...state, included: [...new Set(list.filter(valid))].sort((a, b) => a - b) }),
  };
}

/** Texto de la presentación rectoral (editado en el boletín, leído en la página del Rector). */
export function useRectorText() {
  const { rectorText } = useSelectionState();
  return {
    text: rectorText ?? RECTOR.text,
    edited: rectorText !== null && rectorText !== RECTOR.text,
    setText: (text: string) => commit({ ...state, rectorText: text }),
    reset: () => commit({ ...state, rectorText: null }),
  };
}

/** Solo para pruebas: vuelve a la selección por defecto sin tocar el almacenamiento. */
export function resetBulletinSelectionForTests() {
  state = DEFAULT;
  listeners.forEach((l) => l());
}
