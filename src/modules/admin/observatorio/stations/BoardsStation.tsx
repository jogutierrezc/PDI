/* =============================================================================
   Observatorio · 3 Tableros.

   La página de cada tema, armada: qué tipo de informe es (tablero, narrativo,
   comparativo o ficha técnica), qué secciones lleva y en qué orden, y dónde
   va cada visor. A la derecha —o debajo, si no cabe—, la vista previa con los
   datos reales, en escritorio o en móvil.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { Panel, SaveState } from "../../udes-en-cifras/ui";
import type { ObsStationProps } from "../ObsAdmin";
import { ChartThumb, ObsChart } from "../ObsCharts";
import { CHARTS, SECTIONS, SECTION_HINT, SECTION_LABEL, TEMPLATES, plural, topicConfig, topicInfo } from "../model";
import type { ObsDataset, ObsSection, ObsTemplate, ObsTopicConfig, ObsView } from "../model";
import { useObsCommit } from "../store";

/** Esquema de cada plantilla, para elegirla sin leer la descripción. */
function TemplateSketch({ id }: { id: ObsTemplate }) {
  const B = "var(--obs-thumb-1)";
  const L = "var(--obs-thumb-line)";
  const sketches: Record<ObsTemplate, JSX.Element> = {
    tablero: (
      <>
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={6 + i * 17} y="6" width="14" height="8" rx="1.5" fill={B} fillOpacity="0.5" />
        ))}
        <rect x="6" y="18" width="31" height="20" rx="2" fill={L} />
        <rect x="40" y="18" width="31" height="20" rx="2" fill={L} />
        <rect x="6" y="41" width="65" height="9" rx="2" fill={L} />
      </>
    ),
    narrativo: (
      <>
        <path d="M14 8h40M14 12h30" stroke={L} strokeWidth="2" />
        <rect x="14" y="17" width="49" height="14" rx="2" fill={B} fillOpacity="0.4" />
        <path d="M14 36h44M14 40h36" stroke={L} strokeWidth="2" />
        <rect x="14" y="44" width="49" height="6" rx="2" fill={L} />
      </>
    ),
    comparativo: (
      <>
        <rect x="6" y="6" width="20" height="44" rx="2" fill={L} />
        <rect x="29" y="6" width="20" height="44" rx="2" fill={B} fillOpacity="0.4" />
        <rect x="52" y="6" width="19" height="44" rx="2" fill={L} />
      </>
    ),
    ficha: (
      <>
        <rect x="6" y="6" width="65" height="22" rx="2" fill="none" stroke={L} />
        <path d="M6 13h65M6 20h65M28 6v22M50 6v22" stroke={L} />
        <rect x="6" y="32" width="31" height="18" rx="2" fill={B} fillOpacity="0.35" />
        <path d="M42 35h28M42 40h24M42 45h26" stroke={L} strokeWidth="2" />
      </>
    ),
  };
  return (
    <svg className="obs-sketch" viewBox="0 0 77 56" aria-hidden="true">
      {sketches[id]}
    </svg>
  );
}

