import { describe, expect, it } from "vitest";
import {
  aplanar,
  arbol,
  destinoSeguro,
  estadoPublicacion,
  estiloDe,
  fijarEstilo,
  fijarMovimiento,
  fijarOculto,
  movimientoDe,
  ocultoDe,
  parejaCategoria,
  planImportacion,
  planSincronizacion,
  rutaHija,
  rutaOcupada,
  slugDeRuta,
  slugify,
} from "./logica";
import type { CmsPagina } from "./tipos";
import type { NodoMicrositio } from "./plantillas";

function pagina(partial: Partial<CmsPagina> & Pick<CmsPagina, "id">): CmsPagina {
  return {
    portal: "sostenible",
    padre_id: null,
    ruta: "",
    titulo: "",
    publicada_version: null,
    publicada_en: null,
    creado_en: "2026-10-01T00:00:00Z",
    actualizado_en: "2026-10-01T00:00:00Z",
    ...partial,
  };
}

describe("slugify", () => {
  it("quita tildes, pasa a minúsculas y une palabras con guiones", () => {
    expect(slugify("¿Por qué la UDES es sostenible?")).toBe("por-que-la-udes-es-sostenible");
    expect(slugify("  Clima y Energía  ")).toBe("clima-y-energia");
  });

  it("devuelve vacío cuando no queda nada utilizable", () => {
    expect(slugify("¿¡?!")).toBe("");
  });
});

describe("rutas", () => {
  it("una hija cuelga de la ruta del padre", () => {
    expect(rutaHija("clima", "energia")).toBe("clima/energia");
  });

  it("una página de primer nivel no lleva prefijo", () => {
    expect(rutaHija("", "clima")).toBe("clima");
  });

  it("slugDeRuta devuelve el último segmento", () => {
    expect(slugDeRuta("clima/energia")).toBe("energia");
    expect(slugDeRuta("")).toBe("");
  });

  it("rutaOcupada mira solo el mismo portal", () => {
    const paginas = [pagina({ id: "a", portal: "landing", ruta: "clima" })];
    expect(rutaOcupada(paginas, "landing", "clima")).toBe(true);
    expect(rutaOcupada(paginas, "sostenible", "clima")).toBe(false);
  });
});

describe("estadoPublicacion", () => {
  it("sin versión, sin publicar", () => {
    expect(estadoPublicacion(pagina({ id: "a" }))).toBe("sin-publicar");
  });

  it("publicada cuando no se editó después", () => {
    expect(
      estadoPublicacion(
        pagina({ id: "a", publicada_version: 1, publicada_en: "2026-10-02T10:00:00Z", actualizado_en: "2026-10-02T10:00:00Z" }),
      ),
    ).toBe("publicada");
  });

  it("con cambios cuando se editó después de publicar", () => {
    expect(
      estadoPublicacion(
        pagina({ id: "a", publicada_version: 1, publicada_en: "2026-10-02T10:00:00Z", actualizado_en: "2026-10-03T09:00:00Z" }),
      ),
    ).toBe("con-cambios");
  });
});

describe("arbol", () => {
  const raiz = pagina({ id: "r", ruta: "", titulo: "Portada" });
  const clima = pagina({ id: "c", ruta: "clima", titulo: "Clima" });
  const energia = pagina({ id: "e", padre_id: "c", ruta: "clima/energia", titulo: "Energía" });
  const agua = pagina({ id: "w", ruta: "agua", titulo: "Agua" });

  it("pone la portada primero y ordena el resto por título", () => {
    const nodos = arbol([agua, clima, raiz]);
    // La portada primero; el resto por título: Agua antes que Clima.
    expect(nodos.map((n) => n.pagina.id)).toEqual(["r", "w", "c"]);
  });

  it("anida los micrositios bajo su padre", () => {
    const nodos = arbol([raiz, clima, energia, agua]);
    const plano = aplanar(nodos);
    expect(plano.map((n) => [n.pagina.id, n.profundidad])).toEqual([
      ["r", 0],
      ["w", 0],
      ["c", 0],
      ["e", 1],
    ]);
  });

  it("un micrositio cuyo padre no llega se muestra en la raíz", () => {
    const huerfano = pagina({ id: "h", padre_id: "no-existe", ruta: "x/h", titulo: "Huérfano" });
    expect(aplanar(arbol([huerfano])).map((n) => n.pagina.id)).toEqual(["h"]);
  });

  it("no se cuelga en un ciclo", () => {
    const a = pagina({ id: "a", padre_id: "b", ruta: "a", titulo: "A" });
    const b = pagina({ id: "b", padre_id: "a", ruta: "b", titulo: "B" });
    const plano = aplanar(arbol([a, b]));
    expect(plano.length).toBeLessThanOrEqual(2);
  });
});

