/* =============================================================================
   CMS Portales · importarArbol con un doble de Supabase.

   Comprueba el orden padre -> hijo, la idempotencia, que nunca se publique y
   qué pasa cuando fallan los bloques de una página (se retira solo esa página).
   ========================================================================== */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CmsPagina } from "./tipos";
import type { NodoMicrositio } from "./plantillas";

type Fila = Record<string, unknown>;
const estado = vi.hoisted(() => ({ paginas: [] as Fila[], bloques: [] as Fila[], borradas: [] as string[], fallaBloquesDe: new Set<string>(), fallaBorrado: false, rpc: vi.fn(), n: 0 }));

vi.mock("../../../lib/supabase", () => {
  const tabla = (nombre: string) => ({
    insert: (fila: Fila) => ({
      select: () => ({
        single: async () => {
          const nueva = { id: `p${++estado.n}`, publicada_version: null, publicada_en: null, creado_en: "", actualizado_en: "", ...fila };
          estado.paginas.push(nueva);
          return { data: nueva, error: null };
        },
      }),
    }),
    upsert: async (filas: Fila[]) => {
      if (filas.some((f) => estado.fallaBloquesDe.has(String(f.pagina_id)))) return { error: { code: "XX", message: "boom" } };
      estado.bloques.push(...filas);
      return { error: null };
    },
    update: () => ({ eq: async () => ({ error: null }) }),
    delete: () => ({
      eq: async (_c: string, id: string) => {
        if (estado.fallaBorrado) return { error: { code: "XX", message: "no" } };
        estado.borradas.push(id);
        estado.paginas = estado.paginas.filter((p) => p.id !== id);
        estado.bloques = estado.bloques.filter((b) => b.pagina_id !== id);
        return { error: null };
      },
    }),
    _nombre: nombre,
  });
  return { supabase: { from: tabla, rpc: estado.rpc } };
});

import { importarArbol } from "./store";

const pagina = (id: string, ruta: string): CmsPagina => ({ id, portal: "sostenible", padre_id: null, ruta, titulo: ruta, publicada_version: null, publicada_en: null, creado_en: "", actualizado_en: "" });
const nodo = (slug: string, padre: string | null): NodoMicrositio => ({ slug, titulo: slug, padre, bloques: [{ tipo: "texto", ancho: 12, props: { texto: slug } }] });
const arbol = [nodo("impact", null), nodo("o4", "impact"), nodo("world", null)];

beforeEach(() => {
  Object.assign(estado, { paginas: [], bloques: [], borradas: [], fallaBloquesDe: new Set(), fallaBorrado: false, n: 0 });
  estado.rpc.mockReset();
  vi.stubGlobal("crypto", { randomUUID: () => `b${++estado.n}` });
});

describe("importarArbol", () => {
  it("crea padre antes que hijo, con padre_id resuelto, y nunca publica", async () => {
    const portada = pagina("raiz", "");
    const r = await importarArbol("sostenible", arbol, [portada]);
    expect(r.creadas).toEqual(["impact", "impact/o4", "world"]);
    expect(r.fallidas).toEqual([]);
    const impact = estado.paginas.find((p) => p.ruta === "impact")!;
    expect(impact.padre_id).toBe("raiz");
    expect(estado.paginas.find((p) => p.ruta === "impact/o4")!.padre_id).toBe(impact.id);
    expect(estado.paginas.every((p) => p.publicada_version === null)).toBe(true);
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it("es idempotente: con todo creado, no escribe nada", async () => {
    const existentes = [pagina("raiz", ""), pagina("a", "impact"), pagina("b", "impact/o4"), pagina("c", "world")];
    const r = await importarArbol("sostenible", arbol, existentes);
    expect(r.creadas).toEqual([]);
    expect(r.omitidas).toEqual(["impact", "impact/o4", "world"]);
    expect(estado.paginas).toEqual([]);
  });

  it("sin portada avisa en vez de crear páginas huérfanas", async () => {
    await expect(importarArbol("sostenible", arbol, [])).rejects.toThrow(/portada/);
    expect(estado.paginas).toEqual([]);
  });

  it("si fallan los bloques de una página la retira, sigue con el resto y no toca las existentes", async () => {
    const previa = pagina("previa", "world");
    estado.fallaBloquesDe.add("p1"); // la primera creada: impact
    const r = await importarArbol("sostenible", arbol, [pagina("raiz", ""), previa]);
    expect(estado.borradas).toEqual(["p1"]);
    expect(r.fallidas.map((f) => f.ruta)).toEqual(["impact", "impact/o4"]);
    expect(r.fallidas[0]!.motivo).toMatch(/bloques/);
    expect(r.fallidas[1]!.motivo).toMatch(/padre/);
    expect(r.omitidas).toEqual(["world"]);
    expect(estado.borradas).not.toContain("previa");
  });

  it("si además no puede retirarla lo dice", async () => {
    estado.fallaBloquesDe.add("p1");
    estado.fallaBorrado = true;
    const r = await importarArbol("sostenible", [nodo("impact", null)], [pagina("raiz", "")]);
    expect(r.fallidas[0]!.motivo).toMatch(/no se pudo retirar/);
  });
});
