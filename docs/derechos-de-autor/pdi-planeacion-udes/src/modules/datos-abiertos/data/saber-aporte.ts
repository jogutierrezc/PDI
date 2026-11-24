/* =============================================================================
   Aporte de los programas (valor agregado académico).

   Cifras de dos documentos de la Universidad de Santander que estiman, con un
   modelo jerárquico, cuántos puntos de la prueba de salida suma cada programa
   una vez descontado el resultado con que llegaron sus estudiantes a Saber 11:

   · Saber PRO: Documento de Analítica Académica N.º 30 (versión 2). Campus
     Bucaramanga y la extensión de Instrumentación Quirúrgica en Bogotá,
     Saber PRO 2023-2024, 25 programas.
   · Saber TyT: Documento de Trabajo N.º 21 (versión 1, 19 de octubre de 2026).
     UDESTEC, Campus Bucaramanga, 8 programas (13 en inglés).

   Los datos viven en este archivo del repositorio, sin tabla en Supabase.

   LECTURA DE FIGURA. Los documentos no publican la tabla de efectos:
   · Saber PRO: los intervalos de confianza se midieron sobre las Figs. 9 a 12
     (pp. 22 a 25), con un margen de ±0,1 punto. El documento no declara el
     nivel del intervalo.
   · Saber TyT: el intervalo de 95 % se calculó como el aporte ±1,96 veces el
     error estándar medido en las barras del anexo (Figs. C1 a C4, pp. 14 a 16;
     las barras son ±1 error estándar), con un margen de ±0,1 punto.
   Cuando los autores entreguen la salida de R, este archivo se reemplaza.

   LOS DOCUMENTOS SE CONTRADICEN en puntos concretos y aquí se deja constancia:
   · Saber PRO: el texto (p. 9) dice que 48 % (lectura crítica) y 55 %
     (razonamiento cuantitativo) mantuvo o mejoró por encima de lo esperado;
     la Figura 5 (p. 10) da 55 % y 48 %. Se usa la figura.
   · Saber TyT, inglés: la Tabla 5 (p. 8) dice 410 estudiantes; la Figura 1
     (p. 10) dice 1.081 en 13 programas. Se usa la figura, porque es la que
     coincide con la lista de programas.
   Hay que confirmarlo con los autores.

   Solo cuatro competencias tienen modelo (lectura crítica, razonamiento
   cuantitativo, competencias ciudadanas e inglés). Puntaje global y
   comunicación escrita no se calculan: la pantalla dice «sin modelo», nunca
   un cero.
   ========================================================================== */

export type AporteTest = "pro" | "tyt";
export type AporteComp = "lc" | "rc" | "cc" | "ing";
/** [programa, evaluados, aporte, extremo inferior, extremo superior], en puntos de la prueba. */
export type AporteRow = readonly [string, number, number, number, number];

export interface AporteCompInfo {
  key: AporteComp | "pg" | "ce";
  code: string;
  label: string;
  /** false: el estudio no calcula aporte para esta competencia. */
  modeled: boolean;
}

/** Las seis competencias de Saber PRO, en el orden del tablero. Dos no tienen modelo. */
export const APORTE_COMPS: AporteCompInfo[] = [
  { key: "pg", code: "PG", label: "Puntaje global", modeled: false },
  { key: "lc", code: "LC", label: "Lectura crítica", modeled: true },
  { key: "rc", code: "RC", label: "Razonamiento cuantitativo", modeled: true },
  { key: "cc", code: "CC", label: "Competencias ciudadanas", modeled: true },
  { key: "ce", code: "CE", label: "Comunicación escrita", modeled: false },
  { key: "ing", code: "IN", label: "Inglés", modeled: true },
];

/** Competencias con modelo, en el orden del boletín. */
export const APORTE_MODELED: AporteComp[] = ["lc", "rc", "cc", "ing"];

export const aporteCompLabel = (key: string) => APORTE_COMPS.find((c) => c.key === key)?.label ?? key;
export const isAporteComp = (key: string | null | undefined): key is AporteComp => APORTE_MODELED.includes(key as AporteComp);

/* --- Aporte por programa (lectura de figura) ------------------------------------------ */

