/* =============================================================================
   Pilo Publica · el LIBRO DE CIFRAS (lógica pura, sin IA y sin red).

   El estadístico sin IA: de las cifras crudas que leen las fuentes (cada una
   con su rastro: tabla, fila, cita, enlace) arma el libro del informe:
     · valida: descarta valores nulos o no numéricos, años fuera de rango,
       porcentajes imposibles y duplicados absurdos (la misma serie y el mismo
       año con dos valores distintos), y lo dice en `avisos`;
     · calcula en código las DERIVADAS, con `derived = true` y la fórmula
       legible: variación entre años (en % o, si la serie ya es un %, en
       puntos porcentuales), promedio y total acumulado de los años, total de
       las partes de un mismo año y la participación % de cada parte.
   Cada cifra sale con un nombre legible («qué mide — desglose (año)») y su
   procedencia en `source` (SourceCifra: tabla, oficina, columna, desglose,
   periodo, indicador, definición, cita, serie…); las derivadas traen además
   su fórmula, sus bases y una descripción escrita por el código.
   La IA nunca escribe un número: elige keys de este libro.

   Las keys son estables (se reconstruyen igual en cada corrida) para que el
   upsert por (informe_id, key) no duplique y los bloques sigan apuntando a la
   misma cifra.
   ========================================================================== */

import type { SourceCifra } from "./contrato.ts";

/** Una cifra tal como la lee una fuente, antes de validarla. */
export interface CifraCruda {
  key: string;
  /** La serie a la que pertenece (misma medida en distintos años): la key sin el año. Va también en `source.serie`. */
  serie: string;
  /** Respaldo del nombre si no hay `que`. */
  label: string;
  label_en?: string;
  /** Qué mide, sin desglose ni año («Personas atendidas en brigadas de salud»). El label sale de aquí. */
  que?: string;
  que_en?: string;
  /** La parte («Sede Bucaramanga»): va en el label y en `source.desglose`. */
  desglose?: string;
  unit: string;
  year: number | null;
  value: number | null;
  source: SourceCifra;
  indicator?: string | null;
  /** ¿Tiene sentido sumarla entre años o entre partes? (personas atendidas sí; una tasa no). */
  sumable?: boolean;
  /** Partes de un total del mismo año (p. ej. por sede): mismo grupo → total y participación. */
  grupo?: string;
  /** El nombre de la parte («Bucaramanga»). */
  parte?: string;
}

/** Una fila de pp_cifras. */
export interface CifraLibro {
  key: string;
  label: string;
  label_en: string;
  unit: string;
  year: number | null;
  value: number;
  derived: boolean;
  formula: string;
  source: SourceCifra;
  indicator: string | null;
}

/* ---------- Etiquetas legibles ------------------------------------------------------- */

const espacios = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Corta un texto en el último espacio antes de `max` (sin dejar media palabra). */
export function cortar(s: string, max: number): string {
  const t = espacios(s);
  if (t.length <= max) return t;
  const c = t.slice(0, max - 1);
  const i = c.lastIndexOf(" ");
  return `${(i > max * 0.6 ? c.slice(0, i) : c).replace(/[\s,;:.—–-]+$/, "")}…`;
}

/** «<qué mide> — <desglose> (<año>)», sin claves técnicas. */
export function etiquetaCifra(que: string, desglose?: string | null, year?: number | null): string {
  const q = cortar(que, 150);
  const d = espacios(desglose);
  return `${q}${d && !q.toLowerCase().includes(d.toLowerCase()) ? ` — ${cortar(d, 60)}` : ""}${year ? ` (${year})` : ""}`;
}

/** El nombre de la serie: sin el año final. */
const nombreSerie = (c: CifraCruda, en = false): string => {
  const que = en ? c.que_en ?? "" : c.que ?? "";
  if (que) return etiquetaCifra(que, c.desglose, null);
  const l = en ? c.label_en ?? "" : c.label;
  return l.replace(/\s*\((19|20)\d{2}\)\s*$/, "");
};

export interface OpcionesLibro {
  /** Primer y último año aceptables (incluidos). */
  anioMin: number;
  anioMax: number;
}

