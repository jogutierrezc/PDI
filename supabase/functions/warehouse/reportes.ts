/* =============================================================================
   Warehouse UDES · cómo se pide cada reporte a las plataformas.

   Todo sale de los HAR de «har warehouse» (Capa 1–3): la ruta, el cuerpo y la
   forma en que llega el archivo. Es lógica pura (sin red), para poder probar
   que cada petición es la que el HAR muestra. La función `warehouse` la usa
   para pedir; la pantalla, para saber cómo leer un Excel cargado a mano.

   Las tres plataformas viven en el mismo servidor de cada sede
   (https://master-{sede}.udes.edu.co:81) bajo /master/, /galileo/ y /davinci/,
   y cada una inicia sesión por separado (/{sistema}/mod_auth/login/).

   `verificado: false` quiere decir que el HAR no mostró la petición completa o
   su respuesta: el reporte se puede probar con «Sondear» (que no guarda nada),
   pero no se da por bueno hasta ver su encabezado.
   ========================================================================== */

/** Cómo se lee lo que entrega el reporte (el mismo tipo de motor.ts; aquí no se importa para no atar este archivo a Deno). */
export type Lector = "hoja" | `encabezado:${string}` | "uso-aulas" | "json";

export type SistemaApi = "davinci" | "galileo" | "master";

export interface Contexto {
  /** Sede: buc, val, cuc o bog. */
  sede: string;
  /** Periodo pedido (2026b). Para los reportes «de sesión» es el abierto en Master. */
  periodo: string;
  /** Corte del reporte de rendimiento: 1, 2, 3 o f. */
  corte: string;
  /** Usuario de la cuenta de servicio (algunos reportes de evaluación lo piden en el cuerpo). */
  usuario: string;
  /** Edificio, solo para la auditoría de horarios. */
  edificio?: { code: string; name: string };
}

export interface Peticion {
  metodo: "GET" | "POST";
  /** Ruta sin servidor ni token: «/davinci/mod_reports/…». */
  ruta: string;
  cuerpo?: Record<string, unknown>;
  /** Parámetros de la URL además del token (p. ej. selected_period). */
  consulta?: Record<string, string>;
}

export interface Reporte {
  id: string;
  sistema: SistemaApi;
  /** archivo: el Excel llega en la respuesta · tarea: se inicia y se espera · json: la respuesta es la lista. */
  entrega: "archivo" | "tarea" | "json";
  lector: Lector;
  /** ruta: el periodo va en la ruta · consulta: en selected_period · sesion: lo fija la sesión · ninguno. */
  periodoVia: "ruta" | "consulta" | "sesion" | "ninguno";
  corte?: boolean;
  /** Se pide una vez por edificio y se juntan. */
  porEdificio?: boolean;
  verificado: boolean;
  /** Pedidos adicionales que se juntan con el primero (departamentos de pregrado y de posgrado). */
  armar: (c: Contexto) => Peticion;
  extra?: ((c: Contexto) => Peticion)[];
}

const SEDE_TITULO: Record<string, string> = { buc: "BUC", val: "VAL", cuc: "CUC", bog: "BOG" };
const NOMBRE_SEDE: Record<string, string> = { buc: "Bucaramanga", val: "Valledupar", cuc: "Cúcuta", bog: "Bogotá" };
const sedeTxt = (c: Contexto) => SEDE_TITULO[c.sede] ?? c.sede.toUpperCase();
const EXCEL = "application/vnd.ms-excel";
const AUTOR = "Master - Web: Gestión integral de horarios ";
const NOMINA_CAMPOS = ["apellidos y nombres", "cédula", "contrato", "asignatura/actividad", "tipo act.", "código", "tipo de actividad", "grp", "dpto/carrera", "horas", "h x sem", "semanas", "mat", "observaciones"];

const json = (id: string, sistema: SistemaApi, ruta: string, periodoVia: Reporte["periodoVia"] = "ninguno", extra?: Reporte["extra"]): Reporte => ({
  id,
  sistema,
  entrega: "json",
  lector: "json",
  periodoVia,
  verificado: true,
  armar: () => ({ metodo: "GET", ruta }),
  extra,
});

