import { describe, expect, it } from "vitest";
import type { Actividad } from "./modelo";
import { SIN_AVANCE } from "./modeloF3";
import { MAX_BYTES_EVIDENCIA, avanceVencido, estadoTrasValidar, horasEsperando, leerDias, puedeCerrar, puedeReportar, puedeValidar, rutaDeMovimiento, sha256Hex, validarArchivo, validarAvance, validarConfigAvisos, validarEvidencia, validarLote, validarNotaRevision, validarPdi } from "./reglasF3";

const act = (o: Partial<Pick<Actividad, "estado" | "asignados" | "avance">> = {}) => ({ estado: "en_curso" as const, asignados: ["u-yo"], avance: { ...SIN_AVANCE }, ...o });
const ok = { fecha: "2027-06-30", fisico: 40, financiero: null, nota: "Se avanzó con el cronograma.", evidencias: [], riesgo: null };

describe("quién reporta", () => {
  it("el colaborador solo lo asignado; el gestor cualquiera; el lector nada", () => {
    expect(puedeReportar("colaborador", act(), "u-yo").ok).toBe(true);
    expect(puedeReportar("colaborador", act({ asignados: ["otro"] }), "u-yo").ok).toBe(false);
    expect(puedeReportar("gestor", act({ asignados: [] }), "u-yo").ok).toBe(true);
    expect(puedeReportar("lector", act(), "u-yo").ok).toBe(false);
  });
  it("no sobre lo «Hecho» ni con un avance esperando", () => {
    expect(puedeReportar("gestor", act({ estado: "hecho" }), "u-yo").ok).toBe(false);
    expect(puedeReportar("gestor", act({ avance: { ...SIN_AVANCE, pendientes: 1 } }), "u-yo").ok).toBe(false);
  });
});

describe("quién valida", () => {
  const c = { poder: "gestor" as const, esAdmin: false, yo: "g1", autorId: "c1", autorEsGestor: false };
  it("el gestor valida a un colaborador", () => expect(puedeValidar(c).ok).toBe(true));
  it("nadie valida lo propio", () => expect(puedeValidar({ ...c, autorId: "g1" }).ok).toBe(false));
  it("el avance de un gestor lo valida un administrador", () => {
    expect(puedeValidar({ ...c, autorEsGestor: true }).ok).toBe(false);
    expect(puedeValidar({ ...c, autorEsGestor: true, esAdmin: true }).ok).toBe(true);
  });
  it("el colaborador no valida; el cierre es del gestor", () => {
    expect(puedeValidar({ ...c, poder: "colaborador" }).ok).toBe(false);
    expect(puedeCerrar("gestor")).toBe(true);
    expect(puedeCerrar("colaborador")).toBe(false);
  });
});

describe("validar el reporte", () => {
  const ctx = { hoy: "2027-06-30", ultimoValidado: 30 };
  it("uno correcto no tiene errores", () => expect(validarAvance(ok, ctx)).toEqual([]));
  it("monotonía: no puede bajar del último validado", () => {
    expect(validarAvance({ ...ok, fisico: 29 }, ctx)[0].mensaje).toMatch(/no puede bajar/);
    expect(validarAvance({ ...ok, fisico: 30 }, ctx)).toEqual([]);
  });
  it("físico y financiero entre 0 y 100", () => {
    expect(validarAvance({ ...ok, fisico: 101 }, ctx)[0].campo).toBe("av-fisico");
    expect(validarAvance({ ...ok, fisico: NaN }, ctx)[0].campo).toBe("av-fisico");
    expect(validarAvance({ ...ok, financiero: 120 }, ctx)[0].campo).toBe("av-financiero");
    expect(validarAvance({ ...ok, financiero: 0 }, ctx)).toEqual([]);
  });
  it("fecha no futura y nota de al menos 10", () => {
    expect(validarAvance({ ...ok, fecha: "2027-07-01" }, ctx)[0].campo).toBe("av-fecha");
    expect(validarAvance({ ...ok, nota: "corto" }, ctx)[0].campo).toBe("av-nota");
  });
  it("máximo 10 evidencias y el riesgo se valida", () => {
    const ev = Array.from({ length: 11 }, (_, i) => ({ tipo: "enlace" as const, nombre: `e${i}`, url: "https://x.org" }));
    expect(validarAvance({ ...ok, evidencias: ev }, ctx).some((e) => e.campo === "av-evidencias")).toBe(true);
    expect(validarAvance({ ...ok, riesgo: { titulo: "ab", descripcion: "", nivel: "Alto", mitigacion: "" } }, ctx)[0].paso).toBe("riesgos");
  });
});

