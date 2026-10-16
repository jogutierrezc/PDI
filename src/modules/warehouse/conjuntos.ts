/* =============================================================================
   Warehouse UDES · catálogo de conjuntos.

   Un conjunto es un reporte de Master, Galileo o Davinci. Todo lo de aquí sale
   de los HAR de «har warehouse» (Capa 1–3); lo que el HAR no mostró queda
   marcado, no inventado. Las políticas de privacidad (qué columnas se guardan)
   viven en la base (wh_politicas, migración 0155): aquí solo se resumen para
   mostrarlas, y una prueba vigila que ambas listas coincidan.
   ========================================================================== */

import { reportePorId } from "./reportes";

export type Sistema = "master" | "galileo" | "davinci";
export type TipoConjunto = "hecho" | "instantanea" | "catalogo";
/** Cómo viaja el periodo en la petición (hallazgo 1 de los HAR). */
export type ViaPeriodo = "ruta" | "consulta" | "cuerpo" | "sesion" | "semana" | "ninguno";
export type Entrega = "archivo" | "tarea" | "json";

/**
 * listo         se puede cargar con el Excel descargado de la plataforma
 * sin_politica  trae datos personales o su encabezado no se capturó: la base no
 *               lo guarda hasta tener política
 * sin_har       el reporte existe en el menú pero ningún HAR lo generó
 * har_danado    el HAR se cortó antes de mostrar la petición
 */
export type EstadoConjunto = "listo" | "sin_politica" | "sin_har" | "har_danado";

export interface Conjunto {
  id: string;
  sistema: Sistema;
  nombre: string;
  tipo: TipoConjunto;
  via: ViaPeriodo;
  entrega: Entrega;
  metodo: "GET" | "POST";
  ruta: string;
  cuerpo: string;
  /** Hay un reporte por corte (1, 2, 3, definitiva). */
  porCorte?: boolean;
  estado: EstadoConjunto;
  /** Qué se guarda y qué se descarta, en una frase. */
  privacidad: string;
  nota?: string;
  har: string;
}

export const SISTEMAS: Record<Sistema, { nombre: string; detalle: string }> = {
  davinci: { nombre: "Davinci", detalle: "Estudiantes y admisiones" },
  galileo: { nombre: "Galileo", detalle: "Aulas y espacios" },
  master: { nombre: "Master", detalle: "Docentes, horarios, notas y evaluación" },
};

export const TIPOS: Record<TipoConjunto, string> = { hecho: "Por periodo", instantanea: "Instantánea", catalogo: "Catálogo" };
export const VIAS: Record<ViaPeriodo, string> = {
  ruta: "La ruta (/{periodo}/)",
  consulta: "La consulta (selected_period)",
  cuerpo: "El cuerpo de la petición",
  sesion: "La sesión (current_period)",
  semana: "Periodo de sesión + semana",
  ninguno: "No lleva periodo",
};
export const ENTREGAS: Record<Entrega, string> = { archivo: "Excel en base64", tarea: "Tarea asíncrona", json: "JSON" };
export const ESTADOS: Record<EstadoConjunto, string> = {
  listo: "Listo para cargar",
  sin_politica: "Falta política de privacidad",
  sin_har: "Falta HAR",
  har_danado: "HAR dañado",
};

export const CORTES = [
  { id: "1", nombre: "Corte 1" },
  { id: "2", nombre: "Corte 2" },
  { id: "3", nombre: "Corte 3" },
  { id: "f", nombre: "Definitiva" },
] as const;

export const SEDES = [
  { id: "buc", nombre: "Bucaramanga", host: "master-buc" },
  { id: "cuc", nombre: "Cúcuta", host: "master-cuc" },
  { id: "val", nombre: "Valledupar", host: "master-val" },
  { id: "bog", nombre: "Bogotá", host: "master-bog" },
] as const;

/** Periodo de los catálogos y de las instantáneas, que no dependen de uno. */
export const PERMANENTE = "permanente";

const catalogo = (id: string, sistema: Sistema, nombre: string, ruta: string, cuerpo: string): Conjunto => ({
  id,
  sistema,
  nombre,
  tipo: "catalogo",
  via: "ninguno",
  entrega: "json",
  metodo: "GET",
  ruta,
  cuerpo,
  estado: "listo",
  privacidad: "Catálogo, sin datos personales.",
  har: "varios",
});

