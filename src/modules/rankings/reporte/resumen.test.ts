import { describe, expect, it } from "vitest";
import type { AporteRef, Asignacion, Indicador } from "./tipos";
import type { RespuestaFechada } from "./resumen";
import {
  aportesDe,
  asignacionDe,
  camposDeDato,
  catalogoOrdenado,
  coincide,
  estadoIndicador,
  conteoAportes,
  indicadoresDeUnidad,
  oficialMarcada,
  otrosAportes,
  respuestaOficial,
  resumenPorOds,
} from "./resumen";

const ind = (over: Partial<Indicador> & Pick<Indicador, "id" | "ods">): Indicador => ({
  nivel: "indicator",
  padre: null,
  tipo: "ev",
  texto_en: "",
  texto_es: "",
  peso: null,
  prioridad: null,
  tipo_requerimiento: "",
  orden: 0,
  ...over,
});

const resp = (indicador: string, unidad: string, estado: RespuestaFechada["estado"], updated_at = "2026-10-01T00:00:00Z"): RespuestaFechada => ({
  id: `${indicador}-${unidad}`,
  indicador,
  unidad,
  valores: {},
  si_no: null,
  estado,
  comentario_es: "",
  comentario_en: "",
  nota_revision: "",
  updated_at,
});

const catalogo: Indicador[] = [
  ind({ id: "4", ods: 4, nivel: "metric", tipo: null }),
  ind({ id: "4.2.1", ods: 4, tipo: "dato", texto_es: "Titulados con cualificación" }),
  ind({ id: "4.3.1", ods: 4, texto_es: "Recursos públicos de aprendizaje" }),
  ind({ id: "4.3.1/1", ods: 4, nivel: "option", padre: "4.3.1", tipo: "dato", orden: 1 }),
  ind({ id: "10.5.1", ods: 10, tipo: "dato" }),
  ind({ id: "10.6.7", ods: 10 }),
  ind({ id: "17.4.4", ods: 17 }),
];

const asig: Asignacion[] = [
  { indicador: "4.2.1", unidad: "A", rol: "principal" },
  { indicador: "4.3.1", unidad: "B", rol: "principal" },
  { indicador: "4.3.1", unidad: "C", rol: "apoyo" },
  { indicador: "10.5.1", unidad: "A", rol: "principal" },
];

describe("resumenPorOds", () => {
  it("cuenta solo indicadores, por su oficial: una aprobada de cualquier oficina cuenta", () => {
    const r = resumenPorOds(catalogo, [resp("4.2.1", "A", "ok"), resp("4.3.1", "B", "sent"), resp("4.3.1", "C", "ok")]);
    expect(r.map((f) => f.ods)).toEqual([4, 10, 17]);
    expect(r[0]).toMatchObject({ total: 2, ok: 2, sent: 0, avance: 1 });
  });

  it("un indicador sin aportes queda sin empezar", () => {
    const r = resumenPorOds(catalogo, []);
    expect(r.find((f) => f.ods === 17)).toMatchObject({ total: 1, none: 1, avance: 0 });
  });
});

describe("estadoIndicador", () => {
  it("sin aprobada, muestra lo más pendiente de sus aportes", () => {
    expect(estadoIndicador("4.3.1", [resp("4.3.1", "B", "draft"), resp("4.3.1", "C", "sent")])).toBe("sent");
    expect(estadoIndicador("4.3.1", [resp("4.3.1", "B", "draft")])).toBe("draft");
  });

  it("una aprobada de una oficina de apoyo cuenta como oficial", () => {
    expect(estadoIndicador("4.3.1", [resp("4.3.1", "C", "ok")])).toBe("ok");
  });
});

