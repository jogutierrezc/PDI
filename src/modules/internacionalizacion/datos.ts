/* =============================================================================
   Internacionalización · datos (TanStack Query + Supabase, migración 0151).

   Lecturas y escrituras del módulo. La base decide (RLS por campus, el
   disparador de filas y las RPC); estos hooks no repiten permisos, salvo para
   no ofrecer lo imposible. Si las tablas no existen (migración sin aplicar),
   la consulta falla con FaltaMigracion y la pantalla lo dice, como en
   rankings/noticias.

   Ver README.md para la lista de hooks y sus firmas.
   ========================================================================== */

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { FaltaMigracion } from "../rankings/noticias";
import { reportesKeys } from "../reportes/store";
import type { CifrasRpc, Incluir } from "./lib/cifras";
import type { ColumnaPlantilla } from "./lib/cobertura";
import type {
  Campus,
  Columna,
  Datos,
  IntCarpetaRow,
  IntConceptoRow,
  IntEnvioHistorialRow,
  IntEnvioRow,
  IntEnvioSniesRow,
  IntEstado,
  IntFilaRow,
  IntHojaRow,
  IntLibroRow,
  IntMiembroRow,
  IntPeriodoRow,
  IntPlantillaColumnaRow,
  IntPlantillaRow,
  IntReaperturaRow,
  IntRol,
  IntVentanaRow,
  LibroCompleto,
  Yo,
} from "./tipos";

export { FaltaMigracion };

const PAGINA = 1000;

interface ErrorBase {
  code?: string;
  message?: string;
}

const noExiste = (e: ErrorBase) =>
  Boolean(["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? "")) &&
  /int_|does not exist|schema cache/i.test(e.message ?? "");

/** Error legible; si faltan las tablas o las funciones, el aviso de migración. */
export function errorDe(e: ErrorBase): Error {
  if (!noExiste(e)) return new Error(e.message ?? "Error de la base de datos");
  // Las carpetas, Multicampus y la autoría salen de la 0166; lo demás, de la 0151.
  return /int_carpetas|carpeta_id|int_rol_fila|int_puede_|int_controla|archivo/i.test(e.message ?? "")
    ? new FaltaMigracion("Falta aplicar la migración 0166 (carpetas y tablas Multicampus de Internacionalización).")
    : new FaltaMigracion("Falta aplicar la migración 0151 (Internacionalización).");
}

async function todasLas<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: ErrorBase | null }>): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const r = await pedir(desde, desde + PAGINA - 1);
    if (r.error) throw errorDe(r.error);
    const filas = (r.data ?? []) as T[];
    salida.push(...filas);
    if (filas.length < PAGINA) break;
  }
  return salida;
}

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw errorDe(r.error);
  return r.data as T;
}

export const INT_CLAVES = {
  todo: ["int"] as const,
  yo: ["int", "yo"] as const,
  campus: ["int", "campus"] as const,
  conceptos: ["int", "conceptos"] as const,
  estructura: ["int", "estructura"] as const,
  carpetas: ["int", "carpetas"] as const,
  periodos: ["int", "periodos"] as const,
  ventanas: (periodo: string) => ["int", "ventanas", periodo] as const,
  filas: (hoja: string, periodo: string) => ["int", "filas", hoja, periodo] as const,
  envios: (periodo: string) => ["int", "envios", periodo] as const,
  historial: (periodo: string) => ["int", "historial", periodo] as const,
  reaperturas: (periodo: string) => ["int", "reaperturas", periodo] as const,
  miembros: ["int", "miembros"] as const,
  plantillas: ["int", "plantillas"] as const,
  cifras: (periodo: string, incluir: Incluir) => ["int", "cifras", periodo, incluir] as const,
  enviosSnies: (periodo: string) => ["int", "envios-snies", periodo] as const,
};

/* ---------- Lecturas ---------------------------------------------------------- */

/** Mis papeles en el módulo (int_yo). La administración llega como director. */
export function useYo() {
  return useQuery({
    queryKey: INT_CLAVES.yo,
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<Yo>("int_yo", {}),
  });
}

