/* La matriz portal × fuente (0121), sin red ni base: qué opciones tiene cada
   celda, qué lee de verdad un portal y cómo se cuenta el efecto de un cambio. */
import { describe, expect, it } from "vitest";
import { cellChoices, cellOf, confirmText, docCollections, effectText, effectiveCell, homeFlags, missing0121, parsePortals } from "./portals";

const SOURCES = [
  { id: "cifras", scope: "planeacion", name: "UDES en Cifras", kind: "portal", staff_only: false, stays_home: false, sort: 1 },
  { id: "impacto", scope: "planeacion", name: "Portal de Impacto", kind: "portal", staff_only: true, stays_home: false, sort: 5 },
  { id: "normativa", scope: "planeacion", name: "Normativa", kind: "documentos", staff_only: false, stays_home: false, sort: 7 },
  { id: "politicas", scope: "ensenanza", name: "Políticas institucionales", kind: "documentos", staff_only: false, stays_home: false, sort: 12 },
  { id: "moodle", scope: "ensenanza", name: "Cursos de Moodle", kind: "moodle", staff_only: false, stays_home: true, sort: 14 },
];
const PORTALS = [
  { id: "ensenanza", scope: "ensenanza", name: "Pilo en Enseñanza", written_for: "profesores y estudiantes", sort: 2, matrix: { politicas: "casa", moodle: "casa", cifras: "no" } },
  { id: "planeacion", scope: "planeacion", name: "Pilo de la Universidad", written_for: "la dirección", sort: 1, matrix: { cifras: "casa", impacto: "casa", normativa: "no", politicas: "no", moodle: "no" } },
];

const data = parsePortals(PORTALS, SOURCES);
const [general, teach] = data.portals;
const src = (id: string) => data.sources.find((s) => s.id === id)!;

describe("leer la matriz", () => {
  it("ordena los portales y las fuentes, y lo que no reconoce no entra", () => {
    expect(data.portals.map((p) => p.id)).toEqual(["planeacion", "ensenanza"]);
    expect(data.sources.map((s) => s.id)).toEqual(["cifras", "impacto", "normativa", "politicas", "moodle"]);
    const odd = parsePortals(
      [{ id: "planeacion", scope: "planeacion", matrix: { cifras: "siempre", pdi: "casa", moodle: 1 } }, null, "x", { id: 3 }],
      [{ id: "Mala", scope: "planeacion" }, { id: "pdi", scope: "planeacion", kind: "otra" }, null],
    );
    expect(odd.portals).toHaveLength(1);
    expect(odd.portals[0].matrix).toEqual({ pdi: "casa" });
    expect(odd.portals[0].name).toBe("planeacion");
    expect(odd.sources).toEqual([{ id: "pdi", scope: "planeacion", name: "pdi", kind: "portal", staff_only: false, stays_home: false, sort: 0 }]);
    expect(parsePortals(null, undefined)).toEqual({ portals: [], sources: [] });
  });

  it("lo que no está escrito es «no»", () => {
    expect(cellOf(teach, src("normativa"))).toBe("no");
    expect(cellOf(general, src("cifras"))).toBe("casa");
  });

  it("lo que un portal lee de verdad pasa por las reglas de la base: «casa» solo en lo propio y «visita» todavía no", () => {
    const forced = parsePortals([{ id: "planeacion", scope: "planeacion", matrix: { cifras: "casa", politicas: "casa", moodle: "visita", normativa: "visita" } }], SOURCES).portals[0];
    expect(effectiveCell(forced, src("cifras"))).toBe("casa");
    expect(effectiveCell(forced, src("politicas"))).toBe("no");
    expect(effectiveCell(forced, src("moodle"))).toBe("no");
    expect(effectiveCell(forced, src("normativa"))).toBe("no");
  });
});

