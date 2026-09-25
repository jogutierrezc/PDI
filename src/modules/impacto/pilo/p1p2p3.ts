/* =============================================================================
   Los reportes P1P2P3 como fuente de Mr. Pilo.

   El consolidado AAAA-S_P1P2P3_Estudiante.xlsx trae una fila por estudiante
   y materia: Campus | Periodo | Código Programa | Nombre Programa | Código
   Estudiante | Nombre de estudiante | Código Materia | Nombre Materia |
   Grupo | Plan eval | P1 | P2 | P3 | Nota acumulada. Las notas vienen como
   texto con coma decimal («3,1»).

   Aquí se lee en el navegador y se reduce a un agregado por programa, sede
   y periodo: cuántos estudiantes y matrículas, qué porcentaje de notas
   acumuladas aprueba (≥ 3,0), el promedio y qué porcentaje de estudiantes
   tuvo al menos un P1 por debajo de 3,0. Los nombres y códigos de los
   estudiantes nunca salen de esta función.
   ========================================================================== */

export interface P1P2P3Group {
  key: string;
  campus: string;
  period: string;
  programCode: string;
  programName: string;
  students: number;
  enrollments: number;
  approvedRate: number | null;
  averageGrade: number | null;
  atRiskRate: number | null;
}

export interface P1P2P3Parse {
  groups: P1P2P3Group[];
  problems: string[];
  rows: number;
}

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
export const foldText = (v: unknown) =>
  clean(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** «3,1» → 3.1. Vacío o «-» → null. */
export function grade(v: unknown): number | null {
  const text = clean(v).replace(",", ".");
  if (!text || text === "-") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 5 ? n : null;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function aggregateP1P2P3(table: string[][]): P1P2P3Parse {
  const header = (table[0] ?? []).map(foldText);
  const col = (name: string) => header.indexOf(foldText(name));
  const c = {
    campus: col("Campus"),
    period: col("Periodo"),
    programCode: col("Código Programa"),
    programName: col("Nombre Programa"),
    student: col("Código Estudiante"),
    p1: col("P1"),
    final: col("Nota acumulada"),
  };
  const missing = Object.entries(c).filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) {
    return { groups: [], problems: [`El archivo no trae las columnas del consolidado P1P2P3 (faltan: ${missing.join(", ")}).`], rows: 0 };
  }

  const acc = new Map<
    string,
    { campus: string; period: string; programCode: string; programName: string; students: Set<string>; risk: Set<string>; rows: number; graded: number; approved: number; sum: number }
  >();
  const problems: string[] = [];
  let rows = 0;
  table.slice(1).forEach((line) => {
    const period = clean(line[c.period]);
    const programCode = clean(line[c.programCode]);
    if (!period && !programCode) return;
    if (!/^\d{4}-[12]$/.test(period)) {
      if (problems.length < 5) problems.push(`Periodo «${period}» no válido: se espera AAAA-1 o AAAA-2.`);
      return;
    }
    rows++;
    const campus = clean(line[c.campus]);
    const key = `${foldText(campus)}|${period}|${programCode}`;
    let g = acc.get(key);
    if (!g) {
      g = { campus, period, programCode, programName: clean(line[c.programName]), students: new Set(), risk: new Set(), rows: 0, graded: 0, approved: 0, sum: 0 };
      acc.set(key, g);
    }
    const student = clean(line[c.student]);
    g.rows++;
    g.students.add(student);
    const p1 = grade(line[c.p1]);
    if (p1 !== null && p1 < 3) g.risk.add(student);
    const final = grade(line[c.final]);
    if (final !== null) {
      g.graded++;
      g.sum += final;
      if (final >= 3) g.approved++;
    }
  });

  const groups: P1P2P3Group[] = [...acc.entries()].map(([key, g]) => ({
    key,
    campus: g.campus,
    period: g.period,
    programCode: g.programCode,
    programName: g.programName,
    students: g.students.size,
    enrollments: g.rows,
    approvedRate: g.graded ? round((g.approved / g.graded) * 100) : null,
    averageGrade: g.graded ? Math.round((g.sum / g.graded) * 100) / 100 : null,
    atRiskRate: g.students.size ? round((g.risk.size / g.students.size) * 100) : null,
  }));
  groups.sort((a, b) => a.campus.localeCompare(b.campus, "es") || a.programName.localeCompare(b.programName, "es") || a.period.localeCompare(b.period));
  return { groups, problems, rows };
}
