/* =============================================================================
   UDES Sostenible · generador del boletín de informes ODS en A4.

   Panel de opciones (plantilla, voz, ODS incluidos, páginas, estilo y texto
   del Rector) y la vista previa de las hojas. «Descargar PDF» abre la
   impresión del navegador: solo salen las hojas, una por página, con
   «Guardar como PDF», igual que UDES en Cifras. Los ODS incluidos y el texto
   del Rector se comparten con el portal.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { OdsShell } from "./OdsShell";
import { OdsBulletinDownload } from "./OdsBulletinDownload";
import { OdsBulletinPublish } from "./OdsBulletinPublish";
import { canIssueOdsBulletin } from "./ods-bulletin-data";
import { BULLETIN_TEMPLATES, ODS_LIST, RECTOR } from "./ods-data";
import type { BulletinTemplate, BulletinVoice } from "./ods-data";
import { useBulletinSelection, useRectorText } from "./ods-selection";
import { OdsBulletinSheet, odsBulletinPages, odsBulletinText } from "./OdsBulletinSheet";
import type { OdsBulletinFont, OdsBulletinOptions, OdsBulletinPageFlags } from "./OdsBulletinSheet";
import { loadBulletinFont } from "../boletin/fonts";
import { reduced } from "./widgets";
import { useLang } from "./i18n";
import "./ods-portal.css";

gsap.registerPlugin(useGSAP);

const SWATCHES: [string, string][] = [
  ["#2b5c30", "Verde UDES Verde"],
  ["#014898", "Azul institucional"],
  ["#0f6f78", "Verde azulado"],
];
const PAGE_OPTIONS: [keyof OdsBulletinPageFlags, string][] = [
  ["cover", "Portada"],
  ["pres", "Presentación rectoral"],
  ["toc", "Índice"],
  ["back", "Contraportada"],
];
const FONTS: OdsBulletinFont[] = ["Open Sans", "Montserrat"];

/** Puerta de acceso: el generador es para el equipo de Planeación; el público solo descarga la edición publicada. */
export function OdsBulletin() {
  const auth = useAuth();
  const { t } = useLang();
  if (auth.loading) {
    return (
      <OdsShell title={t("boletin_title")} active="boletin">
        <div className="odsx-wrap">
          <p className="odsx-note" role="status">{t("verificando")}</p>
        </div>
      </OdsShell>
    );
  }
  if (!auth.profile || !canIssueOdsBulletin(auth)) {
    return (
      <OdsShell title={t("boletin_title")} active="boletin">
        <div className="odsx-wrap">
          <h1>{t("boletin_equipo_t")}</h1>
          <p className="odsx-note">{t("boletin_equipo_p")}</p>
          <p>
            <OdsBulletinDownload />{" "}
            <Link className="odsx-btn" to="/acceso-intranet" state={{ from: "/sostenible/impact/boletin" }}>
              {t("ingresar_intranet")}
            </Link>
          </p>
        </div>
      </OdsShell>
    );
  }
  return <OdsBulletinGenerator />;
}

