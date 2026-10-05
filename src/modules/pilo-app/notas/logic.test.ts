import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ASK_MAX,
  CHART,
  LINK_KEY,
  askRecommendations,
  canUseNotas,
  chartOf,
  clearLink,
  courseName,
  courseState,
  evolution,
  failedCourses,
  failureOf,
  findings,
  inProgress,
  nearestIndex,
  nota,
  notasFailure,
  notasMessage,
  parseHead,
  parseHistory,
  periodLine,
  readLink,
  saveLink,
  settled,
  totals,
} from "./logic";
import type { LinkStore, NotaCourse, NotaPeriod } from "./logic";

/* Todos los datos de estas pruebas son inventados. */

const course = (name: string, credits: number, def: number | null, over: Partial<NotaCourse> = {}): NotaCourse => ({ code: name.toLowerCase().replace(/\W+/g, "-"), name, credits, def, approved: def !== null && def >= 3, homologated: false, group: "", min: null, ...over });

const period = (id: string, courses: NotaCourse[], over: Partial<NotaPeriod> = {}): NotaPeriod => ({ id, average: null, accumulated: null, credits: 0, creditsApproved: 0, totalApproved: 0, courses, ...over });

/** Un récord de cuatro periodos: una materia reprobada en el segundo y repetida en el tercero. */
const RECORD: NotaPeriod[] = [
  period("2024A", [course("CÁLCULO DIFERENCIAL", 3, 3.4), course("LECTURA Y ESCRITURA", 2, 4.1), course("INGLÉS I", 2, 4, { homologated: true })], { average: 3.68, accumulated: 3.68, credits: 5, totalApproved: 7 }),
  period("2024B", [course("FÍSICA II", 3, 2.6), course("ÁLGEBRA LINEAL", 3, 3.2)], { average: 2.9, accumulated: 3.33, credits: 6, totalApproved: 10 }),
  period("2025A", [course("FÍSICA II", 3, 3.5), course("PROGRAMACIÓN", 3, 4.1)], { average: 3.8, accumulated: 3.5, credits: 6, totalApproved: 16 }),
  period("2025B", [course("BASES DE DATOS", 3, 4.4), course("ECONOMÍA", 2, 4)], { average: 4.24, accumulated: 3.67, credits: 5, totalApproved: 21 }),
];

function fakeStore(): LinkStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const PERMIT = `v1.${"a".repeat(80)}.${"b".repeat(43)}`;
const HEAD = { program: "INGENIERÍA DE PRUEBAS", period: "2025B", creditsPercent: 40 };
const NOW = 1_800_000_000_000;
const LATER = NOW / 1000 + 3600;

describe("quién ve Mis notas", () => {
  it("solo un estudiante con cuenta de Pilo activa", () => {
    expect(canUseNotas({ rol: "estudiante", status: "activa" })).toBe(true);
    for (const a of [{ rol: "profesor", status: "activa" }, { rol: "estudiante", status: "suspendida" }, { rol: "otro", status: "activa" }, null, undefined]) expect(canUseNotas(a), JSON.stringify(a)).toBe(false);
  });
});

