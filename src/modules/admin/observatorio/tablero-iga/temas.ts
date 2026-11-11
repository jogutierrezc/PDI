/* =============================================================================
   Tablero IGA · configuración de cada tema.
   Los nombres de columna son los de los CSV de «Indicadores Portal». Una tabla se
   encuentra por la conexión de la Guía de datos (clave) o, si no está conectada,
   por las columnas que trae.
   ========================================================================== */

import type { Agg, CfgTema, ColPrograma } from "./motor";

const cont: Agg = { t: "cont" };
const suma = (col: string): Agg => ({ t: "suma", col });
const prom = (col: string): Agg => ({ t: "prom", col });
const col = (n: string, tabla: string, agg: Agg, fmt: ColPrograma["fmt"], periodo?: string, barra?: boolean): ColPrograma => ({ n, tabla, agg, fmt, periodo, barra });

/* --- Calidad y oferta ------------------------------------------------------------------- */

const calidad: CfgTema = {
  slug: "iga-calidad",
  nombre: "Calidad y oferta",
  fuente: "Programas activos de la UDES (corte 6 de agosto de 2026) y reporte SNIES de primer curso",
  tablas: [
    { id: "prog", nombre: "Programas activos", clave: "calidad.0", cols: ["programa", "acreditado", "vencimiento_rc"] },
    { id: "pc", nombre: "Estudiantes de primer curso", clave: "calidad.4", cols: ["periodo", "estudiantes_primer_curso"] },
  ],
  kpis: [
    { etiqueta: "programas activos", tabla: "prog", agg: cont, fmt: "num" },
    { etiqueta: "con acreditación vigente", tabla: "prog", agg: { t: "cuenta", col: "acreditado", val: "Sí" }, fmt: "num" },
    { etiqueta: "con registro calificado por vencer en 12 meses", tabla: "prog", agg: { t: "cuenta", col: "vencimiento_rc", val: "0 a 12 meses" }, fmt: "num" },
    { etiqueta: "cupos aprobados", tabla: "prog", agg: suma("cupos_aprobados"), fmt: "num" },
  ],
  lectura: (v) => `La UDES tiene ${v[0]} programas activos. ${v[1]} cuentan con acreditación vigente y el registro calificado de ${v[2]} vence en los próximos 12 meses.`,
  pestanas: [
    {
      id: "resumen", nombre: "Resumen",
      specs: [
        { t: "barras", titulo: "Programas por facultad", nota: "Clic en una facultad para filtrar", tabla: "prog", cat: "facultad", agg: cont, fmt: "num", filtro: "fac" },
        { t: "barras", titulo: "Programas por sede", nota: "Clic en una sede para filtrar", tabla: "prog", cat: "sede", agg: cont, fmt: "num", filtro: "sede" },
        { t: "barras", titulo: "Programas por nivel de formación", tabla: "prog", cat: "tipo_programa", agg: cont, fmt: "num" },
        { t: "barras", titulo: "Programas por modalidad", tabla: "prog", cat: "modalidad", agg: cont, fmt: "num" },
      ],
    },
    {
      id: "acreditacion", nombre: "Acreditación",
      specs: [
        { t: "apiladas", titulo: "Acreditación por facultad", nota: "Programas con y sin acreditación vigente", ancho: 12, tabla: "prog", cat: "facultad", serie: "acreditado", agg: cont, fmt: "num" },
        { t: "barras", titulo: "Condiciones iniciales para acreditar", nota: "Programas sin acreditación: ¿cumplen las condiciones?", tabla: "prog", cat: "cumple_condiciones_acreditar", agg: cont, fmt: "num" },
        { t: "barras", titulo: "Acreditación por sede", nota: "Programas con acreditación vigente", tabla: "prog", cat: "sede", agg: cont, fmt: "num", donde: ["acreditado", "Sí"], filtro: "sede" },
      ],
    },
    {
      id: "registro", nombre: "Registro calificado",
      specs: [
        { t: "barras", titulo: "Vencimiento del registro calificado", nota: "Programas según el tiempo que falta", tabla: "prog", cat: "vencimiento_rc", agg: cont, fmt: "num", orden: "cat" },
        { t: "lista", titulo: "Registros que vencen primero", nota: "Ordenados por los meses que faltan", ancho: 12, tabla: "prog", orden: "meses_para_vencer_rc", desc: false, columnas: [{ n: "Programa", col: "programa" }, { n: "Sede", col: "sede" }, { n: "Vence en", col: "vencimiento_rc" }, { n: "Meses", col: "meses_para_vencer_rc", fmt: "num" }] },
      ],
    },
    {
      id: "primer", nombre: "Primer curso",
      specs: [{ t: "lineas", titulo: "Estudiantes de primer curso por periodo", nota: "Reporte SNIES", ancho: 12, tabla: "pc", x: "periodo", agg: suma("estudiantes_primer_curso"), fmt: "num" }],
    },
    {
      id: "programas", nombre: "Programas",
      specs: [{ t: "programas", titulo: "Todos los programas", nota: "Ordena con el título de cada columna. Clic en una fila para abrir el programa", ancho: 12, orden: 0, columnas: [col("Cupos aprobados", "prog", suma("cupos_aprobados"), "num", undefined, true), col("Meses para vencer el RC", "prog", suma("meses_para_vencer_rc"), "num"), col("Año de creación", "prog", suma("anio_creacion"), "anio")] }],
    },
  ],
};

