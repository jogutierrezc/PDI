/* =============================================================================
   Analizador de posicionamiento · bandas y rangos de THE.

   THE publica posiciones exactas solo hasta el puesto 100 (con empates, «=96»)
   y, desde ahí, bandas («101–200», «1501+», «1001+» en las tablas por ODS).
   Los puntajes se publican igual: un valor hasta el puesto 100 y, después, el
   rango de la banda («60.7–66.1»). Este archivo los convierte a números y da
   el centro y la incertidumbre de cada uno. Sin red ni React: lo comparten el
   importador (que lleva su copia en JS), el modelo, la pantalla y las pruebas.
   ========================================================================== */

/** Un puesto o una banda de puestos. `hi` null = banda abierta («1501+»). */
export interface Banda {
  lo: number;
  hi: number | null;
  /** «=96»: puesto compartido con otras universidades. */
  empate: boolean;
  /** Tal como lo publica THE. */
  label: string;
}

/** Un puntaje: valor exacto (lo = hi) o rango de la banda. */
export interface Rango {
  lo: number;
  hi: number;
}

const GUION = /\s*[–—-]\s*/;

/** «=96» → 96..96 (empate) · «301–400» → 301..400 · «1501+» → 1501..null · «7» → 7..7. */
export function parseBanda(texto: string | null | undefined): Banda | null {
  const label = String(texto ?? "").trim();
  if (!label) return null;
  const empate = label.startsWith("=");
  const t = label.replace(/^=/, "");
  const abierta = /^(\d+)\s*\+$/.exec(t);
  if (abierta) return { lo: Number(abierta[1]), hi: null, empate, label };
  const partes = t.split(GUION).map((x) => x.replace(/,/g, ""));
  if (partes.length === 1 && /^\d+$/.test(partes[0])) {
    const n = Number(partes[0]);
    return { lo: n, hi: n, empate, label };
  }
  if (partes.length === 2 && /^\d+$/.test(partes[0]) && /^\d+$/.test(partes[1])) {
    const a = Number(partes[0]);
    const b = Number(partes[1]);
    return { lo: Math.min(a, b), hi: Math.max(a, b), empate, label };
  }
  return null;
}

/** «60.7–66.1» → 60.7..66.1 · «98.5» → 98.5..98.5. Null si no es un número. */
export function parseRango(texto: string | number | null | undefined): Rango | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? { lo: texto, hi: texto } : null;
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const partes = t.split(GUION);
  const nums = partes.map((x) => (/^\d+(\.\d+)?$/.test(x) ? Number(x) : NaN));
  if (nums.some((n) => !Number.isFinite(n)) || nums.length > 2) return null;
  const [a, b = a] = nums;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

export const centro = (r: Rango) => (r.lo + r.hi) / 2;
export const mediaAmplitud = (r: Rango) => (r.hi - r.lo) / 2;

/**
 * Incertidumbre (desviación) que se le da a un puntaje publicado: la mitad del
 * ancho de su banda, con un mínimo (2 puntos por defecto). Un valor exacto
 * también se mueve de un año a otro, por eso nunca es cero.
 */
export const sigmaDe = (r: Rango, minimo = 2) => Math.max(mediaAmplitud(r), minimo);

/** Una banda abierta («1501+») se trata como si cerrara en `tope` (el número de universidades). */
export const banda = (b: Pick<Banda, "lo" | "hi">, tope: number) => ({ lo: b.lo, hi: b.hi ?? Math.max(b.lo, tope) });

/** Texto de una banda para la pantalla: «601–800», «1501+», «=96». */
export function textoBanda(b: Pick<Banda, "lo" | "hi"> & { empate?: boolean }): string {
  if (b.hi === null) return `${b.lo}+`;
  if (b.lo === b.hi) return `${b.empate ? "=" : ""}${b.lo}`;
  return `${b.lo}–${b.hi}`;
}

/** Texto de un puntaje: «60,7–66,1» o «98,5». */
export function textoRango(r: Rango | null | undefined): string {
  if (!r) return "—";
  const f = (x: number) => x.toFixed(1).replace(".", ",");
  return r.lo === r.hi ? f(r.lo) : `${f(r.lo)}–${f(r.hi)}`;
}

/** ¿La banda a es mejor (puestos más altos) que la b? */
export const mejorQue = (a: Pick<Banda, "lo">, b: Pick<Banda, "lo">) => a.lo < b.lo;
