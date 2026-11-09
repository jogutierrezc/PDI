/* =============================================================================
   Pilo Publica · lectura y verificación de lo que devuelve la IA (puro).

     · leerTablero        el JSON del estadístico → kpis y gráficos válidos, y
                          lo descartado con su motivo (key inexistente, unidades
                          mezcladas, x que no es el año, menos de 2 puntos…).
     · leerEje            el JSON del periodista → un bloque de texto.
     · verificarEje       cada cita literal de su fuente, todas las fuentes del
                          grupo citadas, una cita por frase, cada key en el
                          libro, cada número del texto sale de las cifras
                          citadas (o es un año, una fecha de las citas, el
                          número de fuentes, el ODS o un indicador), y el
                          inglés trae las mismas cifras (verificarTraduccion).
     · leerPortada / verificarPortada
     · trabajosEje        qué fuentes faltan por citar y en qué grupos.
     · leerTraduccionesPP la traducción en los dos sentidos, verificada.

   Reutiliza la verificación de pilo-rankingsod (esCitaLiteral, numerosDe,
   numerosDeFechas, numerosEnLetras, nombresAjenos, esAnuncio,
   verificarTraduccion); lo que cambia es el modelo: aquí las cifras son keys
   de pp_cifras y no valores escritos por la IA.
   ========================================================================== */

import { verificarTraduccion } from "../pilo-rankingsod/ficha.ts";
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
import type { CitaBloque, Descartado, Grafico, KindFuente, SpecGrafico, SpecKpi } from "./contrato.ts";
import { formatoValor, type CifraLibro } from "./libro.ts";
import type { IndicadorRanking } from "./unidades.ts";

export const MAX_KPIS = 4;
export const MAX_GRAFICOS = 6;
export const MAX_TITULO = 70;
export const MAX_ENTRADA = 650;
/** Fuentes por bloque de texto (un documento va solo: es largo). */
export const FUENTES_POR_EJE = 3;

const limpio = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const esAnio = (n: string) => /^(19|20)\d{2}$/.test(n);

/** Una fuente lista para la IA: la nota virtual con su clase. */
export interface FuenteTexto extends NotaInforme {
  kind: KindFuente;
}

/** El pedido de corrección tras una respuesta que no pasó la verificación. */
export function mensajesReintentoPP(mensajes: Mensaje[], crudo: string, error: string): Mensaje[] {
  return [
    ...mensajes,
    { role: "assistant", content: String(crudo ?? "").slice(0, 6000) },
    {
      role: "user",
      content: `Tu respuesta no pasó la verificación: ${error} Corrígela. Recuerda: cada cita es un trozo copiado tal cual de su fuente; las cifras salen solo del libro, escritas como allí aparecen y con su key en «figs»; el inglés trae las mismas cifras. Responde solo el JSON.`,
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
    graficos.push({ chart, title_es: title_es.slice(0, 100), title_en: title_en.slice(0, 100), series: serie, unit: porKey.get(serie[0].cifra)!.unit });
  }
  return { ok: true, valor: { kpis, graficos, descartados } };
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

/** Valida la forma del JSON del bloque y traduce N1, N2… a la ref de la fuente. No verifica las citas: eso es verificarEje. */
export function leerEje(crudo: string, notas: FuenteTexto[], indicadores: IndicadorRanking[]): Lectura<Eje> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  const d = j.valor;
  const indicator = limpio(d.indicator, 40);
  if (!indicadores.some((i) => i.id === indicator)) return { ok: false, error: `«indicator» debe ser uno de la lista; llegó «${indicator.slice(0, 40)}».` };
  const heading_es = limpio(d.heading_es, 140);
  const heading_en = limpio(d.heading_en, 140);
  if (!heading_es || !heading_en) return { ok: false, error: "Falta el título («heading_es» o «heading_en»)." };
  if (heading_es.length > 100) return { ok: false, error: "El título es demasiado largo (más de 100 caracteres)." };
  const text_es = limpio(d.text_es, 4000);
  const text_en = limpio(d.text_en, 4000);
  if (text_es.length < 60) return { ok: false, error: "El párrafo en español es demasiado corto." };
  if (text_es.length > 2400) return { ok: false, error: "El párrafo es demasiado largo (más de 2.400 caracteres)." };
  if (text_en.length < 40) return { ok: false, error: "Falta «text_en» (el párrafo en inglés)." };
  if (!Array.isArray(d.sources) || !d.sources.length) return { ok: false, error: "Faltan las citas («sources»)." };
  const sources: CitaBloque[] = [];
  for (const s of d.sources) {
    const o = (s ?? {}) as Record<string, unknown>;
    const n = resolverRef(o.ref ?? o.news_id, notas) as FuenteTexto | null;
    if (!n) return { ok: false, error: "Una cita apunta a una fuente que no está en la lista." };
    if (typeof o.quote !== "string" || normalizar(o.quote).length < 8) return { ok: false, error: "Una cita no trae su trozo literal («quote»)." };
    const titulo = n.title.slice(0, 200);
    sources.push({
      ref: n.id,
      kind: n.kind,
      quote: normalizar(o.quote).replace(/^["'\s]+|["'\s]+$/g, ""),
      label: titulo,
      title: titulo,
      ...(n.url ? { url: n.url } : {}),
      ...(n.kind === "noticia" ? { news_id: n.id } : {}),
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
  const nFrases = frases(e.text_es).length;
  if (e.sources.length < nFrases) return { ok: false, error: `El párrafo tiene ${nFrases} frases y solo ${e.sources.length} citas: cada frase necesita su cita literal.`, warn: null };
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

  const avisos: string[] = [];
  if (e.warn) avisos.push(e.warn);
  if (t.warn) avisos.push(t.warn);
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
export function trabajosEje(pendientes: FuentePendiente[], citadas: Set<string>, fallidas: Set<string>): { grupo: string[]; pista: string | null }[] {
  const libres = pendientes
    .filter((p) => !citadas.has(p.ref) && !fallidas.has(p.ref))
    .sort((a, b) => (a.pista ?? "~").localeCompare(b.pista ?? "~") || ORDEN_KIND[a.kind] - ORDEN_KIND[b.kind] || a.fecha.localeCompare(b.fecha) || a.ref.localeCompare(b.ref));
  const out: { grupo: string[]; pista: string | null }[] = [];
  let actual: { grupo: string[]; pista: string | null } | null = null;
  for (const p of libres) {
    const solo = p.kind === "documento";
    if (!actual || solo || actual.pista !== p.pista || actual.grupo.length >= FUENTES_POR_EJE || actual.grupo.length === 0) {
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
    const texto = limpio(o.texto ?? o.en ?? o.es, 6000);
    const v = hacia === "en" ? verificarTraduccion(item.texto, texto) : verificarTraduccion(texto, item.texto);
    if (v.ok) buenas.push({ ref: item.ref, texto, warn: v.warn });
    else malas.push({ ref: item.ref, error: v.error ?? "No pasó la verificación." });
  }
  for (const i of items) if (!buenas.some((b) => b.ref === i.ref) && !malas.some((m) => m.ref === i.ref)) malas.push({ ref: i.ref, error: "La IA no devolvió esta traducción." });
  return { ok: true, valor: { buenas, malas } };
}
