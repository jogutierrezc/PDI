/* =============================================================================
   Estación 5 · Publicación.

   Qué hace y qué no hace, dicho sin rodeos:
   · Un informe en borrador se publica aquí después de revisar lo que le
     falta y la vista previa. Esa es la prueba antes de fijar.
   · Un informe ya publicado no tiene cifras en espera: solo Planeación edita
     y lo que guarda se ve en el portal de inmediato. Por eso la revisión lo
     llama "cambios desde la última publicación · ya visibles", y quien quiera
     cargar sin exponer las cifras pasa el informe a borrador primero.
   · Todo cambio de visibilidad (publicar, retirar, cambiar el estado desde la
     tabla) pide confirmar en el mismo sitio y nombra la consecuencia.
   Cada paso queda en la bitácora (od_publications, que escribe un disparador
   de la base, venga el cambio de donde venga).
   ========================================================================== */

import { useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { formatValue } from "../../../datos-abiertos/data/open-data";
import type { PublicationStatus } from "../../../../types/database";
import type { StationProps } from "../OdAdmin";
import { useOdPublications, useSavePeriod, useSetReportStatus } from "../od-data";
import { statusLabels } from "../progress";
import { Panel, SaveState } from "../ui";

const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });
const PAGE = 30;

/** Qué pasa en el portal al cambiar de un estado a otro. */
function consequence(name: string, from: PublicationStatus | undefined, to: PublicationStatus, periodPublished: boolean) {
  const visibleBefore = from === "publicado";
  const visibleAfter = to === "publicado";
  if (!visibleBefore && visibleAfter) {
    return periodPublished
      ? `${name} empieza a verse en el portal con todas sus cifras cargadas.`
      : `${name} queda publicado, pero no se verá hasta publicar el periodo.`;
  }
  if (visibleBefore && !visibleAfter) return `${name} deja de verse en el portal.`;
  return `${name} sigue sin verse en el portal.`;
}

interface PendingChange {
  id: string;
  name: string;
  from: PublicationStatus | undefined;
  to: PublicationStatus;
}