export const REPORTES: Reporte[] = [
  {
    id: "ma_rendimiento",
    sistema: "master",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "sesion",
    corte: true,
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_reports/reports/matriculated_mortality/download/",
      cuerpo: { period: c.corte, title: `Reporte de rendimiento académico del corte ${c.corte === "f" ? "definitiva" : c.corte} - ${sedeTxt(c)} ${c.periodo.toUpperCase()}` },
    }),
  },
  {
    id: "dv_matric",
    sistema: "davinci",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "ruta",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/davinci/mod_reports/reports/students_matriculated/${c.periodo}/download/`,
      // Los HAR muestran esta selección (semestres 5 a 8 y electivas). Si el filtro limita los semestres,
      // el reporte no trae a todos: ver la nota del catálogo.
      cuerpo: { type: EXCEL, title: `Estudiantes matriculados ${sedeTxt(c)} ${c.periodo}`, title_doc: "estudiantes_matriculados", report: "estudiantes_matriculados", courses: ["8", "elective", "7", "6", "5"] },
    }),
  },
  {
    id: "dv_global",
    sistema: "davinci",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "ruta",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/davinci/mod_reports/reports/global_enrollments/${c.periodo}/download/`,
      cuerpo: { type: EXCEL, title: `Reporte global de matriculas ${sedeTxt(c)} ${c.periodo}`, title_doc: "Reporte_Global_matriculas", report: "Reporte_Global_matriculas" },
    }),
  },
  {
    id: "dv_notas",
    sistema: "davinci",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "ruta",
    verificado: true,
    // «Reporte global de notas»: una fila por estudiante y materia con P1, P2, P3 y la nota acumulada.
    // El HAR pide type «pdf» y el servidor responde un Excel; se pide igual que la pantalla.
    armar: (c) => ({
      metodo: "POST",
      ruta: `/davinci/mod_reports/reports/global_scores/${c.periodo}/download/`,
      cuerpo: {
        type: "pdf",
        title: `Reporte global de notas ${sedeTxt(c)} ${c.periodo}`,
        title_doc: `Reporte global de notas ${sedeTxt(c)} ${c.periodo}`,
        report: `Reporte global de notas ${sedeTxt(c)} ${c.periodo}`,
      },
    }),
  },
  {
    id: "dv_fin",
    sistema: "davinci",
    entrega: "tarea",
    lector: "hoja",
    periodoVia: "ruta",
    // El HAR muestra la tarea y 230 consultas de estado, pero se cerró antes de que terminara.
    verificado: false,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/davinci/mod_reports/reports/general_enrollment_and_financial_report/${c.periodo}/task/`,
      cuerpo: {
        type: EXCEL,
        title: `Reporte financiero general de estudiantes ${c.periodo}`,
        title_doc: "estudiantes_inactivos_financieramente",
        report: "estudiantes_inactivos_financieramente",
        conditions: [
          { name: "financially_active", selected: true, description: "Estudiantes financieramente activos" },
          { name: "financially_inactive", selected: true, description: "Estudiantes financieramente inactivos" },
          { name: "enrolled", selected: true, description: "Estudiantes con matrícula académica" },
          { name: "not_enrolled", selected: true, description: "Estudiantes sin matrícula académica" },
          { name: "only_new", selected: false, description: "Sólo estudiantes nuevos" },
        ],
      },
    }),
  },
  {
    id: "dv_grad",
    sistema: "davinci",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "ruta",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/davinci/mod_reports/reports/graduates/${c.periodo}/all/download/`,
      cuerpo: { type: "xls", title: `Reporte de graduados - ${sedeTxt(c)} ${c.periodo}`, name_doc: "reporte_graduados.xls" },
    }),
  },
  {
    id: "dv_homol",
    sistema: "davinci",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "ruta",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/davinci/mod_reports/reports/homologations_report/${c.periodo}/download/`,
      cuerpo: { type: EXCEL, title: `Reporte de indicadores para la gestión de homologaciones - ${sedeTxt(c)} ${c.periodo}`, title_doc: "reporte_homologaciones", report: "reporte_homologaciones" },
    }),
  },
  {
    id: "dv_asp",
    sistema: "davinci",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "ruta",
    // Los dos HAR de aspirantes están cortados: solo se conoce la ruta, y se supone el mismo cuerpo de los demás.
    verificado: false,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/davinci/mod_reports/reports/applicants_consolidated/${c.periodo}/download/`,
      cuerpo: { type: EXCEL, title: `Reporte consolidado de aspirantes ${sedeTxt(c)} ${c.periodo}`, title_doc: "aspirantes_consolidado", report: "aspirantes_consolidado" },
    }),
  },
  {
    id: "gl_uso",
    sistema: "galileo",
    entrega: "archivo",
    lector: "uso-aulas",
    periodoVia: "sesion",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/galileo/mod_reports/reports/croom_usage_rate/download/",
      cuerpo: { type: EXCEL, title: `Porcentaje de uso de aulas - ${sedeTxt(c)} ${c.periodo.toUpperCase()}`, title_doc: "usage_rates", report: "usage_rates", week: 0 },
    }),
  },
  {
    id: "ms_hor",
    sistema: "master",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "sesion",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_schedules/schedules/download/",
      cuerpo: {
        type: "xls",
        orientation: "portrait",
        size: "letter",
        title: `Reporte de horarios - ${sedeTxt(c)} ${c.periodo.toUpperCase()}`,
        fields: ["Grupo", "Docente", "Aula", "Día", "Hora", "Fecha"],
        author: AUTOR,
        name_doc: `Reporte de horarios - ${sedeTxt(c)} ${c.periodo.toUpperCase()}.pdf`,
        title_doc: "schedules",
        report: "schedules",
      },
    }),
  },
  {
    id: "ms_hordep",
    sistema: "master",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "sesion",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_reports/reports/excel/departments_schedules/download/",
      cuerpo: { type: EXCEL, title: `Reporte general de horarios - ${sedeTxt(c)} ${c.periodo.toUpperCase()}`, title_doc: "departments_schedules", report: "departments_schedules" },
    }),
  },
  {
    id: "ms_audit",
    sistema: "master",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "sesion",
    porEdificio: true,
    verificado: true,
    armar: (c) => {
      const e = c.edificio ?? { code: "00", name: "BLOQUE VIRTUAL" };
      return {
        metodo: "POST",
        ruta: `/master/mod_reports/reports/schedules/audit/${e.code}/1/download/`,
        cuerpo: {
          type: "xlsx",
          size: "A4",
          orientation: "landscape",
          author: AUTOR,
          title: `Reporte de auditoria académica - ${e.name} - ${sedeTxt(c)} ${c.periodo.toUpperCase()}`,
          building_name: e.name,
          format: 1,
          fields: ["Hora Inicio", "Hora Fin", "Día", "Bloque-Piso", "Aula", "Programa", "Código", "Asignatura", "Grupo", "Docente", "Estudiantes", "Observaciones"],
          name_doc: `reporte_auditoria_academica - ${e.name}.xlsx`,
        },
      };
    },
  },
  {
    id: "ms_nom",
    sistema: "master",
    entrega: "tarea",
    // El Excel trae cuatro filas de título antes de la tabla, que empieza en «CÉDULA».
    lector: "encabezado:cedula",
    periodoVia: "sesion",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_reports/reports/paysheet/consolidated_table/download/",
      cuerpo: {
        type: "xls",
        size: "A4",
        orientation: "landscape",
        author: AUTOR,
        fields: NOMINA_CAMPOS,
        fields_size: [12, 7, 10, 15, 6, 4, 12, 4, 5, 5, 4, 10],
        title: `Reporte consolidado nómina de profesores ${sedeTxt(c)} ${c.periodo.toUpperCase()}`,
        name_doc: "reporte_consolidado_nomina_profesores.xlsx",
        selected_period: null,
        status: [true, false, false, false],
      },
    }),
  },
  {
    id: "ms_comp",
    sistema: "master",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "consulta",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_details_prof_eval_periods/details_prof_eval_periods/get_consolidated_by_competence_xls/download/",
      consulta: { selected_period: c.periodo },
      cuerpo: { title: `Informe por Competencias ${NOMBRE_SEDE[c.sede] ?? c.sede} ${c.periodo}`, title_doc: "Informe por Competencias.xlsx", period: c.periodo },
    }),
  },
  {
    id: "ms_eval",
    sistema: "master",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "consulta",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_details_prof_eval_periods/details_prof_eval_periods/get_consolidated_report/download/",
      consulta: { selected_period: c.periodo },
      cuerpo: { title: `Consolidado general evaluación ${NOMBRE_SEDE[c.sede] ?? c.sede} ${c.periodo}`, title_doc: "consolidado.xlsx", username: c.usuario },
    }),
  },
  {
    id: "ms_posg",
    sistema: "master",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "sesion",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_postgraduate_reports/postgraduate_reports/enrollments_group/download/",
      cuerpo: {
        type: "xls",
        title: `Matriculados por grupos - ${sedeTxt(c)} ${c.periodo.toUpperCase()}`,
        title_doc: "Matriculados por grupo",
        fields: ["Código", "Materia", "Grupo", "Matri/Cap", "Ofertado por", "Car. Ofertada", "Docente", "Estado Docente", "Hor. Semana", "Matriculable Estudiante", "Matriculable Coordinador", "Electiva"],
        dpt_ref: "0",
        show_actives: true,
        is_postgraduate: "1",
      },
    }),
  },
  json("ms_doc", "master", "/master/mod_reports/reports/prepare_professors/", "sesion"),
  json("gl_eq", "galileo", "/galileo/mod_reports/reports/equipments/", "sesion"),
  json("dm_prog", "davinci", "/davinci/mod_reports/reports/programs/"),
  json("dm_dep", "master", "/master/mod_reports/reports/pregraduate_departments/", "ninguno", [() => ({ metodo: "GET", ruta: "/master/mod_reports/reports/posgraduate_departments/" })]),
  json("dm_aula", "galileo", "/galileo/mod_reports/reports/classrooms/"),
  json("dm_edi", "galileo", "/galileo/mod_reports/reports/buildings/"),
  json("dm_cur", "master", "/master/mod_reports/reports/courses/"),
  json("dm_act", "master", "/master/mod_reports/reports/activities/"),
  json("dm_con", "master", "/master/mod_reports/reports/contracts/"),
  json("dm_grp", "master", "/master/mod_reports/reports/grprogs/"),
  json("dm_per", "davinci", "/davinci/mod_reports/reports/get_periods/"),
];

