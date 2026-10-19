/* Migración 0151 (Internacionalización) en un Postgres en memoria: RLS por
   campus, flujo de estados, ventanas, cifras solo de lo aprobado y el puente
   SNIES idempotente (con las filas armadas por lib/puente-snies.ts). */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONCEPTOS_BASE } from "../../src/modules/internacionalizacion/lib/conceptos";
import { construirEnvioSnies, definicionPuente } from "../../src/modules/internacionalizacion/lib/puente-snies";
import { DOMINIOS } from "../../src/modules/reportes/snies/dominios";
import { plantilla } from "../../src/modules/reportes/snies/plantillas";
import type { ItemCatalogo } from "../../src/modules/reportes/tipos";
import { armarContexto } from "../../src/modules/reportes/util";
import { createTestDb, errorOf, type TestDb } from "../db/harness";

const P = {
  director: "00000000-0000-4000-a000-0000000000d1",
  coordCuc: "00000000-0000-4000-a000-0000000000d2",
  gestorCuc: "00000000-0000-4000-a000-0000000000d3",
  gestorBuc: "00000000-0000-4000-a000-0000000000d4",
  ajeno: "00000000-0000-4000-a000-0000000000d5",
  coordBuc: "00000000-0000-4000-a000-0000000000d6",
};

let t: TestDb;
const C: Record<"cuc" | "buc" | "val" | "bog", string> = { cuc: "", buc: "", val: "", bog: "" };
let periodo = "";
let saliente = "";
let cerrada = "";
let personas = "";

const fila = (q: TestDb["q"], hoja: string, campus: string, datos: Record<string, unknown>) =>
  q<{ id: string }>("insert into public.int_filas (hoja_id, periodo_id, campus_id, datos) values ($1, $2, $3, $4) returning id", [
    hoja,
    periodo,
    campus,
    JSON.stringify(datos),
  ]);

