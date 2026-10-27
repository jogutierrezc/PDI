/* =============================================================================
   UDrive · gráficas: el catálogo, la paleta y los datos que se dibujan.

   Aquí se decide qué datos van a cada tipo de gráfica a partir de una tabla;
   el dibujo lo hace TanStack Charts en ui/GraficaVista.tsx. Los valores siempre
   son los de la tabla: nada se inventa ni se redondea. Sin React ni DOM.
   ========================================================================== */

import type { ColumnaUd, ConfigGrafica, TablaDatos, TipoGrafica, Valor } from "../tipos";
import { agregacionDe, agregacionSugerida, agregar, agruparPorRotulo, filasEnOrden, filasFiltradas, hayAgrupacion, leerAgregacion, leerAgruparFecha, leerFiltroFecha, resumenFiltro, rotulo } from "./agrupar";
import { regresionLineal, tendenciaPorPosicion } from "./regresion";
import { esNumerica, numeroDe, textoNumero } from "./valores";

// El filtro y la agrupación viven en ./agrupar; se reexporta rotulo aquí para quien ya lo importa de este archivo.
export { rotulo } from "./agrupar";

/** La paleta institucional fija; las gráficas no dejan elegir otros colores. Contraste ≥ 3:1 sobre blanco (gráficos). */
export const PALETA = ["#1f5fbf", "#0b7481", "#0a2d63", "#b67a0c", "#6b3fa0", "#12833a", "#b42b2a", "#5f7089"] as const;

export const colorDe = (indice: number): string => PALETA[((indice % PALETA.length) + PALETA.length) % PALETA.length];

export type GrupoGrafica = "tiempo" | "comparar" | "composicion" | "relacion" | "combinar";

export const GRUPOS: { id: GrupoGrafica; nombre: string }[] = [
  { id: "tiempo", nombre: "Evolución en el tiempo" },
  { id: "comparar", nombre: "Comparar categorías" },
  { id: "composicion", nombre: "Composición" },
  { id: "relacion", nombre: "Relación y distribución" },
  { id: "combinar", nombre: "Gráficas combinadas" },
];

export interface FichaGrafica {
  id: TipoGrafica;
  nombre: string;
  grupo: GrupoGrafica;
  /** Cuándo conviene. */
  cuando: string;
  /** Qué columnas pide. */
  necesita: string;
  /** Una buena práctica. */
  buenas: string;
  /** Máximo de series (1 = una sola). */
  maxSeries: number;
  /** Las series deben ser numéricas (todas lo son salvo que se diga otra cosa). */
  usaTendencia?: boolean;
}

