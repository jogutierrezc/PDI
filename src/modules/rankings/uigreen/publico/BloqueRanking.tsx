/* =============================================================================
   UI GreenMetric · bloque «Ranking» del CMS (grupo «Datos en vivo»).

   Muestra la pared de categorías o el avance («N de M indicadores publicados»,
   regleta de cuadros) en cualquier página del CMS. Lee solo ugm_publico_resumen.
   Vivo y sin contenido propio salvo el encabezado: sin nada publicado no dibuja
   nada en la página pública (en el editor explica por qué). El diseño recibe el
   ranking por propiedad para sumar otros rankings sin tocar el bloque.
   ========================================================================== */

import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../../../sostenible/i18n";
import { usePublicoResumen } from "../datos";
import type { PublicoResumen } from "../lib/tipos";
import { fecha, rutaCategoria, RUTA_GREEN } from "./logica";
import { Regleta } from "./piezas";
import { CAT_VISUAL, tx } from "./textos";
import type { Lang } from "./textos";
import "./ugmp.css";

export interface BloqueRankingProps {
  /** Hoy solo «green»; otro valor no dibuja nada. */
  ranking: string;
  modo: "pared" | "avance";
  antetitulo?: string;
  titulo?: string;
  texto?: string;
  navegable: boolean;
}

export function BloqueRanking({ ranking, modo, antetitulo, titulo, texto, navegable }: BloqueRankingProps) {
  const { lang } = useLang();
  const q = usePublicoResumen(null);
  const r = q.data && q.data.total.publicados > 0 ? q.data : null;
  if (ranking !== "green") return null;
  if (!r) {
    // En la página pública, nada; en el editor, la razón.
    return navegable ? null : (
      <div className="sos cms-vivo">
        <div className="cms-wrap">
          <p className="ugmp-b-aviso">UI GreenMetric: todavía no hay indicadores publicados (o falta aplicar las migraciones 0208 a 0213). Cuando haya, aparecerán aquí.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="sos cms-vivo ugmp-b" lang={lang}>
      <div className="cms-wrap">
        {(antetitulo || titulo || texto) && (
          <div className="sos-head">
            {antetitulo && <p className="sos-eyebrow">{antetitulo}</p>}
            {titulo && <h2>{titulo}</h2>}
            {texto && <p>{texto}</p>}
          </div>
        )}
        {modo === "avance" ? <Avance r={r} lang={lang} navegable={navegable} /> : <Pared r={r} lang={lang} navegable={navegable} />}
        <p className="ugmp-b-pie">
          {tx(lang, "nota_regleta")} · {tx(lang, "actualizado_en", { f: fecha(r.actualizado, lang) })}
        </p>
      </div>
    </div>
  );
}

function Pared({ r, lang, navegable }: { r: PublicoResumen; lang: Lang; navegable: boolean }) {
  return (
    <ul className="ugmp-b-pared">
      {r.categorias.map((c) => {
        const v = CAT_VISUAL[c.categoria];
        const cuerpo = (
          <>
            <span className="ugmp-b-num" aria-hidden="true">{c.numero}</span>
            <b>{lang === "en" ? c.nombre_en : c.nombre_es}</b>
            <span>{tx(lang, "n_de_m", { n: c.publicados, m: c.total })}</span>
            <Regleta n={c.publicados} m={c.total} lang={lang} clave={`b-${c.categoria}`} />
          </>
        );
        const estilo = { "--ugmp-bg": v.bg, "--ugmp-on": v.on } as CSSProperties;
        return (
          <li key={c.categoria}>
            {navegable ? (
              <Link to={rutaCategoria(c.categoria, lang, r.ciclo.anio)} className="ugmp-b-card" style={estilo}>{cuerpo}</Link>
            ) : (
              <div className="ugmp-b-card" style={estilo}>{cuerpo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Avance({ r, lang, navegable }: { r: PublicoResumen; lang: Lang; navegable: boolean }) {
  return (
    <div className="ugmp-b-avance">
      <p className="ugmp-b-total">
        <b>{r.total.publicados}</b>
        <span>{tx(lang, "n_de_m", { n: r.total.publicados, m: r.total.total })}</span>
      </p>
      <Regleta n={r.total.publicados} m={r.total.total} lang={lang} clase="wide" clave="b-total" />
      <ul className="ugmp-b-filas">
        {r.categorias.map((c) => (
          <li key={c.categoria}>
            {navegable ? <Link to={rutaCategoria(c.categoria, lang, r.ciclo.anio)}>{lang === "en" ? c.nombre_en : c.nombre_es}</Link> : <span>{lang === "en" ? c.nombre_en : c.nombre_es}</span>}
            <Regleta n={c.publicados} m={c.total} lang={lang} clave={`b-${c.categoria}`} />
          </li>
        ))}
      </ul>
      {navegable && (
        <Link to={RUTA_GREEN} className="ugmp-b-ir">
          {tx(lang, "tarjeta_ir")}
        </Link>
      )}
    </div>
  );
}
