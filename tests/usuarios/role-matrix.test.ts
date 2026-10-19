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
      informe_level: "none",
      all_informe_units: false,
      informe_units: [],
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
      informe_level: "none",
      all_informe_units: false,
      informe_units: [],
      units: [FACULTAD, PROGRAMA].sort(),
    });
  });

  it("Administrador de toda la estructura no guarda lista de unidades", () => {
    expect(compile(impact("administrar", { allUnits: true, units: [PROGRAMA] }))).toMatchObject({
      impact_level: "admin",
      all_impact_units: true,
      informe_level: "none",
      all_informe_units: false,
      informe_units: [],
      units: [],
    });
  });

  it("«Ver» o sin pantalla no da alcance aunque queden unidades marcadas", () => {
    expect(compile(impact("ver", { allUnits: true, units: [PROGRAMA] }))).toMatchObject({
      impact_level: "none",
      all_impact_units: false,
      informe_level: "none",
      all_informe_units: false,
      informe_units: [],
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

  it("se describe por la ficha de la persona y cuenta el alcance heredado si existe", () => {
    const names = new Map([[PROGRAMA, "Fisioterapia"], [VICERRECTORIA, "Vicerrectoría de Investigaciones"]]);
    const heredado = describeRole(impact("editar", { units: [PROGRAMA, VICERRECTORIA] }), new Map(), names);
    expect(heredado).toContain(
      "En Indicadores de Impacto define fichas y captura datos en las unidades donde se le asigne Contribuyente (se asignan en su ficha).",
    );
    expect(heredado).toContain(
      "Además, por el alcance que ya traía el rol, actúa sobre: Fisioterapia y Vicerrectoría de Investigaciones.",
    );
    expect(describeRole(impact("administrar", { allUnits: true }))).toContain(
      "Además, por el alcance que ya traía el rol, actúa sobre toda la estructura.",
    );
  });

  it("un rol nuevo sin alcance no miente ni exige alcance", () => {
    const lines = describeRole(impact("administrar"));
    expect(lines).toContain(
      "En Indicadores de Impacto define, captura, publica, revisa y emite informes en las unidades donde se le asigne Gestor (se asignan en su ficha).",
    );
    expect(lines.join(" ")).not.toContain("no actúa sobre ninguna");
    expect(compile(impact("editar"))).toMatchObject({ impact_level: "editor", all_impact_units: false, units: [] });
  });

  it("guardar un rol con alcance heredado desde el editor no lo pierde", () => {
    const stored = decompile(
      { base_role: "consulta", screens: ["impacto"], all_screens: false, all_reports: false, impact_level: "editor", all_impact_units: false },
      [],
      [PROGRAMA, FACULTAD],
    );
    expect(compile(stored)).toMatchObject({ impact_level: "editor", all_impact_units: false, units: [FACULTAD, PROGRAMA].sort() });
    const todo = decompile(
      { base_role: "consulta", screens: ["impacto"], all_screens: false, all_reports: false, impact_level: "admin", all_impact_units: true },
      [],
    );
    expect(compile(todo)).toMatchObject({ impact_level: "admin", all_impact_units: true });
  });
});

describe("módulos que antes no se podían conceder", () => {
  const only = (screens: string[], base_role: "consulta" | "planeacion" | "admin") =>
    decompile({ base_role, screens: screens as never, all_screens: false, all_reports: false }, []);

  it("todas las pantallas de la intranet están en la matriz", () => {
    const wanted = ["pilo", "pilo_ensenanza", "correos", "rutas", "rankings", "internacionalizacion", "informes", "warehouse", "monitor"];
    const columns = compile(tpl("administrador"));
    expect(columns.all_screens).toBe(true);
    const matrix = tpl("consulta");
    for (const id of Object.keys(matrix.modules) as (keyof typeof matrix.modules)[]) matrix.modules[id] = { level: "none", screens: [] };
    matrix.modules.pilo = { level: "ver", screens: ["pilo", "pilo_ensenanza"] };
    matrix.modules.correos = { level: "ver", screens: ["correos"] };
    matrix.modules.rutas = { level: "ver", screens: ["rutas"] };
    matrix.modules.rankings = { level: "ver", screens: ["rankings"] };
    matrix.modules.internacionalizacion = { level: "ver", screens: ["internacionalizacion"] };
    matrix.modules.informes = { level: "ver", screens: ["informes"] };
    matrix.modules.warehouse = { level: "ver", screens: ["warehouse"] };
    matrix.modules.monitor = { level: "ver", screens: ["monitor"] };
    expect(compile(matrix).screens.sort()).toEqual([...wanted].sort());
  });

  it("Editar en Rutas o Warehouse pide Planeación; Administrar Pilo o Correos, administración", () => {
    const rutas = only(["rutas"], "consulta");
    rutas.modules.rutas.level = "editar";
    expect(capacityOf(rutas)).toBe("planeacion");
    const pilo = only(["pilo"], "consulta");
    pilo.modules.pilo.level = "administrar";
    expect(capacityOf(pilo)).toBe("admin");
  });

  it("Warehouse marcado en un rol de Consulta no se verá, y la matriz lo dice", () => {
    const matrix = only(["warehouse"], "consulta");
    expect(effectiveLevel(matrix, "warehouse")).toBe("none");
    expect(describeRole(matrix)).toEqual(["No ve ninguna pantalla de la intranet."]);
    expect(effectiveLevel(only(["warehouse"], "planeacion"), "warehouse")).toBe("editar");
  });

  it("los roles de fábrica siguen leyéndose como su plantilla", () => {
    const system = (base_role: "consulta" | "planeacion" | "admin") =>
      decompile({ base_role, screens: [], all_screens: true, all_reports: true }, []);
    expect(templateOf(system("consulta"))).toBe("consulta");
    expect(templateOf(system("planeacion"))).toBe("editor");
    expect(templateOf(system("admin"))).toBe("administrador");
  });
});

describe("Informes de gestión: quién hace el informe", () => {
  const conInformes = (informe: { level: "none" | "editor" | "jefe"; allUnits?: boolean; units?: string[] }) => {
    const matrix = templateMatrix("consulta");
    matrix.informe = { level: informe.level, allUnits: informe.allUnits ?? false, units: informe.units ?? [] };
    return matrix;
  };

  it("el papel y las unidades se guardan en las columnas del rol", () => {
    const columns = compile(conInformes({ level: "editor", units: ["u2", "u1"] }));
    expect(columns).toMatchObject({ informe_level: "editor", all_informe_units: false, informe_units: ["u1", "u2"] });
    expect(compile(conInformes({ level: "jefe", allUnits: true, units: ["u1"] }))).toMatchObject({
      informe_level: "jefe",
      all_informe_units: true,
      informe_units: [],
    });
  });

  it("sin el módulo, el alcance no se guarda aunque quedara marcado", () => {
    const matrix = conInformes({ level: "editor", units: ["u1"] });
    matrix.modules.informes = { level: "none", screens: [] };
    expect(compile(matrix)).toMatchObject({ informe_level: "none", all_informe_units: false, informe_units: [] });
  });

  it("un rol guardado se lee de vuelta con su papel y sus unidades", () => {
    const columns = compile(conInformes({ level: "jefe", units: ["u1", "u2"] }));
    const again = compile(decompile({ ...columns }, columns.reports, columns.units, columns.informe_units));
    expect(again).toEqual(columns);
  });

  it("lo dice en palabras", () => {
    const names = new Map([["u1", "Facultad de Salud"]]);
    expect(describeRole(conInformes({ level: "editor", units: ["u1"] }), new Map(), names).join(" ")).toContain("escribe el informe de: Facultad de Salud");
    expect(describeRole(conInformes({ level: "jefe", allUnits: true })).join(" ")).toContain("escribe y envía el informe de toda la estructura");
  });
});
