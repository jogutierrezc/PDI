/* =============================================================================
   Estación 4 · Diseño visual.

   La ficha pública es una columna de bloques. Aquí se ordenan (arrastrando o
   con los botones), se ocultan sin borrarlos y se ajustan: un título propio,
   la gráfica con la que abre la evolución. Un conjunto que existe pero no
   tiene bloque se ofrece para añadirlo, así nada cargado se queda sin verse
   por olvido.

   Separadores: un bloque con título ("Graduados") agrupa los que le siguen
   hasta el próximo. Para que un grupo tenga sus indicadores, se le pone un
   tablero de indicadores con los suyos elegidos. La ficha web los pinta como
   franjas de sección y el Boletín abre página en cada uno (ver groups.ts).
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdBlockKind, OdReportBlockRow } from "../../../../types/database";
import { BLOCK_LABELS } from "../../../datos-abiertos/data/types";
import type { StationProps } from "../OdAdmin";
import { useSaveBlocks } from "../od-data";
import { Panel, SaveState, StageEmpty } from "../ui";
import { ImageGrid } from "./ImageGrid";

type DraftBlock = Omit<OdReportBlockRow, "id" | "report_id"> & { id?: string; tempId: string };

const BLOCK_HELP: Record<OdBlockKind, string> = {
  kpis: "Las cifras clave del informe, con variación y rastro de cortes.",
  evolucion: "El indicador elegido año a año, por campus.",
  mapa: "Colombia por departamento, movilidad por país con rutas animadas o convenios por país como mapa de calor.",
  tuberia: "La deserción de una cohorte, tramo a tramo, en estudiantes o en %.",
  historico: "La cifra de un periodo frente a otro, con sus categorías y su peso en el total.",
  mapa_calor: "Matriz de dos dimensiones en escala azul.",
  desgloses: "Cómo se reparte la cifra: circular o barras.",
  tabla_dinamica: "Todas las cifras, para armar la tabla propia y descargarla.",
  metodologia: "Qué mide cada indicador y quién lo reporta.",
  tabla: "Una tabla del informe: listado, ranking, fichas o cifras de un periodo.",
  separador: "Agrupa los bloques que siguen, hasta el próximo separador. En el Boletín abre página.",
  rankings: "Posiciones en QS, THE y otros rankings, con medallas, tabla, evolución y rueda de ODS.",
  saber_pro: "Resultados Saber PRO por competencia: niveles de desempeño, brecha con el país y evolución, filtrables por sede, facultad y programa.",
  saber_tyt: "Motor Beta: de Saber 11 a Saber TyT en rango percentil, con el valor agregado por programa.",
  libre: "Un conjunto libre con sus gráficas: elige una vista o muéstralas todas.",
  modelo: "Modelo estadístico del informe: factores asociados con su intervalo, simulador de perfiles, calidad de la clasificación y la muestra.",
  imagenes: "Fotografías en dos columnas, dentro de la ficha y en el boletín.",
  diversidad: "Tablero propio de Diversidad, Equidad e Inclusión: grupos de protección constitucional por corte y campus, mosaico étnico, discapacidad, estratos, género, zona e INES.",
  medallero: "Lo que gana la universidad cuando compite: juegos, festivales y concursos, con su podio y su tabla de medallas.",
};

/** Clave corta para distinguir varios bloques del mismo tipo (ver 0029). */
const newSlot = () => Math.random().toString(36).slice(2, 10);

export function DesignStation({ data, report, canEdit }: StationProps) {
  if (!report?.uuid) return <StageEmpty title="Elige un informe">El diseño se decide ficha por ficha.</StageEmpty>;
  const blocks = data.rows.blocks.filter((b) => b.report_id === report.uuid).sort((a, b) => a.position - b.position);
  return <DesignEditor key={report.uuid + blocks.map((b) => `${b.id}${b.position}${b.visible}${JSON.stringify(b.settings)}`).join()} data={data} reportId={report.uuid} reportSlug={report.slug} blocks={blocks} canEdit={canEdit} />;
}

