/* =============================================================================
   Prueba de humo.

   Empaqueta la aplicación en un solo archivo, la monta en un DOM sintético y
   recorre cada ruta con un Supabase simulado: la capa de red devuelve
   fixtures con la misma forma que la base de datos real. Así se comprueba lo
   que un typecheck no ve —hooks mal ordenados, accesos a undefined, consultas
   que piden una columna que no existe en la respuesta— sin necesitar un
   proyecto de Supabase levantado.

   No sustituye a mirar el sitio ni a probar las políticas RLS contra la base
   real; verifica que todas las pantallas montan y pintan sus datos.

   Ejecutar con: npm run smoke
   ========================================================================== */

import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { readFileSync } from "node:fs";

/* --- Lo que jamás puede salir en una pantalla pública ----------------------
   El portal es público y las cifras presupuestales de la universidad no lo son.
   Se comprueba pantalla por pantalla, y no en una sola, porque cada una las
   mostraba en un sitio distinto: el tablero en su fila de recursos, la ficha
   del pilar en sus tarjetas, el mapa en sus pestañas y la página de ODS en el
   resumen y en cada proyecto.
   -------------------------------------------------------------------------- */

const SIN_DINERO = ['Presupuesto estimado', 'Presupuesto ejecutado', '$120 M', '120.000.000', '$0'];

/* --- Fixtures: la forma exacta que devuelve PostgREST ---------------------- */

const PILLARS = [
  {
    id: "p1",
    slug: "ambiente-tecnologico",
    numeral: "II",
    name: "Ambiente tecnológico",
    description: "Infraestructura y digitalización de vanguardia.",
    focus: "Infraestructura digital, analítica y servicios.",
    insight: "Priorizar cultura digital.",
    icon: "chip",
    accent_slot: 2,
    impulsor: "Transformación digital",
    contributes: "Continuidad operativa",
    management_owner: "Dirección TIC",
    calculation_owner: "Oficina de Planeación",
    status: "publicado",
    position: 2,
    created_at: "2024-10-15T00:00:00Z",
    updated_at: "2024-10-15T00:00:00Z",
  },
  {
    id: "p2",
    slug: "sostenibilidad",
    numeral: "V",
    name: "Sostenibilidad",
    description: "Compromiso transversal con el cuidado ambiental.",
    focus: "Gestión ambiental, financiera y social.",
    insight: null,
    icon: "leaf",
    accent_slot: 5,
    impulsor: "Equilibrio ambiental",
    contributes: "Viabilidad de largo plazo",
    management_owner: "Planeación",
    calculation_owner: "Oficina de Planeación",
    status: "publicado",
    position: 5,
    created_at: "2024-10-15T00:00:00Z",
    updated_at: "2024-10-15T00:00:00Z",
  },
];

// El avance del pilar ya no es la proporción de actividades: baja en cascada
// desde sus áreas. p1 = promedio de (75, 30) = 53.
const PROGRESS = [
  { pillar_id: "p1", slug: "ambiente-tecnologico", done: 4, active: 1, pending: 1, risk: 0, total: 6, progress: 53, completion_rate: 67, area_count: 2, line_count: 2, project_count: 1 },
  // p2 no tiene áreas ni líneas capturadas todavía, y aun así cuenta el
  // proyecto que apunta a él desde p1: es el escenario que abre la 0014.
  { pillar_id: "p2", slug: "sostenibilidad", done: 4, active: 2, pending: 0, risk: 0, total: 6, progress: 67, completion_rate: 67, area_count: 0, line_count: 0, project_count: 1 },
];

const FIXTURES = {
  pillars: PILLARS,
  v_pillar_progress: PROGRESS,
  v_pdi_summary: [
    { done: 8, active: 3, pending: 1, risk: 0, total: 12, progress: 60, on_track: 0, need_attention: 0, pillar_count: 2, completion_rate: 67 },
  ],
  // Cascada: el área promedia sus líneas, la línea sus proyectos y el proyecto
  // sus actividades.
  v_area_progress: [
    { area_id: "ae1", pillar_id: "p1", area_code: "AE-03", area_name: "Infraestructura tecnológica", progress: 75, line_count: 1, project_count: 1, activity_count: 4, activity_done: 3, target_value: 40, achieved_value: 28, measure_unit: "servicios" },
    { area_id: "ae2", pillar_id: "p1", area_code: "AE-05", area_name: "Cultura digital", progress: 30, line_count: 1, project_count: 0, activity_count: 2, activity_done: 0, target_value: null, achieved_value: null, measure_unit: null },
  ],
  v_project_progress: [
    // `pillar_ids` es lo que hace que el avance del proyecto llegue también al
    // pilar vecino, al que apunta sin línea de acción.
    { project_id: "pr1", pillar_id: "p1", pillar_ids: ["p1", "p2"], action_line_id: "l1", name: "Migración a la nube institucional", reported_progress: 60, progress: 75, activity_count: 2, activity_done: 1, is_derived: true, target_value: null, achieved_value: null, measure_unit: null },
  ],
  // La cascada, año a año. El indicador cumplió 85 en 2024 y 72 en 2025; su
  // línea, su área y su pilar promedian con el proyecto que cuelga de ellos.
  v_year_progress: [
    { scope: "activity", entity_id: "a1", pillar_id: "p1", year: 2024, progress: 85 },
    { scope: "activity", entity_id: "a1", pillar_id: "p1", year: 2025, progress: 72 },
    { scope: "project", entity_id: "pr1", pillar_id: "p1", year: 2024, progress: 90 },
    { scope: "project", entity_id: "pr1", pillar_id: "p1", year: 2025, progress: 78 },
    { scope: "line", entity_id: "l1", pillar_id: "p1", year: 2024, progress: 88 },
    { scope: "line", entity_id: "l1", pillar_id: "p1", year: 2025, progress: 75 },
    { scope: "area", entity_id: "ae1", pillar_id: "p1", year: 2024, progress: 88 },
    { scope: "area", entity_id: "ae1", pillar_id: "p1", year: 2025, progress: 75 },
    { scope: "pillar", entity_id: "p1", pillar_id: "p1", year: 2024, progress: 88 },
    { scope: "pillar", entity_id: "p1", pillar_id: "p1", year: 2025, progress: 75 },
  ],
  v_current_period: [
    { id: "r1", label: "Corte agosto 2026", cutoff_date: "2026-08-28", published_at: "2026-08-28T17:00:00Z" },
  ],
  // Un indicador de resultado completo: unidad del catálogo, línea base y la
  // serie anual con su cumplimiento ya calculado, tal como llega de la columna
  // generada de activity_targets.
  activities: [
    {
      id: "a1",
      pillar_id: "p1",
      // Cuelga del proyecto: es una de las acciones que ejecutan su presupuesto,
      // y es lo que ya afirmaba v_project_progress al declararse derivado.
      project_id: "pr1",
      title: "Fortalecimiento del aula híbrida",
      owner: "Dirección TIC",
      due_date: "2026-09-30",
      progress: 72,
      status: "curso",
      is_featured: true,
      position: 1,
      action_line_id: "l1",
      unit_id: "u2",
      baseline_year: 2023,
      baseline_value: 28,
      unit: { label: "Aulas" },
      targets: [
        { id: "t1", activity_id: "a1", year: 2024, target_value: 40, result_value: 34, compliance_override: null, compliance: 85, note: "" },
        { id: "t2", activity_id: "a1", year: 2025, target_value: 50, result_value: 36, compliance_override: null, compliance: 72, note: "" },
      ],
      pillar: { slug: "ambiente-tecnologico", name: "Ambiente tecnológico", accent_slot: 2 },
    },
  ],
  activity_targets: [],
  pillar_observations: [
    {
      id: "ob1",
      pillar_id: "p1",
      year: 2025,
      title: "Balance del corte 2025",
      body: "La meta de aulas se cumplió al 72 %: faltó la dotación de dos sedes, prevista para el primer trimestre.",
      author: "Comité de Planeación",
      position: 1,
      created_at: "2026-01-10T00:00:00Z",
      updated_at: "2026-01-10T00:00:00Z",
    },
  ],
  documents: [
    {
      id: "d1",
      pillar_id: null,
      area_id: null,
      action_line_id: null,
      title: "Plan de Desarrollo Institucional 2024-2028",
      description: "Documento maestro.",
      kind: "PDF",
      url: "https://www.udes.edu.co/",
      size_label: "4,2 MB",
      is_public: true,
      published_at: "2026-08-28T17:00:00Z",
      position: 1,
    },
  ],
  /* --- PDI por facultad -------------------------------------------------
     Dos facultades y dos pilares, con una casilla en cero a propósito: la
     matriz tiene que pintar el hueco, no saltárselo. Y una acción cuyo pilar
     declarado no casó con ninguno, que es la que la bandeja debe marcar y
     negarse a publicar.

     Los textos imitan la forma real del origen: la meta trae el indicador
     dentro, con saltos de línea, y hay fechas que dicen "Por definir".
     -------------------------------------------------------------------- */
  faculties: [
    {
      id: "f1", slug: "ingenierias-y-tecnologias", code: "FIT",
      name: "Facultad de Ingenierías y Tecnologías", dean: "Viviana Prada Pérez",
      description: "", status: "publicado", position: 1,
      phase: "fase1", period: "2026", plan_date: "2026-07-02",
      synced_at: "2026-09-11T06:00:00Z", source_updated_at: "2026-09-03T21:05:36Z",
      created_at: "2026-07-02T08:00:00Z", updated_at: "2026-09-11T06:00:00Z",
    },
    {
      id: "f2", slug: "ciencias-naturales", code: "FCN",
      name: "Facultad de Ciencias Naturales", dean: "Fabiola Aguilar Galvis",
      description: "", status: "publicado", position: 2,
      phase: "fase1", period: "2026", plan_date: "2026-07-06",
      synced_at: "2026-09-11T06:00:00Z", source_updated_at: "2026-07-30T14:32:21Z",
      created_at: "2026-07-06T08:00:00Z", updated_at: "2026-09-11T06:00:00Z",
    },
  ],

  v_faculties: [
    {
      faculty_id: "f1", slug: "ingenierias-y-tecnologias", code: "FIT",
      name: "Facultad de Ingenierías y Tecnologías", dean: "Viviana Prada Pérez",
      description: "", phase: "fase1", period: "2026", plan_date: "2026-07-02", position: 1,
      action_count: 2, pillar_count: 2, dimension_count: 2, activity_count: 2,
      reported_progress: 20, reported_count: 1,
      pillar_counts: [
        { pillar_id: "p1", numeral: "II", accent: 2, count: 1 },
        { pillar_id: "p2", numeral: "V", accent: 5, count: 1 },
      ],
    },
    {
      faculty_id: "f2", slug: "ciencias-naturales", code: "FCN",
      name: "Facultad de Ciencias Naturales", dean: "Fabiola Aguilar Galvis",
      description: "", phase: "fase1", period: "2026", plan_date: "2026-07-06", position: 2,
      action_count: 1, pillar_count: 1, dimension_count: 1, activity_count: 0,
      reported_progress: null, reported_count: 0,
      pillar_counts: [{ pillar_id: "p1", numeral: "II", accent: 2, count: 1 }],
    },
  ],

  v_faculty_pillar_matrix: [
    { faculty_id: "f1", faculty_slug: "ingenierias-y-tecnologias", faculty_code: "FIT", faculty_name: "Facultad de Ingenierías y Tecnologías", faculty_position: 1, pillar_id: "p1", pillar_numeral: "II", pillar_name: "Ambiente tecnológico", pillar_accent: 2, pillar_position: 1, actions: 1 },
    { faculty_id: "f1", faculty_slug: "ingenierias-y-tecnologias", faculty_code: "FIT", faculty_name: "Facultad de Ingenierías y Tecnologías", faculty_position: 1, pillar_id: "p2", pillar_numeral: "V", pillar_name: "Sostenibilidad", pillar_accent: 5, pillar_position: 2, actions: 1 },
    { faculty_id: "f2", faculty_slug: "ciencias-naturales", faculty_code: "FCN", faculty_name: "Facultad de Ciencias Naturales", faculty_position: 2, pillar_id: "p1", pillar_numeral: "II", pillar_name: "Ambiente tecnológico", pillar_accent: 2, pillar_position: 1, actions: 1 },
    { faculty_id: "f2", faculty_slug: "ciencias-naturales", faculty_code: "FCN", faculty_name: "Facultad de Ciencias Naturales", faculty_position: 2, pillar_id: "p2", pillar_numeral: "V", pillar_name: "Sostenibilidad", pillar_accent: 5, pillar_position: 2, actions: 0 },
  ],

  v_faculty_actions: [
    {
      id: "fa1", faculty_id: "f1", source_id: "d1_1",
      dimension: "d1", dimension_name: "Gestión de calidad y autorregulación",
      declared_pillar: "Ambiente tecnológico",
      pillar_id: "p1", area_id: "ae2", action_line_id: "l2",
      title: "Modernizar los laboratorios de simulación de la facultad",
      owner: "Dirección de Programa",
      goal: "Doce escenarios en operación.\n\nIndicador:\nNúmero de laboratorios intervenidos.",
      resources: "Talento humano, plataformas institucionales y recursos tecnológicos",
      deadline: "2026-11-27", deadline_label: "2026-11-27",
      initial_status: "proceso", budget_ordinary: true, budget_improvement: false,
      published_at: "2026-09-11T07:00:00Z", position: 1,
      faculty_slug: "ingenierias-y-tecnologias", faculty_code: "FIT",
      faculty_name: "Facultad de Ingenierías y Tecnologías",
      pillar_slug: "ambiente-tecnologico", pillar_numeral: "II",
      pillar_name: "Ambiente tecnológico", pillar_accent: 2,
      area_code: "AE-05", area_name: "Cultura digital",
      line_code: "LA-5.1", line_name: "Cultura digital",
      activities: [
        {
          id: "fac1", action_id: "fa1", source_id: "d1_1_act_1",
          description: "Levantar el inventario de equipos y su estado de obsolescencia",
          owner: "Coordinación de Laboratorios",
          due_date: "2026-11-27", due_label: "2026-11-27",
          status_label: "En proceso", evidence_url: "", position: 1,
        },
      ],
      last_cut: "Semestre I 2026", last_progress: 20,
      last_status: "En proceso", last_reported_on: "2026-09-11",
    },
    {
      id: "fa2", faculty_id: "f1", source_id: "d7_3",
      dimension: "d7", dimension_name: "Gestión financiera",
      declared_pillar: "Sostenibilidad",
      pillar_id: "p2", area_id: null, action_line_id: null,
      title: "Diversificar las fuentes de financiación de la facultad",
      owner: "Por definir",
      goal: "", resources: "",
      // Muchas acciones del origen llegan sin fecha: se guarda el texto y la
      // ficha lo enseña tal cual en vez de inventarse una.
      deadline: null, deadline_label: "Por definir",
      initial_status: "pendiente", budget_ordinary: false, budget_improvement: true,
      published_at: "2026-09-11T07:00:00Z", position: 2,
      faculty_slug: "ingenierias-y-tecnologias", faculty_code: "FIT",
      faculty_name: "Facultad de Ingenierías y Tecnologías",
      pillar_slug: "sostenibilidad", pillar_numeral: "V",
      pillar_name: "Sostenibilidad", pillar_accent: 5,
      area_code: null, area_name: null, line_code: null, line_name: null,
      activities: [],
      last_cut: null, last_progress: null, last_status: null, last_reported_on: null,
    },
  ],

  v_structure_duplicates: [
    {
      kind: "area", pillar_id: "p1",
      keep_id: "ae2", keep_code: "6.1.3", keep_name: "Cultura digital",
      drop_id: "ae9", drop_code: "AE-05", drop_name: "Cultura digital",
      moves: 3, is_exact: true,
    },
    {
      kind: "line", pillar_id: "p1",
      keep_id: "l2", keep_code: "6.1.3.a", keep_name: "a. Cultura digital institucional",
      drop_id: "l9", drop_code: "LA-5.1", drop_name: "Cultura digital",
      moves: 1, is_exact: false,
    },
  ],

  v_structure_orphans: [
    {
      kind: "area", id: "ae8", pillar_id: "p1", pillar_numeral: "II",
      pillar_name: "Ambiente tecnológico", code: "AE-04",
      name: "Seguridad y continuidad", dependents: 0,
    },
    {
      kind: "area", id: "ae7", pillar_id: "p2", pillar_numeral: "V",
      pillar_name: "Sostenibilidad", code: "AE-10",
      name: "Gestión ambiental del campus", dependents: 4,
    },
  ],

  strategic_areas: [
    {
      id: "ae1",
      pillar_id: "p1",
      code: "AE-03",
      name: "Infraestructura tecnológica",
      description: "Capacidad y disponibilidad.",
      position: 1,
      target_value: 40,
      achieved_value: 28,
      measure_unit: "servicios",
      action_lines: [{ id: "l1", code: "LA-4.1", name: "Infraestructura base", progress: 85, position: 1 }],
    },
    {
      id: "ae2",
      pillar_id: "p1",
      code: "AE-05",
      name: "Cultura digital",
      description: "Competencias digitales de la comunidad.",
      position: 2,
      target_value: null,
      achieved_value: null,
      measure_unit: null,
      action_lines: [{ id: "l2", code: "LA-5.1", name: "Cultura digital", progress: 30, position: 1 }],
    },
  ],
  v_action_lines: [
    { id: "l1", code: "LA-4.1", name: "Infraestructura base", progress: 75, position: 1, area_id: "ae1", area_name: "Infraestructura tecnológica", area_code: "AE-03", pillar_id: "p1", reported_progress: 85, project_count: 1, is_derived: true, source_count: 2, loose_activity_count: 1, activity_count: 4, activity_done: 3, target_value: null, achieved_value: null, measure_unit: null },
    { id: "l2", code: "LA-5.1", name: "Cultura digital", progress: 30, position: 1, area_id: "ae2", area_name: "Cultura digital", area_code: "AE-05", pillar_id: "p1", reported_progress: 30, project_count: 0, is_derived: false, source_count: 0, loose_activity_count: 0, activity_count: 2, activity_done: 0, target_value: null, achieved_value: null, measure_unit: null },
  ],
  v_indicators: [
    {
      id: "i1",
      pillar_id: "p1",
      code: "PDI-AT-001",
      name: "Indicador principal",
      status_label: "En curso",
      level_id: "n1",
      unit_id: "u1",
      periodicity_id: "pe1",
      considerations: "El avance considera hitos aprobados.",
      budget_amount: 4200000,
      budget_progress: 65,
      elapsed_label: "18 meses",
      elapsed_progress: 40,
      critical_tasks: 2,
      is_primary: true,
      position: 1,
      level_label: "Estratégico",
      unit_label: "Porcentaje",
      periodicity_label: "Anual",
    },
  ],
  projects: [
    {
      id: "pr1",
      pillar_id: "p1",
      action_line_id: "l1",
      indicator_id: "i1",
      name: "Migración a la nube institucional",
      owner: "Dirección TIC",
      description: "",
      detail: "",
      due_date: "2026-10-30",
      progress: 75,
      status: "curso",
      state_id: null,
      document_id: null,
      position: 1,
    },
  ],
  project_links: [
    { id: "lk1", project_id: "pr1", pillar_id: "p1", area_id: "ae1", action_line_id: "l1", is_primary: true, position: 1 },
    { id: "lk2", project_id: "pr1", pillar_id: "p2", area_id: null, action_line_id: null, is_primary: false, position: 2 },
  ],
  // v_projects: la fila con sus vínculos ya resueltos. `pillar_ids` es lo que
  // hace que el proyecto salga en la ficha de los dos pilares.
  v_projects: [
    {
      id: "pr1",
      pillar_id: "p1",
      action_line_id: "l1",
      indicator_id: "i1",
      name: "Migración a la nube institucional",
      owner: "Dirección TIC",
      description: "Traslado de los servicios críticos a infraestructura gestionada.",
      detail: "",
      due_date: "2026-10-30",
      progress: 75,
      status: "curso",
      state_id: null,
      document_id: null,
      position: 1,
      target_value: null,
      achieved_value: null,
      measure_unit: null,
      start_date: "2025-02-01",
      end_date: "2026-10-30",
      academic_units: ["Facultad de Ingeniería", "Dirección TIC"],
      sdg_goals: [4, 9],
      impacts: [
        {
          kind: "Tecnológico",
          term: "Mediano plazo",
          justification: "Reduce la indisponibilidad de los servicios académicos.",
        },
      ],
      attachment_path: "pr1/1700000000-formulacion.pdf",
      attachment_name: "formulacion.pdf",
      attachment_size: 452000,
      pillar_ids: ["p1", "p2"],
      links: [
        { id: "lk1", project_id: "pr1", pillar_id: "p1", area_id: "ae1", action_line_id: "l1", is_primary: true, position: 1 },
        { id: "lk2", project_id: "pr1", pillar_id: "p2", area_id: null, action_line_id: null, is_primary: false, position: 2 },
      ],
    },
  ],
  // v_projects_admin: la misma fila que v_projects más `total_value`. La
  // migración 0015 separó las dos vistas porque el valor de un proyecto no se
  // publica: la pública no lo trae y esta solo responde con sesión y rol.
  v_projects_admin: [],
  // El presupuesto, que solo existe en la intranet.
  project_budget_reports: [
    { id: "b1", project_id: "pr1", year: 2024, projected: 40000000, executed: 38500000, note: "Cierre sin novedad." },
    { id: "b2", project_id: "pr1", year: 2025, projected: 50000000, executed: 12000000, note: "Retraso en la licitación de licencias." },
  ],
  v_project_budget: [
    {
      project_id: "pr1",
      pillar_id: "p1",
      name: "Migración a la nube institucional",
      formulated: 120000000,
      projected: 90000000,
      executed: 50500000,
      reported_years: 2,
      first_year: 2024,
      last_year: 2025,
      execution_rate: 56,
    },
  ],
  v_pillar_budget: [
    { pillar_id: "p1", slug: "ambiente-tecnologico", name: "Ambiente tecnológico", project_count: 1, formulated: 120000000, projected: 90000000, executed: 50500000, execution_rate: 56 },
    { pillar_id: "p2", slug: "sostenibilidad", name: "Sostenibilidad", project_count: 0, formulated: 0, projected: 0, executed: 0, execution_rate: null },
  ],
  planning_items: [{ id: "pl1", pillar_id: "p1", text: "Cerrar la migración.", position: 1 }],
  v_change_log: [
    {
      id: "c1",
      pillar_id: "p1",
      indicator_id: "i1",
      project_id: null,
      activity_id: null,
      area_code: "AE-03",
      version: "1.0",
      approved_by: "Comité de Planeación",
      changed_on: "2024-10-15",
      description: "Registro inicial del indicador.",
      change_type: "creacion",
      document_id: null,
      project_name: null,
      activity_title: null,
      indicator_code: "PDI-AT-001",
    },
    {
      // Entrada automática: la escribe el disparador al guardar el proyecto.
      id: "c2",
      pillar_id: "p1",
      indicator_id: null,
      project_id: "pr1",
      activity_id: null,
      area_code: "AE-03",
      version: "1.1",
      approved_by: "Administradora de prueba",
      changed_on: "2026-08-20",
      description: "Avance 60 % → 75 %.",
      change_type: "modificacion",
      document_id: null,
      project_name: "Migración a la nube institucional",
      activity_title: null,
      indicator_code: null,
    },
  ],
  glossary_terms: [
    { id: "g1", pillar_id: null, term: "Avance", definition: "Porcentaje de ejecución", description: "Resultado validado.", source: null, position: 1 },
  ],
  parameters: [
    { id: "n1", category: "nivel_gestion", label: "Estratégico", description: null, position: 1, is_active: true },
    { id: "u1", category: "unidad", label: "Porcentaje", description: null, position: 1, is_active: true },
    { id: "u2", category: "unidad", label: "Aulas", description: null, position: 2, is_active: true },
    { id: "pe1", category: "periodicidad", label: "Anual", description: null, position: 1, is_active: true },
  ],
  profiles: [
    {
      id: "user-admin",
      email: "admin@udes.edu.co",
      full_name: "Administradora de prueba",
      unit: "Planeación",
      role: "admin",
      access_role_id: "rol-admin",
      is_active: true,
      created_at: "2024-10-15T00:00:00Z",
      updated_at: "2024-10-15T00:00:00Z",
    },
    {
      id: "user-vi",
      email: "investigaciones@udes.edu.co",
      full_name: "Vicerrectoría de Investigaciones",
      unit: "Investigaciones",
      role: "planeacion",
      access_role_id: "rol-vi",
      is_active: true,
      created_at: "2025-02-01T00:00:00Z",
      updated_at: "2025-02-01T00:00:00Z",
    },
  ],
  pillar_owners: [],
  access_roles: [
    { id: "rol-consulta", key: "consulta", name: "Consulta", description: "Lee toda la intranet, no edita nada.", base_role: "consulta", screens: [], all_screens: true, all_reports: true, is_system: true, position: 1 },
    { id: "rol-responsable", key: "responsable", name: "Responsable de pilar", description: "Edita únicamente los pilares que tiene asignados.", base_role: "responsable", screens: [], all_screens: true, all_reports: true, is_system: true, position: 2 },
    { id: "rol-planeacion", key: "planeacion", name: "Planeación", description: "Edita cualquier pilar y decide qué se publica.", base_role: "planeacion", screens: [], all_screens: true, all_reports: true, is_system: true, position: 3 },
    { id: "rol-admin", key: "admin", name: "Administrador", description: "Todo lo anterior, más la gestión de usuarios.", base_role: "admin", screens: [], all_screens: true, all_reports: true, is_system: true, position: 4 },
    { id: "rol-vi", key: "editor-investigacion", name: "Editor de Investigación", description: "Carga y publica el informe de Investigación.", base_role: "planeacion", screens: ["cifras"], all_screens: false, all_reports: false, is_system: false, position: 5 },
    { id: "rol-director", key: "impacto_director", name: "Dirección de programa", description: "Captura y envía a decanatura lo que reporta su programa.", base_role: "consulta", screens: ["impacto"], all_screens: false, all_reports: false, is_system: true, position: 21, scope: "unidad", capabilities: ["impacto.capturar", "impacto.enviar"], unit_role: "editor" },
  ],
  // Dónde trabaja cada persona (0057 + 0063): la vicerrectoría dirige un programa.
  unit_members: [
    { id: "um-1", unit_id: "imp-prog-a", profile_id: "user-vi", access_role_id: "rol-director", role: "editor" },
  ],
  access_role_reports: [{ access_role_id: "rol-vi", report_slug: "investigacion" }],
  web_projects: [
    {
      id: "w1",
      name: "Portal PDI 2024-2028",
      description: "Portal público y de administración del Plan de Desarrollo Institucional.",
      public_url: "https://www.udes.edu.co/",
      repo_kind: "github",
      repo_url: "https://github.com/jogutierrezc/PDI",
      authors: [
        { full_name: "Oficina de Planeación Institucional", role: "Formulación y seguimiento" },
        { full_name: "José Gutiérrez", role: "Desarrollo" },
      ],
      status: "publicado",
      position: 1,
      created_at: "2026-01-10T00:00:00Z",
      updated_at: "2026-01-10T00:00:00Z",
    },
  ],

  /* --- PDI por campus (migración 0017) ------------------------------------
     Las tres sedes, y la que importa es Bucaramanga: no declara metas, así que
     su cumplimiento llega nulo. La prueba comprueba que la pantalla escribe
     "No calculable" y no un 0 %.
     También va una fila monetaria con el valor ya retirado, tal y como la
     devolvería la vista pública: la pantalla tiene que explicar el hueco.
     -------------------------------------------------------------------- */
  campuses: [
    { id: "c1", slug: "bucaramanga", code: "BUC", name: "Bucaramanga",
      report_kind: "Informe de Gestión Institucional", report_structure: "Por función sustantiva",
      declares_targets: false, owner: "Rectoría General", description: "",
      status: "publicado", position: 1 },
    { id: "c2", slug: "cucuta", code: "CUC", name: "Cúcuta",
      report_kind: "Informe de gestión de campus", report_structure: "Por objetivos y metas",
      declares_targets: true, owner: "Rectoría Campus Cúcuta", description: "",
      status: "publicado", position: 2 },
  ],
  v_campus_summary: [
    { campus_id: "c1", campus_slug: "bucaramanga", campus_code: "BUC", campus_name: "Bucaramanga",
      report_kind: "Informe de Gestión Institucional", report_structure: "Por función sustantiva",
      declares_targets: false, owner: "Rectoría General", position: 1, year: 2025,
      source_document: "Informe_Gestion_Institucional_2025.pdf",
      records: 52, targets: 0, achievements: 52, exceeded: 0, met: 0, partial: 0, unmet: 0,
      inferred: 9, compliance_avg: null, pillars_covered: 6, lines_covered: 30,
      lines_total: 62, indicators: 1 },
    { campus_id: "c2", campus_slug: "cucuta", campus_code: "CUC", campus_name: "Cúcuta",
      report_kind: "Informe de gestión de campus", report_structure: "Por objetivos y metas",
      declares_targets: true, owner: "Rectoría Campus Cúcuta", position: 2, year: 2025,
      source_document: "Informe_cucuta_2025.pdf",
      records: 32, targets: 32, achievements: 0, exceeded: 15, met: 14, partial: 2, unmet: 1,
      inferred: 6, compliance_avg: 97.29, pillars_covered: 6, lines_covered: 19,
      lines_total: 62, indicators: 18 },
  ],
  v_campus_pillar: [
    { campus_id: "c1", campus_slug: "bucaramanga", campus_name: "Bucaramanga",
      declares_targets: false, pillar_id: "p1", pillar_slug: "ambiente-tecnologico",
      pillar_numeral: "II", pillar_name: "Ambiente tecnológico", pillar_accent: 2,
      pillar_position: 1, year: 2025, records: 7, targets: 0, achievements: 7,
      exceeded: 0, met: 0, partial: 0, unmet: 0, compliance_avg: null,
      lines_covered: 5, lines_total: 9 },
    { campus_id: "c2", campus_slug: "cucuta", campus_name: "Cúcuta",
      declares_targets: true, pillar_id: "p1", pillar_slug: "ambiente-tecnologico",
      pillar_numeral: "II", pillar_name: "Ambiente tecnológico", pillar_accent: 2,
      pillar_position: 1, year: 2025, records: 6, targets: 6, achievements: 0,
      exceeded: 2, met: 3, partial: 0, unmet: 1, compliance_avg: 91.62,
      lines_covered: 4, lines_total: 9 },
  ],
  v_campus_facts: [
    { id: "cf1", campus_id: "c2", year: 2025, pillar_id: "p1", area_id: "ae1",
      action_line_id: "al1", objective: "Fortalecer la virtualidad",
      action: "Diseñar y ofertar cursos autogestionables", unit: "Conteo",
      target_value: 3, actual_value: 6, compliance: 200, is_monetary: false,
      record_kind: "meta", state: "superada", confidence: "alta",
      note: "Rutas de pedagogía y competencia digital.", evidence: "Documento de diseño instruccional",
      source_document: "Informe_cucuta_2025.pdf", source_page: 7, reported_pillar: "Ambiente tecnológico",
      position: 1, campus_slug: "cucuta", campus_code: "CUC", campus_name: "Cúcuta",
      pillar_slug: "ambiente-tecnologico", pillar_numeral: "II", pillar_name: "Ambiente tecnológico",
      pillar_accent: 2, area_code: "6.2.4", area_name: "Virtualidad",
      line_code: "6.2.4.b", line_name: "b. Virtualización de la enseñanza" },
    { id: "cf2", campus_id: "c2", year: 2025, pillar_id: "p1", area_id: "ae1",
      action_line_id: "al2", objective: "Adquisición de predio",
      action: "Adquisición del predio de la Cruz Roja", unit: "Hito",
      target_value: 1, actual_value: 1, compliance: 100, is_monetary: false,
      record_kind: "meta", state: "cumplida", confidence: "media",
      note: "La estructura no tiene área de infraestructura física.", evidence: "Escritura de compra",
      source_document: "Informe_cucuta_2025.pdf", source_page: 7, reported_pillar: "Personalización",
      position: 2, campus_slug: "cucuta", campus_code: "CUC", campus_name: "Cúcuta",
      pillar_slug: "ambiente-tecnologico", pillar_numeral: "II", pillar_name: "Ambiente tecnológico",
      pillar_accent: 2, area_code: "6.2.2", area_name: "Experiencia en el campus",
      line_code: "6.2.2.a", line_name: "a. Solución de Experiencia en Campus" },
    { id: "cf3", campus_id: "c2", year: 2025, pillar_id: "p1", area_id: "ae1",
      action_line_id: "al3", objective: "Diversificar ingresos",
      action: "Patrimonio institucional", unit: "Moneda (COP millones)",
      target_value: null, actual_value: null, compliance: null, is_monetary: true,
      record_kind: "logro", state: "sin_meta", confidence: "alta",
      note: "", evidence: "Estados financieros",
      source_document: "Informe_cucuta_2025.pdf", source_page: 40, reported_pillar: "Sostenibilidad",
      position: 3, campus_slug: "cucuta", campus_code: "CUC", campus_name: "Cúcuta",
      pillar_slug: "ambiente-tecnologico", pillar_numeral: "II", pillar_name: "Ambiente tecnológico",
      pillar_accent: 2, area_code: "6.5.3", area_name: "Sostenibilidad financiera",
      line_code: "6.5.3.b", line_name: "b. Optimización de recursos existentes" },
  ],
  v_campus_indicators: [
    { id: "ci1", campus_id: "c2", pillar_id: "p1", area_id: "ae1", action_line_id: "al1",
      name: "Proyectos de investigación en curso", unit: "Conteo",
      base_year: 2024, base_value: 6, last_year: 2025, last_value: 12, variation: 100,
      is_monetary: false, evidence: "Registro SIGIIP", source_document: "Informe_cucuta_2025.pdf",
      confidence: "alta", position: 1, campus_slug: "cucuta", campus_name: "Cúcuta",
      pillar_slug: "ambiente-tecnologico", pillar_numeral: "II", pillar_name: "Ambiente tecnológico",
      pillar_accent: 2, line_code: "6.6.1.b", line_name: "b. Gestión de la investigación" },
  ],
  campus_report_batches: [
    { id: "b1", campus_id: "c2", year: 2025, file_name: "Indicadores_Campus_Pilares_UDES_2025.xlsx",
      source_document: "Informe_cucuta_2025.pdf", note: "", fact_count: 32, indicator_count: 18,
      status: "publicado", uploaded_at: "2026-02-10T10:00:00Z", uploaded_by: null },
  ],
};

