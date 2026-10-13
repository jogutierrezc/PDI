/* El informe 2025 de los ODS importado de sdgudes.github.io (0147):
   el JSON parseado, el contrato de los bloques y la migración en un Postgres
   en memoria (idempotente, sin pisar lo editado, archivo cerrado al público). */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SECCIONES, type Cifra, type Seccion } from "../../src/modules/rankings/informes/tipos";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "../db/harness";

const RAIZ = resolve(__dirname, "../..");
const MIGRACION = resolve(RAIZ, "supabase/migrations/0147_informe_2025_importado.sql");

type Bi = { es: string; en: string };
interface BloqueImportado {
  sec: Seccion;
  pos: number;
  text: string;
  text_en: string;
  enabled: boolean;
  warn: string | null;
  en_ajeno?: boolean;
  figs?: (Cifra & { v_en: string; label_en: string; note?: string; note_en?: string })[];
}
interface OdsImportado {
  ods: number;
  archivo: string;
  titulo: Bi;
  tesis: Bi[];
  bloques: BloqueImportado[];
  videos: { url: string }[];
  enlaces: { href: string }[];
  indicadores?: { indicator: string; page_es: string[]; page_en: string }[];
  conteo: Record<string, number>;
  rarezas: string[];
}
const seed = JSON.parse(readFileSync(resolve(RAIZ, "supabase/seed/informe-2025.json"), "utf8")) as {
  edicion: number;
  fuente: { repo: string; commit: string };
  ods: OdsImportado[];
};
const URL = /https?:\/\/|www\.|\.(com|co|org)\//i;
const totalBloques = seed.ods.reduce((n, i) => n + i.bloques.length, 0);
const ods = (n: number) => seed.ods.find((i) => i.ods === n)!;
const todos = seed.ods.flatMap((i) => i.bloques.map((b) => ({ ...b, ods: i.ods })));
const deshabilitados = todos.filter((b) => !b.enabled);
const PUBLICADOS = [4, 13];

