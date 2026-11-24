import { describe, expect, it } from "vitest";
import { rolesQueNombra, veEquipo } from "./permisos";

const yo = (...roles: ("director" | "coordinador" | "planeacion")[]) => ({
  planeacion: roles.includes("planeacion"),
  programas: roles.map((rol, i) => ({ programa_id: `p${i}`, campus_id: "c", rol, programa: "P", programa_codigo: "P", campus: "C" })),
});

describe("Equipo: quién nombra a quién", () => {
  it("la administración nombra Directores y Coordinadores", () => {
    expect(rolesQueNombra({ admin: true, rolEnElPrograma: null })).toEqual(["director", "coordinador"]);
  });
  it("el Director solo nombra Coordinadores de su programa", () => {
    expect(rolesQueNombra({ admin: false, rolEnElPrograma: "director" })).toEqual(["coordinador"]);
  });
  it("el Coordinador y Planeación no nombran a nadie", () => {
    expect(rolesQueNombra({ admin: false, rolEnElPrograma: "coordinador" })).toEqual([]);
    expect(rolesQueNombra({ admin: false, rolEnElPrograma: "planeacion" })).toEqual([]);
  });
  it("«Equipo» lo ve la administración y quien dirige algún programa", () => {
    expect(veEquipo(yo("coordinador"), false)).toBe(false);
    expect(veEquipo(yo("planeacion"), false)).toBe(false);
    expect(veEquipo(yo("coordinador", "director"), false)).toBe(true);
    expect(veEquipo(yo(), true)).toBe(true);
    expect(veEquipo(null, false)).toBe(false);
  });
});
