/* =============================================================================
   Reportes Institucionales · ayudas de la interfaz.
   Periodos, fechas de corte, rótulos de estado y la fila vacía. Nada de esto
   valida: eso es del motor.
   ========================================================================== */

import type {
  Campo,
  CatalogoId,
  Contexto,
  Corte,
  Cruces,
  Estado,
  Fila,
  ItemCatalogo,
  Periodo,
  PeriodoCodigo,
  PlantillaSpec,
} from "./tipos";

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  pendiente: "Pendiente",
  cargada: "Cargada",
  errores: "Con errores",
  validada: "Validada",
  enviada: "Enviada a HECAA",
};

export const ORDEN_ESTADOS: Estado[] = ["pendiente", "cargada", "errores", "validada", "enviada"];

export const CATALOGOS_VACIOS: Record<CatalogoId, ItemCatalogo[]> = { programa: [], municipio: [], pais: [] };

export const CRUCES_VACIOS: Cruces = { participantes: new Set(), matriculados: new Set(), graduados: new Map(), inscritos: new Set(), inscritosPrograma: new Set(), admitidos: new Set(), primerCurso: new Set() };

/* ---------- periodos ---------- */

export function periodoDe(codigo: PeriodoCodigo): Periodo {
  const [anio, sem] = codigo.split("-");
  return { anio: Number(anio), semestre: sem === "1" ? 1 : 2 };
}

export function codigoPeriodo(p: Periodo): PeriodoCodigo {
  return `${p.anio}-${p.semestre}`;
}

/** El semestre en curso: enero a junio es el 1; julio a diciembre, el 2. */
export function periodoActual(hoy = new Date()): Periodo {
  return { anio: hoy.getFullYear(), semestre: hoy.getMonth() >= 6 ? 2 : 1 };
}

/** El semestre en curso y los tres anteriores, del más reciente al más viejo. */
export function periodosRecientes(hoy = new Date()): PeriodoCodigo[] {
  const out: PeriodoCodigo[] = [];
  let p = periodoActual(hoy);
  for (let n = 0; n < 4; n++) {
    out.push(codigoPeriodo(p));
    p = p.semestre === 2 ? { anio: p.anio, semestre: 1 } : { anio: p.anio - 1, semestre: 2 };
  }
  return out;
}

/* ---------- fechas de corte ---------- */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fechaCorte(corte: Corte, periodo: Periodo): Date {
  const [mm, dd] = corte.fecha.split("-").map(Number);
  return new Date(periodo.anio + (corte.siguienteAnio ? 1 : 0), mm - 1, dd);
}

/** «31 ene 2027»; sin año si es el de hoy. */
export function formatoFecha(d: Date, hoy = new Date()): string {
  const base = `${d.getDate()} ${MESES[d.getMonth()]}`;
  return d.getFullYear() === hoy.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

function inicioDelDia(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface ProximaFecha {
  tipo: "Primer corte" | "Definitiva";
  fecha: Date;
  /** Días que faltan (0 = hoy). Negativo si ya pasó la definitiva. */
  dias: number;
}

/** El próximo corte que aún no pasa; si pasaron los dos, la definitiva vencida. */
export function proximaFecha(spec: PlantillaSpec, periodo: PeriodoCodigo, hoy = new Date()): ProximaFecha | null {
  const p = periodoDe(periodo);
  const f = spec.fechas[p.semestre];
  const dia = inicioDelDia(hoy).getTime();
  const cortes: ProximaFecha[] = [];
  if (f.primerCorte) cortes.push({ tipo: "Primer corte", fecha: fechaCorte(f.primerCorte, p), dias: 0 });
  if (f.definitiva) cortes.push({ tipo: "Definitiva", fecha: fechaCorte(f.definitiva, p), dias: 0 });
  for (const c of cortes) c.dias = Math.round((c.fecha.getTime() - dia) / 86_400_000);
  return cortes.find((c) => c.dias >= 0) ?? cortes[cortes.length - 1] ?? null;
}

/** «Primer corte mañana», «Definitiva 31 ene 2027», «Definitiva venció el 31 ene». */
export function textoFecha(pf: ProximaFecha, hoy = new Date()): string {
  if (pf.dias < 0) return `${pf.tipo} venció el ${formatoFecha(pf.fecha, hoy)}`;
  if (pf.dias === 0) return `${pf.tipo} hoy`;
  if (pf.dias === 1) return `${pf.tipo} mañana`;
  if (pf.dias <= 3) return `${pf.tipo} en ${pf.dias} días`;
  return `${pf.tipo} ${formatoFecha(pf.fecha, hoy)}`;
}

/* ---------- filas ---------- */

export const vacio = (v: string | undefined | null) => (v ?? "").trim() === "";

/** Una fila nueva: el año y el semestre del periodo ya puestos. */
export function filaVacia(spec: PlantillaSpec, periodo: PeriodoCodigo, canonizar: (c: Campo, v: string) => string): Fila {
  const p = periodoDe(periodo);
  const fila: Fila = {};
  for (const c of spec.campos) {
    fila[c.codigo] = "";
    if (c.codigo === "AÑO" || c.codigo === "ANO") fila[c.codigo] = String(p.anio);
    if (c.codigo === "SEMESTRE") fila[c.codigo] = canonizar(c, String(p.semestre));
  }
  return fila;
}

/** Clave estable de un error, para separar los de celda de los de cruce. */
export const claveError = (e: { fila: number; campo: string; mensaje: string }) => `${e.fila}|${e.campo}|${e.mensaje}`;

/** Normaliza encabezados de Excel: sin tildes, en mayúsculas y con guiones bajos. */
export function normalizarEncabezado(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "_");
}

export function normalizarTexto(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** El contexto con lo que tenga a mano; los cruces llegan después. */
export function armarContexto(
  periodo: PeriodoCodigo,
  catalogos: Record<CatalogoId, ItemCatalogo[]> | undefined,
  dominios: Contexto["dominios"],
  cruces: Cruces | undefined,
): Contexto {
  return {
    periodo: periodoDe(periodo),
    catalogos: catalogos ?? CATALOGOS_VACIOS,
    dominios,
    cruces: cruces ?? CRUCES_VACIOS,
  };
}