const estado = (q: TestDb["q"], hoja: string, campus: string, a: string, nota: string | null = null) =>
  q("select public.int_cambiar_estado($1, $2, $3, $4, $5)", [periodo, hoja, campus, a, nota]);

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
  for (const r of await t.q<{ id: string; slug: string }>("select id, slug from public.campuses")) {
    if (r.slug === "cucuta") C.cuc = r.id;
    if (r.slug === "bucaramanga") C.buc = r.id;
    if (r.slug === "valledupar") C.val = r.id;
    if (r.slug === "bogota") C.bog = r.id;
  }
  await t.q(
    `insert into public.int_miembros (user_id, rol, campus_id) values
       ($1, 'director', null), ($2, 'coordinador', $5), ($3, 'gestor', $5), ($4, 'gestor', $6), ($7, 'coordinador', $6)`,
    [P.director, P.coordCuc, P.gestorCuc, P.gestorBuc, C.cuc, C.buc, P.coordBuc],
  );

  const [libro] = await t.q<{ id: string }>("insert into public.int_libros (nombre) values ('Movilidad estudiantil') returning id");
  [{ id: saliente }] = await t.q<{ id: string }>(
    "insert into public.int_hojas (libro_id, nombre, clase, sentido) values ($1, 'Saliente', 'movilidad', 'saliente') returning id",
    [libro.id],
  );
  [{ id: cerrada }] = await t.q<{ id: string }>("insert into public.int_hojas (libro_id, nombre, clase) values ($1, 'Entrante', 'movilidad') returning id", [
    libro.id,
  ]);
  [{ id: personas }] = await t.q<{ id: string }>("insert into public.int_hojas (libro_id, nombre, clase, sentido) values ($1, 'Visitantes', 'movilidad', 'entrante') returning id", [
    libro.id,
  ]);
  for (const h of [saliente, cerrada]) {
    await t.q(
      `insert into public.int_columnas (hoja_id, clave, etiqueta, tipo, concepto_id, obligatorio, opciones, calculo, orden) values
         ($1, 'numero_documento', 'Número de documento', 'texto', 'numero_documento', true, '{}', null, 1),
         ($1, 'pais_contraparte', 'País', 'texto', 'pais_contraparte', false, '{}', null, 2),
         ($1, 'financiacion', 'Financiación', 'lista', 'financiacion', false, '{Propia,"Beca UDES",Convenio,Externa}', null, 3),
         ($1, 'fecha_inicio', 'Inicio', 'fecha', 'fecha_inicio', false, '{}', null, 4),
         ($1, 'fecha_fin', 'Fin', 'fecha', 'fecha_fin', false, '{}', null, 5),
         ($1, 'duracion_dias', 'Duración', 'calculado', 'duracion_dias', false, '{}', '{"tipo":"dias_entre","desde":"fecha_inicio","hasta":"fecha_fin"}', 6)`,
      [h],
    );
  }
  const personales: [string, string, string][] = [
    ["tipo_documento", "Tipo de documento", "lista"],
    ["numero_documento", "Número de documento", "texto"],
    ["primer_nombre", "Primer nombre", "texto"],
    ["primer_apellido", "Primer apellido", "texto"],
    ["sexo_biologico", "Sexo biológico", "lista"],
    ["estado_civil", "Estado civil", "lista"],
    ["fecha_nacimiento", "Fecha de nacimiento", "fecha"],
    ["pais_nacimiento", "País de nacimiento", "texto"],
    ["pais_contraparte", "País de origen", "texto"],
  ];
  for (const [i, [clave, etiqueta, tipo]] of personales.entries()) {
    const opciones = CONCEPTOS_BASE.find((c) => c.id === clave)?.opciones ?? [];
    await t.q("insert into public.int_columnas (hoja_id, clave, etiqueta, tipo, concepto_id, opciones, orden) values ($1, $2, $3, $4, $2, $5, $6)", [
      personas,
      clave,
      etiqueta,
      tipo,
      opciones,
      i,
    ]);
  }

  [{ id: periodo }] = await t.q<{ id: string }>("insert into public.int_periodos (codigo, nombre, cierra) values ('2026-2', 'Segundo semestre 2026', '2026-12-15') returning id");
  // Saliente y Visitantes, abiertas; Entrante, vencida.
  await t.q(
    `insert into public.int_ventanas (periodo_id, hoja_id, abre, cierra) values
       ($1, $2, public.int_hoy() - 5, public.int_hoy() + 5),
       ($1, $4, public.int_hoy() - 5, public.int_hoy() + 5),
       ($1, $3, public.int_hoy() - 30, public.int_hoy() - 1)`,
    [periodo, saliente, cerrada, personas],
  );
  // Una fila de Bucaramanga, cargada por el servicio.
  await fila(t.q, saliente, C.buc, { numero_documento: "1001", pais_contraparte: "México" });
}, 180_000);

afterAll(async () => t?.close());

describe("0151 · catálogo", () => {
  it("la semilla de conceptos es la de lib/conceptos.ts", async () => {
    const ids = (await t.q<{ id: string }>("select id from public.int_conceptos order by id")).map((r) => r.id);
    expect(ids).toEqual(CONCEPTOS_BASE.map((c) => c.id).sort());
  });

  it("sin sesión no se lee nada, y quien no es del módulo tampoco ve filas ni estructura", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select * from public.int_filas")))).toMatch(/permission denied/);
    await t.asUser(P.ajeno, async (q) => {
      expect(await q("select id from public.int_filas")).toEqual([]);
      expect(await q("select id from public.int_libros")).toEqual([]);
      expect(await errorOf(q("select public.int_cifras($1)", [periodo]))).toMatch(/Sin permiso/);
    });
  });
});

