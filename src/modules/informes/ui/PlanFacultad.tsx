/* =============================================================================
   Plan de Trabajo de la facultad dentro de Mi informe.
   · Sección «Objetivos y metas»: cada acción del plan, por dimensión, con su
     responsable, meta, fecha, avance y actividades. Las filas no se editan (las
     trae la API); la unidad escribe el análisis de cada una.
   · Sección «Resultados por dimensión»: avance del plan por dimensión, encima
     de las cifras.
   ========================================================================== */

import { agruparPorDimension, actividadesDe, avanceGeneral, claveAccion, resumenPorDimension, tonoEstado } from "../plan-decanatura";
import type { PlanAccion, PlanActividad, RespuestaPlan, ResumenDimension } from "../plan-decanatura";
import { Barra, Cargando, fmtFecha, mensajeDe } from "./comunes";

const ETIQUETA_DIM = (d: string) => d.toUpperCase();

const TONO: Record<ReturnType<typeof tonoEstado>, string> = {
  ok: "is-ok",
  proceso: "is-mid",
  pendiente: "",
};

interface PropsTabla {
  plan: RespuestaPlan | undefined;
  cargando: boolean;
  error: Error | null;
  observaciones: Record<string, string>;
  editable: boolean;
  cambiarObservacion: (clave: string, texto: string) => void;
}

/** Sección «Objetivos y metas» para una facultad: las acciones del plan. */
export function TablaPlan({ plan, cargando, error, observaciones, editable, cambiarObservacion }: PropsTabla) {
  if (error) {
    return (
      <p className="inf-error" role="alert">
        No se pudo traer el plan de trabajo: {mensajeDe(error)}. Recargue la página; si sigue igual, avise a Planeación.
      </p>
    );
  }
  if (cargando || !plan) return <Cargando texto="Trayendo el plan de trabajo…" />;
  if (!plan.acciones.length) {
    return <p className="inf-muted">Esta facultad todavía no tiene acciones en el Plan de Trabajo 2026.</p>;
  }

  const grupos = agruparPorDimension(plan.acciones);
  const avance = avanceGeneral(plan.acciones);
  return (
    <div className="inf-plan">
      <p className="inf-plan__resumen">
        <b>
          {plan.acciones.length} {plan.acciones.length === 1 ? "acción" : "acciones"}
        </b>{" "}
        en {grupos.length} {grupos.length === 1 ? "dimensión" : "dimensiones"}
        {avance !== null && <> · avance promedio {avance} %</>}
        {plan.decano && <> · decano: {plan.decano}</>}
        <span className="inf-muted"> · traído del plan el {fmtFecha(plan.traido_en)}</span>
      </p>

      {grupos.map((g) => (
        <section key={g.dimension} className="inf-plan__dim" aria-label={g.nombre}>
          <h4>
            {ETIQUETA_DIM(g.dimension)} · {g.nombre}
          </h4>
          {g.acciones.map((a) => (
            <Accion
              key={a.id}
              accion={a}
              actividades={actividadesDe(plan.actividades, a.id)}
              valor={observaciones[claveAccion(a.id)] ?? ""}
              editable={editable}
              cambiar={(t) => cambiarObservacion(claveAccion(a.id), t)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function Accion({
  accion: a,
  actividades,
  valor,
  editable,
  cambiar,
}: {
  accion: PlanAccion;
  actividades: PlanActividad[];
  valor: string;
  editable: boolean;
  cambiar: (texto: string) => void;
}) {
  const tono = tonoEstado(a.estado);
  const avance = a.avance ?? 0;
  return (
    <article className="inf-plan__accion">
      <header className="inf-plan__cab">
        <b>{a.accion}</b>
        <span className={`inf-pill ${TONO[tono]}`.trim()}>{a.estado ?? "Sin estado"}</span>
      </header>
      <dl className="inf-plan__datos">
        <div>
          <dt>Responsable</dt>
          <dd>{a.responsable || "Por definir"}</dd>
        </div>
        <div>
          <dt>Fecha límite</dt>
          <dd>{a.fecha_limite && a.fecha_limite !== "Por definir" ? fmtFecha(a.fecha_limite) : "Por definir"}</dd>
        </div>
        <div className="inf-plan__ancho">
          <dt>Meta</dt>
          <dd>{a.meta || "Por definir"}</dd>
        </div>
        {a.pilar && (
          <div>
            <dt>Pilar</dt>
            <dd>{a.pilar}</dd>
          </div>
        )}
        {a.recursos && (
          <div className="inf-plan__ancho">
            <dt>Recursos</dt>
            <dd>{a.recursos}</dd>
          </div>
        )}
      </dl>
      <div className="inf-plan__avance">
        <Barra valor={avance / 100} etiqueta={`Avance de ${a.accion}`} />
        <span className="inf-num">{a.avance ?? "—"} %</span>
      </div>
      {actividades.length > 0 && (
        <details className="inf-plan__acts">
          <summary>
            Actividades ({actividades.length})
          </summary>
          <ul>
            {actividades.map((x) => (
              <li key={x.id}>
                <span>{x.descripcion}</span>
                <small className="inf-muted">
                  {[x.responsable, x.fecha && fmtFecha(x.fecha), x.estado].filter(Boolean).join(" · ")}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
      <label className="inf-lab">
        Análisis de la unidad
        <textarea
          className="inf-in"
          rows={3}
          value={valor}
          disabled={!editable}
          placeholder="¿Cómo va esta acción, qué la frena y qué sigue?"
          onChange={(e) => cambiar(e.target.value)}
        />
      </label>
    </article>
  );
}

/** Sección «Resultados por dimensión»: el avance del plan por dimensión. */
export function ResumenPlan({ plan, cargando, error }: { plan: RespuestaPlan | undefined; cargando: boolean; error: Error | null }) {
  if (error || cargando || !plan || !plan.acciones.length) return null;
  const resumen = resumenPorDimension(plan.acciones);
  return (
    <div className="inf-plan__dims" role="list" aria-label="Avance del plan por dimensión">
      {resumen.map((r) => (
        <TarjetaDimension key={r.dimension} r={r} />
      ))}
    </div>
  );
}

function TarjetaDimension({ r }: { r: ResumenDimension }) {
  return (
    <div className="inf-plan__dim-card" role="listitem">
      <span className="inf-eyebrow">{ETIQUETA_DIM(r.dimension)}</span>
      <b>{r.nombre}</b>
      <Barra valor={(r.avance ?? 0) / 100} etiqueta={r.nombre} />
      <small className="inf-muted">
        {r.avance === null ? "Sin avance informado" : `${r.avance} % de avance`} · {r.completadas} de {r.total} completadas · {r.enProceso} en proceso
        {r.incompletas > 0 && ` · ${r.incompletas} sin responsable o meta definida`}
      </small>
    </div>
  );
}
