// ─── store-hooks.ts — hooks nuevos que PiloBot necesita ──────────────────────
// Estos se añaden al store existente (useAdoptions, useValues, usePeerAdoptions).
// Cada hook expone { data, isPending, error } como los existentes.

import type { PiloActor } from "./model";
import type { IndicatorAdaptation, InstitutionalNeed } from "./model";

/**
 * useAdaptations
 * Devuelve las adaptaciones que hizo una vicerrectoría sobre indicadores
 * del catálogo (meta, peso, periodicidad, nota para programas).
 * Solo se llama cuando actor.kind === "vicerectoria".
 */
export function useAdaptations(vicerrectoriaId?: string) {
  // Implementación real: query a /api/adaptations?vicerrectoriaId=...
  // Aquí se muestra la firma para integrar con React Query / SWR.
  return useQuery<IndicatorAdaptation[]>({
    queryKey: ["adaptations", vicerrectoriaId],
    queryFn: () => vicerrectoriaId
      ? fetch(`/api/adaptations?vicerrectoriaId=${vicerrectoriaId}`).then((r) => r.json())
      : Promise.resolve([]),
    enabled: !!vicerrectoriaId,
  });
}

/**
 * useInstitutionalNeeds
 * Devuelve las necesidades institucionales detectadas por el motor de análisis
 * de datos de reporte. Incluye:
 *  - indicadores con baja cobertura de reporte
 *  - indicadores vinculados a CNA sin datos suficientes
 *  - indicadores creados por programas con alta tasa de uso
 *    que aún no están en el catálogo oficial
 */
export function useInstitutionalNeeds(actorId: string) {
  return useQuery<InstitutionalNeed[]>({
    queryKey: ["institutional-needs", actorId],
    queryFn: () =>
      fetch(`/api/institutional-needs?actorId=${actorId}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000, // 5 min — los gaps no cambian en segundos
  });
}

/**
 * useMandatoryIndicators
 * Devuelve los indicadores que la vicerrectoría marcó como obligatorios
 * para el actor (programa o vice hija).
 * Para un programa: devuelve los que su vice forzó.
 * Para una vice: devuelve los que PLI le forzó a ella.
 */
export function useMandatoryIndicators(actor: PiloActor) {
  return useQuery<{ indicatorId: string }[]>({
    queryKey: ["mandatory-indicators", actor.kind, actor.id],
    queryFn: () =>
      fetch(`/api/mandatory-indicators?actorKind=${actor.kind}&actorId=${actor.id}`)
        .then((r) => r.json()),
  });
}

// Tipos de firma para el mutateAsync extendido
export interface AdoptManyPayload {
  indicatorIds: string[];
  actorId: string;
  actorKind: "vicerectoria" | "programa";
  campusId?: string;
}
// La implementación de useAdoptMany solo necesita ampliar su payload:
// POST /api/adoptions con { ...payload }
// El backend diferencia vicerectoría vs programa por actorKind.
