/* =============================================================================
   Objetivos y metas · el Plan de Trabajo de la unidad.
   Tres orígenes, un solo lugar: la sincronización con la API del plan, un
   archivo de seguimiento (JSON o PDF) o lo que la unidad escribe a mano. Si la
   unidad tiene plan propio (importado o escrito), ese manda y se edita aquí;
   mientras no, se ve el de la sincronización, que no se edita.
   ========================================================================== */

import { useRef, useState } from "react";
import type { RespuestaPlan } from "../plan-decanatura";
import { avanceGeneral } from "../plan-decanatura";
import {
  accionNueva,
  conAccion,
  conActividad,
  conActividadNueva,
  desdeApi,
  ESTADOS_PLAN,
  leerPlanJson,
  leerPlanPdf,
  lineasDePdf,
  planVacio,
  planVigente,
  sinAccion,
  sinActividad,
} from "../plan-importar";
import type { PlanLocal, ResultadoLectura } from "../plan-importar";
import { Barra, fmtFecha, mensajeDe } from "./comunes";
import { TablaPlan } from "./PlanFacultad";
import { PiloAyuda } from "./PiloAyuda";
import type { PlanAccion, PlanActividad } from "../plan-decanatura";

const DIMENSIONES_PLAN: [string, string][] = [
  ["d1", "Gestión de calidad y autorregulación"],
  ["d2", "Gestión de la oferta académica y cupos"],
  ["d3", "Gestión académica"],
  ["d4", "Gestión profesoral"],
  ["d5", "Gestión administrativa"],
  ["d6", "Gestión de extensión universitaria"],
  ["d7", "Gestión financiera"],
];
const ORIGEN: Record<string, string> = { json: "archivo JSON", pdf: "archivo PDF", manual: "escrito a mano", api: "sincronización con el plan" };

async function leerArchivo(archivo: File): Promise<ResultadoLectura> {
  const nombre = archivo.name;
  if (/\.json$/i.test(nombre)) return leerPlanJson(await archivo.text(), nombre);
  if (/\.pdf$/i.test(nombre)) {
    try {
      const { loadPdfPages } = await import("../../admin/pilo-ensenanza/ingest/pdf-load");
      const paginas = await loadPdfPages(new Uint8Array(await archivo.arrayBuffer()));
      return leerPlanPdf(lineasDePdf(paginas), nombre);
    } catch (e) {
      return { error: `No se pudo abrir el PDF: ${mensajeDe(e)}` };
    }
  }
  return { error: "Elija un archivo .json o .pdf del seguimiento del Plan de Trabajo." };
}

interface Props {
  api: { data: RespuestaPlan | undefined; isPending: boolean; error: Error | null; activo: boolean };
  local: PlanLocal | undefined;
  editable: boolean;
  observaciones: Record<string, string>;
  cambiarObservacion: (clave: string, texto: string) => void;
  cambiarPlan: (plan: PlanLocal | undefined) => void;
  /** Pilo redacta el análisis de una acción (quien elabora lo edita). */
  redactarAccion?: (a: PlanAccion, actividades: PlanActividad[], actual: string) => Promise<string>;
}

