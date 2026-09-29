/* =============================================================================
   Reportes Institucionales · lectura y escritura en Supabase (0103).

   ri_entregas         una plantilla en un periodo y su estado
   ri_filas            las filas capturadas, con nombres (datos personales:
                       solo las lee quien ve la pantalla «reportes»)
   ri_catalogo_items   programas, municipios y países (nombre ↔ código)
   ri_sedes            el municipio (DIVIPOLA) de cada sede (0104)
   ri_cruces()         documentos de la Población estudiantil, por periodo (0104)
                       para las reglas que cruzan plantillas

   Toda escritura va por RPC: la base hace cumplir permisos y el orden de los
   estados (pendiente → cargada → errores | validada → enviada) y responde en
   español lo que no deja hacer.
   ========================================================================== */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { describeDatabaseError } from "../../data/errors";
import type { DatabaseError } from "../../data/errors";
import { motor } from "./motor";
import type {
  CatalogoId,
  Cruces,
  Entrega,
  Estado,
  Fila,
  ItemCatalogo,
  PeriodoCodigo,
  PlantillaId,
  ReporteId,
} from "./tipos";

/** Claves de caché: las mutaciones invalidan por aquí, sin adivinar cadenas. */
export const reportesKeys = {
  all: ["reportes"] as const,
  entregasTodas: ["reportes", "entregas"] as const,
  entregas: (periodo: PeriodoCodigo) => ["reportes", "entregas", periodo] as const,
  filasTodas: ["reportes", "filas"] as const,
  filas: (plantilla: PlantillaId, periodo: PeriodoCodigo) => ["reportes", "filas", plantilla, periodo] as const,
  catalogos: ["reportes", "catalogos"] as const,
  sedes: ["reportes", "sedes"] as const,
  crucesTodos: ["reportes", "cruces"] as const,
  cruces: (periodo: PeriodoCodigo) => ["reportes", "cruces", periodo] as const,
};

const BUCKET = "reportes-certificados";
/** PostgREST corta cada respuesta en 1000 filas: las listas largas se piden por páginas. */
const PAGINA = 1000;
const ENTREGA_COLS = "id,reporte,plantilla,periodo,estado,filas,errores,validada_en,enviada_en,certificado_path,updated_at";
const CATALOGOS: CatalogoId[] = ["programa", "municipio", "pais"];

const fallo = (error: unknown) => describeDatabaseError(error as DatabaseError);

/* --- Conversión ------------------------------------------------------------- */

function aEntrega(raw: Record<string, unknown>): Entrega {
  return {
    id: String(raw.id),
    reporte: (raw.reporte as ReporteId) ?? "snies",
    plantilla: raw.plantilla as PlantillaId,
    periodo: String(raw.periodo),
    estado: raw.estado as Estado,
    filas: Number(raw.filas ?? 0),
    errores: Number(raw.errores ?? 0),
    validada_en: (raw.validada_en as string | null) ?? null,
    enviada_en: (raw.enviada_en as string | null) ?? null,
    certificado_path: (raw.certificado_path as string | null) ?? null,
    updated_at: String(raw.updated_at ?? ""),
  };
}

/** Una fila guardada vuelve como texto en cada campo. */
function aFila(datos: unknown): Fila {
  const fila: Fila = {};
  if (!datos || typeof datos !== "object") return fila;
  for (const [campo, valor] of Object.entries(datos as Record<string, unknown>)) {
    fila[campo] = valor === null || valor === undefined ? "" : typeof valor === "string" ? valor : String(valor);
  }
  return fila;
}

function aItem(raw: Record<string, unknown>): ItemCatalogo {
  return {
    catalogo: raw.catalogo as CatalogoId,
    codigo: String(raw.codigo),
    nombre: String(raw.nombre),
    departamento: (raw.departamento as string | null) ?? null,
    oferta: Array.isArray(raw.oferta) ? (raw.oferta as string[]) : [],
    activo: raw.activo !== false,
  };
}

/** Lo que va a la RPC: el ítem tal cual, con la oferta solo en programas. */
function itemJson(item: ItemCatalogo) {
  return {
    catalogo: item.catalogo,
    codigo: item.codigo.trim(),
    nombre: item.nombre.trim(),
    departamento: item.departamento?.trim() || null,
    ...(item.oferta ? { oferta: item.oferta } : {}),
    activo: item.activo,
  };
}

