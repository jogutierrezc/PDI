/* Migración 0166 (carpetas con subcarpetas y tablas Multicampus) en un Postgres
   en memoria: quién crea carpetas y tablas, quién edita las filas de cada campus
   en una tabla Multicampus (Bucaramanga las de todos; Cúcuta y Valledupar, las
   suyas), que todos las ven, y que la autoría (quién, cuándo, de qué archivo)
   queda en la fila.

   Cada bloque `como` se confirma; `falla` espera un error y se revierte (un
   error aborta la transacción, así que va solo en su bloque). */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type Query, type TestDb } from "../db/harness";

const P = {
  director: "00000000-0000-4000-a000-0000000000e1",
  coordCuc: "00000000-0000-4000-a000-0000000000e2",
  gestorCuc: "00000000-0000-4000-a000-0000000000e3",
  gestorBuc: "00000000-0000-4000-a000-0000000000e4",
  coordBuc: "00000000-0000-4000-a000-0000000000e5",
  gestorVal: "00000000-0000-4000-a000-0000000000e6",
  planeacion: "00000000-0000-4000-a000-0000000000e7",
  ajeno: "00000000-0000-4000-a000-0000000000e8",
};

let t: TestDb;
const C: Record<"cuc" | "buc" | "val" | "bog", string> = { cuc: "", buc: "", val: "", bog: "" };
let periodo = "";
let multi = "";
let normal = "";
let multiLibro = "";

const como = <T>(quien: string, trabajo: (q: Query) => Promise<T>) => t.asUser(quien, trabajo, { commit: true });
const falla = (quien: string | null, trabajo: (q: Query) => Promise<unknown>) => errorOf(t.asUser(quien, trabajo));
const leer = <T>(quien: string, trabajo: (q: Query) => Promise<T>) => t.asUser(quien, trabajo);

const fila = (q: Query, hoja: string, campus: string, nota: string) =>
  q<{ id: string }>("insert into public.int_filas (hoja_id, periodo_id, campus_id, datos) values ($1, $2, $3, $4) returning id", [hoja, periodo, campus, JSON.stringify({ propio_nota: nota })]);

const libro = (q: Query, nombre: string, captura: string, carpeta: string | null = null) =>
  q<{ id: string }>("insert into public.int_libros (nombre, captura, carpeta_id) values ($1, $2, $3) returning id", [nombre, captura, carpeta]);

const carpeta = (q: Query, nombre: string, padre: string | null = null) =>
  q<{ id: string }>("insert into public.int_carpetas (nombre, parent_id) values ($1, $2) returning id", [nombre, padre]);

