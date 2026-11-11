/* =============================================================================
   Observatorio · hooks de observatorios, líneas, temas, dominios, insertados y
   métricas (migraciones 0230–0233). Lo escribe la base por funciones que
   comprueban panel, nivel y alcance; aquí solo se llaman.

   Si faltan las migraciones, las lecturas fallan con FaltaMigracion (una
   pantalla puede decirlo en vez de quedarse en blanco).
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../../lib/supabase";
import { describeDatabaseError } from "../../../../data/errors";
import type { DatabaseError } from "../../../../data/errors";
import type { EstadoInsertado, OpcionesInsertado, TipoInsertado } from "./opciones";

/* --- Tipos (filas tal como las guarda la base) ----------------------------------- */

export type EstadoObservatorio = "borrador" | "publicado" | "archivado";
export interface Observatorio {
  id: string; nombre: string; slug: string; descripcion: string; color: string; icono: string; responsable: string;
  estado: EstadoObservatorio; plantilla_origen: string | null; principal: boolean;
}
export interface Linea { id: string; observatorio_id: string; nombre: string; orden: number; numero: number | null; color: string | null }
export interface Tema {
  slug: string; observatorio_id: string; linea_id: string | null; codigo: string | null; nombre: string | null; resumen: string | null;
  pregunta: string | null; fuente: string | null; orden: number; archivado: boolean; status: "borrador" | "publicado";
  /** Color e icono propios del tema (0248); null: los de su línea. */
  color: string | null; icono: string | null;
  /** Foto y degradado del tablero público (0251); sin la migración no vienen. */
  imagen_url?: string | null; degradado?: number; alcance?: number; encuadre_x?: number; encuadre_y?: number;
}
export interface Responsable { observatorio_id: string; persona_id: string; propone_dominios: boolean }
export type EstadoDominio = "propuesto" | "aprobado" | "rechazado";
export interface Dominio { id: string; observatorio_id: string; host: string; estado: EstadoDominio; automatico: boolean; nota: string; propuesto_por: string | null; propuesto_en: string; decidido_por: string | null; decidido_en: string | null }
export interface Insertado {
  id: string; codigo: string; observatorio_id: string; nombre: string; tipo: TipoInsertado; tema_slug: string | null; seccion: string | null;
  visor_id: string | null; opciones: OpcionesInsertado; version: number; estado: EstadoInsertado; con_clave: boolean; vence_en: string | null;
  creado_por: string | null; revocado_por: string | null; revocado_en: string | null; created_at: string; updated_at: string;
}
export interface Metrica { insertado_id: string; observatorio_id: string; dominio: string; dia: string; vistas: number }

/** Las migraciones del Observatorio nuevo (0230–0233) no están aplicadas. */
export class FaltaMigracion extends Error {
  constructor(public migracion: string) {
    super(`Falta aplicar la migración ${migracion} del Observatorio.`);
  }
}

const FALTA = new Set(["PGRST205", "PGRST202", "PGRST204", "42P01", "42883", "42703"]);
function revisar<T>(migracion: string, r: { data: T | null; error: DatabaseError | null }): T {
  if (r.error) {
    if (FALTA.has(r.error.code ?? "")) throw new FaltaMigracion(migracion);
    throw describeDatabaseError(r.error);
  }
  return r.data as T;
}

export const obsKeys2 = {
  observatorios: ["obs-observatorios"] as const,
  lineas: (obs: string) => ["obs-lineas", obs] as const,
  temas: (obs: string) => ["obs-temas", obs] as const,
  responsables: (obs: string) => ["obs-responsables", obs] as const,
  dominios: (obs: string) => ["obs-dominios", obs] as const,
  insertados: (obs: string) => ["obs-insertados", obs] as const,
  metricas: (obs: string) => ["obs-metricas", obs] as const,
};

/* --- Lecturas de la intranet (RLS decide qué ve cada quien) ------------------------- */

export const useObservatorios = () =>
  useQuery({ queryKey: obsKeys2.observatorios, queryFn: async () => revisar<Observatorio[]>("0230", await supabase.from("obs_observatorios").select("*").order("principal", { ascending: false }).order("nombre")) });

export const useLineas = (obs: string) =>
  useQuery({ queryKey: obsKeys2.lineas(obs), enabled: !!obs, queryFn: async () => revisar<Linea[]>("0230", await supabase.from("obs_lineas").select("*").eq("observatorio_id", obs).order("orden")) });

