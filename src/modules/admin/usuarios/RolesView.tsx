/* =============================================================================
   Roles: nombre, para qué es, y qué hace en cada módulo.

   A la izquierda, los roles; a la derecha, el rol abierto con su matriz. Se
   parte de una plantilla (Consulta · Editor · Administrador) y tocar la
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
import { UNIT_KIND, type UnitKind } from "../../tableros/model";
import { useUnitOptions, type UnitOption } from "./people-db";
import { roleMatrix } from "./summary";
import {
  LEVEL_LABEL,
  MODULES,
  TEMPLATES,
  capacityOf,
  compile,
  describe,
  effectiveLevel,
  impactLevelOf,
  raisedModules,
  templateMatrix,
  templateOf,
  type Level,
  type Matrix,
  type ModuleId,
  type TemplateId,
} from "./role-matrix";

const TEMPLATE_LABEL: Record<TemplateId, string> = {
  consulta: "Consulta",
  editor: "Editor",
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

export function RolesView({ profiles }: { profiles: Profile[] }) {
  const access = useAccessRoles();
  const [params, setParams] = useSearchParams();
  const selected = params.get("rol");

  const roles = access.data?.roles ?? [];
  const reports = access.data?.reports ?? [];
  const units = access.data?.units ?? [];
  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("rol", id);
    else next.delete("rol");
    setParams(next, { replace: true });
  };

  const peopleOf = (role: AccessRole) => profiles.filter((person) => person.access_role_id === role.id).length;

  const current = selected === "nuevo" ? null : roles.find((role) => role.id === selected) ?? null;

  if (access.isPending) return <LoadingBlock rows={4} label="Cargando roles" />;
  if (access.isError) return <ErrorBlock error={access.error} onRetry={() => void access.refetch()} />;

  return (
    <div className="us-split">
      <aside className="us-list" aria-label="Roles">
        <button type="button" className="us-list__new" onClick={() => open("nuevo")} aria-pressed={selected === "nuevo"}>
          <Icon name="plus" size={15} /> Nuevo rol
        </button>
        <section className="us-list__group" aria-label="Roles de acceso">
          <header>
            <h3>Roles de acceso</h3>
            <small>Van en la persona: pantallas, capacidad e informes.</small>
          </header>
          <ul>
                {roles.map((role) => {
                  const template = templateOf(roleMatrix(role, reports, units));
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
      </aside>

      <div className="us-detail">
        {selected === null ? (
          <div className="us-empty">
            <Icon name="shield" size={22} />
            <h3>Elija un rol para ver qué hace</h3>
            <p>
              Cada rol dice qué hace quien lo lleva en cada módulo de la intranet. Lo que hace en cada unidad donde
              trabaja (Gestor, Contribuyente o Consulta) se dice en su ficha, no aquí.
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
            units={units}
            people={current ? peopleOf(current) : 0}
            onSaved={(id) => open(id)}
            onDeleted={() => open(null)}
          />
        )}
      </div>
    </div>
  );
}

/** Las unidades sobre las que puede actuar un rol de Impacto, en el orden en que se piensan. */
const SCOPE_KINDS: UnitKind[] = ["vicerrectoria", "oficina", "facultad", "programa"];

/**
 * Alcance de un rol de Impacto: toda la estructura o las vicerrectorías,
 * oficinas, facultades y programas que se marquen. Una facultad alcanza a sus
 * programas (la base hereda por el árbol), pero una vicerrectoría no alcanza a
 * las facultades: dependen de ella en el organigrama, no cuelgan de ella.
 */
