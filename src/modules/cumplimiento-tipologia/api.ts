/* =============================================================================
   Cumplimiento de Tipología · lectura y escritura contra Supabase (migración 0260).

   La pantalla lee de las tablas ct_* (RLS por alcance: la base decide qué
   programas ve cada persona) y de las funciones ct_*. NO recalcula nada: el
   cálculo es el «corte», que solo corre el administrador del módulo y que usa el
   motor de motor/ sobre lo que ct_insumos lee del Warehouse.

   Los nombres de los profesores no están en ninguna tabla: se leen en vivo del
   Master por la función `warehouse` (acción docentes), el mismo mecanismo de
   Gestión Master, y viven solo en la memoria de esta pantalla.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { nombresDeDocentes } from "../gestion-master/api";
import { calcularCorte, type ResultadoCorte } from "./motor/corte";
import type { FilaAprobacionWh, FilaHorarioWh, FilaNominaWh, FilaPosgradoWh } from "./motor/lectores";
import { REGLAS_BASE } from "./motor/tipologia";
import {
  mensajeDe,
  type CeldaMatriz, type CorteActual, type FilaBitacora, type GrupoSinMatricula, type InsumoUsado, type NivelCt, type Observacion,
  type ObservacionMaster, type ProgramaUnidad, type Resumen, type UnidadOpcion,
} from "./modelo";

export const ctKeys = {
  todo: ["ct"] as const,
  nivel: ["ct", "nivel"] as const,
  matriz: (p: string) => ["ct", "matriz", p] as const,
  corte: (p: string, s: string) => ["ct", "corte", p, s] as const,
  resumenes: (p: string, s: string, prog: string) => ["ct", "resumenes", p, s, prog] as const,
  detalle: (id: string | null) => ["ct", "detalle", id] as const,
  master: (id: string | null) => ["ct", "master", id] as const,
  bitacora: (p: string) => ["ct", "bitacora", p] as const,
  insumos: (p: string, s: string) => ["ct", "insumos", p, s] as const,
  programas: ["ct", "programas"] as const,
  unidades: ["ct", "unidades"] as const,
};

async function rpc<T>(nombre: string, args?: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw new Error(mensajeDe(r.error));
  return r.data as T;
}

/* --- Quién soy en el módulo ---------------------------------------------------------------------------------- */

export function useMiNivel() {
  return useQuery({
    queryKey: ctKeys.nivel,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<NivelCt> => (await rpc<NivelCt>("ct_nivel_actual")) ?? "none",
  });
}

/* --- Lecturas ------------------------------------------------------------------------------------------------ */

/** Cuántos profesores cumplen por programa y sede, solo en los programas que la persona ve. */
export const useMatriz = (periodo: string, activo = true) =>
  useQuery({
    queryKey: ctKeys.matriz(periodo),
    enabled: activo,
    queryFn: () => rpc<CeldaMatriz[]>("ct_matriz", { p_periodo: periodo }),
  });

/** El corte vigente de un periodo y sede (null si no hay). */
export const useCorteActual = (periodo: string, sede: string, activo = true) =>
  useQuery({
    queryKey: ctKeys.corte(periodo, sede),
    enabled: activo,
    queryFn: async (): Promise<CorteActual | null> => {
      const filas = await rpc<CorteActual[]>("ct_corte_actual", { p_periodo: periodo, p_sede: sede });
      return filas?.[0] ?? null;
    },
  });

const COLUMNAS_RESUMEN =
  "id, corte_id, periodo, sede, seudonimo, programa, programa_norm, contrato, perfil, escalafon, duracion, veredicto, horas_esperadas, horas_total, " +
  "horas_docencia, horas_investigacion, horas_extension, horas_administracion, horas_bienestar, horas_ensenanza, horas_derivadas, horas_inv_ext, " +
  "horas_gestion, horas_capacitacion, horas_comite, horas_preparacion, horas_pregrado, horas_posgrado, actividades, estado_master, preaprobacion, " +
  "fuente_nomina, lectura_operativa, perfil_sugerido, sugerencia, consideracion_aprobacion, incumplimientos, preventivas, causas, comparacion, " +
  "desglose, semana, carga";