describe("informe 2025 · lo parseado", () => {
  it("tiene los 17 ODS, en orden, edición 2025", () => {
    expect(seed.edicion).toBe(2025);
    expect(seed.ods.map((i) => i.ods)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    for (const i of seed.ods) expect(i.archivo).toBe(`ods${i.ods}_informe.html`);
  });

  it("cada ODS trae español e inglés en todos los pares", () => {
    for (const i of seed.ods) {
      expect(i.titulo.es, `ODS ${i.ods} título`).toMatch(new RegExp(`^ODS ${i.ods}:`));
      expect(i.titulo.en, `ODS ${i.ods} title`).toMatch(new RegExp(`^SDG ${i.ods}:`));
      expect(i.tesis.length, `ODS ${i.ods} tesis`).toBeGreaterThan(0);
      for (const t of i.tesis) {
        expect(t.es.trim(), `ODS ${i.ods} tesis es`).not.toBe("");
        expect(t.en.trim(), `ODS ${i.ods} tesis en`).not.toBe("");
      }
      for (const b of i.bloques) {
        expect(b.text.trim(), `ODS ${i.ods} bloque ${b.pos}`).not.toBe("");
        // Vacío solo si el HTML traía el inglés de otro ODS: queda para traducir, con aviso.
        if (b.en_ajeno) expect(b.text_en).toBe("");
        else expect(b.text_en.trim(), `ODS ${i.ods} bloque ${b.pos} en`).not.toBe("");
      }
    }
  });

  it("las cifras llevan valor y etiqueta en los dos idiomas", () => {
    for (const i of seed.ods)
      for (const f of i.bloques.flatMap((b) => b.figs ?? [])) {
        expect(f.v, `ODS ${i.ods}`).toMatch(/\d/);
        expect(f.label.trim()).not.toBe("");
        expect(f.v_en).toMatch(/\d/);
        expect(f.label_en.trim()).not.toBe("");
        expect(f.src).toBe("Informe 2025");
      }
  });

  it("ODS 4 trae sus cifras reales al uso español (16.030 y 20,09 %)", () => {
    const texto = JSON.stringify(ods(4).bloques);
    expect(texto).toContain("16.030");
    expect(texto).toContain("20,09");
    const figs = ods(4).bloques.find((b) => b.sec === "cifras")!.figs!;
    expect(figs.find((f) => f.v === "16.030")?.v_en).toBe("16,030");
    expect(figs.find((f) => f.v === "20,09 %")?.v_en).toBe("20.09%");
  });

  it("ODS 13 trae sus 4 indicadores de evidencia (13.1 a 13.4)", () => {
    const ind = ods(13).indicadores!;
    expect(ind.map((e) => e.indicator)).toEqual(["13.1", "13.2", "13.3", "13.4"]);
    expect(ind.find((e) => e.indicator === "13.1")!.page_es.join(" ")).toMatch(/Estufa de hidrógeno/);
    for (const e of ind) for (const l of e.page_es) expect(l).not.toMatch(URL);
    expect(ods(13).bloques.some((b) => b.sec === "viene")).toBe(true);
  });

  it("los bloques cumplen el contrato de Bloque", () => {
    const validas = new Set(SECCIONES.map((s) => s.id));
    for (const i of seed.ods) {
      expect(i.bloques.map((b) => b.pos), `ODS ${i.ods} pos`).toEqual(i.bloques.map((_, k) => k + 1));
      expect(i.bloques.filter((b) => b.sec === "cifras").length).toBeLessThanOrEqual(1);
      for (const b of i.bloques) {
        expect(validas.has(b.sec)).toBe(true);
        expect(b.text.length).toBeLessThanOrEqual(6000);
        expect(b.text_en.length).toBeLessThanOrEqual(6000);
        expect(b.text).not.toMatch(/\s{2}/);
        expect(b.text).not.toMatch(/^\p{Extended_Pictographic}/u);
      }
    }
  });

  it("no hay ni una URL dentro de los textos de los bloques", () => {
    for (const i of seed.ods)
      for (const b of i.bloques) {
        expect(b.text, `ODS ${i.ods} bloque ${b.pos}`).not.toMatch(URL);
        expect(b.text_en, `ODS ${i.ods} block ${b.pos}`).not.toMatch(URL);
        for (const f of b.figs ?? []) expect(`${f.label} ${f.label_en} ${f.note ?? ""}`).not.toMatch(URL);
      }
  });

  it("los repetidos entre ODS quedan deshabilitados con aviso; el primero por número conserva el suyo", () => {
    expect(deshabilitados.filter((b) => b.ods === 3)).toHaveLength(15);
    expect(deshabilitados.filter((b) => b.ods === 2)).toHaveLength(5);
    expect(deshabilitados.filter((b) => b.ods === 1)).toHaveLength(0);
    expect(deshabilitados.filter((b) => PUBLICADOS.includes(b.ods))).toHaveLength(0);
    for (const b of deshabilitados) expect(b.warn).toMatch(/^Texto repetido de otro ODS en el informe 2025/);
    const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const habilitados = new Map<string, number>();
    for (const b of todos.filter((x) => x.enabled)) {
      expect(habilitados.get(norm(b.text)), `ODS ${b.ods}: «${b.text.slice(0, 50)}»`).toBeUndefined();
      habilitados.set(norm(b.text), b.ods);
    }
    const ajenos = todos.filter((b) => b.en_ajeno);
    expect(ajenos.length).toBeGreaterThan(0);
    expect(ajenos.every((b) => b.ods === 2 && b.text_en === "" && /otro ODS/.test(b.warn ?? ""))).toBe(true);
  });

  it("resumen por ODS", () => {
    const filas = seed.ods.map((i) => ({
      ods: i.ods,
      tesis: i.conteo.tesis,
      cifras: i.conteo.cifras,
      hicimos: i.conteo.hicimos,
      proyectos: i.conteo.proyectos,
      viene: i.conteo.viene,
      figs: i.conteo.cifras_figs,
      estado: PUBLICADOS.includes(i.ods) ? "publicado" : "revision",
      deshabilitados: i.bloques.filter((b) => !b.enabled).length,
      sin_ingles: i.bloques.filter((b) => b.text_en === "").length,
      evidencias: i.indicadores?.length ?? 0,
      videos: i.videos.length,
      enlaces: i.enlaces.length,
      rarezas: i.rarezas.length,
    }));
    console.table(filas);
    expect(filas.reduce((n, f) => n + f.tesis + f.cifras + f.hicimos + f.proyectos + f.viene, 0)).toBe(totalBloques);
  });
});

describe("0147 · la migración en Postgres", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await t.q("update public.profiles set role = 'planeacion', is_active = true where id = $1", [PEOPLE.admin]);
  });
  afterAll(async () => t?.close());

  const cuenta = async (sql: string) => (await t.q<{ n: number }>(sql))[0].n;

  it("crea 17 informes (4 y 13 publicados, el resto en revisión) con sus bloques, la evidencia del ODS 13 y el archivo", async () => {
    const informes = await t.q<{ ods: number; state: string; settings: Record<string, unknown> }>(
      "select ods, state, settings from public.ods_reports where edition = 2025 order by ods",
    );
    expect(informes.map((r) => r.ods)).toEqual(seed.ods.map((i) => i.ods));
    for (const r of informes) {
      expect(r.state).toBe(PUBLICADOS.includes(r.ods) ? "publicado" : "revision");
      expect(r.settings).toEqual({ tone: "institucional", person: "tercera", legacy: true, source: "sdgudes.github.io", revision_notas: ods(r.ods).rarezas });
    }
    expect(await cuenta("select count(*)::int as n from public.ods_reports where state = 'publicado'")).toBe(2);
    expect(await cuenta("select count(*)::int as n from public.ods_reports where state = 'revision'")).toBe(15);
    expect(await cuenta("select count(*)::int as n from public.ods_report_blocks")).toBe(totalBloques);
    expect(await cuenta("select count(*)::int as n from public.ods_report_blocks where not enabled and warn like 'Texto repetido de otro ODS%'")).toBe(deshabilitados.length);
    expect(await cuenta("select count(*)::int as n from public.ods_report_blocks where text_en = '' and warn is not null")).toBe(todos.filter((b) => b.en_ajeno).length);
    expect(await cuenta("select count(*)::int as n from public.ods_report_blocks where origin <> 'persona' or text <> orig or text_en <> orig_en or (text_en = '' and warn is null) or sources <> '[]'::jsonb or (warn is not null) <> (not enabled or text_en = '') or spare")).toBe(0);
    const [b4] = await t.q<{ figs: Cifra[] }>(
      "select b.figs from public.ods_report_blocks b join public.ods_reports r on r.id = b.report_id where r.ods = 4 and b.sec = 'cifras'",
    );
    expect(b4.figs.map((f) => f.v)).toContain("16.030");
    const ev = await t.q<{ indicator: string; news_id: string | null; approved: boolean; candidates: unknown[] }>(
      "select e.indicator, e.news_id, e.approved, e.candidates from public.ods_report_indicators e join public.ods_reports r on r.id = e.report_id where r.ods = 13 order by 1",
    );
    expect(ev.map((e) => e.indicator)).toEqual(["13.1", "13.2", "13.3", "13.4"]);
    expect(ev.every((e) => e.news_id === null && !e.approved && e.candidates.length === 0)).toBe(true);
    const archivo = await t.q<{ ods: number; largo: number; archivo: string; bloques: number }>(
      "select ods, length(raw_html)::int as largo, parsed ->> 'archivo' as archivo, jsonb_array_length(parsed -> 'bloques')::int as bloques from public.ods_report_archive order by ods",
    );
    expect(archivo).toHaveLength(17);
    for (const a of archivo) {
      const i = ods(a.ods);
      expect(a.archivo).toBe(i.archivo);
      expect(a.bloques).toBe(i.bloques.length);
      expect(a.largo).toBeGreaterThan(20000);
    }
  });

  it("es idempotente y no pisa lo que una persona ya editó", async () => {
    const [{ id }] = await t.q<{ id: string }>(
      "select b.id from public.ods_report_blocks b join public.ods_reports r on r.id = b.report_id where r.ods = 13 and b.sec = 'tesis' order by b.pos limit 1",
    );
    await t.asUser(PEOPLE.admin, (q) => q("update public.ods_report_blocks set text = 'Tesis corregida.' where id = $1", [id]), { commit: true });
    await t.asUser(PEOPLE.admin, (q) => q("update public.ods_reports set state = 'publicado' where ods = 5 and edition = 2025"), { commit: true });
    const antes = await t.q<{ imported_at: string }>("select imported_at::text from public.ods_report_archive order by ods");
    await t.db.exec(readFileSync(MIGRACION, "utf8"));
    expect(await cuenta("select count(*)::int as n from public.ods_reports where edition = 2025")).toBe(17);
    expect(await cuenta("select count(*)::int as n from public.ods_report_blocks")).toBe(totalBloques);
    expect(await cuenta("select count(*)::int as n from public.ods_report_indicators")).toBe(4);
    expect(await cuenta("select count(*)::int as n from public.ods_report_archive")).toBe(17);
    const [b] = await t.q<{ text: string }>("select text from public.ods_report_blocks where id = $1", [id]);
    expect(b.text).toBe("Tesis corregida.");
    const [r5] = await t.q<{ state: string }>("select state from public.ods_reports where ods = 5 and edition = 2025");
    expect(r5.state).toBe("publicado");
    // El archivo solo se reescribe si cambió: nada cambió, nada se tocó.
    expect(await t.q("select imported_at::text from public.ods_report_archive order by ods")).toEqual(antes);
  });

  it("el archivo es solo de Planeación y la administración; el público ve solo lo publicado y habilitado", async () => {
    expect(await t.asUser(PEOPLE.admin, (q) => q("select ods from public.ods_report_archive"))).toHaveLength(17);
    expect(await t.asUser(PEOPLE.director, (q) => q("select ods from public.ods_report_archive"))).toHaveLength(0);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("insert into public.ods_report_archive (ods, edition, source) values (1, 2026, 'x')")))).toMatch(/row-level security|permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select ods from public.ods_report_archive")))).toMatch(/permission denied/);
    // Lo publicado por la importación (4 y 13) más el 5, que la prueba anterior publicó a mano.
    const visibles = todos.filter((b) => [...PUBLICADOS, 5].includes(b.ods) && b.enabled).length;
    const publicos = await t.asUser(null, (q) => q<{ text_en: string }>("select b.id, b.text, b.text_en, b.figs from public.ods_report_blocks b"));
    expect(publicos).toHaveLength(visibles);
    expect(publicos.every((p) => p.text_en !== "")).toBe(true);
    const informesPublicos = await t.asUser(null, (q) => q<{ ods: number }>("select ods from public.ods_reports order by ods"));
    expect(informesPublicos.map((r) => r.ods)).toEqual([4, 5, 13]);
  });
});

