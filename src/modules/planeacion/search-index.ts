/* =============================================================================
   Buscador transversal · el índice.

   Un solo índice con lo que publican los portales de Planeación:
   · UDES en Cifras: cada informe y cada indicador, con su cifra simplificada
     (el último año con dato, todos los campus) y de dónde sale.
   · Observatorio: los catorce temas (con su cifra titular si ya publican
     datos) y las tablas publicadas.
   · Plan de Desarrollo: páginas, pilares con su avance y proyectos.
   · Boletines y documentos públicos.
   · La oficina: áreas y equipo.

   Solo entra lo publicado: las consultas son las mismas del portal público.
   Ninguna cifra de dinero entra al índice (regla del producto).
   ========================================================================== */

import { useMemo } from "react";
import { usePillars, useProjects, usePublicDocuments } from "../../data/queries";
import { formatValue, useOpenDataCatalog, valueOf } from "../datos-abiertos/data/open-data";
import { ALL_CAMPUSES } from "../datos-abiertos/data/types";
import { ALL_YEARS, TERMS } from "../datos-abiertos/data/terms";
import type { Indicator, OpenDataCatalog } from "../datos-abiertos/data/types";
import { OBS_TOPICS } from "../datos-abiertos/observatorio/data";
import { summarize, useObservatoryLive } from "../datos-abiertos/observatorio/live";
import { bulletinFileUrl, usePublicBulletins } from "../boletin/data";
import { AREAS, TEAM } from "./content";

export type Portal = "cifras" | "observatorio" | "pdi" | "boletines" | "documentos" | "oficina";

export const PORTALS: { id: Portal; label: string }[] = [
  { id: "cifras", label: "UDES en Cifras" },
  { id: "observatorio", label: "Observatorio" },
  { id: "pdi", label: "Plan de Desarrollo" },
  { id: "boletines", label: "Boletines" },
  { id: "documentos", label: "Documentos" },
  { id: "oficina", label: "La oficina" },
];

export interface SearchEntry {
  id: string;
  portal: Portal;
  title: string;
  hint: string;
  to: string;
  /** Enlace fuera del sitio (un PDF). */
  external?: boolean;
  /** Distintivo de la izquierda: código del informe, del tema o del pilar. */
  code?: string;
  /** Color del distintivo (una variable CSS). */
  tone?: string;
  /** La cifra simplificada. */
  figure?: { value: string; unit: string; when: string };
  keywords: string;
}

const MONEY = /dinero|peso|\$|cop\b|millones|presupuest/i;

/** Normaliza para que «desercion» encuentre «Deserción». */
export const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * La cifra de un indicador: el último año con dato, todos los campus. Si la
 * cifra se reporta por periodo y el año no tiene total, el último periodo con
 * dato (como hace el boletín).
 */
export function latestFigure(indicator: Indicator, catalog: OpenDataCatalog) {
  const years = [...catalog.years].filter((y) => y !== ALL_YEARS).sort((a, b) => b - a);
  const shape = (value: number, when: string) => ({
    value: `${formatValue(value, indicator.format)}${indicator.format === "porcentaje" ? " %" : ""}`,
    unit: indicator.format === "porcentaje" || indicator.unit === "%" ? "" : indicator.unit,
    when: `${when} · todos los campus${catalog.illustrative ? " · dato ilustrativo" : ""}`,
  });
  for (const year of years) {
    const value = valueOf(indicator, year, ALL_CAMPUSES);
    if (value !== null) return shape(value, String(year));
  }
  for (const year of years) {
    for (const term of [...TERMS].reverse()) {
      const value = valueOf(indicator, year, ALL_CAMPUSES, term);
      if (value !== null) return shape(value, `periodo ${year}-${term === "A" ? 1 : 2}`);
    }
  }
  return undefined;
}

