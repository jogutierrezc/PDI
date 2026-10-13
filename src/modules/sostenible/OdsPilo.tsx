/* =============================================================================
   UDES Sostenible · el cuerpo de un informe ODS redactado con Pilo.

   Lo pinta OdsReport cuando el ODS tiene un informe PUBLICADO para la edición
   (usePublicInforme), en lugar de la plantilla genérica; el ODS 13 conserva su
   detalle y recibe solo el relato (`soloRelato`). La intranet usa la misma
   pieza como vista previa, con los datos del borrador y sin movimiento.

     tesis          una frase grande, condensada
     cifras         tipografía en la rejilla de 12 columnas
     portada        la fotografía ancha (recorte 3:1 o 16:9), a sangre
     relato         una columna de texto justificado (≈66 caracteres) con las
                    fotografías y las demás cifras en el margen; cada párrafo
                    lleva referencias numeradas que llevan a la nota del carrusel
     galería        rejilla con el recorte de cada foto (4:3 o 1:1)
     proyectos      rejilla
     viene          bloque a sangre del color del ODS

   Movimiento (solo en el portal): cortina del color sobre la portada, titulares
   por líneas enmascaradas, entrada al hacer scroll y cifras que cuentan. Todo
   está completo en reposo; con movimiento reducido no hay animación. Nunca
   `clearProps: "all"` (borraría las variables de color en línea).
   ========================================================================== */

import { useRef } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { InformePublico, RanuraFoto, Seccion } from "../rankings/informes/tipos";
import { estiloRecorte, numerarReferencias } from "../rankings/informes/recorte";
import { useApprovedNews } from "../rankings/noticias";
import { odsArt } from "./ods-data";
import type { Ods } from "./ods-data";
import { odsArtSize } from "./OdsArt";
import { Words, fmtN, parseFigure } from "./OdsReportParts";
import { reduced } from "./widgets";
import "./ods-report.css";
import "./ods-pilo.css";

/* ScrollTrigger se registra al animar (en el navegador): la intranet importa esta pieza para la vista previa. */
gsap.registerPlugin(useGSAP);

type BloquePub = InformePublico["bloques"][number];
type FotoPub = InformePublico["fotos"][number];

/** Lo que el informe necesita de cada nota: su imagen y, para el pie, su título. */
export interface NotaInforme {
  id: string;
  image_url: string | null;
  title: string;
}

const porPos = (a: BloquePub, b: BloquePub) => a.pos - b.pos;
const deSeccion = (inf: InformePublico, sec: Seccion) => inf.bloques.filter((b) => b.sec === sec && b.text.trim()).sort(porPos);

/** Secciones que el informe tiene, para la barra de OdsReport: [id sin «ors-», rótulo]. */
export function seccionesPilo(inf: InformePublico | null | undefined, soloRelato = false): [string, string][] {
  if (!inf) return [];
  const s: [string, string][] = [];
  const figs = inf.bloques.some((b) => b.sec === "cifras" && b.figs.length) || deSeccion(inf, "tesis").length > 0;
  if (!soloRelato && figs) s.push(["cifras", "Cifras"]);
  if (deSeccion(inf, "hicimos").length) s.push(["relato", "Qué hicimos"]);
  if (!soloRelato && deSeccion(inf, "proyectos").length) s.push(["proyectos", "Proyectos"]);
  if (!soloRelato && deSeccion(inf, "viene").length) s.push(["viene", "Lo que viene"]);
  return s;
}

/** Proyectos: «Nombre. Lo que hace» → nombre y texto. */
export function partirProyecto(t: string): { nombre: string; texto: string } {
  const i = t.indexOf(". ");
  if (i < 0 || i > 80) return { nombre: "", texto: t };
  return { nombre: t.slice(0, i), texto: t.slice(i + 2) };
}

/* ---------- Piezas ------------------------------------------------------------- */

function Titular({ id, text }: { id: string; text: string }) {
  return (
    <h2 id={id} className="opi-h2" aria-label={text}>
      <Words text={text} cls="opi-w" />
    </h2>
  );
}