describe("0147 · un informe 2025 que ya existía no se toca", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb({ before: "0147" });
  });
  afterAll(async () => t?.close());

  it("solo el archivo recibe ese ODS; los demás se importan", async () => {
    const [{ id }] = await t.q<{ id: string }>("insert into public.ods_reports (ods, edition) values (13, 2025) returning id");
    await t.q("insert into public.ods_report_blocks (report_id, sec, origin, text, orig) values ($1, 'tesis', 'pilo', 'Borrador de Pilo.', 'Borrador de Pilo.')", [id]);
    await t.db.exec(readFileSync(MIGRACION, "utf8"));
    const propios = await t.q<{ text: string }>("select text from public.ods_report_blocks where report_id = $1", [id]);
    expect(propios.map((b) => b.text)).toEqual(["Borrador de Pilo."]);
    const [r] = await t.q<{ state: string; settings: Record<string, unknown> }>("select state, settings from public.ods_reports where id = $1", [id]);
    expect(r.state).toBe("borrador");
    expect(r.settings.legacy).toBeUndefined();
    expect((await t.q("select 1 from public.ods_report_indicators where report_id = $1", [id])).length).toBe(0);
    expect((await t.q<{ n: number }>("select count(*)::int as n from public.ods_report_archive"))[0].n).toBe(17);
    expect((await t.q<{ n: number }>("select count(*)::int as n from public.ods_reports where settings ->> 'source' = 'sdgudes.github.io'"))[0].n).toBe(16);
  });
});
