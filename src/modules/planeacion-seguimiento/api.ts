/* =============================================================================
   Planeación y Seguimiento · capa de datos.

   `PsApi` es lo único que las pantallas conocen. Hay dos implementaciones:
     · `crearApiSupabase()` sigue el contrato de la base (docs/planeacion-seguimiento/
       CONTRATO-BD.md, migración 0286): tablas de solo lectura y funciones ps_*.
     · `crearApiMemoria()` guarda todo en memoria, con los 75 proyectos reales como
       fixtures, para desarrollo (?ps=demo) y pruebas. No es un simulacro de seguridad:
       el permiso real lo hace cumplir la base.
   ========================================================================== */

import { createContext, useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { PsApiAct } from "./actividades/contratoApi";
import { crearActividadesMemoria } from "./actividades/memoria";
import { crearActividadesSupabase } from "./actividades/supabaseAct";
import type { PapelOficina } from "./actividades/modelo";
import { catalogoColumnas, configPorOmision, listaDeConfig, saludDe, totalesDe, filtrarTablero, type ConfigPlan, type DatosPlan, type FiltrosTablero, type PlanOficinaCelda, type PlanResumen, type PlanTablero, type SaludPlan, type TableroAdmin, type AlertaTablero } from "./modeloPlanes";
import { estadoPlazo, sumarDias } from "./actividades/modelo";
import type { Actividad } from "./actividades/modelo";
import { CATALOGO_PDI_DEMO } from "./actividades/semilla";
import { CAMPUS, CAMPUS_TODOS, PRIORIDADES, type CargaPlanificacion, type ClaveCriterio, type ClaveViabilidad, type Linea, type Oficina, type PlanVista, type PsNivel, type VersionResumen, aniosDe, llano } from "./modelo";

export interface ErrorCarga {
  /** Posición (desde 1) de la línea dentro de lo enviado; null si es del plan entero. */
  fila: number | null;
  campo: string;
  mensaje: string;
}

export interface ResultadoCarga {
  versionId: string | null;
  etiqueta: string | null;
  recibidas: number;
  aceptadas: number;
  errores: ErrorCarga[];
}

export interface PsApi extends PsApiAct {
  nivel(): Promise<PsNivel>;
  /** Nombres de los campus del portal (sin «Todos»). */
  campus(): Promise<string[]>;
  oficinas(): Promise<Oficina[]>;
  /** El plan ACTIVO (el que fijó `fijarPlan`; si no hay, el más reciente visible). Nulo si aún no hay ninguno. */
  plan(): Promise<PlanVista | null>;
  /** Fase 3B: los planes que la persona ve, con sus cifras (`ps_planes_visibles`). */
  planes(): Promise<PlanResumen[]>;
  /** Fija el plan con el que se hacen TODAS las llamadas siguientes (`p_plan`). Síncrono: lo llama el proveedor al elegir. */
  fijarPlan(planId: string | null): void;
  /** Guarda el plan activo de la persona (`ps_plan_activo_guardar`). */
  guardarPlanActivo(planId: string): Promise<void>;
  /** Configuración de la plantilla y pilares de un plan (`ps_plan_config_leer`). */
  configPlan(planId: string): Promise<ConfigPlan>;
  editarPlan(planId: string, d: DatosPlan): Promise<void>;
  archivarPlan(planId: string, motivo: string): Promise<void>;
  reabrirPlan(planId: string): Promise<void>;
  /** Tablero de todos los planes (`ps_tablero_admin`); el administrador opera, aprobador y lector solo miran. */
  tableroAdmin(filtros?: FiltrosTablero): Promise<TableroAdmin>;
  versiones(planId: string): Promise<VersionResumen[]>;
  lineas(versionId: string): Promise<Linea[]>;
  crearPlan(d: DatosPlan): Promise<string>;
  cargarPlanificacion(c: CargaPlanificacion): Promise<ResultadoCarga>;
  publicarVersion(versionId: string, nota: string): Promise<{ etiqueta: string }>;
}

/* ---------- Contexto y hooks ---------- */

export const PsApiContext = createContext<PsApi | null>(null);
export function usePsApi(): PsApi {
  const api = useContext(PsApiContext);
  if (!api) throw new Error("Falta el proveedor de la capa de datos de Planeación y Seguimiento.");
  return api;
}

/** El plan activo, que va al final de las claves de caché de todo lo que depende del plan (el proveedor lo fija al elegir). */
let claveDePlan = "";
export const fijarClaveDePlan = (id: string | null): void => void (claveDePlan = id ?? "");
export const claveDelPlan = (): string => claveDePlan;

export const psKeys = {
  todo: ["ps"] as const,
  nivel: ["ps", "nivel"] as const,
  planes: ["ps", "planes"] as const,
  get plan() { return ["ps", "plan", claveDePlan] as const; },
  campus: ["ps", "campus"] as const,
  oficinas: ["ps", "oficinas"] as const,
  versiones: (plan: string | null) => ["ps", "versiones", plan] as const,
  lineas: (version: string | null) => ["ps", "lineas", version] as const,
  config: (plan: string | null) => ["ps", "config-plan", plan] as const,
  tablero: (f: unknown) => ["ps", "tablero", claveDePlan, f] as const,
};

export const usePlan = () => {
  const api = usePsApi();
  return useQuery({ queryKey: psKeys.plan, queryFn: () => api.plan(), retry: false });
};
export const useVersiones = (planId: string | null) => {
  const api = usePsApi();
  return useQuery({ queryKey: psKeys.versiones(planId), queryFn: () => api.versiones(planId!), enabled: Boolean(planId), retry: false });
};
export const useLineas = (versionId: string | null) => {
  const api = usePsApi();
  return useQuery({ queryKey: psKeys.lineas(versionId), queryFn: () => api.lineas(versionId!), enabled: Boolean(versionId), retry: false });
};
export const usePlanes = () => {
  const api = usePsApi();
  return useQuery({ queryKey: psKeys.planes, queryFn: () => api.planes(), retry: false });
};
export const useConfigPlan = (planId: string | null) => {
  const api = usePsApi();
  return useQuery({ queryKey: psKeys.config(planId), queryFn: () => api.configPlan(planId!), enabled: Boolean(planId), retry: false });
};
export const useTableroAdmin = (f: FiltrosTablero, activo = true) => {
  const api = usePsApi();
  return useQuery({ queryKey: psKeys.tablero(f), queryFn: () => api.tableroAdmin(f), enabled: activo, retry: false });
};
export function usePlanOps() {
  const api = usePsApi();
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: psKeys.todo });
  return {
    editar: useMutation({ mutationFn: (d: { planId: string; datos: DatosPlan }) => api.editarPlan(d.planId, d.datos), onSuccess: inv }),
    archivar: useMutation({ mutationFn: (d: { planId: string; motivo: string }) => api.archivarPlan(d.planId, d.motivo), onSuccess: inv }),
    reabrir: useMutation({ mutationFn: (planId: string) => api.reabrirPlan(planId), onSuccess: inv }),
  };
}
export const useCampus = () => {
  const api = usePsApi();
  return useQuery({ queryKey: psKeys.campus, queryFn: () => api.campus(), staleTime: 300_000 });
};
export const useOficinas = () => {
  const api = usePsApi();
  return useQuery({ queryKey: psKeys.oficinas, queryFn: () => api.oficinas(), staleTime: 300_000 });
};
export function useCrearPlan() {
  const api = usePsApi();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: DatosPlan) => api.crearPlan(d), onSuccess: () => qc.invalidateQueries({ queryKey: psKeys.todo }) });
}
export function useCargarPlanificacion() {
  const api = usePsApi();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (c: CargaPlanificacion) => api.cargarPlanificacion(c), onSuccess: () => qc.invalidateQueries({ queryKey: psKeys.todo }) });
}
export function usePublicarVersion() {
  const api = usePsApi();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: { versionId: string; nota: string }) => api.publicarVersion(d.versionId, d.nota), onSuccess: () => qc.invalidateQueries({ queryKey: psKeys.todo }) });
}