describe("0151 · cada campus sus filas", () => {
  it("un Gestor de Cúcuta no ve ni edita filas de Bucaramanga", async () => {
    await t.asUser(P.gestorCuc, async (q) => {
      expect(await q("select id from public.int_filas")).toEqual([]);
      const cambiadas = await q("update public.int_filas set datos = '{}'::jsonb where campus_id = $1 returning id", [C.buc]);
      expect(cambiadas).toEqual([]);
      await fila(q, saliente, C.cuc, { numero_documento: "9" });
      expect(await q("select campus_id from public.int_filas")).toEqual([{ campus_id: C.cuc }]);
    });
    expect(await errorOf(t.asUser(P.gestorCuc, (q) => fila(q, saliente, C.buc, { numero_documento: "9" })))).toMatch(/No tiene permiso|row-level security/);
  });

  it("la base revisa la forma de los datos (lista, fecha, columnas que no existen)", async () => {
    const intentar = (datos: Record<string, unknown>) => errorOf(t.asUser(P.gestorCuc, (q) => fila(q, saliente, C.cuc, datos)));
    expect(await intentar({ financiacion: "Regalo" })).toMatch(/no es una opción/);
    expect(await intentar({ fecha_inicio: "2026-02-30" })).toMatch(/fecha AAAA-MM-DD/);
    expect(await intentar({ inventada: "x" })).toMatch(/no existe/);
  });

  it("nadie edita fuera de la ventana, salvo el Director", async () => {
    expect(await errorOf(t.asUser(P.gestorCuc, (q) => fila(q, cerrada, C.cuc, { numero_documento: "1" })))).toMatch(/ventana de captura/);
    expect(await errorOf(t.asUser(P.coordCuc, (q) => fila(q, cerrada, C.cuc, { numero_documento: "1" })))).toMatch(/ventana de captura/);
    await t.asUser(P.director, (q) => fila(q, cerrada, C.cuc, { numero_documento: "1" }));
  });

  it("reabrir una ventana vencida pide motivo y queda escrito", async () => {
    expect(
      await errorOf(t.asUser(P.director, (q) => q("update public.int_ventanas set cierra = public.int_hoy() + 3 where hoja_id = $1", [cerrada]))),
    ).toMatch(/pide un motivo/);
    expect(await errorOf(t.asUser(P.gestorCuc, (q) => q("select public.int_reabrir($1, 'Por favor', $2, null, public.int_hoy() + 3)", [periodo, cerrada])))).toMatch(
      /Solo el Director/,
    );
    await t.asUser(P.director, (q) => q("select public.int_reabrir($1, 'Cúcuta pidió dos días', $2, $3, public.int_hoy() + 2)", [periodo, cerrada, C.cuc]), {
      commit: true,
    });
    expect(await t.q("select tipo, motivo, campus_id from public.int_reaperturas")).toEqual([{ tipo: "ventana", motivo: "Cúcuta pidió dos días", campus_id: C.cuc }]);
    // La ventana de Cúcuta manda sobre la general: Cúcuta captura, Bucaramanga no.
    await t.asUser(P.gestorCuc, (q) => fila(q, cerrada, C.cuc, { numero_documento: "2" }));
    expect(await errorOf(t.asUser(P.gestorBuc, (q) => fila(q, cerrada, C.buc, { numero_documento: "2" })))).toMatch(/ventana de captura/);
  });

  it("carga masiva: el Gestor reemplaza solo lo de su campus", async () => {
    await t.asUser(P.gestorCuc, async (q) => {
      const [r] = await q<{ int_guardar_filas: Record<string, number> }>("select public.int_guardar_filas($1, $2, $3, $4)", [
        saliente,
        periodo,
        JSON.stringify([
          { campus_id: C.cuc, datos: { numero_documento: "11", pais_contraparte: "Chile" } },
          { campus_id: C.cuc, datos: { numero_documento: "12", pais_contraparte: "Perú" } },
        ]),
        [C.cuc],
      ]);
      expect(r.int_guardar_filas).toEqual({ insertadas: 2, actualizadas: 0, borradas: 0 });
    });
    expect(
      await errorOf(
        t.asUser(P.gestorCuc, (q) => q("select public.int_guardar_filas($1, $2, $3)", [saliente, periodo, JSON.stringify([{ campus_id: C.buc, datos: {} }])])),
      ),
    ).toMatch(/No tiene permiso|row-level security/);
    expect(await t.q("select id from public.int_filas where campus_id = $1", [C.buc])).toHaveLength(1);
  });
});

