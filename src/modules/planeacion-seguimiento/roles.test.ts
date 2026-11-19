import { describe, expect, it } from "vitest";
import { compile, decompile, templateMatrix } from "../admin/usuarios/role-matrix";
import { psNivelDe } from "../../lib/auth";
import { MODULES } from "../admin/launcher/portales";
import type { Profile } from "../../types/database";

const perfil = (role: string) => ({ is_active: true, role }) as unknown as Profile;
const acceso = (screens: string[], ps_nivel?: string, all = false) => ({ role: { screens, all_screens: all, ps_nivel } }) as never;

describe("nivel de Planeación y Seguimiento", () => {
  it("la administración general entra como admin; la capacidad de Planeación no basta", () => {
    expect(psNivelDe(perfil("admin"), null)).toBe("admin");
    expect(psNivelDe(perfil("planeacion"), null)).toBe("none");
    expect(psNivelDe(perfil("planeacion"), acceso(["warehouse"], "gestor"))).toBe("none");
  });
  it("con la pantalla marcada vale el nivel del rol", () => {
    expect(psNivelDe(perfil("consulta"), acceso(["planeacion_seguimiento"], "lector"))).toBe("lector");
    expect(psNivelDe(perfil("consulta"), acceso(["planeacion_seguimiento"]))).toBe("none");
    expect(psNivelDe(perfil("consulta"), acceso([], "aprobador", true))).toBe("aprobador");
  });
  it("la matriz de roles guarda y recupera ps_nivel", () => {
    const m = templateMatrix("consulta");
    m.modules["planeacion-seguimiento"] = { level: "ver", screens: ["planeacion_seguimiento"] };
    m.ps.nivel = "gestor";
    const cols = compile(m);
    expect(cols.ps_nivel).toBe("gestor");
    expect(cols.screens.includes("planeacion_seguimiento") || cols.all_screens).toBe(true);
    expect(decompile({ ...cols }, []).ps.nivel).toBe("gestor");
    m.modules["planeacion-seguimiento"] = { level: "none", screens: [] };
    expect(compile(m).ps_nivel).toBe("none");
  });
  it("el lanzador tiene la carpeta con su portal", () => {
    const meta = (MODULES as Record<string, { sections: (c: unknown) => { cards: { to: string }[] }[] }>)["planeacion-seguimiento"];
    const rutas = meta.sections({}).flatMap((s) => s.cards.map((c) => c.to));
    expect(rutas).toContain("/admin/planeacion-seguimiento/resumen");
    expect(rutas.every((r) => r.startsWith("/admin/planeacion-seguimiento"))).toBe(true);
  });
});