describe("evidencias", () => {
  it("tipos permitidos y mime coherente", () => {
    expect(validarArchivo({ name: "informe.pdf", size: 1000, type: "application/pdf" })).toBeNull();
    expect(validarArchivo({ name: "informe.pdf", size: 1000, type: "" })).toBeNull();
    expect(validarArchivo({ name: "virus.exe", size: 1000, type: "application/x-msdownload" })).toMatch(/no está permitido/);
    expect(validarArchivo({ name: "a.pdf", size: 1000, type: "image/png" })).toMatch(/no coincide/);
  });
  it("hasta 20 MB y no vacío", () => {
    expect(validarArchivo({ name: "a.zip", size: MAX_BYTES_EVIDENCIA, type: "application/zip" })).toBeNull();
    expect(validarArchivo({ name: "a.zip", size: MAX_BYTES_EVIDENCIA + 1, type: "application/zip" })).toMatch(/máximo/);
    expect(validarArchivo({ name: "a.txt", size: 0, type: "text/plain" })).toMatch(/vacío/);
  });
  it("el enlace solo http o https", () => {
    expect(validarEvidencia({ tipo: "enlace", nombre: "Acta", url: "https://x.org/a" })).toBeNull();
    expect(validarEvidencia({ tipo: "enlace", nombre: "Acta", url: "javascript:alert(1)" })).toMatch(/http/);
    expect(validarEvidencia({ tipo: "enlace", nombre: "Acta", url: "ftp://x.org" })).toMatch(/http/);
  });
  it("sha256 conocido", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("revisión, plazo y movimientos", () => {
  it("devolver pide 20 caracteres; el lote hasta 50", () => {
    expect(validarNotaRevision("corta")).not.toBeNull();
    expect(validarNotaRevision("Falta adjuntar el acta firmada.")).toBeNull();
    expect(validarLote([])).not.toBeNull();
    expect(validarLote(Array.from({ length: 51 }, (_, i) => String(i)))).toMatch(/50/);
    expect(validarLote(Array.from({ length: 50 }, (_, i) => String(i)))).toBeNull();
  });
  it("plazo de validación", () => {
    expect(horasEsperando("2027-06-27T12:00:00Z", "2027-06-30T12:00:00Z")).toBe(72);
    expect(avanceVencido("2027-06-27T12:00:00Z", "2027-06-30T12:00:00Z", 72)).toBe(true);
    expect(avanceVencido("2027-06-28T12:00:00Z", "2027-06-30T12:00:00Z", 72)).toBe(false);
  });
  it("tras validar: 100 % hecho; si no, en curso o en riesgo", () => {
    expect(estadoTrasValidar(100, false)).toBe("hecho");
    expect(estadoTrasValidar(60, false)).toBe("en_curso");
    expect(estadoTrasValidar(60, true)).toBe("en_riesgo");
  });
  it("a dónde lleva mover", () => {
    expect(rutaDeMovimiento("colaborador", act(), "en_revision").tipo).toBe("reportar");
    expect(rutaDeMovimiento("gestor", act(), "hecho").tipo).toBe("cerrar");
    expect(rutaDeMovimiento("gestor", act({ estado: "en_revision", avance: { ...SIN_AVANCE, pendientes: 1 } }), "hecho").tipo).toBe("revisar");
    expect(rutaDeMovimiento("gestor", act({ estado: "en_revision" }), "en_curso").tipo).toBe("devolver");
    expect(rutaDeMovimiento("colaborador", act(), "en_riesgo").tipo).toBe("directo");
  });
});

describe("pdi y plazos", () => {
  it("al crear hay que elegir; con PDI de 1 a 12 sin repetir", () => {
    expect(validarPdi({ conexion: "sin_definir", items: [] }, true)).toHaveLength(1);
    expect(validarPdi({ conexion: "sin_definir", items: [] }, false)).toEqual([]);
    expect(validarPdi({ conexion: "sin_pdi", items: [] }, true)).toEqual([]);
    expect(validarPdi({ conexion: "con_pdi", items: [] }, true)).toHaveLength(1);
    expect(validarPdi({ conexion: "con_pdi", items: [{ pillarId: "p", lineaId: null }, { pillarId: "p", lineaId: null }] }, true)).toHaveLength(1);
    expect(validarPdi({ conexion: "con_pdi", items: Array.from({ length: 13 }, (_, i) => ({ pillarId: "p", lineaId: String(i) })) }, true)).toHaveLength(1);
  });
  it("cotas de los plazos de aviso", () => {
    const c = { diasAntes: [7, 3, 0], vencidaMaxAvisos: 3, vencidaGestorHoras: 48, validarHoras: 72, activo: true };
    expect(validarConfigAvisos(c)).toEqual([]);
    expect(validarConfigAvisos({ ...c, diasAntes: [1, 2, 3, 4, 5, 6, 7] })).toHaveLength(1);
    expect(validarConfigAvisos({ ...c, diasAntes: [61] })).toHaveLength(1);
    expect(validarConfigAvisos({ ...c, vencidaMaxAvisos: 11 })).toHaveLength(1);
    expect(validarConfigAvisos({ ...c, validarHoras: 0 })).toHaveLength(1);
    expect(leerDias("7, 3, 0")).toEqual([7, 3, 0]);
    expect(leerDias("7, x")).toBeNull();
  });
});