/* ============================================================================
   Implementación en memoria (fixtures: los 75 proyectos reales)
   ========================================================================== */

export interface OpcionesMemoria {
  nivel?: PsNivel;
  /** ninguno: estado vacío guiado · borrador: v1.0 sin publicar · publicado: v1.0 vigente. */
  estado?: "ninguno" | "borrador" | "publicado";
  /** Milisegundos de espera simulada en cada llamada. */
  latencia?: number;
  campus?: string[];
  oficinas?: string[];
  /** Fase 2: papel de la persona de la demostración en su oficina (TI). «ninguno»: no es miembro de ninguna. */
  papel?: PapelOficina | "ninguno";
  /** Fase 2: «hoy» de la demostración (AAAA-MM-DD). */
  hoy?: string;
}

export const OFICINAS_DEMO = ["Vicerrectoría Administrativa y Financiera", "Planeación Institucional", "Infraestructura y Planta Física", "Tecnología e Infraestructura TI", "Compras y Contratación", "Bienestar Universitario"];

export async function cargarFixtures(): Promise<Linea[]> {
  const m = await import("./datos/pdifyt-2027-2035.json");
  return structuredClone(m.default) as unknown as Linea[];
}

interface VersionMem {
  meta: VersionResumen;
  lineas: Linea[];
}

interface PlanMem {
  id: string;
  nombre: string;
  anioIni: number;
  anioFin: number;
  descripcion: string;
  estado: "activo" | "archivado";
  alcance: "institucional" | "oficina";
  oficinaId: string;
  config: ConfigPlan;
  versiones: VersionMem[];
  creadoEn: string;
}

/** Líneas de los planes de demostración que no son el PDIFyT: se toman de las reales con otras claves, oficina y años. */
function lineasDeOficina(reales: Linea[], oficina: string, prefijo: string, n: number, anioIni: number, anioFin: number): Linea[] {
  return reales.filter((l) => l.inicio && l.fin && l.resultado).slice(0, n * 4).filter((_, i) => i % 4 === 0).slice(0, n).map((l, i) => ({
    ...structuredClone(l), no: `${prefijo}${i + 1}`, oficina,
    inicio: `${anioIni}-0${1 + (i % 6)}-15`, fin: `${anioFin}-${String(6 + (i % 6)).padStart(2, "0")}-28`,
    pct: Object.fromEntries(Array.from({ length: anioFin - anioIni + 1 }, (_, k) => [String(anioIni + k), 1 / (anioFin - anioIni + 1)])),
  }));
}