export const useTemas = (obs: string) =>
  useQuery({
    queryKey: obsKeys2.temas(obs),
    enabled: !!obs,
    queryFn: async () => {
      const columnas = "slug,observatorio_id,linea_id,codigo,nombre,resumen,pregunta,fuente,orden,archivado,status,color,icono";
      const con = await supabase.from("obs_topics").select(`${columnas},imagen_url,degradado,alcance,encuadre_x,encuadre_y`).eq("observatorio_id", obs).order("orden");
      // Antes de la migración 0251 no existen las columnas de imagen: se leen sin ellas.
      const r = con.error?.code === "42703" ? await supabase.from("obs_topics").select(columnas).eq("observatorio_id", obs).order("orden") : con;
      return revisar<Tema[]>("0230", r as { data: Tema[] | null; error: DatabaseError | null });
    },
  });

export const useResponsables = (obs: string) =>
  useQuery({ queryKey: obsKeys2.responsables(obs), enabled: !!obs, queryFn: async () => revisar<Responsable[]>("0230", await supabase.from("obs_responsables").select("*").eq("observatorio_id", obs)) });

export const useDominios = (obs: string) =>
  useQuery({ queryKey: obsKeys2.dominios(obs), enabled: !!obs, queryFn: async () => revisar<Dominio[]>("0232", await supabase.from("obs_dominios").select("*").eq("observatorio_id", obs).order("host")) });

const COLUMNAS_INSERTADO = "id,codigo,observatorio_id,nombre,tipo,tema_slug,seccion,visor_id,opciones,version,estado,con_clave,vence_en,creado_por,revocado_por,revocado_en,created_at,updated_at";
export const useInsertados = (obs: string) =>
  useQuery({ queryKey: obsKeys2.insertados(obs), enabled: !!obs, queryFn: async () => revisar<Insertado[]>("0232", await supabase.from("obs_insertados").select(COLUMNAS_INSERTADO).eq("observatorio_id", obs).order("created_at", { ascending: false })) });

/** Vistas diarias de los últimos `dias` días (por defecto 30). */
export const useMetricas = (obs: string, dias = 30) =>
  useQuery({
    queryKey: [...obsKeys2.metricas(obs), dias],
    enabled: !!obs,
    queryFn: async () => {
      const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
      return revisar<Metrica[]>("0232", await supabase.from("obs_metricas").select("*").eq("observatorio_id", obs).gte("dia", desde));
    },
  });

/* --- Escrituras: funciones de la base ------------------------------------------------ */

function useRpc<A extends object, R>(fn: string, migracion: string, invalida: (r: R, a: A) => readonly unknown[][]) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (args: A) => revisar<R>(migracion, await supabase.rpc(fn, args as Record<string, unknown>)),
    onSuccess: (r, a) => {
      for (const key of invalida(r, a)) void client.invalidateQueries({ queryKey: key });
    },
  });
}

const obsDe = (x: unknown) => ((x as { observatorio_id?: string } | null)?.observatorio_id ?? "");

export interface GuardarInsertado {
  p_id: string | null; p_obs: string; p_nombre: string; p_tipo: TipoInsertado; p_tema: string | null; p_seccion: string | null; p_visor: string | null;
  p_opciones: OpcionesInsertado; p_clave?: string | null; p_quitar_clave?: boolean; p_vence?: string | null;
}
export const useGuardarInsertado = () => useRpc<GuardarInsertado, Insertado>("obs_insertado_guardar", "0233", (_r, a) => [[...obsKeys2.insertados(a.p_obs)]]);
export const useEstadoInsertado = () => useRpc<{ p_id: string; p_estado: EstadoInsertado }, Insertado>("obs_insertado_estado", "0233", (r) => [[...obsKeys2.insertados(obsDe(r))]]);
export const useDuplicarInsertado = () => useRpc<{ p_id: string }, Insertado>("obs_insertado_duplicar", "0233", (r) => [[...obsKeys2.insertados(obsDe(r))]]);
export const useProponerDominio = () => useRpc<{ p_obs: string; p_host: string; p_nota?: string }, Dominio>("obs_dominio_proponer", "0233", (_r, a) => [[...obsKeys2.dominios(a.p_obs)]]);
export const useDecidirDominio = () => useRpc<{ p_id: string; p_aprobar: boolean; p_nota?: string }, Dominio>("obs_dominio_decidir", "0233", (r) => [[...obsKeys2.dominios(obsDe(r))]]);
export const useRetirarDominio = () => useRpc<{ p_id: string }, null>("obs_dominio_retirar", "0233", () => [["obs-dominios"]]);
export const useCrearObservatorio = () =>
  useRpc<{ p_nombre: string; p_slug: string; p_descripcion?: string; p_color?: string; p_icono?: string; p_responsable?: string; p_plantilla?: string | null }, Observatorio>(
    "obs_observatorio_crear", "0233", () => [[...obsKeys2.observatorios]]);
