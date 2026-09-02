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
  { pillar_id: "p2", slug: "sostenibilidad", done: 4, active: 2, pending: 0, risk: 0, total: 6, progress: 67, completion_rate: 67, area_count: 0, line_count: 0, project_count: 0 },
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
    { project_id: "pr1", pillar_id: "p1", action_line_id: "l1", name: "Migración a la nube institucional", reported_progress: 60, progress: 75, activity_count: 2, activity_done: 1, is_derived: true, target_value: null, achieved_value: null, measure_unit: null },
  ],
  v_current_period: [
    { id: "r1", label: "Corte agosto 2026", cutoff_date: "2026-08-28", published_at: "2026-08-28T17:00:00Z" },
  ],
  activities: [
    {
      id: "a1",
      pillar_id: "p1",
      project_id: null,
      title: "Fortalecimiento del aula híbrida",
      owner: "Dirección TIC",
      due_date: "2026-09-30",
      progress: 72,
      status: "curso",
      is_featured: true,
      position: 1,
      action_line_id: "l1",
      pillar: { slug: "ambiente-tecnologico", name: "Ambiente tecnológico", accent_slot: 2 },
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
    { id: "l1", code: "LA-4.1", name: "Infraestructura base", progress: 75, position: 1, area_id: "ae1", area_name: "Infraestructura tecnológica", area_code: "AE-03", pillar_id: "p1", reported_progress: 85, project_count: 1, is_derived: true, activity_count: 4, activity_done: 3, target_value: null, achieved_value: null, measure_unit: null },
    { id: "l2", code: "LA-5.1", name: "Cultura digital", progress: 30, position: 1, area_id: "ae2", area_name: "Cultura digital", area_code: "AE-05", pillar_id: "p1", reported_progress: 30, project_count: 0, is_derived: false, activity_count: 2, activity_done: 0, target_value: null, achieved_value: null, measure_unit: null },
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
  { path: "/", expect: "Aquí construimos futuro", also: ["Ambiente tecnológico", "67"] },
  { path: "/tablero", expect: "Cumplimiento global y por pilar", also: ["Fortalecimiento del aula híbrida"] },
  { path: "/implementacion", expect: "Cómo avanza cada pilar", also: ["Plan de Desarrollo Institucional"] },
  {
    path: "/implementacion/pilar/ambiente-tecnologico",
    expect: "Ambiente tecnológico",
    also: [
      "Todas las áreas",              // el selector apunta a áreas, no a protocolos
      "Áreas estratégicas del pilar", // la rejilla con el avance por área
      "Infraestructura tecnológica",  // el área del proyecto
      "Infraestructura base",         // su línea de acción
      "PDI-AT-001",
      "Presupuesto ejecutado",        // los recursos del indicador sí se ven
      "Promedio de 2 áreas",          // el anillo dice de dónde sale
      "promedio de 2 actividades",    // el proyecto deriva de sus actividades
      "Actividades del pilar",        // sustituye a "Planeación de resultados"
      "Fortalecimiento del aula híbrida",
      "En el tablero",                // la actividad destacada se marca
    ],
    absent: ["Planeación de resultados"],
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
      "Presupuesto ejecutado",        // recursos del indicador: ocultos
      "Tiempo transcurrido",
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

      // Las actividades siguen el mismo filtro que los proyectos.
      const actividades = window.document.querySelector("#actividades")?.textContent ?? "";
      if (actividades.includes("Fortalecimiento del aula híbrida")) {
        throw new Error("la actividad de otra área sigue en la lista");
      }
      if (!actividades.includes("Sin actividades vinculadas a Cultura digital")) {
        throw new Error("no se avisa de que el área no tiene actividades");
      }
    },
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
      "cuentan actividades",         // la nota del respaldo
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
  { path: "/acceso-intranet", expect: "Intranet PDI" },
  { path: "/ruta-que-no-existe", expect: "Esta página no existe" },
  { path: "/admin/pilares", expect: "Intranet PDI", note: "sin sesión debe redirigir al acceso" },
  { path: "/admin/pilares", expect: "Gestión de pilares", session: true },
  { path: "/admin/parametros", expect: "Parámetros globales", session: true, also: ["Estratégico"] },
  {
    path: "/admin/pilares/ambiente-tecnologico/configurar",
    expect: "Áreas estratégicas",
    session: true,
    also: [
      "Migración a la nube institucional",
      "Infraestructura tecnológica",
      "Actividades",
      "registro automático",     // la entrada escrita por el disparador
      "promedio de 1 proyecto",  // la línea deriva su avance
      "Metas y cumplimiento",    // el panel de metas por área y línea
      "28 servicios",            // meta capturada del área
      "Sin meta",                // y el estado de la que no tiene
    ],
  },
  {
    path: "/admin/pilares/ambiente-tecnologico/configurar",
    session: true,
    note: "el formulario de edición llega relleno",
    expect: "Editar proyecto",
    also: ["control de cambios", "Línea de acción"],
    interact: async (window, tick) => {
      const edit = window.document.querySelector(
        '[aria-label="Editar el proyecto Migración a la nube institucional"]',
      );
      if (!edit) throw new Error("no se encontró el botón de editar del proyecto");
      edit.click();
      await tick();

      // El modal debe abrirse con los valores actuales, no vacío.
      const dialog = window.document.querySelector(".modal-panel");
      if (!dialog) throw new Error("el modal de edición no se abrió");

      const name = dialog.querySelector("input[type=text]");
      if (!name || name.value !== "Migración a la nube institucional") {
        throw new Error(`el nombre no llegó relleno: "${name ? name.value : "sin campo"}"`);
      }

      const range = dialog.querySelector("input[type=range]");
      if (!range || range.value !== "75") {
        throw new Error(`el avance no llegó relleno: "${range ? range.value : "sin campo"}"`);
      }

      // La línea de acción debe venir seleccionada y agrupada por su área.
      const selects = [...dialog.querySelectorAll("select")];
      const linea = selects.find((element) => element.value === "l1");
      if (!linea) throw new Error("la línea de acción no llegó seleccionada");
      if (!linea.querySelector("optgroup")) {
        throw new Error("las líneas no se agruparon por área");
      }
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
 * Aplica los filtros de PostgREST que usa el portal (eq, is, or) sobre los
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
    default:
      return true;
  }
}

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
