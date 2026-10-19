/* =============================================================================
   Informes Institucionales · todo el acceso a Supabase (migración 0153 y la
   función pilo-informes). Las firmas son las del README, «Esquema final».

   Consultas y mutaciones con TanStack Query. La base vuelve a comprobar cada
   regla (disparador informe_instancias_guard y RLS); si faltan las tablas o
   las funciones, la consulta falla con FaltaMigracion y la pantalla lo dice.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { FaltaMigracion } from "../rankings/noticias";
import { nombreSeguro } from "../rankings/reporte/datos";
import { aNumero } from "./cifras-vivas";
import type { RespuestaPlan } from "./plan-decanatura";
import type {
  AnexoRow,
  CicloRow,
  CifraRow,
  Condicion,
  ContenidoSeccion,
  EstadoInstancia,
  FuenteRow,
  InstanciaRow,
  LecturaViva,
  PilarRef,
  Plantilla,
  RequisitoRow,
  SeccionRow,
  UnidadRef,
} from "./types";

export { useMembresiasPropias } from "../rankings/reporte/datos";
export { FaltaMigracion };

export const BUCKET = "informe-anexos";
export const MAX_ANEXO = 15 * 1024 * 1024;
const FUNCION = "pilo-informes";

interface ErrorBase {
  code?: string;
  message?: string;
}

const falta = (e: ErrorBase) =>
  ["42P01", "42883", "PGRST202", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache|could not find the function/i.test(e.message ?? "");

export function errorDe(e: ErrorBase): Error {
  return falta(e) ? new FaltaMigracion("Falta aplicar la migración 0153 (Informes Institucionales).") : new Error(e.message ?? "Error de la base de datos");
}

function revisar<T>(r: { data: unknown; error: ErrorBase | null }): T {
  if (r.error) throw errorDe(r.error);
  return r.data as T;
}

export const CLAVES = {
  ciclos: ["informes", "ciclos"] as const,
  requisitos: (ciclo: string) => ["informes", "requisitos", ciclo] as const,
  unidades: ["informes", "unidades"] as const,
  instancias: (ciclo: string) => ["informes", "instancias", ciclo] as const,
  listas: (ciclo: string) => ["informes", "listas", ciclo] as const,
  secciones: (inst: string) => ["informes", "secciones", inst] as const,
  cifras: (inst: string) => ["informes", "cifras", inst] as const,
  vivas: (inst: string) => ["informes", "vivas", inst] as const,
  fuentes: ["informes", "fuentes"] as const,
  pilares: ["informes", "pilares"] as const,
  anexos: (inst: string) => ["informes", "anexos", inst] as const,
  corpus: ["informes", "corpus"] as const,
};

/* ---------- Ciclo y requisitos -------------------------------------------------- */

export function useCiclos() {
  return useQuery({
    queryKey: CLAVES.ciclos,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<CicloRow[]> =>
      revisar<CicloRow[] | null>(await supabase.from("informe_ciclos").select("id, anio, nombre, fecha_limite, corte, estado, config").order("anio", { ascending: false })) ?? [],
  });
}

export function useGuardarCiclo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (c: Omit<CicloRow, "id"> & { id?: string }): Promise<CicloRow> =>
      revisar<CicloRow>(await supabase.from("informe_ciclos").upsert(c, { onConflict: "anio" }).select("id, anio, nombre, fecha_limite, corte, estado, config").single()),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CLAVES.ciclos }),
  });
}

export function useRequisitos(ciclo: string | undefined) {
  return useQuery({
    queryKey: CLAVES.requisitos(ciclo ?? ""),
    enabled: Boolean(ciclo),
    retry: false,
    queryFn: async (): Promise<RequisitoRow[]> =>
      revisar<RequisitoRow[] | null>(await supabase.from("informe_requisitos").select("ciclo_id, plantilla, clave, condicion").eq("ciclo_id", ciclo ?? "")) ?? [],
  });
}

