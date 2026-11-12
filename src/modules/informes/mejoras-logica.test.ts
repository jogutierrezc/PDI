import { describe, expect, it } from "vitest";
import { LETRAS, PLANTILLAS, conEvidencia, plantillasAbribles, registrarEstructuras } from "./plantillas";
import { clavesInactivas, estructuraDe } from "./secciones-config";
import { hayAsignados, moverSeccion, normalizarSecciones, plantillaPermitida, plantillasDeUnidad, quienEscribe, seccionesIniciales, unidadesDePlantilla, validarEstructura } from "./mejoras-logica";
import type { EstructuraRow, ResponsableRow, SeccionConfigRow, SeccionEstructuraJson } from "./types";

const SECCIONES: SeccionEstructuraJson[] = [
  { titulo: "Resumen", tipo: "narr", minimo: 25 },
  { titulo: "Alineación estratégica", tipo: "pdi" },
  { titulo: "Resultados y evidencias", tipo: "dim", dims: ["inv"] },
  { titulo: "Evidencias y fuentes de verificación", tipo: "evid" },
  { titulo: "Anexos", tipo: "anexos" },
];
const fila = (p: Partial<EstructuraRow> = {}): EstructuraRow => ({ plantilla: "X1", nombre: "Planeación Institucional", quien: "Planeación", destino: "Rectoría", descripcion: "", base: null, secciones: SECCIONES, activa: true, ...p });

describe("Evidencias y fuentes de verificación en toda estructura", () => {
  it("las cuatro plantillas del código la traen, sin mover las claves que ya existían", () => {
    for (const id of ["A", "B", "C", "D"]) expect(PLANTILLAS[id].secciones.some((s) => s.tipo === "evid")).toBe(true);
    expect(PLANTILLAS.C.secciones.find((s) => s.titulo === "Anexos")?.clave).toBe("s8");
    expect(PLANTILLAS.D.secciones.find((s) => s.titulo === "Anexos")?.clave).toBe("s8");
    expect(PLANTILLAS.C.secciones.find((s) => s.tipo === "evid")?.clave).toBe("s9");
  });

  it("va antes de los anexos y, si ya existe, no se duplica", () => {
    const c = PLANTILLAS.C.secciones;
    expect(c.findIndex((s) => s.tipo === "evid")).toBe(c.findIndex((s) => s.tipo === "anexos") - 1);
    expect(conEvidencia(c)).toBe(c);
  });

  it("una estructura sin la sección la recibe al registrarla", () => {
    registrarEstructuras([fila({ secciones: SECCIONES.filter((s) => s.tipo !== "evid") })]);
    expect(PLANTILLAS.X1.secciones.some((s) => s.tipo === "evid")).toBe(true);
    registrarEstructuras([]);
  });

  it("Planeación no la puede desactivar: sigue activa aunque la configuración diga que no", () => {
    const clave = PLANTILLAS.A.secciones.find((s) => s.tipo === "evid")!.clave;
    const config = [{ ciclo_id: "c", plantilla: "A", clave, activa: false, orden: null, titulo: null, editable_por_unidad: true, libre: false, minimo: null }] as SeccionConfigRow[];
    expect(estructuraDe("A", config).find((e) => e.def.clave === clave)?.activa).toBe(true);
    expect(clavesInactivas("A", config).has(clave)).toBe(false);
  });
});