/** Documento sin puntos, comas, apóstrofes ni espacios. */
const normalizarDocumento = (v: string) => v.replace(/[.,'’`´\s]/g, "");

/** Sin tildes ni mayúsculas, para comparar nombres. */
const plano = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Lee todas las páginas de una consulta. */
async function todas<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1);
    if (error) throw fallo(error);
    const filas = data ?? [];
    salida.push(...filas);
    if (filas.length < PAGINA) return salida;
  }
}

/* --- Entregas y filas -------------------------------------------------------- */

export function useEntregas(periodo: PeriodoCodigo): UseQueryResult<Entrega[]> {
  return useQuery({
    queryKey: reportesKeys.entregas(periodo),
    enabled: Boolean(periodo),
    queryFn: async (): Promise<Entrega[]> => {
      const { data, error } = await supabase
        .from("ri_entregas")
        .select(ENTREGA_COLS)
        .eq("periodo", periodo)
        .order("plantilla");
      if (error) throw fallo(error);
      return (data ?? []).map((r) => aEntrega(r as Record<string, unknown>));
    },
  });
}

async function leerEntrega(plantilla: PlantillaId, periodo: PeriodoCodigo): Promise<Entrega | null> {
  const { data, error } = await supabase
    .from("ri_entregas")
    .select(ENTREGA_COLS)
    .eq("reporte", "snies")
    .eq("plantilla", plantilla)
    .eq("periodo", periodo)
    .maybeSingle();
  if (error) throw fallo(error);
  return data ? aEntrega(data as Record<string, unknown>) : null;
}

export function useFilas(
  plantilla: PlantillaId,
  periodo: PeriodoCodigo,
): UseQueryResult<{ entrega: Entrega | null; filas: Fila[] }> {
  return useQuery({
    queryKey: reportesKeys.filas(plantilla, periodo),
    enabled: Boolean(plantilla && periodo),
    queryFn: async () => {
      const entrega = await leerEntrega(plantilla, periodo);
      if (!entrega) return { entrega: null, filas: [] as Fila[] };
      const filas = await todas<{ datos: unknown }>((desde, hasta) =>
        supabase.from("ri_filas").select("datos").eq("entrega_id", entrega.id).order("orden").range(desde, hasta),
      );
      return { entrega, filas: filas.map((r) => aFila(r.datos)) };
    },
  });
}

/** Tras cambiar una entrega: el tablero del periodo y la entrega en la caché de sus filas. */
function useAlCambiarEntrega() {
  const client = useQueryClient();
  return async (entrega: Entrega, filas?: Fila[]) => {
    const key = reportesKeys.filas(entrega.plantilla, entrega.periodo);
    const previo = client.getQueryData<{ entrega: Entrega | null; filas: Fila[] }>(key);
    if (filas) {
      client.setQueryData(key, { entrega, filas });
    } else if (previo) {
      client.setQueryData(key, { ...previo, entrega });
    } else {
      await client.invalidateQueries({ queryKey: key });
    }
    await client.invalidateQueries({ queryKey: reportesKeys.entregasTodas });
    return client;
  };
}

export function useGuardarFilas(): UseMutationResult<
  Entrega,
  Error,
  { plantilla: PlantillaId; periodo: PeriodoCodigo; filas: Fila[] }
> {
  const alCambiar = useAlCambiarEntrega();
  return useMutation({
    mutationFn: async ({ plantilla, periodo, filas }) => {
      const { data, error } = await supabase.rpc("ri_guardar_filas", {
        p_plantilla: plantilla,
        p_periodo: periodo,
        p_filas: filas,
      });
      if (error) throw fallo(error);
      return aEntrega(data as Record<string, unknown>);
    },
    onSuccess: async (entrega, { filas }) => {
      const client = await alCambiar(entrega, filas);
      // Participante, Matriculados y Graduados alimentan los cruces.
      await client.invalidateQueries({ queryKey: reportesKeys.crucesTodos });
    },
  });
}

export function useMarcarValidacion(): UseMutationResult<
  Entrega,
  Error,
  { plantilla: PlantillaId; periodo: PeriodoCodigo; errores: number }
