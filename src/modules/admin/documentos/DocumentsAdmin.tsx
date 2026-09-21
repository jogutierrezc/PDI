/* =============================================================================
   Intranet · Documentos.

   El repositorio documental e histórico de la oficina, visto desde dentro: a
   la izquierda la lista de colecciones —con sus secciones colgando de cada
   una— y a la derecha la elegida: su tapa y sus datos arriba, sus documentos
   debajo.

   Una sección es otra colección con madre, así que se edita con el mismo
   formulario. Solo hay un nivel, y lo impide la base: una sección no puede
   tener secciones.

   No hay asistente de estaciones aquí, y es deliberado: cargar un repositorio
   no es un proceso con principio y final como cerrar un periodo, son visitas
   cortas para añadir un acta o publicar una norma. Lo que hace falta es tener
   todo a la vista y que cada fila se guarde sola.

   La colección vive en la ruta: /admin/documentos/actas-consejo
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useAuth } from "../../../lib/auth";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { ConfirmButton, Panel, slugify } from "../udes-en-cifras/ui";
import { documentFileUrl, entriesOf, itemsUnder, yearRange } from "../../documentos/data";
import type { DocCollection, DocItem } from "../../documentos/data";
import { ItemRows } from "./ItemRows";
import {
  MAX_COVER_BYTES,
  formatBytes,
  removeDocFiles,
  uploadDocCover,
  useDocAdmin,
  useRemoveCollection,
  useSaveCollection,
} from "./store";
import "../udes-en-cifras/od-admin.css";
import "./documents-admin.css";

/** Una colección nueva, todavía sin identificador de la base. Con `parent`
 *  nace como sección de esa colección. */
const blankCollection = (position: number, parent: string | null = null): Omit<DocCollection, "updatedAt"> => ({
  id: crypto.randomUUID(),
  parentId: parent,
  slug: "",
  title: "",
  subtitle: "",
  cover: "",
  coverAlt: "",
  status: "borrador",
  position,
});

