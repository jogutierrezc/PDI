/* =============================================================================
   Mr. Pilo · capa profunda · UDES en Cifras (0173).

   Lee DIRECTO de las tablas od_* el periodo publicado vigente y recorre TODOS
   sus contenedores: cada informe (la «estación») con todo lo que muestra —
   indicadores con su serie completa por año, periodo y sede; desgloses; mapas
   de calor; mapas; embudos de cohortes; históricos; tablas; conjuntos libres;
   rankings; medalleros; Saber PRO; modelos; los puntos del informe con sus
   advertencias—. La memoria de siempre (`cifrasRows`) guarda solo la última
   cifra de cada indicador; esta capa agrega lo que falta: la serie, las
   comparativas por sede, las variaciones, las definiciones y la metodología.

   Reglas del portal que se conservan:
     · la cifra del año de un indicador por periodo sale de su regla anual
       (suma, promedio, último, reportado) y el total de lo que se suma, de sus
       sedes cuando todas reportan;
     · las celdas bajo reserva estadística NO tienen cifra: se dice «menos de n»;
     · un dato sin reportar no es un cero;
     · ningún pasaje habla de dinero.

   Cada parte es un informe; la parte «__portal__» describe el portal entero.
   ========================================================================== */

import {
  agrupar, cerrar, cifra, conUnidad, esDinero, esObjeto, fecha, frase, leidoEl, limpio, lista, normal, numero, periodo, sinDinero, suelto, traer, traerPorIds, trocear, unir, variacion, vigilar,
} from "./comun.ts";
import type { Contexto, Fila, Formato, Lector, Parte, Pasaje } from "./comun.ts";

const OFICINA = "Oficina de Planeación Institucional";
const RUTA = "/datos-abiertos";
export const PORTAL = "__portal__";

const REGLA_ANUAL: Record<string, string> = {
  suma: "la cifra del año es la suma de los periodos 1 y 2",
  ultimo: "la cifra del año es la del último periodo reportado (el 2, o el 1 si falta)",
  promedio: "la cifra del año es el promedio de los periodos 1 y 2",
  reportado: "la cifra del año se reporta aparte",
};

const formatoDe = (v: unknown): Formato => (v === "porcentaje" || v === "decimal" ? v : "entero");

/* --- Lo que es de todo el periodo ------------------------------------------------------------- */

interface Base {
  periodo: Fila;
  anios: number[];
  /** campus_id → { slug, nombre } */
  sedes: Map<string, { slug: string; nombre: string }>;
  slugs: string[];
  oficinas: Map<string, string>;
  informes: Fila[];
}

const cache = new WeakMap<Contexto, Promise<Base | null>>();

async function leerBase(ctx: Contexto): Promise<Base | null> {
  const periodos = await traer(ctx, "od_periods", { filtrar: (q) => q.eq("is_current", true).eq("status", "publicado") });
  const periodo = periodos[0];
  if (!periodo) return null;
  const id = String(periodo.id);
  const [sedes, oficinas, informes] = await Promise.all([
    traer(ctx, "od_period_campuses", { clave: null, orden: "position", filtrar: (q) => q.eq("period_id", id) }),
    traer(ctx, "od_offices"),
    traer(ctx, "od_reports", { filtrar: (q) => q.eq("period_id", id).eq("status", "publicado") }),
  ]);
  const inicio = numero(periodo.start_year) ?? 0;
  const fin = numero(periodo.end_year) ?? inicio;
  const anios = fin >= inicio && fin - inicio < 40 ? Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i) : [];
  const ordenadas = [...sedes].sort((a, b) => (numero(a.position) ?? 0) - (numero(b.position) ?? 0));
  return {
    periodo,
    anios,
    sedes: new Map(ordenadas.map((s) => [String(s.campus_id), { slug: limpio(s.slug), nombre: limpio(s.label) || limpio(s.slug) }])),
    slugs: ordenadas.map((s) => limpio(s.slug)),
    oficinas: new Map(oficinas.map((o) => [String(o.id), limpio(o.name)])),
    informes: [...informes].sort((a, b) => (numero(a.position) ?? 0) - (numero(b.position) ?? 0)),
  };
}

function base(ctx: Contexto): Promise<Base | null> {
  let p = cache.get(ctx);
  if (!p) {
    p = leerBase(ctx);
    cache.set(ctx, p);
  }
  return p;
}

const nombreSede = (b: Base, slug: string) => (slug === "" ? "toda la UDES" : ([...b.sedes.values()].find((s) => s.slug === slug)?.nombre ?? slug));
const oficinaDe = (b: Base, id: unknown) => (typeof id === "string" ? (b.oficinas.get(id) ?? "") : "");

/* --- Indicadores ---------------------------------------------------------------------------- */

type Celda = Map<string, number | null>;
interface Calculo {
  anios: number[];
  /** [año][A|B] → sede → cifra */
  periodos: Map<number, { A: Celda; B: Celda }>;
  /** [año] → sede → cifra del año */
  anuales: Map<number, Celda>;
  porPeriodo: boolean;
  regla: string;
}

/** El cálculo del portal (assembleCatalog) para un indicador: periodos, total de lo que se suma y cifra del año. */
export function calcularIndicador(ind: Fila, valores: Fila[], b: Base): Calculo {
  const porPeriodo = ind.reporting !== "anual";
  const regla = porPeriodo ? limpio(ind.annual_rule) || "reportado" : "reportado";
  const propios = Array.isArray(ind.years) && ind.years.length ? (ind.years as unknown[]).map(Number).filter((y) => b.anios.includes(y)).sort((x, y) => x - y) : b.anios;
  const llave = (campus: unknown) => (campus === null || campus === undefined ? "" : (b.sedes.get(String(campus))?.slug ?? String(campus)));
  const periodos = new Map<number, { A: Celda; B: Celda }>();
  const reportado = new Map<number, Celda>();
  for (const y of propios) {
    periodos.set(y, { A: new Map(), B: new Map() });
    reportado.set(y, new Map());
  }
  for (const v of valores) {
    const y = numero(v.year);
    if (y === null || !periodos.has(y)) continue;
    const val = numero(v.value);
    if (v.term === "anual") reportado.get(y)!.set(llave(v.campus_id), val);
    else if (v.term === "A" || v.term === "B") periodos.get(y)![v.term as "A" | "B"].set(llave(v.campus_id), val);
  }
  const completar = (celda: Celda) => {
    if (celda.get("") !== undefined && celda.get("") !== null) return;
    const partes = b.slugs.map((s) => celda.get(s));
    celda.set("", partes.length && partes.every((p) => p !== undefined && p !== null) ? partes.reduce<number>((suma, p) => suma + (p as number), 0) : null);
  };
  if (ind.aggregation === "suma" && b.slugs.length) {
    for (const y of propios) {
      completar(periodos.get(y)!.A);
      completar(periodos.get(y)!.B);
      completar(reportado.get(y)!);
    }
  }
  const anuales = new Map<number, Celda>();
  const llaves = ["", ...b.slugs];
  for (const y of propios) {
    const celda: Celda = new Map();
    const { A, B } = periodos.get(y)!;
    const rep = reportado.get(y)!;
    for (const k of llaves) {
      const a = A.get(k) ?? null;
      const bb = B.get(k) ?? null;
      let valor: number | null;
      switch (regla) {
        case "suma":
          valor = a !== null && bb !== null ? Math.round((a + bb) * 1e6) / 1e6 : null;
          break;
        case "promedio":
          valor = a !== null && bb !== null ? Math.round(((a + bb) / 2) * 1e6) / 1e6 : null;
          break;
        case "ultimo":
          valor = bb !== null ? bb : a;
          break;
        default:
          valor = rep.get(k) ?? null;
      }
      celda.set(k, valor);
    }
    anuales.set(y, celda);
  }
  return { anios: propios, periodos, anuales, porPeriodo, regla };
}

