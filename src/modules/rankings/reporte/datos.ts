/* =============================================================================
   Datos del reporte por oficinas (THE Impact, migración 0149).

   Consultas (TanStack Query) y mutaciones contra Supabase (0149, y 0150 para
   «quién aportó» y la respuesta oficial). Cada una respeta
   las reglas de estados.ts antes de escribir; la base vuelve a comprobarlas
   (disparador ranking_responses_guard y las políticas RLS). Si las tablas no
   existen (migración sin aplicar), la consulta falla con FaltaMigracion y la
   pantalla lo dice, como hace el recolector de noticias.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { RankingAporteRow, RankingAssignmentRow, RankingCycleRow, RankingEvidenceRow, RankingIndicatorRow, RankingResponseRow } from "../../../types/database";
import type { RankingEvidenceExt } from "../../../types/database";
import { FaltaMigracion } from "../noticias";
import { analizarEvidencia } from "./analisis-evidencia";
import type { CatalogoExcel } from "./catalogo-excel";
import { caminoEstados } from "./diligenciado-excel";
import type { PlanImportacion } from "./diligenciado-excel";
import type { Membresia } from "./envio";
import { transicionPermitida } from "./estados";

/** Evidencia con lo de 0152: `biblioteca` y la clase «nota». */
export type EvidenciaReporte = RankingEvidenceExt;
import type { Chequeo, Indicador, RolActor } from "./tipos";

export const RANKING_THE = "the-impact";
export const ODS_PRIORIZADOS = [4, 5, 10, 17];
/**
 * Edición y año de datos por omisión al importar un Excel sin ciclo abierto: los de la metodología vigente
 * («Sustainability Impact Ratings 2027», v1.1: datos del año académico 2025). Antes eran 2026 y 2024 fijos, y
 * la pantalla mostraba siempre ese ciclo. Ahora los ciclos se crean y se eligen en la sección «Inicio de ciclo» / «Nuevo
 * ciclo» (thimpact, migración 0237); estos valores solo quedan como último recurso de la importación.
 */
export const ANIO_EDICION = 2027;
const ANIO_DATOS = 2025;
const BUCKET = "ranking-evidencias";
const CLAVE_RESPUESTA = "ciclo,indicador,unidad";
const PAGINA = 1000;

interface ErrorBase {
  code?: string;
  message?: string;
}

