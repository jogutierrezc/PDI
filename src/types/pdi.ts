export type SectionId = "resumen" | "objetivos" | "iniciativas" | "seguimiento";

export interface NavigationItem {
  id: SectionId;
  label: string;
  description: string;
}

export interface MetricCardData {
  label: string;
  value: string;
  detail: string;
  trend: string;
}

export interface InitiativeCardData {
  title: string;
  status: "En diseno" | "En ejecucion" | "Planeada";
  owner: string;
  description: string;
}