/** Los campus de public.campuses (Bucaramanga, Cúcuta, Valledupar, Bogotá…). */
export function useCampus() {
  return useQuery({
    queryKey: INT_CLAVES.campus,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Campus[]> => {
      const r = await supabase.from("campuses").select("id, slug, code, name").order("position");
      if (r.error) throw errorDe(r.error);
      return (r.data as Campus[] | null) ?? [];
    },
  });
}

export function useConceptos() {
  return useQuery({
    queryKey: INT_CLAVES.conceptos,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<IntConceptoRow[]> => {
      const r = await supabase.from("int_conceptos").select("id, nombre, tipo, opciones, sinonimos, descripcion, implicito, personal, orden").order("orden");
      if (r.error) throw errorDe(r.error);
      return (r.data as IntConceptoRow[] | null) ?? [];
    },
  });
}

/** Libros con sus hojas y columnas, ordenados. */
export function useEstructura() {
  return useQuery({
    queryKey: INT_CLAVES.estructura,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<LibroCompleto[]> => {
      const [libros, hojas, columnas] = await Promise.all([
        supabase.from("int_libros").select("id, nombre, descripcion, captura, orden, carpeta_id, created_by, created_at").order("orden").order("nombre"),
        supabase.from("int_hojas").select("id, libro_id, nombre, clase, sentido, orden").order("orden").order("nombre"),
        todasLas<Columna & { id: string; hoja_id: string; orden: number }>((d, h) =>
          supabase.from("int_columnas").select("id, hoja_id, clave, etiqueta, tipo, concepto_id, obligatorio, opciones, calculo, orden").order("orden").range(d, h),
        ),
      ]);
      if (libros.error) throw errorDe(libros.error);
      if (hojas.error) throw errorDe(hojas.error);
      return armarEstructura((libros.data as IntLibroRow[]) ?? [], (hojas.data as IntHojaRow[]) ?? [], columnas as never);
    },
  });
}

/** Une libros, hojas y columnas (exportada para las pruebas). */
export function armarEstructura(libros: IntLibroRow[], hojas: IntHojaRow[], columnas: LibroCompleto["hojas"][number]["columnas"]): LibroCompleto[] {
  return libros.map((l) => ({
    ...l,
    hojas: hojas.filter((h) => h.libro_id === l.id).map((h) => ({ ...h, columnas: columnas.filter((c) => c.hoja_id === h.id) })),
  }));
}

/** Las carpetas (con subcarpetas por parent_id). El árbol lo arma lib/carpetas. */
export function useCarpetas() {
  return useQuery({
    queryKey: INT_CLAVES.carpetas,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<IntCarpetaRow[]> => {
      const r = await supabase.from("int_carpetas").select("id, nombre, parent_id, orden, created_by, created_at").order("orden").order("nombre");
      if (r.error) throw errorDe(r.error);
      return (r.data as IntCarpetaRow[] | null) ?? [];
    },
  });
}

export function usePeriodos() {
  return useQuery({
    queryKey: INT_CLAVES.periodos,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<IntPeriodoRow[]> => {
      const r = await supabase.from("int_periodos").select("id, codigo, nombre, abre, cierra, estado").order("codigo", { ascending: false });
      if (r.error) throw errorDe(r.error);
      return (r.data as IntPeriodoRow[] | null) ?? [];
    },
  });
}

export function useVentanas(periodo: string | undefined) {
  return useQuery({
    queryKey: INT_CLAVES.ventanas(periodo ?? ""),
    enabled: Boolean(periodo),
    retry: false,
    queryFn: async (): Promise<IntVentanaRow[]> => {
      const r = await supabase.from("int_ventanas").select("id, periodo_id, hoja_id, campus_id, abre, cierra").eq("periodo_id", periodo ?? "");
      if (r.error) throw errorDe(r.error);
      return (r.data as IntVentanaRow[] | null) ?? [];
    },
  });
}

/** Filas de una hoja en un periodo. RLS deja solo las de los campus de quien pregunta. */
export function useFilas(hoja: string | undefined, periodo: string | undefined) {
  return useQuery({
    queryKey: INT_CLAVES.filas(hoja ?? "", periodo ?? ""),
    enabled: Boolean(hoja && periodo),
    retry: false,
    queryFn: () =>
      todasLas<IntFilaRow>((d, h) =>
        supabase
          .from("int_filas")
          .select("id, hoja_id, periodo_id, campus_id, datos, orden, origen, archivo, created_by, updated_by, created_at, updated_at")
          .eq("hoja_id", hoja ?? "")
          .eq("periodo_id", periodo ?? "")
          .order("campus_id")
          .order("orden")
          .range(d, h),
      ),
  });
}

