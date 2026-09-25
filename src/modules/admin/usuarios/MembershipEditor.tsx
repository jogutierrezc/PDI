/* =============================================================================
   Dónde trabaja una persona: unidad, función, cargo y, en un programa que se
   ofrece en varias sedes, la sede (vacía: todas).

   La función dice qué hace con los datos de la unidad (Gestor, Contribuyente
   o Consulta: el papel de Mis Tableros); el cargo es texto libre para
   reconocerla («Directora del programa»).

   Lo usan el paso 3 del asistente y la ficha de la persona. La lista que se
   ve es la que queda al guardar (admin_set_memberships reemplaza), así que
   también salen las pertenencias que alguien creó desde Mis Tableros.
   ========================================================================== */

import { useMemo } from "react";
import { Icon } from "../../../components/ui/Icon";
import { UNIT_KIND, type UnitKind, type UnitRole } from "../../tableros/model";
import { useProgramOffer, type UnitOption } from "./people-db";
import { BOARD_ROLE_LABEL } from "./role-matrix";

export interface MembershipDraft {
  key: string;
  unitId: string;
  /** Función en la unidad; null = la que ya tenía, o Consulta. */
  boardRole: UnitRole | null;
  /** Cargo, texto libre. */
  title: string;
  /** Sede a la que se limita; null = todas. */
  campusId: string | null;
}

const KIND_ORDER: UnitKind[] = ["vicerrectoria", "facultad", "programa", "oficina", "otra"];

let seq = 0;
export const newDraft = (partial: Partial<MembershipDraft> = {}): MembershipDraft => ({
  key: `m${++seq}`,
  unitId: "",
  boardRole: null,
  title: "",
  campusId: null,
  ...partial,
});

export function MembershipEditor({
  value,
  onChange,
  units,
  disabled = false,
}: {
  value: MembershipDraft[];
  onChange: (next: MembershipDraft[]) => void;
  units: UnitOption[];
  disabled?: boolean;
}) {
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const offer = useProgramOffer().data;
  const campusName = useMemo(() => new Map((offer?.campuses ?? []).map((c) => [c.id, c.name])), [offer]);
  /** Las sedes donde se ofrece un programa; vacío si no es programa o se ofrece en una sola. */
  const campusesOf = (unit: UnitOption | undefined) => {
    if (!unit || unit.kind !== "programa") return [];
    const ids = offer?.byProgram.get(unit.id) ?? [];
    return ids.length > 1 ? ids : [];
  };
  const grouped = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({
        kind,
        items: units.filter((unit) => unit.kind === kind).sort((a, b) => a.name.localeCompare(b.name, "es")),
      })).filter((group) => group.items.length > 0),
    [units],
  );
  const taken = new Set(value.map((row) => row.unitId));

  const patch = (key: string, change: Partial<MembershipDraft>) =>
    onChange(value.map((row) => (row.key === key ? { ...row, ...change } : row)));

  return (
    <div className="us-members">
      {value.length === 0 && (
        <p className="us-members__empty">Todavía no trabaja en ninguna unidad. Sin unidad entra con su rol de toda la intranet.</p>
      )}
      {value.map((row, index) => {
        const unit = byId.get(row.unitId);
        const duplicated = row.unitId && value.findIndex((other) => other.unitId === row.unitId) !== index;
        const campuses = campusesOf(unit);
        return (
          <div key={row.key} className="us-member">
            <label className="admin-field">
              <span>Unidad</span>
              <select
                value={row.unitId}
                disabled={disabled}
                onChange={(event) => patch(row.key, { unitId: event.target.value, campusId: null })}
              >
                <option value="">Elija una unidad…</option>
                {grouped.map((group) => (
                  <optgroup key={group.kind} label={UNIT_KIND[group.kind].plural}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id} disabled={taken.has(item.id) && item.id !== row.unitId}>
                        {item.name} · {item.code}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>Función</span>
              <select
                value={row.boardRole ?? ""}
                disabled={disabled}
                onChange={(event) => patch(row.key, { boardRole: (event.target.value || null) as UnitRole | null })}
              >
                <option value="">Consulta</option>
                {(Object.keys(BOARD_ROLE_LABEL) as UnitRole[])
                  .filter((board) => board !== "visor")
                  .map((board) => (
                    <option key={board} value={board}>
                      {BOARD_ROLE_LABEL[board].label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Cargo</span>
              <input
                value={row.title}
                disabled={disabled}
                placeholder="Ej. Director del programa"
                onChange={(event) => patch(row.key, { title: event.target.value })}
              />
            </label>
            {campuses.length > 0 && (
              <label className="admin-field">
                <span>Sede</span>
                <select
                  value={row.campusId ?? ""}
                  disabled={disabled}
                  onChange={(event) => patch(row.key, { campusId: event.target.value || null })}
                >
                  <option value="">Todas las sedes</option>
                  {campuses.map((id) => (
                    <option key={id} value={id}>
                      {campusName.get(id) ?? "Sede"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="us-icon-button"
              disabled={disabled}
              aria-label={`Quitar ${unit ? unit.name : "esta asignación"}`}
              onClick={() => onChange(value.filter((other) => other.key !== row.key))}
            >
              <Icon name="close" size={15} />
            </button>
            {(duplicated || row.boardRole) && (
              <div className="us-member__notes">
                {row.boardRole && <small>{BOARD_ROLE_LABEL[row.boardRole].hint}</small>}
                {duplicated && (
                  <small className="us-raised">
                    <Icon name="alert" size={13} /> Esta unidad ya está en la lista: en cada unidad va una sola función.
                  </small>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="button-ghost us-members__add"
        disabled={disabled}
        onClick={() => onChange([...value, newDraft()])}
      >
        <Icon name="plus" size={15} /> Añadir unidad
      </button>
    </div>
  );
}

/** ¿Se puede guardar? Devuelve el primer problema, o null. */
export function membershipProblem(value: MembershipDraft[]): string | null {
  if (value.some((row) => !row.unitId)) return "Elija la unidad de cada fila, o quite las que sobran.";
  if (new Set(value.map((row) => row.unitId)).size !== value.length) return "Hay una unidad repetida.";
  return null;
}

export const toInput = (value: MembershipDraft[]) =>
  value.map((row) => ({
    unit_id: row.unitId,
    role: row.boardRole,
    title: row.title.trim() || null,
    campus_id: row.campusId,
  }));
