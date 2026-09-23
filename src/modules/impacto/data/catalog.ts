/* =============================================================================
   Impacto Institucional · catálogo del prototipo.

   Los 106 indicadores salen de la matriz vr7 (matriz.generated.ts). Lo que la
   matriz no trae —la ficha técnica de los 13 del piloto, la estructura de
   programas y sus sedes— se completa aquí con supuestos que se registran en
   docs/impacto/DECISIONES.md. Las facultades son las de la base; los
   programas y su oferta por sede son ILUSTRATIVOS.
   ========================================================================== */

import { MATRIX } from "./matriz.generated";
import type { CampusId, Degree, Faculty, FunctionId, Indicator, Level, Program, TechSheet } from "./types";

export const FUNCTIONS: { id: FunctionId; name: string; vice: string; short: string; prefix: string; tone: string }[] = [
  { id: "investigacion", name: "Investigación", vice: "Vicerrectoría de Investigaciones", short: "VI", prefix: "I", tone: "var(--od-series-1)" },
  { id: "ensenanza", name: "Enseñanza", vice: "Vicerrectoría de Enseñanza", short: "VE", prefix: "E", tone: "var(--od-series-3)" },
  { id: "extension", name: "Extensión", vice: "Vicerrectoría de Extensión", short: "VX", prefix: "X", tone: "var(--od-series-2)" },
];

export const functionById = Object.fromEntries(FUNCTIONS.map((f) => [f.id, f])) as Record<FunctionId, (typeof FUNCTIONS)[number]>;

export const LEVELS: { id: Level; name: string; hint: string }[] = [
  { id: "insumos", name: "Insumos", hint: "Con qué se cuenta" },
  { id: "procesos", name: "Procesos", hint: "Qué se hace" },
  { id: "productos", name: "Productos", hint: "Qué se entrega" },
  { id: "impacto", name: "Impacto real", hint: "Qué cambia" },
];

export const CAMPUS: { id: CampusId; name: string }[] = [
  { id: "bucaramanga", name: "Bucaramanga" },
  { id: "cucuta", name: "Cúcuta" },
  { id: "valledupar", name: "Valledupar" },
  { id: "bogota", name: "Bogotá" },
];

export const campusName = (id: CampusId | null) => CAMPUS.find((c) => c.id === id)?.name ?? "Todas las sedes";

export const DEGREES: Record<Degree, string> = {
  tecnico: "Técnico profesional",
  tecnologico: "Tecnológico",
  pregrado: "Profesional universitario",
  especializacion: "Especialización",
  especializacion_medicoquirurgica: "Especialización médico-quirúrgica",
  maestria: "Maestría",
  doctorado: "Doctorado",
};

/** Las siete de la migración 0016. */
export const FACULTIES: Faculty[] = [
  { slug: "ciencias-medicas-y-de-la-salud", code: "FCMS", name: "Facultad de Ciencias Médicas y de la Salud" },
  { slug: "ciencias-sociales", code: "FCS", name: "Facultad de Ciencias Sociales" },
  { slug: "ingenierias-y-tecnologias", code: "FIT", name: "Facultad de Ingenierías y Tecnologías" },
  { slug: "ciencias-agricolas-y-veterinarias", code: "FCAV", name: "Facultad de Ciencias Agrícolas y Veterinarias" },
  { slug: "ciencias-economicas-administrativas-contables", code: "FCEAC", name: "Facultad de Ciencias Económicas, Administrativas y Contables" },
  { slug: "ciencias-naturales", code: "FCN", name: "Facultad de Ciencias Naturales" },
  { slug: "formacion-tecnica-y-tecnologica", code: "CFTT", name: "Centro de Formación Técnica y Tecnológica" },
];

