/* =============================================================================
   UI GreenMetric · página pública · portada de /sostenible/green.

   El diseño del portal de informes de THE Impact (titular, lede, cifras sobre un
   filete, conmutadores con filete, buscador, pared de carteles), con las siete
   categorías. Cada cartel lleva «N de M indicadores publicados» y su regleta de
   cuadros. Sin puntos, sin pesos, sin porcentaje, sin puesto.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { wallLayout } from "../../../sostenible/ods-portal-wall";
import type { WallSlot } from "../../../sostenible/ods-portal-wall";
import { useSlidingRule } from "../../../sostenible/ods-portal-rule";
import { OdsPortalArrow } from "../../../sostenible/OdsPortalArrow";
import { useLang } from "../../../sostenible/i18n";
import { usePublicoResumen } from "../datos";
import type { CategoriaId, PublicoResumen, PublicoResumenCategoria } from "../lib/tipos";
import { fecha, rutaCategoria, useSeo } from "./logica";
import { entradaPortada, useCambiosEnVivo } from "./movimiento";
import { Estado, Icono, Marco, Regleta, useEdicion } from "./piezas";
import { CAT_ICONO, CAT_VISUAL, tx } from "./textos";
import type { Lang } from "./textos";

gsap.registerPlugin(useGSAP);

type Filtro = "todas" | "con";
const area = (s: WallSlot | undefined, k: string) => (s ? { [`--${k}c`]: `${s.col} / span ${s.w}`, [`--${k}r`]: `${s.row} / span ${s.h}` } : {});
const nombre = (c: PublicoResumenCategoria, lang: Lang) => (lang === "en" ? c.nombre_en : c.nombre_es);

export function Portada() {
  const { lang } = useLang();
  const ed = useEdicion();
  useSeo(`UI GreenMetric${ed.ciclo ? ` ${ed.ciclo.anio}` : ""} · UDES Sostenible`, tx(lang, "portada_lede"));
  const resumen = usePublicoResumen(ed.ciclo?.id);

  return (
    <Marco volver={{ to: "/sostenible", texto: tx(lang, "volver_sos") }}>
      {ed.cargando || (ed.ciclo && resumen.isPending) ? (
        <Estado tipo="cargando" lang={lang} />
      ) : ed.error || resumen.isError ? (
        <Estado tipo="error" lang={lang} />
      ) : !ed.ciclo || !resumen.data ? (
        <Estado tipo="vacio" lang={lang} />
      ) : (
        <Cuerpo resumen={resumen.data} lang={lang} edicion={ed} />
      )}
    </Marco>
  );
}

function Cuerpo({ resumen, lang, edicion }: { resumen: PublicoResumen; lang: Lang; edicion: ReturnType<typeof useEdicion> }) {
  const root = useRef<HTMLDivElement>(null);
  const edBox = useRef<HTMLDivElement>(null);
  const fBox = useRef<HTMLDivElement>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [q, setQ] = useState("");
  const anio = resumen.ciclo.anio;

  const cats = resumen.categorias;
  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return new Set(
      cats
        .filter((c) => (filtro === "todas" || c.publicados > 0) && (!needle || `${c.categoria} ${c.nombre_es} ${c.nombre_en} ${CAT_VISUAL[c.categoria].es} ${CAT_VISUAL[c.categoria].en}`.toLowerCase().includes(needle)))
        .map((c) => c.categoria),
    );
  }, [cats, filtro, q]);
  const layout = useMemo(() => {
    const items = cats.filter((c) => visibles.has(c.categoria)).map((c) => ({ id: c.numero, size: CAT_VISUAL[c.categoria].size }));
    return { four: wallLayout(items, 4), two: wallLayout(items, 2) };
  }, [cats, visibles]);

  const sum = (k: "graficas" | "tablas" | "evidencias_publicas") => cats.reduce((a, c) => a + c[k], 0);
  const firma = cats.map((c) => c.publicados).join(".");
  const avisar = useCambiosEnVivo(root, firma);

  useGSAP(() => entradaPortada(root.current as HTMLElement), { scope: root });
  useSlidingRule(edBox, edicion.ciclo?.anio);
  useSlidingRule(fBox, filtro);

  const sinNada = resumen.total.publicados === 0;
  return (
    <div ref={root} className="opt-view">
      <div className="ugmp-bands" aria-hidden="true">
        {cats.map((c) => (
          <i key={c.categoria} style={{ background: CAT_VISUAL[c.categoria].bg }} />
        ))}
      </div>

      <header className="odsx-wrap opt-head">
        <div className="opt-head__main">
          <h1 className="opt-title">
            <span className="opt-line">
              <span>{tx(lang, "portada_t1")}</span>
            </span>{" "}
            <span className="opt-line">
              <span>UI GreenMetric {anio}</span>
            </span>
          </h1>
          <p className="opt-lede ugmp-in">{tx(lang, "portada_lede")}</p>
        </div>
        <figure className="opt-word ugmp-in">
          <blockquote className="opt-word__quote">
            <p>{tx(lang, "regla")}</p>
          </blockquote>
          <figcaption className="ugmp-regla">{tx(lang, "regla_t")}</figcaption>
        </figure>
      </header>

      <div className="odsx-wrap">
        <div className="opt-figs ugmp-in">
          <p className="opt-fig">
            <b>
              {resumen.total.publicados}
              <i className="ugmp-of">/{resumen.total.total}</i>
            </b>
            <span>{tx(lang, "publicados")}</span>
          </p>
          <p className="opt-fig">
            <b>{sum("graficas") + sum("tablas")}</b>
            <span>{tx(lang, "viz")}</span>
          </p>
          <p className="opt-fig">
            <b>{sum("evidencias_publicas")}</b>
            <span>{tx(lang, "evid")}</span>
          </p>
          <p className="opt-fig">
            <b>{fecha(resumen.actualizado, lang) || "—"}</b>
            <span>{tx(lang, "actualizacion")}</span>
          </p>
        </div>

        <div className="opt-tools ugmp-in">
          {edicion.ciclos.length > 0 && (
            <div ref={edBox} className="opt-switch" role="group" aria-label={tx(lang, "edicion")}>
              <span className="opt-switch__label" aria-hidden="true">
                {tx(lang, "edicion")}
              </span>
              {edicion.ciclos.map((c) => (
                <button key={c.id} type="button" aria-pressed={c.id === edicion.ciclo?.id} aria-label={tx(lang, "edicion_n", { e: c.anio })} onClick={() => edicion.elegir(c.anio)}>
                  {c.anio}
                </button>
              ))}
              <i className="opt-rule" aria-hidden="true" />
            </div>
          )}
          <div ref={fBox} className="opt-switch" role="group" aria-label={tx(lang, "filtrar")}>
            {(["todas", "con"] as Filtro[]).map((f) => (
              <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
                {f === "todas" ? tx(lang, "todas") : tx(lang, "con_datos")}
              </button>
            ))}
            <i className="opt-rule" aria-hidden="true" />
          </div>
          <label className="opt-search">
            <span className="opt-vh">{tx(lang, "buscar")}</span>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
              <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.75" />
              <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
            </svg>
            <input type="search" placeholder={tx(lang, "buscar")} value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      </div>

      {sinNada && (
        <div className="odsx-wrap ugmp-in">
          <div className="ugmp-vacio" role="status">
            <b>{tx(lang, "nada_t")}</b>
            <span>{tx(lang, "nada_x")}</span>
          </div>
        </div>
      )}

      <h2 className="opt-vh">{tx(lang, "categorias")}</h2>
      <ol className={`odsx-wrap opt-wall ugmp-wall${sinNada ? " is-quiet" : ""}`}>
        {cats.map((c) => (
          <Cartel key={c.categoria} c={c} lang={lang} anio={anio} four={layout.four.get(c.numero)} two={layout.two.get(c.numero)} />
        ))}
      </ol>
      <div className="odsx-wrap">
        {visibles.size === 0 && <p className="opt-empty" role="status">{tx(lang, "ninguna")}</p>}
        <p className="odsx-note opt-foot">{tx(lang, "nota_regleta")}</p>
        <p className="opt-vh" role="status" aria-live="polite">
          {avisar ? tx(lang, "cambio_pub") : ""}
        </p>
      </div>
    </div>
  );
}

function Cartel({ c, lang, anio, four, two }: { c: PublicoResumenCategoria; lang: Lang; anio: number; four?: WallSlot; two?: WallSlot }) {
  const v = CAT_VISUAL[c.categoria as CategoriaId];
  const off = !four;
  const id = `ugmp-t-${c.categoria}`;
  const pend = c.total - c.publicados;
  return (
    <li
      className={`opt-card ugmp-card is-${v.size}${v.size === "s" && four && four.w > 1 ? " is-stretch" : ""}${off ? " is-off" : ""}`}
      style={{ "--o-acc": v.bg, "--p-on": v.on, "--slip-ink": v.bg, ...area(four, "g4"), ...area(two, "g2") } as CSSProperties}
      aria-hidden={off || undefined}
    >
      <Link to={rutaCategoria(c.categoria, lang, anio)} className="opt-card__link" aria-label={`${nombre(c, lang)}. ${tx(lang, "n_de_m", { n: c.publicados, m: c.total })}`} aria-describedby={id} tabIndex={off ? -1 : undefined}>
        <span className="opt-card__num" aria-hidden="true">
          {c.numero}
        </span>
        <span className="opt-card__fig" aria-hidden="true">
          <Icono d={CAT_ICONO[c.categoria]} />
        </span>
        <span className="opt-card__id">
          <b className="opt-card__name">{nombre(c, lang)}</b>
          <span className="ugmp-card__st">
            <span className="opt-card__line">{tx(lang, "n_de_m", { n: c.publicados, m: c.total })}</span>
            <Regleta n={c.publicados} m={c.total} lang={lang} clave={c.categoria} />
          </span>
        </span>
        <span className="opt-card__slip">
          <span className="opt-card__slipname" aria-hidden="true">
            {nombre(c, lang)}
          </span>
          <span className="opt-card__thesis" id={id}>
            {v[lang]}
            {pend > 0 ? ` · ${tx(lang, "en_prep", { n: pend })}` : ""}
          </span>
          <span className="opt-card__go" aria-hidden="true">
            {tx(lang, "leer_informe")} <OdsPortalArrow />
          </span>
        </span>
      </Link>
    </li>
  );
}
