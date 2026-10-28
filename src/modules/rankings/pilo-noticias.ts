/* =============================================================================
   Recolector de noticias · Mr. Pilo las lee (migración 0144, función noticias-pilo).

   · estadoPilo / clasificarLote / reintentarErrores: una llamada a la función.
     La clave del proveedor nunca llega aquí: la función la lee de la base.
   · usePiloNoticias: el ciclo de lotes. Cada lote lee 1 a 3 notas (la IA tarda
     de 8 a 90 s por nota); el ciclo repite sin bloquear la pantalla hasta que
     no quedan, se detiene o falla. Lo pendiente vive en la base, así que al
     volver a iniciar sigue donde iba.
   · useNewsSettings / useSaveNewsSettings: si Pilo aprueba lo claro y desde qué
     confianza (news_settings).
   · Funciones puras para la bandeja: etiqueta «Aprobada por Pilo», la propuesta
     de Pilo y el detalle de cada ODS (razón, indicador, confianza).
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { ODS13 } from "../sostenible/ods-data";
import { FaltaMigracion, type NewsItem, type NewsOds } from "./noticias";
import type { PerfilId } from "./perfiles";

export interface AjustesNoticias {
  pilo_aprueba: boolean;
  umbral: number;
}

export interface EstadoPilo {
  ok: boolean;
  /** Notas que esperan a Pilo (sin decisión de una persona). */
  pendientes: number;
  /** Notas cuya lectura falló; se pueden devolver a la fila. */
  errores: number;
  /** ¿Está Mr. Pilo con IA encendido y conectado? */
  ia: boolean;
  /** Si no, por qué, en palabras. */
  motivo?: string;
  ajustes: AjustesNoticias;
}

export interface RespuestaLote {
  ok: boolean;
  procesadas: number;
  aprobadas_por_pilo: number;
  para_revisar: number;
  descartadas: number;
  errores: number;
  quedan: number;
  /** El proveedor falló a mitad del lote: lo leído se guardó y el ciclo debe parar. */
  alto?: { error: string; code: string };
}

/** Un error de la función, con su código («sin_ia», «limite_proveedor», «proveedor»…). */
export class ErrorPilo extends Error {
  constructor(
    message: string,
    readonly code: string = "",
  ) {
    super(message);
  }
}

const MIGRACION_0144 = "Falta aplicar la migración 0144 (Pilo clasifica noticias).";

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke("noticias-pilo", { body: { action: "noticias", ...body } });
  if (r.error) {
    // Un 4xx/5xx trae el mensaje en el cuerpo; sin él, el de la librería.
    const ctx = (r.error as { context?: Response }).context;
    let mensaje = r.error.message;
    let code = "";
    try {
      const j = ctx ? ((await ctx.json()) as { error?: string; code?: string }) : null;
      if (j?.error) mensaje = j.error;
      code = j?.code ?? "";
    } catch {
      /* se queda el mensaje general */
    }
    if (code === "migracion") throw new FaltaMigracion(mensaje || MIGRACION_0144);
    // Sin la función desplegada, la librería dice algo genérico: mejor decirlo claro.
    if (!ctx && /failed to send|fetch/i.test(mensaje)) mensaje = "No se pudo llegar a la función noticias-pilo: ¿está desplegada?";
    throw new ErrorPilo(mensaje, code);
  }
  return r.data as T;
}

/** `perfil` (0242): el perfil de ranking que Pilo lee; sin él, ODS, como siempre. */
export const estadoPilo = (perfil: PerfilId = "ods") => invocar<EstadoPilo>({ step: "estado", perfil });
/** Sin `limite`, la función usa el lote de los ajustes de IA de los rankings (0146: 5 con Mistral, 2 con los demás). */
export const clasificarLote = (limite?: number, perfil: PerfilId = "ods") => invocar<RespuestaLote>({ step: "lote", perfil, ...(limite ? { limite: Math.max(1, Math.min(8, Math.floor(limite))) } : {}) });
export const reintentarErrores = (perfil: PerfilId = "ods") => invocar<{ ok: boolean; devueltas: number }>({ step: "reintentar", perfil });