const PDI_PAGES: SearchEntry[] = [
  { id: "p-pdi", portal: "pdi", title: "Portal PDI", hint: "Plan de Desarrollo Institucional 2024-2028", to: "/pdi", keywords: "plan desarrollo institucional portada" },
  { id: "p-impl", portal: "pdi", title: "Implementación del PDI", hint: "Avance de los pilares", to: "/implementacion", keywords: "pilares avance proyectos areas lineas" },
  { id: "p-board", portal: "pdi", title: "Tablero PDI", hint: "Cumplimiento global y por pilar", to: "/tablero", keywords: "dashboard indicadores seguimiento" },
  { id: "p-ods", portal: "pdi", title: "PDI y los ODS", hint: "Aporte del plan a la Agenda 2030", to: "/ods", keywords: "ods objetivos desarrollo sostenible agenda 2030" },
  { id: "p-fac", portal: "pdi", title: "PDI por facultad", hint: "Propuestas de cada facultad", to: "/facultades", keywords: "facultades decanatura" },
  { id: "p-campus", portal: "pdi", title: "PDI por campus", hint: "El plan en cada sede", to: "/campus", keywords: "campus sede bucaramanga cucuta valledupar" },
  { id: "p-dev", portal: "oficina", title: "Desarrollo tecnológico", hint: "Aplicativos construidos por Planeación", to: "/desarrollo-tecnologico", keywords: "software aplicativos proyectos web" },
];

const OFFICE_PAGES: SearchEntry[] = [
  { id: "o-team", portal: "oficina", title: "Nuestro equipo", hint: "Quiénes somos y cómo escribirnos", to: "/equipo", keywords: "equipo personas contacto oficina planeacion" },
  { id: "o-cifras", portal: "cifras", title: "UDES en Cifras", hint: "Las cifras oficiales de la universidad", to: "/datos-abiertos", keywords: "datos abiertos estadisticas informes" },
  { id: "o-obs", portal: "observatorio", title: "Observatorio de Analítica Académica", hint: "Catorce temas para explorar el dato", to: "/datos-abiertos/observatorio", keywords: "analitica datos temas" },
  { id: "o-bol", portal: "boletines", title: "Boletines", hint: "El boletín estadístico en PDF", to: "/datos-abiertos/boletines", keywords: "boletin estadistico pdf descargar" },
  { id: "o-login", portal: "oficina", title: "Acceso a la intranet", hint: "Para el equipo que carga y publica", to: "/acceso-intranet", keywords: "login intranet admin" },
];

