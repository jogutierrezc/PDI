/* =============================================================================
   UDES Sostenible · portal de los 17 informes ODS (THE Impact Rankings).

   Un muro de carteles: cada ODS es un campo plano de su color oficial, con su
   número enorme detrás y su personaje recortado, sangrando por el borde. Los
   que van a THE ocupan los carteles grandes (ods-portal-wall.ts los coloca
   sin dejar huecos). Arriba, un encabezado editorial: titular, la palabra
   del Rector como bloque tipográfico y las cifras públicas sobre un filete.

   El avance de evidencias, el estado y la casilla del boletín son internos:
   quedan detrás de `ODS_PUBLIC` (apagados en público).

   Movimiento (GSAP): la tira de los 17 colores se dibuja, el titular entra por
   líneas enmascaradas y los carteles se abren desde su esquina en una oleada
   diagonal. Al filtrar, Flip lleva cada cartel a su nuevo sitio. En reposo
   todo está puesto: si el script no corre, la página se ve completa.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";
import { OdsShell } from "./OdsShell";
import { contarPorOds, useApprovedNews } from "../rankings/noticias";
import { ODS_EDITIONS, ODS_LIST, ODS_PUBLIC, ODS_ROUTES, RECTOR, STATUS_LABEL, odsArt, odsEdition, odsPct, odsStatus, odsTotals } from "./ods-data";
import { odsOn, odsTone } from "./OdsArt";
import { OdsBulletinDownload } from "./OdsBulletinDownload";
import type { Ods, OdsEdition } from "./ods-data";
import { useBulletinSelection } from "./ods-selection";
import { wallLayout } from "./ods-portal-wall";
import type { WallSize, WallSlot } from "./ods-portal-wall";
import { useSlidingRule } from "./ods-portal-rule";
import { OdsPortalArrow } from "./OdsPortalArrow";
import { reduced } from "./widgets";
import "./ods-portal.css";

gsap.registerPlugin(useGSAP, Flip);

type Filter = "all" | "the";
const FILTERS: [Filter, string][] = [
  ["all", "Todos"],
  ["the", "Para THE"],
];

const matches = (o: Ods, filter: Filter, q: string) => {
  const byFilter = filter === "all" || (filter === "the" && o.the);
  const needle = q.trim().toLowerCase();
  return byFilter && (!needle || `${o.n} ${o.name} ${o.thesis}`.toLowerCase().includes(needle));
};

/** Los que van a THE con cifras publicadas son los carteles mayores; el resto de THE, apaisados. */
const sizeOf = (o: Ods): WallSize => (o.the && o.real ? "xl" : o.the ? "w" : "s");

