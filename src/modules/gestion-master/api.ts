/* =============================================================================
   Gestión Master · lectura y escritura contra Supabase (migración 0194).

   Todo pasa por funciones de la base (gm_*): ninguna tabla se escribe directo,
   y las de lectura del Warehouse entregan solo lo que el módulo necesita, sin
   pedir que la persona sea de Planeación. El permiso lo decide la base
   (gm_puede), no esta pantalla.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readFunctionError, supabase } from "../../lib/supabase";
import type {
  ActividadPeriodo, Corte, Decision, Detalle, Ficha, FilaLista, Flujo, FlujoPaso, Funcion, Prioridad, ProfesorPeriodo, TiempoPaso, Tipo,
} from "./modelo";
import { mensajeDe } from "./modelo";

export const gmKeys = {
  todo: ["gm"] as const,
  nivel: ["gm", "nivel"] as const,
  lista: (p: string, s: string) => ["gm", "lista", p, s] as const,
  detalle: (id: string | null) => ["gm", "detalle", id] as const,
  ficha: (p: string, s: string, c: string) => ["gm", "ficha", p, s, c] as const,
  buscar: (p: string, s: string, t: string) => ["gm", "buscar", p, s, t] as const,
  actividades: (p: string, s: string) => ["gm", "actividades", p, s] as const,
  profesores: (p: string, s: string) => ["gm", "profesores", p, s] as const,
  cortes: (p: string) => ["gm", "cortes", p] as const,
  flujos: ["gm", "flujos"] as const,
  funciones: ["gm", "funciones"] as const,
  tiempos: (p: string, s: string) => ["gm", "tiempos", p, s] as const,
  rua: ["gm", "rua"] as const,
  unidades: ["gm", "unidades"] as const,
  consultas: ["gm", "consultas"] as const,
};

async function rpc<T>(nombre: string, args?: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw new Error(mensajeDe(r.error));
  return r.data as T;
}

/* --- Quién soy en el módulo --------------------------------------------------------------------- */

export type NivelGm = "none" | "solicitante" | "revisor" | "gestor";

export interface MiNivel {
  nivel: NivelGm;
  funcion: string | null;
}

export function useMiNivel() {
  return useQuery({
    queryKey: gmKeys.nivel,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<MiNivel> => {
      const [nivel, funcion] = await Promise.all([rpc<NivelGm>("gm_nivel_actual"), rpc<string | null>("gm_funcion_actual")]);
      return { nivel: nivel ?? "none", funcion: funcion ?? null };
    },
  });
}

/* --- Lecturas ----------------------------------------------------------------------------------- */

export const useLista = (periodo: string, sede: string, activo = true) =>
  useQuery({
    queryKey: gmKeys.lista(periodo, sede),
    enabled: activo,
    queryFn: () => rpc<FilaLista[]>("gm_listar", { p_periodo: periodo, p_sede: sede === "todas" ? "" : sede }),
  });

export const useDetalle = (id: string | null) =>
  useQuery({
    queryKey: gmKeys.detalle(id),
    enabled: Boolean(id),
    queryFn: () => rpc<Detalle>("gm_detalle", { p_id: id }),
  });

export const useFicha = (periodo: string, sede: string, codigo: string) =>
  useQuery({
    queryKey: gmKeys.ficha(periodo, sede, codigo),
    enabled: Boolean(codigo) && sede !== "todas",
    staleTime: 60_000,
    queryFn: () => rpc<Ficha>("gm_ficha_codigo", { p_periodo: periodo, p_sede: sede, p_codigo: codigo }),
  });

/** La ficha de un código, sin pasar por la caché de la pantalla (para rellenar el formulario al elegirlo). */
export const fichaDe = (periodo: string, sede: string, codigo: string) => rpc<Ficha>("gm_ficha_codigo", { p_periodo: periodo, p_sede: sede, p_codigo: codigo });

