/* =============================================================================
   Boletín PDF de los informes ODS · el documento.

   Se arma con los informes PUBLICADOS de Pilo Publica (no con textos aparte):
   portada, presentación rectoral, contenido y, por cada ODS, sus cifras
   destacadas, la narrativa por ejes con las imágenes elegidas, los gráficos y los
   proyectos. Lo que el informe público muestra es lo que sale aquí, y nunca se
   inventa un número: todo viene del libro de cifras de cada informe.

   Es un solo documento en flujo (no hojas fijas): el navegador lo reparte en
   páginas A4 al imprimir (boletin.css: @page, saltos y bloques que no se parten).
   Se usa dos veces: la vista previa del admin y la copia que se imprime.
   ========================================================================== */

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { Grafica } from "../publica/graficas";
import { useInformePublico } from "../publica/datos";
import { aInformePublico } from "../../sostenible/ods-informe";
import { ODS_CURRENT, ODS_LIST, RECTOR, rectorParagraphs } from "../../sostenible/ods-data";
import type { Ods } from "../../sostenible/ods-data";
import { odsTone } from "../../sostenible/OdsArt";
import type { PerfilOficina, PortadaDiseno } from "../../informes/vista/perfil";
import { PortadaPagina } from "./PortadaPagina";
import type { Lang } from "../../sostenible/i18n";
import type { Cifra, GraficoPub, InformePublico } from "../informes/tipos";
import "./boletin.css";

export type FuenteBoletin = "Open Sans" | "Montserrat";

export interface OpcionesBoletin {
  edicion: number;
  lang: Lang;
  acento: string;
  fuente: FuenteBoletin;
  rector: string;
  paginas: { portada: boolean; presentacion: boolean; indice: boolean; contraportada: boolean };
  partes: { cifras: boolean; imagenes: boolean; narrativa: boolean; graficos: boolean; proyectos: boolean };
  /** Cuántas cifras destacadas por ODS (máximo 12). */
  maxCifras: number;
  /** La portada: el diseño de Informes Institucionales (editable en el admin). */
  portada: PortadaDiseno;
  perfil: PerfilOficina;
  /** En la vista previa la hoja se achica al ancho disponible; al imprimir va a tamaño de papel. */
  escalarPortada: boolean;
}

const L = {
  es: {
    eyebrow: "Informes ODS · THE Impact Rankings",
    titulo: "Contribución de la UDES a los Objetivos de Desarrollo Sostenible",
    oficina: "Universidad de Santander · Oficina de Planeación",
    incluidos: (n: number) => (n === 1 ? "1 ODS incluido" : `${n} ODS incluidos`),
    presentacion: "Presentación rectoral",
    contenido: "Contenido",
    cifras: "Cifras destacadas",
    datos: "Los datos que respaldan el informe",
    proyectos: "Proyectos",
    viene: `Lo que viene en ${ODS_CURRENT + 1}`,
    fuente: "Fuente",
    contra: "Cifras oficiales con su corte y procedencia.",
    ods: "ODS",
  },
  en: {
    eyebrow: "SDG reports · THE Impact Rankings",
    titulo: "UDES's contribution to the Sustainable Development Goals",
    oficina: "Universidad de Santander · Planning Office",
    incluidos: (n: number) => (n === 1 ? "1 SDG included" : `${n} SDGs included`),
    presentacion: "Message from the Rector",
    contenido: "Contents",
    cifras: "Key figures",
    datos: "The data behind the report",
    proyectos: "Projects",
    viene: `What comes in ${ODS_CURRENT + 1}`,
    fuente: "Source",
    contra: "Official figures with their cut-off and provenance.",
    ods: "SDG",
  },
} as const;

/** Un texto en el idioma pedido; si falta el inglés, el español. */
const pick = (lang: Lang, es: string | undefined, en: string | undefined): string => (lang === "en" && en?.trim() ? en : (es ?? ""));

const corto = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

interface Eje {
  id: string;
  heading: string;
  heading_en: string;
  parrafos: { es: string; en: string }[];
  figs: Cifra[];
}

/** Los párrafos del informe, agrupados por eje y en su orden. */
function ejesDe(inf: InformePublico): Eje[] {
  const mapa = new Map<string, Eje>();
  for (const b of inf.bloques.filter((x) => x.sec === "hicimos")) {
    const id = b.eje ?? b.id;
    const e = mapa.get(id) ?? { id, heading: b.heading ?? "", heading_en: b.heading_en ?? "", parrafos: [], figs: [] };
    e.parrafos.push({ es: b.text, en: b.text_en ?? "" });
    e.figs.push(...(b.figs ?? []));
    mapa.set(id, e);
  }
  return [...mapa.values()];
}

