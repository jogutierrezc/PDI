/* =============================================================================
   THE Impact · el contexto de las pantallas: el ciclo elegido, su catálogo, las
   asignaciones, las respuestas, los requisitos de la metodología y el conteo de
   evidencias. Una sola carga para todas las vistas; los avisos y «hacer» siguen el
   patrón de UI GreenMetric (el aviso se anuncia con role=status).
   ========================================================================== */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../../lib/auth";
import type { RankingCycleRow } from "../../../../types/database";
import { useAsignacionesReporte, useCatalogoReporte, useRespuestasReporte, useUnidadesReporte } from "../../reporte/datos";
import type { UnidadRef } from "../../reporte/datos";
import type { Asignacion, Indicador } from "../../reporte/tipos";
import type { RankingResponseRow } from "../../../../types/database";
import { mensajeDe } from "../../uigreen/ui/comunes";
import { useConfigThi, useConteoEvidencias, useRequisitosThi } from "../datos";
import type { ConfigThi, ConteoEvidencias, RequisitoThi } from "../datos";

export interface Thi {
  ciclo: RankingCycleRow;
  ciclos: RankingCycleRow[];
  cfg: ConfigThi | null;
  indicadores: Indicador[];
  asignaciones: Asignacion[];
  respuestas: RankingResponseRow[];
  unidades: UnidadRef[];
  requisitos: Map<string, RequisitoThi>;
  conteo: Map<string, ConteoEvidencias>;
  /** Planeación o más: administra el ranking. */
  esAdmin: boolean;
  oficina: (id: string | null | undefined) => string;
  /** Escribe en el aviso de la pantalla (lector de pantalla incluido). */
  avisar: (texto: string, tipo?: "ok" | "error") => void;
  /** Ejecuta una acción, avisa y devuelve true si salió bien. */
  hacer: <T>(accion: () => Promise<T>, ok?: string) => Promise<boolean>;
  /** Abre un indicador (?q=). */
  abrir: (q: string | null) => void;
  /** Cambia de vista; «indicadores&ods=4» abre esa vista ya filtrada. */
  ir: (vista: string) => void;
  /** Cambia el ciclo elegido. */
  elegirCiclo: (id: string) => void;
}

const Ctx = createContext<Thi | null>(null);
/** El contexto si hay uno (el diálogo de «Nuevo ciclo» también se abre antes de que exista un ciclo). */
export const useThiOpcional = (): Thi | null => useContext(Ctx);
export function useThi(): Thi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useThi fuera de ThProvider");
  return c;
}

interface ProviderProps {
  ciclo: RankingCycleRow;
  ciclos: RankingCycleRow[];
  abrir: (q: string | null) => void;
  ir: (v: string) => void;
  elegirCiclo: (id: string) => void;
  children: ReactNode;
}

export function ThProvider({ ciclo, ciclos, abrir, ir, elegirCiclo, children }: ProviderProps) {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const cfg = useConfigThi(ciclo.id);
  const catalogo = useCatalogoReporte(ciclo.id);
  const asig = useAsignacionesReporte(ciclo.id);
  const resp = useRespuestasReporte(ciclo.id);
  const uni = useUnidadesReporte();
  const req = useRequisitosThi();
  const conteo = useConteoEvidencias(ciclo.id);
  const esAdmin = hasRole("planeacion");

  const [aviso, setAviso] = useState<{ texto: string; tipo: "ok" | "error"; n: number } | null>(null);
  const temporizador = useRef<number | undefined>();
  const avisar = useCallback((texto: string, tipo: "ok" | "error" = "ok") => {
    setAviso({ texto, tipo, n: Date.now() });
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setAviso(null), tipo === "error" ? 8000 : 4000);
  }, []);
  const hacer = useCallback(
    async <T,>(accion: () => Promise<T>, ok?: string) => {
      try {
        await accion();
        await Promise.all([qc.invalidateQueries({ queryKey: ["thi"] }), qc.invalidateQueries({ queryKey: ["reporte"] })]);
        if (ok) avisar(ok);
        return true;
      } catch (e) {
        avisar(mensajeDe(e), "error");
        return false;
      }
    },
    [qc, avisar],
  );

  const valor = useMemo<Thi>(() => {
    const unidades = uni.data ?? [];
    const nombres = new Map(unidades.map((u) => [u.id, u.name]));
    return {
      ciclo,
      ciclos,
      cfg: cfg.data ?? null,
      indicadores: catalogo.data ?? [],
      asignaciones: asig.data ?? [],
      respuestas: resp.data ?? [],
      unidades,
      requisitos: req.data ?? new Map(),
      conteo: conteo.data ?? new Map(),
      esAdmin,
      oficina: (id) => (id ? (nombres.get(id) ?? "Oficina") : "—"),
      avisar,
      hacer,
      abrir,
      ir,
      elegirCiclo,
    };
  }, [ciclo, ciclos, cfg.data, catalogo.data, asig.data, resp.data, uni.data, req.data, conteo.data, esAdmin, avisar, hacer, abrir, ir, elegirCiclo]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div className="ugm-avisos" aria-live="polite" role="status">
        {aviso && (
          <p key={aviso.n} className={`ugm-aviso ugm-aviso--${aviso.tipo}`}>
            {aviso.texto}
          </p>
        )}
      </div>
    </Ctx.Provider>
  );
}

/** Estado de la carga base: para que el contenedor muestre «cargando» o el error. */
export function useCargaBase(ciclo?: string) {
  const catalogo = useCatalogoReporte(ciclo);
  const asig = useAsignacionesReporte(ciclo);
  const resp = useRespuestasReporte(ciclo);
  const uni = useUnidadesReporte();
  const req = useRequisitosThi();
  const cfg = useConfigThi(ciclo);
  // Los requisitos y la configuración dependen de 0237/0238: si faltan, el error lo dice; el resto del reporte sigue siendo de 0149.
  const error = catalogo.error ?? asig.error ?? resp.error ?? uni.error ?? req.error ?? cfg.error;
  return {
    cargando: catalogo.isLoading || asig.isLoading || resp.isLoading || uni.isLoading || req.isLoading || cfg.isLoading,
    error,
    reintentar: () => void Promise.all([catalogo.refetch(), asig.refetch(), resp.refetch(), uni.refetch(), req.refetch(), cfg.refetch()]),
  };
}