beforeAll(async () => {
  t = await createTestDb();
  for (const [nombre, id] of Object.entries(P)) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, `${nombre}@prueba.udes.edu.co`]);
    await t.q("insert into public.profiles (id, email, full_name, is_active) values ($1, $2, $3, true) on conflict (id) do update set is_active = true", [
      id,
      `${nombre}@prueba.udes.edu.co`,
      nombre,
    ]);
  }
  await t.q("update public.profiles set role = 'planeacion' where id = $1", [P.planeacion]);
  for (const r of await t.q<{ id: string; slug: string }>("select id, slug from public.campuses")) {
    if (r.slug === "cucuta") C.cuc = r.id;
    if (r.slug === "bucaramanga") C.buc = r.id;
    if (r.slug === "valledupar") C.val = r.id;
    if (r.slug === "bogota") C.bog = r.id;
  }
  await t.q(
    `insert into public.int_miembros (user_id, rol, campus_id) values
       ($1, 'director', null), ($2, 'coordinador', $7), ($3, 'gestor', $7), ($4, 'gestor', $8), ($5, 'coordinador', $8), ($6, 'gestor', $9)`,
    [P.director, P.coordCuc, P.gestorCuc, P.gestorBuc, P.coordBuc, P.gestorVal, C.cuc, C.buc, C.val],
  );

  // Una tabla Multicampus y una «por campus», ambas con una columna de texto y la ventana abierta.
  const [m] = await libro(t.q, "Visitantes extranjeros", "multicampus");
  const [n] = await libro(t.q, "Movilidad", "campus");
  multiLibro = m.id;
  [{ id: multi }] = await t.q<{ id: string }>("insert into public.int_hojas (libro_id, nombre, clase) values ($1, 'Visitantes', 'general') returning id", [m.id]);
  [{ id: normal }] = await t.q<{ id: string }>("insert into public.int_hojas (libro_id, nombre, clase) values ($1, 'Saliente', 'general') returning id", [n.id]);
  for (const h of [multi, normal]) {
    await t.q(
      "insert into public.int_columnas (hoja_id, clave, etiqueta, tipo, concepto_id, obligatorio, opciones, calculo, orden) values ($1, 'propio_nota', 'Nota', 'texto', null, false, '{}', null, 1)",
      [h],
    );
  }
  [{ id: periodo }] = await t.q<{ id: string }>("insert into public.int_periodos (codigo, nombre, cierra) values ('2026-2', 'Segundo semestre 2026', '2026-12-15') returning id");
  await t.q(
    `insert into public.int_ventanas (periodo_id, hoja_id, abre, cierra) values
       ($1, $2, public.int_hoy() - 5, public.int_hoy() + 5), ($1, $3, public.int_hoy() - 5, public.int_hoy() + 5)`,
    [periodo, multi, normal],
  );
  await fila(t.q, multi, C.buc, "fila de Bucaramanga");
  await fila(t.q, normal, C.buc, "normal de Bucaramanga");
}, 180_000);

afterAll(async () => t?.close());

describe("0166 · mis papeles", () => {
  it("int_yo dice si crea, si controla Multicampus y cuál es el campus central", async () => {
    const yo = async (id: string) => (await leer(id, async (q) => (await q<{ y: Record<string, unknown> }>("select public.int_yo() as y"))[0].y)) as Record<string, unknown>;
    expect(await yo(P.coordCuc)).toMatchObject({ crea: true, multicampus: false, planeacion: false, central: C.buc });
    expect(await yo(P.coordBuc)).toMatchObject({ crea: true, multicampus: true });
    expect(await yo(P.gestorBuc)).toMatchObject({ crea: false, multicampus: false });
    expect(await yo(P.planeacion)).toMatchObject({ crea: true, multicampus: true, planeacion: true });
    expect(await yo(P.director)).toMatchObject({ crea: true, multicampus: true, director: true });
  });
});

