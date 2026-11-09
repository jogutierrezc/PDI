/* =============================================================================
   Pilo Publica · qué es cada cifra y cómo armar gráficos válidos con ellas.

   Todo es puro (sin red): lo usan el tablero (explicaciones, grupos por serie)
   y los gráficos (compatibilidad, sugerencias y títulos). Trabaja con lo que haya
   en `pp_cifras.source`; todos sus campos son opcionales.
   ========================================================================== */

import type { CifraPP, SpecGrafico, TipoGrafico } from "./tipos";

/* ---------- Procedencia de una cifra ------------------------------------- */

export interface FuenteCifra {
  kind: string;
  tabla: string;
  oficina: string;
  columna: string;
  desglose: string;
  periodo: string;
  indicador_id: string;
  indicador: string;
  definicion: string;
  cita: string;
  url: string;
  fila: string;
  serie: string;
  descripcion: string;
  descripcion_en: string;
  descrito: "pilo" | "persona" | "codigo" | "";
  formula: string;
}

const txt = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
};

/** `source` normalizado: todo texto, sin sorpresas de tipo. */
export function fuenteDe(c: Pick<CifraPP, "source">): FuenteCifra {
  const s = (c.source && typeof c.source === "object" ? c.source : {}) as Record<string, unknown>;
  const d = txt(s.descrito);
  return {
    kind: txt(s.kind),
    tabla: txt(s.tabla),
    oficina: txt(s.oficina),
    columna: txt(s.columna),
    desglose: txt(s.desglose),
    periodo: txt(s.periodo),
    indicador_id: txt(s.indicador_id),
    indicador: txt(s.indicador),
    definicion: txt(s.definicion),
    cita: txt(s.cita),
    url: txt(s.url),
    fila: txt(s.fila),
    serie: txt(s.serie),
    descripcion: txt(s.descripcion),
    descripcion_en: txt(s.descripcion_en),
    descrito: d === "pilo" || d === "persona" || d === "codigo" ? d : "",
    formula: txt(s.formula),
  };
}

export const KIND_CIFRA: Record<string, string> = {
  indicador: "Indicador de una oficina",
  libro: "Libro de Datos de Sostenibilidad",
  tabla: "Tabla de Datos de Sostenibilidad",
  documento: "Documento",
  cifras: "UDES en Cifras / Warehouse",
  noticia: "Noticia",
  derivada: "Calculada",
  derived: "Calculada",
};
export const etiquetaKind = (k: string): string => KIND_CIFRA[k] ?? (k ? k : "Sin tipo de fuente");