const noExiste = (e: ErrorBase) => Boolean(e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
/** Columna o función de 0150 que todavía no está (oficial, ranking_aportes, ranking_marcar_oficial). */
const falta0150 = (e: ErrorBase) =>
  ["42703", "42883", "PGRST202", "PGRST204"].includes(e.code ?? "") && /oficial|ranking_aportes|ranking_marcar_oficial/i.test(e.message ?? "");

/** Error legible de Supabase; si faltan las tablas o las funciones, el aviso de migración. */
export function errorDe(e: ErrorBase): Error {
  if (falta0150(e)) return new FaltaMigracion("Falta aplicar la migración 0150 (catálogo abierto del reporte).");
  return noExiste(e) ? new FaltaMigracion("Falta aplicar la migración 0149 (reporte por oficinas).") : new Error(e.message ?? "Error de la base de datos");
}

/** Lee todas las filas de una consulta paginada (PostgREST devuelve 1000 como máximo). */
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

/** Nombre de oficina comparable: sin acentos, minúsculas, espacios colapsados. */
export function claveNombre(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const aIndicador = (f: RankingIndicatorRow): Indicador => ({
  id: f.id,
  ods: f.ods,
  nivel: f.nivel,
  padre: f.padre,
  tipo: f.tipo,
  texto_en: f.texto_en,
  texto_es: f.texto_es,
  peso: f.peso,
  prioridad: f.prioridad,
  tipo_requerimiento: f.tipo_requerimiento,
  orden: f.orden,
});

export const CLAVES = {
  ciclo: ["reporte", "ciclo"] as const,
  catalogo: (ciclo: string) => ["reporte", "catalogo", ciclo] as const,
  asignaciones: (ciclo: string) => ["reporte", "asignaciones", ciclo] as const,
  respuestas: (ciclo: string) => ["reporte", "respuestas", ciclo] as const,
  aportes: (ciclo: string) => ["reporte", "aportes", ciclo] as const,
  evidencias: (respuesta: string) => ["reporte", "evidencias", respuesta] as const,
  unidades: ["reporte", "unidades"] as const,
  membresias: (perfil: string) => ["reporte", "membresias", perfil] as const,
};

/* ---------- Lecturas ---------------------------------------------------------- */

/** Todos los ciclos de THE Impact, el de año más alto primero. */
async function leerCiclos(): Promise<RankingCycleRow[]> {
  const r = await supabase
    .from("ranking_cycles")
    .select("id, ranking, anio, anio_datos, ods_priorizados, fecha_limite, estado")
    .eq("ranking", RANKING_THE)
    .order("anio", { ascending: false });
  if (r.error) throw errorDe(r.error);
  return (r.data as RankingCycleRow[] | null) ?? [];
}

/** El ciclo pedido (`?ciclo=`); si no, el abierto de año más alto; si no hay abierto, el más reciente. */
export function elegirCiclo(lista: RankingCycleRow[], pedido: string | null): RankingCycleRow | null {
  return lista.find((c) => c.id === pedido) ?? lista.find((c) => c.estado === "abierto") ?? lista[0] ?? null;
}

/** La lista de ciclos de THE Impact (para el selector). Comparte caché con useCicloReporte. */
export function useCiclosReporte() {
  return useQuery({ queryKey: CLAVES.ciclo, retry: false, staleTime: 30_000, queryFn: leerCiclos });
}

/** El ciclo con el que se trabaja: el de `?ciclo=` en la dirección o, si no, el abierto; nulo si aún no hay ninguno. */
export function useCicloReporte() {
  const [params] = useSearchParams();
  const pedido = params.get("ciclo");
  return useQuery({
    queryKey: CLAVES.ciclo,
    retry: false,
    staleTime: 30_000,
    queryFn: leerCiclos,
    select: (lista): RankingCycleRow | null => elegirCiclo(lista, pedido),
  });
}

export function useCatalogoReporte(ciclo: string | undefined) {
  return useQuery({
    queryKey: CLAVES.catalogo(ciclo ?? ""),
    enabled: Boolean(ciclo),
    retry: false,
    queryFn: async (): Promise<Indicador[]> => {
      const filas = await todasLas<RankingIndicatorRow>((d, h) =>
        supabase
          .from("ranking_indicators")
          .select("ciclo, id, ods, nivel, padre, tipo, texto_en, texto_es, peso, prioridad, tipo_requerimiento, orden")
          .eq("ciclo", ciclo ?? "")
          .order("ods")
          .order("orden")
          .range(d, h),
      );
      return filas.map(aIndicador);
    },
  });
}

export function useAsignacionesReporte(ciclo: string | undefined) {
  return useQuery({
    queryKey: CLAVES.asignaciones(ciclo ?? ""),
    enabled: Boolean(ciclo),
    retry: false,
    queryFn: () =>
      todasLas<RankingAssignmentRow>((d, h) =>
        supabase.from("ranking_assignments").select("ciclo, indicador, unidad, rol").eq("ciclo", ciclo ?? "").range(d, h),
      ),
  });
}

export function useRespuestasReporte(ciclo: string | undefined) {
  return useQuery({
    queryKey: CLAVES.respuestas(ciclo ?? ""),
    enabled: Boolean(ciclo),
    retry: false,
    queryFn: () =>
      todasLas<RankingResponseRow>((d, h) =>
        supabase
          .from("ranking_responses")
          .select("id, ciclo, indicador, unidad, valores, si_no, estado, comentario_es, comentario_en, nota_revision, oficial, updated_by, updated_at")
          .eq("ciclo", ciclo ?? "")
          .range(d, h),
      ),
  });
}

/**
 * Quién aportó a cada indicador del ciclo, de cualquier oficina, sin el contenido
 * (RPC ranking_aportes, 0150). Las oficinas solo leen sus propias respuestas; esto
 * les dice cuántas oficinas más aportaron y cuáles.
 */
export function useAportesReporte(ciclo: string | undefined) {
  return useQuery({
    queryKey: CLAVES.aportes(ciclo ?? ""),
    enabled: Boolean(ciclo),
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<RankingAporteRow[]> => {
      const r = await supabase.rpc("ranking_aportes", { p_ciclo: ciclo });
      if (r.error) throw errorDe(r.error);
      return (r.data as RankingAporteRow[] | null) ?? [];
    },
  });
}

/**
 * Evidencias de una respuesta (las que la persona puede ver por RLS). Con «*»:
 * si 0152 está aplicada llega también `biblioteca` (y las notas); si no, igual funciona.
 */
export function useEvidenciasReporte(respuesta: string | undefined) {
  return useQuery({
    queryKey: CLAVES.evidencias(respuesta ?? ""),
    enabled: Boolean(respuesta),
    retry: false,
    queryFn: async (): Promise<EvidenciaReporte[]> => {
      const r = await supabase.from("ranking_evidence").select("*").eq("response_id", respuesta ?? "").order("created_at", { ascending: true });
      if (r.error) throw errorDe(r.error);
      return ((r.data as EvidenciaReporte[] | null) ?? []).map((e) => ({ ...e, biblioteca: e.biblioteca ?? null }));
    },
  });
}

/** ¿Cuenta como evidencia para enviar y para los puntos? Las notas (0152) no. */
export const esEvidenciaReal = (e: { kind: string }) => e.kind !== "nota";

export interface UnidadRef {
  id: string;
  name: string;
  kind: string;
  code: string | null;
}

export function useUnidadesReporte() {
  return useQuery({
    queryKey: CLAVES.unidades,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<UnidadRef[]> => {
      const r = await supabase.from("units").select("id, name, kind, code").order("position");
      if (r.error) throw errorDe(r.error);
      return (r.data as UnidadRef[] | null) ?? [];
    },
  });
}

/** Las oficinas a las que pertenece la persona, con su función. */
export function useMembresiasPropias(perfil: string | undefined) {
  return useQuery({
    queryKey: CLAVES.membresias(perfil ?? ""),
    enabled: Boolean(perfil),
    retry: false,
    queryFn: async (): Promise<Membresia[]> => {
      const r = await supabase.from("unit_members").select("unit_id, role, units(name)").eq("profile_id", perfil ?? "");
      if (r.error) throw errorDe(r.error);
      const filas = (r.data as { unit_id: string; role: Membresia["rol"]; units: { name: string } | { name: string }[] | null }[] | null) ?? [];
      return filas.map((f) => ({
        unidad: f.unit_id,
        rol: f.role,
        nombre: (Array.isArray(f.units) ? f.units[0]?.name : f.units?.name) ?? "Oficina",
      }));
    },
  });
}

/* ---------- Escrituras -------------------------------------------------------- */

function invalidarCiclo(cliente: QueryClient, ciclo: string) {
  void cliente.invalidateQueries({ queryKey: CLAVES.respuestas(ciclo) });
  void cliente.invalidateQueries({ queryKey: CLAVES.aportes(ciclo) });
  void cliente.invalidateQueries({ queryKey: CLAVES.asignaciones(ciclo) });
}

/** Asegura que exista la respuesta de la oficina a este indicador (en «Sin empezar»), sugerido o no. */
export function useAsegurarRespuesta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ ciclo, indicador, unidad }: { ciclo: string; indicador: string; unidad: string }): Promise<RankingResponseRow> => {
      const up = await supabase.from("ranking_responses").upsert({ ciclo, indicador, unidad }, { onConflict: CLAVE_RESPUESTA, ignoreDuplicates: true });
      if (up.error) throw errorDe(up.error);
      const r = await supabase.from("ranking_responses").select("*").eq("ciclo", ciclo).eq("indicador", indicador).eq("unidad", unidad).maybeSingle();
      if (r.error) throw errorDe(r.error);
      if (!r.data) throw new Error("No se pudo abrir la respuesta. Revise que su función en la oficina permita aportar.");
      return r.data as RankingResponseRow;
    },
    onSuccess: (fila) => invalidarCiclo(cliente, fila.ciclo),
  });
}

