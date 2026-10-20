/* =============================================================================
   Mr. Pilo · capa profunda · Portal de Impacto (0173).

   Lee DIRECTO de las tablas imp_* lo mismo que el portal muestra con sesión
   (la foto `imp_portal_snapshot()` pide una sesión de usuario, que esta función
   no tiene; aquí se leen las mismas tablas con el rol de servicio y los mismos
   filtros: fichas publicadas, indicadores propios de programa sin retirar,
   adopciones activas; nunca borradores, notas, evidencias ni textos de cifra).

   El Portal de Impacto pide sesión de la intranet: TODOS sus pasajes nacen
   «con sesión» y nunca los lee el público, aprobada o no la fuente.

   Qué arma:
     · la ficha de cada indicador (qué mide, etapa de la cadena de valor,
       numerador y denominador, fuente, línea base, metas 2026 y 2028,
       alineación con pilares y ODS) y su cifra por año: institucional, por sede
       y cuántos programas la reportan;
     · el cumplimiento por programa y por facultad con las reglas aprobadas:
       avance = cifra ÷ meta 2026 (la del programa en su sede, si no la de la
       ficha; invertido si el indicador mejora al bajar); cumplida ≥ 100 %, en
       camino ≥ 70 %, rezagada < 70 %; sin cifra y meta sin número se cuentan
       aparte (nunca como cero); los agregados usan la mediana.
   Sin dinero. Sin datos personales: unidades, programas y cifras agregadas.
   ========================================================================== */

import { agrupar, cerrar, cifra, esDinero, esObjeto, frase, leidoEl, limpio, lista, normal, numero, suelto, traer, trocear, unir } from "./comun.ts";
import type { Contexto, Fila, Lector, Parte, Pasaje } from "./comun.ts";

const RUTA = "/impacto";
const OFICINA = "Oficina de Planeación Institucional";
export const PORTAL = "__portal__";
/** Por debajo de este avance un indicador va rezagado (LAGGING_BELOW del portal). */
export const REZAGADA_BAJO = 70;

const FUNCIONES: Record<string, string> = { investigacion: "Investigación", ensenanza: "Enseñanza", extension: "Extensión" };
const ETAPAS: Record<string, string> = { insumo: "insumos", proceso: "procesos", producto: "productos", resultado: "resultados", impacto: "impacto" };

interface Datos {
  indicadores: Fila[];
  propios: Fila[];
  dimensiones: Map<string, string>;
  alineaciones: Map<string, Fila[]>;
  pilares: Map<string, string>;
  unidades: Fila[];
  sedes: Map<string, string>;
  oferta: Fila[];
  adopciones: Fila[];
  valores: Fila[];
}

const cache = new WeakMap<Contexto, Promise<Datos>>();

const sinTabla = (e: Error) => (/does not exist|could not find|schema cache/i.test(e.message) ? ([] as Fila[]) : Promise.reject(e));