/* --- Estudiantes ------------------------------------------------------------------------ */

const estudiantes: CfgTema = {
  slug: "iga-estudiantes",
  nombre: "Estudiantes",
  fuente: "Deserción por periodo, Saber Pro, valor agregado, reporte de graduados y préstamos de biblioteca",
  tablas: [
    { id: "des", nombre: "Deserción por periodo", clave: "estudiantes.0", cols: ["programa", "periodo", "desercion"] },
    { id: "sp", nombre: "Saber Pro", clave: "estudiantes.1", cols: ["programa", "anio", "puntaje_medio", "evaluados"] },
    { id: "va", nombre: "Valor agregado", clave: "estudiantes.2", cols: ["facultad", "anio", "val_lectura_critica"] },
    { id: "gr", nombre: "Graduados por programa", clave: "estudiantes.3", cols: ["programa", "anio", "graduados"] },
    { id: "tg", nombre: "Tiempo de graduación", clave: "estudiantes.3", cols: ["facultad", "mediana_semestres"] },
    { id: "gn", nombre: "Graduados por nivel", clave: "estudiantes.3", cols: ["anio", "nivel", "graduados"], sin: ["programa"] },
    { id: "bf", nombre: "Préstamos por facultad", clave: "estudiantes.4", cols: ["facultad", "periodo", "prestamos"] },
    { id: "bi", nombre: "Biblioteca institucional", clave: "estudiantes.4", cols: ["periodo", "prestamos", "personas_usuarias"] },
  ],
  kpis: [
    { etiqueta: "deserción promedio, último periodo", tabla: "des", agg: prom("desercion"), fmt: "pct", periodo: "periodo" },
    { etiqueta: "puntaje medio en Saber Pro, último año", tabla: "sp", agg: { t: "ponderado", col: "puntaje_medio", peso: "evaluados" }, fmt: "dec1", periodo: "anio" },
    { etiqueta: "graduados, último año", tabla: "gr", agg: suma("graduados"), fmt: "num", periodo: "anio" },
    { etiqueta: "préstamos de biblioteca, último periodo", tabla: "bf", agg: suma("prestamos"), fmt: "num", periodo: "periodo" },
  ],
  lectura: (v) => `En el último periodo la deserción promedio de los programas fue ${v[0]}. El puntaje medio en Saber Pro fue ${v[1]}, se graduaron ${v[2]} estudiantes y la biblioteca registró ${v[3]} préstamos.`,
  pestanas: [
    {
      id: "resumen", nombre: "Resumen",
      specs: [
        { t: "lineas", titulo: "Deserción por periodo", nota: "Promedio simple de los programas", tabla: "des", x: "periodo", agg: prom("desercion"), fmt: "pct" },
        { t: "lineas", titulo: "Graduados por año", tabla: "gr", x: "anio", agg: suma("graduados"), fmt: "num" },
        { t: "barras", titulo: "Deserción por facultad", nota: "Último periodo. Clic para filtrar", tabla: "des", cat: "facultad", agg: prom("desercion"), fmt: "pct", periodo: "periodo", filtro: "fac" },
        { t: "barras", titulo: "Saber Pro por facultad", nota: "Puntaje medio ponderado por evaluados, último año", tabla: "sp", cat: "facultad", agg: { t: "ponderado", col: "puntaje_medio", peso: "evaluados" }, fmt: "dec1", periodo: "anio", filtro: "fac" },
      ],
    },
    {
      id: "desercion", nombre: "Deserción",
      specs: [
        { t: "lineas", titulo: "Deserción por facultad", nota: "Promedio simple de los programas de cada facultad", ancho: 12, tabla: "des", x: "periodo", serie: "facultad", agg: prom("desercion"), fmt: "pct" },
        { t: "barras", titulo: "Deserción por sede", nota: "Último periodo", tabla: "des", cat: "sede", agg: prom("desercion"), fmt: "pct", periodo: "periodo", filtro: "sede" },
        { t: "barras", titulo: "Deserción por nivel de formación", nota: "Último periodo", tabla: "des", cat: "nivel", agg: prom("desercion"), fmt: "pct", periodo: "periodo" },
        { t: "programas", titulo: "Programas con mayor deserción", nota: "Último periodo. Clic en una fila para abrir el programa", ancho: 12, orden: 0, columnas: [col("Deserción", "des", prom("desercion"), "pct", "periodo", true)] },
      ],
    },
    {
      id: "saberpro", nombre: "Saber Pro",
      specs: [
        { t: "lineas", titulo: "Puntaje medio por año", nota: "Ponderado por el número de evaluados", ancho: 12, tabla: "sp", x: "anio", agg: { t: "ponderado", col: "puntaje_medio", peso: "evaluados" }, fmt: "dec1" },
        { t: "barras", titulo: "Evaluados por facultad", nota: "Último año", tabla: "sp", cat: "facultad", agg: suma("evaluados"), fmt: "num", periodo: "anio", filtro: "fac" },
        { t: "barras", titulo: "Puntaje por sede", nota: "Último año", tabla: "sp", cat: "sede", agg: { t: "ponderado", col: "puntaje_medio", peso: "evaluados" }, fmt: "dec1", periodo: "anio", filtro: "sede" },
        { t: "programas", titulo: "Programas por puntaje", nota: "Último año. Clic en una fila para abrir el programa", ancho: 12, orden: 0, columnas: [col("Puntaje medio", "sp", prom("puntaje_medio"), "dec1", "anio", true), col("Evaluados", "sp", suma("evaluados"), "num", "anio")] },
      ],
    },
    {
      id: "graduados", nombre: "Graduados",
      specs: [
        { t: "apiladas", titulo: "Graduados por año y nivel", ancho: 12, tabla: "gn", cat: "anio", serie: "nivel", agg: suma("graduados"), fmt: "num", orden: "cat" },
        { t: "barras", titulo: "Graduados por facultad", nota: "Último año", tabla: "gr", cat: "facultad", agg: suma("graduados"), fmt: "num", periodo: "anio", filtro: "fac" },
        { t: "barras", titulo: "Tiempo de graduación por facultad", nota: "Mediana en semestres", tabla: "tg", cat: "facultad", agg: prom("mediana_semestres"), fmt: "dec1", filtro: "fac" },
      ],
    },
    {
      id: "valor", nombre: "Valor agregado",
      specs: [
        { t: "barras", titulo: "Lectura crítica", nota: "Valor agregado por facultad, último año", tabla: "va", cat: "facultad", agg: prom("val_lectura_critica"), fmt: "dec2", periodo: "anio" },
        { t: "barras", titulo: "Razonamiento cuantitativo", nota: "Valor agregado por facultad, último año", tabla: "va", cat: "facultad", agg: prom("val_razonamiento_cuantitativo"), fmt: "dec2", periodo: "anio" },
        { t: "barras", titulo: "Inglés", nota: "Valor agregado por facultad, último año", tabla: "va", cat: "facultad", agg: prom("val_ingles"), fmt: "dec2", periodo: "anio" },
        { t: "barras", titulo: "Competencias ciudadanas", nota: "Valor agregado por facultad, último año", tabla: "va", cat: "facultad", agg: prom("val_competencias_ciudadanas"), fmt: "dec2", periodo: "anio" },
      ],
    },
    {
      id: "biblioteca", nombre: "Biblioteca",
      specs: [
        { t: "lineas", titulo: "Préstamos por periodo", tabla: "bi", x: "periodo", agg: suma("prestamos"), fmt: "num" },
        { t: "lineas", titulo: "Personas usuarias por periodo", tabla: "bi", x: "periodo", agg: suma("personas_usuarias"), fmt: "num" },
        { t: "barras", titulo: "Préstamos por facultad", nota: "Último periodo. Clic para filtrar", ancho: 12, tabla: "bf", cat: "facultad", agg: suma("prestamos"), fmt: "num", periodo: "periodo", filtro: "fac" },
      ],
    },
    {
      id: "programas", nombre: "Programas",
      specs: [{ t: "programas", titulo: "Todos los programas", nota: "Último dato de cada indicador. Clic en una fila para abrir el programa", ancho: 12, orden: 0, columnas: [col("Deserción", "des", prom("desercion"), "pct", "periodo", true), col("Puntaje Saber Pro", "sp", prom("puntaje_medio"), "dec1", "anio"), col("Graduados", "gr", suma("graduados"), "num", "anio")] }],
    },
  ],
};

