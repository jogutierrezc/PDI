/* =============================================================================
   Pilo Publica · el informe completo, desde datos ya cargados.

   Lo usan la vista previa de la intranet (compacto, con avisos de lo que falta)
   y la página pública. Recibe el idioma (es|en): lo que no esté traducido se
   muestra en español y se marca con lang="es". Las cifras se resuelven contra
   el libro; una cifra que falta se avisa en la intranet y se omite en público.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useAnimarInforme, reducido } from "./animar";
import { Grafica } from "./graficas";
import { CATALOGO, ajustesDe, elegir, errorEnlaceHttps, formato, nombreUnidad, ordenDe, parrafos, rankingDe, resolverSerie, varsAcento } from "./tipos";
import type { BloquePP, CifraPub, Idioma, InformePP, SeccionVista, UnidadPP } from "./tipos";
import type { Medios } from "./datos";
import { SDG } from "../../sostenible/data";

const T = {
  es: {
    kpis: "Cifras clave",
    datos: "Datos que lo respaldan",
    ejesImpact: "Ejes de impacto UDES",
    ejes: "Lo que hace la UDES",
    eje: "EJE",
    noticias: "Conoce más: noticias relacionadas",
    ver: "Ver la noticia completa",
    ant: "Anterior",
    sig: "Siguiente",
    univ: "Universidad de Santander",
    unit: "Objetivo de Desarrollo Sostenible",
    edicion: "Edición",
    fuente: "Fuente: Universidad de Santander, cifras verificadas",
    falta: "Falta la cifra",
    sinDato: "Este gráfico no tiene datos todavía.",
    portada: "Portada del informe",
    carrusel: "Noticias relacionadas",
  },
  en: {
    kpis: "Key figures",
    datos: "The data behind it",
    ejesImpact: "UDES impact axes",
    ejes: "What UDES does",
    eje: "AXIS",
    noticias: "Learn more: related news",
    ver: "Read the full story",
    ant: "Previous",
    sig: "Next",
    univ: "Universidad de Santander",
    unit: "Sustainable Development Goal",
    edicion: "Edition",
    fuente: "Source: Universidad de Santander, verified figures",
    falta: "Missing figure",
    sinDato: "This chart has no data yet.",
    portada: "Report cover",
    carrusel: "Related news",
  },
} as const;

export interface VistaProps {
  informe: Pick<InformePP, "ranking" | "unit_key" | "edition" | "settings" | "title_es" | "title_en" | "lead_es" | "lead_en">;
  unidad: UnidadPP;
  bloques: BloquePP[];
  cifras: Map<string, CifraPub>;
  medios: Medios;
  idioma: Idioma;
  /** Vista previa dentro de la intranet: sin scroll atado, con avisos. */
  compacto?: boolean;
}

const dec = (v: number) => Math.min(2, (String(v).split(".")[1] ?? "").length);
const porPos = (a: BloquePP, b: BloquePP) => a.pos - b.pos;

interface ImagenResuelta {
  src: string;
  alt: string;
  caption: string;
  credit?: string | null;
  creditUrl?: string | null;
}

/** La imagen con su pie. Si no carga, no deja un hueco: avisa al padre y no se dibuja. */
function Fig({ src, alt, caption, credit, creditUrl, onFallo }: ImagenResuelta & { onFallo: () => void }) {
  const enlace = creditUrl && !errorEnlaceHttps(creditUrl) ? creditUrl : null;
  return (
    <figure className="pp-fig">
      <div className="pp-clip">
        <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={onFallo} />
      </div>
      {(caption || credit) && (
        <figcaption>
          {caption}
          {credit ? (
            <>
              {caption ? " · " : ""}
              {enlace ? (
                <a href={enlace} target="_blank" rel="noopener noreferrer">
                  {credit}
                </a>
              ) : (
                credit
              )}
            </>
          ) : null}
        </figcaption>
      )}
    </figure>
  );
}

