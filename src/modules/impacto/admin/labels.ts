/* =============================================================================
   Etiquetas de la ficha técnica: las usan el editor de la ficha y la hoja del
   catálogo, para que las dos digan lo mismo.
   ========================================================================== */

export const UNITS = [
  ["numero", "Número"],
  ["porcentaje", "Porcentaje"],
  ["razon", "Razón"],
  ["puntaje", "Puntaje"],
  ["moneda_cop", "Pesos (COP)"],
  ["horas", "Horas"],
] as const;
export const CALC = [
  ["conteo", "Conteo"],
  ["razon", "Razón"],
  ["puntaje", "Puntaje"],
  ["comparacion", "Comparación"],
  ["texto", "Texto"],
] as const;
export const AGG = [
  ["suma", "Suma"],
  ["razon_de_sumas", "Razón de sumas"],
  ["promedio_ponderado", "Promedio ponderado"],
  ["no_agregable", "No agregable"],
] as const;
export const REPORT = [
  ["programa_sede", "Programa y sede"],
  ["programa", "Programa"],
  ["facultad", "Facultad"],
  ["institucional", "Institución"],
] as const;
export const MODE = [
  ["manual", "Manual"],
  ["precargado", "Precargado"],
  ["encuesta", "Encuesta"],
  ["calculado", "Calculado"],
] as const;
export const DEGREES = [
  ["tecnico", "Técnico profesional"],
  ["tecnologico", "Tecnológico"],
  ["pregrado", "Profesional universitario"],
  ["especializacion", "Especialización"],
  ["especializacion_medicoquirurgica", "Especialización médico-quirúrgica"],
  ["maestria", "Maestría"],
  ["doctorado", "Doctorado"],
] as const;
export const MODALITIES = [
  ["presencial", "Presencial"],
  ["virtual", "Virtual"],
  ["distancia", "A distancia"],
  ["dual", "Dual"],
  ["hibrida", "Híbrida"],
] as const;

export const DIRECTION = [
  ["mayor_mejor", "Mayor es mejor"],
  ["menor_mejor", "Menor es mejor"],
] as const;
export const PERIODICITY = [
  ["semestral", "Semestral"],
  ["anual", "Anual"],
] as const;
export const FACTOR = [
  ["1", "×1"],
  ["100", "×100 (porcentaje)"],
] as const;