const corte = (y: number, t: "A" | "B") => `${y}-${t === "A" ? 1 : 2}`;

function pasajesIndicador(ind: Fila, valores: Fila[], b: Base, informe: Fila, cut: string): Pasaje[] {
  const etiqueta = limpio(ind.label);
  const llave = limpio(ind.key);
  if (!etiqueta || !llave || esDinero(etiqueta) || esDinero(ind.unit)) return [];
  const f = formatoDe(ind.format);
  const unidad = limpio(ind.unit);
  const slug = limpio(informe.slug);
  const c = calcularIndicador(ind, valores, b);
  const oficina = oficinaDe(b, ind.office_id) || OFICINA;
  const fmt = (v: number | null) => conUnidad(v, f, unidad);
  const refBase = `prof:cifras:${slug}:ind:${llave}`;
  const path = `${RUTA}/${slug}`;
  const section = `Informe ${limpio(informe.name)}`;
  const sube = ind.direction === "sube" ? "Mejora cuando sube." : ind.direction === "baja" ? "Mejora cuando baja." : "";
  const out: Partial<Pasaje>[] = [];

  // 1. Qué es, cómo se calcula y la serie de toda la UDES.
  const total = c.anios.map((y) => ({ y, v: c.anuales.get(y)?.get("") ?? null })).filter((p) => p.v !== null) as { y: number; v: number }[];
  const encabezado = [
    `${etiqueta}${unidad && unidad !== "%" ? ` (${unidad})` : ""}, del informe ${limpio(informe.name)}.`,
    frase(ind.definition) ? `Qué mide: ${frase(ind.definition)}` : "",
    c.porPeriodo ? `Se reporta por periodo (1 y 2); ${REGLA_ANUAL[c.regla] ?? "la cifra del año sale de su regla"}.` : "Se reporta una cifra por año.",
    ind.aggregation === "suma" ? "El total de la UDES es la suma de las sedes." : "",
    sube,
    `Lo reporta ${oficina}.`,
  ]
    .filter(Boolean)
    .join(" ");
  const lineas: string[] = [];
  if (total.length) {
    lineas.push(`Serie de toda la UDES por año:`);
    total.forEach((p, i) => {
      const prev = total[i - 1];
      const v = prev && prev.y === p.y - 1 ? variacion(p.v, prev.v, f) : "";
      lineas.push(`${p.y}: ${fmt(p.v)}${v ? ` (${v} frente a ${prev.y})` : ""}${i === total.length - 1 ? "." : ";"}`);
    });
    const primero = total[0];
    const ultimo = total[total.length - 1];
    if (total.length > 1) {
      lineas.push(`Entre ${primero.y} y ${ultimo.y} pasó de ${fmt(primero.v)} a ${fmt(ultimo.v)} (${variacion(ultimo.v, primero.v, f) || "sin variación calculable"}).`);
      const max = total.reduce((m, p) => (p.v > m.v ? p : m));
      const min = total.reduce((m, p) => (p.v < m.v ? p : m));
      if (max.y !== min.y) lineas.push(`El valor más alto fue en ${max.y} (${fmt(max.v)}) y el más bajo en ${min.y} (${fmt(min.v)}).`);
    }
  } else {
    lineas.push("Todavía no tiene cifras reportadas para toda la UDES; un dato sin reportar no es un cero.");
  }
  if (b.periodo.illustrative === true) lineas.push("Estas cifras están marcadas como dato ilustrativo en el portal.");
  trocear(encabezado, lineas).forEach((cuerpo, i) =>
    out.push({ ref: i === 0 ? refBase : `${refBase}:serie${i + 1}`, title: etiqueta, section, body: cuerpo, path, cut: total.length ? String(total[total.length - 1].y) : cut, office: oficina }),
  );

  // 2. Comparativa por sede.
  const conSedes = c.anios.filter((y) => b.slugs.some((s) => (c.anuales.get(y)?.get(s) ?? null) !== null));
  if (conSedes.length && b.slugs.length) {
    const lineasSedes: string[] = [];
    const reciente = conSedes[conSedes.length - 1];
    const previo = [...conSedes].reverse().find((y) => y < reciente);
    const celda = c.anuales.get(reciente)!;
    const ranking = b.slugs.map((s) => ({ s, v: celda.get(s) ?? null })).filter((p) => p.v !== null) as { s: string; v: number }[];
    ranking.sort((x, y) => y.v - x.v);
    const totalReciente = celda.get("") ?? null;
    lineasSedes.push(`En ${reciente}, por sede: ${ranking.map((p) => `${nombreSede(b, p.s)} ${fmt(p.v)}`).join("; ")}.`);
    if (ranking.length > 1) {
      lineasSedes.push(`La sede más alta en ${reciente} es ${nombreSede(b, ranking[0].s)} (${fmt(ranking[0].v)}) y la más baja, ${nombreSede(b, ranking[ranking.length - 1].s)} (${fmt(ranking[ranking.length - 1].v)}).`);
      if (ind.aggregation === "suma" && totalReciente) {
        lineasSedes.push(`Peso de cada sede en el total: ${ranking.map((p) => `${nombreSede(b, p.s)} ${suelto(Math.round((p.v / totalReciente) * 1000) / 10)} %`).join("; ")}.`);
      }
    }
    if (previo !== undefined) {
      const antes = c.anuales.get(previo)!;
      const cambios = ranking.map((p) => ({ s: p.s, d: variacion(p.v, antes.get(p.s) ?? null, f) })).filter((p) => p.d);
      if (cambios.length) lineasSedes.push(`Variación por sede de ${previo} a ${reciente}: ${cambios.map((p) => `${nombreSede(b, p.s)} ${p.d}`).join("; ")}.`);
    }
    const anteriores = conSedes.slice(0, -1).reverse().slice(0, 5);
    for (const y of anteriores) {
      const cel = c.anuales.get(y)!;
      const partes = b.slugs.map((s) => ({ s, v: cel.get(s) ?? null })).filter((p) => p.v !== null);
      if (partes.length) lineasSedes.push(`En ${y}: ${partes.map((p) => `${nombreSede(b, p.s)} ${fmt(p.v)}`).join("; ")}.`);
    }
    trocear(`${etiqueta}: comparativa por sede.`, lineasSedes).forEach((cuerpo, i) =>
      out.push({ ref: i === 0 ? `${refBase}:sedes` : `${refBase}:sedes${i + 1}`, title: `${etiqueta} · por sede`, section, body: cuerpo, path, cut: String(reciente), office: oficina }),
    );
  }

  // 3. Por periodo (1 y 2).
  if (c.porPeriodo) {
    const cortes: { y: number; t: "A" | "B"; v: number | null; por: Celda }[] = [];
    for (const y of c.anios) {
      for (const t of ["A", "B"] as const) {
        const por = c.periodos.get(y)![t];
        const v = por.get("") ?? null;
        if (v !== null || b.slugs.some((s) => (por.get(s) ?? null) !== null)) cortes.push({ y, t, v, por });
      }
    }
    if (cortes.length) {
      const lineasPer: string[] = ["Toda la UDES por periodo:"];
      cortes.forEach((p, i) => {
        const anterior = cortes[i - 1];
        const mismo = cortes.find((q) => q.y === p.y - 1 && q.t === p.t);
        const vs: string[] = [];
        const vAnt = anterior ? variacion(p.v, anterior.v, f) : "";
        const vMismo = mismo ? variacion(p.v, mismo.v, f) : "";
        if (anterior && vAnt) vs.push(`${vAnt} frente a ${corte(anterior.y, anterior.t)}`);
        if (mismo && vMismo && mismo !== anterior) vs.push(`${vMismo} frente a ${corte(mismo.y, mismo.t)}`);
        lineasPer.push(`${corte(p.y, p.t)}: ${fmt(p.v)}${vs.length ? ` (${vs.join("; ")})` : ""}${i === cortes.length - 1 ? "." : ";"}`);
      });
      const ult = cortes[cortes.length - 1];
      const sedesUlt = b.slugs.map((s) => ({ s, v: ult.por.get(s) ?? null })).filter((p) => p.v !== null);
      if (sedesUlt.length) lineasPer.push(`Por sede en ${corte(ult.y, ult.t)}: ${sedesUlt.map((p) => `${nombreSede(b, p.s)} ${fmt(p.v)}`).join("; ")}.`);
      trocear(`${etiqueta}: cifras por periodo académico.`, lineasPer).forEach((cuerpo, i) =>
        out.push({ ref: i === 0 ? `${refBase}:periodos` : `${refBase}:periodos${i + 1}`, title: `${etiqueta} · por periodo`, section, body: cuerpo, path, cut: corte(ult.y, ult.t), office: oficina }),
      );
    }
  }
  return cerrar(out);
}

