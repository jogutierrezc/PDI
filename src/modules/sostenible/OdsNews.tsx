/* =============================================================================
   UDES Sostenible · las noticias al final de cada informe ODS, en carrusel.

   Las notas de udes.edu.co que Planeación aprobó para este ODS (recolector de
   noticias, migración 0143), de la más reciente a la más antigua: foto, fecha,
   título, extracto y el enlace a la nota completa. Sin notas aprobadas la
   sección no existe: ni encabezado ni mensaje. Nada de porcentajes ni estados.

   Carrusel nativo: desplazamiento horizontal con scroll-snap, flechas, teclado
   (← y → con el carrusel enfocado) y un contador «1–3 de 11» que se anuncia.
   Cada tarjeta lleva id `osn-<id>`: las referencias numeradas del relato
   (OdsPilo) llevan aquí. Si el informe recortó la foto de una nota, la tarjeta
   usa su punto de interés.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useApprovedNews } from "../rankings/noticias";
import type { NewsItem } from "../rankings/noticias";
import type { Recorte } from "../rankings/informes/tipos";
import { estiloRecorte, fechaCorta } from "../rankings/informes/recorte";
import { odsOn } from "./OdsArt";
import { odsByNumber } from "./ods-data";
import { reduced } from "./widgets";
import "./ods-news.css";

/** Lo que el carrusel necesita de una nota (sirve tanto la pública como la de la intranet). */
export type NotaCarrusel = Pick<NewsItem, "id" | "url" | "title" | "excerpt" | "image_url" | "published_on" | "section" | "campus">;

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
        <img
          src={n.image_url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          style={est ? { objectPosition: est.objectPosition } : undefined}
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">UDES</span>
      )}
    </div>
  );
}

export function OdsNewsCarousel({ n, notas, recortes, titulo }: { n: number; notas: NotaCarrusel[]; recortes?: Record<string, Recorte>; titulo?: string }) {
  const o = odsByNumber(n);
  const track = useRef<HTMLDivElement>(null);
  const lista = ordenarCarrusel(notas);
  const total = lista.length;
  const [vista, setVista] = useState({ desde: 1, hasta: Math.min(total, 3), inicio: true, fin: total <= 3 });

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
    setVista({ desde: i + 1, hasta: Math.min(total, i + vis), inicio: t.scrollLeft < 4, fin: t.scrollLeft + t.clientWidth >= t.scrollWidth - 4 });
  }, [paso, total]);

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

  if (!o || !total) return null;

  const ir = (dir: 1 | -1) => {
    const t = track.current;
    if (!t) return;
    const { card, vis } = paso();
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

  const contador = vista.desde === vista.hasta ? `${vista.desde} de ${total}` : `${vista.desde}–${vista.hasta} de ${total}`;

  return (
    <section className="osn" aria-labelledby="osn-h" style={{ "--c": o.color, "--on": odsOn(o.color) } as CSSProperties}>
      <div className="odsx-wrap osn-head">
        <div className="osn-head__t">
          <h2 id="osn-h">{titulo ?? "La UDES en las noticias"}</h2>
          <p>
            {total === 1 ? "1 nota de 2025" : `${total} notas de 2025`} sobre este ODS, publicadas en udes.edu.co.
          </p>
        </div>
        <div className="osn-nav">
          <button type="button" onClick={() => ir(-1)} disabled={vista.inicio} aria-label="Noticias anteriores" aria-controls="osn-track">
            <span aria-hidden="true">←</span>
          </button>
          <span className="osn-count" aria-live="polite">
            {contador}
          </span>
          <button type="button" onClick={() => ir(1)} disabled={vista.fin} aria-label="Noticias siguientes" aria-controls="osn-track">
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      <div ref={track} id="osn-track" className="osn-track" tabIndex={0} role="group" aria-roledescription="carrusel" aria-label="Noticias del ODS; usa las flechas del teclado para avanzar" onKeyDown={onKey}>
        {lista.map((x) => (
          <article key={x.id} id={`osn-${x.id}`} className="osn-card" aria-labelledby={`osn-t-${x.id}`}>
            <Foto n={x} crop={recortes?.[x.id]} />
            <p className="osn-meta">
              {x.section && <b>{[x.section, x.campus].filter(Boolean).join(" · ")}</b>}
              {x.published_on && <time dateTime={x.published_on}>{fechaCorta(x.published_on)}</time>}
            </p>
            <h3 id={`osn-t-${x.id}`}>{x.title}</h3>
            {x.excerpt && <p className="osn-x">{x.excerpt}</p>}
            <a className="osn-more" href={x.url} target="_blank" rel="noopener noreferrer">
              Leer la nota en udes.edu.co <span aria-hidden="true">↗</span>
              <span className="osn-vh"> (se abre en otra pestaña)</span>
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

/** El carrusel del portal: las notas aprobadas de este ODS. */
export function OdsNews({ n, recortes }: { n: number; recortes?: Record<string, Recorte> }) {
  const q = useApprovedNews(n);
  return <OdsNewsCarousel n={n} notas={q.data ?? []} recortes={recortes} />;
}
