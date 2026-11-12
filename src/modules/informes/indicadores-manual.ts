/* =============================================================================
   Resultados por dimensión · indicadores que la unidad escribe a mano.

   Cada indicador lleva cifra actual, anterior y meta. El estado NO se escribe:
   sale de la aritmética (logro frente a la meta y variación frente a lo
   anterior), en texto y en porcentaje. Los indicadores viven en la sección
   (`contenido.indicadores`), se vuelven `CifraVista` para que la síntesis, el
   texto con [[clave]] y el PDF los traten como cualquier otra cifra, y se
   congelan al enviar junto con la sección. Lógica pura, sin lanzar.
   ========================================================================== */

import { formatoCifra, numeroDe } from "./cifras-vivas";
import type { CifraVista } from "./cifras-vivas";
import { CORTE_PARCIAL, ETIQUETA_ESTADO_META, avanceFrenteAMeta, estadoMeta } from "./vista/estados";
import type { EstadoMeta } from "./vista/estados";
import { DIMS } from "./plantillas";
import type { EstadoInstancia } from "./types";

export interface IndicadorManual {
  id: string;
  /** Un criterio base («acad»…), uno aprobado («c_…») o uno propio de la unidad («l_…»). */
  criterio: string;
  /** Nombre del criterio al escribir (queda aunque el criterio se archive). */
  criterio_nombre?: string;
  nombre: string;
  /** «», « %»… se pega al valor. */
  unidad: string;
  mayorMejor: boolean;
  actual: number | null;
  anterior: number | null;
  meta: number | null;
  fuente: string;
  /** Explicación de la unidad: por qué se movió la cifra. */
  nota: string;
  /** Clave del dato que Planeación pide (informe_datos_requeridos, 0253) al que responde este indicador. */
  requerido?: string;
  /** «cifra» (por defecto; sin `tipo` en lo guardado antes es cifra) o «accion»: textos, sin aritmética. */
  tipo?: TipoIndicador;
  /** Acción: qué es la acción. */
  descripcion?: string;
  /** Acción: qué se ha hecho con ella. */
  avance_texto?: string;
  /** Acción: cuándo se plantea su finalización (fecha o periodo, texto libre). */
  finalizacion?: string;
  /** Acción: proyecciones en texto… */
  proyeccion_texto?: string;
  /** …y en número (su unidad es `unidad`, opcional). */
  proyeccion_num?: number | null;
}

export type TipoIndicador = "cifra" | "accion";

/** Una acción son textos: no entra a logro, semáforo ni síntesis numérica. */
export const esAccion = (i: Pick<IndicadorManual, "tipo">) => i.tipo === "accion";
export const esCifra = (i: Pick<IndicadorManual, "tipo">) => i.tipo !== "accion";

export interface CriterioPropio {
  id: string;
  nombre: string;
  /** Ya se sugirió a Planeación. */
  sugerido?: boolean;
}

/** Un criterio para elegir: base, aprobado por Planeación o propio. */
export interface Criterio {
  id: string;
  nombre: string;
  origen: "base" | "aprobado" | "propio";
}

export const UNIDADES_USUALES = ["", " %", " pp", " $"] as const;

export const claveIndicador = (seccion: string, id: string) => `ind_${seccion}_${id}`;
export const esClaveIndicador = (clave: string) => clave.startsWith("ind_");
export const idNuevo = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export function indicadorNuevo(criterio: string, criterioNombre = "", tipo: TipoIndicador = "cifra"): IndicadorManual {
  if (tipo === "accion") {
    return { id: idNuevo(), criterio, criterio_nombre: criterioNombre, nombre: "", unidad: "", mayorMejor: true, actual: null, anterior: null, meta: null, fuente: "", nota: "", tipo: "accion", descripcion: "", avance_texto: "", finalizacion: "", proyeccion_texto: "", proyeccion_num: null };
  }
  return { id: idNuevo(), criterio, criterio_nombre: criterioNombre, nombre: "", unidad: "", mayorMejor: true, actual: null, anterior: null, meta: null, fuente: "", nota: "" };
}

/** Los criterios de una sección: los base de la plantilla, los aprobados y los que la unidad escribió. */
export function criteriosDe(dims: string[], aprobados: { id: string; nombre: string }[], propios: CriterioPropio[] = []): Criterio[] {
  const vistos = new Set<string>();
  const salida: Criterio[] = [];
  const poner = (c: Criterio) => {
    if (vistos.has(c.id)) return;
    vistos.add(c.id);
    salida.push(c);
  };
  for (const d of dims) if (d in DIMS) poner({ id: d, nombre: DIMS[d as keyof typeof DIMS].titulo, origen: "base" });
  for (const a of aprobados) poner({ ...a, origen: "aprobado" });
  for (const p of propios) poner({ ...p, origen: "propio" });
  return salida;
}

