/* =============================================================================
   UDES Sostenible · páginas A4 del boletín de informes ODS.

   Funciones puras para armar la lista de páginas y el texto, y el dibujo de
   cada hoja. La hoja mide con `cqw` (container-type: inline-size): la misma
   página sirve en la vista previa y al imprimir en A4.

   Cada hoja de ODS lleva su color (títulos, cifras) y su dibujo grande; la
   portada suma los dibujos de los primeros ODS incluidos. Los dibujos no son
   perezosos: tienen que estar cargados cuando se imprime.
   ========================================================================== */

import type { CSSProperties, ReactElement } from "react";
import { ODS_CURRENT, ODS_LIST, RECTOR, odsArt, odsNarrative, rectorParagraphs } from "./ods-data";
import { odsTone } from "./OdsArt";
import type { BulletinTemplate, BulletinVoice, Ods } from "./ods-data";

export type OdsBulletinFont = "Open Sans" | "Montserrat";
export interface OdsBulletinPageFlags {
  cover: boolean;
  pres: boolean;
  toc: boolean;
  back: boolean;
}
export type OdsBulletinPage = { i: number } & ({ t: "cover" } | { t: "pres" } | { t: "toc" } | { t: "back" } | { t: "ods"; o: Ods });

export interface OdsBulletinOptions {
  template: BulletinTemplate;
  voice: BulletinVoice;
  accent: string;
  font: OdsBulletinFont;
  rectorText: string;
  included: readonly number[];
}

/** Las páginas del boletín en orden, numeradas desde 1. */
export function odsBulletinPages(included: readonly number[], flags: OdsBulletinPageFlags): OdsBulletinPage[] {
  const sel = ODS_LIST.filter((o) => included.includes(o.n));
  const out: OdsBulletinPage[] = [];
  let i = 0;
  if (flags.cover) out.push({ t: "cover", i: ++i });
  if (flags.pres) out.push({ t: "pres", i: ++i });
  if (flags.toc) out.push({ t: "toc", i: ++i });
  for (const o of sel) out.push({ t: "ods", o, i: ++i });
  if (flags.back) out.push({ t: "back", i: ++i });
  return out;
}

/** El texto de las páginas de ODS, para pegar en un correo o un documento. */
export function odsBulletinText(pages: OdsBulletinPage[], voice: BulletinVoice): string {
  return pages
    .flatMap((p) => (p.t === "ods" ? [p.o] : []))
    .map((o) => `ODS ${o.n} · ${o.name}\n${odsNarrative(o, voice).join("\n")}\nLo que viene en ${ODS_CURRENT}: la UDES prevé ${o.next}`)
    .join("\n\n");
}

