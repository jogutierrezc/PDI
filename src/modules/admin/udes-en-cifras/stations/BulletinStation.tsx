/* =============================================================================
   Estación 6 · Boletín.

   El Boletín UDES en Cifras es un documento A4 que se arma con las cifras del
   periodo. Hay uno global (todos los informes con datos) y, si hace falta, uno
   por informe. Aquí se crea, se diseña y se publica:
   · Plantilla: textos, portada y contraportada, colores y fuente.
   · Contenido: corte, campus, qué informes, indicadores y conjuntos entran, en
     qué orden, y qué muestra la hoja de cada indicador.
   · Publicación: en vivo en el portal y ediciones congeladas en PDF.

   La vista previa de la derecha pagina en vivo con lo que aún no se guardó.
   "Ver y descargar PDF" abre el documento solo (sin intranet) para imprimirlo:
   ese visor lee lo guardado.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { useAuth } from "../../../../lib/auth";
import { formatBytes } from "../../../../data/storage";
import type { OdBulletinEditionRow, OdBulletinRow } from "../../../../types/database";
import { withPeriodView } from "../../../datos-abiertos/data/open-data";
import { ALL_YEARS, cutLabel } from "../../../datos-abiertos/data/terms";
import type { OpenDataCatalog, Report } from "../../../datos-abiertos/data/types";
import { useWidth } from "../../../datos-abiertos/components/motion";
import { BulletinDocument } from "../../../boletin/BulletinDocument";
import {
  bulletinFileUrl,
  useBulletins,
  useCreateEdition,
  useDeleteBulletin,
  useDeleteEdition,
  useSaveBulletin,
  useSetBulletinStatus,
  useSetEditionStatus,
  useUploadBulletinImage,
} from "../../../boletin/data";
import { BULLETIN_FONTS, DEFAULT_EDITION, DEFAULT_IMAGES, DEFAULT_SHOW, DEFAULT_THEME, bulletinSlug, datasetRefs, normalizeSettings } from "../../../boletin/model";
import type { BulletinFont, BulletinFormat, BulletinSettings, EditionAlign, HeaderBadge, HeaderTint, IndicatorShow } from "../../../boletin/model";
import type { StationProps } from "../OdAdmin";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../ui";

type Tab = "plantilla" | "contenido" | "publicacion";

const SHOW_LABEL: Record<keyof IndicatorShow, string> = { evolution: "Evolución", campus: "Por campus", table: "Tabla", notes: "Notas" };

const DATASET_KIND: Record<string, string> = {
  desglose: "Desglose",
  mapa: "Mapa",
  calor: "Mapa de calor",
  tuberia: "Tubería",
  historico: "Evolución histórica",
  tabla: "Tabla",
};

const dateFormat = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });

export function BulletinStation({ data, report, periodId }: StationProps) {
  const { canEditPeriod, canEditReport } = useAuth();
  const bundle = useBulletins(periodId);
  const save = useSaveBulletin();
  const catalog = useMemo(() => withPeriodView(data.catalog), [data.catalog]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const bulletins = bundle.data?.bulletins ?? [];
  const global = bulletins.find((b) => b.slug === bulletinSlug(null));
  const executive = bulletins.find((b) => b.slug === bulletinSlug(null, "ejecutivo"));
  const selected = bulletins.find((b) => b.id === selectedId) ?? global ?? bulletins[0];
  const reportOf = (b: OdBulletinRow) => (b.report_id ? catalog.reports.find((r) => r.uuid === b.report_id) ?? null : null);
  const canEditBulletin = (b: { report_id: string | null }) => {
    if (!b.report_id) return canEditPeriod();
    const r = catalog.reports.find((x) => x.uuid === b.report_id);
    return r ? canEditReport(r.slug) : false;
  };

  const create = (target: Report | null, format: BulletinFormat = "completo") => {
    const slug = bulletinSlug(target?.slug ?? null, format);
    const base = format === "ejecutivo" ? "Resumen ejecutivo UDES en Cifras" : "Boletín UDES en Cifras";
    const title = target ? `${base} · ${target.name}` : base;
    save.mutate(
      {
        period_id: periodId,
        report_id: target?.uuid ?? null,
        slug,
        title,
        settings: normalizeSettings({ format }, catalog, target?.slug ?? null) as unknown as Record<string, unknown>,
      },
      { onSuccess: (row) => setSelectedId((row as OdBulletinRow).id) },
    );
  };

  const reportHasBulletin = report ? bulletins.some((b) => b.slug === bulletinSlug(report.slug)) : true;

  return (
    <div className="oda-stack">
      <Panel
        id="oda-boletines"
        title="Boletines del periodo"
        description="Un documento A4 con las cifras del periodo: uno global con todos los informes que tengan datos, uno por informe si hace falta, y un resumen ejecutivo con las cifras clave de cada informe. Se diseña aquí y se descarga en PDF."
        actions={
          <>
            <SaveState pending={save.isPending} error={save.error} success={false} />
            {!global && canEditPeriod() && (
              <button type="button" className="button-primary" disabled={save.isPending || bundle.isPending} onClick={() => create(null)}>
                <Icon name="plus" size={15} /> Crear boletín global
              </button>
            )}
            {!executive && canEditPeriod() && (
              <button type="button" className="button-secondary" disabled={save.isPending || bundle.isPending} onClick={() => create(null, "ejecutivo")}>
                <Icon name="plus" size={15} /> Crear resumen ejecutivo
              </button>
            )}
            {report && !reportHasBulletin && canEditReport(report.slug) && (
              <button type="button" className={global ? "button-primary" : "button-secondary"} disabled={save.isPending} onClick={() => create(report)}>
                <Icon name="plus" size={15} /> Boletín de {report.name}
              </button>
            )}
          </>
        }
      >
        {bundle.isPending ? (
          <p className="oda-muted">Cargando boletines…</p>
        ) : bundle.isError ? (
          <p className="oda-muted" role="alert">
            No se pudieron leer los boletines: {bundle.error instanceof Error ? bundle.error.message : "error desconocido"}. Si el error habla de
            una tabla que no existe, falta aplicar la migración 0027.
          </p>
        ) : bulletins.length === 0 ? (
          <p className="oda-muted">Todavía no hay boletines en este periodo. Crea el global para empezar con la plantilla de Planeación.</p>
        ) : (
          <ul className="oda-bulletins" role="list">
            {bulletins.map((b) => {
              const r = reportOf(b);
              const editions = bundle.data!.editions.filter((e) => e.bulletin_id === b.id);
              return (
                <li key={b.id}>
                  <button type="button" className="oda-bulletin" aria-pressed={b.id === selected?.id} onClick={() => setSelectedId(b.id)}>
                    <span className="oda-code" style={{ "--line": r ? `var(--od-line-${r.line})` : "var(--brand-navy)" } as CSSProperties}>
                      {r ? r.code : "UC"}
                    </span>
                    <span className="oda-bulletin__name">
                      {b.title}
                      <small>
                        {r ? `Informe ${r.name}` : "Global"} · {b.status === "publicado" ? "en vivo en el portal" : "borrador"} · {editions.length}{" "}
                        {editions.length === 1 ? "edición" : "ediciones"}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {selected ? (
        <BulletinEditor
          key={selected.id}
          row={selected}
          catalog={catalog}
          report={reportOf(selected)}
          periodLabel={data.rows.period.label}
          periodPublished={data.rows.period.status === "publicado"}
          editions={(bundle.data?.editions ?? []).filter((e) => e.bulletin_id === selected.id)}
          canEdit={canEditBulletin(selected)}
          onDeleted={() => setSelectedId(null)}
        />
      ) : (
        !bundle.isPending && !bundle.isError && (
          <StageEmpty title="Sin boletín elegido">Crea el boletín global o elige uno de la lista.</StageEmpty>
        )
      )}
    </div>
  );
}

/* --- Editor ------------------------------------------------------------------ */

