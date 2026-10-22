/* =============================================================================
   Encuestas con Pilo · resultados básicos (puro).

   De las respuestas vigentes saca el conteo por estado y, por pregunta, lo que
   sirve para una gráfica simple: reparto de opciones y escalas, promedio y
   rango de cifras, o cuántas contestaron en lo demás. Lo borrado no cuenta.
   ========================================================================== */

import type { EstadoAporte } from "../tipos";
import { ESTADOS } from "../tipos";
import type { Estructura, ItemBloque, Pregunta, Valores } from "./estructura";
import { preguntasDe } from "./estructura";

export interface RespuestaLeida {
  id: string;
  estado: EstadoAporte;
  valores: Valores;
  borrado_en?: string | null;
}

export const vigentes = (r: readonly RespuestaLeida[]): RespuestaLeida[] => r.filter((x) => !x.borrado_en);

export function conteoPorEstado(respuestas: readonly RespuestaLeida[]): { estado: EstadoAporte; texto: string; n: number }[] {
  const vivas = vigentes(respuestas);
  return ESTADOS.map((e) => ({ estado: e.id, texto: e.texto, n: vivas.filter((r) => r.estado === e.id).length }));
}

export interface Barra {
  clave: string;
  texto: string;
  n: number;
  /** De 0 a 1 respecto de la barra más larga. */
  parte: number;
}

export type ResultadoPregunta =
  | { tipo: "reparto"; pregunta: Pregunta; respondieron: number; barras: Barra[] }
  | { tipo: "numerico"; pregunta: Pregunta; respondieron: number; promedio: number; minimo: number; maximo: number; suma: number }
  | { tipo: "bloque"; pregunta: Pregunta; respondieron: number; logros: number; retos: number; cifras: number }
  | { tipo: "texto"; pregunta: Pregunta; respondieron: number };

const lleno = (v: unknown): boolean => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

function barras(cuentas: Map<string, { texto: string; n: number }>): Barra[] {
  const mayor = Math.max(1, ...[...cuentas.values()].map((c) => c.n));
  return [...cuentas].map(([clave, c]) => ({ clave, texto: c.texto, n: c.n, parte: c.n / mayor }));
}

function contar(cuentas: Map<string, { texto: string; n: number }>, clave: string) {
  const c = cuentas.get(clave);
  if (c) c.n += 1;
}

export function resultadoDe(p: Pregunta, respuestas: readonly RespuestaLeida[]): ResultadoPregunta {
  const valores = vigentes(respuestas)
    .map((r) => r.valores[p.id])
    .filter(lleno);
  switch (p.tipo) {
    case "opcion_unica":
    case "lista":
    case "opcion_multiple": {
      const cuentas = new Map((p.opciones ?? []).map((o) => [o.id, { texto: o.texto, n: 0 }]));
      for (const v of valores) for (const id of Array.isArray(v) ? (v as string[]) : [String(v)]) contar(cuentas, id);
      return { tipo: "reparto", pregunta: p, respondieron: valores.length, barras: barras(cuentas) };
    }
    case "escala": {
      const a = p.validaciones?.escalaMin ?? 1;
      const b = p.validaciones?.escalaMax ?? 5;
      const cuentas = new Map<string, { texto: string; n: number }>();
      for (let i = a; i <= b; i++) cuentas.set(String(i), { texto: String(i), n: 0 });
      for (const v of valores) contar(cuentas, String(v));
      return { tipo: "reparto", pregunta: p, respondieron: valores.length, barras: barras(cuentas) };
    }
    case "cifra": {
      const ns = valores.map(Number).filter(Number.isFinite);
      const suma = ns.reduce((s, x) => s + x, 0);
      return { tipo: "numerico", pregunta: p, respondieron: ns.length, promedio: ns.length ? suma / ns.length : 0, minimo: ns.length ? Math.min(...ns) : 0, maximo: ns.length ? Math.max(...ns) : 0, suma };
    }
    case "bloque_logro_reto": {
      const items = valores.flatMap((v) => v as ItemBloque[]);
      return { tipo: "bloque", pregunta: p, respondieron: valores.length, logros: items.filter((i) => i.tipo === "logro").length, retos: items.filter((i) => i.tipo === "reto").length, cifras: items.reduce((s, i) => s + (i.cifras?.length ?? 0), 0) };
    }
    default:
      return { tipo: "texto", pregunta: p, respondieron: valores.length };
  }
}

export const resultadosDe = (e: Estructura, respuestas: readonly RespuestaLeida[]): ResultadoPregunta[] => preguntasDe(e).map((p) => resultadoDe(p, respuestas));
