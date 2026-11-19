/* =============================================================================
   Planeación y Seguimiento · lo que cada pantalla recibe: el plan que se muestra,
   sus líneas, los filtros compartidos (persisten entre pantallas y visitas) y la
   forma de navegar conservando el historial del módulo.
   ========================================================================== */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useLineas, usePlan } from "./api";
import { filtrar, sanearSeleccion, type SeleccionFiltros } from "./calculos";
import type { Linea, PlanVista, PsNivel } from "./modelo";
import { DESDE_MODULO } from "./marco/PaginaCompleta";

export type Seccion = "resumen" | "proyectos" | "cronograma" | "calidad" | "versiones" | "roles" | "cargar" | "crear" | "publicar" | "comparar";

export interface Ctx {
  nivel: PsNivel;
  base: string;
  /** Ruta de una sección del módulo. */
  ruta: (seccion: Seccion, id?: string, sub?: string) => string;
  ir: (ruta: string, opciones?: { reemplazar?: boolean }) => void;
  plan: PlanVista | null;
  lineas: Linea[];
  cargando: boolean;
  error: Error | null;
  filtros: SeleccionFiltros;
  setFiltros: (f: SeleccionFiltros) => void;
  filtradas: Linea[];
}

const Contexto = createContext<Ctx | null>(null);
export const usePs = (): Ctx => {
  const c = useContext(Contexto);
  if (!c) throw new Error("Falta el contexto de Planeación y Seguimiento.");
  return c;
};

const CLAVE_FILTROS = "ps:filtros:v1";
const leerFiltros = (): unknown => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_FILTROS) ?? "null");
  } catch {
    return null;
  }
};

export function ProveedorPs({ nivel, base, children }: { nivel: PsNivel; base: string; children: ReactNode }) {
  const navigate = useNavigate();
  const planQ = usePlan();
  const plan = planQ.data ?? null;
  const lineasQ = useLineas(plan?.version?.id ?? null);
  const lineas = useMemo(() => lineasQ.data ?? [], [lineasQ.data]);
  const [crudos, setCrudos] = useState<unknown>(() => leerFiltros());
  const filtros = useMemo(() => sanearSeleccion(crudos, lineas), [crudos, lineas]);
  const setFiltros = useCallback((f: SeleccionFiltros) => {
    setCrudos(f);
    try {
      localStorage.setItem(CLAVE_FILTROS, JSON.stringify(f));
    } catch {
      /* sin almacenamiento: los filtros viven solo en esta visita */
    }
  }, []);
  useEffect(() => {
    // Si otra pestaña cambia los filtros, esta los sigue.
    const alCambiar = (e: StorageEvent) => e.key === CLAVE_FILTROS && setCrudos(leerFiltros());
    window.addEventListener("storage", alCambiar);
    return () => window.removeEventListener("storage", alCambiar);
  }, []);
  const filtradas = useMemo(() => filtrar(lineas, filtros), [lineas, filtros]);
  const ruta = useCallback((s: Seccion, id?: string, sub?: string) => [base, s, id, sub].filter(Boolean).join("/"), [base]);
  const ir = useCallback((r: string, o?: { reemplazar?: boolean }) => navigate(r, { state: DESDE_MODULO, replace: o?.reemplazar }), [navigate]);
  const valor: Ctx = {
    nivel, base, ruta, ir, plan, lineas, filtros, setFiltros, filtradas,
    cargando: planQ.isPending || (Boolean(plan?.version) && lineasQ.isPending),
    error: (planQ.error as Error | null) ?? (lineasQ.error as Error | null),
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
