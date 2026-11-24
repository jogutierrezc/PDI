/* =============================================================================
   Portal de Planeación Institucional · portada.

   La puerta de la oficina. En orden:
   1. El plano y el buscador: la tarea principal es encontrar algo; el fondo
      dibuja un plano (Planeación) con los tres portales como hitos.
   2. Nuestros portales: un mosaico donde cada bloque tiene la materia de su
      portal —el video y el tablero de UDES en Cifras, los pilares del PDI con
      su avance real, las portadas de los boletines, las áreas de la oficina,
      los catorce temas del Observatorio—, no tarjetas iguales.
   3. La galería de la oficina: las fotografías que sube Planeación.
   4. Lo más reciente: lo que se ha publicado, con su fecha, sin redactar nada.
   5. El equipo: quién lo hace, con su ficha ampliada.
   6. La oficina: propósito y accesos.

   Lo editorial —titulares, fotografías, equipo, áreas y accesos— ya no vive en
   el código: se edita en la intranet («Página de la oficina») y llega aquí
   publicado. Sin nada publicado, el portal usa los valores de content.ts.

   Colores: la escala azul UDES hace todo el trabajo; el ámbar de UDES en
   Cifras solo aparece en su bloque. Nada de cifras de dinero.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { useCurrentPeriod, usePillars, useSummary } from "../../data/queries";
import { formatDate } from "../../data/pdi";
import { formatValue, useOpenDataCatalog } from "../datos-abiertos/data/open-data";
import { OBS_TOPICS } from "../datos-abiertos/observatorio/data";
import { useObservatoryLive } from "../datos-abiertos/observatorio/live";
import { usePublicBulletins } from "../boletin/data";
import { OfficeGallery } from "./OfficeGallery";
import { useOfficePage } from "./page";
import type { OfficeAreaItem, TeamPerson } from "./page";
import { PlanLayout } from "./PlanLayout";
import { SiteSearch } from "./SiteSearch";
import { TeamCarousel } from "./TeamCarousel";

/* Video de fondo del hero (YouTube): mudo, en bucle, sin controles y detrás del contenido.
   Con «reducir movimiento» no se carga y queda el azul de la portada. */
const HERO_VIDEO_ID = "Vp8eMV9gHEk";

