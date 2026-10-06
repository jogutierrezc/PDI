/* =============================================================================
   Intranet · UDES en Cifras — estaciones del periodo.

   El periodo avanza por cinco estaciones fijas: Periodo y campus, Estructura
   y KPI, Captura, Diseño visual y Publicación. La sexta, Boletín, arma con
   todo eso el documento A4 en PDF. La barra de arriba dice cuánto
   le falta a cada una; la lista de la izquierda marca cada informe en cada
   estación; a la derecha, la tira de vista previa muestra cómo quedará la
   ficha pública. Donde la estación necesita el ancho (Captura) o la pantalla
   no da para tres columnas, la vista previa pasa a un cajón que se abre desde
   la cabecera. Periodo, estación e informe viven en la URL:

     /admin/udes-en-cifras/captura/poblacional?periodo=<id>

   Vista «Taller»: convive con las estaciones («vista clásica»), que no se
   tocan. Es una sola pantalla donde se edita la ficha como la ve el público
   (ver taller/Taller.tsx). Se elige con el interruptor de la cabecera, que
   recuerda la elección en el navegador, y vive en la URL en el sitio de la
   estación:

     /admin/udes-en-cifras/taller/poblacional?periodo=<id>

   Un enlace a una estación abre siempre esa estación; la vista recordada solo
   decide cuando la dirección no nombra ninguna.
   ========================================================================== */

import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { roleLabels, useAuth } from "../../../lib/auth";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { moved, useReorder } from "../components/reorder";
import { BLOCK_LABELS } from "../../datos-abiertos/data/types";
import type { Report } from "../../datos-abiertos/data/types";
import { useCreateReport, useOdAdminData, useOdPeriods, useOdPublications, useReorderReports, useSaveReport } from "./od-data";
import { slugify } from "./ui";
import type { AdminData } from "./od-data";
import { periodProgress, reportProgress, STATIONS, statusLabels } from "./progress";
import type { MarkState, ReportProgress, StationId } from "./progress";
import { PeriodStation, FirstPeriod } from "./stations/PeriodStation";
import { useBulletins } from "../../boletin/data";
import { browserStorage, readView, writeView } from "./taller/draft";
import type { TallerView } from "./taller/draft";
import "./od-admin.css";

export interface StationProps {
  data: AdminData;
  report: Report | undefined;
  periodId: string;
  canEdit: boolean;
  progress: Map<string, ReportProgress>;
  /**
   * El taller monta un editor de Captura dentro de un bloque de la ficha: con
   * el id de un conjunto, el editor se acota a ese conjunto y no ofrece elegir
   * otro ni crear uno nuevo. Las estaciones clásicas no lo pasan.
   */
  only?: string;
}

/* Cada estación baja cuando se abre. Antes las seis viajaban con la pantalla:
   entrar a Captura traía también el documento del Boletín y sus gráficas
   (más de medio megabyte que esa estación no usa). «Periodo y campus» es
   pequeña y trae la pantalla del primer periodo: se queda en el trozo común. */
const stationLoaders = {
  estructura: () => import("./stations/StructureStation"),
  captura: () => import("./stations/CaptureStation"),
  diseno: () => import("./stations/DesignStation"),
  publicacion: () => import("./stations/PublishStation"),
  boletin: () => import("./stations/BulletinStation"),
};
const StructureStation = lazy(() => stationLoaders.estructura().then((m) => ({ default: m.StructureStation })));
const CaptureStation = lazy(() => stationLoaders.captura().then((m) => ({ default: m.CaptureStation })));
const DesignStation = lazy(() => stationLoaders.diseno().then((m) => ({ default: m.DesignStation })));
const PublishStation = lazy(() => stationLoaders.publicacion().then((m) => ({ default: m.PublishStation })));
const BulletinStation = lazy(() => stationLoaders.boletin().then((m) => ({ default: m.BulletinStation })));
// El taller también baja solo cuando se abre: trae los componentes del portal.
const loadTaller = () => import("./taller/Taller");
const Taller = lazy(() => loadTaller().then((m) => ({ default: m.Taller })));
const preloadTaller = () => void loadTaller().catch(() => undefined);

/** Segmento de la URL que abre el taller, en el sitio de la estación. */
const TALLER_SEGMENT = "taller";

