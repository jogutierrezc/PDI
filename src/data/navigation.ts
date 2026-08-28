import type { InitiativeCardData, MetricCardData, NavigationItem } from "../types/pdi";

export const navigationItems: NavigationItem[] = [
  {
    id: "resumen",
    label: "Resumen ejecutivo",
    description: "Vista general del estado del PDI y prioridades principales.",
  },
  {
    id: "objetivos",
    label: "Objetivos estrategicos",
    description: "Mapa de ejes, metas y resultados esperados.",
  },
  {
    id: "iniciativas",
    label: "Iniciativas clave",
    description: "Proyectos, responsables y avances por frente de trabajo.",
  },
  {
    id: "seguimiento",
    label: "Seguimiento",
    description: "Indicadores, hitos y proxima revision de avance.",
  },
];

export const overviewMetrics: MetricCardData[] = [
  {
    label: "Ejes activos",
    value: "4",
    detail: "Cobertura completa de las lineas estrategicas definidas.",
    trend: "+1 frente priorizado",
  },
  {
    label: "Iniciativas en marcha",
    value: "12",
    detail: "Portafolio consolidado para el primer ciclo de ejecucion.",
    trend: "3 listas para seguimiento",
  },
  {
    label: "Indicadores priorizados",
    value: "28",
    detail: "Conjunto inicial de KPI para monitoreo mensual.",
    trend: "Base de linea por definir",
  },
];

export const initiatives: InitiativeCardData[] = [
  {
    title: "Diseño de tablero estrategico",
    status: "En ejecucion",
    owner: "Direccion de planeacion",
    description: "Consolidar la primera version del tablero con los indicadores criticos del PDI.",
  },
  {
    title: "Modelo de seguimiento academico",
    status: "Planeada",
    owner: "Vicerrectoria academica",
    description: "Definir el flujo de captura, validacion y publicacion de avances por periodo.",
  },
  {
    title: "Ruta de socializacion institucional",
    status: "En diseno",
    owner: "Comunicaciones",
    description: "Estructurar la narrativa del portal para audiencias internas y directivas.",
  },
];