function BulletinEditor({
  row,
  catalog,
  report,
  periodLabel,
  periodPublished,
  editions,
  canEdit,
  onDeleted,
}: {
  row: OdBulletinRow;
  catalog: OpenDataCatalog;
  report: Report | null;
  periodLabel: string;
  periodPublished: boolean;
  editions: OdBulletinEditionRow[];
  canEdit: boolean;
  onDeleted: () => void;
}) {
  const initial = useMemo(() => normalizeSettings(row.settings, catalog, report?.slug ?? null), [row.settings, catalog, report?.slug]);
  const [draft, setDraft] = useState<BulletinSettings>(initial);
  const [title, setTitle] = useState(row.title);
  const [tab, setTab] = useState<Tab>("contenido");
  const save = useSaveBulletin();
  const dirty = title !== row.title || JSON.stringify(draft) !== JSON.stringify(initial);

  // Lo guardado cambió por fuera (otra pestaña, otra persona): se toma si no hay cambios propios.
  const lastSaved = useRef(row.updated_at);
  useEffect(() => {
    if (row.updated_at !== lastSaved.current && !dirty) {
      setDraft(initial);
      setTitle(row.title);
    }
    lastSaved.current = row.updated_at;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.updated_at]);

  const persist = () =>
    save.mutate({ id: row.id, period_id: row.period_id, title: title.trim() || row.title, settings: draft as unknown as Record<string, unknown> });

  const preview = useRef<HTMLDivElement>(null);
  const previewWidth = useWidth(preview, 360);
  const [pages, setPages] = useState(0);

  return (
    <div className="oda-bulletin-editor">
      <div className="oda-stack">
        <Panel
          id="oda-boletin"
          title={row.title}
          description={
            report
              ? `Boletín del informe ${report.name}.`
              : "Boletín global: un capítulo por cada informe incluido que tenga cifras."
          }
          actions={
            <>
              <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} idle={dirty ? "Cambios sin guardar" : undefined} />
              <a
                className="button-secondary"
                href={`/admin/boletin/${row.id}`}
                target="_blank"
                rel="noreferrer"
                aria-disabled={dirty || undefined}
                title={dirty ? "Guarda primero: el visor abre lo guardado" : undefined}
                onClick={(event) => {
                  if (dirty) event.preventDefault();
                }}
              >
                <Icon name="external" size={15} /> Ver y descargar PDF
              </a>
              <button type="button" className="button-primary" disabled={!canEdit || !dirty || save.isPending} onClick={persist}>
                Guardar
              </button>
            </>
          }
        >
          <div className="oda-tabs" role="tablist" aria-label="Partes del boletín">
            {(
              [
                ["contenido", "Contenido"],
                ["plantilla", "Plantilla"],
                ["publicacion", "Publicación"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className="oda-tab" onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          <fieldset className="oda-bulletin-fields" disabled={!canEdit}>
            {tab === "plantilla" && (
              <TemplateTab row={row} title={title} setTitle={setTitle} draft={draft} setDraft={setDraft} />
            )}
            {tab === "contenido" && <ContentTab catalog={catalog} draft={draft} setDraft={setDraft} />}
          </fieldset>
          {tab === "publicacion" && (
            <PublishTab
              row={row}
              editions={editions}
              canEdit={canEdit}
              dirty={dirty}
              periodLabel={periodLabel}
              periodPublished={periodPublished}
              cut={draft.cut}
              onDeleted={onDeleted}
            />
          )}
        </Panel>
      </div>

      <aside className="oda-bulletin-preview" aria-label="Vista previa del boletín">
        <div className="oda-bulletin-preview__head">
          <strong>Vista previa</strong>
          <span>{pages ? `${pages} páginas A4` : "Paginando…"}{dirty ? " · sin guardar" : ""}</span>
        </div>
        <div ref={preview} className="oda-bulletin-preview__pages">
          <BulletinDocument catalog={catalog} settings={draft} report={report} fitWidth={previewWidth} onReady={setPages} />
        </div>
      </aside>
    </div>
  );
}

/* --- Pestaña: plantilla ---------------------------------------------------------- */

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`admin-field${wide ? " admin-field--wide" : ""}`}>
      <span>
        {label}
        {hint && <small> {hint}</small>}
      </span>
      {children}
    </label>
  );
}

