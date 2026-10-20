/* =============================================================================
   Intranet · los portales internos de cada módulo del lanzador.

   Cada módulo del menú (AdminShell) es un cartel del muro. Si, con los
   permisos de quien mira, el módulo tiene dos o más pantallas, el cartel se
   abre como microportal con estas tarjetas agrupadas; con una sola, el cartel
   va directo a ella. Las tarjetas son destinos reales: entradas del menú o
   secciones con ruta propia dentro del módulo (App.tsx).

   Reglas de cada tarjeta, además de las del módulo (que ya filtra el menú):
     minimum  rol mínimo (hasRole)
     screen   pantalla del rol de acceso (canSee)
     when     condición propia (p. ej. el lado de Impacto de la persona)
   ========================================================================== */

import type { AdminScreen, AppRole } from "../../../types/database";
import type { ImpactoSide } from "../../../lib/auth";
import { navigation, type AdminSection, type NavGroup } from "../components/AdminShell";
import { STATIONS } from "../udes-en-cifras/progress";
import { OBS_STATIONS } from "../observatorio/stations";

export type ModuleId = NavGroup["id"];

export interface PortalContext {
  hasRole: (minimum: AppRole) => boolean;
  canSee: (screen: AdminScreen) => boolean;
  impactoSide: ImpactoSide;
  /** Informes del periodo vigente de UDES en Cifras, ya filtrados por canSeeReport. */
  reports?: { slug: string; name: string }[];
  /** Director de Internacionalización (int_yo), si se pudo leer. */
  intDirector?: boolean;
}

export interface PortalCard {
  key: string;
  title: string;
  text: string;
  to: string;
  minimum?: AppRole;
  screen?: AdminScreen;
  when?: (ctx: PortalContext) => boolean;
}

export interface PortalSection {
  title: string;
  cards: PortalCard[];
}

interface ModuleMeta {
  /** Lo que se hace ahí, en una línea. */
  text: string;
  /** Color del cartel (token del muro). */
  color: string;
  /** Importancia en el muro: el menor va primero (y grande). */
  rank: number;
  sections: (ctx: PortalContext) => PortalSection[];
}

/** Una entrada del menú como tarjeta: mismo rótulo, ruta y rol mínimo. */
function nav(id: AdminSection, text: string): PortalCard {
  const item = navigation.flatMap((g) => g.items).find((i) => i.id === id);
  if (!item) throw new Error(`El menú no tiene la pantalla «${id}»`);
  return { key: id, title: item.label, text, to: item.to, minimum: item.minimum, screen: id };
}

const programSide = (c: PortalContext) => c.impactoSide === "programa" || c.impactoSide === "ambos";
const functionSide = (c: PortalContext) => c.impactoSide === "funcion" || c.impactoSide === "ambos" || c.hasRole("planeacion");