/** Solo lo que realmente se construye. */
export const CATALOGO: FichaGrafica[] = [
  { id: "linea", nombre: "Línea", grupo: "tiempo", cuando: "Una o varias cifras que cambian a lo largo de periodos o fechas.", necesita: "Una columna de periodos y una o más de números.", buenas: "Empiece el eje en cero salvo que la variación sea el mensaje; rotule el último valor.", maxSeries: 6, usaTendencia: true },
  { id: "area", nombre: "Área", grupo: "tiempo", cuando: "Cuánto hay en total y cómo se reparte en el tiempo (las series se apilan).", necesita: "Periodos y una o más columnas de números que se pueden sumar.", buenas: "Pocas series; no apile cifras que no se puedan sumar.", maxSeries: 6 },
  { id: "barras", nombre: "Barras", grupo: "comparar", cuando: "Comparar una cifra entre categorías o periodos.", necesita: "Una columna de categorías y una de números.", buenas: "Las barras siempre parten de cero. Ordene de mayor a menor si no hay un orden natural.", maxSeries: 1 },
  { id: "barras-h", nombre: "Barras horizontales", grupo: "comparar", cuando: "Nombres largos de categorías o muchos programas.", necesita: "Una columna de categorías y una de números.", buenas: "Ordene de mayor a menor; deje espacio para los nombres.", maxSeries: 1 },
  { id: "agrupadas", nombre: "Barras agrupadas", grupo: "comparar", cuando: "Comparar varias cifras lado a lado en cada categoría.", necesita: "Categorías y dos o más columnas de números en la misma unidad.", buenas: "Hasta cuatro series; mismo orden de colores en todo el informe.", maxSeries: 6 },
  { id: "apiladas", nombre: "Barras apiladas", grupo: "composicion", cuando: "El total de cada categoría y de qué se compone.", necesita: "Categorías y dos o más columnas de números que suman un total.", buenas: "Ponga primero la serie más importante; solo la de la base se compara bien.", maxSeries: 6 },
  { id: "torta", nombre: "Torta", grupo: "composicion", cuando: "Qué parte del total es cada categoría (pocas categorías).", necesita: "Categorías y una columna de números positivos.", buenas: "Hasta cinco porciones; si son muchas, use barras.", maxSeries: 1 },
  { id: "dona", nombre: "Dona", grupo: "composicion", cuando: "Lo mismo que la torta, con el total en el centro.", necesita: "Categorías y una columna de números positivos.", buenas: "Hasta cinco porciones; el total del centro lo calcula la gráfica.", maxSeries: 1 },
  { id: "dispersion", nombre: "Dispersión", grupo: "relacion", cuando: "Si dos cifras se mueven juntas (una por programa, sede o periodo).", necesita: "Dos columnas de números (X y Y).", buenas: "Rotule los puntos extremos; no concluya causalidad.", maxSeries: 1 },
  { id: "burbujas", nombre: "Burbujas", grupo: "relacion", cuando: "Dos cifras y una tercera que da el tamaño.", necesita: "Tres columnas de números (X, Y y tamaño).", buenas: "Explique qué mide el tamaño; el área, no el diámetro, es lo que se compara.", maxSeries: 1 },
  { id: "calor", nombre: "Mapa de calor", grupo: "relacion", cuando: "Una cifra por cada cruce de dos categorías (programa × periodo).", necesita: "Dos columnas de categorías y una de números.", buenas: "Muestre el valor en cada celda; la escala va de claro a oscuro.", maxSeries: 1 },
  { id: "barras-linea", nombre: "Barras y línea", grupo: "combinar", cuando: "Una cantidad (barras) y un porcentaje o tasa (línea) en los mismos periodos.", necesita: "Periodos, una columna para las barras y otra para la línea.", buenas: "Cada eje con su unidad y su color; la línea va en el eje derecho.", maxSeries: 2 },
  { id: "dos-lineas", nombre: "Dos líneas, dos ejes", grupo: "combinar", cuando: "Dos cifras de unidades distintas que se quieren ver juntas.", necesita: "Periodos y dos columnas de números.", buenas: "Los ejes distintos pueden sugerir relaciones falsas: explique ambas escalas.", maxSeries: 2 },
];

export const fichaDe = (tipo: TipoGrafica): FichaGrafica => CATALOGO.find((f) => f.id === tipo) ?? CATALOGO[0];

export const esCombinada = (t: TipoGrafica): boolean => t === "barras-linea" || t === "dos-lineas";

