/* =============================================================================
   El taller · los editores de cada bloque, montados dentro del bloque.

   No hay reglas nuevas aquí: cada bloque monta el editor de Captura de su
   familia (el mismo componente de la vista clásica), acotado a su conjunto con
   `only`, y el formulario de definición de Estructura (`EditDatasetForm`). La
   validación, el «vacío no es cero», la reserva estadística, el pegado y los
   importadores que cuentan en el navegador son los de siempre.

   Guardado: estos editores conservan su propio botón «Guardar». Lo que tocan
   del bloque mismo (título propio, qué conjuntos muestra, la gráfica de un
   conjunto libre, las imágenes, cómo abre la evolución) pasa por el borrador
   del taller, como el orden de la ficha.

   Un bloque que agrupa varios conjuntos (desgloses, tablas, rankings,
   medalleros) abre uno a la vez. Este archivo baja solo al pulsar «Editar» o
   «Añadir»: trae las estaciones de Captura y Estructura.
   ========================================================================== */

import { useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdBlockKind, OdMapMode } from "../../../../types/database";
import { customViewOf } from "../../../datos-abiertos/data/custom-table";
import { blockPicks, saberProOf, saberTytOf } from "../../../datos-abiertos/data/groups";
import type { Report, ReportBlock } from "../../../datos-abiertos/data/types";
import type { StationProps } from "../OdAdmin";
import { useSaveIndicator } from "../od-data";
import { SaveState, slugify } from "../ui";
import { BreakdownCapture, HeatmapCapture, HistoryCapture, MapCapture, PipelineCapture } from "../stations/CaptureStation";
import { CustomTableCapture } from "../stations/CustomTableCapture";
import { FreeSetCapture } from "../stations/FreeSetCapture";
import { ImageGrid } from "../stations/ImageGrid";
import { MedalCapture } from "../stations/MedalCapture";
import { RankingCapture } from "../stations/RankingCapture";
import { SaberProCapture } from "../stations/SaberProCapture";
import { SaberTytCapture } from "../stations/SaberTytCapture";
import { EditDatasetForm, IndicatorForm, NewDatasetForm, emptyIndicator, useDatasetSaves } from "../stations/StructureStation";
import type { DatasetKind } from "../stations/StructureStation";
import type { DraftBlock, TallerMode } from "./draft";

type Settings = DraftBlock["settings"];

/** Familia de Estructura de cada tipo de bloque con conjunto. */
export const DATASET_KIND: Partial<Record<OdBlockKind, DatasetKind>> = {
  desgloses: "desglose",
  mapa_calor: "calor",
  mapa: "mapa",
  tuberia: "tuberia",
  historico: "historico",
  rankings: "ranking",
  medallero: "medallero",
  saber_pro: "saber",
  saber_tyt: "tyt",
};

export interface BlockEditorProps {
  block: DraftBlock;
  /** El bloque como lo arma el catálogo (con lo pendiente encima): de él sale qué conjuntos muestra. */
  shown: ReportBlock | undefined;
  station: StationProps;
  viewReport: Report;
  mode: TallerMode;
  /** Ajustes del bloque: van al borrador del taller. */
  onSettings: (settings: Settings) => void;
  /** Antes de cambiar de conjunto dentro del bloque: pregunta si hay algo sin guardar. */
  guard: (run: () => void) => void;
}

interface Item {
  id: string;
  title: string;
}