/* ---------- Unidades y formato ------------------------------------------------------ */

/** Unidad normalizada: «porcentaje», «%», «pct» → «%»; el resto, en minúscula y sin espacios de más. */
export function normalizarUnidad(u: string | null | undefined): string {
  const t = String(u ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (/^(%|porcentaje|porcentual|pct|percent(age)?)$/i.test(t)) return "%";
  return t.toLowerCase().slice(0, 40);
}

const redondear = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** El valor como se escribe en el informe: «1.234,5», «12,5 %», «3,2 p. p.» (es) o «1,234.5», «12.5%», «3.2 pp» (en). */
export function formatoValor(value: number, unit: string, idioma: "es" | "en" = "es"): string {
  const local = idioma === "es" ? "es-CO" : "en-US";
  const s = value.toLocaleString(local, { maximumFractionDigits: 2, minimumFractionDigits: 0, useGrouping: Math.abs(value) >= 10000 || idioma === "en" });
  if (unit === "%") return idioma === "es" ? `${s} %` : `${s}%`;
  if (unit === "pp") return idioma === "es" ? `${s} p. p.` : `${s} pp`;
  return s;
}

/* ---------- Validación ----------------------------------------------------------------- */

const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return null;
};

/** Junta los avisos repetidos en uno con el conteo y hasta tres ejemplos. */
function resumirAvisos(lista: { tipo: string; ejemplo: string }[]): string[] {
  const porTipo = new Map<string, string[]>();
  for (const a of lista) porTipo.set(a.tipo, [...(porTipo.get(a.tipo) ?? []), a.ejemplo]);
  return [...porTipo.entries()].map(([tipo, ej]) => `${tipo} (${ej.length}): ${ej.slice(0, 3).join("; ")}${ej.length > 3 ? "…" : ""}.`);
}

/** Valida las crudas: lo que pasa y por qué se descartó el resto. */
export function validarCrudas(crudas: CifraCruda[], op: OpcionesLibro): { buenas: CifraCruda[]; avisos: string[] } {
  const malos: { tipo: string; ejemplo: string }[] = [];
  const porKey = new Map<string, CifraCruda>();
  const porSerieAnio = new Map<string, CifraCruda>();
  for (const c0 of crudas) {
    const label = c0.que ? etiquetaCifra(c0.que, c0.desglose, c0.year) : espacios(c0.label);
    const label_en = c0.que_en ? etiquetaCifra(c0.que_en, c0.desglose, c0.year) : espacios(c0.label_en);
    const c = { ...c0, unit: normalizarUnidad(c0.unit), label: cortar(label, 200), label_en: cortar(label_en, 200) };
    const v = numero(c.value);
    const nombre = `«${c.label.slice(0, 60)}»${c.year ? ` ${c.year}` : ""}`;
    if (!c.key || !c.label) {
      malos.push({ tipo: "Cifras sin clave o sin nombre descartadas", ejemplo: c.key || "(sin clave)" });
      continue;
    }
    if (v === null) {
      malos.push({ tipo: "Cifras sin valor numérico descartadas", ejemplo: nombre });
      continue;
    }
    if (c.year !== null && (!Number.isInteger(c.year) || c.year < op.anioMin || c.year > op.anioMax)) {
      malos.push({ tipo: `Cifras con un año fuera de ${op.anioMin}–${op.anioMax} descartadas`, ejemplo: nombre });
      continue;
    }
    if (c.unit === "%" && (v < 0 || v > 100)) {
      malos.push({ tipo: "Porcentajes fuera de 0–100 descartados", ejemplo: `${nombre} = ${v}` });
      continue;
    }
    const previa = porKey.get(c.key);
    if (previa) {
      if (previa.value !== v) malos.push({ tipo: "Cifras repetidas con otro valor (se dejó la primera)", ejemplo: `${nombre}: ${previa.value} y ${v}` });
      continue;
    }
    const sa = c.year !== null ? `${c.serie}|${c.year}` : "";
    const gemela = sa ? porSerieAnio.get(sa) : undefined;
    if (gemela) {
      if (gemela.value !== v) malos.push({ tipo: "La misma serie y el mismo año con dos valores (se dejó la primera)", ejemplo: `${nombre}: ${gemela.value} y ${v}` });
      continue;
    }
    const buena = { ...c, value: v };
    porKey.set(c.key, buena);
    if (sa) porSerieAnio.set(sa, buena);
  }
  return { buenas: [...porKey.values()], avisos: resumirAvisos(malos) };
}