/* ---------- La aritmética del estado ---------------------------------------- */

export interface Evaluacion {
  estado: EstadoMeta | null;
  /** Lo alcanzado de la meta, en %. 100 = cumplida. */
  logroMeta: number | null;
  /** actual − anterior. */
  cambio: number | null;
  /** Variación frente a lo anterior, en %. Nulo si lo anterior es 0 o falta. */
  cambioPct: number | null;
  /** ¿El cambio va hacia lo deseado? */
  rumbo: "mejora" | "empeora" | "igual" | null;
  /** Frase lista para leer: «Alcanzó 92 % de la meta (Parcial) y mejoró 8 % frente al año anterior». */
  texto: string;
}

const redondear = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (n: number) => `${redondear(Math.abs(n)).toLocaleString("es-CO")} %`;

export function evaluar(i: Pick<IndicadorManual, "actual" | "anterior" | "meta" | "mayorMejor" | "unidad">): Evaluacion {
  const { actual, anterior, meta, mayorMejor, unidad } = i;
  const estado = estadoMeta(actual, meta, mayorMejor);
  const avance = avanceFrenteAMeta(actual, meta, mayorMejor);
  const logroMeta = avance === null ? null : redondear(avance * 100);

  const cambio = actual !== null && anterior !== null ? redondear(actual - anterior, 2) : null;
  const cambioPct = cambio !== null && anterior !== null && anterior !== 0 ? redondear((cambio / Math.abs(anterior)) * 100) : null;
  const rumbo = cambio === null ? null : cambio === 0 ? "igual" : (cambio > 0) === mayorMejor ? "mejora" : "empeora";

  const partes: string[] = [];
  if (estado && logroMeta !== null) {
    if (estado === "cumplida") partes.push("Cumplió la meta (100 %)");
    else if (estado === "superada") partes.push(`Superó la meta: ${mayorMejor ? pct(logroMeta) : pct(Math.max(logroMeta, 100))} de lo propuesto`);
    else partes.push(`Alcanzó ${pct(logroMeta)} de la meta (${ETIQUETA_ESTADO_META[estado]})`);
  }
  if (rumbo && anterior !== null) {
    const verbo = rumbo === "mejora" ? "mejoró" : rumbo === "empeora" ? "empeoró" : "se mantuvo";
    if (rumbo === "igual") partes.push(`se mantuvo frente al periodo anterior (${formatoCifra(anterior, unidad)})`);
    else
      partes.push(
        cambioPct !== null
          ? `${verbo} ${pct(cambioPct)} frente al periodo anterior (de ${formatoCifra(anterior, unidad)} a ${formatoCifra(actual, unidad)})`
          : `${verbo}: pasó de ${formatoCifra(anterior, unidad)} a ${formatoCifra(actual, unidad)}`,
      );
  }
  let texto = partes.join(" y ");
  if (texto) texto = texto.charAt(0).toUpperCase() + texto.slice(1) + ".";
  else if (actual !== null) texto = "Sin meta ni dato anterior con qué comparar.";
  else texto = "Falta la cifra actual.";
  return { estado, logroMeta, cambio, cambioPct, rumbo, texto };
}

export { CORTE_PARCIAL };

/* ---------- Validación ----------------------------------------------------------- */

/** Qué le falta a un indicador para estar completo. Vacío si nada. */
export function faltantes(i: IndicadorManual, exigirFuente: boolean): string[] {
  const f: string[] = [];
  if (!i.nombre.trim()) f.push("el nombre");
  if (esAccion(i)) {
    // La finalización y las proyecciones ayudan pero no se exigen.
    if (!i.descripcion?.trim()) f.push("la descripción de la acción");
    if (!i.avance_texto?.trim()) f.push("qué se ha hecho con la acción");
    return f;
  }
  if (i.actual === null) f.push("la cifra actual");
  if (i.meta === null) f.push("la meta");
  if (exigirFuente && !i.fuente.trim()) f.push("la fuente");
  return f;
}

