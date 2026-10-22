/* =============================================================================
   Encuestas con Pilo · datos del panel (TanStack Query sobre api.ts).
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { borrarAporte, borrarRespuesta, cambiarEstado, cambiarEstadoRespuesta, compartirEncuesta, crearEncuesta, duplicarEncuesta, editoresDe, guardarBorrador, guardarEncuesta, leerAportes, leerBitacora, leerEncuestas, leerRespuestas, leerVersiones, publicarVersion, purgarPapelera, quitarEditor, restaurarAporte, restaurarRespuesta } from "./api";
import type { AjustesEncuesta } from "./api";
import type { Estructura } from "./lib/estructura";
import type { Aporte, EstadoAporte, RespuestaModelo } from "./tipos";

export { FaltaMigracionEncuestas } from "./api";

const llaves = {
  encuestas: ["encuestas", "lista"] as const,
  aportes: (id: string) => ["encuestas", "aportes", id] as const,
  papelera: (id: string) => ["encuestas", "papelera", id] as const,
  versiones: (id: string) => ["encuestas", "versiones", id] as const,
  editores: (id: string) => ["encuestas", "editores", id] as const,
  bitacora: (id: string) => ["encuestas", "bitacora", id] as const,
  respuestas: (id: string) => ["encuestas", "respuestas", id] as const,
  respuestasPapelera: (id: string) => ["encuestas", "respuestas-papelera", id] as const,
};

export const useEncuestas = () => useQuery({ queryKey: llaves.encuestas, queryFn: leerEncuestas, retry: false });

export const useAportes = (encuestaId: string | undefined) =>
  useQuery({ queryKey: llaves.aportes(encuestaId ?? ""), queryFn: () => leerAportes(encuestaId as string), enabled: Boolean(encuestaId), retry: false });

/** Lo borrado en los últimos 30 días. Al abrirla se purga lo vencido. */
export const usePapelera = (encuestaId: string | undefined, activa: boolean) =>
  useQuery({
    queryKey: llaves.papelera(encuestaId ?? ""),
    queryFn: async () => {
      await purgarPapelera().catch(() => 0);
      return leerAportes(encuestaId as string, true);
    },
    enabled: Boolean(encuestaId) && activa,
    retry: false,
  });

/** Borra (a la papelera) o restaura una respuesta; refresca la tabla y la papelera. */
export function useBorrado(encuestaId: string) {
  const qc = useQueryClient();
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: llaves.aportes(encuestaId) });
    void qc.invalidateQueries({ queryKey: llaves.papelera(encuestaId) });
  };
  return {
    borrar: useMutation({ mutationFn: ({ id, motivo }: { id: string; motivo?: string }) => borrarAporte(id, motivo), onSuccess: refrescar }),
    restaurar: useMutation({ mutationFn: (id: string) => restaurarAporte(id), onSuccess: refrescar }),
  };
}

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
    mutationFn: (cambios: AjustesEncuesta) => guardarEncuesta(id, cambios),
    onSuccess: () => void qc.invalidateQueries({ queryKey: llaves.encuestas }),
  });
}

/* ---------- Editor de encuestas (0184) ---------- */

export const useVersiones = (id: string | undefined) => useQuery({ queryKey: llaves.versiones(id ?? ""), queryFn: () => leerVersiones(id as string), enabled: Boolean(id), retry: false });
export const useEditores = (id: string | undefined) => useQuery({ queryKey: llaves.editores(id ?? ""), queryFn: () => editoresDe(id as string), enabled: Boolean(id), retry: false });
export const useBitacora = (id: string | undefined, activa: boolean) => useQuery({ queryKey: llaves.bitacora(id ?? ""), queryFn: () => leerBitacora(id as string), enabled: Boolean(id) && activa, retry: false });

export function useGuardarBorrador(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ estructura, nota }: { estructura: Estructura; nota?: string }) => guardarBorrador(id, estructura, nota),
    onSuccess: () => void qc.invalidateQueries({ queryKey: llaves.versiones(id) }),
  });
}

export function usePublicar(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nota: string) => publicarVersion(id, nota),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: llaves.versiones(id) });
      void qc.invalidateQueries({ queryKey: llaves.encuestas });
      void qc.invalidateQueries({ queryKey: llaves.bitacora(id) });
    },
  });
}

export function useCrearEncuesta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { slug: string; titulo: string; estructura: Estructura; plantilla: string | null }) => crearEncuesta(a.slug, a.titulo, a.estructura, a.plantilla),
    onSuccess: () => void qc.invalidateQueries({ queryKey: llaves.encuestas }),
  });
}

export function useDuplicarEncuesta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; slug: string; titulo: string }) => duplicarEncuesta(a.id, a.slug, a.titulo),
    onSuccess: () => void qc.invalidateQueries({ queryKey: llaves.encuestas }),
  });
}

export function useCompartir(id: string) {
  const qc = useQueryClient();
  const refrescar = () => void qc.invalidateQueries({ queryKey: llaves.editores(id) });
  return {
    compartir: useMutation({ mutationFn: (a: { correo: string; rol: "editor" | "lector" }) => compartirEncuesta(id, a.correo, a.rol), onSuccess: refrescar }),
    quitar: useMutation({ mutationFn: (usuario: string) => quitarEditor(id, usuario), onSuccess: refrescar }),
  };
}

export const useRespuestas = (id: string | undefined) => useQuery({ queryKey: llaves.respuestas(id ?? ""), queryFn: () => leerRespuestas(id as string), enabled: Boolean(id), retry: false });

export const useRespuestasPapelera = (id: string | undefined, activa: boolean) =>
  useQuery({
    queryKey: llaves.respuestasPapelera(id ?? ""),
    queryFn: async () => {
      await purgarPapelera().catch(() => 0);
      return leerRespuestas(id as string, true);
    },
    enabled: Boolean(id) && activa,
    retry: false,
  });

export function useAccionesRespuesta(id: string) {
  const qc = useQueryClient();
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: llaves.respuestas(id) });
    void qc.invalidateQueries({ queryKey: llaves.respuestasPapelera(id) });
  };
  return {
    estado: useMutation({
      mutationFn: (a: { id: string; estado: EstadoAporte }) => cambiarEstadoRespuesta(a.id, a.estado),
      onMutate: async (a) => {
        await qc.cancelQueries({ queryKey: llaves.respuestas(id) });
        const antes = qc.getQueryData<RespuestaModelo[]>(llaves.respuestas(id));
        qc.setQueryData<RespuestaModelo[]>(llaves.respuestas(id), (l) => l?.map((r) => (r.id === a.id ? { ...r, estado: a.estado } : r)));
        return { antes };
      },
      onError: (_e, _a, ctx) => {
        if (ctx?.antes) qc.setQueryData(llaves.respuestas(id), ctx.antes);
      },
      onSettled: refrescar,
    }),
    borrar: useMutation({ mutationFn: (a: { id: string; motivo?: string }) => borrarRespuesta(a.id, a.motivo), onSuccess: refrescar }),
    restaurar: useMutation({ mutationFn: (rid: string) => restaurarRespuesta(rid), onSuccess: refrescar }),
  };
}
