/* =============================================================================
   Encuestas con Pilo · datos del panel (TanStack Query sobre api.ts).
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cambiarEstado, guardarEncuesta, leerAportes, leerEncuestas } from "./api";
import type { Aporte, CambiosEncuesta, EstadoAporte } from "./tipos";

export { FaltaMigracionEncuestas } from "./api";

const llaves = {
  encuestas: ["encuestas", "lista"] as const,
  aportes: (id: string) => ["encuestas", "aportes", id] as const,
};

export const useEncuestas = () => useQuery({ queryKey: llaves.encuestas, queryFn: leerEncuestas, retry: false });

export const useAportes = (encuestaId: string | undefined) =>
  useQuery({ queryKey: llaves.aportes(encuestaId ?? ""), queryFn: () => leerAportes(encuestaId as string), enabled: Boolean(encuestaId), retry: false });

/** Cambia el estado de un aporte: se ve al instante y vuelve atrás si la base lo rechaza. */
export function useCambiarEstado(encuestaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoAporte }) => cambiarEstado(id, estado),
    onMutate: async ({ id, estado }) => {
      await qc.cancelQueries({ queryKey: llaves.aportes(encuestaId) });
      const antes = qc.getQueryData<Aporte[]>(llaves.aportes(encuestaId));
      qc.setQueryData<Aporte[]>(llaves.aportes(encuestaId), (lista) => lista?.map((a) => (a.id === id ? { ...a, estado } : a)));
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(llaves.aportes(encuestaId), ctx.antes);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: llaves.aportes(encuestaId) }),
  });
}

export function useGuardarEncuesta(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cambios: Partial<CambiosEncuesta> & { abierta?: boolean }) => guardarEncuesta(id, cambios),
    onSuccess: () => void qc.invalidateQueries({ queryKey: llaves.encuestas }),
  });
}