describe("0166 · carpetas", () => {
  it("las crean el Director, Planeación y los coordinadores; no un gestor ni quien no es del módulo", async () => {
    for (const [quien, nombre] of [[P.director, "Del Director"], [P.planeacion, "De Planeación"], [P.coordCuc, "De Cúcuta"], [P.coordBuc, "De Bucaramanga"]] as const) {
      expect((await como(quien, (q) => carpeta(q, nombre)))[0].id).toBeTruthy();
    }
    for (const quien of [P.gestorCuc, P.ajeno]) {
      expect(await falla(quien, (q) => carpeta(q, "No"))).toMatch(/row-level security|permission denied/);
    }
  });

  it("las leen los miembros y Planeación; quien es ajeno al módulo no ve ninguna", async () => {
    expect((await leer(P.gestorCuc, (q) => q("select id from public.int_carpetas"))).length).toBeGreaterThan(0);
    expect((await leer(P.planeacion, (q) => q("select id from public.int_carpetas"))).length).toBeGreaterThan(0);
    expect(await leer(P.ajeno, (q) => q("select id from public.int_carpetas"))).toEqual([]);
  });

  it("admite subcarpetas, no deja ciclos ni pasar de 5 niveles, y dos hermanas no se llaman igual", async () => {
    const ids = await como(P.director, async (q) => {
      const salida: string[] = [(await carpeta(q, "Raiz de prueba"))[0].id];
      for (const n of ["N2", "N3", "N4", "N5"]) salida.push((await carpeta(q, n, salida[salida.length - 1]))[0].id);
      return salida;
    });
    expect(ids).toHaveLength(5);
    expect(await falla(P.director, (q) => carpeta(q, "N6", ids[4]))).toMatch(/5 niveles/);
    expect(await falla(P.director, (q) => q("update public.int_carpetas set parent_id = $1 where id = $2", [ids[4], ids[0]]))).toMatch(/dentro de sí misma/);
    expect(await falla(P.director, (q) => carpeta(q, "RAIZ DE PRUEBA"))).toMatch(/duplicate key|unique/);
  });

  it("un coordinador cambia las suyas, no las de otros; Planeación cambia cualquiera", async () => {
    const [propia] = await como(P.coordCuc, (q) => carpeta(q, "Propia de Cúcuta"));
    const [ajena] = await como(P.director, (q) => carpeta(q, "Ajena del Director"));
    await como(P.coordCuc, async (q) => {
      await q("update public.int_carpetas set nombre = 'Propia de Cúcuta 2' where id = $1", [propia.id]);
      await q("update public.int_carpetas set nombre = 'Hackeada' where id = $1", [ajena.id]);
    });
    const nombres = await t.q<{ id: string; nombre: string }>("select id, nombre from public.int_carpetas where id in ($1, $2)", [propia.id, ajena.id]);
    expect(nombres.find((n) => n.id === propia.id)?.nombre).toBe("Propia de Cúcuta 2");
    expect(nombres.find((n) => n.id === ajena.id)?.nombre).toBe("Ajena del Director");
    await como(P.planeacion, (q) => q("update public.int_carpetas set nombre = 'Revisada' where id = $1", [ajena.id]));
    expect((await t.q<{ nombre: string }>("select nombre from public.int_carpetas where id = $1", [ajena.id]))[0].nombre).toBe("Revisada");
  });

  it("una carpeta con tablas no se borra; vacía, sí", async () => {
    const [c] = await como(P.director, (q) => carpeta(q, "Con tabla"));
    await como(P.director, (q) => libro(q, "Tabla en carpeta", "campus", c.id));
    expect(await falla(P.director, (q) => q("delete from public.int_carpetas where id = $1", [c.id]))).toMatch(/foreign key|violates/);
    const [v] = await como(P.director, (q) => carpeta(q, "Vacía"));
    await como(P.director, (q) => q("delete from public.int_carpetas where id = $1", [v.id]));
    expect(await t.q("select id from public.int_carpetas where id = $1", [v.id])).toEqual([]);
  });
});