function TemplateTab({
  row,
  title,
  setTitle,
  draft,
  setDraft,
}: {
  row: OdBulletinRow;
  title: string;
  setTitle: (t: string) => void;
  draft: BulletinSettings;
  setDraft: (s: BulletinSettings) => void;
}) {
  const texts = draft.texts;
  const setText = (patch: Partial<BulletinSettings["texts"]>) => setDraft({ ...draft, texts: { ...texts, ...patch } });
  const setTheme = (patch: Partial<BulletinSettings["theme"]>) => setDraft({ ...draft, theme: { ...draft.theme, ...patch } });

  return (
    <div className="oda-bulletin-template">
      <section>
        <h3>Documento</h3>
        <div className="oda-form-grid">
          <Field label="Título del boletín" hint="nombre del PDF y de la lista del portal" wide>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Pie de página">
            <input value={texts.footer} onChange={(e) => setText({ footer: e.target.value })} />
          </Field>
        </div>
      </section>

      <section>
        <h3>Portada</h3>
        <ImagePicker
          bulletinId={row.id}
          label="Imagen de portada"
          value={draft.images.cover}
          fallback={DEFAULT_IMAGES.cover}
          onChange={(cover) => setDraft({ ...draft, images: { ...draft.images, cover } })}
        />
        <label className="oda-inline-check">
          <input
            type="checkbox"
            checked={draft.images.coverText}
            onChange={(e) => setDraft({ ...draft, images: { ...draft.images, coverText: e.target.checked } })}
          />
          <span>
            Escribir título, subtítulo y dependencia sobre la portada{" "}
            <small>solo con una portada propia sin texto: la de la plantilla ya los trae dibujados</small>
          </span>
        </label>
        <div className="oda-bulletin-edition">
          <ColorField
            label="Color de la edición (informe · periodo)"
            value={draft.edition.color}
            onChange={(color) => setDraft({ ...draft, edition: { ...draft.edition, color } })}
          />
          <div className="oda-bulletin-align" role="group" aria-label="Alineación de la edición">
            <span>Alineación</span>
            {(
              [
                ["izquierda", "Izquierda"],
                ["centro", "Centro"],
                ["derecha", "Derecha"],
              ] as [EditionAlign, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={draft.edition.align === value}
                onClick={() => setDraft({ ...draft, edition: { ...draft.edition, align: value } })}
              >
                {label}
              </button>
            ))}
          </div>
          {(draft.edition.color !== DEFAULT_EDITION.color || draft.edition.align !== DEFAULT_EDITION.align) && (
            <button type="button" className="oda-link-button" onClick={() => setDraft({ ...draft, edition: DEFAULT_EDITION })}>
              Blanco y centrado, como la plantilla
            </button>
          )}
        </div>
        {draft.images.coverText && (
          <div className="oda-form-grid">
            <Field label="Título" wide>
              <input value={texts.coverTitle} onChange={(e) => setText({ coverTitle: e.target.value })} />
            </Field>
            <Field label="Subtítulo" wide>
              <input value={texts.coverSubtitle} onChange={(e) => setText({ coverSubtitle: e.target.value })} />
            </Field>
            <Field label="Dependencia">
              <input value={texts.coverOffice} onChange={(e) => setText({ coverOffice: e.target.value })} />
            </Field>
          </div>
        )}
      </section>

      <section>
        <h3>Páginas de contenido</h3>
        <ImagePicker
          bulletinId={row.id}
          label="Imagen de fondo"
          hint="A4 vertical, 2480×3508 px. Va detrás del contenido: una marca de agua suave o la página modelo actualizada."
          value={draft.images.content}
          fallback={null}
          emptyLabel="Sin fondo: página blanca, como la plantilla"
          onChange={(content) => setDraft({ ...draft, images: { ...draft.images, content, contentHasHeader: content ? draft.images.contentHasHeader : false } })}
        />
        {draft.images.content && (
          <label className="oda-inline-check">
            <input
              type="checkbox"
              checked={draft.images.contentHasHeader}
              onChange={(e) => setDraft({ ...draft, images: { ...draft.images, contentHasHeader: e.target.checked } })}
            />
            <span>
              La imagen ya trae la cabecera dibujada <small>el boletín no pinta la suya encima; los textos de la franja no se usan</small>
            </span>
          </label>
        )}
        {!(draft.images.content && draft.images.contentHasHeader) && (
          <div className="oda-bulletin-header-images">
            <ImagePicker
              bulletinId={row.id}
              label="Dibujo de la franja"
              hint="PNG con transparencia y trazo claro, unos 1060×216 px. Se alinea a la derecha de la franja."
              value={draft.images.headerArt}
              fallback={DEFAULT_IMAGES.headerArt}
              shape="band"
              onChange={(headerArt) => setDraft({ ...draft, images: { ...draft.images, headerArt } })}
            />
            <ImagePicker
              bulletinId={row.id}
              label="Logo de la barra"
              hint="PNG con transparencia y logo claro, unos 250×96 px."
              value={draft.images.headerLogo}
              fallback={DEFAULT_IMAGES.headerLogo}
              shape="logo"
              onChange={(headerLogo) => setDraft({ ...draft, images: { ...draft.images, headerLogo } })}
            />
          </div>
        )}
      </section>

      <section>
        <h3>Cabecera de las páginas</h3>
        <div className="oda-form-grid">
          <Field label="Título de la franja">
            <input value={texts.headerTitle} onChange={(e) => setText({ headerTitle: e.target.value })} />
          </Field>
          <Field label="Dependencia de la barra">
            <input value={texts.headerOffice} onChange={(e) => setText({ headerOffice: e.target.value })} />
          </Field>
        </div>
        <div className="oda-bulletin-align" role="group" aria-label="Color de la barra y la franja">
          <span>Color de la cabecera</span>
          {(
            [
              ["informe", "El del informe"],
              ["tema", "El del tema"],
            ] as [HeaderTint, string][]
          ).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={draft.headerTint === value} onClick={() => setDraft({ ...draft, headerTint: value })}>
              {label}
            </button>
          ))}
        </div>
        <p className="oda-muted">
          Con «el del informe», cada página toma el color de línea de su informe —el mismo de su insignia en el portal y de su pestaña—, y la barra lo repite
          oscurecido. La portada, el contenido y el resumen siguen con el tema.
        </p>
        <div className="oda-bulletin-align" role="group" aria-label="Insignia del informe sobre el dibujo de la franja">
          <span>Informe sobre el dibujo</span>
          {(
            [
              ["relleno", "Insignia blanca"],
              ["contorno", "Solo contorno"],
              ["ninguna", "Sin insignia"],
            ] as [HeaderBadge, string][]
          ).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={draft.headerBadge === value} onClick={() => setDraft({ ...draft, headerBadge: value })}>
              {label}
            </button>
          ))}
        </div>
        <label className="oda-inline-check">
          <input type="checkbox" checked={draft.tabs} onChange={(e) => setDraft({ ...draft, tabs: e.target.checked })} />
          <span>
            Pestañas de capítulo en el borde <small>una por informe, en su color y enlazada a su capítulo</small>
          </span>
        </label>
      </section>

      <section>
        <h3>Presentación</h3>
        <div className="oda-form-grid">
          <Field label="Título">
            <input value={texts.presentationTitle} onChange={(e) => setText({ presentationTitle: e.target.value })} />
          </Field>
          <Field label="Texto" hint="separa los párrafos con una línea en blanco" wide>
            <textarea rows={6} value={texts.presentation} onChange={(e) => setText({ presentation: e.target.value })} />
          </Field>
        </div>
      </section>

      <section>
        <h3>Contraportada</h3>
        <ImagePicker
          bulletinId={row.id}
          label="Imagen de contraportada"
          value={draft.images.back}
          fallback={DEFAULT_IMAGES.back}
          onChange={(back) => setDraft({ ...draft, images: { ...draft.images, back } })}
        />
        <div className="oda-form-grid">
          <Field label="Título de la lista de oficinas">
            <input value={texts.backTitle} onChange={(e) => setText({ backTitle: e.target.value })} />
          </Field>
          <Field label="Nota" wide>
            <textarea rows={2} value={texts.backNote} onChange={(e) => setText({ backNote: e.target.value })} />
          </Field>
        </div>
      </section>

      <section>
        <h3>Colores y fuente</h3>
        <div className="oda-bulletin-theme">
          <ColorField label="Barra superior y títulos" value={draft.theme.navy} onChange={(navy) => setTheme({ navy })} />
          <ColorField label="Franja y gráficas" value={draft.theme.band} onChange={(band) => setTheme({ band })} />
          <ColorField label="Acento y rutas de llegada" value={draft.theme.accent} onChange={(accent) => setTheme({ accent })} />
          <Field label="Fuente">
            <select value={draft.theme.font} onChange={(e) => setTheme({ font: e.target.value as BulletinFont })}>
              {BULLETIN_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                  {f === DEFAULT_THEME.font ? " (plantilla)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className="oda-link-button" onClick={() => setTheme(DEFAULT_THEME)}>
            Volver a los colores y la fuente de la plantilla
          </button>
        </div>
      </section>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="oda-color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>
        {label}
        <small>{value.toUpperCase()}</small>
      </span>
    </label>
  );
}

