/* Migración 0167 (Contactos: enlace público de invitación) en un Postgres en
   memoria: preparar la carpeta y las dos tablas, crear invitaciones, y el aporte
   público (identificar, revisar, recibir, ver lo propio, quitar) con sus reglas:
   dominio, vigencia, quién borra qué, duplicados por correo, límite por persona y
   cierre cuando el campus envía su hoja. */

import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LISTA_PLANTILLAS, PLANTILLAS, validarFila } from "../../supabase/functions/int-contactos/contactos";
import { createTestDb, errorOf, type Query, type TestDb } from "../db/harness";

const P = {
  director: "00000000-0000-4000-a000-0000000000f1",
  coordCuc: "00000000-0000-4000-a000-0000000000f2",
  gestorCuc: "00000000-0000-4000-a000-0000000000f3",
  coordBuc: "00000000-0000-4000-a000-0000000000f4",
  planeacion: "00000000-0000-4000-a000-0000000000f5",
  ajeno: "00000000-0000-4000-a000-0000000000f6",
};

let t: TestDb;
const C: Record<"cuc" | "buc" | "val", string> = { cuc: "", buc: "", val: "" };
let periodo = "";
let token = "";
let tokenLibre = "";
let hojas: Record<"academica" | "empleadores", string> = { academica: "", empleadores: "" };

const hash = (secreto: string) => createHash("sha256").update(secreto).digest("hex");
const como = <T>(quien: string, trabajo: (q: Query) => Promise<T>) => t.asUser(quien, trabajo, { commit: true });
const leer = <T>(quien: string, trabajo: (q: Query) => Promise<T>) => t.asUser(quien, trabajo);
const falla = (quien: string | null, trabajo: (q: Query) => Promise<unknown>) => errorOf(t.asUser(quien, trabajo));

const academico = (nombre: string, correo: string, extra: Record<string, string> = {}) => ({
  datos: validarFila(PLANTILLAS.academica, { "First Name": nombre, "Last Name": "Prueba", "Job Title": "Docente", Email: correo, "Country or Territory": "México", ...extra }).datos,
});
const empleador = (nombre: string, correo: string) => ({
  datos: validarFila(PLANTILLAS.empleadores, { "First Name": nombre, "Last Name": "Prueba", Position: "Gerente", Email: correo }).datos,
});

const identificar = async (tk: string, correo: string, secreto: string, campus: string | null = null, nombre = "Laura Mendoza") =>
  (
    await t.q<{ r: { aportante_id: string; enviados: number } }>("select public.int_contactos_identificar($1, $2, 'Directora de programa', $3, $4, $5) as r", [tk, nombre, correo, campus, hash(secreto)])
  )[0].r;

const recibir = async (tk: string, ap: string, secreto: string, tipo: string, filas: unknown[], origen = "manual", archivo: string | null = null) =>
  (
    await t.q<{ r: { creadas: number; actualizadas: number; omitidas: number; errores: number; enviados: number; filas: { accion: string; motivo: string | null }[] } }>(
      "select public.int_contactos_recibir($1, $2, $3, $4, $5::jsonb, $6, $7) as r",
      [tk, ap, hash(secreto), tipo, JSON.stringify(filas), origen, archivo],
    )
  )[0].r;

beforeAll(async () => {
  t = await createTestDb();
  for (const [nombre, id] of Object.entries(P)) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, `${nombre}@prueba.udes.edu.co`]);
    await t.q("insert into public.profiles (id, email, full_name, is_active) values ($1, $2, $3, true) on conflict (id) do update set is_active = true", [id, `${nombre}@prueba.udes.edu.co`, nombre]);
  }
  await t.q("update public.profiles set role = 'planeacion' where id = $1", [P.planeacion]);
  for (const r of await t.q<{ id: string; slug: string }>("select id, slug from public.campuses")) {
    if (r.slug === "cucuta") C.cuc = r.id;
    if (r.slug === "bucaramanga") C.buc = r.id;
    if (r.slug === "valledupar") C.val = r.id;
  }
  await t.q(`insert into public.int_miembros (user_id, rol, campus_id) values ($1, 'director', null), ($2, 'coordinador', $5), ($3, 'gestor', $5), ($4, 'coordinador', $6)`, [P.director, P.coordCuc, P.gestorCuc, P.coordBuc, C.cuc, C.buc]);
  [{ id: periodo }] = await t.q<{ id: string }>("insert into public.int_periodos (codigo, nombre, cierra) values ('2026-2', 'Segundo semestre 2026', '2026-12-15') returning id");
}, 180_000);

