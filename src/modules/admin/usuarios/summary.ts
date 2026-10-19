/* =============================================================================
   Un rol o una persona, en palabras. Lo comparten la lista de roles, la ficha
   de la persona y el asistente.
   ========================================================================== */

import { FriendlyError } from "../../../data/errors";
import type { AccessRole } from "../../../types/database";
import { UNIT_KIND, UNIT_ROLE, type UnitRole } from "../../tableros/model";
import type { UnitOption } from "./people-db";
import { decompile, describe, type Matrix } from "./role-matrix";

export type RoleReports = { access_role_id: string; report_slug: string }[];
export type RoleUnits = { access_role_id: string; unit_id: string }[];

export function roleMatrix(role: AccessRole, reports: RoleReports, units: RoleUnits = [], informeUnits: RoleUnits = []): Matrix {
  return decompile(
    role,
    reports.filter((row) => row.access_role_id === role.id).map((row) => row.report_slug),
    units.filter((row) => row.access_role_id === role.id).map((row) => row.unit_id),
    informeUnits.filter((row) => row.access_role_id === role.id).map((row) => row.unit_id),
  );
}

/** Lo que podrá hacer, en frases: su rol global y cada unidad. */
export function personSummary(
  global: AccessRole | undefined,
  reports: RoleReports,
  rows: { unit: UnitOption | undefined; board?: UnitRole | null; title?: string }[],
  reportNames: Map<string, string> = new Map(),
  roleUnits: RoleUnits = [],
  unitNames: Map<string, string> = new Map(),
  informeUnits: RoleUnits = [],
): string[] {
  const lines = global
    ? describe(roleMatrix(global, reports, roleUnits, informeUnits), reportNames, unitNames)
    : ["Sin rol de toda la intranet: entra con lo de siempre."];
  for (const { unit, board, title } of rows) {
    if (!unit) continue;
    const where = `${unit.name} (${UNIT_KIND[unit.kind].label.toLowerCase()})`;
    const fn = UNIT_ROLE[board ?? "visor"].label.toLowerCase();
    const as = title?.trim() ? `, como ${title.trim()}` : "";
    lines.push(`En ${where}${as}: ${fn} de sus datos.`);
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

/** Lo que falló, para mostrarlo: el mensaje, qué hacer y —si el mensaje es genérico— el texto original de la base. */
export function reason(error: unknown, fallback: string): string {
  if (error instanceof FriendlyError) {
    const parts = [error.message, error.advice].filter(Boolean) as string[];
    if (error.original && error.original !== error.message) parts.push(`Detalle: ${error.original}`);
    return parts.join(" ");
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
