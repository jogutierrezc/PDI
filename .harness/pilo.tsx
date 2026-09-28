/* Página de prueba temporal: Mr. Pilo Bot conversacional con datos simulados. */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../src/lib/theme";
import { AuthProvider } from "../src/lib/auth";
import { PiloChat } from "../src/modules/impacto/pilo/chat/PiloChat";
import { PiloLauncher } from "../src/modules/impacto/pilo/PiloLauncher";
import "../src/styles/tokens.css";
import "../src/styles/base.css";
import "../src/styles/app.css";
import "../src/modules/impacto/pilo/pilo.css";

const F = ["ensenanza", "investigacion", "extension"] as const;
const S = ["insumos", "procesos", "productos", "impacto"] as const;
const names: Record<string, string[]> = {
  ensenanza: ["Convenios con empleadores del sector salud", "Seguimiento a graduados en su primer año", "Graduados vinculados en su área", "Tasa de empleabilidad a un año", "Estudiantes con acompañamiento académico", "Alertas tempranas atendidas", "Estudiantes que aprueban el primer año", "Tasa de graduación oportuna"],
  investigacion: ["Semilleros activos del programa", "Estudiantes en semilleros", "Productos de semilleros", "Jóvenes investigadores formados", "Proyectos formulados", "Proyectos en ejecución", "Artículos en revistas indexadas", "Citas de la producción del programa"],
  extension: ["Brigadas de salud programadas", "Jornadas de promoción y prevención", "Personas formadas en autocuidado", "Comunidades que lideran su cuidado", "Oferta de educación continua", "Egresados en educación continua", "Convenios con hospitales y aliados", "Continuidad de las alianzas"],
};
const indicators = F.flatMap((fn, fi) =>
  names[fn].map((name, k) => ({
    id: `${fn}-${k}`, code: `${["ENS", "INV", "EXT"][fi]}-${String(k + 1).padStart(2, "0")}`, fn, stage: S[k % 4], suggested: true, dimensionId: null, ownerUnitId: "u", name,
    description: `${name}: ficha de ejemplo para la prueba.`, unitLabel: "", measure: "porcentaje", numerator: "", denominator: "", direction: "subir", source: "", responsible: "",
    projectsText: "", cesu: [], sheet: {}, programReports: true, status: "publicado", position: k, updatedAt: "", programId: null, campusId: null, parentId: null, mandatory: false, legacyId: null,
  })),
);
const catalog = {
  indicators, programIndicators: [], refs: [],
  alignments: [
    { id: "1", indicatorId: "ensenanza-3", target: "pilar", pillarId: "p1", sdg: null, origin: "manual", confirmed: true, score: null, matchedTerms: [] },
    { id: "2", indicatorId: "ensenanza-3", target: "ods", pillarId: null, sdg: 8, origin: "manual", confirmed: true, score: null, matchedTerms: [] },
    { id: "3", indicatorId: "investigacion-0", target: "pilar", pillarId: "p3", sdg: null, origin: "manual", confirmed: true, score: null, matchedTerms: [] },
    { id: "4", indicatorId: "extension-1", target: "ods", pillarId: null, sdg: 3, origin: "manual", confirmed: true, score: null, matchedTerms: [] },
  ],
};
const base = {
  units: [], campuses: [], offer: [], unitFunctions: [], memberships: [], dimensions: [], missing: false,
  pillars: [{ id: "p1", position: 1, numeral: "I", name: "Personalización" }, { id: "p3", position: 3, numeral: "III", name: "Entorno emprendedor" }],
};
const site = { programId: "prog", campusId: "camp", programName: "Enfermería", campusName: "Bucaramanga", key: "enfermeria:bucaramanga" };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <PiloLauncher sub="prueba" peekTitle="t" peekText="p">{({ origin, onClose }) => <PiloChat site={site} base={base as never} catalog={catalog as never} canEdit origin={origin} onClose={() => { (window as any).__closed = "cerrando"; onClose(); }} onClassic={() => {}} />}</PiloLauncher>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </QueryClientProvider>
  </React.StrictMode>,
);