describe("el permiso, en el dispositivo", () => {
  afterEach(() => clearLink(fakeStore()));

  it("con «mantener», queda en el dispositivo; sin ella, solo en memoria", () => {
    const store = fakeStore();
    expect(saveLink("u1", { permit: PERMIT, expires: LATER, head: HEAD }, true, store).kept).toBe(true);
    expect(JSON.parse(store.data.get(LINK_KEY)!)).toEqual({ v: 1, owner: "u1", permit: PERMIT, expires: LATER, head: HEAD });
    expect(readLink("u1", NOW, store)).toEqual({ permit: PERMIT, expires: LATER, head: HEAD, kept: true });

    expect(saveLink("u1", { permit: PERMIT, expires: LATER, head: HEAD }, false, store).kept).toBe(false);
    expect(store.data.has(LINK_KEY)).toBe(false);
    expect(readLink("u1", NOW, store)).toMatchObject({ permit: PERMIT, kept: false });
  });

  it("lo guardado no trae notas, ni el código, ni la contraseña", () => {
    const store = fakeStore();
    saveLink("u1", { permit: PERMIT, expires: LATER, head: HEAD }, true, store);
    expect(Object.keys(JSON.parse(store.data.get(LINK_KEY)!)).sort()).toEqual(["expires", "head", "owner", "permit", "v"]);
    expect([...store.data.keys()]).toEqual(["pilo-app:notas"]);
  });

  it("el de otra cuenta no se entrega: se borra", () => {
    const store = fakeStore();
    saveLink("u1", { permit: PERMIT, expires: LATER, head: HEAD }, true, store);
    expect(readLink("u2", NOW, store)).toBeNull();
    expect(store.data.has(LINK_KEY)).toBe(false);
    expect(readLink("u1", NOW, store)).toBeNull();
  });

  it("vencido, se borra de los dos sitios", () => {
    const store = fakeStore();
    saveLink("u1", { permit: PERMIT, expires: LATER, head: HEAD }, true, store);
    expect(readLink("u1", LATER * 1000 + 1, store)).toBeNull();
    expect(store.data.has(LINK_KEY)).toBe(false);
  });

  it("«Desconectar» lo borra de inmediato, y lo que no se entiende también se va", () => {
    const store = fakeStore();
    saveLink("u1", { permit: PERMIT, expires: LATER, head: HEAD }, true, store);
    clearLink(store);
    expect(readLink("u1", NOW, store)).toBeNull();
    for (const junk of ["{", "null", '{"v":2}', JSON.stringify({ v: 1, owner: "u1", permit: "sin-forma", expires: LATER })]) {
      store.data.set(LINK_KEY, junk);
      expect(readLink("u1", NOW, store), junk).toBeNull();
      expect(store.data.has(LINK_KEY)).toBe(false);
    }
  });

  it("sin almacenamiento, o con él lleno, queda en memoria y no falla", () => {
    expect(saveLink("u1", { permit: PERMIT, expires: LATER, head: HEAD }, true, null).kept).toBe(false);
    expect(readLink("u1", NOW, null)).toMatchObject({ kept: false });
    const full: LinkStore = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); }, removeItem: () => undefined };
    expect(saveLink("u1", { permit: PERMIT, expires: LATER, head: HEAD }, true, full).kept).toBe(false);
  });
});

describe("lo que responde la función", () => {
  it("cada código lleva a su estado de pantalla", () => {
    expect(notasFailure(401, { error: "x", code: "permiso" }).view).toBe("vencido");
    expect(notasFailure(503, { error: "Mis notas aún no está disponible: …", code: "no_disponible" })).toMatchObject({ view: "no_disponible", message: "Mis notas aún no está disponible: …" });
    expect(notasFailure(401, { code: "credenciales" })).toEqual({ code: "credenciales", message: notasMessage("credenciales"), view: "campo" });
    expect(notasFailure(403, { code: "no_estudiante" }).view).toBe("campo");
    expect(notasFailure(403, { code: "perfil" }).view).toBe("cuenta");
    expect(notasFailure(502, { code: "genesis" }).view).toBe("aviso");
    expect(notasFailure(502, { code: "pdf" }).view).toBe("aviso");
    expect(failureOf("sin_red").view).toBe("sin_conexion");
  });

  it("un código desconocido no deja pasar el texto del servidor", () => {
    expect(notasFailure(500, { error: "Traceback…", code: "raro" })).toEqual({ code: "desconocido", message: notasMessage("desconocido"), view: "aviso" });
    expect(notasFailure(404, null).code).toBe("sin_funcion");
    expect(notasFailure(401, {}).code).toBe("sesion");
    expect(notasFailure(429, { code: "limite", retry_after: 240 })).toMatchObject({ code: "limite", retryAfter: 240, message: expect.stringMatching(/4 minutos/) });
  });

  it("el encabezado y el histórico se leen con cuidado: lo que no se entiende se descarta", () => {
    expect(parseHead({ program: "X", period: "2025B", creditsPercent: 40, name: "se cuela" })).toEqual({ program: "X", period: "2025B", creditsPercent: 40 });
    expect(parseHead(null)).toEqual({ program: "", period: "", creditsPercent: null });
    expect(parseHead({ period: "malo", creditsPercent: 400 })).toEqual({ program: "", period: "", creditsPercent: null });

    const h = parseHistory({ periods: [RECORD[1], RECORD[0], { id: "malo", courses: [] }, null, { id: "2026A", average: "4", courses: [{ name: "", code: "" }, { name: "X", credits: -1, def: 99, approved: "si", extra: 1 }] }], record: true });
    expect(h.periods.map((p) => p.id)).toEqual(["2024A", "2024B", "2026A"]);
    expect(h.periods[2]).toEqual({ id: "2026A", average: null, accumulated: null, credits: 0, creditsApproved: 0, totalApproved: 0, courses: [{ code: "", name: "X", credits: 0, def: null, approved: false, homologated: false, group: "", min: null }] });
    expect(h.record).toBe(true);
    expect(parseHistory(null)).toEqual({ periods: [], record: false });
  });
});