export const CONJUNTOS: Conjunto[] = [
  {
    id: "ma_rendimiento",
    sistema: "master",
    nombre: "Rendimiento académico por grupo",
    tipo: "hecho",
    via: "consulta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_reports/reports/matriculated_mortality/download/",
    cuerpo: "period (corte: 1, 2, 3 o f), title",
    porCorte: true,
    estado: "listo",
    privacidad: "Sin datos de estudiantes. El docente se guarda como seudónimo.",
    nota:
      "Una fila por grupo y corte: matriculados, aprobados, reprobados, no presenta y promedio. El periodo se pide con selected_period: Master entrega el abierto de la sesión o cualquiera de get_periods (desde 2018b). La columna «Programa» del reporte nombra al departamento.",
    har: "Reporte de notas global y por corte",
  },
  {
    id: "dv_matric",
    sistema: "davinci",
    nombre: "Estudiantes matriculados",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/students_matriculated/{periodo}/download/",
    cuerpo: "type, title, title_doc, report, courses",
    estado: "listo",
    privacidad:
      "Se guardan programa, jornada, estado, promedios y créditos. Se descartan documento, nombres, contacto, salud y demás; el código real se conserva (dato personal, solo para el seguimiento académico).",
    nota: "Atención: el HAR muestra el filtro «courses» con los semestres 5 a 8 y electivas; falta confirmar si el reporte trae a todos los semestres. Trae el promedio acumulado y el del último polígrafo: es la base de las alertas por estudiante.",
    har: "davinci estudiantes, master profesores",
  },
  {
    id: "dv_global",
    sistema: "davinci",
    nombre: "Reporte global de matrículas",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/global_enrollments/{periodo}/download/",
    cuerpo: "type, title, title_doc, report",
    estado: "listo",
    privacidad: "Se guardan materia, grupo y departamento por estudiante. Se descartan nombres, correos y el nombre del docente; el código del estudiante se conserva (dato personal, solo para el seguimiento académico) y el del docente queda como seudónimo.",
    nota: "Una fila por estudiante y materia (~38.000 filas en Bucaramanga): es la base para saber qué cursa cada quien.",
    har: "davincimatricula",
  },
  {
    id: "dv_fin",
    sistema: "davinci",
    nombre: "Estudiantes activos financieramente",
    tipo: "hecho",
    via: "ruta",
    entrega: "tarea",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/general_enrollment_and_financial_report/{periodo}/task/",
    cuerpo: "type, title, title_doc, report, conditions[ ]",
    estado: "sin_politica",
    privacidad: "Pendiente: el HAR se cerró antes de que la tarea terminara y no se conoce su encabezado. Use «Sondear» para ver sus columnas y definir la política.",
    har: "davinci estudiantes",
  },
  {
    id: "dv_grad",
    sistema: "davinci",
    nombre: "Graduados",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/graduates/{periodo}/all/download/",
    cuerpo: "type, title, name_doc",
    estado: "listo",
    privacidad: "Se guardan programa, fecha de grado, ceremonia, modalidad y menciones. Se descartan documento, nombres y datos del diploma.",
    har: "Grafuados, Homologaciones",
  },
  {
    id: "dv_homol",
    sistema: "davinci",
    nombre: "Homologaciones",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/homologations_report/{periodo}/download/",
    cuerpo: "type, title, title_doc, report",
    estado: "listo",
    privacidad: "Se descarta el nombre del estudiante; el código real se conserva (dato personal, solo para el seguimiento académico).",
    har: "Homologaciones",
  },
  {
    id: "dv_asp",
    sistema: "davinci",
    nombre: "Aspirantes consolidado",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "GET",
    ruta: "/davinci/mod_reports/reports/applicants_consolidated/{periodo}/download/",
    cuerpo: "por confirmar",
    estado: "har_danado",
    privacidad: "Pendiente.",
    nota: "La función la intenta pedir con el cuerpo habitual, sin verificar. Los HAR aspirantespregrado y aspirantesposgrados están cortados. Volver a exportarlos filtrando Fetch/XHR y udes.edu.co.",
    har: "aspirantespregrado, aspirantesposgrados",
  },
  {
    id: "dv_notas",
    sistema: "davinci",
    nombre: "Notas por estudiante y materia",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/global_scores/{periodo}/download/",
    cuerpo: "type, title, title_doc, report",
    estado: "listo",
    privacidad: "Se guardan programa, materia, grupo y las notas P1, P2, P3 y acumulada. Se descarta el nombre; el código real del estudiante se conserva (dato personal, solo para el seguimiento académico; es el mismo de «Estudiantes matriculados»).",
    nota: "«Reporte global de notas» de Davinci: una fila por estudiante y materia (~29.000 en Bucaramanga). Es la base de las alertas por notas de cada corte.",
    har: "rendimientoacademicoporestudiante",
  },

  {
    id: "dv_deser",
    sistema: "davinci",
    nombre: "Deserciones (histórico)",
    tipo: "hecho",
    via: "cuerpo",
    entrega: "archivo",
    metodo: "POST",
    ruta: "(por capturar)",
    cuerpo: "por confirmar",
    estado: "sin_har",
    privacidad: "Pendiente.",
    nota: "Solo se capturó la lista de periodos (periods_to_student_desertion_report).",
    har: "sin HAR",
  },
  {
    id: "gl_uso",
    sistema: "galileo",
    nombre: "Porcentaje de uso de aulas",
    tipo: "hecho",
    via: "semana",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/galileo/mod_reports/reports/croom_usage_rate/download/",
    cuerpo: "type, title, title_doc, report, week",
    estado: "listo",
    privacidad: "Porcentaje de uso de cada aula por semana. Sin datos personales.",
    nota: "El Excel trae una hoja por semana; se aplanan en una sola tabla con la semana y sus fechas.",
    har: "davinci estudiantes, galileo horarios",
  },
  {
    id: "ms_hor",
    sistema: "master",
    nombre: "Horarios",
    tipo: "hecho",
    via: "cuerpo",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_schedules/schedules/download/",
    cuerpo: "type, orientation, size, title, fields, author, name_doc, title_doc, report",
    estado: "listo",
    privacidad: "El docente se guarda como seudónimo.",
    har: "horario profesores",
  },
  {
    id: "ms_hordep",
    sistema: "master",
    nombre: "Horarios por departamento",
    tipo: "hecho",
    via: "sesion",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_reports/reports/excel/departments_schedules/download/",
    cuerpo: "type, title, title_doc, report",
    estado: "listo",
    privacidad: "Se descarta el nombre del docente; su identificación queda como seudónimo.",
    har: "aulascapacidadyuso, horariosfinal",
  },
  {
    id: "ms_audit",
    sistema: "master",
    nombre: "Auditoría de horarios (bloques y día)",
    tipo: "hecho",
    via: "sesion",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_reports/reports/schedules/audit/00/1/download/",
    cuerpo: "type, size, orientation, author, title, building_name, format, fields, name_doc",
    estado: "listo",
    privacidad: "El docente se guarda como seudónimo.",
    har: "bloquesydia",
  },
  {
    id: "ms_nom",
    sistema: "master",
    nombre: "Nómina docente con estado",
    tipo: "hecho",
    via: "cuerpo",
    entrega: "tarea",
    metodo: "POST",
    ruta: "/master/mod_reports/reports/paysheet/consolidated_table/download/",
    cuerpo: "type, size, orientation, author, fields, fields_size, title, name_doc, selected_period, status",
    estado: "listo",
    privacidad: "Carga académica por docente: asignatura, grupo, horas y programa. Se descartan nombres, correos y observaciones; la cédula queda como seudónimo.",
    nota: "Es una tarea: la plataforma tarda en generarlo (a veces minutos) y el Excel trae un título antes de la tabla.",
    har: "ReporteNominaconestado, master profesores",
  },
  {
    id: "ms_comp",
    sistema: "master",
    nombre: "Evaluación docente por competencias",
    tipo: "hecho",
    via: "cuerpo",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_details_prof_eval_periods/details_prof_eval_periods/get_consolidated_by_competence_xls/download/",
    cuerpo: "title, title_doc, period",
    estado: "listo",
    privacidad: "Se descarta el nombre del docente; su identificación queda como seudónimo.",
    har: "Competenciasprofe, competencias, competencia2",
  },
  {
    id: "ms_eval",
    sistema: "master",
    nombre: "Evaluación docente consolidada",
    tipo: "hecho",
    via: "cuerpo",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_details_prof_eval_periods/details_prof_eval_periods/get_consolidated_report/download/",
    cuerpo: "title, title_doc",
    estado: "listo",
    privacidad: "Se descarta el nombre del docente; su identificación queda como seudónimo.",
    har: "Consolidadoprofe, evaldocente",
  },
  {
    id: "ms_posg",
    sistema: "master",
    nombre: "Matriculados por grupo (posgrado)",
    tipo: "hecho",
    via: "sesion",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_postgraduate_reports/postgraduate_reports/enrollments_group/download/",
    cuerpo: "type, title, title_doc, fields, dpt_ref, show_actives, is_postgraduate",
    estado: "listo",
    privacidad: "El docente se guarda como seudónimo.",
    har: "posgradosgrupos",
  },
  {
    id: "ms_doc",
    sistema: "master",
    nombre: "Docentes",
    tipo: "instantanea",
    via: "sesion",
    entrega: "json",
    metodo: "GET",
    ruta: "/master/mod_reports/reports/prepare_professors/",
    cuerpo: "sin cuerpo · api_key en la URL",
    estado: "listo",
    privacidad: "Solo estado, tipo de contrato y horas de equipo. Se descartan nombres, correo, teléfono, dirección y cualquier contraseña; la identificación queda como seudónimo.",
    har: "aulascapacidadyuso, bloquesydia, horariosfinal, master profesores",
  },
  {
    id: "gl_eq",
    sistema: "galileo",
    nombre: "Equipos",
    tipo: "instantanea",
    via: "ninguno",
    entrega: "json",
    metodo: "GET",
    ruta: "/galileo/mod_reports/reports/equipments/",
    cuerpo: "sin cuerpo",
    estado: "listo",
    privacidad: "Inventario, sin datos personales.",
    har: "davinci estudiantes, galileo horarios",
  },
  catalogo("dm_prog", "davinci", "Programas", "/davinci/mod_reports/reports/programs/", "también programs_graduate/all/ (posgrado)"),
  catalogo("dm_dep", "master", "Departamentos", "/master/mod_reports/reports/pregraduate_departments/", "también posgraduate_departments/"),
  catalogo("dm_aula", "galileo", "Aulas", "/galileo/mod_reports/reports/classrooms/", "horarios usa all/classrooms/ con capacidad"),
  catalogo("dm_edi", "galileo", "Edificios y tipos de aula", "/galileo/mod_reports/reports/buildings/", "también classroom_types/"),
  catalogo("dm_cur", "master", "Cursos", "/master/mod_reports/reports/courses/", "posgrado: postgraduate_reports/courses/"),
  catalogo("dm_act", "master", "Actividades", "/master/mod_reports/reports/activities/", "sin cuerpo"),
  catalogo("dm_con", "master", "Contratos", "/master/mod_reports/reports/contracts/", "msg.contracts y msg.contract_periods"),
  catalogo("dm_grp", "master", "Grupos por programa", "/master/mod_reports/reports/grprogs/", "respuesta paginada"),
  catalogo("dm_per", "davinci", "Periodos", "/davinci/mod_reports/reports/get_periods/", "msg: [{period, current}] desde 2018b"),
];