/* --- Rutas a comprobar ----------------------------------------------------- */

const routes = [
  {
    // La portada es el portal de Planeación: buscador, portales y lo reciente.
    path: "/",
    expect: "La universidad, medida y planeada a la vista de todos.",
    also: ["Nuestros portales", "UDES en Cifras", "Portal PDI", "Boletines", "Nuestro equipo", "Observatorio de Analítica", "Ambiente tecnológico"],
    absent: [...SIN_DINERO, "billones", "USD"],
  },
  {
    path: "/",
    note: "el menú de la persona ofrece solo las pantallas que puede abrir, y ninguna lleva a /admin a secas",
    expect: "La universidad, medida y planeada a la vista de todos.",
    session: true,
    interact: async (window, tick) => {
      const trigger = window.document.querySelector(".sh-me__trigger");
      if (!trigger) throw new Error("no está el botón de la persona");
      trigger.click();
      await tick();
      await tick();
      const panel = window.document.getElementById("sh-me-panel");
      if (!panel) throw new Error("el panel de la persona no abre");
      const hrefs = [...panel.querySelectorAll("a")].map((a) => a.getAttribute("href"));
      if (hrefs.includes("/admin")) throw new Error("un enlace sigue llevando a /admin, que no es una pantalla");
      if (!panel.textContent.includes("Tu intranet")) throw new Error("no aparece la lista de la intranet");
      if (!panel.textContent.includes("Ir a la intranet")) throw new Error("no aparece el acceso a la intranet");
      if (!hrefs.some((h) => h && h.startsWith("/admin/"))) throw new Error("ningún acceso lleva a una pantalla de la intranet");
    },
  },
  {
    path: "/admin",
    note: "/admin a secas lleva a la primera pantalla que la persona puede abrir",
    expect: "Página de la oficina",
    session: true,
  },
  {
    path: "/",
    note: "el buscador encuentra en los portales y muestra la cifra simplificada",
    expect: "La universidad, medida y planeada a la vista de todos.",
    interact: async (window, tick) => {
      const input = window.document.getElementById("pl-buscar");
      if (!input) throw new Error("no está el campo del buscador");
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      input.dispatchEvent(new window.FocusEvent("focus"));
      setValue.call(input, "ambiente");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      for (let i = 0; i < 6; i += 1) await tick();
      const results = [...window.document.querySelectorAll(".pl-result")];
      const hit = results.find((r) => r.textContent?.includes("Ambiente tecnológico"));
      if (!hit) throw new Error(`el buscador no encontró el pilar (resultados: ${results.length})`);
      if (!hit.querySelector(".pl-result__figure")) throw new Error("el pilar sale sin su cifra simplificada");
      if (input.getAttribute("aria-expanded") !== "true") throw new Error("el combobox no anuncia que está abierto");
    },
  },
  { path: "/equipo", expect: "Qué hacemos", also: ["Estadística institucional", "planeacion@udes.edu.co"] },
  {
    path: "/pdi",
    expect: "Aquí construimos futuro",
    also: [
      "Ambiente tecnológico",
      "67",
      // Los bloques narrativos de la portada. Si alguno deja de montar, el
      // typecheck no se entera: la página seguiría compilando sin él.
      "Ventana demográfica decisiva",
      "Rompemos el molde",
      "Líneas de acción",
      "Smart campus",
      "Tres sedes, tres vocaciones productivas",
      "Hub de alta tecnología",
      "¿Qué parte del plan te toca a ti?",
      "Plan de Desarrollo Institucional 2024-2028",
      // El plan y los ODS: las cifras salen de los proyectos publicados.
      "A qué se compromete el PDI más allá del campus",
      "Objetivos con aporte",
    ],
    // La portada es pública: las cifras presupuestales tampoco caben aquí.
    // "billones" y "USD" cerraban la puerta a las dos formas en que se habían
    // colado cifras de dinero en el texto editorial de la portada.
    absent: [...SIN_DINERO, "billones", "USD"],
  },
  {
    path: "/pdi",
    note: "la portada cambia de sede y arma la ruta con los pilares reales",
    expect: "Aquí construimos futuro",
    interact: async (window, tick) => {
      /* --- Sedes: las pestañas cambian el panel ---------------------------- */
      const tabs = [...window.document.querySelectorAll('[role="tab"]')];
      if (tabs.length !== 3) throw new Error(`se esperaban 3 sedes y hay ${tabs.length}`);

      const cucuta = tabs.find((tab) => tab.textContent?.includes("Cúcuta"));
      if (!cucuta) throw new Error("no se encontró la pestaña de Cúcuta");

      cucuta.dispatchEvent(new window.Event("click", { bubbles: true }));
      await tick();

      if (cucuta.getAttribute("aria-selected") !== "true") {
        throw new Error("la pestaña pulsada no queda seleccionada");
      }
      const panel = window.document.querySelector('[role="tabpanel"]')?.textContent ?? "";
      if (!panel.includes("comercio binacional")) {
        throw new Error("el panel no se actualizó a la sede elegida");
      }
      // Una sola parada de tabulación para todo el grupo.
      const focusables = tabs.filter((tab) => tab.getAttribute("tabindex") === "0");
      if (focusables.length !== 1) {
        throw new Error(`el grupo de pestañas tiene ${focusables.length} paradas de tabulación`);
      }

      /* --- Encuentra tu ruta: dos respuestas y un resultado ----------------- */
      // `click()` y no un Event sintético: React detecta el cambio de un radio
      // comparando `checked`, y solo la activación real de jsdom lo mueve.
      const pick = (value) => {
        const input = window.document.querySelector(`.route-chip input[value="${value}"]`);
        if (!input) throw new Error(`no se encontró la opción "${value}"`);
        input.click();
      };

      // Con una sola respuesta todavía no hay ruta que mostrar.
      pick("aspirante");
      await tick();
      if (!window.document.body.textContent?.includes("Falta una respuesta")) {
        throw new Error("con media respuesta debería pedirse la otra");
      }

      pick("emprender");
      await tick();

      const resultado = window.document.querySelector(".route-result")?.textContent ?? "";
      if (!resultado.includes("capital semilla")) {
        throw new Error("el resultado no responde al interés elegido");
      }
      // El cruce perfil x interés: lo único de la respuesta que cambia con el
      // perfil. Sin esto, elegir "aspirante" o "empresa" daría lo mismo.
      if (!resultado.includes("primer semestre")) {
        throw new Error("el resultado no cruza el perfil con el interés");
      }
      // Los pilares recomendados salen de la base, con su avance: no son texto.
      if (!resultado.includes("Ambiente tecnológico") || !resultado.includes("% de avance")) {
        throw new Error("el resultado no enlaza los pilares publicados con su avance");
      }

      // Cambiar de perfil sin tocar el interés tiene que cambiar la respuesta.
      pick("empresa");
      await tick();
      const otro = window.document.querySelector(".route-result")?.textContent ?? "";
      if (!otro.includes("innovación abierta") && !otro.includes("Innovación abierta")) {
        throw new Error("cambiar de perfil no cambió el cruce");
      }

      // Los dos perfiles internos: sin ellos el selector solo hablaba a quien
      // estudia o compra, y el plan lo ejecuta y lo sostiene alguien más.
      pick("administrativo");
      await tick();
      const interno = window.document.querySelector(".route-result")?.textContent ?? "";
      if (!interno.includes("propiedad intelectual")) {
        throw new Error("el perfil administrativo no tiene cruce propio");
      }

      pick("directivo");
      await tick();
      const directivo = window.document.querySelector(".route-result")?.textContent ?? "";
      if (!directivo.includes("empresas creadas")) {
        throw new Error("el perfil directivo no tiene cruce propio");
      }
      // Y el resultado cierra diciendo qué hacer, no solo con un botón.
      if (!window.document.querySelector(".route-result__next p")?.textContent?.trim()) {
        throw new Error("el resultado no dice qué hacer después");
      }

      // Un interés de los nuevos: sin ellos, gobernanza y sostenibilidad no
      // eran la respuesta principal de ninguna ruta.
      pick("sostenibilidad");
      await tick();
      const verde = window.document.querySelector(".route-result")?.textContent ?? "";
      if (!verde.includes("Sostenibilidad")) {
        throw new Error("el interés de sostenibilidad no llega a su pilar");
      }

      /* --- ODS: deducidos de los proyectos, no escritos ------------------- */
      const marcas = [...window.document.querySelectorAll(".sdg-band .sdg-mark")];
      if (marcas.length !== 17) {
        throw new Error(`la franja de ODS pinta ${marcas.length} objetivos y deben ser 17`);
      }
      // El fixture declara ODS en sus proyectos: alguno tiene que salir encendido.
      if (!marcas.some((marca) => marca.className.includes("is-on"))) {
        throw new Error("ningún objetivo aparece con aporte pese a haber proyectos que lo declaran");
      }
      // Y los apagados siguen ahí, dichos: un objetivo sin aporte no se esconde.
      const apagado = marcas.find((marca) => !marca.className.includes("is-on"));
      if (apagado && !apagado.getAttribute("aria-label")?.includes("sin aporte declarado")) {
        throw new Error("un objetivo sin aporte no se anuncia como tal");
      }
    },
  },
  {
    path: "/tablero",
    expect: "Cumplimiento global y por pilar",
    also: [
      "Fortalecimiento del aula híbrida",
      "Plan 2024-2028",
      "Corte del plan",
      // Alcance y tiempo. Aquí hubo dos cifras de presupuesto y se retiraron:
      // el tablero es público y las cifras presupuestales no lo son.
      "Tiempo transcurrido",
      "Proyectos formulados",
      "Indicadores en seguimiento",
    ],
    absent: ["Tareas críticas", ...SIN_DINERO],
  },
  {
    path: "/tablero",
    note: "la barra recorre el plan y sus cinco cortes",
    expect: "Plan 2024-2028",
    interact: async (window, tick) => {
      const paradas = () => [...window.document.querySelectorAll('.year-scrubber__stop')];

      if (paradas().length !== 6) {
        throw new Error(`se esperaban 6 paradas y hay ${paradas().length}`);
      }

      // Arranca en el plan: la lectura de conjunto antes que un año suelto.
      const plan = paradas()[0];
      if (plan.getAttribute('aria-checked') !== 'true') {
        throw new Error('la barra no arranca en el plan');
      }

      // p1 reporta 88 y 75 → (88+75)/5 = 33. p2 no reporta por años, así que
      // conserva su acumulado, 67. La media de los dos es 50.
      if (!plan.textContent.includes('50 %')) {
        throw new Error(`el avance del plan no salió 50 %: "${plan.textContent}"`);
      }

      const anillo = () => window.document.querySelector('.board-hero__score').textContent;
      if (!anillo().includes('50')) throw new Error(`el anillo no arrancó en el plan: ${anillo()}`);

      // Al saltar a 2024, todo lo que sigue a la barra cambia con ella.
      paradas()
        .find((stop) => stop.textContent.startsWith('2024'))
        .click();
      await tick();
      if (!anillo().includes('88')) {
        throw new Error(`el anillo no siguió a la barra hasta 2024: ${anillo()}`);
      }

      // Y un corte que nadie ha reportado se dice, no se pinta como cero.
      const y2026 = paradas().find((stop) => stop.textContent.startsWith('2026'));
      if (!y2026.textContent.includes('sin reportar')) {
        throw new Error(`2026 debería anunciarse sin reportar: "${y2026.textContent}"`);
      }
      y2026.click();
      await tick();
      if (anillo().includes('0 %') || !anillo().includes('sin reportar')) {
        throw new Error(`el anillo de un año sin datos no puede leerse como 0 %: ${anillo()}`);
      }
    },
  },
  {
    path: "/tablero",
    note: "la comparativa 2024-2028 se lee como tabla o como gráfica",
    expect: "Cumplimiento por año",
    also: ["Cumpl. 24", "Cumpl. 28", "Ver como"],
    interact: async (window, tick) => {
      const seccion = () => window.document.querySelector("#comparativa");

      // Arranca en tabla: es la cifra exacta y la lectura que funciona con
      // lector de pantalla y en papel.
      if (!seccion().querySelector("table")) throw new Error("la comparativa no arrancó en tabla");
      if (seccion().querySelector(".compliance-chart")) {
        throw new Error("la gráfica no debería estar montada antes de pedirla");
      }

      const opcion = (etiqueta) =>
        [...seccion().querySelectorAll(".view-toggle__option")].find((boton) =>
          boton.textContent.includes(etiqueta),
        );

      opcion("Gráfica").click();
      await tick();

      const chart = seccion().querySelector(".compliance-chart");
      if (!chart) throw new Error("el conmutador no montó la gráfica");
      if (seccion().querySelector("table")) throw new Error("la tabla siguió montada bajo la gráfica");

      // p1 reporta 88 en 2024 y 75 en 2025; p2 no reporta por años, así que su
      // fila no aparece: un año sin dato no se dibuja como cero.
      const barras = [...chart.querySelectorAll(".compliance-chart__bar")];
      if (barras.length !== 5) throw new Error(`se esperaban 5 barras y hay ${barras.length}`);

      const y2024 = barras.find((barra) => barra.textContent.startsWith("2024"));
      if (!y2024.textContent.includes("88 %")) {
        throw new Error(`la barra de 2024 no lleva su cifra escrita: "${y2024.textContent}"`);
      }

      // Ninguna cifra puede depender del color: los años sin dato se anuncian.
      const y2026 = barras.find((barra) => barra.textContent.startsWith("2026"));
      if (!y2026.textContent.includes("sin reportar")) {
        throw new Error(`2026 debería anunciarse sin reportar: "${y2026.textContent}"`);
      }
      if (y2026.querySelector(".compliance-chart__fill")) {
        throw new Error("un año sin reportar no puede dibujar barra");
      }

      // Y la leyenda de bandas va siempre, que es lo que hace que el color
      // signifique algo sin recordar los umbrales.
      if (chart.querySelectorAll(".compliance-chart__legend li").length !== 5) {
        throw new Error("la gráfica no muestra las cinco bandas de cumplimiento");
      }

      // Volver a la tabla debe devolver el dato exacto, no dejar las dos.
      opcion("Tabla").click();
      await tick();
      if (!seccion().querySelector("table") || seccion().querySelector(".compliance-chart")) {
        throw new Error("el conmutador no volvió a la tabla");
      }
    },
  },
  {
    path: "/implementacion",
    expect: "Cómo avanza cada pilar",
    also: [
      "Plan de Desarrollo Institucional",
      "Plan 2024-2028",
      "88 %",
      "Tiempo transcurrido",
      "Proyectos formulados",
      "Indicadores en seguimiento",
      // El repositorio junta las dos fuentes: el documento institucional…
      "Documentos de soporte del plan",
      // …y la formulación que vive en Storage, con su etiqueta de origen.
      "formulacion.pdf",
      "Formulación de proyectos",
      // El mapa numerado: las cinco columnas con su numeración propia.
      "Mapa numerado",
      "P1. Ambiente tecnológico",
      "AE1. Infraestructura tecnológica",
      "LA1. Infraestructura base",
      "PR1. Migración a la nube institucional",
    ],
    absent: [
      "Tareas críticas",
      // Los ODS salieron del mapa: enredaban el dibujo sin responder nada.
      // Siguen en la ficha flotante de cada proyecto y en la página /ods.
      "ODS4. Educación de calidad",
      "Objetivo de Desarrollo Sostenible (ODS)",
      // Y las vistas de presupuesto del mapa se fueron a la intranet.
      "Relaciones declaradas",
      ...SIN_DINERO,
    ],
  },
  {
    path: "/implementacion",
    note: "un solo mapa: la selección se fija al pulsar y se suelta al repetir",
    expect: "Mapa numerado",
    interact: async (window, tick) => {
      // Un único lienzo, no dos: el presupuesto es una vista del mismo mapa.
      const lienzos = window.document.querySelectorAll(".netmap");
      if (lienzos.length !== 1) {
        throw new Error(`se esperaba un solo mapa y hay ${lienzos.length}`);
      }

      const nodos = [...window.document.querySelectorAll(".netmap__node")];
      if (nodos.length === 0) throw new Error("el mapa no tiene nodos");

      // Fijar una línea de acción: su cadena se queda encendida al retirar el
      // cursor, que es lo que no hacía el prototipo.
      const linea = nodos.find((nodo) =>
        nodo.getAttribute("aria-label")?.startsWith("Línea de acción LA1."),
      );
      if (!linea) throw new Error("no se encontró la línea LA1 en el mapa");

      linea.dispatchEvent(new window.Event("click", { bubbles: true }));
      await tick();

      if (linea.getAttribute("aria-pressed") !== "true") {
        throw new Error("la línea no quedó fijada al pulsarla");
      }
      const fijado = window.document.querySelector(".netmap__pinned")?.textContent ?? "";
      if (!fijado.includes("LA1.") || !fijado.includes("Línea de acción")) {
        throw new Error("no se anuncia qué quedó fijado");
      }
      // Con algo fijado, lo que no está en su cadena se apaga.
      if (!window.document.querySelector(".netmap__node.is-faded")) {
        throw new Error("fijar un nodo no apaga el resto del mapa");
      }

      // Y se suelta pulsando otra vez.
      linea.dispatchEvent(new window.Event("click", { bubbles: true }));
      await tick();
      if (window.document.querySelector(".netmap__pinned")) {
        throw new Error("la selección no se suelta al volver a pulsar");
      }
    },
  },
  {
    path: "/implementacion/pilar/ambiente-tecnologico",
    expect: "Ambiente tecnológico",
    also: [
      "Todas las áreas",              // el selector apunta a áreas, no a protocolos
      "Áreas estratégicas del pilar", // la rejilla con el avance por área
      "Infraestructura tecnológica",  // el área del proyecto
      "Infraestructura base",         // su línea de acción
      "PDI-AT-001",
      "Tiempo transcurrido",          // sale del calendario, no del indicador
      "Proyectos del pilar",
      "Indicadores de resultado",
      "Plan 2024-2028",               // la barra de años, junto al selector de áreas
      "promedio de 2 áreas",          // el anillo dice de dónde sale
      "promedio de 2 indicadores",    // el proyecto deriva de sus indicadores
      "También aporta a 1 pilar más", // el proyecto es transversal y se dice
      "formulacion.pdf",              // su documento, desde Storage
      "Fortalecimiento del aula híbrida",
      "En el tablero",                // el indicador destacado se marca
      "Aulas",                        // la unidad del catálogo
      "Meta 24",                      // la cabecera de la serie anual
      "Meta 28",                      // los cinco años del plan, aunque estén vacíos
      "85",                           // cumplimiento 2024 = 34 / 40
      "Año 2025",                     // el año que fija el avance va identificado
      "Observaciones sobre los indicadores",
      "Balance del corte 2025",
      "Leer completa",              // la observación se abre, no se vuelca
      "88",                         // el rastro anual del área y de su línea
    ],
    absent: [
      "Planeación de resultados",
      "Actividades del pilar",
      "Tareas críticas",   // retiradas de los tableros de implementación
      "18 meses",          // el plazo escrito a mano del indicador ya no se lee
      ...SIN_DINERO,       // la ficha es pública: sin cifras de dinero
    ],
  },
  {
    path: "/implementacion/pilar/ambiente-tecnologico",
    note: "al elegir un área se filtran proyectos y líneas",
    expect: "Mostrando el área",
    also: [
      "Cultura digital",
      "Sin proyectos vinculados a Cultura digital",
      "Ficha del área seleccionada",  // la ficha pasa a hablar del área
      "Avance del área",
      "Descripción de la acción",
    ],
    absent: [
      "Tiempo transcurrido",          // el pilar en cifras: oculto al filtrar
      "Consideraciones del indicador",
      "Áreas estratégicas del pilar", // la rejilla solo está en la vista general
    ],
    interact: async (window, tick) => {
      const select = window.document.querySelector(".area-selector select");
      if (!select) throw new Error("no se encontró el selector de áreas");
      select.value = "ae2";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
      await tick();

      // El filtro afecta a proyectos y líneas. El control de cambios NO se
      // filtra: es la historia del pilar completo, así que ahí el proyecto
      // sigue apareciendo con razón. Por eso se comprueba por sección.
      const proyectos = window.document.querySelector("#proyectos")?.textContent ?? "";
      if (proyectos.includes("Migración a la nube institucional")) {
        throw new Error("el proyecto de otra área sigue en la lista");
      }

      const lineas = window.document.querySelector("#cumplimiento")?.textContent ?? "";
      if (lineas.includes("Infraestructura base")) {
        throw new Error("la línea de otra área sigue en el desglose");
      }
      if (!lineas.includes("Cultura digital")) {
        throw new Error("no se muestran las líneas del área elegida");
      }

      // Los indicadores siguen el mismo filtro que los proyectos.
      const indicadores = window.document.querySelector("#indicadores")?.textContent ?? "";
      if (indicadores.includes("Fortalecimiento del aula híbrida")) {
        throw new Error("el indicador de otra área sigue en la tabla");
      }
      if (!indicadores.includes("Sin indicadores vinculados a Cultura digital")) {
        throw new Error("no se avisa de que el área no tiene indicadores");
      }
    },
  },
  {
    path: "/implementacion/pilar/ambiente-tecnologico",
    note: "la observación se lee en una ventana, con el texto justificado",
    expect: "Observaciones sobre los indicadores",
    interact: async (window, tick) => {
      const card = [...window.document.querySelectorAll(".observation__open")].find((button) =>
        button.textContent.includes("Balance del corte 2025"),
      );
      if (!card) throw new Error("no se encontró la observación en la lista");

      // Fuera de la ventana solo va el adelanto recortado, no el texto entero.
      card.click();
      await tick();

      const panel = window.document.querySelector(".modal-panel");
      if (!panel) throw new Error("la observación no se abrió en una ventana");
      if (!panel.classList.contains("modal-panel--reader")) {
        throw new Error("la ventana no usa el ancho de lectura");
      }
      if (!panel.textContent.includes("faltó la dotación de dos sedes")) {
        throw new Error("la ventana no trae el texto completo");
      }
      if (!panel.querySelector(".observation-reader p")) {
        throw new Error("el texto no se pintó como párrafos justificados");
      }

      // Y se cierra con Escape, como el resto de los modales.
      window.document.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await tick();
      if (window.document.querySelector(".modal-panel")) {
        throw new Error("la ventana no se cerró con Escape");
      }
    },
  },
  {
    path: "/implementacion/pilar/sostenibilidad",
    note: "el proyecto compartido llega al pilar vecino con su cadena, no con la del pilar dueño",
    expect: "Sostenibilidad",
    also: [
      "Migración a la nube institucional",   // el proyecto de p1 aporta aquí
      "Sostenibilidad · sin área ni línea",  // su vínculo es al pilar entero
      "También aporta a 1 pilar más",
      "75",                                  // el avance derivado, no el 60 reportado
    ],
    absent: [
      // La cadena del pilar dueño no puede aparecer aquí: el proyecto no entra
      // en Sostenibilidad por el área ni por la línea de Ambiente tecnológico.
      "Infraestructura tecnológica",
      "Infraestructura base",
      ...SIN_DINERO,
    ],
  },
  {
    path: "/desarrollo-tecnologico",
    note: "los autores se abren a demanda y no aprietan los botones",
    expect: "Lo que construimos en Planeación",
    also: ["Portal PDI 2024-2028", "GitHub", "Abrir aplicativo", "Repositorio", "Ver autores"],
    interact: async (window, tick) => {
      const texto = () => window.document.body.textContent ?? "";

      // De entrada la tarjeta solo muestra el proyecto y sus botones.
      if (texto().includes("José Gutiérrez")) {
        throw new Error("los autores se ven sin haberlos pedido");
      }

      const toggle = [...window.document.querySelectorAll("button")].find((b) =>
        (b.textContent ?? "").includes("Ver autores"),
      );
      if (!toggle) throw new Error("no se encontró el botón de ver autores");
      if (toggle.getAttribute("aria-expanded") !== "false") {
        throw new Error("el botón no anuncia que el panel está cerrado");
      }

      toggle.click();
      await tick();

      if (!texto().includes("José Gutiérrez") || !texto().includes("Formulación y seguimiento")) {
        throw new Error("el panel no muestra los autores con su cargo");
      }

      // Escape lo cierra, como cualquier capa que se abre encima.
      window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
      await tick();

      if (texto().includes("José Gutiérrez")) {
        throw new Error("Escape no cerró el panel de autores");
      }

      // La descripción de este proyecto cabe entera, así que no debe ofrecerse
      // "Ver más": un botón que no cambia nada es peor que no tenerlo.
      if (texto().includes("Ver más")) {
        throw new Error("se ofrece ampliar una tarjeta que no está recortada");
      }
    },
  },
  {
    path: "/admin/desarrollo",
    session: true,
    note: "el formulario de autores es repetible",
    expect: "Proyectos web",
    also: ["Portal PDI 2024-2028", "Editar proyecto web", "Añadir autor"],
    interact: async (window, tick) => {
      const edit = window.document.querySelector('[aria-label="Editar Portal PDI 2024-2028"]');
      if (!edit) throw new Error("no se encontró el botón de editar");
      edit.click();
      await tick();

      const dialog = window.document.querySelector(".modal-panel");
      if (!dialog) throw new Error("el modal no se abrió");

      // Los dos autores guardados deben llegar al formulario, cada uno con su
      // nombre y su cargo.
      const rows = dialog.querySelectorAll(".author-row");
      if (rows.length !== 2) throw new Error(`se esperaban 2 autores, llegaron ${rows.length}`);

      const primero = rows[0].querySelectorAll("input");
      if (primero[0].value !== "Oficina de Planeación Institucional") {
        throw new Error(`nombre del primer autor: "${primero[0].value}"`);
      }
      if (primero[1].value !== "Formulación y seguimiento") {
        throw new Error(`cargo del primer autor: "${primero[1].value}"`);
      }

      // Y debe poder añadirse otro.
      dialog.querySelector(".author-add").click();
      await tick();
      const despues = window.document.querySelectorAll(".modal-panel .author-row").length;
      if (despues !== 3) throw new Error(`tras añadir se esperaban 3 filas, hay ${despues}`);
    },
  },
  {
    path: "/tablero/pilar/ambiente-tecnologico",
    note: "cuadro de mando: bandas, indicadores y tres tablas",
    expect: "Relación de cumplimiento del pilar",
    also: [
      "Bajo", "Medio bajo", "Medio alto", "Satisfactorio",   // la convención
      "Cumplimiento general del pilar",
      "Resultados a nivel de pilar",
      "Resultado a nivel de áreas estratégicas",
      "Resultado a nivel de proyectos",
      "Cumplimiento del pilar",
      "Resultados a nivel de áreas y líneas estratégicas",
      "Resultados a nivel de proyectos",
      "AE-03",                       // código del área
      "Infraestructura tecnológica",
      "28 servicios",                // meta absoluta capturada
      "Migración a la nube institucional",
      "cuentan indicadores",         // la nota del respaldo
      "Resultados a nivel de indicadores", // la serie anual, de donde sale todo
      "Meta 24",
      "Cumpl. 24",                   // la cascada, año a año, en las tres tablas
      "Acumulado",
    ],
    interact: async (window) => {
      // Ningún porcentaje puede comunicarse solo con color: cada ficha lleva
      // su cifra y el nombre de su banda.
      const chips = [...window.document.querySelectorAll(".result-table .band-chip")];
      if (chips.length === 0) throw new Error("las tablas no muestran fichas de banda");
      for (const chip of chips) {
        if (!chip.querySelector(".band-chip__value") || !chip.querySelector(".band-chip__label")) {
          throw new Error("una ficha de banda no lleva cifra y etiqueta");
        }
      }

      // Las líneas cuelgan visualmente de su área.
      if (!window.document.querySelector(".result-table tr.is-nested")) {
        throw new Error("las líneas no se muestran anidadas bajo su área");
      }
    },
  },
  {
    path: "/tablero/pilar/ambiente-tecnologico",
    note: "las cuatro tablas de resultados cambian juntas a gráfica",
    expect: "Ver los resultados como",
    interact: async (window, tick) => {
      const doc = window.document;
      const opcion = (etiqueta) =>
        [...doc.querySelectorAll(".scorecard-views .view-toggle__option")].find((boton) =>
          boton.textContent.includes(etiqueta),
        );

      if (doc.querySelector(".compliance-chart")) {
        throw new Error("el cuadro de mando no debería arrancar en gráfica");
      }

      opcion("Gráfica").click();
      await tick();

      // Un solo conmutador para los cuatro bloques: pilar, áreas y líneas,
      // proyectos e indicadores. Si alguno se quedara en tabla, la página se
      // leería a dos modos.
      const graficas = [...doc.querySelectorAll(".compliance-chart")];
      if (graficas.length !== 4) {
        throw new Error(`se esperaban 4 gráficas y hay ${graficas.length}`);
      }
      if (doc.querySelector(".result-table")) {
        throw new Error("una tabla de resultados siguió montada bajo la gráfica");
      }

      // La gráfica de indicadores sale del dato de origen: 85 en 2024 y 72 en
      // 2025, no del avance ya agregado del indicador.
      const indicadores = doc.querySelector("#tabla-indicadores .compliance-chart");
      if (!indicadores.textContent.includes("Fortalecimiento del aula híbrida")) {
        throw new Error("la gráfica de indicadores no rotula sus filas");
      }
      if (!indicadores.textContent.includes("85 %") || !indicadores.textContent.includes("72 %")) {
        throw new Error(`la serie del indicador no salió: "${indicadores.textContent}"`);
      }

      // Ninguna barra puede comunicarse solo con color: todas llevan su año y
      // su cifra escritos, y la leyenda de bandas acompaña a cada gráfica.
      for (const chart of graficas) {
        for (const barra of chart.querySelectorAll(".compliance-chart__bar")) {
          if (!barra.querySelector(".compliance-chart__year")) {
            throw new Error("una barra no dice de qué año es");
          }
          if (!barra.querySelector(".compliance-chart__value").textContent.trim()) {
            throw new Error("una barra no lleva su cifra escrita");
          }
        }
        if (chart.querySelectorAll(".compliance-chart__legend li").length !== 5) {
          throw new Error("una gráfica no muestra las cinco bandas de cumplimiento");
        }
      }

      opcion("Tabla").click();
      await tick();
      if (doc.querySelector(".compliance-chart") || !doc.querySelector(".result-table")) {
        throw new Error("el conmutador no devolvió las tablas");
      }
    },
  },
  {
    path: "/ods",
    expect: "El PDI y los Objetivos de Desarrollo Sostenible",
    also: [
      "Educación de calidad",                    // ODS 4, del proyecto
      "Industria, innovación e infraestructura", // ODS 9, del mismo
      "Fin de la pobreza",                       // los 17 se pintan siempre…
      "Sin proyectos",                           // …y los vacíos lo dicen
      "Objetivos con aporte declarado",
      "A qué objetivos aporta cada pilar",
    ],
    absent: [...SIN_DINERO, "Valor estimado"],
  },
  {
    path: "/ods",
    note: "al elegir un objetivo se abren sus pilares y sus proyectos",
    expect: "El PDI y los Objetivos de Desarrollo Sostenible",
    interact: async (window, tick) => {
      // La cuarta tarjeta es el ODS 4, el único con aporte junto al 9.
      const cards = window.document.querySelectorAll(".sdg-card");
      if (cards.length !== 17) {
        throw new Error(`se esperaban 17 objetivos y hay ${cards.length}`);
      }

      cards[3].dispatchEvent(new window.Event("click", { bubbles: true }));
      await tick();

      const detail = window.document.querySelector(".sdg-detail")?.textContent ?? "";
      if (!detail.includes("Migración a la nube institucional")) {
        throw new Error("el detalle no lista el proyecto del objetivo");
      }
      // El proyecto aporta a dos pilares: los dos tienen que aparecer.
      if (!detail.includes("Ambiente tecnológico") || !detail.includes("Sostenibilidad")) {
        throw new Error("el detalle no lista los dos pilares que aportan");
      }

      // Volver a pulsar la misma tarjeta cierra el panel.
      cards[3].dispatchEvent(new window.Event("click", { bubbles: true }));
      await tick();
      if (window.document.querySelector(".sdg-detail")) {
        throw new Error("el detalle no se cierra al deseleccionar el objetivo");
      }
    },
  },
  /* --- PDI por facultad -------------------------------------------------- */
  {
    path: "/facultades",
    expect: "El PDI, facultad por facultad",
    also: [
      "Dónde aporta cada facultad",
      "Facultad de Ingenierías y Tecnologías",
      "Facultad de Ciencias Naturales",
      "Ambiente tecnológico",
      "Sostenibilidad",
      "Más acciones",
      "De dónde sale lo que se lee aquí",
    ],
    // Es una página pública: ni cifras de dinero ni nada de la revisión interna.
    absent: [...SIN_DINERO, "Innovación curricular", "Sin pilar"],
  },
  {
    path: "/facultades/ingenierias-y-tecnologias",
    expect: "Facultad de Ingenierías y Tecnologías",
    also: [
      // El plan se agrupa por dimensión, que es como lo escribió la facultad.
      "Gestión de calidad y autorregulación",
      "Gestión financiera",
      "Modernizar los laboratorios de simulación de la facultad",
      "Diversificar las fuentes de financiación de la facultad",
      // Una acción sin fecha enseña el texto del origen, no una fecha inventada.
      "Por definir",
      // El pilar viaja en cada acción.
      "II · Ambiente tecnológico",
    ],
    absent: [...SIN_DINERO],
  },
  {
    path: "/facultades/ingenierias-y-tecnologias",
    note: "al abrir una acción se ven su meta, sus actividades y su seguimiento",
    expect: "Modernizar los laboratorios de simulación de la facultad",
    interact: async (window, tick) => {
      const heads = [...window.document.querySelectorAll(".action__head")];
      if (heads.length !== 2) throw new Error(`se esperaban 2 acciones y hay ${heads.length}`);

      heads[0].dispatchEvent(new window.Event("click", { bubbles: true }));
      await tick();

      const body = window.document.querySelector(".action__body")?.textContent ?? "";
      if (!body.includes("Número de laboratorios intervenidos")) {
        throw new Error("no se ve el indicador que el origen guarda dentro de la meta");
      }
      if (!body.includes("Levantar el inventario de equipos")) {
        throw new Error("no se ven las actividades de la acción");
      }
      if (!body.includes("20%") || !body.includes("Semestre I 2026")) {
        throw new Error("no se ve el último corte reportado");
      }
      // La trazabilidad del enganche: de dónde salió el pilar.
      if (!body.includes("La facultad declaró este aporte como")) {
        throw new Error("no se dice de dónde salió el pilar");
      }

      // La segunda acción no tiene ningún corte: debe decirlo, no pintar 0 %.
      heads[1].dispatchEvent(new window.Event("click", { bubbles: true }));
      await tick();
      const second = window.document.querySelector(".action.is-open .action__body")?.textContent ?? "";
      if (!second.includes("todavía no tiene ningún corte reportado")) {
        throw new Error("una acción sin reportar debería decirlo en vez de mostrar un cero");
      }
    },
  },
  {
    path: "/campus",
    expect: "Qué reportó cada sede contra el plan",
    also: [
      "Bucaramanga",
      "Cúcuta",
      // Lo que gobierna la lectura de toda la página.
      "no son comparables",
      // Sin metas no es cero: Bucaramanga tiene que decir que no se puede calcular.
      "No calculable",
      // El puente con el resto del portal.
      "Qué promete el plan",
      "Cómo va",
    ],
    // La portada de campus es pública: ninguna cifra de dinero, y menos las que
    // la vista ya retiró. "325788" es el patrimonio del libro real.
    absent: [...SIN_DINERO, "325788", "Moneda (COP"],
  },
  {
    path: "/campus",
    note: "cambiar de sede cambia el cumplimiento y lo reportado",
    expect: "Qué reportó cada sede contra el plan",
    interact: async (window, tick) => {
      const botones = [...window.document.querySelectorAll(".campus-tab")];
      if (botones.length !== 2) {
        throw new Error(`se esperaban 2 sedes y hay ${botones.length}`);
      }

      // Bucaramanga entra primero (posición 1) y no declara metas.
      const texto = () => window.document.body.textContent ?? "";
      if (!texto().includes("No calculable")) {
        throw new Error("la sede sin metas no anuncia que su cumplimiento no es calculable");
      }

      const cucuta = botones.find((b) => b.textContent?.includes("Cúcuta"));
      if (!cucuta) throw new Error("no se encontró la pestaña de Cúcuta");
      cucuta.dispatchEvent(new window.Event("click", { bubbles: true }));
      await tick();

      if (cucuta.getAttribute("aria-pressed") !== "true") {
        throw new Error("la sede pulsada no queda seleccionada");
      }
      // Cúcuta sí declara metas: su cumplimiento es un porcentaje.
      if (!texto().includes("97%")) {
        throw new Error("la sede con metas no muestra su cumplimiento promedio");
      }
      // Una cifra retirada se explica; un hueco callado parecería un fallo de
      // carga. La fila monetaria de Cúcuta llega con el valor ya anulado.
      if (!texto().includes("Cifra financiera, no publicada")) {
        throw new Error("el importe retirado no se explica en pantalla");
      }
      // Lo inferido se publica, pero dicho.
      if (!texto().includes("Asignación inferida")) {
        throw new Error("un anclaje inferido no se marca");
      }

      // Y el filtro por estado tiene que reducir la lista.
      const antes = window.document.querySelectorAll(".campus-fact").length;
      if (antes === 0) throw new Error("no se pintó lo reportado");
      const chip = [...window.document.querySelectorAll(".campus-chip")]
        .find((c) => c.textContent?.includes("Superada"));
      if (chip) {
        chip.dispatchEvent(new window.Event("click", { bubbles: true }));
        await tick();
        const despues = window.document.querySelectorAll(".campus-fact").length;
        if (despues >= antes) throw new Error("filtrar por estado no redujo la lista");
      }
    },
  },
  {
    path: "/admin/campus",
    expect: "PDI por campus",
    session: true,
    also: ["Elige el libro", "Reportes cargados", "Indicadores_Campus_Pilares_UDES_2025.xlsx"],
  },
  {
    path: "/datos-abiertos",
    expect: "Tablero de informes",
    also: [
      "Universidad de Santander",
      "Principales estadísticas de las actividades académicas y administrativas",
      // Los nueve informes, con su nombre completo.
      "Poblacional",
      "Permanencia",
      "Visibilidad",
      "Enseñanza",
      "Extensión y Proyección Social",
      "Investigación",
      "Infraestructura Física y Tecnológica",
      "UDES Sostenible",
      "Plan de Desarrollo Institucional",
      // Mientras las cifras sean de ejemplo, la portada tiene que decirlo.
      "Cifras ilustrativas",
      "Sin reportar no es cero",
    ],
    absent: [...SIN_DINERO],
  },
  {
    path: "/datos-abiertos/investigacion",
    note: "el informe importado del Word: puntos, estados, lo que falta y los rankings",
    expect: "Puntos del informe",
    also: [
      "Visibilidad y posicionamiento científico nacional",
      "Información no recibida",
      "Qué información hace falta",
      "Investigadores con más citas, 2021-2025",
      "Institutos de investigación vigentes",
      "Citaciones Scopus 2021-2025",
      "Tabla dinámica",
    ],
    absent: [...SIN_DINERO],
    interact: async (window, tick) => {
      const doc = window.document;
      const puntos = doc.querySelectorAll(".od-point");
      if (puntos.length !== 17) throw new Error(`se esperaban 17 puntos y hay ${puntos.length}`);
      const indice = doc.querySelectorAll(".od-points-index li");
      if (indice.length !== 17) throw new Error(`el índice debería listar 17 puntos y lista ${indice.length}`);
      // Un punto sin información no se esconde: dice qué hace falta.
      const p4 = doc.getElementById("od-punto-04");
      if (!p4 || p4.getAttribute("data-status") !== "no_recibido" || !p4.querySelector(".od-point__missing tbody tr")) {
        throw new Error("el punto 4 debería declarar la información no recibida y qué se pidió");
      }
      // Los bloques del punto 2 van dentro del punto 2.
      const p2 = doc.getElementById("od-punto-02");
      const ranking = p2?.querySelector('.od-tableblock[data-display="ranking"]');
      if (!ranking) throw new Error("el ranking de investigadores no quedó dentro del punto 2");
      const filas = ranking.querySelectorAll("tbody tr");
      if (filas.length !== 15) throw new Error(`el top de investigadores debería tener 15 filas y tiene ${filas.length}`);
      const primero = () => ranking.querySelector("tbody tr th")?.textContent;
      const antes = primero();
      const orden = [...ranking.querySelectorAll("thead th")].find((th) => th.getAttribute("aria-sort") === "descending");
      if (!orden) throw new Error("el ranking debería abrir ordenado de mayor a menor");
      orden.querySelector("button").click();
      await tick();
      if (orden.getAttribute("aria-sort") !== "ascending" || primero() === antes) {
        throw new Error("pulsar la columna del ranking no invirtió el orden");
      }
      if (!doc.querySelector("#od-punto-11 .od-cards__item")) throw new Error("los institutos deberían salir en fichas");
    },
  },
  {
    path: "/datos-abiertos/permanencia",
    note: "la tubería de la deserción y el mapa de calor por cohorte",
    expect: "La tubería de la permanencia",
    also: ["Retención por cohorte y semestre", "Deserción acumulada", "aún no cursado"],
    absent: [...SIN_DINERO],
  },
  {
    path: "/datos-abiertos/visibilidad",
    note: "rankings (0030): medallas, tabla, evolución y rueda de ODS",
    expect: "Rueda de ODS",
    also: ["Medallas", "Tabla comparativa", "Evolución"],
    absent: [...SIN_DINERO],
    interact: async (window, tick) => {
      const view = (label) => [...window.document.querySelectorAll('[aria-label="Vista de los rankings"] button')].find((b) => b.textContent === label);
      const text = () => window.document.querySelector(".od-rankings")?.textContent ?? "";
      // Medallas: la variación dicha en palabras (QS Latinoamérica 140 → 131).
      for (const needle of ["QS World University Rankings", "sube desde 1201–1400", "sube 9 puestos", "Employability"]) {
        if (!text().includes(needle)) throw new Error(`las medallas no muestran «${needle}»`);
      }
      // La posición principal llega en paletas partidas: el valor vive en la etiqueta
      // accesible de la paleta, porque cada carácter ocupa su propia celda.
      for (const label of ["Banda 1001–1200", "Puesto 131"]) {
        if (!window.document.querySelector(`.od-rank [aria-label="${label}"]`)) throw new Error(`las medallas no muestran «${label}»`);
      }
      // Cada placa cierra con su boleto de origen.
      if (!window.document.querySelector(".od-rank__ticket .od-ticket")) throw new Error("las medallas no traen el boleto de origen");
      // Estrellas: 4 de 5 en Teaching.
      if (!window.document.querySelector('[aria-label="Teaching: 4 de 5 estrellas"]')) throw new Error("faltan las estrellas por categoría");
      view("Tabla comparativa").click();
      await tick();
      if (!window.document.querySelector(".od-rank-table") || !text().includes("131")) throw new Error("la tabla comparativa no se pintó");
      view("Evolución").click();
      await tick();
      // Por defecto, una tira por ranking: así ninguna se cruza con otra.
      const traces = window.document.querySelectorAll(".od-evo-grid .od-evo");
      if (traces.length < 2) throw new Error(`la evolución debía dibujar una tira por ranking y dibujó ${traces.length}`);
      if (!window.document.querySelector(".od-evo path.od-rank-evo__line")) throw new Error("las tiras de la evolución no dibujan líneas");
      const shape = (label) => [...window.document.querySelectorAll('[aria-label="Forma de la evolución"] button')].find((b) => b.textContent === label);
      shape("Todos juntos").click();
      await tick();
      // El lienzo único rotula cada ranking y lleva su hilo hasta el punto.
      const evoLabels = [...window.document.querySelectorAll(".od-rank-evo text.od-rank-evo__label")];
      if (evoLabels.length < 2 || !window.document.querySelector(".od-rank-evo path.od-rank-evo__leader")) {
        throw new Error("el lienzo único de la evolución no rotula cada ranking");
      }
      // Y ningún par de rótulos queda encima del otro: se empujan al colocarse.
      const evoY = evoLabels.map((t) => Number(t.getAttribute("y"))).sort((a, b) => a - b);
      for (let i = 1; i < evoY.length; i += 1) {
        if (evoY[i] - evoY[i - 1] < 29) throw new Error(`dos rótulos de la evolución quedan a ${Math.round(evoY[i] - evoY[i - 1])}px`);
      }
      view("Rueda de ODS").click();
      await tick();
      const lit = window.document.querySelectorAll(".od-sdg__segment[data-on]").length;
      if (lit !== 5) throw new Error(`la rueda debía encender 5 ODS y encendió ${lit}`);
      window.document.querySelector('.od-sdg__segment[aria-label^="ODS 5:"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await tick();
      if (!text().includes("Igualdad de género") || !text().includes("101–200")) throw new Error("al elegir el ODS 5 no se muestra su posición");
      // Otra edición: 2025 no tiene el ODS 5.
      const select = window.document.querySelector(".od-rankings__year select");
      select.value = "2025";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
      await tick();
      if (window.document.querySelectorAll(".od-sdg__segment[data-on]").length !== 2) throw new Error("la edición 2025 debía tener 2 ODS");
    },
  },
  {
    path: "/datos-abiertos/ensenanza",
    note: "Saber PRO (0031): bloque por competencia con su selector",
    expect: "Resultados Saber PRO",
    also: ["Lectura crítica", "Inglés"],
    absent: [...SIN_DINERO],
    interact: async (window) => {
      const section = window.document.querySelector('section[aria-labelledby="od-saber-pro"]');
      if (!section) throw new Error("falta la sección del bloque Saber PRO");
      if (window.document.querySelector("h2#od-saber-pro")?.textContent.trim() !== "Resultados Saber PRO") throw new Error("el bloque Saber PRO no lleva el título del conjunto");
      if (![...section.querySelectorAll("button")].some((b) => b.textContent.includes("Lectura crítica"))) throw new Error("falta el selector de competencias");
    },
  },
  {
    path: "/datos-abiertos/ensenanza",
    note: "Motor Beta (0035): la ficha pinta el bloque Saber TyT con el título del conjunto",
    expect: "Saber TyT · Motor Beta",
    absent: [...SIN_DINERO],
    interact: async (window) => {
      const section = window.document.querySelector('section.od-section.od-tyt[aria-labelledby="od-saber-tyt"]');
      if (!section) throw new Error("falta la sección del bloque Saber TyT");
      if (window.document.querySelector("h2#od-saber-tyt")?.textContent.trim() !== "Saber TyT · Motor Beta") throw new Error("el bloque Saber TyT no lleva el título del conjunto");
    },
  },
  {
    path: "/datos-abiertos/infraestructura",
    note: "conjunto libre (0033): el bloque lleva el título del conjunto",
    expect: "Oferta y satisfacción por sede",
    absent: [...SIN_DINERO],
    interact: async (window) => {
      const section = window.document.querySelector('section.od-section.od-free[aria-labelledby="od-libre-oferta-por-sede"]');
      if (!section) throw new Error("falta la sección del conjunto libre");
      const heading = window.document.getElementById("od-libre-oferta-por-sede");
      if (heading?.tagName !== "H2" || !heading.textContent.includes("Oferta y satisfacción por sede")) throw new Error("el bloque del conjunto libre no lleva su título en un h2");
      // 0034: la tabla muestra los títulos de grupo y los totales; las gráficas, no.
      const table = section.querySelector(".od-free__table");
      if (!table) throw new Error("falta la vista de tabla del conjunto libre");
      if (!table.querySelector('tr[data-kind="grupo"]')) throw new Error("la tabla no marca los títulos de grupo");
      if (!table.querySelector('tr[data-kind="total"]')) throw new Error("la tabla no marca los totales");
      if (!table.textContent.includes("Total Bucaramanga")) throw new Error("la tabla no muestra el total de un grupo");
    },
  },
  {
    path: "/datos-abiertos/boletines/boletin-infraestructura",
    note: "conjuntos libres en el boletín: una hoja por vista, con su corte",
    expect: "Oferta y satisfacción por sede",
    also: ["Periodo 2020–2025", "Cascada", "Gantt"],
    absent: [...SIN_DINERO],
    interact: async (window, tick) => {
      for (let i = 0; i < 40 && !window.document.querySelector(".bol-free-chart svg"); i += 1) await tick();
      const charts = window.document.querySelectorAll(".bol-free-chart svg");
      if (charts.length < 3) throw new Error(`el boletín dibuja ${charts.length} gráficas de conjuntos libres`);
      if (!window.document.querySelector(".bol-free-map svg")) throw new Error("la vista de mapa no llega al boletín");
      const titles = [...window.document.querySelectorAll(".bol-sheet__head h3")].map((h) => h.textContent);
      if (!titles.some((t) => t.includes("Oferta y satisfacción por sede ·"))) throw new Error("las hojas no llevan fuente · vista en el título");
    },
  },
  {
    path: "/datos-abiertos/boletines/boletin-ensenanza",
    note: "Saber PRO en el boletín: por competencia, una hoja de niveles y una de brecha con el país",
    expect: "Saber PRO · Puntaje global · reparto del puntaje",
    also: ["Saber PRO · Inglés · niveles de desempeño", "Saber PRO · Lectura crítica · brecha con el país", "En B1 o B2, por sede y año"],
    absent: [...SIN_DINERO],
    interact: async (window, tick) => {
      const waitFor = async (selector) => {
        for (let i = 0; i < 40; i += 1) {
          if (window.document.querySelector(selector)) return true;
          await tick();
        }
        return false;
      };
      if (!(await waitFor(".bol-saber-ladder rect"))) throw new Error("la hoja de niveles no dibuja la escalera");
      if (!window.document.querySelector(".bol-saber-ridges rect")) throw new Error("la hoja del puntaje global no dibuja su reparto");
      const toned = window.document.querySelectorAll(".bol-saber-gap td[data-tone]");
      if (toned.length === 0) throw new Error("la brecha con el país no marca ninguna casilla");
      // Un programa con menos de 10 evaluados no se compara: va entre paréntesis y sin tono.
      const few = [...window.document.querySelectorAll(".bol-saber-gap td[data-few]")];
      if (!few.length || few.some((td) => !/^\(.+\)$/.test(td.textContent.trim()))) throw new Error("los programas con pocos evaluados no se marcan entre paréntesis");
      // Cada sede abre su bloque con sus programas debajo, nunca sumados entre sedes.
      const sedes = [...window.document.querySelectorAll('.bol-saber-gap tr[data-level="sede"] th')].map((th) => th.textContent.trim());
      if (!sedes.includes("Bucaramanga") || !sedes.includes("Cúcuta")) throw new Error(`la brecha no separa las sedes: ${sedes.join(", ")}`);
    },
  },
  {
    path: "/datos-abiertos/boletines/boletin-visibilidad",
    note: "el boletín trae una hoja por ranking con su evolución, y una con todos juntos",
    expect: "QS World University Rankings",
    also: ["THE Impact Rankings", "Salud y bienestar", "Estrellas por categoría", "Ediciones", "Evolución de los rankings"],
    absent: [...SIN_DINERO],
    interact: async (window, tick) => {
      // El boletín no se pagina hasta que carga su fuente, y esa promesa resuelve
      // cuando quiere: se espera a que el documento esté dibujado, no un rato fijo.
      const waitFor = async (selector) => {
        for (let i = 0; i < 40; i += 1) {
          if (window.document.querySelector(selector)) return true;
          await tick();
        }
        return false;
      };
      // Cada hoja de ranking con historia lleva su traza.
      if (!(await waitFor(".bol-rank .bol-chart circle.bol-chart__dot"))) {
        throw new Error("la hoja del ranking no dibuja su evolución");
      }
      // La hoja de conjunto: un rótulo y un hilo por ranking.
      const ranks = [...window.document.querySelectorAll(".bol-chart text.bol-chart__rank")];
      const leaders = window.document.querySelectorAll(".bol-chart path.bol-chart__leader");
      if (leaders.length < 2 || ranks.length < 2) throw new Error("el lienzo con todos los rankings no rotula cada uno");
      // Los rótulos del lienzo se empujan: nunca a menos de un renglón.
      const ys = [...window.document.querySelectorAll(".bol-chart path.bol-chart__leader")]
        .map((path) => Number(path.getAttribute("d").split("L")[1].split(" ")[1]))
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i += 1) {
        if (ys[i] - ys[i - 1] < 6.1) throw new Error(`dos rótulos del boletín quedan a ${ys[i] - ys[i - 1]}mm`);
      }
      // El ámbito elegido es el más cercano que reportan dos rankings: Colombia.
      const text = window.document.body.textContent;
      if (!text.includes("Colombia · el más cercano que reportan al menos dos rankings")) {
        throw new Error("la hoja de conjunto no eligió el ámbito más cercano");
      }
    },
  },
  {
    path: "/datos-abiertos/sostenible",
    note: "separadores (0029): franjas de sección, índice y un tablero por grupo",
    expect: "En esta ficha",
    also: ["Energía y agua", "Residuos y áreas verdes", "Lo que consume el campus y cuánto se renueva."],
    absent: [...SIN_DINERO],
    interact: async (window) => {
      const dividers = [...window.document.querySelectorAll(".od-divider h2")].map((h) => h.textContent.trim());
      if (dividers.join("|") !== "Energía y agua|Residuos y áreas verdes") throw new Error(`separadores en otro orden: ${dividers.join("|")}`);
      const links = [...window.document.querySelectorAll(".od-divider-index a")].map((a) => a.getAttribute("href"));
      if (links.some((href) => !window.document.querySelector(href))) throw new Error(`un enlace del índice no llega a su sección: ${links.join(" ")}`);
      // Un tablero por grupo, cada uno con su id.
      const boards = [...window.document.querySelectorAll(".od-keyrow h2")].map((h) => h.id);
      if (boards.length !== 2 || new Set(boards).size !== 2) throw new Error(`tableros por grupo: ${boards.join(", ")}`);
      // Cada bloque de desgloses muestra los suyos, sin repetirse entre secciones.
      const sections = [...window.document.querySelectorAll("section")];
      const titlesIn = (from, to) => {
        const a = sections.indexOf(from);
        const b = to ? sections.indexOf(to) : sections.length;
        return sections.slice(a, b).map((section) => section.textContent).join(" ");
      };
      const [first, second] = window.document.querySelectorAll(".od-divider");
      const one = titlesIn(first, second);
      const two = titlesIn(second);
      if (!one.includes("Emisiones por fuente") || one.includes("Residuos aprovechados por tipo")) throw new Error("la primera sección no muestra solo sus desgloses");
      if (!two.includes("Residuos aprovechados por tipo") || two.includes("Emisiones por fuente")) throw new Error("la segunda sección no muestra solo sus desgloses");
    },
  },
  {
    path: "/datos-abiertos/boletines/boletin-sostenible",
    note: "el boletín abre una sección por separador y la pone en el índice",
    expect: "Energía y agua",
    also: ["Residuos y áreas verdes", "sección 1 de 2", "sección 2 de 2"],
    absent: [...SIN_DINERO],
    interact: async (window) => {
      // En el índice, cada desglose queda bajo su sección y no se repite.
      const rows = [...window.document.querySelectorAll(".bol-pages .bol-toc li")].map((li) => li.textContent);
      const at = (text) => rows.findIndex((row) => row.includes(text));
      const order = ["Energía y agua", "Emisiones por fuente", "Residuos y áreas verdes", "Residuos aprovechados por tipo"].map(at);
      if (order.some((i) => i < 0) || order.some((i, k) => k > 0 && i <= order[k - 1])) throw new Error(`índice del boletín: ${rows.join(" | ")}`);
      if (rows.filter((row) => row.includes("Emisiones por fuente")).length !== 1) throw new Error("un desglose se repite en el índice");
    },
  },
  {
    path: "/datos-abiertos/poblacional",
    note: "la vista combinada respeta cifras anuales, periodos y campus",
    expect: "Estudiantes matriculados",
    absent: [...SIN_DINERO],
    interact: async (window, tick) => {
      const button = (text) => [...window.document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
      button("Líneas y barras")?.click();
      await tick();
      const chart = () => window.document.querySelector(".od-combo");
      if (!chart()?.querySelector("path.od-combo__line") || !chart()?.querySelector('rect[data-series="a"]') || !chart()?.querySelector('rect[data-series="b"]')) {
        throw new Error("no aparecen la línea anual y las dos series de barras");
      }
      const label2025 = () => [...chart().querySelectorAll('[role="button"]')].find((b) => b.getAttribute("aria-label").startsWith("2025."))?.getAttribute("aria-label");
      // Matrícula usa el último periodo: anual = B, no A + B.
      if (label2025() !== "2025. Global anual: 21.034 estudiantes. Periodo 1: 20.620 estudiantes. Periodo 2: 21.034 estudiantes") {
        throw new Error(`global o periodos incorrectos: ${label2025()}`);
      }
      const campusChoice = [...window.document.querySelectorAll('.od-controls button')].find((b) => b.textContent.trim() === "Cúcuta");
      if (!campusChoice) throw new Error("falta el filtro de campus Cúcuta");
      campusChoice.click();
      // El cambio de campus rehace toda la ficha: se espera a la gráfica, no un tiempo fijo.
      for (let i = 0; i < 15 && label2025() !== "2025. Global anual: 4.893 estudiantes. Periodo 1: 4.794 estudiantes. Periodo 2: 4.893 estudiantes"; i += 1) await tick();
      if (label2025() !== "2025. Global anual: 4.893 estudiantes. Periodo 1: 4.794 estudiantes. Periodo 2: 4.893 estudiantes") {
        throw new Error(`la vista combinada no filtró el campus: ${label2025()}`);
      }
      const select = window.document.querySelector("#od-evolucion select");
      const firstIntake = [...select.options].find((o) => o.textContent === "Estudiantes de primer ingreso");
      select.value = firstIntake.value;
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
      await tick();
      // Primer ingreso sí suma ambos periodos.
      if (label2025() !== "2025. Global anual: 1.011 estudiantes. Periodo 1: 531 estudiantes. Periodo 2: 480 estudiantes") {
        throw new Error(`la línea anual no respetó la regla de suma: ${label2025()}`);
      }
      const firstYear = chart().querySelector('[role="button"]');
      firstYear.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await tick();
      if (firstYear.getAttribute("aria-pressed") !== "true") throw new Error("el teclado no seleccionó el año");
      const typeSwitch = window.document.querySelector('[aria-label="Tipo de gráfica"]');
      [...typeSwitch.querySelectorAll("button")].find((b) => b.textContent === "Barras").click();
      await tick();
      if (chart() || !window.document.querySelector(".od-yearbars")) throw new Error("no se pudo volver a barras");
    },
  },
  {
    path: "/datos-abiertos/poblacional",
    note: "el mapa de origen de los estudiantes",
    expect: "De dónde vienen nuestros estudiantes",
    also: ["Santander", "Norte de Santander", "Cesar"],
    absent: [...SIN_DINERO],
  },
  { path: "/datos-abiertos/informe-que-no-existe", expect: "Este informe no existe" },
  {
    path: "/admin/udes-en-cifras/captura/poblacional",
    note: "UDES en Cifras: guarda A y B por separado y conserva ambos al recargar",
    session: true,
    expect: "Cifras de Poblacional",
    also: ["Estaciones del periodo", "Periodo y campus", "Estructura y KPI", "Diseño visual", "Publicación", "Plantilla CSV", "Total institucional"],
    interact: async (window, tick) => {
      const input = window.document.querySelector(".oda-grid td:not([data-locked]) input");
      if (!input) throw new Error("la rejilla no tiene casillas editables");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "12345");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      input.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
      await tick();
      const text = window.document.body.textContent ?? "";
      if (!text.includes("1 casilla cambiada")) throw new Error("editar una casilla no la marca como cambiada");
      if (!window.document.querySelector(".oda-grid td[data-changed]")) throw new Error("la casilla editada no se resalta");

      // La segunda casilla editable de la misma fila es B del mismo año.
      // Guardar ambas reproduce el fallo si on_conflict omite el periodo.
      const row = input.closest("tr");
      const second = row.querySelectorAll("td:not([data-locked]) input")[1];
      if (!second) throw new Error("falta la casilla del periodo B");
      setter.call(second, "23456");
      second.dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      second.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
      await tick();
      const save = [...window.document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Guardar"));
      if (!save || save.disabled) throw new Error("no se puede guardar la captura");
      save.click();
      await tick();
      await tick();
      if (!window.document.querySelector('.oda-save[data-state="ok"]')) {
        throw new Error(`falló el guardado: ${window.document.querySelector('.oda-save[data-state="error"]')?.textContent ?? "sin confirmación"}`);
      }
      if (window.document.querySelector(".oda-grid td[data-changed]")) throw new Error("el guardado no limpió el borrador");
      const saved = row.querySelectorAll("td:not([data-locked]) input");
      const numeric = (value) => Number(value.replace(/[^0-9]/g, ""));
      if (numeric(saved[0].value) !== 12345 || numeric(saved[1].value) !== 23456) {
        throw new Error("al recargar se perdió una cifra o se sobrescribió el otro periodo");
      }
    },
  },
  { path: "/admin/udes-en-cifras/estructura/permanencia", session: true, expect: "Tablero de KPI", also: ["Ficha del informe", "Indicadores (4)", "Conjuntos visuales", "Titular"] },
  {
    path: "/admin/udes-en-cifras/estructura/visibilidad",
    session: true,
    note: "rankings en Estructura: listado y formulario con color y vista",
    expect: "QS World University Rankings",
    also: ["Ranking universitario (QS, THE…)", "abre en rueda de ods"],
  },
  {
    path: "/admin/udes-en-cifras/captura/visibilidad",
    session: true,
    note: "captura de rankings: edición, posiciones, estrellas, ODS y validación de bandas",
    expect: "Rankings",
    interact: async (window, tick) => {
      const tab = [...window.document.querySelectorAll(".oda-tab")].find((b) => b.textContent.startsWith("Rankings"));
      if (!tab) throw new Error("falta la pestaña Rankings");
      tab.click();
      await tick();
      const panel = () => window.document.querySelector("#oda-rankings")?.textContent ?? "";
      if (!panel().includes("Posición · edición 2026") || !panel().includes("Estrellas por categoría")) throw new Error(`captura de rankings: ${panel().slice(0, 200)}`);
      const input = window.document.querySelector("#oda-rankings .oda-ranking__rank");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "mil");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      if (!panel().includes("Posiciones que no se entienden: Mundial")) throw new Error("una posición inválida debe avisarse");
      const saveButton = [...window.document.querySelectorAll("#oda-rankings button")].find((b) => b.textContent.startsWith("Guardar edición"));
      if (!saveButton?.disabled) throw new Error("con una posición inválida no se debe poder guardar");
      setter.call(input, "801-1000");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      if (saveButton.disabled) throw new Error("con una banda válida se debe poder guardar");
    },
  },
  {
    path: "/admin/udes-en-cifras/estructura/ensenanza",
    session: true,
    note: "Saber PRO en Estructura: el conjunto del informe, sin ofrecer un segundo",
    expect: "Saber PRO",
    also: ["Resultados Saber PRO", "2 años cargados"],
    interact: async (window) => {
      const options = [...window.document.querySelectorAll(".oda-add-select option")].map((o) => o.textContent);
      if (options.includes("Resultados Saber PRO (ICFES)")) throw new Error("con un conjunto Saber PRO no se debe ofrecer otro");
    },
  },
  {
    path: "/admin/udes-en-cifras/captura/ensenanza",
    session: true,
    note: "captura Saber PRO: importación en el navegador, años cargados y promedios oficial y nacional",
    expect: "Saber PRO",
    interact: async (window, tick) => {
      const tab = [...window.document.querySelectorAll(".oda-tab")].find((b) => b.textContent.startsWith("Saber PRO"));
      if (!tab) throw new Error("falta la pestaña Saber PRO");
      tab.click();
      await tick();
      const text = (id) => window.document.querySelector(`#${id}`)?.textContent ?? "";
      if (!text("oda-saber-importar").includes("no se envían a ninguna parte")) throw new Error("la importación no dice que los datos individuales no salen del navegador");
      if (!text("oda-saber-anios").includes("2024") || !text("oda-saber-anios").includes("6 de 6")) throw new Error(`años cargados: ${text("oda-saber-anios").slice(0, 200)}`);
      const inputs = window.document.querySelectorAll("#oda-saber-referencia .oda-grid td input");
      if (inputs.length !== 2 * 2 * 6) throw new Error(`la rejilla de referencia debía tener 24 casillas y tiene ${inputs.length}`);
      // Un promedio por encima de 300 no se puede guardar.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inputs[0], "350");
      inputs[0].dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      inputs[0].dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
      await tick();
      if (!text("oda-saber-referencia").includes("va de 0 a 300")) throw new Error("un promedio fuera de escala debe avisarse");
      const save = [...window.document.querySelectorAll("#oda-saber-referencia button")].find((b) => b.textContent.startsWith("Guardar"));
      if (!save?.disabled) throw new Error("con un promedio fuera de escala no se debe poder guardar");
    },
  },
  {
    path: "/admin/udes-en-cifras/estructura/ensenanza",
    session: true,
    note: "Motor Beta en Estructura: el conjunto Saber TyT del informe, sin ofrecer un segundo",
    expect: "Saber TyT (Motor Beta)",
    also: ["Saber TyT · Motor Beta", "2 años cargados"],
    interact: async (window) => {
      const options = [...window.document.querySelectorAll(".oda-add-select option")].map((o) => o.textContent);
      if (!options.every((o) => !o.includes("Motor Beta"))) throw new Error("con un conjunto Saber TyT no se debe ofrecer otro");
    },
  },
  {
    path: "/admin/udes-en-cifras/captura/ensenanza",
    session: true,
    note: "captura Saber TyT: el cruce se lee en el navegador y la lectura institucional sale de los años cargados",
    expect: "Saber TyT",
    interact: async (window, tick) => {
      const tab = [...window.document.querySelectorAll(".oda-tab")].find((b) => b.textContent.startsWith("Saber TyT"));
      if (!tab) throw new Error("falta la pestaña Saber TyT");
      tab.click();
      await tick();
      const text = (id) => window.document.querySelector(`#${id}`)?.textContent ?? "";
      if (!text("oda-tyt-importar").includes("estu_consecutivo")) throw new Error("la importación debe nombrar la columna que nunca se envía");
      if (!text("oda-tyt-importar").includes("no se envía a ninguna parte")) throw new Error("la importación no dice que el consecutivo no sale del navegador");
      const years = text("oda-tyt-anios");
      if (!years.includes("2024") || !years.includes("Con las dos pruebas")) throw new Error(`años cargados: ${years.slice(0, 200)}`);
      // El motor corrió: percentil de entrada, de salida y valor agregado del puntaje global.
      for (const label of ["Percentil medio de entrada", "Percentil medio de salida", "Valor agregado (VAI)"]) {
        if (!years.includes(label)) throw new Error(`falta «${label}» en la lectura del Motor Beta`);
      }
      const readout = [...window.document.querySelectorAll("#oda-tyt-anios .oda-tyt__readout dd")].map((d) => d.textContent.trim());
      if (!readout.slice(0, 2).every((v) => /^P\d/.test(v))) throw new Error(`los percentiles no se leen: ${readout.join(" | ")}`);
      if (!/^[+-]\d/.test(readout[2] ?? "")) throw new Error(`el valor agregado debe llevar signo: ${readout[2]}`);
      // Motor Alpha (0037): el puntaje esperado, el real y el ajuste del modelo.
      for (const label of ["Puntaje esperado medio", "Puntaje real medio", "Valor agregado (VA)", "Ajuste del modelo"]) {
        if (!years.includes(label)) throw new Error(`falta «${label}» en la lectura del Motor Alpha`);
      }
      if (!years.includes("R² 0,588") || !years.includes("n = 1.204")) throw new Error(`el ajuste del modelo no se lee: ${years.slice(-260)}`);
      if (!years.includes("Innovaciencia 2025")) throw new Error("la lectura del Motor Alpha debe citar el artículo del modelo");
      // Motor Alpha (0037): los promedios nacionales se editan aquí y dicen de dónde salen.
      const national = text("oda-tyt-nacional");
      if (!national.includes("Innovaciencia 2025")) throw new Error("los promedios nacionales deben citar el artículo del que salen");
      if (!national.includes("Ciencias naturales") || !national.includes("Comunicación escrita")) throw new Error(`faltan casillas del promedio nacional: ${national.slice(0, 200)}`);
      const boxes = [...window.document.querySelectorAll("#oda-tyt-nacional input")];
      if (boxes.length !== 6 + 6) throw new Error(`los promedios nacionales debían tener 12 casillas y tienen ${boxes.length}`);
      if (boxes[0].value !== "57") throw new Error(`la casilla de matemáticas llega con ${boxes[0].value} en vez del promedio publicado`);
      const guardar = [...window.document.querySelectorAll("#oda-tyt-nacional button")].find((b) => b.textContent.startsWith("Guardar"));
      if (!guardar?.disabled) throw new Error("sin cambios no se debe poder guardar el promedio nacional");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(boxes[0], "mil");
      boxes[0].dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      if (!text("oda-tyt-nacional").includes("no son números")) throw new Error("una casilla que no es número debe avisarse");
      if (!guardar.disabled) throw new Error("con una casilla que no es número no se debe poder guardar");
      setter.call(boxes[0], "58.5");
      boxes[0].dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      if (guardar.disabled) throw new Error("con un promedio válido se debe poder guardar");
    },
  },
  {
    path: "/admin/udes-en-cifras/estructura/infraestructura",
    session: true,
    note: "conjuntos libres en Estructura: temporalidad, periodo que cubre y columnas",
    expect: "Conjunto libre",
    also: ["Oferta y satisfacción por sede", "8 columnas · 6 filas · 9 gráficas · por periodo 2020–2025", "Consumo de energía y agua por sede"],
    interact: async (window, tick) => {
      const options = [...window.document.querySelectorAll(".oda-add-select option")].map((o) => o.textContent);
      if (!options.some((o) => o.startsWith("Conjunto libre"))) throw new Error("falta la opción de crear un conjunto libre");
      const item = [...window.document.querySelectorAll(".oda-dataset")].find((li) => li.textContent.includes("Oferta y satisfacción por sede"));
      [...item.querySelectorAll("button")].find((b) => b.textContent === "Editar").click();
      await tick();
      const form = item.querySelector("form");
      if (!form?.querySelector('input[name="temporalidad"][value="periodo"]')?.checked) throw new Error("la temporalidad por periodo no queda marcada");
      const period = [...form.querySelectorAll("label")].find((l) => l.textContent.startsWith("Periodo que cubre"))?.querySelector("input");
      if (period?.value !== "2020–2025") throw new Error(`periodo que cubre: ${period?.value}`);
      const columns = form.querySelectorAll(".oda-free-columns li").length;
      if (columns !== 8) throw new Error(`el editor debía mostrar 8 columnas y muestra ${columns}`);
      form.querySelector('input[name="temporalidad"][value="anual"]').click();
      await tick();
      if (!form.textContent.includes("no tienen año")) throw new Error("pasar a anual un conjunto con filas debe avisar que las filas no tienen año");
    },
  },
  {
    path: "/admin/udes-en-cifras/captura/infraestructura",
    session: true,
    note: "captura de un conjunto libre: rejilla por columnas, gráficas y una cifra pegada que no es número",
    expect: "Conjuntos libres",
    interact: async (window, tick) => {
      const tab = [...window.document.querySelectorAll(".oda-tab")].find((b) => b.textContent.startsWith("Conjuntos libres"));
      if (!tab) throw new Error("falta la pestaña Conjuntos libres");
      tab.click();
      await tick();
      const panel = () => window.document.querySelector("#oda-libre-filas");
      const cells = () => panel().querySelectorAll(".oda-grid td[data-kind] input");
      const labels = () => panel().querySelectorAll(".oda-free-grid__label input");
      if (cells().length !== 6 * 8) throw new Error(`la rejilla debía tener 48 casillas de datos y tiene ${cells().length}`);
      if (labels().length !== 4) throw new Error(`la rejilla debía tener 4 títulos y totales y tiene ${labels().length}`);
      if (!panel().textContent.includes("Se calcula al publicar sobre 2 filas de datos")) throw new Error("un total no dice sobre qué se calcula");
      const views = window.document.querySelector("#oda-libre-vistas")?.textContent ?? "";
      for (const title of ["Estudiantes y docentes por sede", "Estudiantes por programa", "Perfil de cada sede", "Reparto de la satisfacción", "Satisfacción por sede", "De programa en programa", "Programas en curso", "Estudiantes por departamento"]) {
        if (!views.includes(title)) throw new Error(`falta la gráfica «${title}»`);
      }
      const save = () => [...panel().querySelectorAll("button")].find((b) => b.textContent.startsWith("Guardar"));
      if (!save()?.disabled) throw new Error("sin cambios no se debe poder guardar");
      // Un rango pegado con encabezados y una cifra que no es número.
      const area = panel().querySelector(".oda-paste__area");
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(area, "Sede\tPrograma\tEstudiantes\nBucaramanga\tEnfermería\tmuchos\n");
      area.dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      [...panel().querySelectorAll("button")].find((b) => b.textContent === "Reemplazar las filas").click();
      await tick();
      const wrong = panel().querySelector(".oda-grid td[data-error] input");
      if (!wrong || wrong.value !== "muchos") throw new Error("la cifra pegada que no es número no se marca en la rejilla");
      if (!panel().textContent.includes("no es un número")) throw new Error("la cifra pegada que no es número no dice por qué");
      if (!save()?.disabled) throw new Error("con una cifra inválida no se debe poder guardar");
      if (!panel().textContent.includes("con encabezados")) throw new Error("el pegado con encabezados no se casó por nombre");
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(wrong, "420");
      wrong.dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();
      if (save()?.disabled) throw new Error("corregida la cifra, se debe poder guardar");
    },
  },
  {
    path: "/admin/udes-en-cifras/captura/infraestructura",
    session: true,
    note: "filas de un conjunto libre (0034): mover, duplicar, agrupar con un título y cerrar con un total",
    expect: "Conjuntos libres",
    interact: async (window, tick) => {
      [...window.document.querySelectorAll(".oda-tab")].find((b) => b.textContent.startsWith("Conjuntos libres")).click();
      await tick();
      const panel = () => window.document.querySelector("#oda-libre-filas");
      const rows = () => [...panel().querySelectorAll(".oda-grid tbody tr")];
      const labels = () => panel().querySelectorAll(".oda-free-grid__label input");
      const sedes = () => rows().map((tr) => tr.querySelector('td[data-kind="texto"] input')?.value).filter((v) => v !== undefined);
      const save = () => [...panel().querySelectorAll("button")].find((b) => b.textContent.startsWith("Guardar"));
      const click = async (row, label) => {
        const button = [...row.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent).startsWith(label));
        if (!button) throw new Error(`falta el botón «${label}» de la fila`);
        button.click();
        await tick();
      };
      const setValue = (input, value) => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      };

      if (sedes().join() !== "Bucaramanga,Bucaramanga,Cúcuta,Cúcuta,Valledupar,Bogotá") throw new Error(`orden inicial: ${sedes().join()}`);
      // Subir: Valledupar pasa por delante de la segunda fila de Cúcuta.
      await click(rows().find((tr) => tr.querySelector('td[data-kind="texto"] input')?.value === "Valledupar"), "Subir");
      if (sedes().join() !== "Bucaramanga,Bucaramanga,Cúcuta,Valledupar,Cúcuta,Bogotá") throw new Error(`tras subir: ${sedes().join()}`);
      // Duplicar: la copia queda justo debajo, con las mismas casillas.
      await click(rows().find((tr) => tr.querySelector('td[data-kind="texto"] input')?.value === "Bucaramanga"), "Duplicar");
      if (sedes().length !== 7 || sedes().slice(0, 3).join() !== "Bucaramanga,Bucaramanga,Bucaramanga") throw new Error(`tras duplicar: ${sedes().join()}`);
      if (save()?.disabled) throw new Error("con la fila duplicada se debe poder guardar");
      // Un título de grupo sin texto no se puede guardar.
      setValue(labels()[0], "");
      await tick();
      if (!panel().textContent.includes("un título de grupo necesita su texto")) throw new Error("un título de grupo sin texto debe avisarse");
      if (!save()?.disabled) throw new Error("con un título de grupo sin texto no se debe poder guardar");
      setValue(labels()[0], "Bucaramanga");
      await tick();
      if (save()?.disabled) throw new Error("recuperado el título, se debe poder guardar");
      // Añadir un título al final y convertirlo en el total de toda la fuente.
      [...panel().querySelectorAll("button")].find((b) => b.textContent.includes("Añadir título de grupo")).click();
      await tick();
      if (labels().length !== 5) throw new Error(`tras añadir el título hay ${labels().length} títulos y totales`);
      if (!save()?.disabled) throw new Error("el título nuevo está sin texto: no se debe poder guardar");
      const last = rows()[rows().length - 1];
      const kind = last.querySelector(".oda-free-grid__kind");
      kind.value = "total";
      kind.dispatchEvent(new window.Event("change", { bubbles: true }));
      await tick();
      setValue(labels()[labels().length - 1], "Total general");
      await tick();
      if (!panel().textContent.includes("Se calcula al publicar sobre 4 filas de datos")) throw new Error("el total nuevo no dice sobre qué se calcula");
      if (save()?.disabled) throw new Error("con su texto, el total se debe poder guardar");
    },
  },
  {
    path: "/admin/udes-en-cifras/diseno/infraestructura",
    session: true,
    note: "bloques de conjunto libre: todas las vistas o una",
    expect: "Todas las vistas (9)",
    also: ["Consumo de energía y agua por sede · Energía por año", "Otra gráfica de «Oferta y satisfacción por sede»"],
  },
  { path: "/admin/udes-en-cifras/diseno/poblacional", session: true, expect: "Bloques de la ficha", also: ["Así se lee la ficha", "Tabla dinámica"] },
  {
    path: "/admin/udes-en-cifras/diseno/sostenible",
    session: true,
    note: "separadores: título, descripción, grupo de cada bloque y tableros por grupo",
    expect: "Añadir separador",
    also: ["Título del separador", "Otro tablero de indicadores", "2 indicadores elegidos", "Otro bloque de desgloses", "1 desglose elegido", "los desgloses que ningún otro bloque de desgloses eligió"],
  },
  { path: "/admin/udes-en-cifras/publicacion/sostenible", session: true, expect: "Estado de los informes", also: ["Revisar UDES Sostenible", "Bitácora de publicación"] },
  { path: "/admin/udes-en-cifras/periodo", session: true, expect: "Campus del periodo", also: ["Oficinas fuente", "Periodo 2020-2025"] },
  {
    path: "/admin/udes-en-cifras/boletin",
    note: "Boletín: plantilla, contenido, vista previa paginada",
    session: true,
    expect: "Boletines del periodo",
    also: ["Boletín UDES en Cifras", "Contenido", "Plantilla", "Vista previa", "Oficinas que reportan", "Hoja de indicador, en todos"],
    interact: async (window, tick) => {
      // Pasar de completo a ejecutivo con la vista previa abierta: la paginación
      // medida para el completo no debe usarse con el contenido del ejecutivo.
      const group = window.document.querySelector('[aria-label="Tipo de boletín"]');
      const button = [...(group?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Ejecutivo");
      if (!button) throw new Error("falta el selector de tipo de boletín");
      button.click();
      await tick();
      await tick();
      const text = window.document.body.textContent ?? "";
      if (!text.includes("Resumen ejecutivo")) throw new Error("el boletín ejecutivo no muestra su resumen");
      [...group.querySelectorAll("button")].find((b) => b.textContent.trim() === "Completo").click();
      await tick();

      // La cabecera por informe pinta la barra y la franja con el color de línea
      // del informe de la página; con el tema, las dos vuelven al color del boletín.
      const plantilla = [...window.document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === "Plantilla");
      if (!plantilla) throw new Error("falta la pestaña de plantilla");
      plantilla.click();
      await tick();
      const tint = window.document.querySelector('[aria-label="Color de la barra y la franja"]');
      const byTheme = [...(tint?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "El del tema");
      if (!byTheme) throw new Error("falta el selector de color de la cabecera");
      const tinted = () =>
        [...window.document.querySelectorAll(".bol-page.bol-content")].some((page) => page.style.getPropertyValue("--bol-chrome-band"));
      if (!tinted()) throw new Error("con «el del informe» ninguna página toma el color de su informe");
      byTheme.click();
      await tick();
      if (tinted()) throw new Error("con «el del tema» la cabecera no debería llevar color de informe");
      [...tint.querySelectorAll("button")].find((b) => b.textContent.trim() === "El del informe").click();
      await tick();
      [...window.document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === "Contenido").click();
      await tick();
    },
  },
  { path: "/admin/boletin/od-boletin-global", session: true, expect: "Descargar PDF", also: ["Presentación", "Contenido", "Oficinas que reportan"] },
  { path: "/datos-abiertos/boletines", expect: "Boletín UDES en Cifras", also: ["En vivo", "Ediciones en PDF", "Edición septiembre de 2026"] },
  { path: "/datos-abiertos/boletines/boletin-global", expect: "Descargar PDF", also: ["Presentación", "Poblacional", "Oficinas que reportan"] },
  {
    path: "/datos-abiertos/boletines/boletin-poblacional",
    note: "sin boletín propio, el informe usa la plantilla del global publicado",
    expect: "Descargar PDF",
    also: ["Boletín UDES en Cifras · Poblacional", "Estudiantes matriculados"],
  },
  { path: "/datos-abiertos", note: "descarga del boletín global en el tablero", expect: "Descargar boletín global (PDF)", also: ["Todos los boletines y ediciones"] },
  { path: "/datos-abiertos/permanencia", note: "descarga del boletín del informe junto al CSV", expect: "Boletín PDF", also: ["CSV"] },
  { path: "/acceso-intranet", expect: "Intranet PDI" },
  { path: "/ruta-que-no-existe", expect: "Esta página no existe" },
  { path: "/admin/pilares", expect: "Intranet PDI", note: "sin sesión debe redirigir al acceso" },
  { path: "/admin/pilares", expect: "Gestión de pilares", session: true },
  { path: "/admin/parametros", expect: "Parámetros globales", session: true, also: ["Estratégico"] },
  {
    path: "/admin/proyectos",
    expect: "Proyectos",
    session: true,
    also: [
      "Migración a la nube institucional",
      "Facultad de Ingeniería",   // unidades académicas
      "Educación de calidad",     // ODS 4
      "Tecnológico",              // la tabla de impactos
      "Mediano plazo",
      "principal",                // el vínculo que manda
      "formulacion.pdf",
    ],
  },
  {
    path: "/admin/proyectos",
    session: true,
    note: "el formulario del proyecto llega relleno, con sus vínculos y sus ODS",
    expect: "Editar proyecto",
    interact: async (window, tick) => {
      const edit = [...window.document.querySelectorAll('.project-card__foot button')].find(
        (button) => button.textContent.includes('Editar'),
      );
      if (!edit) throw new Error('no se encontró el botón de editar del proyecto');
      edit.click();
      await tick();

      const dialog = window.document.querySelector('.modal-panel');
      if (!dialog) throw new Error('el formulario no se abrió');

      const title = dialog.querySelector('input[type=text], input:not([type])');
      if (!title || title.value !== 'Migración a la nube institucional') {
        throw new Error(`el título no llegó relleno: "${title ? title.value : 'sin campo'}"`);
      }

      // Los dos vínculos, con el principal primero.
      const filas = dialog.querySelectorAll('.link-row');
      if (filas.length !== 2) {
        throw new Error(`se esperaban 2 vínculos y llegaron ${filas.length}`);
      }

      // Y los ODS marcados son los dos del proyecto, ni uno más.
      const marcados = [...dialog.querySelectorAll('.sdg-chip.is-on')].map((chip) =>
        chip.querySelector('b').textContent,
      );
      if (marcados.join(',') !== '4,9') {
        throw new Error(`los ODS no llegaron marcados: ${marcados.join(',') || 'ninguno'}`);
      }

      // El archivo cargado se ofrece para abrirlo, no como un campo vacío.
      if (!dialog.querySelector('.file-field__current')) {
        throw new Error('el archivo actual no se mostró');
      }
    },
  },
  {
    path: "/admin/proyectos",
    note: "un vínculo repetido se avisa en vez de romper el guardado",
    expect: "Editar proyecto",
    session: true,
    interact: async (window, tick) => {
      const edit = [...window.document.querySelectorAll('.project-card__foot button')].find(
        (button) => button.textContent.includes('Editar'),
      );
      edit.click();
      await tick();

      const dialog = window.document.querySelector('.modal-panel');
      const añadir = [...dialog.querySelectorAll('button')].find((button) =>
        button.textContent.includes('Añadir pilar'),
      );
      if (!añadir) throw new Error('no se encontró el botón de añadir vínculo');

      añadir.dispatchEvent(new window.Event('click', { bubbles: true }));
      await tick();

      // La fila nueva se apunta al mismo pilar que el segundo vínculo, que ya
      // apuntaba al pilar entero: misma terna (pilar, sin área, sin línea).
      // Es exactamente lo que provocaba el 500 de Postgres,
      // "ON CONFLICT DO UPDATE command cannot affect row a second time".
      const filas = [...dialog.querySelectorAll('.link-row')];
      if (filas.length !== 3) {
        throw new Error(`se esperaban 3 vínculos y hay ${filas.length}`);
      }

      const selector = filas[2].querySelector('select');
      selector.value = 'p2';
      selector.dispatchEvent(new window.Event('change', { bubbles: true }));
      await tick();

      const marcadas = dialog.querySelectorAll('.link-row.is-repeated');
      if (marcadas.length !== 1) {
        throw new Error(`el vínculo repetido no se marcó (${marcadas.length} marcadas)`);
      }
      const aviso = dialog.querySelector('.link-row__repeated')?.textContent ?? '';
      if (!aviso.includes('Repite un vínculo de más arriba')) {
        throw new Error('no se explica por qué la fila está marcada');
      }
    },
  },
  {
    path: "/admin/pilares/ambiente-tecnologico/configurar",
    expect: "Áreas estratégicas",
    session: true,
    also: [
      "Migración a la nube institucional",
      "Infraestructura tecnológica",
      "Indicadores de resultado",
      "Observaciones del pilar",
      "Meta 24",                    // la tabla de captura trae la serie anual
      "registro automático",     // la entrada escrita por el disparador
      "promedio de 1 proyecto",  // la línea deriva su avance
      "Metas y cumplimiento",    // el panel de metas por área y línea
      "Cumpl. 25",               // con su cascada anual
      "promedio de 1 proyecto y 1 indicador", // de dónde sale el número de la línea
      "28 servicios",            // meta capturada del área
      "Sin meta",                // y el estado de la que no tiene
    ],
  },
  {
    path: "/admin/pilares/ambiente-tecnologico/configurar",
    session: true,
    note: "los proyectos se listan, pero se editan en su módulo",
    expect: "Migración a la nube institucional",
    also: ["Ir a Proyectos"],
    interact: async (window) => {
      // La sección ya no crea ni borra: un proyecto creado aquí nacería atado a
      // este pilar y sin manera de vincularlo a otro.
      const seccion = [...window.document.querySelectorAll(".admin-card")].find((card) =>
        card.querySelector("h2")?.textContent === "Proyectos",
      );
      if (!seccion) throw new Error("no se encontró la sección de proyectos");
      if (seccion.textContent.includes("Nuevo proyecto")) {
        throw new Error("la configuración del pilar sigue ofreciendo crear proyectos");
      }
      const editar = seccion.querySelector('[href="/admin/proyectos"]');
      if (!editar) throw new Error("no se ofrece editar el proyecto en su módulo");
    },
  },
  {
    path: "/admin/pilares/ambiente-tecnologico/configurar",
    session: true,
    note: "la meta del área se edita desde la tabla de metas",
    expect: "Editar área estratégica",
    also: ["Meta (valor absoluto)", "Unidad de la meta"],
    interact: async (window, tick) => {
      const edit = window.document.querySelector(
        '[aria-label="Editar la meta del área Infraestructura tecnológica"]',
      );
      if (!edit) throw new Error("no se encontró el botón de editar la meta del área");
      edit.click();
      await tick();

      const dialog = window.document.querySelector(".modal-panel");
      if (!dialog) throw new Error("el modal no se abrió");

      // Los tres campos deben llegar con lo que ya estaba guardado.
      const valores = [...dialog.querySelectorAll("input")].map((input) => input.value);
      for (const esperado of ["40", "28", "servicios"]) {
        if (!valores.includes(esperado)) {
          throw new Error(`falta "${esperado}" en el formulario; llegó: ${valores.join(" | ")}`);
        }
      }
    },
  },
  {
    path: "/admin/pilares/ambiente-tecnologico/configurar",
    session: true,
    note: "la serie anual del indicador se captura en el mismo formulario",
    expect: "Editar indicador de resultado",
    also: ["Unidad de medida", "Metas y resultados por año", "Ajustar el cumplimiento a mano"],
    interact: async (window, tick) => {
      const edit = window.document.querySelector(
        '[aria-label="Editar el indicador Fortalecimiento del aula híbrida"]',
      );
      if (!edit) throw new Error("no se encontró el botón de editar del indicador");
      edit.click();
      await tick();

      const dialog = window.document.querySelector(".modal-panel");
      if (!dialog) throw new Error("el modal del indicador no se abrió");

      // La unidad llega del catálogo, seleccionada.
      const unidad = [...dialog.querySelectorAll("select")].find(
        (element) => element.value === "u2",
      );
      if (!unidad) throw new Error("la unidad de medida no llegó seleccionada");

      // La rejilla trae los cinco años del plan con lo ya capturado en 2024-25.
      const grid = dialog.querySelector(".year-grid");
      if (!grid) throw new Error("no se pintó la rejilla de metas por año");

      const filas = [...grid.querySelectorAll("tbody tr")];
      if (filas.length !== 5) {
        throw new Error(`se esperaban 5 años del plan y llegaron ${filas.length}`);
      }

      const meta24 = filas[0].querySelector("input");
      if (!meta24 || meta24.value !== "40") {
        throw new Error(`la meta 2024 no llegó rellena: "${meta24 ? meta24.value : "sin campo"}"`);
      }

      // El cumplimiento no se captura: se calcula mientras se escribe.
      const calculado = filas[0].querySelector(".year-grid__computed");
      if (!calculado || !calculado.textContent.includes("85")) {
        throw new Error(
          `el cumplimiento 2024 no se calculó: "${calculado ? calculado.textContent : "sin salida"}"`,
        );
      }

      // Y sigue el resultado: al cambiarlo, la cifra se mueve sin guardar.
      const resultado = filas[0].querySelectorAll("input")[1];
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(resultado, "20");
      resultado.dispatchEvent(new window.Event("input", { bubbles: true }));
      await tick();

      const recalculado = window.document
        .querySelector(".year-grid tbody tr .year-grid__computed")
        ?.textContent ?? "";
      if (!recalculado.includes("50")) {
        throw new Error(`el cumplimiento no se recalculó al escribir: "${recalculado}"`);
      }
    },
  },
  {
    path: "/admin/facultades",
    expect: "PDI por facultad",
    session: true,
    also: [
      "Aplicación de planes de facultad",
      "Sincronizar ahora",
      "Sin pilar resuelto",
      "Qué se publica",
      // La acción cuyo pilar declarado no casó con ninguno del PDI.
      "Rediseñar el currículo de los programas de la facultad",
      "Innovación curricular",
      "Anclar a una línea del PDI",
    ],
  },
  {
    path: "/admin/facultades",
    note: "sin pilar resuelto, el botón de publicar está bloqueado",
    expect: "Acciones",
    session: true,
    interact: async (window, tick) => {
      await tick();
      const fila = window.document.querySelector(".tray-row--warn");
      if (!fila) throw new Error("la acción sin pilar no se marca");

      const publicar = [...fila.querySelectorAll("button")].find(
        (boton) => boton.textContent?.trim() === "Publicar",
      );
      if (!publicar) throw new Error("no aparece el botón de publicar");
      if (!publicar.disabled) {
        throw new Error("se puede publicar una acción que no enganchó con ningún pilar");
      }
    },
  },
  {
    path: "/admin/impacto/catalogo",
    note: "catálogo sobre la base: versiones, fichas, hallazgos y publicación",
    expect: "Importar la matriz",
    session: true,
    also: [
      "Versión 2",
      "Estudiantes vinculados a semilleros",
      "Ficha incompleta. Falta: tipo de cálculo, unidad.",
      "Hallazgos del importador",
      "Número en la columna de unidad",
      "Falta completar la ficha de",
      "Precargar las fichas propuestas del piloto",
    ],
  },
  {
    path: "/admin/impacto/periodo",
    note: "periodo abierto, asignaciones, precargados y apertura del siguiente",
    expect: "Periodo 2026-2",
    session: true,
    also: [
      "Asignaciones activas",
      "Programa de Prueba A",
      "Valores precargados",
      "1 registro de indicadores precargados en 2026-2",
      "Plantilla CSV del periodo",
      "Abrir un periodo",
      "Ver las asignaciones de 2027-1",
    ],
  },
  {
    path: "/admin/impacto/reporte",
    note: "captura en modo sencillo: ficha, precargado y devolución",
    expect: "Programa de Prueba A",
    session: true,
    also: ["Asignados", "Enviar a decanatura", "Sencillo", "Hoja de cálculo", "Estudiantes vinculados a semilleros", "Devuelto: Evidencia insuficiente", "Adjunte el listado del SIGIIP."],
  },
  {
    path: "/admin/impacto/reporte",
    note: "captura en modo hoja de cálculo: celdas, valor calculado y validación",
    expect: "Guardar cambios",
    session: true,
    storage: { "impacto:modo-captura": "hoja" },
    also: ["Numerador o valor", "Confirma precargado", "89,6 %", "Este indicador exige evidencia"],
  },
  {
    path: "/admin/impacto/revision",
    note: "bandeja de decanatura: paquete del programa, devolución de la vicerrectoría y separación de funciones",
    expect: "Decanatura · Facultad de Prueba",
    session: true,
    also: [
      "Esperan su decisión",
      "Programa de Prueba B",
      "Tasa de retención estudiantil",
      "430 ÷ 480",
      "La vicerrectoría lo devolvió: Variación sin justificar",
      "Aprobar de nuevo",
      "Lo capturó usted: no puede aprobarlo.",
    ],
    absent: ["Ver como", "Prototipo: los datos viven en este navegador."],
  },
  {
    path: "/admin/impacto/revision",
    note: "bandeja de la vicerrectoría: solo su función, valida o devuelve a la decanatura",
    expect: "Vicerrectoría · Enseñanza",
    session: true,
    interact: async (window, tick) => {
      const tab = [...window.document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes("Vicerrectoría"));
      if (!tab) throw new Error("no está la pestaña de la vicerrectoría");
      tab.click();
      await tick();
      const text = window.document.body.textContent;
      if (!text.includes("Vicerrectoría · Enseñanza")) throw new Error("no cambió a la bandeja de la vicerrectoría");
      if (!text.includes("Profesores con título de Maestría y Doctorado")) throw new Error("no aparece el registro aprobado por la decanatura");
      if (!text.includes("Validar")) throw new Error("no aparece el botón para validar");
      if (text.includes("Innovaciones pedagógicas")) throw new Error("la vicerrectoría ve lo que aún está en la decanatura");
    },
  },
  {
    path: "/admin/impacto/reporte",
    note: "plantilla Excel: descargar e importar",
    expect: "Descargar plantilla Excel",
    session: true,
    interact: async (window, tick) => {
      const button = [...window.document.querySelectorAll("button")].find((b) => b.textContent.includes("Importar Excel"));
      if (!button) throw new Error("no se encontró el botón «Importar Excel»");
      if (button.disabled) throw new Error("«Importar Excel» está deshabilitado con registros editables");
      button.click();
      await tick();
      const text = window.document.body.textContent ?? "";
      if (!text.includes("Importar la plantilla Excel")) throw new Error("no se abrió el panel de importación");
      if (!text.includes("Se cargan las filas válidas")) throw new Error("el panel no dice la política de importación");
    },
  },
  {
    path: "/impacto",
    note: "portal sobre la base: catálogo publicado, lentes reales y solo cifras validadas",
    expect: "Impacto Institucional",
    session: true,
    also: [
      "4 indicadores, de los insumos al impacto real",
      "Facultad de Ciencias Sociales",
      "Una cifra de facultad no es un promedio",
      "970 ÷ 1.100",
      "Solo cifras validadas",
      "Catálogo versión 1",
    ],
    absent: ["datos ilustrativos", "Dato ilustrativo", "Medicina Veterinaria y Zootecnia"],
  },
  {
    path: "/impacto/institucion",
    note: "toda la universidad: razón de sumas de lo validado y cambio frente al periodo anterior",
    expect: "Universidad de Santander",
    session: true,
    also: ["Tasa de retención estudiantil", "88,2 %", "frente a 2025-2", "Innovaciones pedagógicas"],
    absent: ["datos ilustrativos"],
  },
  {
    path: "/impacto/campus/bucaramanga",
    note: "lente de campus: solo lo que se reporta por sede",
    expect: "Campus Bucaramanga",
    session: true,
    also: ["87,8 %", "los que se reportan por programa no se reparten entre sedes"],
    absent: ["Innovaciones pedagógicas"],
  },
  {
    path: "/impacto/indicador/E04?en=facultad:ciencias-sociales",
    note: "ficha del indicador con su cuenta y el reparto por programa",
    expect: "Tasa de retención estudiantil",
    session: true,
    also: ["630 ÷ 700", "En qué se reparte", "Derecho", "Por periodo", "Meta 2026", "+1 pp vs LB", "Línea base 2023"],
    absent: ["datos ilustrativos"],
  },
  {
    path: "/impacto/institucion",
    note: "catálogo publicado sin cifras validadas: todo hueco y dice por qué",
    expect: "Aún no hay cifras validadas",
    session: true,
    fixtures: { "rpc:imp_portal_records": [] },
    also: ["Sin cifras validadas en esta lente", "Fuera del piloto", "Sugerido: aún no se reporta"],
  },
  {
    path: "/impacto",
    note: "sin catálogo publicado: estado vacío",
    expect: "Aún no hay cifras que mostrar",
    session: true,
    fixtures: { "rpc:imp_portal_catalog": { version: null, indicators: [] }, "rpc:imp_portal_records": [] },
    also: ["Ir a Impacto en la intranet"],
  },
  {
    path: "/impacto/indicador/E04",
    note: "base sin la migración 0072: error con qué hacer",
    expect: "No se pudo cargar Impacto Institucional",
    session: true,
    fixtures: { "rpc:imp_portal_catalog": { __status: 404, code: "PGRST202", message: "Could not find the function public.imp_portal_catalog" } },
    also: ["0072_impacto_portal.sql", "Reintentar"],
  },
  {
    path: "/admin/estructura",
    expect: "Normalizar la estructura",
    session: true,
    also: [
      "Qué hay que resolver",
      "Mismo nombre",
      "Emparejadas por parecido",
      "Sin equivalente en la estructura real",
      // La dirección de la fusión: lo que se va y lo que se queda.
      "se fusiona y desaparece",
      "se conserva",
      // Y la distinción que hace útil la lista de sueltas.
      "no sostiene nada",
      "sostiene 4 filas",
    ],
  },
  {
    path: "/admin/estructura",
    note: "solo se puede retirar lo que no sostiene nada",
    expect: "Sin equivalente en la estructura real",
    session: true,
    interact: async (window) => {
      const filas = [...window.document.querySelectorAll(".orphan")];
      if (filas.length !== 2) throw new Error(`se esperaban 2 sueltas y hay ${filas.length}`);

      const vacia = filas.find((f) => f.textContent?.includes("no sostiene nada"));
      const llena = filas.find((f) => f.textContent?.includes("sostiene 4 filas"));

      if (!vacia?.querySelector("button")) {
        throw new Error("la entrada vacía debería poder retirarse");
      }
      if (llena?.querySelector("button")) {
        throw new Error("una entrada que sostiene datos no debería ofrecer retirarla");
      }
    },
  },
  {
    path: "/admin/presupuesto",
    expect: "Presupuesto",
    session: true,
    also: [
      "Información interna",          // se avisa antes de enseñar una cifra
      "Presupuesto formulado",
      "Presupuesto proyectado",
      "Presupuesto ejecutado",
      "120.000.000",                  // lo formulado
      "90.000.000",                   // lo proyectado en los reportes
      "50.500.000",                   // lo ejecutado
      "56%",                          // ejecutado sobre proyectado
      "Por pilar",
      "Proyecto a proyecto",
    ],
  },
  {
    path: "/admin/presupuesto",
    note: "el proyecto abre su reporte anual y las acciones que lo ejecutan",
    expect: "Proyecto a proyecto",
    session: true,
    interact: async (window, tick) => {
      const cabecera = window.document.querySelector(".budget-card__head");
      if (!cabecera) throw new Error("no se listó ningún proyecto");

      cabecera.dispatchEvent(new window.Event("click", { bubbles: true }));
      await tick();

      const cuerpo = window.document.querySelector(".budget-card__body")?.textContent ?? "";
      if (!cuerpo.includes("Reporte anual")) {
        throw new Error("el proyecto no abre su reporte anual");
      }
      // Los cinco años del plan, reportados o no: el hueco es lo que falta por
      // reportar y esconderlo lo haría invisible para quien tiene que llenarlo.
      const filas = window.document.querySelectorAll(".budget-card__body tbody tr");
      if (filas.length !== 5) {
        throw new Error(`se esperaban 5 años del plan y hay ${filas.length}`);
      }
      if (window.document.querySelectorAll(".budget-card__body tr.is-empty").length !== 3) {
        throw new Error("los años sin reportar no se marcan como vacíos");
      }
      if (!cuerpo.includes("Retraso en la licitación")) {
        throw new Error("no se muestra la nota del reporte");
      }
      // Y las acciones que ejecutan ese presupuesto.
      if (!cuerpo.includes("Acciones que ejecutan el presupuesto")) {
        throw new Error("falta el bloque de acciones");
      }
      if (!cuerpo.includes("Fortalecimiento del aula híbrida")) {
        throw new Error("no se listan los indicadores del proyecto");
      }
    },
  },
  {
    path: "/admin/usuarios",
    expect: "Usuarios y roles",
    session: true,
    note: "personas en lista, con su rol global y sus unidades",
    also: ["Administradora de prueba", "Vicerrectoría de Investigaciones", "Editor de Investigación", "Elija una persona"],
  },
  {
    path: "/admin/usuarios?persona=user-vi",
    expect: "Qué hace en toda la universidad",
    session: true,
    note: "la ficha: rol global, dónde trabaja y lo que podrá hacer en palabras",
    also: ["Dónde trabaja", "Lo que podrá hacer", "En UDES en Cifras escribe: Investigación.", "Dirección de programa"],
  },
  {
    path: "/admin/usuarios?nueva=1",
    expect: "Crear usuario",
    session: true,
    note: "el asistente de tres pasos",
    also: ["Quién es", "Qué hace en toda la universidad", "Dónde trabaja", "Enviar invitación"],
  },
  {
    path: "/admin/usuarios/roles?rol=rol-vi",
    expect: "Editor de Investigación",
    session: true,
    note: "la matriz del rol: plantilla, niveles por módulo y resumen",
    also: ["En toda la intranet", "En una unidad", "Personalizada", "UDES en Cifras", "Quien lleve este rol", "Capacidad resultante"],
  },
  {
    path: "/admin/usuarios/roles?rol=rol-director",
    expect: "Dirección de programa",
    session: true,
    note: "un rol de unidad: acciones de Impacto y papel en Mis Tableros",
    also: ["Capturar", "Validar", "Función en la unidad", "Contribuyente", "En Impacto, en su unidad: capturar y enviar."],
  },
  {
    path: "/admin/usuarios/carga",
    expect: "Descargue la plantilla",
    session: true,
    note: "carga masiva de usuarios y asignaciones",
    also: ["Súbala diligenciada", "Descargar plantilla"],
  },
  {
    path: "/admin/udes-en-cifras/captura/poblacional",
    note: "pegar una tabla completa en un desglose y en un mapa de calor",
    session: true,
    expect: "Pegar una tabla completa",
    interact: async (window, tick) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      const openTab = async (name) => {
        const tab = [...window.document.querySelectorAll(".oda-tab")].find((b) => b.textContent.startsWith(name));
        if (!tab) throw new Error(`falta la pestaña ${name}`);
        tab.click();
        await tick();
      };
      const paste = async (panel, text) => {
        const area = window.document.querySelector(`${panel} .oda-paste__area`);
        if (!area) throw new Error(`falta la zona de pegado en ${panel}`);
        setter.call(area, text);
        area.dispatchEvent(new window.Event("input", { bubbles: true }));
        await tick();
        return window.document.querySelector(`${panel} .oda-paste__preview`)?.textContent ?? "";
      };
      const button = (panel, text) => [...window.document.querySelectorAll(`${panel} .oda-paste__actions button`)].find((b) => b.textContent.includes(text));
      const table = (rows) => rows.map((row) => row.join("\t")).join("\n");

      // Desglose: categorías en filas, cortes en columnas, cifras de Excel en español.
      await openTab("Desgloses");
      let preview = await paste("#oda-desgloses", table([["Nivel", "2024", "2025-1"], ["Pregrado nuevo", "1.234", "600"], ["Posgrado nuevo", "200,5", ""]]));
      if (!preview.includes("2 categorías") || !preview.includes("3 cifras") || !preview.includes("nuevas: Pregrado nuevo, Posgrado nuevo")) {
        throw new Error(`vista previa del desglose: ${preview}`);
      }
      button("#oda-desgloses", "Pasar a la rejilla").click();
      await tick();
      const rows = [...window.document.querySelectorAll("#oda-desgloses .oda-grid tbody th")].map((th) => th.textContent);
      if (!rows.some((t) => t.includes("Pregrado nuevo"))) throw new Error("las categorías pegadas no llegaron a la rejilla");
      // Con los cortes hacia abajo, se gira.
      preview = await paste("#oda-desgloses", table([["Corte", "Pregrado", "Posgrado"], ["2024", "10", "2"], ["2025", "12", "3"]]));
      if (!preview.includes("se giró") || !preview.includes("4 cifras")) throw new Error(`tabla girada: ${preview}`);
      preview = await paste("#oda-desgloses", table([["Nivel", "Total"], ["Pregrado", "10"]]));
      if (!preview.includes("no es un corte")) throw new Error(`un encabezado que no es corte debe avisarse: ${preview}`);

      // Mapa de calor con las mismas filas y columnas: pasa a la rejilla.
      await openTab("Mapas de calor");
      const levels = ["Técnico y tecnológico", "Universitario", "Especialización", "Maestría", "Doctorado"];
      preview = await paste("#oda-calor", table([["Nivel", "2020", "2021", "2022", "2023", "2024", "2025"], ...levels.map((r, i) => [r, String(i), "1", "2", "3", "4", "5"])]));
      if (!preview.includes("mismas filas y columnas") || !button("#oda-calor", "Pasar a la rejilla")) throw new Error(`mapa de calor con la misma estructura: ${preview}`);
      // Con otra estructura, se ofrece guardarla completa.
      preview = await paste("#oda-calor", table([["Facultad", "Pregrado", "Posgrado"], ["Ingeniería", "10", "2"], ["Salud", "8", ""]]));
      if (!preview.includes("estructura nueva") || !button("#oda-calor", "Guardar estructura y cifras")) throw new Error(`mapa de calor con estructura nueva: ${preview}`);
    },
  },
  {
    path: "/admin/udes-en-cifras/captura/investigacion",
    as: "user-vi",
    session: true,
    note: "un rol de área solo ve su informe en UDES en Cifras",
    expect: "Captura",
    also: ["Investigación", "Importar informe"],
    // Los informes ajenos no se enseñan: no hay nada que hacer con ellos aquí.
    absent: ["UDES Sostenible", "Infraestructura Física y Tecnológica", "PDI por facultad", "Presupuesto"],
  },
  {
    path: "/admin/presupuesto",
    as: "user-vi",
    session: true,
    note: "una pantalla fuera de su rol no se abre ni escribiendo la dirección",
    expect: "No tienes permiso para esta sección",
  },
  { path: "/tablero", expect: "Cumplimiento global y por pilar", theme: "dark", note: "tema oscuro" },
  {
    path: "/tablero",
    broken: true,
    note: "sin esquema aplicado, el error explica qué hacer",
    expect: "La base de datos todavía no tiene las tablas del portal",
    also: ["0007_permisos_y_cache.sql", "Detalle técnico"],
    interact: async (window) => {
      // El mensaje crudo de PostgREST sigue disponible, pero plegado: quien
      // solo quiere saber qué hacer no debería tropezar con él.
      const detail = window.document.querySelector(".state-error__detail");
      if (!detail) throw new Error("no se ofreció el detalle técnico");
      if (detail.open) throw new Error("el detalle técnico no debería estar desplegado");
      if (!detail.textContent.includes("Could not find the table")) {
        throw new Error("el detalle técnico no conserva el mensaje original");
      }
    },
  },
];

/* --- Empaquetado ----------------------------------------------------------- */

const bundle = await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"development"',
    "import.meta.env.DEV": "false",
    "import.meta.env.VITE_SUPABASE_URL": '"https://smoke.supabase.co"',
    "import.meta.env.VITE_SUPABASE_ANON_KEY": '"smoke-anon-key"',
  },
  loader: { ".css": "empty" },
  logLevel: "silent",
});
const code = bundle.outputFiles[0].text;