describe("los números y los nombres", () => {
  it("una nota se dice con coma y sin redondear a un decimal", () => {
    expect(nota(4.1)).toBe("4,1");
    expect(nota(4)).toBe("4,0");
    expect(nota(3.75)).toBe("3,75");
    // 2,95 no es 3,0: no aprobó.
    expect(nota(2.95)).toBe("2,95");
    expect(nota(null)).toBe("—");
  });

  it("los nombres en mayúsculas de Génesis se leen como texto; los romanos siguen en mayúscula", () => {
    expect(courseName("CÁLCULO DIFERENCIAL")).toBe("Cálculo diferencial");
    expect(courseName("FÍSICA II")).toBe("Física II");
    expect(courseName("INGLÉS  IV ")).toBe("Inglés IV");
    expect(courseName("ELECTIVA VI Y SEMINARIO")).toBe("Electiva VI y seminario");
    // Lo que ya viene escrito con minúsculas no se toca.
    expect(courseName("Bases de Datos II")).toBe("Bases de Datos II");
    expect(courseName("")).toBe("");
  });

  it("el estado de una materia: homologada, aprobada, reprobada o en curso", () => {
    expect(courseState(course("X", 2, 4))).toBe("aprobada");
    expect(courseState(course("X", 2, 2))).toBe("reprobada");
    expect(courseState(course("X", 2, 4, { homologated: true }))).toBe("homologada");
    expect(courseState(course("X", 2, 0), true)).toBe("en_curso");
  });

  it("una materia del periodo vigente sin definitiva está en curso, no reprobada", () => {
    const open = period("2026A", [course("SIMULACIÓN", 3, 0), course("LEGISLACIÓN", 2, null)], { average: 0, accumulated: 3.67 });
    expect(settled(open)).toBe(false);
    expect(inProgress(open, open.courses[0], "2026A")).toBe(true);
    // Aunque Génesis no diga cuál es el vigente: un periodo sin ninguna definitiva va en curso.
    expect(inProgress(open, open.courses[1], "")).toBe(true);
    // En el vigente, una ya cerrada y perdida sí es reprobada; la que sigue en cero, no.
    const mixed = period("2026A", [course("SIMULACIÓN", 3, 0), course("LEGISLACIÓN", 2, 2.1)]);
    expect(inProgress(mixed, mixed.courses[0], "2026A")).toBe(true);
    expect(inProgress(mixed, mixed.courses[1], "2026A")).toBe(false);
    // En un periodo ya cerrado, un cero es un cero.
    const closed = period("2024B", [course("FÍSICA II", 3, 0), course("ÁLGEBRA LINEAL", 3, 3.2)]);
    expect(inProgress(closed, closed.courses[0], "2026A")).toBe(false);
  });

  it("la línea de un periodo", () => {
    expect(periodLine(RECORD[0])).toBe("Promedio 3,68 · 3 materias · 5 créditos");
    expect(periodLine(period("2026A", [course("X", 3, 0)], { average: 0 }))).toBe("1 materia · 3 créditos");
  });
});