/** Estados por hoja y campus del periodo (sin fila = borrador). */
export function useEnvios(periodo: string | undefined) {
  return useQuery({
    queryKey: INT_CLAVES.envios(periodo ?? ""),
    enabled: Boolean(periodo),
    retry: false,
    queryFn: async (): Promise<IntEnvioRow[]> => {
      const r = await supabase
        .from("int_envios")
        .select("periodo_id, hoja_id, campus_id, estado, nota, enviado_en, validado_en, aprobado_en, updated_by, updated_at")
        .eq("periodo_id", periodo ?? "");
      if (r.error) throw errorDe(r.error);
      return (r.data as IntEnvioRow[] | null) ?? [];
    },
  });
}

/** Estado de (hoja, campus) en la lista de envíos; borrador si no hay fila. */
export function estadoDe(envios: readonly IntEnvioRow[] | undefined, hoja: string, campus: string): IntEstado {
  return envios?.find((e) => e.hoja_id === hoja && e.campus_id === campus)?.estado ?? "borrador";
}

export function useHistorial(periodo: string | undefined) {
  return useQuery({
    queryKey: INT_CLAVES.historial(periodo ?? ""),
    enabled: Boolean(periodo),
    retry: false,
    queryFn: () =>
      todasLas<IntEnvioHistorialRow>((d, h) =>
        supabase.from("int_envios_historial").select("*").eq("periodo_id", periodo ?? "").order("en", { ascending: false }).range(d, h),
      ),
  });
}

export function useReaperturas(periodo: string | undefined) {
  return useQuery({
    queryKey: INT_CLAVES.reaperturas(periodo ?? ""),
    enabled: Boolean(periodo),
    retry: false,
    queryFn: async (): Promise<IntReaperturaRow[]> => {
      const r = await supabase.from("int_reaperturas").select("*").eq("periodo_id", periodo ?? "").order("en", { ascending: false });
      if (r.error) throw errorDe(r.error);
      return (r.data as IntReaperturaRow[] | null) ?? [];
    },
  });
}

export interface Miembro extends IntMiembroRow {
  nombre: string;
  email: string;
}

/** Equipo del módulo (lo que RLS deja ver: el Director, todo; los demás, su campus). */
export function useMiembros() {
  return useQuery({
    queryKey: INT_CLAVES.miembros,
    retry: false,
    queryFn: async (): Promise<Miembro[]> => {
      const r = await supabase.from("int_miembros").select("id, user_id, rol, campus_id, created_at, profiles!int_miembros_user_id_fkey(full_name, email)");
      if (r.error) throw errorDe(r.error);
      type Perfil = { full_name: string | null; email: string | null };
      const filas = (r.data as (IntMiembroRow & { profiles: Perfil | Perfil[] | null })[] | null) ?? [];
      return filas.map(({ profiles, ...m }) => {
        const p = Array.isArray(profiles) ? profiles[0] : profiles;
        return { ...m, nombre: p?.full_name ?? p?.email ?? "Persona", email: p?.email ?? "" };
      });
    },
  });
}

export interface Persona {
  id: string;
  nombre: string;
  email: string;
}

/**
 * Directorio de la intranet para nombrar a alguien (Accesos): busca en
 * profiles por nombre o correo. No es un permiso nuevo: profiles_select (0002)
 * ya deja leer el directorio a todo el personal de la intranet.
 */
export function usePersonas(buscar: string) {
  const t = buscar.trim().replace(/[%,()]/g, " ").trim();
  return useQuery({
    queryKey: ["int", "personas", t],
    enabled: t.length >= 3,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<Persona[]> => {
      const r = await supabase.from("profiles").select("id, full_name, email").or(`full_name.ilike.%${t}%,email.ilike.%${t}%`).order("full_name").limit(12);
      if (r.error) throw errorDe(r.error);
      return ((r.data as { id: string; full_name: string | null; email: string | null }[] | null) ?? []).map((p) => ({
        id: p.id,
        nombre: p.full_name || p.email || "Persona",
        email: p.email ?? "",
      }));
    },
  });
}