/* --- Profesores ------------------------------------------------------------------------- */

const profesores: CfgTema = {
  slug: "iga-profesores",
  nombre: "Profesores",
  fuente: "Núcleo profesoral, tipología, evaluación docente y bilingüismo profesoral",
  tablas: [
    { id: "nu", nombre: "Núcleo profesoral", clave: "profesores.0", cols: ["dimension", "categoria", "profesores"] },
    { id: "ti", nombre: "Cumplimiento de la tipología", clave: "profesores.1", cols: ["programa", "periodo", "cumplen", "no_cumplen"] },
    { id: "ev", nombre: "Evaluación docente", clave: "profesores.2", cols: ["facultad", "periodo", "promedio_evaluacion"] },
    { id: "en", nombre: "Nivel de inglés", clave: "profesores.3", cols: ["facultad", "nivel_mcer", "profesores"], sin: ["dimension"] },
  ],
  kpis: [
    { etiqueta: "profesores en el núcleo profesoral", tabla: "nu", agg: suma("profesores"), fmt: "num", donde: ["dimension", "Modalidad"] },
    { etiqueta: "cumplimiento de la tipología, último periodo", tabla: "ti", agg: { t: "razon", col: "cumplen", den: "cumplen", mas: "no_cumplen" }, fmt: "pct0", periodo: "periodo" },
    { etiqueta: "evaluación docente (de 5), último periodo", tabla: "ev", agg: prom("promedio_evaluacion"), fmt: "dec2", periodo: "periodo", donde: ["facultad", "Toda la UDES"] },
    { etiqueta: "profesores con nivel de inglés registrado", tabla: "en", agg: suma("profesores"), fmt: "num" },
  ],
  lectura: (v) => `El núcleo profesoral suma ${v[0]} profesores. En el último periodo ${v[1]} de los programas cumplen la tipología y la evaluación docente promedia ${v[2]} sobre 5.`,
  pestanas: [
    {
      id: "resumen", nombre: "Resumen",
      specs: [
        { t: "barras", titulo: "Profesores por modalidad", tabla: "nu", donde: ["dimension", "Modalidad"], cat: "categoria", agg: suma("profesores"), fmt: "num" },
        { t: "barras", titulo: "Profesores por nivel de formación", tabla: "nu", donde: ["dimension", "Nivel de formación"], cat: "categoria", agg: suma("profesores"), fmt: "num" },
        { t: "barras", titulo: "Profesores por categoría del escalafón", tabla: "nu", donde: ["dimension", "Categoría"], cat: "categoria", agg: suma("profesores"), fmt: "num" },
        { t: "lineas", titulo: "Cumplimiento de la tipología por periodo", nota: "Profesores que cumplen sobre el total", tabla: "ti", x: "periodo", agg: { t: "razon", col: "cumplen", den: "cumplen", mas: "no_cumplen" }, fmt: "pct0" },
      ],
    },
    {
      id: "tipologia", nombre: "Tipología",
      specs: [
        { t: "lineas", titulo: "Cumplimiento por facultad", ancho: 12, tabla: "ti", x: "periodo", serie: "facultad", agg: { t: "razon", col: "cumplen", den: "cumplen", mas: "no_cumplen" }, fmt: "pct0" },
        { t: "barras", titulo: "Cumplimiento por sede", nota: "Último periodo. Clic para filtrar", tabla: "ti", cat: "sede", agg: { t: "razon", col: "cumplen", den: "cumplen", mas: "no_cumplen" }, fmt: "pct0", periodo: "periodo", filtro: "sede" },
        { t: "barras", titulo: "Cumplimiento por facultad", nota: "Último periodo. Clic para filtrar", tabla: "ti", cat: "facultad", agg: { t: "razon", col: "cumplen", den: "cumplen", mas: "no_cumplen" }, fmt: "pct0", periodo: "periodo", filtro: "fac" },
        { t: "programas", titulo: "Programas por cumplimiento", nota: "Último periodo. Clic en una fila para abrir el programa", ancho: 12, orden: 0, desc: false, columnas: [col("Cumplimiento", "ti", { t: "razon", col: "cumplen", den: "cumplen", mas: "no_cumplen" }, "pct0", "periodo", true), col("Cumplen", "ti", suma("cumplen"), "num", "periodo"), col("No cumplen", "ti", suma("no_cumplen"), "num", "periodo")] },
      ],
    },
    {
      id: "evaluacion", nombre: "Evaluación docente",
      specs: [
        { t: "lineas", titulo: "Evaluación docente por periodo", nota: "Promedio sobre 5", ancho: 12, tabla: "ev", x: "periodo", serie: "facultad", agg: prom("promedio_evaluacion"), fmt: "dec2" },
        { t: "barras", titulo: "Evaluación por facultad", nota: "Último periodo", ancho: 12, tabla: "ev", cat: "facultad", agg: prom("promedio_evaluacion"), fmt: "dec2", periodo: "periodo", sin: ["Toda la UDES"], filtro: "fac" },
      ],
    },
    {
      id: "ingles", nombre: "Inglés",
      specs: [
        { t: "apiladas", titulo: "Nivel de inglés por facultad", nota: "Profesores según el nivel del MCER", ancho: 12, tabla: "en", cat: "facultad", serie: "nivel_mcer", agg: suma("profesores"), fmt: "num" },
        { t: "barras", titulo: "Profesores por nivel del MCER", tabla: "en", cat: "nivel_mcer", agg: suma("profesores"), fmt: "num", orden: "cat" },
      ],
    },
    {
      id: "programas", nombre: "Programas",
      specs: [{ t: "programas", titulo: "Tipología por programa", nota: "Último periodo. Clic en una fila para abrir el programa", ancho: 12, orden: 0, desc: false, columnas: [col("Cumplimiento", "ti", { t: "razon", col: "cumplen", den: "cumplen", mas: "no_cumplen" }, "pct0", "periodo", true), col("Cumplen", "ti", suma("cumplen"), "num", "periodo"), col("No cumplen", "ti", suma("no_cumplen"), "num", "periodo")] }],
    },
  ],
};

