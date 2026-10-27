/* =============================================================================
   UDES Sostenible · cifras reales de Datos de Sostenibilidad.

   Primera fuente: sos_cifras_publicas() (migración 0202): indicadores
   publicados con su serie ya agregada por campus y año. Los que traen `tarjeta`
   reemplazan la cifra de muestra de esa tarjeta; los que no, salen como
   tarjetas nuevas (useIndicadoresNuevos). Segunda fuente, mientras una tarjeta
   no tenga vínculo nuevo: ds_cifras_publicas() (0198, libros «listo»). El
   portal usa la cifra real si existe para ese campus y año, y cae al dato de
   muestra (data.ts) cuando no. Si las funciones no existen (migración sin
   aplicar) o no hay datos, devuelve vacío y el portal queda como estaba.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { CAMPUSES, YEARS } from "./data";
import type { Campus, IndKey } from "./data";
import type { CifraPublicaSos } from "../datos-sostenibilidad/tipos";

/**
 * Equivalencia de LA SEGUNDA FUENTE (libros de 0198) entre un indicador del
 * catálogo (ds_indicadores.id) y una tarjeta del portal (IndKey). Los vínculos
 * nuevos (0202) no la usan: llevan la tarjeta en ds_indicadores.tarjeta. Solo se mapea lo que mide lo mismo; lo demás
 * sigue siendo de muestra hasta que haya equivalencia clara.
 *
 *   13.2 «Energía con bajas emisiones» (%)  →  solar «Energía renovable» (% del consumo)
 *
 * Sin equivalencia hoy (no se inventa): energia, agua, residuos, verde, arboles,
 * movil y volunt no tienen indicador en el catálogo; 13.1, 13.3 y 13.4 no tienen
 * tarjeta en el portal. Cuando la administración añada indicadores, se mapean aquí.
 */
export const IND_DE_DS: Record<string, IndKey> = {
  "13.2": "solar",
};

/** Una fila tal como la entrega la función. */
interface CifraFila {
  valor: number;
  periodo: string;
  campus: string | null;
  fuente: string | null;
  evidencia: string | null;
}

/** Una cifra real ya situada en el tablero. */
export interface CifraReal {
  valor: number;
  fuente: string | null;
  evidencia: string | null;
}

/** Cifras reales por tarjeta: clave `campus|índice de año`. */
export type CifrasReales = Partial<Record<IndKey, Map<string, CifraReal>>>;

const quitarTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const claveDe = (campus: Campus, yearIndex: number) => `${campus}|${yearIndex}`;

/** El campus del libro, como uno del portal; vacío o «institucional» es Todos. Otro texto no encaja y se omite. */
function campusDe(texto: string | null): Campus | null {
  if (!texto) return "Todos";
  const t = quitarTildes(texto);
  if (t === "institucional" || t === "universidad") return "Todos";
  return CAMPUSES.find((c) => quitarTildes(c) === t) ?? null;
}

/** El año del periodo («2024», «2024-1», «2024 B»): el primero de cuatro cifras que sea una edición. */
function anioDe(periodo: string): number {
  const m = /\b(\d{4})\b/.exec(periodo);
  return m ? YEARS.findIndex((y) => y === Number(m[1])) : -1;
}

/** Ordena lo que entrega la base por tarjeta del portal. Si hay varias filas del mismo campus y año, gana la última. */
export function ordenarCifras(datos: Record<string, CifraFila[]> | null | undefined): CifrasReales {
  const out: CifrasReales = {};
  for (const [dsId, filas] of Object.entries(datos ?? {})) {
    const key = IND_DE_DS[dsId];
    if (!key || !Array.isArray(filas)) continue;
    const mapa = out[key] ?? new Map<string, CifraReal>();
    for (const f of filas) {
      const campus = campusDe(f.campus);
      const i = anioDe(String(f.periodo ?? ""));
      if (!campus || i < 0 || typeof f.valor !== "number") continue;
      mapa.set(claveDe(campus, i), { valor: f.valor, fuente: f.fuente ?? null, evidencia: f.evidencia ?? null });
    }
    if (mapa.size) out[key] = mapa;
  }
  return out;
}

