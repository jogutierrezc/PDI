import { describe, expect, it } from "vitest";
import {
  capacityOf,
  compile,
  decompile,
  describe as describeRole,
  effectiveLevel,
  raisedModules,
  templateMatrix,
  templateOf,
} from "../../src/modules/admin/usuarios/role-matrix";

const tpl = (id: "consulta" | "editor" | "administrador") => templateMatrix(id);

describe("plantillas", () => {
  it("Consulta ve todo sin capacidad", () => {
    const columns = compile(tpl("consulta"));
    expect(columns).toEqual({ base_role: "consulta", screens: [], all_screens: true, all_reports: true, reports: [] });
  });

  it("Editor pide Planeación y es lo mismo que el rol Planeación de fábrica", () => {
    const columns = compile(tpl("editor"));
    expect(columns).toMatchObject({ base_role: "planeacion", all_screens: true, all_reports: true });
    // Ve la pantalla de usuarios, pero la base la cierra sin administración.
    expect(effectiveLevel(tpl("editor"), "sistema")).toBe("ver");
  });

  it("Administrador pide administración", () => {
    expect(compile(tpl("administrador"))).toMatchObject({ base_role: "admin", all_screens: true, all_reports: true });
  });

  // Impacto volvió rediseñado (0078): como Mis Tableros, se ve por pertenencia
  // y en la matriz solo se abre para consultar.
  it("Impacto está en la matriz y no sube de «ver» por la capacidad del rol", () => {
    const admin = tpl("administrador");
    expect(admin.modules.impacto).toEqual({ level: "ver", screens: ["impacto"] });
    expect(effectiveLevel(admin, "impacto")).toBe("ver");
  });
});

describe("los roles de fábrica se leen como su plantilla", () => {
  const system = (base_role: "consulta" | "planeacion" | "admin") =>
    decompile({ base_role, screens: [], all_screens: true, all_reports: true }, []);

  it("Consulta, Planeación (Editor) y Administrador", () => {
    expect(templateOf(system("consulta"))).toBe("consulta");
    expect(templateOf(system("planeacion"))).toBe("editor");
    expect(templateOf(system("admin"))).toBe("administrador");
  });

  it("Responsable de pilar es personalizado y edita el plan", () => {
    const matrix = decompile({ base_role: "responsable", screens: [], all_screens: true, all_reports: true }, []);
    expect(templateOf(matrix)).toBe("personalizada");
    expect(effectiveLevel(matrix, "plan")).toBe("editar");
    expect(effectiveLevel(matrix, "portal")).toBe("ver");
  });
});

describe("la capacidad es la mayor que pide un módulo", () => {
  it("editar el Observatorio sube a Planeación y lo dice en los demás módulos", () => {
    const matrix = tpl("consulta");
    matrix.modules.observatorio.level = "editar";
    expect(capacityOf(matrix)).toBe("planeacion");
    expect(raisedModules(matrix)).toEqual(expect.arrayContaining(["portal", "plan", "cifras"]));
    // Con la capacidad subida, esas columnas son exactamente las de Editor.
    expect(templateOf(matrix)).toBe("editor");
  });

  it("quitar módulos a Editor lo vuelve personalizado", () => {
    const matrix = tpl("editor");
    matrix.modules.observatorio = { level: "none", screens: [] };
    expect(templateOf(matrix)).toBe("personalizada");
  });

  it("Editor de UDES en Cifras: solo sus informes", () => {
    const matrix = decompile(
      { base_role: "planeacion", screens: ["cifras"], all_screens: false, all_reports: false },
      ["investigacion"],
    );
    expect(effectiveLevel(matrix, "cifras")).toBe("editar");
    expect(effectiveLevel(matrix, "plan")).toBe("none");
    expect(compile(matrix)).toMatchObject({ base_role: "planeacion", screens: ["cifras"], reports: ["investigacion"] });
    expect(describeRole(matrix, new Map([["investigacion", "Investigación"]]))).toContain(
      "En UDES en Cifras escribe: Investigación.",
    );
  });

  it("pantallas parciales se guardan como lista", () => {
    const matrix = tpl("consulta");
    matrix.modules.plan.screens = ["pillars", "projects"];
    const columns = compile(matrix);
    expect(columns.all_screens).toBe(false);
    expect(columns.screens).toContain("pillars");
    expect(columns.screens).not.toContain("budget");
  });
});

describe("ida y vuelta", () => {
  it("compilar lo descompilado deja las mismas columnas", () => {
    for (const id of ["consulta", "editor", "administrador"] as const) {
      const columns = compile(tpl(id));
      const again = compile(decompile(columns, columns.reports));
      expect(again).toEqual(columns);
    }
  });
});
