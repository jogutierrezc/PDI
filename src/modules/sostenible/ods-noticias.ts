/* =============================================================================
   UDES Sostenible · las notas aprobadas de un ODS para el portal público.

   TODAS (por páginas de 1.000, sin el tope de 600 del recolector), con su
   título y extracto en inglés cuando existen (0146: title_en, excerpt_en son
   columnas públicas). Sin 0146, las de siempre; sin red o sin 0143, ninguna:
   el informe sigue igual y el carrusel no aparece.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { anioDeNoticias, rangoFechasDeAnio } from "../rankings/informes/anios";

export interface NotaPublica {
  id: string;
  url: string;
  title: string;
  title_en: string;
  excerpt: string;
  excerpt_en: string;
  image_url: string | null;
  published_on: string | null;
  section: string;
  campus: string;
}

const PAGINA = 1000;
const BASE = "id, url, title, excerpt, image_url, published_on, section, campus";

async function leer(ods: number, columnas: string, edicion?: number): Promise<NotaPublica[]> {
  const out: NotaPublica[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let consulta = supabase
      .from("news_items" as never)
      .select(`${columnas}, news_ods!inner(ods)`)
      .eq("state", "ok")
      .eq("news_ods.ods", ods);
    if (edicion) {
      const { desde: d, hasta: h } = rangoFechasDeAnio(anioDeNoticias(edicion));
      consulta = consulta.gte("published_on", d).lt("published_on", h);
    }
    const r = await consulta
      .order("published_on", { ascending: false, nullsFirst: false })
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (r.error) throw r.error;
    const filas = ((r.data as unknown as Record<string, unknown>[]) ?? []).map(
      (f): NotaPublica => ({
        id: String(f.id),
        url: String(f.url ?? ""),
        title: String(f.title ?? ""),
        title_en: String(f.title_en ?? ""),
        excerpt: String(f.excerpt ?? ""),
        excerpt_en: String(f.excerpt_en ?? ""),
        image_url: (f.image_url as string | null) ?? null,
        published_on: (f.published_on as string | null) ?? null,
        section: String(f.section ?? ""),
        campus: String(f.campus ?? ""),
      }),
    );
    out.push(...filas);
    if (filas.length < PAGINA) return out;
  }
}

/** Las notas aprobadas del ODS, de la más reciente a la más antigua. Con `edicion`, solo las de su año de noticias (edición 2026 → 2025). */
export function useNoticiasPublicas(ods: number, edicion?: number) {
  return useQuery({
    queryKey: ["noticias", "publico-ods", ods, edicion ?? 0],
    staleTime: 5 * 60_000,
    retry: false,
    enabled: ods >= 1 && ods <= 17,
    queryFn: async (): Promise<NotaPublica[]> => {
      try {
        return await leer(ods, `${BASE}, title_en, excerpt_en`, edicion);
      } catch {
        try {
          return await leer(ods, BASE, edicion);
        } catch {
          return [];
        }
      }
    },
  });
}
