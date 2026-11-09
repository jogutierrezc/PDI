/* =============================================================================
   Pilo Publica · lectura y verificación de lo que devuelve la IA (puro).

     · leerTablero        el JSON del estadístico → kpis y gráficos válidos, y
                          lo descartado con su motivo (key inexistente, unidades
                          mezcladas, x que no es el año, menos de 2 puntos…).
     · sugerirGraficos    si quedan menos de 3 gráficos válidos, los que faltan
                          con reglas fijas (serie en el tiempo, barra
                          comparativa de la misma unidad y año, anillo de un %).
     · leerEje            el JSON del periodista → un eje (texto largo en
                          párrafos separados por «\n\n», según formaEje).
     · verificarEje       cada cita literal de su fuente, todas las fuentes del
                          grupo citadas, al menos una cita por párrafo (por su
                          «p»), cada key en el libro, cada número del texto sale
                          de las cifras citadas (o es un año, una fecha de las
                          citas, el número de fuentes, el ODS o un indicador), y
                          el inglés trae los mismos párrafos y, en cada uno, las
                          mismas cifras (verificarTraduccion).
     · leerDescripciones  lo que devuelve «describir»: nombres y descripciones
                          sin números ajenos a la procedencia de la cifra.
     · leerPortada / verificarPortada
     · trabajosEje        qué fuentes faltan por citar y en qué grupos.
     · leerTraduccionesPP la traducción en los dos sentidos, verificada.

   Reutiliza la verificación de pilo-rankingsod (esCitaLiteral, numerosDe,
   numerosDeFechas, numerosEnLetras, nombresAjenos, esAnuncio,
   verificarTraduccion); lo que cambia es el modelo: aquí las cifras son keys
   de pp_cifras y no valores escritos por la IA.
   ========================================================================== */

import { numerosEn, numerosEs, verificarTraduccion } from "../pilo-rankingsod/ficha.ts";
import {
  esAnuncio,
  esCitaLiteral,
  extraerJson,
  frases,
  nombresAjenos,
  normalizar,
  numerosDe,
  numerosDeFechas,
  numerosEnLetras,
  resolverRef,
  valorEnCifras,
  type Lectura,
  type Mensaje,
  type NotaInforme,
} from "../pilo-rankingsod/logica.ts";
import type { CitaBloque, Descartado, Grafico, KindFuente, Profundidad, SpecGrafico, SpecKpi } from "./contrato.ts";
import { cortar, formatoValor, serieDeCifra, type CifraLibro } from "./libro.ts";
import type { IndicadorRanking } from "./unidades.ts";

export const MAX_KPIS = 4;
export const MAX_GRAFICOS = 6;
/** Gráficos mínimos: si el estadístico propone menos válidos, el código completa con sugerencias deterministas. */
export const MIN_GRAFICOS = 3;
export const MAX_TITULO = 70;
export const MAX_ENTRADA = 650;
/** Fuentes por eje en profundidad (defecto). Copia local: pilo-rankingsod no se toca. */
export const FUENTES_POR_EJE = 5;
/** Fuentes por eje en la profundidad «normal». */
export const FUENTES_POR_EJE_NORMAL = 3;
/** «profundizar»: tope de fuentes de un eje reescrito. */
export const FUENTES_POR_EJE_MAX = 8;

const limpio = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Los párrafos de un texto: separados por una línea en blanco (o, si no hay ninguna, por saltos de línea). */
export function parrafos(texto: string): string[] {
  const t = String(texto ?? "").replace(/\r\n?/g, "\n").trim();
  if (!t) return [];
  const porBlanco = t.split(/\n\s*\n+/);
  const partes = porBlanco.length > 1 ? porBlanco : t.split(/\n+/);
  return partes.map((p) => limpio(p, 100000)).filter(Boolean);
}

/** Como `limpio`, pero conserva los párrafos (separados por «\n\n», como los parte la pantalla). Acepta una lista de párrafos. */
export function limpioTexto(v: unknown, max: number): string {
  const crudo = Array.isArray(v) ? v.map((x) => String(x ?? "")).join("\n\n") : String(v ?? "");
  const sinControl = crudo.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ");
  return parrafos(sinControl).join("\n\n").slice(0, max).trim();
}

const esAnio = (n: string) => /^(19|20)\d{2}$/.test(n);

/** Una fuente lista para la IA: la nota virtual con su clase. */
export interface FuenteTexto extends NotaInforme {
  kind: KindFuente;
}

/** Lo que se le recuerda al modelo al pedirle la corrección, según el paso. */
export const RECORDATORIO = {
  general: "Recuerda: cada cita es un trozo copiado tal cual de su fuente; las cifras salen solo del libro, escritas como allí aparecen y con su key en «figs»; el inglés trae las mismas cifras.",
  eje: "Recuerda: cada cita es un trozo copiado tal cual de su fuente y lleva en «p» el número del párrafo que apoya; cada párrafo tiene al menos una cita; se citan todas las fuentes; las cifras salen solo del libro, escritas como allí aparecen y con su key en «figs»; el inglés trae las mismas cifras y el mismo número de párrafos, separados por una línea en blanco. No acortes el texto más de lo necesario.",
  describir: "Recuerda: no escribas ningún número que no esté en el contexto de esa cifra (su valor, su año o los datos de procedencia); un ítem por key, con label_es, label_en, descripcion_es y descripcion_en.",
} as const;