afterAll(async () => t?.close());

describe("0167 · preparar la carpeta y las tablas", () => {
  it("solo quien controla Multicampus: no un gestor ni el coordinador de Cúcuta", async () => {
    expect(await falla(P.gestorCuc, (q) => q("select public.int_contactos_preparar()"))).toMatch(/preparan los contactos/);
    expect(await falla(P.coordCuc, (q) => q("select public.int_contactos_preparar()"))).toMatch(/preparan los contactos/);
  });

  it("crea la carpeta «Contactos» y las dos tablas Multicampus con las columnas de Rua, una sola vez", async () => {
    const primera = await como(P.coordBuc, async (q) => (await q<{ r: { carpeta_id: string; tablas: { codigo: string; hoja_id: string }[] } }>("select public.int_contactos_preparar() as r"))[0].r);
    const segunda = await como(P.planeacion, async (q) => (await q<{ r: typeof primera }>("select public.int_contactos_preparar() as r"))[0].r);
    expect(segunda).toEqual(primera);
    hojas = { academica: primera.tablas.find((x) => x.codigo === "academica")!.hoja_id, empleadores: primera.tablas.find((x) => x.codigo === "empleadores")!.hoja_id };

    const libros = await t.q<{ nombre: string; captura: string; plantilla_contactos: string; carpeta_id: string }>("select nombre, captura, plantilla_contactos, carpeta_id from public.int_libros where plantilla_contactos is not null order by nombre");
    expect(libros.map((l) => [l.nombre, l.captura, l.plantilla_contactos])).toEqual([
      ["Contactos académicos", "multicampus", "academica"],
      ["Contactos de empleadores", "multicampus", "empleadores"],
    ]);
    expect(libros.every((l) => l.carpeta_id === primera.carpeta_id)).toBe(true);
  });

  it("las columnas de la base son las de las plantillas de TypeScript (mismo orden, etiqueta y obligatorias)", async () => {
    for (const p of LISTA_PLANTILLAS) {
      const cols = await t.q<{ clave: string; etiqueta: string; obligatorio: boolean }>("select clave, etiqueta, obligatorio from public.int_columnas where hoja_id = $1 order by orden", [hojas[p.codigo]]);
      expect(cols).toEqual(p.columnas.map((c) => ({ clave: c.clave, etiqueta: c.encabezado, obligatorio: c.obligatoria })));
    }
  });
});