/* --- Desgloses -------------------------------------------------------------------------------- */

const reservado = (umbral: unknown) => `menos de ${numero(umbral) ?? 5}`;

function pasajesDesglose(d: Fila, valores: Fila[], b: Base, informe: Fila): Pasaje[] {
  const titulo = limpio(d.title);
  if (!titulo || esDinero(titulo) || esDinero(d.unit)) return [];
  const f = formatoDe(d.format);
  const unidad = limpio(d.unit);
  const porAnio = new Map<number, Fila[]>();
  for (const v of valores) {
    const y = numero(v.year);
    if (y === null) continue;
    (porAnio.get(y) ?? porAnio.set(y, []).get(y)!).push(v);
  }
  const anios = [...porAnio.keys()].sort((a, c) => a - c);
  if (!anios.length) return [];
  const regla = d.reporting === "anual" ? "reportado" : limpio(d.annual_rule) || "reportado";
  const anual = (filas: Fila[], etiqueta: string) => {
    const celdas = filas.filter((v) => limpio(v.label) === etiqueta);
    const get = (t: string) => numero(celdas.find((v) => (v.term ?? "anual") === t)?.value);
    const a = get("A");
    const bb = get("B");
    const rep = get("anual");
    const reservada = celdas.some((v) => v.reserved === true);
    let valor: number | null;
    if (regla === "suma") valor = a !== null && bb !== null ? a + bb : null;
    else if (regla === "promedio") valor = a !== null && bb !== null ? (a + bb) / 2 : null;
    else if (regla === "ultimo") valor = bb !== null ? bb : a;
    else valor = rep;
    return { valor, reservada };
  };
  const lineas: string[] = [];
  const recientes = anios.slice(-4).reverse();
  const orden = new Map<string, number>();
  for (const v of valores) if (!orden.has(limpio(v.label))) orden.set(limpio(v.label), numero(v.position) ?? 0);
  const etiquetas = [...orden.keys()].sort((x, y) => (orden.get(x) ?? 0) - (orden.get(y) ?? 0));
  const guardado = new Map<number, Map<string, { valor: number | null; reservada: boolean }>>();
  for (const y of anios) {
    const m = new Map<string, { valor: number | null; reservada: boolean }>();
    for (const e of etiquetas) m.set(e, anual(porAnio.get(y)!, e));
    guardado.set(y, m);
  }
  for (const y of recientes) {
    const partes = etiquetas
      .map((e) => ({ e, ...guardado.get(y)!.get(e)! }))
      .filter((p) => p.valor !== null || p.reservada)
      .map((p) => `${p.e} ${p.reservada ? reservado(d.reserve_threshold) : conUnidad(p.valor, f, unidad)}`);
    if (partes.length) lineas.push(`En ${y}: ${unir(partes, 40)}.`);
  }
  const ultimo = recientes[0];
  const previo = recientes[1];
  if (ultimo !== undefined && previo !== undefined) {
    const cambios = etiquetas
      .map((e) => {
        const a = guardado.get(ultimo)!.get(e)!;
        const p = guardado.get(previo)!.get(e)!;
        return a.reservada || p.reservada ? "" : variacion(a.valor, p.valor, f) ? `${e} ${variacion(a.valor, p.valor, f)}` : "";
      })
      .filter(Boolean);
    if (cambios.length) lineas.push(`Variación de ${previo} a ${ultimo}: ${unir(cambios, 40)}.`);
  }
  const sinDato = etiquetas.filter((e) => anios.every((y) => guardado.get(y)!.get(e)!.valor === null && !guardado.get(y)!.get(e)!.reservada));
  if (sinDato.length) lineas.push(`Sin cifra reportada en ningún año: ${unir(sinDato, 10)}.`);
  const llave = limpio(d.key);
  return cerrar(
    trocear(`${titulo}, del informe ${limpio(informe.name)}. Desglose de ${unidad || "cifras"} por categoría. Lo reporta ${oficinaDe(b, d.office_id) || OFICINA}.`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:des:${llave}${i ? `:${i + 1}` : ""}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: String(anios[anios.length - 1]),
      office: oficinaDe(b, d.office_id) || OFICINA,
    })),
  );
}

