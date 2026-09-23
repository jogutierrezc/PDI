/* =============================================================================
   Sistema → Estructura institucional.

   Las unidades con las que trabajan Impacto (quién captura, aprueba y valida)
   y Mis Tableros (quién ve y edita qué tablero). Antes solo se creaban en Mis
   Tableros, y el formulario de allá no pedía lo que Impacto necesita: SNIES,
   nivel, modalidad, sedes y la función que valida cada vicerrectoría.

   A la izquierda, el árbol, en dos ramas:

     · Académica: vicerrectorías → facultades → programas.
     · Administrativa: oficinas y dependencias, que cuelgan de una
       vicerrectoría o de otra oficina.

   Y dos líneas distintas, a propósito:

     · la continua es la herencia (`parent_id`): lo que alguien es en una
       unidad, lo es en lo que cuelga de ella (una oficina bajo su
       vicerrectoría, un programa bajo su facultad);
     · la punteada es el organigrama (`reports_to`): de qué vicerrectoría
       depende una facultad. No da acceso a nada; la vicerrectoría valida por
       función, no por árbol.

   A la derecha, la ficha de la unidad elegida —con sus personas, que se
   añaden, cambian y quitan aquí—, el formulario de una nueva o la carga
   masiva. Escribe por las funciones de 0073 y 0074.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { Modal } from "../../../components/ui/Modal";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useAccessRoles } from "../../../data/queries";
import { freeSlug, UNIT_ROLE } from "../../tableros/model";
import type { UnitKind, UnitRole } from "../../tableros/model";
import { useProfiles } from "../../tableros/store";
import type { AccessRole } from "../../../types/database";
import {
  DEGREE_LABEL,
  FUNCTION_LABEL,
  KIND_LABEL,
  MODALITY_LABEL,
  useDeleteUnit,
  useInstitution,
  useRemoveMembership,
  useSaveMembership,
  useSaveUnit,
} from "./institution-db";
import type {
  DegreeLevel,
  InstMember,
  InstUnit,
  Institution,
  Modality,
  SubstantiveFunction,
  UnitPayload,
} from "./institution-db";
import { StructureImport } from "./StructureImport";
import { normalize } from "./structure-sheet";
import "./institution.css";

const BASE = "/admin/estructura-institucional";
const KINDS: UnitKind[] = ["vicerrectoria", "facultad", "programa", "oficina", "otra"];
const BOARD_ROLES: UnitRole[] = ["jefe", "editor", "visor"];
const isOffice = (unit: InstUnit) => unit.kind === "oficina" || unit.kind === "otra";

const byOrder = (a: InstUnit, b: InstUnit) => a.position - b.position || a.name.localeCompare(b.name, "es");
const byName = (a: InstUnit, b: InstUnit) => a.name.localeCompare(b.name, "es");

/** Lo que le falta a un programa para que Impacto pueda asignarle indicadores. */
function programGaps(unit: InstUnit, data: Institution): string[] {
  if (unit.kind !== "programa") return [];
  const gaps: string[] = [];
  if (!unit.sniesCode) gaps.push("sin SNIES");
  if (!unit.degreeLevel) gaps.push("sin nivel");
  if (!data.offer.some((item) => item.programId === unit.id && item.active)) gaps.push("sin sedes");
  return gaps;
}

const newPath = (kind: UnitKind, parent?: InstUnit) =>
  `${BASE}/nueva?clase=${kind}${parent ? `&padre=${parent.slug}` : ""}`;

export function InstitutionView() {
  const institution = useInstitution();
  const { unidad } = useParams();
  const [params] = useSearchParams();
  const importing = params.has("carga");

  const data = institution.data;
  const selected = data && unidad && unidad !== "nueva" ? data.units.find((unit) => unit.slug === unidad) : undefined;

  return (
    <AdminShell
      section="institution"
      kicker="Sistema"
      title="Estructura institucional"
      description="Vicerrectorías, facultades, programas y dependencias: las unidades con las que trabajan Impacto y Mis Tableros."
      actions={
        <div className="inst-actions">
          <Link className="button-secondary" to={`${BASE}?carga`}>
            <Icon name="upload" size={15} /> Cargar estructura
          </Link>
          <Link className="button-primary" to={`${BASE}/nueva`}>
            <Icon name="plus" size={16} /> Nueva unidad
          </Link>
        </div>
      }
    >
      {institution.isPending ? (
        <LoadingBlock rows={6} label="Cargando la estructura institucional" />
      ) : institution.isError ? (
        <ErrorBlock error={institution.error} onRetry={() => void institution.refetch()} />
      ) : data ? (
        <>
          {!data.ready && (
            <p className="admin-error" role="alert">
              <Icon name="alert" size={16} />
              La base todavía no tiene los campos de la estructura institucional. Aplique las migraciones
              0073_estructura_roles_usuarios.sql y 0074_estructura_carga_y_personas.sql en el editor SQL de Supabase;
              mientras tanto el árbol se ve pero no se guarda.
            </p>
          )}
          <div className="inst">
            <Tree data={data} current={selected?.id ?? null} />
            <div className="inst-main">
              {importing ? (
                <StructureImport data={data} />
              ) : unidad === "nueva" ? (
                <UnitSheet key={`nueva-${params.toString()}`} unit={null} data={data} />
              ) : selected ? (
                <UnitSheet key={selected.id} unit={selected} data={data} />
              ) : unidad ? (
                <EmptyBlock title="No existe esa unidad" hint="Puede que la hayan renombrado o borrado. Elija otra en el árbol." />
              ) : (
                <Overview data={data} />
              )}
            </div>
          </div>
        </>
      ) : null}
    </AdminShell>
  );
}

