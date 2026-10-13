/* =============================================================================
   UDES Sostenible · piezas del informe de un ODS: formato de cifras, intro del
   número, ventana de video y la copia limpia que se imprime en A4.

   La intro solo se monta en el navegador (nunca en el HTML inicial) y se ve
   una vez por sesión; con movimiento reducido no aparece.
   ========================================================================== */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SDG } from "./data";
import { EVIDENCE_LABEL, ODS13, ODS_PUBLIC, odsArt, odsEvidenceTotals, odsPct, STATUS_LABEL, odsStatus } from "./ods-data";
import { odsOn, odsTone } from "./OdsArt";
import type { Bi, Ods, OdsEdition } from "./ods-data";
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

/* --- Intro del número --------------------------------------------------------------------------------- */

export function OdsReportIntro({ n, label, skipLabel, onDone }: { n: number; label: string; skipLabel: string; onDone: () => void }) {
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
    const el = scope.current;
    if (!el || reduced()) return onDone();
    gsap.to(el, { yPercent: -100, duration: 0.55, ease: "power3.inOut", onComplete: onDone });
  };

  useGSAP(
    () => {
      const num = scope.current?.querySelector(".ors-intro__n");
      const count = { v: 1 };
      tl.current = gsap
        .timeline({ onComplete: () => void gsap.delayedCall(0.25, finish) })
        .from(".ors-intro__strip i", { scaleX: 0, duration: 0.45, stagger: 0.02, ease: "power2.out" })
        .to(count, { v: n, duration: 0.8, ease: "power2.out", onUpdate: () => void (num && (num.textContent = String(Math.round(count.v)))) }, 0.1)
        .from(".ors-intro p", { y: 12, opacity: 0, duration: 0.35, ease: "power3.out" }, "-=0.3");
      const safety = window.setTimeout(finish, 4000);
      return () => window.clearTimeout(safety);
    },
    { scope },
  );

  return (
    <div ref={scope} className="ors-intro" role="presentation">
      <div className="ors-intro__strip" aria-hidden="true">
        {SDG.map((s, i) => (
          <i key={s.name} style={{ background: i === n - 1 ? "#fff" : s.color }} />
        ))}
      </div>
      <div>
        <div className="ors-intro__n">{n}</div>
        <p>{label}</p>
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
    if (!reduced()) gsap.from(d, { scale: 0.96, opacity: 0, duration: 0.22, ease: "power3.out", clearProps: "opacity,transform" });
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
          <h3 id="ors-dlg-t">{video.title[lang]}</h3>
          <div className="ors-dlg__screen">
            <span className="ors-dlg__play" aria-hidden="true">
              ▶
            </span>
            <span>{es ? "El video de esta evidencia está publicado en YouTube y se abre en una pestaña nueva." : "This evidence video is published on YouTube and opens in a new tab."}</span>
          </div>
          <p className="ors-dlg__text">{video.text[lang]}</p>
          <div className="ors-dlg__acts">
            <button type="button" className="odsx-btn" onClick={close}>
              {es ? "Cerrar" : "Close"}
            </button>
            <a className="odsx-btn odsx-btn--pri" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer">
              {es ? "Ver en YouTube" : "Watch on YouTube"} <span aria-hidden="true">↗</span>
              <span className="ors-sr">{es ? "(abre una pestaña nueva)" : "(opens a new tab)"}</span>
            </a>
          </div>
        </div>
      )}
    </dialog>
  );
}

/* --- Copia para imprimir (A4) ------------------------------------------------------------------------------ */