/* --- Gestión administrativa -------------------------------------------------------------------- */

const gestion: CfgTema = {
  slug: "iga-gestion",
  nombre: "Gestión administrativa",
  fuente: "Cumplimiento de registro de notas y usabilidad de las aulas Moodle",
  tablas: [
    { id: "nt", nombre: "Registro de notas", clave: "gestion.0", cols: ["programa", "periodo", "pct_notas_registradas"] },
    { id: "mo", nombre: "Uso de aulas Moodle", clave: "gestion.1", cols: ["programa", "periodo", "cursos_habilitados", "cursos_utilizados"] },
  ],
  kpis: [
    { etiqueta: "notas registradas en el sistema, último corte", tabla: "nt", agg: prom("pct_notas_registradas"), fmt: "pct100", periodo: "periodo" },
    { etiqueta: "cursos Moodle utilizados, último periodo", tabla: "mo", agg: { t: "razon", col: "cursos_utilizados", den: "cursos_habilitados" }, fmt: "pct0", periodo: "periodo" },
    { etiqueta: "cursos Moodle habilitados, último periodo", tabla: "mo", agg: suma("cursos_habilitados"), fmt: "num", periodo: "periodo" },
  ],
  lectura: (v) => `En el último corte los programas registraron en promedio el ${v[0]} de las notas. En Moodle se usan ${v[1]} de los ${v[2]} cursos habilitados.`,
  pestanas: [
    {
      id: "notas", nombre: "Registro de notas",
      specs: [
        { t: "lineas", titulo: "Notas registradas por sede", nota: "Promedio simple de los programas", ancho: 12, tabla: "nt", x: "periodo", serie: "sede", agg: prom("pct_notas_registradas"), fmt: "pct100" },
        { t: "barras", titulo: "Registro por facultad", nota: "Último corte. Clic para filtrar", tabla: "nt", cat: "facultad", agg: prom("pct_notas_registradas"), fmt: "pct100", periodo: "periodo", filtro: "fac" },
        { t: "barras", titulo: "Registro por sede", nota: "Último corte. Clic para filtrar", tabla: "nt", cat: "sede", agg: prom("pct_notas_registradas"), fmt: "pct100", periodo: "periodo", filtro: "sede" },
        { t: "programas", titulo: "Programas con menor registro", nota: "Último corte. Clic en una fila para abrir el programa", ancho: 12, orden: 0, desc: false, columnas: [col("Notas registradas", "nt", prom("pct_notas_registradas"), "pct100", "periodo", true)] },
      ],
    },
    {
      id: "moodle", nombre: "Aulas Moodle",
      specs: [
        { t: "lineas", titulo: "Cursos utilizados por sede", nota: "Cursos utilizados sobre habilitados", ancho: 12, tabla: "mo", x: "periodo", serie: "sede", agg: { t: "razon", col: "cursos_utilizados", den: "cursos_habilitados" }, fmt: "pct0" },
        { t: "barras", titulo: "Uso por facultad", nota: "Último periodo. Clic para filtrar", tabla: "mo", cat: "facultad", agg: { t: "razon", col: "cursos_utilizados", den: "cursos_habilitados" }, fmt: "pct0", periodo: "periodo", filtro: "fac" },
        { t: "barras", titulo: "Cursos habilitados por sede", nota: "Último periodo", tabla: "mo", cat: "sede", agg: suma("cursos_habilitados"), fmt: "num", periodo: "periodo", filtro: "sede" },
        { t: "programas", titulo: "Programas por uso de Moodle", nota: "Último periodo. Clic en una fila para abrir el programa", ancho: 12, orden: 0, desc: false, columnas: [col("Cursos utilizados", "mo", { t: "razon", col: "cursos_utilizados", den: "cursos_habilitados" }, "pct0", "periodo", true), col("Habilitados", "mo", suma("cursos_habilitados"), "num", "periodo"), col("Utilizados", "mo", suma("cursos_utilizados"), "num", "periodo")] },
      ],
    },
    {
      id: "pendientes", nombre: "Pendientes",
      specs: [{ t: "nota", titulo: "Indicadores sin archivo", ancho: 12, texto: "Resultados de aprendizaje y auditoría de profesores están por adaptar; la carga académica en el Master y las novedades a Talento Humano no tienen archivo. Cuando estén, se conectan en la Guía de datos y aparecen aquí." }],
    },
  ],
};