describe("Mi evolución: los promedios", () => {
  it("manda lo que calcula Génesis", () => {
    expect(evolution(RECORD)).toEqual([
      { id: "2024A", avg: 3.68, acc: 3.68, credits: 5 },
      { id: "2024B", avg: 2.9, acc: 3.33, credits: 6 },
      { id: "2025A", avg: 3.8, acc: 3.5, credits: 6 },
      { id: "2025B", avg: 4.24, acc: 3.67, credits: 5 },
    ]);
  });

  it("si Génesis no trae el promedio, se calcula ponderado por créditos y sin las homologadas", () => {
    const bare = RECORD.map((p) => ({ ...p, average: null, accumulated: null, credits: 0 }));
    const evo = evolution(bare);
    // 2024A: (3×3,4 + 2×4,1) / 5 = 3,68; la homologada no cuenta.
    expect(evo[0]).toEqual({ id: "2024A", avg: 3.68, acc: 3.68, credits: 7 });
    // 2024B: (3×2,6 + 3×3,2) / 6 = 2,9; acumulado: (18,4 + 17,4) / 11 = 3,25.
    expect(evo[1]).toMatchObject({ avg: 2.9, acc: 3.25 });
    expect(evolution([])).toEqual([]);
  });

  it("un periodo que aún no tiene definitivas no tiene promedio: no hay caída a cero", () => {
    const open = period("2026A", [course("SIMULACIÓN", 3, 0)], { average: 0, accumulated: 0, credits: 3 });
    expect(evolution([...RECORD, open]).at(-1)).toEqual({ id: "2026A", avg: null, acc: null, credits: 3 });
    // Si Génesis mantiene el acumulado, se respeta.
    expect(evolution([...RECORD, { ...open, accumulated: 3.67 }]).at(-1)).toMatchObject({ avg: null, acc: 3.67 });
  });

  it("los totales de arriba", () => {
    expect(totals(RECORD)).toEqual({ accumulated: 3.67, approved: 21, periods: 4 });
    // Sin el dato de Génesis, los créditos aprobados se cuentan de las materias.
    expect(totals(RECORD.map((p) => ({ ...p, totalApproved: 0 }))).approved).toBe(2 + 3 + 2 + 3 + 3 + 3 + 3 + 2);
    expect(totals([])).toEqual({ accumulated: null, approved: 0, periods: 0 });
  });
});

