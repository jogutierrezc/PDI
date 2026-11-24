import { describe, expect, it } from "vitest";
import { ODS_LIST } from "./ods-data";
import { wallHoles, wallLayout } from "./ods-portal-wall";
import type { WallItem } from "./ods-portal-wall";

const items = (list = ODS_LIST): WallItem[] => list.map((o) => ({ id: o.n, size: o.the && o.real ? "xl" : o.the ? "w" : "s" }));

describe("UDES Sostenible · muro de carteles", () => {
  it("coloca los 17 carteles sin huecos a cuatro y a dos columnas", () => {
    for (const cols of [4, 2]) {
      const slots = wallLayout(items(), cols);
      expect(slots.size).toBe(17);
      expect(wallHoles(slots, cols)).toBe(0);
    }
  });

  it("no deja huecos con el filtro «Para THE» ni con búsquedas sueltas", () => {
    const sets = [ODS_LIST.filter((o) => o.the), ODS_LIST.slice(0, 5), ODS_LIST.filter((o) => o.n % 3 === 0), [ODS_LIST[12]]];
    for (const list of sets) for (const cols of [4, 2]) expect(wallHoles(wallLayout(items(list), cols), cols)).toBe(0);
  });
});