/** Versión estática del informe: todas las evidencias abiertas, sin barras ni animación. Va en `.sos-print-root`. */
export function OdsReportPrint({ o, edition, lang }: { o: Ods; edition: OdsEdition; lang: Lang }) {
  const full = o.n === 13;
  const L: Lang = full ? lang : "es";
  const tx = (es: string, en: string) => (L === "es" ? es : en);
  const published = edition === 2025;
  const totals = odsEvidenceTotals();
  return (
    <div className="odsx ors-print" lang={L} style={odsTone(o.color)}>
      <header className="ors-print__head">
        <span>Universidad de Santander · {tx("Oficina de Planeación", "Planning Office")}</span>
        <span>THE Impact Rankings {edition}</span>
      </header>
      <div className="ors-print__title">
        <b>{o.n}</b>
        <div>
          <p className="odsx-eyebrow">{published ? tx("Informe publicado · edición 2025", "Published report · 2025 edition") : tx("Informe · edición 2026", "Report · 2026 edition")}</p>
          <h1>{full ? tx("ODS 13: Acción por el clima", "SDG 13: Climate Action") : `ODS ${o.n}: ${o.name}`}</h1>
        </div>
        <img className="ors-print__art" src={odsArt(o.n)} alt={tx(`Ilustración del ODS ${o.n}`, `SDG ${o.n} illustration`)} width={800} height={1085} loading="eager" />
      </div>
      <p className="ors-print__lede">
        {full ? tx("Cómo la Universidad de Santander reduce su huella de carbono e investiga las soluciones energéticas que definirán un futuro sostenible para Colombia.", "How Universidad de Santander reduces its carbon footprint and researches the energy solutions that will define a sustainable future for Colombia.") : o.thesis}
      </p>

      <h2>{tx("Cifras de la edición 2025", "Figures from the 2025 edition")}</h2>
      <div className="ors-print__figs">
        {full
          ? ODS13.stats.map((s, i) => (
              <div key={i}>
                <b>{s.to === null ? tx("Certificada", "Certified") : `${fmtN(s.to, L)} ${s.unit[L]}`}</b>
                <span>{s.text[L]}</span>
              </div>
            ))
          : o.figures.map((f) => (
              <div key={f.label}>
                <b>
                  {f.value} {f.unit}
                </b>
                <span>{f.label}</span>
              </div>
            ))}
      </div>
      {!full && !o.real && <p className="ors-print__note">{tx("Dato ilustrativo", "Illustrative data")}</p>}

      {ODS_PUBLIC.evidence && !published && full && (
        <>
          <h2>
            {tx("Evidencias por indicador", "Evidence by indicator")} · {totals.ok}/{totals.total} {tx("verificadas", "verified")}
          </h2>
          {ODS13.indicators.map((ind) => (
            <div key={ind.id} className="ors-print__ind">
              <h3>
                {ind.id} · {ind.name[L]}
              </h3>
              <ul>
                {ind.evidence.map((e) => (
                  <li key={e.title.es}>
                    <span>
                      {e.title[L]} <small>· {e.type[L]} · {e.source[L]}</small>
                    </span>
                    <em className={`odsx-chip ${e.status}`}>{EVIDENCE_LABEL[e.status][L]}</em>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {!published && full && (
        <>
          <h2>{tx("Comparación 2025 → 2026", "Comparison 2025 → 2026")}</h2>
          <table className="ors-print__tbl">
            <thead>
              <tr>
                <th>{tx("Indicador", "Indicator")}</th>
                <th>2025</th>
                <th>2026*</th>
              </tr>
            </thead>
            <tbody>
              {ODS13.compare.map((c) => (
                <tr key={c.label.es}>
                  <td>{c.label[L]}</td>
                  <td>{fmtN(c.y2025, L) + c.suffix}</td>
                  <td>{fmtN(c.y2026, L) + c.suffix}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ors-print__note">* {tx("Cifras 2026 ilustrativas", "2026 figures are illustrative")}</p>
        </>
      )}

      {full && (
        <>
          <h2>{tx("Ruta 2025 → 2026", "Roadmap 2025 → 2026")}</h2>
          <ul className="ors-print__tl">
            {ODS13.timeline.map((s) => (
              <li key={s.title.es}>
                <b>
                  {s.when}
                  {s.planned ? tx(" · previsto", " · planned") : ""} — {s.title[L]}
                </b>
                <span>{s.text[L]}</span>
              </li>
            ))}
          </ul>
          {!published && (
            <p>
              <b>{tx("Alianzas", "Partnerships")}:</b> {ODS13.allies.join(" · ")}
            </p>
          )}
        </>
      )}

      {!full && !published && (
        <>
          {ODS_PUBLIC.evidence && (
            <>
              <h2>Avance de evidencias</h2>
              <p>
                {o.ok} de {o.total} evidencias verificadas ({odsPct(o)} %) · {STATUS_LABEL[odsStatus(o)]}
              </p>
            </>
          )}
          <h2>Lo que viene</h2>
          <p>La UDES prevé {o.next}</p>
        </>
      )}

      <footer className="ors-print__foot">
        {tx(
          "Las cifras de 2025 provienen del informe publicado. Las marcadas como ilustrativas se reemplazan por los datos oficiales antes de enviarlas.",
          "2025 figures come from the published report. Those marked illustrative are replaced with official data before submission.",
        )}
      </footer>
    </div>
  );
}
