/* =============================================================================
   Intranet · UDES en Cifras — estaciones del periodo.

   El periodo avanza por cinco estaciones fijas: Periodo y campus, Estructura
   y KPI, Captura, Diseño visual y Publicación. La barra de arriba dice cuánto
   le falta a cada una; la lista de la izquierda marca cada informe en cada
   estación; a la derecha, la tira de vista previa muestra cómo quedará la
   ficha pública. Donde la estación necesita el ancho (Captura) o la pantalla
   no da para tres columnas, la vista previa pasa a un cajón que se abre desde
   la cabecera. Periodo, estación e informe viven en la URL:

     /admin/udes-en-cifras/captura/poblacional?periodo=<id>
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useAuth } from "../../../lib/auth";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { BLOCK_LABELS } from "../../datos-abiertos/data/types";
import type { Report } from "../../datos-abiertos/data/types";
import { useCreateReport, useOdAdminData, useOdPeriods, useOdPublications } from "./od-data";
import { slugify } from "./ui";
import type { AdminData } from "./od-data";
import { periodProgress, reportProgress, STATIONS, statusLabels } from "./progress";
import type { MarkState, ReportProgress, StationId } from "./progress";
import { PeriodStation, FirstPeriod } from "./stations/PeriodStation";
import { StructureStation } from "./stations/StructureStation";
import { CaptureStation } from "./stations/CaptureStation";
import { DesignStation } from "./stations/DesignStation";
import { PublishStation } from "./stations/PublishStation";
import "./od-admin.css";

export interface StationProps {
  data: AdminData;
  report: Report | undefined;
  periodId: string;
  canEdit: boolean;
  progress: Map<string, ReportProgress>;
}

const MARK_LABEL: Record<MarkState, string> = { ok: "Completo", pendiente: "Pendiente", vacio: "Sin empezar" };

/** Estaciones que llevan vista previa de la ficha. */
const PREVIEW_STATIONS: StationId[] = ["estructura", "captura", "publicacion"];

/**
 * En una tira que se desplaza a lo ancho (móvil), deja a la vista el elemento
 * marcado. Mueve solo la tira: scrollIntoView arrastraría también la página.
 */
function useRevealCurrent<T extends HTMLElement>(selector: string, key: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const strip = ref.current;
    const item = strip?.querySelector<HTMLElement>(selector);
    if (!strip || !item || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2;
  }, [key, selector]);
  return ref;
}

