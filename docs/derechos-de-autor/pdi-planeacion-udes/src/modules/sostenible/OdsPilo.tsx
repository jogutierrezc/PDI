/* =============================================================================
   UDES Sostenible · el cuerpo de un informe ODS redactado con Pilo.

   Lo pinta OdsReport cuando el ODS tiene un informe PUBLICADO para la edición
   (usePublicInforme), en lugar de la plantilla genérica; el ODS 13 conserva su
   detalle y recibe solo el relato (`soloRelato`). La intranet usa la misma
   pieza como vista previa, con los datos del borrador y sin movimiento.

     tesis          una frase grande, condensada
     cifras         tipografía; en los ODS con cifras reales de ods-data.ts
                    (hoy 4 y 13) mandan esas; en los demás, el bloque «cifras»
     portada        la fotografía ancha (recorte 3:1 o 16:9), a sangre
     relato         subtítulos temáticos y una columna de texto justificado
                    (≈66 caracteres) con las fotografías y las demás cifras en
                    el margen; referencias numeradas que llevan al carrusel
     galería        rejilla con el recorte de cada foto (4:3 o 1:1)
     proyectos      rejilla
     viene          bloque a sangre del color del ODS
     registro       todas las notas del ODS (OdsRegistro)

   Español e inglés: cada párrafo en el idioma pedido (text_en, heading_en);
   si falta el inglés, el español con la marca «ES», nunca un hueco.

   Movimiento (solo en el portal): cortina del color sobre la portada, titulares
   por líneas enmascaradas, entrada al hacer scroll y cifras que cuentan. Todo
   está completo en reposo; con movimiento reducido no hay animación. Nunca
   `clearProps: "all"` (borraría las variables de color en línea).
   ========================================================================== */

import { Fragment, useRef } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Cifra as CifraT, InformePublico, RanuraFoto, Seccion } from "../rankings/informes/tipos";
import { textoEnIdioma } from "../rankings/informes/pagina";
import { estiloRecorte, numerarReferencias } from "../rankings/informes/recorte";
import { odsArt } from "./ods-data";
import type { Ods } from "./ods-data";
import { odsArtSize } from "./OdsArt";
import { Words, fmtN, parseFigure } from "./OdsReportParts";
import { useNoticiasPublicas } from "./ods-noticias";
import { ODS_CIFRAS_EN, tr } from "./i18n";
import type { Lang } from "./i18n";
import { MarcaEs } from "./LangSwitch";
import { OdsRegistro } from "./OdsRegistro";
import { reduced } from "./widgets";
import "./ods-report.css";
import "./ods-pilo.css";

/* ScrollTrigger se registra al animar (en el navegador): la intranet importa esta pieza para la vista previa. */
gsap.registerPlugin(useGSAP);

type BloquePub = InformePublico["bloques"][number];
type FotoPub = InformePublico["fotos"][number];

/** Lo que el informe necesita de cada nota: su imagen (si la foto no trae la suya) y, para el alt, su título. */
export interface NotaInforme {
  id: string;
  image_url: string | null;
  title: string;
}

const porPos = (a: BloquePub, b: BloquePub) => a.pos - b.pos;
const deSeccion = (inf: InformePublico, sec: Seccion) => inf.bloques.filter((b) => b.sec === sec && b.text.trim()).sort(porPos);

/** Secciones que el informe tiene, para la barra de OdsReport: [id sin «ors-», rótulo]. */
export function seccionesPilo(inf: InformePublico | null | undefined, soloRelato = false, lang: Lang = "es"): [string, string][] {
  if (!inf) return [];
  const s: [string, string][] = [];
  const figs = inf.bloques.some((b) => b.sec === "cifras" && b.figs.length) || deSeccion(inf, "tesis").length > 0;
  if (!soloRelato && figs) s.push(["cifras", tr(lang, "sec_cifras")]);
  if (deSeccion(inf, "hicimos").length) s.push(["relato", tr(lang, "sec_relato")]);
  if (!soloRelato && deSeccion(inf, "proyectos").length) s.push(["proyectos", tr(lang, "sec_proyectos")]);
  if (!soloRelato && deSeccion(inf, "viene").length) s.push(["viene", tr(lang, "sec_viene")]);
  if (inf.registro?.length) s.push(["registro", tr(lang, "sec_registro")]);
  return s;
}

/** Proyectos: «Nombre. Lo que hace» → nombre y texto. */
export function partirProyecto(t: string): { nombre: string; texto: string } {
  const i = t.indexOf(". ");
  if (i < 0 || i > 80) return { nombre: "", texto: t };
  return { nombre: t.slice(0, i), texto: t.slice(i + 2) };
}

