/* =============================================================================
   Analizador de posicionamiento · el contrato de una fila de THE Impact.

   Es la forma de supabase/seed/the-impact-<año>.json y de la tabla
   the_impact_rows (migración 0148, generada por scripts/import-the-impact.mjs).
   ========================================================================== */

/** Uno de los tres mejores ODS que THE publica de cada universidad. */
export interface MejorOds {
  sdg: number;
  lo: number;
  hi: number;
  rank_label: string;
  rank_lo: number;
  rank_hi: number | null;
}

export interface FilaTHE {
  rank_label: string;
  rank_lo: number;
  /** null = banda abierta («1501+»). */
  rank_hi: number | null;
  overall_lo: number;
  overall_hi: number;
  name: string;
  country: string;
  students: number | null;
  sdg17_lo: number | null;
  sdg17_hi: number | null;
  sdg17_rank_label: string | null;
  sdg17_rank_lo: number | null;
  sdg17_rank_hi: number | null;
  best: MejorOds[];
  iid: string;
  nid: number | null;
}

/** Una carga de la tabla (the_impact_snapshots). */
export interface CapturaTHE {
  year: number;
  scope: string;
  source: string;
  captured_at: string | null;
  row_count: number;
  notes: string;
}

/** Pesos de la puntuación general (metodología de THE). */
export const PESO_ODS17 = 0.22;
export const PESO_MEJOR = 0.26;
