/* =============================================================================
   Informes de gestión · las sedes de cada informe (0272), sin React.

   Un informe es de una unidad en una sede. Las sedes de una unidad salen de dónde
   se ofrecen sus programas (program_campuses): un programa, las suyas; una facultad
   u otra unidad, las de los programas que cuelgan de ella. Sin oferta, el informe
   queda sin sede, como siempre.
   ========================================================================== */

import type { InstanciaRow, SedeInforme, UnidadRef } from "./types";

export interface OfertaSedes {
  /** Todas las sedes, en el orden de la tabla. */
  sedes: SedeInforme[];
  /** Sedes (ids) donde se ofrece cada programa. */
  porPrograma: Map<string, string[]>;
}

export const SIN_OFERTA: OfertaSedes = { sedes: [], porPrograma: new Map() };

/** Las sedes donde se ofrece cada unidad, en el orden de las sedes. */
export function sedesPorUnidad(unidades: UnidadRef[], oferta: OfertaSedes): Map<string, SedeInforme[]> {
  const hijos = new Map<string, string[]>();
  for (const u of unidades) if (u.parent_id) hijos.set(u.parent_id, [...(hijos.get(u.parent_id) ?? []), u.id]);
  const memo = new Map<string, Set<string>>();
  const ids = (id: string, visitados: Set<string>): Set<string> => {
    const guardado = memo.get(id);
    if (guardado) return guardado;
    const s = new Set<string>(oferta.porPrograma.get(id) ?? []);
    if (!visitados.has(id)) {
      visitados.add(id);
      for (const h of hijos.get(id) ?? []) for (const x of ids(h, visitados)) s.add(x);
    }
    memo.set(id, s);
    return s;
  };
  const resultado = new Map<string, SedeInforme[]>();
  for (const u of unidades) {
    const propias = ids(u.id, new Set());
    resultado.set(u.id, oferta.sedes.filter((s) => propias.has(s.id)));
  }
  return resultado;
}

/**
 * El informe de una unidad en una sede. Uno sin sede (anterior a las sedes) es el de la primera sede
 * donde se ofrece la unidad: así sigue apareciendo donde estaba.
 */
export function buscarInstancia(instancias: InstanciaRow[], unidad: string, sede: string | null, ofrecidas: SedeInforme[]): InstanciaRow | null {
  const deLaUnidad = instancias.filter((i) => i.unit_id === unidad);
  const exacta = deLaUnidad.find((i) => (i.campus_id ?? null) === sede);
  if (exacta) return exacta;
  if (sede && ofrecidas[0]?.id === sede) return deLaUnidad.find((i) => !i.campus_id) ?? null;
  return null;
}

/** El nombre que se muestra: la unidad y, si lo tiene, la sede. */
export const nombreConSede = (unidad: string, sede: SedeInforme | null | undefined) => (sede ? `${unidad} (${sede.name})` : unidad);