/**
 * Las cifras grandes del informe: en un ODS con cifras reales en ods-data.ts
 * (hoy el 4 y el 13) mandan esas; en los demás, las del bloque «cifras».
 */
export function cifrasDelInforme(o: Ods, inf: InformePublico, lang: Lang): { grandes: CifraT[]; margen: CifraT[] } {
  const delBloque = inf.bloques
    .filter((b) => b.sec === "cifras")
    .sort(porPos)
    .flatMap((b) => b.figs)
    .filter((f) => f.v);
  if (!o.real) return { grandes: delBloque.slice(0, 2), margen: delBloque.slice(2) };
  const grandes = o.figures.map((f, i) => {
    const en = ODS_CIFRAS_EN[o.n - 1]?.[i];
    const [unit, label] = lang === "en" && en ? en : [f.unit, f.label];
    return { v: f.value, label: `${unit} ${label}`.trim(), src: lang === "en" ? "2025 report" : "Informe 2025" };
  });
  const usadas = new Set(grandes.map((g) => g.v.replace(/\s/g, "")));
  return { grandes, margen: delBloque.filter((f) => !usadas.has(f.v.replace(/\s/g, ""))) };
}

/** Un texto del informe en el idioma pedido, con la marca «ES» si falta el inglés. */
function Texto({ b, lang }: { b: Pick<BloquePub, "text" | "text_en">; lang: Lang }) {
  const t = textoEnIdioma(b, lang);
  return (
    <span lang={t.idioma}>
      {t.texto}
      {lang === "en" && t.idioma === "es" && (
        <>
          {" "}
          <MarcaEs lang={lang} />
        </>
      )}
    </span>
  );
}

/* ---------- Piezas ------------------------------------------------------------- */

function Titular({ id, text, lang }: { id: string; text: string; lang?: string }) {
  return (
    <h2 id={id} className="opi-h2" aria-label={text} lang={lang}>
      <Words text={text} cls="opi-w" />
    </h2>
  );
}

/** Una cifra que cuenta al entrar (en reposo ya muestra el valor final). */
function Cifra({ v, lang }: { v: string; lang: Lang }) {
  const p = parseFigure(v);
  if (!p) return <>{v}</>;
  return (
    <>
      {p.before}
      <span className="opi-cnt" data-to={p.to} data-dec={p.decimals} data-lang={lang}>
        {fmtN(p.to, lang, p.decimals)}
      </span>
      {p.after}
    </>
  );
}

