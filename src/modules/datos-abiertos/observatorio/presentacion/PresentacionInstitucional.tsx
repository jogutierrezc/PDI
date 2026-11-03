/* =============================================================================
   Observatorio · Presentación Institucional (tema `presentacion-institucional`).

   Página fija, hecha en código (no se edita desde la intranet): la portada
   pública de ese tema. Tira de 11 colores, portada con el tablero «Pulso»,
   manifiesto como ciclo, cuatro estaciones con un muro de carteles (uno por
   tema del Observatorio) y el centro de documentación.

   · Cifras: lo publicado (live.ts) si el tema ya publicó; si no, OBS_TOPICS
     (data.ts) con la marca «Dato ilustrativo». Sin filtros: es el total.
   · Idioma: ES | EN con useLang/LangSwitch del portal (?lang= + localStorage).
   · Movimiento (GSAP): tira que se dibuja, titular por líneas enmascaradas,
     aletas del tablero, carteles que se abren desde su esquina, rail que se
     llena y ciclo del manifiesto. Sin GSAP o con prefers-reduced-motion, la
     página está completa y quieta.
   ========================================================================== */

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { OpenDataLayout } from "../../components/OpenDataLayout";
import { LangSwitch } from "../../../sostenible/LangSwitch";
import { useLang } from "../../../sostenible/i18n";
import { reduced } from "../../../sostenible/widgets";
import { findTopic } from "../data";
import { useCatalogo } from "../catalogo";
import { useLive } from "../Observatory";
import { ESTACIONES, ESTACION_EXTRA, MODULOS, PULSO, SALIDAS } from "./datos";
import type { Modulo } from "./datos";
import { TEXTOS } from "./textos";
import type { Idioma, Textos } from "./textos";
import "../../datos-abiertos.css";
import "../observatorio.css";
import "./presentacion.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const LINEAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const lineaStyle = (n: number, extra?: Record<string, string | number>) => ({ "--c": `var(--od-line-${n})`, ...extra }) as CSSProperties;

/* --- Cifras -------------------------------------------------------------------------------------- */

interface Cifra {
  texto: string;
  unidad: string;
  /** Corte anterior ya formateado; null si no hay de dónde sacarlo sin inventarlo. */
  previo: string | null;
  etiqueta: string | null;
  ilustrativo: boolean;
}

