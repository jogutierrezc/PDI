/* =============================================================================
   Pilo redacta informes ODS · fuentes que no son noticias (lógica pura).

   Qué hay de verdad en el esquema (revisado contra las migraciones):
     · impacto   indicadores de Impacto (0078): imp_alignments (target 'ods',
                 sdg) → imp_indicators (nombre, unidad) → imp_values (cifra
                 global del año: program_id nulo). CONECTADO.
     · cifras    UDES en Cifras (0019): od_indicators + od_values (total
                 institucional, campus nulo) de informes y periodos publicados y
                 no ilustrativos. No tienen ODS: se reconocen con el mismo
                 diccionario sin IA del motor de Impacto (imp_criteria, target
                 'ods'). CONECTADO.
     · proyecto  proyectos del PDI (0001, projects): tampoco tienen ODS; se
                 reconocen con imp_criteria sobre nombre, descripción y detalle.
                 CONECTADO (sin cifras: entran a «Proyectos»).
     · documento políticas y planes por subir: aún sin lector. NO CONECTADO.

   Cada dato se vuelve una «nota virtual» (id = ref, cuerpo = la frase del
   dato): así la verificación de citas y cifras de los párrafos vale igual que
   para las noticias, y el origen queda visible («Fuente: UDES en Cifras 2025»).
   ========================================================================== */

import type { NotaInforme } from "./logica.ts";

export type TipoFuente = "noticia" | "proyecto" | "cifras" | "impacto" | "documento";

export interface DatoFuente {
  kind: Exclude<TipoFuente, "noticia">;
  /** Referencia estable: «impacto:<id>:2025», «cifras:<id>:2025», «proyecto:<id>». */
  ref: string;
  titulo: string;
  /** La frase del dato; es lo que se cita literalmente. */
  texto: string;
  value: string | null;
  label: string;
  /** «UDES en Cifras 2025», «Indicadores de Impacto 2025», «Proyectos del PDI». */
  origen: string;
}

export const ESTADO_FUENTES: Record<TipoFuente, { conectada: boolean; nota: string }> = {
  noticia: { conectada: true, nota: "Noticias aprobadas del recolector (0143)." },
  impacto: { conectada: true, nota: "Indicadores de Impacto alineados al ODS, cifra global del año (imp_values)." },
  cifras: { conectada: true, nota: "UDES en Cifras: indicadores publicados reconocidos por el diccionario del motor (imp_criteria)." },
  proyecto: { conectada: true, nota: "Proyectos del PDI reconocidos por el diccionario del motor (imp_criteria); sin cifras." },
  documento: { conectada: false, nota: "No conectado: las políticas y planes aún no tienen lector; se suben como fuente «documento»." },
};

/* ---------- Afinidad con el ODS (diccionario del motor, sin IA) ------------ */

export interface Criterio {
  sdg: number;
  term: string;
  weight: number;
}

/** Minúsculas, sin tildes, espacios simples. */
export const plano = (t: string) =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Forma común de singular y plural: «estudiantes» y «estudiante» → «estudiant»; «universidades» → «universidad». */
const singular = (w: string) => (w.length > 3 ? w.replace(/s$/, "").replace(/e$/, "") : w);
const frasePlana = (t: string) => plano(t).split(" ").map(singular).join(" ");

/** Suma de pesos de los términos del ODS que aparecen (frases seguidas) y cuáles. */
export function afinidadOds(texto: string, criterios: Criterio[], ods: number): { score: number; terminos: string[] } {
  const t = ` ${frasePlana(texto)} `;
  let score = 0;
  const terminos: string[] = [];
  for (const c of criterios) {
    if (c.sdg !== ods) continue;
    const term = frasePlana(c.term);
    if (term && t.includes(` ${term} `)) {
      score += Number(c.weight) || 0;
      terminos.push(c.term);
    }
  }
  return { score, terminos };
}

export const UMBRAL_FUENTE = 4;

/* ---------- Adaptadores ------------------------------------------------------ */

const formato = (n: number, unidad = "") => {
  const s = Number.isInteger(n) ? n.toLocaleString("es-CO") : n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  return unidad === "%" || /porcent/i.test(unidad) ? `${s} %` : s;
};

export interface FilaImpacto {
  indicator_id: string;
  name: string;
  unit_label: string;
  measure: string;
  year: number;
  value_num: number | null;
  value_text: string;
  not_applicable: boolean;
}