export function OdsBulletinSheet({ page, pages, opts }: { page: OdsBulletinPage; pages: OdsBulletinPage[]; opts: OdsBulletinOptions }) {
  const T = opts.template;
  const style = { "--ba": opts.accent, "--bf": `'${opts.font}', sans-serif` } as CSSProperties;
  const foot = (
    <div className="opb-ft">
      <span>Universidad de Santander · Oficina de Planeación</span>
      <span>
        {page.i} / {pages.length}
      </span>
    </div>
  );
  const head = (txt: string) => (
    <div className="opb-hd">
      <span>{T.eyebrow}</span>
      <span>{txt}</span>
    </div>
  );

  let inner: ReactElement;
  if (page.t === "cover") {
    const sel = ODS_LIST.filter((o) => opts.included.includes(o.n));
    inner = (
      <div className="opb-pgi opb-cov">
        <div className="opb-bands" aria-hidden="true">
          {(sel.length ? sel : ODS_LIST).map((o) => (
            <i key={o.n} style={{ "--c": o.color } as CSSProperties} />
          ))}
        </div>
        {sel.length > 0 && (
          <div className="opb-cov__art" aria-hidden="true">
            {sel.slice(0, 3).map((o) => (
              <span key={o.n} style={{ "--c": o.color } as CSSProperties}>
                <img src={odsArt(o.n)} alt="" width={800} height={1085} loading="eager" />
              </span>
            ))}
          </div>
        )}
        <div>
          <small>{T.eyebrow}</small>
          <h1>Contribución de la UDES a los Objetivos de Desarrollo Sostenible</h1>
          <p>{T.subtitle}</p>
        </div>
        <p>
          Oficina de Planeación · Universidad de Santander
          <br />
          {sel.length === 1 ? "1 ODS incluido" : `${sel.length} ODS incluidos`}
        </p>
      </div>
    );
  } else if (page.t === "pres") {
    const ps = rectorParagraphs(opts.rectorText);
    inner = (
      <div className="opb-pgi">
        {head("Presentación rectoral")}
        <div className="opb-body">
          <div className="opb-pres">
            <div className="opb-por" aria-hidden="true">
              R
            </div>
            <h2 className="opb-pres__title">{RECTOR.title}</h2>
          </div>
          <p>{ps[0] ?? ""}</p>
          <p className="opb-lead">{RECTOR.quote}</p>
          {ps.slice(1).map((x, k) => (
            <p key={k}>{x}</p>
          ))}
          <p className="opb-signature">
            <b>{RECTOR.name}</b>
            <br />
            {RECTOR.role}
          </p>
        </div>
        {foot}
      </div>
    );
  } else if (page.t === "toc") {
    const rows = pages.flatMap((x) => (x.t === "ods" ? [x] : []));
    inner = (
      <div className="opb-pgi">
        {head("Contenido")}
        <div className="opb-body">
          <h2>Contenido</h2>
          <div className="opb-toc">
            {rows.length ? (
              rows.map((x) => (
                <div key={x.o.n}>
                  <u style={{ "--c": x.o.color } as CSSProperties}>{x.o.n}</u>
                  <span>{x.o.name}</span>
                  <i />
                  <b>{x.i}</b>
                </div>
              ))
            ) : (
              <p>Elige al menos un ODS para el índice.</p>
            )}
          </div>
        </div>
        {foot}
      </div>
    );
  } else if (page.t === "ods") {
    const o = page.o;
    const ps = odsNarrative(o, opts.voice);
    inner = (
      <div className="opb-pgi opb-ods" style={{ ...odsTone(o.color), "--c": o.color } as CSSProperties}>
        <div className="opb-hd">
          <span>ODS {o.n}</span>
          <span>{T.eyebrow}</span>
        </div>
        <div className="opb-body">
          <div className="opb-ods__top">
            <div>
              <span className="opb-ods__n">{o.n}</span>
              <h2>{o.name}</h2>
              {opts.voice === "narr" ? <p className="opb-lead">{ps[0]}</p> : <p>{ps[0]}</p>}
            </div>
            <span className="opb-ods__art">
              <img src={odsArt(o.n)} alt={`Ilustración del ODS ${o.n}`} width={800} height={1085} loading="eager" />
            </span>
          </div>
          {ps.slice(1).map((x, k) => (
            <p key={k}>{x}</p>
          ))}
          <div className="opb-big">
            {o.figures.map((f, k) => (
              <div key={k}>
                <b>{f.value}</b>
                <span>
                  {f.unit} {f.label}
                </span>
              </div>
            ))}
          </div>
          <div className="opb-nx">
            <b>Lo que viene en {ODS_CURRENT}.</b> La UDES prevé {o.next}
          </div>
          {!o.real && <span className="opb-ilus">Cifras ilustrativas</span>}
          <div className="opb-ods__band" aria-hidden="true" />
        </div>
        {foot}
      </div>
    );
  } else {
    inner = (
      <div className="opb-pgi opb-back">
        <h2>Universidad de Santander</h2>
        <p>Oficina de Planeación · Cifras oficiales con su corte y procedencia.</p>
        <p>planeacion.udes.edu.co</p>
      </div>
    );
  }

  return (
    <div className="opb-pg" style={style} data-opb-page={page.i}>
      {inner}
    </div>
  );
}
