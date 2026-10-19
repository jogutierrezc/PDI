import { describe, expect, it } from "vitest";
import { afterLoginPath, screenVisible, type AccessScope } from "./auth";
import type { Profile } from "../types/database";

const person = (role: Profile["role"]): Profile => ({
  id: "p", email: "p@udes.edu.co", full_name: "Persona", unit: null, role, is_active: true, created_at: "", updated_at: "",
});
const scope = (screens: string[]): AccessScope =>
  ({ role: { all_screens: false, screens, all_reports: true }, reports: [] }) as unknown as AccessScope;

describe("screenVisible: el menú y el lanzador enseñan solo lo que se puede usar", () => {
  it("un programa ve Impacto y Mis Tableros, y nada de lo que su rol no abre", () => {
    const who = { profile: person("responsable"), access: scope(["cifras", "impacto", "tableros"]), inAnyUnit: true, impactoSide: "programa" as const };
    expect(screenVisible("impacto", who)).toBe(true);
    expect(screenVisible("tableros", who)).toBe(true);
    expect(screenVisible("cifras", who)).toBe(true);
    expect(screenVisible("pillars", who)).toBe(false);
    expect(screenVisible("users", who)).toBe(false);
  });

  it("pertenecer a una unidad no abre lo que el rol no marca: el rol manda", () => {
    const who = { profile: person("planeacion"), access: scope(["cifras"]), inAnyUnit: true, impactoSide: "programa" as const };
    expect(screenVisible("tableros", who)).toBe(false);
    expect(screenVisible("impacto", who)).toBe(false);
    expect(screenVisible("monitor", who)).toBe(false);
    expect(screenVisible("informes", who)).toBe(false);
    expect(screenVisible("cifras", who)).toBe(true);
    // Sin rol asignado, pertenecer sí abre, como siempre.
    const sinRol = { profile: person("responsable"), access: null, inAnyUnit: true, impactoSide: "programa" as const };
    for (const screen of ["tableros", "impacto", "monitor", "informes"] as const) expect(screenVisible(screen, sinRol)).toBe(true);
  });

  it("un rol que escribe informes de otras unidades abre Informes sin pertenecer a ninguna", () => {
    const rol = (informe_level: string) =>
      ({ role: { all_screens: false, screens: ["informes"], all_reports: true, informe_level }, reports: [] }) as unknown as AccessScope;
    const base = { profile: person("consulta"), inAnyUnit: false, impactoSide: null };
    expect(screenVisible("informes", { ...base, access: rol("editor") })).toBe(true);
    expect(screenVisible("informes", { ...base, access: rol("jefe") })).toBe(true);
    expect(screenVisible("informes", { ...base, access: rol("none") })).toBe(false);
  });

  it("pertenecer a una oficina sin función no da Impacto", () => {
    const who = { profile: person("planeacion"), access: null, inAnyUnit: true, impactoSide: null };
    expect(screenVisible("impacto", who)).toBe(false);
    expect(screenVisible("tableros", who)).toBe(true);
  });

  it("Planeación sin unidades lee Impacto; la administración, todo", () => {
    expect(screenVisible("impacto", { profile: person("planeacion"), access: null, inAnyUnit: false, impactoSide: null })).toBe(true);
    const admin = { profile: person("admin"), access: null, inAnyUnit: false, impactoSide: null };
    expect(screenVisible("impacto", admin)).toBe(true);
    expect(screenVisible("users", admin)).toBe(true);
  });

  it("Correos, Rutas, Rankings y Warehouse piden capacidad Y estar marcados en el rol", () => {
    const base = { inAnyUnit: false, impactoSide: null };
    for (const screen of ["correos", "rutas", "rankings", "warehouse"] as const) {
      expect(screenVisible(screen, { ...base, profile: person("planeacion"), access: scope([screen]) })).toBe(true);
      expect(screenVisible(screen, { ...base, profile: person("planeacion"), access: scope(["cifras"]) })).toBe(false);
      expect(screenVisible(screen, { ...base, profile: person("consulta"), access: scope([screen]) })).toBe(false);
      expect(screenVisible(screen, { ...base, profile: person("planeacion"), access: null })).toBe(true);
    }
  });

  it("la capacidad no salta la lista: un rol restringido enseña solo lo marcado", () => {
    const who = { profile: person("planeacion"), access: scope(["rankings", "internacionalizacion"]), inAnyUnit: false, impactoSide: null };
    expect(screenVisible("rankings", who)).toBe(true);
    expect(screenVisible("internacionalizacion", who)).toBe(true);
    expect(screenVisible("monitor", who)).toBe(false);
    expect(screenVisible("informes", who)).toBe(false);
    expect(screenVisible("impacto", who)).toBe(false);
    expect(screenVisible("programas-en-cifras", who)).toBe(false);
    expect(screenVisible("correos", who)).toBe(false);
    expect(screenVisible("pillars", who)).toBe(false);
  });

  it("la administración con rol restringido tampoco ve lo que no está marcado", () => {
    const who = { profile: person("admin"), access: scope(["cifras"]), inAnyUnit: false, impactoSide: null };
    expect(screenVisible("cifras", who)).toBe(true);
    expect(screenVisible("impacto", who)).toBe(false);
    expect(screenVisible("monitor", who)).toBe(false);
    expect(screenVisible("informes", who)).toBe(false);
    expect(screenVisible("programas-en-cifras", who)).toBe(false);
  });

  it("sin sesión activa no se ve nada", () => {
    expect(screenVisible("office", { profile: { ...person("admin"), is_active: false }, access: null, inAnyUnit: false, impactoSide: null })).toBe(false);
    expect(screenVisible("office", { profile: null, access: null, inAnyUnit: false, impactoSide: null })).toBe(false);
  });
});

describe("afterLoginPath: al iniciar sesión se llega al panel", () => {
  const me = person("consulta");

  it("sin destino previo, al lanzador de la intranet", () => {
    expect(afterLoginPath(undefined, me)).toBe("/admin");
  });

  it("respeta la pantalla interna de la que venía la guarda", () => {
    expect(afterLoginPath("/admin/udes-en-cifras/captura", me)).toBe("/admin/udes-en-cifras/captura");
    expect(afterLoginPath("/impacto", me)).toBe("/impacto");
  });

  it("nunca devuelve al login, a «Sin permiso», a la portada ni fuera del sitio", () => {
    for (const from of ["/acceso-intranet", "/sin-permiso", "/", "//evil.example", "https://evil.example", 42]) {
      expect(afterLoginPath(from, me)).toBe("/admin");
    }
  });

  it("sin perfil activo no hay panel", () => {
    expect(afterLoginPath(undefined, null)).toBe("/");
  });
});