/** Mueve un tema (con sus tablas, visores e insertados) a otra línea u otro observatorio. Migración 0234. */
export const useMoverTema = () => useRpc<{ p_slug: string; p_obs: string; p_linea: string | null }, Tema>("obs_tema_mover", "0234", () => [["obs-temas"], ["obs-lineas"], ["obs-insertados"], ["obs-conteos"]]);
/** Crea un tema en borrador con enlace único en todo el portal (se numera si choca). Migración 0248. */
export const useCrearTema = () =>
  useRpc<{ p_obs: string; p_nombre: string; p_slug?: string | null; p_linea?: string | null; p_codigo?: string | null; p_resumen?: string | null; p_pregunta?: string | null; p_fuente?: string | null; p_color?: string | null; p_icono?: string | null }, Tema>(
    "obs_tema_crear", "0248", () => [["obs-temas"], ["obs-lineas"], ["obs-conteos"], ["obs-admin"]]);
export const useArchivarObservatorio = () => useRpc<{ p_id: string; p_archivar?: boolean }, Observatorio>("obs_observatorio_archivar", "0233", () => [[...obsKeys2.observatorios]]);

/** Cambios directos permitidos por RLS al panel Observatorios (nivel editar): identidad, líneas, temas y personas responsables. */
export function useEditarObservatorios() {
  const client = useQueryClient();
  // `exigirFila`: un update que la base filtra por permisos no da error, solo cero filas. Sin esta
  // comprobación la pantalla diría «guardado» y el tema seguiría en borrador.
  const run = async (migracion: string, p: PromiseLike<{ data: unknown; error: DatabaseError | null }>, exigirFila = false) => {
    const data = revisar(migracion, await p);
    if (exigirFila && Array.isArray(data) && data.length === 0) {
      throw new Error("No se guardó: tu rol no puede editar esto. Hace falta el nivel Editar con capacidad de Planeación en este observatorio (o ser su responsable).");
    }
    void client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("obs-") });
  };
  return {
    identidad: (id: string, c: Partial<Pick<Observatorio, "nombre" | "descripcion" | "color" | "icono" | "responsable" | "estado">>) => run("0231", supabase.from("obs_observatorios").update(c).eq("id", id).select("id"), true),
    linea: (l: Partial<Linea> & { observatorio_id: string }) => run("0230", supabase.from("obs_lineas").upsert(l)),
    quitarLinea: (id: string) => run("0230", supabase.from("obs_lineas").delete().eq("id", id)),
    tema: (slug: string, c: Partial<Pick<Tema, "linea_id" | "codigo" | "nombre" | "resumen" | "pregunta" | "fuente" | "orden" | "archivado" | "status" | "color" | "icono">>) => run("0230", supabase.from("obs_topics").update(c).eq("slug", slug).select("slug"), true),
    /** Apariencia del tablero público: color, icono, foto y degradado. Migración 0251. */
    apariencia: (slug: string, c: Partial<Pick<Tema, "color" | "icono" | "imagen_url" | "degradado" | "alcance" | "encuadre_x" | "encuadre_y">>) => run("0251", supabase.from("obs_topics").update(c).eq("slug", slug).select("slug"), true),
    /** Tema nuevo (nace en borrador). El enlace es único en todo el portal: si choca, el llamador elige otro. */
    crearTema: (t: Pick<Tema, "slug" | "observatorio_id"> & Partial<Pick<Tema, "linea_id" | "codigo" | "nombre" | "resumen" | "pregunta" | "fuente" | "orden">>) => run("0230", supabase.from("obs_topics").insert({ ...t, status: "borrador" })),
    asignar: (r: Responsable) => run("0230", supabase.from("obs_responsables").upsert(r)),
    desasignar: (obs: string, persona: string) => run("0230", supabase.from("obs_responsables").delete().eq("observatorio_id", obs).eq("persona_id", persona)),
  };
}

/* --- Lectura pública (portal multi-observatorio, O2) ------------------------------- */

export const obsPublicosKey = ["observatorios-publicos"] as const;

/** Observatorios publicados con sus líneas. Sin filas o sin migración: [] (el portal sigue con la constante). */
export function useObservatoriosPublicos() {
  return useQuery({
    queryKey: obsPublicosKey,
    staleTime: 60_000,
    queryFn: async () => {
      const [o, l] = await Promise.all([
        supabase.from("obs_observatorios").select("*").eq("estado", "publicado").order("principal", { ascending: false }).order("nombre"),
        supabase.from("obs_lineas").select("*").order("orden"),
      ]);
      if (o.error || l.error) return { observatorios: [] as Observatorio[], lineas: [] as Linea[] };
      return { observatorios: o.data as Observatorio[], lineas: l.data as Linea[] };
    },
  });
}
