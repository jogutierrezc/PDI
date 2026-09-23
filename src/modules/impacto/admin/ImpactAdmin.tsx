/* =============================================================================
   Impacto · intranet (prototipo).

   Una sola pantalla con cuatro vistas, una por trabajo:
     · Catálogo   Planeación importa la matriz, completa fichas y publica.
     · Periodo    Planeación abre 2026-2 y revisa las asignaciones.
     · Mi reporte El director captura y envía el paquete de su programa.
     · Revisión   Decanatura aprueba o devuelve; cada vicerrectoría valida
                  lo de su función.

   Mientras no hay modelo en Supabase, «Ver como» cambia de persona para
   recorrer el circuito completo en una sola sesión.
   ========================================================================== */

import { useEffect } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { AdminShell } from "../../admin/components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { CatalogView } from "./CatalogView";
import { PeriodView } from "./PeriodView";
import { ReportView } from "./ReportView";
import { ReviewView } from "./ReviewView";
import { PEOPLE, actions, me, useImpactStore } from "./store";
import type { Role } from "./store";
import "./impact-admin.css";

type View = "catalogo" | "periodo" | "reporte" | "revision";

const VIEWS: { id: View; label: string; roles: Role[] }[] = [
  { id: "catalogo", label: "Catálogo", roles: ["administrador"] },
  { id: "periodo", label: "Periodo", roles: ["administrador"] },
  { id: "reporte", label: "Mi reporte", roles: ["director"] },
  { id: "revision", label: "Revisión", roles: ["decano", "vicerrector"] },
];

const DESCRIPTION: Record<View, string> = {
  catalogo: "Los 106 indicadores de la matriz vr7, sus fichas técnicas y la versión publicada del catálogo.",
  periodo: "Abrir el periodo, fijar las fechas de corte y revisar qué le toca reportar a cada programa.",
  reporte: "Lo que su programa debe reportar este periodo. Guarde cuando quiera; al final, envíelo a decanatura.",
  revision: "Los registros que esperan su decisión. Apruebe o devuelva con un motivo.",
};

export function ImpactAdmin() {
  const state = useImpactStore();
  const person = me(state);
  const { vista } = useParams();
  const navigate = useNavigate();
  const allowed = VIEWS.filter((v) => v.roles.includes(person.role));
  const view = allowed.find((v) => v.id === vista) ?? allowed[0];

  // Cambiar de persona lleva a su primera vista.
  useEffect(() => {
    if (vista !== view.id) navigate(`/admin/impacto/${view.id}`, { replace: true });
  }, [vista, view.id, navigate]);

  return (
    <AdminShell
      section="impacto"
      kicker="Impacto"
      title={view.id === "reporte" ? "Mi reporte del periodo" : view.label}
      description={DESCRIPTION[view.id]}
      actions={
        <label className="ia-as">
          <span>Ver como</span>
          <select value={person.id} onChange={(e) => actions.become(e.target.value)}>
            {PEOPLE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="ia-bar">
        {allowed.length > 1 && (
          <nav className="ia-views" aria-label="Vistas de Impacto">
            {allowed.map((v) => (
              <NavLink key={v.id} to={`/admin/impacto/${v.id}`} className={v.id === view.id ? "is-active" : undefined}>
                {v.label}
              </NavLink>
            ))}
          </nav>
        )}
        <p className="ia-proto">
          <Icon name="alert" size={14} />
          Prototipo: los datos viven en este navegador.
          <button type="button" onClick={() => actions.reset()}>
            Reiniciar el recorrido
          </button>
        </p>
      </div>

      {view.id === "catalogo" && <CatalogView />}
      {view.id === "periodo" && <PeriodView />}
      {view.id === "reporte" && <ReportView />}
      {view.id === "revision" && <ReviewView />}
    </AdminShell>
  );
}