function Foto({ f, nota, slot, className, cortina, lang }: { f: FotoPub; nota?: NotaInforme; slot: RanuraFoto; className: string; cortina?: boolean; lang: Lang }) {
  const src = f.url || nota?.image_url;
  if (!src) return null;
  return (
    <figure className={className}>
      <div className="opi-frame">
        <img src={src} alt={f.alt || f.caption || nota?.title || ""} lang="es" style={estiloRecorte(f.crop, slot)} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        {cortina && <span className="opi-curtain" aria-hidden="true" />}
      </div>
      {(f.caption || f.credit) && (
        <figcaption>
          <span lang="es">{f.caption}</span>
          {f.credit && (
            <span className="opi-credit">
              {" "}
              {tr(lang, "foto")}: <span lang="es">{f.credit}</span>
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/* ---------- El cuerpo ------------------------------------------------------------ */

export function OdsPiloCuerpo({
  o,
  informe,
  notas,
  lang = "es",
  animar = true,
  soloRelato = false,
}: {
  o: Ods;
  informe: InformePublico;
  notas: NotaInforme[];
  lang?: Lang;
  animar?: boolean;
  soloRelato?: boolean;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const edicion = informe.informe.edition;
  const nota = new Map(notas.map((n) => [n.id, n]));
  const fotos = informe.fotos.filter((f) => f.url || nota.get(f.news_id)?.image_url);
  const enRanura = (s: RanuraFoto) => fotos.find((f) => f.slot === s);
  const galeria = fotos.filter((f) => f.slot === "galeria");

  const tesis = deSeccion(informe, "tesis");
  const cifrasB = informe.bloques.filter((b) => b.sec === "cifras").sort(porPos);
  const { grandes, margen } = cifrasDelInforme(o, informe, lang);
  const notaCifras = cifrasB.filter((b) => b.text.trim() && !b.figs.length);
  const hicimos = deSeccion(informe, "hicimos");
  const proyectos = deSeccion(informe, "proyectos");
  const viene = deSeccion(informe, "viene");
  const refs = numerarReferencias(hicimos);
  const idDe = new Map([...refs.entries()].map(([id, k]) => [k, id]));

  /* Al margen del relato: la foto 1 junto al segundo párrafo, la 2 junto al cuarto, y las cifras que sobran en los demás. */
  const margenDe = new Map<number, ReactNode[]>();
  const poner = (i: number, n: ReactNode) => margenDe.set(i, [...(margenDe.get(i) ?? []), n]);
  const n1 = enRanura("n1");
  const n2 = enRanura("n2");
  if (n1) poner(Math.min(1, hicimos.length - 1), <Foto key="n1" f={n1} nota={nota.get(n1.news_id)} slot="n1" className="opi-shot opi-rise" lang={lang} />);
  if (n2) poner(Math.min(3, hicimos.length - 1), <Foto key="n2" f={n2} nota={nota.get(n2.news_id)} slot="n2" className="opi-shot opi-rise" lang={lang} />);
  const libres = hicimos.map((_, i) => i).filter((i) => !margenDe.has(i));
  margen.forEach((f, k) => {
    const i = libres[k % Math.max(1, libres.length)] ?? 0;
    poner(
      i,
      <div key={`f${k}`} className="opi-mfig opi-rise">
        <b>
          <Cifra v={f.v} lang={lang} />
        </b>
        <span lang="es">{f.label}</span>
      </div>,
    );
  });

  useGSAP(
    () => {
      const root = scope.current;
      if (!animar || !root || reduced()) return;
      gsap.registerPlugin(ScrollTrigger);
      const q = <T extends Element = HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));

      /* Cortina del color del ODS que se retira de la portada. */
      q(".opi-curtain").forEach((c) => {
        gsap.fromTo(c, { scaleX: 1 }, { scaleX: 0, duration: 0.8, ease: "power4.inOut", clearProps: "transform", scrollTrigger: { trigger: c, start: "top 85%", once: true } });
      });
      /* Titulares por líneas enmascaradas. */
      q(".opi-h2").forEach((h) => {
        const w = h.querySelectorAll(".opi-w");
        if (w.length) gsap.fromTo(w, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: "power4.out", stagger: 0.025, clearProps: "transform", scrollTrigger: { trigger: h, start: "top 88%", once: true } });
      });
      /* Entrada al hacer scroll. */
      ScrollTrigger.batch(q(".opi-rise"), {
        start: "top 92%",
        once: true,
        onEnter: (b) => void gsap.from(b, { y: 18, opacity: 0, duration: 0.5, ease: "power3.out", stagger: 0.06, clearProps: "opacity,transform" }),
      });
      /* Las cifras cuentan. */
      q(".opi-cnt").forEach((c) => {
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
              duration: 1.1,
              ease: "power4.out",
              onUpdate: () => void (c.textContent = fmtN(dec ? s.v : Math.round(s.v), lg, dec)),
              onComplete: () => void (c.textContent = fmtN(to, lg, dec)),
            }),
        });
      });
      ScrollTrigger.refresh();
    },
    { scope, dependencies: [animar, lang, informe.informe.id, informe.informe.updated_at, notas.length] },
  );

  const portada = enRanura("portada");

  return (
    <div ref={scope} className="opi" lang={lang}>
      {!soloRelato && (tesis.length > 0 || grandes.length > 0) && (
        <section className="ors-sec opi-sec opi-top" id="ors-cifras" aria-labelledby="opi-cifras-h">
          <div className="odsx-wrap">
            <h2 id="opi-cifras-h" className="opi-vh">
              {tr(lang, "tesis_cifras")}
            </h2>
            {tesis.map((b) => (
              <p key={b.id} className="opi-thesis opi-rise">
                <Texto b={b} lang={lang} />
              </p>
            ))}
            {grandes.length > 0 && (
              <div className="opi-figs">
                {grandes.map((f, i) => (
                  <div key={i} className="opi-fig opi-rise">
                    <p className="opi-fig__big">
                      <Cifra v={f.v} lang={lang} />
                    </p>
                    <p className="opi-fig__label" lang={o.real ? lang : "es"}>
                      {f.label}
                    </p>
                    {f.src && (
                      <p className="opi-fig__src">
                        {tr(lang, "fuente")}: <span lang={o.real ? lang : "es"}>{f.src}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {notaCifras.map((b) => (
              <p key={b.id} className="opi-figs__note opi-just">
                <Texto b={b} lang={lang} />
              </p>
            ))}
          </div>
        </section>
      )}

      {!soloRelato && portada && <Foto f={portada} nota={nota.get(portada.news_id)} slot="portada" className="opi-cover" cortina lang={lang} />}

      {hicimos.length > 0 && (
        <section className="ors-sec opi-sec" id="ors-relato" aria-labelledby="opi-relato-h">
          <div className="odsx-wrap">
            <header className="opi-head">
              <Titular id="opi-relato-h" text={tr(lang, "hicimos_en", { e: edicion })} />
            </header>
            <div className="opi-story">
              {hicimos.map((b, i) => {
                const nums = Array.from(new Set(b.sources.map((s) => refs.get(s.news_id) ?? 0)))
                  .filter(Boolean)
                  .sort((a, c) => a - c);
                const h = b.heading?.trim();
                const abre = h && h !== hicimos[i - 1]?.heading?.trim();
                return (
                  <Fragment key={b.id}>
                    {abre && (
                      <h3 className="opi-sub opi-rise">
                        <Texto b={{ text: h, text_en: b.heading_en }} lang={lang} />
                      </h3>
                    )}
                    <div className="opi-unit">
                      {margenDe.has(i) && <aside className="opi-side">{margenDe.get(i)}</aside>}
                      <p className="opi-p opi-just opi-rise">
                        <Texto b={b} lang={lang} />
                        {nums.length > 0 && (
                          <sup className="opi-refs">
                            {nums.map((k, j) => (
                              <span key={k}>
                                {j > 0 && ","}
                                <a href={`#osn-${idDe.get(k) ?? ""}`} aria-label={tr(lang, "fuente_n", { n: k })}>
                                  {k}
                                </a>
                              </span>
                            ))}
                          </sup>
                        )}
                      </p>
                    </div>
                  </Fragment>
                );
              })}
            </div>
            {galeria.length > 0 && (
              <div className="opi-gallery">
                {galeria.map((f) => (
                  <Foto key={f.image_id ?? f.news_id} f={f} nota={nota.get(f.news_id)} slot="galeria" className="opi-gshot opi-rise" lang={lang} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {!soloRelato && proyectos.length > 0 && (
        <section className="ors-sec ors-sec--white opi-sec" id="ors-proyectos" aria-labelledby="opi-proy-h">
          <div className="odsx-wrap">
            <header className="opi-head">
              <Titular id="opi-proy-h" text={tr(lang, "proyectos_t")} />
            </header>
            <ul className="opi-proj">
              {proyectos.map((b) => {
                const t = textoEnIdioma(b, lang);
                const p = partirProyecto(t.texto);
                return (
                  <li key={b.id} className="opi-rise" lang={t.idioma}>
                    {p.nombre && <b>{p.nombre}</b>}
                    <span>
                      {p.texto}
                      {lang === "en" && t.idioma === "es" && (
                        <>
                          {" "}
                          <MarcaEs lang={lang} />
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {!soloRelato && viene.length > 0 && (
        <section className="ors-sec ors-block ors-block--next opi-next" id="ors-viene" aria-labelledby="opi-viene-h">
          <div className="ors-block__art" aria-hidden="true">
            <img src={odsArt(o.n)} alt="" {...odsArtSize(o.n)} loading="lazy" decoding="async" />
          </div>
          <div className="odsx-wrap ors-block__wrap">
            <p className="opi-next__k">{tr(lang, "hacia_proxima")}</p>
            <VieneTitular viene={viene} lang={lang} />
          </div>
        </section>
      )}

      <OdsRegistro registro={informe.registro} lang={lang} edicion={edicion} />
    </div>
  );
}

/** «Hacia la próxima edición»: en inglés si todos sus párrafos lo tienen; si no, el español con la marca. */
function VieneTitular({ viene, lang }: { viene: BloquePub[]; lang: Lang }) {
  const enIngles = lang === "en" && viene.every((b) => b.text_en?.trim());
  const texto = viene.map((b) => (enIngles ? b.text_en : b.text)).join(" ");
  return (
    <>
      <Titular id="opi-viene-h" text={texto} lang={enIngles || lang === "es" ? lang : "es"} />
      {lang === "en" && !enIngles && <MarcaEs lang={lang} />}
    </>
  );
}

/** El cuerpo del informe en el portal: si una foto no trae su imagen, se usa la de su nota. */
export function OdsPilo({ o, informe, soloRelato = false, lang = "es" }: { o: Ods; informe: InformePublico; soloRelato?: boolean; lang?: Lang }) {
  const q = useNoticiasPublicas(o.n);
  const notas: NotaInforme[] = (q.data ?? []).map((n) => ({ id: n.id, image_url: n.image_url, title: n.title }));
  return <OdsPiloCuerpo o={o} informe={informe} notas={notas} soloRelato={soloRelato} lang={lang} />;
}

/** Recortes del informe por nota, para que el carrusel use el mismo punto de interés (el de su foto más destacada). */
export function recortesDe(informe: InformePublico | null | undefined) {
  const r: Record<string, InformePublico["fotos"][number]["crop"]> = {};
  for (const f of informe?.fotos ?? []) if (!r[f.news_id] || f.slot !== "galeria") r[f.news_id] = f.crop;
  return r;
}
