/* =============================================================================
   Mr. Pilo · la capa profunda (0173): lo que comparten los lectores.

   Un lector lee DIRECTO de las tablas del portal (con el cliente de servicio de
   la función) y arma pasajes ricos para la memoria: texto en español, con su
   ruta, su corte, su oficina y la fecha de lo que leyó. No rastrea páginas.
   Cada lector es:

     · idempotente  — el mismo estado de la base da los mismos pasajes (mismas
                      referencias, mismo texto); repetirlo no cambia nada;
     · por partes   — `partes()` lista las unidades que se leen una a una (un
                      informe, un boletín, un pilar…) y `leer()` lee una: así
                      «Actualizar la memoria» avanza por lotes sin agotar el
                      tiempo de la función, y la consulta en vivo lee solo la
                      parte que la pregunta nombra;
     · acotado      — tope de tiempo (`vence`) y de filas (`maxFilas`);
     · sin dinero y sin datos personales — mismas reglas que la memoria de
                      siempre (ver `noMoney`, `esDinero`) y nada que identifique
                      a una persona: solo cifras agregadas y nombres de unidades.

   Este archivo no habla con la red: lo único externo es el cliente `Db`, que
   las pruebas reemplazan por uno en memoria.
   ========================================================================== */

/** Las fuentes de la memoria que tienen capa profunda. */
export type Fuente = "cifras" | "boletines" | "pdi" | "impacto";
export const FUENTES: Fuente[] = ["cifras", "boletines", "pdi", "impacto"];

export type Fila = Record<string, unknown>;

/** Un pasaje listo para `pilo_deep_save`. `vis`: «sesion» lo lee solo el personal con sesión. */
export interface Pasaje {
  ref: string;
  title: string;
  section: string;
  body: string;
  path: string;
  cut: string;
  office: string;
  vis?: "publico" | "sesion";
}

/** Lo mínimo del cliente de Supabase que usan los lectores (así se reemplaza en las pruebas). */
export interface Consulta extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select(columnas?: string): Consulta;
  eq(columna: string, valor: unknown): Consulta;
  in(columna: string, valores: unknown[]): Consulta;
  gt(columna: string, valor: unknown): Consulta;
  order(columna: string, opciones?: { ascending?: boolean }): Consulta;
  limit(n: number): Consulta;
  range(desde: number, hasta: number): Consulta;
}
export interface Db {
  from(tabla: string): Consulta;
}

export interface Contexto {
  db: Db;
  /** Cuándo se lee (fija la fecha de «actualizado» y los años en curso). */
  ahora: Date;
  /** Hora tope (ms desde 1970): pasada, la lectura se corta con `ErrorTiempo`. */
  vence: number;
  /** Tope de filas leídas en una parte; pasado, se corta con `ErrorFilas`. 0 = sin tope. */
  maxFilas: number;
  /** Filas leídas hasta ahora (lo lleva `traer`). */
  filas: number;
  /** La dirección del proyecto (para los archivos públicos del almacenamiento). */
  urlBase?: string;
}

export class ErrorTiempo extends Error {
  constructor() {
    super("Se agotó el tiempo de lectura.");
    this.name = "ErrorTiempo";
  }
}
export class ErrorFilas extends Error {
  constructor() {
    super("La lectura pasó el tope de filas.");
    this.name = "ErrorFilas";
  }
}

export const contexto = (db: Db, opciones: { ahora?: Date; ms?: number; maxFilas?: number; urlBase?: string } = {}): Contexto => ({
  db,
  urlBase: opciones.urlBase,
  ahora: opciones.ahora ?? new Date(),
  vence: Date.now() + (opciones.ms ?? 100_000),
  maxFilas: opciones.maxFilas ?? 0,
  filas: 0,
});

/** Una unidad que se lee sola: un informe, un boletín, un pilar… */
export interface Parte {
  id: string;
  /** Cómo se llama, tal cual lo ve la persona en el portal. */
  etiqueta: string;
  /** Otros nombres con que la gente la nombra (para la consulta en vivo). */
  alias: string[];
}

export interface Lector {
  id: Fuente;
  /** Cómo se llama el portal, tal cual. */
  nombre: string;
  /** Cómo nombra la gente al portal (normalizado: sin tildes, minúsculas). */
  alias: string[];
  /** Pide sesión de la intranet: sus pasajes nacen «con sesión». */
  conSesion: boolean;
  partes(ctx: Contexto): Promise<Parte[]>;
  leer(ctx: Contexto, parte: Parte): Promise<Pasaje[]>;
}

/* --- Texto a prueba de datos reales ---------------------------------------------------------- */

const DINERO = /dinero|peso|\$|cop\b|millones|presupuest/i;
const BASURA = /\[object Object\]|\bundefined\b|\bnull\b|\bNaN\b/g;

export const limpio = (s: unknown): string => (typeof s === "string" ? s : typeof s === "number" && Number.isFinite(s) ? String(s) : "").replace(/\s+/g, " ").trim();