/* --- Internacionalización ------------------------------------------------------------------------ */

const internacional: CfgTema = {
  slug: "iga-internacional",
  nombre: "Internacionalización",
  fuente: "Reporte de cifras de intercambios virtuales y aulas internacionalizadas",
  tablas: [{ id: "au", nombre: "Aulas internacionalizadas", clave: "internacional.0", cols: ["programa", "periodo", "tipo_de_aula", "pais"] }],
  kpis: [
    { etiqueta: "aulas internacionalizadas", tabla: "au", agg: cont, fmt: "num" },
    { etiqueta: "estudiantes de la UDES participantes", tabla: "au", agg: suma("estudiantes_udes"), fmt: "num" },
    { etiqueta: "participantes externos", tabla: "au", agg: suma("estudiantes_externos"), fmt: "num" },
    { etiqueta: "países con universidades participantes", tabla: "au", agg: { t: "dist", col: "pais" }, fmt: "num" },
  ],
  lectura: (v) => `Se registraron ${v[0]} aulas internacionalizadas, con ${v[1]} estudiantes de la UDES y ${v[2]} participantes externos de universidades de ${v[3]} países.`,
  pestanas: [
    {
      id: "resumen", nombre: "Resumen",
      specs: [
        { t: "barras", titulo: "Aulas por país", nota: "País de la universidad participante", tabla: "au", cat: "pais", agg: cont, fmt: "num", top: 12 },
        { t: "barras", titulo: "Aulas por tipo", tabla: "au", cat: "tipo_de_aula", agg: cont, fmt: "num" },
        { t: "barras", titulo: "Aulas por facultad", nota: "Clic para filtrar", tabla: "au", cat: "facultad", agg: cont, fmt: "num", filtro: "fac" },
        { t: "barras", titulo: "Aulas por sede", nota: "Clic para filtrar", tabla: "au", cat: "sede", agg: cont, fmt: "num", filtro: "sede" },
      ],
    },
    {
      id: "periodos", nombre: "Por periodo",
      specs: [
        { t: "lineas", titulo: "Aulas por periodo", ancho: 12, tabla: "au", x: "periodo", agg: cont, fmt: "num" },
        { t: "lineas", titulo: "Estudiantes de la UDES por periodo", ancho: 12, tabla: "au", x: "periodo", agg: suma("estudiantes_udes"), fmt: "num" },
        { t: "barras", titulo: "Universidades participantes", nota: "Aulas por universidad", ancho: 12, tabla: "au", cat: "universidad_participante", agg: cont, fmt: "num", top: 15 },
      ],
    },
    {
      id: "programas", nombre: "Programas",
      specs: [{ t: "programas", titulo: "Programas con aulas internacionalizadas", nota: "Clic en una fila para abrir el programa", ancho: 12, orden: 0, columnas: [col("Aulas", "au", cont, "num", undefined, true), col("Estudiantes UDES", "au", suma("estudiantes_udes"), "num"), col("Participantes externos", "au", suma("estudiantes_externos"), "num")] }],
    },
    {
      id: "movilidad", nombre: "Movilidad",
      specs: [{ t: "nota", titulo: "Movilidad internacional y nacional", ancho: 12, texto: "La movilidad de estudiantes y profesores, que salen y llegan, está por adaptar desde el libro de Internacionalización. Cuando se cargue, se conecta en la Guía de datos y aparece aquí." }],
    },
  ],
};