/* --- Mapas de calor, mapas, embudos, históricos, tablas -------------------------------------- */

function pasajesCalor(h: Fila, celdas: Fila[], b: Base, informe: Fila): Pasaje[] {
  const titulo = limpio(h.title);
  if (!titulo || esDinero(titulo) || esDinero(h.unit)) return [];
  const filas = lista<unknown>(h.rows).map(limpio);
  const columnas = lista<unknown>(h.columns).map(limpio);
  const f = formatoDe(h.format);
  const datos = celdas
    .map((c) => ({ r: numero(c.row_index), c: numero(c.column_index), v: numero(c.value) }))
    .filter((c): c is { r: number; c: number; v: number } => c.r !== null && c.c !== null && c.v !== null && Boolean(filas[c.r]) && Boolean(columnas[c.c]));
  if (!datos.length) return [];
  const orden = [...datos].sort((x, y) => y.v - x.v);
  const lineas: string[] = [];
  const todas = datos.length <= 120;
  const lista_ = (todas ? datos : orden.slice(0, 40)).map((d) => `${filas[d.r]} · ${columnas[d.c]}: ${conUnidad(d.v, f, limpio(h.unit))}`);
  lineas.push(todas ? `Valores: ${lista_.join("; ")}.` : `Los 40 valores más altos de ${datos.length}: ${lista_.join("; ")}.`);
  lineas.push(`El valor más alto es ${filas[orden[0].r]} · ${columnas[orden[0].c]} (${conUnidad(orden[0].v, f, limpio(h.unit))}) y el más bajo, ${filas[orden[orden.length - 1].r]} · ${columnas[orden[orden.length - 1].c]} (${conUnidad(orden[orden.length - 1].v, f, limpio(h.unit))}).`);
  if (limpio(h.empty_meaning)) lineas.push(`Una casilla vacía significa: ${frase(h.empty_meaning)}`);
  return cerrar(
    trocear(`${titulo}, del informe ${limpio(informe.name)}. ${frase(h.description)} Filas: ${limpio(h.row_label) || "filas"}; columnas: ${limpio(h.column_label) || "columnas"}.`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:calor:${limpio(h.key)}${i ? `:${i + 1}` : ""}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: "",
      office: oficinaDe(b, h.office_id) || OFICINA,
    })),
  );
}

function pasajesMapa(m: Fila, valores: Fila[], b: Base, informe: Fila): Pasaje[] {
  const titulo = limpio(m.title);
  if (!titulo || esDinero(titulo) || esDinero(m.unit)) return [];
  const sinReserva = valores.filter((v) => v.reserved !== true && numero(v.value) !== null);
  const reservadas = valores.length - sinReserva.length;
  const anios = [...new Set(sinReserva.map((v) => numero(v.year)).filter((y): y is number => y !== null))].sort((x, y) => x - y);
  if (!anios.length) return [];
  const lineas: string[] = [];
  for (const y of anios.slice(-3).reverse()) {
    const porCodigo = new Map<string, number>();
    for (const v of sinReserva.filter((x) => numero(x.year) === y)) porCodigo.set(limpio(v.department_code), (porCodigo.get(limpio(v.department_code)) ?? 0) + (numero(v.value) as number));
    const orden = [...porCodigo.entries()].sort((x, z) => z[1] - x[1]);
    const total = orden.reduce((s, [, v]) => s + v, 0);
    lineas.push(`En ${y} (${orden.length} lugares con dato, ${suelto(total)} en total): ${orden.slice(0, 10).map(([c, v]) => `${c} ${suelto(v)}`).join("; ")}${orden.length > 10 ? `; y ${orden.length - 10} más` : ""}.`);
  }
  if (reservadas) lineas.push(`${reservadas} ${reservadas === 1 ? "celda tiene" : "celdas tienen"} menos de 5 personas y no se publica su cifra.`);
  return cerrar(
    trocear(`${titulo}, del informe ${limpio(informe.name)}. ${frase(m.description)} Mapa de ${limpio(m.unit) || "cifras"} por lugar.`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:mapa:${limpio(m.key)}${i ? `:${i + 1}` : ""}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: String(anios[anios.length - 1]),
      office: oficinaDe(b, m.office_id) || OFICINA,
    })),
  );
}