/** Quita el año del final o entre paréntesis de una etiqueta: «Graduados 2024» → «Graduados». */
export function sinAnio(t: string): string {
  return t
    .replace(/\s*[(\[]\s*(19|20)\d{2}\s*[)\]]\s*/g, " ")
    .replace(/\s*[-–·,:]?\s*\b(19|20)\d{2}\b\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** La serie de una cifra: la que dice `source.serie` o, si falta, la clave sin el año final. */
export function serieDe(c: Pick<CifraPP, "key" | "source" | "year">): string {
  const s = fuenteDe(c).serie;
  if (s) return s;
  const m = /^(.*?)[:_|-]((?:19|20)\d{2})$/.exec(c.key);
  return m ? m[1] : c.key;
}

export const unidadNorm = (u: string): string => u.trim().toLowerCase().replace(/\s+/g, " ");
export const unidadTexto = (u: string): string => (u.trim() ? u.trim() : "sin unidad");

export interface Explicacion {
  texto: string;
  /** `descrita`: hay una descripción (de Pilo, de una persona o del código). `armada`: resumen de la procedencia. `ninguna`: nada que decir. */
  origen: "descrita" | "armada" | "ninguna";
}

/** «Qué es» una cifra: su descripción o, si falta, un resumen armado con lo que se sabe de dónde sale. */
export function explicacionDe(c: CifraPP): Explicacion {
  const f = fuenteDe(c);
  if (f.descripcion) return { texto: f.descripcion, origen: "descrita" };
  const partes: string[] = [];
  const medida = f.indicador || f.columna;
  if (medida) partes.push(`Medida: ${medida}${f.desglose ? `, desglosada por ${f.desglose}` : ""}.`);
  else if (f.desglose) partes.push(`Desglose: ${f.desglose}.`);
  if (f.definicion) partes.push(f.definicion.endsWith(".") ? f.definicion : `${f.definicion}.`);
  const donde = [f.tabla && `la tabla «${f.tabla}»`, f.oficina && `la oficina de ${f.oficina}`].filter(Boolean).join(", de ");
  if (donde) partes.push(`Viene de ${donde}${f.periodo ? ` (${f.periodo})` : ""}.`);
  else if (f.periodo) partes.push(`Periodo: ${f.periodo}.`);
  if (c.derived) partes.push(`La calcula el sistema${c.formula || f.formula ? ` así: ${c.formula || f.formula}` : " a partir de otras cifras"}.`);
  if (!partes.length) return { texto: "", origen: "ninguna" };
  return { texto: partes.join(" "), origen: "armada" };
}
export const sinExplicar = (c: CifraPP): boolean => !fuenteDe(c).descripcion;

/** Las cifras del libro que aparecen nombradas en la fórmula de una derivada. */
export function componentesDe(c: CifraPP, libro: CifraPP[]): CifraPP[] {
  const f = c.formula || fuenteDe(c).formula;
  if (!c.derived || !f) return [];
  return libro.filter((x) => x.key !== c.key && x.key.length > 3 && f.includes(x.key));
}

/* ---------- Grupos por serie --------------------------------------------- */

export interface GrupoSerie {
  serie: string;
  /** Nombre común (la etiqueta sin año). */
  nombre: string;
  unidades: string[];
  cifras: CifraPP[];
  anios: number[];
}

export function agruparPorSerie(libro: CifraPP[]): GrupoSerie[] {
  const m = new Map<string, CifraPP[]>();
  for (const c of libro) {
    const s = serieDe(c);
    const a = m.get(s);
    if (a) a.push(c);
    else m.set(s, [c]);
  }
  const out: GrupoSerie[] = [];
  for (const [serie, cifras] of m) {
    cifras.sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.key.localeCompare(b.key));
    out.push({
      serie,
      nombre: sinAnio(cifras[0].label) || cifras[0].label || serie,
      unidades: Array.from(new Set(cifras.map((c) => unidadNorm(c.unit)))),
      cifras,
      anios: Array.from(new Set(cifras.map((c) => c.year).filter((y): y is number => typeof y === "number"))).sort((a, b) => a - b),
    });
  }
  return out.sort((a, b) => b.cifras.length - a.cifras.length || a.nombre.localeCompare(b.nombre, "es"));
}

/* ---------- Compatibilidad de gráficos ----------------------------------- */

export interface Diagnostico {
  ok: boolean;
  /** Lo que impide dibujar bien. */
  errores: string[];
  /** Lo que conviene revisar. */
  avisos: string[];
}

const tieneValor = (c: CifraPP): boolean => c.value !== null && c.value !== undefined && Number.isFinite(Number(c.value));
const esPct = (c: CifraPP): boolean => c.unit.trim() === "%";

/** ¿Estas cifras forman un gráfico válido de este tipo? Dice por qué no. */
export function diagnosticar(tipo: TipoGrafico, cifras: CifraPP[]): Diagnostico {
  const errores: string[] = [];
  const avisos: string[] = [];
  if (cifras.length === 0) return { ok: false, errores: ["Elige al menos una cifra."], avisos };

  const sinValor = cifras.filter((c) => !tieneValor(c));
  if (sinValor.length) errores.push(`Estas cifras no tienen valor y no se pueden dibujar: ${sinValor.map((c) => c.label).join(", ")}.`);

  const unidades = Array.from(new Set(cifras.map((c) => unidadNorm(c.unit))));
  if (unidades.length > 1) errores.push(`Mezclan unidades distintas (${unidades.map((u) => (u ? u : "sin unidad")).join(" y ")}): una sola escala no sirve. Elige cifras de la misma unidad.`);

  const series = Array.from(new Set(cifras.map(serieDe)));
  const sinAnioN = cifras.filter((c) => c.year === null || c.year === undefined).length;

  if (tipo === "donut") {
    if (cifras.length !== 1) errores.push("El anillo muestra un solo porcentaje. Para comparar varias cifras usa barras.");
    else if (!esPct(cifras[0])) errores.push("El anillo es solo para porcentajes (unidad %).");
  } else if (tipo === "line") {
    if (cifras.length < 2) errores.push("La línea necesita al menos dos años de la misma medida.");
    if (series.length > 1) errores.push("La línea es para una misma medida a través de los años. Estas cifras son de medidas distintas: usa barras.");
    if (sinAnioN) errores.push("La línea necesita que cada cifra tenga año; hay cifras sin año.");
    const anios = cifras.map((c) => c.year).filter((y) => y !== null);
    if (new Set(anios).size !== anios.length) errores.push("Hay dos cifras del mismo año: la línea necesita un valor por año.");
  } else if (tipo === "compare") {
    if (cifras.length < 2) errores.push("«Antes y ahora» necesita al menos dos años de la misma medida.");
    if (series.length > 1) errores.push("«Antes y ahora» es para una misma medida a través de los años. Estas cifras son de medidas distintas: usa barras o el mapa de calor.");
    if (sinAnioN) errores.push("«Antes y ahora» necesita que cada cifra tenga año; hay cifras sin año.");
    const anios = cifras.map((c) => c.year).filter((y) => y !== null);
    if (new Set(anios).size !== anios.length) errores.push("Hay dos cifras del mismo año: hace falta un valor por año.");
  } else if (tipo === "stack") {
    if (cifras.length < 2) errores.push("La composición necesita al menos dos partes de un mismo total.");
    if (new Set(cifras.map((c) => c.year)).size > 1) errores.push("Las partes de una composición deben ser del mismo año.");
    if (cifras.some((c) => tieneValor(c) && Number(c.value) < 0)) errores.push("Una composición no admite valores negativos.");
    if (cifras.length > 8) avisos.push("Más de 8 partes se leen mal: agrupa las menores en otra cifra.");
    avisos.push("El % de cada parte se calcula sobre la suma de las cifras que elijas: elige todas las partes del total, no solo algunas.");
  } else if (tipo === "heat") {
    if (sinAnioN) errores.push("El mapa de calor necesita que cada cifra tenga año; hay cifras sin año.");
    if (new Set(cifras.map((c) => c.year)).size < 2) errores.push("El mapa de calor necesita al menos dos años distintos.");
    const celdas = cifras.map((c) => `${serieDe(c)}§${c.year}`);
    if (new Set(celdas).size !== celdas.length) errores.push("Hay dos cifras de la misma medida y el mismo año: cada casilla lleva una sola.");
    if (series.length > 12) avisos.push("Más de 12 filas se leen mal. Considera elegir menos medidas.");
  } else {
    if (cifras.length < 2) avisos.push("Una sola barra dice poco: suma otras cifras de la misma unidad.");
    if (series.length === 1 && sinAnioN) errores.push("Para barras de una misma medida, cada cifra necesita año.");
    if (series.length === 1) {
      const anios = cifras.map((c) => c.year).filter((y) => y !== null);
      if (new Set(anios).size !== anios.length) errores.push("Hay dos cifras del mismo año de la misma medida.");
    }
  }
  if (cifras.length > 12) avisos.push("Más de 12 barras se leen mal. Considera elegir menos.");
  return { ok: errores.length === 0, errores, avisos };
}

/** Por qué esta cifra no se puede sumar a las ya elegidas (null si es compatible). */
export function motivoIncompatible(tipo: TipoGrafico, elegidas: CifraPP[], c: CifraPP): string | null {
  if (!tieneValor(c)) return "No tiene valor.";
  if (!elegidas.length) return tipo === "donut" && !esPct(c) ? "No es un porcentaje." : null;
  if (unidadNorm(elegidas[0].unit) !== unidadNorm(c.unit)) return `Otra unidad (${unidadTexto(c.unit)}; las elegidas son ${unidadTexto(elegidas[0].unit)}).`;
  if (tipo === "donut") return "El anillo muestra una sola cifra.";
  if (tipo === "line" || tipo === "compare") {
    if (serieDe(c) !== serieDe(elegidas[0])) return "Es otra medida: este gráfico es de una sola medida a través de los años.";
    if (c.year === null || elegidas.some((e) => e.year === c.year)) return "Ya hay una cifra de ese año (o no tiene año).";
  }
  return null;
}

/* ---------- Armar el gráfico --------------------------------------------- */

const dedupe = (xs: string[]): string[] => {
  const visto = new Map<string, number>();
  return xs.map((x) => {
    const n = (visto.get(x) ?? 0) + 1;
    visto.set(x, n);
    return n === 1 ? x : `${x} (${n})`;
  });
};

/** La etiqueta de cada punto: el año si es una misma medida; el nombre si se comparan medidas. */
export function etiquetasPuntos(cifras: CifraPP[]): string[] {
  const series = new Set(cifras.map(serieDe));
  const anios = new Set(cifras.map((c) => c.year));
  if (series.size === 1 && !cifras.some((c) => c.year === null)) return dedupe(cifras.map((c) => String(c.year)));
  if (anios.size === 1) return dedupe(cifras.map((c) => sinAnio(c.label) || c.key));
  return dedupe(cifras.map((c) => `${sinAnio(c.label) || c.key}${c.year ? ` ${c.year}` : ""}`));
}

const rango = (cs: CifraPP[]): string => {
  const a = cs.map((c) => c.year).filter((y): y is number => typeof y === "number");
  if (!a.length) return "";
  const mn = Math.min(...a);
  const mx = Math.max(...a);
  return mn === mx ? String(mn) : `${mn}–${mx}`;
};
const lista = (xs: string[], y: string): string => (xs.length <= 1 ? (xs[0] ?? "") : xs.length === 2 ? `${xs[0]} ${y} ${xs[1]}` : `${xs.slice(0, 2).join(", ")} ${y} ${xs.length - 2} más`);

/** Título sugerido (sin cifras; solo años). */
export function tituloSugerido(tipo: TipoGrafico, cifras: CifraPP[]): { es: string; en: string } {
  if (!cifras.length) return { es: "", en: "" };
  const nombre = (c: CifraPP, en: boolean) => sinAnio((en && c.label_en.trim() ? c.label_en : c.label) || c.key);
  const misma = new Set(cifras.map(serieDe)).size === 1;
  const r = rango(cifras);
  if (misma || tipo === "donut") {
    const c = cifras[0];
    return { es: `${nombre(c, false)}${r ? `, ${r}` : ""}`, en: `${nombre(c, true)}${r ? `, ${r}` : ""}` };
  }
  const es = lista(Array.from(new Set(cifras.map((c) => nombre(c, false)))), "y");
  const en = lista(Array.from(new Set(cifras.map((c) => nombre(c, true)))), "and");
  return { es: `${es}${r ? `, ${r}` : ""}`, en: `${en}${r ? `, ${r}` : ""}` };
}

export function specDeCifras(tipo: TipoGrafico, cifras: CifraPP[], titulo?: { es: string; en: string }): SpecGrafico {
  const orden = [...cifras].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  const ordenadas = new Set(orden.map(serieDe)).size === 1 ? orden : cifras;
  // El mapa de calor pone los años en las columnas: cada punto se rotula con su año y la fila sale de la medida.
  const x = tipo === "heat" ? ordenadas.map((c) => String(c.year ?? "")) : etiquetasPuntos(ordenadas);
  const t = titulo ?? tituloSugerido(tipo, ordenadas);
  return { chart: tipo, series: ordenadas.map((c, i) => ({ x: x[i], cifra: c.key })), title_es: t.es, title_en: t.en };
}

/* ---------- Sugerencias automáticas -------------------------------------- */

export interface Sugerencia {
  id: string;
  tipo: TipoGrafico;
  motivo: string;
  cifras: CifraPP[];
  spec: SpecGrafico;
}

const claveSet = (keys: string[]): string => [...keys].sort().join("|");

/** Gráficos que se arman solos agrupando el libro por serie, unidad y año. Sin red, sin Pilo. */
export function sugerirGraficos(libro: CifraPP[], existentes: SpecGrafico[], max = 18): Sugerencia[] {
  const yaHay = new Set(existentes.map((s) => claveSet((s.series ?? []).map((x) => x.cifra))));
  const out: Sugerencia[] = [];
  const agrega = (id: string, tipo: TipoGrafico, motivo: string, cifras: CifraPP[]) => {
    if (!diagnosticar(tipo, cifras).ok) return;
    const spec = specDeCifras(tipo, cifras);
    if (yaHay.has(claveSet((spec.series ?? []).map((x) => x.cifra)))) return;
    out.push({ id, tipo, motivo, cifras, spec });
  };
  const utiles = libro.filter((c) => tieneValor(c));

  // 1) Una misma medida en varios años → línea o barras
  const porSerie = new Map<string, CifraPP[]>();
  for (const c of utiles) {
    if (c.year === null || c.year === undefined) continue;
    const k = `${serieDe(c)}§${unidadNorm(c.unit)}`;
    porSerie.set(k, [...(porSerie.get(k) ?? []), c]);
  }
  for (const [k, cs] of porSerie) {
    const unicas = Array.from(new Map(cs.map((c) => [c.year, c])).values()).sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    if (unicas.length < 2) continue;
    agrega(`serie:${k}`, unicas.length >= 3 ? "line" : "bar", `Una misma medida en ${unicas.length} años (${rango(unicas)}).`, unicas);
  }

  // 2) Medidas distintas de la misma unidad, mismo año y misma tabla → barras
  const comp = new Map<string, CifraPP[]>();
  for (const c of utiles) {
    if (c.year === null || c.year === undefined) continue;
    const f = fuenteDe(c);
    const origen = f.tabla || c.key.split(":").slice(0, 2).join(":");
    const k = `${origen}§${unidadNorm(c.unit)}§${c.year}`;
    comp.set(k, [...(comp.get(k) ?? []), c]);
  }
  for (const [k, cs] of comp) {
    const porMedida = Array.from(new Map(cs.map((c) => [serieDe(c), c])).values());
    if (porMedida.length < 2) continue;
    const top = porMedida.sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 6);
    agrega(`comp:${k}`, "bar", `${top.length} medidas de la misma unidad en ${top[0].year}.`, top);
  }

  // 3) Porcentajes → anillo con el año más reciente de cada medida
  const pct = new Map<string, CifraPP>();
  for (const c of utiles) {
    if (!esPct(c)) continue;
    const s = serieDe(c);
    const a = pct.get(s);
    if (!a || (c.year ?? 0) > (a.year ?? 0)) pct.set(s, c);
  }
  for (const [s, c] of Array.from(pct).slice(0, 8)) agrega(`pct:${s}`, "donut", "Un porcentaje, con el dato más reciente.", [c]);

  return out.slice(0, max);
}
