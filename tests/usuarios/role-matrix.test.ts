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
  type Matrix,
} from "../../src/modules/admin/usuarios/role-matrix";

const tpl = (id: "consulta" | "editor" | "revisor" | "administrador", scope: "global" | "unidad" = "global") =>
  templateMatrix(id, scope) as Matrix;

describe("plantillas globales", () => {
  it("Consulta ve todo sin capacidad", () => {
    const columns = compile(tpl("consulta"));
    expect(columns).toMatchObject({ base_role: "consulta", all_screens: true, all_reports: true, capabilities: [] });
  });

  it("Editor pide Planeación y es lo mismo que el rol Planeación de fábrica", () => {
    const columns = compile(tpl("editor"));
    expect(columns).toMatchObject({ base_role: "planeacion", all_screens: true, all_reports: true, capabilities: [] });
    // Ve la pantalla de usuarios, pero la base la cierra sin administración.
    expect(effectiveLevel(tpl("editor"), "sistema")).toBe("ver");
  });

  it("Administrador pide administración y lleva catálogo y periodos", () => {
    const columns = compile(tpl("administrador"));
    expect(columns).toMatchObject({ base_role: "admin", all_screens: true, all_reports: true });
    expect(columns.capabilities.sort()).toEqual(["impacto.catalogo", "impacto.periodo"]);
  });

  it("Revisor global no existe: revisar se hace en una unidad", () => {
    expect(templateMatrix("revisor", "global")).toBeNull();
  });
});

describe("los roles de fábrica se leen como su plantilla", () => {
  const system = (base_role: "consulta" | "planeacion" | "admin") =>
    decompile({ base_role, screens: [], all_screens: true, all_reports: true, capabilities: [] }, []);

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

describe("roles de unidad", () => {
  it("las plantillas dan acciones de unidad y papel en Mis Tableros", () => {
    expect(compile(tpl("editor", "unidad"))).toMatchObject({
      scope: "unidad",
      base_role: "consulta",
      screens: ["impacto"],
      capabilities: ["impacto.capturar", "impacto.enviar"],
      unit_role: "editor",
    });
    expect(compile(tpl("revisor", "unidad")).capabilities).toEqual(["impacto.aprobar", "impacto.validar"]);
  });

  it("los roles de Impacto de partida se reconocen", () => {
    const director = decompile(
      { base_role: "consulta", screens: ["impacto"], all_screens: false, all_reports: false, scope: "unidad", capabilities: ["impacto.capturar", "impacto.enviar"], unit_role: "editor" },
      [],
    );
    expect(templateOf(director)).toBe("editor");
    const decano = decompile(
      { base_role: "consulta", screens: ["impacto"], all_screens: false, all_reports: false, scope: "unidad", capabilities: ["impacto.aprobar"] },
      [],
    );
    expect(templateOf(decano)).toBe("personalizada");
    expect(describeRole(decano)[0]).toBe("En Impacto, en su unidad: aprobar.");
  });

  it("un rol de unidad no guarda acciones globales", () => {
    const matrix = tpl("administrador", "unidad");
    matrix.capabilities.push("impacto.catalogo");
    expect(compile(matrix).capabilities).not.toContain("impacto.catalogo");
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
