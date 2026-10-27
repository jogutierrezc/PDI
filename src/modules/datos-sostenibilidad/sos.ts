/* =============================================================================
   Datos de Sostenibilidad «al estilo UDrive» · datos (TanStack Query + Supabase, migración 0202).

   Indicadores vinculados a tablas de UDrive, gráficas publicadas y lo que lee
   el portal. La base decide (RLS, disparadores, validación de columnas); estos
   hooks no repiten permisos. Si falta la migración, la consulta falla con
   FaltaMigracion y la pantalla lo dice. Las dos lecturas públicas
   (useCifrasPublicas, useGraficasPublicas) no fallan: sin migración o sin red
   devuelven [] y el portal queda como estaba.

   Las tablas y gráficas en sí (contenido, carpetas, papeles) son de UDrive:
   se leen con los hooks de ../udrive/datos.ts (useContenido, useArchivos…).
   El contrato completo, en README.md → «Contrato para las pantallas».
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { FaltaMigracion } from "../rankings/noticias";
import type { ColumnaUd, TablaDatos } from "../udrive/tipos";
import type {
  CifraPublicaSos,
  GraficaPublicaSos,
  IndicadorCalculado,
  IndicadorSos,
  PublicacionSos,
  PuntoSerieSos,
  ResumenSos,
  SeccionSos,
  VinculoSos,
  VinculoSosEntrada,
} from "./tipos";

export { FaltaMigracion };
export const esFaltaMigracion = (e: unknown): e is FaltaMigracion => e instanceof FaltaMigracion;

interface ErrorBase {
  code?: string;
  message?: string;
}

/** Falta la migración 0202: tabla, función o columna que no existen. */
const faltaTabla = (e: ErrorBase) =>
  ["42P01", "42703", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "") || /does not exist|schema cache|could not find/i.test(e.message ?? "");

/** Error legible; si falta la migración, el aviso. */
export function errorSos(e: ErrorBase): Error {
  return faltaTabla(e) ? new FaltaMigracion("Falta aplicar la migración 0202 (Datos de Sostenibilidad al estilo UDrive).") : new Error(e.message ?? "Error de la base de datos");
}

const COLUMNAS_INDICADOR =
  "id,ods,nombre,descripcion,unidad,position,mejor,resumen,meta,decimales,publicado,tarjeta,nota";

const sosKeys = {
  all: ["sos"] as const,
  indicadores: ["sos", "indicadores"] as const,
  vinculos: ["sos", "vinculos"] as const,
  publicaciones: ["sos", "publicaciones"] as const,
  cifras: ["sos", "cifras-publicas"] as const,
  graficas: ["sos", "graficas-publicas"] as const,
};

/* --- Lecturas ---------------------------------------------------------------------------- */

/** El catálogo con los campos de 0202. Lo lee quien entra a la pantalla. */
export function useIndicadoresSos() {
  return useQuery({
    queryKey: sosKeys.indicadores,
    queryFn: async (): Promise<IndicadorSos[]> => {
      const r = await supabase.from("ds_indicadores").select(COLUMNAS_INDICADOR).order("ods").order("position").order("id");
      if (r.error) throw errorSos(r.error);
      return (r.data ?? []).map((i) => ({ ...(i as unknown as IndicadorSos), meta: i.meta === null ? null : Number(i.meta) }));
    },
  });
}

/** Los vínculos indicador → tabla (uno por indicador). */
export function useVinculos() {
  return useQuery({
    queryKey: sosKeys.vinculos,
    queryFn: async (): Promise<VinculoSos[]> => {
      const r = await supabase.from("sos_vinculos").select("id,indicador_id,archivo_id,col_valor,col_periodo,col_campus,filtro_col,filtro_valor");
      if (r.error) throw errorSos(r.error);
      return (r.data ?? []) as VinculoSos[];
    },
  });
}

/** Qué gráficas están marcadas para el portal y en qué sección. */
export function usePublicacionesGraficas() {
  return useQuery({
    queryKey: sosKeys.publicaciones,
    queryFn: async (): Promise<PublicacionSos[]> => {
      const r = await supabase.from("sos_publicaciones").select("archivo_id,seccion,orden,publicado,por,en").order("orden");
      if (r.error) throw errorSos(r.error);
      return (r.data ?? []) as PublicacionSos[];
    },
  });
}

/** Lo que hoy ve el público: indicadores publicados con su serie agregada. Pública; sin migración, []. */
export function useCifrasPublicas() {
  return useQuery({
    queryKey: sosKeys.cifras,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<CifraPublicaSos[]> => {
      const r = await supabase.rpc("sos_cifras_publicas");
      if (r.error || !Array.isArray(r.data)) return [];
      return r.data as CifraPublicaSos[];
    },
  });
}

/** Las gráficas publicadas con solo sus columnas. Pública; sin migración, []. */
export function useGraficasPublicas() {
  return useQuery({
    queryKey: sosKeys.graficas,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<GraficaPublicaSos[]> => {
      const r = await supabase.rpc("sos_graficas_publicas");
      if (r.error || !Array.isArray(r.data)) return [];
      return r.data as GraficaPublicaSos[];
    },
  });
}