/* ---------- Derivadas -------------------------------------------------------------------- */

/** La procedencia de una derivada: calculada en código, con su fórmula, sus bases y una descripción del código. */
const rastroDerivado = (
  de: CifraCruda,
  bases: string[],
  formula: string,
  serie: string,
  descripcion: string,
  extra: Partial<SourceCifra> = {},
): SourceCifra => ({
  kind: de.source.kind,
  tabla: "Libro de cifras del informe (calculada)",
  tabla_db: "pp_cifras",
  ref: "derivada",
  ...(de.source.oficina ? { oficina: de.source.oficina } : {}),
  ...(de.source.indicador_id ? { indicador_id: de.source.indicador_id } : {}),
  ...(de.source.indicador ? { indicador: de.source.indicador } : {}),
  bases,
  formula,
  nota: formula,
  serie,
  descripcion: cortar(descripcion, 240),
  descrito: "codigo",
  ...extra,
});

const base = (c: CifraCruda): CifraLibro => ({
  key: c.key,
  label: c.label,
  label_en: c.label_en ?? "",
  unit: c.unit,
  year: c.year,
  value: c.value as number,
  derived: false,
  formula: "",
  source: {
    ...c.source,
    serie: c.source.serie || c.serie,
    ...(c.desglose && !c.source.desglose ? { desglose: c.desglose } : {}),
    ...(c.year !== null && !c.source.periodo ? { periodo: String(c.year) } : {}),
  },
  indicator: c.indicator ?? null,
});

const v = (c: CifraCruda) => c.value as number;