export function useGuardarRequisito() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (r: RequisitoRow) => {
      revisar(await supabase.from("informe_requisitos").upsert(r, { onConflict: "ciclo_id,plantilla,clave" }));
      return r;
    },
    onMutate: (r) => {
      cliente.setQueryData<RequisitoRow[]>(CLAVES.requisitos(r.ciclo_id), (antes = []) => [
        ...antes.filter((x) => !(x.plantilla === r.plantilla && x.clave === r.clave)),
        r,
      ]);
    },
    onSettled: (_d, _e, r) => void cliente.invalidateQueries({ queryKey: CLAVES.requisitos(r.ciclo_id) }),
  });
}

/** Condición que fijó Planeación para una clave en una plantilla (por defecto, sugerido). */
export const condicionDe = (requisitos: RequisitoRow[], plantilla: Plantilla, clave: string): Condicion =>
  requisitos.find((r) => r.plantilla === plantilla && r.clave === clave)?.condicion ?? "sugerido";

/* ---------- Unidades e instancias ---------------------------------------------- */

export function useUnidades() {
  return useQuery({
    queryKey: CLAVES.unidades,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<UnidadRef[]> =>
      revisar<UnidadRef[] | null>(await supabase.from("units").select("id, name, kind, code, parent_id").order("position")) ?? [],
  });
}

export function useInstancias(ciclo: string | undefined) {
  return useQuery({
    queryKey: CLAVES.instancias(ciclo ?? ""),
    enabled: Boolean(ciclo),
    retry: false,
    queryFn: async (): Promise<InstanciaRow[]> =>
      revisar<InstanciaRow[] | null>(
        await supabase
          .from("informe_instancias")
          .select("id, ciclo_id, unit_id, plantilla, destino, estado, nota_revision, enviado_en, enviado_por, aprobado_en, aprobado_por")
          .eq("ciclo_id", ciclo ?? ""),
      ) ?? [],
  });
}

/** Secciones listas por instancia del ciclo (para el avance del tablero). */
export function useListas(ciclo: string | undefined, instancias: string[]) {
  return useQuery({
    queryKey: [...CLAVES.listas(ciclo ?? ""), instancias.length],
    enabled: Boolean(ciclo) && instancias.length > 0,
    retry: false,
    queryFn: async (): Promise<Map<string, number>> => {
      const conteo = new Map<string, number>();
      for (let i = 0; i < instancias.length; i += 200) {
        const filas =
          revisar<{ instancia_id: string }[] | null>(
            await supabase.from("informe_secciones").select("instancia_id").eq("listo", true).in("instancia_id", instancias.slice(i, i + 200)),
          ) ?? [];
        for (const f of filas) conteo.set(f.instancia_id, (conteo.get(f.instancia_id) ?? 0) + 1);
      }
      return conteo;
    },
  });
}

function invalidarCiclo(cliente: QueryClient, ciclo: string) {
  void cliente.invalidateQueries({ queryKey: CLAVES.instancias(ciclo) });
  void cliente.invalidateQueries({ queryKey: CLAVES.listas(ciclo) });
}

export function useAbrirInforme() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { ciclo: string; unidad: string; plantilla: Plantilla; destino?: string | null }): Promise<string> =>
      revisar<string>(await supabase.rpc("informe_abrir", { p_ciclo: p.ciclo, p_unit: p.unidad, p_plantilla: p.plantilla, p_destino: p.destino ?? null })),
    onSuccess: (_id, p) => invalidarCiclo(cliente, p.ciclo),
  });
}

/* ---------- Secciones y cifras -------------------------------------------------- */

export function useSecciones(instancia: string | undefined) {
  return useQuery({
    queryKey: CLAVES.secciones(instancia ?? ""),
    enabled: Boolean(instancia),
    retry: false,
    queryFn: async (): Promise<SeccionRow[]> =>
      revisar<SeccionRow[] | null>(await supabase.from("informe_secciones").select("instancia_id, clave, orden, contenido, listo").eq("instancia_id", instancia ?? "").order("orden")) ?? [],
  });
}