/** El pedido de corrección tras una respuesta que no pasó la verificación. */
export function mensajesReintentoPP(mensajes: Mensaje[], crudo: string, error: string, recordatorio: string = RECORDATORIO.general): Mensaje[] {
  return [
    ...mensajes,
    { role: "assistant", content: String(crudo ?? "").slice(0, 12000) },
    {
      role: "user",
      content: `Tu respuesta no pasó la verificación: ${error} Corrígela. ${recordatorio} Responde solo el JSON.`,
    },
  ];
}

/* ---------- Estadístico: tablero ------------------------------------------------------ */

export interface Tablero {
  kpis: SpecKpi[];
  graficos: SpecGrafico[];
  descartados: Descartado[];
}

const CHARTS: Grafico[] = ["bar", "line", "donut"];

/**
 * Lee la propuesta del estadístico. Lo inválido no tumba la respuesta: se
 * descarta con su motivo. `usadas`: keys que ya muestra un kpi de una persona.
 */
export function leerTablero(crudo: string, libro: Pick<CifraLibro, "key" | "label" | "unit" | "year" | "value">[], usadas: Set<string> = new Set()): Lectura<Tablero> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  const d = j.valor;
  if (!Array.isArray(d.kpis) && !Array.isArray(d.graficos)) return { ok: false, error: "Faltan «kpis» y «graficos»." };
  const porKey = new Map(libro.map((c) => [c.key, c]));
  const descartados: Descartado[] = [];
  const kpis: SpecKpi[] = [];
  const vistos = new Set(usadas);
  for (const k of Array.isArray(d.kpis) ? d.kpis : []) {
    const key = limpio((k as Record<string, unknown>)?.cifra, 200);
    if (!porKey.has(key)) {
      descartados.push({ motivo: `Cifra clave con una key que no está en el libro: «${key.slice(0, 80)}».` });
      continue;
    }
    if (vistos.has(key)) {
      descartados.push({ motivo: `Cifra clave repetida: «${key}».` });
      continue;
    }
    if (kpis.length >= MAX_KPIS) {
      descartados.push({ motivo: `Más de ${MAX_KPIS} cifras clave: se dejó fuera «${key}».` });
      continue;
    }
    vistos.add(key);
    kpis.push({ cifra: key });
  }
  const graficos: SpecGrafico[] = [];
  for (const g0 of Array.isArray(d.graficos) ? d.graficos : []) {
    const g = (g0 ?? {}) as Record<string, unknown>;
    const chart = String(g.chart ?? "") as Grafico;
    const title_es = limpio(g.title_es, 120);
    const title_en = limpio(g.title_en, 120);
    const nombre = `«${title_es.slice(0, 60) || "(sin título)"}»`;
    if (!CHARTS.includes(chart)) {
      descartados.push({ motivo: `Gráfico ${nombre}: tipo «${String(g.chart ?? "").slice(0, 20)}» desconocido.` });
      continue;
    }
    if (!title_es || !title_en) {
      descartados.push({ motivo: `Gráfico ${nombre}: le falta el título en español o en inglés.` });
      continue;
    }
    if (graficos.length >= MAX_GRAFICOS) {
      descartados.push({ motivo: `Más de ${MAX_GRAFICOS} gráficos: se dejó fuera ${nombre}.` });
      continue;
    }
    const crudos = Array.isArray(g.series) ? g.series : [];
    const puntos: { x: string; cifra: string }[] = [];
    let motivo = "";
    for (const p0 of crudos) {
      const p = (p0 ?? {}) as Record<string, unknown>;
      const key = limpio(p.cifra, 200);
      const c = porKey.get(key);
      if (!c) {
        motivo = `la key «${key.slice(0, 80)}» no está en el libro`;
        break;
      }
      if (puntos.some((x) => x.cifra === key)) {
        motivo = `la cifra «${key}» está dos veces`;
        break;
      }
      // Donut y barras: «x» es el nombre corto del punto (una porción, o una medida comparada con otras de la misma unidad).
      if (chart === "donut" || chart === "bar") {
        puntos.push({ x: limpio(p.x, 60) || c.label.slice(0, 60), cifra: key });
        continue;
      }
      const x = limpio(p.x, 10);
      if (c.year === null) {
        motivo = `la cifra «${key}» no tiene año`;
        break;
      }
      if (x !== String(c.year)) {
        motivo = `«x» = «${x}» no es el año de la cifra (${c.year})`;
        break;
      }
      puntos.push({ x, cifra: key });
    }
    if (!motivo) {
      const cifras = puntos.map((p) => porKey.get(p.cifra)!);
      const unidades = new Set(cifras.map((c) => c.unit));
      if (unidades.size > 1) motivo = `mezcla unidades (${[...unidades].map((u) => u || "sin unidad").join(", ")})`;
      else if (chart !== "donut" && puntos.length < 2) motivo = "necesita al menos 2 puntos";
      else if (chart !== "donut" && new Set(puntos.map((p) => p.x)).size !== puntos.length) motivo = "repite un año";
      else if (chart === "donut" && puntos.length === 0) motivo = "no tiene puntos";
      else if (chart === "donut" && puntos.length === 1 && !(cifras[0].unit === "%" && cifras[0].value >= 0 && cifras[0].value <= 100)) motivo = "una dona de un solo punto debe ser un porcentaje entre 0 y 100";
      else if (chart === "donut" && puntos.length > 1 && (cifras[0].unit === "%" || new Set(cifras.map((c) => c.year)).size > 1 || cifras.some((c) => c.value < 0))) motivo = "las porciones de una dona deben ser partes positivas del mismo total y del mismo año";
      else {
        const anios = new Set(cifras.map((c) => String(c.year ?? "")));
        const ajenos = [...numerosDe(title_es), ...numerosDe(title_en)].filter((n) => !(esAnio(n) && anios.has(n)));
        if (ajenos.length) motivo = `el título trae cifras (${[...new Set(ajenos)].join(", ")}); solo puede llevar los años del gráfico`;
      }
    }
    if (motivo) {
      descartados.push({ motivo: `Gráfico ${nombre}: ${motivo}.` });
      continue;
    }
    const serie = chart === "line" ? [...puntos].sort((a, b) => Number(a.x) - Number(b.x)) : puntos;
    graficos.push({ chart, title_es: title_es.slice(0, 100), title_en: title_en.slice(0, 100), series: serie, unit: porKey.get(serie[0].cifra)!.unit, origen: "pilo" });
  }
  return { ok: true, valor: { kpis, graficos, descartados } };
}