function pasajesEmbudo(p: Fila, valores: Fila[], b: Base, informe: Fila): Pasaje[] {
  const titulo = limpio(p.title);
  const etapas = lista<unknown>(p.stages).map(limpio);
  if (!titulo || esDinero(titulo) || etapas.length < 2) return [];
  const medida = limpio(p.measure) || "estudiantes";
  const cohortes = new Map<string, Map<string, (number | null)[]>>();
  const causas = new Map<string, string[]>();
  for (const v of valores) {
    const co = periodo(v.cohort);
    const sede = v.campus_id === null ? "" : (b.sedes.get(String(v.campus_id))?.slug ?? String(v.campus_id));
    const idx = numero(v.stage_index);
    if (!co || idx === null || idx >= etapas.length) continue;
    const porSede = cohortes.get(co) ?? cohortes.set(co, new Map()).get(co)!;
    const fila = porSede.get(sede) ?? porSede.set(sede, etapas.map(() => null)).get(sede)!;
    fila[idx] = numero(v.value);
    if (sede === "" && idx > 0 && limpio(v.main_cause)) (causas.get(co) ?? causas.set(co, etapas.map(() => "")).get(co)!)[idx] = limpio(v.main_cause);
  }
  const ordenadas = [...cohortes.keys()].sort();
  if (!ordenadas.length) return [];
  const lineas: string[] = [`Etapas: ${etapas.join(" → ")}. La medida es ${medida === "desercion" ? "la deserción acumulada (% de la cohorte que se retiró)" : medida === "porcentaje" ? "el porcentaje de la cohorte" : "el número de estudiantes"}.`];
  for (const co of ordenadas.slice(-8).reverse()) {
    const total = cohortes.get(co)!.get("") ?? [...cohortes.get(co)!.values()][0];
    const partes = etapas.map((e, i) => (total[i] === null ? "" : `${e} ${medida === "estudiantes" ? suelto(total[i] as number) : `${suelto(total[i] as number)} %`}`)).filter(Boolean);
    const causa = (causas.get(co) ?? []).map((c, i) => (c ? `etapa «${etapas[i]}»: ${c}` : "")).filter(Boolean);
    lineas.push(`Cohorte ${co}: ${partes.join(" → ")}${causa.length ? `. Causa principal de salida — ${causa.join("; ")}` : ""}.`);
  }
  return cerrar(
    trocear(`${titulo}, del informe ${limpio(informe.name)}. ${frase(p.description)}`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:embudo:${limpio(p.key)}${i ? `:${i + 1}` : ""}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: ordenadas[ordenadas.length - 1],
      office: oficinaDe(b, p.office_id) || OFICINA,
    })),
  );
}

function pasajesHistorico(h: Fila, valores: Fila[], b: Base, informe: Fila): Pasaje[] {
  const titulo = limpio(h.title);
  if (!titulo || esDinero(titulo) || esDinero(h.unit)) return [];
  const f = formatoDe(h.format);
  const unidad = limpio(h.unit);
  const periodos = [...new Set(valores.map((v) => periodo(v.period_label)))].sort();
  if (!periodos.length) return [];
  const categorias = [...new Set(valores.filter((v) => limpio(v.category) !== "").sort((x, y) => (numero(x.position) ?? 0) - (numero(y.position) ?? 0)).map((v) => limpio(v.category)))];
  const valor = (per: string, cat: string) => numero(valores.find((v) => periodo(v.period_label) === per && limpio(v.category) === cat)?.value);
  const lineas: string[] = [];
  const totalLabel = limpio(h.total_label) || "Total";
  const serie = periodos.map((per) => ({ per, v: valor(per, "") ?? (categorias.length && categorias.every((c) => valor(per, c) !== null) ? categorias.reduce((s, c) => s + (valor(per, c) as number), 0) : null) }));
  if (serie.some((s) => s.v !== null)) {
    lineas.push(`${totalLabel} por periodo: ${serie.filter((s) => s.v !== null).map((s, i, a) => `${s.per} ${conUnidad(s.v, f, unidad)}${i > 0 && variacion(s.v, a[i - 1].v, f) ? ` (${variacion(s.v, a[i - 1].v, f)})` : ""}`).join("; ")}.`);
  }
  const ultimo = periodos[periodos.length - 1];
  const cats = categorias.map((c) => ({ c, v: valor(ultimo, c) })).filter((p) => p.v !== null);
  if (cats.length) lineas.push(`En ${ultimo}, por categoría: ${cats.map((p) => `${p.c} ${conUnidad(p.v, f, unidad)}`).join("; ")}.`);
  if (!lineas.length) return [];
  return cerrar(
    trocear(`${titulo}, del informe ${limpio(informe.name)}. ${frase(h.description)}`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:historico:${limpio(h.key)}${i ? `:${i + 1}` : ""}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: ultimo,
      office: oficinaDe(b, h.office_id) || OFICINA,
    })),
  );
}

/** Una casilla de tabla como texto: números en es-CO, texto tal cual. */
function casilla(v: unknown): string {
  if (typeof v === "number") return Number.isFinite(v) ? suelto(v) : "";
  return limpio(v);
}

function pasajesTabla(t: Fila, filas: Fila[], b: Base, informe: Fila): Pasaje[] {
  const titulo = limpio(t.title);
  if (!titulo || esDinero(titulo)) return [];
  const columnas = lista<Fila>(t.columns).filter((c) => limpio(c.key) && !esDinero(c.label) && !esDinero(c.key));
  if (!columnas.length || !filas.length) return [];
  const ordenadas = [...filas].sort((x, y) => (numero(x.position) ?? 0) - (numero(y.position) ?? 0));
  const lineas = ordenadas.slice(0, 60).map((fila, i) => {
    const celdas = esObjeto(fila.cells) ? fila.cells : {};
    const texto = columnas.map((c) => ({ c: limpio(c.label) || limpio(c.key), v: casilla(celdas[limpio(c.key)]) })).filter((p) => p.v);
    return texto.length ? `Fila ${i + 1}: ${texto.map((p) => `${p.c} ${p.v}`).join("; ")}.` : "";
  });
  if (ordenadas.length > 60) lineas.push(`La tabla tiene ${ordenadas.length} filas; aquí van las primeras 60.`);
  return cerrar(
    trocear(`${titulo}, del informe ${limpio(informe.name)}. ${frase(t.description)} Columnas: ${unir(columnas.map((c) => limpio(c.label) || limpio(c.key)), 20)}.`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:tabla:${limpio(t.key)}${i ? `:${i + 1}` : ""}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: "",
      office: oficinaDe(b, t.office_id) || OFICINA,
    })),
  );
}

function pasajesLibre(s: Fila, filas: Fila[], b: Base, informe: Fila): Pasaje[] {
  const titulo = limpio(s.title);
  if (!titulo || esDinero(titulo)) return [];
  const columnas = lista<Fila>(s.columns).filter((c) => limpio(c.key) && !esDinero(c.label) && !esDinero(c.key));
  if (!columnas.length || !filas.length) return [];
  const ordenadas = [...filas].sort((x, y) => (numero(x.position) ?? 0) - (numero(y.position) ?? 0));
  const lineas = ordenadas.slice(0, 60).map((fila) => {
    const celdas = esObjeto(fila.cells) ? fila.cells : {};
    const texto = columnas.map((c) => ({ c: limpio(c.label) || limpio(c.key), v: casilla(celdas[limpio(c.key)]) })).filter((p) => p.v);
    const rotulo = limpio(fila.label);
    const anio = numero(fila.year);
    if (fila.kind === "grupo") return rotulo ? `Grupo: ${rotulo}.` : "";
    return texto.length ? `${fila.kind === "total" ? "Total" : "Registro"}${rotulo ? ` ${rotulo}` : ""}${anio !== null ? ` (${anio})` : ""}: ${texto.map((p) => `${p.c} ${p.v}`).join("; ")}.` : "";
  });
  if (ordenadas.length > 60) lineas.push(`El conjunto tiene ${ordenadas.length} filas; aquí van las primeras 60.`);
  return cerrar(
    trocear(`${titulo}, del informe ${limpio(informe.name)}. ${frase(s.description)}`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:conjunto:${limpio(s.key)}${i ? `:${i + 1}` : ""}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: limpio(s.period_label),
      office: oficinaDe(b, s.office_id) || OFICINA,
    })),
  );
}

