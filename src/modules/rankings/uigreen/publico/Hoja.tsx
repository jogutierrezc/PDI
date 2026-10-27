/* =============================================================================
   UI GreenMetric · página pública · hoja de evidencia de un indicador.

   /sostenible/green/evidencia/:q[?lang=en&edicion=2026]

   Una página limpia por indicador, sin menú del portal: solo el selector ES | EN.
   Abre en INGLÉS (así presenta la UDES los rankings, como la hoja de THE) con el
   español a un clic. Si el indicador no está publicado hoy, o no tiene traducción
   revisada al inglés, lo dice; nunca muestra texto sin revisar.
   ========================================================================== */

import { Link, useParams } from "react-router-dom";
import { useLang } from "../../../sostenible/i18n";
import { LangSwitch } from "../../../sostenible/LangSwitch";
import { usePublicoHoja } from "../datos";
import { CuerpoIndicador, Evidencias, frasePeriodo } from "./Indicador";
import { RUTA_GREEN, fecha, numero, useSeo } from "./logica";
import { useEdicion } from "./piezas";
import { tx } from "./textos";
import "../../../sostenible/ods.css";
import "../../../sostenible/ods-evidence.css";
import "./ugmp.css";

export function Hoja() {
  const { q = "" } = useParams();
  const { lang, setLang } = useLang({ base: "en", recordar: false });
  const ed = useEdicion();
  const hoja = usePublicoHoja(ed.ciclo?.id, q, lang);
  const i = hoja.data?.indicador ?? null;
  useSeo(i ? `${tx(lang, "ev_kick", { i: i.indicador ?? i.q })} · ${i.nombre} · UI GreenMetric · Universidad de Santander` : `${tx(lang, "ev_kick", { i: q })} · Universidad de Santander`, i?.descripcion?.slice(0, 200) ?? tx(lang, "portada_lede"));

  const cargando = ed.cargando || hoja.isPending;
  const ciclo = hoja.data?.ciclo;
  const valor = i && typeof i.valor === "number" ? `${numero(i.valor, lang)}${i.unidad ? ` ${i.unidad}` : ""}` : (i?.opcion_frase ?? "");
  const hechos: [string, string][] = i && ciclo ? [[tx(lang, "ev_pregunta"), `[${i.q}]${i.indicador ? ` · ${i.indicador}` : ""}`]] : [];
  if (i && ciclo) {
    if (valor) hechos.push([tx(lang, "ev_cifra"), valor]);
    hechos.push([tx(lang, "ev_periodo"), frasePeriodo(i, ciclo, lang)]);
    hechos.push([tx(lang, "ev_docs"), String(i.evidencias?.length ?? 0)]);
  }

  return (
    <main className="oev ugmp-oev odsx" lang={lang}>
      <div className="oev-bar">
        <LangSwitch lang={lang} onChange={setLang} />
      </div>
      {i && ciclo ? (
        <article className="oev-sheet ugmp" lang={lang} aria-labelledby="oev-title">
          <header className="oev-kick">
            <span>{tx(lang, "ev_kick", { i: i.indicador ?? i.q })}</span>
            <span>Universidad de Santander · {ciclo.anio}</span>
          </header>
          <h1 id="oev-title" className="oev-title">
            {i.nombre}
          </h1>
          {valor && (
            <section className="oev-answer">
              <p>{valor}</p>
            </section>
          )}
          <section className="oev-facts" aria-labelledby="oev-facts-h">
            <h2 id="oev-facts-h" className="oev-h">
              {tx(lang, "ev_hechos")}
            </h2>
            <dl>
              {hechos.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="ugmp-hoja-cuerpo" aria-labelledby="oev-desc-h">
            <h2 id="oev-desc-h" className="oev-h">
              {tx(lang, "ev_desc")}
            </h2>
            <CuerpoIndicador i={i} lang={lang} />
          </section>
          <section aria-labelledby="oev-ev-h">
            <h2 id="oev-ev-h" className="oev-h">
              {tx(lang, "ev_soporte")}
            </h2>
            <Evidencias lista={i.evidencias ?? []} lang={lang} />
          </section>
          <footer className="oev-foot">{tx(lang, "ev_fuente", { f: fecha(i.actualizado, lang) })}</footer>
        </article>
      ) : (
        <div className="oev-sheet oev-sheet--empty" role="status">
          <p className="oev-kick">
            <span>{tx(lang, "ev_kick", { i: q })}</span>
            <span>Universidad de Santander</span>
          </p>
          <p className="oev-wait">
            {cargando ? tx(lang, "cargando") : hoja.isError ? tx(lang, "error_x") : lang === "en" ? tx(lang, "ev_no_en") : tx(lang, "ev_no_es")}
          </p>
          {!cargando && !hoja.isError && lang === "en" && (
            <p>
              <Link to={`${RUTA_GREEN}/evidencia/${encodeURIComponent(q)}?lang=es`} className="ugmp-ver-es">
                {tx(lang, "ver_es")}
              </Link>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