/** El índice completo. Las consultas son las del portal: casi todo llega ya en caché. */
export function useSiteIndex() {
  const catalog = useOpenDataCatalog();
  const live = useObservatoryLive();
  const pillars = usePillars();
  const projects = useProjects();
  const documents = usePublicDocuments();
  const bulletins = usePublicBulletins(catalog.data?.period?.uuid);

  const entries = useMemo(() => {
    const out: SearchEntry[] = [...OFFICE_PAGES, ...PDI_PAGES];

    const cat = catalog.data;
    if (cat) {
      for (const report of cat.reports) {
        const tone = `var(--od-line-${report.line})`;
        out.push({
          id: `r-${report.slug}`,
          portal: "cifras",
          title: report.name,
          hint: report.summary || "Informe de UDES en Cifras",
          to: `/datos-abiertos/${report.slug}`,
          code: report.code,
          tone,
          keywords: `informe ${report.slug}`,
        });
        for (const indicator of report.indicators) {
          if (MONEY.test(indicator.unit) || MONEY.test(indicator.label)) continue;
          out.push({
            id: `i-${report.slug}-${indicator.id}`,
            portal: "cifras",
            title: indicator.label,
            hint: `${report.name} · ${indicator.source || "UDES en Cifras"}`,
            to: `/datos-abiertos/${report.slug}`,
            code: report.code,
            tone,
            figure: latestFigure(indicator, cat),
            keywords: `${indicator.definition} ${indicator.unit}`,
          });
        }
      }
    }

    for (const topic of OBS_TOPICS) {
      const published = live.data?.get(topic.slug);
      const summary = published ? summarize(published) : null;
      out.push({
        id: `t-${topic.slug}`,
        portal: "observatorio",
        title: topic.name,
        hint: published ? topic.question : `${topic.question} · aún con datos de ejemplo`,
        to: `/datos-abiertos/observatorio/${topic.slug}`,
        code: topic.code,
        tone: `var(--od-line-${topic.line})`,
        figure: summary
          ? {
              value: `${formatValue(summary.value, summary.format)}${summary.format === "porcentaje" ? " %" : ""}`,
              unit: summary.format === "porcentaje" ? "" : summary.unit,
              when: summary.label,
            }
          : undefined,
        keywords: `${topic.summary} ${topic.source}`,
      });
      for (const dataset of published?.datasets.values() ?? []) {
        out.push({
          id: `d-${dataset.id}`,
          portal: "observatorio",
          title: dataset.title,
          hint: `${topic.name} · tabla de datos · ${dataset.source || "Observatorio"}`,
          to: `/datos-abiertos/observatorio/${topic.slug}`,
          code: topic.code,
          tone: `var(--od-line-${topic.line})`,
          keywords: `${dataset.description} ${dataset.columns.map((c) => c.label).join(" ")}`,
        });
      }
    }

    const pillarBySlot = new Map((pillars.data ?? []).map((p) => [p.id, p]));
    for (const pillar of pillars.data ?? []) {
      out.push({
        id: `pl-${pillar.id}`,
        portal: "pdi",
        title: pillar.name,
        hint: `Pilar ${pillar.numeral} · ${pillar.management_owner}`,
        to: `/implementacion/pilar/${pillar.slug}`,
        code: `P${pillar.position || pillar.numeral}`,
        tone: `var(--pillar-${pillar.accent_slot})`,
        figure: { value: `${formatValue(pillar.progress.progress, "decimal")} %`, unit: "", when: "avance del pilar" },
        keywords: `${pillar.focus} ${pillar.description} pilar`,
      });
    }
    for (const project of projects.data ?? []) {
      const pillar = pillarBySlot.get(project.pillar_id);
      out.push({
        id: `pr-${project.id}`,
        portal: "pdi",
        title: project.name,
        hint: `Proyecto${pillar ? ` · ${pillar.name}` : ""}${project.owner ? ` · ${project.owner}` : ""}`,
        to: pillar ? `/implementacion/pilar/${pillar.slug}` : "/implementacion",
        code: pillar ? `P${pillar.position || pillar.numeral}` : undefined,
        tone: pillar ? `var(--pillar-${pillar.accent_slot})` : undefined,
        figure: { value: `${formatValue(project.progress, "decimal")} %`, unit: "", when: "avance del proyecto" },
        keywords: `${project.description} proyecto`,
      });
    }

    for (const b of bulletins.data?.bulletins ?? []) {
      out.push({ id: `b-${b.id}`, portal: "boletines", title: b.title, hint: "Boletín en vivo · se lee en línea y se imprime", to: `/datos-abiertos/boletines/${b.slug}`, keywords: "boletin pdf" });
    }
    for (const e of bulletins.data?.editions ?? []) {
      out.push({ id: `e-${e.id}`, portal: "boletines", title: e.title, hint: `Edición en PDF · ${e.period_label}`, to: bulletinFileUrl(e.file_path), external: true, keywords: "boletin edicion pdf descargar" });
    }

    for (const doc of documents.data ?? []) {
      out.push({
        id: `doc-${doc.id}`,
        portal: "documentos",
        title: doc.title,
        hint: [doc.kind, doc.size_label, doc.description].filter(Boolean).join(" · ") || "Documento público",
        to: doc.url || "/implementacion#repositorio",
        external: /^https?:/i.test(doc.url),
        keywords: doc.description,
      });
    }

    for (const area of AREAS) {
      out.push({ id: `a-${area.id}`, portal: "oficina", title: area.name, hint: area.does, to: "/equipo", keywords: "area oficina equipo" });
    }
    for (const person of TEAM) {
      if (!person.name.trim()) continue;
      out.push({ id: `m-${person.name}`, portal: "oficina", title: person.name, hint: person.role, to: "/equipo", keywords: `${person.email ?? ""} equipo` });
    }
    return out;
  }, [catalog.data, live.data, pillars.data, projects.data, documents.data, bulletins.data]);

  const loading = catalog.isPending || pillars.isPending || projects.isPending;
  return { entries, loading };
}

/** Resultados ordenados: primero lo que empieza como la búsqueda, luego lo que la contiene en el título, luego el resto. */
export function searchEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  const terms = needle.split(/\s+/);
  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of entries) {
    const title = fold(entry.title);
    const hay = `${title} ${fold(entry.hint)} ${fold(entry.keywords)} ${fold(entry.code ?? "")}`;
    if (!terms.every((t) => hay.includes(t))) continue;
    let score = 0;
    if (title.startsWith(needle)) score += 60;
    else if (title.includes(needle)) score += 40;
    score += terms.filter((t) => title.includes(t)).length * 10;
    if (entry.figure) score += 6;
    scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, "es")).map((s) => s.entry);
}
