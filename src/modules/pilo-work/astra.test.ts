import { describe, expect, it } from "vitest";
import { ASTRA_NOMBRE, aPublica, astraDisponible, debeAvisar } from "./astra";

const fila = { habilitado: true, roles: ["colaborador", "coordinacion", "admin"], formatos: { xlsx: true }, aviso: true, aviso_visto: false, subida_max_mb: 25, limite_hora: 20 };

describe("Pilo Astra 1.0 · quién puede usarlo", () => {
  it("el nombre público no menciona el modelo", () => {
    expect(ASTRA_NOMBRE).toBe("Pilo Astra 1.0");
  });

  it("entiende la fila del RPC, sola o en lista, y devuelve null si falta", () => {
    expect(aPublica(fila)?.habilitado).toBe(true);
    expect(aPublica([fila])?.roles).toContain("admin");
    expect(aPublica(null)).toBeNull();
    expect(aPublica([])).toBeNull();
  });

  it("un rol incluido y habilitado puede usarlo", () => {
    expect(astraDisponible(aPublica(fila), "colaborador")).toBe(true);
    expect(astraDisponible(aPublica(fila), "admin")).toBe(true);
  });

  it("apagado, sin migración o con un rol no incluido: no", () => {
    expect(astraDisponible(aPublica({ ...fila, habilitado: false }), "colaborador")).toBe(false);
    expect(astraDisponible(null, "colaborador")).toBe(false);
    expect(astraDisponible(aPublica(fila), "colaborador_correo")).toBe(false);
  });

  it("un invitado nunca entra, aunque la lista lo incluyera", () => {
    expect(astraDisponible(aPublica({ ...fila, roles: ["invitado", "colaborador"] }), "invitado")).toBe(false);
  });
});

describe("Pilo Astra 1.0 · el aviso de lanzamiento", () => {
  it("sale a quien puede usarlo y aún no lo ha visto", () => {
    expect(debeAvisar(aPublica(fila), "colaborador", false)).toBe(true);
  });

  it("una sola vez: ya visto en el servidor o en este navegador, no sale", () => {
    expect(debeAvisar(aPublica({ ...fila, aviso_visto: true }), "colaborador", false)).toBe(false);
    expect(debeAvisar(aPublica(fila), "colaborador", true)).toBe(false);
  });

  it("no sale si la administración lo apagó, ni a quien no puede usar Astra", () => {
    expect(debeAvisar(aPublica({ ...fila, aviso: false }), "colaborador", false)).toBe(false);
    expect(debeAvisar(aPublica(fila), "invitado", false)).toBe(false);
    expect(debeAvisar(aPublica({ ...fila, habilitado: false }), "colaborador", false)).toBe(false);
  });
});