describe("Mi evolución: lo que Pilo ve en el récord", () => {
  it("sale de las notas: el acumulado y su tendencia, los extremos, lo reprobado y los créditos", () => {
    const seen = findings(RECORD, { creditsPercent: 40, period: "2025B" });
    expect(seen.map((f) => f.id)).toEqual(["acumulado", "extremos", "reciente", "reprobadas", "creditos"]);
    expect(seen[0].text).toBe("Su promedio acumulado va en 3,67: prácticamente igual que hace 3 periodos.");
    expect(seen[1].text).toBe("Su mejor periodo fue 2025B (4,24) y el más difícil, 2024B (2,9).");
    expect(seen[2].text).toBe("En 2025B su promedio (4,24) estuvo 0,78 por encima de lo que traía en los periodos anteriores.");
    expect(seen[3].text).toBe("Reprobó una vez: Física II en 2024B. La repitió y la aprobó.");
    expect(seen[4].text).toBe("Lleva 21 créditos aprobados: el 40 % de su plan de estudios.");
  });

  it("dice si el acumulado subió o bajó, y en cuántos periodos", () => {
    const rising = [3.2, 3.4, 3.6, 3.8, 4, 4.1].map((acc, i) => period(`20${20 + i}A`, [course("X", 3, acc)], { average: acc, accumulated: acc }));
    expect(findings(rising)[0].text).toBe("Su promedio acumulado va en 4,1 y ha subido 0,7 en los últimos 4 periodos.");
    expect(findings([...rising].map((p, i, all) => ({ ...p, accumulated: all[all.length - 1 - i].accumulated })))[0].text).toBe("Su promedio acumulado va en 3,2 y ha bajado 0,8 en los últimos 4 periodos.");
    expect(findings(rising.slice(0, 2))[0].text).toBe("Su promedio acumulado va en 3,4 y ha subido 0,2 en el último periodo.");
  });

  it("con un solo periodo no habla de tendencia ni de mejor y peor", () => {
    const seen = findings([RECORD[0]]);
    expect(seen.map((f) => f.id)).toEqual(["acumulado", "reprobadas", "creditos"]);
    expect(seen[0].text).toBe("Su promedio acumulado va en 3,68.");
    expect(seen[1].text).toBe("No ha reprobado ninguna materia.");
    expect(seen[2].text).toBe("Lleva 7 créditos aprobados.");
  });

  it("lo reprobado: cuántas veces, cuáles, y si ya se recuperaron", () => {
    expect(failedCourses(RECORD)).toEqual([{ period: "2024B", name: "FÍSICA II", recovered: true }]);
    const pending = [...RECORD, period("2026A", [course("ECUACIONES", 3, 2), course("QUÍMICA", 3, 1.5)], { average: 1.75, accumulated: 3.4 })];
    const text = findings(pending).find((f) => f.id === "reprobadas")!.text;
    expect(text).toBe("Reprobó 3 veces: Física II en 2024B, Ecuaciones en 2026A y Química en 2026A. De esas, 2 aún no aparecen aprobadas en su récord.");
    const only = [period("2026A", [course("QUÍMICA", 3, 1.5), course("ARTE", 2, 4)], { average: 2.5, accumulated: 2.5 })];
    expect(findings(only).find((f) => f.id === "reprobadas")!.text).toBe("Reprobó una vez: Química en 2026A. Aún no aparece aprobada en su récord.");
  });

  it("lo que sigue en curso no cuenta como reprobado", () => {
    const open = period("2026A", [course("SIMULACIÓN", 3, 0), course("LEGISLACIÓN", 2, null)], { average: 0, accumulated: 3.67 });
    expect(failedCourses([...RECORD, open], "2026A")).toEqual([{ period: "2024B", name: "FÍSICA II", recovered: true }]);
    expect(findings([open], { period: "2026A" }).map((f) => f.id)).toEqual(["acumulado"]);
  });

  it("sin periodos no hay nada que decir", () => {
    expect(findings([])).toEqual([]);
    expect(failedCourses([])).toEqual([]);
  });
});

describe("Mi evolución: la gráfica", () => {
  const evo = evolution(RECORD);
  const { W, H, L, R, T, B } = CHART;

  it("un solo eje para las dos series, de 2,5 a 5, con la guía de 3,0", () => {
    const c = chartOf(evo);
    expect([c.y0, c.y1]).toEqual([2.5, 5]);
    expect(c.grid.map((g) => g.value)).toEqual([3, 4, 5]);
    expect(c.xs[0]).toBe(L);
    expect(c.xs.at(-1)).toBe(W - R);
    // 5 arriba, 2,5 abajo; un promedio más alto queda más arriba.
    expect(c.grid.at(-1)!.y).toBe(T);
    for (const y of [...c.avg, ...c.acc]) {
      expect(y!).toBeGreaterThanOrEqual(T);
      expect(y!).toBeLessThanOrEqual(H - B);
    }
    expect(c.avg[3]!).toBeLessThan(c.avg[1]!);
    expect(c.pathAvg).toMatch(/^M30 \d+(\.\d)?( L\d+(\.\d)? \d+(\.\d)?){3}$/);
    expect(c.pathAcc.split(" L")).toHaveLength(4);
  });

  it("si hay un promedio por debajo de 2,5, el eje baja; nunca se sale del lienzo", () => {
    const low = chartOf([{ id: "2024A", avg: 1.8, acc: 1.8, credits: 3 }, { id: "2024B", avg: 3.9, acc: 2.9, credits: 3 }]);
    expect(low.y0).toBe(1);
    expect(low.grid.map((g) => g.value)).toEqual([2, 3, 4, 5]);
    expect(low.avg[0]!).toBeLessThanOrEqual(H - B);
  });

  it("un periodo sin promedio corta la línea en vez de bajarla a cero", () => {
    const c = chartOf([...evo, { id: "2026A", avg: null, acc: null, credits: 3 }, { id: "2026B", avg: 4, acc: 3.7, credits: 3 }]);
    expect(c.avg[4]).toBeNull();
    expect(c.pathAvg.match(/M/g)).toHaveLength(2);
    expect(c.pathAvg).not.toMatch(/NaN|null|undefined/);
  });

  it("con un periodo, o con ninguno, no se rompe", () => {
    const one = chartOf([evo[0]]);
    expect(one.xs).toEqual([L + (W - L - R) / 2]);
    expect(one.ticks).toEqual([{ index: 0, x: one.xs[0], label: "2024A", anchor: "middle" }]);
    expect(chartOf([])).toMatchObject({ xs: [], pathAvg: "", pathAcc: "", ticks: [] });
  });

  it("en el eje caben pocos nombres: el primero y el último siempre, y ninguno pegado al último", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `${2015 + Math.floor(i / 2)}${i % 2 ? "B" : "A"}`, avg: 4, acc: 4, credits: 15 }));
    const ticks = chartOf(many).ticks;
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks[0]).toMatchObject({ index: 0, anchor: "start" });
    expect(ticks.at(-1)).toMatchObject({ index: 11, label: "2020B", anchor: "end" });
    expect(ticks.at(-1)!.index - ticks.at(-2)!.index).toBeGreaterThanOrEqual(3);
  });

  it("el dedo o el ratón eligen el periodo más cercano", () => {
    expect(nearestIndex(L, 4)).toBe(0);
    expect(nearestIndex(W - R, 4)).toBe(3);
    expect(nearestIndex(-50, 4)).toBe(0);
    expect(nearestIndex(9999, 4)).toBe(3);
    expect(nearestIndex(L + (W - L - R) / 3 + 2, 4)).toBe(1);
    expect(nearestIndex(100, 1)).toBe(0);
  });
});

