/* =============================================================================
   UI GreenMetric · página pública · una categoría (/sostenible/green/:categoria).

   Cabecera de color de la categoría, cifras con la regleta, los indicadores
   publicados (narrativa, cifras con año, tablas, gráficas, evidencias), los
   calculados que ya pueden salir y los programas. Al pasar de una categoría a
   otra la página entra de nuevo; un indicador que se publica mientras alguien lee
   entra marcado unos segundos, sin sacudir nada.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useLang } from "../../../sostenible/i18n";
import { usePublicoCategoria, usePublicoResumen } from "../datos";
import type { CategoriaId, PublicoCategoria, PublicoIndicador, PublicoResumenCategoria } from "../lib/tipos";
import { FilaIndicador } from "./Indicador";
import { RUTA_GREEN, fecha, rutaCategoria, useSeo } from "./logica";
import { entradaCategoria, useCambiosEnVivo } from "./movimiento";
import { Estado, Marco, Regleta, useEdicion } from "./piezas";
import { CAT_VISUAL, tx } from "./textos";
import type { Lang } from "./textos";

gsap.registerPlugin(useGSAP);

/** Las preguntas cuya tabla es una lista de programas e iniciativas (guía 2026). */
const PROGRAMAS = new Set(["2.14", "6.15", "6.16", "7.12", "7.13"]);

export function Categoria() {
  const { lang } = useLang();
  const { categoria } = useParams();
  const cat = (categoria ?? "").toUpperCase();
  const ed = useEdicion();
  const resumen = usePublicoResumen(ed.ciclo?.id);
  const datos = usePublicoCategoria(ed.ciclo?.id, cat in CAT_VISUAL ? cat : undefined, lang);
  const fila = resumen.data?.categorias.find((c) => c.categoria === cat);
  const nombre = datos.data?.categoria ? datos.data.categoria.nombre : "";
  useSeo(`${nombre || cat} · UI GreenMetric${ed.ciclo ? ` ${ed.ciclo.anio}` : ""} · UDES Sostenible`, fila ? tx(lang, "n_de_m", { n: fila.publicados, m: fila.total }) : tx(lang, "portada_lede"));

  const cargando = ed.cargando || resumen.isPending || (cat in CAT_VISUAL && datos.isPending);
  return (
    <Marco volver={{ to: `${RUTA_GREEN}${lang === "en" ? "?lang=en" : ""}`, texto: tx(lang, "todas_cat") }}>
      {cargando ? (
        <Estado tipo="cargando" lang={lang} />
      ) : ed.error || resumen.isError || datos.isError ? (
        <Estado tipo="error" lang={lang} />
      ) : !fila || !datos.data ? (
        <Estado tipo="vacio" lang={lang} titulo={tx(lang, "ninguna")} texto="" />
      ) : (
        <Cuerpo key={cat} fila={fila} datos={datos.data} otras={resumen.data?.categorias ?? []} lang={lang} />
      )}
    </Marco>
  );
}

