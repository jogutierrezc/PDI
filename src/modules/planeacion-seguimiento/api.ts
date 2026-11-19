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

export interface PsApi {
  nivel(): Promise<PsNivel>;
  /** Nombres de los campus del portal (sin «Todos»). */
  campus(): Promise<string[]>;
  oficinas(): Promise<Oficina[]>;
  /** El plan que se muestra (hoy uno solo). Nulo si aún no hay ninguno. */
  plan(): Promise<PlanVista | null>;
  versiones(planId: string): Promise<VersionResumen[]>;
  lineas(versionId: string): Promise<Linea[]>;
  crearPlan(d: { nombre: string; anioIni: number; anioFin: number }): Promise<string>;
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

export const psKeys = {
  todo: ["ps"] as const,
  nivel: ["ps", "nivel"] as const,
  plan: ["ps", "plan"] as const,
  campus: ["ps", "campus"] as const,
  oficinas: ["ps", "oficinas"] as const,
  versiones: (plan: string | null) => ["ps", "versiones", plan] as const,
  lineas: (version: string | null) => ["ps", "lineas", version] as const,
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
  return useMutation({ mutationFn: (d: { nombre: string; anioIni: number; anioFin: number }) => api.crearPlan(d), onSuccess: () => qc.invalidateQueries({ queryKey: psKeys.todo }) });
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

export function crearApiMemoria(op: OpcionesMemoria = {}): PsApi {
  const espera = () => new Promise<void>((r) => setTimeout(r, op.latencia ?? 0));
  const campus = op.campus ?? [...CAMPUS];
  const oficinas = (op.oficinas ?? OFICINAS_DEMO).map((nombre, i) => ({ id: `of-${i + 1}`, nombre }));
  let plan: { id: string; nombre: string; anioIni: number; anioFin: number } | null = null;
  let versiones: VersionMem[] = [];
  let listo: Promise<void> | null = null;

  const sembrar = async () => {
    if (!op.estado || op.estado === "ninguno") return;
    plan = { id: "plan-1", nombre: "PDIFyT 2027-2035", anioIni: 2027, anioFin: 2035 };
    const lineas = await cargarFixtures();
    const lista = lineas.map((l) => ({ ...l, campus: l.campus }));
    versiones = [{ meta: mkMeta("ver-1", "v1.0", lista, op.estado === "publicado"), lineas: lista }];
  };
  const mkMeta = (id: string, etiqueta: string, lineas: Linea[], publicada: boolean): VersionResumen => ({
    id, etiqueta, estado: publicada ? "publicada" : "borrador", vigente: publicada, origen: "carga_matriz", nLineas: lineas.length,
    inversion: lineas.reduce((s, l) => s + (l.monto ?? 0), 0), creadaEn: "2026-11-19T10:00:00Z", publicadaEn: publicada ? "2026-11-19T11:00:00Z" : null, nota: null,
  });
  const iniciar = () => (listo ??= sembrar());

  const vista = (): PlanVista | null => {
    if (!plan) return null;
    const v = versiones.find((x) => x.meta.vigente) ?? versiones.find((x) => x.meta.estado === "borrador") ?? null;
    return { ...plan, version: v ? { ...v.meta } : null };
  };

  return {
    async nivel() { await espera(); return op.nivel ?? "admin"; },
    async campus() { await espera(); return campus; },
    async oficinas() { await espera(); return oficinas; },
    async plan() { await iniciar(); await espera(); return vista(); },
    async versiones(planId) {
      await iniciar(); await espera();
      return plan?.id === planId ? versiones.map((v) => ({ ...v.meta })).reverse() : [];
    },
    async lineas(versionId) {
      await iniciar(); await espera();
      const v = versiones.find((x) => x.meta.id === versionId);
      if (!v) throw new Error("Esa versión no existe.");
      return structuredClone(v.lineas);
    },
    async crearPlan(d) {
      await iniciar(); await espera();
      if (plan && llano(plan.nombre) === llano(d.nombre)) throw new Error("Ya existe un plan con ese nombre.");
      plan = { id: `plan-${Date.now()}`, nombre: d.nombre.trim(), anioIni: d.anioIni, anioFin: d.anioFin };
      versiones = [];
      return plan.id;
    },
    async cargarPlanificacion(c) {
      await iniciar(); await espera();
      if (!plan || plan.id !== c.planId) throw new Error("Ese plan no existe.");
      if (versiones.some((v) => v.meta.vigente)) {
        return { versionId: null, etiqueta: null, recibidas: c.lineas.length, aceptadas: 0, errores: [{ fila: null, campo: "plan", mensaje: "La carga sobre un plan vigente se hace por solicitud de cambio (fase 4)." }] };
      }
      const errores: ErrorCarga[] = [];
      const claves = new Set<string>();
      c.lineas.forEach((l, i) => {
        if (l.campus !== CAMPUS_TODOS && !campus.some((x) => llano(x) === llano(l.campus))) errores.push({ fila: i + 1, campo: "campus", mensaje: `El campus «${l.campus}» no existe en la lista de campus del portal.` });
        if (!PRIORIDADES.some((p) => p === l.prioridad)) errores.push({ fila: i + 1, campo: "prioridad", mensaje: `La prioridad «${l.prioridad}» no es válida.` });
        if (claves.has(l.no)) errores.push({ fila: i + 1, campo: "clave", mensaje: `La clave «${l.no}» está repetida.` });
        claves.add(l.no);
      });
      if (errores.length) return { versionId: null, etiqueta: null, recibidas: c.lineas.length, aceptadas: 0, errores };
      versiones = [{ meta: mkMeta("ver-1", "v1.0", c.lineas, false), lineas: structuredClone(c.lineas) }];
      return { versionId: "ver-1", etiqueta: "v1.0", recibidas: c.lineas.length, aceptadas: c.lineas.length, errores: [] };
    },
    async publicarVersion(versionId) {
      await iniciar(); await espera();
      const v = versiones.find((x) => x.meta.id === versionId);
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

export function crearApiSupabase(): PsApi {
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
    async nivel() {
      const r = await supabase.rpc("ps_nivel_actual");
      if (r.error) throw errorDe(r.error);
      return ((r.data as PsNivel | null) ?? "none") as PsNivel;
    },
    async campus() {
      return (await nombresCampus()).map((c) => c.name);
    },
    oficinas: unidades,
    async plan() {
      const p = await supabase.from("ps_planes").select("*").order("creado_en", { ascending: false }).limit(1);
      if (p.error) throw errorDe(p.error);
      const fila = (p.data as Fila[] | null)?.[0];
      if (!fila) return null;
      const lista = await this.versiones(String(fila.id));
      const v = lista.find((x) => x.vigente) ?? lista.find((x) => x.estado === "borrador") ?? null;
      return { id: String(fila.id), nombre: String(fila.nombre), anioIni: Number(fila.anio_ini), anioFin: Number(fila.anio_fin), version: v };
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
      const r = await supabase.rpc("ps_crear_plan", { p_nombre: d.nombre, p_anio_ini: d.anioIni, p_anio_fin: d.anioFin });
      if (r.error) throw errorDe(r.error);
      return String(r.data);
    },
    async cargarPlanificacion(c) {
      const ofs = await unidades();
      const ids = new Map(ofs.map((o) => [llano(o.nombre), o.id]));
      const r = await supabase.rpc("ps_cargar_matriz", { p_plan: c.planId, p_lineas: c.lineas.map((l) => lineaParaCarga(l, ids)), p_nota: `Carga desde Excel: ${c.nombreArchivo}`.slice(0, 200) });
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
