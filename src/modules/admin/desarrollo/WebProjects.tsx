/* =============================================================================
   Desarrollo tecnológico · administración

   Alta, edición y baja de los desarrollos web de la oficina, con su lista de
   autores. El formulario es propio y no el genérico de forms.ts porque tiene un
   campo repetible —los autores— que aquel no contempla.
   ========================================================================== */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { Modal, ModalActions } from "../../../components/ui/Modal";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../../components/ui/QueryState";
import { keys, useWebProjects } from "../../../data/queries";
import { useRemoveRow, useSaveRow } from "../../../data/mutations";
import { publicationLabels } from "../../../data/pdi";
import { useAuth } from "../../../lib/auth";
import type {
  PublicationStatus,
  RepoKind,
  WebProject,
  WebProjectAuthor,
} from "../../../types/database";

const STATUSES: PublicationStatus[] = ["borrador", "revision", "publicado", "archivado"];
const REPOS: { value: RepoKind; label: string }[] = [
  { value: "github", label: "GitHub" },
  { value: "udes", label: "Repositorio UDES" },
];

interface Draft {
  name: string;
  description: string;
  public_url: string;
  repo_kind: RepoKind;
  repo_url: string;
  status: PublicationStatus;
  authors: WebProjectAuthor[];
}

function draftFrom(project?: WebProject): Draft {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
    public_url: project?.public_url ?? "",
    repo_kind: project?.repo_kind ?? "github",
    repo_url: project?.repo_url ?? "",
    status: project?.status ?? "borrador",
    // Siempre una fila para escribir: un formulario que empieza con la lista
    // vacía obliga a descubrir el botón de "añadir" antes de poder teclear.
    authors: project?.authors?.length ? project.authors : [{ full_name: "", role: "" }],
  };
}

