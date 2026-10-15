/* =============================================================================
   Monitor de alertas tempranas · lógica pura.

   Clasifica a cada estudiante en Nivel Esperado (NE), En Desarrollo (ED) o
   Requiere Seguimiento (RS) con las notas de un corte (P1, P2 o P3), y agrega
   lo que sale: institución → facultad → programa → grupo → estudiante.

   Los umbrales de partida son los del estudio de la UDES (nota de aprobar 3,0;
   periodo de prueba bajo 3,2; éxito sobre 3,8) y la propuesta del Monitor; la
   pantalla los deja ajustar y todo se recalcula. Un estudiante solo se
   clasifica en un corte si ya tiene nota en la mitad o más de sus materias.
   ========================================================================== */

import { materiasCriticas, type MateriaCritica, type ResumenGrupoNotas } from "../warehouse/estudio";

export type Nivel = "NE" | "ED" | "RS";
export const NIVELES: Nivel[] = ["NE", "ED", "RS"];
export const NOMBRE_NIVEL: Record<Nivel, string> = { NE: "Nivel Esperado", ED: "En Desarrollo", RS: "Requiere Seguimiento" };
export type Corte = 1 | 2 | 3;
export const CORTES_MONITOR: Corte[] = [1, 2, 3];

export interface FilaMonitor {
  estudiante: string;
  codigo_programa: string;
  programa: string;
  materias: number;
  con_p1: number;
  con_p2: number;
  con_p3: number;
  prom_p1: number | null;
  prom_p2: number | null;
  prom_p3: number | null;
  riesgo_p1: number;
  riesgo_p2: number;
  riesgo_p3: number;
}

export interface GrupoMonitor {
  codigo_programa: string;
  codigo_materia: string;
  materia: string;
  grupo: string;
  estudiantes: number;
  con_p1: number;
  con_p2: number;
  con_p3: number;
  prom_p1: number | null;
  prom_p2: number | null;
  prom_p3: number | null;
  bajo_p1: number;
  bajo_p2: number;
  bajo_p3: number;
}

export interface Programa {
  codigo_programa: string;
  nombre: string;
  unit_id: string | null;
  unidad: string | null;
  facultad_id: string | null;
  facultad: string | null;
}

export interface Umbrales {
  /** Promedio desde el cual, sin materias perdidas, se está en Nivel Esperado. */
  ne: number;
  /** Promedio por debajo del cual se requiere seguimiento. */
  rs: number;
  /** Materias perdidas desde las cuales se requiere seguimiento. */
  perdidas: number;
  /** Caída del promedio frente al corte anterior desde la cual se requiere seguimiento. */
  caida: number;
}

export const UMBRALES_MONITOR: Umbrales = { ne: 3.5, rs: 3.0, perdidas: 2, caida: 0.5 };

const con = (f: FilaMonitor, c: Corte) => (c === 1 ? f.con_p1 : c === 2 ? f.con_p2 : f.con_p3);
const prom = (f: FilaMonitor, c: Corte) => (c === 1 ? f.prom_p1 : c === 2 ? f.prom_p2 : f.prom_p3);
const riesgo = (f: FilaMonitor, c: Corte) => (c === 1 ? f.riesgo_p1 : c === 2 ? f.riesgo_p2 : f.riesgo_p3);

/** ¿Tiene nota en la mitad o más de sus materias en este corte? */
export const tieneCorte = (f: FilaMonitor, c: Corte) => f.materias > 0 && con(f, c) / f.materias >= 0.5 && prom(f, c) !== null;

export interface Clasificacion {
  nivel: Nivel;
  promedio: number;
  perdidas: number;
  caida: number | null;
}

/** La clasificación de un estudiante en un corte; null si todavía no tiene notas suficientes en él. */
export function clasificar(f: FilaMonitor, c: Corte, u: Umbrales = UMBRALES_MONITOR): Clasificacion | null {
  if (!tieneCorte(f, c)) return null;
  const p = prom(f, c) as number;
  const perdidas = riesgo(f, c);
  let anterior: number | null = null;
  for (let k = c - 1; k >= 1; k--) if (tieneCorte(f, k as Corte)) {
    anterior = prom(f, k as Corte);
    break;
  }
  const caida = anterior !== null ? Math.round((anterior - p) * 100) / 100 : null;
  const nivel: Nivel = p < u.rs || perdidas >= u.perdidas || (caida !== null && caida >= u.caida) ? "RS" : p < u.ne || perdidas >= 1 ? "ED" : "NE";
  return { nivel, promedio: p, perdidas, caida };
}

/** Los cortes en los que alguien ya tiene notas suficientes. */
export function cortesConNotas(filas: FilaMonitor[]): Corte[] {
  return CORTES_MONITOR.filter((c) => filas.some((f) => tieneCorte(f, c)));
}