describe("0166 · quién crea tablas", () => {
  it("un coordinador crea tablas por campus, no «solo la oficina» ni Multicampus", async () => {
    expect((await como(P.coordCuc, (q) => libro(q, "Del coordinador de Cúcuta", "campus")))[0].id).toBeTruthy();
    expect(await falla(P.coordCuc, (q) => libro(q, "Oficina de Cúcuta", "oficina"))).toMatch(/row-level security/);
    expect(await falla(P.coordCuc, (q) => libro(q, "Multi de Cúcuta", "multicampus"))).toMatch(/row-level security/);
  });

  it("Multicampus la crean el Director, Planeación y el coordinador de Bucaramanga, no un gestor", async () => {
    for (const [quien, nombre] of [[P.director, "Multi D"], [P.planeacion, "Multi P"], [P.coordBuc, "Multi B"]] as const) {
      expect((await como(quien, (q) => libro(q, nombre, "multicampus")))[0].id).toBeTruthy();
    }
    expect(await falla(P.gestorBuc, (q) => libro(q, "Multi del gestor", "multicampus"))).toMatch(/row-level security/);
  });

  it("«solo la oficina» la crea Planeación", async () => {
    expect((await como(P.planeacion, (q) => libro(q, "Oficina de Planeación", "oficina")))[0].id).toBeTruthy();
  });

  it("un coordinador cambia solo sus tablas; la Multicampus es de quien la controla", async () => {
    const [mia] = await como(P.coordCuc, (q) => libro(q, "Mía de Cúcuta", "campus"));
    await como(P.coordCuc, (q) => q("update public.int_libros set descripcion = 'editada' where id = $1", [mia.id]));
    expect((await t.q<{ descripcion: string }>("select descripcion from public.int_libros where id = $1", [mia.id]))[0].descripcion).toBe("editada");
    // La Multicampus: el coordinador de Cúcuta no la toca (0 filas); el de Bucaramanga, sí.
    await como(P.coordCuc, (q) => q("update public.int_libros set descripcion = 'no' where id = $1", [multiLibro]));
    expect((await t.q<{ descripcion: string }>("select descripcion from public.int_libros where id = $1", [multiLibro]))[0].descripcion).toBe("");
    await como(P.coordBuc, (q) => q("update public.int_libros set descripcion = 'sí' where id = $1", [multiLibro]));
    expect((await t.q<{ descripcion: string }>("select descripcion from public.int_libros where id = $1", [multiLibro]))[0].descripcion).toBe("sí");
  });

  it("Planeación ve el módulo sin ser miembro", async () => {
    expect((await leer(P.planeacion, (q) => q("select id from public.int_libros"))).length).toBeGreaterThan(0);
    expect(await leer(P.ajeno, (q) => q("select id from public.int_libros"))).toEqual([]);
  });
});

