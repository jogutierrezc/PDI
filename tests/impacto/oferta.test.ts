import { describe, expect, it } from "vitest";
import { buildPortal } from "../../src/modules/impacto/data/lens";
import { emptyMessage, facets, filterPrograms, readFilter, summary, NO_FILTER } from "../../src/modules/impacto/data/offer";

const data = buildPortal(
  { version: null, indicators: [] },
  {
    faculties: [
      { id: "f1", slug: "ingenierias", code: "FIT", name: "Facultad de Ingenierías" },
      { id: "f2", slug: "salud", code: "FCS", name: "Facultad de Ciencias de la Salud" },
      { id: "f3", slug: "vacia", code: "FVA", name: "Facultad sin programas" },
    ],
    programs: [
      { id: "p1", slug: "sistemas", code: "ISI", name: "Ingeniería de Sistemas", faculty_id: "f1", degree_level: "pregrado", modality: "presencial", campus_ids: ["c1", "c2"] },
      { id: "p2", slug: "tec-software", code: "TDS", name: "Tecnología en Desarrollo de Software", faculty_id: "f1", degree_level: "tecnologico", modality: "virtual", campus_ids: ["c2"] },
      { id: "p3", slug: "medicina", code: "MED", name: "Medicina", faculty_id: "f2", degree_level: "pregrado", modality: "presencial", campus_ids: ["c1"] },
      { id: "p4", slug: "cirugia", code: "ECG", name: "Especialización en Cirugía General", faculty_id: "f2", degree_level: "especializacion_medicoquirurgica", modality: "presencial", campus_ids: ["c1"] },
      { id: "p5", slug: "tecnico-enf", code: "TEN", name: "Técnico en Enfermería", faculty_id: "f2", degree_level: "tecnico", modality: "presencial", campus_ids: [] },
    ],
    campuses: [
      { id: "c1", slug: "bucaramanga", name: "Bucaramanga" },
      { id: "c2", slug: "cucuta", name: "Cúcuta" },
      { id: "c3", slug: "bogota", name: "Bogotá" },
    ],
  } as never,
  [],
);

describe("oferta de programas del portal", () => {
  it("sin filtros: todos, en el orden de la formación", () => {
    expect(filterPrograms(data, NO_FILTER).map((p) => p.slug)).toEqual(["tecnico-enf", "tec-software", "sistemas", "medicina", "cirugia"]);
    expect(summary(data, NO_FILTER, 5)).toBe("5 programas · toda la universidad");
  });

  it("facultad y campus se combinan, y el resumen los nombra", () => {
    const filter = { facultad: "ingenierias", campus: "cucuta", nivel: null };
    expect(filterPrograms(data, filter).map((p) => p.slug)).toEqual(["tec-software", "sistemas"]);
    expect(summary(data, filter, 2)).toBe("2 programas · Facultad de Ingenierías · Cúcuta");
  });

  it("por nivel, incluidos los nuevos de 0075", () => {
    expect(filterPrograms(data, { ...NO_FILTER, nivel: "especializacion_medicoquirurgica" }).map((p) => p.slug)).toEqual(["cirugia"]);
    expect(filterPrograms(data, { ...NO_FILTER, nivel: "tecnico" }).map((p) => p.slug)).toEqual(["tecnico-enf"]);
  });

  it("las facetas cuentan con los otros filtros puestos y omiten lo que no tiene oferta", () => {
    const f = facets(data, { facultad: "salud", campus: null, nivel: null });
    expect(f.facultades.map((o) => o.slug)).toEqual(["ingenierias", "salud"]);
    expect(f.campus).toEqual([
      { slug: "bucaramanga", name: "Bucaramanga", count: 2 },
      { slug: "cucuta", name: "Cúcuta", count: 0 },
    ]);
    expect(f.niveles.find((o) => o.slug === "tecnico")?.count).toBe(1);
  });

  it("la lista vacía dice por qué", () => {
    expect(emptyMessage(data, { facultad: "salud", campus: "cucuta", nivel: null })).toBe(
      "Facultad de Ciencias de la Salud no ofrece programas en Cúcuta todavía.",
    );
    expect(emptyMessage(data, { facultad: null, campus: "bogota", nivel: null })).toBe("Ninguna facultad ofrece programas en Bogotá todavía.");
  });

  it("de la dirección solo toma valores que existen", () => {
    const params = new URLSearchParams("facultad=salud&campus=pasto&nivel=diplomado");
    expect(readFilter(params, data)).toEqual({ facultad: "salud", campus: null, nivel: null });
  });
});
