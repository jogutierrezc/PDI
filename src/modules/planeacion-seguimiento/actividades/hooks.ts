/* Planeación y Seguimiento · Fase 2 · hooks de datos (TanStack Query sobre PsApi) y la oficina elegida. */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { claveDelPlan, usePsApi } from "../api";
import { usePs } from "../contexto";
import type { Actividad, DatosActividad, EstadoAct, OficinaVista, Poder } from "./modelo";
import type { PersonaRef } from "./contratoApi";
import type { ConfigAvisos, DatosAccion, DatosAvance, DatosRiesgo, EstadoAccion, EstadoRiesgo } from "./modeloF3";

/** Fase 3B: las claves que dependen del plan llevan el plan activo al final (así cambiar de plan nunca mezcla cachés). */
export const actKeys = {
  todo: ["ps", "act"] as const,
  yo: ["ps", "act", "yo"] as const,
  get oficinas() { return ["ps", "act", "oficinas", claveDelPlan()] as const; },
  get personas() { return ["ps", "act", "personas", claveDelPlan()] as const; },
  equipo: (id: string | null) => ["ps", "act", "equipo", id, claveDelPlan()] as const,
  lineas: (id: string | null) => ["ps", "act", "lineas", id, claveDelPlan()] as const,
  lista: (ids: string[]) => ["ps", "act", "lista", [...ids].sort().join(","), claveDelPlan()] as const,
  detalle: (id: string | null) => ["ps", "act", "detalle", id, claveDelPlan()] as const,
  catalogoPdi: ["ps", "act", "pdi", "catalogo"] as const,
  resumenPdi: (id: string | null) => ["ps", "act", "pdi", "resumen", id, claveDelPlan()] as const,
  porValidar: (id: string | null) => ["ps", "act", "validar", id ?? "todas", claveDelPlan()] as const,
  get misAvances() { return ["ps", "act", "mis-avances", claveDelPlan()] as const; },
  config: (id: string | null) => ["ps", "act", "config", id] as const,
};

export function useYo() {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.yo, queryFn: () => api.yo(), staleTime: 300_000, retry: false });
}
export function useOficinasVisibles() {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.oficinas, queryFn: () => api.oficinasVisibles(), staleTime: 60_000, retry: false });
}
export function usePersonas() {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.personas, queryFn: () => api.personas(), staleTime: 60_000, retry: false });
}
export function useEquipo(oficinaId: string | null) {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.equipo(oficinaId), queryFn: () => api.equipo(oficinaId!), enabled: Boolean(oficinaId), retry: false });
}
export function useLineasOficina(oficinaId: string | null) {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.lineas(oficinaId), queryFn: () => api.lineasDeOficina(oficinaId!), enabled: Boolean(oficinaId), retry: false });
}
export function useActividades(oficinaIds: string[]) {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.lista(oficinaIds), queryFn: () => api.actividades(oficinaIds), enabled: oficinaIds.length > 0, retry: false });
}
export function useActividad(id: string | null) {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.detalle(id), queryFn: () => api.actividad(id!), enabled: Boolean(id), retry: false });
}

/** Lo que casi toda pantalla de actividades necesita: quién es la persona, sus oficinas, el directorio y «hoy». */
export function useAct() {
  const api = usePsApi();
  const { nivel } = usePs();
  const yo = useYo();
  const ofs = useOficinasVisibles();
  const pers = usePersonas();
  const oficinas = useMemo(() => ofs.data ?? [], [ofs.data]);
  const personas = useMemo(() => new Map<string, PersonaRef>((pers.data ?? []).map((p) => [p.id, p])), [pers.data]);
  const porId = useMemo(() => new Map(oficinas.map((o) => [o.id, o])), [oficinas]);
  const poderDe = useCallback((oficinaId: string): Poder => porId.get(oficinaId)?.poder ?? "ninguno", [porId]);
  return {
    hoy: api.hoy,
    demo: api.demo,
    nivelModulo: nivel,
    yo: yo.data?.id ?? null,
    nombreYo: yo.data?.nombre ?? null,
    oficinas,
    porId,
    personas,
    poderDe,
    nombreDe: (id: string) => personas.get(id)?.nombre ?? "Persona sin nombre",
    cargando: ofs.isPending || yo.isPending,
    error: (ofs.error as Error | null) ?? null,
  };
}

/** La oficina elegida: va en la dirección (?oficina=), se recuerda y siempre es una de las visibles. */
export function useOficinaActual() {
  const { oficinas } = useAct();
  const [params, setParams] = useSearchParams();
  const pedida = params.get("oficina");
  let recordada: string | null = null;
  try {
    recordada = localStorage.getItem("ps:oficina");
  } catch {
    recordada = null;
  }
  const fuerza = { jefe: 3, editor: 2, visor: 1 } as const;
  const propia = [...oficinas].filter((o) => o.papel !== null).sort((a, b) => fuerza[b.papel!] - fuerza[a.papel!])[0] ?? oficinas[0];
  const oficina: OficinaVista | undefined = oficinas.find((o) => o.id === pedida) ?? oficinas.find((o) => o.id === recordada) ?? propia;
  const elegir = useCallback(
    (id: string) => {
      try {
        localStorage.setItem("ps:oficina", id);
      } catch {
        /* sin almacenamiento */
      }
      const s = new URLSearchParams(params);
      s.set("oficina", id);
      setParams(s, { replace: true });
    },
    [params, setParams],
  );
  return { oficina, oficinas, elegir };
}