describe("lo que le recomiendo: la pregunta para Pilo", () => {
  it("lleva el resumen calculado, en primera persona, y cabe en la caja de la conversación", () => {
    const q = askRecommendations(RECORD, "2025B");
    expect(q).toBe(
      "Este es el resumen de mi récord académico (4 periodos). Mi promedio acumulado va en 3,67: prácticamente igual que hace 3 periodos. Mi mejor periodo fue 2025B (4,24) y el más difícil, 2024B (2,9). En 2025B mi promedio (4,24) estuvo 0,78 por encima de lo que traía en los periodos anteriores. Reprobé una vez: Física II en 2024B. La repetí y la aprobé. ¿Qué me recomienda para mejorar y en qué debería concentrarme?",
    );
    expect(q.length).toBeLessThanOrEqual(ASK_MAX);
    expect(askRecommendations([])).toBe("");
  });

  it("no lleva nada que identifique a la persona, y nunca se pasa del tope", () => {
    const long = Array.from({ length: 14 }, (_, i) => period(`${2015 + Math.floor(i / 2)}${i % 2 ? "B" : "A"}`, [course(`MATERIA DE NOMBRE MUY LARGO NÚMERO ${i} CON MUCHAS PALABRAS`, 3, 2)], { average: 2, accumulated: 2 }));
    const q = askRecommendations(long);
    expect(q.length).toBeLessThanOrEqual(ASK_MAX);
    expect(q).toMatch(/¿Qué me recomienda para mejorar y en qué debería concentrarme\?$/);
    // Ni el programa, ni un código, ni un documento, ni un correo: solo promedios, periodos y materias.
    const withHead = askRecommendations(RECORD, "2025B");
    expect(withHead).not.toMatch(/INGENIERÍA|\b\d{6,}\b|@/);
  });
});

