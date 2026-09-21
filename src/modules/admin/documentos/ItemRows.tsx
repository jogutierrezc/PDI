/* =============================================================================
   Intranet · Documentos de una colección.

   La lista se lee de un vistazo —tipo, nombre, año, versión y si está
   publicado— y solo se abre el documento que se va a editar. Un formulario de
   diez campos por cada acta convertiría la pantalla en un muro.

   Dos formas de añadir, y la diferencia importa: subir un archivo lo deja en
   el bucket de la universidad y lo mide; pegar un enlace apunta a algo que
   vive fuera y que puede desaparecer sin avisar. La fila dice cuál es cuál.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { ConfirmButton, Panel } from "../udes-en-cifras/ui";
import { documentHref, documentType } from "../../documentos/data";
import type { DocCollection, DocItem } from "../../documentos/data";
import {
  MAX_DOC_BYTES,
  formatBytes,
  removeDocFiles,
  uploadDocFile,
  useRemoveItem,
  useSaveItem,
} from "./store";

const blankItem = (collectionId: string, position: number): Omit<DocItem, "updatedAt"> => ({
  id: crypto.randomUUID(),
  collectionId,
  title: "",
  description: "",
  kind: "enlace",
  url: "",
  path: null,
  fileName: "",
  fileType: "",
  sizeBytes: null,
  year: new Date().getFullYear(),
  yearTo: null,
  issuedOn: null,
  version: "",
  supersedes: null,
  status: "borrador",
  position,
});

export function ItemRows({
  collection,
  items,
  canEdit,
  notify,
  fail,
}: {
  collection: DocCollection;
  items: DocItem[];
  canEdit: boolean;
  notify: (message: string) => void;
  fail: (message: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Omit<DocItem, "updatedAt">[]>([]);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const save = useSaveItem();
  const remove = useRemoveItem();

  const published = items.filter((item) => item.status === "publicado").length;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      let position = items.length + drafts.length;
      const added: Omit<DocItem, "updatedAt">[] = [];
      for (const file of Array.from(files)) {
        const uploaded = await uploadDocFile(collection.id, file);
        position += 1;
        added.push({
          ...blankItem(collection.id, position),
          kind: "archivo",
          url: null,
          path: uploaded.path,
          fileName: uploaded.fileName,
          fileType: uploaded.fileType,
          sizeBytes: uploaded.sizeBytes,
          // El nombre del archivo es el mejor primer título: se corrige, pero
          // nunca se queda en blanco.
          title: uploaded.fileName.replace(/\.[^.]+$/, ""),
        });
      }
      setDrafts((current) => [...current, ...added]);
      setOpen(added[0]?.id ?? null);
      notify(
        added.length === 1
          ? "Archivo subido. Completa su año y publícalo cuando esté listo."
          : `${added.length} archivos subidos. Completa sus datos antes de publicarlos.`,
      );
    } catch (uploadFailure) {
      fail(uploadFailure instanceof Error ? uploadFailure.message : "No se pudo subir el archivo.");
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = "";
    }
  }

  function addLink() {
    const item = blankItem(collection.id, items.length + drafts.length + 1);
    setDrafts((current) => [...current, item]);
    setOpen(item.id);
  }

  function move(item: DocItem, step: -1 | 1) {
    const index = items.findIndex((row) => row.id === item.id);
    const target = index + step;
    if (target < 0 || target >= items.length) return;
    const other = items[target];
    // Se intercambian las posiciones de los dos, no se renumera la lista:
    // dos escrituras en vez de veinte.
    save.mutate({ ...item, position: other.position });
    save.mutate({ ...other, position: item.position });
  }

  const rows = [...items, ...drafts];

  return (
    <Panel
      title={rows.length ? `${rows.length} ${rows.length === 1 ? "documento" : "documentos"}` : "Documentos"}
      description={
        rows.length
          ? `${published} ${published === 1 ? "publicado" : "publicados"}. Dentro de cada año, el índice del portal sigue este orden.`
          : "Sube archivos al repositorio o añade enlaces a documentos que viven fuera."
      }
      actions={
        canEdit && (
          <>
            <input
              ref={picker}
              type="file"
              multiple
              className="sr-only"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.jpg,.jpeg,.png,.webp"
              onChange={(event) => void addFiles(event.target.files)}
            />
            <button type="button" className="button-secondary" onClick={addLink}>
              <Icon name="external" size={15} /> Añadir enlace
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={uploading}
              onClick={() => picker.current?.click()}
            >
              {uploading ? (
                <>
                  <span className="oda-save__spinner" aria-hidden="true" /> Subiendo…
                </>
              ) : (
                <>
                  <Icon name="upload" size={15} /> Subir archivos
                </>
              )}
            </button>
          </>
        )
      }
    >
      {rows.length === 0 ? (
        <p className="oda-muted">
          La colección está vacía. Mientras lo esté, el portal la muestra con cero documentos: publícala solo
          cuando tenga algo dentro.
        </p>
      ) : (
        <ol className="doc-items">
          {rows.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              siblings={items}
              isDraft={drafts.some((d) => d.id === item.id)}
              replacedBy={items.find((row) => row.supersedes === item.id) ?? null}
              open={open === item.id}
              canEdit={canEdit}
              pending={save.isPending}
              onToggle={() => setOpen(open === item.id ? null : item.id)}
              onMove={(step) => move(item as DocItem, step)}
              onSave={(next) =>
                save.mutate(next, {
                  onSuccess: () => {
                    setDrafts((current) => current.filter((d) => d.id !== next.id));
                    setOpen(null);
                    notify(`Se guardó «${next.title}».`);
                  },
                  onError: (saveError) =>
                    fail(saveError instanceof Error ? saveError.message : "No se pudo guardar el documento."),
                })
              }
              onRemove={() => {
                const isDraft = drafts.some((d) => d.id === item.id);
                if (isDraft) {
                  setDrafts((current) => current.filter((d) => d.id !== item.id));
                  void removeDocFiles([item.path]);
                  return;
                }
                remove.mutate(item as DocItem, {
                  onSuccess: () => notify(`Se eliminó «${item.title}».`),
                  onError: (removeError) =>
                    fail(removeError instanceof Error ? removeError.message : "No se pudo eliminar."),
                });
              }}
              fail={fail}
            />
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* --- Una fila ---------------------------------------------------------------------------- */

