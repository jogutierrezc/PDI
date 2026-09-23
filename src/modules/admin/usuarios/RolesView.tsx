/* =============================================================================
   Roles: nombre, para qué es, y qué hace en cada módulo.

   A la izquierda, los roles en dos grupos —los de toda la intranet y los que
   se dan en una unidad—; a la derecha, el rol abierto con su matriz. Se parte
   de una plantilla (Consulta · Editor · Revisor · Administrador) y tocar la
   matriz la vuelve «Personalizada». Todo lo que se elige se traduce, al
   guardar, a las columnas que la base ya hace cumplir (role-matrix.ts): las
   políticas RLS no cambian.

   Los roles de fábrica no se borran y su capacidad no cambia: si
   desaparecieran, o si la capacidad cambiara por debajo, las personas que
   cuelgan de ellos quedarían con otra cosa sin que nadie se lo haya pedido.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { Modal } from "../../../components/ui/Modal";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useAccessRoles, useOdReportOptions } from "../../../data/queries";
import { useDeleteAccessRole, useSaveAccessRole } from "../../../data/mutations";
import { roleLabels } from "../../../lib/auth";
import type { AccessRole, AdminScreen, Profile } from "../../../types/database";
import type { Membership } from "./people-db";
import { roleMatrix } from "./summary";
import {
  BOARD_ROLE_LABEL,
  IMPACT_ACTIONS,
  LEVEL_LABEL,
  MODULES,
  TEMPLATES,
  capacityOf,
  compile,
  describe,
  effectiveLevel,
  raisedModules,
  templateMatrix,
  templateOf,
  type BoardRole,
  type Level,
  type Matrix,
  type ModuleId,
  type Scope,
  type TemplateId,
} from "./role-matrix";

const TEMPLATE_LABEL: Record<TemplateId, string> = {
  consulta: "Consulta",
  editor: "Editor",
  revisor: "Revisor",
  administrador: "Administrador",
  personalizada: "Personalizada",
};

const LEVELS: Level[] = ["none", "ver", "editar", "administrar"];

const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export function RolesView({ profiles, memberships }: { profiles: Profile[]; memberships: Membership[] }) {
  const access = useAccessRoles();
  const [params, setParams] = useSearchParams();
  const selected = params.get("rol");

  const roles = access.data?.roles ?? [];
  const reports = access.data?.reports ?? [];
  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("rol", id);
    else next.delete("rol");
    setParams(next, { replace: true });
  };

  const peopleOf = (role: AccessRole) =>
    (role.scope ?? "global") === "unidad"
      ? new Set(memberships.filter((m) => m.accessRoleId === role.id).map((m) => m.profileId)).size
      : profiles.filter((person) => person.access_role_id === role.id).length;

  const current = selected === "nuevo" ? null : roles.find((role) => role.id === selected) ?? null;

  if (access.isPending) return <LoadingBlock rows={4} label="Cargando roles" />;
  if (access.isError) return <ErrorBlock error={access.error} onRetry={() => void access.refetch()} />;

  const groups: { scope: Scope; label: string; hint: string }[] = [
    { scope: "global", label: "En toda la intranet", hint: "Va en la persona: pantallas, capacidad e informes." },
    { scope: "unidad", label: "En una unidad", hint: "Se da en un programa, facultad o vicerrectoría." },
  ];

  return (
    <div className="us-split">
      <aside className="us-list" aria-label="Roles">
        <button type="button" className="us-list__new" onClick={() => open("nuevo")} aria-pressed={selected === "nuevo"}>
          <Icon name="plus" size={15} /> Nuevo rol
        </button>
        {groups.map((group) => {
          const items = roles.filter((role) => (role.scope ?? "global") === group.scope);
          return (
            <section key={group.scope} className="us-list__group" aria-label={group.label}>
              <header>
                <h3>{group.label}</h3>
                <small>{group.hint}</small>
              </header>
              <ul>
                {items.map((role) => {
                  const template = templateOf(roleMatrix(role, reports));
                  const people = peopleOf(role);
                  return (
                    <li key={role.id}>
                      <button
                        type="button"
                        className="us-item"
                        aria-current={role.id === selected ? "true" : undefined}
                        onClick={() => open(role.id)}
                      >
                        <span className="us-item__main">
                          <strong>{role.name}</strong>
                          <small>{role.description || "Sin descripción"}</small>
                        </span>
                        <span className="us-item__meta">
                          <span className="us-chip" data-template={template}>
                            {TEMPLATE_LABEL[template]}
                          </span>
                          <small>
                            {people} {people === 1 ? "persona" : "personas"}
                          </small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </aside>

      <div className="us-detail">
        {selected === null ? (
          <div className="us-empty">
            <Icon name="shield" size={22} />
            <h3>Elija un rol para ver qué hace</h3>
            <p>
              Cada rol dice qué hace quien lo lleva en cada módulo. Los de toda la intranet van en la persona; los de
              unidad se dan en un programa, una facultad o una vicerrectoría.
            </p>
          </div>
        ) : selected !== "nuevo" && !current ? (
          <div className="us-empty">
            <h3>Ese rol ya no existe</h3>
            <button type="button" className="button-ghost" onClick={() => open(null)}>
              Volver a la lista
            </button>
          </div>
        ) : (
          <RoleEditor
            key={current?.id ?? "nuevo"}
            role={current}
            reports={reports}
            people={current ? peopleOf(current) : 0}
            onSaved={(id) => open(id)}
            onDeleted={() => open(null)}
          />
        )}
      </div>
    </div>
  );
}

function RoleEditor({
  role,
  reports,
  people,
  onSaved,
  onDeleted,
}: {
  role: AccessRole | null;
  reports: { access_role_id: string; report_slug: string }[];
  people: number;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const reportOptions = useOdReportOptions();
  const save = useSaveAccessRole();
  const remove = useDeleteAccessRole();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [matrix, setMatrix] = useState<Matrix>(() =>
    role ? roleMatrix(role, reports) : (templateMatrix("consulta", "global") as Matrix),
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openRows, setOpenRows] = useState<ModuleId[]>([]);

  useEffect(() => setNotice(""), [matrix, name, description]);

  const system = role?.is_system ?? false;
  const template = templateOf(matrix);
  const capacity = capacityOf(matrix);
  const raised = raisedModules(matrix);
  const reportNames = useMemo(
    () => new Map((reportOptions.data ?? []).map((report) => [report.slug, report.name])),
    [reportOptions.data],
  );
  const summary = describe(matrix, reportNames);
  const capacityChanged = system && role && matrix.scope === "global" && capacity !== role.base_role;

  const update = (change: (draft: Matrix) => void) =>
    setMatrix((previous) => {
      const draft: Matrix = structuredClone(previous);
      change(draft);
      return draft;
    });

  function applyTemplate(id: Exclude<TemplateId, "personalizada">) {
    const next = templateMatrix(id, matrix.scope);
    if (next) setMatrix(next);
  }

  function setScope(scope: Scope) {
    if (scope === matrix.scope) return;
    setMatrix(templateMatrix("consulta", scope) as Matrix);
  }

  function setLevel(id: ModuleId, level: Level) {
    update((draft) => {
      const module = MODULES.find((m) => m.id === id)!;
      const choice = draft.modules[id];
      choice.level = level;
      if (level === "none") choice.screens = [];
      else if (choice.screens.length === 0) choice.screens = module.screens.map((s) => s.id);
      if (id === "cifras") {
        if (level === "administrar") draft.allReports = true;
        if (level === "editar" && draft.allReports) draft.allReports = false;
      }
      if (id === "impacto") {
        const globals = ["impacto.catalogo", "impacto.periodo"];
        draft.capabilities = draft.capabilities.filter((cap) => !globals.includes(cap));
        if (level === "administrar") draft.capabilities.push(...globals);
      }
    });
  }

  function toggleScreen(id: ModuleId, screen: AdminScreen) {
    update((draft) => {
      const choice = draft.modules[id];
      choice.screens = choice.screens.includes(screen)
        ? choice.screens.filter((s) => s !== screen)
        : [...choice.screens, screen];
      if (choice.screens.length === 0) choice.level = "none";
    });
  }

  const toggleCap = (cap: string) =>
    update((draft) => {
      draft.capabilities = draft.capabilities.includes(cap)
        ? draft.capabilities.filter((c) => c !== cap)
        : [...draft.capabilities, cap];
    });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("El rol necesita un nombre.");
      return;
    }
    if (capacityChanged) {
      setError(
        `Es un rol de fábrica: su capacidad es ${roleLabels[role!.base_role]} y no cambia. Con esta matriz pediría ${roleLabels[capacity]}. Cree un rol nuevo para eso.`,
      );
      return;
    }
    const columns = compile(matrix);
    try {
      const saved = await save.mutateAsync({
        role: {
          ...(role ? { id: role.id } : { position: 50 }),
          key: role?.key ?? `${slugify(name)}_${Date.now().toString(36).slice(-4)}`,
          name: name.trim(),
          description: description.trim(),
          base_role: columns.base_role,
          screens: columns.screens,
          all_screens: columns.all_screens,
          all_reports: columns.all_reports,
          capabilities: columns.capabilities,
          scope: columns.scope,
          unit_role: columns.unit_role,
        },
        reports: columns.reports,
      });
      setNotice("Rol guardado.");
      onSaved(saved.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el rol.");
    }
  }

  const reportsFor = (level: Level) => level === "ver" || level === "editar";

  return (
    <form className="us-role" onSubmit={handleSubmit} aria-label={role ? `Editar ${role.name}` : "Nuevo rol"}>
      <header className="us-detail__head">
        <div>
          <h2>{role ? role.name : "Nuevo rol"}</h2>
          <p>
            {role?.is_system && <span className="record-flag">De fábrica</span>}
            {people > 0
              ? `${people} ${people === 1 ? "persona lo lleva" : "personas lo llevan"}: lo que cambie aquí les cambia a ellas.`
              : "Nadie lo lleva todavía."}
          </p>
        </div>
        <div className="us-detail__actions">
          {role && !system && (
            <button
              type="button"
              className="button-ghost"
              data-tone="danger"
              disabled={people > 0}
              title={people > 0 ? "Reasigne primero a quienes lo llevan" : undefined}
              onClick={() => setConfirmDelete(true)}
            >
              Borrar
            </button>
          )}
          <button type="submit" className="button-primary" disabled={save.isPending}>
            {save.isPending ? "Guardando…" : role ? "Guardar rol" : "Crear rol"}
          </button>
        </div>
      </header>

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      {notice && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} /> {notice}
        </p>
      )}

      <div className="us-fields">
        <label className="admin-field">
          <span>Nombre</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Dirección de programa"
          />
        </label>
        <label className="admin-field">
          <span>Para qué es</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Lo lee quien asigna el rol. Ej.: captura y envía lo que reporta su programa."
          />
        </label>
      </div>

      <fieldset className="us-scope">
        <legend>Dónde vale</legend>
        {(["global", "unidad"] as Scope[]).map((scope) => (
          <label key={scope} className="us-option">
            <input
              type="radio"
              name="alcance"
              checked={matrix.scope === scope}
              disabled={Boolean(role) && people > 0 && matrix.scope !== scope}
              onChange={() => setScope(scope)}
            />
            <span>
              <strong>{scope === "global" ? "En toda la intranet" : "En una unidad"}</strong>
              <small>
                {scope === "global"
                  ? "Se da a la persona. Decide pantallas, capacidad e informes."
                  : "Se da en un programa, facultad o vicerrectoría. Decide qué hace allí en Impacto y en sus tableros."}
              </small>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="us-templates">
        <legend>
          Plantilla <span className="us-chip" data-template={template}>{TEMPLATE_LABEL[template]}</span>
        </legend>
        <div className="us-templates__row">
          {TEMPLATES.map((item) => {
            const unavailable = templateMatrix(item.id, matrix.scope) === null;
            return (
              <button
                key={item.id}
                type="button"
                className="us-template"
                aria-pressed={template === item.id}
                disabled={unavailable}
                onClick={() => applyTemplate(item.id)}
              >
                <strong>{item.label}</strong>
                <small>{item.hint[matrix.scope]}</small>
              </button>
            );
          })}
        </div>
        <small className="users-hint">Parta de una plantilla y ajuste la matriz: al tocarla, el rol pasa a «Personalizada».</small>
      </fieldset>

      {matrix.scope === "global" ? (
        <div className="us-matrix" role="group" aria-label="Qué hace en cada módulo">
          <div className="us-matrix__head" aria-hidden="true">
            <span>Módulo</span>
            <span className="us-levels">
              {LEVELS.map((level) => (
                <span key={level}>{LEVEL_LABEL[level]}</span>
              ))}
            </span>
          </div>
          {MODULES.map((module) => {
            const choice = matrix.modules[module.id];
            const effective = effectiveLevel(matrix, module.id);
            const isRaised = raised.includes(module.id);
            const expanded = openRows.includes(module.id);
            const partial = choice.level !== "none" && choice.screens.length < module.screens.length;
            return (
              <div key={module.id} className="us-matrix__row" data-level={effective}>
                <div className="us-matrix__module">
                  <strong id={`mod-${module.id}`}>{module.label}</strong>
                  {choice.level !== "none" && module.screens.length > 1 && (
                    <button
                      type="button"
                      className="us-link"
                      aria-expanded={expanded}
                      onClick={() =>
                        setOpenRows((rows) =>
                          rows.includes(module.id) ? rows.filter((r) => r !== module.id) : [...rows, module.id],
                        )
                      }
                    >
                      {partial ? `${choice.screens.length} de ${module.screens.length} pantallas` : "Todas las pantallas"}
                      <Icon name="chevron-down" size={13} />
                    </button>
                  )}
                </div>
                <div className="us-levels" role="radiogroup" aria-labelledby={`mod-${module.id}`}>
                  {LEVELS.map((level) => {
                    const def = level === "none" ? null : module.levels[level];
                    if (level !== "none" && !def) {
                      return (
                        <span key={level} className="us-level is-na" aria-hidden="true">
                          —
                        </span>
                      );
                    }
                    return (
                      <label key={level} className="us-level" data-level={level} title={def?.hint}>
                        <input
                          type="radio"
                          name={`nivel-${module.id}`}
                          checked={choice.level === level}
                          onChange={() => setLevel(module.id, level)}
                        />
                        <span>{LEVEL_LABEL[level]}</span>
                      </label>
                    );
                  })}
                </div>

                {choice.level !== "none" && (
                  <div className="us-matrix__more">
                    {module.levels[choice.level as Exclude<Level, "none">] && (
                      <small>{module.levels[choice.level as Exclude<Level, "none">]!.hint}</small>
                    )}
                    {isRaised && (
                      <small className="us-raised">
                        <Icon name="alert" size={13} /> En realidad podrá {LEVEL_LABEL[effective].toLowerCase()}: la
                        capacidad del rol es {roleLabels[capacity]} (la pide otro módulo) y la base no la separa por
                        módulos.
                      </small>
                    )}
                    {expanded && module.screens.length > 1 && (
                      <div className="us-screens">
                        {module.screens.map((screen) => (
                          <label key={screen.id} className="oda-check">
                            <input
                              type="checkbox"
                              checked={choice.screens.includes(screen.id)}
                              onChange={() => toggleScreen(module.id, screen.id)}
                            />
                            {screen.label}
                            {screen.note && <small> · {screen.note}</small>}
                          </label>
                        ))}
                      </div>
                    )}
                    {module.id === "cifras" && reportsFor(choice.level) && (
                      <div className="us-reports">
                        <label className="oda-check">
                          <input
                            type="checkbox"
                            checked={matrix.allReports}
                            onChange={(event) => update((draft) => void (draft.allReports = event.target.checked))}
                          />
                          Todos los informes
                        </label>
                        {!matrix.allReports && (
                          <div className="us-screens">
                            {(reportOptions.data ?? []).length === 0 ? (
                              <small>Todavía no hay informes en UDES en Cifras.</small>
                            ) : (
                              (reportOptions.data ?? []).map((report) => (
                                <label key={report.slug} className="oda-check">
                                  <input
                                    type="checkbox"
                                    checked={matrix.reports.includes(report.slug)}
                                    onChange={() =>
                                      update((draft) => {
                                        draft.reports = draft.reports.includes(report.slug)
                                          ? draft.reports.filter((r) => r !== report.slug)
                                          : [...draft.reports, report.slug];
                                      })
                                    }
                                  />
                                  {report.name}
                                </label>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {module.id === "impacto" && choice.level === "administrar" && (
                      <div className="us-actions">
                        {IMPACT_ACTIONS.filter((a) => a.scope === "global").map((action) => (
                          <label key={action.id} className="us-action">
                            <input
                              type="checkbox"
                              checked={matrix.capabilities.includes(action.id)}
                              onChange={() => toggleCap(action.id)}
                            />
                            <span>
                              <strong>{action.label}</strong>
                              <small>{action.hint}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="us-unit">
          <fieldset className="us-unit__block">
            <legend>Impacto Institucional · en su unidad</legend>
            <div className="us-actions">
              {IMPACT_ACTIONS.filter((a) => a.scope === "unidad").map((action) => (
                <label key={action.id} className="us-action">
                  <input
                    type="checkbox"
                    checked={matrix.capabilities.includes(action.id)}
                    onChange={() => toggleCap(action.id)}
                  />
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.hint}</small>
                  </span>
                </label>
              ))}
            </div>
            <small className="users-hint">
              Nadie aprueba ni valida lo que capturó: la base lo impide aunque el rol tenga las dos acciones.
            </small>
          </fieldset>
          <fieldset className="us-unit__block">
            <legend>Función en la unidad · datos y tableros</legend>
            <div className="us-levels us-levels--wide" role="radiogroup" aria-label="Función en la unidad">
              {(Object.keys(BOARD_ROLE_LABEL) as BoardRole[]).map((board) => (
                <label key={board} className="us-level" title={BOARD_ROLE_LABEL[board].hint}>
                  <input
                    type="radio"
                    name="tableros"
                    checked={matrix.boardRole === board}
                    onChange={() => update((draft) => void (draft.boardRole = board))}
                  />
                  <span>{BOARD_ROLE_LABEL[board].label}</span>
                </label>
              ))}
            </div>
            <small className="users-hint">{BOARD_ROLE_LABEL[matrix.boardRole].hint}</small>
          </fieldset>
        </div>
      )}

      <aside className="us-summary" aria-label="Resumen del rol">
        <h3>Quien lleve este rol</h3>
        <ul>
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {matrix.scope === "global" && (
          <p>
            Capacidad resultante: <strong>{roleLabels[capacity]}</strong>
            {capacityChanged && <span className="us-raised"> · distinta de la de fábrica ({roleLabels[role!.base_role]})</span>}
          </p>
        )}
      </aside>

      {confirmDelete && role && (
        <Modal
          title={`Borrar el rol ${role.name}`}
          description="El rol desaparece de la lista. Solo se puede borrar cuando ya nadie lo lleva."
          onClose={() => setConfirmDelete(false)}
        >
          <div className="modal-actions">
            <button type="button" className="button-ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="button-danger"
              disabled={remove.isPending}
              onClick={async () => {
                setError("");
                try {
                  await remove.mutateAsync(role.id);
                  setConfirmDelete(false);
                  onDeleted();
                } catch (deleteError) {
                  setConfirmDelete(false);
                  setError(deleteError instanceof Error ? deleteError.message : "No se pudo borrar el rol.");
                }
              }}
            >
              {remove.isPending ? "Borrando…" : "Borrar rol"}
            </button>
          </div>
        </Modal>
      )}
    </form>
  );
}