export function useGuardarSeccion(ciclo: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { instancia: string; clave: string; contenido: ContenidoSeccion; listo: boolean }): Promise<SeccionRow> =>
      revisar<SeccionRow>(await supabase.rpc("informe_guardar_seccion", { p_instancia: p.instancia, p_clave: p.clave, p_contenido: p.contenido, p_listo: p.listo })),
    onSuccess: (fila, p) => {
      cliente.setQueryData<SeccionRow[]>(CLAVES.secciones(p.instancia), (antes = []) => [...antes.filter((s) => s.clave !== p.clave), { ...fila, contenido: p.contenido, listo: p.listo }]);
      // Guardar en un informe devuelto lo pasa a borrador.
      invalidarCiclo(cliente, ciclo);
    },
  });
}

const COLS_CIFRA =
  "instancia_id, clave, etiqueta, seccion_clave, fuente_tipo, fuente_nombre, valor, unidad, meta, anterior, incluida, justificacion, propia, pilar, visto, foto_valor, foto_en, foto_fuente, consulta";

export function useCifras(instancia: string | undefined) {
  return useQuery({
    queryKey: CLAVES.cifras(instancia ?? ""),
    enabled: Boolean(instancia),
    retry: false,
    queryFn: async (): Promise<CifraRow[]> =>
      (revisar<CifraRow[] | null>(await supabase.from("informe_cifras").select(COLS_CIFRA).eq("instancia_id", instancia ?? "")) ?? []).map((c) => ({
        ...c,
        valor: aNumero(c.valor),
        meta: aNumero(c.meta),
        anterior: aNumero(c.anterior),
        visto: aNumero(c.visto),
        foto_valor: aNumero(c.foto_valor),
      })),
  });
}

/** Lo que se puede cambiar de una cifra (p_datos de informe_guardar_cifra). */
export type DatosCifra = Partial<
  Pick<CifraRow, "etiqueta" | "seccion_clave" | "fuente_tipo" | "fuente_nombre" | "valor" | "unidad" | "meta" | "anterior" | "incluida" | "justificacion" | "pilar" | "visto">
>;

export function useGuardarCifra(ciclo: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { instancia: string; clave: string; datos: DatosCifra }) =>
      revisar<CifraRow>(await supabase.rpc("informe_guardar_cifra", { p_instancia: p.instancia, p_clave: p.clave, p_datos: p.datos })),
    onMutate: (p) => {
      cliente.setQueryData<CifraRow[]>(CLAVES.cifras(p.instancia), (antes = []) => antes.map((c) => (c.clave === p.clave ? { ...c, ...p.datos } : c)));
    },
    onSettled: (_f, _e, p) => {
      void cliente.invalidateQueries({ queryKey: CLAVES.cifras(p.instancia) });
      void cliente.invalidateQueries({ queryKey: CLAVES.vivas(p.instancia) });
      invalidarCiclo(cliente, ciclo);
    },
  });
}

/** Crea de una vez las cifras de la plantilla que aún no tienen fila (para leerlas en vivo). */
export function useAsegurarCifras() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { instancia: string; faltan: { clave: string; datos: DatosCifra }[] }) => {
      for (const f of p.faltan) revisar(await supabase.rpc("informe_guardar_cifra", { p_instancia: p.instancia, p_clave: f.clave, p_datos: f.datos }));
    },
    onSuccess: (_x, p) => {
      void cliente.invalidateQueries({ queryKey: CLAVES.cifras(p.instancia) });
      void cliente.invalidateQueries({ queryKey: CLAVES.vivas(p.instancia) });
    },
  });
}

/** Pone al día las metas que vienen de los indicadores del programa (0165); solo programas y facultades. */
export function useSincronizarMetas() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (instancia: string): Promise<number> => Number(revisar<number>(await supabase.rpc("informe_metas_sincronizar", { p_instancia: instancia }))),
    onSuccess: (_n, instancia) => {
      void cliente.invalidateQueries({ queryKey: CLAVES.cifras(instancia) });
      void cliente.invalidateQueries({ queryKey: CLAVES.vivas(instancia) });
    },
  });
}