/** Las derivadas de una serie (misma medida, varios años). */
function derivadasDeSerie(serie: string, lista: CifraCruda[], avisos: string[]): CifraLibro[] {
  const conAnio = lista.filter((c) => c.year !== null).sort((a, b) => (a.year as number) - (b.year as number));
  if (conAnio.length < 2) return [];
  const unidades = new Set(conAnio.map((c) => c.unit));
  if (unidades.size > 1) {
    avisos.push(`La serie «${conAnio[0].label.slice(0, 60)}» mezcla unidades (${[...unidades].join(", ")}): no se calcularon variaciones.`);
    return [];
  }
  const primera = conAnio[0];
  const unit = primera.unit;
  const etiqueta = nombreSerie(primera);
  const etiquetaEn = nombreSerie(primera, true);
  const indicator = primera.indicator ?? null;
  const desglose = primera.desglose ? { desglose: primera.desglose } : {};
  const out: CifraLibro[] = [];
  const variacion = (a: CifraCruda, b: CifraCruda) => {
    const ya = a.year as number;
    const yb = b.year as number;
    const key = `der:var:${serie}:${ya}-${yb}`;
    if (unit === "%") {
      const formula = `${formatoValor(v(b), "%")} (${yb}) − ${formatoValor(v(a), "%")} (${ya})`;
      out.push({
        key,
        label: `Cambio de ${etiqueta} entre ${ya} y ${yb} (puntos porcentuales)`,
        label_en: etiquetaEn ? `Change in ${etiquetaEn}, ${ya}–${yb} (percentage points)` : "",
        unit: "pp",
        year: yb,
        value: redondear(v(b) - v(a), 2),
        derived: true,
        formula,
        source: rastroDerivado(primera, [a.key, b.key], formula, key, `Diferencia, en puntos porcentuales, entre el valor de ${yb} y el de ${ya} de «${etiqueta}». La calcula el sistema con esas dos cifras del libro.`, {
          ...desglose,
          periodo: `${ya}–${yb}`,
          ...(etiquetaEn ? { descripcion_en: cortar(`Difference, in percentage points, between the ${yb} and ${ya} values of “${etiquetaEn}”. Computed by the system from those two figures.`, 240) } : {}),
        }),
        indicator,
      });
      return;
    }
    if (v(a) === 0) return;
    const formula = `(${formatoValor(v(b), unit)} − ${formatoValor(v(a), unit)}) / ${formatoValor(Math.abs(v(a)), unit)} × 100 (${yb} frente a ${ya})`;
    out.push({
      key,
      label: `Variación de ${etiqueta} entre ${ya} y ${yb}`,
      label_en: etiquetaEn ? `Change in ${etiquetaEn}, ${ya}–${yb}` : "",
      unit: "%",
      year: yb,
      value: redondear(((v(b) - v(a)) / Math.abs(v(a))) * 100, 1),
      derived: true,
      formula,
      source: rastroDerivado(primera, [a.key, b.key], formula, key, `Variación porcentual de «${etiqueta}» de ${ya} a ${yb}: la diferencia entre los dos años dividida por el valor de ${ya}. La calcula el sistema con esas dos cifras del libro.`, {
        ...desglose,
        periodo: `${ya}–${yb}`,
        ...(etiquetaEn ? { descripcion_en: cortar(`Percentage change in “${etiquetaEn}” from ${ya} to ${yb}: the difference between both years divided by the ${ya} value. Computed by the system.`, 240) } : {}),
      }),
      indicator,
    });
  };
  const ultimo = conAnio[conAnio.length - 1];
  variacion(conAnio[conAnio.length - 2], ultimo);
  if (conAnio.length >= 3) variacion(conAnio[0], ultimo);

  const y0 = primera.year as number;
  const y1 = ultimo.year as number;
  const suma = conAnio.reduce((s, c) => s + v(c), 0);
  const formulaProm = `(${conAnio.map((c) => `${formatoValor(v(c), unit)} [${c.year}]`).join(" + ")}) / ${conAnio.length}`;
  const keyProm = `der:prom:${serie}:${y0}-${y1}`;
  out.push({
    key: keyProm,
    label: `Promedio anual de ${etiqueta}, ${y0}–${y1}`,
    label_en: etiquetaEn ? `Annual average of ${etiquetaEn}, ${y0}–${y1}` : "",
    unit,
    year: null,
    value: redondear(suma / conAnio.length, 2),
    derived: true,
    formula: formulaProm,
    source: rastroDerivado(primera, conAnio.map((c) => c.key), formulaProm, keyProm, `Promedio de los valores anuales de «${etiqueta}» entre ${y0} y ${y1}. Lo calcula el sistema con las cifras de esos años.`, {
      ...desglose,
      periodo: `${y0}–${y1}`,
      ...(etiquetaEn ? { descripcion_en: cortar(`Average of the yearly values of “${etiquetaEn}” between ${y0} and ${y1}. Computed by the system.`, 240) } : {}),
    }),
    indicator,
  });
  if (conAnio.every((c) => c.sumable) && unit !== "%") {
    const formulaTot = conAnio.map((c) => `${formatoValor(v(c), unit)} [${c.year}]`).join(" + ");
    const keyAcum = `der:acum:${serie}:${y0}-${y1}`;
    out.push({
      key: keyAcum,
      label: `Total acumulado de ${etiqueta}, ${y0}–${y1}`,
      label_en: etiquetaEn ? `Cumulative total of ${etiquetaEn}, ${y0}–${y1}` : "",
      unit,
      year: null,
      value: redondear(suma, 2),
      derived: true,
      formula: formulaTot,
      source: rastroDerivado(primera, conAnio.map((c) => c.key), formulaTot, keyAcum, `Suma de los valores anuales de «${etiqueta}» entre ${y0} y ${y1}. La calcula el sistema con las cifras de esos años.`, {
        ...desglose,
        periodo: `${y0}–${y1}`,
        ...(etiquetaEn ? { descripcion_en: cortar(`Sum of the yearly values of “${etiquetaEn}” between ${y0} and ${y1}. Computed by the system.`, 240) } : {}),
      }),
      indicator,
    });
  }
  return out;
}

