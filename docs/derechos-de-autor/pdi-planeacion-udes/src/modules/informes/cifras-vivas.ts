/* =============================================================================
   Informes Institucionales · cifras vivas, sin React ni Supabase.

   Una cifra con fuente automática (UDES en Cifras, PDI, aportes) se lee en
   vivo mientras el informe está en borrador o devuelto. Si cambió desde que
   la unidad la revisó (`visto`), el editor avisa «cambió de X a Y». Enviado o
   aprobado, manda la foto (`foto_valor`). Las fuentes propias (excel, manual,
   url) guardan su valor y exigen nombre de fuente.

   El valor vivo lo calcula la base (`informe_cifras_vivas`, 0153) con la
   misma lectura que usa la foto al enviar; aquí solo se combina y se compara.
   ========================================================================== */

import { cifraDef } from "./plantillas";
import type { CifraRow, Condicion, EstadoInstancia, FuenteTipo, LecturaViva } from "./types";

export const ETIQUETA_FUENTE: Record<FuenteTipo, string> = {
  auto: "UDES en Cifras (en vivo)",
  pdi: "Indicador del PDI (en vivo)",
  aportes: "Aportes aprobados (en vivo)",
  excel: "Excel propio",
  manual: "Dato manual",
  url: "Documento o URL",
};

export const esViva = (t: FuenteTipo) => t === "auto" || t === "pdi" || t === "aportes";
export const esPropia = (t: FuenteTipo) => !esViva(t);
/** Enviado o aprobado: las cifras son la foto. */
export const congelado = (estado: EstadoInstancia | null | undefined) => estado === "sent" || estado === "ok";

export function formatoCifra(v: number | null | undefined, unidad = ""): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("es-CO", { maximumFractionDigits: 1 })}${unidad}`;
}

export type Semaforo = "ok" | "mid" | "bad";
export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = { ok: "Cumplida", mid: "En camino", bad: "Rezagada" };

/** Cumplimiento frente a la meta: 100 % o más, cumplida; 90 % o más, en camino. */
export function semaforo(valor: number | null, meta: number | null, mayorMejor = true): Semaforo | null {
  if (valor === null || meta === null || !Number.isFinite(valor) || !Number.isFinite(meta)) return null;
  if (mayorMejor ? meta === 0 : valor === 0) return "ok";
  const r = mayorMejor ? valor / meta : meta / valor;
  return r >= 1 ? "ok" : r >= 0.9 ? "mid" : "bad";
}

/** Variación con signo, calculada (nunca tecleada): «+75», «−0,8 pp». */
export function variacion(valor: number | null, anterior: number | null, unidad = ""): string | null {
  if (valor === null || anterior === null) return null;
  const d = Math.round((valor - anterior) * 10) / 10;
  const signo = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${signo}${Math.abs(d).toLocaleString("es-CO")}${unidad.trim() === "%" ? " pp" : ""}`;
}

/** Resultado de una meta a partir de programado y alcanzado. */
export function resultadoMeta(programado: number | null, alcanzado: number | null): "Superada" | "Cumplida" | "Parcial" | null {
  if (alcanzado === null || programado === null) return null;
  return alcanzado > programado ? "Superada" : alcanzado === programado ? "Cumplida" : "Parcial";
}

/* ---------- La cifra como la ve el editor ----------------------------------- */

export interface CifraVista {
  clave: string;
  etiqueta: string;
  unidad: string;
  mayorMejor: boolean;
  valor: number | null;
  anterior: number | null;
  meta: number | null;
  fuenteTipo: FuenteTipo;
  fuente: string;
  corte: string | null;
  viva: boolean;
  propia: boolean;
  congelada: boolean;
  /** Cambió desde que la unidad la revisó: de → a. */
  cambio: { de: number; a: number } | null;
  incluida: boolean;
  justificacion: string;
  condicion: Condicion;
}

/**
 * Junta la definición, lo guardado (`informe_cifras`) y la lectura viva.
 * `condicion` es lo que fijó Planeación para la plantilla; sin fila,
 * una cifra «justificar» o «sugerido» entra incluida.
 */
export function vistaCifra(
  clave: string,
  o: { fila?: CifraRow | null; viva?: LecturaViva | null; estado: EstadoInstancia; condicion?: Condicion },
): CifraVista {
  const def = cifraDef(clave);
  const fila = o.fila ?? null;
  const tipo: FuenteTipo = fila?.fuente_tipo ?? "auto";
  const frio = congelado(o.estado);
  const viva = esViva(tipo);
  const lectura = o.viva ?? null;
  const condicion = o.condicion ?? "sugerido";

  let valor: number | null;
  if (frio) valor = fila?.foto_valor ?? fila?.valor ?? null;
  else valor = viva ? (lectura?.valor ?? null) : (fila?.valor ?? null);

  const visto = fila?.visto ?? null;
  const cambio = !frio && viva && lectura?.valor != null && visto !== null && visto !== lectura.valor ? { de: visto, a: lectura.valor } : null;

  return {
    clave,
    etiqueta: fila?.etiqueta || def?.etiqueta || clave,
    unidad: fila?.unidad ?? def?.unidad ?? "",
    mayorMejor: def?.mayorMejor ?? fila?.consulta?.baja !== true,
    valor,
    anterior: fila?.anterior ?? null,
    meta: fila?.meta ?? null,
    fuenteTipo: tipo,
    fuente: frio ? fila?.foto_fuente || fila?.fuente_nombre || def?.fuente || "" : viva ? lectura?.fuente || fila?.fuente_nombre || def?.fuente || "" : fila?.fuente_nombre ?? "",
    corte: frio ? (fila?.foto_en ?? null) : viva ? (lectura?.corte ?? null) : null,
    viva: viva && !frio,
    propia: Boolean(fila?.propia) || esPropia(tipo),
    congelada: frio,
    cambio,
    incluida: condicion === "justificar" ? true : condicion === "no" ? false : (fila?.incluida ?? true),
    justificacion: fila?.justificacion ?? "",
    condicion,
  };
}

/** Número de una celda que puede venir como texto. */
export function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** «2.840» → 2840; «7,8» → 7.8; «7.8» → 7.8 (un punto con uno o dos decimales es decimal). */
export const numeroDe = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const x = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^-?\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, "");
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
