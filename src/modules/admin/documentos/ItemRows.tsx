/* =============================================================================
   Intranet · Documentos de una colección.

   Una tabla que se lee de un vistazo —tipo, título con su resumen, año,
   versión, estado— y un interruptor por fila para publicar o esconder sin abrir
   nada. Crear y editar pasan por el asistente (PublishWizard): la misma ficha
   sirve para las dos cosas.

   Dos formas de añadir, y la diferencia importa: subir un archivo lo deja en
   el bucket de la universidad y lo mide; pegar un enlace apunta a algo que
   vive fuera y que puede desaparecer sin avisar. La fila dice cuál es cuál.

   El orden de la lista es el orden del índice del portal dentro de cada año, y
   se cambia con las flechas.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { ConfirmButton, Panel } from "../udes-en-cifras/ui";
import { documentHref } from "../../documentos/data";
import type { DocCollection, DocItem } from "../../documentos/data";
import { DocThumb } from "../../documentos/DocThumb";
import { TipoDoc } from "../../documentos/TipoDoc";
import { formatOf, isPreviewableFormat, shortDescription } from "../../documentos/tipos";
import { PreviewModal } from "./PreviewModal";
import { PublishWizard, blankItem, cleanTitle, detectFlavor } from "./PublishWizard";
import { enterList, reducedMotion } from "./motion";
import { removeDocFiles, uploadDocFile, useRemoveItem, useSaveItem } from "./store";

type WizardState = { mode: "file" | "md" | "link"; item: DocItem | null } | null;

const yearLabel = (item: DocItem) =>
  item.year === null ? "—" : item.yearTo && item.yearTo !== item.year ? `${item.year}-${item.yearTo}` : String(item.year);

export function ItemRows({
  collection,
  root,
  sections,
  itemsOf,
  items,
  canEdit,
  notify,
  fail,
}: {
  /** El nodo que se está viendo: una colección o una de sus secciones. */
  collection: DocCollection;
  /** La colección de primer nivel de la que cuelga (o el mismo nodo). */
  root: DocCollection;
  /** Las secciones de esa colección, para elegir a dónde va un documento. */
  sections: DocCollection[];
  itemsOf: (collectionId: string) => DocItem[];
  items: DocItem[];
  canEdit: boolean;
  notify: (message: string) => void;
  fail: (message: string) => void;
}) {
  const [wizard, setWizard] = useState<WizardState>(null);
  const [previewing, setPreviewing] = useState<DocItem | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const bulkPicker = useRef<HTMLInputElement>(null);
  const save = useSaveItem();
  const remove = useRemoveItem();

  const published = items.filter((item) => item.status === "publicado").length;

  // La lista entra escalonada al elegir una colección, no en cada guardado.
  useEffect(() => {
    if (list.current) enterList(list.current.querySelectorAll(".da-row"));
  }, [collection.id]);

  useEffect(() => {
    if (!fresh) return;
    const timer = window.setTimeout(() => setFresh(null), 2600);
    return () => window.clearTimeout(timer);
  }, [fresh]);

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

  function toggle(item: DocItem) {
    const next = item.status === "publicado" ? "borrador" : "publicado";
    save.mutate(
      { ...item, status: next },
      {
        onSuccess: () =>
          notify(next === "publicado" ? `«${item.title}» ya se ve en el portal.` : `«${item.title}» se escondió del portal.`),
        onError: (failure) => fail(failure instanceof Error ? failure.message : "No se pudo cambiar el estado."),
      },
    );
  }

  /** Varios archivos de una vez: cada uno queda como borrador, con su nombre por título. */
  async function addMany(files: FileList | null) {
    if (!files?.length) return;
    setBulk(true);
    let done = 0;
    try {
      let position = Math.max(0, ...items.map((row) => row.position));
      for (const file of Array.from(files)) {
        const up = await uploadDocFile(collection.id, file);
        position += 1;
        try {
          await save.mutateAsync({
            ...blankItem(collection.id, position),
            kind: "archivo",
            url: null,
            path: up.path,
            fileName: up.fileName,
            fileType: up.fileType,
            sizeBytes: up.sizeBytes,
            flavor: await detectFlavor(file),
            title: cleanTitle(up.fileName) || up.fileName,
          });
          done += 1;
        } catch (failure) {
          void removeDocFiles([up.path]);
          throw failure;
        }
      }
      notify(
        done === 1
          ? "Archivo subido como borrador. Ábrelo con «Editar» para completar su resumen y publicarlo."
          : `${done} archivos subidos como borrador. Ábrelos con «Editar» para completar su resumen y publicarlos.`,
      );
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : "No se pudo subir el archivo.";
      fail(done ? `Se subieron ${done}, pero se detuvo en uno: ${reason}` : reason);
    } finally {
      setBulk(false);
      if (bulkPicker.current) bulkPicker.current.value = "";
    }
  }

  return (
    <>
      <Panel
        title={items.length ? `Documentos · ${items.length}` : "Documentos"}
        description={
          items.length
            ? `${published} ${published === 1 ? "publicado" : "publicados"}. Dentro de cada año, el índice del portal sigue este orden.`
            : "Sube archivos al repositorio, escribe un documento o añade enlaces a documentos que viven fuera."
        }
        actions={
          canEdit && (
            <>
              <button type="button" className="button-secondary" onClick={() => setWizard({ mode: "link", item: null })}>
                <Icon name="link" size={15} /> Añadir enlace
              </button>
              <button type="button" className="button-secondary" onClick={() => setWizard({ mode: "md", item: null })}>
                <Icon name="pen" size={15} /> Escribir documento
              </button>
              <button type="button" className="button-primary" onClick={() => setWizard({ mode: "file", item: null })}>
                <Icon name="upload" size={15} /> Subir y publicar
              </button>
            </>
          )
        }
      >
        {items.length === 0 ? (
          <p className="oda-muted">
            Esta colección está vacía. Mientras lo esté, el portal la muestra con cero documentos: publícala solo
            cuando tenga algo dentro.
          </p>
        ) : (
          <div className="da-table" role="table" aria-label="Documentos" ref={list}>
            <div className="da-row da-row--head" role="row">
              <span role="columnheader">Tipo</span>
              <span role="columnheader">Documento</span>
              <span role="columnheader">Año</span>
              <span role="columnheader">Versión</span>
              <span role="columnheader">Estado</span>
              <span role="columnheader">Visible</span>
              <span role="columnheader" className="sr-only">Acciones</span>
            </div>
            {items.map((item, index) => (
              <Row
                key={item.id}
                item={item}
                index={index}
                total={items.length}
                replacedBy={items.find((row) => row.supersedes === item.id) ?? null}
                canEdit={canEdit}
                fresh={fresh === item.id}
                status={save.isPending && save.variables?.id === item.id ? save.variables.status : item.status}
                busy={save.isPending && save.variables?.id === item.id}
                onToggle={() => toggle(item)}
                onPreview={() => setPreviewing(item)}
                onEdit={() => setWizard({ mode: "file", item })}
                onMove={(step) => move(item, step)}
                onRemove={() =>
                  remove.mutate(item, {
                    onSuccess: () => notify(`Se eliminó «${item.title}».`),
                    onError: (failure) => fail(failure instanceof Error ? failure.message : "No se pudo eliminar."),
                  })
                }
              />
            ))}
          </div>
        )}

        {canEdit && (
          <p className="da-bulk">
            <input
              ref={bulkPicker}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Elegir varios archivos para subirlos como borradores"
              accept=".pdf,.docx,.doc,.html,.htm,.md,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.jpg,.jpeg,.png,.webp"
              onChange={(event) => void addMany(event.target.files)}
            />
            ¿Son muchos?{" "}
            <button type="button" className="oda-link-button" disabled={bulk} onClick={() => bulkPicker.current?.click()}>
              {bulk ? "Subiendo…" : "Subir varios archivos como borradores"}
            </button>
          </p>
        )}
      </Panel>

      {wizard && (
        <PublishWizard
          key={wizard.item?.id ?? wizard.mode}
          mode={wizard.mode}
          item={wizard.item}
          root={root}
          sections={sections}
          initialCollectionId={wizard.item?.collectionId ?? collection.id}
          itemsOf={itemsOf}
          onClose={() => setWizard(null)}
          onSaved={(saved, text) => {
            setFresh(saved.id);
            notify(text);
          }}
        />
      )}

      {previewing && <PreviewModal item={previewing} onClose={() => setPreviewing(null)} />}
    </>
  );
}