async function leerDatos(ctx: Contexto): Promise<Datos> {
  const todos = await traer(ctx, "imp_indicators", {
    columnas:
      "id,code,fn,stage,dimension_id,name,description,unit_label,measure,direction,baseline_year,baseline_num,baseline_text,target_2026,target_2026_num,target_2028,target_2028_num,mandatory,numerator,denominator,source,responsible,sheet,position,status,program_id,campus_id,parent_id",
  }).catch(sinTabla);
  const indicadores = todos.filter((i) => i.program_id === null && i.status === "publicado");
  const propios = todos.filter((i) => i.program_id !== null && i.status !== "retirado");
  const publicados = new Set(indicadores.map((i) => String(i.id)));
  const visibles = new Set([...publicados, ...propios.map((i) => String(i.id))]);
  const [dimensiones, alineaciones, pilares, unidades, sedes, oferta, adopciones, valores] = await Promise.all([
    traer(ctx, "imp_dimensions").catch(sinTabla),
    traer(ctx, "imp_alignments").catch(sinTabla),
    traer(ctx, "pillars").catch(sinTabla),
    traer(ctx, "units").catch(sinTabla),
    traer(ctx, "campuses").catch(sinTabla),
    traer(ctx, "program_campuses").catch(sinTabla),
    traer(ctx, "imp_adoptions").catch(sinTabla),
    // Solo la cifra: nunca value_text ni notas.
    traer(ctx, "imp_values", { columnas: "id,indicator_id,year,program_id,campus_id,value_num,not_applicable" }).catch(sinTabla),
  ]);
  return {
    indicadores: indicadores.sort((a, b) => (numero(a.position) ?? 0) - (numero(b.position) ?? 0) || limpio(a.code).localeCompare(limpio(b.code))),
    propios,
    dimensiones: new Map(dimensiones.map((d) => [String(d.id), limpio(d.name)])),
    alineaciones: agrupar(alineaciones.filter((a) => publicados.has(String(a.indicator_id)) && (a.confirmed === true || a.origin === "matriz" || a.origin === "manual")), "indicator_id"),
    pilares: new Map(pilares.map((p) => [String(p.id), `Pilar ${limpio(p.numeral)} ${limpio(p.name)}`.trim()])),
    unidades: unidades.filter((u) => limpio(u.slug)),
    sedes: new Map(sedes.map((s) => [String(s.id), limpio(s.name)])),
    oferta: oferta.filter((o) => o.active !== false),
    adopciones: adopciones.filter((a) => a.active !== false && publicados.has(String(a.indicator_id))),
    valores: valores.filter((v) => visibles.has(String(v.indicator_id))),
  };
}

function datos(ctx: Contexto): Promise<Datos> {
  let p = cache.get(ctx);
  if (!p) {
    p = leerDatos(ctx);
    cache.set(ctx, p);
  }
  return p;
}

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** El avance de una cifra frente a su meta (%): invertido si el indicador mejora al bajar. Null si no se puede decir. */
export function avance(valor: number | null, meta: number | null, direccion: unknown): number | null {
  if (valor === null || meta === null) return null;
  if (direccion === "baja") return valor === 0 ? (meta === 0 ? 100 : null) : (meta / valor) * 100;
  return meta === 0 ? null : (valor / meta) * 100;
}

export type Estado = "cumplida" | "en_camino" | "rezagada" | "sin_cifra" | "sin_meta";
export function estadoDe(valor: number | null, meta: number | null, direccion: unknown): { estado: Estado; avance: number | null } {
  if (meta === null) return { estado: "sin_meta", avance: null };
  if (valor === null) return { estado: "sin_cifra", avance: null };
  const a = avance(valor, meta, direccion);
  if (a === null) return { estado: "sin_meta", avance: null };
  return { estado: a >= 100 ? "cumplida" : a >= REZAGADA_BAJO ? "en_camino" : "rezagada", avance: a };
}

const TEXTO_ESTADO: Record<Estado, string> = { cumplida: "cumplidas", en_camino: "en camino", rezagada: "rezagadas", sin_cifra: "sin cifra", sin_meta: "con meta sin número" };

/** La cifra más reciente (año más alto con número). */
function ultima(valores: Fila[]): { year: number; valor: number } | null {
  let mejor: { year: number; valor: number } | null = null;
  for (const v of valores) {
    const y = numero(v.year);
    const n = numero(v.value_num);
    if (y === null || n === null || v.not_applicable === true) continue;
    if (!mejor || y > mejor.year) mejor = { year: y, valor: n };
  }
  return mejor;
}

function medida(i: Fila): string {
  const u = limpio(i.unit_label);
  return u && !esDinero(u) ? u : "";
}

