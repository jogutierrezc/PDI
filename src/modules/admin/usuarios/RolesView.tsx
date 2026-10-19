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
import type { AccessRole, AdminScreen, InformeLevel, Profile } from "../../../types/database";
import { UNIT_KIND, type UnitKind } from "../../tableros/model";
import { PLANTILLAS, plantillaSugerida } from "../../informes/plantillas";
import type { Plantilla } from "../../informes/types";
import { useProgramOffer, useUnitOptions, type UnitOption } from "./people-db";
import { reason, roleMatrix } from "./summary";
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
  const copyOf = params.get("copia");

  const roles = access.data?.roles ?? [];
  const reports = access.data?.reports ?? [];
  const units = access.data?.units ?? [];
  const informeUnits = access.data?.informeUnits ?? [];
  const open = (id: string | null, copy?: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("rol", id);
    else next.delete("rol");
    if (copy) next.set("copia", copy);
    else next.delete("copia");
    setParams(next, { replace: true });
  };

  const peopleOf = (role: AccessRole) => profiles.filter((person) => person.access_role_id === role.id).length;

  const current = selected === "nuevo" ? null : roles.find((role) => role.id === selected) ?? null;
  const source = selected === "nuevo" ? roles.find((role) => role.id === copyOf) ?? null : null;

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
                  const template = templateOf(roleMatrix(role, reports, units, informeUnits));
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
            key={current?.id ?? `nuevo-${source?.id ?? ""}`}
            role={current}
            source={source}
            onDuplicate={(id) => open("nuevo", id)}
            reports={reports}
            units={units}
            informeUnits={informeUnits}
            people={current ? peopleOf(current) : 0}
            onSaved={(id) => open(id)}
            onDeleted={() => open(null)}
          />
        )}
      </div>
    </div>
  );
}

/** Las unidades que escriben informe, como en el Tablero del ciclo: todas menos los programas. */
const escribeInforme = (kind: UnitKind) => kind !== "programa";

const PAPEL_INFORME: { id: InformeLevel; label: string; hint: string }[] = [
  { id: "none", label: "Solo el de su unidad", hint: "Escribe el informe de la unidad a la que pertenece, si pertenece a una." },
  { id: "editor", label: "Diligencia", hint: "Escribe el informe de las unidades que elija, como un Contribuyente." },
  { id: "jefe", label: "Diligencia y envía", hint: "Además lo envía a revisión, como un Gestor." },
];

/**
 * Quién hace el informe: las unidades cuyo informe escribe quien lleve el rol,
 * agrupadas por el modelo (plantilla A–D) que les toca. El alcance es exacto:
 * una facultad no arrastra a sus programas, cada informe es de una unidad.
 */