function OdsBulletinGenerator() {
  const [template, setTemplate] = useState<BulletinTemplate>(BULLETIN_TEMPLATES[0]);
  const [voice, setVoice] = useState<BulletinVoice>(BULLETIN_TEMPLATES[0].voice);
  const [accent, setAccent] = useState(BULLETIN_TEMPLATES[0].accent);
  const [font, setFont] = useState<OdsBulletinFont>("Open Sans");
  const [flags, setFlags] = useState<OdsBulletinPageFlags>({ cover: true, pres: true, toc: true, back: true });
  const [toast, setToast] = useState("");
  const [mounted, setMounted] = useState(false);
  const { included, isIncluded, toggle, setIncluded } = useBulletinSelection();
  const rector = useRectorText();
  const root = useRef<HTMLDivElement>(null);
  const { lang, t } = useLang();
  const toastTimer = useRef<number>();

  useEffect(() => {
    setMounted(true);
    return () => window.clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    if (font !== "Open Sans") void loadBulletinFont(font);
  }, [font]);

  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".opb-panel", { opacity: 0, x: -12, duration: 0.4, ease: "power3.out", clearProps: "opacity,transform" });
      gsap.from(".opb-sheet", { opacity: 0, y: 16, duration: 0.42, ease: "power3.out", stagger: 0.04, delay: 0.1, clearProps: "opacity,transform" });
    },
    { scope: root },
  );

  const pages = odsBulletinPages(included, flags);
  const opts: OdsBulletinOptions = { template, voice, accent, font, rectorText: rector.text, included };

  const say = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  };

  const pickTemplate = (t: BulletinTemplate) => {
    setTemplate(t);
    setVoice(t.voice);
    setAccent(t.accent);
  };

  const copy = async () => {
    const text = odsBulletinText(pages, voice);
    if (!text) return say("Elige al menos un ODS para copiar su texto");
    try {
      await navigator.clipboard.writeText(text);
      say("Texto del boletín copiado");
    } catch {
      say("No se pudo copiar desde este navegador");
    }
  };

  const print = async () => {
    if (font !== "Open Sans") await loadBulletinFont(font);
    /* Los dibujos de las hojas deben estar listos antes de abrir la impresión. */
    await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".opb-print-root img")).map((img) => img.decode().catch(() => undefined)));
    window.print();
  };

  const sheets = (prefix: string) => pages.map((p) => <OdsBulletinSheet key={`${prefix}${p.t}-${p.i}`} page={p} pages={pages} opts={opts} />);

  return (
    <OdsShell title={t("boletin_title")} active="boletin">
      {/* El generador es una herramienta interna, en español; el boletín también. */}
      <div ref={root} className="odsx-wrap opt-view" lang="es">
        {lang === "en" && (
          <p className="odsx-note" lang="en">
            {t("generador_es")}
          </p>
        )}
        <div className="opb-layout">
          <aside className="opb-panel" aria-label="Opciones del boletín">
            <section>
              <h2 className="opb-h">Plantilla</h2>
              <div className="opb-opts" role="group" aria-label="Plantilla">
                {BULLETIN_TEMPLATES.map((t) => (
                  <button key={t.id} type="button" className="opb-opt" aria-pressed={template.id === t.id} onClick={() => pickTemplate(t)}>
                    <b>{t.name}</b>
                    <small>{t.voice === "narr" ? "Narrativo, con la cifra dentro de la historia" : "Datos, cifras y tablas"}</small>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="opb-h">Voz</h2>
              <div className="opt-seg" role="group" aria-label="Voz del boletín">
                <button type="button" aria-pressed={voice === "narr"} onClick={() => setVoice("narr")}>
                  Narrativa
                </button>
                <button type="button" aria-pressed={voice === "data"} onClick={() => setVoice("data")}>
                  Datos
                </button>
              </div>
            </section>

            <section>
              <h2 className="opb-h">
                ODS incluidos · <span>{included.length} de {ODS_LIST.length}</span>
              </h2>
              <div className="opb-chips" role="group" aria-label="ODS incluidos en el boletín">
                {ODS_LIST.map((o) => (
                  <button
                    key={o.n}
                    type="button"
                    className="opb-ch"
                    style={{ "--c": o.color } as CSSProperties}
                    aria-pressed={isIncluded(o.n)}
                    aria-label={`ODS ${o.n}, ${o.name}`}
                    title={o.name}
                    onClick={() => toggle(o.n)}
                  >
                    {o.n}
                  </button>
                ))}
              </div>
              <div className="opb-quick">
                <button className="odsx-btn" type="button" onClick={() => setIncluded(ODS_LIST.map((o) => o.n))}>
                  Todos
                </button>
                <button className="odsx-btn" type="button" onClick={() => setIncluded(ODS_LIST.filter((o) => o.the).map((o) => o.n))}>
                  Solo THE
                </button>
                <button className="odsx-btn" type="button" onClick={() => setIncluded([])}>
                  Ninguno
                </button>
              </div>
            </section>

            <section>
              <h2 className="opb-h">Páginas</h2>
              {PAGE_OPTIONS.map(([k, label]) => (
                <label key={k} className="opb-row">
                  <input type="checkbox" checked={flags[k]} onChange={(e) => setFlags((f) => ({ ...f, [k]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </section>

            <section>
              <h2 className="opb-h">Estilo</h2>
              <div className="opb-sw" role="group" aria-label="Color de acento">
                {SWATCHES.map(([c, label]) => (
                  <button key={c} type="button" style={{ "--c": c } as CSSProperties} aria-pressed={accent === c} aria-label={label} title={label} onClick={() => setAccent(c)} />
                ))}
              </div>
              <select className="opb-select" aria-label="Fuente del boletín" value={font} onChange={(e) => setFont(e.target.value as OdsBulletinFont)}>
                {FONTS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </section>

            <section>
              <h2 className="opb-h">Presentación del Rector</h2>
              <textarea className="opb-text" aria-label="Texto de la presentación rectoral" value={rector.text} onChange={(e) => rector.setText(e.target.value)} />
              <p className="odsx-note">
                Separa los párrafos con una línea en blanco. {RECTOR.illustrative && <span className="odsx-ilus">Texto de ejemplo</span>}
              </p>
              {rector.edited && (
                <button className="odsx-btn opb-reset" type="button" onClick={rector.reset}>
                  Volver al texto original
                </button>
              )}
            </section>

            <section className="opb-actions">
              <button className="odsx-btn odsx-btn--pri" type="button" onClick={() => void print()} disabled={pages.length === 0}>
                Descargar PDF
              </button>
              <button className="odsx-btn" type="button" onClick={() => void copy()}>
                Copiar el texto del boletín
              </button>
              <p className="odsx-note">El PDF sale con «Guardar como PDF» en la ventana de impresión del navegador, igual que UDES en Cifras: una hoja A4 por página, sin márgenes.</p>
            </section>
          </aside>

          <div className="opb-preview">
            <p className="odsx-eyebrow opb-meta">
              {pages.length === 1 ? "1 página" : `${pages.length} páginas`} · A4 · {template.name}
            </p>
            {pages.length ? (
              <div className="opb-sheets">
                {pages.map((p) => (
                  <div key={`${p.t}-${p.i}`} className="opb-sheet">
                    <OdsBulletinSheet page={p} pages={pages} opts={opts} />
                    <p className="opb-pgnum">Página {p.i}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="opt-empty">Elige al menos una página o un ODS para armar el boletín.</p>
            )}
          </div>
        </div>
        <div className={`opb-toast${toast ? " is-on" : ""}`} role="status" aria-live="polite">
          {toast}
        </div>
      </div>
      {/* `sos-print-root` evita que la regla de impresión de sostenible.css oculte este portal. */}
      {mounted && createPortal(<div className="sos-print-root opb-print-root">{sheets("print-")}</div>, document.body)}
    </OdsShell>
  );
}
