/* =============================================================================
   UDES Sostenible · de dónde sale el informe de un ODS de THE Impact.

   Hay dos fuentes y una sola forma (`InformePublico`, la del modelo de siempre):

     1. Pilo Publica (pp_informes, migración 0262), si hay un informe PUBLICADO
        para (impact, ODS, edición). Se convierte aquí a la forma de siempre.
     2. Si no, el modelo viejo (ods_reports) tal cual, con `usePublicInforme`.

   Así el diseño «cartel» no cambia: Pilo Publica solo escribe sobre él.

   Mapeo nuevo → viejo
     lead (o bloque portada)    → `tesis` (primer párrafo; los demás, nota de cifras)
     bloque kpi + libro         → `cifras`: una Cifra por kpi (valor, unidad, año,
                                  etiqueta, descripción y fuente), bilingüe
     bloque texto (eje)         → `hicimos`: un bloque por párrafo, todos con el
                                  encabezado del eje (`heading`) y su `eje`
     bloque texto sec proyectos → `proyectos`; sec viene → `viene`
     bloque imagen              → fotos (enlace manual o imagen de la noticia),
                                  acompañando a su eje (`eje`)
     bloque grafico             → `graficos` (sección «Datos»)

   Si falta el inglés, el español (con la marca «ES» que ya pone el diseño).
   Sin informe nuevo: sale el viejo, sin tocarlo.
   ========================================================================== */

import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { usePublicInforme } from "../rankings/informes/datos";
import type { Cifra, GraficoPub, InformePublico } from "../rankings/informes/tipos";
import { useInformePublico } from "../rankings/publica/datos";
import type { InformePublicoCompleto, Medios } from "../rankings/publica/datos";
import { errorEnlaceHttps, parrafos, resolverSerie } from "../rankings/publica/tipos";
import type { BloquePP, CifraPub } from "../rankings/publica/tipos";
import { fmtN } from "./OdsReportParts";

type BloquePubl = InformePublico["bloques"][number];
type FotoPubl = InformePublico["fotos"][number];

const FUENTE_ES = "Universidad de Santander, cifras verificadas";
const FUENTE_EN = "Universidad de Santander, verified figures";

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const decimales = (v: number) => Math.min(2, (String(v).split(".")[1] ?? "").length);

/** Procedencia de una cifra: «Oficina · tabla», si el libro la trae. */
function procedencia(c: CifraPub | undefined): string {
  const s = c?.source;
  if (!s) return "";
  const of = texto(s.oficina);
  const tb = texto(s.tabla);
  // Las cifras de un documento dicen además la página u hoja («p. 12», «Hoja «X» · celda C14»).
  const lugar = texto(s.ubicacion);
  return [of, tb, lugar].filter(Boolean).join(" · ");
}

/** Una cifra del libro como la «Cifra» del diseño. El valor va en formato español (así lo lee `parseFigure`). */
function aCifra(c: CifraPub): Cifra | null {
  if (c.value === null || !Number.isFinite(c.value)) return null;
  const pct = c.unit.trim() === "%";
  const s = c.source ?? {};
  const fuente = procedencia(c);
  return {
    v: fmtN(c.value, "es", decimales(c.value)) + (pct ? " %" : ""),
    label: c.label,
    label_en: c.label_en || undefined,
    desc: texto(s.descripcion) || undefined,
    desc_en: texto(s.descripcion_en) || undefined,
    src: fuente || FUENTE_ES,
    src_en: fuente || FUENTE_EN,
    unit: !pct && c.unit.trim() ? c.unit.trim() : undefined,
    year: c.year,
  };
}

/** Pares párrafo a párrafo: si el inglés no tiene los mismos, lo que falte queda en español. */
const parejas = (es: string, en: string) => {
  const a = parrafos(es);
  const b = parrafos(en);
  return a.map((p, i) => ({ es: p, en: b[i] ?? "" }));
};