/** Todas las mutaciones releen lo de actividades; el modo es siempre «todo o nada» en la base. */
function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: actKeys.todo });
}

export function useGuardarActividad() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { datos: DatosActividad; confirmar?: boolean }) => api.guardarActividad(d.datos, d.confirmar), onSuccess: inv });
}
export function useAsignar() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { ids: string[]; personaId: string; confirmar?: boolean }) => api.asignar(d.ids, d.personaId, d.confirmar), onSuccess: inv });
}
export function useTransferir() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { id: string; de: string; a: string; motivo: string; confirmar?: boolean }) => api.transferir(d.id, d.de, d.a, d.motivo, d.confirmar), onSuccess: inv });
}
export function useMarcarChecklist() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { id: string; item: string; hecho: boolean }) => api.marcarChecklist(d.id, d.item, d.hecho), onSuccess: inv });
}
export function useAgregarItem() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { id: string; texto: string }) => api.agregarItemChecklist(d.id, d.texto), onSuccess: inv });
}
export function useCargarActividades() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { oficinaId: string; filas: DatosActividad[]; archivo: string; confirmar?: boolean }) => api.cargarActividades(d.oficinaId, d.filas, d.archivo, d.confirmar), onSuccess: inv });
}

/** Mover de cubo con actualización inmediata en pantalla; si la base lo rechaza, vuelve a como estaba. */
export function useMoverActividad() {
  const api = usePsApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { id: string; estado: EstadoAct; nota?: string }) => api.moverActividad(d.id, d.estado, d.nota),
    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: ["ps", "act", "lista"] });
      const previos = qc.getQueriesData<Actividad[]>({ queryKey: ["ps", "act", "lista"] });
      qc.setQueriesData<Actividad[]>({ queryKey: ["ps", "act", "lista"] }, (lista) => lista?.map((a) => (a.id === d.id ? { ...a, estado: d.estado } : a)));
      return { previos };
    },
    onError: (_e, _d, ctx) => ctx?.previos.forEach(([k, v]) => qc.setQueryData(k, v)),
    onSettled: () => qc.invalidateQueries({ queryKey: actKeys.todo }),
  });
}


/* ---------- Fase 3 ---------- */

export function useCatalogoPdi() {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.catalogoPdi, queryFn: () => api.catalogoPdi(), staleTime: 300_000, retry: false });
}
export function useResumenPdi(oficinaId: string | null) {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.resumenPdi(oficinaId), queryFn: () => api.resumenPdi(oficinaId!), enabled: Boolean(oficinaId), retry: false });
}
/** La cola «Por validar» del gestor (de una oficina o de todas en las que lo es). Solo se pide si hay poder de gestor. */
export function useAvancesPorValidar(oficinaId: string | null, activo = true) {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.porValidar(oficinaId), queryFn: () => api.avancesPorValidar(oficinaId), enabled: activo, retry: false });
}
export function useMisAvances() {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.misAvances, queryFn: () => api.misAvances(), retry: false });
}
export function useConfigAvisos(oficinaId: string | null) {
  const api = usePsApi();
  return useQuery({ queryKey: actKeys.config(oficinaId), queryFn: () => api.leerConfigAvisos(oficinaId!), enabled: Boolean(oficinaId), retry: false });
}

export function useReportarAvance() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { actividadId: string; datos: DatosAvance }) => api.reportarAvance(d.actividadId, d.datos), onSuccess: inv });
}
export function useValidarAvance() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { id: string; nota?: string }) => api.validarAvance(d.id, d.nota), onSuccess: inv });
}
export function useDevolverAvance() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { id: string; nota: string }) => api.devolverAvance(d.id, d.nota), onSuccess: inv });
}
export function useValidarLote() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (ids: string[]) => api.validarLote(ids), onSuccess: inv });
}
export function useCerrarActividad() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { id: string; nota: string }) => api.cerrarActividad(d.id, d.nota), onSuccess: inv });
}
export function useRiesgos() {
  const api = usePsApi();
  const inv = useInvalidar();
  return {
    crear: useMutation({ mutationFn: (d: { actividadId: string; datos: DatosRiesgo }) => api.crearRiesgo(d.actividadId, d.datos), onSuccess: inv }),
    editar: useMutation({ mutationFn: (d: { id: string; cambios: Partial<DatosRiesgo> & { estado?: EstadoRiesgo } }) => api.editarRiesgo(d.id, d.cambios), onSuccess: inv }),
    cerrar: useMutation({ mutationFn: (d: { id: string; nota: string }) => api.cerrarRiesgo(d.id, d.nota), onSuccess: inv }),
    crearAccion: useMutation({ mutationFn: (d: { riesgoId: string; datos: DatosAccion }) => api.crearAccion(d.riesgoId, d.datos), onSuccess: inv }),
    marcarAccion: useMutation({ mutationFn: (d: { id: string; estado: EstadoAccion }) => api.marcarAccion(d.id, d.estado), onSuccess: inv }),
  };
}
export function useComentar() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { id: string; texto: string }) => api.comentar(d.id, d.texto), onSuccess: inv });
}
export function useGuardarConfigAvisos() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (d: { oficinaId: string; config: ConfigAvisos }) => api.guardarConfigAvisos(d.oficinaId, d.config), onSuccess: inv });
}
export function useQuitarConfigAvisos() {
  const api = usePsApi();
  const inv = useInvalidar();
  return useMutation({ mutationFn: (oficinaId: string) => api.quitarConfigAvisos(oficinaId), onSuccess: inv });
}
