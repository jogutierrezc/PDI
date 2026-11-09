import type { Corrida } from "./api";
import type { InformePP, RankingPP, UnidadPP } from "./tipos";

export interface EstadoPilo {
  /** Ya se sabe si la función responde. */
  cargando: boolean;
  /** La IA está lista para escribir. */
  lista: boolean;
  /** La función responde (aunque la IA no esté lista). */
  desplegada: boolean;
  motivo?: string;
  proveedor?: string;
  modelo?: string;
}

export interface EtapaProps {
  informe: InformePP;
  ranking: RankingPP;
  unidad: UnidadPP;
  pilo: EstadoPilo;
  corrida: Corrida;
  ir: (etapa: number) => void;
}

/** Por qué un botón de Pilo no se puede usar ahora, o null si se puede. */
export function motivoSinPilo(p: EstadoPilo, c: Corrida): string | null {
  if (c.progreso.corriendo) return "Pilo está trabajando en otra tarea.";
  if (p.cargando) return "Comprobando si Pilo está disponible…";
  if (!p.desplegada) return "La función pilo-publica aún no está desplegada.";
  if (!p.lista) return p.motivo ? `Pilo no está disponible: ${p.motivo}` : "Pilo no está disponible ahora.";
  return null;
}
