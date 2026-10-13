/* =============================================================================
   UDES Sostenible · informe de un ODS del THE Impact Rankings.

   /sostenible/impact/informes/ods/:n?edicion=2025|2026

   - ODS 13: el informe completo (expediente de evidencias en 2026; informe
     publicado en 2025), en español o inglés.
   - Los demás ODS: el cartel con su color oficial y su dibujo, la tesis, las
     dos cifras y lo que viene, hasta que el editor de informes cargue el detalle.

   Composición «cartel»: cada informe es un pliego que nace de su cartel. El
   primer pliego es el campo plano del color del ODS, con el número colosal
   detrás del personaje (el PNG tiene transparencia y la figura tapa parte del
   número) y el dibujo sangrando por el borde inferior. Luego se alternan pliegos
   de papel (apenas un matiz del ODS) y bloques a sangre del color pleno. Las
   cifras son tipografía sobre una rejilla de 12 columnas, no tarjetas.

   Las evidencias, su avance y el estado son internos: todo ese bloque queda
   detrás de `ODS_PUBLIC.evidence` (apagado), que el importador de informes de
   la intranet activará informe por informe. Con el interruptor apagado no
   aparecen ni en el menú ni en el scroll-spy.

   Siempre en fondo claro (tokens `--o-*` de `.odsx`). Movimiento con GSAP: una
   sola coreografía de entrada (cortina del campo, máscara del número, la
   figura que sube, el titular por líneas) y revelados al hacer scroll. Todo el
   contenido está completo en reposo; con movimiento reducido no hay animación.
   Nunca `clearProps: "all"`: borraría las variables de color en línea.
   ========================================================================== */

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { OdsShell } from "./OdsShell";
import { OdsBulletinDownloadLink } from "./OdsBulletinDownload";
import { EVIDENCE_LABEL, ODS13, ODS_EDITIONS, ODS_PUBLIC, ODS_ROUTES, STATUS_LABEL, odsArt, odsByNumber, odsEdition, odsEvidenceTotals, odsPct, odsStatus } from "./ods-data";
import type { Bi, Ods, OdsEdition } from "./ods-data";
import { OdsNews } from "./OdsNews";
import { OdsPilo, recortesDe, seccionesPilo } from "./OdsPilo";
import { usePublicInforme } from "../rankings/informes/datos";
import { Arrow, Counter, CutFilter, OdsReportIntro, OdsReportVideo, PlayMark, Words, fmtN, introSeen, parseFigure } from "./OdsReportParts";
import { OdsArtStrip, odsArtSize, odsOn, odsTone } from "./OdsArt";
import type { Lang } from "./OdsReportParts";
import { reduced } from "./widgets";
import "./ods-report.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Valores de la franja de «stripes» bajo el cartel (actividad mensual, ilustrativo). */
const STRIPES = [0.45, 0.5, 0.38, 0.6, 0.55, 0.7, 0.62, 0.48, 0.8, 0.74, 0.9, 0.66, 0.58, 0.72, 0.95, 0.82, 0.68, 0.77, 0.88, 0.7, 0.6, 0.84, 0.92, 0.8];