/* --- Rankings, medalleros, Saber PRO, modelos y puntos del informe ----------------------------- */

function pasajesRanking(r: Fila, ediciones: Fila[], b: Base, informe: Fila): Pasaje[] {
  const titulo = limpio(r.title);
  if (!titulo || !ediciones.length) return [];
  const ordenadas = [...ediciones].sort((x, y) => (numero(x.year) ?? 0) - (numero(y.year) ?? 0));
  const lineas = ordenadas.map((e) => {
    const partes = [
      limpio(e.global_rank) ? `puesto global ${limpio(e.global_rank)}` : "",
      limpio(e.regional_rank) ? `regional ${limpio(e.regional_rank)}` : "",
      limpio(e.national_rank) ? `nacional ${limpio(e.national_rank)}` : "",
      numero(e.evaluated) !== null ? `${suelto(numero(e.evaluated) as number)} instituciones evaluadas` : "",
      numero(e.score) !== null ? `puntaje ${suelto(numero(e.score) as number)}` : "",
      lista<Fila>(e.stars).length ? `estrellas: ${lista<Fila>(e.stars).map((s) => `${limpio(s.category)} ${limpio(s.stars)}`).join(", ")}` : "",
      lista<Fila>(e.sdgs).length ? `ODS: ${lista<Fila>(e.sdgs).map((s) => `ODS ${limpio(s.sdg)} puesto ${limpio(s.global_rank) || limpio(s.national_rank)}`).join(", ")}` : "",
      lista<Fila>(e.subjects).length ? `áreas: ${lista<Fila>(e.subjects).slice(0, 12).map((s) => `${limpio(s.subject)} ${limpio(s.global_rank) || limpio(s.national_rank)}`).join(", ")}` : "",
      lista<Fila>(e.custom).map((c) => `${limpio(c.label)} ${limpio(c.value)}`).join(", "),
      frase(e.note),
    ].filter(Boolean);
    return partes.length ? `${numero(e.year) ?? ""}: ${partes.join("; ")}.` : "";
  });
  return cerrar(
    trocear(`${titulo}, del informe ${limpio(informe.name)}. ${frase(r.description)} Sistema: ${limpio(r.system)}.`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:ranking:${limpio(r.key)}${i ? `:${i + 1}` : ""}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: String(numero(ordenadas[ordenadas.length - 1].year) ?? ""),
      office: oficinaDe(b, r.office_id) || OFICINA,
    })),
  );
}

function pasajesMedallero(m: Fila, entradas: Fila[], b: Base, informe: Fila): Pasaje[] {
  const titulo = limpio(m.title);
  if (!titulo || !entradas.length) return [];
  const lineas = [...entradas]
    .sort((x, y) => (numero(y.year) ?? 0) - (numero(x.year) ?? 0) || (numero(x.position) ?? 0) - (numero(y.position) ?? 0))
    .slice(0, 80)
    .map((e) => {
      const cuentas = esObjeto(e.counts) ? Object.entries(e.counts).filter(([, v]) => numero(v) !== null).map(([k, v]) => `${k} ${suelto(numero(v) as number)}`) : [];
      return cuentas.length ? `${numero(e.year) ?? ""}${e.term ? `-${e.term === "A" ? 1 : 2}` : ""} ${limpio(e.label)}: ${cuentas.join(", ")}${limpio(e.note) ? ` (${limpio(e.note)})` : ""}.` : "";
    });
  return cerrar(
    trocear(`${titulo}, del informe ${limpio(informe.name)}. ${frase(m.description)} ${frase(m.note)}`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:medallero:${limpio(m.key)}${i ? `:${i + 1}` : ""}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: "",
      office: oficinaDe(b, m.office_id) || OFICINA,
    })),
  );
}

function pasajesSaber(s: Fila, resultados: Fila[], b: Base, informe: Fila, kind: "pro" | "tyt"): Pasaje[] {
  const titulo = limpio(s.title);
  if (!titulo) return [];
  const lineas: string[] = [];
  // Solo el nivel institucional y el nacional, en la competencia global: son cifras agregadas, nunca de una persona.
  if (kind === "pro") {
    const globales = resultados.filter((r) => r.competency === "global" && (r.scope === "institucion" || r.scope === "nacional") && numero(r.mean) !== null);
    for (const y of [...new Set(globales.map((r) => numero(r.year)))].filter((y): y is number => y !== null).sort((x, z) => z - x).slice(0, 6)) {
      const del = globales.filter((r) => numero(r.year) === y);
      const partes = del.map((r) => `${r.scope === "nacional" ? "promedio nacional" : `UDES${limpio(r.campus) ? ` ${limpio(r.campus)}` : ""}`} ${suelto(numero(r.mean) as number)}${numero(r.evaluated) !== null ? ` (${suelto(numero(r.evaluated) as number)} evaluados)` : ""}`);
      lineas.push(`${y}, puntaje global: ${unir(partes, 8)}.`);
    }
  } else {
    const globales = resultados.filter((r) => r.competency === "global" && numero(r.mean_exit) !== null);
    for (const y of [...new Set(globales.map((r) => numero(r.year)))].filter((y): y is number => y !== null).sort((x, z) => z - x).slice(0, 4)) {
      const del = globales.filter((r) => numero(r.year) === y);
      const media = del.reduce((acc, r) => acc + (numero(r.mean_exit) as number), 0) / del.length;
      lineas.push(`${y}: ${del.length} ${del.length === 1 ? "programa" : "programas"} con resultado global; percentil promedio de salida ${suelto(Math.round(media * 10) / 10)}.`);
    }
  }
  return cerrar(
    trocear(`${titulo}, del informe ${limpio(informe.name)}. ${frase(s.description)} ${frase(s.note)}`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:saber${kind}:${limpio(s.key)}${i ? `:${i + 1}` : ""}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: "",
      office: oficinaDe(b, s.office_id) || OFICINA,
    })),
  );
}

