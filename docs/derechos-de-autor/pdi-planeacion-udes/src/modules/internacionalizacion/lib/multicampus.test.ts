import { describe, expect, it } from "vitest";
import { campusVisiblesEn, controlaMulticampus, esMiembro, puedeCrear, puedeCrearLibro, puedeEditarLibro, rolFila } from "./permisos";
import type { Yo } from "../tipos";

const BUC = "buc";
const CUC = "cuc";
const VAL = "val";
const TODOS = [BUC, CUC, VAL, "bog"];
const yo = (p: Partial<Yo>): Yo => ({ director: false, coordinador: [], gestor: [], central: BUC, ...p });

describe("tablas Multicampus: quién edita las filas de cada campus", () => {
  it("Bucaramanga edita las filas de todos los campus; Cúcuta y Valledupar, solo las suyas", () => {
    const gestorBuc = yo({ gestor: [BUC] });
    const gestorCuc = yo({ gestor: [CUC] });
    expect(rolFila(gestorBuc, CUC, true)).toBe("gestor");
    expect(rolFila(gestorBuc, VAL, true)).toBe("gestor");
    expect(rolFila(gestorCuc, CUC, true)).toBe("gestor");
    expect(rolFila(gestorCuc, VAL, true)).toBeNull();
    expect(rolFila(gestorCuc, BUC, true)).toBeNull();
  });

  it("fuera de Multicampus nadie cruza de campus, ni Bucaramanga", () => {
    const coordBuc = yo({ coordinador: [BUC] });
    expect(rolFila(coordBuc, CUC, false)).toBeNull();
    expect(rolFila(coordBuc, BUC, false)).toBe("coordinador");
  });

  it("el coordinador de Bucaramanga manda sobre un gestor de otro campus que tenga además", () => {
    const mixto = yo({ coordinador: [BUC], gestor: [CUC] });
    expect(rolFila(mixto, CUC, true)).toBe("coordinador");
  });

  it("Planeación edita las filas de todos como coordinador sin ser miembro; el Director sigue siendo director", () => {
    expect(rolFila(yo({ planeacion: true }), VAL, true)).toBe("coordinador");
    expect(rolFila(yo({ planeacion: true }), VAL, false)).toBeNull();
    expect(rolFila(yo({ director: true }), CUC, true)).toBe("director");
  });

  it("en Multicampus todos los miembros ven todos los campus; fuera de ella, solo los suyos", () => {
    const gestorCuc = yo({ gestor: [CUC] });
    expect(campusVisiblesEn(gestorCuc, TODOS, true)).toEqual(TODOS);
    expect(campusVisiblesEn(gestorCuc, TODOS, false)).toEqual([CUC]);
    expect(campusVisiblesEn(yo({}), TODOS, true)).toEqual([]);
  });
});

describe("quién crea y cambia carpetas y tablas", () => {
  it("crean Planeación, el Director y los coordinadores; no un gestor", () => {
    expect(puedeCrear(yo({ planeacion: true }))).toBe(true);
    expect(puedeCrear(yo({ director: true }))).toBe(true);
    expect(puedeCrear(yo({ coordinador: [CUC] }))).toBe(true);
    expect(puedeCrear(yo({ gestor: [BUC] }))).toBe(false);
    expect(puedeCrear(null)).toBe(false);
  });

  it("Multicampus es de Planeación, el Director y el coordinador de Bucaramanga", () => {
    expect(controlaMulticampus(yo({ planeacion: true }))).toBe(true);
    expect(controlaMulticampus(yo({ director: true }))).toBe(true);
    expect(controlaMulticampus(yo({ coordinador: [BUC] }))).toBe(true);
    expect(controlaMulticampus(yo({ coordinador: [CUC] }))).toBe(false);
    expect(controlaMulticampus(yo({ gestor: [BUC] }))).toBe(false);
    expect(puedeCrearLibro(yo({ coordinador: [CUC] }), "multicampus")).toBe(false);
    expect(puedeCrearLibro(yo({ coordinador: [CUC] }), "campus")).toBe(true);
  });

  it("«solo la oficina» la crean el Director y Planeación, no un coordinador", () => {
    expect(puedeCrearLibro(yo({ coordinador: [BUC] }), "oficina")).toBe(false);
    expect(puedeCrearLibro(yo({ planeacion: true }), "oficina")).toBe(true);
  });

  it("un coordinador cambia solo las tablas por campus que creó; Planeación y el Director, cualquiera", () => {
    const coord = yo({ coordinador: [CUC] });
    expect(puedeEditarLibro(coord, { captura: "campus", created_by: "yo" }, "yo")).toBe(true);
    expect(puedeEditarLibro(coord, { captura: "campus", created_by: "otro" }, "yo")).toBe(false);
    expect(puedeEditarLibro(coord, { captura: "multicampus", created_by: "yo" }, "yo")).toBe(false);
    expect(puedeEditarLibro(yo({ planeacion: true }), { captura: "oficina", created_by: "otro" }, "yo")).toBe(true);
    expect(puedeEditarLibro(yo({ coordinador: [BUC] }), { captura: "multicampus", created_by: "otro" }, "yo")).toBe(true);
  });

  it("Planeación ve el módulo sin pertenecer a él", () => {
    expect(esMiembro(yo({ planeacion: true }))).toBe(true);
    expect(esMiembro(yo({}))).toBe(false);
  });
});
