import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* La función del servidor (supabase/functions/soporte/index.ts) es un solo archivo,
   porque el editor de Supabase solo acepta uno, y lleva dentro una copia de
   adjuntos.ts y de push.ts. Esta prueba falla si se separan: al cambiar
   cualquiera de las dos, hay que copiarla también en index.ts. */
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("la función soporte es un solo archivo", () => {
  it("sus reglas de adjuntos son las de adjuntos.ts", () => {
    const logic = read(resolve(__dirname, "adjuntos.ts"));
    const index = read(resolve(__dirname, "../../../supabase/functions/soporte/index.ts"));
    const marker = "========================================================================== */";
    const body = logic.slice(logic.indexOf(marker) + marker.length).replace(/^\n+|\n+$/g, "");
    const from = index.indexOf("// --- inicio adjuntos") + "// --- inicio adjuntos".length;
    const inner = index.slice(from, index.indexOf("// --- fin adjuntos"));
    expect(inner.replace(/^\n+|\n+$/g, "")).toBe(body);
    expect(index).not.toMatch(/from "\.\/adjuntos/);
  });

  it("su Web Push es el de push.ts", () => {
    const logic = read(resolve(__dirname, "push.ts"));
    const index = read(resolve(__dirname, "../../../supabase/functions/soporte/index.ts"));
    const marker = "============================================================================= */";
    const body = logic.slice(logic.indexOf(marker) + marker.length).replace(/^\n+|\n+$/g, "");
    const from = index.indexOf("// --- inicio push") + "// --- inicio push".length;
    const inner = index.slice(from, index.indexOf("// --- fin push"));
    expect(inner.replace(/^\n+|\n+$/g, "")).toBe(body);
    expect(index).not.toMatch(/from "\.\/push/);
  });
});