export function crearApiMemoria(op: OpcionesMemoria = {}): PsApi {
  const espera = () => new Promise<void>((r) => setTimeout(r, op.latencia ?? 0));
  const campus = op.campus ?? [...CAMPUS];
  const oficinas = (op.oficinas ?? OFICINAS_DEMO).map((nombre, i) => ({ id: `of-${i + 1}`, nombre }));
  const nombreOf = (id: string | null) => oficinas.find((o) => o.id === id)?.nombre ?? "";
  const nivelDe = op.nivel ?? "admin";
  let planes: PlanMem[] = [];
  let activoId: string | null = null;
  let listo: Promise<void> | null = null;
  const mkMeta = (id: string, etiqueta: string, lineas: Linea[], publicada: boolean): VersionResumen => ({
    id, etiqueta, estado: publicada ? "publicada" : "borrador", vigente: publicada, origen: "carga_matriz", nLineas: lineas.length,
    inversion: lineas.reduce((s, l) => s + (l.monto ?? 0), 0), creadaEn: "2026-11-19T10:00:00Z", publicadaEn: publicada ? "2026-11-19T11:00:00Z" : null, nota: null,
  });

  const sembrar = async () => {
    if (!op.estado || op.estado === "ninguno") return;
    const reales = await cargarFixtures();
    const pdi = reales.map((l) => ({ ...l, campus: l.campus }));
    const cfgTec: ConfigPlan = {
      ...configPorOmision(),
      columnas: catalogoColumnas().filter((c) => !["fuente", "origen", "resultado", "clasif"].includes(c.clave)),
      pilares: [{ id: "pl-t1", codigo: "T1", nombre: "Continuidad de los servicios", pillarId: null, activo: true }, { id: "pl-t2", codigo: "T2", nombre: "Seguridad de la información", pillarId: null, activo: true }, { id: "pl-t3", codigo: "T3", nombre: "Datos e inteligencia", pillarId: CATALOGO_PDI_DEMO[0]?.pillarId ?? null, activo: true }],
    };
    const tec = lineasDeOficina(reales, "Tecnología e Infraestructura TI", "T", 8, 2027, 2029).map((l, i) => ({ ...l, pilar: ["T1. Continuidad de los servicios", "T2. Seguridad de la información", "T3. Datos e inteligencia"][i % 3] }));
    const bien = lineasDeOficina(reales, "Bienestar Universitario", "B", 5, 2024, 2026);
    planes = [
      { id: "plan-1", nombre: "PDIFyT 2027-2035", anioIni: 2027, anioFin: 2035, descripcion: "Plan de Desarrollo de Infraestructura Física y Tecnológica de la Universidad.", estado: "activo", alcance: "institucional", oficinaId: "of-2", config: configPorOmision(), versiones: [{ meta: mkMeta("ver-1", "v1.0", pdi, op.estado === "publicado"), lineas: pdi }], creadoEn: "2026-11-19T10:00:00Z" },
      { id: "plan-2", nombre: "Plan de Tecnología 2027-2029", anioIni: 2027, anioFin: 2029, descripcion: "Plan propio de la oficina de Tecnología: continuidad, seguridad y datos.", estado: "activo", alcance: "oficina", oficinaId: "of-4", config: cfgTec, versiones: [{ meta: mkMeta("ver-t1", "v1.0", tec, op.estado === "publicado"), lineas: tec }], creadoEn: "2026-12-02T10:00:00Z" },
      { id: "plan-3", nombre: "Plan de Bienestar 2024-2026", anioIni: 2024, anioFin: 2026, descripcion: "Plan de la oficina de Bienestar del periodo anterior. Archivado.", estado: "archivado", alcance: "oficina", oficinaId: "of-6", config: configPorOmision(), versiones: [{ meta: { ...mkMeta("ver-b1", "v1.0", bien, true), creadaEn: "2023-11-01T10:00:00Z", publicadaEn: "2023-11-15T10:00:00Z" }, lineas: bien }], creadoEn: "2023-11-01T10:00:00Z" },
    ];
    activoId ??= "plan-1";
  };
  const iniciar = () => (listo ??= sembrar());
  const planActual = (): PlanMem | null => planes.find((p) => p.id === activoId) ?? [...planes].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).find((p) => p.estado === "activo") ?? planes[0] ?? null;
  const unPlan = (id: string): PlanMem => {
    const p = planes.find((x) => x.id === id);
    if (!p) throw new Error("Ese plan no existe o no puede verlo.");
    return p;
  };
  const vigenteDe = (p: PlanMem) => p.versiones.find((x) => x.meta.vigente) ?? p.versiones.find((x) => x.meta.estado === "borrador") ?? null;
  const vistaDe = (p: PlanMem): PlanVista => {
    const v = vigenteDe(p);
    return { id: p.id, nombre: p.nombre, anioIni: p.anioIni, anioFin: p.anioFin, descripcion: p.descripcion, estado: p.estado, alcance: p.alcance, oficina: { id: p.oficinaId, nombre: nombreOf(p.oficinaId) }, version: v ? { ...v.meta } : null };
  };

  /** Un adaptador de actividades por plan (cada uno con sus líneas y sus actividades de demostración). */
  const adaptadores = new Map<string, PsApiAct>();
  const crearAct = (planId: string): PsApiAct =>
    crearActividadesMemoria({
      nivel: nivelDe, papel: op.papel ?? "jefe", hoy: op.hoy, campus, espera,
      lineas: async () => { await iniciar(); const p = planes.find((x) => x.id === planId); const v = p ? vigenteDe(p) : null; return structuredClone(v?.lineas ?? []); },
    });
  const adaptadorDe = (planId: string | null): PsApiAct => {
    const id = planId ?? "__vacio__";
    if (!adaptadores.has(id)) adaptadores.set(id, crearAct(id));
    return adaptadores.get(id)!;
  };
  const muestra = adaptadorDe("__muestra__");
  const delegados: Record<string, unknown> = {};
  for (const k of Object.keys(muestra) as (keyof PsApiAct)[]) {
    const v = muestra[k];
    delegados[k] = typeof v === "function" ? (...a: unknown[]) => (adaptadorDe(planActual()?.id ?? null)[k] as (...x: unknown[]) => unknown)(...a) : v;
  }
  const hoy = muestra.hoy;
  const oficinasDe = async (api: PsApiAct) => (await api.oficinasVisibles()).map((o) => o.id);

  const lineasDe = (p: PlanMem) => vigenteDe(p)?.lineas.length ?? 0;
  /** Cifras de un plan a partir de sus actividades visibles. */
  const cifrasDe = async (p: PlanMem): Promise<{ acts: Actividad[]; resumen: PlanResumen; tablero: PlanTablero }> => {
    const api = adaptadorDe(p.id);
    const acts = await api.actividades(await oficinasDe(api));
    const vencidas = acts.filter((a) => estadoPlazo(a, hoy) === "vencida").length;
    const porValidar = acts.reduce((s, a) => s + a.avance.pendientes, 0);
    const enRiesgo = acts.filter((a) => a.estado === "en_riesgo").length;
    const avance = acts.length ? Math.round(acts.reduce((s, a) => s + a.avance.fisico, 0) / acts.length) : 0;
    const conFin = acts.filter((a) => a.avance.financiero !== null);
    const resumen: PlanResumen = {
      id: p.id, nombre: p.nombre, anioIni: p.anioIni, anioFin: p.anioFin, descripcion: p.descripcion, estado: p.estado, alcance: p.alcance, oficina: { id: p.oficinaId, nombre: nombreOf(p.oficinaId) },
      versionVigente: p.versiones.find((v) => v.meta.vigente)?.meta.etiqueta ?? null, poder: nivelDe === "admin" ? "admin" : nivelDe === "gestor" ? "gestor" : nivelDe === "colaborador" ? "colaborador" : "lector",
      lineas: lineasDe(p), actividades: acts.length, vencidas, porValidar, avanceFisico: avance, avanceFinanciero: conFin.length ? Math.round(conFin.reduce((s, a) => s + (a.avance.financiero ?? 0), 0) / conFin.length) : null,
      salud: saludDe({ actividades: acts.length, vencidas, porValidar, enRiesgo }), activo: p.id === planActual()?.id,
    };
    const porOficina: PlanOficinaCelda[] = oficinas.map((o) => {
      const xs = acts.filter((a) => a.oficinaId === o.id);
      const v = xs.filter((a) => estadoPlazo(a, hoy) === "vencida").length;
      const pv = xs.reduce((s, a) => s + a.avance.pendientes, 0);
      return { unitId: o.id, nombre: o.nombre, lineas: vigenteDe(p)?.lineas.filter((l) => l.oficina === o.nombre).length ?? 0, actividades: xs.length, avance: xs.length ? Math.round(xs.reduce((s, a) => s + a.avance.fisico, 0) / xs.length) : 0, vencidas: v, porValidar: pv, salud: saludDe({ actividades: xs.length, vencidas: v, porValidar: pv }) };
    }).filter((o) => o.actividades > 0 || o.lineas > 0);
    const porEstado: Record<string, number> = {};
    for (const a of acts) porEstado[a.estado] = (porEstado[a.estado] ?? 0) + 1;
    const pilares = new Map<string, number>();
    for (const a of acts) for (const i of a.pdi.items) pilares.set(i.pilar, (pilares.get(i.pilar) ?? 0) + 1);
    // Ritmo: los avances validados por semana, de la fecha de su última validación (las 8 semanas hasta «hoy»).
    const ritmo = Array.from({ length: 8 }, (_, k) => {
      const fin = sumarDias(hoy, -7 * (7 - k));
      const ini = sumarDias(fin, -6);
      return { semana: ini, avancesValidados: acts.filter((a) => a.avance.validadoEn && a.avance.validadoEn.slice(0, 10) >= ini && a.avance.validadoEn.slice(0, 10) <= fin).length };
    });
    return { acts, resumen, tablero: { ...resumen, porOficina, porEstado, porPilar: [...pilares].map(([nombre, actividades]) => ({ nombre, actividades })).sort((a, b) => b.actividades - a.actividades), ritmoSemanas: ritmo, monto: vigenteDe(p)?.meta.inversion ?? 0 } };
  };
  const visibles = (): PlanMem[] => planes;

  return {
    ...(delegados as unknown as PsApiAct),
    async nivel() { await espera(); return nivelDe; },
    async campus() { await espera(); return campus; },
    async oficinas() { await espera(); return oficinas; },
    fijarPlan(id) { if (id) activoId = id; },
    async guardarPlanActivo(id) { await iniciar(); await espera(); unPlan(id); activoId = id; },
    async plan() { await iniciar(); await espera(); const p = planActual(); return p ? vistaDe(p) : null; },
    async planes() {
      await iniciar(); await espera();
      return (await Promise.all(visibles().map((p) => cifrasDe(p)))).map((c) => c.resumen);
    },
    async configPlan(planId) { await iniciar(); await espera(); return structuredClone(unPlan(planId).config); },
    async editarPlan(planId, d) {
      await iniciar(); await espera();
      const p = unPlan(planId);
      if (planes.some((x) => x.id !== planId && llano(x.nombre) === llano(d.nombre))) throw new Error("Ya existe un plan con ese nombre.");
      if (nivelDe !== "admin" && nivelDe !== "gestor") throw new Error("Solo el administrador o el gestor de la oficina editan el plan.");
      const publicada = p.versiones.some((v) => v.meta.estado === "publicada");
      Object.assign(p, { nombre: d.nombre.trim(), descripcion: d.descripcion.trim(), config: structuredClone(d.config) });
      if (nivelDe === "admin" && d.oficinaId) p.oficinaId = d.oficinaId;
      if (!publicada) { p.anioIni = d.anioIni; p.anioFin = d.anioFin; }
    },
    async archivarPlan(planId, motivo) {
      await iniciar(); await espera();
      if (motivo.trim().length < 10) throw new Error("Cuente por qué lo archiva (al menos 10 caracteres).");
      unPlan(planId).estado = "archivado";
    },
    async reabrirPlan(planId) { await iniciar(); await espera(); unPlan(planId).estado = "activo"; },
    async tableroAdmin(f = {}) {
      await iniciar(); await espera();
      const todos = await Promise.all(planes.map((p) => cifrasDe(p)));
      const tableros = todos.map((c) => c.tablero);
      const alertas: AlertaTablero[] = [];
      for (const [i, p] of planes.entries()) {
        const t = tableros[i];
        if (p.estado === "archivado") continue;
        if (!p.versiones.some((v) => v.meta.vigente)) alertas.push({ tipo: "plan_sin_version", planId: p.id, oficinaId: p.oficinaId, severidad: "media", texto: `«${p.nombre}» no tiene una versión vigente: sus líneas son un borrador.` });
        for (const o of t.porOficina) {
          if (o.actividades > 0 && o.vencidas / o.actividades >= 0.2) alertas.push({ tipo: "actividades_vencidas", planId: p.id, oficinaId: o.unitId, severidad: "alta", texto: `${o.nombre}: ${o.vencidas} de ${o.actividades} actividades de «${p.nombre}» están vencidas.` });
          if (o.porValidar > 0) alertas.push({ tipo: "avances_por_validar_vencidos", planId: p.id, oficinaId: o.unitId, severidad: "media", texto: `${o.nombre}: ${o.porValidar} ${o.porValidar === 1 ? "avance espera" : "avances esperan"} validación en «${p.nombre}».` });
          if (o.lineas > 0 && o.actividades === 0) alertas.push({ tipo: "oficina_sin_responsable", planId: p.id, oficinaId: o.unitId, severidad: "baja", texto: `${o.nombre} tiene líneas en «${p.nombre}» pero aún no planifica actividades.` });
        }
      }
      const filtrado = filtrarTablero({ generadoEn: new Date().toISOString(), totales: totalesDe(tableros), planes: tableros, alertas }, f);
      return { ...filtrado, totales: totalesDe(filtrado.planes) };
    },
    async versiones(planId) {
      await iniciar(); await espera();
      const p = planes.find((x) => x.id === planId);
      return p ? p.versiones.map((v) => ({ ...v.meta })).reverse() : [];
    },
    async lineas(versionId) {
      await iniciar(); await espera();
      const v = planes.flatMap((p) => p.versiones).find((x) => x.meta.id === versionId);
      if (!v) throw new Error("Esa versión no existe.");
      return structuredClone(v.lineas);
    },
    async crearPlan(d) {
      await iniciar(); await espera();
      if (planes.some((x) => llano(x.nombre) === llano(d.nombre))) throw new Error("Ya existe un plan con ese nombre.");
      if (!d.oficinaId) throw new Error("Indique la oficina dueña del plan.");
      if (d.alcance === "institucional" && nivelDe !== "admin") throw new Error("Un plan institucional lo crea solo el administrador.");
      if (nivelDe !== "admin" && nivelDe !== "gestor") throw new Error("Solo el administrador o el gestor de una oficina crean planes.");
      const id = `plan-${Date.now()}`;
      planes = [...planes, { id, nombre: d.nombre.trim(), anioIni: d.anioIni, anioFin: d.anioFin, descripcion: d.descripcion.trim(), estado: "activo", alcance: d.alcance, oficinaId: d.oficinaId, config: structuredClone(d.config), versiones: [], creadoEn: new Date().toISOString() }];
      activoId = id;
      return id;
    },
    async cargarPlanificacion(c) {
      await iniciar(); await espera();
      const plan = planes.find((p) => p.id === c.planId);
      if (!plan) throw new Error("Ese plan no existe.");
      if (plan.versiones.some((v) => v.meta.vigente)) {
        return { versionId: null, etiqueta: null, recibidas: c.lineas.length, aceptadas: 0, errores: [{ fila: null, campo: "plan", mensaje: "La carga sobre un plan vigente se hace por solicitud de cambio (fase 4)." }] };
      }
      const errores: ErrorCarga[] = [];
      const claves = new Set<string>();
      const prioridades = listaDeConfig(plan.config, "prioridad");
      c.lineas.forEach((l, i) => {
        if (l.campus && l.campus !== CAMPUS_TODOS && !campus.some((x) => llano(x) === llano(l.campus))) errores.push({ fila: i + 1, campo: "campus", mensaje: `El campus «${l.campus}» no existe en la lista de campus del portal.` });
        if (l.prioridad && !prioridades.some((p) => p === l.prioridad)) errores.push({ fila: i + 1, campo: "prioridad", mensaje: `La prioridad «${l.prioridad}» no es válida.` });
        if (claves.has(l.no)) errores.push({ fila: i + 1, campo: "clave", mensaje: `La clave «${l.no}» está repetida.` });
        claves.add(l.no);
      });
      if (errores.length) return { versionId: null, etiqueta: null, recibidas: c.lineas.length, aceptadas: 0, errores };
      const heredada = c.lineas.map((l) => ({ ...l, oficina: l.oficina ?? nombreOf(plan.oficinaId) }));
      plan.versiones = [{ meta: mkMeta(`ver-${plan.id}`, "v1.0", heredada, false), lineas: structuredClone(heredada) }];
      adaptadores.delete(plan.id);
      return { versionId: `ver-${plan.id}`, etiqueta: "v1.0", recibidas: c.lineas.length, aceptadas: c.lineas.length, errores: [] };
    },
    async publicarVersion(versionId) {
      await iniciar(); await espera();
      const v = planes.flatMap((p) => p.versiones).find((x) => x.meta.id === versionId);
      if (!v) throw new Error("Esa versión no existe.");
      if (v.meta.estado === "publicada") throw new Error("Esa versión ya está publicada.");
      if (!v.lineas.length) throw new Error("No se puede publicar una versión sin líneas.");
      v.meta = { ...v.meta, estado: "publicada", vigente: true, publicadaEn: new Date().toISOString() };
      return { etiqueta: v.meta.etiqueta };
    },
  };
}

