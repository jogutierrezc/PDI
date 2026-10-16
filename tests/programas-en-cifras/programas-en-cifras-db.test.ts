/* Migración 0164 (Programas en Cifras) en un Postgres en memoria: catálogo
   espejo de lib/destinos.ts, RLS por programa × campus, Planeación que solo
   lee, estructura bloqueada de los cuadros del CNA, columnas de solo lectura,
   estados (borrador → listo), validación y periodos en orden estricto. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESTINOS, DOMINIOS_PC } from "../../src/modules/programas-en-cifras/lib/destinos";
import { errorDeValor } from "../../src/modules/programas-en-cifras/lib/validacion";
import { periodosDeVentana } from "../../src/modules/programas-en-cifras/lib/periodos";
import { PEOPLE, UNITS, createTestDb, errorOf, type TestDb } from "../db/harness";

const P = {
  dirA: PEOPLE.director, // Director del Programa A en Bucaramanga
  coordA: PEOPLE.reportante, // Coordinador del Programa A en Bucaramanga
  dirB: PEOPLE.otroDirector, // Director del Programa B en Cúcuta
  planeacion: PEOPLE.admin, // rol global planeacion
  ajeno: PEOPLE.decano, // sin papel en el módulo
};

let t: TestDb;
const C: Record<"buc" | "cuc" | "val", string> = { buc: "", cuc: "", val: "" };
const A = UNITS.programaA;
const B = UNITS.programaB;
const carpetas: Record<string, string> = {};
let cna07 = "";

/** Ejecuta una sola sentencia con la sesión de una persona y devuelve el mensaje de error. */
const falla = (quien: string | null, sql: string, params: unknown[] = []) => errorOf(t.asUser(quien, (q) => q(sql, params)));
const como = <T,>(quien: string | null, sql: string, params: unknown[] = []) => t.asUser<T[]>(quien, (q) => q<T>(sql, params), { commit: true });

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update public.profiles set role = 'planeacion', is_active = true where id = $1", [P.planeacion]);
  await t.q("update public.profiles set role = 'responsable', is_active = true where id = any ($1)", [[P.dirA, P.coordA, P.dirB]]);
  await t.q("update public.profiles set role = 'consulta', is_active = true where id = $1", [P.ajeno]);
  for (const r of await t.q<{ id: string; slug: string }>("select id, slug from public.campuses")) {
    if (r.slug === "bucaramanga") C.buc = r.id;
    if (r.slug === "cucuta") C.cuc = r.id;
    if (r.slug === "valledupar") C.val = r.id;
  }
  await t.q(
    `insert into public.pc_miembros (user_id, rol, programa_id, campus_id) values
       ($1, 'director', $4, $6), ($2, 'coordinador', $4, $6), ($3, 'director', $5, $7)`,
    [P.dirA, P.coordA, P.dirB, A, B, C.buc, C.cuc],
  );
  for (const r of await t.q<{ id: string; clave: string }>("select id, clave from public.pc_carpetas where fija")) carpetas[r.clave] = r.id;
}, 180_000);

afterAll(async () => t?.close());