export const useBuscarCodigos = (periodo: string, sede: string, texto: string, activo: boolean) =>
  useQuery({
    queryKey: gmKeys.buscar(periodo, sede, texto),
    enabled: activo && sede !== "todas",
    staleTime: 30_000,
    queryFn: () => rpc<{ codigo: string; nombre: string | null; tipo_actividad: string; activa: boolean | null; vinculacion: string | null }[]>("gm_buscar_codigos", { p_periodo: periodo, p_sede: sede, p_texto: texto }),
  });

export const useActividades = (periodo: string, sede: string, activo = true) =>
  useQuery({
    queryKey: gmKeys.actividades(periodo, sede),
    enabled: activo && sede !== "todas",
    queryFn: () => rpc<ActividadPeriodo[]>("gm_actividades_periodo", { p_periodo: periodo, p_sede: sede }),
  });

export const useProfesores = (periodo: string, sede: string, activo = true) =>
  useQuery({
    queryKey: gmKeys.profesores(periodo, sede),
    enabled: activo && sede !== "todas",
    queryFn: () => rpc<ProfesorPeriodo[]>("gm_profesores_periodo", { p_periodo: periodo, p_sede: sede }),
  });

export const useCortes = (periodo: string) =>
  useQuery({ queryKey: gmKeys.cortes(periodo), queryFn: () => rpc<Corte[]>("gm_cortes", { p_periodo: periodo }) });

export const useUnidades = () =>
  useQuery({ queryKey: gmKeys.unidades, staleTime: 5 * 60_000, queryFn: () => rpc<{ id: string; nombre: string; tipo: string }[]>("gm_mis_unidades") });

export const useTiempos = (periodo: string, sede: string, activo: boolean) =>
  useQuery({
    queryKey: gmKeys.tiempos(periodo, sede),
    enabled: activo,
    retry: false,
    queryFn: () => rpc<TiempoPaso[]>("gm_tiempos_por_paso", { p_periodo: periodo, p_sede: sede === "todas" ? "" : sede }),
  });

export const useFunciones = () =>
  useQuery({
    queryKey: gmKeys.funciones,
    queryFn: async (): Promise<Funcion[]> => {
      const r = await supabase.from("gm_funciones").select("codigo, nombre, activa, orden").order("orden");
      if (r.error) throw new Error(mensajeDe(r.error));
      return (r.data ?? []) as Funcion[];
    },
  });

export const useFlujos = () =>
  useQuery({
    queryKey: gmKeys.flujos,
    queryFn: async (): Promise<Flujo[]> => {
      const r = await supabase
        .from("gm_flujos")
        .select("id, nombre, descripcion, plazo_dias, por_defecto, activo, pasos:gm_flujo_pasos(id, orden, nombre, funcion, suplente_funcion, plazo_dias)")
        .order("por_defecto", { ascending: false })
        .order("nombre");
      if (r.error) throw new Error(mensajeDe(r.error));
      return ((r.data ?? []) as unknown as Flujo[]).map((f) => ({ ...f, pasos: [...(f.pasos ?? [])].sort((a, b) => a.orden - b.orden) }));
    },
  });

export interface FilaRua {
  id: string;
  folio: string;
  tipo: string;
  estado: string;
  prioridad: string;
  solicitante: string;
  unidad: string;
  concepto: string;
  creada_en: string | null;
  resuelta_en: string | null;
  lineas: { codigo?: string | null; nomenclatura?: string | null; actual_codigo?: string | null; actual_nomenclatura?: string | null; tipo?: string | null }[];
  etapas: { etapa?: string | null; estado?: string | null; revisor?: string | null; justificacion?: string | null; decidida_en?: string | null }[];
}

export const useRua = () =>
  useQuery({
    queryKey: gmKeys.rua,
    retry: false,
    queryFn: async (): Promise<FilaRua[]> => {
      const r = await supabase.from("gm_rua_solicitudes").select("*").order("creada_en", { ascending: false }).limit(2000);
      if (r.error) throw new Error(mensajeDe(r.error));
      return (r.data ?? []) as FilaRua[];
    },
  });

export interface ConsultaNombres {
  usuario: string;
  periodo: string;
  sede: string;
  codigo: string;
  cantidad: number;
  creada_en: string;
}