/** Nombres de quienes aparecen en el historial (actor), del mismo directorio. */
export function useNombres(ids: readonly (string | null)[]) {
  const lista = [...new Set(ids.filter((x): x is string => Boolean(x)))].sort();
  return useQuery({
    queryKey: ["int", "nombres", lista.join(",")],
    enabled: lista.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const r = await supabase.from("profiles").select("id, full_name, email").in("id", lista);
      if (r.error) throw errorDe(r.error);
      return Object.fromEntries(((r.data as { id: string; full_name: string | null; email: string | null }[] | null) ?? []).map((p) => [p.id, p.full_name || p.email || "Persona"]));
    },
  });
}

export interface PlantillaConColumnas extends IntPlantillaRow {
  columnas: IntPlantillaColumnaRow[];
}

/** Plantillas CNA / rankings / otras cargadas por el Director, con su emparejamiento. */
export function usePlantillas() {
  return useQuery({
    queryKey: INT_CLAVES.plantillas,
    retry: false,
    queryFn: async (): Promise<PlantillaConColumnas[]> => {
      const [p, c] = await Promise.all([
        supabase.from("int_plantillas").select("id, nombre, tipo, descripcion, created_at").order("nombre"),
        supabase.from("int_plantilla_columnas").select("id, plantilla_id, orden, etiqueta, concepto_id, modo, nota").order("orden"),
      ]);
      if (p.error) throw errorDe(p.error);
      if (c.error) throw errorDe(c.error);
      const columnas = (c.data as IntPlantillaColumnaRow[] | null) ?? [];
      return ((p.data as IntPlantillaRow[] | null) ?? []).map((x) => ({ ...x, columnas: columnas.filter((k) => k.plantilla_id === x.id) }));
    },
  });
}

/** Cifras del periodo (int_cifras). `incluir` distinto de «aprobado» solo cambia algo para el Director. */
export function useCifras(periodo: string | undefined, incluir: Incluir = "aprobado") {
  return useQuery({
    queryKey: INT_CLAVES.cifras(periodo ?? "", incluir),
    enabled: Boolean(periodo),
    retry: false,
    staleTime: 30_000,
    queryFn: () => rpc<CifrasRpc>("int_cifras", { p_periodo: periodo, p_incluir: incluir }),
  });
}

/**
 * Cifras de varios periodos a la vez (la serie «por periodo» de Cifras). Comparte
 * caché con useCifras: el periodo elegido no se vuelve a pedir.
 */
export function useCifrasPeriodos(periodos: readonly string[], incluir: Incluir = "aprobado") {
  return useQueries({
    queries: periodos.map((periodo) => ({
      queryKey: INT_CLAVES.cifras(periodo, incluir),
      retry: false,
      staleTime: 30_000,
      queryFn: () => rpc<CifrasRpc>("int_cifras", { p_periodo: periodo, p_incluir: incluir }),
    })),
  });
}

/** Bitácora del puente SNIES (solo el Director la lee). */
export function useEnviosSnies(periodo: string | undefined) {
  return useQuery({
    queryKey: INT_CLAVES.enviosSnies(periodo ?? ""),
    enabled: Boolean(periodo),
    retry: false,
    queryFn: async (): Promise<IntEnvioSniesRow[]> => {
      const r = await supabase.from("int_envios_snies").select("*").eq("periodo_id", periodo ?? "").order("en", { ascending: false });
      if (r.error) throw errorDe(r.error);
      return (r.data as IntEnvioSniesRow[] | null) ?? [];
    },
  });
}

/* ---------- Escrituras -------------------------------------------------------- */

const invalidar = (cliente: QueryClient, ...claves: readonly (readonly unknown[])[]) => {
  for (const queryKey of claves) void cliente.invalidateQueries({ queryKey });
};

/** Director: crea o cambia un concepto del catálogo. */
export function useGuardarConcepto() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (c: Omit<IntConceptoRow, "implicito"> & { implicito?: boolean }) => {
      const r = await supabase.from("int_conceptos").upsert(c, { onConflict: "id" });
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.conceptos),
  });
}