describe("0167 · invitaciones", () => {
  it("las crean y las ven el Director, Planeación y los coordinadores; no un gestor ni un ajeno", async () => {
    const [i] = await como(P.coordCuc, (q) =>
      q<{ id: string; token: string }>("insert into public.int_invitaciones (nombre, periodo_id, campus_id, vence) values ('Contactos 2026-2 · Cúcuta', $1, $2, public.int_hoy() + 30) returning id, token", [periodo, C.cuc]),
    );
    token = i.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{12}$/);
    await como(P.planeacion, async (q) => {
      const [x] = await q<{ token: string }>("insert into public.int_invitaciones (nombre, periodo_id, vence) values ('Contactos 2026-2 · a elegir', $1, public.int_hoy() + 30) returning token", [periodo]);
      tokenLibre = x.token;
    });
    expect(await falla(P.gestorCuc, (q) => q("insert into public.int_invitaciones (nombre, periodo_id, vence) values ('No', $1, public.int_hoy() + 1)", [periodo]))).toMatch(/row-level security/);
    expect(await leer(P.gestorCuc, (q) => q("select id from public.int_invitaciones"))).toEqual([]);
    expect(await leer(P.ajeno, (q) => q("select id from public.int_invitaciones"))).toEqual([]);
    expect((await leer(P.coordCuc, (q) => q("select id from public.int_invitaciones"))).length).toBeGreaterThan(0);
  });

  it("al crear una invitación las hojas de contactos quedan con ventana", async () => {
    const v = await t.q<{ hoja_id: string }>("select hoja_id from public.int_ventanas where periodo_id = $1 and campus_id is null", [periodo]);
    expect(v.map((x) => x.hoja_id).sort()).toEqual([hojas.academica, hojas.empleadores].sort());
  });

  it("un coordinador cambia las suyas; el de Cúcuta no cambia las de Planeación", async () => {
    await como(P.coordCuc, (q) => q("update public.int_invitaciones set estado = 'pausada' where token = $1", [tokenLibre]));
    expect((await t.q<{ estado: string }>("select estado from public.int_invitaciones where token = $1", [tokenLibre]))[0].estado).toBe("activa");
    await como(P.coordBuc, (q) => q("update public.int_invitaciones set estado = 'pausada' where token = $1", [tokenLibre]));
    expect((await t.q<{ estado: string }>("select estado from public.int_invitaciones where token = $1", [tokenLibre]))[0].estado).toBe("pausada");
    await como(P.coordBuc, (q) => q("update public.int_invitaciones set estado = 'activa' where token = $1", [tokenLibre]));
  });
});