describe("estiloDe", () => {
  it("sin _estilo usa claro y espacio normal", () => {
    expect(estiloDe({})).toEqual({ fondo: "claro", espacio: "normal" });
  });

  it("lee un estilo válido", () => {
    expect(estiloDe({ _estilo: { fondo: "marino", espacio: "amplio" } })).toEqual({ fondo: "marino", espacio: "amplio" });
  });

  it("un valor que no es válido cae al por defecto, campo a campo", () => {
    expect(estiloDe({ _estilo: { fondo: "rojo", espacio: "amplio" } })).toEqual({ fondo: "claro", espacio: "amplio" });
    expect(estiloDe({ _estilo: "claro" })).toEqual({ fondo: "claro", espacio: "normal" });
  });
});

describe("movimientoDe", () => {
  it("usa el preset por defecto de cada tipo", () => {
    expect(movimientoDe("hero", {}).preset).toBe("palabras");
    expect(movimientoDe("ods", {}).preset).toBe("ninguna");
    expect(movimientoDe("frentes", {}).preset).toBe("cascada");
    expect(movimientoDe("texto", {}).preset).toBe("sube");
    expect(movimientoDe("cta", {}).preset).toBe("sube");
  });

  it("un tipo desconocido recibe el preset general", () => {
    expect(movimientoDe("inventado", {}).preset).toBe("sube");
  });

  it("sin _mov devuelve los valores de partida", () => {
    expect(movimientoDe("hero", {})).toEqual({ preset: "palabras", dur: 0.7, stagger: 0.08, delay: 0, ease: "power3.out" });
  });

  it("aplica _mov y acota los números a su rango", () => {
    const m = movimientoDe("texto", { _mov: { preset: "zoom", dur: 9, stagger: -1, delay: 0.3, ease: "expo.out" } });
    expect(m).toEqual({ preset: "zoom", dur: 1.6, stagger: 0, delay: 0.3, ease: "expo.out" });
  });

  it("un preset o una curva inventados vuelven al valor del tipo", () => {
    const m = movimientoDe("hero", { _mov: { preset: "volar", ease: "rebote.total", dur: "rápido" } });
    expect(m.preset).toBe("palabras");
    expect(m.ease).toBe("power3.out");
    expect(m.dur).toBe(0.7);
  });
});

describe("ocultoDe", () => {
  it("solo es oculto cuando _oculto es exactamente true", () => {
    expect(ocultoDe({})).toBe(false);
    expect(ocultoDe({ _oculto: true })).toBe(true);
    expect(ocultoDe({ _oculto: "true" })).toBe(false);
  });
});

describe("fijar apariencia, movimiento y ocultar", () => {
  it("fijarEstilo deja intacto el contenido y no modifica el original", () => {
    const original = { titulo: "Hola" };
    const nuevo = fijarEstilo(original, { fondo: "alterno", espacio: "compacto" });
    expect(nuevo).toEqual({ titulo: "Hola", _estilo: { fondo: "alterno", espacio: "compacto" } });
    expect(original).toEqual({ titulo: "Hola" });
  });

  it("fijarMovimiento y fijarOculto se leen de vuelta igual", () => {
    const mov = { preset: "cascada" as const, dur: 1, stagger: 0.1, delay: 0.2, ease: "sine.inOut" };
    const props = fijarOculto(fijarMovimiento({ texto: "x" }, mov), true);
    expect(movimientoDe("texto", props)).toEqual(mov);
    expect(ocultoDe(props)).toBe(true);
    expect(props.texto).toBe("x");
  });
});

describe("planSincronizacion", () => {
  const linea = (id: string, orden = 0) => ({ id, tipo: "texto", ancho: 12 as const, props: { texto: id, n: orden } });

  it("borra los que ya no están y guarda la lista con su posición", () => {
    const plan = planSincronizacion([{ id: "a" }, { id: "b" }, { id: "c" }], [linea("c"), linea("a"), linea("nuevo")]);
    expect(plan.borrar).toEqual(["b"]);
    expect(plan.guardar.map((g) => [g.id, g.orden])).toEqual([
      ["c", 0],
      ["a", 1],
      ["nuevo", 2],
    ]);
  });

  it("sin bloques en el lienzo borra todo y no guarda nada", () => {
    expect(planSincronizacion([{ id: "a" }], [])).toEqual({ borrar: ["a"], guardar: [] });
  });

  it("un lienzo igual a la base no borra nada", () => {
    expect(planSincronizacion([{ id: "a" }], [linea("a")]).borrar).toEqual([]);
  });

  it("cada bloque guardado lleva tipo, ancho y props tal como están", () => {
    const plan = planSincronizacion([], [{ id: "x", tipo: "hero", ancho: 6, props: { titulo: "T" } }]);
    expect(plan.guardar).toEqual([{ id: "x", orden: 0, tipo: "hero", ancho: 6, props: { titulo: "T" } }]);
  });

  it("solo escribe los bloques nuevos o distintos cuando conoce los datos de la base", () => {
    const previo = (id: string, orden: number) => ({ id, orden, tipo: "texto", ancho: 12 as const, props: { texto: id, n: 0 } });
    const plan = planSincronizacion([previo("a", 0), previo("b", 1), previo("c", 2)], [linea("a"), { ...linea("b", 9), props: { texto: "b", n: 9 } }, linea("nuevo")]);
    expect(plan.borrar).toEqual(["c"]);
    expect(plan.guardar.map((g) => g.id)).toEqual(["b", "nuevo"]);
  });

  it("un bloque que solo cambió de lugar se vuelve a escribir con su nueva posición", () => {
    const previo = (id: string, orden: number) => ({ id, orden, tipo: "texto", ancho: 12 as const, props: { texto: id, n: 0 } });
    const plan = planSincronizacion([previo("a", 0), previo("b", 1)], [linea("b"), linea("a")]);
    expect(plan.guardar.map((g) => [g.id, g.orden])).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });
});

