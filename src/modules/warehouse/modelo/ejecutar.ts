/* Warehouse UDES · modelo semántico · ejecución de una medida.

   Calcula una medida del catálogo para un periodo y, si se pide, agrupada por dimensiones. No toca la red: recibe un
   `Lector` que sabe pedirle a la base (wh_explorar) un agregado de una fuente. Así la misma lógica la usan los
   tableros, la vista previa del asistente y los datos que se le entregan a Pilo Tableros.

   Reglas que cumple:
     · una razón se calcula sobre las sumas de cada fuente y se une por clave normalizada (nunca promedio de razones);
     · la división es segura: vacío si el denominador no existe o es cero;
     · agrupar solo por dimensiones con columna en TODAS las fuentes de la medida y que no sean personales;
     · lo que no se puede calcular se dice con una razón, no se inventa. */

import { DIMENSIONES, normalizarNombre, type DimensionId } from "./dimensiones";
import { fuentePorId } from "./fuentes";
import { medidaPorId, razonSegura, type Calculo, type FiltroBI, type OperacionBI } from "./medidas";

export interface PeticionLectura {
  fuente: string;
  periodo: string;
  dims: string[];
  medida: { op: OperacionBI; col?: string };
  filtros: FiltroBI[];
}
export interface LecturaGrupos {
  filas: { k: (string | null)[]; v: (number | null)[] }[];
  /** La reserva de 5 ocultó grupos. */
  descartados: number;
}
/** null: esa fuente no tiene nada guardado para ese periodo. */
export type Lector = (p: PeticionLectura) => Promise<LecturaGrupos | null>;

export interface FilaResultado {
  /** Etiquetas de las dimensiones pedidas, en orden. */
  clave: string[];
  valor: number | null;
}
export interface ResultadoMedida {
  filas: FilaResultado[];
  descartados: number;
  /** Fuentes sin carga en ese periodo. */
  sinDatos: string[];
}

/** Lo que impide calcular: se muestra tal cual a la persona. */
export class NoCalculable extends Error {}

export interface ContextoEjecucion {
  periodo: string;
  /** El periodo anterior en la tabla de periodos (para el cambio entre periodos). */
  anterior: string | null;
  dims: DimensionId[];
  leer: Lector;
}

/** La columna de una fuente que representa una dimensión, sin datos personales. Prefiere la de nombre a la de código. */
export function columnaParaDimension(fuenteId: string, dim: DimensionId): string | null {
  const f = fuentePorId(fuenteId);
  if (!f) return null;
  const candidatas = Object.entries(f.columnas).filter(([, c]) => c.dimension === dim && !c.personal).map(([nombre]) => nombre);
  if (!candidatas.length) return null;
  return candidatas.find((c) => /nombre/.test(c)) ?? candidatas.find((c) => !/^cod/.test(c)) ?? candidatas[0];
}

/** Las dimensiones por las que se puede desglosar una medida (las que tienen columna en todas sus fuentes). */
export function dimensionesDesglosables(c: Calculo): DimensionId[] {
  const fuentes = fuentesDeCalculo(c);
  return (Object.keys(DIMENSIONES) as DimensionId[]).filter(
    (d) => !DIMENSIONES[d].personal && d !== "periodo" && d !== "sede" && fuentes.length > 0 && fuentes.every((f) => columnaParaDimension(f, d) !== null),
  );
}

function fuentesDeCalculo(c: Calculo): string[] {
  if (c.tipo === "agregado") return [c.fuente];
  if (c.tipo === "razon") return [...new Set([...fuentesDeCalculo(c.numerador), ...fuentesDeCalculo(c.denominador)])];
  const base = medidaPorId(c.base);
  return base ? fuentesDeCalculo(base.calculo) : [];
}

const claveDe = (etiquetas: string[]) => etiquetas.map((e) => normalizarNombre(e)).join("|");