export const PRO_VA: Record<AporteComp, AporteRow[]> = {
  lc: [
    ["Medicina Veterinaria", 47, 9.42, 6.74, 12.05],
    ["Psicología", 35, 9.17, 6.17, 12.12],
    ["Instrumentación Quirúrgica · Bogotá", 49, 5.48, 2.87, 8.11],
    ["Fisioterapia", 78, 4.66, 2.53, 6.78],
    ["Microbiología Industrial", 33, 4.43, 1.4, 7.5],
    ["Terapia", 34, 4.38, 1.4, 7.42],
    ["Medicina", 220, 3.82, 2.53, 5.15],
    ["Derecho", 54, 3.7, 1.21, 6.21],
    ["Fonoaudiología", 49, 3.44, 0.83, 6.1],
    ["Bacteriología", 61, 2.86, 0.49, 5.22],
    ["Geología", 17, 2.16, -1.71, 6.02],
    ["Administración de Negocios", 28, 0.32, -2.96, 3.56],
    ["Mercadeo", 35, 0.14, -2.81, 3.1],
    ["Ingeniería de Software", 15, -0.18, -4.18, 3.82],
    ["Enfermería", 53, -0.92, -3.46, 1.59],
    ["Instrumentación Quirúrgica", 120, -1.31, -3.04, 0.45],
    ["Antropología", 9, -2.3, -6.91, 2.31],
    ["Ingeniería Ambiental", 13, -2.45, -6.64, 1.74],
    ["Ingeniería Agroindustrial", 11, -2.66, -7.06, 1.74],
    ["Ingeniería Industrial", 31, -3.2, -6.34, -0.05],
    ["Comunicación Social", 9, -5.07, -9.67, -0.46],
    ["Contaduría Pública", 52, -6.1, -8.69, -3.57],
    ["Administración Financiera", 29, -6.42, -9.67, -3.19],
    ["Ingeniería Civil", 91, -7.8, -9.79, -5.81],
    ["Ingeniería Petroquímica", 11, -15.56, -19.95, -11.15],
  ],
  rc: [
    ["Ingeniería Civil", 91, 4.77, 3.03, 6.5],
    ["Ingeniería Industrial", 31, 3.06, 0.73, 5.38],
    ["Geología", 17, 2.03, -0.54, 4.6],
    ["Medicina Veterinaria", 47, 1.77, -0.33, 3.89],
    ["Fisioterapia", 78, 1.75, -0.08, 3.57],
    ["Microbiología Industrial", 33, 1.32, -0.97, 3.61],
    ["Administración de Negocios", 28, 1.3, -1.08, 3.68],
    ["Bacteriología", 61, 1.2, -0.77, 3.17],
    ["Ingeniería Ambiental", 13, 0.95, -1.72, 3.62],
    ["Ingeniería Agroindustrial", 11, 0.78, -1.92, 3.5],
    ["Medicina", 220, 0.59, -0.64, 1.83],
    ["Ingeniería Petroquímica", 11, 0.58, -2.12, 3.29],
    ["Administración Financiera", 29, 0, -2.37, 2.35],
    ["Ingeniería de Software", 15, -0.19, -2.82, 2.42],
    ["Contaduría Pública", 52, -0.2, -2.26, 1.86],
    ["Terapia", 34, -0.3, -2.57, 1.99],
    ["Psicología", 35, -1.15, -3.42, 1.12],
    ["Comunicación Social", 9, -1.34, -4.12, 1.43],
    ["Antropología", 9, -1.36, -4.13, 1.4],
    ["Instrumentación Quirúrgica · Bogotá", 49, -1.38, -3.46, 0.71],
    ["Mercadeo", 35, -1.47, -3.73, 0.82],
    ["Enfermería", 53, -2, -4.05, 0.07],
    ["Fonoaudiología", 49, -2.65, -4.75, -0.55],
    ["Instrumentación Quirúrgica", 120, -3.76, -5.35, -2.19],
    ["Derecho", 54, -4.3, -6.34, -2.26],
  ],
  ing: [
    ["Psicología", 35, 5.23, 2.7, 7.74],
    ["Administración de Negocios", 28, 5.02, 2.36, 7.68],
    ["Ingeniería de Software", 15, 3.79, 0.75, 6.83],
    ["Antropología", 9, 3.26, -0.04, 6.55],
    ["Mercadeo", 34, 2.49, -0.04, 5.05],
    ["Fisioterapia", 77, 1.7, -0.25, 3.64],
    ["Ingeniería Petroquímica", 11, 1.64, -1.58, 4.84],
    ["Medicina Veterinaria", 47, 1.51, -0.78, 3.81],
    ["Bacteriología", 60, 1.5, -0.61, 3.64],
    ["Geología", 17, 1.15, -1.85, 4.13],
    ["Fonoaudiología", 49, 0.79, -1.47, 3.06],
    ["Instrumentación Quirúrgica · Bogotá", 48, 0.14, -2.13, 2.4],
    ["Ingeniería Industrial", 31, -0.37, -2.99, 2.25],
    ["Ingeniería Agroindustrial", 11, -0.79, -4.01, 2.42],
    ["Comunicación Social", 9, -0.93, -4.23, 2.38],
    ["Ingeniería Ambiental", 13, -0.96, -4.08, 2.17],
    ["Microbiología Industrial", 32, -1.01, -3.61, 1.57],
    ["Enfermería", 51, -1.22, -3.48, 1.05],
    ["Terapia", 34, -1.88, -4.42, 0.67],
    ["Instrumentación Quirúrgica", 120, -2.03, -3.67, -0.4],
    ["Contaduría Pública", 52, -2.06, -4.29, 0.2],
    ["Medicina", 220, -2.53, -3.82, -1.25],
    ["Administración Financiera", 29, -2.83, -5.49, -0.19],
    ["Derecho", 54, -4.92, -7.13, -2.73],
    ["Ingeniería Civil", 91, -6.72, -8.54, -4.89],
  ],
  cc: [
    ["Bacteriología", 61, 11.09, 8.4, 13.86],
    ["Psicología", 35, 10.19, 6.76, 13.59],
    ["Derecho", 54, 9.83, 6.95, 12.72],
    ["Fisioterapia", 78, 9.75, 7.29, 12.23],
    ["Medicina", 220, 5.58, 4.07, 7.07],
    ["Microbiología Industrial", 33, 4.72, 1.19, 8.21],
    ["Instrumentación Quirúrgica · Bogotá", 49, 3.19, 0.2, 6.19],
    ["Medicina Veterinaria", 47, 2.83, -0.26, 5.89],
    ["Ingeniería Agroindustrial", 11, 2.5, -2.53, 7.48],
    ["Terapia", 34, 1.33, -2.15, 4.79],
    ["Instrumentación Quirúrgica", 120, 0.09, -1.93, 2.1],
    ["Ingeniería Industrial", 31, -0.1, -3.75, 3.5],
    ["Fonoaudiología", 49, -0.5, -3.48, 2.55],
    ["Enfermería", 53, -0.67, -3.6, 2.25],
    ["Ingeniería Ambiental", 13, -0.87, -5.64, 3.92],
    ["Antropología", 9, -2.79, -8.03, 2.48],
    ["Comunicación Social", 9, -3.42, -8.68, 1.83],
    ["Ingeniería Civil", 91, -3.64, -5.95, -1.36],
    ["Administración de Negocios", 28, -3.64, -7.39, 0.09],
    ["Administración Financiera", 29, -4.67, -8.34, -0.98],
    ["Geología", 17, -4.84, -9.25, -0.41],
    ["Ingeniería de Software", 15, -5.89, -10.5, -1.28],
    ["Contaduría Pública", 52, -7.28, -10.2, -4.35],
    ["Mercadeo", 35, -9.7, -13.12, -6.25],
    ["Ingeniería Petroquímica", 11, -13.06, -18.05, -8.07],
  ],
};