/** Guarda cifras, sí/no y comentarios. Una respuesta nueva o devuelta pasa a borrador. */
export function useGuardarRespuesta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      respuesta: RankingResponseRow;
      valores: Record<string, number | null>;
      siNo: boolean | null;
      comentarioEs: string;
      comentarioEn: string;
      /** Planeación puede corregir una enviada o aprobada sin cambiarle el estado. */
      actor?: RolActor | null;
    }): Promise<RankingResponseRow> => {
      const estado = p.respuesta.estado === "none" || p.respuesta.estado === "back" ? "draft" : p.respuesta.estado;
      if ((estado === "sent" || estado === "ok") && p.actor !== "planeacion") throw new Error("La respuesta ya se envió: solo Planeación la puede cambiar.");
      const r = await supabase
        .from("ranking_responses")
        .update({ valores: p.valores, si_no: p.siNo, comentario_es: p.comentarioEs, comentario_en: p.comentarioEn, estado })
        .eq("id", p.respuesta.id)
        .select("*")
        .single();
      if (r.error) throw errorDe(r.error);
      return r.data as RankingResponseRow;
    },
    onSuccess: (fila) => invalidarCiclo(cliente, fila.ciclo),
  });
}

/** Envío a Planeación (draft → sent). Lo vuelve a comprobar la base. */
export function useEnviarRespuesta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ respuesta, actor }: { respuesta: RankingResponseRow; actor: RolActor | null }): Promise<RankingResponseRow> => {
      if (!transicionPermitida(respuesta.estado, "sent", actor)) throw new Error("Esta respuesta no se puede enviar desde su estado actual.");
      const r = await supabase.from("ranking_responses").update({ estado: "sent" }).eq("id", respuesta.id).select("*").single();
      if (r.error) throw errorDe(r.error);
      return r.data as RankingResponseRow;
    },
    onSuccess: (fila) => invalidarCiclo(cliente, fila.ciclo),
  });
}

