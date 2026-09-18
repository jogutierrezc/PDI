/* =============================================================================
   Observatorio · 4 Boletín.

   Un boletín en PDF a la medida: se eligen temas, años, periodos, fuentes y
   tipos de dato; el contenido se recalcula al instante (cuántos temas,
   tablas y visores entran) y el documento se abre aparte, en A4, para
   imprimirlo o guardarlo como PDF desde el navegador.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { Panel, SaveState } from "../../udes-en-cifras/ui";
import type { ObsStationProps } from "../ObsAdmin";
import { ChartThumb } from "../ObsCharts";
import { bulletinContent, describeFilters, emptyBulletin, filterOptions } from "../bulletin";
import { DATA_TYPE_LABEL, SECTION_LABEL, TOPICS, newId, plural, topicInfo } from "../model";
import type { ObsBulletin, ObsBulletinFilters, ObsDataType } from "../model";
import { useObsCommit } from "../store";

const dateFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });

export function BulletinStation({ state, canEdit }: ObsStationProps) {
  const [activeId, setActiveId] = useState<string | null>(state.bulletins[0]?.id ?? null);
  const saved = state.bulletins.find((b) => b.id === activeId);
  const [draft, setDraft] = useState<ObsBulletin>(() => saved ?? emptyBulletin(newId()));
  const [confirming, setConfirming] = useState(false);
  const commit = useObsCommit();

  useEffect(() => {
    setDraft(saved ?? emptyBulletin(newId()));
    setConfirming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const options = useMemo(() => filterOptions(state), [state]);
  const content = useMemo(() => bulletinContent(state, draft.filters), [state, draft.filters]);
  const tables = content.reduce((n, t) => n + t.datasets.size, 0);
  const views = content.reduce((n, t) => n + t.views.length, 0);
  const dirty = !saved || JSON.stringify({ ...saved, updatedAt: "" }) !== JSON.stringify({ ...draft, updatedAt: "" });

  const setFilter = <K extends keyof ObsBulletinFilters>(key: K, value: ObsBulletinFilters[K]) => setDraft((d) => ({ ...d, filters: { ...d.filters, [key]: value } }));
  const toggleIn = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const save = () =>
    commit.mutate(
      { kind: "bulletin", value: draft },
      { onSuccess: () => setActiveId(draft.id) },
    );

  const chips = <T extends string | number>(label: string, all: T[], selected: T[], onChange: (next: T[]) => void, render: (v: T) => string = String) => (
    <fieldset className="obs-filter">
      <legend>
        {label}
        <small>{selected.length ? `${selected.length} de ${all.length}` : "Todos"}</small>
      </legend>
      {all.length ? (
        <div className="obs-filter__chips">
          <button type="button" className="obs-filter__all" aria-pressed={selected.length === 0} disabled={!canEdit} onClick={() => onChange([])}>
            Todos
          </button>
          {all.map((v) => (
            <button key={String(v)} type="button" aria-pressed={selected.includes(v)} disabled={!canEdit} onClick={() => onChange(toggleIn(selected, v))}>
              {render(v)}
            </button>
          ))}
        </div>
      ) : (
        <p className="obs-filter__none">Las tablas cargadas no traen {label.toLowerCase()}.</p>
      )}
    </fieldset>
  );

  return (
    <div className="obs-bulletin">
      <aside className="obs-bulletin__list" aria-label="Boletines guardados">
        <div className="oda-rail__head">
          <strong>{plural(state.bulletins.length, "boletín", "boletines")}</strong>
        </div>
        <ul>
          {state.bulletins.map((b) => (
            <li key={b.id}>
              <button type="button" className="oda-rail__item" aria-current={b.id === activeId ? "true" : undefined} onClick={() => setActiveId(b.id)}>
                <Icon name="document" size={16} />
                <span className="oda-rail__name">
                  {b.title}
                  <small>{describeFilters(b.filters)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="oda-rail__add">
            <button type="button" className="oda-chip" onClick={() => setActiveId(null)} aria-pressed={!saved}>
              <Icon name="plus" size={13} /> Nuevo boletín
            </button>
          </div>
        )}
      </aside>

      <div className="oda-stack">
        <Panel
          id="obs-boletin"
          title={saved ? saved.title : "Nuevo boletín"}
          description={saved ? `Guardado el ${dateFmt.format(new Date(saved.updatedAt))}.` : "Elige el recorte y guárdalo para abrir el PDF."}
          actions={
            <div className="obs-detail__actions">
              {canEdit && <SaveState pending={commit.isPending} error={commit.error} success={commit.isSuccess} />}
              {canEdit && (
                <button type="button" className="button-secondary" disabled={!dirty || !draft.title.trim() || commit.isPending} onClick={save}>
                  Guardar
                </button>
              )}
              {saved && !dirty ? (
                <a className="button-primary" href={`/admin/observatorio-boletin/${saved.id}`} target="_blank" rel="noreferrer">
                  <Icon name="document" size={15} /> Abrir el PDF
                </a>
              ) : (
                <span className="obs-hint">{canEdit ? "Guarda para abrir el PDF" : ""}</span>
              )}
            </div>
          }
        >
          <div className="obs-bulletin__form">
            <label className="obs-field">
              <span>Título</span>
              <input value={draft.title} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            </label>
            <label className="obs-field">
              <span>Subtítulo</span>
              <input value={draft.subtitle} disabled={!canEdit} placeholder="Informe para el Consejo Académico · segundo semestre" onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))} />
            </label>
          </div>

          <div className="obs-filters">
            {chips(
              "Temas",
              TOPICS.map((t) => t.slug),
              draft.filters.topics,
              (next) => setFilter("topics", next),
              (slug) => `${topicInfo(slug)!.code} · ${topicInfo(slug)!.name}`,
            )}
            {chips("Años", options.years, draft.filters.years, (next) => setFilter("years", next))}
            {chips("Periodos", options.periods, draft.filters.periods, (next) => setFilter("periods", next))}
            {chips("Fuentes", options.sources, draft.filters.sources, (next) => setFilter("sources", next))}
            {chips(
              "Tipos de dato",
              Object.keys(DATA_TYPE_LABEL) as ObsDataType[],
              draft.filters.dataTypes,
              (next) => setFilter("dataTypes", next),
              (k) => DATA_TYPE_LABEL[k],
            )}
          </div>

          <fieldset className="obs-filter obs-filter--include">
            <legend>Qué lleva el documento</legend>
            {(
              [
                ["cover", "Portada", "Título, recorte y fecha"],
                ["summary", "Resumen", "Una línea por tema con sus cifras"],
                ["tables", "Tablas", "La tabla de datos bajo cada visor (hasta 25 filas)"],
                ["method", "Metodología", "Fuente, anonimización y reserva de cada tabla"],
              ] as const
            ).map(([key, label, hint]) => (
              <label key={key} className="oda-check">
                <input type="checkbox" checked={draft.include[key]} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, include: { ...d.include, [key]: e.target.checked } }))} />
                <span>
                  {label}
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </fieldset>

          {saved && canEdit && (
            <div className="obs-bulletin__delete">
              {confirming ? (
                <span className="oda-confirm" role="group" aria-label="Confirmar el borrado">
                  <span>Se borra el boletín (las tablas no).</span>
                  <button
                    type="button"
                    className="oda-link-button"
                    data-tone="danger"
                    onClick={() => commit.mutate({ kind: "bulletin-delete", id: saved.id }, { onSuccess: () => setActiveId(null) })}
                  >
                    Sí, borrar
                  </button>
                  <button type="button" className="oda-link-button" onClick={() => setConfirming(false)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <button type="button" className="oda-link-button" data-tone="danger" onClick={() => setConfirming(true)}>
                  Borrar este boletín
                </button>
              )}
            </div>
          )}
        </Panel>

        <Panel id="obs-boletin-contenido" title="Contenido" description={`${plural(content.length, "tema", "temas")} · ${plural(tables, "tabla", "tablas")} · ${plural(views, "visor", "visores")} · ${describeFilters(draft.filters)}`} tone="quiet">
          {content.length ? (
            <ol className="obs-outline">
              {content.map((t) => {
                const info = topicInfo(t.config.slug)!;
                return (
                  <li key={info.slug} style={{ "--topic-line": `var(--od-line-${info.line})` } as CSSProperties}>
                    <span className="oda-code">{info.code}</span>
                    <div>
                      <b>{info.name}</b>
                      {t.views.length ? (
                        <ul>
                          {t.views.map((v) => (
                            <li key={v.id}>
                              <ChartThumb type={v.type} />
                              {v.title}
                              <small>{SECTION_LABEL[v.section]}</small>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <small>{plural(t.datasets.size, "tabla sin visores: sale como tabla", "tablas sin visores: salen como tablas")}</small>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="obs-empty">
              <strong>Nada entra con este recorte</strong>
              <p>Ninguna tabla cumple a la vez los filtros elegidos. Quita alguno o deja «Todos».</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