export const PRO_CUADRANTES: Record<AporteComp, Record<string, [number, number, number, number]>> = {
  lc: {
    "Administración Financiera": [41.4, 17.2, 41.4, 0],
    "Administración de Negocios": [35.7, 10.7, 50, 3.6],
    "Antropología": [44.4, 11.1, 44.4, 0],
    "Bacteriología": [32.8, 3.3, 60.7, 3.3],
    "Comunicación Social": [44.4, 33.3, 22.2, 0],
    "Contaduría Pública": [51.9, 9.6, 36.5, 1.9],
    "Derecho": [33.3, 11.1, 53.7, 1.9],
    "Enfermería": [39.6, 22.6, 37.7, 0],
    "Fisioterapia": [34.6, 19.2, 43.6, 2.6],
    "Fonoaudiología": [28.6, 20.4, 51, 0],
    "Geología": [29.4, 0, 70.6, 0],
    "Ingeniería Agroindustrial": [54.5, 0, 45.5, 0],
    "Ingeniería Ambiental": [61.5, 0, 38.5, 0],
    "Ingeniería Civil": [46.2, 13.2, 40.7, 0],
    "Ingeniería Industrial": [38.7, 12.9, 45.2, 3.2],
    "Ingeniería Petroquímica": [54.5, 9.1, 36.4, 0],
    "Ingeniería de Software": [33.3, 6.7, 60, 0],
    "Instrumentación Quirúrgica": [39.2, 18.3, 40, 2.5],
    "Instrumentación Quirúrgica · Bogotá": [20.4, 28.6, 46.9, 4.1],
    "Medicina": [20.9, 0.5, 77.7, 0.9],
    "Mercadeo": [28.6, 2.9, 68.6, 0],
    "Microbiología Industrial": [30.3, 6.1, 63.6, 0],
    "Psicología": [25.7, 8.6, 57.1, 8.6],
    "Terapia": [32.4, 20.6, 41.2, 5.9],
    "Medicina Veterinaria": [23.4, 14.9, 55.3, 6.4],
  },
  rc: {
    "Administración Financiera": [37.9, 17.2, 44.8, 0],
    "Administración de Negocios": [28.6, 10.7, 60.7, 0],
    "Antropología": [33.3, 33.3, 33.3, 0],
    "Bacteriología": [36.1, 8.2, 55.7, 0],
    "Comunicación Social": [55.6, 22.2, 22.2, 0],
    "Contaduría Pública": [36.5, 15.4, 46.2, 1.9],
    "Derecho": [46.3, 22.2, 25.9, 5.6],
    "Enfermería": [41.5, 39.6, 17, 1.9],
    "Fisioterapia": [35.9, 25.6, 38.5, 0],
    "Fonoaudiología": [40.8, 32.7, 26.5, 0],
    "Geología": [17.6, 0, 76.5, 5.9],
    "Ingeniería Agroindustrial": [27.3, 9.1, 54.5, 9.1],
    "Ingeniería Ambiental": [38.5, 0, 53.8, 7.7],
    "Ingeniería Civil": [23.1, 7.7, 65.9, 3.3],
    "Ingeniería Industrial": [16.1, 6.5, 77.4, 0],
    "Ingeniería Petroquímica": [36.4, 9.1, 45.5, 9.1],
    "Ingeniería de Software": [20, 13.3, 66.7, 0],
    "Instrumentación Quirúrgica": [51.7, 24.2, 24.2, 0],
    "Instrumentación Quirúrgica · Bogotá": [34.7, 44.9, 18.4, 2],
    "Medicina": [29.1, 2.7, 67.7, 0.5],
    "Mercadeo": [42.9, 14.3, 42.9, 0],
    "Microbiología Industrial": [36.4, 9.1, 48.5, 6.1],
    "Psicología": [42.9, 20, 31.4, 5.7],
    "Terapia": [32.4, 32.4, 35.3, 0],
    "Medicina Veterinaria": [38.3, 25.5, 36.2, 0],
  },
  ing: {
    "Administración Financiera": [27.6, 24.1, 37.9, 10.3],
    "Administración de Negocios": [0, 7.1, 89.3, 3.6],
    "Antropología": [11.1, 11.1, 77.8, 0],
    "Bacteriología": [21.7, 13.3, 60, 5],
    "Comunicación Social": [22.2, 11.1, 55.6, 11.1],
    "Contaduría Pública": [13.5, 26.9, 50, 9.6],
    "Derecho": [31.5, 20.4, 42.6, 5.6],
    "Enfermería": [25.5, 33.3, 35.3, 5.9],
    "Fisioterapia": [24.7, 23.4, 45.5, 6.5],
    "Fonoaudiología": [16.3, 26.5, 49, 8.2],
    "Geología": [17.6, 5.9, 70.6, 5.9],
    "Ingeniería Agroindustrial": [27.3, 18.2, 54.5, 0],
    "Ingeniería Ambiental": [38.5, 7.7, 53.8, 0],
    "Ingeniería Civil": [18.7, 26.4, 49.5, 5.5],
    "Ingeniería Industrial": [3.2, 12.9, 80.6, 3.2],
    "Ingeniería Petroquímica": [9.1, 9.1, 45.5, 36.4],
    "Ingeniería de Software": [13.3, 0, 86.7, 0],
    "Instrumentación Quirúrgica": [25, 23.3, 45.8, 5.8],
    "Instrumentación Quirúrgica · Bogotá": [12.5, 41.7, 39.6, 6.2],
    "Medicina": [21.8, 5.9, 71.4, 0.9],
    "Mercadeo": [17.6, 5.9, 70.6, 5.9],
    "Microbiología Industrial": [21.9, 6.2, 68.8, 3.1],
    "Psicología": [11.4, 14.3, 68.6, 5.7],
    "Terapia": [29.4, 35.3, 35.3, 0],
    "Medicina Veterinaria": [25.5, 17, 53.2, 4.3],
  },
  cc: {
    "Administración Financiera": [37.9, 27.6, 34.5, 0],
    "Administración de Negocios": [42.9, 17.9, 39.3, 0],
    "Antropología": [22.2, 22.2, 55.6, 0],
    "Bacteriología": [34.4, 4.9, 55.7, 4.9],
    "Comunicación Social": [22.2, 44.4, 33.3, 0],
    "Contaduría Pública": [46.2, 25, 26.9, 1.9],
    "Derecho": [22.2, 20.4, 42.6, 14.8],
    "Enfermería": [26.4, 45.3, 24.5, 3.8],
    "Fisioterapia": [33.3, 28.2, 33.3, 5.1],
    "Fonoaudiología": [42.9, 32.7, 24.5, 0],
    "Geología": [41.2, 17.6, 41.2, 0],
    "Ingeniería Agroindustrial": [54.5, 9.1, 36.4, 0],
    "Ingeniería Ambiental": [38.5, 15.4, 30.8, 15.4],
    "Ingeniería Civil": [31.9, 25.3, 41.8, 1.1],
    "Ingeniería Industrial": [35.5, 16.1, 48.4, 0],
    "Ingeniería Petroquímica": [72.7, 9.1, 18.2, 0],
    "Ingeniería de Software": [33.3, 33.3, 33.3, 0],
    "Instrumentación Quirúrgica": [34.2, 30.8, 31.7, 3.3],
    "Instrumentación Quirúrgica · Bogotá": [32.7, 36.7, 28.6, 2],
    "Medicina": [34.1, 1.8, 63.6, 0.5],
    "Mercadeo": [37.1, 11.4, 51.4, 0],
    "Microbiología Industrial": [24.2, 15.2, 60.6, 0],
    "Psicología": [25.7, 22.9, 48.6, 2.9],
    "Terapia": [32.4, 38.2, 29.4, 0],
    "Medicina Veterinaria": [40.4, 19.1, 38.3, 2.1],
  },
};

