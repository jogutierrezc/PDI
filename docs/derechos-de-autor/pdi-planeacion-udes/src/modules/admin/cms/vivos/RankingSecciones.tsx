/* =============================================================================
   CMS Portales · bloques vivos de los micrositios de UDES Sostenible.

   Las secciones del micrositio de cada ranking y de cada subcategoría son las
   mismas de SostenibleRanking.tsx (exportadas desde allí), así que lo que cambie
   en la página real cambia aquí. El bloque solo elige con qué ranking o
   subcategoría se dibuja.

   Cada bloque envuelve su sección en `.sos` (los estilos de UDES Sostenible
   cuelgan de ese contenedor). Los PDF abren su diálogo dentro del bloque.
   ========================================================================== */

import { useState, type CSSProperties, type ReactNode } from "react";
import { categoryById, rankingById, type Category, type Ranking } from "../../../sostenible/data";
import { rankingSheet } from "../../../sostenible/SostenibleHome";
import {
  CategoriaIndicadores,
  CategoriaIniciativas,
  CategoriaPuntaje,
  OdsEntry,
  RankingCategorias,
  RankingIndicadores,
  RankingResultados,
  categoriaSheet,
} from "../../../sostenible/SostenibleRanking";
import { SheetDialog, type SheetData } from "../../../sostenible/widgets";
import { parejaCategoria } from "../logica";
import type { Props } from "../tipos";

const SIN_ELEGIR = "Elija un ranking o una subcategoría en el inspector.";

const cadena = (v: unknown): string => (typeof v === "string" ? v : "");

/** El bloque de un micrositio: según su tipo, una sección de ranking o de subcategoría. */
export function MicrositioVivo({ tipo, p, navegable = false }: { tipo: string; p: Props; navegable?: boolean }) {
  // Un valor inválido solo se avisa en el editor; la página pública no pinta nada.
  const sinElegir = navegable ? null : <p className="cms-ayuda cms-r-vacio">{SIN_ELEGIR}</p>;
  if (tipo === "ranking-ods") {
    return (
      <div className="sos cms-vivo" style={{ "--sos-accent": "var(--pillar-2)" } as CSSProperties}>
        <OdsEntry />
      </div>
    );
  }
  if (tipo.startsWith("categoria-")) {
    const pareja = parejaCategoria(p.categoria);
    const r = pareja ? rankingById(pareja.ranking) : undefined;
    const c = r && pareja ? categoryById(r, pareja.categoria) : undefined;
    if (!r || !c) return sinElegir;
    return <CategoriaVivo tipo={tipo} ranking={r} categoria={c} />;
  }
  const r = rankingById(cadena(p.ranking));
  if (!r) return sinElegir;
  return <RankingVivo tipo={tipo} ranking={r} />;
}

/** Sección de un ranking: resultados (con su PDF), subcategorías o indicadores. */
function RankingVivo({ tipo, ranking: r }: { tipo: string; ranking: Ranking }) {
  const [sheet, setSheet] = useState<SheetData | null>(null);
  let contenido: ReactNode = null;
  if (tipo === "ranking-resultados") contenido = <RankingResultados ranking={r} onSheet={(i) => setSheet(rankingSheet(r, i))} />;
  else if (tipo === "ranking-categorias") contenido = <RankingCategorias ranking={r} />;
  else if (tipo === "ranking-indicadores") contenido = <RankingIndicadores ranking={r} />;
  return (
    <div className="sos cms-vivo" style={{ "--sos-accent": r.accent } as CSSProperties}>
      {contenido}
      {sheet && <SheetDialog data={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** Sección de una subcategoría: puntaje (con su PDF), indicadores o iniciativas. */
function CategoriaVivo({ tipo, ranking: r, categoria: c }: { tipo: string; ranking: Ranking; categoria: Category }) {
  const [sheet, setSheet] = useState<SheetData | null>(null);
  let contenido: ReactNode = null;
  if (tipo === "categoria-puntaje") contenido = <CategoriaPuntaje ranking={r} categoria={c} onExportar={() => setSheet(categoriaSheet(r, c))} />;
  else if (tipo === "categoria-indicadores") contenido = <CategoriaIndicadores categoria={c} />;
  else if (tipo === "categoria-iniciativas") contenido = <CategoriaIniciativas ranking={r} categoria={c} />;
  // Mismo color que SostenibleRanking: el de la subcategoría o, si no tiene, el del ranking.
  return (
    <div className="sos cms-vivo" style={{ "--sos-accent": c.color ?? r.accent } as CSSProperties}>
      {contenido}
      {sheet && <SheetDialog data={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}
