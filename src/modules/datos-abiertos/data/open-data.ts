/* =============================================================================
   Datos Abiertos · acceso y formato.

   Las pantallas piden el catálogo con `useOpenDataCatalog()`: lee las tablas
   od_* de Supabase (repository.ts) y devuelve `null` si todavía no hay un
   periodo publicado. Con ?vista-previa en la URL, quien tiene sesión de
   intranet ve también los borradores, tal como quedarán al publicar.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { assembleCatalog, fetchOpenDataRows } from "./repository";
import type { CampusId, Indicator, OpenDataCatalog, Report, Term, ValueFormat } from "./types";
import { ANNUAL_RULE_LABEL, annualBasis, TERMS } from "./terms";

export const openDataKeys = {
  all: ["datos-abiertos"] as const,
  catalog: (preview: boolean) => [...openDataKeys.all, "catalogo", preview ? "vista-previa" : "publico"] as const,
};

/** ¿La URL pide ver los borradores? */
export function isPreview(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("vista-previa");
}

export function useOpenDataCatalog() {
  const preview = isPreview();
  return useQuery({
    queryKey: openDataKeys.catalog(preview),
    queryFn: async (): Promise<OpenDataCatalog | null> => {
      const rows = await fetchOpenDataRows({ includeDrafts: preview });
      return rows ? assembleCatalog(rows) : null;
    },
  });
}

export function findReport(data: OpenDataCatalog, slug: string | undefined): Report | undefined {
  return data.reports.find((report) => report.slug === slug);
}

/** Cifra de un corte: el año (sin periodo) o un periodo académico del año. */
export function valueOf(indicator: Indicator, year: number, campus: CampusId, term?: Term | null): number | null {
  if (indicator.years && !indicator.years.includes(year)) return null;
  const value = term ? indicator.terms?.[year]?.[term]?.[campus] : indicator.values[year]?.[campus];
  return value === undefined ? null : value;
}

/** ¿El indicador trae cifras por periodo? */
export function hasTerms(indicator: Indicator): boolean {
  return Boolean(indicator.terms && indicator.annualRule);
}

/** Qué hay detrás de la cifra del corte, para el boleto: "A + B", "periodo B". */
export function basisOf(indicator: Indicator, year: number, campus: CampusId, term?: Term | null): string | null {
  if (term || !hasTerms(indicator) || valueOf(indicator, year, campus) === null) return null;
  return annualBasis(indicator.annualRule, indicator.annualFrom?.[year]?.[campus]);
}

/** Cortes en orden: años, o periodos A y B de cada año. */
export function cutsOf(years: number[], bySemester: boolean): { year: number; term: Term | null }[] {
  return bySemester ? years.flatMap((year) => TERMS.map((term) => ({ year, term }))) : years.map((year) => ({ year, term: null }));
}

export function keyIndicators(report: Report): Indicator[] {
  return report.keyIndicators
    .map((id) => report.indicators.find((indicator) => indicator.id === id))
    .filter((indicator): indicator is Indicator => Boolean(indicator));
}

/* --- Formato ---------------------------------------------------------------
   es-CO: punto de miles y coma decimal. Los porcentajes llevan un decimal
   porque las tasas se mueven de a décimas; los enteros nunca llevan decimales. */

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatValue(value: number | null, format: ValueFormat): string {
  if (value === null) return "—";
  if (format === "entero") return integer.format(value);
  return oneDecimal.format(value);
}

/** Cifra con su unidad, para lectores de pantalla y tooltips. */
export function formatWithUnit(value: number | null, format: ValueFormat, unit: string): string {
  if (value === null) return "Sin reportar";
  const figure = formatValue(value, format);
  return unit === "%" ? `${figure} %` : `${figure} ${unit}`;
}

export interface Change {
  /** Texto listo: "+3,6 %" o "−0,5 p. p." */
  label: string;
  /** Si el cambio va en la dirección deseada del indicador. */
  reading: "mejora" | "empeora" | "igual" | "neutro";
}

/** Variación frente al corte anterior. Las tasas cambian en puntos, no en porcentaje. */
export function changeBetween(indicator: Indicator, current: number | null, previous: number | null): Change | null {
  if (current === null || previous === null) return null;

  let label: string;
  if (indicator.format === "porcentaje") {
    const diff = current - previous;
    label = `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${oneDecimal.format(Math.abs(diff))} p. p.`;
  } else if (previous === 0) {
    return null;
  } else {
    const pct = ((current - previous) / previous) * 100;
    label = `${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${oneDecimal.format(Math.abs(pct))} %`;
  }

  const delta = current - previous;
  let reading: Change["reading"] = "neutro";
  if (delta === 0) reading = "igual";
  else if (indicator.direction === "sube") reading = delta > 0 ? "mejora" : "empeora";
  else if (indicator.direction === "baja") reading = delta < 0 ? "mejora" : "empeora";

  return { label, reading };
}

export function formatCutoff(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${iso}T12:00:00`),
  );
}

/* --- Descarga en CSV -------------------------------------------------------
   Datos abiertos que no se pueden bajar no son abiertos. Separador punto y
   coma y BOM: es lo que Excel en español abre sin preguntar. */

export function reportToCsv(report: Report, years: number[], campuses: { id: CampusId; name: string }[]): string {
  const escape = (text: string) => (/[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  // Por año: el periodo A, el B y la cifra del año, en ese orden.
  const cuts = years.flatMap((year) => [...TERMS.map((term) => ({ year, term })), { year, term: null as Term | null }]);
  const rows: string[] = [
    ["Informe", "Indicador", "Unidad", "Campus", ...cuts.map((c) => (c.term ? `${c.year}-${c.term}` : `${c.year} (año)`)), "Cifra del año se calcula como", "Fuente"].join(";"),
  ];

  for (const indicator of report.indicators) {
    for (const campus of campuses) {
      const cells = cuts.map(({ year, term }) => {
        const value = valueOf(indicator, year, campus.id, term);
        return value === null ? "" : String(value).replace(".", ",");
      });
      if (cells.every((cell) => cell === "")) continue;
      rows.push(
        [report.name, indicator.label, indicator.unit, campus.name, ...cells, indicator.annualRule ? ANNUAL_RULE_LABEL[indicator.annualRule] : "", indicator.source].map(escape).join(";"),
      );
    }
  }

  return `﻿${rows.join("\n")}`;
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
