/* Migración 0153 (Informes Institucionales) en un Postgres en memoria: cifras
   vivas con la cuenta del portal, quién envía, validaciones de envío, foto
   tomada en el servidor, bloqueo tras enviar, devolver → borrador reactiva las
   cifras, y aprobar. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorOf, type TestDb } from "../db/harness";
import { abrirFacultad, cifra, enviar, escenario, estado, P, seccion, U, vivas } from "./fixtures";

let t: TestDb;
let ciclo = "";
let indicador = "";
let inst = "";

const foto = (clave: string) =>
  t.q<{ foto_valor: string | null; foto_fuente: string | null; foto_en: string | null }>(
    "select foto_valor, foto_fuente, foto_en from public.informe_cifras where instancia_id = $1 and clave = $2",
    [inst, clave],
  );
const estadoActual = async () => (await t.q<{ estado: string }>("select estado from public.informe_instancias where id = $1", [inst]))[0].estado;

beforeAll(async () => {
  ({ t, ciclo, indicador } = await escenario());
  inst = await abrirFacultad(t, ciclo);
}, 180_000);

afterAll(async () => t?.close());

describe("0153 · abrir", () => {
  it("el Gestor abre el informe; abrirlo otra vez devuelve el mismo; la Consulta y un ajeno no abren", async () => {
    const [r] = await t.q<{ estado: string; plantilla: string; destino: string }>("select estado, plantilla, destino from public.informe_instancias where id = $1", [inst]);
    expect(r).toEqual({ estado: "draft", plantilla: "A", destino: U.rectoria });
    const otra = await t.asUser(P.contribuyente, async (q) => (await q<{ id: string }>("select public.informe_abrir($1, $2, 'A') as id", [ciclo, U.facultad]))[0].id);
    expect(otra).toBe(inst);
    expect(await errorOf(t.asUser(P.ajeno, (q) => q("select public.informe_abrir($1, $2, 'A')", [ciclo, U.rectoria])))).toMatch(/Sin permiso/);
    expect(await errorOf(t.asUser(P.consulta, (q) => q("select public.informe_abrir($1, $2, 'C')", [ciclo, U.rectoria])))).toMatch(/Sin permiso/);
  });

  it("una unidad no abre ni empieza fuera de borrador; Planeación sí", async () => {
    expect(
      await errorOf(t.asUser(P.rector, (q) => q("insert into public.informe_instancias (ciclo_id, unit_id, plantilla, estado) values ($1, $2, 'C', 'ok')", [ciclo, U.rectoria]))),
    ).toMatch(/empieza en borrador/);
    await t.asUser(P.planeacion, (q) => q("insert into public.informe_instancias (ciclo_id, unit_id, plantilla, estado) values ($1, $2, 'C', 'ok')", [ciclo, U.rectoria]));
  });
});

describe("0153 · cifras vivas", () => {
  beforeAll(async () => {
    await t.asUser(
      P.contribuyente,
      async (q) => {
        await cifra(q, inst, "matric", { fuente_tipo: "auto", etiqueta: "Matrícula total", seccion_clave: "s4" });
        await cifra(q, inst, "matric_buc", { fuente_tipo: "auto", fuente_clave: "matric", consulta: { sede: "bucaramanga" }, seccion_clave: "s4" });
        await cifra(q, inst, "rc", { fuente_tipo: "pdi", seccion_clave: "s4" });
        await cifra(q, inst, "movi", { fuente_tipo: "manual", valor: 38, etiqueta: "Estudiantes en movilidad", seccion_clave: "s4" });
      },
      { commit: true },
    );
  });

  it("lee lo mismo que el portal: total de las sedes con la regla «ultimo», la sede pedida, el PDI y el dato propio", async () => {
    const v = await t.asUser(P.consulta, (q) => vivas(q, inst));
    expect(v.map((x) => [x.clave, x.valor === null ? null : Number(x.valor)])).toEqual([
      ["matric", 1550],
      ["matric_buc", 1100],
      ["movi", 38],
      ["rc", 18],
    ]);
    expect(v.find((x) => x.clave === "matric")!.fuente).toBe("UDES en Cifras · Matrícula total · 2020-2026");
    expect(v.find((x) => x.clave === "rc")!.fuente).toMatch(/^PDI · EN3/);
  });

  it("si falta una sede no hay total, y una cifra viva no guarda valor", async () => {
    const r = await t.asUser(P.contribuyente, (q) => cifra(q, inst, "rc", { valor: 99 }));
    expect(r.valor).toBeNull();
    await t.q("delete from public.od_values where indicator_id = $1 and term = 'B' and campus_id = (select id from public.campuses where slug = 'cucuta')", [indicador]);
    const sinSede = await t.asUser(P.planeacion, async (q) => (await vivas(q, inst)).find((x) => x.clave === "matric")!.valor);
    // Sin la B de Cúcuta el total de B no existe; «ultimo» toma la A: 1000 + 400.
    expect(Number(sinSede)).toBe(1400);
  });

  it("el límite de datos propios por sección lo fija el ciclo", async () => {
    await t.asUser(
      P.contribuyente,
      async (q) => {
        await cifra(q, inst, "p2", { fuente_tipo: "excel", valor: 1, fuente_nombre: "Hoja propia", seccion_clave: "s4" });
        await cifra(q, inst, "p3", { fuente_tipo: "url", valor: 2, fuente_nombre: "Sitio", seccion_clave: "s4" });
      },
      { commit: true },
    );
    const p4 = (seccionClave: string) =>
      t.asUser(P.contribuyente, (q) => cifra(q, inst, "p4", { fuente_tipo: "manual", valor: 3, fuente_nombre: "X", seccion_clave: seccionClave }));
    expect(await errorOf(p4("s4"))).toMatch(/Esta sección ya tiene 3 datos propios/);
    // En otra sección sí cabe.
    expect((await p4("s5")).propia).toBe(true);
  });
});

describe("0153 · enviar", () => {
  it("el Contribuyente no envía", async () => {
    await t.asUser(P.contribuyente, (q) => seccion(q, inst, "s1"), { commit: true });
    expect(await errorOf(t.asUser(P.contribuyente, (q) => enviar(q, inst)))).toMatch(/no permitido: draft → sent \(editor\)/);
  });

  it("no se envía con secciones sin terminar, datos propios sin fuente ni cifras pedidas sin justificar", async () => {
    await t.asUser(P.gestor, (q) => seccion(q, inst, "s2", false), { commit: true });
    expect(await errorOf(t.asUser(P.gestor, (q) => enviar(q, inst)))).toMatch(/Faltan secciones por terminar: s2/);
    await t.asUser(P.gestor, (q) => seccion(q, inst, "s2", true), { commit: true });
    expect(await errorOf(t.asUser(P.gestor, (q) => enviar(q, inst)))).toMatch(/Falta el nombre de la fuente en: movi/);
    await t.asUser(P.gestor, (q) => cifra(q, inst, "movi", { fuente_nombre: "Oficina de Internacionalización" }), { commit: true });
    expect(await errorOf(t.asUser(P.gestor, (q) => enviar(q, inst)))).toMatch(/Falta justificar .*matric/);
    await t.asUser(P.gestor, (q) => cifra(q, inst, "matric", { justificacion: "Creció por la nueva oferta virtual." }), { commit: true });
    // Con la cifra pedida excluida tampoco: va bloqueada.
    await t.asUser(P.gestor, (q) => cifra(q, inst, "matric", { incluida: false }), { commit: true });
    expect(await errorOf(t.asUser(P.gestor, (q) => enviar(q, inst)))).toMatch(/Falta justificar/);
    await t.asUser(P.gestor, (q) => cifra(q, inst, "matric", { incluida: true }), { commit: true });
    expect(await estadoActual()).toBe("draft");
  });

  it("el Gestor envía y el servidor toma la foto de cada cifra", async () => {
    const r = await t.asUser(P.gestor, (q) => enviar(q, inst), { commit: true });
    expect(r).toMatchObject({ estado: "sent", enviado_por: P.gestor });
    expect(r.enviado_en).not.toBeNull();
    const [m] = await foto("matric");
    expect(Number(m.foto_valor)).toBe(1400);
    expect(m.foto_fuente).toBe("UDES en Cifras · Matrícula total · 2020-2026");
    expect(m.foto_en).not.toBeNull();
    expect(Number((await foto("movi"))[0].foto_valor)).toBe(38);
    expect((await foto("movi"))[0].foto_fuente).toBe("Oficina de Internacionalización");
    expect(Number((await foto("rc"))[0].foto_valor)).toBe(18);
  });

  it("enviado, la fuente puede cambiar pero la foto no", async () => {
    await t.q("update public.od_values set value = 2000 where indicator_id = $1 and term = 'A' and campus_id = (select id from public.campuses where slug = 'bucaramanga')", [
      indicador,
    ]);
    const v = await t.asUser(P.gestor, (q) => vivas(q, inst));
    expect(Number(v.find((x) => x.clave === "matric")!.valor)).toBe(2400);
    expect(Number((await foto("matric"))[0].foto_valor)).toBe(1400);
  });

  it("enviado, la unidad ya no lo cambia (ni secciones, ni cifras, ni anexos, ni el estado); Planeación sí", async () => {
    expect(await errorOf(t.asUser(P.contribuyente, (q) => seccion(q, inst, "s1")))).toMatch(/ya se envió/);
    expect(await errorOf(t.asUser(P.gestor, (q) => cifra(q, inst, "movi", { valor: 40 })))).toMatch(/ya se envió|Sin permiso/);
    expect(
      await errorOf(t.asUser(P.gestor, (q) => q("insert into public.informe_anexos (instancia_id, n, tipo, ruta) values ($1, 1, 'url', 'https://udes.edu.co')", [inst]))),
    ).toMatch(/ya se envió/);
    const cambiadas = await t.asUser(P.gestor, (q) => q("update public.informe_cifras set valor = 1 where instancia_id = $1 returning id", [inst]));
    expect(cambiadas).toEqual([]);
    expect(await errorOf(t.asUser(P.gestor, (q) => estado(q, inst, "ok")))).toMatch(/ya se envió/);
    expect(await errorOf(t.asUser(P.gestor, (q) => enviar(q, inst)))).toMatch(/borrador o devuelto/);
    await t.asUser(P.planeacion, (q) => seccion(q, inst, "s1", true, "Corregido por Planeación"));
  });
});

describe("0153 · devolver, reactivar y aprobar", () => {
  it("devolver pide nota, deja la revisión y borra la foto", async () => {
    expect(await errorOf(t.asUser(P.planeacion, (q) => estado(q, inst, "back")))).toMatch(/escriba la nota/);
    const r = await t.asUser(P.planeacion, (q) => estado(q, inst, "back", "Falta la fuente de la retención."), { commit: true });
    expect(r).toMatchObject({ estado: "back", nota_revision: "Falta la fuente de la retención." });
    expect(await t.q("select decision, nota, por from public.informe_revisiones where instancia_id = $1", [inst])).toEqual([
      { decision: "devuelto", nota: "Falta la fuente de la retención.", por: P.planeacion },
    ]);
    expect(await foto("matric")).toEqual([{ foto_valor: null, foto_fuente: null, foto_en: null }]);
  });

  it("la unidad no cambia la nota; al tocarlo vuelve a borrador y las cifras vuelven a ser vivas", async () => {
    expect(await errorOf(t.asUser(P.gestor, (q) => q("update public.informe_instancias set nota_revision = '' where id = $1", [inst])))).toMatch(/Solo Planeación/);
    await t.asUser(P.contribuyente, (q) => seccion(q, inst, "s3"), { commit: true });
    expect(await estadoActual()).toBe("draft");
    const v = await t.asUser(P.contribuyente, (q) => vivas(q, inst));
    expect(Number(v.find((x) => x.clave === "matric")!.valor)).toBe(2400);
  });

  it("back → draft también con informe_cambiar_estado; y el reenvío toma una foto nueva", async () => {
    await t.asUser(P.gestor, (q) => enviar(q, inst), { commit: true });
    await t.asUser(P.planeacion, (q) => estado(q, inst, "back", "Otra vez"), { commit: true });
    expect(await errorOf(t.asUser(P.consulta, (q) => estado(q, inst, "draft")))).toMatch(/no tiene permiso/);
    await t.asUser(P.contribuyente, (q) => estado(q, inst, "draft"), { commit: true });
    expect(await estadoActual()).toBe("draft");
    await t.asUser(P.gestor, (q) => enviar(q, inst), { commit: true });
    // Enviar desde devuelto también vale (pasa por borrador).
    await t.asUser(P.planeacion, (q) => estado(q, inst, "back", "Revise"), { commit: true });
    await t.asUser(P.gestor, (q) => enviar(q, inst), { commit: true });
    expect(await estadoActual()).toBe("sent");
    expect(Number((await foto("matric"))[0].foto_valor)).toBe(2400);
  });

  it("transiciones inválidas", async () => {
    expect(await errorOf(t.asUser(P.planeacion, (q) => estado(q, inst, "sent")))).toMatch(/no válido/);
    expect(await errorOf(t.asUser(P.planeacion, (q) => estado(q, inst, "draft")))).toMatch(/no permitido: sent → draft/);
    expect(await errorOf(t.asUser(P.planeacion, (q) => q("update public.informe_instancias set estado = 'borrador' where id = $1", [inst])))).toMatch(/check|estado/);
  });

  it("Planeación aprueba; aprobado queda congelado y solo Planeación lo devuelve", async () => {
    const r = await t.asUser(P.planeacion, (q) => estado(q, inst, "ok", "Bien"), { commit: true });
    expect(r).toMatchObject({ estado: "ok", aprobado_por: P.planeacion });
    expect(await errorOf(t.asUser(P.gestor, (q) => estado(q, inst, "back", "Quiero corregir")))).toMatch(/ya se envió/);
    expect(await errorOf(t.asUser(P.contribuyente, (q) => cifra(q, inst, "movi", { valor: 1 })))).toMatch(/ya se envió|Sin permiso/);
    await t.asUser(P.planeacion, async (q) => {
      const back = await estado(q, inst, "back", "Reabrir");
      expect(back).toMatchObject({ estado: "back", aprobado_en: null });
    });
    expect(await estadoActual()).toBe("ok");
  });
});
