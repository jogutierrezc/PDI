/* =============================================================================
   Compilar informe de colaboradores con Pilo · acceso a datos (migración 0293)
   y cliente de la función `pilo-compilador` (fetch + SSE, como las presentaciones).

   Los libros recibidos y lo decidido se guardan por informe para seguir en otro momento.
   La base repite el permiso (RLS): lee quien ve el informe; escribe quien lo diligencia.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSseParser } from "../../../components/pilo/ai/client";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../../rankings/noticias";
import type { DatosParaPilo, Decisiones, BorradorSeccion } from "./logica";
import type { HojaLeida } from "../ui/excel";

type ErrorBase = { code?: string; message?: string };
const falta = (e: ErrorBase) => e.code === "42P01" || e.code === "PGRST205" || (/informe_compilacion/.test(e.message ?? "") && /does not exist|schema cache/i.test(e.message ?? ""));
const fallo = (e: ErrorBase) => (falta(e) ? new FaltaMigracion("Falta aplicar la migración 0293 (Compilar informe con Pilo).") : new Error(e.message ?? "Error de la base de datos"));

export type NivelAstra = "rapida" | "compleja" | "investigacion";

export interface LibroGuardado {
  id: string;
  archivo: string;
  origen: string;
  equipo: string;
  hojas: HojaLeida[];
  creado_en: string;
}
export interface EstadoCompilacion {
  decisiones: Decisiones;
  borradores: BorradorSeccion[];
  nivel: NivelAstra;
  adaptar: boolean;
}
export const ESTADO_VACIO: EstadoCompilacion = { decisiones: {}, borradores: [], nivel: "compleja", adaptar: true };

export const CLAVES = {
  libros: (inst: string) => ["informes", "compilacion", "libros", inst] as const,
  estado: (inst: string) => ["informes", "compilacion", "estado", inst] as const,
};

export function useLibrosGuardados(instancia: string) {
  return useQuery({
    queryKey: CLAVES.libros(instancia),
    retry: false,
    queryFn: async (): Promise<LibroGuardado[]> => {
      const r = await supabase.from("informe_compilacion_libros").select("id, archivo, origen, equipo, hojas, creado_en").eq("instancia_id", instancia).order("creado_en", { ascending: true });
      if (r.error) throw fallo(r.error);
      return (r.data ?? []) as LibroGuardado[];
    },
  });
}

export function useEstadoCompilacion(instancia: string) {
  return useQuery({
    queryKey: CLAVES.estado(instancia),
    retry: false,
    queryFn: async (): Promise<EstadoCompilacion> => {
      const r = await supabase.from("informe_compilacion").select("decisiones, borradores, nivel, adaptar").eq("instancia_id", instancia).maybeSingle();
      if (r.error) throw fallo(r.error);
      return r.data ? { ...ESTADO_VACIO, ...(r.data as Partial<EstadoCompilacion>) } : ESTADO_VACIO;
    },
  });
}

export function useGuardarLibro(instancia: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (l: { archivo: string; origen: string; equipo: string; hojas: HojaLeida[] }) => {
      const u = (await supabase.auth.getUser()).data.user;
      const r = await supabase.from("informe_compilacion_libros").insert({ instancia_id: instancia, creado_por: u?.id, ...l }).select("id").single();
      if (r.error) throw fallo(r.error);
      return r.data.id as string;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVES.libros(instancia) }),
  });
}

export function useQuitarLibro(instancia: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("informe_compilacion_libros").delete().eq("id", id).eq("instancia_id", instancia);
      if (r.error) throw fallo(r.error);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVES.libros(instancia) }),
  });
}

export function useGuardarEstado(instancia: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: EstadoCompilacion) => {
      const u = (await supabase.auth.getUser()).data.user;
      const r = await supabase.from("informe_compilacion").upsert({ instancia_id: instancia, ...e, actualizado_por: u?.id, actualizado_en: new Date().toISOString() }, { onConflict: "instancia_id" });
      if (r.error) throw fallo(r.error);
    },
    onSuccess: (_d, e) => qc.setQueryData(CLAVES.estado(instancia), e),
  });
}

/* ---------- Pilo Astra: redactar una sección (SSE) --------------------------------------------- */

export class ErrorRedaccion extends Error {
  constructor(message: string, readonly code: string, readonly retryAfter?: number, readonly detalle?: string[]) {
    super(message);
  }
}

