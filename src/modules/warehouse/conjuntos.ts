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

/**
 * Los reportes pesados: decenas de miles de filas (2–3 MB de Excel) o una tarea que la plataforma tarda más de un
 * minuto en generar. La función tiene 150 MB y 60 s por llamada; varias sedes pidiendo estos a la vez, además de
 * cargar al servidor de la universidad, son lo que más veces la ha tumbado. «Traer varios» no deja que más de
 * `MAX_SEDES_PESADAS` sedes estén trayendo uno al mismo tiempo (los demás reportes no esperan).
 */
export const REPORTES_PESADOS: readonly string[] = ["dv_notas", "dv_global", "dv_cred", "dv_deser", "dv_matric", "ms_nom"];
export const MAX_SEDES_PESADAS = 2;
export const esPesado = (id: string) => REPORTES_PESADOS.includes(id);

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
    id: "ms_asp",
    sistema: "master",
    nombre: "Aspirantes de pregrado (consolidado)",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_reports/reports/applicants_consolidated/{periodo}/download/",
    cuerpo: "type, title, title_doc, formation (pre), report",
    estado: "listo",
    privacidad: "Solo conteos «ahora / histórico» por estado del proceso, tipo de aspirante y programa. Sin datos de personas.",
    nota:
      "Está en Master: bajo /davinci/ la misma ruta responde 404. El Excel trae una hoja por tipo de aspirante más «Consolidado por tipo» y «por programa»; se aplana en una tabla con el ámbito (detalle, consolidado_tipo, consolidado_programa), el tipo, el programa y, por estado, la cifra actual y la histórica. Se saltan los totales. El periodo se valida contra la lista de periodos de aspirantes de la sede.",
    har: "Consolidado general de Aspirantes (Master)",
  },
  {
    id: "ms_asppos",
    sistema: "master",
    nombre: "Aspirantes de posgrado (consolidado)",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_reports/reports/applicants_consolidated/{periodo}/download/",
    cuerpo: "type, title, title_doc, formation (pos), report",
    estado: "listo",
    privacidad: "Solo conteos «ahora / histórico» por estado del proceso, tipo de aspirante y programa. Sin datos de personas.",
    nota: "Sin verificar: ningún HAR muestra el consolidado de posgrado. Se pide como el de pregrado con formation «pos»; «Sondear» dice si la plataforma lo entrega.",
    har: "sin HAR de posgrado",
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
    nombre: "Deserciones de pregrado (histórico)",
    tipo: "hecho",
    via: "sesion",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/general_defactor_history/download/",
    cuerpo: "type, title, title_doc, report, is_posgraduate (false), initial_period (2014a)",
    estado: "listo",
    privacidad: "Se guarda el código real del estudiante (dato personal), el programa, el periodo de ingreso, PFP, la modalidad y el estado de cada periodo (MP, MAT, AUS, DES, GRAD, DP, PFP).",
    nota:
      "La ruta no lleva periodo: es el histórico completo desde 2014a hasta el periodo abierto. Se guarda con el periodo abierto, que se comprueba con la última columna del Excel y con la lista de periodos de deserciones. ~23.600 filas y 2,7 MB: tarda. La hoja «Convenciones» solo explica las siglas y no se guarda.",
    har: "Reporte historico de deserciones (Davinci)",
  },
  {
    id: "dv_deserpos",
    sistema: "davinci",
    nombre: "Deserciones de posgrado (histórico)",
    tipo: "hecho",
    via: "sesion",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/general_defactor_history/download/",
    cuerpo: "igual que pregrado con is_posgraduate (true)",
    estado: "listo",
    privacidad: "Se guarda el código real del estudiante (dato personal), el programa, el periodo de ingreso, PFP, la modalidad y el estado de cada periodo.",
    nota: "Sin verificar: el HAR solo muestra pregrado. Se supone el mismo cuerpo con is_posgraduate true; «Sondear» lo prueba.",
    har: "sin HAR de posgrado",
  },
  {
    id: "dv_cred",
    sistema: "davinci",
    nombre: "Promedio, créditos y ubicación",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/credits_sumary/{periodo}/download/",
    cuerpo: "type, title, title_doc, report",
    estado: "listo",
    privacidad: "Se guardan código real, estado, créditos, ubicación y promedios. Se descartan nombre, correo personal y celular.",
    nota: "~17.500 filas y 2 MB: tarda. Una fila por estudiante con los créditos del plan, electivas y bienestar, el semestre de ubicación y los promedios.",
    har: "Reporte promedio creditos y ubicacion de estudiantes (Davinci)",
  },
  {
    id: "dv_prom",
    sistema: "davinci",
    nombre: "Promedios de estudiantes",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/student_averages/{periodo}/download/",
    cuerpo: "type, title, title_doc, report",
    estado: "listo",
    privacidad: "Se guardan código real, programa, pénsum, periodo del polígrafo y los dos promedios. Se descartan tipo de documento, identificación y nombre.",
    har: "Reporte de promedios de estudiantes (Davinci)",
  },
  {
    id: "dv_cond",
    sistema: "davinci",
    nombre: "Estudiantes condicionales",
    tipo: "hecho",
    via: "ruta",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/davinci/mod_reports/reports/conditionalities/{periodo}/download/",
    cuerpo: "type, title, title_doc, report",
    estado: "listo",
    privacidad: "Se guardan código real, condicionalidades, programa y si está activo (académico y financiero). Se descartan nombre, apellidos e identificación.",
    nota: "El HAR trae pocas filas. Revise con «Sondear» que «Condicionalidades» sea un código y no un texto libre antes de cargar.",
    har: "Reporte estudiantes condicionales (Davinci)",
  },
  {
    id: "ms_nuevos",
    sistema: "master",
    nombre: "Nuevos matriculados",
    tipo: "hecho",
    via: "cuerpo",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_reports/reports/new_students_matriculated/download/",
    cuerpo: "type (pdf), size, orientation, author, fields, fields_size, title, name_doc, status, report (matriculated), selected_period",
    estado: "listo",
    privacidad:
      "La misma política de «Estudiantes matriculados»: programa, pénsum, jornada, ubicación, créditos, promedios y fechas de matrícula; código real (dato personal), grupo etario y origen derivados. Se descartan documento, nombres, género, nacimiento, ciudad, dirección, barrio, estrato, teléfonos, correo, colegio, salud y responsable.",
    nota:
      "El Excel trae 36 columnas con datos personales y de salud: la política descarta lo no permitido antes de guardar. No dice de qué periodo es: solo se guarda el periodo abierto de la sede (si se pide otro, falla).",
    har: "Reporte Estudiantes Nuevos Matriculados (Master)",
  },
  {
    id: "ms_activos",
    sistema: "master",
    nombre: "Estudiantes activos",
    tipo: "hecho",
    via: "cuerpo",
    entrega: "tarea",
    metodo: "POST",
    ruta: "/master/mod_reports/reports/active_students/",
    cuerpo: "igual que nuevos matriculados, con title «Reporte de estudiantes activos»",
    estado: "listo",
    privacidad: "La misma política de «Estudiantes matriculados»: código real (dato personal), grupo etario y origen derivados; sin documento, nombres, contacto, dirección ni salud.",
    nota:
      "Es una tarea: la plataforma responde un task_id y el Excel llega en task_state/{id}. El HAR la muestra terminar (~4.400 filas, ~1 MB). El nombre de la tarea trae el periodo y se compara con el pedido.",
    har: "Reporte de estudiantes activos (Master)",
  },
  {
    id: "ms_actdir",
    sistema: "master",
    nombre: "Actividades directas y de apoyo",
    tipo: "hecho",
    via: "sesion",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_activities/activities/download/",
    cuerpo: "code, name, is_active, cp, limit, page, orderField, orderReverse, title",
    estado: "listo",
    privacidad: "Código, nombre, tipo, instrucciones, si está activa, si es directa y los tipos de vinculación. Sin datos de personas.",
    nota: "Distinto del catálogo «Actividades» (JSON): este es el reporte con instrucciones y vinculación. El Excel no nombra el periodo; se guarda con el abierto.",
    har: "Reporte de Actividades directas y de apoyo (Master)",
  },
  {
    id: "ms_posgmat",
    sistema: "master",
    nombre: "Matrícula de posgrados (por estudiante)",
    tipo: "hecho",
    via: "sesion",
    entrega: "archivo",
    metodo: "POST",
    ruta: "/master/mod_postgraduate_reports/postgraduate_reports/postgraduate_enrollments_groups/download/",
    cuerpo: "type, title, title_doc, fields",
    estado: "listo",
    privacidad: "Se guardan código real, programa, materia y grupo. Se descartan el documento y el nombre del estudiante.",
    nota: "Distinto de «Matriculados por grupo (posgrado)»: aquel cuenta matriculados por grupo; este trae una fila por estudiante y materia (~2.450 filas).",
    har: "Reporte matricula posgrados (Master)",
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
    ruta: "/master/mod_reports/reports/paysheet/consolidated/download/",
    cuerpo: "type, size, orientation, author, fields, fields_size, title, name_doc, status, report (paysheet), selected_period",
    estado: "listo",
    privacidad: "Carga académica por docente: asignatura, grupo, horas y programa. Se descartan nombres, correos y observaciones; la cédula queda como seudónimo.",
    nota:
      "Es una tarea: la plataforma responde un task_id y el Excel llega en task_state/{id} (~1 minuto en Bucaramanga). Reemplaza a la ruta anterior (consolidated_table). El Excel trae tres filas de título y 18 columnas; el título dice el periodo y se compara con el pedido. selected_period va en null cuando se pide el periodo abierto.",
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

/**
 * ¿Se puede cargar con el Excel descargado de la plataforma? Los que la plataforma entrega como tarea
 * también llegan como Excel (se descarga igual desde su pantalla); los catálogos JSON no.
 */
export const cargaPorArchivo = (c: Conjunto) => cargable(c) && c.entrega !== "json";

/** Cómo se agrupan los conjuntos en el catálogo y en las cargas. */
export type GrupoConjunto = "estudiantes" | "admisiones" | "permanencia" | "docentes" | "horarios" | "posgrado" | "catalogos";
export const GRUPOS: Record<GrupoConjunto, { nombre: string; detalle: string }> = {
  estudiantes: { nombre: "Estudiantes", detalle: "Matrícula, notas y rendimiento" },
  admisiones: { nombre: "Admisiones y egreso", detalle: "Aspirantes, graduados y homologaciones" },
  permanencia: { nombre: "Permanencia y riesgo", detalle: "Promedios, créditos, condicionales y deserción" },
  docentes: { nombre: "Docentes y actividades", detalle: "Nómina, evaluación y actividades" },
  horarios: { nombre: "Horarios y aulas", detalle: "Horarios, auditoría, uso de aulas y equipos" },
  posgrado: { nombre: "Posgrado", detalle: "Matrícula, aspirantes y deserción de posgrado" },
  catalogos: { nombre: "Catálogos", detalle: "Listas de programas, aulas, cursos y periodos" },
};
const GRUPO_DE: Record<string, GrupoConjunto> = {
  ma_rendimiento: "estudiantes",
  dv_matric: "estudiantes",
  dv_global: "estudiantes",
  dv_notas: "estudiantes",
  ms_nuevos: "estudiantes",
  ms_activos: "estudiantes",
  dv_fin: "estudiantes",
  ms_asp: "admisiones",
  dv_grad: "admisiones",
  dv_homol: "admisiones",
  dv_cred: "permanencia",
  dv_prom: "permanencia",
  dv_cond: "permanencia",
  dv_deser: "permanencia",
  ms_asppos: "posgrado",
  dv_deserpos: "posgrado",
  ms_posg: "posgrado",
  ms_posgmat: "posgrado",
  ms_nom: "docentes",
  ms_comp: "docentes",
  ms_eval: "docentes",
  ms_doc: "docentes",
  ms_actdir: "docentes",
  ms_hor: "horarios",
  ms_hordep: "horarios",
  ms_audit: "horarios",
  gl_uso: "horarios",
  gl_eq: "horarios",
};
export const grupoDe = (c: Conjunto): GrupoConjunto => (c.tipo === "catalogo" ? "catalogos" : (GRUPO_DE[c.id] ?? "estudiantes"));

/** Los conjuntos agrupados, en el orden de GRUPOS, para mostrarlos en secciones. */
export function agrupar<T extends Conjunto>(lista: T[]): { grupo: GrupoConjunto; conjuntos: T[] }[] {
  return (Object.keys(GRUPOS) as GrupoConjunto[]).map((grupo) => ({ grupo, conjuntos: lista.filter((c) => grupoDe(c) === grupo) })).filter((g) => g.conjuntos.length > 0);
}

/**
 * Periodos que ofrece el almacén cuando la plataforma no los ha dicho: desde 2018b (el primero de get_periods hasta
 * el semestre en curso). Enero a junio es «a»; julio a diciembre, «b». Con la plataforma disponible se usa `mezclarPeriodos`.
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

/**
 * La lista de periodos que se ofrece en pantalla: los que la plataforma de la sede dice tener (get_periods) más los ya
 * guardados. Si la plataforma no responde, los guardados más los que se calculan desde 2018b.
 */
export function mezclarPeriodos(plataforma: string[] | undefined, guardados: string[], hoy = new Date()): string[] {
  const valido = (p: string) => /^[0-9]{4}[ab]$/.test(p);
  const todos = new Set<string>([...(plataforma?.length ? plataforma : periodosDisponibles(hoy)).filter(valido), ...guardados.filter(valido)]);
  return [...todos].sort().reverse();
}
