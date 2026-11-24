import { describe, expect, it } from "vitest";
import {
  correoPermitido,
  DOMINIOS_PERMITIDOS,
  ESTADOS,
  LIMITES,
  normalizarAporte,
  recibeAportes,
  TIPOS_CIFRA,
  validarAporte,
  validarEnvio,
} from "../../supabase/functions/encuestas/encuesta";

const cifra = { que: "Estudiantes graduados", tipo: "estudiantes", valor: 120 };
const aporte = () => ({ tipo: "logro", titulo: "Más graduados", descripcion: "Aumentamos la graduación de forma sostenida.", cifras: [{ ...cifra }] });

describe("constantes", () => {
  it("tipos, estados y dominios", () => {
    expect(TIPOS_CIFRA).toEqual(["estudiantes", "programas", "porcentaje", "dinero", "otro"]);
    expect(ESTADOS).toEqual(["recibido", "revisado", "para_video"]);
    expect(DOMINIOS_PERMITIDOS).toContain("mail.udes.edu.co");
    expect(DOMINIOS_PERMITIDOS).toContain("bucaramanga.udes.edu.co");
  });
});

describe("correoPermitido", () => {
  it("acepta los dominios de la UDES y sus subdominios", () => {
    for (const c of ["a@udes.edu.co", "A@Mail.UDES.edu.co", "a@cucuta.udes.edu.co", "a@x.bogota.udes.edu.co"]) expect(correoPermitido(c)).toBe(true);
  });
  it("rechaza otros dominios, parecidos y textos sin forma de correo", () => {
    for (const c of ["a@gmail.com", "a@udes.edu.co.evil.com", "a@fakeudes.edu.co", "udes.edu.co", ""]) expect(correoPermitido(c)).toBe(false);
  });
});

describe("validarAporte", () => {
  it("acepta un aporte válido, con o sin cifras", () => {
    expect(validarAporte(aporte())).toEqual({ ok: true });
    expect(validarAporte({ ...aporte(), cifras: [] })).toEqual({ ok: true });
  });
  it("exige tipo, título y descripción dentro de sus límites", () => {
    expect(validarAporte({ ...aporte(), tipo: "otro" })).toMatchObject({ ok: false, campo: "aportes[1].tipo" });
    expect(validarAporte({ ...aporte(), titulo: "abcd" })).toMatchObject({ ok: false, campo: "aportes[1].titulo" });
    expect(validarAporte({ ...aporte(), titulo: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(validarAporte({ ...aporte(), descripcion: "muy corta" })).toMatchObject({ ok: false, campo: "aportes[1].descripcion" });
    expect(validarAporte({ ...aporte(), descripcion: "x".repeat(501) })).toMatchObject({ ok: false });
    expect(validarAporte({ ...aporte(), descripcion: "x".repeat(500) })).toEqual({ ok: true });
  });
  it("valida las cifras", () => {
    const con = (c: object) => validarAporte({ ...aporte(), cifras: [{ ...cifra, ...c }] });
    expect(con({ que: "a" })).toMatchObject({ ok: false, campo: "aportes[1].cifras[1].que" });
    expect(con({ tipo: "x" })).toMatchObject({ ok: false, campo: "aportes[1].cifras[1].tipo" });
    expect(con({ valor: -1 })).toMatchObject({ ok: false, campo: "aportes[1].cifras[1].valor" });
    expect(con({ valor: Number.NaN })).toMatchObject({ ok: false });
    expect(con({ valor: "12" })).toMatchObject({ ok: false });
    expect(con({ tipo: "porcentaje", valor: 100 })).toEqual({ ok: true });
    expect(con({ tipo: "porcentaje", valor: 100.5 })).toMatchObject({ ok: false });
    expect(con({ valor: 100.5 })).toEqual({ ok: true });
  });
  it("«otro» pide una sola palabra y solo con ese tipo", () => {
    const con = (c: object) => validarAporte({ ...aporte(), cifras: [{ ...cifra, ...c }] });
    expect(con({ tipo: "otro" })).toMatchObject({ ok: false, campo: "aportes[1].cifras[1].otro" });
    expect(con({ tipo: "otro", otro: "becas" })).toEqual({ ok: true });
    expect(con({ tipo: "otro", otro: "dos palabras" })).toMatchObject({ ok: false });
    expect(con({ tipo: "otro", otro: "a" })).toMatchObject({ ok: false });
    expect(con({ tipo: "otro", otro: "x".repeat(21) })).toMatchObject({ ok: false });
    expect(con({ tipo: "otro", otro: "año" })).toEqual({ ok: true });
    expect(con({ otro: "becas" })).toMatchObject({ ok: false });
  });
  it("tope de 12 cifras por aporte", () => {
    const n = (k: number) => validarAporte({ ...aporte(), cifras: Array.from({ length: k }, () => ({ ...cifra })) });
    expect(n(LIMITES.cifrasPorAporte)).toEqual({ ok: true });
    expect(n(LIMITES.cifrasPorAporte + 1)).toMatchObject({ ok: false, campo: "aportes[1].cifras" });
  });
});

describe("validarEnvio", () => {
  it("valida la dependencia y el tope de 30 aportes", () => {
    expect(validarEnvio("Planeación", [aporte()])).toEqual({ ok: true });
    expect(validarEnvio("ab", [aporte()])).toMatchObject({ ok: false, campo: "dependencia" });
    expect(validarEnvio("x".repeat(91), [aporte()])).toMatchObject({ ok: false, campo: "dependencia" });
    expect(validarEnvio("Planeación", [])).toMatchObject({ ok: false, campo: "aportes" });
    expect(validarEnvio("Planeación", Array.from({ length: 30 }, aporte))).toEqual({ ok: true });
    expect(validarEnvio("Planeación", Array.from({ length: 31 }, aporte))).toMatchObject({ ok: false, campo: "aportes" });
  });
  it("señala el aporte que falla", () => {
    expect(validarEnvio("Planeación", [aporte(), { ...aporte(), titulo: "" }])).toMatchObject({ ok: false, campo: "aportes[2].titulo" });
  });
});

describe("normalizarAporte y cierre", () => {
  it("limpia espacios y descarta «otro» si no corresponde", () => {
    const n = normalizarAporte({ tipo: "reto", titulo: "  Un   reto  ", descripcion: " texto ", cifras: [{ que: " Becas ", tipo: "dinero", otro: "x", valor: 5 }] });
    expect(n.titulo).toBe("Un reto");
    expect(n.cifras[0]).toEqual({ que: "Becas", tipo: "dinero", valor: 5 });
  });
  it("recibeAportes respeta abierta y la fecha de cierre", () => {
    expect(recibeAportes({ abierta: true, cierra_el: "2026-11-15" }, "2026-11-15")).toBe(true);
    expect(recibeAportes({ abierta: true, cierra_el: "2026-11-15" }, "2026-11-16")).toBe(false);
    expect(recibeAportes({ abierta: false, cierra_el: null }, "2026-01-01")).toBe(false);
    expect(recibeAportes({ abierta: true, cierra_el: null }, "2030-01-01")).toBe(true);
  });
});