/** La imagen de un bloque: enlace manual (solo https) o la de su noticia. null si no hay con qué pintarla. */
function resolverFoto(b: BloquePP, medios: Medios): { url: string; caption: string; caption_en: string; alt: string; alt_en: string; credit: string; news_id: string } | null {
  const sp = b.spec;
  if (sp.url) {
    if (errorEnlaceHttps(sp.url)) return null;
    const cap = sp.caption_es ?? "";
    const capEn = sp.caption_en ?? "";
    return { url: sp.url, caption: cap, caption_en: capEn, alt: sp.alt_es || cap, alt_en: sp.alt_en || capEn, credit: sp.credit ?? "", news_id: b.id };
  }
  const img = (sp.image_id && medios.imagenes.get(sp.image_id)) || (sp.news_id ? medios.deNoticia.get(sp.news_id)?.[0] : undefined);
  const n = sp.news_id ? medios.noticias.get(sp.news_id) : undefined;
  const url = img?.url ?? n?.image_url ?? null;
  if (!url) return null;
  const cap = sp.caption || img?.caption || n?.title || "";
  const capEn = sp.caption || img?.caption || n?.title_en || "";
  return { url, caption: cap, caption_en: capEn, alt: img?.alt || cap, alt_en: img?.alt || capEn, credit: img?.credit ?? "", news_id: sp.news_id ?? b.id };
}

const porPos = (a: BloquePP, b: BloquePP) => a.pos - b.pos;