function ImpactScopePicker({
  units,
  loading,
  scope,
  onChange,
}: {
  units: UnitOption[];
  loading: boolean;
  scope: { allUnits: boolean; units: string[] };
  onChange: (change: (scope: { allUnits: boolean; units: string[] }) => void) => void;
}) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const groups = SCOPE_KINDS.map((kind) => ({
    kind,
    items: units
      .filter((unit) => unit.kind === kind && (!needle || `${unit.name} ${unit.code}`.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
  })).filter((group) => group.items.length > 0);

  const toggle = (id: string) =>
    onChange((draft) => {
      draft.units = draft.units.includes(id) ? draft.units.filter((unit) => unit !== id) : [...draft.units, id];
    });

  return (
    <div className="us-reports" role="group" aria-label="Alcance en Indicadores de impacto">
      <label className="oda-check">
        <input
          type="checkbox"
          checked={scope.allUnits}
          onChange={(event) => onChange((draft) => void (draft.allUnits = event.target.checked))}
        />
        Toda la estructura
      </label>
      {!scope.allUnits && (
        <>
          <small>
            {scope.units.length === 0
              ? "Elija las vicerrectorías, facultades o programas sobre los que actúa. Una facultad incluye a sus programas."
              : `${scope.units.length} ${scope.units.length === 1 ? "unidad elegida" : "unidades elegidas"}. Una facultad incluye a sus programas.`}
          </small>
          <label className="admin-field">
            <span>Buscar unidad</span>
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Nombre o código" />
          </label>
          {loading ? (
            <small>Cargando unidades…</small>
          ) : groups.length === 0 ? (
            <small>{needle ? "Ninguna unidad coincide." : "Todavía no hay unidades en la estructura institucional."}</small>
          ) : (
            groups.map((group) => (
              <div key={group.kind}>
                <strong>{UNIT_KIND[group.kind].plural}</strong>
                <div className="us-screens">
                  {group.items.map((unit) => (
                    <label key={unit.id} className="oda-check">
                      <input type="checkbox" checked={scope.units.includes(unit.id)} onChange={() => toggle(unit.id)} />
                      {unit.name}
                      <small> · {unit.code}</small>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

function RoleEditor({
  role,
  reports,
  units,
  people,
  onSaved,
  onDeleted,
}: {
  role: AccessRole | null;
  reports: { access_role_id: string; report_slug: string }[];
  units: { access_role_id: string; unit_id: string }[];
  people: number;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const reportOptions = useOdReportOptions();
  const unitOptions = useUnitOptions();
  const save = useSaveAccessRole();
  const remove = useDeleteAccessRole();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [matrix, setMatrix] = useState<Matrix>(() =>
    role ? roleMatrix(role, reports, units) : templateMatrix("consulta"),
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
  const unitNames = useMemo(
    () => new Map((unitOptions.data ?? []).map((unit) => [unit.id, unit.name])),
    [unitOptions.data],
  );
  const summary = describe(matrix, reportNames, unitNames);
  const impactNeedsScope = impactLevelOf(matrix.modules.impacto.level) !== "none" && !matrix.impact.allUnits && matrix.impact.units.length === 0;
  const capacityChanged = system && role && capacity !== role.base_role;

  const update = (change: (draft: Matrix) => void) =>
    setMatrix((previous) => {
      const draft: Matrix = structuredClone(previous);
      change(draft);
      return draft;
    });

  function applyTemplate(id: Exclude<TemplateId, "personalizada">) {
    setMatrix(templateMatrix(id));
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
    if (impactNeedsScope) {
      setError(
        "En Indicadores de impacto, Editar y Administrar piden un alcance: elija al menos una vicerrectoría, facultad o programa, o marque «Toda la estructura».",
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
          impact_level: columns.impact_level,
          all_impact_units: columns.all_impact_units,
        },
        reports: columns.reports,
        units: columns.units,
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
            placeholder="Coordinación de calidad"
          />
        </label>
        <label className="admin-field">
          <span>Para qué es</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Lo lee quien asigna el rol. Ej.: carga los informes de UDES en Cifras de su oficina."
          />
        </label>
      </div>

      <fieldset className="us-templates">
        <legend>
          Plantilla <span className="us-chip" data-template={template}>{TEMPLATE_LABEL[template]}</span>
        </legend>
        <div className="us-templates__row">
          {TEMPLATES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="us-template"
              aria-pressed={template === item.id}
              onClick={() => applyTemplate(item.id)}
            >
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
        <small className="users-hint">Parta de una plantilla y ajuste la matriz: al tocarla, el rol pasa a «Personalizada».</small>
      </fieldset>

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
                  {module.id === "impacto" && impactLevelOf(choice.level) !== "none" && (
                    <ImpactScopePicker
                      units={unitOptions.data ?? []}
                      loading={unitOptions.isPending}
                      scope={matrix.impact}
                      onChange={(change) => update((draft) => change(draft.impact))}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <aside className="us-summary" aria-label="Resumen del rol">
        <h3>Quien lleve este rol</h3>
        <ul>
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          Capacidad resultante: <strong>{roleLabels[capacity]}</strong>
          {capacityChanged && <span className="us-raised"> · distinta de la de fábrica ({roleLabels[role!.base_role]})</span>}
        </p>
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
