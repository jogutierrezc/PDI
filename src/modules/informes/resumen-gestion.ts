/* =============================================================================
   Informes Institucionales · lo que el sistema ya sabe de la unidad, ordenado
   para el informe (0282). Sin React ni Supabase.

   El RPC informe_resumen_gestion entrega listas planas: indicadores de Impacto
   con sus cifras, y (en facultades) las acciones del plan con sus actividades y
   seguimientos. Aquí se conectan por pilar y por dimensión, se juntan las
   evidencias en un solo listado y se proponen los logros. Todo es sugerencia:
   la unidad decide qué entra al informe.
   ========================================================================== */

import type { ResumenAccion, ResumenGestion, ResumenIndicador } from "./types";

export const FN_ETIQUETA: Record<ResumenIndicador["fn"], string> = { investigacion: "Investigación", ensenanza: "Enseñanza", extension: "Extensión" };

/** La cifra más reciente que tiene valor (o texto) y no es «no aplica». */
export function ultimaCifra(i: ResumenIndicador) {
  return [...i.serie].filter((c) => !c.no_aplica && (c.valor !== null || c.texto.trim())).sort((a, b) => b.anio - a.anio)[0] ?? null;
}

/** Último seguimiento con avance (el más reciente por fecha reportada, o el último en llegar). */
export function ultimoSeguimiento(a: ResumenAccion) {
  const con = a.seguimientos.filter((s) => s.avance !== null);
  if (!con.length) return null;
  return [...con].sort((x, y) => (x.reportado ?? "").localeCompare(y.reportado ?? ""))[con.length - 1];
}

export interface PilarConectado {
  id: string;
  numeral: string;
  nombre: string;
  /** Indicadores con alineación confirmada a este pilar. */
  indicadores: ResumenIndicador[];
  /** Indicadores que el motor sugiere para este pilar y nadie confirmó todavía. */
  sugeridos: ResumenIndicador[];
  /** Acciones del plan de trabajo de este pilar. */
  acciones: ResumenAccion[];
}

/**
 * Conecta indicadores y acciones con cada pilar. Solo salen los pilares que
 * tienen algo conectado, en el orden del Plan.
 */
export function conectarPorPilar(r: ResumenGestion): PilarConectado[] {
  return r.pilares
    .map((p): PilarConectado => {
      const enPilar = (i: ResumenIndicador) => i.alineaciones.filter((a) => a.tipo === "pilar" && a.pilar === p.id);
      return {
        ...p,
        indicadores: r.indicadores.filter((i) => enPilar(i).some((a) => a.confirmada)),
        sugeridos: r.indicadores.filter((i) => enPilar(i).length > 0 && !enPilar(i).some((a) => a.confirmada)),
        acciones: r.plan.acciones.filter((a) => a.pilar === p.id),
      };
    })
    .filter((p) => p.indicadores.length || p.sugeridos.length || p.acciones.length);
}

export interface ResumenDimensionPlan {
  dimension: string;
  nombre: string;
  acciones: number;
  actividades: number;
  actividadesCumplidas: number;
  /** Promedio del último avance reportado de cada acción, o nulo si ninguna tiene. */
  avance: number | null;
  /** El último seguimiento con nota de cada acción: los avances que se sugieren llevar a «Resultados». */
  avances: { accion: string; corte: string; avance: number | null; estado: string; nota: string; evidencia: string }[];
}

const CUMPLIDA = /cumpl|complet|finaliz|termin|ejecutad|realizad/i;
export const estaCumplida = (estado: string) => CUMPLIDA.test(estado);

const ordenDimension = (d: string) => {
  const n = Number(/\d+/.exec(d)?.[0]);
  return Number.isFinite(n) ? n : 99;
};

/** El plan por dimensión: lo que se sugiere para «Resultados» cuando ya hay objetivos y metas. */
export function resumenPorDimensionPlan(acciones: ResumenAccion[]): ResumenDimensionPlan[] {
  const grupos = new Map<string, ResumenAccion[]>();
  for (const a of acciones) grupos.set(a.dimension, [...(grupos.get(a.dimension) ?? []), a]);
  return [...grupos.entries()]
    .sort((x, y) => ordenDimension(x[0]) - ordenDimension(y[0]))
    .map(([dimension, lista]) => {
      const avances = lista.map((a) => ({ a, s: ultimoSeguimiento(a) })).filter((x) => x.s);
      const valores = avances.map((x) => x.s!.avance as number);
      const acts = lista.flatMap((a) => a.actividades);
      return {
        dimension,
        nombre: lista[0].dimension_nombre,
        acciones: lista.length,
        actividades: acts.length,
        actividadesCumplidas: acts.filter((x) => estaCumplida(x.estado)).length,
        avance: valores.length ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length) : null,
        avances: avances.map(({ a, s }) => ({ accion: a.titulo, corte: s!.corte, avance: s!.avance, estado: s!.estado, nota: s!.nota, evidencia: s!.evidencia })),
      };
    });
}

export interface EvidenciaHallada {
  url: string;
  /** De dónde sale, en palabras: «Actividad: …», «Seguimiento de corte …», «Indicador E01, 2025». */
  origen: string;
  /** Ya está cargada como anexo del informe. */
  yaAnexo: boolean;
}

const esUrl = (t: string) => /^https?:\/\//i.test(t.trim());

/** Todos los enlaces de evidencia del plan y de Impacto, sin repetir y marcando los que ya son anexo. */
export function evidenciasHalladas(r: ResumenGestion): EvidenciaHallada[] {
  const anexos = new Set(r.anexos.filter((a) => a.url).map((a) => a.url!.trim()));
  const vistos = new Map<string, EvidenciaHallada>();
  const poner = (url: string, origen: string) => {
    const u = url.trim();
    if (!esUrl(u) || vistos.has(u)) return;
    vistos.set(u, { url: u, origen, yaAnexo: anexos.has(u) });
  };
  for (const a of r.plan.acciones) {
    for (const x of a.actividades) poner(x.evidencia, `Actividad: ${x.descripcion}`);
    for (const s of a.seguimientos) poner(s.evidencia, `Seguimiento del corte ${s.corte} · ${a.titulo}`);
  }
  for (const i of r.indicadores) {
    for (const c of i.serie) poner(c.evidencia, `Indicador ${i.codigo}, ${c.anio}${i.programa ? ` · ${i.programa}` : ""}`);
  }
  return [...vistos.values()];
}

export interface LogroSugerido {
  titulo: string;
  resultado: string;
  evidencia: string;
}

/** Actividades cumplidas, con su último seguimiento como resultado: de ahí salen los logros que se proponen. */
export function logrosSugeridos(r: ResumenGestion): LogroSugerido[] {
  const salida: LogroSugerido[] = [];
  for (const a of r.plan.acciones) {
    const s = ultimoSeguimiento(a);
    for (const x of a.actividades) {
      if (!estaCumplida(x.estado)) continue;
      salida.push({ titulo: x.descripcion, resultado: [a.titulo, s?.nota].filter(Boolean).join(". "), evidencia: x.evidencia });
    }
  }
  return salida;
}

/** ¿Hay objetivos y metas en el sistema? Entonces no se piden criterios y el plan por dimensión queda como sugerido. */
export const hayObjetivosYMetas = (r: ResumenGestion | null | undefined) => Boolean(r && (r.plan.acciones.length > 0 || r.indicadores.length > 0));