/** Total de las partes de un mismo año y la participación % de cada una. */
function derivadasDeGrupo(grupo: string, partes: CifraCruda[], avisos: string[]): CifraLibro[] {
  if (partes.length < 2) return [];
  const unidades = new Set(partes.map((c) => c.unit));
  if (unidades.size > 1 || partes.some((c) => !c.sumable) || unidades.has("%")) {
    if (unidades.size > 1) avisos.push(`Las partes de «${partes[0].label.slice(0, 60)}» tienen unidades distintas: no se sumaron.`);
    return [];
  }
  const primera = partes[0];
  const unit = primera.unit;
  const year = primera.year;
  const total = partes.reduce((s, c) => s + v(c), 0);
  if (total <= 0) return [];
  const indicator = primera.indicator ?? null;
  // El nombre del todo: «qué mide» sin la parte (o el label sin su desglose y su año, en filas viejas).
  const nombre = primera.que ? cortar(primera.que, 150) : primera.label.replace(/\s*\((19|20)\d{2}\)\s*$/, "").replace(/\s*[—–]\s*[^—–]+$/, "");
  const nombreEn = primera.que_en ? cortar(primera.que_en, 150) : (primera.label_en ?? "").replace(/\s*\((19|20)\d{2}\)\s*$/, "").replace(/\s*[—–]\s*[^—–]+$/, "");
  const parteDe = (c: CifraCruda) => c.parte ?? c.desglose ?? c.label;
  const formulaTot = partes.map((c) => `${formatoValor(v(c), unit)} [${parteDe(c)}]`).join(" + ");
  const totKey = `der:tot:${grupo}${year !== null ? `:${year}` : ""}`;
  const anio = year !== null ? ` (${year})` : "";
  const nombresPartes = partes.map(parteDe).join(", ");
  const out: CifraLibro[] = [
    {
      key: totKey,
      label: `${nombre} — total de las partes${anio}`,
      label_en: nombreEn ? `${nombreEn} — total${anio}` : "",
      unit,
      year,
      value: redondear(total, 2),
      derived: true,
      formula: formulaTot,
      source: rastroDerivado(primera, partes.map((c) => c.key), formulaTot, `der:tot:${grupo}`, `Suma de «${nombre}» en sus partes (${cortar(nombresPartes, 120)})${year !== null ? ` en ${year}` : ""}. La calcula el sistema con las cifras de cada parte.`, {
        desglose: "Total de las partes",
        ...(year !== null ? { periodo: String(year) } : {}),
        ...(nombreEn ? { descripcion_en: cortar(`Sum of “${nombreEn}” across its parts (${nombresPartes})${year !== null ? ` in ${year}` : ""}. Computed by the system.`, 240) } : {}),
      }),
      indicator,
    },
  ];
  for (const c of partes) {
    const formula = `${formatoValor(v(c), unit)} / ${formatoValor(total, unit)} × 100`;
    const parte = parteDe(c);
    out.push({
      key: `der:part:${c.key}`,
      label: `Participación de ${parte} en ${nombre}${anio}`,
      label_en: nombreEn ? `Share of ${parte} in ${nombreEn}${anio}` : "",
      unit: "%",
      year,
      value: redondear((v(c) / total) * 100, 1),
      derived: true,
      formula,
      source: rastroDerivado(c, [c.key, totKey], formula, `der:part:${c.serie}`, `Porcentaje que representa ${parte} dentro del total de «${nombre}»${year !== null ? ` en ${year}` : ""}. Lo calcula el sistema: el valor de la parte dividido por la suma de las partes.`, {
        desglose: parte,
        ...(year !== null ? { periodo: String(year) } : {}),
        ...(nombreEn ? { descripcion_en: cortar(`Share of ${parte} in the total of “${nombreEn}”${year !== null ? ` in ${year}` : ""}: the part divided by the sum of all parts. Computed by the system.`, 240) } : {}),
      }),
      indicator,
    });
  }
  return out;
}

/**
 * El libro completo: las cifras validadas y sus derivadas.
 * Las partes de un grupo no forman series entre años por sí solas: la serie
 * de cada parte sí (su `serie` la da la fuente).
 */