/** Director: crea o cambia un libro (sin id, lo crea). Devuelve su id. */
export function useGuardarLibro() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (l: Partial<Pick<IntLibroRow, "id">> & Pick<IntLibroRow, "nombre"> & Partial<Pick<IntLibroRow, "descripcion" | "captura" | "orden">>) => {
      const r = await supabase.from("int_libros").upsert(l).select("id").single();
      if (r.error) throw errorDe(r.error);
      return (r.data as { id: string }).id;
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.estructura),
  });
}

/** Crea una carpeta (dentro de otra o en la raíz). La base comprueba quién puede, los ciclos y los 5 niveles. */
export function useCrearCarpeta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (c: { nombre: string; parent_id: string | null }): Promise<string> => {
      const r = await supabase.from("int_carpetas").insert({ nombre: c.nombre, parent_id: c.parent_id }).select("id").single();
      if (r.error) throw errorDe(r.error);
      return (r.data as { id: string }).id;
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.carpetas),
  });
}

/** Renombra una carpeta o la mueve a otra (parent_id nulo = a la raíz). */
export function useActualizarCarpeta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (c: { id: string; nombre?: string; parent_id?: string | null }) => {
      const { id, ...cambios } = c;
      const r = await supabase.from("int_carpetas").update(cambios).eq("id", id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.carpetas),
  });
}

/** Borra una carpeta vacía: con tablas o subcarpetas la base no deja. */
export function useBorrarCarpeta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("int_carpetas").delete().eq("id", id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.carpetas),
  });
}

/** Cambia la carpeta de una tabla (nulo = «Sin carpeta»). */
export function useMoverLibro() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { libro: string; carpeta: string | null }) => {
      const r = await supabase.from("int_libros").update({ carpeta_id: a.carpeta }).eq("id", a.libro);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.estructura),
  });
}

/** Director: borra un libro con sus hojas y filas (no deja si alguna hoja está aprobada en algún campus: reabra primero). */
export function useBorrarLibro() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("int_libros").delete().eq("id", id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.todo),
  });
}

/** Director: crea o cambia una hoja. Devuelve su id. */
export function useGuardarHoja() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (h: Partial<Pick<IntHojaRow, "id" | "clase" | "sentido" | "orden">> & Pick<IntHojaRow, "libro_id" | "nombre">) => {
      const r = await supabase.from("int_hojas").upsert(h).select("id").single();
      if (r.error) throw errorDe(r.error);
      return (r.data as { id: string }).id;
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.estructura),
  });
}

/**
 * Director: deja las columnas de una hoja exactamente como la lista (por
 * clave): actualiza las que existen, crea las nuevas y borra las que ya no
 * están. Los datos guardados bajo una clave borrada quedan en las filas pero
 * ya no se ven; la base rechaza una fila nueva que la traiga.
 */
export function useGuardarColumnas() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ hoja, columnas }: { hoja: string; columnas: (Columna & { orden?: number })[] }) => {
      await guardarColumnas(hoja, columnas);
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.estructura),
  });
}

async function guardarColumnas(hoja: string, columnas: (Columna & { orden?: number })[]) {
  const filas = columnas.map((c, i) => ({
    hoja_id: hoja,
    clave: c.clave,
    etiqueta: c.etiqueta,
    tipo: c.tipo,
    concepto_id: c.concepto_id,
    obligatorio: c.obligatorio,
    opciones: c.opciones,
    calculo: c.calculo ?? null,
    orden: c.orden ?? i + 1,
  }));
  if (filas.length) {
    const up = await supabase.from("int_columnas").upsert(filas, { onConflict: "hoja_id,clave" });
    if (up.error) throw errorDe(up.error);
  }
  const claves = filas.map((f) => f.clave);
  let borrar = supabase.from("int_columnas").delete().eq("hoja_id", hoja);
  if (claves.length) borrar = borrar.not("clave", "in", `(${claves.map((c) => `"${c}"`).join(",")})`);
  const del = await borrar;
  if (del.error) throw errorDe(del.error);
}

export interface TablaNueva {
  nombre: string;
  descripcion?: string;
  captura?: IntLibroRow["captura"];
  /** Carpeta donde queda (0166); nulo o ausente = «Sin carpeta». */
  carpeta_id?: string | null;
  hojas: { nombre: string; clase?: IntHojaRow["clase"]; sentido?: IntHojaRow["sentido"]; columnas: (Columna & { orden?: number })[] }[];
}

