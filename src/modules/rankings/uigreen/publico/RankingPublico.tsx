/* =============================================================================
   UI GreenMetric · página pública · la puerta de /sostenible/green.

   /sostenible/:ranking y /sostenible/:ranking/:categoria ya existen y están
   envueltos por el CMS. Estos dos componentes solo deciden qué hay dentro:
     · ranking distinto de «green»  → la página de siempre (`vieja`);
     · «green» sin ciclo con contenido publicado, con error, o sin las migraciones
       0208 a 0212  → la página de siempre, idéntica (`vieja`);
     · «green» con contenido publicado → la página nueva.
   Mientras se averigua, un marco con «Cargando…» (no se pinta la vieja para no
   cambiarla de golpe). Las lecturas se repiten cada 60 s: si todo se retira, la
   página vuelve sola a la de siempre.
   ========================================================================== */

import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useLang } from "../../../sostenible/i18n";
import { usePublicoResumen } from "../datos";
import type { PublicoResumen } from "../lib/tipos";
import { Categoria } from "./Categoria";
import { Portada } from "./Portada";
import { Estado, Marco } from "./piezas";
import { CAT_VISUAL, tx } from "./textos";

/** El resumen del ciclo vigente si tiene algo publicado; nulo si no (o si las migraciones faltan). */
export function useUgmPublicado(): { cargando: boolean; resumen: PublicoResumen | null } {
  const q = usePublicoResumen(null);
  return { cargando: q.isPending, resumen: q.data && q.data.total.publicados > 0 ? q.data : null };
}

function Puerta({ nueva, vieja }: { nueva: ReactNode; vieja: ReactNode }) {
  const { lang } = useLang();
  const { cargando, resumen } = useUgmPublicado();
  if (cargando) {
    return (
      <Marco volver={{ to: "/sostenible", texto: tx(lang, "volver_sos") }}>
        <Estado tipo="cargando" lang={lang} />
      </Marco>
    );
  }
  return <>{resumen ? nueva : vieja}</>;
}

export function RankingPublico({ vieja }: { vieja: ReactNode }) {
  const { ranking } = useParams();
  return ranking === "green" ? <Puerta nueva={<Portada />} vieja={vieja} /> : <>{vieja}</>;
}

export function CategoriaPublica({ vieja }: { vieja: ReactNode }) {
  const { ranking, categoria } = useParams();
  return ranking === "green" && (categoria ?? "").toUpperCase() in CAT_VISUAL ? <Puerta nueva={<Categoria />} vieja={vieja} /> : <>{vieja}</>;
}