/* --- Extensión ------------------------------------------------------------------------------------ */

const extension: CfgTema = {
  slug: "iga-extension",
  nombre: "Extensión",
  fuente: "Inventario de cifras de la Vicerrectoría de Extensión (educación continua)",
  tablas: [
    { id: "fa", nombre: "Educación continua por facultad", clave: "extension.0", cols: ["facultad", "anio", "eventos", "participantes", "recaudo"] },
    { id: "pr", nombre: "Educación continua por programa", cols: ["programa", "anio", "eventos", "participantes", "recaudo"] },
    { id: "ti", nombre: "Educación continua por tipo de evento", cols: ["tipo_de_evento", "anio", "eventos"] },
  ],
  kpis: [
    { etiqueta: "eventos de educación continua, último año", tabla: "fa", agg: suma("eventos"), fmt: "num", periodo: "anio" },
    { etiqueta: "participantes, último año", tabla: "fa", agg: suma("participantes"), fmt: "num", periodo: "anio" },
    { etiqueta: "recaudo, último año", tabla: "fa", agg: suma("recaudo"), fmt: "dinero", periodo: "anio" },
  ],
  lectura: (v) => `En el último año de reporte hubo ${v[0]} eventos de educación continua, con ${v[1]} participantes y un recaudo de ${v[2]}.`,
  pestanas: [
    {
      id: "resumen", nombre: "Resumen",
      specs: [
        { t: "lineas", titulo: "Eventos por año", tabla: "fa", x: "anio", agg: suma("eventos"), fmt: "num" },
        { t: "lineas", titulo: "Participantes por año", tabla: "fa", x: "anio", agg: suma("participantes"), fmt: "num" },
        { t: "barras", titulo: "Recaudo por facultad", nota: "Último año. Clic para filtrar", tabla: "fa", cat: "facultad", agg: suma("recaudo"), fmt: "dinero", periodo: "anio", filtro: "fac" },
        { t: "barras", titulo: "Eventos por tipo", nota: "Último año", tabla: "ti", cat: "tipo_de_evento", agg: suma("eventos"), fmt: "num", periodo: "anio" },
      ],
    },
    {
      id: "programas", nombre: "Programas",
      specs: [{ t: "programas", titulo: "Educación continua por programa", nota: "Último año. Clic en una fila para abrir el programa", ancho: 12, orden: 2, columnas: [col("Eventos", "pr", suma("eventos"), "num", "anio"), col("Participantes", "pr", suma("participantes"), "num", "anio"), col("Recaudo", "pr", suma("recaudo"), "dinero", "anio", true)] }],
    },
    {
      id: "otras", nombre: "Otras líneas",
      specs: [{ t: "nota", titulo: "Creación artística, desarrollo tecnológico, proyección social y servicios", ancho: 12, texto: "Estas líneas del inventario de extensión están por adaptar: sus hojas no traen una estructura de tabla. Cuando se consoliden, se conectan en la Guía de datos y aparecen aquí." }],
    },
  ],
};

