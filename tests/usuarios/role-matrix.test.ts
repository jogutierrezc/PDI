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
    expect(columns).toEqual({
      base_role: "consulta",
      screens: [],
      all_screens: true,
      all_reports: true,
      reports: [],
      impact_level: "none",
      all_impact_units: false,
      units: [],
    });
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
    // Reportes Institucionales: responsable captura y valida plantillas.
    expect(effectiveLevel(matrix, "reportes")).toBe("editar");
  });

  it("Reportes Institucionales: Consulta ve, Planeación administra catálogos", () => {
    expect(effectiveLevel(system("consulta"), "reportes")).toBe("ver");
    expect(effectiveLevel(system("planeacion"), "reportes")).toBe("administrar");
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

describe("Indicadores de Impacto: editor y administrador con alcance", () => {
  const PROGRAMA = "00000000-0000-4000-b000-000000000011";
  const FACULTAD = "00000000-0000-4000-b000-000000000010";
  const VICERRECTORIA = "00000000-0000-4000-b000-000000000001";

  /** Un rol que solo ve Impacto, al nivel y con el alcance que se pida. */
  const impact = (level: "ver" | "editar" | "administrar", scope: { allUnits?: boolean; units?: string[] } = {}) => {
    const matrix = decompile({ base_role: "consulta", screens: ["impacto"], all_screens: false, all_reports: false }, []);
    matrix.modules.impacto.level = level;
    matrix.impact = { allUnits: scope.allUnits ?? false, units: scope.units ?? [] };
    return matrix;
  };

  it("Editar y Administrar no suben la capacidad: Impacto se decide por unidad", () => {
    expect(capacityOf(impact("editar", { units: [PROGRAMA] }))).toBe("consulta");
    expect(capacityOf(impact("administrar", { allUnits: true }))).toBe("consulta");
    expect(effectiveLevel(impact("editar", { units: [PROGRAMA] }), "impacto")).toBe("editar");
    expect(effectiveLevel(impact("administrar", { units: [PROGRAMA] }), "impacto")).toBe("administrar");
  });

  it("Editor: editor de sus programas; las columnas guardan nivel y unidades", () => {
    expect(compile(impact("editar", { units: [PROGRAMA, FACULTAD] }))).toEqual({
      base_role: "consulta",
      screens: ["impacto"],
      all_screens: false,
      all_reports: false,
      reports: [],
      impact_level: "editor",
      all_impact_units: false,
      units: [FACULTAD, PROGRAMA].sort(),
    });
  });

  it("Administrador de toda la estructura no guarda lista de unidades", () => {
    expect(compile(impact("administrar", { allUnits: true, units: [PROGRAMA] }))).toMatchObject({
      impact_level: "admin",
      all_impact_units: true,
      units: [],
    });
  });

  it("«Ver» o sin pantalla no da alcance aunque queden unidades marcadas", () => {
    expect(compile(impact("ver", { allUnits: true, units: [PROGRAMA] }))).toMatchObject({
      impact_level: "none",
      all_impact_units: false,
      units: [],
    });
    const hidden = impact("editar", { units: [PROGRAMA] });
    hidden.modules.impacto = { level: "none", screens: [] };
    expect(compile(hidden)).toMatchObject({ impact_level: "none", units: [] });
  });

  it("ida y vuelta: lo guardado se vuelve a leer igual", () => {
    for (const matrix of [
      impact("editar", { units: [PROGRAMA] }),
      impact("administrar", { units: [VICERRECTORIA, FACULTAD] }),
      impact("administrar", { allUnits: true }),
    ]) {
      const columns = compile(matrix);
      const again = decompile({ ...columns }, columns.reports, columns.units);
      expect(again.modules.impacto.level).toBe(matrix.modules.impacto.level);
      expect(compile(again)).toEqual(columns);
    }
  });

  it("los roles de fábrica y las plantillas siguen sin alcance de Impacto", () => {
    for (const id of ["consulta", "editor", "administrador"] as const) {
      expect(compile(tpl(id))).toMatchObject({ impact_level: "none", all_impact_units: false, units: [] });
      expect(tpl(id).modules.impacto.level).toBe("ver");
    }
  });

  it("se describe con los nombres de las unidades", () => {
    const names = new Map([[PROGRAMA, "Fisioterapia"], [VICERRECTORIA, "Vicerrectoría de Investigaciones"]]);
    expect(describeRole(impact("editar", { units: [PROGRAMA, VICERRECTORIA] }), new Map(), names)).toContain(
      "En Indicadores de Impacto define fichas y captura datos de: Fisioterapia y Vicerrectoría de Investigaciones.",
    );
    expect(describeRole(impact("administrar", { allUnits: true }))).toContain(
      "En Indicadores de Impacto define, captura, publica, revisa y emite informes de toda la estructura.",
    );
    expect(describeRole(impact("editar"))).toContain(
      "En Indicadores de Impacto no tiene unidades asignadas: no actúa sobre ninguna.",
    );
  });
});