export function OdsPortal() {
  const noticias = useApprovedNews();
  const notas = useMemo(() => contarPorOds(noticias.data ?? []), [noticias.data]);
  const [params, setParams] = useSearchParams();
  const edition = odsEdition(params.get("edicion"));
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const { isIncluded, toggle } = useBulletinSelection();
  const totals = odsTotals();
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLOListElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);

  const shown = useMemo(() => ODS_LIST.filter((o) => matches(o, filter, q)), [filter, q]);
  const layout = useMemo(() => {
    const items = shown.map((o) => ({ id: o.n, size: sizeOf(o) }));
    return { four: wallLayout(items, 4), two: wallLayout(items, 2) };
  }, [shown]);

  const setEdition = (e: OdsEdition) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("edicion", String(e));
        return next;
      },
      { replace: true },
    );

  /** Guarda dónde estaban los carteles antes de filtrar, para que Flip los lleve a su nuevo sitio. */
  const capture = () => {
    if (reduced() || !grid.current) return;
    flipState.current = Flip.getState(grid.current.querySelectorAll(".opt-card"));
  };

  useLayoutEffect(() => {
    const state = flipState.current;
    flipState.current = null;
    if (!state || !grid.current) return;
    Flip.from(state, {
      targets: grid.current.querySelectorAll(".opt-card:not(.is-off)"),
      duration: 0.42,
      ease: "power3.out",
      scale: true,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power3.out", clearProps: "opacity,transform" }),
    });
  }, [filter, q]);

  /* Entrada: la tira se dibuja, el titular sube por líneas, los carteles se abren desde la esquina en diagonal. */
  useGSAP(
    () => {
      if (reduced()) return;
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".opt-bands i", { scaleX: 0, transformOrigin: "0 50%", duration: 0.32, stagger: 0.022, clearProps: "transform" }, 0)
        .from(".opt-line > span", { yPercent: 104, duration: 0.6, ease: "power4.out", stagger: 0.08, clearProps: "transform" }, 0.05)
        .from(".opt-word, .opt-figs > *, .opt-tools", { y: 14, opacity: 0, duration: 0.42, stagger: 0.05, clearProps: "opacity,transform" }, 0.28)
        .from(
          ".opt-card:not(.is-off)",
          { clipPath: "inset(100% 100% 0% 0%)", duration: 0.56, ease: "power4.out", stagger: { each: 0.045, grid: "auto", from: "start" }, clearProps: "clipPath" },
          0.34,
        )
        .from(
          ".opt-card:not(.is-off) .opt-card__fig",
          { yPercent: 9, duration: 0.6, ease: "power3.out", stagger: { each: 0.045, grid: "auto", from: "start" }, clearProps: "transform" },
          0.4,
        );
    },
    { scope: root },
  );

  useGSAP(
    () => {
      if (!ODS_PUBLIC.status || reduced() || edition !== 2026) return;
      gsap.from(".opt-meter i", { scaleX: 0, duration: 0.5, ease: "power3.out", stagger: 0.02, delay: 0.3, clearProps: "transform" });
    },
    { scope: root, dependencies: [edition] },
  );

  const editionBox = useRef<HTMLDivElement>(null);
  const filterBox = useRef<HTMLDivElement>(null);
  useSlidingRule(editionBox, edition);
  useSlidingRule(filterBox, filter);

  return (
    <OdsShell title="Los 17 informes ODS" active="portal">
      <div ref={root} className="opt-view">
        <div className="opt-bands" aria-hidden="true">
          {ODS_LIST.map((o) => (
            <i key={o.n} style={{ background: o.color }} />
          ))}
        </div>

        <header className="odsx-wrap opt-head">
          <div className="opt-head__main">
            <h1 className="opt-title">
              <span className="opt-line">
                <span>17 objetivos,</span>
              </span>{" "}
              <span className="opt-line">
                <span>una sola UDES.</span>
              </span>
            </h1>
            <p className="opt-lede">
              Los informes con los que la Universidad de Santander rinde cuentas de su aporte a los Objetivos de Desarrollo Sostenible en THE Impact Rankings {edition}: uno por objetivo, cada uno con
              sus cifras y sus evidencias.
            </p>
          </div>

          <figure className="opt-word">
            <blockquote className="opt-word__quote">
              <p>«{RECTOR.quote}»</p>
            </blockquote>
            <figcaption className="opt-word__sign">
              <span className="opt-mark" aria-hidden="true">
                R
              </span>
              <span>
                <b>{RECTOR.name}</b>
                <span>{RECTOR.role}</span>
              </span>
            </figcaption>
            <Link to={ODS_ROUTES.rector} className="opt-link">
              Leer la presentación rectoral <OdsPortalArrow />
            </Link>
          </figure>
        </header>

        <div className="odsx-wrap">
          <div className="opt-figs">
            <p className="opt-fig">
              <b>{totals.count}</b>
              <span>informes de la edición 2025 publicados</span>
            </p>
            {ODS_PUBLIC.status && (
              <>
                <p className="opt-fig">
                  <b>
                    {totals.ok}/{totals.total}
                  </b>
                  <span>evidencias 2026 verificadas</span>
                </p>
                <p className="opt-fig">
                  <b>{totals.ready}</b>
                  <span>ODS listos para revisión</span>
                </p>
              </>
            )}
            <p className="opt-fig">
              <b>{totals.the}</b>
              <span>
                ODS que se envían a THE <span className="odsx-ilus">Dato ilustrativo</span>
              </span>
            </p>
            <div className="opt-figs__act">
              <OdsBulletinDownload />
            </div>
          </div>

          <div className="opt-tools">
            <div ref={editionBox} className="opt-switch" role="group" aria-label="Edición">
              <span className="opt-switch__label" aria-hidden="true">
                Edición
              </span>
              {ODS_EDITIONS.map((e) => (
                <button key={e} type="button" aria-pressed={edition === e} aria-label={`Edición ${e}`} onClick={() => setEdition(e)}>
                  {e}
                </button>
              ))}
              <i className="opt-rule" aria-hidden="true" />
            </div>
            <div ref={filterBox} className="opt-switch" role="group" aria-label="Filtrar informes">
              {FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  onClick={() => {
                    if (filter === id) return;
                    capture();
                    setFilter(id);
                  }}
                >
                  {label}
                </button>
              ))}
              <i className="opt-rule" aria-hidden="true" />
            </div>
            <label className="opt-search">
              <span className="opt-vh">Buscar un ODS</span>
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
                <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.75" />
                <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
              </svg>
              <input
                type="search"
                placeholder="Buscar un ODS"
                value={q}
                onChange={(e) => {
                  capture();
                  setQ(e.target.value);
                }}
              />
            </label>
            <p className="opt-count" role="status">
              {shown.length === ODS_LIST.length ? "Los 17 informes" : shown.length === 1 ? "1 informe" : `${shown.length} informes`}
            </p>
          </div>
        </div>

        <h2 className="opt-vh">Los 17 informes</h2>
        <ol ref={grid} className="odsx-wrap opt-wall">
          {ODS_LIST.map((o) => (
            <OdsPortalPoster
              key={o.n}
              o={o}
              edition={edition}
              four={layout.four.get(o.n)}
              two={layout.two.get(o.n)}
              included={isIncluded(o.n)}
              news={notas[o.n] ?? 0}
              onToggle={() => toggle(o.n)}
            />
          ))}
        </ol>
        <div className="odsx-wrap">
          {shown.length === 0 && <p className="opt-empty">Ningún informe coincide con la búsqueda.</p>}
          <p className="odsx-note opt-foot">
            <span className="odsx-ilus">Dato ilustrativo</span> La selección de THE y las cifras de los ODS distintos del 4 y el 13 son de muestra.
          </p>
        </div>
      </div>
    </OdsShell>
  );
}

