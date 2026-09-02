import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { Modal } from "../../../components/ui/Modal";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../../components/ui/QueryState";
import { usePillarOwners, usePillars, useProfiles } from "../../../data/queries";
import {
  pillarScope,
  useAssignPillarOwner,
  useCreateRow,
  useDeleteRow,
  useRemovePillarOwner,
  useUpdateRow,
} from "../../../data/mutations";
import { accentFor, publicationLabels } from "../../../data/pdi";
import { useAuth } from "../../../lib/auth";
import type { Pillar, PillarIcon, PillarInput, PublicationStatus } from "../../../types/database";

const ICONS: { value: PillarIcon; label: string }[] = [
  { value: "person", label: "Persona" },
  { value: "chip", label: "Tecnología" },
  { value: "spark", label: "Innovación" },
  { value: "columns", label: "Institución" },
  { value: "leaf", label: "Sostenibilidad" },
  { value: "community", label: "Comunidad" },
];

const STATUSES: PublicationStatus[] = ["borrador", "revision", "publicado", "archivado"];

/** "Excelencia Académica" → "excelencia-academica" */
function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Draft = Partial<Pillar>;

/**
 * Solo las columnas que existen en la tabla `pillars`.
 *
 * La lista de pilares llega con su avance adjunto (`progress`), que sale de la
 * vista v_pillar_progress y no es una columna. Mandar el objeto entero en el
 * UPDATE hacía que PostgREST intentara escribir `pillars.progress` y fallara.
 * TypeScript no lo detectaba: la comprobación de propiedades sobrantes solo
 * actúa sobre literales, no al asignar una variable a Partial<Pillar>.
 *
 * De paso quedan fuera id, created_at y updated_at, que los gestiona la base.
 */
function toPillarInput(draft: Draft): PillarInput {
  return {
    name: draft.name,
    slug: draft.slug,
    numeral: draft.numeral,
    description: draft.description,
    focus: draft.focus,
    insight: draft.insight,
    icon: draft.icon,
    accent_slot: draft.accent_slot,
    impulsor: draft.impulsor,
    contributes: draft.contributes,
    management_owner: draft.management_owner,
    calculation_owner: draft.calculation_owner,
    status: draft.status,
    position: draft.position,
  };
}