/* --- Escrituras -------------------------------------------------------------------------- */

/** Lo que cambia cuando algo se publica o se vincula: catálogo, vínculos y lo público. */
function invalidar(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: sosKeys.all });
  // El portal también lee la caché de las cifras reales.
  void client.invalidateQueries({ queryKey: ["sostenible"] });
}

/** Crea o edita un indicador (administración o Administra en la unidad: la RLS de 0202 lo hace cumplir). `publicado` no se toca aquí: usa usePublicarIndicador. */
export function useGuardarIndicador() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (i: Omit<IndicadorSos, "publicado"> & { publicado?: boolean }) => {
      const fila = {
        id: i.id.trim(),
        ods: i.ods,
        nombre: i.nombre.trim(),
        descripcion: i.descripcion.trim(),
        unidad: i.unidad.trim(),
        position: i.position,
        mejor: i.mejor,
        resumen: i.resumen,
        meta: i.meta,
        decimales: i.decimales,
        tarjeta: i.tarjeta,
        nota: i.nota.trim(),
      };
      const r = await supabase.from("ds_indicadores").upsert(fila, { onConflict: "id" }).select("id").single();
      if (r.error) throw errorSos(r.error);
      return r.data;
    },
    onSuccess: () => invalidar(client),
  });
}

/** Publica o retira un indicador (Administra; la base pide un vínculo válido para publicar). */
export function usePublicarIndicador() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; publicado: boolean }) => {
      const r = await supabase.from("ds_indicadores").update({ publicado: v.publicado }).eq("id", v.id).select("id").single();
      if (r.error) throw errorSos(r.error);
      return r.data;
    },
    onSuccess: () => invalidar(client),
  });
}

/** Vincula (o cambia el vínculo de) un indicador a una tabla. La base valida tabla, unidad y columnas. */
export function useGuardarVinculo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (v: VinculoSosEntrada) => {
      const r = await supabase.from("sos_vinculos").upsert(v, { onConflict: "indicador_id" }).select("id").single();
      if (r.error) throw errorSos(r.error);
      return r.data;
    },
    onSuccess: () => invalidar(client),
  });
}

/** Quita el vínculo de un indicador (si era el único y estaba publicado, la base lo despublica). */
export function useQuitarVinculo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (indicadorId: string) => {
      const r = await supabase.from("sos_vinculos").delete().eq("indicador_id", indicadorId);
      if (r.error) throw errorSos(r.error);
    },
    onSuccess: () => invalidar(client),
  });
}

/** Marca o desmarca una gráfica de la unidad para el portal (papel Crear o más sobre el archivo). */
export function usePublicarGrafica() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (p: { archivo_id: string; publicado: boolean; seccion?: SeccionSos; orden?: number }) => {
      const r = await supabase
        .from("sos_publicaciones")
        .upsert({ archivo_id: p.archivo_id, publicado: p.publicado, seccion: p.seccion ?? "detalle", orden: p.orden ?? 0 }, { onConflict: "archivo_id" })
        .select("archivo_id")
        .single();
      if (r.error) throw errorSos(r.error);
      return r.data;
    },
    onSuccess: () => invalidar(client),
  });
}

/* --- Lógica pura: vista previa del portal (réplica de sos_cifras_publicas) ---------------- */

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Misma lista que sos_columna_sensible() en la base: avisa antes de que la base rechace. */
export function columnaSensible(c: Pick<ColumnaUd, "clave" | "etiqueta"> & { sensible?: boolean }): boolean {
  return (
    c.sensible === true ||
    /(cedula|documento|identificaci|correo|e-?mail|telefono|celular|direccion|apellido|nacimiento|codigo.?(de.?)?(estudiante|empleado)|salario|sueldo)/.test(
      sinTildes(`${c.clave} ${c.etiqueta}`),
    )
  );
}

const INSTITUCIONAL = new Set(["", "institucional", "universidad", "todos", "todas"]);

/** Los avisos que la base rechazaría al guardar el vínculo (la base manda; esto es para avisar antes). */
export function avisosDeVinculo(v: Pick<VinculoSos, "col_valor" | "col_periodo" | "col_campus" | "filtro_col">, tabla: TablaDatos): string[] {
  const avisos: string[] = [];
  const col = (k: string) => tabla.columnas.find((c) => c.clave === k);
  const valor = col(v.col_valor);
  if (!valor) avisos.push("La columna del valor no existe en la tabla.");
  else if (valor.tipo !== "numero" && valor.tipo !== "porcentaje") avisos.push("La columna del valor debe ser numérica (número o porcentaje).");
  for (const k of [v.col_valor, v.col_periodo, v.col_campus, v.filtro_col]) {
    if (!k) continue;
    const c = col(k);
    if (!c) {
      if (k !== v.col_valor) avisos.push(`La columna «${k}» no existe en la tabla.`);
    } else if (columnaSensible(c)) avisos.push(`La columna «${c.etiqueta || c.clave}» parece traer datos personales y no se puede publicar.`);
  }
  return avisos;
}

