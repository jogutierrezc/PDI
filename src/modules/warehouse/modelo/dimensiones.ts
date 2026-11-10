/* Warehouse UDES · modelo semántico · dimensiones comunes.

   Las fuentes se cruzan por dimensiones (periodo, sede, programa, materia…), no fila contra fila: una fuente
   con una fila por grupo y otra con una fila por estudiante no se pueden unir sin duplicar cifras. Cada
   dimensión dice cómo se llama en las fuentes y cómo se normaliza su valor para que coincida entre ellas.
   Todo es lógica pura: la misma que valida la base cuando ejecuta una regla aprobada. */

export type DimensionId = "periodo" | "sede" | "programa" | "materia" | "departamento" | "docente" | "estudiante" | "jornada";

export interface Dimension {
  id: DimensionId;
  nombre: string;
  descripcion: string;
  /** Un dato personal nunca es una dimensión de un visual: solo sirve de llave dentro de la base. */
  personal: boolean;
  /** Nombres de columna (ya normalizados) con que suele llegar. */
  alias: string[];
  /** Cómo se escribe el valor para poder compararlo entre fuentes. */
  normalizar: (valor: string) => string;
}

export const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** «Ingeniería de Sistemas» y «INGENIERIA  DE SISTEMAS.» dan la misma clave. */
export const normalizarNombre = (s: string) =>
  sinTildes(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** El Warehouse guarda «2026b»; otras plataformas traen «2026-2», «2026/1» o «20262». Devuelve null si no parece un periodo. */
export function normalizarPeriodo(valor: string): string | null {
  const m = /^\s*(\d{4})\s*[-_/ ]?\s*([12abAB])\s*$/.exec(valor);
  if (!m) return null;
  const semestre = m[2].toLowerCase();
  return `${m[1]}${semestre === "1" || semestre === "a" ? "a" : "b"}`;
}

/** Los históricos de deserción traen una columna por periodo (2014a, 2014b…): no son una dimensión, hay que pivotarlas. */
export const esColumnaDePeriodo = (columna: string) => /^\d{4}[ab]$/.test(columna);

const textoSimple = (v: string) => v.trim();

export const DIMENSIONES: Record<DimensionId, Dimension> = {
  periodo: {
    id: "periodo",
    nombre: "Periodo",
    descripcion: "Año y semestre académico (2026b). Es la tabla de periodos: ordena, compara con el anterior y dice si está abierto o cerrado.",
    personal: false,
    alias: ["periodo", "periodo_poligrafo", "periodo_de_grado"],
    normalizar: (v) => normalizarPeriodo(v) ?? textoSimple(v),
  },
  sede: {
    id: "sede",
    nombre: "Sede",
    descripcion: "Bucaramanga, Cúcuta, Valledupar o Bogotá. Cada carga ya trae la suya.",
    personal: false,
    alias: ["sede", "ubicacion"],
    normalizar: (v) => normalizarNombre(v),
  },
  programa: {
    id: "programa",
    nombre: "Programa",
    descripcion: "Programa académico. Se une por código cuando la fuente lo trae y por nombre normalizado cuando no.",
    personal: false,
    alias: ["programa", "nombre_programa", "codigo_programa", "cod_programa", "cod"],
    normalizar: (v) => normalizarNombre(v),
  },
  materia: {
    id: "materia",
    nombre: "Materia",
    descripcion: "Curso del plan. El código es la llave; el nombre sirve cuando una fuente no trae el código.",
    personal: false,
    alias: ["codigo_materia", "cod_materia", "materia", "nombre_materia"],
    normalizar: (v) => normalizarNombre(v),
  },
  departamento: {
    id: "departamento",
    nombre: "Departamento",
    descripcion: "Departamento académico al que pertenece la materia.",
    personal: false,
    alias: ["departamento", "cod_departamento", "dpto_carrera"],
    normalizar: (v) => normalizarNombre(v),
  },
  docente: {
    id: "docente",
    nombre: "Docente (seudónimo)",
    descripcion: "La identificación del docente llega como seudónimo irreversible: sirve para contar y cruzar, no para identificar.",
    personal: false,
    alias: ["docente", "id_docente", "identificacion"],
    normalizar: textoSimple,
  },
  estudiante: {
    id: "estudiante",
    nombre: "Estudiante",
    descripcion: "Código real del estudiante. Es dato personal: une fuentes dentro de la base y al tablero solo llegan conteos y promedios con reserva de 5.",
    personal: true,
    alias: ["codigo_estudiante", "estudiante"],
    normalizar: textoSimple,
  },
  jornada: {
    id: "jornada",
    nombre: "Jornada",
    descripcion: "Diurna, nocturna o sabatina.",
    personal: false,
    alias: ["jornada"],
    normalizar: (v) => normalizarNombre(v),
  },
};

/** Una columna de nombre ya normalizado, ¿a qué dimensión se parece? Solo por el nombre: lo confirmado va en `fuentes.ts`. */
export function dimensionPorNombre(columna: string): DimensionId | null {
  if (esColumnaDePeriodo(columna)) return null;
  for (const d of Object.values(DIMENSIONES)) if (d.alias.includes(columna)) return d.id;
  return null;
}

/** Relaciones entre dimensiones: cada programa pertenece a un departamento (muchos a uno, una vía). */
export const RELACIONES_ENTRE_DIMENSIONES: { desde: DimensionId; hacia: DimensionId; nota: string }[] = [
  { desde: "programa", hacia: "departamento", nota: "Hace falta una tabla de equivalencias Programa → Departamento." },
  { desde: "materia", hacia: "departamento", nota: "El departamento de cada materia sale de Rendimiento por grupo o de la matrícula global." },
];

/** La tabla de periodos: una fila por periodo con su año, semestre, orden y el periodo anterior. */
export interface FilaPeriodo {
  periodo: string;
  anio: number;
  semestre: 1 | 2;
  orden: number;
  anterior: string | null;
  abierto: boolean;
}

export function tablaDePeriodos(periodos: string[], abiertos: string[] = []): FilaPeriodo[] {
  const validos = [...new Set(periodos.map((p) => normalizarPeriodo(p)).filter((p): p is string => p !== null))].sort();
  return validos.map((periodo, i) => ({
    periodo,
    anio: Number(periodo.slice(0, 4)),
    semestre: periodo.endsWith("a") ? 1 : 2,
    orden: i + 1,
    anterior: validos[i - 1] ?? null,
    abierto: abiertos.includes(periodo),
  }));
}