export const TYT_VA: Record<AporteComp, AporteRow[]> = {
  lc: [
    ["Comunicación Gráfica", 28, 3.16, -0.88, 7.2],
    ["Diseño Gráfico Publicitario", 125, 2.82, -0.47, 6.11],
    ["Producción Gráfica Publicitaria", 32, 1.24, -3.37, 5.85],
    ["Gestión de Mercadotecnia", 18, 0.68, -3.73, 5.09],
    ["Desarrollo de Aplicaciones Web", 8, -0.41, -6.43, 5.61],
    ["Gestión Industrial", 58, -2.07, -6.52, 2.38],
    ["Supervisión de Obras Civiles", 120, -2.18, -6.75, 2.39],
    ["Gestión Administrativa", 22, -3.24, -8.77, 2.29],
  ],
  rc: [
    ["Supervisión de Obras Civiles", 120, 7.91, 4.09, 11.73],
    ["Gestión Industrial", 58, 3.7, 0.11, 7.29],
    ["Desarrollo de Aplicaciones Web", 8, 0.78, -5.69, 7.25],
    ["Comunicación Gráfica", 28, -0.91, -6.14, 4.32],
    ["Gestión Administrativa", 22, -2.63, -8.24, 2.98],
    ["Diseño Gráfico Publicitario", 125, -2.8, -7.13, 1.53],
    ["Producción Gráfica Publicitaria", 32, -2.85, -8.08, 2.38],
    ["Gestión de Mercadotecnia", 18, -3.21, -8.46, 2.04],
  ],
  ing: [
    ["Diseño Gráfico Publicitario", 291, 4.91, 2.13, 7.69],
    ["Gestión Financiera y de Sistemas", 9, 1.58, -2.38, 5.54],
    ["Producción Gráfica Publicitaria", 36, 1.18, -1.82, 4.18],
    ["Mercadotecnia y Publicidad", 38, 0.79, -2.66, 4.24],
    ["Comunicación Gráfica", 30, 0.25, -2.71, 3.21],
    ["Tecnología Industrial", 83, 0.05, -2.75, 2.85],
    ["Sistemas", 1, -0.09, -4.68, 4.5],
    ["Gestión de Mercadotecnia", 43, -0.16, -3.94, 3.62],
    ["Producción", 1, -0.5, -4.22, 3.22],
    ["Gestión Administrativa", 56, -0.79, -4.46, 2.88],
    ["Desarrollo de Aplicaciones Web", 11, -1.91, -6.3, 2.48],
    ["Gestión Industrial", 160, -2.55, -4.98, -0.12],
    ["Supervisión de Obras Civiles", 354, -2.76, -4.94, -0.58],
  ],
  cc: [
    ["Diseño Gráfico Publicitario", 125, 0.07, -0.6, 0.74],
    ["Gestión Industrial", 58, 0.05, -0.6, 0.7],
    ["Gestión de Mercadotecnia", 18, 0.02, -0.61, 0.65],
    ["Comunicación Gráfica", 28, 0.01, -0.62, 0.64],
    ["Gestión Administrativa", 22, -0.02, -0.65, 0.61],
    ["Desarrollo de Aplicaciones Web", 8, -0.03, -0.66, 0.6],
    ["Producción Gráfica Publicitaria", 32, -0.03, -0.66, 0.6],
    ["Supervisión de Obras Civiles", 120, -0.06, -0.69, 0.57],
  ],
};

export const TYT_DE: Record<AporteComp, number> = {"lc":22.63,"rc":22.57,"ing":24.71,"cc":27.08};

/* --- Varianza: [σ² dentro del programa, τ00 entre programas] ------------------------ */

export type VarPair = readonly [number, number];
type VarSet = Record<AporteComp, VarPair>;

export const VAR_PRO: { nulo: VarSet; final: VarSet; y23: VarSet; y24: VarSet } = {
  nulo: { lc: [610.48, 50.88], rc: [625.46, 88.32], ing: [575.88, 54.65], cc: [786.99, 48.86] }, // Tabla 4, p. 20
  final: { lc: [405.68, 40.46], rc: [410.76, 9.25], ing: [402.5, 14.48], cc: [546.13, 51.29] }, // Tabla 5, p. 20
  y23: { lc: [399.3, 42.59], rc: [403.51, 12.84], ing: [415.43, 7.77], cc: [551.66, 39.75] }, // Tabla 6, p. 25
  y24: { lc: [380.55, 34.44], rc: [436.19, 5.18], ing: [362.16, 36.04], cc: [513.51, 50.6] }, // Tabla 7, p. 31
};

