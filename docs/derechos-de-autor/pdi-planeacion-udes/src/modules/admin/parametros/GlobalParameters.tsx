import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { Modal, ModalActions } from "../../../components/ui/Modal";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { keys, useParameters } from "../../../data/queries";
import { useCreateRow, useDeleteRow } from "../../../data/mutations";
import { useAuth } from "../../../lib/auth";
import type { IconName } from "../../../components/ui/Icon";
import type { Parameter, ParameterCategory } from "../../../types/database";

const CATEGORIES: {
  key: ParameterCategory;
  title: string;
  description: string;
  icon: IconName;
  hint: string;
}[] = [
  {
    key: "estado_proyecto",
    title: "Estados de proyecto",
    description: "Estados administrativos disponibles para los proyectos del plan.",
    icon: "check",
    hint: "Se usan en la configuración de cada pilar.",
  },
  {
    key: "nivel_gestion",
    title: "Niveles de gestión",
    description: "Clasifica el nivel de gestión de cada indicador del PDI.",
    icon: "grid",
    hint: "Se muestran en la ficha pública del indicador.",
  },
  {
    key: "unidad",
    title: "Unidades de medida",
    description: "Unidades para metas, resultados y porcentajes.",
    icon: "document",
    hint: "Permiten interpretar correctamente cada meta.",
  },
  {
    key: "periodicidad",
    title: "Periodicidad",
    description: "Frecuencia con la que se reportan los resultados.",
    icon: "clock",
    hint: "Se asigna desde la planeación de resultados.",
  },
];

export function GlobalParameters() {
  const parameters = useParameters();
  const { hasRole } = useAuth();
  const canEdit = hasRole("planeacion");

  const [editingCategory, setEditingCategory] = useState<ParameterCategory | null>(null);
  const [error, setError] = useState("");

  const scope = [keys.parameters(), keys.pillars()];
  const create = useCreateRow<Partial<Parameter>, Parameter>("parameters", scope);
  const remove = useDeleteRow("parameters", scope);

  const grouped = useMemo(() => {
    const map = new Map<ParameterCategory, Parameter[]>();
    for (const category of CATEGORIES) map.set(category.key, []);
    for (const parameter of parameters.data ?? []) {
      map.get(parameter.category)?.push(parameter);
    }
    return map;
  }, [parameters.data]);

  const total = parameters.data?.length ?? 0;
  const editing = CATEGORIES.find((category) => category.key === editingCategory);

  async function addValue(label: string) {
    if (!editing) return;
    setError("");

    const existing = grouped.get(editing.key) ?? [];
    // El índice único de la base de datos también lo impide, pero avisar antes
    // de enviar da un mensaje mejor que un error de clave duplicada.
    if (existing.some((item) => item.label.toLowerCase() === label.trim().toLowerCase())) {
      setError(`“${label}” ya existe en ${editing.title}.`);
      return;
    }

    try {
      await create.mutateAsync({
        category: editing.key,
        label: label.trim(),
        position: existing.length + 1,
      });
      setEditingCategory(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No se pudo añadir el valor.");
    }
  }

  async function removeValue(parameter: Parameter) {
    setError("");
    try {
      await remove.mutateAsync(parameter.id);
    } catch (removeError) {
      // El FK con ON DELETE RESTRICT protege los indicadores que ya lo usan.
      setError(
        removeError instanceof Error
          ? removeError.message
          : `No se pudo eliminar “${parameter.label}”.`,
      );
    }
  }

  return (
    <AdminShell
      section="parameters"
      kicker="Administración · Configuración"
      title="Parámetros globales"
      description="Catálogos que estructuran la medición y el seguimiento de todos los pilares."
    >
      {!canEdit && <ReadOnlyNotice />}

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}

      <section className="parameters-intro">
        <div>
          <span className="admin-kicker">Base común</span>
          <h2>Una base común para medir el avance</h2>
          <p>
            Estos valores alimentan los desplegables de la configuración de cada pilar. Un valor que ya
            esté en uso no se puede eliminar: la base de datos lo impide para no dejar indicadores
            apuntando a un catálogo que ya no existe.
          </p>
        </div>
        <div className="parameters-intro__badge">
          <strong>{total}</strong>
          <span>valores configurados</span>
        </div>
      </section>

      {parameters.isPending ? (
        <LoadingBlock rows={4} label="Cargando catálogos" />
      ) : parameters.isError ? (
        <ErrorBlock error={parameters.error} onRetry={() => void parameters.refetch()} />
      ) : (
        <section className="parameter-grid">
          {CATEGORIES.map((category) => {
            const values = grouped.get(category.key) ?? [];
            return (
              <article className="admin-card parameter-card" key={category.key}>
                <header className="admin-card__head">
                  <span className="parameter-card__icon">
                    <Icon name={category.icon} size={18} />
                  </span>
                  <span className="parameter-card__count">
                    {values.length} {values.length === 1 ? "valor" : "valores"}
                  </span>
                </header>

                <h2>{category.title}</h2>
                <p>{category.description}</p>

                {values.length === 0 ? (
                  <EmptyBlock title="Sin valores todavía." />
                ) : (
                  <ul className="chip-list">
                    {values.map((parameter) => (
                      <li key={parameter.id}>
                        {parameter.label}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => void removeValue(parameter)}
                            aria-label={`Quitar ${parameter.label} de ${category.title}`}
                          >
                            <Icon name="close" size={13} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <footer className="parameter-card__foot">
                  <small>{category.hint}</small>
                  {canEdit && (
                    <button
                      className="button-ghost"
                      type="button"
                      onClick={() => {
                        setError("");
                        setEditingCategory(category.key);
                      }}
                    >
                      <Icon name="plus" size={15} /> Añadir valor
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </section>
      )}

      {editing && (
        <AddValueModal
          title={`Añadir valor a ${editing.title}`}
          placeholder={`Ej. nuevo ${editing.title.toLowerCase()}`}
          pending={create.isPending}
          onSubmit={addValue}
          onClose={() => setEditingCategory(null)}
        />
      )}
    </AdminShell>
  );
}

function AddValueModal({
  title,
  placeholder,
  pending,
  onSubmit,
  onClose,
}: {
  title: string;
  placeholder: string;
  pending: boolean;
  onSubmit: (label: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    void onSubmit(label);
  }

  return (
    <Modal
      title={title}
      description="Este valor podrá seleccionarse en la configuración de cualquier pilar."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <label className="admin-field">
          <span>Nombre del valor</span>
          <input
            required
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={placeholder}
          />
        </label>
        <ModalActions onCancel={onClose} submitLabel={pending ? "Añadiendo…" : "Añadir valor"} />
      </form>
    </Modal>
  );
}
