/* Página de prueba temporal: tabla personalizada con datos simulados. No escribe en la base. Borrar al terminar. */
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FreeSetBlock } from "../src/modules/datos-abiertos/components/FreeSetBlock";
import { CustomTableCapture } from "../src/modules/admin/udes-en-cifras/stations/CustomTableCapture";
import type { FreeSet } from "../src/modules/datos-abiertos/data/free-sets";
import "../src/styles/tokens.css";
import "../src/styles/base.css";
import "../src/styles/app.css";
import "../src/modules/datos-abiertos/datos-abiertos.css";
import "../src/modules/admin/admin.css";
import "../src/modules/admin/udes-en-cifras/od-admin.css";

const params = new URLSearchParams(location.search);
if (params.get("tema")) document.documentElement.dataset.theme = params.get("tema")!;

const columns = [
  { key: "programa", label: "Programa", kind: "texto" as const },
  { key: "compromiso", label: "Compromiso de mejora", kind: "texto" as const },
  { key: "avance", label: "Avance", kind: "cifra" as const, format: "porcentaje" as const, decimals: 1, unit: "%" },
  { key: "matricula", label: "Matriculados", kind: "cifra" as const, format: "entero" as const, decimals: 0, unit: "estudiantes" },
  { key: "estado", label: "Estado", kind: "texto" as const, options: ["Cumple", "En proceso", "No cumple"] },
  { key: "responsable", label: "Responsable", kind: "texto" as const },
];
const view = {
  key: "tabla", title: "Compromisos de acreditación por programa", type: "tabla" as const,
  table: {
    cut: "2025-2 · a 30 de junio de 2026", rowHeader: true,
    note: "Avance reportado por cada dirección de programa frente al plan de mejoramiento. Los programas sin visita de pares no reportan avance.",
    source: "Dirección de Aseguramiento de la Calidad",
    rules: {
      avance: [
        { op: "menor" as const, value: 60, tone: "riesgo" as const },
        { op: "entre" as const, min: 60, max: 80, tone: "atencion" as const },
        { op: "mayor_igual" as const, value: 80, tone: "bien" as const },
      ],
      matricula: [
        { op: "menor" as const, value: 300, tone: "seq-1" as const },
        { op: "entre" as const, min: 300, max: 1000, tone: "seq-2" as const },
        { op: "mayor_igual" as const, value: 1000, tone: "seq-3" as const },
      ],
      estado: [
        { op: "es" as const, option: "Cumple", tone: "bien" as const },
        { op: "es" as const, option: "En proceso", tone: "atencion" as const },
        { op: "es" as const, option: "No cumple", tone: "riesgo" as const },
      ],
    },
  },
};
const r = (cells: Record<string, string | number | null>, kind: "dato" | "grupo" | "total" = "dato", label = "") => ({ year: null, kind, label, cells });
const rows = [
  r({}, "grupo", "Ciencias de la Salud"),
  r({ programa: "Medicina", compromiso: "Renovar la acreditación de alta calidad y ampliar los escenarios de práctica clínica en la red pública", avance: 92.5, matricula: 1840, estado: "Cumple", responsable: "Decanatura de Salud" }),
  r({ programa: "Enfermería", compromiso: "Actualizar el plan de estudios", avance: 71, matricula: 620, estado: "En proceso", responsable: "Dirección de programa" }),
  r({ programa: "Fisioterapia", compromiso: "Fortalecer la planta docente con doctorado", avance: null, matricula: 280, estado: null, responsable: null, "__tono:compromiso": "neutro" }),
  r({}, "grupo", "Ingenierías"),
  r({ programa: "Ingeniería de Software", compromiso: "Poner en marcha el laboratorio de datos", avance: 45.2, matricula: 410, estado: "No cumple", responsable: "Decanatura de Ingenierías" }),
  r({ programa: "Ingeniería Industrial", compromiso: "Convenios de doble titulación", avance: 80, matricula: 955, estado: "Cumple", responsable: "Relaciones Internacionales", __tono: "neutro" }),
  r({ programa: "Total UDES", compromiso: "5 compromisos vigentes", avance: 72.2, matricula: 4105, estado: null, responsable: null }, "total", "Total UDES"),
];
const set: FreeSet = {
  id: "compromisos", uuid: "set-1", title: view.title, description: "Seguimiento a los planes de mejoramiento por programa.", source: "Oficina de Planeación Institucional",
  temporality: "sin_tiempo", periodLabel: "", columns, views: [view], rows,
};

const admin = {
  rows: {
    offices: [{ id: "of-1", name: "Oficina de Planeación Institucional" }],
    freeSets: [{ id: "set-1", report_id: "rep-1", key: "compromisos", title: view.title, description: set.description, temporality: "sin_tiempo", period_label: "", columns, views: [view], office_id: "of-1", position: 1 }],
    freeSetRows: rows.map((row, position) => ({ id: `r-${position}`, set_id: "set-1", position, ...row })),
    blocks: [],
  },
};

function App() {
  if (params.get("vista") === "editor") {
    return (
      <QueryClientProvider client={new QueryClient()}>
        <main style={{ padding: 16 }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <CustomTableCapture data={admin as any} report={{ uuid: "rep-1", status: "publicado", name: "Enseñanza" } as any} periodId="p-1" canEdit progress={new Map()} />
        </main>
      </QueryClientProvider>
    );
  }
  return (
    <main className="od-portal" style={{ background: "var(--od-page)", minHeight: "100vh", paddingBlock: 24 }}>
      <FreeSetBlock set={set} anchor="tabla" withSource csv={undefined} />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
