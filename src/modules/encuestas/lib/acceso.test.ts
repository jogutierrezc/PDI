import { describe, expect, it } from "vitest";
import { comprobarReto, crearReto, dominioPermitido, huellaDe, hoyBogota, motivoCierre, RETO } from "../../../../supabase/functions/encuestas/acceso";

const SECRETO = "secreto-de-prueba";

describe("cuándo recibe una encuesta", () => {
  const base = { estado: "publicada" as const, abre_el: null, cierra_el: null };
  it("solo publicada y dentro de fechas", () => {
    expect(motivoCierre(base, "2026-10-22")).toBeNull();
    expect(motivoCierre({ ...base, estado: "borrador" })).toBe("borrador");
    expect(motivoCierre({ ...base, estado: "pausada" })).toBe("pausada");
    expect(motivoCierre({ ...base, estado: "cerrada" })).toBe("cerrada");
    expect(motivoCierre({ ...base, abre_el: "2026-11-01" }, "2026-10-22")).toBe("aun_no");
    expect(motivoCierre({ ...base, cierra_el: "2026-10-21" }, "2026-10-22")).toBe("vencida");
    expect(motivoCierre({ ...base, cierra_el: "2026-10-22" }, "2026-10-22")).toBeNull();
  });
  it("el día cuenta en hora de Bogotá", () => {
    expect(hoyBogota(Date.parse("2026-10-22T03:00:00Z"))).toBe("2026-10-21");
    expect(hoyBogota(Date.parse("2026-10-22T06:00:00Z"))).toBe("2026-10-22");
  });
});

describe("dominios permitidos", () => {
  it("acepta el dominio y sus subdominios, no los parecidos", () => {
    expect(dominioPermitido("a@udes.edu.co", ["udes.edu.co"])).toBe(true);
    expect(dominioPermitido("a@mail.udes.edu.co", ["udes.edu.co"])).toBe(true);
    expect(dominioPermitido("a@malaudes.edu.co", ["udes.edu.co"])).toBe(false);
    expect(dominioPermitido("a@udes.edu.co.malo.com", ["udes.edu.co"])).toBe(false);
    expect(dominioPermitido("a@udes.edu.co", [])).toBe(false);
    expect(dominioPermitido("a@mail.udes.edu.co", ["@mail.udes.edu.co"])).toBe(true);
  });
});

describe("el reto contra robots", () => {
  const suma = (p: string) => {
    const m = /(\d+) \+ (\d+)/.exec(p) as RegExpExecArray;
    return Number(m[1]) + Number(m[2]);
  };

  it("pasa con la respuesta correcta y a tiempo", async () => {
    const t0 = 1_000_000;
    const r = await crearReto("enc", SECRETO, t0);
    expect(await comprobarReto("enc", r.pase, suma(r.pregunta), SECRETO, t0 + RETO.minimoMs + 1)).toBe("ok");
    expect(await comprobarReto("enc", r.pase, String(suma(r.pregunta)), SECRETO, t0 + 60_000)).toBe("ok");
  });

  it("rechaza lo incorrecto, lo muy rápido, lo vencido, lo ajeno y lo manipulado", async () => {
    const t0 = 1_000_000;
    const r = await crearReto("enc", SECRETO, t0);
    const bien = suma(r.pregunta);
    expect(await comprobarReto("enc", r.pase, bien + 1, SECRETO, t0 + 10_000)).toBe("incorrecto");
    expect(await comprobarReto("enc", r.pase, "abc", SECRETO, t0 + 10_000)).toBe("incorrecto");
    expect(await comprobarReto("enc", r.pase, bien, SECRETO, t0 + 500)).toBe("rapido");
    expect(await comprobarReto("enc", r.pase, bien, SECRETO, t0 + RETO.maximoMs + 1)).toBe("vencido");
    expect(await comprobarReto("otra", r.pase, bien, SECRETO, t0 + 10_000)).toBe("incorrecto");
    expect(await comprobarReto("enc", r.pase, bien, "otro-secreto", t0 + 10_000)).toBe("incorrecto");
    expect(await comprobarReto("enc", `${r.pase}x`, bien, SECRETO, t0 + 10_000)).toBe("incorrecto");
    expect(await comprobarReto("enc", "", bien, SECRETO, t0 + 10_000)).toBe("falta");
    expect(await comprobarReto("enc", undefined, bien, SECRETO, t0 + 10_000)).toBe("falta");
  });
});

describe("huella de la IP", () => {
  it("es estable, distinta por IP y no contiene la IP", async () => {
    const a = await huellaDe("181.50.1.2", SECRETO);
    expect(a).toBe(await huellaDe("181.50.1.2", SECRETO));
    expect(a).not.toBe(await huellaDe("181.50.1.3", SECRETO));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("181");
  });
});
