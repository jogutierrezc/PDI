/* =============================================================================
   UDES en Cifras · avance por estación.

   Cada informe lleva una marca en cada estación y la barra de estaciones suma
   las nueve. Las reglas son deliberadamente pocas y explícitas: una marca que
   nadie sabe por qué está en ámbar no ayuda a publicar.
   ========================================================================== */

import type { OdPublicationRow } from "../../../types/database";
import type { OpenDataRows } from "../../datos-abiertos/data/repository";
import type { Report } from "../../datos-abiertos/data/types";

export type StationId = "periodo" | "estructura" | "captura" | "diseno" | "publicacion";

export const STATIONS: { id: StationId; number: number; label: string; hint: string }[] = [
  { id: "periodo", number: 1, label: "Periodo y campus", hint: "Años, corte, campus y oficinas" },
  { id: "estructura", number: 2, label: "Estructura y KPI", hint: "Informes, indicadores y cifras clave" },
  { id: "captura", number: 3, label: "Captura", hint: "Cifras por año y campus" },
  { id: "diseno", number: 4, label: "Diseño visual", hint: "Orden y gráficas de cada ficha" },
  { id: "publicacion", number: 5, label: "Publicación", hint: "Revisar cambios y publicar" },
];

export type MarkState = "ok" | "pendiente" | "vacio";

export interface ReportProgress {
  estructura: { state: MarkState; issues: string[] };
  captura: { state: MarkState; filled: number; expected: number; pct: number };
  diseno: { state: MarkState; issues: string[] };
  publicacion: { state: MarkState; status: string; changes: number; lastPublished: string | null };
}

export function periodProgress(rows: OpenDataRows): { state: MarkState; issues: string[] } {
  const issues: string[] = [];
  if (rows.campuses.length === 0) issues.push("El periodo no tiene campus");
  if (rows.offices.length === 0) issues.push("No hay oficinas fuente");
  if (rows.reports.length === 0) issues.push("El periodo no tiene informes");
  return { state: issues.length ? "pendiente" : "ok", issues };
}

export function reportProgress(report: Report, rows: OpenDataRows, publications: OdPublicationRow[]): ReportProgress {
  const indicators = rows.indicators.filter((i) => i.report_id === report.uuid);
  const years = rows.period.end_year - rows.period.start_year + 1;
  const campusCount = rows.campuses.length;

  /* Estructura */
  const estructuraIssues: string[] = [];
  if (indicators.length === 0) estructuraIssues.push("Sin indicadores");
  if (indicators.length > 0 && !indicators.some((i) => i.is_headline)) estructuraIssues.push("Sin cifra titular");
  const noOffice = indicators.filter((i) => !i.office_id).length;
  if (noOffice) estructuraIssues.push(`${noOffice} ${noOffice === 1 ? "indicador" : "indicadores"} sin oficina`);

  /* Captura: lo que se suma pide cada campus; lo reportado pide el total. */
  const ids = new Set(indicators.map((i) => i.id));
  const values = rows.values.filter((v) => ids.has(v.indicator_id) && v.value !== null);
  let expected = 0;
  let filled = 0;
  for (const indicator of indicators) {
    const own = values.filter((v) => v.indicator_id === indicator.id);
    if (indicator.aggregation === "suma") {
      expected += years * campusCount;
      filled += own.filter((v) => v.campus_id !== null).length;
    } else {
      expected += years;
      filled += own.filter((v) => v.campus_id === null).length;
    }
  }
  const pct = expected ? Math.min(100, Math.round((filled / expected) * 100)) : 0;

  /* Diseño */
  const blocks = rows.blocks.filter((b) => b.report_id === report.uuid);
  const disenoIssues: string[] = [];
  if (blocks.length === 0) disenoIssues.push("La ficha no tiene bloques");
  if (blocks.length > 0 && !blocks.some((b) => b.visible)) disenoIssues.push("Todos los bloques están ocultos");
  const referenced = new Set(blocks.map((b) => b.ref_id).filter(Boolean));
  const orphanSets = [
    ...rows.heatmaps.filter((h) => h.report_id === report.uuid),
    ...rows.maps.filter((m) => m.report_id === report.uuid),
    ...rows.pipelines.filter((p) => p.report_id === report.uuid),
  ].filter((set) => !referenced.has(set.id)).length;
  if (orphanSets) disenoIssues.push(`${orphanSets} ${orphanSets === 1 ? "conjunto sin bloque" : "conjuntos sin bloque"}`);

  /* Publicación: cifras cambiadas desde la última vez que se publicó. */
  const last = publications
    .filter((p) => p.report_id === report.uuid && p.action === "publicado")
    .sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  const lastPublished = last?.published_at ?? null;
  const changes = lastPublished
    ? rows.values.filter((v) => ids.has(v.indicator_id) && v.updated_at && v.updated_at > lastPublished).length
    : 0;

  return {
    estructura: { state: estructuraIssues.length ? "pendiente" : "ok", issues: estructuraIssues },
    captura: { state: pct === 100 ? "ok" : pct === 0 ? "vacio" : "pendiente", filled, expected, pct },
    diseno: { state: disenoIssues.length ? "pendiente" : "ok", issues: disenoIssues },
    publicacion: {
      // Publicado es "ok" aunque haya cambios: solo Planeación edita y lo guardado ya se ve.
      state: report.status === "publicado" ? "ok" : "vacio",
      status: report.status ?? "borrador",
      changes,
      lastPublished,
    },
  };
}

export const statusLabels: Record<string, string> = {
  borrador: "Borrador",
  revision: "En revisión",
  publicado: "Publicado",
  archivado: "Archivado",
};