/** ¿Habla de dinero? Para nombres, unidades y títulos: si sí, no entra. */
export const esDinero = (s: unknown): boolean => DINERO.test(limpio(s));

/** Quita las frases que dan una cifra de dinero (palabra de dinero y un número en la misma frase). */
export function sinDinero(texto: string): string {
  if (!DINERO.test(texto)) return texto;
  return texto
    .split(/(?<=[.!?…;])\s+/)
    .filter((parte) => !(DINERO.test(parte) && /\d/.test(parte)))
    .join(" ");
}

/** Una frase con su punto final; vacía si no hay texto. */
export const frase = (s: unknown): string => {
  const t = sinDinero(limpio(s));
  return !t ? "" : /[.!?…]$/.test(t) ? t : `${t}.`;
};

export const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export const esObjeto = (v: unknown): v is Fila => Boolean(v) && typeof v === "object" && !Array.isArray(v);
export const lista = <T = Fila>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => x !== null && x !== undefined) as T[]) : []);

/** Normaliza para comparar nombres: sin tildes, en minúsculas, solo letras y números. */
export const normal = (s: unknown): string =>
  limpio(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();

const entero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const unDecimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dosDecimales = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export type Formato = "entero" | "porcentaje" | "decimal";

/** La cifra como la escribe el portal: enteros sin decimales, tasas con uno. */
export function cifra(valor: number | null, formato: Formato = "entero"): string {
  if (valor === null) return "sin dato";
  return formato === "entero" ? entero.format(valor) : unDecimal.format(valor);
}

/** Cifra con su unidad: «12,5 %», «1.234 estudiantes». */
export function conUnidad(valor: number | null, formato: Formato, unidad: string): string {
  if (valor === null) return "sin dato";
  const c = cifra(valor, formato);
  const u = limpio(unidad);
  return formato === "porcentaje" || u === "%" ? `${c} %` : u ? `${c} ${u}` : c;
}

/** Un número cualquiera (casillas de tablas): entero o hasta dos decimales. */
export const suelto = (valor: number): string => (Number.isInteger(valor) ? entero.format(valor) : dosDecimales.format(valor));

/**
 * La variación entre dos cifras, dicha: las tasas cambian en puntos
 * porcentuales y lo demás en porcentaje. Vacía si no se puede decir.
 */
export function variacion(actual: number | null, previo: number | null, formato: Formato): string {
  if (actual === null || previo === null) return "";
  const dif = actual - previo;
  if (formato === "porcentaje") {
    if (dif === 0) return "sin cambio";
    return `${dif > 0 ? "+" : "−"}${unDecimal.format(Math.abs(dif))} p. p.`;
  }
  if (previo === 0) return dif === 0 ? "sin cambio" : "";
  const pct = (dif / Math.abs(previo)) * 100;
  if (pct === 0) return "sin cambio";
  return `${pct > 0 ? "+" : "−"}${unDecimal.format(Math.abs(pct))} %`;
}

/** «2024-A» → «2024-1», «2024-B» → «2024-2»: los periodos se numeran. */
export const periodo = (texto: unknown): string => limpio(texto).replace(/\b(\d{4})-([AB])(?![A-Za-z0-9])/g, (_m, y: string, t: string) => `${y}-${t === "A" ? "1" : "2"}`);

/** «2026-10-20» → «20 de octubre de 2026»; otra cosa, tal cual. */
export function fecha(v: unknown): string {
  const t = limpio(v);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return t;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return Number.isNaN(d.getTime()) ? t : new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

/** La fecha de lectura en Bogotá, para decir «actualizado el…». */
export function leidoEl(ahora: Date): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }).format(ahora);
}

/** La hora de lectura en Bogotá («14:32»), para lo que se lee en vivo. */
export function horaDe(ahora: Date): string {
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" }).format(ahora);
}

/* --- Topes y cierre de un pasaje ------------------------------------------------------------- */

export const CUERPO_MIN = 10;
export const CUERPO_MAX = 4000;
const TOPES = { ref: 300, title: 300, section: 300, path: 300, cut: 60, office: 200 } as const;

/** Recorta en la última frase completa que quepa. */
export function recorte(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const cabeza = texto.slice(0, max - 1);
  const punto = cabeza.lastIndexOf(". ");
  return `${punto > max * 0.6 ? cabeza.slice(0, punto + 1) : cabeza.trimEnd()}…`;
}

const ordenado = (s: unknown, max: number) => recorte(limpio(limpio(s).replace(BASURA, "")), max);

/**
 * Deja los pasajes como los recibe la base: campos en texto y con sus topes,
 * cuerpo sin dinero, sin los que no llegan a lo mínimo y sin referencias
 * repetidas (gana la primera). Toda referencia lleva el prefijo «prof:».
 */