export const VAR_TYT: { nulo: VarSet; final: VarSet; p: Record<AporteComp, string> } = {
  nulo: { lc: [495.51, 19.48], rc: [475.55, 22.95], ing: [561.04, 40.16], cc: [731.17, 0.37] }, // Tabla 6, p. 9
  final: { lc: [369.77, 10.07], rc: [323.79, 20.77], ing: [403.46, 8.41], cc: [538.49, 0.14] },
  p: { lc: "p = 0,023", rc: "p < 0,001", ing: "p < 0,001", cc: "p = 0,50" },
};

/** Parte de la variación que está entre programas (correlación intraclase), en %. */
export const icc = (pair: VarPair) => (pair[1] / (pair[0] + pair[1])) * 100;

/** Estudiantes en cada modelo. Saber PRO: Tabla 5, p. 20. Saber TyT: Resumen p. 3 y Fig. 1, p. 10. */
export const APORTE_NOBS: Record<AporteTest, Record<AporteComp, number>> = {
  pro: { lc: 1184, rc: 1184, ing: 1178, cc: 1184 },
  tyt: { lc: 411, rc: 411, ing: 1081, cc: 411 },
};

export const APORTE_NPROG: Record<AporteTest, Record<AporteComp, number>> = {
  pro: { lc: 25, rc: 25, cc: 25, ing: 25 },
  tyt: { lc: 8, rc: 8, ing: 13, cc: 8 },
};

/** Figura 5, p. 10: reparto de los evaluados en AA−, AA−−, AA+ y AA++ (%). */
export const FIG5: Record<AporteComp, readonly [number, number, number, number]> = {
  lc: [33, 12, 53, 2],
  rc: [36, 17, 46, 2],
  ing: [21, 18, 56, 5],
  cc: [34, 21, 42, 2],
};

/** Tabla 3, p. 12: % de evaluados con variación positiva en 0, 1, 2, 3 y 4 competencias. */
export const NCOMP = [11, 21, 29, 27, 12] as const;

export const QUAD_NAMES = ["AA−", "AA−−", "AA+", "AA++"] as const;
export const QUAD_DEFS = [
  "Entró sobre 50 en Saber 11 y salió bajo 150 en Saber PRO",
  "Entró bajo 50 y salió bajo 150",
  "Entró sobre 50 y salió sobre 150",
  "Entró bajo 50 y salió sobre 150",
] as const;

/* --- Coeficientes: [término, referencia, estimador, error estándar] ----------------- */

export type CoefRow = readonly [string, string, number, number];

/** Tabla 5, p. 20: estimador y error estándar, en puntos de Saber PRO. */
export const COEF_PRO: Record<AporteComp, CoefRow[]> = {
  lc: [
    ["Promedio en la UDES: bajo", "frente a promedio alto", -12.58, 3.03],
    ["Promedio en la UDES: medio", "frente a promedio alto", -9.0, 2.0],
    ["Promedio en la UDES: medio alto", "frente a promedio alto", -4.47, 1.66],
  ],
  rc: [
    ["Promedio en la UDES: bajo", "frente a promedio alto", -9.2, 2.94],
    ["Promedio en la UDES: medio", "frente a promedio alto", -5.94, 1.91],
    ["Promedio en la UDES: medio alto", "frente a promedio alto", -2.75, 1.61],
    ["Hombres", "frente a mujeres", 4.85, 1.31],
    ["Colegio público", "frente a colegio privado", 4.26, 1.23],
  ],
  ing: [
    ["Promedio en la UDES: bajo", "frente a promedio alto", -7.08, 2.97],
    ["Promedio en la UDES: medio", "frente a promedio alto", -10.13, 1.94],
    ["Promedio en la UDES: medio alto", "frente a promedio alto", -5.28, 1.62],
    ["Colegio público", "frente a colegio privado", -8.25, 1.28],
    ["Estrato bajo", "referencia no declarada", -13.7, 2.85],
    ["Estrato medio", "referencia no declarada", -7.72, 2.73],
    ["Apoyo PAIPE individual", "frente a quien no lo recibió", -3.16, 1.36],
  ],
  cc: [
    ["Promedio en la UDES: bajo", "frente a promedio alto", -15.26, 3.51],
    ["Promedio en la UDES: medio", "frente a promedio alto", -14.33, 2.31],
    ["Promedio en la UDES: medio alto", "frente a promedio alto", -6.5, 1.92],
    ["Apoyo PAIPE individual", "frente a quien no lo recibió", -3.96, 1.63],
  ],
};

/** Tabla 5, p. 8: puntos de Saber TyT por punto de Saber 11. */
export const COEF_TYT: Record<AporteComp, CoefRow[]> = {
  lc: [
    ["Lectura crítica, Saber 11", "", 0.56, 0.15],
    ["Sociales y ciudadanas, Saber 11", "", 0.32, 0.16],
    ["Ciencias naturales, Saber 11", "", 0.66, 0.15],
  ],
  rc: [
    ["Matemáticas, Saber 11", "", 0.78, 0.13],
    ["Ciencias naturales, Saber 11", "", 0.73, 0.14],
  ],
  ing: [
    ["Lectura crítica, Saber 11", "", 0.45, 0.16],
    ["Inglés, Saber 11", "", 1.17, 0.07],
    ["Sociales y ciudadanas, Saber 11", "", 0.42, 0.16],
    ["Ciencias naturales, Saber 11", "", 0.67, 0.16],
  ],
  cc: [
    ["Lectura crítica, Saber 11", "", 0.43, 0.18],
    ["Sociales y ciudadanas, Saber 11", "", 0.92, 0.19],
    ["Ciencias naturales, Saber 11", "", 0.49, 0.18],
  ],
};

/** Los términos de los coeficientes, en el orden de las tablas de método. */
export const COEF_PRO_LABELS = [
  "Promedio en la UDES: bajo",
  "Promedio en la UDES: medio",
  "Promedio en la UDES: medio alto",
  "Hombres",
  "Colegio público",
  "Estrato bajo",
  "Estrato medio",
  "Apoyo PAIPE individual",
];
export const COEF_TYT_LABELS = [
  "Lectura crítica, Saber 11",
  "Matemáticas, Saber 11",
  "Inglés, Saber 11",
  "Sociales y ciudadanas, Saber 11",
  "Ciencias naturales, Saber 11",
];