function HeroBackdrop() {
  const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (calm) return null;
  const params = `autoplay=1&mute=1&loop=1&playlist=${HERO_VIDEO_ID}&controls=0&modestbranding=1&rel=0&playsinline=1&disablekb=1&iv_load_policy=3&fs=0`;
  return (
    <div className="pl-backdrop" aria-hidden="true">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${HERO_VIDEO_ID}?${params}`}
        title=""
        tabIndex={-1}
        allow="autoplay; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

export function PlaneacionHome() {
  const searchInput = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const { page } = useOfficePage();

  const focusSearch = () => {
    document.getElementById("buscar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    searchInput.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (location.hash === "#buscar") window.setTimeout(focusSearch, 60);
  }, [location.hash]);

  return (
    <PlanLayout title="Planeación Institucional | Universidad de Santander" onSearch={focusSearch}>
      <section className="pl-hero" id="buscar" aria-labelledby="pl-titulo">
        <HeroBackdrop />
        <div className="pl-container pl-hero__inner">
          <h1 id="pl-titulo">{page.home.title}</h1>
          <p className="pl-hero__lede">{page.home.lede}</p>
          <SiteSearch inputRef={searchInput} />
        </div>
      </section>

      <section className="pl-section pl-portals" aria-labelledby="pl-portales">
        <div className="pl-container">
          <div className="pl-section__head">
            <h2 id="pl-portales">{page.home.portalsTitle}</h2>
            <p>{page.home.portalsLede}</p>
          </div>
          <div className="pl-mosaic">
            <CifrasTile />
            <PdiTile />
            <BulletinsTile />
            <TeamTile areas={page.areas} people={page.team.people} />
            <ObservatoryTile />
          </div>
        </div>
      </section>

      <OfficeGallery title={page.gallery.title} lede={page.gallery.lede} slides={page.gallery.slides} />

      <Recent />

      <TeamCarousel
        title={page.team.title}
        lede={page.team.lede}
        people={page.team.people}
        areas={page.areas}
      />

      <section className="pl-section" aria-labelledby="pl-oficina">
        <div className="pl-container">
          <div className="pl-office">
            <div className="pl-office__text">
              <h2 id="pl-oficina">{page.home.closingTitle}</h2>
              <p>{page.office.purpose}</p>
              <Link className="pl-link" to="/equipo">
                Conocer la oficina <Icon name="arrow-right" size={16} />
              </Link>
            </div>
            <ul className="pl-office__links">
              {page.links.map((item) => (
                <li key={item.id}>
                  <Link to={item.to}>
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                    <Icon name="arrow-right" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </PlanLayout>
  );
}

/* --- Bloques de portal --------------------------------------------------------------- */

const REPORT_TONES = ["PB", "PE", "VI", "EN", "EX", "IN"];

export function CifrasTile() {
  const catalog = useOpenDataCatalog();
  const video = useRef<HTMLVideoElement>(null);
  const tile = useRef<HTMLElement>(null);
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const reports = catalog.data?.reports ?? [];

  // Se reproduce solo a la vista y sin movimiento reducido; con él, ni se descarga.
  useEffect(() => {
    const el = tile.current;
    const v = video.current;
    if (!el || !v || reduced || paused || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          v.play().then(() => setPlaying(true), () => setPlaying(false));
        } else {
          v.pause();
          setPlaying(false);
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, paused]);

  const togglePause = () => {
    const v = video.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
      setPaused(true);
    } else {
      setPaused(false);
      v.play().then(() => setPlaying(true), () => setPlaying(false));
    }
  };

  const shown = reports.length ? reports.slice(0, 6) : REPORT_TONES.map((code, i) => ({ code, line: i + 1, slug: code, name: code }));
  const extra = Math.max(0, reports.length - shown.length);

  return (
    <article className="pl-tile pl-tile--cifras" ref={tile}>
      {!reduced && (
        <video ref={video} className="pl-tile__video" src="/Multimedia1.mp4" poster="/udesback.webp" muted loop playsInline preload="none" aria-hidden="true" />
      )}
      {reduced && <img className="pl-tile__video" src="/udesback.webp" alt="" />}
      <span className="pl-tile__scrim" aria-hidden="true" />
      <div className="pl-tile__top">
        <span className="pl-flaps" aria-hidden="true">
          {"UDES".split("").map((c) => (
            <span key={c}>{c}</span>
          ))}
        </span>
        {!reduced && (
          <button type="button" className="pl-video-toggle" onClick={togglePause} aria-label={playing ? "Pausar el video" : "Reproducir el video"}>
            <span>{playing ? <PauseGlyph /> : <PlayGlyph />}</span>
            {playing ? "Pausar" : "Video institucional"}
          </button>
        )}
      </div>
      <div className="pl-tile__bottom">
        <h3>
          <Link className="pl-stretch" to="/datos-abiertos">
            UDES en Cifras
          </Link>
        </h3>
        <p>
          {reports.length ? `${reports.length === 11 ? "Once" : reports.length} informes` : "Los informes"} con las cifras oficiales de la universidad, por año, periodo y campus. Con su fuente y su corte
          {catalog.data?.cutoffDate ? ` (${formatDate(catalog.data.cutoffDate)})` : ""}.
        </p>
        <span className="pl-codes" aria-hidden="true">
          {shown.map((r) => (
            <span key={r.slug} style={{ "--tone": `var(--od-line-${r.line})` } as CSSProperties}>
              {r.code}
            </span>
          ))}
          {extra > 0 && <span data-more>+{extra}</span>}
        </span>
        <span className="pl-cta pl-cta--signal" aria-hidden="true">
          Entrar a las cifras <Icon name="arrow-right" size={16} />
        </span>
      </div>
    </article>
  );
}

const PlayGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const PauseGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
  </svg>
);

export function PdiTile() {
  const pillars = usePillars();
  const summary = useSummary();
  const progress = summary.data?.progress ?? null;
  const list = pillars.data ?? [];
  return (
    <article className="pl-tile pl-tile--pdi">
      <div className="pl-tile__row">
        <h3>
          <Link className="pl-stretch" to="/pdi">
            Portal PDI
          </Link>
        </h3>
        <span className="pl-pill">2024–2028</span>
      </div>
      <p>El Plan de Desarrollo Institucional en seguimiento público: pilares, proyectos, indicadores, facultades, campus y ODS.</p>
      <div className="pl-progress">
        <span>
          <span>Avance del plan</span>
          <b>{progress === null ? "—" : `${formatValue(progress, "decimal")} %`}</b>
        </span>
        <span className="pl-progress__track" aria-hidden="true">
          <i style={{ width: `${Math.min(100, progress ?? 0)}%` }} />
        </span>
      </div>
      <ol className="pl-pillars" aria-label="Pilares y su avance">
        {(list.length ? list : Array.from({ length: 6 }, () => null)).map((pillar, i) => (
          <li key={pillar?.id ?? i} style={{ "--tone": `var(--pillar-${pillar?.accent_slot ?? i + 1})`, "--fill": `${Math.min(100, pillar?.progress.progress ?? 0)}%` } as CSSProperties}>
            {pillar ? (
              <Link to={`/implementacion/pilar/${pillar.slug}`}>
                <span className="pl-pillars__name">{pillar.name}</span>
                <span className="pl-pillars__bar" aria-hidden="true">
                  <i />
                </span>
                <b>{formatValue(pillar.progress.progress, "decimal")} %</b>
              </Link>
            ) : (
              <span className="pl-pillars__empty" />
            )}
          </li>
        ))}
      </ol>
      <span className="pl-cta" aria-hidden="true">
        Ver el plan <Icon name="arrow-right" size={16} />
      </span>
    </article>
  );
}

export function BulletinsTile() {
  const catalog = useOpenDataCatalog();
  const bulletins = usePublicBulletins(catalog.data?.period?.uuid);
  const latest = bulletins.data?.editions[0];
  return (
    <article className="pl-tile pl-tile--bulletins">
      <h3>
        <Link className="pl-stretch" to="/datos-abiertos/boletines">
          Boletines
        </Link>
      </h3>
      <p>{latest ? `Última edición: ${latest.title}.` : "El boletín estadístico en PDF: completo, ejecutivo y por informe."}</p>
      <span className="pl-covers" aria-hidden="true">
        <span className="pl-cover pl-cover--back">
          <i />
          <b>Ejecutivo</b>
        </span>
        <span className="pl-cover pl-cover--front">
          <i />
          <b>Boletín estadístico</b>
          <small>{latest?.period_label ?? catalog.data?.period?.label ?? ""}</small>
        </span>
      </span>
    </article>
  );
}

export function TeamTile({ areas, people }: { areas: OfficeAreaItem[]; people: TeamPerson[] }) {
  return (
    <article className="pl-tile pl-tile--team">
      <h3>
        <Link className="pl-stretch" to="/equipo">
          Nuestro equipo
        </Link>
      </h3>
      <p>Quiénes planean, miden y acompañan a cada oficina, y cómo escribirles.</p>
      {areas.length > 0 && (
        <ul className="pl-areas" aria-label="Áreas de la oficina">
          {areas.map((a) => (
            <li key={a.id}>{a.name}</li>
          ))}
        </ul>
      )}
      <span className="pl-cta" aria-hidden="true">
        {people.length ? `Conocer a las ${people.length} personas` : "Conocer la oficina"} <Icon name="arrow-right" size={16} />
      </span>
    </article>
  );
}

export function ObservatoryTile() {
  const live = useObservatoryLive();
  const published = live.data?.size ?? 0;
  return (
    <article className="pl-tile pl-tile--obs">
      <h3>
        <Link className="pl-stretch" to="/datos-abiertos/observatorio">
          Observatorio de Analítica
        </Link>
      </h3>
      <p>
        Catorce temas para explorar el dato: de la oferta y la población a las alertas tempranas y los graduados.
        {published > 0 && ` ${published === 1 ? "Uno ya publica" : `${published} ya publican`} datos.`}
      </p>
      <span className="pl-topics" aria-hidden="true">
        {OBS_TOPICS.map((t) => (
          <span key={t.slug} style={{ "--tone": `var(--od-line-${t.line})` } as CSSProperties} data-live={live.data?.has(t.slug) || undefined}>
            {t.code}
          </span>
        ))}
      </span>
      <span className="pl-cta" aria-hidden="true">
        Explorar el Observatorio <Icon name="arrow-right" size={16} />
      </span>
    </article>
  );
}

/* --- Lo más reciente --------------------------------------------------------------------- */

interface RecentItem {
  key: string;
  date: string;
  tag: string;
  tone: "cifras" | "boletin" | "obs" | "pdi";
  title: string;
  to: string;
}

const shortDate = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });

export function Recent() {
  const catalog = useOpenDataCatalog();
  const bulletins = usePublicBulletins(catalog.data?.period?.uuid);
  const live = useObservatoryLive();
  const period = useCurrentPeriod();

  const items = useMemo(() => {
    const out: RecentItem[] = [];
    if (catalog.data?.cutoffDate) {
      out.push({ key: "cifras", date: catalog.data.cutoffDate, tag: "UDES en Cifras", tone: "cifras", title: `Cifras publicadas con corte al ${formatDate(catalog.data.cutoffDate)}`, to: "/datos-abiertos" });
    }
    for (const e of (bulletins.data?.editions ?? []).slice(0, 2)) {
      if (e.published_at) out.push({ key: `e-${e.id}`, date: e.published_at, tag: "Boletín", tone: "boletin", title: `${e.title} · edición en PDF`, to: "/datos-abiertos/boletines" });
    }
    for (const [slug, topic] of live.data ?? []) {
      const info = OBS_TOPICS.find((t) => t.slug === slug);
      if (info && topic.updatedAt) out.push({ key: `o-${slug}`, date: topic.updatedAt, tag: "Observatorio", tone: "obs", title: `Tema con datos publicados: ${info.name}`, to: `/datos-abiertos/observatorio/${slug}` });
    }
    if (period.data?.cutoff_date) {
      out.push({ key: "pdi", date: period.data.cutoff_date, tag: "Plan de Desarrollo", tone: "pdi", title: `Seguimiento del PDI con corte al ${formatDate(period.data.cutoff_date)}`, to: "/tablero" });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  }, [catalog.data, bulletins.data, live.data, period.data]);

  if (!items.length) return null;
  return (
    <section className="pl-section pl-recent" aria-labelledby="pl-reciente">
      <div className="pl-container pl-recent__grid">
        <h2 id="pl-reciente">Lo más reciente</h2>
        <ol>
          {items.map((item) => (
            <li key={item.key}>
              <time dateTime={item.date}>{shortDate.format(new Date(item.date))}</time>
              <span className="pl-tag" data-tone={item.tone}>
                {item.tag}
              </span>
              <Link to={item.to}>{item.title}</Link>
              <Icon name="arrow-right" size={18} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