const area = (s: WallSlot | undefined, k: string) => (s ? { [`--${k}c`]: `${s.col} / span ${s.w}`, [`--${k}r`]: `${s.row} / span ${s.h}` } : {});

function OdsPortalPoster({
  o,
  edition,
  four,
  two,
  included,
  news,
  onToggle,
}: {
  o: Ods;
  edition: OdsEdition;
  four?: WallSlot;
  two?: WallSlot;
  included: boolean;
  news: number;
  onToggle: () => void;
}) {
  const off = !four;
  const tone = odsTone(o.color) as Record<string, string>;
  /* Texto del cartel: blanco, o una tinta más honda que la de odsOn para que el 5 y el 9 lleguen a 4,5:1.
     La hoja de la tesis es de ese color; su tinta, el tono del ODS que contrasta con ella. */
  const light = odsOn(o.color) === "#fff";
  const on = light ? "#fff" : "#0d1828";
  const slipInk = light ? tone["--o-acc-deep"] : o.color;
  const size = sizeOf(o);
  const st = odsStatus(o);
  const pct = odsPct(o);
  const thesisId = `ods-tesis-${o.n}`;
  const line = edition === 2025 ? "Informe 2025 publicado" : `Informe ${edition}`;

  return (
    <li
      className={`opt-card is-${size}${size === "s" && four && four.w > 1 ? " is-stretch" : ""}${off ? " is-off" : ""}`}
      style={{ ...tone, "--p-on": on, "--slip-ink": slipInk, ...area(four, "g4"), ...area(two, "g2") } as CSSProperties}
      aria-hidden={off || undefined}
      data-flip-id={`ods-${o.n}`}
    >
      <Link
        to={ODS_ROUTES.report(o.n, edition)}
        className="opt-card__link"
        aria-label={`ODS ${o.n}, ${o.name}`}
        aria-describedby={thesisId}
        tabIndex={off ? -1 : undefined}
      >
        <span className="opt-card__num" aria-hidden="true">
          {o.n}
        </span>
        <span className="opt-card__fig" aria-hidden="true">
          <img src={odsArt(o.n)} alt="" width={800} height={1085} decoding="async" loading={o.n > 8 ? "lazy" : undefined} />
        </span>
        <span className="opt-card__id">
          <b className="opt-card__name">{o.name}</b>
          <span className="opt-card__line">
            {line}
            {o.the && <> · Para THE</>}
            {edition === 2025 && news > 0 && <> · {news === 1 ? "1 noticia" : `${news} noticias`}</>}
          </span>
        </span>
        <span className="opt-card__slip">
          <span className="opt-card__slipname" aria-hidden="true">
            {o.name}
          </span>
          <span className="opt-card__thesis" id={thesisId}>
            {o.thesis}
          </span>
          {edition === 2026 && ODS_PUBLIC.status && (
            <span className="opt-card__st">
              {STATUS_LABEL[st]} · {o.ok} de {o.total} evidencias
              <span className="opt-meter" role="img" aria-label={`${pct} % de evidencias verificadas`}>
                <i style={{ "--w": `${pct}%` } as CSSProperties} />
              </span>
            </span>
          )}
          <span className="opt-card__go" aria-hidden="true">
            Leer el informe {edition} <OdsPortalArrow />
          </span>
        </span>
      </Link>
      {ODS_PUBLIC.bulletinPick && (
        <label className="opt-inc">
          <input type="checkbox" checked={included} onChange={onToggle} tabIndex={off ? -1 : undefined} />
          Incluir en el boletín
        </label>
      )}
    </li>
  );
}
