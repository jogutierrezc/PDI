/* =============================================================================
   Carga masiva de usuarios y asignaciones: leer la hoja y decir qué pasaría.

   Una fila por asignación; la misma persona puede ocupar varias filas (una por
   unidad). Columnas:

     Correo · Nombre · Dependencia · Rol global · Unidad (código) ·
     Función en la unidad · Cargo · Rol de Impacto

   La función es Gestor, Contribuyente o Consulta (qué hace con los datos de
   la unidad); el cargo, texto libre; el rol de Impacto, opcional.

   Nada de aquí escribe: devuelve, por persona, si se crea o se actualiza, su
   rol global, sus unidades y los errores con fila y columna. La pantalla
   enseña eso y solo deja aplicar cuando no hay errores. Los nombres de roles y
   los códigos de unidad se comparan sin tildes ni mayúsculas.
   ========================================================================== */

import type { AccessRole, Profile } from "../../../types/database";
import { type UnitRole } from "../../tableros/model";
import type { UnitOption } from "./people-db";

export const USER_COLUMNS = [
  "Correo",
  "Nombre",
  "Dependencia",
  "Rol global",
  "Unidad (código)",
  "Función en la unidad",
  "Cargo",
  "Rol de Impacto",
] as const;
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** Función en la unidad por su nombre en pantalla o en la base. */
const FUNCTIONS: Record<string, UnitRole> = {
  gestor: "jefe",
  jefe: "jefe",
  contribuyente: "editor",
  editor: "editor",
  consulta: "visor",
  visor: "visor",
};

export interface PlannedAssignment {
  line: number;
  unitId: string;
  unitLabel: string;
  accessRoleId: string | null;
  roleLabel: string;
  /** Función en la unidad; null = la del rol de Impacto, o Consulta. */
  board: UnitRole | null;
  title: string;
}

export interface PlannedPerson {
  email: string;
  name: string;
  unit: string;
  existingId: string | null;
  globalRoleId: string | null;
  globalRoleLabel: string;
  assignments: PlannedAssignment[];
  errors: string[];
  lines: number[];
}

export interface UsersPlan {
  people: PlannedPerson[];
  /** Errores de la hoja entera (encabezados, hoja vacía). */
  errors: string[];
  errorCount: number;
}

export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `rows` es la hoja como texto, con los encabezados en la primera fila. La
 * fila 1 de Excel es el encabezado: la primera de datos es la 2.
 */