function Cifras({ figs, lang }: { figs: Cifra[]; lang: Lang }) {
  if (!figs.length) return null;
  return (
    <div className="bpf-cifras" role="list">
      {figs.map((f, i) => {
        const desc = pick(lang, f.desc, f.desc_en);
        return (
          <div className="bpf-cifra" role="listitem" key={`${f.label}-${i}`}>
            <b className="bpf-cifra__v">
              {f.v}
              {f.unit && <small> {f.unit}</small>}
            </b>
            <span className="bpf-cifra__l">
              {pick(lang, f.label, f.label_en)}
              {f.year ? ` · ${f.year}` : ""}
            </span>
            {desc && <span className="bpf-cifra__d">{corto(desc, 120)}</span>}
            <span className="bpf-cifra__s">{pick(lang, f.src, f.src_en)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Graficos({ graficos, lang, uid }: { graficos: GraficoPub[]; lang: Lang; uid: string }) {
  const con = graficos.filter((g) => g.puntos.some((p) => p.v !== null));
  if (!con.length) return null;
  return (
    <div className="bpf-graficos">
      {con.map((g, i) => (
        <figure className="bpf-gr" key={g.id}>
          <figcaption className="bpf-gr__t">{pick(lang, g.titulo, g.titulo_en)}</figcaption>
          <Grafica tipo={g.tipo} puntos={g.puntos} unidad={g.unidad} titulo={pick(lang, g.titulo, g.titulo_en)} idioma={lang} uid={`${uid}-${i}`} />
          <p className="bpf-gr__s">
            {L[lang].fuente}: {pick(lang, g.fuente, g.fuente_en)}
          </p>
        </figure>
      ))}
    </div>
  );
}

/** El informe de un ODS. Devuelve null si ese ODS no tiene informe (el panel ya lo avisa). */
function SeccionOds({ ods, opts }: { ods: Ods; opts: OpcionesBoletin }) {
  const q = useInformePublico("impact", String(ods.n), opts.edicion);
  const inf = useMemo(() => (q.data ? aInformePublico(q.data, ods.n) : null), [q.data, ods.n]);
  if (!q.data || !inf) return null;
  const { lang, partes } = opts;
  const t = L[lang];
  const informe = q.data.informe;
  const tesis = inf.bloques.find((b) => b.sec === "tesis");
  const notas = inf.bloques.filter((b) => b.sec === "cifras" && b.text.trim());
  const figs = inf.bloques.filter((b) => b.sec === "cifras").flatMap((b) => b.figs ?? []).slice(0, Math.max(0, Math.min(12, opts.maxCifras)));
  const ejes = ejesDe(inf);
  const fotos = (inf.fotos ?? []).filter((f) => f.url);
  const principal = fotos.find((f) => !f.eje) ?? fotos[0];
  const deEje = (id: string) => fotos.find((f) => f.eje === id && f !== principal);
  const proyectos = inf.bloques.filter((b) => b.sec === "proyectos");
  const viene = inf.bloques.filter((b) => b.sec === "viene");
  const tonos = { ...odsTone(ods.color), "--c": ods.color } as CSSProperties;

  return (
    <section className="bpf-ods" id={`bpf-ods-${ods.n}`} style={tonos} aria-labelledby={`bpf-ods-${ods.n}-t`}>
      <header className="bpf-ods__hd">
        <span className="bpf-ods__n" aria-hidden="true">
          {ods.n}
        </span>
        <div>
          <small>
            {t.ods} {ods.n} · {opts.edicion}
          </small>
          <h2 id={`bpf-ods-${ods.n}-t`}>{ods.name}</h2>
        </div>
      </header>

      <h3 className="bpf-titulo">{pick(lang, informe.title_es, informe.title_en)}</h3>
      {tesis && <p className="bpf-tesis">{pick(lang, tesis.text, tesis.text_en)}</p>}
      {notas.map((b) => (
        <p className="bpf-p" key={b.id}>
          {pick(lang, b.text, b.text_en)}
        </p>
      ))}

      {partes.cifras && figs.length > 0 && (
        <>
          <h4 className="bpf-h4">{t.cifras}</h4>
          <Cifras figs={figs} lang={lang} />
        </>
      )}

      {partes.imagenes && principal?.url && (
        <figure className="bpf-foto bpf-foto--principal">
          <img src={principal.url} alt={pick(lang, principal.alt, principal.alt_en)} loading="eager" decoding="sync" />
          <figcaption>
            {pick(lang, principal.caption, principal.caption_en)}
            {principal.credit ? ` · ${principal.credit}` : ""}
          </figcaption>
        </figure>
      )}

      {partes.narrativa &&
        ejes.map((e) => {
          const foto = partes.imagenes ? deEje(e.id) : undefined;
          return (
            <article className="bpf-eje" key={e.id}>
              <h4 className="bpf-h4">{pick(lang, e.heading, e.heading_en)}</h4>
              <div className="bpf-eje__cols">
                {e.parrafos.map((p, i) => (
                  <p className="bpf-p" key={i}>
                    {pick(lang, p.es, p.en)}
                  </p>
                ))}
              </div>
              {e.figs.length > 0 && partes.cifras && <Cifras figs={e.figs.slice(0, 3)} lang={lang} />}
              {foto?.url && (
                <figure className="bpf-foto">
                  <img src={foto.url} alt={pick(lang, foto.alt, foto.alt_en)} loading="eager" decoding="sync" />
                  <figcaption>
                    {pick(lang, foto.caption, foto.caption_en)}
                    {foto.credit ? ` · ${foto.credit}` : ""}
                  </figcaption>
                </figure>
              )}
            </article>
          );
        })}

      {partes.graficos && inf.graficos && inf.graficos.length > 0 && (
        <>
          <h4 className="bpf-h4">{t.datos}</h4>
          <Graficos graficos={inf.graficos} lang={lang} uid={`b${ods.n}`} />
        </>
      )}

      {partes.proyectos && proyectos.length > 0 && (
        <>
          <h4 className="bpf-h4">{t.proyectos}</h4>
          <ul className="bpf-lista">
            {proyectos.map((b) => (
              <li key={b.id}>{pick(lang, b.text, b.text_en)}</li>
            ))}
          </ul>
        </>
      )}
      {partes.proyectos && viene.length > 0 && (
        <>
          <h4 className="bpf-h4">{t.viene}</h4>
          <ul className="bpf-lista">
            {viene.map((b) => (
              <li key={b.id}>{pick(lang, b.text, b.text_en)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** El boletín completo de los ODS elegidos. `disponibles`: los que tienen informe publicado (los demás se omiten). */
export function DocumentoBoletin({ incluidos, opts }: { incluidos: readonly number[]; opts: OpcionesBoletin }) {
  const t = L[opts.lang];
  const sel = ODS_LIST.filter((o) => incluidos.includes(o.n));
  const style = { "--ba": opts.acento, "--bf": `'${opts.fuente}', sans-serif` } as CSSProperties;
  const ps = rectorParagraphs(opts.rector);
  return (
    <div className="bpf-doc" style={style} lang={opts.lang}>
      {opts.paginas.portada && (
        <section className="bpf-cover" aria-label={t.titulo}>
          <PortadaPagina portada={opts.portada} perfil={opts.perfil} escalar={opts.escalarPortada} />
        </section>
      )}

      {opts.paginas.presentacion && (
        <section className="bpf-pres" aria-labelledby="bpf-pres-t">
          <small>{t.presentacion}</small>
          <h2 id="bpf-pres-t">{RECTOR.title}</h2>
          <p className="bpf-p">{ps[0] ?? ""}</p>
          <blockquote className="bpf-cita">{RECTOR.quote}</blockquote>
          {ps.slice(1).map((x, k) => (
            <p className="bpf-p" key={k}>
              {x}
            </p>
          ))}
          <p className="bpf-firma">
            <b>{RECTOR.name}</b>
            <br />
            {RECTOR.role}
          </p>
        </section>
      )}

      {opts.paginas.indice && (
        <section className="bpf-indice" aria-labelledby="bpf-ind-t">
          <h2 id="bpf-ind-t">{t.contenido}</h2>
          <ol>
            {sel.map((o) => (
              <li key={o.n} style={{ "--c": o.color } as CSSProperties}>
                <u>{o.n}</u>
                <span>{o.name}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {sel.map((o) => (
        <SeccionOds key={o.n} ods={o} opts={opts} />
      ))}

      {opts.paginas.contraportada && (
        <section className="bpf-contra">
          <h2>Universidad de Santander</h2>
          <p>
            {t.oficina.split(" · ")[1]} · {t.contra}
          </p>
          <p>planeacion.udes.edu.co</p>
        </section>
      )}
    </div>
  );
}