export function PlanUnidad({ api, local, editable, observaciones, cambiarObservacion, cambiarPlan, redactarAccion }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [previa, setPrevia] = useState<ResultadoLectura | null>(null);

  const elegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setLeyendo(true);
    setPrevia(await leerArchivo(archivo));
    setLeyendo(false);
    if (entrada.current) entrada.current.value = "";
  };

  const usar = () => {
    if (!previa || "error" in previa) return;
    if (local && local.acciones.length && !window.confirm(`Reemplaza las ${local.acciones.length} acciones que ya tiene esta sección. ¿Continuar?`)) return;
    cambiarPlan(previa.plan);
    setPrevia(null);
  };

  const vigente = planVigente(api.data, local);
  const apiLista = api.activo && Boolean(api.data?.acciones.length);

  return (
    <div className="inf-plan">
      {editable && (
        <div className="inf-row inf-plan__barra">
          <input ref={entrada} type="file" accept=".json,.pdf,application/json,application/pdf" hidden onChange={(e) => void elegir(e.target.files?.[0])} />
          <button type="button" className="inf-btn inf-btn--sm" disabled={leyendo} onClick={() => entrada.current?.click()}>
            {leyendo ? "Leyendo el archivo…" : "Importar JSON o PDF"}
          </button>
          {!local && apiLista && api.data && (
            <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => cambiarPlan(desdeApi(api.data as RespuestaPlan))}>
              Editar a mano lo sincronizado
            </button>
          )}
          {!local && (
            <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => cambiarPlan(planVacio())}>
              Escribir el plan a mano
            </button>
          )}
          {local && api.activo && (
            <button
              type="button"
              className="inf-btn inf-btn--sm inf-btn--ghost"
              onClick={() => window.confirm("Se descarta el plan propio de esta sección y vuelve la sincronización. ¿Continuar?") && cambiarPlan(undefined)}
            >
              Volver a la sincronización
            </button>
          )}
          {local && !api.activo && local.acciones.length === 0 && (
            <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => cambiarPlan(undefined)}>
              Descartar
            </button>
          )}
        </div>
      )}

      {previa && (
        <div className="inf-nota" role="status">
          {"error" in previa ? (
            <>
              <b>No se pudo leer el archivo</b>
              {previa.error}
              <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => setPrevia(null)}>
                Cerrar
              </button>
            </>
          ) : (
            <>
              <b>
                Vista previa · {previa.plan.acciones.length} acciones y {previa.plan.actividades.length} actividades
              </b>
              <span>
                {previa.plan.archivo} ({ORIGEN[previa.plan.origen]}){previa.plan.decano ? ` · ${previa.plan.decano}` : ""}. Revise y use el plan; después puede corregir cada fila.
              </span>
              {previa.avisos.length > 0 && (
                <ul>
                  {previa.avisos.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
              <span className="inf-row">
                <button type="button" className="inf-btn inf-btn--sm inf-btn--pri" onClick={usar}>
                  Usar este plan
                </button>
                <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => setPrevia(null)}>
                  Descartar
                </button>
              </span>
            </>
          )}
        </div>
      )}

      {local && editable ? (
        <PlanEditable plan={local} observaciones={observaciones} cambiarObservacion={cambiarObservacion} cambiar={cambiarPlan} redactarAccion={redactarAccion} />
      ) : vigente ? (
        <TablaPlan
          plan={{ facultad: "", decano: vigente.decano, plan: null, acciones: vigente.acciones, actividades: vigente.actividades, seguimientos: [], traido_en: vigente.traido_en ?? new Date().toISOString() }}
          cargando={false}
          error={null}
          observaciones={observaciones}
          editable={editable}
          cambiarObservacion={cambiarObservacion}
          redactarAccion={redactarAccion}
        />
      ) : api.activo ? (
        <TablaPlan plan={api.data} cargando={api.isPending} error={api.error} observaciones={observaciones} editable={editable} cambiarObservacion={cambiarObservacion} redactarAccion={redactarAccion} />
      ) : (
        <p className="inf-muted">Esta unidad aún no tiene plan de trabajo. Importe el seguimiento (JSON o PDF) o escríbalo a mano.</p>
      )}
      {local && (
        <small className="inf-muted">
          Plan propio · {ORIGEN[local.origen]}
          {local.archivo ? ` (${local.archivo})` : ""} · {fmtFecha(local.importado_en)}
        </small>
      )}
    </div>
  );
}

/* ---------- Edición a mano -------------------------------------------------------- */

