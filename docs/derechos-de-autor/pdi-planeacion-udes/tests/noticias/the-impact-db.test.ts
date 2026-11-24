/* Migración 0148 (THE Impact Rankings, generada por scripts/import-the-impact.mjs)
   en un Postgres en memoria: datos, idempotencia y permisos. */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseBanda, parseRango } from "../../src/modules/rankings/posicion/bandas";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "../db/harness";

const ROOT = resolve(__dirname, "../..");
const MIGRATION = resolve(ROOT, "supabase/migrations/0148_the_impact_ranking.sql");
const SEED = JSON.parse(readFileSync(resolve(ROOT, "supabase/seed/the-impact-2026.json"), "utf8"));
let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update public.profiles set role = 'planeacion', is_active = true where id = $1", [PEOPLE.admin]);
});
afterAll(async () => t?.close());

describe("0148 · THE Impact Rankings", () => {
  it("carga las 1.603 filas de 2026, 15 de Colombia, y la UDES", async () => {
    const [n] = await t.q<{ n: number; col: number }>("select count(*)::int as n, count(*) filter (where country = 'Colombia')::int as col from public.the_impact_rows where year = 2026 and scope = 'overall'");
    expect(n).toEqual({ n: 1603, col: 15 });
    const [u] = await t.q<Record<string, unknown>>("select rank_label, rank_lo, rank_hi, overall_lo::float, overall_hi::float, sdg17_rank_label, best from public.the_impact_rows where name = 'University of Santander'");
    expect(u).toMatchObject({ rank_label: "601–800", rank_lo: 601, rank_hi: 800, overall_lo: 60.7, overall_hi: 66.1, sdg17_rank_label: "401–600" });
    expect((u.best as { sdg: number }[]).map((b) => b.sdg)).toEqual([5, 10, 4]);
    const [abierta] = await t.q<{ n: number }>("select count(*)::int as n from public.the_impact_rows where rank_label = '1501+' and rank_hi is null and rank_lo = 1501");
    expect(abierta.n).toBeGreaterThan(50);
    const [empate] = await t.q<{ rank_lo: number; rank_hi: number }>("select rank_lo, rank_hi from public.the_impact_rows where rank_label = '=96' limit 1");
    expect(empate).toEqual({ rank_lo: 96, rank_hi: 96 });
    const [s] = await t.q<{ row_count: number; captured_at: string }>("select row_count, captured_at::text from public.the_impact_snapshots where year = 2026");
    expect(s.row_count).toBe(1603);
    expect(s.captured_at).toMatch(/^2026-10-13/);
  });

  it("es idempotente", async () => {
    await t.db.exec(readFileSync(MIGRATION, "utf8"));
    await t.db.exec(readFileSync(MIGRATION, "utf8"));
    const [n] = await t.q<{ n: number }>("select count(*)::int as n from public.the_impact_rows");
    expect(n.n).toBe(1603);
    const [s] = await t.q<{ n: number }>("select count(*)::int as n from public.the_impact_snapshots");
    expect(s.n).toBe(1);
  });

  it("valida rangos y unicidad", async () => {
    expect(await errorOf(t.q("insert into public.the_impact_rows (year, rank_lo, rank_label, overall_lo, overall_hi, name, iid) values (2026, 5, '5', 70, 60, 'X', 'x')"))).toMatch(/the_impact_rows_overall/);
    expect(await errorOf(t.q("insert into public.the_impact_rows (year, scope, rank_lo, rank_label, overall_lo, overall_hi, name, iid) values (2026, 'sdg18', 5, '5', 60, 70, 'X', 'x')"))).toMatch(/the_impact_rows_scope/);
    expect(await errorOf(t.q("insert into public.the_impact_rows (year, rank_lo, rank_label, overall_lo, overall_hi, name, iid) values (2026, 5, '5', 60, 70, 'X', 'i-30837834')"))).toMatch(/the_impact_rows_unique|duplicate/);
  });

  it("solo Planeación y la administración leen; nadie escribe desde la aplicación; el público no ve nada", async () => {
    const [n] = await t.asUser(PEOPLE.admin, (q) => q<{ n: number }>("select count(*)::int as n from public.the_impact_rows"));
    expect(n.n).toBe(1603);
    const [d] = await t.asUser(PEOPLE.director, (q) => q<{ n: number }>("select count(*)::int as n from public.the_impact_rows"));
    expect(d.n).toBe(0);
    expect(await errorOf(t.asUser(null, (q) => q("select count(*) from public.the_impact_rows")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select count(*) from public.the_impact_snapshots")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("update public.the_impact_rows set name = 'X' where iid = 'i-30837834'")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("delete from public.the_impact_snapshots where year = 2026")))).toMatch(/permission denied/);
  });
});

describe("importador", () => {
  it("la semilla y bandas.ts coinciden", () => {
    for (const r of SEED.rows) {
      expect(parseBanda(r.rank_label)).toMatchObject({ lo: r.rank_lo, hi: r.rank_hi });
      if (r.sdg17_rank_label) expect(parseBanda(r.sdg17_rank_label)).toMatchObject({ lo: r.sdg17_rank_lo, hi: r.sdg17_rank_hi });
    }
    expect(parseRango("60.7–66.1")).toEqual({ lo: 60.7, hi: 66.1 });
    expect(SEED).toMatchObject({ year: 2026, scope: "overall", row_count: 1603 });
    expect(JSON.stringify(SEED)).not.toMatch(/apply_link|logo_url|doubleclick/);
  });

  it("desde un JSON ya extraído, con otro año y solo datos, escribe lo mismo para las filas", () => {
    const dir = mkdtempSync(join(tmpdir(), "the-impact-"));
    const json = join(dir, "next.json");
    const sql = join(dir, "datos.sql");
    // Un __NEXT_DATA__ mínimo con dos filas reales de la semilla, en el formato de THE.
    const crudo = (r: (typeof SEED.rows)[number]) => ({
      rank: r.rank_label,
      name: r.name,
      scores_overall: r.overall_lo === r.overall_hi ? String(r.overall_lo) : `${r.overall_lo}–${r.overall_hi}`,
      iid: r.iid,
      nid: r.nid,
      location: r.country,
      stats_number_students: r.students === null ? "" : r.students.toLocaleString("en-US"),
      sdg17_rankings_score_display: `${r.sdg17_lo}–${r.sdg17_hi}`,
      sdg17_rankings_rank_display: r.sdg17_rank_label,
      best_scores: r.best.map((b: { sdg: number; lo: number; hi: number; rank_label: string }) => ({ sdg_number: String(b.sdg), score_display: `${b.lo}–${b.hi}`, rank_display: b.rank_label })),
    });
    const udes = SEED.rows.find((r: { name: string }) => r.name === "University of Santander");
    const next = { props: { pageProps: { page: { rankingsTableConfig: { year: "2025", type: "world_impact_rankings", jsonUrl: "", rankingsData: { data: [crudo(udes)], sdg_rankings: {} } } } } } };
    writeFileSync(json, JSON.stringify(next));
    execFileSync(process.execPath, [join(ROOT, "scripts/import-the-impact.mjs"), json, "--year", "2099", "--solo-datos", "--sql", sql, "--capturado", "2026-10-13"], { stdio: "pipe" });
    const out = readFileSync(sql, "utf8");
    expect(out).not.toMatch(/create table/);
    expect(out).toMatch(/delete from public\.the_impact_rows where year = 2099 and scope = 'overall'/);
    const seed99 = JSON.parse(readFileSync(resolve(ROOT, "supabase/seed/the-impact-2099.json"), "utf8"));
    rmSync(resolve(ROOT, "supabase/seed/the-impact-2099.json"));
    expect(seed99.rows[0]).toEqual(udes);
  });
});
