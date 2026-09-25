import { describe, expect, it } from "vitest";
import { resolveAccess } from "./access";
import type { ImpactBase } from "./store";

const base = (memberships: ImpactBase["memberships"]): ImpactBase => ({
  units: [
    { id: "ve", parentId: null, kind: "vicerrectoria", code: "VE", name: "Vicerrectoría de Enseñanza" },
    { id: "fac", parentId: null, kind: "facultad", code: "FS", name: "Salud" },
    { id: "fis", parentId: "fac", kind: "programa", code: "FIS", name: "Fisioterapia" },
    { id: "bac", parentId: "fac", kind: "programa", code: "BAC", name: "Bacteriología" },
  ],
  campuses: [{ id: "bga", name: "Bucaramanga", slug: "bucaramanga" }],
  offer: [
    { programId: "fis", campusId: "bga" },
    { programId: "bac", campusId: "bga" },
  ],
  unitFunctions: [{ unitId: "ve", fn: "ensenanza" }],
  memberships,
  pillars: [],
  dimensions: [],
  missing: false,
});

describe("Impacto: manda la pertenencia, no el rol global", () => {
  it("una cuenta de programa con rol «planeación» trabaja como programa: sin catálogo completo", () => {
    const access = resolveAccess(base([{ unitId: "fis", role: "editor", campusId: null }]), true, false);
    expect(access.reader).toBe(false);
    expect(access.programSide).toBe(true);
    expect(access.readableFns).toEqual([]);
    expect(access.sites.map((s) => s.programId)).toEqual(["fis"]);
  });

  it("una vicerrectoría ve solo su función y reorganiza lo de sus programas", () => {
    const access = resolveAccess(base([{ unitId: "ve", role: "jefe", campusId: null }]), true, false);
    expect(access.reader).toBe(false);
    expect(access.readableFns).toEqual(["ensenanza"]);
    expect(access.canCurate("ensenanza")).toBe(true);
    expect(access.canCurate("investigacion")).toBe(false);
    expect(access.programSide).toBe(false);
  });

  it("Planeación sin unidades y la administración lo ven todo", () => {
    expect(resolveAccess(base([]), true, false).reader).toBe(true);
    const admin = resolveAccess(base([{ unitId: "fis", role: "visor", campusId: null }]), true, true);
    expect(admin.reader).toBe(true);
    expect(admin.sites).toHaveLength(2);
  });
});