> {
  const alCambiar = useAlCambiarEntrega();
  return useMutation({
    mutationFn: async ({ plantilla, periodo, errores }) => {
      const { data, error } = await supabase.rpc("ri_marcar_validacion", {
        p_plantilla: plantilla,
        p_periodo: periodo,
        p_errores: Math.max(0, Math.trunc(errores)),
      });
      if (error) throw fallo(error);
      return aEntrega(data as Record<string, unknown>);
    },
    onSuccess: async (entrega) => {
      await alCambiar(entrega);
    },
  });
}

export function useRegistrarEnvio(): UseMutationResult<
  Entrega,
  Error,
  { plantilla: PlantillaId; periodo: PeriodoCodigo; certificado?: File | null }
> {
  const alCambiar = useAlCambiarEntrega();
  return useMutation({
    mutationFn: async ({ plantilla, periodo, certificado }) => {
      let ruta: string | null = null;
      if (certificado) {
        if (certificado.type && certificado.type !== "application/pdf") {
          throw new Error("El certificado de cargue debe ser un PDF.");
        }
        if (certificado.size > 10 * 1024 * 1024) {
          throw new Error("El certificado pesa más de 10 MB.");
        }
        ruta = `snies/${periodo}/${plantilla}-${Date.now()}.pdf`;
        const subida = await supabase.storage
          .from(BUCKET)
          .upload(ruta, certificado, { contentType: "application/pdf", upsert: false });
        if (subida.error) throw new Error(`No se pudo subir el certificado: ${subida.error.message}`);
      }
      const { data, error } = await supabase.rpc("ri_registrar_envio", {
        p_plantilla: plantilla,
        p_periodo: periodo,
        p_certificado: ruta,
      });
      if (error) {
        // El envío no quedó registrado: el PDF sobra. Borrarlo pide Planeación;
        // si no se puede, queda huérfano en el bucket, sin daño.
        if (ruta) await supabase.storage.from(BUCKET).remove([ruta]);
        throw fallo(error);
      }
      return aEntrega(data as Record<string, unknown>);
    },
    onSuccess: async (entrega) => {
      await alCambiar(entrega);
    },
  });
}

export function useReabrir(): UseMutationResult<Entrega, Error, { plantilla: PlantillaId; periodo: PeriodoCodigo }> {
  const alCambiar = useAlCambiarEntrega();
  return useMutation({
    mutationFn: async ({ plantilla, periodo }) => {
      const { data, error } = await supabase.rpc("ri_reabrir", { p_plantilla: plantilla, p_periodo: periodo });
      if (error) throw fallo(error);
      return aEntrega(data as Record<string, unknown>);
    },
    onSuccess: async (entrega) => {
      await alCambiar(entrega);
    },
  });
}

/** Enlace temporal (10 minutos) para abrir el certificado de cargue. */
export async function urlCertificado(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data) throw new Error(`No se pudo abrir el certificado: ${error?.message ?? "sin respuesta"}`);
  return data.signedUrl;
}

/* --- Catálogos ------------------------------------------------------------------ */

export function useCatalogos(): UseQueryResult<Record<CatalogoId, ItemCatalogo[]>> {
  return useQuery({
    queryKey: reportesKeys.catalogos,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const filas = await todas<Record<string, unknown>>((desde, hasta) =>
        supabase
          .from("ri_catalogo_items")
          .select("catalogo,codigo,nombre,departamento,oferta,activo")
          .order("catalogo")
          .order("nombre")
          .order("codigo")
          .range(desde, hasta),
      );
      const salida = Object.fromEntries(CATALOGOS.map((c) => [c, [] as ItemCatalogo[]])) as Record<CatalogoId, ItemCatalogo[]>;
      for (const raw of filas) {
        const item = aItem(raw);
        salida[item.catalogo]?.push(item);
      }
      return salida;
    },
  });
}

function useInvalidarCatalogos() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: reportesKeys.catalogos });
}

export function useGuardarItem(): UseMutationResult<void, Error, { item: ItemCatalogo; codigoAnterior?: string | null }> {
  const invalidar = useInvalidarCatalogos();
  return useMutation({
    mutationFn: async ({ item, codigoAnterior }) => {
      const { error } = await supabase.rpc("ri_catalogo_guardar", {
        p_item: itemJson(item),
        p_codigo_anterior: codigoAnterior ?? null,
      });
      if (error) throw fallo(error);
    },
    onSuccess: invalidar,
  });
}

/**
 * `campos`: Campo.codigo de las plantillas que usan ese catálogo. Así un
 * apellido «Girón» no impide quitar el municipio Girón. Sin campos, la base
 * busca el nombre en todos los campos de las filas.
 */