function ImagePicker({
  bulletinId,
  label,
  hint = "A4 vertical, idealmente 2480×3508 px",
  value,
  fallback,
  emptyLabel = "La de la plantilla de Planeación",
  shape = "page",
  onChange,
}: {
  bulletinId: string;
  label: string;
  hint?: string;
  value: string | null;
  /** Imagen de la plantilla; null = sin imagen por defecto. */
  fallback: string | null;
  emptyLabel?: string;
  /** Miniatura: página A4, franja de cabecera o logo (estos dos sobre azul, porque son claros). */
  shape?: "page" | "band" | "logo";
  onChange: (url: string | null) => void;
}) {
  const upload = useUploadBulletinImage();
  const shown = value ?? fallback;
  return (
    <div className="oda-image-picker" data-shape={shape}>
      {shown ? <img src={shown} alt="" /> : <span className="oda-image-picker__blank" aria-hidden="true" />}
      <div>
        <strong>{label}</strong>
        <small>{value ? "Imagen propia" : emptyLabel} · {hint}</small>
        <div className="oda-image-picker__actions">
          <label className="button-secondary oda-file-button">
            <Icon name="download" size={14} style={{ transform: "rotate(180deg)" }} />
            Subir imagen
            <input
              type="file"
              accept=".webp,.png,.jpg,.jpeg"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) upload.mutate({ bulletinId, file }, { onSuccess: (url) => onChange(url) });
              }}
            />
          </label>
          {value && (
            <button type="button" className="oda-link-button" onClick={() => onChange(null)}>
              Usar la de la plantilla
            </button>
          )}
          <SaveState pending={upload.isPending} error={upload.error} success={false} />
        </div>
      </div>
    </div>
  );
}

