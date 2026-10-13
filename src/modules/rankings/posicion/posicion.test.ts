/* Analizador de posicionamiento: lógica pura contra la tabla real de THE
   Impact 2026 (supabase/seed/the-impact-2026.json, generada por
   scripts/import-the-impact.mjs desde la captura). */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { centro, parseBanda, parseRango, sigmaDe, textoBanda, textoRango } from "./bandas";
import { bandaParaOds, bandaParaPuntaje, calibrarTodo, puntajeParaBanda, umbralesDeBanda } from "./calibracion";
import { brechaHastaSiguiente, COLOMBIA_2026, escaleraNacional, esDeColombia, esUdes, filasDeColombia } from "./colombia";
import { coberturaOds, deltaEvidencia, puntosIndicador, type EleccionMin } from "./evidencia";
import { envioValido, lineaBase, media, probMeta, puntajeAnual, resumir, simular, SUPUESTOS_BASE, textoProb, type OdsEscenario } from "./modelo";
import { palancas, totalPorOds } from "./palancas";
import type { FilaTHE } from "./tipos";
import { indicadorPorId, indicadoresDe, INDICADORES_EVIDENCIA } from "../informes/the-indicadores";

const SEED = JSON.parse(readFileSync(resolve(__dirname, "../../../../supabase/seed/the-impact-2026.json"), "utf8")) as { rows: FilaTHE[]; year: number; captured_at: string };
const FILAS = SEED.rows;
const CAL = calibrarTodo(FILAS);
const UDES = FILAS.find(esUdes)!;
const RIVALES = filasDeColombia(FILAS);

const escenario = (delta: Record<number, number> = {}, enviados = [17, 5, 10, 4]): OdsEscenario[] =>
  Array.from({ length: 17 }, (_, i) => ({ sdg: i + 1, enviado: enviados.includes(i + 1), deltaEvidencia: delta[i + 1] ?? 0 }));

const correr = (delta: Record<number, number> = {}, extra: Partial<typeof SUPUESTOS_BASE> = {}, enviados?: number[]) =>
  simular({ udes: UDES, rivales: RIVALES, ods: escenario(delta, enviados), supuestos: { ...SUPUESTOS_BASE, sorteos: 2000, ...extra }, cal: CAL });

describe("bandas", () => {
  it("lee puestos, empates, bandas abiertas y rangos de puntaje reales", () => {
    expect(parseBanda("=96")).toEqual({ lo: 96, hi: 96, empate: true, label: "=96" });
    expect(parseBanda("301–400")).toMatchObject({ lo: 301, hi: 400, empate: false });
    expect(parseBanda("1501+")).toMatchObject({ lo: 1501, hi: null });
    expect(parseBanda("1001+")).toMatchObject({ lo: 1001, hi: null });
    expect(parseBanda("7")).toMatchObject({ lo: 7, hi: 7, empate: false });
    expect(parseBanda("")).toBeNull();
    expect(parseRango("60.7–66.1")).toEqual({ lo: 60.7, hi: 66.1 });
    expect(parseRango("98.5")).toEqual({ lo: 98.5, hi: 98.5 });
    expect(parseRango("n/a")).toBeNull();
    expect(centro({ lo: 60.7, hi: 66.1 })).toBeCloseTo(63.4);
    expect(sigmaDe({ lo: 54.2, hi: 58 })).toBe(2);
    expect(sigmaDe({ lo: 52.4, hi: 59.9 })).toBeCloseTo(3.75);
    expect(textoBanda({ lo: 1501, hi: null })).toBe("1501+");
    expect(textoRango({ lo: 60.7, hi: 66.1 })).toBe("60,7–66,1");
  });

  it("la semilla y bandas.ts dicen lo mismo de cada fila", () => {
    for (const f of FILAS) {
      const b = parseBanda(f.rank_label)!;
      expect([b.lo, b.hi]).toEqual([f.rank_lo, f.rank_hi]);
      for (const m of f.best) expect(parseBanda(m.rank_label)).toMatchObject({ lo: m.rank_lo, hi: m.rank_hi });
    }
    expect(FILAS).toHaveLength(1603);
  });
});