/* ---------- Sugerencias deterministas de gráficos ------------------------------------- */

export type CifraSugerible = Pick<CifraLibro, "key" | "label" | "label_en" | "unit" | "year" | "value" | "derived" | "source" | "indicator">;

const sinAnioFinal = (s: string) => s.replace(/\s*\((19|20)\d{2}\)\s*$/, "").trim();
const firma = (g: Pick<SpecGrafico, "series">) => g.series.map((p) => p.cifra).sort().join("|");

/**
 * Cuando el estadístico deja menos de MIN_GRAFICOS válidos, el código propone
 * los que faltan con reglas fijas (la IA no interviene y nadie teclea números):
 *   · una serie (misma `source.serie`) con 2 o más años → línea (3+) o barras (2);
 *   · cifras de la misma unidad y del mismo año, de series distintas → barra
 *     comparativa de hasta 8 puntos;
 *   · un porcentaje entre 0 y 100 → anillo de un punto.
 * Cada propuesta cumple las mismas reglas que leerTablero y va con origen «codigo».
 */
export function sugerirGraficos(libro: CifraSugerible[], existentes: SpecGrafico[], cuantos: number): SpecGrafico[] {
  if (cuantos <= 0) return [];
  const porKey = new Map(libro.map((c) => [c.key, c]));
  const firmas = new Set(existentes.map(firma));
  const seriesUsadas = new Set(existentes.flatMap((g) => g.series.map((p) => porKey.get(p.cifra)).filter(Boolean).map((c) => serieDeCifra(c!))));
  const enDona = new Set(existentes.filter((g) => g.chart === "donut").flatMap((g) => g.series.map((p) => p.cifra)));
  const propias = libro.filter((c) => !c.derived && Number.isFinite(Number(c.value)));
  const conIndicador = (c: CifraSugerible) => Number(Boolean(c.indicator));
  const corto = (s: string, n: number) => cortar(sinAnioFinal(s), n);

  // 1. Series en el tiempo.
  const series = new Map<string, CifraSugerible[]>();
  for (const c of propias) if (c.year !== null) series.set(serieDeCifra(c), [...(series.get(serieDeCifra(c)) ?? []), c]);
  const deSerie: SpecGrafico[] = [];
  const candidatasSerie = [...series.entries()]
    .map(([s, l]) => {
      const porAnio = new Map<number, CifraSugerible>();
      for (const c of [...l].sort((a, b) => (a.year as number) - (b.year as number))) if (!porAnio.has(c.year as number)) porAnio.set(c.year as number, c);
      return { s, puntos: [...porAnio.values()].slice(-8) };
    })
    .filter((x) => x.puntos.length >= 2 && new Set(x.puntos.map((c) => c.unit)).size === 1 && !seriesUsadas.has(x.s))
    .sort((a, b) => conIndicador(b.puntos[0]) - conIndicador(a.puntos[0]) || b.puntos.length - a.puntos.length || (b.puntos.at(-1)!.year as number) - (a.puntos.at(-1)!.year as number) || a.s.localeCompare(b.s));
  for (const x of candidatasSerie) {
    const ultimo = x.puntos[x.puntos.length - 1];
    const nombre = corto(ultimo.label, 80);
    const nombreEn = ultimo.label_en ? corto(ultimo.label_en, 80) : "";
    deSerie.push({
      chart: x.puntos.length >= 3 ? "line" : "bar",
      title_es: `Evolución de ${nombre}`,
      title_en: nombreEn ? `Trend in ${nombreEn}` : "",
      series: x.puntos.map((c) => ({ x: String(c.year), cifra: c.key })),
      unit: ultimo.unit,
      origen: "codigo",
    });
  }

  // 2. Barras comparativas: misma unidad, mismo año, series distintas (sin unidad: solo dentro de la misma tabla).
  const cubetas = new Map<string, CifraSugerible[]>();
  for (const c of propias) {
    if (c.year === null) continue;
    const k = `${c.unit}§${c.year}${c.unit ? "" : `§${c.source?.tabla ?? ""}`}`;
    cubetas.set(k, [...(cubetas.get(k) ?? []), c]);
  }
  const deBarras: SpecGrafico[] = [];
  const candidatasBarra = [...cubetas.values()]
    .map((l) => {
      const una = new Map<string, CifraSugerible>();
      for (const c of [...l].sort((a, b) => conIndicador(b) - conIndicador(a) || a.key.localeCompare(b.key))) if (!una.has(serieDeCifra(c))) una.set(serieDeCifra(c), c);
      return [...una.values()].slice(0, 8);
    })
    .filter((l) => l.length >= 2)
    .sort((a, b) => (b[0].year as number) - (a[0].year as number) || b.length - a.length);
  for (const l of candidatasBarra) {
    const desgloses = l.map((c) => String(c.source?.desglose ?? "").trim());
    const porDesglose = desgloses.every(Boolean) && new Set(desgloses).size === l.length;
    const xs: string[] = [];
    for (const c of l) {
      let x = porDesglose ? cortar(String(c.source?.desglose), 28) : corto(c.label, 28);
      for (let i = 2; xs.includes(x); i++) x = `${cortar(x, 24)} ·${i}`;
      xs.push(x);
    }
    const year = l[0].year as number;
    const unidad = l[0].unit;
    const tablas = new Set(l.map((c) => String(c.source?.tabla ?? "")));
    const tabla = tablas.size === 1 ? [...tablas][0] : "";
    const que = porDesglose && tabla ? cortar(tabla, 60) : unidad === "%" ? "porcentajes" : unidad ? `cifras en ${unidad}` : cortar(tabla || "cifras", 60);
    deBarras.push({
      chart: "bar",
      title_es: `Comparación de ${que} (${year})`,
      title_en: "",
      series: l.map((c, i) => ({ x: xs[i], cifra: c.key })),
      unit: unidad,
      origen: "codigo",
    });
  }

  // 3. Anillos: un porcentaje entre 0 y 100 (el más reciente de cada serie).
  const deAnillo: SpecGrafico[] = [];
  const vistos = new Set<string>();
  for (const c of [...propias].filter((c) => c.unit === "%" && Number(c.value) >= 0 && Number(c.value) <= 100 && !enDona.has(c.key)).sort((a, b) => conIndicador(b) - conIndicador(a) || (b.year ?? 0) - (a.year ?? 0) || a.key.localeCompare(b.key))) {
    const s = serieDeCifra(c);
    if (vistos.has(s)) continue;
    vistos.add(s);
    deAnillo.push({
      chart: "donut",
      title_es: cortar(c.label, 95),
      title_en: c.label_en ? cortar(c.label_en, 95) : "",
      series: [{ x: corto(c.label, 40), cifra: c.key }],
      unit: "%",
      origen: "codigo",
    });
  }

  // Variedad: una de cada clase por vuelta, sin repetir el mismo juego de cifras.
  const out: SpecGrafico[] = [];
  const colas = [deSerie, deBarras, deAnillo];
  while (out.length < cuantos && colas.some((q) => q.length)) {
    for (const q of colas) {
      if (out.length >= cuantos) break;
      while (q.length) {
        const g = q.shift()!;
        const f = firma(g);
        if (firmas.has(f)) continue;
        firmas.add(f);
        out.push({ ...g, title_es: g.title_es.slice(0, 100), title_en: g.title_en.slice(0, 100) });
        break;
      }
    }
  }
  return out;
}