/** Programas y oferta por sede ILUSTRATIVOS, para recorrer el prototipo. */
export const PROGRAMS: Program[] = [
  { slug: "medicina", name: "Medicina", faculty: "ciencias-medicas-y-de-la-salud", degree: "pregrado", campus: ["bucaramanga", "cucuta", "valledupar"] },
  { slug: "enfermeria", name: "Enfermería", faculty: "ciencias-medicas-y-de-la-salud", degree: "pregrado", campus: ["bucaramanga", "cucuta", "valledupar"] },
  { slug: "esp-auditoria-salud", name: "Especialización en Auditoría en Salud", faculty: "ciencias-medicas-y-de-la-salud", degree: "especializacion", campus: ["bucaramanga", "bogota"] },
  { slug: "derecho", name: "Derecho", faculty: "ciencias-sociales", degree: "pregrado", campus: ["bucaramanga", "cucuta"] },
  { slug: "psicologia", name: "Psicología", faculty: "ciencias-sociales", degree: "pregrado", campus: ["bucaramanga", "valledupar"] },
  { slug: "ing-sistemas", name: "Ingeniería de Sistemas", faculty: "ingenierias-y-tecnologias", degree: "pregrado", campus: ["bucaramanga", "cucuta", "bogota"] },
  { slug: "ing-industrial", name: "Ingeniería Industrial", faculty: "ingenierias-y-tecnologias", degree: "pregrado", campus: ["bucaramanga", "valledupar"] },
  { slug: "maestria-ingenieria", name: "Maestría en Ingeniería de Software", faculty: "ingenierias-y-tecnologias", degree: "maestria", campus: ["bucaramanga"] },
  { slug: "veterinaria", name: "Medicina Veterinaria y Zootecnia", faculty: "ciencias-agricolas-y-veterinarias", degree: "pregrado", campus: ["bucaramanga", "valledupar"] },
  { slug: "administracion", name: "Administración de Empresas", faculty: "ciencias-economicas-administrativas-contables", degree: "pregrado", campus: ["bucaramanga", "cucuta", "valledupar", "bogota"] },
  { slug: "contaduria", name: "Contaduría Pública", faculty: "ciencias-economicas-administrativas-contables", degree: "pregrado", campus: ["bucaramanga", "cucuta"] },
  { slug: "mba", name: "Maestría en Administración", faculty: "ciencias-economicas-administrativas-contables", degree: "maestria", campus: ["bucaramanga", "bogota"] },
  { slug: "microbiologia", name: "Microbiología Industrial", faculty: "ciencias-naturales", degree: "pregrado", campus: ["bucaramanga"] },
  { slug: "tec-gestion", name: "Tecnología en Gestión Empresarial", faculty: "formacion-tecnica-y-tecnologica", degree: "pregrado", campus: ["bucaramanga", "cucuta"] },
];

const ALL: Degree[] = ["tecnico", "tecnologico", "pregrado", "especializacion", "especializacion_medicoquirurgica", "maestria", "doctorado"];

/**
 * Ficha técnica de los 13 del piloto. Valores razonables del prototipo; cada
 * supuesto que no dice la matriz queda en `supuesto` y en DECISIONES.md.
 */