/** Quita un dato propio. */
export function useQuitarCifra() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { instancia: string; clave: string }) => {
      revisar(await supabase.from("informe_cifras").delete().eq("instancia_id", p.instancia).eq("clave", p.clave));
    },
    onSuccess: (_x, p) => void cliente.invalidateQueries({ queryKey: CLAVES.cifras(p.instancia) }),
  });
}

/** Cifras vivas del informe: la misma lectura que la foto al enviar. Se refresca cada minuto. */
export function useCifrasVivas(instancia: string | undefined, activo: boolean) {
  return useQuery({
    queryKey: CLAVES.vivas(instancia ?? ""),
    enabled: Boolean(instancia) && activo,
    retry: false,
    staleTime: 30_000,
    refetchInterval: activo ? 60_000 : false,
    queryFn: async (): Promise<Record<string, LecturaViva>> => {
      const filas = revisar<{ clave: string; valor: unknown; fuente: string | null; corte: string | null }[] | null>(await supabase.rpc("informe_cifras_vivas", { p_instancia: instancia })) ?? [];
      const salida: Record<string, LecturaViva> = {};
      for (const f of filas) salida[f.clave] = { valor: aNumero(f.valor), fuente: f.fuente ?? "", corte: f.corte };
      return salida;
    },
  });
}

export function useFuentes() {
  return useQuery({
    queryKey: CLAVES.fuentes,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FuenteRow[]> =>
      revisar<FuenteRow[] | null>(await supabase.from("informe_fuentes").select("clave, nombre, tipo, consulta, activa").eq("activa", true)) ?? [],
  });
}

/** El plan de trabajo de la facultad de la unidad (API del plan, por la función informe-plan). */
export function usePlanUnidad(unitId: string | undefined, activo: boolean) {
  return useQuery({
    queryKey: ["informes", "plan", unitId ?? ""],
    enabled: activo && Boolean(unitId),
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<RespuestaPlan> => {
      const r = await supabase.functions.invoke("informe-plan", { body: { unit_id: unitId } });
      if (r.error) {
        const ctx = (r.error as { context?: Response }).context;
        let mensaje = r.error.message;
        try {
          const j = ctx ? ((await ctx.json()) as { error?: string }) : null;
          if (j?.error) mensaje = j.error;
        } catch {
          // Sin cuerpo JSON: queda el mensaje del cliente.
        }
        throw new Error(mensaje);
      }
      return r.data as RespuestaPlan;
    },
  });
}

export function usePilares() {
  return useQuery({
    queryKey: CLAVES.pilares,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PilarRef[]> => {
      const p = revisar<{ id: string; numeral: string; name: string }[] | null>(await supabase.from("pillars").select("id, numeral, name").order("position")) ?? [];
      const avance = await supabase.from("v_pillar_progress").select("pillar_id, progress");
      const mapa = new Map(((avance.data as { pillar_id: string; progress: number }[] | null) ?? []).map((a) => [a.pillar_id, a.progress]));
      return p.map((x) => ({ ...x, progress: mapa.get(x.id) ?? null }));
    },
  });
}

/* ---------- Anexos (bucket informe-anexos) --------------------------------------- */

export function useAnexos(instancia: string | undefined) {
  return useQuery({
    queryKey: CLAVES.anexos(instancia ?? ""),
    enabled: Boolean(instancia),
    retry: false,
    queryFn: async (): Promise<AnexoRow[]> =>
      revisar<AnexoRow[] | null>(
        await supabase.from("informe_anexos").select("id, instancia_id, n, nombre, tipo, ruta, descripcion, created_at").eq("instancia_id", instancia ?? "").order("n"),
      ) ?? [],
  });
}

const siguienteN = (anexos: AnexoRow[]) => anexos.reduce((m, a) => Math.max(m, a.n), 0) + 1;