export function WebProjects() {
  const projects = useWebProjects();
  const { hasRole } = useAuth();
  const canEdit = hasRole("planeacion");

  const [editing, setEditing] = useState<{ project?: WebProject } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WebProject | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const scope = [keys.webProjects()];
  const save = useSaveRow(scope);
  const remove = useRemoveRow(scope);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function submit(draft: Draft) {
    setError("");
    try {
      await save.mutateAsync({
        table: "web_projects",
        id: editing?.project?.id,
        values: {
          name: draft.name.trim(),
          description: draft.description.trim(),
          public_url: draft.public_url.trim() || null,
          repo_kind: draft.repo_kind,
          repo_url: draft.repo_url.trim() || null,
          status: draft.status,
          // Las filas vacías no se guardan: son el andamio del formulario.
          authors: draft.authors
            .filter((author) => author.full_name.trim() !== "")
            .map((author) => ({
              full_name: author.full_name.trim(),
              ...(author.role?.trim() ? { role: author.role.trim() } : {}),
            })),
          position: editing?.project?.position ?? (projects.data?.length ?? 0) + 1,
        },
      });
      setNotice(editing?.project ? `Se guardó “${draft.name}”.` : `Se creó “${draft.name}”.`);
      setEditing(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setError("");
    try {
      await remove.mutateAsync({ table: "web_projects", id: pendingDelete.id });
      setNotice(`Se eliminó “${pendingDelete.name}”.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar.");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <AdminShell
      section="development"
      kicker="Administración · Desarrollo tecnológico"
      title="Proyectos web"
      description="Los desarrollos de la oficina que se publican en el portal, con su enlace de acceso, su repositorio y sus autores."
      actions={
        canEdit && (
          <button className="button-primary" type="button" onClick={() => setEditing({})}>
            <Icon name="plus" size={16} /> Nuevo proyecto
          </button>
        )
      }
    >
      {!canEdit && <ReadOnlyNotice />}

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

      {projects.isPending ? (
        <CardSkeleton count={3} />
      ) : projects.isError ? (
        <ErrorBlock error={projects.error} onRetry={() => void projects.refetch()} />
      ) : projects.data.length === 0 ? (
        <EmptyBlock
          title="Todavía no hay proyectos"
          hint="Registra el primero para que aparezca en la página pública."
          action={
            canEdit ? (
              <button className="button-primary" type="button" onClick={() => setEditing({})}>
                <Icon name="plus" size={16} /> Nuevo proyecto
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="webproject-list">
          {projects.data.map((project) => (
            <li className="webproject-row admin-card" key={project.id}>
              <div className="webproject-row__main">
                <header>
                  <h2>{project.name}</h2>
                  <span className={`managed-status managed-status--${statusTone(project.status)}`}>
                    {publicationLabels[project.status]}
                  </span>
                </header>
                <p>{project.description || "Sin descripción."}</p>

                <div className="webproject-row__links">
                  {project.public_url ? (
                    <a href={project.public_url} target="_blank" rel="noopener noreferrer">
                      <Icon name="external" size={14} /> Aplicativo
                    </a>
                  ) : (
                    <span className="webproject-row__missing">Sin enlace público</span>
                  )}
                  {project.repo_url ? (
                    <a href={project.repo_url} target="_blank" rel="noopener noreferrer">
                      <Icon name="code" size={14} />{" "}
                      {project.repo_kind === "github" ? "GitHub" : "Repositorio UDES"}
                    </a>
                  ) : (
                    <span className="webproject-row__missing">Sin repositorio</span>
                  )}
                </div>

                {project.authors.length > 0 && (
                  <p className="webproject-row__authors">
                    {project.authors
                      .map((author) => (author.role ? `${author.full_name} (${author.role})` : author.full_name))
                      .join(" · ")}
                  </p>
                )}
              </div>

              {canEdit && (
                <span className="row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setEditing({ project })}
                    aria-label={`Editar ${project.name}`}
                    title="Editar"
                  >
                    <Icon name="settings" size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    onClick={() => setPendingDelete(project)}
                    aria-label={`Eliminar ${project.name}`}
                    title="Eliminar"
                  >
                    <Icon name="close" size={15} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ProjectForm
          project={editing.project}
          pending={save.isPending}
          onSubmit={submit}
          onClose={() => setEditing(null)}
        />
      )}

      {pendingDelete && (
        <Modal
          title="Eliminar proyecto"
          description={`“${pendingDelete.name}” dejará de aparecer en el portal. Esta acción no se puede deshacer.`}
          onClose={() => setPendingDelete(null)}
        >
          <div className="modal-actions">
            <button className="button-ghost" type="button" onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
            <button
              className="button-danger"
              type="button"
              onClick={confirmDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Eliminando…" : "Eliminar proyecto"}
            </button>
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}

function statusTone(status: PublicationStatus) {
  if (status === "publicado") return "done";
  if (status === "revision") return "pending";
  if (status === "archivado") return "muted";
  return "draft";
}

/* --- Formulario ------------------------------------------------------------- */

function ProjectForm({
  project,
  pending,
  onSubmit,
  onClose,
}: {
  project?: WebProject;
  pending: boolean;
  onSubmit: (draft: Draft) => void | Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(project));

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function setAuthor(index: number, patch: Partial<WebProjectAuthor>) {
    setDraft((current) => ({
      ...current,
      authors: current.authors.map((author, i) => (i === index ? { ...author, ...patch } : author)),
    }));
  }

  function addAuthor() {
    setDraft((current) => ({ ...current, authors: [...current.authors, { full_name: "", role: "" }] }));
  }

  function removeAuthor(index: number) {
    setDraft((current) => ({
      ...current,
      // Nunca se queda sin filas: siempre debe haber una donde escribir.
      authors:
        current.authors.length === 1
          ? [{ full_name: "", role: "" }]
          : current.authors.filter((_, i) => i !== index),
    }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void onSubmit(draft);
  }

  return (
    <Modal
      title={project ? "Editar proyecto web" : "Nuevo proyecto web"}
      description="Solo los proyectos en estado publicado aparecen en la página pública."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <label className="admin-field">
          <span>Nombre del proyecto</span>
          <input required value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </label>

        <label className="admin-field">
          <span>Descripción del proyecto</span>
          <textarea
            required
            rows={3}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Qué resuelve y para quién."
          />
        </label>

        <label className="admin-field">
          <span>Enlace público del proyecto</span>
          <input
            type="url"
            value={draft.public_url}
            onChange={(e) => set("public_url", e.target.value)}
            placeholder="https://…"
          />
          <small>Es el destino del botón principal de la tarjeta.</small>
        </label>

        <label className="admin-field">
          <span>Dónde vive el código</span>
          <select value={draft.repo_kind} onChange={(e) => set("repo_kind", e.target.value as RepoKind)}>
            {REPOS.map((repo) => (
              <option key={repo.value} value={repo.value}>
                {repo.label}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-field">
          <span>Enlace público del repositorio</span>
          <input
            type="url"
            value={draft.repo_url}
            onChange={(e) => set("repo_url", e.target.value)}
            placeholder="https://…"
          />
        </label>

        {/* --- Autores: campo repetible ------------------------------------ */}
        <fieldset className="admin-field author-fields">
          <legend>Autores</legend>
          <small>Puedes registrar uno o varios. Solo el nombre es obligatorio.</small>

          {draft.authors.map((author, index) => (
            <div className="author-row" key={index}>
              <label>
                <span className="sr-only">Nombre completo del autor {index + 1}</span>
                <input
                  value={author.full_name}
                  onChange={(e) => setAuthor(index, { full_name: e.target.value })}
                  placeholder="Nombre completo"
                />
              </label>
              <label>
                <span className="sr-only">Cargo del autor {index + 1}</span>
                <input
                  value={author.role ?? ""}
                  onChange={(e) => setAuthor(index, { role: e.target.value })}
                  placeholder="Cargo"
                />
              </label>
              <button
                type="button"
                className="icon-button icon-button--danger"
                onClick={() => removeAuthor(index)}
                aria-label={`Quitar al autor ${index + 1}`}
                title="Quitar"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}

          <button className="button-ghost author-add" type="button" onClick={addAuthor}>
            <Icon name="plus" size={15} /> Añadir autor
          </button>
        </fieldset>

        <label className="admin-field">
          <span>Estado de publicación</span>
          <select
            value={draft.status}
            onChange={(e) => set("status", e.target.value as PublicationStatus)}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {publicationLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <ModalActions onCancel={onClose} submitLabel={pending ? "Guardando…" : "Guardar proyecto"} />
      </form>
    </Modal>
  );
}