describe("la pantalla", () => {
  const DIR = resolve(process.cwd(), "src/modules/pilo-app");
  const source = (file: string) => readFileSync(resolve(DIR, file), "utf8").replace(/\r\n/g, "\n");
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const pane = source("notas/NotasPane.tsx");
  const css = strip(source("notas/notas.css"));

  it("pide la autorización de Génesis antes de pedir la contraseña", () => {
    expect(pane).toContain('<DataConsent\n              platform="genesis"');
    expect(pane.indexOf("<DataConsent")).toBeLessThan(pane.indexOf('id="pnt-pass"'));
    expect(pane).toMatch(/if \(connecting \|\| !granted\) return;/);
  });

  it("no guarda las notas ni la contraseña: del almacenamiento solo sabe logic.ts, y solo del permiso", () => {
    for (const file of ["notas/NotasPane.tsx", "notas/api.ts"]) expect(source(file), file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(source("notas/logic.ts").match(/\.setItem\(/g)).toHaveLength(1);
    expect(pane).toMatch(/setPass\(""\);\s*setCode\(""\);/);
    expect(pane).not.toMatch(/console\./);
  });

  it("«Desconectar» borra el permiso, y salir de la cuenta también", () => {
    expect(pane).toMatch(/const disconnect = \(\) => \{[\s\S]*?clearLink\(\);/);
    expect(source("PiloApp.tsx")).toMatch(/if \(!loading && !session\) \{\s*clearLink\(\);\s*clearNotasLink\(\);/);
  });

  it("«Mi semestre» no trae datos ni llama a nada: solo su aviso", () => {
    const panel = pane.slice(pane.indexOf('{tab === "semestre"'), pane.indexOf("PROMISES.map", pane.indexOf('{tab === "semestre"')));
    expect(panel).toContain("En construcción");
    expect(panel).toContain("Vista previa, sin datos.");
    expect(panel).not.toMatch(/periods|history|fetch|load[A-Z]|nota\(/);
  });

  it("las recomendaciones no fuerzan el adjunto: dejan la pregunta escrita en la conversación", () => {
    expect(pane).toMatch(/navigate\(APP_PATHS\.ensenanza, \{ state: \{ nueva: true, pregunta: askRecommendations\(/);
    for (const file of ["notas/NotasPane.tsx", "notas/api.ts", "notas/logic.ts"]) expect(source(file), file).not.toMatch(/askQuestionStream|pilo-ia|passages/);
  });

  it("el estado de una materia lleva glifo y palabra; las series, además del color, distinto trazo", () => {
    expect(pane).toMatch(/\{STATE_GLYPH\[state\]\}\s*<\/svg>\s*\{STATE_LABEL\[state\]\}/);
    expect(css).toMatch(/\.pnt-line--acc,\s*\.pnt-key--acc \{[^}]*stroke-dasharray/);
    expect(pane).toContain('className="pnt-dot"');
    expect(pane).toContain("Ver como tabla");
  });

  it("los colores son los del tema, lo que se toca mide 44 px y solo se anima transform y opacidad", () => {
    expect([...css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)].map((m) => m[0])).toEqual([]);
    expect(css).toMatch(/var\(--c-s1\)/);
    expect(css).toMatch(/var\(--c-s2\)/);
    const rule = (selector: string) => css.split("}").find((block) => block.split("{")[0].split(",").some((s) => s.trim() === selector))?.split("{")[1] ?? "";
    for (const selector of [".pnt-tabs button", ".pnt-periods button", ".pnt-link"]) expect(Number(rule(selector).match(/min-height:\s*(\d+)px/)?.[1] ?? 0), selector).toBeGreaterThanOrEqual(44);
    for (const [, value] of css.matchAll(/transition:\s*([^;]+);/g)) expect(value).not.toMatch(/\b(all|width|height|top|left|margin|padding)\b/);
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toMatch(/scale\(0\.97\)/);
  });

  it("el movimiento se revierte, respeta el movimiento reducido y la línea se dibuja una vez por conexión", () => {
    expect(pane.match(/gsap\.context\(/g)!.length).toBe(pane.match(/ctx\.revert\(\)/g)!.length);
    expect(pane.match(/reducedMotion\(\)/g)!.length).toBeGreaterThanOrEqual(5);
    expect(pane).toMatch(/if \(tab !== "evolucion" \|\| !ready \|\| drawn\.current \|\| !root\.current\) return;\s*drawn\.current = true;/);
    // Solo una conexión nueva (o desconectar, o que el permiso venza) deja dibujarla otra vez.
    expect(pane.match(/drawn\.current = false;/g)).toHaveLength(3);
    // Nada dura más de lo que dura una interfaz, salvo la línea, que se ve una vez.
    for (const [, d] of pane.matchAll(/duration: (\d\.\d+)/g)) expect(Number(d)).toBeLessThanOrEqual(0.8);
  });
});