const MENSAJES: Record<string, string> = {
  astra_apagado: "Pilo Astra 1.0 no está encendido. El compilador solo trabaja con Astra: la administración debe activarlo.",
  astra_limite: "Llegó al límite de Astra por esta hora. Vuelva a intentar más tarde.",
  sin_acceso: "No tiene acceso a este informe.",
  sin_sesion: "Su sesión venció. Entre de nuevo.",
  datos_grandes: "Los datos de esta sección son demasiado grandes para enviarlos de una vez.",
  verificacion: "Pilo no logró un texto que cumpla las reglas de cifras. Intente de nuevo.",
  tiempo: "Astra tardó más de lo que se puede esperar. Intente de nuevo.",
  cancelado: "Se canceló la redacción.",
};
export const mensajeDeCodigo = (code: string, fallback = "No se pudo redactar la sección.") => MENSAJES[code] ?? fallback;

export interface ResultadoRedaccion {
  seccion: string;
  texto: string;
  partes: number;
  palabras: number;
  usados: string[];
  no_verificado: string[];
  pensamiento_s: number;
  reintento: boolean;
}
export interface ManejadoresRedaccion {
  onStep?: (p: { id: string; label: string }) => void;
  onThinking?: (texto: string) => void;
  onPart?: (p: { n: number; palabras: number }) => void;
  signal?: AbortSignal;
}

export async function consumirFlujo(chunks: AsyncIterable<string>, h: ManejadoresRedaccion = {}): Promise<ResultadoRedaccion> {
  const sse = createSseParser();
  let resultado: ResultadoRedaccion | null = null;
  let error: ErrorRedaccion | null = null;
  const atender = (m: { event: string; data: string }) => {
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(m.data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (m.event === "step") h.onStep?.({ id: String(d.id ?? ""), label: String(d.label ?? "") });
    else if (m.event === "thinking") h.onThinking?.(String(d.text ?? ""));
    else if (m.event === "part") h.onPart?.({ n: Number(d.n) || 0, palabras: Number(d.palabras) || 0 });
    else if (m.event === "done") {
      const texto = typeof d.texto === "string" ? d.texto.trim() : "";
      if (!texto) error = new ErrorRedaccion("Astra no devolvió texto. Intente de nuevo.", "vacio");
      else resultado = { seccion: String(d.seccion ?? ""), texto, partes: Number(d.partes) || 1, palabras: Number(d.palabras) || 0, usados: Array.isArray(d.usados) ? (d.usados as string[]) : [], no_verificado: Array.isArray(d.no_verificado) ? (d.no_verificado as string[]) : [], pensamiento_s: Number(d.pensamiento_s) || 0, reintento: d.reintento === true };
    } else if (m.event === "error") {
      const code = String(d.code ?? "proveedor");
      error = new ErrorRedaccion(String(d.message ?? mensajeDeCodigo(code)), code, undefined, Array.isArray(d.detalle) ? (d.detalle as string[]) : undefined);
    }
  };
  for await (const c of chunks) for (const m of sse.push(c)) atender(m);
  for (const m of sse.flush()) atender(m);
  if (error) throw error;
  if (!resultado) throw new ErrorRedaccion("El flujo terminó sin texto. Intente de nuevo.", "proveedor");
  return resultado;
}

async function* trozos(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const lector = body.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      yield dec.decode(value, { stream: true });
    }
  } finally {
    lector.releaseLock?.();
  }
}

export async function redactarSeccion(p: { instancia_id: string; nivel: NivelAstra; instruccion?: string; datos: DatosParaPilo }, h: ManejadoresRedaccion = {}): Promise<ResultadoRedaccion> {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "http://localhost:54321").replace(/\/+$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key";
  let token = anonKey;
  try {
    token = (await supabase.auth.getSession()).data.session?.access_token ?? anonKey;
  } catch {
    /* sin sesión: la función responde 401 */
  }
  let r: Response;
  try {
    r = await fetch(`${base}/functions/v1/pilo-compilador`, { method: "POST", headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${token}` }, body: JSON.stringify(p), signal: h.signal });
  } catch (e) {
    if (h.signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) throw new ErrorRedaccion(mensajeDeCodigo("cancelado"), "cancelado");
    throw new ErrorRedaccion("No pude conectarme con Pilo. Revise su conexión e intente de nuevo.", "red");
  }
  if (!r.ok) {
    const o = (await r.json().catch(() => ({}))) as { error?: string; code?: string; retry_after?: number };
    const code = o.code ?? (r.status === 429 ? "astra_limite" : r.status === 401 ? "sin_sesion" : r.status === 403 ? "sin_acceso" : "proveedor");
    throw new ErrorRedaccion(o.error || mensajeDeCodigo(code), code, Number(r.headers.get("Retry-After") ?? o.retry_after) || undefined);
  }
  if (!r.body) throw new ErrorRedaccion("El servidor no mandó el flujo.", "proveedor");
  try {
    return await consumirFlujo(trozos(r.body), h);
  } catch (e) {
    if (h.signal?.aborted) throw new ErrorRedaccion(mensajeDeCodigo("cancelado"), "cancelado");
    throw e;
  }
}
