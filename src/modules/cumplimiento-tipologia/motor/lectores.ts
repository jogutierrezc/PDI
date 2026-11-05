/* =============================================================================
   Cumplimiento de Tipología · lectores de los insumos del Warehouse.

   Roomy leía xlsx de Master (biParsers.js). Aquí los insumos llegan ya
   normalizados desde `wh_filas` por las funciones `ct_insumos` (migración 0260):
   una fila por actividad, con la identidad del profesor ya completada (la
   nómina consolidada nueva solo la escribe en la primera fila de cada profesor)
   y la cédula como seudónimo. Estos lectores solo convierten esas filas en lo
   que espera el motor; no tocan la red ni la base.
   ========================================================================== */

import type { Actividad } from "./tipologia";

/** Una actividad de la nómina tal como la entrega `ct_insumos('nomina')`. */
export interface FilaNominaWh {
  seudonimo: string | null;
  contrato: string | null;
  categoria: string | null;
  duracion: string | null;
  codigo: string | null;
  actividad: string | null;
  tipo: string | null;
  grupo: string | null;
  dpto: string | null;
  codprog: string | null;
  horas: string | number | null;
  horas_semestre: string | number | null;
  mat: string | null;
  matriculados: string | number | null;
  capacidad: string | number | null;
}

export interface FilaAprobacionWh {
  seudonimo: string | null;
  approved: unknown;
  pre_approved: unknown;
  to_confirm: unknown;
  manual_preapproval: unknown;
  origen: string | null;
}

export interface FilaHorarioWh {
  seudonimo: string | null;
  grupos: string | null;
  dia_sem: string | null;
  hora_inic: string | null;
  hora_fin: string | null;
}

export interface FilaPosgradoWh {
  codigo: string | null;
  grupo: string | null;
}

export interface ProfesorNomina {
  seudonimo: string;
  contrato: string;
  escalafon: string;
  duracion: string;
  niveles: string[];
  actividades: Actividad[];
}

const texto = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();

