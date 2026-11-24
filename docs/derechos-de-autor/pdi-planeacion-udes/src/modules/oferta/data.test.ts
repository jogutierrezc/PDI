import { describe, expect, it } from "vitest";
import { buildOffer, emptyMessage, facets, filterPrograms, readFilter, summary, NO_FILTER } from "./data";

const units = [
  { id: "f1", parent_id: null, kind: "facultad" as const, slug: "ingenierias", code: "FIT", name: "Ingenierías", degree_level: null, position: 1 },
  { id: "f2", parent_id: null, kind: "facultad" as const, slug: "salud", code: "FCS", name: "Salud", degree_level: null, position: 2 },
  { id: "p1", parent_id: "f1", kind: "programa" as const, slug: "sistemas", code: "SIS", name: "Ingeniería de Sistemas", degree_level: "pregrado" as const, position: 1 },
  { id: "p2", parent_id: "f1", kind: "programa" as const, slug: "maestria-sw", code: "MSW", name: "Maestría en Software", degree_level: "maestria" as const, position: 2 },
  { id: "p3", parent_id: "f2", kind: "programa" as const, slug: "enfermeria", code: "ENF", name: "Enfermería", degree_level: "pregrado" as const, position: 1 },
  { id: "p4", parent_id: "f2", kind: "programa" as const, slug: "tecnico-salud", code: "TSA", name: "Técnico en Salud", degree_level: "tecnico" as const, position: 2 },
];
const campuses = [
  { id: "c1", slug: "bucaramanga", name: "Bucaramanga", position: 1 },
  { id: "c2", slug: "cucuta", name: "Cúcuta", position: 2 },
  { id: "c3", slug: "valledupar", name: "Valledupar", position: 3 },
];
const offer = [
  { program_id: "p1", campus_id: "c2" },
  { program_id: "p1", campus_id: "c1" },
  { program_id: "p2", campus_id: "c1" },
  { program_id: "p3", campus_id: "c2" },
];

describe("oferta de programas", () => {
  const data = buildOffer(units, campuses, offer);

  it("arma programas con su facultad y sus sedes en el orden de las sedes", () => {
    expect(data.programs.find((p) => p.slug === "sistemas")).toEqual({
      slug: "sistemas",
      name: "Ingeniería de Sistemas",
      faculty: "ingenierias",
      degree: "pregrado",
      campus: ["bucaramanga", "cucuta"],
    });
    // Una sede sin ningún programa no es opción.
    expect(data.campuses.map((c) => c.slug)).toEqual(["bucaramanga", "cucuta"]);
  });

  it("filtra por facultad, campus y nivel, del nivel más básico al más alto", () => {
    expect(filterPrograms(data, NO_FILTER).map((p) => p.slug)).toEqual(["tecnico-salud", "enfermeria", "sistemas", "maestria-sw"]);
    expect(filterPrograms(data, { facultad: "ingenierias", campus: "cucuta", nivel: null }).map((p) => p.slug)).toEqual(["sistemas"]);
    expect(filterPrograms(data, { facultad: null, campus: null, nivel: "maestria" }).map((p) => p.slug)).toEqual(["maestria-sw"]);
  });

  it("cada opción cuenta con los demás filtros puestos", () => {
    const f = facets(data, { facultad: "salud", campus: null, nivel: null });
    expect(f.campus).toEqual([
      { slug: "bucaramanga", name: "Bucaramanga", count: 0 },
      { slug: "cucuta", name: "Cúcuta", count: 1 },
    ]);
    expect(f.niveles.map((n) => n.slug)).toEqual(["tecnico", "pregrado", "maestria"]);
  });

  it("lee el filtro de la dirección y descarta lo que no existe", () => {
    const filter = readFilter(new URLSearchParams("facultad=salud&campus=pasto&nivel=diplomado"), data);
    expect(filter).toEqual({ facultad: "salud", campus: null, nivel: null });
    expect(summary(data, filter, 2)).toBe("2 programas · Salud");
    expect(emptyMessage(data, { facultad: "salud", campus: "bucaramanga", nivel: null })).toBe("Salud no ofrece programas en Bucaramanga todavía.");
  });
});