/** Aprobar (sent → ok) o devolver (sent → back, con nota). Solo Planeación. */
export function useRevisarRespuesta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ respuesta, a, nota, actor }: { respuesta: RankingResponseRow; a: "ok" | "back"; nota: string; actor: RolActor | null }): Promise<RankingResponseRow> => {
      if (!transicionPermitida(respuesta.estado, a, actor)) throw new Error("Solo Planeación aprueba o devuelve una respuesta enviada.");
      if (a === "back" && !nota.trim()) throw new Error("Escriba una nota para la oficina antes de devolver.");
      const r = await supabase
        .from("ranking_responses")
        .update({ estado: a, nota_revision: a === "back" ? nota.trim() : "" })
        .eq("id", respuesta.id)
        .select("*")
        .single();
      if (r.error) throw errorDe(r.error);
      return r.data as RankingResponseRow;
    },
    onSuccess: (fila) => invalidarCiclo(cliente, fila.ciclo),
  });
}

/**
 * Planeación reporta y aprueba en un paso: recorre los estados que le permite el
 * flujo (none → draft → sent → ok, back → draft → sent → ok). Cada paso lo vuelve
 * a comprobar el disparador de la base.
 */
export function useAprobarDirecto() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ respuesta, actor }: { respuesta: RankingResponseRow; actor: RolActor | null }): Promise<RankingResponseRow> => {
      if (actor !== "planeacion") throw new Error("Solo Planeación aprueba.");
      let fila = respuesta;
      for (const a of caminoEstados(respuesta.estado, "ok")) {
        const r = await supabase.from("ranking_responses").update({ estado: a, nota_revision: "" }).eq("id", fila.id).select("*").single();
        if (r.error) throw errorDe(r.error);
        fila = r.data as RankingResponseRow;
      }
      return fila;
    },
    onSuccess: (fila) => invalidarCiclo(cliente, fila.ciclo),
  });
}

/** Marca una respuesta aprobada como la oficial de su indicador y desmarca las demás (0150). Solo Planeación. */
export function useMarcarOficial() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ respuesta, actor }: { respuesta: RankingResponseRow; actor: RolActor | null }): Promise<{ ciclo: string }> => {
      if (actor !== "planeacion") throw new Error("Solo Planeación marca la respuesta oficial.");
      if (respuesta.estado !== "ok") throw new Error("Primero apruebe la respuesta; solo una aprobada puede ser la oficial.");
      const r = await supabase.rpc("ranking_marcar_oficial", { resp: respuesta.id });
      if (r.error) throw errorDe(r.error);
      return { ciclo: respuesta.ciclo };
    },
    onSuccess: ({ ciclo }) => invalidarCiclo(cliente, ciclo),
  });
}