/* ---------- Periodista: un eje ---------------------------------------------------------- */

export interface Eje {
  indicator: string;
  heading_es: string;
  heading_en: string;
  text_es: string;
  text_en: string;
  sources: CitaBloque[];
  figs: string[];
  warn: string | null;
}

/** La forma que debe tener un eje según la profundidad. */
export interface FormaEje {
  profundidad: Profundidad;
  /** Párrafos aceptados (incluidos). */
  minParrafos: number;
  maxParrafos: number;
  /** Párrafos que se le piden al modelo (dentro del rango aceptado). */
  pedirParrafos: [number, number];
  /** Caracteres del texto en español (con la tolerancia ya incluida en el máximo). */
  minChars: number;
  maxChars: number;
  fuentes: number;
  maxTokens: number;
}

/**
 * «normal»: 3 fuentes, 2–3 párrafos (300–2.000 caracteres).
 * «profunda»: 5 fuentes, 4–6 párrafos (se aceptan 3 si hay pocas fuentes), ~900–3.800 caracteres.
 * Con pocas fuentes se piden menos párrafos: nada de relleno.
 */
export function formaEje(profundidad: Profundidad, nFuentes: number): FormaEje {
  if (profundidad === "normal") return { profundidad, minParrafos: 2, maxParrafos: 3, pedirParrafos: [2, 3], minChars: 300, maxChars: 2200, fuentes: FUENTES_POR_EJE_NORMAL, maxTokens: 2200 };
  const pocas = nFuentes < 3;
  return { profundidad, minParrafos: 3, maxParrafos: 6, pedirParrafos: pocas ? [3, 4] : [4, 6], minChars: pocas ? 700 : 900, maxChars: 4100, fuentes: FUENTES_POR_EJE, maxTokens: 3500 };
}

