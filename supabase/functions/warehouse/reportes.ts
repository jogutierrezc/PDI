/* =============================================================================
   Warehouse UDES · cómo se pide cada reporte a las plataformas.

   Todo sale de los HAR de «har warehouse» (Capa 1–3 y los de octubre de 2026,
   carpetas «Master Har» y «davinci har»): la ruta, el cuerpo y la forma en que
   llega el archivo. Es lógica pura (sin red), para poder probar que cada
   petición es la que el HAR muestra. La función `warehouse` la usa para pedir;
   la pantalla, para saber cómo leer un Excel cargado a mano.

   Las tres plataformas viven en el mismo servidor de cada sede
   (https://master-{sede}.udes.edu.co:81) bajo /master/, /galileo/ y /davinci/,
   y cada una inicia sesión por separado (/{sistema}/mod_auth/login/). Todos los
   HAR son de Bucaramanga (BUC): las otras tres sedes (CUC, VAL, BOG) usan la misma
   ruta con su servidor y el código de la sede en el título; hasta que haya un HAR
   de cada una, «Sondear» por sede es la prueba (revisa también que las columnas
   que la política conserva sigan en el archivo).

   Cómo se identifica el periodo (`periodoVia`):
     ruta     va en la ruta (/{periodo}/): la plataforma deja pedir cualquiera.
     consulta va en ?selected_period=: Master lo acepta en algunos reportes.
     cuerpo   va en el cuerpo (selected_period): Master lo trae null (el periodo abierto).
     sesion   lo fija la sesión (current_period): solo el periodo abierto.
     ninguno  catálogos; se guardan como «permanente».
   Lo que la plataforma devuelve se compara con lo pedido (`confirma`): si el
   archivo, el nombre de la tarea o las columnas dicen otro periodo, la carga
   falla en vez de guardarse con el periodo equivocado.

   `verificado: false` quiere decir que el HAR no mostró la petición completa o
   su respuesta: el reporte se puede probar con «Sondear» (que no guarda nada),
   pero no se da por bueno hasta ver su encabezado.
   ========================================================================== */

/** Cómo se lee lo que entrega el reporte (el mismo tipo de motor.ts; aquí no se importa para no atar este archivo a Deno). */
export type Lector = "hoja" | "tabla" | `encabezado:${string}` | "uso-aulas" | "json" | "aspirantes" | "desercion";

export type SistemaApi = "davinci" | "galileo" | "master";

