/* =============================================================================
   Intranet · Observatorio de Analítica — el taller.

   El mismo marco que las estaciones de UDES en Cifras, con otra prioridad: en
   el Observatorio mandan las tablas de datos y los visores, no los
   indicadores con meta. Cuatro estaciones:

     1 Captura de datos   importar Excel/CSV, analizar, anonimizar; tabla de
                          datos brutos y su vista gráfica.
     2 Diseño visual      el lienzo tipo Tableau/Power BI: campos, estantes,
                          galería de tipos con minivista y recomendación.
     3 Tableros           tipo de informe de cada tema, secciones y vista
                          previa de la página.
     4 Boletín            PDF a la medida: temas, años, periodos, fuentes y
                          tipos de dato.

   Tema y estación viven en la URL: /admin/observatorio/diseno/permanencia
   ========================================================================== */

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { OBS_STATIONS, type ObsStationId } from "./stations";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useAuth } from "../../../lib/auth";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { TOPICS, plural, topicConfig } from "./model";
import type { ObsState } from "./model";
import { useObsCommit, useObsState } from "./store";
import { CaptureStation } from "./stations/CaptureStation";
import { DesignStation } from "./stations/DesignStation";
import { BoardsStation } from "./stations/BoardsStation";
import { BulletinStation } from "./stations/BulletinStation";
import "../udes-en-cifras/od-admin.css";
import "../../datos-abiertos/datos-abiertos.css";
import "../../datos-abiertos/components/free-sets.css";
import "./obs-admin.css";


export interface ObsStationProps {
  state: ObsState;
  topic: string;
  canEdit: boolean;
  go: (station: ObsStationId, topic?: string, query?: string) => void;
}

export function ObsAdmin() {
  const { station: stationParam, topic: topicParam } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canEdit = hasRole("planeacion");
  const query = useObsState();
  const commit = useObsCommit();
  const station = (OBS_STATIONS.find((s) => s.id === stationParam)?.id ?? "captura") as ObsStationId;
  const topic = TOPICS.find((t) => t.slug === topicParam)?.slug ?? TOPICS[0].slug;
  const current = OBS_STATIONS.find((s) => s.id === station)!;
  const go = (s: ObsStationId, t = topic, q = "") => navigate(`/admin/observatorio/${s}/${t}${q ? `?${q}` : ""}`);

  return (
    <AdminShell section="observatorio" kicker="Observatorio de Analítica" title={current.label} description={current.hint}>
      {!canEdit && <ReadOnlyNotice>Tu rol consulta el Observatorio; para importar datos y armar visores hace falta capacidad de Planeación.</ReadOnlyNotice>}

      {query.isPending ? (
        <LoadingBlock rows={6} label="Cargando el Observatorio" />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.mode === "local" && (
            <p className="obs-mode" role="note">
              <Icon name="alert" size={16} />
              <span>
                <strong>Borrador local.</strong> La base todavía no tiene las tablas del Observatorio (migración <code>0049_observatorio.sql</code>): lo que armes aquí vive en este navegador y no llega al portal. Trae los catorce temas con datos de ejemplo para probar el taller.
              </span>
              {canEdit && (
                <button type="button" className="oda-link-button" onClick={() => commit.mutate({ kind: "reset-local" })}>
                  Restablecer el ejemplo
                </button>
              )}
            </p>
          )}

          <ObsStationBar station={station} topic={topic} state={query.data} />

          <div className="oda-workspace obs-workspace" data-station={station}>
            {station !== "diseno" && station !== "boletin" && <TopicRail state={query.data} active={topic} onPick={(slug) => go(station, slug)} />}
            <section className="oda-stage" aria-label={current.label}>
              {station === "captura" && <CaptureStation state={query.data} topic={topic} canEdit={canEdit} go={go} />}
              {station === "diseno" && <DesignStation state={query.data} topic={topic} canEdit={canEdit} go={go} />}
              {station === "tableros" && <BoardsStation state={query.data} topic={topic} canEdit={canEdit} go={go} />}
              {station === "boletin" && <BulletinStation state={query.data} topic={topic} canEdit={canEdit} go={go} />}
            </section>
          </div>
        </>
      )}
    </AdminShell>
  );
}

/* --- Barra de estaciones ------------------------------------------------------------ */

