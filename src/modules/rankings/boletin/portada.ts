/* =============================================================================
   Boletín PDF de los informes ODS · la portada editable.

   Usa el diseño de portada de Informes Institucionales (cinco composiciones,
   textos con límite, fondo, encuadre de imagen, acento y monograma): los mismos
   tipos, los mismos normalizadores y el mismo editor. Lo que cambia es dónde
   vive: no hay una unidad, así que el diseño se guarda en los ajustes de la
   plantilla del boletín ODS (od_bulletins.settings.odsPortada), sin migración.
   ========================================================================== */

import { disenoPorDefecto, normalizarDiseno, normalizarPerfil, perfilParaGuardar } from "../../informes/vista/perfil";
import type { PerfilOficina, PortadaDiseno } from "../../informes/vista/perfil";

export const NOMBRE_OFICINA = "Oficina de Planeación";
export const TITULO_PORTADA = "Contribución de la UDES a los Objetivos de Desarrollo Sostenible";
export const SUBTITULO_PORTADA = "Informes ODS · THE Impact Rankings";

/** Lo que se guarda en `settings.odsPortada`. */
export interface PortadaGuardada {
  portada: PortadaDiseno;
  perfil: ReturnType<typeof perfilParaGuardar>;
}

export interface DisenoBoletin {
  portada: PortadaDiseno;
  perfil: PerfilOficina;
}

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * El diseño de la portada a partir de los ajustes guardados. Todo lo que falte o venga mal formado cae en un buen valor
 * por defecto: la portada del boletín nunca queda vacía.
 */
export function disenoDeBoletin(settings: Record<string, unknown> | null | undefined, edicion: number): DisenoBoletin {
  const guardado = objeto(objeto(settings).odsPortada);
  const base = { unidad: NOMBRE_OFICINA, anio: edicion, nombreCiclo: `THE Impact Rankings ${edicion}` };
  const inicial = disenoPorDefecto(base).portada;
  const rawPortada = objeto(guardado.portada);
  const portada = normalizarDiseno(
    { portada: { ...inicial, titulo: TITULO_PORTADA, subtitulo: SUBTITULO_PORTADA, ...rawPortada } },
    base,
  ).portada;
  const perfil = normalizarPerfil(guardado.perfil, NOMBRE_OFICINA);
  return { portada, perfil };
}

export function paraGuardar(d: DisenoBoletin): PortadaGuardada {
  return { portada: d.portada, perfil: perfilParaGuardar(d.perfil) };
}
