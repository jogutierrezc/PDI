/* =============================================================================
   Estación 4 · Diseño visual.

   La ficha pública es una columna de bloques. Aquí se ordenan (arrastrando o
   con los botones), se ocultan sin borrarlos y se ajustan: un título propio,
   la gráfica con la que abre la evolución. Un conjunto que existe pero no
   tiene bloque se ofrece para añadirlo, así nada cargado se queda sin verse
   por olvido.
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdBlockKind, OdReportBlockRow } from "../../../../types/database";
import { BLOCK_LABELS } from "../../../datos-abiertos/data/types";
import type { StationProps } from "../OdAdmin";
import { useSaveBlocks } from "../od-data";
import { Panel, SaveState, StageEmpty } from "../ui";

type DraftBlock = Omit<OdReportBlockRow, "id" | "report_id"> & { id?: string; tempId: string };

const BLOCK_HELP: Record<OdBlockKind, string> = {
  kpis: "Las cifras clave del informe, con variación y rastro de cortes.",
  evolucion: "El indicador elegido año a año, por campus.",
  mapa: "Colombia por departamento, con flujos hacia cada campus.",
  tuberia: "La deserción de una cohorte, tramo a tramo, en estudiantes o en %.",
  historico: "La cifra de un periodo frente a otro, con sus categorías y su peso en el total.",
  mapa_calor: "Matriz de dos dimensiones en escala azul.",
  desgloses: "Cómo se reparte la cifra: circular o barras.",
  tabla_dinamica: "Todas las cifras, para armar la tabla propia y descargarla.",
  metodologia: "Qué mide cada indicador y quién lo reporta.",
};

export function DesignStation({ data, report, canEdit }: StationProps) {
  if (!report?.uuid) return <StageEmpty title="Elige un informe">El diseño se decide ficha por ficha.</StageEmpty>;
  const blocks = data.rows.blocks.filter((b) => b.report_id === report.uuid).sort((a, b) => a.position - b.position);
  return <DesignEditor key={report.uuid + blocks.map((b) => `${b.id}${b.position}${b.visible}${JSON.stringify(b.settings)}`).join()} data={data} reportId={report.uuid} blocks={blocks} canEdit={canEdit} />;
}

function DesignEditor({ data, reportId, blocks, canEdit }: { data: StationProps["data"]; reportId: string; blocks: OdReportBlockRow[]; canEdit: boolean }) {
  const save = useSaveBlocks();
  const initial: DraftBlock[] = blocks.map((b) => ({ ...b, tempId: b.id }));
  const [draft, setDraft] = useState<DraftBlock[]>(initial);
  const [removed, setRemoved] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);

  const heatmaps = data.rows.heatmaps.filter((h) => h.report_id === reportId);
  const maps = data.rows.maps.filter((m) => m.report_id === reportId);
  const pipelines = data.rows.pipelines.filter((p) => p.report_id === reportId);
  const histories = data.rows.histories.filter((h) => h.report_id === reportId);
  const breakdowns = data.rows.breakdowns.filter((b) => b.report_id === reportId);

  const nameOf = (b: DraftBlock) => {
    if (b.kind === "mapa_calor") return heatmaps.find((h) => h.id === b.ref_id)?.title ?? "Mapa de calor sin conjunto";
    if (b.kind === "mapa") return maps.find((m) => m.id === b.ref_id)?.title ?? "Mapa sin conjunto";
    if (b.kind === "tuberia") return pipelines.find((p) => p.id === b.ref_id)?.title ?? "Tubería sin conjunto";
    if (b.kind === "historico") return histories.find((h) => h.id === b.ref_id)?.title ?? "Evolución histórica sin conjunto";
    return BLOCK_LABELS[b.kind];
  };

  // Lo que el informe tiene y la ficha todavía no muestra.
  const missing: { kind: OdBlockKind; ref_id: string | null; label: string }[] = [
    ...(["kpis", "evolucion", "tabla_dinamica", "metodologia"] as OdBlockKind[])
      .filter((kind) => !draft.some((b) => b.kind === kind))
      .map((kind) => ({ kind, ref_id: null, label: BLOCK_LABELS[kind] })),
    ...(breakdowns.length && !draft.some((b) => b.kind === "desgloses") ? [{ kind: "desgloses" as OdBlockKind, ref_id: null, label: BLOCK_LABELS.desgloses }] : []),
    ...heatmaps.filter((h) => !draft.some((b) => b.ref_id === h.id)).map((h) => ({ kind: "mapa_calor" as OdBlockKind, ref_id: h.id, label: h.title })),
    ...maps.filter((m) => !draft.some((b) => b.ref_id === m.id)).map((m) => ({ kind: "mapa" as OdBlockKind, ref_id: m.id, label: m.title })),
    ...pipelines.filter((p) => !draft.some((b) => b.ref_id === p.id)).map((p) => ({ kind: "tuberia" as OdBlockKind, ref_id: p.id, label: p.title })),
    ...histories.filter((h) => !draft.some((b) => b.ref_id === h.id)).map((h) => ({ kind: "historico" as OdBlockKind, ref_id: h.id, label: h.title })),
  ];

  const normalized = (list: DraftBlock[]) => list.map((b, i) => ({ ...b, position: i + 1 }));
  const dirty = removed.length > 0 || JSON.stringify(normalized(draft).map(({ tempId, ...b }) => b)) !== JSON.stringify(initial.map(({ tempId, ...b }) => b));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.length) return;
    const next = [...draft];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setDraft(normalized(next));
  };
  const patch = (tempId: string, change: Partial<DraftBlock>) => setDraft(draft.map((b) => (b.tempId === tempId ? { ...b, ...change } : b)));

  return (
    <div className="oda-design">
      <Panel
        id="oda-diseno"
        title="Bloques de la ficha"
        description="Arrastra para ordenar o usa las flechas. Ocultar no borra: el bloque vuelve cuando lo muestres."
        actions={
          <>
            <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
            {dirty && (
              <button type="button" className="button-ghost" onClick={() => { setDraft(initial); setRemoved([]); }}>
                Descartar
              </button>
            )}
            <button
              type="button"
              className="button-primary"
              disabled={!canEdit || !dirty || save.isPending}
              onClick={() =>
                save.mutate({
                  reportId,
                  remove: removed,
                  blocks: normalized(draft).map(({ tempId, ...b }) => ({ ...b, report_id: reportId })),
                })
              }
            >
              Guardar diseño
            </button>
          </>
        }
      >
        <ol className="oda-blocks">
          {draft.map((block, index) => (
            <li
              key={block.tempId}
              className="oda-block"
              data-hidden={!block.visible || undefined}
              data-dragging={dragging === block.tempId || undefined}
              draggable={canEdit}
              onDragStart={(e) => { setDragging(block.tempId); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => { if (dragging) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const from = draft.findIndex((b) => b.tempId === dragging);
                if (from >= 0) move(from, index);
                setDragging(null);
              }}
            >
              <span className="oda-block__grip" aria-hidden="true">
                <svg viewBox="0 0 12 18" width="10" height="16"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="3" cy="15" r="1.5" /><circle cx="9" cy="15" r="1.5" /></svg>
              </span>
              <span className="oda-block__pos" aria-hidden="true">{index + 1}</span>
              <div className="oda-block__body">
                <strong>{block.settings.title || nameOf(block)}</strong>
                <small>{BLOCK_HELP[block.kind]}</small>
                <div className="oda-block__settings">
                  <label className="oda-inline-field">
                    <span>Título propio</span>
                    <input
                      value={block.settings.title ?? ""}
                      placeholder={nameOf(block)}
                      disabled={!canEdit}
                      onChange={(e) => patch(block.tempId, { settings: { ...block.settings, title: e.target.value || undefined } })}
                    />
                  </label>
                  {block.kind === "evolucion" && (
                    <label className="oda-inline-field">
                      <span>Abre en</span>
                      <select
                        value={block.settings.chart ?? "lineas"}
                        disabled={!canEdit}
                        onChange={(e) => patch(block.tempId, { settings: { ...block.settings, chart: e.target.value as "lineas" | "barras" } })}
                      >
                        <option value="lineas">Líneas por campus</option>
                        <option value="barras">Barras por año</option>
                      </select>
                    </label>
                  )}
                </div>
              </div>
              <div className="oda-block__tools">
                <label className="oda-switch">
                  <input type="checkbox" checked={block.visible} disabled={!canEdit} onChange={(e) => patch(block.tempId, { visible: e.target.checked })} />
                  <span>{block.visible ? "Visible" : "Oculto"}</span>
                </label>
                <button type="button" className="icon-button" aria-label={`Subir ${nameOf(block)}`} disabled={!canEdit || index === 0} onClick={() => move(index, index - 1)}>
                  <Icon name="chevron-down" size={15} style={{ transform: "rotate(180deg)" }} />
                </button>
                <button type="button" className="icon-button" aria-label={`Bajar ${nameOf(block)}`} disabled={!canEdit || index === draft.length - 1} onClick={() => move(index, index + 1)}>
                  <Icon name="chevron-down" size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Quitar ${nameOf(block)} de la ficha`}
                  disabled={!canEdit}
                  onClick={() => {
                    if (block.id) setRemoved([...removed, block.id]);
                    setDraft(normalized(draft.filter((b) => b.tempId !== block.tempId)));
                  }}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            </li>
          ))}
        </ol>

        {missing.length > 0 && canEdit && (
          <div className="oda-missing-blocks">
            <span>El informe tiene esto y la ficha no lo muestra:</span>
            <ul>
              {missing.map((m) => (
                <li key={`${m.kind}-${m.ref_id}`}>
                  <button
                    type="button"
                    className="oda-chip"
                    onClick={() => setDraft(normalized([...draft, { kind: m.kind, ref_id: m.ref_id, visible: true, position: draft.length + 1, settings: {}, tempId: `nuevo-${m.kind}-${m.ref_id}-${draft.length}` }]))}
                  >
                    <Icon name="plus" size={13} /> {m.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <aside className="oda-schematic" aria-label="Esquema de la ficha">
        <span className="oda-schematic__label">Así se lee la ficha</span>
        <div className="oda-schematic__page">
          <div className="oda-schematic__head" aria-hidden="true" />
          <div className="oda-schematic__bar" aria-hidden="true" />
          {draft.filter((b) => b.visible).map((b) => (
            <div key={b.tempId} className="oda-schematic__block" data-kind={b.kind}>
              <span>{b.settings.title || nameOf(b)}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