export interface PuntoCorte {
  corte: Corte;
  estudiantes: number;
  pctRS: number;
  pctNE: number;
  promedio: number | null;
}

export interface Nodo {
  clave: string;
  nombre: string;
  estudiantes: number;
  NE: number;
  ED: number;
  RS: number;
  /** % de los clasificados que requiere seguimiento. */
  pctRS: number;
  promedio: number | null;
  serie: PuntoCorte[];
}

const redondea = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Cuenta los niveles de un conjunto de estudiantes en un corte, con su evolución por corte. */
export function agregar(clave: string, nombre: string, filas: FilaMonitor[], corte: Corte, u: Umbrales = UMBRALES_MONITOR): Nodo {
  const n = { NE: 0, ED: 0, RS: 0 };
  let suma = 0;
  let conProm = 0;
  for (const f of filas) {
    const c = clasificar(f, corte, u);
    if (!c) continue;
    n[c.nivel] += 1;
    suma += c.promedio;
    conProm += 1;
  }
  const total = n.NE + n.ED + n.RS;
  const serie: PuntoCorte[] = [];
  for (const k of CORTES_MONITOR) {
    let ne = 0;
    let rs = 0;
    let t = 0;
    let s = 0;
    for (const f of filas) {
      const c = clasificar(f, k, u);
      if (!c) continue;
      t += 1;
      s += c.promedio;
      if (c.nivel === "RS") rs += 1;
      if (c.nivel === "NE") ne += 1;
    }
    if (t > 0) serie.push({ corte: k, estudiantes: t, pctRS: redondea((100 * rs) / t), pctNE: redondea((100 * ne) / t), promedio: redondea(s / t, 2) });
  }
  return { clave, nombre, estudiantes: total, ...n, pctRS: total ? redondea((100 * n.RS) / total) : 0, promedio: conProm ? redondea(suma / conProm, 2) : null, serie };
}

const SIN_FACULTAD = "Sin facultad asignada";

/** Facultades con sus programas, ordenadas de más a menos estudiantes en RS (en %). */
export function porFacultad(filas: FilaMonitor[], programas: Programa[], corte: Corte, u: Umbrales = UMBRALES_MONITOR) {
  const prog = new Map(programas.map((p) => [p.codigo_programa, p]));
  const grupos = new Map<string, { id: string | null; nombre: string; filas: FilaMonitor[] }>();
  for (const f of filas) {
    const p = prog.get(f.codigo_programa);
    const id = p?.facultad_id ?? null;
    const clave = id ?? "sin-facultad";
    const g = grupos.get(clave) ?? { id, nombre: p?.facultad ?? SIN_FACULTAD, filas: [] };
    g.filas.push(f);
    grupos.set(clave, g);
  }
  return [...grupos.entries()]
    .map(([clave, g]) => ({
      ...agregar(clave, g.nombre, g.filas, corte, u),
      programas: porPrograma(g.filas, programas, corte, u),
    }))
    .filter((f) => f.estudiantes > 0)
    .sort((a, b) => b.pctRS - a.pctRS || b.estudiantes - a.estudiantes);
}

export function porPrograma(filas: FilaMonitor[], programas: Programa[], corte: Corte, u: Umbrales = UMBRALES_MONITOR): Nodo[] {
  const prog = new Map(programas.map((p) => [p.codigo_programa, p]));
  const por = new Map<string, FilaMonitor[]>();
  for (const f of filas) por.set(f.codigo_programa, [...(por.get(f.codigo_programa) ?? []), f]);
  return [...por.entries()]
    .map(([cod, fs]) => agregar(cod, prog.get(cod)?.nombre || fs[0].programa || cod, fs, corte, u))
    .filter((n) => n.estudiantes > 0)
    .sort((a, b) => b.pctRS - a.pctRS || b.estudiantes - a.estudiantes);
}

/* --- Grupos ------------------------------------------------------------------------------ */

export interface NodoGrupo {
  clave: string;
  codigo_materia: string;
  materia: string;
  grupo: string;
  codigo_programa: string;
  /** Estudiantes con nota en el corte. */
  estudiantes: number;
  pctBajo: number;
  promedio: number | null;
  nivel: Nivel;
  /** Promedio por corte, para la miniatura de tendencia. */
  tendencia: (number | null)[];
}

/** Un grupo requiere seguimiento si 30 % o más de quienes tienen nota va bajo la de aprobar; en desarrollo desde 15 %. */
export function nivelDeGrupo(pctBajo: number): Nivel {
  return pctBajo >= 30 ? "RS" : pctBajo >= 15 ? "ED" : "NE";
}

