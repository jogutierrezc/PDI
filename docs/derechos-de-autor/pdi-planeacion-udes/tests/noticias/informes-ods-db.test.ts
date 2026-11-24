/* Migración 0145 en un Postgres en memoria: idempotencia, permisos, el
   disparador de «quién escribió» y lo que ve (y no ve) el público. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "../db/harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0145_informes_ods_con_pilo.sql");
const MIGRATION_0146 = resolve(__dirname, "../../supabase/migrations/0146_informes_bilingue_imagenes_cifras.sql");
let t: TestDb;
let nota = "";
let notaNinos = "";
let informe = "";
let bloquePilo = "";

beforeAll(async () => {
  t = await createTestDb({ before: "0147" }); // sin el informe 2025 importado (0147), que ya trae (4, 2025)
  await t.q("update public.profiles set role = 'planeacion', is_active = true where id = $1", [PEOPLE.admin]);
  [{ id: nota }] = await t.q<{ id: string }>(
    "insert into public.news_items (url, title, body, image_url, state, published_on) values ('https://udes.edu.co/r', 'El Recolector', 'Más de 400 estudiantes de bachillerato.', 'https://udes.edu.co/r.jpg', 'ok', '2025-03-20') returning id",
  );
  [{ id: notaNinos }] = await t.q<{ id: string }>(
    "insert into public.news_items (url, title, body, image_url, state) values ('https://udes.edu.co/n', 'Proyecto AIRE', 'Cerca de 100 niños.', 'https://udes.edu.co/n.jpg', 'ok') returning id",
  );
  [{ id: informe }] = await t.q<{ id: string }>("insert into public.ods_reports (ods, edition) values (4, 2025) returning id");
  // La función (sin sesión) escribe un párrafo de Pilo.
  [{ id: bloquePilo }] = await t.q<{ id: string }>(
    "insert into public.ods_report_blocks (report_id, sec, pos, origin, text, orig, warn, sources) values ($1, 'hicimos', 1, 'pilo', 'Texto de Pilo.', 'Texto de Pilo.', 'Revisa', $2) returning id",
    [informe, JSON.stringify([{ news_id: nota, quote: "Más de 400 estudiantes" }])],
  );
  await t.q("insert into public.ods_report_blocks (report_id, sec, pos, origin, text, spare) values ($1, 'hicimos', 2, 'pilo', 'Reserva.', true)", [informe]);
  await t.q("insert into public.ods_report_blocks (report_id, sec, pos, origin, text, enabled) values ($1, 'hicimos', 3, 'persona', 'Quitado.', false)", [informe]);
  await t.q("insert into public.ods_report_photos (report_id, news_id, use) values ($1, $2, true)", [informe, nota]);
  await t.q("insert into public.ods_report_photos (report_id, news_id, use, minors) values ($1, $2, true, true)", [informe, notaNinos]);
  await t.q(
    "insert into public.ods_report_indicators (report_id, indicator, news_id, candidates, page_es, page_en, approved) values ($1, '4.3.4', $2, '[{\"news_id\":\"x\",\"rel\":\"s\",\"why\":\"\",\"flags\":[]}]', '[\"Más de 400 estudiantes de bachillerato.\"]', 'More than 400 students.', true)",
    [informe, nota],
  );
  await t.q("insert into public.ods_report_indicators (report_id, indicator, news_id) values ($1, '4.3.5', $2)", [informe, notaNinos]);
});
afterAll(async () => t?.close());

describe("0145 · Informes ODS con Pilo", () => {
  it("es idempotente", async () => {
    await t.db.exec(readFileSync(MIGRATION, "utf8"));
    // 0146 amplía lo de 0145: se vuelve a aplicar detrás para dejar la base como en producción.
    await t.db.exec(readFileSync(MIGRATION_0146, "utf8"));
    const [s] = await t.q<{ n: number }>("select count(*)::int as n from public.ods_report_blocks");
    expect(s.n).toBe(3);
  });

  it("valida ODS, estado, sección, origen, ranura y unicidad", async () => {
    expect(await errorOf(t.q("insert into public.ods_reports (ods, edition) values (18, 2025)"))).toMatch(/ods_reports_ods/);
    expect(await errorOf(t.q("insert into public.ods_reports (ods, edition) values (4, 2025)"))).toMatch(/ods_reports_unique|duplicate/);
    expect(await errorOf(t.q("update public.ods_reports set state = 'listo' where id = $1", [informe]))).toMatch(/ods_reports_state/);
    expect(await errorOf(t.q("insert into public.ods_report_blocks (report_id, sec) values ($1, 'otra')", [informe]))).toMatch(/ods_report_blocks_sec/);
    expect(await errorOf(t.q("insert into public.ods_report_blocks (report_id, sec, origin) values ($1, 'tesis', 'robot')", [informe]))).toMatch(/ods_report_blocks_origin/);
    expect(await errorOf(t.q("update public.ods_report_photos set slot = 'fondo' where report_id = $1", [informe]))).toMatch(/ods_report_photos_slot/);
    expect(await errorOf(t.q("insert into public.ods_report_indicators (report_id, indicator) values ($1, 'cuatro')", [informe]))).toMatch(/ods_report_indicators_indicator/);
  });

  it("una persona que cambia el texto de Pilo lo deja «editado»; nunca vuelve a «pilo»", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("update public.ods_report_blocks set enabled = true where id = $1", [bloquePilo]), { commit: true });
    let [b] = await t.q<{ origin: string }>("select origin from public.ods_report_blocks where id = $1", [bloquePilo]);
    expect(b.origin).toBe("pilo");
    await t.asUser(PEOPLE.admin, (q) => q("update public.ods_report_blocks set text = 'Texto corregido.' where id = $1", [bloquePilo]), { commit: true });
    [b] = await t.q("select origin from public.ods_report_blocks where id = $1", [bloquePilo]);
    expect(b.origin).toBe("editado");
    await t.asUser(PEOPLE.admin, (q) => q("update public.ods_report_blocks set origin = 'pilo' where id = $1", [bloquePilo]), { commit: true });
    [b] = await t.q("select origin from public.ods_report_blocks where id = $1", [bloquePilo]);
    expect(b.origin).toBe("editado");
    // Una persona no puede crear un párrafo «de Pilo».
    const [n] = await t.asUser(PEOPLE.admin, (q) => q<{ origin: string }>("insert into public.ods_report_blocks (report_id, sec, origin, text) values ($1, 'tesis', 'pilo', 'x') returning origin", [informe]));
    expect(n.origin).toBe("persona");
    // La función (sin sesión) sí escribe como Pilo.
    await t.q("update public.ods_report_blocks set text = 'Otra vez Pilo.', orig = 'Otra vez Pilo.', origin = 'pilo' where id = $1", [bloquePilo]);
    [b] = await t.q("select origin from public.ods_report_blocks where id = $1", [bloquePilo]);
    expect(b.origin).toBe("pilo");
  });

  it("solo Planeación o la administración leen y escriben los borradores", async () => {
    const propios = await t.asUser(PEOPLE.admin, (q) => q("select id from public.ods_report_blocks where report_id = $1", [informe]));
    expect(propios).toHaveLength(3);
    const ajenos = await t.asUser(PEOPLE.director, (q) => q("select id from public.ods_report_blocks"));
    expect(ajenos).toHaveLength(0);
    const escritos = await t.asUser(PEOPLE.director, (q) => q("update public.ods_reports set state = 'publicado' where id = $1 returning id", [informe]));
    expect(escritos).toHaveLength(0);
    expect(await errorOf(t.asUser(null, (q) => q("insert into public.ods_reports (ods, edition) values (5, 2025)")))).toMatch(/permission denied/);
  });

  it("el público no ve borradores ni la evidencia de un informe sin publicar", async () => {
    expect(await t.asUser(null, (q) => q("select id from public.ods_reports"))).toHaveLength(0);
    expect(await t.asUser(null, (q) => q("select id from public.ods_report_blocks"))).toHaveLength(0);
    expect(await t.asUser(null, (q) => q("select * from public.ods_evidencia(4, '4.3.4')"))).toHaveLength(0);
  });

  it("publicado: el público ve solo párrafos activos, fotos publicables y elecciones aprobadas, sin columnas cerradas", async () => {
    await t.q("update public.ods_reports set state = 'publicado' where id = $1", [informe]);
    expect(await t.asUser(null, (q) => q("select id, ods, edition from public.ods_reports"))).toHaveLength(1);
    const bloques = await t.asUser(null, (q) => q<{ text: string }>("select id, text, sources from public.ods_report_blocks"));
    expect(bloques.map((b) => b.text)).toEqual(["Otra vez Pilo."]);
    const fotos = await t.asUser(null, (q) => q<{ news_id: string }>("select news_id, caption from public.ods_report_photos"));
    expect(fotos.map((f) => f.news_id)).toEqual([nota]);
    const elecciones = await t.asUser(null, (q) => q<{ indicator: string }>("select indicator, page_es, page_en from public.ods_report_indicators"));
    expect(elecciones.map((e) => e.indicator)).toEqual(["4.3.4"]);
    for (const [col, tabla] of [
      ["orig", "ods_report_blocks"],
      ["warn", "ods_report_blocks"],
      ["updated_by", "ods_report_blocks"],
      ["candidates", "ods_report_indicators"],
      ["ask", "ods_report_indicators"],
      ["settings", "ods_reports"],
      ["updated_by", "ods_reports"],
    ]) {
      expect(await errorOf(t.asUser(null, (q) => q(`select ${col} from public.${tabla}`)))).toMatch(/permission denied/);
    }
    // Con autorización de imagen, la foto con menores sí sale.
    await t.q("update public.ods_report_photos set cleared = true where news_id = $1", [notaNinos]);
    expect(await t.asUser(null, (q) => q("select news_id from public.ods_report_photos"))).toHaveLength(2);
  });

  it("ods_evidencia devuelve la nota aprobada con su página; la imagen solo si la foto se puede publicar", async () => {
    const [e] = await t.asUser(null, (q) => q<{ title: string; image_url: string | null; page_es: string[]; page_en: string; url: string; published_on: unknown }>("select * from public.ods_evidencia(4, '4.3.4')"));
    expect(e.title).toBe("El Recolector");
    expect(e.image_url).toBe("https://udes.edu.co/r.jpg");
    expect(e.page_es).toEqual(["Más de 400 estudiantes de bachillerato."]);
    expect(e.page_en).toBe("More than 400 students.");
    expect(e.url).toBe("https://udes.edu.co/r");
    // La elección sin aprobar no sale.
    expect(await t.asUser(null, (q) => q("select * from public.ods_evidencia(4, '4.3.5')"))).toHaveLength(0);
    // Si la foto deja de usarse, la página queda sin imagen.
    await t.q("update public.ods_report_photos set use = false where news_id = $1", [nota]);
    const [sin] = await t.asUser(null, (q) => q<{ image_url: string | null }>("select image_url from public.ods_evidencia(4, '4.3.4')"));
    expect(sin.image_url).toBeNull();
  });
});
