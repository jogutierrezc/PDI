/* =============================================================================
   Planeación y Seguimiento · proyectos · «PROYECTOS DEL PLAN» (`proyectos-plan`): alta, edición y eliminación de proyectos
   del plan en borrador, a pantalla completa, y el botón «Enviar a evaluación VAF / Publicar versión» (mismas validaciones que
   la carga Excel). El Excel sigue siendo una alternativa. Nada se edita en una versión publicada; pueden crear y editar el
   administrador y el gestor de la oficina dueña.
   ========================================================================== */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { EmptyBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useLineas, useVersiones } from "../api";
import { usePs } from "../contexto";
import { DESDE_MODULO, PaginaCompleta } from "../marco/PaginaCompleta";
import { Prioridad } from "../partes";
import { entero, millones, millones1, pilarCodigo, rotuloCampus } from "../modelo";
import { useProyectosOps } from "./hooksProy";
import { puedeEditarProyectos } from "./modeloProy";

export function ProyectosPlan() {
  const { plan, planId, planes, nivel, ruta, ir } = usePs();
  const versiones = useVersiones(planId);
  const borrador = versiones.data?.find((v) => v.estado === "borrador") ?? null;
  const publicada = versiones.data?.find((v) => v.vigente) ?? null;
  const lineasQ = useLineas(borrador?.id ?? null);
  const ops = useProyectosOps();
  const [aEliminar, setAEliminar] = useState<string | null>(null);
  const [estado, setEstado] = useState<string>("");
  const poder = planes.find((p) => p.id === planId)?.poder ?? null;
  const puede = puedeEditarProyectos(nivel, poder, borrador ? "borrador" : publicada ? "publicada" : null);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Proyectos del plan" }];
  if (!plan) return null;
  if (versiones.isPending) return <PaginaCompleta titulo="Proyectos del plan" migas={migas} regresarA={ruta("proyectos")}><LoadingBlock rows={4} label="Cargando el borrador" /></PaginaCompleta>;
  const lineas = lineasQ.data ?? [];
  const total = lineas.reduce((s, l) => s + (l.monto ?? 0), 0);
  const eliminar = async (no: string) => {
    try { await ops.eliminar.mutateAsync({ planId: plan.id, no }); setEstado(`Se eliminó el proyecto #${no}.`); } catch { /* se muestra abajo */ }
    setAEliminar(null);
  };
  return (
    <PaginaCompleta
      titulo="Proyectos del plan"
      subtitulo={<>«{plan.nombre}» · {borrador ? `borrador ${borrador.etiqueta}` : publicada ? `versión ${publicada.etiqueta} publicada` : "aún sin proyectos"}</>}
      migas={migas}
      regresarA={ruta("proyectos")}
      regresarTexto="Regresar a proyectos"
      acciones={puede ? <Link className="button-primary" to={ruta("proyecto-nuevo")} state={DESDE_MODULO}><Icon name="plus" size={15} /> Agregar proyecto</Link> : undefined}
    >
      {publicada && !borrador ? (
        <p className="ps-aviso ps-aviso--info"><Icon name="lock" size={16} /> <span>La versión {publicada.etiqueta} está publicada y no se edita. Para cambiarla se abre un borrador por solicitud de cambio (fase 4).</span></p>
      ) : !puede ? (
        <p className="ps-aviso"><Icon name="lock" size={16} /> Crean y editan proyectos el administrador de planeación y el gestor de la oficina dueña del plan. Usted los ve en solo lectura.</p>
      ) : (
        <p className="ps-sub">Agregue, edite o elimine los proyectos del borrador. Cuando estén todos, envíelos a evaluación de la VAF: se publica la versión y se abre la evaluación financiera. También puede <Link to={ruta("cargar")} state={DESDE_MODULO}>cargarlos desde Excel</Link>{nivel === "admin" ? "" : " (lo hace el administrador)"}.</p>
      )}
      {estado ? <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> {estado}</p> : null}
      {ops.eliminar.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {(ops.eliminar.error as Error).message}</p> : null}
      {!borrador ? (
        publicada ? null : <EmptyBlock title="Este plan aún no tiene proyectos" hint={puede ? "Agregue el primero con «Agregar proyecto»; el borrador se crea solo." : "Cuando la oficina dueña los agregue, aparecerán aquí."} />
      ) : lineasQ.isPending ? <LoadingBlock rows={4} label="Cargando los proyectos" /> : (
        <>
          <dl className="ps-kpis ps-kpis--chico" aria-label="Cifras del borrador">
            <div><dt>Proyectos</dt><dd>{entero(lineas.length)}</dd></div>
            <div><dt>Monto solicitado</dt><dd>{millones(total)}</dd></div>
          </dl>
          {lineas.length === 0 ? <EmptyBlock title="El borrador no tiene proyectos" hint="Agregue el primero con «Agregar proyecto»." /> : (
            <div className="ps-tabla" role="table" aria-label="Proyectos del borrador">
              <div className="ps-tabla__fila ps-tabla__cab ps-tabla__fila--acc" role="row"><span role="columnheader">Proyecto</span><span role="columnheader">Campus</span><span role="columnheader">Prioridad</span><span role="columnheader" className="ps-der">Solicitado</span><span role="columnheader">Acciones</span></div>
              {lineas.map((l) => (
                <div className="ps-tabla__fila ps-tabla__fila--acc" role="row" key={l.no}>
                  <span role="cell" className="ps-tabla__t">{l.nombre.replace(/\.$/, "")}<em>#{l.no} · {l.clasif || "sin clasificación"} · {l.pilar ? pilarCodigo(l.pilar) : "sin pilar"}{l.oficina ? ` · ${l.oficina}` : ""}</em></span>
                  <span role="cell" data-l="Campus">{l.campus ? rotuloCampus(l.campus) : "—"}</span>
                  <span role="cell" data-l="Prioridad">{l.prioridad ? <Prioridad valor={l.prioridad} /> : "—"}</span>
                  <span role="cell" className="ps-der" data-l="Solicitado">{l.monto === null ? "Sin monto" : millones1(l.monto)}</span>
                  <span role="cell" className="ps-acciones-fila">
                    {puede && aEliminar === l.no ? (
                      <span className="ps-confirmar-fila" role="group" aria-label={`Confirmar la eliminación del proyecto ${l.no}`}>
                        <span>¿Eliminar #{l.no}?</span>
                        <button type="button" className="button-secondary ps-btn-peq ps-btn-rechazar" onClick={() => void eliminar(l.no)} disabled={ops.eliminar.isPending}>Sí, eliminar</button>
                        <button type="button" className="button-secondary ps-btn-peq" onClick={() => setAEliminar(null)}>Cancelar</button>
                      </span>
                    ) : puede ? (
                      <>
                        <Link className="button-secondary ps-btn-peq" to={ruta("proyecto-editar", l.no)} state={DESDE_MODULO}><Icon name="pen" size={13} /> Editar<span className="sr-only"> el proyecto {l.no}</span></Link>
                        <button type="button" className="button-secondary ps-btn-peq" onClick={() => setAEliminar(l.no)}><Icon name="trash" size={13} /> Eliminar<span className="sr-only"> el proyecto {l.no}</span></button>
                      </>
                    ) : <Link className="button-secondary ps-btn-peq" to={ruta("proyectos", l.no)} state={DESDE_MODULO}>Ver<span className="sr-only"> el proyecto {l.no}</span></Link>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {puede ? (
            <div className="ps-botones ps-botones--fin">
              <button type="button" className="button-primary" disabled={lineas.length === 0} onClick={() => ir(ruta("plan-enviar", borrador.id))}><Icon name="next" size={15} /> Enviar a evaluación VAF / Publicar versión</button>
              {lineas.length === 0 ? <span className="ps-nota">Agregue al menos un proyecto para enviarlo.</span> : null}
            </div>
          ) : null}
        </>
      )}
    </PaginaCompleta>
  );
}