export function PublishStation({ data, report, periodId, canEdit, progress }: StationProps) {
  const setStatus = useSetReportStatus();
  const savePeriod = useSavePeriod();
  const publications = useOdPublications(periodId);
  const period = data.rows.period;
  const periodPublished = period.status === "publicado";
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [confirmPeriod, setConfirmPeriod] = useState(false);

  const selected = report?.uuid ? progress.get(report.slug) : undefined;
  const indicatorIds = new Set(data.rows.indicators.filter((i) => i.report_id === report?.uuid).map((i) => i.id));
  const changed = selected?.publicacion.lastPublished
    ? data.rows.values
        .filter((v) => indicatorIds.has(v.indicator_id) && v.updated_at && v.updated_at > selected.publicacion.lastPublished!)
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    : [];
  const shown = showAll ? changed : changed.slice(0, PAGE);
  const campusName = (id: string | null) => (id === null ? "Total" : data.rows.campuses.find((c) => c.campus_id === id)?.label ?? "Campus");
  const indicatorOf = (id: string) => data.rows.indicators.find((i) => i.id === id);
  const blocking = selected ? [...selected.estructura.issues, ...selected.diseno.issues] : [];
  // El texto sigue el estado real del informe, no la bitácora: un informe puede
  // estar publicado sin registro (cargado por migración o antes de la bitácora).
  const live = report?.status === "publicado";

  const ask = (id: string, name: string, from: PublicationStatus | undefined, to: PublicationStatus) => {
    if (from === to) return;
    setPending({ id, name, from, to });
  };
  const confirm = () => {
    if (!pending) return;
    setStatus.mutate({ id: pending.id, status: pending.to }, { onSuccess: () => setPending(null) });
  };

  const confirmBox = (change: PendingChange) => (
    <div className="oda-confirm-box" role="alertdialog" aria-labelledby="oda-confirm-title" aria-describedby="oda-confirm-text">
      <Icon name="alert" size={16} />
      <div>
        <strong id="oda-confirm-title">
          ¿Cambiar {change.name} de {statusLabels[change.from ?? "borrador"].toLowerCase()} a {statusLabels[change.to].toLowerCase()}?
        </strong>
        <p id="oda-confirm-text">{consequence(change.name, change.from, change.to, periodPublished)}</p>
      </div>
      <div className="oda-confirm-box__actions">
        <button type="button" className="button-ghost" onClick={() => setPending(null)}>
          Cancelar
        </button>
        <button type="button" className="button-primary" disabled={setStatus.isPending} onClick={confirm} autoFocus>
          Sí, {change.to === "publicado" ? "publicar" : change.from === "publicado" ? "retirar" : "cambiar"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="oda-stack">
      {!periodPublished && (
        <div className="oda-banner" role="note">
          <Icon name="alert" size={16} />
          <span>El periodo {period.label} está en borrador: el portal no muestra ningún informe hasta publicarlo.</span>
          {canEdit &&
            (confirmPeriod ? (
              <span className="oda-inline-confirm">
                ¿Publicar el periodo? Los informes publicados empiezan a verse.
                <button type="button" className="oda-link-button" onClick={() => setConfirmPeriod(false)}>Cancelar</button>
                <button type="button" className="button-primary" onClick={() => savePeriod.mutate({ id: period.id, patch: { status: "publicado" } }, { onSuccess: () => setConfirmPeriod(false) })}>
                  Sí, publicar periodo
                </button>
              </span>
            ) : (
              <button type="button" className="oda-link-button" onClick={() => setConfirmPeriod(true)}>
                Publicar periodo
              </button>
            ))}
        </div>
      )}

      {report?.uuid && selected && (
        <Panel
          id="oda-revision"
          title={`Revisar ${report.name}`}
          description={
            report.status === "publicado"
              ? `Visible en el portal${selected.publicacion.lastPublished ? ` desde el ${dateTime.format(new Date(selected.publicacion.lastPublished))}` : ""}. Lo que se guarde en Captura se ve de inmediato.`
              : "En borrador: revisa lo que falta y la vista previa antes de publicarlo."
          }
          actions={
            <>
              <SaveState pending={setStatus.isPending} error={setStatus.error} success={setStatus.isSuccess} />
              <Link className="button-ghost" to={`/datos-abiertos/${report.slug}?vista-previa`} target="_blank" rel="noreferrer">
                Vista previa <Icon name="external" size={15} />
              </Link>
              {report.status === "publicado" ? (
                <button type="button" className="button-secondary" disabled={!canEdit || setStatus.isPending} onClick={() => ask(report.uuid!, report.name, report.status, "borrador")}>
                  Retirar del portal
                </button>
              ) : (
                <button type="button" className="button-primary" disabled={!canEdit || setStatus.isPending} onClick={() => ask(report.uuid!, report.name, report.status, "publicado")}>
                  Publicar informe
                </button>
              )}
            </>
          }
        >
          {pending && pending.id === report.uuid && confirmBox(pending)}

          <div className="oda-review">
            <div className="oda-review__checks">
              <span className="oda-review__label">{live ? "Estado actual" : "Antes de publicar"}</span>
              <ul>
                <li data-state={selected.captura.state}>
                  <Icon name={selected.captura.pct === 100 ? "check" : "alert"} size={14} />
                  {selected.captura.pct} % de las casillas cargadas ({selected.captura.filled} de {selected.captura.expected})
                </li>
                {blocking.length === 0 ? (
                  <li data-state="ok"><Icon name="check" size={14} /> Estructura y diseño completos</li>
                ) : (
                  blocking.map((issue) => (
                    <li key={issue} data-state="pendiente"><Icon name="alert" size={14} /> {issue}</li>
                  ))
                )}
                <li data-state={period.illustrative ? "pendiente" : "ok"}>
                  <Icon name={period.illustrative ? "alert" : "check"} size={14} />
                  {period.illustrative ? 'El periodo sale marcado como "cifras ilustrativas"' : "Cifras marcadas como oficiales"}
                </li>
              </ul>
            </div>

            <div className="oda-review__diff">
              <span className="oda-review__label">
                {!selected.publicacion.lastPublished
                  ? "Cambios"
                  : live
                    ? `Cambios desde la última publicación · ya visibles en el portal (${changed.length})`
                    : `Cambios desde la última publicación (${changed.length})`}
              </span>
              {!selected.publicacion.lastPublished ? (
                <p className="oda-muted">
                  {live
                    ? "Visible en el portal, pero aún sin registro en la bitácora: no hay una publicación contra la cual listar cambios. Lo que se guarde en Captura se ve de inmediato."
                    : "Al publicar por primera vez, todas las cifras cargadas pasan al portal."}
                </p>
              ) : changed.length === 0 ? (
                <p className="oda-muted">Ninguna cifra cambió desde entonces.</p>
              ) : (
                <>
                  <table className="oda-table">
                    <thead>
                      <tr><th scope="col">Indicador</th><th scope="col">Campus</th><th scope="col">Año</th><th scope="col">Valor</th></tr>
                    </thead>
                    <tbody>
                      {shown.map((v) => {
                        const indicator = indicatorOf(v.indicator_id);
                        return (
                          <tr key={`${v.indicator_id}-${v.year}-${v.campus_id}`}>
                            <th scope="row">{indicator?.label}</th>
                            <td>{campusName(v.campus_id)}</td>
                            <td>{v.year}</td>
                            <td data-changed>{formatValue(v.value === null ? null : Number(v.value), indicator?.format ?? "entero")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {changed.length > PAGE && (
                    <p className="oda-review__more">
                      Se muestran {shown.length} de {changed.length} cambios.
                      <button type="button" className="oda-link-button" onClick={() => setShowAll(!showAll)}>
                        {showAll ? "Mostrar menos" : "Mostrar todos"}
                      </button>
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </Panel>
      )}

      <Panel
        id="oda-estado"
        title="Estado de los informes"
        description="Borrador y en revisión: solo la intranet los ve. Publicado: el portal lo muestra si el periodo también está publicado. Cada cambio pide confirmar."
      >
        {pending && pending.id !== report?.uuid && confirmBox(pending)}
        <table className="oda-table">
          <thead>
            <tr>
              <th scope="col">Informe</th>
              <th scope="col">Cargado</th>
              <th scope="col">Cambios desde la última publicación</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.catalog.reports.map((r) => {
              const p = progress.get(r.slug);
              const waiting = pending?.id === r.uuid;
              return (
                <tr key={r.slug} data-selected={r.slug === report?.slug || undefined}>
                  <th scope="row">
                    <Link className="oda-row-link" to={`/admin/udes-en-cifras/publicacion/${r.slug}`}>
                      <span className="oda-code" style={{ "--line": `var(--od-line-${r.line})` } as CSSProperties}>{r.code}</span>
                      {r.name}
                    </Link>
                  </th>
                  <td>
                    <span className="oda-meter" aria-hidden="true"><i style={{ width: `${p?.captura.pct ?? 0}%` }} /></span>
                    {p?.captura.pct ?? 0} %
                  </td>
                  <td>{p?.publicacion.lastPublished ? `${p.publicacion.changes}${r.status === "publicado" && p.publicacion.changes ? " · ya visibles" : ""}` : "—"}</td>
                  <td>
                    <label className="sr-only" htmlFor={`estado-${r.slug}`}>Estado de {r.name}</label>
                    <select
                      id={`estado-${r.slug}`}
                      className="oda-status-select"
                      data-status={waiting ? pending!.to : r.status}
                      value={waiting ? pending!.to : r.status}
                      disabled={!canEdit || setStatus.isPending}
                      onChange={(e) => ask(r.uuid!, r.name, r.status, e.target.value as PublicationStatus)}
                    >
                      {(["borrador", "revision", "publicado", "archivado"] as PublicationStatus[]).map((s) => (
                        <option key={s} value={s}>{statusLabels[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel id="oda-bitacora" title="Bitácora de publicación" tone="quiet">
        {(publications.data ?? []).length === 0 ? (
          <p className="oda-muted">Aún no hay publicaciones registradas en este periodo.</p>
        ) : (
          <ol className="oda-log">
            {(publications.data ?? []).slice(0, 12).map((entry) => {
              const r = data.rows.reports.find((x) => x.id === entry.report_id);
              return (
                <li key={entry.id}>
                  <span className="oda-badge" data-tone={entry.action === "publicado" ? "ok" : "warn"}>
                    {entry.action === "publicado" ? "Publicado" : "Retirado"}
                  </span>
                  <strong>{r?.name ?? "Informe eliminado"}</strong>
                  <time dateTime={entry.published_at}>{dateTime.format(new Date(entry.published_at))}</time>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}