describe("calibración", () => {
  it("la curva general es monótona y reproduce las bandas publicadas", () => {
    const u = umbralesDeBanda(CAL.general);
    expect(u.map((b) => b.label)).toEqual(["101–200", "201–300", "301–400", "401–600", "601–800", "801–1000", "1001–1500", "1501+"]);
    for (let i = 1; i < u.length; i++) {
      expect(u[i].hi).toBeLessThanOrEqual(u[i - 1].lo + 1e-9 + 0.4); // bandas contiguas, sin cruces importantes
      expect(u[i].lo).toBeLessThan(u[i - 1].lo);
    }
    for (let i = 1; i < CAL.general.exactos.length; i++) expect(CAL.general.exactos[i].score).toBeLessThanOrEqual(CAL.general.exactos[i - 1].score);
    // Cada universidad cae, con el centro de su rango, en su propia banda.
    for (const f of FILAS.filter((x) => x.rank_lo > 100)) expect(bandaParaPuntaje(CAL, (f.overall_lo + f.overall_hi) / 2).rank_lo).toBe(f.rank_lo);
    // En el top 100, el puesto exacto (± los empates).
    for (const f of FILAS.filter((x) => x.rank_lo <= 100)) expect(Math.abs(bandaParaPuntaje(CAL, f.overall_lo).puesto - f.rank_lo)).toBeLessThanOrEqual(3);
    expect(bandaParaPuntaje(CAL, 63.4).label).toBe("601–800");
    expect(bandaParaPuntaje(CAL, 70).label).toBe("401–600");
    expect(bandaParaPuntaje(CAL, 66.15).rank_lo).toBeGreaterThanOrEqual(401); // hueco 66,1–66,2
    expect(puntajeParaBanda(CAL.general, 401)).toBeCloseTo(66.2);
  });

  it("puntaje más alto ⇒ puesto igual o mejor (general y ODS)", () => {
    for (const c of [CAL.general, CAL.ods[17], CAL.ods[4], CAL.ods[5]]) {
      let previo = Infinity;
      for (let s = 0; s <= 100; s += 0.25) {
        const p = c === CAL.general ? bandaParaPuntaje(CAL, s).puesto : bandaParaOds(CAL, c.clave as number, s).puesto;
        expect(p).toBeLessThanOrEqual(previo);
        previo = p;
      }
    }
  });

  it("los ODS de la UDES caen en sus bandas publicadas", () => {
    expect(bandaParaOds(CAL, 17, 65.4).label).toBe("401–600");
    expect(bandaParaOds(CAL, 5, 56.1).label).toBe("301–400");
    expect(bandaParaOds(CAL, 10, 56.45).label).toBe("301–400");
    expect(bandaParaOds(CAL, 4, 56.15).label).toBe("401–600");
    expect(CAL.ods[17].total).toBe(1603);
  });
});

describe("Colombia", () => {
  it("encuentra las 15 universidades y a la UDES en 601–800", () => {
    const col = filasDeColombia(FILAS);
    expect(col).toHaveLength(15);
    expect(col.map((f) => f.name).sort()).toEqual([...COLOMBIA_2026].sort());
    expect(UDES).toMatchObject({ rank_label: "601–800", overall_lo: 60.7, overall_hi: 66.1, sdg17_rank_label: "401–600", sdg17_lo: 60.8, sdg17_hi: 70 });
    expect(UDES.best.map((b) => [b.sdg, b.rank_label])).toEqual([
      [5, "301–400"],
      [10, "301–400"],
      [4, "401–600"],
    ]);
    // Sin país, por el nombre.
    expect(esDeColombia({ country: "", name: "Saint Thomas University, Colombia" })).toBe(true);
    expect(esDeColombia({ country: "", name: "University of Manchester" })).toBe(false);
  });

  it("escalera nacional: la UDES comparte el puesto 2 con CES y la Javeriana", () => {
    const e = escaleraNacional(FILAS);
    expect(e[0]).toMatchObject({ etiqueta: "1", puesto: 1 });
    expect(e[0].fila.name).toMatch(/Simón Bolívar/);
    const u = e.find((x) => x.esUdes)!;
    expect(u).toMatchObject({ puesto: 2, puestoHasta: 4, empatadas: 3, etiqueta: "=2", esperado: 3 });
    expect(e.filter((x) => x.fila.rank_lo === 1001)).toHaveLength(7);
    expect(e.at(-1)!.puesto).toBe(9);
  });

  it("brecha hasta 401–600", () => {
    const b = brechaHastaSiguiente(UDES, CAL.general)!;
    expect(b.banda).toBe("401–600");
    expect(b.minimo).toBeCloseTo(0.1);
    expect(b.desdeCentro).toBeCloseTo(2.8);
    expect(b.maximo).toBeCloseTo(5.5);
  });
});