/** Una cifra cuenta cuando tiene nombre y cifra actual; una acción, con nombre, descripción y qué se ha hecho (finalización y proyecciones son opcionales). */
export const esCompleto = (i: IndicadorManual) =>
  esAccion(i) ? Boolean(i.nombre.trim() && i.descripcion?.trim() && i.avance_texto?.trim()) : Boolean(i.nombre.trim()) && i.actual !== null;

/** Solo las cifras: lo que entra a la aritmética. */
export const soloCifras = (l: IndicadorManual[]) => l.filter(esCifra);
export const soloAcciones = (l: IndicadorManual[]) => l.filter(esAccion);

/** Criterios marcados: los de `criterios_reporta` más los que ya tienen indicadores (guardados antiguos). */
export function criteriosMarcados(reporta: string[] | undefined, indicadores: IndicadorManual[], pedidos: string[] = []): Set<string> {
  const s = new Set<string>(reporta ?? []);
  for (const i of indicadores) if (i.criterio) s.add(i.criterio);
  for (const p of pedidos) s.add(p);
  return s;
}

/* ---------- Puente a la cifra del informe --------------------------------------- */

/** El indicador como cualquier otra cifra: entra a la síntesis, al texto con [[clave]] y al PDF. */
export function aCifraVista(i: IndicadorManual, seccion: string, estado: EstadoInstancia): CifraVista {
  return {
    clave: claveIndicador(seccion, i.id),
    etiqueta: i.nombre.trim() || "Indicador sin nombre",
    unidad: i.unidad,
    mayorMejor: i.mayorMejor,
    valor: i.actual,
    anterior: i.anterior,
    meta: i.meta,
    fuenteTipo: "manual",
    fuente: i.fuente.trim(),
    corte: null,
    viva: false,
    propia: true,
    congelada: estado === "sent" || estado === "ok",
    cambio: null,
    incluida: true,
    justificacion: i.nota.trim(),
    condicion: "sugerido",
  };
}

/* ---------- Normalizar lo guardado ---------------------------------------------- */

/** Lo que llega del JSON de la base puede venir incompleto: se deja en forma. */
export function normalizar(crudo: unknown): IndicadorManual[] {
  if (!Array.isArray(crudo)) return [];
  const salida: IndicadorManual[] = [];
  for (const x of crudo) {
    if (typeof x !== "object" || x === null) continue;
    const o = x as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    salida.push({
      id: typeof o.id === "string" && o.id ? o.id : idNuevo(),
      criterio: typeof o.criterio === "string" ? o.criterio : "",
      criterio_nombre: typeof o.criterio_nombre === "string" ? o.criterio_nombre : "",
      nombre: typeof o.nombre === "string" ? o.nombre : "",
      unidad: typeof o.unidad === "string" ? o.unidad : "",
      mayorMejor: o.mayorMejor !== false,
      actual: num(o.actual),
      anterior: num(o.anterior),
      meta: num(o.meta),
      fuente: typeof o.fuente === "string" ? o.fuente : "",
      nota: typeof o.nota === "string" ? o.nota : "",
      ...(typeof o.requerido === "string" && o.requerido ? { requerido: o.requerido } : {}),
      ...(o.tipo === "accion"
        ? {
            tipo: "accion" as const,
            descripcion: typeof o.descripcion === "string" ? o.descripcion : "",
            avance_texto: typeof o.avance_texto === "string" ? o.avance_texto : "",
            finalizacion: typeof o.finalizacion === "string" ? o.finalizacion : "",
            proyeccion_texto: typeof o.proyeccion_texto === "string" ? o.proyeccion_texto : "",
            proyeccion_num: num(o.proyeccion_num),
          }
        : {}),
    });
  }
  return salida;
}

/* ---------- Excel: plantilla y lectura -------------------------------------------- */

export const COLUMNAS_EXCEL = ["Criterio", "Indicador", "Unidad", "Qué es mejor", "Año anterior", "Cifra actual", "Meta", "Fuente", "Nota"] as const;
/** Columnas opcionales al final: una fila con «Acción» en Tipo se lee como acción. Un archivo sin ellas se lee como siempre. */
export const COLUMNAS_ACCION_EXCEL = ["Tipo", "Descripción de la acción", "Qué se ha hecho", "Finalización", "Proyección (texto)", "Proyección (número)"] as const;
export const COLUMNAS_EXCEL_TODAS = [...COLUMNAS_EXCEL, ...COLUMNAS_ACCION_EXCEL] as const;
export const TIPO_CIFRA = "Cifra";
export const TIPO_ACCION = "Acción";
export const MAS_ES_MEJOR = "Más es mejor";
export const MENOS_ES_MEJOR = "Menos es mejor";

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export interface LecturaIndicadores {
  indicadores: IndicadorManual[];
  /** Criterios del archivo que no existían: se crean como propios de la unidad. */
  criteriosNuevos: CriterioPropio[];
  avisos: string[];
}

