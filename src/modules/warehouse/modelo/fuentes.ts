/* Warehouse UDES · modelo semántico · las fuentes.

   Toda tabla del catálogo (CONJUNTOS) es una fuente posible. De los conjuntos con columnas confirmadas
   (las políticas de la base y los HAR del README del módulo) se sabe el grano y qué es cada columna; de
   los demás, el grano genérico y lo que diga el perfil de la primera carga. */

import { CONJUNTOS, cargable, grupoDe, type Conjunto } from "../conjuntos";
import { DIMENSIONES, dimensionPorNombre, esColumnaDePeriodo, type DimensionId } from "./dimensiones";

export type RolColumna = "llave" | "atributo" | "medida" | "texto";

export interface ColumnaConocida {
  rol: RolColumna;
  /** La dimensión a la que une, si une a alguna. */
  dimension?: DimensionId;
  /** Es dato personal según la política: nunca una dimensión ni un filtro. */
  personal?: boolean;
  /** Lo que el nombre de la columna no deja ver. */
  nota?: string;
}

export interface FuenteBI {
  id: string;
  nombre: string;
  sistema: Conjunto["sistema"];
  grupo: string;
  /** Qué representa una fila. Es lo que decide si dos fuentes se pueden sumar: casi nunca. */
  grano: string;
  /** Se puede cargar hoy. Una fuente que no se puede cargar se ve en el modelo pero no se puede elegir. */
  cargable: boolean;
  porCorte: boolean;
  /** Columnas confirmadas; vacío si todavía no se conocen (se completan con el perfil). */
  columnas: Record<string, ColumnaConocida>;
  /** Las columnas del archivo son periodos (histórico de deserciones): hay que pivotarlas a filas. */
  periodosEnColumnas: boolean;
}

const llave = (dimension: DimensionId, extra: Partial<ColumnaConocida> = {}): ColumnaConocida => ({ rol: "llave", dimension, ...extra });
const medida: ColumnaConocida = { rol: "medida" };
const atributo: ColumnaConocida = { rol: "atributo" };
const estudiante: ColumnaConocida = llave("estudiante", { personal: true, nota: "Código real del estudiante, sin nombre." });

interface Conocimiento {
  grano: string;
  columnas: Record<string, ColumnaConocida>;
}

const FICHA_ESTUDIANTE: Record<string, ColumnaConocida> = {
  codigo: estudiante,
  estado: atributo,
  cod: llave("programa", { nota: "Código del programa." }),
  programa: llave("programa"),
  pensum: atributo,
  jornada: llave("jornada"),
  ubicacion: atributo,
  promedio_acumulado: medida,
  cred_aprobados: medida,
  creditos_matriculados: medida,
  creditos_no_matriculados: medida,
  materias_matriculadas: medida,
  fecha_matricula: atributo,
  paz_y_salvo: atributo,
  grupo_etario: atributo,
  origen: atributo,
};