/* --- Ficha de cada prueba ------------------------------------------------------------ */

export interface AporteTestInfo {
  label: string;
  /** Dominio del eje del bosque, en puntos. */
  dom: readonly [number, number];
  step: number;
  pop: string;
  cut: string;
  office: string;
  scale: string;
  ci: string;
  ciShort: string;
  /** Cómo se obtuvo el intervalo, para la nota al pie. */
  ciNote: string;
  src: string;
  doi: string;
  authors: string;
  /** Orden inicial del bosque. */
  defSort: "aporte" | "n";
  /** Qué se anota en la columna de origen del CSV. */
  origin: string;
  pages: string;
  data: Record<AporteComp, AporteRow[]>;
}

export const APORTE_TESTS: Record<AporteTest, AporteTestInfo> = {
  pro: {
    label: "Saber PRO",
    dom: [-20, 15],
    step: 5,
    pop: "Campus Bucaramanga y programa de extensión de Bogotá",
    cut: "Saber PRO 2023-2024",
    office: "Vicerrectoría de Enseñanza · Dirección de Analítica Académica",
    scale: "Escala 0 a 300 puntos",
    ci: "Intervalo de confianza (el documento no declara su nivel).",
    ciShort: "intervalo de confianza",
    ciNote: "Los intervalos se midieron sobre el gráfico del documento, con un margen de ±0,1 punto.",
    src: "Documento de Analítica Académica UDES N.º 30, Figs. 9 a 12 (pp. 22 a 25) y Tabla 2 (p. 11)",
    doi: "10.5281/zenodo.17661929",
    authors: "Pérez Pulido, León, Mejía Ardila y Pinto Guarguatí (2025)",
    defSort: "aporte",
    origin: "lectura de figura",
    pages: "22-25",
    data: PRO_VA,
  },
  tyt: {
    label: "Saber TyT",
    dom: [-15, 15],
    step: 5,
    pop: "UDESTEC · Campus Bucaramanga",
    cut: "Saber TyT, aplicaciones 2016-1 a 2024-3",
    office: "Planeación Institucional",
    scale: "Escala 0 a 200 puntos",
    ci: "Intervalo de 95 %.",
    ciShort: "intervalo de 95 %",
    ciNote: "Los intervalos se calculan como el aporte ±1,96 veces el error estándar medido en las barras del anexo, con un margen de ±0,1 punto.",
    src: "Documento de trabajo N.º 21, Figs. C1 a C4 (pp. 14 a 16) y Fig. 1 (p. 10)",
    doi: "10.5281/zenodo.23500324",
    authors: "Pérez Pulido, León, Pinto Guarguatí y Calderón Plata (2026)",
    defSort: "n",
    origin: "lectura de figura",
    pages: "14-16",
    data: TYT_VA,
  },
};

export interface AporteCita {
  authors: string;
  year: string;
  title: string;
  rest: string;
  doi: string;
  note: string;
}

export const APORTE_CITA: Record<AporteTest, AporteCita> = {
  pro: {
    authors: "Pérez Pulido, M. O., León, F. J., Mejía Ardila, O. C., y Pinto Guarguatí, L. A.",
    year: "2025",
    title: "Valor agregado académico como estrategia institucional de seguimiento y mejora del aprendizaje: estudio en la Universidad de Santander, Campus Bucaramanga, Saber Pro 2023-2024",
    rest: "(Documento de Analítica Académica UDES N.º 30, versión 2). Vicerrectoría de Enseñanza, Dirección de Analítica Académica, Universidad de Santander.",
    doi: "10.5281/zenodo.17661929",
    note: "Aprobó: Dr. José Asthul Rangel Chacón, Vicerrector de Enseñanza. Licencia: el documento no la declara. El documento no trae «cómo citar»: la referencia se armó en formato APA con sus datos.",
  },
  tyt: {
    authors: "Pérez Pulido, M. O., León, F. J., Pinto Guarguatí, L. A., y Calderón Plata, A. M.",
    year: "2026",
    title: "Valor agregado académico como estrategia institucional de seguimiento y mejora del aprendizaje: Saber TyT en la Universidad de Santander Campus Bucaramanga",
    rest: "(Documento de Trabajo No. 21). Planeación Institucional, Universidad de Santander.",
    doi: "10.5281/zenodo.23500324",
    note: "Revisó: Krystle Forero, Directora UDESTEC. Versión 1, 19 de octubre de 2026. Licencia: el documento no la declara. Referencia tomada de su «Como citar este documento».",
  },
};

/** La cita en una sola línea de texto plano (boletín y CSV). */
export const aporteCitaTexto = (test: AporteTest) => {
  const c = APORTE_CITA[test];
  return `${c.authors} (${c.year}). ${c.title} ${c.rest} https://doi.org/${c.doi}`;
};

/* --- Textos del método --------------------------------------------------------------- */

export const APORTE_STEPS: readonly (readonly [string, (test: string) => string])[] = [
  ["Se parte de lo que traían", (test) => `Cada estudiante llegó con un resultado en Saber 11. Con él se calcula cuánto se espera que obtenga en ${test}.`],
  [
    "Se compara con lo que obtuvo",
    (test) =>
      `Las dos pruebas no son equiparables y no se pueden restar; por eso el puntaje esperado se estima con un modelo${test === "Saber TyT" ? " (p. 4)" : ""}. El aporte es lo que queda por encima o por debajo.`,
  ],
  ["Se agrupa por programa", () => "Quienes estudian el mismo programa comparten docentes y plan de estudios, así que sus resultados no son independientes. El modelo jerárquico estima un efecto por programa."],
  ["Se dice cuánto se sabe", () => "Con pocos evaluados la estimación se acerca al promedio para no premiar ni castigar al azar. Si el intervalo toca el cero, no se afirma que el programa esté sobre o bajo lo esperado."],
];