describe("0151 · flujo y cifras", () => {
  beforeAll(async () => {
    await t.asUser(
      P.gestorCuc,
      (q) =>
        q("select public.int_guardar_filas($1, $2, $3)", [
          saliente,
          periodo,
          JSON.stringify([
            { campus_id: C.cuc, datos: { numero_documento: "21", pais_contraparte: "Chile" } },
            { campus_id: C.cuc, datos: { numero_documento: "22", pais_contraparte: "Chile" } },
          ]),
        ]),
      { commit: true },
    );
  });

  it("solo lo aprobado cuenta; el Coordinador valida solo su campus", async () => {
    const cifras = (who: string, incluir = "aprobado") =>
      t.asUser(who, async (q) => (await q<{ c: Record<string, never[]> }>("select public.int_cifras($1, $2) as c", [periodo, incluir]))[0].c);

    expect((await cifras(P.director)).movilidad).toEqual([]);

    await t.asUser(P.gestorCuc, (q) => estado(q, saliente, C.cuc, "enviado"), { commit: true });
    // Enviada: el Gestor ya no la corrige.
    expect(await errorOf(t.asUser(P.gestorCuc, (q) => fila(q, saliente, C.cuc, { numero_documento: "23" })))).toMatch(/ya se envió/);
    // El Director puede pedir lo enviado; para los demás no cambia nada.
    expect((await cifras(P.director, "enviado")).movilidad).toEqual([{ campus_id: C.cuc, sentido: "saliente", total: 2 }]);
    expect((await cifras(P.gestorCuc, "enviado")).movilidad).toEqual([]);

    // El Coordinador de Cúcuta no valida Bucaramanga, ni el Gestor valida.
    expect(await errorOf(t.asUser(P.coordCuc, (q) => estado(q, saliente, C.buc, "validado")))).toMatch(/No tiene permiso/);
    expect(await errorOf(t.asUser(P.gestorCuc, (q) => estado(q, saliente, C.cuc, "validado")))).toMatch(/no permitido/);
    await t.asUser(P.coordCuc, (q) => estado(q, saliente, C.cuc, "validado"), { commit: true });
    expect(await errorOf(t.asUser(P.coordCuc, (q) => estado(q, saliente, C.cuc, "aprobado")))).toMatch(/no permitido/);
    await t.asUser(P.director, (q) => estado(q, saliente, C.cuc, "aprobado"), { commit: true });

    const c = await cifras(P.director);
    expect(c.movilidad).toEqual([{ campus_id: C.cuc, sentido: "saliente", total: 2 }]);
    expect(c.por_pais).toEqual([{ pais: "Chile", sentido: "saliente", total: 2 }]);
    expect(c.personas).toEqual([{ campus_id: C.cuc, total: 2 }]);

    // El Gestor de Bucaramanga solo ve su campus en el avance y no ve lo de Cúcuta.
    const deBuc = await cifras(P.gestorBuc);
    expect(new Set((deBuc.avance as { campus_id: string }[]).map((a) => a.campus_id))).toEqual(new Set([C.buc]));
    expect(deBuc.movilidad).toEqual([]);
  });

  it("aprobada no la cambia nadie; reabrirla pide motivo y queda registrado", async () => {
    expect(await errorOf(t.asUser(P.director, (q) => fila(q, saliente, C.cuc, { numero_documento: "24" })))).toMatch(/ya está aprobada/);
    expect(await errorOf(t.asUser(P.coordCuc, (q) => estado(q, saliente, C.cuc, "borrador", "Corregir")))).toMatch(/no permitido/);
    expect(await errorOf(t.asUser(P.director, (q) => estado(q, saliente, C.cuc, "borrador")))).toMatch(/motivo/);
    await t.asUser(P.director, async (q) => {
      await estado(q, saliente, C.cuc, "borrador", "Faltó un estudiante");
      const r = await q<{ tipo: string; motivo: string }>("select tipo, motivo from public.int_reaperturas where tipo = 'envio'");
      expect(r).toEqual([{ tipo: "envio", motivo: "Faltó un estudiante" }]);
      const h = await q<{ de: string; a: string }>("select de, a from public.int_envios_historial where hoja_id = $1 order by id", [saliente]);
      expect(h.map((x) => `${x.de}→${x.a}`)).toEqual(["borrador→enviado", "enviado→validado", "validado→aprobado", "aprobado→borrador"]);
    });
  });

  it("no se envía con obligatorios vacíos", async () => {
    await t.asUser(P.gestorBuc, async (q) => {
      await fila(q, saliente, C.buc, { pais_contraparte: "Perú" });
      expect(await errorOf(estado(q, saliente, C.buc, "enviado"))).toMatch(/obligatorios vacíos/);
    });
  });
});