function pasajesIndicador(d: Datos, ind: Fila, ctx: Contexto): Pasaje[] {
  const nombre = limpio(ind.name);
  const codigo = limpio(ind.code);
  if (!nombre || !codigo || esDinero(nombre) || esDinero(ind.unit_label)) return [];
  const id = String(ind.id);
  const u = medida(ind);
  const con = (v: number | null) => (v === null ? "sin dato" : `${cifra(v, limpio(ind.measure) === "porcentaje" ? "porcentaje" : "decimal").replace(/,0$/, "")}${u ? (u === "%" ? " %" : ` ${u}`) : ""}`);
  const valores = d.valores.filter((v) => String(v.indicator_id) === id);
  const hoja = esObjeto(ind.sheet) ? ind.sheet : {};
  const alin = (d.alineaciones.get(id) ?? []).map((a) => (a.target === "ods" ? `ODS ${numero(a.sdg) ?? ""}` : (d.pilares.get(String(a.pillar_id)) ?? ""))).filter(Boolean);
  const encabezado = [
    `Indicador de impacto ${codigo} · ${nombre}.`,
    `Pertenece a la función ${FUNCIONES[limpio(ind.fn)] ?? limpio(ind.fn)}, en el eslabón de ${ETAPAS[limpio(ind.stage)] ?? limpio(ind.stage)} de la cadena de valor${d.dimensiones.get(String(ind.dimension_id)) ? `, dimensión ${d.dimensiones.get(String(ind.dimension_id))}` : ""}.`,
    frase(ind.description),
    limpio(ind.numerator) ? `Numerador: ${frase(ind.numerator)}` : "",
    limpio(ind.denominator) ? `Denominador: ${frase(ind.denominator)}` : "",
    ["objetivo", "metodoCalculo", "interpretacion", "periodicidad"].map((k) => (limpio(hoja[k]) ? `${{ objetivo: "Objetivo", metodoCalculo: "Cálculo", interpretacion: "Cómo se lee", periodicidad: "Periodicidad" }[k]}: ${frase(hoja[k])}` : "")).filter(Boolean).join(" "),
    ind.direction === "baja" ? "Mejora cuando baja." : ind.direction === "sube" ? "Mejora cuando sube." : "",
    limpio(ind.source) ? `Fuente: ${frase(ind.source)}` : "",
    limpio(ind.responsible) ? `Responsable: ${frase(ind.responsible)}` : "",
    numero(ind.baseline_num) !== null ? `Línea base ${numero(ind.baseline_year) ?? ""}: ${con(numero(ind.baseline_num))}.` : limpio(ind.baseline_text) ? `Línea base: ${limpio(ind.baseline_text)}.` : "",
    numero(ind.target_2026_num) !== null || limpio(ind.target_2026) ? `Meta 2026: ${numero(ind.target_2026_num) !== null ? con(numero(ind.target_2026_num)) : limpio(ind.target_2026)}.` : "",
    numero(ind.target_2028_num) !== null || limpio(ind.target_2028) ? `Meta 2028: ${numero(ind.target_2028_num) !== null ? con(numero(ind.target_2028_num)) : limpio(ind.target_2028)}.` : "",
    ind.mandatory === true ? "Es de reporte obligatorio." : "",
    alin.length ? `Se alinea con: ${unir(alin, 10)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const lineas: string[] = [];
  const institucional = valores.filter((v) => v.program_id === null && v.campus_id === null);
  const anios = [...new Set(valores.map((v) => numero(v.year)).filter((y): y is number => y !== null))].sort((a, b) => a - b);
  const serie = anios.map((y) => ({ y, v: ultima(institucional.filter((v) => numero(v.year) === y))?.valor ?? null })).filter((p) => p.v !== null);
  if (serie.length) lineas.push(`Cifra institucional por año: ${serie.map((p) => `${p.y}: ${con(p.v)}`).join("; ")}.`);
  const porSede = [...d.sedes.entries()]
    .map(([sid, sn]) => ({ sn, u: ultima(valores.filter((v) => v.program_id === null && String(v.campus_id) === sid)) }))
    .filter((s) => s.u);
  if (porSede.length) lineas.push(`Por sede (cifra más reciente): ${porSede.map((s) => `${s.sn} ${con(s.u!.valor)} (${s.u!.year})`).join("; ")}.`);
  const programas = new Map<string, number>();
  for (const v of valores) if (v.program_id !== null && numero(v.value_num) !== null && v.not_applicable !== true) programas.set(String(v.program_id), 1);
  if (programas.size) lineas.push(`${programas.size} ${programas.size === 1 ? "programa reporta" : "programas reportan"} cifra de este indicador.`);
  const adoptantes = new Set(d.adopciones.filter((a) => String(a.indicator_id) === id).map((a) => String(a.program_id)));
  if (adoptantes.size) lineas.push(`Lo adoptaron ${adoptantes.size} ${adoptantes.size === 1 ? "programa" : "programas"}.`);
  if (!lineas.length) lineas.push("Todavía no tiene cifras reportadas; un dato sin reportar no es un cero.");
  return cerrar(
    trocear(encabezado, lineas).map((cuerpo, i) => ({
      ref: `prof:impacto:ind:${codigo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${i ? `:${i + 1}` : ""}`,
      title: `${codigo} · ${nombre}`,
      section: `Portal de Impacto · ${FUNCIONES[limpio(ind.fn)] ?? ""}`.trim(),
      body: cuerpo,
      path: RUTA,
      cut: serie.length ? String(serie[serie.length - 1].y) : "",
      office: limpio(ind.responsible) || OFICINA,
      vis: "sesion" as const,
    })),
  );
}

/** El cumplimiento de un programa: una unidad por cada indicador que adoptó (en cada sede). */
function cumplimientoPrograma(d: Datos, programa: Fila) {
  const pid = String(programa.id);
  const porIndicador = new Map(d.indicadores.map((i) => [String(i.id), i]));
  const unidades = d.adopciones.filter((a) => String(a.program_id) === pid);
  return unidades.map((a) => {
    const ind = porIndicador.get(String(a.indicator_id))!;
    const v = ultima(d.valores.filter((x) => String(x.indicator_id) === String(a.indicator_id) && String(x.program_id) === pid && String(x.campus_id) === String(a.campus_id)));
    const meta = numero(a.target_2026_num) ?? numero(ind?.target_2026_num);
    return { ind, campus: String(a.campus_id), ...estadoDe(v?.valor ?? null, meta, ind?.direction), valor: v?.valor ?? null, year: v?.year ?? null };
  });
}

const resumirEstados = (filas: { estado: Estado }[]) => {
  const n: Record<Estado, number> = { cumplida: 0, en_camino: 0, rezagada: 0, sin_cifra: 0, sin_meta: 0 };
  for (const f of filas) n[f.estado] += 1;
  return (Object.keys(n) as Estado[]).filter((k) => n[k]).map((k) => `${n[k]} ${TEXTO_ESTADO[k]}`).join(", ");
};

function facultadDe(d: Datos, id: string): Fila | undefined {
  const porId = new Map(d.unidades.map((u) => [String(u.id), u]));
  let actual = porId.get(id);
  for (let i = 0; actual && i < 6; i++) {
    if (actual.kind === "facultad") return actual;
    actual = actual.parent_id ? porId.get(String(actual.parent_id)) : undefined;
  }
  return undefined;
}

function pasajesFacultad(d: Datos, fac: Fila, ctx: Contexto): Pasaje[] {
  const fid = String(fac.id);
  const slug = limpio(fac.slug);
  const programas = d.unidades.filter((u) => u.kind === "programa" && String(facultadDe(d, String(u.id))?.id) === fid);
  const out: Partial<Pasaje>[] = [];
  const todas: { estado: Estado; avance: number | null }[] = [];
  for (const p of programas) {
    const filas = cumplimientoPrograma(d, p);
    todas.push(...filas);
    if (!filas.length) continue;
    const rezagadas = filas.filter((f) => f.estado === "rezagada").sort((a, b) => (a.avance ?? 0) - (b.avance ?? 0));
    const avances = filas.map((f) => f.avance).filter((a): a is number => a !== null);
    const sedes = [...new Set(d.oferta.filter((o) => String(o.program_id) === String(p.id)).map((o) => d.sedes.get(String(o.campus_id)) ?? ""))].filter(Boolean);
    const lineas = [
      `Cumplimiento de ${filas.length} indicadores adoptados: ${resumirEstados(filas)}.`,
      avances.length ? `Mediana de avance frente a la meta 2026: ${suelto(Math.round((mediana(avances) as number) * 10) / 10)} %.` : "",
      rezagadas.length ? `Más rezagados: ${rezagadas.slice(0, 8).map((f) => `${limpio(f.ind?.code)} ${limpio(f.ind?.name)} (${suelto(Math.round((f.avance ?? 0) * 10) / 10)} %)`).join("; ")}.` : "",
    ].filter(Boolean);
    trocear(`Programa ${limpio(p.name)}, de la facultad ${limpio(fac.name)}${sedes.length ? `, en ${unir(sedes, 6)}` : ""}. Datos del Portal de Impacto.`, lineas).forEach((cuerpo, i) =>
      out.push({ ref: `prof:impacto:programa:${limpio(p.slug)}${i ? `:${i + 1}` : ""}`, title: `${limpio(p.name)} · cumplimiento de impacto`, section: `Facultad ${limpio(fac.name)}`, body: cuerpo, path: `${RUTA}/programa/${limpio(p.slug)}`, cut: String(ctx.ahora.getUTCFullYear()), office: limpio(fac.name), vis: "sesion" }),
    );
  }
  if (todas.length) {
    out.push({
      ref: `prof:impacto:facultad:${slug}`,
      title: `Facultad ${limpio(fac.name)} · impacto`,
      section: "Portal de Impacto",
      body: `Facultad ${limpio(fac.name)}: ${programas.length} programas, ${todas.length} indicadores adoptados en total (${resumirEstados(todas)}). Mediana de avance frente a la meta 2026: ${(() => {
        const m = mediana(todas.map((f) => f.avance).filter((a): a is number => a !== null));
        return m === null ? "sin cifras suficientes" : `${suelto(Math.round(m * 10) / 10)} %`;
      })()}. Lo rezagado es lo que va por debajo del ${REZAGADA_BAJO} % de su meta.`,
      path: `${RUTA}/facultad/${slug}`,
      cut: String(ctx.ahora.getUTCFullYear()),
      office: limpio(fac.name),
      vis: "sesion",
    });
  }
  return cerrar(out);
}

export const lectorImpacto: Lector = {
  id: "impacto",
  nombre: "Portal de Impacto",
  alias: ["portal de impacto", "indicadores de impacto", "impacto udes"],
  conSesion: true,
  async partes(ctx) {
    const d = await datos(ctx);
    return [
      { id: PORTAL, etiqueta: "Portal de Impacto", alias: ["portal de impacto"] },
      ...Object.entries(FUNCIONES).map(([id, nombre]): Parte => ({ id: `fn:${id}`, etiqueta: `Función ${nombre}`, alias: [normal(`funcion ${nombre}`), normal(nombre)] })),
      ...d.unidades.filter((u) => u.kind === "facultad").map((f): Parte => ({ id: `fac:${limpio(f.slug)}`, etiqueta: `Facultad ${limpio(f.name)}`, alias: [normal(f.name), normal(`facultad ${limpio(f.name)}`)] })),
    ];
  },
  async leer(ctx, parte) {
    const d = await datos(ctx);
    if (parte.id === PORTAL) {
      const porFuncion = Object.entries(FUNCIONES).map(([id, n]) => `${n} ${d.indicadores.filter((i) => i.fn === id).length}`);
      return cerrar([
        {
          ref: "prof:impacto:portal",
          title: "Portal de Impacto",
          section: "Portal de Impacto",
          body: `El Portal de Impacto de la UDES sigue ${d.indicadores.length} indicadores publicados en la cadena de valor (insumos, procesos, productos, resultados e impacto) de las funciones sustantivas: ${porFuncion.join(", ")}. ${d.propios.length} indicadores más son propios de programas. Hay ${d.unidades.filter((u) => u.kind === "programa").length} programas y ${d.adopciones.length} adopciones de indicadores. Se consulta con sesión de la intranet. Leído el ${leidoEl(ctx.ahora)}.`,
          path: RUTA,
          cut: String(ctx.ahora.getUTCFullYear()),
          office: OFICINA,
          vis: "sesion",
        },
      ]);
    }
    if (parte.id.startsWith("fn:")) return d.indicadores.filter((i) => i.fn === parte.id.slice(3)).flatMap((i) => pasajesIndicador(d, i, ctx));
    if (parte.id.startsWith("fac:")) {
      const fac = d.unidades.find((u) => u.kind === "facultad" && limpio(u.slug) === parte.id.slice(4));
      return fac ? pasajesFacultad(d, fac, ctx) : [];
    }
    return [];
  },
};

// Para quien lea una lista de nombres de estado.
export const estadosTexto = TEXTO_ESTADO;
export { lista };