/** Un párrafo es una cita si va entre comillas de principio a fin. */
const esCita = (t: string): boolean => /^[«“"].{20,}[»”"]$/s.test(t.trim());

/** Un eje: título, párrafos con ritmo, cifras destacadas y su imagen (que se oculta si falla). */
function Eje({ e, i, idioma, im, cifras, etiqueta }: { e: BloquePP; i: number; idioma: Idioma; im: ImagenResuelta | null; cifras: Map<string, CifraPub>; etiqueta: string }) {
  const [fallo, setFallo] = useState(false);
  const h = elegir(e.heading_es, e.heading_en, idioma);
  const t = elegir(e.text_es, e.text_en, idioma);
  const ps = parrafos(t.t);
  const mostrar = im && !fallo ? im : null;
  const destacadas = (e.figs ?? [])
    .map((k) => cifras.get(k))
    .filter((c): c is CifraPub => Boolean(c) && c!.value !== null)
    .slice(0, 2);
  // las cifras destacadas van tras el segundo párrafo (o el primero, si el texto es corto)
  const despuesDe = ps.length > 2 ? 1 : 0;
  const tarjeta = destacadas.length ? (
    <aside className="pp-stat" key="stat" aria-label={idioma === "en" ? "Key figures of this axis" : "Cifras de este eje"}>
      {destacadas.map((c) => {
        const et = elegir(c.label, c.label_en, idioma);
        const pct = c.unit.trim() === "%";
        return (
          <div key={c.key}>
            <b>
              {formato(c.value as number, idioma, dec(c.value as number))}
              {pct ? " %" : ""}
            </b>
            <span lang={et.lang}>{et.t}</span>
            <em>{[c.year, !pct ? c.unit : ""].filter(Boolean).join(" · ")}</em>
          </div>
        );
      })}
    </aside>
  ) : null;
  return (
    <article className={`pp-axis${i % 2 ? " pp-axis--rev" : ""}${mostrar ? "" : " pp-axis--solo"}`}>
      <div>
        <span className="pp-tag">
          {etiqueta} {i + 1}
        </span>
        {h.t && <h3 lang={h.lang}>{h.t}</h3>}
        <div className="pp-body" lang={t.lang}>
          {ps.flatMap((x, k) => {
            const nodo = esCita(x) ? (
              <blockquote key={k}>
                <p>{x}</p>
              </blockquote>
            ) : (
              <p key={k}>{x}</p>
            );
            return k === despuesDe && tarjeta ? [nodo, tarjeta] : [nodo];
          })}
        </div>
      </div>
      {mostrar && <Fig {...mostrar} onFallo={() => setFallo(true)} />}
    </article>
  );
}

