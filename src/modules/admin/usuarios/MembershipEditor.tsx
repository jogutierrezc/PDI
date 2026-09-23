/* =============================================================================
   Dónde trabaja una persona: unidad, función, cargo y rol de Impacto.

   La función dice qué hace con los datos de la unidad (Gestor, Contribuyente
   o Consulta: el papel de Mis Tableros); el cargo es texto libre para
   reconocerla («Directora del programa»); el rol de Impacto, opcional, da las
   acciones de reporte y revisión.

   Lo usan el paso 3 del asistente y la ficha de la persona. La lista que se
   ve es la que queda al guardar (admin_set_memberships reemplaza), así que
   también salen las pertenencias que alguien creó desde Mis Tableros sin rol
   de Impacto: se muestran «Sin rol de Impacto» y no se pierden.
   ========================================================================== */

import { useMemo } from "react";
import { Icon } from "../../../components/ui/Icon";
import type { AccessRole } from "../../../types/database";
import { UNIT_KIND, type UnitKind, type UnitRole } from "../../tableros/model";
import type { UnitOption } from "./people-db";
import { BOARD_ROLE_LABEL } from "./role-matrix";

export interface MembershipDraft {
  key: string;
  unitId: string;
  accessRoleId: string | null;
  /** Función en la unidad; null = la que diga el rol (o la que ya tenía). */
  boardRole: UnitRole | null;
  /** Cargo, texto libre. */
  title: string;
}

const KIND_ORDER: UnitKind[] = ["vicerrectoria", "facultad", "programa", "oficina", "otra"];

/** Qué clase de unidad espera cada acción de Impacto. */
const EXPECTS: Record<string, { kinds: UnitKind[]; text: string }> = {
  "impacto.capturar": { kinds: ["programa"], text: "capturar se hace en un programa" },
  "impacto.enviar": { kinds: ["programa"], text: "enviar se hace en un programa" },
  "impacto.aprobar": { kinds: ["facultad"], text: "aprobar se da en una facultad y alcanza a sus programas" },
  "impacto.validar": { kinds: ["vicerrectoria"], text: "validar se da en una vicerrectoría con función sustantiva" },
};

/** Avisos de una pareja unidad + rol que la base aceptaría pero no servirían. */
export function membershipWarnings(unit: UnitOption | undefined, role: AccessRole | undefined): string[] {
  if (!unit || !role) return [];
  return (role.capabilities ?? [])
    .filter((cap) => EXPECTS[cap] && !EXPECTS[cap].kinds.includes(unit.kind))
    .map((cap) => `En ${UNIT_KIND[unit.kind].label.toLowerCase()} no sirve: ${EXPECTS[cap].text}.`);
}

let seq = 0;
export const newDraft = (partial: Partial<MembershipDraft> = {}): MembershipDraft => ({
  key: `m${++seq}`,
  unitId: "",
  accessRoleId: null,
  boardRole: null,
  title: "",
  ...partial,
});

export function MembershipEditor({
  value,
  onChange,
  units,
  roles,
  disabled = false,
}: {
  value: MembershipDraft[];
  onChange: (next: MembershipDraft[]) => void;
  units: UnitOption[];
  roles: AccessRole[];
  disabled?: boolean;
}) {
  const unitRoles = roles.filter((role) => role.scope === "unidad");
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
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
        <p className="us-members__empty">
          Todavía no trabaja en ninguna unidad. Sin unidad no reporta ni revisa en Impacto, pero sí entra con su rol
          de toda la intranet.
        </p>
      )}
      {value.map((row, index) => {
        const unit = byId.get(row.unitId);
        const role = unitRoles.find((item) => item.id === row.accessRoleId);
        const warnings = membershipWarnings(unit, role);
        const duplicated = row.unitId && value.findIndex((other) => other.unitId === row.unitId) !== index;
        return (
          <div key={row.key} className="us-member">
            <label className="admin-field">
              <span>Unidad</span>
              <select
                value={row.unitId}
                disabled={disabled}
                onChange={(event) => patch(row.key, { unitId: event.target.value })}
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
                <option value="">
                  {role?.unit_role ? `Según el rol (${BOARD_ROLE_LABEL[role.unit_role].label})` : "Consulta"}
                </option>
                {(Object.keys(BOARD_ROLE_LABEL) as UnitRole[]).map((board) => (
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
            <label className="admin-field">
              <span>Rol de Impacto</span>
              <select
                value={row.accessRoleId ?? ""}
                disabled={disabled}
                onChange={(event) => patch(row.key, { accessRoleId: event.target.value || null })}
              >
                <option value="">Sin rol de Impacto</option>
                {unitRoles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="us-icon-button"
              disabled={disabled}
              aria-label={`Quitar ${unit ? unit.name : "esta asignación"}`}
              onClick={() => onChange(value.filter((other) => other.key !== row.key))}
            >
              <Icon name="close" size={15} />
            </button>
            {(warnings.length > 0 || duplicated || role?.description) && (
              <div className="us-member__notes">
                {role?.description && <small>{role.description}</small>}
                {warnings.map((warning) => (
                  <small key={warning} className="us-raised">
                    <Icon name="alert" size={13} /> {warning}
                  </small>
                ))}
                {duplicated && (
                  <small className="us-raised">
                    <Icon name="alert" size={13} /> Esta unidad ya está en la lista: en cada unidad va un solo rol.
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
    access_role_id: row.accessRoleId,
    role: row.boardRole,
    title: row.title.trim() || null,
  }));
