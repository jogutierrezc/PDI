/* =============================================================================
   UDES Sostenible · portal de los 17 informes ODS (THE Impact Rankings).

   Encabezado, mensaje del Rector, cifras de la edición, filtros y la rejilla
   de los 17 informes. Cada tarjeta lleva el color y el dibujo de su ODS y abre
   su informe por la ruta. El avance de evidencias, el estado y la casilla del
   boletín son internos: quedan detrás de `ODS_PUBLIC` (apagados en público).
   Movimiento: el título sube palabra por palabra, las tarjetas entran en
   escalera y el filtrado se reacomoda con Flip.
   ========================================================================== */

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";
import { OdsShell } from "./OdsShell";
import { ODS_EDITIONS, ODS_LIST, ODS_PUBLIC, ODS_ROUTES, RECTOR, STATUS_LABEL, odsArt, odsEdition, odsPct, odsStatus, odsTotals } from "./ods-data";
import { odsTone } from "./OdsArt";
import { OdsBulletinDownload } from "./OdsBulletinDownload";
import type { Ods, OdsEdition } from "./ods-data";
import { useBulletinSelection } from "./ods-selection";
import { reduced } from "./widgets";
import "./ods-portal.css";

gsap.registerPlugin(useGSAP, Flip);

type Filter = "all" | "the";
const FILTERS: [Filter, string][] = [
  ["all", "Todos"],
  ["the", "Para THE"],
];
const TITLE = ["17", "objetivos,", "un", "solo", "expediente."];

const matches = (o: Ods, filter: Filter, q: string) => {
  const byFilter = filter === "all" || (filter === "the" && o.the);
  const needle = q.trim().toLowerCase();
  return byFilter && (!needle || `${o.n} ${o.name} ${o.thesis}`.toLowerCase().includes(needle));
};

export function OdsPortal() {
  const [params, setParams] = useSearchParams();
  const edition = odsEdition(params.get("edicion"));
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const { isIncluded, toggle } = useBulletinSelection();
  const totals = odsTotals();
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);

  const setEdition = (e: OdsEdition) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("edicion", String(e));
        return next;
      },
      { replace: true },
    );

  /** Guarda dónde estaban las tarjetas antes de filtrar, para que Flip las lleve a su nuevo sitio. */
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
      duration: 0.4,
      ease: "power3.out",
      scale: true,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power3.out", clearProps: "opacity,transform" }),
    });
  }, [filter, q]);

  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".opt-w", { yPercent: 108, duration: 0.6, ease: "power4.out", stagger: 0.05, clearProps: "transform" });
      gsap.from(".opt-msg, .opt-kpi", { y: 12, opacity: 0, duration: 0.4, ease: "power3.out", stagger: 0.04, delay: 0.12, clearProps: "opacity,transform" });
      gsap.from(".opt-card", { y: 18, opacity: 0, duration: 0.42, ease: "power3.out", stagger: 0.025, delay: 0.24, clearProps: "opacity,transform" });
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

  const visible = ODS_LIST.filter((o) => matches(o, filter, q)).length;

  return (
    <OdsShell title="Los 17 informes ODS" active="portal">
      <div ref={root} className="odsx-wrap opt-view">
        <div className="opt-hero">
          <div>
            <p className="odsx-eyebrow">UDES Sostenible · Impact Rankings {edition}</p>
            <h1 className="opt-title" aria-label={TITLE.join(" ")}>
              {TITLE.map((w, i) => (
                <Fragment key={i}>
                  <span className="opt-mask" aria-hidden="true">
                    <span className="opt-w">{w}</span>
                  </span>
                  {i < TITLE.length - 1 ? " " : null}
                </Fragment>
              ))}
            </h1>
            <p className="opt-lede">
              Los 17 informes ODS de la Universidad de Santander, la presentación del Rector y un boletín en PDF con las cifras de cada objetivo.
            </p>
          </div>
          <Link to={ODS_ROUTES.rector} className="opt-msg" aria-label={`Leer la presentación rectoral de ${RECTOR.name}`}>
            <span className="opt-msg__who">
              <span className="opt-avatar" aria-hidden="true">
                R
              </span>
              <span>
                <b>{RECTOR.name}</b>
                <small>{RECTOR.role}</small>
              </span>
            </span>
            <q>{RECTOR.quote}</q>
            <span className="opt-msg__go">Leer la presentación rectoral →</span>
          </Link>
        </div>

        <div style={{ marginBottom: 16 }}>
          <OdsBulletinDownload />
        </div>

        <div className="opt-kpis">
          <div className="opt-kpi">
            <b>{totals.count}</b>
            <span>informes de la edición 2025 publicados</span>
          </div>
          {ODS_PUBLIC.status && (
            <>
              <div className="opt-kpi">
                <b>
                  {totals.ok}/{totals.total}
                </b>
                <span>evidencias 2026 verificadas</span>
              </div>
              <div className="opt-kpi">
                <b>{totals.ready}</b>
                <span>ODS listos para revisión</span>
              </div>
            </>
          )}
          <div className="opt-kpi">
            <b>{totals.the}</b>
            <span>
              ODS que se envían a THE <span className="odsx-ilus">Ilustrativo</span>
            </span>
          </div>
        </div>

        <div className="opt-tools">
          <div className="opt-seg" role="group" aria-label="Edición">
            {ODS_EDITIONS.map((e) => (
              <button key={e} type="button" aria-pressed={edition === e} onClick={() => setEdition(e)}>
                Edición {e}
              </button>
            ))}
          </div>
          <div className="opt-seg" role="group" aria-label="Filtrar informes">
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
          </div>
          <input
            className="opt-search"
            type="search"
            placeholder="Buscar un ODS"
            aria-label="Buscar un ODS"
            value={q}
            onChange={(e) => {
              capture();
              setQ(e.target.value);
            }}
          />
        </div>

        <p className="opt-count" role="status">
          {visible === ODS_LIST.length ? "Los 17 informes" : visible === 1 ? "1 informe" : `${visible} informes`}
        </p>

        <div ref={grid} className="opt-grid">
          {ODS_LIST.map((o) => (
            <OdsPortalCard key={o.n} o={o} edition={edition} off={!matches(o, filter, q)} included={isIncluded(o.n)} onToggle={() => toggle(o.n)} />
          ))}
        </div>
        {visible === 0 && <p className="opt-empty">Ningún informe coincide con la búsqueda.</p>}

        <p className="odsx-note opt-foot">
          <span className="odsx-ilus">Dato ilustrativo</span> La selección de THE y las cifras de los ODS distintos del 4 y el 13 son de muestra.
        </p>
      </div>
    </OdsShell>
  );
}

