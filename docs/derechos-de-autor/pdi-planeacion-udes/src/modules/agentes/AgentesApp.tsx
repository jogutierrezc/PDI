/* =============================================================================
   Portal de agentes · las rutas (/agentes/*).

   Un portal aparte: no usa AdminShell ni el menú de la intranet ni sus roles.
   Se carga bajo demanda (App.tsx) y trae su propia hoja de estilos.
   ========================================================================== */

import { Navigate, Route, Routes } from "react-router-dom";
import { Bandeja } from "./Bandeja";
import { Catalogos, AgentesAdmin } from "./Admin";
import { Cola, Informes } from "./Director";
import { Ingreso } from "./Ingreso";
import { Marco } from "./Marco";
import { AgentProvider, RequireAgent } from "./sesion";
import "./agentes.css";

export function AgentesApp() {
  return (
    <AgentProvider>
      <Routes>
        <Route path="ingreso" element={<Ingreso />} />
        <Route
          element={
            <RequireAgent>
              <Marco />
            </RequireAgent>
          }
        >
          <Route index element={<Bandeja />} />
          <Route path="director" element={<RequireAgent director><Cola /></RequireAgent>} />
          <Route path="director/agentes" element={<RequireAgent director><AgentesAdmin /></RequireAgent>} />
          <Route path="director/catalogos" element={<RequireAgent director><Catalogos /></RequireAgent>} />
          <Route path="director/informes" element={<RequireAgent director><Informes /></RequireAgent>} />
        </Route>
        <Route path="*" element={<Navigate to="/agentes" replace />} />
      </Routes>
    </AgentProvider>
  );
}