describe("evidencia", () => {
  const el = (indicator: string, o: Partial<EleccionMin> = {}): EleccionMin => ({ indicator, news_id: null, candidates: [], ask: {}, approved: false, ...o });

  it("puntos por indicador: específica, general, documento y solo aprobadas", () => {
    const ev = indicadorPorId("4.3.1")!;
    const doc = indicadorPorId("4.3.5")!;
    expect(puntosIndicador(ev, el("4.3.1", { news_id: "n", candidates: [{ news_id: "n", rel: "s", why: "", flags: [] }] }))).toBe(3);
    expect(puntosIndicador(ev, el("4.3.1", { news_id: "n", candidates: [{ news_id: "n", rel: "g", why: "", flags: [] }] }))).toBe(2.5);
    expect(puntosIndicador(ev, el("4.3.1", { news_id: "n" }), { soloAprobadas: true })).toBe(0);
    expect(puntosIndicador(doc, el("4.3.5", { approved: true }))).toBe(4);
    expect(puntosIndicador(doc, el("4.3.5", { news_id: "n", candidates: [{ news_id: "n", rel: "s", why: "", flags: [] }] }))).toBe(3);
    expect(puntosIndicador(ev, undefined)).toBe(0);
  });

  it("cobertura y delta: sin informe actual o sin base, delta 0", () => {
    const vacio = coberturaOds(4, []);
    const lleno = coberturaOds(4, [el("4.3.1", { news_id: "n", approved: true, candidates: [{ news_id: "n", rel: "s", why: "", flags: [] }] })]);
    expect(vacio.puntos).toBe(0);
    expect(lleno.puntos).toBeCloseTo(5);
    expect(lleno.techo).toBeCloseTo(indicadoresDe(4).filter((i) => i.tipo === "ev" || i.tipo === "doc").reduce((s, i) => s + (i.peso ?? 0), 0));
    expect(deltaEvidencia(lleno, vacio)).toEqual({ delta: 5, motivo: "comparado" });
    expect(deltaEvidencia(coberturaOds(4, null), lleno)).toEqual({ delta: 0, motivo: "sin-actual" });
    expect(deltaEvidencia(lleno, null)).toEqual({ delta: 0, motivo: "sin-base" });
  });
});