export const MODULES: Record<ModuleId, ModuleMeta> = {
  rankings: {
    text: "THE, UI GreenMetric y el recolector de noticias por ODS",
    color: "var(--wall-rankings)",
    rank: 1,
    sections: () => [
      {
        title: "Rankings",
        cards: [
          { key: "tablero", title: "Tablero de rankings", text: "Los tres rankings y el recolector de un vistazo", to: "/admin/rankings" },
          { key: "impact", title: "THE Impact", text: "Reporte por oficinas, posición por edición y portal público", to: "/admin/rankings/impact" },
          { key: "world", title: "THE World", text: "Posición por edición y accesos al portal público", to: "/admin/rankings/world" },
          { key: "green", title: "UI GreenMetric", text: "Posición por edición y accesos al portal público", to: "/admin/rankings/green" },
        ],
      },
      {
        title: "Herramientas de Pilo",
        cards: [
          { key: "noticias", title: "Recolector de noticias", text: "Las noticias de udes.edu.co clasificadas por ODS", to: "/admin/rankings/noticias" },
          { key: "informes", title: "Informes ODS con Pilo", text: "Pilo redacta cada ODS; usted revisa y publica", to: "/admin/rankings/informes" },
          { key: "posicion", title: "Posicionamiento THE", text: "Dónde está la UDES y qué tan probable es moverse", to: "/admin/rankings/posicion" },
        ],
      },
    ],
  },
  pdi: {
    text: "Pilares, proyectos, facultades, sedes y presupuesto del plan",
    color: "var(--wall-pdi)",
    rank: 2,
    sections: () => [
      { title: "Seguimiento", cards: [nav("pillars", "Avance y configuración de cada pilar"), nav("projects", "Los proyectos del plan, transversales a los pilares")] },
      { title: "El plan por unidad", cards: [nav("faculties", "Qué se hace y quién lo empuja, por facultad"), nav("campus", "El plan visto por sede")] },
      { title: "Recursos", cards: [nav("budget", "Ejecución de los proyectos; no tiene pantalla pública"), nav("repository", "Documentos de soporte de la implementación")] },
    ],
  },
  impacto: {
    text: "Los indicadores de impacto, sus metas y sus cifras",
    color: "var(--wall-impacto)",
    rank: 3,
    sections: () => [
      {
        title: "Mi programa",
        cards: [
          { key: "mi-catalogo", title: "Mi catálogo", text: "Las fichas que sigue y los indicadores propios", to: "/admin/impacto/mi-catalogo", when: programSide },
          { key: "elegir", title: "Elegir indicadores", text: "Qué fichas de las vicerrectorías sigue", to: "/admin/impacto/elegir", when: programSide },
          { key: "programa", title: "Captura del programa", text: "Línea base, metas y la cifra de cada año", to: "/admin/impacto/programa", when: programSide },
        ],
      },
      {
        title: "Catálogo de la función",
        cards: [
          { key: "catalogo", title: "Catálogo", text: "Las fichas de su función y «Nuevo indicador»", to: "/admin/impacto/catalogo", when: functionSide },
          { key: "captura", title: "Captura", text: "Cifras globales, por sede o por programa", to: "/admin/impacto/captura", when: functionSide },
          { key: "pilares", title: "Pilares y ODS", text: "A qué pilar y a qué ODS apunta cada ficha", to: "/admin/impacto/pilares", when: functionSide },
          { key: "programas", title: "De los programas", text: "Lo que crearon los programas en su función", to: "/admin/impacto/programas", when: functionSide },
          { key: "importar", title: "Importar", text: "La plantilla de Excel para cargar cifras", to: "/admin/impacto/importar", when: functionSide },
        ],
      },
      {
        title: "Ajustes",
        cards: [
          { key: "motor", title: "Diccionario del motor", text: "Las palabras con que el motor sugiere pilares y ODS", to: "/admin/impacto/motor", minimum: "planeacion" },
          { key: "pilo", title: "Mr. Pilo · ajustes", text: "Pesos de las propuestas y carga de los P1P2P3", to: "/admin/impacto/pilo", minimum: "planeacion" },
          { key: "sincronizacion", title: "Sincronización", text: "Trae lo capturado en la hoja anterior", to: "/admin/impacto/sincronizacion", minimum: "admin" },
        ],
      },
    ],
  },
  cifras: {
    text: "Las estaciones del periodo de UDES en Cifras",
    color: "var(--wall-cifras)",
    rank: 4,
    sections: (ctx) => [
      {
        title: "Estaciones del periodo",
        cards: STATIONS.map((s) => ({ key: s.id, title: s.label, text: s.hint, to: `/admin/udes-en-cifras/${s.id}` })),
      },
      {
        title: "Informes del periodo",
        cards: (ctx.reports ?? []).map((r) => ({
          key: `informe-${r.slug}`,
          title: r.name,
          text: "Captura de las cifras del informe",
          to: `/admin/udes-en-cifras/captura/${r.slug}`,
        })),
      },
    ],
  },
  reportes: {
    text: "Las plantillas SNIES por periodo: captura, validación y envío",
    color: "var(--wall-reportes)",
    rank: 5,
    sections: () => [
      {
        title: "Plantillas por periodo",
        cards: [
          { key: "snies", title: "SNIES", text: "Captura, validación y envío de cada plantilla", to: "/admin/reportes-institucionales/snies" },
          { key: "catalogos", title: "Catálogos", text: "Los nombres de las hojas y su código oficial para HECAA", to: "/admin/reportes-institucionales/catalogos", minimum: "planeacion" },
          { key: "cna", title: "CNA", text: "Acreditación · en borrador", to: "/admin/reportes-institucionales/cna", minimum: "admin" },
        ],
      },
    ],
  },
  informes: {
    text: "El informe de gestión anual de cada unidad, con cifras vivas",
    color: "var(--wall-informes)",
    rank: 5.5,
    sections: (ctx) => {
      const base = "/admin/informes-gestion";
      const planeacion = ctx.hasRole("planeacion");
      return [
        {
          title: "El informe",
          cards: [{ key: "inf-mi", title: "Mi informe", text: "Secciones, cifras vivas, evidencias y envío", to: `${base}/mi-informe` }],
        },
        {
          title: "Planeación",
          cards: [
            { key: "inf-tablero", title: "Tablero del ciclo", text: "Estado por unidad, plantillas y qué se justifica", to: base, when: () => planeacion },
            { key: "inf-revision", title: "Revisión", text: "Aprobar o devolver con nota por sección", to: `${base}/revision`, when: () => planeacion },
            { key: "inf-pilo", title: "Capacitación de Pilo", text: "Los informes de 2025 y lo que Pilo aprendió", to: `${base}/capacitacion`, when: () => planeacion },
          ],
        },
      ];
    },
  },
  "programas-en-cifras": {
    text: "Los cuadros del CNA y las plantillas del SNIES de cada programa y campus, como en OneDrive",
    color: "var(--wall-programas-en-cifras)",
    rank: 5.7,
    sections: () => [
      {
        title: "Mi programa",
        cards: [
          { key: "pec", title: "Programas en Cifras", text: "Tablas y listas con el Cuadro Maestro del CNA, periodos y emisión", to: "/admin/programas-en-cifras" },
          { key: "pec-equipo", title: "Equipo y accesos", text: "Quién es Director o Coordinador de cada programa y campus", to: "/admin/programas-en-cifras?seccion=equipo", when: (ctx) => ctx.hasRole("admin") },
        ],
      },
    ],
  },
  "datos-sostenibilidad": {
    text: "Libros de datos de las oficinas, conectados a los indicadores de sostenibilidad de UDES Sostenible",
    color: "var(--wall-programas-en-cifras)",
    rank: 5.65,
    sections: () => [
      {
        title: "Mi oficina",
        cards: [
          { key: "ds-libros", title: "Datos de Sostenibilidad", text: "Libros de datos con columnas tipadas, conectados a los indicadores de sostenibilidad", to: "/admin/datos-sostenibilidad" },
        ],
      },
    ],
  },
  monitor: {
    text: "Cómo van las notas por facultad, programa, grupo y estudiante, con alertas tempranas",
    color: "var(--wall-monitor)",
    rank: 5.6,
    sections: () => [
      {
        title: "Notas",
        cards: [{ key: "mon", title: "Monitor de alertas tempranas", text: "Semáforo NE · ED · RS de cada nivel, con análisis de Pilo", to: "/admin/monitor-alertas" }],
      },
    ],
  },
  warehouse: {
    text: "Los reportes de Master, Galileo y Davinci guardados por periodo, con alertas tempranas",
    color: "var(--wall-warehouse)",
    rank: 5.7,
    sections: () => {
      const base = "/admin/warehouse";
      return [
        {
          title: "Consulta",
          cards: [
            { key: "wh-tablero", title: "Tablero", text: "Qué hay guardado por periodo, sede y corte", to: base },
            { key: "wh-explorar", title: "Explorar", text: "Gráficos y tablas de lo guardado", to: `${base}/explorar` },
            { key: "wh-alertas", title: "Alertas tempranas", text: "Grupos y estudiantes con señales de riesgo académico", to: `${base}/alertas` },
          ],
        },
        {
          title: "Carga",
          cards: [
            { key: "wh-cargas", title: "Cargas", text: "Cargar un reporte, traerlo de Master o ver el historial", to: `${base}/cargas` },
            { key: "wh-catalogo", title: "Catálogo", text: "Los conjuntos, sus peticiones y qué se guarda de cada uno", to: `${base}/catalogo` },
            { key: "wh-almacen", title: "Almacén", text: "Capas, periodos cerrados y política de privacidad", to: `${base}/almacen` },
          ],
        },
      ];
    },
  },
  internacionalizacion: {
    text: "Movilidad, convenios y visitantes por campus, para SNIES, CNA y rankings",
    color: "var(--wall-internacionalizacion)",
    rank: 6,
    sections: (ctx) => {
      // Director = administración o int_miembros.rol 'director'; el menú solo sabe lo primero.
      const director = ctx.hasRole("admin") || Boolean(ctx.intDirector);
      const base = "/admin/internacionalizacion";
      return [
        {
          title: "El periodo",
          cards: [
            { key: "int-resumen", title: "Resumen", text: "Qué falta para cerrar el periodo, campus por campus", to: base },
            { key: "int-tablas", title: "Tablas", text: "Las hojas de captura, el envío y la validación", to: `${base}/tablas` },
            { key: "int-cifras", title: "Cifras", text: "Movilidad, países, convenios y personas de lo aprobado", to: `${base}/cifras` },
          ],
        },
        {
          title: "Configuración",
          cards: [
            { key: "int-plantillas", title: "Plantillas", text: "Qué responde el repositorio de SNIES, CNA y rankings", to: `${base}/plantillas` },
            { key: "int-periodos", title: "Periodos", text: "Cuándo captura cada campus y qué se reabrió", to: `${base}/periodos` },
            { key: "int-accesos", title: "Accesos", text: "Director, coordinadores de campus y gestores", to: `${base}/accesos`, when: () => director },
          ],
        },
      ];
    },
  },
  observatorio: {
    text: "El taller de análisis y sus boletines",
    color: "var(--wall-observatorio)",
    rank: 7,
    sections: () => [
      { title: "El taller", cards: OBS_STATIONS.map((s) => ({ key: s.id, title: s.label, text: s.hint, to: `/admin/observatorio/${s.id}` })) },
    ],
  },
  tableros: {
    text: "Los tableros de datos de sus unidades",
    color: "var(--wall-tableros)",
    rank: 8,
    sections: () => [{ title: "Mis Tableros", cards: [nav("tableros", "Los tableros de datos de sus unidades")] }],
  },
  planeacion: {
    text: "La portada pública y los documentos de la oficina",
    color: "var(--wall-planeacion)",
    rank: 9,
    sections: () => [
      {
        title: "Portal público",
        cards: [nav("office", "Portada, galería, equipo y publicación"), nav("documents", "Las colecciones y los documentos de la oficina")],
      },
    ],
  },
  sistema: {
    text: "Estructura, usuarios, parámetros, correos y traslado de datos",
    color: "var(--wall-sistema)",
    rank: 10,
    sections: () => [
      {
        title: "Personas y estructura",
        cards: [
          nav("users", "Quién ve y edita qué"),
          nav("institution", "Vicerrectorías, facultades y programas"),
          nav("structure", "Mantenimiento del esquema, cuando algo hay que arreglar"),
        ],
      },
      {
        title: "Ajustes",
        cards: [
          nav("parameters", "Los ajustes globales de los portales"),
          nav("correos", "Plantillas, conexión y bitácora de los correos"),
          nav("rutas", "Calles, flujo de estudiantes y paradas del bus UDES"),
          nav("cms", "Las páginas de la landing, de Planeación y de UDES Sostenible, con sus micrositios"),
          nav("development", "Los proyectos web de la oficina"),
        ],
      },
      { title: "Mr. Pilo", cards: [nav("pilo", "La conexión, las funciones y a quién se abre"), nav("pilo_ensenanza", "Su página, su memoria, su catálogo y su bitácora")] },
      { title: "Datos", cards: [nav("transfer", "Copia otro servidor de Supabase en este")] },
    ],
  },
};

/** Las secciones del portal de un módulo con lo que esta persona puede abrir; sin secciones vacías. */
export function portalFor(id: ModuleId, ctx: PortalContext): PortalSection[] {
  // Un grupo del menú sin portal propio (todavía) no rompe el panel: el lanzador usa sus pantallas.
  return (MODULES[id]?.sections(ctx) ?? [])
    .map((s) => ({
      ...s,
      cards: s.cards.filter(
        (c) => (!c.minimum || ctx.hasRole(c.minimum)) && (!c.screen || ctx.canSee(c.screen)) && (!c.when || c.when(ctx)),
      ),
    }))
    .filter((s) => s.cards.length > 0);
}

/** Cuántas pantallas tiene un portal. */
export const cardCount = (sections: PortalSection[]) => sections.reduce((n, s) => n + s.cards.length, 0);