/* --- Pestaña: contenido ------------------------------------------------------------ */

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function ContentTab({ catalog, draft, setDraft }: { catalog: OpenDataCatalog; draft: BulletinSettings; setDraft: (s: BulletinSettings) => void }) {
  const [open, setOpen] = useState<string | null>(draft.reports.length === 1 ? draft.reports[0].slug : null);
  const setReports = (reports: BulletinSettings["reports"]) => setDraft({ ...draft, reports });
  const patchReport = (slug: string, patch: Partial<BulletinSettings["reports"][number]>) =>
    setReports(draft.reports.map((r) => (r.slug === slug ? { ...r, ...patch } : r)));
  const setAllShow = (key: keyof IndicatorShow, value: boolean) =>
    setReports(draft.reports.map((r) => ({ ...r, indicators: r.indicators.map((i) => ({ ...i, show: { ...i.show, [key]: value } })) })));
  const allOn = (key: keyof IndicatorShow) => draft.reports.every((r) => r.indicators.every((i) => i.show[key]));
  const visible = draft.reports.filter((r) => !r.removed);
  const removed = draft.reports.filter((r) => r.removed);
  /** Sube o baja un informe entre los que siguen en el boletín. */
  const moveReport = (slug: string, step: -1 | 1) => {
    const at = visible.findIndex((r) => r.slug === slug);
    const other = visible[at + step];
    if (!other) return;
    const from = draft.reports.findIndex((r) => r.slug === slug);
    const to = draft.reports.findIndex((r) => r.slug === other.slug);
    setReports(move(draft.reports, from, to));
  };

  const executive = draft.format === "ejecutivo";
  return (
    <div className="oda-bulletin-content">
      <div className="oda-bulletin-format">
        <div className="oda-bulletin-align" role="group" aria-label="Tipo de boletín">
          <span>Tipo de boletín</span>
          {(
            [
              ["completo", "Completo"],
              ["ejecutivo", "Ejecutivo"],
            ] as [BulletinFormat, string][]
          ).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={draft.format === value} onClick={() => setDraft({ ...draft, format: value })}>
              {label}
            </button>
          ))}
        </div>
        <p className="oda-muted">
          {executive
            ? "Síntesis: una página de resumen con las cifras titulares de cada informe y una ficha por informe con hasta seis cifras clave, su tendencia y el reparto por campus. Toma los KPI del informe entre los indicadores incluidos."
            : "Un capítulo por informe con una hoja por indicador y conjunto visual."}
        </p>
        {!executive && (
          <label className="oda-inline-check">
            <input type="checkbox" checked={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.checked })} />
            <span>
              Abrir con un resumen ejecutivo <small>una página con las cifras titulares de cada informe, antes de los capítulos</small>
            </span>
          </label>
        )}
      </div>
      <div className="oda-form-grid">
        <Field label="Corte">
          <select value={draft.cut} onChange={(e) => setDraft({ ...draft, cut: Number(e.target.value) })}>
            <option value={ALL_YEARS}>Todos · {cutLabel(ALL_YEARS, null)} (promedio anual o último dato)</option>
            {catalog.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Campus">
          <select value={draft.campus} onChange={(e) => setDraft({ ...draft, campus: e.target.value })}>
            {catalog.campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id === "todas" ? "Todos los campus" : c.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="oda-inline-check admin-field--wide">
          <input type="checkbox" checked={draft.skipEmpty} onChange={(e) => setDraft({ ...draft, skipEmpty: e.target.checked })} />
          <span>
            Omitir lo que no tiene cifras <small>indicadores y conjuntos vacíos, e informes que se quedan sin hojas</small>
          </span>
        </label>
      </div>

      <div className="oda-bulletin-show" role="group" aria-label="Lo que muestra la hoja de cada indicador, para todos">
        <span>Hoja de indicador, en todos:</span>
        {(Object.keys(SHOW_LABEL) as (keyof IndicatorShow)[]).map((key) => (
          <label key={key} className="oda-chip-check">
            <input type="checkbox" checked={allOn(key)} onChange={(e) => setAllShow(key, e.target.checked)} />
            {SHOW_LABEL[key]}
          </label>
        ))}
      </div>

      <ol className="oda-bulletin-reports">
        {visible.map((entry, index) => {
          const report = catalog.reports.find((r) => r.slug === entry.slug);
          if (!report) return null;
          const expanded = open === entry.slug;
          const titles = new Map(datasetRefs(report).map((d) => [d.ref, d.title]));
          const included = entry.indicators.filter((i) => i.include).length;
          return (
            <li key={entry.slug} data-off={!entry.include || undefined}>
              <div className="oda-bulletin-report">
                <input
                  type="checkbox"
                  checked={entry.include}
                  aria-label={`Incluir ${report.name}`}
                  onChange={(e) => patchReport(entry.slug, { include: e.target.checked })}
                />
                <span className="oda-code" style={{ "--line": `var(--od-line-${report.line})` } as CSSProperties}>
                  {report.code}
                </span>
                <button type="button" className="oda-bulletin-report__name" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : entry.slug)}>
                  {report.name}
                  <small>
                    {included} de {entry.indicators.length} indicadores · {entry.datasets.filter((d) => d.include).length} conjuntos
                  </small>
                  <Icon name="chevron-down" size={15} style={expanded ? { transform: "rotate(180deg)" } : undefined} />
                </button>
                <span className="oda-bulletin-order">
                  {visible.length > 1 && (
                    <>
                      <button type="button" className="icon-button" aria-label={`Subir ${report.name}`} disabled={index === 0} onClick={() => moveReport(entry.slug, -1)}>
                        <Icon name="chevron-down" size={14} style={{ transform: "rotate(180deg)" }} />
                      </button>
                      <button type="button" className="icon-button" aria-label={`Bajar ${report.name}`} disabled={index === visible.length - 1} onClick={() => moveReport(entry.slug, 1)}>
                        <Icon name="chevron-down" size={14} />
                      </button>
                    </>
                  )}
                  {draft.reports.length > 1 && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Quitar ${report.name} del boletín`}
                      title="Quitar del boletín"
                      onClick={() => patchReport(entry.slug, { removed: true })}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </span>
              </div>

              {expanded && (
                <div className="oda-bulletin-items">
                  <h4>Indicadores · una hoja cada uno</h4>
                  {entry.indicators.length === 0 && <p className="oda-muted">Este informe no tiene indicadores.</p>}
                  <ol>
                    {entry.indicators.map((item, i) => {
                      const indicator = report.indicators.find((x) => x.id === item.id);
                      if (!indicator) return null;
                      const hasData = catalog.years.some((y) => Object.values(indicator.values[y] ?? {}).some((v) => v !== null && v !== undefined));
                      const patch = (p: Partial<typeof item>) =>
                        patchReport(entry.slug, { indicators: entry.indicators.map((x) => (x.id === item.id ? { ...x, ...p } : x)) });
                      return (
                        <li key={item.id} data-off={!item.include || undefined}>
                          <label className="oda-bulletin-item__name">
                            <input type="checkbox" checked={item.include} onChange={(e) => patch({ include: e.target.checked })} />
                            <span>
                              {indicator.label}
                              {!hasData && <small className="oda-bulletin-empty">sin cifras</small>}
                            </span>
                          </label>
                          <span className="oda-bulletin-item__show">
                            {(Object.keys(SHOW_LABEL) as (keyof IndicatorShow)[]).map((key) => (
                              <label key={key} className="oda-chip-check">
                                <input type="checkbox" checked={item.show[key]} disabled={!item.include} onChange={(e) => patch({ show: { ...item.show, [key]: e.target.checked } })} />
                                {SHOW_LABEL[key]}
                              </label>
                            ))}
                          </span>
                          <span className="oda-bulletin-order">
                            <button type="button" className="icon-button" aria-label={`Subir ${indicator.label}`} disabled={i === 0} onClick={() => patchReport(entry.slug, { indicators: move(entry.indicators, i, i - 1) })}>
                              <Icon name="chevron-down" size={13} style={{ transform: "rotate(180deg)" }} />
                            </button>
                            <button type="button" className="icon-button" aria-label={`Bajar ${indicator.label}`} disabled={i === entry.indicators.length - 1} onClick={() => patchReport(entry.slug, { indicators: move(entry.indicators, i, i + 1) })}>
                              <Icon name="chevron-down" size={13} />
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ol>

                  {entry.datasets.length > 0 && (
                    <>
                      <h4>Conjuntos visuales · después de los indicadores</h4>
                      <ol>
                        {entry.datasets.map((item, i) => (
                          <li key={item.ref} data-off={!item.include || undefined}>
                            <label className="oda-bulletin-item__name">
                              <input
                                type="checkbox"
                                checked={item.include}
                                onChange={(e) =>
                                  patchReport(entry.slug, { datasets: entry.datasets.map((d) => (d.ref === item.ref ? { ...d, include: e.target.checked } : d)) })
                                }
                              />
                              <span>
                                {titles.get(item.ref) ?? item.ref}
                                <small>{DATASET_KIND[item.ref.split(":")[0]] ?? "Conjunto"}</small>
                              </span>
                            </label>
                            <span className="oda-bulletin-order">
                              <button type="button" className="icon-button" aria-label="Subir" disabled={i === 0} onClick={() => patchReport(entry.slug, { datasets: move(entry.datasets, i, i - 1) })}>
                                <Icon name="chevron-down" size={13} style={{ transform: "rotate(180deg)" }} />
                              </button>
                              <button type="button" className="icon-button" aria-label="Bajar" disabled={i === entry.datasets.length - 1} onClick={() => patchReport(entry.slug, { datasets: move(entry.datasets, i, i + 1) })}>
                                <Icon name="chevron-down" size={13} />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {removed.length > 0 && (
        <div className="oda-bulletin-removed">
          <span>Quitados del boletín:</span>
          <ul>
            {removed.map((entry) => {
              const report = catalog.reports.find((r) => r.slug === entry.slug);
              if (!report) return null;
              return (
                <li key={entry.slug}>
                  <button type="button" className="oda-chip" onClick={() => patchReport(entry.slug, { removed: false })}>
                    <Icon name="plus" size={13} /> {report.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="oda-muted">
        Por defecto cada hoja muestra {Object.values(DEFAULT_SHOW).filter(Boolean).length} partes: evolución, detalle por campus, tabla y columna de notas.
      </p>
    </div>
  );
}

/* --- Pestaña: publicación ------------------------------------------------------------ */

function PublishTab({
  row,
  editions,
  canEdit,
  dirty,
  periodLabel,
  periodPublished,
  cut,
  onDeleted,
}: {
  row: OdBulletinRow;
  editions: OdBulletinEditionRow[];
  canEdit: boolean;
  dirty: boolean;
  periodLabel: string;
  periodPublished: boolean;
  cut: number;
  onDeleted: () => void;
}) {
  const setStatus = useSetBulletinStatus();
  const createEdition = useCreateEdition();
  const setEditionStatus = useSetEditionStatus();
  const deleteEdition = useDeleteEdition();
  const deleteBulletin = useDeleteBulletin();
  const [confirmLive, setConfirmLive] = useState(false);
  const month = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(new Date());
  const [label, setLabel] = useState(`Edición ${month}`);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const live = row.status === "publicado";
  const cutText = cut === ALL_YEARS ? `Periodo ${cutLabel(ALL_YEARS, null)}` : `Corte ${cut}`;

  return (
    <div className="oda-bulletin-publish">
      <section>
        <h3>En vivo en el portal</h3>
        <p className="oda-muted">
          El boletín en vivo se arma con las cifras publicadas en cada momento y se lee en{" "}
          <a href={`/datos-abiertos/boletines/${row.slug}`} target="_blank" rel="noreferrer">
            /datos-abiertos/boletines/{row.slug}
          </a>
          .{!periodPublished && " El periodo está en borrador: el público no lo verá hasta publicar el periodo."}
        </p>
        <div className="oda-bulletin-live">
          <span className="oda-status-pill" data-status={live ? "publicado" : "borrador"}>
            <Icon name={live ? "check" : "alert"} size={13} />
            {live ? "Publicado en vivo" : "Borrador: solo en la intranet"}
          </span>
          {confirmLive ? (
            <span className="oda-confirm" role="group" aria-label="Confirmar">
              <span>{live ? "El boletín deja de verse en el portal." : "El boletín se verá en el portal con las cifras publicadas."}</span>
              <button
                type="button"
                className="oda-link-button"
                onClick={() => {
                  setConfirmLive(false);
                  setStatus.mutate({ id: row.id, status: live ? "borrador" : "publicado" });
                }}
              >
                {live ? "Sí, retirar" : "Sí, publicar"}
              </button>
              <button type="button" className="oda-link-button" onClick={() => setConfirmLive(false)}>
                Cancelar
              </button>
            </span>
          ) : (
            <button type="button" className={live ? "button-secondary" : "button-primary"} disabled={!canEdit || dirty || setStatus.isPending} onClick={() => setConfirmLive(true)}>
              {live ? "Retirar del portal" : "Publicar en vivo"}
            </button>
          )}
          <SaveState pending={setStatus.isPending} error={setStatus.error} success={setStatus.isSuccess} idle={dirty ? "Guarda los cambios antes de publicar" : undefined} />
        </div>
      </section>

      <section>
        <h3>Ediciones en PDF</h3>
        <ol className="oda-steps">
          <li>
            Abre <b>Ver y descargar PDF</b>, pulsa <b>Descargar PDF</b> y en el diálogo elige <b>Guardar como PDF</b>.
          </li>
          <li>Sube aquí ese archivo: queda como edición congelada, con su fecha, y el portal la ofrece para descargar.</li>
        </ol>
        <form
          className="oda-form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            createEdition.mutate(
              { bulletin: row, file, label: label.trim() || `Edición ${month}`, cutLabel: cutText, periodLabel, note: note.trim() },
              { onSuccess: () => setFile(null) },
            );
          }}
        >
          <Field label="Nombre de la edición">
            <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Nota" hint="opcional">
            <input value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} placeholder="Cifras con corte a junio" />
          </Field>
          <div className="admin-field--wide oda-bulletin-upload">
            <label className="button-secondary oda-file-button">
              <Icon name="download" size={14} style={{ transform: "rotate(180deg)" }} />
              {file ? "Cambiar PDF" : "Elegir PDF"}
              <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={!canEdit} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <span className="oda-muted">{file ? `${file.name} · ${formatBytes(file.size)}` : "Ningún archivo elegido"}</span>
            <button type="submit" className="button-primary" disabled={!canEdit || !file || createEdition.isPending}>
              Publicar edición
            </button>
            <SaveState pending={createEdition.isPending} error={createEdition.error} success={createEdition.isSuccess} />
          </div>
        </form>

        {editions.length > 0 ? (
          <ul className="oda-editions">
            {editions.map((edition) => (
              <li key={edition.id} data-status={edition.status}>
                <div>
                  <strong>{edition.label}</strong>
                  <small>
                    {dateFormat.format(new Date(edition.published_at))} · {edition.cut_label} · {formatBytes(edition.file_size)} ·{" "}
                    {edition.status === "publicado" ? "en el portal" : "retirada"}
                  </small>
                  {edition.note && <small>{edition.note}</small>}
                </div>
                <span className="oda-editions__actions">
                  <a className="oda-link-button" href={bulletinFileUrl(edition.file_path)} target="_blank" rel="noreferrer">
                    Abrir PDF
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      className="oda-link-button"
                      onClick={() => setEditionStatus.mutate({ id: edition.id, status: edition.status === "publicado" ? "retirado" : "publicado" })}
                    >
                      {edition.status === "publicado" ? "Retirar del portal" : "Volver a publicar"}
                    </button>
                  )}
                  {canEdit && (
                    <ConfirmButton label="Borrar" confirmLabel="Se borra el PDF y deja de estar disponible." onConfirm={() => deleteEdition.mutate(edition)} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="oda-muted">Aún no hay ediciones de este boletín.</p>
        )}
        <SaveState pending={setEditionStatus.isPending || deleteEdition.isPending} error={setEditionStatus.error ?? deleteEdition.error} success={false} />
      </section>

      {canEdit && (
        <section className="oda-bulletin-danger">
          <h3>Borrar el boletín</h3>
          <p className="oda-muted">Se borran la plantilla y todas sus ediciones en PDF. Las cifras de los informes no se tocan.</p>
          <ConfirmButton
            label="Borrar boletín"
            confirmLabel={`Se borran la plantilla y ${editions.length} ${editions.length === 1 ? "edición" : "ediciones"}.`}
            onConfirm={() => deleteBulletin.mutate({ id: row.id, files: editions.map((e) => e.file_path) }, { onSuccess: onDeleted })}
          />
          <SaveState pending={deleteBulletin.isPending} error={deleteBulletin.error} success={false} />
        </section>
      )}
    </div>
  );
}
