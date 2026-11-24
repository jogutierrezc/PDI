/* =============================================================================
   UDES Sostenible · piezas del informe de un ODS: formato de cifras, titulares
   por palabras enmascaradas, marcas dibujadas (flecha, reproducir), el filtro
   de recorte del dibujo, la intro del número y la ventana de video.

   La intro solo se monta en el navegador (nunca en el HTML inicial) y se ve
   una vez por sesión; con movimiento reducido no aparece.
   ========================================================================== */

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SDG } from "./data";
import { odsOn } from "./OdsArt";
import type { Bi } from "./ods-data";
import { reduced } from "./widgets";

gsap.registerPlugin(useGSAP);

export type Lang = "es" | "en";

/* --- Formato --------------------------------------------------------------------------------------- */

/** Cifra con separador de miles siempre (el «es» de Intl no agrupa 4 dígitos: 4758 → «4.758»). */
export function fmtN(v: number, lang: Lang, decimals = 0): string {
  const [int, dec] = Math.abs(v).toFixed(decimals).split(".");
  const sep = lang === "es" ? [".", ","] : [",", "."];
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep[0]);
  return `${v < 0 ? "-" : ""}${grouped}${dec ? sep[1] + dec : ""}`;
}

/** Separa «20,09 %» o «250+» en número y adornos para el contador. `null` si no hay número. */
export function parseFigure(value: string): { before: string; to: number; decimals: number; after: string } | null {
  const m = /^([^\d]*)([\d.,]*\d)(.*)$/.exec(value.trim());
  if (!m) return null;
  const [, before, raw, after] = m;
  const comma = raw.lastIndexOf(",");
  const decimals = comma >= 0 ? raw.length - comma - 1 : 0;
  const to = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(to) ? { before, to, decimals, after } : null;
}

/** Texto legible sobre el color oficial del ODS (blanco o tinta oscura). */
export const onColor = odsOn;

/** Número que cuenta al entrar en pantalla (lo anima OdsReport). En reposo ya muestra el valor final. */
export function Counter({ to, lang, decimals = 0 }: { to: number; lang: Lang; decimals?: number }) {
  return (
    <span className="ors-cnt" data-to={to} data-dec={decimals} data-lang={lang}>
      {fmtN(to, lang, decimals)}
    </span>
  );
}

/* --- Titulares por palabras --------------------------------------------------------------------------- */

/**
 * Cada palabra en su máscara, para que el titular entre por líneas. El texto completo queda en
 * `aria-label` del titular; las palabras sueltas se ocultan a los lectores de pantalla.
 */
