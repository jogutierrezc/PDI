/* =============================================================================
   UDES Sostenible · informe de un ODS del THE Impact Rankings.

   /sostenible/impact/informes/ods/:n?edicion=2025|2026

   - ODS 13: el informe completo (expediente de evidencias en 2026; informe
     publicado en 2025), en español o inglés.
   - Los demás ODS: plantilla con el color oficial, el dibujo, la tesis, las
     dos cifras y lo que viene, hasta que el editor de informes cargue el detalle.

   Las evidencias, su avance y el estado son internos: todo ese bloque queda
   detrás de `ODS_PUBLIC.evidence` (apagado), que el importador de informes de
   la intranet activará informe por informe. Con el interruptor apagado no
   aparecen ni en el menú, ni en el scroll-spy, ni en la copia de impresión.

   Siempre en fondo claro (tokens `--o-*` de `.odsx`). Movimiento con GSAP:
   todo el contenido está completo en reposo; las entradas usan gsap.from con
   clearProps y, con movimiento reducido, no hay animación.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { OdsShell } from "./OdsShell";
import { OdsBulletinDownloadLink } from "./OdsBulletinDownload";
import { EVIDENCE_LABEL, ODS13, ODS_EDITIONS, ODS_PUBLIC, ODS_ROUTES, STATUS_LABEL, odsArt, odsByNumber, odsEdition, odsEvidenceTotals, odsPct, odsStatus } from "./ods-data";
import type { Bi, Ods, OdsEdition } from "./ods-data";
import { Counter, OdsReportIntro, OdsReportPrint, OdsReportVideo, fmtN, introSeen, parseFigure } from "./OdsReportParts";
import { OdsArtStrip, odsTone } from "./OdsArt";
import type { Lang } from "./OdsReportParts";
import { reduced } from "./widgets";
import "./ods-report.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Valores de la franja de «stripes» del encabezado (CO₂ evitado por mes, ilustrativo). */
const STRIPES = [0.45, 0.5, 0.38, 0.6, 0.55, 0.7, 0.62, 0.48, 0.8, 0.74, 0.9, 0.66, 0.58, 0.72, 0.95, 0.82, 0.68, 0.77, 0.88, 0.7, 0.6, 0.84, 0.92, 0.8];

export function OdsReport() {
  const { n } = useParams();
  const [params] = useSearchParams();
  const o = odsByNumber(n);
  if (!o) return <Navigate to={ODS_ROUTES.portal} replace />;
  const edition = odsEdition(params.get("edicion"));
  return (
    <OdsShell title={`ODS ${o.n} · ${o.name}`}>
      <ReportView key={`${o.n}-${edition}`} o={o} edition={edition} />
    </OdsShell>
  );
}

type Phase = "check" | "intro" | "ready";

