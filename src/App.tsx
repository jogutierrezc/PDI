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
import { TourProvider } from "./components/tour/TourProvider";
import { TourFab } from "./components/tour/TourFab";
import { PiloAi } from "./components/pilo/ai/PiloAi";
import { AlertaEmergencia } from "./components/alertas/AlertaEmergencia";
import { useAuth } from "./lib/auth";
import type { AdminScreen, AppRole } from "./types/database";
import type { ReactElement } from "react";

import { Home } from "./routes/Home";
const Launcher = lazy(() => import("./modules/admin/launcher/Launcher").then((m) => ({ default: m.Launcher })));
const PlaneacionHome = lazy(() => import("./modules/planeacion/PlaneacionHome").then((m) => ({ default: m.PlaneacionHome })));
const TeamPage = lazy(() => import("./modules/planeacion/TeamPage").then((m) => ({ default: m.TeamPage })));
const AskPilo = lazy(() => import("./modules/pregunta/AskPilo").then((m) => ({ default: m.AskPilo })));
const PiloEmbed = lazy(() => import("./modules/pilo-embed/PiloEmbed").then((m) => ({ default: m.PiloEmbed })));
const PiloApp = lazy(() => import("./modules/pilo-app/PiloApp").then((m) => ({ default: m.PiloApp })));
const PiloPolicy = lazy(() => import("./modules/pilo-app/terms/PolicyPage").then((m) => ({ default: m.PolicyPage })));

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
const SostenibleHome = lazy(() => import("./modules/sostenible/SostenibleHome").then((m) => ({ default: m.SostenibleHome })));
const SostenibleRanking = lazy(() => import("./modules/sostenible/SostenibleRanking").then((m) => ({ default: m.SostenibleRanking })));
const RankingsAdmin = lazy(() => import("./modules/rankings/RankingsAdmin").then((m) => ({ default: m.RankingsAdmin })));
const ReporteOficina = lazy(() => import("./modules/rankings/reporte/ui/ReporteOficina").then((m) => ({ default: m.ReporteOficina })));
const OdsPortal = lazy(() => import("./modules/sostenible/OdsPortal").then((m) => ({ default: m.OdsPortal })));
const OdsReport = lazy(() => import("./modules/sostenible/OdsReport").then((m) => ({ default: m.OdsReport })));
const OdsRector = lazy(() => import("./modules/sostenible/OdsRector").then((m) => ({ default: m.OdsRector })));
const OdsBulletin = lazy(() => import("./modules/sostenible/OdsBulletin").then((m) => ({ default: m.OdsBulletin })));
const OdsEvidence = lazy(() => import("./modules/sostenible/OdsEvidence").then((m) => ({ default: m.OdsEvidence })));
const SostenibleCategory =lazy(() => import("./modules/sostenible/SostenibleRanking").then((m) => ({ default: m.SostenibleCategory })));
const OpenDataPortal = lazy(() =>
  import("./modules/datos-abiertos/OpenDataPortal").then((m) => ({ default: m.OpenDataPortal })),
);
const OpenDataReport = lazy(() =>
  import("./modules/datos-abiertos/OpenDataReport").then((m) => ({ default: m.OpenDataReport })),
);
const IntranetBulletinPage = lazy(() =>
  import("./modules/boletin/BulletinViewer").then((m) => ({ default: m.IntranetBulletinPage })),
);
const ImpactoAdmin = lazy(() =>
  import("./modules/impacto/ImpactoAdmin").then((m) => ({ default: m.ImpactoAdmin })),
);
const ImpactReportPrint = lazy(() =>
  import("./modules/impacto/informe/ReportPrintPage").then((m) => ({ default: m.ReportPrintPage })),
);
const BoardsAdmin = lazy(() =>
  import("./modules/tableros/BoardsAdmin").then((m) => ({ default: m.BoardsAdmin })),
);
const BoardWorkshop = lazy(() =>
  import("./modules/tableros/BoardWorkshop").then((m) => ({ default: m.BoardWorkshop })),
);
const BoardPage = lazy(() =>
  import("./modules/tableros/BoardPage").then((m) => ({ default: m.BoardPage })),
);
const ObservatoryHub = lazy(() =>
  import("./modules/datos-abiertos/observatorio/Observatory").then((m) => ({ default: m.ObservatoryHub })),
);
const ObservatoryTopic = lazy(() =>
  import("./modules/datos-abiertos/observatorio/Observatory").then((m) => ({ default: m.ObservatoryTopic })),
);
const PublicBulletinPage = lazy(() =>
  import("./modules/boletin/BulletinViewer").then((m) => ({ default: m.PublicBulletinPage })),
);
const PublicBulletinList = lazy(() =>
  import("./modules/boletin/BulletinViewer").then((m) => ({ default: m.PublicBulletinList })),
);
const OdAdmin = lazy(() =>
  import("./modules/admin/udes-en-cifras/OdAdmin").then((m) => ({ default: m.OdAdmin })),
);
const ObsAdmin = lazy(() =>
  import("./modules/admin/observatorio/ObsAdmin").then((m) => ({ default: m.ObsAdmin })),
);
const ObsBulletinPage = lazy(() =>
  import("./modules/admin/observatorio/ObsBulletinPage").then((m) => ({ default: m.ObsBulletinPage })),
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
const DocumentPortal = lazy(() =>
  import("./modules/documentos/DocumentPortal").then((m) => ({ default: m.DocumentPortal })),
);
const CollectionPage = lazy(() =>
  import("./modules/documentos/CollectionPage").then((m) => ({ default: m.CollectionPage })),
);
const DocumentsAdmin = lazy(() =>
  import("./modules/admin/documentos/DocumentsAdmin").then((m) => ({ default: m.DocumentsAdmin })),
);
const OfficePageAdmin = lazy(() =>
  import("./modules/admin/pagina/OfficePageAdmin").then((m) => ({ default: m.OfficePageAdmin })),
);
const UserManagement = lazy(() =>
  import("./modules/admin/usuarios/UserManagement").then((m) => ({ default: m.UserManagement })),
);
const PiloAiSettings = lazy(() =>
  import("./modules/admin/pilo/PiloAiSettings").then((m) => ({ default: m.PiloAiSettings })),
);
const PiloEnsenanzaSettings = lazy(() =>
  import("./modules/admin/pilo-ensenanza/PiloEnsenanza").then((m) => ({ default: m.PiloEnsenanzaSettings })),
);
const PiloPresentation = lazy(() =>
  import("./modules/admin/pilo/presentacion/Presentation").then((m) => ({ default: m.Presentation })),
);
const OfferPage = lazy(() => import("./modules/oferta/OfferPage").then((m) => ({ default: m.OfferPage })));
const ImpactPortalHome = lazy(() =>
  import("./modules/impacto/portal/PortalHome").then((m) => ({ default: m.PortalHome })),
);
const ImpactPortalFunction = lazy(() =>
  import("./modules/impacto/portal/PortalFunction").then((m) => ({ default: m.PortalFunction })),
);
const ImpactPortalFaculties = lazy(() =>
  import("./modules/impacto/portal/PortalFaculty").then((m) => ({ default: m.PortalFaculties })),
);
const ImpactPortalFaculty = lazy(() =>
  import("./modules/impacto/portal/PortalFaculty").then((m) => ({ default: m.PortalFaculty })),
);
const ImpactPortalPrograms = lazy(() =>
  import("./modules/impacto/portal/PortalPrograms").then((m) => ({ default: m.PortalPrograms })),
);
const ImpactVicerrectoriaBulletin = lazy(() =>
  import("./modules/impacto/boletin/ImpactBulletin").then((m) => ({ default: m.VicerrectoriaBulletinPage })),
);
const ImpactProgramBulletin = lazy(() =>
  import("./modules/impacto/boletin/ImpactBulletin").then((m) => ({ default: m.ProgramBulletinPage })),
);
const ImpactPortalProgram = lazy(() =>
  import("./modules/impacto/portal/PortalProgram").then((m) => ({ default: m.PortalProgram })),
);
const InstitutionView = lazy(() =>
  import("./modules/admin/institucion/InstitutionView").then((m) => ({ default: m.InstitutionView })),
);
const DataTransfer = lazy(() =>
  import("./modules/admin/traslado/DataTransfer").then((m) => ({ default: m.DataTransfer })),
);
const Correos = lazy(() =>
  import("./modules/admin/correos/Correos").then((m) => ({ default: m.Correos })),
);
const Rutas = lazy(() => import("./modules/rutas/Rutas").then((m) => ({ default: m.Rutas })));
const RutasPublico = lazy(() => import("./modules/rutas/RutasPublico").then((m) => ({ default: m.RutasPublico })));
const Internacionalizacion = lazy(() =>
  import("./modules/internacionalizacion/ui/Internacionalizacion").then((m) => ({ default: m.Internacionalizacion })),
);
const InformesAdmin = lazy(() => import("./modules/informes/InformesAdmin").then((m) => ({ default: m.InformesAdmin })));
const Warehouse = lazy(() => import("./modules/warehouse/Warehouse").then((m) => ({ default: m.Warehouse })));
const ReportesInstitucionales = lazy(() =>
  import("./modules/reportes/ReportesInstitucionales").then((m) => ({ default: m.ReportesInstitucionales })),
);

/** Puerta de las rutas internas. Recuerda a dónde iba la persona.
 *  `screen` es la pantalla del menú: un rol de acceso que no la tiene tampoco
 *  entra escribiendo la dirección a mano. */
function RequireRole({
  minimum,
  screen,
  children,
}: {
  minimum: AppRole;
  screen?: AdminScreen;
  children: ReactElement;
}) {
  const { loading, profile, hasRole, canSee } = useAuth();
  const location = useLocation();

  // Sin esto, recargar una ruta de intranet rebotaría al login durante el
  // instante en que aún se está resolviendo la sesión guardada.
  if (loading) return <RouteFallback />;

  if (!profile) {
    return <Navigate to="/acceso-intranet" replace state={{ from: location.pathname }} />;
  }

  if (!hasRole(minimum) || (screen && !canSee(screen))) {
    return <Navigate to="/sin-permiso" replace state={{ from: location.pathname }} />;
  }

  return children;
}

/**
 * /admin a secas: la primera pantalla que esta persona puede abrir. Antes no
 * existía y el botón «Intranet» terminaba en «No encontrada».
 */
/** /admin: el lanzador, lo primero al entrar a la intranet. */
function AdminHome() {
  const { loading, profile } = useAuth();
  const location = useLocation();
  if (loading) return <RouteFallback />;
  if (!profile) return <Navigate to="/acceso-intranet" replace state={{ from: location.pathname }} />;
  return <Launcher />;
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
    <TourProvider>
      <ScrollManager />
      {/* La capa de emergencias (0138): dormida hasta que Aluna declare una, y entonces cubre cualquier página. */}
      <AlertaEmergencia />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* La portada es el portal de Planeación; el PDI vive en /pdi. */}
          <Route path="/" element={<PlaneacionHome />} />
          <Route path="/pdi" element={<Home />} />
          <Route path="/equipo" element={<TeamPage />} />
          <Route path="/pregunta" element={<AskPilo />} />
          {/* La ruta del bus UDES para el público (migración 0140): sin iniciar sesión, solo ruta, paradas y horario. */}
          <Route path="/rutas" element={<RutasPublico />} />
          {/* El chat emergente de Pilo, para verse dentro de un marco en otros portales (public/pilo.js). */}
          <Route path="/pilo-embed" element={<PiloEmbed />} />
          {/* Mr. Pilo en Enseñanza (0113): la misma página y el mismo chat emergente, en su propio espacio. */}
          <Route path="/pilo-ensenanza" element={<AskPilo key="ensenanza" space="ensenanza" />} />
          <Route path="/pilo-ensenanza-embed" element={<PiloEmbed key="ensenanza" space="ensenanza" />} />
          {/* La app móvil de Mr. Pilo (PWA): /app, /app/universidad y /app/ensenanza. Una sola ruta, para que
              cambiar de Pilo no desmonte la app ni corte el vuelo de la bienvenida. */}
          <Route path="/app/*" element={<PiloApp />} />
          {/* La política de uso de Mr. Pilo: un documento público, enlazable por sección (#p1…#p6). */}
          <Route path="/pilo-politica" element={<PiloPolicy />} />
          <Route path="/tablero" element={<Dashboard />} />
          <Route path="/tablero/pilar/:slug" element={<PillarScorecard />} />
          <Route path="/implementacion" element={<ImplementationPortal />} />
          <Route path="/implementacion/pilar/:slug" element={<PillarViewer />} />
          <Route path="/ods" element={<SdgPortal />} />
          <Route path="/campus" element={<CampusPortal />} />
          <Route path="/facultades" element={<FacultyPortal />} />
          <Route path="/facultades/:slug" element={<FacultyDetail />} />
          <Route path="/desarrollo-tecnologico" element={<TechDevelopment />} />
          {/* El tablero de una unidad: misma dirección sea privado o público.
              Lo que cambia es a quién le responde la base, no la ruta. */}
          <Route path="/tableros/:unidad/:tablero" element={<BoardPage />} />
          <Route path="/sostenible" element={<SostenibleHome />} />
          <Route path="/sostenible/impact/informes" element={<OdsPortal />} />
          <Route path="/sostenible/impact/informes/ods/:n" element={<OdsReport />} />
          <Route path="/sostenible/impact/rector" element={<OdsRector />} />
          <Route path="/sostenible/impact/boletin" element={<OdsBulletin />} />
          {/* La página de evidencia que abre el evaluador de THE: sin marco, sin menú y sin enlaces. */}
          <Route path="/sostenible/impact/evidencia/:n/:indicador" element={<OdsEvidence />} />
          <Route path="/sostenible/:ranking" element={<SostenibleRanking />} />
          <Route path="/sostenible/:ranking/:categoria" element={<SostenibleCategory />} />
          <Route path="/datos-abiertos" element={<OpenDataPortal />} />
          <Route path="/datos-abiertos/observatorio" element={<ObservatoryHub />} />
          <Route path="/datos-abiertos/observatorio/:tema" element={<ObservatoryTopic />} />
          <Route path="/datos-abiertos/boletines" element={<PublicBulletinList />} />
          <Route path="/datos-abiertos/boletines/:slug" element={<PublicBulletinPage />} />
          <Route path="/datos-abiertos/:slug" element={<OpenDataReport />} />
          {/* El repositorio documental e histórico de la oficina. */}
          <Route path="/documentos" element={<DocumentPortal />} />
          <Route path="/documentos/:slug/:section?" element={<CollectionPage />} />
          <Route path="/acceso-intranet" element={<LoginPortal />} />

          {/* La portada de Planeación y la página del equipo, escritas desde la intranet. */}
          <Route
            path="/admin/pagina/:station?"
            element={
              <RequireRole minimum="consulta" screen="office">
                <OfficePageAdmin />
              </RequireRole>
            }
          />
          <Route
            path="/admin/documentos/:slug?"
            element={
              <RequireRole minimum="consulta" screen="documents">
                <DocumentsAdmin />
              </RequireRole>
            }
          />
          <Route
            path="/admin/pilares"
            element={
              <RequireRole minimum="consulta" screen="pillars">
                <PillarManagement />
              </RequireRole>
            }
          />
          <Route
            path="/admin/pilares/:slug/configurar"
            element={
              <RequireRole minimum="consulta" screen="pillars">
                <PillarConfigurator />
              </RequireRole>
            }
          />
          <Route
            path="/admin/estructura"
            element={
              <RequireRole minimum="consulta" screen="structure">
                <StructureNormalize />
              </RequireRole>
            }
          />
          <Route
            path="/admin/parametros"
            element={
              <RequireRole minimum="consulta" screen="parameters">
                <GlobalParameters />
              </RequireRole>
            }
          />
          <Route
            path="/admin/proyectos"
            element={
              <RequireRole minimum="consulta" screen="projects">
                <ProjectsAdmin />
              </RequireRole>
            }
          />
          <Route
            path="/admin/campus"
            element={
              <RequireRole minimum="consulta" screen="campus">
                <CampusImport />
              </RequireRole>
            }
          />
          <Route
            path="/admin/facultades"
            element={
              <RequireRole minimum="consulta" screen="faculties">
                <FacultyAdmin />
              </RequireRole>
            }
          />
          <Route
            path="/admin/presupuesto"
            element={
              <RequireRole minimum="consulta" screen="budget">
                <BudgetAdmin />
              </RequireRole>
            }
          />
          <Route
            path="/admin/desarrollo"
            element={
              <RequireRole minimum="consulta" screen="development">
                <WebProjects />
              </RequireRole>
            }
          />
          {/* UDES en Cifras: estación e informe en la ruta, periodo en ?periodo=. */}
          <Route
            path="/admin/impacto/:vista?"
            element={
              <RequireRole minimum="consulta" screen="impacto">
                <ImpactoAdmin />
              </RequireRole>
            }
          />
          {/* Informe de Impacto con Mr. Pilo: el documento solo, en páginas carta, para imprimirlo. */}
          <Route
            path="/admin/impacto-informe/:id"
            element={
              <RequireRole minimum="consulta" screen="impacto">
                <ImpactReportPrint />
              </RequireRole>
            }
          />
          <Route
            path="/admin/tableros/:unidad/tablero/:tablero/:estacion?"
            element={
              <RequireRole minimum="consulta" screen="tableros">
                <BoardWorkshop />
              </RequireRole>
            }
          />
          <Route
            path="/admin/tableros/:unidad?/:vista?"
            element={
              <RequireRole minimum="consulta" screen="tableros">
                <BoardsAdmin />
              </RequireRole>
            }
          />
          {/* Internacionalización: pertenecer al módulo (int_miembros) es el permiso, como en Mis Tableros. */}
          <Route
            path="/admin/internacionalizacion/:seccion?"
            element={
              <RequireRole minimum="consulta" screen="internacionalizacion">
                <Internacionalizacion />
              </RequireRole>
            }
          />
          {/* Informes Institucionales (informes de gestión, 0153): unidades y Planeación. */}
          <Route
            path="/admin/informes-gestion/:seccion?"
            element={
              <RequireRole minimum="consulta" screen="informes">
                <InformesAdmin />
              </RequireRole>
            }
          />
          {/* Reportes Institucionales (SNIES y CNA): una ruta con segmentos opcionales. */}
          <Route
            path="/admin/reportes-institucionales/:seccion?/:plantilla?"
            element={
              <RequireRole minimum="consulta" screen="reportes">
                <ReportesInstitucionales />
              </RequireRole>
            }
          />
          {/* Warehouse UDES: los reportes de Master, Galileo y Davinci por periodo. Solo Planeación. */}
          <Route
            path="/admin/warehouse/:seccion?"
            element={
              <RequireRole minimum="planeacion" screen="warehouse">
                <Warehouse />
              </RequireRole>
            }
          />
          {/* Una sola ruta con segmentos opcionales: cambiar de estación no desmonta el módulo. */}
          <Route
            path="/admin/udes-en-cifras/:station?/:report?"
            element={
              <RequireRole minimum="consulta" screen="cifras">
                <OdAdmin />
              </RequireRole>
            }
          />
          {/* Boletín: el documento solo, sin el marco de la intranet, para verlo e imprimirlo. */}
          <Route
            path="/admin/boletin/:id"
            element={
              <RequireRole minimum="consulta" screen="cifras">
                <IntranetBulletinPage />
              </RequireRole>
            }
          />
          {/* Observatorio de Analítica: el taller (estación y tema en la ruta) y su boletín en A4. */}
          <Route
            path="/admin/observatorio/:station?/:topic?"
            element={
              <RequireRole minimum="consulta" screen="observatorio">
                <ObsAdmin />
              </RequireRole>
            }
          />
          <Route
            path="/admin/observatorio-boletin/:id"
            element={
              <RequireRole minimum="consulta" screen="observatorio">
                <ObsBulletinPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/usuarios/:vista?"
            element={
              <RequireRole minimum="admin" screen="users">
                <UserManagement />
              </RequireRole>
            }
          />
          {/* Portal de Impacto: estructura, vínculos y resultados, para toda sesión activa. */}
          <Route
            path="/impacto"
            element={
              <RequireRole minimum="consulta">
                <ImpactPortalHome />
              </RequireRole>
            }
          />
          <Route
            path="/impacto/vicerrectoria/:fn"
            element={
              <RequireRole minimum="consulta">
                <ImpactPortalFunction />
              </RequireRole>
            }
          />
          <Route
            path="/impacto/facultades"
            element={
              <RequireRole minimum="consulta">
                <ImpactPortalFaculties />
              </RequireRole>
            }
          />
          <Route
            path="/impacto/facultad/:slug"
            element={
              <RequireRole minimum="consulta">
                <ImpactPortalFaculty />
              </RequireRole>
            }
          />
          <Route
            path="/impacto/programas"
            element={
              <RequireRole minimum="consulta">
                <ImpactPortalPrograms />
              </RequireRole>
            }
          />
          <Route
            path="/impacto/programa/:slug"
            element={
              <RequireRole minimum="consulta">
                <ImpactPortalProgram />
              </RequireRole>
            }
          />
          {/* Boletín de Seguimiento (PDF) de una vicerrectoría o de un programa. */}
          <Route
            path="/impacto/boletin/vicerrectoria/:fn"
            element={
              <RequireRole minimum="consulta">
                <ImpactVicerrectoriaBulletin />
              </RequireRole>
            }
          />
          <Route
            path="/impacto/boletin/programa/:slug"
            element={
              <RequireRole minimum="consulta">
                <ImpactProgramBulletin />
              </RequireRole>
            }
          />
          {/* Mr. Pilo con IA: la conexión, las funciones y a quién se abre. */}
          <Route
            path="/admin/mr-pilo"
            element={
              <RequireRole minimum="admin" screen="pilo">
                <PiloAiSettings />
              </RequireRole>
            }
          />
          {/* Mr. Pilo en Enseñanza: el segundo Pilo, con su página, su memoria, su catálogo y su bitácora. */}
          <Route
            path="/admin/mr-pilo-ensenanza"
            element={
              <RequireRole minimum="admin" screen="pilo_ensenanza">
                <PiloEnsenanzaSettings />
              </RequireRole>
            }
          />
          {/* La capa profunda de Pilo: la presentación, solo para la administración. */}
          <Route
            path="/admin/mr-pilo/presentacion"
            element={
              <RequireRole minimum="admin" screen="pilo">
                <PiloPresentation />
              </RequireRole>
            }
          />
          {/* Oferta de programas: se consulta con sesión. */}
          <Route
            path="/oferta"
            element={
              <RequireRole minimum="consulta">
                <OfferPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin/estructura-institucional/:unidad?"
            element={
              <RequireRole minimum="admin" screen="institution">
                <InstitutionView />
              </RequireRole>
            }
          />
          <Route
            path="/admin/traslado"
            element={
              <RequireRole minimum="admin" screen="transfer">
                <DataTransfer />
              </RequireRole>
            }
          />

          <Route
            path="/admin/correos"
            element={
              <RequireRole minimum="planeacion" screen="correos">
                <Correos />
              </RequireRole>
            }
          />

          <Route
            path="/admin/rutas"
            element={
              <RequireRole minimum="planeacion" screen="rutas">
                <Rutas />
              </RequireRole>
            }
          />

          <Route
            path="/admin/rankings/:seccion?"
            element={
              <RequireRole minimum="planeacion" screen="rankings">
                <RankingsAdmin />
              </RequireRole>
            }
          />
          {/* Reporte por oficinas de THE: cualquier persona activa; la base decide qué oficina ve (RLS). */}
          <Route
            path="/admin/reporte-rankings"
            element={
              <RequireRole minimum="consulta">
                <ReporteOficina />
              </RequireRole>
            }
          />

          <Route path="/admin" element={<AdminHome />} />
          <Route path="/sin-permiso" element={<Forbidden />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <TourFab />
      <PiloAi />
    </TourProvider>
  );
}