/** Reparto de las cifras en la rejilla de 12 columnas: columna y tamaño. Las de una misma fila comparten línea base. */
type Slot = { col: string; size: "xl" | "l" | "m" };
const SLOTS_13: Slot[] = [
  { col: "1 / 8", size: "xl" },
  { col: "9 / 13", size: "l" },
  { col: "1 / 5", size: "m" },
  { col: "5 / 9", size: "m" },
  { col: "9 / 13", size: "m" },
];
const SLOTS_2: Slot[] = [
  { col: "1 / 8", size: "xl" },
  { col: "9 / 13", size: "l" },
];

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
  /* El informe redactado con Pilo, si está publicado para esta edición (solo en español). */
  const piloQ = usePublicInforme(o.n, edition);
  const pilo = L === "es" ? (piloQ.data ?? null) : null;
  const piloSecs = seccionesPilo(pilo, full);

  /* «check» es el HTML inicial: contenido completo, sin intro. En el navegador se decide antes de pintar. */
  const [phase, setPhase] = useState<Phase>("check");
  const [overlay, setOverlay] = useState(false);
  const withIntro = useRef(false);
  useIsoLayoutEffect(() => {
    const intro = !reduced() && !introSeen(o.n);
    withIntro.current = intro;
    setOverlay(intro);
    setPhase(intro ? "intro" : "ready");
  }, [o.n]);

  const baseSections: [string, string][] = full
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
  /* Con informe publicado: los demás ODS usan sus secciones; el 13 suma el relato. */
  const sections: [string, string][] = !pilo || !piloSecs.length ? baseSections : full ? [...baseSections, ...piloSecs] : piloSecs;
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

  /* La coreografía: arranca cuando termina la intro (o de una vez si no la hay). */
  useGSAP(
    () => {
      if (phase !== "ready" || reduced()) return;
      const root = scope.current;
      if (!root) return;
      const q = <T extends Element = HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));
      const hero = root.querySelector<HTMLElement>(".ors-hero");

      /* 1. El cartel. Sin intro, el campo entra como cortina desde la tira; con intro, ya está puesto. */
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      if (!withIntro.current) tl.fromTo(".ors-hero__field", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.6, clearProps: "clipPath" }, 0);
      const t0 = withIntro.current ? 0 : 0.22;
      tl.fromTo(".ors-num", { clipPath: "inset(100% 0 0 0)", yPercent: 10 }, { clipPath: "inset(0% 0 0 0)", yPercent: 0, duration: 0.6, clearProps: "clipPath,transform" }, t0)
        .from(".ors-fig-art", { yPercent: 14, opacity: 0, duration: 0.6, ease: "power3.out", clearProps: "opacity,transform" }, t0 + 0.12)
        .fromTo(".ors-w--h1", { yPercent: 110 }, { yPercent: 0, duration: 0.55, stagger: 0.04, clearProps: "transform" }, t0 + 0.05)
        .from(".ors-hero__in", { y: 12, opacity: 0, duration: 0.45, ease: "power3.out", stagger: 0.06, clearProps: "opacity,transform" }, t0 + 0.25)
        .from(".ors-stripes__row i", { scaleY: 0, duration: 0.4, ease: "power3.out", stagger: 0.012, clearProps: "transform" }, t0 + 0.3);

      /* 2. Profundidad al hacer scroll: la figura baja un poco y el número sube (solo transform). */
      if (hero) {
        gsap.to(".ors-hero__figure", { yPercent: 6, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.3 } });
        gsap.to(".ors-hero__num", { yPercent: -6, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.3 } });
      }

      /* 3. Titulares de sección: por líneas enmascaradas. */
      q(".ors-h2").forEach((h) => {
        const words = h.querySelectorAll(".ors-w");
        gsap.fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: "power4.out", stagger: 0.025, clearProps: "transform", scrollTrigger: { trigger: h, start: "top 88%", once: true } });
      });

      /* 4. Reglas finas que se trazan y piezas que llegan. */
      q(".ors-rule").forEach((r) => {
        gsap.fromTo(r, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.out", clearProps: "transform", scrollTrigger: { trigger: r, start: "top 92%", once: true } });
      });
      ScrollTrigger.batch(q(".ors-rise"), {
        start: "top 92%",
        once: true,
        onEnter: (b) => void gsap.from(b, { y: 18, opacity: 0, duration: 0.5, ease: "power3.out", stagger: 0.06, clearProps: "opacity,transform" }),
      });

      /* 5. Las cifras cuentan con salida fuerte. */
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
              duration: 1,
              ease: "power4.out",
              onUpdate: () => void (c.textContent = fmtN(dec ? s.v : Math.round(s.v), lg, dec)),
              onComplete: () => void (c.textContent = fmtN(to, lg, dec)),
            }),
        });
      });

      /* 6. Comparación: el tramo se traza desde 2025 y el punto de 2026 llega a su sitio. */
      q(".ors-dot-row").forEach((row) => {
        const a = row.querySelector<HTMLElement>(".ors-dot--a");
        const b = row.querySelector<HTMLElement>(".ors-dot--b");
        const seg = row.querySelector<HTMLElement>(".ors-seg");
        if (!a || !b || !seg) return;
        gsap
          .timeline({ scrollTrigger: { trigger: row, start: "top 90%", once: true }, defaults: { ease: "power3.out" } })
          .fromTo(seg, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.6, clearProps: "clipPath" }, 0)
          .from(b, { x: () => a.offsetLeft - b.offsetLeft, duration: 0.6, clearProps: "transform" }, 0)
          .from(row.querySelectorAll(".ors-dot-row__v"), { opacity: 0, duration: 0.3, ease: "power2.out", clearProps: "opacity" }, 0.35);
      });

      /* 7. La ruta: la línea se dibuja con el scroll. */
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
    if (!reduced() && scope.current) gsap.fromTo(scope.current.querySelector(".ors-main"), { opacity: 0.4 }, { opacity: 1, duration: 0.25, ease: "power2.out", clearProps: "opacity" });
  }, [lang]);

  const goTo = (id: string) => {
    document.getElementById(`ors-${id}`)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  };

  const prev = o.n > 1 ? odsByNumber(o.n - 1) : undefined;
  const next = o.n < 17 ? odsByNumber(o.n + 1) : undefined;
  const name = full ? tx("Acción por el clima", "Climate action") : o.name;
  const title = full ? tx("ODS 13: Acción por el clima", "SDG 13: Climate Action") : `ODS ${o.n}: ${o.name}`;
  const status = odsStatus(o);
  const totals = odsEvidenceTotals();
  const stripesCaption = full ? tx("CO₂ evitado por mes, 2025–2026", "CO₂ avoided per month, 2025–2026") : "Actividad mensual del ODS, 2025–2026";
  const ilus = tx("Dato ilustrativo", "Illustrative data");

  return (
    <div ref={scope} className="ors" lang={L} style={odsTone(o.color)}>
      <CutFilter />
      {overlay && (
        <OdsReportIntro
          n={o.n}
          color={o.color}
          label={name}
          skipLabel={tx("Saltar", "Skip")}
          onReady={() => setPhase("ready")}
          onGone={() => setOverlay(false)}
        />
      )}

      {/* Barra del informe: la tira de los 17, las secciones y el idioma */}
      <div className="ors-bar">
        <OdsArtStrip current={o.n} edition={edition} label={tx("Los 17 informes ODS", "The 17 SDG reports")} />
        <div className="odsx-wrap ors-bar__row">
          <span className="ors-mark">
            <b>UDES</b>
            <span>{full ? tx(`Informe ODS 13 · ${edition}`, `SDG 13 report · ${edition}`) : `Informe ODS ${o.n} · ${edition}`}</span>
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
            <div className="ors-lang" role="group" aria-label={tx("Idioma", "Language")}>
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
        {/* El cartel */}
        <section className="ors-hero" aria-labelledby="ors-h1">
          <div className="ors-hero__field" aria-hidden="true" />
          <div className="ors-hero__art">
            <div className="ors-hero__num" aria-hidden="true">
              <span className="ors-num">{o.n}</span>
            </div>
            <div className="ors-hero__figure">
              <img className="ors-fig-art" src={odsArt(o.n)} alt={tx(`Ilustración del ODS ${o.n}`, `SDG ${o.n} illustration`)} {...odsArtSize(o.n)} loading="eager" decoding="async" />
            </div>
          </div>
          <div className="odsx-wrap ors-hero__wrap">
            <div className="ors-hero__tools ors-hero__in">
              <Link to={ODS_ROUTES.portal} className="ors-hero__back">
                <Arrow dir="left" /> {tx("Volver a los 17 informes", "Back to the 17 reports")}
              </Link>
              <div className="ors-ed" role="group" aria-label={tx("Edición", "Edition")}>
                {ODS_EDITIONS.map((e) => (
                  <Link key={e} to={ODS_ROUTES.report(o.n, e)} replace aria-current={e === edition ? "page" : undefined} aria-label={tx(`Edición ${e}`, `${e} edition`)}>
                    {e}
                  </Link>
                ))}
              </div>
              <OdsBulletinDownloadLink className="ors-hero__link" text={tx("Boletín (PDF)", "Bulletin (PDF)")} />
            </div>

            <div className="ors-hero__text">
              <h1 id="ors-h1" className="ors-h1" key={L} aria-label={title}>
                <Words text={title} cls="ors-w ors-w--h1" />
              </h1>
              <p className="ors-lede ors-hero__in">
                {full ? tx("Cómo la Universidad de Santander reduce su huella de carbono e investiga las soluciones energéticas que definirán un futuro sostenible para Colombia.", "How Universidad de Santander reduces its carbon footprint and researches the energy solutions that will define a sustainable future for Colombia.") : o.thesis}
              </p>
              <dl className="ors-meta ors-hero__in">
                <div>
                  <dt>{tx("Ranking", "Ranking")}</dt>
                  <dd>THE Impact Rankings</dd>
                </div>
                <div>
                  <dt>{tx("Periodo", "Period")}</dt>
                  <dd>{edition}</dd>
                </div>
                {!published && (
                  <div>
                    <dt>{tx("Edición anterior", "Previous edition")}</dt>
                    <dd>2025</dd>
                  </div>
                )}
                <div>
                  <dt>{tx("Responsable", "Owner")}</dt>
                  <dd>{tx("Oficina de Planeación", "Planning Office")}</dd>
                </div>
                {(published || ODS_PUBLIC.status) && (
                  <div>
                    <dt>{tx("Estado", "Status")}</dt>
                    <dd>{published ? tx("Publicado", "Published") : full ? tx("Borrador para revisión", "Draft for review") : STATUS_LABEL[status]}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </section>

        {/* La franja de actividad, a sangre, cierra el cartel */}
        <figure className="ors-stripes">
          <div className="ors-stripes__row" role="img" aria-label={`${stripesCaption}. ${ilus}`}>
            {STRIPES.map((v, i) => (
              <i key={i} style={{ background: `color-mix(in srgb, var(--ods) ${Math.round(v * 100)}%, #fff)` }} />
            ))}
          </div>
          <figcaption className="odsx-wrap">
            <span>{stripesCaption}</span>
            <span className="ors-ilus">{ilus}</span>
          </figcaption>
        </figure>

        {published && (
          <div className="odsx-wrap">
            <p className="ors-note" role="note">
              <b>{tx("Informe publicado de la edición 2025.", "Published report of the 2025 edition.")}</b>{" "}
              {tx("Muestra las cifras y la ruta tal como se enviaron; la comparación con el nuevo periodo está en la edición 2026.", "It shows the figures and roadmap as submitted; the comparison with the new period lives in the 2026 edition.")}{" "}
              <Link to={ODS_ROUTES.report(o.n, 2026)} replace>
                {tx("Ver la edición 2026", "See the 2026 edition")}
              </Link>
            </p>
          </div>
        )}

        {full ? (
          <>
            {ODS_PUBLIC.evidence && !published && (
              <section className="ors-sec" id="ors-resumen" aria-labelledby="ors-resumen-h">
                <div className="odsx-wrap">
                  <SecHead id="ors-resumen-h" text={tx("Cuatro indicadores, un avance de evidencias.", "Four indicators, one evidence tracker.")}>
                    {tx("Cada indicador del ODS 13 muestra cuántas evidencias están verificadas. Toca uno para ir a su detalle.", "Each SDG 13 indicator shows how many pieces of evidence are verified. Tap one to see its detail.")}
                  </SecHead>
                  <ol className="ors-inds">
                    {ODS13.indicators.map((ind, ix) => {
                      const ok = ind.evidence.filter((e) => e.status === "ok").length;
                      return (
                        <li key={ind.id}>
                          <button
                            type="button"
                            className="ors-ind ors-rise"
                            onClick={() => {
                              setTab(ix);
                              goTo("evidencias");
                            }}
                          >
                            <span className="ors-ind__code">{ind.id}</span>
                            <span className="ors-ind__name">{t(ind.name)}</span>
                            <Ring ok={ok} total={ind.evidence.length} label={tx(`${ok} de ${ind.evidence.length} evidencias verificadas`, `${ok} of ${ind.evidence.length} pieces of evidence verified`)} />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="ors-total">
                    {tx("Total verificado", "Total verified")}: <b>{totals.ok} / {totals.total}</b> · {tx("En revisión", "In review")}: <b>{totals.rev}</b> · {tx("Por conseguir", "Still to gather")}: <b>{totals.falta}</b>
                  </p>
                </div>
              </section>
            )}

            <section className="ors-sec" id="ors-cifras" aria-labelledby="ors-cifras-h">
              <div className="odsx-wrap">
                <SecHead id="ors-cifras-h" text={tx("Resultados medibles de la gestión climática.", "Measurable results of climate management.")} />
                <div className="ors-figs">
                  {ODS13.stats.map((s, i) => (
                    <Figure
                      key={i}
                      slot={SLOTS_13[i] ?? SLOTS_13[4]}
                      big={s.to === null ? <span className="ors-fig__word">{tx("Certificada", "Certified")}</span> : <Counter key={L} to={s.to} lang={L} />}
                      unit={t(s.unit)}
                      text={t(s.text)}
                    />
                  ))}
                </div>
                <p className="ors-source">{tx("Cifras del informe publicado de la edición 2025.", "Figures from the published report of the 2025 edition.")}</p>
              </div>
            </section>

            {!published && (
              <section className="ors-sec ors-sec--white" id="ors-avance" aria-labelledby="ors-avance-h">
                <div className="odsx-wrap">
                  <SecHead id="ors-avance-h" text={tx("Lo que cambia entre 2025 y 2026.", "What changes between 2025 and 2026.")}>
                    <span className="ors-ilus">{tx("Cifras 2026 ilustrativas", "2026 figures are illustrative")}</span>
                  </SecHead>
                  <div className="ors-dots">
                    <div className="ors-dots__key" aria-hidden="true">
                      <span>
                        <i className="ors-dot ors-dot--a" /> 2025
                      </span>
                      <span>
                        <i className="ors-dot ors-dot--b" /> 2026
                      </span>
                    </div>
                    {ODS13.compare.map((c) => {
                      const mx = Math.max(c.y2025, c.y2026) * 1.08;
                      const gain = Math.round(((c.y2026 - c.y2025) / c.y2025) * 100);
                      const pa = (c.y2025 / mx) * 100;
                      const pb = (c.y2026 / mx) * 100;
                      return (
                        <div key={c.label.es} className="ors-dot-row">
                          <span className="ors-rule" aria-hidden="true" />
                          <p className="ors-dot-row__label">{t(c.label)}</p>
                          <div className="ors-dot-row__plot" role="img" aria-label={`${t(c.label)}: 2025, ${fmtN(c.y2025, L)}${c.suffix}; 2026, ${fmtN(c.y2026, L)}${c.suffix}`}>
                            <span className="ors-track" />
                            <span className="ors-seg" style={{ left: `${pa}%`, width: `${pb - pa}%` }} />
                            <i className="ors-dot ors-dot--a" style={{ left: `${pa}%` }} />
                            <i className="ors-dot ors-dot--b" style={{ left: `${pb}%` }} />
                            <span className="ors-dot-row__v ors-dot-row__v--a" style={{ left: `${pa}%` }}>
                              {fmtN(c.y2025, L) + c.suffix}
                            </span>
                            <span className="ors-dot-row__v ors-dot-row__v--b" style={{ left: `${pb}%` }}>
                              {fmtN(c.y2026, L) + c.suffix}
                            </span>
                          </div>
                          <p className="ors-dot-row__gain">
                            +{gain}
                            <small>%</small>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {ODS_PUBLIC.evidence && !published && (
              <section className="ors-sec" id="ors-evidencias" aria-labelledby="ors-evidencias-h">
                <div className="odsx-wrap">
                  <SecHead id="ors-evidencias-h" text={tx("Cada afirmación tiene su soporte.", "Every claim has its support.")}>
                    <span className="ors-ilus">{tx("Evidencias de muestra", "Sample evidence")}</span>
                  </SecHead>
                  <OdsReportTabs tab={tab} setTab={setTab} lang={L} />
                </div>
              </section>
            )}

            {!published && (
              <section className="ors-sec ors-block" id="ors-hidrogeno" aria-labelledby="ors-hidrogeno-h">
                <div className="odsx-wrap ors-block__wrap">
                  <SecHead id="ors-hidrogeno-h" text={tx("El Centro de Hidrógeno de la UDES.", "The UDES Hydrogen Center.")}>
                    {tx("Apoyado por el Doctorado en Recursos Energéticos Renovables, es un referente nacional e internacional.", "Backed by the PhD in Renewable Energy Resources, it is a national and international benchmark.")}
                  </SecHead>
                  <ul className="ors-vids">
                    {ODS13.videos.map((v, i) => (
                      <li key={v.id}>
                        <button type="button" className="ors-vid ors-rise" onClick={() => setVideo(i)} aria-haspopup="dialog">
                          <span className="ors-play" aria-hidden="true">
                            <PlayMark />
                          </span>
                          <span className="ors-vid__t">{t(v.title)}</span>
                          <span className="ors-vid__x">{t(v.text)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            <section className="ors-sec" id="ors-ruta" aria-labelledby="ors-ruta-h">
              <div className="odsx-wrap ors-ruta">
                <div className="ors-ruta__anchor" aria-hidden="true">
                  <div className="ors-crop">
                    <img src={odsArt(o.n)} alt="" {...odsArtSize(o.n)} loading="lazy" decoding="async" />
                  </div>
                </div>
                <div className="ors-ruta__body">
                  <SecHead id="ors-ruta-h" text={tx("De lo logrado a lo que viene.", "From what was achieved to what comes next.")} />
                  <div className="ors-tl">
                    <span className="ors-tl__line" aria-hidden="true" />
                    <ol>
                      {ODS13.timeline.map((s, i) => (
                        <Fragment key={s.title.es}>
                          {(i === 0 || ODS13.timeline[i - 1].when !== s.when) && (
                            <li className="ors-tl__year" aria-hidden="true">
                              {s.when}
                            </li>
                          )}
                          <li className={`ors-step ors-rise${s.planned ? " plan" : ""}`}>
                            {s.planned && <span className="ors-step__when">{tx("Previsto", "Planned")}</span>}
                            <b>{t(s.title)}</b>
                            <span>{t(s.text)}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ol>
                  </div>
                  {!published && (
                    <div className="ors-allies">
                      <h3>{tx("Alianzas", "Partnerships")}</h3>
                      <ul>
                        {ODS13.allies.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : pilo ? (
          <OdsPilo o={o} informe={pilo} />
        ) : (
          <GenericSections o={o} published={published} />
        )}

        {/* El ODS 13 conserva su detalle y recibe el relato de Pilo antes de las noticias. */}
        {full && pilo && <OdsPilo o={o} informe={pilo} soloRelato />}

        {/* Las notas de udes.edu.co que Planeación aprobó para este ODS (solo la edición 2025: son noticias de 2025). */}
        {edition === 2025 && <OdsNews n={o.n} recortes={recortesDe(pilo)} />}

        {/* ODS anterior y siguiente: el cartel vecino asoma */}
        <nav className={`ors-pager${prev && next ? "" : " ors-pager--one"}`} aria-label={tx("Otros informes ODS", "Other SDG reports")}>
          {prev && <PagerLink o={prev} edition={edition} label={tx("ODS anterior", "Previous SDG")} dir="left" />}
          {next && <PagerLink o={next} edition={edition} label={tx("ODS siguiente", "Next SDG")} dir="right" />}
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
    </div>
  );
}

/* --- Piezas de composición ------------------------------------------------------------------------------- */

/** Titular de sección: el texto entero en `aria-label`, las palabras en máscaras; debajo, la entrada. */
function SecHead({ id, text, children }: { id: string; text: string; children?: ReactNode }) {
  return (
    <header className="ors-head">
      <h2 id={id} className="ors-h2" aria-label={text}>
        <Words text={text} />
      </h2>
      {children && <p className="ors-head__p">{children}</p>}
    </header>
  );
}

/** Una cifra como tipografía: regla fina, número grande y su pie como nota al margen. */
function Figure({ slot, big, unit, text }: { slot: Slot; big: ReactNode; unit: string; text: string }) {
  return (
    <div className={`ors-fig ors-fig--${slot.size}`} style={{ "--col": slot.col } as CSSProperties}>
      <span className="ors-rule" aria-hidden="true" />
      <p className="ors-fig__big">
        {big}
        {unit && !unit.includes(" ") && <small>{unit}</small>}
        {unit.includes(" ") && <span className="ors-fig__unit">{unit}</span>}
      </p>
      <p className="ors-fig__note">{text}</p>
    </div>
  );
}

/** Enlace al cartel vecino: su color, su número colosal y su nombre. */
function PagerLink({ o, edition, label, dir }: { o: Ods; edition: OdsEdition; label: string; dir: "left" | "right" }) {
  return (
    <Link to={ODS_ROUTES.report(o.n, edition)} className={`ors-pager__a ors-pager__a--${dir}`} style={{ "--c": o.color, "--c-on": odsOn(o.color) } as CSSProperties}>
      <span className="ors-pager__in">
        <small>
          {dir === "left" && <Arrow dir="left" />}
          {label}
          {dir === "right" && <Arrow dir="right" />}
        </small>
        <b>{o.name}</b>
      </span>
      <span className="ors-pager__n" aria-hidden="true">
        {o.n}
      </span>
    </Link>
  );
}

/* --- Anillo de evidencias (interno: solo con ODS_PUBLIC.evidence) ------------------------------------------ */

function Ring({ ok, total, label }: { ok: number; total: number; label: string }) {
  const p = Math.round((ok / total) * 100);
  return (
    <span className="ors-ring" style={{ "--p": p } as CSSProperties} role="img" aria-label={label}>
      <span className="ors-ring__bar" aria-hidden="true">
        <i />
      </span>
      <b aria-hidden="true">
        {ok}/{total}
      </b>
    </span>
  );
}

/* --- Pestañas de evidencias (ODS 13, internas) -------------------------------------------------------------- */

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
      if (animate && !reduced()) gsap.to(l, { ...to, duration: 0.28, ease: "power3.out" });
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
              <span className={`ors-ev__st ${e.status}`}>{EVIDENCE_LABEL[e.status][lang]}</span>
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
      <section className="ors-sec" id="ors-cifras" aria-labelledby="ors-cifras-h">
        <div className="odsx-wrap">
          <SecHead id="ors-cifras-h" text="Lo que la UDES ya puede mostrar." />
          <div className="ors-figs">
            {o.figures.map((f, i) => {
              const p = parseFigure(f.value);
              return (
                <Figure
                  key={f.label}
                  slot={SLOTS_2[i]}
                  big={
                    p ? (
                      <>
                        {p.before}
                        <Counter to={p.to} lang="es" decimals={p.decimals} />
                        {p.after}
                      </>
                    ) : (
                      f.value
                    )
                  }
                  unit={f.unit}
                  text={f.label}
                />
              );
            })}
          </div>
          <p className="ors-source">
            {published && <b>Informe publicado de la edición 2025. </b>}
            Cifras de la edición 2025. El detalle por indicador se carga desde el editor de informes.
            {!o.real && <span className="ors-ilus">Dato ilustrativo</span>}
          </p>
        </div>
      </section>

      {ODS_PUBLIC.evidence && !published && (
        <section className="ors-sec ors-sec--white" id="ors-avance" aria-labelledby="ors-avance-h">
          <div className="odsx-wrap">
            <SecHead id="ors-avance-h" text={`${o.ok} de ${o.total} evidencias verificadas.`} />
            <div className="ors-progress">
              <Ring ok={o.ok} total={o.total} label={`${o.ok} de ${o.total} evidencias verificadas (${pct} %)`} />
              <p>
                <b>{STATUS_LABEL[status]}.</b> {pct} % del expediente listo. {o.the ? "Este ODS se envía a THE en la edición 2026." : "Este ODS no se envía a THE en la edición 2026; el expediente se mantiene para el informe institucional."}
              </p>
            </div>
          </div>
        </section>
      )}

      {!published && (
        <section className="ors-sec ors-block ors-block--next" id="ors-viene" aria-labelledby="ors-viene-h">
          <div className="ors-block__art" aria-hidden="true">
            <img src={odsArt(o.n)} alt="" {...odsArtSize(o.n)} loading="lazy" decoding="async" />
          </div>
          <div className="odsx-wrap ors-block__wrap">
            <SecHead id="ors-viene-h" text={`La UDES prevé ${o.next}`} />
          </div>
        </section>
      )}
    </>
  );
}
