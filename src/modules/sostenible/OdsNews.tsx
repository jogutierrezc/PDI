/* =============================================================================
   UDES Sostenible · las noticias al final de cada informe ODS, en carrusel.

   TODAS las notas de udes.edu.co que Planeación aprobó para este ODS
   (recolector, 0143), de la más reciente a la más antigua: foto, fecha,
   título, extracto y el enlace a la nota completa. En inglés, el título y el
   extracto en inglés si existen; si no, el original con la marca «ES». Sin
   notas aprobadas la sección no existe. Nada de porcentajes ni estados.

   Carrusel nativo: scroll-snap, flechas, teclado (← y → con el carrusel
   enfocado) y un contador que se anuncia. Se pintan de 24 en 24 («Ver N
   más»); si una referencia del relato o una fila del registro apunta a una
   nota aún no pintada (#osn-<id>), el carrusel se abre hasta ella. Si el
   informe recortó la foto de una nota, la tarjeta usa su punto de interés.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { Recorte } from "../rankings/informes/tipos";
import { estiloRecorte } from "../rankings/informes/recorte";
import { odsOn } from "./OdsArt";
import { odsByNumber } from "./ods-data";
import { useNoticiasPublicas } from "./ods-noticias";
import { fechaCorta, tr } from "./i18n";
import type { Lang } from "./i18n";
import { Bi } from "./LangSwitch";
import { reduced } from "./widgets";
import "./ods-news.css";

/** Lo que el carrusel necesita de una nota (sirve tanto la pública como la de la intranet). */
export interface NotaCarrusel {
  id: string;
  url: string;
  title: string;
  title_en?: string;
  excerpt: string;
  excerpt_en?: string;
  image_url: string | null;
  published_on: string | null;
  section: string;
  campus: string;
}

export const LOTE_CARRUSEL = 24;

/** De la más reciente a la más antigua; sin fecha, al final. */
export function ordenarCarrusel<T extends Pick<NotaCarrusel, "published_on">>(notas: T[]): T[] {
  return notas.slice().sort((a, b) => (b.published_on ?? "").localeCompare(a.published_on ?? ""));
}