export function useEstadoPilo(perfil: PerfilId = "ods") {
  return useQuery({ queryKey: ["noticias", "pilo", perfil], staleTime: 20_000, retry: false, queryFn: () => estadoPilo(perfil) });
}

/* ---------- El ciclo de lotes --------------------------------------------- */

export interface ProgresoPilo {
  procesadas: number;
  aprobadas: number;
  paraRevisar: number;
  descartadas: number;
  errores: number;
  /** null hasta el primer lote. */
  quedan: number | null;
}

export const PROGRESO_CERO: ProgresoPilo = { procesadas: 0, aprobadas: 0, paraRevisar: 0, descartadas: 0, errores: 0, quedan: null };

/** Suma un lote al progreso (puro). */
export function sumarLote(p: ProgresoPilo, r: RespuestaLote): ProgresoPilo {
  return {
    procesadas: p.procesadas + (r.procesadas || 0),
    aprobadas: p.aprobadas + (r.aprobadas_por_pilo || 0),
    paraRevisar: p.paraRevisar + (r.para_revisar || 0),
    descartadas: p.descartadas + (r.descartadas || 0),
    errores: p.errores + (r.errores || 0),
    quedan: typeof r.quedan === "number" ? r.quedan : p.quedan,
  };
}

/** ¿Sigue el ciclo tras este lote? Para si no quedan, si no leyó nada o si el proveedor falló. */
export function sigueElCiclo(r: RespuestaLote): boolean {
  return !r.alto && r.procesadas > 0 && r.quedan > 0;
}

export interface UsoPilo extends ProgresoPilo {
  corriendo: boolean;
  error: string | null;
  /** El error es que falta la migración 0144. */
  faltaMigracion: boolean;
  iniciar: () => void;
  detener: () => void;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lee las notas pendientes lote a lote. `invalidarCada`: cada cuántos lotes se
 * refresca la bandeja (query ["noticias"]); al terminar, siempre. Ante el
 * límite del proveedor (429) espera 30 s y reintenta hasta 3 veces.
 */
export function usePiloNoticias({ limite, invalidarCada = 3, perfil = "ods" }: { limite?: number; invalidarCada?: number; perfil?: PerfilId } = {}): UsoPilo {
  const cliente = useQueryClient();
  const [progreso, setProgreso] = useState<ProgresoPilo>(PROGRESO_CERO);
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const parar = useRef(false);
  const vivo = useRef(true);
  const enCurso = useRef(false);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      parar.current = true;
    };
  }, []);

  const refrescar = useCallback(() => void cliente.invalidateQueries({ queryKey: ["noticias"] }), [cliente]);

  const iniciar = useCallback(() => {
    if (enCurso.current) return;
    enCurso.current = true;
    parar.current = false;
    setError(null);
    setFaltaMigracion(false);
    setProgreso(PROGRESO_CERO);
    setCorriendo(true);
    void (async () => {
      let lotes = 0;
      let esperas = 0;
      try {
        while (!parar.current) {
          let r: RespuestaLote;
          try {
            r = await clasificarLote(limite, perfil);
          } catch (e) {
            if (e instanceof ErrorPilo && e.code === "limite_proveedor" && esperas < 3 && !parar.current) {
              esperas++;
              await dormir(30_000);
              continue;
            }
            throw e;
          }
          esperas = 0;
          lotes++;
          if (vivo.current) setProgreso((p) => sumarLote(p, r));
          if (r.alto) {
            if (vivo.current) setError(r.alto.error);
            break;
          }
          if (lotes % Math.max(1, invalidarCada) === 0) refrescar();
          if (!sigueElCiclo(r)) break;
        }
      } catch (e) {
        if (vivo.current) {
          setFaltaMigracion(e instanceof FaltaMigracion);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        enCurso.current = false;
        refrescar();
        if (vivo.current) setCorriendo(false);
      }
    })();
  }, [limite, invalidarCada, perfil, refrescar]);

  const detener = useCallback(() => {
    parar.current = true;
  }, []);

  return { ...progreso, corriendo, error, faltaMigracion, iniciar, detener };
}

/* ---------- Ajustes (news_settings) ---------------------------------------- */

const noExiste = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")));

