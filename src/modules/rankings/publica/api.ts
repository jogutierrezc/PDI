/* =============================================================================
   Pilo Publica · llamada a la función pilo-publica.

   POST con la sesión: { action, informe_id, ... } → { ok: true, ... } o { error, code }.
   Si la función no está desplegada, la pantalla lo dice claro (FuncionNoDesplegada)
   y sigue siendo útil con lo que se escribe a mano.
   ========================================================================== */

import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../noticias";

export class ErrorPublica extends Error {
  constructor(
    message: string,
    readonly code: string = "",
  ) {
    super(message);
  }
}
export class FuncionNoDesplegada extends ErrorPublica {
  constructor() {
    super("La función pilo-publica aún no está desplegada. Mientras tanto puedes armar el informe a mano.", "no_desplegada");
  }
}

export interface EstadoFuncion {
  ok: boolean;
  ai: boolean;
  motivo?: string;
  proveedor?: string;
  modelo?: string;
}
export interface RespuestaFuentes {
  ok: boolean;
  fuentes: Partial<Record<"noticia" | "indicador" | "libro" | "documento" | "cifras", number>>;
  avisos?: string[];
}
export interface RespuestaLibro {
  ok: boolean;
  cifras: number;
  derivadas: number;
  avisos?: string[];
}
export interface RespuestaAnalizar {
  ok: boolean;
  kpis: number;
  graficos: number;
  /** Lo que se descartó, con su motivo (el servidor manda la lista; versiones viejas mandaban solo el número). */
  descartados: { motivo: string }[] | number;
  /** Sin cifras del ODS no hay tablero: no es un error. */
  aviso?: string;
}
export interface RespuestaRedactar {
  ok: boolean;
  escritos: number;
  quedan: number;
  fallos?: { refs?: string[]; motivo?: string }[] | number;
  /** El servidor manda la lista de fuentes sin citar (versiones viejas mandaban el número). */
  sin_usar?: { ref: string; label: string; motivo: string }[] | number;
}
export interface PropuestaImagen {
  news_id: string;
  image_id?: string;
  /** Bloque de texto (eje) al que Pilo la propone. */
  block_id?: string;
  url?: string;
  title?: string;
  caption?: string;
  minors?: boolean;
}
export interface RespuestaImagenes {
  ok: boolean;
  propuestas: PropuestaImagen[];
}
export interface RespuestaTraducir {
  ok: boolean;
  quedan?: number;
  escritos?: number;
  traducidos?: number;
}

export interface RespuestaDescribir {
  ok: boolean;
  descritas: number;
  fallos?: { key?: string; motivo?: string }[];
  quedan: number;
}
export class AccionNoDisponible extends ErrorPublica {
  constructor(accion: string) {
    super(`La función pilo-publica desplegada todavía no conoce la acción «${accion}». Pídele a quien despliega que publique la versión nueva de la función; mientras tanto puedes escribir las explicaciones a mano.`, "accion_desconocida");
  }
}

export type Accion = "estado" | "fuentes" | "libro" | "analizar" | "redactar" | "imagenes" | "traducir" | "describir";

export async function llamar<T>(accion: Accion, informe_id: string, extra: Record<string, unknown> = {}): Promise<T> {
  const r = await supabase.functions.invoke("pilo-publica", { body: { action: accion, informe_id, ...extra } });
  if (r.error) {
    const ctx = (r.error as { context?: Response }).context;
    let mensaje = r.error.message;
    let code = "";
    let status = 0;
    try {
      status = ctx?.status ?? 0;
      const j = ctx ? ((await ctx.json()) as { error?: string; code?: string }) : null;
      if (j?.error) mensaje = j.error;
      code = j?.code ?? "";
    } catch {
      /* se queda el mensaje general */
    }
    if (/acci[oó]n desconocida|unknown action|unknown_action|accion_desconocida/i.test(`${mensaje} ${code}`)) throw new AccionNoDisponible(accion);
    if (code === "migracion") throw new FaltaMigracion(mensaje || "Falta aplicar la migración 0262 (Pilo Publica).");
    if (!ctx || (status === 404 && (code === "" || /NOT_FOUND/i.test(code) || /not found/i.test(mensaje)))) throw new FuncionNoDesplegada();
    throw new ErrorPublica(mensaje, code);
  }
  const d = r.data as T & { ok?: boolean; error?: string; code?: string };
  if (d && d.ok === false && d.error && /acci[oó]n desconocida|unknown action/i.test(`${d.error} ${d.code ?? ""}`)) throw new AccionNoDisponible(accion);
  if (d && d.ok === false && d.error) throw new ErrorPublica(d.error, d.code ?? "");
  return d as T;
}