/** Mismo criterio que `numero` de Roomy: coma decimal, vacío es cero. */
const numero = (valor: unknown): number => {
  const n = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Un entero o `null`: vacío no es cero (una actividad sin grupo no tiene matrícula; un grupo vacío sí la tiene en cero). */
const entero = (valor: unknown): number | null => {
  const t = texto(valor);
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
};

const sinTildes = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Verdadero para `true`, 1 y los textos que lo dicen; todo lo demás es falso. */
export function verdadero(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const t = String(v ?? "").trim().toLowerCase();
  return t === "true" || t === "t" || t === "1" || t === "si" || t === "sí";
}

const POSGRADO_POR_NOMBRE = /ESPECIALIZ|MAESTR|DOCTORAD/;

/**
 * El nivel de una actividad.
 *
 * Roomy lo sabía por el reporte del que venía la fila (nómina de pregrado o de posgrado). La nómina del Warehouse es
 * una sola; una actividad es de posgrado si su (código, grupo) aparece en «Matriculados por grupo (posgrado)» (ms_posg)
 * o, a falta de ese conjunto, si el departamento o carrera dice especialización, maestría o doctorado.
 */
export function nivelDe(codigo: string, grupo: string, departamento: string, posgrado: Set<string> | null): "Pregrado" | "Posgrado" {
  if (posgrado && posgrado.has(`${codigo}|${grupo}`)) return "Posgrado";
  return POSGRADO_POR_NOMBRE.test(sinTildes(departamento)) ? "Posgrado" : "Pregrado";
}

/** El conjunto de claves (código|grupo) de posgrado, o `null` si ms_posg no está cargado. */
export function clavesPosgrado(filas: FilaPosgradoWh[] | null): Set<string> | null {
  if (!filas || filas.length === 0) return null;
  const claves = new Set<string>();
  for (const f of filas) {
    const c = texto(f.codigo).toUpperCase();
    if (c) claves.add(`${c}|${texto(f.grupo)}`);
  }
  return claves;
}

/**
 * Convierte las filas de la nómina en profesores con sus actividades (equivale a `parsearNomina` + `fundirNominas`).
 * La matrícula sale de `matriculados` y `capacidad` si vienen, o de `mat` («23/26»).
 */
export function leerNomina(filas: FilaNominaWh[], posgrado: Set<string> | null): ProfesorNomina[] {
  const profesores = new Map<string, ProfesorNomina>();
  for (const fila of filas) {
    const seudonimo = texto(fila.seudonimo);
    const codigo = texto(fila.codigo).toUpperCase();
    if (!seudonimo || !codigo) continue;

    let p = profesores.get(seudonimo);
    if (!p) {
      p = { seudonimo, contrato: texto(fila.contrato), escalafon: texto(fila.categoria), duracion: texto(fila.duracion), niveles: [], actividades: [] };
      profesores.set(seudonimo, p);
    } else {
      if (!p.contrato && fila.contrato) p.contrato = texto(fila.contrato);
      if (!p.escalafon && fila.categoria) p.escalafon = texto(fila.categoria);
      if (!p.duracion && fila.duracion) p.duracion = texto(fila.duracion);
    }

    let matriculados: number | null = null;
    let capacidad: number | null = null;
    const mat = texto(fila.mat);
    if (mat.includes("/")) {
      const [m, c] = mat.split("/").map((parte) => Number.parseInt(parte, 10));
      matriculados = Number.isFinite(m) ? m : null;
      capacidad = Number.isFinite(c) ? c : null;
    } else {
      matriculados = entero(fila.matriculados);
      capacidad = entero(fila.capacidad);
    }

    const grupo = texto(fila.grupo);
    const departamento = texto(fila.dpto);
    const nivel = nivelDe(codigo, grupo, departamento, posgrado);
    if (!p.niveles.includes(nivel)) p.niveles.push(nivel);

    p.actividades.push({
      codigo,
      nombre: texto(fila.actividad),
      tipo: texto(fila.tipo).toUpperCase(),
      grupo,
      departamento,
      codPrograma: texto(fila.codprog),
      horas: numero(fila.horas),
      horasSemestre: numero(fila.horas_semestre),
      matriculados,
      capacidad,
      observacion: "",
      nivel,
    });
  }
  return [...profesores.values()];
}

/** Estado de aprobación de Master por seudónimo (equivale a `cargarEstadoMaster`, sin la observación, que no se guarda). */
export interface EstadoMaster {
  estado: "APROBADA" | "PREAPROBADA" | "NO_DETERMINADO" | "SIN_DATO_MASTER";
  preaprobacion: "MANUAL" | "AUTOMATICA" | "SIN_DATO_MASTER";
}

/**
 * Master expone tres banderas y no un estado único: aprobado, preaprobado y por confirmar. Solo se cree lo que Master
 * afirma: tres banderas en falso no dicen «sin aprobar». Si el profesor sale en pregrado y en posgrado, manda pregrado.
 */
export function leerAprobacion(filas: FilaAprobacionWh[] | null): Map<string, EstadoMaster> {
  const mapa = new Map<string, EstadoMaster>();
  if (!filas) return mapa;
  const ordenadas = [...filas].sort((a, b) => (a.origen === "pregrado" ? 1 : 0) - (b.origen === "pregrado" ? 1 : 0));
  for (const fila of ordenadas) {
    const id = texto(fila.seudonimo);
    if (!id) continue;
    const aprobado = verdadero(fila.approved);
    const pre = verdadero(fila.pre_approved);
    const estado: EstadoMaster["estado"] = aprobado ? "APROBADA" : pre ? "PREAPROBADA" : verdadero(fila.to_confirm) ? "NO_DETERMINADO" : "SIN_DATO_MASTER";
    mapa.set(id, { estado, preaprobacion: pre ? (verdadero(fila.manual_preapproval) ? "MANUAL" : "AUTOMATICA") : "SIN_DATO_MASTER" });
  }
  return mapa;
}

/**
 * Normaliza el ESTADO que imprimiría la nómina antigua («Pre-Aprobado», «Sin Aprobación»). La nómina nueva no trae esa
 * columna; se conserva porque es parte del motor de Roomy y por si una carga vieja la trae.
 */
export function normalizarEstadoMaster(t: unknown): string {
  const s = String(t ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!s) return "SIN_DATO_MASTER";
  if (s.includes("PRE")) return "PREAPROBADA";
  if (s.includes("SIN APROBACION") || s.includes("SIN APROBAR")) return "SIN_APROBAR";
  if (s.includes("APROBAD")) return "APROBADA";
  if (s.includes("RECHAZ")) return "SIN_APROBAR";
  return "NO_DETERMINADO";
}

/** Mayúsculas, sin tildes y sin espacios de más: la llave con que se une un programa a su unidad (como `wh_norm_nombre`). */
export function normNombre(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Código del programa (departamento) con más horas: el que representa al profesor. */
export function programaPrincipal(actividades: Actividad[]): string {
  const horas = new Map<string, number>();
  for (const a of actividades) {
    if (!a.departamento) continue;
    horas.set(a.departamento, (horas.get(a.departamento) ?? 0) + (Number(a.horas) || 0));
  }
  return [...horas.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
}

/* --- Distribución semanal (horario) ------------------------------------------------------------------------------ */

export const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
export const FRANJAS = ["Mañana", "Tarde", "Noche"] as const;

const DIA_POR_TEXTO: Record<string, number> = { LUNES: 0, MARTES: 1, MIERCOLES: 2, JUEVES: 3, VIERNES: 4, SABADO: 5 };

/** «06:50am», «05:40pm», «12:40pm» → minutos desde la medianoche; `null` si no se entiende. */
export function minutosDeHora(valor: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])?\.?m?\.?$/i.exec(texto(valor));
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const sufijo = m[3]?.toLowerCase();
  if (sufijo === "p" && h < 12) h += 12;
  if (sufijo === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Las horas académicas son de 50 minutos (un bloque de 06:50 a 08:30 son 2 horas). */
const MINUTOS_POR_HORA = 50;

/**
 * Las horas de clase de cada profesor por día (lunes a sábado) y franja (mañana, tarde, noche; por la hora de inicio).
 * Solo cuenta lo que está en el horario: las demás actividades de la nómina no tienen día ni hora. Un mismo bloque
 * repetido (mismo grupo, día y hora) se cuenta una vez. Devuelve la matriz [6 días][3 franjas] de cada seudónimo.
 */
export function leerSemana(filas: FilaHorarioWh[] | null): Map<string, number[][]> {
  const semanas = new Map<string, number[][]>();
  if (!filas) return semanas;
  const vistos = new Set<string>();
  for (const f of filas) {
    const id = texto(f.seudonimo);
    const dia = DIA_POR_TEXTO[sinTildes(f.dia_sem).trim()];
    const ini = minutosDeHora(f.hora_inic);
    const fin = minutosDeHora(f.hora_fin);
    if (!id || dia === undefined || ini === null || fin === null || fin <= ini) continue;
    const llave = `${id}|${texto(f.grupos)}|${dia}|${ini}|${fin}`;
    if (vistos.has(llave)) continue;
    vistos.add(llave);
    let m = semanas.get(id);
    if (!m) {
      m = DIAS.map(() => [0, 0, 0]);
      semanas.set(id, m);
    }
    const franja = ini < 12 * 60 ? 0 : ini < 18 * 60 ? 1 : 2;
    m[dia][franja] += (fin - ini) / MINUTOS_POR_HORA;
  }
  for (const m of semanas.values()) for (const dia of m) for (let i = 0; i < 3; i += 1) dia[i] = Math.round(dia[i] * 10) / 10;
  return semanas;
}