export function nodosDeGrupos(grupos: GrupoMonitor[], corte: Corte): NodoGrupo[] {
  return grupos
    .map((g): NodoGrupo | null => {
      const n = corte === 1 ? g.con_p1 : corte === 2 ? g.con_p2 : g.con_p3;
      if (n === 0) return null;
      const bajo = corte === 1 ? g.bajo_p1 : corte === 2 ? g.bajo_p2 : g.bajo_p3;
      const pct = redondea((100 * bajo) / n);
      return {
        clave: `${g.codigo_materia}|${g.grupo}`,
        codigo_materia: g.codigo_materia,
        materia: g.materia,
        grupo: g.grupo,
        codigo_programa: g.codigo_programa,
        estudiantes: n,
        pctBajo: pct,
        promedio: corte === 1 ? g.prom_p1 : corte === 2 ? g.prom_p2 : g.prom_p3,
        nivel: nivelDeGrupo(pct),
        tendencia: [g.prom_p1, g.prom_p2, g.prom_p3],
      };
    })
    .filter((g): g is NodoGrupo => g !== null)
    .sort((a, b) => b.pctBajo - a.pctBajo || b.estudiantes - a.estudiantes);
}

/** «Cursos con alta reprobación» (Alerta Temprana 4 del estudio) sobre los grupos del alcance. */
export function criticas(grupos: GrupoMonitor[], programas: Programa[]): MateriaCritica[] {
  const nombre = new Map(programas.map((p) => [p.codigo_programa, p.nombre]));
  const comoWarehouse: ResumenGrupoNotas[] = grupos.map((g) => ({
    codigo_materia: g.codigo_materia,
    materia: g.materia,
    grupo: g.grupo,
    programa: nombre.get(g.codigo_programa) ?? g.codigo_programa,
    estudiantes: g.estudiantes,
    con_p1: g.con_p1,
    con_p2: g.con_p2,
    con_p3: g.con_p3,
    prom_p1: g.prom_p1,
    prom_p2: g.prom_p2,
    prom_p3: g.prom_p3,
    bajo_p1: g.bajo_p1,
    bajo_p2: g.bajo_p2,
    bajo_p3: g.bajo_p3,
  }));
  return materiasCriticas(comoWarehouse);
}

/** Una nota suelta en un grupo: aprobar es 3,0; por debajo de 3,5 va «en desarrollo». */
export function nivelDeNota(nota: number | null, aprueba = 3.0): Nivel | null {
  if (nota === null) return null;
  return nota < aprueba ? "RS" : nota < 3.5 ? "ED" : "NE";
}

/* --- Lo que se le entrega a Pilo ---------------------------------------------------------- */

export interface ResumenPilo {
  periodo: string;
  sede: string;
  corte: number;
  alcance: { nivel: "institucion" | "facultad" | "programa"; nombre?: string };
  totales: { estudiantes: number; NE: number; ED: number; RS: number };
  evolucion: { corte: number; promedio: number | null; pctRS: number | null }[];
  programas: { nombre: string; estudiantes: number; NE: number; ED: number; RS: number; promedio: number | null }[];
  materias: { nombre: string; estudiantes: number; pctBajo: number; promedio: number | null }[];
  umbrales: Record<string, number>;
}

/** El resumen para Pilo: conteos por nivel, programas y materias; nunca códigos de estudiante. */
export function resumenParaPilo(
  nodo: Nodo,
  hijos: Nodo[],
  materias: MateriaCritica[],
  contexto: { periodo: string; sede: string; corte: Corte; alcance: ResumenPilo["alcance"]; umbrales: Umbrales },
): ResumenPilo | null {
  if (nodo.estudiantes === 0) return null;
  return {
    periodo: contexto.periodo,
    sede: contexto.sede,
    corte: contexto.corte,
    alcance: contexto.alcance,
    totales: { estudiantes: nodo.estudiantes, NE: nodo.NE, ED: nodo.ED, RS: nodo.RS },
    evolucion: nodo.serie.map((s) => ({ corte: s.corte, promedio: s.promedio, pctRS: s.pctRS })),
    programas: hijos.slice(0, 12).map((h) => ({ nombre: h.nombre, estudiantes: h.estudiantes, NE: h.NE, ED: h.ED, RS: h.RS, promedio: h.promedio })),
    materias: materias.slice(0, 10).map((m) => ({ nombre: m.materia, estudiantes: m.estudiantes, pctBajo: m.pctBajo, promedio: m.promedio })),
    umbrales: { ne: contexto.umbrales.ne, rs: contexto.umbrales.rs, perdidas: contexto.umbrales.perdidas, caida: contexto.umbrales.caida },
  };
}