function PlanEditable({ plan, observaciones, cambiarObservacion, cambiar, redactarAccion }: { redactarAccion?: Props["redactarAccion"]; plan: PlanLocal; observaciones: Record<string, string>; cambiarObservacion: (clave: string, texto: string) => void; cambiar: (p: PlanLocal) => void }) {
  const dimensiones = new Map<string, string>(DIMENSIONES_PLAN);
  for (const a of plan.acciones) dimensiones.set(a.dimension, a.dimension_nombre);
  const [nueva, setNueva] = useState("d1");
  const avance = avanceGeneral(plan.acciones);
  const grupos = [...dimensiones.entries()].map(([id, nombre]) => ({ id, nombre, acciones: plan.acciones.filter((a) => a.dimension === id) })).filter((g) => g.acciones.length);

  return (
    <>
      <p className="inf-plan__resumen">
        <b>{plan.acciones.length} acciones</b> en {grupos.length} dimensiones{avance !== null && <> · avance promedio {avance} %</>}
      </p>
      {grupos.map((g) => (
        <section key={g.id} className="inf-plan__dim" aria-label={g.nombre}>
          <h4>
            {g.id.toUpperCase()} · {g.nombre}
          </h4>
          {g.acciones.map((a) => (
            <article key={a.id} className="inf-plan__accion">
              <div className="inf-plan__edit">
                <label className="inf-lab inf-plan__ancho">
                  Acción
                  <input className="inf-in" value={a.accion} onChange={(e) => cambiar(conAccion(plan, a.id, { accion: e.target.value }))} />
                </label>
                <label className="inf-lab inf-plan__ancho">
                  Meta
                  <textarea className="inf-in" rows={2} value={a.meta ?? ""} onChange={(e) => cambiar(conAccion(plan, a.id, { meta: e.target.value || null }))} />
                </label>
                <label className="inf-lab">
                  Responsable
                  <input className="inf-in" value={a.responsable ?? ""} onChange={(e) => cambiar(conAccion(plan, a.id, { responsable: e.target.value || null }))} />
                </label>
                <label className="inf-lab">
                  Fecha límite
                  <input className="inf-in" type="date" value={a.fecha_limite && /^\d{4}-\d{2}-\d{2}/.test(a.fecha_limite) ? a.fecha_limite.slice(0, 10) : ""} onChange={(e) => cambiar(conAccion(plan, a.id, { fecha_limite: e.target.value || null }))} />
                </label>
                <label className="inf-lab">
                  Estado
                  <select className="inf-in" value={a.estado ?? "Pendiente"} onChange={(e) => cambiar(conAccion(plan, a.id, { estado: e.target.value }))}>
                    {ESTADOS_PLAN.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="inf-lab">
                  Avance (%)
                  <input
                    className="inf-in inf-num"
                    type="number"
                    min={0}
                    max={100}
                    value={a.avance ?? ""}
                    onChange={(e) => cambiar(conAccion(plan, a.id, { avance: e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))) }))}
                  />
                </label>
                <label className="inf-lab">
                  Pilar del PDI
                  <input className="inf-in" value={a.pilar ?? ""} onChange={(e) => cambiar(conAccion(plan, a.id, { pilar: e.target.value || null }))} />
                </label>
                <label className="inf-lab">
                  Recursos
                  <input className="inf-in" value={a.recursos ?? ""} onChange={(e) => cambiar(conAccion(plan, a.id, { recursos: e.target.value || null }))} />
                </label>
                <label className="inf-lab inf-plan__ancho">
                  Enlace de evidencia
                  <input className="inf-in" type="url" placeholder="https://" value={a.link_evidencia_accion ?? ""} onChange={(e) => cambiar(conAccion(plan, a.id, { link_evidencia_accion: e.target.value || null }))} />
                </label>
              </div>
              <div className="inf-plan__avance">
                <Barra valor={(a.avance ?? 0) / 100} etiqueta={`Avance de ${a.accion || "la acción"}`} />
                <span className="inf-num">{a.avance ?? "—"} %</span>
              </div>

              <details className="inf-plan__acts" open={plan.actividades.some((x) => x.accion_id === a.id)}>
                <summary>Actividades ({plan.actividades.filter((x) => x.accion_id === a.id).length})</summary>
                {plan.actividades
                  .filter((x) => x.accion_id === a.id)
                  .map((x) => (
                    <div key={x.id} className="inf-plan__act-edit">
                      <input className="inf-in" aria-label="Actividad" placeholder="Descripción" value={x.descripcion} onChange={(e) => cambiar(conActividad(plan, x.id, { descripcion: e.target.value }))} />
                      <input className="inf-in" aria-label="Responsable" placeholder="Responsable" value={x.responsable ?? ""} onChange={(e) => cambiar(conActividad(plan, x.id, { responsable: e.target.value || null }))} />
                      <input className="inf-in" aria-label="Fecha" type="date" value={x.fecha && /^\d{4}-\d{2}-\d{2}/.test(x.fecha) ? x.fecha.slice(0, 10) : ""} onChange={(e) => cambiar(conActividad(plan, x.id, { fecha: e.target.value || null }))} />
                      <select className="inf-in" aria-label="Estado" value={x.estado ?? "Pendiente"} onChange={(e) => cambiar(conActividad(plan, x.id, { estado: e.target.value }))}>
                        {ESTADOS_PLAN.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <button type="button" className="inf-btn inf-btn--ghost inf-btn--sm" aria-label="Quitar actividad" onClick={() => cambiar(sinActividad(plan, x.id))}>
                        ✕
                      </button>
                    </div>
                  ))}
                <button type="button" className="inf-btn inf-btn--sm" onClick={() => cambiar(conActividadNueva(plan, a.id))}>
                  Añadir actividad
                </button>
              </details>

              <label className="inf-lab">
                Análisis de la unidad
                <textarea
                  className="inf-in"
                  rows={3}
                  value={observaciones[`plan_${a.id}`] ?? ""}
                  placeholder="¿Cómo va esta acción, qué la frena y qué sigue?"
                  onChange={(e) => cambiarObservacion(`plan_${a.id}`, e.target.value)}
                />
              </label>
              {redactarAccion && (
                <PiloAyuda
                  texto={observaciones[`plan_${a.id}`] ?? ""}
                  onTexto={(t) => cambiarObservacion(`plan_${a.id}`, t)}
                  pedir={async (actual) => ({ texto: await redactarAccion(a, plan.actividades.filter((x) => x.accion_id === a.id), actual) })}
                />
              )}
              <button
                type="button"
                className="inf-btn inf-btn--ghost inf-btn--sm"
                style={{ justifySelf: "start" }}
                onClick={() => window.confirm(`Quitar la acción «${a.accion || "sin nombre"}» y sus actividades.`) && cambiar(sinAccion(plan, a.id))}
              >
                Quitar la acción
              </button>
            </article>
          ))}
        </section>
      ))}

      <div className="inf-row">
        <select className="inf-in" style={{ width: "auto" }} aria-label="Dimensión de la nueva acción" value={nueva} onChange={(e) => setNueva(e.target.value)}>
          {[...dimensiones.entries()].map(([id, nombre]) => (
            <option key={id} value={id}>
              {id.toUpperCase()} · {nombre}
            </option>
          ))}
        </select>
        <button type="button" className="inf-btn inf-btn--sm" onClick={() => cambiar({ ...plan, acciones: [...plan.acciones, accionNueva(plan, nueva, dimensiones.get(nueva) ?? "")] })}>
          Añadir acción
        </button>
      </div>
    </>
  );
}
