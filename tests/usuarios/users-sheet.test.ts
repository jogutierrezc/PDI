import { describe, expect, it } from "vitest";
import { planUsers, USER_COLUMNS } from "../../src/modules/admin/usuarios/users-sheet";
import type { AccessRole } from "../../src/types/database";

const role = (id: string, name: string, scope: "global" | "unidad"): AccessRole => ({
  id, key: id, name, description: "", base_role: "consulta", screens: [], all_screens: true, all_reports: true,
  is_system: false, position: 0, scope, capabilities: [],
});

const context = {
  roles: [role("consulta", "Consulta", "global"), role("director", "Dirección de programa", "unidad"), role("decano", "Decanatura", "unidad")],
  units: [
    { id: "u-med", parentId: "u-fcs", kind: "programa" as const, code: "MED", name: "Medicina", slug: "medicina" },
    { id: "u-fcs", parentId: null, kind: "facultad" as const, code: "FCS", name: "Ciencias de la Salud", slug: "fcs" },
  ],
  profiles: [{ id: "p-1", email: "ya.existe@udes.edu.co" }],
};

const sheet = (...rows: string[][]) => [[...USER_COLUMNS], ...rows];

describe("carga masiva de usuarios", () => {
  it("agrupa por correo y reconoce roles y unidades sin tildes ni mayúsculas", () => {
    const plan = planUsers(
      sheet(
        ["Ana.Perez@udes.edu.co", "Ana Pérez", "Medicina", "consulta", "med", "gestor", "Directora", "direccion de programa"],
        ["ana.perez@udes.edu.co", "", "", "", "FCS", "", "", "Decanatura"],
      ),
      context,
    );
    expect(plan.errorCount).toBe(0);
    expect(plan.people).toHaveLength(1);
    const [ana] = plan.people;
    expect(ana).toMatchObject({ email: "ana.perez@udes.edu.co", name: "Ana Pérez", existingId: null, globalRoleId: "consulta", lines: [2, 3] });
    expect(ana.assignments.map((a) => [a.unitId, a.accessRoleId, a.board, a.title])).toEqual([
      ["u-med", "director", "jefe", "Directora"],
      ["u-fcs", "decano", null, ""],
    ]);
  });

  it("una persona existente solo necesita sus unidades", () => {
    const plan = planUsers(sheet(["ya.existe@udes.edu.co", "", "", "", "MED", "Contribuyente", "", ""]), context);
    expect(plan.errorCount).toBe(0);
    expect(plan.people[0]).toMatchObject({ existingId: "p-1", globalRoleId: null });
    expect(plan.people[0].assignments[0]).toMatchObject({ unitId: "u-med", accessRoleId: null, roleLabel: "Sin rol de Impacto", board: "editor" });
  });

  it("los errores dicen fila y columna", () => {
    const plan = planUsers(
      sheet(
        ["no-es-correo", "X", "", "Consulta", "", "", "", ""],
        ["nueva@udes.edu.co", "", "", "Decanatura", "NOPE", "jefa", "", "Consulta"],
      ),
      context,
    );
    const all = plan.people.flatMap((p) => p.errors);
    expect(all).toContain("Fila 2, columna A (Correo): «no-es-correo» no es un correo.");
    expect(all).toContain("Fila 3, columna D (Rol global): «Decanatura» se da en una unidad: va en la columna H.");
    expect(all).toContain("Fila 3, columna E (Unidad (código)): no existe la unidad «NOPE».");
    expect(all).toContain("Fila 3, columna H (Rol de Impacto): «Consulta» es de toda la intranet: va en la columna D.");
    expect(all).toContain("Fila 3, columna F (Función en la unidad): «jefa» no es una función: use Gestor, Contribuyente o Consulta.");
    expect(all).toContain("Fila 3, columna B (Nombre): nueva@udes.edu.co es nueva y necesita nombre.");
  });

  it("no deja la misma unidad dos veces ni dos roles globales distintos", () => {
    const extra = { ...context, roles: [...context.roles, role("editor", "Editor", "global")] };
    const plan = planUsers(
      sheet(
        ["a@udes.edu.co", "A", "", "Consulta", "MED", "", "", ""],
        ["a@udes.edu.co", "", "", "Editor", "MED", "", "", "Decanatura"],
      ),
      extra,
    );
    const errors = plan.people[0].errors;
    expect(errors.some((e) => e.includes("otra fila de a@udes.edu.co le da «Consulta»"))).toBe(true);
    expect(errors.some((e) => e.includes("ya tiene «MED» en otra fila"))).toBe(true);
  });

  it("encabezados cambiados rechazan la hoja entera", () => {
    const plan = planUsers([["Email", "Nombre"], ["a@b.co", "A"]], context);
    expect(plan.people).toEqual([]);
    expect(plan.errors[0]).toContain("no tiene las columnas esperadas");
  });

  it("las filas vacías se ignoran", () => {
    const plan = planUsers(sheet(["", "", "", "", "", "", "", ""], ["a@udes.edu.co", "A", "", "Consulta", "", "", "", ""]), context);
    expect(plan.people).toHaveLength(1);
    expect(plan.errorCount).toBe(0);
  });
});