/** Los profesores de un programa y sede. La base ya filtra por alcance; aquí solo se pide el programa. */
export const useResumenes = (periodo: string, sede: string, programaNorm: string, activo = true) =>
  useQuery({
    queryKey: ctKeys.resumenes(periodo, sede, programaNorm),
    enabled: activo && programaNorm !== "",
    queryFn: async (): Promise<Resumen[]> => {
      const r = await supabase
        .from("ct_resumen")
        .select(COLUMNAS_RESUMEN)
        .eq("periodo", periodo)
        .eq("sede", sede)
        .eq("programa_norm", programaNorm)
        .order("veredicto", { ascending: false })
        .order("incumplimientos", { ascending: false })
        .range(0, 999);
      if (r.error) throw new Error(mensajeDe(r.error));
      return (r.data ?? []) as unknown as Resumen[];
    },
  });

export interface DetalleProfesor {
  observaciones: Observacion[];
  grupos: GrupoSinMatricula[];
}

/** Las observaciones (preventivas, recomendaciones…) y los grupos sin matrícula de un profesor. */
export const useDetalle = (resumenId: string | null) =>
  useQuery({
    queryKey: ctKeys.detalle(resumenId),
    enabled: Boolean(resumenId),
    queryFn: async (): Promise<DetalleProfesor> => {
      const [o, g] = await Promise.all([
        supabase.from("ct_observacion").select("id, orden, causa, categoria, tipo, texto, resumen").eq("resumen_id", resumenId).order("orden"),
        supabase.from("ct_grupo_sin_matricula").select("id, codigo, nombre, grupo, capacidad, departamento, afectacion").eq("resumen_id", resumenId).order("codigo"),
      ]);
      if (o.error) throw new Error(mensajeDe(o.error));
      if (g.error) throw new Error(mensajeDe(g.error));
      return { observaciones: (o.data ?? []) as Observacion[], grupos: (g.data ?? []) as GrupoSinMatricula[] };
    },
  });

/** La observación para Master y la ampliada: solo el administrador del módulo (la política de la tabla lo exige). */
export const useObservacionMaster = (resumenId: string | null, activo: boolean) =>
  useQuery({
    queryKey: ctKeys.master(resumenId),
    enabled: activo && Boolean(resumenId),
    queryFn: async (): Promise<ObservacionMaster | null> => {
      const r = await supabase.from("ct_observacion_master").select("resumen_id, observacion_255, observacion_ampliada").eq("resumen_id", resumenId).maybeSingle();
      if (r.error) throw new Error(mensajeDe(r.error));
      return (r.data as ObservacionMaster | null) ?? null;
    },
  });

/* --- Los nombres: en vivo, sin guardarlos ------------------------------------------------------------------- */

export async function leerNombres(p: { periodo: string; sede: string; programa: string; seudonimos: string[] }): Promise<{ nombres: Record<string, string>; encontrados: number }> {
  const r = await nombresDeDocentes({ sede: p.sede, periodo: p.periodo, codigo: p.programa, seudonimos: p.seudonimos, modulo: "cumplimiento" });
  return { nombres: r.nombres, encontrados: r.encontrados };
}

/* --- Administración ------------------------------------------------------------------------------------------ */

export const useBitacora = (periodo: string, activo: boolean) =>
  useQuery({ queryKey: ctKeys.bitacora(periodo), enabled: activo, queryFn: () => rpc<FilaBitacora[]>("ct_cortes_listar", { p_periodo: periodo }) });

export const useProgramas = (activo: boolean) =>
  useQuery({ queryKey: ctKeys.programas, enabled: activo, queryFn: () => rpc<ProgramaUnidad[]>("ct_programas_listar") });

export const useUnidades = (activo: boolean) =>
  useQuery({ queryKey: ctKeys.unidades, enabled: activo, staleTime: 300_000, queryFn: () => rpc<UnidadOpcion[]>("ct_unidades") });

export function useAsignarPrograma() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (p: { programaNorm: string; unitId: string | null }) => rpc<void>("ct_asignar_programa", { p_programa_norm: p.programaNorm, p_unit_id: p.unitId }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ctKeys.todo }),
  });
}

/* --- Los insumos del Warehouse -------------------------------------------------------------------------------- */

export type Fuente = "nomina" | "aprobacion" | "horario" | "posgrado";