export function DocumentsAdmin() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const query = useDocAdmin();
  const removeCollection = useRemoveCollection();

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  /** Una colección recién creada que todavía no está en la base. */
  const [draft, setDraft] = useState<Omit<DocCollection, "updatedAt"> | null>(null);

  const state = query.data;
  const canEdit = hasRole("planeacion") && !state?.missing;

  const collections = state?.collections ?? [];
  const sections = state?.sections ?? new Map<string, DocCollection[]>();
  /** Colecciones y secciones en una sola lista: el slug de la ruta busca aquí. */
  const nodes = [...collections, ...[...sections.values()].flat()];
  const current = draft ?? nodes.find((c) => c.slug === slug) ?? collections[0] ?? null;
  const items = current && !draft ? (state?.byCollection.get(current.id) ?? []) : [];
  /** La colección madre cuando lo elegido es una sección. */
  const parent = current?.parentId ? (collections.find((c) => c.id === current.parentId) ?? null) : null;
  /** De qué colección colgaría una sección nueva: de la elegida, o de su madre. */
  const sectionHome = current ? (current.parentId ? parent : current) : null;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function startNew() {
    setDraft(blankCollection(collections.length + 1));
    setError("");
  }

  function startSection() {
    if (!sectionHome) return;
    setDraft(blankCollection((sections.get(sectionHome.id)?.length ?? 0) + 1, sectionHome.id));
    setError("");
  }

  return (
    <AdminShell
      section="documents"
      kicker="Documentos"
      title={current ? current.title || (draft?.parentId ? "Sección nueva" : "Colección nueva") : "Repositorio documental"}
      description="Las colecciones del portal Documentos, sus secciones y los archivos y enlaces que guardan. Cada fila decide por su cuenta si está publicada."
      actions={
        <>
          <a className="button-secondary" href="/documentos" target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={15} /> Ver el portal
          </a>
          {canEdit && sectionHome && !draft && (
            <button
              className="button-secondary"
              type="button"
              onClick={startSection}
              title={`Nueva sección en «${sectionHome.title}»`}
            >
              <Icon name="plus" size={15} /> Nueva sección
            </button>
          )}
          {canEdit && (
            <button className="button-primary" type="button" onClick={startNew}>
              <Icon name="plus" size={16} /> Nueva colección
            </button>
          )}
        </>
      }
    >
      {!hasRole("planeacion") && (
        <ReadOnlyNotice>
          Tu rol consulta el repositorio; para cargar documentos hace falta capacidad de Planeación.
        </ReadOnlyNotice>
      )}

      {state?.missing && (
        <p className="oda-banner" role="note">
          <Icon name="alert" size={16} />
          <span>
            <strong>El repositorio todavía no existe en la base.</strong> Falta la migración{" "}
            <code>0051_repositorio_documental.sql</code>. Hasta aplicarla no se puede crear ninguna colección, y
            el portal <code>/documentos</code> lo dice en pantalla.
          </span>
        </p>
      )}

      {notice && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} />
          {notice}
        </p>
      )}

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}

      {query.isPending ? (
        <LoadingBlock rows={5} label="Cargando el repositorio" />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="oda-workspace doc-workspace">
          <CollectionRail
            collections={collections}
            sections={sections}
            counts={state?.byCollection ?? new Map()}
            active={current?.id ?? null}
            draft={draft}
            onPick={(picked) => {
              setDraft(null);
              navigate(`/admin/documentos/${picked.slug}`);
            }}
          />

          <section className="oda-stage" aria-label="La colección">
            {!current ? (
              <div className="oda-stage-empty">
                <strong>Todavía no hay colecciones</strong>
                <p>
                  Una colección es un tomo del repositorio: una tapa, un nombre y los documentos que guarda.
                  {canEdit ? " Crea la primera para empezar." : ""}
                </p>
              </div>
            ) : (
              <>
                <CollectionForm
                  key={current.id}
                  collection={current}
                  isNew={Boolean(draft)}
                  parent={parent ?? (draft?.parentId ? (collections.find((c) => c.id === draft.parentId) ?? null) : null)}
                  roots={collections}
                  existing={nodes}
                  sections={current.parentId ? [] : (sections.get(current.id) ?? [])}
                  items={items}
                  canEdit={canEdit}
                  notify={setNotice}
                  fail={setError}
                  onSaved={(saved) => {
                    setDraft(null);
                    navigate(`/admin/documentos/${saved.slug}`);
                  }}
                  onRemove={() => {
                    if (draft) {
                      setDraft(null);
                      return;
                    }
                    removeCollection.mutate(current as DocCollection, {
                      onSuccess: () => {
                        setNotice(`Se eliminó «${current.title}» y sus documentos.`);
                        navigate("/admin/documentos");
                      },
                      onError: (removeError) =>
                        setError(removeError instanceof Error ? removeError.message : "No se pudo eliminar."),
                    });
                  }}
                />

                {!draft && (
                  <ItemRows
                    collection={current as DocCollection}
                    items={items}
                    canEdit={canEdit}
                    notify={setNotice}
                    fail={setError}
                  />
                )}
              </>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}

/* --- La lista de colecciones --------------------------------------------------------- */

function CollectionRail({
  collections,
  sections,
  counts,
  active,
  draft,
  onPick,
}: {
  collections: DocCollection[];
  sections: Map<string, DocCollection[]>;
  counts: Map<string, DocItem[]>;
  active: string | null;
  draft: Omit<DocCollection, "updatedAt"> | null;
  onPick: (collection: DocCollection) => void;
}) {
  const published = collections.filter((c) => c.status === "publicado").length;
  const sectionCount = [...sections.values()].flat().length;
  return (
    <aside className="oda-rail doc-rail" aria-label="Colecciones del repositorio">
      <div className="oda-rail__head">
        <strong>
          {collections.length} {collections.length === 1 ? "colección" : "colecciones"}
        </strong>
        <span className="doc-rail__legend">
          {published} publicadas{sectionCount > 0 ? ` · ${sectionCount} secciones` : ""}
        </span>
      </div>
      <ul>
        {draft && (
          <li>
            <span className="oda-rail__item doc-rail__item" aria-current="true">
              <span className="doc-rail__thumb" aria-hidden="true">
                <Icon name="plus" size={15} />
              </span>
              <span className="oda-rail__name">
                {draft.title || "Colección nueva"}
                <small>sin guardar</small>
              </span>
            </span>
          </li>
        )}
        {collections.map((collection) => {
          const own = counts.get(collection.id) ?? [];
          const all = itemsUnder(collection, { sections, byCollection: counts });
          const cover = documentFileUrl(collection.cover);
          const range = yearRange(all);
          const children = sections.get(collection.id) ?? [];
          return (
            <li key={collection.id}>
              <button
                type="button"
                className="oda-rail__item doc-rail__item"
                aria-current={!draft && collection.id === active ? "true" : undefined}
                onClick={() => onPick(collection)}
              >
                <span className="doc-rail__thumb">
                  {cover ? (
                    <img src={cover} alt="" />
                  ) : (
                    <span aria-hidden="true">{collection.title.trim().charAt(0).toUpperCase() || "—"}</span>
                  )}
                </span>
                <span className="oda-rail__name">
                  {collection.title}
                  <small>
                    {collection.status === "publicado" ? "Publicada" : "Borrador"}
                    {range ? ` · ${range}` : ""}
                  </small>
                </span>
                <span className="doc-rail__count" aria-label={`${entriesOf(all).length} documentos en total`}>
                  {entriesOf(all).length}
                </span>
              </button>

              {children.length > 0 && (
                <ul className="doc-rail__sections">
                  {children.map((child) => {
                    const childItems = counts.get(child.id) ?? [];
                    return (
                      <li key={child.id}>
                        <button
                          type="button"
                          className="oda-rail__item doc-rail__item doc-rail__item--section"
                          aria-current={!draft && child.id === active ? "true" : undefined}
                          onClick={() => onPick(child)}
                        >
                          <span className="oda-rail__name">
                            {child.title}
                            <small>{child.status === "publicado" ? "Publicada" : "Borrador"}</small>
                          </span>
                          <span
                            className="doc-rail__count"
                            aria-label={`${entriesOf(childItems).length} documentos`}
                          >
                            {entriesOf(childItems).length}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {/* Los documentos sueltos del tomo, cuando además tiene secciones. */}
              {children.length > 0 && own.length > 0 && (
                <p className="doc-rail__loose">
                  {entriesOf(own).length} sin sección
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/* --- Los datos de la colección --------------------------------------------------------- */

function CollectionForm({
  collection,
  isNew,
  parent,
  roots,
  existing,
  sections,
  items,
  canEdit,
  notify,
  fail,
  onSaved,
  onRemove,
}: {
  collection: Omit<DocCollection, "updatedAt">;
  isNew: boolean;
  /** La colección madre cuando esto es una sección. */
  parent: DocCollection | null;
  /** Las colecciones de primer nivel, para poder mudar una sección. */
  roots: DocCollection[];
  existing: DocCollection[];
  /** Las secciones propias, cuando esto es una colección de primer nivel. */
  sections: DocCollection[];
  items: DocItem[];
  canEdit: boolean;
  notify: (message: string) => void;
  fail: (message: string) => void;
  onSaved: (collection: Omit<DocCollection, "updatedAt">) => void;
  onRemove: () => void;
}) {
  const [form, setForm] = useState(collection);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const save = useSaveCollection();

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const cover = documentFileUrl(form.cover);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(collection), [form, collection]);
  // La dirección es única dentro de su madre: dos colecciones distintas pueden
  // tener cada una su sección «Acuerdos».
  const slugTaken = existing.some(
    (c) => c.slug === form.slug && c.parentId === form.parentId && c.id !== form.id,
  );
  const isSection = form.parentId !== null;
  const problem = !form.title.trim()
    ? "La colección necesita un nombre."
    : !form.slug
      ? "Falta la dirección pública."
      : slugTaken
        ? "Ya hay otra colección con esa dirección."
        : "";

  async function pickCover(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const previous = form.cover;
      const path = await uploadDocCover(file);
      set("cover", path);
      await removeDocFiles([previous]);
    } catch (uploadFailure) {
      fail(uploadFailure instanceof Error ? uploadFailure.message : "No se pudo subir la tapa.");
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = "";
    }
  }

  function submit() {
    if (problem) {
      fail(problem);
      return;
    }
    save.mutate(form, {
      onSuccess: () => {
        notify(isNew ? `Se creó «${form.title}».` : `Se guardó «${form.title}».`);
        onSaved(form);
      },
      onError: (saveError) =>
        fail(saveError instanceof Error ? saveError.message : "No se pudo guardar la colección."),
    });
  }

  return (
    <Panel
      title={isSection ? (isNew ? "La sección nueva" : "La sección") : isNew ? "La colección nueva" : "La colección"}
      description={
        isSection
          ? "Una divisoria dentro de la colección. Su tapa no sale en la estantería: allí manda la del tomo."
          : "La tapa, el nombre y el subtítulo son lo que se lee en la estantería del portal. El lomo —los años y el conteo— se calcula de sus documentos y de los de sus secciones."
      }
      actions={
        canEdit && (
          <>
            {!isNew && (
              <ConfirmButton
                label="Eliminar"
                confirmLabel={
                  sections.length
                    ? `Se borran la colección, sus ${sections.length === 1 ? "1 sección" : `${sections.length} secciones`}, los documentos de todas y sus archivos.`
                    : `Se borra ${isSection ? "la sección" : "la colección"}, sus ${items.length} documentos y sus archivos.`
                }
                onConfirm={onRemove}
              />
            )}
            <button
              type="button"
              className="button-primary"
              disabled={save.isPending || (!dirty && !isNew)}
              onClick={submit}
            >
              {save.isPending ? "Guardando…" : isNew ? (isSection ? "Crear la sección" : "Crear la colección") : "Guardar"}
            </button>
          </>
        )
      }
    >
      <div className="doc-collection">
        <div className="doc-collection__cover">
          <span className="doc-collection__preview">
            {cover ? (
              <img src={cover} alt={form.coverAlt || `Tapa de ${form.title}`} />
            ) : (
              <span aria-hidden="true">{form.title.trim().charAt(0).toUpperCase() || "?"}</span>
            )}
          </span>
          {canEdit && (
            <>
              <input
                ref={picker}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                onChange={(event) => void pickCover(event.target.files?.[0])}
              />
              <button
                type="button"
                className="button-secondary"
                disabled={uploading}
                onClick={() => picker.current?.click()}
              >
                {uploading ? "Subiendo…" : cover ? "Cambiar la tapa" : "Subir una tapa"}
              </button>
              <small className="doc-hint">
                Se recorta a lo ancho (4:3). Hasta {formatBytes(MAX_COVER_BYTES)}.
                {isSection ? " En una sección es opcional: no se ve en el portal." : ""}
              </small>
            </>
          )}
        </div>

        <div className="oda-form-grid doc-collection__fields">
          <label className="admin-field">
            <span>Nombre</span>
            <input
              type="text"
              value={form.title}
              disabled={!canEdit}
              placeholder="Actas de Consejo Superior"
              onChange={(event) => {
                const title = event.target.value;
                setForm((current) => ({
                  ...current,
                  title,
                  // La dirección se propone desde el nombre solo mientras nadie
                  // la haya tocado: cambiarla después rompería los enlaces que
                  // ya circulan.
                  slug: isNew || !current.slug ? slugify(title) : current.slug,
                }));
              }}
            />
          </label>

          <label className="admin-field">
            <span>Dirección pública</span>
            <input
              type="text"
              value={form.slug}
              disabled={!canEdit}
              placeholder="actas-consejo"
              onChange={(event) => set("slug", slugify(event.target.value))}
            />
            <small className="doc-hint">
              /documentos/{parent ? `${parent.slug}/` : ""}
              <b>{form.slug || "…"}</b>
              {slugTaken && <span className="doc-warn"> · ya está en uso</span>}
            </small>
          </label>

          <label className="admin-field admin-field--wide">
            <span>Subtítulo</span>
            <input
              type="text"
              value={form.subtitle}
              disabled={!canEdit}
              placeholder="Acuerdos y decisiones del máximo órgano de gobierno"
              onChange={(event) => set("subtitle", event.target.value)}
            />
          </label>

          <label className="admin-field admin-field--wide">
            <span>Texto alternativo de la tapa</span>
            <input
              type="text"
              value={form.coverAlt}
              disabled={!canEdit}
              placeholder="Qué se ve en la fotografía"
              onChange={(event) => set("coverAlt", event.target.value)}
            />
            {!form.coverAlt && form.cover && (
              <small className="doc-warn">
                <Icon name="alert" size={13} /> Sin esto, quien use lector de pantalla no sabrá qué hay en la tapa.
              </small>
            )}
          </label>

          {isSection && (
            <label className="admin-field">
              <span>Sección de</span>
              <select
                value={form.parentId ?? ""}
                disabled={!canEdit}
                onChange={(event) => set("parentId", event.target.value || null)}
              >
                {roots.map((root) => (
                  <option key={root.id} value={root.id}>
                    {root.title}
                  </option>
                ))}
              </select>
              <small className="doc-hint">
                Cambiarla la muda de tomo, con sus documentos.
                {parent ? ` Ahora cuelga de «${parent.title}».` : ""}
              </small>
            </label>
          )}

          <label className="admin-field">
            <span>Estado</span>
            <select
              value={form.status}
              disabled={!canEdit}
              onChange={(event) => set("status", event.target.value as DocCollection["status"])}
            >
              <option value="borrador">Borrador · solo la intranet</option>
              <option value="publicado">{isSection ? "Publicada · visible en su colección" : "Publicada · visible en el portal"}</option>
            </select>
            <small className="doc-hint">
              {isSection
                ? "Una sección en borrador esconde sus documentos, y una colección en borrador esconde sus secciones."
                : "Una colección en borrador esconde también sus secciones y sus documentos, aunque estén publicados."}
            </small>
          </label>

          {!isSection && sections.length > 0 && (
            <p className="admin-field admin-field--wide doc-hint">
              Esta colección tiene {sections.length === 1 ? "1 sección" : `${sections.length} secciones`}: en el
              portal, sus documentos se listan bajo la divisoria de cada una, y los que cargues aquí van
              primero, sin sección.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