describe("destinoSeguro", () => {
  it("acepta rutas internas y https", () => {
    expect(destinoSeguro("/portales/sostenible/clima")).toBe("/portales/sostenible/clima");
    expect(destinoSeguro("  https://www.udes.edu.co/ods?x=1  ")).toBe("https://www.udes.edu.co/ods?x=1");
  });

  it("descarta cualquier otro esquema o forma", () => {
    for (const malo of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "http://udes.edu.co", "//evil.com", "/\\evil.com", "mailto:a@b.co", "ruta/relativa", "/con espacio", "/a\nb", "https://", "", "   ", null, undefined, 5]) {
      expect(destinoSeguro(malo)).toBeNull();
    }
  });
});

describe("parejaCategoria", () => {
  it("separa el valor compuesto «ranking/categoria»", () => {
    expect(parejaCategoria("impact/o4")).toEqual({ ranking: "impact", categoria: "o4" });
  });

  it("rechaza valores sin esa forma", () => {
    for (const malo of ["impact", "impact/", "/o4", "a/b/c", "", null, 3]) expect(parejaCategoria(malo)).toBeNull();
  });
});

describe("planImportacion", () => {
  const nodo = (slug: string, padre: string | null): NodoMicrositio => ({ slug, titulo: slug, padre, bloques: [] });
  const arbol: NodoMicrositio[] = [nodo("impact", null), nodo("o4", "impact"), nodo("informes", "impact"), nodo("world", null)];

  it("crea todo cuando el portal no tiene nada, en el orden del árbol", () => {
    const plan = planImportacion([{ ruta: "" }], arbol);
    expect(plan.omitir).toEqual([]);
    expect(plan.crear.map((c) => c.ruta)).toEqual(["impact", "impact/o4", "impact/informes", "world"]);
  });

  it("indica el padre por ruta: «» para la portada, la del padre para los hijos", () => {
    const plan = planImportacion([], arbol);
    expect(plan.crear.map((c) => [c.ruta, c.padreRuta])).toEqual([
      ["impact", ""],
      ["impact/o4", "impact"],
      ["impact/informes", "impact"],
      ["world", ""],
    ]);
  });

  it("omite lo que ya existe y crea solo lo que falta", () => {
    const plan = planImportacion([{ ruta: "" }, { ruta: "impact" }, { ruta: "impact/o4" }], arbol);
    expect(plan.omitir).toEqual(["impact", "impact/o4"]);
    expect(plan.crear.map((c) => c.ruta)).toEqual(["impact/informes", "world"]);
  });

  it("un hijo que falta se crea aunque su padre ya exista", () => {
    const plan = planImportacion([{ ruta: "impact" }], arbol);
    expect(plan.crear.map((c) => c.ruta)).toEqual(["impact/o4", "impact/informes", "world"]);
    expect(plan.crear[0]!.padreRuta).toBe("impact");
  });

  it("es idempotente: tras crear todo, una segunda pasada no crea nada", () => {
    const primera = planImportacion([], arbol);
    const rutas = [...primera.crear.map((c) => c.ruta), ...primera.omitir].map((ruta) => ({ ruta }));
    const segunda = planImportacion(rutas, arbol);
    expect(segunda.crear).toEqual([]);
    expect(segunda.omitir).toHaveLength(arbol.length);
  });

  it("no duplica rutas dentro del mismo árbol", () => {
    const plan = planImportacion([], [nodo("impact", null), nodo("impact", null)]);
    expect(plan.crear).toHaveLength(1);
    expect(plan.omitir).toEqual(["impact"]);
  });

  it("lanza si un padre no aparece antes que su hijo", () => {
    expect(() => planImportacion([], [nodo("o4", "impact"), nodo("impact", null)])).toThrow(/impact/);
  });
});
