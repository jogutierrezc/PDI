/* =============================================================================
   Enrutado del portal.
   Las pantallas internas se cargan bajo demanda: quien solo consulta el tablero
   público nunca descarga el módulo de administración.

   La guarda de rutas decide qué *interfaz* se muestra. La autorización de
   verdad está en las políticas RLS de la base de datos; aquí solo se evita que
   alguien llegue a una pantalla llena de botones que no puede usar.
   ========================================================================== */

import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ScrollManager } from "./components/layout/ScrollManager";
import { useAuth } from "./lib/auth";
import type { AppRole } from "./types/database";
import type { ReactElement } from "react";

import { Home } from "./routes/Home";

const Dashboard = lazy(() => import("./routes/Dashboard").then((m) => ({ default: m.Dashboard })));
const NotFound = lazy(() => import("./routes/NotFound").then((m) => ({ default: m.NotFound })));
const Forbidden = lazy(() => import("./routes/NotFound").then((m) => ({ default: m.Forbidden })));
const ImplementationPortal = lazy(() =>
  import("./modules/implementation/ImplementationPortal").then((m) => ({ default: m.ImplementationPortal })),
);
const PillarViewer = lazy(() =>
  import("./modules/pillar-viewer/PillarViewer").then((m) => ({ default: m.PillarViewer })),
);
const PillarScorecard = lazy(() =>
  import("./routes/PillarScorecard").then((m) => ({ default: m.PillarScorecard })),
);
const SdgPortal = lazy(() =>
  import("./modules/ods/SdgPortal").then((m) => ({ default: m.SdgPortal })),
);
const CampusPortal = lazy(() =>
  import("./modules/campus/CampusPortal").then((m) => ({ default: m.CampusPortal })),
);
const FacultyPortal = lazy(() =>
  import("./modules/facultades/FacultyPortal").then((m) => ({ default: m.FacultyPortal })),
);
const FacultyDetail = lazy(() =>
  import("./modules/facultades/FacultyDetail").then((m) => ({ default: m.FacultyDetail })),
);
const TechDevelopment = lazy(() =>
  import("./routes/TechDevelopment").then((m) => ({ default: m.TechDevelopment })),
);
const WebProjects = lazy(() =>
  import("./modules/admin/desarrollo/WebProjects").then((m) => ({ default: m.WebProjects })),
);
const BudgetAdmin = lazy(() =>
  import("./modules/admin/presupuesto/BudgetAdmin").then((m) => ({ default: m.BudgetAdmin })),
);
const ProjectsAdmin = lazy(() =>
  import("./modules/admin/proyectos/ProjectsAdmin").then((m) => ({ default: m.ProjectsAdmin })),
);
const FacultyAdmin = lazy(() =>
  import("./modules/admin/facultades/FacultyAdmin").then((m) => ({ default: m.FacultyAdmin })),
);
const CampusImport = lazy(() =>
  import("./modules/admin/campus/CampusImport").then((m) => ({ default: m.CampusImport })),
);
const StructureNormalize = lazy(() =>
  import("./modules/admin/estructura/StructureNormalize").then((m) => ({
    default: m.StructureNormalize,
  })),
);
const LoginPortal = lazy(() => import("./modules/login/LoginPortal").then((m) => ({ default: m.LoginPortal })));
const PillarManagement = lazy(() =>
  import("./modules/admin/gestion-pilares/PillarManagement").then((m) => ({ default: m.PillarManagement })),
);
const PillarConfigurator = lazy(() =>
  import("./modules/admin/gestion-pilares/PillarConfigurator").then((m) => ({ default: m.PillarConfigurator })),
);
const GlobalParameters = lazy(() =>
  import("./modules/admin/parametros/GlobalParameters").then((m) => ({ default: m.GlobalParameters })),
);
const UserManagement = lazy(() =>
  import("./modules/admin/usuarios/UserManagement").then((m) => ({ default: m.UserManagement })),
);

/** Puerta de las rutas internas. Recuerda a dónde iba la persona. */
function RequireRole({ minimum, children }: { minimum: AppRole; children: ReactElement }) {
  const { loading, profile, hasRole } = useAuth();
  const location = useLocation();

  // Sin esto, recargar una ruta de intranet rebotaría al login durante el
  // instante en que aún se está resolviendo la sesión guardada.
  if (loading) return <RouteFallback />;

  if (!profile) {
    return <Navigate to="/acceso-intranet" replace state={{ from: location.pathname }} />;
  }

  if (!hasRole(minimum)) {
    return <Navigate to="/sin-permiso" replace state={{ from: location.pathname }} />;
  }

  return children;
}

/** Marca de carga discreta. */
export function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="route-fallback__spinner" aria-hidden="true" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollManager />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tablero" element={<Dashboard />} />
          <Route path="/tablero/pilar/:slug" element={<PillarScorecard />} />
          <Route path="/implementacion" element={<ImplementationPortal />} />
          <Route path="/implementacion/pilar/:slug" element={<PillarViewer />} />
          <Route path="/ods" element={<SdgPortal />} />
          <Route path="/campus" element={<CampusPortal />} />
          <Route path="/facultades" element={<FacultyPortal />} />
          <Route path="/facultades/:slug" element={<FacultyDetail />} />
          <Route path="/desarrollo-tecnologico" element={<TechDevelopment />} />
          <Route path="/acceso-intranet" element={<LoginPortal />} />

          <Route
            path="/admin/pilares"
            element={
              <RequireRole minimum="consulta">
                <PillarManagement />
              </RequireRole>
            }
          />
          <Route
            path="/admin/pilares/:slug/configurar"
            element={
              <RequireRole minimum="consulta">
                <PillarConfigurator />
              </RequireRole>
            }
          />
          <Route
            path="/admin/estructura"
            element={
              <RequireRole minimum="consulta">
                <StructureNormalize />
              </RequireRole>
            }
          />
          <Route
            path="/admin/parametros"
            element={
              <RequireRole minimum="consulta">
                <GlobalParameters />
              </RequireRole>
            }
          />
          <Route
            path="/admin/proyectos"
            element={
              <RequireRole minimum="consulta">
                <ProjectsAdmin />
              </RequireRole>
            }
          />
          <Route
            path="/admin/campus"
            element={
              <RequireRole minimum="consulta">
                <CampusImport />
              </RequireRole>
            }
          />
          <Route
            path="/admin/facultades"
            element={
              <RequireRole minimum="consulta">
                <FacultyAdmin />
              </RequireRole>
            }
          />
          <Route
            path="/admin/presupuesto"
            element={
              <RequireRole minimum="consulta">
                <BudgetAdmin />
              </RequireRole>
            }
          />
          <Route
            path="/admin/desarrollo"
            element={
              <RequireRole minimum="consulta">
                <WebProjects />
              </RequireRole>
            }
          />
          <Route
            path="/admin/usuarios"
            element={
              <RequireRole minimum="admin">
                <UserManagement />
              </RequireRole>
            }
          />

          <Route path="/sin-permiso" element={<Forbidden />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