/* ============================================================================
   Implementación Supabase (contrato de la migración 0286)
   ========================================================================== */

type Fila = Record<string, unknown>;
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const siNo = (v: unknown): boolean | null => (v === "Si" || v === "Sí" || v === true ? true : v === "No" || v === false ? false : null);

function errorDe(e: { message?: string } | null): Error {
  return new Error(e?.message || "No se pudo completar la operación.");
}

/** Una fila de ps_version_lineas → Linea. `campus_id` nulo es «Todos». */
export function lineaDeFila(f: Fila, nombreCampus: Map<string, string>, nombreOficina: Map<string, string>): Linea {
  const jc = (f.criterios ?? {}) as Record<string, unknown>;
  const jv = (f.viabilidad ?? {}) as Record<string, unknown>;
  const pct = (f.pct ?? {}) as Record<string, unknown>;
  const clave = (o: Record<string, unknown>, ks: string[]) => Object.fromEntries(ks.map((k) => [k, siNo(o[k])]));
  return {
    no: String(f.clave ?? ""),
    clasif: texto(f.clasif) ?? "",
    nombre: String(f.nombre ?? ""),
    descripcion: texto(f.descripcion),
    campus: f.campus_id ? (nombreCampus.get(String(f.campus_id)) ?? texto(f.campus_texto) ?? "Campus") : CAMPUS_TODOS,
    pilar: String(f.pilar ?? ""),
    monto: f.monto === null || f.monto === undefined ? null : Number(f.monto),
    prioridad: String(f.prioridad ?? ""),
    resultado: texto(f.resultado),
    fuente: texto(f.fuente),
    criterios: clave(jc, ["alin", "deficit", "norm", "pdi", "sost"]) as Record<ClaveCriterio, boolean | null>,
    viabilidad: clave(jv, ["tec", "fin", "op", "nor", "est"]) as Record<ClaveViabilidad, boolean | null>,
    inicio: texto(f.inicio),
    fin: texto(f.fin),
    pct: Object.fromEntries(Object.entries(pct).map(([k, v]) => [k, Number(v)])),
    origen: texto(f.origen),
    oficina: f.oficina_unit_id ? (nombreOficina.get(String(f.oficina_unit_id)) ?? null) : null,
    gestorCorreo: texto(((f.extra ?? {}) as Record<string, unknown>).gestor_correo),
  };
}