describe("0166 · filas de una tabla Multicampus", () => {
  it("todos los miembros ven las filas de todos los campus; en una tabla por campus, solo las del suyo", async () => {
    for (const quien of [P.gestorCuc, P.gestorVal, P.gestorBuc, P.planeacion]) {
      const filas = await leer(quien, (q) => q<{ campus_id: string }>("select campus_id from public.int_filas where hoja_id = $1", [multi]));
      expect(filas.some((f) => f.campus_id === C.buc), quien).toBe(true);
    }
    expect(await leer(P.gestorCuc, (q) => q("select id from public.int_filas where hoja_id = $1", [normal]))).toEqual([]);
    expect(await leer(P.ajeno, (q) => q("select id from public.int_filas where hoja_id = $1", [multi]))).toEqual([]);
  });

  it("Cúcuta y Valledupar escriben solo sus filas; Bucaramanga escribe las de todos", async () => {
    expect((await como(P.gestorCuc, (q) => fila(q, multi, C.cuc, "de Cúcuta")))[0].id).toBeTruthy();
    expect(await falla(P.gestorCuc, (q) => fila(q, multi, C.buc, "intruso"))).toMatch(/No tiene permiso/);
    expect(await falla(P.gestorCuc, (q) => fila(q, multi, C.val, "intruso"))).toMatch(/No tiene permiso/);
    expect((await como(P.gestorVal, (q) => fila(q, multi, C.val, "de Valledupar")))[0].id).toBeTruthy();
    expect(await falla(P.gestorVal, (q) => fila(q, multi, C.cuc, "intruso"))).toMatch(/No tiene permiso/);
    expect((await como(P.gestorBuc, (q) => fila(q, multi, C.cuc, "cargada desde Bucaramanga")))[0].id).toBeTruthy();
    expect((await como(P.gestorBuc, (q) => fila(q, multi, C.val, "cargada desde Bucaramanga")))[0].id).toBeTruthy();
  });

  it("fuera de Multicampus, Bucaramanga no cruza de campus", async () => {
    expect(await falla(P.gestorBuc, (q) => fila(q, normal, C.cuc, "no"))).toMatch(/No tiene permiso|row-level security/);
  });

  it("Planeación y el Director editan cualquier campus en Multicampus; Planeación no en las tablas por campus", async () => {
    expect((await como(P.planeacion, (q) => fila(q, multi, C.val, "de Planeación")))[0].id).toBeTruthy();
    expect(await falla(P.planeacion, (q) => fila(q, normal, C.cuc, "no"))).toMatch(/No tiene permiso|row-level security/);
    expect((await como(P.director, (q) => fila(q, multi, C.bog, "del Director")))[0].id).toBeTruthy();
  });

  it("la fila guarda quién la creó y quién la cambió", async () => {
    const [f] = await como(P.gestorCuc, (q) => fila(q, multi, C.cuc, "con autoría"));
    await como(P.gestorBuc, (q) => q("update public.int_filas set datos = $2 where id = $1", [f.id, JSON.stringify({ propio_nota: "corregida" })]));
    const [r] = await t.q<{ created_by: string; updated_by: string; created_at: string }>("select created_by, updated_by, created_at from public.int_filas where id = $1", [f.id]);
    expect(r.created_by).toBe(P.gestorCuc);
    expect(r.updated_by).toBe(P.gestorBuc);
    expect(r.created_at).toBeTruthy();
  });

  it("una carga de Excel deja el nombre del archivo en cada fila nueva", async () => {
    await como(P.gestorCuc, (q) =>
      q("select public.int_guardar_filas($1, $2, $3::jsonb, null, 'excel', 'visitantes_cuc.xlsx')", [multi, periodo, JSON.stringify([{ campus_id: C.cuc, datos: { propio_nota: "desde Excel" } }])]),
    );
    const [r] = await t.q<{ origen: string; archivo: string | null; created_by: string }>("select origen, archivo, created_by from public.int_filas where hoja_id = $1 and datos ->> 'propio_nota' = 'desde Excel'", [multi]);
    expect(r).toMatchObject({ origen: "excel", archivo: "visitantes_cuc.xlsx", created_by: P.gestorCuc });
    // A mano no lleva archivo aunque se pase uno.
    await como(P.gestorCuc, (q) =>
      q("select public.int_guardar_filas($1, $2, $3::jsonb, null, 'manual', 'ignorado.xlsx')", [multi, periodo, JSON.stringify([{ campus_id: C.cuc, datos: { propio_nota: "a mano" } }])]),
    );
    expect((await t.q<{ archivo: string | null }>("select archivo from public.int_filas where hoja_id = $1 and datos ->> 'propio_nota' = 'a mano'", [multi]))[0].archivo).toBeNull();
  });

  it("el envío sigue siendo por campus: quien edita filas ajenas desde Bucaramanga no las envía", async () => {
    expect(await falla(P.gestorBuc, (q) => q("select public.int_cambiar_estado($1, $2, $3, 'enviado', null)", [periodo, multi, C.cuc]))).toBeTruthy();
    await como(P.gestorCuc, (q) => q("select public.int_cambiar_estado($1, $2, $3, 'enviado', null)", [periodo, multi, C.cuc]));
    // Enviada la parte de Cúcuta, un gestor ya no la cambia (ni siquiera el de Bucaramanga); el coordinador de Bucaramanga sí.
    expect(await falla(P.gestorBuc, (q) => fila(q, multi, C.cuc, "tarde"))).toMatch(/ya se envió/);
    expect((await como(P.coordBuc, (q) => fila(q, multi, C.cuc, "corrige el coordinador")))[0].id).toBeTruthy();
  });

  it("todos los miembros ven el estado de envío de cada campus en Multicampus", async () => {
    const e = await leer(P.gestorVal, (q) => q<{ campus_id: string; estado: string }>("select campus_id, estado from public.int_envios where hoja_id = $1", [multi]));
    expect(e.find((x) => x.campus_id === C.cuc)?.estado).toBe("enviado");
    expect(await leer(P.gestorVal, (q) => q("select * from public.int_envios where hoja_id = $1", [normal]))).toEqual([]);
  });
});
