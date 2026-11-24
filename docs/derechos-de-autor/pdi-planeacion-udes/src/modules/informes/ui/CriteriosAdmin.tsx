/* =============================================================================
   Tablero del ciclo · criterios de Resultados por dimensión.
   Planeación crea los criterios que rigen para todas las unidades y decide
   sobre lo que las unidades sugieren: aprobar (con el año desde el que rige,
   por lo común el ciclo siguiente), rechazar con una nota o archivar.
   ========================================================================== */

import { useState } from "react";
import { useBorrarCriterio, useCrearCriterio, useCriterios, useRevisarCriterio } from "../criterios";
import type { CriterioRow } from "../criterios";
import { LETRAS, PLANTILLAS } from "../plantillas";
import type { CicloRow, Plantilla } from "../types";
import { useUnidades } from "../datos";
import { Cargando, mensajeDe } from "./comunes";

export function CriteriosAdmin({ ciclo }: { ciclo: CicloRow }) {
  const lectura = useCriterios();
  const unidades = useUnidades();
  const crear = useCrearCriterio();
  const revisar = useRevisarCriterio();
  const borrar = useBorrarCriterio();
  const [f, setF] = useState({ nombre: "", descripcion: "", plantillas: [] as Plantilla[], desde: ciclo.anio });
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [desde, setDesde] = useState<Record<string, number>>({});

  const nombreUnidad = (id: string | null) => unidades.data?.find((u) => u.id === id)?.name ?? "una unidad";
  const filas = lectura.data?.filas ?? [];
  const propuestos = filas.filter((c) => c.estado === "propuesto");
  const aprobados = filas.filter((c) => c.estado === "aprobado");
  const error = [crear.error, revisar.error, borrar.error, lectura.error].find((e): e is Error => e instanceof Error);

  const ambito = (c: CriterioRow) => (c.plantillas.length ? c.plantillas.map((p) => PLANTILLAS[p].quien).join(", ") : "todas las plantillas");

  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-crit">
      <h3 id="inf-crit" className="inf-t">
        Criterios de Resultados por dimensión
      </h3>
      <p className="inf-sub">
        Los seis criterios base (Gestión académica, profesoral, calidad, investigación, extensión y financiera) siempre están. Aquí crea otros para todas las unidades y decide sobre
        los que ellas sugieren.
      </p>
      {lectura.isPending && <Cargando texto="Leyendo los criterios…" />}
      {lectura.data?.falta && <p className="inf-hint">Falta aplicar la migración 0252 para crear y aprobar criterios.</p>}

      {propuestos.length > 0 && (
        <div className="inf-stack" style={{ gap: "var(--space-3)" }}>
          <b>Sugeridos por las unidades ({propuestos.length})</b>
          {propuestos.map((c) => (
            <div key={c.id} className="inf-plan__accion">
              <b>{c.nombre}</b>
              <small className="inf-muted">Sugerido por {nombreUnidad(c.unit_id)}</small>
              <div className="inf-row">
                <label className="inf-lab" style={{ maxWidth: 150 }}>
                  Rige desde
                  <input className="inf-in inf-num" type="number" value={desde[c.id] ?? ciclo.anio + 1} onChange={(e) => setDesde({ ...desde, [c.id]: Number(e.target.value) })} />
                </label>
                <button type="button" className="inf-btn inf-btn--sm inf-btn--pri" disabled={revisar.isPending} onClick={() => revisar.mutate({ id: c.id, estado: "aprobado", vigente_desde: desde[c.id] ?? ciclo.anio + 1 })}>
                  Aprobar
                </button>
                <input className="inf-in" style={{ flex: 1, minWidth: 160 }} placeholder="Motivo si lo rechaza" value={notas[c.id] ?? ""} onChange={(e) => setNotas({ ...notas, [c.id]: e.target.value })} aria-label="Motivo del rechazo" />
                <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" disabled={revisar.isPending} onClick={() => revisar.mutate({ id: c.id, estado: "rechazado", nota: notas[c.id] ?? "" })}>
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="inf-stack" style={{ gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
        <b>Aprobados ({aprobados.length})</b>
        {aprobados.length === 0 && <p className="inf-muted">Todavía no hay criterios adicionales.</p>}
        {aprobados.map((c) => (
          <div key={c.id} className="inf-row" style={{ justifyContent: "space-between" }}>
            <span>
              {c.nombre}
              <small className="inf-muted">
                {" "}
                · {ambito(c)} · {c.vigente_desde === null || c.vigente_desde <= ciclo.anio ? "rige ya" : `desde ${c.vigente_desde}`}
              </small>
            </span>
            <span className="inf-row">
              <button type="button" className="inf-link" onClick={() => revisar.mutate({ id: c.id, estado: "archivado" })}>
                Archivar
              </button>
              <button type="button" className="inf-link" onClick={() => window.confirm(`Borrar «${c.nombre}». Los indicadores ya escritos conservan su nombre.`) && borrar.mutate(c.id)}>
                Borrar
              </button>
            </span>
          </div>
        ))}
      </div>

      <form
        className="inf-stack"
        style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate({ nombre: f.nombre, descripcion: f.descripcion, plantillas: f.plantillas, vigente_desde: f.desde }, { onSuccess: () => setF({ ...f, nombre: "", descripcion: "" }) });
        }}
      >
        <b>Crear un criterio</b>
        <label className="inf-lab">
          Nombre
          <input className="inf-in" required minLength={3} maxLength={80} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </label>
        <label className="inf-lab">
          Para qué sirve (opcional)
          <input className="inf-in" maxLength={400} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </label>
        <div className="inf-row">
          {LETRAS.map((l) => (
            <label key={l} className="inf-chk">
              <input type="checkbox" checked={f.plantillas.includes(l)} onChange={(e) => setF({ ...f, plantillas: e.target.checked ? [...f.plantillas, l] : f.plantillas.filter((x) => x !== l) })} /> {PLANTILLAS[l].quien}
            </label>
          ))}
          <small className="inf-hint">Sin marcar: todas.</small>
        </div>
        <div className="inf-row">
          <label className="inf-lab" style={{ maxWidth: 150 }}>
            Rige desde
            <input className="inf-in inf-num" type="number" value={f.desde} onChange={(e) => setF({ ...f, desde: Number(e.target.value) })} />
          </label>
          <button type="submit" className="inf-btn inf-btn--pri" disabled={crear.isPending || lectura.data?.falta}>
            {crear.isPending ? "Creando…" : "Crear criterio"}
          </button>
        </div>
      </form>
      {error && (
        <p className="inf-error" role="alert">
          {mensajeDe(error)}
        </p>
      )}
    </section>
  );
}