export const FUENTES: { id: Fuente; conjunto: string; titulo: string; detalle: string; obligatoria: boolean }[] = [
  { id: "nomina", conjunto: "ms_nom", titulo: "Nómina docente", detalle: "Contrato, actividades, horas, grupo, matriculados y programa de cada profesor (pregrado y posgrado).", obligatoria: true },
  { id: "aprobacion", conjunto: "ms_aprob", titulo: "Estado de aprobación en Master", detalle: "Aprobada, preaprobada o por confirmar. Sin ella, todos quedan «sin dato en Master».", obligatoria: false },
  { id: "horario", conjunto: "ms_hordep", titulo: "Horarios por departamento", detalle: "Día y hora de cada clase: la distribución semanal. Sin ella, la pestaña Semana queda vacía.", obligatoria: false },
  { id: "posgrado", conjunto: "ms_posg", titulo: "Matriculados por grupo (posgrado)", detalle: "Dice qué grupos son de posgrado, para las reglas de PLI-TC. Sin ella se deduce por el nombre del programa.", obligatoria: false },
];

interface CargaMeta {
  id: string;
  conjunto: string;
  version: number;
  filas: number;
  terminada_en: string | null;
}

interface RespuestaInsumo<T> {
  carga: CargaMeta | null;
  total: number;
  filas: T[];
}

/** Qué hay cargado de cada insumo para un periodo y sede: solo la ficha de la carga, sin traer filas. */
export const useInsumosEstado = (periodo: string, sede: string, activo: boolean) =>
  useQuery({
    queryKey: ctKeys.insumos(periodo, sede),
    enabled: activo,
    queryFn: async (): Promise<Record<Fuente, CargaMeta | null>> => {
      const partes = await Promise.all(FUENTES.map((f) => rpc<RespuestaInsumo<unknown>>("ct_insumos", { p_periodo: periodo, p_sede: sede, p_fuente: f.id, p_desde: 0, p_cuantas: 1 })));
      return Object.fromEntries(FUENTES.map((f, i) => [f.id, partes[i].carga])) as Record<Fuente, CargaMeta | null>;
    },
  });

const PAGINA = 4000;

async function leerFuente<T>(periodo: string, sede: string, fuente: Fuente): Promise<{ filas: T[]; carga: CargaMeta | null }> {
  const filas: T[] = [];
  let desde = 0;
  let carga: CargaMeta | null = null;
  for (;;) {
    const r = await rpc<RespuestaInsumo<T>>("ct_insumos", { p_periodo: periodo, p_sede: sede, p_fuente: fuente, p_desde: desde, p_cuantas: PAGINA });
    carga = r.carga;
    if (!r.carga) return { filas: [], carga: null };
    filas.push(...r.filas);
    desde += r.filas.length;
    if (r.filas.length === 0 || desde >= r.total) break;
  }
  return { filas, carga };
}

/* --- Calcular el corte ----------------------------------------------------------------------------------------- */

export type EstadoEtapa = "pendiente" | "en_curso" | "completada" | "omitida" | "fallida";

export interface EtapaCorte {
  id: string;
  titulo: string;
  estado: EstadoEtapa;
  detalle: string;
}

export const ETAPAS_CORTE: { id: string; titulo: string }[] = [
  { id: "nomina", titulo: "Nómina docente (ms_nom)" },
  { id: "aprobacion", titulo: "Estado de aprobación en Master (ms_aprob)" },
  { id: "horario", titulo: "Horarios (ms_hordep)" },
  { id: "posgrado", titulo: "Matriculados de posgrado (ms_posg)" },
  { id: "calculo", titulo: "Cálculo con el motor de tipología" },
  { id: "escritura", titulo: "Escritura del corte" },
];

export interface ResultadoEscritura {
  profesores: number;
  observaciones: number;
  programas_nuevos: number;
  programas_sin_unidad: number;
}

const enLotes = <T,>(lista: T[], tamano: number): T[][] => {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
};

/**
 * Corre un corte completo de un periodo y sede.
 *
 * Lee los insumos por ct_insumos (solo el administrador del módulo), corre el motor aquí mismo y escribe por
 * ct_abrir_corte → ct_agregar_resumen / ct_agregar_detalle → ct_cerrar_corte. El corte anterior sigue siendo el vigente
 * hasta que el nuevo se cierra bien: si algo falla a medias, el nuevo se descarta y nadie ve filas a medias.
 * Ninguna fuente opcional que falte detiene el corte (como en Roomy): se anota en los avisos.
 */