/** Una Linea → el objeto que recibe ps_cargar_matriz en p_lineas. */
export function lineaParaCarga(l: Linea, idOficina: Map<string, string>): Fila {
  const lleno = (o: Record<string, boolean | null>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === true ? "Si" : v === false ? "No" : null]));
  const hayPct = Object.values(l.pct).some((v) => v > 0);
  return {
    clave: l.no, clasif: l.clasif, nombre: l.nombre, descripcion: l.descripcion, campus: l.campus, pilar: l.pilar, monto: l.monto, prioridad: l.prioridad,
    resultado: l.resultado, fuente: l.fuente, origen: l.origen, criterios: lleno(l.criterios), viabilidad: lleno(l.viabilidad), inicio: l.inicio, fin: l.fin,
    pct: hayPct ? l.pct : {}, oficina_unit_id: l.oficina ? (idOficina.get(llano(l.oficina)) ?? null) : null,
    extra: l.gestorCorreo ? { gestor_correo: l.gestorCorreo } : {},
  };
}

const columnasParaBase = (c: ConfigPlan) => c.columnas.map((x) => ({ clave: x.clave, etiqueta: x.etiqueta, tipo: x.tipo, obligatoria: x.obligatoria, ...(x.lista ? { lista: x.lista } : {}), ...(x.ayuda ? { ayuda: x.ayuda } : {}) }));
const pilaresParaBase = (c: ConfigPlan) => c.pilares.map((p, i) => ({ orden: i + 1, codigo: p.codigo, nombre: p.nombre, pillar_id: p.pillarId, activo: p.activo }));