describe("respuestaOficial", () => {
  it("sin marca, es la aprobada más reciente", () => {
    const oficial = respuestaOficial("4.3.1", [
      resp("4.3.1", "B", "ok", "2026-09-01T00:00:00Z"),
      resp("4.3.1", "C", "ok", "2026-10-05T00:00:00Z"),
      resp("4.3.1", "A", "sent", "2026-10-09T00:00:00Z"),
    ]);
    expect(oficial?.unidad).toBe("C");
  });

  it("la marcada por Planeación gana a la más reciente", () => {
    const lista = [{ ...resp("4.3.1", "B", "ok", "2026-09-01T00:00:00Z"), oficial: true }, resp("4.3.1", "C", "ok", "2026-10-05T00:00:00Z")];
    expect(respuestaOficial("4.3.1", lista)?.unidad).toBe("B");
    expect(oficialMarcada("4.3.1", lista)).toBe(true);
    expect(oficialMarcada("4.3.1", [resp("4.3.1", "C", "ok")])).toBe(false);
  });

  it("una marca sobre una respuesta que ya no está aprobada no cuenta", () => {
    const lista = [{ ...resp("4.3.1", "B", "back"), oficial: true }, resp("4.3.1", "C", "ok")];
    expect(respuestaOficial("4.3.1", lista)?.unidad).toBe("C");
    expect(oficialMarcada("4.3.1", lista)).toBe(false);
  });

  it("sin aprobadas no hay oficial", () => {
    expect(respuestaOficial("4.3.1", [resp("4.3.1", "B", "sent")])).toBeUndefined();
  });
});

describe("otrosAportes y conteoAportes (RPC ranking_aportes)", () => {
  const ap = (indicador: string, unidad: string, estado: AporteRef["estado"]): AporteRef => ({ indicador, unidad, unidad_nombre: `Oficina ${unidad}`, estado, oficial: false });
  const aportes = [ap("4.3.1", "Z", "sent"), ap("4.3.1", "A", "ok"), ap("4.3.1", "B", "draft"), ap("4.3.1", "C", "none"), ap("5.2.1", "Z", "draft")];

  it("las demás oficinas de un indicador, por nombre, sin la propia ni las sin empezar", () => {
    expect(otrosAportes("4.3.1", aportes, "B").map((a) => a.unidad)).toEqual(["A", "Z"]);
  });

  it("cuenta por indicador sin la propia", () => {
    const c = conteoAportes(aportes, "Z");
    expect(c.get("4.3.1")).toBe(2);
    expect(c.get("5.2.1")).toBeUndefined();
  });
});

describe("aportesDe", () => {
  it("reúne las aportaciones con contenido, de todas las oficinas, y deja fuera las sin empezar", () => {
    const lista = aportesDe("4.3.1", [resp("4.3.1", "B", "draft"), resp("4.3.1", "C", "none"), resp("4.3.1", "D", "ok")]);
    expect(lista.map((r) => r.unidad)).toEqual(["B", "D"]);
  });
});

describe("asignacionDe e indicadoresDeUnidad", () => {
  it("separa responsable sugerido y apoyo sugerido", () => {
    expect(asignacionDe("4.3.1", asig)).toEqual({ principal: "B", apoyo: ["C"] });
    expect(asignacionDe("17.4.4", asig)).toEqual({ principal: null, apoyo: [] });
  });

  it("devuelve solo los indicadores sugeridos a la oficina, ordenados", () => {
    const lista = indicadoresDeUnidad("A", catalogo, asig);
    expect(lista.map((x) => [x.indicador.id, x.rol])).toEqual([
      ["4.2.1", "principal"],
      ["10.5.1", "principal"],
    ]);
  });
});

describe("catalogoOrdenado", () => {
  it("pone los ODS priorizados al frente, en su orden, y luego el resto por ODS", () => {
    const ids = catalogoOrdenado(catalogo, [10, 4]).map((i) => i.id);
    expect(ids).toEqual(["10.5.1", "10.6.7", "4.2.1", "4.3.1", "17.4.4"]);
  });
});

describe("coincide", () => {
  const i = ind({ id: "4.3.1", ods: 4, texto_es: "Recursos públicos de aprendizaje", texto_en: "Public learning resources" });

  it("busca por número o por texto, sin acentos ni mayúsculas", () => {
    expect(coincide(i, "4.3")).toBe(true);
    expect(coincide(i, "RECURSOS")).toBe(true);
    expect(coincide(i, "publicos")).toBe(true);
    expect(coincide(i, "learning")).toBe(true);
    expect(coincide(i, "5.6")).toBe(false);
  });

  it("una búsqueda vacía lo deja todo", () => {
    expect(coincide(i, "   ")).toBe(true);
  });
});

describe("camposDeDato", () => {
  it("toma las opciones del indicador, no las de otro", () => {
    expect(camposDeDato("4.3.1", catalogo).map((c) => c.id)).toEqual(["4.3.1/1"]);
    expect(camposDeDato("4.2.1", catalogo)).toEqual([]);
  });
});