async function agregado(c: Extract<Calculo, { tipo: "agregado" }>, ctx: ContextoEjecucion, periodo: string): Promise<ResultadoMedida> {
  const fuente = fuentePorId(c.fuente);
  if (fuente?.periodosEnColumnas) throw new NoCalculable(`«${fuente.nombre}» trae un periodo por columna: falta pasar esas columnas a filas para calcularla.`);
  const dims: string[] = [];
  for (const d of ctx.dims) {
    const col = columnaParaDimension(c.fuente, d);
    if (!col) throw new NoCalculable(`«${fuente?.nombre ?? c.fuente}» no tiene ${DIMENSIONES[d].nombre.toLowerCase()}: no se puede desglosar por ahí.`);
    dims.push(col);
  }
  const lectura = await ctx.leer({ fuente: c.fuente, periodo, dims, medida: { op: c.op, col: c.columna }, filtros: c.filtros ?? [] });
  if (!lectura) return { filas: [], descartados: 0, sinDatos: [c.fuente] };
  return {
    filas: lectura.filas.map((f) => ({ clave: f.k.map((x) => (x ?? "").trim() || "(sin dato)"), valor: f.v[0] ?? null })),
    descartados: lectura.descartados,
    sinDatos: [],
  };
}

async function calcular(c: Calculo, ctx: ContextoEjecucion, periodo: string): Promise<ResultadoMedida> {
  if (c.tipo === "agregado") return agregado(c, ctx, periodo);
  if (c.tipo === "razon") {
    const [n, d] = await Promise.all([calcular(c.numerador, ctx, periodo), calcular(c.denominador, ctx, periodo)]);
    const bajo = new Map(d.filas.map((f) => [claveDe(f.clave), f.valor]));
    const filas: FilaResultado[] = n.filas.map((f) => ({ clave: f.clave, valor: razonSegura(f.valor, bajo.get(claveDe(f.clave)) ?? null, c.porCien) }));
    return { filas, descartados: n.descartados + d.descartados, sinDatos: [...new Set([...n.sinDatos, ...d.sinDatos])] };
  }
  const base = medidaPorId(c.base);
  if (!base) throw new NoCalculable("La medida base del cambio ya no existe.");
  if (!ctx.anterior) return { filas: [], descartados: 0, sinDatos: [] };
  const [ahora, antes] = await Promise.all([calcular(base.calculo, ctx, periodo), calcular(base.calculo, ctx, ctx.anterior)]);
  const previo = new Map(antes.filas.map((f) => [claveDe(f.clave), f.valor]));
  const filas: FilaResultado[] = ahora.filas.map((f) => {
    const p = previo.get(claveDe(f.clave));
    return { clave: f.clave, valor: f.valor === null || p === null || p === undefined ? null : f.valor - p };
  });
  return { filas, descartados: ahora.descartados + antes.descartados, sinDatos: [...new Set([...ahora.sinDatos, ...antes.sinDatos])] };
}

/** La medida del catálogo, calculada en el periodo del contexto. Sin dimensiones devuelve una sola fila con clave vacía. */
export async function ejecutarMedida(id: string, ctx: ContextoEjecucion): Promise<ResultadoMedida> {
  const m = medidaPorId(id);
  if (!m) throw new NoCalculable("Esa medida no existe en el catálogo.");
  const bloqueadas = ctx.dims.filter((d) => !dimensionesDesglosables(m.calculo).includes(d));
  if (bloqueadas.length) throw new NoCalculable(`«${m.nombre}» no se puede desglosar por ${bloqueadas.map((d) => DIMENSIONES[d].nombre.toLowerCase()).join(" y ")} con las fuentes que usa.`);
  const r = await calcular(m.calculo, ctx, ctx.periodo);
  // Sin dimensiones, la base devuelve un solo grupo; si no hubo filas (fuente sin carga) queda vacío.
  return r;
}

/** Ordena de mayor a menor y deja las primeras `limite`; el resto se resume en el aviso del visual. */
export function principales(filas: FilaResultado[], limite: number): { visibles: FilaResultado[]; ocultas: number } {
  const ordenadas = [...filas].filter((f) => f.valor !== null).sort((a, b) => (b.valor as number) - (a.valor as number));
  return { visibles: ordenadas.slice(0, limite), ocultas: Math.max(0, ordenadas.length - limite) };
}
