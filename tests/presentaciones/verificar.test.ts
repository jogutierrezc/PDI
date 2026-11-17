import { describe, expect, it } from "vitest";
import { formasDeNumero, numerosDe, respaldoDelInforme, verificarPresentacion } from "../../supabase/functions/pilo-presentaciones/verificar";
import { validarPresentacion } from "../../supabase/functions/pilo-presentaciones/esquema";
import type { Presentacion } from "../../supabase/functions/pilo-presentaciones/esquema";
import { informeEjemplo, presentacionEjemplo } from "../../src/modules/informes/presentacion/ejemplo";

const copia = (): Presentacion => JSON.parse(JSON.stringify(presentacionEjemplo));

describe("formas de un número", () => {
  it("«2.840» es 2840 (miles); «7,8» es 7.8; «84,2 %» es 84.2", () => {
    expect(formasDeNumero("2.840")).toContain("2840");
    expect(formasDeNumero("7,8")).toContain("7.8");
    expect(formasDeNumero("84,2")).toContain("84.2");
    expect(formasDeNumero("007")).toContain("7");
  });
  it("no toma como cifra lo que hay dentro de un enlace", () => {
    expect(numerosDe("Ver https://x.org/a/2026/9999 y 12 anexos")).toEqual(["12"]);
  });
});

describe("verificarPresentacion", () => {
  it("la presentación de ejemplo pasa limpia contra su informe", () => {
    const r = verificarPresentacion(copia(), informeEjemplo);
    expect(r.no_verificado).toEqual([]);
    expect(r.presentacion.diapositivas).toHaveLength(presentacionEjemplo.diapositivas.length);
  });

  it("una cifra del informe pasa aunque cambie de formato (2026-11-30 → 30 nov 2026)", () => {
    const p = copia();
    (p.diapositivas[3] as { intro?: string }).intro = "Avance al 31 dic 2025 y 63 % del plan.";
    expect(verificarPresentacion(p, informeEjemplo).no_verificado).toEqual([]);
  });

  it("una cifra inventada se marca y se reemplaza por «[por completar]»", () => {
    const p = copia();
    const t = p.diapositivas[3] as { intro?: string; tarjetas: { texto: string }[] };
    t.intro = "La facultad creció 47 % este año.";
    const r = verificarPresentacion(p, informeEjemplo);
    expect(r.no_verificado).toEqual([{ diapositiva: 4, campo: "intro", valor: "47", motivo: "cifra" }]);
    expect((r.presentacion.diapositivas[3] as { intro?: string }).intro).toBe("La facultad creció [por completar] % este año.");
  });

  it("también revisa las notas del orador", () => {
    const p = copia();
    p.diapositivas[0].notas = "Atendimos a 12345 estudiantes.";
    const r = verificarPresentacion(p, informeEjemplo);
    expect(r.no_verificado[0]).toMatchObject({ diapositiva: 1, campo: "notas", valor: "12345" });
  });

  it("un enlace inventado se reemplaza; uno del informe se conserva", () => {
    const p = copia();
    const ev = p.diapositivas.find((d) => d.tipo === "evidencias") as { enlaces: { texto: string; url: string }[] };
    ev.enlaces = [{ texto: "Real", url: "https://evidencias.example.org/curriculos-2026/" }, { texto: "Falso", url: "https://inventado.example.org/x" }];
    const r = verificarPresentacion(p, informeEjemplo);
    const out = r.presentacion.diapositivas.find((d) => d.tipo === "evidencias") as { enlaces: { url: string }[] };
    expect(out.enlaces[0].url).toBe("https://evidencias.example.org/curriculos-2026/");
    expect(out.enlaces[1].url).toBe("[por completar]");
    expect(r.no_verificado.filter((n) => n.motivo === "enlace")).toHaveLength(1);
  });

  it("una fila de cumplimiento con conteos que el informe no tiene se quita; sin filas, se quita la diapositiva", () => {
    const p = copia();
    const c = p.diapositivas.find((d) => d.tipo === "cumplimiento") as { filas: { dimension: string; completadas: number; en_proceso: number; pendientes: number }[] };
    c.filas[0] = { dimension: "Inventada", completadas: 77, en_proceso: 88, pendientes: 99 };
    const r = verificarPresentacion(p, informeEjemplo);
    const out = r.presentacion.diapositivas.find((d) => d.tipo === "cumplimiento") as { filas: unknown[] };
    expect(out.filas).toHaveLength(2);
    expect(r.no_verificado[0].campo).toMatch(/Inventada/);

    c.filas = [{ dimension: "Solo", completadas: 77, en_proceso: 88, pendientes: 99 }];
    const r2 = verificarPresentacion(p, informeEjemplo);
    expect(r2.presentacion.diapositivas.some((d) => d.tipo === "cumplimiento")).toBe(false);
  });

  it("el total que suma una fila de cumplimiento (5) y el de todas (12) no cuentan como invención", () => {
    const p = copia();
    const c = p.diapositivas.find((d) => d.tipo === "cumplimiento") as { nota?: string };
    c.nota = "Total de 12 acciones.";
    expect(verificarPresentacion(p, { anio: 2026 }).no_verificado.find((n) => n.campo === "nota" && n.valor === "12")).toBeUndefined();
  });

  it("el número de portada de sección («01») es numeración y no se verifica", () => {
    const p = copia();
    const s = p.diapositivas.find((d) => d.tipo === "seccion") as { numero?: string };
    s.numero = "07";
    expect(verificarPresentacion(p, informeEjemplo).no_verificado.find((n) => n.valor === "07")).toBeUndefined();
  });

  it("sobre un informe vacío todo número queda por completar", () => {
    const r = verificarPresentacion(copia(), {});
    expect(r.no_verificado.length).toBeGreaterThan(10);
  });

  it("respalda con números y textos de cualquier forma", () => {
    const r = respaldoDelInforme({ a: [{ n: 3 }], b: "2.840 matriculados, ver https://a.example.org/x." });
    expect(r.numeros.has("3")).toBe(true);
    expect(r.numeros.has("2840")).toBe(true);
    expect(r.enlaces.has("https://a.example.org/x")).toBe(true);
  });

  it("lo verificado sigue siendo una presentación válida", () => {
    const r = verificarPresentacion(copia(), {});
    const v = validarPresentacion({ titulo: r.presentacion.titulo, diapositivas: r.presentacion.diapositivas.filter((d) => d.tipo !== "cumplimiento") }, "institucional");
    expect(v.ok ? [] : v.errores).toEqual([]);
  });
});
