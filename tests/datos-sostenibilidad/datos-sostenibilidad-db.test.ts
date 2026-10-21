/* Migración 0178 (Datos de Sostenibilidad) en un Postgres en memoria: semilla
   espejo de lib/indicadores.ts, RLS por oficina (gestor y colaborador editan,
   Planeación solo lee, nadie más ve nada), estados borrador → listo con la
   validación de celdas, y la conexión de un libro a un indicador con sus slots. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INDICADORES_DS } from "../../src/modules/datos-sostenibilidad/lib/indicadores";
import { errorDeValor } from "../../src/modules/programas-en-cifras/lib/validacion";
import { PEOPLE, UNITS, createTestDb, errorOf, type TestDb } from "../db/harness";

const P = {
  gestor: PEOPLE.director, // Gestor de UDES Verde (oficina A)
  colabo: PEOPLE.reportante, // Colaborador de UDES Verde
  planeacion: PEOPLE.admin, // rol global planeacion: ve todo, no edita
  admin: PEOPLE.vi, // rol global admin: edita en cualquier oficina
  ajeno: PEOPLE.decano, // sin papel en el módulo
};

let t: TestDb;
const A = UNITS.programaA; // hace de oficina UDES Verde
const B = UNITS.programaB; // hace de otra oficina
const carpetas: Record<string, string> = {};
let libro = "";

const falla = (quien: string | null, sql: string, params: unknown[] = []) => errorOf(t.asUser(quien, (q) => q(sql, params)));
const como = <T,>(quien: string | null, sql: string, params: unknown[] = []) => t.asUser<T[]>(quien, (q) => q<T>(sql, params), { commit: true });

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update public.profiles set role = 'planeacion', is_active = true where id = $1", [P.planeacion]);
  await t.q("update public.profiles set role = 'admin', is_active = true where id = $1", [P.admin]);
  await t.q("update public.profiles set role = 'responsable', is_active = true where id = any ($1)", [[P.gestor, P.colabo]]);
  await t.q("update public.profiles set role = 'consulta', is_active = true where id = $1", [P.ajeno]);
  await t.q(`insert into public.ds_miembros (user_id, rol, oficina_id) values ($1, 'gestor', $3), ($2, 'colaborador', $3)`, [P.gestor, P.colabo, A]);
  for (const r of await t.q<{ id: string; clave: string }>("select id, clave from public.ds_carpetas where fija")) carpetas[r.clave] = r.id;
}, 180_000);

afterAll(() => t?.close());

describe("0178 · semilla", () => {
  it("los indicadores del ODS 13 y las dos carpetas fijas existen, como en lib/indicadores.ts", async () => {
    const indicadores = await t.q<{ id: string; ods: number; nombre: string; position: number }>("select id, ods, nombre, position from public.ds_indicadores order by position");
    expect(indicadores.map((i) => [i.id, i.ods, i.nombre, i.position])).toEqual(INDICADORES_DS.map((i) => [i.id, i.ods, i.nombre, i.position]));
    expect(Object.keys(carpetas).sort()).toEqual(["indicadores", "trabajo"]);
  });

  it("ds_error_valor da lo mismo que errorDeValor (la validación es la de Programas en Cifras)", async () => {
    const casos: [string, string[], boolean, unknown][] = [
      ["numero", [], false, "12,5"], ["numero", [], false, "doce"], ["numero", [], true, "  "],
      ["porcentaje", [], false, "100,5"], ["porcentaje", [], false, 47.5],
      ["fecha", [], false, "2026-02-30"], ["fecha", [], false, "28/02/2026"], ["fecha", [], true, null],
      ["lista", ["Sí", "No"], false, "Quizás"],
    ];
    for (const [tipo, opciones, obligatorio, valor] of casos) {
      const [r] = await t.q<{ e: string | null }>("select public.ds_error_valor($1, $2::text[], $3, $4::jsonb) as e", [tipo, opciones, obligatorio, JSON.stringify(valor)]);
      expect(r.e ?? "", `${tipo} ${JSON.stringify(valor)}`).toBe(errorDeValor({ tipo: tipo as never, opciones, obligatorio }, valor));
    }
  });
});

describe("0178 · quién ve y quién edita", () => {
  it("sin sesión no hay nada, y quien no es del módulo no ve ni el catálogo", async () => {
    await t.asUser(null, async (q) => {
      expect(await q("select id from public.ds_libros")).toEqual([]);
      expect(await q("select id from public.ds_indicadores")).toEqual([]);
      expect(await q("select id from public.ds_carpetas")).toEqual([]);
    });
    await t.asUser(P.ajeno, async (q) => {
      expect(await q("select id from public.ds_indicadores")).toEqual([]);
      expect(await q("select id from public.ds_carpetas")).toEqual([]);
      expect(await q("select public.ds_yo() as yo")).toMatchObject([{ yo: { planeacion: false, oficinas: [] } }]);
    });
  });

  it("ds_yo: el gestor ve su oficina con su rol; Planeación ve todas las unidades", async () => {
    const [g] = await t.asUser(P.gestor, (q) => q<{ yo: { planeacion: boolean; oficinas: { oficina_id: string; rol: string }[] } }>("select public.ds_yo() as yo"));
    expect(g.yo.planeacion).toBe(false);
    expect(g.yo.oficinas.map((o) => [o.oficina_id, o.rol])).toEqual([[A, "gestor"]]);
    const [pl] = await t.asUser(P.planeacion, (q) => q<{ yo: { planeacion: boolean; oficinas: { rol: string }[] } }>("select public.ds_yo() as yo"));
    expect(pl.yo.planeacion).toBe(true);
    expect(pl.yo.oficinas.length).toBeGreaterThan(0);
    expect(new Set(pl.yo.oficinas.map((o) => o.rol))).toEqual(new Set(["planeacion"]));
  });

  it("el gestor, el colaborador y la administración crean libros; Planeación y el ajeno no", async () => {
    const columnas = JSON.stringify([
      { clave: "anio", etiqueta: "Año", tipo: "texto", obligatorio: true },
      { clave: "consumo_limpio", etiqueta: "Consumo de energía limpia", tipo: "porcentaje", obligatorio: true },
    ]);
    const [l] = await como<{ id: string; estado: string; tipo: string }>(
      P.gestor,
      "select * from public.ds_crear_libro($1, $2, 'Energía por campus 2026', 'tabla', $3::jsonb)",
      [A, carpetas.indicadores, columnas],
    );
    libro = l.id;
    expect(l).toMatchObject({ estado: "borrador", tipo: "tabla" });
    expect(await falla(P.planeacion, "select * from public.ds_crear_libro($1, $2, 'X', 'tabla', $3::jsonb)", [A, carpetas.trabajo, columnas])).toMatch(/La oficina o la administración/);
    expect(await falla(P.ajeno, "select * from public.ds_crear_libro($1, $2, 'X', 'tabla', $3::jsonb)", [A, carpetas.trabajo, columnas])).toMatch(/La oficina o la administración/);
    // El colaborador de la misma oficina sí; una oficina ajena, no.
    const [l2] = await como<{ id: string }>(P.colabo, "select * from public.ds_crear_libro($1, $2, 'Otro libro', 'lista', $3::jsonb)", [A, carpetas.trabajo, columnas]);
    expect(l2.id).toBeTruthy();
    expect(await falla(P.gestor, "select * from public.ds_crear_libro($1, $2, 'X', 'tabla', $3::jsonb)", [B, carpetas.indicadores, columnas])).toMatch(/La oficina o la administración/);
    // La administración (y los roles con base administrador, como UDES Verde) edita en cualquier oficina.
    const [l3] = await como<{ id: string }>(P.admin, "select * from public.ds_crear_libro($1, $2, 'Libro de la administración', 'tabla', $3::jsonb)", [B, carpetas.trabajo, columnas]);
    expect(l3.id).toBeTruthy();
  });

  it("la oficina ve lo suyo; Planeación y la administración ven todo; el ajeno no ve nada", async () => {
    expect((await t.asUser(P.gestor, (q) => q("select id from public.ds_libros"))).length).toBe(2);
    expect((await t.asUser(P.colabo, (q) => q("select id from public.ds_libros"))).length).toBe(2);
    expect((await t.asUser(P.planeacion, (q) => q("select id from public.ds_libros"))).length).toBe(3);
    expect((await t.asUser(P.admin, (q) => q("select id from public.ds_libros"))).length).toBe(3);
    expect(await t.asUser(P.ajeno, (q) => q("select id from public.ds_libros"))).toEqual([]);
  });
});

describe("0178 · filas, validación y estados", () => {
  it("un libro con errores no se marca como listo; corregido, sí", async () => {
    const filas = JSON.stringify([
      { datos: { anio: "2026", consumo_limpio: "11,5" } },
      { datos: { anio: "2026", consumo_limpio: "no sé" } },
    ]);
    await como(P.gestor, "select * from public.ds_guardar_filas($1, $2::jsonb)", [libro, filas]);
    expect(await falla(P.gestor, "select * from public.ds_marcar_listo($1, true)", [libro])).toMatch(/celda\(s\) con error/);

    const filas2 = JSON.stringify([{ datos: { anio: "2026", columna_extra: "doce" } }]);
    expect(await falla(P.gestor, "select * from public.ds_guardar_filas($1, $2::jsonb)", [libro, filas2])).toMatch(/columna «columna_extra» no existe en este libro/);

    const propio = await t.asUser(P.gestor, (q) => q<{ libro_id: string; filas: string; errores: string }>("select libro_id, filas, errores from public.ds_resumen_libros($1)", [A]));
    expect(Number(propio.find((r) => r.libro_id === libro)?.errores ?? 0)).toBe(1);

    // Corregir la celda y marcar listo.
    await como(P.gestor, "update public.ds_filas set datos = jsonb_set(datos, '{consumo_limpio}', '13.5') where libro_id = $1 and datos->>'consumo_limpio' = 'no sé'", [libro]);
    const [listo] = await como<{ estado: string }>(P.gestor, "select * from public.ds_marcar_listo($1, true)", [libro]);
    expect(listo.estado).toBe("listo");
  });

  it("editar una fila de un libro listo lo devuelve a borrador", async () => {
    await como(P.colabo, "update public.ds_filas set datos = jsonb_set(datos, '{consumo_limpio}', '14') where libro_id = $1 and orden = 0", [libro]);
    const [l] = await t.q<{ estado: string }>("select estado from public.ds_libros where id = $1", [libro]);
    expect(l.estado).toBe("borrador");
  });

  it("el historial registra lo que ha pasado en la oficina", async () => {
    const acciones = await t.asUser(P.gestor, (q) => q<{ accion: string }>("select accion from public.ds_actividad where oficina_id = $1 order by at", [A]));
    expect(acciones.map((a) => a.accion)).toEqual(expect.arrayContaining(["libro_creado", "filas", "estado"]));
    expect(await t.asUser(P.ajeno, (q) => q("select id from public.ds_actividad"))).toEqual([]);
  });
});

describe("0178 · la conexión con los indicadores", () => {
  it("conecta un libro al indicador 13.2 con el slot valor en una columna de porcentaje", async () => {
    const mapa = JSON.stringify({ valor: "consumo_limpio", periodo: "anio" });
    const [r] = await como<{ indicador_id: string }>(
      P.gestor,
      "insert into public.ds_respuestas (libro_id, indicador_id, mapa) values ($1, '13.2', $2::jsonb) returning indicador_id",
      [libro, mapa],
    );
    expect(r.indicador_id).toBe("13.2");
  });

  it("los slots son los cinco fijos, el valor sale de una cifra y la conexión exige «valor»", async () => {
    expect(await t.q("select public.ds_slots()")).toMatchObject([{ ds_slots: ["valor", "periodo", "campus", "fuente", "evidencia"] }]);
    const inventado = JSON.stringify({ valor: "consumo_limpio", extra: "anio" });
    expect(await falla(P.gestor, "insert into public.ds_respuestas (libro_id, indicador_id, mapa) values ($1, '13.1', $2::jsonb)", [libro, inventado])).toMatch(/no es un slot del indicador/);
    const texto = JSON.stringify({ valor: "anio", periodo: "anio" });
    expect(await falla(P.gestor, "insert into public.ds_respuestas (libro_id, indicador_id, mapa) values ($1, '13.1', $2::jsonb)", [libro, texto])).toMatch(/columna de número o porcentaje/);
    const sinValor = JSON.stringify({ periodo: "anio" });
    expect(await falla(P.gestor, "insert into public.ds_respuestas (libro_id, indicador_id, mapa) values ($1, '13.1', $2::jsonb)", [libro, sinValor])).toMatch(/necesita el slot «valor»/);
    const inexistente = JSON.stringify({ valor: "no_hay" });
    expect(await falla(P.gestor, "insert into public.ds_respuestas (libro_id, indicador_id, mapa) values ($1, '13.1', $2::jsonb)", [libro, inexistente])).toMatch(/no existe en este libro/);
  });

  it("quitar la columna de valor se lleva la conexión; Planeación no conecta nada", async () => {
    expect(await falla(P.planeacion, "insert into public.ds_respuestas (libro_id, indicador_id, mapa) values ($1, '13.3', $2::jsonb)", [libro, JSON.stringify({ valor: "consumo_limpio" })])).toMatch(/Planeación solo observa/);
    await como(P.gestor, "delete from public.ds_columnas where libro_id = $1 and clave = 'consumo_limpio'", [libro]);
    // Sin su columna de valor, la conexión deja de existir.
    const conexiones = await t.q<{ mapa: Record<string, string> }>("select mapa from public.ds_respuestas where libro_id = $1", [libro]);
    expect(conexiones).toEqual([]);
  });
});

describe("0178 · el equipo", () => {
  it("el gestor nombra colaboradores de su oficina; el colaborador y el gestor de otra, no", async () => {
    await como(P.gestor, "insert into public.ds_miembros (user_id, rol, oficina_id) values ($1, 'colaborador', $2)", [P.ajeno, A]);
    expect(await falla(P.colabo, "insert into public.ds_miembros (user_id, rol, oficina_id) values ($1, 'colaborador', $2)", [P.vi, A])).toMatch(/row-level security|los reparte su gestor/);
    expect(await falla(P.gestor, "insert into public.ds_miembros (user_id, rol, oficina_id) values ($1, 'gestor', $2)", [P.vx, B])).toMatch(/row-level security|los reparte su gestor/);
    const equipo = await t.asUser(P.gestor, (q) => q<{ rol: string }>("select rol from public.ds_miembros where oficina_id = $1 order by rol", [A]));
    expect(equipo.map((m) => m.rol).sort()).toEqual(["colaborador", "colaborador", "gestor"]);
  });
});
