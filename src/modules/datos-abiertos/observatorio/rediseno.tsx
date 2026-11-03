/* =============================================================================
   Observatorio público · piezas del rediseño.

   Portada: titular en dos líneas, cifras, mosaico de tableros y presentación
   resumida. Página de un tema: cartel a sangre del color del tablero, secciones
   con título enmascarado y regla que se traza, pie Anterior/Siguiente y el
   efecto de carga (el del informe ODS: cortina del color, tira con los colores
   de los tableros, número que cuenta, rótulo que sube; una vez por sesión y
   por tablero, y nunca con movimiento reducido).

   Todo vive en un ámbito de fondo claro (.obsr, tokens de obs-claro.css) aunque
   el portal esté en tema oscuro. No importa Observatory.tsx: lo arma él.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
import { TEXTOS } from "./presentacion/textos";
import { Palabras, TableroVista, tamanosMosaico, tintaSobre, urlCss, varsTablero } from "./tablero";
import type { DatosTablero } from "./tablero";
import "./obs-claro.css";
import "./obs-rediseno.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const reduced = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const entero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
export const rutaTema = (slug: string) => `/datos-abiertos/observatorio/${slug}`;

/** El ámbito de fondo claro: envuelve todo lo que va bajo la cabecera del portal. */
export function ObsClaro({ children, innerRef }: { children: ReactNode; innerRef?: RefObject<HTMLDivElement> }) {
  return (
    <div ref={innerRef} className="obsr obsr-claro">
      {children}
    </div>
  );
}

/* --- Portada: titular y cifras -------------------------------------------------------------- */

export interface CifraPortada {
  valor: number;
  texto: string;
  /** Rótulo «Dato ilustrativo» junto a la cifra. */
  ilustrativo?: boolean;
}