export function armarLibro(crudas: CifraCruda[], op: OpcionesLibro): { cifras: CifraLibro[]; derivadas: CifraLibro[]; avisos: string[] } {
  const { buenas, avisos } = validarCrudas(crudas, op);
  const cifras = buenas.map(base);
  const derivadas: CifraLibro[] = [];
  const series = new Map<string, CifraCruda[]>();
  for (const c of buenas) series.set(c.serie, [...(series.get(c.serie) ?? []), c]);
  for (const [s, lista] of series) derivadas.push(...derivadasDeSerie(s, lista, avisos));
  const grupos = new Map<string, CifraCruda[]>();
  for (const c of buenas) if (c.grupo) grupos.set(`${c.grupo}|${c.year ?? ""}`, [...(grupos.get(`${c.grupo}|${c.year ?? ""}`) ?? []), c]);
  for (const [g, partes] of grupos) derivadas.push(...derivadasDeGrupo(g.split("|")[0], partes, avisos));
  // Una derivada nunca pisa una cifra de fuente con la misma key.
  const usadas = new Set(cifras.map((c) => c.key));
  const unicas = derivadas.filter((d) => (usadas.has(d.key) ? false : (usadas.add(d.key), true)));
  return { cifras, derivadas: unicas, avisos };
}

/* ---------- Agregación de filas (Datos de Sostenibilidad, UDES en Cifras) --------------- */

/** El año de un periodo escrito a mano («2025», «2025-1», «2025-II», «01/03/2025»), o null. */
export function anioDePeriodo(p: unknown): number | null {
  if (typeof p === "number" && Number.isInteger(p)) return p >= 1990 && p <= 2100 ? p : null;
  const m = String(p ?? "").match(/(?<!\d)(19[9]\d|20\d{2})(?!\d)/);
  return m ? Number(m[1]) : null;
}

/** Un número escrito a mano («1.234,5», «12 %», 15) o null. */
export function aNumeroLibre(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/[%\s$]/g, "");
  if (!t || !/^-?[\d.,]+$/.test(t)) return null;
  const normal = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : /^-?\d+,\d+$/.test(t) ? t.replace(",", ".") : /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, "") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Junta varios valores del mismo año según la regla del indicador. */
export function resumir(valores: number[], regla: "suma" | "promedio" | "ultimo"): number | null {
  if (!valores.length) return null;
  if (regla === "suma") return redondear(valores.reduce((a, b) => a + b, 0), 4);
  if (regla === "ultimo") return valores[valores.length - 1];
  return redondear(valores.reduce((a, b) => a + b, 0) / valores.length, 4);
}

/* ---------- El libro para la IA ---------------------------------------------------------- */

type CifraDato = Pick<CifraLibro, "key" | "label" | "unit" | "year" | "value" | "derived" | "formula"> & { source?: SourceCifra | null };

const sinBarras = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();

/** La serie de una cifra: `source.serie` o, en filas viejas, la key sin el año final. */
export function serieDeCifra(c: { key: string; source?: SourceCifra | null }): string {
  const s = String(c.source?.serie ?? "").trim();
  if (s) return s;
  const m = /^(.*?)[:_|-]((?:19|20)\d{2})$/.exec(c.key);
  return m ? m[1] : c.key;
}

/** Una cifra como dato para el modelo: key, nombre, unidad, año, valor ya escrito y, si la hay, qué mide. */
export function lineaLibro(c: CifraDato): string {
  const que = String(c.source?.descripcion ?? "").trim();
  return `· ${c.key} | ${sinBarras(c.label)} | ${c.unit || "—"} | ${c.year ?? "—"} | ${formatoValor(Number(c.value), c.unit)}${c.derived ? ` | derivada: ${sinBarras(c.formula)}` : ""}${que ? ` | qué mide: ${sinBarras(cortar(que, 200))}` : ""}`;
}

/** El libro como bloque de datos, acotado para no pasarse del contexto del modelo. */
export function libroComoDato(cifras: CifraDato[], max = 160): string {
  const lista = cifras.slice(0, max).map(lineaLibro).join("\n");
  return `<<<LIBRO\nkey | qué mide | unidad | año | valor | (derivada) | (descripción)\n${lista.replace(/<<<LIBRO|LIBRO>>>/g, "")}\nLIBRO>>>${cifras.length > max ? `\n(Se muestran ${max} de ${cifras.length} cifras.)` : ""}`;
}