describe("0151 · puente SNIES", () => {
  let aprobadas: { id: string; campus_id: string; datos: Record<string, string> }[] = [];

  beforeAll(async () => {
    const base = {
      tipo_documento: "Pasaporte",
      primer_nombre: "Ana",
      primer_apellido: "Ruiz",
      sexo_biologico: "Mujer",
      estado_civil: "Soltero(a)",
      fecha_nacimiento: "2001-04-09",
      pais_nacimiento: "Ecuador",
      pais_contraparte: "Ecuador",
    };
    await t.asUser(
      P.gestorCuc,
      async (q) => {
        await fila(q, personas, C.cuc, { ...base, numero_documento: "AB.123" });
        await fila(q, personas, C.cuc, { ...base, numero_documento: "CD456", primer_nombre: "Luis", sexo_biologico: "Hombre" });
        await estado(q, personas, C.cuc, "enviado");
      },
      { commit: true },
    );
    await t.asUser(P.coordCuc, (q) => estado(q, personas, C.cuc, "validado"), { commit: true });
    await t.asUser(P.director, (q) => estado(q, personas, C.cuc, "aprobado"), { commit: true });
    // Reportes ya tenía a CD456 en Participante (cargado por otro medio).
    const [e] = await t.q<{ id: string }>("insert into public.ri_entregas (plantilla, periodo, estado, filas) values ('participante', '2026-2', 'validada', 1) returning id");
    await t.q("insert into public.ri_filas (entrega_id, orden, datos) values ($1, 0, $2)", [e.id, JSON.stringify({ NUM_DOCUMENTO: "CD456", PRIMER_NOMBRE: "Luis (de Reportes)" })]);
    aprobadas = await t.q("select id, campus_id, datos from public.int_filas where hoja_id = $1", [personas]);
  });

  it("arma las filas con el motor de Reportes y las agrega sin pisar ni duplicar", async () => {
    const paises = await t.q<ItemCatalogo>("select catalogo, codigo, nombre, departamento, oferta, activo from public.ri_catalogo_items where catalogo = 'pais'");
    const ctx = armarContexto("2026-2", { programa: [], municipio: [], pais: paises }, DOMINIOS, undefined);
    const spec = plantilla("participante");
    const envio = construirEnvioSnies(spec, aprobadas.map((f) => ({ ...f, hoja_id: personas, estado: "aprobado" as const })), { contexto: ctx, periodo: "2026-2" });
    expect(envio.rechazadas).toEqual([]);
    expect(envio.filas).toHaveLength(2);
    const ana = envio.filas.find((f) => f.datos.PRIMER_NOMBRE === "Ana")!.datos;
    expect(ana).toMatchObject({ ID_TIPO_DOCUMENTO: "Pasaporte", NUM_DOCUMENTO: "AB123", FECHA_NACIMIENTO: "09/04/2001", ID_PAIS: "Ecuador", ID_SEXO_BIOLOGICO: "Mujer" });

    const enviar = () =>
      t.asUser(
        P.director,
        async (q) =>
          (
            await q<{ r: { insertadas: number; omitidas: number } }>("select public.int_enviar_snies($1, 'participante', $2, $3) as r", [
              periodo,
              JSON.stringify(envio.filas),
              definicionPuente("participante")!.clave,
            ])
          )[0].r,
        { commit: true },
      );
    expect(await enviar()).toMatchObject({ insertadas: 1, omitidas: 1 });
    expect(await enviar()).toMatchObject({ insertadas: 0, omitidas: 2 });

    const filas = await t.q<{ datos: Record<string, string> }>(
      "select f.datos from public.ri_filas f join public.ri_entregas e on e.id = f.entrega_id where e.plantilla = 'participante' order by f.orden",
    );
    expect(filas.map((f) => f.datos.NUM_DOCUMENTO)).toEqual(["CD456", "AB123"]);
    expect(filas[0].datos.PRIMER_NOMBRE).toBe("Luis (de Reportes)");
    const [entrega] = await t.q<{ estado: string; filas: number }>("select estado, filas from public.ri_entregas where plantilla = 'participante'");
    expect(entrega).toEqual({ estado: "cargada", filas: 2 });
    expect(await t.q("select insertadas, omitidas from public.int_envios_snies order by en")).toEqual([
      { insertadas: 1, omitidas: 1 },
      { insertadas: 0, omitidas: 2 },
    ]);
  });

  it("solo filas aprobadas y solo el Director", async () => {
    const [borrador] = await t.q<{ id: string }>("select id from public.int_filas where hoja_id = $1 and campus_id = $2 limit 1", [saliente, C.buc]);
    const cuerpo = JSON.stringify([{ origen: borrador.id, datos: { NUM_DOCUMENTO: "1001" } }]);
    expect(await errorOf(t.asUser(P.director, (q) => q("select public.int_enviar_snies($1, 'participante', $2, '{NUM_DOCUMENTO}')", [periodo, cuerpo])))).toMatch(
      /filas aprobadas/,
    );
    expect(await errorOf(t.asUser(P.coordCuc, (q) => q("select public.int_enviar_snies($1, 'participante', $2, '{NUM_DOCUMENTO}')", [periodo, cuerpo])))).toMatch(
      /Solo el Director/,
    );
  });
});