export interface Contexto {
  /** Sede: buc, val, cuc o bog. */
  sede: string;
  /** Periodo pedido (2026b). Para los reportes «de sesión» es el abierto en la plataforma. */
  periodo: string;
  /** El periodo abierto de la sesión (current_period). Cuando coincide con el pedido, Master se pide como en el HAR (selected_period null). */
  abierto: string;
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
  /** ruta: el periodo va en la ruta · consulta: en ?selected_period · cuerpo: en selected_period del cuerpo · sesion: lo fija la sesión · ninguno. */
  periodoVia: "ruta" | "consulta" | "cuerpo" | "sesion" | "ninguno";
  /**
   * Dónde se puede leer de qué periodo es lo que devolvió la plataforma:
   *   archivo   títulos o nombres de hoja que arma la plataforma (no el título que enviamos, que vuelve como eco);
   *   tarea     el nombre de la tarea (o, si no, el archivo);
   *   columnas  la última columna de periodo de un histórico.
   * Sin esto el periodo solo se da por bueno cuando es el abierto de la sesión o el reporte está `periodoProbado`.
   */
  confirma?: "archivo" | "tarea" | "columnas";
  /** Se comprobó contra la plataforma que respeta el periodo pedido aunque el archivo no lo diga. */
  periodoProbado?: boolean;
  /** Qué lista de periodos de Master vale para este reporte (periods_applicants o periods_to_student_desertion_report). */
  listaPeriodos?: "aspirantes" | "deserciones";
  /** Advertencias para «Sondear» sobre lo que puede ser propio de Bucaramanga. */
  avisos?: string[];
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
/** «26/10/2026 11:35:25» en hora de Colombia: el título de la nómina lleva la hora en que se pide. */
function fechaHoraTitulo(ahora = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(ahora)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}
/** selected_period del cuerpo de Master: null (el periodo abierto) cuando se pide ese, y el periodo cuando es otro. */
const periodoCuerpo = (c: Contexto): string | null => (c.periodo === c.abierto ? null : c.periodo);
/** ?selected_period= de la URL, solo cuando el periodo pedido no es el abierto. */
const periodoConsulta = (c: Contexto): Record<string, string> | undefined => (c.periodo === c.abierto ? undefined : { selected_period: c.periodo });
const NOMINA_CAMPOS = ["apellidos y nombres", "cédula", "contrato", "asignatura/actividad", "tipo act.", "código", "tipo de actividad", "grp", "dpto/carrera", "horas", "h x sem", "semanas", "mat", "observaciones"];
/**
 * El cuerpo que Master espera para nómina, nuevos matriculados y estudiantes activos: los tres HAR llevan los mismos
 * campos (los de la nómina, aunque el reporte sea otro), `status` y `selected_period`. Cambian `type`, `title`,
 * `name_doc` y `report`.
 */
const cuerpoMaster = (c: Contexto, type: "xls" | "pdf", resto: Record<string, unknown>): Record<string, unknown> => ({
  type,
  size: "A4",
  orientation: "landscape",
  author: AUTOR,
  fields: NOMINA_CAMPOS,
  fields_size: [12, 7, 10, 15, 6, 4, 12, 4, 5, 5, 4, 10],
  ...resto,
  status: [true, false, false, false],
  selected_period: periodoCuerpo(c),
});

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
    // Master acepta selected_period en la URL (verificado contra la plataforma, 2026-10-15):
    // sin él entrega el periodo abierto de la sesión; con él, cualquiera de get_periods (desde 2018b).
    periodoVia: "consulta",
    periodoProbado: true,
    corte: true,
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_reports/reports/matriculated_mortality/download/",
      consulta: { selected_period: c.periodo },
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
    avisos: ["El filtro «courses» (semestres 5 a 8 y electivas) sale del HAR de Bucaramanga: si esta sede tiene otros semestres, el reporte podría no traer a todos. Compare el número de filas con el de la plataforma."],
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
    // El Excel trae el nombre de la universidad y «GESTION DE HOMOLOGACIONES - PERIODO 2026B» antes de la tabla.
    lector: "tabla",
    periodoVia: "ruta",
    confirma: "archivo",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/davinci/mod_reports/reports/homologations_report/${c.periodo}/download/`,
      cuerpo: { type: EXCEL, title: `Reporte de indicadores para la gestión de homologaciones - ${sedeTxt(c)} ${c.periodo}`, title_doc: "reporte_homologaciones", report: "reporte_homologaciones" },
    }),
  },
  {
    // Aspirantes de pregrado. Está en MASTER: bajo /davinci/ la misma ruta responde 404 (HAR de Davinci y de Master).
    // El HAR de Master muestra un 404 en el primer intento (con la sesión de más de diez minutos) y un 200 tras iniciar sesión de nuevo.
    id: "ms_asp",
    sistema: "master",
    entrega: "archivo",
    lector: "aspirantes",
    periodoVia: "ruta",
    confirma: "archivo",
    listaPeriodos: "aspirantes",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/master/mod_reports/reports/applicants_consolidated/${c.periodo}/download/`,
      cuerpo: { type: EXCEL, title: `Consolidado general de aspirantes de pregrado - ${sedeTxt(c)} ${c.periodo}`, title_doc: "consolidado_aspirantes", formation: "pre", report: "consolidado_aspirantes" },
    }),
  },
  {
    // Posgrado: ningún HAR lo muestra. Se supone la misma ruta con formation «pos» y el título análogo.
    id: "ms_asppos",
    sistema: "master",
    entrega: "archivo",
    lector: "aspirantes",
    periodoVia: "ruta",
    confirma: "archivo",
    listaPeriodos: "aspirantes",
    verificado: false,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/master/mod_reports/reports/applicants_consolidated/${c.periodo}/download/`,
      cuerpo: { type: EXCEL, title: `Consolidado general de aspirantes de posgrado - ${sedeTxt(c)} ${c.periodo}`, title_doc: "consolidado_aspirantes", formation: "pos", report: "consolidado_aspirantes" },
    }),
  },
  {
    id: "dv_cred",
    sistema: "davinci",
    entrega: "archivo",
    lector: "tabla",
    periodoVia: "ruta",
    // ~17.500 filas y 2 MB en base64: tarda. Trae correo personal y celular; la política los descarta.
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/davinci/mod_reports/reports/credits_sumary/${c.periodo}/download/`,
      cuerpo: { type: EXCEL, title: `Promedio, créditos y ubicación de estudiantes - ${sedeTxt(c)} ${c.periodo}`, title_doc: `ReportePromedio${c.periodo}`, report: `ReportePromedio${c.periodo}` },
    }),
  },
  {
    id: "dv_prom",
    sistema: "davinci",
    entrega: "archivo",
    lector: "tabla",
    periodoVia: "ruta",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: `/davinci/mod_reports/reports/student_averages/${c.periodo}/download/`,
      cuerpo: { type: EXCEL, title: `Reporte de promedios de estudiantes - ${sedeTxt(c)} ${c.periodo}`, title_doc: `ReportePromedio${c.periodo}`, report: `ReportePromedio${c.periodo}` },
    }),
  },
  {
    id: "dv_cond",
    sistema: "davinci",
    entrega: "archivo",
    lector: "tabla",
    periodoVia: "ruta",
    verificado: true,
    armar: (c) => {
      const titulo = `Reporte de estudiantes condicionales - ${sedeTxt(c)} ${c.periodo}`;
      return { metodo: "POST", ruta: `/davinci/mod_reports/reports/conditionalities/${c.periodo}/download/`, cuerpo: { type: EXCEL, title: titulo, title_doc: titulo, report: titulo } };
    },
  },
  {
    // La ruta NO lleva periodo: es el histórico completo desde initial_period hasta el periodo abierto. Se asocia al
    // periodo abierto (la última columna del Excel), que se comprueba contra el que informa la plataforma.
    id: "dv_deser",
    sistema: "davinci",
    entrega: "archivo",
    lector: "desercion",
    periodoVia: "sesion",
    confirma: "columnas",
    listaPeriodos: "deserciones",
    verificado: true,
    armar: (c) => {
      const titulo = `Reporte historico de desertores de pregrado - ${sedeTxt(c)} 2014a`;
      return { metodo: "POST", ruta: "/davinci/mod_reports/reports/general_defactor_history/download/", cuerpo: { type: EXCEL, title: titulo, title_doc: titulo, report: titulo, is_posgraduate: false, initial_period: "2014a" } };
    },
  },
  {
    // El HAR solo muestra pregrado (is_posgraduate false). Posgrado se supone con el mismo cuerpo y is_posgraduate true.
    id: "dv_deserpos",
    sistema: "davinci",
    entrega: "archivo",
    lector: "desercion",
    periodoVia: "sesion",
    confirma: "columnas",
    listaPeriodos: "deserciones",
    verificado: false,
    armar: (c) => {
      const titulo = `Reporte historico de desertores de posgrado - ${sedeTxt(c)} 2014a`;
      return { metodo: "POST", ruta: "/davinci/mod_reports/reports/general_defactor_history/download/", cuerpo: { type: EXCEL, title: titulo, title_doc: titulo, report: titulo, is_posgraduate: true, initial_period: "2014a" } };
    },
  },
  {
    // Nuevos matriculados: Excel directo (ficha de 36 columnas, con datos personales y sensibles que la política descarta).
    // El Excel no dice de qué periodo es: solo se acepta el periodo abierto (la plataforma lo entrega con selected_period null).
    id: "ms_nuevos",
    sistema: "master",
    entrega: "archivo",
    lector: "tabla",
    periodoVia: "cuerpo",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_reports/reports/new_students_matriculated/download/",
      consulta: periodoConsulta(c),
      cuerpo: cuerpoMaster(c, "pdf", { title: `Reporte de nuevos matriculados - ${sedeTxt(c)} ${c.periodo.toUpperCase()}`, name_doc: "reporte_nuevos_matriculados.xlsx", report: "matriculated" }),
    }),
  },
  {
    // Estudiantes activos: es una tarea (el HAR la muestra terminar con el Excel en task_state). El nombre de la tarea
    // trae el periodo («Reporte de estudiantes activos - BUC 2026b.xlsx»): con él se comprueba.
    id: "ms_activos",
    sistema: "master",
    entrega: "tarea",
    lector: "tabla",
    periodoVia: "cuerpo",
    confirma: "tarea",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_reports/reports/active_students/",
      consulta: periodoConsulta(c),
      cuerpo: cuerpoMaster(c, "pdf", { title: "Reporte de estudiantes activos", name_doc: "reporte_estudiantes_activos.xlsx", report: "matriculated" }),
    }),
  },
  {
    id: "ms_actdir",
    sistema: "master",
    entrega: "archivo",
    // Dos filas de título y «Generado: fecha» antes de la tabla; el Excel no nombra el periodo (es la lista vigente de actividades).
    lector: "tabla",
    periodoVia: "sesion",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_activities/activities/download/",
      cuerpo: { code: "", name: "", is_active: true, cp: "cp", limit: 10, page: 0, orderField: "code", orderReverse: -1, title: `Actividades directas y de apoyo - ${sedeTxt(c)} ${c.periodo.toUpperCase()}` },
    }),
  },
  {
    // Matrícula de posgrados por estudiante y grupo. Distinto de ms_posg (matriculados por grupo, sin estudiantes): este trae
    // documento y nombre del estudiante, que la política descarta; el código del estudiante se conserva.
    id: "ms_posgmat",
    sistema: "master",
    entrega: "archivo",
    lector: "tabla",
    periodoVia: "sesion",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_postgraduate_reports/postgraduate_reports/postgraduate_enrollments_groups/download/",
      cuerpo: {
        type: EXCEL,
        title: `Reporte de matrículas de posgrados - ${sedeTxt(c)} ${c.periodo.toUpperCase()}`,
        title_doc: "reporte_matriculas_posgrados",
        fields: ["Codigo", "Doc. Estudiante", "Estudiante", "Cod. Programa", "Programa", "Cod. Materia", "Grupo", "Materia"],
      },
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
    // El Excel trae tres filas de título («REPORTE CONSOLIDADO DE NÓMINA 2026B», sede, fecha) y la tabla desde la cuarta:
    // 18 columnas que empiezan en «APELLIDOS Y NOMBRES» (la ruta anterior, consolidated_table, empezaba en «CÉDULA»).
    lector: "tabla",
    // selected_period va en el cuerpo (null = el abierto). El título del Excel y el nombre de la tarea dicen el periodo real.
    periodoVia: "cuerpo",
    confirma: "tarea",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_reports/reports/paysheet/consolidated/download/",
      consulta: periodoConsulta(c),
      cuerpo: cuerpoMaster(c, "xls", {
        title: `Generar reporte de nómina consolidado (${fechaHoraTitulo()}) ${sedeTxt(c)} ${c.periodo.toUpperCase()}`,
        name_doc: `Generar reporte de nómina consolidado ${sedeTxt(c)} ${c.periodo.toUpperCase()}.pdf`,
        report: "paysheet",
      }),
    }),
  },
  {
    id: "ms_comp",
    sistema: "master",
    entrega: "archivo",
    // Tres filas de título («UNIVERSIDAD DE SANTANDER - BUCARAMANGA», nombre del informe, «Generado: fecha») y la tabla desde la sexta.
    lector: "tabla",
    // El HAR lleva `period: "2026B"` (mayúsculas) en el cuerpo y no muestra selected_period en la URL; se envían los dos.
    // El Excel no nombra el periodo: con uno distinto del abierto el resultado queda «sin confirmar».
    periodoVia: "consulta",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_details_prof_eval_periods/details_prof_eval_periods/get_consolidated_by_competence_xls/download/",
      consulta: { selected_period: c.periodo },
      cuerpo: { title: `Informe por Competencias ${NOMBRE_SEDE[c.sede] ?? c.sede} ${c.periodo.toUpperCase()}`, title_doc: "Informe por Competencias.xlsx", period: c.periodo.toUpperCase() },
    }),
  },
  {
    id: "ms_eval",
    sistema: "master",
    entrega: "archivo",
    lector: "tabla",
    // El HAR no muestra selected_period en la URL (solo el título y el usuario). El título del Excel repite el que se envía,
    // así que no confirma el periodo: con uno distinto del abierto el resultado queda «sin confirmar».
    periodoVia: "consulta",
    verificado: true,
    armar: (c) => ({
      metodo: "POST",
      ruta: "/master/mod_details_prof_eval_periods/details_prof_eval_periods/get_consolidated_report/download/",
      consulta: { selected_period: c.periodo },
      cuerpo: { title: `Consolidado general evaluación ${NOMBRE_SEDE[c.sede] ?? c.sede} ${c.periodo.toUpperCase()}`, title_doc: "consolidado.xlsx", username: c.usuario },
    }),
  },
  {
    id: "ms_posg",
    sistema: "master",
    entrega: "archivo",
    lector: "hoja",
    periodoVia: "sesion",
    verificado: true,
    avisos: ["El cuerpo lleva dpt_ref «0» (todos los departamentos) e is_postgraduate «1»: se tomaron de Bucaramanga; en otra sede confirme que traen todos los posgrados."],
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

/**
 * ¿Qué dice la tarea de Master o de Davinci? `msg.state` (BUSY, SUCCESS…) y, al terminar, el Excel en `msg.data`.
 * `nombre` es el que la plataforma le da («Reporte de estudiantes activos - BUC 2026b.xlsx»): trae el periodo real.
 */
export function estadoTarea(respuesta: unknown): { listo: boolean; fallo: boolean; base64?: string; progreso?: number; nombre?: string } {
  const msg = (respuesta as { msg?: Record<string, unknown> } | null)?.msg;
  if (!msg || typeof msg !== "object") return { listo: false, fallo: false };
  const estado = String(msg.state ?? "").toUpperCase();
  const data = msg.data;
  const nombre = typeof msg.name === "string" ? msg.name : undefined;
  if (typeof data === "string" && data.startsWith("UEsDB")) return { listo: true, fallo: false, base64: data, progreso: 100, nombre };
  return { listo: false, fallo: estado === "FAILURE" || estado === "REVOKED", progreso: typeof msg.progress === "number" ? msg.progress : undefined, nombre };
}

/**
 * Las listas de periodos de Master (`get_periods`: [{period, current}]; `periods_to_student_desertion_report`: ["2014a"…];
 * `periods_applicants`: {"2026b": "2026B"}). Devuelve los válidos («2026b»), del más reciente al más antiguo, y cuál está abierto.
 */
export function periodosDeLista(msg: unknown): { periodos: string[]; actual: string | null } {
  const valido = (p: unknown): p is string => typeof p === "string" && /^[0-9]{4}[ab]$/.test(p);
  const vistos = new Set<string>();
  let actual: string | null = null;
  if (Array.isArray(msg)) {
    for (const x of msg) {
      const p = typeof x === "string" ? x : (x as { period?: unknown } | null)?.period;
      if (valido(p)) {
        vistos.add(p);
        if (x && typeof x === "object" && (x as { current?: unknown }).current === true) actual = p;
      }
    }
  } else if (msg && typeof msg === "object") {
    for (const k of Object.keys(msg)) if (valido(k)) vistos.add(k);
  }
  return { periodos: [...vistos].sort().reverse(), actual };
}

/** La sede que dice ser un servidor, según `mod_auth/headquarter` («BUCARAMANGA», «CÚCUTA»…): buc, cuc, val o bog; null si no se reconoce. */
export function sedeDeNombre(nombre: unknown): string | null {
  const n = String(nombre ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (n.includes("BUCARAMANGA")) return "buc";
  if (n.includes("CUCUTA")) return "cuc";
  if (n.includes("VALLEDUPAR")) return "val";
  if (n.includes("BOGOTA")) return "bog";
  return null;
}