export function PortadaCabecera({ id, lineas, lede, cita, cifras, atras }: { id: string; lineas: string[]; lede: string; cita?: { texto: string; firma: string }; cifras: CifraPortada[]; atras: ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap
        .timeline({ defaults: { ease: "power4.out" } })
        .from(".obsr-h1 .obsr-l > span", { yPercent: 105, duration: 0.9, stagger: 0.12, clearProps: "transform" })
        .from(".obsr-lede, .obsr-quote", { y: 18, opacity: 0, duration: 0.7, stagger: 0.1, clearProps: "opacity,transform" }, "-=0.5");
      gsap.from(".obsr-facts > div", { y: 22, opacity: 0, duration: 0.7, stagger: 0.1, delay: 0.25, ease: "power4.out", clearProps: "opacity,transform" });
      gsap.utils.toArray<HTMLElement>(".obsr-count").forEach((n) => {
        const to = Number(n.dataset.count);
        const o = { v: 0 };
        gsap.to(o, { v: to, duration: 1.1, delay: 0.3, ease: "power2.out", onUpdate: () => void (n.textContent = entero.format(Math.round(o.v))), onComplete: () => void (n.textContent = entero.format(to)) });
      });
    },
    { scope: raiz },
  );
  return (
    <div ref={raiz}>
      <div className="obsr-crumbs">{atras}</div>
      <section className="obsr-hero" data-solo={cita ? undefined : "1"} aria-labelledby={id}>
        <div>
          <h1 id={id} className="obsr-h1">
            {lineas.map((l, i) => (
              <span className="obsr-l" key={i}>
                <span>{l}</span>
              </span>
            ))}
          </h1>
          <p className="obsr-lede">{lede}</p>
        </div>
        {cita && (
          <figure className="obsr-quote">
            <p>{cita.texto}</p>
            <small>{cita.firma}</small>
          </figure>
        )}
      </section>
      <div className="obsr-facts">
        {cifras.map((c) => (
          <div key={c.texto}>
            <b className="obsr-count" data-count={c.valor}>{entero.format(c.valor)}</b>
            <span>{c.texto}</span>
            {c.ilustrativo && <em className="obsr-stamp">Dato ilustrativo</em>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- Portada: mosaico ------------------------------------------------------------------------ */

export function Mosaico({ tableros, etiqueta }: { tableros: { datos: DatosTablero; pregunta: string }[]; etiqueta: string }) {
  const raiz = useRef<HTMLUListElement>(null);
  const tamanos = tamanosMosaico(tableros.length);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".obsr-cell", { clipPath: "inset(0 0 100% 0)", duration: 0.8, stagger: { each: 0.045 }, ease: "power3.out", clearProps: "clipPath" });
      gsap.utils.toArray<HTMLElement>(".obsr-pic").forEach((p) => {
        gsap.fromTo(p, { yPercent: -5 }, { yPercent: 5, ease: "none", scrollTrigger: { trigger: p.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
      });
    },
    { scope: raiz, dependencies: [tableros.length] },
  );
  return (
    <ul ref={raiz} className="obsr-mosaic" aria-label={etiqueta}>
      {tableros.map((t, i) => (
        <li key={t.datos.slug} className="obsr-cell" style={{ "--w": tamanos[i].w, "--h": tamanos[i].h, "--wm": tamanos[i].wm, "--hm": tamanos[i].hm } as CSSProperties}>
          <TableroVista d={t.datos} to={rutaTema(t.datos.slug)} descripcion={t.pregunta} />
        </li>
      ))}
    </ul>
  );
}

/* --- Portada: presentación resumida ------------------------------------------------------------ */

const T = TEXTOS.es;
const PASOS: { t: string; sub: string; p: string; color: string; icono: IconName }[] = [
  { t: T.a1, sub: T.a1t, p: T.a1p, color: "var(--od-line-1)", icono: "compass" },
  { t: T.a2, sub: T.a2t, p: T.a2p, color: "var(--od-line-3)", icono: "shield" },
  { t: T.a3, sub: T.a3t, p: T.a3p, color: "var(--od-line-8)", icono: "chart" },
];

export function PresentacionResumen({ rutaPresentacion, rutaCalidad }: { rutaPresentacion: string; rutaCalidad: string | null }) {
  const [abierto, setAbierto] = useState(0);
  const raiz = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".obsr-step", { y: 46, opacity: 0, duration: 0.8, stagger: 0.1, ease: "power4.out", clearProps: "opacity,transform", scrollTrigger: { trigger: ".obsr-cycle", start: "top 88%", once: true } });
      gsap.from(".obsr-pulse > div", { y: 24, opacity: 0, duration: 0.6, stagger: 0.08, ease: "power4.out", clearProps: "opacity,transform", scrollTrigger: { trigger: ".obsr-pulse", start: "top 92%", once: true } });
    },
    { scope: raiz },
  );
  return (
    <section ref={raiz} className="obsr-pres" id="presentacion" aria-labelledby="obsr-ph">
      <div className="obsr-pres__head">
        <div>
          <p className="obsr-kicker">
            Presentación resumida <span className="obsr-stamp">{T.ilustrativo}</span>
          </p>
          <h2 id="obsr-ph">De medir a decidir a tiempo</h2>
        </div>
        <p className="obsr-pres__t">{T.mp}</p>
      </div>
      <div className="obsr-cycle" role="group" aria-label="El ciclo del Observatorio">
        {PASOS.map((s, i) => (
          <button
            key={s.t}
            type="button"
            className="obsr-step"
            style={{ "--c": s.color } as CSSProperties}
            aria-expanded={abierto === i}
            onClick={() => setAbierto(i)}
            onFocus={() => setAbierto(i)}
            onPointerEnter={(e) => e.pointerType === "mouse" && setAbierto(i)}
          >
            <span className="obsr-step__bgi" aria-hidden="true"><Icon name={s.icono} size={260} /></span>
            <span className="obsr-step__big" aria-hidden="true">{i + 1}</span>
            <span>
              <span className="obsr-step__sub">{s.sub}</span>
              <strong className="obsr-step__t">{s.t}</strong>
              <span className="obsr-step__p">{s.p}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="obsr-pulse">
        {[[T.p1t, T.p1], [T.p2t, T.p2], [T.p3t, T.p3]].map(([t, p]) => (
          <div key={t}>
            <b>{t}</b>
            <span>{p}</span>
          </div>
        ))}
      </div>
      <div className="obsr-cta">
        <Link className="obsr-btn obsr-btn--solid" to={rutaPresentacion}>
          Ver la presentación completa <Icon name="arrow-right" size={18} />
        </Link>
        {rutaCalidad && (
          <Link className="obsr-btn" to={rutaCalidad}>
            Consultar cifras de calidad
          </Link>
        )}
      </div>
      <p className="obsr-credit">{T.credito}</p>
    </section>
  );
}

/* --- Efecto de carga al abrir un tablero ---------------------------------------------------------- */

const claveIntro = (slug: string) => `obs-intro-${slug}`;

/** ¿Ya se vio el efecto de este tablero en la sesión? Sin almacenamiento, se da por visto. */
export function introVista(slug: string): boolean {
  try {
    return sessionStorage.getItem(claveIntro(slug)) === "1";
  } catch {
    return true;
  }
}

export const introPendiente = (slug: string) => typeof window !== "undefined" && !reduced() && !introVista(slug);

/**
 * El campo del color entra como cortina, el número cuenta hasta el índice del tablero y el rótulo sube;
 * al terminar se funde con el cartel, que es el mismo campo. `onReady` arranca la coreografía de la
 * página mientras la intro se desvanece; `onGone` la desmonta.
 */
export function ObsIntro({ slug, n, color, nombre, tiras, onReady, onGone }: { slug: string; n: number; color: string; nombre: string; tiras: string[]; onReady: () => void; onGone: () => void }) {
  const scope = useRef<HTMLDivElement>(null);
  const hecho = useRef(false);
  const tl = useRef<gsap.core.Timeline | null>(null);

  const terminar = () => {
    if (hecho.current) return;
    hecho.current = true;
    tl.current?.kill();
    try {
      sessionStorage.setItem(claveIntro(slug), "1");
    } catch {
      /* sin almacenamiento: el efecto se verá otra vez */
    }
    onReady();
    const el = scope.current;
    if (!el || reduced()) return onGone();
    gsap.to(el, { opacity: 0, duration: 0.35, ease: "power2.out", onComplete: onGone });
  };

  useGSAP(
    () => {
      const num = scope.current?.querySelector(".obsr-intro__n");
      const cuenta = { v: 1 };
      tl.current = gsap
        .timeline({ onComplete: () => void gsap.delayedCall(0.2, terminar) })
        .from(".obsr-intro__strip i", { scaleY: 0, duration: 0.35, stagger: 0.015, ease: "power3.out" })
        .fromTo(".obsr-intro__field", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power4.out" }, 0.15)
        .to(cuenta, { v: n, duration: 0.7, ease: "power4.out", onUpdate: () => void (num && (num.textContent = String(Math.round(cuenta.v)))) }, 0.3)
        .from(".obsr-intro p", { yPercent: 110, duration: 0.45, ease: "power4.out" }, 0.55);
      const respaldo = window.setTimeout(terminar, 4000);
      return () => window.clearTimeout(respaldo);
    },
    { scope },
  );

  return (
    <div ref={scope} className="obsr-intro" data-ink={tintaSobre(color)} role="presentation" style={{ "--c": color } as CSSProperties}>
      <div className="obsr-intro__field" aria-hidden="true" />
      <div className="obsr-intro__strip" aria-hidden="true">
        {tiras.map((c, i) => (
          <i key={i} style={{ background: c, flexGrow: i === n - 1 ? 3.5 : 1 }} />
        ))}
      </div>
      <div className="obsr-intro__in">
        <div className="obsr-intro__n">{n}</div>
        <span className="obsr-intro__mask">
          <p>{nombre} · Observatorio de Analítica</p>
        </span>
      </div>
      <button type="button" className="obsr-intro__skip" onClick={terminar}>
        Saltar
      </button>
    </div>
  );
}

/* --- Página de un tema ---------------------------------------------------------------------------- */

export interface MetaCartel {
  rotulo: string;
  valor: ReactNode;
}

/** El cartel a sangre: foto fundida a la derecha con el degradado, o numeral gigante e icono sin foto. */
export function Cartel({ d, indice, total, atras, pregunta, meta, ilustrativo }: { d: DatosTablero; indice: number; total: number; atras: { to: string; texto: string }; pregunta: string; meta: MetaCartel[]; ilustrativo: boolean }) {
  const tinta = tintaSobre(d.color);
  return (
    <section className="obsr-cartel" data-ink={tinta} style={varsTablero(d)} aria-labelledby="obsr-tema">
      <div className="obsr-cartel__art" aria-hidden="true">
        {d.imagenUrl ? (
          <>
            <div className="obsr-cartel__pic" style={{ backgroundImage: urlCss(d.imagenUrl) }} />
            <div className="obsr-shade obsr-shade--cartel" />
          </>
        ) : (
          <>
            <div className="obsr-cartel__num">{d.code}</div>
            <div className="obsr-water obsr-water--cartel"><Icon name={d.icono} size={380} /></div>
          </>
        )}
      </div>
      <div className="obsr-cartel__in">
        <div className="obsr-cartel__tools">
          <Link to={atras.to}>
            <Icon name="arrow-left" size={16} /> {atras.texto}
          </Link>
          <span>
            Página {indice + 1} de {total}
          </span>
        </div>
        <div className="obsr-cartel__text">
          <h1 id="obsr-tema" aria-label={d.name}>
            <Palabras text={d.name} />
          </h1>
          <p className="obsr-cartel__q obsr-in">{pregunta}</p>
          <dl className="obsr-meta obsr-in">
            {meta.map((m) => (
              <div key={m.rotulo}>
                <dt>{m.rotulo}</dt>
                <dd>{m.valor}</dd>
              </div>
            ))}
            {ilustrativo && (
              <div>
                <dt>Estado</dt>
                <dd>
                  <span className="obsr-stamp">Dato ilustrativo</span>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </section>
  );
}

/** Franja decorativa del color del tablero (no representa datos). */
export function Franja({ d }: { d: DatosTablero }) {
  return (
    <div className="obsr-franja" style={varsTablero(d)} aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <i key={i} style={{ "--m": 38 + ((i * 37) % 56) } as CSSProperties} />
      ))}
    </div>
  );
}

/** Sección con título enmascarado y regla que se traza. */
export function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section className="obsr-sec" id={id} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} aria-label={titulo}>
        <Palabras text={titulo} />
      </h2>
      <div className="obsr-rule" aria-hidden="true" />
      {children}
    </section>
  );
}

/** Pie Anterior / Siguiente con los colores de los tableros vecinos. */
export function Pie({ anterior, siguiente }: { anterior: DatosTablero; siguiente: DatosTablero }) {
  const lado = (d: DatosTablero, rotulo: string) => (
    <Link to={rutaTema(d.slug)} className="obsr-pager__a" style={varsTablero(d)} data-ink={tintaSobre(d.color)}>
      <small>{rotulo}</small>
      <b>{d.name}</b>
    </Link>
  );
  return (
    <nav className="obsr-pager" aria-label="Otras páginas del Observatorio">
      {lado(anterior, "Anterior")}
      {lado(siguiente, "Siguiente")}
    </nav>
  );
}

/**
 * La coreografía de la página de un tema: cartel, titular por palabras, secciones que se descubren al
 * llegar. Arranca cuando `listo` (tras el efecto de carga) y se rehace al cambiar de tema.
 */
export function useMovimientoTema(raiz: RefObject<HTMLElement>, slug: string, listo: boolean, cargado: boolean) {
  useGSAP(
    () => {
      if (!listo || reduced()) return;
      gsap
        .timeline({ defaults: { ease: "power4.out" } })
        .fromTo(".obsr-cartel__art > *", { opacity: 0, yPercent: 6 }, { opacity: 1, yPercent: 0, duration: 0.7, stagger: 0.1, clearProps: "opacity,transform" }, 0)
        .fromTo(".obsr-cartel h1 .obsr-w", { yPercent: 110 }, { yPercent: 0, duration: 0.6, stagger: 0.04, clearProps: "transform" }, 0.1)
        .from(".obsr-in", { y: 12, opacity: 0, duration: 0.45, ease: "power3.out", stagger: 0.06, clearProps: "opacity,transform" }, 0.35)
        .from(".obsr-franja i", { scaleY: 0, duration: 0.4, ease: "power3.out", stagger: 0.012, clearProps: "transform" }, 0.4);
      gsap.to(".obsr-cartel__num, .obsr-cartel__pic, .obsr-water--cartel", { yPercent: -6, ease: "none", scrollTrigger: { trigger: ".obsr-cartel", start: "top top", end: "bottom top", scrub: 0.3 } });
      gsap.utils.toArray<HTMLElement>(".obsr-sec h2 .obsr-w, .obs-live__heading .obsr-w").forEach((w) => {
        gsap.fromTo(w, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: "power4.out", clearProps: "transform", scrollTrigger: { trigger: w, start: "top 92%", once: true } });
      });
      gsap.utils.toArray<HTMLElement>(".obsr-rule").forEach((r) => {
        gsap.fromTo(r, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.out", clearProps: "transform", scrollTrigger: { trigger: r, start: "top 94%", once: true } });
      });
      ScrollTrigger.refresh();
    },
    { scope: raiz, dependencies: [slug, listo, cargado], revertOnUpdate: true },
  );
}

/** Lleva el foco al cartel al cambiar de tema (la ruta cambia sin recargar la página). */
export function useAlInicio(slug: string) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);
}