/* --- Investigación --------------------------------------------------------------------------------- */

const investigacion: CfgTema = {
  slug: "iga-investigacion",
  nombre: "Investigación",
  fuente: "Grupos de investigación, investigadores categorizados, publicaciones, semilleros y proyectos",
  tablas: [
    { id: "gr", nombre: "Grupos de investigación", clave: "investigacion.0", cols: ["grupo", "grupos"] },
    { id: "inv", nombre: "Investigadores categorizados", clave: "investigacion.1", cols: ["investigadores", "vinculado_udes"] },
    { id: "pu", nombre: "Publicaciones por cuartil Scopus", clave: "investigacion.2", cols: ["publicaciones", "cuartil_scopus"] },
    { id: "se", nombre: "Semilleros", clave: "investigacion.3", cols: ["semilleros"] },
    { id: "pj", nombre: "Proyectos", clave: "investigacion.4", cols: ["proyectos", "fuente"] },
  ],
  kpis: [
    { etiqueta: "grupos de investigación", tabla: "gr", agg: suma("grupos"), fmt: "num" },
    { etiqueta: "investigadores categorizados", tabla: "inv", agg: suma("investigadores"), fmt: "num" },
    { etiqueta: "publicaciones en Scopus", tabla: "pu", agg: suma("publicaciones"), fmt: "num" },
    { etiqueta: "semilleros, último periodo", tabla: "se", agg: suma("semilleros"), fmt: "num", periodo: "periodo" },
    { etiqueta: "proyectos registrados", tabla: "pj", agg: suma("proyectos"), fmt: "num" },
  ],
  lectura: (v) => `La UDES cuenta con ${v[0]} grupos de investigación, ${v[1]} investigadores categorizados, ${v[2]} publicaciones en Scopus, ${v[3]} semilleros y ${v[4]} proyectos registrados.`,
  pestanas: [
    {
      id: "resumen", nombre: "Resumen",
      specs: [
        { t: "barras", titulo: "Grupos por categoría", tabla: "gr", cat: "categoria", agg: suma("grupos"), fmt: "num", orden: "cat" },
        { t: "barras", titulo: "Grupos por facultad", nota: "Clic para filtrar", tabla: "gr", cat: "facultad", agg: suma("grupos"), fmt: "num", filtro: "fac" },
        { t: "barras", titulo: "Investigadores por categoría", tabla: "inv", cat: "categoria", agg: suma("investigadores"), fmt: "num" },
        { t: "barras", titulo: "Publicaciones por facultad", nota: "Clic para filtrar", tabla: "pu", cat: "facultad", agg: suma("publicaciones"), fmt: "num", filtro: "fac" },
      ],
    },
    {
      id: "grupos", nombre: "Grupos",
      specs: [
        { t: "apiladas", titulo: "Grupos por facultad y categoría", ancho: 12, tabla: "gr", cat: "facultad", serie: "categoria", agg: suma("grupos"), fmt: "num" },
        { t: "lista", titulo: "Grupos de investigación", ancho: 12, tabla: "gr", orden: "categoria", desc: false, columnas: [{ n: "Grupo", col: "grupo" }, { n: "Facultad", col: "facultad" }, { n: "Sede", col: "sede" }, { n: "Categoría", col: "categoria" }] },
      ],
    },
    {
      id: "investigadores", nombre: "Investigadores",
      specs: [
        { t: "apiladas", titulo: "Investigadores por facultad y categoría", ancho: 12, tabla: "inv", cat: "facultad", serie: "categoria", agg: suma("investigadores"), fmt: "num" },
        { t: "barras", titulo: "Investigadores por sede", nota: "Clic para filtrar", tabla: "inv", cat: "sede", agg: suma("investigadores"), fmt: "num", filtro: "sede" },
        { t: "barras", titulo: "Vinculados a la UDES", tabla: "inv", cat: "vinculado_udes", agg: suma("investigadores"), fmt: "num" },
      ],
    },
    {
      id: "publicaciones", nombre: "Publicaciones",
      specs: [
        { t: "apiladas", titulo: "Publicaciones por facultad y cuartil", nota: "Cuartil Scopus", ancho: 12, tabla: "pu", cat: "facultad", serie: "cuartil_scopus", agg: suma("publicaciones"), fmt: "num" },
        { t: "barras", titulo: "Publicaciones por sede", nota: "Clic para filtrar", tabla: "pu", cat: "sede", agg: suma("publicaciones"), fmt: "num", filtro: "sede" },
        { t: "barras", titulo: "Publicaciones por cuartil", tabla: "pu", cat: "cuartil_scopus", agg: suma("publicaciones"), fmt: "num", orden: "cat" },
      ],
    },
    {
      id: "semilleros", nombre: "Semilleros",
      specs: [
        { t: "barras", titulo: "Semilleros por facultad", nota: "Último periodo. Clic para filtrar", tabla: "se", cat: "facultad", agg: suma("semilleros"), fmt: "num", periodo: "periodo", filtro: "fac" },
        { t: "barras", titulo: "Semilleros por sede", nota: "Último periodo. Clic para filtrar", tabla: "se", cat: "sede", agg: suma("semilleros"), fmt: "num", periodo: "periodo", filtro: "sede" },
      ],
    },
    {
      id: "proyectos", nombre: "Proyectos",
      specs: [
        { t: "barras", titulo: "Proyectos por fuente", tabla: "pj", cat: "fuente", agg: suma("proyectos"), fmt: "num" },
        { t: "barras", titulo: "Proyectos por facultad", nota: "Clic para filtrar", tabla: "pj", cat: "facultad", agg: suma("proyectos"), fmt: "num", filtro: "fac" },
        { t: "lista", titulo: "Proyectos", ancho: 12, tabla: "pj", orden: "proyectos", columnas: [{ n: "Convocatoria", col: "convocatoria" }, { n: "Fuente", col: "fuente" }, { n: "Grupo", col: "grupo" }, { n: "Facultad", col: "facultad" }, { n: "Proyectos", col: "proyectos", fmt: "num" }] },
      ],
    },
  ],
};

export const TEMAS_IGA: Record<string, CfgTema> = Object.fromEntries([calidad, estudiantes, profesores, gestion, internacional, extension, investigacion].map((c) => [c.slug, c]));