/** Una configuración razonable para empezar con una tabla: la primera columna no numérica como eje y la primera numérica como serie. */
export function configInicial(tipo: TipoGrafica, tabla: TablaDatos | null): ConfigGrafica {
  const cols = tabla?.columnas ?? [];
  const categorica = cols.find((c) => !esNumerica(c)) ?? cols[0];
  const numericas = cols.filter((c) => esNumerica(c) && c.clave !== categorica?.clave);
  const ficha = fichaDe(tipo);
  const cuantas = tipo === "dispersion" || tipo === "burbujas" ? 1 : esCombinada(tipo) ? Math.min(2, numericas.length) : Math.min(ficha.maxSeries === 1 ? 1 : 2, numericas.length);
  const series = numericas.slice(0, Math.max(1, cuantas)).map((c, i) => ({ clave: c.clave, color: i, eje: esCombinada(tipo) && i === 1 ? ("derecho" as const) : ("izquierdo" as const) }));
  return {
    tipo,
    titulo: "",
    nota: "",
    x: tipo === "dispersion" || tipo === "burbujas" ? (numericas[0]?.clave ?? "") : (categorica?.clave ?? ""),
    series: tipo === "dispersion" || tipo === "burbujas" ? numericas.slice(1, 2).map((c) => ({ clave: c.clave, color: 0 })) : series.filter((s) => s.clave),
    tamano: tipo === "burbujas" ? (numericas[2]?.clave ?? null) : null,
    filaCalor: tipo === "calor" ? (cols.find((c) => !esNumerica(c) && c.clave !== categorica?.clave)?.clave ?? null) : null,
    ejeX: categorica?.etiqueta ?? "",
    ejeY: series[0] ? (cols.find((c) => c.clave === series[0].clave)?.etiqueta ?? "") : "",
    ejeY2: esCombinada(tipo) && series[1] ? (cols.find((c) => c.clave === series[1].clave)?.etiqueta ?? "") : "",
    min: null,
    max: null,
    tendencia: tipo === "linea",
    rotular: tipo === "linea" ? "ultimo" : "ninguno",
    // Las gráficas nuevas parten agrupando los rótulos repetidos (dispersión y burbujas dibujan un punto por fila).
    agrupar: tipo === "dispersion" || tipo === "burbujas" ? "ninguno" : agregacionSugerida(cols.find((c) => c.clave === series[0]?.clave)),
    agruparFecha: "ninguno",
    filtroFecha: null,
    filtroInteractivo: false,
  };
}

/** Lo que falta para poder dibujar, en español; «» si ya se puede. */
export function falta(tabla: TablaDatos | null, c: ConfigGrafica): string {
  if (!tabla) return "Elija la tabla de donde salen los datos.";
  if (!tabla.filas.length) return "La tabla no tiene filas.";
  const col = (k: string | null) => tabla.columnas.find((x) => x.clave === k);
  if (!col(c.x)) return c.tipo === "dispersion" || c.tipo === "burbujas" ? "Elija la columna del eje horizontal (números)." : "Elija la columna del eje horizontal.";
  if (c.tipo === "dispersion" || c.tipo === "burbujas") {
    if (!esNumerica(col(c.x)!)) return "El eje horizontal de una dispersión debe ser una columna de números.";
  }
  if (!c.series.length) return "Elija al menos una serie (una columna de números).";
  if (c.series.some((s) => !col(s.clave))) return "Una de las series ya no existe en la tabla.";
  if (c.series.some((s) => !esNumerica(col(s.clave)!))) return "Las series deben ser columnas de números o porcentajes.";
  if (c.tipo === "burbujas" && !col(c.tamano)) return "Elija la columna que da el tamaño de las burbujas.";
  if (c.tipo === "calor" && !col(c.filaCalor)) return "Elija la columna de las filas del mapa de calor.";
  if (esCombinada(c.tipo) && c.series.length < 2) return "Una gráfica combinada necesita dos series.";
  if (fichaDe(c.tipo).maxSeries === 1 && c.series.length > 1) return "Este tipo de gráfica usa una sola serie.";
  if (resumenFiltro(tabla, c).activo && !filasFiltradas(tabla, c).length) return "El filtro de fechas no deja ninguna fila: amplíe el rango.";
  return "";
}

export interface SerieDatos {
  clave: string;
  etiqueta: string;
  color: number;
  eje: "izquierdo" | "derecho";
  valores: (number | null)[];
}

export interface DatosCategoricos {
  categorias: string[];
  series: SerieDatos[];
}

/**
 * Los datos de las gráficas por categorías. Primero el filtro de fecha; después, si se pidió agrupar,
 * una categoría por rótulo con la agregación de cada serie (fechas en orden cronológico). Sin agrupar,
 * una categoría por fila, como siempre.
 */
