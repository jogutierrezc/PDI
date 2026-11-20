/* =============================================================================
   Planeación y Seguimiento · proyectos · «ENVIAR A EVALUACIÓN VAF / PUBLICAR VERSIÓN» (`plan-enviar/<versión>`).
   Revisa el borrador con las mismas reglas de la carga Excel (columnas obligatorias del plan, listas, pilares, claves únicas);
   si no hay problemas, publica la versión: queda congelada y se abre la evaluación financiera de la VAF.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { useCampus, useConfigPlan, useLineas, useOficinas, useVersiones } from "../api";
import { useProyectosOps } from "./hooksProy";
import { usePs } from "../contexto";
import { DESDE_MODULO, PaginaCompleta } from "../marco/PaginaCompleta";
import { entero, millones } from "../modelo";
import { puedeEnviarPlan, validarPlanParaEnviar } from "./modeloProy";

export function EnviarPlan({ id }: { id: string }) {
  const { plan, planId, planes, nivel, ruta, ir } = usePs();
  const versiones = useVersiones(planId);
  const v = versiones.data?.find((x) => x.id === id);
  const lineasQ = useLineas(v?.id ?? null);
  const cfgQ = useConfigPlan(planId);
  const campusQ = useCampus();
  const oficinasQ = useOficinas();
  const ops = useProyectosOps();
  const publicar = ops.enviar;
  const [entiendo, setEntiendo] = useState(false);
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Proyectos del plan", a: ruta("proyectos-plan") }, { texto: "Enviar a evaluación" }];
  const lineas = useMemo(() => lineasQ.data ?? [], [lineasQ.data]);
  const problemas = useMemo(() => (cfgQ.data ? validarPlanParaEnviar(lineas, { config: cfgQ.data, campus: campusQ.data ?? ["Bucaramanga", "Valledupar", "Cúcuta"], oficinas: (oficinasQ.data ?? []).map((o) => o.nombre) }) : []), [lineas, cfgQ.data, campusQ.data, oficinasQ.data]);
  if (!plan || versiones.isPending || lineasQ.isPending || cfgQ.isPending) return <PaginaCompleta titulo="Enviar a evaluación VAF" migas={migas} regresarA={ruta("proyectos-plan")}><LoadingBlock rows={3} label="Revisando el borrador" /></PaginaCompleta>;
  if (!v) return <PaginaCompleta titulo="No encuentro esa versión" migas={migas} regresarA={ruta("proyectos-plan")}><p className="ps-aviso"><Icon name="alert" size={16} /> La versión no existe o ya no está disponible.</p></PaginaCompleta>;
  const poder = planes.find((p) => p.id === planId)?.poder ?? null;
  if (!puedeEnviarPlan(nivel, poder, v.estado === "publicada" ? "publicada" : "borrador")) {
    return <PaginaCompleta titulo={`Enviar ${v.etiqueta}`} migas={migas} regresarA={ruta("proyectos-plan")}><p className="ps-aviso"><Icon name="lock" size={16} /> {v.estado === "publicada" ? "Esta versión ya está publicada y no se edita." : "Envían el plan a evaluación el administrador de planeación y el gestor de la oficina dueña."}</p></PaginaCompleta>;
  }
  if (hecho) {
    return (
      <PaginaCompleta titulo={`${hecho} enviada a evaluación`} migas={migas} regresarA={ruta("proyectos")} regresarTexto="Regresar a proyectos" claveFoco="hecho">
        <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> La versión {hecho} quedó publicada y se abrió la evaluación financiera: se avisó a la VAF. Los proyectos esperan su aprobación.</p>
        <div className="ps-botones"><button type="button" className="button-primary" onClick={() => ir(ruta("proyectos"))}>Ver los proyectos</button><button type="button" className="button-secondary" onClick={() => ir(ruta("financiacion"))}>Ver la cola de la VAF</button></div>
      </PaginaCompleta>
    );
  }
  const total = lineas.reduce((s, l) => s + (l.monto ?? 0), 0);
  const confirmar = async () => {
    if (problemas.length) return;
    if (!entiendo) { setErrorCampo("Marque la casilla para confirmar que entiende que la versión queda congelada."); document.getElementById("env-entiendo")?.focus(); return; }
    setErrorCampo(null);
    try { const r = await publicar.mutateAsync({ planId: plan.id, nota: "Enviada a evaluación de la VAF desde «Proyectos del plan»." }); setHecho(r.etiqueta || v.etiqueta); } catch { /* se muestra abajo */ }
  };
  return (
    <PaginaCompleta
      titulo={`Enviar ${v.etiqueta} a evaluación VAF`}
      subtitulo="Se revisa el borrador, se publica la versión y se abre la evaluación financiera."
      migas={migas}
      regresarA={ruta("proyectos-plan")}
      regresarTexto="Regresar a los proyectos del plan"
      ancho="angosto"
      pie={<><div className="ps-pie__izq" /><div className="ps-pie__der"><button type="button" className="button-secondary" onClick={() => ir(ruta("proyectos-plan"))} disabled={publicar.isPending}>Ahora no</button><button type="button" className="button-primary" onClick={() => void confirmar()} disabled={publicar.isPending || problemas.length > 0} aria-busy={publicar.isPending || undefined}>{publicar.isPending ? "Enviando…" : "Enviar y publicar"}</button></div></>}
    >
      {publicar.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(publicar.error as Error).message}</p> : null}
      <dl className="ps-ficha">
        <div><dt>Plan</dt><dd>{plan.nombre}</dd></div>
        <div><dt>Proyectos</dt><dd>{entero(lineas.length)}</dd></div>
        <div><dt>Monto solicitado</dt><dd>{millones(total)}</dd></div>
      </dl>
      {problemas.length ? (
        <section className="ps-resumen-errores" role="alert" aria-labelledby="env-prob-t">
          <strong id="env-prob-t">{problemas.length === 1 ? "Hay 1 problema" : `Hay ${problemas.length} problemas`} que impiden el envío</strong>
          <ul>{problemas.slice(0, 40).map((p, i) => <li key={i}>{p.no ? <><Link to={ruta("proyecto-editar", p.no)} state={DESDE_MODULO}>#{p.no}</Link> {p.nombre.replace(/\.$/, "").slice(0, 60)}: </> : null}{p.mensaje}</li>)}</ul>
          {problemas.length > 40 ? <p>Y {problemas.length - 40} más. Corrija los primeros y vuelva a revisar.</p> : null}
        </section>
      ) : <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> El borrador cumple las mismas reglas de la carga Excel.</p>}
      <div className="ps-bloque">
        <h2>Qué pasa al enviar</h2>
        <ul className="ps-pasos-lista">
          <li>La versión queda <strong>publicada y congelada</strong>: no se edita ni se borra.</li>
          <li>Se abre la <strong>evaluación de la VAF</strong> y se le avisa; los proyectos quedan «Sin evaluar» hasta que se aprueben o rechacen.</li>
          <li>La evaluación no bloquea a las oficinas: pueden planificar actividades mientras tanto.</li>
        </ul>
      </div>
      {!problemas.length ? (
        <div className="ps-campo" data-error={errorCampo ? "true" : undefined}>
          <label className="ps-opcion ps-opcion--grande"><input id="env-entiendo" type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} aria-invalid={Boolean(errorCampo)} aria-describedby={errorCampo ? "env-entiendo-error" : undefined} /><span>Entiendo que una versión publicada no se puede editar.</span></label>
          {errorCampo ? <p className="ps-campo__error" id="env-entiendo-error"><Icon name="alert" size={14} /> {errorCampo}</p> : null}
        </div>
      ) : null}
    </PaginaCompleta>
  );
}