/* --- Una fila ---------------------------------------------------------------------------- */

function Row({
  item,
  index,
  total,
  replacedBy,
  canEdit,
  fresh,
  status,
  busy,
  onToggle,
  onPreview,
  onEdit,
  onMove,
  onRemove,
}: {
  item: DocItem;
  index: number;
  total: number;
  /** La edición que reemplaza a esta, si alguna lo hace. */
  replacedBy: DocItem | null;
  canEdit: boolean;
  fresh: boolean;
  status: DocItem["status"];
  busy: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onEdit: () => void;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const format = formatOf(item);
  const href = documentHref(item);
  const on = status === "publicado";
  const name = item.title || "el documento";

  // La fila nueva se resalta un instante (la animación vive en el CSS) y se
  // trae a la vista si quedó fuera.
  useEffect(() => {
    if (fresh) ref.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [fresh]);

  return (
    <div className="da-row" role="row" ref={ref} data-fresh={fresh || undefined} data-off={!on || undefined}>
      <span className="da-cell da-cell--kind" role="cell">
        <DocThumb item={item} size="sm" />
        <TipoDoc format={format} />
      </span>

      <span className="da-cell da-cell--doc" role="cell">
        <b>{item.title || "Documento sin título"}</b>
        <small>
          {shortDescription(item, 140) || (item.kind === "archivo" ? "Sin resumen" : "Sin resumen · enlace")}
        </small>
        {replacedBy && (
          <span
            className="oda-badge da-cell__old"
            title={`La reemplaza «${replacedBy.title}»${replacedBy.version ? ` · ${replacedBy.version}` : ""}`}
          >
            <Icon name="clock" size={12} /> Edición anterior
          </span>
        )}
      </span>

      <span className="da-cell da-cell--num" role="cell" data-label="Año">
        {yearLabel(item)}
      </span>
      <span className="da-cell da-cell--num" role="cell" data-label="Versión">
        {item.version || "—"}
      </span>

      <span className="da-cell da-cell--state" role="cell">
        <span className="oda-badge" data-tone={on ? "ok" : undefined}>
          <Icon name={on ? "check" : "eye-off"} size={12} />
          {on ? "Publicado" : "Borrador"}
        </span>
        {item.visibility === "intranet" && (
          <span className="oda-badge" data-tone="warn" title="Se oculta del portal público">
            <Icon name="lock" size={12} /> Intranet
          </span>
        )}
      </span>

      <span className="da-cell da-cell--switch" role="cell">
        <button
          type="button"
          role="switch"
          className="da-switch"
          aria-checked={on}
          aria-label={`Visible en el portal: ${name}`}
          disabled={!canEdit || busy}
          onClick={onToggle}
        />
      </span>

      <span className="da-cell da-cell--acts" role="cell">
        {isPreviewableFormat(format) && item.kind === "archivo" && (
          <button type="button" className="icon-button" aria-label={`Vista previa de ${name}`} title="Vista previa" onClick={onPreview}>
            <Icon name="eye" size={15} />
          </button>
        )}
        {href && (
          <a className="icon-button" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${name} en una pestaña nueva`} title="Abrir en una pestaña nueva">
            <Icon name="external" size={15} />
          </a>
        )}
        {canEdit && (
          <>
            <button type="button" className="icon-button" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Subir ${name}`} title="Subir">
              <Icon name="chevron-down" size={15} className="da-flip" />
            </button>
            <button type="button" className="icon-button" disabled={index >= total - 1} onClick={() => onMove(1)} aria-label={`Bajar ${name}`} title="Bajar">
              <Icon name="chevron-down" size={15} />
            </button>
            <button type="button" className="oda-link-button" onClick={onEdit} aria-label={`Editar ${name}`}>
              Editar
            </button>
            <ConfirmButton
              label="Quitar"
              confirmLabel={
                item.kind === "archivo"
                  ? "El documento sale del portal y se borra su archivo."
                  : "El documento sale del portal."
              }
              onConfirm={onRemove}
            />
          </>
        )}
      </span>
    </div>
  );
}