describe("las opciones de una celda", () => {
  it("en lo propio: «De casa» o «No»; nunca «De visita»", () => {
    const choices = cellChoices(general, src("cifras"));
    expect(choices.map((c) => [c.value, c.enabled])).toEqual([["casa", true], ["no", true]]);
    // Impacto dice que pide sesión de la intranet.
    expect(cellChoices(general, src("impacto"))[0].note).toMatch(/personal con sesión de la intranet/);
  });

  it("en lo ajeno: «No», y «De visita» a la vista pero sin poder marcarse", () => {
    const choices = cellChoices(general, src("politicas"));
    expect(choices.map((c) => [c.value, c.label, c.enabled])).toEqual([["visita", "De visita", false], ["no", "No", true]]);
    expect(choices[0].note).toMatch(/siguiente entrega/);
    // «De casa» no se ofrece para lo de otro ámbito.
    expect(choices.some((c) => c.value === "casa")).toBe(false);
  });

  it("los cursos de Moodle no salen de su portal: se dice por qué", () => {
    expect(cellChoices(general, src("moodle"))[0]).toMatchObject({ value: "visita", enabled: false, note: "Cursos de Moodle no sale de su portal." });
    expect(cellChoices(teach, src("moodle")).map((c) => c.value)).toEqual(["casa", "no"]);
  });
});

describe("lo que se dice de un cambio", () => {
  it("antes: la pregunta nombra la consecuencia", () => {
    expect(confirmText(general, src("cifras"), "no")).toBe(
      "¿«Pilo de la Universidad» deja de leer UDES en Cifras? Sus pasajes siguen guardados, pero no entran en ninguna respuesta de este portal, y las respuestas guardadas que los citan dejan de servirse.",
    );
    expect(confirmText(general, src("impacto"), "casa")).toMatch(/vuelve a leer Portal de Impacto\? .*solo para el personal con sesión de la intranet/);
    expect(confirmText(general, src("normativa"), "casa")).not.toMatch(/sesión/);
  });

  it("después: el efecto, con los números de la base", () => {
    expect(effectText(general, { source: "cifras", name: "UDES en Cifras", from: "casa", to: "no", passages: 214, answers: 3 })).toBe(
      "«Pilo de la Universidad» ya no lee UDES en Cifras: 214 pasajes quedan guardados, pero no entran en sus respuestas. 3 respuestas guardadas que la citaban dejan de servirse.",
    );
    expect(effectText(general, { source: "cifras", name: "UDES en Cifras", from: "casa", to: "no", passages: 1, answers: 1 })).toBe(
      "«Pilo de la Universidad» ya no lee UDES en Cifras: 1 pasaje queda guardado, pero no entra en sus respuestas. 1 respuesta guardada que la citaba deja de servirse.",
    );
    expect(effectText(general, { source: "normativa", name: "Normativa", from: "no", to: "casa", passages: 0, answers: 0 })).toBe(
      "«Pilo de la Universidad» ya lee Normativa, que todavía no tiene pasajes: entrarán en cuanto se carguen.",
    );
    expect(effectText(general, { source: "normativa", name: "Normativa", from: "no", to: "casa", passages: 1240, answers: 0 })).toBe(
      "«Pilo de la Universidad» ya lee Normativa: 1.240 pasajes entran en sus respuestas desde ahora.",
    );
    expect(effectText(teach, { source: "politicas", name: "Políticas institucionales", from: "casa", to: "no", passages: 0, answers: 0 })).toBe("«Pilo en Enseñanza» ya no lee Políticas institucionales: no tenía pasajes.");
  });
});

describe("lo que se deriva de la matriz", () => {
  it("los interruptores de siempre son las celdas de casa del portal, y nada de lo ajeno", () => {
    expect(homeFlags(general, data.sources)).toEqual({ cifras: true, impacto: true, normativa: false });
    expect(homeFlags(teach, data.sources)).toEqual({ politicas: true, moodle: true });
  });

  it("las colecciones de documentos de un ámbito: sin las fuentes de portal ni Moodle", () => {
    expect(docCollections(data.sources, "planeacion")).toEqual([{ id: "normativa", code: "NO", name: "Normativa" }]);
    expect(docCollections(data.sources, "ensenanza")).toEqual([{ id: "politicas", code: "PO", name: "Políticas institucionales" }]);
    expect(docCollections([{ ...src("normativa"), id: "actas", name: "Actas" }], "planeacion")).toEqual([{ id: "actas", code: "AC", name: "Actas" }]);
  });

  it("reconoce que falta la migración", () => {
    expect(missing0121({ code: "PGRST205", message: "Could not find the table 'public.pilo_portals' in the schema cache" })).toBe(true);
    expect(missing0121({ code: "PGRST202", message: "Could not find the function public.pilo_portal_update" })).toBe(true);
    expect(missing0121({ message: 'relation "pilo_portals" does not exist' })).toBe(true);
    expect(missing0121({ code: "42501", message: "permission denied" })).toBe(false);
    expect(missing0121(null)).toBe(false);
  });
});
