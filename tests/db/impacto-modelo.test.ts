/* =============================================================================
   Fase 1 · modelo de datos de Impacto.

   Integridad, versión publicada inmutable, bitácoras de solo inserción, valor
   calculado por la base, flujo permitido y quién ve y escribe qué.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PEOPLE, UNITS, createTestDb, errorOf, publishedFixture } from "./harness";
import type { TestDb } from "./harness";

let t: TestDb;
let f: Awaited<ReturnType<typeof publishedFixture>>;

beforeAll(async () => {
  t = await createTestDb();
  f = await publishedFixture(t.q);
});

afterAll(async () => {
  await t.close();
});

describe("migraciones y semillas", () => {
  it("aplican todas sobre una base vacía", async () => {
    const [row] = await t.q<{ n: number }>("select count(*)::int as n from pg_tables where schemaname = 'public' and tablename like 'imp\\_%'");
    expect(row.n).toBeGreaterThanOrEqual(15);
  });

  it("se pueden volver a ejecutar sin romper nada (idempotentes)", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join, resolve } = await import("node:path");
    const dir = resolve(__dirname, "../../supabase/migrations");
    for (const file of readdirSync(dir).filter((name) => name >= "0061" && name.endsWith(".sql")).sort()) {
      await t.db.exec(readFileSync(join(dir, file), "utf8"));
    }
    const [row] = await t.q<{ n: number }>("select count(*)::int as n from access_roles where key like 'impacto\\_%'");
    expect(row.n).toBe(5);
  });

  it("siembran los catálogos maestros de PORTADA", async () => {
    const rows = await t.q<{ kind: string; n: number }>("select kind, count(*)::int as n from imp_master_catalog group by kind order by kind");
    expect(Object.fromEntries(rows.map((r) => [r.kind, r.n]))).toEqual({ ods: 14, pilar: 6, proyecto: 7 });
  });

  it("tienen las cuatro sedes, con Bogotá en borrador", async () => {
    const rows = await t.q<{ slug: string; status: string }>("select slug, status::text from campuses order by position");
    expect(rows.map((r) => r.slug)).toEqual(["bucaramanga", "cucuta", "valledupar", "bogota"]);
    expect(rows.find((r) => r.slug === "bogota")?.status).toBe("borrador");
  });

  it("crean los cinco roles de Impacto con sus capacidades", async () => {
    const rows = await t.q<{ key: string; capabilities: string[] }>(
      "select key, capabilities from access_roles where key like 'impacto\\_%' order by position",
    );
    expect(rows).toEqual([
      { key: "impacto_admin", capabilities: ["impacto.catalogo", "impacto.periodo"] },
      { key: "impacto_director", capabilities: ["impacto.capturar", "impacto.enviar"] },
      { key: "impacto_reportante", capabilities: ["impacto.capturar"] },
      { key: "impacto_decano", capabilities: ["impacto.aprobar"] },
      { key: "impacto_vicerrector", capabilities: ["impacto.validar"] },
    ]);
  });

  it("dejan crear roles nuevos, pero solo con capacidades conocidas", async () => {
    await t.q("insert into access_roles (key, name, capabilities) values ('impacto_auditor', 'Auditoría', '{impacto.aprobar}')");
    expect(await errorOf(t.q("insert into access_roles (key, name, capabilities) values ('x', 'X', '{impacto.borrar_todo}')"))).toMatch(
      /access_roles_capabilities_known/,
    );
  });
});

describe("integridad", () => {
  it("un código de indicador no se repite en una versión", async () => {
    const [draft] = await t.q<{ id: string }>("insert into imp_catalog_versions (number) values (2) returning id");
    await t.q("insert into imp_indicators (version_id, code, function_id, level, name) values ($1, 'I01', 'investigacion', 'insumos', 'Uno')", [draft.id]);
    expect(
      await errorOf(t.q("insert into imp_indicators (version_id, code, function_id, level, name) values ($1, 'I01', 'investigacion', 'insumos', 'Otro')", [draft.id])),
    ).toMatch(/imp_indicators_code_unique/);
    await t.q("delete from imp_catalog_versions where id = $1", [draft.id]);
  });

  it("el código corresponde a la función", async () => {
    const [draft] = await t.q<{ id: string }>("insert into imp_catalog_versions (number) values (3) returning id");
    expect(
      await errorOf(t.q("insert into imp_indicators (version_id, code, function_id, level, name) values ($1, 'X01', 'investigacion', 'insumos', 'Mal')", [draft.id])),
    ).toMatch(/imp_indicators_code_prefix/);
    await t.q("delete from imp_catalog_versions where id = $1", [draft.id]);
  });

  it("solo hay un borrador de catálogo a la vez", async () => {
    await t.q("insert into imp_catalog_versions (number) values (4)");
    expect(await errorOf(t.q("insert into imp_catalog_versions (number) values (5)"))).toMatch(/imp_versions_one_draft/);
    await t.q("delete from imp_catalog_versions where number = 4");
  });

  it("el factor solo es 1 o 100 y una meta necesita un valor", async () => {
    expect(await errorOf(t.q("update imp_indicators set factor = 10 where id = $1", [f.ratioId]))).toMatch(/publicada|imp_indicators_factor/);
    const [draft] = await t.q<{ id: string }>("insert into imp_catalog_versions (number) values (6) returning id");
    const [ind] = await t.q<{ id: string }>(
      "insert into imp_indicators (version_id, code, function_id, level, name) values ($1, 'E01', 'ensenanza', 'insumos', 'Uno') returning id",
      [draft.id],
    );
    expect(await errorOf(t.q("update imp_indicators set factor = 10 where id = $1", [ind.id]))).toMatch(/imp_indicators_factor/);
    expect(await errorOf(t.q("insert into imp_targets (indicator_id, year) values ($1, 2026)", [ind.id]))).toMatch(/imp_targets_value/);
    await t.q("delete from imp_catalog_versions where id = $1", [draft.id]);
  });

  it("un periodo solo se abre con una versión publicada y con cortes en orden", async () => {
    const [draft] = await t.q<{ id: string }>("insert into imp_catalog_versions (number) values (7) returning id");
    expect(
      await errorOf(t.q("insert into imp_periods (code, catalog_version_id, cutoff_program, cutoff_faculty, cutoff_vice) values ('2027-1', $1, '2027-04-01', '2027-04-10', '2027-04-20')", [draft.id])),
    ).toMatch(/versión publicada/);
    expect(
      await errorOf(t.q("insert into imp_periods (code, catalog_version_id, cutoff_program, cutoff_faculty, cutoff_vice) values ('2027-1', $1, '2027-04-20', '2027-04-10', '2027-04-01')", [f.versionId])),
    ).toMatch(/imp_periods_cutoffs/);
    expect(
      await errorOf(t.q("insert into imp_periods (code, catalog_version_id, cutoff_program, cutoff_faculty, cutoff_vice) values ('2027-3', $1, '2027-04-01', '2027-04-10', '2027-04-20')", [f.versionId])),
    ).toMatch(/imp_periods_code_format/);
    await t.q("delete from imp_catalog_versions where id = $1", [draft.id]);
  });

  it("una asignación no se repite, va a un programa y a una sede donde se ofrece", async () => {
    expect(
      await errorOf(t.q("insert into imp_assignments (period_id, indicator_id, program_id, campus_id) values ($1, $2, $3, $4)", [f.periodId, f.ratioId, UNITS.programaA, f.bucaramangaId])),
    ).toMatch(/imp_assignments_unique/);
    // Sin sede también es única: nulls not distinct.
    expect(
      await errorOf(t.q("insert into imp_assignments (period_id, indicator_id, program_id) values ($1, $2, $3)", [f.periodId, f.countId, UNITS.programaA])),
    ).toMatch(/imp_assignments_unique/);
    expect(
      await errorOf(t.q("insert into imp_assignments (period_id, indicator_id, program_id) values ($1, $2, $3)", [f.periodId, f.countId, UNITS.facultad])),
    ).toMatch(/Solo un programa/);
    const [valledupar] = await t.q<{ id: string }>("select id from campuses where slug = 'valledupar'");
    expect(
      await errorOf(t.q("insert into imp_assignments (period_id, indicator_id, program_id, campus_id) values ($1, $2, $3, $4)", [f.periodId, f.ratioId, UNITS.programaB, valledupar.id])),
    ).toMatch(/no se ofrece en esa sede/);
  });

  it("quitar una asignación exige justificación", async () => {
    const [a] = await t.q<{ id: string }>("select id from imp_assignments where indicator_id = $1", [f.countId]);
    expect(await errorOf(t.q("update imp_assignments set active = false where id = $1", [a.id]))).toMatch(/imp_assignments_justified/);
  });

  it("los números del registro no son negativos", async () => {
    expect(await errorOf(t.q("update imp_records set numerator = -3 where id = $1", [f.countRecordId]))).toMatch(/imp_records_nonnegative/);
  });

  it("la evidencia es un enlace válido o un archivo permitido de hasta 10 MB", async () => {
    expect(await errorOf(t.q("insert into imp_evidence (record_id, kind, url) values ($1, 'url', 'no es un enlace')", [f.countRecordId]))).toMatch(/imp_evidence_shape/);
    expect(
      await errorOf(t.q("insert into imp_evidence (record_id, kind, storage_path, file_name, size_bytes) values ($1, 'archivo', 'a/b.pdf', 'b.pdf', 20000000)", [f.countRecordId])),
    ).toMatch(/imp_evidence_size/);
    expect(
      await errorOf(t.q("insert into imp_evidence (record_id, kind, storage_path, file_name) values ($1, 'archivo', 'a/b.exe', 'b.exe')", [f.countRecordId])),
    ).toMatch(/imp_evidence_file_type/);
    await t.q("insert into imp_evidence (record_id, kind, url) values ($1, 'url', 'https://udes.edu.co/acta.pdf')", [f.countRecordId]);
  });
});

describe("versión publicada inmutable", () => {
  it("no se editan sus indicadores", async () => {
    expect(await errorOf(t.q("update imp_indicators set name = 'Otro' where id = $1", [f.ratioId]))).toMatch(/publicada/);
  });

  it("no se le agregan ni se le quitan indicadores, metas o alineaciones", async () => {
    expect(
      await errorOf(t.q("insert into imp_indicators (version_id, code, function_id, level, name) values ($1, 'E99', 'ensenanza', 'insumos', 'Nuevo')", [f.versionId])),
    ).toMatch(/publicada/);
    expect(await errorOf(t.q("delete from imp_indicators where id = $1", [f.ratioId]))).toMatch(/publicada/);
    expect(await errorOf(t.q("insert into imp_targets (indicator_id, year, numeric_value) values ($1, 2026, 95)", [f.ratioId]))).toMatch(/publicada/);
    expect(await errorOf(t.q("insert into imp_alignments (indicator_id, kind, code) values ($1, 'ods', '4')", [f.ratioId]))).toMatch(/publicada/);
  });

  it("no vuelve a borrador ni se borra", async () => {
    expect(await errorOf(t.q("update imp_catalog_versions set state = 'borrador', published_at = null where id = $1", [f.versionId]))).toMatch(/publicada/);
    expect(await errorOf(t.q("delete from imp_catalog_versions where id = $1", [f.versionId]))).toMatch(/publicada|violates foreign key/);
  });

  it("un borrador sí se edita", async () => {
    const [draft] = await t.q<{ id: string }>("insert into imp_catalog_versions (number) values (8) returning id");
    const [ind] = await t.q<{ id: string }>(
      "insert into imp_indicators (version_id, code, function_id, level, name) values ($1, 'I02', 'investigacion', 'insumos', 'Uno') returning id",
      [draft.id],
    );
    await t.q("update imp_indicators set name = 'Uno, corregido' where id = $1", [ind.id]);
    await t.q("delete from imp_catalog_versions where id = $1", [draft.id]);
  });

  it("la ficha se sabe completa o incompleta sin marcarla a mano", async () => {
    const rows = await t.q<{ code: string; complete: boolean }>(
      "select i.code, imp_sheet_complete(i) as complete from imp_indicators i where version_id = $1 order by code",
      [f.versionId],
    );
    expect(rows).toEqual([
      { code: "E04", complete: true },
      { code: "E13", complete: true },
    ]);
  });
});

describe("valor calculado por la base", () => {
  it("una razón es numerador ÷ denominador × factor", async () => {
    const [r] = await t.q<{ value: string }>("update imp_records set numerator = 45, denominator = 50 where id = $1 returning value", [f.ratioRecordId]);
    expect(Number(r.value)).toBe(90);
  });

  it("lo que mande el cliente como valor se ignora", async () => {
    const [r] = await t.q<{ value: string }>("update imp_records set value = 12 where id = $1 returning value", [f.ratioRecordId]);
    expect(Number(r.value)).toBe(90);
  });

  it("sin denominador no hay porcentaje", async () => {
    const [r] = await t.q<{ value: string | null }>("update imp_records set denominator = null where id = $1 returning value", [f.ratioRecordId]);
    expect(r.value).toBeNull();
  });

  it("un conteo es el valor directo y «no aplica» no tiene valor", async () => {
    const [a] = await t.q<{ value: string }>("update imp_records set numerator = 3 where id = $1 returning value", [f.countRecordId]);
    expect(Number(a.value)).toBe(3);
    const [b] = await t.q<{ value: string | null }>(
      "update imp_records set no_data = 'no_aplica', justification = 'No hubo' where id = $1 returning value",
      [f.countRecordId],
    );
    expect(b.value).toBeNull();
    await t.q("update imp_records set no_data = null, justification = '' where id = $1", [f.countRecordId]);
  });

  it("cada cambio sube la versión del registro", async () => {
    const [before] = await t.q<{ version: number }>("select version from imp_records where id = $1", [f.countRecordId]);
    const [after] = await t.q<{ version: number }>("update imp_records set observations = 'ok' where id = $1 returning version", [f.countRecordId]);
    expect(after.version).toBe(before.version + 1);
  });
});

describe("bitácoras de solo inserción", () => {
  it("una transición permitida se registra", async () => {
    await t.q("insert into imp_transitions (record_id, from_state, to_state, actor_id) values ($1, 'borrador', 'enviado', $2)", [
      f.countRecordId,
      PEOPLE.director,
    ]);
  });

  it("una transición imposible se rechaza", async () => {
    expect(
      await errorOf(t.q("insert into imp_transitions (record_id, from_state, to_state) values ($1, 'borrador', 'validado')", [f.countRecordId])),
    ).toMatch(/No se puede pasar/);
    expect(
      await errorOf(t.q("insert into imp_transitions (record_id, from_state, to_state) values ($1, 'validado', 'borrador')", [f.countRecordId])),
    ).toMatch(/No se puede pasar/);
  });

  it("devolver exige motivo de la lista y comentario", async () => {
    expect(
      await errorOf(t.q("insert into imp_transitions (record_id, from_state, to_state) values ($1, 'enviado', 'devuelto_programa')", [f.countRecordId])),
    ).toMatch(/imp_transitions_return_explained/);
    expect(
      await errorOf(t.q("insert into imp_transitions (record_id, from_state, to_state, reason, comment) values ($1, 'enviado', 'devuelto_programa', 'porque_si', 'x')", [f.countRecordId])),
    ).toMatch(/imp_transitions_reason/);
    await t.q(
      "insert into imp_transitions (record_id, from_state, to_state, reason, comment) values ($1, 'enviado', 'devuelto_programa', 'evidencia_insuficiente', 'Falta el acta')",
      [f.countRecordId],
    );
  });

  it("las transiciones no se editan, no se borran ni se vacían, ni siquiera como dueño", async () => {
    expect(await errorOf(t.q("update imp_transitions set comment = 'otro'"))).toMatch(/bitácora/);
    expect(await errorOf(t.q("delete from imp_transitions"))).toMatch(/bitácora/);
    expect(await errorOf(t.q("truncate imp_transitions"))).toMatch(/bitácora/);
  });

  it("los lotes de importación tampoco", async () => {
    await t.q(
      "insert into imp_import_batches (period_id, program_id, file_name, actor_id, rows_read, rows_loaded, rows_error) values ($1, $2, 'plantilla.xlsx', $3, 10, 8, 2)",
      [f.periodId, UNITS.programaA, PEOPLE.director],
    );
    const [batch] = await t.q<{ id: number }>("select id from imp_import_batches limit 1");
    await t.q("insert into imp_import_batch_records (batch_id, record_id) values ($1, $2)", [batch.id, f.countRecordId]);
    expect(await errorOf(t.q("update imp_import_batches set rows_loaded = 10"))).toMatch(/bitácora/);
    expect(await errorOf(t.q("delete from imp_import_batches"))).toMatch(/bitácora/);
    expect(await errorOf(t.q("delete from imp_import_batch_records"))).toMatch(/bitácora/);
    expect(await errorOf(t.q("truncate imp_import_batches cascade"))).toMatch(/bitácora/);
    expect(
      await errorOf(t.q("insert into imp_import_batches (period_id, program_id, file_name, rows_read, rows_loaded, rows_error) values ($1, $2, 'x', 1, 1, 1)", [f.periodId, UNITS.programaA])),
    ).toMatch(/imp_batches_counts/);
  });
});

describe("quién ve y quién escribe", () => {
  it("capturar no se hereda: el decano no captura en sus programas", async () => {
    const rows = await t.asUser(PEOPLE.decano, (q) =>
      q<{ captura: boolean; aprueba: boolean }>("select imp_can('impacto.capturar', $1) as captura, imp_can('impacto.aprobar', $1, true) as aprueba", [
        UNITS.programaA,
      ]),
    );
    expect(rows[0]).toEqual({ captura: false, aprueba: true });
  });

  it("la directora captura en su programa y no en otro", async () => {
    const rows = await t.asUser(PEOPLE.director, (q) =>
      q<{ propio: boolean; ajeno: boolean }>("select imp_can('impacto.capturar', $1) as propio, imp_can('impacto.capturar', $2) as ajeno", [
        UNITS.programaA,
        UNITS.programaB,
      ]),
    );
    expect(rows[0]).toEqual({ propio: true, ajeno: false });
  });

  it("la vicerrectoría valida su función", async () => {
    const [vi] = await t.asUser(PEOPLE.vi, (q) => q<{ f: string[] }>("select imp_validator_functions() as f"));
    const [ve] = await t.asUser(PEOPLE.ve, (q) => q<{ f: string[] }>("select imp_validator_functions() as f"));
    expect(vi.f).toEqual(["investigacion"]);
    expect(ve.f).toEqual(["ensenanza"]);
  });

  it("la administración de Impacto configura pero no captura", async () => {
    const [row] = await t.asUser(PEOPLE.admin, (q) =>
      q<{ catalogo: boolean; captura: boolean }>("select imp_can_global('impacto.catalogo') as catalogo, imp_can('impacto.capturar', $1, true) as captura", [
        UNITS.programaA,
      ]),
    );
    expect(row).toEqual({ catalogo: true, captura: false });
  });

  it("cada quien ve los registros que le tocan", async () => {
    const count = (user: string) =>
      t.asUser(user, (q) => q<{ n: number }>("select count(*)::int as n from imp_records")).then((r) => r[0].n);
    expect(await count(PEOPLE.director)).toBe(2);
    expect(await count(PEOPLE.decano)).toBe(2);
    expect(await count(PEOPLE.ve)).toBe(2);
    expect(await count(PEOPLE.vi)).toBe(0);
    expect(await count(PEOPLE.otroDirector)).toBe(0);
    expect(await count(PEOPLE.admin)).toBe(2);
  });

  it("sin sesión no se ve nada de Impacto", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select * from imp_records")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select * from imp_indicators")))).toMatch(/permission denied/);
  });

  it("la reportante escribe en borrador; el decano no puede", async () => {
    await t.q("update imp_records set state = 'borrador' where id = $1", [f.ratioRecordId]);
    const written = await t.asUser(PEOPLE.reportante, (q) =>
      q("update imp_records set numerator = 40, denominator = 50 where id = $1 returning id", [f.ratioRecordId]),
    );
    expect(written).toHaveLength(1);
    const blocked = await t.asUser(PEOPLE.decano, (q) =>
      q("update imp_records set numerator = 1 where id = $1 returning id", [f.ratioRecordId]),
    );
    expect(blocked).toHaveLength(0);
  });

  it("un registro enviado ya no se edita desde el programa", async () => {
    await t.q("update imp_records set state = 'enviado' where id = $1", [f.ratioRecordId]);
    const blocked = await t.asUser(PEOPLE.director, (q) =>
      q("update imp_records set numerator = 1 where id = $1 returning id", [f.ratioRecordId]),
    );
    expect(blocked).toHaveLength(0);
    await t.q("update imp_records set state = 'borrador' where id = $1", [f.ratioRecordId]);
  });

  it("el programa no se cambia de estado a sí mismo por la puerta de atrás", async () => {
    expect(
      await errorOf(t.asUser(PEOPLE.director, (q) => q("update imp_records set state = 'validado' where id = $1", [f.ratioRecordId]))),
    ).toMatch(/row-level security/);
  });

  it("nadie escribe la bitácora directamente", async () => {
    expect(
      await errorOf(
        t.asUser(PEOPLE.director, (q) =>
          q("insert into imp_transitions (record_id, from_state, to_state) values ($1, 'borrador', 'enviado')", [f.ratioRecordId]),
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it("el catálogo lo escribe solo la administración de Impacto", async () => {
    expect(
      await errorOf(t.asUser(PEOPLE.director, (q) => q("insert into imp_catalog_versions (number) values (50)"))),
    ).toMatch(/row-level security/);
    await t.asUser(PEOPLE.admin, (q) => q("insert into imp_catalog_versions (number) values (50)"));
  });
});