/** Al apuntar o enfocar una estación se adelanta su descarga: el clic la encuentra lista. */
function preloadStation(id: StationId) {
  if (id !== "periodo") void stationLoaders[id]().catch(() => undefined);
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
  const { hasRole, canSeeReport, canEditReport, canEditPeriod, access, profile } = useAuth();
  // Un rol de área solo ve y escribe sus informes; lo común del periodo
  // (años, campus, informes nuevos) se le queda en lectura.
  const canEditAny = hasRole("planeacion");
  const canManagePeriod = canEditPeriod();

  const station = (STATIONS.find((s) => s.id === stationParam)?.id ?? "captura") as StationId;
  const isTaller = stationParam === TALLER_SEGMENT;
  /** La última estación clásica visitada: a ella se vuelve desde el taller. */
  const lastClassic = useRef<StationId>("captura");
  if (!isTaller && stationParam) lastClassic.current = station;
  const periods = useOdPeriods();
  const periodId = params.get("periodo") ?? periods.data?.find((p) => p.is_current)?.id ?? periods.data?.[0]?.id;
  const admin = useOdAdminData(periodId);
  const publications = useOdPublications(periodId);
  const bulletins = useBulletins(periodId);

  const full = admin.data ?? undefined;
  // La lista de informes que esta persona puede ver. Los ajenos no se enseñan:
  // no hay nada que hacer con ellos aquí.
  const data = useMemo(
    () =>
      full
        ? { ...full, catalog: { ...full.catalog, reports: full.catalog.reports.filter((r) => canSeeReport(r.slug)) } }
        : undefined,
    [full, canSeeReport],
  );
  const report = data?.catalog.reports.find((r) => r.slug === reportSlug) ?? data?.catalog.reports[0];
  const canEdit = report ? canEditReport(report.slug) : canEditAny;
  const currentStation = STATIONS.find((s) => s.id === station)!;
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewToggle = useRef<HTMLButtonElement>(null);
  const hasPreview = !isTaller && Boolean(report) && PREVIEW_STATIONS.includes(station);

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
  const tallerHref = (slug = report?.slug) => `/admin/udes-en-cifras/${TALLER_SEGMENT}${slug ? `/${slug}` : ""}${query}`;

  // Sin estación en la dirección decide la vista recordada: quien eligió el
  // taller vuelve a él. Un enlace a una estación abre siempre esa estación.
  const bare = !stationParam;
  useEffect(() => {
    if (bare && readView(browserStorage()) === "taller") navigate(`/admin/udes-en-cifras/${TALLER_SEGMENT}${query}`, { replace: true });
  }, [bare, navigate, query]);

  const chooseView = (view: TallerView) => {
    writeView(browserStorage(), view);
    if (view === "taller" && !isTaller) navigate(tallerHref());
    if (view === "clasica" && isTaller) navigate(hrefFor(lastClassic.current));
  };

  const viewSwitch = (
    <div className="odt-view" role="group" aria-label="Vista de UDES en Cifras" data-tour="odt-vista">
      <span className="odt-view__label" aria-hidden="true">Vista</span>
      <button type="button" aria-pressed={isTaller} onMouseEnter={preloadTaller} onFocus={preloadTaller} onClick={() => chooseView("taller")}>
        Taller
      </button>
      <button type="button" aria-pressed={!isTaller} onClick={() => chooseView("clasica")}>
        Clásica
      </button>
    </div>
  );

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
      title={isTaller ? "El taller" : currentStation.label}
      description={isTaller ? "La ficha del informe, editada como la ve el público" : currentStation.hint}
      actions={
        <>
          {viewSwitch}
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
      {!canEdit && (
        <ReadOnlyNotice>
          {!canEditAny
            ? `Tu rol${access ? ` «${access.role.name}»` : ""} tiene capacidad de ${roleLabels[profile?.role ?? "consulta"]}: consulta UDES en Cifras, no lo modifica. Para cargar y publicar informes, un administrador debe darle capacidad de Planeación en Usuarios y roles.`
            : "Tu rol no tiene asignado este informe: lo consultas, no lo modificas."}
        </ReadOnlyNotice>
      )}
      {canEdit && !canManagePeriod && !isTaller && station === "periodo" && (
        <p className="oda-banner" role="note">
          <Icon name="alert" size={16} />
          El periodo, sus campus y la creación de informes los administra Planeación. Aquí se consultan.
        </p>
      )}

      {periods.isPending || (periodId && admin.isPending) ? (
        <LoadingBlock rows={6} label="Cargando UDES en Cifras" />
      ) : periods.isError ? (
        <ErrorBlock error={periods.error} onRetry={() => void periods.refetch()} />
      ) : admin.isError ? (
        <ErrorBlock error={admin.error} onRetry={() => void admin.refetch()} />
      ) : !periodId || !data ? (
        <FirstPeriod canEdit={canEdit} />
      ) : isTaller ? (
        // El taller: la lista de informes de siempre y, en vez de las estaciones, la ficha que se edita.
        <div className="oda-workspace" data-station="taller">
          <ReportRail
            data={data}
            active={report?.slug}
            progress={progress}
            onPick={(slug) => navigate(tallerHref(slug))}
            station="captura"
            canEdit={canManagePeriod}
            onCreated={(slug) => navigate(tallerHref(slug))}
          />
          <section className="oda-stage" aria-label="El taller">
            <Suspense fallback={<LoadingBlock rows={6} label="Cargando el taller" />}>
              <Taller
                data={data}
                report={report}
                periodId={periodId}
                canEdit={canEdit}
                progress={progress}
                classicHref={(s, hash) => `${hrefFor(s)}${hash ? `#${hash}` : ""}`}
              />
            </Suspense>
          </section>
        </div>
      ) : (
        <>
          <StationBar
            station={station}
            data={data}
            progress={progress}
            hrefFor={hrefFor}
            bulletins={{ total: bulletins.data?.bulletins.length ?? 0, live: bulletins.data?.bulletins.filter((b) => b.status === "publicado").length ?? 0, editions: bulletins.data?.editions.length ?? 0 }}
          />

          <div className="oda-workspace" data-station={station}>
            <ReportRail
              data={data}
              active={report?.slug}
              progress={progress}
              onPick={(slug) => navigate(hrefFor(station === "periodo" ? "estructura" : station, slug))}
              station={station}
              canEdit={canManagePeriod}
              onCreated={(slug) => navigate(hrefFor("estructura", slug))}
            />

            <section className="oda-stage" aria-label={currentStation.label}>
              <Suspense fallback={<LoadingBlock rows={6} label={`Cargando ${currentStation.label}`} />}>
              {station === "periodo" && (
                <PeriodStation data={data} report={report} periodId={periodId} canEdit={canManagePeriod} progress={progress} />
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
              {station === "boletin" && (
                <BulletinStation data={data} report={report} periodId={periodId} canEdit={canEdit} progress={progress} />
              )}
              </Suspense>
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
  bulletins,
}: {
  station: StationId;
  data: AdminData;
  progress: Map<string, ReportProgress>;
  hrefFor: (station: StationId) => string;
  bulletins: { total: number; live: number; editions: number };
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
    boletin: {
      value: bulletins.total ? `${bulletins.total} ${bulletins.total === 1 ? "boletín" : "boletines"}` : "Sin crear",
      state: bulletins.total === 0 ? "vacio" : bulletins.live > 0 || bulletins.editions > 0 ? "ok" : "pendiente",
      detail: `${bulletins.live} en vivo · ${bulletins.editions} ${bulletins.editions === 1 ? "edición" : "ediciones"} en PDF`,
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
                onMouseEnter={() => preloadStation(s.id)}
                onFocus={() => preloadStation(s.id)}
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
  const reorder = useReorderReports();
  const [adding, setAdding] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [name, setName] = useState("");
  /** El orden que ya se ve mientras las once escrituras viajan. Sin esto la
   *  lista volvería un instante a su sitio anterior después de soltar. */
  const [pending, setPending] = useState<typeof data.catalog.reports | null>(null);
  const reports = pending ?? data.catalog.reports;

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = moved(reports, from, to);
    setPending(next);
    reorder.mutate(
      next.map((report, index) => ({ id: report.uuid ?? "", position: index + 1 })).filter((row) => row.id),
      { onSettled: () => setPending(null) },
    );
  };

  const drag = useReorder(reports.length, move);
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
        <strong>{reports.length} informes</strong>
        {/* Ordenar es un acto aparte: el carril de todos los días se queda
            limpio y las asas solo aparecen cuando se van a usar. */}
        {canEdit && (
          <button
            type="button"
            className="oda-link-button"
            aria-pressed={ordering}
            onClick={() => setOrdering((on) => !on)}
          >
            {ordering ? "Listo" : "Ordenar"}
          </button>
        )}
        {!ordering && (
          <span className="oda-rail__legend" aria-hidden="true">
            {STATIONS.map((s) => (
              <span key={s.id} title={s.label}>
                {s.number}
              </span>
            ))}
          </span>
        )}
      </div>

      {ordering && (
        <p className="oda-rail__hint">
          Arrastra por el asa, o usa las flechas. Este es el orden del tablero público.
        </p>
      )}
      <ul ref={list} data-ordering={ordering || undefined}>
        {reports.map((r, index) => {
          const p = progress.get(r.slug);
          const current = r.slug === active && station !== "periodo";
          if (ordering) {
            return (
              <li
                key={r.slug}
                ref={drag.setRow(index)}
                data-dragging={drag.dragging === index || undefined}
                data-drop={drag.marker === index ? "antes" : drag.marker === index + 1 && index === reports.length - 1 ? "despues" : undefined}
              >
                <div className="oda-rail__item oda-rail__item--order">
                  <span className="oda-grip" {...drag.handle(index, `Mover ${r.name}. Arrastra, o usa las flechas arriba y abajo.`)}>
                    <Icon name="grip" size={16} />
                  </span>
                  <span className="oda-code" style={{ "--line": `var(--od-line-${r.line})` } as CSSProperties}>
                    {r.code}
                  </span>
                  <span className="oda-rail__name">{r.name}</span>
                  <span className="oda-rail__order">
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === 0}
                      aria-label={`Subir ${r.name}`}
                      title="Subir"
                      onClick={() => move(index, index - 1)}
                    >
                      <Icon name="arrow-left" size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === reports.length - 1}
                      aria-label={`Bajar ${r.name}`}
                      title="Bajar"
                      onClick={() => move(index, index + 1)}
                    >
                      <Icon name="arrow-right" size={14} />
                    </button>
                  </span>
                </div>
              </li>
            );
          }
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
