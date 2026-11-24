/* =============================================================================
   UDES Sostenible · página de evidencia de un indicador de THE.

   /sostenible/impact/evidencia/:n/:indicador[?lang=es]

   Es lo que abre el evaluador de THE (un modelo de lenguaje que lee en
   inglés): una sola página por indicador, limpia. Abre en INGLÉS
   (idiomaPreferido) con el español a un clic. Sin el marco del portal (ni
   menú ni pie), sin enlaces de ningún tipo y sin adjuntos. En el orden que
   arma paginaEvidencia (pagina.ts): título con el indicador y la pregunta de
   THE, la respuesta directa, la ficha de hechos y las frases de la nota;
   luego la nota de origen (título, fecha, sección, sede), la fotografía si
   la base la entrega y, al pie, la fuente original escrita como texto.
   Fondo claro, sin animaciones; el `<title>` sigue el idioma.

   `EvidenciaHoja` es la misma hoja que se ve en la intranet como vista previa.
   ========================================================================== */

import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { idiomaPreferido, paginaEvidencia, useEvidenciaPublica } from "../rankings/informes/datos";
import type { EvidenciaPublica } from "../rankings/informes/datos";
import { indicadorPorId } from "../rankings/informes/the-indicadores";
import { direccionTexto } from "../rankings/informes/recorte";
import { fechaCorta, tr, useLang } from "./i18n";
import type { Lang } from "./i18n";
import { Bi, LangSwitch } from "./LangSwitch";
import "./ods-evidence.css";

const UNIVERSIDAD = "Universidad de Santander";

const anio = (d: string | null | undefined) => (d && /^\d{4}/.test(d) ? d.slice(0, 4) : "2025");

/** La hoja de evidencia en un idioma. No lleva ningún enlace: la fuente va escrita como texto. */
export function EvidenciaHoja({ ev, lang }: { ev: EvidenciaPublica; lang: Lang }) {
  const ind = indicadorPorId(ev.indicator);
  const pag = paginaEvidencia({ id: ev.indicator, titulo: ind?.titulo, pregunta: ind?.pregunta }, ev.ficha ?? null, ev.page_es, ev.page_en, lang);
  const meta = [fechaCorta(ev.date, lang), ev.section, ev.campus].filter(Boolean).join(" · ");
  /* Sin las frases en inglés, el español: nunca una página vacía. */
  const frases = pag.frases.length ? pag.frases : paginaEvidencia({ id: ev.indicator }, null, ev.page_es, ev.page_en, "es").frases;
  const frasesLang: Lang = pag.frases.length ? lang : "es";
  return (
    <article className="oev-sheet" lang={lang} aria-labelledby="oev-title">
      <header className="oev-kick">
        <span>{tr(lang, "ev_kick", { i: ev.indicator })}</span>
        <span>
          {UNIVERSIDAD} · {anio(ev.date)}
        </span>
      </header>
      <h1 id="oev-title" className="oev-title">
        {pag.titulo}
      </h1>
      {pag.respuesta && (
        <section className="oev-answer" aria-label={tr(lang, "ev_respuesta")}>
          <p>{pag.respuesta}</p>
        </section>
      )}
      {pag.ficha.length > 0 && (
        <section className="oev-facts" aria-labelledby="oev-facts-h">
          <h2 id="oev-facts-h" className="oev-h">
            {tr(lang, "ev_hechos")}
          </h2>
          <dl>
            {pag.ficha.map((r) => (
              <div key={r.k}>
                <dt>{r.etiqueta}</dt>
                {/* La ficha está en inglés: así la lee THE. */}
                <dd lang="en">{r.v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {frases.length > 0 && (
        <section className="oev-es" lang={frasesLang} aria-labelledby="oev-frases-h">
          <h2 id="oev-frases-h" className="oev-h">
            {tr(lang, "ev_frases")}
          </h2>
          {frases.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      )}
      <section className="oev-src" aria-labelledby="oev-src-h">
        <h2 id="oev-src-h" className="oev-h">
          {tr(lang, "ev_nota")}
        </h2>
        <Bi as="p" className="oev-src__t" lang={lang} es={ev.title} en={ev.title_en} />
        {meta && <p className="oev-meta">{meta}</p>}
        {ev.image_url && (
          <figure className="oev-photo">
            <img src={ev.image_url} alt={tr(lang, "ev_foto", { t: lang === "en" && ev.title_en ? ev.title_en : ev.title })} decoding="async" referrerPolicy="no-referrer" />
          </figure>
        )}
      </section>
      <footer className="oev-foot">
        {tr(lang, "ev_fuente")}: {direccionTexto(ev.url)}
      </footer>
    </article>
  );
}

export function OdsEvidence() {
  const { n, indicador } = useParams();
  const ods = Number(n);
  const ind = indicador ?? "";
  const q = useEvidenciaPublica(ods, ind);
  const ev = q.data ?? null;
  /* Inglés primero (así presenta la UDES los rankings); el español a un clic. No usa lo recordado del portal. */
  const { lang, setLang } = useLang({ base: idiomaPreferido(null, null), recordar: false });

  useEffect(() => {
    document.title = ev ? tr(lang, "ev_title", { i: ev.indicator, t: lang === "en" && ev.title_en ? ev.title_en : ev.title }) : tr(lang, "ev_title_vacio", { i: ind, n: ods });
  }, [ev, ind, ods, lang]);

  return (
    <main className="oev" lang={lang}>
      <div className="oev-bar">
        <LangSwitch lang={lang} onChange={setLang} />
      </div>
      {ev ? (
        <EvidenciaHoja ev={ev} lang={lang} />
      ) : (
        <div className="oev-sheet oev-sheet--empty" role="status">
          <p className="oev-kick">
            <span>{tr(lang, "ev_kick", { i: ind })}</span>
            <span>{UNIVERSIDAD}</span>
          </p>
          <p className="oev-wait">{q.isPending ? tr(lang, "ev_cargando") : q.error ? tr(lang, "ev_error") : tr(lang, "ev_no_existe")}</p>
        </div>
      )}
    </main>
  );
}
