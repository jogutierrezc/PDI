import { describe, expect, it } from "vitest";
import { pcRolDe, type PcNombramiento, type ProgramOffer } from "../../src/modules/admin/usuarios/people-db";

const offer: ProgramOffer = {
  campuses: [
    { id: "buc", name: "Bucaramanga" },
    { id: "cuc", name: "Cúcuta" },
  ],
  byProgram: new Map([["med", ["buc", "cuc"]]]),
};

describe("pcRolDe: el papel de una fila de programa en Programas en Cifras", () => {
  const nombramientos: PcNombramiento[] = [{ programaId: "med", campusId: "buc", rol: "director" }];

  it("con sede elegida, el de esa sede", () => {
    expect(pcRolDe(nombramientos, "med", "buc", offer)).toBe("director");
    expect(pcRolDe(nombramientos, "med", "cuc", offer)).toBeNull();
  });

  it("en todas las sedes, solo si lo es en cada una donde se ofrece", () => {
    expect(pcRolDe(nombramientos, "med", null, offer)).toBeNull();
    const ambas: PcNombramiento[] = [...nombramientos, { programaId: "med", campusId: "cuc", rol: "director" }];
    expect(pcRolDe(ambas, "med", null, offer)).toBe("director");
    const mezcla: PcNombramiento[] = [...nombramientos, { programaId: "med", campusId: "cuc", rol: "coordinador" }];
    expect(pcRolDe(mezcla, "med", null, offer)).toBeNull();
  });

  it("un programa sin oferta no tiene papel", () => {
    expect(pcRolDe(nombramientos, "otro", null, offer)).toBeNull();
  });
});