function pasajesModelo(m: Fila, b: Base, informe: Fila): Pasaje[] {
  const titulo = limpio(m.title);
  const spec = esObjeto(m.spec) ? m.spec : {};
  const variables = lista<Fila>(spec.variables).map((v) => limpio(v.label)).filter(Boolean);
  const respuesta = esObjeto(spec.response) ? limpio(spec.response.label) : "";
  if (!titulo || !variables.length) return [];
  return cerrar([
    {
      ref: `prof:cifras:${limpio(informe.slug)}:modelo:${limpio(m.key)}`,
      title: titulo,
      section: `Informe ${limpio(informe.name)}`,
      body: [`${titulo}, modelo estadístico del informe ${limpio(informe.name)}.`, frase(m.description), respuesta ? `Resultado que explica: ${respuesta}.` : "", `Variables: ${unir(variables, 20)}.`, frase(m.note)].filter(Boolean).join(" "),
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: "",
      office: oficinaDe(b, m.office_id) || OFICINA,
    },
  ]);
}

const ESTADO_PUNTO: Record<string, string> = { completo: "completo", parcial: "parcial", no_recibido: "pendiente de recibir", no_oficial: "no oficial", abierto: "abierto" };

function pasajesPuntos(puntos: Fila[], b: Base, informe: Fila): Pasaje[] {
  const lineas = [...puntos]
    .sort((x, y) => (numero(x.position) ?? 0) - (numero(y.position) ?? 0))
    .map((p) => {
      const numeral = numero(p.number);
      const pedido = lista<Fila>(p.requested).map((r) => [limpio(r.dato), limpio(r.periodicidad) ? `(${limpio(r.periodicidad)})` : ""].filter(Boolean).join(" ")).filter(Boolean);
      return [
        `${numeral !== null ? `Punto ${numeral}: ` : ""}${limpio(p.title)} — ${ESTADO_PUNTO[limpio(p.status)] ?? limpio(p.status)}.`,
        frase(p.lede),
        limpio(p.warning) ? `Advertencia: ${frase(p.warning)}` : "",
        pedido.length ? `Datos que se esperan: ${unir(pedido, 8)}.` : "",
        limpio(p.source) ? `Fuente: ${frase(p.source)}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    });
  if (!lineas.length) return [];
  return cerrar(
    trocear(`Puntos del informe ${limpio(informe.name)}.`, lineas).map((cuerpo, i) => ({
      ref: `prof:cifras:${limpio(informe.slug)}:puntos${i ? `:${i + 1}` : ""}`,
      title: `Puntos del informe ${limpio(informe.name)}`,
      section: `Informe ${limpio(informe.name)}`,
      body: cuerpo,
      path: `${RUTA}/${limpio(informe.slug)}`,
      cut: "",
      office: OFICINA,
    })),
  );
}

/* --- El portal entero y un informe completo -------------------------------------------------- */

function pasajePortal(b: Base, ctx: Contexto): Pasaje[] {
  const p = b.periodo;
  const informes = b.informes.map((r) => `${limpio(r.name)}${frase(r.summary) ? ` — ${frase(r.summary)}` : ""}`).filter((t) => !esDinero(t.split(" — ")[0]));
  return trocear(
    [
      `UDES en Cifras es el portal de datos abiertos de la Universidad de Santander. Periodo publicado: ${limpio(p.label)} (${numero(p.start_year)}–${numero(p.end_year)}).`,
      fecha(p.cutoff_date) ? `Corte de los datos: ${fecha(p.cutoff_date)}.` : "",
      b.sedes.size ? `Sedes: ${unir([...b.sedes.values()].map((s) => s.nombre), 12)}.` : "",
      p.illustrative === true ? "Las cifras del periodo están marcadas como dato ilustrativo." : "",
      frase(p.note),
      `Tiene ${informes.length} informes:`,
    ]
      .filter(Boolean)
      .join(" "),
    informes.map((t) => `${t}`),
  ).flatMap((cuerpo, i) =>
    cerrar([{ ref: `prof:cifras:portal${i ? `:${i + 1}` : ""}`, title: "UDES en Cifras", section: "Portal de datos abiertos", body: cuerpo, path: RUTA, cut: limpio(p.label), office: OFICINA }]),
  ).map((x) => ({ ...x, body: `${x.body} (Leído el ${leidoEl(ctx.ahora)}.)` }));
}

async function leerInforme(ctx: Contexto, parte: Parte): Promise<Pasaje[]> {
  const b = await base(ctx);
  if (!b) return [];
  if (parte.id === PORTAL) return pasajePortal(b, ctx);
  const informe = b.informes.find((r) => limpio(r.slug) === parte.id);
  if (!informe) return [];
  const id = String(informe.id);
  const porInforme = (q: import("./comun.ts").Consulta) => q.eq("report_id", id);
  const [indicadores, desgloses, calores, mapas, embudos, historicos, puntos, tablas, rankings, saberPro, libres, saberTyt, modelos, medalleros] = await Promise.all(
    [
      "od_indicators", "od_breakdowns", "od_heatmaps", "od_maps", "od_pipelines", "od_histories", "od_sections", "od_tables", "od_rankings", "od_saber_pro", "od_free_sets", "od_saber_tyt", "od_models", "od_medal_boards",
    ].map((t) => traer(ctx, t, { filtrar: porInforme }).catch((e: Error) => {
      // Una familia que la base aún no tiene (migración pendiente) no tumba el informe.
      if (/does not exist|could not find|schema cache/i.test(e.message)) return [] as Fila[];
      throw e;
    })),
  );
  const ids = (l: Fila[]) => l.map((r) => String(r.id));
  const opcional = (p: Promise<Fila[]>) => p.catch((e: Error) => (/does not exist|could not find|schema cache/i.test(e.message) ? ([] as Fila[]) : Promise.reject(e)));
  const [valores, valoresDes, celdas, valoresMapa, valoresEmbudo, valoresHist, filasTabla, ediciones, resultadosPro, filasLibres, resultadosTyt, entradas] = await Promise.all([
    opcional(traerPorIds(ctx, "od_values", "indicator_id", ids(indicadores))),
    opcional(traerPorIds(ctx, "od_breakdown_values", "breakdown_id", ids(desgloses))),
    opcional(traerPorIds(ctx, "od_heatmap_cells", "heatmap_id", ids(calores), { clave: null, orden: "heatmap_id" })),
    opcional(traerPorIds(ctx, "od_map_values", "map_id", ids(mapas), { clave: null, orden: "map_id" })),
    opcional(traerPorIds(ctx, "od_pipeline_values", "pipeline_id", ids(embudos))),
    opcional(traerPorIds(ctx, "od_history_values", "history_id", ids(historicos))),
    opcional(traerPorIds(ctx, "od_table_rows", "table_id", ids(tablas))),
    opcional(traerPorIds(ctx, "od_ranking_editions", "ranking_id", ids(rankings))),
    opcional(traerPorIds(ctx, "od_saber_pro_results", "saber_id", ids(saberPro))),
    opcional(traerPorIds(ctx, "od_free_set_rows", "set_id", ids(libres))),
    opcional(traerPorIds(ctx, "od_saber_tyt_results", "tyt_id", ids(saberTyt))),
    opcional(traerPorIds(ctx, "od_medal_entries", "board_id", ids(medalleros))),
  ]);
  vigilar(ctx);
  const por = (filas: Fila[], col: string) => agrupar(filas, col);
  const vInd = por(valores, "indicator_id");
  const vDes = por(valoresDes, "breakdown_id");
  const vCel = por(celdas, "heatmap_id");
  const vMapa = por(valoresMapa, "map_id");
  const vEmb = por(valoresEmbudo, "pipeline_id");
  const vHist = por(valoresHist, "history_id");
  const vTabla = por(filasTabla, "table_id");
  const vEd = por(ediciones, "ranking_id");
  const vPro = por(resultadosPro, "saber_id");
  const vLibre = por(filasLibres, "set_id");
  const vTyt = por(resultadosTyt, "tyt_id");
  const vEnt = por(entradas, "board_id");
  const ordenado = (l: Fila[]) => [...l].sort((x, y) => (numero(x.position) ?? 0) - (numero(y.position) ?? 0));
  const corteInforme = b.anios.length ? String(b.anios[b.anios.length - 1]) : limpio(b.periodo.label);

  const salida: Pasaje[] = [];
  // La ficha del informe: de qué trata y qué contiene, con sus puntos y su nota.
  const contenido = [
    indicadores.length ? `${indicadores.length} indicadores (${unir(ordenado(indicadores).map((i) => limpio(i.label)).filter((t) => t && !esDinero(t)), 14)})` : "",
    desgloses.length ? `${desgloses.length} desgloses (${unir(ordenado(desgloses).map((i) => limpio(i.title)).filter((t) => t && !esDinero(t)), 8)})` : "",
    calores.length ? `${calores.length} mapas de calor` : "",
    mapas.length ? `${mapas.length} mapas` : "",
    embudos.length ? `${embudos.length} embudos de cohortes` : "",
    historicos.length ? `${historicos.length} series históricas` : "",
    tablas.length ? `${tablas.length} tablas` : "",
    libres.length ? `${libres.length} conjuntos de datos` : "",
    rankings.length ? `${rankings.length} rankings` : "",
    medalleros.length ? `${medalleros.length} medalleros` : "",
    saberPro.length || saberTyt.length ? "resultados Saber PRO / TyT" : "",
    modelos.length ? `${modelos.length} modelos estadísticos` : "",
  ].filter(Boolean);
  salida.push(
    ...cerrar([
      {
        ref: `prof:cifras:${limpio(informe.slug)}`,
        title: `Informe ${limpio(informe.name)}`,
        section: "UDES en Cifras",
        body: [frase(informe.summary), frase(informe.description), frase(informe.note), contenido.length ? `Contiene: ${contenido.join("; ")}.` : "", b.periodo.illustrative === true ? "Sus cifras están marcadas como dato ilustrativo." : "", `Periodo ${limpio(b.periodo.label)}; datos leídos el ${leidoEl(ctx.ahora)}.`]
          .filter(Boolean)
          .join(" "),
        path: `${RUTA}/${limpio(informe.slug)}`,
        cut: limpio(b.periodo.label),
        office: OFICINA,
      },
    ]),
  );
  for (const i of ordenado(indicadores)) salida.push(...pasajesIndicador(i, vInd.get(String(i.id)) ?? [], b, informe, corteInforme));
  for (const d of ordenado(desgloses)) salida.push(...pasajesDesglose(d, vDes.get(String(d.id)) ?? [], b, informe));
  for (const h of ordenado(calores)) salida.push(...pasajesCalor(h, vCel.get(String(h.id)) ?? [], b, informe));
  for (const m of ordenado(mapas)) salida.push(...pasajesMapa(m, vMapa.get(String(m.id)) ?? [], b, informe));
  for (const p of ordenado(embudos)) salida.push(...pasajesEmbudo(p, vEmb.get(String(p.id)) ?? [], b, informe));
  for (const h of ordenado(historicos)) salida.push(...pasajesHistorico(h, vHist.get(String(h.id)) ?? [], b, informe));
  for (const t of ordenado(tablas)) salida.push(...pasajesTabla(t, vTabla.get(String(t.id)) ?? [], b, informe));
  for (const s of ordenado(libres)) salida.push(...pasajesLibre(s, vLibre.get(String(s.id)) ?? [], b, informe));
  for (const r of ordenado(rankings)) salida.push(...pasajesRanking(r, vEd.get(String(r.id)) ?? [], b, informe));
  for (const m of ordenado(medalleros)) salida.push(...pasajesMedallero(m, vEnt.get(String(m.id)) ?? [], b, informe));
  for (const s of ordenado(saberPro)) salida.push(...pasajesSaber(s, vPro.get(String(s.id)) ?? [], b, informe, "pro"));
  for (const s of ordenado(saberTyt)) salida.push(...pasajesSaber(s, vTyt.get(String(s.id)) ?? [], b, informe, "tyt"));
  for (const m of ordenado(modelos)) salida.push(...pasajesModelo(m, b, informe));
  salida.push(...pasajesPuntos(puntos, b, informe));
  return salida;
}

export const lectorCifras: Lector = {
  id: "cifras",
  nombre: "UDES en Cifras",
  alias: ["udes en cifras", "datos abiertos", "cifras de la udes", "cifras udes"],
  conSesion: false,
  async partes(ctx) {
    const b = await base(ctx);
    if (!b) return [];
    return [
      { id: PORTAL, etiqueta: "UDES en Cifras", alias: ["udes en cifras", "datos abiertos"] },
      ...b.informes
        .filter((r) => limpio(r.slug) && limpio(r.name) && !esDinero(r.name))
        .map((r) => ({ id: limpio(r.slug), etiqueta: limpio(r.name), alias: [normal(r.name), `informe ${normal(r.name)}`, normal(r.code)].filter(Boolean) })),
    ];
  },
  leer: leerInforme,
};

// `sinDinero` se reexporta para las pruebas de este lector.
export { sinDinero };