/** Lo que se sabe de cada conjunto con columnas confirmadas. */
const CONOCIMIENTO: Record<string, Conocimiento> = {
  ma_rendimiento: {
    grano: "Una fila por grupo y corte",
    columnas: {
      codigo: llave("materia", { nota: "Código de la materia." }),
      letra: atributo,
      nombre: llave("materia", { nota: "Nombre de la materia." }),
      plan: atributo,
      programa: llave("departamento", { nota: "El reporte la llama «Programa», pero trae el departamento." }),
      docente: llave("docente"),
      matriculados: medida,
      reprobados: medida,
      pct_reprobados: medida,
      aprobados: medida,
      pct_aprobados: medida,
      no_presenta: medida,
      pct_no_presenta: medida,
      promedio: medida,
    },
  },
  dv_notas: {
    grano: "Una fila por estudiante y materia",
    columnas: {
      codigo_estudiante: estudiante,
      codigo_programa: llave("programa"),
      nombre_programa: llave("programa"),
      codigo_materia: llave("materia"),
      nombre_materia: llave("materia"),
      grupo: atributo,
      p1: medida,
      p2: medida,
      p3: medida,
      nota_acumulada: medida,
      plan: atributo,
    },
  },
  dv_matric: { grano: "Una fila por estudiante matriculado", columnas: FICHA_ESTUDIANTE },
  ms_nuevos: { grano: "Una fila por estudiante nuevo", columnas: FICHA_ESTUDIANTE },
  ms_activos: { grano: "Una fila por estudiante activo", columnas: FICHA_ESTUDIANTE },
  dv_global: {
    grano: "Una fila por estudiante, materia y grupo",
    columnas: { codigo: estudiante, cod_materia: llave("materia"), grupo: atributo, materia: llave("materia"), cod_departamento: llave("departamento"), departamento: llave("departamento"), id_docente: llave("docente") },
  },
  dv_grad: {
    grano: "Una fila por graduado",
    columnas: { codigo: estudiante, programa: llave("programa"), fecha_de_grado: atributo, ceremonia: atributo, modalidad: atributo, nota: medida, cum_laude: atributo, suma_cum_laude: atributo, prueba_saber_pro: medida },
  },
  dv_homol: {
    grano: "Una fila por estudiante con homologación",
    columnas: { codigo: estudiante, programa: llave("programa"), fecha_fin_registro: atributo, fecha_aprobacion: atributo, tipo: atributo, institucion_de_procedencia: atributo, homologaciones: medida },
  },
  dv_cred: {
    grano: "Una fila por estudiante",
    columnas: { codigo: estudiante, estado: atributo, creditos_ubicacion: medida, semestre_ubicacion: medida, creditos_semestre: medida, creditos_promedio: medida, promedio_acumulado: medida, promedio_semestre_ultimo_poligrafo: medida },
  },
  dv_prom: {
    grano: "Una fila por estudiante y periodo de polígrafo",
    columnas: { codigo: estudiante, codigo_programa: llave("programa"), nombre_programa: llave("programa"), pensum: atributo, periodo_poligrafo: llave("periodo"), promedio_semestre: medida, promedio_acumulado_poligrafo: medida },
  },
  dv_cond: {
    grano: "Una fila por estudiante condicional",
    columnas: { codigo: estudiante, condicionalidades: medida, programa: llave("programa"), activo: atributo, activo_financiero: atributo, pfp: atributo },
  },
  dv_deser: {
    grano: "Una fila por estudiante, con una columna por periodo",
    columnas: { estudiante, programa: llave("programa"), periodo: llave("periodo"), pfp: atributo, modalidad: atributo },
  },
  dv_deserpos: {
    grano: "Una fila por estudiante de posgrado, con una columna por periodo",
    columnas: { estudiante, programa: llave("programa"), periodo: llave("periodo"), pfp: atributo, modalidad: atributo },
  },
  ms_posgmat: {
    grano: "Una fila por estudiante de posgrado, materia y grupo",
    columnas: { codigo: estudiante, cod_programa: llave("programa"), programa: llave("programa"), cod_materia: llave("materia"), grupo: atributo, materia: llave("materia") },
  },
  ms_eval: {
    grano: "Una fila por docente",
    columnas: { identificacion: llave("docente"), departamento: llave("departamento"), evaluaciones_aplicadas: medida, promedio_de_los_resultados: medida, clasificacion_del_resultado: atributo },
  },
};

const GRANO_GENERICO: Record<Conjunto["tipo"], string> = {
  hecho: "Una fila por registro del reporte",
  instantanea: "Una fila por elemento del catálogo, a la fecha de la carga",
  catalogo: "Una fila por elemento del catálogo",
};

export function fuenteDe(c: Conjunto): FuenteBI {
  const k = CONOCIMIENTO[c.id];
  return {
    id: c.id,
    nombre: c.nombre,
    sistema: c.sistema,
    grupo: grupoDe(c),
    grano: k?.grano ?? GRANO_GENERICO[c.tipo],
    cargable: cargable(c),
    porCorte: Boolean(c.porCorte),
    columnas: k?.columnas ?? {},
    periodosEnColumnas: c.id === "dv_deser" || c.id === "dv_deserpos",
  };
}

/** Todas las tablas disponibles, no solo las que ya tienen columnas confirmadas. */
export const FUENTES: FuenteBI[] = CONJUNTOS.map(fuenteDe);
export const fuentePorId = (id: string): FuenteBI | undefined => FUENTES.find((f) => f.id === id);

/** Lo que se sabe de una columna: lo confirmado, y si no, lo que sugiere su nombre. */
export function columnaDe(fuente: FuenteBI, columna: string): ColumnaConocida | null {
  const conocida = fuente.columnas[columna];
  if (conocida) return conocida;
  if (fuente.periodosEnColumnas && esColumnaDePeriodo(columna)) return { rol: "medida", nota: "Una columna por periodo: se pivota a filas." };
  const d = dimensionPorNombre(columna);
  return d ? { rol: "llave", dimension: d, personal: DIMENSIONES[d].personal } : null;
}

/** Las dimensiones por las que se puede cruzar una fuente, con la columna que la une. */
export function dimensionesDe(fuente: FuenteBI, columnas: string[] = Object.keys(fuente.columnas)): { dimension: DimensionId; columna: string }[] {
  const salida: { dimension: DimensionId; columna: string }[] = [];
  for (const col of columnas) {
    const c = columnaDe(fuente, col);
    if (c?.dimension && !salida.some((x) => x.dimension === c.dimension)) salida.push({ dimension: c.dimension, columna: col });
  }
  // El periodo y la sede los trae toda carga aunque el archivo no tenga la columna.
  if (!salida.some((x) => x.dimension === "periodo")) salida.push({ dimension: "periodo", columna: "(de la carga)" });
  if (!salida.some((x) => x.dimension === "sede")) salida.push({ dimension: "sede", columna: "(de la carga)" });
  return salida;
}