export function useEstadoFuncion(informeId: string | undefined) {
  return useQuery({
    queryKey: ["pp", "estado", informeId],
    enabled: Boolean(informeId),
    staleTime: 30_000,
    retry: false,
    queryFn: () => llamar<EstadoFuncion>("estado", informeId as string),
  });
}

/* ---------- Pasos que se repiten desde el cliente hasta que no quedan ------ */

export interface ProgresoCorrida {
  corriendo: boolean;
  etiqueta: string;
  hecho: number;
  total: number;
  fallos: number;
  /** Los motivos de los fallos (sin repetir, los primeros), para que la persona sepa qué pasó. */
  detalles: string[];
  mensaje: string | null;
  error: string | null;
  noDesplegada: boolean;
}
const VACIA: ProgresoCorrida = { corriendo: false, etiqueta: "", hecho: 0, total: 0, fallos: 0, detalles: [], mensaje: null, error: null, noDesplegada: false };

/** Corre una acción; si la respuesta trae `quedan > 0`, la repite hasta 0 o hasta que se pulse Detener. */
export function useCorrida(informeId: string | undefined) {
  const qc = useQueryClient();
  const [p, setP] = useState<ProgresoCorrida>(VACIA);
  const parar = useRef(false);
  const ocupado = useRef(false);

  const correr = useCallback(
    async <T,>(etiqueta: string, accion: Accion, extra: Record<string, unknown> = {}): Promise<T | null> => {
      if (!informeId || ocupado.current) return null;
      ocupado.current = true;
      parar.current = false;
      let hecho = 0;
      let total = 0;
      let fallos = 0;
      const detalles: string[] = [];
      let sinAvance = 0;
      let ultima: T | null = null;
      setP({ ...VACIA, corriendo: true, etiqueta });
      try {
        for (let vuelta = 0; vuelta < 200; vuelta++) {
          const r = await llamar<T & { escritos?: number; traducidos?: number; descritas?: number; quedan?: number; fallos?: unknown }>(accion, informeId, extra);
          ultima = r;
          const hizo = Number(r.escritos ?? r.traducidos ?? r.descritas ?? 0);
          const quedan = Number(r.quedan ?? 0);
          hecho += hizo;
          if (Array.isArray(r.fallos)) {
            fallos += r.fallos.length;
            for (const f of r.fallos as { motivo?: string; error?: string }[]) {
              const m = String(f?.motivo ?? f?.error ?? "").trim().slice(0, 240);
              if (m && !detalles.includes(m) && detalles.length < 6) detalles.push(m);
            }
          }
          else if (typeof r.fallos === "number") fallos += r.fallos;
          total = Math.max(total, hecho + quedan);
          setP({ ...VACIA, corriendo: true, etiqueta, hecho, total, fallos, detalles: [...detalles] });
          void qc.invalidateQueries({ queryKey: ["pp"] });
          if (quedan <= 0) break;
          sinAvance = hizo === 0 ? sinAvance + 1 : 0;
          if (sinAvance >= 2) {
            setP({ ...VACIA, etiqueta, hecho, total, fallos, detalles: [...detalles], mensaje: `Pilo no pudo avanzar con los ${quedan} que quedan.` });
            return ultima;
          }
          if (parar.current) {
            setP({ ...VACIA, etiqueta, hecho, total, fallos, detalles: [...detalles], mensaje: `Detenido. Quedan ${quedan}; puedes continuar cuando quieras.` });
            return ultima;
          }
        }
        setP({ ...VACIA, etiqueta, hecho, total, fallos, detalles: [...detalles], mensaje: "Listo." });
        return ultima;
      } catch (e) {
        setP({ ...VACIA, etiqueta, hecho, total, fallos, detalles: [...detalles], error: e instanceof Error ? e.message : String(e), noDesplegada: e instanceof FuncionNoDesplegada });
        return null;
      } finally {
        ocupado.current = false;
        void qc.invalidateQueries({ queryKey: ["pp"] });
      }
    },
    [informeId, qc],
  );

  const detener = useCallback(() => {
    parar.current = true;
  }, []);
  const limpiar = useCallback(() => setP(VACIA), []);
  return { progreso: p, correr, detener, limpiar };
}
export type Corrida = ReturnType<typeof useCorrida>;