export function useSubirAnexo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { instancia: InstanciaRow; archivo: File; anexos: AnexoRow[] }): Promise<AnexoRow> => {
      if (p.archivo.size > MAX_ANEXO) throw new Error(`«${p.archivo.name}» pesa más de 15 MB.`);
      const ruta = `${p.instancia.unit_id}/${p.instancia.id}/${Date.now()}-${nombreSeguro(p.archivo.name)}`;
      const subida = await supabase.storage.from(BUCKET).upload(ruta, p.archivo, { contentType: p.archivo.type || undefined, upsert: false });
      if (subida.error) throw new Error(`No se pudo subir «${p.archivo.name}»: ${subida.error.message}`);
      const fila = await supabase
        .from("informe_anexos")
        .insert({ instancia_id: p.instancia.id, n: siguienteN(p.anexos), nombre: p.archivo.name, tipo: "archivo", ruta, descripcion: "" })
        .select("id, instancia_id, n, nombre, tipo, ruta, descripcion, created_at")
        .single();
      if (fila.error) {
        await supabase.storage.from(BUCKET).remove([ruta]);
        throw errorDe(fila.error);
      }
      return fila.data as AnexoRow;
    },
    onSuccess: (_f, p) => void cliente.invalidateQueries({ queryKey: CLAVES.anexos(p.instancia.id) }),
  });
}

export function useAgregarEnlace() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { instancia: string; url: string; nombre: string; anexos: AnexoRow[] }) => {
      if (!/^https:\/\/\S+$/i.test(p.url)) throw new Error("Escriba una dirección completa que empiece por https://");
      revisar(await supabase.from("informe_anexos").insert({ instancia_id: p.instancia, n: siguienteN(p.anexos), nombre: p.nombre.trim() || p.url, tipo: "url", ruta: p.url, descripcion: "" }));
    },
    onSuccess: (_x, p) => void cliente.invalidateQueries({ queryKey: CLAVES.anexos(p.instancia) }),
  });
}

export function useQuitarAnexo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: AnexoRow) => {
      revisar(await supabase.from("informe_anexos").delete().eq("id", a.id));
      if (a.tipo === "archivo") await supabase.storage.from(BUCKET).remove([a.ruta]);
    },
    onSuccess: (_x, a) => void cliente.invalidateQueries({ queryKey: CLAVES.anexos(a.instancia_id) }),
  });
}

/** Dirección temporal (10 minutos) para abrir un anexo del bucket privado. */
export async function urlAnexo(a: AnexoRow): Promise<string> {
  if (a.tipo === "url") return a.ruta;
  const r = await supabase.storage.from(BUCKET).createSignedUrl(a.ruta, 600);
  if (r.error || !r.data) throw new Error("No se pudo abrir el anexo.");
  return r.data.signedUrl;
}

/* ---------- Estados ------------------------------------------------------------- */

export function useEnviar() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (i: InstanciaRow): Promise<InstanciaRow> => revisar<InstanciaRow>(await supabase.rpc("informe_enviar", { p_instancia: i.id })),
    onSuccess: (fila) => {
      invalidarCiclo(cliente, fila.ciclo_id);
      void cliente.invalidateQueries({ queryKey: CLAVES.cifras(fila.id) });
    },
  });
}

export interface ResultadoRevision {
  fila: InstanciaRow;
  /** Al aprobar: qué pasó con el aprendizaje de Pilo (nulo si salió bien). */
  avisoPilo: string | null;
}

/**
 * Planeación aprueba o devuelve (con nota). Al aprobar, Pilo copia lo aprobado
 * a su corpus (`aprender`); si la función falla, la aprobación queda y se avisa.
 */
