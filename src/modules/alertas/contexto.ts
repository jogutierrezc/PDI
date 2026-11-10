/* Portal de alertas · el alcance que comparten todas las pantallas (facultad, programa, semestre, periodo y sede). */

import { useOutletContext } from "react-router-dom";
import type { Programa } from "../monitor/logica";

/** La dirección del portal. Cambiarla aquí basta: el resto del módulo la lee de esta constante. */
export const BASE = "/alertas";

export interface Facultad {
  id: string;
  nombre: string;
}

export interface CtxAlertas {
  periodo: string;
  sede: string;
  nombreSede: string;
  periodos: string[];
  /** Los periodos del historial: hasta seis, del más antiguo al elegido. */
  historial: string[];
  programas: Programa[];
  facultades: Facultad[];
  f: string;
  p: string;
  programa: Programa;
  facultad: Facultad;
  /** Semestre elegido; null = todos. */
  s: number | null;
  fijar: (cambios: Record<string, string | null>) => void;
  /** Un enlace dentro del portal que conserva el alcance (o lo cambia con `extra`). */
  enlace: (ruta: string, extra?: Record<string, string | null>) => { pathname: string; search: string };
}

export const useAlertas = () => useOutletContext<CtxAlertas>();

export const SIN_FACULTAD = "sin-facultad";

export function facultadesDe(programas: Programa[]): Facultad[] {
  const m = new Map<string, Facultad>();
  for (const p of programas) {
    const id = p.facultad_id ?? SIN_FACULTAD;
    if (!m.has(id)) m.set(id, { id, nombre: p.facultad ?? "Sin facultad asignada" });
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export const programasDe = (programas: Programa[], f: string) => programas.filter((p) => (p.facultad_id ?? SIN_FACULTAD) === f).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