function ReportView({ o, edition }: { o: Ods; edition: OdsEdition }) {
  const full = o.n === 13;
  const published = edition === 2025;
  const [lang, setLang] = useState<Lang>("es");
  const L: Lang = full ? lang : "es";
  const tx = (es: string, en: string) => (L === "es" ? es : en);
  const t = (b: Bi) => b[L];

  /* «check» es el HTML inicial: contenido completo, sin intro. En el navegador se decide antes de pintar. */
  const [phase, setPhase] = useState<Phase>("check");
  const [mounted, setMounted] = useState(false);
  useIsoLayoutEffect(() => {
    setMounted(true);
    setPhase(!reduced() && !introSeen(o.n) ? "intro" : "ready");
  }, [o.n]);

  const sections: [string, string][] = full
    ? published
      ? [
          ["cifras", tx("Cifras", "Figures")],
          ["ruta", tx("Ruta", "Timeline")],
        ]
      : [
          ...(ODS_PUBLIC.evidence ? [["resumen", tx("Resumen", "Summary")] as [string, string]] : []),
          ["cifras", tx("Cifras", "Figures")],
          ["avance", "2025 → 2026"],
          ...(ODS_PUBLIC.evidence ? [["evidencias", tx("Evidencias", "Evidence")] as [string, string]] : []),
          ["hidrogeno", tx("Hidrógeno", "Hydrogen")],
          ["ruta", tx("Ruta", "Timeline")],
        ]
    : published
      ? [["cifras", "Cifras"]]
      : [
          ["cifras", "Cifras"],
          ...(ODS_PUBLIC.evidence ? [["avance", "Avance"] as [string, string]] : []),
          ["viene", "Lo que viene"],
        ];
  const [active, setActive] = useState(sections[0][0]);
  const [tab, setTab] = useState(0);
  const [video, setVideo] = useState<number | null>(null);

  const scope = useRef<HTMLDivElement>(null);
  const sectionIds = sections.map((s) => s[0]).join();

  /* Scroll-spy de secciones: no es movimiento decorativo, se mantiene con movimiento reducido. */
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      sectionIds.split(",").forEach((id) => {
        const el = root.querySelector(`#ors-${id}`);
        if (el) ScrollTrigger.create({ trigger: el, start: "top 45%", end: "bottom 45%", onToggle: (s) => s.isActive && setActive(id) });
      });
    },
    { scope, dependencies: [sectionIds] },
  );

  /* Entradas y cifras: cuando termina la intro. */
  useGSAP(
    () => {
      if (phase !== "ready" || reduced()) return;
      const root = scope.current;
      if (!root) return;
      const q = <T extends Element = HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));

      gsap.fromTo(".ors-w", { yPercent: 108 }, { yPercent: 0, duration: 0.5, ease: "power4.out", stagger: 0.05, delay: 0.05, clearProps: "transform" });
      gsap.from(".ors-hero__in", { y: 14, opacity: 0, duration: 0.45, ease: "power3.out", stagger: 0.08, delay: 0.15, clearProps: "opacity,transform" });
      gsap.from(".ors-art__img", { y: 18, opacity: 0, duration: 0.55, ease: "power3.out", delay: 0.1, clearProps: "opacity,transform" });
      gsap.from(".ors-tile", { scale: 0.92, opacity: 0, duration: 0.45, ease: "power3.out", delay: 0.2, clearProps: "opacity,transform" });
      gsap.from(".ors-stripes__row i", { scaleY: 0, duration: 0.45, ease: "power3.out", stagger: 0.02, delay: 0.25, clearProps: "opacity,transform" });

      ScrollTrigger.batch(q(".ors-ind, .ors-stat, .ors-vid, .ors-step, .ors-fig, .ors-card"), {
        start: "top 92%",
        once: true,
        onEnter: (b) => void gsap.from(b, { y: 22, opacity: 0, duration: 0.45, ease: "power3.out", stagger: 0.06, clearProps: "opacity,transform" }),
      });

      q(".ors-ring").forEach((r) => {
        const p = Number(r.dataset.p) || 0;
        const s = { v: 0 };
        ScrollTrigger.create({
          trigger: r,
          start: "top 92%",
          once: true,
          onEnter: () => void gsap.to(s, { v: p, duration: 0.9, ease: "power3.out", onStart: () => r.style.setProperty("--p", "0"), onUpdate: () => r.style.setProperty("--p", String(s.v)) }),
        });
      });

      q(".ors-cnt").forEach((c) => {
        const to = Number(c.dataset.to) || 0;
        const dec = Number(c.dataset.dec) || 0;
        const lg = (c.dataset.lang as Lang) || "es";
        const s = { v: 0 };
        ScrollTrigger.create({
          trigger: c,
          start: "top 92%",
          once: true,
          onEnter: () =>
            void gsap.to(s, {
              v: to,
              duration: 1.1,
              ease: "power2.out",
              onUpdate: () => void (c.textContent = fmtN(dec ? s.v : Math.round(s.v), lg, dec)),
              onComplete: () => void (c.textContent = fmtN(to, lg, dec)),
            }),
        });
      });

      q(".ors-fill").forEach((f) => {
        ScrollTrigger.create({
          trigger: f,
          start: "top 94%",
          once: true,
          onEnter: () =>
            void gsap.fromTo(f, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power3.out", delay: f.classList.contains("y26") ? 0.15 : 0, clearProps: "clipPath" }),
        });
      });

      const line = root.querySelector(".ors-tl__line");
      if (line) gsap.fromTo(line, { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: ".ors-tl", start: "top 75%", end: "bottom 70%", scrub: 0.4 } });
    },
    { scope, dependencies: [phase] },
  );

  /* Al cambiar de idioma el texto cambia de alto: se recalculan los disparadores. */
  const firstLang = useRef(true);
  useEffect(() => {
    if (firstLang.current) {
      firstLang.current = false;
      return;
    }
    ScrollTrigger.refresh();
    if (!reduced() && scope.current) gsap.fromTo(scope.current.querySelector(".ors-main"), { opacity: 0.35 }, { opacity: 1, duration: 0.25, ease: "power2.out", clearProps: "opacity" });
  }, [lang]);

  const goTo = (id: string) => {
    document.getElementById(`ors-${id}`)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  };

  const prev = o.n > 1 ? odsByNumber(o.n - 1) : undefined;
  const next = o.n < 17 ? odsByNumber(o.n + 1) : undefined;
  const title = full ? (L === "es" ? ["ODS", "13:", "Acción", "por", "el", "clima"] : ["SDG", "13:", "Climate", "Action"]) : ["ODS", `${o.n}:`, ...o.name.split(" ")];
  const status = odsStatus(o);
  const totals = odsEvidenceTotals();
  const stripesCaption = full ? tx("CO₂ evitado por mes, 2025–2026", "CO₂ avoided per month, 2025–2026") : "Actividad mensual del ODS, 2025–2026";

  return (
    <div ref={scope} className="ors" lang={L} style={odsTone(o.color)}>
      {phase === "intro" && <OdsReportIntro n={o.n} label={full ? tx("Acción por el clima", "Climate action") : o.name} skipLabel={tx("Saltar", "Skip")} onDone={() => setPhase("ready")} />}

      {/* Barra del informe: secciones, idioma y avance de lectura */}
      <div className="ors-bar">
        <OdsArtStrip current={o.n} edition={edition} label={tx("Los 17 informes ODS", "The 17 SDG reports")} />
        <div className="odsx-wrap ors-bar__row">
          <span className="ors-mark">
            UDES<small>{full ? tx(`Informe ODS 13 · ${edition}`, `SDG 13 report · ${edition}`) : `Informe ODS ${o.n} · ${edition}`}</small>
          </span>
          <nav className="ors-nav" aria-label={tx("Secciones del informe", "Report sections")}>
            {sections.map(([id, label]) => (
              <a
                key={id}
                href={`#ors-${id}`}
                className={active === id ? "on" : undefined}
                aria-current={active === id ? "location" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  goTo(id);
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          {full && (
            <div className="ors-seg" role="group" aria-label={tx("Idioma", "Language")}>
              {(["es", "en"] as Lang[]).map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l} aria-label={l === "es" ? "Español" : "English"}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ors-main">
        {/* Acciones */}
        <div className="odsx-wrap ors-tools">
          <Link to={ODS_ROUTES.portal} className="odsx-btn ors-tools__back">
            <span aria-hidden="true">←</span> {tx("Volver a los 17 informes", "Back to the 17 reports")}
          </Link>
          <div className="ors-seg ors-seg--ed" role="group" aria-label={tx("Edición", "Edition")}>
            {ODS_EDITIONS.map((e) => (
              <Link key={e} to={ODS_ROUTES.report(o.n, e)} replace aria-current={e === edition ? "page" : undefined} aria-label={tx(`Edición ${e}`, `${e} edition`)}>
                {e}
              </Link>
            ))}
          </div>
          <button type="button" className="odsx-btn odsx-btn--pri" onClick={() => window.print()}>
            <span aria-hidden="true">↓</span> {tx("Descargar PDF", "Download PDF")}
          </button>
          <OdsBulletinDownloadLink />
        </div>

        {/* Encabezado */}
        <section className="ors-hero" aria-labelledby="ors-h1">
          <div className="odsx-wrap">
            <div className="ors-hero__grid">
              <div>
                <p className="odsx-eyebrow ors-hero__in">
                  {published ? tx("Informe publicado · THE Impact Rankings 2025", "Published report · THE Impact Rankings 2025") : tx("Informe 2026 · THE Impact Rankings", "2026 report · THE Impact Rankings")}
                </p>
                <h1 id="ors-h1" className="ors-h1" key={L} aria-label={title.join(" ")}>
                  {title.map((w, i) => (
                    <span key={i} className="ors-mask" aria-hidden="true">
                      <span className="ors-w">{w}</span>
                      {i < title.length - 1 ? " " : ""}
                    </span>
                  ))}
                </h1>
                <p className="ors-lede ors-hero__in">
                  {full ? tx("Cómo la Universidad de Santander reduce su huella de carbono e investiga las soluciones energéticas que definirán un futuro sostenible para Colombia.", "How Universidad de Santander reduces its carbon footprint and researches the energy solutions that will define a sustainable future for Colombia.") : o.thesis}
                </p>
                <div className="ors-meta ors-hero__in">
                  <div>
                    {tx("Periodo", "Period")}
                    <b>{edition}</b>
                  </div>
                  {!published && (
                    <div>
                      {tx("Edición anterior", "Previous edition")}
                      <b>2025</b>
                    </div>
                  )}
                  <div>
                    {tx("Responsable", "Owner")}
                    <b>{tx("Oficina de Planeación", "Planning Office")}</b>
                  </div>
                  {(published || ODS_PUBLIC.status) && (
                    <div>
                      {tx("Estado", "Status")}
                      <b>{published ? tx("Publicado", "Published") : full ? tx("Borrador para revisión", "Draft for review") : STATUS_LABEL[status]}</b>
                    </div>
                  )}
                </div>
              </div>
              <div className="ors-art">
                <img className="ors-art__img" src={odsArt(o.n)} alt={tx(`Ilustración del ODS ${o.n}`, `SDG ${o.n} illustration`)} width={800} height={1085} loading="eager" decoding="async" />
                <div className="ors-tile" role="img" aria-label={full ? tx("ODS 13, Acción por el clima", "SDG 13, Climate action") : `ODS ${o.n}, ${o.name}`}>
                  <b>{o.n}</b>
                  <span>{full ? tx("Acción por el clima", "Climate action") : o.name}</span>
                </div>
              </div>
            </div>
            {published && (
              <p className="ors-notice ors-hero__in" role="note">
                <b>{tx("Informe publicado de la edición 2025.", "Published report of the 2025 edition.")}</b>{" "}
                {tx("Muestra las cifras y la ruta tal como se enviaron; la comparación con el nuevo periodo está en la edición 2026.", "It shows the figures and roadmap as submitted; the comparison with the new period lives in the 2026 edition.")}{" "}
                <Link to={ODS_ROUTES.report(o.n, 2026)} replace>
                  {tx("Ver la edición 2026", "See the 2026 edition")}
                </Link>
              </p>
            )}
            <figure className="ors-stripes">
              <div className="ors-stripes__row" role="img" aria-label={`${stripesCaption}. ${tx("Dato ilustrativo", "Illustrative data")}`}>
                {STRIPES.map((v, i) => (
                  <i key={i} style={{ background: `color-mix(in srgb, var(--ors-c) ${Math.round(v * 100)}%, var(--o-surface-2))` }} />
                ))}
              </div>
              <figcaption>
                <span>{stripesCaption}</span>
                <span className="odsx-ilus">{tx("Dato ilustrativo", "Illustrative data")}</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {full ? (
          <>
            {ODS_PUBLIC.evidence && !published && (
              <section className="ors-sec" id="ors-resumen" aria-labelledby="ors-resumen-h">
                <div className="odsx-wrap">
                  <div className="ors-head">
                    <p className="odsx-eyebrow">{tx("Resumen para el evaluador", "Summary for the reviewer")}</p>
                    <h2 id="ors-resumen-h">{tx("Cuatro indicadores, un avance de evidencias.", "Four indicators, one evidence tracker.")}</h2>
                    <p>{tx("Cada indicador del ODS 13 muestra cuántas evidencias están verificadas. Toca uno para ir a su detalle.", "Each SDG 13 indicator shows how many pieces of evidence are verified. Tap one to see its detail.")}</p>
                  </div>
                  <div className="ors-inds">
                    {ODS13.indicators.map((ind, ix) => {
                      const ok = ind.evidence.filter((e) => e.status === "ok").length;
                      return (
                        <button
                          key={ind.id}
                          type="button"
                          className="ors-ind"
                          onClick={() => {
                            setTab(ix);
                            goTo("evidencias");
                          }}
                        >
                          <span className="ors-ind__code">{ind.id}</span>
                          <h3>{t(ind.name)}</h3>
                          <span className="ors-ind__r">
                            <Ring ok={ok} total={ind.evidence.length} label={tx(`${ok} de ${ind.evidence.length} evidencias verificadas`, `${ok} of ${ind.evidence.length} pieces of evidence verified`)} />
                            <span>{tx("evidencias verificadas", "verified evidence")}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="ors-total">
                    <span>
                      {tx("Total verificado", "Total verified")}: <b>{totals.ok} / {totals.total}</b>
                    </span>
                    <span>
                      {tx("En revisión", "In review")}: <b>{totals.rev}</b>
                    </span>
                    <span>
                      {tx("Por conseguir", "Still to gather")}: <b>{totals.falta}</b>
                    </span>
                  </div>
                </div>
              </section>
            )}

            <section className="ors-sec ors-sec--alt" id="ors-cifras" aria-labelledby="ors-cifras-h">
              <div className="odsx-wrap">
                <div className="ors-head">
                  <p className="odsx-eyebrow">{tx("Cifras de la edición 2025", "Figures from the 2025 edition")}</p>
                  <h2 id="ors-cifras-h">{tx("Resultados medibles de la gestión climática.", "Measurable results of climate management.")}</h2>
                </div>
                <div className="ors-stats">
                  {ODS13.stats.map((s, i) => (
                    <div key={i} className="ors-stat">
                      <div className="ors-stat__big">
                        {s.to === null ? (
                          <span className="ors-stat__word">{tx("Certificada", "Certified")}</span>
                        ) : (
                          <>
                            <Counter key={L} to={s.to} lang={L} />
                            <small>{t(s.unit)}</small>
                          </>
                        )}
                      </div>
                      <p>{t(s.text)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {!published && (
              <section className="ors-sec" id="ors-avance" aria-labelledby="ors-avance-h">
                <div className="odsx-wrap">
                  <div className="ors-head">
                    <p className="odsx-eyebrow">{tx("Comparación entre periodos", "Period comparison")}</p>
                    <h2 id="ors-avance-h">{tx("Lo que cambia entre 2025 y 2026.", "What changes between 2025 and 2026.")}</h2>
                    <p>
                      <span className="odsx-ilus">{tx("Cifras 2026 ilustrativas", "2026 figures are illustrative")}</span>
                    </p>
                  </div>
                  <div className="ors-cmp">
                    {ODS13.compare.map((c) => {
                      const mx = Math.max(c.y2025, c.y2026) * 1.04;
                      const gain = Math.round(((c.y2026 - c.y2025) / c.y2025) * 100);
                      return (
                        <div key={c.label.es} className="ors-cmp__it">
                          <div className="ors-cmp__t">
                            <span>{t(c.label)}</span>
                            <em>+{gain}%</em>
                          </div>
                          <div className="ors-bars">
                            {(
                              [
                                [2025, c.y2025, ""],
                                [2026, c.y2026, "y26"],
                              ] as const
                            ).map(([y, v, cls]) => (
                              <div key={y} className="ors-bar2">
                                <span>{y}</span>
                                <div className="ors-track">
                                  <div className={`ors-fill ${cls}`} style={{ width: `${(v / mx) * 100}%` }}>
                                    {fmtN(v, L) + c.suffix}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {ODS_PUBLIC.evidence && !published && (
              <section className="ors-sec ors-sec--alt" id="ors-evidencias" aria-labelledby="ors-evidencias-h">
                <div className="odsx-wrap">
                  <div className="ors-head">
                    <p className="odsx-eyebrow">{tx("Evidencias por indicador", "Evidence by indicator")}</p>
                    <h2 id="ors-evidencias-h">{tx("Cada afirmación tiene su soporte.", "Every claim has its support.")}</h2>
                    <p>
                      <span className="odsx-ilus">{tx("Evidencias de muestra", "Sample evidence")}</span>
                    </p>
                  </div>
                  <OdsReportTabs tab={tab} setTab={setTab} lang={L} />
                </div>
              </section>
            )}

            {!published && (
              <section className={`ors-sec${ODS_PUBLIC.evidence ? "" : " ors-sec--alt"}`} id="ors-hidrogeno" aria-labelledby="ors-hidrogeno-h">
                <div className="odsx-wrap">
                  <div className="ors-head">
                    <p className="odsx-eyebrow">{tx("Vanguardia", "Forefront")}</p>
                    <h2 id="ors-hidrogeno-h">{tx("El Centro de Hidrógeno de la UDES.", "The UDES Hydrogen Center.")}</h2>
                    <p>{tx("Apoyado por el Doctorado en Recursos Energéticos Renovables, es un referente nacional e internacional.", "Backed by the PhD in Renewable Energy Resources, it is a national and international benchmark.")}</p>
                  </div>
                  <div className="ors-vids">
                    {ODS13.videos.map((v, i) => (
                      <button key={v.id} type="button" className="ors-vid" onClick={() => setVideo(i)} aria-haspopup="dialog">
                        <span className="ors-vid__poster">
                          <span className="ors-vid__play" aria-hidden="true">
                            ▶
                          </span>
                        </span>
                        <span className="ors-vid__tx">
                          <b>{t(v.title)}</b>
                          <span>{t(v.text)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <section className={`ors-sec${ODS_PUBLIC.evidence && !published ? " ors-sec--alt" : ""}`} id="ors-ruta" aria-labelledby="ors-ruta-h">
              <div className="odsx-wrap">
                <div className="ors-head">
                  <p className="odsx-eyebrow">{tx("Ruta 2025 → 2026", "Roadmap 2025 → 2026")}</p>
                  <h2 id="ors-ruta-h">{tx("De lo logrado a lo que viene.", "From what was achieved to what comes next.")}</h2>
                </div>
                <div className="ors-tl">
                  <span className="ors-tl__line" aria-hidden="true" />
                  <ol>
                  {ODS13.timeline.map((s) => (
                    <li key={s.title.es} className={`ors-step${s.planned ? " plan" : ""}`}>
                      <span className="ors-step__when">
                        {s.when}
                        {s.planned ? tx(" · previsto", " · planned") : ""}
                      </span>
                      <b>{t(s.title)}</b>
                      <span>{t(s.text)}</span>
                    </li>
                  ))}
                  </ol>
                </div>
                {!published && (
                  <>
                    <p className="odsx-eyebrow ors-allies-h">{tx("Alianzas", "Partnerships")}</p>
                    <ul className="ors-ally">
                      {ODS13.allies.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </section>
          </>
        ) : (
          <GenericSections o={o} published={published} />
        )}

        {/* ODS anterior y siguiente */}
        <nav className="odsx-wrap ors-pager" aria-label={tx("Otros informes ODS", "Other SDG reports")}>
          {prev ? (
            <Link to={ODS_ROUTES.report(prev.n, edition)} className="ors-pager__a" style={{ "--c": prev.color } as CSSProperties}>
              <small>← {tx("ODS anterior", "Previous SDG")}</small>
              <b>
                ODS {prev.n} · {prev.name}
              </b>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={ODS_ROUTES.report(next.n, edition)} className="ors-pager__a ors-pager__a--next" style={{ "--c": next.color } as CSSProperties}>
              <small>{tx("ODS siguiente", "Next SDG")} →</small>
              <b>
                ODS {next.n} · {next.name}
              </b>
            </Link>
          )}
        </nav>

        <footer className="ors-foot">
          <div className="odsx-wrap">
            <span>
              © {edition} · {full ? tx("Informe ODS 13 · Universidad de Santander · Oficina de Planeación", "SDG 13 report · Universidad de Santander · Planning Office") : `Informe ODS ${o.n} · Universidad de Santander · Oficina de Planeación`}
            </span>
            <span>
              {tx(
                "Las cifras de 2025 provienen del informe publicado. Las marcadas como ilustrativas se reemplazan por los datos oficiales antes de enviarlas.",
                "2025 figures come from the published report. Those marked illustrative are replaced with official data before submission.",
              )}
            </span>
          </div>
        </footer>
      </div>

      {full && <OdsReportVideo video={video === null ? null : ODS13.videos[video]} lang={L} onClose={() => setVideo(null)} />}
      {mounted &&
        createPortal(
          <div className="sos-print-root">
            <OdsReportPrint o={o} edition={edition} lang={L} />
          </div>,
          document.body,
        )}
    </div>
  );
}

/* --- Anillo de evidencias ------------------------------------------------------------------------------ */

function Ring({ ok, total, label }: { ok: number; total: number; label: string }) {
  const p = Math.round((ok / total) * 100);
  return (
    <span className="ors-ring" data-p={p} style={{ "--p": p } as CSSProperties} role="img" aria-label={label}>
      <b aria-hidden="true">
        {ok}/{total}
      </b>
    </span>
  );
}

/* --- Pestañas de evidencias (ODS 13) ---------------------------------------------------------------------- */

function OdsReportTabs({ tab, setTab, lang }: { tab: number; setTab: (i: number) => void; lang: Lang }) {
  const list = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const inds = ODS13.indicators;

  /* La línea se desliza bajo la pestaña activa (transform: x y scaleX sobre 100 px de base). */
  useIsoLayoutEffect(() => {
    const place = (animate: boolean) => {
      const el = list.current?.querySelector<HTMLElement>(`[data-t="${tab}"]`);
      const l = line.current;
      if (!el || !l) return;
      const to = { x: el.offsetLeft, scaleX: el.offsetWidth / 100 };
      if (animate && !reduced()) gsap.to(l, { ...to, duration: 0.3, ease: "power3.out" });
      else gsap.set(l, to);
    };
    place(!first.current);
    if (!first.current && !reduced() && panel.current) gsap.from(panel.current.querySelectorAll(".ors-ev"), { y: 10, opacity: 0, duration: 0.26, ease: "power3.out", stagger: 0.05, clearProps: "opacity,transform" });
    first.current = false;
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tab, lang]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key;
    let n = -1;
    if (k === "ArrowRight") n = (tab + 1) % inds.length;
    else if (k === "ArrowLeft") n = (tab - 1 + inds.length) % inds.length;
    else if (k === "Home") n = 0;
    else if (k === "End") n = inds.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setTab(n);
    list.current?.querySelector<HTMLElement>(`[data-t="${n}"]`)?.focus();
  };

  const ind = inds[tab];
  return (
    <>
      <div ref={list} className="ors-tabs" role="tablist" aria-label={lang === "es" ? "Indicadores del ODS 13" : "SDG 13 indicators"}>
        {inds.map((it, ix) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            id={`ors-tab-${ix}`}
            data-t={ix}
            className="ors-tab"
            aria-selected={ix === tab}
            aria-controls="ors-panel"
            tabIndex={ix === tab ? 0 : -1}
            onClick={() => setTab(ix)}
            onKeyDown={onKey}
          >
            {it.id} · {it.name[lang]}
          </button>
        ))}
        <span ref={line} className="ors-tabline" aria-hidden="true" />
      </div>
      <div ref={panel} className="ors-panel" id="ors-panel" role="tabpanel" aria-labelledby={`ors-tab-${tab}`} tabIndex={0}>
        <h3>
          {ind.id} · {ind.name[lang]}
        </h3>
        <p>{ind.lead[lang]}</p>
        <ul className="ors-evs">
          {ind.evidence.map((e) => (
            <li key={e.title.es} className="ors-ev">
              <div>
                <b>{e.title[lang]}</b>
                <small>
                  {e.type[lang]} · {e.source[lang]}
                </small>
              </div>
              <span className={`odsx-chip ${e.status}`}>{EVIDENCE_LABEL[e.status][lang]}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* --- Plantilla genérica (ODS sin detalle) ------------------------------------------------------------------ */

function GenericSections({ o, published }: { o: Ods; published: boolean }) {
  const pct = odsPct(o);
  const status = odsStatus(o);
  return (
    <>
      <section className="ors-sec ors-sec--alt" id="ors-cifras" aria-labelledby="ors-cifras-h">
        <div className="odsx-wrap">
          <div className="ors-head">
            <p className="odsx-eyebrow">Cifras de la edición 2025</p>
            <h2 id="ors-cifras-h">Lo que la UDES ya puede mostrar.</h2>
            {!o.real && (
              <p>
                <span className="odsx-ilus">Dato ilustrativo</span>
              </p>
            )}
          </div>
          <div className="ors-stats ors-stats--two">
            {o.figures.map((f) => {
              const p = parseFigure(f.value);
              return (
                <div key={f.label} className="ors-stat">
                  <div className="ors-stat__big">
                    {p ? (
                      <>
                        {p.before}
                        <Counter to={p.to} lang="es" decimals={p.decimals} />
                        {p.after}
                      </>
                    ) : (
                      f.value
                    )}
                    <small>{f.unit}</small>
                  </div>
                  <p>{f.label}</p>
                </div>
              );
            })}
          </div>
          <p className="ors-notice" role="note">
            {published && <b>Informe publicado de la edición 2025. </b>}
            El detalle por indicador se carga desde el editor de informes.
          </p>
        </div>
      </section>

      {ODS_PUBLIC.evidence && !published && (
        <section className="ors-sec" id="ors-avance" aria-labelledby="ors-avance-h">
          <div className="odsx-wrap">
            <div className="ors-head">
              <p className="odsx-eyebrow">Avance de evidencias · edición 2026</p>
              <h2 id="ors-avance-h">
                {o.ok} de {o.total} evidencias verificadas.
              </h2>
            </div>
            <div className="ors-card ors-progress">
              <Ring ok={o.ok} total={o.total} label={`${o.ok} de ${o.total} evidencias verificadas (${pct} %)`} />
              <div>
                <span className={`odsx-chip ${status}`}>{STATUS_LABEL[status]}</span>
                <p>
                  {pct} % del expediente listo. {o.the ? "Este ODS se envía a THE en la edición 2026." : "Este ODS no se envía a THE en la edición 2026; el expediente se mantiene para el informe institucional."}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {!published && (
        <section className={`ors-sec${ODS_PUBLIC.evidence ? " ors-sec--alt" : ""}`} id="ors-viene" aria-labelledby="ors-viene-h">
          <div className="odsx-wrap">
            <div className="ors-head">
              <p className="odsx-eyebrow">Lo que viene</p>
              <h2 id="ors-viene-h">La UDES prevé {o.next}</h2>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
