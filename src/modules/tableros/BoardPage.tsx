/* =============================================================================
   Un tablero, leído.

   Es una página del portal público, con su misma cabecera y sus mismos
   componentes. Lo único que la distingue de una pública de verdad es la franja
   que dice a quién responde, y que sin sesión no devuelve nada.

   Y ahí está lo importante: la guarda de sesión solo evita enseñar una
   pantalla vacía. Lo que protege es RLS — un tablero de una unidad no entrega
   ni una fila a quien no es de ella. Por eso la dirección no cambia al
   publicar: es la misma, y lo que cambia es a quién le responde la base.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PlanLayout } from "../planeacion/PlanLayout";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../lib/auth";
import { ObsChart } from "../admin/observatorio/ObsCharts";
// El marco de UDES en Cifras trae la descarga en PNG y JPG con su sello de
// procedencia. No se rehace aquí: una gráfica de un tablero se descarga
// igual que una del portal estadístico, y con el nombre de su unidad.
import { ChartFrame } from "../datos-abiertos/components/ChartFrame";
import { freeSetToTable } from "../datos-abiertos/data/csv-export";
import { slugify } from "../datos-abiertos/data/slug";
import type { ObsChartType, ObsDataset, ObsView } from "../admin/observatorio/model";
import { UNIT_KIND, VISIBILITY } from "./model";
import type { BoardDataset } from "./model";
import { useBoardBySlug } from "./store";
import "../admin/udes-en-cifras/od-admin.css";
import "../datos-abiertos/datos-abiertos.css";
import "../datos-abiertos/components/free-sets.css";
import "../admin/observatorio/obs-admin.css";
import "./tableros.css";

const asObsDataset = (d: BoardDataset): ObsDataset => ({
  id: d.id,
  topic: "",
  title: d.title,
  description: d.description,
  source: d.source,
  dataType: d.dataType,
  temporality: d.temporality,
  periodLabel: d.periodLabel,
  columns: d.columns,
  rows: d.rows,
  anonymization: d.anonymization,
  sample: false,
  status: "publicado",
  position: d.position,
  updatedAt: d.updatedAt,
});

export function BoardPage() {
  const { unidad, tablero } = useParams<{ unidad: string; tablero: string }>();
  const { session, loading } = useAuth();
  const query = useBoardBySlug(unidad, tablero);
  const [page, setPage] = useState<string | null>(null);

  const board = query.data?.board ?? null;
  const unit = query.data?.unit ?? null;
  const datasets = query.data?.datasets ?? [];
  const views = useMemo(
    () => (query.data?.views ?? []).filter((v) => v.visible).sort((a, b) => a.position - b.position),
    [query.data],
  );

  const current = page ?? board?.pages[0]?.slug ?? "panorama";
  const shown = views.filter((v) => v.page === current);
  // Varias vistas pueden leer la misma tabla: su CSV es uno, y lo ofrece solo la primera de la página.
  const firstOfDataset = new Map<string, string>();
  for (const view of shown) {
    if (!firstOfDataset.has(view.datasetId) && datasets.some((d) => d.id === view.datasetId)) firstOfDataset.set(view.datasetId, view.id);
  }
  const pagesWithViews = (board?.pages ?? []).filter((p) => views.some((v) => v.page === p.slug));

  return (
    <PlanLayout title={`${board?.title ?? "Tablero"} · ${unit?.name ?? "Planeación Institucional"}`}>
      <div className="tb-page">
        {query.isPending || loading ? (
          <div className="pl-container">
            <p className="admin-loading">Cargando el tablero…</p>
          </div>
        ) : !board ? (
          <Locked signedIn={Boolean(session)} unitName={unit?.name} />
        ) : (
          <>
            {board.visibility !== "publico" && (
              <div className="tb-band">
                <div className="pl-container">
                  <Icon name={board.visibility === "unidad" ? "lock" : "user"} size={16} />
                  <strong>{board.visibility === "unidad" ? "Tablero interno." : "Tablero de la universidad."}</strong>
                  <span>
                    {board.visibility === "unidad"
                      ? `Lo ven quienes pertenecen a ${unit?.name}, y la Oficina de Planeación.`
                      : "Lo ve cualquiera de la universidad con su sesión abierta."}{" "}
                    No sale en buscadores ni se abre sin sesión.
                  </span>
                </div>
              </div>
            )}

            <div className="pl-container tb-page__body">
              <header className="tb-page__head">
                <div>
                  <h1>{board.title}</h1>
                  {board.description && <p>{board.description}</p>}
                </div>
                <p className="tb-page__owner">
                  {unit?.name}
                  {unit && <span> · {UNIT_KIND[unit.kind].label}</span>}
                </p>
              </header>

              {pagesWithViews.length > 1 && (
                <nav className="tb-page__tabs" aria-label="Páginas del tablero">
                  {pagesWithViews.map((p) => (
                    <button key={p.slug} type="button" aria-current={p.slug === current} onClick={() => setPage(p.slug)}>
                      {p.title}
                    </button>
                  ))}
                </nav>
              )}

              {shown.length === 0 ? (
                <p className="tb-prose">Este tablero todavía no tiene nada a la vista.</p>
              ) : (
                <div className="tb-page__grid">
                  {shown.map((view) => {
                    const dataset = datasets.find((d) => d.id === view.datasetId);
                    if (!dataset) return null;
                    const spec = view.spec as Partial<ObsView> & { type?: ObsChartType };
                    const drawable = {
                      ...spec,
                      type: (spec.type ?? "barras") as ObsChartType,
                      title: (spec.title as string) ?? dataset.title,
                    } as Parameters<typeof ObsChart>[0]["view"];
                    const title = (spec.title as string) ?? dataset.title;
                    return (
                      <div key={view.id} className="tb-page__view" data-size={view.size}>
                        <ChartFrame
                          title={title}
                          source={dataset.source || undefined}
                          exportName={`${unit?.slug ?? "tablero"}-${title}`}
                          stamp={unit?.name ?? board.title}
                          csv={
                            firstOfDataset.get(view.datasetId) === view.id
                              ? {
                                  files: [{ filename: `${slugify(unit?.name ?? board.title)}-${slugify(dataset.title, "datos")}.csv`, build: () => freeSetToTable(dataset) }],
                                  name: dataset.title,
                                }
                              : undefined
                          }
                        >
                          <ObsChart dataset={asObsDataset(dataset)} view={drawable} />
                        </ChartFrame>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PlanLayout>
  );
}

/**
 * La misma dirección, sin permiso.
 *
 * No se distingue «no existe» de «no te toca», y está bien que no se
 * distinga: decirlo sería confirmar que existe un tablero de esa unidad con
 * ese nombre a quien no debería saberlo.
 */
function Locked({ signedIn, unitName }: { signedIn: boolean; unitName?: string }) {
  return (
    <div className="pl-container tb-locked">
      <h1>{signedIn ? "Este tablero no es tuyo" : "Entra para ver este tablero"}</h1>
      <p>
        {signedIn
          ? `Si trabajas en ${unitName ?? "esa unidad"}, pídele acceso a su jefatura: quien la dirige reparte los papeles de su gente.`
          : "Es un tablero interno. Entra con tu cuenta de la universidad; si no perteneces a esa unidad, pídele acceso a su jefatura."}
      </p>
      {!signedIn && (
        <Link to="/intranet" className="button-primary">
          Entrar
        </Link>
      )}
    </div>
  );
}
