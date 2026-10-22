/* =============================================================================
   UDrive · cruce de tablas.

   Dos tablas se unen por una columna que las dos tengan (A = B), como un BUSCARV
   que no se rinde a la primera: si en B hay varias filas con la misma llave, el
   resultado tiene una fila por cada una. Se puede conservar solo lo que coincide
   o todas las filas de A. Lo que no coincide se cuenta y se lista para avisarlo.
   Las llaves se comparan sin tildes ni mayúsculas, y «5» es igual a 5.
   ========================================================================== */

import { normalizar } from "../../internacionalizacion/lib/conceptos";
import type { ColumnaUd, ConservarFilas, FilaUd, TablaDatos, Valor } from "../tipos";
import { aNumeroEs, vacio } from "./valores";

/** La llave de una celda para comparar; vacío si no hay nada que comparar. */
export function llaveDeCruce(v: Valor | undefined): string {
  if (vacio(v)) return "";
  const n = typeof v === "number" ? v : /^-?[\d.,]+$/.test(String(v).trim()) ? aNumeroEs(v) : null;
  return n !== null ? `n:${n}` : `t:${normalizar(v)}`;
}

export interface ResultadoCruce {
  tabla: TablaDatos;
  /** Llaves distintas que están en las dos tablas. */
  coinciden: number;
  /** Valores de A (como se escribieron) que no están en B, sin repetir. */
  sinParejaA: string[];
  /** Valores de B que no están en A, sin repetir. */
  sinParejaB: string[];
  /** Filas vacías en la columna de unión de A o de B: no se pueden unir. */
  sinLlaveA: number;
  sinLlaveB: number;
  /** De qué columna de la tabla de origen sale cada columna del resultado ("a" o "b" y su clave). */
  origen: Record<string, { tabla: "a" | "b"; clave: string }>;
}

const texto = (v: Valor | undefined): string => (v === null || v === undefined ? "" : String(v));

/**
 * Une A y B por `claveA = claveB`. El resultado lleva primero las columnas de A
 * (con la de unión una sola vez, la de A) y después las de B salvo la de unión.
 * Las claves del resultado son `a__<clave>` y `b__<clave>`; si dos columnas
 * comparten rótulo, la de B lo lleva con « (B)».
 */
export function unirTablas(a: TablaDatos, b: TablaDatos, claveA: string, claveB: string, conservar: ConservarFilas): ResultadoCruce {
  const colA = a.columnas.find((c) => c.clave === claveA);
  const colB = b.columnas.find((c) => c.clave === claveB);
  if (!colA || !colB) throw new Error("Elija la columna de cada tabla por la que se unen.");

  const origen: ResultadoCruce["origen"] = {};
  const rotulos = new Set(a.columnas.map((c) => c.etiqueta.toLowerCase()));
  const columnas: ColumnaUd[] = a.columnas.map((c) => {
    const clave = `a__${c.clave}`;
    origen[clave] = { tabla: "a", clave: c.clave };
    return { ...c, clave };
  });
  for (const c of b.columnas) {
    if (c.clave === claveB) continue;
    const clave = `b__${c.clave}`;
    origen[clave] = { tabla: "b", clave: c.clave };
    const etiqueta = rotulos.has(c.etiqueta.toLowerCase()) ? `${c.etiqueta} (B)` : c.etiqueta;
    rotulos.add(etiqueta.toLowerCase());
    columnas.push({ ...c, clave, etiqueta });
  }

  const indice = new Map<string, FilaUd[]>();
  let sinLlaveB = 0;
  for (const f of b.filas) {
    const k = llaveDeCruce(f.datos[claveB]);
    if (!k) {
      sinLlaveB++;
      continue;
    }
    const lista = indice.get(k);
    if (lista) lista.push(f);
    else indice.set(k, [f]);
  }

  const filas: FilaUd[] = [];
  const coincidentes = new Set<string>();
  const sinParejaA = new Map<string, string>();
  let sinLlaveA = 0;
  for (const fa of a.filas) {
    const k = llaveDeCruce(fa.datos[claveA]);
    const pares = k ? (indice.get(k) ?? []) : [];
    if (!k) sinLlaveA++;
    if (!pares.length) {
      if (k && !sinParejaA.has(k)) sinParejaA.set(k, texto(fa.datos[claveA]));
      if (conservar === "todas_a") filas.push({ id: `r${filas.length + 1}`, datos: filaUnida(fa, undefined, a, b, claveB) });
      continue;
    }
    coincidentes.add(k);
    for (const fb of pares) filas.push({ id: `r${filas.length + 1}`, datos: filaUnida(fa, fb, a, b, claveB) });
  }

  const sinParejaB: string[] = [];
  for (const [k, lista] of indice) if (!coincidentes.has(k)) sinParejaB.push(texto(lista[0].datos[claveB]));

  return { tabla: { columnas, filas }, coinciden: coincidentes.size, sinParejaA: [...sinParejaA.values()], sinParejaB, sinLlaveA, sinLlaveB, origen };
}

function filaUnida(fa: FilaUd, fb: FilaUd | undefined, a: TablaDatos, b: TablaDatos, claveB: string): Record<string, Valor> {
  const datos: Record<string, Valor> = {};
  for (const c of a.columnas) datos[`a__${c.clave}`] = fa.datos[c.clave] ?? null;
  for (const c of b.columnas) if (c.clave !== claveB) datos[`b__${c.clave}`] = fb ? (fb.datos[c.clave] ?? null) : null;
  return datos;
}

/** «8 periodos coinciden. Los que no aparecen en las dos tablas se omiten, y se lo aviso.» */
export function avisoDeCruce(r: ResultadoCruce, conservar: ConservarFilas, nombreLlave = "valores"): string {
  const partes: string[] = [];
  partes.push(r.coinciden === 1 ? `1 ${nombreLlave.replace(/s$/, "")} coincide.` : `${r.coinciden} ${nombreLlave} coinciden.`);
  const fuera = conservar === "coinciden" ? r.sinParejaA.length : 0;
  if (r.sinParejaA.length && conservar === "coinciden") partes.push(`Se omiten ${r.sinParejaA.length} de A que no están en B: ${muestra(r.sinParejaA)}.`);
  if (r.sinParejaA.length && conservar === "todas_a") partes.push(`${r.sinParejaA.length} de A no tienen pareja en B y quedan con la parte de B vacía: ${muestra(r.sinParejaA)}.`);
  if (r.sinParejaB.length) partes.push(`${r.sinParejaB.length} de B no están en A y no aparecen: ${muestra(r.sinParejaB)}.`);
  if (r.sinLlaveA || r.sinLlaveB) partes.push(`Filas sin valor de unión: ${r.sinLlaveA} en A y ${r.sinLlaveB} en B.`);
  void fuera;
  return partes.join(" ");
}

function muestra(valores: readonly string[], max = 4): string {
  const v = valores.slice(0, max).map((x) => `«${x}»`);
  return valores.length > max ? `${v.join(", ")} y ${valores.length - max} más` : v.join(", ");
}

/** Cruzar columnas de la misma tabla: una tabla nueva con solo esas columnas (las claves se conservan). */
export function columnasDeLaMismaTabla(t: TablaDatos, claves: readonly string[]): TablaDatos {
  const columnas = claves.map((k) => t.columnas.find((c) => c.clave === k)).filter((c): c is ColumnaUd => Boolean(c));
  const filas = t.filas.map((f) => ({ id: f.id, datos: Object.fromEntries(columnas.map((c) => [c.clave, f.datos[c.clave] ?? null])) }));
  return { columnas, filas };
}