describe("0151 · accesos", () => {
  it("el Director nombra gestores pero no directores; el Gestor no nombra a nadie", async () => {
    await t.asUser(P.director, async (q) => {
      await q("insert into public.int_miembros (user_id, rol, campus_id) values ($1, 'gestor', $2)", [P.ajeno, C.val]);
      expect(await errorOf(q("insert into public.int_miembros (user_id, rol) values ($1, 'director')", [P.ajeno]))).toMatch(/row-level security/);
    });
    expect(
      await errorOf(t.asUser(P.gestorCuc, (q) => q("insert into public.int_miembros (user_id, rol, campus_id) values ($1, 'gestor', $2)", [P.ajeno, C.cuc]))),
    ).toMatch(/row-level security/);
  });

  it("int_yo dice los papeles de cada quien", async () => {
    const yo = await t.asUser(P.coordCuc, async (q) => (await q<{ y: unknown }>("select public.int_yo() as y"))[0].y);
    // 0166 añade lo que cada quien puede crear y cuál es el campus central; los papeles de 0151 no cambian.
    expect(yo).toEqual({ director: false, coordinador: [C.cuc], gestor: [], planeacion: false, crea: true, multicampus: false, central: C.buc });
  });

  it("la migración es idempotente", async () => {
    const antes = await t.q("select count(*)::int as n from public.int_filas");
    await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0151_internacionalizacion.sql"), "utf8"));
    expect(await t.q("select count(*)::int as n from public.int_filas")).toEqual(antes);
  });
});