function Cuerpo({ fila, datos, otras, lang }: { fila: PublicoResumenCategoria; datos: PublicoCategoria; otras: PublicoResumenCategoria[]; lang: Lang }) {
  const root = useRef<HTMLDivElement>(null);
  const v = CAT_VISUAL[fila.categoria as CategoriaId];
  const lista = [...datos.indicadores, ...datos.calculados];
  const anio = datos.ciclo.anio;
  const pend = fila.total - fila.publicados;
  const avisar = useCambiosEnVivo(root, String(fila.publicados));

  // Los indicadores que aparecen después de la primera lectura se marcan unos segundos.
  const vistos = useRef<Set<string> | null>(null);
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  const claves = lista.map((i) => i.q).join("|");
  useEffect(() => {
    const ahora = new Set(lista.map((i) => i.q));
    const antes = vistos.current;
    vistos.current = ahora;
    if (!antes) return;
    const agregados = [...ahora].filter((q) => !antes.has(q));
    if (!agregados.length) return;
    setNuevos(new Set(agregados));
    const t = window.setTimeout(() => setNuevos(new Set()), 4000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claves]);

  useGSAP(() => entradaCategoria(root.current as HTMLElement), { scope: root });

  const programas = datos.indicadores.filter((i) => PROGRAMAS.has(i.q)).flatMap((i) => programasDe(i));
  return (
    <div ref={root} className="opt-view">
      <div className="ugmp-chead" style={{ "--ugmp-bg": v.bg, "--ugmp-on": v.on } as CSSProperties}>
        <div className="odsx-wrap ugmp-chead__in">
          <span className="ugmp-chead__num" aria-hidden="true">
            {fila.numero}
          </span>
          <p className="ugmp-chead__code">{fila.categoria}</p>
          <h1 className="ugmp-chead__name">{datos.categoria.nombre}</h1>
          <p className="ugmp-chead__lede">{v[lang]}</p>
        </div>
      </div>

      <div className="odsx-wrap">
        <div className="opt-figs ugmp-in">
          <p className="opt-fig">
            <b>
              {fila.publicados}
              <i className="ugmp-of">/{fila.total}</i>
            </b>
            <span>{tx(lang, "publicados")}</span>
          </p>
          <p className="opt-fig">
            <b>{fila.graficas + fila.tablas}</b>
            <span>{tx(lang, "viz_corto")}</span>
          </p>
          <p className="opt-fig">
            <b>{fila.evidencias_publicas}</b>
            <span>{tx(lang, "evid")}</span>
          </p>
          <div className="opt-fig">
            <Regleta n={fila.publicados} m={fila.total} lang={lang} clase="wide" clave={fila.categoria} />
            <span>{pend > 0 ? tx(lang, "en_prep", { n: pend }) : tx(lang, "todo_pub")}</span>
          </div>
        </div>

        {lista.length > 0 ? (
          <section aria-labelledby="ugmp-pub">
            <h2 id="ugmp-pub" className="ugmp-h ugmp-in">
              {tx(lang, "indicadores_pub")}
            </h2>
            <ol className="ugmp-inds">
              {lista.map((i) => (
                <FilaIndicador key={i.q} i={i} ciclo={datos.ciclo} lang={lang} nuevo={nuevos.has(i.q)} edicion={anio} />
              ))}
            </ol>
          </section>
        ) : (
          <div className="ugmp-vacio ugmp-in" role="status">
            <b>{tx(lang, "cat_vacia_t")}</b>
            <span>{tx(lang, "cat_vacia_x")}</span>
          </div>
        )}

        {programas.length > 0 && (
          <section className="ugmp-sec ugmp-in" aria-labelledby="ugmp-prog">
            <h2 id="ugmp-prog" className="ugmp-h">
              {tx(lang, "prog")}
            </h2>
            <ul className="ugmp-progs">
              {programas.map((p, k) => (
                <li key={k} lang={lang}>
                  <b>{p.titulo}</b>
                  {p.detalle && <span>{p.detalle}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav className="ugmp-otras ugmp-in" aria-label={tx(lang, "otras_cat")}>
          <h2 className="ugmp-h">{tx(lang, "otras_cat")}</h2>
          <ul>
            {otras.map((c) => (
              <li key={c.categoria}>
                <Link to={rutaCategoria(c.categoria, lang, anio)} aria-current={c.categoria === fila.categoria ? "page" : undefined} style={{ "--ugmp-bg": CAT_VISUAL[c.categoria].bg } as CSSProperties}>
                  <b>{c.categoria}</b> {lang === "en" ? c.nombre_en : c.nombre_es}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="odsx-note ugmp-foot">
          {tx(lang, "nota_textos")}
        </p>
        <p className="opt-vh" role="status" aria-live="polite">
          {avisar || nuevos.size ? tx(lang, "cambio_pub") : ""}
        </p>
        <p className="ugmp-foot">{tx(lang, "actualizado_en", { f: fecha(datos.actualizado, lang) })}</p>
      </div>
    </div>
  );
}

/** Las filas de la primera tabla de un indicador de programas: la primera columna es el nombre. */
function programasDe(i: PublicoIndicador): { titulo: string; detalle: string }[] {
  const t = i.tablas?.[0];
  if (!t || !t.columnas.length) return [];
  const [primera, ...resto] = t.columnas;
  return t.filas
    .slice(0, 4)
    .map((f) => ({
      titulo: String(f[primera.k] ?? "").trim(),
      detalle: resto.filter((c) => c.tipo === "texto").map((c) => String(f[c.k] ?? "").trim()).filter(Boolean).join(" · "),
    }))
    .filter((p) => p.titulo);
}