/** `ps_plan_config_leer` → ConfigPlan (sin configuración propia, la del PDIFyT por omisión). */
export function configDeJson(v: unknown): ConfigPlan {
  const f = (v ?? {}) as Fila;
  const por = configPorOmision();
  const cols = Array.isArray(f.columnas) ? (f.columnas as Fila[]) : [];
  const pil = Array.isArray(f.pilares) ? (f.pilares as Fila[]) : [];
  return {
    columnas: cols.length ? cols.map((c) => ({ clave: String(c.clave), etiqueta: String(c.etiqueta ?? c.clave), tipo: (c.tipo as ConfigPlan["columnas"][number]["tipo"]) ?? "texto", obligatoria: Boolean(c.obligatoria), ...(Array.isArray(c.lista) ? { lista: c.lista.map(String) } : {}), ...(texto(c.ayuda) ? { ayuda: String(c.ayuda) } : {}) })) : por.columnas,
    listas: f.listas && typeof f.listas === "object" && Object.keys(f.listas as object).length ? (f.listas as Record<string, string[]>) : por.listas,
    pilares: pil.map((p) => ({ id: texto(p.id) ?? undefined, codigo: String(p.codigo ?? ""), nombre: String(p.nombre ?? ""), pillarId: texto(p.pillar_id), activo: p.activo !== false })),
  };
}