describe("modelo", () => {
  it("puntaje anual: 22 % ODS 17 + 26 % de los tres mejores; envío válido", () => {
    expect(puntajeAnual({ 17: 60, 5: 50, 10: 40, 4: 30, 3: 45 }, [17, 5, 10, 4, 3])).toBeCloseTo(0.22 * 60 + 0.26 * (50 + 45 + 40));
    expect(envioValido([17, 5, 10, 4])).toBe(true);
    expect(envioValido([5, 10, 4, 3])).toBe(false);
    expect(envioValido([17, 5, 10])).toBe(false);
    expect(lineaBase(UDES).filter((x) => x.publicado).map((x) => x.sdg)).toEqual([4, 5, 10, 17]);
  });

  it("es reproducible con la semilla", () => {
    const a = correr();
    const b = correr();
    expect(Array.from(a.general.slice(0, 50))).toEqual(Array.from(b.general.slice(0, 50)));
    const c = correr({}, { semilla: 7 });
    expect(Array.from(c.general.slice(0, 5))).not.toEqual(Array.from(a.general.slice(0, 5)));
  });

  it("escenario base (delta 0): la banda publicada es, con mucho, la más probable", () => {
    const sim = correr();
    const r = resumir(sim, CAL);
    expect(r.quedarse).toBeGreaterThan(0.75);
    expect(r.bandas.reduce((m, b) => (b.p > m.p ? b : m)).label).toBe("601–800");
    expect(r.media).toBeGreaterThan(62.4);
    expect(r.media).toBeLessThan(64.4);
    // Por banda, la UDES comparte el puesto 2 casi siempre.
    expect(r.puestoBanda.media).toBeLessThan(3);
    expect(r.top[3].banda).toBeGreaterThan(r.top[3].puntaje);
  });

  it("más evidencia ⇒ puntaje esperado mayor o igual, y más probabilidad de subir", () => {
    let previo = -Infinity;
    let pPrevio = -1;
    for (const d of [0, 2, 5, 10, 20]) {
      const sim = correr({ 17: d, 4: d });
      const m = media(sim.general);
      const p = probMeta(sim, { tipo: "subir" }, CAL);
      expect(m).toBeGreaterThanOrEqual(previo);
      expect(p).toBeGreaterThanOrEqual(pPrevio);
      previo = m;
      pPrevio = p;
    }
    // Por sorteo, no solo en promedio.
    const a = correr();
    const b = correr({ 17: 5 });
    for (let i = 0; i < a.n; i++) expect(b.general[i]).toBeGreaterThanOrEqual(a.general[i]);
  });

  it("rigor y k escalan el cambio; un envío inválido no puntúa", () => {
    const k1 = media(correr({ 17: 10 }).general);
    const k2 = media(correr({ 17: 10 }, { k: 2 }).general);
    const r0 = media(correr({ 17: 10 }, { rigor: 0 }).general);
    expect(k2).toBeGreaterThan(k1);
    expect(r0).toBeCloseTo(media(correr().general), 6);
    const sim = correr({}, {}, [5, 10, 4]);
    expect(sim.valido).toBe(true); // el 17 es obligatorio: siempre se agrega
    const sin = correr({}, {}, [17, 5]);
    expect(sin.valido).toBe(false);
    expect(probMeta(sin, { tipo: "subir" }, CAL)).toBe(0);
  });

  it("quitar un ODS publicado baja el puntaje; metas por ODS", () => {
    const base = media(correr().general);
    const sinDiez = media(correr({}, {}, [17, 5, 4, 3]).general);
    expect(sinDiez).toBeLessThan(base);
    const sim = correr({ 4: 8 });
    expect(probMeta(sim, { tipo: "ods", sdg: 4, rank_lo: 301 }, CAL)).toBeGreaterThan(probMeta(correr(), { tipo: "ods", sdg: 4, rank_lo: 301 }, CAL));
  });

  it("probabilidades redondeadas a 5 %", () => {
    expect(textoProb(0.333)).toBe("≈ 35 %");
    expect(textoProb(0.01)).toBe("< 5 %");
    expect(textoProb(0.99)).toBe("> 95 %");
  });
});

describe("palancas", () => {
  it("con todo en cero, el ODS 17 es la palanca más grande del general", () => {
    const cobertura = Object.fromEntries([17, 5, 10, 4, 3].map((n) => [n, coberturaOds(n, [])]));
    const titulos = Object.fromEntries(INDICADORES_EVIDENCIA.map((i) => [i.id, i.titulo]));
    const ps = palancas({ cobertura, elecciones: {}, esperado: { 17: 65.4, 5: 56.1, 10: 56.45, 4: 56.15, 3: 40 }, enviados: [17, 5, 10, 4, 3], k: 1, rigor: 0.9, titulos });
    const tot = totalPorOds(ps);
    expect(tot[0].ods).toBe(17);
    expect(ps.find((p) => p.ods === 3)!.papel).toMatch(/fuera|entra/);
    expect(ps.find((p) => p.ods === 4)!.papel).toBe("top3");
    for (let i = 1; i < ps.length; i++) expect(ps[i].ganaAnual).toBeLessThanOrEqual(ps[i - 1].ganaAnual);
    const p = ps.find((x) => x.id === "17.4.1")!;
    expect(p.ganaOds).toBeCloseTo(9.06 * 0.9);
    expect(p.ganaAnual).toBeCloseTo(9.06 * 0.9 * 0.22);
    expect(p.gana2027).toBeCloseTo(p.ganaAnual / 2);
    expect(p.esfuerzo).toBe("falta-evidencia");
  });

  it("no lista lo que ya tiene sus puntos completos", () => {
    const cov = coberturaOds(4, [{ indicator: "4.3.1", news_id: "n", approved: true, ask: {}, candidates: [{ news_id: "n", rel: "s", why: "", flags: [] }] }]);
    const ps = palancas({ cobertura: { 4: cov }, elecciones: {}, esperado: { 4: 56 }, enviados: [17, 4], k: 1, rigor: 1, titulos: {} });
    expect(ps.some((p) => p.id === "4.3.1")).toBe(false);
  });
});