/**
 * Director: crea un libro con sus hojas y columnas de una vez (p. ej. desde
 * analizarLibro + columnasParaCrear). Si algo falla, borra el libro a medias.
 */
export function useCrearTabla() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (t: TablaNueva): Promise<string> => {
      const libro = await supabase
        .from("int_libros")
        .insert({ nombre: t.nombre, descripcion: t.descripcion ?? "", captura: t.captura ?? "campus", carpeta_id: t.carpeta_id ?? null })
        .select("id")
        .single();
      if (libro.error) throw errorDe(libro.error);
      const id = (libro.data as { id: string }).id;
      try {
        for (const [i, h] of t.hojas.entries()) {
          const hoja = await supabase
            .from("int_hojas")
            .insert({ libro_id: id, nombre: h.nombre, clase: h.clase ?? "general", sentido: h.sentido ?? null, orden: i + 1 })
            .select("id")
            .single();
          if (hoja.error) throw errorDe(hoja.error);
          await guardarColumnas((hoja.data as { id: string }).id, h.columnas);
        }
      } catch (e) {
        await supabase.from("int_libros").delete().eq("id", id);
        throw e;
      }
      return id;
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.estructura),
  });
}

/** Director: abre (crea) o cambia un periodo. Cerrar = estado «cerrado»; reabrir un cerrado va por useReabrir. */
export function useGuardarPeriodo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: Partial<Pick<IntPeriodoRow, "id">> & Pick<IntPeriodoRow, "codigo"> & Partial<Omit<IntPeriodoRow, "id" | "codigo">>) => {
      const r = await supabase.from("int_periodos").upsert(p).select("id").single();
      if (r.error) throw errorDe(r.error);
      return (r.data as { id: string }).id;
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.periodos),
  });
}

/** Director: crea o cambia una ventana. Alargar una vencida va por useReabrir (pide motivo). */
export function useGuardarVentana() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<Pick<IntVentanaRow, "id">> & Omit<IntVentanaRow, "id">) => {
      const r = await supabase.from("int_ventanas").upsert(v).select("id").single();
      if (r.error) throw errorDe(r.error);
      return (r.data as { id: string }).id;
    },
    onSuccess: (_id, v) => invalidar(cliente, INT_CLAVES.ventanas(v.periodo_id)),
  });
}

export function useBorrarVentana() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; periodo: string }) => {
      const r = await supabase.from("int_ventanas").delete().eq("id", id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: (_x, v) => invalidar(cliente, INT_CLAVES.ventanas(v.periodo)),
  });
}

/**
 * Director: reabre un periodo cerrado (sin hoja) o la ventana de una hoja
 * (con hoja y nueva fecha de cierre; campus para un solo campus). Pide motivo.
 */
export function useReabrir() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { periodo: string; motivo: string; hoja?: string | null; campus?: string | null; cierra?: string | null }) =>
      rpc<void>("int_reabrir", { p_periodo: a.periodo, p_motivo: a.motivo, p_hoja: a.hoja ?? null, p_campus: a.campus ?? null, p_cierra: a.cierra ?? null }),
    onSuccess: (_x, a) => invalidar(cliente, INT_CLAVES.periodos, INT_CLAVES.ventanas(a.periodo), INT_CLAVES.reaperturas(a.periodo)),
  });
}

export interface FilaParaGuardar {
  id?: string;
  campus_id: string;
  datos: Datos;
  orden?: number;
}

/**
 * Guarda muchas filas de una vez (int_guardar_filas, con los permisos de quien
 * llama). `reemplazar`: campus cuyas filas de la hoja y periodo se borran antes
 * (recargar un Excel). Devuelve {insertadas, actualizadas, borradas}.
 */
export function useGuardarFilas() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { hoja: string; periodo: string; filas: FilaParaGuardar[]; reemplazar?: string[]; origen?: "manual" | "excel"; archivo?: string | null }) =>
      rpc<{ insertadas: number; actualizadas: number; borradas: number }>("int_guardar_filas", {
        p_hoja: a.hoja,
        p_periodo: a.periodo,
        p_filas: a.filas,
        p_reemplazar: a.reemplazar ?? null,
        p_origen: a.origen ?? "excel",
        p_archivo: a.archivo ?? null,
      }),
    onSuccess: (_x, a) => invalidar(cliente, INT_CLAVES.filas(a.hoja, a.periodo), ["int", "cifras", a.periodo]),
  });
}