/** Nombre de archivo seguro para la ruta del bucket. */
export function nombreSeguro(nombre: string): string {
  const limpio = nombre.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+/, "");
  return (limpio || "archivo").slice(0, 120);
}

/** Sube un archivo al bucket privado y registra su fila. Si el registro falla, borra el archivo. */
export function useSubirEvidencia() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ respuesta, archivo, analisis }: { respuesta: RankingResponseRow; archivo: File; analisis: Chequeo[] }): Promise<RankingEvidenceRow> => {
      const ruta = `${respuesta.unidad}/${respuesta.id}/${Date.now()}-${nombreSeguro(archivo.name)}`;
      const subida = await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false });
      if (subida.error) throw new Error(`No se pudo subir «${archivo.name}»: ${subida.error.message}`);
      const fila = await supabase
        .from("ranking_evidence")
        .insert({
          response_id: respuesta.id,
          kind: "file",
          storage_path: ruta,
          nombre: archivo.name,
          mime: archivo.type || null,
          tamano: archivo.size,
          publica: false,
          analisis,
          optimizada: false,
        })
        .select("*")
        .single();
      if (fila.error) {
        await supabase.storage.from(BUCKET).remove([ruta]);
        throw errorDe(fila.error);
      }
      return fila.data as RankingEvidenceRow;
    },
    onSuccess: (_fila, v) => void cliente.invalidateQueries({ queryKey: CLAVES.evidencias(v.respuesta.id) }),
  });
}

/** Agrega un enlace público (https). Es evidencia pública: vale más y va primero. */
export function useAgregarEnlace() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ respuesta, url, analisis }: { respuesta: RankingResponseRow; url: string; analisis: Chequeo[] }): Promise<RankingEvidenceRow> => {
      const r = await supabase
        .from("ranking_evidence")
        .insert({ response_id: respuesta.id, kind: "url", url, nombre: "", publica: true, analisis, optimizada: false })
        .select("*")
        .single();
      if (r.error) throw errorDe(r.error);
      return r.data as RankingEvidenceRow;
    },
    onSuccess: (_fila, v) => void cliente.invalidateQueries({ queryKey: CLAVES.evidencias(v.respuesta.id) }),
  });
}

/** Quita una evidencia y, si era archivo, también el objeto del bucket. */
export function useQuitarEvidencia() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ evidencia }: { evidencia: RankingEvidenceRow | EvidenciaReporte }) => {
      const r = await supabase.from("ranking_evidence").delete().eq("id", evidencia.id);
      if (r.error) throw errorDe(r.error);
      // Un archivo de la biblioteca sigue en la biblioteca: solo se quita el enlace.
      const deBiblioteca = "biblioteca" in evidencia && evidencia.biblioteca;
      if (evidencia.storage_path && !deBiblioteca) await supabase.storage.from(BUCKET).remove([evidencia.storage_path]);
    },
    onSuccess: (_x, v) => void cliente.invalidateQueries({ queryKey: CLAVES.evidencias(v.evidencia.response_id) }),
  });
}

/**
 * Fija el responsable y las oficinas de apoyo sugeridos de un indicador, y crea su
 * respuesta (en «Sin empezar»). Es solo una sugerencia: cualquier oficina puede
 * aportar a cualquier indicador. Solo Planeación.
 */
export function useAsignarIndicador() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ ciclo, indicador, principal, apoyo }: { ciclo: string; indicador: string; principal: string | null; apoyo: string[] }) => {
      const borra = await supabase.from("ranking_assignments").delete().eq("ciclo", ciclo).eq("indicador", indicador);
      if (borra.error) throw errorDe(borra.error);
      const filas = [
        ...(principal ? [{ ciclo, indicador, unidad: principal, rol: "principal" }] : []),
        ...[...new Set(apoyo)].filter((u) => u !== principal).map((u) => ({ ciclo, indicador, unidad: u, rol: "apoyo" })),
      ];
      if (filas.length) {
        const ins = await supabase.from("ranking_assignments").insert(filas);
        if (ins.error) throw errorDe(ins.error);
        const respuestas = filas.map((f) => ({ ciclo, indicador, unidad: f.unidad }));
        const up = await supabase.from("ranking_responses").upsert(respuestas, { onConflict: CLAVE_RESPUESTA, ignoreDuplicates: true });
        if (up.error) throw errorDe(up.error);
      }
      return { ciclo };
    },
    onSuccess: ({ ciclo }) => invalidarCiclo(cliente, ciclo),
  });
}