export const useConsultasNombres = (activo: boolean) =>
  useQuery({
    queryKey: gmKeys.consultas,
    enabled: activo,
    retry: false,
    queryFn: () => rpc<ConsultaNombres[]>("gm_consultas_nombres_listar"),
  });

/* --- Avisos por correo -------------------------------------------------------------------------- */

/** Le pide a la función gestion-master que envíe los avisos en cola. No bloquea ni falla en pantalla: si no sale, queda en la cola. */
export function dispararAvisos() {
  void supabase.functions.invoke("gestion-master", { body: { action: "avisos" } }).then(
    () => undefined,
    () => undefined,
  );
}

/* --- Escrituras --------------------------------------------------------------------------------- */

export interface LineaEntrada {
  codigo: string;
  codigo_nuevo?: string;
  motivo?: string;
  origen_codigo?: string;
  origen_periodo?: string;
  origen_sede?: string;
  nombre: string;
  tipo_actividad: "directa" | "apoyo" | "";
  instrucciones: string;
  vinculacion: string;
  activa: boolean;
}

export interface SolicitudEntrada {
  id: string | null;
  tipo: Tipo;
  prioridad: Prioridad;
  unidad: string | null;
  periodo: string;
  sede: string;
  justificacion: string;
  lineas: LineaEntrada[];
  enviar: boolean;
}

function useAccion<A, R>(fn: (a: A) => Promise<R>, avisar = true) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gmKeys.todo });
      if (avisar) dispararAvisos();
    },
  });
}

export const useGuardarSolicitud = () =>
  useAccion(async (e: SolicitudEntrada) => {
    const filas = await rpc<{ id: string; folio: string; estado: string }[]>("gm_guardar_solicitud", {
      p_id: e.id,
      p_tipo: e.tipo,
      p_prioridad: e.prioridad,
      p_unidad: e.unidad,
      p_periodo: e.periodo,
      p_sede: e.sede,
      p_justificacion: e.justificacion,
      p_lineas: e.lineas.map((l) => ({
        codigo: l.codigo.trim().toUpperCase() || null,
        codigo_nuevo: l.codigo_nuevo?.trim().toUpperCase() || null,
        motivo: l.motivo?.trim() || null,
        origen_codigo: l.origen_codigo || null,
        origen_periodo: l.origen_periodo || null,
        origen_sede: l.origen_sede || null,
        nombre: l.nombre.trim() || null,
        tipo_actividad: l.tipo_actividad || null,
        instrucciones: l.instrucciones.trim() || null,
        vinculacion: l.vinculacion.trim() || null,
        activa: l.activa,
      })),
      p_enviar: e.enviar,
    });
    return filas[0];
  });

export const useDecidir = () =>
  useAccion((a: { id: string; decision: Decision; nota: string }) => rpc<{ id: string; estado: string; paso_siguiente: string | null }[]>("gm_decidir", { p_id: a.id, p_decision: a.decision, p_nota: a.nota }));

export const useDecidirLote = () =>
  useAccion((a: { ids: string[]; decision: "aprobar" | "devolver"; nota: string }) =>
    rpc<{ id: string; ok: boolean; mensaje: string }[]>("gm_decidir_lote", { p_ids: a.ids, p_decision: a.decision, p_nota: a.nota }),
  );

export const useCancelar = () => useAccion((id: string) => rpc<void>("gm_cancelar", { p_id: id }), false);
export const useComentar = () => useAccion((a: { id: string; texto: string }) => rpc<void>("gm_comentar", { p_id: a.id, p_texto: a.texto }), false);
export const useMarcarAplicada = () => useAccion((a: { id: string; nota: string }) => rpc<void>("gm_marcar_aplicada", { p_id: a.id, p_nota: a.nota }), false);
export const useConciliar = () => useAccion((a: { periodo: string; sede: string }) => rpc<{ id: string; folio: string }[]>("gm_conciliar", { p_periodo: a.periodo, p_sede: a.sede }));
export const useGuardarFuncion = () => useAccion((a: { codigo: string; nombre: string; activa: boolean }) => rpc<void>("gm_guardar_funcion", { p_codigo: a.codigo, p_nombre: a.nombre, p_activa: a.activa }), false);
export const useGuardarFlujo = () =>
  useAccion(
    (a: { id: string | null; nombre: string; descripcion: string; plazo: number; pasos: FlujoPaso[]; porDefecto: boolean }) =>
      rpc<string>("gm_guardar_flujo", {
        p_id: a.id,
        p_nombre: a.nombre,
        p_descripcion: a.descripcion,
        p_plazo_dias: a.plazo,
        p_pasos: a.pasos.map((p) => ({ nombre: p.nombre, funcion: p.funcion, suplente_funcion: p.suplente_funcion || null, plazo_dias: p.plazo_dias })),
        p_por_defecto: a.porDefecto,
      }),
    false,
  );