function ItemRow({
  item,
  index,
  total,
  siblings,
  isDraft,
  replacedBy,
  open,
  canEdit,
  pending,
  onToggle,
  onMove,
  onSave,
  onRemove,
  fail,
}: {
  item: Omit<DocItem, "updatedAt">;
  index: number;
  total: number;
  siblings: DocItem[];
  isDraft: boolean;
  /** La edición que reemplaza a esta, si alguna lo hace. */
  replacedBy: DocItem | null;
  open: boolean;
  canEdit: boolean;
  pending: boolean;
  onToggle: () => void;
  onMove: (step: -1 | 1) => void;
  onSave: (item: Omit<DocItem, "updatedAt">) => void;
  onRemove: () => void;
  fail: (message: string) => void;
}) {
  const [form, setForm] = useState(item);
  const [replacing, setReplacing] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const panelId = `doc-item-${item.id}`;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Reemplazar a un documento que ya depende de este cerraría el círculo y el
  // índice del portal giraría buscando la versión vigente.
  const replaceable = useMemo(() => {
    const byId = new Map(siblings.map((row) => [row.id, row] as const));
    const descends = (from: string | null): boolean => {
      const seen = new Set<string>();
      let cursor = from;
      while (cursor && !seen.has(cursor)) {
        if (cursor === form.id) return true;
        seen.add(cursor);
        cursor = byId.get(cursor)?.supersedes ?? null;
      }
      return false;
    };
    return siblings.filter((row) => row.id !== form.id && !descends(row.supersedes));
  }, [siblings, form.id]);

  const dirty = JSON.stringify(form) !== JSON.stringify(item);
  const problem = !form.title.trim()
    ? "El documento necesita un título."
    : form.kind === "enlace" && !/^https?:\/\//i.test(form.url ?? "")
      ? "El enlace tiene que empezar por http:// o https://"
      : form.yearTo !== null && form.year !== null && form.yearTo < form.year
        ? "El año final no puede ser anterior al inicial."
        : "";

  async function replaceFile(file: File | undefined) {
    if (!file) return;
    setReplacing(true);
    try {
      const previous = form.path;
      const uploaded = await uploadDocFile(form.collectionId, file);
      setForm((current) => ({
        ...current,
        kind: "archivo",
        url: null,
        path: uploaded.path,
        fileName: uploaded.fileName,
        fileType: uploaded.fileType,
        sizeBytes: uploaded.sizeBytes,
      }));
      await removeDocFiles([previous]);
    } catch (uploadFailure) {
      fail(uploadFailure instanceof Error ? uploadFailure.message : "No se pudo subir el archivo.");
    } finally {
      setReplacing(false);
      if (picker.current) picker.current.value = "";
    }
  }

  const href = documentHref(item as DocItem);

  return (
    <li className="doc-item" data-open={open || undefined}>
      <div className="doc-item__row">
        <span className="doc-item__kind" data-kind={item.kind}>
          <Icon name={item.kind === "enlace" ? "external" : "document"} size={13} />
          {documentType(item as DocItem)}
        </span>

        <span className="doc-item__id">
          <b>{item.title || "Documento sin título"}</b>
          <small>
            {item.year !== null ? (item.yearTo && item.yearTo !== item.year ? `${item.year}-${item.yearTo}` : item.year) : "Sin año"}
            {item.version ? ` · ${item.version}` : ""}
            {item.kind === "archivo" && item.sizeBytes ? ` · ${formatBytes(item.sizeBytes)}` : ""}
          </small>
        </span>

        <span className="doc-item__marks">
          {replacedBy && (
            <span className="oda-badge" title={`La reemplaza «${replacedBy.title}»${replacedBy.version ? ` · ${replacedBy.version}` : ""}`}>
              <Icon name="clock" size={12} /> Edición anterior
            </span>
          )}
          {isDraft ? (
            <span className="oda-badge" data-tone="warn">
              <Icon name="alert" size={12} /> Sin guardar
            </span>
          ) : (
            <span className="oda-badge" data-tone={item.status === "publicado" ? "ok" : undefined}>
              <Icon name={item.status === "publicado" ? "check" : "eye-off"} size={12} />
              {item.status === "publicado" ? "Publicado" : "Borrador"}
            </span>
          )}
        </span>

        <span className="doc-item__actions">
          {href && (
            <a
              className="icon-button"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir ${item.title || "el documento"}`}
              title="Abrir"
            >
              <Icon name="eye" size={15} />
            </a>
          )}
          {canEdit && !isDraft && (
            <>
              <button
                type="button"
                className="icon-button"
                disabled={index === 0}
                onClick={() => onMove(-1)}
                aria-label={`Subir ${item.title || "el documento"}`}
                title="Subir"
              >
                <Icon name="arrow-left" size={15} />
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={index >= total - 1}
                onClick={() => onMove(1)}
                aria-label={`Bajar ${item.title || "el documento"}`}
                title="Bajar"
              >
                <Icon name="arrow-right" size={15} />
              </button>
            </>
          )}
          <button
            type="button"
            className="oda-link-button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
          >
            {open ? "Cerrar" : canEdit ? "Editar" : "Ver"}
          </button>
          {canEdit && (
            <ConfirmButton
              label="Quitar"
              confirmLabel={
                item.kind === "archivo"
                  ? "El documento sale del portal y se borra su archivo."
                  : "El documento sale del portal."
              }
              onConfirm={onRemove}
            />
          )}
        </span>
      </div>

      {open && (
        <div className="doc-item__form" id={panelId}>
          <div className="oda-form-grid">
            <label className="admin-field admin-field--wide">
              <span>Título</span>
              <input
                type="text"
                value={form.title}
                disabled={!canEdit}
                placeholder="Acta 014 de noviembre"
                onChange={(event) => set("title", event.target.value)}
              />
            </label>

            <label className="admin-field admin-field--wide">
              <span>Descripción</span>
              <textarea
                rows={2}
                value={form.description}
                disabled={!canEdit}
                placeholder="Una línea de qué contiene, para quien no lo va a abrir."
                onChange={(event) => set("description", event.target.value)}
              />
            </label>

            {form.kind === "enlace" ? (
              <label className="admin-field admin-field--wide">
                <span>Enlace</span>
                <input
                  type="url"
                  value={form.url ?? ""}
                  disabled={!canEdit}
                  placeholder="https://udes.edu.co/documento.pdf"
                  onChange={(event) => set("url", event.target.value)}
                />
                <small className="doc-hint">
                  Apunta a algo que vive fuera del portal: si la página de destino cambia, el enlace se rompe sin
                  avisar.
                </small>
              </label>
            ) : (
              <div className="admin-field admin-field--wide">
                <span>Archivo</span>
                <p className="doc-file">
                  <Icon name="document" size={15} />
                  <b>{form.fileName || "Archivo del repositorio"}</b>
                  <span>
                    {documentType(form as DocItem)}
                    {form.sizeBytes ? ` · ${formatBytes(form.sizeBytes)}` : ""}
                  </span>
                </p>
                {canEdit && (
                  <>
                    <input
                      ref={picker}
                      type="file"
                      className="sr-only"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.jpg,.jpeg,.png,.webp"
                      onChange={(event) => void replaceFile(event.target.files?.[0])}
                    />
                    <button
                      type="button"
                      className="oda-link-button"
                      disabled={replacing}
                      onClick={() => picker.current?.click()}
                    >
                      {replacing ? "Subiendo…" : "Reemplazar el archivo"}
                    </button>
                    <small className="doc-hint">Hasta {formatBytes(MAX_DOC_BYTES)}.</small>
                  </>
                )}
              </div>
            )}

            <label className="admin-field">
              <span>Año</span>
              <input
                type="number"
                min={1970}
                max={2200}
                value={form.year ?? ""}
                disabled={!canEdit}
                onChange={(event) => set("year", event.target.value ? Number(event.target.value) : null)}
              />
            </label>

            <label className="admin-field">
              <span>
                Hasta el año <small>opcional</small>
              </span>
              <input
                type="number"
                min={1970}
                max={2200}
                value={form.yearTo ?? ""}
                disabled={!canEdit || form.year === null}
                placeholder="si cubre un rango"
                onChange={(event) => set("yearTo", event.target.value ? Number(event.target.value) : null)}
              />
            </label>

            <label className="admin-field">
              <span>
                Versión <small>opcional</small>
              </span>
              <input
                type="text"
                value={form.version}
                disabled={!canEdit}
                placeholder="v3"
                onChange={(event) => set("version", event.target.value)}
              />
            </label>

            <label className="admin-field">
              <span>Reemplaza a</span>
              <select
                value={form.supersedes ?? ""}
                disabled={!canEdit || replaceable.length === 0}
                onChange={(event) => set("supersedes", event.target.value || null)}
              >
                <option value="">No reemplaza a ninguno</option>
                {replaceable.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                    {row.version ? ` · ${row.version}` : ""}
                  </option>
                ))}
              </select>
              <small className="doc-hint">
                La edición que este documento deja atrás. En el portal se pliega debajo de esta.
              </small>
            </label>

            <label className="admin-field">
              <span>Estado</span>
              <select
                value={form.status}
                disabled={!canEdit}
                onChange={(event) => set("status", event.target.value as DocItem["status"])}
              >
                <option value="borrador">Borrador · solo la intranet</option>
                <option value="publicado">Publicado · visible en el portal</option>
              </select>
            </label>
          </div>

          {canEdit && (
            <div className="doc-item__save">
              {problem && (
                <span className="admin-field-error">
                  <Icon name="alert" size={14} /> {problem}
                </span>
              )}
              <button
                type="button"
                className="button-primary"
                disabled={pending || Boolean(problem) || (!dirty && !isDraft)}
                onClick={() => onSave(form)}
              >
                {pending ? "Guardando…" : isDraft ? "Añadir al repositorio" : "Guardar"}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