export function planUsers(
  rows: string[][],
  context: { roles: AccessRole[]; units: UnitOption[]; profiles: Pick<Profile, "id" | "email">[] },
): UsersPlan {
  const [header = [], ...data] = rows;
  const expected = USER_COLUMNS.map(normalize);
  const got = header.map((cell) => normalize(cell ?? ""));
  const missing = USER_COLUMNS.filter((_, i) => got[i] !== expected[i]);
  if (missing.length > 0) {
    return {
      people: [],
      errors: [
        `La hoja no tiene las columnas esperadas (${USER_COLUMNS.join(" · ")}). Descargue la plantilla y copie los datos en ella.`,
      ],
      errorCount: 1,
    };
  }

  const roleByName = new Map<string, AccessRole>();
  for (const role of context.roles) {
    roleByName.set(normalize(role.name), role);
    roleByName.set(normalize(role.key), role);
  }
  const unitByCode = new Map<string, UnitOption>();
  for (const unit of context.units) {
    unitByCode.set(normalize(unit.code), unit);
    unitByCode.set(normalize(unit.slug), unit);
  }
  const profileByEmail = new Map(context.profiles.map((p) => [normalize(p.email ?? ""), p.id]));

  const people = new Map<string, PlannedPerson>();
  data.forEach((raw, index) => {
    const line = index + 2;
    const cell = (i: number) => (raw[i] ?? "").toString().replace(/\s+/g, " ").trim();
    const values = USER_COLUMNS.map((_, i) => cell(i));
    if (values.every((value) => value === "")) return;
    const at = (i: number, text: string) => `Fila ${line}, columna ${LETTERS[i]} (${USER_COLUMNS[i]}): ${text}`;

    const email = values[0].toLowerCase();
    const key = normalize(email) || `sin-correo-${line}`;
    let person = people.get(key);
    if (!person) {
      person = {
        email,
        name: "",
        unit: "",
        existingId: profileByEmail.get(normalize(email)) ?? null,
        globalRoleId: null,
        globalRoleLabel: "",
        assignments: [],
        errors: [],
        lines: [],
      };
      people.set(key, person);
    }
    person.lines.push(line);

    if (!email) person.errors.push(at(0, "falta el correo."));
    else if (!EMAIL.test(email)) person.errors.push(at(0, `«${values[0]}» no es un correo.`));

    if (values[1]) {
      if (person.name && person.name !== values[1]) person.errors.push(at(1, `otra fila de ${email} dice «${person.name}».`));
      else person.name = values[1];
    }
    if (values[2] && !person.unit) person.unit = values[2];

    if (values[3]) {
      const role = roleByName.get(normalize(values[3]));
      if (!role) person.errors.push(at(3, `no existe el rol «${values[3]}».`));
      else if ((role.scope ?? "global") !== "global") {
        person.errors.push(at(3, `«${role.name}» se da en una unidad: va en la columna H.`));
      } else if (person.globalRoleId && person.globalRoleId !== role.id) {
        person.errors.push(at(3, `otra fila de ${email} le da «${person.globalRoleLabel}».`));
      } else {
        person.globalRoleId = role.id;
        person.globalRoleLabel = role.name;
      }
    }

    if (values[4] || values[5] || values[6] || values[7]) {
      const unit = values[4] ? unitByCode.get(normalize(values[4])) : undefined;
      if (!values[4]) person.errors.push(at(4, "falta la unidad."));
      else if (!unit) person.errors.push(at(4, `no existe la unidad «${values[4]}».`));

      let board: UnitRole | null = null;
      if (values[5]) {
        board = FUNCTIONS[normalize(values[5])] ?? null;
        if (!board) person.errors.push(at(5, `«${values[5]}» no es una función: use Gestor, Contribuyente o Consulta.`));
      }

      let accessRoleId: string | null = null;
      let roleLabel = "Sin rol de Impacto";
      if (values[7]) {
        const role = roleByName.get(normalize(values[7]));
        if (!role) person.errors.push(at(7, `no existe el rol «${values[7]}».`));
        else if (role.scope !== "unidad") person.errors.push(at(7, `«${role.name}» es de toda la intranet: va en la columna D.`));
        else {
          accessRoleId = role.id;
          roleLabel = role.name;
          board = board ?? role.unit_role ?? null;
        }
      }
      if (unit) {
        if (person.assignments.some((a) => a.unitId === unit.id)) {
          person.errors.push(at(4, `${email} ya tiene «${unit.code}» en otra fila: en cada unidad va una sola función.`));
        } else {
          person.assignments.push({
            line,
            unitId: unit.id,
            unitLabel: `${unit.name} · ${unit.code}`,
            accessRoleId,
            roleLabel,
            board,
            title: values[6],
          });
        }
      }
    }
  });

  for (const person of people.values()) {
    if (!person.existingId && !person.name && person.email) {
      person.errors.push(`Fila ${person.lines[0]}, columna B (Nombre): ${person.email} es nueva y necesita nombre.`);
    }
    if (!person.existingId && !person.globalRoleId && person.email) {
      person.errors.push(`Fila ${person.lines[0]}, columna D (Rol global): ${person.email} es nueva y necesita un rol global.`);
    }
  }

  const list = [...people.values()];
  const errors = list.length === 0 ? ["La hoja no trae ninguna persona."] : [];
  return { people: list, errors, errorCount: errors.length + list.reduce((n, p) => n + p.errors.length, 0) };
}