function InformeScopePicker({
  units,
  loading,
  scope,
  onChange,
}: {
  units: UnitOption[];
  loading: boolean;
  scope: { level: InformeLevel; allUnits: boolean; units: string[] };
  onChange: (change: (scope: { level: InformeLevel; allUnits: boolean; units: string[] }) => void) => void;
}) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const letras: Plantilla[] = ["A", "B", "C", "D"];
  const writing = units.filter((unit) => escribeInforme(unit.kind));
  const groups = letras
    .map((letra) => ({
      letra,
      items: writing
        .filter((unit) => plantillaSugerida(unit.kind, unit.name) === letra)
        .filter((unit) => !needle || `${unit.name} ${unit.code}`.toLowerCase().includes(needle))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    }))
    .filter((group) => group.items.length > 0);

  const toggle = (id: string) =>
    onChange((draft) => {
      draft.units = draft.units.includes(id) ? draft.units.filter((unit) => unit !== id) : [...draft.units, id];
    });
  const toggleGroup = (ids: string[], on: boolean) =>
    onChange((draft) => {
      const rest = draft.units.filter((unit) => !ids.includes(unit));
      draft.units = on ? [...rest, ...ids] : rest;
    });

  return (
    <div className="us-reports" role="group" aria-label="Quién hace el informe en Informes de gestión">
      <strong>Quién hace el informe</strong>
      <div className="us-screens">
        {PAPEL_INFORME.map((option) => (
          <label key={option.id} className="oda-check" title={option.hint}>
            <input
              type="radio"
              name="papel-informe"
              checked={scope.level === option.id}
              onChange={() => onChange((draft) => void (draft.level = option.id))}
            />
            {option.label}
          </label>
        ))}
      </div>
      <small>{PAPEL_INFORME.find((option) => option.id === scope.level)?.hint}</small>
      {scope.level !== "none" && (
        <>
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
                  ? "Elija las unidades cuyo informe escribe, por modelo: A decanaturas, B vicerrectorías y oficinas, C rectorías de campus, D Rectoría General."
                  : `${scope.units.length} ${scope.units.length === 1 ? "unidad elegida" : "unidades elegidas"}.`}
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
                groups.map((group) => {
                  const ids = group.items.map((unit) => unit.id);
                  const all = ids.every((id) => scope.units.includes(id));
                  return (
                    <div key={group.letra}>
                      <strong>
                        Modelo {group.letra} · {PLANTILLAS[group.letra].quien}
                      </strong>
                      <label className="oda-check">
                        <input type="checkbox" checked={all} onChange={(event) => toggleGroup(ids, event.target.checked)} />
                        Marcar todas ({ids.length})
                      </label>
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
                  );
                })
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function RoleEditor({
  role,
  source,
  onDuplicate,
  reports,
  units,
  informeUnits,
  people,
  onSaved,
  onDeleted,
}: {
  role: AccessRole | null;
  /** Rol que se duplica: el nuevo parte de su nombre, descripción y matriz. */
  source: AccessRole | null;
  onDuplicate: (id: string) => void;
  reports: { access_role_id: string; report_slug: string }[];
  units: { access_role_id: string; unit_id: string }[];
  informeUnits: { access_role_id: string; unit_id: string }[];
  people: number;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const reportOptions = useOdReportOptions();
  const unitOptions = useUnitOptions();
  const save = useSaveAccessRole();
  const remove = useDeleteAccessRole();
  const base = role ?? source;
  const [name, setName] = useState(role ? role.name : source ? `${source.name} (copia)` : "");
  const [description, setDescription] = useState(base?.description ?? "");
  const [matrix, setMatrix] = useState<Matrix>(() =>
    base ? roleMatrix(base, reports, units, informeUnits) : templateMatrix("consulta"),
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
  const informeNeedsScope =
    matrix.modules.informes.level !== "none" &&
    matrix.informe.level !== "none" &&
    !matrix.informe.allUnits &&
    matrix.informe.units.length === 0;
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
    if (informeNeedsScope) {
      setError(
        "En Informes de gestión, el papel de Diligencia o Envío pide un alcance: elija al menos una unidad, o marque «Toda la estructura». Si solo debe escribir el informe de la unidad a la que pertenece, deje el papel en «Solo el de su unidad».",
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
          informe_level: columns.informe_level,
          all_informe_units: columns.all_informe_units,
        },
        reports: columns.reports,
        units: columns.units,
        informeUnits: columns.informe_units,
      });
      setNotice("Rol guardado.");
      onSaved(saved.id);
    } catch (saveError) {
      setError(reason(saveError, "No se pudo guardar el rol."));
    }
  }

  const reportsFor = (level: Level) => level === "ver" || level === "editar";

  return (
    <form className="us-role" onSubmit={handleSubmit} aria-label={role ? `Editar ${role.name}` : "Nuevo rol"}>
      <header className="us-detail__head">
        <div>
          <h2>{role ? role.name : source ? `Nuevo rol, copia de ${source.name}` : "Nuevo rol"}</h2>
          <p>
            {role?.is_system && <span className="record-flag">De fábrica</span>}
            {people > 0
              ? `${people} ${people === 1 ? "persona lo lleva" : "personas lo llevan"}: lo que cambie aquí les cambia a ellas.`
              : "Nadie lo lleva todavía."}
          </p>
        </div>
        <div className="us-detail__actions">
          {role && (
            <button type="button" className="button-ghost" onClick={() => onDuplicate(role.id)}>
              Duplicar
            </button>
          )}
          {role && !system && (
            <button
              type="button"
              className="button-ghost"
              data-tone="danger"
              disabled={people > 0}
              title={people > 0 ? "Reasigne primero a quienes lo llevan (y cambie el rol de los correos de la lista de acceso que lo usan)" : undefined}
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

      <p className="users-hint">
        Qué se hace cumplir: las pantallas que marque se ven en el menú. Lo que cada persona puede cambiar lo decide la
        capacidad del rol (la mayor que pida un módulo) y, en Impacto, Mis Tableros y el Monitor, su unidad. Si un
        módulo queda por encima de lo que eligió, la matriz se lo avisa.
      </p>
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
                  {effective === "none" && (
                    <small className="us-raised">
                      <Icon name="alert" size={13} /> No lo verá: este módulo se abre desde la capacidad{" "}
                      {roleLabels[module.seenFrom ?? "consulta"]} y la del rol es {roleLabels[capacity]}. Suba otro
                      módulo a ese nivel o quite este.
                    </small>
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
                  {module.id === "informes" && (
                    <InformeScopePicker
                      units={unitOptions.data ?? []}
                      loading={unitOptions.isPending}
                      scope={matrix.informe}
                      onChange={(change) => update((draft) => change(draft.informe))}
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
                  setError(reason(deleteError, "No se pudo borrar el rol."));
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