function ObsStationBar({ station, topic, state }: { station: ObsStationId; topic: string; state: ObsState }) {
  const real = state.datasets.filter((d) => !d.sample);
  const topicsWithData = new Set(state.datasets.map((d) => d.topic)).size;
  const topicsWithViews = new Set(state.views.filter((v) => v.visible).map((v) => v.topic)).size;
  const published = state.topics.filter((t) => t.status === "publicado").length;
  const summary: Record<ObsStationId, { value: string; detail: string; state: "ok" | "pendiente" | "vacio" }> = {
    captura: {
      value: plural(state.datasets.length, "tabla", "tablas"),
      detail: `${topicsWithData} de ${TOPICS.length} temas · ${real.length} con datos reales`,
      state: topicsWithData === 0 ? "vacio" : topicsWithData >= TOPICS.length ? "ok" : "pendiente",
    },
    diseno: {
      value: plural(state.views.length, "visor", "visores"),
      detail: `${topicsWithViews} de ${TOPICS.length} temas con visores`,
      state: state.views.length === 0 ? "vacio" : topicsWithViews >= TOPICS.length ? "ok" : "pendiente",
    },
    tableros: {
      value: `${published} de ${TOPICS.length}`,
      detail: "temas publicados",
      state: published === 0 ? "vacio" : published >= TOPICS.length ? "ok" : "pendiente",
    },
    boletin: {
      value: state.bulletins.length ? plural(state.bulletins.length, "boletín", "boletines") : "Sin crear",
      detail: "recortes guardados para PDF",
      state: state.bulletins.length ? "ok" : "vacio",
    },
  };
  return (
    <nav className="oda-stations obs-stations" aria-label="Estaciones del Observatorio">
      <ol>
        {OBS_STATIONS.map((s) => {
          const info = summary[s.id];
          return (
            <li key={s.id}>
              <NavLink to={`/admin/observatorio/${s.id}/${topic}`} className="oda-station" aria-current={s.id === station ? "step" : undefined} data-state={info.state}>
                <span className="oda-station__number" aria-hidden="true">
                  {info.state === "ok" ? <Icon name="check" size={14} /> : s.number}
                </span>
                <span className="oda-station__text">
                  <span className="oda-station__label">{s.label}</span>
                  <span className="oda-station__value">{info.value}</span>
                  <span className="oda-station__detail">{info.detail}</span>
                </span>
              </NavLink>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* --- Temas -------------------------------------------------------------------------------- */

function TopicRail({ state, active, onPick }: { state: ObsState; active: string; onPick: (slug: string) => void }) {
  const counts = useMemo(() => {
    const map = new Map<string, { tables: number; views: number; sample: boolean }>();
    for (const t of TOPICS) map.set(t.slug, { tables: 0, views: 0, sample: false });
    for (const d of state.datasets) {
      const c = map.get(d.topic);
      if (c) {
        c.tables += 1;
        if (d.sample) c.sample = true;
      }
    }
    for (const v of state.views) {
      const c = map.get(v.topic);
      if (c) c.views += 1;
    }
    return map;
  }, [state]);
  return (
    <aside className="oda-rail obs-rail" aria-label="Temas del Observatorio">
      <div className="oda-rail__head">
        <strong>{TOPICS.length} temas</strong>
        <span className="obs-rail__legend">tablas · visores</span>
      </div>
      <ul>
        {TOPICS.map((t) => {
          const c = counts.get(t.slug)!;
          const config = topicConfig(state, t.slug);
          return (
            <li key={t.slug}>
              <button type="button" className="oda-rail__item" aria-current={t.slug === active ? "true" : undefined} onClick={() => onPick(t.slug)}>
                <span className="oda-code" style={{ "--line": `var(--od-line-${t.line})` } as CSSProperties}>
                  {t.code}
                </span>
                <span className="oda-rail__name">
                  {t.name}
                  <small>
                    {config.status === "publicado" ? "Publicado" : "Borrador"}
                    {c.sample ? " · ejemplo" : ""}
                  </small>
                </span>
                <span className="obs-rail__counts" aria-label={`${c.tables} tablas, ${c.views} visores`}>
                  <b data-empty={c.tables === 0 || undefined}>{c.tables}</b>
                  <b data-empty={c.views === 0 || undefined}>{c.views}</b>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/** Selector compacto de tema, para las estaciones que necesitan el ancho. */
export function TopicSelect({ value, onChange, label = "Tema" }: { value: string; onChange: (slug: string) => void; label?: string }) {
  return (
    <label className="obs-select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {TOPICS.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.code} · {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
