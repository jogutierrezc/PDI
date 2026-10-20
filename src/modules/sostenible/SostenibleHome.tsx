/* =============================================================================
   UDES Sostenible · portada.

   La foto de UDES Verde, un micrositio por ranking, los indicadores de los
   campus con campus y año a elegir, los frentes de trabajo y los informes.
   ========================================================================== */

import { Fragment, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Icon } from "../../components/ui/Icon";
import { AXES, ALL_INDICATORS, LAST, RANKINGS, YEARS, reports } from "./data";
import { Intro, SostenibleLayout, useIntro } from "./SostenibleLayout";
import { IndicatorBoard, SdgWheel, SheetDialog, LineChart, reduced } from "./widgets";
import type { SheetData } from "./widgets";
import type { Ranking } from "./data";
import { odsArt } from "./ods-data";

gsap.registerPlugin(ScrollTrigger);

const TITLE = ["Una", "universidad", "que", "se", "mide", "contra", "el", "mundo", "y", "cuida", "su", "territorio."];
const ODS_NUMBERS = Array.from({ length: 17 }, (_, i) => i + 1);

export function rankingSheet(r: Ranking, yearIndex: number): SheetData {
  return {
    title: `${r.name} · informe ${YEARS[yearIndex]}`,
    publisher: r.publisher,
    stats: [
      [r.world[yearIndex], "Puesto mundial"],
      [`#${r.national[yearIndex]}`, "Puesto en Colombia"],
      r.score ? [r.score[yearIndex].toLocaleString("es-CO"), "Puntaje / 10.000"] : [String(YEARS[yearIndex]), "Edición"],
    ],
    chart: <LineChart paper values={r.mid} tags={r.world} min={0} max={Math.max(...r.mid) * 1.08} rank width={520} height={230} label={`Evolución de ${r.name}`} color="#014898" />,
  };
}

