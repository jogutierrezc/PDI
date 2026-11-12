/* Migración 0279 (Informes · mejoras) en un Postgres en memoria: evidencia obligatoria para
   enviar, estructuras propias (X1…), qué oficinas usan cada plantilla, responsables con su
   registro para restablecer, y restablecer la estructura de una plantilla en un ciclo. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorOf, type TestDb } from "../db/harness";
import { enviar, escenario, P, seccion, U } from "./fixtures";

let t: TestDb;
let ciclo = "";

const SECCIONES = [
  { titulo: "Resumen", tipo: "narr", minimo: 25 },
  { titulo: "Alineación estratégica", tipo: "pdi" },
  { titulo: "Resultados y evidencias", tipo: "dim", dims: ["inv", "ext"] },
  { titulo: "Evidencias y fuentes de verificación", tipo: "evid" },
  { titulo: "Anexos", tipo: "anexos" },
];
const guardar = (quien: string, plantilla: string | null, datos: Record<string, unknown>) =>
  t.asUser(quien, async (q) => (await q<{ r: { plantilla: string } }>("select to_jsonb(public.informe_estructura_guardar($1, $2)) as r", [plantilla, JSON.stringify(datos)]))[0].r, { commit: true });

beforeAll(async () => {
  ({ t, ciclo } = await escenario());
}, 180_000);

afterAll(async () => t?.close());

describe("0279 · evidencia obligatoria", () => {
  it("sin evidencias no se envía, en ninguna estructura; con una sí", async () => {
    const rect = await t.asUser(P.rector, async (q) => (await q<{ id: string }>("select public.informe_abrir($1, $2, 'C') as id", [ciclo, U.rectoria]))[0].id, { commit: true });
    await t.asUser(P.rector, (q) => seccion(q, rect, "s1"), { commit: true });
    expect(await errorOf(t.asUser(P.rector, (q) => enviar(q, rect)))).toMatch(/Faltan las evidencias y fuentes de verificación/);
    await t.q("insert into public.informe_anexos (instancia_id, n, nombre, tipo, ruta) values ($1, 1, 'Acta', 'url', 'https://udes.edu.co/acta')", [rect]);
    const r = await t.asUser(P.rector, (q) => enviar(q, rect), { commit: true });
    expect(r.estado).toBe("sent");
  });
});

describe("0279 · estructuras propias", () => {
  it("Planeación crea una estructura (X1) y abre un informe con ella", async () => {
    const e = await guardar(P.planeacion, null, { nombre: "Informe de Planeación Institucional", quien: "Planeación Institucional", destino: "Rectoría General", secciones: SECCIONES });
    expect(e.plantilla).toBe("X1");
    const inst = await t.asUser(P.planeacion, async (q) => (await q<{ id: string }>("select public.informe_abrir($1, $2, 'X1') as id", [ciclo, U.facultad]))[0].id, { commit: true });
    expect(inst).toBeTruthy();
  });

  it("toda estructura lleva evidencias; tipos y títulos se validan", async () => {
    expect(await errorOf(guardar(P.planeacion, null, { nombre: "Sin evidencias", secciones: SECCIONES.filter((s) => s.tipo !== "evid") }))).toMatch(/evidencias y fuentes de verificación/);
    expect(await errorOf(guardar(P.planeacion, null, { nombre: "Tipo raro", secciones: [...SECCIONES, { titulo: "x", tipo: "otro" }] }))).toMatch(/tipo desconocido/);
    expect(await errorOf(guardar(P.planeacion, null, { nombre: "Sin título", secciones: [{ titulo: "", tipo: "narr" }, ...SECCIONES] }))).toMatch(/necesita un título/);
    expect(await errorOf(guardar(P.planeacion, null, { nombre: "x", secciones: SECCIONES }))).toMatch(/nombre|check/i);
  });

  it("solo Planeación las crea", async () => {
    expect(await errorOf(guardar(P.gestor, null, { nombre: "Intento de un Gestor", secciones: SECCIONES }))).toMatch(/Solo Planeación/);
  });

  it("con informes abiertos se puede renombrar, pero no cambiar sus secciones ni eliminar", async () => {
    await guardar(P.planeacion, "X1", { nombre: "Planeación Institucional · informe anual" });
    expect(await errorOf(guardar(P.planeacion, "X1", { secciones: SECCIONES.slice(0, 4) }))).toMatch(/ya la usan informes abiertos/);
    expect(await errorOf(t.asUser(P.planeacion, (q) => q("delete from public.informe_estructuras where plantilla = 'X1'")))).toMatch(/ya tiene informes abiertos/);
  });

  it("una estructura sin informes se elimina con sus ajustes", async () => {
    const e = await guardar(P.planeacion, null, { nombre: "Para eliminar", secciones: SECCIONES });
    await t.asUser(P.planeacion, (q) => q("delete from public.informe_estructuras where plantilla = $1", [e.plantilla]), { commit: true });
    expect(await t.q("select 1 from public.informe_estructuras where plantilla = $1", [e.plantilla])).toEqual([]);
  });
});

describe("0279 · qué oficinas usan cada plantilla", () => {
  const OFICINA = "00000000-0000-4000-b000-0000000000d1";

  it("con oficinas elegidas, solo esas la abren; Planeación abre cualquiera; sin lista, todas", async () => {
    await t.q("insert into public.units (id, kind, code, name, slug) values ($1, 'otra', 'PR-OF', 'Oficina de prueba', 'prueba-oficina')", [OFICINA]);
    await t.q("insert into public.unit_members (unit_id, profile_id, role) values ($1, $2, 'jefe')", [OFICINA, P.rector]);
    const e = await guardar(P.planeacion, null, { nombre: "Solo para la facultad", secciones: SECCIONES });
    await t.asUser(P.planeacion, (q) => q("select public.informe_plantilla_unidades_guardar($1, $2)", [e.plantilla, [U.facultad]]), { commit: true });
    expect(await errorOf(t.asUser(P.rector, (q) => q("select public.informe_abrir($1, $2, $3)", [ciclo, OFICINA, e.plantilla])))).toMatch(/no está habilitada/);
    // Planeación puede abrir cualquiera.
    const abierto = await t.asUser(P.planeacion, (q) => q("select public.informe_abrir($1, $2, $3) as id", [ciclo, OFICINA, e.plantilla]));
    expect(abierto[0]).toBeTruthy();
    await t.q("delete from public.informe_instancias where unit_id = $1", [OFICINA]);
    // Sin lista, todas.
    await t.asUser(P.planeacion, (q) => q("select public.informe_plantilla_unidades_guardar($1, '{}')", [e.plantilla]), { commit: true });
    expect(await t.q("select public.informe_plantilla_permitida($1, $2) as ok", [e.plantilla, OFICINA])).toEqual([{ ok: true }]);
    const libre = await t.asUser(P.rector, (q) => q("select public.informe_abrir($1, $2, $3) as id", [ciclo, OFICINA, e.plantilla]));
    expect(libre[0]).toBeTruthy();
  });

  it("también limita las plantillas A–D", async () => {
    await t.asUser(P.planeacion, (q) => q("select public.informe_plantilla_unidades_guardar('B', $1)", [[U.rectoria]]), { commit: true });
    expect(await t.q("select public.informe_plantilla_permitida('B', $1) as ok", [U.facultad])).toEqual([{ ok: false }]);
    await t.asUser(P.planeacion, (q) => q("select public.informe_plantilla_unidades_guardar('B', '{}')", []), { commit: true });
  });
});

describe("0279 · responsables", () => {
  it("se asigna con el usuario de la persona, queda registrado y se restablece al papel anterior", async () => {
    await t.asUser(P.planeacion, async (q) => {
      await q("select public.informe_asignar_responsable($1, $2, 'editor')", [U.facultad, P.ajeno]);
      await q("select public.informe_asignar_responsable($1, $2, 'jefe')", [U.facultad, P.contribuyente]);
    }, { commit: true });
    const lista = await t.asUser(P.planeacion, (q) => q<{ profile_id: string; rol: string; asignado: boolean }>("select profile_id, rol, asignado from public.informe_responsables($1)", [U.facultad]));
    expect(lista.find((x) => x.profile_id === P.ajeno)).toMatchObject({ rol: "editor", asignado: true });
    expect(lista.find((x) => x.profile_id === P.contribuyente)).toMatchObject({ rol: "jefe", asignado: true });
    // quien ya era Gestor no se toca.
    expect(lista.find((x) => x.profile_id === P.gestor)).toMatchObject({ rol: "jefe", asignado: false });

    const n = await t.asUser(P.planeacion, async (q) => (await q<{ n: number }>("select public.informe_responsables_restablecer($1) as n", [U.facultad]))[0].n, { commit: true });
    expect(n).toBe(2);
    const roles = await t.q<{ profile_id: string; role: string }>("select profile_id, role::text from public.unit_members where unit_id = $1", [U.facultad]);
    expect(roles.find((x) => x.profile_id === P.ajeno)).toBeUndefined();
    expect(roles.find((x) => x.profile_id === P.contribuyente)?.role).toBe("editor");
    expect(roles.find((x) => x.profile_id === P.gestor)?.role).toBe("jefe");
  });

  it("quitar a un responsable asignado lo devuelve a su papel; solo Planeación asigna y busca", async () => {
    await t.asUser(P.planeacion, (q) => q("select public.informe_asignar_responsable($1, $2, 'visor')", [U.facultad, P.ajeno]), { commit: true });
    await t.asUser(P.planeacion, (q) => q("select public.informe_quitar_responsable($1, $2)", [U.facultad, P.ajeno]), { commit: true });
    expect(await t.q("select 1 from public.unit_members where unit_id = $1 and profile_id = $2", [U.facultad, P.ajeno])).toEqual([]);
    expect(await errorOf(t.asUser(P.gestor, (q) => q("select public.informe_asignar_responsable($1, $2, 'editor')", [U.facultad, P.ajeno])))).toMatch(/Solo Planeación/);
    expect(await errorOf(t.asUser(P.gestor, (q) => q("select * from public.informe_buscar_personas('prueba')")))).toMatch(/Solo Planeación/);
    const hallados = await t.asUser(P.planeacion, (q) => q<{ correo: string }>("select correo from public.informe_buscar_personas('contribuyente')"));
    expect(hallados.length).toBeGreaterThan(0);
  });

  it("el papel debe ser uno de los tres", async () => {
    expect(await errorOf(t.asUser(P.planeacion, (q) => q("select public.informe_asignar_responsable($1, $2, 'director')", [U.facultad, P.ajeno])))).toMatch(/jefe, editor o visor/);
  });
});

describe("0279 · restablecer la estructura de una plantilla", () => {
  it("en preparación borra los ajustes del ciclo", async () => {
    const [{ id: prep }] = await t.q<{ id: string }>("insert into public.informe_ciclos (anio, nombre, estado) values (2031, 'Ciclo de preparación', 'preparacion') returning id");
    await t.q("insert into public.informe_secciones_config (ciclo_id, plantilla, clave, titulo, orden) values ($1, 'A', 's1', 'Otro título', 3), ($1, 'A', 's2', null, null)", [prep]);
    const n = await t.asUser(P.planeacion, async (q) => (await q<{ n: number }>("select public.informe_estructura_restablecer($1, 'A') as n", [prep]))[0].n, { commit: true });
    expect(n).toBe(2);
    expect(await t.q("select 1 from public.informe_secciones_config where ciclo_id = $1 and plantilla = 'A'", [prep])).toEqual([]);
  });

  it("con el ciclo abierto reactiva las secciones y las vuelve a abrir a la unidad, sin borrar nada", async () => {
    await t.q("insert into public.informe_secciones_config (ciclo_id, plantilla, clave, activa, editable_por_unidad) values ($1, 'B', 's3', false, false)", [ciclo]);
    const n = await t.asUser(P.planeacion, async (q) => (await q<{ n: number }>("select public.informe_estructura_restablecer($1, 'B') as n", [ciclo]))[0].n, { commit: true });
    expect(n).toBe(1);
    expect(await t.q("select activa, editable_por_unidad from public.informe_secciones_config where ciclo_id = $1 and plantilla = 'B' and clave = 's3'", [ciclo])).toEqual([{ activa: true, editable_por_unidad: true }]);
  });

  it("solo Planeación restablece", async () => {
    expect(await errorOf(t.asUser(P.gestor, (q) => q("select public.informe_estructura_restablecer($1, 'A')", [ciclo])))).toMatch(/Solo Planeación/);
  });
});
