/* =============================================================================
   Datos de Sostenibilidad · lo que el público vería, calculado en el navegador.

   Para la vista previa de los tableros: los indicadores y las gráficas YA
   PUBLICADOS, con la forma de sos_cifras_publicas() y sos_graficas_publicas()
   pero armados con las tablas de UDrive que la persona tiene abiertas (así un
   cambio en una tabla se ve al instante, sin esperar a la base). Misma regla que
   el portal: lo no publicado, archivado, sin vínculo válido o sin cifras no está
   aquí. Reutiliza agregarSerie y las comprobaciones de sos.ts; no las copia.
   ========================================================================== */

import { useMemo } from "react";
import { normalizarConfig } from "../../udrive/lib/graficas";
import type { TablaDatos } from "../../udrive/tipos";
import { agregarSerie, avisosDeVinculo, columnaSensible, useIndicadoresSos, usePublicacionesGraficas, useVinculos } from "../sos";
import type { CifraPublicaSos, GraficaPublicaSos } from "../tipos";
import { useArchivosSos, useTablaDeGraficas, useTablasDe } from "./usos";

/** Dispersión y burbujas son un punto por registro: la base no las publica. */
const NO_PUBLICABLES = new Set(["dispersion", "burbujas"]);

export function useDatosPublicados(raiz: string | undefined) {
  const inds = useIndicadoresSos();
  const vins = useVinculos();
  const pubs = usePublicacionesGraficas();
  const { tablas: tablasUnidad, graficas, cargando: cargandoArchivos } = useArchivosSos(raiz);
  const origen = useTablaDeGraficas(graficas);

  const publicadas = useMemo(() => new Map((pubs.data ?? []).map((p) => [p.archivo_id, p])), [pubs.data]);
  const indsPublicados = useMemo(() => (inds.data ?? []).filter((i) => i.publicado && !i.archivado), [inds.data]);
  const grafPublicadas = useMemo(() => graficas.filter((g) => publicadas.get(g.id)?.publicado), [graficas, publicadas]);

  const idsTablas = useMemo(
    () => [
      ...new Set([
        ...indsPublicados.flatMap((i) => (vins.data ?? []).filter((v) => v.indicador_id === i.id).map((v) => v.archivo_id)),
        ...grafPublicadas.map((g) => origen.get(g.id)?.tabla).filter((t): t is string => Boolean(t)),
      ]),
    ],
    [indsPublicados, vins.data, grafPublicadas, origen],
  );
  const { tablas, cargando: cargandoTablas } = useTablasDe(idsTablas);

  const cifras = useMemo(() => {
    const salida: CifraPublicaSos[] = [];
    for (const ind of indsPublicados) {
      const v = vins.data?.find((x) => x.indicador_id === ind.id);
      const t = v ? tablas.get(v.archivo_id) : undefined;
      if (!v || !t || avisosDeVinculo(v, t).length) continue;
      const serie = agregarSerie(ind, v, t);
      if (!serie.length) continue;
      salida.push({
        id: ind.id,
        ods: ind.ods,
        nombre: ind.nombre,
        unidad: ind.unidad,
        mejor: ind.mejor,
        meta: ind.meta,
        tarjeta: ind.tarjeta,
        decimales: ind.decimales,
        nota: ind.nota,
        resumen: ind.resumen,
        fuente: tablasUnidad.find((a) => a.id === v.archivo_id)?.nombre ?? "",
        serie,
      });
    }
    return salida;
  }, [indsPublicados, vins.data, tablas, tablasUnidad]);

  const graficasPrevia = useMemo(() => {
    const salida: GraficaPublicaSos[] = [];
    for (const g of grafPublicadas) {
      const fuente = origen.get(g.id);
      const tabla: TablaDatos | null | undefined = fuente?.tabla ? tablas.get(fuente.tabla) : undefined;
      if (!tabla) continue;
      const config = normalizarConfig(fuente?.config, tabla);
      if (NO_PUBLICABLES.has(config.tipo)) continue;
      const usadas = [...new Set([config.x, ...config.series.map((s) => s.clave), config.tamano, config.filaCalor, config.filtroFecha && config.filtroFecha.modo !== "todo" ? config.filtroFecha.columna : null].filter((k): k is string => Boolean(k)))];
      if (usadas.some((k) => { const c = tabla.columnas.find((x) => x.clave === k); return c ? columnaSensible(c) : false; })) continue;
      salida.push({
        id: g.id,
        nombre: g.nombre,
        seccion: publicadas.get(g.id)?.seccion ?? "detalle",
        orden: publicadas.get(g.id)?.orden ?? 0,
        fuente: tablasUnidad.find((a) => a.id === fuente?.tabla)?.nombre ?? "",
        actualizado: g.updated_at,
        config,
        columnas: tabla.columnas.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo })),
        filas: tabla.filas.map((f) => f.datos),
      });
    }
    return salida;
  }, [grafPublicadas, origen, tablas, publicadas, tablasUnidad]);

  return {
    cifras,
    graficas: graficasPrevia,
    /** Los datos del catálogo y de la unidad que el constructor ofrece para elegir. */
    catalogo: inds.data ?? [],
    graficasUnidad: graficas,
    publicadas,
    cargando: inds.isPending || vins.isPending || pubs.isPending || cargandoArchivos || cargandoTablas,
    error: inds.error ?? vins.error ?? pubs.error,
  };
}