export function datosCategoricos(tabla: TablaDatos, c: ConfigGrafica): DatosCategoricos {
  const filas = filasFiltradas(tabla, c);
  if (hayAgrupacion(tabla, c)) {
    const grupos = agruparPorRotulo(filas, tabla, c);
    const series = c.series.map((s, i) => {
      const col = tabla.columnas.find((x) => x.clave === s.clave);
      const agg = agregacionDe(c, s, col);
      const valores = grupos.map((g) => agregar(agg, (agg === "ultimo" ? filasEnOrden(g.filas, tabla, c) : g.filas).map((f) => numeroDe(f.datos[s.clave]))));
      return { clave: s.clave, etiqueta: col?.etiqueta ?? s.clave, color: s.color ?? i, eje: s.eje ?? "izquierdo", valores };
    });
    return { categorias: grupos.map((g) => g.rotulo), series };
  }
  const xs = filas.map((f) => rotulo(f.datos[c.x]));
  // Si un rótulo se repite (dos filas con el mismo periodo), se distingue para no mezclar barras.
  const visto = new Map<string, number>();
  const categorias = xs.map((x) => {
    const n = (visto.get(x) ?? 0) + 1;
    visto.set(x, n);
    return n > 1 ? `${x} (${n})` : x;
  });
  const series = c.series.map((s, i) => {
    const col = tabla.columnas.find((x) => x.clave === s.clave);
    return { clave: s.clave, etiqueta: col?.etiqueta ?? s.clave, color: s.color ?? i, eje: s.eje ?? "izquierdo", valores: filas.map((f) => numeroDe(f.datos[s.clave])) };
  });
  return { categorias, series };
}

export interface PuntoXY {
  id: string;
  x: number;
  y: number;
  r: number | null;
  etiqueta: string;
}

/** Dispersión y burbujas: un punto por fila con X e Y numéricos (los incompletos se omiten). */
export function datosDispersion(tabla: TablaDatos, c: ConfigGrafica): { puntos: PuntoXY[]; omitidos: number } {
  const ycl = c.series[0]?.clave ?? "";
  const nombre = tabla.columnas.find((col) => !esNumerica(col));
  const puntos: PuntoXY[] = [];
  let omitidos = 0;
  filasFiltradas(tabla, c).forEach((f, i) => {
    const x = numeroDe(f.datos[c.x]);
    const y = numeroDe(f.datos[ycl]);
    const r = c.tipo === "burbujas" && c.tamano ? numeroDe(f.datos[c.tamano]) : null;
    if (x === null || y === null || (c.tipo === "burbujas" && (r === null || r < 0))) {
      omitidos++;
      return;
    }
    puntos.push({ id: f.id, x, y, r, etiqueta: nombre ? rotulo(f.datos[nombre.clave]) : `Fila ${i + 1}` });
  });
  return { puntos, omitidos };
}

export interface CeldaCalor {
  id: string;
  columna: string;
  fila: string;
  valor: number;
}

/**
 * Mapa de calor: valor por cruce de columna (X) y fila. Si el cruce se repite se combina con la agregación
 * pedida; sin agrupar, se promedia (como siempre). Con fechas agrupadas, las columnas son los periodos en orden cronológico.
 */
export function datosCalor(tabla: TablaDatos, c: ConfigGrafica): { celdas: CeldaCalor[]; columnas: string[]; filas: string[] } {
  const vcl = c.series[0]?.clave ?? "";
  const agrupado = hayAgrupacion(tabla, c);
  const serie = c.series[0];
  const agg = agrupado && serie ? agregacionDe(c, serie, tabla.columnas.find((x) => x.clave === vcl)) : "promedio";
  const base = filasFiltradas(tabla, c).filter((f) => numeroDe(f.datos[vcl]) !== null);
  const grupos = agrupado ? agruparPorRotulo(base, tabla, c) : null;
  const rotuloColumna = new Map<string, string>();
  grupos?.forEach((g) => g.filas.forEach((f) => rotuloColumna.set(f.id, g.rotulo)));
  const acumulado = new Map<string, { valores: number[]; columna: string; fila: string }>();
  const columnas: string[] = grupos ? grupos.map((g) => g.rotulo) : [];
  const filas: string[] = [];
  for (const f of grupos ? grupos.flatMap((g) => filasEnOrden(g.filas, tabla, c)) : base) {
    const col = rotuloColumna.get(f.id) ?? rotulo(f.datos[c.x]);
    const fila = rotulo(f.datos[c.filaCalor ?? ""]);
    const v = numeroDe(f.datos[vcl]);
    if (v === null) continue;
    if (!columnas.includes(col)) columnas.push(col);
    if (!filas.includes(fila)) filas.push(fila);
    const k = `${fila}\u0001${col}`;
    const a = acumulado.get(k) ?? { valores: [], columna: col, fila };
    a.valores.push(v);
    acumulado.set(k, a);
  }
  const celdas = [...acumulado.entries()].map(([k, a]) => ({ id: k, columna: a.columna, fila: a.fila, valor: agregar(agg, a.valores) ?? 0 }));
  return { celdas, columnas, filas };
}