/**
 * El libro agrupado por SERIE (la misma medida en varios años) para el
 * estadístico: así arma líneas con una sola serie y barras comparando series
 * de la misma unidad, sin adivinar qué cifra va con cuál.
 */
export function libroPorSeries(cifras: CifraDato[], maxCifras = 170): string {
  const grupos = new Map<string, CifraDato[]>();
  for (const c of cifras.slice(0, maxCifras)) {
    const s = serieDeCifra(c);
    grupos.set(s, [...(grupos.get(s) ?? []), c]);
  }
  const partes: string[] = [];
  let n = 0;
  for (const [s, lista] of grupos) {
    n++;
    const orden = [...lista].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    const c0 = orden[orden.length - 1];
    const nombre = sinBarras(c0.label.replace(/\s*\((19|20)\d{2}\)\s*$/, ""));
    const que = String(c0.source?.descripcion ?? "").trim();
    const anios = [...new Set(orden.map((c) => c.year).filter((y): y is number => y !== null))];
    partes.push(
      [
        `[S${n}] serie «${sinBarras(s).slice(0, 90)}» · ${nombre} · unidad: ${c0.unit || "sin unidad"}${c0.derived ? " · calculada" : ""}${anios.length >= 2 ? ` · ${anios.length} años` : ""}`,
        que ? `   qué mide: ${sinBarras(cortar(que, 220))}` : "",
        ...orden.map((c) => `   · ${c.key} | ${c.year ?? "—"} | ${formatoValor(Number(c.value), c.unit)}${c.derived ? ` | ${sinBarras(c.formula).slice(0, 140)}` : ""}`),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return `<<<LIBRO\nCada serie es la MISMA medida en distintos años (key | año | valor).\n${partes.join("\n").replace(/<<<LIBRO|LIBRO>>>/g, "")}\nLIBRO>>>${cifras.length > maxCifras ? `\n(Se muestran ${maxCifras} de ${cifras.length} cifras.)` : ""}`;
}

/* ---------- Conservar las descripciones al rehacer el libro ------------------------------ */

type FilaPrevia = Pick<CifraLibro, "key" | "label" | "label_en" | "value" | "year"> & { source: SourceCifra | null };

/**
 * Al volver a armar el libro, lo que explicó una persona se conserva siempre;
 * lo que explicó Pilo, solo si la cifra no cambió de valor ni de año (si cambió,
 * se vuelve a describir). Las derivadas traen su descripción del código.
 */
export function conservarDescripciones<T extends Pick<CifraLibro, "key" | "label" | "label_en" | "value" | "year" | "source">>(nuevas: T[], previas: FilaPrevia[]): T[] {
  const porKey = new Map(previas.map((p) => [p.key, p]));
  return nuevas.map((n) => {
    const p = porKey.get(n.key);
    const d = p?.source?.descrito;
    // Derivadas: el código reescribe el español; el inglés que completó Pilo se conserva si la cifra no cambió.
    if (p && d === "codigo" && Number(p.value) === Number(n.value)) {
      return {
        ...n,
        label_en: n.label_en || p.label_en,
        source: { ...n.source, ...(!n.source?.descripcion_en && p.source?.descripcion_en ? { descripcion_en: p.source.descripcion_en } : {}) },
      };
    }
    if (!p || (d !== "persona" && d !== "pilo")) return n;
    if (d === "pilo" && (Number(p.value) !== Number(n.value) || (p.year ?? null) !== (n.year ?? null))) return n;
    const s = p.source ?? ({} as SourceCifra);
    return {
      ...n,
      label: p.label || n.label,
      label_en: p.label_en || n.label_en,
      source: {
        ...n.source,
        ...(s.descripcion ? { descripcion: s.descripcion } : {}),
        ...(s.descripcion_en ? { descripcion_en: s.descripcion_en } : {}),
        descrito: d,
        ...(s.descrito_at ? { descrito_at: s.descrito_at } : {}),
      },
    };
  });
}