const fmt = (lang: Idioma, n: number, dec: number) =>
  new Intl.NumberFormat(lang === "en" ? "en-US" : "es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);

/**
 * La cifra de un módulo: lo publicado si existe; si no, la de ejemplo de data.ts.
 * El corte anterior sale del punto previo de la serie (de ejemplo o publicada)
 * y solo si la serie termina en la cifra titular: nunca se inventa.
 */
function cifraDe(m: Modulo, lang: Idioma, live: ReturnType<typeof useLive>): Cifra | null {
  if (!m.slug) return null;
  const real = live.get(m.slug)?.summary;
  if (real) {
    const pct = real.format === "porcentaje";
    const dec = pct ? 1 : real.format === "entero" ? 0 : 2;
    const prev = real.spark && real.spark.length > 1 ? real.spark[real.spark.length - 2] : null;
    return {
      texto: fmt(lang, real.value, dec),
      unidad: pct ? "%" : "",
      previo: prev === null ? null : `${fmt(lang, prev, dec)}${pct ? " %" : ""}`,
      etiqueta: real.label,
      ilustrativo: false,
    };
  }
  const topic = findTopic(m.slug);
  if (!topic) return null;
  const pct = topic.headline.format === "porcentaje";
  const dec = pct ? 1 : 0;
  const puntos = topic.series.points;
  const cierraEnCifra = puntos.length > 1 && puntos[puntos.length - 1][1] === topic.headline.value;
  const prev = cierraEnCifra ? puntos[puntos.length - 2][1] : null;
  return {
    texto: fmt(lang, topic.headline.value, dec),
    unidad: pct ? "%" : "",
    previo: prev === null ? null : `${fmt(lang, prev, dec)}${pct ? " %" : ""}`,
    etiqueta: null,
    ilustrativo: true,
  };
}

/** Las aletas de una cifra: un carácter por aleta; los separadores quedan sueltos. */
function Aletas({ texto, unidad }: { texto: string; unidad: string }) {
  return (
    <>
      {[...texto].map((ch, i) =>
        ch === "." || ch === "," || ch === " " || ch === "<" ? (
          <span className="pi-fs" key={i}>{ch === " " ? " " : ch}</span>
        ) : (
          <span className="pi-fl" key={i}>{ch}</span>
        ),
      )}
      {unidad && <span className="pi-fu">{unidad}</span>}
    </>
  );
}

const Flecha = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

function irA(e: MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

/* --- Página -------------------------------------------------------------------------------------- */

export function PresentacionInstitucional() {
  const { lang, setLang } = useLang();
  const t: Textos = TEXTOS[lang];
  const live = useLive();
  const catalogo = useCatalogo();
  const root = useRef<HTMLDivElement>(null);
  const primera = useRef(true);

  // Los temas publicados que no están entre los módulos fijos (ni son esta página) se suman solos en una última estación.
  const extras = useMemo<Modulo[]>(() => {
    const fijos = new Set<string>(["presentacion-institucional", ...MODULOS.flatMap((m) => (m.slug ? [m.slug] : []))]);
    const spans = [7, 5, 5, 7];
    const ids = new Set<string>(MODULOS.map((m) => m.id));
    const nuevos = catalogo.principal.filter((tm) => !fijos.has(tm.slug));
    return nuevos.map((tm, i) => {
      const texto = { n: tm.name, d: tm.summary || tm.question, i: tm.name };
      const id = ids.has(tm.code) ? tm.slug : tm.code; // la clave de la cifra no puede chocar con un módulo fijo
      ids.add(id);
      return { id, slug: tm.slug, estacion: ESTACIONES.length, linea: tm.line, span: nuevos.length === 1 ? 12 : spans[i % 4], color: tm.color, textos: { es: texto, en: texto } };
    });
  }, [catalogo.principal]);
  const todos = useMemo(() => [...MODULOS, ...extras], [extras]);
  const estaciones = extras.length ? [...ESTACIONES, ESTACION_EXTRA] : ESTACIONES;
  const cifras = useMemo(() => new Map(todos.map((m) => [m.id, cifraDe(m, lang, live)])), [todos, lang, live]);
  const hayEjemplo = [...cifras.values()].some((c) => c?.ilustrativo);

  /* Animación: un momento orquestado en la portada y revelados al desplazar. En reposo todo está puesto. */
  useGSAP(
    () => {
      if (reduced() || !root.current) return;
      const el = root.current;
      el.classList.add("is-armed");
      try {
        const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
        tl.from(".pi-strip i", { scaleX: 0, transformOrigin: "0 50%", duration: 0.7, stagger: 0.03, clearProps: "transform" }, 0)
          .from(".pi-h1 .pi-ln > span", { yPercent: 105, duration: 0.95, stagger: 0.14, clearProps: "transform" }, 0.05)
          .from([".pi-lead", ".pi-cta", ".pi-sign"], { y: 14, opacity: 0, duration: 0.6, stagger: 0.08, clearProps: "opacity,transform" }, 0.45)
          .from(".pi-board", { opacity: 0, y: 20, duration: 0.7, clearProps: "opacity,transform" }, 0.25)
          .from(".pi-board .pi-row", { opacity: 0, x: -14, duration: 0.55, stagger: 0.07, clearProps: "opacity,transform" }, 0.5)
          .from(".pi-pulse li", { opacity: 0, y: 14, duration: 0.6, stagger: 0.08, clearProps: "opacity,transform" }, 0.9)
          .fromTo(".pi-board .pi-fl", { rotationX: -88, opacity: 0.15 }, { rotationX: 0, opacity: 1, duration: 0.26, ease: "power3.out", stagger: 0.018, clearProps: "transform,opacity" }, 0.62)
          .call(() => el.querySelectorAll(".pi-row").forEach((r) => r.setAttribute("data-fresh", "")), [], 0.9)
          .call(() => el.querySelectorAll(".pi-row").forEach((r) => r.removeAttribute("data-fresh")), [], 2.2);

        // rail que se llena con el avance
        gsap.fromTo(".pi-rail", { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: ".pi-route", start: "top 60%", end: "bottom 60%", scrub: 0.4 } });
        gsap.utils.toArray<HTMLElement>(".pi-station").forEach((st) => {
          ScrollTrigger.create({ trigger: st, start: "top 62%", end: "bottom 62%", toggleClass: { targets: st.querySelector(".pi-stop"), className: "on" } });
          gsap.from(st.querySelectorAll(".pi-st__h > *"), { opacity: 0, y: 18, duration: 0.7, stagger: 0.09, ease: "expo.out", clearProps: "opacity,transform", scrollTrigger: { trigger: st, start: "top 80%", once: true } });
        });

        // carteles: se abren desde su esquina, en oleada
        const carteles = gsap.utils.toArray<HTMLElement>(".pi-poster");
        gsap.set(carteles, { clipPath: "inset(0% 100% 100% 0%)" });
        carteles.forEach((p) => {
          if (p.getBoundingClientRect().top < window.innerHeight * 0.92) gsap.set(p, { clearProps: "clipPath" }); // si se cargó ya desplazado, nada queda oculto
        });
        ScrollTrigger.batch(carteles, {
          start: "top 92%",
          once: true,
          onEnter: (els) => gsap.to(els, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.85, ease: "expo.out", stagger: 0.07, clearProps: "clipPath" }),
        });

        // manifiesto: tres tramos y el bucle que vuelve a empezar
        gsap.from(".pi-arc", { opacity: 0, y: 22, duration: 0.7, stagger: 0.14, ease: "expo.out", clearProps: "opacity,transform", scrollTrigger: { trigger: ".pi-cycle", start: "top 78%", once: true } });
        gsap.fromTo(".pi-loop", { clipPath: "inset(100% -24px -24px -24px)" }, { clipPath: "inset(-24px -24px -24px -24px)", duration: 1.4, ease: "power2.inOut", clearProps: "clipPath", scrollTrigger: { trigger: ".pi-cycle", start: "top 70%", once: true } });
        gsap.from(".pi-exit", { opacity: 0, y: 16, duration: 0.6, stagger: 0.1, ease: "expo.out", clearProps: "opacity,transform", scrollTrigger: { trigger: ".pi-exits", start: "top 85%", once: true } });
      } catch {
        // Si algo falla, la página queda completa: se deshace todo lo armado.
        gsap.set(".pi-poster, .pi-arc, .pi-exit, .pi-st__h > *, .pi-board, .pi-row, .pi-loop, .pi-rail", { clearProps: "all" });
        el.classList.remove("is-armed");
      }
      return () => el.classList.remove("is-armed");
    },
    { scope: root },
  );

  // Al cambiar de idioma el texto cambia de alto: se recalculan los disparadores.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (reduced()) return;
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 80);
    return () => window.clearTimeout(id);
  }, [lang]);

  const nota = (texto: string) => (
    <p className="obs-note" role="note">
      <span className="od-stamp">{t.ilus}</span>
      <span>{texto}</span>
    </p>
  );

  return (
    <OpenDataLayout title={t.titulo_pagina} className="obs-page">
      <div className="pi" ref={root}>
        <div className="u-container">
          <div className="pi-top">
            <span className="pi-strip" aria-hidden="true">
              {LINEAS.map((n) => (
                <i key={n} style={lineaStyle(n)} />
              ))}
            </span>
            <LangSwitch lang={lang} onChange={setLang} />
          </div>
        </div>

        {/* Portada */}
        <section className="u-container pi-hero" aria-labelledby="pi-h1">
          <div>
            <h1 className="pi-h1" id="pi-h1">
              <span className="pi-ln pi-ln--a"><span>{t.h1a}</span></span>
              <span className="pi-ln"><span>{t.h1b}</span></span>
            </h1>
            <p className="pi-lead">{t.lead}</p>
            <div className="pi-cta">
              <a className="pi-btn pi-btn--sig" href="#pi-viaje" onClick={(e) => irA(e, "pi-viaje")}>
                <span>{t.cta1}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
              </a>
              <a className="pi-btn" href="#pi-documentacion" onClick={(e) => irA(e, "pi-documentacion")}>
                <span>{t.cta2}</span>
              </a>
            </div>
            <p className="pi-sign"><i aria-hidden="true" /><span>{t.firma}</span></p>
          </div>

          <aside className="pi-board" aria-labelledby="pi-bt">
            <div className="pi-board__h">
              <h2 id="pi-bt"><i aria-hidden="true" /><span>{t.tablero}</span></h2>
            </div>
            <ul>
              {PULSO.map((id) => {
                const m = MODULOS.find((x) => x.id === id)!;
                const c = cifras.get(id) ?? null;
                const L = m.textos[lang];
                const dentro = (
                  <>
                    <span className="pi-row__code" aria-hidden="true">{id}</span>
                    <span className="pi-row__lab">{c?.etiqueta ?? L.i}</span>
                    <span className="pi-row__val">
                      <span className="pi-vh" aria-live="polite">{c ? `${c.texto}${c.unidad}` : t.pendiente}</span>
                      <span aria-hidden="true">{c ? <Aletas texto={c.texto} unidad={c.unidad} /> : <span className="pi-dash">—</span>}</span>
                    </span>
                    <span className="pi-row__prev">{c?.previo ? `${t.previo} ${c.previo}` : c ? t.sin_previo : t.sin_corte}</span>
                  </>
                );
                return (
                  <li className="pi-row" key={id} style={lineaStyle(m.linea)}>
                    {m.slug && catalogo.buscar(m.slug) ? (
                      <Link className="pi-row__in" to={`/datos-abiertos/observatorio/${m.slug}`}>{dentro}</Link>
                    ) : (
                      <div className="pi-row__in">{dentro}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            {hayEjemplo && nota(t.ilus2)}
          </aside>
        </section>

        <section className="u-container" aria-label={t.pulso_aria}>
          <ul className="pi-pulse">
            {([[5, t.p1t, t.p1], [1, t.p2t, t.p2], [6, t.p3t, t.p3]] as const).map(([n, titulo, texto]) => (
              <li key={n} style={lineaStyle(n)}>
                <h2>{titulo}</h2>
                <p>{texto}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Manifiesto */}
        <section className="pi-sec" aria-labelledby="pi-mh">
          <div className="u-container pi-manif">
            <div className="pi-manif__l">
              <h2 className="pi-h2" id="pi-mh">{t.mh}</h2>
              <p>{t.mp}</p>
            </div>
            <div className="pi-cycle">
              {([[t.a1, t.a1t, t.a1p], [t.a2, t.a2t, t.a2p], [t.a3, t.a3t, t.a3p]] as const).map(([palabra, titulo, texto]) => (
                <div className="pi-arc" key={palabra}>
                  <b className="pi-cond">{palabra}</b>
                  <h3>{titulo}</h3>
                  <p>{texto}</p>
                </div>
              ))}
              <i className="pi-loop" aria-hidden="true" />
            </div>
          </div>
        </section>

        {/* Viaje del dato */}
        <section className="pi-sec" id="pi-viaje" aria-labelledby="pi-jh">
          <div className="u-container">
            <h2 className="pi-h2" id="pi-jh">{t.jh}</h2>
            <p className="pi-sub">{t.jp}</p>
            <div className="pi-route">
              <i className="pi-rail" aria-hidden="true" />
              {estaciones.map((st, si) => {
                const S = st.textos[lang];
                return (
                  <article className="pi-station" key={st.romano} aria-labelledby={`pi-st${si}`}>
                    <div><span className="pi-stop" aria-hidden="true">{st.romano}</span></div>
                    <div>
                      <header className="pi-st__h">
                        <h3 id={`pi-st${si}`}><span className="pi-vh">{t.estacion} {st.romano}: </span>{S.t}</h3>
                        <p className="pi-q">{S.q}</p>
                        <p>{S.p}</p>
                      </header>
                      <div className="pi-wall">
                        {todos.filter((m) => m.estacion === si).map((m) => {
                          const L = m.textos[lang];
                          const c = cifras.get(m.id) ?? null;
                          const enlazable = Boolean(m.slug && catalogo.buscar(m.slug));
                          const estilo = lineaStyle(m.linea, { "--s": m.span, ...(m.color ? { "--c": m.color } : {}) });
                          const cuerpo = (
                            <>
                              <span className="pi-pcode pi-cond" aria-hidden="true">{m.id}</span>
                              <div>
                                <h4>{L.n}</h4>
                                <p>{L.d}</p>
                              </div>
                              {enlazable ? (
                                <span className="pi-go"><span>{t.ver}</span><Flecha /></span>
                              ) : (
                                <span className="pi-go pi-go--na"><span>{t.pendiente}</span></span>
                              )}
                              <span className="pi-slip" aria-hidden="true">
                                <span className="pi-slip__k">{c?.etiqueta ?? L.i}</span>
                                <span className="pi-slip__val">{c ? <Aletas texto={c.texto} unidad={c.unidad} /> : <span className="pi-dash">—</span>}</span>
                                <span className="pi-slip__pv">{c?.previo ? `${t.previo} ${c.previo}` : c ? t.sin_previo : t.sin_corte}</span>
                                <span className={`pi-slip__tag${c ? "" : " pi-slip__tag--na"}`}>
                                  {c ? (c.ilustrativo ? t.ilustrativo : "") : t.pendiente}
                                </span>
                              </span>
                            </>
                          );
                          return enlazable ? (
                            <Link
                              className="pi-poster"
                              key={m.id}
                              to={`/datos-abiertos/observatorio/${m.slug}`}
                              style={estilo}
                              data-wide={m.ancho ? "" : undefined}
                              aria-label={`${L.n} — ${t.ver}${c ? `: ${c.etiqueta ?? L.i}, ${c.texto}${c.unidad}${c.ilustrativo ? ` (${t.ilustrativo})` : ""}` : ""}`}
                            >
                              {cuerpo}
                            </Link>
                          ) : (
                            <div className="pi-poster" key={m.id} style={estilo} data-wide={m.ancho ? "" : undefined} role="group" aria-label={`${L.n} — ${t.pendiente}`}>
                              {cuerpo}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Centro de documentación */}
        <section className="pi-sec" id="pi-documentacion" aria-labelledby="pi-dh">
          <div className="u-container">
            <h2 className="pi-h2" id="pi-dh">{t.dh}</h2>
            <p className="pi-sub">{t.dp}</p>
            <ul className="pi-exits">
              {SALIDAS.map((s) => {
                const L = s.textos[lang];
                const cuerpo = (
                  <>
                    <h3>{L.t}</h3>
                    <p>{L.d}</p>
                    {s.ruta ? (
                      <span className="pi-chip"><span>{L.a}</span><Flecha /></span>
                    ) : (
                      <span className="pi-chip pi-chip--na"><span>{t.baja}</span></span>
                    )}
                  </>
                );
                return (
                  <li className="pi-exit" key={s.textos.es.t}>
                    {s.ruta ? (
                      <Link className="pi-exit__in" to={s.ruta}>{cuerpo}</Link>
                    ) : (
                      <div className="pi-exit__in">{cuerpo}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <footer className="u-container pi-foot">
          {hayEjemplo && nota(t.ilus3)}
          <small>{t.credito}</small>
        </footer>
      </div>
    </OpenDataLayout>
  );
}