export const useImportarRua = () => useAccion((filas: unknown[]) => rpc<number>("gm_importar_rua", { p_filas: filas }), false);

/* --- Los nombres de los docentes: en vivo, sin guardarlos (decisión 11) ------------------------- */

export async function nombresDeDocentes(p: { sede: string; periodo: string; codigo: string; seudonimos: string[] }): Promise<{ nombres: Record<string, string>; total: number; encontrados: number }> {
  const r = await supabase.functions.invoke("warehouse", { body: { action: "docentes", ...p } });
  if (r.error) {
    const detalle = await readFunctionError(r.error);
    throw new Error(detalle ?? "No se pudo leer a los docentes del Master. ¿Está desplegada la función «warehouse» con la acción «docentes»?");
  }
  const data = r.data as { ok?: boolean; error?: string; nombres?: Record<string, string>; total?: number; encontrados?: number };
  if (data?.ok === false || !data?.nombres) throw new Error(data?.error ?? "El Master no devolvió los nombres.");
  return { nombres: data.nombres, total: data.total ?? 0, encontrados: data.encontrados ?? 0 };
}

/* --- Cerrar el corte: los eventos del periodo y sede, al Warehouse ------------------------------ */

async function sha256Hex(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ResultadoCorte {
  filas: number;
  version: number;
  duplicada: boolean;
}

/**
 * Carga el conjunto «gm_solicitudes» por el camino que ya usa el Warehouse: abrir, agregar y cerrar. Lo puede hacer
 * quien tenga acceso al Warehouse (Planeación): las funciones wh_* lo exigen y esta pantalla no lo salta.
 */
export async function cerrarCorte(periodo: string, sede: string, motivo: string): Promise<ResultadoCorte> {
  const filas = await rpc<Record<string, string>[]>("gm_corte_filas", { p_periodo: periodo, p_sede: sede });
  if (!filas.length) throw new Error("No hay solicitudes ni decisiones en este periodo y sede: no hay nada que cargar.");
  const huella = await sha256Hex(JSON.stringify(filas));
  const abierta = await rpc<{ id: string; version: number; duplicada: boolean }[]>("wh_abrir_carga", {
    p_conjunto: "gm_solicitudes",
    p_periodo: periodo,
    p_sede: sede,
    p_corte: "",
    p_huella: huella,
    p_origen: "servidor",
    p_archivo: "Gestión Master",
    p_motivo: motivo,
  });
  const carga = abierta[0];
  if (!carga) throw new Error("El Warehouse no abrió la carga.");
  if (carga.duplicada) return { filas: filas.length, version: carga.version, duplicada: true };
  const LOTE = 1000;
  try {
    for (let i = 0; i < filas.length; i += LOTE) {
      await rpc<number>("wh_agregar_filas", { p_carga: carga.id, p_inicio: i + 1, p_filas: filas.slice(i, i + LOTE) });
    }
  } catch (e) {
    await supabase.rpc("wh_cerrar_carga", { p_carga: carga.id, p_ok: false, p_error: mensajeDe(e).slice(0, 300), p_columnas: null });
    throw e;
  }
  const columnas = ["folio", "tipo", "evento", "estado", "paso", "codigo", "actividad", "unidad", "solicitante", "fecha"];
  await rpc<number>("wh_cerrar_carga", { p_carga: carga.id, p_ok: true, p_error: "", p_columnas: columnas });
  return { filas: filas.length, version: carga.version, duplicada: false };
}