export function useQuitarItem(): UseMutationResult<void, Error, { catalogo: CatalogoId; codigo: string; campos?: string[] }> {
  const invalidar = useInvalidarCatalogos();
  return useMutation({
    mutationFn: async ({ catalogo, codigo, campos }) => {
      const { error } = await supabase.rpc("ri_catalogo_quitar", {
        p_catalogo: catalogo,
        p_codigo: codigo,
        p_campos: campos && campos.length > 0 ? campos : null,
      });
      if (error) throw fallo(error);
    },
    onSuccess: invalidar,
  });
}

export function useImportarCatalogo(): UseMutationResult<
  { nuevos: number; actualizados: number },
  Error,
  { catalogo: CatalogoId; items: ItemCatalogo[] }
> {
  const invalidar = useInvalidarCatalogos();
  return useMutation({
    mutationFn: async ({ catalogo, items }) => {
      const { data, error } = await supabase.rpc("ri_catalogo_importar", {
        p_catalogo: catalogo,
        p_items: items.map(itemJson),
      });
      if (error) throw fallo(error);
      const raw = (data ?? {}) as Record<string, unknown>;
      return { nuevos: Number(raw.nuevos ?? 0), actualizados: Number(raw.actualizados ?? 0) };
    },
    onSuccess: invalidar,
  });
}

/**
 * Cambia la etiqueta en las filas, también en entregas validadas o enviadas.
 * Es seguro: las filas guardan el nombre y el archivo para HECAA sale del
 * código del catálogo, que renombrar no cambia.
 */
export function useRenombrarEnFilas(): UseMutationResult<number, Error, { campos: string[]; anterior: string; nuevo: string }> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ campos, anterior, nuevo }) => {
      const { data, error } = await supabase.rpc("ri_renombrar_en_filas", {
        p_campos: campos,
        p_anterior: anterior,
        p_nuevo: nuevo,
      });
      if (error) throw fallo(error);
      return Number(data ?? 0);
    },
    onSuccess: async (cambiadas) => {
      if (cambiadas === 0) return;
      await client.invalidateQueries({ queryKey: reportesKeys.filasTodas });
      await client.invalidateQueries({ queryKey: reportesKeys.crucesTodos });
    },
  });
}

/**
 * Programas con código SNIES de la estructura institucional, con su oferta
 * (municipios de sus sedes activas, 0104). `aviso`: sedes sin municipio y
 * programas sin sede; null si no hay nada que advertir.
 */
export function useProgramasDesdeEstructura(): UseMutationResult<
  { nuevos: number; actualizados: number; aviso?: string | null },
  Error,
  void
> {
  const invalidar = useInvalidarCatalogos();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("ri_programas_desde_estructura");
      if (error) throw fallo(error);
      const raw = (data ?? {}) as Record<string, unknown>;
      return {
        nuevos: Number(raw.nuevos ?? 0),
        actualizados: Number(raw.actualizados ?? 0),
        aviso: typeof raw.aviso === "string" && raw.aviso.trim() ? raw.aviso : null,
      };
    },
    onSuccess: invalidar,
  });
}

/* --- Sedes (0104) ------------------------------------------------------------------ */

export interface Sede {
  campus_id: string;
  nombre: string;
  /** Código DIVIPOLA, o null si la sede aún no tiene municipio. */
  municipio: string | null;
}

/** Todas las sedes (campuses), con su municipio si lo tienen. */
export function useSedes(): UseQueryResult<Sede[]> {
  return useQuery({
    queryKey: reportesKeys.sedes,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Sede[]> => {
      const [sedes, municipios] = await Promise.all([
        supabase.from("campuses").select("id,name,position").order("position").order("name"),
        supabase.from("ri_sedes").select("campus_id,municipio"),
      ]);
      if (sedes.error) throw fallo(sedes.error);
      if (municipios.error) throw fallo(municipios.error);
      const porSede = new Map((municipios.data ?? []).map((r) => [String(r.campus_id), String(r.municipio)]));
      return (sedes.data ?? []).map((r) => ({
        campus_id: String(r.id),
        nombre: String(r.name),
        municipio: porSede.get(String(r.id)) ?? null,
      }));
    },
  });
}