export function Words({ text, cls = "ors-w" }: { text: string; cls?: string }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, i) => (
        <span key={i} className="ors-mask" aria-hidden="true">
          <span className={cls}>{w}</span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/* --- Marcas dibujadas ---------------------------------------------------------------------------------- */

/** Flecha de trazo (no un carácter): izquierda, derecha o salida a otra pestaña. */
export function Arrow({ dir }: { dir: "left" | "right" | "out" }) {
  const d = dir === "out" ? "M5 11 11 5M6 5h5v5" : "M3 8h10M9 4l4 4-4 4";
  return (
    <svg className={`ors-arrow ors-arrow--${dir}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
    </svg>
  );
}

/** Triángulo de reproducir, centrado ópticamente. */
export function PlayMark() {
  return (
    <svg className="ors-playmark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * Filtro de recorte: dilata el canal alfa del dibujo y lo rellena de papel, como un troquel. Los
 * personajes vienen en el tono de su ODS y sin este borde se pierden sobre su propio color.
 */
export function CutFilter() {
  return (
    <svg className="ors-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <filter id="ors-cut" x="-4%" y="-4%" width="108%" height="108%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="d" />
        <feFlood floodColor="#fff" />
        <feComposite in2="d" operator="in" result="o" />
        <feMerge>
          <feMergeNode in="o" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </svg>
  );
}

/* --- Intro del número --------------------------------------------------------------------------------- */

/**
 * El campo del color entra como cortina, el número cuenta hasta el del ODS y la intro se funde con
 * el encabezado, que es el mismo campo. `onReady` arranca la coreografía del informe mientras la
 * intro se desvanece; `onGone` la desmonta.
 */
export function OdsReportIntro({ n, color, label, skipLabel, onReady, onGone }: { n: number; color: string; label: string; skipLabel: string; onReady: () => void; onGone: () => void }) {
  const scope = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const tl = useRef<gsap.core.Timeline | null>(null);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    tl.current?.kill();
    try {
      sessionStorage.setItem(`ods-intro-${n}`, "1");
    } catch {
      /* sin almacenamiento: la intro se verá otra vez */
    }
    onReady();
    const el = scope.current;
    if (!el || reduced()) return onGone();
    gsap.to(el, { opacity: 0, duration: 0.35, ease: "power2.out", onComplete: onGone });
  };

  useGSAP(
    () => {
      const num = scope.current?.querySelector(".ors-intro__n");
      const count = { v: 1 };
      tl.current = gsap
        .timeline({ onComplete: () => void gsap.delayedCall(0.2, finish) })
        .from(".ors-intro__strip i", { scaleY: 0, duration: 0.35, stagger: 0.015, ease: "power3.out" })
        .fromTo(".ors-intro__field", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power4.out" }, 0.15)
        .to(count, { v: n, duration: 0.7, ease: "power4.out", onUpdate: () => void (num && (num.textContent = String(Math.round(count.v)))) }, 0.3)
        .from(".ors-intro p", { yPercent: 110, duration: 0.45, ease: "power4.out" }, 0.55);
      const safety = window.setTimeout(finish, 4000);
      return () => window.clearTimeout(safety);
    },
    { scope },
  );

  return (
    <div ref={scope} className="ors-intro" role="presentation" style={{ "--ods": color, "--ors-on": odsOn(color) } as CSSProperties}>
      <div className="ors-intro__field" aria-hidden="true" />
      <div className="ors-intro__strip" aria-hidden="true">
        {SDG.map((s, i) => (
          <i key={s.name} style={{ background: s.color, flexGrow: i === n - 1 ? 3.5 : 1 }} />
        ))}
      </div>
      <div className="ors-intro__in">
        <div className="ors-intro__n">{n}</div>
        <span className="ors-intro__mask">
          <p>{label}</p>
        </span>
      </div>
      <button type="button" className="ors-intro__skip" onClick={finish}>
        {skipLabel}
      </button>
    </div>
  );
}

export function introSeen(n: number): boolean {
  try {
    return sessionStorage.getItem(`ods-intro-${n}`) === "1";
  } catch {
    return true;
  }
}

/* --- Ventana de video ----------------------------------------------------------------------------------- */

export interface VideoInfo {
  id: string;
  title: Bi;
  text: Bi;
}

/** Los videos no se incrustan: aviso y enlace a YouTube en pestaña nueva. */
export function OdsReportVideo({ video, lang, onClose }: { video: VideoInfo | null; lang: Lang; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d || !video) return;
    if (!d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    if (!reduced()) gsap.from(d, { y: 12, opacity: 0, duration: 0.24, ease: "power3.out", clearProps: "opacity,transform" });
  }, [video]);
  const close = () => {
    const d = ref.current;
    if (d?.open && typeof d.close === "function") d.close();
    else onClose();
  };
  const es = lang === "es";
  return (
    <dialog
      ref={ref}
      className="ors-dlg"
      aria-labelledby="ors-dlg-t"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {video && (
        <div className="ors-dlg__in">
          <div className="ors-dlg__screen">
            <span className="ors-play" aria-hidden="true">
              <PlayMark />
            </span>
            <h3 id="ors-dlg-t">{video.title[lang]}</h3>
          </div>
          <div className="ors-dlg__body">
            <p>{video.text[lang]}</p>
            <p className="ors-dlg__note">{es ? "El video está publicado en YouTube y se abre en una pestaña nueva." : "The video is published on YouTube and opens in a new tab."}</p>
            <div className="ors-dlg__acts">
              <button type="button" className="ors-btn" onClick={close}>
                {es ? "Cerrar" : "Close"}
              </button>
              <a className="ors-btn ors-btn--pri" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer">
                {es ? "Ver en YouTube" : "Watch on YouTube"} <Arrow dir="out" />
                <span className="ors-sr">{es ? "(abre una pestaña nueva)" : "(opens a new tab)"}</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
