/* =============================================================================
   Fase 3 · administrar el catálogo.

   Recorre el criterio de aceptación 2: con la vr7 importada, la
   administración completa las 13 fichas del piloto y publica la versión 1,
   que ya no se puede editar.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { resolve } from "node:path";
import { importMatrix } from "../../src/modules/impacto/import/matrix";
import { PILOT_SHEETS } from "../../src/modules/impacto/data/pilot-sheets";
import { PEOPLE, createTestDb, errorOf } from "./harness";
import type { TestDb } from "./harness";

let t: TestDb;
let draftId: string;

const admin = <T>(work: Parameters<TestDb["asUser"]>[1] extends (q: infer Q) => unknown ? (q: Q) => Promise<T> : never) =>
  t.asUser(PEOPLE.admin, work, { commit: true });

beforeAll(async () => {
  t = await createTestDb();
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(resolve(__dirname, "../../UDES_Matriz_Impacto_Institucional_vr7.xlsx"));
  const payload = JSON.stringify({ sourceFile: "vr7.xlsx", ...importMatrix(book) });
  const r = await admin((q) => q<{ r: { versionId: string } }>("select imp_import_catalog($1::jsonb) as r", [payload]));
  draftId = r[0].r.versionId;
});

afterAll(async () => {
  await t.close();
});

describe("la lista del catálogo", () => {
  it("dice qué fichas están completas y cuántos hallazgos abiertos tiene cada indicador", async () => {
    const rows = await t.asUser(PEOPLE.admin, (q) =>
      q<{ code: string; sheet_complete: boolean; open_findings: string; version_state: string }>(
        "select code, sheet_complete, open_findings, version_state from imp_indicators_admin order by code",
      ),
    );
    expect(rows).toHaveLength(106);
    expect(rows.every((r) => !r.sheet_complete && r.version_state === "borrador")).toBe(true);
    expect(Number(rows.find((r) => r.code === "I01")!.open_findings)).toBeGreaterThan(0);
  });

  it("dice qué le falta a cada ficha", async () => {
    const [row] = await t.q<{ missing: string[] }>("select imp_sheet_missing(i) as missing from imp_indicators i where code = 'I01'");
    expect(row.missing).toContain("tipo de cálculo");
    expect(row.missing).toContain("unidad");
  });
});

describe("publicar", () => {
  it("se niega si un indicador en piloto tiene la ficha incompleta, y dice cuál", async () => {
    await admin((q) => q("update imp_indicators set in_pilot = true where code = 'I01'"));
    const message = await errorOf(t.asUser(PEOPLE.admin, (q) => q("select imp_publish_catalog($1)", [draftId])));
    expect(message).toMatch(/falta completar la ficha de I01 \(en piloto\)/);
  });

  it("la administración completa las 13 fichas del piloto", async () => {
    await admin(async (q) => {
      for (const { name, columns } of PILOT_SHEETS) {
        const sets = Object.keys(columns).map((k, i) => `${k} = $${i + 2}`).join(", ");
        const updated = await q(`update imp_indicators set ${sets} where version_id = $1 and name = $${Object.keys(columns).length + 2} returning code`, [
          draftId,
          ...Object.values(columns),
          name,
        ]);
        expect(updated, name).toHaveLength(1);
      }
      return null;
    });
    const rows = await t.q<{ code: string; complete: boolean }>(
      "select code, imp_sheet_complete(i) as complete from imp_indicators i where version_id = $1 and in_pilot order by code",
      [draftId],
    );
    expect(rows.map((r) => r.code)).toEqual(["E01", "E03", "E04", "E08", "E10", "E13", "I01", "I04", "I34", "X04", "X07", "X18", "X22"]);
    expect(rows.every((r) => r.complete)).toBe(true);
  });

  it("nadie más publica", async () => {
    expect(await errorOf(t.asUser(PEOPLE.decano, (q) => q("select imp_publish_catalog($1)", [draftId])))).toMatch(/Solo la administración/);
  });

  it("publica la versión 1", async () => {
    const [r] = await admin((q) => q<{ r: Record<string, number> }>("select imp_publish_catalog($1) as r", [draftId]));
    expect(r.r).toEqual({ number: 1, indicators: 106, pilot: 13 });
    const [v] = await t.q<{ state: string; published_by: string }>("select state, published_by from imp_catalog_versions where id = $1", [draftId]);
    expect(v).toEqual({ state: "publicada", published_by: PEOPLE.admin });
  });

  it("la versión publicada no se edita, ni siquiera por la administración", async () => {
    expect(
      await errorOf(t.asUser(PEOPLE.admin, (q) => q("update imp_indicators set name = 'Otro' where version_id = $1 and code = 'E04'", [draftId]))),
    ).toMatch(/publicada/);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select imp_publish_catalog($1)", [draftId])))).toMatch(/ya está publicada/);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select imp_renumber_codes($1)", [draftId])))).toMatch(/publicada/);
  });
});

describe("cambiar algo publicado es abrir la versión siguiente", () => {
  let v2: string;

  it("copia la publicada con fichas, metas, líneas base y alineaciones", async () => {
    const [r] = await admin((q) => q<{ id: string }>("select imp_new_draft() as id"));
    v2 = r.id;
    const [counts] = await t.q<Record<string, number>>(
      `select (select count(*)::int from imp_indicators where version_id = $1) as indicators,
              (select count(*)::int from imp_indicators where version_id = $1 and in_pilot) as pilot,
              (select count(*)::int from imp_targets t join imp_indicators i on i.id = t.indicator_id where i.version_id = $1) as targets,
              (select count(*)::int from imp_targets t join imp_indicators i on i.id = t.indicator_id where i.version_id = $2) as targets_v1,
              (select count(*)::int from imp_alignments a join imp_indicators i on i.id = a.indicator_id where i.version_id = $1) as alignments,
              (select count(*)::int from imp_alignments a join imp_indicators i on i.id = a.indicator_id where i.version_id = $2) as alignments_v1`,
      [v2, draftId],
    );
    expect(counts.indicators).toBe(106);
    expect(counts.pilot).toBe(13);
    expect(counts.targets).toBe(counts.targets_v1);
    expect(counts.alignments).toBe(counts.alignments_v1);
  });

  it("en el borrador sí se edita, y la versión 1 sigue igual", async () => {
    await admin((q) => q("update imp_indicators set variation_threshold = 20 where version_id = $1 and code = 'E04'", [v2]));
    const [v1] = await t.q<{ variation_threshold: string }>("select variation_threshold from imp_indicators where version_id = $1 and code = 'E04'", [draftId]);
    expect(Number(v1.variation_threshold)).toBe(15);
  });

  it("no abre un segundo borrador", async () => {
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select imp_new_draft()")))).toMatch(/Ya hay una versión en borrador/);
  });

  it("los códigos se editan a mano y se renumeran en el orden de la matriz", async () => {
    await admin((q) => q("update imp_indicators set code = 'I99' where version_id = $1 and code = 'I01'", [v2]));
    expect(
      await errorOf(t.asUser(PEOPLE.admin, (q) => q("update imp_indicators set code = 'I02' where version_id = $1 and code = 'I99'", [v2]))),
    ).toMatch(/imp_indicators_code_unique/);
    const [n] = await admin((q) => q<{ n: number }>("select imp_renumber_codes($1) as n", [v2]));
    expect(n.n).toBe(106);
    const [first] = await t.q<{ code: string; name: string }>(
      "select code, name from imp_indicators where version_id = $1 and function_id = 'investigacion' order by matrix_row limit 1",
      [v2],
    );
    expect(first).toEqual({ code: "I01", name: "Estudiantes vinculados a semilleros" });
  });
});

describe("hallazgos", () => {
  it("resolver o aceptar deja quién y cuándo; reabrir lo borra", async () => {
    const [f] = await t.q<{ id: string }>("select id from imp_import_findings where kind = 'unidad_numerica' limit 1");
    const [done] = await t.asUser(PEOPLE.admin, (q) =>
      q<{ state: string; resolved_by: string; resolved_at: string | null }>(
        "update imp_import_findings set state = 'resuelto', note = 'Unidad: número; 1920 va a línea base' where id = $1 returning state, resolved_by, resolved_at",
        [f.id],
      ),
    );
    expect(done.state).toBe("resuelto");
    expect(done.resolved_by).toBe(PEOPLE.admin);
    expect(done.resolved_at).not.toBeNull();

    const [reopened] = await t.asUser(PEOPLE.admin, (q) =>
      q<{ resolved_by: string | null }>("update imp_import_findings set state = 'abierto' where id = $1 returning resolved_by", [f.id]),
    );
    expect(reopened.resolved_by).toBeNull();
  });

  it("solo la administración los ve y los resuelve", async () => {
    const rows = await t.asUser(PEOPLE.director, (q) => q("select * from imp_import_findings"));
    expect(rows).toHaveLength(0);
  });
});