function Foto({ n, crop }: { n: NotaCarrusel; crop?: Recorte }) {
  const [failed, setFailed] = useState(false);
  const est = crop ? estiloRecorte({ ...crop, ratio: "4:3" }) : undefined;
  return (
    <div className="osn-photo">
      {n.image_url && !failed ? (
        <img src={n.image_url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" style={est ? { objectPosition: est.objectPosition } : undefined} onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">UDES</span>
      )}
    </div>
  );
}

export function OdsNewsCarousel({ n, notas, recortes, lang = "es" }: { n: number; notas: NotaCarrusel[]; recortes?: Record<string, Recorte>; lang?: Lang }) {
  const o = odsByNumber(n);
  const track = useRef<HTMLDivElement>(null);
  const lista = ordenarCarrusel(notas);
  const total = lista.length;
  const [cuantas, setCuantas] = useState(LOTE_CARRUSEL);
  const visibles = lista.slice(0, cuantas);
  const [vista, setVista] = useState({ desde: 1, hasta: Math.min(total, 3), inicio: true, fin: total <= 3 });
  const pendiente = useRef<string | null>(null);

  const paso = useCallback(() => {
    const t = track.current;
    const f = t?.firstElementChild as HTMLElement | null;
    if (!t || !f) return { card: 320, vis: 1 };
    const gap = parseFloat(getComputedStyle(t).columnGap || "0") || 0;
    const card = f.getBoundingClientRect().width + gap;
    return { card, vis: Math.max(1, Math.floor((t.clientWidth + gap) / card)) };
  }, []);

  const medir = useCallback(() => {
    const t = track.current;
    if (!t) return;
    const { card, vis } = paso();
    const i = Math.round(t.scrollLeft / card);
    setVista({ desde: Math.min(total, i + 1), hasta: Math.min(total, i + vis), inicio: t.scrollLeft < 4, fin: cuantas >= total && t.scrollLeft + t.clientWidth >= t.scrollWidth - 4 });
  }, [paso, total, cuantas]);

  useEffect(() => {
    medir();
    const t = track.current;
    if (!t) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(medir);
    };
    t.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      t.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [medir]);

  /* Una referencia (#osn-<id>) a una nota aún no pintada abre el carrusel hasta ella. */
  const ids = lista.map((x) => x.id).join();
  useEffect(() => {
    const abrirHasta = () => {
      const m = /^#osn-(.+)$/.exec(decodeURIComponent(location.hash));
      if (!m) return;
      const i = ids.split(",").indexOf(m[1]);
      if (i < 0) return;
      pendiente.current = m[1];
      setCuantas((c) => (i < c ? c : Math.ceil((i + 1) / LOTE_CARRUSEL) * LOTE_CARRUSEL));
    };
    abrirHasta();
    window.addEventListener("hashchange", abrirHasta);
    return () => window.removeEventListener("hashchange", abrirHasta);
  }, [ids]);
  useEffect(() => {
    const id = pendiente.current;
    if (!id) return;
    const el = document.getElementById(`osn-${id}`);
    if (!el) return;
    pendiente.current = null;
    el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center", inline: "center" });
  }, [cuantas, ids]);

  if (!o || !total) return null;

  const ir = (dir: 1 | -1) => {
    const t = track.current;
    if (!t) return;
    const { card, vis } = paso();
    if (dir === 1 && t.scrollLeft + t.clientWidth >= t.scrollWidth - 4 && cuantas < total) setCuantas((c) => c + LOTE_CARRUSEL);
    t.scrollBy({ left: dir * card * vis, behavior: reduced() ? "auto" : "smooth" });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      ir(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      ir(-1);
    }
  };

  const contador = vista.desde === vista.hasta ? tr(lang, "uno_de", { a: vista.desde, n: total }) : tr(lang, "rango_de", { a: vista.desde, b: vista.hasta, n: total });
  const quedan = total - visibles.length;

  return (
    <section className="osn" aria-labelledby="osn-h" lang={lang} style={{ "--c": o.color, "--on": odsOn(o.color) } as CSSProperties}>
      <div className="odsx-wrap osn-head">
        <div className="osn-head__t">
          <h2 id="osn-h">{tr(lang, "noticias_t")}</h2>
          <p>{total === 1 ? tr(lang, "notas_1") : tr(lang, "notas_n", { n: total })}</p>
        </div>
        <div className="osn-nav">
          <button type="button" onClick={() => ir(-1)} disabled={vista.inicio} aria-label={tr(lang, "noticias_anteriores")} aria-controls="osn-track">
            <span aria-hidden="true">←</span>
          </button>
          <span className="osn-count" aria-live="polite">
            {contador}
          </span>
          <button type="button" onClick={() => ir(1)} disabled={vista.fin} aria-label={tr(lang, "noticias_siguientes")} aria-controls="osn-track">
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      <div ref={track} id="osn-track" className="osn-track" tabIndex={0} role="group" aria-roledescription={tr(lang, "carrusel")} aria-label={tr(lang, "carrusel_label")} onKeyDown={onKey}>
        {visibles.map((x) => (
          <article key={x.id} id={`osn-${x.id}`} className="osn-card" aria-labelledby={`osn-t-${x.id}`}>
            <Foto n={x} crop={recortes?.[x.id]} />
            <p className="osn-meta">
              {x.section && <b>{[x.section, x.campus].filter(Boolean).join(" · ")}</b>}
              {x.published_on && <time dateTime={x.published_on}>{fechaCorta(x.published_on, lang)}</time>}
            </p>
            <h3 id={`osn-t-${x.id}`}>
              <Bi lang={lang} es={x.title} en={x.title_en} />
            </h3>
            {(x.excerpt || x.excerpt_en) && <Bi as="p" className="osn-x" lang={lang} es={x.excerpt} en={x.excerpt_en} marca={false} />}
            <a className="osn-more" href={x.url} target="_blank" rel="noopener noreferrer">
              {tr(lang, "leer_nota")} <span aria-hidden="true">↗</span>
              <span className="osn-vh"> {tr(lang, "otra_pestana")}</span>
            </a>
          </article>
        ))}
        {quedan > 0 && (
          <div className="osn-card osn-card--more">
            <button type="button" className="osn-morebtn" onClick={() => setCuantas((c) => c + LOTE_CARRUSEL)}>
              {tr(lang, "ver_mas", { n: Math.min(LOTE_CARRUSEL, quedan) })}
              <span aria-hidden="true"> →</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** El carrusel del portal: TODAS las notas aprobadas de este ODS. */
export function OdsNews({ n, recortes, lang = "es" }: { n: number; recortes?: Record<string, Recorte>; lang?: Lang }) {
  const q = useNoticiasPublicas(n);
  return <OdsNewsCarousel n={n} notas={q.data ?? []} recortes={recortes} lang={lang} />;
}