export const reportePorId = (id: string): Reporte | undefined => REPORTES.find((r) => r.id === id);

/** Cómo leer un Excel cargado a mano de este conjunto. */
export const lectorDe = (id: string): Lector => reportePorId(id)?.lector ?? "hoja";

/** Los edificios de Galileo (`buildings`), de donde sale la lista para la auditoría. */
export function edificiosDe(msg: unknown): { code: string; name: string }[] {
  if (!Array.isArray(msg)) return [];
  return msg
    .map((e) => (e ?? {}) as { code?: unknown; name?: unknown })
    .filter((e) => typeof e.code === "string" && typeof e.name === "string")
    .map((e) => ({ code: e.code as string, name: e.name as string }));
}

/** Lo que va después de la ruta: token, llave y, si hay, los parámetros propios. */
export function consultaDe(token: string, apiKey: string, propia?: Record<string, string>): string {
  const q = new URLSearchParams({ token, api_key: apiKey, ...(propia ?? {}), _: String(Math.random()) });
  return q.toString();
}

/** ¿Qué dice la tarea de Master o de Davinci? `msg.state` y, al terminar, el Excel en `msg.data`. */
export function estadoTarea(respuesta: unknown): { listo: boolean; fallo: boolean; base64?: string; progreso?: number } {
  const msg = (respuesta as { msg?: Record<string, unknown> } | null)?.msg;
  if (!msg || typeof msg !== "object") return { listo: false, fallo: false };
  const estado = String(msg.state ?? "").toUpperCase();
  const data = msg.data;
  if (typeof data === "string" && data.startsWith("UEsDB")) return { listo: true, fallo: false, base64: data, progreso: 100 };
  return { listo: false, fallo: estado === "FAILURE" || estado === "REVOKED", progreso: typeof msg.progress === "number" ? msg.progress : undefined };
}