describe("0167 · el enlace público", () => {
  it("dice qué es el enlace sin dar secretos; un token inventado no existe", async () => {
    const [{ r }] = await t.q<{ r: Record<string, unknown> }>("select public.int_contactos_invitacion($1) as r", [token]);
    expect(r).toMatchObject({ estado: "activa", periodo: "2026-2", campus: { name: expect.any(String) }, tipos: ["academico", "empleador"], dominios: ["udes.edu.co"], limite: 200 });
    expect(JSON.stringify(r)).not.toContain(token);
    expect((await t.q<{ r: unknown }>("select public.int_contactos_invitacion('inventado123') as r"))[0].r).toBeNull();
    expect((await t.q<{ r: unknown }>("select public.int_contactos_invitacion('x') as r"))[0].r).toBeNull();
    const [{ r: libre }] = await t.q<{ r: { campuses: unknown[]; campus: unknown } }>("select public.int_contactos_invitacion($1) as r", [tokenLibre]);
    expect(libre.campus).toBeNull();
    expect(libre.campuses.length).toBeGreaterThanOrEqual(3);
  });

  it("no la puede llamar nadie con cuenta ni sin ella: solo la clave de servicio", async () => {
    expect(await falla(P.director, (q) => q("select public.int_contactos_invitacion($1)", [token]))).toMatch(/permission denied/);
    expect(await falla(null, (q) => q("select public.int_contactos_recibir($1, gen_random_uuid(), 'x', 'academico', '[]'::jsonb, 'manual', null)", [token]))).toMatch(/permission denied/);
  });

  it("una invitación en pausa, vencida o de un periodo cerrado no recibe a nadie", async () => {
    await t.q("update public.int_invitaciones set estado = 'pausada' where token = $1", [token]);
    expect(await errorOf(identificar(token, "a@udes.edu.co", "s"))).toMatch(/en pausa/);
    await t.q("update public.int_invitaciones set estado = 'activa', vence = public.int_hoy() - 1 where token = $1", [token]);
    expect(await errorOf(identificar(token, "a@udes.edu.co", "s"))).toMatch(/venció/);
    expect((await t.q<{ r: { estado: string } }>("select public.int_contactos_invitacion($1) as r", [token]))[0].r.estado).toBe("vencida");
    await t.q("update public.int_invitaciones set vence = public.int_hoy() + 30 where token = $1", [token]);
    await t.q("update public.int_periodos set estado = 'cerrado' where id = $1", [periodo]);
    expect(await errorOf(identificar(token, "a@udes.edu.co", "s"))).toMatch(/ya cerró/);
    await t.q("update public.int_periodos set estado = 'abierto' where id = $1", [periodo]);
  });

  it("solo entra quien usa un correo del dominio permitido y escribe sus datos", async () => {
    expect(await errorOf(identificar(token, "laura@gmail.com", "s"))).toMatch(/correo institucional/);
    expect(await errorOf(identificar(token, "sin-forma", "s"))).toMatch(/forma de correo/);
    expect(await errorOf(identificar(token, "laura@udes.edu.co", "s", null, "L"))).toMatch(/nombre completo/);
    const a = await identificar(token, "Laura.Mendoza@MAIL.udes.edu.co", "secreto-1");
    expect(a.enviados).toBe(0);
    expect((await t.q<{ correo: string; correo_verificado: boolean }>("select correo, correo_verificado from public.int_aportantes where id = $1", [a.aportante_id]))[0]).toEqual({ correo: "laura.mendoza@mail.udes.edu.co", correo_verificado: false });
  });

  it("con un enlace sin campus hay que elegirlo; con uno de campus, el campus es el del enlace aunque se mande otro", async () => {
    expect(await errorOf(identificar(tokenLibre, "pedro@udes.edu.co", "s"))).toMatch(/Elija su campus/);
    const libre = await identificar(tokenLibre, "pedro@udes.edu.co", "s", C.val, "Pedro Ríos");
    expect((await t.q<{ campus_id: string }>("select campus_id from public.int_aportantes where id = $1", [libre.aportante_id]))[0].campus_id).toBe(C.val);
    const fijo = await identificar(token, "ana@udes.edu.co", "s", C.buc, "Ana Gómez");
    expect((await t.q<{ campus_id: string }>("select campus_id from public.int_aportantes where id = $1", [fijo.aportante_id]))[0].campus_id).toBe(C.cuc);
  });

  it("volver a identificarse con el mismo correo da una sesión nueva y la anterior deja de servir", async () => {
    const a1 = await identificar(token, "carlos@udes.edu.co", "viejo", null, "Carlos Pérez");
    const a2 = await identificar(token, "CARLOS@udes.edu.co", "nuevo", null, "Carlos Pérez");
    expect(a2.aportante_id).toBe(a1.aportante_id);
    expect(await errorOf(recibir(token, a1.aportante_id, "viejo", "academico", [academico("Uno", "uno@usal.es")]))).toMatch(/sesión venció/);
    expect((await recibir(token, a1.aportante_id, "nuevo", "academico", [academico("Uno", "uno@usal.es")])).creadas).toBe(1);
  });
});