export interface ResultadoImportacion {
  cicloId: string;
  indicadores: number;
  asignaciones: number;
}

/**
 * Guarda el catálogo leído del Excel. Crea el ciclo si no existe, marca los ODS
 * priorizados y asigna la oficina principal que dice el Excel, solo a los
 * indicadores que todavía no tienen una (así no se pisa lo que Planeación cambió).
 */
export function useImportarCatalogo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      catalogo: CatalogoExcel;
      cicloExistente: RankingCycleRow | null;
      unidadesPorNombre: Map<string, string>;
      indicadoresConPrincipal: Set<string>;
      /** Año de la edición que eligió Planeación (por defecto, el del ciclo existente o 2026). */
      anio?: number;
      anioDatos?: number;
    }): Promise<ResultadoImportacion> => {
      const anio = p.anio ?? p.cicloExistente?.anio ?? ANIO_EDICION;
      // Otro año que el del ciclo abierto: se crea (o se usa) el ciclo de ese año.
      let cicloId = p.cicloExistente && p.cicloExistente.anio === anio ? p.cicloExistente.id : undefined;
      if (!cicloId && p.anio !== undefined) {
        const r = await supabase
          .from("ranking_cycles")
          .upsert({ ranking: RANKING_THE, anio, anio_datos: p.anioDatos ?? anio - 2, ods_priorizados: ODS_PRIORIZADOS }, { onConflict: "ranking,anio" })
          .select("id")
          .single();
        if (r.error) throw errorDe(r.error);
        cicloId = (r.data as { id: string }).id;
      } else if (cicloId) {
        const r = await supabase.from("ranking_cycles").update({ ods_priorizados: ODS_PRIORIZADOS, ...(p.anioDatos ? { anio_datos: p.anioDatos } : {}) }).eq("id", cicloId);
        if (r.error) throw errorDe(r.error);
      } else {
        const r = await supabase
          .from("ranking_cycles")
          .upsert({ ranking: RANKING_THE, anio: ANIO_EDICION, anio_datos: ANIO_DATOS, ods_priorizados: ODS_PRIORIZADOS }, { onConflict: "ranking,anio" })
          .select("id")
          .single();
        if (r.error) throw errorDe(r.error);
        cicloId = (r.data as { id: string }).id;
      }
      const ciclo: string = cicloId;

      const filas = p.catalogo.filas.map((f) => ({
        ciclo,
        id: f.id,
        ods: f.ods,
        nivel: f.nivel,
        padre: f.padre,
        tipo: f.tipo,
        texto_en: f.texto_en,
        texto_es: f.texto_es,
        peso: f.peso,
        prioridad: f.prioridad,
        tipo_requerimiento: f.tipo_requerimiento,
        orden: f.orden,
      }));
      for (let i = 0; i < filas.length; i += 300) {
        const up = await supabase.from("ranking_indicators").upsert(filas.slice(i, i + 300), { onConflict: "ciclo,id" });
        if (up.error) throw errorDe(up.error);
      }

      const asignaciones: { ciclo: string; indicador: string; unidad: string; rol: string }[] = [];
      for (const f of p.catalogo.filas) {
        if (f.nivel !== "indicator" || p.indicadoresConPrincipal.has(f.id)) continue;
        const principal = f.responsables.map((n) => p.unidadesPorNombre.get(claveNombre(n))).find((u): u is string => Boolean(u));
        if (principal) asignaciones.push({ ciclo, indicador: f.id, unidad: principal, rol: "principal" });
        for (const n of f.apoyo) {
          const u = p.unidadesPorNombre.get(claveNombre(n));
          if (u && u !== principal && !asignaciones.some((a) => a.indicador === f.id && a.unidad === u)) {
            asignaciones.push({ ciclo, indicador: f.id, unidad: u, rol: "apoyo" });
          }
        }
      }
      for (let i = 0; i < asignaciones.length; i += 300) {
        const ins = await supabase.from("ranking_assignments").upsert(asignaciones.slice(i, i + 300), { onConflict: "ciclo,indicador,unidad", ignoreDuplicates: true });
        if (ins.error) throw errorDe(ins.error);
      }
      return { cicloId: ciclo, indicadores: filas.length, asignaciones: asignaciones.length };
    },
    onSuccess: (r) => {
      void cliente.invalidateQueries({ queryKey: CLAVES.ciclo });
      void cliente.invalidateQueries({ queryKey: CLAVES.catalogo(r.cicloId) });
      invalidarCiclo(cliente, r.cicloId);
    },
  });
}