/** Valida la forma del JSON del bloque y traduce N1, N2… a la ref de la fuente. No verifica las citas: eso es verificarEje. */
export function leerEje(crudo: string, notas: FuenteTexto[], indicadores: IndicadorRanking[], forma: FormaEje = formaEje("profunda", notas.length)): Lectura<Eje> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  const d = j.valor;
  const indicator = limpio(d.indicator, 40);
  if (!indicadores.some((i) => i.id === indicator)) return { ok: false, error: `«indicator» debe ser uno de la lista; llegó «${indicator.slice(0, 40)}».` };
  const heading_es = limpio(d.heading_es, 140);
  const heading_en = limpio(d.heading_en, 140);
  if (!heading_es || !heading_en) return { ok: false, error: "Falta el título («heading_es» o «heading_en»)." };
  if (heading_es.length > 100) return { ok: false, error: "El título es demasiado largo (más de 100 caracteres)." };
  const text_es = limpioTexto(d.text_es, forma.maxChars + 600);
  const text_en = limpioTexto(d.text_en, forma.maxChars + 1200);
  const nP = parrafos(text_es).length;
  if (text_en.length < 40) return { ok: false, error: "Falta «text_en» (el texto en inglés)." };
  if (nP < forma.minParrafos || nP > forma.maxParrafos)
    return { ok: false, error: `El texto en español tiene ${nP} párrafo(s); se piden de ${forma.pedirParrafos[0]} a ${forma.pedirParrafos[1]}, separados por una línea en blanco («\\n\\n»).` };
  if (text_es.length < forma.minChars) return { ok: false, error: `El texto en español es demasiado corto (${text_es.length} caracteres; mínimo ${forma.minChars}).` };
  if (text_es.length > forma.maxChars) return { ok: false, error: `El texto en español es demasiado largo (${text_es.length} caracteres; máximo ${forma.maxChars}).` };
  if (!Array.isArray(d.sources) || !d.sources.length) return { ok: false, error: "Faltan las citas («sources»)." };
  const sources: CitaBloque[] = [];
  for (const s of d.sources) {
    const o = (s ?? {}) as Record<string, unknown>;
    const n = resolverRef(o.ref ?? o.news_id, notas) as FuenteTexto | null;
    if (!n) return { ok: false, error: "Una cita apunta a una fuente que no está en la lista." };
    if (typeof o.quote !== "string" || normalizar(o.quote).length < 8) return { ok: false, error: "Una cita no trae su trozo literal («quote»)." };
    let p: number | undefined;
    if (o.p !== undefined && o.p !== null && o.p !== "") {
      p = Number(o.p);
      if (!Number.isInteger(p) || p < 1 || p > nP) return { ok: false, error: `Una cita dice «p»: ${String(o.p).slice(0, 10)}, pero el texto tiene ${nP} párrafos (de 1 a ${nP}).` };
    }
    const titulo = n.title.slice(0, 200);
    sources.push({
      ref: n.id,
      kind: n.kind,
      quote: normalizar(o.quote).replace(/^["'\s]+|["'\s]+$/g, ""),
      label: titulo,
      title: titulo,
      ...(n.url ? { url: n.url } : {}),
      ...(n.kind === "noticia" ? { news_id: n.id } : {}),
      ...(p !== undefined ? { p } : {}),
    });
  }
  if (!Array.isArray(d.figs ?? [])) return { ok: false, error: "«figs» debe ser una lista de keys." };
  const figs = [...new Set(((d.figs ?? []) as unknown[]).map((f) => limpio(typeof f === "object" && f ? (f as Record<string, unknown>).key ?? (f as Record<string, unknown>).cifra : f, 200)).filter(Boolean))];
  let warn: string | null = null;
  if (d.warn !== undefined && d.warn !== null) warn = limpio(d.warn, 400) || null;
  return { ok: true, valor: { indicator, heading_es, heading_en, text_es, text_en, sources, figs, warn } };
}

/** Los números que el texto puede escribir por las cifras citadas: el valor como lo muestra el libro y su año. */
export function numerosDeCifras(keys: string[], libro: Map<string, Pick<CifraLibro, "value" | "unit" | "year">>): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    const c = libro.get(k);
    if (!c) continue;
    for (const n of numerosDe(formatoValor(Number(c.value), c.unit, "es"))) out.add(n);
    for (const n of numerosDe(String(c.value))) out.add(n);
    if (c.year !== null) out.add(String(c.year));
  }
  return out;
}

export interface OpcionesEje {
  /** Refs que el bloque debe citar todas. */
  exigir: string[];
  /** Números que siempre se pueden escribir (el ODS, los ids de los indicadores, la edición). */
  fijos: string[];
}