export function BlockEditor({ block, shown, station, viewReport, mode, onSettings, guard }: BlockEditorProps) {
  const { data, report, canEdit } = station;
  const reportId = report!.uuid!;
  const rows = data.rows;
  const picks = blockPicks(viewReport);
  const set = (patch: Partial<Settings>) => onSettings({ ...block.settings, ...patch });

  /** Los conjuntos que este bloque muestra, por su id en la base. */
  const byKeys = <T extends { id: string; key: string; title: string; report_id: string }>(list: T[] | undefined, keys: string[]): Item[] =>
    keys.map((key) => (list ?? []).find((x) => x.report_id === reportId && x.key === key)).filter((x): x is T => Boolean(x)).map((x) => ({ id: x.id, title: x.title }));
  const one = <T extends { id: string; title: string }>(list: T[] | undefined): Item[] => {
    const found = (list ?? []).find((x) => x.id === block.ref_id);
    return found ? [{ id: found.id, title: found.title }] : [];
  };

  // `data-odt-draft`: lo que va al borrador del taller no cuenta como «sin guardar» del editor montado.
  const title = (
    <label className="admin-field admin-field--wide" data-odt-draft>
      <span>
        Título propio del bloque <small>opcional</small>
      </span>
      <input value={block.settings.title ?? ""} disabled={!canEdit} placeholder="Sin título propio: usa el del conjunto" onChange={(e) => set({ title: e.target.value || undefined })} />
    </label>
  );

  switch (block.kind) {
    case "desgloses": {
      const all = rows.breakdowns.filter((b) => b.report_id === reportId);
      const items = block.ref_id ? one(all) : shown ? byKeys(all, picks.breakdowns(shown)) : [];
      return (
        <div className="odt-editor odt-editor--mounted">
          {title}
          <DatasetSections
            items={items}
            guard={guard}
            empty="Este bloque no muestra ningún desglose. Elija abajo cuáles muestra, o cree uno con «Añadir algo a la ficha»."
            render={(item) => (
              <>
                <BreakdownCapture {...station} only={item.id} />
                <Definition station={station} kind="desglose" id={item.id} label="Definición y cómo se ve: título, unidad, formato, gráfica (circular, barras o composición), total, años y oficina" startOpen={mode === "completo"} />
              </>
            )}
          />
          {!block.ref_id && (
            <KeyPicker
              noun="Desgloses"
              options={all.map((b) => ({ key: b.key, label: b.title }))}
              chosen={block.settings.breakdowns ?? []}
              disabled={!canEdit}
              onChange={(keys) => set({ breakdowns: keys.length ? keys : undefined })}
            />
          )}
        </div>
      );
    }
    case "historico":
      return (
        <Single items={one(rows.histories)} missing="Este bloque no apunta a ninguna evolución histórica.">
          {(item) => (
            <div className="odt-editor odt-editor--mounted">
              {title}
              <HistoryCapture {...station} only={item.id} />
              <Definition station={station} kind="historico" id={item.id} label="Definición: título, descripción, unidad, formato, rótulo del total y oficina" startOpen={mode === "completo"} />
            </div>
          )}
        </Single>
      );
    case "mapa_calor":
      return (
        <Single items={one(rows.heatmaps)} missing="Este bloque no apunta a ningún mapa de calor.">
          {(item) => (
            <div className="odt-editor odt-editor--mounted">
              {title}
              <HeatmapCapture {...station} only={item.id} />
              <Definition station={station} kind="calor" id={item.id} label="Definición: título, filas, columnas, unidad, formato y oficina" startOpen={mode === "completo"} />
            </div>
          )}
        </Single>
      );
    case "tuberia":
      return (
        <Single items={one(rows.pipelines)} missing="Este bloque no apunta a ninguna tubería.">
          {(item) => (
            <div className="odt-editor odt-editor--mounted">
              {title}
              <PipelineCapture {...station} only={item.id} />
              <Definition station={station} kind="tuberia" id={item.id} label="Definición: título, descripción, qué se captura, etapas y oficina" startOpen={mode === "completo"} />
            </div>
          )}
        </Single>
      );
    case "mapa":
      return (
        <Single items={one(rows.maps)} missing="Este bloque no apunta a ningún mapa.">
          {(item) => (
            <div className="odt-editor odt-editor--mounted">
              {title}
              <MapCapture {...station} only={item.id} />
              <Definition station={station} kind="mapa" id={item.id} label="Definición: título, descripción, tipo de mapa, unidad, años y oficina" startOpen={mode === "completo"} />
              <p className="odt-note">Mostrar este mapa junto a otro (dos en una fila, o entrante y saliente en uno solo) se decide, por ahora, en la vista clásica (Diseño visual).</p>
            </div>
          )}
        </Single>
      );
    case "rankings": {
      const all = (rows.rankings ?? []).filter((r) => r.report_id === reportId);
      return (
        <div className="odt-editor odt-editor--mounted">
          {title}
          <DatasetSections
            items={shown ? byKeys(all, picks.rankings(shown)) : []}
            guard={guard}
            empty="Este bloque no muestra ningún ranking. Elija abajo cuáles muestra, o cree uno con «Añadir algo a la ficha»."
            render={(item) => (
              <>
                <RankingCapture {...station} only={item.id} />
                <Definition station={station} kind="ranking" id={item.id} label="Definición: título, descripción, sistema, color, vista con que abre y oficina" startOpen={mode === "completo"} />
              </>
            )}
          />
          <KeyPicker noun="Rankings" options={all.map((r) => ({ key: r.key, label: r.title }))} chosen={block.settings.rankings ?? []} disabled={!canEdit} onChange={(keys) => set({ rankings: keys.length ? keys : undefined })} />
        </div>
      );
    }
    case "medallero": {
      const all = (rows.medalBoards ?? []).filter((m) => m.report_id === reportId);
      return (
        <div className="odt-editor odt-editor--mounted">
          {title}
          <DatasetSections
            items={shown ? byKeys(all, picks.medals(shown)) : []}
            guard={guard}
            empty="Este bloque no muestra ningún medallero. Elija abajo cuáles muestra, o cree uno con «Añadir algo a la ficha»."
            render={(item) => (
              <>
                <MedalCapture {...station} only={item.id} />
                <Definition station={station} kind="medallero" id={item.id} label="Definición: título, qué compara cada fila, categorías de medalla, orden y oficina" startOpen={mode === "completo"} />
              </>
            )}
          />
          <KeyPicker noun="Medalleros" options={all.map((m) => ({ key: m.key, label: m.title }))} chosen={block.settings.medalleros ?? []} disabled={!canEdit} onChange={(keys) => set({ medalleros: keys.length ? keys : undefined })} />
        </div>
      );
    }
    case "saber_pro": {
      const all = (rows.saberPro ?? []).filter((sp) => sp.report_id === reportId).sort((a, b) => a.position - b.position);
      const key = shown ? saberProOf(viewReport, shown)?.id : undefined;
      const current = all.find((sp) => sp.key === key) ?? all[0];
      return (
        <div className="odt-editor odt-editor--mounted">
          {title}
          {all.length > 1 && (
            <label className="admin-field" data-odt-draft>
              <span>Resultados que muestra este bloque</span>
              <select value={block.settings.saberPro ?? ""} disabled={!canEdit} onChange={(e) => guard(() => set({ saberPro: e.target.value || undefined }))}>
                <option value="">El primero del informe ({all[0].title})</option>
                {all.map((sp) => <option key={sp.id} value={sp.key}>{sp.title}</option>)}
              </select>
            </label>
          )}
          {current ? (
            <>
              <SaberProCapture key={current.id} {...station} only={current.id} />
              <Definition station={station} kind="saber" id={current.id} label="Definición: título, descripción, nota y oficina" startOpen={mode === "completo"} />
            </>
          ) : (
            <p className="odt-empty">Este informe no tiene resultados Saber PRO. Créelos con «Añadir algo a la ficha».</p>
          )}
        </div>
      );
    }
    case "saber_tyt": {
      const all = (rows.saberTyt ?? []).filter((x) => x.report_id === reportId).sort((a, b) => a.position - b.position);
      const key = shown ? saberTytOf(viewReport, shown)?.id : undefined;
      const current = all.find((x) => x.key === key) ?? all[0];
      return (
        <div className="odt-editor odt-editor--mounted">
          {title}
          {all.length > 1 && (
            <label className="admin-field" data-odt-draft>
              <span>Conjunto que muestra este bloque</span>
              <select value={block.settings.saberTyt ?? ""} disabled={!canEdit} onChange={(e) => guard(() => set({ saberTyt: e.target.value || undefined }))}>
                <option value="">El primero del informe ({all[0].title})</option>
                {all.map((x) => <option key={x.id} value={x.key}>{x.title}</option>)}
              </select>
            </label>
          )}
          {current ? (
            <>
              <SaberTytCapture key={current.id} {...station} only={current.id} />
              <Definition station={station} kind="tyt" id={current.id} label="Definición: título, descripción, nota y oficina" startOpen={mode === "completo"} />
            </>
          ) : (
            <p className="odt-empty">Este informe no tiene el Motor Beta de Saber TyT. Créelo con «Añadir algo a la ficha».</p>
          )}
        </div>
      );
    }
    case "libre": {
      const freeSet = (rows.freeSets ?? []).find((fs) => fs.id === block.ref_id);
      if (!freeSet) return <p className="odt-empty">Este bloque no apunta a ningún conjunto libre.</p>;
      return (
        <div className="odt-editor odt-editor--mounted">
          {title}
          <label className="admin-field" data-odt-draft>
            <span>Gráfica que muestra este bloque</span>
            <select value={block.settings.view ?? ""} disabled={!canEdit} onChange={(e) => set({ view: e.target.value || undefined })}>
              <option value="">Todas las gráficas del conjunto ({freeSet.views.length})</option>
              {freeSet.views.map((v) => <option key={v.key} value={v.key}>{v.title}</option>)}
            </select>
          </label>
          {customViewOf(freeSet) ? <CustomTableCapture {...station} only={freeSet.id} /> : <FreeSetCapture {...station} only={freeSet.id} />}
        </div>
      );
    }
    case "tablas_personalizadas": {
      const all = (rows.freeSets ?? []).filter((fs) => fs.report_id === reportId && customViewOf(fs));
      return (
        <div className="odt-editor odt-editor--mounted">
          {title}
          <DatasetSections
            items={shown ? byKeys(all, picks.tables(shown)) : []}
            guard={guard}
            empty="Este bloque no muestra ninguna tabla. Elija abajo cuáles muestra, o cree una con «Añadir algo a la ficha»."
            render={(item) => <CustomTableCapture {...station} only={item.id} />}
          />
          <KeyPicker noun="Tablas" feminine options={all.map((fs) => ({ key: fs.key, label: fs.title }))} chosen={block.settings.tablas ?? []} disabled={!canEdit} onChange={(keys) => set({ tablas: keys.length ? keys : undefined })} />
        </div>
      );
    }
    case "imagenes":
      return <ImagesEditor block={block} reportSlug={report!.slug} canEdit={canEdit} onSettings={onSettings} title={title} />;
    case "evolucion":
      return (
        <div className="odt-editor">
          {title}
          <label className="admin-field">
            <span>Indicador con que abre</span>
            <select value={block.settings.indicator ?? ""} disabled={!canEdit} onChange={(e) => set({ indicator: e.target.value || undefined })}>
              <option value="">La cifra titular del informe</option>
              {viewReport.indicators.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
            <small className="odt-field__hint">En el portal, quien lee puede cambiar de indicador; este es el que ve al llegar.</small>
          </label>
          <div className="odt-field" role="group" aria-labelledby={`odt-abre-${block.tempId}`}>
            <span className="odt-field__label" id={`odt-abre-${block.tempId}`}>Abre en</span>
            <span className="odt-seg">
              {(["lineas", "barras"] as const).map((chart) => (
                <button key={chart} type="button" disabled={!canEdit} aria-pressed={(block.settings.chart ?? "lineas") === chart} onClick={() => set({ chart })}>
                  {chart === "lineas" ? "Líneas por campus" : "Barras por año"}
                </button>
              ))}
            </span>
          </div>
          <p className="odt-note">La evolución no se captura aparte: se dibuja con las cifras de los indicadores.</p>
        </div>
      );
    default:
      return null;
  }
}

/* --- Piezas -------------------------------------------------------------------------------- */

/** Un bloque de un solo conjunto: lo muestra, o dice que no apunta a ninguno. */
function Single({ items, missing, children }: { items: Item[]; missing: string; children: (item: Item) => ReactNode }) {
  return items[0] ? <>{children(items[0])}</> : <p className="odt-empty">{missing} Quítelo de la ficha o cree el conjunto con «Añadir algo a la ficha».</p>;
}

/** Varios conjuntos en un bloque: uno abierto a la vez, cada uno con su nombre. */
function DatasetSections({ items, render, empty, guard }: { items: Item[]; render: (item: Item) => ReactNode; empty: string; guard: (run: () => void) => void }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  if (!items.length) return <p className="odt-empty">{empty}</p>;
  if (items.length === 1) return <>{render(items[0])}</>;
  const current = items.find((i) => i.id === open) ? open : null;
  return (
    <div className="odt-sections">
      <p className="odt-note">Este bloque agrupa {items.length}. Se edita uno a la vez: toque su nombre para abrirlo.</p>
      {items.map((item) => {
        const active = item.id === current;
        return (
          <section key={item.id} className="odt-section" data-open={active || undefined}>
            <button type="button" className="odt-section__head" aria-expanded={active} onClick={() => guard(() => setOpen(active ? null : item.id))}>
              <Icon name="chevron-down" size={16} />
              <strong>{item.title}</strong>
              <span>{active ? "Cerrar" : "Editar este"}</span>
            </button>
            {active && <div className="odt-section__body">{render(item)}</div>}
          </section>
        );
      })}
    </div>
  );
}

/** La definición del conjunto: el formulario de Estructura, plegado. */
function Definition({ station, kind, id, label, startOpen }: { station: StationProps; kind: DatasetKind; id: string; label: string; startOpen: boolean }) {
  const saves = useDatasetSaves();
  const [open, setOpen] = useState(startOpen);
  const list = Object.values(saves);
  return (
    <section className="odt-section" data-open={open || undefined}>
      <button type="button" className="odt-section__head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="chevron-down" size={16} />
        <strong>{label}</strong>
        <span>{open ? "Cerrar" : "Abrir"}</span>
      </button>
      {open && (
        <div className="odt-section__body">
          <SaveState pending={list.some((m) => m.isPending)} error={list.find((m) => m.error)?.error ?? null} success={list.some((m) => m.isSuccess)} />
          {station.canEdit ? (
            <EditDatasetForm data={station.data} reportId={station.report!.uuid!} years={station.data.catalog.years} kind={kind} id={id} saves={saves} onCancel={() => setOpen(false)} onDone={() => setOpen(false)} />
          ) : (
            <p className="odt-note">Su rol consulta este informe: no puede cambiar la definición.</p>
          )}
        </div>
      )}
    </section>
  );
}

/** Qué conjuntos muestra un bloque que agrupa varios (como el selector de Diseño visual). */
function KeyPicker({ noun, feminine = false, options, chosen, disabled, onChange }: {
  noun: string;
  feminine?: boolean;
  options: { key: string; label: string }[];
  chosen: string[];
  disabled: boolean;
  onChange: (keys: string[]) => void;
}) {
  if (!options.length) return null;
  const lower = noun.toLowerCase();
  return (
    <details className="odt-picker" data-odt-draft>
      <summary>
        {noun} de este bloque: {chosen.length ? `${chosen.length} ${feminine ? "elegidas" : "elegidos"}` : `${feminine ? "las" : "los"} que ningún otro bloque eligió`}
      </summary>
      <div className="odt-picker__body">
        {options.map((option) => (
          <label key={option.key} className="odt-check">
            <input
              type="checkbox"
              disabled={disabled}
              checked={chosen.includes(option.key)}
              onChange={(e) =>
                onChange(e.target.checked ? options.map((o) => o.key).filter((key) => key === option.key || chosen.includes(key)) : chosen.filter((key) => key !== option.key))
              }
            />
            {option.label}
          </label>
        ))}
        <p className="odt-note">
          Sin elegir {feminine ? "ninguna" : "ninguno"}, el primer bloque sin elección muestra {feminine ? "las" : "los"} {lower} que ningún otro eligió; los demás quedan vacíos.
        </p>
      </div>
    </details>
  );
}

function ImagesEditor({ block, reportSlug, canEdit, onSettings, title }: { block: DraftBlock; reportSlug: string; canEdit: boolean; onSettings: (settings: Settings) => void; title: ReactNode }) {
  const [error, setError] = useState("");
  return (
    <div className="odt-editor">
      {title}
      <label className="admin-field admin-field--wide">
        <span>
          Descripción <small>opcional, bajo el título</small>
        </span>
        <input value={block.settings.description ?? ""} disabled={!canEdit} onChange={(e) => onSettings({ ...block.settings, description: e.target.value || undefined })} />
      </label>
      {error && (
        <p className="odt-field__hint" data-tone="risk" role="alert">
          {error}
        </p>
      )}
      <ImageGrid reportSlug={reportSlug} settings={block.settings} disabled={!canEdit} onChange={(patch) => onSettings({ ...block.settings, ...patch })} onError={setError} />
      <p className="odt-note">Cada fotografía lleva su descripción (qué muestra): es obligatoria. El orden se cambia con «Subir» y «Bajar» de cada imagen.</p>
    </div>
  );
}

/* --- Crear desde «Añadir algo a la ficha» ------------------------------------------------------ */

const MAP_MODES: { mode: OdMapMode; label: string }[] = [
  { mode: "origen", label: "Por departamento de Colombia" },
  { mode: "entrante", label: "Movilidad entrante (país → campus)" },
  { mode: "saliente", label: "Movilidad saliente (campus → país)" },
  { mode: "convenios", label: "Convenios internacionales por país" },
];

/**
 * El formulario de alta de la familia de un tipo de bloque: el de Estructura
 * (desglose, mapa de calor, mapa, tubería, histórico, ranking, medallero,
 * Saber PRO, Saber TyT) o el de Captura (conjunto libre, tabla personalizada).
 * Al crearse, el conjunto entra a la ficha con su bloque.
 */
export function AddDataset({ kind, station, onDone, onCancel }: { kind: OdBlockKind; station: StationProps; onDone: () => void; onCancel: () => void }) {
  const saves = useDatasetSaves();
  const [mode, setMode] = useState<OdMapMode>("origen");
  const list = Object.values(saves);
  if (kind === "libre") return <FreeSetCapture {...station} startCreating onCreated={onDone} onCancelCreate={onCancel} />;
  if (kind === "tablas_personalizadas") return <CustomTableCapture {...station} startCreating onCreated={onDone} onCancelCreate={onCancel} />;
  const family = DATASET_KIND[kind];
  if (!family) return null;
  return (
    <div className="odt-editor odt-editor--mounted">
      {kind === "mapa" && (
        <div className="odt-field" role="group" aria-labelledby="odt-tipo-mapa">
          <span className="odt-field__label" id="odt-tipo-mapa">Qué mapa quiere crear</span>
          <span className="odt-seg">
            {MAP_MODES.map((option) => (
              <button key={option.mode} type="button" aria-pressed={mode === option.mode} onClick={() => setMode(option.mode)}>
                {option.label}
              </button>
            ))}
          </span>
        </div>
      )}
      <SaveState pending={list.some((m) => m.isPending)} error={list.find((m) => m.error)?.error ?? null} success={false} />
      <NewDatasetForm key={`${family}-${mode}`} data={station.data} reportId={station.report!.uuid!} years={station.data.catalog.years} kind={family} mode={mode} saves={saves} onCancel={onCancel} onDone={onDone} />
    </div>
  );
}

/** Indicador nuevo, con el formulario y la fila de Estructura y KPI. */
export function NewIndicator({ station, onCreated, onCancel }: { station: StationProps; onCreated: (key: string) => void; onCancel: () => void }) {
  const save = useSaveIndicator();
  const reportId = station.report!.uuid!;
  const count = station.data.rows.indicators.filter((i) => i.report_id === reportId).length;
  return (
    <div className="odt-editor odt-editor--mounted">
      <SaveState pending={save.isPending} error={save.error} success={false} />
      <IndicatorForm
        initial={emptyIndicator}
        offices={station.data.rows.offices}
        years={station.data.catalog.years}
        submitLabel="Crear indicador"
        onCancel={onCancel}
        onSubmit={(draft) => {
          const key = draft.key || slugify(draft.label);
          save.mutate({ ...draft, report_id: reportId, key, position: count + 1 }, { onSuccess: () => onCreated(key) });
        }}
      />
    </div>
  );
}