function OdsPortalCard({ o, edition, off, included, onToggle }: { o: Ods; edition: OdsEdition; off: boolean; included: boolean; onToggle: () => void }) {
  const st = odsStatus(o);
  const pct = odsPct(o);
  return (
    <article className={`opt-card${off ? " is-off" : ""}`} style={{ ...odsTone(o.color), "--c": o.color } as CSSProperties} aria-hidden={off || undefined} data-flip-id={`ods-${o.n}`}>
      <div className="opt-card__top">
        <div className="opt-card__id">
          <span className="opt-card__num">{o.n}</span>
          <h2 className="opt-card__name">{o.name}</h2>
        </div>
        <span className="opt-card__art" aria-hidden="true">
          <img src={odsArt(o.n)} alt="" width={800} height={1085} decoding="async" />
        </span>
      </div>
      <div className="opt-card__body">
        <p className="opt-card__thesis">{o.thesis}</p>
        {edition === 2026 ? (
          ODS_PUBLIC.status ? (
          <>
            <div className="opt-card__st">
              <span className={`odsx-chip ${st}`}>{STATUS_LABEL[st]}</span>
              <span>
                {o.ok} de {o.total} evidencias
              </span>
            </div>
            <div className="opt-meter" role="img" aria-label={`${pct} % de evidencias verificadas`}>
              <i style={{ "--w": `${pct}%` } as CSSProperties} />
            </div>
          </>
          ) : (
            o.the && (
              <div className="opt-card__st">
                <span className="odsx-chip the">THE</span>
              </div>
            )
          )
        ) : (
          <div className="opt-card__st">
            <span className="odsx-chip ok">Informe 2025 publicado</span>
            {o.the && <span className="odsx-chip the">THE</span>}
          </div>
        )}
      </div>
      <div className="opt-card__ft">
        {ODS_PUBLIC.bulletinPick ? (
          <label className="opt-inc">
            <input type="checkbox" checked={included} onChange={onToggle} tabIndex={off ? -1 : undefined} />
            Incluir en el boletín
          </label>
        ) : (
          <span className="opt-card__ed">Informe {edition}</span>
        )}
        <Link to={ODS_ROUTES.report(o.n, edition)} className="opt-open" aria-label={`Abrir el informe ${edition} del ODS ${o.n}, ${o.name}`} tabIndex={off ? -1 : undefined}>
          Abrir →
        </Link>
      </div>
    </article>
  );
}
