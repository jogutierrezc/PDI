/* Migración 0144 en un Postgres en memoria: columnas, disparador de «quién
   decidió», ajustes con RLS y que el público siga sin ver las columnas de Pilo. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "../db/harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0144_pilo_clasifica_noticias.sql");
let t: TestDb;
let nota = "";

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update public.profiles set role = 'planeacion', is_active = true where id = $1", [PEOPLE.admin]);
  const [f] = await t.q<{ id: string }>("insert into public.news_items (url, title, ai_status) values ('https://udes.edu.co/a', 'Una nota', 'pendiente') returning id");
  nota = f.id;
});
afterAll(async () => t?.close());

describe("0144 · Pilo clasifica noticias", () => {
  it("es idempotente", async () => {
    await t.db.exec(readFileSync(MIGRATION, "utf8"));
    const [s] = await t.q<{ n: number }>("select count(*)::int as n from public.news_settings");
    expect(s.n).toBe(1);
  });

  it("los ajustes arrancan apagados con umbral 85; Planeación los cambia, el público no los ve", async () => {
    const [s] = await t.q<{ pilo_aprueba: boolean; umbral: number }>("select pilo_aprueba, umbral from public.news_settings");
    expect(s).toEqual({ pilo_aprueba: false, umbral: 85 });
    const cambiadas = await t.asUser(PEOPLE.admin, (q) => q("update public.news_settings set pilo_aprueba = true, umbral = 90 where id = 1 returning umbral"));
    expect(cambiadas).toHaveLength(1);
    expect(await errorOf(t.asUser(null, (q) => q("select * from public.news_settings")))).toMatch(/permission denied/);
    const ajeno = await t.asUser(PEOPLE.director, (q) => q("select * from public.news_settings"));
    expect(ajeno).toHaveLength(0);
    expect(await errorOf(t.q("update public.news_settings set umbral = 20 where id = 1"))).toMatch(/news_settings_umbral/);
  });

  it("valida ai_status, decided_by y el indicador", async () => {
    expect(await errorOf(t.q("update public.news_items set ai_status = 'quizas' where id = $1", [nota]))).toMatch(/news_items_ai_status/);
    expect(await errorOf(t.q("update public.news_items set decided_by = 'robot' where id = $1", [nota]))).toMatch(/news_items_decided_by/);
    expect(await errorOf(t.q("insert into public.news_ods (news_id, ods, indicator) values ($1, 13, 'trece')", [nota]))).toMatch(/news_ods_indicator/);
    await t.q("insert into public.news_ods (news_id, ods, indicator, by_ai) values ($1, 13, '13.2', true)", [nota]);
  });

  it("una persona que cambia el estado queda como quien decidió; al devolverla a «pending», nadie", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("update public.news_items set state = 'ok', reviewed_by = $2 where id = $1", [nota, PEOPLE.admin]), { commit: true });
    let [f] = await t.q<{ decided_by: string | null }>("select decided_by from public.news_items where id = $1", [nota]);
    expect(f.decided_by).toBe("persona");
    await t.asUser(PEOPLE.admin, (q) => q("update public.news_items set state = 'pending', reviewed_by = null where id = $1", [nota]), { commit: true });
    [f] = await t.q("select decided_by from public.news_items where id = $1", [nota]);
    expect(f.decided_by).toBeNull();
    // La función (sin sesión, clave de servicio) pone «pilo» por su cuenta.
    await t.q("update public.news_items set state = 'ok', decided_by = 'pilo' where id = $1", [nota]);
    [f] = await t.q("select decided_by from public.news_items where id = $1", [nota]);
    expect(f.decided_by).toBe("pilo");
  });

  it("el público ve la nota aprobada, pero no las columnas de Pilo ni el texto", async () => {
    const visibles = await t.asUser(null, (q) => q("select id, title from public.news_items"));
    expect(visibles).toHaveLength(1);
    for (const col of ["ai_summary", "ai_status", "decided_by", "ai_confidence", "body"]) {
      expect(await errorOf(t.asUser(null, (q) => q(`select ${col} from public.news_items`)))).toMatch(/permission denied/);
    }
    const [g] = await t.q<{ cols: string[] }>(
      "select array_agg(column_name::text order by column_name) as cols from information_schema.column_privileges where table_schema = 'public' and table_name = 'news_items' and grantee = 'anon' and privilege_type = 'SELECT'",
    );
    expect(g.cols).toEqual(["campus", "excerpt", "id", "image_url", "published_on", "section", "state", "title", "url"]);
  });
});
