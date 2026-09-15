/* =============================================================================
   Datos Abiertos · series de ejemplo para mapas, mapas de calor y tuberías.

   TODO LO DE ESTE ARCHIVO ES ILUSTRATIVO, igual que `reports.ts`. Se genera
   con reglas deterministas (la misma entrada da siempre las mismas cifras)
   para que las gráficas tengan forma creíble mientras llega el dato real:
   el origen de los estudiantes se reparte a partir de la matrícula de cada
   campus, y la tubería de permanencia sale del primer ingreso de cada cohorte.

   Al conectar la base, cada bloque se sustituye por su consulta con la misma
   forma (`HeatmapData`, `PipelineData`, `MapDataset`).
   ========================================================================== */

import type { CampusId, HeatmapData, MapDataset, OpenDataCatalog, PipelineCohort, PipelineData, Report } from "../types";

type Site = Exclude<CampusId, "todas">;
const SITES: Site[] = ["bucaramanga", "cucuta", "valledupar"];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Ruido determinista en [0, 1). */
function noise(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/* --- Origen y cobertura por departamento ---------------------------------- */

/** Participación de cada departamento (código DANE) en lo que atiende cada campus. */
const ORIGIN_SHARES: Record<Site, Record<string, number>> = {
  bucaramanga: {
    "68": 0.56, "54": 0.08, "15": 0.07, "20": 0.05, "11": 0.04, "81": 0.04, "85": 0.035, "05": 0.025,
    "13": 0.02, "25": 0.015, "47": 0.012, "44": 0.01, "50": 0.01, "70": 0.006, "73": 0.006, "23": 0.005,
    "08": 0.005, "76": 0.004, "41": 0.003, "17": 0.002, "66": 0.002, "19": 0.002, "52": 0.001, "63": 0.001,
  },
  cucuta: {
    "54": 0.74, "68": 0.09, "81": 0.06, "20": 0.03, "15": 0.015, "11": 0.015, "85": 0.01, "44": 0.008,
    "47": 0.007, "13": 0.006, "05": 0.005, "25": 0.004,
  },
  valledupar: {
    "20": 0.58, "44": 0.15, "47": 0.1, "13": 0.04, "08": 0.04, "70": 0.02, "23": 0.02, "68": 0.015,
    "54": 0.01, "11": 0.008, "05": 0.005,
  },
};

const HOME: Record<Site, string> = { bucaramanga: "68", cucuta: "54", valledupar: "20" };

function distribute(total: number, shares: Record<string, number>, home: string, drift: number) {
  // Con los años el campus atrae un poco más de fuera de su departamento.
  const weighted = Object.fromEntries(
    Object.entries(shares).map(([code, share]) => [code, code === home ? share : share * (1 + drift)]),
  );
  const sum = Object.values(weighted).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  let assigned = 0;
  for (const [code, share] of Object.entries(weighted)) {
    if (code === home) continue;
    out[code] = Math.round((total * share) / sum);
    assigned += out[code];
  }
  out[home] = total - assigned;
  return out;
}

function mapFromTotals(
  totals: (year: number, site: Site) => number | null,
  years: number[],
  concentration = 1,
): MapDataset["values"] {
  const values: MapDataset["values"] = {};
  years.forEach((year, index) => {
    values[year] = {};
    for (const site of SITES) {
      const total = totals(year, site);
      if (total === null) continue;
      const shares = Object.fromEntries(
        Object.entries(ORIGIN_SHARES[site]).map(([code, share]) => [
          code,
          code === HOME[site] ? share * concentration : share,
        ]),
      );
      values[year]![site] = distribute(total, shares, HOME[site], index * 0.05);
    }
  });
  return values;
}

/* --- Tubería de permanencia --------------------------------------------- */

const STAGES = ["Ingreso", "2.º semestre", "4.º semestre", "6.º semestre", "8.º semestre", "10.º semestre", "Grado"];
const BASE_RETENTION = [1, 0.83, 0.745, 0.69, 0.645, 0.6, 0.485];
const CAUSES = ["Económicas", "Académicas", "Económicas", "Laborales", "Personales o familiares", "Académicas"];
const CAMPUS_SHARE: Record<Site, number> = { bucaramanga: 0.63, cucuta: 0.23, valledupar: 0.14 };
const CAMPUS_PENALTY: Record<Site, number> = { bucaramanga: 0.012, cucuta: -0.008, valledupar: -0.03 };

function buildPipeline(currentYear: number): PipelineData {
  const cohorts: PipelineCohort[] = [];
  for (const cohort of [2018, 2019, 2020, 2021]) {
    const improvement = (cohort - 2018) * 0.012;
    // Semestres cursados hasta el corte: dos por año desde el ingreso.
    const semestersDone = (currentYear - cohort + 1) * 2;
    const reached = (stage: number) => (stage === 6 ? semestersDone >= 12 : semestersDone >= Math.max(1, stage * 2));
    const intake = 3300 + (cohort - 2018) * 140;

    const campusRows: Record<Site, (number | null)[]> = { bucaramanga: [], cucuta: [], valledupar: [] };
    for (const site of SITES) {
      const start = Math.round(intake * CAMPUS_SHARE[site]);
      campusRows[site] = BASE_RETENTION.map((rate, stage) => {
        if (!reached(stage)) return null;
        if (stage === 0) return start;
        const adjusted = Math.min(1, rate + (improvement + CAMPUS_PENALTY[site]) * Math.sqrt(stage));
        return Math.round(start * adjusted);
      });
      cohorts.push({ cohort, campus: site, remaining: campusRows[site], mainCause: CAUSES });
    }
    cohorts.push({
      cohort,
      campus: "todas",
      remaining: STAGES.map((_, stage) => {
        const parts = SITES.map((site) => campusRows[site][stage]);
        return parts.some((p) => p === null) ? null : parts.reduce<number>((a, b) => a + (b ?? 0), 0);
      }),
      mainCause: CAUSES,
    });
  }

  return {
    id: "tuberia",
    title: "La tubería de la permanencia",
    description:
      "Una cohorte entra por la izquierda y avanza semestre a semestre hasta el grado. Cada fuga es la gente que se retira en ese tramo; el grosor del tubo es la gente que sigue.",
    stages: STAGES,
    cohorts,
    source: "Bienestar Universitario",
  };
}

/* --- Mapas de calor ---------------------------------------------------------- */

function heat(def: Omit<HeatmapData, "values">, cell: (row: number, column: number) => number | null): HeatmapData {
  return { ...def, values: def.rows.map((_, r) => def.columns.map((__, c) => cell(r, c))) };
}

function buildHeatmaps(years: number[], currentYear: number): Partial<Record<Report["slug"], HeatmapData[]>> {
  const yearLabels = years.map(String);

  return {
    poblacional: [
      heat(
        {
          id: "nivel-anio",
          title: "Matrícula por nivel de formación y año",
          description: "Dónde crece la universidad: cada casilla es la matrícula de un nivel en un corte.",
          rowLabel: "Nivel",
          columnLabel: "Corte",
          rows: ["Técnico y tecnológico", "Universitario", "Especialización", "Maestría", "Doctorado"],
          columns: yearLabels,
          unit: "estudiantes",
          format: "entero",
          source: "Admisiones y Registro Académico",
          emptyMeaning: "sin reportar",
        },
        (r, c) => {
          const base = [1911, 15408, 1932, 1688, 95][r];
          const growth = [0.05, 0.022, 0.04, 0.07, 0.16][r];
          return Math.round(base / Math.pow(1 + growth, years.length - 1 - c));
        },
      ),
    ],
    permanencia: [
      heat(
        {
          id: "cohorte-semestre",
          title: "Retención por cohorte y semestre",
          description:
            "Qué parte de cada cohorte sigue matriculada al llegar a cada semestre. Las casillas vacías son semestres que esa cohorte todavía no ha cursado.",
          rowLabel: "Cohorte",
          columnLabel: "Semestre",
          rows: ["2019", "2020", "2021", "2022", "2023", "2024"],
          columns: ["1.º", "2.º", "3.º", "4.º", "5.º", "6.º", "7.º", "8.º", "9.º", "10.º"],
          unit: "%",
          format: "porcentaje",
          source: "Bienestar Universitario",
          emptyMeaning: "aún no cursado",
        },
        (r, c) => {
          const cohort = 2019 + r;
          const done = (currentYear - cohort + 1) * 2;
          if (c + 1 > done) return null;
          const k = 0.072 - r * 0.004;
          return round1(Math.min(100, Math.max(40, 100 * Math.exp(-k * c) + (noise(r * 31 + c) - 0.5) * 1.6)));
        },
      ),
    ],
    visibilidad: [
      heat(
        {
          id: "movilidad-mes",
          title: "Movilidad académica por mes",
          description: "Los meses en que la universidad sale y recibe: se concentra alrededor de los periodos intersemestrales.",
          rowLabel: "Año",
          columnLabel: "Mes",
          rows: yearLabels,
          columns: MONTHS,
          unit: "personas",
          format: "entero",
          source: "Relaciones Internacionales",
          emptyMeaning: "sin reportar",
        },
        (r, c) => {
          const season = [0.5, 0.7, 0.9, 0.8, 1.2, 2.1, 2.4, 1.3, 0.8, 0.9, 1.1, 0.6][c];
          return Math.round((20 + r * 9) * season * (0.85 + noise(r * 13 + c) * 0.3));
        },
      ),
    ],
    ensenanza: [
      heat(
        {
          id: "programas-campus",
          title: "Programas por nivel y campus",
          description: "La oferta de cada campus, nivel por nivel, en el corte vigente.",
          rowLabel: "Nivel",
          columnLabel: "Campus",
          rows: ["Técnico y tecnológico", "Universitario", "Especialización", "Maestría", "Doctorado"],
          columns: ["Bucaramanga", "Cúcuta", "Valledupar"],
          unit: "programas",
          format: "entero",
          source: "Vicerrectoría Académica",
          emptyMeaning: "sin oferta",
        },
        (r, c) => [[4, 3, 2], [24, 9, 6], [20, 7, 4], [15, 2, 0], [2, 0, 0]][r][c],
      ),
    ],
    extension: [
      heat(
        {
          id: "beneficiarios-mes",
          title: "Personas beneficiadas por mes",
          description: "La proyección social tiene temporada: jornadas y brigadas se concentran en los meses de clase.",
          rowLabel: "Año",
          columnLabel: "Mes",
          rows: yearLabels,
          columns: MONTHS,
          unit: "personas",
          format: "entero",
          source: "Extensión y Proyección Social",
          emptyMeaning: "sin reportar",
        },
        (r, c) => {
          const season = [0.3, 0.9, 1.2, 1.1, 1.2, 0.6, 0.4, 1.0, 1.3, 1.3, 1.1, 0.5][c];
          return Math.round((2600 + r * 520) * season * (0.9 + noise(r * 17 + c) * 0.2));
        },
      ),
    ],
    investigacion: [
      heat(
        {
          id: "productos-anio",
          title: "Productos de nuevo conocimiento por tipo y año",
          description: "Qué produce la investigación de la universidad y cómo cambia la mezcla con los años.",
          rowLabel: "Tipo",
          columnLabel: "Corte",
          rows: ["Artículos", "Libros y capítulos", "Ponencias", "Software y registros", "Patentes"],
          columns: yearLabels,
          unit: "productos",
          format: "entero",
          source: "Vicerrectoría de Investigaciones",
          emptyMeaning: "sin reportar",
        },
        (r, c) => {
          const last = [271, 78, 139, 29, 3][r];
          const growth = [0.08, 0.06, 0.05, 0.18, 0.1][r];
          return Math.round(last / Math.pow(1 + growth, years.length - 1 - c));
        },
      ),
    ],
    infraestructura: [
      heat(
        {
          id: "ocupacion-aulas",
          title: "Ocupación de aulas por día y franja",
          description: "Qué parte de las aulas está en uso en cada franja de la semana, corte vigente. Sirve para leer dónde cabe crecer sin construir.",
          rowLabel: "Día",
          columnLabel: "Franja",
          rows: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
          columns: ["6-8", "8-10", "10-12", "12-14", "14-16", "16-18", "18-20", "20-22"],
          unit: "%",
          format: "porcentaje",
          source: "Planta Física",
          emptyMeaning: "sin programación",
        },
        (r, c) => {
          const daily = [0.52, 0.88, 0.93, 0.61, 0.84, 0.79, 0.9, 0.58][c];
          const day = [1, 1.02, 1, 0.98, 0.9, 0.55][r];
          if (r === 5 && c > 5) return null;
          return round1(Math.min(99, 100 * daily * day * (0.94 + noise(r * 11 + c) * 0.1)));
        },
      ),
    ],
    sostenible: [
      heat(
        {
          id: "energia-mes",
          title: "Consumo de energía por mes",
          description: "Megavatios hora consumidos en los campus. La generación solar propia empuja el consumo de la red hacia abajo año a año.",
          rowLabel: "Año",
          columnLabel: "Mes",
          rows: yearLabels,
          columns: MONTHS,
          unit: "MWh",
          format: "entero",
          source: "Sistema de Gestión Ambiental",
          emptyMeaning: "sin reportar",
        },
        (r, c) => {
          const season = [0.55, 0.95, 1.08, 1.05, 1.1, 0.8, 0.62, 1.02, 1.12, 1.1, 1.0, 0.6][c];
          return Math.round(520 * (1 - r * 0.045) * season * (0.95 + noise(r * 7 + c) * 0.1));
        },
      ),
    ],
    "plan-desarrollo": [
      heat(
        {
          id: "pilar-anio",
          title: "Avance por pilar y año",
          description: "Cumplimiento de cada pilar en cada corte del plan. Los años que todavía no llegan quedan vacíos, no en cero.",
          rowLabel: "Pilar",
          columnLabel: "Corte",
          rows: ["Personalización", "Ambiente tecnológico", "Entorno emprendedor", "Gobernanza", "Sostenibilidad", "Apropiación social"],
          columns: ["2024", "2025", "2026", "2027", "2028"],
          unit: "%",
          format: "porcentaje",
          source: "Planeación Institucional",
          emptyMeaning: "aún no reportado",
        },
        (r, c) => {
          if (c > 1) return null;
          return [
            [18.2, 34.1],
            [15.6, 29.8],
            [12.4, 24.6],
            [21.0, 36.2],
            [16.8, 31.0],
            [17.9, 32.5],
          ][r][c];
        },
      ),
    ],
  };
}

/* --- Ensamblado ------------------------------------------------------------ */

export function attachVisuals(catalog: OpenDataCatalog): OpenDataCatalog {
  const heatmaps = buildHeatmaps(catalog.years, catalog.currentYear);

  const reports = catalog.reports.map((report) => {
    const next: Report = { ...report, heatmaps: heatmaps[report.slug] ?? [] };
    const lookup = (id: string) => report.indicators.find((i) => i.id === id);

    if (report.slug === "poblacional") {
      const enrolled = lookup("matricula");
      next.maps = [
        {
          id: "origen",
          title: "De dónde vienen nuestros estudiantes",
          description:
            "Departamento de procedencia de los estudiantes matriculados en cada campus. Las líneas llevan a cada estudiante desde su departamento hasta el campus donde estudia.",
          mode: "origen",
          unit: "estudiantes",
          source: "Admisiones y Registro Académico",
          values: mapFromTotals((year, site) => enrolled?.values[year]?.[site] ?? null, catalog.years),
        },
      ];
    }

    if (report.slug === "extension") {
      const people = lookup("beneficiarios");
      next.maps = [
        {
          id: "cobertura",
          title: "Dónde llega la proyección social",
          description: "Personas beneficiadas por departamento, según el campus que ejecutó el proyecto.",
          mode: "cobertura",
          unit: "personas",
          source: "Extensión y Proyección Social",
          values: mapFromTotals((year, site) => people?.values[year]?.[site] ?? null, catalog.years, 1.25),
        },
      ];
    }

    if (report.slug === "permanencia") {
      next.pipeline = buildPipeline(catalog.currentYear);
    }

    return next;
  });

  return { ...catalog, reports };
}
