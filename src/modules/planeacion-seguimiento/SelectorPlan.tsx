/* =============================================================================
   Planeación y Seguimiento · Fase 3B · el selector de plan de la barra del módulo.
   Un plan activo por persona (se recuerda aquí y en la base); cada opción dice la oficina dueña y si está archivado.
   «Todos los planes» (administrador, aprobador y lector) abre el tablero. «Financiación y presupuesto» llega después.
   ========================================================================== */

import { useId } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { useAct } from "./actividades/hooks";
import { usePs } from "./contexto";
import { DESDE_MODULO } from "./marco/PaginaCompleta";
import { puedeCrearPlanes, puedeVerTodosLosPlanes, type PlanResumen } from "./modeloPlanes";

export const rotuloPlan = (p: Pick<PlanResumen, "nombre" | "oficina" | "estado">): string => `${p.nombre}${p.oficina ? ` · ${p.oficina.nombre}` : ""}${p.estado === "archivado" ? " (archivado)" : ""}`;

/** El hueco del estado financiero (evaluación de la VAF y ejecución): llega con la fase de financiación y presupuesto. */
export function ChipFinanciero() {
  return <span className="ps-fin-chip" title="El estado financiero llega con la evaluación de la VAF"><Icon name="clock" size={12} /> Financiero: próximamente</span>;
}

export function SelectorPlan() {
  const id = useId();
  const { planes, planId, elegirPlan, ruta, nivel, plan } = usePs();
  const act = useAct();
  const gestor = act.oficinas.some((o) => o.poder === "gestor");
  const activo = planes.find((p) => p.id === planId);
  const puedeEditar = nivel === "admin" || (nivel === "gestor" && Boolean(plan?.oficina && act.oficinas.some((o) => o.id === plan.oficina!.id && o.poder === "gestor")));
  return (
    <section className="ps-barra-plan" aria-label="Plan activo">
      <div className="ps-selector ps-barra-plan__sel">
        <label htmlFor={id}>Plan</label>
        {planes.length ? (
          <select id={id} value={planId ?? ""} onChange={(e) => elegirPlan(e.target.value)}>
            {planes.map((p) => <option key={p.id} value={p.id}>{rotuloPlan(p)}</option>)}
          </select>
        ) : <strong>Aún no hay planes</strong>}
      </div>
      {activo ? <p className="ps-barra-plan__info"><span className="ps-estado" data-tono={activo.estado === "archivado" ? "pend" : "ok"}>{activo.estado === "archivado" ? "Archivado" : "Activo"}</span> {activo.oficina ? `Oficina dueña: ${activo.oficina.nombre}` : "Sin oficina asignada"}{activo.versionVigente ? ` · versión ${activo.versionVigente}` : " · sin versión vigente"}</p> : null}
      <div className="ps-barra-plan__acc">
        {puedeVerTodosLosPlanes(nivel) ? <Link className="button-secondary ps-btn-peq" to={ruta("planes")} state={DESDE_MODULO}><Icon name="grid" size={13} /> Todos los planes</Link> : null}
        {!activo?.oficina && activo && nivel === "admin" ? <Link className="button-primary ps-btn-peq" to={ruta("plan-editar", activo.id)} state={DESDE_MODULO}>Asignar la oficina del plan</Link> : null}
        {puedeEditar && activo ? <Link className="button-secondary ps-btn-peq" to={ruta("plan-editar", activo.id)} state={DESDE_MODULO}><Icon name="pen" size={13} /> Editar el plan</Link> : null}
        {puedeCrearPlanes(nivel, gestor) ? <Link className="button-secondary ps-btn-peq" to={ruta("crear")} state={DESDE_MODULO}><Icon name="plus" size={13} /> Crear un plan</Link> : null}
        <span className="ps-barra-plan__fin" aria-disabled="true" role="link" tabIndex={0} title="Próximamente"><Icon name="lock" size={13} /> Financiación y presupuesto <em>próximamente</em></span>
      </div>
    </section>
  );
}