export const PILOT: Record<string, TechSheet> = {
  I01: {
    tipo: "conteo", numerador: "Estudiantes activos en semilleros al cierre del periodo", factor: 1, agregacion: "suma",
    sentido: "mayor_mejor", periodicidad: "semestral", nivelReporte: "programa_sede", aplicaA: ["pregrado"], modo: "manual",
    evidencia: null, umbral: 30, rango: [0, 2000], enPiloto: true,
    supuesto: "Solo pregrado; la matriz trae 1920 en la unidad, que se trata como línea base desplazada (hallazgo).",
  },
  I04: {
    tipo: "conteo", numerador: "Profesores con horas de investigación asignadas en el periodo", factor: 1, agregacion: "suma",
    sentido: "mayor_mejor", periodicidad: "semestral", nivelReporte: "programa_sede", aplicaA: ALL, modo: "manual",
    evidencia: null, umbral: 30, rango: [0, 500], enPiloto: true,
  },
  I34: {
    tipo: "comparacion", numerador: "Estudiantes de semillero con promedio del periodo ≥ 4,0",
    denominador: "Estudiantes de semillero con notas en el periodo", factor: 100, agregacion: "razon_de_sumas",
    sentido: "mayor_mejor", periodicidad: "anual", nivelReporte: "programa", aplicaA: ["pregrado"], modo: "manual",
    evidencia: null, umbral: 30, enPiloto: true,
    supuesto: "Grupo de comparación: estudiantes del mismo programa y semestre que no participan en semilleros.",
  },
  E01: {
    tipo: "razon", numerador: "Profesores con título de maestría o doctorado", denominador: "Profesores del programa",
    factor: 100, agregacion: "razon_de_sumas", sentido: "mayor_mejor", periodicidad: "semestral", nivelReporte: "programa",
    aplicaA: ALL, modo: "precargado", evidencia: null, umbral: 30, enPiloto: true,
    supuesto: "Precargado desde Gestión Humana; el programa confirma o declara discrepancia.",
  },
  E03: {
    tipo: "conteo", numerador: "Estudiantes atendidos por PAIPE en el periodo", factor: 1, agregacion: "suma",
    sentido: "mayor_mejor", periodicidad: "semestral", nivelReporte: "programa_sede", aplicaA: ["pregrado"], modo: "manual",
    evidencia: null, umbral: 30, enPiloto: true,
  },
  E04: {
    tipo: "razon", numerador: "Estudiantes del periodo anterior que siguen matriculados", denominador: "Estudiantes matriculados en el periodo anterior",
    factor: 100, agregacion: "razon_de_sumas", sentido: "mayor_mejor", periodicidad: "semestral", nivelReporte: "programa_sede",
    aplicaA: ["pregrado"], modo: "precargado", evidencia: null, umbral: 15, enPiloto: true,
    supuesto: "Precargado desde Registro y Control Académico; umbral de variación de 15 % por ser una tasa estable.",
  },
  E08: {
    tipo: "razon", numerador: "Horas de formación profesoral certificadas en el año", denominador: "Profesores del programa",
    factor: 1, agregacion: "razon_de_sumas", sentido: "mayor_mejor", periodicidad: "anual", nivelReporte: "programa",
    aplicaA: ALL, modo: "manual", evidencia: null, umbral: 30, admiteMayorQueUno: true, rango: [0, 200], enPiloto: true,
    supuesto: "Razón que admite valores mayores que 1 (horas ÷ profesores).",
  },
  E13: {
    tipo: "conteo", numerador: "Innovaciones pedagógicas implementadas y documentadas en el año", factor: 1, agregacion: "suma",
    sentido: "mayor_mejor", periodicidad: "anual", nivelReporte: "programa", aplicaA: ALL, modo: "manual",
    evidencia: { tipo: "Documento de la innovación o acta del comité curricular", obligatoria: true }, umbral: 50, enPiloto: true,
  },
  E10: {
    tipo: "puntaje", numerador: "Puntaje global promedio del programa en Saber Pro", factor: 1, agregacion: "promedio_ponderado",
    sentido: "mayor_mejor", periodicidad: "anual", nivelReporte: "programa", aplicaA: ["pregrado"], modo: "precargado",
    evidencia: null, umbral: 10, rango: [0, 300], nMinimo: 10, enPiloto: true,
    supuesto: "Precargado desde ICFES; n = evaluados del programa.",
  },
  X04: {
    tipo: "conteo", numerador: "Profesores con horas de extensión asignadas en el periodo", factor: 1, agregacion: "suma",
    sentido: "mayor_mejor", periodicidad: "semestral", nivelReporte: "programa_sede", aplicaA: ALL, modo: "manual",
    evidencia: null, umbral: 30, enPiloto: true,
  },
  X07: {
    tipo: "conteo", numerador: "Proyectos de proyección social en ejecución al cierre del periodo", factor: 1, agregacion: "suma",
    sentido: "mayor_mejor", periodicidad: "semestral", nivelReporte: "programa_sede", aplicaA: ["pregrado", "especializacion"],
    modo: "manual", evidencia: { tipo: "Acta de inicio o informe de avance", obligatoria: true }, umbral: 50, enPiloto: true,
  },
  X18: {
    tipo: "conteo", numerador: "Personas atendidas directamente por los proyectos del programa", factor: 1, agregacion: "suma",
    sentido: "mayor_mejor", periodicidad: "semestral", nivelReporte: "programa_sede", aplicaA: ALL, modo: "manual",
    evidencia: null, umbral: 40, enPiloto: true,
  },
  X22: {
    tipo: "razon", numerador: "Participantes que perciben cambios favorables", denominador: "Participantes encuestados",
    factor: 100, agregacion: "razon_de_sumas", sentido: "mayor_mejor", periodicidad: "anual", nivelReporte: "programa",
    aplicaA: ALL, modo: "encuesta", evidencia: null, umbral: 30, nMinimo: 30, enPiloto: true,
    supuesto: "Encuesta de percepción a beneficiarios al cierre de cada proyecto.",
  },
};

export const INDICATORS: Indicator[] = MATRIX.map((row) => ({ ...row, ficha: PILOT[row.codigo] ?? null }));
export const indicatorByCode = new Map(INDICATORS.map((i) => [i.codigo, i]));
export const PILOT_INDICATORS = INDICATORS.filter((i) => i.ficha?.enPiloto);

export const programBySlug = new Map(PROGRAMS.map((p) => [p.slug, p]));
export const facultyBySlug = new Map(FACULTIES.map((f) => [f.slug, f]));

export const CALC_LABEL: Record<TechSheet["tipo"], string> = {
  conteo: "Conteo",
  razon: "Razón",
  puntaje: "Puntaje",
  comparacion: "Comparación",
  texto: "Texto",
};

export const MODE_LABEL: Record<TechSheet["modo"], string> = {
  manual: "Manual",
  precargado: "Precargado",
  encuesta: "Encuesta",
  calculado: "Calculado",
};

/** ¿Le toca este indicador a este programa? Reglas de asignación. */
export function applies(indicator: Indicator, program: Program, period: string): boolean {
  const sheet = indicator.ficha;
  if (!sheet || indicator.estado !== "oficial") return false;
  if (sheet.periodicidad === "anual" && !period.endsWith("-2")) return false;
  if (sheet.nivelReporte !== "programa" && sheet.nivelReporte !== "programa_sede") return false;
  return sheet.aplicaA.includes(program.degree);
}