export function useNewsSettings() {
  return useQuery({
    queryKey: ["noticias", "ajustes"],
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<AjustesNoticias> => {
      const r = await supabase.from("news_settings" as never).select("pilo_aprueba, umbral").eq("id", 1).maybeSingle();
      if (r.error) throw noExiste(r.error) ? new FaltaMigracion(MIGRACION_0144) : new Error(r.error.message);
      const f = r.data as unknown as AjustesNoticias | null;
      return { pilo_aprueba: f?.pilo_aprueba === true, umbral: typeof f?.umbral === "number" ? f.umbral : 85 };
    },
  });
}

export function useSaveNewsSettings() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ ajustes, by }: { ajustes: AjustesNoticias; by: string | null }) => {
      const umbral = Math.max(50, Math.min(100, Math.round(ajustes.umbral)));
      const r = await supabase
        .from("news_settings" as never)
        .update({ pilo_aprueba: ajustes.pilo_aprueba, umbral, updated_by: by, updated_at: new Date().toISOString() } as never)
        .eq("id", 1);
      if (r.error) throw noExiste(r.error) ? new FaltaMigracion(MIGRACION_0144) : new Error(r.error.message);
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ["noticias", "ajustes"] });
      void cliente.invalidateQueries({ queryKey: ["noticias", "pilo"] });
    },
  });
}

/* ---------- Funciones puras para la bandeja -------------------------------- */

/** «Aprobada por Pilo» / «Descartada por Pilo», o null si lo decidió una persona o nadie. */
export function etiquetaDecisionPilo(n: Pick<NewsItem, "state" | "decided_by">): string | null {
  if (n.decided_by !== "pilo") return null;
  if (n.state === "ok") return "Aprobada por Pilo";
  if (n.state === "no") return "Descartada por Pilo";
  return null;
}

const SUGIERE: Record<"aprobar" | "revisar" | "descartar", string> = {
  aprobar: "Pilo sugiere aprobar",
  revisar: "Pilo tiene dudas",
  descartar: "Pilo sugiere descartar",
};

export interface PropuestaPiloVista {
  decision: "aprobar" | "revisar" | "descartar";
  etiqueta: string;
  confianza: number | null;
  resumen: string;
}

/** La propuesta de Pilo sobre la nota, si ya la leyó. */
export function propuestaPilo(n: Pick<NewsItem, "ai_status" | "ai_decision" | "ai_confidence" | "ai_summary">): PropuestaPiloVista | null {
  if (n.ai_status !== "hecho" || !n.ai_decision) return null;
  return { decision: n.ai_decision, etiqueta: SUGIERE[n.ai_decision], confianza: n.ai_confidence ?? null, resumen: (n.ai_summary ?? "").trim() };
}

/** Dónde va la lectura de Pilo, en palabras («Pilo aún no la lee», «La lectura falló: …»). Null si no aplica. */
export function lecturaPilo(n: Pick<NewsItem, "ai_status" | "ai_error">): string | null {
  if (n.ai_status === "pendiente") return "Pilo aún no la lee";
  if (n.ai_status === "error") return `Pilo no pudo leerla${n.ai_error ? `: ${n.ai_error}` : ""}. Revísala tú.`;
  return null;
}

/** El nombre del indicador de THE («13.2 · Energía con bajas emisiones»); el código solo si no se conoce. */
export function nombreIndicador(id: string | null | undefined): string | null {
  if (!id) return null;
  const i = ODS13.indicators.find((x) => x.id === id);
  return i ? `${i.id} · ${i.name.es}` : id;
}

export interface DetalleOds {
  /** «Propuesto por Pilo», «Agregado por Planeación» o «Por palabras clave». */
  origen: string;
  razon: string;
  indicador: string | null;
  /** La confianza de Pilo (0 a 100); null si la fila no es de Pilo. */
  confianza: number | null;
}

/** Lo que la bandeja muestra de cada ODS de una nota. */
export function detalleOds(o: Pick<NewsOds, "manual" | "by_ai" | "score" | "reason" | "indicator">): DetalleOds {
  const dePilo = o.by_ai === true && !o.manual;
  return {
    origen: o.manual ? "Agregado por Planeación" : dePilo ? "Propuesto por Pilo" : "Por palabras clave",
    razon: o.reason,
    indicador: nombreIndicador(o.indicator),
    confianza: dePilo ? o.score : null,
  };
}