/** Una cifra que cuenta al entrar (en reposo ya muestra el valor final). */
function Cifra({ v }: { v: string }) {
  const p = parseFigure(v);
  if (!p) return <>{v}</>;
  return (
    <>
      {p.before}
      <span className="opi-cnt" data-to={p.to} data-dec={p.decimals}>
        {fmtN(p.to, "es", p.decimals)}
      </span>
      {p.after}
    </>
  );
}

function Foto({ f, nota, slot, className, cortina }: { f: FotoPub; nota?: NotaInforme; slot: RanuraFoto; className: string; cortina?: boolean }) {
  if (!nota?.image_url) return null;
  return (
    <figure className={className}>
      <div className="opi-frame">
        <img src={nota.image_url} alt={f.alt || f.caption || nota.title} style={estiloRecorte(f.crop, slot)} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        {cortina && <span className="opi-curtain" aria-hidden="true" />}
      </div>
      {(f.caption || f.credit) && (
        <figcaption>
          {f.caption}
          {f.credit && <span className="opi-credit"> Foto: {f.credit}</span>}
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
  animar = true,
  soloRelato = false,
}: {
  o: Ods;
  informe: InformePublico;
  notas: NotaInforme[];
  animar?: boolean;
  soloRelato?: boolean;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const edicion = informe.informe.edition;
  const nota = new Map(notas.map((n) => [n.id, n]));
  const fotos = informe.fotos.filter((f) => nota.get(f.news_id)?.image_url);
  const enRanura = (s: RanuraFoto) => fotos.find((f) => f.slot === s);
  const galeria = fotos.filter((f) => f.slot === "galeria");

  const tesis = deSeccion(informe, "tesis");
  const cifrasB = informe.bloques.filter((b) => b.sec === "cifras").sort(porPos);
  const figs = cifrasB.flatMap((b) => b.figs).filter((f) => f.v);
  const notaCifras = cifrasB.filter((b) => b.text.trim() && !b.figs.length);
  const grandes = figs.slice(0, 2);
  const margen = figs.slice(2);
  const hicimos = deSeccion(informe, "hicimos");
  const proyectos = deSeccion(informe, "proyectos");
  const viene = deSeccion(informe, "viene");
  const refs = numerarReferencias(hicimos);

  /* Al margen del relato: la foto 1 junto al segundo párrafo, la 2 junto al cuarto, y las cifras que sobran en los demás. */
  const margenDe = new Map<number, ReactNode[]>();
  const poner = (i: number, n: ReactNode) => margenDe.set(i, [...(margenDe.get(i) ?? []), n]);
  const n1 = enRanura("n1");
  const n2 = enRanura("n2");
  if (n1) poner(Math.min(1, hicimos.length - 1), <Foto key="n1" f={n1} nota={nota.get(n1.news_id)} slot="n1" className="opi-shot opi-rise" />);
  if (n2) poner(Math.min(3, hicimos.length - 1), <Foto key="n2" f={n2} nota={nota.get(n2.news_id)} slot="n2" className="opi-shot opi-rise" />);
  const libres = hicimos.map((_, i) => i).filter((i) => !margenDe.has(i));
  margen.forEach((f, k) => {
    const i = libres[k % Math.max(1, libres.length)] ?? 0;
    poner(
      i,
      <div key={`f${k}`} className="opi-mfig opi-rise">
        <b>
          <Cifra v={f.v} />
        </b>
        <span>{f.label}</span>
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
        gsap.fromTo(h.querySelectorAll(".opi-w"), { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: "power4.out", stagger: 0.025, clearProps: "transform", scrollTrigger: { trigger: h, start: "top 88%", once: true } });
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
              onUpdate: () => void (c.textContent = fmtN(dec ? s.v : Math.round(s.v), "es", dec)),
              onComplete: () => void (c.textContent = fmtN(to, "es", dec)),
            }),
        });
      });
      ScrollTrigger.refresh();
    },
    { scope, dependencies: [animar, informe.informe.id, informe.informe.updated_at, notas.length] },
  );

  const portada = enRanura("portada");

  return (
    <div ref={scope} className="opi" lang="es">
      {!soloRelato && (tesis.length > 0 || grandes.length > 0) && (
        <section className="ors-sec opi-sec opi-top" id="ors-cifras" aria-labelledby="opi-cifras-h">
          <div className="odsx-wrap">
            <h2 id="opi-cifras-h" className="opi-vh">
              Tesis y cifras
            </h2>
            {tesis.map((b) => (
              <p key={b.id} className="opi-thesis opi-rise">
                {b.text}
              </p>
            ))}
            {grandes.length > 0 && (
              <div className="opi-figs">
                {grandes.map((f, i) => (
                  <div key={i} className="opi-fig opi-rise">
                    <p className="opi-fig__big">
                      <Cifra v={f.v} />
                    </p>
                    <p className="opi-fig__label">{f.label}</p>
                    {f.src && <p className="opi-fig__src">Fuente: {f.src}</p>}
                  </div>
                ))}
              </div>
            )}
            {notaCifras.map((b) => (
              <p key={b.id} className="opi-figs__note opi-just">
                {b.text}
              </p>
            ))}
          </div>
        </section>
      )}

      {!soloRelato && portada && <Foto f={portada} nota={nota.get(portada.news_id)} slot="portada" className="opi-cover" cortina />}

      {hicimos.length > 0 && (
        <section className="ors-sec opi-sec" id="ors-relato" aria-labelledby="opi-relato-h">
          <div className="odsx-wrap">
            <header className="opi-head">
              <Titular id="opi-relato-h" text={`Lo que hicimos en ${edicion}`} />
            </header>
            <div className="opi-story">
              {hicimos.map((b, i) => {
                const nums = Array.from(new Set(b.sources.map((s) => refs.get(s.news_id) ?? 0)))
                  .filter(Boolean)
                  .sort((a, c) => a - c);
                const idDe = (k: number) => [...refs.entries()].find(([, v]) => v === k)?.[0] ?? "";
                return (
                  <div key={b.id} className="opi-unit">
                    {margenDe.has(i) && <aside className="opi-side">{margenDe.get(i)}</aside>}
                    <p className="opi-p opi-just opi-rise">
                      {b.text}
                      {nums.length > 0 && (
                        <sup className="opi-refs">
                          {nums.map((k, j) => (
                            <span key={k}>
                              {j > 0 && ","}
                              <a href={`#osn-${idDe(k)}`} aria-label={`Fuente ${k}: la nota en el carrusel de noticias`}>
                                {k}
                              </a>
                            </span>
                          ))}
                        </sup>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
            {galeria.length > 0 && (
              <div className="opi-gallery">
                {galeria.map((f) => (
                  <Foto key={f.news_id} f={f} nota={nota.get(f.news_id)} slot="galeria" className="opi-gshot opi-rise" />
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
              <Titular id="opi-proy-h" text="Proyectos que lo hacen posible" />
            </header>
            <ul className="opi-proj">
              {proyectos.map((b) => {
                const p = partirProyecto(b.text);
                return (
                  <li key={b.id} className="opi-rise">
                    {p.nombre && <b>{p.nombre}</b>}
                    <span>{p.texto}</span>
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
            <p className="opi-next__k">Hacia la próxima edición</p>
            <Titular id="opi-viene-h" text={viene.map((b) => b.text).join(" ")} />
          </div>
        </section>
      )}
    </div>
  );
}

/** El cuerpo del informe en el portal: las imágenes salen de las notas aprobadas del ODS. */
export function OdsPilo({ o, informe, soloRelato = false }: { o: Ods; informe: InformePublico; soloRelato?: boolean }) {
  const q = useApprovedNews(o.n);
  const notas: NotaInforme[] = (q.data ?? []).map((n) => ({ id: n.id, image_url: n.image_url, title: n.title }));
  return <OdsPiloCuerpo o={o} informe={informe} notas={notas} soloRelato={soloRelato} />;
}

/** Recortes del informe por nota, para que el carrusel use el mismo punto de interés. */
export function recortesDe(informe: InformePublico | null | undefined) {
  const r: Record<string, InformePublico["fotos"][number]["crop"]> = {};
  for (const f of informe?.fotos ?? []) r[f.news_id] = f.crop;
  return r;
}