export function useBorrarFilas() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids }: { ids: string[]; hoja: string; periodo: string }) => {
      if (!ids.length) return;
      const r = await supabase.from("int_filas").delete().in("id", ids);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: (_x, a) => invalidar(cliente, INT_CLAVES.filas(a.hoja, a.periodo), ["int", "cifras", a.periodo]),
  });
}

/** Enviar, validar, aprobar, devolver (con nota) o reabrir una aprobada (Director, con motivo). */
export function useCambiarEstado() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { periodo: string; hoja: string; campus: string; estado: IntEstado; nota?: string }) =>
      rpc<IntEnvioRow>("int_cambiar_estado", { p_periodo: a.periodo, p_hoja: a.hoja, p_campus: a.campus, p_estado: a.estado, p_nota: a.nota ?? null }),
    onSuccess: (_x, a) =>
      invalidar(
        cliente,
        INT_CLAVES.envios(a.periodo),
        INT_CLAVES.historial(a.periodo),
        INT_CLAVES.reaperturas(a.periodo),
        INT_CLAVES.filas(a.hoja, a.periodo),
        ["int", "cifras", a.periodo],
      ),
  });
}

/** Nombra a alguien (Director: coordinadores y gestores; administración: también directores). */
export function useGuardarMiembro() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (m: { user_id: string; rol: IntRol; campus_id: string | null }) => {
      const r = await supabase.from("int_miembros").insert({ ...m, campus_id: m.rol === "director" ? null : m.campus_id });
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.miembros, INT_CLAVES.yo),
  });
}

export function useQuitarMiembro() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("int_miembros").delete().eq("id", id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.miembros, INT_CLAVES.yo),
  });
}

/**
 * Director: guarda una plantilla (CNA, ranking u otra) y su emparejamiento,
 * reemplazando las columnas. Para una nueva, `columnas` sale de propuestaPlantilla().
 */
export function useGuardarPlantilla() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id?: string; nombre: string; tipo: IntPlantillaRow["tipo"]; descripcion?: string; columnas: ColumnaPlantilla[] }) => {
      const r = await supabase
        .from("int_plantillas")
        .upsert({ ...(p.id ? { id: p.id } : {}), nombre: p.nombre, tipo: p.tipo, descripcion: p.descripcion ?? "" })
        .select("id")
        .single();
      if (r.error) throw errorDe(r.error);
      const id = (r.data as { id: string }).id;
      const del = await supabase.from("int_plantilla_columnas").delete().eq("plantilla_id", id);
      if (del.error) throw errorDe(del.error);
      if (p.columnas.length) {
        const ins = await supabase.from("int_plantilla_columnas").insert(
          p.columnas.map((c, i) => ({
            plantilla_id: id,
            orden: i + 1,
            etiqueta: c.etiqueta,
            concepto_id: c.modo === "falta" ? null : c.concepto_id,
            modo: c.concepto_id ? c.modo : "falta",
            nota: c.nota ?? "",
          })),
        );
        if (ins.error) throw errorDe(ins.error);
      }
      return id;
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.plantillas),
  });
}

export function useBorrarPlantilla() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("int_plantillas").delete().eq("id", id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(cliente, INT_CLAVES.plantillas),
  });
}

/**
 * Director: manda a Reportes Institucionales las filas que armó
 * construirEnvioSnies (lib/puente-snies.ts). Idempotente.
 */
export function useEnviarSnies() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { periodo: string; plantilla: string; filas: { origen: string; datos: Record<string, string> }[]; clave: string[] }) =>
      rpc<{ envio_id: string; entrega_id: string; periodo: string; insertadas: number; omitidas: number }>("int_enviar_snies", {
        p_periodo: a.periodo,
        p_plantilla: a.plantilla,
        p_filas: a.filas,
        p_clave: a.clave,
      }),
    onSuccess: (_x, a) => {
      invalidar(cliente, INT_CLAVES.enviosSnies(a.periodo));
      // Reportes Institucionales relee sus entregas y filas.
      void cliente.invalidateQueries({ queryKey: reportesKeys.all });
    },
  });
}