function DesignEditor({ data, reportId, reportSlug, blocks, canEdit }: { data: StationProps["data"]; reportId: string; reportSlug: string; blocks: OdReportBlockRow[]; canEdit: boolean }) {
  const save = useSaveBlocks();
  const [imageError, setImageError] = useState("");
  const initial: DraftBlock[] = blocks.map((b) => ({ ...b, tempId: b.id }));
  const [draft, setDraft] = useState<DraftBlock[]>(initial);
  const [removed, setRemoved] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);

  const heatmaps = data.rows.heatmaps.filter((h) => h.report_id === reportId);
  const maps = data.rows.maps.filter((m) => m.report_id === reportId);
  const pipelines = data.rows.pipelines.filter((p) => p.report_id === reportId);
  const histories = data.rows.histories.filter((h) => h.report_id === reportId);
  const breakdowns = data.rows.breakdowns.filter((b) => b.report_id === reportId);
  const tables = data.rows.tables.filter((t) => t.report_id === reportId);
  const rankings = (data.rows.rankings ?? []).filter((r) => r.report_id === reportId);
  const medalBoards = (data.rows.medalBoards ?? []).filter((m) => m.report_id === reportId);
  const saberPro = (data.rows.saberPro ?? []).filter((sp) => sp.report_id === reportId).sort((a, b) => a.position - b.position);
  const saberTyt = (data.rows.saberTyt ?? []).filter((t) => t.report_id === reportId).sort((a, b) => a.position - b.position);
  const freeSets = (data.rows.freeSets ?? []).filter((fs) => fs.report_id === reportId).sort((a, b) => a.position - b.position);
  const sections = data.rows.sections.filter((s) => s.report_id === reportId);
  const indicators = data.rows.indicators.filter((i) => i.report_id === reportId).sort((a, b) => a.position - b.position);
  /** Separador bajo el que queda un bloque (el anterior más cercano). */
  const groupOf = (index: number) => {
    for (let i = index - 1; i >= 0; i -= 1) if (draft[i].kind === "separador") return draft[i];
    return null;
  };
  /**
   * Un tablero (o bloque de desgloses) sin elección: el primero muestra lo que
   * nadie eligió; los siguientes, nada. Igual que en la ficha y el Boletín (groups.ts).
   */
  const restState = (block: DraftBlock, chose: (b: DraftBlock) => boolean): "elige" | "resto" | "vacio" => {
    if (chose(block)) return "elige";
    const first = draft.find((b) => b.kind === block.kind && b.visible && !chose(b));
    return !block.visible || first?.tempId === block.tempId ? "resto" : "vacio";
  };
  const add = (block: Omit<DraftBlock, "position" | "tempId">) =>
    setDraft(normalized([...draft, { ...block, position: draft.length + 1, tempId: `nuevo-${block.kind}-${block.settings.slot ?? block.ref_id}-${draft.length}` }]));
  const sectionOf = (b: DraftBlock) => {
    const s = b.section_id ? sections.find((x) => x.id === b.section_id) : undefined;
    return s ? (s.number !== null ? `Punto ${s.number} · ${s.title}` : s.title) : null;
  };

  const nameOf = (b: DraftBlock) => {
    if (b.kind === "mapa_calor") return heatmaps.find((h) => h.id === b.ref_id)?.title ?? "Mapa de calor sin conjunto";
    if (b.kind === "mapa") return maps.find((m) => m.id === b.ref_id)?.title ?? "Mapa sin conjunto";
    if (b.kind === "tuberia") return pipelines.find((p) => p.id === b.ref_id)?.title ?? "Tubería sin conjunto";
    if (b.kind === "historico") return histories.find((h) => h.id === b.ref_id)?.title ?? "Evolución histórica sin conjunto";
    if (b.kind === "tabla") return tables.find((x) => x.id === b.ref_id)?.title ?? "Tabla sin conjunto";
    if (b.kind === "desgloses" && b.ref_id) return breakdowns.find((x) => x.id === b.ref_id)?.title ?? BLOCK_LABELS.desgloses;
    if (b.kind === "libre") {
      const set = freeSets.find((fs) => fs.id === b.ref_id);
      if (!set) return "Conjunto libre sin conjunto";
      const view = set.views.find((v) => v.key === b.settings.view);
      return view ? `${set.title} · ${view.title}` : set.title;
    }
    if (b.kind === "separador") return "Separador sin título";
    return BLOCK_LABELS[b.kind];
  };

  // Lo que el informe tiene y la ficha todavía no muestra.
  const missing: { kind: OdBlockKind; ref_id: string | null; label: string }[] = [
    ...(["kpis", "evolucion", "tabla_dinamica", "metodologia"] as OdBlockKind[])
      .filter((kind) => !draft.some((b) => b.kind === kind))
      .map((kind) => ({ kind, ref_id: null, label: BLOCK_LABELS[kind] })),
    ...(breakdowns.length && !draft.some((b) => b.kind === "desgloses") ? [{ kind: "desgloses" as OdBlockKind, ref_id: null, label: BLOCK_LABELS.desgloses }] : []),
    ...(rankings.length && !draft.some((b) => b.kind === "rankings") ? [{ kind: "rankings" as OdBlockKind, ref_id: null, label: BLOCK_LABELS.rankings }] : []),
    ...(medalBoards.length && !draft.some((b) => b.kind === "medallero") ? [{ kind: "medallero" as OdBlockKind, ref_id: null, label: BLOCK_LABELS.medallero }] : []),
    ...(saberPro.length && !draft.some((b) => b.kind === "saber_pro") ? [{ kind: "saber_pro" as OdBlockKind, ref_id: null, label: BLOCK_LABELS.saber_pro }] : []),
    ...(saberTyt.length && !draft.some((b) => b.kind === "saber_tyt") ? [{ kind: "saber_tyt" as OdBlockKind, ref_id: null, label: BLOCK_LABELS.saber_tyt }] : []),
    // El tablero de la diversidad lee los indicadores del informe DE por su clave.
    ...(indicators.some((i) => i.key === "grupo-especial") && !draft.some((b) => b.kind === "diversidad") ? [{ kind: "diversidad" as OdBlockKind, ref_id: null, label: BLOCK_LABELS.diversidad }] : []),
    ...((data.rows.models ?? []).some((m) => m.report_id === reportId) && !draft.some((b) => b.kind === "modelo") ? [{ kind: "modelo" as OdBlockKind, ref_id: null, label: BLOCK_LABELS.modelo }] : []),
    ...heatmaps.filter((h) => !draft.some((b) => b.ref_id === h.id)).map((h) => ({ kind: "mapa_calor" as OdBlockKind, ref_id: h.id, label: h.title })),
    ...maps.filter((m) => !draft.some((b) => b.ref_id === m.id || (b.kind === "mapa" && b.settings.mapWith === m.key))).map((m) => ({ kind: "mapa" as OdBlockKind, ref_id: m.id, label: m.title })),
    ...pipelines.filter((p) => !draft.some((b) => b.ref_id === p.id)).map((p) => ({ kind: "tuberia" as OdBlockKind, ref_id: p.id, label: p.title })),
    ...histories.filter((h) => !draft.some((b) => b.ref_id === h.id)).map((h) => ({ kind: "historico" as OdBlockKind, ref_id: h.id, label: h.title })),
    ...tables.filter((x) => !draft.some((b) => b.ref_id === x.id)).map((x) => ({ kind: "tabla" as OdBlockKind, ref_id: x.id, label: x.title })),
    ...freeSets.filter((fs) => !draft.some((b) => b.ref_id === fs.id)).map((fs) => ({ kind: "libre" as OdBlockKind, ref_id: fs.id, label: fs.title })),
  ];

  const mapOf = (b: DraftBlock) => (b.kind === "mapa" ? maps.find((m) => m.id === b.ref_id) : undefined);
  const isWorld = (mode: string | undefined) => mode === "entrante" || mode === "saliente";
  const canCompact = (mode: string | undefined) => isWorld(mode) || mode === "convenios";
  /** Bloque de mapa que ya muestra a este mapa junto al suyo (el primero en el orden gana). */
  const shownWith = (b: DraftBlock) => {
    const own = mapOf(b);
    if (!own) return null;
    const host = draft.find((x) => x.tempId !== b.tempId && x.visible && x.kind === "mapa" && x.settings.mapWith === own.key);
    if (!host) return null;
    const hostIndex = draft.indexOf(host);
    // Si este bloque también pide al otro y va antes, es él quien lo muestra.
    if (b.visible && b.settings.mapWith && draft.indexOf(b) < hostIndex) return null;
    return host;
  };

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
            <SaveState pending={save.isPending} error={save.error || (imageError ? new Error(imageError) : null)} success={save.isSuccess} />
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
              data-kind={block.kind}
              data-grouped={(block.kind !== "separador" && groupOf(index)) ? true : undefined}
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
                <small>
                  {sectionOf(block) ? <><b className="oda-block__section">{sectionOf(block)}</b> · </> : null}
                  {block.kind !== "separador" && groupOf(index) ? <><b className="oda-block__group">{groupOf(index)!.settings.title || "Separador sin título"}</b> · </> : null}
                  {BLOCK_HELP[block.kind]}
                </small>
                <div className="oda-block__settings">
                  <label className="oda-inline-field">
                    <span>{block.kind === "separador" ? "Título del separador" : "Título propio"}</span>
                    <input
                      value={block.settings.title ?? ""}
                      placeholder={block.kind === "separador" ? "Graduados" : nameOf(block)}
                      disabled={!canEdit}
                      onChange={(e) => patch(block.tempId, { settings: { ...block.settings, title: e.target.value || undefined } })}
                    />
                  </label>
                  {block.kind === "separador" && (
                    <label className="oda-inline-field oda-inline-field--wide">
                      <span>Descripción</span>
                      <input
                        value={block.settings.description ?? ""}
                        placeholder="Quiénes obtienen título y cómo se reparten"
                        disabled={!canEdit}
                        onChange={(e) => patch(block.tempId, { settings: { ...block.settings, description: e.target.value || undefined } })}
                      />
                    </label>
                  )}
                  {block.kind === "imagenes" && (
                    <ImageGrid
                      reportSlug={reportSlug}
                      settings={block.settings}
                      disabled={!canEdit}
                      onChange={(settings) => patch(block.tempId, { settings: { ...block.settings, ...settings } })}
                      onError={setImageError}
                    />
                  )}
                  {block.kind === "kpis" && indicators.length > 0 && (
                    <Picker
                      noun={{ one: "indicador", many: "indicadores", block: "tablero" }}
                      options={indicators.map((i) => ({ key: i.key, label: i.label }))}
                      chosen={block.settings.indicators ?? []}
                      restState={restState(block, (b) => Boolean(b.settings.indicators?.length))}
                      disabled={!canEdit}
                      onChange={(list) => patch(block.tempId, { settings: { ...block.settings, indicators: list.length ? list : undefined } })}
                    />
                  )}
                  {block.kind === "rankings" && rankings.length > 0 && (
                    <Picker
                      noun={{ one: "ranking", many: "rankings", block: "bloque de rankings" }}
                      options={rankings.map((r) => ({ key: r.key, label: r.title }))}
                      chosen={block.settings.rankings ?? []}
                      restState={restState(block, (b) => Boolean(b.settings.rankings?.length))}
                      disabled={!canEdit}
                      onChange={(list) => patch(block.tempId, { settings: { ...block.settings, rankings: list.length ? list : undefined } })}
                    />
                  )}
                  {block.kind === "medallero" && medalBoards.length > 0 && (
                    <Picker
                      noun={{ one: "medallero", many: "medalleros", block: "bloque de medalleros" }}
                      options={medalBoards.map((m) => ({ key: m.key, label: m.title }))}
                      chosen={block.settings.medalleros ?? []}
                      restState={restState(block, (b) => Boolean(b.settings.medalleros?.length))}
                      disabled={!canEdit}
                      onChange={(list) => patch(block.tempId, { settings: { ...block.settings, medalleros: list.length ? list : undefined } })}
                    />
                  )}
                  {block.kind === "saber_pro" && saberPro.length > 1 && (
                    <label className="oda-inline-field">
                      <span>Resultados que muestra</span>
                      <select
                        value={block.settings.saberPro ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => patch(block.tempId, { settings: { ...block.settings, saberPro: e.target.value || undefined } })}
                      >
                        <option value="">El primero del informe ({saberPro[0].title})</option>
                        {saberPro.map((sp) => <option key={sp.id} value={sp.key}>{sp.title}</option>)}
                      </select>
                    </label>
                  )}
                  {block.kind === "saber_tyt" && saberTyt.length > 1 && (
                    <label className="oda-inline-field">
                      <span>Conjunto que muestra</span>
                      <select
                        value={block.settings.saberTyt ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => patch(block.tempId, { settings: { ...block.settings, saberTyt: e.target.value || undefined } })}
                      >
                        <option value="">El primero del informe ({saberTyt[0].title})</option>
                        {saberTyt.map((t) => <option key={t.id} value={t.key}>{t.title}</option>)}
                      </select>
                    </label>
                  )}
                  {block.kind === "desgloses" && !block.ref_id && breakdowns.length > 0 && (
                    <Picker
                      noun={{ one: "desglose", many: "desgloses", block: "bloque de desgloses" }}
                      options={breakdowns.map((b) => ({ key: b.key, label: b.title }))}
                      chosen={block.settings.breakdowns ?? []}
                      restState={restState(block, (b) => Boolean(b.ref_id || b.settings.breakdowns?.length))}
                      disabled={!canEdit}
                      onChange={(list) => patch(block.tempId, { settings: { ...block.settings, breakdowns: list.length ? list : undefined } })}
                    />
                  )}
                  {block.kind === "mapa" && mapOf(block) && (() => {
                    const own = mapOf(block)!;
                    const partner = maps.find((m) => m.key === block.settings.mapWith);
                    const canCombine = Boolean(partner && isWorld(own.mode) && isWorld(partner.mode) && own.mode !== partner.mode);
                    const layout = partner ? (block.settings.mapLayout === "combinado" && canCombine ? "combinado" : "lado_a_lado") : null;
                    const host = shownWith(block);
                    const set = (change: Partial<DraftBlock["settings"]>) => patch(block.tempId, { settings: { ...block.settings, ...change } });
                    return (
                      <>
                        <label className="oda-inline-field">
                          <span>Mostrar junto a</span>
                          <select
                            value={block.settings.mapWith ?? ""}
                            disabled={!canEdit}
                            onChange={(e) => {
                              const next = maps.find((m) => m.key === e.target.value);
                              const combinable = Boolean(next && isWorld(own.mode) && isWorld(next.mode) && own.mode !== next.mode);
                              set({
                                mapWith: next?.key,
                                // Entrante con saliente abre combinado; cualquier otra pareja, lado a lado.
                                mapLayout: next ? (combinable ? "combinado" : "lado_a_lado") : undefined,
                              });
                            }}
                          >
                            <option value="">Solo este mapa</option>
                            {maps.filter((m) => m.id !== own.id).map((m) => <option key={m.id} value={m.key}>{m.title}</option>)}
                          </select>
                        </label>
                        {partner && (
                          <label className="oda-inline-field">
                            <span>Cómo</span>
                            <select
                              value={layout ?? "lado_a_lado"}
                              disabled={!canEdit}
                              onChange={(e) => set({ mapLayout: e.target.value as "combinado" | "lado_a_lado" })}
                            >
                              <option value="lado_a_lado">Dos mapas en una fila</option>
                              {canCombine && <option value="combinado">Un solo mapa, entrante y saliente en dos colores</option>}
                            </select>
                          </label>
                        )}
                        {canCompact(own.mode) && layout !== "lado_a_lado" && (
                          <label className="oda-inline-check">
                            <input type="checkbox" checked={Boolean(block.settings.compact)} disabled={!canEdit} onChange={(e) => set({ compact: e.target.checked || undefined })} />
                            <span>Compacto <small>encuadre a los países con datos y panel al lado</small></span>
                          </label>
                        )}
                        {layout === "lado_a_lado" && <small className="oda-block__note">En una fila los dos mapas van en versión compacta; en el móvil se apilan.</small>}
                        {partner && <small className="oda-block__note">El bloque propio de «{partner.title}» no se repite en la ficha.</small>}
                        {host && <small className="oda-block__note">Se muestra dentro de «{host.settings.title || nameOf(host)}»: este bloque no se repite.</small>}
                      </>
                    );
                  })()}
                  {block.kind === "libre" && (() => {
                    const set = freeSets.find((fs) => fs.id === block.ref_id);
                    if (!set) return null;
                    // Las vistas con bloque propio no se repiten en el de «todas»: la ficha las salta.
                    const own = new Set(draft.filter((b) => b.kind === "libre" && b.ref_id === set.id && b.settings.view).map((b) => b.settings.view));
                    const rest = set.views.filter((v) => !own.has(v.key)).length;
                    return (
                      <label className="oda-inline-field">
                        <span>Gráfica</span>
                        <select
                          value={block.settings.view ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => patch(block.tempId, { settings: { ...block.settings, view: e.target.value || undefined } })}
                        >
                          <option value="">{own.size ? `Las demás vistas (${rest})` : `Todas las vistas (${set.views.length})`}</option>
                          {set.views.map((v) => <option key={v.key} value={v.key}>{v.title}</option>)}
                        </select>
                      </label>
                    );
                  })()}
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

        {canEdit && (
          <div className="oda-block-adders">
            <button
              type="button"
              className="button-secondary"
              onClick={() => add({ kind: "separador", ref_id: null, visible: true, settings: { title: "", slot: newSlot() } })}
            >
              <Icon name="plus" size={15} /> Añadir separador
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => add({ kind: "imagenes", ref_id: null, visible: true, settings: { images: [], columns: 2, slot: newSlot() } })}
            >
              <Icon name="plus" size={15} /> Añadir grid de imágenes
            </button>
            {draft.some((b) => b.kind === "kpis") && (
              <button
                type="button"
                className="button-ghost"
                onClick={() => add({ kind: "kpis", ref_id: null, visible: true, settings: { slot: newSlot() } })}
              >
                <Icon name="plus" size={15} /> Otro tablero de indicadores
              </button>
            )}
            {medalBoards.length > 1 && draft.some((b) => b.kind === "medallero") && (
              <button
                type="button"
                className="button-secondary oda-add"
                disabled={!canEdit}
                onClick={() => add({ kind: "medallero", ref_id: null, visible: true, settings: { slot: newSlot() } })}
              >
                <Icon name="plus" size={15} /> Otro bloque de medalleros
              </button>
            )}
            {rankings.length > 1 && draft.some((b) => b.kind === "rankings") && (
              <button
                type="button"
                className="button-ghost"
                onClick={() => add({ kind: "rankings", ref_id: null, visible: true, settings: { slot: newSlot() } })}
              >
                <Icon name="plus" size={15} /> Otro bloque de rankings
              </button>
            )}
            {breakdowns.length > 0 && draft.some((b) => b.kind === "desgloses") && (
              <button
                type="button"
                className="button-ghost"
                onClick={() => add({ kind: "desgloses", ref_id: null, visible: true, settings: { slot: newSlot() } })}
              >
                <Icon name="plus" size={15} /> Otro bloque de desgloses
              </button>
            )}
            {freeSets
              .filter((fs) => fs.views.length > 1 && draft.some((b) => b.kind === "libre" && b.ref_id === fs.id))
              .map((fs) => (
                <button
                  key={fs.id}
                  type="button"
                  className="button-ghost"
                  onClick={() => add({ kind: "libre", ref_id: fs.id, visible: true, settings: { view: fs.views[0].key, slot: newSlot() } })}
                >
                  <Icon name="plus" size={15} /> Otra gráfica de «{fs.title}»
                </button>
              ))}
            <small>
              Un separador agrupa los bloques que le siguen, hasta el próximo. Para que una sección muestre sus indicadores y desgloses, ponle debajo un tablero y un bloque de desgloses con los suyos elegidos: así no se repiten en cada sección.
            </small>
          </div>
        )}

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
          {draft.filter((b) => b.visible && !shownWith(b)).map((b) => (
            <div key={b.tempId} className={b.kind === "separador" ? "oda-schematic__divider" : "oda-schematic__block"} data-kind={b.kind}>
              <span>
                {b.settings.title || nameOf(b)}
                {b.kind === "mapa" && b.settings.mapWith && ` + ${maps.find((m) => m.key === b.settings.mapWith)?.title ?? ""}`}
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

/** Qué muestra un tablero de indicadores o un bloque de desgloses. */
function Picker({
  noun,
  options,
  chosen,
  restState,
  disabled,
  onChange,
}: {
  noun: { one: string; many: string; block: string };
  options: { key: string; label: string }[];
  chosen: string[];
  restState: "elige" | "resto" | "vacio";
  disabled: boolean;
  onChange: (list: string[]) => void;
}) {
  const summary =
    restState === "elige"
      ? `${chosen.length} ${chosen.length === 1 ? `${noun.one} elegido` : `${noun.many} elegidos`}`
      : restState === "resto"
        ? `los ${noun.many} que ningún otro ${noun.block} eligió`
        : `ninguno: otro ${noun.block} sin elección ya muestra el resto`;
  return (
    <details className="oda-block__picker" data-empty={restState === "vacio" || undefined}>
      <summary>
        {noun.many.charAt(0).toUpperCase() + noun.many.slice(1)}: {summary}
      </summary>
      <div>
        {options.map((option) => (
          <label key={option.key} className="oda-check">
            <input
              type="checkbox"
              disabled={disabled}
              checked={chosen.includes(option.key)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? options.map((o) => o.key).filter((key) => key === option.key || chosen.includes(key))
                    : chosen.filter((key) => key !== option.key),
                )
              }
            />
            {option.label}
          </label>
        ))}
        <small className="oda-block__note">
          Sin elegir ninguno, el primer {noun.block} sin elección muestra los {noun.many} que ningún otro eligió; los demás quedan vacíos.
        </small>
      </div>
    </details>
  );
}
