/* =============================================================================
   Desgloses · mostrar total (0124): los que ya existen quedan con total, la
   opción se apaga por desglose y la migración se puede aplicar dos veces.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0124_desglose_mostrar_total.sql");

let t: TestDb;

beforeAll(async () => {
  // Hasta la 0124 inclusive: lo que venga después no es de esta prueba.
  t = await createTestDb({ before: "0125" });
}, 120_000);

afterAll(() => t?.close());

describe("od_breakdowns.show_total", () => {
  it("los desgloses que ya existían quedan con total", async () => {
    const rows = await t.q<{ total: number; con_total: number }>(
      "select count(*)::int as total, count(*) filter (where show_total)::int as con_total from od_breakdowns",
    );
    expect(rows[0].total).toBeGreaterThan(0);
    expect(rows[0].con_total).toBe(rows[0].total);
  });

  it("un desglose nuevo nace con total", async () => {
    const [row] = await t.q<{ show_total: boolean }>(
      "insert into od_breakdowns (report_id, key, title) select report_id, 'prueba-total', 'Prueba' from od_breakdowns limit 1 returning show_total",
    );
    expect(row.show_total).toBe(true);
  });

  it("se apaga por desglose y aplicar la migración otra vez no lo revierte", async () => {
    await t.q("update od_breakdowns set show_total = false where key = 'prueba-total'");
    await t.db.exec(readFileSync(MIGRATION, "utf8"));
    const rows = await t.q<{ key: string }>("select key from od_breakdowns where not show_total");
    expect(rows).toEqual([{ key: "prueba-total" }]);
  });
});
