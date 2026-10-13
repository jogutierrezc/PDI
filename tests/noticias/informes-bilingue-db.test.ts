/* Migración 0146 en un Postgres en memoria: idempotencia, inglés, imágenes,
   libro de cifras, fotos con varias imágenes por nota, ficha y lo que ve el
   público. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "../db/harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0146_informes_bilingue_imagenes_cifras.sql");
let t: TestDb;
let aprobada = "";
let pendiente = "";
let informe = "";
let imagen = "";
let bloque = "";

beforeAll(async () => {
  t = await createTestDb({ before: "0147" }); // sin el informe 2025 importado (0147), que ya trae (4, 2025)
  await t.q("update public.profiles set role = 'planeacion', is_active = true where id = $1", [PEOPLE.admin]);
  [{ id: aprobada }] = await t.q<{ id: string }>(
    "insert into public.news_items (url, title, title_en, body, image_url, state, published_on) values ('https://udes.edu.co/a', 'El Recolector', 'The Collector', 'Más de 400 estudiantes.', 'https://udes.edu.co/a.jpg', 'ok', '2025-03-20') returning id",
  );
  [{ id: pendiente }] = await t.q<{ id: string }>("insert into public.news_items (url, title, body, state) values ('https://udes.edu.co/p', 'Pendiente', '20 personas.', 'pending') returning id");
  [{ id: imagen }] = await t.q<{ id: string }>("insert into public.news_images (news_id, url, width, height, is_cover) values ($1, 'https://udes.edu.co/a-xl.jpg', 1920, 640, true) returning id", [aprobada]);
  await t.q("insert into public.news_images (news_id, url, width, height, pos) values ($1, 'https://udes.edu.co/a-2.jpg', 584, 438, 1)", [aprobada]);
  await t.q("insert into public.news_images (news_id, url) values ($1, 'https://udes.edu.co/p.jpg')", [pendiente]);
  await t.q("insert into public.news_figures (news_id, value, num, unit, label, quote, kind, score) values ($1, '400', 400, 'estudiantes', 'estudiantes de bachillerato', 'Más de 400 estudiantes', 'personas', 80)", [aprobada]);
  [{ id: informe }] = await t.q<{ id: string }>("insert into public.ods_reports (ods, edition, state) values (4, 2025, 'publicado') returning id");
  [{ id: bloque }] = await t.q<{ id: string }>(
    "insert into public.ods_report_blocks (report_id, sec, origin, text, text_en, orig, orig_en) values ($1, 'hicimos', 'pilo', 'Texto.', 'Text.', 'Texto.', 'Text.') returning id",
    [informe],
  );
  await t.q(
    "insert into public.ods_report_indicators (report_id, indicator, news_id, page_es, page_en, approved, ficha, eval) values ($1, '4.3.4', $2, '[\"Más de 400 estudiantes.\"]', 'More than 400 students.', true, '{\"answer\":\"In 2025 the Universidad de Santander…\"}', '{\"grade\":\"s\"}')",
    [informe, aprobada],
  );
});
afterAll(async () => t?.close());

describe("0146 · Informes bilingües, imágenes y cifras", () => {
  it("es idempotente", async () => {
    await t.db.exec(readFileSync(MIGRATION, "utf8"));
    await t.db.exec(readFileSync(MIGRATION, "utf8"));
    const [s] = await t.q<{ n: number }>("select count(*)::int as n from public.news_images");
    expect(s.n).toBe(3);
  });

  it("valida imágenes y cifras", async () => {
    expect(await errorOf(t.q("insert into public.news_images (news_id, url) values ($1, 'http://inseguro.jpg')", [aprobada]))).toMatch(/news_images_url/);
    expect(await errorOf(t.q("insert into public.news_images (news_id, url) values ($1, 'https://udes.edu.co/a-xl.jpg')", [aprobada]))).toMatch(/news_images_unique|duplicate/);
    expect(await errorOf(t.q("insert into public.news_images (news_id, url, kind) values ($1, 'https://udes.edu.co/z.jpg', 'video')", [aprobada]))).toMatch(/news_images_kind/);
    expect(await errorOf(t.q("insert into public.news_figures (news_id, value, quote, kind) values ($1, '3', 'tres', 'kilos')", [aprobada]))).toMatch(/news_figures_kind/);
    expect(await errorOf(t.q("insert into public.news_figures (news_id, value, num, quote) values ($1, '400', 400, 'Más de 400 estudiantes')", [aprobada]))).toMatch(/news_figures_unique|duplicate/);
  });

  it("una nota aporta varias fotos al informe; las filas sin imagen siguen usando la nota", async () => {
    await t.q("insert into public.ods_report_photos (report_id, news_id, use, slot) values ($1, $2, true, 'galeria')", [informe, aprobada]);
    await t.q("insert into public.ods_report_photos (report_id, news_id, image_id, use, slot) values ($1, $2, $3, true, 'portada')", [informe, aprobada, imagen]);
    expect(await errorOf(t.q("insert into public.ods_report_photos (report_id, news_id, image_id) values ($1, $2, $3)", [informe, aprobada, imagen]))).toMatch(/pkey|duplicate/);
    expect(await errorOf(t.q("insert into public.ods_report_photos (report_id, news_id) values ($1, $2)", [informe, aprobada]))).toMatch(/pkey|duplicate/);
    const filas = await t.q<{ photo_key: string }>("select photo_key from public.ods_report_photos where report_id = $1 order by slot", [informe]);
    expect(filas.map((f) => f.photo_key).sort()).toEqual([aprobada, imagen].sort());
    // El upsert de la capa de datos usa (report_id, photo_key).
    await t.q("insert into public.ods_report_photos (report_id, news_id, image_id, caption) values ($1, $2, $3, 'Pie') on conflict (report_id, photo_key) do update set caption = excluded.caption", [informe, aprobada, imagen]);
    const [p] = await t.q<{ caption: string }>("select caption from public.ods_report_photos where image_id = $1", [imagen]);
    expect(p.caption).toBe("Pie");
  });

  it("una persona que cambia el inglés de un párrafo de Pilo lo deja «editado»", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("update public.ods_report_blocks set text_en = 'Edited text.' where id = $1", [bloque]), { commit: true });
    const [b] = await t.q<{ origin: string; text: string }>("select origin, text from public.ods_report_blocks where id = $1", [bloque]);
    expect(b.origin).toBe("editado");
    expect(b.text).toBe("Texto.");
  });

  it("el público: imágenes solo de notas aprobadas; nunca el libro de cifras ni eval ni orig_en", async () => {
    const imgs = await t.asUser(null, (q) => q<{ news_id: string }>("select news_id, url, caption from public.news_images"));
    expect(new Set(imgs.map((i) => i.news_id))).toEqual(new Set([aprobada]));
    expect(await errorOf(t.asUser(null, (q) => q("select value from public.news_figures")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select eval from public.ods_report_indicators")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select orig_en from public.ods_report_blocks")))).toMatch(/permission denied/);
    const [b] = await t.asUser(null, (q) => q<{ text_en: string }>("select text_en from public.ods_report_blocks"));
    expect(b.text_en).toBe("Edited text.");
    const [n] = await t.asUser(null, (q) => q<{ title_en: string }>("select title_en, excerpt_en from public.news_items"));
    expect(n.title_en).toBe("The Collector");
    // Otra área (sin rol de Planeación) tampoco lee el libro de cifras.
    expect(await t.asUser(PEOPLE.director, (q) => q("select id from public.news_figures"))).toHaveLength(0);
    expect(await t.asUser(PEOPLE.admin, (q) => q("select id from public.news_figures"))).toHaveLength(1);
  });

  it("ods_evidencia devuelve la ficha, el título en inglés y la imagen elegida", async () => {
    const [e] = await t.asUser(null, (q) => q<{ ficha: { answer: string }; title_en: string; image_url: string }>("select * from public.ods_evidencia(4, '4.3.4')"));
    expect(e.ficha.answer).toMatch(/Universidad de Santander/);
    expect(e.title_en).toBe("The Collector");
    expect(e.image_url).toBe("https://udes.edu.co/a-xl.jpg");
    expect(Object.keys(e)).not.toContain("eval");
  });

  it("los párrafos llevan subtítulo temático en español e inglés, públicos", async () => {
    await t.q("update public.ods_report_blocks set heading = 'Educación en los colegios', heading_en = 'Education in schools' where id = $1", [bloque]);
    const [b] = await t.asUser(null, (q) => q<{ heading: string; heading_en: string }>("select heading, heading_en from public.ods_report_blocks"));
    expect(b).toEqual({ heading: "Educación en los colegios", heading_en: "Education in schools" });
  });

  it("ods_registro lista TODAS las notas aprobadas del ODS del informe publicado, con su cifra principal y si la narrativa la cita", async () => {
    await t.q("insert into public.news_ods (news_id, ods) values ($1, 4) on conflict do nothing", [aprobada]);
    const [{ id: otra }] = await t.q<{ id: string }>("insert into public.news_items (url, title, body, state, published_on) values ('https://udes.edu.co/o', 'Otra nota', 'x', 'ok', '2025-01-10') returning id");
    await t.q("insert into public.news_ods (news_id, ods) values ($1, 4), ($2, 4)", [otra, pendiente]);
    await t.q("update public.ods_report_blocks set sources = $2 where id = $1", [bloque, JSON.stringify([{ news_id: aprobada, quote: "Más de 400 estudiantes" }])]);
    const filas = await t.asUser(null, (q) => q<{ news_id: string; figure_value: string | null; en_narrativa: boolean; title: string }>("select * from public.ods_registro(4, 2025)"));
    expect(filas.map((f) => f.title)).toEqual(["Otra nota", "El Recolector"]);
    expect(filas[1]).toMatchObject({ figure_value: "400", en_narrativa: true });
    expect(filas[0]).toMatchObject({ figure_value: null, en_narrativa: false });
    // Sin informe publicado, nada.
    expect(await t.asUser(null, (q) => q("select * from public.ods_registro(4, 2024)"))).toHaveLength(0);
  });

  it("el proveedor de IA de los rankings: Planeación lo lee, solo la administración lo cambia", async () => {
    const [a] = await t.asUser(PEOPLE.admin, (q) => q<{ ai_provider: string; ai_batch: number }>("select ai_provider, ai_batch from public.news_settings"));
    expect(a).toEqual({ ai_provider: "pilo", ai_batch: 0 });
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("update public.news_settings set ai_provider = 'mistral' where id = 1")))).toMatch(/Solo la administración/);
    // Planeación sigue pudiendo cambiar el umbral.
    expect(await t.asUser(PEOPLE.admin, (q) => q("update public.news_settings set umbral = 90 where id = 1 returning id"))).toHaveLength(1);
    await t.q("update public.profiles set role = 'admin' where id = $1", [PEOPLE.admin]);
    const r = await t.asUser(PEOPLE.admin, (q) => q("update public.news_settings set ai_provider = 'mistral', ai_model = 'mistral-large-latest', ai_vision_model = 'pixtral-12b-2409', ai_batch = 5 where id = 1 returning id"));
    expect(r).toHaveLength(1);
    expect(await errorOf(t.q("update public.news_settings set ai_provider = 'openai' where id = 1"))).toMatch(/news_settings_ai/);
    expect(await errorOf(t.q("update public.news_settings set ai_batch = 50 where id = 1"))).toMatch(/news_settings_ai/);
  });
});