type Resumir = (valores: number[]) => number;
const RESUMEN: Record<ResumenSos, Resumir> = {
  promedio: (v) => v.reduce((a, b) => a + b, 0) / v.length,
  suma: (v) => v.reduce((a, b) => a + b, 0),
  ultimo: (v) => v[v.length - 1],
};

/**
 * Agrega la tabla como lo hace sos_cifras_publicas(): por campus y año, con el
 * resumen del indicador. Una fila cuenta si el valor es un número y el periodo
 * trae un año de cuatro cifras. Campus vacío o «institucional» es la cifra
 * institucional (campus nulo); si hay campus pero no esa fila para un año, se
 * calcula con las filas de todos los campus.
 */
export function agregarSerie(
  ind: Pick<IndicadorSos, "resumen">,
  v: Pick<VinculoSos, "col_valor" | "col_periodo" | "col_campus" | "filtro_col" | "filtro_valor">,
  tabla: TablaDatos,
): PuntoSerieSos[] {
  type Fila = { valor: number; anio: number; periodo: string | null; campus: string | null };
  const filas: Fila[] = [];
  for (const f of tabla.filas) {
    const crudo = f.datos[v.col_valor];
    if (typeof crudo !== "number" || !Number.isFinite(crudo)) continue;
    if (v.filtro_col && String(f.datos[v.filtro_col] ?? "") !== (v.filtro_valor ?? "")) continue;
    const periodo = String(f.datos[v.col_periodo] ?? "").trim();
    const m = /\b(\d{4})\b/.exec(periodo);
    const anio = m ? Number(m[1]) : NaN;
    if (!(anio >= 1900 && anio <= 2100)) continue;
    const c = v.col_campus ? String(f.datos[v.col_campus] ?? "").trim() : "";
    filas.push({ valor: crudo, anio, periodo: periodo || null, campus: v.col_campus && !INSTITUCIONAL.has(sinTildes(c)) ? c : null });
  }
  const resumir = RESUMEN[ind.resumen] ?? RESUMEN.promedio;
  const grupo = (clave: (f: Fila) => string | null) => {
    const mapa = new Map<string, Fila[]>();
    for (const f of filas) {
      const k = clave(f);
      if (k !== null) mapa.set(k, [...(mapa.get(k) ?? []), f]);
    }
    return mapa;
  };
  const puntos: PuntoSerieSos[] = [];
  for (const g of grupo((f) => `${f.campus ?? ""}\u0000${f.anio}`).values()) {
    puntos.push({ campus: g[0].campus, anio: g[0].anio, periodo: g[g.length - 1].periodo, valor: resumir(g.map((f) => f.valor)) });
  }
  const conInstitucional = new Set(puntos.filter((p) => p.campus === null).map((p) => p.anio));
  for (const g of grupo((f) => (f.campus !== null && !conInstitucional.has(f.anio) ? String(f.anio) : null)).values()) {
    puntos.push({ campus: null, anio: g[0].anio, periodo: g[g.length - 1].periodo, valor: resumir(g.map((f) => f.valor)) });
  }
  return puntos.sort((a, b) => a.anio - b.anio || (a.campus ?? "").localeCompare(b.campus ?? ""));
}

/**
 * Lo que mostraría el portal para un indicador y un campus (`null` o «Todos» =
 * institucional), calculado en el navegador con la tabla ya cargada: valor del
 * último año, del año previo, cambio frente al previo y avance hacia la meta.
 */
export function calcularIndicador(
  ind: Pick<IndicadorSos, "resumen" | "meta" | "mejor">,
  vinculo: Pick<VinculoSos, "col_valor" | "col_periodo" | "col_campus" | "filtro_col" | "filtro_valor">,
  tabla: TablaDatos,
  campus: string | null = null,
): IndicadorCalculado {
  const quiere = campus === null || sinTildes(campus) === "todos" ? null : sinTildes(campus);
  const serie = agregarSerie(ind, vinculo, tabla).filter((p) => (p.campus === null ? quiere === null : quiere !== null && sinTildes(p.campus) === quiere));
  const actual = serie.length ? serie[serie.length - 1] : null;
  const previo = serie.length > 1 ? serie[serie.length - 2] : null;
  const cambioPct = actual && previo && previo.valor !== 0 ? ((actual.valor - previo.valor) / Math.abs(previo.valor)) * 100 : null;
  const mejora = cambioPct === null ? null : ind.mejor === "sube" ? cambioPct >= 0 : cambioPct <= 0;
  const avanceMeta = actual && ind.meta !== null && ind.meta !== 0 ? actual.valor / ind.meta : null;
  return { serie, actual, previo, meta: ind.meta, cambioPct, mejora, avanceMeta, avisos: avisosDeVinculo(vinculo, tabla) };
}

/* --- Las secciones del Observatorio donde puede ir una gráfica ----------------------------- */

export const SECCIONES_SOS: { id: SeccionSos; etiqueta: string }[] = [
  { id: "panorama", etiqueta: "Panorama" },
  { id: "tendencia", etiqueta: "Tendencia" },
  { id: "composicion", etiqueta: "Composición" },
  { id: "territorio", etiqueta: "Territorio" },
  { id: "detalle", etiqueta: "Detalle" },
];