describe("0164 · catálogo", () => {
  it("destinos, columnas y dominios de la semilla son los de lib/destinos.ts", async () => {
    const destinos = await t.q<{ id: string; n: string; bloq: boolean }>(
      "select d.id, count(c.id)::text as n, d.estructura_bloqueada as bloq from public.pc_destinos d left join public.pc_destino_columnas c on c.destino_id = d.id group by d.id order by d.id",
    );
    expect(destinos.map((d) => [d.id, Number(d.n)])).toEqual(DESTINOS.map((d) => [d.id, d.columnas.length]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    const dominios = await t.q<{ id: string; opciones: string[] }>("select id, opciones from public.pc_dominios order by id");
    expect(dominios.map((d) => d.id)).toEqual(DOMINIOS_PC.map((d) => d.id).sort());
    expect(dominios.find((d) => d.id === "tipo_proyecto")?.opciones).toEqual(DOMINIOS_PC.find((d) => d.id === "tipo_proyecto")?.opciones);
  });

  it("los cuadros 01 a 10 del CNA y las tres carpetas fijas existen", async () => {
    const cna = await t.q<{ id: string }>("select id from public.pc_destinos where sistema = 'CNA' order by orden");
    expect(cna.map((d) => d.id)).toEqual(["cna01", "cna02", "cna03", "cna04", "cna05", "cna06", "cna07", "cna08", "cna09", "cna10"]);
    expect(Object.keys(carpetas).sort()).toEqual(["cna", "snies", "trabajo"]);
  });
});

describe("0164 · espejo de la validación y de los periodos", () => {
  it("pc_error_valor da lo mismo que errorDeValor para los mismos valores", async () => {
    const listas = ["Investigación", "Creación"];
    const casos: [string, string[], boolean, unknown][] = [
      ["texto", [], true, ""], ["texto", [], false, null], ["texto", [], true, "  x "],
      ["numero", [], false, "12,5"], ["numero", [], false, 12], ["numero", [], false, "doce"], ["numero", [], false, "-3"], ["numero", [], true, "  "],
      ["porcentaje", [], false, "100"], ["porcentaje", [], false, "100,5"], ["porcentaje", [], false, 47.5], ["porcentaje", [], false, "abc"],
      ["fecha", [], false, "2026-02-30"], ["fecha", [], false, "2024-02-29"], ["fecha", [], false, "28/02/2026"], ["fecha", [], true, null],
      ["lista", listas, false, "Z"], ["lista", listas, false, "Creación"], ["lista", [], false, "lo que sea"],
    ];
    for (const [tipo, opciones, obligatorio, valor] of casos) {
      const [r] = await t.q<{ e: string | null }>("select public.pc_error_valor($1, $2::text[], $3, $4::jsonb) as e", [tipo, opciones, obligatorio, JSON.stringify(valor)]);
      expect(r.e ?? "", `${tipo} ${JSON.stringify(valor)}`).toBe(errorDeValor({ tipo: tipo as never, opciones, obligatorio }, valor));
    }
  });

  it("pc_codigos_ventana da la misma ruta que periodosDeVentana", async () => {
    for (const [anios, hasta] of [[5, "2025-02"], [6, "2025-02"], [8, "2026-01"], [10, "2026-01"]] as const) {
      const [r] = await t.q<{ c: string[] }>("select public.pc_codigos_ventana($1, $2) as c", [hasta, anios]);
      expect(r.c).toEqual(periodosDeVentana({ anios, hasta }));
    }
  });
});

describe("0164 · quién ve y quién edita", () => {
  it("sin sesión no hay nada, y quien no es del módulo no ve ni el catálogo", async () => {
    expect(await falla(null, "select * from public.pc_archivos")).toMatch(/permission denied/);
    await t.asUser(P.ajeno, async (q) => {
      expect(await q("select id from public.pc_destinos")).toEqual([]);
      expect(await q("select id from public.pc_carpetas")).toEqual([]);
      expect(await q("select public.pc_yo() as yo")).toMatchObject([{ yo: { planeacion: false, programas: [] } }]);
    });
  });

  it("pc_yo: el Director ve su pareja; Planeación ve todas las que ofrece program_campuses", async () => {
    const [dir] = await t.asUser(P.dirA, (q) => q<{ yo: { planeacion: boolean; programas: { programa_id: string; campus_id: string; rol: string }[] } }>("select public.pc_yo() as yo"));
    expect(dir.yo.planeacion).toBe(false);
    expect(dir.yo.programas.map((p) => [p.programa_id, p.campus_id, p.rol])).toEqual([[A, C.buc, "director"]]);
    const [pl] = await t.asUser(P.planeacion, (q) => q<{ yo: { planeacion: boolean; programas: { rol: string }[] } }>("select public.pc_yo() as yo"));
    expect(pl.yo.planeacion).toBe(true);
    expect(pl.yo.programas.length).toBe(7);
    expect(new Set(pl.yo.programas.map((p) => p.rol))).toEqual(new Set(["planeacion"]));
  });

  it("el Director crea el archivo de un cuadro del CNA; otro programa y Planeación no pueden", async () => {
    const [a] = await como<{ id: string; bloqueado: boolean; estado: string }>(
      P.dirA,
      "select * from public.pc_crear_archivo($1, $2, $3, 'Grupos y líneas', 'tabla', 'cna07')",
      [A, C.buc, carpetas.cna],
    );
    cna07 = a.id;
    expect(a).toMatchObject({ bloqueado: true, estado: "borrador" });
    expect(await falla(P.dirB, "select * from public.pc_crear_archivo($1, $2, $3, 'X', 'tabla', 'cna08')", [A, C.buc, carpetas.cna])).toMatch(/Solo el Director o el Coordinador/);
    expect(await falla(P.planeacion, "select * from public.pc_crear_archivo($1, $2, $3, 'X', 'tabla', 'cna08')", [A, C.buc, carpetas.cna])).toMatch(/Solo el Director o el Coordinador/);
    expect(await falla(P.ajeno, "select * from public.pc_crear_archivo($1, $2, $3, 'X', 'tabla', 'cna08')", [A, C.buc, carpetas.cna])).toMatch(/Solo el Director o el Coordinador/);
  });

  it("el programa ve lo suyo; Planeación ve todo; el Director de otro programa no ve nada ajeno", async () => {
    expect((await t.asUser(P.dirA, (q) => q("select id from public.pc_archivos"))).length).toBe(1);
    expect((await t.asUser(P.coordA, (q) => q("select id from public.pc_archivos"))).length).toBe(1);
    expect((await t.asUser(P.planeacion, (q) => q("select id from public.pc_archivos"))).length).toBe(1);
    expect(await t.asUser(P.dirB, (q) => q("select id from public.pc_archivos"))).toEqual([]);
    expect(await t.asUser(P.dirB, (q) => q("select id from public.pc_columnas"))).toEqual([]);
    expect(await t.asUser(P.ajeno, (q) => q("select id from public.pc_archivos"))).toEqual([]);
  });

  it("Planeación no edita nada: ni filas, ni archivos, ni estado, ni columnas", async () => {
    expect(await falla(P.planeacion, "select public.pc_guardar_filas($1, $2)", [cna07, JSON.stringify([{ datos: { grupo: "X" } }])])).toMatch(/Solo el Director o el Coordinador/);
    expect(await falla(P.planeacion, "insert into public.pc_filas (archivo_id, datos) values ($1, '{}')", [cna07])).toMatch(/Planeación solo observa|row-level security/);
    // Sin política de escritura, el update no encuentra filas: el archivo queda igual.
    await como(P.planeacion, "update public.pc_archivos set nombre = 'Otro' where id = $1", [cna07]);
    expect((await t.q<{ nombre: string }>("select nombre from public.pc_archivos where id = $1", [cna07]))[0].nombre).toBe("Grupos y líneas");
    expect(await falla(P.planeacion, "select public.pc_marcar_listo($1, true)", [cna07])).toMatch(/Solo el Director o el Coordinador/);
    expect(await falla(P.planeacion, "select public.pc_cerrar_periodo($1, $2, '2021-01')", [A, C.buc])).toMatch(/Solo el Director o el Coordinador/);
  });
});

describe("0164 · estructura bloqueada y columnas de solo lectura", () => {
  it("un cuadro del CNA trae las columnas del catálogo y no deja cambiarlas ni quitarlas", async () => {
    const cols = await t.q<{ clave: string; opciones: string[] }>("select clave, opciones from public.pc_columnas where archivo_id = $1 order by orden", [cna07]);
    expect(cols.map((c) => c.clave)).toEqual(DESTINOS.find((d) => d.id === "cna07")!.columnas.map((c) => c.clave));
    expect(cols.find((c) => c.clave === "categoria_957_2024")?.opciones).toContain("A1");
    expect(await falla(P.dirA, "delete from public.pc_columnas where archivo_id = $1 and clave = 'lineas'", [cna07])).toMatch(/fija el CNA/);
    expect(await falla(P.dirA, "update public.pc_columnas set obligatorio = true where archivo_id = $1 and clave = 'lineas'", [cna07])).toMatch(/fija el CNA/);
    expect(await falla(P.dirA, "insert into public.pc_columnas (archivo_id, clave, etiqueta) values ($1, 'extra', 'Extra')", [cna07])).toMatch(/fija el CNA/);
    expect(await falla(P.dirA, "delete from public.pc_archivos where id = $1", [cna07])).toMatch(/no se eliminan/);
  });

  it("el archivo queda unido a su cuadro (mapa) y no se desconecta", async () => {
    const [r] = await t.q<{ mapa: Record<string, string> }>("select mapa from public.pc_respuestas where archivo_id = $1 and destino_id = 'cna07'", [cna07]);
    expect(Object.keys(r.mapa).length).toBe(DESTINOS.find((d) => d.id === "cna07")!.columnas.length);
    expect(await falla(P.dirA, "delete from public.pc_respuestas where archivo_id = $1 and destino_id = 'cna07'", [cna07])).toMatch(/no se desconecta/);
  });

  it("un cuadro del CNA tiene un solo archivo por programa y campus; uno automático no lleva archivo", async () => {
    expect(await falla(P.dirA, "select * from public.pc_crear_archivo($1, $2, $3, 'Otro 07', 'tabla', 'cna07')", [A, C.buc, carpetas.cna])).toMatch(/duplicate key|unique/i);
    expect(await falla(P.dirA, "select * from public.pc_crear_archivo($1, $2, $3, 'Estudiantes', 'tabla', 'cna02')", [A, C.buc, carpetas.cna])).toMatch(/lo llena el sistema/);
  });

  it("las columnas de solo lectura (Warehouse) no se escriben, y guardar filas conserva sus valores", async () => {
    const [a04] = await como<{ id: string }>(P.dirA, "select * from public.pc_crear_archivo($1, $2, $3, 'Profesores', 'tabla', 'cna04')", [A, C.buc, carpetas.cna]);
    // El sistema (sin sesión) trae la fila del Warehouse.
    await t.q(
      `insert into public.pc_filas (archivo_id, programa_id, campus_id, datos, origen)
       values ($1, $2, $3, '{"cedula":"1098765432","nombres":"Marta Ruiz","horas_docencia":18}', 'sistema')`,
      [a04.id, A, C.buc],
    );
    expect(await falla(P.dirA, "insert into public.pc_filas (archivo_id, datos) values ($1, '{\"cedula\":\"1\"}')", [a04.id])).toMatch(/viene del Warehouse/);
    const [fila] = await t.q<{ id: string }>("select id from public.pc_filas where archivo_id = $1", [a04.id]);
    expect(await falla(P.dirA, "update public.pc_filas set datos = datos || '{\"cedula\":\"9\"}' where id = $1", [fila.id])).toMatch(/viene del Warehouse/);
    // El Director completa lo suyo sin mandar la cédula: la base la conserva.
    const [r] = await como<{ r: { actualizadas: number } }>(P.dirA, "select public.pc_guardar_filas($1, $2) as r", [
      a04.id,
      JSON.stringify([{ id: fila.id, datos: { nivel_formacion: "Doctorado", enlace_cvlac: "https://scienti/1", horas_investigacion: 12 } }]),
    ]);
    expect(r.r.actualizadas).toBe(1);
    const [despues] = await t.q<{ datos: Record<string, unknown> }>("select datos from public.pc_filas where id = $1", [fila.id]);
    expect(despues.datos).toMatchObject({ cedula: "1098765432", nombres: "Marta Ruiz", nivel_formacion: "Doctorado", horas_investigacion: 12 });
    // Los valores de solo lectura no se validan: «Indefinido TC» no está en la lista y no cuenta como error.
    await t.q("update public.pc_filas set datos = datos || '{\"tipo_contratacion\":\"Indefinido TC\"}' where id = $1", [fila.id]);
    const [{ n }] = await t.q<{ n: string }>("select count(*)::text as n from public.pc_errores_internos($1)", [a04.id]);
    expect(Number(n)).toBe(0);
  });
});

describe("0164 · filas, validación y estados", () => {
  it("un borrador guarda lo escrito aunque tenga errores; la forma sí se exige", async () => {
    const filas = [
      { datos: { grupo: "Grupo de Software", codigo_grupo: "COL0054321", categoria_957_2024: "B", lineas: "Calidad" } },
      { datos: { grupo: "Grupo de Redes", codigo_grupo: "COL0099002", categoria_957_2024: "Z" } },
    ];
    const [r] = await como<{ r: { insertadas: number } }>(P.coordA, "select public.pc_guardar_filas($1, $2) as r", [cna07, JSON.stringify(filas)]);
    expect(r.r.insertadas).toBe(2);
    expect(await falla(P.coordA, "select public.pc_guardar_filas($1, $2)", [cna07, JSON.stringify([{ datos: { no_existe: "x" } }])])).toMatch(/no existe en este archivo/);
    expect(await falla(P.coordA, "select public.pc_guardar_filas($1, $2)", [cna07, JSON.stringify([{ datos: { grupo: { a: 1 } } }])])).toMatch(/texto o número/);
  });

  it("pc_errores_archivo y pc_resumen_archivos cuentan los errores; Planeación los ve", async () => {
    const errores = await t.asUser(P.planeacion, (q) => q<{ clave: string; mensaje: string }>("select * from public.pc_errores_archivo($1)", [cna07]));
    expect(errores.map((e) => [e.clave, e.mensaje])).toEqual([["categoria_957_2024", "Elija de la lista"]]);
    const [res] = await t.asUser(P.dirA, (q) => q<{ filas: string; errores: string }>("select filas::text, errores::text from public.pc_resumen_archivos($1, $2) where archivo_id = $3", [A, C.buc, cna07]));
    expect([Number(res.filas), Number(res.errores)]).toEqual([2, 1]);
    expect(await falla(P.dirB, "select * from public.pc_errores_archivo($1)", [cna07])).toMatch(/No tiene acceso/);
  });

  it("no se marca listo con errores; corregido, sí; editar lo devuelve a borrador; el estado no se cambia a mano", async () => {
    expect(await falla(P.dirA, "select public.pc_marcar_listo($1, true)", [cna07])).toMatch(/1 celda\(s\) con error/);
    const [mala] = await t.q<{ id: string }>("select id from public.pc_filas where archivo_id = $1 and datos ->> 'categoria_957_2024' = 'Z'", [cna07]);
    // Obligatorios: sin código de grupo también es error.
    await como(P.dirA, "update public.pc_filas set datos = datos || '{\"categoria_957_2024\":\"C\"}' where id = $1", [mala.id]);
    const [listo] = await como<{ estado: string; listo_por: string }>(P.dirA, "select * from public.pc_marcar_listo($1, true)", [cna07]);
    expect(listo).toMatchObject({ estado: "listo", listo_por: P.dirA });
    expect(await falla(P.dirA, "update public.pc_archivos set estado = 'borrador' where id = $1", [cna07])).toMatch(/Marcar como listo/);
    await como(P.coordA, "update public.pc_filas set datos = datos || '{\"lineas\":\"Algoritmos\"}' where id = $1", [mala.id]);
    const [a] = await t.q<{ estado: string; listo_en: string | null }>("select estado, listo_en from public.pc_archivos where id = $1", [cna07]);
    expect(a).toEqual({ estado: "borrador", listo_en: null });
    await como(P.dirA, "select * from public.pc_marcar_listo($1, true)", [cna07]);
    const [b] = await como<{ estado: string }>(P.dirA, "select * from public.pc_marcar_listo($1, false)", [cna07]);
    expect(b.estado).toBe("borrador");
  });

  it("la regla fin ≥ inicio impide marcar listo (cuadro 08)", async () => {
    const [a08] = await como<{ id: string }>(P.dirA, "select * from public.pc_crear_archivo($1, $2, $3, 'Proyectos', 'tabla', 'cna08')", [A, C.buc, carpetas.cna]);
    await como(P.dirA, "select public.pc_guardar_filas($1, $2)", [
      a08.id,
      JSON.stringify([{ datos: { proyecto: "Laboratorio de IoT", tipo_proyecto: "Innovación", inicio: "2025-06-10", fin: "2025-01-30" } }]),
    ]);
    const errores = await t.q<{ clave: string; mensaje: string }>("select clave, mensaje from public.pc_errores_internos($1)", [a08.id]);
    expect(errores).toEqual([{ clave: "fin", mensaje: "Es anterior a «Inicio»" }]);
    expect(await falla(P.dirA, "select public.pc_marcar_listo($1, true)", [a08.id])).toMatch(/error/);
  });

  it("un archivo libre cambia su estructura; al quitar una columna se limpian filas y mapas; los de otro programa no se tocan", async () => {
    const [a] = await como<{ id: string; bloqueado: boolean }>(
      P.dirA,
      "select * from public.pc_crear_archivo($1, $2, $3, 'Participantes', 'tabla', 'snies_participante', $4, $5)",
      [
        A,
        C.buc,
        carpetas.snies,
        JSON.stringify([
          { clave: "primer_nombre", etiqueta: "Primer nombre", tipo: "texto", obligatorio: true },
          { clave: "nacimiento", etiqueta: "Fecha de nacimiento", tipo: "fecha" },
          { clave: "extra", etiqueta: "Extra", tipo: "texto" },
        ]),
        JSON.stringify([{ datos: { primer_nombre: "Ana", nacimiento: "2003-04-12", extra: "x" } }]),
      ],
    );
    expect(a.bloqueado).toBe(false);
    await como(P.dirA, "update public.pc_respuestas set mapa = '{\"primer_nombre\":\"primer_nombre\",\"fecha_nacimiento\":\"nacimiento\"}' where archivo_id = $1", [a.id]);
    await como(P.dirA, "delete from public.pc_columnas where archivo_id = $1 and clave = 'nacimiento'", [a.id]);
    const [fila] = await t.q<{ datos: Record<string, unknown> }>("select datos from public.pc_filas where archivo_id = $1", [a.id]);
    expect(fila.datos).toEqual({ primer_nombre: "Ana", extra: "x" });
    const [r] = await t.q<{ mapa: Record<string, string> }>("select mapa from public.pc_respuestas where archivo_id = $1", [a.id]);
    expect(r.mapa).toEqual({ primer_nombre: "primer_nombre" });
    expect(await falla(P.dirA, "update public.pc_respuestas set mapa = '{\"primer_nombre\":\"no_existe\"}' where archivo_id = $1", [a.id])).toMatch(/no existe en este archivo/);
    expect(await falla(P.dirA, "update public.pc_columnas set solo_lectura = 'Warehouse' where archivo_id = $1 and clave = 'extra'", [a.id])).toMatch(/Solo el sistema/);
    // El Director de otro programa no ve el archivo: borrar no toca nada.
    await como(P.dirB, "delete from public.pc_archivos where id = $1", [a.id]);
    expect((await t.q("select id from public.pc_archivos where id = $1", [a.id])).length).toBe(1);
    await como(P.dirA, "delete from public.pc_archivos where id = $1", [a.id]);
    const log = await t.q<{ accion: string }>("select accion from public.pc_actividad where programa_id = $1 order by id", [A]);
    expect(log.map((l) => l.accion)).toContain("archivo_eliminado");
  });
});

describe("0164 · periodos en orden estricto", () => {
  it("sin ventana no se cierra nada; la ventana de 5 años hasta 2025-02 va de 2021-01 a 2025-02", async () => {
    expect(await falla(P.dirA, "select public.pc_cerrar_periodo($1, $2, '2021-01')", [A, C.buc])).toMatch(/Defina primero la ventana/);
    expect(await falla(P.dirA, "select public.pc_definir_ventana($1, $2, 7, '2025-02')", [A, C.buc])).toMatch(/5, 6, 8 o 10/);
    expect(await falla(P.dirA, "select public.pc_definir_ventana($1, $2, 5, '2025-03')", [A, C.buc])).toMatch(/AAAA-01 o AAAA-02/);
    const [v] = await como<{ e: { periodos: { codigo: string }[]; siguiente: string; total: number } }>(P.dirA, "select public.pc_definir_ventana($1, $2, 5, '2025-02') as e", [A, C.buc]);
    expect(v.e.periodos.map((p) => p.codigo)).toEqual(["2021-01", "2021-02", "2022-01", "2022-02", "2023-01", "2023-02", "2024-01", "2024-02", "2025-01", "2025-02"]);
    expect([v.e.siguiente, v.e.total]).toEqual(["2021-01", 10]);
    // Otro campus del mismo programa no la comparte.
    expect(await t.asUser(P.planeacion, (q) => q("select * from public.pc_ventanas where campus_id = $1", [C.cuc]))).toEqual([]);
  });

  it("nunca se cierra un periodo si el anterior está abierto; los archivos con errores impiden cerrar", async () => {
    expect(await falla(P.dirA, "select public.pc_cerrar_periodo($1, $2, '2021-02')", [A, C.buc])).toMatch(/cerrar primero el periodo 2021-01/);
    expect(await falla(P.dirA, "select public.pc_cerrar_periodo($1, $2, '2030-01')", [A, C.buc])).toMatch(/no está en la ventana/);
    // El cuadro 08 de la prueba anterior tiene un error.
    expect(await falla(P.dirA, "select public.pc_cerrar_periodo($1, $2, '2021-01')", [A, C.buc])).toMatch(/Corrija los 1 errores/);
    await t.q("delete from public.pc_archivos where destino_origen = 'cna08'");
  });

  it("se cierran en orden, año a año y semestre a semestre", async () => {
    const codigos = ["2021-01", "2021-02", "2022-01", "2022-02", "2023-01", "2023-02", "2024-01", "2024-02", "2025-01"];
    for (const c of codigos) await como(P.coordA, "select public.pc_cerrar_periodo($1, $2, $3)", [A, C.buc, c]);
    expect(await falla(P.dirA, "select public.pc_cerrar_periodo($1, $2, '2021-01')", [A, C.buc])).toMatch(/ya está cerrado/);
    const [e] = await t.asUser(P.planeacion, (q) => q<{ e: { cerrados: number; siguiente: string; completa: boolean } }>("select public.pc_estado_periodos($1, $2) as e", [A, C.buc]));
    expect(e.e).toMatchObject({ cerrados: 9, siguiente: "2025-02", completa: false });
    // La ventana solo cambia si lo cerrado sigue siendo el comienzo de la ruta.
    expect(await falla(P.dirA, "select public.pc_definir_ventana($1, $2, 5, '2027-02')", [A, C.buc])).toMatch(/no encajan/);
    await como(P.dirA, "select public.pc_definir_ventana($1, $2, 6, '2026-02')", [A, C.buc]);
  });

  it("emitir exige ventana completa y archivos del CNA listos; solo se reabre el último periodo", async () => {
    await como(P.dirA, "select public.pc_definir_ventana($1, $2, 5, '2025-02')", [A, C.buc]);
    expect(await falla(P.dirA, "select * from public.pc_registrar_emision($1, $2, 'Cuadro Maestro.xlsx')", [A, C.buc])).toMatch(/no está completa/);
    await como(P.dirA, "select public.pc_cerrar_periodo($1, $2, '2025-02')", [A, C.buc]);
    expect(await falla(P.dirA, "select * from public.pc_registrar_emision($1, $2, 'Cuadro Maestro.xlsx')", [A, C.buc])).toMatch(/no están listos/);
    await como(P.dirA, "select * from public.pc_marcar_listo($1, true)", [cna07]);
    const [ya] = await t.q<{ id: string }>("select id from public.pc_archivos where destino_origen = 'cna04'");
    await como(P.dirA, "select * from public.pc_marcar_listo($1, true)", [ya.id]);
    const [em] = await como<{ accion: string; detalle: { hasta: string; nombre: string } }>(P.coordA, "select * from public.pc_registrar_emision($1, $2, 'Cuadro Maestro.xlsx')", [A, C.buc]);
    expect(em).toMatchObject({ accion: "emision", detalle: { hasta: "2025-02", nombre: "Cuadro Maestro.xlsx" } });
    expect(await falla(P.dirA, "select public.pc_reabrir_periodo($1, $2, '2025-01')", [A, C.buc])).toMatch(/último periodo cerrado/);
    const [r] = await como<{ e: { completa: boolean; siguiente: string } }>(P.dirA, "select public.pc_reabrir_periodo($1, $2, '2025-02') as e", [A, C.buc]);
    expect(r.e).toMatchObject({ completa: false, siguiente: "2025-02" });
  });
});

describe("0164 · miembros", () => {
  it("la administración nombra; el Director nombra Coordinadores de su programa; nadie más", async () => {
    await t.q("update public.profiles set role = 'admin' where id = $1", [P.ajeno]);
    expect((await como(P.ajeno, "insert into public.pc_miembros (user_id, rol, programa_id, campus_id) values ($1, 'director', $2, $3) returning id", [P.dirB, B, C.buc])).length).toBe(1);
    expect((await como(P.dirA, "insert into public.pc_miembros (user_id, rol, programa_id, campus_id) values ($1, 'coordinador', $2, $3) returning id", [P.ajeno, A, C.buc])).length).toBe(1);
    expect(await falla(P.dirA, "insert into public.pc_miembros (user_id, rol, programa_id, campus_id) values ($1, 'director', $2, $3)", [P.ajeno, A, C.cuc])).toMatch(/row-level security/);
    expect(await falla(P.coordA, "insert into public.pc_miembros (user_id, rol, programa_id, campus_id) values ($1, 'coordinador', $2, $3)", [P.ajeno, A, C.buc])).toMatch(/row-level security/);
    // Un programa que no se ofrece en ese campus no tiene miembros.
    await t.q("update public.profiles set role = 'admin' where id = $1", [P.planeacion]);
    expect(await falla(P.planeacion, "insert into public.pc_miembros (user_id, rol, programa_id, campus_id) values ($1, 'director', $2, $3)", [P.dirB, A, C.val])).toMatch(/no se ofrece en ese campus/);
  });
});