export function OdAdmin() {
  const { station: stationParam, report: reportSlug } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canEdit = hasRole("planeacion");

  const station = (STATIONS.find((s) => s.id === stationParam)?.id ?? "captura") as StationId;
  const periods = useOdPeriods();
  const periodId = params.get("periodo") ?? periods.data?.find((p) => p.is_current)?.id ?? periods.data?.[0]?.id;
  const admin = useOdAdminData(periodId);
  const publications = useOdPublications(periodId);

  const data = admin.data ?? undefined;
  const report = data?.catalog.reports.find((r) => r.slug === reportSlug) ?? data?.catalog.reports[0];
  const currentStation = STATIONS.find((s) => s.id === station)!;
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewToggle = useRef<HTMLButtonElement>(null);
  const hasPreview = Boolean(report) && PREVIEW_STATIONS.includes(station);

  // Cambiar de estación o de informe cierra el cajón.
  useEffect(() => setPreviewOpen(false), [station, report?.slug]);

  const progress = useMemo(() => {
    const map = new Map<string, ReportProgress>();
    if (!data) return map;
    for (const r of data.catalog.reports) map.set(r.slug, reportProgress(r, data.rows, publications.data ?? []));
    return map;
  }, [data, publications.data]);

  const query = periodId && params.get("periodo") ? `?periodo=${periodId}` : "";
  const hrefFor = (s: StationId, slug = report?.slug) => `/admin/udes-en-cifras/${s}${slug ? `/${slug}` : ""}${query}`;

  const periodSelect = periods.data && periods.data.length > 0 && (
    <label className="oda-period-select">
      <span>Periodo</span>
      <select
        value={periodId}
        onChange={(event) => {
          const next = new URLSearchParams(params);
          next.set("periodo", event.target.value);
          setParams(next);
        }}
      >
        {periods.data.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
            {p.is_current ? " · vigente" : ""}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <AdminShell
      section="cifras"
      kicker="UDES en Cifras"
      title={currentStation.label}
      description={currentStation.hint}
      actions={
        <>
          {hasPreview && data && (
            <button
              ref={previewToggle}
              type="button"
              className="button-ghost oda-preview-toggle"
              data-station={station}
              aria-expanded={previewOpen}
              aria-controls="oda-vista-previa"
              aria-label="Vista previa de la ficha"
              onClick={() => setPreviewOpen((open) => !open)}
            >
              <Icon name="columns" size={15} />
              <span className="oda-label-long">Vista previa</span>
            </button>
          )}
          {periodSelect}
        </>
      }
    >
      {!canEdit && <ReadOnlyNotice />}

      {periods.isPending || (periodId && admin.isPending) ? (
        <LoadingBlock rows={6} label="Cargando UDES en Cifras" />
      ) : periods.isError ? (
        <ErrorBlock error={periods.error} onRetry={() => void periods.refetch()} />
      ) : admin.isError ? (
        <ErrorBlock error={admin.error} onRetry={() => void admin.refetch()} />
      ) : !periodId || !data ? (
        <FirstPeriod canEdit={canEdit} />
      ) : (
        <>
          <StationBar station={station} data={data} progress={progress} hrefFor={hrefFor} />

          <div className="oda-workspace" data-station={station}>
            <ReportRail
              data={data}
              active={report?.slug}
              progress={progress}
              onPick={(slug) => navigate(hrefFor(station === "periodo" ? "estructura" : station, slug))}
              station={station}
              canEdit={canEdit}
              onCreated={(slug) => navigate(hrefFor("estructura", slug))}
            />

            <section className="oda-stage" aria-label={currentStation.label}>
              {station === "periodo" && (
                <PeriodStation data={data} report={report} periodId={periodId} canEdit={canEdit} progress={progress} />
              )}
              {station === "estructura" && (
                <StructureStation data={data} report={report} periodId={periodId} canEdit={canEdit} progress={progress} />
              )}
              {station === "captura" && (
                <CaptureStation data={data} report={report} periodId={periodId} canEdit={canEdit} progress={progress} />
              )}
              {station === "diseno" && (
                <DesignStation data={data} report={report} periodId={periodId} canEdit={canEdit} progress={progress} />
              )}
              {station === "publicacion" && (
                <PublishStation data={data} report={report} periodId={periodId} canEdit={canEdit} progress={progress} />
              )}
            </section>

            {/* Columna fija en Estructura y Publicación cuando la pantalla da;
                cajón en Captura (la rejilla necesita el ancho) y en pantallas
                medianas. Diseño trae su propio esquema. */}
            {report && hasPreview && (
              <PreviewStrip
                report={report}
                progress={progress.get(report.slug)}
                open={previewOpen}
                onClose={() => {
                  setPreviewOpen(false);
                  previewToggle.current?.focus();
                }}
              />
            )}
          </div>
        </>
      )}
    </AdminShell>
  );
}

/* --- Barra de estaciones ------------------------------------------------------ */

function StationBar({
  station,
  data,
  progress,
  hrefFor,
}: {
  station: StationId;
  data: AdminData;
  progress: Map<string, ReportProgress>;
  hrefFor: (station: StationId) => string;
}) {
  const reports = Array.from(progress.values());
  const total = reports.length || 1;
  const period = periodProgress(data.rows);
  const filled = reports.reduce((s, p) => s + p.captura.filled, 0);
  const expected = reports.reduce((s, p) => s + p.captura.expected, 0);
  const strip = useRevealCurrent<HTMLOListElement>('[aria-current="step"]', station);

  const summary: Record<StationId, { value: string; state: MarkState; detail: string }> = {
    periodo: {
      value: period.state === "ok" ? "Listo" : `${period.issues.length} por resolver`,
      state: period.state,
      detail: `${data.rows.campuses.length} campus · ${data.rows.offices.length} oficinas`,
    },
    estructura: {
      value: `${reports.filter((p) => p.estructura.state === "ok").length} de ${total}`,
      state: reports.every((p) => p.estructura.state === "ok") ? "ok" : "pendiente",
      detail: "informes con indicadores y titular",
    },
    captura: {
      value: `${expected ? Math.round((filled / expected) * 100) : 0} %`,
      state: filled === 0 ? "vacio" : filled >= expected ? "ok" : "pendiente",
      detail: `${filled.toLocaleString("es-CO")} de ${expected.toLocaleString("es-CO")} casillas`,
    },
    diseno: {
      value: `${reports.filter((p) => p.diseno.state === "ok").length} de ${total}`,
      state: reports.every((p) => p.diseno.state === "ok") ? "ok" : "pendiente",
      detail: "fichas con bloques completos",
    },
    publicacion: {
      value: `${reports.filter((p) => p.publicacion.status === "publicado").length} de ${total}`,
      state: reports.every((p) => p.publicacion.state === "ok") ? "ok" : reports.some((p) => p.publicacion.status === "publicado") ? "pendiente" : "vacio",
      detail: data.rows.period.status === "publicado" ? "periodo publicado" : "periodo en borrador",
    },
  };

  return (
    <nav className="oda-stations" aria-label="Estaciones del periodo">
      <ol ref={strip}>
        {STATIONS.map((s) => {
          const info = summary[s.id];
          const pct = s.id === "captura" && expected ? Math.round((filled / expected) * 100) : null;
          return (
            <li key={s.id}>
              <NavLink
                to={hrefFor(s.id)}
                className="oda-station"
                aria-current={s.id === station ? "step" : undefined}
                data-state={info.state}
              >
                <span className="oda-station__number" aria-hidden="true">
                  {info.state === "ok" ? <Icon name="check" size={14} /> : s.number}
                </span>
                <span className="oda-station__text">
                  <span className="oda-station__label">{s.label}</span>
                  <span className="oda-station__value">
                    {info.value}
                    <span className="sr-only"> · {MARK_LABEL[info.state]}</span>
                  </span>
                  <span className="oda-station__detail">{info.detail}</span>
                </span>
                {pct !== null && (
                  <span className="oda-station__meter" aria-hidden="true">
                    <i style={{ width: `${pct}%` }} />
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* --- Lista de informes ---------------------------------------------------------- */

function Mark({ state, label }: { state: MarkState; label: string }) {
  return (
    <span className="oda-mark" data-state={state} title={`${label}: ${MARK_LABEL[state]}`}>
      {state === "ok" ? <Icon name="check" size={10} /> : state === "pendiente" ? <Icon name="alert" size={10} /> : null}
      <span className="sr-only">
        {label}: {MARK_LABEL[state]}
      </span>
    </span>
  );
}

function ReportRail({
  data,
  active,
  progress,
  onPick,
  station,
  canEdit,
  onCreated,
}: {
  data: AdminData;
  active: string | undefined;
  progress: Map<string, ReportProgress>;
  onPick: (slug: string) => void;
  station: StationId;
  canEdit: boolean;
  onCreated: (slug: string) => void;
}) {
  const period = periodProgress(data.rows);
  const create = useCreateReport();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const slug = slugify(name);
  const code = name
    .normalize("NFD")
    .replace(/[^A-Za-z ]/g, "")
    .trim()
    .split(/s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, "X");
  const taken = data.rows.reports.some((r) => r.slug === slug || r.code === code);
  const list = useRevealCurrent<HTMLUListElement>('[aria-current="true"]', active);
  return (
    <aside className="oda-rail" aria-label="Informes del periodo">
      <div className="oda-rail__head">
        <strong>{data.catalog.reports.length} informes</strong>
        <span className="oda-rail__legend" aria-hidden="true">
          {STATIONS.map((s) => (
            <span key={s.id} title={s.label}>
              {s.number}
            </span>
          ))}
        </span>
      </div>
      <ul ref={list}>
        {data.catalog.reports.map((r) => {
          const p = progress.get(r.slug);
          const current = r.slug === active && station !== "periodo";
          return (
            <li key={r.slug}>
              <button type="button" className="oda-rail__item" aria-current={current ? "true" : undefined} onClick={() => onPick(r.slug)}>
                <span className="oda-code" style={{ "--line": `var(--od-line-${r.line})` } as CSSProperties}>
                  {r.code}
                </span>
                <span className="oda-rail__name">
                  {r.name}
                  <small>
                    {statusLabels[r.status ?? "borrador"]}
                    {p && p.captura.expected > 0 ? ` · ${p.captura.pct} % cargado` : ""}
                  </small>
                </span>
                {p && (
                  <span className="oda-rail__marks">
                    <Mark state={period.state} label="Periodo" />
                    <Mark state={p.estructura.state} label="Estructura" />
                    <Mark state={p.captura.state} label="Captura" />
                    <Mark state={p.diseno.state} label="Diseño" />
                    <Mark state={p.publicacion.state} label="Publicación" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className="oda-rail__add">
          {adding ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!slug || taken) return;
                create.mutate(
                  { periodId: data.rows.period.id, name: name.trim(), slug, code, line: (data.rows.reports.length % 9) + 1, position: data.rows.reports.length + 1 },
                  { onSuccess: (created) => { setAdding(false); setName(""); onCreated(created as string); } },
                );
              }}
            >
              <label className="sr-only" htmlFor="oda-nuevo-informe">Nombre del informe nuevo</label>
              <input id="oda-nuevo-informe" autoFocus placeholder="Nombre del informe" value={name} onChange={(e) => setName(e.target.value)} />
              {name && <small>{taken ? "Ya existe un informe con ese código o nombre" : `Código ${code} · /${slug}`}</small>}
              <div>
                <button type="button" className="oda-link-button" onClick={() => setAdding(false)}>Cancelar</button>
                <button type="submit" className="button-secondary" disabled={!slug || taken || create.isPending}>Crear</button>
              </div>
            </form>
          ) : (
            <button type="button" className="oda-chip" onClick={() => setAdding(true)}>
              <Icon name="plus" size={13} /> Nuevo informe
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

/* --- Tira de vista previa ------------------------------------------------------- */

function PreviewStrip({
  report,
  progress,
  open,
  onClose,
}: {
  report: Report;
  progress: ReportProgress | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Abierto como cajón: el foco entra al cajón y Escape lo cierra.
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const blocks = (report.blocks ?? []).slice().sort((a, b) => a.position - b.position);
  const kpis = report.keyIndicators.map((id) => report.indicators.find((i) => i.id === id)).filter(Boolean);

  const blockName = (kind: (typeof blocks)[number]) => {
    if (kind.settings.title) return kind.settings.title;
    if (kind.kind === "mapa") return report.maps?.find((m) => m.id === kind.refKey)?.title ?? BLOCK_LABELS.mapa;
    if (kind.kind === "mapa_calor") return report.heatmaps?.find((h) => h.id === kind.refKey)?.title ?? BLOCK_LABELS.mapa_calor;
    return BLOCK_LABELS[kind.kind];
  };

  return (
    <>
    {open && <button type="button" className="oda-preview-scrim" aria-label="Cerrar vista previa" tabIndex={-1} onClick={onClose} />}
    <aside className="oda-preview" id="oda-vista-previa" data-open={open || undefined} aria-label={`Vista previa de ${report.name}`}>
      <button ref={closeButton} type="button" className="icon-button oda-preview__close" aria-label="Cerrar vista previa" onClick={onClose}>
        <Icon name="close" size={16} />
      </button>
      <div className="oda-preview__head">
        <span className="oda-code" style={{ "--line": `var(--od-line-${report.line})` } as CSSProperties}>
          {report.code}
        </span>
        <div>
          <strong>{report.name}</strong>
          <span data-status={report.status}>{statusLabels[report.status ?? "borrador"]}</span>
        </div>
      </div>

      <div className="oda-preview__section">
        <span className="oda-preview__label">Cifras clave</span>
        {kpis.length ? (
          <ol className="oda-preview__kpis">
            {kpis.map((kpi, index) => (
              <li key={kpi!.id} data-headline={index === 0 || undefined}>
                {kpi!.label}
              </li>
            ))}
          </ol>
        ) : (
          <p className="oda-preview__empty">Sin cifras clave. Márcalas en Estructura y KPI.</p>
        )}
      </div>

      <div className="oda-preview__section">
        <span className="oda-preview__label">Orden de la ficha</span>
        <ol className="oda-preview__blocks">
          {blocks.map((block, index) => (
            <li key={block.uuid ?? index} data-hidden={!block.visible || undefined}>
              <span aria-hidden="true">{index + 1}</span>
              {blockName(block)}
              {!block.visible && <small>oculto</small>}
            </li>
          ))}
        </ol>
      </div>

      {progress && (
        <dl className="oda-preview__facts">
          <div>
            <dt>Cargado</dt>
            <dd>{progress.captura.pct} %</dd>
          </div>
          <div>
            <dt>{progress.publicacion.status === "publicado" ? "Cambios ya visibles" : "Cambios"}</dt>
            <dd>{progress.publicacion.lastPublished ? progress.publicacion.changes : "—"}</dd>
          </div>
        </dl>
      )}

      <Link className="button-secondary oda-preview__open" to={`/datos-abiertos/${report.slug}?vista-previa`} target="_blank" rel="noreferrer">
        Abrir la ficha <Icon name="external" size={15} />
      </Link>
    </aside>
    </>
  );
}
