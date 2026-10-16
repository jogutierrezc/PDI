/* =============================================================================
   Espacio de archivos · la lógica pura de la hoja.

   Sin React ni DOM, para poder probarla: cómo se cambia una celda, cómo se
   pega un bloque de Excel, cuál es el siguiente error (F8) y qué cambió
   respecto a lo guardado (para el guardado). Las reglas de cada módulo
   (cómo se lee y se valida una celda) llegan como `Reglas`.
   ========================================================================== */

import type { Datos, EspColumna, FilaGuardada, FilaLocal, Reglas } from "./tipos";

/** «hace 5 min», «hace 3 h», «hace 12 d». */
export function haceCuanto(iso: string | null | undefined, ahora: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const min = Math.max(0, Math.round((ahora - t) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
}

/** «1 fila», «3 filas». */
export const textoFilas = (n: number): string => `${n} ${n === 1 ? "fila" : "filas"}`;

export const textoDeValor = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function filasLocales(guardadas: readonly FilaGuardada[]): FilaLocal[] {
  return guardadas.map((f) => ({ k: f.id, id: f.id, datos: f.datos, grupo: f.grupo }));
}

const completar = (reglas: Reglas, columnas: readonly EspColumna[], datos: Datos): Datos => reglas.completar?.(columnas, datos) ?? datos;

/** Cambia una celda: lo escrito se lee según las reglas del módulo (número, fecha AAAA-MM-DD, opción). */
export function cambiarCelda(filas: readonly FilaLocal[], k: string, columna: EspColumna, escrito: string, reglas: Reglas, columnas: readonly EspColumna[] = [columna]): FilaLocal[] {
  const valor = reglas.leer(columna, escrito);
  return filas.map((f) => {
    if (f.k !== k || textoDeValor(f.datos[columna.clave]) === textoDeValor(valor)) return f;
    return { ...f, datos: completar(reglas, columnas, { ...f.datos, [columna.clave]: valor }) };
  });
}

/** Un bloque copiado de Excel: filas separadas por salto de línea y celdas por tabulación. Nulo si es una sola celda. */
export function parsearPortapapeles(texto: string): string[][] | null {
  const limpio = texto.replace(/\r/g, "").replace(/\n$/, "");
  if (!/[\t\n]/.test(limpio)) return null;
  return limpio.split("\n").map((l) => l.split("\t").map((c) => c.trim()));
}

export interface ResultadoPegado {
  filas: FilaLocal[];
  pegadas: number;
  agregadas: number;
}

/**
 * Pega un bloque desde la celda (fila `desde.fila` en el orden que se ve,
 * columna `desde.columna` entre las visibles). Salta las columnas de solo
 * lectura y las filas bloqueadas, y agrega filas al final si el bloque no
 * cabe (`nueva` da el grupo de la fila nueva; sin ella no se agregan).
 */
export function aplicarPegado(args: {
  filas: readonly FilaLocal[];
  /** Claves de las filas en el orden en que se ven (con orden y búsqueda aplicados). */
  orden: readonly string[];
  /** Columnas visibles, en su orden. */
  columnas: readonly EspColumna[];
  desde: { fila: number; columna: number };
  matriz: readonly (readonly string[])[];
  reglas: Reglas;
  claveNueva: () => string;
  /** Grupo de una fila nueva; nulo si no se pueden agregar filas. */
  grupoNuevo?: () => string | null | undefined;
  bloqueada?: (f: FilaLocal) => boolean;
}): ResultadoPegado {
  const editables = args.columnas.slice(args.desde.columna).filter((c) => !c.solo_lectura);
  const porClave = new Map(args.filas.map((f) => [f.k, f] as const));
  const salida = [...args.filas];
  const posiciones = new Map(salida.map((f, i) => [f.k, i] as const));
  const puedeAgregar = args.grupoNuevo ? args.grupoNuevo() !== null : true;
  let agregadas = 0;
  let pegadas = 0;
  args.matriz.forEach((linea, i) => {
    let k = args.orden[args.desde.fila + i];
    if (k === undefined || !porClave.has(k)) {
      if (!puedeAgregar) return;
      k = args.claveNueva();
      const nueva: FilaLocal = { k, datos: {}, grupo: args.grupoNuevo?.() ?? undefined };
      salida.push(nueva);
      posiciones.set(k, salida.length - 1);
      porClave.set(k, nueva);
      agregadas++;
    }
    const pos = posiciones.get(k)!;
    if (args.bloqueada?.(salida[pos])) return;
    let datos: Datos = { ...salida[pos].datos };
    linea.forEach((celda, j) => {
      const c = editables[j];
      if (c) datos[c.clave] = args.reglas.leer(c, celda);
    });
    datos = completar(args.reglas, args.columnas, datos);
    salida[pos] = { ...salida[pos], datos };
    pegadas++;
  });
  return { filas: salida, pegadas, agregadas };
}

export interface ErrorEnCelda {
  k: string;
  clave: string;
  mensaje: string;
}

/** Los errores de las celdas, en el orden en que se ven las filas. */
export function erroresEnCeldas(columnas: readonly EspColumna[], filas: readonly FilaLocal[], reglas: Reglas, orden?: readonly string[]): ErrorEnCelda[] {
  const porClave = new Map(filas.map((f) => [f.k, f] as const));
  const salida: ErrorEnCelda[] = [];
  for (const k of orden ?? filas.map((f) => f.k)) {
    const f = porClave.get(k);
    if (!f) continue;
    for (const c of columnas) {
      const m = c.solo_lectura ? "" : reglas.error(columnas, f.datos, c);
      if (m) salida.push({ k, clave: c.clave, mensaje: m });
    }
  }
  return salida;
}

export const llaveDeCelda = (k: string, clave: string): string => `${k}\u0001${clave}`;

/** El error que sigue al de la celda activa (F8); da la vuelta al llegar al final. */
export function siguienteError(errores: readonly ErrorEnCelda[], activa: { k: string; clave: string } | null): ErrorEnCelda | null {
  if (!errores.length) return null;
  if (!activa) return errores[0];
  const i = errores.findIndex((e) => e.k === activa.k && e.clave === activa.clave);
  return i >= 0 ? errores[(i + 1) % errores.length] : errores[0];
}

export interface Guardado {
  filas: { id?: string; datos: Datos; grupo?: string; orden?: number }[];
  borrar: string[];
}

const igual = (a: Datos, b: Datos): boolean => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (textoDeValor(a[k]) !== textoDeValor(b[k])) return false;
  return true;
};

/** Las filas locales que cambiaron respecto a lo guardado (o no están guardadas). */
export function filasSucias(locales: readonly FilaLocal[], guardadas: readonly FilaGuardada[]): FilaLocal[] {
  const g = new Map(guardadas.map((f) => [f.id, f] as const));
  return locales.filter((f) => !f.id || !g.has(f.id) || !igual(f.datos, g.get(f.id)!.datos));
}

/**
 * Lo que cambió respecto a lo guardado: filas nuevas, distintas y quitadas.
 * `incluir` deja fuera filas (p. ej. con errores o bloqueadas); `soloBorrar`
 * manda únicamente las quitadas. Nulo si no hay nada.
 */
export function cambiosPendientes(
  locales: readonly FilaLocal[],
  guardadas: readonly FilaGuardada[],
  opciones: { incluir?: (f: FilaLocal) => boolean; soloBorrar?: boolean } = {},
): Guardado | null {
  const vistos = new Set(locales.filter((f) => f.id).map((f) => f.id!));
  const filas = opciones.soloBorrar ? [] : filasSucias(locales, guardadas).filter((f) => opciones.incluir?.(f) ?? true).map((f) => ({ id: f.id, datos: f.datos, grupo: f.grupo, orden: f.id ? undefined : locales.indexOf(f) }));
  const borrar = guardadas.filter((f) => !vistos.has(f.id)).map((f) => f.id);
  return filas.length || borrar.length ? { filas, borrar } : null;
}

/** Sin tildes, en minúsculas y con espacios simples: para buscar «maestria» y hallar «Maestría». */
export function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Tras guardar y volver a leer: pone el servidor al día sin perder lo que se
 * escribió mientras tanto ni lo que no se mandó. Una fila local vuelve a la
 * versión del servidor si no cambió desde que se mandó (o desde la lectura
 * anterior); las filas nuevas toman su id; lo que otra persona agregó se suma.
 */
export function reconciliar(args: {
  locales: readonly FilaLocal[];
  servidor: readonly FilaGuardada[];
  /** Lo guardado en la lectura anterior. */
  antes: readonly FilaGuardada[];
  /** Los datos que se mandaron, por clave de fila local. */
  enviadas: ReadonlyMap<string, Datos>;
}): FilaLocal[] {
  const idsAntes = new Set(args.antes.map((f) => f.id));
  const anterior = new Map(args.antes.map((f) => [f.id, f] as const));
  const porId = new Map(args.servidor.map((f) => [f.id, f] as const));
  // Las filas nuevas que se mandaron toman, en orden, los ids que aparecieron.
  const nuevosIds = args.servidor.filter((f) => !idsAntes.has(f.id)).map((f) => f.id);
  const mandadasSinId = args.locales.filter((f) => !f.id && args.enviadas.has(f.k));
  const asignado = new Map<string, string>();
  if (mandadasSinId.length === nuevosIds.length) mandadasSinId.forEach((f, i) => asignado.set(f.k, nuevosIds[i]));
  const usados = new Set<string>(asignado.values());

  const salida: FilaLocal[] = [];
  for (const f of args.locales) {
    const id = f.id ?? asignado.get(f.k);
    if (!id) {
      salida.push(f);
      continue;
    }
    const s = porId.get(id);
    if (!s) continue; // ya no existe en el servidor
    usados.add(id);
    const mandada = args.enviadas.get(f.k);
    const base = mandada ?? anterior.get(id)?.datos;
    const limpia = base ? igual(f.datos, base) : false;
    salida.push(limpia ? { k: f.k, id, datos: s.datos, grupo: s.grupo ?? f.grupo } : { ...f, id });
  }
  for (const s of args.servidor) if (!usados.has(s.id) && !idsAntes.has(s.id)) salida.push({ k: s.id, id: s.id, datos: s.datos, grupo: s.grupo });
  return salida;
}