describe("0167 · recibir contactos", () => {
  let laura = "";
  let ana = "";

  it("guarda el contacto en la tabla Multicampus del campus de la persona, con quién, canal y origen", async () => {
    laura = (await identificar(token, "laura.mendoza@mail.udes.edu.co", "secreto-1")).aportante_id;
    const r = await recibir(token, laura, "secreto-1", "academico", [academico("María", "mf.ruiz@universidad.mx"), academico("Ana", "a.gomez@usal.es")], "excel", "nominaciones_cucuta.xlsx");
    expect(r).toMatchObject({ creadas: 2, actualizadas: 0, omitidas: 0, errores: 0, enviados: 2 });
    const filas = await t.q<{ campus_id: string; aportante_id: string; canal: string; origen: string; archivo: string; created_by: string | null; orden: number; hoja_id: string }>(
      "select campus_id, aportante_id, canal, origen, archivo, created_by, orden, hoja_id from public.int_filas where aportante_id = $1 order by orden",
      [laura],
    );
    // El orden sigue al de las filas que el campus ya tenía en la hoja (la de Carlos, de una prueba anterior).
    expect(filas[1].orden).toBe(filas[0].orden + 1);
    expect(filas[0].orden).toBeGreaterThan(0);
    expect(filas[0]).toMatchObject({ campus_id: C.cuc, aportante_id: laura, canal: "enlace", origen: "excel", archivo: "nominaciones_cucuta.xlsx", created_by: null, hoja_id: hojas.academica });
  });

  it("a mano no guarda archivo; el mismo correo de la misma persona se actualiza y no se duplica", async () => {
    const r = await recibir(token, laura, "secreto-1", "academico", [academico("María Fernanda", "MF.Ruiz@universidad.mx", { Subject: "Ingeniería" })], "manual", "ignorado.xlsx");
    expect(r).toMatchObject({ creadas: 0, actualizadas: 1, enviados: 2 });
    const [f] = await t.q<{ datos: Record<string, string>; archivo: string | null; origen: string }>("select datos, archivo, origen from public.int_filas where aportante_id = $1 and lower(datos ->> 'propio_email') = 'mf.ruiz@universidad.mx'", [laura]);
    expect(f.datos.propio_first_name).toBe("María Fernanda");
    expect(f.datos.propio_subject).toBe("Ingeniería");
    expect(f).toMatchObject({ archivo: null, origen: "manual" });
  });

  it("si otra persona ya aportó ese correo, se conserva el primero; también entre las dos listas y dentro del mismo envío", async () => {
    ana = (await identificar(token, "ana@udes.edu.co", "secreto-2", null, "Ana Gómez")).aportante_id;
    const r = await recibir(token, ana, "secreto-2", "academico", [academico("Otra", "a.gomez@usal.es"), academico("Nueva", "nueva@u.ca"), academico("Nueva2", "NUEVA@u.ca")]);
    expect(r.filas.map((f) => f.accion)).toEqual(["omitir", "crear", "omitir"]);
    expect(r.filas[0].motivo).toMatch(/Otra persona/);
    expect(r.filas[2].motivo).toMatch(/repetido/);
    const cruzado = await recibir(token, ana, "secreto-2", "empleador", [empleador("Laura", "nueva@u.ca")]);
    expect(cruzado.filas[0]).toMatchObject({ accion: "omitir" });
    expect(cruzado.filas[0].motivo).toMatch(/otra lista/);
  });

  it("las filas incompletas dan error y no se guardan; las buenas del mismo envío sí", async () => {
    const r = await recibir(token, ana, "secreto-2", "academico", [{ datos: { propio_first_name: "Sin correo" } }, academico("Buena", "buena@u.ca")]);
    expect(r.filas[0].accion).toBe("error");
    expect(r.filas[1].accion).toBe("crear");
    expect(r).toMatchObject({ creadas: 1, errores: 1 });
  });

  it("solo guarda las columnas de la tabla: lo que sobre se descarta", async () => {
    await recibir(token, ana, "secreto-2", "academico", [{ datos: { ...academico("Extra", "extra@u.ca").datos, propio_inventado: "x", otra: "y" } }]);
    const [f] = await t.q<{ datos: Record<string, string> }>("select datos from public.int_filas where lower(datos ->> 'propio_email') = 'extra@u.ca'");
    expect(Object.keys(f.datos)).not.toContain("propio_inventado");
    expect(Object.keys(f.datos)).not.toContain("otra");
  });

  it("respeta el máximo de contactos por persona", async () => {
    await t.q("update public.int_invitaciones set limite_por_persona = 3 where token = $1", [token]);
    const r = await errorOf(recibir(token, laura, "secreto-1", "academico", [academico("Uno", "m1@u.ca"), academico("Dos", "m2@u.ca")]));
    expect(r).toMatch(/máximo de 3 contactos/);
    await t.q("update public.int_invitaciones set limite_por_persona = 200 where token = $1", [token]);
  });

  it("una invitación que no recibe empleadores lo dice", async () => {
    await t.q("update public.int_invitaciones set tipos = '{academico}' where token = $1", [token]);
    expect(await errorOf(recibir(token, laura, "secreto-1", "empleador", [empleador("Laura", "emp@x.co")]))).toMatch(/ese tipo/);
    await t.q("update public.int_invitaciones set tipos = '{academico,empleador}' where token = $1", [token]);
  });

  it("la vista previa no guarda nada y dice qué pasaría", async () => {
    const antes = (await t.q<{ n: string }>("select count(*) as n from public.int_filas"))[0].n;
    const [{ r }] = await t.q<{ r: { filas: { accion: string }[]; enviados: number; limite: number } }>("select public.int_contactos_revisar($1, $2, $3, 'academico', $4::jsonb) as r", [token, laura, hash("secreto-1"), JSON.stringify([academico("Nuevo", "previa@u.ca"), academico("María", "mf.ruiz@universidad.mx")])]);
    expect(r.filas.map((f) => f.accion)).toEqual(["crear", "actualizar"]);
    expect(r.limite).toBe(200);
    expect((await t.q<{ n: string }>("select count(*) as n from public.int_filas"))[0].n).toBe(antes);
  });

  it("cada persona ve y quita solo lo suyo", async () => {
    const [{ r }] = await t.q<{ r: { filas: { id: string; tipo: string }[] } }>("select public.int_contactos_mis($1, $2, $3) as r", [token, laura, hash("secreto-1")]);
    expect(r.filas.length).toBe(2);
    const ajenas = await t.q<{ id: string }>("select id from public.int_filas where aportante_id = $1", [ana]);
    const quitadas = (await t.q<{ n: number }>("select public.int_contactos_quitar($1, $2, $3, $4::uuid[]) as n", [token, laura, hash("secreto-1"), `{${[...r.filas.map((f) => f.id), ...ajenas.map((a) => a.id)].join(",")}}`]))[0].n;
    expect(quitadas).toBe(2);
    expect((await t.q("select id from public.int_filas where aportante_id = $1", [ana])).length).toBe(ajenas.length);
  });

  it("el equipo ve quién aportó, pero no el secreto de su sesión", async () => {
    const aportantes = await leer(P.gestorCuc, (q) => q<{ nombre: string; correo_verificado: boolean }>("select nombre, correo_verificado from public.int_aportantes"));
    expect(aportantes.length).toBeGreaterThan(0);
    expect(await falla(P.gestorCuc, (q) => q("select sesion_hash from public.int_aportantes"))).toMatch(/permission denied/);
    expect(await leer(P.ajeno, (q) => q("select id from public.int_aportantes"))).toEqual([]);
  });

  it("las filas del enlace las ven los miembros de todos los campus (Multicampus)", async () => {
    const filas = await leer(P.gestorCuc, (q) => q<{ aportante_id: string | null }>("select aportante_id from public.int_filas where hoja_id = $1", [hojas.academica]));
    expect(filas.some((f) => f.aportante_id === ana)).toBe(true);
  });

  it("cuando el campus envía su hoja a revisión, ya no entran más contactos ni se quitan", async () => {
    await como(P.gestorCuc, (q) => q("select public.int_cambiar_estado($1, $2, $3, 'enviado', null)", [periodo, hojas.academica, C.cuc]));
    expect(await errorOf(recibir(token, ana, "secreto-2", "academico", [academico("Tarde", "tarde@u.ca")]))).toMatch(/revisión de este campus/);
    expect(await errorOf(t.q("select public.int_contactos_quitar($1, $2, $3, $4::uuid[])", [token, ana, hash("secreto-2"), "{00000000-0000-4000-a000-000000000001}"]))).toMatch(/revisión de este campus/);
    // Otro campus sigue recibiendo.
    const pedro = (await identificar(tokenLibre, "pedro@udes.edu.co", "s3", C.val, "Pedro Ríos")).aportante_id;
    expect((await recibir(tokenLibre, pedro, "s3", "academico", [academico("De Valledupar", "val@u.co")])).creadas).toBe(1);
  });
});
