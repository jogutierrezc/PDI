/* El informe armado para la pantalla: secciones, cifras (guardadas + vivas),
   anexos y el avance de cada sección. Lo usan el editor y la revisión. */

import { congelado, vistaCifra } from "../cifras-vivas";
import type { CifraVista } from "../cifras-vivas";
import { condicionDe, useAnexos, useCifras, useCifrasVivas, useSecciones } from "../datos";
import { PLANTILLAS, clavesDe, DIMS } from "../plantillas";
import { avanceSeccion } from "../validacion";
import type { Avance, ContextoSeccion } from "../validacion";
import type { CicloRow, ConfigCiclo, ContenidoSeccion, InstanciaRow, RequisitoRow, SeccionDef } from "../types";

export const CONFIG_BASE: ConfigCiclo = { limite_propios: 3, exigir_fuente: true, exigir_pilar: false };
export const configDe = (ciclo: CicloRow | null | undefined): ConfigCiclo => ({ ...CONFIG_BASE, ...(ciclo?.config ?? {}) });

export function useModeloInforme(inst: InstanciaRow, ciclo: CicloRow, requisitos: RequisitoRow[]) {
  const secciones = useSecciones(inst.id);
  const filas = useCifras(inst.id);
  const frio = congelado(inst.estado);
  const vivas = useCifrasVivas(inst.id, !frio);
  const anexos = useAnexos(inst.id);
  const plantilla = PLANTILLAS[inst.plantilla];
  const config = configDe(ciclo);

  const porClave = new Map((filas.data ?? []).map((f) => [f.clave, f]));
  const vista = (clave: string): CifraVista =>
    vistaCifra(clave, { fila: porClave.get(clave), viva: vivas.data?.[clave], estado: inst.estado, condicion: condicionDe(requisitos, inst.plantilla, clave) });

  const dePlantilla = new Set(clavesDe(inst.plantilla));
  const propias = (filas.data ?? []).filter((f) => !dePlantilla.has(f.clave)).map((f) => ({ fila: f, vista: vista(f.clave) }));
  const delInforme = [...dePlantilla].map(vista);
  /** Las que entran al informe: se pueden citar en el texto y van a la matriz. */
  const incluidas = [...delInforme.filter((c) => c.incluida), ...propias.map((p) => p.vista)];

  const contenidoGuardado = (clave: string): ContenidoSeccion => secciones.data?.find((s) => s.clave === clave)?.contenido ?? {};

  const contexto = (def: SeccionDef): ContextoSeccion => ({
    cifras: (def.dims ?? []).flatMap((d) => DIMS[d].cifras).map(vista).filter((c) => c.condicion !== "no"),
    propias: propias.filter((p) => p.fila.seccion_clave === def.clave).map((p) => p.vista),
    anexos: anexos.data?.length ?? 0,
    exigirFuente: config.exigir_fuente,
  });

  const avance = (def: SeccionDef, contenido?: ContenidoSeccion): Avance => avanceSeccion(def, contenido ?? contenidoGuardado(def.clave), contexto(def));

  const cargando = secciones.isPending || filas.isPending || anexos.isPending;
  const error = [secciones.error, filas.error, anexos.error, vivas.error].find((e): e is Error => e instanceof Error) ?? null;

  return { plantilla, config, secciones, filas, vivas, anexos, frio, vista, propias, delInforme, incluidas, contenidoGuardado, contexto, avance, cargando, error };
}

export type ModeloInforme = ReturnType<typeof useModeloInforme>;
