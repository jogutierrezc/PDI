/* =============================================================================
   Portal Impacto Institucional sobre la base (0072).

   Tres lecturas para una sesión de la intranet: el catálogo publicado, la
   estructura (facultades, programas, sedes y oferta) y las medidas de los
   registros validados. Lo no validado no sale de la base. El valor
   consolidado lo calcula aggregate.ts aquí, en el cliente, a través de
   lens.ts.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FriendlyError, describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import { buildPortal } from "./lens";
import type { PortalData, RawCatalog, RawRecord, RawStructure } from "./lens";

function fail(error: { code?: string; message: string } | null): void {
  if (!error) return;
  // Falta de migración o de permiso no mejora reintentando: se dice de una vez qué hacer.
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883") {
    throw new FriendlyError("La base aún no tiene las lecturas del portal de Impacto.", {
      advice: "Aplique la migración 0072_impacto_portal.sql en el editor SQL de Supabase.",
      original: error.message,
      retryable: false,
    });
  }
  if (error.code === "42501") throw new FriendlyError(error.message, { retryable: false });
  throw describeDatabaseError(error as DatabaseError);
}

const EMPTY_CATALOG: RawCatalog = { version: null, indicators: [] };
const EMPTY_STRUCTURE: RawStructure = { faculties: [], programs: [], campuses: [] };

/** Un objeto de la base con sus listas, aunque llegue vacío o incompleto. */
const objectOr = <T extends object>(value: unknown, empty: T): T =>
  value && typeof value === "object" && !Array.isArray(value) ? { ...empty, ...(value as Partial<T>) } : empty;

/** Todo lo que el portal necesita, en una sola consulta que cargan las tres pantallas. */
export function usePortal() {
  return useQuery({
    queryKey: ["impacto", "portal"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PortalData> => {
      const [catalog, structure, records] = await Promise.all([
        supabase.rpc("imp_portal_catalog"),
        supabase.rpc("imp_portal_structure"),
        supabase.rpc("imp_portal_records"),
      ]);
      fail(catalog.error);
      fail(structure.error);
      fail(records.error);
      return buildPortal(
        objectOr(catalog.data, EMPTY_CATALOG),
        objectOr(structure.data, EMPTY_STRUCTURE),
        Array.isArray(records.data) ? (records.data as RawRecord[]) : [],
      );
    },
  });
}
