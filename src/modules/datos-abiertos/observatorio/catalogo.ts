/* =============================================================================
   Observatorio público · el catálogo de temas (O2).

   La portada de siempre sigue con la constante OBS_TOPICS (data.ts). Cuando la
   base tiene observatorios publicados (migraciones 0230–0233), lo que el taller
   organiza se superpone sin cambiar el aspecto:

     · Observatorio PRINCIPAL: los catorce temas de siempre en su orden, con el
       nombre, código, resumen, pregunta y fuente que tengan en la base; un tema
       archivado o movido a otro observatorio sale; los temas nuevos publicados
       se añaden al final.
     · Otro observatorio: sus temas publicados y no archivados, por línea.

   Sin migración, sin observatorios publicados o con error de lectura, el
   catálogo es la constante tal cual: misma lista, mismos datos.
   ========================================================================== */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useObservatoriosPublicos } from "../../admin/observatorio/publicar/api";
import type { Linea, Observatorio } from "../../admin/observatorio/publicar/api";
import { OBS_TOPICS } from "./data";
import type { ObsTopic } from "./data";

export interface TemaPublico extends ObsTopic {
  /** Observatorio al que pertenece (null: la constante, sin base). */
  obsId: string | null;
  lineaId: string | null;
  /** Tema nuevo de la base: no tiene cifras de ejemplo, solo lo que publique. */
  vacio: boolean;
}

interface FilaTema { slug: string; observatorio_id: string; linea_id: string | null; codigo: string | null; nombre: string | null; resumen: string | null; pregunta: string | null; fuente: string | null; orden: number; archivado: boolean }

const ESTATICOS = new Map(OBS_TOPICS.map((t) => [t.slug, t]));
const estaticoComoTema = (t: ObsTopic): TemaPublico => ({ ...t, obsId: null, lineaId: null, vacio: false });

function useTemasPublicos() {
  return useQuery({
    queryKey: ["obs-temas-publicos"],
    staleTime: 60_000,
    queryFn: async (): Promise<FilaTema[]> => {
      const r = await supabase.from("obs_topics").select("slug,observatorio_id,linea_id,codigo,nombre,resumen,pregunta,fuente,orden,archivado").eq("status", "publicado");
      return r.error ? [] : (r.data as FilaTema[]);
    },
  });
}

function aTema(fila: FilaTema, lineas: Linea[], indice: number): TemaPublico {
  const base = ESTATICOS.get(fila.slug);
  const linea = lineas.find((l) => l.id === fila.linea_id);
  const nombre = fila.nombre?.trim() || base?.name || fila.slug;
  const sinDatos: Pick<ObsTopic, "headline" | "series" | "share" | "table"> = {
    headline: { label: "", value: 0, unit: "" },
    series: { title: "", unit: "", points: [] },
    share: { title: "", unit: "", items: [] },
    table: { title: "", columns: [], rows: [] },
  };
  return {
    ...(base ?? sinDatos),
    slug: fila.slug,
    code: fila.codigo?.trim() || base?.code || nombre.slice(0, 2).toUpperCase(),
    name: nombre,
    summary: fila.resumen?.trim() || base?.summary || fila.pregunta?.trim() || "",
    question: fila.pregunta?.trim() || base?.question || `¿Qué muestra ${nombre}?`,
    source: fila.fuente?.trim() || base?.source || "",
    line: linea?.numero ?? base?.line ?? (indice % 11) + 1,
    obsId: fila.observatorio_id,
    lineaId: fila.linea_id,
    vacio: !base,
  };
}

export function useCatalogo() {
  const obs = useObservatoriosPublicos();
  const filas = useTemasPublicos();
  return useMemo(() => {
    const observatorios: Observatorio[] = obs.data?.observatorios ?? [];
    const lineas: Linea[] = obs.data?.lineas ?? [];
    const rows = filas.data ?? [];
    const principal = observatorios.find((o) => o.principal);
    const porSlug = new Map(rows.map((r) => [r.slug, r]));
    const porObs = new Map<string, TemaPublico[]>();

    for (const o of observatorios) {
      const propias = rows.filter((r) => r.observatorio_id === o.id && !r.archivado);
      const lista: TemaPublico[] = [];
      if (o.principal) {
        for (const t of OBS_TOPICS) {
          const fila = porSlug.get(t.slug);
          if (!fila) lista.push({ ...estaticoComoTema(t), obsId: o.id });
          else if (fila.observatorio_id === o.id && !fila.archivado) lista.push(aTema(fila, lineas, lista.length));
        }
        for (const f of propias.filter((r) => !ESTATICOS.has(r.slug)).sort((a, b) => a.orden - b.orden)) lista.push(aTema(f, lineas, lista.length));
      } else {
        const orden = new Map(lineas.filter((l) => l.observatorio_id === o.id).map((l) => [l.id, l.orden]));
        for (const f of [...propias].sort((a, b) => (orden.get(a.linea_id ?? "") ?? 999) - (orden.get(b.linea_id ?? "") ?? 999) || a.orden - b.orden)) lista.push(aTema(f, lineas, lista.length));
      }
      porObs.set(o.id, lista);
    }

    const delPrincipal = principal ? porObs.get(principal.id) : undefined;
    const lista = delPrincipal && delPrincipal.length > 0 ? delPrincipal : OBS_TOPICS.map(estaticoComoTema);
    const todos = new Map<string, TemaPublico>();
    for (const l of porObs.values()) for (const t of l) todos.set(t.slug, t);
    for (const t of OBS_TOPICS) if (!todos.has(t.slug) && !porSlug.get(t.slug)?.archivado) todos.set(t.slug, estaticoComoTema(t));

    return {
      /** Los temas del observatorio principal (o la constante). */
      principal: lista,
      porObs,
      observatorios,
      lineas,
      /** Un tema por su enlace, de cualquier observatorio publicado. */
      buscar: (slug: string | undefined) => (slug ? todos.get(slug) : undefined),
      /** La lista (con orden) a la que pertenece un tema: la de su observatorio. */
      listaDe: (t: TemaPublico) => (t.obsId ? porObs.get(t.obsId) ?? lista : lista),
      cargando: obs.isPending || filas.isPending,
    };
  }, [obs.data, obs.isPending, filas.data, filas.isPending]);
}