/** Lo que debe cumplir un bloque para guardarse. Si no, el motivo. */
export function verificarEje(e: Eje, notas: FuenteTexto[], libro: Map<string, CifraLibro>, op: OpcionesEje): { ok: boolean; error?: string; warn: string | null } {
  const porId = new Map(notas.map((n) => [n.id, n]));
  for (const s of e.sources) {
    const n = porId.get(s.ref);
    if (!n) return { ok: false, error: "Una cita apunta a una fuente que no está en la lista.", warn: null };
    if (!esCitaLiteral(n.body, s.quote)) return { ok: false, error: `La cita «${s.quote.slice(0, 80)}» no está tal cual en «${n.title.slice(0, 60)}».`, warn: null };
  }
  const citadas = new Set(e.sources.map((s) => s.ref));
  const faltan = op.exigir.filter((r) => !citadas.has(r));
  if (faltan.length) return { ok: false, error: `El bloque debe citar todas las fuentes; faltan: ${faltan.map((r) => `N${notas.findIndex((n) => n.id === r) + 1}`).join(", ")}.`, warn: null };
  // Texto largo: al menos UNA cita por párrafo (por su «p»; si el modelo no dijo «p», al menos tantas citas como párrafos).
  const pes = parrafos(e.text_es);
  const nP = pes.length;
  if (e.sources.some((s) => s.p !== undefined)) {
    const cubiertos = new Set(e.sources.map((s) => s.p).filter((p): p is number => p !== undefined));
    const sinCita = Array.from({ length: nP }, (_, i) => i + 1).filter((p) => !cubiertos.has(p));
    if (sinCita.length) return { ok: false, error: `${sinCita.length === 1 ? `El párrafo ${sinCita[0]} no tiene` : `Los párrafos ${sinCita.join(", ")} no tienen`} cita: cada párrafo necesita al menos una cita literal (con su «p»).`, warn: null };
  } else if (e.sources.length < nP) {
    return { ok: false, error: `El texto tiene ${nP} párrafos y solo ${e.sources.length} citas: cada párrafo necesita al menos una cita literal (di en «p» qué párrafo apoya).`, warn: null };
  }
  // Un texto de un solo párrafo conserva la regla de antes: una cita por frase.
  if (nP === 1 && e.sources.length < frases(e.text_es).length) return { ok: false, error: `El texto es un solo párrafo de ${frases(e.text_es).length} frases con ${e.sources.length} citas: cada frase necesita su cita literal.`, warn: null };
  const sinLibro = e.figs.filter((k) => !libro.has(k));
  if (sinLibro.length) return { ok: false, error: `Estas keys no están en el libro de cifras: ${sinLibro.slice(0, 4).join(", ")}.`, warn: null };

  const citas = e.sources.map((s) => s.quote).join(" ");
  const fuentes = [...citadas].map((r) => porId.get(r)!).filter(Boolean);
  const permitidos = new Set([...numerosDeCifras(e.figs, libro), ...numerosDeFechas(citas), String(fuentes.length), ...op.fijos]);
  const anios = new Set(fuentes.flatMap((n) => [...numerosDe(n.body), ...numerosDe(n.title), ...numerosDe(n.published_on ?? "")].filter(esAnio)));
  for (const num of numerosDe(`${e.heading_es} ${e.text_es}`)) {
    if (permitidos.has(num)) continue;
    if (esAnio(num) && anios.has(num)) continue;
    return { ok: false, error: `El número ${num} no sale de las cifras citadas del libro (pon su key en «figs» y escríbelo como en el libro) ni de una fecha de las citas.`, warn: null };
  }
  for (const w of numerosEnLetras(`${e.heading_es} ${e.text_es}`)) {
    const enCifras = valorEnCifras(w);
    if (enCifras && permitidos.has(enCifras)) continue;
    if (numerosEnLetras(citas).includes(w)) continue;
    return { ok: false, error: `«${w}» no sale de las cifras citadas ni de las citas.`, warn: null };
  }
  const t = verificarTraduccion(`${e.heading_es}. ${e.text_es}`, `${e.heading_en}. ${e.text_en}`);
  if (!t.ok) return { ok: false, error: t.error ?? "El inglés no coincide con el español.", warn: null };
  // El inglés: el mismo número de párrafos y, en cada uno, las mismas cifras y siglas.
  const pen = parrafos(e.text_en);
  if (pen.length !== nP) return { ok: false, error: `El inglés tiene ${pen.length} párrafo(s) y el español ${nP}: deben tener los mismos, separados por una línea en blanco.`, warn: null };
  if (nP > 1)
    for (let i = 0; i < nP; i++) {
      const tp = verificarTraduccion(pes[i], pen[i]);
      if (!tp.ok) return { ok: false, error: `Párrafo ${i + 1} en inglés: ${tp.error ?? "no coincide con el español."}`, warn: null };
    }

  const avisos: string[] = [];
  if (e.warn) avisos.push(e.warn);
  if (t.warn) avisos.push(t.warn);
  if (nP > 1) avisos.push("Cada párrafo debe poder rastrearse a su cita.");
  for (const n of fuentes) if (n.kind === "noticia" && esAnuncio(n)) avisos.push(`«${n.title.slice(0, 70)}» anuncia, no cuenta lo que pasó: confirma que se realizó.`);
  const ajenos = nombresAjenos(e.text_es, fuentes);
  if (ajenos.length) avisos.push(`Revisa estos nombres, no están en las fuentes citadas: ${ajenos.slice(0, 5).join(", ")}.`);
  const unico = [...new Set(avisos)];
  return { ok: true, warn: unico.length ? unico.join(" ").slice(0, 600) : null };
}

/* ---------- Periodista: portada ------------------------------------------------------------ */

export interface Portada {
  title_es: string;
  title_en: string;
  lead_es: string;
  lead_en: string;
  figs: string[];
}

export function leerPortada(crudo: string): Lectura<Portada> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  const d = j.valor;
  const p: Portada = {
    title_es: limpio(d.title_es, 200),
    title_en: limpio(d.title_en, 200),
    lead_es: limpio(d.lead_es, 1200),
    lead_en: limpio(d.lead_en, 1200),
    figs: Array.isArray(d.figs) ? [...new Set((d.figs as unknown[]).map((f) => limpio(f, 200)).filter(Boolean))] : [],
  };
  if (!p.title_es || !p.title_en) return { ok: false, error: "Falta el título en español o en inglés." };
  if (p.title_es.length > MAX_TITULO || p.title_en.length > MAX_TITULO + 10) return { ok: false, error: `El título pasa de ${MAX_TITULO} caracteres.` };
  if (p.lead_es.length < 80) return { ok: false, error: "La entrada en español es demasiado corta." };
  if (p.lead_es.length > MAX_ENTRADA || p.lead_en.length > MAX_ENTRADA + 80) return { ok: false, error: `La entrada pasa de ${MAX_ENTRADA} caracteres.` };
  if (p.lead_en.length < 60) return { ok: false, error: "Falta la entrada en inglés." };
  return { ok: true, valor: p };
}

