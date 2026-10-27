/* =============================================================================
   UI GreenMetric · el contexto de las pantallas: el ciclo elegido, su catálogo,
   las respuestas y las asignaciones, más el papel de quien mira (leído de las
   asignaciones; la base es quien manda). Una sola carga para todas las vistas.
   ========================================================================== */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../../lib/auth";
import { useAsignaciones, useCategoriasUgm, useConfigUgm, usePreguntasUgm, useRespuestas } from "../datos";
import { usePerfiles, useUnidadesNombres } from "./lectura";
import { mensajeDe } from "./comunes";
import type { ActorUgm, AsignacionUgm, CategoriaCiclo, CategoriaId, CicloUgm, ConfigCiclo, PreguntaCiclo, RespuestaUgm } from "../lib/tipos";

export interface Ugm {
  ciclo: CicloUgm;
  cfg: ConfigCiclo | null;
  categorias: CategoriaCiclo[];
  preguntas: PreguntaCiclo[];
  respuestas: RespuestaUgm[];
  asignaciones: AsignacionUgm[];
  porQ: Map<string, RespuestaUgm>;
  pregQ: Map<string, PreguntaCiclo>;
  /** Planeación o más: administra el ranking. */
  esAdmin: boolean;
  miId: string;
  nombre: (id: string | null | undefined) => string;
  correo: (id: string | null | undefined) => string;
  oficina: (unidad: string | null | undefined) => string;
  actorEn: (q: string) => ActorUgm | null;
  responsableDe: (q: string) => AsignacionUgm | undefined;
  revisorDe: (cat: CategoriaId) => AsignacionUgm | undefined;
  vence: (q: string) => string | null;
  /** Escribe en el aviso de la pantalla (lector de pantalla incluido). */
  avisar: (texto: string, tipo?: "ok" | "error") => void;
  /** Ejecuta una acción, avisa y refresca todo el ciclo. Devuelve true si salió bien. */
  hacer: <T>(accion: () => Promise<T>, ok?: string) => Promise<boolean>;
  abrir: (q: string | null) => void;
  ir: (vista: string) => void;
  /** Quien solo responde (ruta de «consulta»): sin las vistas de administración. */
  soloMios: boolean;
  /** Indicadores marcados en la lista, para asignarlos juntos. */
  seleccion: Set<string>;
  setSeleccion: (s: Set<string>) => void;
}

const Ctx = createContext<Ugm | null>(null);
export function useUgm(): Ugm {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUgm fuera de UgmProvider");
  return c;
}

export function UgmProvider({ ciclo, soloMios, abrir, ir, children }: { ciclo: CicloUgm; soloMios: boolean; abrir: (q: string | null) => void; ir: (v: string) => void; children: ReactNode }) {
  const { profile, hasRole } = useAuth();
  const qc = useQueryClient();
  const cfg = useConfigUgm(ciclo.id);
  const cats = useCategoriasUgm(ciclo.id);
  const preg = usePreguntasUgm(ciclo.id);
  const resp = useRespuestas(ciclo.id);
  const asig = useAsignaciones(ciclo.id);
  const miId = profile?.id ?? "";
  const esAdmin = hasRole("planeacion");

  const categorias = useMemo(() => cats.data ?? [], [cats.data]);
  const preguntas = useMemo(() => preg.data ?? [], [preg.data]);
  const respuestas = useMemo(() => resp.data ?? [], [resp.data]);
  const asignaciones = useMemo(() => asig.data ?? [], [asig.data]);
  const porQ = useMemo(() => new Map(respuestas.map((r) => [r.q, r])), [respuestas]);
  const pregQ = useMemo(() => new Map(preguntas.map((p) => [p.q, p])), [preguntas]);

  const idsPersonas = useMemo(() => [...asignaciones.map((a) => a.usuario_id), ...asignaciones.map((a) => a.asignado_por ?? "")].filter(Boolean), [asignaciones]);
  const perfiles = usePerfiles(idsPersonas);
  const unidades = useUnidadesNombres();

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
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
        await qc.invalidateQueries({ queryKey: ["ugm"] });
        if (ok) avisar(ok);
        return true;
      } catch (e) {
        avisar(mensajeDe(e), "error");
        return false;
      }
    },
    [qc, avisar],
  );

  const valor = useMemo<Ugm>(() => {
    const vigentes = asignaciones.filter((a) => a.vigente);
    const responsableDe = (q: string) => vigentes.find((a) => a.q === q && a.rol === "responsable");
    const revisorDe = (cat: CategoriaId) => vigentes.find((a) => a.rol === "revisor" && a.categoria === cat);
    const actorEn = (q: string): ActorUgm | null => {
      if (esAdmin) return "admin";
      const cat = pregQ.get(q)?.categoria;
      if (vigentes.some((a) => a.usuario_id === miId && a.rol === "revisor" && (a.q === q || (cat && a.categoria === cat)))) return "revisor";
      if (vigentes.some((a) => a.usuario_id === miId && a.q === q && a.rol === "responsable")) return "responsable";
      if (vigentes.some((a) => a.usuario_id === miId && a.q === q && a.rol === "apoyo")) return "apoyo";
      return porQ.has(q) ? "jefe" : null;
    };
    return {
      ciclo,
      cfg: cfg.data ?? null,
      categorias,
      preguntas,
      respuestas,
      asignaciones: vigentes,
      porQ,
      pregQ,
      esAdmin,
      miId,
      nombre: (id) => (id ? (perfiles.data?.get(id)?.nombre ?? "Persona") : "—"),
      correo: (id) => (id ? (perfiles.data?.get(id)?.correo ?? "") : ""),
      oficina: (u) => (u ? (unidades.data?.get(u) ?? "") : ""),
      actorEn,
      responsableDe,
      revisorDe,
      vence: (q) => responsableDe(q)?.fecha_limite ?? ciclo.fecha_limite ?? null,
      avisar,
      hacer,
      abrir,
      ir,
      soloMios,
      seleccion,
      setSeleccion,
    };
  }, [ciclo, cfg.data, categorias, preguntas, respuestas, asignaciones, porQ, pregQ, esAdmin, miId, perfiles.data, unidades.data, avisar, hacer, abrir, ir, soloMios, seleccion]);

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

/** Estado de la carga base: para que el contenedor muestre cargando o el error. */
export function useCargaBase(ciclo?: string) {
  const preg = usePreguntasUgm(ciclo);
  const resp = useRespuestas(ciclo);
  const asig = useAsignaciones(ciclo);
  const cats = useCategoriasUgm(ciclo);
  const error = preg.error ?? resp.error ?? asig.error ?? cats.error;
  return { cargando: preg.isLoading || resp.isLoading || asig.isLoading || cats.isLoading, error, reintentar: () => void Promise.all([preg.refetch(), resp.refetch(), asig.refetch(), cats.refetch()]) };
}