export const APORTE_LIMITS: Record<AporteTest, string[]> = {
  pro: [
    "Es un solo corte, 2023-2024, de quienes presentaron la prueba (p. 6). No sigue a las mismas personas en el tiempo.",
    "Los controles incluyen el promedio en la UDES y la participación en estrategias de apoyo (p. 7). Eso hace que el aporte sea lo que el programa suma aparte de esos factores, y no el efecto total del programa.",
    "Los programas con menos de 10 evaluados (Antropología y Comunicación Social, 9 cada uno) van sin tono y entre paréntesis; con menos de 30 la fila se atenúa.",
    "Los cuadrantes usan cortes fijos (50 y 150) y no son el valor agregado del modelo.",
    "Un programa puede estar alto en una competencia y bajo en otra. No es una clasificación de programas ni una evaluación de docentes.",
    "El estudio incluye la extensión de Instrumentación Quirúrgica en Bogotá junto a las sedes de Bucaramanga (p. 4).",
  ],
  tyt: [
    "El modelo usa 411 estudiantes (34 % de 1.207 registros) de 8 programas; el resto presentó Saber 11 antes de 2014 (pp. 6 y 7). Solo 3 de los valores estimados se distinguen de cero (p. 9).",
    "Es una medida relativa: compara cada programa con el programa promedio de UDESTEC, no con un estándar externo (p. 12).",
    "El modelo de inglés usa otra muestra (1.081 estudiantes, 13 programas): los dos aportes de un mismo programa no son del todo comparables (p. 11).",
    "El documento pide reportar siempre el intervalo y el n, no calificar a ningún programa como «mejor» o «peor» a partir de un valor que no se distingue de cero, y no usarlo como indicador de desempeño docente (pp. 11 y 12).",
    "Es un documento de trabajo, versión 1 (19 de octubre de 2026).",
  ],
};

/** Cómo se llama cada cifra, para que nadie confunda este aporte con otra de la misma sección. */
export const APORTE_NAMES: readonly (readonly [string, string, string])[] = [
  ["Aporte de los programas", "Efecto de cada programa en un modelo jerárquico, con intervalo y n. Esta sección.", "Saber PRO y Saber TyT: documentos 30 y 21."],
  ["Cuadrante de aporte (AA)", "Cuatro grupos según el estudiante entró sobre o bajo 50 y salió sobre o bajo 150. Describe el trayecto.", "Solo Saber PRO, Figura 5 y Tabla 2."],
];

/** Las contradicciones entre los dos documentos, dichas donde la cifra se muestra. */
export const APORTE_CONTRADICCIONES: Record<AporteTest, string> = {
  pro: "Los intervalos son lectura de figura. El texto del documento (p. 9) da 48 % y 55 % de evaluados sobre lo esperado en lectura crítica y razonamiento cuantitativo; la Figura 5 (p. 10) da 55 % y 48 %. Se usa la figura; hay que confirmarlo con los autores.",
  tyt: "Los intervalos salen del error estándar medido en las barras del anexo. En inglés, la Tabla 5 (p. 8) dice 410 estudiantes y la Figura 1 (p. 10), 1.081 en 13 programas; se usa la figura. Hay que confirmarlo con los autores.",
};

/** Lectura de cada competencia de Saber TyT en el papel (pp. 9, 10 y 16 del documento). */
export const TYT_LECTURA: Record<AporteComp, string> = {
  rc: "Supervisión de Obras Civiles (+7,91) es el resultado más fuerte, cerca de 0,35 desviaciones estándar de Saber TyT. Gestión Industrial (+3,70) queda cerca, pero su intervalo toca el cero (p. 10).",
  lc: "Ningún programa se distingue de cero. Diseño Gráfico Publicitario (+2,82) queda al borde (p. 10).",
  ing: "Diseño Gráfico Publicitario (+4,91) y Supervisión de Obras Civiles (−2,76) están en lados opuestos, con intervalos más cortos porque el modelo tiene 291 y 354 estudiantes en esos programas (p. 10).",
  cc: "Ningún programa se distingue; los valores están entre −0,06 y +0,07 puntos. El documento advierte que la figura puede inducir a error si se publica sola (p. 16).",
};

/* --- Reglas de lectura ----------------------------------------------------------------- */

/** Margen de lectura de la figura: un extremo a menos de 0,15 puntos del cero se dice «toca el cero». */
export const APORTE_TOL = 0.15;
/** Menos evaluados que esto y la cifra va entre paréntesis y sin tono. */
export const APORTE_FEW = 10;
/** Menos evaluados que esto y la fila se atenúa. */
export const APORTE_ATTEN = 30;

export type AporteStatus = "up" | "down" | "edge-up" | "edge-down" | "none" | "few";

export interface AporteRowView {
  name: string;
  n: number;
  e: number;
  lo: number;
  hi: number;
  s: AporteStatus;
}

export function aporteStatus(r: { n: number; e: number; lo: number; hi: number }): AporteStatus {
  if (r.n < APORTE_FEW) return "few";
  if (r.e > 0 && r.lo > -APORTE_TOL) return r.lo >= APORTE_TOL ? "up" : "edge-up";
  if (r.e < 0 && r.hi < APORTE_TOL) return r.hi <= -APORTE_TOL ? "down" : "edge-down";
  return "none";
}

export const APORTE_VERDICT: Record<AporteStatus, string> = {
  up: "▲ sobre lo esperado",
  down: "▼ bajo lo esperado",
  "edge-up": "◐ toca el cero",
  "edge-down": "◐ toca el cero",
  none: "○ no se distingue",
  few: "◇ pocos evaluados",
};
export const APORTE_VERDICT_SHORT: Record<AporteStatus, string> = {
  up: "▲ sobre",
  down: "▼ bajo",
  "edge-up": "◐ límite",
  "edge-down": "◐ límite",
  none: "○ sin dif.",
  few: "◇ n < 10",
};

export function aporteRows(test: AporteTest, comp: AporteComp): AporteRowView[] {
  return (APORTE_TESTS[test].data[comp] ?? []).map(([name, n, e, lo, hi]) => ({ name, n, e, lo, hi, s: aporteStatus({ n, e, lo, hi }) }));
}

