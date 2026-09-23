/* =============================================================================
   Un rol o una persona, en palabras. Lo comparten la lista de roles, la ficha
   de la persona y el asistente.
   ========================================================================== */

import type { AccessRole } from "../../../types/database";
import { UNIT_KIND, UNIT_ROLE, type UnitRole } from "../../tableros/model";
import type { UnitOption } from "./people-db";
import { decompile, describe, type Matrix } from "./role-matrix";

export type RoleReports = { access_role_id: string; report_slug: string }[];

export function roleMatrix(role: AccessRole, reports: RoleReports): Matrix {
  return decompile(
    role,
    reports.filter((row) => row.access_role_id === role.id).map((row) => row.report_slug),
  );
}

/** Lo que podrá hacer, en frases: su rol global y cada unidad. */
export function personSummary(
  global: AccessRole | undefined,
  reports: RoleReports,
  rows: { unit: UnitOption | undefined; role: AccessRole | undefined; board?: UnitRole | null; title?: string }[],
  reportNames: Map<string, string> = new Map(),
): string[] {
  const lines = global ? describe(roleMatrix(global, reports), reportNames) : ["Sin rol de toda la intranet: entra con lo de siempre."];
  for (const { unit, role, board, title } of rows) {
    if (!unit) continue;
    const where = `${unit.name} (${UNIT_KIND[unit.kind].label.toLowerCase()})`;
    const fn = UNIT_ROLE[board ?? role?.unit_role ?? "visor"].label.toLowerCase();
    const as = title?.trim() ? `, como ${title.trim()}` : "";
    let line = `En ${where}${as}: ${fn} de sus datos`;
    if (role) {
      const what = describe(roleMatrix(role, []))[0].replace(/^En Impacto, en su unidad: /, "").replace(/\.$/, "");
      if (!what.startsWith("En Impacto solo")) line += `; en Impacto (${role.name}) puede ${what}`;
    }
    lines.push(`${line}.`);
  }
  return lines;
}

export const initials = (text: string) =>
  text
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
