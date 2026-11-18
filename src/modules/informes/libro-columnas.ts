/* =============================================================================
   Libro de Excel del informe · columnas de cada hoja y sus alias.

   Cada sección del informe se vuelve una hoja con estas columnas (tipo de celda: azul claro =
   diligenciar, amarillo = obligatoria, gris = la pone el sistema). Los alias sirven para reconocer
   la hoja de un libro armado por otra persona: se compara cada encabezado con el título de la
   columna y con sus alias. Lógica pura, sin React.
   ========================================================================== */

import { COLUMNAS_LIBRO_RESULTADOS } from "./indicadores-manual";
import { COLUMNAS_LOGROS, COLUMNAS_METAS } from "./excel-secciones";
import type { TipoCelda } from "./ui/excel";
import type { SeccionDef, TipoSeccion } from "./types";

export interface ColumnaLibro {
  titulo: string;
  ancho: number;
  tipo: TipoCelda;
  /** Otros nombres con que alguien puede haber titulado la columna. Sin alias, la columna no cuenta para reconocer la hoja. */
  alias?: string[];
}

/** Sin tildes ni signos, en minúscula y con un solo espacio: para comparar encabezados. */
export const normalizarTexto = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const c = (titulo: string, ancho: number, tipo: TipoCelda, alias?: string[]): ColumnaLibro => ({ titulo, ancho, tipo, ...(alias ? { alias } : {}) });

export const COLUMNA_PALABRAS = "Palabras";

export const COLUMNAS_NARR: ColumnaLibro[] = [
  c("Texto de la sección", 90, "obligatoria", ["texto", "observaciones", "observacion", "notas", "resumen", "conclusiones", "comentarios", "comentario", "contenido", "presentacion", "introduccion"]),
  c(COLUMNA_PALABRAS, 12, "bloqueada"),
];

export const COLUMNAS_LIBRE: ColumnaLibro[] = [c("Texto", 90, "diligenciar", ["texto", "contenido", "observaciones", "notas", "comentarios", "descripcion"]), c(COLUMNA_PALABRAS, 12, "bloqueada")];

export const COLUMNAS_PDI: ColumnaLibro[] = [
  c("Pilar del PDI", 36, "bloqueada", ["pilar"]),
  c("Avance del plan", 16, "bloqueada"),
  c("Articula con su unidad", 22, "obligatoria", ["articula", "vinculado", "aplica"]),
  c("Aporte de la unidad", 70, "diligenciar", ["aporte", "contribucion"]),
];

export const COLUMNAS_METAS_LIBRO: ColumnaLibro[] = [
  c(COLUMNAS_METAS[0], 50, "obligatoria", ["objetivo", "meta"]),
  c(COLUMNAS_METAS[1], 14, "obligatoria", ["programado", "prog", "planeado", "esperado"]),
  c(COLUMNAS_METAS[2], 14, "diligenciar", ["alcanzado", "logrado", "ejecutado"]),
  c("Resultado", 16, "bloqueada"),
];

export const COLUMNAS_CRITERIOS_LIBRO: ColumnaLibro[] = [
  c("Criterio", 42, "obligatoria", ["criterio", "dimension", "area", "eje"]),
  c("¿Reporta aquí?", 18, "obligatoria", ["reporta", "aplica", "participa"]),
  c("Origen", 28, "bloqueada"),
];

const ALIAS_RESULTADOS: Record<string, string[]> = {
  Criterio: ["criterio", "dimension", "area", "eje"],
  Indicador: ["indicador", "cifra o accion", "cifra", "nombre del indicador", "accion"],
  Unidad: ["unidad"],
  "Qué es mejor": ["que es mejor", "mayor es mejor", "sentido"],
  "Año anterior": ["anterior", "ano anterior", "previo"],
  "Cifra actual": ["actual", "valor", "dato", "reportado"],
  Meta: ["meta"],
  Fuente: ["fuente"],
  Nota: ["nota", "explicacion", "explicacion de la unidad", "por que", "analisis", "observacion"],
  Tipo: ["tipo"],
  "Descripción de la acción": ["que es la accion", "descripcion"],
  "Qué se ha hecho": ["que se ha hecho", "avance"],
  Finalización: ["finalizacion", "fecha fin", "cuando termina"],
  "Proyección (texto)": ["proyeccion"],
  "Proyección (número)": ["proyeccion numero"],
  "Pilar del PDI": ["pilar"],
  "N.º de anexos": ["anexos", "anexo", "evidencias"],
};

const OBLIGATORIAS_RESULTADOS = new Set(["Criterio", "Indicador", "Tipo"]);
const ANCHO_RESULTADOS: Record<string, number> = { Criterio: 34, Indicador: 40, Fuente: 30, Nota: 36, "Descripción de la acción": 40, "Qué se ha hecho": 40, "Pilar del PDI": 32, "Proyección (texto)": 28, Finalización: 22 };