export function verificarPortada(p: Portada, libro: Map<string, CifraLibro>, textos: NotaInforme[], fijos: string[]): { ok: boolean; error?: string; warn: string | null } {
  const sinLibro = p.figs.filter((k) => !libro.has(k));
  if (sinLibro.length) return { ok: false, error: `Estas keys no están en el libro de cifras: ${sinLibro.slice(0, 4).join(", ")}.`, warn: null };
  const permitidos = new Set([...numerosDeCifras(p.figs, libro), ...fijos]);
  const anios = new Set(textos.flatMap((n) => numerosDe(`${n.title} ${n.body}`).filter(esAnio)));
  const es = `${p.title_es} ${p.lead_es}`;
  for (const num of numerosDe(es)) {
    if (permitidos.has(num) || (esAnio(num) && anios.has(num))) continue;
    return { ok: false, error: `El número ${num} no sale de las cifras citadas del libro.`, warn: null };
  }
  for (const w of numerosEnLetras(es)) {
    const enCifras = valorEnCifras(w);
    if (!(enCifras && permitidos.has(enCifras))) return { ok: false, error: `«${w}» no sale de las cifras citadas.`, warn: null };
  }
  const t1 = verificarTraduccion(p.title_es, p.title_en);
  if (!t1.ok) return { ok: false, error: `Título: ${t1.error}`, warn: null };
  const t2 = verificarTraduccion(p.lead_es, p.lead_en);
  if (!t2.ok) return { ok: false, error: `Entrada: ${t2.error}`, warn: null };
  const ajenos = nombresAjenos(es, textos);
  const avisos = [t1.warn, t2.warn, ajenos.length ? `Revisa estos nombres: ${ajenos.slice(0, 5).join(", ")}.` : null].filter(Boolean);
  return { ok: true, warn: avisos.length ? avisos.join(" ") : null };
}

/* ---------- Qué falta por escribir ------------------------------------------------------- */

export interface FuentePendiente {
  ref: string;
  kind: KindFuente;
  /** Indicador probable (pista para el periodista y para agrupar). */
  pista: string | null;
  fecha: string;
}

const ORDEN_KIND: Record<KindFuente, number> = { noticia: 0, indicador: 1, libro: 2, cifras: 3, documento: 4 };

/**
 * Los grupos que faltan: las fuentes incluidas que ningún bloque de texto cita
 * ni falló antes, juntas por indicador probable, de a FUENTES_POR_EJE (un
 * documento va solo).
 */
export function trabajosEje(pendientes: FuentePendiente[], citadas: Set<string>, fallidas: Set<string>, porEje: number = FUENTES_POR_EJE): { grupo: string[]; pista: string | null }[] {
  // Los documentos de la biblioteca NO son base de redacción: un documento suelto (una metodología, una hoja de créditos)
  // no cuenta lo que hizo la UDES y la IA terminaba inventando la cita. Siguen alimentando el libro de cifras.
  const libres = pendientes
    .filter((p) => p.kind !== "documento" && !citadas.has(p.ref) && !fallidas.has(p.ref))
    .sort((a, b) => (a.pista ?? "~").localeCompare(b.pista ?? "~") || ORDEN_KIND[a.kind] - ORDEN_KIND[b.kind] || a.fecha.localeCompare(b.fecha) || a.ref.localeCompare(b.ref));
  const out: { grupo: string[]; pista: string | null }[] = [];
  let actual: { grupo: string[]; pista: string | null } | null = null;
  for (const p of libres) {
    const solo = p.kind === "documento";
    if (!actual || solo || actual.pista !== p.pista || actual.grupo.length >= Math.max(1, porEje) || actual.grupo.length === 0) {
      if (actual && actual.grupo.length) out.push(actual);
      actual = { grupo: [p.ref], pista: p.pista };
      if (solo) {
        out.push(actual);
        actual = null;
      }
      continue;
    }
    actual.grupo.push(p.ref);
  }
  if (actual && actual.grupo.length) out.push(actual);
  return out;
}

/**
 * «profundizar»: fuentes del MISMO indicador que ningún eje cita aún (ni
 * fallaron, ni son documentos de la biblioteca), en el orden de trabajosEje.
 */
export function fuentesParaProfundizar(pendientes: FuentePendiente[], citadas: Set<string>, fallidas: Set<string>, indicador: string | null, cuantas: number): string[] {
  if (!indicador || cuantas <= 0) return [];
  return pendientes
    .filter((p) => p.kind !== "documento" && p.pista === indicador && !citadas.has(p.ref) && !fallidas.has(p.ref))
    .sort((a, b) => ORDEN_KIND[a.kind] - ORDEN_KIND[b.kind] || a.fecha.localeCompare(b.fecha) || a.ref.localeCompare(b.ref))
    .slice(0, cuantas)
    .map((p) => p.ref);
}

/* ---------- Traducir en los dos sentidos ------------------------------------------------ */

export interface ItemTraduccion {
  ref: string;
  texto: string;
}

/** Las traducciones verificadas (mismas cifras y siglas) y, aparte, las que no pasan. */
export function leerTraduccionesPP(crudo: string, items: ItemTraduccion[], hacia: "en" | "es"): Lectura<{ buenas: { ref: string; texto: string; warn: string | null }[]; malas: { ref: string; error: string }[] }> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  if (!Array.isArray(j.valor.traducciones)) return { ok: false, error: "Falta la lista «traducciones»." };
  const buenas: { ref: string; texto: string; warn: string | null }[] = [];
  const malas: { ref: string; error: string }[] = [];
  for (const x of j.valor.traducciones) {
    const o = (x ?? {}) as Record<string, unknown>;
    const item = items.find((i) => i.ref === String(o.ref ?? ""));
    if (!item) continue;
    // Los textos largos de los ejes llegan en párrafos: se conservan («\n\n») y deben ser los mismos.
    const texto = limpioTexto(o.texto ?? o.en ?? o.es, 9000);
    const nOrig = parrafos(item.texto).length;
    const nTrad = parrafos(texto).length;
    if (nOrig > 1 && nTrad !== nOrig) {
      malas.push({ ref: item.ref, error: `La traducción tiene ${nTrad} párrafo(s) y el original ${nOrig}.` });
      continue;
    }
    const v = hacia === "en" ? verificarTraduccion(item.texto, texto) : verificarTraduccion(texto, item.texto);
    if (v.ok) buenas.push({ ref: item.ref, texto, warn: v.warn });
    else malas.push({ ref: item.ref, error: v.error ?? "No pasó la verificación." });
  }
  for (const i of items) if (!buenas.some((b) => b.ref === i.ref) && !malas.some((m) => m.ref === i.ref)) malas.push({ ref: i.ref, error: "La IA no devolvió esta traducción." });
  return { ok: true, valor: { buenas, malas } };
}