const html = `<!doctype html><html lang="es"><body><div id="root"></div></body></html>`;

/* --- Supabase simulado ------------------------------------------------------ */

/**
 * jsdom no implementa fetch, así que tampoco Response ni Headers: hay que usar
 * los de Node (undici). Con los del window el stub lanzaba "Response is not a
 * constructor" dentro del cliente de Supabase, que lo convertía en un error de
 * red silencioso — todas las pantallas se quedaban en "cargando" sin decir por
 * qué.
 */
function makeFetch(session, broken = false, userId = "user-admin", overrides = {}) {
  // Estado propio de cada prueba: el refetch debe leer lo que se guardó.
  const odValues = structuredClone(FIXTURES.od_values ?? []);
  return async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (process.env.SMOKE_DEBUG) console.log("  fetch:", url.slice(0, 130));
    const headers = new Headers(init.headers ?? (typeof input === "object" ? input.headers : undefined));

    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    // Autenticación
    if (url.includes("/auth/v1/user")) {
      const person = (FIXTURES.profiles ?? []).find((row) => row.id === userId);
      return session
        ? reply({ id: userId, email: person?.email ?? "admin@udes.edu.co", aud: "authenticated" })
        : reply({ message: "invalid claim" }, 401);
    }
    if (url.includes("/auth/v1/")) return reply({});

    // Base de datos sin migrar: PostgREST responde 404 con PGRST205. Es
    // exactamente el error que se ve al desplegar sin aplicar el esquema.
    if (broken) {
      const parsed = new URL(url);
      const table = parsed.pathname.match(/\/rest\/v1\/([a-z_]+)/)?.[1] ?? "desconocida";
      return reply(
        {
          code: "PGRST205",
          message: `Could not find the table 'public.${table}' in the schema cache`,
        },
        404,
      );
    }

    // Datos
    const parsed = new URL(url);
    // Las RPC salen de FIXTURES["rpc:nombre"]; sin fixture, una lista vacía.
    // Una ruta puede cambiar alguna con `fixtures`; con `__status`, responde ese error.
    const rpc = parsed.pathname.match(/\/rest\/v1\/rpc\/([a-z_]+)/)?.[1];
    if (rpc) {
      const key = `rpc:${rpc}`;
      const body = key in overrides ? overrides[key] : (FIXTURES[key] ?? []);
      if (body && body.__status) {
        const { __status, ...error } = body;
        return reply(error, __status);
      }
      return reply(body);
    }
    const table = parsed.pathname.match(/\/rest\/v1\/([a-z_]+)/)?.[1];
    if (table === "od_values" && init.method === "POST") {
      // Contrato de od_values_term_unique, incluida la igualdad de campus nulos.
      const key = ["indicator_id", "year", "term", "campus_id"];
      const conflict = (parsed.searchParams.get("on_conflict") ?? "").split(",");
      if (conflict.length !== key.length || !key.every((column) => conflict.includes(column))) {
        return reply({ code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" }, 400);
      }
      const values = JSON.parse(init.body);
      for (const value of values) {
        const existing = odValues.find((row) => key.every((column) => row[column] === value[column]));
        if (existing) Object.assign(existing, value);
        else odValues.push(value);
      }
      return reply(values);
    }
    const rows = applyFilters(table === "od_values" ? odValues : table ? (FIXTURES[table] ?? []) : [], parsed.searchParams);

    // PostgREST devuelve un objeto, no un array, cuando se pide .single().
    const wantsObject = String(headers.get("Accept") ?? "").includes("pgrst.object");
    if (wantsObject) {
      if (rows.length !== 1) return reply({ code: "PGRST116", message: "no rows" }, 406);
      return reply(rows[0]);
    }

    return reply(rows);
  };
}


/**
 * Aplica los filtros de PostgREST que usa el portal (eq, is, or, cs) sobre los
 * fixtures. Sin esto, .maybeSingle() recibía todas las filas de la tabla y
 * fallaba con "multiple rows returned" — un fallo del simulador, no del código.
 */
function applyFilters(rows, params) {
  const reserved = new Set(["select", "order", "limit", "offset"]);
  let result = rows;

  for (const [key, raw] of params.entries()) {
    if (reserved.has(key)) continue;

    if (key === "or") {
      // or=(pillar_id.eq.p1,pillar_id.is.null)
      const clauses = raw.replace(/^\(|\)$/g, "").split(",");
      result = result.filter((row) =>
        clauses.some((clause) => {
          const [column, operator, ...rest] = clause.split(".");
          return matches(row[column], operator, rest.join("."));
        }),
      );
      continue;
    }

    const [operator, ...rest] = raw.split(".");
    const value = rest.join(".");
    result = result.filter((row) => matches(row[key], operator, value));
  }

  result = applyOrder(result, params.get("order"));
  const offset = Number(params.get("offset") ?? 0);
  const limit = params.has("limit") ? Number(params.get("limit")) : undefined;
  return limit === undefined ? result.slice(offset) : result.slice(offset, offset + limit);
}

/**
 * La lista de un filtro in.(…) partida una sola vez. Antes se partía y se
 * limpiaba con expresiones regulares por cada fila: con las listas de ids de
 * UDES en Cifras contra tablas de miles de filas, la portada y /datos-abiertos
 * no terminaban nunca y la prueba moría sin memoria.
 */
const IN_LISTS = new Map();
function inList(value) {
  let set = IN_LISTS.get(value);
  if (!set) {
    set = new Set(
      value
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map((item) => item.trim().replace(/^"|"$/g, "")),
    );
    IN_LISTS.set(value, set);
  }
  return set;
}

function matches(actual, operator, value) {
  switch (operator) {
    case "eq":
      return String(actual) === value;
    case "neq":
      return String(actual) !== value;
    // in.("a","b") — así piden las tablas hijas de UDES en Cifras sus padres.
    case "in":
      return inList(value).has(String(actual));
    case "is":
      return value === "null" ? actual === null : String(actual) === value;
    // not.is.null y compañía: PostgREST antepone `not.` al operador. Mientras
    // esto cayó en el `default`, el simulador devolvía las filas que la consulta
    // pedía descartar.
    case "not": {
      const [inner, ...rest] = value.split(".");
      return !matches(actual, inner, rest.join("."));
    }
    // cs.{"p1"} — "la columna de arreglo contiene todos estos valores". Es como
    // se piden los proyectos de un pilar desde que uno puede apuntar a varios.
    // Mientras esto devolvió `true` sin mirar, el simulador daba a cada pilar
    // los proyectos de todos y la prueba no veía el filtro.
    case "cs": {
      if (!Array.isArray(actual)) return false;
      const wanted = value
        .replace(/^\{|\}$/g, "")
        .split(",")
        .map((item) => item.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
      return wanted.every((item) => actual.map(String).includes(item));
    }
    // gt/gte/lt/lte: la paginación por llave (id > último, ordenado por id)
    // de UDES en Cifras. Mientras cayeron en el `default`, el simulador
    // devolvía siempre la primera página, la paginación no terminaba y la
    // prueba moría sin memoria en / y en /datos-abiertos.
    case "gt":
      return compare(actual, value) > 0;
    case "gte":
      return compare(actual, value) >= 0;
    case "lt":
      return compare(actual, value) < 0;
    case "lte":
      return compare(actual, value) <= 0;
    default:
      return true;
  }
}

/** Compara como lo haría Postgres: números como números, lo demás como texto. */
function compare(actual, value) {
  if (actual === null || actual === undefined) return Number.NaN;
  const a = Number(actual);
  const b = Number(value);
  if (typeof actual === "number" && !Number.isNaN(b)) return a - b;
  const left = String(actual);
  return left < value ? -1 : left > value ? 1 : 0;
}

/** order=col.asc,col2.desc — hace falta para que la paginación por llave sea estable. */
function applyOrder(rows, order) {
  if (!order) return rows;
  const keys = order.split(",").map((part) => {
    const [column, direction] = part.split(".");
    return { column, sign: direction === "desc" ? -1 : 1 };
  });
  return [...rows].sort((x, y) => {
    for (const { column, sign } of keys) {
      const a = x[column];
      const b = y[column];
      if (a === b) continue;
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      return (typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : 1) * sign;
    }
    return 0;
  });
}

// v_projects_admin es v_projects con el valor de formulación de vuelta. Se arma
// aquí y no a mano para que las dos vistas no se desincronicen al tocar una.
FIXTURES.v_projects_admin = FIXTURES.v_projects.map((project) => ({
  ...project,
  total_value: 120000000,
}));

// La vista de administración es la pública más la nota de revisión, y se
// deriva de ella para que las dos no se desincronicen al tocar una. Se le añade
// una acción cuyo pilar declarado no casó con ninguno del PDI: es el único caso
// que bloquea la publicación, y el que la bandeja existe para atrapar.
FIXTURES.v_faculty_actions_admin = [
  ...FIXTURES.v_faculty_actions.map(({ activities, last_cut, last_status, last_reported_on, ...action }) => ({
    ...action,
    status: "publicado",
    faculty_status: "publicado",
    note: "",
    activity_count: activities.length,
    created_at: "2026-07-02T08:00:00Z",
    updated_at: "2026-09-11T06:00:00Z",
  })),
  {
    id: "fa3", faculty_id: "f2", source_id: "d3_1",
    dimension: "d3", dimension_name: "Gestión académica",
    declared_pillar: "Innovación curricular",
    pillar_id: null, area_id: null, action_line_id: null,
    title: "Rediseñar el currículo de los programas de la facultad",
    owner: "Decanatura", goal: "", resources: "",
    deadline: null, deadline_label: "Por definir",
    initial_status: "pendiente", budget_ordinary: false, budget_improvement: false,
    published_at: null, position: 1,
    faculty_slug: "ciencias-naturales", faculty_code: "FCN",
    faculty_name: "Facultad de Ciencias Naturales",
    pillar_slug: null, pillar_numeral: null, pillar_name: null, pillar_accent: null,
    area_code: null, area_name: null, line_code: null, line_name: null,
    last_progress: null,
    status: "borrador", faculty_status: "publicado", note: "",
    activity_count: 0,
    created_at: "2026-07-06T08:00:00Z", updated_at: "2026-09-11T06:00:00Z",
  },
];

/* UDES en Cifras: las filas que deja la migración 0020, generadas junto con ella. */
const OD_FIXTURES = JSON.parse(readFileSync(new URL("./fixtures/udes-en-cifras.json", import.meta.url), "utf8"));
Object.assign(FIXTURES, OD_FIXTURES);

/* Separadores (0029): la ficha de UDES Sostenible agrupa sus bloques en dos secciones. */
{
  const report = FIXTURES.od_reports.find((r) => r.slug === "sostenible");
  const own = FIXTURES.od_report_blocks.filter((b) => b.report_id === report.id).sort((a, b) => a.position - b.position);
  const rest = FIXTURES.od_report_blocks.filter((b) => b.report_id !== report.id);
  const block = (kind, settings, ref_id = null) => ({ id: `od-bloque-sostenible-${kind}-${settings.slot ?? ref_id ?? "x"}`, report_id: report.id, kind, ref_id, section_id: null, visible: true, settings });
  const kpis = own.find((b) => b.kind === "kpis");
  const others = own.filter((b) => b.kind !== "kpis");
  const ordered = [
    block("separador", { title: "Energía y agua", description: "Lo que consume el campus y cuánto se renueva.", slot: "energia" }),
    { ...kpis, settings: { ...kpis.settings, indicators: ["renovable", "agua"] } },
    ...others.filter((b) => b.kind === "evolucion" || b.kind === "mapa_calor"),
    // Sin elección: muestra los desgloses que el otro bloque no eligió (emisiones).
    ...others.filter((b) => b.kind === "desgloses"),
    block("separador", { title: "Residuos y áreas verdes", slot: "residuos" }),
    block("kpis", { indicators: ["residuos", "areas-verdes"], slot: "residuos-kpis" }),
    block("desgloses", { breakdowns: ["tipo-residuo"], slot: "residuos-desgloses" }),
    ...others.filter((b) => b.kind !== "evolucion" && b.kind !== "mapa_calor" && b.kind !== "desgloses"),
  ].map((b, i) => ({ ...b, position: i + 1 }));
  FIXTURES.od_report_blocks = [...rest, ...ordered];
}

/* Rankings (0030): Visibilidad sigue cuatro rankings con varias ediciones. */
{
  const report = FIXTURES.od_reports.find((r) => r.slug === "visibilidad");
  const ranking = (key, title, system, accent, view, position) => ({
    id: `od-ranking-${key}`, report_id: report.id, key, title, description: "", system, accent, view, office_id: null, position,
  });
  FIXTURES.od_rankings = [
    ranking("qs-world", "QS World University Rankings", "qs_world", "#1f5fbf", "medallas", 1),
    ranking("qs-latam", "QS Latin America & The Caribbean", "qs_latam", "#6b3fa0", "medallas", 2),
    ranking("the-impact", "THE Impact Rankings", "the_impact", "#0b7481", "ods", 3),
    ranking("qs-subject", "QS by Subject", "qs_subject", "#a4471f", "medallas", 4),
  ];
  const edition = (key, year, fields) => ({
    id: `od-ranking-${key}-${year}`, ranking_id: `od-ranking-${key}`, year, global_rank: "", regional_rank: "", national_rank: "",
    evaluated: null, score: null, stars: [], sdgs: [], subjects: [], custom: [], note: "", ...fields,
  });
  FIXTURES.od_ranking_editions = [
    edition("qs-world", 2025, { global_rank: "1201-1400", national_rank: "38" }),
    edition("qs-world", 2026, {
      global_rank: "1001-1200", national_rank: "33",
      stars: [
        { category: "Teaching", stars: 4 }, { category: "Employability", stars: 5 }, { category: "Research", stars: 3 },
        { category: "Online Learning", stars: 5 }, { category: "Environmental Impact", stars: 4 },
      ],
    }),
    edition("qs-latam", 2024, { regional_rank: "152", national_rank: "31" }),
    edition("qs-latam", 2025, { regional_rank: "140", national_rank: "29" }),
    edition("qs-latam", 2026, { regional_rank: "131", national_rank: "27", score: 38.5 }),
    edition("the-impact", 2025, {
      global_rank: "601-800", national_rank: "12",
      sdgs: [{ sdg: 3, global_rank: "201-300", national_rank: "4" }, { sdg: 4, global_rank: "301-400", national_rank: "6" }],
    }),
    edition("the-impact", 2026, {
      global_rank: "401-600", national_rank: "10",
      sdgs: [
        { sdg: 3, global_rank: "201-300", national_rank: "4" }, { sdg: 4, global_rank: "301-400", national_rank: "6" },
        { sdg: 5, global_rank: "101-200", national_rank: "2" }, { sdg: 10, global_rank: "201-300", national_rank: "5" },
        { sdg: 17, global_rank: "401-600", national_rank: "9" },
      ],
    }),
    edition("qs-subject", 2026, { subjects: [{ subject: "Medicine", global_rank: "601-650", national_rank: "8" }], custom: [{ label: "Percentil", value: "Top 30 %" }] }),
  ];
  FIXTURES.od_report_blocks = [
    ...FIXTURES.od_report_blocks,
    { id: "od-bloque-visibilidad-rankings", report_id: report.id, kind: "rankings", ref_id: null, section_id: null, position: 3, visible: true, settings: {} },
  ];
}

/* Saber PRO (0031): Enseñanza con dos años, dos sedes y dos programas, más
   el promedio oficial y el nacional. Cúcuta · Ingeniería de Sistemas 2024
   tiene 4 evaluados: el caso de un programa pequeño. */
{
  const report = FIXTURES.od_reports.find((r) => r.slug === "ensenanza");
  const saberId = "od-saber-ensenanza";
  FIXTURES.od_saber_pro = [
    {
      id: saberId, report_id: report.id, key: "saber-pro", title: "Resultados Saber PRO",
      description: "Cómo les va a los estudiantes de la UDES en la prueba de Estado, competencia por competencia.",
      note: "Fuente: ICFES. Un puntaje 0 o sin reporte no cuenta como evaluado.", office_id: null, position: 1,
    },
  ];
  const competencies = ["global", "lc", "rc", "cc", "ce", "ing"];
  const programs = [
    { campus: "Bucaramanga", faculty: "Ciencias de la Salud", program: "Enfermería" },
    { campus: "Bucaramanga", faculty: "Ingenierías", program: "Ingeniería de Sistemas" },
    { campus: "Cúcuta", faculty: "Ciencias de la Salud", program: "Enfermería" },
    { campus: "Cúcuta", faculty: "Ingenierías", program: "Ingeniería de Sistemas" },
  ];
  /** Reparte n evaluados entre las claves, de forma estable. */
  const spread = (n, keys) => Object.fromEntries(keys.map((key, i) => [key, Math.floor(n / keys.length) + (i < n % keys.length ? 1 : 0)]).filter(([, v]) => v > 0));
  const results = [];
  for (const year of [2023, 2024]) {
    programs.forEach((p, pi) => {
      const evaluated = year === 2024 && p.campus === "Cúcuta" && p.program === "Ingeniería de Sistemas" ? 4 : 20 + pi * 6 + (year - 2023) * 3;
      competencies.forEach((competency, ci) => {
        const mean = 138 + pi * 3 + ci * 2 + (year - 2023) * 1.5;
        const levels = competency === "global" ? {} : spread(evaluated, competency === "ing" ? ["-A1", "A1", "A2", "B1", "B2"] : ["1", "2", "3", "4"]);
        const low = Math.floor(mean / 10) * 10 - 10;
        results.push({
          id: `od-saber-${year}-${pi}-${competency}`, saber_id: saberId, year, scope: "programa", ...p, competency, evaluated, mean,
          levels, histogram: spread(evaluated, [String(low), String(low + 10), String(low + 20)]),
        });
      });
    });
    competencies.forEach((competency, ci) => {
      for (const [scope, base] of [["institucion", 142], ["nacional", 148]]) {
        results.push({
          id: `od-saber-${year}-${scope}-${competency}`, saber_id: saberId, year, scope, campus: "", faculty: "", program: "", competency,
          evaluated: null, mean: base + ci + (year - 2023), levels: {}, histogram: {},
        });
      }
    });
  }
  FIXTURES.od_saber_pro_results = results;
  const last = Math.max(...FIXTURES.od_report_blocks.filter((b) => b.report_id === report.id).map((b) => b.position));
  FIXTURES.od_report_blocks = [
    ...FIXTURES.od_report_blocks,
    { id: "od-bloque-ensenanza-saber-pro", report_id: report.id, kind: "saber_pro", ref_id: null, section_id: null, position: last + 1, visible: true, settings: {} },
  ];
}

/* Motor Beta (0035): Enseñanza con dos años y dos programas de tecnología,
   cruzados Saber 11 → Saber TyT. Cada competencia lleva su tránsito entre
   cuartos, el histograma del valor agregado y la nube entrada × salida; el
   conjunto lleva las curvas de percentil de las dos pruebas, de 21 valores. */
{
  const report = FIXTURES.od_reports.find((r) => r.slug === "ensenanza");
  const tytId = "od-tyt-ensenanza";
  /** Curva de 21 puntajes (de 5 en 5 percentiles), de `from` a `to`. */
  const curve = (from, to) => Array.from({ length: 21 }, (_, i) => Math.round((from + ((to - from) * i) / 20) * 100) / 100);
  const competencies = ["global", "lc", "rc", "cc", "ing", "ce"];
  FIXTURES.od_saber_tyt = [
    {
      id: tytId, report_id: report.id, key: "saber-tyt", title: "Saber TyT · Motor Beta",
      description: "De dónde partieron los estudiantes de tecnología y a dónde llegaron, en rango percentil.",
      note: "Fuente: ICFES. El percentil se calcula dentro de la cohorte histórica de la UDES; el valor agregado, solo sobre quienes tienen las dos pruebas.",
      benchmarks: Object.fromEntries([
        ...competencies.map((key) => [key, { entrada: curve(key === "global" ? 180 : 28, key === "global" ? 380 : 82), salida: curve(key === "global" ? 60 : 55, key === "global" ? 165 : 160) }]),
        ["cn", { entrada: curve(30, 80), salida: [] }],
      ]),
      // Motor Alpha (0037): el modelo reajustado sobre esta cohorte y los promedios del país.
      alpha: {
        nacional: {
          saber11: { m: 57, lc: 58, sc: 55, cn: 56, ing: 61, global: 285 },
          tyt: { ce: 94, rc: 90, lc: 97, cc: 96, ing: 100, global: 95 },
        },
        modelos: {
          global: {
            completo: { coef: { intercepto: 12.4, m: 0.71, lc: 0.58, cn: 0.22, sc: 0.31, ing: 0.19 }, r2: 0.612, n: 840, rmse: 9.84 },
            ampliado: { coef: { intercepto: 14.1, m: 0.74, lc: 0.61, sc: 0.33, ing: 0.2 }, r2: 0.588, n: 1204, rmse: 10.37 },
          },
          lc: {
            ampliado: { coef: { intercepto: 21.8, m: 0.34, lc: 0.79, sc: 0.28, ing: 0.12 }, r2: 0.471, n: 1204, rmse: 12.06 },
          },
        },
      },
      office_id: null, position: 1,
    },
  ];
  const programs = ["Tecnología en Gestión Industrial", "Tecnología en Supervisión de Obras Civiles"];
  /** Reparte n entre las claves, de forma estable. */
  const spread = (n, keys) => Object.fromEntries(keys.map((key, i) => [key, Math.floor(n / keys.length) + (i < n % keys.length ? 1 : 0)]).filter(([, v]) => v > 0));
  const results = [];
  for (const year of [2023, 2024]) {
    programs.forEach((program, pi) => {
      const evaluated = 60 + pi * 20 + (year - 2023) * 10;
      const paired = Math.round(evaluated * 0.82);
      competencies.forEach((competency, ci) => {
        const meanEntry = 41 + pi * 2 + ci;
        const meanDelta = 6.5 + pi - ci * 0.5 + (year - 2023);
        const alphaExpected = Math.round((96 + pi * 2 - ci + (year - 2023) * 1.5) * 100) / 100;
        const alphaVa = Math.round((3.2 + pi - ci * 0.4 + (year - 2023) * 0.6) * 100) / 100;
        results.push({
          id: `od-tyt-${year}-${pi}-${competency}`, tyt_id: tytId, year, level: "tecnologico", program, competency,
          evaluated, mean_exit: Math.round((meanEntry + meanDelta) * 100) / 100, paired,
          mean_entry: meanEntry, mean_delta: Math.round(meanDelta * 100) / 100, improved: Math.round(paired * 0.63),
          raw_entry: competency === "global" ? 268 + pi * 4 : 48 + pi + ci, raw_exit: competency === "global" ? 112 + pi * 3 : 104 + pi + ci,
          // De qué cuarto de entrada a qué cuarto de salida pasó cada uno.
          transitions: {
            1: spread(Math.round(paired * 0.3), ["1", "2", "3"]),
            2: spread(Math.round(paired * 0.3), ["2", "3"]),
            3: spread(Math.round(paired * 0.25), ["2", "3", "4"]),
            4: spread(Math.round(paired * 0.15), ["3", "4"]),
          },
          histogram: spread(paired, ["-10", "-5", "0", "5", "10", "15"]),
          scatter: spread(paired, ["20|35", "35|45", "45|55", "55|70", "70|80"]),
          // Motor Alpha: esperado, real, VA, el plano esperado × real y los cuadrantes del artículo.
          alpha_n: paired,
          alpha_expected: alphaExpected,
          alpha_actual: Math.round((alphaExpected + alphaVa) * 100) / 100,
          alpha_va: alphaVa,
          alpha_positive: Math.round(paired * 0.57),
          plane: spread(paired, ["85|85", "90|95", "95|100", "100|105", "105|110"]),
          quadrants: spread(paired, ["1", "2", "3", "4"]),
        });
      });
    });
  }
  FIXTURES.od_saber_tyt_results = results;
  const last = Math.max(...FIXTURES.od_report_blocks.filter((b) => b.report_id === report.id).map((b) => b.position));
  FIXTURES.od_report_blocks = [
    ...FIXTURES.od_report_blocks,
    { id: "od-bloque-ensenanza-saber-tyt", report_id: report.id, kind: "saber_tyt", ref_id: null, section_id: null, position: last + 1, visible: true, settings: {} },
  ];
}

/* Conjuntos libres (0033): Infraestructura con uno por periodo (seis filas y
   una gráfica de cada familia) y uno anual de dos años para líneas y área. */
{
  const report = FIXTURES.od_reports.find((r) => r.slug === "infraestructura");
  const column = (key, label, kind, extra = {}) => ({ key, label, kind, ...extra });
  const view = (key, title, type, fields) => ({ key, title, type, ...fields });
  FIXTURES.od_free_sets = [
    {
      id: "od-libre-oferta", report_id: report.id, key: "oferta-por-sede", title: "Oferta y satisfacción por sede",
      description: "Programas, estudiantes, docentes y satisfacción de cada sede en el periodo.",
      temporality: "periodo", period_label: "2020–2025", office_id: "od-oficina-1", position: 1,
      columns: [
        column("sede", "Sede", "texto"),
        column("programa", "Programa", "texto"),
        column("departamento", "Departamento", "territorio", { territory: "departamento" }),
        column("estudiantes", "Estudiantes", "cifra", { format: "entero", unit: "estudiantes" }),
        column("satisfaccion", "Satisfacción", "cifra", { format: "decimal", unit: "puntos" }),
        column("docentes", "Docentes", "cifra", { format: "entero", unit: "docentes" }),
        column("inicio", "Inicio", "fecha"),
        column("fin", "Fin", "fecha"),
      ],
      views: [
        view("estudiantes-docentes", "Estudiantes y docentes por sede", "barras", { category: "sede", series: ["estudiantes", "docentes"], orientation: "vertical" }),
        view("estudiantes-por-programa", "Estudiantes por programa", "dona", { category: "programa", series: ["estudiantes"] }),
        view("perfil-por-sede", "Perfil de cada sede", "radar", { category: "sede", series: ["estudiantes", "satisfaccion", "docentes"] }),
        view("reparto-satisfaccion", "Reparto de la satisfacción", "histograma", { series: ["satisfaccion"] }),
        view("satisfaccion-por-sede", "Satisfacción por sede", "caja", { category: "sede", series: ["satisfaccion"] }),
        view("suma-estudiantes", "De programa en programa", "cascada", { category: "programa", series: ["estudiantes"], total: true }),
        view("programas-en-curso", "Programas en curso", "gantt", { category: "programa", start: "inicio", end: "fin" }),
        view("estudiantes-por-departamento", "Estudiantes por departamento", "mapa", { category: "departamento", series: ["estudiantes"] }),
        view("la-fuente", "La fuente, fila por fila", "tabla", {}),
      ],
    },
    {
      id: "od-libre-consumo", report_id: report.id, key: "consumo-por-sede", title: "Consumo de energía y agua por sede",
      description: "", temporality: "anual", period_label: "", office_id: null, position: 2,
      columns: [
        column("sede", "Sede", "texto"),
        column("energia", "Energía", "cifra", { format: "entero", unit: "kWh" }),
        column("agua", "Agua", "cifra", { format: "entero", unit: "m³" }),
      ],
      views: [
        view("energia-por-anio", "Energía por año", "lineas", { series: ["energia"] }),
        view("agua-y-energia", "Agua y energía", "area", { series: ["energia", "agua"] }),
      ],
    },
  ];
  // Bogotá va por código DANE y sin satisfacción: un vacío, no un cero.
  // Las filas se agrupan bajo dos títulos, cada uno con su total (0034): los
  // totales los calcula el portal, así que se guardan sin casillas.
  const oferta = [
    ["grupo", "Bucaramanga"],
    ["dato", "", "Bucaramanga", "Enfermería", "Santander", 420, 4.3, 32, "2020-02-01", "2024-12-15"],
    ["dato", "", "Bucaramanga", "Ingeniería de Sistemas", "Santander", 380, 4.1, 28, "2021-01-15", "2025-06-30"],
    ["total", "Total Bucaramanga"],
    ["grupo", "Otras sedes"],
    ["dato", "", "Cúcuta", "Enfermería", "Norte de Santander", 260, 4.0, 19, "2020-08-01", "2023-12-01"],
    ["dato", "", "Cúcuta", "Derecho", "Norte de Santander", 310, 3.8, 22, "2022-02-01", "2025-11-30"],
    ["dato", "", "Valledupar", "Medicina", "Cesar", 290, 4.4, 35, "2021-07-01", "2025-12-15"],
    ["dato", "", "Bogotá", "Psicología", "11", 150, null, 12, "2023-01-15", "2025-12-15"],
    ["total", "Total otras sedes"],
  ];
  const keys = FIXTURES.od_free_sets[0].columns.map((c) => c.key);
  FIXTURES.od_free_set_rows = [
    ...oferta.map(([kind, label, ...values], position) => ({
      id: `od-libre-oferta-${position}`, set_id: "od-libre-oferta", position, year: null, kind, label,
      cells: kind === "dato" ? Object.fromEntries(keys.map((key, i) => [key, values[i]])) : {},
    })),
    ...[[2024, "Bucaramanga", 182000, 9100], [2024, "Cúcuta", 96000, 5200], [2025, "Bucaramanga", 175500, 8800], [2025, "Cúcuta", 99000, 5050]].map(
      ([year, sede, energia, agua], position) => ({ id: `od-libre-consumo-${position}`, set_id: "od-libre-consumo", position, year, kind: "dato", label: "", cells: { sede, energia, agua } }),
    ),
  ];
  const last = Math.max(...FIXTURES.od_report_blocks.filter((b) => b.report_id === report.id).map((b) => b.position));
  FIXTURES.od_report_blocks = [
    ...FIXTURES.od_report_blocks,
    { id: "od-bloque-infraestructura-libre", report_id: report.id, kind: "libre", ref_id: "od-libre-oferta", section_id: null, position: last + 1, visible: true, settings: {} },
    { id: "od-bloque-infraestructura-libre-consumo", report_id: report.id, kind: "libre", ref_id: "od-libre-consumo", section_id: null, position: last + 2, visible: true, settings: { view: "energia-por-anio" } },
  ];
}

/* Boletín UDES en Cifras (0027): uno global publicado con una edición en PDF. */
FIXTURES.od_bulletins = [
  {
    id: "od-boletin-global", period_id: "od-periodo-2020-2025", report_id: null, slug: "boletin-global",
    title: "Boletín UDES en Cifras", settings: {}, status: "publicado", updated_by: null,
    created_at: "2026-09-01T08:00:00Z", updated_at: "2026-09-01T08:00:00Z",
  },
];
FIXTURES.od_bulletin_editions = [
  {
    id: "od-boletin-edicion-1", bulletin_id: "od-boletin-global", title: "Boletín UDES en Cifras", period_label: "2020-2025",
    label: "Edición septiembre de 2026", cut_label: "Periodo 2020–2025", file_path: "ediciones/od-boletin-global/boletin.pdf",
    file_size: 3200000, status: "publicado", note: "", published_by: null, published_at: "2026-09-02T08:00:00Z",
  },
];

/* Impacto (0064–0067): el borrador de la versión 2 con tres indicadores. */
{
  const base = {
    version_id: "imp-v2", matrix_sheet: "1. INVESTIGACIÓN", description: "", unit_original: "", responsible_original: "VI",
    source: "SIGIIP", numerator_def: null, denominator_def: null, factor: null, aggregation: null, direction: null,
    periodicity: null, report_level: null, applies_degrees: [], applies_modalities: [], capture_mode: null,
    evidence_type: null, evidence_required: false, variation_threshold: 30, range_min: null, range_max: null,
    n_minimum: null, allows_over_one: false, validator_function: "investigacion", in_pilot: false, unit: null,
    calc_type: null, sheet_complete: false, open_findings: 0, version_state: "borrador", catalog_state: "oficial",
  };
  FIXTURES.imp_catalog_versions = [
    { id: "imp-v2", number: 2, state: "borrador", source_file: "UDES_Matriz_Impacto_Institucional_vr7.xlsx", notes: "Copia de la versión 1", created_at: "2026-09-20T10:00:00Z", published_at: null },
    { id: "imp-v1", number: 1, state: "publicada", source_file: "UDES_Matriz_Impacto_Institucional_vr7.xlsx", notes: "", created_at: "2026-09-18T10:00:00Z", published_at: "2026-09-19T10:00:00Z" },
  ];
  FIXTURES.imp_indicators_admin = [
    { ...base, id: "imp-i01", code: "I01", function_id: "investigacion", level: "insumos", name: "Estudiantes vinculados a semilleros", matrix_row: 5, unit_original: "1920", in_pilot: true, open_findings: 2 },
    { ...base, id: "imp-e04", code: "E04", function_id: "ensenanza", level: "procesos", name: "Tasa de retención estudiantil", matrix_sheet: "2. ENSEÑANZA", matrix_row: 8,
      unit: "porcentaje", calc_type: "razon", numerator_def: "Siguen matriculados", denominator_def: "Matriculados el periodo anterior", factor: 100,
      aggregation: "razon_de_sumas", direction: "mayor_mejor", periodicity: "semestral", report_level: "programa_sede", applies_degrees: ["pregrado"],
      capture_mode: "precargado", validator_function: "ensenanza", in_pilot: true, sheet_complete: true },
    { ...base, id: "imp-x38", code: "X38", function_id: "extension", level: "impacto", catalog_state: "sugerido", name: "Indicador sugerido de prueba", matrix_sheet: "3. EXTENSIÓN", matrix_row: 41, validator_function: "extension" },
  ];
  FIXTURES.imp_import_findings = [
    { id: "imp-f1", version_id: "imp-v2", sheet: "1. INVESTIGACIÓN", row_number: 5, column_name: "E", kind: "unidad_numerica", value: "1920", suggestion: "Es un número donde va la unidad: probablemente la línea base desplazada de columna.", state: "abierto", note: "", resolved_at: null },
    { id: "imp-f2", version_id: "imp-v2", sheet: "1. INVESTIGACIÓN", row_number: 5, column_name: "F", kind: "linea_base_por_definir", value: "Por definir", suggestion: "Registrar la línea base cuando exista; queda vacía.", state: "abierto", note: "", resolved_at: null },
  ];
  FIXTURES.imp_targets = [];
  FIXTURES.imp_baselines = [];
  FIXTURES.imp_alignments = [{ indicator_id: "imp-i01", kind: "pilar", code: "1" }, { indicator_id: "imp-i01", kind: "ods", code: "4" }];
  FIXTURES["rpc:imp_indicator_missing"] = ["tipo de cálculo", "unidad"];

  // Periodo 2026-2 abierto con tres asignaciones del programa de prueba.
  FIXTURES.imp_periods = [
    { id: "imp-p1", code: "2026-2", state: "abierto", catalog_version_id: "imp-v1", cutoff_program: "2026-10-15",
      cutoff_faculty: "2026-10-25", cutoff_vice: "2026-11-05", opened_at: "2026-09-21T10:00:00Z", version: { number: 1 } },
  ];
  const program = { id: "imp-prog-a", name: "Programa de Prueba A", code: "PR-A", snies_code: "900001", parent: { name: "Facultad de Prueba" } };
  FIXTURES.imp_assignments = [
    { id: "imp-a1", period_id: "imp-p1", active: true, manual: false, justification: "", program_id: program.id, campus_id: "c1",
      indicator: { id: "imp-e04", code: "E04", name: "Tasa de retención estudiantil", capture_mode: "precargado", report_level: "programa_sede" },
      program, campus: { name: "Bucaramanga", slug: "bucaramanga" }, record: [{ state: "borrador" }] },
    { id: "imp-a2", period_id: "imp-p1", active: true, manual: false, justification: "", program_id: program.id, campus_id: null,
      indicator: { id: "imp-e13", code: "E13", name: "Innovaciones pedagógicas implementadas y documentadas", capture_mode: "manual", report_level: "programa" },
      program, campus: null, record: [{ state: "enviado" }] },
    { id: "imp-a3", period_id: "imp-p1", active: false, manual: false, justification: "El programa no hizo innovaciones este año.", program_id: program.id, campus_id: null,
      indicator: { id: "imp-i34", code: "I34", name: "Desempeño académico en formación investigativa", capture_mode: "manual", report_level: "programa" },
      program, campus: null, record: [] },
  ];
  // Mi reporte: el Programa A captura en 2026-2.
  FIXTURES["rpc:imp_my_programs"] = [
    { program_id: "imp-prog-a", program_name: "Programa de Prueba A", program_code: "PR-A", faculty_name: "Facultad de Prueba", can_send: true },
  ];
  const cap = {
    assignment_id: "a", value: null, comparison_value: null, n_responses: null, num_comparison: null, den_comparison: null, text_value: null,
    confirms_preloaded: null, preloaded: null, no_data: null, justification: "", observations: "", state: "borrador", channel: "en_linea",
    version: 1, captured_by: null, updated_at: "2026-09-22T10:00:00Z", program_id: "imp-prog-a", period_id: "imp-p1", period_code: "2026-2",
    period_state: "abierto", cutoff_program: "2026-10-15", program_name: "Programa de Prueba A", campus_id: null, campus_name: null,
    description: "", unit: "numero", numerator_def: "", denominator_def: null, factor: 1, aggregation: "suma", direction: "mayor_mejor",
    periodicity: "semestral", capture_mode: "manual", evidence_type: null, evidence_required: false, variation_threshold: 30,
    range_min: null, range_max: null, n_minimum: null, allows_over_one: false, target_numeric: null, target_text: null,
    previous_value: null, previous_period: null, return_reason: null, return_comment: null, evidence_count: 0,
  };
  FIXTURES.imp_capture_rows = [
    { ...cap, id: "imp-r1", code: "E04", name: "Tasa de retención estudiantil", function_id: "ensenanza", level: "procesos", calc_type: "razon",
      unit: "porcentaje", factor: 100, aggregation: "razon_de_sumas", capture_mode: "precargado", campus_id: "c1", campus_name: "Bucaramanga",
      numerator_def: "Siguen matriculados", denominator_def: "Matriculados el periodo anterior", numerator: 430, denominator: 480,
      preloaded: { numerator: 430, denominator: 480, n: null, file: "registro.csv", at: "2026-09-21T10:00:00Z" }, target_text: "+1 pp vs LB" },
    { ...cap, id: "imp-r2", code: "E13", name: "Innovaciones pedagógicas implementadas y documentadas", function_id: "ensenanza", level: "productos",
      calc_type: "conteo", numerator_def: "Innovaciones documentadas", evidence_required: true, evidence_type: "Acta del comité curricular", numerator: 3 },
    { ...cap, id: "imp-r3", code: "I01", name: "Estudiantes vinculados a semilleros", function_id: "investigacion", level: "insumos", calc_type: "conteo",
      numerator_def: "Estudiantes activos en semilleros", state: "devuelto_programa", numerator: 55, return_reason: "evidencia_insuficiente",
      return_comment: "Adjunte el listado del SIGIIP." },
  ];
  FIXTURES.imp_evidence = [];
  FIXTURES.imp_transitions = [];
  FIXTURES.imp_import_batch_records = [];

  // Revisión (0071): la persona de la sesión es decanatura del Programa B y
  // vicerrectoría de Enseñanza. Un registro lo capturó ella misma.
  FIXTURES["rpc:imp_my_review_scope"] = {
    deanPrograms: [{ id: "imp-prog-b", name: "Programa de Prueba B", faculty: "Facultad de Prueba" }],
    functions: ["ensenanza"],
  };
  const rev = { ...cap, program_id: "imp-prog-b", program_name: "Programa de Prueba B", captured_by: "otra-persona", updated_by: "otra-persona" };
  FIXTURES.imp_capture_rows.push(
    { ...rev, id: "imp-rv1", code: "E04", name: "Tasa de retención estudiantil", function_id: "ensenanza", level: "procesos", calc_type: "razon",
      unit: "porcentaje", factor: 100, aggregation: "razon_de_sumas", campus_id: "c1", campus_name: "Bucaramanga", state: "enviado",
      numerator_def: "Siguen matriculados", denominator_def: "Matriculados el periodo anterior", numerator: 430, denominator: 480, value: 89.583 },
    { ...rev, id: "imp-rv2", code: "E13", name: "Innovaciones pedagógicas implementadas y documentadas", function_id: "ensenanza", level: "productos",
      calc_type: "conteo", state: "devuelto_decanatura", numerator: 7, value: 7, justification: "Se sumaron dos cohortes nuevas." },
    { ...rev, id: "imp-rv3", code: "E01", name: "Profesores con título de Maestría y Doctorado", function_id: "ensenanza", level: "insumos",
      calc_type: "razon", unit: "porcentaje", factor: 100, denominator_def: "Profesores del programa", state: "aprobado_decanatura",
      numerator: 18, denominator: 22, value: 81.818 },
    { ...rev, id: "imp-rv4", code: "X04", name: "Profesores vinculados a extensión", function_id: "extension", level: "insumos",
      calc_type: "conteo", state: "enviado", numerator: 4, value: 4, captured_by: "user-admin", updated_by: "user-admin" },
  );
  FIXTURES.imp_transitions.push({
    record_id: "imp-rv2", at: "2026-09-22T15:00:00Z", from_state: "aprobado_decanatura", to_state: "devuelto_decanatura",
    reason: "variacion_sin_justificar", comment: "Explique el salto frente a 2026-1.", actor: null,
  });

  // Portal (0072): catálogo publicado, estructura real y solo registros validados.
  const portalSheet = {
    unit: "porcentaje", calc_type: "razon", numerator_def: "Siguen matriculados", denominator_def: "Matriculados el periodo anterior",
    factor: 100, aggregation: "razon_de_sumas", direction: "mayor_mejor", periodicity: "semestral", report_level: "programa_sede",
    applies_degrees: ["pregrado"], capture_mode: "precargado", evidence_type: null, evidence_required: false, variation_threshold: 15,
    range_min: null, range_max: null, n_minimum: null, allows_over_one: false, in_pilot: true, sheet_complete: true,
  };
  const portalBare = {
    unit: null, calc_type: null, numerator_def: null, denominator_def: null, factor: null, aggregation: null, direction: null,
    periodicity: null, report_level: null, applies_degrees: [], capture_mode: null, evidence_type: null, evidence_required: false,
    variation_threshold: 30, range_min: null, range_max: null, n_minimum: null, allows_over_one: false, in_pilot: false, sheet_complete: false,
  };
  const portalIndicator = (code, function_id, level, name, extra = {}) => ({
    code, function_id, level, catalog_state: "oficial", name, description: "", unit_original: "", responsible_original: "",
    source: "", origin: "", targets: [], baseline: null, alignments: [], ...portalBare, ...extra,
  });
  FIXTURES["rpc:imp_portal_catalog"] = {
    version: { id: "imp-v1", number: 1, source_file: "UDES_Matriz_Impacto_Institucional_vr7.xlsx", published_at: "2026-09-19T10:00:00Z" },
    indicators: [
      portalIndicator("I01", "investigacion", "insumos", "Estudiantes vinculados a semilleros", { unit_original: "1920" }),
      portalIndicator("E04", "ensenanza", "procesos", "Tasa de retención estudiantil", {
        ...portalSheet, unit_original: "% estudiantes", source: "Registro y Control",
        targets: [{ year: 2026, numeric: null, text: "+1 pp vs LB" }], baseline: { year: 2023, value: 86.5 },
        alignments: [{ kind: "pilar", code: "2" }, { kind: "ods", code: "4" }],
      }),
      portalIndicator("E13", "ensenanza", "productos", "Innovaciones pedagógicas implementadas y documentadas", {
        ...portalSheet, unit: "numero", calc_type: "conteo", numerator_def: "Innovaciones documentadas", denominator_def: null, factor: 1,
        aggregation: "suma", report_level: "programa", periodicity: "anual", capture_mode: "manual", unit_original: "N° innovaciones",
      }),
      portalIndicator("X38", "extension", "impacto", "Indicador sugerido de prueba", { catalog_state: "sugerido" }),
    ],
  };
  FIXTURES["rpc:imp_portal_structure"] = {
    faculties: [
      { id: "imp-fcs", slug: "ciencias-sociales", code: "FCS", name: "Facultad de Ciencias Sociales" },
      { id: "imp-fit", slug: "ingenierias-y-tecnologias", code: "FIT", name: "Facultad de Ingenierías y Tecnologías" },
    ],
    programs: [
      { id: "imp-derecho", slug: "derecho", code: "DER", name: "Derecho", faculty_id: "imp-fcs", degree_level: "pregrado", modality: "presencial", campus_ids: ["imp-c-bga", "imp-c-cuc"] },
      { id: "imp-sistemas", slug: "ingenieria-de-sistemas", code: "ISI", name: "Ingeniería de Sistemas", faculty_id: "imp-fit", degree_level: "pregrado", modality: "presencial", campus_ids: ["imp-c-bga"] },
    ],
    campuses: [
      { id: "imp-c-bga", slug: "bucaramanga", name: "Bucaramanga" },
      { id: "imp-c-cuc", slug: "cucuta", name: "Cúcuta" },
      { id: "imp-c-bog", slug: "bogota", name: "Bogotá" },
    ],
  };
  const measure = (code, program_id, campus_id, period_code, numerator, denominator = null) => ({
    code, program_id, campus_id, period_code, numerator, denominator, n_responses: null, num_comparison: null, den_comparison: null,
    value: denominator ? (numerator / denominator) * 100 : numerator, comparison_value: null,
  });
  FIXTURES["rpc:imp_portal_records"] = [
    measure("E04", "imp-derecho", "imp-c-bga", "2025-2", 400, 500),
    measure("E04", "imp-sistemas", "imp-c-bga", "2025-2", 300, 400),
    measure("E04", "imp-derecho", "imp-c-bga", "2026-1", 450, 500),
    measure("E04", "imp-derecho", "imp-c-cuc", "2026-1", 180, 200),
    measure("E04", "imp-sistemas", "imp-c-bga", "2026-1", 340, 400),
    measure("E13", "imp-derecho", null, "2026-1", 3),
    measure("E13", "imp-sistemas", null, "2026-1", 2),
  ];

  FIXTURES.imp_settings = [{ key: "importacion_todo_o_nada", value: false }];
  FIXTURES.units = [
    { id: "imp-prog-a", name: "Programa de Prueba A", code: "PR-A", snies_code: "900001", kind: "programa",
      campuses: [{ campus: { id: "c1", name: "Bucaramanga", slug: "bucaramanga" } }] },
  ];
}

/* --- Ejecución -------------------------------------------------------------- */

let failures = 0;

for (const route of routes) {
  if (process.env.SMOKE_ROUTE && route.path !== process.env.SMOKE_ROUTE) continue;
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  virtualConsole.on("error", (...args) => errors.push(args.join(" ")));
  if (process.env.SMOKE_DEBUG) {
    virtualConsole.on("warn", (...args) => console.log("  warn:", args.join(" ").slice(0, 300)));
    virtualConsole.on("log", (...args) => console.log("  log :", args.join(" ").slice(0, 300)));
  }

  const dom = new JSDOM(html, {
    url: `http://localhost${route.path}`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
  });

  // APIs que jsdom no trae y que el portal usa de verdad.
  dom.window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  dom.window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  dom.window.scrollTo = () => {};
  dom.window.Element.prototype.scrollIntoView = () => {};
  if (!dom.window.matchMedia) {
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  }

  if (route.session) {
    // supabase-js lee la sesión de localStorage con esta clave.
    dom.window.localStorage.setItem(
      "sb-smoke-auth-token",
      JSON.stringify({
        access_token: "smoke",
        refresh_token: "smoke",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: { id: route.as ?? "user-admin", email: "admin@udes.edu.co", aud: "authenticated" },
      }),
    );
  }
  if (route.theme) dom.window.localStorage.setItem("pdi-theme", route.theme);
  for (const [key, value] of Object.entries(route.storage ?? {})) dom.window.localStorage.setItem(key, value);

  // El cliente de Supabase toma fetch de globalThis al construirse, que dentro
  // de jsdom es el window.
  dom.window.fetch = makeFetch(Boolean(route.session), Boolean(route.broken), route.as ?? "user-admin", route.fixtures ?? {});
  dom.window.Headers = Headers;
  dom.window.Response = Response;
  dom.window.Request = Request;

  try {
    dom.window.eval(code);
  } catch (error) {
    errors.push(String(error));
  }

  // Las rutas se cargan bajo demanda y las consultas resuelven en promesas.
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.SMOKE_WAIT ?? 900)));

  // Interacción opcional: comprobar que un control hace lo que dice.
  if (route.interact) {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 120));
    try {
      await route.interact(dom.window, tick);
      await tick();
    } catch (error) {
      errors.push(String(error));
    }
  }

  const text = dom.window.document.body.textContent ?? "";
  const missing = [route.expect, ...(route.also ?? [])].filter((needle) => !text.includes(needle));
  const leftover = (route.absent ?? []).filter((needle) => text.includes(needle));

  if (missing.length || leftover.length || errors.length) {
    failures++;
    console.log(`FALLO  ${route.path}${route.note ? `  (${route.note})` : ""}`);
    if (missing.length) console.log(`       no apareció: ${missing.join(" | ")}`);
    if (leftover.length) console.log(`       debería haberse filtrado: ${leftover.join(" | ")}`);
    if (missing.length || leftover.length)
      console.log(`       se pintó: ${text.slice(0, Number(process.env.SMOKE_TEXT ?? 160))}`);
    errors.slice(0, 3).forEach((error) => console.log(`       ${String(error).slice(0, 200)}`));
  } else {
    console.log(`OK     ${route.path}${route.note ? `  (${route.note})` : ""}`);
  }

  try {
    dom.window.close();
  } catch {
    /* jsdom protesta si queda algún temporizador vivo; no afecta al resultado */
  }
}

console.log(
  failures === 0
    ? "\nTodas las rutas montan y pintan sus datos."
    : `\n${failures} ruta(s) con problemas.`,
);
process.exit(failures === 0 ? 0 : 1);