/** `ps_tablero_admin` → TableroAdmin. */
export function tableroDeJson(v: unknown): TableroAdmin {
  const f = (v ?? {}) as Fila;
  const t = (f.totales ?? {}) as Fila;
  return {
    generadoEn: String(f.generado_en ?? ""),
    totales: { planes: Number(t.planes ?? 0), activos: Number(t.activos ?? 0), lineas: Number(t.lineas ?? 0), actividades: Number(t.actividades ?? 0), vencidas: Number(t.vencidas ?? 0), enRiesgo: Number(t.en_riesgo ?? 0), porValidar: Number(t.por_validar ?? 0), avanceFisico: Number(t.avance_fisico ?? 0), avanceFinanciero: num(t.avance_financiero), monto: Number(t.monto ?? 0) },
    planes: ((f.planes ?? []) as Fila[]).map((p): PlanTablero => ({
      ...resumenDeFila(p),
      porOficina: ((p.por_oficina ?? []) as Fila[]).map((o) => ({ unitId: String(o.unit_id), nombre: String(o.nombre ?? ""), lineas: Number(o.lineas ?? 0), actividades: Number(o.actividades ?? 0), avance: Number(o.avance ?? 0), vencidas: Number(o.vencidas ?? 0), porValidar: Number(o.por_validar ?? 0), salud: saludDeTexto(o.salud) })),
      porEstado: Object.fromEntries(Object.entries((p.por_estado ?? {}) as Fila).map(([k, x]) => [k, Number(x)])),
      porPilar: ((p.por_pilar ?? []) as Fila[]).map((x) => ({ nombre: String(x.nombre ?? x.pilar ?? ""), actividades: Number(x.actividades ?? x.lineas ?? 0) })),
      ritmoSemanas: ((p.ritmo_semanas ?? []) as Fila[]).map((x) => ({ semana: String(x.semana), avancesValidados: Number(x.avances_validados ?? 0) })),
      monto: Number(p.monto ?? 0),
    })),
    alertas: ((f.alertas ?? []) as Fila[]).map((a): AlertaTablero => ({ tipo: String(a.tipo ?? "actividades_vencidas"), planId: String(a.plan_id ?? ""), oficinaId: texto(a.oficina_unit_id), texto: String(a.texto ?? ""), severidad: a.severidad === "alta" || a.severidad === "baja" ? a.severidad : "media" })),
  };
}

const aOficinaRef = (v: unknown): { id: string; nombre: string } | null => {
  const o = (v ?? null) as Fila | null;
  return o && (o.unit_id || o.id) ? { id: String(o.unit_id ?? o.id), nombre: String(o.nombre ?? "Oficina") } : null;
};
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const saludDeTexto = (v: unknown): SaludPlan => (v === "verde" || v === "rojo" ? v : v === "ambar" || v === "amarillo" ? "ambar" : "sin_datos");

/** Una fila de `ps_planes_visibles` → PlanResumen. */
export function resumenDeFila(f: Fila): PlanResumen {
  const v = (f.version_vigente ?? null) as Fila | null;
  return {
    id: String(f.id), nombre: String(f.nombre), anioIni: Number(f.anio_ini), anioFin: Number(f.anio_fin), descripcion: String(f.descripcion ?? ""), estado: f.estado === "archivado" ? "archivado" : "activo",
    alcance: f.alcance === "oficina" ? "oficina" : "institucional", oficina: aOficinaRef(f.oficina), versionVigente: v ? String(v.etiqueta ?? `v${v.numero ?? 1}.0`) : null,
    poder: f.poder === "admin" || f.poder === "gestor" || f.poder === "colaborador" || f.poder === "lector" ? f.poder : null,
    lineas: Number(f.lineas ?? 0), actividades: Number(f.actividades ?? 0), vencidas: Number(f.vencidas ?? 0), porValidar: Number(f.por_validar ?? 0),
    avanceFisico: Number(f.avance_fisico ?? 0), avanceFinanciero: num(f.avance_financiero), salud: saludDeTexto(f.salud), activo: Boolean(f.activo),
  };
}

