/* Regla de las ediciones: las noticias del año N van a la edición N+1.
   La copia de Deno (supabase/functions/pilo-rankingsod/anios.ts) debe ser la misma función. */
import { describe, expect, it } from "vitest";
import * as original from "../../src/modules/rankings/informes/anios";
import * as copia from "../../supabase/functions/pilo-rankingsod/anios";
import { elegirCandidata, type NotaInforme } from "../../supabase/functions/pilo-rankingsod/logica";

const nota = (id: string, published_on: string): NotaInforme => ({ id, title: id, body: "Texto de la nota.", published_on, section: "", campus: "", url: "", image_url: null, score: 0 });

describe("año de las noticias de cada edición", () => {
  it("las noticias del año N van a la edición N+1 (2025 → 2026, 2024 → 2025) y la inversa cuadra", () => {
    expect(original.anioDeNoticias(2026)).toBe(2025);
    expect(original.anioDeNoticias(2025)).toBe(2024);
    expect(original.edicionDeNoticias(2025)).toBe(2026);
    expect(original.edicionDeNoticias(original.anioDeNoticias(2027))).toBe(2027);
  });

  it("el rango de fechas cubre exactamente el año calendario [desde, hasta)", () => {
    expect(original.rangoFechasDeAnio(2025)).toEqual({ desde: "2025-01-01", hasta: "2026-01-01" });
  });

  it("la copia de Deno da lo mismo que el original", () => {
    for (let e = 2015; e <= 2030; e++) {
      expect(copia.anioDeNoticias(e)).toBe(original.anioDeNoticias(e));
      expect(copia.edicionDeNoticias(e)).toBe(original.edicionDeNoticias(e));
      expect(copia.rangoFechasDeAnio(e)).toEqual(original.rangoFechasDeAnio(e));
    }
    expect(copia.DESFASE_NOTICIAS).toBe(original.DESFASE_NOTICIAS);
  });

  it("la edición 2026 elige la nota de 2025 sobre la de 2026 (la de 2026 no es de su año de noticias)", () => {
    const cands = [
      { news_id: "de2026", rel: "s" as const, why: "", flags: [] },
      { news_id: "de2025", rel: "s" as const, why: "", flags: [] },
    ];
    const notas = [nota("de2026", "2026-03-10"), nota("de2025", "2025-03-10")];
    expect(elegirCandidata(cands, notas, original.anioDeNoticias(2026))).toBe("de2025");
  });
});
