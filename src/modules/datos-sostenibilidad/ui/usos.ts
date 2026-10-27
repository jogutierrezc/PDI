/* =============================================================================
   Datos de Sostenibilidad · lecturas que comparten las pantallas.

   La unidad de UDrive «Datos de Sostenibilidad» y lo que hay en ella (tablas y
   gráficas), las tablas ya normalizadas de los vínculos y, por gráfica, la
   tabla de la que sale. Todo se apoya en los hooks de UDrive: aquí no se
   duplica ninguna consulta, solo se combinan.
   ========================================================================== */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth";
import { UD_CLAVES, pedirContenido, useArchivos, useCarpetas } from "../../udrive/datos";
import { subarbol } from "../../udrive/lib/arbol";
import { normalizarContenido } from "../../udrive/lib/tabla";
import type { ArchivoRow, TablaDatos } from "../../udrive/tipos";
import { useUnidades } from "../../udrive/unidades/datos";

export const NOMBRE_UNIDAD_SOS = "Datos de Sostenibilidad";

/** La unidad de trabajo y mi poder sobre ella: administra quien es admin general o Administra de la unidad. */
export function useAccesoSos() {
  const unidades = useUnidades();
  const { hasRole } = useAuth();
  const unidad = unidades.data?.find((u) => u.nombre === NOMBRE_UNIDAD_SOS && !u.archivada_en);
  // «Crea» o más en la unidad (o administración): crea y publica tableros y publica gráficas.
  const crea = hasRole("admin") || unidad?.mi_rol === "admin" || unidad?.mi_rol === "creador";
  return { unidades, unidad, administra: hasRole("admin") || unidad?.mi_rol === "admin", crea };
}

/** Las tablas y gráficas vivas de la unidad (sin papelera). */
export function useArchivosSos(raiz: string | undefined) {
  const archivos = useArchivos();
  const carpetas = useCarpetas();
  const lista = useMemo(() => {
    if (!raiz || !archivos.data || !carpetas.data) return [] as ArchivoRow[];
    const dentro = subarbol(carpetas.data, raiz);
    return archivos.data.filter((a) => !a.borrado_en && a.carpeta_id !== null && dentro.has(a.carpeta_id));
  }, [raiz, archivos.data, carpetas.data]);
  return {
    cargando: archivos.isPending || carpetas.isPending,
    error: archivos.error ?? carpetas.error,
    tablas: useMemo(() => lista.filter((a) => a.tipo === "tabla"), [lista]),
    graficas: useMemo(() => lista.filter((a) => a.tipo === "grafica"), [lista]),
  };
}

/** El contenido de varios archivos a la vez, con la misma caché que los editores de UDrive. */
function useContenidos(ids: readonly string[]) {
  // La clave por contenido mantiene estable la lista aunque quien llama arme un arreglo nuevo en cada render.
  const clave = [...new Set(ids)].sort().join("|");
  const unicos = useMemo(() => (clave ? clave.split("|") : []), [clave]);
  const consultas = useQueries({
    queries: unicos.map((id) => ({ queryKey: UD_CLAVES.contenido(id), queryFn: () => pedirContenido(id), staleTime: 15_000, retry: false })),
  });
  return { unicos, consultas };
}

/** Las tablas de esos ids, normalizadas (`null` si no se pudo leer). `cargando` mientras falta alguna. */
export function useTablasDe(ids: readonly string[]) {
  const { unicos, consultas } = useContenidos(ids);
  const firma = consultas.map((c) => c.dataUpdatedAt).join(",");
  const tablas = useMemo(() => {
    const m = new Map<string, TablaDatos | null>();
    unicos.forEach((id, i) => {
      const leido = consultas[i].data;
      if (!leido || leido.tipo !== "tabla") return void m.set(id, null);
      const c = normalizarContenido(leido.contenido);
      m.set(id, { columnas: c.columnas, filas: c.filas });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `consultas` cambia de identidad en cada render; `firma` dice cuándo llegó contenido nuevo
  }, [unicos, firma]);
  return { tablas, cargando: consultas.some((c) => c.isPending) };
}

/** De qué tabla sale cada gráfica (`null` si aún no tiene) y su configuración tal como está guardada. */
export function useTablaDeGraficas(graficas: readonly ArchivoRow[]) {
  const { unicos, consultas } = useContenidos(graficas.map((g) => g.id));
  const firma = consultas.map((c) => c.dataUpdatedAt).join(",");
  return useMemo(() => {
    const m = new Map<string, { tabla: string | null; config: unknown }>();
    unicos.forEach((id, i) => {
      const crudo = (consultas[i].data?.contenido ?? {}) as { tabla_id?: unknown; config?: unknown };
      m.set(id, { tabla: typeof crudo.tabla_id === "string" ? crudo.tabla_id : null, config: crudo.config });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ídem
  }, [unicos, firma]);
}
