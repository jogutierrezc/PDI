/* =============================================================================
   Impacto · intranet.

   Una sola pantalla con cuatro vistas, una por trabajo:
     · Catálogo   Planeación importa la matriz, completa fichas y publica.
     · Periodo    Planeación abre el periodo y revisa las asignaciones.
     · Mi reporte El programa captura y envía su paquete.
     · Revisión   Decanatura aprueba o devuelve; cada vicerrectoría valida
                  lo de su función.

   Cada vista la ve quien tiene ese trabajo en la base, no un selector: el
   «Ver como» del prototipo se retiró con la fase 7.
     · Catálogo y Periodo: Planeación o más (la base exige además
       impacto.catalogo e impacto.periodo).
     · Mi reporte: quien captura en algún programa (imp_my_programs).
     · Revisión: quien aprueba en algún programa o valida alguna función
       (imp_my_review_scope).
   ========================================================================== */

import { useEffect } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { AdminShell } from "../../admin/components/AdminShell";
import { useAuth } from "../../../lib/auth";
import { useMyPrograms } from "../data/capture-db";
import { useReviewScope } from "../data/review-db";
import { CatalogView } from "./CatalogView";
import { PeriodView } from "./PeriodView";
import { ReportView } from "./ReportView";
import { ReviewView } from "./ReviewView";
import "./impact-admin.css";

type View = "catalogo" | "periodo" | "reporte" | "revision";

const VIEWS: { id: View; label: string }[] = [
  { id: "catalogo", label: "Catálogo" },
  { id: "periodo", label: "Periodo" },
  { id: "reporte", label: "Mi reporte" },
  { id: "revision", label: "Revisión" },
];

const DESCRIPTION: Record<View, string> = {
  catalogo: "Los indicadores de la matriz importada, sus fichas técnicas, los hallazgos del importador y la publicación de versiones.",
  periodo: "Abrir el periodo, fijar las fechas de corte y revisar qué le toca reportar a cada programa.",
  reporte: "Lo que su programa debe reportar este periodo. Guarde cuando quiera; al final, envíelo a decanatura.",
  revision: "Los registros que esperan su decisión. Apruebe o devuelva con un motivo.",
};

export function ImpactAdmin() {
  const { vista } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const programs = useMyPrograms();
  const scope = useReviewScope();
  const pending = programs.isPending || scope.isPending;

  const reviews = (scope.data?.deanPrograms.length ?? 0) > 0 || (scope.data?.functions.length ?? 0) > 0;
  const allowed = VIEWS.filter((v) =>
    v.id === "reporte" ? (programs.data?.length ?? 0) > 0 : v.id === "revision" ? reviews : hasRole("planeacion"),
  );
  const view = allowed.find((v) => v.id === vista) ?? allowed[0] ?? null;

  // No se decide a dónde ir hasta saber qué trabajos tiene la persona.
  useEffect(() => {
    if (pending) return;
    if (view && vista !== view.id) navigate(`/admin/impacto/${view.id}`, { replace: true });
  }, [vista, view, navigate, pending]);

  if (!view || (pending && (vista === "reporte" || vista === "revision"))) {
    return (
      <AdminShell section="impacto" kicker="Impacto" title="Reporte de impacto">
        {pending ? (
          <p className="ia-muted">Cargando…</p>
        ) : (
          <section className="admin-card ia-empty-state">
            <h2>No tiene tareas en Impacto</h2>
            <p>Para reportar, revisar o administrar, Planeación debe asignarle un rol de Impacto en su unidad (Usuarios y roles).</p>
          </section>
        )}
      </AdminShell>
    );
  }

  return (
    <AdminShell
      section="impacto"
      kicker="Impacto"
      title={view.id === "reporte" ? "Mi reporte del periodo" : view.label}
      description={DESCRIPTION[view.id]}
    >
      {allowed.length > 1 && (
        <div className="ia-bar">
          <nav className="ia-views" aria-label="Vistas de Impacto">
            {allowed.map((v) => (
              <NavLink key={v.id} to={`/admin/impacto/${v.id}`} className={v.id === view.id ? "is-active" : undefined}>
                {v.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {view.id === "catalogo" && <CatalogView />}
      {view.id === "periodo" && <PeriodView />}
      {view.id === "reporte" && <ReportView />}
      {view.id === "revision" && <ReviewView />}
    </AdminShell>
  );
}