export interface Porcion {
  id: string;
  nombre: string;
  valor: number;
  color: number;
  /** Fracción del total (0 a 1). */
  parte: number;
}

/** Torta y dona: solo valores positivos; las demás filas se omiten. */
export function datosPorciones(tabla: TablaDatos, c: ConfigGrafica): { porciones: Porcion[]; total: number; omitidas: number } {
  const v = c.series[0]?.clave ?? "";
  const filas = filasFiltradas(tabla, c);
  let candidatas: { id: string; nombre: string; valor: number | null }[];
  if (hayAgrupacion(tabla, c) && c.series[0]) {
    // Las filas con el mismo nombre forman una sola porción.
    const agg = agregacionDe(c, c.series[0], tabla.columnas.find((x) => x.clave === v));
    candidatas = agruparPorRotulo(filas, tabla, c).map((g) => ({ id: g.filas[0].id, nombre: g.rotulo, valor: agregar(agg, (agg === "ultimo" ? filasEnOrden(g.filas, tabla, c) : g.filas).map((f) => numeroDe(f.datos[v]))) }));
  } else {
    candidatas = filas.map((f) => ({ id: f.id, nombre: rotulo(f.datos[c.x]), valor: numeroDe(f.datos[v]) }));
  }
  const base = candidatas.filter((p): p is { id: string; nombre: string; valor: number } => p.valor !== null && p.valor > 0);
  const total = base.reduce((s, p) => s + p.valor, 0);
  return { porciones: base.map((p, i) => ({ ...p, color: i, parte: total ? p.valor / total : 0 })), total, omitidas: candidatas.length - base.length };
}

/** La tendencia lineal de la primera serie (un valor por categoría, nulo donde no se puede). */
export function tendenciaDeSerie(s: SerieDatos): (number | null)[] {
  return tendenciaPorPosicion(s.valores);
}

/** Pendiente por categoría de la primera serie, para decirla en la descripción accesible. */
export function pendienteDe(s: SerieDatos): number | null {
  return regresionLineal(s.valores.map((_, i) => i), s.valores)?.pendiente ?? null;
}

/** El último valor no nulo de una serie con su categoría. */
export function ultimoValor(s: SerieDatos, categorias: readonly string[]): { categoria: string; valor: number } | null {
  for (let i = s.valores.length - 1; i >= 0; i--) {
    const v = s.valores[i];
    if (v !== null) return { categoria: categorias[i], valor: v };
  }
  return null;
}

/** Rango del eje: el pedido por la persona o el que cubre los datos (barras y áreas parten de cero). */
export function rangoDeEje(valores: readonly (number | null)[], pedido: { min: number | null; max: number | null }, desdeCero: boolean): [number, number] {
  const v = valores.filter((x): x is number => x !== null);
  const dmin = v.length ? Math.min(...v) : 0;
  const dmax = v.length ? Math.max(...v) : 1;
  let min = pedido.min ?? (desdeCero ? Math.min(0, dmin) : dmin);
  let max = pedido.max ?? (desdeCero ? Math.max(0, dmax) : dmax);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return min < max ? [min, max] : [max, min];
}

