/* Migración 0153 (Informes Institucionales): RLS (anónimo, ajeno, Consulta,
   Planeación), el ciclo cerrado, el corpus de Pilo, el consolidado de la
   rectoría con sus aportes, y que la migración es idempotente. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorOf, type TestDb } from "../db/harness";
import { abrirFacultad, cifra, enviar, escenario, estado, P, seccion, U, vivas } from "./fixtures";

let t: TestDb;
let ciclo = "";
let fac = "";
let rect = "";

beforeAll(async () => {
  ({ t, ciclo } = await escenario());
  fac = await abrirFacultad(t, ciclo);
  rect = await t.asUser(P.rector, async (q) => (await q<{ id: string }>("select public.informe_abrir($1, $2, 'C') as id", [ciclo, U.rectoria]))[0].id, {
    commit: true,
  });
  await t.asUser(
    P.gestor,
    async (q) => {
      await seccion(q, fac, "s1", true, "La facultad creció.");
      await seccion(q, fac, "s2", true, "Logros del año.");
      await cifra(q, fac, "matric", { fuente_tipo: "auto", justificacion: "Nueva oferta." });
    },
    { commit: true },
  );
}, 180_000);

afterAll(async () => t?.close());

describe("0153 · quién ve qué", () => {
  it("sin sesión no se lee nada", async () => {
    for (const tabla of ["informe_instancias", "informe_secciones", "informe_cifras", "informe_ciclos", "informe_ejemplos"]) {
      expect(await errorOf(t.asUser(null, (q) => q(`select * from public.${tabla}`)))).toMatch(/permission denied/);
    }
    expect(await errorOf(t.asUser(null, (q) => q("select public.informe_cifras_vivas($1)", [fac])))).toMatch(/permission denied/);
  });

  it("un ajeno no ve informes, secciones ni cifras, ni las vivas", async () => {
    await t.asUser(P.ajeno, async (q) => {
      expect(await q("select id from public.informe_instancias")).toEqual([]);
      expect(await q("select id from public.informe_secciones")).toEqual([]);
      expect(await q("select id from public.informe_cifras")).toEqual([]);
      const cambiadas = await q("update public.informe_secciones set listo = false where instancia_id = $1 returning id", [fac]);
      expect(cambiadas).toEqual([]);
    });
    expect(await errorOf(t.asUser(P.ajeno, (q) => vivas(q, fac)))).toMatch(/Sin permiso/);
  });

  it("la Consulta lee su informe pero no escribe", async () => {
    await t.asUser(P.consulta, async (q) => {
      expect(await q("select clave from public.informe_secciones where instancia_id = $1 order by clave", [fac])).toEqual([{ clave: "s1" }, { clave: "s2" }]);
      expect((await vivas(q, fac)).map((v) => v.clave)).toEqual(["matric"]);
    });
    expect(await errorOf(t.asUser(P.consulta, (q) => seccion(q, fac, "s3")))).toMatch(/no es suyo|row-level security/);
    // Enviar tampoco: la política ni siquiera le deja la fila para cambiarla.
    expect(await t.asUser(P.consulta, (q) => q("update public.informe_instancias set estado = 'sent' where id = $1 returning id", [fac]))).toEqual([]);
    expect(await errorOf(t.asUser(P.consulta, (q) => enviar(q, fac)))).toMatch(/Sin permiso/);
  });

  it("Planeación ve todo sin ser de la unidad", async () => {
    await t.asUser(P.planeacion, async (q) => {
      expect((await q("select id from public.informe_instancias order by created_at")).length).toBe(2);
      expect((await q("select id from public.informe_secciones")).length).toBe(2);
    });
  });

  it("ciclos, requisitos y fuentes: los leen las unidades y los escribe Planeación", async () => {
    await t.asUser(P.gestor, async (q) => {
      expect(await q("select anio from public.informe_ciclos")).toEqual([{ anio: 2026 }]);
      expect((await q("select clave from public.informe_fuentes order by clave")).map((r) => r.clave)).toEqual(["matric", "rc"]);
    });
    expect(await errorOf(t.asUser(P.gestor, (q) => q("insert into public.informe_ciclos (anio) values (2027)")))).toMatch(/row-level security/);
    expect(await errorOf(t.asUser(P.gestor, (q) => q("insert into public.informe_fuentes (clave, nombre, tipo, consulta) values ('x', 'x', 'auto', '{\"indicador\":\"x\"}')")))).toMatch(
      /row-level security/,
    );
    await t.asUser(P.planeacion, (q) => q("update public.informe_ciclos set config = config || '{\"limite_propios\": 5}' where id = $1", [ciclo]));
  });
});

describe("0153 · corpus de Pilo", () => {
  it("solo Planeación lee y escribe ejemplos y aprendizaje; el mismo texto no entra dos veces", async () => {
    const ejemplo = "insert into public.informe_ejemplos (origen, anio, plantilla, seccion_tipo, texto) values ('informe2025', 2025, 'A', 'narr', 'En 2025 la facultad…') on conflict (hash) do nothing returning id";
    expect(await errorOf(t.asUser(P.gestor, (q) => q(ejemplo)))).toMatch(/row-level security/);
    expect(await t.asUser(P.gestor, (q) => q("select id from public.informe_ejemplos"))).toEqual([]);
    expect(await errorOf(t.asUser(P.gestor, (q) => q("insert into public.informe_aprendizaje (instancia_id, seccion_clave) values ($1, 's1')", [fac])))).toMatch(
      /row-level security/,
    );
    await t.asUser(P.planeacion, async (q) => {
      expect(await q(ejemplo)).toHaveLength(1);
      expect(await q(ejemplo)).toHaveLength(0);
      await q("insert into public.informe_aprendizaje (instancia_id, seccion_clave, borrador_pilo, final_unidad) values ($1, 's1', 'a', 'b')", [fac]);
    });
  });
});

describe("0153 · ciclo cerrado", () => {
  it("con el ciclo cerrado la unidad no diligencia ni abre; Planeación sí", async () => {
    await t.q("update public.informe_ciclos set estado = 'cerrado' where id = $1", [ciclo]);
    expect(await errorOf(t.asUser(P.gestor, (q) => seccion(q, fac, "s3")))).toMatch(/no es suyo/);
    await t.asUser(P.planeacion, (q) => seccion(q, fac, "s3", true, "Planeación completa"));
    await t.q("update public.informe_ciclos set estado = 'abierto' where id = $1", [ciclo]);
  });
});

describe("0153 · consolidado", () => {
  it("la rectoría ve el estado de lo que le llega, pero no su contenido hasta que se aprueba", async () => {
    await t.asUser(P.rector, async (q) => {
      expect(await q("select unit_id, estado from public.informe_instancias where id = $1", [fac])).toEqual([{ unit_id: U.facultad, estado: "draft" }]);
      expect(await q("select id from public.informe_secciones where instancia_id = $1", [fac])).toEqual([]);
      expect(await q("select * from public.informe_consolidado($1)", [rect])).toEqual([]);
    });
    await t.asUser(P.gestor, (q) => enviar(q, fac), { commit: true });
    expect(await t.asUser(P.rector, (q) => q("select * from public.informe_consolidado($1)", [rect]))).toEqual([]);
  });

  it("aprobado, llegan sus secciones y la cifra de aportes suma su foto", async () => {
    await t.asUser(P.planeacion, (q) => estado(q, fac, "ok"), { commit: true });
    const filas = await t.asUser(P.rector, (q) =>
      q<{ unit_id: string; seccion_clave: string; contenido: { texto: string } }>("select unit_id, seccion_clave, contenido from public.informe_consolidado($1)", [rect]),
    );
    expect(filas.map((f) => [f.unit_id, f.seccion_clave, f.contenido.texto])).toEqual([
      [U.facultad, "s1", "La facultad creció."],
      [U.facultad, "s2", "Logros del año."],
    ]);
    const v = await t.asUser(P.rector, async (q) => {
      await cifra(q, rect, "matric", { fuente_tipo: "aportes" });
      return vivas(q, rect);
    });
    expect(v.map((x) => [x.clave, Number(x.valor), x.fuente])).toEqual([["matric", 1550, "Aportes aprobados"]]);
  });

  it("nadie fuera de la rectoría ni de Planeación pide el consolidado", async () => {
    expect(await errorOf(t.asUser(P.ajeno, (q) => q("select * from public.informe_consolidado($1)", [rect])))).toMatch(/Sin permiso/);
    expect(await errorOf(t.asUser(P.gestor, (q) => q("select * from public.informe_consolidado($1)", [rect])))).toMatch(/Sin permiso/);
    expect((await t.asUser(P.planeacion, (q) => q("select * from public.informe_consolidado($1)", [rect]))).length).toBe(2);
  });
});

describe("0153 · migración", () => {
  it("es idempotente", async () => {
    const antes = await t.q("select count(*)::int as n from public.informe_cifras");
    await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0153_informes_institucionales.sql"), "utf8"));
    expect(await t.q("select count(*)::int as n from public.informe_cifras")).toEqual(antes);
    expect(await t.q("select estado from public.informe_instancias where id = $1", [fac])).toEqual([{ estado: "ok" }]);
  });
});