export function InformeVista({ informe, unidad, bloques, cifras, medios, idioma, compacto = false }: VistaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const L = T[idioma];
  const aj = ajustesDe(informe);
  const rk = rankingDe(informe.ranking);
  const impact = informe.ranking === "impact";
  const activos = useMemo(() => bloques.filter((b) => b.enabled).sort(porPos), [bloques]);
  const clave = activos.map((b) => b.id).join(",") + `|${aj.cols}|${aj.cover}|${informe.unit_key}`;
  useAnimarInforme(ref, { movimiento: aj.motion, compacto, clave, idioma });

  const kpis = activos.filter((b) => b.kind === "kpi");
  const graficos = activos.filter((b) => b.kind === "grafico");
  const textos = activos.filter((b) => b.kind === "texto");
  const imagenes = activos.filter((b) => b.kind === "imagen");
  const ejes = textos.filter((b) => b.sec !== "portada");
  const portada = textos.find((b) => b.sec === "portada");

  const titulo = elegir(informe.title_es || nombreUnidad(informe.ranking, unidad, "es"), informe.title_en || nombreUnidad(informe.ranking, unidad, "en"), idioma);
  const leadBase = informe.lead_es || portada?.text_es || "";
  const leadEn = informe.lead_en || portada?.text_en || "";
  const lead = elegir(leadBase, leadEn, idioma);

  // imagen de cada eje: la que lo nombra (spec.eje) o, si no, por orden
  const imagenDeEje = useMemo(() => {
    const m = new Map<string, BloquePP>();
    // las manuales (por enlace) van primero: son decisión de una persona
    const ordenadas = [...imagenes].sort((a, b) => Number(Boolean(b.spec.url)) - Number(Boolean(a.spec.url)));
    const sueltas = ordenadas.filter((i) => !i.spec.eje || !ejes.some((e) => e.id === i.spec.eje));
    for (const i of ordenadas) if (i.spec.eje && ejes.some((e) => e.id === i.spec.eje) && !m.has(i.spec.eje)) m.set(i.spec.eje, i);
    for (const e of ejes) if (!m.has(e.id)) {
      const s = sueltas.shift();
      if (s) m.set(e.id, s);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depende de los bloques activos
  }, [activos]);

  const resolverImagen = (b: BloquePP | undefined): ImagenResuelta | null => {
    if (!b) return null;
    if (b.spec.url) {
      if (errorEnlaceHttps(b.spec.url)) return null; // nunca se dibuja algo que no sea https
      const cap = elegir(b.spec.caption_es ?? "", b.spec.caption_en ?? "", idioma).t;
      const alt = elegir(b.spec.alt_es ?? "", b.spec.alt_en ?? "", idioma).t || cap;
      return { src: b.spec.url, alt, caption: cap, credit: b.spec.credit || null, creditUrl: b.spec.credit_url || null };
    }
    const img = (b.spec.image_id && medios.imagenes.get(b.spec.image_id)) || (b.spec.news_id ? medios.deNoticia.get(b.spec.news_id)?.[0] : undefined);
    const n = b.spec.news_id ? medios.noticias.get(b.spec.news_id) : undefined;
    const src = img?.url ?? n?.image_url ?? null;
    if (!src) return null;
    const cap = b.spec.caption || img?.caption || (n ? elegir(n.title, n.title_en ?? "", idioma).t : "");
    return { src, alt: img?.alt || cap, caption: cap, credit: img?.credit ?? null };
  };

  const noticias = useMemo(() => {
    const vistos = new Set<string>();
    const out = [];
    for (const b of imagenes) {
      const id = b.spec.news_id;
      const n = id ? medios.noticias.get(id) : undefined;
      if (!n || vistos.has(n.id)) continue;
      vistos.add(n.id);
      out.push(n);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activos, medios]);

  const carril = useRef<HTMLDivElement>(null);
  const mover = (d: number) => carril.current?.scrollBy({ left: d * 320, behavior: reducido() ? "auto" : "smooth" });

  const franja: { color: string; on: boolean }[] = impact
    ? SDG.map((s, i) => ({ color: s.color, on: String(i + 1) === informe.unit_key }))
    : (rk ?? CATALOGO[0]).units.map((u) => ({ color: u.color, on: u.key === informe.unit_key }));

  const motivo = (
    <div className="pp-motif" aria-hidden="true">
      <svg viewBox="0 0 400 400">
        <g className="pp-rings">
          <circle cx="200" cy="200" r="190" fill="none" style={{ stroke: "var(--pp-k)" }} strokeOpacity=".22" strokeWidth="1.5" strokeDasharray="3 9" />
          <circle cx="200" cy="200" r="150" fill="none" style={{ stroke: "var(--pp-k)" }} strokeOpacity=".35" strokeWidth="1.5" />
        </g>
        <g className="pp-rings2">
          <circle cx="200" cy="50" r="9" style={{ fill: "var(--pp-k)" }} />
          <circle cx="350" cy="200" r="6" style={{ fill: "var(--pp-k)" }} fillOpacity=".5" />
          <circle cx="90" cy="305" r="7" style={{ fill: "var(--pp-k)" }} fillOpacity=".7" />
        </g>
        <rect className="pp-tile" x="110" y="110" width="180" height="180" rx="34" style={{ fill: "var(--pp-k)" }} />
        <text x="200" y={impact ? 228 : 215} textAnchor="middle" fontWeight="800" fontSize={impact ? 112 : unidad.short.length > 1 ? 60 : 84} style={{ fill: "var(--pp-ko)" }}>
          {unidad.short}
        </text>
        {impact && (
          <text x="200" y="262" textAnchor="middle" fontWeight="600" fontSize="12" letterSpacing="2.4" style={{ fill: "var(--pp-ko)" }} fillOpacity=".85">
            {idioma === "en" ? "SDG" : "ODS"}
          </text>
        )}
      </svg>
    </div>
  );

  const portadaSec = (
    <header className={`pp-cover${aj.cover === "left" ? " pp-cover--left" : ""}`} key="portada">
      <div className="pp-rp pp-cover__in">
        <div>
          <div className="pp-eyebrow">
            {rk?.name} · {impact ? L.unit : idioma === "en" ? rk?.unitLabelEn : rk?.unitLabel}
          </div>
          <h1 lang={titulo.lang}>
            <span className="pp-ln">
              <span>{titulo.t}</span>
            </span>
          </h1>
          {lead.t && (
            <p className="pp-lead" lang={lead.lang}>
              {lead.t}
            </p>
          )}
          <div className="pp-meta">
            <span>
              <b>{L.univ}</b>
            </span>
            <span>
              {L.edicion} {informe.edition}
            </span>
          </div>
        </div>
        {motivo}
      </div>
    </header>
  );

  const kpiSec = (() => {
    const tarjetas = kpis
      .map((b) => {
        const c = b.spec.cifra ? cifras.get(b.spec.cifra) : undefined;
        if (!c || c.value === null) return compacto ? (
          <div className="pp-kc pp-kc--falta" key={b.id}>
            <b>—</b>
            <span>
              {L.falta}: <code>{b.spec.cifra ?? "?"}</code>
            </span>
          </div>
        ) : null;
        const pct = c.unit.trim() === "%";
        const d = dec(c.value);
        const et = elegir(c.label, c.label_en, idioma);
        return (
          <div className="pp-kc" key={b.id}>
            <b data-n={c.value} data-dec={d} data-sfx={pct ? " %" : ""} data-lang={idioma}>
              {formato(c.value, idioma, d)}
              {pct ? " %" : ""}
            </b>
            <span lang={et.lang}>{et.t}</span>
            <em>
              {[c.year, !pct ? c.unit : ""].filter(Boolean).join(" · ")}
            </em>
          </div>
        );
      })
      .filter(Boolean);
    if (!tarjetas.length) return null;
    return (
      <section className="pp-sec" key="kpis" aria-labelledby="pp-h-kpis">
        <div className="pp-rp">
          <h2 id="pp-h-kpis">{L.kpis}</h2>
          <span className="pp-ul" />
          <div className="pp-kgrid">{tarjetas}</div>
        </div>
      </section>
    );
  })();

  const grafSec = (() => {
    const tarjetas = graficos
      .map((b, n) => {
        const s = resolverSerie(b.spec, cifras);
        const tit = elegir(b.spec.title_es ?? "", b.spec.title_en ?? "", idioma);
        const hay = s.puntos.some((p) => p.v !== null);
        if (!hay && !compacto) return null;
        const tipo = b.spec.chart ?? "bar";
        const rango = s.puntos.length > 1 && tipo !== "donut" ? `${s.puntos[0].x} – ${s.puntos[s.puntos.length - 1].x}` : (s.puntos[s.puntos.length - 1]?.x ?? "");
        return (
          <div className="pp-cc" key={b.id}>
            <h3 lang={tit.lang}>{tit.t || "—"}</h3>
            <p>{rango}</p>
            {hay ? <Grafica tipo={tipo} puntos={s.puntos} unidad={s.unidad} titulo={tit.t} idioma={idioma} uid={`${b.id}-${n}`} /> : <p className="pp-aviso">{L.sinDato}</p>}
            {compacto && s.faltan.length > 0 && (
              <p className="pp-aviso">
                {L.falta}: <code>{s.faltan.join(", ")}</code>
              </p>
            )}
            <div className="pp-src">{L.fuente}</div>
          </div>
        );
      })
      .filter(Boolean);
    if (!tarjetas.length) return null;
    return (
      <section className="pp-sec pp-sec--wash" key="graficos" aria-labelledby="pp-h-graf">
        <div className="pp-rp">
          <h2 id="pp-h-graf">{L.datos}</h2>
          <span className="pp-ul" />
          <div className="pp-cgrid">{tarjetas}</div>
        </div>
      </section>
    );
  })();

  const ejesSec = ejes.length ? (
    <section className={`pp-sec${aj.cols === 2 ? " pp-cols2" : ""}`} key="ejes" aria-labelledby="pp-h-ejes">
      <div className="pp-rp">
        <h2 id="pp-h-ejes">{impact ? L.ejesImpact : L.ejes}</h2>
        <span className="pp-ul" />
        {ejes.map((e, i) => (
          <Eje key={e.id} e={e} i={i} idioma={idioma} im={resolverImagen(imagenDeEje.get(e.id))} cifras={cifras} etiqueta={L.eje} />
        ))}
      </div>
    </section>
  ) : null;

  const notSec = noticias.length ? (
    <section className="pp-sec pp-sec--wash" key="noticias" aria-labelledby="pp-h-not">
      <div className="pp-rp">
        <div className="pp-car-h">
          <div>
            <h2 id="pp-h-not">{L.noticias}</h2>
            <span className="pp-ul" />
          </div>
          <div className="pp-car-btn">
            <button type="button" className="pp-btn pp-btn--sm" onClick={() => mover(-1)} aria-label={L.ant}>
              ←
            </button>
            <button type="button" className="pp-btn pp-btn--sm" onClick={() => mover(1)} aria-label={L.sig}>
              →
            </button>
          </div>
        </div>
        <div className="pp-car" ref={carril} role="region" aria-label={L.carrusel} tabIndex={0}>
          {noticias.map((n) => {
            const img = medios.deNoticia.get(n.id)?.[0]?.url ?? n.image_url;
            const tt = elegir(n.title, n.title_en ?? "", idioma);
            const ex = elegir(n.excerpt, n.excerpt_en ?? "", idioma);
            return (
              <article className="pp-news" key={n.id}>
                {img ? <img src={img} alt="" loading="lazy" decoding="async" /> : <span className="pp-news__ph" aria-hidden="true" />}
                <div className="pp-news__b">
                  {n.published_on && <time dateTime={n.published_on}>{n.published_on}</time>}
                  <h4 lang={tt.lang}>{tt.t}</h4>
                  {ex.t && <p lang={ex.lang}>{ex.t.length > 180 ? ex.t.slice(0, 177) + "…" : ex.t}</p>}
                  <a href={n.url} target="_blank" rel="noopener noreferrer">
                    {L.ver} →
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  ) : null;

  const mapa: Record<SeccionVista, ReactNode> = { kpis: kpiSec, graficos: grafSec, ejes: ejesSec, noticias: notSec };
  const orden = ordenDe(aj).filter((s) => !(aj.off ?? []).includes(s));

  return (
    <div ref={ref} className={`pp-report${compacto ? " pp-report--compacto" : ""}`} style={varsAcento(unidad) as CSSProperties} lang={idioma}>
      <div className="pp-strip" aria-hidden="true">
        {franja.map((f, i) => (
          <i key={i} className={f.on ? "on" : ""} style={{ background: f.color }} />
        ))}
      </div>
      <div className="pp-prog" aria-hidden="true">
        <b />
      </div>
      {portadaSec}
      {orden.map((s) => mapa[s])}
      <footer className="pp-foot">
        <div className="pp-rp">
          <span>{L.univ} · Planeación y Sostenibilidad</span>
          <span>
            {rk?.name} · {nombreUnidad(informe.ranking, unidad, idioma)} · {informe.edition}
          </span>
        </div>
      </footer>
    </div>
  );
}
