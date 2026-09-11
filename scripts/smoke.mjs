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
      is_active: true,
      created_at: "2024-10-15T00:00:00Z",
      updated_at: "2024-10-15T00:00:00Z",
    },
  ],
  pillar_owners: [],
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
};

/* --- Rutas a comprobar ----------------------------------------------------- */

const routes = [
  {
    path: "/",
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
    ],
    // La portada es pública: las cifras presupuestales tampoco caben aquí.
    absent: SIN_DINERO,
  },
  {
    path: "/",
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
      // Los pilares recomendados salen de la base, con su avance: no son texto.
      if (!resultado.includes("Ambiente tecnológico") || !resultado.includes("% de avance")) {
        throw new Error("el resultado no enlaza los pilares publicados con su avance");
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
  { path: "/admin/usuarios", expect: "Usuarios y roles", session: true, also: ["Administradora de prueba"] },
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
function makeFetch(session, broken = false) {
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
      return session
        ? reply({ id: "user-admin", email: "admin@udes.edu.co", aud: "authenticated" })
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
    const table = parsed.pathname.match(/\/rest\/v1\/([a-z_]+)/)?.[1];
    const rows = applyFilters(table ? (FIXTURES[table] ?? []) : [], parsed.searchParams);

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

  return result;
}

function matches(actual, operator, value) {
  switch (operator) {
    case "eq":
      return String(actual) === value;
    case "neq":
      return String(actual) !== value;
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
    default:
      return true;
  }
}

// v_projects_admin es v_projects con el valor de formulación de vuelta. Se arma
// aquí y no a mano para que las dos vistas no se desincronicen al tocar una.
FIXTURES.v_projects_admin = FIXTURES.v_projects.map((project) => ({
  ...project,
  total_value: 120000000,
}));

/* --- Ejecución -------------------------------------------------------------- */

let failures = 0;

for (const route of routes) {
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
        user: { id: "user-admin", email: "admin@udes.edu.co", aud: "authenticated" },
      }),
    );
  }
  if (route.theme) dom.window.localStorage.setItem("pdi-theme", route.theme);

  // El cliente de Supabase toma fetch de globalThis al construirse, que dentro
  // de jsdom es el window.
  dom.window.fetch = makeFetch(Boolean(route.session), Boolean(route.broken));
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