export function cerrar(filas: Partial<Pasaje>[]): Pasaje[] {
  const vistos = new Set<string>();
  const salida: Pasaje[] = [];
  for (const f of filas) {
    const ref = limpio(f.ref).slice(0, TOPES.ref);
    const title = ordenado(f.title, TOPES.title);
    const body = recorte(limpio(sinDinero(limpio(f.body).replace(BASURA, ""))), CUERPO_MAX);
    if (!ref.startsWith("prof:") || ref.length < 7 || !title || body.length < CUERPO_MIN || vistos.has(ref)) continue;
    vistos.add(ref);
    salida.push({
      ref,
      title,
      section: ordenado(f.section, TOPES.section),
      body,
      path: limpio(f.path).slice(0, TOPES.path),
      cut: ordenado(f.cut, TOPES.cut),
      office: ordenado(f.office, TOPES.office),
      ...(f.vis === "sesion" ? { vis: "sesion" as const } : {}),
    });
  }
  return salida;
}

/**
 * Parte una lista de líneas en pasajes que quepan: la primera lleva el
 * encabezado y cada una de las siguientes lo repite en corto, así cada pasaje
 * se entiende solo. Devuelve los cuerpos.
 */
export function trocear(encabezado: string, lineas: string[], max = CUERPO_MAX - 200): string[] {
  const cuerpos: string[] = [];
  let actual = encabezado;
  let conLineas = false;
  for (const l of lineas) {
    if (!l) continue;
    if (conLineas && actual.length + l.length + 1 > max) {
      cuerpos.push(actual);
      actual = encabezado;
      conLineas = false;
    }
    actual = actual ? `${actual} ${l}` : l;
    conLineas = true;
  }
  if (conLineas || (actual && cuerpos.length === 0)) cuerpos.push(actual);
  return cuerpos;
}

/* --- Leer tablas ----------------------------------------------------------------------------- */

const PAGINA = 1000;

/** Que la lectura no pase del tiempo ni de las filas que le tocan. */
export function vigilar(ctx: Contexto, nuevas = 0): void {
  if (Date.now() > ctx.vence) throw new ErrorTiempo();
  ctx.filas += nuevas;
  if (ctx.maxFilas > 0 && ctx.filas > ctx.maxFilas) throw new ErrorFilas();
}

interface OpcionesTraer {
  columnas?: string;
  /** Filtros de la tabla (eq, in). */
  filtrar?: (q: Consulta) => Consulta;
  /** Columna única por la que se avanza («dame las siguientes a esta»). Sin ella, por rangos. */
  clave?: string | null;
  orden?: string;
}

/** Trae todas las filas de una tabla, página a página, vigilando tiempo y filas. Un error de la base se lanza. */
export async function traer(ctx: Contexto, tabla: string, opciones: OpcionesTraer = {}): Promise<Fila[]> {
  const { columnas = "*", filtrar = (q) => q, clave = "id", orden } = opciones;
  const filas: Fila[] = [];
  let despues: unknown = null;
  for (let desde = 0; ; desde += PAGINA) {
    vigilar(ctx);
    let q = filtrar(ctx.db.from(tabla).select(columnas));
    if (clave) {
      if (despues !== null) q = q.gt(clave, despues);
      q = q.order(clave).limit(PAGINA);
    } else {
      if (orden) q = q.order(orden);
      q = q.range(desde, desde + PAGINA - 1);
    }
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const pagina = lista<Fila>(data);
    filas.push(...pagina);
    vigilar(ctx, pagina.length);
    if (pagina.length < PAGINA) return filas;
    if (clave) despues = pagina[pagina.length - 1][clave];
  }
}

/** Como `traer`, pero filtrando por una lista de ids en trozos (PostgREST no admite listas enormes). */
export async function traerPorIds(ctx: Contexto, tabla: string, columna: string, ids: string[], opciones: Omit<OpcionesTraer, "filtrar"> = {}): Promise<Fila[]> {
  const salida: Fila[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const trozo = ids.slice(i, i + 80);
    salida.push(...(await traer(ctx, tabla, { ...opciones, filtrar: (q) => q.in(columna, trozo) })));
  }
  return salida;
}

/** Agrupa filas por el valor de una columna. */
export function agrupar<T extends Fila>(filas: T[], columna: string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const f of filas) {
    const k = String(f[columna] ?? "");
    const l = mapa.get(k);
    if (l) l.push(f);
    else mapa.set(k, [f]);
  }
  return mapa;
}

/** Une una lista corta en una frase: «a, b y c». */
export function unir(items: string[], max = 12): string {
  const l = items.filter(Boolean);
  const vista = l.slice(0, max);
  const resto = l.length - vista.length;
  const texto = vista.length > 1 ? `${vista.slice(0, -1).join(", ")} y ${vista[vista.length - 1]}` : (vista[0] ?? "");
  return resto > 0 ? `${vista.join(", ")} y ${resto} más` : texto;
}