export async function ejecutarCorte(p: { periodo: string; sede: "buc" | "cuc" | "val" | "bog"; onEtapas: (etapas: EtapaCorte[]) => void }): Promise<{ resultado: ResultadoCorte; escritura: ResultadoEscritura }> {
  const etapas: EtapaCorte[] = ETAPAS_CORTE.map((e) => ({ ...e, estado: "pendiente", detalle: "" }));
  const marcar = (id: string, cambios: Partial<EtapaCorte>) => {
    const e = etapas.find((x) => x.id === id);
    if (e) Object.assign(e, cambios);
    p.onEtapas(etapas.map((x) => ({ ...x })));
  };
  p.onEtapas(etapas.map((x) => ({ ...x })));

  const insumos: InsumoUsado[] = [];
  const traer = async <T,>(fuente: Fuente, obligatoria: boolean): Promise<T[] | null> => {
    const def = FUENTES.find((f) => f.id === fuente)!;
    marcar(fuente, { estado: "en_curso" });
    try {
      const r = await leerFuente<T>(p.periodo, p.sede, fuente);
      if (!r.carga) {
        insumos.push({ fuente, conjunto: def.conjunto, version: null, filas: 0, terminada_en: null, usado: false });
        if (obligatoria) throw new Error(`No hay ${def.titulo.toLowerCase()} (${def.conjunto}) de ${p.periodo} en esta sede. Cárguela primero en el Warehouse.`);
        marcar(fuente, { estado: "omitida", detalle: "No está cargada en el Warehouse; el corte sigue sin ella." });
        return null;
      }
      insumos.push({ fuente, conjunto: def.conjunto, version: r.carga.version, filas: r.filas.length, terminada_en: r.carga.terminada_en, usado: true });
      marcar(fuente, { estado: "completada", detalle: `${r.filas.length.toLocaleString("es-CO")} filas, versión ${r.carga.version}.` });
      return r.filas;
    } catch (error) {
      marcar(fuente, { estado: "fallida", detalle: mensajeDe(error) });
      throw error;
    }
  };

  const nomina = (await traer<FilaNominaWh>("nomina", true)) ?? [];
  const aprobacion = await traer<FilaAprobacionWh>("aprobacion", false);
  const horario = await traer<FilaHorarioWh>("horario", false);
  const posgrado = await traer<FilaPosgradoWh>("posgrado", false);

  marcar("calculo", { estado: "en_curso" });
  const resultado = calcularCorte({ sede: p.sede, nomina, aprobacion, horario, posgrado }, REGLAS_BASE);
  if (resultado.resumenes.length === 0) {
    marcar("calculo", { estado: "fallida", detalle: "La nómina no produjo ningún profesor." });
    throw new Error("La nómina no produjo ningún profesor: no hay nada que calcular.");
  }
  marcar("calculo", { estado: "completada", detalle: `${resultado.resumenes.length.toLocaleString("es-CO")} profesores, ${resultado.observaciones.length.toLocaleString("es-CO")} observaciones.` });

  marcar("escritura", { estado: "en_curso" });
  const corte = await rpc<string>("ct_abrir_corte", { p_periodo: p.periodo, p_sede: p.sede, p_insumos: insumos, p_reglas: resultado.reglas });
  try {
    for (const lote of enLotes(resultado.resumenes, 100)) await rpc<number>("ct_agregar_resumen", { p_corte: corte, p_filas: lote });
    for (const lote of enLotes(resultado.observaciones, 300)) await rpc<number>("ct_agregar_detalle", { p_corte: corte, p_tipo: "observacion", p_filas: lote });
    for (const lote of enLotes(resultado.grupos, 300)) await rpc<number>("ct_agregar_detalle", { p_corte: corte, p_tipo: "grupo", p_filas: lote });
    // Lo que solo ve el administrador: va a su propia tabla, aparte del resumen.
    for (const lote of enLotes(resultado.master, 100)) await rpc<number>("ct_agregar_detalle", { p_corte: corte, p_tipo: "master", p_filas: lote });
    await rpc<void>("ct_avisos_corte", { p_corte: corte, p_avisos: resultado.avisos });
    const escritura = await rpc<ResultadoEscritura & { ok: boolean }>("ct_cerrar_corte", { p_corte: corte, p_ok: true, p_mensaje: resultado.avisos.join(" ") });
    marcar("escritura", { estado: "completada", detalle: "El corte quedó vigente." });
    return { resultado, escritura };
  } catch (error) {
    marcar("escritura", { estado: "fallida", detalle: mensajeDe(error) });
    // Se descarta lo escrito a medias; el corte anterior sigue vigente.
    await supabase.rpc("ct_cerrar_corte", { p_corte: corte, p_ok: false, p_mensaje: mensajeDe(error) });
    throw error;
  }
}

export function useCalcularCorte() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ejecutarCorte,
    onSettled: () => cliente.invalidateQueries({ queryKey: ctKeys.todo }),
  });
}