describe("Estructuras propias en el registro de plantillas", () => {
  it("se suman a A–D, con claves s1, s2… por posición", () => {
    registrarEstructuras([fila(), fila({ plantilla: "X2", nombre: "Oficina de Bienestar", activa: false })]);
    expect(LETRAS).toEqual(["A", "B", "C", "D", "X1", "X2"]);
    expect(PLANTILLAS.X1.propia).toBe(true);
    expect(PLANTILLAS.X1.secciones.map((s) => s.clave)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(PLANTILLAS.X1.secciones[2]).toMatchObject({ tipo: "dim", dims: ["inv"] });
  });

  it("una desactivada no se ofrece para informes nuevos, pero sigue conocida", () => {
    expect(plantillasAbribles()).toEqual(["A", "B", "C", "D", "X1"]);
    expect("X2" in PLANTILLAS).toBe(true);
    registrarEstructuras([]);
  });

  it("registrar de nuevo reemplaza las propias y nunca toca A–D", () => {
    registrarEstructuras([fila()]);
    registrarEstructuras([fila({ plantilla: "X3" })]);
    expect(LETRAS).toEqual(["A", "B", "C", "D", "X3"]);
    expect("X1" in PLANTILLAS).toBe(false);
    // Una estructura que aún no se cargó se lee como la A en vez de romper la pantalla.
    expect(PLANTILLAS.X1.nombre).toBe("Plantilla A");
    registrarEstructuras([fila({ plantilla: "A", nombre: "No debe pisarla" })]);
    expect(PLANTILLAS.A.nombre).toBe("Plantilla A");
    registrarEstructuras([]);
    expect(LETRAS).toEqual(["A", "B", "C", "D"]);
  });
});

describe("Qué oficinas usan cada plantilla", () => {
  const filas = [{ plantilla: "X1", unit_id: "u1" }, { plantilla: "X1", unit_id: "u2" }];
  it("sin filas la usan todas; con filas, solo las listadas", () => {
    expect(plantillaPermitida(filas, "B", "u9")).toBe(true);
    expect(plantillaPermitida(filas, "X1", "u1")).toBe(true);
    expect(plantillaPermitida(filas, "X1", "u9")).toBe(false);
    expect(unidadesDePlantilla(filas, "X1")).toEqual(["u1", "u2"]);
  });
  it("las plantillas que una unidad puede abrir", () => {
    expect(plantillasDeUnidad(filas, "u9", ["A", "B", "X1"])).toEqual(["A", "B"]);
    expect(plantillasDeUnidad(filas, "u2", ["A", "B", "X1"])).toEqual(["A", "B", "X1"]);
  });
});

describe("Validar y armar una estructura", () => {
  it("una estructura completa no tiene faltas", () => {
    expect(validarEstructura("Planeación Institucional", SECCIONES)).toEqual([]);
  });
  it("pide nombre, evidencias, título, dimensiones y columnas", () => {
    expect(validarEstructura("ab", SECCIONES)).toContain("Ponga un nombre de al menos 3 letras.");
    expect(validarEstructura("Algo", SECCIONES.filter((s) => s.tipo !== "evid")).join(" ")).toMatch(/Evidencias y fuentes de verificación/);
    expect(validarEstructura("Algo", [{ titulo: " ", tipo: "narr" }, ...SECCIONES]).join(" ")).toMatch(/necesita un título/);
    expect(validarEstructura("Algo", [{ titulo: "R", tipo: "dim", dims: [] }, ...SECCIONES]).join(" ")).toMatch(/dimensión/);
    expect(validarEstructura("Algo", [{ titulo: "T", tipo: "filas" }, ...SECCIONES]).join(" ")).toMatch(/columna/);
  });
  it("normalizar agrega las evidencias y deja los anexos al final", () => {
    const sin = normalizarSecciones([{ titulo: "Anexos", tipo: "anexos" }, { titulo: "Resumen", tipo: "narr" }]);
    expect(sin.map((s) => s.tipo)).toEqual(["narr", "evid", "anexos"]);
  });
  it("mover una sección no pasa los anexos ni sale de la lista", () => {
    expect(moverSeccion(SECCIONES, 0, 1).map((s) => s.titulo).slice(0, 2)).toEqual(["Alineación estratégica", "Resumen"]);
    expect(moverSeccion(SECCIONES, 0, -1)).toBe(SECCIONES);
    expect(moverSeccion(SECCIONES, 3, 1)).toBe(SECCIONES);
  });
  it("una estructura nueva copia una plantilla o parte de una base con evidencias", () => {
    expect(seccionesIniciales("B").some((s) => s.tipo === "evid")).toBe(true);
    expect(seccionesIniciales("").some((s) => s.tipo === "evid")).toBe(true);
    expect(validarEstructura("Una nueva", seccionesIniciales("C"))).toEqual([]);
  });
});

describe("Responsables", () => {
  const r = (rol: ResponsableRow["rol"], asignado = false): ResponsableRow => ({ profile_id: rol, nombre: rol, correo: "", rol, asignado, asignado_en: null });
  it("escriben el informe el Gestor y el Contribuyente; la Consulta solo ve", () => {
    expect(quienEscribe([r("jefe"), r("editor"), r("visor")]).map((x) => x.rol)).toEqual(["jefe", "editor"]);
  });
  it("hay algo que restablecer solo si alguien fue asignado desde Informes", () => {
    expect(hayAsignados([r("jefe"), r("editor")])).toBe(false);
    expect(hayAsignados([r("jefe"), r("editor", true)])).toBe(true);
  });
});