/** Indicadores de Impacto alineados al ODS, con su cifra global del año. */
export function datosImpacto(filas: FilaImpacto[], anio: number): DatoFuente[] {
  const out: DatoFuente[] = [];
  for (const f of filas) {
    if (f.year !== anio || f.not_applicable) continue;
    const unidad = f.measure === "porcentaje" ? "%" : f.unit_label;
    const value = f.value_num !== null && Number.isFinite(Number(f.value_num)) ? formato(Number(f.value_num), unidad) : f.value_text.trim() || null;
    if (!value) continue;
    const origen = `Indicadores de Impacto ${anio}`;
    out.push({
      kind: "impacto",
      ref: `impacto:${f.indicator_id}:${anio}`,
      titulo: f.name,
      texto: `${f.name}: ${value}${unidad && unidad !== "%" ? ` ${unidad}` : ""} (${origen}).`,
      value,
      label: f.name,
      origen,
    });
  }
  return out;
}

export interface FilaCifras {
  indicator_id: string;
  label: string;
  definition: string;
  unit: string;
  format: "entero" | "porcentaje" | "decimal";
  annual_rule: "suma" | "ultimo" | "promedio" | "reportado";
  report_name: string;
  year: number;
  term: "A" | "B" | "anual";
  value: number | null;
}

/** La cifra del año según la regla del indicador (UDES en Cifras). */
export function cifraAnual(valores: { term: "A" | "B" | "anual"; value: number | null }[], regla: FilaCifras["annual_rule"]): number | null {
  const de = (t: string) => valores.find((v) => v.term === t && v.value !== null)?.value ?? null;
  const anual = de("anual");
  if (anual !== null) return anual;
  const a = de("A");
  const b = de("B");
  if (regla === "reportado") return null;
  if (regla === "suma") return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  if (regla === "promedio") return a !== null && b !== null ? (a + b) / 2 : (a ?? b);
  return b ?? a;
}

/** Indicadores de UDES en Cifras del año que el diccionario reconoce para el ODS. */
export function datosCifras(filas: FilaCifras[], criterios: Criterio[], ods: number, anio: number): DatoFuente[] {
  const porIndicador = new Map<string, FilaCifras[]>();
  for (const f of filas) if (f.year === anio) porIndicador.set(f.indicator_id, [...(porIndicador.get(f.indicator_id) ?? []), f]);
  const out: DatoFuente[] = [];
  for (const [id, lista] of porIndicador) {
    const f = lista[0];
    if (afinidadOds(`${f.label} ${f.label} ${f.definition} ${f.report_name}`, criterios, ods).score < UMBRAL_FUENTE) continue;
    const n = cifraAnual(lista, f.annual_rule);
    if (n === null) continue;
    const value = formato(f.format === "porcentaje" ? n : Math.round(n * 100) / 100, f.format === "porcentaje" ? "%" : f.unit);
    const origen = `UDES en Cifras ${anio}`;
    out.push({ kind: "cifras", ref: `cifras:${id}:${anio}`, titulo: f.label, texto: `${f.label}: ${value}${f.unit && f.format !== "porcentaje" ? ` ${f.unit}` : ""} (${origen}).`, value, label: f.label, origen });
  }
  return out;
}

export interface FilaProyecto {
  id: string;
  name: string;
  description: string;
  detail: string;
  pillar: string;
}

/** Proyectos del PDI que el diccionario reconoce para el ODS (sin cifras). */
export function datosProyectos(filas: FilaProyecto[], criterios: Criterio[], ods: number): DatoFuente[] {
  return filas
    .map((p) => ({ p, a: afinidadOds(`${p.name} ${p.name} ${p.description} ${p.detail}`, criterios, ods) }))
    .filter((x) => x.a.score >= UMBRAL_FUENTE)
    .sort((x, y) => y.a.score - x.a.score)
    .map(({ p }) => {
      const desc = p.description.replace(/\s+/g, " ").trim();
      return {
        kind: "proyecto" as const,
        ref: `proyecto:${p.id}`,
        titulo: p.name,
        texto: `${p.name}${p.pillar ? ` (pilar ${p.pillar})` : ""}${desc ? `: ${desc.slice(0, 400)}` : ""}. (Proyectos del PDI)`.replace(/\.\./g, "."),
        value: null,
        label: p.name,
        origen: "Proyectos del PDI",
      };
    });
}

/** El dato como nota virtual, para citarlo y verificarlo igual que una noticia. */
export const aNotaVirtual = (d: DatoFuente): NotaInforme => ({ id: d.ref, title: `${d.origen}: ${d.titulo}`, body: d.texto, published_on: null, section: d.origen, score: 0 });

/** De qué tipo es una referencia de fuente. */
export const tipoDeRef = (ref: string): TipoFuente => {
  const k = ref.split(":")[0];
  return k === "impacto" || k === "cifras" || k === "proyecto" || k === "documento" ? k : "noticia";
};