/** Asigna el municipio (DIVIPOLA) de una sede; null o vacío, se lo quita. */
export function useGuardarSede(): UseMutationResult<void, Error, { campus_id: string; municipio: string | null }> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ campus_id, municipio }) => {
      const { error } = await supabase.rpc("ri_sede_guardar", { p_campus: campus_id, p_municipio: municipio ?? "" });
      if (error) throw fallo(error);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: reportesKeys.sedes });
    },
  });
}

/* --- Cruces ----------------------------------------------------------------------- */

interface CruceRaw {
  plantilla: string;
  periodo: string;
  documento: string | null;
  programa: string | null;
}

/** Nombre o código del programa → código SNIES; si no se reconoce, el valor tal cual. */
function conversorPrograma(programas: ItemCatalogo[]): (valor: string) => string {
  const exacto = new Map<string, string>();
  const porPlano = new Map<string, string | null>();
  const anotar = (texto: string, codigo: string) => {
    const k = plano(texto);
    if (!k) return;
    const previo = porPlano.get(k);
    // Si dos programas se llaman igual sin tildes, el nombre plano no decide.
    porPlano.set(k, previo === undefined || previo === codigo ? codigo : null);
  };
  for (const item of programas) {
    exacto.set(item.codigo, item.codigo);
    exacto.set(motor.etiqueta(item), item.codigo);
    exacto.set(item.nombre, item.codigo);
    anotar(motor.etiqueta(item), item.codigo);
    anotar(item.nombre, item.codigo);
  }
  return (valor: string) => {
    const v = valor.trim();
    return exacto.get(v) ?? porPlano.get(plano(v)) ?? v;
  };
}

export function useCruces(
  periodo: PeriodoCodigo,
  catalogos: Record<CatalogoId, ItemCatalogo[]> | undefined,
): UseQueryResult<Cruces> {
  const convertir = useCallback(
    (filas: CruceRaw[]): Cruces => {
      const programa = conversorPrograma(catalogos?.programa ?? []);
      const cruces: Cruces = {
        participantes: new Set(),
        matriculados: new Set(),
        graduados: new Map(),
        inscritos: new Set(),
        inscritosPrograma: new Set(),
        admitidos: new Set(),
        primerCurso: new Set(),
      };
      // Población estudiantil por periodo: «documento|codigoPrograma|periodo».
      const porPeriodo: Partial<Record<string, Set<string>>> = {
        inscritos: cruces.inscritos,
        inscritos_programa: cruces.inscritosPrograma,
        admitidos: cruces.admitidos,
        primer_curso: cruces.primerCurso,
      };
      for (const fila of filas) {
        const documento = normalizarDocumento(fila.documento ?? "");
        if (!documento) continue;
        if (fila.plantilla === "participante") {
          cruces.participantes.add(documento);
          continue;
        }
        const conjunto = porPeriodo[fila.plantilla];
        if (conjunto) {
          // Relación de inscritos no trae programa: «documento||periodo».
          const codigo = fila.plantilla === "inscritos" || !fila.programa ? "" : programa(fila.programa);
          conjunto.add(`${documento}|${codigo}|${fila.periodo}`);
          continue;
        }
        if (!fila.programa) continue;
        const clave = `${documento}|${programa(fila.programa)}`;
        if (fila.plantilla === "matriculados") {
          cruces.matriculados.add(clave);
        } else if (fila.plantilla === "graduados") {
          // Si aparece graduado en varios periodos, cuenta el primero.
          const previo = cruces.graduados.get(clave);
          if (!previo || fila.periodo < previo) cruces.graduados.set(clave, fila.periodo);
        }
      }
      return cruces;
    },
    [catalogos],
  );

  return useQuery({
    queryKey: reportesKeys.cruces(periodo),
    enabled: Boolean(periodo),
    queryFn: () =>
      todas<CruceRaw>((desde, hasta) => supabase.rpc("ri_cruces", { p_periodo: periodo }).range(desde, hasta)),
    select: convertir,
  });
}

/* --- Permisos ---------------------------------------------------------------------- */

/** Espejo de las guardas de 0103; la base decide, esto solo esconde botones. */
export function usePermisosReportes(): { ver: boolean; capturar: boolean; catalogos: boolean; cna: boolean } {
  const { canSee, hasRole } = useAuth();
  const ver = canSee("reportes");
  return {
    ver,
    capturar: ver && hasRole("responsable"),
    catalogos: ver && hasRole("planeacion"),
    cna: ver && hasRole("admin"),
  };
}