export function useRevisar() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      instancia: InstanciaRow;
      a: Extract<EstadoInstancia, "ok" | "back" | "draft">;
      nota?: string;
      /** Notas ancladas a secciones: quedan además como filas propias en informe_revisiones. */
      porSeccion?: { clave: string; nota: string }[];
    }): Promise<ResultadoRevision> => {
      if (p.a === "back" && !p.nota?.trim()) throw new Error("Escriba una nota para la unidad antes de devolver.");
      const fila = revisar<InstanciaRow>(await supabase.rpc("informe_cambiar_estado", { p_instancia: p.instancia.id, p_a: p.a, p_nota: p.nota?.trim().slice(0, 4000) || null }));
      const secciones = (p.porSeccion ?? []).filter((s) => s.nota.trim());
      if (p.a === "back" && secciones.length) {
        revisar(await supabase.from("informe_revisiones").insert(secciones.map((s) => ({ instancia_id: p.instancia.id, seccion_clave: s.clave, decision: "devuelto", nota: s.nota.trim() }))));
      }
      let avisoPilo: string | null = null;
      if (p.a === "ok") {
        try {
          await piloAprender(p.instancia.id);
        } catch (e) {
          avisoPilo = e instanceof Error ? e.message : "Pilo no pudo aprender de este informe.";
        }
      }
      return { fila, avisoPilo };
    },
    onSuccess: ({ fila }) => {
      invalidarCiclo(cliente, fila.ciclo_id);
      void cliente.invalidateQueries({ queryKey: CLAVES.cifras(fila.id) });
      void cliente.invalidateQueries({ queryKey: CLAVES.corpus });
    },
  });
}

/* ---------- Pilo (función pilo-informes) ---------------------------------------- */

export class ErrorPilo extends Error {}

async function pilo<T>(body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke(FUNCION, { body });
  if (r.error) {
    const ctx = (r.error as { context?: Response }).context;
    let mensaje = r.error.message;
    try {
      const j = ctx ? ((await ctx.json()) as { error?: string; code?: string }) : null;
      if (j?.code === "migracion") throw new FaltaMigracion(j.error || "Falta aplicar la migración 0153.");
      if (j?.error) mensaje = j.error;
    } catch (e) {
      if (e instanceof FaltaMigracion) throw e;
    }
    if (!ctx && /failed to send|fetch/i.test(mensaje)) mensaje = `No se pudo llegar a la función ${FUNCION}: ¿está desplegada?`;
    throw new ErrorPilo(mensaje);
  }
  return r.data as T;
}

export interface RedaccionPilo {
  texto: string;
  usadas?: { clave: string; etiqueta: string }[];
  ejemplos_usados?: { origen: string; anio: number; plantilla: string | null; unidad_nombre: string; titulo: string }[];
  avisos?: string[];
}

export const piloRedactar = (instancia_id: string, seccion_clave: string, instruccion?: string) =>
  pilo<RedaccionPilo>({ action: "redactar", instancia_id, seccion_clave, ...(instruccion?.trim() ? { instruccion: instruccion.trim() } : {}) });

export const piloAprender = (instancia_id: string) => pilo<Record<string, unknown>>({ action: "aprender", instancia_id });

export interface ArchivoParaPilo {
  nombre: string;
  unidad?: string;
  secciones: { titulo: string; texto: string }[];
}

export interface RespuestaIngesta {
  nuevos: number;
  duplicados: number;
  secciones: number;
  descartados?: { archivo: string; titulo: string; motivo: string }[];
}

export const piloIngerir = (anio: number, archivos: ArchivoParaPilo[], plantilla?: Plantilla | null) =>
  pilo<RespuestaIngesta>({ action: "ingerir", anio, ...(plantilla ? { plantilla } : {}), archivos });

export interface PerfilEstilo {
  tipo: string;
  textos: number;
  mediana_palabras: number;
  aperturas: { texto: string; veces: number }[];
  conectores: { texto: string; veces: number }[];
  frases: { texto: string; veces: number }[];
}

/** Lo que Pilo aprendió (`corpus`): conteos y perfil de estilo por tipo de sección. */
export interface Corpus {
  total: number;
  por_origen?: Record<string, number>;
  por_plantilla?: Record<string, number>;
  por_tipo?: Record<string, number>;
  perfiles?: PerfilEstilo[];
}

export function useCorpus(activo: boolean) {
  return useQuery({
    queryKey: CLAVES.corpus,
    enabled: activo,
    retry: false,
    staleTime: 60_000,
    queryFn: () => pilo<Corpus>({ action: "corpus" }),
  });
}