export const conjuntoPorId = (id: string): Conjunto | undefined => CONJUNTOS.find((c) => c.id === id);

/** Los conjuntos que dependen de un periodo (los del tablero). */
export const HECHOS = CONJUNTOS.filter((c) => c.tipo === "hecho");

/** ¿Este conjunto tiene política y petición conocidas? */
export const cargable = (c: Conjunto) => c.estado === "listo";

/** ¿La función `warehouse` sabe pedirlo sola? (Ver reportes.ts: de ahí sale cómo.) */
export const pideSolo = (c: Conjunto) => reportePorId(c.id) !== undefined;

/** ¿Se puede cargar hoy con el Excel descargado de la plataforma? Los catálogos llegan como JSON y esperan su adaptador. */
export const cargaPorArchivo = (c: Conjunto) => cargable(c) && c.entrega === "archivo";

/**
 * Periodos que ofrece el almacén: desde 2018b (el primero de get_periods hasta
 * el semestre en curso). Enero a junio es «a»; julio a diciembre, «b».
 */
export function periodosDisponibles(hoy = new Date()): string[] {
  const actual = hoy.getFullYear();
  const mitad = hoy.getMonth() >= 6 ? "b" : "a";
  const salida: string[] = [];
  for (let y = 2018; y <= actual; y++) {
    if (y > 2018) salida.push(`${y}a`);
    if (y < actual || mitad === "b") salida.push(`${y}b`);
  }
  return salida.reverse();
}