/* ---------- Estadístico: describir las cifras ------------------------------------------ */

/** Lo que se le da al modelo de una cifra para describirla (solo procedencia, nada más). */
export interface ItemDescribir {
  key: string;
  /** El contexto de procedencia como texto (es lo único que el modelo ve de la cifra). */
  contexto: string;
  /** Los números que los textos pueden escribir (sin separadores): los del contexto, el valor y el año. */
  permitidos: Set<string>;
}

export interface Descripcion {
  key: string;
  label_es: string;
  label_en: string;
  descripcion_es: string;
  descripcion_en: string;
}

export const MAX_LABEL_DESCRITO = 90;
export const MAX_DESCRIPCION = 240;

const sinSep = (n: string) => n.replace(/[.,]/g, "");

/** Los números que una descripción puede escribir: los del contexto, el valor (como lo muestra el libro y crudo) y el año. */
export function numerosPermitidos(contexto: string, c: Pick<CifraLibro, "value" | "unit" | "year">): Set<string> {
  const out = new Set<string>();
  for (const n of numerosDe(contexto)) out.add(sinSep(n));
  for (const n of numerosDe(formatoValor(Number(c.value), c.unit, "es"))) out.add(sinSep(n));
  for (const n of numerosEn(formatoValor(Number(c.value), c.unit, "en"))) out.add(sinSep(n));
  out.add(sinSep(String(c.value)));
  if (c.year !== null && c.year !== undefined) out.add(String(c.year));
  return out;
}

/**
 * Lee las descripciones del estadístico. El VALOR de la cifra nunca se toca;
 * cada texto se revisa: largo, ningún número fuera del contexto, del valor o
 * del año. Un ítem malo se omite con su motivo; el resto vale.
 */
export function leerDescripciones(crudo: string, items: ItemDescribir[]): Lectura<{ buenas: Descripcion[]; malas: { key: string; motivo: string }[] }> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  const lista = Array.isArray(j.valor.items) ? j.valor.items : null;
  if (!lista) return { ok: false, error: "Falta la lista «items»." };
  const porKey = new Map(items.map((i) => [i.key, i]));
  const buenas: Descripcion[] = [];
  const malas: { key: string; motivo: string }[] = [];
  const hechas = new Set<string>();
  for (const x of lista) {
    const o = (x ?? {}) as Record<string, unknown>;
    const key = limpio(o.key, 200);
    const item = porKey.get(key);
    if (!item || hechas.has(key)) continue;
    hechas.add(key);
    const d: Descripcion = {
      key,
      label_es: limpio(o.label_es, 200),
      label_en: limpio(o.label_en, 200),
      descripcion_es: limpio(o.descripcion_es, 600),
      descripcion_en: limpio(o.descripcion_en, 600),
    };
    const motivo = (() => {
      if (!d.label_es || !d.label_en) return "Falta el nombre en español o en inglés.";
      if (!d.descripcion_es || !d.descripcion_en) return "Falta la descripción en español o en inglés.";
      // Un poco de holgura sobre lo pedido (90 y 240) para no perder una buena por pocos caracteres.
      if (d.label_es.length > MAX_LABEL_DESCRITO + 10 || d.label_en.length > MAX_LABEL_DESCRITO + 10) return `El nombre pasa de ${MAX_LABEL_DESCRITO} caracteres.`;
      if (d.descripcion_es.length > MAX_DESCRIPCION + 20 || d.descripcion_en.length > MAX_DESCRIPCION + 20) return `La descripción pasa de ${MAX_DESCRIPCION} caracteres.`;
      if (d.descripcion_es.length < 30) return "La descripción es demasiado corta.";
      if (/\b(?:ds|the|ugm|od|nf|bib|der):[\w-]/i.test(`${d.label_es} ${d.descripcion_es}`)) return "El texto trae claves técnicas.";
      const es = [...numerosEs(`${d.label_es} ${d.descripcion_es}`)].map(sinSep).filter((n) => !item.permitidos.has(n));
      if (es.length) return `El español trae números que no están en la procedencia ni en la cifra: ${[...new Set(es)].slice(0, 4).join(", ")}.`;
      const en = [...numerosEn(`${d.label_en} ${d.descripcion_en}`)].map(sinSep).filter((n) => !item.permitidos.has(n));
      if (en.length) return `El inglés trae números que no están en la procedencia ni en la cifra: ${[...new Set(en)].slice(0, 4).join(", ")}.`;
      return "";
    })();
    if (motivo) malas.push({ key, motivo });
    else buenas.push(d);
  }
  for (const i of items) if (!hechas.has(i.key)) malas.push({ key: i.key, motivo: "La IA no devolvió esta cifra." });
  return { ok: true, valor: { buenas, malas } };
}