export interface AporteCounts {
  up: number;
  down: number;
  edge: number;
  few: number;
  none: number;
  dist: number;
  n: number;
}
export function aporteCounts(rows: AporteRowView[]): AporteCounts {
  const up = rows.filter((r) => r.s === "up").length;
  const down = rows.filter((r) => r.s === "down").length;
  const edge = rows.filter((r) => r.s.startsWith("edge")).length;
  const few = rows.filter((r) => r.s === "few").length;
  return { up, down, edge, few, none: rows.length - up - down - edge - few, dist: up + down, n: rows.length };
}

export type AporteSort = "aporte" | "n" | "nombre";

export function aporteSorted(rows: AporteRowView[], sort: AporteSort, only: boolean): AporteRowView[] {
  const r = rows.slice();
  if (sort === "aporte") r.sort((a, b) => b.e - a.e);
  else if (sort === "n") r.sort((a, b) => b.n - a.n || b.e - a.e);
  else r.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return only ? r.filter((x) => x.s === "up" || x.s === "down") : r;
}

const nf = (n: number, d = 1) => n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
export const aporteNum = nf;
/** Cifra con signo; el menos es el de la tipografía (−), no el guion. */
export const aporteSigned = (n: number, d = 2) => (n > 0 ? "+" : n < 0 ? "−" : "") + nf(Math.abs(n), d);

/** La fila dicha en palabras (lectura de pantalla y pie del gráfico). */
export function aporteSay(r: AporteRowView, test: AporteTest, comp: AporteComp): string {
  const T = APORTE_TESTS[test];
  const abs = Math.abs(r.e);
  let t = `${r.name}: ${nf(abs, 2)} ${abs === 1 ? "punto" : "puntos"} ${r.e >= 0 ? "sobre" : "bajo"} lo esperado en ${aporteCompLabel(comp).toLowerCase()}. `;
  t += `${T.ciShort[0].toUpperCase() + T.ciShort.slice(1)}: de ${aporteSigned(r.lo)} a ${aporteSigned(r.hi)}. `;
  if (r.s === "few") t += `Con ${r.n} evaluados no se le da tono ni se compara: la cifra va entre paréntesis. `;
  else if (r.s === "up" || r.s === "down") t += "El intervalo no incluye el cero: se distingue de cero. ";
  else if (r.s.startsWith("edge")) t += "El intervalo llega al cero por menos de lo que se puede medir en la figura: se dice que toca el cero. ";
  else t += `El intervalo incluye el cero: no se puede afirmar que esté ${r.e >= 0 ? "sobre" : "bajo"} lo esperado. `;
  t += `${nf(r.n, 0)} evaluados`;
  if (r.n < APORTE_ATTEN && r.n >= APORTE_FEW) t += " (pocos: la fila va atenuada)";
  if (test === "tyt") t += `. Equivale a ${nf(abs / TYT_DE[comp], 2)} desviaciones estándar de la prueba`;
  return t + ".";
}

/** El resumen de la competencia, sin marcas. */
export function aporteSummary(rows: AporteRowView[], comp: AporteComp): string {
  const c = aporteCounts(rows);
  const lab = aporteCompLabel(comp).toLowerCase();
  if (!c.dist) {
    return `En ${lab} ningún programa se distingue de cero: con estos datos no hay base para señalar a uno como mejor o peor. ${c.edge ? `${c.edge} ${c.edge === 1 ? "llega" : "llegan"} al cero por poco. ` : ""}`;
  }
  return `En ${lab}, ${c.dist} de ${c.n} programas se distinguen de cero con su intervalo: ${c.up} ${c.up === 1 ? "queda" : "quedan"} sobre lo esperado y ${c.down} bajo lo esperado. ${c.edge ? `${c.edge} ${c.edge === 1 ? "toca" : "tocan"} el cero. ` : ""}Los otros ${c.n - c.dist - c.edge} no se distinguen.`;
}

/** Posición de un valor en el eje, en % del ancho. */
export const aporteAt = (v: number, dom: readonly [number, number]) => ((v - dom[0]) / (dom[1] - dom[0])) * 100;

/** Sede de un programa de Saber PRO: la extensión de Bogotá lleva su nombre en el del programa. */
export const aporteSede = (test: AporteTest, name: string) => (test === "pro" && name.includes("Bogotá") ? "Bogotá" : "Bucaramanga");

/* --- URL del bloque (los mismos nombres del prototipo) --------------------------------- */

export interface AporteUrl {
  comp: AporteComp;
  vista: "bosque" | "tabla";
  orden: AporteSort;
  solo: boolean;
  programa: string;
}

export function aporteUrlString(test: AporteTest, s: AporteUrl): string {
  const q = [`sp=${s.comp}`];
  if (s.vista !== "bosque") q.push(`va-vista=${s.vista}`);
  if (s.orden !== APORTE_TESTS[test].defSort) q.push(`va-orden=${s.orden}`);
  if (s.solo) q.push("va-solo=1");
  if (s.programa) q.push(`va-programa=${encodeURIComponent(s.programa).replace(/%20/g, "+")}`);
  return "?" + q.join("&");
}

/** El programa tiene cifra en esa competencia: sirve para validar `va-programa`. */
export const aporteHas = (test: AporteTest, comp: AporteComp, name: string) => APORTE_TESTS[test].data[comp].some((r) => r[0] === name);

/* --- Entradas del boletín --------------------------------------------------------------- */

export type AportePart = AporteComp | "metodo";

/** Referencia de una hoja del aporte en el boletín: "aporte:<prueba>:<competencia | metodo>". */
export const aporteRef = (test: AporteTest, part: AportePart) => `aporte:${test}:${part}`;

/** Las entradas de una prueba, segmentadas por competencia con modelo y cerradas por el método. */
export const aporteRefList = (test: AporteTest): { ref: string; title: string }[] => [
  ...APORTE_MODELED.map((c) => ({ ref: aporteRef(test, c), title: `${APORTE_TESTS[test].label} · Aporte de los programas · ${aporteCompLabel(c)}` })),
  { ref: aporteRef(test, "metodo"), title: `${APORTE_TESTS[test].label} · Aporte de los programas · Método y límites` },
];