export function BoardsStation({ state, topic, canEdit, go }: ObsStationProps) {
  const info = topicInfo(topic)!;
  const saved = topicConfig(state, topic);
  const [config, setConfig] = useState<ObsTopicConfig>(saved);
  const views = useMemo(() => state.views.filter((v) => v.topic === topic).sort((a, b) => a.position - b.position), [state.views, topic]);
  const [order, setOrder] = useState<ObsView[]>(views);
  const [device, setDevice] = useState<"escritorio" | "movil">("escritorio");
  const commit = useObsCommit();

  useEffect(() => setConfig(topicConfig(state, topic)), [state, topic]);
  useEffect(() => setOrder(views), [views]);

  const configDirty = JSON.stringify(config) !== JSON.stringify(saved);
  const orderDirty = order.some((v, i) => {
    const before = views.find((x) => x.id === v.id);
    return !before || before.section !== v.section || before.size !== v.size || before.visible !== v.visible || views[i]?.id !== v.id;
  });

  const move = (id: string, delta: -1 | 1) => {
    setOrder((list) => {
      const view = list.find((v) => v.id === id)!;
      const same = list.filter((v) => v.section === view.section);
      const index = same.findIndex((v) => v.id === id);
      const swap = same[index + delta];
      if (!swap) return list;
      const a = list.indexOf(view);
      const b = list.indexOf(swap);
      const next = [...list];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };
  const patch = (id: string, change: Partial<ObsView>) => setOrder((list) => list.map((v) => (v.id === id ? { ...v, ...change } : v)));
  const moveSection = (section: ObsSection, delta: -1 | 1) =>
    setConfig((c) => {
      const i = c.sections.indexOf(section);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= c.sections.length) return c;
      const sections = [...c.sections];
      [sections[i], sections[j]] = [sections[j], sections[i]];
      return { ...c, sections };
    });

  // Una escritura tras otra: en el borrador local cada una parte del estado que dejó la anterior.
  const save = async () => {
    try {
      if (configDirty) await commit.mutateAsync({ kind: "topic", value: config });
      if (orderDirty) await commit.mutateAsync({ kind: "views", value: order.map((v, i) => ({ ...v, position: i })) });
    } catch {
      /* SaveState enseña el error. */
    }
  };

  const datasets = new Map(state.datasets.map((d) => [d.id, d]));
  // El portal solo dibuja visores sobre tablas publicadas.
  const draftTables = [...new Set(order.filter((v) => v.visible).map((v) => v.datasetId))]
    .map((id) => datasets.get(id))
    .filter((d): d is ObsDataset => Boolean(d) && d!.status !== "publicado");
  const publishTables = async () => {
    try {
      for (const d of draftTables) await commit.mutateAsync({ kind: "dataset", value: { ...d, status: "publicado" } });
    } catch {
      /* SaveState enseña el error. */
    }
  };

  return (
    <div className="obs-boards">
      <div className="obs-boards__controls">
        <Panel
          id="obs-tipo-informe"
          title={`Tipo de informe · ${info.name}`}
          description="Cómo se ordena la página del tema en el portal y en el boletín."
          actions={
            canEdit && (
              <div className="obs-detail__actions">
                <SaveState pending={commit.isPending} error={commit.error} success={commit.isSuccess} />
                <button type="button" className="button-primary" disabled={(!configDirty && !orderDirty) || commit.isPending} onClick={() => void save()}>
                  Guardar el tablero
                </button>
              </div>
            )
          }
        >
          <div className="obs-templates" role="radiogroup" aria-label="Tipo de informe">
            {TEMPLATES.map((t) => (
              <label key={t.id} className="obs-template" data-checked={config.template === t.id || undefined}>
                <input type="radio" name="obs-plantilla" value={t.id} checked={config.template === t.id} disabled={!canEdit} onChange={() => setConfig((c) => ({ ...c, template: t.id }))} />
                <TemplateSketch id={t.id} />
                <span>
                  <b>{t.label}</b>
                  <small>{t.hint}</small>
                </span>
              </label>
            ))}
          </div>

          <label className="obs-field">
            <span>Presentación del tema (abre la página)</span>
            <textarea rows={3} value={config.intro} disabled={!canEdit} placeholder={info.question} onChange={(e) => setConfig((c) => ({ ...c, intro: e.target.value }))} />
          </label>

          <div className="obs-publish">
            <div className="obs-segment" role="group" aria-label="Estado del tema">
              <button type="button" disabled={!canEdit} aria-pressed={config.status === "borrador"} onClick={() => setConfig((c) => ({ ...c, status: "borrador" }))}>
                Borrador
              </button>
              <button type="button" disabled={!canEdit} aria-pressed={config.status === "publicado"} onClick={() => setConfig((c) => ({ ...c, status: "publicado" }))}>
                Publicado
              </button>
            </div>
            <small>
              {state.mode === "base"
                ? "Al guardar como Publicado, el portal lo lee al instante: sus visores reemplazan la maqueta del tema."
                : "En el borrador local, publicar solo marca el tema: el portal no lo ve."}
            </small>
          </div>
          {config.status === "publicado" && draftTables.length > 0 && (
            <p className="obs-guard obs-guard--pending" role="note">
              <Icon name="alert" size={16} />
              <span>
                {draftTables.length === 1 ? "Una tabla de este tema sigue" : `${draftTables.length} tablas de este tema siguen`} en borrador ({draftTables.map((d) => `«${d.title}»`).join(", ")}): sus visores no salen en el portal hasta publicarlas.
              </span>
              {canEdit && (
                <button type="button" className="button-secondary" disabled={commit.isPending} onClick={() => void publishTables()}>
                  Publicar {draftTables.length === 1 ? "la tabla" : "las tablas"}
                </button>
              )}
            </p>
          )}
          {config.status === "publicado" && state.mode === "base" && (
            <a className="oda-link-button obs-portal-link" href={`/datos-abiertos/observatorio/${topic}`} target="_blank" rel="noreferrer">
              Ver la página en el portal <Icon name="external" size={13} />
            </a>
          )}
        </Panel>

        <Panel id="obs-estructura" title="Estructura de la página" description="Secciones en orden, y los visores de cada una. Las secciones apagadas no salen.">
          <ol className="obs-structure">
            {[...config.sections, ...SECTIONS.filter((s) => !config.sections.includes(s))].map((section) => {
              const on = config.sections.includes(section);
              const inside = order.filter((v) => v.section === section);
              return (
                <li key={section} data-off={!on || undefined}>
                  <header>
                    <label className="obs-toggle">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!canEdit}
                        onChange={() => setConfig((c) => ({ ...c, sections: on ? c.sections.filter((s) => s !== section) : [...c.sections, section] }))}
                      />
                      <b>{SECTION_LABEL[section]}</b>
                    </label>
                    <small>{SECTION_HINT[section]}</small>
                    {on && canEdit && (
                      <span className="obs-structure__move">
                        <button type="button" className="icon-button" aria-label={`Subir ${SECTION_LABEL[section]}`} onClick={() => moveSection(section, -1)}>
                          <Icon name="chevron-down" size={14} className="obs-up" />
                        </button>
                        <button type="button" className="icon-button" aria-label={`Bajar ${SECTION_LABEL[section]}`} onClick={() => moveSection(section, 1)}>
                          <Icon name="chevron-down" size={14} />
                        </button>
                      </span>
                    )}
                  </header>
                  {inside.length ? (
                    <ul>
                      {inside.map((v, i) => (
                        <li key={v.id} data-hidden={!v.visible || undefined}>
                          <ChartThumb type={v.type} />
                          <button type="button" className="obs-structure__title" onClick={() => go("diseno", topic, `visor=${v.id}`)}>
                            {v.title}
                            <small>{CHARTS[v.type].label}</small>
                          </button>
                          {canEdit && (
                            <span className="obs-structure__tools">
                              <select aria-label={`Sección de ${v.title}`} value={v.section} onChange={(e) => patch(v.id, { section: e.target.value as ObsSection })}>
                                {SECTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {SECTION_LABEL[s]}
                                  </option>
                                ))}
                              </select>
                              <button type="button" className="oda-link-button" onClick={() => patch(v.id, { size: v.size === "media" ? "completa" : "media" })}>
                                {v.size === "media" ? "Media" : "Completa"}
                                <span className="sr-only"> · cambiar ancho</span>
                              </button>
                              <button type="button" className="icon-button" aria-label={v.visible ? `Ocultar ${v.title}` : `Mostrar ${v.title}`} onClick={() => patch(v.id, { visible: !v.visible })}>
                                <Icon name={v.visible ? "eye" : "eye-off"} size={14} />
                              </button>
                              <button type="button" className="icon-button" disabled={i === 0} aria-label={`Subir ${v.title}`} onClick={() => move(v.id, -1)}>
                                <Icon name="chevron-down" size={14} className="obs-up" />
                              </button>
                              <button type="button" className="icon-button" disabled={i === inside.length - 1} aria-label={`Bajar ${v.title}`} onClick={() => move(v.id, 1)}>
                                <Icon name="chevron-down" size={14} />
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="obs-structure__empty">Sin visores en esta sección.</p>
                  )}
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>

      <section className="obs-preview" aria-label="Vista previa del tablero">
        <header className="obs-preview__bar">
          <strong>
            <Icon name="eye" size={15} /> Vista previa
          </strong>
          <div className="obs-segment obs-segment--small" role="group" aria-label="Dispositivo">
            <button type="button" aria-pressed={device === "escritorio"} onClick={() => setDevice("escritorio")}>
              Escritorio
            </button>
            <button type="button" aria-pressed={device === "movil"} onClick={() => setDevice("movil")}>
              Móvil
            </button>
          </div>
        </header>
        <div className="obs-preview__viewport" data-device={device}>
          <BoardPreview config={config} views={order} datasets={datasets} />
        </div>
      </section>
    </div>
  );
}

/** La página del tema con su plantilla. También la usa el boletín. */
export function BoardPreview({ config, views, datasets }: { config: ObsTopicConfig; views: ObsView[]; datasets: Map<string, ObsDataset> }) {
  const info = topicInfo(config.slug)!;
  const visible = views.filter((v) => v.visible && datasets.has(v.datasetId));
  const sample = visible.some((v) => datasets.get(v.datasetId)!.sample);
  return (
    <article className="obs-sheet" data-template={config.template} style={{ "--topic-line": `var(--od-line-${info.line})` } as CSSProperties}>
      <header className="obs-sheet__head">
        <span className="oda-code">{info.code}</span>
        <div>
          <h3>{info.name}</h3>
          <p>{config.intro || info.question}</p>
        </div>
      </header>
      {sample && (
        <p className="obs-sheet__sample" role="note">
          Datos de ejemplo: ninguna cifra de esta vista previa es real.
        </p>
      )}
      {config.sections.map((section) => {
        const inside = visible.filter((v) => v.section === section);
        if (!inside.length) return null;
        return (
          <section key={section} className="obs-sheet__section">
            <h4>{SECTION_LABEL[section]}</h4>
            <div className="obs-sheet__grid">
              {inside.map((v) => {
                const d = datasets.get(v.datasetId)!;
                return (
                  <figure key={v.id} className="obs-sheet__cell" data-size={config.template === "narrativo" ? "completa" : v.size}>
                    <figcaption>
                      <b>{v.title}</b>
                      {v.description && <span>{v.description}</span>}
                    </figcaption>
                    <ObsChart dataset={d} view={v} />
                    <small className="obs-sheet__source">
                      Fuente: {d.source || "sin fuente"}
                      {d.anonymization ? ` · anonimizada, reserva < ${d.anonymization.threshold}` : ""}
                    </small>
                  </figure>
                );
              })}
            </div>
          </section>
        );
      })}
      {!visible.length && (
        <div className="obs-empty">
          <strong>El tablero está vacío</strong>
          <p>Arma visores en Diseño visual; aquí aparecen ordenados por sección ({plural(views.length, "visor", "visores")} ocultos o sin tabla).</p>
        </div>
      )}
    </article>
  );
}