/** Lee las filas de la hoja «Indicadores» (la primera fila es el encabezado). */
export function leerFilasIndicadores(filas: string[][], criterios: Criterio[]): LecturaIndicadores {
  const porNombre = new Map(criterios.map((c) => [sinTildes(c.nombre), c.id]));
  const nuevos = new Map<string, CriterioPropio>();
  const indicadores: IndicadorManual[] = [];
  const avisos: string[] = [];

  filas.slice(1).forEach((f, n) => {
    const fila = n + 2;
    const celdas = COLUMNAS_EXCEL_TODAS.map((_, k) => String(f[k] ?? "").trim());
    if (celdas.every((c) => !c)) return;
    const [crit, nombre, unidad, sentido, anterior, actual, meta, fuente, nota, tipoTxt, descripcion, hecho, finalizacion, proyTxt, proyNum] = celdas;
    const accion = sinTildes(tipoTxt) === "accion";
    if (!nombre) {
      avisos.push(`Fila ${fila}: sin nombre de indicador, se omitió.`);
      return;
    }
    let id = porNombre.get(sinTildes(crit)) ?? nuevos.get(sinTildes(crit))?.id;
    if (!id) {
      if (crit) {
        id = `l_${idNuevo()}`;
        nuevos.set(sinTildes(crit), { id, nombre: crit });
        avisos.push(`Fila ${fila}: el criterio «${crit}» no existe; se creó como criterio propio de la unidad.`);
      } else {
        id = criterios[0]?.id ?? "";
        avisos.push(`Fila ${fila}: sin criterio, quedó en «${criterios[0]?.nombre ?? "—"}».`);
      }
    }
    const numero = (texto: string, nombreCol: string) => {
      if (!texto) return null;
      const v = numeroDe(texto.replace(/%/g, "").replace(/\$/g, ""));
      if (v === null) avisos.push(`Fila ${fila}: «${texto}» no es un número en ${nombreCol}.`);
      return v;
    };
    const base = {
      id: idNuevo() + n,
      criterio: id,
      criterio_nombre: criterios.find((c) => c.id === id)?.nombre ?? nuevos.get(sinTildes(crit))?.nombre ?? "",
      nombre,
      unidad: unidad ? (unidad.startsWith(" ") ? unidad : /^[%$]|^pp/i.test(unidad) ? ` ${unidad}` : unidad) : "",
      mayorMejor: !/menos|bajar|baja|disminu/i.test(sentido),
      anterior: numero(anterior, "Año anterior"),
      actual: numero(actual, "Cifra actual"),
      meta: numero(meta, "Meta"),
      fuente,
      nota,
    };
    if (accion) {
      indicadores.push({
        ...base,
        mayorMejor: true,
        anterior: null,
        actual: null,
        meta: null,
        tipo: "accion",
        descripcion,
        avance_texto: hecho,
        finalizacion,
        proyeccion_texto: proyTxt,
        proyeccion_num: numero(proyNum, "Proyección (número)"),
      });
    } else indicadores.push(base);
  });
  return { indicadores, criteriosNuevos: [...nuevos.values()], avisos };
}

/** Filas para el libro de Excel (plantilla con ejemplo o exportación de lo escrito). */
export function filasParaExcel(indicadores: IndicadorManual[], criterios: Criterio[]): (string | number | null)[][] {
  const nombre = new Map(criterios.map((c) => [c.id, c.nombre]));
  return indicadores.map((i) => {
    const comun = [nombre.get(i.criterio) ?? i.criterio, i.nombre, i.unidad.trim()];
    if (esAccion(i)) return [...comun, "", null, null, null, i.fuente, i.nota, TIPO_ACCION, i.descripcion ?? "", i.avance_texto ?? "", i.finalizacion ?? "", i.proyeccion_texto ?? "", i.proyeccion_num ?? null];
    return [...comun, i.mayorMejor ? MAS_ES_MEJOR : MENOS_ES_MEJOR, i.anterior, i.actual, i.meta, i.fuente, i.nota, TIPO_CIFRA, "", "", "", "", null];
  });
}