/* ---------- Excel diligenciado ------------------------------------------------- */

export interface ResultadoDiligenciado {
  creadas: number;
  actualizadas: number;
  evidencias: number;
  errores: string[];
}

/**
 * Aplica el plan del Excel diligenciado como la oficina `unidad` (Planeación
 * Institucional u otra). Una respuesta por indicador: crea o actualiza, recorre
 * los estados hasta borrador o aprobada y agrega solo las evidencias nuevas.
 * Un indicador que falla no detiene a los demás: su error vuelve en la lista.
 */
export function useImportarDiligenciado() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ ciclo, unidad, plan }: { ciclo: string; unidad: string; plan: PlanImportacion }): Promise<ResultadoDiligenciado> => {
      const res: ResultadoDiligenciado = { creadas: 0, actualizadas: 0, evidencias: 0, errores: [] };
      for (const a of plan.acciones) {
        try {
          let id = a.respuestaId;
          const datos = { valores: a.valores, si_no: a.siNo, comentario_es: a.comentario };
          if (!id) {
            const r = await supabase
              .from("ranking_responses")
              .insert({ ciclo, indicador: a.indicador, unidad, ...datos, estado: a.pasos[a.pasos.length - 1] ?? "draft" })
              .select("id")
              .single();
            if (r.error) throw errorDe(r.error);
            id = (r.data as { id: string }).id;
            res.creadas++;
          } else {
            const previa = await supabase.from("ranking_responses").select("comentario_es").eq("id", id).single();
            const cambia = !previa.error && (previa.data as { comentario_es: string }).comentario_es !== a.comentario;
            const r = await supabase.from("ranking_responses").update({ ...datos, ...(cambia ? { comentario_en: "" } : {}) }).eq("id", id);
            if (r.error) throw errorDe(r.error);
            for (const estado of a.pasos) {
              const nota = estado === "back" ? "Reabierta por la importación del Excel de THE." : "";
              const u = await supabase.from("ranking_responses").update({ estado, nota_revision: nota }).eq("id", id);
              if (u.error) throw errorDe(u.error);
            }
            res.actualizadas++;
          }
          const filas = a.evidencias.map((e) =>
            e.kind === "url"
              ? { response_id: id, kind: "url", url: e.valor, nombre: "", publica: e.publica, analisis: analizarEvidencia({ kind: "url", url: e.valor }).chequeos, optimizada: false }
              : { response_id: id, kind: "nota", nombre: e.valor, publica: false, analisis: [], optimizada: false },
          );
          if (filas.length) {
            const ins = await supabase.from("ranking_evidence").insert(filas);
            if (ins.error) throw errorDe(ins.error);
            res.evidencias += filas.length;
          }
        } catch (e) {
          res.errores.push(`${a.indicador}: ${e instanceof Error ? e.message : "no se pudo guardar"}`);
        }
      }
      return res;
    },
    onSuccess: (_r, v) => {
      invalidarCiclo(cliente, v.ciclo);
      void cliente.invalidateQueries({ queryKey: ["reporte", "evidencias"] });
    },
  });
}

/** Evidencias de varias respuestas a la vez (para que la importación no repita). */
export async function evidenciasDe(respuestas: string[]): Promise<{ response_id: string; kind: string; url: string | null; nombre: string }[]> {
  const salida: { response_id: string; kind: string; url: string | null; nombre: string }[] = [];
  for (let i = 0; i < respuestas.length; i += 200) {
    const r = await supabase.from("ranking_evidence").select("response_id, kind, url, nombre").in("response_id", respuestas.slice(i, i + 200));
    if (r.error) throw errorDe(r.error);
    salida.push(...((r.data as typeof salida | null) ?? []));
  }
  return salida;
}