/** La cifra real de una tarjeta en un campus y un año, si existe. */
export const cifraReal = (reales: CifrasReales, k: IndKey, campus: Campus, yearIndex: number): CifraReal | undefined =>
  reales[k]?.get(claveDe(campus, yearIndex));

/** Los años con cifra real de esa tarjeta en ese campus (para la gráfica y el cambio). */
export const seriesReal = (reales: CifrasReales, k: IndKey, campus: Campus): { yearIndex: number; valor: number }[] =>
  YEARS.map((_, i) => ({ yearIndex: i, valor: cifraReal(reales, k, campus, i)?.valor })).filter(
    (p): p is { yearIndex: number; valor: number } => typeof p.valor === "number",
  );

/** Un indicador publicado que no alimenta ninguna tarjeta existente: el portal le abre una tarjeta propia. */
export interface IndicadorNuevo {
  id: string;
  nombre: string;
  unidad: string;
  decimales: number;
  higherIsBetter: boolean;
  /** Tope de las magnitudes en porcentaje: dibuja la barra de avance. */
  max?: number;
  /** Cifras reales: clave `campus|índice de año`. */
  valores: Map<string, CifraReal>;
}

interface CifrasPortal {
  reales: CifrasReales;
  nuevos: IndicadorNuevo[];
}

/** Ordena lo que entrega sos_cifras_publicas(): las que traen tarjeta van a esa tarjeta; el resto, a tarjetas nuevas. */
export function ordenarSos(lista: CifraPublicaSos[] | null | undefined): CifrasPortal {
  const reales: CifrasReales = {};
  const nuevos: IndicadorNuevo[] = [];
  for (const ind of Array.isArray(lista) ? lista : []) {
    const mapa = new Map<string, CifraReal>();
    for (const p of Array.isArray(ind.serie) ? ind.serie : []) {
      const campus = campusDe(p.campus);
      const i = YEARS.findIndex((y) => y === p.anio);
      if (!campus || i < 0 || typeof p.valor !== "number") continue;
      mapa.set(claveDe(campus, i), { valor: p.valor, fuente: ind.fuente || null, evidencia: null });
    }
    if (!mapa.size) continue;
    if (ind.tarjeta) reales[ind.tarjeta] = mapa;
    else {
      nuevos.push({
        id: ind.id,
        nombre: ind.nombre,
        unidad: ind.unidad,
        decimales: ind.decimales,
        higherIsBetter: ind.mejor === "sube",
        max: ind.unidad.includes("%") ? 100 : undefined,
        valores: mapa,
      });
    }
  }
  return { reales, nuevos };
}

/**
 * Lo que lee el portal. Pública (anon): ambas funciones son security definer y
 * entregan solo cifras agregadas. Cualquier fallo —migración sin aplicar, sin
 * red— es «no hay cifras reales», nunca un error.
 */
function useCifrasPortal(): CifrasPortal {
  const q = useQuery({
    queryKey: ["sostenible", "cifras-reales"],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<CifrasPortal> => {
      const nuevo = await supabase.rpc("sos_cifras_publicas");
      const { reales, nuevos } = ordenarSos(nuevo.error ? [] : (nuevo.data as CifraPublicaSos[] | null));
      // Segunda fuente: los libros de 0198 llenan las tarjetas que aún no tienen vínculo nuevo.
      const viejo = await supabase.rpc("ds_cifras_publicas");
      if (!viejo.error) {
        const legado = ordenarCifras(viejo.data as Record<string, CifraFila[]> | null);
        for (const k of Object.keys(legado) as IndKey[]) if (!reales[k]) reales[k] = legado[k];
      }
      return { reales, nuevos };
    },
  });
  return q.data ?? { reales: {}, nuevos: [] };
}

/** Las cifras reales de las tarjetas del portal. */
export const useCifrasReales = (): CifrasReales => useCifrasPortal().reales;

/** Los indicadores publicados que no tienen tarjeta propia en el portal. */
export const useIndicadoresNuevos = (): IndicadorNuevo[] => useCifrasPortal().nuevos;