export function crearApiSupabase(): PsApi {
  let planFijo: string | null = null;
  const nombresCampus = async () => {
    const r = await supabase.from("campuses").select("id,name").order("name");
    if (r.error) throw errorDe(r.error);
    return (r.data ?? []) as { id: string; name: string }[];
  };
  const unidades = async () => {
    const r = await supabase.from("units").select("id,name").order("name");
    if (r.error) throw errorDe(r.error);
    return ((r.data ?? []) as { id: string; name: string }[]).map((u) => ({ id: u.id, nombre: u.name }));
  };
  return {
    ...crearActividadesSupabase(() => planFijo),
    async nivel() {
      const r = await supabase.rpc("ps_nivel_actual");
      if (r.error) throw errorDe(r.error);
      return ((r.data as PsNivel | null) ?? "none") as PsNivel;
    },
    async campus() {
      return (await nombresCampus()).map((c) => c.name);
    },
    oficinas: unidades,
    fijarPlan(id) {
      planFijo = id;
    },
    async plan() {
      let q = supabase.from("ps_planes").select("*");
      q = planFijo ? q.eq("id", planFijo) : q.order("creado_en", { ascending: false }).limit(1);
      const p = await q;
      if (p.error) throw errorDe(p.error);
      const fila = (p.data as Fila[] | null)?.[0];
      if (!fila) return null;
      const lista = await this.versiones(String(fila.id));
      const v = lista.find((x) => x.vigente) ?? lista.find((x) => x.estado === "borrador") ?? null;
      const ofs = fila.oficina_unit_id ? (await unidades()).find((u) => u.id === String(fila.oficina_unit_id)) : null;
      return {
        id: String(fila.id), nombre: String(fila.nombre), anioIni: Number(fila.anio_ini), anioFin: Number(fila.anio_fin), version: v,
        descripcion: String(fila.descripcion ?? ""), estado: fila.estado === "archivado" ? "archivado" : "activo", alcance: fila.alcance === "oficina" ? "oficina" : "institucional", oficina: ofs ? { id: ofs.id, nombre: ofs.nombre } : null,
      };
    },
    async planes() {
      const r = await supabase.rpc("ps_planes_visibles");
      if (r.error) throw errorDe(r.error);
      return ((r.data ?? []) as Fila[]).map(resumenDeFila);
    },
    async guardarPlanActivo(planId) {
      const r = await supabase.rpc("ps_plan_activo_guardar", { p_plan: planId });
      if (r.error) throw errorDe(r.error);
    },
    async configPlan(planId) {
      const r = await supabase.rpc("ps_plan_config_leer", { p_plan: planId });
      if (r.error) throw errorDe(r.error);
      return configDeJson(r.data);
    },
    async editarPlan(planId, d) {
      const e1 = await supabase.rpc("ps_plan_editar", { p_plan: planId, p_cambios: { nombre: d.nombre.trim(), descripcion: d.descripcion.trim(), oficina_unit_id: d.oficinaId, anio_ini: d.anioIni, anio_fin: d.anioFin } });
      if (e1.error) throw errorDe(e1.error);
      const e2 = await supabase.rpc("ps_plan_config_guardar", { p_plan: planId, p_config: { columnas: columnasParaBase(d.config), listas: d.config.listas } });
      if (e2.error) throw errorDe(e2.error);
      const e3 = await supabase.rpc("ps_plan_pilares_guardar", { p_plan: planId, p_pilares: pilaresParaBase(d.config) });
      if (e3.error) throw errorDe(e3.error);
    },
    async archivarPlan(planId, motivo) {
      const r = await supabase.rpc("ps_plan_archivar", { p_plan: planId, p_motivo: motivo.trim() });
      if (r.error) throw errorDe(r.error);
    },
    async reabrirPlan(planId) {
      const r = await supabase.rpc("ps_plan_reabrir", { p_plan: planId });
      if (r.error) throw errorDe(r.error);
    },
    async tableroAdmin(f = {}) {
      const r = await supabase.rpc("ps_tablero_admin", { p_filtros: { ...(f.estado ? { estado: f.estado } : {}), ...(f.oficinaId ? { oficina_unit_id: f.oficinaId } : {}), ...(f.anio ? { anio: f.anio } : {}), ...(f.salud ? { salud: f.salud === "ambar" ? "amarillo" : f.salud } : {}) } });
      if (r.error) throw errorDe(r.error);
      return tableroDeJson(r.data);
    },
    async versiones(planId) {
      const [v, p, l] = await Promise.all([
        supabase.from("ps_versiones").select("id,etiqueta,estado,origen,nota,creada_en,publicada_en,numero").eq("plan_id", planId).order("numero", { ascending: false }),
        supabase.from("ps_planes").select("version_vigente_id").eq("id", planId).maybeSingle(),
        supabase.from("ps_version_lineas").select("version_id,monto"),
      ]);
      if (v.error) throw errorDe(v.error);
      if (p.error) throw errorDe(p.error);
      if (l.error) throw errorDe(l.error);
      const vigente = (p.data as Fila | null)?.version_vigente_id ?? null;
      const tot = new Map<string, { n: number; m: number }>();
      for (const r of (l.data ?? []) as Fila[]) {
        const t = tot.get(String(r.version_id)) ?? { n: 0, m: 0 };
        t.n += 1;
        t.m += Number(r.monto ?? 0);
        tot.set(String(r.version_id), t);
      }
      return ((v.data ?? []) as Fila[]).map((f) => ({
        id: String(f.id), etiqueta: String(f.etiqueta), estado: f.estado === "publicada" ? "publicada" : "borrador", vigente: f.id === vigente, origen: texto(f.origen),
        nLineas: tot.get(String(f.id))?.n ?? 0, inversion: tot.get(String(f.id))?.m ?? 0, creadaEn: String(f.creada_en), publicadaEn: texto(f.publicada_en), nota: texto(f.nota),
      }));
    },
    async lineas(versionId) {
      const [r, campus, ofs] = await Promise.all([supabase.from("ps_version_lineas").select("*").eq("version_id", versionId).order("orden"), nombresCampus(), unidades()]);
      if (r.error) throw errorDe(r.error);
      const nc = new Map(campus.map((c) => [c.id, c.name]));
      const no = new Map(ofs.map((o) => [o.id, o.nombre]));
      return ((r.data ?? []) as Fila[]).map((f) => lineaDeFila(f, nc, no));
    },
    async crearPlan(d) {
      const r = await supabase.rpc("ps_crear_plan", { p_nombre: d.nombre.trim(), p_anio_ini: d.anioIni, p_anio_fin: d.anioFin, p_oficina: d.oficinaId, p_alcance: d.alcance, p_descripcion: d.descripcion.trim(), p_config: { columnas: columnasParaBase(d.config), listas: d.config.listas } });
      if (r.error) throw errorDe(r.error);
      const id = String(r.data);
      if (d.config.pilares.length) {
        const p = await supabase.rpc("ps_plan_pilares_guardar", { p_plan: id, p_pilares: pilaresParaBase(d.config) });
        if (p.error) throw errorDe(p.error);
      }
      return id;
    },
    async cargarPlanificacion(c) {
      const ofs = await unidades();
      const ids = new Map(ofs.map((o) => [llano(o.nombre), o.id]));
      const r = await supabase.rpc("ps_cargar_matriz", { p_plan: c.planId, ...(c.oficinaId ? { p_oficina: c.oficinaId } : {}), p_lineas: c.lineas.map((l) => lineaParaCarga(l, ids)), p_nota: `Carga desde Excel: ${c.nombreArchivo}`.slice(0, 200) });
      if (r.error) throw errorDe(r.error);
      const d = (r.data ?? {}) as { version_id?: string | null; etiqueta?: string | null; recibidas?: number; aceptadas?: number; errores?: ErrorCarga[] };
      return { versionId: d.version_id ?? null, etiqueta: d.etiqueta ?? null, recibidas: d.recibidas ?? c.lineas.length, aceptadas: d.aceptadas ?? 0, errores: d.errores ?? [] };
    },
    async publicarVersion(versionId, nota) {
      const r = await supabase.rpc("ps_publicar_version", { p_version: versionId, p_nota: nota });
      if (r.error) throw errorDe(r.error);
      return { etiqueta: String((r.data as { etiqueta?: string } | null)?.etiqueta ?? "") };
    },
  };
}

export { aniosDe };