export function SostenibleHome() {
  const { showing, skip, scope: introScope } = useIntro();
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const list = reports();

  useGSAP(
    () => {
      if (reduced() || showing) return;
      // Al levantarse la cortina: la foto baja de zoom y el título sube palabra por palabra.
      gsap.from(".sos-hero__photo", { scale: 1.16, duration: 2.4, ease: "power2.out", clearProps: "transform" });
      gsap.from(".sos-w", { yPercent: 105, duration: 0.8, ease: "power4.out", stagger: 0.05, delay: 0.1, clearProps: "opacity,transform" });
      gsap.from(".sos-hero .sos-eyebrow, .sos-hero__lead, .sos-hero__cta", { y: 16, opacity: 0, duration: 0.6, ease: "power3.out", stagger: 0.1, delay: 0.5, clearProps: "opacity,transform" });
      gsap.from(".sos-ods-strip", { opacity: 0, duration: 0.8, delay: 0.9, clearProps: "opacity" });
    },
    { scope: root, dependencies: [showing] },
  );

  useGSAP(
    () => {
      if (reduced()) return;
      gsap.to(".sos-ods-strip__track", { xPercent: -50, ease: "none", duration: 34, repeat: -1 });
      gsap.to(".sos-hero__photo", { yPercent: 10, ease: "none", scrollTrigger: { trigger: ".sos-hero", start: "top top", end: "bottom top", scrub: true } });
      ScrollTrigger.batch(".sos-rcard, .sos-axis, .sos-rep", {
        start: "top 90%",
        once: true,
        onEnter: (batch) => gsap.from(batch, { y: 24, opacity: 0, duration: 0.5, ease: "power3.out", stagger: 0.07, clearProps: "opacity,transform" }),
      });
    },
    { scope: root },
  );

  return (
    <SostenibleLayout title="Inicio">
      {showing && <Intro scope={introScope} skip={skip} />}
      <div ref={root}>
        <section className="sos-hero" aria-labelledby="sos-h1">
          <div className="sos-hero__photo" role="img" aria-label="Ladera con el letrero UDES Verde" />
          <div className="sos-wrap sos-hero__grid">
            <div>
              <p className="sos-eyebrow sos-eyebrow--on-dark">UDES Sostenible · UDES Verde</p>
              <h1 id="sos-h1">
                {TITLE.map((w, i) => (
                  <Fragment key={i}>
                    <span className="sos-mask">
                      <span className={`sos-w${w === "mundo" ? " sos-em" : ""}`}>{w}</span>
                    </span>{" "}
                  </Fragment>
                ))}
              </h1>
              <p className="sos-hero__lead">Los resultados de la UDES en los rankings de sostenibilidad y el trabajo diario por el campus, la comunidad y los Objetivos de Desarrollo Sostenible.</p>
              <div className="sos-hero__cta">
                <Link className="sos-btn sos-btn--light" to="/sostenible/impact">
                  Ver los rankings
                </Link>
                <Link className="sos-btn sos-btn--outline" to="/sostenible#indicadores">
                  Indicadores en vivo
                </Link>
              </div>
            </div>
            <SdgWheel />
          </div>
          <span className="sos-credit">Foto: ladera UDES Verde</span>
        </section>

        <div className="sos-ods-strip" aria-hidden="true">
          <div className="sos-ods-strip__track">
            {[0, 1].map((copy) => (
              <Fragment key={copy}>
                {ODS_NUMBERS.map((n) => (
                  <img key={n} src={odsArt(n)} alt="" width={64} height={64} loading="lazy" decoding="async" />
                ))}
              </Fragment>
            ))}
          </div>
        </div>

        <section className="sos-section" aria-labelledby="sos-rk">
          <div className="sos-wrap">
            <div className="sos-head">
              <p className="sos-eyebrow">Rankings</p>
              <h2 id="sos-rk">Un micrositio por cada ranking.</h2>
              <p>Cada ranking tiene su informe individual, sus ediciones y sus subcategorías, con indicadores propios.</p>
            </div>
            <div className="sos-rcards">
              {RANKINGS.map((r) => (
                <Link key={r.id} to={`/sostenible/${r.id}`} className="sos-rcard" style={{ "--sos-accent": r.accent } as CSSProperties}>
                  <span className="sos-rcard__pub">{r.publisher}</span>
                  <h3>{r.name}</h3>
                  <p>{r.subtitle}</p>
                  <span className="sos-rcard__big">#{r.national[LAST]}</span>
                  <p>Puesto en Colombia · edición {YEARS[LAST]}</p>
                  <span className="sos-rcard__go">
                    Entrar al micrositio <Icon name="arrow-right" size={15} />
                  </span>
                </Link>
              ))}
            </div>
            <p className="sos-note">
              <i aria-hidden="true" />
              Dato ilustrativo: cifras de muestra.
            </p>
          </div>
        </section>

        <section className="sos-section sos-section--alt" id="indicadores" aria-labelledby="sos-ind">
          <div className="sos-wrap" style={{ "--sos-accent": "var(--pillar-2)" } as CSSProperties}>
            <div className="sos-head">
              <p className="sos-eyebrow">Indicadores de sostenibilidad</p>
              <h2 id="sos-ind">Lo que medimos en los campus, en vivo.</h2>
              <p>Elige un campus y un año: las cifras, las barras y las tendencias se recalculan al instante.</p>
            </div>
            <IndicatorBoard keys={ALL_INDICATORS} />
          </div>
        </section>

        <section className="sos-section" aria-labelledby="sos-ejes">
          <div className="sos-wrap">
            <div className="sos-head">
              <p className="sos-eyebrow">Cómo trabaja la UDES</p>
              <h2 id="sos-ejes">La sostenibilidad se vive en seis frentes.</h2>
              <p>Los frentes son una propuesta de estructura; cada uno enlazará a su oficina responsable y a sus indicadores.</p>
            </div>
            <div className="sos-axes">
              {AXES.map((a) => (
                <article key={a.name} className="sos-axis">
                  <div className="sos-axis__icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d={a.icon} />
                    </svg>
                  </div>
                  <h3>{a.name}</h3>
                  <p>{a.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sos-section sos-section--alt" id="informes" aria-labelledby="sos-inf">
          <div className="sos-wrap">
            <div className="sos-head">
              <p className="sos-eyebrow">Informes</p>
              <h2 id="sos-inf">Descarga o consulta cada informe.</h2>
              <p>Un informe por ranking y edición, en pantalla o en PDF tamaño carta.</p>
            </div>
            <div className="sos-reps">
              {list.map(({ ranking: r, yearIndex }) => (
                <div key={`${r.id}-${yearIndex}`} className="sos-rep">
                  <span className="sos-rep__year">{YEARS[yearIndex]}</span>
                  <div>
                    <h3>{r.name}</h3>
                    <p>
                      {r.publisher} · puesto mundial {r.world[yearIndex]} · Colombia #{r.national[yearIndex]}
                    </p>
                  </div>
                  <div className="sos-rep__acts">
                    <Link className="sos-btn sos-btn--ghost sos-btn--sm" to={`/sostenible/${r.id}`}>
                      Micrositio
                    </Link>
                    <button type="button" className="sos-btn sos-btn--sm" onClick={() => setSheet(rankingSheet(r, yearIndex))}>
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      {sheet && <SheetDialog data={sheet} onClose={() => setSheet(null)} />}
    </SostenibleLayout>
  );
}