/** Convierte un informe de Pilo Publica a la forma que pinta el diseño del informe. */
export function aInformePublico(d: InformePublicoCompleto, ods: number): InformePublico {
  const { informe: inf, cifras, medios } = d;
  const act = d.bloques.filter((b) => b.enabled).sort(porPos);
  const textos = act.filter((b) => b.kind === "texto");
  const portada = textos.find((b) => b.sec === "portada");
  const ejes = textos.filter((b) => !["portada", "proyectos", "viene"].includes(b.sec));

  const bloques: BloquePubl[] = [];
  let pos = 0;
  const poner = (b: Omit<BloquePubl, "pos" | "sources" | "figs"> & Partial<Pick<BloquePubl, "figs">>) => bloques.push({ pos: ++pos, sources: [], figs: [], ...b });

  /* Tesis: el lead. El primer párrafo es la tesis; los demás pasan a nota de la sección de cifras. */
  const leadEs = parrafos(inf.lead_es || portada?.text_es || "");
  const leadEn = parrafos(inf.lead_en || portada?.text_en || "");
  if (leadEs[0]) poner({ id: `${inf.id}:tesis`, sec: "tesis", text: leadEs[0], text_en: leadEn[0] ?? "" });
  leadEs.slice(1).forEach((p, i) => poner({ id: `${inf.id}:lead${i}`, sec: "cifras", text: p, text_en: leadEn[i + 1] ?? "" }));

  /* Cifras clave: una Cifra por kpi. */
  const figs = act
    .filter((b) => b.kind === "kpi")
    .map((b) => (b.spec.cifra ? cifras.get(b.spec.cifra) : undefined))
    .map((c) => (c ? aCifra(c) : null))
    .filter((c): c is Cifra => c !== null)
    .slice(0, 12);
  if (figs.length) poner({ id: `${inf.id}:kpis`, sec: "cifras", text: "", figs });

  /* Imágenes: la del eje que nombran (spec.eje) o, si no, por orden; las manuales primero. Las que sobran, galería. */
  const imgs = act.filter((b) => b.kind === "imagen");
  const ordenadas = [...imgs].sort((a, b) => Number(Boolean(b.spec.url)) - Number(Boolean(a.spec.url)));
  const idsEje = new Set(ejes.map((e) => e.id));
  const sueltas = ordenadas.filter((i) => !i.spec.eje || !idsEje.has(i.spec.eje));
  const deEje = new Map<string, BloquePP>();
  for (const i of ordenadas) if (i.spec.eje && idsEje.has(i.spec.eje) && !deEje.has(i.spec.eje)) deEje.set(i.spec.eje, i);
  for (const e of ejes)
    if (!deEje.has(e.id)) {
      const s = sueltas.shift();
      if (s) deEje.set(e.id, s);
    }
  const fotos: FotoPubl[] = [];
  const recorte = { fx: 0.5, fy: 0.5, ratio: "16:9" as const };
  const poner_foto = (b: BloquePP, eje: string | undefined, slot: FotoPubl["slot"]) => {
    const f = resolverFoto(b, medios);
    if (!f) return;
    fotos.push({ news_id: f.news_id, slot, caption: f.caption, caption_en: f.caption_en, alt: f.alt, alt_en: f.alt_en, credit: f.credit, crop: recorte, image_id: null, url: f.url, eje });
  };
  for (const e of ejes) {
    const i = deEje.get(e.id);
    if (i) poner_foto(i, e.id, "n1");
  }
  const usadas = new Set([...deEje.values()].map((i) => i.id));
  for (const i of sueltas) if (!usadas.has(i.id)) poner_foto(i, undefined, "galeria");

  /* Ejes → «Qué hicimos»: un bloque por párrafo; las cifras del eje van con su segundo párrafo (al margen). */
  for (const e of ejes) {
    const ps = parejas(e.text_es, e.text_en);
    const cs = (e.figs ?? [])
      .map((k) => cifras.get(k))
      .map((c) => (c ? aCifra(c) : null))
      .filter((c): c is Cifra => c !== null)
      .slice(0, 2);
    ps.forEach((p, k) =>
      poner({
        id: `${e.id}:${k}`,
        sec: "hicimos",
        text: p.es,
        text_en: p.en,
        heading: e.heading_es,
        heading_en: e.heading_en,
        eje: e.id,
        figs: k === Math.min(ps.length - 1, ps.length > 3 ? 2 : 1) ? cs : [],
      }),
    );
  }

  /* Proyectos y «viene», si el informe los trae. */
  for (const b of textos.filter((x) => x.sec === "proyectos")) parejas(b.text_es, b.text_en).forEach((p, k) => poner({ id: `${b.id}:${k}`, sec: "proyectos", text: p.es, text_en: p.en }));
  for (const b of textos.filter((x) => x.sec === "viene")) parejas(b.text_es, b.text_en).forEach((p, k) => poner({ id: `${b.id}:${k}`, sec: "viene", text: p.es, text_en: p.en }));

  /* Gráficos. */
  const graficos: GraficoPub[] = [];
  for (const b of act.filter((x) => x.kind === "grafico")) {
    const s = resolverSerie(b.spec, cifras);
    if (!s.puntos.some((p) => p.v !== null)) continue;
    const fuentes = Array.from(new Set((b.spec.series ?? []).map((x) => procedencia(cifras.get(x.cifra))).filter(Boolean)));
    graficos.push({
      id: b.id,
      tipo: b.spec.chart ?? "bar",
      titulo: b.spec.title_es ?? "",
      titulo_en: b.spec.title_en ?? "",
      puntos: s.puntos,
      unidad: s.unidad,
      fuente: fuentes.join("; ") || FUENTE_ES,
      fuente_en: fuentes.join("; ") || FUENTE_EN,
    });
  }

  return {
    informe: { id: inf.id, ods, edition: inf.edition, updated_at: inf.updated_at },
    bloques,
    fotos,
    origen: "pilo-publica",
    graficos,
  };
}

/**
 * El informe de un ODS para el diseño cartel: el de Pilo Publica si está
 * publicado; si no, el de siempre. `pendiente` es solo mientras se sabe si hay
 * uno nuevo (para no pintar dos informes seguidos).
 */
export function useInformeDeOds(ods: number, edition: number): { informe: InformePublico | null; pendiente: boolean; nuevo: boolean } {
  const nq = useInformePublico("impact", String(ods), edition);
  const viejo: UseQueryResult<InformePublico | null> = usePublicInforme(ods, edition);
  const convertido = useMemo(() => (nq.data ? aInformePublico(nq.data, ods) : null), [nq.data, ods]);
  if (convertido) return { informe: convertido, pendiente: false, nuevo: true };
  return { informe: viejo.data ?? null, pendiente: nq.isPending, nuevo: false };
}
