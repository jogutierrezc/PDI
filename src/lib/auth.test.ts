import { describe, expect, it } from "vitest";
import { screenVisible, type AccessScope } from "./auth";
import type { Profile } from "../types/database";

const person = (role: Profile["role"]): Profile => ({
  id: "p", email: "p@udes.edu.co", full_name: "Persona", unit: null, role, is_active: true, created_at: "", updated_at: "",
});
const scope = (screens: string[]): AccessScope =>
  ({ role: { all_screens: false, screens, all_reports: true }, reports: [] }) as unknown as AccessScope;

describe("screenVisible: el menú y el lanzador enseñan solo lo que se puede usar", () => {
  it("un programa ve Impacto y Mis Tableros, y nada de lo que su rol no abre", () => {
    const who = { profile: person("responsable"), access: scope(["cifras"]), inAnyUnit: true, impactoSide: "programa" as const };
    expect(screenVisible("impacto", who)).toBe(true);
    expect(screenVisible("tableros", who)).toBe(true);
    expect(screenVisible("cifras", who)).toBe(true);
    expect(screenVisible("pillars", who)).toBe(false);
    expect(screenVisible("users", who)).toBe(false);
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

  it("sin sesión activa no se ve nada", () => {
    expect(screenVisible("office", { profile: { ...person("admin"), is_active: false }, access: null, inAnyUnit: false, impactoSide: null })).toBe(false);
    expect(screenVisible("office", { profile: null, access: null, inAnyUnit: false, impactoSide: null })).toBe(false);
  });
});
