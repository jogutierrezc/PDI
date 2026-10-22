/* =============================================================================
   UDrive · lo que el documento lee de otros archivos.

   Un bloque de tabla o gráfica solo guarda el id; los datos se leen de UDrive
   con el mismo contenido y la misma caché que los editores de la fase 1, así
   que un cambio en la tabla se ve en el documento. Las imágenes se leen con
   enlaces firmados de Storage (5 minutos; se renuevan antes de vencer).

   Una versión guardada trae su propia instantánea: con `instantanea` los
   datos salen de ella y no de los archivos vivos, para ver el documento como
   estaba entonces.
   ========================================================================== */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { UD_CLAVES, enlaceDeArchivo, pedirContenido, useArchivos } from "../datos";
import { archivosUsados } from "../lib/documento";
import type { Documento } from "../lib/documento";
import { normalizarConfig } from "../lib/graficas";
import { normalizarContenido } from "../lib/tabla";
import type { ConfigGrafica, ContenidoTabla } from "../tipos";

export interface GraficaLeida {
  tabla_id: string | null;
  config: ConfigGrafica;
}

export interface Recursos {
  tablas: ReadonlyMap<string, ContenidoTabla | null>;
  graficas: ReadonlyMap<string, GraficaLeida | null>;
  imagenes: ReadonlyMap<string, { url: string; nombre: string } | null>;
  /** Nombre del archivo de UDrive (para los selectores y los avisos). */
  nombres: ReadonlyMap<string, string>;
  /** ¿Ya terminó de leer todo (con éxito o sin él)? */
  listo: boolean;
}

const VACIO = new Map<string, never>();

export function useRecursos(doc: Documento, instantanea?: Record<string, unknown>): Recursos {
  // Los ids que usa el documento no cambian con cada letra escrita: se resumen en una firma.
  const firmaUsados = JSON.stringify(archivosUsados(doc));
  const usados = useMemo(() => JSON.parse(firmaUsados) as ReturnType<typeof archivosUsados>, [firmaUsados]);
  const archivos = useArchivos();
  const vivo = !instantanea;

  // Primera tanda: las tablas y gráficas que nombra el documento.
  const ids1 = useMemo(() => [...new Set([...usados.tablas, ...usados.graficas])], [usados]);
  const q1 = useQueries({
    queries: ids1.map((id) => ({ queryKey: UD_CLAVES.contenido(id), enabled: vivo, retry: false, staleTime: 15_000, queryFn: () => pedirContenido(id) })),
  });
  const contenidoDe = (id: string): unknown => (vivo ? q1[ids1.indexOf(id)]?.data?.contenido : instantanea?.[id]);

  // Segunda: las tablas que alimentan a las gráficas.
  const tablasDeGraficas = useMemo(() => {
    const salida: string[] = [];
    for (const id of usados.graficas) {
      const c = (vivo ? q1[ids1.indexOf(id)]?.data?.contenido : instantanea?.[id]) as { tabla_id?: unknown } | null | undefined;
      if (c && typeof c.tabla_id === "string" && !ids1.includes(c.tabla_id) && !salida.includes(c.tabla_id)) salida.push(c.tabla_id);
    }
    return salida;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- q1 cambia de identidad en cada render; basta con sus datos
  }, [usados, ids1, vivo, instantanea, q1.map((q) => q.dataUpdatedAt).join(",")]);
  const q2 = useQueries({
    queries: tablasDeGraficas.map((id) => ({ queryKey: UD_CLAVES.contenido(id), enabled: vivo, retry: false, staleTime: 15_000, queryFn: () => pedirContenido(id) })),
  });

  // Imágenes: la ruta sale de la lista de archivos; el enlace se renueva cada 4 minutos.
  const idsImg = usados.imagenes;
  const rutas = idsImg.map((id) => archivos.data?.find((a) => a.id === id)?.ruta_storage ?? "");
  const q3 = useQueries({
    queries: idsImg.map((_, i) => ({
      queryKey: ["ud", "url", rutas[i]] as const,
      enabled: Boolean(rutas[i]),
      retry: false,
      staleTime: 4 * 60_000,
      refetchInterval: 4 * 60_000,
      queryFn: () => enlaceDeArchivo(rutas[i]),
    })),
  });

  return useMemo(() => {
    const tablas = new Map<string, ContenidoTabla | null>();
    const graficas = new Map<string, GraficaLeida | null>();
    const leerTabla = (id: string, crudo: unknown) => {
      tablas.set(id, crudo && typeof crudo === "object" ? normalizarContenido(crudo) : null);
    };
    for (const id of usados.tablas) leerTabla(id, contenidoDe(id));
    for (const id of usados.graficas) {
      const c = contenidoDe(id) as { tabla_id?: unknown; config?: unknown } | null | undefined;
      graficas.set(id, c && typeof c === "object" ? { tabla_id: typeof c.tabla_id === "string" ? c.tabla_id : null, config: normalizarConfig(c.config, null) } : null);
    }
    for (const g of graficas.values()) {
      if (g?.tabla_id && !tablas.has(g.tabla_id)) {
        const i = tablasDeGraficas.indexOf(g.tabla_id);
        leerTabla(g.tabla_id, vivo ? (i >= 0 ? q2[i]?.data?.contenido : q1[ids1.indexOf(g.tabla_id)]?.data?.contenido) : instantanea?.[g.tabla_id]);
      }
    }
    const imagenes = new Map<string, { url: string; nombre: string } | null>();
    idsImg.forEach((id, i) => imagenes.set(id, q3[i]?.data ? { url: q3[i].data as string, nombre: archivos.data?.find((a) => a.id === id)?.nombre ?? "imagen" } : null));
    const nombres = new Map<string, string>();
    for (const a of archivos.data ?? []) nombres.set(a.id, a.nombre);
    const pendiente = (qs: { isPending: boolean; fetchStatus: string }[]) => qs.some((q) => q.isPending && q.fetchStatus !== "idle");
    const listo = !archivos.isPending && !(vivo && (pendiente(q1) || pendiente(q2))) && !pendiente(q3);
    return { tablas, graficas, imagenes, nombres, listo };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las consultas se resumen en sus marcas de tiempo
  }, [usados, vivo, instantanea, archivos.data, archivos.isPending, q1.map((q) => q.dataUpdatedAt + q.fetchStatus).join(","), q2.map((q) => q.dataUpdatedAt + q.fetchStatus).join(","), q3.map((q) => q.dataUpdatedAt + q.fetchStatus).join(",")]);
}

/** Recursos vacíos para pintar un bloque suelto sin leer nada. */
export const SIN_RECURSOS: Recursos = { tablas: VACIO, graficas: VACIO, imagenes: VACIO, nombres: VACIO, listo: true };