/* --- El árbol -------------------------------------------------------------------- */

function Tree({ data, current }: { data: Institution; current: string | null }) {
  const [query, setQuery] = useState("");
  const units = data.units;
  const known = new Set(units.map((unit) => unit.id));
  const childrenOf = (id: string, filter: (unit: InstUnit) => boolean = () => true) =>
    units.filter((unit) => unit.parentId === id && filter(unit)).sort(byOrder);
  const isRoot = (unit: InstUnit) => !unit.parentId || !known.has(unit.parentId);

  const vices = units.filter((unit) => unit.kind === "vicerrectoria" && isRoot(unit)).sort(byOrder);
  const facultiesOf = (vice: InstUnit) => units.filter((unit) => unit.kind === "facultad" && isRoot(unit) && unit.reportsTo === vice.id).sort(byOrder);
  const looseAcademic = units
    .filter(
      (unit) =>
        isRoot(unit) &&
        (unit.kind === "programa" || (unit.kind === "facultad" && !vices.some((vice) => vice.id === unit.reportsTo))),
    )
    .sort(byOrder);
  const vicesWithOffices = units
    .filter((unit) => unit.kind === "vicerrectoria" && childrenOf(unit.id, isOffice).length > 0)
    .sort(byOrder);
  const rootOffices = units.filter((unit) => isOffice(unit) && isRoot(unit)).sort(byOrder);

  const count = (kinds: UnitKind[]) => units.filter((unit) => kinds.includes(unit.kind)).length;
  const incomplete = units.filter((unit) => programGaps(unit, data).length > 0).length;

  const needle = normalize(query);
  const matches = needle
    ? units.filter((unit) => normalize(`${unit.name} ${unit.code} ${unit.sniesCode ?? ""}`).includes(needle)).sort(byName)
    : [];

  /** Una unidad con lo que cuelga de ella. En la rama académica no se pintan oficinas. */
  const node = (unit: InstUnit, depth: number, filter: (unit: InstUnit) => boolean): JSX.Element => {
    const children = childrenOf(unit.id, filter);
    return (
      <li key={unit.id}>
        <UnitLink unit={unit} data={data} current={current} />
        {children.length > 0 && (
          <ul className="inst-tree__list" data-depth={Math.min(depth + 1, 3)}>
            {children.map((child) => node(child, depth + 1, filter))}
          </ul>
        )}
      </li>
    );
  };
  const academic = (unit: InstUnit) => !isOffice(unit);
  const anything = () => true;

  return (
    <nav className="inst-tree" aria-label="Árbol de la estructura institucional">
      <label className="inst-search">
        <Icon name="search" size={15} />
        <span className="sr-only">Buscar una unidad</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, código o SNIES…" />
      </label>

      {needle ? (
        matches.length === 0 ? (
          <p className="inst-tree__empty">Nada coincide con «{query}».</p>
        ) : (
          <ul className="inst-tree__list">
            {matches.map((unit) => (
              <li key={unit.id}>
                <UnitLink unit={unit} data={data} current={current} showKind />
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <section className="inst-branch" aria-labelledby="rama-academica">
            <header className="inst-branch__head">
              <h2 id="rama-academica">Académica</h2>
              <p>
                {count(["vicerrectoria"])} vicerrectorías · {count(["facultad"])} facultades · {count(["programa"])} programas
                {incomplete > 0 && (
                  <>
                    {" · "}
                    <span className="inst-gap">{incomplete} por completar</span>
                  </>
                )}
              </p>
              <div className="inst-branch__add" aria-label="Crear en la rama académica">
                <Link to={newPath("vicerrectoria")}>
                  <Icon name="plus" size={13} /> Vicerrectoría
                </Link>
                <Link to={newPath("facultad")}>
                  <Icon name="plus" size={13} /> Facultad
                </Link>
                <Link to={newPath("programa")}>
                  <Icon name="plus" size={13} /> Programa
                </Link>
              </div>
            </header>
            {vices.length === 0 && looseAcademic.length === 0 ? (
              <p className="inst-tree__empty">Todavía no hay vicerrectorías ni facultades.</p>
            ) : (
              <ul className="inst-tree__list">
                {vices.map((vice) => {
                  const faculties = facultiesOf(vice);
                  const children = childrenOf(vice.id, academic);
                  return (
                    <li key={vice.id}>
                      <UnitLink unit={vice} data={data} current={current} />
                      {children.length > 0 && (
                        <ul className="inst-tree__list" data-depth="1">
                          {children.map((child) => node(child, 1, academic))}
                        </ul>
                      )}
                      {faculties.length > 0 && (
                        <ul className="inst-tree__list" data-org="true" aria-label={`Facultades que dependen de ${vice.name}`}>
                          {faculties.map((faculty) => node(faculty, 1, anything))}
                        </ul>
                      )}
                    </li>
                  );
                })}
                {looseAcademic.length > 0 && (
                  <li className="inst-tree__loose">
                    <span className="inst-tree__label">{vices.length > 0 ? "Sin vicerrectoría" : "Facultades"}</span>
                    <ul className="inst-tree__list">{looseAcademic.map((unit) => node(unit, 0, anything))}</ul>
                  </li>
                )}
              </ul>
            )}
          </section>

          <section className="inst-branch" aria-labelledby="rama-administrativa">
            <header className="inst-branch__head">
              <h2 id="rama-administrativa">Administrativa</h2>
              <p>{count(["oficina", "otra"])} oficinas y dependencias</p>
              <div className="inst-branch__add" aria-label="Crear en la rama administrativa">
                <Link to={newPath("oficina")}>
                  <Icon name="plus" size={13} /> Oficina o dependencia
                </Link>
              </div>
            </header>
            {vicesWithOffices.length === 0 && rootOffices.length === 0 ? (
              <p className="inst-tree__empty">Todavía no hay oficinas ni dependencias.</p>
            ) : (
              <ul className="inst-tree__list">
                {vicesWithOffices.map((vice) => (
                  <li key={vice.id}>
                    <UnitLink unit={vice} data={data} current={current} />
                    <ul className="inst-tree__list" data-depth="1">
                      {childrenOf(vice.id, isOffice).map((office) => node(office, 1, anything))}
                    </ul>
                  </li>
                ))}
                {rootOffices.map((office) => node(office, 0, anything))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="inst-tree__foot">
        La línea continua es la herencia: lo que alguien es en una unidad, lo es en lo que cuelga de ella. La punteada es
        el organigrama y no da acceso a nada.
      </p>
    </nav>
  );
}

function UnitLink({
  unit,
  data,
  current,
  showKind = false,
}: {
  unit: InstUnit;
  data: Institution;
  current: string | null;
  showKind?: boolean;
}) {
  const gaps = programGaps(unit, data);
  const people = data.members.filter((member) => member.unitId === unit.id).length;
  const detail =
    unit.kind === "vicerrectoria"
      ? unit.substantiveFunction
        ? `Valida ${FUNCTION_LABEL[unit.substantiveFunction].toLowerCase()}`
        : "Sin función sustantiva"
      : unit.kind === "programa"
        ? [unit.degreeLevel ? DEGREE_LABEL[unit.degreeLevel] : null, unit.sniesCode ? `SNIES ${unit.sniesCode}` : null]
            .filter(Boolean)
            .join(" · ")
        : unit.kind === "otra"
          ? KIND_LABEL.otra.label
          : "";
  const parts = [showKind ? KIND_LABEL[unit.kind].label : "", detail, people > 0 ? `${people} ${people === 1 ? "persona" : "personas"}` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      className="inst-tree__unit"
      to={`${BASE}/${unit.slug}`}
      aria-current={unit.id === current ? "page" : undefined}
      data-kind={unit.kind}
    >
      <span className="inst-tree__code">{unit.code}</span>
      <span className="inst-tree__name">{unit.name}</span>
      {(parts || gaps.length > 0) && (
        <span className="inst-tree__meta">
          {parts}
          {gaps.length > 0 && (
            <span className="inst-gap">
              {parts ? " · " : ""}
              {gaps.join(", ")}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

/* --- Sin unidad elegida ---------------------------------------------------------------- */

function Overview({ data }: { data: Institution }) {
  const incomplete = data.units.filter((unit) => programGaps(unit, data).length > 0).sort(byOrder);
  const vices = data.units.filter((unit) => unit.kind === "vicerrectoria");
  const missingFunctions = (["investigacion", "ensenanza", "extension"] as SubstantiveFunction[]).filter(
    (fn) => !vices.some((vice) => vice.substantiveFunction === fn),
  );
  const empty = data.units.filter((unit) => !data.members.some((member) => member.unitId === unit.id));
  return (
    <section className="inst-sheet" aria-labelledby="inst-overview">
      <h2 id="inst-overview">Qué falta para que Impacto funcione</h2>
      <p className="inst-lead">
        Cada programa necesita su SNIES, su nivel y las sedes donde se ofrece; cada función sustantiva, una vicerrectoría
        que la valide; y cada unidad, las personas que trabajan en ella. Elija una unidad en el árbol para completarla, o
        cargue la estructura entera desde Excel.
      </p>
      {missingFunctions.length === 0 && incomplete.length === 0 ? (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} /> Los programas y las vicerrectorías están completos para Impacto.
        </p>
      ) : (
        <ul className="inst-todo">
          {missingFunctions.map((fn) => (
            <li key={fn}>
              <Icon name="alert" size={15} />
              <span>
                Ninguna vicerrectoría valida <strong>{FUNCTION_LABEL[fn].toLowerCase()}</strong>.
              </span>
            </li>
          ))}
          {incomplete.slice(0, 12).map((unit) => (
            <li key={unit.id}>
              <Icon name="alert" size={15} />
              <span>
                <Link to={`${BASE}/${unit.slug}`}>{unit.name}</Link>: {programGaps(unit, data).join(", ")}.
              </span>
            </li>
          ))}
          {incomplete.length > 12 && <li className="inst-todo__more">y {incomplete.length - 12} programas más.</li>}
        </ul>
      )}
      {data.units.length > 0 && empty.length > 0 && (
        <p className="inst-hint">
          {empty.length === data.units.length
            ? "Ninguna unidad tiene personas todavía."
            : `${empty.length} ${empty.length === 1 ? "unidad no tiene" : "unidades no tienen"} personas asignadas.`}
        </p>
      )}
    </section>
  );
}

/* --- La ficha --------------------------------------------------------------------------- */

interface Draft {
  kind: UnitKind;
  name: string;
  code: string;
  description: string;
  parentId: string;
  sniesCode: string;
  degreeLevel: DegreeLevel | "";
  modality: Modality | "";
  substantiveFunction: SubstantiveFunction | "";
  reportsTo: string;
  campuses: string[];
}

function draftOf(unit: InstUnit | null, data: Institution, defaults: { kind?: UnitKind; parent?: InstUnit }): Draft {
  const kind = unit?.kind ?? defaults.kind ?? "programa";
  const activeCampuses = unit
    ? data.offer
        .filter((item) => item.programId === unit.id && item.active)
        .map((item) => data.campuses.find((campus) => campus.id === item.campusId)?.slug ?? "")
        .filter(Boolean)
    : [];
  // Un padre sugerido: el de la unidad desde la que se pidió crear.
  const parent = defaults.parent;
  return {
    kind,
    name: unit?.name ?? "",
    code: unit?.code ?? "",
    description: unit?.description ?? "",
    // Una facultad no cuelga de su vicerrectoría: depende de ella (reports_to).
    parentId: unit?.parentId ?? (parent && !(kind === "facultad" && parent.kind === "vicerrectoria") ? parent.id : ""),
    sniesCode: unit?.sniesCode ?? "",
    degreeLevel: unit?.degreeLevel ?? "",
    modality: unit?.modality ?? "",
    substantiveFunction: unit?.substantiveFunction ?? "",
    reportsTo: unit?.reportsTo ?? (kind === "facultad" && parent?.kind === "vicerrectoria" ? parent.id : ""),
    campuses: activeCampuses,
  };
}

/** Unidades bajo `id` (incluida), para no ofrecer como padre a un descendiente. */
function subtree(units: InstUnit[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const unit of units) {
      if (unit.parentId && out.has(unit.parentId) && !out.has(unit.id)) {
        out.add(unit.id);
        grew = true;
      }
    }
  }
  return out;
}

function UnitSheet({ unit, data }: { unit: InstUnit | null; data: Institution }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const save = useSaveUnit();
  const remove = useDeleteUnit();
  const access = useAccessRoles();
  const requestedKind = params.get("clase") as UnitKind | null;
  const requestedParent = data.units.find((item) => item.slug === params.get("padre"));
  const [draft, setDraft] = useState<Draft>(() =>
    draftOf(unit, data, {
      kind: requestedKind && KINDS.includes(requestedKind) ? requestedKind : undefined,
      parent: requestedParent,
    }),
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const units = data.units;
  const faculties = units.filter((item) => item.kind === "facultad").sort(byName);
  const vices = units.filter((item) => item.kind === "vicerrectoria").sort(byOrder);
  const blocked = unit ? subtree(units, unit.id) : new Set<string>();
  // Una oficina depende de una vicerrectoría o de otra oficina.
  const officeParents = units
    .filter((item) => !blocked.has(item.id) && (item.kind === "vicerrectoria" || isOffice(item)))
    .sort((a, b) => (a.kind === b.kind ? byName(a, b) : a.kind === "vicerrectoria" ? -1 : 1));
  const children = unit ? units.filter((item) => item.parentId === unit.id) : [];
  const members = unit ? data.members.filter((member) => member.unitId === unit.id) : [];

  const isProgram = draft.kind === "programa";
  const office = draft.kind === "oficina" || draft.kind === "otra";
  const sameFunction =
    draft.kind === "vicerrectoria" && draft.substantiveFunction
      ? vices.find((vice) => vice.id !== unit?.id && vice.substantiveFunction === draft.substantiveFunction)
      : undefined;
  const inactiveBefore = unit
    ? data.offer.filter((item) => item.programId === unit.id && !item.active).map((item) => item.campusId)
    : [];
  const parentUnit = units.find((item) => item.id === (unit ? unit.parentId : draft.parentId));
  const reportsUnit = units.find((item) => item.id === (unit?.kind === "facultad" ? unit.reportsTo : parentUnit?.reportsTo ?? ""));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!draft.name.trim() || !draft.code.trim()) {
      setError("La unidad necesita nombre y código.");
      return;
    }
    if (isProgram && !draft.parentId) {
      setError("Un programa pertenece a una facultad: elíjala.");
      return;
    }
    if (isProgram && (!draft.degreeLevel || !draft.modality)) {
      setError("Un programa necesita nivel de formación y modalidad: de ellos depende qué indicadores le aplican.");
      return;
    }
    if (draft.sniesCode.trim() && !/^\d+$/.test(draft.sniesCode.trim())) {
      setError("El SNIES son solo dígitos.");
      return;
    }
    const parentId = isProgram || office ? draft.parentId || null : (unit?.parentId ?? null);
    const siblings = units.filter((item) => (item.parentId ?? null) === parentId);
    const payload: UnitPayload = {
      ...(unit ? { id: unit.id } : {}),
      kind: draft.kind,
      name: draft.name.trim(),
      code: draft.code.trim(),
      description: draft.description.trim(),
      parent_id: parentId,
      slug: unit?.slug ?? freeSlug(draft.name, units.map((item) => item.slug)),
      position: unit?.position ?? siblings.reduce((max, item) => Math.max(max, item.position), 0) + 1,
      snies_code: isProgram ? draft.sniesCode.trim() || null : null,
      degree_level: isProgram ? draft.degreeLevel || null : null,
      modality: isProgram ? draft.modality || null : null,
      substantive_function: draft.kind === "vicerrectoria" ? draft.substantiveFunction || null : null,
      reports_to: draft.kind === "facultad" ? draft.reportsTo || null : null,
    };
    try {
      await save.mutateAsync({ unit: payload, campuses: isProgram ? draft.campuses : null });
      if (unit) setNotice("Cambios guardados.");
      else navigate(`${BASE}/${payload.slug}`);
    } catch (saveError) {
      setError(errorText(saveError, "No se pudo guardar la unidad."));
    }
  }

  async function confirmRemove() {
    if (!unit) return;
    setError("");
    try {
      await remove.mutateAsync(unit.id);
      setConfirmDelete(false);
      navigate(BASE);
    } catch (deleteError) {
      setConfirmDelete(false);
      setError(errorText(deleteError, "No se pudo borrar la unidad."));
    }
  }

  const deleteBlock =
    children.length > 0
      ? `Tiene ${children.length} ${children.length === 1 ? "unidad" : "unidades"} debajo.`
      : members.length > 0
        ? `Tiene ${members.length} ${members.length === 1 ? "persona asignada" : "personas asignadas"}.`
        : "";

  const below: { kind: UnitKind; label: string } | null = !unit
    ? null
    : unit.kind === "facultad"
      ? { kind: "programa", label: "Programa en esta facultad" }
      : unit.kind === "vicerrectoria" || office
        ? { kind: "oficina", label: "Dependencia debajo" }
        : null;

  return (
    <section className="inst-sheet" aria-labelledby="inst-sheet-title">
      <header className="inst-sheet__head">
        <div>
          <h2 id="inst-sheet-title">{unit ? unit.name : `Nueva ${KIND_LABEL[draft.kind].label.toLowerCase()}`}</h2>
          {unit && (
            <p className="inst-sheet__path">
              {KIND_LABEL[unit.kind].label} · {unit.code}
              {parentUnit && (
                <>
                  {" · "}
                  <Link to={`${BASE}/${parentUnit.slug}`}>{parentUnit.name}</Link>
                </>
              )}
              {reportsUnit && (
                <>
                  {" · "}
                  <Link to={`${BASE}/${reportsUnit.slug}`}>{reportsUnit.name}</Link> (organigrama)
                </>
              )}
            </p>
          )}
        </div>
        {unit && below && (
          <Link className="button-ghost" to={newPath(below.kind, unit)}>
            <Icon name="plus" size={15} /> {below.label}
          </Link>
        )}
      </header>

      {notice && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} /> {notice}
        </p>
      )}
      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <form className="inst-form" onSubmit={submit} noValidate>
        {!unit && (
          <fieldset className="admin-field inst-kinds">
            <legend>Clase de unidad</legend>
            <div className="inst-kinds__options">
              {KINDS.map((kind) => (
                <label key={kind} className="inst-kind">
                  <input type="radio" name="clase" checked={draft.kind === kind} onChange={() => set("kind", kind)} />
                  <span>{KIND_LABEL[kind].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="inst-grid">
          <label className="admin-field inst-grid__wide">
            <span>Nombre</span>
            <input
              required
              autoFocus={!unit}
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder={
                isProgram ? "Ingeniería de Sistemas" : office ? "Dirección de Tecnologías de la Información" : "Facultad de Ingenierías y Tecnologías"
              }
            />
          </label>
          <label className="admin-field">
            <span>Código</span>
            <input
              required
              value={draft.code}
              onChange={(event) => set("code", event.target.value)}
              placeholder={isProgram ? "ISI" : office ? "TIC" : "FIT"}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>

          {isProgram && (
            <>
              <label className="admin-field">
                <span>Código SNIES</span>
                <input inputMode="numeric" value={draft.sniesCode} onChange={(event) => set("sniesCode", event.target.value)} placeholder="Solo dígitos" />
              </label>
              <label className="admin-field inst-grid__wide">
                <span>Facultad</span>
                <select value={draft.parentId} onChange={(event) => set("parentId", event.target.value)}>
                  <option value="">Elija la facultad…</option>
                  {faculties.map((faculty) => (
                    <option key={faculty.id} value={faculty.id}>
                      {faculty.name} ({faculty.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>Nivel de formación</span>
                <select value={draft.degreeLevel} onChange={(event) => set("degreeLevel", event.target.value as DegreeLevel | "")}>
                  <option value="">Elija…</option>
                  {(Object.keys(DEGREE_LABEL) as DegreeLevel[]).map((level) => (
                    <option key={level} value={level}>
                      {DEGREE_LABEL[level]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>Modalidad</span>
                <select value={draft.modality} onChange={(event) => set("modality", event.target.value as Modality | "")}>
                  <option value="">Elija…</option>
                  {(Object.keys(MODALITY_LABEL) as Modality[]).map((modality) => (
                    <option key={modality} value={modality}>
                      {MODALITY_LABEL[modality]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {draft.kind === "vicerrectoria" && (
            <label className="admin-field inst-grid__wide">
              <span>Función sustantiva que valida en Impacto</span>
              <select
                value={draft.substantiveFunction}
                onChange={(event) => set("substantiveFunction", event.target.value as SubstantiveFunction | "")}
              >
                <option value="">Ninguna (vicerrectoría administrativa u otra)</option>
                {(Object.keys(FUNCTION_LABEL) as SubstantiveFunction[]).map((fn) => (
                  <option key={fn} value={fn}>
                    {FUNCTION_LABEL[fn]}
                  </option>
                ))}
              </select>
              <small>Quien tenga el rol de Vicerrectoría aquí valida los indicadores de esta función, de todas las facultades.</small>
              {sameFunction && (
                <small className="users-warning">
                  {sameFunction.name} también valida {FUNCTION_LABEL[sameFunction.substantiveFunction!].toLowerCase()}: las dos
                  verían los mismos registros.
                </small>
              )}
            </label>
          )}

          {draft.kind === "facultad" && (
            <label className="admin-field inst-grid__wide">
              <span>Vicerrectoría de la que depende</span>
              <select value={draft.reportsTo} onChange={(event) => set("reportsTo", event.target.value)}>
                <option value="">Ninguna</option>
                {vices.map((vice) => (
                  <option key={vice.id} value={vice.id}>
                    {vice.name}
                  </option>
                ))}
              </select>
              <small>
                Es el organigrama y nada más: no le da a la vicerrectoría acceso a los datos de la facultad. En Impacto la
                vicerrectoría valida por función sustantiva, no por dependencia.
              </small>
            </label>
          )}

          {office && (
            <label className="admin-field inst-grid__wide">
              <span>Depende de</span>
              <select value={draft.parentId} onChange={(event) => set("parentId", event.target.value)}>
                <option value="">Nadie: es de primer nivel</option>
                {officeParents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({KIND_LABEL[item.kind].label})
                  </option>
                ))}
              </select>
              <small>Una vicerrectoría u otra oficina. Aquí sí hay herencia: quien trabaja arriba ve también esta dependencia.</small>
            </label>
          )}

          <label className="admin-field inst-grid__wide">
            <span>Descripción</span>
            <textarea
              rows={2}
              value={draft.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Opcional. Aparece en Mis Tableros."
            />
          </label>
        </div>

        {isProgram && (
          <fieldset className="admin-field inst-campuses">
            <legend>Sedes donde se ofrece</legend>
            <small>Una sede que se desmarca queda inactiva: no se borra, porque los periodos cerrados la citan.</small>
            {data.campuses.length === 0 ? (
              <small>No hay sedes registradas.</small>
            ) : (
              <div className="inst-campuses__list">
                {data.campuses.map((campus) => {
                  const checked = draft.campuses.includes(campus.slug);
                  const wasOffered = inactiveBefore.includes(campus.id);
                  return (
                    <label key={campus.id} className="inst-campus" data-on={checked || undefined}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          set("campuses", checked ? draft.campuses.filter((slug) => slug !== campus.slug) : [...draft.campuses, campus.slug])
                        }
                      />
                      <span>
                        {campus.name}
                        <small>{checked ? "Activa" : wasOffered ? "Inactiva · se ofrecía antes" : "No se ofrece"}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>
        )}

        <div className="inst-form__actions">
          <button className="button-primary" type="submit" disabled={save.isPending || !data.ready}>
            {save.isPending ? "Guardando…" : unit ? "Guardar cambios" : "Crear unidad"}
          </button>
          <Link className="button-ghost" to={BASE}>
            {unit ? "Cerrar la ficha" : "Cancelar"}
          </Link>
          {unit && (
            <button
              type="button"
              className="button-ghost inst-delete"
              data-tone="danger"
              disabled={Boolean(deleteBlock) || remove.isPending}
              title={deleteBlock ? `${deleteBlock} No se puede borrar.` : undefined}
              onClick={() => setConfirmDelete(true)}
            >
              Borrar unidad
            </button>
          )}
        </div>
        {unit && deleteBlock && <p className="inst-hint">Para borrarla: {deleteBlock.toLowerCase()} Déjela vacía primero.</p>}
      </form>

      {unit && <People unit={unit} members={members} roles={access.data?.roles ?? []} ready={data.ready} />}

      {confirmDelete && unit && (
        <Modal
          title={`Borrar ${unit.name}`}
          description="La unidad desaparece del árbol, de Impacto y de Mis Tableros. Si tiene registros de Impacto, la base no dejará borrarla."
          onClose={() => setConfirmDelete(false)}
        >
          <div className="modal-actions">
            <button type="button" className="button-ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
            <button type="button" className="button-danger" disabled={remove.isPending} onClick={() => void confirmRemove()}>
              {remove.isPending ? "Borrando…" : "Borrar unidad"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/* --- Personas de la unidad ------------------------------------------------------------ */

function People({ unit, members, roles, ready }: { unit: InstUnit; members: InstMember[]; roles: AccessRole[]; ready: boolean }) {
  const profiles = useProfiles();
  const saveMember = useSaveMembership();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const unitRoles = roles.filter((role) => role.scope === "unidad");
  const roleName = new Map(roles.map((role) => [role.id, role.name]));
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, "es"));

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <section className="inst-people" aria-labelledby="inst-people-title">
      <div className="inst-people__head">
        <div>
          <h3 id="inst-people-title">Personas de la unidad</h3>
          <p className="inst-hint">
            La función dice qué hace en la unidad y en lo que cuelga de ella; el rol de Impacto, qué acciones tiene en el
            reporte. El cargo es solo un nombre.
          </p>
        </div>
        {!adding && (
          <button type="button" className="button-secondary" onClick={() => setAdding(true)} disabled={!ready}>
            <Icon name="plus" size={15} /> Añadir persona
          </button>
        )}
      </div>

      {notice && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} /> {notice}
        </p>
      )}
      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      {adding && (
        <AddPerson
          unit={unit}
          members={members}
          profiles={profiles.data ?? []}
          loading={profiles.isPending}
          unitRoles={unitRoles}
          pending={saveMember.isPending}
          onCancel={() => setAdding(false)}
          onAdd={async (input, who) => {
            setError("");
            try {
              await saveMember.mutateAsync(input);
              setAdding(false);
              setNotice(`${who} quedó en ${unit.name}.`);
            } catch (addError) {
              setError(errorText(addError, "No se pudo añadir a la persona."));
            }
          }}
        />
      )}

      {sorted.length === 0 ? (
        !adding && <p className="inst-hint">Nadie trabaja todavía en esta unidad.</p>
      ) : (
        <div className="table-scroll">
          <table className="inst-people__table">
            <caption className="sr-only">Personas de {unit.name}, con su cargo, su función y su rol de Impacto</caption>
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Cargo</th>
                <th scope="col">Función en la unidad</th>
                <th scope="col">Rol de Impacto</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((member) => (
                <MemberRow
                  key={`${member.id}-${member.role}-${member.accessRoleId}-${member.title}`}
                  member={member}
                  unitRoles={unitRoles}
                  roleName={roleName}
                  ready={ready}
                  onSaved={(message) => {
                    setError("");
                    setNotice(message);
                  }}
                  onError={setError}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RoleSelects({
  role,
  accessRoleId,
  unitRoles,
  onRole,
  onAccessRole,
  label,
}: {
  role: UnitRole;
  accessRoleId: string;
  unitRoles: AccessRole[];
  onRole: (role: UnitRole) => void;
  onAccessRole: (id: string) => void;
  label: string;
}) {
  return (
    <>
      <td>
        <select aria-label={`Función en la unidad de ${label}`} value={role} onChange={(event) => onRole(event.target.value as UnitRole)}>
          {BOARD_ROLES.map((option) => (
            <option key={option} value={option}>
              {UNIT_ROLE[option].label}
            </option>
          ))}
        </select>
        <small>{UNIT_ROLE[role].hint}</small>
      </td>
      <td>
        <select aria-label={`Rol de Impacto de ${label}`} value={accessRoleId} onChange={(event) => onAccessRole(event.target.value)}>
          <option value="">Sin rol de Impacto</option>
          {unitRoles.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </td>
    </>
  );
}

function MemberRow({
  member,
  unitRoles,
  roleName,
  ready,
  onSaved,
  onError,
}: {
  member: InstMember;
  unitRoles: AccessRole[];
  roleName: Map<string, string>;
  ready: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const save = useSaveMembership();
  const remove = useRemoveMembership();
  const [title, setTitle] = useState(member.title ?? "");
  const [role, setRole] = useState<UnitRole>(member.role);
  const [accessRoleId, setAccessRoleId] = useState(member.accessRoleId ?? "");
  const [confirming, setConfirming] = useState(false);
  const dirty = title !== (member.title ?? "") || role !== member.role || accessRoleId !== (member.accessRoleId ?? "");
  // Un rol de acceso que ya no es de unidad (o que no se puede leer) se muestra, no se pierde.
  const orphan = member.accessRoleId && !unitRoles.some((option) => option.id === member.accessRoleId);

  async function persist() {
    try {
      await save.mutateAsync({
        profileId: member.profileId,
        unitId: member.unitId,
        role,
        accessRoleId: accessRoleId || null,
        title: title.trim(),
      });
      onSaved(`Se guardó a ${member.name}.`);
    } catch (saveError) {
      onError(errorText(saveError, "No se pudo guardar el cambio."));
    }
  }

  async function drop() {
    try {
      await remove.mutateAsync(member.id);
      onSaved(`${member.name} ya no está en la unidad.`);
    } catch (removeError) {
      setConfirming(false);
      onError(errorText(removeError, "No se pudo quitar a la persona."));
    }
  }

  return (
    <tr data-dirty={dirty || undefined}>
      <th scope="row">
        <strong>{member.name}</strong>
        <small>{member.email}</small>
        <Link className="inst-people__profile" to={`/admin/usuarios?persona=${member.profileId}`}>
          Ver en Usuarios
        </Link>
      </th>
      <td>
        <input
          aria-label={`Cargo de ${member.name}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ej. Director del programa"
        />
      </td>
      <RoleSelects
        role={role}
        accessRoleId={orphan ? "" : accessRoleId}
        unitRoles={unitRoles}
        onRole={setRole}
        onAccessRole={setAccessRoleId}
        label={member.name}
      />
      <td className="inst-people__actions">
        {orphan && accessRoleId === member.accessRoleId && (
          <small className="users-warning">Tiene «{roleName.get(member.accessRoleId!) ?? "otro rol"}», que no es de unidad.</small>
        )}
        {confirming ? (
          <span className="inst-confirm" role="group" aria-label={`¿Quitar a ${member.name}?`}>
            <span>¿Quitar?</span>
            <button type="button" className="button-ghost" data-tone="danger" disabled={remove.isPending} onClick={() => void drop()}>
              Sí, quitar
            </button>
            <button type="button" className="button-ghost" onClick={() => setConfirming(false)}>
              No
            </button>
          </span>
        ) : (
          <>
            {dirty && (
              <button type="button" className="button-primary" disabled={save.isPending || !ready} onClick={() => void persist()}>
                {save.isPending ? "Guardando…" : "Guardar"}
              </button>
            )}
            <button type="button" className="button-ghost" data-tone="danger" disabled={!ready} onClick={() => setConfirming(true)}>
              Quitar
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

interface ProfileOption {
  id: string;
  name: string;
  email: string;
}

function AddPerson({
  unit,
  members,
  profiles,
  loading,
  unitRoles,
  pending,
  onCancel,
  onAdd,
}: {
  unit: InstUnit;
  members: InstMember[];
  profiles: ProfileOption[];
  loading: boolean;
  unitRoles: AccessRole[];
  pending: boolean;
  onCancel: () => void;
  onAdd: (input: { profileId: string; unitId: string; role: UnitRole; accessRoleId: string | null; title: string }, who: string) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ProfileOption | null>(null);
  const [title, setTitle] = useState("");
  const [accessRoleId, setAccessRoleId] = useState("");
  const [role, setRole] = useState<UnitRole>("visor");
  const [roleTouched, setRoleTouched] = useState(false);
  const inUnit = useMemo(() => new Set(members.map((member) => member.profileId)), [members]);
  const needle = normalize(query);
  const options = needle
    ? profiles.filter((person) => !inUnit.has(person.id) && normalize(`${person.name} ${person.email}`).includes(needle)).slice(0, 8)
    : [];

  function chooseAccessRole(id: string) {
    setAccessRoleId(id);
    // La función por defecto sale del rol, mientras no se haya elegido otra.
    if (!roleTouched) setRole((unitRoles.find((option) => option.id === id)?.unit_role as UnitRole | null | undefined) ?? "visor");
  }

  return (
    <div className="inst-add" role="group" aria-label={`Añadir una persona a ${unit.name}`}>
      {!picked ? (
        <>
          <label className="admin-field">
            <span>Buscar entre las personas con cuenta activa</span>
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre o correo…"
            />
          </label>
          {loading ? (
            <p className="inst-hint">Cargando personas…</p>
          ) : needle && options.length === 0 ? (
            <p className="inst-hint">
              Nadie coincide, o ya está en la unidad. Si la persona no tiene cuenta, créela en{" "}
              <Link to="/admin/usuarios">Usuarios y roles</Link>.
            </p>
          ) : (
            options.length > 0 && (
              <ul className="inst-add__results">
                {options.map((person) => (
                  <li key={person.id}>
                    <button type="button" onClick={() => setPicked(person)}>
                      <strong>{person.name}</strong>
                      <small>{person.email}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
          <div className="inst-form__actions">
            <button type="button" className="button-ghost" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <form
          className="inst-add__form"
          onSubmit={(event) => {
            event.preventDefault();
            void onAdd({ profileId: picked.id, unitId: unit.id, role, accessRoleId: accessRoleId || null, title: title.trim() }, picked.name);
          }}
        >
          <p className="inst-add__who">
            <strong>{picked.name}</strong> <small>{picked.email}</small>{" "}
            <button type="button" className="oda-link-button" onClick={() => setPicked(null)}>
              Elegir otra persona
            </button>
          </p>
          <div className="inst-grid">
            <label className="admin-field">
              <span>Cargo</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Coordinadora de calidad" />
            </label>
            <label className="admin-field">
              <span>Rol de Impacto</span>
              <select value={accessRoleId} onChange={(event) => chooseAccessRole(event.target.value)}>
                <option value="">Sin rol de Impacto</option>
                {unitRoles.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              {accessRoleId && <small>{unitRoles.find((option) => option.id === accessRoleId)?.description}</small>}
            </label>
            <fieldset className="admin-field inst-grid__wide inst-roles">
              <legend>Función en la unidad</legend>
              <div className="inst-roles__options">
                {BOARD_ROLES.map((option) => (
                  <label key={option} className="radio-row">
                    <input
                      type="radio"
                      name="funcion"
                      checked={role === option}
                      onChange={() => {
                        setRole(option);
                        setRoleTouched(true);
                      }}
                    />
                    <span>
                      <strong>{UNIT_ROLE[option].label}</strong>
                      <small>{UNIT_ROLE[option].hint}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="inst-form__actions">
            <button type="submit" className="button-primary" disabled={pending}>
              {pending ? "Añadiendo…" : "Añadir a la unidad"}
            </button>
            <button type="button" className="button-ghost" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function errorText(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const advice = (error as Error & { advice?: string }).advice;
  return advice ? `${error.message} ${advice}` : error.message;
}