export function PillarManagement() {
  const pillars = usePillars();
  const profiles = useProfiles();
  const owners = usePillarOwners();
  const { profile, hasRole } = useAuth();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Pillar | null>(null);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");

  const create = useCreateRow<PillarInput, Pillar>("pillars", pillarScope());
  const update = useUpdateRow<PillarInput, Pillar>("pillars", pillarScope());
  const remove = useDeleteRow("pillars", pillarScope());
  const assignOwner = useAssignPillarOwner();
  const removeOwner = useRemovePillarOwner();

  const canManage = hasRole("planeacion");

  /** Qué pilares puede editar quien está dentro. */
  const editableIds = useMemo(() => {
    if (canManage) return null; // null = todos
    const mine = (owners.data ?? [])
      .filter((row) => row.profile_id === profile?.id)
      .map((row) => row.pillar_id);
    return new Set(mine);
  }, [canManage, owners.data, profile?.id]);

  const canEdit = (id: string) => editableIds === null || editableIds.has(id);

  // El aviso de guardado se retira solo.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function startCreate() {
    setFormError("");
    setDraft({
      name: "",
      slug: "",
      numeral: "",
      description: "",
      focus: "",
      icon: "spark",
      accent_slot: (pillars.data?.length ?? 0) % 6 + 1,
      impulsor: "",
      contributes: "",
      management_owner: "",
      calculation_owner: "Oficina de Planeación",
      status: "borrador",
      position: (pillars.data?.length ?? 0) + 1,
    });
  }

  function field(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [name]: name === "accent_slot" || name === "position" ? Number(value) : value };
      // El identificador de la URL se propone a partir del nombre mientras el
      // pilar es nuevo; una vez creado no se toca solo, porque cambiarlo
      // rompería los enlaces ya publicados.
      if (name === "name" && !current.id) next.slug = toSlug(value);
      return next;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setFormError("");

    const values = toPillarInput({ ...draft, slug: draft.slug || toSlug(draft.name ?? "") });

    try {
      if (draft.id) {
        await update.mutateAsync({ id: draft.id, values });
        setNotice(`Se guardó “${draft.name}”.`);
      } else {
        await create.mutateAsync(values);
        setNotice(`Se creó “${draft.name}”.`);
      }
      setDraft(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      setNotice(`Se eliminó “${pendingDelete.name}”.`);
      setPendingDelete(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo eliminar.");
      setPendingDelete(null);
    }
  }

  return (
    <AdminShell
      section="pillars"
      kicker="Administración · Gestión de pilares"
      title={draft ? (draft.id ? "Editar pilar" : "Nuevo pilar") : "Gestión de pilares"}
      description={
        draft
          ? "Define la información base que dará sentido y contexto a este pilar estratégico."
          : "Administra la configuración, el estado y el contenido de los pilares estratégicos institucionales."
      }
      actions={
        draft ? (
          <button className="button-ghost" type="button" onClick={() => setDraft(null)}>
            <span aria-hidden="true">←</span> Volver a pilares
          </button>
        ) : (
          canManage && (
            <button className="button-primary" type="button" onClick={startCreate}>
              <Icon name="plus" size={16} /> Añadir pilar
            </button>
          )
        )
      }
    >
      {!canManage && !draft && <ReadOnlyNotice />}

      {notice && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} />
          {notice}
        </p>
      )}

      {formError && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} />
          {formError}
        </p>
      )}

      {!draft ? (
        pillars.isPending ? (
          <CardSkeleton count={6} />
        ) : pillars.isError ? (
          <ErrorBlock error={pillars.error} onRetry={() => void pillars.refetch()} />
        ) : pillars.data.length === 0 ? (
          <EmptyBlock
            title="Todavía no hay pilares"
            hint="Crea el primero para empezar a construir el plan."
            action={
              canManage ? (
                <button className="button-primary" type="button" onClick={startCreate}>
                  <Icon name="plus" size={16} /> Añadir pilar
                </button>
              ) : undefined
            }
          />
        ) : (
          <section className="managed-grid" aria-label="Pilares">
            {pillars.data.map((pillar, index) => {
              const editable = canEdit(pillar.id);
              const pillarOwners = (owners.data ?? []).filter((row) => row.pillar_id === pillar.id);

              return (
                <article
                  className="managed-card"
                  key={pillar.id}
                  style={{ "--accent": accentFor(pillar.accent_slot) } as React.CSSProperties}
                >
                  <header>
                    <span className="managed-card__icon">
                      <Icon name={pillar.icon} size={19} />
                    </span>
                    <span className={`managed-status managed-status--${statusTone(pillar.status)}`}>
                      {publicationLabels[pillar.status]}
                    </span>
                  </header>

                  <h2>{pillar.name}</h2>
                  <p>{pillar.description || "Sin descripción configurada."}</p>

                  <footer>
                    <span>
                      {pillar.progress.total} actividades · {pillar.progress.progress}% de avance
                    </span>

                    {pillarOwners.length > 0 && (
                      <span className="managed-card__owners">
                        {pillarOwners.map((row) => {
                          const person = profiles.data?.find((item) => item.id === row.profile_id);
                          return (
                            <span className="owner-chip" key={row.profile_id}>
                              {person?.full_name || person?.email || "Usuario"}
                              {canManage && (
                                <button
                                  type="button"
                                  aria-label={`Quitar responsable ${person?.full_name ?? ""}`}
                                  onClick={() =>
                                    removeOwner.mutate({ pillarId: pillar.id, profileId: row.profile_id })
                                  }
                                >
                                  <Icon name="close" size={12} />
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </span>
                    )}

                    {canManage && (
                      <label className="owner-picker">
                        <span className="sr-only">Asignar responsable a {pillar.name}</span>
                        <select
                          value=""
                          onChange={(event) => {
                            if (!event.target.value) return;
                            assignOwner.mutate({ pillarId: pillar.id, profileId: event.target.value });
                          }}
                        >
                          <option value="">Asignar responsable…</option>
                          {(profiles.data ?? [])
                            .filter(
                              (person) =>
                                person.is_active &&
                                !pillarOwners.some((row) => row.profile_id === person.id),
                            )
                            .map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.full_name || person.email}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}

                    <div className="managed-card__actions">
                      {editable && (
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => {
                            setFormError("");
                            // Solo las columnas editables: `pillar` trae además
                            // el avance derivado, que no se puede guardar.
                            setDraft({ id: pillar.id, ...toPillarInput(pillar) });
                          }}
                        >
                          Editar
                        </button>
                      )}
                      <Link className="button-ghost" to={`/admin/pilares/${pillar.slug}/configurar`}>
                        Configurar <span data-arrow aria-hidden="true">→</span>
                      </Link>
                      {canManage && (
                        <button
                          type="button"
                          className="icon-button managed-card__delete"
                          onClick={() => setPendingDelete(pillar)}
                          aria-label={`Eliminar ${pillar.name}`}
                        >
                          <Icon name="close" size={15} />
                        </button>
                      )}
                    </div>
                  </footer>

                  <span className="managed-card__number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </article>
              );
            })}

            {canManage && (
              <button className="managed-add" type="button" onClick={startCreate}>
                <Icon name="plus" size={22} />
                <strong>Añadir nuevo pilar</strong>
                <small>Comienza a construir su identidad</small>
              </button>
            )}
          </section>
        )
      ) : (
        <form className="admin-form" onSubmit={save}>
          <header className="admin-form__intro">
            <span className="admin-kicker">Identidad del pilar</span>
            <h2>Información fundamental</h2>
            <p>Estos datos se muestran en el portal público y son la base de sus indicadores.</p>
          </header>

          <div className="admin-form__grid">
            <Field label="Nombre del pilar" name="name" value={draft.name ?? ""} onChange={field} placeholder="Ej. Excelencia académica" required />
            <Field
              label="Identificador en la URL"
              name="slug"
              value={draft.slug ?? ""}
              onChange={field}
              placeholder="excelencia-academica"
              hint={draft.id ? "Cambiarlo rompe los enlaces ya publicados." : "Se propone a partir del nombre."}
              required
            />
            <Field label="Numeral" name="numeral" value={draft.numeral ?? ""} onChange={field} placeholder="I, II, III…" />

            <label className="admin-field">
              <span>Ícono</span>
              <select name="icon" value={draft.icon ?? "spark"} onChange={field}>
                {ICONS.map((icon) => (
                  <option key={icon.value} value={icon.value}>
                    {icon.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>Color del pilar</span>
              <div className="accent-picker">
                {[1, 2, 3, 4, 5, 6].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={`accent-swatch${draft.accent_slot === slot ? " is-active" : ""}`}
                    style={{ background: accentFor(slot) }}
                    aria-label={`Color ${slot}`}
                    aria-pressed={draft.accent_slot === slot}
                    onClick={() => setDraft((current) => (current ? { ...current, accent_slot: slot } : current))}
                  />
                ))}
              </div>
              <small>Los seis acentos están validados en conjunto para daltonismo.</small>
            </label>

            {/* Publicar es decisión editorial: la base de datos rechaza el
                cambio si quien edita no es de Planeación, así que el campo
                solo aparece cuando tiene sentido. */}
            {(canManage || !draft.id) && (
              <label className="admin-field">
                <span>Estado de publicación</span>
                <select name="status" value={draft.status ?? "borrador"} onChange={field}>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {publicationLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <Field label="Descripción (portada)" name="description" value={draft.description ?? ""} onChange={field} placeholder="Párrafo largo que se muestra en la portada" multiline required />
            <Field label="Foco (tablero)" name="focus" value={draft.focus ?? ""} onChange={field} placeholder="Frase corta para las tarjetas densas" />
            <Field label="Lectura destacada" name="insight" value={draft.insight ?? ""} onChange={field} placeholder="Qué conviene mirar primero en este pilar" multiline />
            <Field label="Impulsador" name="impulsor" value={draft.impulsor ?? ""} onChange={field} placeholder="¿Qué impulsa este pilar?" />
            <Field label="Aporta a" name="contributes" value={draft.contributes ?? ""} onChange={field} placeholder="¿Qué aporta a la institución?" />
            <Field label="Responsable de la gestión" name="management_owner" value={draft.management_owner ?? ""} onChange={field} placeholder="Área o dependencia" />
            <Field label="Responsable del cálculo" name="calculation_owner" value={draft.calculation_owner ?? ""} onChange={field} placeholder="Área responsable del indicador" />
          </div>

          <div className="admin-form__actions">
            <button className="button-ghost" type="button" onClick={() => setDraft(null)}>
              Cancelar
            </button>
            <button className="button-primary" type="submit" disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? "Guardando…" : "Guardar pilar"}
              <span data-arrow aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      )}

      {pendingDelete && (
        <Modal
          title="Eliminar pilar"
          description={`“${pendingDelete.name}” se eliminará junto con sus áreas, líneas, proyectos, actividades y documentos. Esta acción no se puede deshacer.`}
          onClose={() => setPendingDelete(null)}
        >
          <div className="modal-actions">
            <button className="button-ghost" type="button" onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
            <button className="button-danger" type="button" onClick={confirmDelete} disabled={remove.isPending}>
              {remove.isPending ? "Eliminando…" : "Eliminar pilar"}
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

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  hint,
  multiline = false,
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <label className={`admin-field${multiline ? " admin-field--wide" : ""}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea name={name} value={value} onChange={onChange} placeholder={placeholder} rows={3} required={required} />
      ) : (
        <input name={name} value={value} onChange={onChange} placeholder={placeholder} required={required} />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}