/** Para el lector de pantalla: qué muestra la gráfica en una o dos frases, con los valores reales. */
export function descripcionAccesible(tabla: TablaDatos, c: ConfigGrafica): { etiqueta: string; descripcion: string } {
  const ficha = fichaDe(c.tipo);
  const titulo = c.titulo.trim() || ficha.nombre;
  const etiqueta = `${ficha.nombre}: ${titulo}`;
  if (falta(tabla, c)) return { etiqueta, descripcion: "" };
  const fmt = (n: number) => textoNumero(Math.round(n * 100) / 100);
  // Si hay filtro de fecha, la descripción lo dice: los números ya son los de las filas que quedan.
  const filtro = resumenFiltro(tabla, c);
  const nota = filtro.activo ? ` Filtrada por fecha: ${filtro.quedan} de ${filtro.total} filas${filtro.desde ? `, de ${filtro.desde} a ${filtro.hasta}` : ""}.` : "";
  const con = (r: { etiqueta: string; descripcion: string }) => ({ ...r, descripcion: r.descripcion + nota });
  if (c.tipo === "dispersion" || c.tipo === "burbujas") {
    const { puntos } = datosDispersion(tabla, c);
    return con({ etiqueta, descripcion: `${puntos.length} puntos. ${nombreDe(tabla.columnas, c.x)} en el eje horizontal y ${nombreDe(tabla.columnas, c.series[0]?.clave)} en el vertical.` });
  }
  if (c.tipo === "calor") {
    const { celdas, columnas, filas } = datosCalor(tabla, c);
    const v = celdas.map((x) => x.valor);
    return con({ etiqueta, descripcion: `${filas.length} filas por ${columnas.length} columnas. Valores de ${fmt(Math.min(...v))} a ${fmt(Math.max(...v))}.` });
  }
  if (c.tipo === "torta" || c.tipo === "dona") {
    const { porciones, total } = datosPorciones(tabla, c);
    return con({ etiqueta, descripcion: `Total ${fmt(total)}. ${porciones.map((p) => `${p.nombre}: ${fmt(p.valor)} (${fmt(p.parte * 100)} %)`).join("; ")}.` });
  }
  const d = datosCategoricos(tabla, c);
  const partes = d.series.map((s) => {
    const validos = s.valores.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
    if (!validos.length) return `${s.etiqueta}: sin datos.`;
    const primero = validos[0];
    const ultimo = validos[validos.length - 1];
    const mayor = validos.reduce((a, b) => (b.v > a.v ? b : a));
    const menor = validos.reduce((a, b) => (b.v < a.v ? b : a));
    return `${s.etiqueta}: de ${fmt(primero.v)} en ${d.categorias[primero.i]} a ${fmt(ultimo.v)} en ${d.categorias[ultimo.i]}; el mayor, ${fmt(mayor.v)} en ${d.categorias[mayor.i]}, y el menor, ${fmt(menor.v)} en ${d.categorias[menor.i]}.`;
  });
  return con({ etiqueta, descripcion: partes.join(" ") });
}

const nombreDe = (cols: readonly ColumnaUd[], clave: string | undefined): string => cols.find((c) => c.clave === clave)?.etiqueta ?? "";

/* ---------- color del mapa de calor de una gráfica ------------------------------ */

const hexA = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Mezcla dos colores #rrggbb; t va de 0 (el primero) a 1 (el segundo). */
export function mezclarColores(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const [ra, ga, ba] = hexA(a);
  const [rb, gb, bb] = hexA(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, "0");
  return `#${m(ra, rb)}${m(ga, gb)}${m(ba, bb)}`;
}

/** La escala del mapa de calor de una gráfica: del azul más claro al azul marino institucional. */
export function colorCalorGrafica(valor: number, min: number, max: number): string {
  return mezclarColores("#e6eefb", "#0a2d63", max > min ? (valor - min) / (max - min) : 0.5);
}

/** Blanco sobre fondo oscuro y negro sobre fondo claro, para que el rótulo se lea siempre (≥ 4,5:1). */
export function tintaSobre(fondo: string): string {
  const [r, g, b] = hexA(fondo).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Con negro y blanco, el punto de cruce (luz 0,179) da 4,58:1 de los dos lados: no queda ningún fondo que no se lea.
  return luz > 0.179 ? "#000000" : "#ffffff";
}