export const COLUMNAS_RESULTADOS: ColumnaLibro[] = COLUMNAS_LIBRO_RESULTADOS.map((t) =>
  ALIAS_RESULTADOS[t] ? c(t, ANCHO_RESULTADOS[t] ?? 16, OBLIGATORIAS_RESULTADOS.has(t) ? "obligatoria" : "diligenciar", ALIAS_RESULTADOS[t]) : c(t, 26, "bloqueada"),
);

export const COLUMNAS_LOGROS_LIBRO: ColumnaLibro[] = [
  c(COLUMNAS_LOGROS[0], 40, "obligatoria", ["logro", "titulo", "hito"]),
  c(COLUMNAS_LOGROS[1], 70, "obligatoria", ["contexto", "resultado", "que paso", "descripcion"]),
  c(COLUMNAS_LOGROS[2], 14, "diligenciar", ["anexo", "soporte"]),
];

export const COLUMNAS_EVID_LIBRO: ColumnaLibro[] = [
  c("N.º", 8, "bloqueada", ["n", "no", "numero", "nro", "num"]),
  c("Documento", 40, "obligatoria", ["documento", "archivo", "nombre"]),
  c("Descripción", 50, "obligatoria", ["descripcion", "para que sirve", "que respalda"]),
  c("Enlace", 44, "diligenciar", ["enlace", "link", "url", "vinculo"]),
];

export const COLUMNAS_MATRIZ_LIBRO: ColumnaLibro[] = [c("Criterio", 40, "bloqueada"), c("Cifras reportadas", 18, "bloqueada"), c("Sin dato", 12, "bloqueada"), c("Lectura", 60, "bloqueada")];
export const COLUMNAS_ANEXOS_LIBRO: ColumnaLibro[] = [c("N.º", 8, "bloqueada"), c("Documento", 50, "bloqueada"), c("Origen", 24, "bloqueada")];

const ALIAS_FILAS: Record<string, string[]> = {
  Dimensión: ["dimension", "area", "eje", "criterio"],
  "Punto crítico": ["punto critico", "problema", "dificultad", "debilidad"],
  Acción: ["accion", "que haremos", "plan de mejora", "actividad", "propuesta"],
  Tiempo: ["tiempo", "cuando", "fecha", "plazo"],
  Recursos: ["recursos", "presupuesto", "costo"],
  Reto: ["reto", "desafio", "problema"],
  Aprendizaje: ["aprendizaje", "leccion"],
  Oportunidad: ["oportunidad"],
  Propuesta: ["propuesta", "que haremos", "accion"],
};
const OPCIONALES_FILAS = new Set(["recursos", "aprendizaje", "oportunidad"]);

export function columnasDeFilas(columnas: string[]): ColumnaLibro[] {
  return columnas.map((t) => c(t, 34, OPCIONALES_FILAS.has(normalizarTexto(t)) ? "diligenciar" : "obligatoria", ALIAS_FILAS[t] ?? [normalizarTexto(t)]));
}

/** Palabras del nombre de la hoja que refuerzan el destino (como «Notas» para un texto). */
export const PALABRAS_CLAVE: Record<TipoSeccion | "crit", string[]> = {
  narr: ["resumen", "conclusion", "notas", "cierre", "presentacion", "introduccion"],
  pdi: ["pdi", "alineacion", "pilar"],
  metas: ["meta", "objetivo"],
  crit: ["criterio"],
  dim: ["resultado", "cifra", "indicador", "criterio"],
  matriz: [],
  filas: ["critic", "problema", "accion", "reto", "oportunidad"],
  logros: ["logro", "mejor", "destacad"],
  evid: ["evidencia", "soporte", "fuente", "anexo"],
  anexos: [],
  libre: ["texto", "libre"],
};

/** Las columnas de la hoja de una sección (matriz y anexos se calculan: son solo referencia). */
export function columnasDeSeccion(def: SeccionDef): ColumnaLibro[] {
  switch (def.tipo) {
    case "narr":
      return COLUMNAS_NARR;
    case "libre":
      return COLUMNAS_LIBRE;
    case "pdi":
      return COLUMNAS_PDI;
    case "metas":
      return COLUMNAS_METAS_LIBRO;
    case "dim":
      return COLUMNAS_RESULTADOS;
    case "matriz":
      return COLUMNAS_MATRIZ_LIBRO;
    case "filas":
      return columnasDeFilas(def.columnas ?? []);
    case "logros":
      return COLUMNAS_LOGROS_LIBRO;
    case "evid":
      return COLUMNAS_EVID_LIBRO;
    case "anexos":
      return COLUMNAS_ANEXOS_LIBRO;
  }
}

/** ¿La sección se calcula o es solo referencia (no se importa)? */
export const esSoloReferencia = (def: SeccionDef): boolean => def.tipo === "matriz" || def.tipo === "anexos";
