/* =============================================================================
   Informes de gestión · un informe por unidad, no por sede.

   Las facultades y demás unidades son multicampus: su informe es uno solo, el de la
   unidad, aunque sus programas se ofrezcan en varias sedes. La migración 0272 los
   había partido por sede (columna `campus_id`); la 0280 los reúne. Mientras haya
   informes de antes con sede, `unaPorUnidad` deja uno por unidad y sin sede, y
   `sedesPorUnidad` ya no reparte las unidades por sede. Lo demás (nombre, enlaces,
   Tablero, Revisión) trata la sede como ausente. Sin React.
   ========================================================================== */

import type { EstadoInstancia, InstanciaRow, SedeInforme, UnidadRef } from "./types";

export interface OfertaSedes {
  /** Todas las sedes, en el orden de la tabla. */
  sedes: SedeInforme[];
  /** Sedes (ids) donde se ofrece cada programa. */
  porPrograma: Map<string, string[]>;
}

export const SIN_OFERTA: OfertaSedes = { sedes: [], porPrograma: new Map() };

/** Ya no se reparte ninguna unidad por sede: todas quedan con una lista vacía (un solo informe). */
export function sedesPorUnidad(unidades: UnidadRef[], _oferta: OfertaSedes): Map<string, SedeInforme[]> {
  return new Map(unidades.map((u) => [u.id, [] as SedeInforme[]]));
}

const AVANCE: Record<EstadoInstancia, number> = { draft: 0, back: 1, sent: 2, ok: 3 };

/**
 * Un informe por unidad en cada ciclo, sin sede. Si una unidad quedó con varios (uno por sede, de antes), se
 * queda el más avanzado (aprobado, enviado, devuelto, borrador), y a igualdad el que no tenía sede.
 */
export function unaPorUnidad(instancias: InstanciaRow[]): InstanciaRow[] {
  const elegidas = new Map<string, InstanciaRow>();
  for (const i of instancias) {
    const clave = `${i.ciclo_id}|${i.unit_id}`;
    const previa = elegidas.get(clave);
    const mejor = !previa || AVANCE[i.estado] > AVANCE[previa.estado] || (AVANCE[i.estado] === AVANCE[previa.estado] && !i.campus_id && Boolean(previa.campus_id));
    if (mejor) elegidas.set(clave, i);
  }
  return [...elegidas.values()].map((i) => ({ ...i, campus_id: null }));
}

/** El informe de una unidad (el único que tiene). `sede` y `ofrecidas` se conservan por compatibilidad y no cuentan. */
export function buscarInstancia(instancias: InstanciaRow[], unidad: string, _sede?: string | null, _ofrecidas?: SedeInforme[]): InstanciaRow | null {
  return instancias.find((i) => i.unit_id === unidad) ?? null;
}

/** El nombre que se muestra: el de la unidad. */
export const nombreConSede = (unidad: string, _sede?: SedeInforme | null) => unidad;