/** Cambiar el tipo de una gráfica conserva lo que sirva: título, nota, eje horizontal y series (dentro del máximo del tipo nuevo). */
export function cambiarTipo(c: ConfigGrafica, tipo: TipoGrafica, tabla: TablaDatos): ConfigGrafica {
  const nuevo = configInicial(tipo, tabla);
  const xy = (t: TipoGrafica) => t === "dispersion" || t === "burbujas";
  // El filtro de fecha pasa de un tipo a otro; la agrupación también, salvo desde o hacia dispersión y burbujas.
  const filtro = c.filtroFecha && tabla.columnas.some((k) => k.clave === c.filtroFecha?.columna) ? c.filtroFecha : null;
  const base: ConfigGrafica = { ...nuevo, titulo: c.titulo, nota: c.nota, filtroFecha: filtro, filtroInteractivo: filtro ? c.filtroInteractivo === true : false };
  if (xy(c.tipo) || xy(tipo) || !tabla.columnas.some((k) => k.clave === c.x)) return base;
  const ficha = fichaDe(tipo);
  let series = c.series.filter((s) => tabla.columnas.some((k) => k.clave === s.clave)).slice(0, ficha.maxSeries);
  if (esCombinada(tipo) && series.length < 2) series = nuevo.series;
  if (!series.length) series = nuevo.series;
  series = series.slice(0, esCombinada(tipo) ? 2 : ficha.maxSeries).map((s, i) => ({ ...s, eje: esCombinada(tipo) && i === 1 ? ("derecho" as const) : ("izquierdo" as const) }));
  return {
    ...base,
    x: c.x,
    series,
    filaCalor: tipo === "calor" ? nuevo.filaCalor : null,
    ejeX: c.ejeX,
    ejeY: c.ejeY,
    ejeY2: esCombinada(tipo) ? (c.ejeY2 || (tabla.columnas.find((k) => k.clave === series[1]?.clave)?.etiqueta ?? "")) : "",
    tendencia: tipo === "linea" ? c.tendencia : false,
    agrupar: c.agrupar ?? "ninguno",
    agruparFecha: c.agruparFecha ?? "ninguno",
  };
}

/** Lo que se lee de `contenido.config` de la base: completa lo que falte y descarta lo que no sirva. */
export function normalizarConfig(crudo: unknown, tabla: TablaDatos | null): ConfigGrafica {
  const o = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Partial<ConfigGrafica>;
  const tipo = CATALOGO.some((f) => f.id === o.tipo) ? (o.tipo as TipoGrafica) : "linea";
  const base = configInicial(tipo, tabla);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const txt = (v: unknown, def: string) => (typeof v === "string" ? v : def);
  const series = Array.isArray(o.series)
    ? o.series.filter((s): s is NonNullable<ConfigGrafica["series"]>[number] => typeof s === "object" && s !== null && typeof s.clave === "string").map((s, i) => ({ clave: s.clave, color: typeof s.color === "number" ? s.color : i, eje: s.eje === "derecho" ? ("derecho" as const) : ("izquierdo" as const), ...(leerAgregacion(s.agrupar) ? { agrupar: leerAgregacion(s.agrupar) } : {}) }))
    : base.series;
  return {
    tipo,
    titulo: txt(o.titulo, ""),
    nota: txt(o.nota, ""),
    x: txt(o.x, base.x),
    series,
    tamano: typeof o.tamano === "string" ? o.tamano : base.tamano,
    filaCalor: typeof o.filaCalor === "string" ? o.filaCalor : base.filaCalor,
    ejeX: txt(o.ejeX, base.ejeX),
    ejeY: txt(o.ejeY, base.ejeY),
    ejeY2: txt(o.ejeY2, base.ejeY2),
    min: num(o.min),
    max: num(o.max),
    tendencia: o.tendencia === true,
    rotular: o.rotular === "todos" || o.rotular === "ninguno" ? o.rotular : o.rotular === "ultimo" ? "ultimo" : base.rotular,
    // Lo guardado antes de la agrupación se lee como «ninguno»: se ve exactamente igual que antes.
    agrupar: leerAgregacion(o.agrupar) ?? "ninguno",
    agruparFecha: leerAgruparFecha(o.agruparFecha),
    filtroFecha: leerFiltroFecha(o.filtroFecha),
    filtroInteractivo: o.filtroInteractivo === true,
  };
}
