import { describe, expect, it } from "vitest";
import { aplanar, armarArbol, carpetaVacia, conDescendientes, librosDe, librosEnRama, nombreCarpetaValido, puedeCrearDentro, puedeMoverCarpeta, rutaDe } from "./carpetas";

const c = (id: string, nombre: string, parent_id: string | null = null) => ({ id, nombre, parent_id });
const carpetas = [c("mov", "Movilidad"), c("sal", "Saliente", "mov"), c("sal26", "2026", "sal"), c("conv", "Convenios"), c("ent", "Entrante", "mov")];

describe("carpetas con subcarpetas", () => {
  it("arma el árbol ordenado por nombre y da el nivel de cada una", () => {
    const arbol = armarArbol(carpetas);
    expect(arbol.map((n) => n.carpeta.id)).toEqual(["conv", "mov"]);
    expect(aplanar(arbol).map((x) => `${x.nivel}:${x.carpeta.id}`)).toEqual(["1:conv", "1:mov", "2:ent", "2:sal", "3:sal26"]);
  });

  it("una carpeta cuyo padre no existe cuelga de la raíz", () => {
    expect(armarArbol([c("x", "Huérfana", "borrada")]).map((n) => n.carpeta.id)).toEqual(["x"]);
  });

  it("la ruta va de la raíz a la carpeta; sin carpeta o desconocida, vacía", () => {
    expect(rutaDe(carpetas, "sal26").map((x) => x.nombre)).toEqual(["Movilidad", "Saliente", "2026"]);
    expect(rutaDe(carpetas, null)).toEqual([]);
    expect(rutaDe(carpetas, "no-existe")).toEqual([]);
  });

  it("incluye a todas las descendientes", () => {
    expect(conDescendientes(carpetas, "mov").sort()).toEqual(["ent", "mov", "sal", "sal26"]);
    expect(conDescendientes(carpetas, "conv")).toEqual(["conv"]);
  });

  it("no deja mover una carpeta dentro de sí misma ni de sus subcarpetas", () => {
    expect(puedeMoverCarpeta(carpetas, "mov", "sal26")).toBe(false);
    expect(puedeMoverCarpeta(carpetas, "mov", "mov")).toBe(false);
    expect(puedeMoverCarpeta(carpetas, "sal", "conv")).toBe(true);
    expect(puedeMoverCarpeta(carpetas, "sal", null)).toBe(true);
  });

  it("respeta los 5 niveles al mover y al crear", () => {
    const hondas = [c("a", "A"), c("b", "B", "a"), c("c", "C", "b"), c("d", "D", "c"), c("e", "E", "d")];
    expect(puedeCrearDentro(hondas, "e")).toBe(false);
    expect(puedeCrearDentro(hondas, "d")).toBe(true);
    expect(puedeCrearDentro(hondas, null)).toBe(true);
    // «m» tiene 2 niveles de rama: no cabe bajo «d» (nivel 4) pero sí bajo «c» (nivel 3)
    const rama = [...hondas, c("m", "M"), c("m2", "M2", "m")];
    expect(puedeMoverCarpeta(rama, "m", "d")).toBe(false);
    expect(puedeMoverCarpeta(rama, "m", "c")).toBe(true);
  });

  it("separa las tablas de una carpeta, de su rama y las «sin carpeta»", () => {
    const libros = [
      { id: "l1", carpeta_id: "mov" },
      { id: "l2", carpeta_id: "sal26" },
      { id: "l3", carpeta_id: null },
    ];
    expect(librosDe(libros, "mov").map((l) => l.id)).toEqual(["l1"]);
    expect(librosDe(libros, null).map((l) => l.id)).toEqual(["l3"]);
    expect(librosEnRama(libros, carpetas, "mov").map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("solo una carpeta sin tablas ni subcarpetas está vacía", () => {
    const libros = [{ id: "l1", carpeta_id: "conv" }];
    expect(carpetaVacia(libros, carpetas, "conv")).toBe(false);
    expect(carpetaVacia(libros, carpetas, "mov")).toBe(false);
    expect(carpetaVacia(libros, carpetas, "ent")).toBe(true);
  });

  it("valida el nombre: limpia espacios y rechaza vacíos y repetidos entre hermanas", () => {
    expect(nombreCarpetaValido(carpetas, null, "  Rankings   y  CNA ")).toBe("Rankings y CNA");
    expect(nombreCarpetaValido(carpetas, null, "   ")).toBeNull();
    expect(nombreCarpetaValido(carpetas, null, "movilidad")).toBeNull();
    expect(nombreCarpetaValido(carpetas, "mov", "movilidad")).toBe("movilidad");
    expect(nombreCarpetaValido(carpetas, null, "Movilidad", "mov")).toBe("Movilidad");
  });
});
